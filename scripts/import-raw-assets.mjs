#!/usr/bin/env node
/**
 * Automatic Raw Asset Classifier, De-Fringer & Pixel-Art Importer for One Piece Grand Voyage.
 * Scans `raw_assets/`, classifies Portrait Sheets / Action Strips / Standing Masters,
 * strips chroma-key backgrounds + magenta/green edge halos (De-fringing),
 * slices & foot-aligns frames into `public/assets/sprites/` + `.meta.json`
 * and `public/assets/portraits/` (64x64).
 */
import fs from 'node:fs';
import path from 'node:path';
import { decodePng, encodePng } from './pixelize-sprite.mjs';

const RAW_DIR = path.resolve(process.cwd(), 'raw_assets');
const OUT_SPRITES_DIR = path.resolve(process.cwd(), 'public/assets/sprites');
const OUT_PORTRAITS_DIR = path.resolve(process.cwd(), 'public/assets/portraits');

const PORTRAIT_EMOTIONS_8 = [
  'normal',
  'angry',
  'determined',
  'shocked',
  'smirk',
  'sad',
  'excited',
  'battle_cry'
];

function hexColor(r, g, b) {
  return (
    '#' +
    [r, g, b]
      .map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase()
  );
}

function isChromaKeyMatch(r, g, b, keyRgb, tol) {
  const dr = r - keyRgb[0];
  const dg = g - keyRgb[1];
  const db = b - keyRgb[2];
  return dr * dr + dg * dg + db * db <= tol * tol;
}

function isMagentaKey(keyRgb) {
  return keyRgb[0] > 180 && keyRgb[2] > 180 && keyRgb[1] < 80;
}

function isGreenKey(keyRgb) {
  return keyRgb[1] > 180 && keyRgb[0] < 80 && keyRgb[2] < 80;
}

/**
 * Checks if a pixel is a soft pink/lavender chroma fringe or AI corner watermark
 * when the sheet uses a magenta chroma background.
 */
function isMagentaSpillOrWatermark(r, g, b) {
  // Pure or pale magenta/lavender where R and B are both noticeably higher than G
  if (r > 185 && b > 185 && g < Math.min(r, b) - 24) return true;
  if (r > 215 && b > 215 && g < 220 && r - g > 18 && b - g > 18) return true;
  return false;
}

function isGreenSpill(r, g, b) {
  return g > 165 && r < g - 35 && b < g - 35;
}

/**
 * Removes background using:
 * 1) 4-edge BFS Flood Fill with generous tolerance (protects interior clothing/skin)
 * 2) Strict interior chroma-key hole cleanup (e.g., armpit/between-legs enclosed gaps)
 * 3) 2-pass De-Fringing around transparent borders (strips residual magenta/green halos
 *    and normalizes pink-tinted dark outline pixels into crisp dark ink #14101c).
 */
function cleanChromaAndDefringe(rgbaIn, width, height) {
  const rgba = new Uint8ClampedArray(rgbaIn);
  const keyRgb = [rgba[0], rgba[1], rgba[2]];
  const magentaMode = isMagentaKey(keyRgb);
  const greenMode = isGreenKey(keyRgb);
  const tol = 82;

  const total = width * height;
  const visited = new Uint8Array(total);
  const qx = new Int32Array(total);
  const qy = new Int32Array(total);
  let head = 0;
  let tail = 0;

  const trySeed = (x, y) => {
    const idx = y * width + x;
    if (visited[idx]) return;
    const p = idx * 4;
    if (
      rgba[p + 3] < 16 ||
      isChromaKeyMatch(rgba[p], rgba[p + 1], rgba[p + 2], keyRgb, tol) ||
      (magentaMode && isMagentaSpillOrWatermark(rgba[p], rgba[p + 1], rgba[p + 2])) ||
      (greenMode && isGreenSpill(rgba[p], rgba[p + 1], rgba[p + 2]))
    ) {
      visited[idx] = 1;
      qx[tail] = x;
      qy[tail] = y;
      tail += 1;
    }
  };

  for (let x = 0; x < width; x++) {
    trySeed(x, 0);
    trySeed(x, height - 1);
  }
  for (let y = 0; y < height; y++) {
    trySeed(0, y);
    trySeed(width - 1, y);
  }

  // Pass 1: Edge flood-fill
  while (head < tail) {
    const cx = qx[head];
    const cy = qy[head];
    head += 1;
    const p = (cy * width + cx) * 4;
    rgba[p + 3] = 0;

    if (cx > 0) trySeed(cx - 1, cy);
    if (cx + 1 < width) trySeed(cx + 1, cy);
    if (cy > 0) trySeed(cx, cy - 1);
    if (cy + 1 < height) trySeed(cx, cy + 1);
  }

  // Pass 2: Enclosed pure-chroma interior holes (e.g. gap inside bent arm) + watermark cleanup
  for (let i = 0; i < total; i++) {
    const p = i * 4;
    if (rgba[p + 3] === 0) continue;
    const r = rgba[p];
    const g = rgba[p + 1];
    const b = rgba[p + 2];
    if (
      isChromaKeyMatch(r, g, b, keyRgb, 58) ||
      (magentaMode && isMagentaSpillOrWatermark(r, g, b)) ||
      (greenMode && isGreenSpill(r, g, b))
    ) {
      rgba[p + 3] = 0;
    }
  }

  // Pass 3: 2-pixel border De-Fringing (strip faint magenta/green border fringe & clean dark ink edges)
  const dirs = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
    [1, 1],
    [-1, 1],
    [1, -1],
    [-1, -1]
  ];
  for (let pass = 0; pass < 2; pass++) {
    const snapshotAlpha = new Uint8Array(total);
    for (let i = 0; i < total; i++) snapshotAlpha[i] = rgba[i * 4 + 3];

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = y * width + x;
        if (snapshotAlpha[idx] === 0) continue;
        let touchesTransparent = false;
        for (const [dx, dy] of dirs) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || nx >= width || ny < 0 || ny >= height) {
            touchesTransparent = true;
            break;
          }
          if (snapshotAlpha[ny * width + nx] === 0) {
            touchesTransparent = true;
            break;
          }
        }
        if (!touchesTransparent) continue;

        const p = idx * 4;
        const r = rgba[p];
        const g = rgba[p + 1];
        const b = rgba[p + 2];

        if (magentaMode) {
          // Any pinkish/purple border anti-aliasing pixel adjacent to transparency
          const magentaExcess = Math.min(r, b) - g;
          if (magentaExcess > 28 && b > 95) {
            // If bright magenta fringe -> drop pixel cleanly
            if (r + b > 260) {
              rgba[p + 3] = 0;
            } else {
              // Dark purple-tinted outline edge -> normalize to crisp dark pixel ink
              rgba[p] = 20;
              rgba[p + 1] = 16;
              rgba[p + 2] = 28;
            }
          }
        } else if (greenMode) {
          if (g - Math.max(r, b) > 25) {
            if (g > 130) {
              rgba[p + 3] = 0;
            } else {
              rgba[p] = 20;
              rgba[p + 1] = 16;
              rgba[p + 2] = 28;
            }
          }
        }
      }
    }
  }

  return { rgba, keyHex: hexColor(keyRgb[0], keyRgb[1], keyRgb[2]) };
}

/**
 * Extracts a sub-region with an optional pixel predicate mask and computes tight opaque bounds.
 */
function extractRegionWithTightBounds(rgba, srcW, srcH, x0, y0, x1, y1, predicate = null) {
  let minX = srcW;
  let maxX = -1;
  let minY = srcH;
  let maxY = -1;

  for (let y = Math.max(0, y0); y <= Math.min(srcH - 1, y1); y++) {
    for (let x = Math.max(0, x0); x <= Math.min(srcW - 1, x1); x++) {
      if (predicate && !predicate(x, y)) continue;
      const a = rgba[(y * srcW + x) * 4 + 3];
      if (a >= 128) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX < minX || maxY < minY) {
    return null;
  }

  const w = maxX - minX + 1;
  const h = maxY - minY + 1;
  const out = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const sx = minX + x;
      const sy = minY + y;
      if (predicate && !predicate(sx, sy)) continue;
      const sIdx = (sy * srcW + sx) * 4;
      const dIdx = (y * w + x) * 4;
      out[dIdx] = rgba[sIdx];
      out[dIdx + 1] = rgba[sIdx + 1];
      out[dIdx + 2] = rgba[sIdx + 2];
      out[dIdx + 3] = rgba[sIdx + 3];
    }
  }
  return { rgba: out, width: w, height: h, minX, maxX, minY, maxY };
}

/**
 * Crisp Nearest-Neighbor center-sampled downsampler into a target canvas cell,
 * preserving exact aspect ratio and placing feet at `footRowY`.
 */
function blitNearestIntoCell(
  srcRgba,
  srcW,
  srcH,
  dstRgba,
  dstStrideW,
  cellX,
  cellY,
  cellSize,
  opts = {}
) {
  const mode = opts.mode ?? 'sprite'; // 'sprite' | 'portrait'
  const explicitScale = opts.scale ?? null;
  const padX = opts.padX ?? 2;
  const padTop = opts.padTop ?? 2;
  const footY = opts.footY ?? cellSize - 4; // anchor.y ~= 0.94

  let scale;
  if (explicitScale !== null) {
    scale = Math.min(explicitScale, (cellSize - padX * 2) / srcW, (footY - padTop) / srcH);
  } else if (mode === 'portrait') {
    scale = Math.min((cellSize - 2) / srcW, (cellSize - 2) / srcH);
  } else {
    scale = Math.min((cellSize - padX * 2) / srcW, (footY - padTop) / srcH);
  }

  const outW = Math.max(1, Math.round(srcW * scale));
  const outH = Math.max(1, Math.round(srcH * scale));
  const ox =
    opts.alignLeftPx !== undefined
      ? opts.alignLeftPx
      : Math.floor((cellSize - outW) * 0.5);
  const oy =
    mode === 'portrait'
      ? Math.max(0, cellSize - outH)
      : Math.max(0, footY - outH);

  // Sample pixel center (Nearest-Neighbor) — preserves crisp retro outlines without blurring
  for (let dy = 0; dy < outH; dy++) {
    const sy = Math.min(srcH - 1, Math.floor(((dy + 0.5) / outH) * srcH));
    for (let dx = 0; dx < outW; dx++) {
      const sx = Math.min(srcW - 1, Math.floor(((dx + 0.5) / outW) * srcW));
      const sIdx = (sy * srcW + sx) * 4;
      if (srcRgba[sIdx + 3] < 128) continue;

      const tx = cellX + ox + dx;
      const ty = cellY + oy + dy;
      if (tx < cellX || tx >= cellX + cellSize || ty < cellY || ty >= cellY + cellSize) {
        continue;
      }
      const dIdx = (ty * dstStrideW + tx) * 4;
      dstRgba[dIdx] = srcRgba[sIdx];
      dstRgba[dIdx + 1] = srcRgba[sIdx + 1];
      dstRgba[dIdx + 2] = srcRgba[sIdx + 2];
      dstRgba[dIdx + 3] = 255;
    }
  }

  return { outW, outH, ox, oy, scale };
}

/**
 * Final 1px border de-fringe pass on a downsampled 64x64 cell to guarantee ZERO residual
 * magenta/purple anti-aliasing pixels anywhere along the silhouette border.
 */
function purgeResidualMagentaInCell(rgba, w, h) {
  const dirs = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1]
  ];
  for (let pass = 0; pass < 2; pass++) {
    const snapA = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) snapA[i] = rgba[i * 4 + 3];

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = y * w + x;
        const p = idx * 4;
        if (snapA[idx] === 0) continue;

        let touchesAlpha = false;
        for (const [dx, dy] of dirs) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || nx >= w || ny < 0 || ny >= h || snapA[ny * w + nx] === 0) {
            touchesAlpha = true;
            break;
          }
        }

        const r = rgba[p];
        const g = rgba[p + 1];
        const b = rgba[p + 2];

        // Pure bright magenta/pink anywhere -> transparent
        if (r > 155 && b > 155 && g < Math.min(r, b) - 28) {
          rgba[p + 3] = 0;
          continue;
        }

        // Border purple/plum anti-aliasing against black outline -> crisp dark ink or drop
        if (touchesAlpha && r > g + 14 && b > g + 14) {
          if (r + b >= 220) {
            rgba[p + 3] = 0;
          } else {
            rgba[p] = 18;
            rgba[p + 1] = 15;
            rgba[p + 2] = 22;
          }
        }
      }
    }
  }
}

/**
 * Classifies all PNG files in raw_assets/.
 */
function inspectAndClassifyRawAssets() {
  if (!fs.existsSync(RAW_DIR)) {
    throw new Error(`raw_assets directory not found at ${RAW_DIR}`);
  }
  const files = fs
    .readdirSync(RAW_DIR)
    .filter((f) => f.toLowerCase().endsWith('.png'))
    .sort();

  const report = [];
  for (const name of files) {
    const fullPath = path.join(RAW_DIR, name);
    const dec = decodePng(fs.readFileSync(fullPath));
    const lower = name.toLowerCase();
    const ratio = +(dec.width / dec.height).toFixed(2);
    const keyHex = hexColor(dec.rgba[0], dec.rgba[1], dec.rgba[2]);

    let category = 'STANDING_MASTER';
    if (lower.includes('portrait')) {
      category = 'PORTRAIT_SHEET_4X2';
    } else if (
      lower.includes('attack') ||
      lower.includes('idle') ||
      lower.includes('move') ||
      lower.includes('cast') ||
      lower.includes('dodge') ||
      lower.includes('transform')
    ) {
      category = 'ACTION_STRIP_4F';
    }

    report.push({
      fileName: name,
      fullPath,
      width: dec.width,
      height: dec.height,
      ratio,
      topLeftHex: keyHex,
      category,
      decoded: dec
    });
  }
  return report;
}

function processPortraitSheet(item) {
  const { width: w, height: h, rgba: rawRgba } = item.decoded;
  const cleaned = cleanChromaAndDefringe(rawRgba, w, h);

  // Detect exact 4x2 grid gutters via column/row occupancy
  const colCounts = new Int32Array(w);
  const rowCounts = new Int32Array(h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (cleaned.rgba[(y * w + x) * 4 + 3] >= 128) {
        colCounts[x] += 1;
        rowCounts[y] += 1;
      }
    }
  }

  const findSpans = (counts) => {
    const spans = [];
    let inSpan = false;
    let start = 0;
    for (let i = 0; i < counts.length; i++) {
      if (counts[i] > 2) {
        if (!inSpan) {
          inSpan = true;
          start = i;
        }
      } else if (inSpan) {
        if (i - start >= 40) spans.push([start, i - 1]);
        inSpan = false;
      }
    }
    if (inSpan && counts.length - start >= 40) spans.push([start, counts.length - 1]);
    return spans;
  };

  let xSpans = findSpans(colCounts);
  let ySpans = findSpans(rowCounts);
  if (xSpans.length !== 4) {
    const cw = Math.floor(w / 4);
    xSpans = [
      [0, cw - 1],
      [cw, cw * 2 - 1],
      [cw * 2, cw * 3 - 1],
      [cw * 3, w - 1]
    ];
  }
  if (ySpans.length !== 2) {
    const ch = Math.floor(h / 2);
    ySpans = [
      [0, ch - 1],
      [ch, h - 1]
    ];
  }

  fs.mkdirSync(OUT_PORTRAITS_DIR, { recursive: true });
  const outputs = [];

  for (let r = 0; r < 2; r++) {
    for (let c = 0; c < 4; c++) {
      const idx = r * 4 + c;
      const emotion = PORTRAIT_EMOTIONS_8[idx];
      const [x0, x1] = xSpans[c];
      const [y0, y1] = ySpans[r];

      // Exclude tiny floating spark noise in bottom-right corner if outside face
      const region = extractRegionWithTightBounds(
        cleaned.rgba,
        w,
        h,
        x0,
        y0,
        x1,
        y1
      );
      if (!region) continue;

      const outSize = 64;
      const cellRgba = new Uint8ClampedArray(outSize * outSize * 4);
      blitNearestIntoCell(
        region.rgba,
        region.width,
        region.height,
        cellRgba,
        outSize,
        0,
        0,
        outSize,
        { mode: 'portrait' }
      );
      purgeResidualMagentaInCell(cellRgba, outSize, outSize);

      const outPath = path.join(OUT_PORTRAITS_DIR, `luffy_${emotion}.png`);
      fs.writeFileSync(outPath, encodePng(outSize, outSize, cellRgba));
      outputs.push({
        emotion,
        outPath: path.relative(process.cwd(), outPath).replace(/\\/g, '/'),
        srcRect: { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 }
      });
    }
  }

  return outputs;
}

function processLuffySprites(standingItem, attackStripItem) {
  fs.mkdirSync(OUT_SPRITES_DIR, { recursive: true });
  const cellSize = 64;
  const footY = 60; // pivotY = 60/64 = 0.9375 (~0.94, matches anchor.y = 0.9 cleanly)

  const frames = [];

  // 1) IDLE Master from luffy_base.png
  let referenceScale = null;
  if (standingItem) {
    const { width: w, height: h, rgba: rawRgba } = standingItem.decoded;
    const cleaned = cleanChromaAndDefringe(rawRgba, w, h);
    // Keep only main character (ignore any residual corner artifact > x=820)
    const idleRegion = extractRegionWithTightBounds(
      cleaned.rgba,
      w,
      h,
      0,
      0,
      Math.min(w - 1, 820),
      h - 1
    );
    if (idleRegion) {
      referenceScale = (footY - 4) / idleRegion.height;
      frames.push({
        label: 'IDLE_0',
        region: idleRegion,
        pivotX: 0.5,
        pivotY: 0.94,
        scale: referenceScale
      });
    }
  }

  // 2) 4-frame ATTACK_MELEE strip from luffy_base_attack_melee.png
  if (attackStripItem) {
    const { width: w, height: h, rgba: rawRgba } = attackStripItem.decoded;
    const cleaned = cleanChromaAndDefringe(rawRgba, w, h);

    // Piecewise clean slicing matching exact 2D pose boundaries (zero punch/foot clipping!):
    // - Frame 0 (Windup):       x <= 263
    // - Frame 1 (Pistol Punch): x >= 265, and (y < 380 ? x <= 564 : x <= 511)
    // - Frame 2 (Impact+Spark): (y < 380 ? x >= 565 : x >= 512) and (y < 330 ? x <= 804 : x <= 764)
    //   Wait: Frame 3's left elbow enters x=765 at y=280..360; keep sparks (x<=798, y<298) in Frame 2 cleanly!
    const predicates = [
      (x) => x <= 263,
      (x, y) => x >= 265 && (y < 380 ? x <= 564 : x <= 511),
      (x, y) =>
        (y < 380 ? x >= 565 : x >= 512) &&
        (y < 298 ? x <= 798 : x <= 762),
      (x, y) => (y < 298 ? x >= 799 : x >= 763)
    ];

    const attackPivotXs = [0.5, 0.42, 0.42, 0.5];
    // Compute uniform scale across all 4 attack frames based on frame 0/3 body height so Luffy never shrinks/grows mid-punch
    const rawRegions = predicates.map((pred) =>
      extractRegionWithTightBounds(cleaned.rgba, w, h, 0, 0, w - 1, h - 1, pred)
    );
    const bodyHeights = rawRegions.filter(Boolean).map((r) => r.height);
    const uniformAttackScale =
      bodyHeights.length > 0
        ? (footY - 4) / Math.max(...bodyHeights)
        : (referenceScale ?? 0.14);

    rawRegions.forEach((region, idx) => {
      if (!region) return;
      frames.push({
        label: `ATTACK_MELEE_${idx}`,
        region,
        pivotX: attackPivotXs[idx],
        pivotY: 0.94,
        scale: uniformAttackScale
      });
    });
  }

  const totalFrames = frames.length;
  const sheetW = totalFrames * cellSize;
  const sheetH = cellSize;
  const sheetRgba = new Uint8ClampedArray(sheetW * sheetH * 4);

  const atlasRects = [];
  frames.forEach((fr, idx) => {
    const cellX = idx * cellSize;
    const placed = blitNearestIntoCell(
      fr.region.rgba,
      fr.region.width,
      fr.region.height,
      sheetRgba,
      sheetW,
      cellX,
      0,
      cellSize,
      {
        mode: 'sprite',
        scale: fr.scale,
        footY,
        padX: 1,
        padTop: 2
      }
    );
    atlasRects.push({
      label: fr.label,
      x: cellX,
      y: 0,
      w: cellSize,
      h: cellSize,
      pivotX: fr.pivotX,
      pivotY: fr.pivotY,
      placed
    });
  });

  purgeResidualMagentaInCell(sheetRgba, sheetW, sheetH);

  const outPngPath = path.join(OUT_SPRITES_DIR, 'luffy_base.png');
  fs.writeFileSync(outPngPath, encodePng(sheetW, sheetH, sheetRgba));

  const idleFrame = {
    x: atlasRects[0].x,
    y: atlasRects[0].y,
    w: atlasRects[0].w,
    h: atlasRects[0].h,
    pivotX: atlasRects[0].pivotX,
    pivotY: atlasRects[0].pivotY
  };
  const meleeFrames =
    atlasRects.length >= 5
      ? atlasRects.slice(1, 5).map((r) => ({
          x: r.x,
          y: r.y,
          w: r.w,
          h: r.h,
          pivotX: r.pivotX,
          pivotY: r.pivotY
        }))
      : [idleFrame];

  const metaJson = {
    version: '1.0.0',
    mode: 'atlas',
    chromaKey: {
      enabled: false
    },
    frameWidth: cellSize,
    frameHeight: cellSize,
    animations: {
      IDLE: {
        fps: 5,
        loop: true,
        frames: [idleFrame]
      },
      WINDUP: {
        fps: 10,
        loop: false,
        frames: [meleeFrames[0]]
      },
      ATTACK_MELEE: {
        fps: 14,
        loop: false,
        hitFrame: Math.min(2, meleeFrames.length - 1),
        frames: meleeFrames
      },
      ATTACK_CAST: {
        fps: 12,
        loop: false,
        hitFrame: Math.min(1, meleeFrames.length - 1),
        frames: meleeFrames.slice(0, 3)
      },
      CLASH: {
        fps: 12,
        loop: true,
        frames: meleeFrames.length >= 3 ? [meleeFrames[1], meleeFrames[2]] : [idleFrame]
      }
    }
  };

  const outMetaPath = path.join(OUT_SPRITES_DIR, 'luffy_base.meta.json');
  fs.writeFileSync(outMetaPath, JSON.stringify(metaJson, null, 2) + '\n', 'utf8');

  return {
    outPngPath: path.relative(process.cwd(), outPngPath).replace(/\\/g, '/'),
    outMetaPath: path.relative(process.cwd(), outMetaPath).replace(/\\/g, '/'),
    sheetWidth: sheetW,
    sheetHeight: sheetH,
    frameCount: totalFrames,
    atlasRects
  };
}

function main() {
  const classified = inspectAndClassifyRawAssets();
  console.log('=== Step 1: raw_assets/ Inspection & Auto-Classification ===');
  for (const c of classified) {
    console.log(
      `  • ${c.fileName} | ${c.width}x${c.height} (ratio ${c.ratio}) | bg(0,0)=${c.topLeftHex} | => ${c.category}`
    );
  }

  const portraitItem = classified.find((c) => c.category === 'PORTRAIT_SHEET_4X2');
  const standingItem = classified.find((c) => c.category === 'STANDING_MASTER');
  const attackStripItem = classified.find((c) => c.category === 'ACTION_STRIP_4F');

  if (portraitItem) {
    const portraits = processPortraitSheet(portraitItem);
    console.log(`\n=== Portraits Exported (${portraits.length} x 64x64) ===`);
    for (const p of portraits) {
      console.log(`  ✓ ${p.outPath} (${p.emotion})`);
    }
  }

  if (standingItem || attackStripItem) {
    const spriteRes = processLuffySprites(standingItem, attackStripItem);
    console.log(`\n=== Luffy Sprite Atlas Exported ===`);
    console.log(
      `  ✓ ${spriteRes.outPngPath} (${spriteRes.sheetWidth}x${spriteRes.sheetHeight}, ${spriteRes.frameCount} frames @ 64x64)`
    );
    console.log(`  ✓ ${spriteRes.outMetaPath}`);
  }
}

main();
