import { UniformGroup, type Filter } from 'pixi.js';
import type { VisualPolishConfig } from '../../backend/renderBackend';
import { createGlslFilter, TIME_OF_DAY_PROFILES } from './glslUtils';

const COLOR_GRADING_FRAG = /* glsl */ `
in vec2 vTextureCoord;
out vec4 finalColor;

uniform sampler2D uTexture;
uniform vec3 uTint;
uniform float uTintMix;
uniform float uContrast;
uniform float uSaturation;
uniform float uVignetteStrength;

void main(void) {
    vec4 src = texture(uTexture, vTextureCoord);
    vec3 col = src.rgb;
    if (src.a > 0.0001) {
        col /= src.a;
    }

    float luma = dot(col, vec3(0.299, 0.587, 0.114));
    col = mix(vec3(luma), col, uSaturation);
    col = (col - 0.5) * uContrast + 0.5;
    col = mix(col, col * uTint, uTintMix);

    vec2 centered = vTextureCoord - vec2(0.5);
    float vig = 1.0 - dot(centered, centered) * (1.8 * uVignetteStrength);
    col *= clamp(vig, 0.35, 1.0);

    col = clamp(col, 0.0, 1.0) * src.a;
    finalColor = vec4(col, src.a);
}
`;

export class AtmosphereColorGradingEffect {
  public readonly filter: Filter;
  private readonly uniforms: UniformGroup<{
    uTint: { value: Float32Array; type: 'vec3<f32>' };
    uTintMix: { value: number; type: 'f32' };
    uContrast: { value: number; type: 'f32' };
    uSaturation: { value: number; type: 'f32' };
    uVignetteStrength: { value: number; type: 'f32' };
  }>;

  constructor() {
    this.uniforms = new UniformGroup({
      uTint: { value: new Float32Array([1, 1, 1]), type: 'vec3<f32>' },
      uTintMix: { value: 0.04, type: 'f32' },
      uContrast: { value: 1.03, type: 'f32' },
      uSaturation: { value: 1.06, type: 'f32' },
      uVignetteStrength: { value: 0.1, type: 'f32' }
    });

    this.filter = createGlslFilter({
      name: 'opgv-color-grading-filter',
      fragment: COLOR_GRADING_FRAG,
      resources: {
        gradeUniforms: this.uniforms
      },
      padding: 0
    });
  }

  public sync(
    polish: VisualPolishConfig,
    tintOverrideRgb?: [number, number, number]
  ): void {
    this.filter.enabled = polish.colorGrading;
    if (!polish.colorGrading) return;

    const p = TIME_OF_DAY_PROFILES[polish.timeOfDay];
    const tint = this.uniforms.uniforms.uTint;
    if (tintOverrideRgb) {
      tint[0] = p.gradeTintRgb[0] * 0.5 + tintOverrideRgb[0] * 0.5;
      tint[1] = p.gradeTintRgb[1] * 0.5 + tintOverrideRgb[1] * 0.5;
      tint[2] = p.gradeTintRgb[2] * 0.5 + tintOverrideRgb[2] * 0.5;
      this.uniforms.uniforms.uTintMix = Math.max(p.gradeTintMix, 0.18);
    } else {
      tint[0] = p.gradeTintRgb[0];
      tint[1] = p.gradeTintRgb[1];
      tint[2] = p.gradeTintRgb[2];
      this.uniforms.uniforms.uTintMix = p.gradeTintMix;
    }
    this.uniforms.uniforms.uContrast = p.gradeContrast;
    this.uniforms.uniforms.uSaturation = p.gradeSaturation;
    this.uniforms.uniforms.uVignetteStrength =
      polish.quality === 'LOW' ? 0 : p.vignetteStrength;
  }

  public dispose(): void {
    this.filter.destroy();
  }
}
