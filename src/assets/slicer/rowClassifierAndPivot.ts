import { STANDARD_SPRITE_ANIM_STATES, type SpriteAnimState } from '../../data/assets/types';
import type {
  IrregularSheetRecipeV1,
  RgbaSurface,
  SlicedFrame,
  SlicerOptions,
  SlicerRowCluster
} from './slicerTypes';

function medianNum(vals: readonly number[], fallback: number): number {
  if (vals.length === 0) return fallback;
  const sorted = [...vals].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length * 0.5)] ?? fallback;
}

function solveSingleFramePivot(
  surface: RgbaSurface,
  frame: SlicedFrame,
  idleMedianW: number,
  flipHorizontal: boolean
): { pivotX: number; pivotY: number } {
  const { width: sw, data } = surface;
  const rowOpaque = new Uint16Array(frame.h);
  let lowestFallbackY = frame.h - 1;
  let lowerMaxOpaque = 0;
  const lowerStartY = Math.floor(frame.h * 0.6);

  for (let ly = 0; ly < frame.h; ly++) {
    let hits = 0;
    const gy = frame.y + ly;
    for (let lx = 0; lx < frame.w; lx++) {
      const a = data[(gy * sw + (frame.x + lx)) * 4 + 3] ?? 0;
      if (a >= 16) hits += 1;
    }
    rowOpaque[ly] = hits;
    if (hits > 0) lowestFallbackY = ly;
    if (ly >= lowerStartY && hits > lowerMaxOpaque) lowerMaxOpaque = hits;
  }

  const footThreshold = 2;
  let pivotY = lowestFallbackY;
  for (let ly = frame.h - 1; ly >= lowerStartY; ly--) {
    if ((rowOpaque[ly] ?? 0) >= footThreshold && (ly === 0 || (rowOpaque[ly - 1] ?? 0) >= footThreshold)) {
      pivotY = ly;
      break;
    }
  }

  let pivotX = Math.round(frame.w * 0.5);
  const isStretchedFrame = frame.w > idleMedianW * 1.2;

  if (!isStretchedFrame) {
    // Standard stance/movement: lower-torso horizontal opacity centroid
    const bandY0 = Math.floor(frame.h * 0.35);
    const bandY1 = Math.min(frame.h - 1, Math.floor(frame.h * 0.85));
    let wSum = 0;
    let totalW = 0;
    for (let ly = bandY0; ly <= bandY1; ly++) {
      const gy = frame.y + ly;
      for (let lx = 0; lx < frame.w; lx++) {
        const a = data[(gy * sw + (frame.x + lx)) * 4 + 3] ?? 0;
        if (a >= 16) {
          wSum += lx * a;
          totalW += a;
        }
      }
    }
    if (totalW === 0) {
      for (let ly = 0; ly < frame.h; ly++) {
        const gy = frame.y + ly;
        for (let lx = 0; lx < frame.w; lx++) {
          const a = data[(gy * sw + (frame.x + lx)) * 4 + 3] ?? 0;
          if (a >= 16) {
            wSum += lx * a;
            totalW += a;
          }
        }
      }
    }
    if (totalW > 0) pivotX = Math.round(wSum / totalW);
  } else {
    // Step 1.5 Wide attack / stretched strike: locate peak vertical torso/foot column core!
    const colScore = new Float64Array(frame.w);
    const torsoStartY = Math.floor(frame.h * 0.18);
    const legStartY = Math.floor(frame.h * 0.54);

    for (let lx = 0; lx < frame.w; lx++) {
      let colHeight = 0;
      let weightedSum = 0;
      const gx = frame.x + lx;
      for (let ly = torsoStartY; ly <= pivotY; ly++) {
        const a = data[((frame.y + ly) * sw + gx) * 4 + 3] ?? 0;
        if (a >= 16) {
          colHeight += 1;
          weightedSum += ly >= legStartY ? 1.6 : 0.9;
        }
      }
      // Multiplying by vertical height heavily suppresses thin horizontal outstretched fists/beams
      const spanRatio = colHeight / Math.max(1, pivotY - torsoStartY + 1);
      colScore[lx] = weightedSum * (0.35 + spanRatio * spanRatio);
    }

    const coreW = Math.max(8, Math.min(frame.w, Math.round(idleMedianW * 0.6)));
    let bestStart = 0;
    let bestWindowScore = -1;
    for (let sx = 0; sx <= frame.w - coreW; sx++) {
      let win = 0;
      for (let k = 0; k < coreW; k++) win += colScore[sx + k] ?? 0;
      if (win > bestWindowScore) {
        bestWindowScore = win;
        bestStart = sx;
      }
    }

    let cSum = 0;
    let cWeight = 0;
    for (let lx = bestStart; lx < bestStart + coreW; lx++) {
      const s = colScore[lx] ?? 0;
      cSum += lx * s;
      cWeight += s;
    }
    if (cWeight > 0) {
      pivotX = Math.round(cSum / cWeight);
    }
  }

  if (flipHorizontal) {
    pivotX = Math.max(0, frame.w - 1 - pivotX);
  }
  return {
    pivotX: Math.max(0, Math.min(frame.w - 1, pivotX)),
    pivotY: Math.max(0, Math.min(frame.h - 1, pivotY))
  };
}

/**
 * Step 1.4 & 1.5: RowActionClassifier + TorsoWeightedPivotSolver
 * Clusters sliced frames into horizontal rows, resolves body-core pivots preventing backward slide,
 * honors `.recipe.json` overrides 100%, and maps all 11 engine animation states.
 */
export function clusterRowsAndClassifyActions(
  frames: SlicedFrame[],
  cleanedSurface: RgbaSurface,
  options: SlicerOptions,
  recipe?: IrregularSheetRecipeV1 | null
): {
  rows: SlicerRowCluster[];
  frames: SlicedFrame[];
  stateMapping: Record<SpriteAnimState, number>;
  idleMedianW: number;
  idleMedianH: number;
} {
  const rowGroups: { minY: number; maxY: number; frames: SlicedFrame[] }[] = [];
  const sortedByY = [...frames].sort((a, b) => a.y - b.y || a.x - b.x);

  for (const f of sortedByY) {
    let target = rowGroups.find((rg) => {
      const overlap = Math.max(0, Math.min(f.y + f.h, rg.maxY) - Math.max(f.y, rg.minY));
      const minH = Math.min(f.h, rg.maxY - rg.minY);
      return minH > 0 && overlap / minH >= 0.35;
    });
    if (!target) {
      target = { minY: f.y, maxY: f.y + f.h, frames: [] };
      rowGroups.push(target);
    }
    target.frames.push(f);
    target.minY = Math.min(target.minY, f.y);
    target.maxY = Math.max(target.maxY, f.y + f.h);
  }

  rowGroups.sort((a, b) => a.minY - b.minY);
  for (const rg of rowGroups) rg.frames.sort((a, b) => a.x - b.x);

  const idleSourceRow =
    rowGroups.find((rg) => rg.frames.length >= 2 && rg.frames.length <= 8) ?? rowGroups[0];
  const idleMedianW = idleSourceRow ? medianNum(idleSourceRow.frames.map((f) => f.w), 36) : 36;
  const idleMedianH = idleSourceRow ? medianNum(idleSourceRow.frames.map((f) => f.h), 42) : 42;

  const rowOverrides = recipe?.rowStateOverrides ?? {};
  const pivotOverrides = recipe?.framePivotOverrides ?? {};
  const assignedStatesByRow = new Map<number, { state: SpriteAnimState; reason: string }>();
  const usedStates = new Set<SpriteAnimState>();

  // First pass: recipe row overrides take 100% priority
  for (let r = 0; r < rowGroups.length; r++) {
    const ov = rowOverrides[String(r)];
    if (ov) {
      assignedStatesByRow.set(r, { state: ov, reason: 'recipe override' });
      usedStates.add(ov);
    }
  }

  // Second pass: automatic morphological heuristics for unassigned rows
  const pickFree = (candidates: readonly SpriteAnimState[]): SpriteAnimState => {
    for (const c of candidates) {
      if (!usedStates.has(c)) return c;
    }
    return candidates[0]!;
  };

  for (let r = 0; r < rowGroups.length; r++) {
    if (assignedStatesByRow.has(r)) continue;
    const rg = rowGroups[r]!;
    const avgW = rg.frames.reduce((s, f) => s + f.w, 0) / Math.max(1, rg.frames.length);
    const avgH = rg.frames.reduce((s, f) => s + f.h, 0) / Math.max(1, rg.frames.length);
    const maxW = Math.max(...rg.frames.map((f) => f.w));

    let chosen: SpriteAnimState;
    let reason = 'auto order';
    if (r === 0 && !usedStates.has('IDLE')) {
      chosen = 'IDLE';
      reason = 'top stable row';
    } else if (maxW >= idleMedianW * 1.35 || avgW >= idleMedianW * 1.25) {
      chosen = pickFree(['ATTACK_MELEE', 'ATTACK_CAST', 'CLASH']);
      reason = `wide extension (${Math.round(maxW)}px vs idle ${Math.round(idleMedianW)}px)`;
    } else if (avgW > avgH * 1.15 && avgH <= idleMedianH * 0.85) {
      chosen = pickFree(['DOWNED', 'DODGE']);
      reason = 'low prone profile';
    } else if (rg.frames.length <= 2) {
      chosen = pickFree(['HIT', 'DODGE', 'WINDUP']);
      reason = `short burst (${rg.frames.length}f)`;
    } else if (!usedStates.has('MOVE') && avgW <= idleMedianW * 1.3) {
      chosen = 'MOVE';
      reason = 'balanced locomotion row';
    } else {
      chosen = pickFree([
        'MOVE',
        'ATTACK_MELEE',
        'ATTACK_CAST',
        'WINDUP',
        'CLASH',
        'DODGE',
        'HIT',
        'TRANSFORM',
        'VICTORY',
        'DOWNED',
        'IDLE'
      ]);
    }
    assignedStatesByRow.set(r, { state: chosen, reason });
    usedStates.add(chosen);
  }

  // Solve pivots & populate row clusters
  const rows: SlicerRowCluster[] = [];
  const orderedFrames: SlicedFrame[] = [];
  const firstRowForState = new Map<SpriteAnimState, number>();

  for (let r = 0; r < rowGroups.length; r++) {
    const rg = rowGroups[r]!;
    const spec = assignedStatesByRow.get(r)!;
    if (!firstRowForState.has(spec.state)) firstRowForState.set(spec.state, r);

    const resolvedFrames: SlicedFrame[] = [];
    for (let c = 0; c < rg.frames.length; c++) {
      const f = rg.frames[c]!;
      const solved = solveSingleFramePivot(cleanedSurface, f, idleMedianW, options.flipHorizontal);
      const ovKey = `row_${r}_col_${c}`;
      const pOv = pivotOverrides[ovKey];
      const pivotX = pOv ? Math.max(0, Math.min(f.w - 1, Math.round(pOv.pivotX))) : solved.pivotX;
      const pivotY = pOv ? Math.max(0, Math.min(f.h - 1, Math.round(pOv.pivotY))) : solved.pivotY;

      const updated: SlicedFrame = {
        ...f,
        rowIndex: r,
        colIndex: c,
        pivotX,
        pivotY
      };
      resolvedFrames.push(updated);
      orderedFrames.push(updated);
    }

    rows.push({
      rowIndex: r,
      minY: rg.minY,
      maxY: rg.maxY,
      assignedState: spec.state,
      assignmentReason: spec.reason,
      frames: resolvedFrames
    });
  }

  // Fallback chain ensuring all 11 engine states reference real sliced rows (never empty/procedural!)
  const idleRow = firstRowForState.get('IDLE') ?? 0;
  const moveRow = firstRowForState.get('MOVE') ?? idleRow;
  const atkRow = firstRowForState.get('ATTACK_MELEE') ?? firstRowForState.get('ATTACK_CAST') ?? moveRow;
  const fallbackForState: Record<SpriteAnimState, number> = {
    IDLE: idleRow,
    MOVE: moveRow,
    WINDUP: firstRowForState.get('WINDUP') ?? idleRow,
    ATTACK_MELEE: atkRow,
    ATTACK_CAST: firstRowForState.get('ATTACK_CAST') ?? atkRow,
    CLASH: firstRowForState.get('CLASH') ?? atkRow,
    DODGE: firstRowForState.get('DODGE') ?? moveRow,
    HIT: firstRowForState.get('HIT') ?? idleRow,
    DOWNED: firstRowForState.get('DOWNED') ?? firstRowForState.get('HIT') ?? idleRow,
    TRANSFORM: firstRowForState.get('TRANSFORM') ?? atkRow,
    VICTORY: firstRowForState.get('VICTORY') ?? idleRow
  };

  const stateMapping = {} as Record<SpriteAnimState, number>;
  for (const st of STANDARD_SPRITE_ANIM_STATES) {
    stateMapping[st] = firstRowForState.get(st) ?? fallbackForState[st] ?? 0;
  }

  return { rows, frames: orderedFrames, stateMapping, idleMedianW, idleMedianH };
}
