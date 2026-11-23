import {
  STANDARD_SPRITE_ANIM_STATES,
  type SpriteAnimClipDef,
  type SpriteAnimState,
  type SpriteAtlasFrameRect
} from '../../data/assets/types';
import {
  createSurface,
  type PackedAtlasOutput,
  type RgbaSurface,
  type SlicedFrame,
  type SlicerAnalysisResult,
  type SlicerOptions
} from './slicerTypes';

const DEFAULT_TIMING: Record<SpriteAnimState, { fps: number; loop: boolean; hitFrame?: number }> = {
  IDLE: { fps: 5, loop: true },
  MOVE: { fps: 12, loop: true },
  WINDUP: { fps: 10, loop: false },
  ATTACK_MELEE: { fps: 14, loop: false, hitFrame: 1 },
  ATTACK_CAST: { fps: 12, loop: false, hitFrame: 1 },
  CLASH: { fps: 12, loop: true },
  DODGE: { fps: 12, loop: false },
  HIT: { fps: 10, loop: false },
  DOWNED: { fps: 4, loop: true },
  TRANSFORM: { fps: 10, loop: false, hitFrame: 1 },
  VICTORY: { fps: 6, loop: true }
};

function chooseNominalSize(idleMedianH: number): 32 | 48 | 64 | 96 | 128 {
  if (idleMedianH <= 38) return 32;
  if (idleMedianH <= 56) return 48;
  if (idleMedianH <= 78) return 64;
  if (idleMedianH <= 112) return 96;
  return 128;
}

function cropAndTransformFrame(
  src: RgbaSurface,
  frame: SlicedFrame,
  flipHorizontal: boolean,
  scale: number
): { img: RgbaSurface; pivotX: number; pivotY: number } {
  const outW = Math.max(4, Math.round(frame.w * scale));
  const outH = Math.max(4, Math.round(frame.h * scale));
  const out = createSurface(outW, outH);

  for (let dy = 0; dy < outH; dy++) {
    const sy = frame.y + Math.min(frame.h - 1, Math.floor((dy * frame.h) / outH));
    for (let dx = 0; dx < outW; dx++) {
      const localX = Math.min(frame.w - 1, Math.floor((dx * frame.w) / outW));
      const sx = frame.x + (flipHorizontal ? frame.w - 1 - localX : localX);
      const si = (sy * src.width + sx) * 4;
      const di = (dy * outW + dx) * 4;
      out.data[di] = src.data[si] ?? 0;
      out.data[di + 1] = src.data[si + 1] ?? 0;
      out.data[di + 2] = src.data[si + 2] ?? 0;
      out.data[di + 3] = src.data[si + 3] ?? 0;
    }
  }
  return {
    img: out,
    pivotX: Math.max(0, Math.min(outW - 1, Math.round(frame.pivotX * scale))),
    pivotY: Math.max(0, Math.min(outH - 1, Math.round(frame.pivotY * scale)))
  };
}

/**
 * Step 1.6a: Packs all variable-size frames with 2px transparent padding into an atlas
 * and emits exact per-frame { x, y, w, h, pivotX, pivotY } rectangles across all 11 states.
 */
export function packVariableSpriteAtlas(
  cleanedSurface: RgbaSurface,
  analysis: SlicerAnalysisResult,
  options: SlicerOptions
): PackedAtlasOutput {
  const pad = Math.max(1, options.paddingPx);
  const scale = options.scale > 0 ? options.scale : 1.0;

  // Shelf-pack frames per row cluster so rows remain visually coherent
  const packedByFrameId = new Map<number, SpriteAtlasFrameRect>();
  const bakedTiles: { rect: SpriteAtlasFrameRect; img: RgbaSurface }[] = [];

  let curY = pad;
  let maxRowWidth = 64;
  for (const row of analysis.rows) {
    let curX = pad;
    let rowMaxH = 8;
    for (const frame of row.frames) {
      const cropped = cropAndTransformFrame(cleanedSurface, frame, options.flipHorizontal, scale);
      const rect: SpriteAtlasFrameRect = {
        x: curX,
        y: curY,
        w: cropped.img.width,
        h: cropped.img.height,
        pivotX: cropped.pivotX,
        pivotY: cropped.pivotY
      };
      packedByFrameId.set(frame.id, rect);
      bakedTiles.push({ rect, img: cropped.img });
      curX += rect.w + pad;
      if (rect.h > rowMaxH) rowMaxH = rect.h;
    }
    if (curX > maxRowWidth) maxRowWidth = curX;
    curY += rowMaxH + pad;
  }

  const atlasW = Math.max(32, maxRowWidth);
  const atlasH = Math.max(32, curY);
  const atlasSurface = createSurface(atlasW, atlasH);

  for (const item of bakedTiles) {
    const { rect, img } = item;
    for (let py = 0; py < img.height; py++) {
      for (let px = 0; px < img.width; px++) {
        const si = (py * img.width + px) * 4;
        const a = img.data[si + 3] ?? 0;
        if (a === 0) continue;
        const di = ((rect.y + py) * atlasW + (rect.x + px)) * 4;
        atlasSurface.data[di] = img.data[si] ?? 0;
        atlasSurface.data[di + 1] = img.data[si + 1] ?? 0;
        atlasSurface.data[di + 2] = img.data[si + 2] ?? 0;
        atlasSurface.data[di + 3] = a;
      }
    }
  }

  const animations = {} as Record<SpriteAnimState, SpriteAnimClipDef>;
  for (let rowIdx = 0; rowIdx < STANDARD_SPRITE_ANIM_STATES.length; rowIdx++) {
    const st = STANDARD_SPRITE_ANIM_STATES[rowIdx]!;
    const mappedRowIdx = analysis.stateMapping[st] ?? 0;
    const sourceRow = analysis.rows[mappedRowIdx] ?? analysis.rows[0];
    const rects: SpriteAtlasFrameRect[] = [];
    if (sourceRow) {
      for (const f of sourceRow.frames) {
        const pr = packedByFrameId.get(f.id);
        if (pr) rects.push({ ...pr });
      }
    }
    if (rects.length === 0) {
      rects.push({ x: 0, y: 0, w: Math.min(32, atlasW), h: Math.min(32, atlasH), pivotX: 16, pivotY: 28 });
    }
    // Engine contract requires IDLE and MOVE to provide >= 4 frames
    const minFrames = st === 'IDLE' || st === 'MOVE' ? 4 : 1;
    const expandedRects = [...rects];
    while (expandedRects.length < minFrames) {
      expandedRects.push({ ...rects[expandedRects.length % rects.length]! });
    }
    const baseTiming = DEFAULT_TIMING[st];
    const hitFrame =
      baseTiming.hitFrame !== undefined
        ? Math.min(expandedRects.length - 1, baseTiming.hitFrame)
        : undefined;

    animations[st] = {
      row: rowIdx,
      frames: expandedRects.length,
      fps: baseTiming.fps,
      loop: baseTiming.loop,
      ...(hitFrame !== undefined ? { hitFrame } : {}),
      frameRects: expandedRects
    };
  }

  const nominal = chooseNominalSize(Math.round(analysis.idleMedianH * scale));
  return {
    atlasSurface,
    frameWidth: nominal,
    frameHeight: nominal,
    animations,
    totalUniqueFrames: bakedTiles.length
  };
}

// Minimal 3x5 bitmap glyphs for headless debug overlay row state labels
const FONT_3X5: Record<string, string> = {
  A: '010101111101101', B: '110101110101110', C: '011100100100011', D: '110101101101110',
  E: '111100110100111', F: '111100110100100', G: '011100101101011', H: '101101111101101',
  I: '111010010010111', K: '101101110101101', L: '100100100100111', M: '101111101101101',
  N: '101111111101101', O: '010101101101010', P: '110101110100100', R: '110101110101101',
  S: '011100010001110', T: '111010010010010', U: '101101101101111', V: '101101101010010',
  W: '101101101111101', X: '101101010101101', Y: '101101010010010', '0': '111101101101111',
  '1': '010110010010111', '2': '111001111100111', '3': '111001111001111', '4': '101101111001001',
  '5': '111100111001111', '6': '111100111101111', '7': '111001001001001', '8': '111101111101111',
  '9': '111101111001111', _: '000000000000111'
};

function drawPixel(surf: RgbaSurface, x: number, y: number, rgb: [number, number, number]): void {
  if (x < 0 || x >= surf.width || y < 0 || y >= surf.height) return;
  const idx = (y * surf.width + x) * 4;
  surf.data[idx] = rgb[0];
  surf.data[idx + 1] = rgb[1];
  surf.data[idx + 2] = rgb[2];
  surf.data[idx + 3] = 255;
}

function drawRectOutline(surf: RgbaSurface, x: number, y: number, w: number, h: number, rgb: [number, number, number]): void {
  for (let px = x; px < x + w; px++) {
    drawPixel(surf, px, y, rgb);
    drawPixel(surf, px, y + h - 1, rgb);
  }
  for (let py = y; py < y + h; py++) {
    drawPixel(surf, x, py, rgb);
    drawPixel(surf, x + w - 1, py, rgb);
  }
}

function drawTinyText(surf: RgbaSurface, text: string, startX: number, startY: number, fg: [number, number, number]): void {
  const upper = text.toUpperCase();
  const bgW = upper.length * 4 + 3;
  for (let yy = startY - 1; yy < startY + 6; yy++) {
    for (let xx = startX - 1; xx < startX + bgW; xx++) drawPixel(surf, xx, yy, [15, 23, 42]);
  }
  let cx = startX;
  for (const ch of upper) {
    const bits = FONT_3X5[ch];
    if (bits) {
      for (let i = 0; i < 15; i++) {
        if (bits[i] === '1') drawPixel(surf, cx + (i % 3), startY + Math.floor(i / 3), fg);
      }
    }
    cx += 4;
  }
}

/**
 * Step 1.6c: Draws green accepted boxes, red excluded boxes + X, yellow pivot crosshairs,
 * and bitmap row state tags directly onto a clone of the original sheet for instant audit.
 */
export function renderDebugOverlayRgba(rawSurface: RgbaSurface, analysis: SlicerAnalysisResult): RgbaSurface {
  const out: RgbaSurface = {
    width: rawSurface.width,
    height: rawSurface.height,
    data: new Uint8ClampedArray(rawSurface.data)
  };
  const GREEN: [number, number, number] = [34, 197, 94];
  const RED: [number, number, number] = [239, 68, 68];
  const YELLOW: [number, number, number] = [250, 204, 21];

  for (const ex of analysis.excludedRegions) {
    drawRectOutline(out, ex.x, ex.y, ex.w, ex.h, RED);
    const steps = Math.max(ex.w, ex.h);
    for (let s = 0; s < steps; s++) {
      const dx = Math.round((s * Math.max(1, ex.w - 1)) / Math.max(1, steps - 1));
      const dy = Math.round((s * Math.max(1, ex.h - 1)) / Math.max(1, steps - 1));
      drawPixel(out, ex.x + dx, ex.y + dy, RED);
      drawPixel(out, ex.x + ex.w - 1 - dx, ex.y + dy, RED);
    }
  }

  for (const row of analysis.rows) {
    const first = row.frames[0];
    if (first) drawTinyText(out, row.assignedState, Math.max(2, first.x), Math.max(2, first.y - 7), YELLOW);
    for (const f of row.frames) {
      drawRectOutline(out, f.x, f.y, f.w, f.h, GREEN);
      drawTinyText(out, String(f.id), f.x + 2, f.y + 2, GREEN);
      const px = f.x + f.pivotX;
      const py = f.y + f.pivotY;
      for (let d = -4; d <= 4; d++) {
        drawPixel(out, px + d, py, YELLOW);
        drawPixel(out, px, py + d, YELLOW);
      }
    }
  }
  return out;
}

/**
 * Step 1.6b: Extracts a crisp 64x64 upper-body/face portrait centered on the first IDLE frame.
 */
export function extractPortraitFromIdleFrame(cleanedSurface: RgbaSurface, idleFrame: SlicedFrame): RgbaSurface {
  const cropH = Math.max(16, Math.round(idleFrame.h * 0.62));
  const cropSide = Math.max(16, Math.min(idleFrame.w, cropH));
  const startX = Math.max(0, Math.min(idleFrame.w - cropSide, Math.round(idleFrame.pivotX - cropSide * 0.5)));
  const out = createSurface(64, 64);

  for (let y = 0; y < 64; y++) {
    for (let x = 0; x < 64; x++) {
      const border = x === 0 || x === 63 || y === 0 || y === 63;
      const di = (y * 64 + x) * 4;
      if (border) {
        out.data[di] = 17;
        out.data[di + 1] = 24;
        out.data[di + 2] = 39;
        out.data[di + 3] = 255;
        continue;
      }
      const sx = idleFrame.x + startX + Math.floor((x * cropSide) / 64);
      const sy = idleFrame.y + Math.floor((y * cropSide) / 64);
      const si = (Math.min(cleanedSurface.height - 1, sy) * cleanedSurface.width + Math.min(cleanedSurface.width - 1, sx)) * 4;
      const a = cleanedSurface.data[si + 3] ?? 0;
      if (a >= 16) {
        out.data[di] = cleanedSurface.data[si] ?? 0;
        out.data[di + 1] = cleanedSurface.data[si + 1] ?? 0;
        out.data[di + 2] = cleanedSurface.data[si + 2] ?? 0;
        out.data[di + 3] = 255;
      } else {
        out.data[di] = 30;
        out.data[di + 1] = 41;
        out.data[di + 2] = 59;
        out.data[di + 3] = 255;
      }
    }
  }
  return out;
}
