import type { MusouActionTypeDefinition } from '../../../data/musouTypesRegistry';
import type { SeededPRNG } from '../../math/prng';
import {
  computeBossArmorDamage,
  computeOffensiveDamageScalePermille,
  scalePermille
} from './ActionTypeProfile';
import {
  BOSS_ARMOR_HITSTOP_TICKS,
  BOSS_CRACKED_THRESHOLD_PERMILLE,
  BOSS_GROGGY_DAMAGE_PERMILLE,
  BOSS_GROGGY_DURATION_TICKS,
  BOSS_GROGGY_RECOVERY_ARMOR_PERMILLE,
  type MusouCombatState,
  type MusouDamagePopupStyle,
  type MusouTickEvent
} from './MusouTypes';

export interface BossHitDescriptor {
  baseArmorDamage: number;
  baseHpDamage: number;
  isHeavy: boolean;
  isCharge: boolean;
  isSpecial: boolean;
  isParryCounter: boolean;
  launchesAir: boolean;
  appliesMark: boolean;
  detonatesMark: boolean;
}

export function applyDirectArmorCutRatio(
  state: MusouCombatState,
  cutPermille: number,
  hpDamage: number,
  events: MusouTickEvent[]
): void {
  const boss = state.boss;
  if (boss.hp <= 0) return;
  const armorCut = Math.max(1, scalePermille(boss.maxArmor, cutPermille));
  const hpCut = Math.max(1, hpDamage);

  boss.hp = Math.max(0, boss.hp - hpCut);
  if (boss.armorState !== 'BROKEN_GROGGY' && boss.armorGauge > 0) {
    const prevState = boss.armorState;
    boss.armorGauge = Math.max(0, boss.armorGauge - armorCut);

    events.push({
      kind: 'BOSS_ARMOR_HIT',
      bossUnitId: boss.bossUnitId,
      xMm: boss.xMm,
      yMm: boss.yMm + boss.airborneYMm,
      zMm: boss.zMm,
      armorDamage: armorCut,
      armorRemaining: boss.armorGauge,
      maxArmor: boss.maxArmor
    });

    if (boss.armorGauge === 0) {
      boss.armorState = 'BROKEN_GROGGY';
      boss.groggyTicksRemaining = BOSS_GROGGY_DURATION_TICKS;
      boss.staggerTicks = Math.max(boss.staggerTicks, 24);
      state.lastHitstopTicks = BOSS_ARMOR_HITSTOP_TICKS;
      events.push({
        kind: 'BOSS_ARMOR_BREAK',
        bossUnitId: boss.bossUnitId,
        xMm: boss.xMm,
        yMm: boss.yMm,
        zMm: boss.zMm,
        hitstopTicks: BOSS_ARMOR_HITSTOP_TICKS,
        groggyDurationTicks: BOSS_GROGGY_DURATION_TICKS
      });
    } else if (
      prevState === 'INTACT' &&
      boss.armorGauge * 1000 <= boss.maxArmor * BOSS_CRACKED_THRESHOLD_PERMILLE
    ) {
      boss.armorState = 'CRACKED';
      events.push({
        kind: 'BOSS_ARMOR_CRACKED',
        bossUnitId: boss.bossUnitId,
        xMm: boss.xMm,
        yMm: boss.yMm,
        zMm: boss.zMm
      });
    }
  }

  events.push({
    kind: 'DAMAGE_POPUP',
    xMm: boss.xMm,
    yMm: boss.yMm + boss.airborneYMm + 1800,
    zMm: boss.zMm,
    value: hpCut,
    style: boss.armorState === 'BROKEN_GROGGY' ? 'GROGGY_CRIT' : 'ARMOR_HIT'
  });
}

export function applyBossArmorAndHpHit(
  state: MusouCombatState,
  hit: BossHitDescriptor,
  profile: MusouActionTypeDefinition,
  prng: SeededPRNG,
  events: MusouTickEvent[]
): { finalHpDamage: number; finalArmorDamage: number; markDetonated: boolean } {
  const player = state.player;
  const boss = state.boss;

  let markDetonated = false;
  if (
    boss.markedTicks > 0 &&
    (hit.isCharge || hit.isSpecial || hit.detonatesMark)
  ) {
    const consumedStacks = Math.max(1, boss.markedStacks);
    boss.markedTicks = 0;
    boss.markedStacks = 0;
    markDetonated = true;
    events.push({
      kind: 'TECH_MARK_DETONATED',
      xMm: boss.xMm,
      yMm: boss.yMm + boss.airborneYMm,
      zMm: boss.zMm,
      pullRadiusMm:
        profile.markDetonatePullRadiusMm > 0
          ? profile.markDetonatePullRadiusMm
          : 8500,
      consumedStacks
    });
  } else if (
    profile.actionType === 'TECHNIQUE' &&
    hit.appliesMark &&
    profile.markDurationTicks > 0
  ) {
    boss.markedTicks = profile.markDurationTicks;
    boss.markedStacks = Math.min(3, boss.markedStacks + 1);
    events.push({
      kind: 'TECH_MARK_APPLIED',
      xMm: boss.xMm,
      yMm: boss.yMm + boss.airborneYMm,
      zMm: boss.zMm,
      stacks: boss.markedStacks
    });
  }

  const isAirborneAttacker = player.yMm > 100;
  const armorDamage = computeBossArmorDamage(
    hit.baseArmorDamage,
    {
      isCharge: hit.isCharge,
      isSpecial: hit.isSpecial,
      isParryCounter: hit.isParryCounter,
      isAirborneAttacker,
      isBurstActive: player.burstActive,
      markDetonated
    },
    profile
  );

  // Crit check including SPEED post-Dash-Cancel +30% bonus
  let isCrit = false;
  let critPermille = 100;
  if (player.speedCancelCritTicks > 0) {
    critPermille += profile.postCancelCritBonusPermille;
    player.speedCancelCritTicks = 0;
  }
  if (prng.nextInt(0, 999) < critPermille) {
    isCrit = true;
  }

  const burstScale = computeOffensiveDamageScalePermille(player.burstActive);
  let finalHpDamage = scalePermille(hit.baseHpDamage, burstScale);
  if (markDetonated) {
    finalHpDamage = scalePermille(finalHpDamage, 1300);
  }
  if (isCrit) {
    finalHpDamage = scalePermille(finalHpDamage, 1500);
  }

  let popupStyle: MusouDamagePopupStyle = isCrit ? 'CRIT' : 'NORMAL';

  if (boss.armorState === 'BROKEN_GROGGY') {
    finalHpDamage = scalePermille(finalHpDamage, BOSS_GROGGY_DAMAGE_PERMILLE);
    boss.staggerTicks = Math.max(boss.staggerTicks, hit.isHeavy ? 22 : 14);
    if (hit.launchesAir) {
      boss.airborneYMm = Math.min(2400, Math.max(boss.airborneYMm + 450, 900));
    }
    popupStyle = 'GROGGY_CRIT';
  } else {
    // Super armor active during INTACT / CRACKED: light attacks cannot stagger or juggle
    const prevState = boss.armorState;
    boss.armorGauge = Math.max(0, boss.armorGauge - armorDamage);
    popupStyle = armorDamage >= 60 ? 'ARMOR_HIT' : popupStyle;

    events.push({
      kind: 'BOSS_ARMOR_HIT',
      bossUnitId: boss.bossUnitId,
      xMm: boss.xMm,
      yMm: boss.yMm + boss.airborneYMm,
      zMm: boss.zMm,
      armorDamage,
      armorRemaining: boss.armorGauge,
      maxArmor: boss.maxArmor
    });

    if (boss.armorGauge === 0) {
      boss.armorState = 'BROKEN_GROGGY';
      boss.groggyTicksRemaining = BOSS_GROGGY_DURATION_TICKS;
      boss.staggerTicks = Math.max(boss.staggerTicks, 24);
      state.lastHitstopTicks = BOSS_ARMOR_HITSTOP_TICKS;
      events.push({
        kind: 'BOSS_ARMOR_BREAK',
        bossUnitId: boss.bossUnitId,
        xMm: boss.xMm,
        yMm: boss.yMm,
        zMm: boss.zMm,
        hitstopTicks: BOSS_ARMOR_HITSTOP_TICKS,
        groggyDurationTicks: BOSS_GROGGY_DURATION_TICKS
      });
    } else if (
      prevState === 'INTACT' &&
      boss.armorGauge * 1000 <= boss.maxArmor * BOSS_CRACKED_THRESHOLD_PERMILLE
    ) {
      boss.armorState = 'CRACKED';
      events.push({
        kind: 'BOSS_ARMOR_CRACKED',
        bossUnitId: boss.bossUnitId,
        xMm: boss.xMm,
        yMm: boss.yMm,
        zMm: boss.zMm
      });
    }
  }

  boss.hp = Math.max(0, boss.hp - finalHpDamage);
  events.push({
    kind: 'DAMAGE_POPUP',
    xMm: boss.xMm,
    yMm: boss.yMm + boss.airborneYMm + 1800,
    zMm: boss.zMm,
    value: finalHpDamage,
    style: popupStyle
  });

  return {
    finalHpDamage,
    finalArmorDamage: armorDamage,
    markDetonated
  };
}

export function stepBossArmorRuntime(
  state: MusouCombatState,
  events: MusouTickEvent[]
): void {
  const boss = state.boss;
  if (boss.markedTicks > 0) {
    boss.markedTicks -= 1;
    if (boss.markedTicks <= 0) {
      boss.markedStacks = 0;
    }
  }
  if (boss.staggerTicks > 0) {
    boss.staggerTicks -= 1;
  }
  if (boss.airborneYMm > 0) {
    boss.airborneYMm = Math.max(0, boss.airborneYMm - 42);
  }

  if (boss.armorState === 'BROKEN_GROGGY') {
    if (boss.groggyTicksRemaining > 0) {
      boss.groggyTicksRemaining -= 1;
    }
    if (boss.groggyTicksRemaining <= 0) {
      const restored = Math.max(
        1,
        scalePermille(boss.maxArmor, BOSS_GROGGY_RECOVERY_ARMOR_PERMILLE)
      );
      boss.armorState = 'INTACT';
      boss.armorGauge = restored;
      boss.airborneYMm = 0;
      boss.staggerTicks = 0;
      events.push({
        kind: 'BOSS_GROGGY_RECOVERY',
        bossUnitId: boss.bossUnitId,
        xMm: boss.xMm,
        yMm: boss.yMm,
        zMm: boss.zMm,
        restoredArmor: restored
      });
    }
  }
}
