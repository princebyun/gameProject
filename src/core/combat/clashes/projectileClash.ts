import { distVec, lerpVec, scaleVec } from '../../math/vector2';
import type { ActiveProjectile, BattleWorldState } from '../../types/battleState';
import type { GameDataRegistry } from '../../types/dataSchemas';
import { computeEffectiveClashPower } from '../damageCalc';
import { triggerTraitHook } from '../traitHooks';
import { getUnitById } from '../worldLookup';

function isProjectileInParabolicApex(
  proj: ActiveProjectile,
  registry: GameDataRegistry
): boolean {
  if (!proj.bypassGroundCollision || proj.pattern !== 'PARABOLIC') {
    return false;
  }
  const progress = proj.elapsedSec / Math.max(0.01, proj.maxDurationSec);
  const { parabolicApexPassRatioStart, parabolicApexPassRatioEnd } =
    registry.balance.projectile;
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
    world.environmentField.team &&
    world.environmentField.ownerUnitId
  ) {
    const owner = getUnitById(world, world.environmentField.ownerUnitId);
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
    if (!a || a.destroyed) continue;

    for (let j = i + 1; j < projs.length; j++) {
      const b = projs[j];
      if (!b || b.destroyed || a.team === b.team) continue;

      const aHigh = isProjectileInParabolicApex(a, registry);
      const bHigh = isProjectileInParabolicApex(b, registry);
      if (aHigh !== bHigh) {
        continue;
      }

      const d = distVec(a.pos, b.pos);
      if (d > a.radiusPx + b.radiusPx) continue;

      const unitA = getUnitById(world, a.ownerUnitId);
      const unitB = getUnitById(world, b.ownerUnitId);
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
