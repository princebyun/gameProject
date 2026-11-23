import { cleanIrregularSheetBackground } from './backgroundCleaner';
import {
  extractConnectedComponents,
  filterHeaderAndTextLabels
} from './componentAnalyzer';
import { clusterRowsAndClassifyActions } from './rowClassifierAndPivot';
import { mergeSatelliteParts } from './satelliteMerger';
import {
  createSurface,
  DEFAULT_SLICER_OPTIONS,
  type IrregularSheetRecipeV1,
  type RgbaSurface,
  type SlicerAnalysisResult,
  type SlicerOptions
} from './slicerTypes';

/**
 * Full 6-stage pure pixel analysis pipeline shared between CLI (`npm run import:pack`)
 * and `AssetPreviewScene`'s interactive Slicer tab.
 */
export function analyzeIrregularSpriteSheet(
  rawSurface: RgbaSurface,
  partialOptions: Partial<SlicerOptions> = {},
  recipe?: IrregularSheetRecipeV1 | null
): SlicerAnalysisResult {
  const options: SlicerOptions = {
    tolerance: partialOptions.tolerance ?? recipe?.options.tolerance ?? DEFAULT_SLICER_OPTIONS.tolerance,
    flipHorizontal: partialOptions.flipHorizontal ?? recipe?.options.flipHorizontal ?? false,
    scale: partialOptions.scale ?? recipe?.options.scale ?? 1.0,
    paddingPx: partialOptions.paddingPx ?? recipe?.options.paddingPx ?? 2,
    keepPortraits: partialOptions.keepPortraits ?? recipe?.options.keepPortraits ?? false
  };

  const { cleaned, dividerRegions, dominantBgRgb } = cleanIrregularSheetBackground(
    rawSurface,
    options.tolerance
  );
  const rawComponents = extractConnectedComponents(cleaned);
  const { activeComponents, excludedRegions } = filterHeaderAndTextLabels(
    rawComponents,
    rawSurface.width,
    rawSurface.height,
    dividerRegions,
    recipe
  );
  const mergedFrames = mergeSatelliteParts(activeComponents, cleaned, recipe);
  const classified = clusterRowsAndClassifyActions(mergedFrames, cleaned, options, recipe);

  return {
    rawWidth: rawSurface.width,
    rawHeight: rawSurface.height,
    cleanedSurface: cleaned,
    dominantBgRgb,
    frames: classified.frames,
    rows: classified.rows,
    excludedRegions,
    stateMapping: classified.stateMapping,
    idleMedianW: classified.idleMedianW,
    idleMedianH: classified.idleMedianH
  };
}

function paintRect(
  surf: RgbaSurface,
  x: number,
  y: number,
  w: number,
  h: number,
  rgba: [number, number, number, number]
): void {
  for (let py = y; py < y + h; py++) {
    if (py < 0 || py >= surf.height) continue;
    for (let px = x; px < x + w; px++) {
      if (px < 0 || px >= surf.width) continue;
      const i = (py * surf.width + px) * 4;
      surf.data[i] = rgba[0];
      surf.data[i + 1] = rgba[1];
      surf.data[i + 2] = rgba[2];
      surf.data[i + 3] = rgba[3];
    }
  }
}

const MINI_FONT: Record<string, string> = {
  A: '010101111101101', B: '110101110101110', C: '011100100100011', D: '110101101101110',
  E: '111100110100111', I: '111010010010111', K: '101101110101101', L: '100100100100111',
  N: '101111111101101', O: '010101101101010', P: '110101110100100', R: '110101110101101',
  S: '011100010001110', T: '111010010010010', Y: '101101010010010', '-': '000000111000000'
};

function drawPixelLabel(surf: RgbaSurface, text: string, x: number, y: number, rgb: [number, number, number]): void {
  let cx = x;
  for (const ch of text.toUpperCase()) {
    const bits = MINI_FONT[ch];
    if (bits) {
      for (let i = 0; i < 15; i++) {
        if (bits[i] === '1') paintRect(surf, cx + (i % 3) * 2, y + Math.floor(i / 3) * 2, 2, 2, [rgb[0], rgb[1], rgb[2], 255]);
      }
    }
    cx += 8;
  }
}

/**
 * Generates an NDS-style irregular sprite sheet fixture containing:
 * - Outer chroma-key background + horizontal dividers + inner teal/gray row panels
 * - Top title banner + "ONE PIECE SPRITES - RIPPED BY TEST" header
 * - Small pixel labels "IDLE" and "ATTACK" above each row
 * - Floating straw hat 3px above head (satellite merge target)
 * - 32px idle stances + 96px long punch attack (torso-weighted pivotX target)
 */
export function createSyntheticIrregularTestSheet(): RgbaSurface {
  const surf = createSurface(320, 260);
  paintRect(surf, 0, 0, 320, 260, [255, 0, 255, 255]); // Outer magenta background

  // 1. Top title banner (280x24) + credit text strip
  paintRect(surf, 16, 8, 288, 20, [30, 58, 138, 255]);
  drawPixelLabel(surf, 'ONE-PIECE-SPRITES-BY-TEST', 44, 13, [253, 224, 71]);
  paintRect(surf, 8, 36, 304, 2, [248, 250, 252, 255]); // 2px full horizontal divider

  // 2. Row 0: Inner teal panel + "IDLE" label + 4 standing 28x34 fighters (centered ~14px)
  drawPixelLabel(surf, 'IDLE', 16, 44, [15, 23, 42]);
  paintRect(surf, 12, 58, 296, 68, [20, 184, 166, 255]);
  for (let c = 0; c < 4; c++) {
    const bx = 26 + c * 68;
    const by = 78;
    // Straw hat floating 3px ABOVE head (18x6) — must merge with fighter body!
    paintRect(surf, bx + 5, by - 9, 18, 6, [250, 204, 21, 255]);
    // Head + hair (y: by..by+12)
    paintRect(surf, bx + 8, by, 12, 12, [245, 208, 169, 255]);
    // Red vest torso + left/right legs (y: by+12..by+34, center at +14)
    paintRect(surf, bx + 6, by + 12, 16, 12, [220, 38, 38, 255]);
    paintRect(surf, bx + 7, by + 24, 5, 10, [30, 64, 175, 255]);
    paintRect(surf, bx + 16, by + 24, 5, 10, [30, 64, 175, 255]);
  }
  paintRect(surf, 6, 134, 308, 2, [248, 250, 252, 255]); // 2px divider

  // 3. Row 1: Inner gray panel + "ATTACK" label + two 96px-wide long punch frames
  // Torso sits cleanly at left offset +14 inside 96px frame while fist stretches 68px right!
  drawPixelLabel(surf, 'ATTACK', 16, 142, [15, 23, 42]);
  paintRect(surf, 12, 156, 296, 80, [148, 163, 184, 255]);
  for (let c = 0; c < 2; c++) {
    const bx = 22 + c * 144;
    const by = 180;
    paintRect(surf, bx + 5, by - 9, 18, 6, [250, 204, 21, 255]); // floating hat 3px gap
    paintRect(surf, bx + 8, by, 12, 12, [245, 208, 169, 255]); // head
    paintRect(surf, bx + 6, by + 12, 16, 12, [220, 38, 38, 255]); // torso
    paintRect(surf, bx + 6, by + 24, 6, 10, [30, 64, 175, 255]); // left leg
    paintRect(surf, bx + 17, by + 24, 5, 10, [30, 64, 175, 255]); // right leg
    // 68px long Gomu-Gomu outstretched punch arm + fist to the right (thin 6px high)
    paintRect(surf, bx + 22, by + 14, 64, 6, [245, 208, 169, 255]);
    paintRect(surf, bx + 82, by + 11, 14, 11, [239, 68, 68, 255]);
  }

  return surf;
}
