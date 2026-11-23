import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  getImageMetadata,
  normalizeAssetRel,
  validateAtlasResolution
} from './optimize-pro-assets.mjs';
import { WAVE1_PPU_SPECS } from './lib/wave1ProPromoter.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

export const PRO_MANIFEST_SRC_REL = 'src/assets/pro_manifest.json';
export const PRO_MANIFEST_PUBLIC_REL = 'public/assets/pro/pro_manifest.json';

export function existsStrictCase(rootDir, relPathFromRoot) {
  const normalized = normalizeAssetRel(relPathFromRoot);
  const parts = normalized.split('/').filter(Boolean);
  let current = rootDir;
  for (const part of parts) {
    if (!fs.existsSync(current) || !fs.statSync(current).isDirectory()) {
      return false;
    }
    const entries = fs.readdirSync(current);
    if (!entries.includes(part)) {
      return false;
    }
    current = path.join(current, part);
  }
  return fs.existsSync(current);
}

function readJson(absPath) {
  return JSON.parse(fs.readFileSync(absPath, 'utf-8'));
}

function parseTsxImageSource(tsxText) {
  const m = tsxText.match(/<image\b[^>]*\bsource\s*=\s*"([^"]+)"/i);
  return m ? m[1] : null;
}

function resolveExistingProAssetVariant(rootDir, preferredRelUnderPublic) {
  const clean = normalizeAssetRel(preferredRelUnderPublic);
  if (existsStrictCase(rootDir, `public/${clean}`)) {
    return { exists: true, assetPath: clean };
  }
  if (clean.endsWith('.png')) {
    const webp = clean.replace(/\.png$/i, '.webp');
    if (existsStrictCase(rootDir, `public/${webp}`)) {
      return { exists: true, assetPath: webp };
    }
  } else if (clean.endsWith('.webp')) {
    const png = clean.replace(/\.webp$/i, '.png');
    if (existsStrictCase(rootDir, `public/${png}`)) {
      return { exists: true, assetPath: png };
    }
  }
  return { exists: false, assetPath: clean };
}

async function inspectEntryDiskState(rootDir, spec, prevById, nowIso) {
  const prev = prevById.get(spec.id);
  const resolved = resolveExistingProAssetVariant(rootDir, spec.assetPath);
  const assetPath = resolved.assetPath;
  const metaPath = spec.metaPath ? normalizeAssetRel(spec.metaPath) : null;

  let fileSizeBytes = 0;
  let dimensions = spec.dimensions ?? { width: 0, height: 0 };
  let estimatedVramBytes = 0;

  if (resolved.exists) {
    const absFile = path.join(rootDir, 'public', assetPath);
    fileSizeBytes = fs.statSync(absFile).size;
    const lower = assetPath.toLowerCase();
    if (lower.endsWith('.png') || lower.endsWith('.webp')) {
      const meta = await getImageMetadata(absFile);
      dimensions = { width: meta.width, height: meta.height };
      estimatedVramBytes = meta.width * meta.height * 4;
    }
  }

  const status = resolved.exists
    ? prev?.status === 'VERIFIED'
      ? 'VERIFIED'
      : 'IMPORTED'
    : 'PLACEHOLDER';

  const entry = {
    id: spec.id,
    category: spec.category,
    wave: spec.wave,
    tier: spec.tier,
    bundle: spec.bundle,
    status,
    assetPath,
    ...(metaPath ? { metaPath } : {}),
    dimensions,
    fileSizeBytes,
    estimatedVramBytes,
    updatedAt:
      prev && prev.status === status && prev.assetPath === assetPath && prev.fileSizeBytes === fileSizeBytes
        ? prev.updatedAt
        : nowIso,
    ...(spec.unitId ? { unitId: spec.unitId } : {}),
    ...(spec.formId ? { formId: spec.formId } : {}),
    ...(spec.islandId ? { islandId: spec.islandId } : {}),
    ...(spec.seaZoneId ? { seaZoneId: spec.seaZoneId } : {}),
    ...(spec.isGiant ? { isGiant: true } : {}),
    ...(spec.sharedTilesetIds ? { sharedTilesetIds: spec.sharedTilesetIds } : {}),
    ...(spec.sharedAssetIds ? { sharedAssetIds: spec.sharedAssetIds } : {})
  };
  return entry;
}

export async function buildProManifestCatalog(rootDir = ROOT, existingManifest = null) {
  const nowIso = new Date().toISOString();
  const prevById = new Map();
  for (const ent of existingManifest?.entries ?? []) {
    if (ent?.id) prevById.set(ent.id, ent);
  }

  const units = readJson(path.join(rootDir, 'src/data/units.json'));
  const landmarksFile = readJson(path.join(rootDir, 'src/data/assets/landmarks.json'));
  const audioFile = readJson(path.join(rootDir, 'src/data/assets/audio.json'));

  const specs = [];
  const seenIds = new Set();
  const pushSpec = (spec) => {
    if (seenIds.has(spec.id)) return;
    seenIds.add(spec.id);
    specs.push(spec);
  };

  // --- Wave 0: Vertical Slice Core (Luffy, Foosha Village, Harbor Backdrop, Core VFX & Audio) ---
  pushSpec({
    id: 'sprite:luffy_base',
    category: 'sprite',
    wave: 0,
    tier: 'tier1_crew',
    bundle: 'core_always',
    assetPath: 'assets/pro/sprites/luffy_base.webp',
    metaPath: 'assets/pro/sprites/luffy_base.json',
    unitId: 'luffy',
    formId: 'base'
  });

  // Wave 0 Luffy Portraits & Cut-in (Core always pinned)
  for (const key of ['luffy_normal', 'luffy_angry', 'luffy_determined', 'luffy_battle_cry', 'luffy_shocked', 'luffy_cutin']) {
    pushSpec({
      id: `portrait:${key}`,
      category: 'portrait',
      wave: 0,
      tier: 'tier1_crew',
      bundle: 'core_always',
      assetPath: `assets/pro/portraits/${key}.webp`,
      unitId: 'luffy'
    });
  }

  // Wave 0 Tilesets & Map (Foosha Village, shares Zoro NPC sprite via ref-counting)
  pushSpec({
    id: 'tileset:master_port_village',
    category: 'tileset',
    wave: 0,
    tier: 'env',
    bundle: 'island_foosha_village',
    assetPath: 'assets/pro/tilesets/ninja_adventure_village.webp',
    metaPath: 'assets/pro/tilesets/master_port_village.tsx'
  });
  pushSpec({
    id: 'tileset:medieval_windmill_extras',
    category: 'tileset',
    wave: 0,
    tier: 'env',
    bundle: 'island_foosha_village',
    assetPath: 'assets/pro/tilesets/medieval_windmill_extras.webp',
    metaPath: 'assets/pro/tilesets/medieval_windmill_extras.tsx'
  });
  pushSpec({
    id: 'tileset:ninja_animated_water',
    category: 'tileset',
    wave: 0,
    tier: 'env',
    bundle: 'island_foosha_village',
    assetPath: 'assets/pro/tilesets/ninja_animated_water.png',
    metaPath: 'assets/pro/tilesets/master_animated_water.tsx'
  });
  pushSpec({
    id: 'map:foosha_village',
    category: 'map',
    wave: 0,
    tier: 'env',
    bundle: 'island_foosha_village',
    assetPath: 'assets/pro/maps/foosha_village.tmj',
    metaPath: 'assets/pro/maps/foosha_village.tmj',
    dimensions: { width: 1536, height: 1088 },
    islandId: 'foosha_shells',
    sharedTilesetIds: [
      'tileset:master_port_village',
      'tileset:medieval_windmill_extras',
      'tileset:ninja_animated_water'
    ],
    sharedAssetIds: ['sprite:zoro_base']
  });

  // Wave 0 4-Layer Battle Backdrop
  for (let i = 0; i < 4; i++) {
    pushSpec({
      id: `bg:east_blue_harbor_layer${i}`,
      category: 'background',
      wave: 0,
      tier: 'env',
      bundle: 'battle_east_blue_harbor',
      assetPath: `assets/pro/backgrounds/east_blue_harbor_layer${i}.webp`
    });
  }

  // Wave 0 Core VFX
  const vfxSpecs = [
    { id: 'slash_arc', frameWidth: 32, frameHeight: 32, frameCount: 5, fps: 18, blendMode: 'add', scale: 1.6 },
    { id: 'hit_spark', frameWidth: 32, frameHeight: 32, frameCount: 6, fps: 22, blendMode: 'add', scale: 1.5 },
    { id: 'parry_flash', frameWidth: 32, frameHeight: 32, frameCount: 5, fps: 20, blendMode: 'add', scale: 1.8 },
    { id: 'conqueror_bolt', frameWidth: 96, frameHeight: 96, frameCount: 5, fps: 18, blendMode: 'add', scale: 0.9 },
    { id: 'fire_explosion', frameWidth: 96, frameHeight: 96, frameCount: 10, fps: 18, blendMode: 'normal', scale: 1.1 },
    { id: 'beam_core', frameWidth: 214, frameHeight: 96, frameCount: 5, fps: 16, blendMode: 'add', scale: 1.2 },
    { id: 'awakening_burst', frameWidth: 55, frameHeight: 99, frameCount: 6, fps: 16, blendMode: 'add', scale: 1.4 }
  ];
  for (const v of vfxSpecs) {
    pushSpec({
      id: `vfx:${v.id}`,
      category: 'vfx',
      wave: 0,
      tier: 'env',
      bundle: 'core_always',
      assetPath: `assets/pro/vfx/${v.id}.webp`
    });
  }

  // Wave 0 Core Audio (BGM + SFX from existing audio.json)
  for (const bgm of audioFile.bgmTracks ?? []) {
    pushSpec({
      id: `audio:bgm_${bgm.id}`,
      category: 'audio',
      wave: 0,
      tier: 'env',
      bundle: 'core_always',
      assetPath: bgm.src,
      dimensions: { width: 0, height: 0 }
    });
  }
  for (const sfx of audioFile.sfxEntries ?? []) {
    pushSpec({
      id: `audio:sfx_${sfx.id}`,
      category: 'audio',
      wave: 0,
      tier: 'env',
      bundle: 'core_always',
      assetPath: sfx.src,
      dimensions: { width: 0, height: 0 }
    });
  }

  // --- Wave 1: Sea Worldmap Landmarks (Active 3-Sea Lazy Bundles) & East Blue Combat Core ---
  for (const lm of landmarksFile.landmarks ?? []) {
    pushSpec({
      id: `sea:landmark_${lm.id}`,
      category: 'sprite',
      wave: 1,
      tier: 'env',
      bundle: `sea_${lm.seaZoneId}`,
      assetPath: lm.path,
      seaZoneId: lm.seaZoneId
    });
  }

  const crewEmotions = ['normal', 'angry', 'determined', 'shocked', 'smirk', 'sad', 'excited', 'battle_cry'];
  const wave1CrewIds = ['zoro', 'sanji', 'nami'];
  for (const uid of wave1CrewIds) {
    pushSpec({
      id: `sprite:${uid}_base`,
      category: 'sprite',
      wave: 1,
      tier: 'tier1_crew',
      bundle: `party_${uid}`,
      assetPath: `assets/pro/sprites/${uid}_base.webp`,
      metaPath: `assets/pro/sprites/${uid}_base.json`,
      unitId: uid,
      formId: 'base'
    });
    for (const emo of crewEmotions) {
      pushSpec({
        id: `portrait:${uid}_${emo}`,
        category: 'portrait',
        wave: 1,
        tier: 'tier1_crew',
        bundle: `party_${uid}`,
        assetPath: `assets/pro/portraits/${uid}_${emo}.webp`,
        unitId: uid
      });
    }
    if (uid === 'zoro') {
      pushSpec({
        id: 'portrait:zoro_cutin',
        category: 'portrait',
        wave: 1,
        tier: 'tier1_crew',
        bundle: 'party_zoro',
        assetPath: 'assets/pro/portraits/zoro_cutin.webp',
        unitId: 'zoro'
      });
    }
  }

  pushSpec({
    id: 'sprite:usopp_base',
    category: 'sprite',
    wave: 1,
    tier: 'tier1_crew',
    bundle: 'party_usopp',
    assetPath: 'assets/pro/sprites/usopp_base.webp',
    metaPath: 'assets/pro/sprites/usopp_base.json',
    unitId: 'usopp',
    formId: 'base'
  });
  pushSpec({
    id: 'portrait:usopp_normal',
    category: 'portrait',
    wave: 1,
    tier: 'tier1_crew',
    bundle: 'party_usopp',
    assetPath: 'assets/pro/portraits/usopp_normal.webp',
    unitId: 'usopp'
  });

  const wave1BossIds = ['morgan', 'buggy', 'arlong'];
  const bossCoreEmotions = ['normal', 'angry', 'battle_cry'];
  for (const bid of wave1BossIds) {
    pushSpec({
      id: `sprite:${bid}_base`,
      category: 'sprite',
      wave: 1,
      tier: 'tier2_boss',
      bundle: `battle_${bid}`,
      assetPath: `assets/pro/sprites/${bid}_base.webp`,
      metaPath: `assets/pro/sprites/${bid}_base.json`,
      unitId: bid,
      formId: 'base'
    });
    for (const emo of bossCoreEmotions) {
      pushSpec({
        id: `portrait:${bid}_${emo}`,
        category: 'portrait',
        wave: 1,
        tier: 'tier2_boss',
        bundle: `battle_${bid}`,
        assetPath: `assets/pro/portraits/${bid}_${emo}.webp`,
        unitId: bid
      });
    }
    for (let li = 0; li < 4; li++) {
      pushSpec({
        id: `bg:battle_${bid}_layer${li}`,
        category: 'background',
        wave: 1,
        tier: 'env',
        bundle: `battle_${bid}`,
        assetPath: `assets/pro/backgrounds/battle_${bid}_layer${li}.webp`
      });
    }
  }

  for (const bid of ['don_krieg', 'smoker']) {
    pushSpec({
      id: `sprite:${bid}_base`,
      category: 'sprite',
      wave: 1,
      tier: 'tier2_boss',
      bundle: `battle_${bid}`,
      assetPath: `assets/pro/sprites/${bid}_base.webp`,
      metaPath: `assets/pro/sprites/${bid}_base.json`,
      unitId: bid,
      formId: 'base'
    });
    pushSpec({
      id: `portrait:${bid}_normal`,
      category: 'portrait',
      wave: 1,
      tier: 'tier2_boss',
      bundle: `battle_${bid}`,
      assetPath: `assets/pro/portraits/${bid}_normal.webp`,
      unitId: bid
    });
    pushSpec({
      id: `bg:battle_${bid}_layer0`,
      category: 'background',
      wave: 1,
      tier: 'env',
      bundle: `battle_${bid}`,
      assetPath: `assets/pro/backgrounds/battle_${bid}_layer0.webp`
    });
  }

  // --- Wave 2: Remaining 4 Master Biome Tilesets & 4 Core Hub Maps ---
  const wave2Biomes = [
    { id: 'master_stone_canal', bundle: 'island_water_seven' },
    { id: 'master_desert_palace', bundle: 'island_alabasta' },
    { id: 'master_eastern_pagoda', bundle: 'island_wano_country' },
    { id: 'master_scifi_neon', bundle: 'island_egghead' }
  ];
  for (const bm of wave2Biomes) {
    pushSpec({
      id: `tileset:${bm.id}`,
      category: 'tileset',
      wave: 2,
      tier: 'env',
      bundle: bm.bundle,
      assetPath: `assets/pro/tilesets/${bm.id}.webp`,
      metaPath: `assets/pro/tilesets/${bm.id}.tsx`
    });
  }

  const wave2Maps = [
    {
      id: 'water_seven',
      tmjStem: 'water_seven',
      islandId: 'water_seven',
      bundle: 'island_water_seven',
      dimensions: { width: 1664, height: 1152 },
      tilesets: ['tileset:master_stone_canal', 'tileset:master_port_village']
    },
    {
      id: 'alabasta',
      tmjStem: 'alabasta',
      islandId: 'alabasta',
      bundle: 'island_alabasta',
      dimensions: { width: 1600, height: 1152 },
      tilesets: ['tileset:master_desert_palace']
    },
    {
      id: 'wano_country',
      tmjStem: 'wano_country',
      islandId: 'wano_onigashima',
      bundle: 'island_wano_country',
      dimensions: { width: 1664, height: 1216 },
      tilesets: ['tileset:master_eastern_pagoda']
    },
    {
      id: 'egghead',
      tmjStem: 'egghead',
      islandId: 'egghead',
      bundle: 'island_egghead',
      dimensions: { width: 1792, height: 1280 },
      tilesets: ['tileset:master_scifi_neon']
    }
  ];
  for (const m of wave2Maps) {
    pushSpec({
      id: `map:${m.id}`,
      category: 'map',
      wave: 2,
      tier: 'env',
      bundle: m.bundle,
      assetPath: `assets/pro/maps/${m.tmjStem}.tmj`,
      metaPath: `assets/pro/maps/${m.tmjStem}.tmj`,
      dimensions: m.dimensions,
      islandId: m.islandId,
      sharedTilesetIds: m.tilesets
    });
  }

  // --- Wave 3: Remaining Straw Hat Roster & Major/Giant Bosses ---
  const strawHatWave3 = new Set(['chopper', 'robin', 'franky', 'brook', 'jinbe']);
  for (const u of units) {
    const spriteId = `sprite:${u.id}_base`;
    if (seenIds.has(spriteId)) continue;
    const isStrawHat = strawHatWave3.has(u.id);
    const isNpcPlaceholder = u.id.startsWith('unit_');
    const tier = isStrawHat ? 'tier1_crew' : isNpcPlaceholder ? 'tier3_npc' : 'tier2_boss';
    const isGiant = Number(u.entityScale ?? 1) >= 1.45;
    pushSpec({
      id: spriteId,
      category: 'sprite',
      wave: 3,
      tier,
      bundle: isStrawHat ? 'core_always' : `battle_${u.id}`,
      assetPath: `assets/pro/sprites/${u.id}_base.webp`,
      metaPath: `assets/pro/sprites/${u.id}_base.json`,
      unitId: u.id,
      formId: 'base',
      isGiant
    });
    pushSpec({
      id: `portrait:${u.id}_normal`,
      category: 'portrait',
      wave: 3,
      tier,
      bundle: isStrawHat ? 'core_always' : `battle_${u.id}`,
      assetPath: `assets/pro/portraits/${u.id}_normal.webp`,
      unitId: u.id
    });
  }

  // --- Wave 4: Remaining 12 Island Remix Maps ---
  const wave4Islands = [
    { id: 'orange_town', tileset: 'tileset:master_port_village' },
    { id: 'baratie', tileset: 'tileset:master_port_village' },
    { id: 'arlong_park', tileset: 'tileset:master_port_village' },
    { id: 'loguetown', tileset: 'tileset:master_port_village' },
    { id: 'drum_kingdom', tileset: 'tileset:master_port_village' },
    { id: 'skypiea', tileset: 'tileset:master_port_village' },
    { id: 'thriller_bark', tileset: 'tileset:master_eastern_pagoda' },
    { id: 'marineford', tileset: 'tileset:master_stone_canal' },
    { id: 'fishman_island', tileset: 'tileset:master_stone_canal' },
    { id: 'dressrosa', tileset: 'tileset:master_desert_palace' },
    { id: 'totto_land', tileset: 'tileset:master_stone_canal' },
    { id: 'elbaf', tileset: 'tileset:master_eastern_pagoda' }
  ];
  for (const isl of wave4Islands) {
    pushSpec({
      id: `map:${isl.id}`,
      category: 'map',
      wave: 4,
      tier: 'env',
      bundle: `island_${isl.id}`,
      assetPath: `assets/pro/maps/${isl.id}.tmj`,
      metaPath: `assets/pro/maps/${isl.id}.tmj`,
      islandId: isl.id,
      sharedTilesetIds: [isl.tileset]
    });
  }

  const entries = [];
  for (const spec of specs) {
    entries.push(await inspectEntryDiskState(rootDir, spec, prevById, nowIso));
  }

  // Build backward-compatible ProAssetManifestFile sections for existing loaders/tests
  const byId = new Map(entries.map((e) => [e.id, e]));
  const sprites = {};
  for (const ent of entries) {
    if (ent.category !== 'sprite' || !ent.unitId || ent.status === 'PLACEHOLDER') continue;
    const key = `${ent.unitId}_${ent.formId ?? 'base'}`;
    const atlasPath = ent.metaPath ?? `assets/pro/sprites/${key}.json`;
    const absAtlas = path.join(rootDir, 'public', atlasPath);
    let referenceIdleHeight = 61;
    if (fs.existsSync(absAtlas)) {
      try {
        const aj = readJson(absAtlas);
        if (typeof aj?.meta?.referenceIdleHeight === 'number') {
          referenceIdleHeight = aj.meta.referenceIdleHeight;
        }
      } catch {
        // fallback 61
      }
    }
    const ppuSpec = WAVE1_PPU_SPECS[ent.unitId];
    sprites[key] = {
      key,
      unitId: ent.unitId,
      formId: ent.formId ?? 'base',
      image: ent.assetPath,
      atlasJson: atlasPath,
      anchor: { x: 0.5, y: 0.9 },
      targetDisplayHeight: ppuSpec?.targetDisplayHeight ?? 112,
      ...(ppuSpec ? { ppuScale: ppuSpec.ppuScale, referenceIdleHeight } : {}),
      formatHint: 'ASEPRITE_HASH'
    };
  }

  const portraits = {};
  const cutins = {};
  for (const ent of entries) {
    if (ent.category !== 'portrait' || ent.status === 'PLACEHOLDER') continue;
    const rawKey = ent.id.replace(/^portrait:/, '');
    if (rawKey.endsWith('_cutin')) {
      const unitId = rawKey.replace(/_cutin$/, '');
      cutins[unitId] = { image: ent.assetPath };
    } else {
      portraits[rawKey] = {
        image: ent.assetPath,
        width: ent.dimensions.width || 64,
        height: ent.dimensions.height || 64
      };
    }
  }

  const maps = {};
  for (const ent of entries) {
    if (ent.category !== 'map' || !ent.islandId || ent.status === 'PLACEHOLDER') continue;
    maps[ent.islandId] = {
      mapId: ent.islandId,
      tmj: ent.assetPath,
      pixelScale: 2,
      tilesets: (ent.sharedTilesetIds ?? [])
        .map((tid) => byId.get(tid)?.assetPath)
        .filter(Boolean)
    };
  }

  const backgrounds = {};
  for (const bgId of ['east_blue_harbor', 'battle_morgan', 'battle_buggy', 'battle_arlong']) {
    const layers = [0, 1, 2, 3].map((i) => byId.get(`bg:${bgId}_layer${i}`));
    if (layers.every((l) => l && l.status !== 'PLACEHOLDER')) {
      backgrounds[bgId] = {
        bgId,
        layers: layers.map((l) => l.assetPath),
        parallaxFactors: [0.06, 0.18, 0.48, 1]
      };
    }
  }

  const vfx = {};
  for (const vs of vfxSpecs) {
    const ent = byId.get(`vfx:${vs.id}`);
    if (!ent || ent.status === 'PLACEHOLDER') continue;
    vfx[vs.id] = {
      id: vs.id,
      image: ent.assetPath,
      frameWidth: vs.frameWidth,
      frameHeight: vs.frameHeight,
      frameCount: vs.frameCount,
      fps: vs.fps,
      blendMode: vs.blendMode,
      scale: vs.scale
    };
  }

  return {
    version: '2.0.0',
    entries,
    sprites,
    portraits,
    cutins,
    maps,
    backgrounds,
    vfx
  };
}

export function readProManifest(rootDir = ROOT) {
  const srcPath = path.join(rootDir, PRO_MANIFEST_SRC_REL);
  if (!fs.existsSync(srcPath)) return null;
  return readJson(srcPath);
}

export function writeProManifestMirrors(rootDir, manifest) {
  const jsonText = `${JSON.stringify(manifest, null, 2)}\n`;
  const srcPath = path.join(rootDir, PRO_MANIFEST_SRC_REL);
  const pubPath = path.join(rootDir, PRO_MANIFEST_PUBLIC_REL);
  fs.mkdirSync(path.dirname(srcPath), { recursive: true });
  fs.mkdirSync(path.dirname(pubPath), { recursive: true });
  fs.writeFileSync(srcPath, jsonText, 'utf-8');
  fs.writeFileSync(pubPath, jsonText, 'utf-8');
}

export async function syncProManifestFiles(rootDir = ROOT) {
  const existing = readProManifest(rootDir);
  const next = await buildProManifestCatalog(rootDir, existing);
  writeProManifestMirrors(rootDir, next);
  return next;
}

export function computeManifestSummary(manifest) {
  const byWave = new Map();
  const byCategory = new Map();
  const byBundle = new Map();
  let total = 0;
  let placeholder = 0;
  let imported = 0;
  let verified = 0;
  let totalDiskBytes = 0;
  let totalVramBytes = 0;

  const bump = (map, key, ent) => {
    let row = map.get(key);
    if (!row) {
      row = {
        key,
        total: 0,
        placeholder: 0,
        imported: 0,
        verified: 0,
        diskBytes: 0,
        vramBytes: 0
      };
      map.set(key, row);
    }
    row.total += 1;
    if (ent.status === 'PLACEHOLDER') row.placeholder += 1;
    else if (ent.status === 'IMPORTED') row.imported += 1;
    else if (ent.status === 'VERIFIED') row.verified += 1;
    row.diskBytes += ent.fileSizeBytes ?? 0;
    row.vramBytes += ent.estimatedVramBytes ?? 0;
  };

  for (const ent of manifest.entries ?? []) {
    total += 1;
    if (ent.status === 'PLACEHOLDER') placeholder += 1;
    else if (ent.status === 'IMPORTED') imported += 1;
    else if (ent.status === 'VERIFIED') verified += 1;
    totalDiskBytes += ent.fileSizeBytes ?? 0;
    totalVramBytes += ent.estimatedVramBytes ?? 0;
    bump(byWave, `Wave ${ent.wave}`, ent);
    bump(byCategory, ent.category, ent);
    bump(byBundle, ent.bundle, ent);
  }

  return {
    total,
    placeholder,
    imported,
    verified,
    totalDiskBytes,
    totalVramBytes,
    byWave: Array.from(byWave.values()).sort((a, b) => a.key.localeCompare(b.key)),
    byCategory: Array.from(byCategory.values()).sort((a, b) => a.key.localeCompare(b.key)),
    byBundle: Array.from(byBundle.values()).sort((a, b) => a.key.localeCompare(b.key))
  };
}

export async function validateProManifest(rootDir = ROOT) {
  const errors = [];
  const srcPath = path.join(rootDir, PRO_MANIFEST_SRC_REL);
  const pubPath = path.join(rootDir, PRO_MANIFEST_PUBLIC_REL);

  if (!fs.existsSync(srcPath)) {
    errors.push(`Missing ${PRO_MANIFEST_SRC_REL}`);
    return { errors, manifest: null };
  }
  if (!fs.existsSync(pubPath)) {
    errors.push(`Missing mirrored ${PRO_MANIFEST_PUBLIC_REL}`);
  } else if (fs.readFileSync(srcPath, 'utf-8') !== fs.readFileSync(pubPath, 'utf-8')) {
    errors.push(`${PRO_MANIFEST_SRC_REL} and ${PRO_MANIFEST_PUBLIC_REL} are out of sync`);
  }

  const manifest = readJson(srcPath);
  const entries = manifest.entries ?? [];
  const seenIds = new Set();
  const seenAssetPaths = new Set();

  for (const ent of entries) {
    if (!ent.id || seenIds.has(ent.id)) {
      errors.push(`Duplicate or empty entry id: "${ent.id}"`);
      continue;
    }
    seenIds.add(ent.id);

    const normAsset = normalizeAssetRel(ent.assetPath ?? '');
    if (!normAsset || seenAssetPaths.has(normAsset)) {
      errors.push(`Duplicate or empty assetPath on "${ent.id}": "${ent.assetPath}"`);
    }
    seenAssetPaths.add(normAsset);

    if (ent.status === 'PLACEHOLDER') continue;

    const relUnderRoot = `public/${normAsset}`;
    if (!existsStrictCase(rootDir, relUnderRoot)) {
      errors.push(`[${ent.id}] Missing or case-mismatched asset on disk: "${relUnderRoot}"`);
      continue;
    }

    const absAsset = path.join(rootDir, relUnderRoot);
    const stat = fs.statSync(absAsset);
    if (stat.size <= 0) {
      errors.push(`[${ent.id}] Asset file is empty: "${relUnderRoot}"`);
    }

    const lower = normAsset.toLowerCase();
    if (lower.endsWith('.png') || lower.endsWith('.webp')) {
      try {
        const dims = await getImageMetadata(absAsset);
        validateAtlasResolution(ent, dims);
        if (
          ent.dimensions?.width !== dims.width ||
          ent.dimensions?.height !== dims.height
        ) {
          errors.push(
            `[${ent.id}] Dimension mismatch: manifest=${ent.dimensions?.width}x${ent.dimensions?.height}, disk=${dims.width}x${dims.height}`
          );
        }
      } catch (err) {
        errors.push(`[${ent.id}] ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    if (ent.metaPath) {
      const normMeta = normalizeAssetRel(ent.metaPath);
      const relMeta = `public/${normMeta}`;
      if (!existsStrictCase(rootDir, relMeta)) {
        errors.push(`[${ent.id}] Missing or case-mismatched metaPath: "${relMeta}"`);
        continue;
      }
      const absMeta = path.join(rootDir, relMeta);
      const metaDir = path.dirname(absMeta);

      if (ent.category === 'sprite' && normMeta.toLowerCase().endsWith('.json')) {
        const metaJson = readJson(absMeta);
        const linkedImg = metaJson?.meta?.image ?? metaJson?.image;
        if (typeof linkedImg !== 'string' || !linkedImg) {
          errors.push(`[${ent.id}] Sprite JSON missing meta.image / image in "${relMeta}"`);
        } else {
          const resolvedRel = path.relative(
            rootDir,
            path.resolve(metaDir, linkedImg)
          ).split(path.sep).join('/');
          if (!existsStrictCase(rootDir, resolvedRel)) {
            errors.push(`[${ent.id}] Broken sprite JSON image link: "${linkedImg}" -> "${resolvedRel}"`);
          }
        }
      } else if (ent.category === 'tileset' && normMeta.toLowerCase().endsWith('.tsx')) {
        const xml = fs.readFileSync(absMeta, 'utf-8');
        const tsxSource = parseTsxImageSource(xml);
        if (!tsxSource) {
          errors.push(`[${ent.id}] External .tsx missing <image source="...">: "${relMeta}"`);
        } else {
          const resolvedRel = path.relative(
            rootDir,
            path.resolve(metaDir, tsxSource)
          ).split(path.sep).join('/');
          if (!existsStrictCase(rootDir, resolvedRel)) {
            errors.push(`[${ent.id}] Broken .tsx image source: "${tsxSource}" -> "${resolvedRel}"`);
          }
        }
      } else if (ent.category === 'map' && normMeta.toLowerCase().endsWith('.tmj')) {
        const tmj = readJson(absMeta);
        for (const ts of tmj.tilesets ?? []) {
          if (typeof ts.image === 'string' && ts.image) {
            errors.push(`[${ent.id}] Embedded tileset image forbidden in .tmj "${ts.name ?? ts.firstgid}": "${ts.image}"`);
          }
          if (!ts.source || typeof ts.source !== 'string') {
            errors.push(`[${ent.id}] .tmj tileset missing external .tsx source (firstgid=${ts.firstgid})`);
            continue;
          }
          const absTsx = path.resolve(metaDir, ts.source);
          const relTsx = path.relative(rootDir, absTsx).split(path.sep).join('/');
          if (!existsStrictCase(rootDir, relTsx)) {
            errors.push(`[${ent.id}] Missing external tileset source in .tmj: "${relTsx}"`);
          } else if (relTsx.toLowerCase().endsWith('.tsx')) {
            const tsxImg = parseTsxImageSource(fs.readFileSync(absTsx, 'utf-8'));
            if (!tsxImg) {
              errors.push(`[${ent.id}] External .tsx missing <image source="...">: "${relTsx}"`);
            } else {
              const absTsxImg = path.resolve(path.dirname(absTsx), tsxImg);
              const relTsxImg = path.relative(rootDir, absTsxImg).split(path.sep).join('/');
              if (!existsStrictCase(rootDir, relTsxImg)) {
                errors.push(`[${ent.id}] Broken .tsx image link "${tsxImg}" -> "${relTsxImg}"`);
              } else if (relTsxImg.toLowerCase().endsWith('.webp') || relTsxImg.toLowerCase().endsWith('.png')) {
                const tsxDims = await getImageMetadata(absTsxImg);
                validateAtlasResolution({ id: `${ent.id}->${ts.source}`, category: 'tileset' }, tsxDims);
              }
            }
          }
        }
        const checkObjectGroupTemplates = (layers) => {
          for (const layer of layers ?? []) {
            if (layer.type === 'group' && Array.isArray(layer.layers)) {
              checkObjectGroupTemplates(layer.layers);
              continue;
            }
            if (layer.type === 'objectgroup' && Array.isArray(layer.objects)) {
              for (const obj of layer.objects) {
                if (typeof obj.template === 'string' && obj.template) {
                  const absTpl = path.resolve(metaDir, obj.template);
                  const relTpl = path.relative(rootDir, absTpl).split(path.sep).join('/');
                  if (!existsStrictCase(rootDir, relTpl)) {
                    errors.push(`[${ent.id}] Missing .tx template "${obj.template}" -> "${relTpl}"`);
                  }
                }
              }
            }
          }
        };
        checkObjectGroupTemplates(tmj.layers);
      }
    }
  }

  // Ensure zero redundant PNG+WebP duplicates exist in public/assets/pro/
  const proRoot = path.join(rootDir, 'public', 'assets', 'pro');
  if (fs.existsSync(proRoot)) {
    const stack = [proRoot];
    while (stack.length > 0) {
      const dir = stack.pop();
      for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, ent.name);
        if (ent.isDirectory()) {
          stack.push(full);
        } else if (ent.name.toLowerCase().endsWith('.png')) {
          const webpSibling = full.replace(/\.png$/i, '.webp');
          if (fs.existsSync(webpSibling)) {
            errors.push(`Redundant PNG+WebP duplicate detected: "${path.relative(rootDir, full)}"`);
          }
        }
      }
    }
  }

  return { errors, manifest };
}

export async function verifyManifestEntries(rootDir, targetIds) {
  if (!targetIds || targetIds.length === 0) {
    throw new Error('Usage: npm run assets:verify -- --id=sprite:luffy_base');
  }
  const manifest = readProManifest(rootDir);
  if (!manifest) {
    throw new Error(`Missing ${PRO_MANIFEST_SRC_REL}`);
  }
  const byId = new Map((manifest.entries ?? []).map((e) => [e.id, e]));
  const nowIso = new Date().toISOString();

  for (const id of targetIds) {
    const ent = byId.get(id);
    if (!ent) {
      throw new Error(`Unknown manifest entry id: "${id}"`);
    }
    if (ent.status === 'PLACEHOLDER') {
      throw new Error(`Cannot verify PLACEHOLDER entry "${id}": import actual asset first`);
    }
    const relAsset = `public/${normalizeAssetRel(ent.assetPath)}`;
    if (!existsStrictCase(rootDir, relAsset)) {
      throw new Error(`Cannot verify "${id}": missing asset file "${relAsset}"`);
    }
    if (ent.assetPath.toLowerCase().endsWith('.png') || ent.assetPath.toLowerCase().endsWith('.webp')) {
      const dims = await getImageMetadata(path.join(rootDir, relAsset));
      validateAtlasResolution(ent, dims);
    }
    ent.status = 'VERIFIED';
    ent.updatedAt = nowIso;
  }

  writeProManifestMirrors(rootDir, manifest);
  const { errors } = await validateProManifest(rootDir);
  if (errors.length > 0) {
    throw new Error(`Verification aborted due to validation errors:\n- ${errors.join('\n- ')}`);
  }
  return targetIds;
}

function formatTableRow(cols, widths) {
  return cols.map((c, i) => String(c).padEnd(widths[i] ?? 10)).join(' | ');
}

export function printStatusReport(manifest) {
  const s = computeManifestSummary(manifest);
  const pct = (n, d) => (d > 0 ? `${((n / d) * 100).toFixed(1)}%` : '0.0%');
  const mb = (b) => `${(b / (1024 * 1024)).toFixed(2)} MB`;

  console.log(`\n📊 Pro Asset Manifest Status (v${manifest.version}) — Total: ${s.total} entries`);
  console.log(
    `   • VERIFIED: ${s.verified} (${pct(s.verified, s.total)}) | IMPORTED: ${s.imported} (${pct(s.imported, s.total)}) | PLACEHOLDER: ${s.placeholder} (${pct(s.placeholder, s.total)})`
  );
  console.log(
    `   • Disk Footprint: ${mb(s.totalDiskBytes)} | Full Estimated VRAM (if all loaded): ${mb(s.totalVramBytes)}\n`
  );

  const wWidths = [10, 6, 11, 8, 8, 8, 10, 10];
  console.log(
    formatTableRow(['Wave', 'Total', 'Placeholder', 'Imported', 'Verified', 'Ready%', 'Disk', 'VRAM'], wWidths)
  );
  console.log('-'.repeat(86));
  for (const r of s.byWave) {
    const ready = r.imported + r.verified;
    console.log(
      formatTableRow(
        [r.key, r.total, r.placeholder, r.imported, r.verified, pct(ready, r.total), mb(r.diskBytes), mb(r.vramBytes)],
        wWidths
      )
    );
  }

  console.log('\nBy Category:');
  const cWidths = [12, 6, 11, 8, 8, 8, 10, 10];
  console.log(
    formatTableRow(['Category', 'Total', 'Placeholder', 'Imported', 'Verified', 'Ready%', 'Disk', 'VRAM'], cWidths)
  );
  console.log('-'.repeat(88));
  for (const r of s.byCategory) {
    const ready = r.imported + r.verified;
    console.log(
      formatTableRow(
        [r.key, r.total, r.placeholder, r.imported, r.verified, pct(ready, r.total), mb(r.diskBytes), mb(r.vramBytes)],
        cWidths
      )
    );
  }

  console.log('\nActive Bundles (Imported + Verified):');
  const bWidths = [26, 7, 10, 10];
  console.log(formatTableRow(['Bundle', 'Assets', 'Disk', 'Est. VRAM'], bWidths));
  console.log('-'.repeat(62));
  for (const b of s.byBundle) {
    const ready = b.imported + b.verified;
    if (ready === 0) continue;
    console.log(formatTableRow([b.key, ready, mb(b.diskBytes), mb(b.vramBytes)], bWidths));
  }
  console.log('');
}

async function runCli() {
  const cmd = process.argv[2] ?? 'status';
  if (cmd === 'sync') {
    const next = await syncProManifestFiles(ROOT);
    console.log(`✅ Synced ${PRO_MANIFEST_SRC_REL} & ${PRO_MANIFEST_PUBLIC_REL} (${next.entries.length} entries)`);
    return;
  }
  if (cmd === 'status') {
    let manifest = readProManifest(ROOT);
    if (!manifest) {
      manifest = await syncProManifestFiles(ROOT);
    }
    printStatusReport(manifest);
    return;
  }
  if (cmd === 'verify') {
    const ids = [];
    for (const arg of process.argv.slice(3)) {
      if (arg.startsWith('--id=')) {
        for (const piece of arg.slice(5).split(',')) {
          if (piece.trim()) ids.push(piece.trim());
        }
      }
    }
    const verified = await verifyManifestEntries(ROOT, ids);
    console.log(`✅ Verified ${verified.length} pro asset(s): ${verified.join(', ')}`);
    return;
  }
  if (cmd === 'validate') {
    const { errors, manifest } = await validateProManifest(ROOT);
    if (errors.length > 0) {
      console.error(`\n❌ Pro Asset Validation FAILED (${errors.length} error(s)):\n`);
      for (const e of errors) console.error(`  - ${e}`);
      process.exit(1);
    }
    const s = computeManifestSummary(manifest);
    console.log(
      `✅ Pro Asset Validation PASSED (0 errors, strict case-sensitive)! Entries: ${s.total} (VERIFIED=${s.verified}, IMPORTED=${s.imported}, PLACEHOLDER=${s.placeholder})`
    );
    return;
  }
  console.error(`Unknown pro-manifest-cli command "${cmd}". Expected: status | verify | validate | sync`);
  process.exit(1);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
  runCli().catch((err) => {
    console.error('❌ pro-manifest-cli failed:', err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
