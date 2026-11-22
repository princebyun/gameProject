import { clamp, type Vec2 } from '../math/vector2';
import type {
  MoveSlotRuntime,
  TeamId,
  UnitBuildConfig,
  UnitRuntimeState
} from '../types/battleState';
import type { GameDataRegistry } from '../types/dataSchemas';
import { computeEffectiveStats } from './damageCalc';

export function createUnitRuntime(
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
  if (!unitDef) {
    throw new Error(`Missing unit definition for speciesId=${build.speciesId}`);
  }
  const aiProfile = registry.aiProfiles[build.aiLevel] ?? null;
  const effStats = computeEffectiveStats(unitDef, build, registry, null, aiProfile);

  const fallbackMove = Object.values(registry.moves)[0];
  const moveIds =
    build.moveIds.length > 0 ? build.moveIds : unitDef.defaultMoves;
  const moveSlots: MoveSlotRuntime[] = moveIds.slice(0, 4).map((mId) => {
    const mDef = registry.moves[mId] ?? fallbackMove;
    if (!mDef) {
      throw new Error(`Missing move definition for moveId=${mId}`);
    }
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
    reviveProgressSec: 0
  };
}
