import type { Disposable } from '../../core/types/disposable';
import type { IslandLightingProfile } from '../../core/types/rpgSchemas';
import { releaseOffscreenCanvas } from '../canvasGpuDispose';

export type LightingMood = 'DAY' | 'DUSK' | 'NIGHT';

export interface LanternLightPoint {
  x: number;
  y: number;
  color?: string;
  radiusPx?: number;
}

/**
 * Layer-6 Atmospheric Time-of-Day Tint, Diagonal Sunbeams, Vignette & Pre-Baked Glow Sprites.
 * Never uses canvas blur filters; releases all offscreen canvases immediately on dispose().
 */
export class AtmosphereLightingOverlay implements Disposable {
  private cachedCanvas: HTMLCanvasElement | null = null;
  private cachedKey = '';
  private glowSpriteCache = new Map<string, HTMLCanvasElement>();
  private readonly bufW = 256;
  private readonly bufH = 144;

  public dispose(): void {
    releaseOffscreenCanvas(this.cachedCanvas);
    this.cachedCanvas = null;
    this.cachedKey = '';
    for (const canvas of this.glowSpriteCache.values()) {
      releaseOffscreenCanvas(canvas);
    }
    this.glowSpriteCache.clear();
  }

  private getOrBakeGlowSprite(hexColor: string): HTMLCanvasElement {
    const existing = this.glowSpriteCache.get(hexColor);
    if (existing) return existing;

    if (this.glowSpriteCache.size >= 8) {
      const oldest = this.glowSpriteCache.keys().next().value;
      if (oldest !== undefined) {
        releaseOffscreenCanvas(this.glowSpriteCache.get(oldest));
        this.glowSpriteCache.delete(oldest);
      }
    }

    const size = 64;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const gctx = canvas.getContext('2d');
    if (gctx) {
      const grad = gctx.createRadialGradient(32, 32, 2, 32, 32, 30);
      grad.addColorStop(0, hexColor);
      grad.addColorStop(0.55, `${hexColor}66`);
      grad.addColorStop(1, `${hexColor}00`);
      gctx.fillStyle = grad;
      gctx.fillRect(0, 0, size, size);
    }
    this.glowSpriteCache.set(hexColor, canvas);
    return canvas;
  }

  public render(
    ctx: CanvasRenderingContext2D,
    mood: LightingMood,
    ambientHex: string,
    viewW: number,
    viewH: number,
    lanternPoints: readonly LanternLightPoint[] = [],
    offsetX = 0,
    offsetY = 0,
    lightingProfile?: IslandLightingProfile
  ): void {
    if (typeof document === 'undefined') return;
    const key = lightingProfile
      ? `${mood}_${lightingProfile.tintHex}_${lightingProfile.tintAlpha}_${Boolean(lightingProfile.sunbeams)}`
      : `${mood}_${ambientHex}`;

    if (!this.cachedCanvas || this.cachedKey !== key) {
      if (!this.cachedCanvas) {
        this.cachedCanvas = document.createElement('canvas');
        this.cachedCanvas.width = this.bufW;
        this.cachedCanvas.height = this.bufH;
      }
      this.bakeOverlay(this.cachedCanvas, mood, lightingProfile);
      this.cachedKey = key;
    }

    ctx.save();
    ctx.drawImage(this.cachedCanvas, 0, 0, viewW, viewH);

    const shouldGlow =
      lanternPoints.length > 0 &&
      (mood === 'DUSK' ||
        mood === 'NIGHT' ||
        lightingProfile?.defaultMood === 'DUSK' ||
        lightingProfile?.defaultMood === 'CYBER');

    if (shouldGlow) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = mood === 'NIGHT' ? 0.65 : 0.45;
      for (let i = 0; i < lanternPoints.length; i++) {
        const pt = lanternPoints[i];
        if (!pt) continue;
        const lx = Math.round(pt.x + offsetX);
        const ly = Math.round(pt.y + offsetY);
        const r = pt.radiusPx ?? 42;
        if (lx + r < 0 || lx - r > viewW || ly + r < 0 || ly - r > viewH) continue;
        const sprite = this.getOrBakeGlowSprite(pt.color ?? '#38bdf8');
        ctx.drawImage(sprite, lx - r, ly - r, r * 2, r * 2);
      }
    }
    ctx.restore();
  }

  private bakeOverlay(
    canvas: HTMLCanvasElement,
    mood: LightingMood,
    profile?: IslandLightingProfile
  ): void {
    const octx = canvas.getContext('2d');
    if (!octx) return;
    const w = canvas.width;
    const h = canvas.height;
    octx.clearRect(0, 0, w, h);

    if (profile) {
      octx.save();
      octx.globalAlpha = profile.tintAlpha;
      octx.fillStyle = profile.tintHex;
      octx.fillRect(0, 0, w, h);
      octx.restore();
    } else if (mood === 'NIGHT') {
      octx.fillStyle = 'rgba(11, 18, 44, 0.34)';
      octx.fillRect(0, 0, w, h);
    } else if (mood === 'DUSK') {
      octx.fillStyle = 'rgba(88, 44, 72, 0.16)';
      octx.fillRect(0, 0, w, h);
    }

    if (profile?.sunbeams || (!profile && mood === 'DAY')) {
      octx.fillStyle = 'rgba(255, 248, 220, 0.06)';
      for (let i = 0; i < 3; i++) {
        octx.beginPath();
        const bx = 28 + i * 76;
        octx.moveTo(bx, 0);
        octx.lineTo(bx + 26, 0);
        octx.lineTo(bx - 18, h);
        octx.lineTo(bx - 44, h);
        octx.closePath();
        octx.fill();
      }
    }

    const vig = octx.createRadialGradient(w * 0.5, h * 0.5, w * 0.28, w * 0.5, h * 0.5, w * 0.68);
    vig.addColorStop(0, 'rgba(0, 0, 0, 0)');
    vig.addColorStop(1, mood === 'NIGHT' ? 'rgba(4, 7, 18, 0.38)' : 'rgba(6, 10, 20, 0.18)');
    octx.fillStyle = vig;
    octx.fillRect(0, 0, w, h);
  }
}
