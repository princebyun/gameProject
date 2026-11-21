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

export interface SpriteAnimClipDef {
  row: number;
  frames: number;
  fps: number;
  loop: boolean;
  hitFrame?: number;
}

export interface SpriteSheetManifestEntry {
  key: string;
  unitId?: string;
  formId?: string;
  shipId?: string;
  rigType?: string;
  src: string;
  frameWidth: 32 | 48 | 64 | 96;
  frameHeight: 32 | 48 | 64 | 96;
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
