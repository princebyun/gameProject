import type {
  MusouActionTypeId,
  MusouSpecialSkillDefinition,
  MusouSpecialSlotKind
} from '../../../data/musouTypesRegistry';

export const MUSOU_CALC_VERSION = '0.7.0' as const;
export const MUSOU_TICK_HZ = 60;

export const STAMINA_MAX = 1000;
export const STAMINA_REGEN_PER_TICK = 3;
export const STAMINA_BURST_REGEN_MULT = 3;
export const BASE_POWER_DASH_COST = 250;
export const POWER_DASH_DURATION_TICKS = 12;
export const BASE_GRAVITY_MM_PER_TICK_SQ = 12;
export const JUMP_IMPULSE_MM_PER_TICK = 185;
export const HIT_COMBO_RESET_TICKS = 180;

export const BURST_GAUGE_MAX = 1000;
export const BURST_DURATION_TICKS = 600;
export const BURST_INVULN_TICKS = 27;
export const BURST_CINEMATIC_TICKS = 27;
export const BURST_ATK_PERMILLE = 1250;
export const BURST_SPEED_PERMILLE = 1150;
export const BURST_BOSS_ARMOR_INSTANT_CUT_PERMILLE = 200;
export const BURST_KO_EXTENSION_STEP = 10;
export const BURST_KO_EXTENSION_TICKS = 30;
export const BURST_MAX_EXTENSION_TICKS = 180;

export const BOSS_CRACKED_THRESHOLD_PERMILLE = 350;
export const BOSS_GROGGY_DURATION_TICKS = 300;
export const BOSS_GROGGY_DAMAGE_PERMILLE = 1600;
export const BOSS_GROGGY_RECOVERY_ARMOR_PERMILLE = 800;
export const BOSS_ARMOR_HITSTOP_TICKS = 6;

export type MusouActionType = MusouActionTypeId;
export type BossArmorState = 'INTACT' | 'CRACKED' | 'BROKEN_GROGGY';
export type MusouAttackPhase =
  | 'IDLE'
  | 'RUN'
  | 'COMBO_1'
  | 'COMBO_2'
  | 'COMBO_3'
  | 'COMBO_4'
  | 'CHARGE_ATTACK'
  | 'AIR_LAUNCH'
  | 'AIR_COMBO_1'
  | 'AIR_COMBO_2'
  | 'AIR_SLAM'
  | 'POWER_DASH'
  | 'SPECIAL_CAST'
  | 'BURST_CINEMATIC'
  | 'HITSTUN';

export interface MusouSpecialSlotRuntime {
  slotIndex: 0 | 1 | 2 | 3;
  skillId: string;
  label: string;
  kind: MusouSpecialSlotKind;
  cooldownTicks: number;
  maxCooldownTicks: number;
  chargeGauge: number;
  armorDamage: number;
  hpDamage: number;
  radiusMm: number;
  superArmorTicks: number;
  launchesAir: boolean;
  appliesMark: boolean;
  detonatesMark: boolean;
}

export interface MusouPlayerRuntime {
  unitId: string;
  speciesId: string;
  baseFormId: string | null;
  activeFormId: string | null;
  actionType: MusouActionType;
  actionTypeOverride: MusouActionType | null;
  xMm: number;
  yMm: number;
  zMm: number;
  vxMm: number;
  vyMm: number;
  vzMm: number;
  aimXPermille: number;
  aimZPermille: number;
  hp: number;
  maxHp: number;
  stamina: number;
  maxStamina: number;
  infiniteStamina: boolean;
  attackPhase: MusouAttackPhase;
  phaseTick: number;
  phaseDurationTicks: number;
  phaseHitTriggered: boolean;
  comboIndex: number;
  hitComboCount: number;
  hitComboDecayTicks: number;
  canPowerDashCancel: boolean;
  airDashCount: number;
  speedCancelCritTicks: number;
  superArmorTicks: number;
  invulnTicks: number;
  burstGauge: number;
  burstActive: boolean;
  burstTicksRemaining: number;
  burstTotalTicks: number;
  burstExtensionTicksUsed: number;
  burstKoAccumulator: number;
  burstCinematicTicks: number;
  specialSlots: [
    MusouSpecialSlotRuntime,
    MusouSpecialSlotRuntime,
    MusouSpecialSlotRuntime,
    MusouSpecialSlotRuntime
  ];
}

export interface MusouBossArmorRuntime {
  bossUnitId: string;
  bossName: string;
  speciesId: string;
  xMm: number;
  yMm: number;
  zMm: number;
  hp: number;
  maxHp: number;
  armorGauge: number;
  maxArmor: number;
  armorState: BossArmorState;
  groggyTicksRemaining: number;
  markedTicks: number;
  markedStacks: number;
  staggerTicks: number;
  airborneYMm: number;
}

export interface MusouInputCommand {
  moveXPermille?: number;
  moveZPermille?: number;
  lightAttackPressed?: boolean;
  chargeAttackPressed?: boolean;
  jumpPressed?: boolean;
  powerDashPressed?: boolean;
  burstPressed?: boolean;
  parryPressed?: boolean;
  specialSlotIndex?: 0 | 1 | 2 | 3 | null;
}

export type MusouDamagePopupStyle = 'NORMAL' | 'CRIT' | 'ARMOR_HIT' | 'GROGGY_CRIT';

export type MusouTickEvent =
  | {
      kind: 'POWER_DASH_CANCEL';
      actionType: MusouActionType;
      xMm: number;
      yMm: number;
      zMm: number;
      dirXPermille: number;
      dirZPermille: number;
      isAirborne: boolean;
      cancelledFromAttack: boolean;
      airDashIndex: number;
    }
  | {
      kind: 'SKY_AIR_HOP';
      xMm: number;
      yMm: number;
      zMm: number;
      airDashIndex: number;
    }
  | {
      kind: 'BURST_ACTIVATE';
      actionType: MusouActionType;
      xMm: number;
      yMm: number;
      zMm: number;
      shockwaveRadiusMm: number;
      awakenedFormId: string | null;
      superArmorGranted: boolean;
    }
  | {
      kind: 'BURST_END';
      restoredFormId: string | null;
    }
  | {
      kind: 'SPECIAL_CAST';
      slotIndex: 0 | 1 | 2 | 3;
      skillId: string;
      label: string;
      xMm: number;
      yMm: number;
      zMm: number;
      radiusMm: number;
    }
  | {
      kind: 'TECH_MARK_APPLIED';
      xMm: number;
      yMm: number;
      zMm: number;
      stacks: number;
    }
  | {
      kind: 'TECH_MARK_DETONATED';
      xMm: number;
      yMm: number;
      zMm: number;
      pullRadiusMm: number;
      consumedStacks: number;
    }
  | {
      kind: 'BOSS_ARMOR_HIT';
      bossUnitId: string;
      xMm: number;
      yMm: number;
      zMm: number;
      armorDamage: number;
      armorRemaining: number;
      maxArmor: number;
    }
  | {
      kind: 'BOSS_ARMOR_CRACKED';
      bossUnitId: string;
      xMm: number;
      yMm: number;
      zMm: number;
    }
  | {
      kind: 'BOSS_ARMOR_BREAK';
      bossUnitId: string;
      xMm: number;
      yMm: number;
      zMm: number;
      hitstopTicks: number;
      groggyDurationTicks: number;
    }
  | {
      kind: 'BOSS_GROGGY_RECOVERY';
      bossUnitId: string;
      xMm: number;
      yMm: number;
      zMm: number;
      restoredArmor: number;
    }
  | {
      kind: 'DAMAGE_POPUP';
      xMm: number;
      yMm: number;
      zMm: number;
      value: number;
      style: MusouDamagePopupStyle;
    }
  | {
      kind: 'ATTACK_SWING';
      phase: MusouAttackPhase;
      xMm: number;
      yMm: number;
      zMm: number;
      radiusMm: number;
      knockbackMm: number;
      isAirLaunch: boolean;
      isSpecial: boolean;
    };

export interface MusouCombatState {
  calcVersion: string;
  combatMode: 'musou_3d';
  tick: number;
  player: MusouPlayerRuntime;
  boss: MusouBossArmorRuntime;
  lastHitstopTicks: number;
}

export interface MusouCombatCreateConfig {
  unitId?: string;
  speciesId?: string;
  activeFormId?: string | null;
  actionTypeOverride?: MusouActionType | null;
  maxHp?: number;
  bossUnitId?: string;
  bossName?: string;
  bossSpeciesId?: string;
  bossMaxHp?: number;
  bossMaxArmor?: number;
}

export interface MusouHudSnapshot {
  actionType: MusouActionType;
  badgeText: string;
  themeColor: string;
  speciesId: string;
  playerName: string;
  hp: number;
  maxHp: number;
  stamina: number;
  maxStamina: number;
  canPowerDashCancel: boolean;
  airDashCount: number;
  maxAirDashes: number;
  isAirborne: boolean;
  infiniteStamina: boolean;
  burstGauge: number;
  burstGaugeMax: number;
  burstActive: boolean;
  burstRemainingSec: number;
  burstRatio: number;
  koCount: number;
  hitComboCount: number;
  specialSlots: readonly MusouSpecialSlotRuntime[];
  bossName: string;
  bossHp: number;
  bossMaxHp: number;
  bossArmor: number;
  bossMaxArmor: number;
  bossArmorState: BossArmorState;
  bossGroggyRemainingSec: number;
  bossMarkedStacks: number;
}

export function createSpecialSlotRuntime(
  def: MusouSpecialSkillDefinition,
  slotIndex: 0 | 1 | 2 | 3
): MusouSpecialSlotRuntime {
  return {
    slotIndex,
    skillId: def.skillId,
    label: def.label,
    kind: def.kind,
    cooldownTicks: 0,
    maxCooldownTicks: def.maxCooldownTicks,
    chargeGauge: 1000,
    armorDamage: def.armorDamage,
    hpDamage: def.hpDamage,
    radiusMm: def.radiusMm,
    superArmorTicks: def.superArmorTicks,
    launchesAir: def.launchesAir,
    appliesMark: def.appliesMark,
    detonatesMark: def.detonatesMark
  };
}
