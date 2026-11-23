export type SpriteAnimState =
  | 'IDLE'
  | 'MOVE'
  | 'WINDUP'
  | 'ATTACK_MELEE'
  | 'ATTACK_CAST'
  | 'CLASH'
  | 'DODGE'
  | 'HIT'
  | 'DOWNED'
  | 'TRANSFORM'
  | 'VICTORY';

export const STANDARD_SPRITE_ANIM_STATES: readonly SpriteAnimState[] = [
  'IDLE',
  'MOVE',
  'WINDUP',
  'ATTACK_MELEE',
  'ATTACK_CAST',
  'CLASH',
  'DODGE',
  'HIT',
  'DOWNED',
  'TRANSFORM',
  'VICTORY'
] as const;

export type AssetSourceKind =
  | 'EXTERNAL_PNG'
  | 'EXTERNAL_OGG'
  | 'BAKED_FALLBACK'
  | 'CHIPTUNE_FALLBACK';

export interface SpriteAtlasFrameRect {
  x: number;
  y: number;
  w: number;
  h: number;
  pivotX: number;
  pivotY: number;
}

export interface SpriteAnimClipDef {
  row: number;
  frames: number;
  fps: number;
  loop: boolean;
  hitFrame?: number;
  frameRects?: SpriteAtlasFrameRect[];
}

export interface SpriteSheetManifestEntry {
  key: string;
  unitId?: string;
  formId?: string;
  shipId?: string;
  rigType?: string;
  source?: 'ARTICULATED_RIG_V2' | 'EXTERNAL_WEB_SHEET' | 'USER_CUSTOM_SHEET';
  atlasMode?: 'GRID' | 'VARIABLE_PACK';
  src: string;
  frameWidth: 32 | 48 | 64 | 96 | 128;
  frameHeight: 32 | 48 | 64 | 96 | 128;
  targetDisplayHeight?: number;
  anchor: { x: number; y: number };
  animations: Record<SpriteAnimState, SpriteAnimClipDef>;
}

export interface SpriteSheetManifestFile {
  version: string;
  standardRowOrder: SpriteAnimState[];
  entries: SpriteSheetManifestEntry[];
}

export interface TilesetPalette {
  base: string;
  detail: string;
  edge: string;
  wall: string;
  accent: string;
  waterOrHazard: string;
}

export interface TilesetManifestEntry {
  biomeId: string;
  category: 'SEA' | 'ISLAND_DUNGEON';
  name: string;
  src: string;
  tileSize: 16;
  renderScale: 2;
  layeredAtlas?: boolean;
  rows?: number;
  animatedRow: number;
  animatedFrames: number;
  animatedFps: number;
  palette: TilesetPalette;
}

export interface TilesetManifestFile {
  version: string;
  tileSize: 16;
  islandBiomeMap: Record<string, string>;
  seaZoneBiomeMap: Record<string, string>;
  arenaBiomeMap: Record<string, string>;
  biomes: TilesetManifestEntry[];
}

export interface ChiptunePatternPreset {
  keyRootMidi: number;
  scale: 'MAJOR' | 'MINOR' | 'DORIAN' | 'PHRYGIAN';
  leadPattern: number[];
  arpPattern: number[];
  bassPattern: number[];
  drumPattern: number[];
}

export interface BgmTrackManifestEntry {
  id: string;
  name: string;
  src: string;
  loop: boolean;
  loopStartSec: number;
  loopEndSec: number;
  bpm: number;
  volume: number;
  chiptunePreset: ChiptunePatternPreset;
}

export interface SfxManifestEntry {
  id: string;
  name: string;
  src: string;
  volume: number;
  throttleMs: number;
  maxPolyphony: number;
  pitchJitterRatio: number;
  synthPreset: string;
}

export interface AudioManifestFile {
  version: string;
  crossfadeSec: number;
  bgmTracks: BgmTrackManifestEntry[];
  sfxEntries: SfxManifestEntry[];
}

export type BackdropLayerKey = 'sky' | 'mid' | 'ground';

export interface BattleBackdropLayerSet {
  sky: string;
  mid: string;
  ground: string;
}

export interface BattleBackdropManifestEntry {
  id: string;
  name: string;
  width: number;
  height: number;
  groundY: number;
  timeOfDay: 'DAY' | 'DUSK' | 'NIGHT';
  ambientTint: string;
  parallaxFactors: [number, number, number];
  layers: BattleBackdropLayerSet;
}

export interface BattleBackdropsManifestFile {
  version: string;
  islandBackdropMap: Record<string, string>;
  seaZoneBackdropMap: Record<string, string>;
  arenaModeBackdropMap: Record<string, string>;
  backdrops: BattleBackdropManifestEntry[];
}

export type VfxAtlasId =
  | 'slash_arc'
  | 'cross_slash'
  | 'fire_explosion'
  | 'lightning_strike'
  | 'conqueror_bolt'
  | 'ice_shatter'
  | 'water_splash'
  | 'smoke_puff'
  | 'hit_spark'
  | 'parry_flash'
  | 'beam_core'
  | 'awakening_burst';

export interface VfxAtlasManifestEntry {
  id: VfxAtlasId | string;
  src: string;
  frameWidth: number;
  frameHeight: number;
  frameCount: number;
  fps: number;
  blendMode: 'source-over' | 'lighter';
  scale: number;
}

export interface VfxManifestFile {
  version: string;
  atlases: VfxAtlasManifestEntry[];
}
