import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const ISLANDS_DIR = path.join(ROOT, 'src', 'data', 'islands');
const TILESETS_PATH = path.join(ROOT, 'src', 'data', 'assets', 'tilesets.json');

const HUB_ISLAND_IDS = new Set([
  'foosha_shells',
  'water_seven',
  'wano_onigashima',
  'egghead'
]);

const VALID_SURFACES = new Set([
  'grass',
  'stone',
  'wood_dock',
  'sand',
  'water_shallow',
  'metal_cyber'
]);

function pointInRect(px, py, r) {
  return px >= r.x && px <= r.x + r.width && py >= r.y && py <= r.y + r.height;
}

function buildBlockedFn(island, includeActiveBarriers) {
  const tm = island.tileMap;
  const ts = tm?.tileSize ?? 32;
  const cols = tm?.cols ?? Math.ceil(island.width / ts);
  const rows = tm?.rows ?? Math.ceil(island.height / ts);

  return (tx, ty) => {
    if (tx < 0 || tx >= cols || ty < 0 || ty >= rows) return true;
    if (tm && tm.solidRows[ty]?.[tx] !== '.') return true;
    const wx = tx * ts + ts * 0.5;
    const wy = ty * ts + ts * 0.5;
    for (const obs of island.obstacles ?? []) {
      if (pointInRect(wx, wy, obs)) return true;
    }
    if (includeActiveBarriers) {
      for (const bar of island.laserBarriers ?? []) {
        if (bar.activeByDefault && pointInRect(wx, wy, bar)) return true;
      }
    }
    return false;
  };
}

function runBfs(cols, rows, startTx, startTy, isBlocked) {
  const visited = new Uint8Array(cols * rows);
  if (isBlocked(startTx, startTy)) return visited;
  const queue = [[startTx, startTy]];
  let head = 0;
  visited[startTy * cols + startTx] = 1;
  while (head < queue.length) {
    const [cx, cy] = queue[head++];
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1]
    ]) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || nx >= cols || ny < 0 || ny >= rows) continue;
      const idx = ny * cols + nx;
      if (visited[idx] || isBlocked(nx, ny)) continue;
      visited[idx] = 1;
      queue.push([nx, ny]);
    }
  }
  return visited;
}

function validateMap(island, tilesetsConfig, globalChestIds, errors) {
  const id = island.islandId;
  const tm = island.tileMap;
  const ts = tm?.tileSize ?? 32;
  const cols = tm?.cols ?? Math.ceil(island.width / ts);
  const rows = tm?.rows ?? Math.ceil(island.height / ts);

  const biomeId = tilesetsConfig.islandBiomeMap?.[id] ?? 'port_town';
  const biome = (tilesetsConfig.biomes ?? []).find((b) => b.biomeId === biomeId);
  if (!biome) {
    errors.push(`[${id}] Missing biome '${biomeId}' in tilesets.json`);
  }
  const maxAtlasTiles = 16 * (biome?.rows ?? 16);

  if (tm) {
    if (island.width !== cols * ts || island.height !== rows * ts) {
      errors.push(
        `[${id}] Dimension mismatch: width/height (${island.width}x${island.height}) != cols*tileSize (${cols * ts}x${rows * ts})`
      );
    }

    for (const layerName of [
      'groundRows',
      'detailRows',
      'solidRows',
      'overheadRows',
      'surfaceRows'
    ]) {
      const arr = tm[layerName];
      if (!Array.isArray(arr) || arr.length !== rows) {
        errors.push(`[${id}] ${layerName} must have ${rows} rows (got ${arr?.length})`);
        continue;
      }
      for (let r = 0; r < rows; r++) {
        if (arr[r].length !== cols) {
          errors.push(`[${id}] ${layerName}[${r}] length ${arr[r].length} !== ${cols}`);
          break;
        }
      }
    }

    // Tile legend ID & surface material checks
    for (const layerName of ['groundRows', 'detailRows', 'overheadRows']) {
      const arr = tm[layerName] ?? [];
      for (let r = 0; r < arr.length; r++) {
        const line = arr[r];
        for (let c = 0; c < line.length; c++) {
          const ch = line[c];
          if (!(ch in (tm.tileLegend ?? {}))) {
            errors.push(`[${id}] Undefined tile symbol '${ch}' in ${layerName} at (${c},${r})`);
          } else {
            const tileId = tm.tileLegend[ch];
            if (tileId !== -1 && (!Number.isInteger(tileId) || tileId < 0 || tileId >= maxAtlasTiles)) {
              errors.push(
                `[${id}] Tile ID ${tileId} ('${ch}') out of biome atlas bounds [0..${maxAtlasTiles - 1}] at (${c},${r})`
              );
            }
          }
        }
      }
    }

    for (let r = 0; r < (tm.surfaceRows ?? []).length; r++) {
      const line = tm.surfaceRows[r];
      for (let c = 0; c < line.length; c++) {
        const ch = line[c];
        const mat = tm.surfaceLegend?.[ch];
        if (!mat || !VALID_SURFACES.has(mat)) {
          errors.push(`[${id}] Invalid surface symbol '${ch}' -> '${mat}' at (${c},${r})`);
        }
      }
    }

    // 2.5D Overhead pass-behind check for hubs
    let overheadCount = 0;
    let walkUnderOverheadCount = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const oCh = tm.overheadRows[r]?.[c] ?? '.';
        if (oCh !== '.') {
          overheadCount += 1;
          if (tm.solidRows[r]?.[c] === '.') {
            walkUnderOverheadCount += 1;
          }
        }
      }
    }
    if (HUB_ISLAND_IDS.has(id)) {
      if (cols < 44 || rows < 32) {
        errors.push(`[${id}] Hub size ${cols}x${rows} is smaller than required 44x32 minimum`);
      }
      if (overheadCount < 40 || walkUnderOverheadCount < 4) {
        errors.push(
          `[${id}] Insufficient 2.5D overhead depth: overhead=${overheadCount}, walkBehind=${walkUnderOverheadCount}`
        );
      }
    }
  }

  // Spawn check
  const spTx = Math.floor(island.spawnPoint.x / ts);
  const spTy = Math.floor(island.spawnPoint.y / ts);
  const blockedPass1 = buildBlockedFn(island, true);
  const blockedPass2 = buildBlockedFn(island, false);

  if (blockedPass1(spTx, spTy)) {
    errors.push(`[${id}] Spawn (${island.spawnPoint.x},${island.spawnPoint.y} -> tile ${spTx},${spTy}) is solid`);
  }

  const reachPass1 = runBfs(cols, rows, spTx, spTy, blockedPass1);
  const reachPass2 = runBfs(cols, rows, spTx, spTy, blockedPass2);

  const canReachTile = (visited, tx, ty) =>
    tx >= 0 && tx < cols && ty >= 0 && ty < rows && visited[ty * cols + tx] === 1;
  const canReachAdjacent = (visited, tx, ty) =>
    canReachTile(visited, tx, ty) ||
    canReachTile(visited, tx + 1, ty) ||
    canReachTile(visited, tx - 1, ty) ||
    canReachTile(visited, tx, ty + 1) ||
    canReachTile(visited, tx, ty - 1);

  // Port exit reachability (Pass 1 & Pass 2)
  const portTx = Math.floor(island.portExitZone.pos.x / ts);
  const portTy = Math.floor(island.portExitZone.pos.y / ts);
  if (!canReachAdjacent(reachPass1, portTx, portTy)) {
    errors.push(`[${id}] Port exit (${portTx},${portTy}) unreachable from spawn!`);
  }

  // Puzzle switches reachability BEFORE barriers deactivate (Pass 1)
  for (const sw of island.puzzleSwitches ?? []) {
    const sx = Math.floor(sw.pos.x / ts);
    const sy = Math.floor(sw.pos.y / ts);
    if (!canReachAdjacent(reachPass1, sx, sy)) {
      errors.push(`[${id}] Puzzle switch '${sw.switchId}' (${sx},${sy}) unreachable while barriers active!`);
    }
  }

  // Zones validation
  for (const z of island.zones ?? []) {
    if (z.tileX < 0 || z.tileY < 0 || z.tileX + z.tileW > cols || z.tileY + z.tileH > rows) {
      errors.push(`[${id}] Zone '${z.zoneId}' out of map bounds`);
    }
  }

  // Markers reachability (Pass 2 after switches/barriers)
  for (const m of island.markers ?? []) {
    if (!canReachAdjacent(reachPass2, m.tileX, m.tileY)) {
      errors.push(`[${id}] Marker '${m.markerId}' (${m.tileX},${m.tileY}) unreachable!`);
    }
  }

  // Chests legality & adjacent BFS reachability
  const chestTileKeys = new Set();
  for (const ch of island.chests ?? []) {
    if (globalChestIds.has(ch.chestId)) {
      errors.push(`[${id}] Duplicate chestId '${ch.chestId}'`);
    }
    globalChestIds.add(ch.chestId);
    chestTileKeys.add(`${ch.tileX},${ch.tileY}`);

    if (
      ch.reward.berries < 0 ||
      ch.reward.berries > 1_000_000 ||
      ch.reward.trainingPoints < 0 ||
      ch.reward.trainingPoints > 10_000
    ) {
      errors.push(`[${id}] Chest '${ch.chestId}' reward exceeds legal caps`);
    }
    if (!canReachAdjacent(reachPass2, ch.tileX, ch.tileY)) {
      errors.push(`[${id}] Chest '${ch.chestId}' (${ch.tileX},${ch.tileY}) unreachable!`);
    }
  }

  // NPCs reachability & patrol waypoint walkability
  for (const npc of island.npcs ?? []) {
    const nx = Math.floor(npc.pos.x / ts);
    const ny = Math.floor(npc.pos.y / ts);
    if (!canReachAdjacent(reachPass2, nx, ny)) {
      errors.push(`[${id}] NPC '${npc.npcId}' (${nx},${ny}) unreachable!`);
    }
    if (Array.isArray(npc.patrolWaypoints) && npc.patrolWaypoints.length > 0) {
      for (let i = 0; i < npc.patrolWaypoints.length; i++) {
        const a = npc.patrolWaypoints[i];
        const b = npc.patrolWaypoints[(i + 1) % npc.patrolWaypoints.length];
        const ax = Math.floor(a.x / ts);
        const ay = Math.floor(a.y / ts);
        if (blockedPass2(ax, ay)) {
          errors.push(`[${id}] NPC '${npc.npcId}' patrol waypoint ${i} (${ax},${ay}) is solid`);
        }
        if (chestTileKeys.has(`${ax},${ay}`) || (ax === portTx && ay === portTy)) {
          errors.push(`[${id}] NPC '${npc.npcId}' waypoint ${i} (${ax},${ay}) overlaps chest or portExit`);
        }
        for (const t of [0.25, 0.5, 0.75]) {
          const sx = Math.floor((a.x + (b.x - a.x) * t) / ts);
          const sy = Math.floor((a.y + (b.y - a.y) * t) / ts);
          if (blockedPass2(sx, sy)) {
            errors.push(`[${id}] NPC '${npc.npcId}' patrol segment ${i} crosses solid tile (${sx},${sy})`);
            break;
          }
        }
      }
    }
  }

  // Encounters reachability
  for (const enc of island.encounters ?? []) {
    const ex = Math.floor(enc.pos.x / ts);
    const ey = Math.floor(enc.pos.y / ts);
    if (!canReachAdjacent(reachPass2, ex, ey)) {
      errors.push(`[${id}] Encounter '${enc.encounterId}' (${ex},${ey}) unreachable!`);
    }
  }

  return {
    id,
    size: `${cols}x${rows}`,
    chests: (island.chests ?? []).length,
    npcs: (island.npcs ?? []).length,
    zones: (island.zones ?? []).length
  };
}

function main() {
  const tilesetsConfig = JSON.parse(fs.readFileSync(TILESETS_PATH, 'utf8'));
  const files = fs
    .readdirSync(ISLANDS_DIR)
    .filter((f) => f.endsWith('.json'))
    .sort();

  const errors = [];
  const globalChestIds = new Set();
  const summaries = [];

  for (const file of files) {
    const island = JSON.parse(fs.readFileSync(path.join(ISLANDS_DIR, file), 'utf8'));
    summaries.push(validateMap(island, tilesetsConfig, globalChestIds, errors));
  }

  if (errors.length > 0) {
    console.error(`\n❌ Map Integrity & BFS Validation FAILED (${errors.length} error(s)):\n`);
    for (const err of errors) console.error(`  - ${err}`);
    process.exit(1);
  }

  const hubSummaries = summaries
    .filter((s) => HUB_ISLAND_IDS.has(s.id))
    .map((s) => `${s.id}(${s.size}, zones=${s.zones}, chests=${s.chests}, npcs=${s.npcs})`)
    .join(' | ');
  console.log(`✅ Map Integrity & BFS Reachability Validation PASSED (0 errors)!`);
  console.log(`   • Islands verified: ${summaries.length} | Unique chests: ${globalChestIds.size}`);
  console.log(`   • Core Hubs: ${hubSummaries}`);
}

main();
