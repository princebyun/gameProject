import type { SeededPRNG } from '../math/prng';
import { distVec } from '../math/vector2';
import type { BattleWorldState, UnitRuntimeState } from '../types/battleState';
import type { GameDataRegistry } from '../types/dataSchemas';
import {
  RAID_RESCUE_CHANNEL_SEC,
  RAID_RESCUE_HP_RATIO,
  RAID_RESCUE_RADIUS_PX
} from './raidSetup';
import { stepRaidTelegraphs } from './raidTelegraphSystem';

export function triggerRaidBossGroggy(
  world: BattleWorldState,
  boss: UnitRuntimeState
): void {
  const rs = world.raidState;
  rs.breakGauge = 0;
  rs.groggyTimer = rs.groggyDurationSec;
  boss.superRegenLockoutTimer = Math.max(
    boss.superRegenLockoutTimer,
    rs.groggyDurationSec
  );
  boss.windupMoveId = null;
  boss.windupTimer = 0;
  boss.activeBeamId = null;
  boss.vel = { x: 0, y: 0 };
  rs.telegraphs = [];

  world.hitstopTimer = Math.max(world.hitstopTimer, 0.12);
  world.screenShakeTimer = 0.35;
  world.screenShakeMagnitude = 8.0;
  world.floatingTexts.push({
    id: `ft_raid_break_${world.tick}`,
    pos: { x: boss.pos.x, y: boss.pos.y - boss.radiusPx - 20 },
    text: `💥 BREAK! ${rs.groggyDurationSec}초 그로기 (피해 ×${rs.groggyDamageMult})`,
    color: '#facc15',
    elapsedSec: 0,
    durationSec: 1.8,
    scale: 1.4
  });
  world.combatLog.push(
    `[레이드 브레이크!] ${boss.name}의 브레이크 게이지 파괴! ${rs.groggyDurationSec}초간 행동불가 · 초재생 강제 정지 · 받는 피해 ${rs.groggyDamageMult}배!`
  );
}

export function applyRaidBreakDamage(
  world: BattleWorldState,
  boss: UnitRuntimeState,
  attacker: UnitRuntimeState | null,
  movePower: number,
  hasArmamentHaki: boolean,
  hasConquerorCoating: boolean,
  isInternalDestruction: boolean,
  directBreakAmount?: number
): void {
  const rs = world.raidState;
  if (!rs.active || rs.bossUnitId !== boss.instanceId || rs.groggyTimer > 0) return;

  let breakDmg = directBreakAmount ?? 0;
  if (directBreakAmount === undefined) {
    let base = 4;
    if (movePower >= 110) base += 8;
    else if (movePower >= 85) base += 5;
    if (hasArmamentHaki) base += 7;
    if (hasConquerorCoating) base += 14;
    if (isInternalDestruction) base += 8;
    const relicBonus = 1 + (attacker?.endgameBreakGaugeBonusRatio ?? 0);
    breakDmg = Math.round(base * relicBonus);
  }

  if (breakDmg <= 0) return;
  rs.breakGauge = Math.max(0, rs.breakGauge - breakDmg);
  if (rs.breakGauge <= 0) {
    triggerRaidBossGroggy(world, boss);
  }
}

export function interceptRaidBossIncomingDamage(
  world: BattleWorldState,
  boss: UnitRuntimeState,
  attacker: UnitRuntimeState | null,
  damage: number,
  movePower: number,
  hasArmamentHaki: boolean,
  hasConquerorCoating: boolean,
  isInternalDestruction: boolean
): number {
  const rs = world.raidState;
  if (!rs.active || rs.bossUnitId !== boss.instanceId || damage <= 0) {
    return damage;
  }

  if (rs.dpsCheck.active && rs.dpsCheck.shieldHp > 0) {
    rs.dpsCheck.shieldHp = Math.max(0, rs.dpsCheck.shieldHp - damage);
    if (rs.dpsCheck.shieldHp <= 0) {
      rs.dpsCheck.active = false;
      world.floatingTexts.push({
        id: `ft_dps_break_${world.tick}`,
        pos: { x: boss.pos.x, y: boss.pos.y - boss.radiusPx - 14 },
        text: '🛡 보호막 파훼 성공! (DPS CHECK CLEAR)',
        color: '#4ade80',
        elapsedSec: 0,
        durationSec: 1.5,
        scale: 1.3
      });
      world.combatLog.push(
        `[DPS 체크 돌파] 팀 협동 화력으로 ${boss.name}의 보호막을 파괴했습니다!`
      );
      applyRaidBreakDamage(
        world,
        boss,
        attacker,
        movePower,
        hasArmamentHaki,
        hasConquerorCoating,
        isInternalDestruction,
        Math.round(rs.breakGaugeMax * 0.4)
      );
    }
    return 0;
  }

  applyRaidBreakDamage(
    world,
    boss,
    attacker,
    movePower,
    hasArmamentHaki,
    hasConquerorCoating,
    isInternalDestruction
  );
  return damage;
}

export function stepRaidBattleRules(
  world: BattleWorldState,
  dt: number,
  registry: GameDataRegistry,
  prng: SeededPRNG
): void {
  const rs = world.raidState;
  if (!rs.active) return;

  const boss = world.units.find((u) => u.instanceId === rs.bossUnitId);

  if (boss && boss.isAlive) {
    if (rs.groggyTimer > 0) {
      rs.groggyTimer = Math.max(0, rs.groggyTimer - dt);
      boss.superRegenLockoutTimer = Math.max(boss.superRegenLockoutTimer, 0.25);
      boss.vel = { x: 0, y: 0 };
      boss.windupMoveId = null;
      if (rs.groggyTimer <= 0) {
        rs.breakGauge = rs.breakGaugeMax;
        world.combatLog.push(`[레이드 회복] ${boss.name}이(가) 그로기 상태에서 복귀했습니다!`);
      }
    }

    const bossHpRatio = boss.hp / Math.max(1, boss.maxHp);
    if (!rs.dpsCheck.active) {
      for (let i = 0; i < rs.dpsCheckTriggerHpRatios.length; i++) {
        const triggerRatio = rs.dpsCheckTriggerHpRatios[i];
        if (
          triggerRatio !== undefined &&
          !rs.triggeredDpsIndices.includes(i) &&
          bossHpRatio <= triggerRatio
        ) {
          rs.triggeredDpsIndices.push(i);
          rs.dpsCheck = {
            active: true,
            shieldHp: rs.dpsCheckShieldHpConfig,
            maxShieldHp: rs.dpsCheckShieldHpConfig,
            remainingSec: rs.dpsCheckDurationConfig,
            totalSec: rs.dpsCheckDurationConfig
          };
          world.floatingTexts.push({
            id: `ft_dps_start_${world.tick}`,
            pos: { x: boss.pos.x, y: boss.pos.y - boss.radiusPx - 24 },
            text: '⚠ 팀 DPS 체크 보호막 전개! 제한 시간 내 파괴하라!',
            color: '#f97316',
            elapsedSec: 0,
            durationSec: 2.0,
            scale: 1.3
          });
          world.combatLog.push(
            `[DPS 체크 개시] ${boss.name}이(가) 보호막(${rs.dpsCheck.maxShieldHp})을 전개! ${rs.dpsCheck.totalSec}초 내 파괴하지 못하면 전장 충격파가 발동합니다!`
          );
          break;
        }
      }
    } else {
      rs.dpsCheck.remainingSec = Math.max(0, rs.dpsCheck.remainingSec - dt);
      if (rs.dpsCheck.remainingSec <= 0 && rs.dpsCheck.shieldHp > 0) {
        rs.dpsCheck.active = false;
        rs.dpsCheck.shieldHp = 0;
        world.screenShakeTimer = 0.45;
        world.screenShakeMagnitude = 10;
        world.floatingTexts.push({
          id: `ft_dps_fail_${world.tick}`,
          pos: { x: world.arenaWidth * 0.5, y: 120 },
          text: '💥 DPS 체크 실패! 전장 광역 충격파 발동!!',
          color: '#dc2626',
          elapsedSec: 0,
          durationSec: 1.8,
          scale: 1.4
        });
        world.combatLog.push(
          `[DPS 체크 실패] ${boss.name}의 보호막을 파괴하지 못해 전장 광역 충격파가 작렬했습니다!`
        );
        for (const u of world.units) {
          if (!u.isAlive || !u.isOnField || u.isDowned || u.team !== 'ALPHA') continue;
          const shockDmg = Math.max(40, Math.round(u.maxHp * 0.38));
          u.hp = Math.max(0, u.hp - shockDmg);
        }
      }
    }

    stepRaidTelegraphs(rs, boss, world, dt, registry, prng);
  }

  const alphaSquad = world.units.filter((u) => u.team === 'ALPHA' && u.isOnField);
  const standingAllies = alphaSquad.filter((u) => u.isAlive && !u.isDowned);

  for (const downed of alphaSquad) {
    if (!downed.isAlive || !downed.isDowned) continue;

    downed.downedTimer = Math.max(0, downed.downedTimer - dt);
    const rescuerNear =
      rs.teamRevivesRemaining > 0 &&
      standingAllies.some((ally) => distVec(ally.pos, downed.pos) <= RAID_RESCUE_RADIUS_PX);

    if (rescuerNear) {
      downed.reviveProgressSec += dt;
      if (downed.reviveProgressSec >= RAID_RESCUE_CHANNEL_SEC) {
        downed.isDowned = false;
        downed.downedTimer = 0;
        downed.reviveProgressSec = 0;
        downed.hp = Math.max(1, Math.round(downed.maxHp * RAID_RESCUE_HP_RATIO));
        downed.iframeTimer = 1.5;
        rs.teamRevivesRemaining = Math.max(0, rs.teamRevivesRemaining - 1);

        world.floatingTexts.push({
          id: `ft_revive_${world.tick}_${downed.instanceId}`,
          pos: { x: downed.pos.x, y: downed.pos.y - 32 },
          text: `❤️ 구조 부활! (HP 40% / 잔여 부활 ${rs.teamRevivesRemaining})`,
          color: '#4ade80',
          elapsedSec: 0,
          durationSec: 1.5,
          scale: 1.2
        });
        world.combatLog.push(
          `[레이드 구조 성공] ${downed.name}이(가) HP 40%로 부활했습니다! (팀 잔여 부활: ${rs.teamRevivesRemaining}/${rs.teamRevivesMax})`
        );
        continue;
      }
    } else {
      downed.reviveProgressSec = Math.max(0, downed.reviveProgressSec - dt * 0.5);
    }

    if (downed.downedTimer <= 0) {
      downed.isDowned = false;
      downed.isAlive = false;
      downed.hp = 0;
      world.combatLog.push(
        `[레이드 탈락] ${downed.name}의 구조 제한 시간(15초)이 만료되어 전투 불능이 되었습니다!`
      );
    }
  }

  const remainingStanding = world.units.some(
    (u) => u.team === 'ALPHA' && u.isOnField && u.isAlive && !u.isDowned
  );
  if (!remainingStanding && world.winnerTeam === null) {
    world.winnerTeam = 'OMEGA';
    world.winReasonText = '💀 스쿼드 전원 다운 — 거대 보스 레이드 실패!';
    world.combatLog.push(world.winReasonText);
  }
}
