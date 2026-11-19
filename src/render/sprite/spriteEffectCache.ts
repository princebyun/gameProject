export type SpriteEffectKind =
  | 'WHITE_FLASH'
  | 'ARMAMENT_BLACK'
  | 'LOGIA_SILHOUETTE'
  | 'AFTERIMAGE';

/**
 * Offscreen LRU Cache for tinted/silhouette sprite frames using `source-atop`.
 * Avoids any per-frame pixel array iteration (`getImageData`) to preserve 60FPS.
 */
export class SpriteEffectCache {
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
    tintColor: string = '#ffffff'
  ): HTMLCanvasElement | null {
    if (typeof document === 'undefined') {
      return null;
    }

    const cacheKey = `${sheetKey}:${row}:${frame}:${effect}:${tintColor}`;
    const existing = this.cache.get(cacheKey);
    if (existing) {
      // Refresh LRU recency
      this.cache.delete(cacheKey);
      this.cache.set(cacheKey, existing);
      return existing;
    }

    const canvas = document.createElement('canvas');
    canvas.width = fw;
    canvas.height = fh;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;

    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(sheet, frame * fw, row * fh, fw, fh, 0, 0, fw, fh);

    if (effect === 'WHITE_FLASH') {
      ctx.globalCompositeOperation = 'source-atop';
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, fw, fh);
    } else if (effect === 'ARMAMENT_BLACK') {
      // Deep obsidian iron tint + purple/crimson metallic rim highlight
      ctx.globalCompositeOperation = 'source-atop';
      ctx.fillStyle = 'rgba(15, 23, 42, 0.72)';
      ctx.fillRect(0, 0, fw, fh);
      ctx.fillStyle = 'rgba(168, 85, 247, 0.28)';
      ctx.fillRect(0, 0, fw, Math.round(fh * 0.45));
    } else if (effect === 'LOGIA_SILHOUETTE' || effect === 'AFTERIMAGE') {
      ctx.globalCompositeOperation = 'source-atop';
      ctx.fillStyle = tintColor;
      ctx.fillRect(0, 0, fw, fh);
    }

    ctx.globalCompositeOperation = 'source-over';

    if (this.cache.size >= this.maxEntries) {
      const oldestKey = this.cache.keys().next().value;
      if (oldestKey !== undefined) {
        this.cache.delete(oldestKey);
      }
    }
    this.cache.set(cacheKey, canvas);
    return canvas;
  }

  public clear(): void {
    this.cache.clear();
  }
}
