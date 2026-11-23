import crypto from 'node:crypto';
import {
  blit,
  cloneImage,
  createImage,
  encodeImageToPng,
  resizeNearest
} from './pngCodec.mjs';

export const STANDARD_ANIM_STATES = [
  { state: 'IDLE', row: 0, frames: 4, fps: 5, loop: true },
  { state: 'MOVE', row: 1, frames: 6, fps: 12, loop: true },
  { state: 'WINDUP', row: 2, frames: 3, fps: 10, loop: false },
  { state: 'ATTACK_MELEE', row: 3, frames: 4, fps: 14, loop: false, hitFrame: 2 },
  { state: 'ATTACK_CAST', row: 4, frames: 4, fps: 12, loop: false, hitFrame: 2 },
  { state: 'CLASH', row: 5, frames: 2, fps: 12, loop: true },
  { state: 'DODGE', row: 6, frames: 3, fps: 12, loop: false },
  { state: 'HIT', row: 7, frames: 2, fps: 10, loop: false },
  { state: 'DOWNED', row: 8, frames: 2, fps: 4, loop: true },
  { state: 'TRANSFORM', row: 9, frames: 4, fps: 10, loop: false, hitFrame: 2 },
  { state: 'VICTORY', row: 10, frames: 3, fps: 6, loop: true }
];

const VALID_CELL_SIZES = [48, 64, 96, 128];

function findDominantRgb(img) {
  const counts = new Map();
  let sampled = 0;
  for (let y = 0; y < img.height; y += 2) {
    for (let x = 0; x < img.width; x += 2) {
      const idx = (y * img.width + x) * 4;
      if (img.data[idx + 3] < 16) continue;
      const key = (img.data[idx] << 16) | (img.data[idx + 1] << 8) | img.data[idx + 2];
      counts.set(key, (counts.get(key) ?? 0) + 1);
      sampled++;
    }
  }
  let bestKey = 0;
  let bestCount = 0;
  for (const [k, c] of counts.entries()) {
    if (c > bestCount) {
      bestCount = c;
      bestKey = k;
    }
  }
  return {
    r: (bestKey >> 16) & 255,
    g: (bestKey >> 8) & 255,
    b: bestKey & 255,
    ratio: bestCount / Math.max(1, sampled)
  };
}

/**
 * Removes solid chroma-key / rip sheet background pixels while preserving existing transparency.
 */
export function removeChromaKeyBackground(img, tolerance = 22) {
  const out = cloneImage(img);
  const totalPixels = out.width * out.height;
  let transparentCount = 0;
  for (let i = 3; i < out.data.length; i += 4) {
    if (out.data[i] < 16) transparentCount++;
  }
  if (transparentCount / Math.max(1, totalPixels) > 0.1) {
    return out;
  }

  const dominant = findDominantRgb(out);
  const borderCounts = new Map();
  const samplePixel = (x, y) => {
    const idx = (y * out.width + x) * 4;
    const key = (out.data[idx] << 16) | (out.data[idx + 1] << 8) | out.data[idx + 2];
    borderCounts.set(key, (borderCounts.get(key) ?? 0) + 1);
  };
  for (let x = 0; x < out.width; x++) {
    samplePixel(x, 0);
    samplePixel(x, out.height - 1);
  }
  for (let y = 0; y < out.height; y++) {
    samplePixel(0, y);
    samplePixel(out.width - 1, y);
  }
  let borderKey = 0;
  let maxBorder = -1;
  for (const [k, c] of borderCounts.entries()) {
    if (c > maxBorder) {
      maxBorder = c;
      borderKey = k;
    }
  }

  const bgR = dominant.ratio >= 0.3 ? dominant.r : (borderKey >> 16) & 255;
  const bgG = dominant.ratio >= 0.3 ? dominant.g : (borderKey >> 8) & 255;
  const bgB = dominant.ratio >= 0.3 ? dominant.b : borderKey & 255;

  if (dominant.ratio >= 0.3) {
    const tightTol = 12;
    for (let i = 0; i < out.data.length; i += 4) {
      const dr = Math.abs(out.data[i] - bgR);
      const dg = Math.abs(out.data[i + 1] - bgG);
      const db = Math.abs(out.data[i + 2] - bgB);
      if (dr + dg + db <= tightTol) {
        out.data[i + 3] = 0;
      }
    }
  }

  const visited = new Uint8Array(totalPixels);
  const queue = new Int32Array(totalPixels);
  let head = 0;
  let tail = 0;
  const matchesBg = (idx) => {
    const off = idx * 4;
    if (out.data[off + 3] < 16) return true;
    const dr = Math.abs(out.data[off] - bgR);
    const dg = Math.abs(out.data[off + 1] - bgG);
    const db = Math.abs(out.data[off + 2] - bgB);
    return dr <= tolerance && dg <= tolerance && db <= tolerance;
  };
  const tryPush = (x, y) => {
    if (x < 0 || x >= out.width || y < 0 || y >= out.height) return;
    const idx = y * out.width + x;
    if (visited[idx] || !matchesBg(idx)) return;
    visited[idx] = 1;
    queue[tail++] = idx;
  };

  for (let x = 0; x < out.width; x++) {
    tryPush(x, 0);
    tryPush(x, out.height - 1);
  }
  for (let y = 0; y < out.height; y++) {
    tryPush(0, y);
    tryPush(out.width - 1, y);
  }

  while (head < tail) {
    const idx = queue[head++];
    out.data[idx * 4 + 3] = 0;
    const x = idx % out.width;
    const y = (idx - x) / out.width;
    tryPush(x + 1, y);
    tryPush(x - 1, y);
    tryPush(x, y + 1);
    tryPush(x, y - 1);
  }

  return out;
}

function measureBoxChroma(img, box) {
  let opaque = 0;
  let colored = 0;
  for (let y = box.y; y < box.y + box.h; y++) {
    for (let x = box.x; x < box.x + box.w; x++) {
      const i = (y * img.width + x) * 4;
      if (img.data[i + 3] < 16) continue;
      opaque++;
      const r = img.data[i];
      const g = img.data[i + 1];
      const b = img.data[i + 2];
      const maxC = Math.max(r, g, b);
      const minC = Math.min(r, g, b);
      if (maxC - minC >= 24) colored++;
    }
  }
  return colored / Math.max(1, opaque);
}

/**
 * 8-connected component labeling with fragment-only merge and smoke/SFX-kana filtering.
 */
export function extractConnectedFrames(img, options = {}) {
  const { minArea = 56, maxFrames = 320 } = options;
  const { width, height, data } = img;
  const visited = new Uint8Array(width * height);
  const queue = new Int32Array(width * height);
  const rawBoxes = [];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const startIdx = y * width + x;
      if (visited[startIdx] || data[startIdx * 4 + 3] < 16) continue;

      let head = 0;
      let tail = 0;
      visited[startIdx] = 1;
      queue[tail++] = startIdx;

      let minX = x;
      let minY = y;
      let maxX = x;
      let maxY = y;
      let area = 0;

      while (head < tail) {
        const idx = queue[head++];
        const cx = idx % width;
        const cy = (idx - cx) / width;
        area++;
        if (cx < minX) minX = cx;
        if (cx > maxX) maxX = cx;
        if (cy < minY) minY = cy;
        if (cy > maxY) maxY = cy;

        for (let dy = -1; dy <= 1; dy++) {
          const ny = cy + dy;
          if (ny < 0 || ny >= height) continue;
          for (let dx = -1; dx <= 1; dx++) {
            const nx = cx + dx;
            if (nx < 0 || nx >= width) continue;
            const nIdx = ny * width + nx;
            if (!visited[nIdx] && data[nIdx * 4 + 3] >= 16) {
              visited[nIdx] = 1;
              queue[tail++] = nIdx;
            }
          }
        }
      }

      if (area >= minArea) {
        const bw = maxX - minX + 1;
        const bh = maxY - minY + 1;
        const isDivider = bw > width * 0.45 && bh <= 14;
        const isBannerText = bw > 140 && bh <= 22 && area < bw * bh * 0.65;
        if (!isDivider && !isBannerText) {
          rawBoxes.push({ x: minX, y: minY, w: bw, h: bh, area });
        }
      }
    }
  }

  // Only merge small detached fragments (hats/hands/fx) into nearby larger character boxes;
  // NEVER merge two full-sized adjacent frames!
  const sortedAreas = rawBoxes.map((b) => b.area).sort((a, b) => a - b);
  const medianArea = sortedAreas.length > 0 ? sortedAreas[Math.floor(sortedAreas.length * 0.5)] : 400;
  const smallThresh = Math.max(120, Math.round(medianArea * 0.35));

  let merged = true;
  const boxes = rawBoxes.slice();
  while (merged) {
    merged = false;
    for (let i = 0; i < boxes.length; i++) {
      const a = boxes[i];
      if (!a) continue;
      for (let j = i + 1; j < boxes.length; j++) {
        const b = boxes[j];
        if (!b) continue;
        const oneIsSmall = a.area < smallThresh || b.area < smallThresh;
        if (!oneIsSmall) continue;
        const overlaps =
          a.x - 2 <= b.x + b.w &&
          a.x + a.w + 2 >= b.x &&
          a.y - 2 <= b.y + b.h &&
          a.y + a.h + 2 >= b.y;
        if (overlaps) {
          const nx = Math.min(a.x, b.x);
          const ny = Math.min(a.y, b.y);
          const nMaxX = Math.max(a.x + a.w, b.x + b.w);
          const nMaxY = Math.max(a.y + a.h, b.y + b.h);
          boxes[i] = {
            x: nx,
            y: ny,
            w: nMaxX - nx,
            h: nMaxY - ny,
            area: a.area + b.area
          };
          boxes.splice(j, 1);
          merged = true;
          break;
        }
      }
      if (merged) break;
    }
  }

  const heights = boxes.map((b) => b.h).sort((a, b) => a - b);
  const medianH = heights.length > 0 ? heights[Math.floor(heights.length * 0.6)] : 36;
  const minH = Math.max(20, Math.round(medianH * 0.55));
  const maxAllowedDim = Math.max(145, Math.round(medianH * 2.9));

  const sized = boxes
    .filter(
      (b) =>
        b.h >= minH &&
        b.w >= 14 &&
        b.w <= maxAllowedDim &&
        b.h <= maxAllowedDim &&
        !(b.y < 60 && b.w > 180)
    )
    .map((b) => ({ ...b, chroma: measureBoxChroma(img, b) }));

  // Keep colored character poses over grayscale smoke clouds / kana overlays
  const avgTopChroma =
    sized.slice(0, Math.min(12, sized.length)).reduce((s, b) => s + b.chroma, 0) /
    Math.max(1, Math.min(12, sized.length));
  const chromaFiltered =
    avgTopChroma >= 0.08 ? sized.filter((b) => b.chroma >= 0.05) : sized;
  const basePool = chromaFiltered.length >= 4 ? chromaFiltered : sized;

  // Build character body signature palette (skin + primary outfit) from first 8 poses
  // to reject standalone blue/cyan Japanese SFX katakana stamps (e.g., ゴォッ, ヒュッ)
  const sigColors = [];
  for (const b of basePool.slice(0, 8)) {
    for (let y = b.y; y < b.y + b.h; y += 2) {
      for (let x = b.x; x < b.x + b.w; x += 2) {
        const i = (y * width + x) * 4;
        if (data[i + 3] < 32) continue;
        const r = data[i], g = data[i + 1], bl = data[i + 2];
        // Skip near-pure black/white outline/eye pixels
        if ((r < 28 && g < 28 && bl < 28) || (r > 235 && g > 235 && bl > 235)) continue;
        sigColors.push((r << 16) | (g << 8) | bl);
      }
    }
  }
  const uniqueSig = [...new Set(sigColors)].slice(0, 64).map((k) => [(k >> 16) & 255, (k >> 8) & 255, k & 255]);
  const bodyFiltered = uniqueSig.length >= 4
    ? basePool.filter((b) => {
        let total = 0, matched = 0;
        for (let y = b.y; y < b.y + b.h; y += 2) {
          for (let x = b.x; x < b.x + b.w; x += 2) {
            const i = (y * width + x) * 4;
            if (data[i + 3] < 32) continue;
            total++;
            const r = data[i], g = data[i + 1], bl = data[i + 2];
            for (const [sr, sg, sb] of uniqueSig) {
              if (Math.abs(r - sr) + Math.abs(g - sg) + Math.abs(bl - sb) <= 45) {
                matched++;
                break;
              }
            }
          }
        }
        return matched / Math.max(1, total) >= 0.22;
      })
    : basePool;

  return (bodyFiltered.length >= 4 ? bodyFiltered : basePool).slice(0, maxFrames);
}

function groupBoxesIntoRows(boxes) {
  if (boxes.length === 0) return [];
  const sorted = boxes.slice().sort((a, b) => a.y - b.y);
  const medianH = sorted[Math.floor(sorted.length / 2)].h;
  const rowTol = Math.max(14, Math.round(medianH * 0.6));

  const rows = [];
  for (const box of sorted) {
    const centerY = box.y + box.h * 0.5;
    let targetRow = rows.find((r) => Math.abs(r.avgY - centerY) <= rowTol);
    if (!targetRow) {
      targetRow = { avgY: centerY, boxes: [] };
      rows.push(targetRow);
    }
    targetRow.boxes.push(box);
    targetRow.avgY =
      targetRow.boxes.reduce((sum, b) => sum + b.y + b.h * 0.5, 0) /
      targetRow.boxes.length;
  }

  for (const r of rows) {
    r.boxes.sort((a, b) => a.x - b.x);
  }
  return rows.map((r) => r.boxes).filter((r) => r.length >= 1);
}

function chooseCellSize(boxes, preferredSize) {
  if (preferredSize && VALID_CELL_SIZES.includes(preferredSize)) {
    return preferredSize;
  }
  const dims = boxes.map((b) => Math.max(b.w, b.h)).sort((a, b) => a - b);
  const p85 = dims[Math.min(dims.length - 1, Math.floor(dims.length * 0.85))] ?? 48;
  if (p85 <= 42) return 48;
  if (p85 <= 58) return 64;
  if (p85 <= 90) return 96;
  return 128;
}

function cropBox(img, box) {
  const cropped = createImage(box.w, box.h);
  blit(cropped, img, box.x, box.y, box.w, box.h, 0, 0, { alphaBlend: false });
  return cropped;
}

function stampAlignedFrame(sheet, cellW, cellH, col, row, frameImg, anchor) {
  const usableW = Math.max(16, cellW - 4);
  const targetFootY = Math.round(cellH * anchor.y);
  const usableH = Math.max(16, targetFootY - 2);
  let drawn = frameImg;
  if (frameImg.width > usableW || frameImg.height > usableH) {
    const scale = Math.min(usableW / frameImg.width, usableH / frameImg.height);
    const nw = Math.max(10, Math.round(frameImg.width * scale));
    const nh = Math.max(10, Math.round(frameImg.height * scale));
    drawn = resizeNearest(frameImg, nw, nh);
  }

  let bottomOpaqueY = drawn.height - 1;
  outer: for (let y = drawn.height - 1; y >= 0; y--) {
    for (let x = 0; x < drawn.width; x++) {
      if (drawn.data[(y * drawn.width + x) * 4 + 3] >= 16) {
        bottomOpaqueY = y;
        break outer;
      }
    }
  }

  const targetCenterX = Math.round(cellW * anchor.x);
  const dx = col * cellW + targetCenterX - Math.round(drawn.width * 0.5);
  const dy = row * cellH + targetFootY - bottomOpaqueY;
  blit(sheet, drawn, 0, 0, drawn.width, drawn.height, dx, dy, { alphaBlend: true });
}

function buildAnimationMap(existingAnimations) {
  const animations = {};
  for (const def of STANDARD_ANIM_STATES) {
    const base = existingAnimations?.[def.state];
    animations[def.state] = {
      row: def.row,
      frames: base?.frames ?? def.frames,
      fps: base?.fps ?? def.fps,
      loop: base?.loop ?? def.loop,
      ...(def.hitFrame !== undefined ? { hitFrame: base?.hitFrame ?? def.hitFrame } : {})
    };
  }
  return animations;
}

/**
 * Normalizes any external character sheet PNG into the engine's canonical
 * 6-column x 11-row sprite sheet with 0px foot baseline error and < 1 MiB PNG.
 */
export function normalizeSpriteSheet(rawImg, options) {
  const {
    key,
    unitId = key.split('_')[0],
    formId = key.split('_').slice(1).join('_') || 'base',
    rigType = 'humanoid_brawler',
    anchor = { x: 0.5, y: 0.9 },
    preferredSize = null,
    existingAnimations = null,
    source = 'EXTERNAL_WEB_SHEET'
  } = options;

  const clean = removeChromaKeyBackground(rawImg);
  const boxes = extractConnectedFrames(clean);
  if (boxes.length === 0) {
    throw new Error(`No opaque sprite frames detected for "${key}"`);
  }

  const rows = groupBoxesIntoRows(boxes);
  const actionRows = rows.filter((r) => r.length >= 2);
  const poolRows = actionRows.length >= 3 ? actionRows : rows;
  let cellSize = chooseCellSize(boxes, preferredSize);
  const animations = buildAnimationMap(existingAnimations);

  const packWithSize = (size) => {
    const sheet = createImage(size * 6, size * STANDARD_ANIM_STATES.length);
    for (let rIdx = 0; rIdx < STANDARD_ANIM_STATES.length; rIdx++) {
      const def = STANDARD_ANIM_STATES[rIdx];
      const clipFrames = Math.max(1, animations[def.state].frames);
      const sourceRow = poolRows[rIdx % poolRows.length] ?? rows[0];
      for (let c = 0; c < clipFrames; c++) {
        const box = sourceRow[c % sourceRow.length];
        const cropped = cropBox(clean, box);
        stampAlignedFrame(sheet, size, size, c, rIdx, cropped, anchor);
      }
    }
    return sheet;
  };

  let sheetImg = packWithSize(cellSize);
  let pngBuffer = encodeImageToPng(sheetImg);

  let sizeIdx = VALID_CELL_SIZES.indexOf(cellSize);
  while (pngBuffer.byteLength >= 980 * 1024 && sizeIdx > 0) {
    sizeIdx -= 1;
    cellSize = VALID_CELL_SIZES[sizeIdx];
    sheetImg = packWithSize(cellSize);
    pngBuffer = encodeImageToPng(sheetImg);
  }

  const sha256 = crypto.createHash('sha256').update(pngBuffer).digest('hex');
  const meta = {
    key,
    unitId,
    formId,
    rigType,
    frameWidth: cellSize,
    frameHeight: cellSize,
    sheetWidth: sheetImg.width,
    sheetHeight: sheetImg.height,
    anchor,
    source,
    sha256,
    bakedAt: new Date().toISOString(),
    animations
  };

  return {
    pngBuffer,
    meta,
    frameWidth: cellSize,
    frameHeight: cellSize,
    frameCountDetected: boxes.length
  };
}
