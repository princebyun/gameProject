import fs from 'node:fs';
import path from 'node:path';
import { encodeLosslessWebpBuffer } from '../optimize-pro-assets.mjs';
import {
  promoteExternalGridSheetToPro,
  refreshExistingProSpritePivots,
  WAVE1_PPU_SPECS
} from './wave1ProPromoter.mjs';

/**
 * Unified PPU calibration table relative to Luffy (1.0x = 108px target display height).
 * Covers Wave 0/1 East Blue core, all 10 Straw Hat crew, external NDS Wave 3 bosses,
 * and reserved giant boss specs (PLACEHOLDER until dropped in raw_assets/packs/).
 */
export const ROSTER_PPU_SPECS = Object.freeze({
  ...WAVE1_PPU_SPECS,
  // Wave 1 remaining external NDS
  usopp: { ppuScale: 0.98, targetDisplayHeight: 106 },
  don_krieg: { ppuScale: 1.25, targetDisplayHeight: 135 },
  smoker: { ppuScale: 1.15, targetDisplayHeight: 124 },
  // Wave 3 Straw Hat crew (10/10 complete with external NDS sheets, calibrated to Luffy 1.0x = 108px)
  chopper: { ppuScale: 0.68, targetDisplayHeight: 73 },
  robin: { ppuScale: 1.06, targetDisplayHeight: 114 },
  franky: { ppuScale: 1.26, targetDisplayHeight: 136 },
  brook: { ppuScale: 1.22, targetDisplayHeight: 132 },
  jinbe: { ppuScale: 1.3, targetDisplayHeight: 140 },
  // Wave 3 external NDS bosses & allies
  wapol: { ppuScale: 1.15, targetDisplayHeight: 124 },
  crocodile: { ppuScale: 1.16, targetDisplayHeight: 125 },
  enel: { ppuScale: 1.14, targetDisplayHeight: 123 },
  lucci: { ppuScale: 1.1, targetDisplayHeight: 119 },
  kaku: { ppuScale: 1.08, targetDisplayHeight: 117 },
  moria: { ppuScale: 1.35, targetDisplayHeight: 146 },
  akainu: { ppuScale: 1.2, targetDisplayHeight: 130 },
  aokiji: { ppuScale: 1.18, targetDisplayHeight: 127 },
  kizaru: { ppuScale: 1.2, targetDisplayHeight: 130 },
  blackbeard: { ppuScale: 1.3, targetDisplayHeight: 140 },
  marco: { ppuScale: 1.08, targetDisplayHeight: 117 },
  hody_jones: { ppuScale: 1.24, targetDisplayHeight: 134 },
  doflamingo: { ppuScale: 1.18, targetDisplayHeight: 127 },
  law: { ppuScale: 1.06, targetDisplayHeight: 114 },
  magellan: { ppuScale: 1.32, targetDisplayHeight: 143 },
  // Reserved specs for unacquired Wave 3 bosses (remain PLACEHOLDER)
  kaido: { ppuScale: 1.65, targetDisplayHeight: 178 },
  king: { ppuScale: 1.3, targetDisplayHeight: 140 },
  katakuri: { ppuScale: 1.35, targetDisplayHeight: 146 },
  saturn: { ppuScale: 1.6, targetDisplayHeight: 173 },
  loki: { ppuScale: 1.72, targetDisplayHeight: 186 },
  s_hawk: { ppuScale: 1.12, targetDisplayHeight: 121 },
  blueno: { ppuScale: 1.18, targetDisplayHeight: 127 },
  doppelman: { ppuScale: 1.15, targetDisplayHeight: 124 }
});

/**
 * Reserved Wave 3 giant crew forms (auxiliary party_* slots, NEVER core_always)
 * and giant/awakened boss forms (2048x2048 cap for giant tier, PLACEHOLDER until external drop).
 */
export const WAVE3_RESERVED_FORM_SPECS = Object.freeze([
  {
    key: 'chopper_monster_point',
    unitId: 'chopper',
    formId: 'monster_point',
    wave: 3,
    tier: 'tier1_crew',
    bundle: 'party_chopper',
    ppuScale: 1.9,
    targetDisplayHeight: 205,
    isGiant: true
  },
  {
    key: 'robin_demonio_fleur',
    unitId: 'robin',
    formId: 'demonio_fleur',
    wave: 3,
    tier: 'tier1_crew',
    bundle: 'party_robin',
    ppuScale: 1.55,
    targetDisplayHeight: 167,
    isGiant: true
  },
  {
    key: 'franky_general',
    unitId: 'franky',
    formId: 'general',
    wave: 3,
    tier: 'tier1_crew',
    bundle: 'party_franky',
    ppuScale: 1.56,
    targetDisplayHeight: 168,
    isGiant: true
  },
  {
    key: 'lucci_awakened',
    unitId: 'lucci',
    formId: 'awakened',
    wave: 3,
    tier: 'tier2_boss',
    bundle: 'battle_lucci',
    ppuScale: 1.24,
    targetDisplayHeight: 134,
    isGiant: false
  },
  {
    key: 'kaido_dragon',
    unitId: 'kaido',
    formId: 'dragon',
    wave: 3,
    tier: 'tier2_boss',
    bundle: 'battle_kaido',
    ppuScale: 1.85,
    targetDisplayHeight: 200,
    isGiant: true
  },
  {
    key: 'saturn_yokai',
    unitId: 'saturn',
    formId: 'yokai',
    wave: 3,
    tier: 'tier2_boss',
    bundle: 'battle_saturn',
    ppuScale: 1.9,
    targetDisplayHeight: 205,
    isGiant: true
  },
  {
    key: 'loki_giant',
    unitId: 'loki',
    formId: 'giant',
    wave: 3,
    tier: 'tier2_boss',
    bundle: 'battle_loki',
    ppuScale: 2.1,
    targetDisplayHeight: 226,
    isGiant: true
  }
]);

export const WAVE3_BOSS_CORE_PORTRAIT_PLACEHOLDERS = Object.freeze([
  'katakuri',
  'kaido',
  'saturn',
  'loki'
]);

export const WAVE1_REMAINING_EXTERNAL_CREW = ['usopp'];
export const WAVE1_REMAINING_EXTERNAL_BOSSES = ['don_krieg', 'smoker'];

export const WAVE3_EXTERNAL_CREW_IDS = ['chopper', 'robin', 'franky', 'brook', 'jinbe'];

export const WAVE3_EXTERNAL_BOSS_IDS = [
  'wapol',
  'crocodile',
  'enel',
  'lucci',
  'kaku',
  'moria',
  'akainu',
  'aokiji',
  'kizaru',
  'blackbeard',
  'marco',
  'hody_jones',
  'doflamingo',
  'law',
  'magellan'
];

export const WAVE3_EXTERNAL_FORM_SPECS = Object.freeze([
  {
    key: 'luffy_form_luffy_gear5',
    unitId: 'luffy',
    formId: 'form_luffy_gear5',
    wave: 3,
    tier: 'tier1_crew',
    bundle: 'core_always',
    ppuScale: 1.1,
    targetDisplayHeight: 118,
    isGiant: false
  },
  {
    key: 'zoro_form_zoro_king_of_hell',
    unitId: 'zoro',
    formId: 'form_zoro_king_of_hell',
    wave: 3,
    tier: 'tier1_crew',
    bundle: 'party_zoro',
    ppuScale: 1.12,
    targetDisplayHeight: 120,
    isGiant: false
  },
  {
    key: 'sanji_form_sanji_diable_jambe',
    unitId: 'sanji',
    formId: 'form_sanji_diable_jambe',
    wave: 3,
    tier: 'tier1_crew',
    bundle: 'party_sanji',
    ppuScale: 1.08,
    targetDisplayHeight: 116,
    isGiant: false
  },
  {
    key: 'enel_form_enel_amuru',
    unitId: 'enel',
    formId: 'form_enel_amuru',
    wave: 3,
    tier: 'tier2_boss',
    bundle: 'battle_enel',
    ppuScale: 1.46,
    targetDisplayHeight: 158,
    isGiant: true
  },
  {
    key: 'lucci_form_lucci_hybrid',
    unitId: 'lucci',
    formId: 'form_lucci_hybrid',
    wave: 3,
    tier: 'tier2_boss',
    bundle: 'battle_lucci',
    ppuScale: 1.18,
    targetDisplayHeight: 128,
    isGiant: false
  },
  {
    key: 'marco_form_marco_phoenix',
    unitId: 'marco',
    formId: 'form_marco_phoenix',
    wave: 3,
    tier: 'tier2_boss',
    bundle: 'battle_marco',
    ppuScale: 1.26,
    targetDisplayHeight: 136,
    isGiant: false
  },
  {
    key: 'law_form_law_kroom',
    unitId: 'law',
    formId: 'form_law_kroom',
    wave: 3,
    tier: 'tier2_boss',
    bundle: 'battle_law',
    ppuScale: 1.11,
    targetDisplayHeight: 120,
    isGiant: false
  },
  {
    key: 'doflamingo_form_doflamingo_awakening',
    unitId: 'doflamingo',
    formId: 'form_doflamingo_awakening',
    wave: 3,
    tier: 'tier2_boss',
    bundle: 'battle_doflamingo',
    ppuScale: 1.22,
    targetDisplayHeight: 132,
    isGiant: false
  }
]);

export const WORLD_ARENA_BACKDROP_IDS = Object.freeze([
  'drum_snow_peak',
  'alabasta_desert',
  'skypiea_upper_yard',
  'water7_dock',
  'thriller_bark_gothic',
  'marineford_ice_bay',
  'fishman_island_seabed',
  'dressrosa_colosseum',
  'whole_cake_mirror',
  'onigashima_rooftop',
  'egghead_lab',
  'elbaf_underworld',
  'impel_down_hell'
]);

/**
 * Canonical 4-layer arena backdrop shared by each Wave 3 boss bundle via `sharedAssetIds`
 * (zero duplicate disk textures + automatic URL reference counting across shared arenas).
 */
export const BOSS_ARENA_BACKDROP_MAP = Object.freeze({
  wapol: 'drum_snow_peak',
  crocodile: 'alabasta_desert',
  enel: 'skypiea_upper_yard',
  blueno: 'water7_dock',
  lucci: 'water7_dock',
  kaku: 'water7_dock',
  moria: 'thriller_bark_gothic',
  doppelman: 'thriller_bark_gothic',
  akainu: 'marineford_ice_bay',
  aokiji: 'marineford_ice_bay',
  kizaru: 'marineford_ice_bay',
  blackbeard: 'marineford_ice_bay',
  marco: 'marineford_ice_bay',
  hody_jones: 'fishman_island_seabed',
  doflamingo: 'dressrosa_colosseum',
  law: 'dressrosa_colosseum',
  katakuri: 'whole_cake_mirror',
  kaido: 'onigashima_rooftop',
  king: 'onigashima_rooftop',
  saturn: 'egghead_lab',
  s_hawk: 'egghead_lab',
  loki: 'elbaf_underworld',
  magellan: 'impel_down_hell'
});

const CREW_EMOTIONS = [
  'normal',
  'angry',
  'determined',
  'shocked',
  'smirk',
  'sad',
  'excited',
  'battle_cry'
];
const BOSS_CORE_EMOTIONS = ['normal', 'angry', 'battle_cry'];

/**
 * Promotes ONLY authentic `EXTERNAL_WEB_SHEET` NDS sheets for remaining Wave 1 units,
 * Wave 3 Straw Hat crew, Wave 3 bosses/allies, and 8 awakened/transform forms.
 * Never promotes procedural rig sprites (`morgan`, `kaido`, `saturn`, `loki`, etc.).
 */
export async function promoteWave3RosterSprites(rootDir) {
  const spritesDir = path.join(rootDir, 'public/assets/pro/sprites');
  const results = [];

  const baseTargets = [
    ...WAVE1_REMAINING_EXTERNAL_CREW.map((unitId) => ({ unitId, prefix: 'wave1' })),
    ...WAVE1_REMAINING_EXTERNAL_BOSSES.map((unitId) => ({ unitId, prefix: 'wave1' })),
    ...WAVE3_EXTERNAL_CREW_IDS.map((unitId) => ({ unitId, prefix: 'wave3' })),
    ...WAVE3_EXTERNAL_BOSS_IDS.map((unitId) => ({ unitId, prefix: 'wave3' }))
  ];

  for (const target of baseTargets) {
    const key = `${target.unitId}_base`;
    const ppuSpec = ROSTER_PPU_SPECS[target.unitId] ?? { ppuScale: 1.0, targetDisplayHeight: 108 };
    const webpExists = fs.existsSync(path.join(spritesDir, `${key}.webp`));
    const jsonExists = fs.existsSync(path.join(spritesDir, `${key}.json`));
    if (webpExists && jsonExists) {
      const refreshed = await refreshExistingProSpritePivots(rootDir, key, target.unitId, {
        ppuSpec,
        debugPrefix: target.prefix
      });
      if (refreshed) results.push(refreshed);
    } else {
      const res = await promoteExternalGridSheetToPro(rootDir, key, target.unitId, {
        ppuSpec,
        debugPrefix: target.prefix,
        isGiant: false
      });
      if (res) results.push(res);
    }
  }

  for (const formSpec of WAVE3_EXTERNAL_FORM_SPECS) {
    const ppuSpec = {
      ppuScale: formSpec.ppuScale,
      targetDisplayHeight: formSpec.targetDisplayHeight
    };
    const webpExists = fs.existsSync(path.join(spritesDir, `${formSpec.key}.webp`));
    const jsonExists = fs.existsSync(path.join(spritesDir, `${formSpec.key}.json`));
    if (webpExists && jsonExists) {
      const refreshed = await refreshExistingProSpritePivots(rootDir, formSpec.key, formSpec.unitId, {
        ppuSpec,
        debugPrefix: 'wave3'
      });
      if (refreshed) results.push(refreshed);
    } else {
      const res = await promoteExternalGridSheetToPro(rootDir, formSpec.key, formSpec.unitId, {
        ppuSpec,
        debugPrefix: 'wave3',
        isGiant: formSpec.isGiant
      });
      if (res) results.push(res);
    }
  }

  return results;
}

/**
 * Promotes authentic NDS OPGB2_Mugs.png portraits ONLY for verified external units.
 * Writes lossless WebP directly without temporary PNG deletion loops.
 */
export async function promoteWave3ExternalPortraits(rootDir) {
  const srcDir = path.join(rootDir, 'public/assets/portraits');
  const outDir = path.join(rootDir, 'public/assets/pro/portraits');
  fs.mkdirSync(outDir, { recursive: true });

  const targets = [];
  for (const crewId of [...WAVE1_REMAINING_EXTERNAL_CREW, ...WAVE3_EXTERNAL_CREW_IDS]) {
    for (const emo of CREW_EMOTIONS) {
      targets.push(`${crewId}_${emo}.png`);
    }
  }
  for (const bossId of [...WAVE1_REMAINING_EXTERNAL_BOSSES, ...WAVE3_EXTERNAL_BOSS_IDS]) {
    for (const emo of BOSS_CORE_EMOTIONS) {
      targets.push(`${bossId}_${emo}.png`);
    }
  }

  let copied = 0;
  for (const fname of targets) {
    const src = path.join(srcDir, fname);
    const outWebp = path.join(outDir, fname.replace(/\.png$/i, '.webp'));
    if (fs.existsSync(src) && !fs.existsSync(outWebp)) {
      const webpBuf = await encodeLosslessWebpBuffer(fs.readFileSync(src));
      fs.writeFileSync(outWebp, webpBuf);
      copied += 1;
    }
  }
  return copied;
}

/**
 * Promotes external CC0 4-layer parallax backdrops for remaining Wave 1 bosses
 * (`battle_don_krieg`, `battle_smoker`) and all 13 canonical Grand Line / New World / Endgame arenas.
 * Writes lossless WebP directly into public/assets/pro/backgrounds/.
 */
export async function promoteWorldArena4LayerBackdrops(rootDir) {
  const outDir = path.join(rootDir, 'public/assets/pro/backgrounds');
  const bgSrcRoot = path.join(rootDir, 'public/assets/backgrounds');
  const rawCloudsPng = path.join(rootDir, 'raw_assets/pro_originals/backgrounds/east_blue_harbor_layer1.png');
  const rawHarborSkyPng = path.join(rootDir, 'raw_assets/pro_originals/backgrounds/east_blue_harbor_layer0.png');
  if (!fs.existsSync(rawCloudsPng) || !fs.existsSync(rawHarborSkyPng)) {
    return 0;
  }

  const specs = [
    {
      bgId: 'battle_don_krieg',
      layers: [
        rawHarborSkyPng,
        rawCloudsPng,
        path.join(bgSrcRoot, 'water7_dock/mid.png'),
        path.join(bgSrcRoot, 'east_blue_harbor/ground.png')
      ]
    },
    {
      bgId: 'battle_smoker',
      layers: [
        path.join(bgSrcRoot, 'thriller_bark_gothic/sky.png'),
        rawCloudsPng,
        path.join(bgSrcRoot, 'east_blue_harbor/mid.png'),
        path.join(bgSrcRoot, 'water7_dock/ground.png')
      ]
    },
    ...WORLD_ARENA_BACKDROP_IDS.map((arenaId) => ({
      bgId: arenaId,
      layers: [
        path.join(bgSrcRoot, `${arenaId}/sky.png`),
        rawCloudsPng,
        path.join(bgSrcRoot, `${arenaId}/mid.png`),
        path.join(bgSrcRoot, `${arenaId}/ground.png`)
      ]
    }))
  ];

  fs.mkdirSync(outDir, { recursive: true });
  let built = 0;
  for (const s of specs) {
    if (s.layers.some((f) => !fs.existsSync(f))) continue;
    for (let i = 0; i < 4; i++) {
      const destWebp = path.join(outDir, `${s.bgId}_layer${i}.webp`);
      if (fs.existsSync(destWebp)) continue;
      const webpBuf = await encodeLosslessWebpBuffer(fs.readFileSync(s.layers[i]));
      fs.writeFileSync(destWebp, webpBuf);
    }
    built += 1;
  }
  return built;
}
