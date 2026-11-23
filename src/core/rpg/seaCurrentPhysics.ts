import { clamp, type Vec2 } from '../math/vector2';
import type {
  RpgCampaignState,
  SeaCurrentRoute,
  SeaWhirlpoolNode
} from '../types/rpgSchemas';

export interface SeaCurrentSample {
  inCurrent: boolean;
  currentId: string | null;
  falloff: number;
  alignmentDot: number;
  speedMultiplier: number;
  driftVec: Vec2;
  tailwindRatio: number;
  headwindRatio: number;
}

export interface SeaWhirlpoolSample {
  inWhirlpool: boolean;
  whirlpoolId: string | null;
  intensity: number;
  swirlVec: Vec2;
  pullVec: Vec2;
  coreBounceVec: Vec2;
  escapedCore: boolean;
  pushOutPos: Vec2 | null;
}

export function resolveActiveShipId(
  state: RpgCampaignState
): 'going_merry' | 'thousand_sunny' {
  if (
    state.ship.shipId === 'thousand_sunny' ||
    state.unlockedShips.includes('thousand_sunny') ||
    state.completedEpisodes.includes('ep_water_seven')
  ) {
    return 'thousand_sunny';
  }
  return 'going_merry';
}

function closestPointOnSegment(
  p: Vec2,
  a: Vec2,
  b: Vec2
): { dist: number; tangent: Vec2 } {
  const abx = b.x - a.x;
  const aby = b.y - a.y;
  const abLenSq = abx * abx + aby * aby;
  if (abLenSq <= 0.0001) {
    return {
      dist: Math.hypot(p.x - a.x, p.y - a.y),
      tangent: { x: 1, y: 0 }
    };
  }
  const t = clamp(((p.x - a.x) * abx + (p.y - a.y) * aby) / abLenSq, 0, 1);
  const cx = a.x + abx * t;
  const cy = a.y + aby * t;
  const len = Math.sqrt(abLenSq);
  return {
    dist: Math.hypot(p.x - cx, p.y - cy),
    tangent: { x: abx / len, y: aby / len }
  };
}

export function sampleSeaCurrentAt(
  pos: Vec2,
  headingVec: Vec2,
  currents: readonly SeaCurrentRoute[] | undefined,
  currentResist: number
): SeaCurrentSample {
  const empty: SeaCurrentSample = {
    inCurrent: false,
    currentId: null,
    falloff: 0,
    alignmentDot: 0,
    speedMultiplier: 1,
    driftVec: { x: 0, y: 0 },
    tailwindRatio: 0,
    headwindRatio: 0
  };
  if (!currents || currents.length === 0) return empty;

  let bestFalloff = 0;
  let bestRoute: SeaCurrentRoute | null = null;
  let bestTangent: Vec2 = { x: 1, y: 0 };

  for (const route of currents) {
    if (route.points.length < 2 || route.widthPx <= 0) continue;
    const halfW = route.widthPx * 0.5;
    for (let i = 0; i < route.points.length - 1; i++) {
      const a = route.points[i];
      const b = route.points[i + 1];
      if (!a || !b) continue;
      const seg = closestPointOnSegment(pos, a, b);
      const falloff = clamp(1 - seg.dist / halfW, 0, 1);
      if (falloff > bestFalloff) {
        bestFalloff = falloff;
        bestRoute = route;
        bestTangent = seg.tangent;
      }
    }
  }

  if (!bestRoute || bestFalloff <= 0.001) {
    return empty;
  }

  const hLen = Math.hypot(headingVec.x, headingVec.y);
  const hx = hLen > 0.001 ? headingVec.x / hLen : 0;
  const hy = hLen > 0.001 ? headingVec.y / hLen : 0;
  const dot =
    hLen > 0.001
      ? clamp(hx * bestTangent.x + hy * bestTangent.y, -1, 1)
      : 0;

  const speedMultiplier =
    dot >= 0
      ? 1 + 0.35 * dot * bestFalloff
      : 1 + 0.2 * dot * bestFalloff;
  const resistFactor = clamp(1 - 0.55 * currentResist, 0.25, 1);
  const driftSpeed = bestRoute.speedPx * bestFalloff * resistFactor;

  return {
    inCurrent: true,
    currentId: bestRoute.id,
    falloff: bestFalloff,
    alignmentDot: dot,
    speedMultiplier,
    driftVec: {
      x: bestTangent.x * driftSpeed,
      y: bestTangent.y * driftSpeed
    },
    tailwindRatio: dot > 0 ? dot * bestFalloff : 0,
    headwindRatio: dot < 0 ? -dot * bestFalloff : 0
  };
}

export function sampleWhirlpoolAt(
  pos: Vec2,
  whirlpools: readonly SeaWhirlpoolNode[] | undefined,
  currentResist: number,
  coupDeBurstActive: boolean
): SeaWhirlpoolSample {
  const empty: SeaWhirlpoolSample = {
    inWhirlpool: false,
    whirlpoolId: null,
    intensity: 0,
    swirlVec: { x: 0, y: 0 },
    pullVec: { x: 0, y: 0 },
    coreBounceVec: { x: 0, y: 0 },
    escapedCore: false,
    pushOutPos: null
  };
  if (!whirlpools || whirlpools.length === 0) return empty;

  let bestIntensity = 0;
  let bestWp: SeaWhirlpoolNode | null = null;
  let bestDx = 0;
  let bestDy = 0;
  let bestDist = 0;

  for (const wp of whirlpools) {
    if (wp.outerRadiusPx <= 0) continue;
    const dx = pos.x - wp.pos.x;
    const dy = pos.y - wp.pos.y;
    const dist = Math.hypot(dx, dy);
    if (dist >= wp.outerRadiusPx) continue;
    const intensity = clamp(1 - dist / wp.outerRadiusPx, 0, 1);
    if (intensity > bestIntensity) {
      bestIntensity = intensity;
      bestWp = wp;
      bestDx = dx;
      bestDy = dy;
      bestDist = dist;
    }
  }

  if (!bestWp) return empty;

  const rx = bestDist > 0.001 ? bestDx / bestDist : 1;
  const ry = bestDist > 0.001 ? bestDy / bestDist : 0;
  const tx = bestWp.clockwise ? -ry : ry;
  const ty = bestWp.clockwise ? rx : -rx;

  const swirlSpeed = bestWp.swirlStrengthPx * (0.35 + 0.65 * bestIntensity);
  const burstFactor = coupDeBurstActive ? 0.1 : 1.0;
  const resistFactor = clamp(1 - 0.45 * currentResist, 0.3, 1);
  const pullSpeed = bestWp.pullStrengthPx * bestIntensity * resistFactor * burstFactor;

  const escapedCore = bestDist < bestWp.coreRadiusPx;
  const bounceSpeed = escapedCore
    ? Math.max(bestWp.pullStrengthPx * 2.5, 175)
    : 0;
  const pushRadius = bestWp.coreRadiusPx * 1.15;

  return {
    inWhirlpool: true,
    whirlpoolId: bestWp.id,
    intensity: bestIntensity,
    swirlVec: {
      x: tx * swirlSpeed,
      y: ty * swirlSpeed
    },
    pullVec: {
      x: -rx * pullSpeed,
      y: -ry * pullSpeed
    },
    coreBounceVec: {
      x: rx * bounceSpeed,
      y: ry * bounceSpeed
    },
    escapedCore,
    pushOutPos: escapedCore
      ? {
          x: bestWp.pos.x + rx * pushRadius,
          y: bestWp.pos.y + ry * pushRadius
        }
      : null
  };
}
