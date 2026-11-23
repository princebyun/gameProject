import {
  Application,
  Container,
  RenderTexture,
  TextureStyle,
  type Renderer
} from 'pixi.js';
import {
  DEFAULT_VISUAL_POLISH_CONFIG,
  type IRenderBackend,
  type RenderTelemetrySnapshot,
  type VisualPolishConfig
} from '../backend/renderBackend';
import {
  DEFAULT_VIEWPORT_METRICS,
  type ViewportMetrics
} from '../viewport/responsiveViewportManager';
import { PixiAssetBundleManager } from './PixiAssetBundleManager';
import { PixiBundleLoadingOverlay } from './PixiBundleLoadingOverlay';
import { ProAssetLoader } from './ProAssetLoader';

// Enforce crisp nearest-neighbor pixel sampling globally on PixiJS v8 boot
TextureStyle.defaultOptions.scaleMode = 'nearest';

interface RendererInspector {
  type?: number;
  gl?: WebGLRenderingContext | WebGL2RenderingContext;
  texture?: {
    managedTextures?: ReadonlyArray<unknown>;
  };
}

interface GlobalWithPixiHost {
  __OPGV_PIXI_HOST__?: PixiStageHost;
}

export class PixiStageHost implements IRenderBackend {
  public readonly loader: ProAssetLoader;
  public readonly bundleManager: PixiAssetBundleManager;
  public readonly worldRoot: Container = new Container();

  private app: Application | null = null;
  private loadingOverlay: PixiBundleLoadingOverlay | null = null;
  private webglActive = false;
  private webgl2Active = false;
  private visible = false;
  private metrics: ViewportMetrics = { ...DEFAULT_VIEWPORT_METRICS };
  private polish: VisualPolishConfig = { ...DEFAULT_VISUAL_POLISH_CONFIG };
  private readonly trackedRenderTextures = new Set<RenderTexture>();
  private resolution = 1;
  private lastFrameMs = 0;
  private currentFps = 60;
  private drawCallsEstimate = 0;
  private activeSceneTag = 'NONE';
  private disposed = false;

  constructor(loader?: ProAssetLoader, bundleManager?: PixiAssetBundleManager) {
    this.loader = loader ?? new ProAssetLoader();
    this.bundleManager = bundleManager ?? new PixiAssetBundleManager(this.loader);
    this.worldRoot.label = 'opgv_world_root';
    this.worldRoot.sortableChildren = false;
  }

  public get isWebGLActive(): boolean {
    return this.webglActive;
  }

  public get isWebGL2(): boolean {
    return this.webgl2Active;
  }

  public get renderer(): Renderer | null {
    return this.app ? this.app.renderer : null;
  }

  public get canvas(): HTMLCanvasElement | null {
    return this.app ? (this.app.canvas as HTMLCanvasElement) : null;
  }

  public get trackedRenderTextureCount(): number {
    return this.trackedRenderTextures.size;
  }

  public async init(
    container: HTMLElement,
    metrics: ViewportMetrics
  ): Promise<boolean> {
    if (this.disposed) return false;
    this.metrics = { ...metrics };
    TextureStyle.defaultOptions.scaleMode = 'nearest';

    if (typeof window === 'undefined' || typeof document === 'undefined') {
      return false;
    }

    const testCanvas = document.createElement('canvas');
    const hasGl =
      Boolean(testCanvas.getContext('webgl2')) ||
      Boolean(testCanvas.getContext('webgl'));
    testCanvas.width = 0;
    testCanvas.height = 0;
    if (!hasGl) {
      this.webglActive = false;
      this.webgl2Active = false;
      return false;
    }

    try {
      const app = new Application();
      const dpr = window.devicePixelRatio || 1;
      this.resolution = Math.min(Math.max(1, dpr), 2);

      await app.init({
        preference: 'webgl',
        antialias: false,
        roundPixels: true,
        resolution: this.resolution,
        autoDensity: true,
        autoStart: false,
        powerPreference: 'high-performance',
        backgroundColor: 0x090d16,
        width: Math.max(1, metrics.viewWidth),
        height: Math.max(1, metrics.viewHeight)
      });

      if (this.disposed) {
        app.destroy({ removeView: true }, { children: true, texture: true, textureSource: true, context: true });
        return false;
      }

      const canvas = app.canvas as HTMLCanvasElement;
      canvas.id = 'opgv-pixi-webgl2-canvas';
      canvas.style.position = 'absolute';
      canvas.style.inset = '0';
      canvas.style.width = '100%';
      canvas.style.height = '100%';
      canvas.style.display = 'none';
      canvas.style.zIndex = '1';
      canvas.style.pointerEvents = 'none';
      canvas.style.imageRendering = 'pixelated';

      container.prepend(canvas);
      app.stage.addChild(this.worldRoot);

      this.app = app;
      this.webglActive = true;
      const insp = app.renderer as unknown as RendererInspector;
      const gl = insp.gl;
      this.webgl2Active =
        typeof WebGL2RenderingContext !== 'undefined' &&
        gl instanceof WebGL2RenderingContext;

      (window as unknown as GlobalWithPixiHost).__OPGV_PIXI_HOST__ = this;
      this.loadingOverlay = new PixiBundleLoadingOverlay(container);
      this.bundleManager.attachLoadingOverlay(this.loadingOverlay);
      await this.bundleManager.init(this.loader.manifest);
      return true;
    } catch {
      this.webglActive = false;
      this.webgl2Active = false;
      this.app = null;
      return false;
    }
  }

  public resize(metrics: ViewportMetrics): void {
    this.metrics = { ...metrics };
    if (this.app && !this.disposed) {
      this.app.renderer.resize(
        Math.max(1, metrics.viewWidth),
        Math.max(1, metrics.viewHeight)
      );
    }
  }

  public setVisible(visible: boolean): void {
    this.visible = visible && this.webglActive;
    if (this.app) {
      const canvas = this.app.canvas as HTMLCanvasElement;
      canvas.style.display = this.visible ? 'block' : 'none';
    }
  }

  public isVisible(): boolean {
    return this.visible;
  }

  public getPolishConfig(): VisualPolishConfig {
    return { ...this.polish };
  }

  public updatePolishConfig(patch: Partial<VisualPolishConfig>): void {
    this.polish = {
      ...this.polish,
      ...patch
    };
  }

  public setSceneTelemetryTag(tag: string, drawCallsEstimate: number): void {
    this.activeSceneTag = tag;
    this.drawCallsEstimate = Math.max(0, Math.round(drawCallsEstimate));
  }

  public updateFpsSample(fps: number): void {
    this.currentFps = Math.max(1, Math.round(fps));
  }

  public createTrackedRenderTexture(
    width: number,
    height: number,
    scaleMode: 'nearest' | 'linear' = 'linear',
    label?: string
  ): RenderTexture {
    const rt = RenderTexture.create({
      width: Math.max(1, Math.round(width)),
      height: Math.max(1, Math.round(height)),
      resolution: 1,
      scaleMode,
      dynamic: true,
      ...(label ? { label } : {})
    });
    this.trackedRenderTextures.add(rt);
    return rt;
  }

  public destroyTrackedRenderTexture(rt: RenderTexture | null | undefined): void {
    if (!rt) return;
    this.trackedRenderTextures.delete(rt);
    if (!rt.destroyed) {
      rt.destroy(true);
    }
  }

  public destroyAllTrackedRenderTextures(): void {
    for (const rt of Array.from(this.trackedRenderTextures)) {
      if (!rt.destroyed) {
        rt.destroy(true);
      }
    }
    this.trackedRenderTextures.clear();
  }

  public renderNow(): void {
    if (!this.app || !this.webglActive || !this.visible || this.disposed) return;
    const t0 = typeof performance !== 'undefined' ? performance.now() : 0;
    this.app.render();
    if (typeof performance !== 'undefined') {
      this.lastFrameMs = Math.max(0.1, performance.now() - t0);
    }
  }

  public renderContainerToTarget(container: Container, target: RenderTexture): void {
    if (!this.app || !this.webglActive || this.disposed) return;
    this.app.renderer.render({
      container,
      target,
      clear: true
    });
  }

  public releaseActiveScene(): void {
    const children = [...this.worldRoot.children];
    for (const child of children) {
      this.worldRoot.removeChild(child);
      child.destroy({ children: true, texture: false });
    }
    this.destroyAllTrackedRenderTextures();
    this.loader.releaseTransientSubTextures();
    this.activeSceneTag = 'NONE';
    this.drawCallsEstimate = 0;
  }

  public getTelemetry(): RenderTelemetrySnapshot {
    const insp = (this.app?.renderer ?? null) as unknown as RendererInspector | null;
    const gpuTextureCount = insp?.texture?.managedTextures?.length ?? 0;
    return {
      backend: this.webglActive ? 'PIXI_WEBGL2' : 'CANVAS_2D_FALLBACK',
      isWebGL2: this.webgl2Active,
      fps: this.currentFps,
      frameMs: Number(this.lastFrameMs.toFixed(2)),
      drawCallsEstimate: this.drawCallsEstimate,
      textureCount: Math.max(gpuTextureCount, this.loader.getLoadedTextureCount()),
      renderTextureCount: this.trackedRenderTextures.size,
      resolution: this.resolution,
      viewWidth: this.metrics.viewWidth,
      viewHeight: this.metrics.viewHeight,
      activeSceneTag: this.activeSceneTag
    };
  }

  public dispose(): void {
    if (this.disposed) return;
    this.releaseActiveScene();
    this.disposed = true;
    this.webglActive = false;
    this.webgl2Active = false;
    this.visible = false;
    this.bundleManager.dispose();
    this.loadingOverlay?.dispose();
    this.loadingOverlay = null;
    this.loader.dispose();

    if (this.app) {
      this.app.destroy(
        { removeView: true },
        {
          children: true,
          texture: true,
          textureSource: true,
          context: true
        }
      );
      this.app = null;
    }

    if (typeof window !== 'undefined') {
      const g = window as unknown as GlobalWithPixiHost;
      if (g.__OPGV_PIXI_HOST__ === this) {
        delete g.__OPGV_PIXI_HOST__;
      }
    }
  }
}
