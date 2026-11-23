import {
  defaultFilterVert,
  Filter,
  GlProgram,
  type FilterOptions,
  type ShaderFromResources
} from 'pixi.js';
import type { TimeOfDayPreset } from '../../backend/renderBackend';

export interface SunShadowTransform {
  skewX: number;
  scaleY: number;
  alpha: number;
  offsetX: number;
  offsetY: number;
}

export interface TimeOfDayAtmosphereProfile {
  ambientRgb: [number, number, number];
  ambientHex: number;
  ambientAlphaBoost: number;
  lanternIntensityMult: number;
  sunShadow: SunShadowTransform;
  godRayAlpha: number;
  godRayHex: number;
  gradeTintRgb: [number, number, number];
  gradeTintMix: number;
  gradeContrast: number;
  gradeSaturation: number;
  vignetteStrength: number;
  waterTintRgb: [number, number, number];
  sunSpecularStrength: number;
}

export const TIME_OF_DAY_PROFILES: Record<TimeOfDayPreset, TimeOfDayAtmosphereProfile> = {
  MORNING: {
    ambientRgb: [0.98, 0.88, 0.72],
    ambientHex: 0xfadfa8,
    ambientAlphaBoost: 0.92,
    lanternIntensityMult: 0.55,
    sunShadow: { skewX: -0.45, scaleY: 0.48, alpha: 0.34, offsetX: -6, offsetY: 2 },
    godRayAlpha: 0.24,
    godRayHex: 0xfde68a,
    gradeTintRgb: [1.0, 0.92, 0.78],
    gradeTintMix: 0.14,
    gradeContrast: 1.04,
    gradeSaturation: 1.08,
    vignetteStrength: 0.14,
    waterTintRgb: [0.22, 0.74, 0.94],
    sunSpecularStrength: 0.75
  },
  DAY: {
    ambientRgb: [0.95, 0.97, 1.0],
    ambientHex: 0xf2f7ff,
    ambientAlphaBoost: 1.0,
    lanternIntensityMult: 0.35,
    sunShadow: { skewX: -0.1, scaleY: 0.36, alpha: 0.32, offsetX: -1, offsetY: 2 },
    godRayAlpha: 0.14,
    godRayHex: 0xfef9c3,
    gradeTintRgb: [0.98, 1.0, 1.02],
    gradeTintMix: 0.04,
    gradeContrast: 1.03,
    gradeSaturation: 1.06,
    vignetteStrength: 0.1,
    waterTintRgb: [0.16, 0.68, 0.92],
    sunSpecularStrength: 0.65
  },
  SUNSET: {
    ambientRgb: [0.88, 0.52, 0.44],
    ambientHex: 0xe08470,
    ambientAlphaBoost: 0.82,
    lanternIntensityMult: 1.25,
    sunShadow: { skewX: 0.65, scaleY: 0.56, alpha: 0.38, offsetX: 8, offsetY: 2 },
    godRayAlpha: 0.26,
    godRayHex: 0xfb923c,
    gradeTintRgb: [1.0, 0.62, 0.42],
    gradeTintMix: 0.24,
    gradeContrast: 1.08,
    gradeSaturation: 1.12,
    vignetteStrength: 0.24,
    waterTintRgb: [0.92, 0.48, 0.38],
    sunSpecularStrength: 0.95
  },
  NIGHT: {
    ambientRgb: [0.24, 0.3, 0.52],
    ambientHex: 0x3d4c85,
    ambientAlphaBoost: 0.72,
    lanternIntensityMult: 1.85,
    sunShadow: { skewX: 0.0, scaleY: 0.32, alpha: 0.24, offsetX: 0, offsetY: 2 },
    godRayAlpha: 0.0,
    godRayHex: 0x93c5fd,
    gradeTintRgb: [0.35, 0.48, 0.88],
    gradeTintMix: 0.28,
    gradeContrast: 1.1,
    gradeSaturation: 0.92,
    vignetteStrength: 0.36,
    waterTintRgb: [0.12, 0.28, 0.56],
    sunSpecularStrength: 0.5
  }
};

export function hexIntToRgbFloats(hexInt: number): [number, number, number] {
  const r = ((hexInt >> 16) & 0xff) / 255;
  const g = ((hexInt >> 8) & 0xff) / 255;
  const b = (hexInt & 0xff) / 255;
  return [r, g, b];
}

export function createGlslFilter(options: {
  name: string;
  fragment: string;
  resources: ShaderFromResources['resources'];
  padding?: number;
  resolution?: number | 'inherit';
}): Filter {
  const glProgram = GlProgram.from({
    vertex: defaultFilterVert,
    fragment: options.fragment,
    name: options.name
  });

  const filterOpts: FilterOptions & {
    glProgram: GlProgram;
    resources: ShaderFromResources['resources'];
  } = {
    glProgram,
    resources: options.resources,
    antialias: false,
    ...(options.padding !== undefined ? { padding: options.padding } : {}),
    ...(options.resolution !== undefined ? { resolution: options.resolution } : {})
  };
  return new Filter(filterOpts);
}
