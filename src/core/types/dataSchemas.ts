export type ElementId = string;
export type MoveArchetype = 'PROJECTILE' | 'BEAM' | 'MELEE' | 'AOE_FIELD' | 'STATUS';
export type MoveCategory = 'PHYSICAL' | 'SPECIAL' | 'STATUS';
export type MeleeSubtype = 'SLASH' | 'THRUST' | 'STRIKE' | 'DASH';
export type ProjectilePattern = 'SINGLE' | 'BURST' | 'PARABOLIC';
export type FieldKind = 'HAZARD_ZONE' | 'DOME_SHIELD' | 'GLOBAL_WEATHER' | 'RULE_REVERSAL';
export type WeatherId = 'NONE' | 'SOLAR_FLARE' | 'TEMPEST_RAIN' | 'ION_STORM';
export type RuleReversalKind = 'NONE' | 'SPEED_INVERSION';
export type StatusKind = 'STAGGER' | 'SKILL_SEAL' | 'TAUNT' | 'ROOT' | 'WET' | 'FREEZE';
export type FormShiftKind = 'AWAKENING' | 'OVERDRIVE';

export type FruitType =
  | 'NONE'
  | 'PARAMECIA'
  | 'ZOAN'
  | 'ANCIENT_ZOAN'
  | 'MYTHICAL_ZOAN'
  | 'LOGIA';

export type HakiTier = 0 | 1 | 2 | 3;

export interface HakiLevels {
  armament: HakiTier;
  observation: HakiTier;
  conqueror: HakiTier;
}

export type OnePieceFormCategory =
  | 'ZOAN_STANCE'
  | 'AWAKENED_ZOAN'
  | 'ENVIRONMENT_AWAKENING';

export type ZoanStanceRole = 'BASE' | 'HYBRID' | 'BEAST';

export type EnvironmentFieldKind =
  | 'RUBBER_BOUNCE_ZONE'
  | 'K_ROOM_FIELD'
  | 'LIGHT_SPEED_REALM'
  | 'MAGMA_HAZARD_ZONE'
  | 'ICE_AGE_ZONE'
  | 'STRING_AWAKENING_FIELD'
  | 'MOCHI_DONUT_WORLD';

export type AiBehaviorId =
  | 'balanced'
  | 'melee_rusher'
  | 'door_ambusher'
  | 'blade_storm'
  | 'lunarian_switcher'
  | 'regen_zoner'
  | 'giant_crusher'
  | 'trickster_mid'
  | 'heavy_zoner'
  | 'pressure_pursuer'
  | 'sand_zoner'
  | 'lightning_kiter'
  | 'minion_controller'
  | 'relentless_boss'
  | 'control_zoner'
  | 'anti_fruit_bruiser'
  | 'berserk_rusher'
  | 'string_controller'
  | 'foresight_duelist'
  | 'venom_warden';

export type UnitRace =
  | 'HUMAN'
  | 'FISHMAN'
  | 'CYBORG'
  | 'GIANT'
  | 'LUNARIAN'
  | 'REINDEER'
  | 'SKELETON';

export interface StatBlock {
  hp: number;
  atk: number;
  def: number;
  spAtk: number;
  spDef: number;
  spd: number;
}

export interface BalanceConfig {
  fixedDt: number;
  arenaDefaults: {
    small: { width: number; height: number };
    medium: { width: number; height: number };
    large: { width: number; height: number };
  };
  unitPhysics: {
    defaultRadiusPx: number;
    baseMoveSpeedPx: number;
    speedStatScale: number;
    knockbackFriction: number;
    levelBaseStatScale: number;
    ivStatScale: number;
    evStatScale: number;
    damageBaseConstant: number;
    minDamage: number;
  };
  dodge: {
    maxStacks: number;
    rechargeSec: number;
    durationSec: number;
    iframeSec: number;
    speedMultiplier: number;
    justDodgeWindowSec: number;
    justDodgeProximityPx: number;
    justDodgeSlowMoSec: number;
    justDodgeSlowMoScale: number;
    justDodgeAttackBuffRatio: number;
    justDodgeBuffDurationSec: number;
  };
  roster: {
    maxPartySize: number;
    voluntarySwapCooldownSec: number;
    pivotSelectWindowSec: number;
  };
  projectile: {
    mutualCancelRatioThreshold: number;
    parabolicApexPassRatioStart: number;
    parabolicApexPassRatioEnd: number;
  };
  beam: {
    minRangePx: number;
    maxRangePx: number;
    statRangeMin: number;
    statRangeMax: number;
    clashAngleBreakDeg: number;
    clashTieTimeoutSec: number;
    clashPushRatePerRatio: number;
    projectileSlowMultiplier: number;
    projectileDecayPerSec: number;
    projectilePierceRatioThreshold: number;
  };
  melee: {
    deflectLingerSec: number;
    deflectDurabilityLossRatio: number;
    overpowerKnockbackSpeed: number;
    overpowerResidualDamageRatio: number;
    beamGuardMinSec: number;
    beamGuardMaxSec: number;
    beamGuardDurationDefaultSec: number;
    beamGuardGrazeDamageRatio: number;
    beamLossWeakenMultiplier: number;
    beamWinDashSpeed: number;
    meleeClashMaxSec: number;
    meleeClashPushRate: number;
    crossSlashDashDistancePx: number;
  };
  field: {
    weatherBoostMultiplier: number;
    weatherWeakenMultiplier: number;
    weatherCastSpeedMultiplier: number;
    hazardTickIntervalSec: number;
    speedReversalReferenceSpd: number;
  };
  status: {
    staggerDurationSec: number;
    staggerImmunitySec: number;
    minControlDurationSec: number;
    maxControlDurationSec: number;
  };
  formShift: {
    awakeningHealRatio: number;
    overdriveDefaultDurationSec: number;
    overdriveDefaultMaxUses: number;
  };
  presentation: {
    defaultHitstopSec: number;
    clashHitstopSec: number;
    floatingTextDurationSec: number;
    defaultShakeIntensity: number;
    defaultFlashEnabled: boolean;
  };
}

export interface ElementMetadata {
  id: ElementId;
  name: string;
  color: string;
}

export interface ElementsConfig {
  elements: ElementMetadata[];
  matrix: Record<ElementId, Record<ElementId, number>>;
}

export type TraitHookEvent =
  | 'onEnterField'
  | 'onCast'
  | 'onHit'
  | 'onBeingHit'
  | 'onClash'
  | 'onWeatherChange'
  | 'onJustDodge';

export interface TraitHookRule {
  event: TraitHookEvent;
  condition?: {
    weather?: WeatherId;
    moveArchetype?: MoveArchetype;
    hpBelowRatio?: number;
  };
  effect: {
    type:
    | 'STAT_MOD'
    | 'HEAL_RATIO'
    | 'CLASH_POWER_MULT'
    | 'CAST_SPEED_MULT'
    | 'SPAWN_WEATHER'
    | 'RESTORE_DODGE';
    stat?: keyof StatBlock;
    value: number;
    durationSec?: number;
    weatherId?: WeatherId;
  };
}

export interface TraitDefinition {
  id: string;
  name: string;
  description: string;
  logiaIntangibility?: {
    enabled: boolean;
    naturalWeaknessElements: ElementId[];
  };
  lunarianFlame?: {
    enabled: boolean;
    flameOnDamageMultiplier: number;
    flameOnStaggerImmune: boolean;
    flameOffMoveSpeedMultiplier: number;
    flameOffWindupMultiplier: number;
    reigniteDelaySec: number;
  };
  superRegeneration?: {
    enabled: boolean;
    delayAfterHitSec: number;
    regenMaxHpRatioPerSec: number;
    conquerorLockoutDurationSec: number;
  };
  slashImmunity?: boolean;
  nonHakiProjectileMultiplier?: number;
  fishmanWaterBuff?: {
    enabled: boolean;
    atkMult: number;
    spdMult: number;
    seaDamageMult: number;
  };
  dodgeRechargeMultiplier?: number;
  projectileRangeMultiplier?: number;
  weatherDurationMultiplier?: number;
  lightningDamageMultiplier?: number;
  elementImmunities?: ElementId[];
  nonHakiDamageMultipliers?: Record<ElementId, number>;
  immuneToSeaPenalty?: boolean;
  // Stage 2-B Grand Line Combat Hooks
  traitTags?: string[];
  naturalCounterTags?: string[];
  weakToWetStatus?: boolean;
  incomingDamageMultiplier?: number;
  ignoreWaterTerrainPenalty?: boolean;
  revivePassive?: {
    enabled: boolean;
    reviveHpRatio: number;
    allyHealRatio: number;
    allyHealRadiusPx: number;
  };
  frostCounterOnHit?: boolean;
  // Stage 2-C New World Combat Hooks
  shrinkingArena?: {
    enabled: boolean;
    triggerHpRatio: number;
    shrinkRatePerSec: number;
    minScaleRatio: number;
    boundarySlashDamage: number;
    boundaryKnockbackSpeed: number;
  };
  futureSightCounter?: {
    enabled: boolean;
    maxFocus: number;
    evadeMinFocus: number;
    focusBreakDurationSec: number;
    focusBreakDamageMult: number;
    focusRegenPerSec: number;
  };
  energySteroidOverdrive?: {
    enabled: boolean;
    triggerHpRatio: number;
    atkMult: number;
    spdMult: number;
    cooldownAccelRatio: number;
    incomingDamageMult: number;
  };
  mochiSlowOnHit?: {
    slowMult: number;
    durationSec: number;
  };
  // Stage 3 Endgame Boss Hook: Magellan Venom Demon Aura & Stacking Poison
  venomDemonPassive?: {
    enabled: boolean;
    triggerHpRatio: number;
    auraRadiusPx: number;
    tickIntervalSec: number;
    maxStacks: number;
    baseDps: number;
    dpsPerStack: number;
  };
  hooks: TraitHookRule[];
}

export interface MoveDefinition {
  id: string;
  name: string;
  element: ElementId;
  archetype: MoveArchetype;
  category: MoveCategory;
  basePower: number;
  maxCharges: number;
  chargeRecoverySec: number;
  cooldownSec: number;
  windupSec: number;
  activeDurationSec: number;
  rangePx: number;
  radiusPx: number;
  pivotSwapOnHit?: boolean;
  hasArmamentHaki?: boolean;
  hasConquerorCoating?: boolean;
  isInternalDestruction?: boolean;
  conquerorIntimidate?: boolean;
  isRoomPlacement?: boolean;
  requiresActiveRoom?: boolean;
  extinguishesLunarianFlame?: boolean;
  teleportBehindTarget?: boolean;
  meleeReflectSec?: number;
  skillCooldownDelaySec?: number;
  // Stage 2-B Grand Line Move Hook extensions
  nullifyFruitSec?: number;
  pullTargetTowardCasterPx?: number;
  summonMinionSpeciesId?: string;
  swapWithMinionIfAlive?: boolean;
  healPartyHpRatio?: number;
  allyCooldownAccel?: {
    ratio: number;
    durationSec: number;
  };
  remoteTargetStrike?: boolean;
  shatterProjectilesAndBeams?: boolean;
  applyFreezeSec?: number;
  applyWetSec?: number;
  // Stage 2-C New World Move Hook extensions
  activatesBirdcage?: boolean;
  confuseSec?: number;
  // Stage 3 Endgame Move Hook extensions
  triggersVenomDemon?: boolean;
  appliesVenomStacks?: number;
  selfBuff?: {
    stat: keyof StatBlock;
    multiplier: number;
    durationSec: number;
  };
  description: string;
  projectileSpec?: {
    pattern: ProjectilePattern;
    burstCount: number;
    burstIntervalSec: number;
    speedPxPerSec: number;
    bypassGroundCollision?: boolean;
    homingTurnRateRadPerSec?: number;
  };
  beamSpec?: {
    dynamicRangeByStat: boolean;
    widthPx: number;
    tickIntervalSec: number;
  };
  meleeSpec?: {
    subtype: MeleeSubtype;
    arcDeg: number;
    dashSpeedPxPerSec?: number;
    deflectProjectiles: boolean;
    canGuardBeam: boolean;
  };
  aoeFieldSpec?: {
    fieldKind: FieldKind;
    weatherId?: WeatherId;
    ruleReversalKind?: RuleReversalKind;
    durationSec: number;
    domeHp?: number;
    expandingPoisonCloud?: {
      maxRadiusPx: number;
      expandRatePxPerSec: number;
    };
    slowRatio?: number;
  };
  statusSpec?: {
    statusKind: StatusKind;
    durationSec: number;
  };
}

export interface FormDefinition {
  id: string;
  name: string;
  kind: FormShiftKind;
  formCategory?: OnePieceFormCategory;
  stanceRole?: ZoanStanceRole;
  hagoromoColor?: 'white' | 'black' | null;
  requiredEquipmentId?: string;
  healRatioOnActivate?: number;
  regenHpRatioPerSec?: number;
  newElement?: ElementId;
  newTraitId?: string;
  durationSec?: number;
  maxSkillUses?: number;
  exhaustionDebuffSec?: number;
  environmentFieldKind?: EnvironmentFieldKind;
  ignoreTerrainCollision?: boolean;
  hitboxRadiusScale?: number;
  moveSpeedScale?: number;
  incomingDamageMultiplier?: number;
  damageThresholdRevertRatio?: number;
  statMultipliers: Partial<StatBlock>;
  overrideMoveIds?: string[];
  visualScale: number;
  auraColor: string;
}

export interface EquipmentDefinition {
  id: string;
  name: string;
  description: string;
  enablesAwakening?: boolean;
  enablesOverdrive?: boolean;
  statModifiers: Partial<StatBlock>;
}

export type AvatarId =
  | 'LUFFY'
  | 'ZORO'
  | 'LUCCI'
  | 'KAIDO'
  | 'KIZARU'
  | 'LAW'
  | 'MORGAN'
  | 'BLUENO'
  | 'KAKU'
  | 'FRANKY'
  | 'KING'
  | 'S_HAWK'
  | 'SATURN'
  | 'LOKI'
  | 'BUGGY'
  | 'DON_KRIEG'
  | 'ARLONG'
  | 'SMOKER'
  | 'SANJI'
  | 'USOPP'
  | 'NAMI'
  | 'WAPOL'
  | 'CROCODILE'
  | 'ENEL'
  | 'MORIA'
  | 'DOPPELMAN'
  | 'AKAINU'
  | 'AOKIJI'
  | 'BLACKBEARD'
  | 'CHOPPER'
  | 'ROBIN'
  | 'BROOK'
  | 'MARCO'
  | 'HODY_JONES'
  | 'DOFLAMINGO'
  | 'KATAKURI'
  | 'JINBE'
  | 'MAGELLAN';

export interface UnitDefinition {
  id: string;
  name: string;
  title: string;
  element: ElementId;
  fruitType?: FruitType;
  race?: UnitRace;
  haki?: HakiLevels;
  traitId: string;
  defaultFormId: string;
  awakenedFormId?: string;
  forms?: string[];
  defaultEquipmentId: string;
  entityScale?: number;
  knockbackResist?: number;
  aiBehaviorId?: AiBehaviorId;
  isBossUnit?: boolean;
  bountyLabel?: string;
  baseStats: StatBlock;
  defaultMoves: string[];
  palette: {
    primary: string;
    secondary: string;
    accent: string;
    shape:
    | 'HEX_KNIGHT'
    | 'CRESCENT_MAGE'
    | 'BLADE_RUNNER'
    | 'GOLEM_TITAN'
    | 'WING_DUELIST'
    | 'VOID_PRISM';
    avatarId?: AvatarId;
  };
}

export interface AiProfileDefinition {
  level: number;
  name: string;
  statMultiplier: number;
  reactionDelaySec: number;
  allowRecoveryItems: boolean;
  recoveryItemCount: number;
  cooldownTrackingAccuracy: number;
  punishDodgeWhiffWeight: number;
  meleeBeamGuardWeight: number;
  justDodgeChance: number;
  formShiftAggression: number;
}

export interface GameDataRegistry {
  balance: BalanceConfig;
  elements: ElementsConfig;
  traits: Record<string, TraitDefinition>;
  moves: Record<string, MoveDefinition>;
  forms: Record<string, FormDefinition>;
  equipment: Record<string, EquipmentDefinition>;
  units: Record<string, UnitDefinition>;
  aiProfiles: Record<number, AiProfileDefinition>;
}
