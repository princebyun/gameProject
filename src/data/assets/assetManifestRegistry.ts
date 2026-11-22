import audioJson from './audio.json';
import spritesJson from './sprites.json';
import tilesetsJson from './tilesets.json';
import {
  assertValidAudioManifestFile,
  assertValidSpriteManifestFile,
  assertValidTilesetManifestFile
} from '../schemaGuards';
import type {
  AudioManifestFile,
  BgmTrackManifestEntry,
  SfxManifestEntry,
  SpriteSheetManifestEntry,
  SpriteSheetManifestFile,
  TilesetManifestEntry,
  TilesetManifestFile
} from './types';

export interface AssetManifestRegistry {
  spritesFile: SpriteSheetManifestFile;
  spritesByKey: Record<string, SpriteSheetManifestEntry>;
  spritesMap: ReadonlyMap<string, SpriteSheetManifestEntry>;
  tilesetsFile: TilesetManifestFile;
  biomesById: Record<string, TilesetManifestEntry>;
  biomesMap: ReadonlyMap<string, TilesetManifestEntry>;
  audioFile: AudioManifestFile;
  bgmById: Record<string, BgmTrackManifestEntry>;
  bgmMap: ReadonlyMap<string, BgmTrackManifestEntry>;
  sfxById: Record<string, SfxManifestEntry>;
  sfxMap: ReadonlyMap<string, SfxManifestEntry>;
}

export function createAssetManifestRegistry(): AssetManifestRegistry {
  const spritesFile = assertValidSpriteManifestFile(spritesJson);
  const spritesByKey: Record<string, SpriteSheetManifestEntry> = {};
  const spritesMap = new Map<string, SpriteSheetManifestEntry>();
  for (const entry of spritesFile.entries) {
    spritesByKey[entry.key] = entry;
    spritesMap.set(entry.key, entry);
  }

  const tilesetsFile = assertValidTilesetManifestFile(tilesetsJson);
  const biomesById: Record<string, TilesetManifestEntry> = {};
  const biomesMap = new Map<string, TilesetManifestEntry>();
  for (const biome of tilesetsFile.biomes) {
    biomesById[biome.biomeId] = biome;
    biomesMap.set(biome.biomeId, biome);
  }

  const audioFile = assertValidAudioManifestFile(audioJson);
  const bgmById: Record<string, BgmTrackManifestEntry> = {};
  const bgmMap = new Map<string, BgmTrackManifestEntry>();
  for (const track of audioFile.bgmTracks) {
    bgmById[track.id] = track;
    bgmMap.set(track.id, track);
  }
  const sfxById: Record<string, SfxManifestEntry> = {};
  const sfxMap = new Map<string, SfxManifestEntry>();
  for (const sfx of audioFile.sfxEntries) {
    sfxById[sfx.id] = sfx;
    sfxMap.set(sfx.id, sfx);
  }

  return {
    spritesFile,
    spritesByKey,
    spritesMap,
    tilesetsFile,
    biomesById,
    biomesMap,
    audioFile,
    bgmById,
    bgmMap,
    sfxById,
    sfxMap
  };
}

export const defaultAssetManifestRegistry: AssetManifestRegistry =
  createAssetManifestRegistry();

export function resolveSpriteSheetEntry(
  unitId: string,
  activeFormId: string | null = null,
  registry: AssetManifestRegistry = defaultAssetManifestRegistry
): SpriteSheetManifestEntry | null {
  if (activeFormId) {
    const formEntry = registry.spritesMap.get(`${unitId}_${activeFormId}`);
    if (formEntry) {
      return formEntry;
    }
  }
  return registry.spritesMap.get(`${unitId}_base`) ?? null;
}

export function resolveShipSpriteEntry(
  shipId: string,
  registry: AssetManifestRegistry = defaultAssetManifestRegistry
): SpriteSheetManifestEntry | null {
  return (
    registry.spritesMap.get(`ship_${shipId}`) ??
    registry.spritesMap.get('ship_going_merry') ??
    null
  );
}

function getBiomeOrFirst(
  biomeId: string,
  registry: AssetManifestRegistry
): TilesetManifestEntry {
  const entry = registry.biomesMap.get(biomeId) ?? registry.tilesetsFile.biomes[0];
  if (!entry) {
    throw new Error(`Missing tileset biome entry for ${biomeId}`);
  }
  return entry;
}

export function resolveBiomeForSeaZone(
  zoneId: string,
  registry: AssetManifestRegistry = defaultAssetManifestRegistry
): TilesetManifestEntry {
  const biomeId = registry.tilesetsFile.seaZoneBiomeMap[zoneId] ?? 'sea_east_blue';
  return getBiomeOrFirst(biomeId, registry);
}

export function resolveBiomeForIsland(
  islandId: string,
  registry: AssetManifestRegistry = defaultAssetManifestRegistry
): TilesetManifestEntry {
  const biomeId = registry.tilesetsFile.islandBiomeMap[islandId] ?? 'port_town';
  return getBiomeOrFirst(biomeId, registry);
}

export function resolveBiomeForArena(
  arenaKey: string,
  registry: AssetManifestRegistry = defaultAssetManifestRegistry
): TilesetManifestEntry {
  const biomeId = registry.tilesetsFile.arenaBiomeMap[arenaKey] ?? 'port_town';
  return getBiomeOrFirst(biomeId, registry);
}

export function resolveBgmTrack(
  trackId: string,
  registry: AssetManifestRegistry = defaultAssetManifestRegistry
): BgmTrackManifestEntry | null {
  return registry.bgmMap.get(trackId) ?? null;
}

export function resolveSfxEntry(
  sfxId: string,
  registry: AssetManifestRegistry = defaultAssetManifestRegistry
): SfxManifestEntry | null {
  return registry.sfxMap.get(sfxId) ?? null;
}

export function resolveBgmForSeaZone(zoneId: string): string {
  if (zoneId === 'grand_line_first_half') return 'sea_grand_line';
  if (zoneId === 'new_world') return 'sea_new_world';
  return 'sea_east_blue';
}
