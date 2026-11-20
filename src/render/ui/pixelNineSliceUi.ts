import { clamp } from '../../core/math/vector2';

export type PixelPanelTheme =
  | 'pirate_wood'
  | 'parchment'
  | 'gold_ribbon'
  | 'crimson_boss'
  | 'navy_hud';

interface ThemeColors {
  outerBorder: string;
  frameMid: string;
  frameHighlight: string;
  innerBg: string;
  rivetColor: string;
  grainColor: string;
}

const THEME_PALETTES: Record<PixelPanelTheme, ThemeColors> = {
  pirate_wood: {
    outerBorder: '#271206',
    frameMid: '#78350f',
    frameHighlight: '#b45309',
    innerBg: 'rgba(12, 18, 32, 0.94)',
    rivetColor: '#facc15',
    grainColor: 'rgba(180, 83, 9, 0.16)'
  },
  parchment: {
    outerBorder: '#451a03',
    frameMid: '#92400e',
    frameHighlight: '#d97706',
    innerBg: '#f6e7c1',
    rivetColor: '#fde047',
    grainColor: 'rgba(120, 53, 15, 0.08)'
  },
  gold_ribbon: {
    outerBorder: '#422006',
    frameMid: '#ca8a04',
    frameHighlight: '#fef08a',
    innerBg: 'rgba(15, 23, 42, 0.94)',
    rivetColor: '#fef9c3',
    grainColor: 'rgba(250, 204, 21, 0.12)'
  },
  crimson_boss: {
    outerBorder: '#2c070d',
    frameMid: '#991b1b',
    frameHighlight: '#ef4444',
    innerBg: 'rgba(15, 10, 18, 0.94)',
    rivetColor: '#fde047',
    grainColor: 'rgba(239, 68, 68, 0.10)'
  },
  navy_hud: {
    outerBorder: '#09111f',
    frameMid: '#1e3a5f',
    frameHighlight: '#38bdf8',
    innerBg: 'rgba(10, 17, 30, 0.92)',
    rivetColor: '#fde047',
    grainColor: 'rgba(56, 189, 248, 0.08)'
  }
};

/**
 * Draws an authentic 9-Slice Pixel RPG Panel with beveled pirate-wood / parchment / marine
 * borders, subtle horizontal wood/paper grain, and 4 corner gold pixel rivets.
 */
export function drawPixelNineSlicePanel(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  theme: PixelPanelTheme = 'pirate_wood',
  accentBorderOverride?: string
): void {
  const rx = Math.round(x);
  const ry = Math.round(y);
  const rw = Math.max(12, Math.round(w));
  const rh = Math.max(12, Math.round(h));
  const p = THEME_PALETTES[theme];

  ctx.save();
  ctx.imageSmoothingEnabled = false;

  // 1. Subtle drop shadow for depth
  ctx.fillStyle = 'rgba(0, 0, 0, 0.42)';
  ctx.fillRect(rx + 2, ry + 3, rw, rh);

  // 2. Outer dark pixel frame (beveled corners by 1px)
  ctx.fillStyle = p.outerBorder;
  ctx.fillRect(rx + 1, ry, rw - 2, rh);
  ctx.fillRect(rx, ry + 1, rw, rh - 2);

  // 3. Mid wood / metal frame band
  ctx.fillStyle = accentBorderOverride ?? p.frameMid;
  ctx.fillRect(rx + 2, ry + 1, rw - 4, rh - 2);
  ctx.fillRect(rx + 1, ry + 2, rw - 2, rh - 4);

  // 4. Top-left specular highlight rim
  ctx.fillStyle = p.frameHighlight;
  ctx.fillRect(rx + 3, ry + 2, rw - 6, 1);
  ctx.fillRect(rx + 2, ry + 3, 1, rh - 6);

  // 5. Inner panel backdrop
  ctx.fillStyle = p.innerBg;
  ctx.fillRect(rx + 4, ry + 4, rw - 8, rh - 8);

  // 6. Subtle wood / parchment horizontal texture lines
  ctx.fillStyle = p.grainColor;
  for (let gy = ry + 7; gy < ry + rh - 5; gy += 6) {
    ctx.fillRect(rx + 5, gy, rw - 10, 1);
  }

  // 7. Inner dark trim line
  ctx.strokeStyle = p.outerBorder;
  ctx.lineWidth = 1;
  ctx.strokeRect(rx + 4.5, ry + 4.5, rw - 9, rh - 9);

  // 8. Corner 2x2 Gold Rivets
  ctx.fillStyle = p.rivetColor;
  ctx.fillRect(rx + 2, ry + 2, 2, 2);
  ctx.fillRect(rx + rw - 4, ry + 2, 2, 2);
  ctx.fillRect(rx + 2, ry + rh - 4, 2, 2);
  ctx.fillRect(rx + rw - 4, ry + rh - 4, 2, 2);

  ctx.restore();
}

/**
 * Tracks each combat unit's trailing white damage delay bar (smoothly drains after taking damage).
 */
export class HpDelayTracker {
  private delayedRatioById = new Map<string, number>();

  public reset(): void {
    this.delayedRatioById.clear();
  }

  public sample(unitId: string, currentHpRatio: number, dtSec = 1 / 60): number {
    const clamped = clamp(currentHpRatio, 0, 1);
    const prev = this.delayedRatioById.get(unitId);
    if (prev === undefined || clamped >= prev) {
      this.delayedRatioById.set(unitId, clamped);
      return clamped;
    }
    const diff = prev - clamped;
    const drainRate = Math.max(0.28, diff * 2.4);
    const next = Math.max(clamped, prev - drainRate * Math.max(0.001, dtSec));
    this.delayedRatioById.set(unitId, next);
    return next;
  }
}

export const sharedHpDelayTracker = new HpDelayTracker();

/**
 * Draws an arcade/RPG slanted pixel HP bar with a trailing white damage-delay bar,
 * top pixel highlight, and dark frame.
 */
export function drawSlantedPixelHpBar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  currentRatio: number,
  delayedRatio: number,
  fillColor: string,
  slantPx = 5
): void {
  const cur = clamp(currentRatio, 0, 1);
  const del = clamp(Math.max(cur, delayedRatio), 0, 1);
  const s = Math.max(0, Math.min(slantPx, Math.floor(w * 0.15)));

  const traceParallelogram = (px: number, py: number, pw: number, ph: number) => {
    ctx.beginPath();
    ctx.moveTo(px + s, py);
    ctx.lineTo(px + pw, py);
    ctx.lineTo(px + pw - s, py + ph);
    ctx.lineTo(px, py + ph);
    ctx.closePath();
  };

  ctx.save();
  // Dark outer trough
  traceParallelogram(x - 1, y - 1, w + 2, h + 2);
  ctx.fillStyle = '#090d16';
  ctx.fill();

  // Clip interior so partial fills follow the exact slant cleanly
  traceParallelogram(x, y, w, h);
  ctx.fillStyle = '#1e293b';
  ctx.fill();
  ctx.clip();

  // Trailing white damage delay bar
  if (del > cur + 0.002) {
    ctx.fillStyle = '#fef08a';
    ctx.fillRect(x, y, Math.ceil(w * del), h);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(x, y, Math.ceil(w * del), Math.max(2, Math.floor(h * 0.5)));
  }

  // Active HP fill + top specular strip
  const fillW = Math.round(w * cur);
  if (fillW > 0) {
    ctx.fillStyle = fillColor;
    ctx.fillRect(x, y, fillW, h);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.30)';
    ctx.fillRect(x, y, fillW, Math.max(2, Math.floor(h * 0.28)));
  }

  ctx.restore();

  // Crisp pixel rim
  ctx.save();
  traceParallelogram(x, y, w, h);
  ctx.strokeStyle = '#475569';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.restore();
}

/**
 * Pure helper for radial cooldown wipe progress [0..1].
 */
export function computeCooldownWipeRatio(
  cooldownRemainingSec: number,
  maxCooldownSec: number
): number {
  if (cooldownRemainingSec <= 0 || maxCooldownSec <= 0) return 0;
  return clamp(cooldownRemainingSec / maxCooldownSec, 0, 1);
}

/**
 * Draws a clock-wipe radial cooldown overlay over a rectangular skill slot.
 */
export function drawRadialCooldownWipe(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  remainingRatio: number
): void {
  const ratio = clamp(remainingRatio, 0, 1);
  if (ratio <= 0.005) return;

  const cx = x + w * 0.5;
  const cy = y + h * 0.5;
  const r = Math.hypot(w, h) * 0.6;
  const startAngle = -Math.PI * 0.5;
  const endAngle = startAngle + Math.PI * 2 * ratio;

  ctx.save();
  ctx.beginPath();
  ctx.rect(x + 1, y + 1, w - 2, h - 2);
  ctx.clip();

  ctx.fillStyle = 'rgba(9, 13, 22, 0.62)';
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.arc(cx, cy, r, startAngle, endAngle, false);
  ctx.closePath();
  ctx.fill();

  // Bright sweeping clock hand edge
  ctx.strokeStyle = 'rgba(250, 204, 21, 0.85)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(cx, cy);
  ctx.lineTo(cx + Math.cos(endAngle) * r, cy + Math.sin(endAngle) * r);
  ctx.stroke();

  ctx.restore();
}

/**
 * Draws a pulsing golden Haki / Awakening Gauge strip.
 */
export function drawPulsingHakiGauge(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  ratio: number,
  tick: number,
  isAwakened: boolean
): void {
  const r = clamp(ratio, 0, 1);
  const pulse = 0.72 + Math.sin(tick * 0.22) * 0.28;

  ctx.save();
  ctx.fillStyle = '#090d16';
  ctx.fillRect(x, y, w, h);

  const fillW = Math.round((w - 2) * r);
  if (fillW > 0) {
    ctx.fillStyle = isAwakened
      ? `rgba(232, 121, 249, ${pulse.toFixed(2)})`
      : r >= 0.99
        ? `rgba(250, 204, 21, ${pulse.toFixed(2)})`
        : '#d97706';
    ctx.fillRect(x + 1, y + 1, fillW, h - 2);

    // Shimmer highlight pip traveling across full/awakened gauge
    if (r >= 0.99 || isAwakened) {
      const shimmerX = x + 1 + ((tick * 3) % Math.max(4, fillW));
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(shimmerX, y + 1, Math.min(6, x + 1 + fillW - shimmerX), h - 2);
    }
  }

  ctx.strokeStyle = isAwakened ? '#e879f9' : '#facc15';
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  ctx.restore();
}
