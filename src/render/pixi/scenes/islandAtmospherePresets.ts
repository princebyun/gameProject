import type { TimeOfDayPreset } from '../../backend/renderBackend';

export type IslandParticleTheme =
  | 'PORT'
  | 'CANAL'
  | 'DESERT'
  | 'WANO_SAKURA'
  | 'EGGHEAD_CYBER';

export interface IslandWaterReflectionPreset {
  enabled: boolean;
  waterlineWorldY: number;
  maxDistAboveWater: number;
  alphaMult: number;
  specularMult: number;
  tintRgbOverride?: [number, number, number];
  regionBounds?: {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
  };
}

export interface IslandAtmospherePreset {
  islandId: string;
  sceneTelemetryTag: string;
  recommendedTimeOfDay: TimeOfDayPreset;
  defaultMoodBiasWhenDay?: TimeOfDayPreset;
  particleTheme: IslandParticleTheme;
  waterReflection: IslandWaterReflectionPreset;
  shadowScaleMult: number;
  godRayAlphaMult: number;
  ambientTintOverrideDay?: number;
  ambientTintOverrideNight?: number;
  gradeTintOverride?: [number, number, number];
  bloomStrengthBonus: number;
  emissiveTileAlphaDay: number;
  emissiveTileAlphaNight: number;
  neonPulseWhenFlashDisabled?: number;
}

const HUB_PRESETS: Record<string, IslandAtmospherePreset> = {
  foosha_shells: {
    islandId: 'foosha_shells',
    sceneTelemetryTag: 'FOOSHA_TMJ_WEBGL2',
    recommendedTimeOfDay: 'DAY',
    particleTheme: 'PORT',
    waterReflection: {
      enabled: true,
      waterlineWorldY: 928,
      maxDistAboveWater: 240,
      alphaMult: 1.0,
      specularMult: 1.0
    },
    shadowScaleMult: 1.0,
    godRayAlphaMult: 1.0,
    bloomStrengthBonus: 0.0,
    emissiveTileAlphaDay: 0.35,
    emissiveTileAlphaNight: 0.85
  },
  water_seven: {
    islandId: 'water_seven',
    sceneTelemetryTag: 'WATER_SEVEN_TMJ_WEBGL2',
    recommendedTimeOfDay: 'DAY',
    particleTheme: 'CANAL',
    waterReflection: {
      enabled: true,
      waterlineWorldY: 608,
      maxDistAboveWater: 340,
      alphaMult: 1.08,
      specularMult: 1.15,
      tintRgbOverride: [0.14, 0.72, 0.9]
    },
    shadowScaleMult: 1.05,
    godRayAlphaMult: 1.0,
    bloomStrengthBonus: 0.22,
    emissiveTileAlphaDay: 0.4,
    emissiveTileAlphaNight: 0.92
  },
  alabasta: {
    islandId: 'alabasta',
    sceneTelemetryTag: 'ALABASTA_TMJ_WEBGL2',
    recommendedTimeOfDay: 'DAY',
    particleTheme: 'DESERT',
    waterReflection: {
      enabled: true,
      waterlineWorldY: 672,
      maxDistAboveWater: 160,
      alphaMult: 0.9,
      specularMult: 1.25,
      tintRgbOverride: [0.22, 0.78, 0.76],
      regionBounds: {
        minX: 992,
        maxX: 1504,
        minY: 512,
        maxY: 768
      }
    },
    shadowScaleMult: 1.55,
    godRayAlphaMult: 1.35,
    ambientTintOverrideDay: 0xffefd2,
    ambientTintOverrideNight: 0x26315e,
    bloomStrengthBonus: 0.18,
    emissiveTileAlphaDay: 0.28,
    emissiveTileAlphaNight: 0.95
  },
  wano_onigashima: {
    islandId: 'wano_onigashima',
    sceneTelemetryTag: 'WANO_COUNTRY_TMJ_WEBGL2',
    recommendedTimeOfDay: 'SUNSET',
    defaultMoodBiasWhenDay: 'SUNSET',
    particleTheme: 'WANO_SAKURA',
    waterReflection: {
      enabled: true,
      waterlineWorldY: 768,
      maxDistAboveWater: 210,
      alphaMult: 0.88,
      specularMult: 0.85,
      tintRgbOverride: [0.76, 0.42, 0.44],
      regionBounds: {
        minX: 96,
        maxX: 544,
        minY: 608,
        maxY: 896
      }
    },
    shadowScaleMult: 1.25,
    godRayAlphaMult: 1.1,
    bloomStrengthBonus: 0.32,
    emissiveTileAlphaDay: 0.72,
    emissiveTileAlphaNight: 0.96
  },
  egghead: {
    islandId: 'egghead',
    sceneTelemetryTag: 'EGGHEAD_TMJ_WEBGL2',
    recommendedTimeOfDay: 'NIGHT',
    particleTheme: 'EGGHEAD_CYBER',
    waterReflection: {
      enabled: true,
      waterlineWorldY: 1120,
      maxDistAboveWater: 260,
      alphaMult: 0.42,
      specularMult: 1.3,
      tintRgbOverride: [0.28, 0.82, 0.98]
    },
    shadowScaleMult: 0.85,
    godRayAlphaMult: 0.65,
    ambientTintOverrideDay: 0x9ec5e8,
    ambientTintOverrideNight: 0x243b6b,
    gradeTintOverride: [0.76, 0.92, 1.0],
    bloomStrengthBonus: 0.48,
    emissiveTileAlphaDay: 0.85,
    emissiveTileAlphaNight: 1.0,
    neonPulseWhenFlashDisabled: 0.15
  }
};

export function getIslandAtmospherePreset(islandId: string): IslandAtmospherePreset {
  const exact = HUB_PRESETS[islandId];
  if (exact) return exact;
  return {
    ...HUB_PRESETS.foosha_shells!,
    islandId,
    sceneTelemetryTag: `${islandId.toUpperCase()}_TMJ_WEBGL2`
  };
}

export function isLightActiveForTimeOfDay(
  activeTimeMask: string | undefined,
  timeOfDay: TimeOfDayPreset
): boolean {
  if (!activeTimeMask) return true;
  const upper = activeTimeMask.trim().toUpperCase();
  if (!upper || upper === 'ALL') return true;
  return upper
    .split(/[|,;\s]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .includes(timeOfDay);
}
