import { BufferImageSource, Container, Graphics, Sprite, Texture } from 'pixi.js';
import type { VisualPolishConfig } from '../../backend/renderBackend';
import type { PixiStageHost } from '../PixiStageHost';
import {
  TIME_OF_DAY_PROFILES,
  type SunShadowTransform
} from './glslUtils';

export interface DynamicPointLightInput {
  x: number;
  y: number;
  radiusPx: number;
  colorInt: number;
  intensity: number;
  flickerSpeed: number;
  flickerAmp: number;
  phaseOffset?: number;
}

const MAX_POOLED_LIGHTS = 32;

function createRadialGlowTexture(): Texture {
  const size = 64;
  const data = new Uint8Array(size * size * 4);
  const half = (size - 1) * 0.5;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = (x - half) / half;
      const dy = (y - half) / half;
      const dist = Math.hypot(dx, dy);
      const t = Math.max(0, 1 - dist);
      // Smooth quadratic + core falloff for natural indie light bloom
      const v = Math.round(Math.pow(t, 1.85) * 255);
      const idx = (y * size + x) * 4;
      // Premultiplied white RGBA for additive lightmap blending
      data[idx] = v;
      data[idx + 1] = v;
      data[idx + 2] = v;
      data[idx + 3] = v;
    }
  }
  const source = new BufferImageSource({
    resource: data,
    width: size,
    height: size,
    format: 'rgba8unorm',
    scaleMode: 'linear',
    label: 'opgv_radial_light_lut'
  });
  return new Texture({ source, label: 'opgv_radial_light_lut' });
}

export function computeSunShadowForTimeOfDay(
  polish: Pick<VisualPolishConfig, 'timeOfDay' | 'quality'>
): SunShadowTransform {
  const base = TIME_OF_DAY_PROFILES[polish.timeOfDay].sunShadow;
  if (polish.quality === 'LOW') {
    return { skewX: 0, scaleY: 0.35, alpha: base.alpha * 0.8, offsetX: 0, offsetY: 2 };
  }
  return { ...base };
}

export class DynamicLightingLayer {
  public readonly displaySprite: Sprite;
  private readonly lightScene = new Container();
  private readonly ambientQuad = new Graphics();
  private readonly glowTexture: Texture;
  private readonly lightPool: Sprite[] = [];
  private lightRt: ReturnType<PixiStageHost['createTrackedRenderTexture']> | null = null;
  private width = 960;
  private height = 540;
  private disposed = false;

  constructor(private readonly host: PixiStageHost) {
    this.glowTexture = createRadialGlowTexture();
    this.lightScene.label = 'dynamic_light_scene';
    this.lightScene.addChild(this.ambientQuad);

    for (let i = 0; i < MAX_POOLED_LIGHTS; i++) {
      const sp = new Sprite(this.glowTexture);
      sp.anchor.set(0.5, 0.5);
      sp.blendMode = 'add';
      sp.visible = false;
      this.lightScene.addChild(sp);
      this.lightPool.push(sp);
    }

    this.displaySprite = new Sprite(Texture.WHITE);
    this.displaySprite.label = 'dynamic_lighting_multiply_overlay';
    this.displaySprite.blendMode = 'multiply';
    this.displaySprite.visible = false;
  }

  public ensureSize(viewW: number, viewH: number): void {
    const safeW = Math.max(1, Math.round(viewW));
    const safeH = Math.max(1, Math.round(viewH));
    const rtW = Math.max(1, Math.ceil(safeW * 0.5));
    const rtH = Math.max(1, Math.ceil(safeH * 0.5));

    if (!this.lightRt || this.width !== safeW || this.height !== safeH) {
      this.width = safeW;
      this.height = safeH;
      if (this.lightRt) {
        this.host.destroyTrackedRenderTexture(this.lightRt);
      }
      this.lightRt = this.host.createTrackedRenderTexture(
        rtW,
        rtH,
        'linear',
        'dynamic_lighting_halfres_rt'
      );
      this.displaySprite.texture = this.lightRt;
      this.displaySprite.width = safeW;
      this.displaySprite.height = safeH;
    }
  }

  public renderPass(
    viewW: number,
    viewH: number,
    timeSec: number,
    lights: readonly DynamicPointLightInput[],
    polish: VisualPolishConfig
  ): void {
    if (this.disposed) return;
    if (!polish.dynamicLighting || polish.quality === 'LOW') {
      this.displaySprite.visible = false;
      return;
    }

    this.ensureSize(viewW, viewH);
    if (!this.lightRt) return;

    const profile = TIME_OF_DAY_PROFILES[polish.timeOfDay];
    const rtW = this.lightRt.width;
    const rtH = this.lightRt.height;

    this.ambientQuad.clear();
    this.ambientQuad.rect(0, 0, rtW, rtH);
    this.ambientQuad.fill({ color: profile.ambientHex, alpha: 1 });

    let used = 0;
    const maxLights = polish.quality === 'MEDIUM' ? Math.min(12, lights.length) : Math.min(MAX_POOLED_LIGHTS, lights.length);
    for (let i = 0; i < maxLights; i++) {
      const l = lights[i];
      const sp = this.lightPool[used];
      if (!l || !sp) continue;

      const flicker =
        1 +
        Math.sin(timeSec * l.flickerSpeed + (l.phaseOffset ?? i * 1.7)) *
          l.flickerAmp;
      const radiusHalf = Math.max(8, l.radiusPx * 0.5 * flicker);
      const effIntensity = Math.min(
        1,
        Math.max(0.05, l.intensity * profile.lanternIntensityMult * flicker)
      );

      sp.visible = true;
      sp.position.set(l.x * 0.5, l.y * 0.5);
      sp.width = radiusHalf * 2;
      sp.height = radiusHalf * 2;
      sp.tint = l.colorInt;
      sp.alpha = effIntensity;
      used += 1;
    }
    for (let i = used; i < this.lightPool.length; i++) {
      const sp = this.lightPool[i];
      if (sp) sp.visible = false;
    }

    this.host.renderContainerToTarget(this.lightScene, this.lightRt);
    this.displaySprite.width = this.width;
    this.displaySprite.height = this.height;
    this.displaySprite.visible = true;
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.host.destroyTrackedRenderTexture(this.lightRt);
    this.lightRt = null;
    this.displaySprite.destroy({ texture: false });
    this.lightScene.destroy({ children: true, texture: false });
    this.glowTexture.destroy(true);
    this.lightPool.length = 0;
  }
}
