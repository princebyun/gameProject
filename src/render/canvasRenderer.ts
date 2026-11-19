import { LOGICAL_HEIGHT, LOGICAL_WIDTH } from '../core/constants';
import type { Vec2 } from '../core/math/vector2';

export interface RenderAccessibilitySettings {
  flashEffectEnabled: boolean;
  shakeIntensity: number; // 0.0 ~ 1.0
  showFps: boolean;
}

export class CanvasRenderer {
  public readonly canvas: HTMLCanvasElement;
  public readonly ctx: CanvasRenderingContext2D;
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
  }

  public clientToLogical(clientX: number, clientY: number): Vec2 {
    const rect = this.canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) {
      return { x: 0, y: 0 };
    }
    return {
      x: ((clientX - rect.left) / rect.width) * LOGICAL_WIDTH,
      y: ((clientY - rect.top) / rect.height) * LOGICAL_HEIGHT
    };
  }
}
