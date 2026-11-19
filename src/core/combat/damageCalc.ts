import { clamp } from '../math/vector2';
import type {
  AiProfileDefinition,
  BalanceConfig,
  ElementId,
  ElementsConfig,
  FormDefinition,
  GameDataRegistry,
  MoveCategory,
  StatBlock,
  UnitDefinition
} from '../types/dataSchemas';
import type { BattleWorldState, UnitBuildConfig, UnitRuntimeState } from '../types/battleState';

export function getElementAffinity(
  elementsConfig: ElementsConfig,
  attackElement: ElementId,
  defendElement: ElementId
): number {
  const row = elementsConfig.matrix[attackElement];
  if (!row) return 1.0;
  return row[defendElement] ?? 1.0;
}

export function computeEffectiveStats(
  unitDef: UnitDefinition,
  build: UnitBuildConfig,
  registry: GameDataRegistry,
  activeForm: FormDefinition | null = null,
  aiProfile: AiProfileDefinition | null = null
): StatBlock {
  const { balance, equipment } = registry;
  const eq = equipment[build.equipmentId];
  const lvlScale = 1 + (build.level - 1) * balance.unitPhysics.levelBaseStatScale;
  const aiMult = build.isPlayerControlled ? 1.0 : (aiProfile?.statMultiplier ?? 1.0);

  const calcOne = (key: keyof StatBlock, isHp: boolean): number => {
    const base = unitDef.baseStats[key];
    const iv = (build.ivs[key] ?? 0) * balance.unitPhysics.ivStatScale;
    const ev = (build.evs[key] ?? 0) * balance.unitPhysics.evStatScale;
    let raw = (base + iv + ev) * lvlScale;
    if (isHp) {
      raw += build.level * 4;
    }
    const eqMult = eq?.statModifiers?.[key] ?? 1.0;
    const formMult = activeForm?.statMultipliers?.[key] ?? 1.0;
    let endgameMult = 1.0;
    if (build.endgameBonuses) {
      if (isHp && build.endgameBonuses.maxHpMult) {
        endgameMult *= build.endgameBonuses.maxHpMult;
      }
      if ((key === 'atk' || key === 'spAtk') && build.endgameBonuses.atkMult) {
        endgameMult *= build.endgameBonuses.atkMult;
      }
      if (key === 'spd' && build.endgameBonuses.spdMult) {
        endgameMult *= build.endgameBonuses.spdMult;
      }
    }
    if (isHp && build.hpMultiplier && build.hpMultiplier > 0) {
      endgameMult *= build.hpMultiplier;
    }
    return Math.max(10, Math.round(raw * eqMult * formMult * aiMult * endgameMult));
  };

  return {
    hp: calcOne('hp', true),
    atk: calcOne('atk', false),
    def: calcOne('def', false),
    spAtk: calcOne('spAtk', false),
    spDef: calcOne('spDef', false),
    spd: calcOne('spd', false)
  };
}

export function getUnitCurrentStat(
  unit: UnitRuntimeState,
  statKey: keyof StatBlock,
  world: BattleWorldState,
  registry: GameDataRegistry
): number {
  let value = unit.effectiveStats[statKey];

  for (const buff of unit.statBuffs) {
    if (buff.stat === statKey && buff.remainingSec > 0) {
      value *= buff.multiplier;
    }
  }

  if ((statKey === 'atk' || statKey === 'spAtk') && unit.justDodgeBuffTimer > 0) {
    value *= 1 + registry.balance.dodge.justDodgeAttackBuffRatio;
  }

  // Rule Reversal Field: SPEED_INVERSION reverses effective speed relative to reference speed
  if (
    statKey === 'spd' &&
    world.ruleReversal.kind === 'SPEED_INVERSION' &&
    world.ruleReversal.remainingSec > 0
  ) {
    const ref = registry.balance.field.speedReversalReferenceSpd;
    value = clamp(ref - value, 45, 210);
  }

  // Overdrive movement speed modifier
  if (statKey === 'spd' && unit.activeFormKind === 'OVERDRIVE' && unit.activeFormId) {
    const formDef = registry.forms[unit.activeFormId];
    if (formDef?.moveSpeedScale) {
      value *= formDef.moveSpeedScale;
    }
  }

  // Post-awakening Exhaustion debuff (e.g. after Gear 5 expires)
  if (statKey === 'spd' && unit.exhaustionTimer > 0) {
    value *= 0.55;
  }

  // Phase 6: Lunarian Flame OFF grants +45% movement speed
  if (statKey === 'spd' && !unit.lunarianFlameOn) {
    const trait = registry.traits[unit.traitId];
    if (trait?.lunarianFlame?.enabled) {
      value *= trait.lunarianFlame.flameOffMoveSpeedMultiplier;
    }
  }

  // Stage 2-A & 2-B: Arena Water Terrain effects (Fishman +20% ATK/SPD; Brook ignores water slow; Devil Fruit user -30% SPD)
  if (unit.inWaterTerrain) {
    const trait = registry.traits[unit.traitId];
    if (unit.race === 'FISHMAN' || trait?.fishmanWaterBuff?.enabled) {
      const atkM = trait?.fishmanWaterBuff?.atkMult ?? 1.2;
      const spdM = trait?.fishmanWaterBuff?.spdMult ?? 1.2;
      if (statKey === 'atk' || statKey === 'spAtk') {
        value *= atkM;
      } else if (statKey === 'spd') {
        value *= spdM;
      }
    } else if (
      unit.fruitType !== 'NONE' &&
      !trait?.ignoreWaterTerrainPenalty &&
      statKey === 'spd'
    ) {
      value *= 0.7;
    }
  }

  // Stage 2-B: Persistent Ice Age Hazard slows non-ICE units by 20%
  if (statKey === 'spd' && unit.onIceHazard && unit.element !== 'ICE') {
    value *= 0.8;
  }

  // Stage 2-C: Hody Jones Energy Steroid Overdrive (+35% ATK/SPATK & +35% SPD when active)
  if (unit.steroidOverdriveActive) {
    const trait = registry.traits[unit.traitId];
    if (trait?.energySteroidOverdrive?.enabled) {
      if (statKey === 'atk' || statKey === 'spAtk') {
        value *= trait.energySteroidOverdrive.atkMult;
      } else if (statKey === 'spd') {
        value *= trait.energySteroidOverdrive.spdMult;
      }
    }
  }

  return Math.max(1, Math.round(value));
}

export function computeBeamDynamicRange(offensiveStat: number, balance: BalanceConfig): number {
  const { minRangePx, maxRangePx, statRangeMin, statRangeMax } = balance.beam;
  const t = clamp((offensiveStat - statRangeMin) / Math.max(1, statRangeMax - statRangeMin), 0, 1);
  return Math.round(minRangePx + t * (maxRangePx - minRangePx));
}

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

  // 0. Stage 2-A: Buggy Bara-Bara Slash Split Immunity (disabled while fruitNullified)
  if (!fruitNullified && trait?.slashImmunity && moveElement === 'SLASH') {
    return {
      nullified: true,
      nullifyReason: 'SLASH_SPLIT',
      damageMultiplier: 0
    };
  }

  // 1. Check Elemental Immunities (e.g., Luffy's Rubber Body immune to LIGHTNING; disabled while fruitNullified)
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

  // 2. Check Logia Intangibility (bypassed by Armament Haki, fruitNullification, wetStatus on weakToWetStatus, or naturalLogiaCounter tag)
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

  // 3. Check Non-Haki Damage Reductions (e.g., Rubber Body takes 50% from non-Haki BLUNT; disabled while fruitNullified)
  if (
    !fruitNullified &&
    !hasArmamentHaki &&
    trait?.nonHakiDamageMultipliers &&
    trait.nonHakiDamageMultipliers[moveElement] !== undefined
  ) {
    mult *= trait.nonHakiDamageMultipliers[moveElement];
  }

  // 4. Check SEA (Water / Seastone) weakness for Devil Fruit users vs Non-Fruit users
  if (moveElement === 'SEA') {
    if (defender.fruitType === 'NONE' || trait?.immuneToSeaPenalty) {
      // Non-fruit users (e.g., Zoro) suffer no Sea bonus damage penalty
      mult *= 1.0;
    } else {
      mult *= 1.35;
    }
  }

  // 5. Phase 6: Lunarian Flame ON reduces all incoming damage by 75% (multiplier 0.25)
  if (trait?.lunarianFlame?.enabled && defender.lunarianFlameOn) {
    mult *= trait.lunarianFlame.flameOnDamageMultiplier;
  }

  // 6. Stage 2-A: Don Krieg Wootz Steel Armor (-40% non-Haki projectile damage)
  if (
    !hasArmamentHaki &&
    isProjectile &&
    trait?.nonHakiProjectileMultiplier !== undefined
  ) {
    mult *= trait.nonHakiProjectileMultiplier;
  }

  // 7. Stage 2-B: Trait & Active Form Incoming Damage Multipliers (Blackbeard +20%, Chopper Guard Point -60%)
  if (trait?.incomingDamageMultiplier !== undefined) {
    mult *= trait.incomingDamageMultiplier;
  }
  if (!fruitNullified && defender.activeFormId) {
    const activeForm = registry.forms[defender.activeFormId];
    if (activeForm?.incomingDamageMultiplier !== undefined) {
      mult *= activeForm.incomingDamageMultiplier;
    }
  }

  // 8. Stage 2-C: Katakuri Focus Break (+20% incoming dmg) & Hody Steroid Overdrive (+15% incoming dmg)
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

export interface DamageHakiOptions {
  hasArmamentHaki?: boolean;
  isInternalDestruction?: boolean;
  hasConquerorCoating?: boolean;
  isProjectile?: boolean;
  moveId?: string;
  isSingleLinear?: boolean;
  isBurstOrAoe?: boolean;
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

  // Armament Haki Lv.3 Internal Destruction penetrates 35% of target defense
  const hasInternalDestruction =
    Boolean(hakiOpts.isInternalDestruction) ||
    (effectiveArmament && attacker.haki.armament >= 3);
  if (hasInternalDestruction) {
    defStat *= 0.65;
  }
  // Stage 3 Endgame: Armor penetration buff (e.g. Seastone Shatter +20%)
  if (attacker.endgameArmorPenRatio > 0) {
    defStat *= Math.max(0.25, 1 - attacker.endgameArmorPenRatio);
  }

  // Haki offensive multipliers
  let hakiMult = 1.0;
  if (effectiveArmament && attacker.haki.armament > 0) {
    hakiMult *= 1 + attacker.haki.armament * 0.06;
  }
  if (hakiOpts.hasConquerorCoating && attacker.haki.conqueror >= 3) {
    hakiMult *= 1.22;
  }

  // Environment Awakening & Persistent Hazard Zone (+25% Magma/Fire or Ice) bonus
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

  // Stage 2-A attacker bonuses: Fishman SEA bonus in water & Nami Lightning bonus
  let attackerTraitMult = 1.0;
  const attackerTrait = registry.traits[attacker.traitId];
  if (
    attacker.inWaterTerrain &&
    moveElement === 'SEA' &&
    (attacker.race === 'FISHMAN' || attackerTrait?.fishmanWaterBuff?.enabled)
  ) {
    attackerTraitMult *= attackerTrait?.fishmanWaterBuff?.seaDamageMult ?? 1.25;
  }
  if (
    moveElement === 'LIGHTNING' &&
    attackerTrait?.lightningDamageMultiplier
  ) {
    attackerTraitMult *= attackerTrait.lightningDamageMultiplier;
  }
  // Stage 3 Endgame: Raid Relic Fire/Magma Damage Bonus (e.g. Flame Dragon Scale +12%)
  if (
    attacker.endgameFireDamageBonusRatio > 0 &&
    (moveElement === 'FIRE' || moveElement === 'MAGMA' || moveElement === 'PYRO')
  ) {
    attackerTraitMult *= 1 + attacker.endgameFireDamageBonusRatio;
  }

  // Stage 3 Step 2: Giant Boss Raid Groggy (Break) amplifies incoming damage by 1.5x
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
