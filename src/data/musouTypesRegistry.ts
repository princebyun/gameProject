import musouTypesJson from './musou_types.json';

export type MusouActionTypeId = 'POWER' | 'SPEED' | 'TECHNIQUE' | 'SKY';
export type MusouSpecialSlotKind = 'AOE' | 'DASH' | 'MARK_BUFF' | 'ULTIMATE';

export interface MusouActionTypeDefinition {
  actionType: MusouActionTypeId;
  badgeText: string;
  labelKo: string;
  themeColor: string;
  chargeKnockbackPermille: number;
  bossArmorDamagePermille: number;
  dashStaminaCostPermille: number;
  attackSpeedPermille: number;
  airGravityPermille: number;
  maxAirDashes: number;
  airArmorDamagePermille: number;
  burstAoeRadiusPermille: number;
  burstSuperArmor: boolean;
  postCancelCritBonusPermille: number;
  postCancelCritDurationTicks: number;
  markDurationTicks: number;
  markDetonateArmorPermille: number;
  markDetonatePullRadiusMm: number;
}

export interface MusouSpecialSkillDefinition {
  skillId: string;
  label: string;
  kind: MusouSpecialSlotKind;
  maxCooldownTicks: number;
  armorDamage: number;
  hpDamage: number;
  radiusMm: number;
  superArmorTicks: number;
  launchesAir: boolean;
  appliesMark: boolean;
  detonatesMark: boolean;
}

interface RawMusouTypesPayload {
  version: string;
  types: Record<MusouActionTypeId, MusouActionTypeDefinition>;
  unitTypeMap: Record<string, MusouActionTypeId>;
  formTypeMap: Record<string, MusouActionTypeId>;
  burstAwakeningForms: Record<string, string>;
  specialLoadouts: Record<string, MusouSpecialSkillDefinition[]>;
}

const REGISTRY_DATA = musouTypesJson as RawMusouTypesPayload;

export const ALL_MUSOU_ACTION_TYPES: readonly MusouActionTypeId[] = [
  'POWER',
  'SPEED',
  'TECHNIQUE',
  'SKY'
];

export function getMusouTypeProfile(
  actionType: MusouActionTypeId
): MusouActionTypeDefinition {
  return REGISTRY_DATA.types[actionType] ?? REGISTRY_DATA.types.POWER;
}

export function resolveMusouActionTypeForUnit(
  speciesId: string,
  activeFormId: string | null
): MusouActionTypeId {
  if (activeFormId) {
    const formMapped = REGISTRY_DATA.formTypeMap[activeFormId];
    if (formMapped) return formMapped;
  }
  const unitMapped = REGISTRY_DATA.unitTypeMap[speciesId];
  return unitMapped ?? 'POWER';
}

export function getBurstAwakeningFormId(speciesId: string): string | null {
  return REGISTRY_DATA.burstAwakeningForms[speciesId] ?? null;
}

export function getMusouSpecialLoadout(
  speciesId: string
): readonly MusouSpecialSkillDefinition[] {
  const custom = REGISTRY_DATA.specialLoadouts[speciesId];
  if (custom && custom.length >= 4) {
    return custom.slice(0, 4);
  }
  return REGISTRY_DATA.specialLoadouts.default ?? [];
}
