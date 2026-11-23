import { UniformGroup, type Filter } from 'pixi.js';
import type { VisualPolishConfig } from '../../backend/renderBackend';
import { createGlslFilter } from './glslUtils';

const SHOCKWAVE_FRAG = /* glsl */ `
in vec2 vTextureCoord;
out vec4 finalColor;

uniform sampler2D uTexture;
uniform vec2 uCenter;
uniform float uRadius;
uniform float uWidth;
uniform float uAmplitude;
uniform float uAspect;

void main(void) {
    vec2 diff = vTextureCoord - uCenter;
    vec2 scaled = vec2(diff.x * uAspect, diff.y);
    float dist = length(scaled);

    float halfW = max(0.01, uWidth * 0.5);
    float edge = abs(dist - uRadius);
    float mask = smoothstep(halfW, 0.0, edge);

    vec2 dir = dist > 0.0001 ? scaled / dist : vec2(0.0);
    vec2 offset = vec2(dir.x / max(0.5, uAspect), dir.y) * (mask * uAmplitude);

    vec4 col = texture(uTexture, clamp(vTextureCoord - offset, vec2(0.001), vec2(0.999)));
    // Subtle chromatic highlight ring on wave crest
    col.rgb += vec3(0.28, 0.42, 0.65) * mask * (uAmplitude * 18.0) * col.a;
    finalColor = col;
}
`;

export class ShockwaveDistortionEffect {
  public readonly filter: Filter;
  private readonly uniforms: UniformGroup<{
    uCenter: { value: Float32Array; type: 'vec2<f32>' };
    uRadius: { value: number; type: 'f32' };
    uWidth: { value: number; type: 'f32' };
    uAmplitude: { value: number; type: 'f32' };
    uAspect: { value: number; type: 'f32' };
  }>;
  private active = false;
  private elapsedSec = 0;
  private durationSec = 0.42;

  constructor() {
    this.uniforms = new UniformGroup({
      uCenter: { value: new Float32Array([0.5, 0.5]), type: 'vec2<f32>' },
      uRadius: { value: 0.01, type: 'f32' },
      uWidth: { value: 0.09, type: 'f32' },
      uAmplitude: { value: 0.025, type: 'f32' },
      uAspect: { value: 16 / 9, type: 'f32' }
    });

    this.filter = createGlslFilter({
      name: 'opgv-shockwave-distortion-filter',
      fragment: SHOCKWAVE_FRAG,
      resources: {
        shockUniforms: this.uniforms
      },
      padding: 0
    });
    this.filter.enabled = false;
  }

  public get isActive(): boolean {
    return this.active;
  }

  public trigger(normX: number, normY: number, durationSec = 0.42): void {
    this.active = true;
    this.elapsedSec = 0;
    this.durationSec = Math.max(0.18, durationSec);
    const c = this.uniforms.uniforms.uCenter;
    c[0] = Math.min(0.95, Math.max(0.05, normX));
    c[1] = Math.min(0.95, Math.max(0.05, normY));
  }

  public step(dtSec: number, viewW: number, viewH: number, polish: VisualPolishConfig): void {
    if (!this.active || polish.quality === 'LOW' || !polish.flashEffectEnabled) {
      if (polish.quality === 'LOW' || !polish.flashEffectEnabled) {
        this.active = false;
      }
      this.filter.enabled = false;
      return;
    }

    this.elapsedSec += Math.max(0, dtSec);
    const progress = this.elapsedSec / this.durationSec;
    if (progress >= 1) {
      this.active = false;
      this.filter.enabled = false;
      return;
    }

    this.filter.enabled = true;
    this.uniforms.uniforms.uAspect = Math.max(0.5, viewW / Math.max(1, viewH));
    this.uniforms.uniforms.uRadius = 0.02 + progress * 0.65;
    this.uniforms.uniforms.uWidth = 0.11 * (1 - progress * 0.45);
    this.uniforms.uniforms.uAmplitude = 0.028 * (1 - progress);
  }

  public dispose(): void {
    this.filter.destroy();
  }
}
