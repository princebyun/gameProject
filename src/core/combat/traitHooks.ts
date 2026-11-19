import type {
  GameDataRegistry,
  MoveArchetype,
  TraitHookEvent
} from '../types/dataSchemas';
import type { BattleWorldState, UnitRuntimeState } from '../types/battleState';

export interface TraitHookContext {
  moveArchetype?: MoveArchetype;
}

export function getTraitClashMultiplier(
  unit: UnitRuntimeState,
  moveArchetype: MoveArchetype,
  registry: GameDataRegistry
): number {
  const trait = registry.traits[unit.traitId];
  if (!trait) return 1.0;

  let mult = 1.0;
  for (const rule of trait.hooks) {
    if (rule.event !== 'onClash') continue;
    if (
      rule.condition?.moveArchetype &&
      rule.condition.moveArchetype !== moveArchetype
    ) {
      continue;
    }
    if (rule.effect.type === 'CLASH_POWER_MULT') {
      mult *= rule.effect.value;
    }
  }
  return mult;
}

export function triggerTraitHook(
  event: TraitHookEvent,
  unit: UnitRuntimeState,
  context: TraitHookContext,
  world: BattleWorldState,
  registry: GameDataRegistry
): void {
  const trait = registry.traits[unit.traitId];
  if (!trait || !unit.isAlive) return;

  for (const rule of trait.hooks) {
    if (rule.event !== event) continue;

    if (rule.condition) {
      if (rule.condition.weather && world.weather.id !== rule.condition.weather) {
        continue;
      }
      if (
        rule.condition.moveArchetype &&
        context.moveArchetype !== rule.condition.moveArchetype
      ) {
        continue;
      }
      if (
        rule.condition.hpBelowRatio !== undefined &&
        unit.hp / Math.max(1, unit.maxHp) > rule.condition.hpBelowRatio
      ) {
        continue;
      }
    }

    const eff = rule.effect;
    if (eff.type === 'STAT_MOD' && eff.stat) {
      const existing = unit.statBuffs.find((b) => b.stat === eff.stat);
      if (existing) {
        existing.multiplier = eff.value;
        existing.remainingSec = Math.max(existing.remainingSec, eff.durationSec ?? 5);
      } else {
        unit.statBuffs.push({
          id: `${trait.id}_${eff.stat}`,
          stat: eff.stat,
          multiplier: eff.value,
          remainingSec: eff.durationSec ?? 5
        });
      }
    } else if (eff.type === 'HEAL_RATIO') {
      const heal = Math.max(1, Math.round(unit.maxHp * eff.value));
      unit.hp = Math.min(unit.maxHp, unit.hp + heal);
      world.floatingTexts.push({
        id: `ft_trait_${world.tick}_${unit.instanceId}`,
        pos: { x: unit.pos.x, y: unit.pos.y - 24 },
        text: `+${heal}`,
        color: '#4ade80',
        elapsedSec: 0,
        durationSec: registry.balance.presentation.floatingTextDurationSec,
        scale: 1.0
      });
    } else if (eff.type === 'RESTORE_DODGE') {
      unit.dodgeStacks = Math.min(
        unit.maxDodgeStacks,
        unit.dodgeStacks + Math.round(eff.value)
      );
    } else if (eff.type === 'SPAWN_WEATHER' && eff.weatherId) {
      world.weather.id = eff.weatherId;
      world.weather.remainingSec = eff.durationSec ?? 12;
      world.combatLog.push(`[특성: ${trait.name}] 날씨 변화 -> ${eff.weatherId}`);
    }
  }
}
