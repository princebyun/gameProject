import type {
  SpriteAnimState,
  SpriteSheetManifestEntry
} from '../data/assets/types';
import {
  ExternalAssetResolver,
  type ExternalImageLoaderFn
} from './externalAssetResolver';

export interface SpriteAtlasFrameRect {
  x: number;
  y: number;
  w: number;
  h: number;
  /** Normalized horizontal pivot within frame [0..1] (0.5 = center) */
  pivotX: number;
  /** Normalized vertical pivot within frame [0..1] (0.9 = feet) */
  pivotY: number;
}

export interface SpriteAtlasAnimDef {
  fps?: number;
  loop?: boolean;
  hitFrame?: number;
  frames: SpriteAtlasFrameRect[];
}

export interface SpriteSheetMetaJson {
  version: string;
  mode: 'grid' | 'atlas';
  chromaKey?: {
    enabled: boolean;
    tolerance?: number;
    color?: [number, number, number];
  };
  frameWidth?: number;
  frameHeight?: number;
  animations: Partial<Record<SpriteAnimState, SpriteAtlasAnimDef>>;
}

export interface SmartResolvedSpriteSheet {
  entry: SpriteSheetManifestEntry;
  sheet: HTMLImageElement | HTMLCanvasElement | null;
  source: 'EXTERNAL_PNG' | 'BAKED_FALLBACK';
  /** Actual pixel frame size inside `sheet` (e.g. 48/64/112 for high-res baked sheets) */
  sheetFrameWidth: number;
  sheetFrameHeight: number;
  meta: SpriteSheetMetaJson | null;
}

export type ExternalMetaLoaderFn = (
  metaSrc: string
) => Promise<SpriteSheetMetaJson | null>;

/**
 * Computes upgraded high-detail procedural baking resolution while preserving
 * sprites.json logical frame dimensions (32 | 48 | 96) for 100% Phase 11 compatibility.
 */
export function resolveBakedFrameSize(logicalSize: number): number {
  if (logicalSize >= 96) return 112;
  if (logicalSize >= 48) return 64;
  return 48;
}

/**
 * Pure RGBA pixel chroma-key processor (DOM-free, unit-testable in Node):
 * - If `force` is false and the image already contains transparent pixels (>2%), skips keying.
 * - Otherwise samples top-left (0,0) RGB (or explicit `keyColor`) and zeroes alpha for pixels
 *   within Euclidean/Manhattan RGB tolerance.
 */
export function applyChromaKeyToPixels(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  opts: {
    tolerance?: number;
    keyColor?: [number, number, number];
    force?: boolean;
  } = {}
): { removedCount: number; sampledColor: [number, number, number] } {
  const totalPixels = width * height;
  if (totalPixels === 0 || rgba.length < totalPixels * 4) {
    return { removedCount: 0, sampledColor: [0, 0, 0] };
  }

  const sampled: [number, number, number] = opts.keyColor ?? [
    rgba[0],
    rgba[1],
    rgba[2]
  ];

  // If image already has native alpha transparency and caller didn't force keying, preserve as-is
  if (!opts.force) {
    let transparentCount = 0;
    for (let i = 3; i < rgba.length; i += 4) {
      if (rgba[i] < 16) transparentCount += 1;
    }
    if (transparentCount / totalPixels >= 0.02) {
      return { removedCount: 0, sampledColor: sampled };
    }
  }

  const tol = opts.tolerance ?? 24;
  const tolSq = tol * tol * 3;
  let removedCount = 0;

  for (let i = 0; i < totalPixels; i++) {
    const idx = i * 4;
    if (rgba[idx + 3] === 0) continue;
    const dr = rgba[idx] - sampled[0];
    const dg = rgba[idx + 1] - sampled[1];
    const db = rgba[idx + 2] - sampled[2];
    if (dr * dr + dg * dg + db * db <= tolSq) {
      rgba[idx + 3] = 0;
      removedCount += 1;
    }
  }

  return { removedCount, sampledColor: sampled };
}

/**
 * Pure 4-neighbor BFS Connected-Component frame bounding box detector.
 * Automatically discovers non-uniform frames on real GBA/NDS sprite sheets and sorts them row-major.
 */
export function detectSpriteFramesAuto(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  minAreaPx: number = 12,
  alphaThreshold: number = 16
): SpriteAtlasFrameRect[] {
  const total = width * height;
  if (total === 0 || rgba.length < total * 4) return [];

  const visited = new Uint8Array(total);
  const rawBoxes: { x: number; y: number; w: number; h: number }[] = [];
  const queueX = new Int32Array(total);
  const queueY = new Int32Array(total);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const startIdx = y * width + x;
      if (visited[startIdx]) continue;
      if (rgba[startIdx * 4 + 3] < alphaThreshold) continue;

      let head = 0;
      let tail = 0;
      queueX[tail] = x;
      queueY[tail] = y;
      tail += 1;
      visited[startIdx] = 1;

      let minX = x;
      let maxX = x;
      let minY = y;
      let maxY = y;
      let area = 0;

      while (head < tail) {
        const cx = queueX[head];
        const cy = queueY[head];
        head += 1;
        area += 1;

        if (cx < minX) minX = cx;
        if (cx > maxX) maxX = cx;
        if (cy < minY) minY = cy;
        if (cy > maxY) maxY = cy;

        // 4-neighbor + 1px diagonal bridge tolerance for floating pixel weapons/sparks
        for (let dy = -1; dy <= 1; dy++) {
          const ny = cy + dy;
          if (ny < 0 || ny >= height) continue;
          for (let dx = -1; dx <= 1; dx++) {
            if (dx === 0 && dy === 0) continue;
            const nx = cx + dx;
            if (nx < 0 || nx >= width) continue;
            const nIdx = ny * width + nx;
            if (visited[nIdx]) continue;
            if (rgba[nIdx * 4 + 3] >= alphaThreshold) {
              visited[nIdx] = 1;
              queueX[tail] = nx;
              queueY[tail] = ny;
              tail += 1;
            }
          }
        }
      }

      const bw = maxX - minX + 1;
      const bh = maxY - minY + 1;
      if (area >= minAreaPx && bw >= 4 && bh >= 4) {
        rawBoxes.push({ x: minX, y: minY, w: bw, h: bh });
      }
    }
  }

  // Row-major sort (group vertically overlapping boxes into rows, then sort left-to-right)
  rawBoxes.sort((a, b) => {
    const aMidY = a.y + a.h * 0.5;
    const bMidY = b.y + b.h * 0.5;
    const rowTol = Math.min(a.h, b.h) * 0.55;
    if (Math.abs(aMidY - bMidY) > rowTol) {
      return a.y - b.y;
    }
    return a.x - b.x;
  });

  return rawBoxes.map((b) => ({
    x: b.x,
    y: b.y,
    w: b.w,
    h: b.h,
    pivotX: 0.5,
    pivotY: 0.92
  }));
}

/**
 * Applies chroma-key transparency onto an offscreen canvas copy of an HTMLImageElement or Canvas.
 */
export function applyChromaKeyToCanvas(
  source: HTMLImageElement | HTMLCanvasElement,
  opts: {
    tolerance?: number;
    keyColor?: [number, number, number];
    force?: boolean;
  } = {}
): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  const w = 'naturalWidth' in source ? source.naturalWidth || source.width : source.width;
  const h = 'naturalHeight' in source ? source.naturalHeight || source.height : source.height;
  if (w <= 0 || h <= 0) return null;

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(source, 0, 0);

  try {
    const imgData = ctx.getImageData(0, 0, w, h);
    const res = applyChromaKeyToPixels(imgData.data, w, h, opts);
    if (res.removedCount > 0) {
      ctx.putImageData(imgData, 0, 0);
    }
  } catch {
    // Tainted cross-origin image fallback: return untouched copy
  }
  return canvas;
}

export interface ResolvedDrawRects {
  srcX: number;
  srcY: number;
  srcW: number;
  srcH: number;
  /** Destination offset relative to world footPos (after translate + horizontal flip) */
  destX: number;
  destY: number;
  destW: number;
  destH: number;
  /** True when an external atlas PNG did not have this state and fell back cleanly to its real IDLE PNG frame */
  synthesizedFromIdle?: boolean;
}

/**
 * Pure frame coordinate & foot-pivot alignment resolver for BOTH variable-bbox atlas sheets
 * and standard/high-res grid sheets. Guarantees feet (`pivotY`) stay rock-steady across frames.
 */
export function resolveFrameSourceAndDestRect(
  entry: SpriteSheetManifestEntry,
  meta: SpriteSheetMetaJson | null,
  animState: SpriteAnimState,
  row: number,
  frameIndex: number,
  sheetFrameWidth: number,
  sheetFrameHeight: number,
  targetDrawScale: number
): ResolvedDrawRects {
  // 1. Variable-bbox Atlas mode (.meta.json)
  if (meta && meta.mode === 'atlas') {
    const exactAnim = meta.animations[animState];
    const hasExact = Boolean(exactAnim && exactAnim.frames.length > 0);
    const anim =
      (hasExact ? exactAnim : null) ??
      meta.animations.IDLE ??
      Object.values(meta.animations).find((a) => a && a.frames.length > 0);
    if (anim && anim.frames.length > 0) {
      const fr = anim.frames[frameIndex % anim.frames.length];
      // Normalize scale relative to logical manifest frameHeight so oversized frames match world scale
      const normScale =
        (entry.frameHeight * targetDrawScale) /
        Math.max(16, meta.frameHeight ?? entry.frameHeight);
      const destW = Math.max(1, Math.round(fr.w * normScale));
      const destH = Math.max(1, Math.round(fr.h * normScale));
      return {
        srcX: fr.x,
        srcY: fr.y,
        srcW: fr.w,
        srcH: fr.h,
        destX: -Math.round(destW * fr.pivotX),
        destY: -Math.round(destH * fr.pivotY),
        destW,
        destH,
        synthesizedFromIdle: !hasExact && animState !== 'IDLE'
      };
    }
  }

  // 2. Standard Grid mode (supports both 32/48/96 external PNGs and 48/64/112 high-res baked sheets)
  const destW = Math.max(1, Math.round(entry.frameWidth * targetDrawScale));
  const destH = Math.max(1, Math.round(entry.frameHeight * targetDrawScale));
  return {
    srcX: frameIndex * sheetFrameWidth,
    srcY: row * sheetFrameHeight,
    srcW: sheetFrameWidth,
    srcH: sheetFrameHeight,
    destX: -Math.round(destW * entry.anchor.x),
    destY: -Math.round(destH * entry.anchor.y),
    destW,
    destH
  };
}

async function defaultBrowserMetaLoader(
  metaSrc: string
): Promise<SpriteSheetMetaJson | null> {
  if (typeof fetch === 'undefined') return null;
  try {
    const url =
      metaSrc.startsWith('/') || metaSrc.startsWith('http')
        ? metaSrc
        : `./${metaSrc}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const ct = res.headers.get('content-type') ?? '';
    if (ct.includes('text/html')) return null;
    const json = (await res.json()) as SpriteSheetMetaJson;
    if (!json || (json.mode !== 'atlas' && json.mode !== 'grid')) return null;
    return json;
  } catch {
    return null;
  }
}

/**
 * SmartSpriteSheetLoader:
 * - Prioritizes external `{unitId}_{formId}.png` + optional `.meta.json` under `public/assets/sprites/`.
 * - Automatically strips solid chroma-key backgrounds from external PNGs via top-left (0,0) sampling.
 * - Supports variable bounding-box atlases with per-frame foot pivots and instant runtime hot-swap
 *   from AssetPreviewScene's Visual Sprite Slicer tab.
 */
export class SmartSpriteSheetLoader {
  private processedExternalCache = new Map<
    string,
    {
      canvas: HTMLImageElement | HTMLCanvasElement;
      meta: SpriteSheetMetaJson | null;
      frameWidth: number;
      frameHeight: number;
    }
  >();
  private metaProbes = new Map<string, Promise<SpriteSheetMetaJson | null>>();
  private runtimeOverrides = new Map<
    string,
    {
      canvas: HTMLCanvasElement;
      meta: SpriteSheetMetaJson;
    }
  >();

  constructor(
    public readonly resolver: ExternalAssetResolver = new ExternalAssetResolver(),
    private readonly metaLoader: ExternalMetaLoaderFn = defaultBrowserMetaLoader
  ) {}

  public static createWithCustomLoaders(
    imageLoader: ExternalImageLoaderFn,
    metaLoader: ExternalMetaLoaderFn = async () => null
  ): SmartSpriteSheetLoader {
    return new SmartSpriteSheetLoader(
      new ExternalAssetResolver(imageLoader),
      metaLoader
    );
  }

  /**
   * Hot-swaps a sliced sprite sheet directly into the live game runtime (used by AssetPreviewScene Slicer).
   */
  public registerRuntimeOverride(
    key: string,
    canvas: HTMLCanvasElement,
    meta: SpriteSheetMetaJson
  ): void {
    this.runtimeOverrides.set(key, { canvas, meta });
  }

  public clearRuntimeOverride(key: string): void {
    this.runtimeOverrides.delete(key);
  }

  public getMetaForKey(key: string): SpriteSheetMetaJson | null {
    const ov = this.runtimeOverrides.get(key);
    if (ov) return ov.meta;
    return this.processedExternalCache.get(key)?.meta ?? null;
  }

  private getMetaSrc(pngSrc: string): string {
    return pngSrc.replace(/\.png$/i, '.meta.json');
  }

  private inferGridFrameSize(
    img: HTMLImageElement | HTMLCanvasElement,
    entry: SpriteSheetManifestEntry,
    meta: SpriteSheetMetaJson | null
  ): { w: number; h: number } {
    if (meta?.frameWidth && meta?.frameHeight) {
      return { w: meta.frameWidth, h: meta.frameHeight };
    }
    const iw = 'naturalWidth' in img ? img.naturalWidth || img.width : img.width;
    const ih = 'naturalHeight' in img ? img.naturalHeight || img.height : img.height;
    if (iw > 0 && ih > 0 && iw % 6 === 0 && ih % 11 === 0) {
      return { w: Math.floor(iw / 6), h: Math.floor(ih / 11) };
    }
    return { w: entry.frameWidth, h: entry.frameHeight };
  }

  /**
   * Synchronous fast-path for 60FPS render loop.
   */
  public resolveSyncOrBake(
    entry: SpriteSheetManifestEntry,
    bakeFallback: () => HTMLCanvasElement | null
  ): SmartResolvedSpriteSheet {
    const override = this.runtimeOverrides.get(entry.key);
    if (override) {
      return {
        entry,
        sheet: override.canvas,
        source: 'EXTERNAL_PNG',
        sheetFrameWidth: override.meta.frameWidth ?? entry.frameWidth,
        sheetFrameHeight: override.meta.frameHeight ?? entry.frameHeight,
        meta: override.meta
      };
    }

    const processed = this.processedExternalCache.get(entry.key);
    if (processed) {
      return {
        entry,
        sheet: processed.canvas,
        source: 'EXTERNAL_PNG',
        sheetFrameWidth: processed.frameWidth,
        sheetFrameHeight: processed.frameHeight,
        meta: processed.meta
      };
    }

    const resolved = this.resolver.resolveImageSyncOrBake(
      entry.key,
      entry.src,
      bakeFallback
    );

    if (resolved.source === 'EXTERNAL_PNG' && resolved.image) {
      // Trigger non-blocking meta fetch once; once settled, processedExternalCache serves keyed sheet + meta cleanly
      if (!this.metaProbes.has(entry.key)) {
        const metaProbe = this.metaLoader(this.getMetaSrc(entry.src))
          .then((meta) => {
            const keyed =
              meta?.chromaKey?.enabled === false
                ? resolved.image!
                : applyChromaKeyToCanvas(resolved.image!, {
                    tolerance: meta?.chromaKey?.tolerance ?? 24,
                    keyColor: meta?.chromaKey?.color
                  }) ?? resolved.image!;
            const dims = this.inferGridFrameSize(keyed, entry, meta);
            this.processedExternalCache.set(entry.key, {
              canvas: keyed,
              meta,
              frameWidth: dims.w,
              frameHeight: dims.h
            });
            return meta;
          })
          .catch(() => {
            const dims = this.inferGridFrameSize(resolved.image!, entry, null);
            this.processedExternalCache.set(entry.key, {
              canvas: resolved.image!,
              meta: null,
              frameWidth: dims.w,
              frameHeight: dims.h
            });
            return null;
          });
        this.metaProbes.set(entry.key, metaProbe);
      }

      // While .meta.json fetch is in flight (<10ms), infer clean square cell size from height if horizontal strip
      const iw =
        'naturalWidth' in resolved.image
          ? resolved.image.naturalWidth || resolved.image.width
          : resolved.image.width;
      const ih =
        'naturalHeight' in resolved.image
          ? resolved.image.naturalHeight || resolved.image.height
          : resolved.image.height;
      const isHorizontalStrip = ih > 0 && iw >= ih && iw % ih === 0;
      const dims = isHorizontalStrip
        ? { w: ih, h: ih }
        : this.inferGridFrameSize(resolved.image, entry, null);
      return {
        entry,
        sheet: resolved.image,
        source: 'EXTERNAL_PNG',
        sheetFrameWidth: dims.w,
        sheetFrameHeight: dims.h,
        meta: isHorizontalStrip
          ? {
              version: '1.0.0',
              mode: 'atlas',
              frameWidth: ih,
              frameHeight: ih,
              animations: {
                IDLE: {
                  fps: 5,
                  loop: true,
                  frames: [{ x: 0, y: 0, w: ih, h: ih, pivotX: 0.5, pivotY: 0.94 }]
                }
              }
            }
          : null
      };
    }

    const bakedSize = resolveBakedFrameSize(entry.frameWidth);
    return {
      entry,
      sheet: resolved.image,
      source: 'BAKED_FALLBACK',
      sheetFrameWidth: bakedSize,
      sheetFrameHeight: bakedSize,
      meta: null
    };
  }

  /**
   * Async resolver used in tests, preloaders, and AssetPreviewScene.
   */
  public async resolveAsync(
    entry: SpriteSheetManifestEntry,
    bakeFallback: () => HTMLCanvasElement | null
  ): Promise<SmartResolvedSpriteSheet> {
    const override = this.runtimeOverrides.get(entry.key);
    if (override) {
      return {
        entry,
        sheet: override.canvas,
        source: 'EXTERNAL_PNG',
        sheetFrameWidth: override.meta.frameWidth ?? entry.frameWidth,
        sheetFrameHeight: override.meta.frameHeight ?? entry.frameHeight,
        meta: override.meta
      };
    }

    const res = await this.resolver.resolveImageAsync(
      entry.key,
      entry.src,
      bakeFallback
    );

    if (res.source === 'EXTERNAL_PNG' && res.image) {
      const meta = await this.metaLoader(this.getMetaSrc(entry.src));
      const keyed =
        meta?.chromaKey?.enabled === false
          ? res.image
          : applyChromaKeyToCanvas(res.image, {
              tolerance: meta?.chromaKey?.tolerance ?? 24,
              keyColor: meta?.chromaKey?.color
            }) ?? res.image;
      const dims = this.inferGridFrameSize(keyed, entry, meta);
      this.processedExternalCache.set(entry.key, {
        canvas: keyed,
        meta,
        frameWidth: dims.w,
        frameHeight: dims.h
      });
      return {
        entry,
        sheet: keyed,
        source: 'EXTERNAL_PNG',
        sheetFrameWidth: dims.w,
        sheetFrameHeight: dims.h,
        meta
      };
    }

    const bakedSize = resolveBakedFrameSize(entry.frameWidth);
    return {
      entry,
      sheet: res.image,
      source: 'BAKED_FALLBACK',
      sheetFrameWidth: bakedSize,
      sheetFrameHeight: bakedSize,
      meta: null
    };
  }
}
