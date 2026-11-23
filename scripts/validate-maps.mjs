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

function getTmjPropValue(props, name) {
  const target = name.toLowerCase();
  const hit = (props ?? []).find((p) => p.name.toLowerCase() === target);
  return hit ? hit.value : undefined;
}

function parseTsxSolidTilesXml(xmlText) {
  const solidIds = new Set();
  const waterIds = new Set();
  const tileRx = /<tile\b[^>]*\bid\s*=\s*"(\d+)"[^>]*>([\s\S]*?)<\/tile>/gi;
  let m;
  while ((m = tileRx.exec(xmlText)) !== null) {
    const id = Number(m[1]);
    const body = m[2] ?? '';
    const propRx = /<property\b([^>]*)\/?>/gi;
    let pm;
    while ((pm = propRx.exec(body)) !== null) {
      const attrs = pm[1] ?? '';
      const pname = attrs.match(/\bname\s*=\s*"([^"]*)"/i)?.[1]?.toLowerCase();
      const pval = attrs.match(/\bvalue\s*=\s*"([^"]*)"/i)?.[1]?.toLowerCase();
      if (pname === 'solid' && pval === 'true') solidIds.add(id);
      if (pname === 'iswater' && pval === 'true') waterIds.add(id);
    }
  }
  return { solidIds, waterIds };
}

function validateTiledTmjMap(tmjPath, islandJsonById, errors) {
  if (!fs.existsSync(tmjPath)) return null;
  const tmjName = path.basename(tmjPath);
  const tmj = JSON.parse(fs.readFileSync(tmjPath, 'utf8'));
  const cols = tmj.width;
  const rows = tmj.height;
  const tileW = tmj.tilewidth;
  const tileH = tmj.tileheight;
  const scaleProp = (tmj.properties ?? []).find((p) => p.name.toLowerCase() === 'pixelscale');
  const pixelScale = scaleProp && typeof scaleProp.value === 'number' ? scaleProp.value : 2;
  const worldTileW = tileW * pixelScale;
  const worldTileH = tileH * pixelScale;

  const tmjDir = path.dirname(tmjPath);
  const solidGids = new Set();
  const waterGids = new Set();

  for (const ts of tmj.tilesets ?? []) {
    if (typeof ts.image === 'string' && ts.image) {
      errors.push(`[${tmjName}] Embedded tileset image forbidden in .tmj ('${ts.image}'); use external .tsx only`);
    }
    if (!ts.source) {
      errors.push(`[${tmjName}] Tileset firstgid=${ts.firstgid} missing external .tsx source`);
      continue;
    }
    const absTsx = path.resolve(tmjDir, ts.source);
    if (!fs.existsSync(absTsx)) {
      errors.push(`[${tmjName}] Missing external tileset source '${ts.source}': ${absTsx}`);
      continue;
    }
    if (absTsx.toLowerCase().endsWith('.tsx')) {
      const xml = fs.readFileSync(absTsx, 'utf8');
      const m = xml.match(/<image\b[^>]*\bsource\s*=\s*"([^"]+)"/i);
      if (!m) {
        errors.push(`[${tmjName}] External .tsx '${ts.source}' missing <image source="...">`);
      } else {
        const absTsxImg = path.resolve(path.dirname(absTsx), m[1]);
        if (!fs.existsSync(absTsxImg)) {
          errors.push(`[${tmjName}] Missing .tsx tileset image on disk: ${absTsxImg}`);
        }
      }
      const parsedMeta = parseTsxSolidTilesXml(xml);
      for (const id of parsedMeta.solidIds) solidGids.add(ts.firstgid + id);
      for (const id of parsedMeta.waterIds) waterGids.add(ts.firstgid + id);
    }
  }

  const layersByRole = new Map();
  const collectLayers = (layers) => {
    for (const l of layers ?? []) {
      if (l.type === 'group' && Array.isArray(l.layers)) {
        collectLayers(l.layers);
        continue;
      }
      layersByRole.set(resolveLayerRoleSimple(l), l);
      if (l.type === 'objectgroup' && Array.isArray(l.objects)) {
        for (const obj of l.objects) {
          if (typeof obj.template === 'string' && obj.template) {
            const absTpl = path.resolve(tmjDir, obj.template);
            if (!fs.existsSync(absTpl)) {
              errors.push(`[${tmjName}] Missing .tx template '${obj.template}' on object '${obj.name || obj.id}'`);
            }
          }
        }
      }
    }
  };
  collectLayers(tmj.layers);

  for (const req of ['water', 'ground', 'walls_props', 'overhead', 'collision', 'lights', 'spawns', 'markers', 'npcs', 'chests', 'zones']) {
    if (!layersByRole.has(req)) {
      errors.push(`[${tmjName}] Missing required layerRole '${req}'`);
    }
  }

  const staticColObjects = [];
  const barrierColObjects = [];
  for (const o of layersByRole.get('collision')?.objects ?? []) {
    const rect = {
      x: o.x * pixelScale,
      y: o.y * pixelScale,
      width: (o.width ?? 0) * pixelScale,
      height: (o.height ?? 0) * pixelScale
    };
    const isBarrier =
      Boolean(getTmjPropValue(o.properties, 'isLaserBarrier')) &&
      getTmjPropValue(o.properties, 'activeByDefault') !== false;
    if (isBarrier) {
      barrierColObjects.push(rect);
    } else {
      staticColObjects.push(rect);
    }
  }

  const waterData = layersByRole.get('water')?.data ?? [];
  const groundData = layersByRole.get('ground')?.data ?? [];
  const wallsData = layersByRole.get('walls_props')?.data ?? [];
  const GID_MASK = 0x1fffffff;

  const isBlockedPass = (tx, ty, includeBarriers) => {
    if (tx < 0 || tx >= cols || ty < 0 || ty >= rows) return true;
    const wx = tx * worldTileW + worldTileW * 0.5;
    const wy = ty * worldTileH + worldTileH * 0.5;
    for (const r of staticColObjects) {
      if (pointInRect(wx, wy, r)) return true;
    }
    if (includeBarriers) {
      for (const r of barrierColObjects) {
        if (pointInRect(wx, wy, r)) return true;
      }
    }
    const idx = ty * cols + tx;
    const wallGid = (wallsData[idx] ?? 0) & GID_MASK;
    if (wallGid > 0 && solidGids.has(wallGid)) return true;
    const waterGid = (waterData[idx] ?? 0) & GID_MASK;
    const groundGid = (groundData[idx] ?? 0) & GID_MASK;
    if (groundGid === 0 && waterGid > 0 && (solidGids.has(waterGid) || waterGids.has(waterGid))) {
      // Deep solid water (waterGid with solid) without bridge/dock floor blocks movement
      if (solidGids.has(waterGid)) return true;
    }
    return false;
  };

  const spawnObj =
    (layersByRole.get('spawns')?.objects ?? []).find((o) => o.name === 'player_spawn') ??
    (layersByRole.get('spawns')?.objects ?? [])[0];
  if (!spawnObj) {
    errors.push(`[${tmjName}] Missing player_spawn in spawns objectgroup`);
    return null;
  }

  const spTx = Math.floor((spawnObj.x * pixelScale) / worldTileW);
  const spTy = Math.floor((spawnObj.y * pixelScale) / worldTileH);
  if (isBlockedPass(spTx, spTy, true)) {
    errors.push(`[${tmjName}] player_spawn (${spTx},${spTy}) lies inside collision box`);
  }

  const visitPass1 = runBfs(cols, rows, spTx, spTy, (tx, ty) => isBlockedPass(tx, ty, true));
  const visitPass2 = runBfs(cols, rows, spTx, spTy, (tx, ty) => isBlockedPass(tx, ty, false));
  const canReachAdj = (visited, tx, ty) => {
    for (const [dx, dy] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = tx + dx;
      const ny = ty + dy;
      if (nx >= 0 && nx < cols && ny >= 0 && ny < rows && visited[ny * cols + nx] === 1) {
        return true;
      }
    }
    return false;
  };

  for (const obj of layersByRole.get('spawns')?.objects ?? []) {
    if (obj.name === 'dock_departure' || (obj.type ?? '').toUpperCase() === 'PORT_EXIT') {
      const tx = Math.floor((obj.x * pixelScale) / worldTileW);
      const ty = Math.floor((obj.y * pixelScale) / worldTileH);
      if (!canReachAdj(visitPass1, tx, ty)) {
        errors.push(`[${tmjName}] dock_departure (${tx},${ty}) unreachable by BFS!`);
      }
    }
  }

  for (const groupName of ['markers', 'chests', 'npcs']) {
    const objs = layersByRole.get(groupName)?.objects ?? [];
    for (const obj of objs) {
      const tx = Math.floor((obj.x * pixelScale) / worldTileW);
      const ty = Math.floor((obj.y * pixelScale) / worldTileH);
      const isSwitch = (obj.type ?? '').toUpperCase() === 'PUZZLE_SWITCH';
      const reachGrid = isSwitch ? visitPass1 : visitPass2;
      if (!canReachAdj(reachGrid, tx, ty)) {
        errors.push(`[${tmjName}] ${groupName} '${obj.name || obj.id}' (${tx},${ty}) unreachable by BFS!`);
      }
    }
  }

  // Parity check against canonical island JSON chests (LegalityValidator safety)
  const islandIdProp = getTmjPropValue(tmj.properties, 'islandId');
  const canonicalIsland = typeof islandIdProp === 'string' ? islandJsonById.get(islandIdProp) : null;
  if (canonicalIsland) {
    const jsonChests = canonicalIsland.chests ?? [];
    const tmjChests = layersByRole.get('chests')?.objects ?? [];
    if (tmjChests.length !== jsonChests.length) {
      errors.push(`[${tmjName}] Chest count mismatch vs ${islandIdProp}.json: tmj=${tmjChests.length}, json=${jsonChests.length}`);
    } else {
      const byId = new Map(jsonChests.map((c) => [c.chestId, c]));
      for (const ch of tmjChests) {
        const cid = String(getTmjPropValue(ch.properties, 'chestId') ?? ch.name ?? '');
        const match = byId.get(cid);
        if (!match) {
          errors.push(`[${tmjName}] Unknown chestId '${cid}' not found in ${islandIdProp}.json`);
        }
      }
    }
  }

  return {
    tmjName,
    islandId: typeof islandIdProp === 'string' ? islandIdProp : tmjName,
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
  const islandJsonById = new Map();

  for (const file of files) {
    const island = JSON.parse(fs.readFileSync(path.join(ISLANDS_DIR, file), 'utf8'));
    islandJsonById.set(island.islandId, island);
    summaries.push(validateMap(island, tilesetsConfig, globalChestIds, requireAll7Layer, errors));
  }

  const proMapsDir = path.join(ROOT, 'public', 'assets', 'pro', 'maps');
  const tmjFiles = fs.existsSync(proMapsDir)
    ? fs.readdirSync(proMapsDir).filter((f) => f.toLowerCase().endsWith('.tmj')).sort()
    : [];
  const tmjSummaries = [];
  for (const tmjFile of tmjFiles) {
    const res = validateTiledTmjMap(path.join(proMapsDir, tmjFile), islandJsonById, errors);
    if (res) tmjSummaries.push(res);
  }

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
  if (tmjSummaries.length > 0) {
    const tmjLine = tmjSummaries
      .map((t) => `${t.tmjName}(${t.cols}x${t.rows}, L=${t.lights}, C=${t.chests}, N=${t.npcs})`)
      .join(' | ');
    console.log(`   • Pro Tiled (.tmj x${tmjSummaries.length}): ${tmjLine} — 100% external .tsx & BFS PASSED`);
  }
}

main();
