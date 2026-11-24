import {
  getMusouTypeProfile,
  resolveMusouActionTypeForUnit,
  type MusouActionTypeDefinition
} from '../../../data/musouTypesRegistry';
import {
  BASE_GRAVITY_MM_PER_TICK_SQ,
  BASE_POWER_DASH_COST,
  BURST_ATK_PERMILLE,
  BURST_SPEED_PERMILLE,
  type MusouActionType,
  type MusouPlayerRuntime
} from './MusouTypes';

export interface ArmorDamageModifiers {
  isCharge: boolean;
  isSpecial: boolean;
  isParryCounter: boolean;
  isAirborneAttacker: boolean;
  isBurstActive: boolean;
  markDetonated: boolean;
}

export function scalePermille(value: number, permille: number): number {
  return Math.round((value * permille) / 1000);
}

export function resolveEffectiveActionType(
  player: Pick<MusouPlayerRuntime, 'speciesId' | 'activeFormId' | 'actionTypeOverride'>
): MusouActionType {
  if (player.actionTypeOverride) {
    return player.actionTypeOverride;
  }
  return resolveMusouActionTypeForUnit(player.speciesId, player.activeFormId);
}

export function getActiveActionProfile(
  player: Pick<MusouPlayerRuntime, 'speciesId' | 'activeFormId' | 'actionTypeOverride'>
): MusouActionTypeDefinition {
  return getMusouTypeProfile(resolveEffectiveActionType(player));
}

export function computePowerDashStaminaCost(
  profile: MusouActionTypeDefinition
): number {
  return scalePermille(BASE_POWER_DASH_COST, profile.dashStaminaCostPermille);
}

export function computeEffectiveAirGravity(
  profile: MusouActionTypeDefinition
): number {
  return Math.max(1, scalePermille(BASE_GRAVITY_MM_PER_TICK_SQ, profile.airGravityPermille));
}

export function computeAttackPhaseDurationTicks(
  baseTicks: number,
  profile: MusouActionTypeDefinition,
  burstActive: boolean
): number {
  const effectiveSpeedPermille = burstActive
    ? scalePermille(profile.attackSpeedPermille, BURST_SPEED_PERMILLE)
    : profile.attackSpeedPermille;
  return Math.max(4, Math.round((baseTicks * 1000) / Math.max(500, effectiveSpeedPermille)));
}

export function computeEffectiveKnockbackMm(
  baseKnockbackMm: number,
  isCharge: boolean,
  profile: MusouActionTypeDefinition
): number {
  if (!isCharge) return baseKnockbackMm;
  return scalePermille(baseKnockbackMm, profile.chargeKnockbackPermille);
}

export function computeBurstAoeRadiusMm(
  baseRadiusMm: number,
  profile: MusouActionTypeDefinition,
  burstActive: boolean
): number {
  if (!burstActive) return baseRadiusMm;
  return scalePermille(baseRadiusMm, profile.burstAoeRadiusPermille);
}

export function computeOffensiveDamageScalePermille(
  burstActive: boolean
): number {
  return burstActive ? BURST_ATK_PERMILLE : 1000;
}

export function computeBossArmorDamage(
  baseArmorDamage: number,
  mods: ArmorDamageModifiers,
  profile: MusouActionTypeDefinition
): number {
  let scaled = scalePermille(baseArmorDamage, profile.bossArmorDamagePermille);
  if (mods.isCharge) {
    scaled = scalePermille(scaled, 1450);
  }
  if (mods.isSpecial) {
    scaled = scalePermille(scaled, 1600);
  }
  if (mods.isParryCounter) {
    scaled = scalePermille(scaled, 1800);
  }
  if (mods.isAirborneAttacker) {
    scaled = scalePermille(scaled, profile.airArmorDamagePermille);
  }
  if (mods.markDetonated) {
    scaled = scalePermille(scaled, profile.markDetonateArmorPermille);
  }
  if (mods.isBurstActive) {
    scaled = scalePermille(scaled, 1250);
  }
  return Math.max(1, scaled);
}
