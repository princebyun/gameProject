import type {
  ActiveBeam,
  ActiveMeleeArc,
  BattleWorldState,
  TeamId,
  UnitRuntimeState
} from '../types/battleState';

interface WorldLookupCache {
  unitsLen: number;
  unitsArrRef: UnitRuntimeState[] | null;
  unitsById: Map<string, UnitRuntimeState>;
  beamsLen: number;
  beamsArrRef: ActiveBeam[] | null;
  beamsFirstRef: ActiveBeam | undefined;
  beamsLastRef: ActiveBeam | undefined;
  beamsById: Map<string, ActiveBeam>;
  arcsLen: number;
  arcsArrRef: ActiveMeleeArc[] | null;
  arcsFirstRef: ActiveMeleeArc | undefined;
  arcsLastRef: ActiveMeleeArc | undefined;
  arcsById: Map<string, ActiveMeleeArc>;
}

const WORLD_LOOKUP_CACHE = new WeakMap<BattleWorldState, WorldLookupCache>();

function getOrCreateCache(world: BattleWorldState): WorldLookupCache {
  let cache = WORLD_LOOKUP_CACHE.get(world);
  if (!cache) {
    cache = {
      unitsLen: -1,
      unitsArrRef: null,
      unitsById: new Map(),
      beamsLen: -1,
      beamsArrRef: null,
      beamsFirstRef: undefined,
      beamsLastRef: undefined,
      beamsById: new Map(),
      arcsLen: -1,
      arcsArrRef: null,
      arcsFirstRef: undefined,
      arcsLastRef: undefined,
      arcsById: new Map()
    };
    WORLD_LOOKUP_CACHE.set(world, cache);
  }
  return cache;
}

export function getUnitById(
  world: BattleWorldState,
  instanceId: string
): UnitRuntimeState | undefined {
  const cache = getOrCreateCache(world);
  if (cache.unitsArrRef !== world.units || cache.unitsLen !== world.units.length) {
    cache.unitsById.clear();
    for (let i = 0; i < world.units.length; i++) {
      const u = world.units[i];
      if (u) cache.unitsById.set(u.instanceId, u);
    }
    cache.unitsArrRef = world.units;
    cache.unitsLen = world.units.length;
  }
  return cache.unitsById.get(instanceId);
}

export function getBeamById(
  world: BattleWorldState,
  beamId: string
): ActiveBeam | undefined {
  const cache = getOrCreateCache(world);
  const len = world.beams.length;
  const firstRef = world.beams[0];
  const lastRef = len > 0 ? world.beams[len - 1] : undefined;
  if (
    cache.beamsArrRef !== world.beams ||
    cache.beamsLen !== len ||
    cache.beamsFirstRef !== firstRef ||
    cache.beamsLastRef !== lastRef
  ) {
    cache.beamsById.clear();
    for (let i = 0; i < len; i++) {
      const b = world.beams[i];
      if (b) cache.beamsById.set(b.id, b);
    }
    cache.beamsArrRef = world.beams;
    cache.beamsLen = len;
    cache.beamsFirstRef = firstRef;
    cache.beamsLastRef = lastRef;
  }
  return cache.beamsById.get(beamId);
}

export function getMeleeArcById(
  world: BattleWorldState,
  arcId: string
): ActiveMeleeArc | undefined {
  const cache = getOrCreateCache(world);
  const len = world.meleeArcs.length;
  const firstRef = world.meleeArcs[0];
  const lastRef = len > 0 ? world.meleeArcs[len - 1] : undefined;
  if (
    cache.arcsArrRef !== world.meleeArcs ||
    cache.arcsLen !== len ||
    cache.arcsFirstRef !== firstRef ||
    cache.arcsLastRef !== lastRef
  ) {
    cache.arcsById.clear();
    for (let i = 0; i < len; i++) {
      const a = world.meleeArcs[i];
      if (a) cache.arcsById.set(a.id, a);
    }
    cache.arcsArrRef = world.meleeArcs;
    cache.arcsLen = len;
    cache.arcsFirstRef = firstRef;
    cache.arcsLastRef = lastRef;
  }
  return cache.arcsById.get(arcId);
}

export function findFirstActiveEnemy(
  world: BattleWorldState,
  team: TeamId
): UnitRuntimeState | undefined {
  for (let i = 0; i < world.units.length; i++) {
    const u = world.units[i];
    if (u && u.isAlive && u.isOnField && u.team !== team) {
      return u;
    }
  }
  return undefined;
}
