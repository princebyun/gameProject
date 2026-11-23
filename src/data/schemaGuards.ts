import type {
  BgmTrackManifestEntry,
  SfxManifestEntry,
  SpriteSheetManifestEntry,
  TilesetManifestEntry
} from './assets/types';
import {
  assertArray,
  assertNonEmptyString,
  assertNumber,
  assertRecord,
  assertString,
  assertValidStatBlock
} from './schemaGuardPrimitives';
import type {
  AiProfileDefinition,
  BalanceConfig,
  ElementMetadata,
  ElementsConfig,
  EquipmentDefinition,
  FormDefinition,
  MoveDefinition,
  TraitDefinition,
  UnitDefinition
} from './schemas/gameDataSchemas';

export {
  assertArray,
  assertBoolean,
  assertNonEmptyString,
  assertNumber,
  assertRecord,
  assertString,
  assertValidStatBlock,
  isRecord
} from './schemaGuardPrimitives';

export {
  assertValidAssetManifestRegistry,
  assertValidAudioManifestFile,
  assertValidBattleBackdropsManifestFile,
  assertValidColosseumConfig,
  assertValidCrewRoleDefinition,
  assertValidEndgameRegistry,
  assertValidEpisodeDefinition,
  assertValidImpelDownConfig,
  assertValidIslandMapDefinition,
  assertValidRaidBossDefinition,
  assertValidRaidRelicDefinition,
  assertValidRecruitmentRule,
  assertValidSeaZoneDefinition,
  assertValidShipDefinition,
  assertValidSpriteManifestFile,
  assertValidTilesetManifestFile,
  assertValidTrainingRule,
  assertValidTutorMoveDefinition,
  assertValidVfxManifestFile,
  assertValidWorldLandmarkManifestFile
} from './rpgAndAssetSchemaGuards';

export function assertValidBalanceConfig(value: unknown): BalanceConfig {
  const obj = assertRecord(value, 'balance');
  assertNumber(obj['fixedDt'], 'balance.fixedDt');
  assertRecord(obj['arenaDefaults'], 'balance.arenaDefaults');
  assertRecord(obj['unitPhysics'], 'balance.unitPhysics');
  assertRecord(obj['dodge'], 'balance.dodge');
  assertRecord(obj['roster'], 'balance.roster');
  assertRecord(obj['projectile'], 'balance.projectile');
  assertRecord(obj['beam'], 'balance.beam');
  assertRecord(obj['melee'], 'balance.melee');
  assertRecord(obj['field'], 'balance.field');
  assertRecord(obj['status'], 'balance.status');
  assertRecord(obj['formShift'], 'balance.formShift');
  assertRecord(obj['presentation'], 'balance.presentation');
  return obj as unknown as BalanceConfig;
}

export function assertValidElementsConfig(value: unknown): ElementsConfig {
  const obj = assertRecord(value, 'elements');
  const elements = assertArray(obj['elements'], 'elements.elements');
  for (let i = 0; i < elements.length; i++) {
    const el = assertRecord(elements[i], `elements.elements[${i}]`);
    assertNonEmptyString(el['id'], `elements.elements[${i}].id`);
    assertNonEmptyString(el['name'], `elements.elements[${i}].name`);
    assertNonEmptyString(el['color'], `elements.elements[${i}].color`);
  }
  assertRecord(obj['matrix'], 'elements.matrix');
  return obj as unknown as ElementsConfig;
}

export function assertValidTraitDefinition(
  value: unknown,
  index: number,
  source = 'traits'
): TraitDefinition {
  const ctx = `${source}[${index}]`;
  const obj = assertRecord(value, ctx);
  assertNonEmptyString(obj['id'], `${ctx}.id`);
  assertNonEmptyString(obj['name'], `${ctx}.name`);
  assertString(obj['description'], `${ctx}.description`);
  assertArray(obj['hooks'], `${ctx}.hooks`);
  return obj as unknown as TraitDefinition;
}

export function assertValidMoveDefinition(value: unknown, index: number): MoveDefinition {
  const ctx = `moves[${index}]`;
  const obj = assertRecord(value, ctx);
  assertNonEmptyString(obj['id'], `${ctx}.id`);
  assertNonEmptyString(obj['name'], `${ctx}.name`);
  assertNonEmptyString(obj['element'], `${ctx}.element`);
  assertNonEmptyString(obj['archetype'], `${ctx}.archetype`);
  assertNonEmptyString(obj['category'], `${ctx}.category`);
  assertNumber(obj['basePower'], `${ctx}.basePower`);
  assertNumber(obj['maxCharges'], `${ctx}.maxCharges`);
  assertNumber(obj['chargeRecoverySec'], `${ctx}.chargeRecoverySec`);
  assertNumber(obj['cooldownSec'], `${ctx}.cooldownSec`);
  assertNumber(obj['windupSec'], `${ctx}.windupSec`);
  assertNumber(obj['activeDurationSec'], `${ctx}.activeDurationSec`);
  assertNumber(obj['rangePx'], `${ctx}.rangePx`);
  assertNumber(obj['radiusPx'], `${ctx}.radiusPx`);
  return obj as unknown as MoveDefinition;
}

export function assertValidFormDefinition(value: unknown, index: number): FormDefinition {
  const ctx = `forms[${index}]`;
  const obj = assertRecord(value, ctx);
  assertNonEmptyString(obj['id'], `${ctx}.id`);
  assertNonEmptyString(obj['name'], `${ctx}.name`);
  assertNonEmptyString(obj['kind'], `${ctx}.kind`);
  assertRecord(obj['statMultipliers'], `${ctx}.statMultipliers`);
  assertNumber(obj['visualScale'], `${ctx}.visualScale`);
  assertNonEmptyString(obj['auraColor'], `${ctx}.auraColor`);
  return obj as unknown as FormDefinition;
}

export function assertValidEquipmentDefinition(
  value: unknown,
  index: number
): EquipmentDefinition {
  const ctx = `equipment[${index}]`;
  const obj = assertRecord(value, ctx);
  assertNonEmptyString(obj['id'], `${ctx}.id`);
  assertNonEmptyString(obj['name'], `${ctx}.name`);
  assertString(obj['description'], `${ctx}.description`);
  assertRecord(obj['statModifiers'], `${ctx}.statModifiers`);
  return obj as unknown as EquipmentDefinition;
}

export function assertValidUnitDefinition(value: unknown, index: number): UnitDefinition {
  const ctx = `units[${index}]`;
  const obj = assertRecord(value, ctx);
  assertNonEmptyString(obj['id'], `${ctx}.id`);
  assertNonEmptyString(obj['name'], `${ctx}.name`);
  assertNonEmptyString(obj['element'], `${ctx}.element`);
  assertNonEmptyString(obj['traitId'], `${ctx}.traitId`);
  assertNonEmptyString(obj['defaultFormId'], `${ctx}.defaultFormId`);
  assertNonEmptyString(obj['defaultEquipmentId'], `${ctx}.defaultEquipmentId`);
  assertValidStatBlock(obj['baseStats'], `${ctx}.baseStats`);
  const defaultMoves = assertArray(obj['defaultMoves'], `${ctx}.defaultMoves`);
  for (let i = 0; i < defaultMoves.length; i++) {
    assertNonEmptyString(defaultMoves[i], `${ctx}.defaultMoves[${i}]`);
  }
  const palette = assertRecord(obj['palette'], `${ctx}.palette`);
  assertNonEmptyString(palette['primary'], `${ctx}.palette.primary`);
  assertNonEmptyString(palette['secondary'], `${ctx}.palette.secondary`);
  assertNonEmptyString(palette['accent'], `${ctx}.palette.accent`);
  assertNonEmptyString(palette['shape'], `${ctx}.palette.shape`);
  return obj as unknown as UnitDefinition;
}

export function assertValidAiProfileDefinition(
  value: unknown,
  index: number
): AiProfileDefinition {
  const ctx = `aiProfiles[${index}]`;
  const obj = assertRecord(value, ctx);
  assertNumber(obj['level'], `${ctx}.level`);
  assertNonEmptyString(obj['name'], `${ctx}.name`);
  assertNumber(obj['statMultiplier'], `${ctx}.statMultiplier`);
  assertNumber(obj['reactionDelaySec'], `${ctx}.reactionDelaySec`);
  return obj as unknown as AiProfileDefinition;
}

export type ValidatedElementMetadata = ElementMetadata;
export type ValidatedSpriteEntry = SpriteSheetManifestEntry;
export type ValidatedTilesetEntry = TilesetManifestEntry;
export type ValidatedBgmEntry = BgmTrackManifestEntry;
export type ValidatedSfxEntry = SfxManifestEntry;
