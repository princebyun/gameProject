import type { TimeOfDayPreset } from '../../backend/renderBackend';

export type IslandParticleTheme =
  | 'PORT'
  | 'CANAL'
  | 'DESERT'
  | 'WANO_SAKURA'
  | 'EGGHEAD_CYBER'
  | 'ORANGE_SMOKE'
  | 'RAIN_STORM'
  | 'SNOW_PEAK'
  | 'SAKURA_SNOW'
  | 'SKY_CLOUD'
  | 'SPOOKY_MIST'
  | 'MARINE_ICE'
  | 'UNDERWATER_BUBBLE'
  | 'DRESSROSA_PETAL'
  | 'SUGAR_SPARKLE'
  | 'ELBAF_GOLDEN';

export interface IslandWaterReflectionPreset {
  enabled: boolean;
  waterlineWorldY: number;
  maxDistAboveWater: number;
  fullAreaReflection?: boolean;
  waveAmpMult?: number;
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

export interface IslandDistantLightningPreset {
  intervalSec: number;
  colorInt: number;
  radiusPx: number;
}

export interface IslandAtmospherePreset {
  islandId: string;
  sceneTelemetryTag: string;
  recommendedTimeOfDay: TimeOfDayPreset;
  defaultMoodBiasWhenDay?: TimeOfDayPreset;
  particleTheme: IslandParticleTheme;
  postClearEpisodeId?: string;
  postClearParticleTheme?: IslandParticleTheme;
  postClearBloomBonus?: number;
  postClearGradeTint?: [number, number, number];
  postClearAmbientNight?: number;
  allowGodRaysAtNight?: boolean;
  customGodRayHex?: number;
  groundFogColor?: number;
  groundFogAlpha?: number;
  distantLightning?: IslandDistantLightningPreset;
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

const ISLAND_PRESETS: Record<string, IslandAtmospherePreset> = {
  // --- Wave 0 & Wave 2 Core Hubs (5) ---
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
  },

  // --- Wave 4 East Blue Islands (4) ---
  orange_town: {
    islandId: 'orange_town',
    sceneTelemetryTag: 'ORANGE_TOWN_TMJ_WEBGL2',
    recommendedTimeOfDay: 'SUNSET',
    defaultMoodBiasWhenDay: 'SUNSET',
    particleTheme: 'ORANGE_SMOKE',
    waterReflection: {
      enabled: true,
      waterlineWorldY: 864,
      maxDistAboveWater: 220,
      alphaMult: 0.95,
      specularMult: 1.05
    },
    shadowScaleMult: 1.12,
    godRayAlphaMult: 1.05,
    ambientTintOverrideDay: 0xfed7aa,
    gradeTintOverride: [1.05, 0.94, 0.88],
    bloomStrengthBonus: 0.24,
    emissiveTileAlphaDay: 0.44,
    emissiveTileAlphaNight: 0.92
  },
  baratie: {
    islandId: 'baratie',
    sceneTelemetryTag: 'BARATIE_TMJ_WEBGL2',
    recommendedTimeOfDay: 'DAY',
    particleTheme: 'CANAL',
    waterReflection: {
      enabled: true,
      waterlineWorldY: 512,
      maxDistAboveWater: 480,
      fullAreaReflection: true,
      alphaMult: 1.15,
      specularMult: 1.25,
      tintRgbOverride: [0.12, 0.68, 0.94]
    },
    shadowScaleMult: 1.0,
    godRayAlphaMult: 1.15,
    bloomStrengthBonus: 0.2,
    emissiveTileAlphaDay: 0.45,
    emissiveTileAlphaNight: 0.92
  },
  arlong_park: {
    islandId: 'arlong_park',
    sceneTelemetryTag: 'ARLONG_PARK_TMJ_WEBGL2',
    recommendedTimeOfDay: 'DAY',
    particleTheme: 'PORT',
    waterReflection: {
      enabled: true,
      waterlineWorldY: 544,
      maxDistAboveWater: 280,
      alphaMult: 1.08,
      specularMult: 1.16,
      tintRgbOverride: [0.16, 0.74, 0.86],
      regionBounds: {
        minX: 280,
        maxX: 1180,
        minY: 192,
        maxY: 576
      }
    },
    shadowScaleMult: 1.1,
    godRayAlphaMult: 1.05,
    bloomStrengthBonus: 0.18,
    emissiveTileAlphaDay: 0.36,
    emissiveTileAlphaNight: 0.9
  },
  loguetown: {
    islandId: 'loguetown',
    sceneTelemetryTag: 'LOGUETOWN_TMJ_WEBGL2',
    recommendedTimeOfDay: 'SUNSET',
    defaultMoodBiasWhenDay: 'SUNSET',
    particleTheme: 'RAIN_STORM',
    distantLightning: {
      intervalSec: 4.2,
      colorInt: 0xe0f2fe,
      radiusPx: 260
    },
    waterReflection: {
      enabled: true,
      waterlineWorldY: 896,
      maxDistAboveWater: 540,
      fullAreaReflection: true,
      waveAmpMult: 0.35,
      alphaMult: 0.4,
      specularMult: 1.15,
      tintRgbOverride: [0.24, 0.48, 0.72]
    },
    shadowScaleMult: 0.9,
    godRayAlphaMult: 0.55,
    ambientTintOverrideDay: 0x94a3b8,
    ambientTintOverrideNight: 0x1e293b,
    gradeTintOverride: [0.84, 0.9, 1.0],
    bloomStrengthBonus: 0.28,
    emissiveTileAlphaDay: 0.55,
    emissiveTileAlphaNight: 0.96,
    neonPulseWhenFlashDisabled: 0.08
  },

  // --- Wave 4 Grand Line Islands (4) ---
  drum_kingdom: {
    islandId: 'drum_kingdom',
    sceneTelemetryTag: 'DRUM_KINGDOM_TMJ_WEBGL2',
    recommendedTimeOfDay: 'DAY',
    particleTheme: 'SNOW_PEAK',
    postClearEpisodeId: 'ep_drum_kingdom',
    postClearParticleTheme: 'SAKURA_SNOW',
    postClearBloomBonus: 0.28,
    postClearGradeTint: [1.06, 0.9, 1.04],
    postClearAmbientNight: 0x3b1d45,
    waterReflection: {
      enabled: true,
      waterlineWorldY: 992,
      maxDistAboveWater: 220,
      alphaMult: 0.78,
      specularMult: 1.18,
      tintRgbOverride: [0.58, 0.78, 0.94]
    },
    shadowScaleMult: 1.12,
    godRayAlphaMult: 0.9,
    ambientTintOverrideDay: 0xe2eefc,
    ambientTintOverrideNight: 0x1e3a5f,
    gradeTintOverride: [0.92, 0.96, 1.04],
    bloomStrengthBonus: 0.24,
    emissiveTileAlphaDay: 0.42,
    emissiveTileAlphaNight: 0.94
  },
  skypiea: {
    islandId: 'skypiea',
    sceneTelemetryTag: 'SKYPIEA_TMJ_WEBGL2',
    recommendedTimeOfDay: 'DAY',
    particleTheme: 'SKY_CLOUD',
    waterReflection: {
      enabled: true,
      waterlineWorldY: 1024,
      maxDistAboveWater: 260,
      alphaMult: 0.72,
      specularMult: 1.35,
      tintRgbOverride: [0.76, 0.9, 1.0]
    },
    shadowScaleMult: 0.95,
    godRayAlphaMult: 1.45,
    ambientTintOverrideDay: 0xfffbe6,
    gradeTintOverride: [1.04, 1.02, 0.96],
    bloomStrengthBonus: 0.34,
    emissiveTileAlphaDay: 0.56,
    emissiveTileAlphaNight: 0.95
  },
  thriller_bark: {
    islandId: 'thriller_bark',
    sceneTelemetryTag: 'THRILLER_BARK_TMJ_WEBGL2',
    recommendedTimeOfDay: 'NIGHT',
    defaultMoodBiasWhenDay: 'NIGHT',
    particleTheme: 'SPOOKY_MIST',
    groundFogColor: 0x4c1d95,
    groundFogAlpha: 0.22,
    waterReflection: {
      enabled: true,
      waterlineWorldY: 992,
      maxDistAboveWater: 240,
      alphaMult: 0.65,
      specularMult: 0.82,
      tintRgbOverride: [0.42, 0.22, 0.62]
    },
    shadowScaleMult: 1.35,
    godRayAlphaMult: 0.35,
    ambientTintOverrideDay: 0x3b2d5c,
    ambientTintOverrideNight: 0x1c1433,
    gradeTintOverride: [0.88, 0.82, 1.06],
    bloomStrengthBonus: 0.38,
    emissiveTileAlphaDay: 0.75,
    emissiveTileAlphaNight: 1.0
  },
  marineford: {
    islandId: 'marineford',
    sceneTelemetryTag: 'MARINEFORD_TMJ_WEBGL2',
    recommendedTimeOfDay: 'SUNSET',
    defaultMoodBiasWhenDay: 'SUNSET',
    particleTheme: 'MARINE_ICE',
    waterReflection: {
      enabled: true,
      waterlineWorldY: 928,
      maxDistAboveWater: 280,
      waveAmpMult: 0.45,
      alphaMult: 0.5,
      specularMult: 1.24,
      tintRgbOverride: [0.42, 0.72, 0.94]
    },
    shadowScaleMult: 1.2,
    godRayAlphaMult: 0.88,
    ambientTintOverrideDay: 0xcbd5e1,
    ambientTintOverrideNight: 0x1e293b,
    bloomStrengthBonus: 0.3,
    emissiveTileAlphaDay: 0.55,
    emissiveTileAlphaNight: 0.96
  },

  // --- Wave 4 New World Islands (4) ---
  fishman_island: {
    islandId: 'fishman_island',
    sceneTelemetryTag: 'FISHMAN_ISLAND_TMJ_WEBGL2',
    recommendedTimeOfDay: 'NIGHT',
    defaultMoodBiasWhenDay: 'NIGHT',
    particleTheme: 'UNDERWATER_BUBBLE',
    allowGodRaysAtNight: true,
    customGodRayHex: 0x5eead4,
    waterReflection: {
      enabled: true,
      waterlineWorldY: 896,
      maxDistAboveWater: 280,
      alphaMult: 1.06,
      specularMult: 1.28,
      tintRgbOverride: [0.1, 0.82, 0.86]
    },
    shadowScaleMult: 0.9,
    godRayAlphaMult: 1.28,
    ambientTintOverrideDay: 0x5eead4,
    ambientTintOverrideNight: 0x0f3b5c,
    gradeTintOverride: [0.78, 0.98, 1.06],
    bloomStrengthBonus: 0.4,
    emissiveTileAlphaDay: 0.72,
    emissiveTileAlphaNight: 0.98
  },
  dressrosa: {
    islandId: 'dressrosa',
    sceneTelemetryTag: 'DRESSROSA_TMJ_WEBGL2',
    recommendedTimeOfDay: 'DAY',
    particleTheme: 'DRESSROSA_PETAL',
    waterReflection: {
      enabled: true,
      waterlineWorldY: 1024,
      maxDistAboveWater: 260,
      alphaMult: 0.92,
      specularMult: 1.18,
      tintRgbOverride: [0.22, 0.7, 0.88]
    },
    shadowScaleMult: 1.3,
    godRayAlphaMult: 1.28,
    ambientTintOverrideDay: 0xffe9c8,
    gradeTintOverride: [1.05, 0.97, 0.92],
    bloomStrengthBonus: 0.24,
    emissiveTileAlphaDay: 0.42,
    emissiveTileAlphaNight: 0.94
  },
  totto_land: {
    islandId: 'totto_land',
    sceneTelemetryTag: 'TOTTO_LAND_TMJ_WEBGL2',
    recommendedTimeOfDay: 'SUNSET',
    defaultMoodBiasWhenDay: 'SUNSET',
    particleTheme: 'SUGAR_SPARKLE',
    waterReflection: {
      enabled: true,
      waterlineWorldY: 896,
      maxDistAboveWater: 540,
      fullAreaReflection: true,
      waveAmpMult: 0.22,
      alphaMult: 0.62,
      specularMult: 1.32,
      tintRgbOverride: [0.88, 0.48, 0.76]
    },
    shadowScaleMult: 1.05,
    godRayAlphaMult: 1.12,
    ambientTintOverrideDay: 0xfce7f3,
    gradeTintOverride: [1.05, 0.94, 1.03],
    bloomStrengthBonus: 0.34,
    emissiveTileAlphaDay: 0.56,
    emissiveTileAlphaNight: 0.96
  },
  elbaf: {
    islandId: 'elbaf',
    sceneTelemetryTag: 'ELBAF_TMJ_WEBGL2',
    recommendedTimeOfDay: 'SUNSET',
    defaultMoodBiasWhenDay: 'SUNSET',
    particleTheme: 'ELBAF_GOLDEN',
    allowGodRaysAtNight: true,
    customGodRayHex: 0x34d399,
    waterReflection: {
      enabled: true,
      waterlineWorldY: 1088,
      maxDistAboveWater: 260,
      alphaMult: 0.84,
      specularMult: 1.15,
      tintRgbOverride: [0.56, 0.78, 0.42]
    },
    shadowScaleMult: 1.4,
    godRayAlphaMult: 1.38,
    ambientTintOverrideDay: 0xfef3c7,
    ambientTintOverrideNight: 0x1e3226,
    gradeTintOverride: [1.04, 1.02, 0.9],
    bloomStrengthBonus: 0.34,
    emissiveTileAlphaDay: 0.62,
    emissiveTileAlphaNight: 0.98
  }
};

export function getIslandAtmospherePreset(islandId: string): IslandAtmospherePreset {
  const exact = ISLAND_PRESETS[islandId];
  if (exact) return exact;
  return {
    ...ISLAND_PRESETS.foosha_shells!,
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
