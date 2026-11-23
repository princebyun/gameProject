import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const NINJA_COLS = 28;
const MED_COLS = 20;
const FIRST_NINJA = 1;
const FIRST_MED = FIRST_NINJA + 1120; // 28 * 40 = 1120
const FIRST_ANIM_WATER = FIRST_MED + 240; // 20 * 12 = 240

const gNinja = (col, row) => FIRST_NINJA + row * NINJA_COLS + col;
const gMed = (col, row) => FIRST_MED + row * MED_COLS + col;
const gWater = (idx = 0) => FIRST_ANIM_WATER + idx;

/**
 * Generates `public/assets/pro/maps/foosha_village.tmj` strictly aligned 1:1 with
 * `src/data/islands/foosha_shells.json` (48x34 tiles @ 16px * pixelScale 2 = 1536x1088px)
 * using external CC0 tilesets (`ninja_adventure_village`, `medieval_windmill_extras`, `ninja_animated_water`).
 */
export function buildFooshaVillageTmj(rootDir = ROOT) {
  const fooshaJsonPath = path.join(rootDir, 'src/data/islands/foosha_shells.json');
  const foosha = JSON.parse(fs.readFileSync(fooshaJsonPath, 'utf-8'));
  const cols = foosha.tileMap.cols; // 48
  const rows = foosha.tileMap.rows; // 34
  const size = cols * rows;

  const waterData = new Array(size).fill(0);
  const groundData = new Array(size).fill(0);
  const detailData = new Array(size).fill(0);
  const wallsData = new Array(size).fill(0);
  const overheadData = new Array(size).fill(0);

  const setTile = (arr, c, r, gid) => {
    if (c < 0 || c >= cols || r < 0 || r >= rows) return;
    arr[r * cols + c] = gid;
  };

  // Curated verified CC0 tiles (never random snow or broken crops)
  const T_GRASS_MAIN = gNinja(13, 16);
  const T_GRASS_ALT = gNinja(14, 16);
  const T_GRASS_FLOWER_A = gNinja(16, 15);
  const T_GRASS_FLOWER_B = gNinja(17, 15);
  const T_SAND_MAIN = gNinja(19, 13);
  const T_SAND_ALT = gNinja(18, 14);
  const T_PLAZA_STONE_A = gMed(13, 1);
  const T_PLAZA_STONE_B = gMed(12, 1);
  const T_PIER_PLANK_V = gNinja(24, 6);
  const T_PIER_PLANK_H = gNinja(25, 7);
  const T_PIER_PILING = gNinja(24, 8);
  const T_STAIR_WOOD = gNinja(17, 2);

  // Party's Bar red tavern tiles (sp_ninja cols 12..15, rows 0..2)
  const BAR_ROOF_TOP = [gNinja(12, 0), gNinja(13, 0), gNinja(14, 0), gNinja(15, 0)];
  const BAR_ROOF_BOT = [gNinja(12, 1), gNinja(13, 1), gNinja(14, 1), gNinja(15, 1)];
  const BAR_WALL_ROW = [gNinja(12, 2), gNinja(13, 2), gNinja(14, 2), gNinja(15, 2)];

  // Marine Base 153 stone fortress (sp_med cols 3..5, rows 6..7) & stone fence walls
  const FORT_TOP = [gMed(3, 6), gMed(4, 6), gMed(5, 6)];
  const FORT_BOT = [gMed(3, 7), gMed(4, 7), gMed(5, 7)];
  const STONE_WALL_FILL = gMed(1, 10);

  // Windmill 2x2 (sp_med cols 5..6, rows 3..4)
  const WIND_TL = gMed(5, 3);
  const WIND_TR = gMed(6, 3);
  const WIND_BL = gMed(5, 4);
  const WIND_BR = gMed(6, 4);

  // Props & nature
  const T_BARREL = gNinja(4, 5);
  const T_CRATE = gNinja(6, 4);
  const T_SIGN = gNinja(12, 5);
  const T_WELL = gNinja(10, 4);
  const T_LANTERN_POST = gNinja(5, 5);
  const T_FENCE_H = gNinja(18, 0);
  const T_BOAT_L = gNinja(25, 9);
  const T_BOAT_R = gNinja(26, 9);
  const TREE_TOP = [
    [gNinja(2, 10), gNinja(3, 10), gNinja(4, 10)],
    [gNinja(2, 11), gNinja(3, 11), gNinja(4, 11)]
  ];

  // 1. Base ground + harbor ocean derived from canonical foosha_shells groundRows/surfaceRows
  const gRows = foosha.tileMap.groundRows;
  const sRows = foosha.tileMap.surfaceRows;
  const solidRows = foosha.tileMap.solidRows;

  for (let r = 0; r < rows; r++) {
    const gLine = gRows[r] ?? '';
    const sLine = sRows[r] ?? '';
    for (let c = 0; c < cols; c++) {
      const ch = gLine[c] ?? 'G';
      const sCh = sLine[c] ?? 'g';

      // Water layer everywhere ocean/shoreline exists (also under dock!)
      if (ch === 'W' || ch === '~' || ch === 'd' || r >= 30) {
        setTile(waterData, c, r, gWater(0));
      }

      if (ch === 'W') {
        // Pure deep ocean — ground stays empty so animated water + reflection show cleanly
        continue;
      }

      if (ch === 'd' || sCh === 'd') {
        // South Wooden Pier extending cleanly out over harbor water
        setTile(groundData, c, r, (c + r) % 2 === 0 ? T_PIER_PLANK_V : T_PIER_PLANK_H);
        if (r === 30) {
          setTile(detailData, c, r, T_PIER_PILING);
        }
      } else if (ch === 's' || ch === '~' || sCh === 's') {
        setTile(groundData, c, r, (c + r) % 3 === 0 ? T_SAND_ALT : T_SAND_MAIN);
      } else if (ch === 'p' || sCh === 'p') {
        setTile(groundData, c, r, (c * 3 + r) % 4 === 0 ? T_PLAZA_STONE_B : T_PLAZA_STONE_A);
      } else {
        // Lush green village grass
        setTile(groundData, c, r, (c + r * 2) % 3 === 0 ? T_GRASS_ALT : T_GRASS_MAIN);
        if (ch === 'G' && (c * 7 + r * 11) % 19 === 0 && (solidRows[r]?.[c] ?? '.') === '.') {
          setTile(detailData, c, r, (c + r) % 2 === 0 ? T_GRASS_FLOWER_A : T_GRASS_FLOWER_B);
        }
      }
    }
  }

  // Windmill Hill cliff & stairs accents (r=6, c=4..8)
  for (let c = 3; c <= 11; c++) {
    if (c >= 5 && c <= 7) {
      setTile(detailData, c, 7, T_STAIR_WOOD);
    } else {
      setTile(detailData, c, 7, T_FENCE_H);
    }
  }

  // 2. Party's Bar building (solid core: c=31..37, r=14..15 | roof overhang: r=12..14)
  for (let c = 31; c <= 37; c++) {
    const idx = (c - 31) % 4;
    setTile(overheadData, c, 12, BAR_ROOF_TOP[idx]);
    setTile(overheadData, c, 13, BAR_ROOF_BOT[idx]);
    setTile(overheadData, c, 14, BAR_ROOF_BOT[idx]);
    setTile(wallsData, c, 15, BAR_WALL_ROW[idx]);
  }
  // Party's Bar patio barrels & sign
  setTile(wallsData, 30, 15, T_BARREL);
  setTile(wallsData, 38, 14, T_BARREL);
  setTile(wallsData, 38, 15, T_CRATE);

  // 3. Shells Town Marine Base 153 (c=21..28, r=4..5 | battlements overhead r=2..4)
  for (let c = 21; c <= 28; c++) {
    const idx = c === 21 ? 0 : c === 28 ? 2 : 1;
    setTile(overheadData, c, 2, FORT_TOP[idx]);
    setTile(overheadData, c, 3, FORT_TOP[idx]);
    setTile(wallsData, c, 4, STONE_WALL_FILL);
    setTile(wallsData, c, 5, FORT_BOT[idx]);
  }

  // 4. Windmill landmark at Windmill Hill (c=6..7, r=4..5, overhead blades r=2..3)
  setTile(overheadData, 6, 3, WIND_TL);
  setTile(overheadData, 7, 3, WIND_TR);
  setTile(wallsData, 6, 4, WIND_BL);
  setTile(wallsData, 7, 4, WIND_BR);

  // 5. Docked Boat west of south pier (c=14..15, r=28)
  setTile(wallsData, 14, 28, T_BOAT_L);
  setTile(wallsData, 15, 28, T_BOAT_R);

  // 6. Town Well, Bounty Board, Streetlamps & Harbor Crates (on solid/decor tiles)
  setTile(wallsData, 23, 18, T_WELL);
  setTile(wallsData, 18, 17, T_SIGN);
  setTile(wallsData, 21, 26, T_LANTERN_POST);
  setTile(wallsData, 17, 27, T_LANTERN_POST);
  setTile(wallsData, 29, 17, T_LANTERN_POST);
  setTile(wallsData, 24, 7, T_LANTERN_POST);
  setTile(wallsData, 17, 29, T_BARREL);
  setTile(wallsData, 24, 28, T_CRATE);

  // 7. Decorative 2x2 trees along outer grove (canopy on overhead, base on walls)
  const treeSpots = [
    [2, 2],
    [13, 3],
    [39, 3],
    [43, 6],
    [3, 17],
    [42, 18],
    [38, 22]
  ];
  for (const [tc, tr] of treeSpots) {
    setTile(overheadData, tc, tr, TREE_TOP[0][0]);
    setTile(overheadData, tc + 1, tr, TREE_TOP[0][2]);
    setTile(wallsData, tc, tr + 1, TREE_TOP[1][0]);
    setTile(wallsData, tc + 1, tr + 1, TREE_TOP[1][2]);
  }

  // 8. Collision rectangles merged row-by-row from foosha_shells solidRows + obstacles
  const collisions = [];
  let nextObjId = 1;
  for (let r = 0; r < rows; r++) {
    const line = solidRows[r] ?? '';
    let c = 0;
    while (c < cols) {
      if (line[c] === '#') {
        const startC = c;
        while (c < cols && line[c] === '#') c++;
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
  for (const obs of foosha.obstacles ?? []) {
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

  // 9. Point Lights for DynamicLightingLayer (harbor pier lanterns, Party's Bar warm windows, plaza, windmill, marine sconces)
  const lights = [
    { name: 'pier_lantern_west', c: 17.5, r: 27.5, color: '#fffde047', radius: 66, intensity: 0.95, flickerSpeed: 2.8 },
    { name: 'pier_lantern_east', c: 21.5, r: 26.5, color: '#fffde047', radius: 70, intensity: 0.95, flickerSpeed: 3.1 },
    { name: 'partys_bar_win_left', c: 32.5, r: 15.2, color: '#fffb923c', radius: 74, intensity: 1.05, flickerSpeed: 3.8 },
    { name: 'partys_bar_win_right', c: 35.5, r: 15.2, color: '#fffb923c', radius: 74, intensity: 1.05, flickerSpeed: 4.1 },
    { name: 'partys_bar_porch', c: 29.5, r: 17.2, color: '#fffef08a', radius: 58, intensity: 0.9, flickerSpeed: 2.9 },
    { name: 'plaza_well_lamp', c: 22.0, r: 18.0, color: '#fffde047', radius: 64, intensity: 0.85, flickerSpeed: 2.5 },
    { name: 'windmill_torch', c: 6.5, r: 5.5, color: '#fffbbf24', radius: 62, intensity: 0.9, flickerSpeed: 5.0 },
    { name: 'marine_gate_torch_w', c: 23.5, r: 6.8, color: '#fff87171', radius: 56, intensity: 0.92, flickerSpeed: 4.4 },
    { name: 'marine_gate_torch_e', c: 26.5, r: 6.8, color: '#fff87171', radius: 56, intensity: 0.92, flickerSpeed: 4.7 }
  ].map((l) => ({
    id: nextObjId++,
    name: l.name,
    template: '../templates/light_lantern.tx',
    type: 'point_light',
    point: true,
    x: l.c * 16,
    y: l.r * 16,
    width: 0,
    height: 0,
    properties: [
      { name: 'color', type: 'color', value: l.color },
      { name: 'radius', type: 'float', value: l.radius },
      { name: 'intensity', type: 'float', value: l.intensity },
      { name: 'flickerSpeed', type: 'float', value: l.flickerSpeed },
      { name: 'activeTimeMask', type: 'string', value: 'ALL' }
    ]
  }));

  // 10. Spawns, Markers, NPCs, Chests, Zones (scaled /2 cleanly so * pixelScale(2) matches 1:1)
  const spawns = [
    {
      id: nextObjId++,
      name: 'player_spawn',
      type: 'spawn',
      point: true,
      x: foosha.spawnPoint.x / 2,
      y: foosha.spawnPoint.y / 2,
      width: 0,
      height: 0
    },
    {
      id: nextObjId++,
      name: 'dock_departure',
      template: '../templates/dock_departure.tx',
      type: 'PORT_EXIT',
      point: true,
      x: foosha.portExitZone.pos.x / 2,
      y: foosha.portExitZone.pos.y / 2,
      width: 0,
      height: 0,
      properties: [
        { name: 'actionKind', type: 'string', value: 'PORT_EXIT' },
        { name: 'radiusPx', type: 'float', value: foosha.portExitZone.radiusPx ?? 44 }
      ]
    }
  ];

  const markers = (foosha.markers ?? []).map((m) => ({
    id: nextObjId++,
    name: m.markerId,
    template:
      m.kind === 'PORT_EXIT'
        ? '../templates/dock_departure.tx'
        : m.kind === 'MAIN'
          ? '../templates/marker_story_gold.tx'
          : m.kind === 'SIDE'
            ? '../templates/marker_side_blue.tx'
            : '../templates/marker_utility_silver.tx',
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
  }));

  const npcs = (foosha.npcs ?? []).map((n) => ({
    id: nextObjId++,
    name: n.npcId,
    template: '../templates/npc_patrol_anchor.tx',
    type: 'npc',
    point: true,
    x: n.pos.x / 2,
    y: n.pos.y / 2,
    width: 0,
    height: 0,
    properties: [
      { name: 'npcId', type: 'string', value: n.npcId },
      { name: 'displayName', type: 'string', value: n.name },
      { name: 'facing', type: 'string', value: n.facing ?? 'down' }
    ]
  }));

  const chests = (foosha.chests ?? []).map((ch) => ({
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

  const zones = (foosha.zones ?? []).map((z) => ({
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
    properties: [
      { name: 'pixelScale', type: 'int', value: 2 },
      { name: 'islandId', type: 'string', value: 'foosha_shells' }
    ],
    tilesets: [
      {
        firstgid: FIRST_NINJA,
        source: '../tilesets/master_port_village.tsx'
      },
      {
        firstgid: FIRST_MED,
        source: '../tilesets/medieval_windmill_extras.tsx'
      },
      {
        firstgid: FIRST_ANIM_WATER,
        source: '../tilesets/master_animated_water.tsx'
      }
    ],
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

  const outPath = path.join(rootDir, 'public/assets/pro/maps/foosha_village.tmj');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(tmj, null, 2)}\n`, 'utf-8');

  return { outPath, cols, rows, lightCount: lights.length, collisionCount: collisions.length };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
  const res = buildFooshaVillageTmj();
  console.log(`✅ Generated ${res.outPath} (${res.cols}x${res.rows}, lights=${res.lightCount}, collisions=${res.collisionCount})`);
}
