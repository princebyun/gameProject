import { LOGICAL_HEIGHT, LOGICAL_WIDTH } from '../../core/constants';
import { clamp, type Vec2 } from '../../core/math/vector2';
import type { Disposable } from '../../core/types/disposable';
import {
  computeSafeRect,
  convertCssInsetsToLogical,
  SafeAreaLayout,
  ZERO_SAFE_INSETS,
  type SafeAreaInsets,
  type SafeRect
} from './safeAreaLayout';

export const MIN_VIEW_WIDTH = LOGICAL_WIDTH; // 960 (16:9 baseline)
export const MAX_VIEW_WIDTH = 1260; // Ultra-wide upper clamp (~21:9)
export const FIXED_VIEW_HEIGHT = LOGICAL_HEIGHT; // 540
export const MAX_RENDER_DPR = 3;

export interface ViewportMetrics {
  viewWidth: number;
  viewHeight: number;
  aspect: number;
  dpr: number;
  bufferWidth: number;
  bufferHeight: number;
  cssWidth: number;
  cssHeight: number;
  arenaWidth: number;
  arenaHeight: number;
  /** Horizontal offset (in logical px) to center the deterministic 960x540 core arena inside viewWidth. */
  arenaOffsetX: number;
  safeInsets: SafeAreaInsets;
  safeRect: SafeRect;
}

export function computeResponsiveViewport(
  cssWidth: number,
  cssHeight: number,
  devicePixelRatio = 1,
  cssSafeInsets: SafeAreaInsets = ZERO_SAFE_INSETS
): ViewportMetrics {
  const safeCssW = Math.max(1, cssWidth);
  const safeCssH = Math.max(1, cssHeight);
  const aspect = safeCssW / safeCssH;
  const viewHeight = FIXED_VIEW_HEIGHT;
  const viewWidth = clamp(
    Math.round(viewHeight * aspect),
    MIN_VIEW_WIDTH,
    MAX_VIEW_WIDTH
  );
  const dpr = clamp(devicePixelRatio || 1, 1, MAX_RENDER_DPR);
  const bufferWidth = Math.round(viewWidth * dpr);
  const bufferHeight = Math.round(viewHeight * dpr);
  const arenaOffsetX = Math.round((viewWidth - LOGICAL_WIDTH) * 0.5);

  const safeInsets = convertCssInsetsToLogical(
    cssSafeInsets,
    safeCssW,
    safeCssH,
    viewWidth,
    viewHeight
  );
  const safeRect = computeSafeRect(viewWidth, viewHeight, safeInsets, 0);

  return {
    viewWidth,
    viewHeight,
    aspect,
    dpr,
    bufferWidth,
    bufferHeight,
    cssWidth: safeCssW,
    cssHeight: safeCssH,
    arenaWidth: LOGICAL_WIDTH,
    arenaHeight: LOGICAL_HEIGHT,
    arenaOffsetX,
    safeInsets,
    safeRect
  };
}

export const DEFAULT_VIEWPORT_METRICS: ViewportMetrics = computeResponsiveViewport(
  LOGICAL_WIDTH,
  LOGICAL_HEIGHT,
  1,
  ZERO_SAFE_INSETS
);

/**
 * Manages fixed-height (540px) + dynamic-width (960..1260px) Edge-to-Edge canvas sizing
 * with crisp DPR pixel buffers and Safe Area inset tracking.
 */
export class ResponsiveViewportManager implements Disposable {
  public readonly safeArea = new SafeAreaLayout();
  private metrics: ViewportMetrics = { ...DEFAULT_VIEWPORT_METRICS };
  private listeners = new Set<(m: ViewportMetrics) => void>();
  private abortController: AbortController | null = null;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly ctx: CanvasRenderingContext2D,
    private readonly container: HTMLElement
  ) {
    this.sync();
    this.attachListeners();
  }

  public getMetrics(): ViewportMetrics {
    return this.metrics;
  }

  public onChange(cb: (m: ViewportMetrics) => void): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  public setSimulatedSafeInsets(insets: SafeAreaInsets | null): void {
    this.safeArea.setSimulatedSafeInsets(insets);
    this.sync();
  }

  public sync(): ViewportMetrics {
    const rect = this.container.getBoundingClientRect();
    const cssW =
      rect.width > 10
        ? rect.width
        : typeof window !== 'undefined'
          ? window.innerWidth
          : LOGICAL_WIDTH;
    const cssH =
      rect.height > 10
        ? rect.height
        : typeof window !== 'undefined'
          ? window.innerHeight
          : LOGICAL_HEIGHT;
    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    const cssSafeInsets = this.safeArea.readCssSafeInsets();

    const next = computeResponsiveViewport(cssW, cssH, dpr, cssSafeInsets);
    const sizeChanged =
      this.canvas.width !== next.bufferWidth ||
      this.canvas.height !== next.bufferHeight;

    if (sizeChanged) {
      this.canvas.width = next.bufferWidth;
      this.canvas.height = next.bufferHeight;
    }

    this.ctx.setTransform(next.dpr, 0, 0, next.dpr, 0, 0);
    this.ctx.imageSmoothingEnabled = false;

    const changed =
      sizeChanged ||
      next.viewWidth !== this.metrics.viewWidth ||
      next.safeInsets.left !== this.metrics.safeInsets.left ||
      next.safeInsets.right !== this.metrics.safeInsets.right ||
      next.safeInsets.top !== this.metrics.safeInsets.top ||
      next.safeInsets.bottom !== this.metrics.safeInsets.bottom;

    this.metrics = next;

    if (changed) {
      for (const cb of this.listeners) {
        cb(next);
      }
    }
    return next;
  }

  public beginFrame(): ViewportMetrics {
    this.ctx.setTransform(this.metrics.dpr, 0, 0, this.metrics.dpr, 0, 0);
    this.ctx.imageSmoothingEnabled = false;
    return this.metrics;
  }

  public clientToLogical(clientX: number, clientY: number): Vec2 {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      return { x: 0, y: 0 };
    }
    return {
      x: ((clientX - rect.left) / rect.width) * this.metrics.viewWidth,
      y: ((clientY - rect.top) / rect.height) * this.metrics.viewHeight
    };
  }

  /**
   * Converts client pointer coordinates to the deterministic 960x540 core arena space.
   */
  public clientToArenaLogical(clientX: number, clientY: number): Vec2 {
    const p = this.clientToLogical(clientX, clientY);
    return {
      x: p.x - this.metrics.arenaOffsetX,
      y: p.y
    };
  }

  private attachListeners(): void {
    if (typeof window === 'undefined') return;
    this.abortController?.abort();
    this.abortController = new AbortController();
    const { signal } = this.abortController;
    const onResize = () => {
      this.sync();
    };
    window.addEventListener('resize', onResize, { passive: true, signal });
    window.addEventListener('orientationchange', onResize, {
      passive: true,
      signal
    });
    window.visualViewport?.addEventListener('resize', onResize, {
      passive: true,
      signal
    });
  }

  public destroy(): void {
    this.abortController?.abort();
    this.abortController = null;
    this.safeArea.destroy();
    this.listeners.clear();
  }

  public dispose(): void {
    this.destroy();
  }
}
