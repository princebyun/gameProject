import {
  addVec,
  distVec,
  isCircleIntersectingSector,
  lenVec,
  normalizeVec,
  pointToSegmentDist,
  scaleVec,
  type Vec2
} from '../math/vector2';
import type { GameDataRegistry } from '../types/dataSchemas';
import type { BattleWorldState, UnitRuntimeState } from '../types/battleState';
import { addTeamBondGauge, BOND_JUST_DODGE_GAIN } from '../battle/tagCombo';
import { isUnitRooted, isUnitStaggered } from './statusEngine';
import { triggerTraitHook } from './traitHooks';

export function detectIncomingAttackThreat(
  unit: UnitRuntimeState,
  world: BattleWorldState,
  registry: GameDataRegistry
): boolean {
  const obsLevel = unit.haki?.observation ?? 0;
  // Observation Haki expands Just Dodge timing and threat detection radius
  const justDodgeWindowSec =
    registry.balance.dodge.justDodgeWindowSec * (1 + obsLevel * 0.22);
  const justDodgeProximityPx =
    registry.balance.dodge.justDodgeProximityPx * (1 + obsLevel * 0.15);
  const detectRadius = unit.radiusPx + justDodgeProximityPx;

  // 1. Check enemy projectiles nearby or on collision course within justDodgeWindowSec
  for (const proj of world.projectiles) {
    if (proj.destroyed || proj.team === unit.team) continue;
    const futurePos = addVec(proj.pos, scaleVec(proj.vel, justDodgeWindowSec));
    const dNow = distVec(unit.pos, proj.pos);
    const dFuture = pointToSegmentDist(unit.pos, proj.pos, futurePos);
    if (
      dNow <= detectRadius + proj.radiusPx ||
      dFuture <= unit.radiusPx + proj.radiusPx + 14
    ) {
      return true;
    }
  }

  // 2. Check enemy active beams
  for (const beam of world.beams) {
    if (beam.terminated || beam.team === unit.team) continue;
    const beamEnd = addVec(beam.origin, scaleVec(beam.dir, beam.currentLengthPx));
    const d = pointToSegmentDist(unit.pos, beam.origin, beamEnd);
    if (d <= unit.radiusPx + beam.widthPx * 0.5 + 22) {
      return true;
    }
  }

  // 3. Check enemy active melee arcs
  for (const arc of world.meleeArcs) {
    if (arc.finished || arc.team === unit.team) continue;
    if (
      isCircleIntersectingSector(
        unit.pos,
        unit.radiusPx + 16,
        arc.origin,
        arc.dir,
        arc.radiusPx,
        arc.arcDeg
      )
    ) {
      return true;
    }
  }

  // 4. Check enemy unit in windup whose attack will fire within justDodgeWindowSec
  for (const other of world.units) {
    if (!other.isAlive || !other.isOnField || other.team === unit.team) continue;
    if (
      other.windupMoveId &&
      other.windupTimer > 0 &&
      other.windupTimer <= justDodgeWindowSec + 0.06
    ) {
      const moveDef = registry.moves[other.windupMoveId];
      if (moveDef && distVec(unit.pos, other.pos) <= moveDef.rangePx + unit.radiusPx + 24) {
        return true;
      }
    }
  }

  return false;
}

export function tryExecuteDodge(
  unit: UnitRuntimeState,
  moveVec: Vec2,
  world: BattleWorldState,
  registry: GameDataRegistry
): { dodged: boolean; justDodge: boolean } {
  if (
    !unit.isAlive ||
    !unit.isOnField ||
    unit.dodgeStacks < 1 ||
    unit.dodgeActiveTimer > 0 ||
    unit.clashLockId !== null ||
    isUnitStaggered(unit) ||
    isUnitRooted(unit)
  ) {
    return { dodged: false, justDodge: false };
  }

  const { dodge } = registry.balance;
  const obsLevel = unit.haki?.observation ?? 0;
  unit.dodgeStacks -= 1;
  unit.dodgeActiveTimer = dodge.durationSec;
  unit.iframeTimer = dodge.iframeSec * (1 + obsLevel * 0.1);

  // Cancel any move windup
  unit.windupMoveId = null;
  unit.windupTimer = 0;

  const dir = lenVec(moveVec) > 0.05 ? normalizeVec(moveVec) : normalizeVec(unit.aimDir);
  unit.dodgeDir = dir;

  const isJustDodge = detectIncomingAttackThreat(unit, world, registry);
  if (isJustDodge) {
    unit.justDodgeBuffTimer = dodge.justDodgeBuffDurationSec;
    unit.recentDodgeWhiffTimer = 0;
    world.slowMoTimer = dodge.justDodgeSlowMoSec;
    world.slowMoScale = dodge.justDodgeSlowMoScale;
    addTeamBondGauge(unit.team, BOND_JUST_DODGE_GAIN, world);

    triggerTraitHook('onJustDodge', unit, {}, world, registry);

    const label = obsLevel >= 3 ? 'FUTURE SIGHT DODGE!' : 'JUST DODGE!';
    world.floatingTexts.push({
      id: `ft_jd_${world.tick}_${unit.instanceId}`,
      pos: { x: unit.pos.x, y: unit.pos.y - 32 },
      text: label,
      color: '#38bdf8',
      elapsedSec: 0,
      durationSec: registry.balance.presentation.floatingTextDurationSec,
      scale: 1.25
    });

    world.vfxEvents.push({
      id: `vfx_jd_${world.tick}_${unit.instanceId}`,
      kind: 'JUST_DODGE_RING',
      pos: { x: unit.pos.x, y: unit.pos.y },
      color: '#38bdf8',
      radiusPx: 46,
      elapsedSec: 0,
      durationSec: 0.35
    });
    world.combatLog.push(`[완벽 회피] ${unit.name} ${label} 성공!`);
  } else {
    unit.recentDodgeWhiffTimer = 0.85;
  }

  return { dodged: true, justDodge: isJustDodge };
}

export function stepUnitDodge(
  unit: UnitRuntimeState,
  dt: number,
  registry: GameDataRegistry,
  worldDodgeRechargeMult: number = 1.0
): void {
  const { dodge } = registry.balance;
  const obsLevel = unit.haki?.observation ?? 0;
  const traitMult = registry.traits[unit.traitId]?.dodgeRechargeMultiplier ?? 1.0;
  const endgameMult = 1 + (unit.endgameDodgeRechargeBonus ?? 0);
  const rechargeSpeedMult = Math.max(
    0.2,
    (1 + obsLevel * 0.12) * traitMult * endgameMult * worldDodgeRechargeMult
  );

  if (unit.dodgeActiveTimer > 0) {
    unit.dodgeActiveTimer = Math.max(0, unit.dodgeActiveTimer - dt);
  }
  if (unit.iframeTimer > 0) {
    unit.iframeTimer = Math.max(0, unit.iframeTimer - dt);
  }
  if (unit.justDodgeBuffTimer > 0) {
    unit.justDodgeBuffTimer = Math.max(0, unit.justDodgeBuffTimer - dt);
  }
  if (unit.recentDodgeWhiffTimer > 0) {
    unit.recentDodgeWhiffTimer = Math.max(0, unit.recentDodgeWhiffTimer - dt);
  }

  if (unit.dodgeStacks < unit.maxDodgeStacks) {
    unit.dodgeRechargeTimer += dt * rechargeSpeedMult;
    while (
      unit.dodgeRechargeTimer >= dodge.rechargeSec &&
      unit.dodgeStacks < unit.maxDodgeStacks
    ) {
      unit.dodgeRechargeTimer -= dodge.rechargeSec;
      unit.dodgeStacks += 1;
    }
    if (unit.dodgeStacks >= unit.maxDodgeStacks) {
      unit.dodgeRechargeTimer = 0;
    }
  } else {
    unit.dodgeRechargeTimer = 0;
  }
}
