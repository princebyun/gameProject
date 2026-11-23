import {
  bboxContainsCenter,
  bboxIoU,
  type BBox,
  type DetectedComponent,
  type IrregularSheetRecipeV1,
  type RgbaSurface,
  type SlicedFrame
} from './slicerTypes';

function matchesAnyBox(box: BBox, targets: readonly BBox[]): boolean {
  for (let i = 0; i < targets.length; i++) {
    const t = targets[i]!;
    if (bboxIoU(box, t) >= 0.4 || bboxContainsCenter(t, box) || bboxContainsCenter(box, t)) {
      return true;
    }
  }
  return false;
}

function medianValue(nums: readonly number[]): number {
  if (nums.length === 0) return 24;
  const sorted = [...nums].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length * 0.5)] ?? 24;
}

function findValleyBarrierX(
  surface: RgbaSurface,
  startX: number,
  endX: number,
  minY: number,
  maxY: number
): number {
  if (endX <= startX + 1) return Math.floor((startX + endX) * 0.5);
  const { width: w, height: h, data } = surface;
  const y0 = Math.max(0, minY);
  const y1 = Math.min(h - 1, maxY);
  let bestX = Math.floor((startX + endX) * 0.5);
  let bestScore = Infinity;

  for (let x = startX; x < endX; x++) {
    let colHits = 0;
    for (let y = y0; y <= y1; y++) {
      if ((data[(y * w + x) * 4 + 3] ?? 0) >= 16) colHits += 1;
    }
    if (colHits < bestScore) {
      bestScore = colHits;
      bestX = x;
    }
  }
  return bestX;
}

function applyManualRecipeMerges(
  frames: SlicedFrame[],
  recipe?: IrregularSheetRecipeV1 | null
): SlicedFrame[] {
  const groups = recipe?.mergedGroups;
  if (!groups || groups.length === 0) return frames;

  let current = [...frames];
  for (const grp of groups) {
    if (grp.length < 2) continue;
    const matchedIdx: number[] = [];
    for (let i = 0; i < current.length; i++) {
      if (matchesAnyBox(current[i]!, grp)) matchedIdx.push(i);
    }
    if (matchedIdx.length < 2) continue;
    const picked = matchedIdx.map((idx) => current[idx]!);
    const minX = Math.min(...picked.map((p) => p.x));
    const minY = Math.min(...picked.map((p) => p.y));
    const maxX = Math.max(...picked.map((p) => p.x + p.w));
    const maxY = Math.max(...picked.map((p) => p.y + p.h));
    const mergedFrame: SlicedFrame = {
      id: picked[0]!.id,
      x: minX,
      y: minY,
      w: maxX - minX,
      h: maxY - minY,
      rowIndex: 0,
      colIndex: 0,
      pivotX: Math.round((maxX - minX) * 0.5),
      pivotY: maxY - minY - 1,
      sourceComponents: picked.flatMap((p) => p.sourceComponents)
    };
    const skip = new Set(matchedIdx);
    current = current.filter((_, idx) => !skip.has(idx));
    current.push(mergedFrame);
  }
  return current;
}

/**
 * Step 1.3: SatellitePartMerger
 * Merges nearby floating hats, swords, dust, and aura rings into their nearest body frame
 * while preserving vertical-projection valley barriers between neighboring fighters.
 */
export function mergeSatelliteParts(
  activeComponents: DetectedComponent[],
  cleanedSurface: RgbaSurface,
  recipe?: IrregularSheetRecipeV1 | null
): SlicedFrame[] {
  if (activeComponents.length === 0) return [];
  const tallPool = activeComponents.filter((c) => c.h >= 12);
  const sizePool = tallPool.length > 0 ? tallPool : activeComponents;
  const medH = medianValue(sizePool.map((c) => c.h));
  const medW = medianValue(sizePool.map((c) => c.w));
  const bodyMinH = Math.max(12, Math.round(medH * 0.65));
  const proneMinH = Math.max(12, Math.round(medH * 0.42));

  const isBody = (c: DetectedComponent): boolean =>
    c.h >= bodyMinH || (c.h >= proneMinH && c.w >= Math.round(medW * 1.15) && c.pixelCount >= 180);

  const bodies = activeComponents.filter(isBody);
  if (bodies.length === 0) {
    return activeComponents.map((c, idx) => ({
      id: idx + 1,
      x: c.x,
      y: c.y,
      w: c.w,
      h: c.h,
      rowIndex: 0,
      colIndex: idx,
      pivotX: Math.round(c.w * 0.5),
      pivotY: c.h - 1,
      sourceComponents: [{ x: c.x, y: c.y, w: c.w, h: c.h }]
    }));
  }

  const satellites = activeComponents.filter((c) => !isBody(c));
  const bodyBands: DetectedComponent[][] = [];
  for (const b of [...bodies].sort((a, z) => a.y - z.y)) {
    let band = bodyBands.find((arr) => {
      const minY = Math.min(...arr.map((m) => m.y));
      const maxY = Math.max(...arr.map((m) => m.y + m.h));
      const ov = Math.max(0, Math.min(b.y + b.h, maxY) - Math.max(b.y, minY));
      return ov >= Math.min(b.h, maxY - minY) * 0.3;
    });
    if (!band) {
      band = [];
      bodyBands.push(band);
    }
    band.push(b);
  }

  const barriers = new Map<number, { leftBarrier: number; rightBarrier: number }>();
  for (const band of bodyBands) {
    band.sort((a, b) => a.x - b.x);
    const bandMinY = Math.min(...band.map((m) => m.y));
    const bandMaxY = Math.max(...band.map((m) => m.y + m.h));
    for (let i = 0; i < band.length; i++) {
      const cur = band[i]!;
      const prev = i > 0 ? band[i - 1]! : null;
      const next = i + 1 < band.length ? band[i + 1]! : null;
      const leftBarrier = prev
        ? findValleyBarrierX(cleanedSurface, prev.x + prev.w, cur.x, bandMinY, bandMaxY)
        : 0;
      const rightBarrier = next
        ? findValleyBarrierX(cleanedSurface, cur.x + cur.w, next.x, bandMinY, bandMaxY)
        : cleanedSurface.width;
      barriers.set(cur.id, { leftBarrier, rightBarrier });
    }
  }

  const maxHGap = Math.max(6, Math.round(medW * 0.18));
  const maxVGap = Math.max(10, Math.round(medH * 0.35));
  const mergedInto = new Map<number, BBox[]>(
    bodies.map((b) => [b.id, [{ x: b.x, y: b.y, w: b.w, h: b.h }]])
  );
  const unmergedSatellites: DetectedComponent[] = [];

  for (const sat of satellites) {
    const satCx = sat.x + sat.w * 0.5;
    let bestBody: DetectedComponent | null = null;
    let bestDist = Infinity;

    for (const b of bodies) {
      const lim = barriers.get(b.id);
      if (lim && (satCx < lim.leftBarrier || satCx > lim.rightBarrier)) continue;

      const vGap =
        sat.y + sat.h < b.y
          ? b.y - (sat.y + sat.h)
          : sat.y > b.y + b.h
            ? sat.y - (b.y + b.h)
            : 0;
      const hGap =
        sat.x + sat.w < b.x
          ? b.x - (sat.x + sat.w)
          : sat.x > b.x + b.w
            ? sat.x - (b.x + b.w)
            : 0;

      if (vGap <= maxVGap && hGap <= maxHGap) {
        const dist = hGap * 2 + vGap;
        if (dist < bestDist) {
          bestDist = dist;
          bestBody = b;
        }
      }
    }

    if (bestBody) {
      mergedInto.get(bestBody.id)!.push({ x: sat.x, y: sat.y, w: sat.w, h: sat.h });
    } else {
      unmergedSatellites.push(sat);
    }
  }

  const rawFrames: SlicedFrame[] = [];
  let fId = 1;
  for (const b of bodies) {
    const parts = mergedInto.get(b.id)!;
    const minX = Math.min(...parts.map((p) => p.x));
    const minY = Math.min(...parts.map((p) => p.y));
    const maxX = Math.max(...parts.map((p) => p.x + p.w));
    const maxY = Math.max(...parts.map((p) => p.y + p.h));
    rawFrames.push({
      id: fId++,
      x: minX,
      y: minY,
      w: maxX - minX,
      h: maxY - minY,
      rowIndex: 0,
      colIndex: 0,
      pivotX: Math.round((maxX - minX) * 0.5),
      pivotY: maxY - minY - 1,
      sourceComponents: parts
    });
  }
  for (const u of unmergedSatellites) {
    rawFrames.push({
      id: fId++,
      x: u.x,
      y: u.y,
      w: u.w,
      h: u.h,
      rowIndex: 0,
      colIndex: 0,
      pivotX: Math.round(u.w * 0.5),
      pivotY: u.h - 1,
      sourceComponents: [{ x: u.x, y: u.y, w: u.w, h: u.h }]
    });
  }

  return applyManualRecipeMerges(rawFrames, recipe);
}
