import type { Disposable } from '../../core/types/disposable';
import { releaseOffscreenCanvas } from '../canvasGpuDispose';

export type SpriteEffectKind =
  | 'WHITE_FLASH'
  | 'ARMAMENT_BLACK'
  | 'LOGIA_SILHOUETTE'
  | 'AFTERIMAGE';

const ARMAMENT_OUTLINE_OFFSETS: readonly (readonly [number, number])[] = [
  [-1, 0],
  [1, 0],
  [0, -1],
  [0, 1]
];

/**
 * Offscreen LRU Cache for tinted/silhouette sprite frames using `source-atop`.
 * Avoids any per-frame pixel array iteration (`getImageData`) or runtime `shadowBlur`.
 */
export class SpriteEffectCache implements Disposable {
  private cache = new Map<string, HTMLCanvasElement>();

  constructor(private readonly maxEntries: number = 256) {}

  public get size(): number {
    return this.cache.size;
  }

  public getOrCreateEffectFrame(
    sheetKey: string,
    sheet: HTMLImageElement | HTMLCanvasElement,
    row: number,
    frame: number,
    fw: number,
    fh: number,
    effect: SpriteEffectKind,
    tintColor: string = '#ffffff',
    srcRect?: { x: number; y: number; w: number; h: number }
  ): HTMLCanvasElement | null {
    if (typeof document === 'undefined') {
      return null;
    }

    const sx = srcRect ? srcRect.x : frame * fw;
    const sy = srcRect ? srcRect.y : row * fh;
    const sw = srcRect ? srcRect.w : fw;
    const sh = srcRect ? srcRect.h : fh;
    const cacheKey = `${sheetKey}:${row}:${frame}:${sw}x${sh}:${effect}:${tintColor}`;
    const existing = this.cache.get(cacheKey);
    if (existing) {
      // Refresh LRU recency
      this.cache.delete(cacheKey);
      this.cache.set(cacheKey, existing);
      return existing;
    }

    const canvas = document.createElement('canvas');
    canvas.width = sw;
    canvas.height = sh;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      releaseOffscreenCanvas(canvas);
      return null;
    }

    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(sheet, sx, sy, sw, sh, 0, 0, sw, sh);

    if (effect === 'WHITE_FLASH') {
      ctx.globalCompositeOperation = 'source-atop';
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, sw, sh);
    } else if (effect === 'ARMAMENT_BLACK') {
      // Deep obsidian iron tint + purple/crimson metallic rim highlight
      ctx.globalCompositeOperation = 'source-atop';
      ctx.fillStyle = 'rgba(15, 23, 42, 0.72)';
      ctx.fillRect(0, 0, sw, sh);
      ctx.fillStyle = 'rgba(168, 85, 247, 0.28)';
      ctx.fillRect(0, 0, sw, Math.round(sh * 0.45));

      // Pre-bake 1px #a855f7 pixel aura outline (replaces GPU-costly blur filter)
      const outlineCanvas = document.createElement('canvas');
      outlineCanvas.width = sw;
      outlineCanvas.height = sh;
      const octx = outlineCanvas.getContext('2d');
      if (octx) {
        octx.imageSmoothingEnabled = false;
        octx.drawImage(sheet, sx, sy, sw, sh, 0, 0, sw, sh);
        octx.globalCompositeOperation = 'source-atop';
        octx.fillStyle = '#a855f7';
        octx.fillRect(0, 0, sw, sh);

        ctx.globalCompositeOperation = 'destination-over';
        ctx.globalAlpha = 0.85;
        for (let i = 0; i < ARMAMENT_OUTLINE_OFFSETS.length; i++) {
          const offset = ARMAMENT_OUTLINE_OFFSETS[i];
          if (!offset) continue;
          ctx.drawImage(outlineCanvas, offset[0], offset[1]);
        }
        ctx.globalAlpha = 1;
      }
      releaseOffscreenCanvas(outlineCanvas);
    } else if (effect === 'LOGIA_SILHOUETTE' || effect === 'AFTERIMAGE') {
      ctx.globalCompositeOperation = 'source-atop';
      ctx.fillStyle = tintColor;
      ctx.fillRect(0, 0, sw, sh);
    }

    ctx.globalCompositeOperation = 'source-over';

    if (this.cache.size >= this.maxEntries) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey !== undefined) {
        const oldestCanvas = this.cache.get(oldestKey);
        this.cache.delete(oldestKey);
        releaseOffscreenCanvas(oldestCanvas);
      }
    }
    this.cache.set(cacheKey, canvas);
    return canvas;
  }

  public clear(): void {
    for (const canvas of this.cache.values()) {
      releaseOffscreenCanvas(canvas);
    }
    this.cache.clear();
  }

  public dispose(): void {
    this.clear();
  }
}
