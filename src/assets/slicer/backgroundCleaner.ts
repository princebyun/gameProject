import { cloneSurface, type ExcludedRegion, type RgbaSurface } from './slicerTypes';

function maxChannelDist(
  r1: number,
  g1: number,
  b1: number,
  r2: number,
  g2: number,
  b2: number
): number {
  const dr = Math.abs(r1 - r2);
  const dg = Math.abs(g1 - g2);
  const db = Math.abs(b1 - b2);
  return dr >= dg && dr >= db ? dr : dg >= db ? dg : db;
}

function sampleDominantBorderColors(img: RgbaSurface): {
  primary: [number, number, number];
  secondary: [number, number, number] | null;
} {
  const { width: w, height: h, data } = img;
  const counts = new Map<number, { count: number; rSum: number; gSum: number; bSum: number }>();
  let totalWeight = 0;

  const tally = (x: number, y: number, weight: number) => {
    const idx = (y * w + x) * 4;
    if ((data[idx + 3] ?? 0) < 16) return;
    const r = data[idx] ?? 0;
    const g = data[idx + 1] ?? 0;
    const b = data[idx + 2] ?? 0;
    const q = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
    const cur = counts.get(q) ?? { count: 0, rSum: 0, gSum: 0, bSum: 0 };
    cur.count += weight;
    cur.rSum += r * weight;
    cur.gSum += g * weight;
    cur.bSum += b * weight;
    counts.set(q, cur);
    totalWeight += weight;
  };

  for (let x = 0; x < w; x++) {
    const wTop = x === 0 || x === w - 1 ? 6 : 1;
    tally(x, 0, wTop);
    tally(x, h - 1, wTop);
  }
  for (let y = 1; y < h - 1; y++) {
    tally(0, y, 1);
    tally(w - 1, y, 1);
  }

  let top1 = { count: 0, rgb: [255, 0, 255] as [number, number, number] };
  let top2 = { count: 0, rgb: [0, 0, 0] as [number, number, number] };
  for (const bucket of counts.values()) {
    const rgb: [number, number, number] = [
      Math.round(bucket.rSum / bucket.count),
      Math.round(bucket.gSum / bucket.count),
      Math.round(bucket.bSum / bucket.count)
    ];
    if (bucket.count > top1.count) {
      top2 = top1;
      top1 = { count: bucket.count, rgb };
    } else if (bucket.count > top2.count) {
      top2 = { count: bucket.count, rgb };
    }
  }

  const secDist = maxChannelDist(...top1.rgb, ...top2.rgb);
  const secondary =
    totalWeight > 0 && top2.count / totalWeight > 0.18 && secDist > 28 ? top2.rgb : null;
  return { primary: top1.rgb, secondary };
}

function floodClearOuterCanvas(
  out: RgbaSurface,
  clearedMask: Uint8Array,
  primary: [number, number, number],
  secondary: [number, number, number] | null,
  tol: number
): void {
  const { width: w, height: h, data } = out;
  const total = w * h;
  const visited = new Uint8Array(total);
  const queue = new Int32Array(total);
  let head = 0;
  let tail = 0;

  const isOuterBg = (pos: number): boolean => {
    const idx = pos * 4;
    if ((data[idx + 3] ?? 0) < 16) return true;
    const r = data[idx] ?? 0;
    const g = data[idx + 1] ?? 0;
    const b = data[idx + 2] ?? 0;
    return (
      maxChannelDist(r, g, b, primary[0], primary[1], primary[2]) <= tol ||
      Boolean(secondary && maxChannelDist(r, g, b, secondary[0], secondary[1], secondary[2]) <= tol)
    );
  };

  const pushSeed = (x: number, y: number) => {
    const pos = y * w + x;
    if (!visited[pos] && isOuterBg(pos)) {
      visited[pos] = 1;
      queue[tail++] = pos;
    }
  };

  for (let x = 0; x < w; x++) {
    pushSeed(x, 0);
    pushSeed(x, h - 1);
  }
  for (let y = 1; y < h - 1; y++) {
    pushSeed(0, y);
    pushSeed(w - 1, y);
  }

  while (head < tail) {
    const pos = queue[head++]!;
    const idx = pos * 4;
    if ((data[idx + 3] ?? 0) >= 16) {
      clearedMask[pos] = 1;
      data[idx + 3] = 0;
    }
    const px = pos % w;
    const py = (pos - px) / w;
    if (px > 0 && !visited[pos - 1] && isOuterBg(pos - 1)) { visited[pos - 1] = 1; queue[tail++] = pos - 1; }
    if (px + 1 < w && !visited[pos + 1] && isOuterBg(pos + 1)) { visited[pos + 1] = 1; queue[tail++] = pos + 1; }
    if (py > 0 && !visited[pos - w] && isOuterBg(pos - w)) { visited[pos - w] = 1; queue[tail++] = pos - w; }
    if (py + 1 < h && !visited[pos + w] && isOuterBg(pos + w)) { visited[pos + w] = 1; queue[tail++] = pos + w; }
  }
}

function clearInnerContainerBoxes(out: RgbaSurface, clearedMask: Uint8Array, tol: number): void {
  const { width: w, height: h, data } = out;
  const total = w * h;
  const visited = new Uint8Array(total);
  const regionMask = new Uint8Array(total);
  const queue = new Int32Array(total);
  const minArea = Math.max(400, Math.floor(total * 0.008));
  const innerTol = Math.max(8, Math.round(tol * 0.65));

  for (let start = 0; start < total; start++) {
    if (visited[start] || (data[start * 4 + 3] ?? 0) < 200) continue;
    const sr = data[start * 4] ?? 0;
    const sg = data[start * 4 + 1] ?? 0;
    const sb = data[start * 4 + 2] ?? 0;

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

      const tryPush = (np: number) => {
        if (visited[np]) return;
        const nIdx = np * 4;
        if ((data[nIdx + 3] ?? 0) < 200) return;
        if (maxChannelDist(data[nIdx]!, data[nIdx + 1]!, data[nIdx + 2]!, sr, sg, sb) > innerTol) {
          return;
        }
        visited[np] = 1;
        queue[tail++] = np;
      };

      if (px > 0) tryPush(pos - 1);
      if (px + 1 < w) tryPush(pos + 1);
      if (py > 0) tryPush(pos - w);
      if (py + 1 < h) tryPush(pos + w);
    }

    const bw = maxX - minX + 1;
    const bh = maxY - minY + 1;
    if (tail < minArea || bw < 24 || bh < 24 || (bw >= w * 0.6 && bh <= 4)) continue;

    for (let i = 0; i < tail; i++) regionMask[queue[i]!] = 1;

    let borderHits = 0;
    let borderTotal = 0;
    for (let x = minX; x <= maxX; x++) {
      borderTotal += 2;
      if (regionMask[minY * w + x]) borderHits += 1;
      if (regionMask[maxY * w + x]) borderHits += 1;
    }
    for (let y = minY + 1; y < maxY; y++) {
      borderTotal += 2;
      if (regionMask[y * w + minX]) borderHits += 1;
      if (regionMask[y * w + maxX]) borderHits += 1;
    }
    const edgeScore = borderHits / Math.max(1, borderTotal);
    const fillRatio = tail / Math.max(1, bw * bh);
    // Straight rectangular box panel (either >=58% border linearity or encloses sprites inside)
    if (edgeScore >= 0.58 || (edgeScore >= 0.4 && fillRatio < 0.88)) {
      for (let i = 0; i < tail; i++) {
        const pos = queue[i]!;
        clearedMask[pos] = 1;
        data[pos * 4 + 3] = 0;
      }
    }
    for (let i = 0; i < tail; i++) regionMask[queue[i]!] = 0;
  }
}

function clearDividerBars(
  out: RgbaSurface,
  clearedMask: Uint8Array,
  tol: number
): ExcludedRegion[] {
  const { width: w, height: h, data } = out;
  const divRegions: ExcludedRegion[] = [];
  const rowFlag = new Uint8Array(h);

  const isUniformSpanRow = (y: number): { ok: boolean; minX: number; maxX: number } => {
    const qCounts = new Map<number, number>();
    let opaqueCount = 0;
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4;
      if ((data[idx + 3] ?? 0) < 32) continue;
      opaqueCount += 1;
      const q = ((data[idx]! >> 4) << 8) | ((data[idx + 1]! >> 4) << 4) | (data[idx + 2]! >> 4);
      qCounts.set(q, (qCounts.get(q) ?? 0) + 1);
    }
    if (opaqueCount < w * 0.6) return { ok: false, minX: 0, maxX: 0 };
    let bestQ = -1;
    let bestC = 0;
    for (const [q, c] of qCounts.entries()) {
      if (c > bestC) {
        bestC = c;
        bestQ = q;
      }
    }
    if (bestC < w * 0.6 || bestQ < 0) return { ok: false, minX: 0, maxX: 0 };
    const tr = ((bestQ >> 8) & 15) * 17;
    const tg = ((bestQ >> 4) & 15) * 17;
    const tb = (bestQ & 15) * 17;
    let runMin = w;
    let runMax = -1;
    let hits = 0;
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4;
      if ((data[idx + 3] ?? 0) >= 32 && maxChannelDist(data[idx]!, data[idx + 1]!, data[idx + 2]!, tr, tg, tb) <= Math.max(24, tol + 8)) {
        hits += 1;
        if (x < runMin) runMin = x;
        if (x > runMax) runMax = x;
      }
    }
    return { ok: hits >= w * 0.6, minX: runMin, maxX: runMax };
  };

  for (let y = 0; y < h; y++) {
    if (isUniformSpanRow(y).ok) rowFlag[y] = 1;
  }
  for (let y = 0; y < h; ) {
    if (!rowFlag[y]) {
      y += 1;
      continue;
    }
    let yEnd = y;
    while (yEnd + 1 < h && rowFlag[yEnd + 1]) yEnd += 1;
    const thickness = yEnd - y + 1;
    if (thickness >= 1 && thickness <= 4) {
      let minX = w;
      let maxX = -1;
      for (let ry = y; ry <= yEnd; ry++) {
        const info = isUniformSpanRow(ry);
        if (info.minX < minX) minX = info.minX;
        if (info.maxX > maxX) maxX = info.maxX;
        for (let x = 0; x < w; x++) {
          const pos = ry * w + x;
          if ((data[pos * 4 + 3] ?? 0) >= 16) {
            clearedMask[pos] = 1;
            data[pos * 4 + 3] = 0;
          }
        }
      }
      if (maxX >= minX) {
        divRegions.push({ x: minX, y, w: maxX - minX + 1, h: thickness, reason: 'DIVIDER_LINE' });
      }
    }
    y = yEnd + 1;
  }

  // Vertical dividers (1..4px thick spanning >= 60% height)
  const colFlag = new Uint8Array(w);
  for (let x = 0; x < w; x++) {
    let opaqueCol = 0;
    for (let y = 0; y < h; y++) {
      if ((data[(y * w + x) * 4 + 3] ?? 0) >= 32) opaqueCol += 1;
    }
    if (opaqueCol >= h * 0.6) colFlag[x] = 1;
  }
  for (let x = 0; x < w; ) {
    if (!colFlag[x]) {
      x += 1;
      continue;
    }
    let xEnd = x;
    while (xEnd + 1 < w && colFlag[xEnd + 1]) xEnd += 1;
    if (xEnd - x + 1 <= 4) {
      for (let rx = x; rx <= xEnd; rx++) {
        for (let y = 0; y < h; y++) {
          const pos = y * w + rx;
          if ((data[pos * 4 + 3] ?? 0) >= 16) {
            clearedMask[pos] = 1;
            data[pos * 4 + 3] = 0;
          }
        }
      }
      divRegions.push({ x, y: 0, w: xEnd - x + 1, h, reason: 'DIVIDER_LINE' });
    }
    x = xEnd + 1;
  }

  return divRegions;
}

function cleanupOuterFringe(
  raw: RgbaSurface,
  out: RgbaSurface,
  clearedMask: Uint8Array,
  tol: number
): void {
  const { width: w, height: h, data } = out;
  const rawData = raw.data;
  const fringeTol = Math.round(tol * 1.35);
  const toClear: number[] = [];

  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const pos = y * w + x;
      const idx = pos * 4;
      const a = data[idx + 3] ?? 0;
      if (a === 0 || clearedMask[pos]) continue;

      let refPos = -1;
      if (clearedMask[pos - 1]) refPos = pos - 1;
      else if (clearedMask[pos + 1]) refPos = pos + 1;
      else if (clearedMask[pos - w]) refPos = pos - w;
      else if (clearedMask[pos + w]) refPos = pos + w;
      if (refPos < 0) continue;

      const rIdx = refPos * 4;
      const dist = maxChannelDist(
        data[idx]!,
        data[idx + 1]!,
        data[idx + 2]!,
        rawData[rIdx]!,
        rawData[rIdx + 1]!,
        rawData[rIdx + 2]!
      );
      if (a < 110 || dist <= fringeTol) {
        toClear.push(pos);
      }
    }
  }

  for (let i = 0; i < toClear.length; i++) {
    data[toClear[i]! * 4 + 3] = 0;
  }
}

/**
 * Step 1.1: MultiLayerBackgroundCleaner
 * Removes outer canvas background via corner flood-fill, inner rectangular panel backgrounds,
 * spanning 1-4px divider bars, and 1px color fringe bleeding.
 */
export function cleanIrregularSheetBackground(
  raw: RgbaSurface,
  tolerance = 18
): {
  cleaned: RgbaSurface;
  dividerRegions: ExcludedRegion[];
  dominantBgRgb: [number, number, number];
} {
  const out = cloneSurface(raw);
  const clearedMask = new Uint8Array(raw.width * raw.height);
  const { primary, secondary } = sampleDominantBorderColors(raw);

  floodClearOuterCanvas(out, clearedMask, primary, secondary, tolerance);
  clearInnerContainerBoxes(out, clearedMask, tolerance);
  const dividerRegions = clearDividerBars(out, clearedMask, tolerance);
  cleanupOuterFringe(raw, out, clearedMask, tolerance);

  return { cleaned: out, dividerRegions, dominantBgRgb: primary };
}
