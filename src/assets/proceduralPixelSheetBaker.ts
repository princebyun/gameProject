import type {
  FormDefinition,
  UnitDefinition
} from '../core/types/dataSchemas';
import {
  STANDARD_SPRITE_ANIM_STATES,
  type SpriteSheetManifestEntry
} from '../data/assets/types';
import { bakeCharacterSpriteSheetCanvas } from '../render/sprite/rig/articulatedPixelRigBaker';
import {
  getBaseCharacterBlueprintForUnit,
  getCharacterBlueprintByKey
} from '../render/sprite/rig/blueprintLibrary';
import { bakeArticulatedLuffySpriteSheetCanvas } from './luffyArticulatedPixelSheet';

export const SHEET_COLUMNS = 6;
export const SHEET_ROWS = STANDARD_SPRITE_ANIM_STATES.length; // 11 rows

/**
 * Articulated Multi-Part 2D Pixel Sprite Sheet Baker.
 * - Single-image rotation/tilt/scale paper-doll rendering is strictly prohibited and removed.
 * - For `luffy_base`, generates the canonical 48x48 joint-articulated pixel sheet (`bakeArticulatedLuffySpriteSheetCanvas`).
 * - For all registered units and forms, delegates to the 6-archetype `bakeCharacterSpriteSheetCanvas(blueprint)`.
 */
export function bakeProceduralUnitSpriteSheet(
  entry: SpriteSheetManifestEntry,
  unitDef: UnitDefinition,
  _formDef: FormDefinition | null = null,
  _baseAvatarCanvas: HTMLCanvasElement | null = null
): HTMLCanvasElement | null {
  if (typeof document === 'undefined') {
    return null;
  }

  if (entry.key === 'luffy_base') {
    return bakeArticulatedLuffySpriteSheetCanvas();
  }

  const blueprint =
    getCharacterBlueprintByKey(entry.key) ??
    getBaseCharacterBlueprintForUnit(unitDef.id) ??
    getBaseCharacterBlueprintForUnit('luffy');

  if (blueprint) {
    return bakeCharacterSpriteSheetCanvas(blueprint);
  }

  return null;
}

/**
 * Bakes multi-frame pixel ship sheets (Going Merry, Thousand Sunny, Marine Warship, Sea King)
 * with billowing sail frames and Coup de Burst propulsion flames.
 */
export function bakeProceduralShipSpriteSheet(
  entry: SpriteSheetManifestEntry
): HTMLCanvasElement | null {
  if (typeof document === 'undefined') {
    return null;
  }

  const fw = entry.frameWidth;
  const fh = entry.frameHeight;
  const sheet = document.createElement('canvas');
  sheet.width = fw * SHEET_COLUMNS;
  sheet.height = fh * SHEET_ROWS;
  const ctx = sheet.getContext('2d');
  if (!ctx) return sheet;
  ctx.imageSmoothingEnabled = false;

  const shipId = entry.shipId ?? 'going_merry';
  const hullColor =
    shipId === 'thousand_sunny'
      ? '#b45309'
      : shipId === 'marine_warship'
        ? '#475569'
        : shipId === 'sea_king'
          ? '#0f766e'
          : '#92400e';
  const sailColor =
    shipId === 'marine_warship'
      ? '#e2e8f0'
      : shipId === 'sea_king'
        ? '#14b8a6'
        : '#f8fafc';
  const emblemColor =
    shipId === 'thousand_sunny'
      ? '#facc15'
      : shipId === 'marine_warship'
        ? '#38bdf8'
        : shipId === 'sea_king'
          ? '#f43f5e'
          : '#ef4444';

  for (const state of STANDARD_SPRITE_ANIM_STATES) {
    const clip = entry.animations[state];
    const row = clip.row;
    const frames = Math.min(SHEET_COLUMNS, Math.max(1, clip.frames));

    for (let f = 0; f < frames; f++) {
      const x0 = f * fw;
      const y0 = row * fh;
      const bob = f % 2 === 1 ? -1 : 0;
      const sailBillow = f % 2 === 0 ? 2 : 0;

      // Water wake foam
      ctx.fillStyle = 'rgba(186, 230, 253, 0.55)';
      ctx.fillRect(
        x0 + Math.round(fw * 0.1),
        y0 + Math.round(fh * 0.72),
        Math.round(fw * 0.78),
        Math.max(2, Math.round(fh * 0.08))
      );

      if (shipId === 'sea_king') {
        ctx.fillStyle = hullColor;
        ctx.fillRect(
          x0 + Math.round(fw * 0.14),
          y0 + Math.round(fh * 0.36) + bob,
          Math.round(fw * 0.68),
          Math.round(fh * 0.38)
        );
        ctx.fillStyle = sailColor;
        ctx.fillRect(
          x0 + Math.round(fw * 0.56),
          y0 + Math.round(fh * 0.16) + bob,
          Math.round(fw * 0.3),
          Math.round(fh * 0.34)
        );
        ctx.fillStyle = emblemColor;
        ctx.fillRect(
          x0 + Math.round(fw * 0.74),
          y0 + Math.round(fh * 0.24) + bob,
          Math.round(fw * 0.08),
          Math.round(fh * 0.08)
        );
        continue;
      }

      if (state === 'DODGE' || state === 'TRANSFORM') {
        ctx.fillStyle = '#38bdf8';
        ctx.fillRect(
          x0 + Math.round(fw * 0.02),
          y0 + Math.round(fh * 0.52) + bob,
          Math.round(fw * (0.22 + (f % 2) * 0.08)),
          Math.round(fh * 0.16)
        );
        ctx.fillStyle = '#facc15';
        ctx.fillRect(
          x0 + Math.round(fw * 0.08),
          y0 + Math.round(fh * 0.55) + bob,
          Math.round(fw * 0.14),
          Math.round(fh * 0.1)
        );
      }

      // Ship hull
      ctx.fillStyle = hullColor;
      ctx.fillRect(
        x0 + Math.round(fw * 0.18),
        y0 + Math.round(fh * 0.54) + bob,
        Math.round(fw * 0.62),
        Math.round(fh * 0.2)
      );
      // Mast
      ctx.fillStyle = '#451a03';
      ctx.fillRect(
        x0 + Math.round(fw * 0.46),
        y0 + Math.round(fh * 0.16) + bob,
        Math.max(2, Math.round(fw * 0.06)),
        Math.round(fh * 0.42)
      );
      // Billowing Sail
      ctx.fillStyle = sailColor;
      ctx.fillRect(
        x0 + Math.round(fw * 0.34),
        y0 + Math.round(fh * 0.22) + bob,
        Math.round(fw * 0.32) + sailBillow,
        Math.round(fh * 0.26)
      );
      // Jolly Roger / Figurehead
      ctx.fillStyle = emblemColor;
      ctx.fillRect(
        x0 + Math.round(fw * 0.45),
        y0 + Math.round(fh * 0.3) + bob,
        Math.round(fw * 0.12),
        Math.round(fh * 0.1)
      );
      ctx.fillStyle = shipId === 'thousand_sunny' ? '#facc15' : '#f8fafc';
      ctx.fillRect(
        x0 + Math.round(fw * 0.76),
        y0 + Math.round(fh * 0.46) + bob,
        Math.round(fw * 0.14),
        Math.round(fh * 0.16)
      );
    }
  }

  return sheet;
}
