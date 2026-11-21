import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

function readJson<T>(relPath: string): T {
  const abs = path.join(ROOT, relPath);
  return JSON.parse(fs.readFileSync(abs, 'utf-8')) as T;
}

interface UnitEntry {
  id: string;
  name: string;
  traitId: string;
  defaultFormId?: string;
  awakenedFormId?: string;
  forms?: string[];
  defaultMoves: string[];
}

interface FormEntry {
  id: string;
  overrideMoveIds?: string[];
}

interface MoveEntry {
  id: string;
}

interface AbilityEntry {
  id: string;
}

interface EpisodeFileEntry {
  episodeId: string;
  islandId: string;
  seaZoneId: string;
}

interface IslandFileEntry {
  islandId: string;
  episodeId: string;
  npcs: {
    npcId: string;
    name: string;
    dialogueLines: string[];
  }[];
  encounters: {
    encounterId: string;
    enemyUnitIds: string[];
    setsFlagOnVictory: string;
  }[];
}

function main(): void {
  const errors: string[] = [];

  const units = readJson<UnitEntry[]>('src/data/units.json');
  const forms = readJson<FormEntry[]>('src/data/forms.json');
  const moves = readJson<MoveEntry[]>('src/data/moves.json');
  const abilities = readJson<AbilityEntry[]>('src/data/abilities.json');
  const traits = fs.existsSync(path.join(ROOT, 'src/data/traits.json'))
    ? readJson<AbilityEntry[]>('src/data/traits.json')
    : [];

  const episodesDir = path.join(ROOT, 'src/data/episodes');
  const episodeFiles = fs.readdirSync(episodesDir).filter((f) => f.endsWith('.json'));
  const episodes: EpisodeFileEntry[] = episodeFiles.map((f) =>
    readJson<EpisodeFileEntry>(`src/data/episodes/${f}`)
  );

  const unitIds = new Set(units.map((u) => u.id));
  const formIds = new Set(forms.map((f) => f.id));
  const moveIds = new Set(moves.map((m) => m.id));
  const abilityIds = new Set([
    ...abilities.map((a) => a.id),
    ...traits.map((t) => t.id)
  ]);
  const episodeIds = new Set(episodes.map((e) => e.episodeId));

  // 1. Validate Unit -> Ability / Move / Form cross-references
  for (const u of units) {
    if (!abilityIds.has(u.traitId)) {
      errors.push(`[units.json] Unit "${u.id}" references missing traitId "${u.traitId}"`);
    }
    for (const mid of u.defaultMoves) {
      if (!moveIds.has(mid)) {
        errors.push(`[units.json] Unit "${u.id}" references missing moveId "${mid}"`);
      }
    }
    if (u.defaultFormId && !formIds.has(u.defaultFormId)) {
      errors.push(`[units.json] Unit "${u.id}" references missing defaultFormId "${u.defaultFormId}"`);
    }
    if (u.awakenedFormId && !formIds.has(u.awakenedFormId)) {
      errors.push(`[units.json] Unit "${u.id}" references missing awakenedFormId "${u.awakenedFormId}"`);
    }
    for (const fid of u.forms ?? []) {
      if (!formIds.has(fid)) {
        errors.push(`[units.json] Unit "${u.id}" references missing formId "${fid}"`);
      }
    }
  }

  // 2. Validate Form -> overrideMoveIds
  for (const f of forms) {
    for (const mid of f.overrideMoveIds ?? []) {
      if (!moveIds.has(mid)) {
        errors.push(`[forms.json] Form "${f.id}" references missing overrideMoveId "${mid}"`);
      }
    }
  }

  // 3. Validate Island Scripts, Dialogues & Encounters
  const islandsDir = path.join(ROOT, 'src/data/islands');
  const islandFiles = fs.readdirSync(islandsDir).filter((f) => f.endsWith('.json'));
  let totalNpcs = 0;
  let totalDialogueLines = 0;
  let totalEncounters = 0;

  for (const fileName of islandFiles) {
    if (fileName !== fileName.toLowerCase()) {
      errors.push(`[src/data/islands] Non-lowercase filename detected: "${fileName}"`);
    }
    const island = readJson<IslandFileEntry>(`src/data/islands/${fileName}`);
    if (!episodeIds.has(island.episodeId)) {
      errors.push(
        `[islands/${fileName}] Island "${island.islandId}" references missing episodeId "${island.episodeId}"`
      );
    }
    for (const npc of island.npcs) {
      totalNpcs += 1;
      if (!Array.isArray(npc.dialogueLines) || npc.dialogueLines.length === 0) {
        errors.push(
          `[islands/${fileName}] NPC "${npc.npcId}" has empty dialogueLines`
        );
      } else {
        totalDialogueLines += npc.dialogueLines.length;
      }
    }
    for (const enc of island.encounters) {
      totalEncounters += 1;
      if (!enc.enemyUnitIds || enc.enemyUnitIds.length === 0) {
        errors.push(
          `[islands/${fileName}] Encounter "${enc.encounterId}" has no enemyUnitIds`
        );
      }
      for (const eid of enc.enemyUnitIds) {
        if (!unitIds.has(eid)) {
          errors.push(
            `[islands/${fileName}] Encounter "${enc.encounterId}" references missing unitId "${eid}"`
          );
        }
      }
    }
  }

  if (errors.length > 0) {
    console.error(`\n❌ Script & Dialogue cross-reference validation FAILED (${errors.length} error(s)):\n`);
    for (const err of errors) {
      console.error(`  - ${err}`);
    }
    process.exit(1);
  }

  console.log('✅ Script, Dialogue & Data Schema validation PASSED (0 errors)!');
  console.log(
    `   • Units: ${units.length} | Forms: ${forms.length} | Moves: ${moves.length} | Abilities: ${abilities.length}`
  );
  console.log(
    `   • Episodes: ${episodes.length} | Islands: ${islandFiles.length} | NPCs: ${totalNpcs} (${totalDialogueLines} dialogue lines) | Encounters: ${totalEncounters}`
  );
}

main();
