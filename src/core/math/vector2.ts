import type { Vec2 } from '../../data/schemas/commonSchemas';
export type { Vec2 };

export function vec2(x: number = 0, y: number = 0): Vec2 {
  return { x, y };
}

export function addVec(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x + b.x, y: a.y + b.y };
}

export function subVec(a: Vec2, b: Vec2): Vec2 {
  return { x: a.x - b.x, y: a.y - b.y };
}

export function scaleVec(v: Vec2, s: number): Vec2 {
  return { x: v.x * s, y: v.y * s };
}

export function dotVec(a: Vec2, b: Vec2): number {
  return a.x * b.x + a.y * b.y;
}

export function lenSqVec(v: Vec2): number {
  return v.x * v.x + v.y * v.y;
}

export function lenVec(v: Vec2): number {
  return Math.hypot(v.x, v.y);
}

export function distVec(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function normalizeVec(v: Vec2, fallback: Vec2 = { x: 1, y: 0 }): Vec2 {
  const l = Math.hypot(v.x, v.y);
  if (l < 1e-7) {
    return { x: fallback.x, y: fallback.y };
  }
  return { x: v.x / l, y: v.y / l };
}

export function clamp(val: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, val));
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function lerpVec(a: Vec2, b: Vec2, t: number): Vec2 {
  return {
    x: lerp(a.x, b.x, t),
    y: lerp(a.y, b.y, t)
  };
}

export function radToDeg(rad: number): number {
  return (rad * 180) / Math.PI;
}

export function degToRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

export function angleBetweenDeg(a: Vec2, b: Vec2): number {
  const na = normalizeVec(a);
  const nb = normalizeVec(b);
  const d = clamp(dotVec(na, nb), -1, 1);
  return radToDeg(Math.acos(d));
}

export function closestPointOnSegment(p: Vec2, a: Vec2, b: Vec2): { point: Vec2; t: number } {
  const ab = subVec(b, a);
  const abLenSq = lenSqVec(ab);
  if (abLenSq < 1e-7) {
    return { point: { x: a.x, y: a.y }, t: 0 };
  }
  const t = clamp(dotVec(subVec(p, a), ab) / abLenSq, 0, 1);
  return {
    point: { x: a.x + ab.x * t, y: a.y + ab.y * t },
    t
  };
}

export function pointToSegmentDist(p: Vec2, a: Vec2, b: Vec2): number {
  const { point } = closestPointOnSegment(p, a, b);
  return distVec(p, point);
}

export function segmentsDistance(
  a1: Vec2,
  a2: Vec2,
  b1: Vec2,
  b2: Vec2
): { distance: number; midpoint: Vec2; ratioA: number } {
  // Check exact intersection first
  const d1x = a2.x - a1.x;
  const d1y = a2.y - a1.y;
  const d2x = b2.x - b1.x;
  const d2y = b2.y - b1.y;
  const denom = d1x * d2y - d1y * d2x;

  if (Math.abs(denom) > 1e-7) {
    const dx = b1.x - a1.x;
    const dy = b1.y - a1.y;
    const t = (dx * d2y - dy * d2x) / denom;
    const u = (dx * d1y - dy * d1x) / denom;
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
      return {
        distance: 0,
        midpoint: { x: a1.x + t * d1x, y: a1.y + t * d1y },
        ratioA: t
      };
    }
  }

  // Otherwise check endpoints to segments
  const candidates: { distance: number; midpoint: Vec2; ratioA: number }[] = [];

  const c1 = closestPointOnSegment(a1, b1, b2);
  candidates.push({
    distance: distVec(a1, c1.point),
    midpoint: lerpVec(a1, c1.point, 0.5),
    ratioA: 0
  });

  const c2 = closestPointOnSegment(a2, b1, b2);
  candidates.push({
    distance: distVec(a2, c2.point),
    midpoint: lerpVec(a2, c2.point, 0.5),
    ratioA: 1
  });

  const c3 = closestPointOnSegment(b1, a1, a2);
  candidates.push({
    distance: distVec(b1, c3.point),
    midpoint: lerpVec(b1, c3.point, 0.5),
    ratioA: c3.t
  });

  const c4 = closestPointOnSegment(b2, a1, a2);
  candidates.push({
    distance: distVec(b2, c4.point),
    midpoint: lerpVec(b2, c4.point, 0.5),
    ratioA: c4.t
  });

  candidates.sort((x, y) => x.distance - y.distance);
  return candidates[0]!;
}

export function isCircleIntersectingSector(
  circlePos: Vec2,
  circleRadius: number,
  sectorOrigin: Vec2,
  sectorDir: Vec2,
  sectorRadius: number,
  sectorArcDeg: number
): boolean {
  const delta = subVec(circlePos, sectorOrigin);
  const d = lenVec(delta);
  if (d > sectorRadius + circleRadius) {
    return false;
  }
  if (d <= circleRadius + 4) {
    return true;
  }
  const ang = angleBetweenDeg(sectorDir, delta);
  // Angular allowance for circle radius at distance d
  const radiusAngleBonus = radToDeg(Math.atan2(circleRadius, Math.max(1, d)));
  return ang <= sectorArcDeg * 0.5 + radiusAngleBonus;
}
