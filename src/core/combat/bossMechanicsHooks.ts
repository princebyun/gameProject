import { distVec, normalizeVec, subVec } from '../math/vector2';
import type { BattleWorldState, UnitRuntimeState } from '../types/battleState';
import type { GameDataRegistry } from '../types/dataSchemas';
import { spawnMeleeArcInstance } from './attackSpawners';
import {
  activateFormShift,
  forceRevertAllFormsForNullification
} from './formShiftEngine';

export function applyVenomStacksToUnit(
  target: UnitRuntimeState,
  stacksToAdd: number,
  world: BattleWorldState,
  registry: GameDataRegistry,
  maxStacks: number = 10
): void {
  if (!target.isAlive || stacksToAdd <= 0) return;
  const prev = target.venomStacks;
  target.venomStacks = Math.min(maxStacks, target.venomStacks + stacksToAdd);
  target.venomDecayTimer = 6.0;
  if (target.venomStacks > prev) {
    world.floatingTexts.push({
      id: `ft_venom_st_${world.tick}_${target.instanceId}`,
      pos: { x: target.pos.x, y: target.pos.y - 34 },
      text: `☠ 맹독 x${target.venomStacks}`,
      color: '#c084fc',
      elapsedSec: 0,
      durationSec: 0.75,
      scale: 0.95
    });
  }
  void registry;
}

export function activateMagellanVenomDemon(
  magellan: UnitRuntimeState,
  world: BattleWorldState,
  registry: GameDataRegistry
): void {
  if (magellan.venomDemonActive) return;
  magellan.venomDemonActive = true;
  magellan.bossPhase2Triggered = true;
  magellan.auraColor = '#dc2626';
  if (!magellan.activeFormId && magellan.awakenedFormId) {
    activateFormShift(magellan, world, registry);
  }
  world.floatingTexts.push({
    id: `ft_venom_demon_${world.tick}_${magellan.instanceId}`,
    pos: { x: magellan.pos.x, y: magellan.pos.y - 46 },
    text: '☠ 베놈 데몬: 지옥의 심판!',
    color: '#ef4444',
    elapsedSec: 0,
    durationSec: 1.5,
    scale: 1.35
  });
  world.vfxEvents.push({
    id: `vfx_venom_demon_${world.tick}_${magellan.instanceId}`,
    kind: 'FORM_BURST',
    pos: { x: magellan.pos.x, y: magellan.pos.y },
    color: '#dc2626',
    radiusPx: 145,
    elapsedSec: 0,
    durationSec: 0.55
  });
  world.combatLog.push(
    `[베놈 데몬 발동] ${magellan.name}이(가) 금지된 진홍빛 맹독 오라를 해방했습니다!`
  );
}

export function setLunarianFlameState(
  unit: UnitRuntimeState,
  flameOn: boolean,
  world: BattleWorldState,
  registry: GameDataRegistry
): void {
  const trait = registry.traits[unit.traitId];
  if (!trait?.lunarianFlame?.enabled) return;

  unit.lunarianFlameOn = flameOn;
  if (!flameOn) {
    unit.lunarianReigniteTimer = trait.lunarianFlame.reigniteDelaySec ?? 5.0;
    world.floatingTexts.push({
      id: `ft_lflame_off_${world.tick}_${unit.instanceId}`,
      pos: { x: unit.pos.x, y: unit.pos.y - 30 },
      text: '💨 불꽃 OFF (속도 +45%)',
      color: '#38bdf8',
      elapsedSec: 0,
      durationSec: 0.95,
      scale: 1.05
    });
    world.combatLog.push(
      `[루나리아 불꽃 해제] ${unit.name} 등 뒤의 불꽃을 끄고 초고속 기동 돌입! (이동속도 +45% / 피해 경감 해제)`
    );
  } else {
    unit.lunarianReigniteTimer = 0;
    world.floatingTexts.push({
      id: `ft_lflame_on_${world.tick}_${unit.instanceId}`,
      pos: { x: unit.pos.x, y: unit.pos.y - 30 },
      text: '🔥 불꽃 재점화 (피해 -75%)',
      color: '#fb923c',
      elapsedSec: 0,
      durationSec: 0.95,
      scale: 1.05
    });
    world.combatLog.push(
      `[루나리아 불꽃 점화] ${unit.name} 등 뒤의 불꽃 재점화! (받는 피해 75% 경감 + 경직 면역)`
    );
  }
}

export function applyFruitNullification(
  target: UnitRuntimeState,
  durationSec: number,
  world: BattleWorldState,
  registry: GameDataRegistry
): boolean {
  if (!target.isAlive || target.fruitType === 'NONE') {
    return false;
  }
  const dur = Math.max(1.0, durationSec);
  target.fruitNullifyTimer = Math.max(target.fruitNullifyTimer, dur);
  forceRevertAllFormsForNullification(target, world, registry);
  world.floatingTexts.push({
    id: `ft_nullify_${world.tick}_${target.instanceId}`,
    pos: { x: target.pos.x, y: target.pos.y - 38 },
    text: `🌑 능력 봉인 (${dur.toFixed(0)}s)!`,
    color: '#a855f7',
    elapsedSec: 0,
    durationSec: 1.3,
    scale: 1.25
  });
  world.vfxEvents.push({
    id: `vfx_nullify_${world.tick}_${target.instanceId}`,
    kind: 'FORM_BURST',
    pos: { x: target.pos.x, y: target.pos.y },
    color: '#581c87',
    radiusPx: 48,
    elapsedSec: 0,
    durationSec: 0.45
  });
  world.combatLog.push(
    `[어둠 열매 봉인] ${target.name} ${dur}초간 악마의 열매 능력·자연계 무적·변신/각성 완전 봉인!`
  );
  return true;
}

export function tryTriggerRevivePassive(
  unit: UnitRuntimeState,
  world: BattleWorldState,
  registry: GameDataRegistry
): boolean {
  if (unit.hasRevivedOnce) return false;
  if (unit.fruitType !== 'NONE' && unit.fruitNullifyTimer > 0) return false;
  const trait = registry.traits[unit.traitId];
  if (!trait?.revivePassive?.enabled) return false;

  unit.hasRevivedOnce = true;
  const reviveHp = Math.max(1, Math.round(unit.maxHp * trait.revivePassive.reviveHpRatio));
  unit.hp = reviveHp;
  unit.isAlive = true;
  unit.iframeTimer = Math.max(unit.iframeTimer, 1.2);

  // Heal nearby allies by allyHealRatio (15%)
  const healRadius = trait.revivePassive.allyHealRadiusPx ?? 240;
  for (const ally of world.units) {
    if (
      ally.instanceId === unit.instanceId ||
      !ally.isAlive ||
      !ally.isOnField ||
      ally.team !== unit.team
    ) {
      continue;
    }
    if (distVec(ally.pos, unit.pos) <= healRadius) {
      const allyHeal = Math.max(
        1,
        Math.round(ally.maxHp * trait.revivePassive.allyHealRatio)
      );
      ally.hp = Math.min(ally.maxHp, ally.hp + allyHeal);
      world.floatingTexts.push({
        id: `ft_revive_ally_${world.tick}_${ally.instanceId}`,
        pos: { x: ally.pos.x, y: ally.pos.y - 28 },
        text: `🔥 푸른 불꽃 치유 +${allyHeal}`,
        color: '#38bdf8',
        elapsedSec: 0,
        durationSec: 1.1,
        scale: 1.05
      });
    }
  }

  world.vfxEvents.push({
    id: `vfx_revive_${world.tick}_${unit.instanceId}`,
    kind: 'FORM_BURST',
    pos: { x: unit.pos.x, y: unit.pos.y },
    color: '#0ea5e9',
    radiusPx: 96,
    elapsedSec: 0,
    durationSec: 0.7
  });
  world.floatingTexts.push({
    id: `ft_revive_${world.tick}_${unit.instanceId}`,
    pos: { x: unit.pos.x, y: unit.pos.y - 40 },
    text: `🔥 불사조 재생 부활! (+${reviveHp} HP)`,
    color: '#38bdf8',
    elapsedSec: 0,
    durationSec: 1.6,
    scale: 1.35
  });
  world.combatLog.push(
    `[불사조 부활] ${unit.name} 치명상을 푸른 불꽃으로 소생! (HP 40% 부활 + 주변 아군 15% 치유)`
  );
  return true;
}

export function triggerForesightFocusBreak(
  target: UnitRuntimeState,
  world: BattleWorldState,
  registry: GameDataRegistry,
  reasonLabel: string
): boolean {
  const trait = registry.traits[target.traitId];
  if (!trait?.futureSightCounter?.enabled) return false;
  target.foresightFocus = 0;
  target.foresightBreakTimer = trait.futureSightCounter.focusBreakDurationSec;
  world.floatingTexts.push({
    id: `ft_fbreak_${world.tick}_${target.instanceId}`,
    pos: { x: target.pos.x, y: target.pos.y - 40 },
    text: `💥 집중 붕괴! (${reasonLabel} / 5s 피해 +20%)`,
    color: '#facc15',
    elapsedSec: 0,
    durationSec: 1.5,
    scale: 1.25
  });
  world.combatLog.push(
    `[미래 예지 파훼] ${reasonLabel} 적중으로 ${target.name}의 집중이 0이 되어 5초간 집중 붕괴!`
  );
  return true;
}

export function triggerForesightEvadeAndCounter(
  defender: UnitRuntimeState,
  attacker: UnitRuntimeState | undefined,
  world: BattleWorldState,
  registry: GameDataRegistry
): void {
  defender.mochiMorphTimer = 0.48;
  defender.foresightFocus = Math.max(0, defender.foresightFocus - 10);
  world.floatingTexts.push({
    id: `ft_foresight_${world.tick}_${defender.instanceId}`,
    pos: { x: defender.pos.x, y: defender.pos.y - 34 },
    text: '👁 미래 예지! 떡 변형 회피!',
    color: '#e879f9',
    elapsedSec: 0,
    durationSec: 1.15,
    scale: 1.2
  });
  world.vfxEvents.push({
    id: `vfx_mochi_evade_${world.tick}_${defender.instanceId}`,
    kind: 'LOGIA_DISPERSION',
    pos: { x: defender.pos.x, y: defender.pos.y },
    color: '#f8fafc',
    radiusPx: 34,
    elapsedSec: 0,
    durationSec: 0.35
  });
  world.combatLog.push(
    `[미래 예지 회피] ${defender.name} 공격 궤도를 미리 읽고 몸을 떡처럼 변형해 회피 후 반격!`
  );

  // Immediate short counter strike toward attacker
  if (attacker && attacker.isAlive && attacker.isOnField) {
    const counterDir = normalizeVec(subVec(attacker.pos, defender.pos), defender.aimDir);
    defender.aimDir = counterDir;
    const counterMove =
      registry.moves['move_katakuri_kaku_mochi'] ??
      registry.moves[defender.moveSlots[0]?.moveId ?? ''];
    if (counterMove) {
      spawnMeleeArcInstance(defender, counterMove, counterDir, world, registry);
    }
  }
}
