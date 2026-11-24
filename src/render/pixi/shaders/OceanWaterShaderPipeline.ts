import { Sprite, Texture, UniformGroup, type Filter } from 'pixi.js';
import { clamp } from '../../../core/math/vector2';
import type { Disposable } from '../../../core/types/disposable';
import type { SeaZoneId } from '../../../core/types/rpgSchemas';
import type { VisualPolishConfig } from '../../backend/renderBackend';
import { createGlslFilter, TIME_OF_DAY_PROFILES } from './glslUtils';
import type { OceanIslandCircleInput, SeaZoneWaterPalette } from './seaTypes';

export const SEA_ZONE_WATER_PALETTES: Record<SeaZoneId, SeaZoneWaterPalette> = {
  east_blue: {
    zoneId: 'east_blue',
    deepRgb: [0.03, 0.28, 0.42],
    midRgb: [0.06, 0.52, 0.68],
    shallowRgb: [0.18, 0.82, 0.78],
    foamRgb: [0.92, 0.99, 1.0],
    sunsetAccentRgb: [0.96, 0.56, 0.36]
  },
  grand_line: {
    zoneId: 'grand_line',
    deepRgb: [0.04, 0.14, 0.36],
    midRgb: [0.1, 0.32, 0.68],
    shallowRgb: [0.22, 0.68, 0.92],
    foamRgb: [0.88, 0.96, 1.0],
    sunsetAccentRgb: [0.9, 0.48, 0.46]
  },
  new_world: {
    zoneId: 'new_world',
    deepRgb: [0.04, 0.05, 0.18],
    midRgb: [0.16, 0.14, 0.44],
    shallowRgb: [0.38, 0.24, 0.68],
    foamRgb: [0.9, 0.88, 1.0],
    sunsetAccentRgb: [0.98, 0.62, 0.24]
  }
};

const OCEAN_WATER_FRAG = /* glsl */ `
in vec2 vTextureCoord;
out vec4 finalColor;

uniform sampler2D uTexture;
uniform float uTime;
uniform vec2 uCameraWorldPos;
uniform vec2 uViewSize;
uniform float uPixelScale;
uniform vec3 uDeepColor;
uniform vec3 uMidColor;
uniform vec3 uShallowColor;
uniform vec3 uFoamColor;
uniform vec3 uSpecularColor;
uniform float uSpecularStrength;
uniform float uQualityLevel;
uniform float uSunsetFactor;
uniform float uIslandCount;
uniform vec4 uIsland0;
uniform vec4 uIsland1;
uniform vec4 uIsland2;
uniform vec4 uIsland3;
uniform vec4 uIsland4;
uniform vec4 uIsland5;
uniform vec4 uIsland6;
uniform vec4 uIsland7;

vec4 getIslandCircle(int idx) {
    if (idx == 0) return uIsland0;
    if (idx == 1) return uIsland1;
    if (idx == 2) return uIsland2;
    if (idx == 3) return uIsland3;
    if (idx == 4) return uIsland4;
    if (idx == 5) return uIsland5;
    if (idx == 6) return uIsland6;
    return uIsland7;
}

float causticLayer(vec2 worldPx, vec2 dir, float freq, float phaseShift) {
    vec2 p = worldPx * freq + dir * uTime * 18.0;
    float w1 = sin(p.x * 0.11 + p.y * 0.07 + phaseShift);
    float w2 = cos(p.x * 0.08 - p.y * 0.13 - phaseShift * 0.6);
    return (w1 + w2) * 0.5;
}

void main(void) {
    vec4 base = texture(uTexture, vTextureCoord);
    float ps = max(1.0, uPixelScale);
    vec2 screenPx = vTextureCoord * max(vec2(1.0), uViewSize);
    vec2 worldPx = screenPx + uCameraWorldPos;
    vec2 snappedWorld = floor(worldPx / ps) * ps;

    // 2-direction cross-scrolling pixel caustics
    float c1 = causticLayer(snappedWorld, vec2(1.0, 0.45), 0.72, 0.0);
    float c2 = uQualityLevel >= 0.5
        ? causticLayer(snappedWorld, vec2(-0.72, 0.88), 0.94, 1.9)
        : c1 * 0.4;
    float waveComb = c1 * 0.55 + c2 * 0.45;

    // Quantized cel-pixel depth bands for clean retro WebGL2 ocean look
    float depthMix = clamp(0.45 + waveComb * 0.38, 0.0, 1.0);
    float steppedDepth = floor(depthMix * 5.0) / 5.0;
    vec3 col = mix(uDeepColor, uMidColor, steppedDepth);

    // Caustic bright filaments
    float causticCrest = smoothstep(0.48, 0.72, waveComb);
    col = mix(col, uShallowColor, causticCrest * 0.46);

    // Time-of-day specular shimmer (morning/day crisp spark, sunset warm gold glint)
    float shimmerField = sin(snappedWorld.x * 0.095 + uTime * 3.1)
        * cos(snappedWorld.y * 0.12 - uTime * 2.3);
    float specBand = smoothstep(0.76, 0.95, shimmerField) * (0.45 + 0.55 * causticCrest);
    col += uSpecularColor * specBand * uSpecularStrength * 0.34;
    col = mix(col, col + vec3(0.18, 0.08, 0.02), uSunsetFactor * specBand * 0.35);

    // Island shoreline foam rings & shallow lagoon + subtle landmark water tint reflection
    int count = int(uIslandCount + 0.5);
    float shoreFoam = 0.0;
    float shallowGlow = 0.0;
    float gateTint = 0.0;
    for (int i = 0; i < 8; i++) {
        if (i >= count) break;
        vec4 isl = getIslandCircle(i);
        float d = length(screenPx - isl.xy);
        float r = max(24.0, isl.z);
        float outerShallow = smoothstep(r + 36.0, max(4.0, r - 6.0), d);
        shallowGlow = max(shallowGlow, outerShallow);

        float pulseR = r + sin(uTime * 2.6 + float(i) * 1.3) * 3.5;
        float ringDist = abs(d - pulseR);
        float ringMask = smoothstep(5.5, 0.8, ringDist);
        float innerRing = smoothstep(4.0, 0.6, abs(d - (pulseR - 11.0))) * 0.55;
        shoreFoam = max(shoreFoam, max(ringMask, innerRing));
        if (isl.w > 0.5) {
            gateTint = max(gateTint, outerShallow * 0.5);
        }
    }

    col = mix(col, uShallowColor * 1.08, shallowGlow * 0.48);
    col = mix(col, uFoamColor, clamp(shoreFoam * 0.72, 0.0, 0.85));
    col += vec3(0.28, 0.1, 0.16) * gateTint;

    finalColor = vec4(clamp(col, 0.0, 1.0), base.a);
}
`;

export interface OceanWaterUniformSnapshot {
  zoneId: SeaZoneId;
  timeSec: number;
  deepRgb: [number, number, number];
  midRgb: [number, number, number];
  shallowRgb: [number, number, number];
  specularStrength: number;
  islandCircleCount: number;
}

function lerpNum(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function writeRgb(
  dst: Float32Array,
  target: readonly [number, number, number],
  t: number
): void {
  dst[0] = lerpNum(dst[0] ?? target[0], target[0], t);
  dst[1] = lerpNum(dst[1] ?? target[1], target[1], t);
  dst[2] = lerpNum(dst[2] ?? target[2], target[2], t);
}

export class OceanWaterShaderPipeline implements Disposable {
  public readonly sprite: Sprite;
  private readonly filter: Filter;
  private readonly uniforms: UniformGroup<{
    uTime: { value: number; type: 'f32' };
    uCameraWorldPos: { value: Float32Array; type: 'vec2<f32>' };
    uViewSize: { value: Float32Array; type: 'vec2<f32>' };
    uPixelScale: { value: number; type: 'f32' };
    uDeepColor: { value: Float32Array; type: 'vec3<f32>' };
    uMidColor: { value: Float32Array; type: 'vec3<f32>' };
    uShallowColor: { value: Float32Array; type: 'vec3<f32>' };
    uFoamColor: { value: Float32Array; type: 'vec3<f32>' };
    uSpecularColor: { value: Float32Array; type: 'vec3<f32>' };
    uSpecularStrength: { value: number; type: 'f32' };
    uQualityLevel: { value: number; type: 'f32' };
    uSunsetFactor: { value: number; type: 'f32' };
    uIslandCount: { value: number; type: 'f32' };
    uIsland0: { value: Float32Array; type: 'vec4<f32>' };
    uIsland1: { value: Float32Array; type: 'vec4<f32>' };
    uIsland2: { value: Float32Array; type: 'vec4<f32>' };
    uIsland3: { value: Float32Array; type: 'vec4<f32>' };
    uIsland4: { value: Float32Array; type: 'vec4<f32>' };
    uIsland5: { value: Float32Array; type: 'vec4<f32>' };
    uIsland6: { value: Float32Array; type: 'vec4<f32>' };
    uIsland7: { value: Float32Array; type: 'vec4<f32>' };
  }>;

  private activeZoneId: SeaZoneId = 'east_blue';
  private initializedZone = false;
  private disposed = false;

  constructor(initialZoneId: SeaZoneId = 'east_blue') {
    this.activeZoneId = initialZoneId;
    const initPal = SEA_ZONE_WATER_PALETTES[initialZoneId];

    this.uniforms = new UniformGroup({
      uTime: { value: 0, type: 'f32' },
      uCameraWorldPos: { value: new Float32Array([0, 0]), type: 'vec2<f32>' },
      uViewSize: { value: new Float32Array([960, 540]), type: 'vec2<f32>' },
      uPixelScale: { value: 2.0, type: 'f32' },
      uDeepColor: { value: new Float32Array(initPal.deepRgb), type: 'vec3<f32>' },
      uMidColor: { value: new Float32Array(initPal.midRgb), type: 'vec3<f32>' },
      uShallowColor: { value: new Float32Array(initPal.shallowRgb), type: 'vec3<f32>' },
      uFoamColor: { value: new Float32Array(initPal.foamRgb), type: 'vec3<f32>' },
      uSpecularColor: { value: new Float32Array([1.0, 0.96, 0.84]), type: 'vec3<f32>' },
      uSpecularStrength: { value: 0.65, type: 'f32' },
      uQualityLevel: { value: 2.0, type: 'f32' },
      uSunsetFactor: { value: 0.0, type: 'f32' },
      uIslandCount: { value: 0.0, type: 'f32' },
      uIsland0: { value: new Float32Array([0, 0, 0, 0]), type: 'vec4<f32>' },
      uIsland1: { value: new Float32Array([0, 0, 0, 0]), type: 'vec4<f32>' },
      uIsland2: { value: new Float32Array([0, 0, 0, 0]), type: 'vec4<f32>' },
      uIsland3: { value: new Float32Array([0, 0, 0, 0]), type: 'vec4<f32>' },
      uIsland4: { value: new Float32Array([0, 0, 0, 0]), type: 'vec4<f32>' },
      uIsland5: { value: new Float32Array([0, 0, 0, 0]), type: 'vec4<f32>' },
      uIsland6: { value: new Float32Array([0, 0, 0, 0]), type: 'vec4<f32>' },
      uIsland7: { value: new Float32Array([0, 0, 0, 0]), type: 'vec4<f32>' }
    });

    this.filter = createGlslFilter({
      name: 'opgv-ocean-water-shader',
      fragment: OCEAN_WATER_FRAG,
      resources: {
        oceanUniforms: this.uniforms
      },
      padding: 0
    });

    this.sprite = new Sprite(Texture.WHITE);
    this.sprite.label = 'ocean_water_shader_quad';
    this.sprite.width = 960;
    this.sprite.height = 540;
    this.sprite.filters = [this.filter];
  }

  public get targetZoneId(): SeaZoneId {
    return this.activeZoneId;
  }

  public getCurrentPaletteSnapshot(): {
    deepRgb: [number, number, number];
    midRgb: [number, number, number];
    shallowRgb: [number, number, number];
  } {
    const u = this.uniforms.uniforms;
    return {
      deepRgb: [u.uDeepColor[0] ?? 0, u.uDeepColor[1] ?? 0, u.uDeepColor[2] ?? 0],
      midRgb: [u.uMidColor[0] ?? 0, u.uMidColor[1] ?? 0, u.uMidColor[2] ?? 0],
      shallowRgb: [u.uShallowColor[0] ?? 0, u.uShallowColor[1] ?? 0, u.uShallowColor[2] ?? 0]
    };
  }

  public getLastUniformState(): OceanWaterUniformSnapshot {
    const pal = this.getCurrentPaletteSnapshot();
    const u = this.uniforms.uniforms;
    return {
      zoneId: this.activeZoneId,
      timeSec: u.uTime,
      ...pal,
      specularStrength: u.uSpecularStrength,
      islandCircleCount: Math.round(u.uIslandCount)
    };
  }

  public snapToZonePalette(zoneId: SeaZoneId): void {
    this.activeZoneId = zoneId;
    this.initializedZone = true;
    const pal = SEA_ZONE_WATER_PALETTES[zoneId];
    writeRgb(this.uniforms.uniforms.uDeepColor, pal.deepRgb, 1);
    writeRgb(this.uniforms.uniforms.uMidColor, pal.midRgb, 1);
    writeRgb(this.uniforms.uniforms.uShallowColor, pal.shallowRgb, 1);
    writeRgb(this.uniforms.uniforms.uFoamColor, pal.foamRgb, 1);
  }

  public update(
    zoneId: SeaZoneId,
    dtSec: number,
    timeSec: number,
    viewW: number,
    viewH: number,
    cameraWorldX: number,
    cameraWorldY: number,
    polish: VisualPolishConfig,
    islandCircles: readonly OceanIslandCircleInput[]
  ): void {
    if (this.disposed) return;

    this.sprite.width = Math.max(1, Math.round(viewW));
    this.sprite.height = Math.max(1, Math.round(viewH));

    this.activeZoneId = zoneId;
    const pal = SEA_ZONE_WATER_PALETTES[zoneId];
    const blendT = !this.initializedZone ? 1 : clamp(dtSec * 3.0, 0.02, 1);
    this.initializedZone = true;

    const u = this.uniforms.uniforms;
    writeRgb(u.uDeepColor, pal.deepRgb, blendT);
    writeRgb(u.uMidColor, pal.midRgb, blendT);
    writeRgb(u.uShallowColor, pal.shallowRgb, blendT);
    writeRgb(u.uFoamColor, pal.foamRgb, blendT);

    const tod = TIME_OF_DAY_PROFILES[polish.timeOfDay];
    const sunsetMix = polish.timeOfDay === 'SUNSET' ? 1 : polish.timeOfDay === 'MORNING' ? 0.35 : 0;
    const specColorTarget: [number, number, number] =
      polish.timeOfDay === 'SUNSET'
        ? pal.sunsetAccentRgb
        : polish.timeOfDay === 'NIGHT'
          ? [0.68, 0.84, 1.0]
          : [1.0, 0.97, 0.86];
    writeRgb(u.uSpecularColor, specColorTarget, blendT);

    u.uTime = timeSec;
    u.uCameraWorldPos[0] = cameraWorldX;
    u.uCameraWorldPos[1] = cameraWorldY;
    u.uViewSize[0] = this.sprite.width;
    u.uViewSize[1] = this.sprite.height;
    u.uPixelScale = polish.quality === 'LOW' ? 3.0 : 2.0;
    u.uQualityLevel = polish.quality === 'LOW' ? 0.0 : polish.quality === 'MEDIUM' ? 1.0 : 2.0;
    u.uSunsetFactor = sunsetMix;
    u.uSpecularStrength = polish.flashEffectEnabled
      ? tod.sunSpecularStrength
      : tod.sunSpecularStrength * 0.45;

    const slots = [
      u.uIsland0,
      u.uIsland1,
      u.uIsland2,
      u.uIsland3,
      u.uIsland4,
      u.uIsland5,
      u.uIsland6,
      u.uIsland7
    ] as const;
    const count = Math.min(8, islandCircles.length);
    u.uIslandCount = count;
    for (let i = 0; i < 8; i++) {
      const target = slots[i];
      if (!target) continue;
      if (i < count) {
        const c = islandCircles[i]!;
        target[0] = c.screenX;
        target[1] = c.screenY;
        target[2] = c.radiusPx;
        target[3] = c.isGate ? 1 : 0;
      } else {
        target[0] = 0;
        target[1] = 0;
        target[2] = 0;
        target[3] = 0;
      }
    }
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.sprite.filters = [];
    this.sprite.removeFromParent();
    this.filter.destroy();
    this.sprite.destroy({ texture: false });
  }
}
