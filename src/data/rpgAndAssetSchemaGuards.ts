import type {
  AudioManifestFile,
  SpriteSheetManifestFile,
  TilesetManifestFile
} from './assets/types';
import {
  assertArray,
  assertBoolean,
  assertNonEmptyString,
  assertNumber,
  assertRecord
} from './schemaGuardPrimitives';
import type {
  ColosseumConfig,
  EndgameDataRegistry,
  ImpelDownConfig,
  RaidBossDefinition,
  RaidRelicDefinition,
  TutorMoveDefinition
} from './schemas/endgameSchemas';
import type {
  CrewRoleDefinition,
  EpisodeDefinition,
  IslandMapDefinition,
  RecruitmentRule,
  SeaZoneDefinition,
  ShipDefinition,
  TrainingUpgradeRule
} from './schemas/rpgSchemas';

export function assertValidSeaZoneDefinition(
  value: unknown,
  index: number
): SeaZoneDefinition {
  const ctx = `seaZones[${index}]`;
  const obj = assertRecord(value, ctx);
  assertNonEmptyString(obj['id'], `${ctx}.id`);
  assertNonEmptyString(obj['name'], `${ctx}.name`);
  assertNumber(obj['width'], `${ctx}.width`);
  assertNumber(obj['height'], `${ctx}.height`);
  assertArray(obj['islands'], `${ctx}.islands`);
  return obj as unknown as SeaZoneDefinition;
}

export function assertValidShipDefinition(value: unknown, index: number): ShipDefinition {
  const ctx = `ships[${index}]`;
  const obj = assertRecord(value, ctx);
  assertNonEmptyString(obj['id'], `${ctx}.id`);
  assertNonEmptyString(obj['name'], `${ctx}.name`);
  assertNumber(obj['maxHullHp'], `${ctx}.maxHullHp`);
  assertNumber(obj['maxSpeedPx'], `${ctx}.maxSpeedPx`);
  return obj as unknown as ShipDefinition;
}

export function assertValidCrewRoleDefinition(
  value: unknown,
  index: number
): CrewRoleDefinition {
  const ctx = `crewRoles[${index}]`;
  const obj = assertRecord(value, ctx);
  assertNonEmptyString(obj['roleId'], `${ctx}.roleId`);
  assertNonEmptyString(obj['name'], `${ctx}.name`);
  assertNonEmptyString(obj['defaultHolderName'], `${ctx}.defaultHolderName`);
  return obj as unknown as CrewRoleDefinition;
}

export function assertValidRecruitmentRule(value: unknown, index: number): RecruitmentRule {
  const ctx = `recruitmentRules[${index}]`;
  const obj = assertRecord(value, ctx);
  assertNonEmptyString(obj['id'], `${ctx}.id`);
  assertNonEmptyString(obj['unitId'], `${ctx}.unitId`);
  assertNonEmptyString(obj['triggerEpisodeId'], `${ctx}.triggerEpisodeId`);
  assertNonEmptyString(obj['defaultRole'], `${ctx}.defaultRole`);
  return obj as unknown as RecruitmentRule;
}

export function assertValidTrainingRule(
  value: unknown,
  index: number
): TrainingUpgradeRule {
  const ctx = `trainingRules[${index}]`;
  const obj = assertRecord(value, ctx);
  assertNonEmptyString(obj['id'], `${ctx}.id`);
  assertNonEmptyString(obj['name'], `${ctx}.name`);
  assertNonEmptyString(obj['category'], `${ctx}.category`);
  assertNumber(obj['costBerries'], `${ctx}.costBerries`);
  assertNumber(obj['costTrainingPoints'], `${ctx}.costTrainingPoints`);
  return obj as unknown as TrainingUpgradeRule;
}

export function assertValidIslandMapDefinition(
  value: unknown,
  index: number
): IslandMapDefinition {
  const ctx = `islands[${index}]`;
  const obj = assertRecord(value, ctx);
  assertNonEmptyString(obj['islandId'], `${ctx}.islandId`);
  assertNonEmptyString(obj['name'], `${ctx}.name`);
  assertNonEmptyString(obj['episodeId'], `${ctx}.episodeId`);
  assertNumber(obj['width'], `${ctx}.width`);
  assertNumber(obj['height'], `${ctx}.height`);
  assertArray(obj['npcs'], `${ctx}.npcs`);
  assertArray(obj['encounters'], `${ctx}.encounters`);
  return obj as unknown as IslandMapDefinition;
}

export function assertValidEpisodeDefinition(
  value: unknown,
  index: number
): EpisodeDefinition {
  const ctx = `episodes[${index}]`;
  const obj = assertRecord(value, ctx);
  assertNonEmptyString(obj['episodeId'], `${ctx}.episodeId`);
  assertNonEmptyString(obj['islandId'], `${ctx}.islandId`);
  assertNonEmptyString(obj['zoneId'], `${ctx}.zoneId`);
  assertNonEmptyString(obj['title'], `${ctx}.title`);
  assertBoolean(obj['requiredForNextZone'], `${ctx}.requiredForNextZone`);
  assertArray(obj['steps'], `${ctx}.steps`);
  assertRecord(obj['rewards'], `${ctx}.rewards`);
  return obj as unknown as EpisodeDefinition;
}

export function assertValidImpelDownConfig(value: unknown): ImpelDownConfig {
  const obj = assertRecord(value, 'endgame.impelDown');
  assertNonEmptyString(obj['unlockEpisodeId'], 'endgame.impelDown.unlockEpisodeId');
  assertArray(obj['floors'], 'endgame.impelDown.floors');
  assertArray(obj['buffs'], 'endgame.impelDown.buffs');
  return obj as unknown as ImpelDownConfig;
}

export function assertValidColosseumConfig(value: unknown): ColosseumConfig {
  const obj = assertRecord(value, 'endgame.colosseum');
  assertNonEmptyString(obj['unlockEpisodeId'], 'endgame.colosseum.unlockEpisodeId');
  assertNumber(obj['maxLegalCp'], 'endgame.colosseum.maxLegalCp');
  assertRecord(obj['ringOutDefaults'], 'endgame.colosseum.ringOutDefaults');
  assertArray(obj['leagues'], 'endgame.colosseum.leagues');
  return obj as unknown as ColosseumConfig;
}

export function assertValidTutorMoveDefinition(
  value: unknown,
  index: number
): TutorMoveDefinition {
  const ctx = `tutorMoves[${index}]`;
  const obj = assertRecord(value, ctx);
  assertNonEmptyString(obj['moveId'], `${ctx}.moveId`);
  assertNonEmptyString(obj['name'], `${ctx}.name`);
  assertNumber(obj['costCp'], `${ctx}.costCp`);
  return obj as unknown as TutorMoveDefinition;
}

export function assertValidRaidBossDefinition(
  value: unknown,
  index: number
): RaidBossDefinition {
  const ctx = `raids[${index}]`;
  const obj = assertRecord(value, ctx);
  assertNonEmptyString(obj['raidId'], `${ctx}.raidId`);
  assertNonEmptyString(obj['name'], `${ctx}.name`);
  assertNonEmptyString(obj['speciesId'], `${ctx}.speciesId`);
  assertNumber(obj['breakGaugeMax'], `${ctx}.breakGaugeMax`);
  assertArray(obj['telegraphPatterns'], `${ctx}.telegraphPatterns`);
  return obj as unknown as RaidBossDefinition;
}

export function assertValidRaidRelicDefinition(
  value: unknown,
  index: number
): RaidRelicDefinition {
  const ctx = `raidRelics[${index}]`;
  const obj = assertRecord(value, ctx);
  assertNonEmptyString(obj['relicId'], `${ctx}.relicId`);
  assertNonEmptyString(obj['name'], `${ctx}.name`);
  assertNonEmptyString(obj['requiredRaidId'], `${ctx}.requiredRaidId`);
  assertRecord(obj['modifiers'], `${ctx}.modifiers`);
  return obj as unknown as RaidRelicDefinition;
}

export function assertValidEndgameRegistry(
  registry: Pick<
    EndgameDataRegistry,
    'impelDown' | 'colosseum' | 'tutorMoves' | 'raids' | 'raidRelics'
  >
): void {
  assertValidImpelDownConfig(registry.impelDown);
  assertValidColosseumConfig(registry.colosseum);
  Object.values(registry.tutorMoves).forEach((m, idx) =>
    assertValidTutorMoveDefinition(m, idx)
  );
  Object.values(registry.raids).forEach((r, idx) =>
    assertValidRaidBossDefinition(r, idx)
  );
  Object.values(registry.raidRelics).forEach((rel, idx) =>
    assertValidRaidRelicDefinition(rel, idx)
  );
}

export function assertValidSpriteManifestFile(value: unknown): SpriteSheetManifestFile {
  const obj = assertRecord(value, 'assets.spritesFile');
  const entries = assertArray(obj['entries'], 'assets.spritesFile.entries');
  for (let i = 0; i < entries.length; i++) {
    const e = assertRecord(entries[i], `assets.spritesFile.entries[${i}]`);
    assertNonEmptyString(e['key'], `sprites[${i}].key`);
    assertNonEmptyString(e['src'], `sprites[${i}].src`);
    assertNumber(e['frameWidth'], `sprites[${i}].frameWidth`);
    assertNumber(e['frameHeight'], `sprites[${i}].frameHeight`);
    assertRecord(e['anchor'], `sprites[${i}].anchor`);
    assertRecord(e['animations'], `sprites[${i}].animations`);
  }
  return obj as unknown as SpriteSheetManifestFile;
}

export function assertValidTilesetManifestFile(value: unknown): TilesetManifestFile {
  const obj = assertRecord(value, 'assets.tilesetsFile');
  const biomes = assertArray(obj['biomes'], 'assets.tilesetsFile.biomes');
  for (let i = 0; i < biomes.length; i++) {
    const b = assertRecord(biomes[i], `tilesets[${i}].biomeId`);
    assertNonEmptyString(b['biomeId'], `tilesets[${i}].biomeId`);
    assertNonEmptyString(b['src'], `tilesets[${i}].src`);
    assertRecord(b['palette'], `tilesets[${i}].palette`);
  }
  return obj as unknown as TilesetManifestFile;
}

export function assertValidAudioManifestFile(value: unknown): AudioManifestFile {
  const obj = assertRecord(value, 'assets.audioFile');
  const bgms = assertArray(obj['bgmTracks'], 'assets.audioFile.bgmTracks');
  for (let i = 0; i < bgms.length; i++) {
    const b = assertRecord(bgms[i], `bgmTracks[${i}]`);
    assertNonEmptyString(b['id'], `bgmTracks[${i}].id`);
    assertNonEmptyString(b['src'], `bgmTracks[${i}].src`);
    assertRecord(b['chiptunePreset'], `bgmTracks[${i}].chiptunePreset`);
  }
  const sfx = assertArray(obj['sfxEntries'], 'assets.audioFile.sfxEntries');
  for (let i = 0; i < sfx.length; i++) {
    const s = assertRecord(sfx[i], `sfxEntries[${i}]`);
    assertNonEmptyString(s['id'], `sfxEntries[${i}].id`);
    assertNonEmptyString(s['src'], `sfxEntries[${i}].src`);
  }
  return obj as unknown as AudioManifestFile;
}

export function assertValidAssetManifestRegistry(value: {
  spritesFile: SpriteSheetManifestFile;
  tilesetsFile: TilesetManifestFile;
  audioFile: AudioManifestFile;
}): void {
  assertValidSpriteManifestFile(value.spritesFile);
  assertValidTilesetManifestFile(value.tilesetsFile);
  assertValidAudioManifestFile(value.audioFile);
}
