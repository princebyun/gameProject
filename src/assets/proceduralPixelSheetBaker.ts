import type {
  FormDefinition,
  UnitDefinition
} from '../core/types/dataSchemas';
import {
  STANDARD_SPRITE_ANIM_STATES,
  type SpriteSheetManifestEntry
} from '../data/assets/types';

export const SHEET_COLUMNS = 6;
export const SHEET_ROWS = STANDARD_SPRITE_ANIM_STATES.length; // 11 rows

function drawPixelOutline(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number
): void {
  // Subtle dark ground shadow anchored near y = 0.86 * h
  ctx.fillStyle = 'rgba(0, 0, 0, 0.36)';
  const sw = Math.round(w * 0.56);
  const sh = Math.max(3, Math.round(h * 0.1));
  ctx.fillRect(Math.round((w - sw) * 0.5), Math.round(h * 0.84), sw, sh);
}

/**
 * Bakes a real multi-frame (6 cols x 11 rows) pixel-art sprite sheet onto an offscreen canvas
 * using a unit's base avatar sprite, palette, weapon/element colors, and form metadata.
 */
export function bakeProceduralUnitSpriteSheet(
  entry: SpriteSheetManifestEntry,
  unitDef: UnitDefinition,
  formDef: FormDefinition | null,
  baseAvatarCanvas: HTMLCanvasElement | null
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

  const primary = formDef?.auraColor ?? unitDef.palette.primary;
  const accent = unitDef.palette.accent;
  const secondary = unitDef.palette.secondary;
  const isBeast = formDef?.stanceRole === 'BEAST' || fw === 96;

  // Scratch cell canvas so each frame stays crisply pixel-bounded
  const cell = document.createElement('canvas');
  cell.width = fw;
  cell.height = fh;
  const cctx = cell.getContext('2d')!;
  cctx.imageSmoothingEnabled = false;

  for (const state of STANDARD_SPRITE_ANIM_STATES) {
    const clip = entry.animations[state];
    const row = clip.row;
    const frameCount = Math.min(SHEET_COLUMNS, Math.max(1, clip.frames));

    for (let f = 0; f < frameCount; f++) {
      cctx.clearRect(0, 0, fw, fh);
      drawPixelOutline(cctx, fw, fh);

      const t = frameCount > 1 ? f / (frameCount - 1) : 0;
      const spriteSize = Math.round(fw * (isBeast ? 0.82 : 0.78));
      let ox = Math.round((fw - spriteSize) * 0.5);
      let oy = Math.round(fh * 0.86 - spriteSize);
      let rot = 0;
      let scaleX = 1;
      let scaleY = 1;

      if (state === 'IDLE') {
        oy += f % 2 === 1 ? -1 : 0;
        if (f === 2) scaleY = 1.03;
      } else if (state === 'MOVE') {
        const bob = f % 2 === 0 ? -2 : 0;
        ox += f % 2 === 0 ? 1 : -1;
        oy += bob;
        rot = 0.08;
        // Foot dust pixels
        cctx.fillStyle = 'rgba(226, 232, 240, 0.55)';
        cctx.fillRect(
          Math.round(fw * 0.22 - (f % 3) * 2),
          Math.round(fh * 0.82),
          Math.max(2, Math.round(fw * 0.08)),
          Math.max(2, Math.round(fh * 0.06))
        );
      } else if (state === 'WINDUP') {
        oy += Math.round(fw * 0.05);
        ox -= Math.round(fw * 0.06);
        scaleY = 0.92;
        scaleX = 1.06;
        // Gathering charge ring
        cctx.strokeStyle = primary;
        cctx.lineWidth = Math.max(1, Math.round(fw / 24));
        const r = Math.max(3, Math.round(fw * (0.28 - t * 0.14)));
        cctx.strokeRect(
          Math.round(fw * 0.5 - r),
          Math.round(fh * 0.5 - r),
          r * 2,
          r * 2
        );
      } else if (state === 'ATTACK_MELEE') {
        const isHit = f === (clip.hitFrame ?? 2);
        ox += isHit ? Math.round(fw * 0.12) : Math.round(fw * 0.04);
        rot = isHit ? 0.14 : -0.06;
        // Pixel weapon/fist slash arc on strike frames
        if (f >= 1) {
          cctx.fillStyle = isHit ? '#ffffff' : accent;
          const arcX = Math.round(fw * 0.62);
          const arcY = Math.round(fh * (0.22 + (f - 1) * 0.12));
          cctx.fillRect(arcX, arcY, Math.round(fw * 0.3), Math.max(2, Math.round(fh * 0.09)));
          cctx.fillStyle = primary;
          cctx.fillRect(
            arcX - 2,
            arcY + Math.max(2, Math.round(fh * 0.09)),
            Math.round(fw * 0.26),
            Math.max(2, Math.round(fh * 0.07))
          );
        }
      } else if (state === 'ATTACK_CAST') {
        const isCast = f === (clip.hitFrame ?? 1);
        ox += Math.round(fw * 0.04);
        // Elemental cast orb in front
        const orbR = Math.max(3, Math.round(fw * (isCast ? 0.16 : 0.1)));
        cctx.fillStyle = primary;
        cctx.fillRect(
          Math.round(fw * 0.72 - orbR * 0.5),
          Math.round(fh * 0.44 - orbR * 0.5),
          orbR,
          orbR
        );
        if (isCast) {
          cctx.fillStyle = '#ffffff';
          const inner = Math.max(2, Math.round(orbR * 0.5));
          cctx.fillRect(
            Math.round(fw * 0.72 - inner * 0.5),
            Math.round(fh * 0.44 - inner * 0.5),
            inner,
            inner
          );
        }
      } else if (state === 'CLASH') {
        ox += f % 2 === 0 ? 1 : -1;
        oy += 1;
        // Clash sparks at front edge
        cctx.fillStyle = f % 2 === 0 ? '#fde047' : '#ffffff';
        cctx.fillRect(Math.round(fw * 0.78), Math.round(fh * 0.36), Math.max(3, Math.round(fw * 0.12)), Math.max(3, Math.round(fh * 0.12)));
      } else if (state === 'DODGE') {
        ox += Math.round(fw * 0.08);
        scaleX = 1.12;
        scaleY = 0.88;
        // Speed lines behind
        cctx.fillStyle = 'rgba(56, 189, 248, 0.75)';
        for (let line = 0; line < 3; line++) {
          cctx.fillRect(
            Math.round(fw * 0.04),
            Math.round(fh * (0.28 + line * 0.18)),
            Math.round(fw * (0.22 + f * 0.06)),
            Math.max(1, Math.round(fh * 0.04))
          );
        }
      } else if (state === 'HIT') {
        ox -= Math.round(fw * (0.08 + f * 0.04));
        rot = -0.18;
      } else if (state === 'DOWNED') {
        oy += Math.round(fh * 0.24);
        rot = -1.35;
      } else if (state === 'TRANSFORM') {
        const burst = Math.round(fw * (0.2 + t * 0.28));
        cctx.fillStyle = primary;
        cctx.globalAlpha = 0.45;
        cctx.fillRect(
          Math.round(fw * 0.5 - burst * 0.5),
          Math.round(fh * 0.1),
          burst,
          Math.round(fh * 0.76)
        );
        cctx.globalAlpha = 1;
        oy -= Math.round(t * fw * 0.08);
      } else if (state === 'VICTORY') {
        oy -= f % 2 === 0 ? 2 : 0;
        // Golden victory sparkles
        cctx.fillStyle = '#fde047';
        const spX = Math.round(fw * (0.18 + (f % 3) * 0.3));
        const spY = Math.round(fh * (0.1 + ((f + 1) % 2) * 0.12));
        cctx.fillRect(spX, spY, Math.max(2, Math.round(fw * 0.07)), Math.max(2, Math.round(fh * 0.07)));
      }

      // Draw transformed character base pixel art inside frame cell
      cctx.save();
      const cx = Math.round(ox + spriteSize * 0.5);
      const cy = Math.round(oy + spriteSize * 0.5);
      cctx.translate(cx, cy);
      if (rot !== 0) cctx.rotate(rot);
      cctx.scale(scaleX, scaleY);

      if (baseAvatarCanvas) {
        cctx.drawImage(
          baseAvatarCanvas,
          Math.round(-spriteSize * 0.5),
          Math.round(-spriteSize * 0.5),
          spriteSize,
          spriteSize
        );
      } else {
        // Fallback crisp silhouette block if avatar canvas unavailable
        cctx.fillStyle = primary;
        cctx.fillRect(
          Math.round(-spriteSize * 0.32),
          Math.round(-spriteSize * 0.36),
          Math.round(spriteSize * 0.64),
          Math.round(spriteSize * 0.72)
        );
        cctx.fillStyle = secondary;
        cctx.fillRect(
          Math.round(-spriteSize * 0.24),
          Math.round(-spriteSize * 0.42),
          Math.round(spriteSize * 0.48),
          Math.round(spriteSize * 0.24)
        );
      }
      cctx.restore();

      // Blit cell onto master sprite sheet at exact integer grid coordinates
      ctx.drawImage(cell, f * fw, row * fh);
    }
  }

  return sheet;
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
        // Giant Sea King serpent coils & glowing eyes
        ctx.fillStyle = hullColor;
        ctx.fillRect(x0 + Math.round(fw * 0.14), y0 + Math.round(fh * 0.36) + bob, Math.round(fw * 0.68), Math.round(fh * 0.38));
        ctx.fillStyle = sailColor;
        ctx.fillRect(x0 + Math.round(fw * 0.56), y0 + Math.round(fh * 0.16) + bob, Math.round(fw * 0.3), Math.round(fh * 0.34));
        ctx.fillStyle = emblemColor;
        ctx.fillRect(x0 + Math.round(fw * 0.74), y0 + Math.round(fh * 0.24) + bob, Math.round(fw * 0.08), Math.round(fh * 0.08));
        continue;
      }

      // Coup de Burst / Dodge jet exhaust plume
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
      // Jolly Roger / Emblem / Figurehead (Lion on Sunny, Sheep on Merry)
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
