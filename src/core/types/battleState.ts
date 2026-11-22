import type {
  ArenaDestructibleProp,
  ArenaTerrainConfig,
  ArenaWaterZone,
  BattleWinCondition
} from '../../data/schemas/battleSchemas';
import type { Vec2 } from '../math/vector2';
import type {
  ImpelDownHazardKind,
  RaidTelegraphPatternDef,
  RaidTelegraphShape
} from '../endgame/types';
import type {
  AiBehaviorId,
  ElementId,
  EnvironmentFieldKind,
  FieldKind,
  FormShiftKind,
  FruitType,
  HakiLevels,
  MeleeSubtype,
  ProjectilePattern,
  RuleReversalKind,
  StatBlock,
  StatusKind,
  UnitRace,
  WeatherId,
  ZoanStanceRole
} from './dataSchemas';

export type {
  ArenaDestructibleProp,
  ArenaTerrainConfig,
  ArenaWaterZone,
  BattleWinCondition
};

export interface GauntletWaveConfig {
  waveName: string;
  enemyBuilds: UnitBuildConfig[];
  introText?: string;
}

export type TeamId = 'ALPHA' | 'OMEGA';

export interface UnitEndgameBonuses {
  armorPenRatio?: number;
  hazardAndPoisonResistRatio?: number;
  cooldownReductionRatio?: number;
  dodgeRechargeBonus?: number;
  atkMult?: number;
  spdMult?: number;
  maxHpMult?: number;
  fireDamageBonusRatio?: number;
  breakGaugeDamageRatio?: number;
  startAwakeningGaugeRatio?: number;
}

export interface UnitBuildConfig {
  instanceId: string;
  speciesId: string;
  customName?: string;
  level: number;
  ivs: StatBlock;
  evs: StatBlock;
  moveIds: string[];
  equipmentId: string;
  traitId: string;
  formId: string;
  isPlayerControlled: boolean;
  aiLevel: number;
  // Stage 3 Endgame optional build overrides
  initialHpRatio?: number;
  initialMoveCharges?: Record<string, number>;
  hpMultiplier?: number;
  entityScaleOverride?: number;
  endgameBonuses?: UnitEndgameBonuses;
}

export interface MoveSlotRuntime {
  moveId: string;
  charges: number;
  maxCharges: number;
  chargeRechargeTimer: number;
  cooldownTimer: number;
}

export interface StatusInstance {
  kind: StatusKind;
  remainingSec: number;
  totalSec: number;
  sourceUnitId: string;
}

export interface StatBuffInstance {
  id: string;
  stat: keyof StatBlock;
  multiplier: number;
  remainingSec: number;
}

export interface PendingBurstShot {
  moveId: string;
  remainingCount: number;
  intervalTimer: number;
  intervalSec: number;
  aimDir: Vec2;
}

export interface UnitRuntimeState {
  instanceId: string;
  speciesId: string;
  name: string;
  team: TeamId;
  slotIndex: number; // 0 or 1 on field; >=2 on bench
  isOnField: boolean;
  isAlive: boolean;
  isPlayerControlled: boolean;
  aiLevel: number;

  pos: Vec2;
  prevPos: Vec2;
  vel: Vec2;
  knockbackVel: Vec2;
  aimDir: Vec2;
  radiusPx: number;
  baseRadiusPx: number;

  level: number;
  element: ElementId;
  fruitType: FruitType;
  haki: HakiLevels;
  traitId: string;
  equipmentId: string;
  configuredFormId: string;
  awakenedFormId: string | null;
  stanceFormIds: string[];
  stanceIndex: number; // -1 = BASE, 0..n-1 = stanceFormIds[stanceIndex]
  currentStanceRole: ZoanStanceRole;
  stanceCooldownTimer: number;

  maxHp: number;
  hp: number;
  baseComputedStats: StatBlock;
  effectiveStats: StatBlock;
  statBuffs: StatBuffInstance[];

  moveSlots: MoveSlotRuntime[];
  baseMoveSlots: MoveSlotRuntime[];
  pendingBurst: PendingBurstShot | null;

  // Cast / Windup / Action locking
  windupMoveId: string | null;
  windupTimer: number;
  windupAimDir: Vec2;
  actionLockTimer: number;
  activeBeamId: string | null;
  clashLockId: string | null;

  // Dodge & Just Dodge
  dodgeStacks: number;
  maxDodgeStacks: number;
  dodgeRechargeTimer: number;
  dodgeActiveTimer: number;
  iframeTimer: number;
  dodgeDir: Vec2;
  justDodgeBuffTimer: number;
  recentDodgeWhiffTimer: number;

  // Form Shift & Devil Fruit Awakening
  hasUsedFormShift: boolean;
  activeFormId: string | null;
  activeFormKind: FormShiftKind | null;
  hagoromoColor: 'white' | 'black' | null;
  regenHpRatioPerSec: number;
  regenAccumTimer: number;
  exhaustionTimer: number;
  ignoreTerrainCollision: boolean;
  logiaDispersionTimer: number;
  overdriveTimeRemainingSec: number;
  overdriveUsesRemaining: number;
  visualScale: number;
  auraColor: string | null;

  // Status effects & immunities
  statuses: StatusInstance[];
  staggerImmunityTimer: number;
  tauntTargetUnitId: string | null;

  // AI internal state & Phase 6 Boss Combat Hooks
  aiReactionTimer: number;
  aiRecoveryItemsLeft: number;
  aiBehaviorId: AiBehaviorId;
  entityScale: number;
  knockbackResist: number;
  isBossUnit: boolean;
  bountyLabel: string;
  lunarianFlameOn: boolean;
  lunarianReigniteTimer: number;
  superRegenIdleTimer: number;
  superRegenLockoutTimer: number;
  bossPhase2Triggered: boolean;

  // Stage 2-A East Blue Combat Hook fields
  race: UnitRace;
  baraSplitTimer: number;
  meleeReflectTimer: number;
  inWaterTerrain: boolean;

  // Stage 2-B Grand Line Combat Hook fields
  fruitNullifyTimer: number;
  isMinion: boolean;
  summonerUnitId: string | null;
  hasRevivedOnce: boolean;
  shadowsAsgardDamageTaken: number;
  cooldownAccelTimer: number;
  cooldownAccelRatio: number;
  onIceHazard: boolean;
  onMagmaHazard: boolean;
  magmaBurnTickTimer: number;

  // Stage 2-C New World Combat Hook fields
  foresightFocus: number;
  foresightBreakTimer: number;
  mochiMorphTimer: number;
  lastIncomingMoveIdByAttacker: Record<string, string>;
  steroidOverdriveActive: boolean;
  parasiteConfuseTimer: number;

  // Stage 3 Endgame Combat Hook fields (Magellan Venom Demon, Ring-Out, Buffs/Relics)
  venomStacks: number;
  venomDecayTimer: number;
  venomTickTimer: number;
  venomDemonActive: boolean;
  venomAuraTickTimer: number;
  ringOutTimer: number;
  endgameArmorPenRatio: number;
  endgameHazardResistRatio: number;
  endgameCooldownReductionRatio: number;
  endgameDodgeRechargeBonus: number;
  endgameFireDamageBonusRatio: number;
  endgameBreakGaugeBonusRatio: number;

  // Stage 3 Step 2 Raid Downed & Rescue Revive fields
  isDowned: boolean;
  downedTimer: number;
  reviveProgressSec: number;
}

export interface ActiveProjectile {
  id: string;
  moveId: string;
  ownerUnitId: string;
  team: TeamId;
  element: ElementId;
  pos: Vec2;
  prevPos: Vec2;
  vel: Vec2;
  radiusPx: number;
  currentPower: number;
  initialPower: number;
  offensiveStat: number;
  traitClashMult: number;
  hasArmamentHaki: boolean;
  hasConquerorCoating: boolean;
  isInternalDestruction: boolean;
  elapsedSec: number;
  maxDurationSec: number;
  pattern: ProjectilePattern;
  bypassGroundCollision: boolean;
  isInsideBeam: boolean;
  bouncedByRubberFloor?: boolean;
  homingTurnRateRadPerSec?: number;
  appliesVenomStacks?: number;
  destroyed: boolean;
}

export interface ActiveBeam {
  id: string;
  moveId: string;
  ownerUnitId: string;
  team: TeamId;
  element: ElementId;
  origin: Vec2;
  dir: Vec2;
  maxRangePx: number;
  currentLengthPx: number;
  widthPx: number;
  currentPower: number;
  initialPower: number;
  offensiveStat: number;
  traitClashMult: number;
  hasArmamentHaki: boolean;
  hasConquerorCoating: boolean;
  isInternalDestruction: boolean;
  elapsedSec: number;
  maxDurationSec: number;
  tickTimer: number;
  tickIntervalSec: number;
  clashingWithBeamId: string | null;
  guardedByMeleeId: string | null;
  dimmed: boolean;
  terminated: boolean;
}

export interface ActiveMeleeArc {
  id: string;
  moveId: string;
  ownerUnitId: string;
  team: TeamId;
  element: ElementId;
  subtype: MeleeSubtype;
  origin: Vec2;
  dir: Vec2;
  radiusPx: number;
  arcDeg: number;
  currentPower: number;
  initialPower: number;
  offensiveStat: number;
  traitClashMult: number;
  hasArmamentHaki: boolean;
  hasConquerorCoating: boolean;
  isInternalDestruction: boolean;
  elapsedSec: number;
  activeDamageDurationSec: number;
  totalLingerDurationSec: number;
  deflectProjectiles: boolean;
  canGuardBeam: boolean;
  hitUnitIds: string[];
  clashing: boolean;
  finished: boolean;
}

export interface ActiveFieldZone {
  id: string;
  moveId: string;
  ownerUnitId: string;
  team: TeamId;
  element: ElementId;
  fieldKind: FieldKind;
  environmentKind?: EnvironmentFieldKind;
  pos: Vec2;
  radiusPx: number;
  remainingSec: number;
  totalSec: number;
  tickTimer: number;
  basePower: number;
  offensiveStat: number;
  domeHp: number;
  maxDomeHp: number;
  maxRadiusPx?: number;
  expandRatePxPerSec?: number;
  isPoisonCloud?: boolean;
  slowRatio?: number;
}

export interface BeamClashSession {
  id: string;
  beamAId: string;
  beamBId: string;
  clashPoint: Vec2;
  clashRatio: number;
  elapsedSec: number;
  maxTieSec: number;
  resolved: boolean;
}

export interface MeleeBeamGuardSession {
  id: string;
  meleeArcId: string;
  meleeUnitId: string;
  beamId: string;
  beamUnitId: string;
  clashPoint: Vec2;
  elapsedSec: number;
  durationSec: number;
  grazeTickTimer: number;
  resolved: boolean;
}

export interface MeleeClashSession {
  id: string;
  meleeAId: string;
  unitAId: string;
  meleeBId: string;
  unitBId: string;
  clashPoint: Vec2;
  dominanceRatio: number;
  elapsedSec: number;
  maxDurationSec: number;
  isConquerorSkySplit: boolean;
  resolved: boolean;
}

export interface FloatingTextEvent {
  id: string;
  pos: Vec2;
  text: string;
  color: string;
  elapsedSec: number;
  durationSec: number;
  scale: number;
}

export interface CombatVfxEvent {
  id: string;
  kind:
    | 'HIT_SPARK'
    | 'CLASH_SHOCKWAVE'
    | 'JUST_DODGE_RING'
    | 'CROSS_SLASH'
    | 'FORM_BURST'
    | 'BEAM_BREAK'
    | 'CONQUEROR_LIGHTNING'
    | 'SKY_SPLIT_SHOCKWAVE'
    | 'LOGIA_DISPERSION';
  pos: Vec2;
  targetPos?: Vec2;
  color: string;
  radiusPx: number;
  elapsedSec: number;
  durationSec: number;
}

export interface TeamRosterRuntime {
  team: TeamId;
  voluntarySwapCooldownTimer: number;
  pivotWindowTimer: number;
  pivotTriggeredByUnitId: string | null;
}

export interface UnitInputCommand {
  unitId: string;
  moveVec: Vec2;
  aimVec: Vec2 | null;
  castMoveSlotIndex: number | null; // 0..3
  dodgePressed: boolean;
  formShiftPressed: boolean;        // Short F: Zoan stance cycle (or Awakening if unit has no Zoan stances)
  awakeningPressed?: boolean;       // Shift+F / Long F / Awaken button: Devil Fruit Awakening
  swapToBenchUnitId: string | null;
}

export interface ImpelDownFloorHazardConfig {
  floor: number;
  kind: ImpelDownHazardKind;
  dodgeRechargeMult?: number;
}

export interface ColosseumRingOutBattleConfig {
  enabled: boolean;
  safeRadiusRatio: number;
  outOfBoundsLimitSec: number;
  outOfBoundsDpsRatio: number;
  instantRingOutKo: boolean;
}

export interface ActiveTelegraphZone {
  id: string;
  patternId: string;
  name: string;
  shape: RaidTelegraphShape;
  origin: Vec2;
  dir: Vec2;
  radiusPx: number;
  arcDeg: number;
  widthPx: number;
  elapsedSec: number;
  durationSec: number;
  damageMultiplier: number;
  applyStatus?: 'STAGGER' | 'ROOT' | 'FREEZE';
  ownerUnitId: string;
}

export interface RaidDpsCheckRuntime {
  active: boolean;
  shieldHp: number;
  maxShieldHp: number;
  remainingSec: number;
  totalSec: number;
}

export interface RaidBattleConfig {
  raidId: string;
  bossName: string;
  breakGaugeMax: number;
  groggyDurationSec: number;
  groggyDamageMult: number;
  dpsCheckTriggerHpRatios: number[];
  dpsCheckShieldHp: number;
  dpsCheckDurationSec: number;
  teamRevivesMax: number;
  weatherOnStart?: WeatherId;
  telegraphPatterns: RaidTelegraphPatternDef[];
}

export interface RaidRuntimeState {
  active: boolean;
  raidId: string;
  bossName: string;
  bossUnitId: string | null;
  breakGauge: number;
  breakGaugeMax: number;
  groggyTimer: number;
  groggyDurationSec: number;
  groggyDamageMult: number;
  dpsCheck: RaidDpsCheckRuntime;
  dpsCheckTriggerHpRatios: number[];
  triggeredDpsIndices: number[];
  dpsCheckShieldHpConfig: number;
  dpsCheckDurationConfig: number;
  teamRevivesRemaining: number;
  teamRevivesMax: number;
  telegraphPatterns: RaidTelegraphPatternDef[];
  patternCooldowns: Record<string, number>;
  patternGlobalCooldown: number;
  telegraphs: ActiveTelegraphZone[];
}

export interface BattleWorldConfig {
  seed: number;
  arenaSizeKey: 'small' | 'medium' | 'large';
  mode: '1V1' | '2V2' | 'AI_VS_AI' | 'COOP_RAID';
  teamAlpha: UnitBuildConfig[];
  teamOmega: UnitBuildConfig[];
  winCondition?: BattleWinCondition;
  arenaTerrain?: ArenaTerrainConfig;
  gauntletWaves?: GauntletWaveConfig[];
  impelDownHazard?: ImpelDownFloorHazardConfig;
  colosseumRingOut?: ColosseumRingOutBattleConfig;
  raidConfig?: RaidBattleConfig;
}

export interface BattleWorldState {
  calcVersion: string;
  tick: number;
  elapsedSec: number;
  arenaWidth: number;
  arenaHeight: number;
  mode: '1V1' | '2V2' | 'AI_VS_AI' | 'COOP_RAID';

  units: UnitRuntimeState[];
  rosters: Record<TeamId, TeamRosterRuntime>;

  projectiles: ActiveProjectile[];
  beams: ActiveBeam[];
  meleeArcs: ActiveMeleeArc[];
  fieldZones: ActiveFieldZone[];

  beamClashes: BeamClashSession[];
  meleeBeamGuards: MeleeBeamGuardSession[];
  meleeClashes: MeleeClashSession[];

  weather: {
    id: WeatherId;
    remainingSec: number;
  };
  ruleReversal: {
    kind: RuleReversalKind;
    remainingSec: number;
  };
  environmentField: {
    kind: EnvironmentFieldKind | 'NONE';
    ownerUnitId: string | null;
    team: TeamId | null;
    remainingSec: number;
  };

  // Presentation state read by renderer
  hitstopTimer: number;
  slowMoTimer: number;
  slowMoScale: number;
  screenShakeTimer: number;
  screenShakeMagnitude: number;
  screenFlashTimer: number;
  screenFlashColor: string;

  // Phase 6 Boss Intro Banner (1.5s)
  bossIntroTimer: number;
  bossIntroName: string | null;
  bossIntroTitle: string | null;
  bossIntroBountyLabel: string | null;

  // Stage 2-A Special Win Condition, Arena Water Terrain & Tactical Hint
  winCondition: BattleWinCondition;
  winReasonText: string | null;
  extractionZoneActive: boolean;
  waterZones: ArenaWaterZone[];
  slashImmuneMissCount: number;
  tacticalHintText: string | null;
  tacticalHintTimer: number;

  // Stage 2-B Destructible Props, Persistent Magma/Ice Zones & Multi-Wave Gauntlet
  destructibleProps: ArenaDestructibleProp[];
  persistentZones: {
    magmaActive: boolean;
    magmaOwnerId: string | null;
    magmaTeam: TeamId | null;
    iceActive: boolean;
    iceOwnerId: string | null;
    iceTeam: TeamId | null;
    splitActive: boolean;
  };
  gauntletWaves: GauntletWaveConfig[];
  currentWaveIndex: number;
  waveBannerTimer: number;
  waveBannerText: string | null;

  // Stage 2-C Shrinking Arena (Doflamingo Birdcage)
  birdcage: {
    active: boolean;
    ownerUnitId: string | null;
    shrinkScale: number;
    minScaleRatio: number;
    shrinkRatePerSec: number;
    boundarySlashDamage: number;
    boundaryKnockbackSpeed: number;
    tickTimer: number;
  };

  // Stage 3 Endgame Arena Rules (Impel Down Floor Hazards & Colosseum Ring-Out)
  impelDownHazard: {
    active: boolean;
    floor: number;
    kind: ImpelDownHazardKind | null;
    trapTimer: number;
    pendingTrapPos: Vec2 | null;
    pendingTrapTelegraphTimer: number;
    dodgeRechargeMult: number;
  };
  colosseumRingOut: {
    active: boolean;
    center: Vec2;
    safeRadiusPx: number;
    outOfBoundsLimitSec: number;
    outOfBoundsDpsRatio: number;
    instantRingOutKo: boolean;
    resolvedByRingOut: boolean;
  };

  // Stage 3 Step 2: Giant Boss Co-op Raid State
  raidState: RaidRuntimeState;

  floatingTexts: FloatingTextEvent[];
  vfxEvents: CombatVfxEvent[];
  combatLog: string[];

  winnerTeam: TeamId | 'DRAW' | null;
}
