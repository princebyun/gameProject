import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { computeResponsiveViewport, type ViewportMetrics } from '../viewport/responsiveViewportManager';
import {
  DEFAULT_THREE_TOON_TUNING,
  ThreeQualityTier,
  ThreeTelemetrySnapshot,
  ThreeToonTuningConfig
} from './threeTypes';
import {
  SpeedlinesComputeInput,
  SpeedlinesOverlay3D,
  disposeSharedToonCaches
} from './shaders/AnimeToonMaterial';

export interface ThreeTimeOfDayLighting {
  sunDirection: THREE.Vector3;
  sunColor: THREE.Color;
  sunIntensity: number;
  ambientSky: THREE.Color;
  ambientGround: THREE.Color;
  ambientIntensity: number;
  fogColor: THREE.Color;
  exposure: number;
}

export interface ThreeStagePolishInput {
  quality?: string;
  timeOfDay?: string;
  bloom?: boolean;
  flashEffect?: boolean;
  lighting?: boolean;
  shadowContrast?: number;
}

export interface ThreeRendererLike {
  domElement: HTMLCanvasElement;
  shadowMap: { enabled: boolean; type: number };
  toneMapping: number;
  toneMappingExposure: number;
  outputColorSpace: string;
  info: {
    render: { calls: number; triangles: number };
    memory: { geometries: number; textures: number };
    programs?: unknown[] | null;
  };
  setPixelRatio(value: number): void;
  setSize(width: number, height: number, updateStyle?: boolean): void;
  render(scene: THREE.Scene, camera: THREE.Camera): void;
  dispose(): void;
}

export interface ThreeComposerLike {
  setSize(width: number, height: number): void;
  render(deltaTime?: number): void;
  dispose(): void;
}

export interface ThreeStageHostDeps {
  rendererFactory?: (canvas: HTMLCanvasElement) => ThreeRendererLike;
  composerFactory?: (
    renderer: ThreeRendererLike,
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
    width: number,
    height: number,
    bloomStrength: number
  ) => { composer: ThreeComposerLike; bloomPass: { strength: number; enabled: boolean } };
}

function clampQualityTier(quality?: string): ThreeQualityTier {
  const upper = (quality ?? 'HIGH').toUpperCase();
  if (upper === 'LOW') return 'LOW';
  if (upper === 'MEDIUM') return 'MEDIUM';
  return 'HIGH';
}

function getLightingForTimeOfDay(preset?: string): ThreeTimeOfDayLighting {
  const upper = (preset ?? 'DAY').toUpperCase();
  if (upper === 'SUNSET' || upper === 'DUSK') {
    return {
      sunDirection: new THREE.Vector3(-0.65, 0.42, 0.55).normalize(),
      sunColor: new THREE.Color('#ffb17a'),
      sunIntensity: 2.3,
      ambientSky: new THREE.Color('#c08497'),
      ambientGround: new THREE.Color('#4a3856'),
      ambientIntensity: 0.95,
      fogColor: new THREE.Color('#f4a261'),
      exposure: 1.05
    };
  }
  if (upper === 'NIGHT') {
    return {
      sunDirection: new THREE.Vector3(0.4, 0.85, -0.35).normalize(),
      sunColor: new THREE.Color('#9ec5ff'),
      sunIntensity: 1.4,
      ambientSky: new THREE.Color('#3b5998'),
      ambientGround: new THREE.Color('#19223b'),
      ambientIntensity: 0.85,
      fogColor: new THREE.Color('#1a2744'),
      exposure: 1.0
    };
  }
  if (upper === 'STORM') {
    return {
      sunDirection: new THREE.Vector3(0.3, 0.72, 0.62).normalize(),
      sunColor: new THREE.Color('#cbd5e1'),
      sunIntensity: 1.75,
      ambientSky: new THREE.Color('#64748b'),
      ambientGround: new THREE.Color('#334155'),
      ambientIntensity: 0.95,
      fogColor: new THREE.Color('#64748b'),
      exposure: 0.96
    };
  }
  return {
    sunDirection: new THREE.Vector3(0.55, 0.88, 0.36).normalize(),
    sunColor: new THREE.Color('#fff6e0'),
    sunIntensity: 2.6,
    ambientSky: new THREE.Color('#93c5fd'),
    ambientGround: new THREE.Color('#6b5e50'),
    ambientIntensity: 1.15,
    fogColor: new THREE.Color('#bae6fd'),
    exposure: 1.08
  };
}

function hasWebGL2Support(canvas: HTMLCanvasElement): boolean {
  try {
    return Boolean(canvas.getContext('webgl2', { antialias: true, powerPreference: 'high-performance' }));
  } catch {
    return false;
  }
}

export class ThreeStageHost {
  public readonly scene: THREE.Scene;
  public readonly camera: THREE.PerspectiveCamera;
  public readonly sunLight: THREE.DirectionalLight;
  public readonly hemiLight: THREE.HemisphereLight;

  private canvas: HTMLCanvasElement | null = null;
  private renderer: ThreeRendererLike | null = null;
  private composer: ThreeComposerLike | null = null;
  private bloomPass: { strength: number; enabled: boolean } | null = null;
  private speedlines: SpeedlinesOverlay3D | null = null;

  private isInitialized = false;
  private active = false;
  private quality: ThreeQualityTier = 'HIGH';
  private bloomEnabled = true;
  private flashEffect = true;
  private timeOfDay = 'DAY';
  private tuning: ThreeToonTuningConfig = { ...DEFAULT_THREE_TOON_TUNING };
  private lightingState: ThreeTimeOfDayLighting = getLightingForTimeOfDay('DAY');

  private viewWidth = 1170;
  private viewHeight = 540;
  private lastFrameTimeMs = 16.6;
  private smoothFps = 60;
  private activeHordeCount = 0;
  private activeKoCount = 0;
  private temporaryBloomBoost = 0;

  constructor(private readonly deps: ThreeStageHostDeps = {}) {
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(48, 19.5 / 9, 0.3, 240);
    this.camera.position.set(0, 7.2, 13.5);
    this.camera.lookAt(0, 1.5, 0);

    this.sunLight = new THREE.DirectionalLight(
      this.lightingState.sunColor,
      this.lightingState.sunIntensity
    );
    this.sunLight.position.copy(this.lightingState.sunDirection).multiplyScalar(28);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.set(1024, 1024);
    this.sunLight.shadow.camera.near = 2;
    this.sunLight.shadow.camera.far = 70;
    const frustum = 22;
    this.sunLight.shadow.camera.left = -frustum;
    this.sunLight.shadow.camera.right = frustum;
    this.sunLight.shadow.camera.top = frustum;
    this.sunLight.shadow.camera.bottom = -frustum;
    this.sunLight.shadow.bias = -0.0008;

    this.hemiLight = new THREE.HemisphereLight(
      this.lightingState.ambientSky,
      this.lightingState.ambientGround,
      this.lightingState.ambientIntensity
    );

    this.scene.add(this.sunLight);
    this.scene.add(this.hemiLight);
  }

  public get isWebGL2Ready(): boolean {
    return this.isInitialized;
  }

  public get isActive(): boolean {
    return this.active;
  }

  public getCanvasElement(): HTMLCanvasElement | null {
    return this.canvas;
  }

  public getTuning(): ThreeToonTuningConfig {
    return { ...this.tuning };
  }

  public getLightingState(): ThreeTimeOfDayLighting {
    return this.lightingState;
  }

  public getTimeOfDay(): string {
    return this.timeOfDay;
  }

  public getQualityTier(): ThreeQualityTier {
    return this.quality;
  }

  public isFlashEffectEnabled(): boolean {
    return this.flashEffect;
  }

  public isComposerActiveForRender(): boolean {
    return Boolean(this.composer) && this.quality !== 'LOW' && this.bloomEnabled;
  }

  public init(wrapperEl: HTMLElement | null, metrics?: ViewportMetrics): boolean {
    if (this.isInitialized) {
      if (metrics) this.resize(metrics);
      return true;
    }

    if (typeof document === 'undefined' && !this.deps.rendererFactory) {
      return false;
    }

    const canvas =
      typeof document !== 'undefined'
        ? document.createElement('canvas')
        : ({ width: 960, height: 540, style: {} } as unknown as HTMLCanvasElement);

    if (!this.deps.rendererFactory && !hasWebGL2Support(canvas)) {
      return false;
    }

    if (typeof document !== 'undefined') {
      canvas.id = 'opgv-three-webgl2-canvas';
      canvas.style.position = 'absolute';
      canvas.style.inset = '0';
      canvas.style.width = '100%';
      canvas.style.height = '100%';
      canvas.style.display = 'none';
      canvas.style.zIndex = '2';
      canvas.style.touchAction = 'none';
      if (wrapperEl) {
        wrapperEl.appendChild(canvas);
      }
    }

    const renderer = this.deps.rendererFactory
      ? this.deps.rendererFactory(canvas)
      : (new THREE.WebGLRenderer({
          canvas,
          antialias: true,
          powerPreference: 'high-performance',
          alpha: false
        }) as unknown as ThreeRendererLike);

    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = this.lightingState.exposure;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = this.quality !== 'LOW';
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const width = Math.max(1, metrics?.viewWidth ?? 1170);
    const height = Math.max(1, metrics?.viewHeight ?? 540);
    this.viewWidth = width;
    this.viewHeight = height;

    if (this.deps.composerFactory) {
      const built = this.deps.composerFactory(
        renderer,
        this.scene,
        this.camera,
        width,
        height,
        this.tuning.bloomStrength
      );
      this.composer = built.composer;
      this.bloomPass = built.bloomPass;
    } else if (renderer instanceof THREE.WebGLRenderer) {
      const composer = new EffectComposer(renderer);
      const renderPass = new RenderPass(this.scene, this.camera);
      const bloomPass = new UnrealBloomPass(
        new THREE.Vector2(width, height),
        this.tuning.bloomStrength,
        0.55,
        0.78
      );
      const outputPass = new OutputPass();
      composer.addPass(renderPass);
      composer.addPass(bloomPass);
      composer.addPass(outputPass);
      this.composer = composer;
      this.bloomPass = bloomPass;
    }

    this.canvas = canvas;
    this.renderer = renderer;
    this.speedlines = new SpeedlinesOverlay3D(wrapperEl);
    this.isInitialized = true;

    this.resize(metrics ?? computeResponsiveViewport(width, height, 1));
    return true;
  }

  public activate(): void {
    this.active = true;
    if (this.canvas) {
      this.canvas.style.display = 'block';
    }
  }

  public deactivate(): void {
    this.active = false;
    if (this.canvas) {
      this.canvas.style.display = 'none';
    }
    this.speedlines?.hide();
  }

  public resize(metrics: ViewportMetrics): void {
    const cssW = Math.max(1, metrics.cssWidth || metrics.viewWidth || 960);
    const cssH = Math.max(1, metrics.cssHeight || metrics.viewHeight || 540);
    this.viewWidth = cssW;
    this.viewHeight = cssH;

    this.camera.aspect = cssW / cssH;
    this.camera.updateProjectionMatrix();

    const maxDpr = this.quality === 'LOW' ? 1 : this.quality === 'MEDIUM' ? 1.5 : 2;
    const targetDpr = Math.min(maxDpr, Math.max(1, metrics.dpr || 1));

    if (this.renderer) {
      this.renderer.setPixelRatio(targetDpr);
      this.renderer.setSize(cssW, cssH, false);
    }
    if (this.composer) {
      this.composer.setSize(cssW, cssH);
    }
    this.speedlines?.resize(cssW, cssH);
  }

  public applyVisualPolishConfig(config: ThreeStagePolishInput): void {
    this.quality = clampQualityTier(config.quality);
    if (typeof config.bloom === 'boolean') {
      this.bloomEnabled = config.bloom;
    }
    if (typeof config.flashEffect === 'boolean') {
      this.flashEffect = config.flashEffect;
    }
    if (config.timeOfDay) {
      this.timeOfDay = config.timeOfDay;
      this.lightingState = getLightingForTimeOfDay(config.timeOfDay);
      this.sunLight.color.copy(this.lightingState.sunColor);
      this.sunLight.intensity = this.lightingState.sunIntensity;
      this.sunLight.position.copy(this.lightingState.sunDirection).multiplyScalar(28);
      this.hemiLight.color.copy(this.lightingState.ambientSky);
      this.hemiLight.groundColor.copy(this.lightingState.ambientGround);
      this.hemiLight.intensity = this.lightingState.ambientIntensity;
    }

    if (this.renderer) {
      this.renderer.shadowMap.enabled = this.quality !== 'LOW';
      this.renderer.toneMappingExposure = this.lightingState.exposure;
      this.sunLight.castShadow = this.quality === 'HIGH';
    }
    if (this.bloomPass) {
      this.bloomPass.enabled = this.quality !== 'LOW' && this.bloomEnabled;
      const maxBoost = this.flashEffect ? 0.85 : 0.12;
      this.bloomPass.strength =
        this.tuning.bloomStrength + Math.max(0, Math.min(maxBoost, this.temporaryBloomBoost));
    }

    this.resize(
      computeResponsiveViewport(
        this.viewWidth,
        this.viewHeight,
        typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1
      )
    );
  }

  public setTuning(partial: Partial<ThreeToonTuningConfig>): ThreeToonTuningConfig {
    this.tuning = {
      ...this.tuning,
      ...partial
    };
    if (this.bloomPass) {
      const maxBoost = this.flashEffect ? 0.85 : 0.12;
      this.bloomPass.strength =
        this.tuning.bloomStrength + Math.max(0, Math.min(maxBoost, this.temporaryBloomBoost));
      this.bloomPass.enabled = this.quality !== 'LOW' && this.bloomEnabled;
    }
    return this.getTuning();
  }

  public setTemporaryBloomBoost(deltaStrength: number): void {
    const maxBoost = this.flashEffect ? 0.85 : 0.12;
    this.temporaryBloomBoost = Math.max(0, Math.min(maxBoost, deltaStrength));
    if (this.bloomPass) {
      this.bloomPass.strength = this.tuning.bloomStrength + this.temporaryBloomBoost;
      this.bloomPass.enabled = this.quality !== 'LOW' && this.bloomEnabled;
    }
  }

  public updateSpeedlines(
    dt: number,
    speedNormalized: number,
    isSpecialActive: boolean
  ): void {
    const input: SpeedlinesComputeInput = {
      speedNormalized,
      isSpecialActive,
      flashEffect: this.flashEffect,
      opacityMultiplier: this.tuning.speedlinesOpacity
    };
    this.speedlines?.update(dt, input);
  }

  public recordBattleStats(hordeActiveCount: number, koCount: number): void {
    this.activeHordeCount = hordeActiveCount;
    this.activeKoCount = koCount;
  }

  public renderFrame(deltaTimeSec: number): void {
    if (!this.renderer || !this.active) return;

    const frameStartMs =
      typeof performance !== 'undefined' ? performance.now() : 0;

    if (this.isComposerActiveForRender() && this.composer) {
      this.composer.render(deltaTimeSec);
    } else {
      this.renderer.render(this.scene, this.camera);
    }

    if (typeof performance !== 'undefined') {
      const elapsed = Math.max(0.1, performance.now() - frameStartMs);
      this.lastFrameTimeMs = elapsed;
    } else {
      this.lastFrameTimeMs = Math.max(1, deltaTimeSec * 1000);
    }

    const instFps = deltaTimeSec > 0 ? Math.min(240, 1 / deltaTimeSec) : 60;
    this.smoothFps = this.smoothFps * 0.9 + instFps * 0.1;
  }

  public getTelemetrySnapshot(): ThreeTelemetrySnapshot {
    const info = this.renderer?.info;
    return {
      active: this.active,
      fps: Math.round(this.smoothFps),
      frameTimeMs: Number(this.lastFrameTimeMs.toFixed(2)),
      drawCalls: info?.render.calls ?? 0,
      triangles: info?.render.triangles ?? 0,
      geometries: info?.memory.geometries ?? 0,
      textures: info?.memory.textures ?? 0,
      programs: Array.isArray(info?.programs) ? info.programs.length : 0,
      hordeActiveCount: this.activeHordeCount,
      koCount: this.activeKoCount,
      quality: this.quality,
      speedlinesAlpha: this.speedlines?.alpha ?? 0
    };
  }

  public dispose(): void {
    this.deactivate();
    this.speedlines?.dispose();
    this.speedlines = null;

    if (this.composer) {
      this.composer.dispose();
      this.composer = null;
    }
    this.bloomPass = null;

    if (this.sunLight.shadow.map) {
      this.sunLight.shadow.map.dispose();
    }
    this.sunLight.dispose();
    this.hemiLight.dispose();
    this.scene.clear();

    if (this.renderer) {
      this.renderer.dispose();
      this.renderer = null;
    }
    if (this.canvas?.parentElement) {
      this.canvas.parentElement.removeChild(this.canvas);
    }
    this.canvas = null;
    this.isInitialized = false;
    disposeSharedToonCaches();
  }
}
