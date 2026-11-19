import {
  addVec,
  angleBetweenDeg,
  clamp,
  distVec,
  isCircleIntersectingSector,
  lerpVec,
  normalizeVec,
  pointToSegmentDist,
  scaleVec,
  segmentsDistance,
  subVec
} from '../math/vector2';
import type { GameDataRegistry } from '../types/dataSchemas';
import type {
  ActiveProjectile,
  BattleWorldState,
  UnitRuntimeState
} from '../types/battleState';
import { computeDamage, computeEffectiveClashPower } from './damageCalc';
import { applyStatus } from './statusEngine';
import { triggerTraitHook } from './traitHooks';

function findUnit(world: BattleWorldState, unitId: string): UnitRuntimeState | undefined {
  return world.units.find((u) => u.instanceId === unitId);
}

function isProjectileInParabolicApex(proj: ActiveProjectile, registry: GameDataRegistry): boolean {
  if (!proj.bypassGroundCollision || proj.pattern !== 'PARABOLIC') {
    return false;
  }
  const progress = proj.elapsedSec / Math.max(0.01, proj.maxDurationSec);
  const { parabolicApexPassRatioStart, parabolicApexPassRatioEnd } = registry.balance.projectile;
  return progress >= parabolicApexPassRatioStart && progress <= parabolicApexPassRatioEnd;
}

/**
 * 1. Projectile vs Projectile (plus Gear 5 Rubberized Bounce Field reflection)
 */
export function resolveProjectileVsProjectile(
  world: BattleWorldState,
  registry: GameDataRegistry
): void {
  const projs = world.projectiles;
  const cancelThreshold = registry.balance.projectile.mutualCancelRatioThreshold;

  // Gear 5 Environment Awakening: Rubber Bounce Zone reflects non-conqueror enemy projectiles once
  if (
    world.environmentField.kind === 'RUBBER_BOUNCE_ZONE' &&
    world.environmentField.remainingSec > 0 &&
    world.environmentField.team
  ) {
    const owner = world.units.find(
      (u) => u.instanceId === world.environmentField.ownerUnitId
    );
    if (owner && owner.isAlive) {
      for (const p of projs) {
        if (
          p.destroyed ||
          p.bouncedByRubberFloor ||
          p.team === world.environmentField.team ||
          p.hasConquerorCoating
        ) {
          continue;
        }
        if (distVec(p.pos, owner.pos) <= 95) {
          p.bouncedByRubberFloor = true;
          p.team = owner.team;
          p.ownerUnitId = owner.instanceId;
          p.vel = scaleVec(p.vel, -1);
          world.floatingTexts.push({
            id: `ft_rub_bounce_${world.tick}_${p.id}`,
            pos: { x: p.pos.x, y: p.pos.y - 18 },
            text: 'RUBBER BOUNCE!',
            color: '#f8fafc',
            elapsedSec: 0,
            durationSec: 0.7,
            scale: 1.0
          });
        }
      }
    }
  }

  for (let i = 0; i < projs.length; i++) {
    const a = projs[i];
    if (a.destroyed) continue;

    for (let j = i + 1; j < projs.length; j++) {
      const b = projs[j];
      if (b.destroyed || a.team === b.team) continue;

      // Parabolic apex bypass exception
      const aHigh = isProjectileInParabolicApex(a, registry);
      const bHigh = isProjectileInParabolicApex(b, registry);
      if (aHigh !== bHigh) {
        continue;
      }

      const d = distVec(a.pos, b.pos);
      if (d > a.radiusPx + b.radiusPx) continue;

      const unitA = findUnit(world, a.ownerUnitId);
      const unitB = findUnit(world, b.ownerUnitId);
      if (unitA) triggerTraitHook('onClash', unitA, { moveArchetype: 'PROJECTILE' }, world, registry);
      if (unitB) triggerTraitHook('onClash', unitB, { moveArchetype: 'PROJECTILE' }, world, registry);

      const powerA = computeEffectiveClashPower(
        a.currentPower,
        a.offensiveStat,
        a.element,
        b.element,
        a.traitClashMult,
        registry.elements,
        a.hasConquerorCoating,
        a.hasArmamentHaki
      );
      const powerB = computeEffectiveClashPower(
        b.currentPower,
        b.offensiveStat,
        b.element,
        a.element,
        b.traitClashMult,
        registry.elements,
        b.hasConquerorCoating,
        b.hasArmamentHaki
      );

      const maxP = Math.max(1, powerA, powerB);
      const diffRatio = Math.abs(powerA - powerB) / maxP;
      const mid = lerpVec(a.pos, b.pos, 0.5);

      world.vfxEvents.push({
        id: `vfx_pclash_${world.tick}_${a.id}_${b.id}`,
        kind:
          a.hasConquerorCoating || b.hasConquerorCoating
            ? 'CONQUEROR_LIGHTNING'
            : 'CLASH_SHOCKWAVE',
        pos: mid,
        color: a.hasConquerorCoating || b.hasConquerorCoating ? '#ef4444' : '#facc15',
        radiusPx: 28,
        elapsedSec: 0,
        durationSec: 0.25
      });

      if (diffRatio <= cancelThreshold) {
        a.destroyed = true;
        b.destroyed = true;
        world.floatingTexts.push({
          id: `ft_pcancel_${world.tick}_${a.id}`,
          pos: mid,
          text: 'OFFSET!',
          color: '#fde047',
          elapsedSec: 0,
          durationSec: 0.65,
          scale: 0.95
        });
      } else if (powerA > powerB) {
        b.destroyed = true;
        const residualRatio = (powerA - powerB) / powerA;
        a.currentPower = Math.max(5, Math.round(a.currentPower * residualRatio));
      } else {
        a.destroyed = true;
        const residualRatio = (powerB - powerA) / powerB;
        b.currentPower = Math.max(5, Math.round(b.currentPower * residualRatio));
      }

      if (a.destroyed) break;
    }
  }
}

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
    if (a.terminated || a.clashingWithBeamId || a.guardedByMeleeId) continue;

    for (let j = i + 1; j < world.beams.length; j++) {
      const b = world.beams[j];
      if (b.terminated || b.clashingWithBeamId || b.guardedByMeleeId || a.team === b.team) {
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

        const unitA = findUnit(world, a.ownerUnitId);
        const unitB = findUnit(world, b.ownerUnitId);
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
    if (session.resolved) {
      world.beamClashes.splice(i, 1);
      continue;
    }

    const beamA = world.beams.find((b) => b.id === session.beamAId);
    const beamB = world.beams.find((b) => b.id === session.beamBId);

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

      const unitA = findUnit(world, beamA.ownerUnitId);
      const unitB = findUnit(world, beamB.ownerUnitId);
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

      const unitA = findUnit(world, beamA.ownerUnitId);
      const unitB = findUnit(world, beamB.ownerUnitId);
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
    const meleeUnit = findUnit(world, arc.ownerUnitId);
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
        arc.currentPower,
        arc.offensiveStat,
        arc.element,
        proj.element,
        arc.traitClashMult,
        registry.elements,
        arc.hasConquerorCoating,
        arc.hasArmamentHaki
      );
      const powerProj = computeEffectiveClashPower(
        proj.currentPower,
        proj.offensiveStat,
        proj.element,
        arc.element,
        proj.traitClashMult,
        registry.elements,
        proj.hasConquerorCoating,
        proj.hasArmamentHaki
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

        const projOwner = findUnit(world, proj.ownerUnitId);
        const moveDef = registry.moves[proj.moveId];
        let residualDamage = Math.max(
          1,
          Math.round((proj.currentPower - arc.currentPower) * meleeCfg.overpowerResidualDamageRatio)
        );
        if (projOwner && moveDef) {
          const { damage } = computeDamage(
            proj.currentPower,
            projOwner,
            meleeUnit,
            moveDef.category,
            proj.element,
            world,
            registry,
            {
              hasArmamentHaki: proj.hasArmamentHaki,
              isInternalDestruction: proj.isInternalDestruction,
              hasConquerorCoating: proj.hasConquerorCoating
            }
          );
          residualDamage = Math.max(
            1,
            Math.round(damage * meleeCfg.overpowerResidualDamageRatio)
          );
        }

        meleeUnit.hp = Math.max(0, meleeUnit.hp - residualDamage);
        const kbDir = normalizeVec(proj.vel, scaleVec(arc.dir, -1));
        const effKbSpeed =
          meleeCfg.overpowerKnockbackSpeed *
          Math.max(0, 1 - meleeUnit.knockbackResist);
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
  const { melee: meleeCfg } = registry.balance;

  for (const arc of world.meleeArcs) {
    if (arc.finished || arc.clashing || !arc.canGuardBeam) continue;
    const meleeUnit = findUnit(world, arc.ownerUnitId);
    if (!meleeUnit || !meleeUnit.isAlive) continue;

    for (const beam of world.beams) {
      if (
        beam.terminated ||
        beam.team === arc.team ||
        beam.clashingWithBeamId ||
        beam.guardedByMeleeId
      ) {
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
    if (session.resolved) {
      world.meleeBeamGuards.splice(i, 1);
      continue;
    }

    const arc = world.meleeArcs.find((a) => a.id === session.meleeArcId);
    const beam = world.beams.find((b) => b.id === session.beamId);
    const meleeUnit = findUnit(world, session.meleeUnitId);
    const beamUnit = findUnit(world, session.beamUnitId);

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
          beam.currentPower * 0.25,
          beamUnit,
          meleeUnit,
          moveDef?.category ?? 'SPECIAL',
          beam.element,
          world,
          registry,
          {
            hasArmamentHaki: beam.hasArmamentHaki,
            isInternalDestruction: beam.isInternalDestruction,
            hasConquerorCoating: beam.hasConquerorCoating
          }
        );
        fullTickDmg = damage;
      }
      const grazeDamage = Math.max(
        1,
        Math.round(fullTickDmg * meleeCfg.beamGuardGrazeDamageRatio)
      );
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
        arc.currentPower,
        arc.offensiveStat,
        arc.element,
        beam.element,
        arc.traitClashMult,
        registry.elements,
        arc.hasConquerorCoating,
        arc.hasArmamentHaki
      );
      const powerBeam = computeEffectiveClashPower(
        beam.currentPower,
        beam.offensiveStat,
        beam.element,
        arc.element,
        beam.traitClashMult,
        registry.elements,
        beam.hasConquerorCoating,
        beam.hasArmamentHaki
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
        beam.currentPower = Math.max(
          10,
          Math.round(beam.currentPower * meleeCfg.beamLossWeakenMultiplier)
        );
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

/**
 * 6. Melee vs Melee (including Conqueror's Haki Lv3 Non-Contact Sky-Splitting Clash)
 */
export function resolveMeleeVsMelee(
  world: BattleWorldState,
  dt: number,
  registry: GameDataRegistry
): void {
  const { melee: meleeCfg } = registry.balance;

  for (let i = 0; i < world.meleeArcs.length; i++) {
    const a = world.meleeArcs[i];
    if (a.finished || a.clashing) continue;

    for (let j = i + 1; j < world.meleeArcs.length; j++) {
      const b = world.meleeArcs[j];
      if (b.finished || b.clashing || a.team === b.team) continue;

      const d = distVec(a.origin, b.origin);
      // Conqueror's Haki Lv3 triggers non-contact clash with slightly wider gap
      const nonContactBonus =
        a.hasConquerorCoating || b.hasConquerorCoating ? 26 : 0;

      if (d <= a.radiusPx + b.radiusPx + nonContactBonus) {
        const unitA = findUnit(world, a.ownerUnitId);
        const unitB = findUnit(world, b.ownerUnitId);
        if (!unitA || !unitB || !unitA.isAlive || !unitB.isAlive) continue;

        const clashId = `mclash_${world.tick}_${a.id}_${b.id}`;
        a.clashing = true;
        b.clashing = true;
        unitA.clashLockId = clashId;
        unitB.clashLockId = clashId;

        triggerTraitHook('onClash', unitA, { moveArchetype: 'MELEE' }, world, registry);
        triggerTraitHook('onClash', unitB, { moveArchetype: 'MELEE' }, world, registry);

        const isSkySplit = Boolean(
          a.hasConquerorCoating || b.hasConquerorCoating
        );
        const mid = lerpVec(unitA.pos, unitB.pos, 0.5);

        world.meleeClashes.push({
          id: clashId,
          meleeAId: a.id,
          unitAId: unitA.instanceId,
          meleeBId: b.id,
          unitBId: unitB.instanceId,
          clashPoint: mid,
          dominanceRatio: 0.5,
          elapsedSec: 0,
          maxDurationSec: meleeCfg.meleeClashMaxSec,
          isConquerorSkySplit: isSkySplit,
          resolved: false
        });

        if (isSkySplit) {
          world.vfxEvents.push({
            id: `vfx_skysplit_${world.tick}`,
            kind: 'SKY_SPLIT_SHOCKWAVE',
            pos: mid,
            color: '#dc2626',
            radiusPx: 92,
            elapsedSec: 0,
            durationSec: 0.65
          });
          world.floatingTexts.push({
            id: `ft_skysplit_${world.tick}`,
            pos: { x: mid.x, y: mid.y - 38 },
            text: '⚡ CONQUEROR SKY SPLIT! ⚡',
            color: '#ef4444',
            elapsedSec: 0,
            durationSec: 1.15,
            scale: 1.3
          });
          world.screenShakeTimer = 0.25;
          world.screenShakeMagnitude = 6.5;
          world.combatLog.push(
            `[패왕색 휘감기 충돌] ${unitA.name} vs ${unitB.name} 비접촉 하늘 가르기 충격파!`
          );
        } else {
          world.combatLog.push(`[근접 맞대결] ${unitA.name} vs ${unitB.name} 검격 충돌!`);
        }

        world.hitstopTimer = Math.max(
          world.hitstopTimer,
          registry.balance.presentation.clashHitstopSec
        );
        break;
      }
    }
  }

  for (let i = world.meleeClashes.length - 1; i >= 0; i--) {
    const session = world.meleeClashes[i];
    if (session.resolved) {
      world.meleeClashes.splice(i, 1);
      continue;
    }

    const arcA = world.meleeArcs.find((a) => a.id === session.meleeAId);
    const arcB = world.meleeArcs.find((b) => b.id === session.meleeBId);
    const unitA = findUnit(world, session.unitAId);
    const unitB = findUnit(world, session.unitBId);

    if (!arcA || !arcB || !unitA || !unitB || !unitA.isAlive || !unitB.isAlive) {
      if (unitA && unitA.clashLockId === session.id) unitA.clashLockId = null;
      if (unitB && unitB.clashLockId === session.id) unitB.clashLockId = null;
      if (arcA) arcA.clashing = false;
      if (arcB) arcB.clashing = false;
      session.resolved = true;
      world.meleeClashes.splice(i, 1);
      continue;
    }

    arcA.elapsedSec = Math.min(arcA.elapsedSec, arcA.totalLingerDurationSec * 0.5);
    arcB.elapsedSec = Math.min(arcB.elapsedSec, arcB.totalLingerDurationSec * 0.5);

    session.elapsedSec += dt;

    const powerA = computeEffectiveClashPower(
      arcA.currentPower,
      arcA.offensiveStat,
      arcA.element,
      arcB.element,
      arcA.traitClashMult,
      registry.elements,
      arcA.hasConquerorCoating,
      arcA.hasArmamentHaki
    );
    const powerB = computeEffectiveClashPower(
      arcB.currentPower,
      arcB.offensiveStat,
      arcB.element,
      arcA.element,
      arcB.traitClashMult,
      registry.elements,
      arcB.hasConquerorCoating,
      arcB.hasArmamentHaki
    );

    const diff = (powerA - powerB) / Math.max(1, powerA + powerB);
    const pushRate = session.isConquerorSkySplit
      ? meleeCfg.meleeClashPushRate * 1.35
      : meleeCfg.meleeClashPushRate;
    session.dominanceRatio = clamp(session.dominanceRatio + diff * pushRate * dt, 0, 1);

    const timedOut = session.elapsedSec >= session.maxDurationSec;
    if (session.dominanceRatio >= 1.0 || session.dominanceRatio <= 0.0 || timedOut) {
      session.resolved = true;
      unitA.clashLockId = null;
      unitB.clashLockId = null;
      arcA.finished = true;
      arcB.finished = true;

      if (Math.abs(session.dominanceRatio - 0.5) < 0.03) {
        const dirAB = normalizeVec(subVec(unitB.pos, unitA.pos));
        const pushSpeed = session.isConquerorSkySplit ? 240 : 160;
        unitA.knockbackVel = scaleVec(
          dirAB,
          -pushSpeed * Math.max(0, 1 - unitA.knockbackResist)
        );
        unitB.knockbackVel = scaleVec(
          dirAB,
          pushSpeed * Math.max(0, 1 - unitB.knockbackResist)
        );
        world.floatingTexts.push({
          id: `ft_mdraw_${world.tick}`,
          pos: { x: session.clashPoint.x, y: session.clashPoint.y - 24 },
          text: session.isConquerorSkySplit
            ? 'SKY SPLIT SHOCKWAVE DRAW!'
            : 'MELEE CLASH DRAW!',
          color: '#e2e8f0',
          elapsedSec: 0,
          durationSec: 0.85,
          scale: 1.1
        });
      } else {
        const aWins = session.dominanceRatio > 0.5;
        const winner = aWins ? unitA : unitB;
        const loser = aWins ? unitB : unitA;
        const winArc = aWins ? arcA : arcB;

        const moveDef = registry.moves[winArc.moveId];
        const { damage } = computeDamage(
          winArc.currentPower,
          winner,
          loser,
          moveDef?.category ?? 'PHYSICAL',
          winArc.element,
          world,
          registry,
          {
            hasArmamentHaki: winArc.hasArmamentHaki,
            isInternalDestruction: winArc.isInternalDestruction,
            hasConquerorCoating: winArc.hasConquerorCoating
          }
        );
        loser.hp = Math.max(0, loser.hp - damage);
        // Stage 2-C: Winning a clash shatters Katakuri's futureSightCounter focus (5s break!)
        const loserTrait = registry.traits[loser.traitId];
        if (loserTrait?.futureSightCounter?.enabled) {
          loser.foresightFocus = 0;
          loser.foresightBreakTimer =
            loserTrait.futureSightCounter.focusBreakDurationSec;
          world.floatingTexts.push({
            id: `ft_fbreak_clash_${world.tick}_${loser.instanceId}`,
            pos: { x: loser.pos.x, y: loser.pos.y - 40 },
            text: `💥 맞대결 승리! 집중 붕괴 (${loser.foresightBreakTimer.toFixed(0)}s)!`,
            color: '#facc15',
            elapsedSec: 0,
            durationSec: 1.4,
            scale: 1.25
          });
          world.combatLog.push(
            `[미래 예지 파훼] ${winner.name}의 맞대결 승리로 ${loser.name}의 집중이 5초간 붕괴됨!`
          );
        }
        applyStatus(
          loser,
          'STAGGER',
          registry.balance.status.staggerDurationSec,
          winner.instanceId,
          world,
          registry
        );

        if (winArc.subtype === 'SLASH') {
          const startPos = { x: winner.pos.x, y: winner.pos.y };
          const dirThrough = normalizeVec(subVec(loser.pos, winner.pos), winArc.dir);
          const rawBehind = addVec(
            loser.pos,
            scaleVec(dirThrough, meleeCfg.crossSlashDashDistancePx)
          );
          winner.pos = {
            x: clamp(rawBehind.x, winner.radiusPx, world.arenaWidth - winner.radiusPx),
            y: clamp(rawBehind.y, winner.radiusPx, world.arenaHeight - winner.radiusPx)
          };

          world.vfxEvents.push({
            id: `vfx_xslash_${world.tick}`,
            kind: 'CROSS_SLASH',
            pos: startPos,
            targetPos: { x: winner.pos.x, y: winner.pos.y },
            color: '#2dd4bf',
            radiusPx: 40,
            elapsedSec: 0,
            durationSec: 0.45
          });
          world.floatingTexts.push({
            id: `ft_xslash_${world.tick}_${winner.instanceId}`,
            pos: { x: loser.pos.x, y: loser.pos.y - 36 },
            text: `CROSS SLASH BREAK! -${damage}`,
            color: '#2dd4bf',
            elapsedSec: 0,
            durationSec: 1.1,
            scale: 1.25
          });
          world.combatLog.push(
            `[베기 교차 돌파] ${winner.name} 맞대결 승리! ${loser.name}의 등 뒤로 교차 참격!`
          );
        } else {
          const pushDir = normalizeVec(subVec(loser.pos, winner.pos), winArc.dir);
          const rawKbSpeed = session.isConquerorSkySplit
            ? meleeCfg.overpowerKnockbackSpeed * 1.35
            : meleeCfg.overpowerKnockbackSpeed;
          const kbSpeed =
            rawKbSpeed * Math.max(0, 1 - loser.knockbackResist);
          loser.knockbackVel = scaleVec(pushDir, kbSpeed);
          world.floatingTexts.push({
            id: `ft_mwin_${world.tick}_${winner.instanceId}`,
            pos: { x: loser.pos.x, y: loser.pos.y - 30 },
            text: session.isConquerorSkySplit
              ? `CONQUEROR OVERPOWER! -${damage}`
              : `CLASH WIN! -${damage}`,
            color: session.isConquerorSkySplit ? '#ef4444' : '#facc15',
            elapsedSec: 0,
            durationSec: 0.95,
            scale: 1.15
          });
        }
      }

      world.meleeClashes.splice(i, 1);
    }
  }
}

export function stepAllClashes(
  world: BattleWorldState,
  dt: number,
  registry: GameDataRegistry
): void {
  resolveProjectileVsProjectile(world, registry);
  resolveBeamVsBeam(world, dt, registry);
  resolveBeamVsProjectile(world, dt, registry);
  resolveMeleeVsProjectile(world, registry);
  resolveMeleeVsBeam(world, dt, registry);
  resolveMeleeVsMelee(world, dt, registry);
}
