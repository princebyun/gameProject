import fs from 'node:fs';
import path from 'node:path';

export const WAVE2_MASTER_TILESETS = [
  {
    id: 'master_stone_canal',
    srcCandidates: ['raw_assets/tilesets/master_stone_canal.png', 'public/assets/tilesets/port_town.png'],
    defaultSurface: 'stone',
    waterAnimMs: 240,
    emissiveIds: [68, 194, 196],
    emissivePulseIds: [194, 196],
    bundle: 'island_water_seven'
  },
  {
    id: 'master_desert_palace',
    srcCandidates: ['raw_assets/tilesets/master_desert_palace.png', 'public/assets/tilesets/desert_alabasta.png'],
    defaultSurface: 'sand',
    waterAnimMs: 260,
    emissiveIds: [68, 194, 196],
    emissivePulseIds: [],
    bundle: 'island_alabasta'
  },
  {
    id: 'master_eastern_pagoda',
    srcCandidates: ['raw_assets/tilesets/master_eastern_pagoda.png', 'public/assets/tilesets/wano_castle.png'],
    defaultSurface: 'grass',
    waterAnimMs: 260,
    emissiveIds: [68, 194, 196],
    emissivePulseIds: [194, 196],
    bundle: 'island_wano_country'
  },
  {
    id: 'master_scifi_neon',
    srcCandidates: ['raw_assets/tilesets/master_scifi_neon.png', 'public/assets/tilesets/egghead_cyber.png'],
    defaultSurface: 'metal_cyber',
    waterAnimMs: 220,
    emissiveIds: [48, 60, 63, 68, 194, 196],
    emissivePulseIds: [194, 196],
    bundle: 'island_egghead'
  }
];

export const WAVE2_HUB_MAP_SPECS = [
  {
    islandId: 'water_seven',
    tmjName: 'water_seven.tmj',
    primaryTileset: 'master_stone_canal',
    secondaryTileset: 'master_port_village',
    waterlineTileY: 18,
    extraLights: [
      { name: 'w7_blue_station_west', tx: 20.5, ty: 29.5, color: '#fffde047', radius: 56, intensity: 0.95, flickerSpeed: 2.6, mask: 'ALL' },
      { name: 'w7_blue_station_east', tx: 29.5, ty: 29.5, color: '#fffde047', radius: 56, intensity: 0.95, flickerSpeed: 2.8, mask: 'ALL' },
      { name: 'w7_canal_arch_west', tx: 15.5, ty: 18.5, color: '#ff38bdf8', radius: 58, intensity: 0.95, flickerSpeed: 2.2, mask: 'ALL' },
      { name: 'w7_canal_arch_east', tx: 36.5, ty: 18.5, color: '#ff38bdf8', radius: 58, intensity: 0.95, flickerSpeed: 2.4, mask: 'ALL' },
      { name: 'w7_fountain_lantern', tx: 9.5, ty: 21.5, color: '#ff7dd3fc', radius: 64, intensity: 1.0, flickerSpeed: 2.0, mask: 'ALL' },
      { name: 'w7_dock1_crane_lamp_w', tx: 23.5, ty: 7.5, color: '#fffb923c', radius: 68, intensity: 1.02, flickerSpeed: 3.4, mask: 'SUNSET|NIGHT' },
      { name: 'w7_dock1_crane_lamp_e', tx: 33.5, ty: 7.5, color: '#fffb923c', radius: 68, intensity: 1.02, flickerSpeed: 3.6, mask: 'SUNSET|NIGHT' },
      { name: 'w7_bazaar_lamp', tx: 6.5, ty: 15.5, color: '#fffef08a', radius: 60, intensity: 0.92, flickerSpeed: 3.1, mask: 'SUNSET|NIGHT' },
      { name: 'w7_east_terrace_beacon', tx: 44.5, ty: 13.5, color: '#ff38bdf8', radius: 62, intensity: 0.9, flickerSpeed: 2.5, mask: 'ALL' }
    ]
  },
  {
    islandId: 'alabasta',
    tmjName: 'alabasta.tmj',
    primaryTileset: 'master_desert_palace',
    secondaryTileset: null,
    waterlineTileY: 20,
    extraLights: [
      { name: 'alab_nanohana_dock_w', tx: 21.5, ty: 29.5, color: '#fffbbf24', radius: 58, intensity: 0.96, flickerSpeed: 4.1, mask: 'SUNSET|NIGHT' },
      { name: 'alab_nanohana_dock_e', tx: 27.5, ty: 29.5, color: '#fffbbf24', radius: 58, intensity: 0.96, flickerSpeed: 4.3, mask: 'SUNSET|NIGHT' },
      { name: 'alab_bazaar_torch_w', tx: 7.5, ty: 19.5, color: '#fffb923c', radius: 68, intensity: 1.12, flickerSpeed: 4.8, mask: 'SUNSET|NIGHT' },
      { name: 'alab_bazaar_torch_e', tx: 14.5, ty: 19.5, color: '#fffb923c', radius: 68, intensity: 1.12, flickerSpeed: 4.6, mask: 'SUNSET|NIGHT' },
      { name: 'alab_clock_tower_brazier', tx: 17.5, ty: 9.5, color: '#fffde047', radius: 74, intensity: 1.08, flickerSpeed: 3.4, mask: 'SUNSET|NIGHT' },
      { name: 'alab_palace_stair_w', tx: 21.5, ty: 6.5, color: '#fffde047', radius: 72, intensity: 1.05, flickerSpeed: 3.2, mask: 'ALL' },
      { name: 'alab_palace_stair_e', tx: 29.5, ty: 6.5, color: '#fffde047', radius: 72, intensity: 1.05, flickerSpeed: 3.5, mask: 'ALL' },
      { name: 'alab_oasis_spring_glow', tx: 37.5, ty: 20.5, color: '#ff38bdf8', radius: 66, intensity: 0.88, flickerSpeed: 2.1, mask: 'ALL' },
      { name: 'alab_se_ruins_torch', tx: 40.5, ty: 27.5, color: '#fff97316', radius: 62, intensity: 1.04, flickerSpeed: 4.5, mask: 'SUNSET|NIGHT' }
    ]
  },
  {
    islandId: 'wano_onigashima',
    tmjName: 'wano_country.tmj',
    primaryTileset: 'master_eastern_pagoda',
    secondaryTileset: null,
    waterlineTileY: 23,
    extraLights: [
      { name: 'wano_torii_lantern_l', tx: 22.5, ty: 25.5, color: '#fffb923c', radius: 66, intensity: 1.08, flickerSpeed: 3.6, mask: 'ALL' },
      { name: 'wano_torii_lantern_r', tx: 29.5, ty: 25.5, color: '#fffb923c', radius: 66, intensity: 1.08, flickerSpeed: 3.9, mask: 'ALL' },
      { name: 'wano_capital_lantern_w', tx: 22.5, ty: 19.5, color: '#fffacc15', radius: 64, intensity: 1.02, flickerSpeed: 3.3, mask: 'ALL' },
      { name: 'wano_capital_lantern_e', tx: 29.5, ty: 19.5, color: '#fffacc15', radius: 64, intensity: 1.02, flickerSpeed: 3.5, mask: 'ALL' },
      { name: 'wano_red_lantern_w', tx: 18.5, ty: 12.5, color: '#fff43f5e', radius: 70, intensity: 1.12, flickerSpeed: 4.2, mask: 'ALL' },
      { name: 'wano_red_lantern_e', tx: 35.5, ty: 11.5, color: '#fff43f5e', radius: 70, intensity: 1.12, flickerSpeed: 4.4, mask: 'ALL' },
      { name: 'wano_koi_pond_shrine', tx: 5.5, ty: 12.5, color: '#ff4ade80', radius: 58, intensity: 0.92, flickerSpeed: 2.2, mask: 'ALL' },
      { name: 'wano_onigashima_gate', tx: 25.5, ty: 4.5, color: '#ffdc2626', radius: 82, intensity: 1.15, flickerSpeed: 3.8, mask: 'ALL' }
    ]
  },
  {
    islandId: 'egghead',
    tmjName: 'egghead.tmj',
    primaryTileset: 'master_scifi_neon',
    secondaryTileset: null,
    waterlineTileY: 35,
    extraLights: [
      { name: 'egg_plaza_core', tx: 27.5, ty: 22.5, color: '#ff22d3ee', radius: 74, intensity: 1.08, flickerSpeed: 1.8, mask: 'ALL' },
      { name: 'egg_glass_dome', tx: 29.5, ty: 16.5, color: '#ff38bdf8', radius: 82, intensity: 1.14, flickerSpeed: 1.6, mask: 'ALL' },
      { name: 'egg_skywalk_tube', tx: 44.5, ty: 18.5, color: '#ffc084fc', radius: 68, intensity: 1.02, flickerSpeed: 2.4, mask: 'ALL' },
      { name: 'egg_security_corridor', tx: 16.5, ty: 9.5, color: '#ffef4444', radius: 64, intensity: 1.05, flickerSpeed: 3.2, mask: 'ALL' },
      { name: 'egg_punk_records_gate', tx: 36.5, ty: 7.5, color: '#fffacc15', radius: 72, intensity: 1.06, flickerSpeed: 2.0, mask: 'ALL' },
      { name: 'egg_docking_bay_beacon', tx: 27.5, ty: 33.5, color: '#ff38bdf8', radius: 66, intensity: 0.95, flickerSpeed: 1.9, mask: 'ALL' },
      { name: 'egg_holo_billboard_w', tx: 23.5, ty: 19.5, color: '#ff22d3ee', radius: 56, intensity: 0.96, flickerSpeed: 2.6, mask: 'ALL' },
      { name: 'egg_holo_billboard_e', tx: 35.5, ty: 19.5, color: '#fff472b6', radius: 56, intensity: 0.96, flickerSpeed: 2.8, mask: 'ALL' }
    ]
  }
];

function buildTxXml(innerXml) {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<template>\n ${innerXml.trim()}\n</template>\n`;
}

export function ensureWave2Templates(rootDir) {
  const dir = path.join(rootDir, 'public/assets/pro/templates');
  fs.mkdirSync(dir, { recursive: true });

  const templates = {
    'light_point.tx': buildTxXml(`
  <object name="point_light" type="point_light" width="0" height="0">
   <properties>
    <property name="color" type="color" value="#fffde047"/>
    <property name="radius" type="float" value="64"/>
    <property name="intensity" type="float" value="0.9"/>
    <property name="flickerSpeed" type="float" value="2.8"/>
    <property name="flickerAmp" type="float" value="0.08"/>
    <property name="activeTimeMask" type="string" value="ALL"/>
    <property name="bloomCore" type="bool" value="true"/>
   </properties>
   <point/>
  </object>`),
    'light_lantern.tx': buildTxXml(`
  <object name="lantern_light" type="point_light" width="0" height="0">
   <properties>
    <property name="color" type="color" value="#fffb923c"/>
    <property name="radius" type="float" value="58"/>
    <property name="intensity" type="float" value="1.05"/>
    <property name="flickerSpeed" type="float" value="3.8"/>
    <property name="flickerAmp" type="float" value="0.12"/>
    <property name="activeTimeMask" type="string" value="SUNSET|NIGHT"/>
    <property name="bloomCore" type="bool" value="true"/>
   </properties>
   <point/>
  </object>`),
    'chest_hidden.tx': buildTxXml(`
  <object name="hidden_chest" type="chest" width="0" height="0">
   <properties>
    <property name="chestId" type="string" value=""/>
    <property name="rarity" type="string" value="wooden"/>
    <property name="berries" type="int" value="1000"/>
    <property name="trainingPoints" type="int" value="10"/>
    <property name="hiddenHint" type="string" value=""/>
   </properties>
   <point/>
  </object>`),
    'marker_story_gold.tx': buildTxXml(`
  <object name="story_marker" type="MAIN" width="0" height="0">
   <properties>
    <property name="markerId" type="string" value=""/>
    <property name="markerKind" type="string" value="MAIN"/>
    <property name="label" type="string" value=""/>
    <property name="actionKind" type="string" value="STORY"/>
    <property name="beaconColor" type="string" value="#facc15"/>
   </properties>
   <point/>
  </object>`),
    'marker_side_blue.tx': buildTxXml(`
  <object name="side_marker" type="SIDE" width="0" height="0">
   <properties>
    <property name="markerId" type="string" value=""/>
    <property name="markerKind" type="string" value="SIDE"/>
    <property name="label" type="string" value=""/>
    <property name="actionKind" type="string" value="STORY"/>
    <property name="beaconColor" type="string" value="#38bdf8"/>
   </properties>
   <point/>
  </object>`),
    'marker_utility_silver.tx': buildTxXml(`
  <object name="utility_marker" type="ACTIVITY" width="0" height="0">
   <properties>
    <property name="markerId" type="string" value=""/>
    <property name="markerKind" type="string" value="ACTIVITY"/>
    <property name="label" type="string" value=""/>
    <property name="actionKind" type="string" value="CAMP_TRAINING"/>
    <property name="beaconColor" type="string" value="#cbd5e1"/>
   </properties>
   <point/>
  </object>`),
    'dock_departure.tx': buildTxXml(`
  <object name="dock_departure" type="PORT_EXIT" width="0" height="0">
   <properties>
    <property name="markerId" type="string" value=""/>
    <property name="actionKind" type="string" value="PORT_EXIT"/>
    <property name="radiusPx" type="float" value="44"/>
    <property name="label" type="string" value="항구 출항"/>
   </properties>
   <point/>
  </object>`),
    'npc_patrol_anchor.tx': buildTxXml(`
  <object name="npc_patrol" type="npc" width="0" height="0">
   <properties>
    <property name="npcId" type="string" value=""/>
    <property name="displayName" type="string" value=""/>
    <property name="roleLabel" type="string" value=""/>
    <property name="facing" type="string" value="down"/>
    <property name="patrolSpeedPx" type="float" value="40"/>
    <property name="pauseTicks" type="int" value="75"/>
    <property name="patrolLoop" type="bool" value="true"/>
   </properties>
   <point/>
  </object>`)
  };

  for (const [fname, xml] of Object.entries(templates)) {
    fs.writeFileSync(path.join(dir, fname), xml, 'utf-8');
  }
  return Object.keys(templates).length;
}

function buildMasterBiomeTileXml(spec) {
  const tileMeta = new Map();
  const setMeta = (id, props) => {
    tileMeta.set(id, { ...(tileMeta.get(id) ?? {}), ...props });
  };

  setMeta(14, { surface: spec.id === 'master_eastern_pagoda' || spec.id === 'master_port_village' ? 'grass' : spec.defaultSurface, solid: false });
  setMeta(15, { surface: 'grass', solid: false });
  setMeta(3, { surface: 'sand', solid: false });
  setMeta(44, { surface: spec.id === 'master_scifi_neon' ? 'metal_cyber' : 'stone', solid: false });
  setMeta(45, { surface: spec.id === 'master_scifi_neon' ? 'metal_cyber' : 'stone', solid: false });
  setMeta(46, { surface: 'wood_dock', solid: false });
  setMeta(47, { surface: spec.id === 'master_scifi_neon' ? 'metal_cyber' : 'stone', solid: false });
  setMeta(48, { surface: 'metal_cyber', solid: false });
  setMeta(16, { surface: 'water_shallow', isWater: true, solid: true });
  for (const wid of [20, 21, 22, 23]) {
    setMeta(wid, { surface: 'water_shallow', isWater: true, solid: false });
  }
  for (const solidId of [65, 66, 68]) {
    setMeta(solidId, { surface: 'stone', solid: true });
  }
  setMeta(69, { surface: 'wood_dock', solid: false });
  for (const emId of spec.emissiveIds) {
    setMeta(emId, { emissive: true });
  }

  const lines = [];
  for (const id of Array.from(tileMeta.keys()).sort((a, b) => a - b)) {
    const props = tileMeta.get(id);
    const propLines = [];
    if (props.surface) propLines.push(`   <property name="surface" type="string" value="${props.surface}"/>`);
    if (props.solid !== undefined) propLines.push(`   <property name="solid" type="bool" value="${props.solid ? 'true' : 'false'}"/>`);
    if (props.isWater !== undefined) propLines.push(`   <property name="isWater" type="bool" value="${props.isWater ? 'true' : 'false'}"/>`);
    if (props.emissive !== undefined) propLines.push(`   <property name="emissive" type="bool" value="${props.emissive ? 'true' : 'false'}"/>`);

    let animXml = '';
    if (id === 20) {
      animXml = `  <animation>\n   <frame tileid="20" duration="${spec.waterAnimMs}"/>\n   <frame tileid="21" duration="${spec.waterAnimMs}"/>\n   <frame tileid="22" duration="${spec.waterAnimMs}"/>\n   <frame tileid="23" duration="${spec.waterAnimMs}"/>\n  </animation>\n`;
    } else if (id === 194 && spec.emissivePulseIds.length >= 2) {
      animXml = `  <animation>\n   <frame tileid="194" duration="420"/>\n   <frame tileid="196" duration="420"/>\n  </animation>\n`;
    }

    lines.push(
      ` <tile id="${id}">\n  <properties>\n${propLines.join('\n')}\n  </properties>\n${animXml} </tile>`
    );
  }
  return lines.join('\n');
}

function buildPortVillageTileXml() {
  // Coordinates from build-foosha-tmj.mjs (28 cols)
  const idOf = (c, r) => r * 28 + c;
  const entries = [
    { id: idOf(13, 16), surface: 'grass', solid: false },
    { id: idOf(14, 16), surface: 'grass', solid: false },
    { id: idOf(19, 13), surface: 'sand', solid: false },
    { id: idOf(18, 14), surface: 'sand', solid: false },
    { id: idOf(24, 6), surface: 'wood_dock', solid: false },
    { id: idOf(25, 7), surface: 'wood_dock', solid: false },
    { id: idOf(12, 2), surface: 'stone', solid: true },
    { id: idOf(13, 2), surface: 'stone', solid: true },
    { id: idOf(14, 2), surface: 'stone', solid: true },
    { id: idOf(15, 2), surface: 'stone', solid: true },
    { id: idOf(5, 5), surface: 'stone', solid: true, emissive: true }
  ];
  return entries
    .map((e) => {
      const p = [
        `   <property name="surface" type="string" value="${e.surface}"/>`,
        `   <property name="solid" type="bool" value="${e.solid ? 'true' : 'false'}"/>`,
        ...(e.emissive ? ['   <property name="emissive" type="bool" value="true"/>'] : [])
      ];
      return ` <tile id="${e.id}">\n  <properties>\n${p.join('\n')}\n  </properties>\n </tile>`;
    })
    .join('\n');
}

export function promoteWave2MasterTilesets(rootDir) {
  const tilesDir = path.join(rootDir, 'public/assets/pro/tilesets');
  fs.mkdirSync(tilesDir, { recursive: true });

  const pickImgName = (stem) =>
    fs.existsSync(path.join(tilesDir, `${stem}.webp`)) ? `${stem}.webp` : `${stem}.png`;

  for (const spec of WAVE2_MASTER_TILESETS) {
    const rawDropAbs = path.join(rootDir, spec.srcCandidates[0]);
    const fallbackAbs = path.join(rootDir, spec.srcCandidates[1]);
    const outPng = path.join(tilesDir, `${spec.id}.png`);
    const outWebp = path.join(tilesDir, `${spec.id}.webp`);

    if (fs.existsSync(rawDropAbs)) {
      fs.copyFileSync(rawDropAbs, outPng);
    } else if (!fs.existsSync(outWebp) && !fs.existsSync(outPng)) {
      if (!fs.existsSync(fallbackAbs)) {
        throw new Error(`Missing Wave 2 external tileset source for ${spec.id}: ${fallbackAbs}`);
      }
      fs.copyFileSync(fallbackAbs, outPng);
    }

    const imgName = pickImgName(spec.id);
    const tileXml = buildMasterBiomeTileXml(spec);
    const tsx = `<?xml version="1.0" encoding="UTF-8"?>\n<tileset version="1.10" tiledversion="1.10.2" name="${spec.id}" tilewidth="16" tileheight="16" tilecount="256" columns="16">\n <image source="${imgName}" width="256" height="256"/>\n${tileXml}\n</tileset>\n`;
    fs.writeFileSync(path.join(tilesDir, `${spec.id}.tsx`), tsx, 'utf-8');
  }

  // Enrich Wave 0 external .tsx files so Foosha Village also has zero embedded tilesets
  const portImg = pickImgName('ninja_adventure_village');
  const portTsx = `<?xml version="1.0" encoding="UTF-8"?>\n<tileset version="1.10" tiledversion="1.10.2" name="master_port_village" tilewidth="16" tileheight="16" tilecount="1120" columns="28">\n <image source="${portImg}" width="448" height="640"/>\n${buildPortVillageTileXml()}\n</tileset>\n`;
  fs.writeFileSync(path.join(tilesDir, 'master_port_village.tsx'), portTsx, 'utf-8');

  const medImg = pickImgName('medieval_windmill_extras');
  const medTsx = `<?xml version="1.0" encoding="UTF-8"?>\n<tileset version="1.10" tiledversion="1.10.2" name="medieval_windmill_extras" tilewidth="16" tileheight="16" tilecount="240" columns="20">\n <image source="${medImg}" width="320" height="192"/>\n <tile id="32">\n  <properties>\n   <property name="surface" type="string" value="stone"/>\n   <property name="solid" type="bool" value="false"/>\n  </properties>\n </tile>\n <tile id="201">\n  <properties>\n   <property name="surface" type="string" value="stone"/>\n   <property name="solid" type="bool" value="true"/>\n  </properties>\n </tile>\n</tileset>\n`;
  fs.writeFileSync(path.join(tilesDir, 'medieval_windmill_extras.tsx'), medTsx, 'utf-8');

  const waterImg = pickImgName('ninja_animated_water');
  const waterTsx = `<?xml version="1.0" encoding="UTF-8"?>\n<tileset version="1.10" tiledversion="1.10.2" name="master_animated_water" tilewidth="16" tileheight="16" tilecount="4" columns="4">\n <image source="${waterImg}" width="64" height="16"/>\n <tile id="0">\n  <properties>\n   <property name="surface" type="string" value="water_shallow"/>\n   <property name="isWater" type="bool" value="true"/>\n   <property name="solid" type="bool" value="true"/>\n  </properties>\n  <animation>\n   <frame tileid="0" duration="280"/>\n   <frame tileid="1" duration="280"/>\n   <frame tileid="2" duration="280"/>\n   <frame tileid="3" duration="280"/>\n  </animation>\n </tile>\n</tileset>\n`;
  fs.writeFileSync(path.join(tilesDir, 'master_animated_water.tsx'), waterTsx, 'utf-8');

  return WAVE2_MASTER_TILESETS.length;
}

const WALL_CHARS = new Set(['b', 'B', 'w', 'D']);

export function compileSingleHubTmj(rootDir, spec) {
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

  // Genuine shared `.tsx` usage when secondaryTileset is `master_port_village` (firstgid=257)
  if (spec.secondaryTileset === 'master_port_village') {
    const firstPort = 257;
    const pTile = (col, row) => firstPort + row * 28 + col;
    const accentCoords =
      spec.secondaryAccents ??
      (spec.islandId === 'water_seven'
        ? [
            [19, 29, pTile(4, 5)],
            [30, 29, pTile(6, 4)],
            [14, 15, pTile(16, 15)],
            [37, 15, pTile(17, 15)],
            [25, 29, pTile(12, 5)]
          ]
        : (() => {
            // Pick up to 4 safe walkable non-water open tiles near spawn & port for crisp port accents
            const spC = Math.floor(island.spawnPoint.x / 32);
            const spR = Math.floor(island.spawnPoint.y / 32);
            const candidates = [
              [spC - 3, spR, pTile(4, 5)],
              [spC + 3, spR, pTile(6, 4)],
              [spC - 2, spR - 4, pTile(16, 15)],
              [spC + 2, spR - 4, pTile(17, 15)],
              [spC, spR + 1, pTile(12, 5)]
            ];
            return candidates.filter(([ac, ar]) => {
              if (ac < 1 || ac >= cols - 1 || ar < 1 || ar >= rows - 1) return false;
              const gCh = tm.groundRows[ar]?.[ac] ?? 'W';
              return (tm.solidRows[ar]?.[ac] ?? '#') === '.' && gCh !== 'W' && gCh !== '~';
            });
          })());
    for (const [ac, ar, gid] of accentCoords) {
      if (ac >= 0 && ac < cols && ar >= 0 && ar < rows && (tm.solidRows[ar]?.[ac] ?? '#') === '.') {
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

  const lights = spec.extraLights.map((l) => ({
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
        { name: 'actionKind', type: 'string', value: 'PORT_EXIT' },
        { name: 'radiusPx', type: 'float', value: island.portExitZone.radiusPx ?? 44 }
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
      properties: [
        { name: 'npcId', type: 'string', value: n.npcId },
        { name: 'displayName', type: 'string', value: n.name },
        { name: 'roleLabel', type: 'string', value: n.roleLabel ?? '' },
        { name: 'facing', type: 'string', value: n.facing ?? 'down' },
        { name: 'patrolSpeedPx', type: 'float', value: n.patrolSpeedPx ?? 40 },
        { name: 'pauseTicks', type: 'int', value: n.pauseTicks ?? 75 }
      ]
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

  const tilesets = [
    { firstgid: 1, source: `../tilesets/${spec.primaryTileset}.tsx` }
  ];
  if (spec.secondaryTileset) {
    tilesets.push({
      firstgid: 257,
      source: `../tilesets/${spec.secondaryTileset}.tsx`
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
    properties: [
      { name: 'pixelScale', type: 'int', value: 2 },
      { name: 'islandId', type: 'string', value: island.islandId }
    ],
    tilesets,
    layers: [
      { id: 1, name: 'water', type: 'tilelayer', visible: true, opacity: 1, x: 0, y: 0, width: cols, height: rows, properties: [{ name: 'layerRole', type: 'string', value: 'water' }], data: waterData },
      { id: 2, name: 'ground', type: 'tilelayer', visible: true, opacity: 1, x: 0, y: 0, width: cols, height: rows, properties: [{ name: 'layerRole', type: 'string', value: 'ground' }], data: groundData },
      { id: 3, name: 'ground_detail', type: 'tilelayer', visible: true, opacity: 1, x: 0, y: 0, width: cols, height: rows, properties: [{ name: 'layerRole', type: 'string', value: 'ground_detail' }], data: detailData },
      { id: 4, name: 'walls_props', type: 'tilelayer', visible: true, opacity: 1, x: 0, y: 0, width: cols, height: rows, properties: [{ name: 'layerRole', type: 'string', value: 'walls_props' }], data: wallsData },
      { id: 5, name: 'overhead', type: 'tilelayer', visible: true, opacity: 1, x: 0, y: 0, width: cols, height: rows, properties: [{ name: 'layerRole', type: 'string', value: 'overhead' }], data: overheadData },
      { id: 6, name: 'collision', type: 'objectgroup', visible: false, draworder: 'topdown', properties: [{ name: 'layerRole', type: 'string', value: 'collision' }], objects: collisions },
      { id: 7, name: 'lights', type: 'objectgroup', visible: true, draworder: 'topdown', properties: [{ name: 'layerRole', type: 'string', value: 'lights' }], objects: lights },
      { id: 8, name: 'spawns', type: 'objectgroup', visible: true, draworder: 'topdown', properties: [{ name: 'layerRole', type: 'string', value: 'spawns' }], objects: spawns },
      { id: 9, name: 'markers', type: 'objectgroup', visible: true, draworder: 'topdown', properties: [{ name: 'layerRole', type: 'string', value: 'markers' }], objects: markers },
      { id: 10, name: 'npcs', type: 'objectgroup', visible: true, draworder: 'topdown', properties: [{ name: 'layerRole', type: 'string', value: 'npcs' }], objects: npcs },
      { id: 11, name: 'chests', type: 'objectgroup', visible: true, draworder: 'topdown', properties: [{ name: 'layerRole', type: 'string', value: 'chests' }], objects: chests },
      { id: 12, name: 'zones', type: 'objectgroup', visible: true, draworder: 'topdown', properties: [{ name: 'layerRole', type: 'string', value: 'zones' }], objects: zones }
    ]
  };

  const outPath = path.join(rootDir, 'public/assets/pro/maps', spec.tmjName);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, `${JSON.stringify(tmj, null, 2)}\n`, 'utf-8');
  return {
    tmjName: spec.tmjName,
    islandId: island.islandId,
    cols,
    rows,
    lightCount: lights.length,
    chestCount: chests.length,
    npcCount: npcs.length,
    collisionCount: collisions.length
  };
}

export function buildWave2HubTmjMaps(rootDir) {
  const results = [];
  for (const spec of WAVE2_HUB_MAP_SPECS) {
    results.push(compileSingleHubTmj(rootDir, spec));
  }
  return results;
}
