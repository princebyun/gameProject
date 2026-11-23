import { UniformGroup, type Filter } from 'pixi.js';
import type { VisualPolishConfig } from '../../backend/renderBackend';
import { createGlslFilter } from './glslUtils';

const SELECTIVE_BLOOM_FRAG = /* glsl */ `
in vec2 vTextureCoord;
out vec4 finalColor;

uniform sampler2D uTexture;
uniform float uThreshold;
uniform float uIntensity;
uniform vec2 uTexelStep;

vec3 extractBright(vec2 uv, float thresh) {
    vec4 s = texture(uTexture, clamp(uv, vec2(0.001), vec2(0.999)));
    float lum = dot(s.rgb, vec3(0.299, 0.587, 0.114));
    float weight = smoothstep(thresh, thresh + 0.35, max(lum, s.a * 0.85));
    return s.rgb * weight;
}

void main(void) {
    vec4 base = texture(uTexture, vTextureCoord);
    vec3 bloom = extractBright(vTextureCoord, uThreshold) * 0.24;

    bloom += extractBright(vTextureCoord + vec2(uTexelStep.x, 0.0), uThreshold) * 0.13;
    bloom += extractBright(vTextureCoord - vec2(uTexelStep.x, 0.0), uThreshold) * 0.13;
    bloom += extractBright(vTextureCoord + vec2(0.0, uTexelStep.y), uThreshold) * 0.13;
    bloom += extractBright(vTextureCoord - vec2(0.0, uTexelStep.y), uThreshold) * 0.13;

    bloom += extractBright(vTextureCoord + vec2(uTexelStep.x, uTexelStep.y) * 1.6, uThreshold) * 0.06;
    bloom += extractBright(vTextureCoord + vec2(-uTexelStep.x, uTexelStep.y) * 1.6, uThreshold) * 0.06;
    bloom += extractBright(vTextureCoord + vec2(uTexelStep.x, -uTexelStep.y) * 1.6, uThreshold) * 0.06;
    bloom += extractBright(vTextureCoord + vec2(-uTexelStep.x, -uTexelStep.y) * 1.6, uThreshold) * 0.06;

    vec3 glow = bloom * uIntensity;
    float glowAlpha = max(base.a, min(1.0, max(glow.r, max(glow.g, glow.b))));
    finalColor = vec4(base.rgb + glow, glowAlpha);
}
`;

export function computeEffectiveBloomIntensity(
  polish: Pick<VisualPolishConfig, 'selectiveBloom' | 'quality' | 'flashEffectEnabled'>,
  desiredIntensity = 1.05,
  flashSpike = 0
): { enabled: boolean; intensity: number; spread: number } {
  if (!polish.selectiveBloom || polish.quality === 'LOW') {
    return { enabled: false, intensity: 0, spread: 0 };
  }
  const safeSpike = polish.flashEffectEnabled ? Math.max(0, flashSpike) : 0;
  const maxCap = polish.flashEffectEnabled ? 1.85 : 0.45;
  const qualityScale = polish.quality === 'MEDIUM' ? 0.72 : 1.0;
  const intensity = Math.min(maxCap, (desiredIntensity + safeSpike) * qualityScale);
  const spread = polish.quality === 'MEDIUM' ? 1.6 : 2.3;
  return { enabled: true, intensity, spread };
}

export class SelectiveBloomEffect {
  public readonly filter: Filter;
  private readonly uniforms: UniformGroup<{
    uThreshold: { value: number; type: 'f32' };
    uIntensity: { value: number; type: 'f32' };
    uTexelStep: { value: Float32Array; type: 'vec2<f32>' };
  }>;

  constructor() {
    this.uniforms = new UniformGroup({
      uThreshold: { value: 0.22, type: 'f32' },
      uIntensity: { value: 1.05, type: 'f32' },
      uTexelStep: { value: new Float32Array([2.3 / 960, 2.3 / 540]), type: 'vec2<f32>' }
    });

    this.filter = createGlslFilter({
      name: 'opgv-selective-bloom-filter',
      fragment: SELECTIVE_BLOOM_FRAG,
      resources: {
        bloomUniforms: this.uniforms
      },
      padding: 10
    });
  }

  public sync(
    polish: VisualPolishConfig,
    viewW: number,
    viewH: number,
    threshold = 0.2,
    desiredIntensity = 1.05,
    flashSpike = 0
  ): void {
    const resolved = computeEffectiveBloomIntensity(polish, desiredIntensity, flashSpike);
    this.filter.enabled = resolved.enabled;
    if (!resolved.enabled) return;

    this.uniforms.uniforms.uThreshold = threshold;
    this.uniforms.uniforms.uIntensity = resolved.intensity;
    const step = this.uniforms.uniforms.uTexelStep;
    step[0] = resolved.spread / Math.max(64, viewW);
    step[1] = resolved.spread / Math.max(64, viewH);
  }

  public dispose(): void {
    this.filter.destroy();
  }
}
