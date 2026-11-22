import type { BattleWorldState, UnitRuntimeState } from '../types/battleState';
import type {
  BalanceConfig,
  ElementId,
  ElementsConfig,
  GameDataRegistry,
  MoveCategory
} from '../types/dataSchemas';
import {
  evaluateHitInteractions,
  type DamageHakiOptions,
  type HitInteractionEvaluation
} from './hitInteractionEvaluator';
import {
  computeBeamDynamicRange,
  computeEffectiveStats,
  getElementAffinity,
  getUnitCurrentStat
} from './statCalculator';

export {
  computeBeamDynamicRange,
  computeEffectiveStats,
  evaluateHitInteractions,
  getElementAffinity,
  getUnitCurrentStat,
  type DamageHakiOptions,
  type HitInteractionEvaluation
};

export function computeEffectiveClashPower(
  basePower: number,
  offensiveStat: number,
  attackElement: ElementId,
  opposingElement: ElementId,
  traitClashMult: number,
  elementsConfig: ElementsConfig,
  hasConquerorCoating: boolean = false,
  hasArmamentHaki: boolean = false
): number {
  const affinity = getElementAffinity(elementsConfig, attackElement, opposingElement);
  const conqMult = hasConquerorCoating ? 1.35 : 1.0;
  const armMult = hasArmamentHaki ? 1.12 : 1.0;
  return basePower * (offensiveStat / 100) * affinity * traitClashMult * conqMult * armMult;
}

export function computeWeatherElementMultiplier(
  element: ElementId,
  world: BattleWorldState,
  balance: BalanceConfig
): number {
  if (world.weather.remainingSec <= 0 || world.weather.id === 'NONE') {
    return 1.0;
  }
  if (world.weather.id === 'SOLAR_FLARE') {
    if (element === 'PYRO' || element === 'FIRE' || element === 'MAGMA') {
      return balance.field.weatherBoostMultiplier;
    }
    if (element === 'AQUA' || element === 'ICE') {
      return balance.field.weatherWeakenMultiplier;
    }
  } else if (world.weather.id === 'TEMPEST_RAIN') {
    if (element === 'AQUA' || element === 'SEA') {
      return balance.field.weatherBoostMultiplier;
    }
    if (element === 'PYRO' || element === 'FIRE') {
      return balance.field.weatherWeakenMultiplier;
    }
  } else if (world.weather.id === 'ION_STORM') {
    if (
      element === 'VOLT' ||
      element === 'VOID' ||
      element === 'LIGHTNING' ||
      element === 'LIGHT'
    ) {
      return balance.field.weatherBoostMultiplier;
    }
  }
  return 1.0;
}

export function computeDamage(
  movePower: number,
  attacker: UnitRuntimeState,
  defender: UnitRuntimeState,
  category: MoveCategory,
  moveElement: ElementId,
  world: BattleWorldState,
  registry: GameDataRegistry,
  hakiOpts: DamageHakiOptions = {}
): {
  damage: number;
  affinity: number;
  nullified?: boolean;
  nullifyReason?:
    | 'NONE'
    | 'LOGIA_INTANGIBLE'
    | 'ELEMENT_IMMUNE'
    | 'SLASH_SPLIT'
    | 'FORESIGHT_EVADE';
} {
  if (movePower <= 0) {
    return { damage: 0, affinity: 1.0, nullified: false, nullifyReason: 'NONE' };
  }

  const effectiveArmament = Boolean(hakiOpts.hasArmamentHaki);
  const interaction = evaluateHitInteractions(
    defender,
    moveElement,
    effectiveArmament,
    registry,
    Boolean(hakiOpts.isProjectile),
    attacker,
    hakiOpts
  );

  if (interaction.nullified) {
    if (interaction.nullifyReason === 'LOGIA_INTANGIBLE') {
      defender.logiaDispersionTimer = 0.38;
    } else if (interaction.nullifyReason === 'SLASH_SPLIT') {
      defender.baraSplitTimer = 0.48;
    } else if (interaction.nullifyReason === 'FORESIGHT_EVADE') {
      defender.mochiMorphTimer = 0.48;
    }
    return {
      damage: 0,
      affinity: 0,
      nullified: true,
      nullifyReason: interaction.nullifyReason
    };
  }

  const atkStat =
    category === 'PHYSICAL'
      ? getUnitCurrentStat(attacker, 'atk', world, registry)
      : getUnitCurrentStat(attacker, 'spAtk', world, registry);
  let defStat =
    category === 'PHYSICAL'
      ? getUnitCurrentStat(defender, 'def', world, registry)
      : getUnitCurrentStat(defender, 'spDef', world, registry);

  const hasInternalDestruction =
    Boolean(hakiOpts.isInternalDestruction) ||
    (effectiveArmament && attacker.haki.armament >= 3);
  if (hasInternalDestruction) {
    defStat *= 0.65;
  }
  if (attacker.endgameArmorPenRatio > 0) {
    defStat *= Math.max(0.25, 1 - attacker.endgameArmorPenRatio);
  }

  let hakiMult = 1.0;
  if (effectiveArmament && attacker.haki.armament > 0) {
    hakiMult *= 1 + attacker.haki.armament * 0.06;
  }
  if (hakiOpts.hasConquerorCoating && attacker.haki.conqueror >= 3) {
    hakiMult *= 1.22;
  }

  let envMult = 1.0;
  if (
    world.environmentField.kind !== 'NONE' &&
    world.environmentField.remainingSec > 0 &&
    world.environmentField.ownerUnitId === attacker.instanceId
  ) {
    envMult = 1.18;
  }
  const inMagmaZone =
    attacker.onMagmaHazard ||
    (world.persistentZones.magmaActive && !world.persistentZones.splitActive);
  const inIceZone =
    attacker.onIceHazard ||
    (world.persistentZones.iceActive && !world.persistentZones.splitActive);
  if (inMagmaZone && (moveElement === 'FIRE' || moveElement === 'MAGMA')) {
    envMult *= 1.25;
  }
  if (inIceZone && moveElement === 'ICE') {
    envMult *= 1.25;
  }

  const stab = attacker.element === moveElement ? 1.15 : 1.0;
  let affinity = getElementAffinity(registry.elements, moveElement, defender.element);
  if (moveElement === 'SEA' && (defender.fruitType === 'NONE' || registry.traits[defender.traitId]?.immuneToSeaPenalty)) {
    affinity = 1.0;
  }
  const weatherMult = computeWeatherElementMultiplier(moveElement, world, registry.balance);

  let attackerTraitMult = 1.0;
  const attackerTrait = registry.traits[attacker.traitId];
  if (
    attacker.inWaterTerrain &&
    moveElement === 'SEA' &&
    (attacker.race === 'FISHMAN' || attackerTrait?.fishmanWaterBuff?.enabled)
  ) {
    attackerTraitMult *= attackerTrait?.fishmanWaterBuff?.seaDamageMult ?? 1.25;
  }
  if (moveElement === 'LIGHTNING' && attackerTrait?.lightningDamageMultiplier) {
    attackerTraitMult *= attackerTrait.lightningDamageMultiplier;
  }
  if (
    attacker.endgameFireDamageBonusRatio > 0 &&
    (moveElement === 'FIRE' || moveElement === 'MAGMA' || moveElement === 'PYRO')
  ) {
    attackerTraitMult *= 1 + attacker.endgameFireDamageBonusRatio;
  }

  let raidGroggyMult = 1.0;
  if (
    world.raidState?.active &&
    world.raidState.bossUnitId === defender.instanceId &&
    world.raidState.groggyTimer > 0
  ) {
    raidGroggyMult = world.raidState.groggyDamageMult;
  }

  const raw =
    movePower *
    (atkStat / Math.max(15, defStat)) *
    registry.balance.unitPhysics.damageBaseConstant *
    stab *
    affinity *
    weatherMult *
    hakiMult *
    envMult *
    attackerTraitMult *
    interaction.damageMultiplier *
    raidGroggyMult;

  const damage = Math.max(registry.balance.unitPhysics.minDamage, Math.round(raw));
  return {
    damage,
    affinity,
    nullified: false,
    nullifyReason: 'NONE'
  };
}
