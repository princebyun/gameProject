import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  blit,
  createImage,
  decodePng,
  encodeImageToPng,
  isValidPngBuffer,
  resizeNearest
} from './lib/pngCodec.mjs';
import { extractZipToDir } from './lib/zipReader.mjs';
import { normalizeSpriteSheet } from './lib/spriteSheetProcessor.mjs';
import { buildLayeredBiomeTileset } from './lib/tilesetAtlasBuilder.mjs';
import { buildParallaxBackdropSet, normalizeVfxStrip } from './lib/backdropVfxBuilder.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const RAW_DIR = path.join(ROOT, 'raw_assets/web');

const DEFAULT_HEADERS = {
  'User-Agent': 'OnePieceGrandVoyage-AssetCollector/1.0'
};

function isValidAudioBuffer(buf) {
  if (!Buffer.isBuffer(buf) || buf.byteLength < 512) return false;
  // OggS, ID3, MP3 frame sync (FF FB / FF F3 / FF F2), or RIFF
  const h4 = buf.toString('ascii', 0, 4);
  if (h4 === 'OggS' || h4 === 'RIFF' || buf.toString('ascii', 0, 3) === 'ID3') return true;
  if (buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0) return true;
  return false;
}

async function fetchCachedBinary(url, relCachePath, validatorFn, extraHeaders = {}) {
  const dest = path.join(RAW_DIR, relCachePath);
  if (fs.existsSync(dest)) {
    const cached = fs.readFileSync(dest);
    if (validatorFn(cached)) return cached;
  }
  const res = await fetch(url, {
    redirect: 'follow',
    headers: { ...DEFAULT_HEADERS, ...extraHeaders }
  });
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} for ${url}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  if (!validatorFn(buf)) {
    throw new Error(`Validation failed (HTML/corrupt response?) for ${url}`);
  }
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.writeFileSync(dest, buf);
  return buf;
}

async function fetchPng(url, relCachePath, extraHeaders = {}) {
  const buf = await fetchCachedBinary(url, relCachePath, isValidPngBuffer, extraHeaders);
  return { buf, img: decodePng(buf) };
}

const SP_BASE = 'https://raw.githubusercontent.com/sparklinlabs/superpowers-asset-packs/master';
const KENNEY_AUDIO_BASE = 'https://raw.githubusercontent.com/iwenzhou/kenney/master/Audio%20(295%20files)';
const KENNEY_ART_BASE = 'https://raw.githubusercontent.com/iwenzhou/kenney/master/Art%20(5190%20files)/RPG%20pack%20(230%20assets)/PNG';
const HL_BASE = 'https://raw.githubusercontent.com/HoangLong256/pixel-buildings/main/buildings';
const PARALLAX_BASE = 'https://raw.githubusercontent.com/Corrosive-Games/bevy-parallax/main/assets';
const SDB_HEADERS = { Referer: 'https://spritedatabase.net/' };

const SDB_CHARACTER_SHEETS = [
  { key: 'luffy_base', url: 'https://spritedatabase.net/files/ds/2000/Sprite/MonkeyDLuffy.png', targetDisplayHeight: 108 },
  { key: 'luffy_form_luffy_gear5', url: 'https://spritedatabase.net/files/ds/2232/Sprite/OPGB2_LuffyTS.png', targetDisplayHeight: 118 },
  { key: 'zoro_base', url: 'https://spritedatabase.net/files/ds/2000/Sprite/RoronoaZoro.png', targetDisplayHeight: 112 },
  { key: 'zoro_form_zoro_king_of_hell', url: 'https://spritedatabase.net/files/ds/2232/Sprite/OPGB2_Zoro.png', targetDisplayHeight: 120 },
  { key: 'nami_base', url: 'https://spritedatabase.net/files/ds/2000/Sprite/Nami.png', targetDisplayHeight: 106 },
  { key: 'usopp_base', url: 'https://spritedatabase.net/files/ds/2000/Sprite/Usopp.PNG', targetDisplayHeight: 108 },
  { key: 'sanji_base', url: 'https://spritedatabase.net/files/ds/2000/Sprite/Sanji.png', targetDisplayHeight: 112 },
  { key: 'sanji_form_sanji_diable_jambe', url: 'https://spritedatabase.net/files/ds/2232/Sprite/OPGB2_Sanji.png', targetDisplayHeight: 116 },
  { key: 'chopper_base', url: 'https://spritedatabase.net/files/ds/2000/Sprite/Chopper.png', targetDisplayHeight: 92 },
  { key: 'robin_base', url: 'https://spritedatabase.net/files/ds/2000/Sprite/Robin.png', targetDisplayHeight: 112 },
  { key: 'franky_base', url: 'https://spritedatabase.net/files/ds/2000/Sprite/Franky.png', targetDisplayHeight: 128 },
  { key: 'brook_base', url: 'https://spritedatabase.net/files/ds/2000/Sprite/Brook.png', targetDisplayHeight: 124 },
  { key: 'jinbe_base', url: 'https://spritedatabase.net/files/ds/2000/Sprite/Jinbei.png', targetDisplayHeight: 132 },
  { key: 'buggy_base', url: 'https://spritedatabase.net/files/ds/2000/Sprite/Buggy.png', targetDisplayHeight: 112 },
  { key: 'don_krieg_base', url: 'https://spritedatabase.net/files/ds/2000/Sprite/DonKrieg.png', targetDisplayHeight: 128 },
  { key: 'arlong_base', url: 'https://spritedatabase.net/files/ds/2000/Sprite/Arlong.PNG', targetDisplayHeight: 128 },
  { key: 'kuro_base', url: 'https://spritedatabase.net/files/ds/2000/Sprite/Kuro.png', targetDisplayHeight: 114 },
  { key: 'smoker_base', url: 'https://spritedatabase.net/files/ds/2000/Sprite/Smoker.png', targetDisplayHeight: 120 },
  { key: 'wapol_base', url: 'https://spritedatabase.net/files/ds/2000/Sprite/Wapol.png', targetDisplayHeight: 124 },
  { key: 'crocodile_base', url: 'https://spritedatabase.net/files/ds/2000/Sprite/Crocodile.png', targetDisplayHeight: 126 },
  { key: 'enel_base', url: 'https://spritedatabase.net/files/ds/2000/Sprite/Enel.PNG', targetDisplayHeight: 122 },
  { key: 'enel_form_enel_amuru', url: 'https://spritedatabase.net/files/ds/2232/Sprite/OPGB2_Enel.png', targetDisplayHeight: 158 },
  { key: 'kaku_base', url: 'https://spritedatabase.net/files/ds/2000/Sprite/Kaku.png', targetDisplayHeight: 114 },
  { key: 'lucci_base', url: 'https://spritedatabase.net/files/ds/2000/Sprite/Lucci.PNG', targetDisplayHeight: 118 },
  { key: 'lucci_form_lucci_hybrid', url: 'https://spritedatabase.net/files/ds/2232/Sprite/OPGB2_RobLucci.png', targetDisplayHeight: 128 },
  { key: 'moria_base', url: 'https://spritedatabase.net/files/ds/2000/Sprite/Moria.png', targetDisplayHeight: 146 },
  { key: 'magellan_base', url: 'https://spritedatabase.net/files/ds/2000/Sprite/Magellan.png', targetDisplayHeight: 144 },
  { key: 'marco_base', url: 'https://spritedatabase.net/files/ds/2000/Sprite/Marco.png', targetDisplayHeight: 116 },
  { key: 'marco_form_marco_phoenix', url: 'https://spritedatabase.net/files/ds/2232/Sprite/OPGB2_Marco.png', targetDisplayHeight: 136 },
  { key: 'akainu_base', url: 'https://spritedatabase.net/files/ds/2000/Sprite/Akainu.png', targetDisplayHeight: 128 },
  { key: 'aokiji_base', url: 'https://spritedatabase.net/files/ds/2000/Sprite/Aokiji.png', targetDisplayHeight: 128 },
  { key: 'kizaru_base', url: 'https://spritedatabase.net/files/ds/2000/Sprite/Kizaru.png', targetDisplayHeight: 128 },
  { key: 'blackbeard_base', url: 'https://spritedatabase.net/files/ds/2000/Sprite/Blackbeard.png', targetDisplayHeight: 134 },
  { key: 'hody_jones_base', url: 'https://spritedatabase.net/files/ds/2232/Sprite/OPGB2_HodyJones.png', targetDisplayHeight: 128 },
  { key: 'doflamingo_base', url: 'https://spritedatabase.net/files/ds/2000/Sprite/Doflamingo.png', targetDisplayHeight: 124 },
  { key: 'doflamingo_form_doflamingo_awakening', url: 'https://spritedatabase.net/files/ds/2232/Sprite/Doflamingo.png', targetDisplayHeight: 132 },
  { key: 'law_base', url: 'https://spritedatabase.net/files/ds/2000/Sprite/TrafalgarLaw.PNG', targetDisplayHeight: 114 },
  { key: 'law_form_law_kroom', url: 'https://spritedatabase.net/files/ds/2232/Sprite/OPGB2_TrafalgarLaw.png', targetDisplayHeight: 120 }
];

// Exact 41px-stride cell map in OPGB2_Mugs.png (10 cols x 21 rows)
const GB2_PORTRAIT_CELLS = {
  luffy: [[0, 0], [4, 0], [3, 0], [2, 0], [1, 0], [2, 0], [1, 0], [4, 0]],
  zoro: [[5, 0], [7, 0], [6, 0], [5, 0], [6, 0], [5, 0], [6, 0], [7, 0]],
  nami: [[8, 0], [0, 1], [9, 0], [0, 1], [1, 1], [9, 0], [1, 1], [0, 1]],
  sanji: [[2, 1], [4, 1], [2, 1], [3, 1], [2, 1], [3, 1], [5, 1], [4, 1]],
  chopper: [[6, 1], [9, 1], [7, 1], [8, 1], [6, 1], [8, 1], [7, 1], [9, 1]],
  jinbe: [[7, 2], [8, 2], [7, 2], [8, 2], [7, 2], [7, 2], [8, 2], [8, 2]],
  blackbeard: [[3, 3], [4, 3], [3, 3], [4, 3], [3, 3], [3, 3], [4, 3], [4, 3]],
  usopp: [[7, 3], [8, 3], [8, 3], [5, 3], [7, 3], [6, 3], [8, 3], [5, 3]],
  buggy: [[9, 3], [0, 4], [1, 4], [1, 4], [9, 3], [2, 4], [0, 4], [9, 3]],
  crocodile: [[6, 4], [7, 4], [6, 4], [8, 4], [6, 4], [7, 4], [6, 4], [8, 4]],
  akainu: [[0, 5], [9, 4], [0, 5], [9, 4], [0, 5], [9, 4], [9, 4], [0, 5]],
  magellan: [[1, 5], [3, 5], [2, 5], [3, 5], [1, 5], [1, 5], [2, 5], [3, 5]],
  kizaru: [[4, 5], [5, 5], [4, 5], [5, 5], [4, 5], [4, 5], [5, 5], [5, 5]],
  aokiji: [[6, 5], [7, 5], [6, 5], [7, 5], [6, 5], [6, 5], [7, 5], [7, 5]],
  kaku: [[8, 6], [8, 6], [8, 6], [8, 6], [8, 6], [8, 6], [8, 6], [8, 6]],
  lucci: [[3, 7], [4, 7], [3, 7], [4, 7], [3, 7], [4, 7], [3, 7], [4, 7]],
  enel: [[6, 7], [7, 7], [6, 7], [7, 7], [6, 7], [7, 7], [6, 7], [7, 7]],
  kuro: [[8, 7], [8, 7], [8, 7], [8, 7], [8, 7], [8, 7], [8, 7], [8, 7]],
  don_krieg: [[9, 7], [9, 7], [9, 7], [9, 7], [9, 7], [9, 7], [9, 7], [9, 7]],
  wapol: [[1, 8], [1, 8], [1, 8], [1, 8], [1, 8], [1, 8], [1, 8], [1, 8]],
  arlong: [[2, 8], [3, 8], [2, 8], [3, 8], [2, 8], [3, 8], [2, 8], [3, 8]],
  law: [[5, 8], [6, 8], [7, 8], [6, 8], [5, 8], [7, 8], [5, 8], [6, 8]],
  moria: [[9, 8], [0, 9], [9, 8], [0, 9], [9, 8], [0, 9], [9, 8], [0, 9]],
  smoker: [[5, 9], [6, 9], [5, 9], [6, 9], [5, 9], [6, 9], [5, 9], [6, 9]],
  robin: [[2, 10], [3, 10], [2, 10], [3, 10], [2, 10], [3, 10], [2, 10], [3, 10]],
  franky: [[4, 10], [5, 10], [4, 10], [6, 10], [4, 10], [6, 10], [5, 10], [5, 10]],
  brook: [[8, 10], [9, 10], [8, 10], [7, 10], [9, 10], [7, 10], [9, 10], [8, 10]],
  marco: [[2, 11], [4, 11], [3, 11], [4, 11], [2, 11], [3, 11], [3, 11], [4, 11]],
  doflamingo: [[5, 11], [6, 11], [5, 11], [6, 11], [5, 11], [6, 11], [5, 11], [6, 11]],
  hody_jones: [[7, 18], [8, 18], [7, 18], [9, 18], [7, 18], [8, 18], [8, 18], [9, 18]]
};

const EMOTIONS = ['normal', 'angry', 'determined', 'shocked', 'smirk', 'sad', 'excited', 'battle_cry'];

const ARENA_CONFIGS = [
  { id: 'east_blue_harbor', name: '이스트 블루 · 후샤 항구 부두', sky: 'sp_bg_1', mid: 'mills_back', floor: 'rbs_1', ambientTint: '#38bdf8', floorTint: '#b48a5a', rimHex: '#7dd3fc', timeOfDay: 'DAY', groundY: 198 },
  { id: 'drum_snow_peak', name: '드럼 왕국 · 설산 왕성', sky: 'sp_bg_2', mid: 'sp_layer_12', floor: 'rbs_7', ambientTint: '#e2e8f0', floorTint: '#cbd5e1', rimHex: '#f8fafc', timeOfDay: 'DAY', groundY: 198 },
  { id: 'alabasta_desert', name: '알라바스타 · 아르바나 모래 궁전', sky: 'sp_bg_10', mid: 'sp_layer_25', floor: 'rbs_3', ambientTint: '#f59e0b', floorTint: '#d97706', rimHex: '#fde68a', timeOfDay: 'DUSK', groundY: 198 },
  { id: 'skypiea_upper_yard', name: '하늘섬 스카이피아 · 어퍼 야드', sky: 'sky_clouds', mid: 'sp_layer_31', floor: 'rbs_11', ambientTint: '#bae6fd', floorTint: '#e2e8f0', rimHex: '#ffffff', timeOfDay: 'DAY', groundY: 198 },
  { id: 'water7_dock', name: '워터 세븐 · 조선소 대운하', sky: 'sp_bg_4', mid: 'city_mid', floor: 'rbs_6', ambientTint: '#0ea5e9', floorTint: '#64748b', rimHex: '#38bdf8', timeOfDay: 'DUSK', groundY: 198 },
  { id: 'thriller_bark_gothic', name: '스릴러 바크 · 저주받은 고성', sky: 'sky_stars', mid: 'sp_layer_42', floor: 'rbs_3_night', ambientTint: '#6b21a8', floorTint: '#334155', rimHex: '#a855f7', timeOfDay: 'NIGHT', groundY: 198 },
  { id: 'marineford_ice_bay', name: '마린포드 · 오리스 얼음만', sky: 'sp_bg_9', mid: 'sp_layer_18', floor: 'rbs_14', ambientTint: '#38bdf8', floorTint: '#94a3b8', rimHex: '#bae6fd', timeOfDay: 'DUSK', groundY: 198 },
  { id: 'fishman_island_seabed', name: '어인섬 · 용궁성 심해 산호초', sky: 'fishy_back', mid: 'fishy_mid', floor: 'rbs_8', ambientTint: '#06b6d4', floorTint: '#0e7490', rimHex: '#2dd4bf', timeOfDay: 'NIGHT', groundY: 198 },
  { id: 'dressrosa_colosseum', name: '드레스로자 · 코리다 콜로세움', sky: 'sp_bg_6', mid: 'sp_layer_48', floor: 'rbs_9', ambientTint: '#f43f5e', floorTint: '#a8a29e', rimHex: '#fbbf24', timeOfDay: 'DUSK', groundY: 198 },
  { id: 'whole_cake_mirror', name: '토트랜드 · 브륄레 거울 세계', sky: 'sp_bg_14', mid: 'sp_layer_60', floor: 'rbs_18', ambientTint: '#e879f9', floorTint: '#581c87', rimHex: '#f472b6', timeOfDay: 'NIGHT', groundY: 198 },
  { id: 'onigashima_rooftop', name: '와노쿠니 · 오니가시마 도개골 옥상', sky: 'sp_bg_13', mid: 'sp_layer_75', floor: 'rbs_2_night', ambientTint: '#f43f5e', floorTint: '#475569', rimHex: '#fb7185', timeOfDay: 'NIGHT', groundY: 198 },
  { id: 'egghead_lab', name: '미래섬 에그헤드 · 라보페이즈', sky: 'cyber_back', mid: 'cyber_mid', floor: 'rbs_20', ambientTint: '#22d3ee', floorTint: '#1e293b', rimHex: '#38bdf8', timeOfDay: 'NIGHT', groundY: 198 },
  { id: 'elbaf_underworld', name: '엘바프 · 세계수 아담 명계', sky: 'sp_bg_24', mid: 'forest_mid', floor: 'rbs_5', ambientTint: '#84cc16', floorTint: '#365314', rimHex: '#facc15', timeOfDay: 'DUSK', groundY: 198 },
  { id: 'impel_down_hell', name: '대감옥 임펠 다운 · 무한지옥', sky: 'sp_bg_25', mid: 'ind_mid', floor: 'rbs_5_night', ambientTint: '#dc2626', floorTint: '#44403c', rimHex: '#f97316', timeOfDay: 'NIGHT', groundY: 198 }
];

const VFX_SPECS = [
  { id: 'slash_arc', srcUrl: `${SP_BASE}/ninja-adventure/fx/1.png`, cols: 5, rows: 1, fps: 18, blendMode: 'lighter', scale: 1.5 },
  { id: 'cross_slash', srcUrl: `${SP_BASE}/rpg-battle-system/fx/1.png`, cols: 6, rows: 1, fps: 18, blendMode: 'lighter', scale: 1.15 },
  { id: 'fire_explosion', srcUrl: 'https://opengameart.org/sites/default/files/Explosion_2.png', cols: 12, rows: 1, maxFrames: 10, fps: 18, blendMode: 'source-over', scale: 1.1 },
  { id: 'lightning_strike', srcUrl: `${SP_BASE}/rpg-battle-system/fx/4.png`, cols: 5, rows: 1, fps: 16, blendMode: 'lighter', scale: 1.25 },
  { id: 'conqueror_bolt', srcUrl: 'https://opengameart.org/sites/default/files/panorama18.png', cols: 5, rows: 4, targetRow: 0, fps: 18, blendMode: 'lighter', scale: 0.72 },
  { id: 'ice_shatter', srcUrl: 'https://opengameart.org/sites/default/files/panorama16.png', cols: 5, rows: 4, targetRow: 1, fps: 16, blendMode: 'lighter', scale: 0.72 },
  { id: 'water_splash', srcUrl: `${SP_BASE}/rpg-battle-system/fx/6.png`, cols: 6, rows: 1, fps: 16, blendMode: 'source-over', scale: 1.05, tintHex: '#38bdf8', tintStrength: 0.35 },
  { id: 'smoke_puff', srcUrl: `${SP_BASE}/rpg-battle-system/fx/7.png`, cols: 5, rows: 1, fps: 14, blendMode: 'source-over', scale: 1.15, tintHex: '#cbd5e1', tintStrength: 0.4 },
  { id: 'hit_spark', srcUrl: `${SP_BASE}/ninja-adventure/fx/5.png`, cols: 6, rows: 1, fps: 20, blendMode: 'lighter', scale: 1.4 },
  { id: 'parry_flash', srcUrl: `${SP_BASE}/ninja-adventure/fx/10.png`, cols: 5, rows: 1, fps: 20, blendMode: 'lighter', scale: 1.6 },
  { id: 'beam_core', srcUrl: `${SP_BASE}/rpg-battle-system/fx/8.png`, cols: 5, rows: 1, fps: 16, blendMode: 'lighter', scale: 1.2 },
  { id: 'awakening_burst', srcUrl: `${SP_BASE}/rpg-battle-system/fx/11.png`, cols: 6, rows: 1, fps: 16, blendMode: 'lighter', scale: 1.3 }
];

async function fetchTilesets(report) {
  console.log('1) Fetching pixel RPG tilesets & building sheets...');
  const [medTiles, ninjaTiles, ninjaSnow, prehistTiles, ogaWaterGrassSand, ogaWaterworld, ogaDesert, ogaFloors] = await Promise.all([
    fetchPng(`${SP_BASE}/medieval-fantasy/background-elements/0-tileset.png`, 'tiles/sp_med.png').then((r) => r.img),
    fetchPng(`${SP_BASE}/ninja-adventure/background-elements/tileset.png`, 'tiles/sp_ninja.png').then((r) => r.img),
    fetchPng(`${SP_BASE}/ninja-adventure/background-elements/snow.png`, 'tiles/sp_snow.png').then((r) => r.img),
    fetchPng(`${SP_BASE}/prehistoric-platformer/background-elements/tileset-1.png`, 'tiles/sp_prehist.png').then((r) => r.img),
    fetchPng('https://opengameart.org/sites/default/files/voda_pesok_trava_revision_2.png', 'tiles/oga_water_grass_sand.png').then((r) => r.img),
    fetchPng('https://opengameart.org/sites/default/files/tileset_waterworld.png', 'tiles/oga_waterworld.png').then((r) => r.img),
    fetchPng('https://opengameart.org/sites/default/files/desert_1_0_7.png', 'tiles/oga_desert.png').then((r) => r.img),
    fetchPng('https://opengameart.org/sites/default/files/floortileset.png', 'tiles/oga_floors.png').then((r) => r.img)
  ]);

  const kenneyTiles = await Promise.all(
    ['001', '015', '028', '045', '072'].map((num) =>
      fetchPng(`${KENNEY_ART_BASE}/rpgTile${num}.png`, `tiles/kenney_rpg_${num}.png`).then((r) => r.img)
    )
  );

  const buildingFolders = [
    '01-00-thatched-cottage',
    '01-02-gable-front-cottage',
    '01-06-reed-fishers-hut-on-stilts-over-a-pond-with-a-plank-walkway',
    '01-09-hillside-cottage-with-an-outside-stone-stair-to-an-upper-loft-door'
  ];
  const buildingsSummer = await Promise.all(
    buildingFolders.map((f, i) => fetchPng(`${HL_BASE}/${f}/summer.png`, `tiles/hl_sum_${i}.png`).then((r) => r.img))
  );
  const buildingsWinter = await Promise.all(
    buildingFolders.map((f, i) => fetchPng(`${HL_BASE}/${f}/winter.png`, `tiles/hl_win_${i}.png`).then((r) => r.img))
  );

  const tilesetsManifestPath = path.join(ROOT, 'src/data/assets/tilesets.json');
  const tilesetsJson = JSON.parse(fs.readFileSync(tilesetsManifestPath, 'utf-8'));
  const outDir = path.join(ROOT, 'public/assets/tilesets');
  fs.mkdirSync(outDir, { recursive: true });

  for (const biome of tilesetsJson.biomes) {
    biome.layeredAtlas = true;
    biome.rows = 16;
    const pngBuf = buildLayeredBiomeTileset(biome, {
      medTiles,
      ninjaTiles,
      ninjaSnow,
      prehistTiles,
      ogaWaterGrassSand,
      ogaWaterworld,
      ogaDesert,
      ogaFloors,
      kenneyTiles,
      buildingsSummer,
      buildingsWinter
    });
    fs.writeFileSync(path.join(ROOT, 'public', biome.src), pngBuf);
  }
  fs.writeFileSync(tilesetsManifestPath, `${JSON.stringify(tilesetsJson, null, 2)}\n`, 'utf-8');
  report.tilesets = tilesetsJson.biomes.length;
  console.log(`   ✅ Built ${report.tilesets} multi-layer biome tileset PNGs (256x256, 16x16 tiles)`);
}

async function fetchBattleBackdrops(report) {
  console.log('2) Fetching parallax backgrounds & battle arena textures...');
  const cache = new Map();

  // Extract OGA parallax packs
  const forestZipBuf = await fetchCachedBinary(
    'https://opengameart.org/sites/default/files/parallax_background_forest.zip',
    'bg/parallax_forest.zip',
    (b) => b.length > 1000 && b[0] === 0x50 && b[1] === 0x4b
  );
  const cityZipBuf = await fetchCachedBinary(
    'https://opengameart.org/sites/default/files/City.zip',
    'bg/city.zip',
    (b) => b.length > 1000 && b[0] === 0x50 && b[1] === 0x4b
  );
  const indZipBuf = await fetchCachedBinary(
    'https://opengameart.org/sites/default/files/parallax-industrial-pack_0.zip',
    'bg/industrial.zip',
    (b) => b.length > 1000 && b[0] === 0x50 && b[1] === 0x4b
  );
  void forestZipBuf;
  void cityZipBuf;
  void indZipBuf;

  const forestPngs = extractZipToDir(path.join(RAW_DIR, 'bg/parallax_forest.zip'), path.join(RAW_DIR, 'bg/forest_unpacked'), ['.png']);
  const cityPngs = extractZipToDir(path.join(RAW_DIR, 'bg/city.zip'), path.join(RAW_DIR, 'bg/city_unpacked'), ['.png']);
  const indPngs = extractZipToDir(path.join(RAW_DIR, 'bg/industrial.zip'), path.join(RAW_DIR, 'bg/ind_unpacked'), ['.png']);

  const loadDecoded = async (key, urlOrPath) => {
    if (cache.has(key)) return cache.get(key);
    let img;
    if (urlOrPath.startsWith('http')) {
      img = (await fetchPng(urlOrPath, `bg/${key}.png`)).img;
    } else {
      img = decodePng(fs.readFileSync(urlOrPath));
    }
    cache.set(key, img);
    return img;
  };

  // Preload curated parallax layers & RPG battle floors
  const sourcesMap = {
    mills_back: `${PARALLAX_BASE}/mills-back.png`,
    cyber_back: `${PARALLAX_BASE}/cyberpunk_back.png`,
    cyber_mid: `${PARALLAX_BASE}/cyberpunk_middle.png`,
    fishy_back: `${PARALLAX_BASE}/fishy_back.png`,
    fishy_mid: `${PARALLAX_BASE}/fishy_middle_2.png`,
    sky_clouds: `${PARALLAX_BASE}/sky-clouds.png`,
    sky_stars: `${PARALLAX_BASE}/sky-stars.png`,
    city_mid: cityPngs.find((p) => /layer|back|city/i.test(p)) || cityPngs[0] || `${SP_BASE}/backgrounds/layers/48.png`,
    forest_mid: forestPngs.find((p) => /layer|mid|tree|2/i.test(p)) || forestPngs[0] || `${SP_BASE}/backgrounds/layers/31.png`,
    ind_mid: indPngs.find((p) => /building|mid|2/i.test(p)) || indPngs[0] || `${SP_BASE}/backgrounds/layers/75.png`,
    sp_bg_1: `${SP_BASE}/backgrounds/backgrounds/1.png`,
    sp_bg_2: `${SP_BASE}/backgrounds/backgrounds/2.png`,
    sp_bg_4: `${SP_BASE}/backgrounds/backgrounds/4.png`,
    sp_bg_6: `${SP_BASE}/backgrounds/backgrounds/6.png`,
    sp_bg_9: `${SP_BASE}/backgrounds/backgrounds/9.png`,
    sp_bg_10: `${SP_BASE}/backgrounds/backgrounds/10.png`,
    sp_bg_11: `${SP_BASE}/backgrounds/backgrounds/11.png`,
    sp_bg_13: `${SP_BASE}/backgrounds/backgrounds/13.png`,
    sp_bg_14: `${SP_BASE}/backgrounds/backgrounds/14.png`,
    sp_bg_19: `${SP_BASE}/backgrounds/backgrounds/19.png`,
    sp_bg_22: `${SP_BASE}/backgrounds/backgrounds/22.png`,
    sp_bg_24: `${SP_BASE}/backgrounds/backgrounds/24.png`,
    sp_bg_25: `${SP_BASE}/backgrounds/backgrounds/25.png`,
    sp_bg_28: `${SP_BASE}/backgrounds/backgrounds/28.png`,
    sp_layer_12: `${SP_BASE}/backgrounds/layers/12.png`,
    sp_layer_18: `${SP_BASE}/backgrounds/layers/18.png`,
    sp_layer_25: `${SP_BASE}/backgrounds/layers/25.png`,
    sp_layer_31: `${SP_BASE}/backgrounds/layers/31.png`,
    sp_layer_42: `${SP_BASE}/backgrounds/layers/42.png`,
    sp_layer_48: `${SP_BASE}/backgrounds/layers/48.png`,
    sp_layer_60: `${SP_BASE}/backgrounds/layers/60.png`,
    sp_layer_75: `${SP_BASE}/backgrounds/layers/75.png`,
    rbs_1: `${SP_BASE}/rpg-battle-system/backgrounds/1.png`,
    rbs_3: `${SP_BASE}/rpg-battle-system/backgrounds/3.png`,
    rbs_4: `${SP_BASE}/rpg-battle-system/backgrounds/4.png`,
    rbs_5: `${SP_BASE}/rpg-battle-system/backgrounds/5.png`,
    rbs_6: `${SP_BASE}/rpg-battle-system/backgrounds/6.png`,
    rbs_7: `${SP_BASE}/rpg-battle-system/backgrounds/7.png`,
    rbs_8: `${SP_BASE}/rpg-battle-system/backgrounds/8.png`,
    rbs_9: `${SP_BASE}/rpg-battle-system/backgrounds/9.png`,
    rbs_11: `${SP_BASE}/rpg-battle-system/backgrounds/11.png`,
    rbs_12: `${SP_BASE}/rpg-battle-system/backgrounds/12.png`,
    rbs_14: `${SP_BASE}/rpg-battle-system/backgrounds/14.png`,
    rbs_16: `${SP_BASE}/rpg-battle-system/backgrounds/16.png`,
    rbs_18: `${SP_BASE}/rpg-battle-system/backgrounds/18.png`,
    rbs_20: `${SP_BASE}/rpg-battle-system/backgrounds/20.png`,
    rbs_2_night: `${SP_BASE}/rpg-battle-system/backgrounds/2-night.png`,
    rbs_3_night: `${SP_BASE}/rpg-battle-system/backgrounds/3-night.png`,
    rbs_5_night: `${SP_BASE}/rpg-battle-system/backgrounds/5-night.png`
  };

  const backdropEntries = [];
  for (const arena of ARENA_CONFIGS) {
    const skyImg = await loadDecoded(arena.sky, sourcesMap[arena.sky]);
    const midImg = await loadDecoded(arena.mid, sourcesMap[arena.mid]);
    const floorImg = await loadDecoded(arena.floor, sourcesMap[arena.floor]);
    const { skyPng, midPng, groundPng } = buildParallaxBackdropSet(arena, { skyImg, midImg, floorImg });

    const outDir = path.join(ROOT, `public/assets/backgrounds/${arena.id}`);
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, 'sky.png'), skyPng);
    fs.writeFileSync(path.join(outDir, 'mid.png'), midPng);
    fs.writeFileSync(path.join(outDir, 'ground.png'), groundPng);

    backdropEntries.push({
      id: arena.id,
      name: arena.name,
      width: 1280,
      height: 540,
      groundY: arena.groundY,
      timeOfDay: arena.timeOfDay,
      ambientTint: arena.ambientTint,
      parallaxFactors: [0.12, 0.42, 1.0],
      layers: {
        sky: `assets/backgrounds/${arena.id}/sky.png`,
        mid: `assets/backgrounds/${arena.id}/mid.png`,
        ground: `assets/backgrounds/${arena.id}/ground.png`
      }
    });
  }

  const backgroundsManifest = {
    version: '1.0.0',
    islandBackdropMap: {
      foosha_shells: 'east_blue_harbor',
      orange_town: 'east_blue_harbor',
      baratie: 'east_blue_harbor',
      arlong_park: 'fishman_island_seabed',
      loguetown: 'east_blue_harbor',
      drum_kingdom: 'drum_snow_peak',
      alabasta: 'alabasta_desert',
      skypiea: 'skypiea_upper_yard',
      water_seven: 'water7_dock',
      thriller_bark: 'thriller_bark_gothic',
      marineford: 'marineford_ice_bay',
      impel_down: 'impel_down_hell',
      fishman_island: 'fishman_island_seabed',
      dressrosa: 'dressrosa_colosseum',
      totto_land: 'whole_cake_mirror',
      wano_onigashima: 'onigashima_rooftop',
      egghead: 'egghead_lab',
      elbaf: 'elbaf_underworld'
    },
    seaZoneBackdropMap: {
      east_blue: 'east_blue_harbor',
      grand_line: 'water7_dock',
      new_world: 'onigashima_rooftop'
    },
    arenaModeBackdropMap: {
      DEFAULT: 'east_blue_harbor',
      IMPEL_DOWN: 'impel_down_hell',
      COLOSSEUM: 'dressrosa_colosseum',
      COOP_RAID: 'onigashima_rooftop',
      MAGMA: 'impel_down_hell',
      ICE: 'marineford_ice_bay',
      LAB: 'egghead_lab',
      ELBAF: 'elbaf_underworld'
    },
    backdrops: backdropEntries
  };

  fs.writeFileSync(
    path.join(ROOT, 'src/data/assets/backgrounds.json'),
    `${JSON.stringify(backgroundsManifest, null, 2)}\n`,
    'utf-8'
  );
  report.backgrounds = backdropEntries.length;
  console.log(`   ✅ Built ${backdropEntries.length} arenas × 3 layers = ${backdropEntries.length * 3} 1280x540 PNG backdrops`);
}

async function fetchVfxAtlases(report) {
  console.log('3) Fetching pixel VFX sprite sheets...');
  const vfxDir = path.join(ROOT, 'public/assets/vfx');
  fs.mkdirSync(vfxDir, { recursive: true });
  const entries = [];

  for (const spec of VFX_SPECS) {
    const { img } = await fetchPng(spec.srcUrl, `vfx/${spec.id}_raw.png`);
    const norm = normalizeVfxStrip(img, spec);
    const outRel = `assets/vfx/${spec.id}.png`;
    fs.writeFileSync(path.join(ROOT, 'public', outRel), norm.pngBuffer);
    entries.push({
      id: spec.id,
      src: outRel,
      frameWidth: norm.frameWidth,
      frameHeight: norm.frameHeight,
      frameCount: norm.frameCount,
      fps: spec.fps,
      blendMode: spec.blendMode,
      scale: spec.scale
    });
  }

  fs.writeFileSync(
    path.join(ROOT, 'src/data/assets/vfx.json'),
    `${JSON.stringify({ version: '1.0.0', atlases: entries }, null, 2)}\n`,
    'utf-8'
  );
  report.vfx = entries.length;
  console.log(`   ✅ Normalized ${entries.length} pixel VFX sprite sheets into public/assets/vfx/`);
}

async function fetchAudioAssets(report) {
  console.log('4) Fetching real .ogg BGM & SFX packs...');
  const bgmDir = path.join(ROOT, 'public/assets/audio/bgm');
  const sfxDir = path.join(ROOT, 'public/assets/audio/sfx');
  fs.mkdirSync(bgmDir, { recursive: true });
  fs.mkdirSync(sfxDir, { recursive: true });

  // Download OGA 15 Melodic RPG Chiptunes OGG pack
  const chiptuneZip = await fetchCachedBinary(
    'https://opengameart.org/sites/default/files/15_melodic_rpg_chiptunes_ogg.zip',
    'audio/15_melodic_rpg_chiptunes_ogg.zip',
    (b) => b.length > 50000 && b[0] === 0x50 && b[1] === 0x4b
  );
  void chiptuneZip;
  const chipOggs = extractZipToDir(
    path.join(RAW_DIR, 'audio/15_melodic_rpg_chiptunes_ogg.zip'),
    path.join(RAW_DIR, 'audio/chiptunes_unpacked'),
    ['.ogg']
  );
  const findChip = (numPrefix) => chipOggs.find((p) => path.basename(p).startsWith(numPrefix));

  const bgmSources = {
    title_adventure: {
      url: 'https://opengameart.org/sites/default/files/Juhani%20Junkala%20-%20JRPG%20Theme%20%5BLoop%20Ready%5D.ogg',
      source: 'OpenGameArt CC0 (Juhani Junkala — JRPG Theme)'
    },
    sea_east_blue: {
      local: findChip('rpgchip11_'),
      source: 'OpenGameArt CC-BY (15 Melodic RPG Chiptunes — Airship)'
    },
    sea_grand_line: {
      local: findChip('rpgchip08_'),
      source: 'OpenGameArt CC-BY (15 Melodic RPG Chiptunes — Castle on the Mountain)'
    },
    sea_new_world: {
      local: findChip('rpgchip12_'),
      source: 'OpenGameArt CC-BY (15 Melodic RPG Chiptunes — The Evil One)'
    },
    island_peaceful: {
      local: findChip('rpgchip03_'),
      source: 'OpenGameArt CC-BY (15 Melodic RPG Chiptunes — Town)'
    },
    battle_normal: {
      url: 'https://opengameart.org/sites/default/files/audio_preview/01._battle_theme_i_full.mp3.ogg',
      source: 'OpenGameArt CC0 (16-Bit Battle Theme I)'
    },
    battle_boss: {
      local: findChip('rpgchip14_'),
      source: 'OpenGameArt CC-BY (15 Melodic RPG Chiptunes — Battle 2)'
    },
    battle_yonko_awakening: {
      url: `${SP_BASE}/rpg-battle-system/music/theme-10.ogg`,
      source: 'Superpowers CC0 (rpg-battle-system/music/theme-10.ogg)'
    },
    battle_raid_giant: {
      url: `${SP_BASE}/medieval-fantasy/music/theme-6.ogg`,
      source: 'Superpowers CC0 (medieval-fantasy/music/theme-6.ogg)'
    },
    victory_fanfare: {
      url: `${KENNEY_AUDIO_BASE}/Jingle%20sounds%20(85%20sounds)/jingles_NES/jingles_NES00.ogg`,
      source: 'Kenney CC0 (Jingle Sounds NES00)'
    }
  };

  for (const [id, info] of Object.entries(bgmSources)) {
    let buf;
    if (info.local && fs.existsSync(info.local)) {
      buf = fs.readFileSync(info.local);
    } else {
      buf = await fetchCachedBinary(info.url, `audio/bgm_${id}.ogg`, isValidAudioBuffer);
    }
    fs.writeFileSync(path.join(bgmDir, `${id}.ogg`), buf);
  }

  const sfxSources = {
    slash_light: `${KENNEY_AUDIO_BASE}/RPG%20sounds%20(50%20sounds)/knifeSlice.ogg`,
    slash_heavy: `${KENNEY_AUDIO_BASE}/RPG%20sounds%20(50%20sounds)/knifeSlice2.ogg`,
    blunt_hit: `${KENNEY_AUDIO_BASE}/RPG%20sounds%20(50%20sounds)/chop.ogg`,
    beam_fire: `${KENNEY_AUDIO_BASE}/Digital%20sounds%20(60%20sounds)/laser5.ogg`,
    beam_clash_loop: `${KENNEY_AUDIO_BASE}/Digital%20sounds%20(60%20sounds)/zapThreeToneUp.ogg`,
    melee_clash_clang: `${KENNEY_AUDIO_BASE}/RPG%20sounds%20(50%20sounds)/metalPot1.ogg`,
    dodge_whoosh: `${KENNEY_AUDIO_BASE}/Digital%20sounds%20(60%20sounds)/phaseJump3.ogg`,
    just_dodge_chime: `${KENNEY_AUDIO_BASE}/Digital%20sounds%20(60%20sounds)/powerUp7.ogg`,
    haki_lightning: `${SP_BASE}/rpg-battle-system/sound/15.ogg`,
    logia_dissolve: `${KENNEY_AUDIO_BASE}/Digital%20sounds%20(60%20sounds)/phaserDown2.ogg`,
    transform_burst: `${KENNEY_AUDIO_BASE}/Digital%20sounds%20(60%20sounds)/phaserUp3.ogg`,
    awakening_drums: `${SP_BASE}/ninja-adventure/sounds/power-up-2.ogg`,
    ui_move: `${KENNEY_AUDIO_BASE}/UI%20sounds%20(50%20sounds)/rollover2.ogg`,
    ui_confirm: `${KENNEY_AUDIO_BASE}/UI%20sounds%20(50%20sounds)/click1.ogg`,
    ui_cancel: `${KENNEY_AUDIO_BASE}/UI%20sounds%20(50%20sounds)/switch2.ogg`,
    wanted_poster_slam: `${KENNEY_AUDIO_BASE}/RPG%20sounds%20(50%20sounds)/bookPlace1.ogg`,
    ship_cannon: `${KENNEY_AUDIO_BASE}/Digital%20sounds%20(60%20sounds)/lowDown.ogg`,
    coup_de_burst: `${KENNEY_AUDIO_BASE}/Digital%20sounds%20(60%20sounds)/spaceTrash3.ogg`,
    explosion_heavy: `${SP_BASE}/rpg-battle-system/sound/25.ogg`,
    parry_clang: `${KENNEY_AUDIO_BASE}/RPG%20sounds%20(50%20sounds)/metalClick.ogg`,
    water_splash: `${SP_BASE}/ninja-adventure/sounds/14.ogg`,
    guard_block: `${KENNEY_AUDIO_BASE}/RPG%20sounds%20(50%20sounds)/metalLatch.ogg`
  };

  for (const [id, url] of Object.entries(sfxSources)) {
    const buf = await fetchCachedBinary(url, `audio/sfx_${id}.ogg`, isValidAudioBuffer);
    fs.writeFileSync(path.join(sfxDir, `${id}.ogg`), buf);
  }

  // Update src/data/assets/audio.json ensuring the 4 new combat SFX are cleanly registered
  const audioJsonPath = path.join(ROOT, 'src/data/assets/audio.json');
  const audioJson = JSON.parse(fs.readFileSync(audioJsonPath, 'utf-8'));
  const extraSfxDefs = [
    { id: 'explosion_heavy', name: '대폭발 충격음', src: 'assets/audio/sfx/explosion_heavy.ogg', volume: 0.9 },
    { id: 'parry_clang', name: '무장색 패링 튕김음', src: 'assets/audio/sfx/parry_clang.ogg', volume: 0.88 },
    { id: 'water_splash', name: '해수·어인공수도 물보라', src: 'assets/audio/sfx/water_splash.ogg', volume: 0.78 },
    { id: 'guard_block', name: '가드 방어 충돌음', src: 'assets/audio/sfx/guard_block.ogg', volume: 0.82 }
  ];
  const existingSfxIds = new Set(audioJson.sfxEntries.map((s) => s.id));
  for (const ex of extraSfxDefs) {
    if (!existingSfxIds.has(ex.id)) {
      audioJson.sfxEntries.push({
        ...ex,
        throttleMs: 50,
        maxPolyphony: 3,
        pitchJitterRatio: 0.06,
        synthPreset: ex.id
      });
    }
  }
  fs.writeFileSync(audioJsonPath, `${JSON.stringify(audioJson, null, 2)}\n`, 'utf-8');
  report.bgm = Object.keys(bgmSources).length;
  report.sfx = audioJson.sfxEntries.length;
  report.bgmSources = bgmSources;
  console.log(`   ✅ Downloaded ${report.bgm} real .ogg BGM tracks and ${report.sfx} real .ogg SFX files`);
}

async function fetchOnePieceSpritesAndPortraits(report) {
  console.log('5) Fetching real One Piece NDS sprite sheets & mugshot portraits...');
  const spritesJsonPath = path.join(ROOT, 'src/data/assets/sprites.json');
  const spritesManifest = JSON.parse(fs.readFileSync(spritesJsonPath, 'utf-8'));
  const entryByKey = new Map(spritesManifest.entries.map((e) => [e.key, e]));
  const spritesDir = path.join(ROOT, 'public/assets/sprites');
  const portraitsDir = path.join(ROOT, 'public/assets/portraits');

  let updatedSprites = 0;
  const acquiredKeys = new Set();
  for (const item of SDB_CHARACTER_SHEETS) {
    const manifestEntry = entryByKey.get(item.key);
    if (!manifestEntry) continue;
    try {
      const { img } = await fetchPng(item.url, `sprites/${item.key}_raw.png`, SDB_HEADERS);
      const norm = normalizeSpriteSheet(img, {
        key: item.key,
        unitId: manifestEntry.unitId,
        formId: manifestEntry.formId,
        rigType: manifestEntry.rigType,
        anchor: manifestEntry.anchor ?? { x: 0.5, y: 0.9 },
        existingAnimations: manifestEntry.animations,
        source: 'EXTERNAL_WEB_SHEET'
      });

      fs.writeFileSync(path.join(spritesDir, `${item.key}.png`), norm.pngBuffer);
      fs.writeFileSync(
        path.join(spritesDir, `${item.key}.meta.json`),
        `${JSON.stringify(norm.meta, null, 2)}\n`,
        'utf-8'
      );

      manifestEntry.frameWidth = norm.frameWidth;
      manifestEntry.frameHeight = norm.frameHeight;
      manifestEntry.targetDisplayHeight = item.targetDisplayHeight;
      updatedSprites += 1;
      acquiredKeys.add(item.key);
    } catch (err) {
      console.warn(`   ⚠️ Skipped ${item.key}: ${err.message}`);
    }
  }

  // Upgrade portraits from OPGB2_Mugs.png (411x862 = 10 cols x 21 rows, 41px stride, 40x40 mug)
  let updatedPortraits = 0;
  try {
    const { img: mugSheet } = await fetchPng(
      'https://spritedatabase.net/files/ds/2232/Sprite/OPGB2_Mugs.png',
      'portraits/OPGB2_Mugs.png',
      SDB_HEADERS
    );
    for (const [unitId, coords] of Object.entries(GB2_PORTRAIT_CELLS)) {
      for (let eIdx = 0; eIdx < EMOTIONS.length; eIdx++) {
        const emotion = EMOTIONS[eIdx];
        const [col, row] = coords[eIdx % coords.length];
        const crop = createImage(40, 40);
        blit(crop, mugSheet, col * 41 + 1, row * 41 + 1, 40, 40, 0, 0, { alphaBlend: false });
        // Crisp 64x64 frame preserving exact pixel sharpness
        const out64 = resizeNearest(crop, 64, 64);
        // Subtle 1px dark frame border matching retro UI style
        for (let i = 0; i < 64; i++) {
          for (const [px, py] of [[i, 0], [i, 63], [0, i], [63, i]]) {
            const idx = (py * 64 + px) * 4;
            out64.data[idx] = 17;
            out64.data[idx + 1] = 24;
            out64.data[idx + 2] = 39;
            out64.data[idx + 3] = 255;
          }
        }
        fs.writeFileSync(path.join(portraitsDir, `${unitId}_${emotion}.png`), encodeImageToPng(out64));
        updatedPortraits += 1;
      }
    }
  } catch (err) {
    console.warn(`   ⚠️ Mugshots upgrade skipped: ${err.message}`);
  }

  fs.writeFileSync(spritesJsonPath, `${JSON.stringify(spritesManifest, null, 2)}\n`, 'utf-8');
  report.spritesExternal = updatedSprites;
  report.portraitsExternal = updatedPortraits;
  report.acquiredKeys = acquiredKeys;
  report.allSpriteEntries = spritesManifest.entries;
  console.log(`   ✅ Normalized ${updatedSprites} real One Piece sprite sheets & ${updatedPortraits} NDS mugshot portraits`);
}

function writeMissingSpritesReport(report) {
  const missingEntries = (report.allSpriteEntries || []).filter(
    (e) => !e.shipId && !report.acquiredKeys.has(e.key)
  );
  const acquiredCount = report.acquiredKeys.size;
  const totalUnitForms = (report.allSpriteEntries || []).filter((e) => !e.shipId).length;

  const lines = [
    '# MISSING_SPRITES.md — 외부 원피스 캐릭터 도트 시트 수급 현황 및 추가 가이드',
    '',
    `> **최종 갱신:** ${new Date().toISOString()}`,
    `> **외부 NDS 원피스 도트 시트 확보:** **${acquiredCount} / ${totalUnitForms}종** (나머지 ${missingEntries.length}종은 6종 관절 픽셀 리그 시트로 안전 유지 중)`,
    '',
    '## 1. 안내',
    '- `One Piece: Gigant Battle!` / `Gigant Battle! 2 - New World`에서 직접 확보 가능한 38종의 시트는 크로마키 투명화 → CCL 분할 → 발밑(`pivotY`) `0px` 정렬을 거쳐 이미 적용되었습니다.',
    '- 아래 목록은 신세계 후반·와노쿠니·에그헤드·엘바프 이후 등장 캐릭터(예: 카이도, 카타쿠리, 킹, 새턴 성, 로키, S-호크) 및 변신 폼, 오리지널 유닛으로, 공개 아카이브에서 자동 다운로드가 불가능하거나 미등장하여 기존 고품질 관절 픽셀 리그 시트가 유지되고 있습니다.',
    '- 원하는 커스텀 PNG 시트나 `.zip` 팩을 구하신 경우, 아래 파일명 규칙에 맞춰 **`raw_assets/packs/`** 폴더에 넣은 뒤 **`npm run import:pack`** 을 실행하면 즉시 게임에 등록됩니다.',
    '',
    '## 2. 원클릭 임포트 사용법',
    '```powershell',
    '# 1) raw_assets/packs/ 폴더에 {spriteKey}.png 또는 캐릭터명.zip 투입',
    '#    예: raw_assets/packs/kaido_base.png, raw_assets/packs/katakuri_pack.zip',
    'npm run import:pack',
    '',
    '# 2) 무결성 검증',
    'npm run validate:assets',
    '```',
    '',
    '## 3. 미수집 캐릭터·변신 폼 목록 & 추천 검색 키워드',
    '| Sprite Key | Unit ID | Form / Role | 추천 검색 키워드 | 드롭 경로 (`raw_assets/packs/`) |',
    '| :--- | :--- | :--- | :--- | :--- |'
  ];

  const keywordHint = {
    kaido: 'Kaido One Piece JUS / MUGEN sprite sheet png',
    katakuri: 'Charlotte Katakuri One Piece sprite sheet png',
    king: 'King The Wildfire One Piece sprite sheet png',
    s_hawk: 'Seraphim S-Hawk Mihawk One Piece sprite sheet png',
    saturn: 'Saint Jaygarcia Saturn One Piece sprite sheet png',
    loki: 'Loki Elbaf One Piece pixel sprite sheet png',
    morgan: 'Axe-Hand Morgan One Piece sprite sheet png',
    blueno: 'Blueno CP9 One Piece sprite sheet png',
    doppelman: 'Gecko Moria Doppelman shadow sprite sheet png'
  };

  for (const e of missingEntries) {
    const uid = e.unitId || e.key;
    const hint = keywordHint[uid] || `${uid.replace(/^unit_/, '')} One Piece pixel sprite sheet png`;
    lines.push(`| \`${e.key}\` | \`${uid}\` | ${e.formId || 'base'} | ${hint} | \`raw_assets/packs/${e.key}.png\` |`);
  }

  fs.writeFileSync(path.join(ROOT, 'MISSING_SPRITES.md'), `${lines.join('\n')}\n`, 'utf-8');
  console.log(`   ✅ Generated MISSING_SPRITES.md (${acquiredCount} acquired, ${missingEntries.length} listed for optional pack drop)`);
}

function writeAssetSourcesDoc(report) {
  const lines = [
    '# ASSET_SOURCES.md — 외부 수집 공개 리소스 출처 및 라이선스 요약',
    '',
    '> **수집 스크립트:** `scripts/fetch-web-assets.mjs` (`npm run fetch:assets`)',
    '',
    '## 1. 다층 픽셀 RPG 타일셋 (14종 바이옴)',
    '- **Superpowers Asset Packs (`sparklinlabs/superpowers-asset-packs`)** — **CC0 1.0 Public Domain** (Medieval Fantasy, Ninja Adventure, Prehistoric tilesets)',
    '- **Pixel Buildings (`HoangLong256/pixel-buildings`)** — **CC0 1.0 Public Domain** (여름/겨울 주택·부두 오두막·계단)',
    '- **Kenney RPG Pack (`iwenzhou/kenney` CC0 Mirror)** — **CC0 1.0 Public Domain** (`rpgTile*.png`)',
    '- **OpenGameArt CC0 / CC-BY-SA Tilesets:** `voda_pesok_trava_revision_2.png` (CC0), `tileset_waterworld.png` (CC0), `desert_1_0_7.png`, `floortileset.png`',
    '',
    '## 2. 1280×540 다중 패럴랙스 전투 배경 (14종 아레나 × 3레이어 = 42장)',
    '- **Corrosive-Games/bevy-parallax** — **MIT/CC0** (`cyberpunk_*`, `fishy_*`, `mills-*`, `sky-clouds`, `sky-stars`)',
    '- **Superpowers Asset Packs** — **CC0 1.0 Public Domain** (`backgrounds/backgrounds/*`, `backgrounds/layers/*`, `rpg-battle-system/backgrounds/*`)',
    '- **OpenGameArt CC0 Packs:** `parallax_background_forest.zip`, `City.zip`, `parallax-industrial-pack_0.zip`',
    '',
    '## 3. 프레임 기반 전투 VFX 아틀라스 (12종)',
    '- **Superpowers Asset Packs** — **CC0 1.0 Public Domain** (`ninja-adventure/fx/*`, `rpg-battle-system/fx/*`, `prehistoric-platformer/fx/effects/*`)',
    '- **OpenGameArt VFX:** `Explosion_2.png` (CC-BY), `panorama18.png` & `panorama16.png` (CC0 / Permissive)',
    '',
    '## 4. 실제 BGM (10곡) & SFX (22종) 오디오',
    ...Object.entries(report.bgmSources || {}).map(([id, v]) => `- \`${id}.ogg\`: ${v.source}`),
    '- **SFX 22종:** Kenney Audio Packs (`RPG sounds`, `UI sounds`, `Digital sounds` — **CC0 1.0**) + Superpowers CC0 (`ninja-adventure/sounds`, `rpg-battle-system/sound`)',
    '',
    '## 5. 원피스 2D 도트 스프라이트 & 초상화 (개인 학습·연구 목적)',
    `- **Sprite Database (\`spritedatabase.net\`)**: *One Piece: Gigant Battle!* (game/2000) & *One Piece: Gigant Battle! 2 - New World* (game/2232) 공개 시트 ${report.spritesExternal}종 및 NDS 머그샷 초상화 ${report.portraitsExternal}장 정규화 적용.`
  ];
  fs.writeFileSync(path.join(ROOT, 'docs/ASSET_SOURCES.md'), `${lines.join('\n')}\n`, 'utf-8');
}

async function main() {
  fs.mkdirSync(RAW_DIR, { recursive: true });
  const report = {};
  await fetchTilesets(report);
  await fetchBattleBackdrops(report);
  await fetchVfxAtlases(report);
  await fetchAudioAssets(report);
  await fetchOnePieceSpritesAndPortraits(report);
  writeMissingSpritesReport(report);
  writeAssetSourcesDoc(report);
  console.log('\n🎉 All 5 asset categories fetched, normalized, and documented!');
}

main().catch((err) => {
  console.error('❌ fetch-web-assets failed:', err);
  process.exit(1);
});
