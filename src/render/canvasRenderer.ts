import { LOGICAL_HEIGHT, LOGICAL_WIDTH } from '../core/constants';
import type { Vec2 } from '../core/math/vector2';
import type { Disposable } from '../core/types/disposable';
import { releaseOffscreenCanvas } from './canvasGpuDispose';
import {
  ResponsiveViewportManager,
  type ViewportMetrics
} from './viewport/responsiveViewportManager';

export interface RenderAccessibilitySettings {
  flashEffectEnabled: boolean;
  shakeIntensity: number; // 0.0 ~ 1.0
  showFps: boolean;
}

export class CanvasRenderer implements Disposable {
  public readonly canvas: HTMLCanvasElement;
  public readonly ctx: CanvasRenderingContext2D;
  public readonly viewport: ResponsiveViewportManager;
  public settings: RenderAccessibilitySettings = {
    flashEffectEnabled: true,
    shakeIntensity: 0.8,
    showFps: true
  };

  constructor(container: HTMLElement) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = LOGICAL_WIDTH;
    this.canvas.height = LOGICAL_HEIGHT;
    this.canvas.style.imageRendering = 'pixelated';
    this.canvas.style.display = 'block';
    this.canvas.style.position = 'relative';
    this.canvas.style.zIndex = '2';
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    this.canvas.style.background = '#090d16';
    this.canvas.style.touchAction = 'none';
    this.canvas.style.userSelect = 'none';

    const ctx = this.canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Canvas 2D context is not available');
    }
    ctx.imageSmoothingEnabled = false;
    this.ctx = ctx;

    container.appendChild(this.canvas);
    this.viewport = new ResponsiveViewportManager(this.canvas, this.ctx, container);
  }

  public getMetrics(): ViewportMetrics {
    return this.viewport.getMetrics();
  }

  public setBackgroundTransparent(transparent: boolean): void {
    this.canvas.style.background = transparent ? 'transparent' : '#090d16';
  }

  public beginFrame(): ViewportMetrics {
    return this.viewport.beginFrame();
  }

  public syncViewport(): ViewportMetrics {
    return this.viewport.sync();
  }

  public clientToLogical(clientX: number, clientY: number): Vec2 {
    return this.viewport.clientToLogical(clientX, clientY);
  }

  public clientToArenaLogical(clientX: number, clientY: number): Vec2 {
    return this.viewport.clientToArenaLogical(clientX, clientY);
  }

  public dispose(): void {
    this.viewport.dispose();
    releaseOffscreenCanvas(this.canvas);
    this.canvas.remove?.();
  }
}
