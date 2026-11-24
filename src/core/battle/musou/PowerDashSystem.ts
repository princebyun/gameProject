import type { MusouActionTypeDefinition } from '../../../data/musouTypesRegistry';
import {
  computeEffectiveAirGravity,
  computePowerDashStaminaCost,
  scalePermille
} from './ActionTypeProfile';
import {
  HIT_COMBO_RESET_TICKS,
  POWER_DASH_DURATION_TICKS,
  STAMINA_BURST_REGEN_MULT,
  STAMINA_MAX,
  STAMINA_REGEN_PER_TICK,
  type MusouCombatState,
  type MusouInputCommand,
  type MusouTickEvent
} from './MusouTypes';

const ATTACK_PHASES = new Set<string>([
  'COMBO_1',
  'COMBO_2',
  'COMBO_3',
  'COMBO_4',
  'CHARGE_ATTACK',
  'AIR_COMBO_1',
  'AIR_COMBO_2',
  'AIR_SLAM'
]);

const DASH_THRUST_MM_PER_TICK = 420;
const ARENA_HALF_X_MM = 17500;
const ARENA_HALF_Z_MM = 9200;

export function stepStaminaAndVerticalPhysics(
  state: MusouCombatState,
  profile: MusouActionTypeDefinition
): void {
  const player = state.player;
  if (player.infiniteStamina) {
    player.stamina = STAMINA_MAX;
  } else {
    const regenRate = player.burstActive
      ? STAMINA_REGEN_PER_TICK * STAMINA_BURST_REGEN_MULT
      : STAMINA_REGEN_PER_TICK;
    player.stamina = Math.min(STAMINA_MAX, player.stamina + regenRate);
  }

  if (player.speedCancelCritTicks > 0) {
    player.speedCancelCritTicks -= 1;
  }

  if (player.yMm > 0 || player.vyMm !== 0) {
    const gravity = computeEffectiveAirGravity(profile);
    player.yMm += player.vyMm;
    player.vyMm -= gravity;
    if (player.yMm <= 0) {
      player.yMm = 0;
      player.vyMm = 0;
      player.airDashCount = 0;
    }
  }

  player.xMm += player.vxMm;
  player.zMm += player.vzMm;
  player.vxMm = scalePermille(player.vxMm, 780);
  player.vzMm = scalePermille(player.vzMm, 780);

  if (player.xMm < -ARENA_HALF_X_MM) player.xMm = -ARENA_HALF_X_MM;
  if (player.xMm > ARENA_HALF_X_MM) player.xMm = ARENA_HALF_X_MM;
  if (player.zMm < -ARENA_HALF_Z_MM) player.zMm = -ARENA_HALF_Z_MM;
  if (player.zMm > ARENA_HALF_Z_MM) player.zMm = ARENA_HALF_Z_MM;
}

export function tryTriggerPowerDash(
  state: MusouCombatState,
  input: MusouInputCommand,
  profile: MusouActionTypeDefinition,
  events: MusouTickEvent[]
): boolean {
  if (!input.powerDashPressed) return false;
  const player = state.player;

  const isAirborne = player.yMm > 100;
  const isAttackCancel =
    ATTACK_PHASES.has(player.attackPhase) && player.canPowerDashCancel;
  const isChainedSkyAirDash =
    isAirborne &&
    player.attackPhase === 'POWER_DASH' &&
    player.phaseTick >= 3 &&
    player.airDashCount < profile.maxAirDashes;
  const canNormalDash =
    player.attackPhase === 'IDLE' ||
    player.attackPhase === 'RUN' ||
    player.attackPhase === 'AIR_LAUNCH';
  if (!isAttackCancel && !isChainedSkyAirDash && !canNormalDash) {
    return false;
  }

  if (isAirborne && player.airDashCount >= profile.maxAirDashes) {
    return false;
  }

  const staminaCost = player.infiniteStamina ? 0 : computePowerDashStaminaCost(profile);
  if (player.stamina < staminaCost) {
    return false;
  }

  player.stamina = Math.max(0, player.stamina - staminaCost);

  // Determine normalized dash vector from move stick or boss target
  let dirX = input.moveXPermille ?? 0;
  let dirZ = input.moveZPermille ?? 0;
  if (dirX === 0 && dirZ === 0) {
    const toBossX = state.boss.xMm - player.xMm;
    const toBossZ = state.boss.zMm - player.zMm;
    const dist = Math.hypot(toBossX, toBossZ);
    if (dist > 400) {
      dirX = Math.round((toBossX / dist) * 1000);
      dirZ = Math.round((toBossZ / dist) * 1000);
    } else {
      dirX = player.aimXPermille;
      dirZ = player.aimZPermille;
    }
  } else {
    const mag = Math.hypot(dirX, dirZ) || 1;
    dirX = Math.round((dirX / mag) * 1000);
    dirZ = Math.round((dirZ / mag) * 1000);
  }

  player.aimXPermille = dirX;
  player.aimZPermille = dirZ;
  player.vxMm = scalePermille(DASH_THRUST_MM_PER_TICK, dirX);
  player.vzMm = scalePermille(DASH_THRUST_MM_PER_TICK, dirZ);

  // Immediately clear attack recovery to 0 ticks and sustain combo & air height
  player.attackPhase = 'POWER_DASH';
  player.phaseTick = 0;
  player.phaseDurationTicks = POWER_DASH_DURATION_TICKS;
  player.phaseHitTriggered = false;
  player.canPowerDashCancel = false;
  player.invulnTicks = Math.max(player.invulnTicks, 6);

  if (player.hitComboCount > 0) {
    player.hitComboDecayTicks = Math.max(player.hitComboDecayTicks, HIT_COMBO_RESET_TICKS);
  }

  if (isAirborne) {
    player.airDashCount += 1;
    player.vyMm = Math.max(player.vyMm, 65);
    events.push({
      kind: 'SKY_AIR_HOP',
      xMm: player.xMm,
      yMm: player.yMm,
      zMm: player.zMm,
      airDashIndex: player.airDashCount
    });
  }

  if (isAttackCancel && profile.postCancelCritDurationTicks > 0) {
    player.speedCancelCritTicks = profile.postCancelCritDurationTicks;
  }

  events.push({
    kind: 'POWER_DASH_CANCEL',
    actionType: profile.actionType,
    xMm: player.xMm,
    yMm: player.yMm,
    zMm: player.zMm,
    dirXPermille: dirX,
    dirZPermille: dirZ,
    isAirborne,
    cancelledFromAttack: isAttackCancel,
    airDashIndex: player.airDashCount
  });

  return true;
}
