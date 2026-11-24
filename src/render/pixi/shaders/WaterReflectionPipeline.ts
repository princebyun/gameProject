import { Container, Sprite, Texture, UniformGroup, type Filter } from 'pixi.js';
import type { VisualPolishConfig } from '../../backend/renderBackend';
import type { PixiStageHost } from '../PixiStageHost';
import { createGlslFilter, TIME_OF_DAY_PROFILES } from './glslUtils';

const WATER_REFLECTION_FRAG = /* glsl */ `
in vec2 vTextureCoord;
out vec4 finalColor;

uniform sampler2D uTexture;
uniform float uTime;
uniform float uWaveAmp;
uniform float uWaveFreq;
uniform float uPixelRows;
uniform vec3 uWaterTint;
uniform float uSpecularStrength;

void main(void) {
    float rowStep = floor(vTextureCoord.y * max(32.0, uPixelRows)) / max(32.0, uPixelRows);
    float wave1 = sin(rowStep * uWaveFreq + uTime * 3.2) * uWaveAmp;
    float wave2 = cos(rowStep * (uWaveFreq * 2.15) - uTime * 2.4) * (uWaveAmp * 0.45);

    vec2 uv = vec2(
        clamp(vTextureCoord.x + wave1 + wave2, 0.002, 0.998),
        clamp(vTextureCoord.y + sin(vTextureCoord.x * 26.0 + uTime * 2.0) * (uWaveAmp * 0.25), 0.002, 0.998)
    );
    vec4 refl = texture(uTexture, uv);

    // Subtle horizontal scanline water ripple & shoreline crest sparkle
    float band = 0.78 + 0.22 * sin(rowStep * 95.0 + uTime * 4.5);
    float glintBand = smoothstep(0.92, 0.995, sin(vTextureCoord.x * 52.0 + uTime * 2.6) * cos(rowStep * 48.0 - uTime * 1.9));
    vec3 specular = vec3(1.0, 0.98, 0.88) * glintBand * uSpecularStrength * 0.42;

    vec3 tinted = mix(refl.rgb, refl.rgb * uWaterTint, 0.42) * band;
    float outAlpha = refl.a * 0.54 + glintBand * 0.16 * uSpecularStrength;
    finalColor = vec4(tinted * 0.54 + specular * outAlpha, clamp(outAlpha, 0.0, 0.78));
}
`;

export interface ReflectedWorldEntry {
  texture: Texture;
  worldX: number;
  worldY: number;
  scaleX: number;
  scaleY: number;
  tint?: number;
  alpha?: number;
}

const MAX_REFLECTED_SPRITES = 48;

export class WaterReflectionPipeline {
  public readonly reflectionSprite: Sprite;
  private readonly captureContainer = new Container();
  private readonly mirroredRoot = new Container();
  private readonly spritePool: Sprite[] = [];
  private readonly filter: Filter;
  private readonly uniforms: UniformGroup<{
    uTime: { value: number; type: 'f32' };
    uWaveAmp: { value: number; type: 'f32' };
    uWaveFreq: { value: number; type: 'f32' };
    uPixelRows: { value: number; type: 'f32' };
    uWaterTint: { value: Float32Array; type: 'vec3<f32>' };
    uSpecularStrength: { value: number; type: 'f32' };
  }>;
  private reflectionRt: ReturnType<PixiStageHost['createTrackedRenderTexture']> | null = null;
  private width = 960;
  private height = 540;
  private lastWaveAmp = 0.0048;
  private disposed = false;

  constructor(private readonly host: PixiStageHost) {
    this.captureContainer.label = 'water_reflection_capture_root';
    this.captureContainer.scale.set(0.5);
    this.mirroredRoot.label = 'water_reflection_mirrored_entities';
    this.captureContainer.addChild(this.mirroredRoot);

    for (let i = 0; i < MAX_REFLECTED_SPRITES; i++) {
      const sp = new Sprite(Texture.EMPTY);
      sp.anchor.set(0.5, 1.0);
      sp.visible = false;
      this.mirroredRoot.addChild(sp);
      this.spritePool.push(sp);
    }

    this.uniforms = new UniformGroup({
      uTime: { value: 0, type: 'f32' },
      uWaveAmp: { value: 0.0042, type: 'f32' },
      uWaveFreq: { value: 38.0, type: 'f32' },
      uPixelRows: { value: 135, type: 'f32' },
      uWaterTint: { value: new Float32Array([0.16, 0.68, 0.92]), type: 'vec3<f32>' },
      uSpecularStrength: { value: 0.65, type: 'f32' }
    });

    this.filter = createGlslFilter({
      name: 'opgv-water-reflection-filter',
      fragment: WATER_REFLECTION_FRAG,
      resources: {
        waterUniforms: this.uniforms
      },
      padding: 4
    });

    this.reflectionSprite = new Sprite(Texture.EMPTY);
    this.reflectionSprite.label = 'water_reflection_overlay';
    this.reflectionSprite.filters = [this.filter];
    this.reflectionSprite.visible = false;
  }

  public get currentWaveAmp(): number {
    return this.lastWaveAmp;
  }

  public ensureSize(viewW: number, viewH: number): void {
    const safeW = Math.max(1, Math.round(viewW));
    const safeH = Math.max(1, Math.round(viewH));
    const rtW = Math.max(1, Math.ceil(safeW * 0.5));
    const rtH = Math.max(1, Math.ceil(safeH * 0.5));

    if (!this.reflectionRt || this.width !== safeW || this.height !== safeH) {
      this.width = safeW;
      this.height = safeH;
      if (this.reflectionRt) {
        this.host.destroyTrackedRenderTexture(this.reflectionRt);
      }
      this.reflectionRt = this.host.createTrackedRenderTexture(
        rtW,
        rtH,
        'nearest',
        'water_reflection_halfres_rt'
      );
      this.reflectionSprite.texture = this.reflectionRt;
      this.reflectionSprite.width = safeW;
      this.reflectionSprite.height = safeH;
    }
  }

  public renderPass(
    viewW: number,
    viewH: number,
    worldTransX: number,
    worldTransY: number,
    timeSec: number,
    waterlineWorldY: number,
    entries: readonly ReflectedWorldEntry[],
    polish: VisualPolishConfig,
    options?: {
      tintRgbOverride?: [number, number, number];
      maxDistAboveWater?: number;
      alphaMult?: number;
      specularMult?: number;
      waveAmpMult?: number;
      fullAreaReflection?: boolean;
    }
  ): void {
    if (this.disposed) return;
    if (!polish.waterReflection || polish.quality === 'LOW') {
      this.reflectionSprite.visible = false;
      this.filter.enabled = false;
      return;
    }

    this.ensureSize(viewW, viewH);
    if (!this.reflectionRt) return;

    this.filter.enabled = true;
    const profile = TIME_OF_DAY_PROFILES[polish.timeOfDay];
    const specMult = options?.specularMult ?? 1.0;
    const baseWave = polish.quality === 'HIGH' ? 0.0048 : 0.0032;
    const waveAmp = Number((baseWave * (options?.waveAmpMult ?? 1.0)).toFixed(6));
    this.lastWaveAmp = waveAmp;
    this.uniforms.uniforms.uTime = timeSec;
    this.uniforms.uniforms.uWaveAmp = waveAmp;
    this.uniforms.uniforms.uPixelRows = Math.max(64, Math.round(viewH * 0.25));
    this.uniforms.uniforms.uSpecularStrength =
      (polish.flashEffectEnabled
        ? profile.sunSpecularStrength
        : profile.sunSpecularStrength * 0.55) * specMult;
    const tint = this.uniforms.uniforms.uWaterTint;
    const activeTintRgb = options?.tintRgbOverride ?? profile.waterTintRgb;
    tint[0] = activeTintRgb[0];
    tint[1] = activeTintRgb[1];
    tint[2] = activeTintRgb[2];

    this.mirroredRoot.position.set(worldTransX, worldTransY);

    let used = 0;
    const maxDist = options?.maxDistAboveWater ?? 240;
    const alphaMult = options?.alphaMult ?? 1.0;
    const fullArea = Boolean(options?.fullAreaReflection);
    const count = Math.min(MAX_REFLECTED_SPRITES, entries.length);
    for (let i = 0; i < count; i++) {
      const e = entries[i];
      const sp = this.spritePool[used];
      if (!e || !sp) continue;

      let reflectedY = e.worldY + 8;
      let distFactor = 0.78;
      if (!fullArea) {
        const clampedPivotY = Math.min(e.worldY, waterlineWorldY);
        const distAboveWater = Math.max(0, waterlineWorldY - clampedPivotY);
        if (distAboveWater > maxDist) continue;
        reflectedY = waterlineWorldY + distAboveWater * 0.55 + 6;
        distFactor = Math.max(0.25, 1 - distAboveWater / Math.max(100, maxDist + 20));
      }
      sp.texture = e.texture;
      sp.position.set(Math.round(e.worldX), Math.round(reflectedY));
      sp.scale.set(e.scaleX, -Math.abs(e.scaleY) * 0.82);
      sp.tint = e.tint ?? 0xe0f2fe;
      sp.alpha = (e.alpha ?? 0.85) * alphaMult * distFactor;
      sp.visible = true;
      used += 1;
    }
    for (let i = used; i < this.spritePool.length; i++) {
      const sp = this.spritePool[i];
      if (sp) sp.visible = false;
    }

    this.host.renderContainerToTarget(this.captureContainer, this.reflectionRt);
    this.reflectionSprite.width = this.width;
    this.reflectionSprite.height = this.height;
    this.reflectionSprite.visible = true;
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.host.destroyTrackedRenderTexture(this.reflectionRt);
    this.reflectionRt = null;
    this.reflectionSprite.filters = [];
    this.filter.destroy();
    this.reflectionSprite.destroy({ texture: false });
    this.captureContainer.destroy({ children: true, texture: false });
    this.spritePool.length = 0;
  }
}
