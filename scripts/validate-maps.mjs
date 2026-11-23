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
  'metal_cyber',
  'snow'
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

function validateMap(island, tilesetsConfig, globalChestIds, requireAll7Layer, errors) {
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

  if (requireAll7Layer && !tm) {
    errors.push(`[${id}] Missing 7-layer tileMap (--require-all-7layer enabled)`);
  }

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

    const minCols = HUB_ISLAND_IDS.has(id) ? 44 : 40;
    const minRows = HUB_ISLAND_IDS.has(id) ? 32 : 28;
    if (cols < minCols || rows < minRows) {
      errors.push(`[${id}] Map size ${cols}x${rows} is smaller than required ${minCols}x${minRows} minimum`);
    }
    if (overheadCount < 40 || walkUnderOverheadCount < 6) {
      errors.push(
        `[${id}] Insufficient 2.5D overhead depth: overhead=${overheadCount}, walkBehind=${walkUnderOverheadCount}`
      );
    }

    if ((island.zones ?? []).length < 3) {
      errors.push(`[${id}] Expected >= 3 zones, got ${(island.zones ?? []).length}`);
    }
    if ((island.chests ?? []).length < 3) {
      errors.push(`[${id}] Expected >= 3 hidden chests, got ${(island.chests ?? []).length}`);
    }
    if ((island.npcs ?? []).length < 4) {
      errors.push(`[${id}] Expected >= 4 NPCs, got ${(island.npcs ?? []).length}`);
    }
    const patrolNpcCount = (island.npcs ?? []).filter(
      (n) => Array.isArray(n.patrolWaypoints) && n.patrolWaypoints.length >= 2
    ).length;
    if (patrolNpcCount < 4) {
      errors.push(`[${id}] Expected >= 4 patrolling NPCs, got ${patrolNpcCount}`);
    }

    const markerKinds = new Set((island.markers ?? []).map((m) => m.kind));
    for (const reqKind of ['PORT_EXIT', 'MAIN', 'SIDE', 'ACTIVITY']) {
      if (!markerKinds.has(reqKind)) {
        errors.push(`[${id}] Missing required marker kind '${reqKind}'`);
      }
    }
  }

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

  const portTx = Math.floor(island.portExitZone.pos.x / ts);
  const portTy = Math.floor(island.portExitZone.pos.y / ts);
  if (!canReachAdjacent(reachPass1, portTx, portTy)) {
    errors.push(`[${id}] Port exit (${portTx},${portTy}) unreachable from spawn!`);
  }

  if (island.battleTerminalPos) {
    const btTx = Math.floor(island.battleTerminalPos.x / ts);
    const btTy = Math.floor(island.battleTerminalPos.y / ts);
    if (!canReachAdjacent(reachPass2, btTx, btTy)) {
      errors.push(`[${id}] Battle terminal (${btTx},${btTy}) unreachable from spawn!`);
    }
  }

  for (const sw of island.puzzleSwitches ?? []) {
    const sx = Math.floor(sw.pos.x / ts);
    const sy = Math.floor(sw.pos.y / ts);
    if (!canReachAdjacent(reachPass1, sx, sy)) {
      errors.push(`[${id}] Puzzle switch '${sw.switchId}' (${sx},${sy}) unreachable while barriers active!`);
    }
  }

  for (const z of island.zones ?? []) {
    if (z.tileX < 0 || z.tileY < 0 || z.tileX + z.tileW > cols || z.tileY + z.tileH > rows) {
      errors.push(`[${id}] Zone '${z.zoneId}' out of map bounds`);
    }
  }

  for (const m of island.markers ?? []) {
    if (!canReachAdjacent(reachPass2, m.tileX, m.tileY)) {
      errors.push(`[${id}] Marker '${m.markerId}' (${m.tileX},${m.tileY}) unreachable!`);
    }
  }

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
        for (const t of [0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875]) {
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

  for (const enc of island.encounters ?? []) {
    const ex = Math.floor(enc.pos.x / ts);
    const ey = Math.floor(enc.pos.y / ts);
    if (!canReachAdjacent(reachPass2, ex, ey)) {
      errors.push(`[${id}] Encounter '${enc.encounterId}' (${ex},${ey}) unreachable!`);
    }
  }

  return {
    id,
    hasTileMap: Boolean(tm),
    size: `${cols}x${rows}`,
    chests: (island.chests ?? []).length,
    npcs: (island.npcs ?? []).length,
    zones: (island.zones ?? []).length
  };
}

function resolveLayerRoleSimple(layer) {
  const prop = (layer.properties ?? []).find((p) => p.name.toLowerCase() === 'layerrole');
  const raw = (prop && typeof prop.value === 'string' && prop.value ? prop.value : layer.name)
    .toLowerCase()
    .replace(/[\s-]+/g, '_');
  return raw;
}

function validateTiledTmjMap(tmjPath, errors) {
  if (!fs.existsSync(tmjPath)) return null;
  const tmj = JSON.parse(fs.readFileSync(tmjPath, 'utf8'));
  const cols = tmj.width;
  const rows = tmj.height;
  const tileW = tmj.tilewidth;
  const tileH = tmj.tileheight;
  const scaleProp = (tmj.properties ?? []).find((p) => p.name.toLowerCase() === 'pixelscale');
  const pixelScale = scaleProp && typeof scaleProp.value === 'number' ? scaleProp.value : 2;
  const worldTileW = tileW * pixelScale;
  const worldTileH = tileH * pixelScale;

  for (const ts of tmj.tilesets ?? []) {
    if (!ts.image) {
      errors.push(`[foosha_village.tmj] Tileset '${ts.name}' missing image path`);
      continue;
    }
    const cleanRel = ts.image.replace(/^\.\//, '');
    const absImg = path.join(ROOT, 'public', cleanRel);
    if (!fs.existsSync(absImg)) {
      errors.push(`[foosha_village.tmj] Missing tileset PNG on disk: public/${cleanRel}`);
    }
  }

  const layersByRole = new Map();
  for (const l of tmj.layers ?? []) {
    layersByRole.set(resolveLayerRoleSimple(l), l);
  }
  for (const req of ['water', 'ground', 'walls_props', 'overhead', 'collision', 'lights', 'spawns', 'markers', 'npcs', 'chests', 'zones']) {
    if (!layersByRole.has(req)) {
      errors.push(`[foosha_village.tmj] Missing required layerRole '${req}'`);
    }
  }

  const colObjects = (layersByRole.get('collision')?.objects ?? []).map((o) => ({
    x: o.x * pixelScale,
    y: o.y * pixelScale,
    width: (o.width ?? 0) * pixelScale,
    height: (o.height ?? 0) * pixelScale
  }));

  const isBlocked = (tx, ty) => {
    if (tx < 0 || tx >= cols || ty < 0 || ty >= rows) return true;
    const wx = tx * worldTileW + worldTileW * 0.5;
    const wy = ty * worldTileH + worldTileH * 0.5;
    for (const r of colObjects) {
      if (pointInRect(wx, wy, r)) return true;
    }
    return false;
  };

  const spawnObj = (layersByRole.get('spawns')?.objects ?? [])[0];
  if (!spawnObj) {
    errors.push(`[foosha_village.tmj] Missing player_spawn in spawns objectgroup`);
    return null;
  }

  const spTx = Math.floor((spawnObj.x * pixelScale) / worldTileW);
  const spTy = Math.floor((spawnObj.y * pixelScale) / worldTileH);
  if (isBlocked(spTx, spTy)) {
    errors.push(`[foosha_village.tmj] player_spawn (${spTx},${spTy}) lies inside collision box`);
  }

  const visited = runBfs(cols, rows, spTx, spTy, isBlocked);
  const canReachAdj = (tx, ty) => {
    for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = tx + dx;
      const ny = ty + dy;
      if (nx >= 0 && nx < cols && ny >= 0 && ny < rows && visited[ny * cols + nx] === 1) {
        return true;
      }
    }
    return false;
  };

  for (const groupName of ['markers', 'chests', 'npcs']) {
    const objs = layersByRole.get(groupName)?.objects ?? [];
    for (const obj of objs) {
      const tx = Math.floor((obj.x * pixelScale) / worldTileW);
      const ty = Math.floor((obj.y * pixelScale) / worldTileH);
      if (!canReachAdj(tx, ty)) {
        errors.push(`[foosha_village.tmj] ${groupName} '${obj.name || obj.id}' (${tx},${ty}) unreachable by BFS!`);
      }
    }
  }

  return {
    cols,
    rows,
    lights: (layersByRole.get('lights')?.objects ?? []).length,
    chests: (layersByRole.get('chests')?.objects ?? []).length,
    npcs: (layersByRole.get('npcs')?.objects ?? []).length
  };
}

function main() {
  const requireAll7Layer = !process.argv.includes('--allow-legacy');
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
    summaries.push(validateMap(island, tilesetsConfig, globalChestIds, requireAll7Layer, errors));
  }

  const tmjSummary = validateTiledTmjMap(
    path.join(ROOT, 'public', 'assets', 'pro', 'maps', 'foosha_village.tmj'),
    errors
  );

  if (errors.length > 0) {
    console.error(`\n❌ Map Integrity & BFS Validation FAILED (${errors.length} error(s)):\n`);
    for (const err of errors) console.error(`  - ${err}`);
    process.exit(1);
  }

  const layeredCount = summaries.filter((s) => s.hasTileMap).length;
  const totalNpcs = summaries.reduce((acc, s) => acc + s.npcs, 0);
  const totalZones = summaries.reduce((acc, s) => acc + s.zones, 0);
  const hubSummaries = summaries
    .filter((s) => HUB_ISLAND_IDS.has(s.id))
    .map((s) => `${s.id}(${s.size}, zones=${s.zones}, chests=${s.chests}, npcs=${s.npcs})`)
    .join(' | ');
  console.log(`✅ Map Integrity & BFS Reachability Validation PASSED (0 errors)!`);
  console.log(
    `   • Islands verified: ${summaries.length} (7-Layer: ${layeredCount}/${summaries.length}) | Unique chests: ${globalChestIds.size} | Zones: ${totalZones} | NPCs: ${totalNpcs}`
  );
  console.log(`   • Core Hubs: ${hubSummaries}`);
  if (tmjSummary) {
    console.log(
      `   • Pro Tiled (.tmj): foosha_village.tmj (${tmjSummary.cols}x${tmjSummary.rows}, lights=${tmjSummary.lights}, chests=${tmjSummary.chests}, npcs=${tmjSummary.npcs}) BFS 100% PASSED`
    );
  }
}

main();
