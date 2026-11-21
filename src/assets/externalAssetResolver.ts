import type { AssetSourceKind } from '../data/assets/types';

export interface ResolvedImageAsset {
  key: string;
  src: string;
  source: 'EXTERNAL_PNG' | 'BAKED_FALLBACK';
  image: HTMLImageElement | HTMLCanvasElement | null;
}

export interface ResolvedAudioAsset {
  key: string;
  src: string;
  source: 'EXTERNAL_OGG' | 'CHIPTUNE_FALLBACK';
  buffer: AudioBuffer | null;
}

export type ExternalImageLoaderFn = (
  src: string
) => Promise<HTMLImageElement | HTMLCanvasElement | null>;

/**
 * Step 2: Verifies that an external sprite sheet PNG is an authentic multi-frame sprite sheet
 * (at least `minHorizontalFrames` frames wide, default >= 4) and NOT a single stationary image.
 * Single stationary images are strictly treated as design references and rejected from direct rendering.
 */
export function isValidMultiFrameSpriteSheet(
  img: HTMLImageElement | HTMLCanvasElement | null,
  frameWidth = 32,
  minHorizontalFrames = 4
): boolean {
  if (!img) return false;
  const w =
    'naturalWidth' in img && img.naturalWidth > 0
      ? img.naturalWidth
      : img.width;
  return w >= Math.max(16, frameWidth) * minHorizontalFrames;
}

export type ExternalAudioLoaderFn = (
  src: string,
  ctx: AudioContext | null
) => Promise<AudioBuffer | null>;

function defaultBrowserImageLoader(
  src: string
): Promise<HTMLImageElement | null> {
  if (typeof Image === 'undefined' || typeof window === 'undefined') {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (img.naturalWidth > 0 && img.naturalHeight > 0) {
        resolve(img);
      } else {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = src.startsWith('/') || src.startsWith('http') ? src : `./${src}`;
  });
}

async function defaultBrowserAudioLoader(
  src: string,
  ctx: AudioContext | null
): Promise<AudioBuffer | null> {
  if (!ctx || typeof fetch === 'undefined') {
    return null;
  }
  try {
    const url = src.startsWith('/') || src.startsWith('http') ? src : `./${src}`;
    const res = await fetch(url);
    if (!res.ok) return null;
    const contentType = res.headers.get('content-type') ?? '';
    // Avoid attempting to decode Vite SPA fallback HTML as audio
    if (contentType.includes('text/html')) return null;
    const arr = await res.arrayBuffer();
    if (arr.byteLength < 64) return null;
    return await ctx.decodeAudioData(arr);
  } catch {
    return null;
  }
}

/**
 * Hot-Swap External Asset Resolver:
 * Prioritizes external files under public/assets/ (.png / .ogg) and falls back cleanly
 * to baked offscreen pixel sheets or chiptune synth when the external file does not exist.
 */
export class ExternalAssetResolver {
  private imageCache = new Map<string, ResolvedImageAsset>();
  private pendingImageProbes = new Map<string, Promise<ResolvedImageAsset>>();
  private audioCache = new Map<string, ResolvedAudioAsset>();
  private pendingAudioProbes = new Map<string, Promise<ResolvedAudioAsset>>();
  private sourceStatusMap = new Map<string, AssetSourceKind>();

  constructor(
    private readonly imageLoader: ExternalImageLoaderFn = defaultBrowserImageLoader,
    private readonly audioLoader: ExternalAudioLoaderFn = defaultBrowserAudioLoader
  ) {}

  public getSourceStatus(key: string): AssetSourceKind | undefined {
    return this.sourceStatusMap.get(key);
  }

  public getAllSourceStatuses(): Record<string, AssetSourceKind> {
    return Object.fromEntries(this.sourceStatusMap.entries());
  }

  public getCachedImageSync(key: string): ResolvedImageAsset | undefined {
    return this.imageCache.get(key);
  }

  /**
   * Synchronous fast-path for 60FPS render loop:
   * - Returns external PNG immediately if already loaded.
   * - Otherwise triggers non-blocking external probe in the background and returns baked fallback immediately.
   */
  public resolveImageSyncOrBake(
    key: string,
    src: string,
    bakeFallback: () => HTMLCanvasElement | null,
    options?: {
      minHorizontalFrames?: number;
      frameWidth?: number;
    }
  ): ResolvedImageAsset {
    const cached = this.imageCache.get(key);
    if (cached) {
      return cached;
    }

    const baked = bakeFallback();
    const initial: ResolvedImageAsset = {
      key,
      src,
      source: 'BAKED_FALLBACK',
      image: baked
    };
    this.imageCache.set(key, initial);
    this.sourceStatusMap.set(key, 'BAKED_FALLBACK');

    const minFrames =
      options?.minHorizontalFrames ??
      (src.includes('assets/sprites/') ? 4 : 1);
    const frameW = options?.frameWidth ?? 32;

    // Non-blocking hot-swap check for external multi-frame PNG under public/assets/
    if (!this.pendingImageProbes.has(key)) {
      const probe = this.imageLoader(src)
        .then((extImg) => {
          if (
            extImg &&
            (minFrames <= 1 ||
              isValidMultiFrameSpriteSheet(extImg, frameW, minFrames))
          ) {
            const upgraded: ResolvedImageAsset = {
              key,
              src,
              source: 'EXTERNAL_PNG',
              image: extImg
            };
            this.imageCache.set(key, upgraded);
            this.sourceStatusMap.set(key, 'EXTERNAL_PNG');
            return upgraded;
          }
          return initial;
        })
        .catch(() => initial);
      this.pendingImageProbes.set(key, probe);
    }

    return initial;
  }

  /**
   * Async resolution used by tests, preloaders, and AssetPreviewScene:
   * Checks external PNG first; if it is a valid multi-frame sheet (frames >= 4 for sprites),
   * overrides with EXTERNAL_PNG; otherwise uses baked fallback.
   */
  public async resolveImageAsync(
    key: string,
    src: string,
    bakeFallback: () => HTMLCanvasElement | null,
    options?: {
      minHorizontalFrames?: number;
      frameWidth?: number;
    }
  ): Promise<ResolvedImageAsset> {
    const existing = this.imageCache.get(key);
    if (existing && existing.source === 'EXTERNAL_PNG') {
      return existing;
    }
    const pending = this.pendingImageProbes.get(key);
    if (pending) {
      return await pending;
    }

    const minFrames =
      options?.minHorizontalFrames ??
      (src.includes('assets/sprites/') ? 4 : 1);
    const frameW = options?.frameWidth ?? 32;

    const promise = (async (): Promise<ResolvedImageAsset> => {
      const extImg = await this.imageLoader(src);
      if (
        extImg &&
        (minFrames <= 1 ||
          isValidMultiFrameSpriteSheet(extImg, frameW, minFrames))
      ) {
        const res: ResolvedImageAsset = {
          key,
          src,
          source: 'EXTERNAL_PNG',
          image: extImg
        };
        this.imageCache.set(key, res);
        this.sourceStatusMap.set(key, 'EXTERNAL_PNG');
        return res;
      }
      const fallback: ResolvedImageAsset = {
        key,
        src,
        source: 'BAKED_FALLBACK',
        image: bakeFallback()
      };
      this.imageCache.set(key, fallback);
      this.sourceStatusMap.set(key, 'BAKED_FALLBACK');
      return fallback;
    })();

    this.pendingImageProbes.set(key, promise);
    return await promise;
  }

  public async resolveAudioAsync(
    key: string,
    src: string,
    ctx: AudioContext | null
  ): Promise<ResolvedAudioAsset> {
    const existing = this.audioCache.get(key);
    if (existing) return existing;

    const pending = this.pendingAudioProbes.get(key);
    if (pending) return await pending;

    const promise = (async (): Promise<ResolvedAudioAsset> => {
      const buffer = await this.audioLoader(src, ctx);
      if (buffer) {
        const res: ResolvedAudioAsset = {
          key,
          src,
          source: 'EXTERNAL_OGG',
          buffer
        };
        this.audioCache.set(key, res);
        this.sourceStatusMap.set(key, 'EXTERNAL_OGG');
        return res;
      }
      const fallback: ResolvedAudioAsset = {
        key,
        src,
        source: 'CHIPTUNE_FALLBACK',
        buffer: null
      };
      this.audioCache.set(key, fallback);
      this.sourceStatusMap.set(key, 'CHIPTUNE_FALLBACK');
      return fallback;
    })();

    this.pendingAudioProbes.set(key, promise);
    return await promise;
  }

  public clearCache(): void {
    this.imageCache.clear();
    this.pendingImageProbes.clear();
    this.audioCache.clear();
    this.pendingAudioProbes.clear();
    this.sourceStatusMap.clear();
  }
}
