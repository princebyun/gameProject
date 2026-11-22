import { distVec } from '../math/vector2';
import type { BattleWorldState, UnitRuntimeState } from '../types/battleState';
import type { GameDataRegistry } from '../types/dataSchemas';
import {
  triggerForesightEvadeAndCounter
} from './bossMechanicsHooks';
import { forceRevertFormByDamageThreshold } from './formShiftEngine';
import { activateBirdcage } from './hazardAndSummonHooks';

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
  }
}

export function emitNullifiedHitFeedback(
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
