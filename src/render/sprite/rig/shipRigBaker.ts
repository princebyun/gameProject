import { STANDARD_SPRITE_ANIM_STATES } from '../../../data/assets/types';
import { RigPixelSurface } from './pixelSurface';
import { createStandardRigAnimations, type ThreeToneHex } from './rigTypes';

export const RIG_SHEET_COLUMNS = 6;
export const RIG_SHEET_ROWS = STANDARD_SPRITE_ANIM_STATES.length; // 11

/**
 * Generates multi-frame RGBA pixel buffer for a ship sprite sheet
 * (Going Merry, Thousand Sunny, Marine Warship, Sea King).
 */
export function bakeShipSpriteSheetPixels(
  shipId: string,
  fw: number,
  fh: number
): { width: number; height: number; data: Uint8ClampedArray } {
  const width = fw * RIG_SHEET_COLUMNS;
  const height = fh * RIG_SHEET_ROWS;
  const surf = new RigPixelSurface(width, height);
  const anims = createStandardRigAnimations();
  const s = Math.max(1, fw / 48);
  const groundY = Math.round(fh * 0.85);

  const hullTones: ThreeToneHex =
    shipId === 'thousand_sunny'
      ? ['#F59E0B', '#B45309', '#78350F']
      : shipId === 'marine_warship'
        ? ['#94A3B8', '#475569', '#1E293B']
        : shipId === 'sea_king'
          ? ['#2DD4BF', '#0F766E', '#134E4A']
          : ['#D97706', '#92400E', '#451A03'];
  const sailTones: ThreeToneHex =
    shipId === 'sea_king'
      ? ['#5EEAD4', '#14B8A6', '#0F766E']
      : ['#FFFFFF', '#E2E8F0', '#94A3B8'];
  const emblemTones: ThreeToneHex =
    shipId === 'thousand_sunny'
      ? ['#FEF08A', '#FACC15', '#CA8A04']
      : shipId === 'marine_warship'
        ? ['#7DD3FC', '#0284C7', '#1E3A8A']
        : ['#F87171', '#DC2626', '#7F1D1D'];

  for (let rowIdx = 0; rowIdx < STANDARD_SPRITE_ANIM_STATES.length; rowIdx++) {
    const state = STANDARD_SPRITE_ANIM_STATES[rowIdx];
    if (!state) continue;
    const clip = anims[state];
    for (let f = 0; f < clip.frames; f++) {
      const ox = f * fw;
      const oy = rowIdx * fh;
      const bob = f % 2 === 1 ? -Math.round(1 * s) : 0;
      const sailBillow = (f % 3) * Math.round(1 * s);

      surf.fillRect(
        ox + Math.round(fw * 0.14),
        oy + groundY - Math.round(2 * s),
        Math.round(fw * 0.72),
        Math.max(2, Math.round(2 * s)),
        '#bae6fd',
        140
      );

      if (shipId === 'sea_king') {
        surf.fillShadedBox(
          ox + Math.round(fw * 0.16),
          oy + Math.round(fh * 0.42) + bob,
          Math.round(fw * 0.62),
          Math.round(fh * 0.36),
          hullTones
        );
        surf.fillShadedBox(
          ox + Math.round(fw * 0.56),
          oy + Math.round(fh * 0.2) + bob,
          Math.round(fw * 0.26),
          Math.round(fh * 0.32),
          sailTones
        );
        surf.fillRect(
          ox + Math.round(fw * 0.7),
          oy + Math.round(fh * 0.26) + bob,
          Math.max(2, Math.round(3 * s)),
          Math.max(2, Math.round(3 * s)),
          '#ef4444'
        );
      } else {
        if (state === 'DODGE' || state === 'TRANSFORM' || (state === 'MOVE' && f % 2 === 0)) {
          surf.fillShadedBox(
            ox + Math.round(fw * 0.04),
            oy + Math.round(fh * 0.52) + bob,
            Math.round(fw * 0.16),
            Math.round(fh * 0.14),
            ['#E0F2FE', '#38BDF8', '#0284C7']
          );
        }
        surf.fillShadedBox(
          ox + Math.round(fw * 0.18),
          oy + Math.round(fh * 0.56) + bob,
          Math.round(fw * 0.62),
          Math.round(fh * 0.22),
          hullTones
        );
        surf.fillRect(
          ox + Math.round(fw * 0.46),
          oy + Math.round(fh * 0.16) + bob,
          Math.max(2, Math.round(3 * s)),
          Math.round(fh * 0.42),
          '#451a03'
        );
        surf.fillShadedBox(
          ox + Math.round(fw * 0.32),
          oy + Math.round(fh * 0.22) + bob,
          Math.round(fw * 0.34) + sailBillow,
          Math.round(fh * 0.28),
          sailTones
        );
        surf.fillShadedBox(
          ox + Math.round(fw * 0.44),
          oy + Math.round(fh * 0.3) + bob,
          Math.round(fw * 0.12),
          Math.round(fh * 0.1),
          emblemTones
        );
        surf.fillShadedBox(
          ox + Math.round(fw * 0.74),
          oy + Math.round(fh * 0.46) + bob,
          Math.round(fw * 0.14),
          Math.round(fh * 0.16),
          emblemTones
        );
      }
      surf.applyCellHueShiftedOutline(ox, oy, fw, fh, groundY);
    }
  }

  return { width, height, data: surf.data };
}
