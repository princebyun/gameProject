import { clamp } from '../math/vector2';
import type { GameDataRegistry, StatusKind } from '../types/dataSchemas';
import type { BattleWorldState, UnitRuntimeState } from '../types/battleState';

export function hasStatus(unit: UnitRuntimeState, kind: StatusKind): boolean {
  return unit.statuses.some((s) => s.kind === kind && s.remainingSec > 0);
}

export function isUnitStaggered(unit: UnitRuntimeState): boolean {
  return hasStatus(unit, 'STAGGER') || hasStatus(unit, 'FREEZE');
}

export function isUnitFrozen(unit: UnitRuntimeState): boolean {
  return hasStatus(unit, 'FREEZE');
}

export function isUnitWet(unit: UnitRuntimeState): boolean {
  return hasStatus(unit, 'WET');
}

export function isUnitSkillSealed(unit: UnitRuntimeState): boolean {
  return hasStatus(unit, 'SKILL_SEAL');
}

export function isUnitRooted(unit: UnitRuntimeState): boolean {
  return hasStatus(unit, 'ROOT');
}

export function applyStatus(
  target: UnitRuntimeState,
  kind: StatusKind,
  requestedDurationSec: number,
  sourceUnitId: string,
  world: BattleWorldState,
  registry: GameDataRegistry
): boolean {
  if (!target.isAlive || target.iframeTimer > 0) {
    return false;
  }

  const { status: statusCfg } = registry.balance;

  if (kind === 'STAGGER') {
    const targetTrait = registry.traits[target.traitId];
    const lunarianStaggerImmune =
      Boolean(targetTrait?.lunarianFlame?.enabled) &&
      Boolean(targetTrait?.lunarianFlame?.flameOnStaggerImmune) &&
      target.lunarianFlameOn;

    if (
      lunarianStaggerImmune ||
      target.staggerImmunityTimer > 0 ||
      isUnitStaggered(target)
    ) {
      world.floatingTexts.push({
        id: `ft_immune_${world.tick}_${target.instanceId}`,
        pos: { x: target.pos.x, y: target.pos.y - 28 },
        text: lunarianStaggerImmune ? '🔥 LUNARIAN ARMOR' : 'STAGGER IMMUNE',
        color: lunarianStaggerImmune ? '#fb923c' : '#94a3b8',
        elapsedSec: 0,
        durationSec: registry.balance.presentation.floatingTextDurationSec,
        scale: 0.9
      });
      return false;
    }

    const dur = statusCfg.staggerDurationSec;
    target.statuses.push({
      kind: 'STAGGER',
      remainingSec: dur,
      totalSec: dur,
      sourceUnitId
    });
    // Interrupt windup
    target.windupMoveId = null;
    target.windupTimer = 0;

    world.floatingTexts.push({
      id: `ft_stagger_${world.tick}_${target.instanceId}`,
      pos: { x: target.pos.x, y: target.pos.y - 28 },
      text: `STAGGER (${dur.toFixed(0)}s)`,
      color: '#facc15',
      elapsedSec: 0,
      durationSec: registry.balance.presentation.floatingTextDurationSec,
      scale: 1.1
    });
    return true;
  }

  if (kind === 'WET') {
    const dur = Math.max(1, requestedDurationSec || 8.0);
    const existingWet = target.statuses.find((s) => s.kind === 'WET');
    if (existingWet) {
      existingWet.remainingSec = Math.max(existingWet.remainingSec, dur);
      existingWet.totalSec = Math.max(existingWet.totalSec, dur);
      existingWet.sourceUnitId = sourceUnitId;
    } else {
      target.statuses.push({
        kind: 'WET',
        remainingSec: dur,
        totalSec: dur,
        sourceUnitId
      });
    }
    world.floatingTexts.push({
      id: `ft_wet_${world.tick}_${target.instanceId}`,
      pos: { x: target.pos.x, y: target.pos.y - 30 },
      text: `💧 젖음 (${dur.toFixed(0)}s)`,
      color: '#38bdf8',
      elapsedSec: 0,
      durationSec: 1.0,
      scale: 1.05
    });
    return true;
  }

  if (kind === 'FREEZE') {
    const dur = Math.max(0.5, Math.min(5.0, requestedDurationSec || 3.0));
    const existingFreeze = target.statuses.find((s) => s.kind === 'FREEZE');
    if (existingFreeze) {
      existingFreeze.remainingSec = Math.max(existingFreeze.remainingSec, dur);
      existingFreeze.totalSec = Math.max(existingFreeze.totalSec, dur);
    } else {
      target.statuses.push({
        kind: 'FREEZE',
        remainingSec: dur,
        totalSec: dur,
        sourceUnitId
      });
    }
    target.windupMoveId = null;
    target.windupTimer = 0;
    world.floatingTexts.push({
      id: `ft_freeze_${world.tick}_${target.instanceId}`,
      pos: { x: target.pos.x, y: target.pos.y - 30 },
      text: `❄ 동결 (${dur.toFixed(1)}s)!`,
      color: '#7dd3fc',
      elapsedSec: 0,
      durationSec: 1.05,
      scale: 1.15
    });
    return true;
  }

  // Control statuses: SKILL_SEAL, TAUNT, ROOT (6~20s)
  const duration = clamp(
    requestedDurationSec,
    statusCfg.minControlDurationSec,
    statusCfg.maxControlDurationSec
  );

  const existing = target.statuses.find((s) => s.kind === kind);
  if (existing) {
    existing.remainingSec = Math.max(existing.remainingSec, duration);
    existing.totalSec = Math.max(existing.totalSec, duration);
    existing.sourceUnitId = sourceUnitId;
  } else {
    target.statuses.push({
      kind,
      remainingSec: duration,
      totalSec: duration,
      sourceUnitId
    });
  }

  if (kind === 'TAUNT') {
    target.tauntTargetUnitId = sourceUnitId;
  }

  world.floatingTexts.push({
    id: `ft_status_${world.tick}_${target.instanceId}_${kind}`,
    pos: { x: target.pos.x, y: target.pos.y - 28 },
    text: `${kind} (${duration.toFixed(0)}s)`,
    color: '#c084fc',
    elapsedSec: 0,
    durationSec: registry.balance.presentation.floatingTextDurationSec,
    scale: 1.0
  });

  return true;
}

export function stepUnitStatuses(
  unit: UnitRuntimeState,
  dt: number,
  registry: GameDataRegistry
): void {
  if (unit.staggerImmunityTimer > 0) {
    unit.staggerImmunityTimer = Math.max(0, unit.staggerImmunityTimer - dt);
  }

  for (let i = unit.statuses.length - 1; i >= 0; i--) {
    const st = unit.statuses[i];
    if (!st) continue;
    st.remainingSec -= dt;
    if (st.remainingSec <= 0) {
      unit.statuses.splice(i, 1);
      if (st.kind === 'STAGGER') {
        // Grant 5-second re-application immunity after Stagger expires
        unit.staggerImmunityTimer = registry.balance.status.staggerImmunitySec;
      } else if (st.kind === 'TAUNT') {
        unit.tauntTargetUnitId = null;
      }
    }
  }

  for (let i = unit.statBuffs.length - 1; i >= 0; i--) {
    const buff = unit.statBuffs[i];
    if (!buff) continue;
    buff.remainingSec -= dt;
    if (buff.remainingSec <= 0) {
      unit.statBuffs.splice(i, 1);
    }
  }
}
