import type { Disposable } from '../../core/types/disposable';
import type { ViewportMetrics } from '../viewport/responsiveViewportManager';

export type TimeOfDayPreset = 'MORNING' | 'DAY' | 'SUNSET' | 'NIGHT';

export type RenderQualityPreset = 'HIGH' | 'MEDIUM' | 'LOW';

export interface VisualPolishConfig {
  timeOfDay: TimeOfDayPreset;
  quality: RenderQualityPreset;
  dynamicLighting: boolean;
  selectiveBloom: boolean;
  waterReflection: boolean;
  godRaysAndParticles: boolean;
  colorGrading: boolean;
  flashEffectEnabled: boolean;
  shakeIntensity: number;
}

export const DEFAULT_VISUAL_POLISH_CONFIG: VisualPolishConfig = {
  timeOfDay: 'DAY',
  quality: 'HIGH',
  dynamicLighting: true,
  selectiveBloom: true,
  waterReflection: true,
  godRaysAndParticles: true,
  colorGrading: true,
  flashEffectEnabled: true,
  shakeIntensity: 0.8
};

export type ActiveRenderBackendKind = 'PIXI_WEBGL2' | 'CANVAS_2D_FALLBACK';

export interface RenderTelemetrySnapshot {
  backend: ActiveRenderBackendKind;
  isWebGL2: boolean;
  fps: number;
  frameMs: number;
  drawCallsEstimate: number;
  textureCount: number;
  renderTextureCount: number;
  resolution: number;
  viewWidth: number;
  viewHeight: number;
  activeSceneTag: string;
}

export interface IRenderBackend extends Disposable {
  readonly isWebGLActive: boolean;
  readonly isWebGL2: boolean;
  init(container: HTMLElement, metrics: ViewportMetrics): Promise<boolean>;
  resize(metrics: ViewportMetrics): void;
  setVisible(visible: boolean): void;
  getPolishConfig(): VisualPolishConfig;
  updatePolishConfig(patch: Partial<VisualPolishConfig>): void;
  getTelemetry(): RenderTelemetrySnapshot;
  releaseActiveScene(): void;
}
