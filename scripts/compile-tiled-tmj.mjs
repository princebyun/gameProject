import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const WALL_CHARS = new Set(['b', 'B', 'w', 'D']);

const SECONDARY_ACCENT_TEMPLATES = Object.freeze({
  master_port_village: (firstGid) => {
    const pTile = (col, row) => firstGid + row * 28 + col;
    return [pTile(4, 5), pTile(6, 4), pTile(16, 15), pTile(17, 15), pTile(12, 5)];
  },
  master_scifi_neon: (firstGid) => [
    firstGid + 48,
    firstGid + 60,
    firstGid + 63,
    firstGid + 194,
    firstGid + 48
  ],
  master_desert_palace: (firstGid) => [
    firstGid + 44,
    firstGid + 45,
    firstGid + 47,
    firstGid + 69,
    firstGid + 44
  ],
  master_eastern_pagoda: (firstGid) => [
    firstGid + 44,
    firstGid + 45,
    firstGid + 47,
    firstGid + 69,
    firstGid + 44
  ],
  master_stone_canal: (firstGid) => [
    firstGid + 44,
    firstGid + 45,
    firstGid + 47,
    firstGid + 69,
    firstGid + 44
  ]
});

/**
 * Parse `<tileset ... tilecount="N">` from an external `.tsx` file so `firstgid`
 * for any secondary tileset is deterministically computed without hardcoding.
 */
export function readTsxTileCount(rootDir, tilesetId) {
  const tsxPath = path.join(rootDir, 'public/assets/pro/tilesets', `${tilesetId}.tsx`);
  if (!fs.existsSync(tsxPath)) {
    throw new Error(`Missing external .tsx tileset file: ${tsxPath}`);
  }
  const xml = fs.readFileSync(tsxPath, 'utf-8');
  const m = xml.match(/<tileset\b[^>]*\btilecount\s*=\s*"(\d+)"/i);
  if (!m || !m[1]) {
    throw new Error(`External .tsx '${tilesetId}.tsx' missing tilecount attribute`);
  }
  return Number(m[1]);
}

function buildSecondaryAccentPlacements(island, cols, rows, secondaryTileset, secondaryFirstGid, explicitAccents) {
  if (explicitAccents && explicitAccents.length > 0) {
    return explicitAccents;
  }
  const gidFactory =
    SECONDARY_ACCENT_TEMPLATES[secondaryTileset] ??
    ((fg) => [fg + 14, fg + 44, fg + 45, fg + 47, fg + 69]);
  const gids = gidFactory(secondaryFirstGid);

  const tm = island.tileMap;
  const spC = Math.floor(island.spawnPoint.x / 32);
  const spR = Math.floor(island.spawnPoint.y / 32);
  const candidateCoords = [
    [spC - 3, spR],
    [spC + 3, spR],
    [spC - 2, spR - 4],
    [spC + 2, spR - 4],
    [spC, spR + 1],
    [spC - 4, spR - 2],
    [spC + 4, spR - 2],
    [Math.floor(cols * 0.5), Math.floor(rows * 0.5)],
    [Math.floor(cols * 0.5) - 2, Math.floor(rows * 0.5) - 1],
    [Math.floor(cols * 0.5) + 2, Math.floor(rows * 0.5) - 1]
  ];

  const out = [];
  for (let i = 0; i < candidateCoords.length && out.length < 4; i++) {
    const pair = candidateCoords[i];
    if (!pair) continue;
    const [ac, ar] = pair;
    if (ac < 1 || ac >= cols - 1 || ar < 1 || ar >= rows - 1) continue;
    const gCh = tm.groundRows[ar]?.[ac] ?? 'W';
    if ((tm.solidRows[ar]?.[ac] ?? '#') !== '.' || gCh === 'W' || gCh === '~') continue;
    const gid = gids[out.length % gids.length];
    if (gid !== undefined) {
      out.push([ac, ar, gid]);
    }
  }
  return out;
}

/**
 * Compile a canonical island JSON definition + external master `.tsx` + `.tx` templates
 * into a deterministic Tiled 1.10+ `.tmj` map (0 embedded tilesets, 100% metadata preserved).
 */
export function compileIslandTmj(rootDir, spec) {
  const islandJsonPath = path.join(rootDir, `src/data/islands/${spec.islandId}.json`);
  const island = JSON.parse(fs.readFileSync(islandJsonPath, 'utf-8'));
  const tm = island.tileMap;
  const cols = tm.cols;
  const rows = tm.rows;
  const size = cols * rows;
  const legend = tm.tileLegend;

  const waterData = new Array(size).fill(0);
  const groundData = new Array(size).fill(0);
  const detailData = new Array(size).fill(0);
  const wallsData = new Array(size).fill(0);
  const overheadData = new Array(size).fill(0);

  const setTile = (arr, c, r, gid) => {
    if (c < 0 || c >= cols || r < 0 || r >= rows) return;
    arr[r * cols + c] = gid;
  };

  for (let r = 0; r < rows; r++) {
    const gLine = tm.groundRows[r] ?? '';
    const dLine = tm.detailRows[r] ?? '';
    const oLine = tm.overheadRows[r] ?? '';
    for (let c = 0; c < cols; c++) {
      const gCh = gLine[c] ?? '.';
      const dCh = dLine[c] ?? '.';
      const oCh = oLine[c] ?? '.';

      const gTileId = legend[gCh] ?? -1;
      if (gCh === 'W' || gCh === '~') {
        setTile(waterData, c, r, 1 + (gTileId >= 0 ? gTileId : 16));
      } else if (gCh === 'd') {
        setTile(waterData, c, r, 1 + 20);
        setTile(groundData, c, r, 1 + (legend.d ?? 46));
      } else if (WALL_CHARS.has(gCh)) {
        const baseFloorId = legend.p ?? 44;
        setTile(groundData, c, r, 1 + baseFloorId);
        if (gTileId >= 0) setTile(wallsData, c, r, 1 + gTileId);
      } else if (gTileId >= 0) {
        setTile(groundData, c, r, 1 + gTileId);
      }

      if (dCh !== '.') {
        const dTileId = legend[dCh] ?? -1;
        if (dTileId >= 0) {
          setTile(detailData, c, r, 1 + dTileId);
        }
      }

      if (oCh !== '.') {
        const oTileId = legend[oCh] ?? -1;
        if (oTileId >= 0) {
          setTile(overheadData, c, r, 1 + oTileId);
        }
      }
    }
  }

  const primaryTileCount = readTsxTileCount(rootDir, spec.primaryTileset);
  const tilesets = [
    { firstgid: 1, source: `../tilesets/${spec.primaryTileset}.tsx` }
  ];

  if (spec.secondaryTileset) {
    const secondaryFirstGid = 1 + primaryTileCount;
    // Validate secondary .tsx exists & has valid tilecount
    void readTsxTileCount(rootDir, spec.secondaryTileset);
    tilesets.push({
      firstgid: secondaryFirstGid,
      source: `../tilesets/${spec.secondaryTileset}.tsx`
    });

    const accentCoords = buildSecondaryAccentPlacements(
      island,
      cols,
      rows,
      spec.secondaryTileset,
      secondaryFirstGid,
      spec.secondaryAccents
    );
    for (const [ac, ar, gid] of accentCoords) {
      if (
        ac >= 0 &&
        ac < cols &&
        ar >= 0 &&
        ar < rows &&
        (tm.solidRows[ar]?.[ac] ?? '#') === '.'
      ) {
        setTile(detailData, ac, ar, gid);
      }
    }
  }

  let nextObjId = 1;
  const collisions = [];
  for (let r = 0; r < rows; r++) {
    const sLine = tm.solidRows[r] ?? '';
    let c = 0;
    while (c < cols) {
      if (sLine[c] === '#') {
        const startC = c;
        while (c < cols && sLine[c] === '#') c++;
        collisions.push({
          id: nextObjId++,
          name: `solid_r${r}_c${startC}`,
          type: 'collision',
          x: startC * 16,
          y: r * 16,
          width: (c - startC) * 16,
          height: 16
        });
      } else {
        c++;
      }
    }
  }
  for (const obs of island.obstacles ?? []) {
    collisions.push({
      id: nextObjId++,
      name: obs.label ?? 'building',
      type: 'collision',
      x: obs.x / 2,
      y: obs.y / 2,
      width: obs.width / 2,
      height: obs.height / 2
    });
  }
  for (const bar of island.laserBarriers ?? []) {
    collisions.push({
      id: nextObjId++,
      name: bar.barrierId,
      type: 'laser_barrier',
      x: bar.x / 2,
      y: bar.y / 2,
      width: bar.width / 2,
      height: bar.height / 2,
      properties: [
        { name: 'isLaserBarrier', type: 'bool', value: true },
        { name: 'barrierId', type: 'string', value: bar.barrierId },
        { name: 'activeByDefault', type: 'bool', value: Boolean(bar.activeByDefault) }
      ]
    });
  }

  const lights = (spec.extraLights ?? []).map((l) => ({
    id: nextObjId++,
    name: l.name,
    template: l.mask === 'ALL' ? '../templates/light_point.tx' : '../templates/light_lantern.tx',
    type: 'point_light',
    point: true,
    x: l.tx * 16,
    y: l.ty * 16,
    width: 0,
    height: 0,
    properties: [
      { name: 'color', type: 'color', value: l.color },
      { name: 'radius', type: 'float', value: l.radius },
      { name: 'intensity', type: 'float', value: l.intensity },
      { name: 'flickerSpeed', type: 'float', value: l.flickerSpeed },
      { name: 'activeTimeMask', type: 'string', value: l.mask }
    ]
  }));

  const portMarker = (island.markers ?? []).find((m) => m.kind === 'PORT_EXIT');
  const spawns = [
    {
      id: nextObjId++,
      name: 'player_spawn',
      type: 'spawn',
      point: true,
      x: island.spawnPoint.x / 2,
      y: island.spawnPoint.y / 2,
      width: 0,
      height: 0
    },
    {
      id: nextObjId++,
      name: 'dock_departure',
      template: '../templates/dock_departure.tx',
      type: 'PORT_EXIT',
      point: true,
      x: island.portExitZone.pos.x / 2,
      y: island.portExitZone.pos.y / 2,
      width: 0,
      height: 0,
      properties: [
        {
          name: 'markerId',
          type: 'string',
          value: portMarker?.markerId ?? 'dock_departure'
        },
        { name: 'actionKind', type: 'string', value: 'PORT_EXIT' },
        {
          name: 'radiusPx',
          type: 'float',
          value: island.portExitZone.radiusPx ?? 44
        },
        {
          name: 'label',
          type: 'string',
          value: portMarker?.label ?? '항구 출항'
        }
      ]
    }
  ];

  const markers = (island.markers ?? []).map((m) => {
    const template =
      m.kind === 'PORT_EXIT'
        ? '../templates/dock_departure.tx'
        : m.kind === 'MAIN'
          ? '../templates/marker_story_gold.tx'
          : m.kind === 'SIDE'
            ? '../templates/marker_side_blue.tx'
            : '../templates/marker_utility_silver.tx';
    return {
      id: nextObjId++,
      name: m.markerId,
      template,
      type: m.kind,
      point: true,
      x: (m.tileX + 0.5) * 16,
      y: (m.tileY + 0.5) * 16,
      width: 0,
      height: 0,
      properties: [
        { name: 'markerId', type: 'string', value: m.markerId },
        { name: 'markerKind', type: 'string', value: m.kind },
        { name: 'label', type: 'string', value: m.label },
        { name: 'actionKind', type: 'string', value: m.actionKind }
      ]
    };
  });

  for (const sw of island.puzzleSwitches ?? []) {
    markers.push({
      id: nextObjId++,
      name: sw.switchId,
      template: '../templates/marker_utility_silver.tx',
      type: 'PUZZLE_SWITCH',
      point: true,
      x: sw.pos.x / 2,
      y: sw.pos.y / 2,
      width: 0,
      height: 0,
      properties: [
        { name: 'switchId', type: 'string', value: sw.switchId },
        { name: 'label', type: 'string', value: sw.label },
        { name: 'deactivatesBarrierId', type: 'string', value: sw.deactivatesBarrierId },
        { name: 'actionKind', type: 'string', value: 'PUZZLE_SWITCH' }
      ]
    });
  }

  const npcs = (island.npcs ?? []).map((n) => {
    const nx = n.pos.x / 2;
    const ny = n.pos.y / 2;
    const hasPatrol = Array.isArray(n.patrolWaypoints) && n.patrolWaypoints.length >= 2;
    const props = [
      { name: 'npcId', type: 'string', value: n.npcId },
      { name: 'displayName', type: 'string', value: n.name },
      { name: 'roleLabel', type: 'string', value: n.roleLabel ?? '' },
      { name: 'facing', type: 'string', value: n.facing ?? 'down' },
      { name: 'patrolSpeedPx', type: 'float', value: n.patrolSpeedPx ?? 40 },
      { name: 'pauseTicks', type: 'int', value: n.pauseTicks ?? 75 },
      { name: 'patrolLoop', type: 'bool', value: true }
    ];
    if (n.setsQuestFlagOnTalk) {
      props.push({
        name: 'setsQuestFlagOnTalk',
        type: 'string',
        value: n.setsQuestFlagOnTalk
      });
    }
    return {
      id: nextObjId++,
      name: n.npcId,
      template: '../templates/npc_patrol_anchor.tx',
      type: 'npc',
      point: true,
      x: nx,
      y: ny,
      width: 0,
      height: 0,
      ...(hasPatrol
        ? {
            polyline: n.patrolWaypoints.map((pt) => ({
              x: pt.x / 2 - nx,
              y: pt.y / 2 - ny
            }))
          }
        : {}),
      properties: props
    };
  });

  const chests = (island.chests ?? []).map((ch) => ({
    id: nextObjId++,
    name: ch.chestId,
    template: '../templates/chest_hidden.tx',
    type: ch.rarity,
    point: true,
    x: (ch.tileX + 0.5) * 16,
    y: (ch.tileY + 0.5) * 16,
    width: 0,
    height: 0,
    properties: [
      { name: 'chestId', type: 'string', value: ch.chestId },
      { name: 'rarity', type: 'string', value: ch.rarity },
      { name: 'berries', type: 'int', value: ch.reward?.berries ?? 0 },
      { name: 'trainingPoints', type: 'int', value: ch.reward?.trainingPoints ?? 0 },
      { name: 'hiddenHint', type: 'string', value: ch.hiddenHint ?? '' }
    ]
  }));

  const zones = (island.zones ?? []).map((z) => ({
    id: nextObjId++,
    name: z.zoneId,
    type: 'zone',
    x: z.tileX * 16,
    y: z.tileY * 16,
    width: z.tileW * 16,
    height: z.tileH * 16,
    properties: [
      { name: 'displayName', type: 'string', value: z.name },
      { name: 'accentColor', type: 'string', value: z.accentColor }
    ]
  }));

  const mapProperties = [
    { name: 'pixelScale', type: 'int', value: 2 },
    { name: 'islandId', type: 'string', value: island.islandId }
  ];
  if (island.episodeId) {
    mapProperties.push({
      name: 'episodeId',
      type: 'string',
      value: island.episodeId
    });
  }

  const tmj = {
    compressionlevel: -1,
    height: rows,
    infinite: false,
    orientation: 'orthogonal',
    renderorder: 'right-down',
    tiledversion: '1.10.2',
    tileheight: 16,
    tilewidth: 16,
    type: 'map',
    version: '1.10',
    width: cols,
    properties: mapProperties,
    tilesets,
    layers: [
      {
        id: 1,
        name: 'water',
        type: 'tilelayer',
        visible: true,
        opacity: 1,
        x: 0,
        y: 0,
        width: cols,
        height: rows,
        properties: [{ name: 'layerRole', type: 'string', value: 'water' }],
        data: waterData
      },
      {
        id: 2,
        name: 'ground',
        type: 'tilelayer',
        visible: true,
        opacity: 1,
        x: 0,
        y: 0,
        width: cols,
        height: rows,
        properties: [{ name: 'layerRole', type: 'string', value: 'ground' }],
        data: groundData
      },
      {
        id: 3,
        name: 'ground_detail',
        type: 'tilelayer',
        visible: true,
        opacity: 1,
        x: 0,
        y: 0,
        width: cols,
        height: rows,
        properties: [{ name: 'layerRole', type: 'string', value: 'ground_detail' }],
        data: detailData
      },
      {
        id: 4,
        name: 'walls_props',
        type: 'tilelayer',
        visible: true,
        opacity: 1,
        x: 0,
        y: 0,
        width: cols,
        height: rows,
        properties: [{ name: 'layerRole', type: 'string', value: 'walls_props' }],
        data: wallsData
      },
      {
        id: 5,
        name: 'overhead',
        type: 'tilelayer',
        visible: true,
        opacity: 1,
        x: 0,
        y: 0,
        width: cols,
        height: rows,
        properties: [{ name: 'layerRole', type: 'string', value: 'overhead' }],
        data: overheadData
      },
      {
        id: 6,
        name: 'collision',
        type: 'objectgroup',
        visible: false,
        draworder: 'topdown',
        properties: [{ name: 'layerRole', type: 'string', value: 'collision' }],
        objects: collisions
      },
      {
        id: 7,
        name: 'lights',
        type: 'objectgroup',
        visible: true,
        draworder: 'topdown',
        properties: [{ name: 'layerRole', type: 'string', value: 'lights' }],
        objects: lights
      },
      {
        id: 8,
        name: 'spawns',
        type: 'objectgroup',
        visible: true,
        draworder: 'topdown',
        properties: [{ name: 'layerRole', type: 'string', value: 'spawns' }],
        objects: spawns
      },
      {
        id: 9,
        name: 'markers',
        type: 'objectgroup',
        visible: true,
        draworder: 'topdown',
        properties: [{ name: 'layerRole', type: 'string', value: 'markers' }],
        objects: markers
      },
      {
        id: 10,
        name: 'npcs',
        type: 'objectgroup',
        visible: true,
        draworder: 'topdown',
        properties: [{ name: 'layerRole', type: 'string', value: 'npcs' }],
        objects: npcs
      },
      {
        id: 11,
        name: 'chests',
        type: 'objectgroup',
        visible: true,
        draworder: 'topdown',
        properties: [{ name: 'layerRole', type: 'string', value: 'chests' }],
        objects: chests
      },
      {
        id: 12,
        name: 'zones',
        type: 'objectgroup',
        visible: true,
        draworder: 'topdown',
        properties: [{ name: 'layerRole', type: 'string', value: 'zones' }],
        objects: zones
      }
    ]
  };

  const outPath = path.join(rootDir, 'public/assets/pro/maps', spec.tmjName);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(tmj, null, 2)}\n`, 'utf-8');
  return {
    tmjName: spec.tmjName,
    islandId: island.islandId,
    episodeId: island.episodeId ?? null,
    tilesets: tilesets.map((t) => ({ firstgid: t.firstgid, source: t.source })),
    cols,
    rows,
    lightCount: lights.length,
    chestCount: chests.length,
    npcCount: npcs.length,
    collisionCount: collisions.length
  };
}

export function compileTmjSpecs(rootDir, specs) {
  const results = [];
  for (const spec of specs) {
    results.push(compileIslandTmj(rootDir, spec));
  }
  return results;
}

export async function compileAllWave4Tmj(rootDir, islandFilter = null) {
  const { WAVE4_ISLAND_MAP_SPECS } = await import('./lib/wave4IslandTmjBuilder.mjs');
  const targetSpecs = islandFilter
    ? WAVE4_ISLAND_MAP_SPECS.filter((s) => s.islandId === islandFilter)
    : WAVE4_ISLAND_MAP_SPECS;
  if (islandFilter && targetSpecs.length === 0) {
    throw new Error(`Unknown Wave 4 islandId '${islandFilter}'`);
  }
  return compileTmjSpecs(rootDir, targetSpecs);
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
  const islandArg = process.argv.find((a) => a.startsWith('--island='));
  const islandFilter = islandArg ? islandArg.slice('--island='.length).trim() : null;
  compileAllWave4Tmj(ROOT_DIR, islandFilter)
    .then((compiled) => {
      console.log(`✅ Compiled ${compiled.length} Tiled .tmj map(s):`);
      for (const c of compiled) {
        const tsSummary = c.tilesets.map((t) => `${path.basename(t.source)}@${t.firstgid}`).join(', ');
        console.log(
          `   • ${c.tmjName} (${c.cols}x${c.rows}, ep=${c.episodeId ?? 'none'}, L=${c.lightCount}, C=${c.chestCount}, N=${c.npcCount}) [${tsSummary}]`
        );
      }
    })
    .catch((err) => {
      console.error('❌ compile-tiled-tmj failed:', err);
      process.exit(1);
    });
}
