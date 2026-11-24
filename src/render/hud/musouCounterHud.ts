import type { MusouCounterSnapshot } from '../three/threeTypes';
import type { ViewportMetrics } from '../viewport/responsiveViewportManager';

export interface MusouHudRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Computes Safe Area HUD placement for the Musou KO/HIT counter on the right side below OMEGA cards
 * and safely above bottom touch/skill buttons (0px overlap at Galaxy S25 Ultra 915x412).
 */
export function computeMusouCounterHudRect(viewport: ViewportMetrics): MusouHudRect {
  const width = 156;
  const height = 96;
  const x = Math.max(viewport.safeRect.left + 8, viewport.safeRect.right - width - 12);
  const minYBelowOmega = viewport.safeRect.top + 150;
  const maxYAboveTouch = Math.max(minYBelowOmega, viewport.safeRect.bottom - height - 104);
  const preferredY = Math.round(viewport.viewHeight * 0.41);
  const y = Math.min(maxYAboveTouch, Math.max(minYBelowOmega, preferredY));
  return { x, y, width, height };
}

/**
 * Renders the 3D Musou KO count, active HIT combo streak, boss lock-on badge, and destructibles count.
 * Uses crisp Canvas 2D vectors only (no canvas blur effects).
 */
export function renderMusouCounterHud(
  ctx: CanvasRenderingContext2D,
  snapshot: MusouCounterSnapshot,
  viewport: ViewportMetrics
): void {
  const rect = computeMusouCounterHudRect(viewport);

  ctx.save();
  ctx.fillStyle = 'rgba(15, 23, 42, 0.82)';
  ctx.strokeStyle = snapshot.hitComboCount > 0 ? '#facc15' : '#38bdf8';
  ctx.lineWidth = 2;

  ctx.beginPath();
  ctx.roundRect(rect.x, rect.y, rect.width, rect.height, 8);
  ctx.fill();
  ctx.stroke();

  // KO tally
  ctx.textBaseline = 'top';
  ctx.fillStyle = '#f8fafc';
  ctx.font = 'bold 20px sans-serif';
  ctx.fillText(`${snapshot.koCount}`, rect.x + 12, rect.y + 8);
  ctx.fillStyle = '#facc15';
  ctx.font = 'bold 12px sans-serif';
  ctx.fillText('K.O.', rect.x + rect.width - 42, rect.y + 13);

  // Active Hit Combo
  if (snapshot.hitComboCount > 0) {
    ctx.fillStyle = '#38bdf8';
    ctx.font = 'bold 16px sans-serif';
    ctx.fillText(`${snapshot.hitComboCount} HIT!`, rect.x + 12, rect.y + 34);
  } else {
    ctx.fillStyle = '#94a3b8';
    ctx.font = '11px sans-serif';
    ctx.fillText('연격 대기 중', rect.x + 12, rect.y + 37);
  }

  // Boss lock-on status + destructibles count
  ctx.fillStyle = snapshot.lockedBossName ? '#f43f5e' : '#cbd5e1';
  ctx.font = 'bold 10px sans-serif';
  const lockLabel = snapshot.lockedBossName
    ? `🎯 ${snapshot.lockedBossName}`
    : '[TAB] 보스 록온';
  ctx.fillText(lockLabel, rect.x + 12, rect.y + 58, rect.width - 24);

  ctx.fillStyle = '#a3e635';
  ctx.font = '10px sans-serif';
  ctx.fillText(
    `파괴 오브젝트: ${snapshot.destructiblesRemaining}/${snapshot.destructiblesTotal}`,
    rect.x + 12,
    rect.y + 75,
    rect.width - 24
  );
  ctx.restore();
}
