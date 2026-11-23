import fs from 'node:fs';
import path from 'node:path';
import {
  extractPortraitFromIdleFrame,
  packVariableSpriteAtlas,
  renderDebugOverlayRgba
} from '../../src/assets/slicer/atlasPackerAndDebug.ts';
import { analyzeIrregularSpriteSheet } from '../../src/assets/slicer/irregularSheetPipeline.ts';
import {
  DEFAULT_SLICER_OPTIONS,
  normalizeRecipe
} from '../../src/assets/slicer/slicerTypes.ts';
import { decodePng, encodeImageToPng } from './pngCodec.mjs';

export function loadSheetRecipe(packsDir, key, unitId, formId) {
  const candidates = [
    path.join(packsDir, `${key}.recipe.json`),
    path.join(packsDir, `${unitId}_${formId}.recipe.json`),
    path.join(packsDir, `${unitId}.recipe.json`)
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) {
      try {
        const raw = JSON.parse(fs.readFileSync(p, 'utf-8'));
        return normalizeRecipe(raw, unitId, formId);
      } catch {
        // ignore invalid recipe JSON and fall back cleanly
      }
    }
  }
  return null;
}

export function writeDebugOverlayPng(rawSurface, analysis, outPath) {
  const overlay = renderDebugOverlayRgba(rawSurface, analysis);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, encodeImageToPng(overlay));
}

/**
 * Slices, filters, merges satellites, computes body-core pivots, packs a 2px-padded
 * VARIABLE_PACK sprite atlas, and prepares debug overlay + optional portrait buffers.
 */
export function sliceAndPackIrregularSheet(rawPngBuffer, metaOpts, slicerOpts = {}, recipe = null) {
  const decoded = decodePng(rawPngBuffer);
  const rawSurface = {
    width: decoded.width,
    height: decoded.height,
    data: decoded.data
  };

  const mergedOptions = {
    tolerance: slicerOpts.tolerance ?? recipe?.options.tolerance ?? DEFAULT_SLICER_OPTIONS.tolerance,
    flipHorizontal: slicerOpts.flipHorizontal ?? recipe?.options.flipHorizontal ?? false,
    scale: slicerOpts.scale ?? recipe?.options.scale ?? 1.0,
    paddingPx: slicerOpts.paddingPx ?? recipe?.options.paddingPx ?? 2,
    keepPortraits: slicerOpts.keepPortraits ?? recipe?.options.keepPortraits ?? false
  };

  const analysis = analyzeIrregularSpriteSheet(rawSurface, mergedOptions, recipe);
  if (analysis.frames.length === 0) {
    throw new Error(`No valid character frames remained after filtering for "${metaOpts.key}"`);
  }

  const packed = packVariableSpriteAtlas(analysis.cleanedSurface, analysis, mergedOptions);
  const pngBuffer = encodeImageToPng(packed.atlasSurface);
  const overlay = renderDebugOverlayRgba(rawSurface, analysis);
  const debugPngBuffer = encodeImageToPng(overlay);

  const idleRow = analysis.rows[analysis.stateMapping.IDLE] ?? analysis.rows[0];
  const idleFrame = idleRow?.frames[0] ?? analysis.frames[0];
  const portraitPngBuffer =
    idleFrame && !mergedOptions.keepPortraits
      ? encodeImageToPng(extractPortraitFromIdleFrame(analysis.cleanedSurface, idleFrame))
      : null;

  return {
    rawSurface,
    analysis,
    packed,
    pngBuffer,
    debugPngBuffer,
    portraitPngBuffer
  };
}
