import type { IslandLandmarkDefinition } from '../../core/types/rpgSchemas';
import { drawCompactFootShadow } from './islandYSortQueue';

export const ARCH_LANDMARK_KINDS = new Set<IslandLandmarkDefinition['kind']>([
  'TORII_GATE',
  'CIRCUS_TENT',
  'SHARK_GATE',
  'BEANSTALK_ARCH',
  'CORAL_ARCH',
  'COLOSSEUM_ARCH',
  'WAFFLE_ARCH',
  'WORLD_TREE_ROOT'
]);

/**
 * Draws Layer 3 base geometry for the 15 sea-zone-wide island landmarks (0 shadowBlur).
 */
export function drawExtendedLandmarkBase(
  ctx: CanvasRenderingContext2D,
  lm: IslandLandmarkDefinition,
  ts: number,
  tick: number
): void {
  const x = lm.tileX * ts;
  const y = lm.tileY * ts;
  const w = lm.widthTiles * ts;
  const h = lm.heightTiles * ts;
  const cx = Math.round(x + w * 0.5);
  const footY = Math.round(y + h);

  if (lm.kind === 'CIRCUS_TENT') {
    ctx.fillStyle = '#991b1b';
    ctx.fillRect(x + 4, y + 18, 10, h - 18);
    ctx.fillRect(x + w - 14, y + 18, 10, h - 18);
    ctx.fillStyle = '#facc15';
    ctx.fillRect(x + 6, footY - 8, 6, 8);
    ctx.fillRect(x + w - 12, footY - 8, 6, 8);
  } else if (lm.kind === 'FISH_PROW') {
    drawCompactFootShadow(ctx, cx, footY, Math.round(w * 0.48), 7);
    ctx.fillStyle = '#78350f';
    ctx.fillRect(x + 8, y + 16, w - 16, h - 16);
    ctx.fillStyle = '#0284c7';
    ctx.fillRect(x + 12, y + 10, w - 24, h - 22);
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(cx - 10, y + 14, 6, 6);
    ctx.fillRect(cx + 4, y + 14, 6, 6);
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(cx - 8, y + 16, 3, 3);
    ctx.fillRect(cx + 6, y + 16, 3, 3);
    ctx.fillStyle = '#facc15';
    ctx.fillRect(x + 4, y + 20, 8, 14);
    ctx.fillRect(x + w - 12, y + 20, 8, 14);
  } else if (lm.kind === 'SHARK_GATE') {
    ctx.fillStyle = '#1e3a8a';
    ctx.fillRect(x + 6, y + 16, 12, h - 16);
    ctx.fillRect(x + w - 18, y + 16, 12, h - 16);
    ctx.fillStyle = '#94a3b8';
    ctx.fillRect(x + 4, footY - 8, 16, 8);
    ctx.fillRect(x + w - 20, footY - 8, 16, 8);
  } else if (lm.kind === 'EXECUTION_PLATFORM') {
    drawCompactFootShadow(ctx, cx, footY, Math.round(w * 0.46), 6);
    ctx.fillStyle = '#475569';
    ctx.fillRect(x + 4, footY - 12, w - 8, 12);
    ctx.fillStyle = '#78350f';
    ctx.fillRect(x + 8, y + 14, w - 16, h - 24);
    ctx.fillStyle = '#b45309';
    ctx.fillRect(x + 12, y + 10, w - 24, 6);
    ctx.fillStyle = '#451a03';
    ctx.fillRect(x + 14, y + 2, 5, 12);
    ctx.fillRect(x + w - 19, y + 2, 5, 12);
  } else if (lm.kind === 'ROPEWAY_TOWER') {
    drawCompactFootShadow(ctx, cx, footY, Math.round(w * 0.42), 5);
    ctx.fillStyle = '#334155';
    ctx.fillRect(x + 8, y + 10, 8, h - 10);
    ctx.fillRect(x + w - 16, y + 10, 8, h - 10);
    ctx.fillStyle = '#94a3b8';
    ctx.fillRect(x + 6, y + 16, w - 12, 6);
  } else if (lm.kind === 'CLOCK_TOWER') {
    drawCompactFootShadow(ctx, cx, footY, Math.round(w * 0.45), 6);
    ctx.fillStyle = '#b45309';
    ctx.fillRect(x + 8, y + 8, w - 16, h - 8);
    ctx.fillStyle = '#fde68a';
    ctx.fillRect(x + 12, y + 12, w - 24, h - 16);
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(cx - 8, y + 14, 16, 16);
    ctx.strokeStyle = '#78350f';
    ctx.lineWidth = 2;
    ctx.strokeRect(cx - 8, y + 14, 16, 16);
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(cx - 1, y + 17, 2, 6);
    ctx.fillRect(cx, y + 21, 5, 2);
  } else if (lm.kind === 'BEANSTALK_ARCH') {
    ctx.fillStyle = '#14532d';
    ctx.fillRect(x + 4, y + 14, 14, h - 14);
    ctx.fillRect(x + w - 18, y + 14, 14, h - 14);
    ctx.fillStyle = '#22c55e';
    ctx.fillRect(x + 8, y + 18, 6, h - 22);
    ctx.fillRect(x + w - 14, y + 18, 6, h - 22);
  } else if (lm.kind === 'GOLDEN_BELL') {
    drawCompactFootShadow(ctx, cx, footY, Math.round(w * 0.44), 6);
    ctx.fillStyle = '#78350f';
    ctx.fillRect(x + 6, y + 10, 8, h - 10);
    ctx.fillRect(x + w - 14, y + 10, 8, h - 10);
    ctx.fillRect(x + 4, y + 6, w - 8, 7);
    const sway = Math.round(Math.sin(tick * 0.06) * 1.5);
    ctx.fillStyle = '#eab308';
    ctx.fillRect(cx - 11 + sway, y + 14, 22, 20);
    ctx.fillStyle = '#fef08a';
    ctx.fillRect(cx - 8 + sway, y + 17, 7, 13);
  } else if (lm.kind === 'GOTHIC_MAST') {
    drawCompactFootShadow(ctx, cx, footY, Math.round(w * 0.35), 5);
    ctx.fillStyle = '#1e1b2e';
    ctx.fillRect(cx - 5, y + 8, 10, h - 8);
    ctx.fillStyle = '#6b21a8';
    ctx.fillRect(cx - 3, y + 14, 6, h - 18);
  } else if (lm.kind === 'WARSHIP_HULL') {
    const bob = Math.round(Math.sin(tick * 0.07) * 1.5);
    ctx.fillStyle = 'rgba(56, 189, 248, 0.25)';
    ctx.fillRect(x + 2, footY - 8, w - 4, 8);
    ctx.fillStyle = '#334155';
    ctx.fillRect(x + 6, y + 14 + bob, w - 12, h - 18);
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(cx - 3, y + 2 + bob, 6, 22);
    ctx.fillRect(cx - 18, y + 5 + bob, 36, 12);
    ctx.fillStyle = '#0284c7';
    ctx.fillRect(cx - 12, y + 10 + bob, 24, 3);
  } else if (lm.kind === 'CORAL_ARCH') {
    ctx.fillStyle = '#be185d';
    ctx.fillRect(x + 6, y + 16, 12, h - 16);
    ctx.fillRect(x + w - 18, y + 16, 12, h - 16);
    ctx.fillStyle = '#2dd4bf';
    ctx.fillRect(x + 8, y + 20, 6, 12);
    ctx.fillRect(x + w - 14, y + 20, 6, 12);
  } else if (lm.kind === 'COLOSSEUM_ARCH') {
    ctx.fillStyle = '#78716c';
    ctx.fillRect(x + 4, y + 14, 14, h - 14);
    ctx.fillRect(x + w - 18, y + 14, 14, h - 14);
    ctx.fillStyle = '#facc15';
    ctx.fillRect(x + 7, y + 18, 8, 6);
    ctx.fillRect(x + w - 15, y + 18, 8, 6);
  } else if (lm.kind === 'WAFFLE_ARCH') {
    ctx.fillStyle = '#d97706';
    ctx.fillRect(x + 6, y + 16, 12, h - 16);
    ctx.fillRect(x + w - 18, y + 16, 12, h - 16);
    ctx.fillStyle = '#f472b6';
    ctx.fillRect(x + 6, footY - 8, 12, 8);
    ctx.fillRect(x + w - 18, footY - 8, 12, 8);
  } else if (lm.kind === 'WORLD_TREE_ROOT') {
    ctx.fillStyle = '#713f12';
    ctx.fillRect(x + 4, y + 14, 16, h - 14);
    ctx.fillRect(x + w - 20, y + 14, 16, h - 14);
    ctx.fillStyle = '#a16207';
    ctx.fillRect(x + 8, y + 18, 8, h - 22);
    ctx.fillRect(x + w - 16, y + 18, 8, h - 22);
  } else if (lm.kind === 'RUNE_MONOLITH') {
    drawCompactFootShadow(ctx, cx, footY, Math.round(w * 0.42), 5);
    ctx.fillStyle = '#334155';
    ctx.fillRect(x + 6, y + 6, w - 12, h - 6);
    ctx.fillStyle = '#475569';
    ctx.fillRect(x + 9, y + 9, w - 18, h - 12);
    const pulse = (Math.floor(tick / 15) % 2) === 0;
    ctx.fillStyle = pulse ? '#38bdf8' : '#facc15';
    ctx.fillRect(cx - 2, y + 12, 4, h - 20);
    ctx.fillRect(cx - 6, y + 18, 12, 3);
  }
}

/**
 * Draws Layer 4 overhanging roofs, arches, and canopies that occlude passing characters.
 */
export function drawExtendedLandmarkOverhead(
  ctx: CanvasRenderingContext2D,
  lm: IslandLandmarkDefinition,
  ts: number,
  tick: number
): void {
  const x = lm.tileX * ts;
  const y = lm.tileY * ts;
  const w = lm.widthTiles * ts;
  const cx = Math.round(x + w * 0.5);

  if (lm.kind === 'CIRCUS_TENT') {
    ctx.fillStyle = '#dc2626';
    ctx.fillRect(x - 4, y, w + 8, 18);
    ctx.fillStyle = '#facc15';
    for (let sx = x; sx < x + w; sx += 16) {
      ctx.fillRect(sx, y + 2, 8, 16);
    }
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(cx - 3, y - 6, 6, 8);
  } else if (lm.kind === 'SHARK_GATE') {
    ctx.fillStyle = '#1e40af';
    ctx.fillRect(x - 6, y + 2, w + 12, 14);
    ctx.fillStyle = '#f8fafc';
    for (let tx = x; tx < x + w - 4; tx += 10) {
      ctx.fillRect(tx + 2, y + 15, 5, 5);
    }
  } else if (lm.kind === 'ROPEWAY_TOWER') {
    const glide = Math.round(Math.sin(tick * 0.05) * 14);
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(x - 16, y + 4, w + 32, 3);
    ctx.fillStyle = '#dc2626';
    ctx.fillRect(cx - 8 + glide, y + 7, 16, 12);
    ctx.fillStyle = '#bae6fd';
    ctx.fillRect(cx - 5 + glide, y + 9, 10, 5);
  } else if (lm.kind === 'BEANSTALK_ARCH') {
    ctx.fillStyle = '#15803d';
    ctx.fillRect(x - 6, y, w + 12, 16);
    ctx.fillStyle = '#4ade80';
    ctx.fillRect(x, y + 4, w, 6);
    ctx.fillStyle = '#fef08a';
    ctx.fillRect(cx - 8, y + 2, 16, 4);
  } else if (lm.kind === 'GOTHIC_MAST') {
    ctx.fillStyle = '#312e81';
    ctx.fillRect(x - 6, y + 4, w + 12, 6);
    ctx.fillStyle = '#9333ea';
    ctx.fillRect(x, y + 10, w, 12);
    ctx.fillStyle = '#1e1b2e';
    ctx.fillRect(cx - 6, y + 12, 12, 8);
  } else if (lm.kind === 'CORAL_ARCH') {
    ctx.fillStyle = '#f472b6';
    ctx.fillRect(x - 4, y + 2, w + 8, 14);
    ctx.fillStyle = '#2dd4bf';
    ctx.fillRect(x + 4, y + 5, w - 8, 6);
  } else if (lm.kind === 'COLOSSEUM_ARCH') {
    ctx.fillStyle = '#a8a29e';
    ctx.fillRect(x - 6, y + 2, w + 12, 15);
    ctx.fillStyle = '#ef4444';
    ctx.fillRect(cx - 12, y + 4, 24, 6);
  } else if (lm.kind === 'WAFFLE_ARCH') {
    ctx.fillStyle = '#f59e0b';
    ctx.fillRect(x - 4, y + 2, w + 8, 15);
    ctx.fillStyle = '#f472b6';
    ctx.fillRect(x - 6, y, w + 12, 6);
    ctx.fillStyle = '#fef08a';
    ctx.fillRect(cx - 6, y + 8, 12, 5);
  } else if (lm.kind === 'WORLD_TREE_ROOT') {
    ctx.fillStyle = '#713f12';
    ctx.fillRect(x - 8, y, w + 16, 16);
    ctx.fillStyle = '#ca8a04';
    ctx.fillRect(x - 2, y + 4, w + 4, 6);
    ctx.fillStyle = '#a3e635';
    ctx.fillRect(x + 8, y - 2, w - 16, 4);
  }
}
