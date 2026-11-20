/**
 * Shared Pure-Node Pixel-Art Image Operations for One Piece Grand Voyage:
 * - Chroma-key edge flood-fill + enclosed chroma cleanup + AI watermark removal + 2-pass De-fringing
 * - Auto pink/purple palette & pixel detection (#00FF00 vs #FF00FF safe background choice)
 * - Nearest-Neighbor square normalization with foot-pivot alignment
 * - Upper-body bust portrait auto-crop (64x64)
 * - 4x2 portrait grid slicer & action strip slicer
 */
import { decodePng, encodePng } from '../pixelize-sprite.mjs';

export { decodePng, encodePng };

export const PORTRAIT_EMOTIONS_8 = [
  'normal',
  'angry',
  'determined',
  'shocked',
  'smirk',
  'sad',
  'excited',
  'battle_cry'
];

export function rgbToHex(r, g, b) {
  return (
    '#' +
    [r, g, b]
      .map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase()
  );
}

export function hexToRgba(hex) {
  const clean = String(hex ?? '#ff00ff').replace('#', '');
  if (clean.length === 3) {
    return [
      parseInt(clean[0] + clean[0], 16),
      parseInt(clean[1] + clean[1], 16),
      parseInt(clean[2] + clean[2], 16),
      255
    ];
  }
  return [
    parseInt(clean.slice(0, 2), 16) || 0,
    parseInt(clean.slice(2, 4), 16) || 0,
    parseInt(clean.slice(4, 6), 16) || 0,
    255
  ];
}

function isChromaKeyMatch(r, g, b, keyRgb, tol) {
  const dr = r - keyRgb[0];
  const dg = g - keyRgb[1];
  const db = b - keyRgb[2];
  return dr * dr + dg * dg + db * db <= tol * tol;
}

function isMagentaKey(keyRgb) {
  return keyRgb[0] > 175 && keyRgb[2] > 175 && keyRgb[1] < 90;
}

function isGreenKey(keyRgb) {
  return keyRgb[1] > 175 && keyRgb[0] < 95 && keyRgb[2] < 95;
}

function isMagentaSpillOrWatermark(r, g, b) {
  if (r > 185 && b > 185 && g < Math.min(r, b) - 24) return true;
  if (r > 215 && b > 215 && g < 220 && r - g > 18 && b - g > 18) return true;
  return false;
}

function isGreenSpill(r, g, b) {
  return g > 165 && r < g - 35 && b < g - 35;
}

/**
 * Determines whether a sprite contains substantial pink/magenta/purple colors
 * (via blueprint hex colors OR rendered RGBA pixel histogram).
 * Returns '#00FF00' if pink/purple risk is detected, otherwise '#FF00FF'.
 */
export function selectSafeChromaBgHex(rgba, width, height, blueprint = null) {
  if (blueprint) {
    const bpColors = [
      blueprint.hairColor,
      blueprint.hatColor,
      blueprint.hatAccent,
      blueprint.torsoColor,
      blueprint.sashColor,
      blueprint.pantsColor,
      blueprint.capeStyle === 'flamingo_fur' ? '#ec4899' : '',
      blueprint.capeStyle === 'purple_fur_cape' ? '#7e22ce' : ''
    ]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
    if (
      /ec4899|f472b6|a855f7|9333ea|6b21a8|7e22ce|e879f9|d946ef|c084fc|db2777|be185d|f43f5e|fb7185/.test(
        bpColors
      )
    ) {
      return '#00FF00';
    }
  }

  if (rgba && width > 0 && height > 0) {
    let opaqueCount = 0;
    let pinkPurpleCount = 0;
    const total = width * height;
    for (let i = 0; i < total; i++) {
      const p = i * 4;
      if (rgba[p + 3] < 128) continue;
      opaqueCount += 1;
      const r = rgba[p];
      const g = rgba[p + 1];
      const b = rgba[p + 2];
      if (r > 125 && b > 110 && g < Math.min(r, b) - 22) {
        pinkPurpleCount += 1;
      }
    }
    if (opaqueCount > 0 && pinkPurpleCount / opaqueCount >= 0.04) {
      return '#00FF00';
    }
  }

  return '#FF00FF';
}

/**
 * Edge BFS Flood-Fill chroma removal + enclosed chroma gap cleanup + AI corner watermark cleanup
 * + 2-pass border De-Fringing (strips residual magenta/green halos and normalizes dark outline ink).
 */
export function cleanChromaAndDefringe(rgbaIn, width, height, opts = {}) {
  const rgba = new Uint8ClampedArray(rgbaIn);
  const total = width * height;
  if (total === 0) return { rgba, keyHex: '#000000', alreadyTransparent: false };

  // Check if image already has native transparent corners (>5% alpha==0 and corner alpha==0)
  let alphaZero = 0;
  for (let i = 0; i < total; i++) {
    if (rgba[i * 4 + 3] < 16) alphaZero += 1;
  }
  if (!opts.force && rgba[3] < 16 && alphaZero / total >= 0.05) {
    return { rgba, keyHex: 'TRANSPARENT', alreadyTransparent: true };
  }

  const keyRgb = [rgba[0], rgba[1], rgba[2]];
  const magentaMode = isMagentaKey(keyRgb);
  const greenMode = isGreenKey(keyRgb);
  const tol = opts.tolerance ?? (magentaMode || greenMode ? 82 : 42);

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

  while (head < tail) {
    const cx = qx[head];
    const cy = qy[head];
    head += 1;
    rgba[(cy * width + cx) * 4 + 3] = 0;

    if (cx > 0) trySeed(cx - 1, cy);
    if (cx + 1 < width) trySeed(cx + 1, cy);
    if (cy > 0) trySeed(cx, cy - 1);
    if (cy + 1 < height) trySeed(cx, cy + 1);
  }

  // Pass 2: Enclosed pure-chroma interior holes (e.g. armpits / between legs)
  if (magentaMode || greenMode) {
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
  }

  // Pass 3: 2-pass border De-Fringing
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
    const snapA = new Uint8Array(total);
    for (let i = 0; i < total; i++) snapA[i] = rgba[i * 4 + 3];

    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const idx = y * width + x;
        if (snapA[idx] === 0) continue;
        let touchesAlpha = false;
        for (const [dx, dy] of dirs) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || nx >= width || ny < 0 || ny >= height || snapA[ny * width + nx] === 0) {
            touchesAlpha = true;
            break;
          }
        }
        if (!touchesAlpha) continue;

        const p = idx * 4;
        const r = rgba[p];
        const g = rgba[p + 1];
        const b = rgba[p + 2];

        if (magentaMode && r > g + 14 && b > g + 14) {
          if (r + b >= 220) {
            rgba[p + 3] = 0;
          } else {
            rgba[p] = 18;
            rgba[p + 1] = 15;
            rgba[p + 2] = 22;
          }
        } else if (greenMode && g > Math.max(r, b) + 18) {
          if (g >= 120) {
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

  return {
    rgba,
    keyHex: rgbToHex(keyRgb[0], keyRgb[1], keyRgb[2]),
    alreadyTransparent: false
  };
}

/**
 * Strips tiny detached corner artifacts (like AI corner sparkles) while keeping the main sprite + nearby weapon/sparks.
 */
export function stripDetachedCornerArtifacts(rgba, width, height) {
  const total = width * height;
  const visited = new Uint8Array(total);
  const qx = new Int32Array(total);
  const qy = new Int32Array(total);
  const comps = [];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      if (visited[idx] || rgba[idx * 4 + 3] < 128) continue;
      let head = 0;
      let tail = 0;
      qx[tail] = x;
      qy[tail] = y;
      tail += 1;
      visited[idx] = 1;
      const pixels = [];
      let minX = x;
      let maxX = x;
      let minY = y;
      let maxY = y;

      while (head < tail) {
        const cx = qx[head];
        const cy = qy[head];
        head += 1;
        pixels.push(cy * width + cx);
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
            const ni = ny * width + nx;
            if (!visited[ni] && rgba[ni * 4 + 3] >= 128) {
              visited[ni] = 1;
              qx[tail] = nx;
              qy[tail] = ny;
              tail += 1;
            }
          }
        }
      }
      comps.push({ pixels, minX, maxX, minY, maxY });
    }
  }

  if (comps.length <= 1) return;
  const largest = comps.reduce((a, b) => (b.pixels.length > a.pixels.length ? b : a));

  for (const c of comps) {
    if (c === largest) continue;
    // Remove tiny disconnected corner watermark islands far from the main figure
    const isCornerWatermark =
      c.minX > width * 0.82 &&
      c.minY > height * 0.72 &&
      c.pixels.length < largest.pixels.length * 0.06;
    if (isCornerWatermark) {
      for (const idx of c.pixels) {
        rgba[idx * 4 + 3] = 0;
      }
    }
  }
}

export function extractTightRegion(rgba, srcW, srcH, x0 = 0, y0 = 0, x1 = srcW - 1, y1 = srcH - 1, predicate = null) {
  let minX = srcW;
  let maxX = -1;
  let minY = srcH;
  let maxY = -1;

  for (let y = Math.max(0, y0); y <= Math.min(srcH - 1, y1); y++) {
    for (let x = Math.max(0, x0); x <= Math.min(srcW - 1, x1); x++) {
      if (predicate && !predicate(x, y)) continue;
      if (rgba[(y * srcW + x) * 4 + 3] >= 128) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX < minX || maxY < minY) return null;

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
 * Nearest-Neighbor blitter into a square cell with foot-pivot alignment or portrait centering.
 */
export function blitNearestIntoCell(
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
  const mode = opts.mode ?? 'sprite'; // 'sprite' | 'portrait' | 'center'
  const padX = opts.padX ?? 2;
  const padTop = opts.padTop ?? 2;
  const footY = opts.footY ?? Math.round(cellSize * 0.92);

  let scale =
    opts.scale ??
    (mode === 'portrait'
      ? Math.min((cellSize - 2) / srcW, (cellSize - 2) / srcH)
      : mode === 'center'
        ? Math.min((cellSize - padX * 2) / srcW, (cellSize - padTop * 2) / srcH)
        : Math.min((cellSize - padX * 2) / srcW, (footY - padTop) / srcH));

  // Clamp scale so image never overflows cell bounds
  scale = Math.min(scale, (cellSize - padX * 2) / srcW, (footY - padTop) / srcH);
  const outW = Math.max(1, Math.round(srcW * scale));
  const outH = Math.max(1, Math.round(srcH * scale));
  const ox = Math.floor((cellSize - outW) * 0.5);
  const oy =
    mode === 'portrait'
      ? Math.max(0, cellSize - outH)
      : mode === 'center'
        ? Math.floor((cellSize - outH) * 0.5)
        : Math.max(0, footY - outH);

  for (let dy = 0; dy < outH; dy++) {
    const sy = Math.min(srcH - 1, Math.floor(((dy + 0.5) / outH) * srcH));
    for (let dx = 0; dx < outW; dx++) {
      const sx = Math.min(srcW - 1, Math.floor(((dx + 0.5) / outW) * srcW));
      const sIdx = (sy * srcW + sx) * 4;
      if (srcRgba[sIdx + 3] < 128) continue;
      const tx = cellX + ox + dx;
      const ty = cellY + oy + dy;
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
 * Adds a 1px dark hue-shifted pixel outline ONLY on edges that lack a dark outline pixel
 * (preserves existing crisp outlines without bloating them to 2px).
 */
export function ensureCrispDarkPixelOutline(rgba, width, height) {
  const snap = new Uint8ClampedArray(rgba);
  const dirs = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1]
  ];

  // Check if perimeter pixels are already dark ink (>65% dark)
  let borderCount = 0;
  let darkBorderCount = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = (y * width + x) * 4;
      if (snap[p + 3] < 128) continue;
      let onEdge = false;
      for (const [dx, dy] of dirs) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || nx >= width || ny < 0 || ny >= height || snap[(ny * width + nx) * 4 + 3] < 128) {
          onEdge = true;
          break;
        }
      }
      if (onEdge) {
        borderCount += 1;
        const lum = snap[p] * 0.299 + snap[p + 1] * 0.587 + snap[p + 2] * 0.114;
        if (lum < 72) darkBorderCount += 1;
      }
    }
  }
  if (borderCount > 0 && darkBorderCount / borderCount >= 0.62) {
    return; // Already has a crisp hand-drawn dark pixel outline
  }

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      if (snap[idx + 3] >= 128) continue;
      let rSum = 0;
      let gSum = 0;
      let bSum = 0;
      let hits = 0;
      for (const [dx, dy] of dirs) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
        const nIdx = (ny * width + nx) * 4;
        if (snap[nIdx + 3] >= 128) {
          rSum += snap[nIdx];
          gSum += snap[nIdx + 1];
          bSum += snap[nIdx + 2];
          hits += 1;
        }
      }
      if (hits > 0) {
        rgba[idx] = Math.max(14, Math.round((rSum / hits) * 0.22));
        rgba[idx + 1] = Math.max(12, Math.round((gSum / hits) * 0.19));
        rgba[idx + 2] = Math.max(22, Math.round((bSum / hits) * 0.30 + 10));
        rgba[idx + 3] = 255;
      }
    }
  }
}

/**
 * Final 2-pass residual magenta/green edge cleanup on downsampled output cells.
 */
export function purgeResidualChromaEdges(rgba, w, h, keyMode = 'auto') {
  const dirs = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1]
  ];
  const checkMagenta = keyMode === 'auto' || keyMode === 'magenta';
  const checkGreen = keyMode === 'green';

  for (let pass = 0; pass < 2; pass++) {
    const snapA = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) snapA[i] = rgba[i * 4 + 3];

    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const idx = y * w + x;
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
        const p = idx * 4;
        const r = rgba[p];
        const g = rgba[p + 1];
        const b = rgba[p + 2];

        if (checkMagenta) {
          if (r > 155 && b > 155 && g < Math.min(r, b) - 28) {
            rgba[p + 3] = 0;
            continue;
          }
          if (touchesAlpha && r > g + 14 && b > g + 14) {
            if (r + b >= 220) {
              rgba[p + 3] = 0;
            } else {
              rgba[p] = 18;
              rgba[p + 1] = 15;
              rgba[p + 2] = 22;
            }
          }
        } else if (checkGreen) {
          if (g > 155 && r < g - 32 && b < g - 32) {
            rgba[p + 3] = 0;
            continue;
          }
          if (touchesAlpha && g > Math.max(r, b) + 18) {
            if (g >= 115) {
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
}

/**
 * Composites a transparent RGBA sprite over a solid background hex color (e.g. #FF00FF or #00FF00).
 */
export function compositeOverSolidBg(rgba, width, height, bgHex) {
  const [br, bg, bb] = hexToRgba(bgHex);
  const out = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const p = i * 4;
    const a = rgba[p + 3] / 255;
    if (a <= 0.01) {
      out[p] = br;
      out[p + 1] = bg;
      out[p + 2] = bb;
      out[p + 3] = 255;
    } else if (a >= 0.99) {
      out[p] = rgba[p];
      out[p + 1] = rgba[p + 1];
      out[p + 2] = rgba[p + 2];
      out[p + 3] = 255;
    } else {
      out[p] = Math.round(rgba[p] * a + br * (1 - a));
      out[p + 1] = Math.round(rgba[p + 1] * a + bg * (1 - a));
      out[p + 2] = Math.round(rgba[p + 2] * a + bb * (1 - a));
      out[p + 3] = 255;
    }
  }
  return out;
}

/**
 * Auto-crops upper bust (head + shoulders, top ~54% of full-body sprite) into a crisp 64x64 portrait.
 */
export function cropUpperBustPortrait(fullRgba, fullW, fullH, outSize = 64) {
  const tight = extractTightRegion(fullRgba, fullW, fullH);
  if (!tight) {
    return new Uint8ClampedArray(outSize * outSize * 4);
  }
  const cropH = Math.max(12, Math.round(tight.height * 0.56));
  const sub = extractTightRegion(
    tight.rgba,
    tight.width,
    tight.height,
    0,
    0,
    tight.width - 1,
    Math.min(tight.height - 1, cropH - 1)
  );
  const out = new Uint8ClampedArray(outSize * outSize * 4);
  if (!sub) return out;
  blitNearestIntoCell(sub.rgba, sub.width, sub.height, out, outSize, 0, 0, outSize, {
    mode: 'portrait'
  });
  return out;
}

/**
 * Slices a 4x2 portrait sheet into 8 individual tight regions.
 */
export function slicePortraitGrid4x2(rgba, w, h) {
  const colCounts = new Int32Array(w);
  const rowCounts = new Int32Array(h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (rgba[(y * w + x) * 4 + 3] >= 128) {
        colCounts[x] += 1;
        rowCounts[y] += 1;
      }
    }
  }

  const findSpans = (counts, minWidth) => {
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
        if (i - start >= minWidth) spans.push([start, i - 1]);
        inSpan = false;
      }
    }
    if (inSpan && counts.length - start >= minWidth) spans.push([start, counts.length - 1]);
    return spans;
  };

  let xSpans = findSpans(colCounts, Math.max(16, Math.floor(w * 0.06)));
  let ySpans = findSpans(rowCounts, Math.max(16, Math.floor(h * 0.12)));

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

  const results = [];
  for (let r = 0; r < 2; r++) {
    for (let c = 0; c < 4; c++) {
      const [x0, x1] = xSpans[c];
      const [y0, y1] = ySpans[r];
      const reg = extractTightRegion(rgba, w, h, x0, y0, x1, y1);
      results.push({ emotion: PORTRAIT_EMOTIONS_8[r * 4 + c], region: reg });
    }
  }
  return results;
}

/**
 * Slices a horizontal multi-frame action strip (typically 4 frames) by column occupancy valleys
 * with fallback to equal horizontal bands.
 */
export function sliceHorizontalActionStrip(rgba, w, h, expectedFrames = 4) {
  const colCounts = new Int32Array(w);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (rgba[(y * w + x) * 4 + 3] >= 128) colCounts[x] += 1;
    }
  }

  // Try exact zero-column spans first
  const spans = [];
  let inSpan = false;
  let start = 0;
  for (let x = 0; x < w; x++) {
    if (colCounts[x] > 1) {
      if (!inSpan) {
        inSpan = true;
        start = x;
      }
    } else if (inSpan) {
      if (x - start >= Math.max(12, Math.floor(w * 0.06))) {
        spans.push([start, x - 1]);
      }
      inSpan = false;
    }
  }
  if (inSpan && w - start >= Math.max(12, Math.floor(w * 0.06))) {
    spans.push([start, w - 1]);
  }

  if (spans.length === expectedFrames) {
    return spans
      .map(([x0, x1]) => extractTightRegion(rgba, w, h, x0, 0, x1, h - 1))
      .filter(Boolean);
  }

  // Fallback: equal horizontal slices around local minimum-density valleys
  const segW = w / expectedFrames;
  const cuts = [0];
  for (let i = 1; i < expectedFrames; i++) {
    const center = Math.round(segW * i);
    const searchR = Math.round(segW * 0.14);
    let bestX = center;
    let bestC = Infinity;
    for (let x = Math.max(1, center - searchR); x <= Math.min(w - 2, center + searchR); x++) {
      if (colCounts[x] < bestC) {
        bestC = colCounts[x];
        bestX = x;
      }
    }
    cuts.push(bestX);
  }
  cuts.push(w);

  const regions = [];
  for (let i = 0; i < expectedFrames; i++) {
    const reg = extractTightRegion(rgba, w, h, cuts[i], 0, cuts[i + 1] - 1, h - 1);
    if (reg) regions.push(reg);
  }
  return regions;
}
