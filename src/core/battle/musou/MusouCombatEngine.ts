import {
  getMusouSpecialLoadout,
  getMusouTypeProfile,
  resolveMusouActionTypeForUnit
} from '../../../data/musouTypesRegistry';
import type { SeededPRNG } from '../../math/prng';
import { sha256Hex } from '../../save/sha256';
import {
  computeAttackPhaseDurationTicks,
  computeBurstAoeRadiusMm,
  computeEffectiveKnockbackMm,
  getActiveActionProfile,
  resolveEffectiveActionType
} from './ActionTypeProfile';
import {
  applyBossArmorAndHpHit,
  stepBossArmorRuntime
} from './BossArmorBreakSystem';
import {
  addBurstGauge,
  stepBurstState,
  stepSpecialCooldowns,
  tryActivateFullForceBurst,
  tryCastSpecialSlot
} from './BurstAndSpecialSystem';
import {
  stepStaminaAndVerticalPhysics,
  tryTriggerPowerDash
} from './PowerDashSystem';
import {
  BURST_GAUGE_MAX,
  createSpecialSlotRuntime,
  HIT_COMBO_RESET_TICKS,
  JUMP_IMPULSE_MM_PER_TICK,
  MUSOU_CALC_VERSION,
  MUSOU_TICK_HZ,
  STAMINA_MAX,
  type MusouActionType,
  type MusouAttackPhase,
  type MusouCombatCreateConfig,
  type MusouCombatState,
  type MusouHudSnapshot,
  type MusouInputCommand,
  type MusouSpecialSlotRuntime,
  type MusouTickEvent
} from './MusouTypes';

const RUN_SPEED_MM_PER_TICK = 125;
const MELEE_HIT_REACH_MM = 5400;

export function createMusouCombatState(
  config: MusouCombatCreateConfig = {}
): MusouCombatState {
  const speciesId = config.speciesId ?? 'luffy';
  const activeFormId = config.activeFormId ?? null;
  const actionTypeOverride = config.actionTypeOverride ?? null;
  const actionType =
    actionTypeOverride ?? resolveMusouActionTypeForUnit(speciesId, activeFormId);
  const rawLoadout = getMusouSpecialLoadout(speciesId);
  const s0 = rawLoadout[0];
  const s1 = rawLoadout[1];
  const s2 = rawLoadout[2];
  const s3 = rawLoadout[3];
  if (!s0 || !s1 || !s2 || !s3) {
    throw new Error(`Missing 4-slot Musou special loadout for ${speciesId}`);
  }
  const slots: [
    MusouSpecialSlotRuntime,
    MusouSpecialSlotRuntime,
    MusouSpecialSlotRuntime,
    MusouSpecialSlotRuntime
  ] = [
    createSpecialSlotRuntime(s0, 0),
    createSpecialSlotRuntime(s1, 1),
    createSpecialSlotRuntime(s2, 2),
    createSpecialSlotRuntime(s3, 3)
  ];

  const maxHp = Math.max(500, config.maxHp ?? 4200);
  const bossMaxHp = Math.max(2000, config.bossMaxHp ?? 24000);
  const bossMaxArmor = Math.max(100, config.bossMaxArmor ?? 1200);

  return {
    calcVersion: MUSOU_CALC_VERSION,
    combatMode: 'musou_3d',
    tick: 0,
    lastHitstopTicks: 0,
    player: {
      unitId: config.unitId ?? 'alpha_1',
      speciesId,
      baseFormId: activeFormId,
      activeFormId,
      actionType,
      actionTypeOverride,
      xMm: -3500,
      yMm: 0,
      zMm: 0,
      vxMm: 0,
      vyMm: 0,
      vzMm: 0,
      aimXPermille: 1000,
      aimZPermille: 0,
      hp: maxHp,
      maxHp,
      stamina: STAMINA_MAX,
      maxStamina: STAMINA_MAX,
      infiniteStamina: false,
      attackPhase: 'IDLE',
      phaseTick: 0,
      phaseDurationTicks: 0,
      phaseHitTriggered: false,
      comboIndex: 0,
      hitComboCount: 0,
      hitComboDecayTicks: 0,
      canPowerDashCancel: false,
      airDashCount: 0,
      speedCancelCritTicks: 0,
      superArmorTicks: 0,
      invulnTicks: 0,
      burstGauge: 0,
      burstActive: false,
      burstTicksRemaining: 0,
      burstTotalTicks: 600,
      burstExtensionTicksUsed: 0,
      burstKoAccumulator: 0,
      burstCinematicTicks: 0,
      specialSlots: slots
    },
    boss: {
      bossUnitId: config.bossUnitId ?? 'omega_1',
      bossName: config.bossName ?? '카이도 (백수 해적단 총독)',
      speciesId: config.bossSpeciesId ?? 'kaido',
      xMm: 1200,
      yMm: 0,
      zMm: 0,
      hp: bossMaxHp,
      maxHp: bossMaxHp,
      armorGauge: bossMaxArmor,
      maxArmor: bossMaxArmor,
      armorState: 'INTACT',
      groggyTicksRemaining: 0,
      markedTicks: 0,
      markedStacks: 0,
      staggerTicks: 0,
      airborneYMm: 0
    }
  };
}

function getNextLightPhase(player: MusouCombatState['player']): {
  phase: MusouAttackPhase;
  baseDuration: number;
  comboIndex: number;
} {
  if (player.yMm > 100) {
    const step = (player.comboIndex % 2) + 1;
    return {
      phase: step === 1 ? 'AIR_COMBO_1' : 'AIR_COMBO_2',
      baseDuration: 18,
      comboIndex: step
    };
  }
  const next = (player.comboIndex % 4) + 1;
  const phase: MusouAttackPhase =
    next === 1
      ? 'COMBO_1'
      : next === 2
        ? 'COMBO_2'
        : next === 3
          ? 'COMBO_3'
          : 'COMBO_4';
  return {
    phase,
    baseDuration: next === 4 ? 26 : 18,
    comboIndex: next
  };
}

export function stepMusouCombatTick(
  state: MusouCombatState,
  input: MusouInputCommand,
  prng: SeededPRNG
): MusouTickEvent[] {
  const events: MusouTickEvent[] = [];
  state.tick += 1;
  state.lastHitstopTicks = 0;

  const player = state.player;
  player.actionType = resolveEffectiveActionType(player);
  const profile = getActiveActionProfile(player);

  stepSpecialCooldowns(state);
  stepBurstState(state, events);
  stepBossArmorRuntime(state, events);

  if (player.hitComboDecayTicks > 0) {
    player.hitComboDecayTicks -= 1;
    if (player.hitComboDecayTicks <= 0) {
      player.hitComboCount = 0;
    }
  }

  // 1. High-priority overrides: Full-Force Burst -> 4-Slot Special -> Power Dash Cancel
  const burstTriggered = input.burstPressed
    ? tryActivateFullForceBurst(state, profile, prng, events)
    : false;

  const specialTriggered =
    !burstTriggered &&
    input.specialSlotIndex !== null &&
    input.specialSlotIndex !== undefined
      ? tryCastSpecialSlot(state, input.specialSlotIndex, profile, prng, events)
      : false;

  const dashTriggered =
    !burstTriggered && !specialTriggered
      ? tryTriggerPowerDash(state, input, profile, events)
      : false;

  // 2. Just Parry Armor Counter
  if (
    !burstTriggered &&
    !specialTriggered &&
    input.parryPressed
  ) {
    const dist = Math.hypot(state.boss.xMm - player.xMm, state.boss.zMm - player.zMm);
    if (dist <= MELEE_HIT_REACH_MM) {
      applyBossArmorAndHpHit(
        state,
        {
          baseArmorDamage: 220,
          baseHpDamage: 260,
          isHeavy: true,
          isCharge: false,
          isSpecial: false,
          isParryCounter: true,
          launchesAir: false,
          appliesMark: profile.actionType === 'TECHNIQUE',
          detonatesMark: false
        },
        profile,
        prng,
        events
      );
      addBurstGauge(state, 160);
      player.hitComboCount += 1;
      player.hitComboDecayTicks = HIT_COMBO_RESET_TICKS;
      player.canPowerDashCancel = true;
    }
  }

  // 3. Jump & Combat Attack Progression (if not overridden above)
  if (!burstTriggered && !specialTriggered && !dashTriggered) {
    if (input.jumpPressed && player.yMm <= 50) {
      player.yMm = 120;
      player.vyMm = JUMP_IMPULSE_MM_PER_TICK;
      player.airDashCount = 0;
      player.attackPhase = 'AIR_LAUNCH';
      player.phaseTick = 0;
      player.phaseDurationTicks = 14;
      player.canPowerDashCancel = true;
      events.push({
        kind: 'SKY_AIR_HOP',
        xMm: player.xMm,
        yMm: player.yMm,
        zMm: player.zMm,
        airDashIndex: 0
      });
    } else if (input.chargeAttackPressed && (player.attackPhase === 'IDLE' || player.attackPhase === 'RUN' || player.phaseTick >= Math.floor(player.phaseDurationTicks * 0.45))) {
      const isAir = player.yMm > 100;
      player.attackPhase = isAir ? 'AIR_SLAM' : 'CHARGE_ATTACK';
      player.phaseTick = 0;
      player.phaseDurationTicks = computeAttackPhaseDurationTicks(24, profile, player.burstActive);
      player.phaseHitTriggered = false;
      player.canPowerDashCancel = false;
    } else if (input.lightAttackPressed && (player.attackPhase === 'IDLE' || player.attackPhase === 'RUN' || player.attackPhase === 'AIR_LAUNCH' || player.phaseTick >= Math.floor(player.phaseDurationTicks * 0.55))) {
      const next = getNextLightPhase(player);
      player.attackPhase = next.phase;
      player.comboIndex = next.comboIndex;
      player.phaseTick = 0;
      player.phaseDurationTicks = computeAttackPhaseDurationTicks(
        next.baseDuration,
        profile,
        player.burstActive
      );
      player.phaseHitTriggered = false;
      player.canPowerDashCancel = false;
    } else if (player.attackPhase === 'IDLE' || player.attackPhase === 'RUN') {
      const mx = input.moveXPermille ?? 0;
      const mz = input.moveZPermille ?? 0;
      const mag = Math.hypot(mx, mz);
      if (mag > 80) {
        const speedMult = player.burstActive ? 1150 : 1000;
        const stepSpeed = Math.round((RUN_SPEED_MM_PER_TICK * speedMult) / 1000);
        const nx = Math.round((mx / mag) * 1000);
        const nz = Math.round((mz / mag) * 1000);
        player.aimXPermille = nx;
        player.aimZPermille = nz;
        player.vxMm = Math.round((nx * stepSpeed) / 1000);
        player.vzMm = Math.round((nz * stepSpeed) / 1000);
        player.attackPhase = 'RUN';
      } else {
        player.attackPhase = 'IDLE';
      }
    }
  }

  // 4. Advance active attack phase, resolve hit frame, and open canPowerDashCancel
  if (
    player.attackPhase !== 'IDLE' &&
    player.attackPhase !== 'RUN'
  ) {
    player.phaseTick += 1;
    const isAttackPhase =
      player.attackPhase !== 'POWER_DASH' &&
      player.attackPhase !== 'BURST_CINEMATIC' &&
      player.attackPhase !== 'AIR_LAUNCH' &&
      player.attackPhase !== 'SPECIAL_CAST' &&
      player.attackPhase !== 'HITSTUN';

    if (isAttackPhase) {
      const activeHitTick = Math.max(2, Math.floor(player.phaseDurationTicks * 0.35));
      if (!player.phaseHitTriggered && player.phaseTick >= activeHitTick) {
        player.phaseHitTriggered = true;
        player.canPowerDashCancel = true;

        const isCharge =
          player.attackPhase === 'CHARGE_ATTACK' || player.attackPhase === 'AIR_SLAM';
        const isAirCombo =
          player.attackPhase === 'AIR_COMBO_1' ||
          player.attackPhase === 'AIR_COMBO_2' ||
          player.attackPhase === 'AIR_SLAM';

        // Air combo keeps Sky/aerial fighters aloft briefly
        if (isAirCombo && player.yMm > 100) {
          player.vyMm = Math.max(player.vyMm, 38);
        }

        const effectiveRadius = computeBurstAoeRadiusMm(
          isCharge ? 5200 : 4200,
          profile,
          player.burstActive
        );
        const knockbackMm = computeEffectiveKnockbackMm(
          isCharge ? 3200 : 1400,
          isCharge,
          profile
        );

        const distToBoss = Math.hypot(
          state.boss.xMm - player.xMm,
          state.boss.zMm - player.zMm
        );
        if (distToBoss <= effectiveRadius + 2400) {
          applyBossArmorAndHpHit(
            state,
            {
              baseArmorDamage: isCharge ? 140 : 45,
              baseHpDamage: isCharge ? 210 : 95,
              isHeavy: isCharge,
              isCharge,
              isSpecial: false,
              isParryCounter: false,
              launchesAir: isCharge || player.attackPhase === 'COMBO_3',
              appliesMark: profile.actionType === 'TECHNIQUE' && !isCharge,
              detonatesMark: profile.actionType === 'TECHNIQUE' && isCharge
            },
            profile,
            prng,
            events
          );
          addBurstGauge(state, isCharge ? 75 : 40);
          player.hitComboCount += 1;
          player.hitComboDecayTicks = HIT_COMBO_RESET_TICKS;
        }

        events.push({
          kind: 'ATTACK_SWING',
          phase: player.attackPhase,
          xMm: player.xMm,
          yMm: player.yMm,
          zMm: player.zMm,
          radiusMm: effectiveRadius,
          knockbackMm,
          isAirLaunch: player.attackPhase === 'COMBO_3' || player.attackPhase === 'AIR_SLAM',
          isSpecial: false
        });
      }

      if (player.phaseTick >= Math.floor(player.phaseDurationTicks * 0.65)) {
        player.canPowerDashCancel = true;
      }
    }

    if (player.phaseTick >= player.phaseDurationTicks) {
      player.attackPhase = 'IDLE';
      player.phaseTick = 0;
      player.phaseDurationTicks = 0;
      player.canPowerDashCancel = false;
    }
  }

  stepStaminaAndVerticalPhysics(state, profile);
  return events;
}

export function computeMusouStateHash(
  state: Readonly<MusouCombatState>,
  prng: Readonly<SeededPRNG>
): string {
  const p = state.player;
  const b = state.boss;
  const slotsPart = p.specialSlots
    .map((s) => `${s.slotIndex}:${s.cooldownTicks}:${s.chargeGauge}`)
    .join(',');
  const canonical = [
    `V:${state.calcVersion}`,
    `T:${state.tick}`,
    `PRNG:${prng.getSeedState()}`,
    `P:${p.actionType}|${p.activeFormId ?? '-'}|${p.xMm},${p.yMm},${p.zMm}|${p.vxMm},${p.vyMm},${p.vzMm}|${p.stamina}|${p.attackPhase}:${p.phaseTick}|CD:${p.canPowerDashCancel ? 1 : 0}|AD:${p.airDashCount}|HC:${p.hitComboCount}|SC:${p.speedCancelCritTicks}|BG:${p.burstGauge}:${p.burstActive ? 1 : 0}:${p.burstTicksRemaining}`,
    `S:${slotsPart}`,
    `B:${b.hp}/${b.maxHp}|A:${b.armorGauge}/${b.maxArmor}:${b.armorState}|GR:${b.groggyTicksRemaining}|MK:${b.markedTicks}:${b.markedStacks}|ST:${b.staggerTicks}|AY:${b.airborneYMm}`
  ].join('||');
  return sha256Hex(canonical);
}

export function buildMusouHudSnapshot(
  state: Readonly<MusouCombatState>,
  koCount: number,
  playerName: string,
  bossNameOverride?: string
): MusouHudSnapshot {
  const p = state.player;
  const b = state.boss;
  const profile = getMusouTypeProfile(p.actionType);
  return {
    actionType: p.actionType,
    badgeText: profile.badgeText,
    themeColor: profile.themeColor,
    speciesId: p.speciesId,
    playerName,
    hp: p.hp,
    maxHp: p.maxHp,
    stamina: p.stamina,
    maxStamina: p.maxStamina,
    canPowerDashCancel: p.canPowerDashCancel,
    airDashCount: p.airDashCount,
    maxAirDashes: profile.maxAirDashes,
    isAirborne: p.yMm > 100,
    infiniteStamina: p.infiniteStamina,
    burstGauge: p.burstGauge,
    burstGaugeMax: BURST_GAUGE_MAX,
    burstActive: p.burstActive,
    burstRemainingSec: Number((p.burstTicksRemaining / MUSOU_TICK_HZ).toFixed(1)),
    burstRatio: p.burstActive
      ? p.burstTicksRemaining / Math.max(1, p.burstTotalTicks)
      : p.burstGauge / BURST_GAUGE_MAX,
    koCount,
    hitComboCount: p.hitComboCount,
    specialSlots: p.specialSlots,
    bossName: bossNameOverride ?? b.bossName,
    bossHp: b.hp,
    bossMaxHp: b.maxHp,
    bossArmor: b.armorGauge,
    bossMaxArmor: b.maxArmor,
    bossArmorState: b.armorState,
    bossGroggyRemainingSec: Number((b.groggyTicksRemaining / MUSOU_TICK_HZ).toFixed(1)),
    bossMarkedStacks: b.markedStacks
  };
}

export function setMusouActionTypeOverride(
  state: MusouCombatState,
  actionType: MusouActionType | null
): void {
  state.player.actionTypeOverride = actionType;
  state.player.actionType = resolveEffectiveActionType(state.player);
}

export function fillMusouBurstGauge(state: MusouCombatState): void {
  if (!state.player.burstActive) {
    state.player.burstGauge = BURST_GAUGE_MAX;
  }
}

export function setMusouInfiniteStamina(
  state: MusouCombatState,
  enabled: boolean
): void {
  state.player.infiniteStamina = enabled;
  if (enabled) {
    state.player.stamina = STAMINA_MAX;
  }
}

export function setBossArmorToRatio(
  state: MusouCombatState,
  ratio: number
): void {
  const clamped = Math.max(0.01, Math.min(1, ratio));
  state.boss.armorGauge = Math.max(1, Math.round(state.boss.maxArmor * clamped));
  state.boss.armorState =
    state.boss.armorGauge * 1000 <= state.boss.maxArmor * 350 ? 'CRACKED' : 'INTACT';
  state.boss.groggyTicksRemaining = 0;
}
