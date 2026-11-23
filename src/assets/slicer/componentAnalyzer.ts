import {
  bboxContainsCenter,
  bboxIoU,
  type BBox,
  type DetectedComponent,
  type ExcludedRegion,
  type IrregularSheetRecipeV1,
  type RgbaSurface
} from './slicerTypes';

function matchesRecipeList(box: BBox, targets: readonly BBox[]): boolean {
  for (let i = 0; i < targets.length; i++) {
    const t = targets[i]!;
    if (bboxIoU(box, t) >= 0.4 || bboxContainsCenter(t, box) || bboxContainsCenter(box, t)) {
      return true;
    }
  }
  return false;
}

/**
 * Iterative 8-connected CCL using flat typed arrays (zero recursion).
 */
export function extractConnectedComponents(surface: RgbaSurface): DetectedComponent[] {
  const { width: w, height: h, data } = surface;
  const total = w * h;
  const visited = new Uint8Array(total);
  const queue = new Int32Array(total);
  const comps: DetectedComponent[] = [];
  let nextId = 1;

  for (let start = 0; start < total; start++) {
    if (visited[start] || (data[start * 4 + 3] ?? 0) < 16) continue;
    let head = 0;
    let tail = 0;
    visited[start] = 1;
    queue[tail++] = start;

    let minX = start % w;
    let maxX = minX;
    let minY = (start - minX) / w;
    let maxY = minY;

    while (head < tail) {
      const pos = queue[head++]!;
      const px = pos % w;
      const py = (pos - px) / w;
      if (px < minX) minX = px;
      if (px > maxX) maxX = px;
      if (py < minY) minY = py;
      if (py > maxY) maxY = py;

      for (let dy = -1; dy <= 1; dy++) {
        const ny = py + dy;
        if (ny < 0 || ny >= h) continue;
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = px + dx;
          if (nx < 0 || nx >= w) continue;
          const nPos = ny * w + nx;
          if (!visited[nPos] && (data[nPos * 4 + 3] ?? 0) >= 16) {
            visited[nPos] = 1;
            queue[tail++] = nPos;
          }
        }
      }
    }

    const bw = maxX - minX + 1;
    const bh = maxY - minY + 1;
    comps.push({
      id: nextId++,
      x: minX,
      y: minY,
      w: bw,
      h: bh,
      pixelCount: tail,
      area: bw * bh
    });
  }

  return comps;
}

/**
 * Step 1.2: HeaderAndLabelFilter
 * Filters micro-dust, top 18% title/credit banners, and glyph-chain pixel text labels,
 * while preserving all excluded bboxes in `excludedRegions` for recovery.
 */
export function filterHeaderAndTextLabels(
  components: DetectedComponent[],
  sheetWidth: number,
  sheetHeight: number,
  dividerRegions: ExcludedRegion[],
  recipe?: IrregularSheetRecipeV1 | null
): {
  activeComponents: DetectedComponent[];
  excludedRegions: ExcludedRegion[];
} {
  const excluded: ExcludedRegion[] = [...dividerRegions];
  const excludedIds = new Set<number>();
  const restoredList = recipe?.restoredRegions ?? [];
  const manualExcludeList = recipe?.excludedRegions ?? [];
  const forceRestoredIds = new Set<number>();

  for (const c of components) {
    if (matchesRecipeList(c, restoredList)) {
      forceRestoredIds.add(c.id);
    } else if (matchesRecipeList(c, manualExcludeList)) {
      excludedIds.add(c.id);
      excluded.push({ x: c.x, y: c.y, w: c.w, h: c.h, reason: 'USER_EXCLUDED' });
    }
  }

  // Pass A: micro pixel dust & clear top-band wide banners
  const headerTopLimit = Math.round(sheetHeight * 0.18);
  const topBandCandidates: DetectedComponent[] = [];
  for (const c of components) {
    if (excludedIds.has(c.id) || forceRestoredIds.has(c.id)) continue;
    if (c.area < 20 || (c.w <= 3 && c.h <= 3)) {
      excludedIds.add(c.id);
      excluded.push({ x: c.x, y: c.y, w: c.w, h: c.h, reason: 'DUST' });
      continue;
    }
    if (c.y <= headerTopLimit) {
      if (c.w / Math.max(1, c.h) >= 3.5 || c.w >= sheetWidth * 0.45) {
        excludedIds.add(c.id);
        excluded.push({ x: c.x, y: c.y, w: c.w, h: c.h, reason: 'HEADER_BANNER' });
        continue;
      }
      topBandCandidates.push(c);
    }
  }

  // Check if remaining top-18% components form a title/credit strip separated cleanly from sprites below
  if (topBandCandidates.length >= 2) {
    let minX = sheetWidth;
    let maxX = 0;
    let maxY = 0;
    let maxCh = 0;
    for (const c of topBandCandidates) {
      if (c.x < minX) minX = c.x;
      if (c.x + c.w > maxX) maxX = c.x + c.w;
      if (c.y + c.h > maxY) maxY = c.y + c.h;
      if (c.h > maxCh) maxCh = c.h;
    }
    const tallBelowMinY = components
      .filter((c) => !excludedIds.has(c.id) && c.h >= 18 && c.y > maxY + 3)
      .reduce((m, c) => Math.min(m, c.y), sheetHeight);
    if (maxX - minX >= sheetWidth * 0.42 && maxCh <= Math.round(sheetHeight * 0.16) && tallBelowMinY > maxY + 3) {
      for (const c of topBandCandidates) {
        excludedIds.add(c.id);
      }
      excluded.push({
        x: minX,
        y: Math.min(...topBandCandidates.map((c) => c.y)),
        w: maxX - minX,
        h: maxY - Math.min(...topBandCandidates.map((c) => c.y)),
        reason: 'HEADER_BANNER'
      });
    }
  }

  // Pass B: Glyph-chain pixel text label detection (3+ adjacent small glyphs on shared baseline)
  const tallBodies = components.filter((c) => !excludedIds.has(c.id) && c.h >= 20);
  const glyphCandidates = components
    .filter((c) => !excludedIds.has(c.id) && !forceRestoredIds.has(c.id) && c.w <= 12 && c.h <= 14 && c.h >= 3)
    .sort((a, b) => a.y - b.y || a.x - b.x);

  const glyphRows: DetectedComponent[][] = [];
  for (const g of glyphCandidates) {
    const cy = g.y + g.h * 0.5;
    let row = glyphRows.find((r) => {
      const ref = r[0]!;
      const refCy = ref.y + ref.h * 0.5;
      const overlap = Math.max(0, Math.min(g.y + g.h, ref.y + ref.h) - Math.max(g.y, ref.y));
      return overlap >= Math.min(g.h, ref.h) * 0.4 || Math.abs(cy - refCy) <= 4;
    });
    if (!row) {
      row = [];
      glyphRows.push(row);
    }
    row.push(g);
  }

  for (const row of glyphRows) {
    row.sort((a, b) => a.x - b.x);
    let chain: DetectedComponent[] = [row[0]!];
    const flushChain = (seq: DetectedComponent[]) => {
      if (seq.length < 3) return;
      const minX = Math.min(...seq.map((s) => s.x));
      const minY = Math.min(...seq.map((s) => s.y));
      const maxX = Math.max(...seq.map((s) => s.x + s.w));
      const maxY = Math.max(...seq.map((s) => s.y + s.h));
      const bandCenterY = (minY + maxY) * 0.5;
      const overlapsTallBody = tallBodies.some(
        (b) => bandCenterY >= b.y && bandCenterY <= b.y + b.h && maxX >= b.x - 16 && minX <= b.x + b.w + 16
      );
      if (overlapsTallBody && minY > headerTopLimit) return;

      for (const s of seq) excludedIds.add(s.id);
      excluded.push({
        x: minX,
        y: minY,
        w: maxX - minX,
        h: maxY - minY,
        reason: 'TEXT_LABEL'
      });
    };

    for (let i = 1; i < row.length; i++) {
      const prev = row[i - 1]!;
      const cur = row[i]!;
      const gap = cur.x - (prev.x + prev.w);
      const cyDiff = Math.abs(cur.y + cur.h * 0.5 - (prev.y + prev.h * 0.5));
      if (gap <= 8 || (gap <= 14 && cyDiff <= 3)) {
        chain.push(cur);
      } else {
        flushChain(chain);
        chain = [cur];
      }
    }
    flushChain(chain);
  }

  const activeComponents = components.filter((c) => !excludedIds.has(c.id));
  return { activeComponents, excludedRegions: excluded };
}
