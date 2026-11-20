import { BATTLE_CALC_VERSION, FIXED_DT } from '../constants';
import {
  evaluateGuardOrParryOnIncomingAttack,
  stepUnitGuardAndParry
} from '../battle/parry';
import {
  addTeamBondGauge,
  BOND_HIT_GAIN,
  BOND_SWAP_FOLLOWUP_GAIN,
  stepActiveBondCombo,
  triggerBattleCutin,
  tryActivateBondTagCombo
} from '../battle/tagCombo';
import {
  createInitialRaidRuntimeState,
  interceptRaidBossIncomingDamage,
  RAID_DOWNED_DURATION_SEC,
  stepRaidBattleRules
} from '../endgame/raid';
import { SeededPRNG } from '../math/prng';
import {
  addVec,
  clamp,
  distVec,
  isCircleIntersectingSector,
  lenVec,
  normalizeVec,
  pointToSegmentDist,
  scaleVec,
  subVec,
  type Vec2
} from '../math/vector2';
import { computeAiCommand } from '../ai/utilityAi';
import type { GameDataRegistry, MoveDefinition } from '../types/dataSchemas';
import type {
  ActiveBeam,
  ActiveMeleeArc,
  ActiveProjectile,
  ArenaDestructibleProp,
  BattleWorldConfig,
  BattleWorldState,
  MoveSlotRuntime,
  TeamId,
  UnitBuildConfig,
  UnitInputCommand,
  UnitRuntimeState
} from '../types/battleState';
import { stepAllClashes } from './clashResolver';
import {
  computeBeamDynamicRange,
  computeDamage,
  computeEffectiveStats,
  getUnitCurrentStat
} from './damageCalc';
import { stepUnitDodge, tryExecuteDodge } from './dodgeSystem';
import { spawnFieldMove, stepFieldAndGlobalEffects } from './fieldEngine';
import {
  activateFormShift,
  consumeOverdriveSkillUse,
  cycleZoanStance,
  forceRevertAllFormsForNullification,
  forceRevertFormByDamageThreshold,
  stepUnitFormShift
} from './formShiftEngine';
import {
  executeRosterSwap,
  openPivotSwapWindow,
  stepTeamRosters
} from './rosterManager';
import {
  applyStatus,
  isUnitRooted,
  isUnitSkillSealed,
  isUnitStaggered,
  stepUnitStatuses
} from './statusEngine';
import { getTraitClashMultiplier, triggerTraitHook } from './traitHooks';

function createUnitRuntime(
  build: UnitBuildConfig,
  team: TeamId,
  slotIndex: number,
  isOnField: boolean,
  pos: Vec2,
  aimDir: Vec2,
  registry: GameDataRegistry
): UnitRuntimeState {
  const unitDef =
    registry.units[build.speciesId] ?? Object.values(registry.units)[0];
  const aiProfile = registry.aiProfiles[build.aiLevel] ?? null;
  const effStats = computeEffectiveStats(unitDef, build, registry, null, aiProfile);

  const moveIds =
    build.moveIds.length > 0 ? build.moveIds : unitDef.defaultMoves;
  const moveSlots: MoveSlotRuntime[] = moveIds.slice(0, 4).map((mId) => {
    const mDef = registry.moves[mId] ?? Object.values(registry.moves)[0];
    const overrideCharge = build.initialMoveCharges?.[mDef.id];
    const initialCharges =
      overrideCharge !== undefined
        ? clamp(Math.floor(overrideCharge), 0, mDef.maxCharges)
        : mDef.maxCharges;
    return {
      moveId: mDef.id,
      charges: initialCharges,
      maxCharges: mDef.maxCharges,
      chargeRechargeTimer: 0,
      cooldownTimer: 0
    };
  });

  const baseRadius = registry.balance.unitPhysics.defaultRadiusPx;
  const entityScale = build.entityScaleOverride ?? unitDef.entityScale ?? 1.0;
  const scaledRadius = Math.round(baseRadius * entityScale);
  const knockbackResist = clamp(unitDef.knockbackResist ?? 0, 0, 1);
  const resolvedTraitId = build.traitId || unitDef.traitId;
  const traitDef = registry.traits[resolvedTraitId];
  const hasLunarianFlame = Boolean(traitDef?.lunarianFlame?.enabled);
  const initialHpRatio =
    build.initialHpRatio !== undefined ? clamp(build.initialHpRatio, 0, 1) : 1.0;
  const startingHp =
    initialHpRatio <= 0 ? 0 : Math.max(1, Math.round(effStats.hp * initialHpRatio));
  const eb = build.endgameBonuses;

  return {
    instanceId: build.instanceId,
    speciesId: unitDef.id,
    name: build.customName ?? unitDef.name,
    team,
    slotIndex,
    isOnField,
    isAlive: startingHp > 0,
    isPlayerControlled: build.isPlayerControlled,
    aiLevel: build.aiLevel,

    pos: { x: pos.x, y: pos.y },
    prevPos: { x: pos.x, y: pos.y },
    vel: { x: 0, y: 0 },
    knockbackVel: { x: 0, y: 0 },
    aimDir: { x: aimDir.x, y: aimDir.y },
    radiusPx: scaledRadius,
    baseRadiusPx: scaledRadius,

    level: build.level,
    element: unitDef.element,
    fruitType: unitDef.fruitType ?? 'NONE',
    haki: unitDef.haki ?? { armament: 0, observation: 0, conqueror: 0 },
    traitId: resolvedTraitId,
    equipmentId: build.equipmentId || unitDef.defaultEquipmentId,
    configuredFormId: build.formId || unitDef.defaultFormId,
    awakenedFormId: unitDef.awakenedFormId ?? (build.formId || unitDef.defaultFormId),
    stanceFormIds: unitDef.forms ? [...unitDef.forms] : [],
    stanceIndex: -1,
    currentStanceRole: 'BASE',
    stanceCooldownTimer: 0,

    maxHp: effStats.hp,
    hp: startingHp,
    baseComputedStats: { ...effStats },
    effectiveStats: { ...effStats },
    statBuffs: [],

    moveSlots,
    baseMoveSlots: moveSlots.map((s) => ({ ...s })),
    pendingBurst: null,

    windupMoveId: null,
    windupTimer: 0,
    windupAimDir: { x: aimDir.x, y: aimDir.y },
    actionLockTimer: 0,
    activeBeamId: null,
    clashLockId: null,

    dodgeStacks: registry.balance.dodge.maxStacks,
    maxDodgeStacks: registry.balance.dodge.maxStacks,
    dodgeRechargeTimer: 0,
    dodgeActiveTimer: 0,
    iframeTimer: 0,
    dodgeDir: { x: aimDir.x, y: aimDir.y },
    justDodgeBuffTimer: 0,
    recentDodgeWhiffTimer: 0,

    hasUsedFormShift: false,
    activeFormId: null,
    activeFormKind: null,
    hagoromoColor: unitDef.id === 'saturn' ? 'black' : null,
    regenHpRatioPerSec: 0,
    regenAccumTimer: 0,
    exhaustionTimer: 0,
    ignoreTerrainCollision: false,
    logiaDispersionTimer: 0,
    overdriveTimeRemainingSec: 0,
    overdriveUsesRemaining: 0,
    visualScale: entityScale,
    auraColor: null,

    statuses: [],
    staggerImmunityTimer: 0,
    tauntTargetUnitId: null,

    aiReactionTimer: 0.15,
    aiRecoveryItemsLeft: aiProfile?.allowRecoveryItems
      ? aiProfile.recoveryItemCount
      : 0,
    aiBehaviorId: unitDef.aiBehaviorId ?? 'balanced',
    entityScale,
    knockbackResist,
    isBossUnit: Boolean(unitDef.isBossUnit),
    bountyLabel: unitDef.bountyLabel ?? unitDef.title,
    lunarianFlameOn: hasLunarianFlame,
    lunarianReigniteTimer: 0,
    superRegenIdleTimer: 0,
    superRegenLockoutTimer: 0,
    bossPhase2Triggered: false,
    race: unitDef.race ?? 'HUMAN',
    baraSplitTimer: 0,
    meleeReflectTimer: 0,
    inWaterTerrain: false,
    fruitNullifyTimer: 0,
    isMinion: false,
    summonerUnitId: null,
    hasRevivedOnce: false,
    shadowsAsgardDamageTaken: 0,
    cooldownAccelTimer: 0,
    cooldownAccelRatio: 0,
    onIceHazard: false,
    onMagmaHazard: false,
    magmaBurnTickTimer: 0,
    foresightFocus: traitDef?.futureSightCounter?.maxFocus ?? 0,
    foresightBreakTimer: 0,
    mochiMorphTimer: 0,
    lastIncomingMoveIdByAttacker: {},
    steroidOverdriveActive: false,
    parasiteConfuseTimer: 0,
    venomStacks: 0,
    venomDecayTimer: 0,
    venomTickTimer: 0,
    venomDemonActive: false,
    venomAuraTickTimer: 0,
    ringOutTimer: 0,
    endgameArmorPenRatio: eb?.armorPenRatio ?? 0,
    endgameHazardResistRatio: eb?.hazardAndPoisonResistRatio ?? 0,
    endgameCooldownReductionRatio: eb?.cooldownReductionRatio ?? 0,
    endgameDodgeRechargeBonus: eb?.dodgeRechargeBonus ?? 0,
    endgameFireDamageBonusRatio: eb?.fireDamageBonusRatio ?? 0,
    endgameBreakGaugeBonusRatio: eb?.breakGaugeDamageRatio ?? 0,
    isDowned: false,
    downedTimer: 0,
    reviveProgressSec: 0,
    guardHeld: false,
    guardStartTick: -9999,
    guardStamina: 100,
    guardMaxStamina: 100,
    guardBreakTicks: 0,
    parryWhiffCooldownTicks: 0,
    parryStunTicks: 0,
    parryDamageVulnMult: 1.0,
    awakeningGauge: 0,
    justGuardFlashTicks: 0,
    guardParrySucceededThisHold: false
  };
}

export function createBattleWorld(
  config: BattleWorldConfig,
  registry: GameDataRegistry
): BattleWorldState {
  const arenaSpec =
    registry.balance.arenaDefaults[config.arenaSizeKey] ??
    registry.balance.arenaDefaults.medium;
  const activeAlphaCount =
    config.mode === 'COOP_RAID' ? 3 : config.mode === '2V2' ? 2 : 1;
  const activeOmegaCount =
    config.mode === 'COOP_RAID' ? 1 : config.mode === '2V2' ? 2 : 1;

  const units: UnitRuntimeState[] = [];
  const cy = arenaSpec.height * 0.5;

  config.teamAlpha.slice(0, registry.balance.roster.maxPartySize).forEach((b, idx) => {
    const isOnField = idx < activeAlphaCount;
    const yOffset =
      activeAlphaCount === 3
        ? idx === 0
          ? -110
          : idx === 1
            ? 0
            : 110
        : activeAlphaCount === 2
          ? idx === 0
            ? -75
            : 75
          : 0;
    const pos = { x: arenaSpec.width * 0.2, y: cy + yOffset };
    units.push(
      createUnitRuntime(b, 'ALPHA', idx, isOnField, pos, { x: 1, y: 0 }, registry)
    );
  });

  config.teamOmega.slice(0, registry.balance.roster.maxPartySize).forEach((b, idx) => {
    const isOnField = idx < activeOmegaCount;
    const yOffset = activeOmegaCount === 2 ? (idx === 0 ? -75 : 75) : 0;
    const pos = { x: arenaSpec.width * 0.78, y: cy + yOffset };
    units.push(
      createUnitRuntime(b, 'OMEGA', idx, isOnField, pos, { x: -1, y: 0 }, registry)
    );
  });

  const primaryBoss = units.find((u) => u.team === 'OMEGA' && u.isBossUnit);
  const primaryBossDef = primaryBoss
    ? registry.units[primaryBoss.speciesId]
    : null;

  const world: BattleWorldState = {
    calcVersion: BATTLE_CALC_VERSION,
    tick: 0,
    elapsedSec: 0,
    arenaWidth: arenaSpec.width,
    arenaHeight: arenaSpec.height,
    mode: config.mode,

    units,
    rosters: {
      ALPHA: {
        team: 'ALPHA',
        voluntarySwapCooldownTimer: 0,
        pivotWindowTimer: 0,
        pivotTriggeredByUnitId: null,
        bondGauge: 0,
        recentSwapComboWindowTicks: 0
      },
      OMEGA: {
        team: 'OMEGA',
        voluntarySwapCooldownTimer: 0,
        pivotWindowTimer: 0,
        pivotTriggeredByUnitId: null,
        bondGauge: 0,
        recentSwapComboWindowTicks: 0
      }
    },

    projectiles: [],
    beams: [],
    meleeArcs: [],
    fieldZones: [],

    beamClashes: [],
    meleeBeamGuards: [],
    meleeClashes: [],

    weather: { id: 'NONE', remainingSec: 0 },
    ruleReversal: { kind: 'NONE', remainingSec: 0 },
    environmentField: {
      kind: 'NONE',
      ownerUnitId: null,
      team: null,
      remainingSec: 0
    },

    hitstopTimer: 0,
    slowMoTimer: 0,
    slowMoScale: 1.0,
    screenShakeTimer: 0,
    screenShakeMagnitude: 0,
    screenFlashTimer: 0,
    screenFlashColor: '#ffffff',

    bossIntroTimer: primaryBoss ? 1.5 : 0,
    bossIntroName: primaryBoss ? primaryBoss.name : null,
    bossIntroTitle: primaryBossDef ? primaryBossDef.title : null,
    bossIntroBountyLabel: primaryBoss ? primaryBoss.bountyLabel : null,

    winCondition: config.winCondition ?? { kind: 'DEFEAT_ALL' },
    winReasonText: null,
    extractionZoneActive: false,
    waterZones: config.arenaTerrain?.waterZones
      ? config.arenaTerrain.waterZones.map((z) => ({ ...z }))
      : [],
    slashImmuneMissCount: 0,
    tacticalHintText: null,
    tacticalHintTimer: 0,

    destructibleProps: config.arenaTerrain?.destructibleProps
      ? config.arenaTerrain.destructibleProps.map((p) => ({
          ...p,
          pos: { ...p.pos },
          destroyed: false
        }))
      : [],
    persistentZones: {
      magmaActive: false,
      magmaOwnerId: null,
      magmaTeam: null,
      iceActive: false,
      iceOwnerId: null,
      iceTeam: null,
      splitActive: false
    },
    gauntletWaves: config.gauntletWaves
      ? config.gauntletWaves.map((w) => ({
          ...w,
          enemyBuilds: w.enemyBuilds.map((b) => ({ ...b }))
        }))
      : [],
    currentWaveIndex: 0,
    waveBannerTimer: config.gauntletWaves && config.gauntletWaves.length > 1 ? 2.2 : 0,
    waveBannerText:
      config.gauntletWaves && config.gauntletWaves.length > 1
        ? `WAVE 1/${config.gauntletWaves.length}: ${config.gauntletWaves[0].waveName}`
        : null,

    birdcage: {
      active: false,
      ownerUnitId: null,
      shrinkScale: 1.0,
      minScaleRatio: 0.45,
      shrinkRatePerSec: 0.025,
      boundarySlashDamage: 18,
      boundaryKnockbackSpeed: 220,
      tickTimer: 0
    },

    impelDownHazard: {
      active: Boolean(config.impelDownHazard),
      floor: config.impelDownHazard?.floor ?? 0,
      kind: config.impelDownHazard?.kind ?? null,
      trapTimer: 2.0,
      pendingTrapPos: null,
      pendingTrapTelegraphTimer: 0,
      dodgeRechargeMult: config.impelDownHazard?.dodgeRechargeMult ?? 1.0
    },

    colosseumRingOut: {
      active: Boolean(config.colosseumRingOut?.enabled),
      center: { x: arenaSpec.width * 0.5, y: arenaSpec.height * 0.5 },
      safeRadiusPx: Math.round(
        Math.min(arenaSpec.width, arenaSpec.height) *
          (config.colosseumRingOut?.safeRadiusRatio ?? 0.38)
      ),
      outOfBoundsLimitSec: config.colosseumRingOut?.outOfBoundsLimitSec ?? 2.0,
      outOfBoundsDpsRatio: config.colosseumRingOut?.outOfBoundsDpsRatio ?? 0.08,
      instantRingOutKo: config.colosseumRingOut?.instantRingOutKo ?? true,
      resolvedByRingOut: false
    },

    raidState: createInitialRaidRuntimeState(
      config.raidConfig,
      units.find((u) => u.team === 'OMEGA')?.instanceId ?? null
    ),

    cutinFreezeTicks: 0,
    activeCutin: null,
    activeBondCombo: null,
    parryMiniEvents: [],

    floatingTexts: [],
    vfxEvents: [],
    combatLog: [`[전투 개시] 모드: ${config.mode} / 버전: v${BATTLE_CALC_VERSION}`],

    winnerTeam: null
  };

  // Stage 3: Activate persistent floor hazards for Impel Down Level 4 (Magma) & Level 5 (Ice)
  if (world.impelDownHazard.active) {
    if (world.impelDownHazard.kind === 'BLAZING_MAGMA') {
      world.persistentZones.magmaActive = true;
      world.persistentZones.magmaTeam = 'OMEGA';
    } else if (world.impelDownHazard.kind === 'FREEZING_ICE') {
      world.persistentZones.iceActive = true;
      world.persistentZones.iceTeam = 'OMEGA';
    }
  }
  if (config.raidConfig?.weatherOnStart && config.raidConfig.weatherOnStart !== 'NONE') {
    world.weather = { id: config.raidConfig.weatherOnStart, remainingSec: 999 };
  }

  for (const u of world.units) {
    if (u.isOnField && u.isAlive) {
      triggerTraitHook('onEnterField', u, {}, world, registry);
      // Reserve Awakening buff (>= 100% triggers immediate awakening on floor start)
      const matchingBuild =
        u.team === 'ALPHA'
          ? config.teamAlpha.find((b) => b.instanceId === u.instanceId)
          : undefined;
      if ((matchingBuild?.endgameBonuses?.startAwakeningGaugeRatio ?? 0) >= 0.5) {
        u.statBuffs.push({
          id: 'impel_reserve_awakening_surge',
          stat: 'atk',
          multiplier: 1.15,
          remainingSec: 12
        });
        if ((matchingBuild?.endgameBonuses?.startAwakeningGaugeRatio ?? 0) >= 1.0) {
          activateFormShift(u, world, registry);
          // Pre-battle auto-awakening should not freeze tick 0
          world.cutinFreezeTicks = 0;
          world.activeCutin = null;
        }
      }
    }
  }

  return world;
}

export function applyVenomStacksToUnit(
  target: UnitRuntimeState,
  stacksToAdd: number,
  world: BattleWorldState,
  registry: GameDataRegistry,
  maxStacks: number = 10
): void {
  if (!target.isAlive || stacksToAdd <= 0) return;
  const prev = target.venomStacks;
  target.venomStacks = Math.min(maxStacks, target.venomStacks + stacksToAdd);
  target.venomDecayTimer = 6.0;
  if (target.venomStacks > prev) {
    world.floatingTexts.push({
      id: `ft_venom_st_${world.tick}_${target.instanceId}`,
      pos: { x: target.pos.x, y: target.pos.y - 34 },
      text: `☠ 맹독 x${target.venomStacks}`,
      color: '#c084fc',
      elapsedSec: 0,
      durationSec: 0.75,
      scale: 0.95
    });
  }
  void registry;
}

export function activateMagellanVenomDemon(
  magellan: UnitRuntimeState,
  world: BattleWorldState,
  registry: GameDataRegistry
): void {
  if (magellan.venomDemonActive) return;
  magellan.venomDemonActive = true;
  magellan.bossPhase2Triggered = true;
  magellan.auraColor = '#dc2626';
  if (!magellan.activeFormId && magellan.awakenedFormId) {
    activateFormShift(magellan, world, registry);
  }
  world.floatingTexts.push({
    id: `ft_venom_demon_${world.tick}_${magellan.instanceId}`,
    pos: { x: magellan.pos.x, y: magellan.pos.y - 46 },
    text: '☠ 베놈 데몬: 지옥의 심판!',
    color: '#ef4444',
    elapsedSec: 0,
    durationSec: 1.5,
    scale: 1.35
  });
  world.vfxEvents.push({
    id: `vfx_venom_demon_${world.tick}_${magellan.instanceId}`,
    kind: 'FORM_BURST',
    pos: { x: magellan.pos.x, y: magellan.pos.y },
    color: '#dc2626',
    radiusPx: 145,
    elapsedSec: 0,
    durationSec: 0.55
  });
  world.combatLog.push(
    `[베놈 데몬 발동] ${magellan.name}이(가) 금지된 진홍빛 맹독 오라를 해방했습니다!`
  );
}

export function spawnProjectileInstance(
  caster: UnitRuntimeState,
  moveDef: MoveDefinition,
  aimDir: Vec2,
  world: BattleWorldState,
  registry: GameDataRegistry
): ActiveProjectile {
  const spec = moveDef.projectileSpec ?? {
    pattern: 'SINGLE',
    burstCount: 1,
    burstIntervalSec: 0,
    speedPxPerSec: 350,
    bypassGroundCollision: false
  };
  const offStat =
    moveDef.category === 'PHYSICAL'
      ? getUnitCurrentStat(caster, 'atk', world, registry)
      : getUnitCurrentStat(caster, 'spAtk', world, registry);
  const dir = normalizeVec(aimDir, caster.aimDir);
  const spawnPos = addVec(caster.pos, scaleVec(dir, caster.radiusPx + moveDef.radiusPx + 4));

  const proj: ActiveProjectile = {
    id: `proj_${world.tick}_${caster.instanceId}_${world.projectiles.length}`,
    moveId: moveDef.id,
    ownerUnitId: caster.instanceId,
    team: caster.team,
    element: moveDef.element,
    pos: spawnPos,
    prevPos: { x: spawnPos.x, y: spawnPos.y },
    vel: scaleVec(dir, spec.speedPxPerSec),
    radiusPx: moveDef.radiusPx,
    currentPower: moveDef.basePower,
    initialPower: moveDef.basePower,
    offensiveStat: offStat,
    traitClashMult: getTraitClashMultiplier(caster, 'PROJECTILE', registry),
    hasArmamentHaki: Boolean(moveDef.hasArmamentHaki),
    hasConquerorCoating: Boolean(moveDef.hasConquerorCoating),
    isInternalDestruction: Boolean(moveDef.isInternalDestruction),
    elapsedSec: 0,
    maxDurationSec:
      moveDef.activeDurationSec *
      (registry.traits[caster.traitId]?.projectileRangeMultiplier ?? 1.0),
    pattern: spec.pattern,
    bypassGroundCollision: Boolean(spec.bypassGroundCollision),
    isInsideBeam: false,
    homingTurnRateRadPerSec: spec.homingTurnRateRadPerSec,
    appliesVenomStacks: moveDef.appliesVenomStacks,
    destroyed: false
  };
  world.projectiles.push(proj);
  return proj;
}

export function spawnBeamInstance(
  caster: UnitRuntimeState,
  moveDef: MoveDefinition,
  aimDir: Vec2,
  world: BattleWorldState,
  registry: GameDataRegistry
): ActiveBeam {
  const offStat =
    moveDef.category === 'PHYSICAL'
      ? getUnitCurrentStat(caster, 'atk', world, registry)
      : getUnitCurrentStat(caster, 'spAtk', world, registry);
  const dynamicRange = moveDef.beamSpec?.dynamicRangeByStat
    ? computeBeamDynamicRange(offStat, registry.balance)
    : moveDef.rangePx;
  const dir = normalizeVec(aimDir, caster.aimDir);
  const origin = addVec(caster.pos, scaleVec(dir, caster.radiusPx + 6));

  const beam: ActiveBeam = {
    id: `beam_${world.tick}_${caster.instanceId}_${world.beams.length}`,
    moveId: moveDef.id,
    ownerUnitId: caster.instanceId,
    team: caster.team,
    element: moveDef.element,
    origin,
    dir,
    maxRangePx: dynamicRange,
    currentLengthPx: dynamicRange,
    widthPx: moveDef.beamSpec?.widthPx ?? moveDef.radiusPx * 1.4,
    currentPower: moveDef.basePower,
    initialPower: moveDef.basePower,
    offensiveStat: offStat,
    traitClashMult: getTraitClashMultiplier(caster, 'BEAM', registry),
    hasArmamentHaki: Boolean(moveDef.hasArmamentHaki),
    hasConquerorCoating: Boolean(moveDef.hasConquerorCoating),
    isInternalDestruction: Boolean(moveDef.isInternalDestruction),
    elapsedSec: 0,
    maxDurationSec: moveDef.activeDurationSec,
    tickTimer: 0,
    tickIntervalSec: moveDef.beamSpec?.tickIntervalSec ?? 0.15,
    clashingWithBeamId: null,
    guardedByMeleeId: null,
    dimmed: false,
    terminated: false
  };
  world.beams.push(beam);
  caster.activeBeamId = beam.id;
  return beam;
}

export function spawnMeleeArcInstance(
  caster: UnitRuntimeState,
  moveDef: MoveDefinition,
  aimDir: Vec2,
  world: BattleWorldState,
  registry: GameDataRegistry
): ActiveMeleeArc {
  const offStat =
    moveDef.category === 'PHYSICAL'
      ? getUnitCurrentStat(caster, 'atk', world, registry)
      : getUnitCurrentStat(caster, 'spAtk', world, registry);
  const dir = normalizeVec(aimDir, caster.aimDir);
  const spec = moveDef.meleeSpec ?? {
    subtype: 'SLASH',
    arcDeg: 120,
    dashSpeedPxPerSec: 160,
    deflectProjectiles: true,
    canGuardBeam: true
  };

  // Law's Shambles: if an active ROOM / K_ROOM exists, blink directly into range of nearest enemy!
  if (moveDef.requiresActiveRoom) {
    const hasRoom =
      world.fieldZones.some(
        (z) => z.ownerUnitId === caster.instanceId && z.fieldKind === 'DOME_SHIELD'
      ) ||
      (world.environmentField.kind === 'K_ROOM_FIELD' &&
        world.environmentField.ownerUnitId === caster.instanceId);

    if (hasRoom) {
      const enemy = world.units.find(
        (u) => u.isAlive && u.isOnField && u.team !== caster.team
      );
      if (enemy) {
        const toEnemy = normalizeVec(subVec(enemy.pos, caster.pos), dir);
        caster.pos = addVec(enemy.pos, scaleVec(toEnemy, -42));
      }
    }
  }

  if (spec.dashSpeedPxPerSec && spec.dashSpeedPxPerSec > 0) {
    caster.vel = scaleVec(dir, spec.dashSpeedPxPerSec);
  }

  const lingerSec = Math.max(
    moveDef.activeDurationSec,
    registry.balance.melee.deflectLingerSec
  );

  // Environment Awakening (e.g. Law's K·ROOM) boosts melee range/radius
  const rangeBonus =
    world.environmentField.kind === 'K_ROOM_FIELD' &&
      world.environmentField.ownerUnitId === caster.instanceId
      ? 1.35
      : 1.0;

  const arc: ActiveMeleeArc = {
    id: `melee_${world.tick}_${caster.instanceId}_${world.meleeArcs.length}`,
    moveId: moveDef.id,
    ownerUnitId: caster.instanceId,
    team: caster.team,
    element: moveDef.element,
    subtype: spec.subtype,
    origin: { x: caster.pos.x, y: caster.pos.y },
    dir,
    radiusPx: Math.round(moveDef.radiusPx * rangeBonus),
    arcDeg: spec.arcDeg,
    currentPower: moveDef.basePower,
    initialPower: moveDef.basePower,
    offensiveStat: offStat,
    traitClashMult: getTraitClashMultiplier(caster, 'MELEE', registry),
    hasArmamentHaki: Boolean(moveDef.hasArmamentHaki),
    hasConquerorCoating: Boolean(moveDef.hasConquerorCoating),
    isInternalDestruction: Boolean(moveDef.isInternalDestruction),
    elapsedSec: 0,
    activeDamageDurationSec: moveDef.activeDurationSec,
    totalLingerDurationSec: lingerSec,
    deflectProjectiles: spec.deflectProjectiles,
    canGuardBeam: spec.canGuardBeam,
    hitUnitIds: [],
    clashing: false,
    finished: false
  };

  if (arc.hasConquerorCoating) {
    world.vfxEvents.push({
      id: `vfx_conq_cast_${world.tick}_${caster.instanceId}`,
      kind: 'CONQUEROR_LIGHTNING',
      pos: { x: caster.pos.x, y: caster.pos.y },
      color: '#dc2626',
      radiusPx: arc.radiusPx,
      elapsedSec: 0,
      durationSec: 0.35
    });
  }

  world.meleeArcs.push(arc);
  return arc;
}

export function setLunarianFlameState(
  unit: UnitRuntimeState,
  flameOn: boolean,
  world: BattleWorldState,
  registry: GameDataRegistry
): void {
  const trait = registry.traits[unit.traitId];
  if (!trait?.lunarianFlame?.enabled) return;

  unit.lunarianFlameOn = flameOn;
  if (!flameOn) {
    unit.lunarianReigniteTimer = trait.lunarianFlame.reigniteDelaySec ?? 5.0;
    world.floatingTexts.push({
      id: `ft_lflame_off_${world.tick}_${unit.instanceId}`,
      pos: { x: unit.pos.x, y: unit.pos.y - 30 },
      text: '💨 불꽃 OFF (속도 +45%)',
      color: '#38bdf8',
      elapsedSec: 0,
      durationSec: 0.95,
      scale: 1.05
    });
    world.combatLog.push(
      `[루나리아 불꽃 해제] ${unit.name} 등 뒤의 불꽃을 끄고 초고속 기동 돌입! (이동속도 +45% / 피해 경감 해제)`
    );
  } else {
    unit.lunarianReigniteTimer = 0;
    world.floatingTexts.push({
      id: `ft_lflame_on_${world.tick}_${unit.instanceId}`,
      pos: { x: unit.pos.x, y: unit.pos.y - 30 },
      text: '🔥 불꽃 재점화 (피해 -75%)',
      color: '#fb923c',
      elapsedSec: 0,
      durationSec: 0.95,
      scale: 1.05
    });
    world.combatLog.push(
      `[루나리아 불꽃 점화] ${unit.name} 등 뒤의 불꽃 재점화! (받는 피해 75% 경감 + 경직 면역)`
    );
  }
}

export function applyFruitNullification(
  target: UnitRuntimeState,
  durationSec: number,
  world: BattleWorldState,
  registry: GameDataRegistry
): boolean {
  if (!target.isAlive || target.fruitType === 'NONE') {
    return false;
  }
  const dur = Math.max(1.0, durationSec);
  target.fruitNullifyTimer = Math.max(target.fruitNullifyTimer, dur);
  forceRevertAllFormsForNullification(target, world, registry);
  world.floatingTexts.push({
    id: `ft_nullify_${world.tick}_${target.instanceId}`,
    pos: { x: target.pos.x, y: target.pos.y - 38 },
    text: `🌑 능력 봉인 (${dur.toFixed(0)}s)!`,
    color: '#a855f7',
    elapsedSec: 0,
    durationSec: 1.3,
    scale: 1.25
  });
  world.vfxEvents.push({
    id: `vfx_nullify_${world.tick}_${target.instanceId}`,
    kind: 'FORM_BURST',
    pos: { x: target.pos.x, y: target.pos.y },
    color: '#581c87',
    radiusPx: 48,
    elapsedSec: 0,
    durationSec: 0.45
  });
  world.combatLog.push(
    `[어둠 열매 봉인] ${target.name} ${dur}초간 악마의 열매 능력·자연계 무적·변신/각성 완전 봉인!`
  );
  return true;
}

export function damageDestructibleProp(
  prop: ArenaDestructibleProp,
  damage: number,
  world: BattleWorldState,
  registry: GameDataRegistry
): boolean {
  if (prop.destroyed) return false;
  prop.hp = Math.max(0, prop.hp - Math.max(1, damage));
  if (prop.hp > 0) return false;

  prop.destroyed = true;
  world.vfxEvents.push({
    id: `vfx_prop_${world.tick}_${prop.id}`,
    kind: 'CLASH_SHOCKWAVE',
    pos: { x: prop.pos.x, y: prop.pos.y },
    color: '#38bdf8',
    radiusPx: prop.wetRadiusPx,
    elapsedSec: 0,
    durationSec: 0.45
  });
  world.floatingTexts.push({
    id: `ft_prop_${world.tick}_${prop.id}`,
    pos: { x: prop.pos.x, y: prop.pos.y - 24 },
    text: '💧 물통 파괴! 주변 젖음(8s)!',
    color: '#38bdf8',
    elapsedSec: 0,
    durationSec: 1.3,
    scale: 1.2
  });
  for (const u of world.units) {
    if (!u.isAlive || !u.isOnField) continue;
    if (distVec(u.pos, prop.pos) <= prop.wetRadiusPx + u.radiusPx) {
      applyStatus(u, 'WET', prop.wetDurationSec, prop.id, world, registry);
    }
  }
  world.combatLog.push(
    `[물통 파괴] ${prop.id} 파괴! 반경 ${prop.wetRadiusPx}px 내 유닛에게 젖음(WET) ${prop.wetDurationSec}초 부여!`
  );
  return true;
}

export function summonOrSwapMinion(
  caster: UnitRuntimeState,
  moveDef: MoveDefinition,
  world: BattleWorldState,
  registry: GameDataRegistry
): { action: 'SUMMONED' | 'SWAPPED' | 'NONE'; minionId: string | null } {
  const existing = world.units.find(
    (u) => u.isAlive && u.isOnField && u.isMinion && u.summonerUnitId === caster.instanceId
  );

  if (existing && moveDef.swapWithMinionIfAlive) {
    const tmpPos = { x: caster.pos.x, y: caster.pos.y };
    caster.pos = { x: existing.pos.x, y: existing.pos.y };
    caster.prevPos = { ...caster.pos };
    existing.pos = tmpPos;
    existing.prevPos = { ...existing.pos };
    caster.iframeTimer = Math.max(caster.iframeTimer, 0.35);

    world.floatingTexts.push({
      id: `ft_swap_${world.tick}_${caster.instanceId}`,
      pos: { x: caster.pos.x, y: caster.pos.y - 30 },
      text: '👻 도펠맨 위치 교체!',
      color: '#c084fc',
      elapsedSec: 0,
      durationSec: 1.0,
      scale: 1.15
    });
    world.vfxEvents.push({
      id: `vfx_swap_${world.tick}_${caster.instanceId}`,
      kind: 'FORM_BURST',
      pos: { x: caster.pos.x, y: caster.pos.y },
      color: '#7e22ce',
      radiusPx: 40,
      elapsedSec: 0,
      durationSec: 0.35
    });
    world.combatLog.push(
      `[그림자 스왑] ${caster.name} 도펠맨과 즉시 위치 교체!`
    );
    return { action: 'SWAPPED', minionId: existing.instanceId };
  }

  const speciesId = moveDef.summonMinionSpeciesId ?? 'doppelman';
  const minionDef = registry.units[speciesId];
  if (!minionDef) {
    return { action: 'NONE', minionId: null };
  }

  const spawnPos = {
    x: clamp(
      caster.pos.x + caster.aimDir.x * 76,
      minionDef.entityScale ? 32 : 24,
      world.arenaWidth - 32
    ),
    y: clamp(
      caster.pos.y + caster.aimDir.y * 76,
      32,
      world.arenaHeight - 32
    )
  };

  const minionBuild: UnitBuildConfig = {
    instanceId: `minion_${caster.instanceId}_${world.tick}`,
    speciesId: minionDef.id,
    level: Math.max(1, caster.level - 2),
    ivs: { hp: 10, atk: 12, def: 10, spAtk: 12, spDef: 10, spd: 14 },
    evs: { hp: 0, atk: 0, def: 0, spAtk: 0, spDef: 0, spd: 0 },
    moveIds: [...minionDef.defaultMoves],
    equipmentId: minionDef.defaultEquipmentId,
    traitId: minionDef.traitId,
    formId: minionDef.defaultFormId,
    isPlayerControlled: false,
    aiLevel: Math.max(2, caster.aiLevel)
  };

  const minion = createUnitRuntime(
    minionBuild,
    caster.team,
    world.units.length,
    true,
    spawnPos,
    caster.aimDir,
    registry
  );
  minion.isMinion = true;
  minion.summonerUnitId = caster.instanceId;
  minion.maxHp = Math.max(80, Math.round(caster.maxHp * 0.32));
  minion.hp = minion.maxHp;
  world.units.push(minion);

  world.floatingTexts.push({
    id: `ft_summon_${world.tick}_${minion.instanceId}`,
    pos: { x: minion.pos.x, y: minion.pos.y - 30 },
    text: '👻 도펠맨 소환!',
    color: '#a855f7',
    elapsedSec: 0,
    durationSec: 1.1,
    scale: 1.15
  });
  world.combatLog.push(
    `[분신 소환] ${caster.name} 그림자 분신 [${minion.name}] 소환! (HP ${minion.maxHp})`
  );
  return { action: 'SUMMONED', minionId: minion.instanceId };
}

export function tryTriggerRevivePassive(
  unit: UnitRuntimeState,
  world: BattleWorldState,
  registry: GameDataRegistry
): boolean {
  if (unit.hasRevivedOnce) return false;
  if (unit.fruitType !== 'NONE' && unit.fruitNullifyTimer > 0) return false;
  const trait = registry.traits[unit.traitId];
  if (!trait?.revivePassive?.enabled) return false;

  unit.hasRevivedOnce = true;
  const reviveHp = Math.max(1, Math.round(unit.maxHp * trait.revivePassive.reviveHpRatio));
  unit.hp = reviveHp;
  unit.isAlive = true;
  unit.iframeTimer = Math.max(unit.iframeTimer, 1.2);

  // Heal nearby allies by allyHealRatio (15%)
  const healRadius = trait.revivePassive.allyHealRadiusPx ?? 240;
  for (const ally of world.units) {
    if (
      ally.instanceId === unit.instanceId ||
      !ally.isAlive ||
      !ally.isOnField ||
      ally.team !== unit.team
    ) {
      continue;
    }
    if (distVec(ally.pos, unit.pos) <= healRadius) {
      const allyHeal = Math.max(
        1,
        Math.round(ally.maxHp * trait.revivePassive.allyHealRatio)
      );
      ally.hp = Math.min(ally.maxHp, ally.hp + allyHeal);
      world.floatingTexts.push({
        id: `ft_revive_ally_${world.tick}_${ally.instanceId}`,
        pos: { x: ally.pos.x, y: ally.pos.y - 28 },
        text: `🔥 푸른 불꽃 치유 +${allyHeal}`,
        color: '#38bdf8',
        elapsedSec: 0,
        durationSec: 1.1,
        scale: 1.05
      });
    }
  }

  world.vfxEvents.push({
    id: `vfx_revive_${world.tick}_${unit.instanceId}`,
    kind: 'FORM_BURST',
    pos: { x: unit.pos.x, y: unit.pos.y },
    color: '#0ea5e9',
    radiusPx: 96,
    elapsedSec: 0,
    durationSec: 0.7
  });
  world.floatingTexts.push({
    id: `ft_revive_${world.tick}_${unit.instanceId}`,
    pos: { x: unit.pos.x, y: unit.pos.y - 40 },
    text: `🔥 불사조 재생 부활! (+${reviveHp} HP)`,
    color: '#38bdf8',
    elapsedSec: 0,
    durationSec: 1.6,
    scale: 1.35
  });
  world.combatLog.push(
    `[불사조 부활] ${unit.name} 치명상을 푸른 불꽃으로 소생! (HP 40% 부활 + 주변 아군 15% 치유)`
  );
  return true;
}

export function spawnNextGauntletWave(
  world: BattleWorldState,
  registry: GameDataRegistry
): boolean {
  const nextIdx = world.currentWaveIndex + 1;
  if (nextIdx >= world.gauntletWaves.length) {
    return false;
  }
  world.currentWaveIndex = nextIdx;
  const wave = world.gauntletWaves[nextIdx];
  const cy = world.arenaHeight * 0.5;
  const activePerTeam = world.mode === '2V2' ? 2 : 1;

  wave.enemyBuilds.forEach((b, idx) => {
    const isOnField = idx < activePerTeam;
    const yOffset = activePerTeam === 2 ? (idx === 0 ? -75 : 75) : 0;
    const pos = { x: world.arenaWidth * 0.78, y: cy + yOffset };
    const spawned = createUnitRuntime(
      b,
      'OMEGA',
      idx,
      isOnField,
      pos,
      { x: -1, y: 0 },
      registry
    );
    world.units.push(spawned);
    if (isOnField) {
      triggerTraitHook('onEnterField', spawned, {}, world, registry);
    }
  });

  const primaryBoss = world.units.find(
    (u) => u.team === 'OMEGA' && u.isAlive && u.isOnField
  );
  if (primaryBoss) {
    const def = registry.units[primaryBoss.speciesId];
    world.bossIntroTimer = 1.5;
    world.bossIntroName = primaryBoss.name;
    world.bossIntroTitle = def?.title ?? wave.waveName;
    world.bossIntroBountyLabel = primaryBoss.bountyLabel;
  }

  world.waveBannerTimer = 2.4;
  world.waveBannerText = `WAVE ${nextIdx + 1}/${world.gauntletWaves.length}: ${wave.waveName}`;
  world.combatLog.push(
    `[마린포드 연전 전환] ${world.waveBannerText} 출현!`
  );
  return true;
}

export function activateBirdcage(
  owner: UnitRuntimeState,
  world: BattleWorldState,
  registry: GameDataRegistry
): boolean {
  if (world.birdcage.active) return false;
  const trait = registry.traits[owner.traitId];
  const cfg = trait?.shrinkingArena;
  world.birdcage = {
    active: true,
    ownerUnitId: owner.instanceId,
    shrinkScale: 1.0,
    minScaleRatio: cfg?.minScaleRatio ?? 0.45,
    shrinkRatePerSec: cfg?.shrinkRatePerSec ?? 0.025,
    boundarySlashDamage: cfg?.boundarySlashDamage ?? 18,
    boundaryKnockbackSpeed: cfg?.boundaryKnockbackSpeed ?? 220,
    tickTimer: 0
  };
  world.floatingTexts.push({
    id: `ft_birdcage_${world.tick}_${owner.instanceId}`,
    pos: { x: world.arenaWidth * 0.5, y: 88 },
    text: '🕸 새장(BIRDCAGE) 발동! 아레나가 축소됩니다!',
    color: '#f43f5e',
    elapsedSec: 0,
    durationSec: 1.8,
    scale: 1.35
  });
  world.combatLog.push(
    `[새장 발동] ${owner.name}의 붉은 실 새장이 전개되어 아레나가 점진 축소됩니다!`
  );
  return true;
}

export function triggerForesightFocusBreak(
  target: UnitRuntimeState,
  world: BattleWorldState,
  registry: GameDataRegistry,
  reasonLabel: string
): boolean {
  const trait = registry.traits[target.traitId];
  if (!trait?.futureSightCounter?.enabled) return false;
  target.foresightFocus = 0;
  target.foresightBreakTimer = trait.futureSightCounter.focusBreakDurationSec;
  world.floatingTexts.push({
    id: `ft_fbreak_${world.tick}_${target.instanceId}`,
    pos: { x: target.pos.x, y: target.pos.y - 40 },
    text: `💥 집중 붕괴! (${reasonLabel} / 5s 피해 +20%)`,
    color: '#facc15',
    elapsedSec: 0,
    durationSec: 1.5,
    scale: 1.25
  });
  world.combatLog.push(
    `[미래 예지 파훼] ${reasonLabel} 적중으로 ${target.name}의 집중이 0이 되어 5초간 집중 붕괴!`
  );
  return true;
}

export function triggerForesightEvadeAndCounter(
  defender: UnitRuntimeState,
  attacker: UnitRuntimeState | undefined,
  world: BattleWorldState,
  registry: GameDataRegistry
): void {
  defender.mochiMorphTimer = 0.48;
  defender.foresightFocus = Math.max(0, defender.foresightFocus - 10);
  world.floatingTexts.push({
    id: `ft_foresight_${world.tick}_${defender.instanceId}`,
    pos: { x: defender.pos.x, y: defender.pos.y - 34 },
    text: '👁 미래 예지! 떡 변형 회피!',
    color: '#e879f9',
    elapsedSec: 0,
    durationSec: 1.15,
    scale: 1.2
  });
  world.vfxEvents.push({
    id: `vfx_mochi_evade_${world.tick}_${defender.instanceId}`,
    kind: 'LOGIA_DISPERSION',
    pos: { x: defender.pos.x, y: defender.pos.y },
    color: '#f8fafc',
    radiusPx: 34,
    elapsedSec: 0,
    durationSec: 0.35
  });
  world.combatLog.push(
    `[미래 예지 회피] ${defender.name} 공격 궤도를 미리 읽고 몸을 떡처럼 변형해 회피 후 반격!`
  );

  // Immediate short counter strike toward attacker
  if (attacker && attacker.isAlive && attacker.isOnField) {
    const counterDir = normalizeVec(subVec(attacker.pos, defender.pos), defender.aimDir);
    defender.aimDir = counterDir;
    const counterMove =
      registry.moves['move_katakuri_kaku_mochi'] ??
      registry.moves[defender.moveSlots[0]?.moveId ?? ''];
    if (counterMove) {
      spawnMeleeArcInstance(defender, counterMove, counterDir, world, registry);
    }
  }
}

export function notifyUnitHitByAttack(
  attacker: UnitRuntimeState | undefined,
  target: UnitRuntimeState,
  damage: number,
  hasConquerorCoating: boolean,
  world: BattleWorldState,
  registry: GameDataRegistry
): void {
  if (damage <= 0) return;

  target.superRegenIdleTimer = 0;

  // Stage 2-B: Moria Shadows Asgard cumulative damage threshold check
  if (target.activeFormId) {
    target.shadowsAsgardDamageTaken += damage;
    forceRevertFormByDamageThreshold(target, world, registry);
  }

  // Stage 2-C Hook 1: Doflamingo Birdcage auto-trigger at <= 65% HP
  const targetTrait = registry.traits[target.traitId];
  if (
    targetTrait?.shrinkingArena?.enabled &&
    !world.birdcage.active &&
    target.hp > 0 &&
    target.hp <= target.maxHp * targetTrait.shrinkingArena.triggerHpRatio
  ) {
    activateBirdcage(target, world, registry);
  }

  // Stage 2-C Hook 3: Hody Jones Energy Steroid Overdrive auto-trigger at <= 50% HP
  if (
    targetTrait?.energySteroidOverdrive?.enabled &&
    !target.steroidOverdriveActive &&
    target.hp > 0 &&
    target.hp <= target.maxHp * targetTrait.energySteroidOverdrive.triggerHpRatio
  ) {
    target.steroidOverdriveActive = true;
    world.floatingTexts.push({
      id: `ft_steroid_${world.tick}_${target.instanceId}`,
      pos: { x: target.pos.x, y: target.pos.y - 42 },
      text: '💊 E.S 폭주! (공/속/연사 +35% · 피격 +15%)',
      color: '#ef4444',
      elapsedSec: 0,
      durationSec: 1.6,
      scale: 1.3
    });
    world.vfxEvents.push({
      id: `vfx_steroid_${world.tick}_${target.instanceId}`,
      kind: 'FORM_BURST',
      pos: { x: target.pos.x, y: target.pos.y },
      color: '#ef4444',
      radiusPx: 72,
      elapsedSec: 0,
      durationSec: 0.6
    });
    world.combatLog.push(
      `[E.S 백발 폭주] ${target.name} 에너지 스테로이드 과다 복용! 공격/속도/연사 +35%, 받는 피해 +15%!`
    );
  }

  // Stage 2-C: Katakuri Mochi sticky slow on attacker's hit
  const attackerTrait = attacker ? registry.traits[attacker.traitId] : undefined;
  if (attackerTrait?.mochiSlowOnHit && target.isAlive) {
    target.statBuffs.push({
      id: `mochi_slow_${world.tick}`,
      stat: 'spd',
      multiplier: attackerTrait.mochiSlowOnHit.slowMult,
      remainingSec: attackerTrait.mochiSlowOnHit.durationSec
    });
  }

  // Stage 2-B: Aokiji Frost Counter slows melee attackers on hit
  if (
    targetTrait?.frostCounterOnHit &&
    attacker &&
    attacker.isAlive &&
    distVec(attacker.pos, target.pos) <= 130
  ) {
    attacker.statBuffs.push({
      id: `frost_counter_${world.tick}`,
      stat: 'spd',
      multiplier: 0.72,
      remainingSec: 2.5
    });
  }
  if (targetTrait?.superRegeneration?.enabled) {
    const attackerHasConqLv3 =
      hasConquerorCoating || Boolean(attacker && attacker.haki.conqueror >= 3);
    if (attackerHasConqLv3) {
      const lockSec =
        targetTrait.superRegeneration.conquerorLockoutDurationSec ?? 6.0;
      target.superRegenLockoutTimer = lockSec;
      world.floatingTexts.push({
        id: `ft_regen_lock_${world.tick}_${target.instanceId}`,
        pos: { x: target.pos.x, y: target.pos.y - 38 },
        text: `⚡ 패왕색 재생 억제 (${lockSec.toFixed(0)}s)!`,
        color: '#ef4444',
        elapsedSec: 0,
        durationSec: 1.15,
        scale: 1.2
      });
      world.combatLog.push(
        `[초재생 억제] ${attacker?.name ?? '패왕색'}의 패왕색 휘감기 타격으로 ${target.name}의 초재생이 ${lockSec}초간 봉인됨!`
      );
    }
  }

  // Boss 50% HP Phase 2 transition
  if (
    target.isBossUnit &&
    !target.bossPhase2Triggered &&
    target.hp > 0 &&
    target.hp <= target.maxHp * 0.5
  ) {
    target.bossPhase2Triggered = true;
    target.statBuffs.push({
      id: 'boss_phase2_atk',
      stat: 'atk',
      multiplier: 1.18,
      remainingSec: 25
    });
    target.statBuffs.push({
      id: 'boss_phase2_spatk',
      stat: 'spAtk',
      multiplier: 1.18,
      remainingSec: 25
    });
    world.floatingTexts.push({
      id: `ft_phase2_${world.tick}_${target.instanceId}`,
      pos: { x: target.pos.x, y: target.pos.y - 44 },
      text: '⚠ BOSS PHASE 2 돌입!',
      color: '#f43f5e',
      elapsedSec: 0,
      durationSec: 1.4,
      scale: 1.35
    });
    world.vfxEvents.push({
      id: `vfx_phase2_${world.tick}_${target.instanceId}`,
      kind: 'FORM_BURST',
      pos: { x: target.pos.x, y: target.pos.y },
      color: '#f43f5e',
      radiusPx: Math.round(68 * target.entityScale),
      elapsedSec: 0,
      durationSec: 0.65
    });
    world.combatLog.push(
      `[보스 2페이즈] ${target.name} 체력 50% 이하! 흉포한 2페이즈 패턴 돌입!`
    );
    if (world.mode !== 'AI_VS_AI') {
      triggerBattleCutin(world, {
        kind: 'BOSS_PHASE2',
        team: target.team,
        primaryUnit: target,
        title: `${target.name} · PHASE 2`,
        subtitle: '전력 해방! 흉포한 2페이즈 돌입!',
        primaryColor: '#f43f5e',
        secondaryColor: '#f59e0b',
        portraitEmotion: 'angry'
      });
    }
  }
}

function executeMoveCast(
  caster: UnitRuntimeState,
  moveDef: MoveDefinition,
  aimDir: Vec2,
  world: BattleWorldState,
  registry: GameDataRegistry
): void {
  triggerTraitHook('onCast', caster, { moveArchetype: moveDef.archetype }, world, registry);
  consumeOverdriveSkillUse(caster, world, registry);

  // Phase 6: Air Door Teleport Behind Target (Blueno)
  if (moveDef.teleportBehindTarget) {
    const enemy = world.units.find(
      (u) => u.isAlive && u.isOnField && u.team !== caster.team
    );
    if (enemy) {
      caster.iframeTimer = Math.max(caster.iframeTimer, 0.35);
      const behindOffset = enemy.radiusPx + caster.radiusPx + 14;
      const behindDir = scaleVec(normalizeVec(enemy.aimDir, { x: 1, y: 0 }), -1);
      caster.pos = {
        x: clamp(
          enemy.pos.x + behindDir.x * behindOffset,
          caster.radiusPx,
          world.arenaWidth - caster.radiusPx
        ),
        y: clamp(
          enemy.pos.y + behindDir.y * behindOffset,
          caster.radiusPx,
          world.arenaHeight - caster.radiusPx
        )
      };
      caster.prevPos = { ...caster.pos };
      const newAim = normalizeVec(subVec(enemy.pos, caster.pos), aimDir);
      caster.aimDir = newAim;
      aimDir = newAim;
      world.floatingTexts.push({
        id: `ft_airdoor_${world.tick}_${caster.instanceId}`,
        pos: { x: caster.pos.x, y: caster.pos.y - 28 },
        text: '🚪 AIR DOOR AMBUSH!',
        color: '#2dd4bf',
        elapsedSec: 0,
        durationSec: 0.85,
        scale: 1.1
      });
      world.combatLog.push(
        `[문문 열매 기습] ${caster.name} 에어 도어로 ${enemy.name}의 배후로 순간이동!`
      );
    }
  }

  // Phase 6: Self Stat Buff on Cast (Morgan's 해군 호령, Blueno's 철괴·윤)
  if (moveDef.selfBuff) {
    caster.statBuffs.push({
      id: `${moveDef.id}_${world.tick}`,
      stat: moveDef.selfBuff.stat,
      multiplier: moveDef.selfBuff.multiplier,
      remainingSec: moveDef.selfBuff.durationSec
    });
    world.floatingTexts.push({
      id: `ft_sbuff_${world.tick}_${caster.instanceId}`,
      pos: { x: caster.pos.x, y: caster.pos.y - 28 },
      text: `${moveDef.name}! (${moveDef.selfBuff.stat.toUpperCase()} UP)`,
      color: '#fde047',
      elapsedSec: 0,
      durationSec: 0.85,
      scale: 1.05
    });
  }

  // Stage 2-C: Birdcage activation flag on move cast
  if (moveDef.activatesBirdcage) {
    activateBirdcage(caster, world, registry);
  }

  // Stage 2-A: Melee Reflect Cloak (Don Krieg's 검산 망토)
  if (moveDef.meleeReflectSec && moveDef.meleeReflectSec > 0) {
    caster.meleeReflectTimer = Math.max(
      caster.meleeReflectTimer,
      moveDef.meleeReflectSec
    );
  }

  // Stage 2-B: Summon Minion / Swap Position (Gecko Moria Doppelman)
  if (moveDef.summonMinionSpeciesId || moveDef.swapWithMinionIfAlive) {
    summonOrSwapMinion(caster, moveDef, world, registry);
    return;
  }

  // Stage 2-B: Party Heal Skill (Chopper Rumble Cure / Marco Phoenix Flame)
  if (moveDef.healPartyHpRatio && moveDef.healPartyHpRatio > 0) {
    for (const ally of world.units) {
      if (!ally.isAlive || !ally.isOnField || ally.team !== caster.team) continue;
      const healAmt = Math.max(1, Math.round(ally.maxHp * moveDef.healPartyHpRatio));
      ally.hp = Math.min(ally.maxHp, ally.hp + healAmt);
      world.floatingTexts.push({
        id: `ft_pheal_${world.tick}_${ally.instanceId}`,
        pos: { x: ally.pos.x, y: ally.pos.y - 28 },
        text: `💚 +${healAmt} HP`,
        color: '#4ade80',
        elapsedSec: 0,
        durationSec: 1.0,
        scale: 1.1
      });
    }
  }

  // Stage 2-B: Brook New World Performance (12s party skill cooldown -15% acceleration)
  if (moveDef.allyCooldownAccel) {
    for (const ally of world.units) {
      if (!ally.isAlive || ally.team !== caster.team) continue;
      ally.cooldownAccelTimer = Math.max(
        ally.cooldownAccelTimer,
        moveDef.allyCooldownAccel.durationSec
      );
      ally.cooldownAccelRatio = Math.max(
        ally.cooldownAccelRatio,
        moveDef.allyCooldownAccel.ratio
      );
    }
    world.floatingTexts.push({
      id: `ft_music_${world.tick}_${caster.instanceId}`,
      pos: { x: caster.pos.x, y: caster.pos.y - 34 },
      text: `🎵 뉴 월드 연주! 쿨타임 -${Math.round(moveDef.allyCooldownAccel.ratio * 100)}%`,
      color: '#fde047',
      elapsedSec: 0,
      durationSec: 1.3,
      scale: 1.15
    });
  }

  // Stage 2-B: Blackbeard Seaquake / Marco Blue Flame Guard (shatters enemy projectiles & beams)
  if (moveDef.shatterProjectilesAndBeams) {
    for (const p of world.projectiles) {
      if (p.team !== caster.team && distVec(p.pos, caster.pos) <= moveDef.rangePx + 40) {
        p.destroyed = true;
      }
    }
    for (const b of world.beams) {
      if (b.team !== caster.team && distVec(b.origin, caster.pos) <= moveDef.rangePx + 180) {
        b.dimmed = true;
        b.currentPower *= 0.45;
      }
    }
  }

  // Stage 2-B: Blackbeard Kurouzu Pull Target Toward Caster
  if (moveDef.pullTargetTowardCasterPx && moveDef.pullTargetTowardCasterPx > 0) {
    const enemy = world.units.find(
      (u) =>
        u.isAlive &&
        u.isOnField &&
        u.team !== caster.team &&
        distVec(u.pos, caster.pos) <= moveDef.rangePx + u.radiusPx
    );
    if (enemy) {
      const toCaster = normalizeVec(subVec(caster.pos, enemy.pos), { x: -1, y: 0 });
      const pullDist = Math.min(
        moveDef.pullTargetTowardCasterPx,
        Math.max(0, distVec(enemy.pos, caster.pos) - (caster.radiusPx + enemy.radiusPx + 10))
      );
      enemy.pos = addVec(enemy.pos, scaleVec(toCaster, pullDist));
      enemy.prevPos = { ...enemy.pos };
      world.floatingTexts.push({
        id: `ft_kurouzu_${world.tick}_${enemy.instanceId}`,
        pos: { x: enemy.pos.x, y: enemy.pos.y - 32 },
        text: '🌑 쿠로우즈 흡입!',
        color: '#a855f7',
        elapsedSec: 0,
        durationSec: 0.9,
        scale: 1.15
      });
    }
  }

  // Stage 2-B: Robin Clutch Remote Target Strike (hits enemy directly at their position up to rangePx)
  if (moveDef.remoteTargetStrike) {
    const enemy = world.units.find(
      (u) =>
        u.isAlive &&
        u.isOnField &&
        u.team !== caster.team &&
        distVec(u.pos, caster.pos) <= moveDef.rangePx + u.radiusPx
    );
    if (enemy) {
      if (moveDef.basePower > 0) {
        const res = computeDamage(
          moveDef.basePower,
          caster,
          enemy,
          moveDef.category,
          moveDef.element,
          world,
          registry,
          {
            hasArmamentHaki: moveDef.hasArmamentHaki,
            isInternalDestruction: moveDef.isInternalDestruction,
            hasConquerorCoating: moveDef.hasConquerorCoating
          }
        );
        if (!res.nullified) {
          enemy.hp = Math.max(0, enemy.hp - res.damage);
          notifyUnitHitByAttack(
            caster,
            enemy,
            res.damage,
            Boolean(moveDef.hasConquerorCoating),
            world,
            registry
          );
          world.floatingTexts.push({
            id: `ft_clutch_${world.tick}_${enemy.instanceId}`,
            pos: { x: enemy.pos.x, y: enemy.pos.y - 28 },
            text: `🌸 클러치 -${res.damage}!`,
            color: '#f472b6',
            elapsedSec: 0,
            durationSec: 1.0,
            scale: 1.15
          });
        }
      }
      if (moveDef.statusSpec) {
        applyStatus(
          enemy,
          moveDef.statusSpec.statusKind,
          moveDef.statusSpec.durationSec,
          caster.instanceId,
          world,
          registry
        );
      }
      return;
    }
  }

  if (moveDef.archetype === 'PROJECTILE') {
    const spec = moveDef.projectileSpec;
    spawnProjectileInstance(caster, moveDef, aimDir, world, registry);
    if (spec && spec.pattern === 'BURST' && spec.burstCount > 1) {
      caster.pendingBurst = {
        moveId: moveDef.id,
        remainingCount: spec.burstCount - 1,
        intervalTimer: spec.burstIntervalSec,
        intervalSec: spec.burstIntervalSec,
        aimDir: { x: aimDir.x, y: aimDir.y }
      };
    }
  } else if (moveDef.archetype === 'BEAM') {
    spawnBeamInstance(caster, moveDef, aimDir, world, registry);
  } else if (moveDef.archetype === 'MELEE') {
    if (moveDef.triggersVenomDemon && !caster.venomDemonActive) {
      activateMagellanVenomDemon(caster, world, registry);
    }
    spawnMeleeArcInstance(caster, moveDef, aimDir, world, registry);
  } else if (moveDef.archetype === 'AOE_FIELD') {
    const targetPos = addVec(
      caster.pos,
      scaleVec(aimDir, Math.min(moveDef.rangePx, 180))
    );
    spawnFieldMove(caster, moveDef, targetPos, world, registry);
  } else if (moveDef.archetype === 'STATUS' && moveDef.statusSpec) {
    for (const enemy of world.units) {
      if (!enemy.isAlive || !enemy.isOnField || enemy.team === caster.team) continue;
      if (distVec(caster.pos, enemy.pos) <= moveDef.rangePx + enemy.radiusPx) {
          if (moveDef.basePower > 0) {
          const { damage } = computeDamage(
            moveDef.basePower,
            caster,
            enemy,
            'SPECIAL',
            moveDef.element,
            world,
            registry,
            {
              hasArmamentHaki: moveDef.hasArmamentHaki,
              isInternalDestruction: moveDef.isInternalDestruction,
              hasConquerorCoating: moveDef.hasConquerorCoating
            }
          );
          enemy.hp = Math.max(0, enemy.hp - damage);
          notifyUnitHitByAttack(
            caster,
            enemy,
            damage,
            Boolean(moveDef.hasConquerorCoating),
            world,
            registry
          );
        }
        applyStatus(
          enemy,
          moveDef.statusSpec.statusKind,
          moveDef.statusSpec.durationSec,
          caster.instanceId,
          world,
          registry
        );
      }
    }
  }
}

function tryStartMoveWindup(
  unit: UnitRuntimeState,
  slotIndex: number,
  aimDir: Vec2,
  world: BattleWorldState,
  registry: GameDataRegistry
): boolean {
  if (
    !unit.isAlive ||
    !unit.isOnField ||
    unit.isDowned ||
    (world.raidState.active &&
      world.raidState.bossUnitId === unit.instanceId &&
      world.raidState.groggyTimer > 0) ||
    unit.windupMoveId !== null ||
    unit.guardHeld ||
    unit.dodgeActiveTimer > 0 ||
    unit.clashLockId !== null ||
    isUnitStaggered(unit)
  ) {
    return false;
  }

  const slot = unit.moveSlots[slotIndex];
  if (!slot || slot.charges <= 0 || slot.cooldownTimer > 0) {
    return false;
  }

  const moveDef = registry.moves[slot.moveId];
  if (!moveDef) return false;

  if (isUnitSkillSealed(unit) && moveDef.category === 'SPECIAL') {
    world.floatingTexts.push({
      id: `ft_sealed_${world.tick}_${unit.instanceId}`,
      pos: { x: unit.pos.x, y: unit.pos.y - 24 },
      text: 'SKILL SEALED!',
      color: '#c084fc',
      elapsedSec: 0,
      durationSec: 0.7,
      scale: 0.95
    });
    return false;
  }

  slot.charges -= 1;
  slot.cooldownTimer = moveDef.cooldownSec;

  // Phase 6: Lunarian Flame extinguish on high-speed dash / release skills & windup reduction
  const traitDef = registry.traits[unit.traitId];
  if (traitDef?.lunarianFlame?.enabled) {
    if (moveDef.extinguishesLunarianFlame && unit.lunarianFlameOn) {
      setLunarianFlameState(unit, false, world, registry);
    }
  }

  let windupSec = moveDef.windupSec;
  if (traitDef?.lunarianFlame?.enabled && !unit.lunarianFlameOn) {
    windupSec *= traitDef.lunarianFlame.flameOffWindupMultiplier;
  }
  if (
    (world.weather.id === 'SOLAR_FLARE' &&
      (moveDef.element === 'PYRO' || moveDef.element === 'FIRE')) ||
    (world.weather.id === 'TEMPEST_RAIN' && moveDef.element === 'AQUA') ||
    (world.weather.id === 'ION_STORM' &&
      (moveDef.element === 'VOLT' ||
        moveDef.element === 'VOID' ||
        moveDef.element === 'LIGHT'))
  ) {
    windupSec /= registry.balance.field.weatherCastSpeedMultiplier;
  }

  unit.windupMoveId = moveDef.id;
  unit.windupTimer = Math.max(0.02, windupSec);
  unit.windupAimDir = normalizeVec(aimDir, unit.aimDir);
  unit.aimDir = { x: unit.windupAimDir.x, y: unit.windupAimDir.y };

  return true;
}

function emitNullifiedHitFeedback(
  target: UnitRuntimeState,
  reason:
    | 'NONE'
    | 'LOGIA_INTANGIBLE'
    | 'ELEMENT_IMMUNE'
    | 'SLASH_SPLIT'
    | 'FORESIGHT_EVADE',
  world: BattleWorldState,
  attacker?: UnitRuntimeState,
  registry?: GameDataRegistry
): void {
  if (reason === 'FORESIGHT_EVADE') {
    if (registry) {
      triggerForesightEvadeAndCounter(target, attacker, world, registry);
    }
    return;
  }
  if (reason === 'SLASH_SPLIT') {
    world.slashImmuneMissCount += 1;
    world.floatingTexts.push({
      id: `ft_split_${world.tick}_${target.instanceId}`,
      pos: { x: target.pos.x, y: target.pos.y - 28 },
      text: '분할! (참격 면역 0 DMG)',
      color: '#f43f5e',
      elapsedSec: 0,
      durationSec: 0.95,
      scale: 1.2
    });
    world.vfxEvents.push({
      id: `vfx_split_${world.tick}_${target.instanceId}`,
      kind: 'HIT_SPARK',
      pos: { x: target.pos.x, y: target.pos.y },
      color: '#f43f5e',
      radiusPx: 30,
      elapsedSec: 0,
      durationSec: 0.35
    });
    world.combatLog.push(
      `[동강동강 분할 면역] ${target.name} 몸을 상하로 분할해 참격(SLASH) 공격을 완벽 무효화! (0 데미지)`
    );
    if (world.slashImmuneMissCount >= 2) {
      world.tacticalHintText =
        '⚠ 참격이 통하지 않는다! 타격(BLUNT) 동료(루피 등)로 교체하세요!';
      world.tacticalHintTimer = 5.0;
    }
    return;
  }
  if (reason === 'LOGIA_INTANGIBLE') {
    world.floatingTexts.push({
      id: `ft_logia_${world.tick}_${target.instanceId}`,
      pos: { x: target.pos.x, y: target.pos.y - 28 },
      text: 'LOGIA PASS! (0 DMG)',
      color: '#fde047',
      elapsedSec: 0,
      durationSec: 0.85,
      scale: 1.15
    });
    world.vfxEvents.push({
      id: `vfx_logia_${world.tick}_${target.instanceId}`,
      kind: 'LOGIA_DISPERSION',
      pos: { x: target.pos.x, y: target.pos.y },
      color: '#fde047',
      radiusPx: 32,
      elapsedSec: 0,
      durationSec: 0.35
    });
    world.combatLog.push(
      `[자연계 무효화] ${target.name} 비패기 공격을 원소화하여 흘려보냄! (0 데미지)`
    );
  } else if (reason === 'ELEMENT_IMMUNE') {
    world.floatingTexts.push({
      id: `ft_immune_el_${world.tick}_${target.instanceId}`,
      pos: { x: target.pos.x, y: target.pos.y - 28 },
      text: 'RUBBER IMMUNE! (0 DMG)',
      color: '#38bdf8',
      elapsedSec: 0,
      durationSec: 0.85,
      scale: 1.15
    });
    world.combatLog.push(
      `[특성 면역] ${target.name} 고무 신체로 번개 공격 완벽 무효화! (0 데미지)`
    );
  }
}

function applyDirectAttackHits(
  world: BattleWorldState,
  dt: number,
  registry: GameDataRegistry
): void {
  // 1. Projectiles vs Destructible Props & Enemy Units
  for (const proj of world.projectiles) {
    if (proj.destroyed) continue;
    const attacker = world.units.find((u) => u.instanceId === proj.ownerUnitId);
    const moveDef = registry.moves[proj.moveId];

    // Stage 2-B: Hit destructible arena props (Alabasta water barrels)
    for (const prop of world.destructibleProps) {
      if (prop.destroyed) continue;
      if (distVec(proj.pos, prop.pos) <= proj.radiusPx + prop.radiusPx) {
        proj.destroyed = true;
        damageDestructibleProp(prop, proj.currentPower, world, registry);
        break;
      }
    }
    if (proj.destroyed) continue;

    for (const target of world.units) {
      if (
        !target.isAlive ||
        !target.isOnField ||
        target.isDowned ||
        target.team === proj.team ||
        target.iframeTimer > 0
      ) {
        continue;
      }

      if (distVec(proj.pos, target.pos) <= proj.radiusPx + target.radiusPx) {
        if (attacker && moveDef) {
          const isBurstProj = moveDef.projectileSpec?.pattern === 'BURST';
          const res = computeDamage(
            proj.currentPower,
            attacker,
            target,
            moveDef.category,
            proj.element,
            world,
            registry,
            {
              hasArmamentHaki: proj.hasArmamentHaki,
              isInternalDestruction: proj.isInternalDestruction,
              hasConquerorCoating: proj.hasConquerorCoating,
              isProjectile: true,
              moveId: moveDef.id,
              isSingleLinear: !isBurstProj,
              isBurstOrAoe: isBurstProj
            }
          );

          if (res.nullified) {
            proj.destroyed = true;
            emitNullifiedHitFeedback(
              target,
              res.nullifyReason ?? 'NONE',
              world,
              attacker,
              registry
            );
            break;
          }

          const parryAmpDmg =
            target.parryStunTicks > 0
              ? Math.round(res.damage * target.parryDamageVulnMult)
              : res.damage;
          const guardEval = evaluateGuardOrParryOnIncomingAttack(
            target,
            attacker,
            'PROJECTILE',
            parryAmpDmg,
            normalizeVec(proj.vel, { x: 1, y: 0 }),
            world,
            registry,
            proj
          );
          if (guardEval.outcome === 'PARRIED_PROJECTILE') {
            // Projectile ownership & velocity have been reversed toward the caster!
            break;
          }

          proj.destroyed = true;
          const finalProjDmg = guardEval.finalDamage;

          target.lastIncomingMoveIdByAttacker[attacker.instanceId] = moveDef.id;
          const appliedProjDmg = interceptRaidBossIncomingDamage(
            world,
            target,
            attacker,
            finalProjDmg,
            proj.currentPower,
            proj.hasArmamentHaki,
            proj.hasConquerorCoating,
            proj.isInternalDestruction
          );
          target.hp = Math.max(0, target.hp - appliedProjDmg);
          addTeamBondGauge(
            attacker.team,
            world.rosters[attacker.team].recentSwapComboWindowTicks > 0
              ? BOND_SWAP_FOLLOWUP_GAIN
              : BOND_HIT_GAIN,
            world
          );
          if (proj.appliesVenomStacks && proj.appliesVenomStacks > 0) {
            applyVenomStacksToUnit(target, proj.appliesVenomStacks, world, registry);
          }
          notifyUnitHitByAttack(
            attacker,
            target,
            finalProjDmg,
            proj.hasConquerorCoating,
            world,
            registry
          );
          // Stage 2-C: Katakuri Future Sight Counterplay (Just Dodge / Obs Lv3 / Burst)
          if (
            registry.traits[target.traitId]?.futureSightCounter?.enabled &&
            target.foresightBreakTimer <= 0 &&
            (attacker.justDodgeBuffTimer > 0 ||
              attacker.haki.observation >= 3 ||
              isBurstProj)
          ) {
            const reason =
              attacker.justDodgeBuffTimer > 0
                ? '완벽 회피 반격'
                : attacker.haki.observation >= 3
                  ? '견문색 Lv.3'
                  : '연타 투사체';
            triggerForesightFocusBreak(target, world, registry, reason);
          }
          if (moveDef.confuseSec && moveDef.confuseSec > 0) {
            target.parasiteConfuseTimer = Math.max(
              target.parasiteConfuseTimer,
              moveDef.confuseSec
            );
            applyStatus(target, 'ROOT', moveDef.confuseSec, attacker.instanceId, world, registry);
          }
          if (proj.element === 'SEA' || moveDef.applyWetSec) {
            applyStatus(
              target,
              'WET',
              moveDef.applyWetSec ?? 8.0,
              attacker.instanceId,
              world,
              registry
            );
          }
          if (moveDef.nullifyFruitSec) {
            applyFruitNullification(target, moveDef.nullifyFruitSec, world, registry);
          }
          if (moveDef.applyFreezeSec) {
            applyStatus(
              target,
              'FREEZE',
              moveDef.applyFreezeSec,
              attacker.instanceId,
              world,
              registry
            );
          }
          triggerTraitHook(
            'onHit',
            attacker,
            { moveArchetype: 'PROJECTILE' },
            world,
            registry
          );
          triggerTraitHook(
            'onBeingHit',
            target,
            { moveArchetype: 'PROJECTILE' },
            world,
            registry
          );

          world.hitstopTimer = Math.max(
            world.hitstopTimer,
            registry.balance.presentation.defaultHitstopSec
          );
          world.screenShakeTimer = 0.12;
          world.screenShakeMagnitude = 3.5;

          const color =
            res.affinity > 1.0
              ? '#facc15'
              : res.affinity < 1.0
                ? '#94a3b8'
                : '#f8fafc';
          world.floatingTexts.push({
            id: `ft_phit_${world.tick}_${target.instanceId}_${proj.id}`,
            pos: { x: target.pos.x, y: target.pos.y - 24 },
            text: res.affinity > 1.0 ? `-${res.damage}!` : `-${res.damage}`,
            color,
            elapsedSec: 0,
            durationSec: registry.balance.presentation.floatingTextDurationSec,
            scale: res.affinity > 1.0 ? 1.15 : 1.0
          });
          world.vfxEvents.push({
            id: `vfx_phit_${world.tick}_${proj.id}`,
            kind: proj.hasConquerorCoating ? 'CONQUEROR_LIGHTNING' : 'HIT_SPARK',
            pos: { x: proj.pos.x, y: proj.pos.y },
            color: proj.hasConquerorCoating ? '#ef4444' : color,
            radiusPx: 20,
            elapsedSec: 0,
            durationSec: 0.22
          });

          if (moveDef.pivotSwapOnHit) {
            openPivotSwapWindow(attacker, world, registry);
          }
        } else {
          proj.destroyed = true;
        }
        break;
      }
    }
  }

  // 2. Active Beams vs Enemy Units
  for (const beam of world.beams) {
    if (beam.terminated || beam.clashingWithBeamId || beam.guardedByMeleeId) {
      continue;
    }

    let maxLen = beam.maxRangePx;
    for (const zone of world.fieldZones) {
      if (zone.fieldKind !== 'DOME_SHIELD' || zone.team === beam.team || zone.domeHp <= 0) {
        continue;
      }
      const beamEnd = addVec(beam.origin, scaleVec(beam.dir, maxLen));
      const d = pointToSegmentDist(zone.pos, beam.origin, beamEnd);
      if (d <= zone.radiusPx) {
        maxLen = Math.max(24, distVec(beam.origin, zone.pos) - zone.radiusPx);
        zone.domeHp -= beam.currentPower * 0.45 * dt;
      }
    }
    beam.currentLengthPx = maxLen;

    beam.tickTimer += dt;
    if (beam.tickTimer < beam.tickIntervalSec) continue;
    beam.tickTimer -= beam.tickIntervalSec;

    const attacker = world.units.find((u) => u.instanceId === beam.ownerUnitId);
    const moveDef = registry.moves[beam.moveId];
    if (!attacker || !moveDef) continue;

    const beamEnd = addVec(beam.origin, scaleVec(beam.dir, beam.currentLengthPx));
    for (const target of world.units) {
      if (
        !target.isAlive ||
        !target.isOnField ||
        target.isDowned ||
        target.team === beam.team ||
        target.iframeTimer > 0
      ) {
        continue;
      }

      const d = pointToSegmentDist(target.pos, beam.origin, beamEnd);
      if (d <= target.radiusPx + beam.widthPx * 0.5) {
        const res = computeDamage(
          beam.currentPower * 0.28,
          attacker,
          target,
          moveDef.category,
          beam.element,
          world,
          registry,
          {
            hasArmamentHaki: beam.hasArmamentHaki,
            isInternalDestruction: beam.isInternalDestruction,
            hasConquerorCoating: beam.hasConquerorCoating
          }
        );

        if (res.nullified) {
          emitNullifiedHitFeedback(target, res.nullifyReason ?? 'NONE', world);
          continue;
        }

        const parryAmpBeamDmg =
          target.parryStunTicks > 0
            ? Math.round(res.damage * target.parryDamageVulnMult)
            : res.damage;
        const beamGuardEval = evaluateGuardOrParryOnIncomingAttack(
          target,
          attacker,
          'BEAM',
          parryAmpBeamDmg,
          beam.dir,
          world,
          registry
        );
        const finalBeamDmg = beamGuardEval.finalDamage;

        const appliedBeamDmg = interceptRaidBossIncomingDamage(
          world,
          target,
          attacker,
          finalBeamDmg,
          beam.currentPower * 0.35,
          beam.hasArmamentHaki,
          beam.hasConquerorCoating,
          beam.isInternalDestruction
        );
        target.hp = Math.max(0, target.hp - appliedBeamDmg);
        addTeamBondGauge(attacker.team, 3, world);
        notifyUnitHitByAttack(
          attacker,
          target,
          finalBeamDmg,
          beam.hasConquerorCoating,
          world,
          registry
        );
        triggerTraitHook('onHit', attacker, { moveArchetype: 'BEAM' }, world, registry);
        triggerTraitHook('onBeingHit', target, { moveArchetype: 'BEAM' }, world, registry);

        world.floatingTexts.push({
          id: `ft_bhit_${world.tick}_${target.instanceId}`,
          pos: { x: target.pos.x, y: target.pos.y - 24 },
          text: `-${res.damage}`,
          color: res.affinity > 1.0 ? '#facc15' : '#38bdf8',
          elapsedSec: 0,
          durationSec: 0.55,
          scale: 0.95
        });
      }
    }
  }

  // 3. Melee Arcs vs Enemy Units
  for (const arc of world.meleeArcs) {
    if (
      arc.finished ||
      arc.clashing ||
      arc.elapsedSec > arc.activeDamageDurationSec
    ) {
      continue;
    }

    const attacker = world.units.find((u) => u.instanceId === arc.ownerUnitId);
    const moveDef = registry.moves[arc.moveId];
    if (!attacker || !moveDef) continue;

    // Stage 2-B: Melee hits destructible arena props (Alabasta water barrels)
    for (const prop of world.destructibleProps) {
      if (prop.destroyed) continue;
      if (
        isCircleIntersectingSector(
          prop.pos,
          prop.radiusPx,
          arc.origin,
          arc.dir,
          arc.radiusPx,
          arc.arcDeg
        )
      ) {
        damageDestructibleProp(prop, arc.currentPower, world, registry);
      }
    }

    for (const target of world.units) {
      if (
        !target.isAlive ||
        !target.isOnField ||
        target.isDowned ||
        target.team === arc.team ||
        target.iframeTimer > 0 ||
        arc.hitUnitIds.includes(target.instanceId)
      ) {
        continue;
      }

      if (
        isCircleIntersectingSector(
          target.pos,
          target.radiusPx,
          arc.origin,
          arc.dir,
          arc.radiusPx,
          arc.arcDeg
        )
      ) {
        arc.hitUnitIds.push(target.instanceId);
        const res = computeDamage(
          arc.currentPower,
          attacker,
          target,
          moveDef.category,
          arc.element,
          world,
          registry,
          {
            hasArmamentHaki: arc.hasArmamentHaki,
            isInternalDestruction: arc.isInternalDestruction,
            hasConquerorCoating: arc.hasConquerorCoating,
            moveId: moveDef.id,
            isSingleLinear: arc.arcDeg < 300,
            isBurstOrAoe: arc.arcDeg >= 300
          }
        );

        if (res.nullified) {
          emitNullifiedHitFeedback(
            target,
            res.nullifyReason ?? 'NONE',
            world,
            attacker,
            registry
          );
          continue;
        }

        const parryAmpMeleeDmg =
          target.parryStunTicks > 0
            ? Math.round(res.damage * target.parryDamageVulnMult)
            : res.damage;
        const meleeGuardEval = evaluateGuardOrParryOnIncomingAttack(
          target,
          attacker,
          'MELEE',
          parryAmpMeleeDmg,
          arc.dir,
          world,
          registry
        );
        if (meleeGuardEval.outcome === 'PARRIED_MELEE') {
          continue;
        }
        const finalMeleeDmg = meleeGuardEval.finalDamage;

        target.lastIncomingMoveIdByAttacker[attacker.instanceId] = moveDef.id;
        const appliedMeleeDmg = interceptRaidBossIncomingDamage(
          world,
          target,
          attacker,
          finalMeleeDmg,
          arc.currentPower,
          arc.hasArmamentHaki,
          arc.hasConquerorCoating,
          arc.isInternalDestruction
        );
        target.hp = Math.max(0, target.hp - appliedMeleeDmg);
        addTeamBondGauge(
          attacker.team,
          world.rosters[attacker.team].recentSwapComboWindowTicks > 0
            ? BOND_SWAP_FOLLOWUP_GAIN
            : BOND_HIT_GAIN,
          world
        );
        notifyUnitHitByAttack(
          attacker,
          target,
          finalMeleeDmg,
          arc.hasConquerorCoating,
          world,
          registry
        );
        // Stage 2-C: Katakuri Future Sight Counterplay (Just Dodge / Obs Lv3 / 360 AoE)
        if (
          registry.traits[target.traitId]?.futureSightCounter?.enabled &&
          target.foresightBreakTimer <= 0 &&
          (attacker.justDodgeBuffTimer > 0 ||
            attacker.haki.observation >= 3 ||
            arc.arcDeg >= 300)
        ) {
          const reason =
            attacker.justDodgeBuffTimer > 0
              ? '완벽 회피 반격'
              : attacker.haki.observation >= 3
                ? '견문색 Lv.3'
                : '전방위 광역기';
          triggerForesightFocusBreak(target, world, registry, reason);
        }
        if (moveDef.confuseSec && moveDef.confuseSec > 0) {
          target.parasiteConfuseTimer = Math.max(
            target.parasiteConfuseTimer,
            moveDef.confuseSec
          );
        }

        // Stage 2-A: Don Krieg Needle Cloak melee damage reflection
        if (target.meleeReflectTimer > 0 && res.damage > 0) {
          const refDmg = Math.max(1, Math.round(res.damage * 0.25));
          attacker.hp = Math.max(0, attacker.hp - refDmg);
          world.floatingTexts.push({
            id: `ft_reflect_${world.tick}_${attacker.instanceId}`,
            pos: { x: attacker.pos.x, y: attacker.pos.y - 26 },
            text: `검산 망토 반사 -${refDmg}`,
            color: '#f59e0b',
            elapsedSec: 0,
            durationSec: 0.85,
            scale: 1.0
          });
        }

        // Stage 2-A: Smoker Seastone Jitte skill cooldown delay (+3s) on Devil Fruit users
        if (moveDef.skillCooldownDelaySec && target.fruitType !== 'NONE') {
          for (const sl of target.moveSlots) {
            sl.cooldownTimer = Math.max(sl.cooldownTimer, moveDef.skillCooldownDelaySec);
          }
          world.floatingTexts.push({
            id: `ft_seastone_${world.tick}_${target.instanceId}`,
            pos: { x: target.pos.x, y: target.pos.y - 36 },
            text: `해루석 짙테! 스킬 지연 +${moveDef.skillCooldownDelaySec}s`,
            color: '#38bdf8',
            elapsedSec: 0,
            durationSec: 1.0,
            scale: 1.05
          });
        }

        // Stage 2-B: Melee hit status & hook effects (SEA->WET, Blackbeard Fruit Nullify, Aokiji Freeze)
        if (arc.element === 'SEA' || moveDef.applyWetSec) {
          applyStatus(
            target,
            'WET',
            moveDef.applyWetSec ?? 8.0,
            attacker.instanceId,
            world,
            registry
          );
        }
        if (moveDef.nullifyFruitSec) {
          applyFruitNullification(target, moveDef.nullifyFruitSec, world, registry);
        }
        if (moveDef.applyFreezeSec) {
          applyStatus(
            target,
            'FREEZE',
            moveDef.applyFreezeSec,
            attacker.instanceId,
            world,
            registry
          );
        }
        if (moveDef.appliesVenomStacks && moveDef.appliesVenomStacks > 0) {
          applyVenomStacksToUnit(target, moveDef.appliesVenomStacks, world, registry);
        }
        triggerTraitHook('onHit', attacker, { moveArchetype: 'MELEE' }, world, registry);
        triggerTraitHook('onBeingHit', target, { moveArchetype: 'MELEE' }, world, registry);

        const rawKb = arc.hasConquerorCoating ? 210 : 140;
        const effectiveKb = meleeGuardEval.negateKnockback
          ? 0
          : rawKb * Math.max(0, 1 - target.knockbackResist);
        target.knockbackVel = scaleVec(arc.dir, effectiveKb);
        world.hitstopTimer = Math.max(
          world.hitstopTimer,
          registry.balance.presentation.defaultHitstopSec
        );
        world.screenShakeTimer = 0.14;
        world.screenShakeMagnitude = arc.hasConquerorCoating ? 6.0 : 4.5;

        if (arc.hasConquerorCoating) {
          world.vfxEvents.push({
            id: `vfx_conq_hit_${world.tick}_${target.instanceId}`,
            kind: 'CONQUEROR_LIGHTNING',
            pos: { x: target.pos.x, y: target.pos.y },
            color: '#dc2626',
            radiusPx: 42,
            elapsedSec: 0,
            durationSec: 0.35
          });
        }

        world.floatingTexts.push({
          id: `ft_mhit_${world.tick}_${target.instanceId}`,
          pos: { x: target.pos.x, y: target.pos.y - 26 },
          text:
            arc.hasConquerorCoating
              ? `⚡ -${res.damage}!`
              : res.affinity > 1.0
                ? `-${res.damage}!`
                : `-${res.damage}`,
          color: arc.hasConquerorCoating
            ? '#ef4444'
            : res.affinity > 1.0
              ? '#facc15'
              : '#f8fafc',
          elapsedSec: 0,
          durationSec: registry.balance.presentation.floatingTextDurationSec,
          scale: arc.hasConquerorCoating ? 1.25 : 1.15
        });

        if (moveDef.pivotSwapOnHit) {
          openPivotSwapWindow(attacker, world, registry);
        }
      }
    }
  }
}

export function stepBattleWorld(
  world: BattleWorldState,
  playerCommands: UnitInputCommand[],
  registry: GameDataRegistry,
  prng: SeededPRNG,
  dt: number = FIXED_DT
): void {
  if (world.winnerTeam !== null) {
    return;
  }

  world.tick += 1;

  // Phase 16: Deterministic 39-tick Cut-In Freeze (100% synced in online lockstep)
  if (world.cutinFreezeTicks > 0) {
    world.cutinFreezeTicks = Math.max(0, world.cutinFreezeTicks - 1);
    if (world.activeCutin) {
      world.activeCutin.elapsedTicks += 1;
      if (world.cutinFreezeTicks <= 0) {
        world.activeCutin = null;
      }
    }
    return;
  }

  for (let i = world.parryMiniEvents.length - 1; i >= 0; i--) {
    const ev = world.parryMiniEvents[i];
    ev.elapsedTicks += 1;
    if (ev.elapsedTicks >= ev.durationTicks) {
      world.parryMiniEvents.splice(i, 1);
    }
  }

  if (world.screenShakeTimer > 0) {
    world.screenShakeTimer = Math.max(0, world.screenShakeTimer - dt);
  }
  if (world.screenFlashTimer > 0) {
    world.screenFlashTimer = Math.max(0, world.screenFlashTimer - dt);
  }
  if (world.bossIntroTimer > 0) {
    world.bossIntroTimer = Math.max(0, world.bossIntroTimer - dt);
  }
  if (world.waveBannerTimer > 0) {
    world.waveBannerTimer = Math.max(0, world.waveBannerTimer - dt);
    if (world.waveBannerTimer <= 0) {
      world.waveBannerText = null;
    }
  }
  if (world.tacticalHintTimer > 0) {
    world.tacticalHintTimer = Math.max(0, world.tacticalHintTimer - dt);
    if (world.tacticalHintTimer <= 0) {
      world.tacticalHintText = null;
    }
  }
  for (let i = world.floatingTexts.length - 1; i >= 0; i--) {
    const ft = world.floatingTexts[i];
    ft.elapsedSec += dt;
    ft.pos.y -= 18 * dt;
    if (ft.elapsedSec >= ft.durationSec) {
      world.floatingTexts.splice(i, 1);
    }
  }
  for (let i = world.vfxEvents.length - 1; i >= 0; i--) {
    const vfx = world.vfxEvents[i];
    vfx.elapsedSec += dt;
    if (vfx.elapsedSec >= vfx.durationSec) {
      world.vfxEvents.splice(i, 1);
    }
  }

  if (world.hitstopTimer > 0) {
    world.hitstopTimer = Math.max(0, world.hitstopTimer - dt);
    return;
  }

  let simDt = dt;
  if (world.slowMoTimer > 0) {
    world.slowMoTimer = Math.max(0, world.slowMoTimer - dt);
    simDt = dt * world.slowMoScale;
  }

  world.elapsedSec += simDt;
  stepTeamRosters(world, simDt);
  stepActiveBondCombo(world, registry, prng);

  if (world.environmentField.remainingSec > 0) {
    world.environmentField.remainingSec = Math.max(
      0,
      world.environmentField.remainingSec - simDt
    );
    if (world.environmentField.remainingSec <= 0) {
      world.environmentField.kind = 'NONE';
      world.environmentField.ownerUnitId = null;
      world.environmentField.team = null;
    }
  }

  const cmdMap = new Map<string, UnitInputCommand>();
  for (const cmd of playerCommands) {
    cmdMap.set(cmd.unitId, cmd);
  }
  for (const unit of world.units) {
    if (!unit.isOnField || !unit.isAlive) continue;
    if (!unit.isPlayerControlled || world.mode === 'AI_VS_AI') {
      cmdMap.set(unit.instanceId, computeAiCommand(unit, world, registry, prng, simDt));
    }
  }

  for (const unit of world.units) {
    unit.prevPos = { x: unit.pos.x, y: unit.pos.y };
    if (!unit.isAlive) continue;

    const steroidTrait = registry.traits[unit.traitId]?.energySteroidOverdrive;
    const steroidCdBonus =
      unit.steroidOverdriveActive && steroidTrait?.enabled
        ? steroidTrait.cooldownAccelRatio
        : 0;
    const cdAccelMult =
      (unit.cooldownAccelTimer > 0 ? 1 + unit.cooldownAccelRatio : 1.0) +
      steroidCdBonus +
      unit.endgameCooldownReductionRatio;
    if (unit.cooldownAccelTimer > 0) {
      unit.cooldownAccelTimer = Math.max(0, unit.cooldownAccelTimer - simDt);
      if (unit.cooldownAccelTimer <= 0) {
        unit.cooldownAccelRatio = 0;
      }
    }
    if (unit.fruitNullifyTimer > 0) {
      unit.fruitNullifyTimer = Math.max(0, unit.fruitNullifyTimer - simDt);
    }
    if (unit.mochiMorphTimer > 0) {
      unit.mochiMorphTimer = Math.max(0, unit.mochiMorphTimer - simDt);
    }
    if (unit.parasiteConfuseTimer > 0) {
      unit.parasiteConfuseTimer = Math.max(0, unit.parasiteConfuseTimer - simDt);
    }
    // Stage 2-C: Katakuri Foresight Focus Break & Focus Regen
    const fsTrait = registry.traits[unit.traitId]?.futureSightCounter;
    if (fsTrait?.enabled) {
      if (unit.foresightBreakTimer > 0) {
        unit.foresightBreakTimer = Math.max(0, unit.foresightBreakTimer - simDt);
      } else if (unit.foresightFocus < fsTrait.maxFocus) {
        unit.foresightFocus = Math.min(
          fsTrait.maxFocus,
          unit.foresightFocus + fsTrait.focusRegenPerSec * simDt
        );
      }
    }

    for (const slot of unit.moveSlots) {
      if (slot.cooldownTimer > 0) {
        slot.cooldownTimer = Math.max(0, slot.cooldownTimer - simDt * cdAccelMult);
      }
      const mDef = registry.moves[slot.moveId];
      if (mDef && slot.charges < slot.maxCharges) {
        slot.chargeRechargeTimer += simDt * cdAccelMult;
        if (slot.chargeRechargeTimer >= mDef.chargeRecoverySec) {
          slot.chargeRechargeTimer -= mDef.chargeRecoverySec;
          slot.charges += 1;
        }
      } else {
        slot.chargeRechargeTimer = 0;
      }
    }

    if (!unit.isOnField) continue;

    stepUnitStatuses(unit, simDt, registry);
    const dodgeEnvMult =
      world.impelDownHazard.active && unit.team === 'ALPHA'
        ? world.impelDownHazard.dodgeRechargeMult
        : 1.0;
    stepUnitDodge(unit, simDt, registry, dodgeEnvMult);
    stepUnitFormShift(unit, simDt, world, registry);

    // Stage 2-A timers & arena water terrain detection
    if (unit.baraSplitTimer > 0) {
      unit.baraSplitTimer = Math.max(0, unit.baraSplitTimer - simDt);
    }
    if (unit.meleeReflectTimer > 0) {
      unit.meleeReflectTimer = Math.max(0, unit.meleeReflectTimer - simDt);
    }
    unit.inWaterTerrain = world.waterZones.some(
      (wz) => distVec(unit.pos, wz) <= wz.radiusPx + unit.radiusPx * 0.5
    );

    // Phase 6 Hook 1: Lunarian Flame auto-reignite countdown
    const uTrait = registry.traits[unit.traitId];
    if (
      uTrait?.lunarianFlame?.enabled &&
      !unit.lunarianFlameOn &&
      unit.lunarianReigniteTimer > 0
    ) {
      unit.lunarianReigniteTimer = Math.max(
        0,
        unit.lunarianReigniteTimer - simDt
      );
      if (unit.lunarianReigniteTimer <= 0) {
        setLunarianFlameState(unit, true, world, registry);
      }
    }

    // Phase 6 Hook 2: Super Regeneration (+3% MaxHP/sec after 1.5s post-hit delay, paused for 6s by Conqueror Lv3 hit)
    if (uTrait?.superRegeneration?.enabled && unit.isAlive) {
      if (unit.superRegenLockoutTimer > 0) {
        unit.superRegenLockoutTimer = Math.max(
          0,
          unit.superRegenLockoutTimer - simDt
        );
      } else {
        unit.superRegenIdleTimer += simDt;
        const delayReq = uTrait.superRegeneration.delayAfterHitSec ?? 1.5;
        if (unit.superRegenIdleTimer >= delayReq && unit.hp < unit.maxHp) {
          const regenPerSec =
            uTrait.superRegeneration.regenMaxHpRatioPerSec ?? 0.03;
          unit.regenAccumTimer += simDt;
          if (unit.regenAccumTimer >= 0.5) {
            const ticksElapsed = unit.regenAccumTimer;
            unit.regenAccumTimer = 0;
            const healAmt = Math.max(
              1,
              Math.round(unit.maxHp * regenPerSec * ticksElapsed)
            );
            unit.hp = Math.min(unit.maxHp, unit.hp + healAmt);
          }
        }
      }
    }

    if (unit.pendingBurst && !isUnitStaggered(unit)) {
      unit.pendingBurst.intervalTimer -= simDt;
      if (unit.pendingBurst.intervalTimer <= 0) {
        const mDef = registry.moves[unit.pendingBurst.moveId];
        if (mDef) {
          spawnProjectileInstance(unit, mDef, unit.pendingBurst.aimDir, world, registry);
        }
        unit.pendingBurst.remainingCount -= 1;
        if (unit.pendingBurst.remainingCount <= 0) {
          unit.pendingBurst = null;
        } else {
          unit.pendingBurst.intervalTimer += unit.pendingBurst.intervalSec;
        }
      }
    }

    const cmd = cmdMap.get(unit.instanceId);
    stepUnitGuardAndParry(unit, cmd, world, simDt);
    if (cmd) {
      if (cmd.swapToBenchUnitId) {
        executeRosterSwap(unit, cmd.swapToBenchUnitId, world, registry, false);
        continue;
      }
      if (cmd.aimVec && lenVec(cmd.aimVec) > 0.05) {
        unit.aimDir = normalizeVec(cmd.aimVec, unit.aimDir);
      }
      if (cmd.bondComboPressed) {
        tryActivateBondTagCombo(unit, world, registry);
      }
      if (cmd.awakeningPressed) {
        activateFormShift(unit, world, registry);
      } else if (cmd.formShiftPressed) {
        if (unit.stanceFormIds.length > 0) {
          cycleZoanStance(unit, world, registry);
        } else {
          activateFormShift(unit, world, registry);
        }
      }
      if (cmd.dodgePressed) {
        tryExecuteDodge(unit, cmd.moveVec, world, registry);
      }
      if (cmd.castMoveSlotIndex !== null) {
        tryStartMoveWindup(unit, cmd.castMoveSlotIndex, unit.aimDir, world, registry);
      }
    }

    if (unit.windupMoveId) {
      unit.windupTimer -= simDt;
      if (unit.windupTimer <= 0) {
        const mDef = registry.moves[unit.windupMoveId];
        const aim = { x: unit.windupAimDir.x, y: unit.windupAimDir.y };
        unit.windupMoveId = null;
        unit.windupTimer = 0;
        if (mDef) {
          executeMoveCast(unit, mDef, aim, world, registry);
        }
      }
    }

    const spdStat = getUnitCurrentStat(unit, 'spd', world, registry);
    const moveSpeedPx =
      registry.balance.unitPhysics.baseMoveSpeedPx +
      spdStat * registry.balance.unitPhysics.speedStatScale;

    if (
      unit.isDowned ||
      (world.raidState.active &&
        world.raidState.bossUnitId === unit.instanceId &&
        world.raidState.groggyTimer > 0) ||
      unit.clashLockId !== null ||
      isUnitStaggered(unit) ||
      isUnitRooted(unit)
    ) {
      unit.vel = { x: 0, y: 0 };
    } else if (unit.dodgeActiveTimer > 0) {
      unit.vel = scaleVec(
        unit.dodgeDir,
        moveSpeedPx * registry.balance.dodge.speedMultiplier
      );
    } else if (cmd && lenVec(cmd.moveVec) > 0.05) {
      let mDir = normalizeVec(cmd.moveVec);
      if (unit.parasiteConfuseTimer > 0) {
        mDir = { x: -mDir.x, y: -mDir.y };
      }
      const castSlow = unit.guardHeld
        ? 0.35
        : unit.windupMoveId || unit.activeBeamId
          ? 0.45
          : 1.0;
      unit.vel = scaleVec(mDir, moveSpeedPx * castSlow);
    } else {
      const friction = unit.onIceHazard ? 1.8 : 10;
      unit.vel = scaleVec(unit.vel, Math.max(0, 1 - friction * simDt));
    }

    const totalVel = addVec(unit.vel, unit.knockbackVel);
    unit.pos.x = clamp(
      unit.pos.x + totalVel.x * simDt,
      unit.radiusPx,
      world.arenaWidth - unit.radiusPx
    );
    unit.pos.y = clamp(
      unit.pos.y + totalVel.y * simDt,
      unit.radiusPx,
      world.arenaHeight - unit.radiusPx
    );

    const kbDecay = Math.max(
      0,
      1 - registry.balance.unitPhysics.knockbackFriction * simDt
    );
    unit.knockbackVel = scaleVec(unit.knockbackVel, kbDecay);
  }

  for (let i = world.projectiles.length - 1; i >= 0; i--) {
    const proj = world.projectiles[i];
    if (proj.destroyed) {
      world.projectiles.splice(i, 1);
      continue;
    }
    proj.prevPos = { x: proj.pos.x, y: proj.pos.y };
    proj.elapsedSec += simDt;

    // Stage 3: Homing projectile steering (e.g. Magellan's Hydra)
    if (proj.homingTurnRateRadPerSec && proj.homingTurnRateRadPerSec > 0) {
      let nearestEnemy: UnitRuntimeState | null = null;
      let nearestDist = Infinity;
      for (const cand of world.units) {
        if (!cand.isAlive || !cand.isOnField || cand.team === proj.team) continue;
        const d = distVec(proj.pos, cand.pos);
        if (d < nearestDist) {
          nearestDist = d;
          nearestEnemy = cand;
        }
      }
      if (nearestEnemy) {
        const speed = lenVec(proj.vel);
        if (speed > 1) {
          const curAngle = Math.atan2(proj.vel.y, proj.vel.x);
          const targetAngle = Math.atan2(
            nearestEnemy.pos.y - proj.pos.y,
            nearestEnemy.pos.x - proj.pos.x
          );
          let diff = targetAngle - curAngle;
          while (diff > Math.PI) diff -= Math.PI * 2;
          while (diff < -Math.PI) diff += Math.PI * 2;
          const maxTurn = proj.homingTurnRateRadPerSec * simDt;
          const nextAngle = curAngle + clamp(diff, -maxTurn, maxTurn);
          proj.vel = {
            x: Math.cos(nextAngle) * speed,
            y: Math.sin(nextAngle) * speed
          };
        }
      }
    }

    const speedScale = proj.isInsideBeam
      ? registry.balance.beam.projectileSlowMultiplier
      : 1.0;
    proj.pos.x += proj.vel.x * simDt * speedScale;
    proj.pos.y += proj.vel.y * simDt * speedScale;

    if (
      proj.elapsedSec >= proj.maxDurationSec ||
      proj.pos.x < -30 ||
      proj.pos.x > world.arenaWidth + 30 ||
      proj.pos.y < -30 ||
      proj.pos.y > world.arenaHeight + 30
    ) {
      world.projectiles.splice(i, 1);
    }
  }

  for (let i = world.beams.length - 1; i >= 0; i--) {
    const beam = world.beams[i];
    const owner = world.units.find((u) => u.instanceId === beam.ownerUnitId);
    if (beam.terminated || !owner || !owner.isAlive || !owner.isOnField) {
      if (owner && owner.activeBeamId === beam.id) {
        owner.activeBeamId = null;
      }
      world.beams.splice(i, 1);
      continue;
    }

    if (!beam.clashingWithBeamId && !beam.guardedByMeleeId) {
      beam.dir = normalizeVec(owner.aimDir, beam.dir);
    }
    beam.origin = addVec(owner.pos, scaleVec(beam.dir, owner.radiusPx + 6));
    beam.elapsedSec += simDt;
    if (beam.elapsedSec >= beam.maxDurationSec) {
      if (owner.activeBeamId === beam.id) {
        owner.activeBeamId = null;
      }
      world.beams.splice(i, 1);
    }
  }

  for (let i = world.meleeArcs.length - 1; i >= 0; i--) {
    const arc = world.meleeArcs[i];
    const owner = world.units.find((u) => u.instanceId === arc.ownerUnitId);
    if (arc.finished || !owner || !owner.isAlive || !owner.isOnField) {
      world.meleeArcs.splice(i, 1);
      continue;
    }
    arc.origin = { x: owner.pos.x, y: owner.pos.y };
    arc.elapsedSec += simDt;
    if (arc.elapsedSec >= arc.totalLingerDurationSec) {
      world.meleeArcs.splice(i, 1);
    }
  }

  stepAllClashes(world, simDt, registry);
  applyDirectAttackHits(world, simDt, registry);

  for (let i = world.projectiles.length - 1; i >= 0; i--) {
    if (world.projectiles[i].destroyed) {
      world.projectiles.splice(i, 1);
    }
  }
  for (let i = world.beams.length - 1; i >= 0; i--) {
    if (world.beams[i].terminated) {
      const owner = world.units.find(
        (u) => u.instanceId === world.beams[i].ownerUnitId
      );
      if (owner && owner.activeBeamId === world.beams[i].id) {
        owner.activeBeamId = null;
      }
      world.beams.splice(i, 1);
    }
  }
  for (let i = world.meleeArcs.length - 1; i >= 0; i--) {
    if (world.meleeArcs[i].finished) {
      world.meleeArcs.splice(i, 1);
    }
  }

  stepFieldAndGlobalEffects(world, simDt, registry);

  // Stage 3 Hook A: Magellan Venom Demon Phase 2 Auto-Trigger, Aura & Stacking Venom DoT
  for (const unit of world.units) {
    if (!unit.isAlive || !unit.isOnField) continue;
    const venomSpec = registry.traits[unit.traitId]?.venomDemonPassive;
    if (venomSpec?.enabled) {
      if (!unit.venomDemonActive && unit.hp <= unit.maxHp * venomSpec.triggerHpRatio) {
        activateMagellanVenomDemon(unit, world, registry);
      }
      if (unit.venomDemonActive) {
        unit.venomAuraTickTimer += simDt;
        if (unit.venomAuraTickTimer >= venomSpec.tickIntervalSec) {
          unit.venomAuraTickTimer -= venomSpec.tickIntervalSec;
          for (const enemy of world.units) {
            if (!enemy.isAlive || !enemy.isOnField || enemy.team === unit.team) continue;
            if (distVec(unit.pos, enemy.pos) <= venomSpec.auraRadiusPx + enemy.radiusPx) {
              applyVenomStacksToUnit(enemy, 1, world, registry, venomSpec.maxStacks);
            }
          }
        }
      }
    }

    if (unit.venomStacks > 0) {
      unit.venomDecayTimer = Math.max(0, unit.venomDecayTimer - simDt);
      unit.venomTickTimer += simDt;
      if (unit.venomTickTimer >= 0.5) {
        unit.venomTickTimer -= 0.5;
        const resist = Math.min(0.85, unit.endgameHazardResistRatio);
        // Stacking damage strictly grows per stack: (14 + 7 * stacks) * 0.5s
        const rawHalfSecDmg = (14 + 7 * unit.venomStacks) * 0.5;
        const dmg = Math.max(1, Math.round(rawHalfSecDmg * (1 - resist)));
        unit.hp = Math.max(0, unit.hp - dmg);
        world.floatingTexts.push({
          id: `ft_vdot_${world.tick}_${unit.instanceId}`,
          pos: { x: unit.pos.x, y: unit.pos.y - 24 },
          text: `☠ -${dmg} (x${unit.venomStacks})`,
          color: '#a855f7',
          elapsedSec: 0,
          durationSec: 0.65,
          scale: 0.9
        });
      }
      if (unit.venomDecayTimer <= 0) {
        unit.venomStacks = Math.max(0, unit.venomStacks - 1);
        if (unit.venomStacks > 0) {
          unit.venomDecayTimer = 3.0;
        }
      }
    }
  }

  // Stage 3 Hook B: Impel Down Floor 1 Crimson Slash Trap (telegraphed periodic floor SLASH)
  if (world.impelDownHazard.active && world.impelDownHazard.kind === 'CRIMSON_SLASH_TRAP') {
    if (world.impelDownHazard.pendingTrapPos) {
      world.impelDownHazard.pendingTrapTelegraphTimer -= simDt;
      if (world.impelDownHazard.pendingTrapTelegraphTimer <= 0) {
        const trapPos = world.impelDownHazard.pendingTrapPos;
        world.impelDownHazard.pendingTrapPos = null;
        world.impelDownHazard.trapTimer = 4.2;
        world.vfxEvents.push({
          id: `vfx_crimson_trap_${world.tick}`,
          kind: 'CROSS_SLASH',
          pos: { ...trapPos },
          color: '#f43f5e',
          radiusPx: 68,
          elapsedSec: 0,
          durationSec: 0.35
        });
        for (const u of world.units) {
          if (!u.isAlive || !u.isOnField || u.team !== 'ALPHA' || u.iframeTimer > 0) continue;
          if (distVec(u.pos, trapPos) <= 68 + u.radiusPx) {
            const resist = Math.min(0.85, u.endgameHazardResistRatio);
            const dmg = Math.max(4, Math.round(32 * (1 - resist)));
            u.hp = Math.max(0, u.hp - dmg);
            world.floatingTexts.push({
              id: `ft_ctrap_${world.tick}_${u.instanceId}`,
              pos: { x: u.pos.x, y: u.pos.y - 26 },
              text: `⚔ 홍련 함정 -${dmg}`,
              color: '#f43f5e',
              elapsedSec: 0,
              durationSec: 0.75,
              scale: 1.0
            });
          }
        }
      }
    } else {
      world.impelDownHazard.trapTimer -= simDt;
      if (world.impelDownHazard.trapTimer <= 0) {
        const targetAlpha = world.units.find((u) => u.isAlive && u.isOnField && u.team === 'ALPHA');
        if (targetAlpha) {
          world.impelDownHazard.pendingTrapPos = {
            x: clamp(targetAlpha.pos.x + prng.nextRange(-28, 28), 60, world.arenaWidth - 60),
            y: clamp(targetAlpha.pos.y + prng.nextRange(-28, 28), 60, world.arenaHeight - 60)
          };
          world.impelDownHazard.pendingTrapTelegraphTimer = 1.1;
        }
      }
    }
  }

  // Stage 3 Hook C: Corrida Colosseum Circular Water Moat Ring-Out Rule
  if (world.colosseumRingOut.active) {
    const ro = world.colosseumRingOut;
    for (const u of world.units) {
      if (!u.isAlive || !u.isOnField) continue;
      const dFromCenter = distVec(u.pos, ro.center);
      if (dFromCenter > ro.safeRadiusPx) {
        u.inWaterTerrain = true;
        u.ringOutTimer += simDt;
        const dpsTick = u.maxHp * ro.outOfBoundsDpsRatio * simDt;
        u.hp = Math.max(0, u.hp - dpsTick);
        if (u.ringOutTimer >= ro.outOfBoundsLimitSec) {
          if (ro.instantRingOutKo) {
            u.hp = 0;
            ro.resolvedByRingOut = true;
            world.winReasonText = `🌊 링아웃 판정! ${u.name}이(가) 해자 외곽에서 2초 이상 체류하여 탈락!`;
            world.floatingTexts.push({
              id: `ft_ringout_${world.tick}_${u.instanceId}`,
              pos: { x: u.pos.x, y: u.pos.y - 36 },
              text: '🌊 RING OUT!!',
              color: '#38bdf8',
              elapsedSec: 0,
              durationSec: 1.4,
              scale: 1.35
            });
            world.combatLog.push(world.winReasonText);
          } else {
            const penalty = Math.max(10, Math.round(u.maxHp * 0.14));
            u.hp = Math.max(0, u.hp - penalty);
            u.ringOutTimer = 0;
          }
        }
      } else {
        u.ringOutTimer = Math.max(0, u.ringOutTimer - simDt * 1.5);
      }
    }
  }

  // Stage 2-C Hook 1: Step Shrinking Arena (Doflamingo Birdcage)
  if (world.birdcage.active) {
    const owner = world.units.find((u) => u.instanceId === world.birdcage.ownerUnitId);
    if (!owner || !owner.isAlive) {
      world.birdcage.active = false;
      world.birdcage.shrinkScale = 1.0;
      world.birdcage.ownerUnitId = null;
      world.floatingTexts.push({
        id: `ft_cage_break_${world.tick}`,
        pos: { x: world.arenaWidth * 0.5, y: 110 },
        text: '✨ 새장 붕괴! 아레나가 해방되었습니다!',
        color: '#4ade80',
        elapsedSec: 0,
        durationSec: 1.5,
        scale: 1.3
      });
      world.combatLog.push('[새장 붕괴] 시전자 격파로 새장이 즉시 해제되었습니다!');
    } else {
      world.birdcage.shrinkScale = Math.max(
        world.birdcage.minScaleRatio,
        world.birdcage.shrinkScale - world.birdcage.shrinkRatePerSec * simDt
      );
      const halfW = (world.arenaWidth * world.birdcage.shrinkScale) * 0.5;
      const halfH = (world.arenaHeight * world.birdcage.shrinkScale) * 0.5;
      const cx = world.arenaWidth * 0.5;
      const cy = world.arenaHeight * 0.5;
      const minX = cx - halfW;
      const maxX = cx + halfW;
      const minY = cy - halfH;
      const maxY = cy + halfH;

      world.birdcage.tickTimer += simDt;
      const applySlashTick = world.birdcage.tickTimer >= 0.5;
      if (applySlashTick) {
        world.birdcage.tickTimer -= 0.5;
      }

      for (const u of world.units) {
        if (!u.isAlive || !u.isOnField) continue;
        const touchingCage =
          u.pos.x - u.radiusPx <= minX ||
          u.pos.x + u.radiusPx >= maxX ||
          u.pos.y - u.radiusPx <= minY ||
          u.pos.y + u.radiusPx >= maxY;
        if (touchingCage) {
          u.pos.x = clamp(u.pos.x, minX + u.radiusPx, maxX - u.radiusPx);
          u.pos.y = clamp(u.pos.y, minY + u.radiusPx, maxY - u.radiusPx);
          if (u.team !== owner.team && u.iframeTimer <= 0 && applySlashTick) {
            const toCenter = normalizeVec(subVec({ x: cx, y: cy }, u.pos), { x: 1, y: 0 });
            const kbSpeed =
              world.birdcage.boundaryKnockbackSpeed * Math.max(0, 1 - u.knockbackResist);
            u.knockbackVel = scaleVec(toCenter, kbSpeed);
            const slashRes = computeDamage(
              world.birdcage.boundarySlashDamage,
              owner,
              u,
              'PHYSICAL',
              'SLASH',
              world,
              registry,
              { hasArmamentHaki: true, isBurstOrAoe: true }
            );
            if (!slashRes.nullified) {
              u.hp = Math.max(0, u.hp - slashRes.damage);
              world.floatingTexts.push({
                id: `ft_cagehit_${world.tick}_${u.instanceId}`,
                pos: { x: u.pos.x, y: u.pos.y - 26 },
                text: `🕸 새장 참격 -${slashRes.damage}`,
                color: '#f43f5e',
                elapsedSec: 0,
                durationSec: 0.75,
                scale: 1.0
              });
            }
          }
        }
      }
    }
  }

  for (const unit of world.units) {
    if (unit.isAlive && !unit.isDowned && unit.hp <= 0) {
      // Stage 2-B Hook 5: Marco Phoenix Revive Passive (1x per battle)
      if (tryTriggerRevivePassive(unit, world, registry)) {
        continue;
      }

      // Stage 3 Step 2: Raid Downed State (15s rescue timer instead of instant death)
      if (world.raidState.active && unit.team === 'ALPHA' && unit.isOnField) {
        unit.hp = 0;
        unit.isDowned = true;
        unit.downedTimer = RAID_DOWNED_DURATION_SEC;
        unit.reviveProgressSec = 0;
        unit.windupMoveId = null;
        unit.activeBeamId = null;
        unit.clashLockId = null;
        unit.vel = { x: 0, y: 0 };
        world.floatingTexts.push({
          id: `ft_downed_${world.tick}_${unit.instanceId}`,
          pos: { x: unit.pos.x, y: unit.pos.y - 30 },
          text: `🆘 DOWNED! (15초 내 동료 구조 필요)`,
          color: '#f43f5e',
          elapsedSec: 0,
          durationSec: 1.5,
          scale: 1.15
        });
        world.combatLog.push(
          `[레이드 다운] ${unit.name}이(가) 다운되었습니다! 동료가 2초간 구조하면 HP 40%로 부활합니다.`
        );
        continue;
      }

      unit.hp = 0;
      unit.isAlive = false;
      unit.windupMoveId = null;
      unit.activeBeamId = null;
      unit.clashLockId = null;
      if (world.birdcage.active && world.birdcage.ownerUnitId === unit.instanceId) {
        world.birdcage.active = false;
        world.birdcage.shrinkScale = 1.0;
        world.birdcage.ownerUnitId = null;
        world.combatLog.push('[새장 붕괴] 보스 격파로 새장이 즉시 해제되었습니다!');
      }
      world.combatLog.push(`[전투 불능] ${unit.name} 쓰러짐!`);

      if (unit.isOnField) {
        const replacement = world.units.find(
          (u) => u.team === unit.team && !u.isOnField && u.isAlive
        );
        if (replacement) {
          executeRosterSwap(unit, replacement.instanceId, world, registry, true);
        } else {
          unit.isOnField = false;
        }
      }
    }
  }

  // Stage 3 Step 2: Step Giant Boss Co-op Raid Rules (Groggy, DPS Check, Telegraphs, Down/Rescue)
  if (world.raidState.active) {
    stepRaidBattleRules(world, simDt, registry, prng);
  }

  const alphaAlive = world.units.some(
    (u) => u.team === 'ALPHA' && u.isAlive && !u.isMinion
  );
  const omegaAlive = world.units.some(
    (u) => u.team === 'OMEGA' && u.isAlive && !u.isMinion
  );

  // Stage 2-B Hook 5: Multi-Wave Gauntlet (Marineford 3-Wave transition)
  if (alphaAlive && !omegaAlive && world.currentWaveIndex + 1 < world.gauntletWaves.length) {
    if (spawnNextGauntletWave(world, registry)) {
      return;
    }
  }

  // Stage 2-A Special Win Conditions (SURVIVE_TIME & REACH_EXTRACTION)
  if (alphaAlive && world.winCondition.kind === 'SURVIVE_TIME') {
    if (world.elapsedSec >= world.winCondition.targetSec) {
      world.winnerTeam = 'ALPHA';
      world.winReasonText =
        world.winCondition.escapeCutsceneText ??
        `생존 목표 ${world.winCondition.targetSec}초 달성! 안전하게 탈출했습니다!`;
      world.combatLog.push(`[특수 미션 승리] ${world.winReasonText}`);
      return;
    }
  } else if (alphaAlive && world.winCondition.kind === 'REACH_EXTRACTION') {
    if (world.elapsedSec >= world.winCondition.unlockAfterSec) {
      world.extractionZoneActive = true;
      const ez = world.winCondition.extractionZone;
      const reached = world.units.some(
        (u) =>
          u.team === 'ALPHA' &&
          u.isAlive &&
          u.isOnField &&
          distVec(u.pos, ez) <= ez.radiusPx + u.radiusPx
      );
      if (reached) {
        world.winnerTeam = 'ALPHA';
        world.winReasonText =
          world.winCondition.escapeCutsceneText ??
          '탈출 구역 도달 성공! 항구로 무사히 출항했습니다!';
        world.combatLog.push(`[탈출 미션 승리] ${world.winReasonText}`);
        return;
      }
    }
  }

  if (!alphaAlive && !omegaAlive) {
    world.winnerTeam = 'DRAW';
    world.combatLog.push(`[전투 종료] 무승부 (DRAW)`);
  } else if (!omegaAlive) {
    world.winnerTeam = 'ALPHA';
    world.combatLog.push(`[전투 종료] ALPHA 팀 승리!`);
  } else if (!alphaAlive) {
    world.winnerTeam = 'OMEGA';
    world.combatLog.push(`[전투 종료] OMEGA 팀 승리!`);
  }
}
