import {
  getBurstAwakeningFormId,
  resolveMusouActionTypeForUnit,
  type MusouActionTypeDefinition
} from '../../../data/musouTypesRegistry';
import type { SeededPRNG } from '../../math/prng';
import {
  computeBurstAoeRadiusMm,
  resolveEffectiveActionType
} from './ActionTypeProfile';
import {
  applyBossArmorAndHpHit,
  applyDirectArmorCutRatio
} from './BossArmorBreakSystem';
import {
  BURST_BOSS_ARMOR_INSTANT_CUT_PERMILLE,
  BURST_CINEMATIC_TICKS,
  BURST_DURATION_TICKS,
  BURST_GAUGE_MAX,
  BURST_INVULN_TICKS,
  BURST_KO_EXTENSION_STEP,
  BURST_KO_EXTENSION_TICKS,
  BURST_MAX_EXTENSION_TICKS,
  type MusouCombatState,
  type MusouTickEvent
} from './MusouTypes';

export function addBurstGauge(state: MusouCombatState, delta: number): void {
  const player = state.player;
  if (player.burstActive || delta <= 0) return;
  player.burstGauge = Math.min(BURST_GAUGE_MAX, player.burstGauge + Math.round(delta));
}

export function applyHordeKoToBurst(state: MusouCombatState, koDelta: number): void {
  if (koDelta <= 0) return;
  const player = state.player;
  if (!player.burstActive) {
    addBurstGauge(state, koDelta * 18);
    return;
  }

  player.burstKoAccumulator += koDelta;
  while (
    player.burstKoAccumulator >= BURST_KO_EXTENSION_STEP &&
    player.burstExtensionTicksUsed < BURST_MAX_EXTENSION_TICKS
  ) {
    player.burstKoAccumulator -= BURST_KO_EXTENSION_STEP;
    const grant = Math.min(
      BURST_KO_EXTENSION_TICKS,
      BURST_MAX_EXTENSION_TICKS - player.burstExtensionTicksUsed
    );
    player.burstExtensionTicksUsed += grant;
    player.burstTicksRemaining += grant;
  }
}

export function tryActivateFullForceBurst(
  state: MusouCombatState,
  profile: MusouActionTypeDefinition,
  _prng: SeededPRNG,
  events: MusouTickEvent[]
): boolean {
  const player = state.player;
  if (player.burstActive || player.burstGauge < BURST_GAUGE_MAX) {
    return false;
  }

  player.burstGauge = 0;
  player.burstActive = true;
  player.burstTicksRemaining = BURST_DURATION_TICKS;
  player.burstTotalTicks = BURST_DURATION_TICKS;
  player.burstExtensionTicksUsed = 0;
  player.burstKoAccumulator = 0;
  player.burstCinematicTicks = BURST_CINEMATIC_TICKS;
  player.invulnTicks = Math.max(player.invulnTicks, BURST_INVULN_TICKS);
  player.superArmorTicks = profile.burstSuperArmor
    ? Math.max(player.superArmorTicks, BURST_DURATION_TICKS)
    : Math.max(player.superArmorTicks, BURST_INVULN_TICKS);

  player.attackPhase = 'BURST_CINEMATIC';
  player.phaseTick = 0;
  player.phaseDurationTicks = BURST_CINEMATIC_TICKS;
  player.canPowerDashCancel = true;

  const awakenedFormId = getBurstAwakeningFormId(player.speciesId);
  if (awakenedFormId) {
    player.activeFormId = awakenedFormId;
    if (!player.actionTypeOverride) {
      player.actionType = resolveMusouActionTypeForUnit(player.speciesId, awakenedFormId);
    }
  }

  const shockwaveRadiusMm = computeBurstAoeRadiusMm(12000, profile, true);
  applyDirectArmorCutRatio(state, BURST_BOSS_ARMOR_INSTANT_CUT_PERMILLE, 260, events);

  events.push({
    kind: 'BURST_ACTIVATE',
    actionType: profile.actionType,
    xMm: player.xMm,
    yMm: player.yMm,
    zMm: player.zMm,
    shockwaveRadiusMm,
    awakenedFormId,
    superArmorGranted: profile.burstSuperArmor
  });
  return true;
}

export function stepBurstState(
  state: MusouCombatState,
  events: MusouTickEvent[]
): void {
  const player = state.player;
  if (player.invulnTicks > 0) player.invulnTicks -= 1;
  if (player.superArmorTicks > 0) player.superArmorTicks -= 1;

  if (!player.burstActive) return;

  if (player.burstCinematicTicks > 0) {
    player.burstCinematicTicks -= 1;
  }
  if (player.burstTicksRemaining > 0) {
    player.burstTicksRemaining -= 1;
  }

  if (player.burstTicksRemaining <= 0) {
    player.burstActive = false;
    player.burstCinematicTicks = 0;
    player.activeFormId = player.baseFormId;
    player.actionType = resolveEffectiveActionType(player);
    events.push({
      kind: 'BURST_END',
      restoredFormId: player.baseFormId
    });
  }
}

export function stepSpecialCooldowns(state: MusouCombatState): void {
  const cooldownStep = state.player.burstActive ? 2 : 1;
  for (const slot of state.player.specialSlots) {
    if (slot.cooldownTicks > 0) {
      slot.cooldownTicks = Math.max(0, slot.cooldownTicks - cooldownStep);
      slot.chargeGauge = Math.round(
        ((slot.maxCooldownTicks - slot.cooldownTicks) / Math.max(1, slot.maxCooldownTicks)) * 1000
      );
    } else {
      slot.chargeGauge = 1000;
    }
  }
}

export function tryCastSpecialSlot(
  state: MusouCombatState,
  slotIndex: 0 | 1 | 2 | 3,
  profile: MusouActionTypeDefinition,
  prng: SeededPRNG,
  events: MusouTickEvent[]
): boolean {
  const player = state.player;
  const slot = player.specialSlots[slotIndex];
  if (!slot || slot.cooldownTicks > 0) {
    return false;
  }

  slot.cooldownTicks = slot.maxCooldownTicks;
  slot.chargeGauge = 0;

  player.attackPhase = 'SPECIAL_CAST';
  player.phaseTick = 0;
  player.phaseDurationTicks = 24;
  player.phaseHitTriggered = true;
  player.canPowerDashCancel = true;
  player.superArmorTicks = Math.max(player.superArmorTicks, slot.superArmorTicks);

  // Dash-type specials propel player toward boss
  if (slot.kind === 'DASH') {
    const dx = state.boss.xMm - player.xMm;
    const dz = state.boss.zMm - player.zMm;
    const dist = Math.hypot(dx, dz) || 1;
    player.vxMm = Math.round((dx / dist) * 280);
    player.vzMm = Math.round((dz / dist) * 280);
  }

  const effectiveRadiusMm = computeBurstAoeRadiusMm(
    slot.radiusMm,
    profile,
    player.burstActive
  );

  // Hit boss if within effective radius + lunge reach
  const distToBoss = Math.hypot(state.boss.xMm - player.xMm, state.boss.zMm - player.zMm);
  if (distToBoss <= effectiveRadiusMm + 2800) {
    applyBossArmorAndHpHit(
      state,
      {
        baseArmorDamage: slot.armorDamage,
        baseHpDamage: slot.hpDamage,
        isHeavy: true,
        isCharge: false,
        isSpecial: true,
        isParryCounter: false,
        launchesAir: slot.launchesAir,
        appliesMark: slot.appliesMark,
        detonatesMark: slot.detonatesMark
      },
      profile,
      prng,
      events
    );
    addBurstGauge(state, 95);
    player.hitComboCount += 1;
    player.hitComboDecayTicks = 180;
  }

  events.push({
    kind: 'SPECIAL_CAST',
    slotIndex,
    skillId: slot.skillId,
    label: slot.label,
    xMm: player.xMm,
    yMm: player.yMm,
    zMm: player.zMm,
    radiusMm: effectiveRadiusMm
  });

  events.push({
    kind: 'ATTACK_SWING',
    phase: 'SPECIAL_CAST',
    xMm: player.xMm,
    yMm: player.yMm,
    zMm: player.zMm,
    radiusMm: effectiveRadiusMm,
    knockbackMm: slot.kind === 'ULTIMATE' ? 4200 : 2800,
    isAirLaunch: slot.launchesAir,
    isSpecial: true
  });

  return true;
}
