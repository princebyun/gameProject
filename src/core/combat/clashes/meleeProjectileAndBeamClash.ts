import {
  addVec,
  angleBetweenDeg,
  clamp,
  distVec,
  isCircleIntersectingSector,
  normalizeVec,
  pointToSegmentDist,
  scaleVec,
  subVec
} from '../../math/vector2';
import type { BattleWorldState } from '../../types/battleState';
import type { GameDataRegistry } from '../../types/dataSchemas';
import { computeDamage, computeEffectiveClashPower } from '../damageCalc';
import { triggerTraitHook } from '../traitHooks';
import { getBeamById, getMeleeArcById, getUnitById } from '../worldLookup';

/**
 * 4. Melee vs Projectile
 */
export function resolveMeleeVsProjectile(
  world: BattleWorldState,
  registry: GameDataRegistry
): void {
  const { melee: meleeCfg } = registry.balance;

  for (const arc of world.meleeArcs) {
    if (arc.finished || !arc.deflectProjectiles) continue;
    const meleeUnit = getUnitById(world, arc.ownerUnitId);
    if (!meleeUnit || !meleeUnit.isAlive) continue;

    for (const proj of world.projectiles) {
      if (proj.destroyed || proj.team === arc.team) continue;

      const hitArc = isCircleIntersectingSector(
        proj.pos,
        proj.radiusPx,
        arc.origin,
        arc.dir,
        arc.radiusPx,
        arc.arcDeg
      );
      if (!hitArc) continue;

      triggerTraitHook('onClash', meleeUnit, { moveArchetype: 'MELEE' }, world, registry);

      const powerMelee = computeEffectiveClashPower(
        arc.currentPower, arc.offensiveStat, arc.element, proj.element,
        arc.traitClashMult, registry.elements, arc.hasConquerorCoating, arc.hasArmamentHaki
      );
      const powerProj = computeEffectiveClashPower(
        proj.currentPower, proj.offensiveStat, proj.element, arc.element,
        proj.traitClashMult, registry.elements, proj.hasConquerorCoating, proj.hasArmamentHaki
      );

      if (powerMelee >= powerProj) {
        proj.destroyed = true;
        arc.currentPower = Math.max(
          8,
          Math.round(arc.currentPower - proj.currentPower * meleeCfg.deflectDurabilityLossRatio)
        );
        world.vfxEvents.push({
          id: `vfx_deflect_${world.tick}_${proj.id}`,
          kind: 'HIT_SPARK',
          pos: { x: proj.pos.x, y: proj.pos.y },
          color: '#2dd4bf',
          radiusPx: 24,
          elapsedSec: 0,
          durationSec: 0.22
        });
        world.floatingTexts.push({
          id: `ft_deflect_${world.tick}_${proj.id}`,
          pos: { x: proj.pos.x, y: proj.pos.y - 18 },
          text: 'DEFLECT!',
          color: '#2dd4bf',
          elapsedSec: 0,
          durationSec: 0.65,
          scale: 0.95
        });
      } else {
        proj.destroyed = true;
        arc.finished = true;

        const projOwner = getUnitById(world, proj.ownerUnitId);
        const moveDef = registry.moves[proj.moveId];
        let residualDamage = Math.max(
          1,
          Math.round((proj.currentPower - arc.currentPower) * meleeCfg.overpowerResidualDamageRatio)
        );
        if (projOwner && moveDef) {
          const { damage } = computeDamage(
            proj.currentPower, projOwner, meleeUnit, moveDef.category, proj.element, world, registry,
            {
              hasArmamentHaki: proj.hasArmamentHaki,
              isInternalDestruction: proj.isInternalDestruction,
              hasConquerorCoating: proj.hasConquerorCoating
            }
          );
          residualDamage = Math.max(1, Math.round(damage * meleeCfg.overpowerResidualDamageRatio));
        }

        meleeUnit.hp = Math.max(0, meleeUnit.hp - residualDamage);
        const kbDir = normalizeVec(proj.vel, scaleVec(arc.dir, -1));
        const effKbSpeed = meleeCfg.overpowerKnockbackSpeed * Math.max(0, 1 - meleeUnit.knockbackResist);
        meleeUnit.knockbackVel = scaleVec(kbDir, effKbSpeed);

        world.floatingTexts.push({
          id: `ft_overpower_${world.tick}_${meleeUnit.instanceId}`,
          pos: { x: meleeUnit.pos.x, y: meleeUnit.pos.y - 26 },
          text: `GUARD CRUSH! -${residualDamage}`,
          color: '#f87171',
          elapsedSec: 0,
          durationSec: 0.85,
          scale: 1.05
        });
        break;
      }
    }
  }
}

/**
 * 5. Melee vs Beam
 */
export function resolveMeleeVsBeam(
  world: BattleWorldState,
  dt: number,
  registry: GameDataRegistry
): void {
  if (world.raidState?.active) {
    return;
  }

  const { melee: meleeCfg } = registry.balance;

  for (const arc of world.meleeArcs) {
    if (arc.finished || arc.clashing || !arc.canGuardBeam) continue;
    const meleeUnit = getUnitById(world, arc.ownerUnitId);
    if (!meleeUnit || !meleeUnit.isAlive) continue;

    for (const beam of world.beams) {
      if (beam.terminated || beam.team === arc.team || beam.clashingWithBeamId || beam.guardedByMeleeId) {
        continue;
      }

      const beamEnd = addVec(beam.origin, scaleVec(beam.dir, beam.currentLengthPx));
      const dToCaster = pointToSegmentDist(meleeUnit.pos, beam.origin, beamEnd);
      const facingAngle = angleBetweenDeg(arc.dir, scaleVec(beam.dir, -1));

      if (dToCaster <= arc.radiusPx + beam.widthPx * 0.5 && facingAngle <= 85) {
        const durationSec = clamp(
          meleeCfg.beamGuardDurationDefaultSec,
          meleeCfg.beamGuardMinSec,
          meleeCfg.beamGuardMaxSec
        );

        arc.clashing = true;
        beam.guardedByMeleeId = arc.id;

        const guardId = `mbguard_${world.tick}_${arc.id}_${beam.id}`;
        meleeUnit.clashLockId = guardId;

        world.meleeBeamGuards.push({
          id: guardId,
          meleeArcId: arc.id,
          meleeUnitId: meleeUnit.instanceId,
          beamId: beam.id,
          beamUnitId: beam.ownerUnitId,
          clashPoint: addVec(meleeUnit.pos, scaleVec(arc.dir, meleeUnit.radiusPx + 8)),
          elapsedSec: 0,
          durationSec,
          grazeTickTimer: 0,
          resolved: false
        });

        triggerTraitHook('onClash', meleeUnit, { moveArchetype: 'MELEE' }, world, registry);
        world.combatLog.push(`[근접 vs 광선] ${meleeUnit.name} 광선 방어 힘겨루기 돌입!`);
        break;
      }
    }
  }

  for (let i = world.meleeBeamGuards.length - 1; i >= 0; i--) {
    const session = world.meleeBeamGuards[i];
    if (!session) continue;
    if (session.resolved) {
      world.meleeBeamGuards.splice(i, 1);
      continue;
    }

    const arc = getMeleeArcById(world, session.meleeArcId);
    const beam = getBeamById(world, session.beamId);
    const meleeUnit = getUnitById(world, session.meleeUnitId);
    const beamUnit = getUnitById(world, session.beamUnitId);

    if (!arc || !beam || !meleeUnit || !meleeUnit.isAlive || beam.terminated) {
      if (meleeUnit && meleeUnit.clashLockId === session.id) meleeUnit.clashLockId = null;
      if (beam && beam.guardedByMeleeId === session.meleeArcId) beam.guardedByMeleeId = null;
      if (arc) arc.clashing = false;
      session.resolved = true;
      world.meleeBeamGuards.splice(i, 1);
      continue;
    }

    arc.elapsedSec = Math.min(arc.elapsedSec, arc.totalLingerDurationSec * 0.5);
    beam.elapsedSec = Math.min(beam.elapsedSec, beam.maxDurationSec * 0.5);
    session.clashPoint = addVec(meleeUnit.pos, scaleVec(arc.dir, meleeUnit.radiusPx + 8));
    beam.currentLengthPx = distVec(beam.origin, session.clashPoint);

    session.elapsedSec += dt;
    session.grazeTickTimer += dt;

    if (session.grazeTickTimer >= beam.tickIntervalSec) {
      session.grazeTickTimer -= beam.tickIntervalSec;
      let fullTickDmg = Math.max(4, Math.round(beam.currentPower * 0.2));
      if (beamUnit) {
        const moveDef = registry.moves[beam.moveId];
        const { damage } = computeDamage(
          beam.currentPower * 0.25, beamUnit, meleeUnit, moveDef?.category ?? 'SPECIAL',
          beam.element, world, registry,
          {
            hasArmamentHaki: beam.hasArmamentHaki,
            isInternalDestruction: beam.isInternalDestruction,
            hasConquerorCoating: beam.hasConquerorCoating
          }
        );
        fullTickDmg = damage;
      }
      const grazeDamage = Math.max(1, Math.round(fullTickDmg * meleeCfg.beamGuardGrazeDamageRatio));
      meleeUnit.hp = Math.max(0, meleeUnit.hp - grazeDamage);

      world.floatingTexts.push({
        id: `ft_graze_${world.tick}_${meleeUnit.instanceId}`,
        pos: { x: meleeUnit.pos.x, y: meleeUnit.pos.y - 22 },
        text: `GUARD -${grazeDamage} (30%)`,
        color: '#fbbf24',
        elapsedSec: 0,
        durationSec: 0.5,
        scale: 0.85
      });
    }

    if (session.elapsedSec >= session.durationSec) {
      session.resolved = true;
      meleeUnit.clashLockId = null;
      arc.clashing = false;

      const powerMelee = computeEffectiveClashPower(
        arc.currentPower, arc.offensiveStat, arc.element, beam.element,
        arc.traitClashMult, registry.elements, arc.hasConquerorCoating, arc.hasArmamentHaki
      );
      const powerBeam = computeEffectiveClashPower(
        beam.currentPower, beam.offensiveStat, beam.element, arc.element,
        beam.traitClashMult, registry.elements, beam.hasConquerorCoating, beam.hasArmamentHaki
      );

      if (powerMelee >= powerBeam) {
        beam.terminated = true;
        beam.guardedByMeleeId = null;
        const dashDir = beamUnit
          ? normalizeVec(subVec(beamUnit.pos, meleeUnit.pos), arc.dir)
          : arc.dir;
        meleeUnit.vel = scaleVec(dashDir, meleeCfg.beamWinDashSpeed);
        meleeUnit.pos = addVec(meleeUnit.pos, scaleVec(dashDir, 36));

        world.vfxEvents.push({
          id: `vfx_bsever_${world.tick}`,
          kind: 'BEAM_BREAK',
          pos: { x: session.clashPoint.x, y: session.clashPoint.y },
          color: '#2dd4bf',
          radiusPx: 42,
          elapsedSec: 0,
          durationSec: 0.35
        });
        world.floatingTexts.push({
          id: `ft_bsever_${world.tick}_${meleeUnit.instanceId}`,
          pos: { x: meleeUnit.pos.x, y: meleeUnit.pos.y - 32 },
          text: 'BEAM SEVER & DASH!',
          color: '#2dd4bf',
          elapsedSec: 0,
          durationSec: 0.95,
          scale: 1.2
        });
        world.combatLog.push(`[근접 vs 광선 승리] ${meleeUnit.name} 광선을 베어 끊고 돌진!`);
      } else {
        arc.finished = true;
        beam.guardedByMeleeId = null;
        beam.currentPower = Math.max(10, Math.round(beam.currentPower * meleeCfg.beamLossWeakenMultiplier));
        beam.dimmed = true;
        beam.currentLengthPx = beam.maxRangePx;
        meleeUnit.knockbackVel = scaleVec(beam.dir, meleeCfg.overpowerKnockbackSpeed * 0.65);

        world.floatingTexts.push({
          id: `ft_bweak_${world.tick}_${beam.id}`,
          pos: { x: session.clashPoint.x, y: session.clashPoint.y - 24 },
          text: 'BEAM WEAKENED!',
          color: '#94a3b8',
          elapsedSec: 0,
          durationSec: 0.85,
          scale: 1.0
        });
        world.combatLog.push(`[근접 vs 광선 열세] 잔여 광선 위력 약화 (흐림 상태 전환)`);
      }

      world.meleeBeamGuards.splice(i, 1);
    }
  }
}
