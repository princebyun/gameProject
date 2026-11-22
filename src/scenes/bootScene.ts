import {
  DEFAULT_VIEWPORT_METRICS,
  type ViewportMetrics
} from '../render/viewport/responsiveViewportManager';

export interface BootSceneState {
  progress: number; // 0.0 ~ 1.0
  statusText: string;
  elapsedSec: number;
  completed: boolean;
}

export function createBootSceneState(): BootSceneState {
  return {
    progress: 0,
    statusText: '도트 스프라이트 · 타일셋 · 레트로 오디오 불러오는 중...',
    elapsedSec: 0,
    completed: false
  };
}

export function stepBootScene(
  state: BootSceneState,
  assetsReady: boolean,
  dt: number
): boolean {
  state.elapsedSec += dt;
  const target = assetsReady ? 1.0 : 0.78;
  const speed = assetsReady ? 1.85 : 0.65;
  state.progress = Math.min(target, state.progress + dt * speed);

  if (state.progress >= 1.0 && state.elapsedSec >= 0.45) {
    state.statusText = '출항 준비 완료!';
    state.completed = true;
    return true;
  }
  return false;
}

export function renderBootScene(
  ctx: CanvasRenderingContext2D,
  state: BootSceneState,
  tick: number,
  viewport: ViewportMetrics = DEFAULT_VIEWPORT_METRICS
): void {
  const w = viewport.viewWidth;
  const h = viewport.viewHeight;
  const cx = Math.round(w * 0.5);
  const cy = Math.round(h * 0.46);

  ctx.save();

  // Deep ocean navy gradient
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, '#070d1a');
  grad.addColorStop(1, '#0f1e38');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  // Pixel pirate flag + spinning log-pose compass emblem
  const bob = Math.round(Math.sin(tick * 0.1) * 4);
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(cx - 46, cy - 64 + bob, 92, 62);
  ctx.strokeStyle = '#facc15';
  ctx.lineWidth = 2;
  ctx.strokeRect(cx - 46, cy - 64 + bob, 92, 62);

  // Pixel Straw-Hat Jolly Roger silhouette
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(cx - 12, cy - 42 + bob, 24, 18);
  ctx.fillRect(cx - 8, cy - 24 + bob, 16, 8);
  ctx.fillStyle = '#090d16';
  ctx.fillRect(cx - 8, cy - 36 + bob, 5, 5);
  ctx.fillRect(cx + 3, cy - 36 + bob, 5, 5);
  // Straw hat brim & crimson ribbon
  ctx.fillStyle = '#facc15';
  ctx.fillRect(cx - 22, cy - 46 + bob, 44, 5);
  ctx.fillRect(cx - 13, cy - 55 + bob, 26, 9);
  ctx.fillStyle = '#dc2626';
  ctx.fillRect(cx - 13, cy - 49 + bob, 26, 3);

  // Spinning compass dial right next to progress bar
  const compX = cx - 170;
  const compY = cy + 62;
  ctx.strokeStyle = '#38bdf8';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(compX, compY, 14, 0, Math.PI * 2);
  ctx.stroke();
  const angle = tick * 0.12;
  ctx.strokeStyle = '#facc15';
  ctx.beginPath();
  ctx.moveTo(compX, compY);
  ctx.lineTo(compX + Math.cos(angle) * 11, compY + Math.sin(angle) * 11);
  ctx.stroke();

  // Title & loading progress bar
  ctx.font = 'bold 18px monospace';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#fde047';
  ctx.fillText('ONE PIECE : GRAND VOYAGE', cx, cy + 26);

  const barW = 300;
  const barH = 14;
  const barX = cx - barW * 0.5 + 12;
  const barY = cy + 55;
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(barX, barY, barW, barH);
  ctx.fillStyle = '#38bdf8';
  ctx.fillRect(barX + 2, barY + 2, Math.round((barW - 4) * state.progress), barH - 4);
  ctx.strokeStyle = '#facc15';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(barX, barY, barW, barH);

  ctx.font = '11px monospace';
  ctx.fillStyle = '#cbd5e1';
  ctx.fillText(
    `${state.statusText} (${Math.round(state.progress * 100)}%)`,
    cx,
    barY + 34
  );

  ctx.restore();
}
