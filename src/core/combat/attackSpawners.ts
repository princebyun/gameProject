import {
  addVec,
  normalizeVec,
  scaleVec,
  subVec,
  type Vec2
} from '../math/vector2';
import type {
  ActiveBeam,
  ActiveMeleeArc,
  ActiveProjectile,
  BattleWorldState,
  UnitRuntimeState
} from '../types/battleState';
import type { GameDataRegistry, MoveDefinition } from '../types/dataSchemas';
import { computeBeamDynamicRange, getUnitCurrentStat } from './damageCalc';
import { getTraitClashMultiplier } from './traitHooks';
import { findFirstActiveEnemy } from './worldLookup';

export function spawnProjectileInstance(
  caster: UnitRuntimeState,
  moveDef: MoveDefinition,
  aimDir: Vec2,
  world: BattleWorldState,
  registry: GameDataRegistry
): ActiveProjectile {
  const spec = moveDef.projectileSpec ?? {
    pattern: 'SINGLE',
    burstCount: 1,
    burstIntervalSec: 0,
    speedPxPerSec: 350,
    bypassGroundCollision: false
  };
  const offStat =
    moveDef.category === 'PHYSICAL'
      ? getUnitCurrentStat(caster, 'atk', world, registry)
      : getUnitCurrentStat(caster, 'spAtk', world, registry);
  const dir = normalizeVec(aimDir, caster.aimDir);
  const spawnPos = addVec(caster.pos, scaleVec(dir, caster.radiusPx + moveDef.radiusPx + 4));

  const proj: ActiveProjectile = {
    id: `proj_${world.tick}_${caster.instanceId}_${world.projectiles.length}`,
    moveId: moveDef.id,
    ownerUnitId: caster.instanceId,
    team: caster.team,
    element: moveDef.element,
    pos: spawnPos,
    prevPos: { x: spawnPos.x, y: spawnPos.y },
    vel: scaleVec(dir, spec.speedPxPerSec),
    radiusPx: moveDef.radiusPx,
    currentPower: moveDef.basePower,
    initialPower: moveDef.basePower,
    offensiveStat: offStat,
    traitClashMult: getTraitClashMultiplier(caster, 'PROJECTILE', registry),
    hasArmamentHaki: Boolean(moveDef.hasArmamentHaki),
    hasConquerorCoating: Boolean(moveDef.hasConquerorCoating),
    isInternalDestruction: Boolean(moveDef.isInternalDestruction),
    elapsedSec: 0,
    maxDurationSec:
      moveDef.activeDurationSec *
      (registry.traits[caster.traitId]?.projectileRangeMultiplier ?? 1.0),
    pattern: spec.pattern,
    bypassGroundCollision: Boolean(spec.bypassGroundCollision),
    isInsideBeam: false,
    homingTurnRateRadPerSec: spec.homingTurnRateRadPerSec,
    appliesVenomStacks: moveDef.appliesVenomStacks,
    destroyed: false
  };
  world.projectiles.push(proj);
  return proj;
}

export function spawnBeamInstance(
  caster: UnitRuntimeState,
  moveDef: MoveDefinition,
  aimDir: Vec2,
  world: BattleWorldState,
  registry: GameDataRegistry
): ActiveBeam {
  const offStat =
    moveDef.category === 'PHYSICAL'
      ? getUnitCurrentStat(caster, 'atk', world, registry)
      : getUnitCurrentStat(caster, 'spAtk', world, registry);
  const dynamicRange = moveDef.beamSpec?.dynamicRangeByStat
    ? computeBeamDynamicRange(offStat, registry.balance)
    : moveDef.rangePx;
  const dir = normalizeVec(aimDir, caster.aimDir);
  const origin = addVec(caster.pos, scaleVec(dir, caster.radiusPx + 6));

  const beam: ActiveBeam = {
    id: `beam_${world.tick}_${caster.instanceId}_${world.beams.length}`,
    moveId: moveDef.id,
    ownerUnitId: caster.instanceId,
    team: caster.team,
    element: moveDef.element,
    origin,
    dir,
    maxRangePx: dynamicRange,
    currentLengthPx: dynamicRange,
    widthPx: moveDef.beamSpec?.widthPx ?? moveDef.radiusPx * 1.4,
    currentPower: moveDef.basePower,
    initialPower: moveDef.basePower,
    offensiveStat: offStat,
    traitClashMult: getTraitClashMultiplier(caster, 'BEAM', registry),
    hasArmamentHaki: Boolean(moveDef.hasArmamentHaki),
    hasConquerorCoating: Boolean(moveDef.hasConquerorCoating),
    isInternalDestruction: Boolean(moveDef.isInternalDestruction),
    elapsedSec: 0,
    maxDurationSec: moveDef.activeDurationSec,
    tickTimer: 0,
    tickIntervalSec: moveDef.beamSpec?.tickIntervalSec ?? 0.15,
    clashingWithBeamId: null,
    guardedByMeleeId: null,
    dimmed: false,
    terminated: false
  };
  world.beams.push(beam);
  caster.activeBeamId = beam.id;
  return beam;
}

export function spawnMeleeArcInstance(
  caster: UnitRuntimeState,
  moveDef: MoveDefinition,
  aimDir: Vec2,
  world: BattleWorldState,
  registry: GameDataRegistry
): ActiveMeleeArc {
  const offStat =
    moveDef.category === 'PHYSICAL'
      ? getUnitCurrentStat(caster, 'atk', world, registry)
      : getUnitCurrentStat(caster, 'spAtk', world, registry);
  const dir = normalizeVec(aimDir, caster.aimDir);
  const spec = moveDef.meleeSpec ?? {
    subtype: 'SLASH',
    arcDeg: 120,
    dashSpeedPxPerSec: 160,
    deflectProjectiles: true,
    canGuardBeam: true
  };

  // Law's Shambles: if an active ROOM / K_ROOM exists, blink directly into range of nearest enemy!
  if (moveDef.requiresActiveRoom) {
    const hasRoom =
      world.fieldZones.some(
        (z) => z.ownerUnitId === caster.instanceId && z.fieldKind === 'DOME_SHIELD'
      ) ||
      (world.environmentField.kind === 'K_ROOM_FIELD' &&
        world.environmentField.ownerUnitId === caster.instanceId);

    if (hasRoom) {
      const enemy = findFirstActiveEnemy(world, caster.team);
      if (enemy) {
        const toEnemy = normalizeVec(subVec(enemy.pos, caster.pos), dir);
        caster.pos = addVec(enemy.pos, scaleVec(toEnemy, -42));
      }
    }
  }

  if (spec.dashSpeedPxPerSec && spec.dashSpeedPxPerSec > 0) {
    caster.vel = scaleVec(dir, spec.dashSpeedPxPerSec);
  }

  const lingerSec = Math.max(
    moveDef.activeDurationSec,
    registry.balance.melee.deflectLingerSec
  );

  // Environment Awakening (e.g. Law's K·ROOM) boosts melee range/radius
  const rangeBonus =
    world.environmentField.kind === 'K_ROOM_FIELD' &&
    world.environmentField.ownerUnitId === caster.instanceId
      ? 1.35
      : 1.0;

  const arc: ActiveMeleeArc = {
    id: `melee_${world.tick}_${caster.instanceId}_${world.meleeArcs.length}`,
    moveId: moveDef.id,
    ownerUnitId: caster.instanceId,
    team: caster.team,
    element: moveDef.element,
    subtype: spec.subtype,
    origin: { x: caster.pos.x, y: caster.pos.y },
    dir,
    radiusPx: Math.round(moveDef.radiusPx * rangeBonus),
    arcDeg: spec.arcDeg,
    currentPower: moveDef.basePower,
    initialPower: moveDef.basePower,
    offensiveStat: offStat,
    traitClashMult: getTraitClashMultiplier(caster, 'MELEE', registry),
    hasArmamentHaki: Boolean(moveDef.hasArmamentHaki),
    hasConquerorCoating: Boolean(moveDef.hasConquerorCoating),
    isInternalDestruction: Boolean(moveDef.isInternalDestruction),
    elapsedSec: 0,
    activeDamageDurationSec: moveDef.activeDurationSec,
    totalLingerDurationSec: lingerSec,
    deflectProjectiles: spec.deflectProjectiles,
    canGuardBeam: spec.canGuardBeam,
    hitUnitIds: [],
    clashing: false,
    finished: false
  };

  if (arc.hasConquerorCoating) {
    world.vfxEvents.push({
      id: `vfx_conq_cast_${world.tick}_${caster.instanceId}`,
      kind: 'CONQUEROR_LIGHTNING',
      pos: { x: caster.pos.x, y: caster.pos.y },
      color: '#dc2626',
      radiusPx: arc.radiusPx,
      elapsedSec: 0,
      durationSec: 0.35
    });
  }

  world.meleeArcs.push(arc);
  return arc;
}
