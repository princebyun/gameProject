import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertSelfReachable } from './maps/mapCanvasBuilder.mjs';
import { EAST_BLUE_BUILDERS } from './maps/eastBlueBlueprints.mjs';
import { GRAND_LINE_BUILDERS } from './maps/grandLineBlueprints.mjs';
import { NEW_WORLD_BUILDERS } from './maps/newWorldBlueprints.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const ISLANDS_DIR = path.join(ROOT, 'src', 'data', 'islands');
const EPISODES_DIR = path.join(ROOT, 'src', 'data', 'episodes');

const PROTECTED_HUBS = new Set([
  'foosha_shells',
  'water_seven',
  'wano_onigashima',
  'egghead'
]);

const BUILDERS_BY_STEP = {
  1: EAST_BLUE_BUILDERS,
  2: GRAND_LINE_BUILDERS,
  3: NEW_WORLD_BUILDERS
};

function parseStepArg() {
  const arg = process.argv.find((a) => a.startsWith('--step='));
  const val = arg ? arg.split('=')[1] : 'all';
  if (val === '1' || val === '2' || val === '3') return [Number(val)];
  return [1, 2, 3];
}

function syncEpisodeStepCoords(builtIsland) {
  const epPath = path.join(EPISODES_DIR, `${builtIsland.episodeId}.json`);
  if (!fs.existsSync(epPath)) return;
  const ep = JSON.parse(fs.readFileSync(epPath, 'utf-8'));

  const flagPosMap = new Map();
  for (const npc of builtIsland.npcs) {
    if (npc.setsQuestFlagOnTalk) {
      flagPosMap.set(npc.setsQuestFlagOnTalk, { x: npc.pos.x, y: npc.pos.y });
    }
  }
  for (const enc of builtIsland.encounters) {
    if (enc.setsFlagOnVictory) {
      flagPosMap.set(enc.setsFlagOnVictory, { x: enc.pos.x, y: enc.pos.y });
    }
  }

  for (const step of ep.steps ?? []) {
    const pos = flagPosMap.get(step.requiredFlag);
    if (pos) {
      step.targetPos = { x: pos.x, y: pos.y };
    }
  }
  fs.writeFileSync(epPath, JSON.stringify(ep, null, 2) + '\n', 'utf-8');
}

function main() {
  const steps = parseStepArg();
  let builtCount = 0;

  for (const step of steps) {
    const builders = BUILDERS_BY_STEP[step] ?? {};
    for (const [islandId, buildFn] of Object.entries(builders)) {
      if (PROTECTED_HUBS.has(islandId)) {
        throw new Error(`Refusing to modify protected hub island: ${islandId}`);
      }
      const islandPath = path.join(ISLANDS_DIR, `${islandId}.json`);
      const orig = JSON.parse(fs.readFileSync(islandPath, 'utf-8'));
      const built = buildFn(orig);
      assertSelfReachable(built);
      fs.writeFileSync(islandPath, JSON.stringify(built, null, 2) + '\n', 'utf-8');
      syncEpisodeStepCoords(built);
      builtCount += 1;
      console.log(
        `  ✓ [${islandId}] ${built.tileMap.cols}x${built.tileMap.rows}, zones=${built.zones.length}, chests=${built.chests.length}, npcs=${built.npcs.length}`
      );
    }
  }

  console.log(`✅ Deterministic 7-Layer Map Builder completed (${builtCount} island(s) updated).`);
}

main();
