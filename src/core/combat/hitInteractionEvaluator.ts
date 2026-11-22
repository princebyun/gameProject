import type { UnitRuntimeState } from '../types/battleState';
import type { ElementId, GameDataRegistry } from '../types/dataSchemas';

export interface DamageHakiOptions {
  hasArmamentHaki?: boolean;
  isInternalDestruction?: boolean;
  hasConquerorCoating?: boolean;
  isProjectile?: boolean;
  moveId?: string;
  isSingleLinear?: boolean;
  isBurstOrAoe?: boolean;
}

export interface HitInteractionEvaluation {
  nullified: boolean;
  nullifyReason:
    | 'NONE'
    | 'LOGIA_INTANGIBLE'
    | 'ELEMENT_IMMUNE'
    | 'SLASH_SPLIT'
    | 'FORESIGHT_EVADE';
  damageMultiplier: number;
}

export function evaluateHitInteractions(
  defender: UnitRuntimeState,
  moveElement: ElementId,
  hasArmamentHaki: boolean,
  registry: GameDataRegistry,
  isProjectile: boolean = false,
  attacker?: UnitRuntimeState,
  hakiOpts?: DamageHakiOptions
): HitInteractionEvaluation {
  const trait = registry.traits[defender.traitId];
  const attackerTrait = attacker ? registry.traits[attacker.traitId] : undefined;
  const fruitNullified = defender.fruitType !== 'NONE' && defender.fruitNullifyTimer > 0;

  // 0.0 Stage 2-C: Katakuri Future Sight Mochi Morph Evade
  if (
    !fruitNullified &&
    trait?.futureSightCounter?.enabled &&
    defender.foresightBreakTimer <= 0 &&
    defender.foresightFocus >= trait.futureSightCounter.evadeMinFocus &&
    attacker
  ) {
    const attackerHasObsLv3 = attacker.haki.observation >= 3;
    const attackerJustDodged = attacker.justDodgeBuffTimer > 0;
    const isBurstOrAoe = Boolean(hakiOpts?.isBurstOrAoe);
    const isRepeatedMove = Boolean(
      hakiOpts?.moveId &&
        defender.lastIncomingMoveIdByAttacker[attacker.instanceId] === hakiOpts.moveId
    );
    const isSingleLinear = Boolean(hakiOpts?.isSingleLinear);

    if (
      !attackerHasObsLv3 &&
      !attackerJustDodged &&
      !isBurstOrAoe &&
      (isSingleLinear || isRepeatedMove)
    ) {
      return {
        nullified: true,
        nullifyReason: 'FORESIGHT_EVADE',
        damageMultiplier: 0
      };
    }
  }

  // 0. Stage 2-A: Buggy Bara-Bara Slash Split Immunity
  if (!fruitNullified && trait?.slashImmunity && moveElement === 'SLASH') {
    return {
      nullified: true,
      nullifyReason: 'SLASH_SPLIT',
      damageMultiplier: 0
    };
  }

  // 1. Check Elemental Immunities
  if (
    !fruitNullified &&
    trait?.elementImmunities &&
    trait.elementImmunities.includes(moveElement)
  ) {
    return {
      nullified: true,
      nullifyReason: 'ELEMENT_IMMUNE',
      damageMultiplier: 0
    };
  }

  // 2. Check Logia Intangibility
  const isLogia =
    !fruitNullified &&
    (defender.fruitType === 'LOGIA' || Boolean(trait?.logiaIntangibility?.enabled));
  if (isLogia && !hasArmamentHaki) {
    const weaknesses = trait?.logiaIntangibility?.naturalWeaknessElements ?? ['SEA'];
    const defenderIsWet = defender.statuses.some(
      (s) => s.kind === 'WET' && s.remainingSec > 0
    );
    const wetCounterBypass =
      Boolean(trait?.weakToWetStatus) &&
      defenderIsWet &&
      (moveElement === 'BLUNT' || moveElement === 'SLASH' || moveElement === 'FORCE');

    const attackerTags = attackerTrait?.traitTags ?? [];
    const defenderNaturalCounters = trait?.naturalCounterTags ?? [];
    const attackerHasNaturalCounterTag =
      !(attacker && attacker.fruitType !== 'NONE' && attacker.fruitNullifyTimer > 0) &&
      defenderNaturalCounters.some((tag) => attackerTags.includes(tag));

    const isNaturalCounter =
      moveElement === 'SEA' ||
      weaknesses.includes(moveElement) ||
      (defender.element === 'FIRE' && moveElement === 'MAGMA') ||
      wetCounterBypass ||
      attackerHasNaturalCounterTag;

    if (!isNaturalCounter) {
      return {
        nullified: true,
        nullifyReason: 'LOGIA_INTANGIBLE',
        damageMultiplier: 0
      };
    }
  }

  let mult = 1.0;

  if (
    !fruitNullified &&
    !hasArmamentHaki &&
    trait?.nonHakiDamageMultipliers &&
    trait.nonHakiDamageMultipliers[moveElement] !== undefined
  ) {
    mult *= trait.nonHakiDamageMultipliers[moveElement];
  }

  if (moveElement === 'SEA') {
    mult *= defender.fruitType === 'NONE' || trait?.immuneToSeaPenalty ? 1.0 : 1.35;
  }

  if (trait?.lunarianFlame?.enabled && defender.lunarianFlameOn) {
    mult *= trait.lunarianFlame.flameOnDamageMultiplier;
  }

  if (
    !hasArmamentHaki &&
    isProjectile &&
    trait?.nonHakiProjectileMultiplier !== undefined
  ) {
    mult *= trait.nonHakiProjectileMultiplier;
  }

  if (trait?.incomingDamageMultiplier !== undefined) {
    mult *= trait.incomingDamageMultiplier;
  }
  if (!fruitNullified && defender.activeFormId) {
    const activeForm = registry.forms[defender.activeFormId];
    if (activeForm?.incomingDamageMultiplier !== undefined) {
      mult *= activeForm.incomingDamageMultiplier;
    }
  }

  if (defender.foresightBreakTimer > 0 && trait?.futureSightCounter?.enabled) {
    mult *= trait.futureSightCounter.focusBreakDamageMult;
  }
  if (defender.steroidOverdriveActive && trait?.energySteroidOverdrive?.enabled) {
    mult *= trait.energySteroidOverdrive.incomingDamageMult;
  }

  return {
    nullified: false,
    nullifyReason: 'NONE',
    damageMultiplier: mult
  };
}
