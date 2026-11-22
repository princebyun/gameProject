import {
  addVec,
  clamp,
  distVec,
  lenVec,
  normalizeVec,
  scaleVec
} from '../math/vector2';
import type { BattleWorldState, UnitRuntimeState } from '../types/battleState';
import type { GameDataRegistry } from '../types/dataSchemas';
import { getUnitById } from './worldLookup';

export function stepActiveAttacksPreClash(
  world: BattleWorldState,
  simDt: number,
  registry: GameDataRegistry
): void {
  for (let i = world.projectiles.length - 1; i >= 0; i--) {
    const proj = world.projectiles[i];
    if (!proj) continue;
    if (proj.destroyed) {
      world.projectiles.splice(i, 1);
      continue;
    }
    proj.prevPos = { x: proj.pos.x, y: proj.pos.y };
    proj.elapsedSec += simDt;

    // Stage 3: Homing projectile steering (e.g. Magellan's Hydra)
    if (proj.homingTurnRateRadPerSec && proj.homingTurnRateRadPerSec > 0) {
      let nearestEnemy: UnitRuntimeState | null = null;
      let nearestDist = Infinity;
      for (const cand of world.units) {
        if (!cand.isAlive || !cand.isOnField || cand.team === proj.team) continue;
        const d = distVec(proj.pos, cand.pos);
        if (d < nearestDist) {
          nearestDist = d;
          nearestEnemy = cand;
        }
      }
      if (nearestEnemy) {
        const speed = lenVec(proj.vel);
        if (speed > 1) {
          const curAngle = Math.atan2(proj.vel.y, proj.vel.x);
          const targetAngle = Math.atan2(
            nearestEnemy.pos.y - proj.pos.y,
            nearestEnemy.pos.x - proj.pos.x
          );
          let diff = targetAngle - curAngle;
          while (diff > Math.PI) diff -= Math.PI * 2;
          while (diff < -Math.PI) diff += Math.PI * 2;
          const maxTurn = proj.homingTurnRateRadPerSec * simDt;
          const nextAngle = curAngle + clamp(diff, -maxTurn, maxTurn);
          proj.vel = {
            x: Math.cos(nextAngle) * speed,
            y: Math.sin(nextAngle) * speed
          };
        }
      }
    }

    const speedScale = proj.isInsideBeam
      ? registry.balance.beam.projectileSlowMultiplier
      : 1.0;
    proj.pos.x += proj.vel.x * simDt * speedScale;
    proj.pos.y += proj.vel.y * simDt * speedScale;

    if (
      proj.elapsedSec >= proj.maxDurationSec ||
      proj.pos.x < -30 ||
      proj.pos.x > world.arenaWidth + 30 ||
      proj.pos.y < -30 ||
      proj.pos.y > world.arenaHeight + 30
    ) {
      world.projectiles.splice(i, 1);
    }
  }

  for (let i = world.beams.length - 1; i >= 0; i--) {
    const beam = world.beams[i];
    if (!beam) continue;
    const owner = getUnitById(world, beam.ownerUnitId);
    if (beam.terminated || !owner || !owner.isAlive || !owner.isOnField) {
      if (owner && owner.activeBeamId === beam.id) {
        owner.activeBeamId = null;
      }
      world.beams.splice(i, 1);
      continue;
    }

    if (!beam.clashingWithBeamId && !beam.guardedByMeleeId) {
      beam.dir = normalizeVec(owner.aimDir, beam.dir);
    }
    beam.origin = addVec(owner.pos, scaleVec(beam.dir, owner.radiusPx + 6));
    beam.elapsedSec += simDt;
    if (beam.elapsedSec >= beam.maxDurationSec) {
      if (owner.activeBeamId === beam.id) {
        owner.activeBeamId = null;
      }
      world.beams.splice(i, 1);
    }
  }

  for (let i = world.meleeArcs.length - 1; i >= 0; i--) {
    const arc = world.meleeArcs[i];
    if (!arc) continue;
    const owner = getUnitById(world, arc.ownerUnitId);
    if (arc.finished || !owner || !owner.isAlive || !owner.isOnField) {
      world.meleeArcs.splice(i, 1);
      continue;
    }
    arc.origin = { x: owner.pos.x, y: owner.pos.y };
    arc.elapsedSec += simDt;
    if (arc.elapsedSec >= arc.totalLingerDurationSec) {
      world.meleeArcs.splice(i, 1);
    }
  }
}

export function pruneFinishedAttacks(world: BattleWorldState): void {
  for (let i = world.projectiles.length - 1; i >= 0; i--) {
    const proj = world.projectiles[i];
    if (proj?.destroyed) {
      world.projectiles.splice(i, 1);
    }
  }
  for (let i = world.beams.length - 1; i >= 0; i--) {
    const beam = world.beams[i];
    if (beam?.terminated) {
      const owner = getUnitById(world, beam.ownerUnitId);
      if (owner && owner.activeBeamId === beam.id) {
        owner.activeBeamId = null;
      }
      world.beams.splice(i, 1);
    }
  }
  for (let i = world.meleeArcs.length - 1; i >= 0; i--) {
    const arc = world.meleeArcs[i];
    if (arc?.finished) {
      world.meleeArcs.splice(i, 1);
    }
  }
}
