import type { Vec2 } from '../../core/math/vector2';
import {
  DEFAULT_VIEWPORT_METRICS,
  type ViewportMetrics
} from '../viewport/responsiveViewportManager';
import { getSafeHudBounds, type SafeHudBounds } from '../viewport/safeAreaLayout';

export interface BattleSpeedHudRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface BattleSpeedHudRects {
  speedBtn: BattleSpeedHudRect;
  pauseBtn: BattleSpeedHudRect;
}

function pointInRect(pt: Vec2, rect: BattleSpeedHudRect): boolean {
  return (
    pt.x >= rect.x &&
    pt.x <= rect.x + rect.w &&
    pt.y >= rect.y &&
    pt.y <= rect.y + rect.h
  );
}

/**
 * Places compact Speed & Pause buttons strictly inside top open gaps flanking the
 * Top-Center Global HUD (between ALPHA/OMEGA unit cards and above the Top Boss HP bar).
 */
export function computeBattleSpeedHudRects(
  safe: SafeHudBounds
): BattleSpeedHudRects {
  const btnW = 84;
  const btnH = 30;
  const y = Math.round(12 + safe.top);
  return {
    speedBtn: {
      x: Math.round(safe.centerX - 115 - 8 - btnW),
      y,
      w: btnW,
      h: btnH
    },
    pauseBtn: {
      x: Math.round(safe.centerX + 115 + 8),
      y,
      w: btnW,
      h: btnH
    }
  };
}

export function hitTestBattleSpeedHud(
  pt: Vec2,
  viewport: ViewportMetrics = DEFAULT_VIEWPORT_METRICS
): 'SPEED' | 'PAUSE' | null {
  const rects = computeBattleSpeedHudRects(getSafeHudBounds(viewport));
  if (pointInRect(pt, rects.speedBtn)) return 'SPEED';
  if (pointInRect(pt, rects.pauseBtn)) return 'PAUSE';
  return null;
}

export function renderBattleSpeedAndPauseHud(
  ctx: CanvasRenderingContext2D,
  speedScale: 0.5 | 0.75 | 1 | 1.25,
  isPaused: boolean,
  viewport: ViewportMetrics = DEFAULT_VIEWPORT_METRICS
): void {
  const safe = getSafeHudBounds(viewport);
  const { speedBtn, pauseBtn } = computeBattleSpeedHudRects(safe);
  const speedLabel = speedScale === 1 ? '1.0x' : `${speedScale}x`;

  ctx.save();

  // 1. Speed Toggle Pill
  const speedBorder =
    speedScale < 1 ? '#facc15' : speedScale > 1 ? '#fb923c' : '#38bdf8';
  ctx.fillStyle = 'rgba(15, 23, 42, 0.90)';
  ctx.fillRect(speedBtn.x, speedBtn.y, speedBtn.w, speedBtn.h);
  ctx.strokeStyle = speedBorder;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(speedBtn.x, speedBtn.y, speedBtn.w, speedBtn.h);

  ctx.font = 'bold 10px monospace';
  ctx.textAlign = 'center';
  ctx.fillStyle = speedBorder;
  ctx.fillText(`⏱ ${speedLabel}`, speedBtn.x + speedBtn.w * 0.5, speedBtn.y + 13);
  ctx.font = '8px monospace';
  ctx.fillStyle = '#cbd5e1';
  ctx.fillText('전투속도 [ / ]', speedBtn.x + speedBtn.w * 0.5, speedBtn.y + 24);

  // 2. Pause / Resume Pill
  const pauseBorder = isPaused ? '#4ade80' : '#94a3b8';
  ctx.fillStyle = isPaused ? 'rgba(20, 83, 45, 0.92)' : 'rgba(15, 23, 42, 0.90)';
  ctx.fillRect(pauseBtn.x, pauseBtn.y, pauseBtn.w, pauseBtn.h);
  ctx.strokeStyle = pauseBorder;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(pauseBtn.x, pauseBtn.y, pauseBtn.w, pauseBtn.h);

  ctx.font = 'bold 10px monospace';
  ctx.fillStyle = isPaused ? '#86efac' : '#f8fafc';
  ctx.fillText(
    isPaused ? '▶ 재개 (P)' : '⏸ 일시정지',
    pauseBtn.x + pauseBtn.w * 0.5,
    pauseBtn.y + 13
  );
  ctx.font = '8px monospace';
  ctx.fillStyle = '#cbd5e1';
  ctx.fillText(isPaused ? 'PAUSED' : 'PAUSE (P)', pauseBtn.x + pauseBtn.w * 0.5, pauseBtn.y + 24);

  // 3. Clean Center Pause Banner (when paused)
  if (isPaused) {
    const bw = Math.min(340, safe.width - 40);
    const bh = 62;
    const bx = Math.round(safe.centerX - bw * 0.5);
    const by = Math.round(safe.viewHeight * 0.5 - bh * 0.5);

    ctx.fillStyle = 'rgba(9, 13, 22, 0.88)';
    ctx.fillRect(bx, by, bw, bh);
    ctx.strokeStyle = '#facc15';
    ctx.lineWidth = 2;
    ctx.strokeRect(bx, by, bw, bh);

    ctx.font = 'bold 14px monospace';
    ctx.fillStyle = '#fde047';
    ctx.fillText('⏸ 전투 일시정지 (PAUSED)', safe.centerX, by + 24);
    ctx.font = '10px monospace';
    ctx.fillStyle = '#e2e8f0';
    ctx.fillText(
      `[P / ▶ 재개] 계속 · [[ / ]] 속도 조절 (현재 ${speedLabel})`,
      safe.centerX,
      by + 45
    );
  }

  ctx.restore();
}
