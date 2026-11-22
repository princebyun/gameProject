import {
  addVec,
  angleBetweenDeg,
  clamp,
  distVec,
  lerpVec,
  normalizeVec,
  pointToSegmentDist,
  scaleVec,
  segmentsDistance,
  subVec
} from '../../math/vector2';
import type { BattleWorldState } from '../../types/battleState';
import type { GameDataRegistry } from '../../types/dataSchemas';
import { computeDamage, computeEffectiveClashPower } from '../damageCalc';
import { applyStatus } from '../statusEngine';
import { triggerTraitHook } from '../traitHooks';
import { getBeamById, getUnitById } from '../worldLookup';

/**
 * 2. Beam vs Beam
 */
export function resolveBeamVsBeam(
  world: BattleWorldState,
  dt: number,
  registry: GameDataRegistry
): void {
  const { beam: beamCfg } = registry.balance;

  for (let i = 0; i < world.beams.length; i++) {
    const a = world.beams[i];
    if (!a || a.terminated || a.clashingWithBeamId || a.guardedByMeleeId) continue;

    for (let j = i + 1; j < world.beams.length; j++) {
      const b = world.beams[j];
      if (!b || b.terminated || b.clashingWithBeamId || b.guardedByMeleeId || a.team === b.team) {
        continue;
      }

      const oppositionAngle = angleBetweenDeg(a.dir, scaleVec(b.dir, -1));
      if (oppositionAngle >= beamCfg.clashAngleBreakDeg) {
        continue;
      }

      const aEnd = addVec(a.origin, scaleVec(a.dir, a.maxRangePx));
      const bEnd = addVec(b.origin, scaleVec(b.dir, b.maxRangePx));
      const segInfo = segmentsDistance(a.origin, aEnd, b.origin, bEnd);

      if (segInfo.distance <= (a.widthPx + b.widthPx) * 0.65) {
        const clashId = `bclash_${world.tick}_${a.id}_${b.id}`;
        a.clashingWithBeamId = b.id;
        b.clashingWithBeamId = a.id;

        const mid = lerpVec(a.origin, b.origin, 0.5);
        world.beamClashes.push({
          id: clashId,
          beamAId: a.id,
          beamBId: b.id,
          clashPoint: mid,
          clashRatio: 0.5,
          elapsedSec: 0,
          maxTieSec: beamCfg.clashTieTimeoutSec,
          resolved: false
        });

        const unitA = getUnitById(world, a.ownerUnitId);
        const unitB = getUnitById(world, b.ownerUnitId);
        if (unitA) triggerTraitHook('onClash', unitA, { moveArchetype: 'BEAM' }, world, registry);
        if (unitB) triggerTraitHook('onClash', unitB, { moveArchetype: 'BEAM' }, world, registry);

        world.hitstopTimer = Math.max(
          world.hitstopTimer,
          registry.balance.presentation.clashHitstopSec
        );
        world.combatLog.push(`[광선 맞대결] 힘겨루기 개시!`);
      }
    }
  }

  for (let i = world.beamClashes.length - 1; i >= 0; i--) {
    const session = world.beamClashes[i];
    if (!session) continue;
    if (session.resolved) {
      world.beamClashes.splice(i, 1);
      continue;
    }

    const beamA = getBeamById(world, session.beamAId);
    const beamB = getBeamById(world, session.beamBId);

    if (!beamA || !beamB || beamA.terminated || beamB.terminated) {
      if (beamA) beamA.clashingWithBeamId = null;
      if (beamB) beamB.clashingWithBeamId = null;
      session.resolved = true;
      world.beamClashes.splice(i, 1);
      continue;
    }

    beamA.elapsedSec = Math.min(beamA.elapsedSec, beamA.maxDurationSec * 0.5);
    beamB.elapsedSec = Math.min(beamB.elapsedSec, beamB.maxDurationSec * 0.5);

    const axisAB = normalizeVec(subVec(beamB.origin, beamA.origin));
    const angleA = angleBetweenDeg(beamA.dir, axisAB);
    const angleB = angleBetweenDeg(beamB.dir, scaleVec(axisAB, -1));
    const oppAngle = angleBetweenDeg(beamA.dir, scaleVec(beamB.dir, -1));

    if (
      angleA >= beamCfg.clashAngleBreakDeg ||
      angleB >= beamCfg.clashAngleBreakDeg ||
      oppAngle >= beamCfg.clashAngleBreakDeg
    ) {
      beamA.clashingWithBeamId = null;
      beamB.clashingWithBeamId = null;
      beamA.currentLengthPx = beamA.maxRangePx;
      beamB.currentLengthPx = beamB.maxRangePx;
      session.resolved = true;
      world.beamClashes.splice(i, 1);
      world.combatLog.push(`[광선 맞대결 해제] 조준 각도 30도 이상 이탈`);
      continue;
    }

    session.elapsedSec += dt;

    const powerA = computeEffectiveClashPower(
      beamA.currentPower,
      beamA.offensiveStat,
      beamA.element,
      beamB.element,
      beamA.traitClashMult,
      registry.elements,
      beamA.hasConquerorCoating,
      beamA.hasArmamentHaki
    );
    const powerB = computeEffectiveClashPower(
      beamB.currentPower,
      beamB.offensiveStat,
      beamB.element,
      beamA.element,
      beamB.traitClashMult,
      registry.elements,
      beamB.hasConquerorCoating,
      beamB.hasArmamentHaki
    );

    const advantage = (powerA - powerB) / Math.max(1, powerA + powerB);
    const deltaRatio = advantage * beamCfg.clashPushRatePerRatio * dt;
    session.clashRatio = clamp(session.clashRatio + deltaRatio, 0, 1);
    session.clashPoint = lerpVec(beamA.origin, beamB.origin, session.clashRatio);

    beamA.currentLengthPx = distVec(beamA.origin, session.clashPoint);
    beamB.currentLengthPx = distVec(beamB.origin, session.clashPoint);

    if (session.clashRatio >= 1.0) {
      beamB.terminated = true;
      beamA.clashingWithBeamId = null;
      beamA.currentLengthPx = beamA.maxRangePx;
      session.resolved = true;

      const unitA = getUnitById(world, beamA.ownerUnitId);
      const unitB = getUnitById(world, beamB.ownerUnitId);
      if (unitA && unitB && unitB.isAlive) {
        const moveDef = registry.moves[beamA.moveId];
        const { damage } = computeDamage(
          beamA.currentPower,
          unitA,
          unitB,
          moveDef?.category ?? 'SPECIAL',
          beamA.element,
          world,
          registry,
          {
            hasArmamentHaki: beamA.hasArmamentHaki,
            isInternalDestruction: beamA.isInternalDestruction,
            hasConquerorCoating: beamA.hasConquerorCoating
          }
        );
        unitB.hp = Math.max(0, unitB.hp - damage);
        applyStatus(
          unitB,
          'STAGGER',
          registry.balance.status.staggerDurationSec,
          unitA.instanceId,
          world,
          registry
        );
        world.floatingTexts.push({
          id: `ft_bwin_${world.tick}_${unitB.instanceId}`,
          pos: { x: unitB.pos.x, y: unitB.pos.y - 32 },
          text: `BEAM BREAK! -${damage}`,
          color: '#f97316',
          elapsedSec: 0,
          durationSec: 1.0,
          scale: 1.25
        });
      }
      world.beamClashes.splice(i, 1);
    } else if (session.clashRatio <= 0.0) {
      beamA.terminated = true;
      beamB.clashingWithBeamId = null;
      beamB.currentLengthPx = beamB.maxRangePx;
      session.resolved = true;

      const unitA = getUnitById(world, beamA.ownerUnitId);
      const unitB = getUnitById(world, beamB.ownerUnitId);
      if (unitA && unitB && unitA.isAlive) {
        const moveDef = registry.moves[beamB.moveId];
        const { damage } = computeDamage(
          beamB.currentPower,
          unitB,
          unitA,
          moveDef?.category ?? 'SPECIAL',
          beamB.element,
          world,
          registry,
          {
            hasArmamentHaki: beamB.hasArmamentHaki,
            isInternalDestruction: beamB.isInternalDestruction,
            hasConquerorCoating: beamB.hasConquerorCoating
          }
        );
        unitA.hp = Math.max(0, unitA.hp - damage);
        applyStatus(
          unitA,
          'STAGGER',
          registry.balance.status.staggerDurationSec,
          unitB.instanceId,
          world,
          registry
        );
        world.floatingTexts.push({
          id: `ft_bwin_${world.tick}_${unitA.instanceId}`,
          pos: { x: unitA.pos.x, y: unitA.pos.y - 32 },
          text: `BEAM BREAK! -${damage}`,
          color: '#f97316',
          elapsedSec: 0,
          durationSec: 1.0,
          scale: 1.25
        });
      }
      world.beamClashes.splice(i, 1);
    } else if (session.elapsedSec >= session.maxTieSec) {
      beamA.terminated = true;
      beamB.terminated = true;
      beamA.clashingWithBeamId = null;
      beamB.clashingWithBeamId = null;
      session.resolved = true;

      world.vfxEvents.push({
        id: `vfx_bdraw_${world.tick}`,
        kind: 'CLASH_SHOCKWAVE',
        pos: { x: session.clashPoint.x, y: session.clashPoint.y },
        color: '#e2e8f0',
        radiusPx: 48,
        elapsedSec: 0,
        durationSec: 0.35
      });
      world.floatingTexts.push({
        id: `ft_bdraw_${world.tick}`,
        pos: { x: session.clashPoint.x, y: session.clashPoint.y - 20 },
        text: 'BEAM CLASH DRAW!',
        color: '#e2e8f0',
        elapsedSec: 0,
        durationSec: 0.9,
        scale: 1.15
      });
      world.combatLog.push(`[광선 맞대결 무승부] 2.5초 경과로 양측 광선 상쇄 소멸`);
      world.beamClashes.splice(i, 1);
    }
  }
}

/**
 * 3. Beam vs Projectile
 */
export function resolveBeamVsProjectile(
  world: BattleWorldState,
  dt: number,
  registry: GameDataRegistry
): void {
  const { beam: beamCfg } = registry.balance;

  for (const proj of world.projectiles) {
    if (proj.destroyed) continue;
    proj.isInsideBeam = false;

    for (const beam of world.beams) {
      if (beam.terminated || beam.team === proj.team) continue;

      const beamEnd = addVec(beam.origin, scaleVec(beam.dir, beam.currentLengthPx));
      const d = pointToSegmentDist(proj.pos, beam.origin, beamEnd);
      if (d > proj.radiusPx + beam.widthPx * 0.5) continue;

      const powerProj = computeEffectiveClashPower(
        proj.currentPower,
        proj.offensiveStat,
        proj.element,
        beam.element,
        proj.traitClashMult,
        registry.elements,
        proj.hasConquerorCoating,
        proj.hasArmamentHaki
      );
      const powerBeam = computeEffectiveClashPower(
        beam.currentPower,
        beam.offensiveStat,
        beam.element,
        proj.element,
        beam.traitClashMult,
        registry.elements,
        beam.hasConquerorCoating,
        beam.hasArmamentHaki
      );

      if (powerProj >= powerBeam * beamCfg.projectilePierceRatioThreshold) {
        beam.terminated = true;
        proj.currentPower = Math.max(10, Math.round(proj.currentPower * 0.65));
        world.floatingTexts.push({
          id: `ft_bpierce_${world.tick}_${proj.id}`,
          pos: { x: proj.pos.x, y: proj.pos.y - 20 },
          text: 'BEAM SHATTER!',
          color: '#facc15',
          elapsedSec: 0,
          durationSec: 0.85,
          scale: 1.1
        });
        world.combatLog.push(`[맞대결] 고위력 투사체가 광선을 돌파·차단!`);
      } else {
        proj.isInsideBeam = true;
        proj.currentPower -= beamCfg.projectileDecayPerSec * dt;
        if (proj.currentPower <= 0) {
          proj.currentPower = 0;
          proj.destroyed = true;
          world.vfxEvents.push({
            id: `vfx_bvap_${world.tick}_${proj.id}`,
            kind: 'HIT_SPARK',
            pos: { x: proj.pos.x, y: proj.pos.y },
            color: '#38bdf8',
            radiusPx: 18,
            elapsedSec: 0,
            durationSec: 0.2
          });
          break;
        }
      }
    }
  }
}
