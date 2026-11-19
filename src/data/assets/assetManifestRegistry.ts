import audioJson from './audio.json';
import spritesJson from './sprites.json';
import tilesetsJson from './tilesets.json';
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
  tilesetsFile: TilesetManifestFile;
  biomesById: Record<string, TilesetManifestEntry>;
  audioFile: AudioManifestFile;
  bgmById: Record<string, BgmTrackManifestEntry>;
  sfxById: Record<string, SfxManifestEntry>;
}

export function createAssetManifestRegistry(): AssetManifestRegistry {
  const spritesFile = spritesJson as unknown as SpriteSheetManifestFile;
  const spritesByKey: Record<string, SpriteSheetManifestEntry> = {};
  for (const entry of spritesFile.entries) {
    spritesByKey[entry.key] = entry;
  }

  const tilesetsFile = tilesetsJson as unknown as TilesetManifestFile;
  const biomesById: Record<string, TilesetManifestEntry> = {};
  for (const biome of tilesetsFile.biomes) {
    biomesById[biome.biomeId] = biome;
  }

  const audioFile = audioJson as unknown as AudioManifestFile;
  const bgmById: Record<string, BgmTrackManifestEntry> = {};
  for (const track of audioFile.bgmTracks) {
    bgmById[track.id] = track;
  }
  const sfxById: Record<string, SfxManifestEntry> = {};
  for (const sfx of audioFile.sfxEntries) {
    sfxById[sfx.id] = sfx;
  }

  return {
    spritesFile,
    spritesByKey,
    tilesetsFile,
    biomesById,
    audioFile,
    bgmById,
    sfxById
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
    const formKey = `${unitId}_${activeFormId}`;
    if (registry.spritesByKey[formKey]) {
      return registry.spritesByKey[formKey];
    }
  }
  const baseKey = `${unitId}_base`;
  return registry.spritesByKey[baseKey] ?? null;
}

export function resolveShipSpriteEntry(
  shipId: string,
  registry: AssetManifestRegistry = defaultAssetManifestRegistry
): SpriteSheetManifestEntry | null {
  return (
    registry.spritesByKey[`ship_${shipId}`] ??
    registry.spritesByKey['ship_going_merry'] ??
    null
  );
}

export function resolveBiomeForSeaZone(
  zoneId: string,
  registry: AssetManifestRegistry = defaultAssetManifestRegistry
): TilesetManifestEntry {
  const biomeId = registry.tilesetsFile.seaZoneBiomeMap[zoneId] ?? 'sea_east_blue';
  return registry.biomesById[biomeId] ?? registry.tilesetsFile.biomes[0];
}

export function resolveBiomeForIsland(
  islandId: string,
  registry: AssetManifestRegistry = defaultAssetManifestRegistry
): TilesetManifestEntry {
  const biomeId = registry.tilesetsFile.islandBiomeMap[islandId] ?? 'port_town';
  return registry.biomesById[biomeId] ?? registry.tilesetsFile.biomes[0];
}

export function resolveBiomeForArena(
  arenaKey: string,
  registry: AssetManifestRegistry = defaultAssetManifestRegistry
): TilesetManifestEntry {
  const biomeId = registry.tilesetsFile.arenaBiomeMap[arenaKey] ?? 'port_town';
  return registry.biomesById[biomeId] ?? registry.tilesetsFile.biomes[0];
}

export function resolveBgmTrack(
  trackId: string,
  registry: AssetManifestRegistry = defaultAssetManifestRegistry
): BgmTrackManifestEntry | null {
  return registry.bgmById[trackId] ?? null;
}

export function resolveSfxEntry(
  sfxId: string,
  registry: AssetManifestRegistry = defaultAssetManifestRegistry
): SfxManifestEntry | null {
  return registry.sfxById[sfxId] ?? null;
}

export function resolveBgmForSeaZone(zoneId: string): string {
  if (zoneId === 'grand_line_first_half') return 'sea_grand_line';
  if (zoneId === 'new_world') return 'sea_new_world';
  return 'sea_east_blue';
}
