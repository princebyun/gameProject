import type { SeededPRNG } from '../math/prng';
import {
  addVec,
  distVec,
  normalizeVec,
  pointToSegmentDist,
  scaleVec,
  subVec
} from '../math/vector2';
import { detectIncomingAttackThreat } from '../combat/dodgeSystem';
import { canActivateFormShift } from '../combat/formShiftEngine';
import { isUnitSkillSealed, isUnitStaggered } from '../combat/statusEngine';
import type {
  BattleWorldState,
  UnitInputCommand,
  UnitRuntimeState
} from '../types/battleState';
import type { GameDataRegistry } from '../types/dataSchemas';
import {
  computeAiMovementVec,
  scoreMoveSlotHeuristic,
  selectAiPrimaryTarget
} from './aiTargetScoring';

export function computeAiCommand(
  unit: UnitRuntimeState,
  world: BattleWorldState,
  registry: GameDataRegistry,
  prng: SeededPRNG,
  dt: number
): UnitInputCommand {
  const emptyCmd: UnitInputCommand = {
    unitId: unit.instanceId,
    moveVec: { x: 0, y: 0 },
    aimVec: null,
    castMoveSlotIndex: null,
    dodgePressed: false,
    formShiftPressed: false,
    swapToBenchUnitId: null
  };

  if (!unit.isAlive || !unit.isOnField || unit.isDowned || isUnitStaggered(unit)) {
    return emptyCmd;
  }

  if (world.raidState?.active) {
    if (
      world.raidState.bossUnitId === unit.instanceId &&
      world.raidState.groggyTimer > 0
    ) {
      return emptyCmd;
    }
    if (unit.team === 'ALPHA' && world.raidState.teamRevivesRemaining > 0) {
      const downedAlly = world.units.find(
        (u) =>
          u.team === 'ALPHA' &&
          u.isOnField &&
          u.isAlive &&
          u.isDowned &&
          u.instanceId !== unit.instanceId
      );
      if (downedAlly) {
        const toDowned = subVec(downedAlly.pos, unit.pos);
        const distDowned = distVec(unit.pos, downedAlly.pos);
        return {
          ...emptyCmd,
          moveVec: distDowned > 28 ? normalizeVec(toDowned) : { x: 0, y: 0 },
          aimVec: normalizeVec(toDowned)
        };
      }
    }
  }

  const profile =
    registry.aiProfiles[unit.aiLevel] ??
    registry.aiProfiles[3] ?? {
      level: 3,
      name: 'Default',
      statMultiplier: 1.0,
      reactionDelaySec: 0.22,
      allowRecoveryItems: true,
      recoveryItemCount: 1,
      cooldownTrackingAccuracy: 0.65,
      punishDodgeWhiffWeight: 0.65,
      meleeBeamGuardWeight: 0.6,
      justDodgeChance: 0.35,
      formShiftAggression: 0.7
    };

  const target = selectAiPrimaryTarget(unit, world);
  if (!target) {
    return emptyCmd;
  }

  const { moveVec, dirToTarget, distToTarget } = computeAiMovementVec(
    unit,
    target,
    world,
    registry
  );

  unit.aiReactionTimer = Math.max(0, unit.aiReactionTimer - dt);
  if (unit.aiReactionTimer > 0) {
    return {
      ...emptyCmd,
      moveVec,
      aimVec: dirToTarget
    };
  }

  // 1. Recovery item check
  if (
    profile.allowRecoveryItems &&
    unit.aiRecoveryItemsLeft > 0 &&
    unit.hp / Math.max(1, unit.maxHp) < 0.35
  ) {
    unit.aiRecoveryItemsLeft -= 1;
    const heal = Math.round(unit.maxHp * 0.28);
    unit.hp = Math.min(unit.maxHp, unit.hp + heal);
    unit.aiReactionTimer = profile.reactionDelaySec;
    world.floatingTexts.push({
      id: `ft_aiheal_${world.tick}_${unit.instanceId}`,
      pos: { x: unit.pos.x, y: unit.pos.y - 30 },
      text: `AI NANO-KIT +${heal}`,
      color: '#4ade80',
      elapsedSec: 0,
      durationSec: 0.9,
      scale: 1.05
    });
    world.combatLog.push(`[AI 회복] ${unit.name} 회복 키트 사용 (+${heal} HP)`);
  }

  // 2. Check incoming enemy beam for Melee-vs-Beam active guard
  let incomingEnemyBeam = false;
  for (const beam of world.beams) {
    if (beam.terminated || beam.team === unit.team) continue;
    const beamEnd = addVec(beam.origin, scaleVec(beam.dir, beam.currentLengthPx));
    const d = pointToSegmentDist(unit.pos, beam.origin, beamEnd);
    if (d <= unit.radiusPx + beam.widthPx * 0.5 + 32) {
      incomingEnemyBeam = true;
      break;
    }
  }

  if (incomingEnemyBeam && prng.chance(profile.meleeBeamGuardWeight)) {
    const guardSlotIdx = unit.moveSlots.findIndex((slot) => {
      const m = registry.moves[slot.moveId];
      return (
        m &&
        m.archetype === 'MELEE' &&
        m.meleeSpec?.canGuardBeam &&
        slot.charges > 0 &&
        slot.cooldownTimer <= 0
      );
    });

    if (guardSlotIdx >= 0) {
      unit.aiReactionTimer = profile.reactionDelaySec;
      return {
        ...emptyCmd,
        moveVec: dirToTarget,
        aimVec: dirToTarget,
        castMoveSlotIndex: guardSlotIdx
      };
    }
  }

  // 3. Check incoming attack threat -> Just Dodge attempt
  if (
    unit.dodgeStacks >= 1 &&
    detectIncomingAttackThreat(unit, world, registry) &&
    prng.chance(profile.justDodgeChance)
  ) {
    unit.aiReactionTimer = profile.reactionDelaySec;
    const perpDodge = { x: -dirToTarget.y, y: dirToTarget.x };
    return {
      ...emptyCmd,
      moveVec: perpDodge,
      aimVec: dirToTarget,
      dodgePressed: true
    };
  }

  // 4. Form Shift (Awakening / Overdrive / Zoan Hybrid) activation check
  const wantsHybridStance =
    (unit.aiBehaviorId === 'blade_storm' ||
      unit.aiBehaviorId === 'lunarian_switcher') &&
    unit.stanceFormIds.length > 0 &&
    unit.currentStanceRole === 'BASE';
  if (
    wantsHybridStance ||
    (canActivateFormShift(unit, registry).allowed &&
      (unit.hp / Math.max(1, unit.maxHp) <= 0.78 || distToTarget <= 300) &&
      prng.chance(profile.formShiftAggression * 0.35))
  ) {
    unit.aiReactionTimer = profile.reactionDelaySec;
    return {
      ...emptyCmd,
      moveVec,
      aimVec: dirToTarget,
      formShiftPressed: true
    };
  }

  // 5. Utility score evaluation across available move slots
  const opponentInDodgeWhiff = target.recentDodgeWhiffTimer > 0;
  const opponentAllSkillsOnCooldown =
    prng.chance(profile.cooldownTrackingAccuracy) &&
    target.moveSlots.every((s) => s.cooldownTimer > 0.4 || s.charges === 0);

  let bestSlot: number | null = null;
  let bestScore = 15;
  const sealed = isUnitSkillSealed(unit);

  for (let i = 0; i < unit.moveSlots.length; i++) {
    const slot = unit.moveSlots[i];
    if (!slot || slot.charges <= 0 || slot.cooldownTimer > 0) continue;

    const m = registry.moves[slot.moveId];
    if (!m) continue;
    if (sealed && m.category === 'SPECIAL') continue;

    let score = scoreMoveSlotHeuristic(
      unit,
      target,
      m,
      distToTarget,
      world,
      registry,
      profile,
      opponentInDodgeWhiff,
      opponentAllSkillsOnCooldown
    );
    score += prng.nextRange(-5, 5);

    if (score > bestScore) {
      bestScore = score;
      bestSlot = i;
    }
  }

  if (bestSlot !== null) {
    unit.aiReactionTimer = profile.reactionDelaySec;
  }

  return {
    ...emptyCmd,
    moveVec,
    aimVec: dirToTarget,
    castMoveSlotIndex: bestSlot
  };
}
