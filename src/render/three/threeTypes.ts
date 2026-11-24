/**
 * Core types, projection helpers, and tuning configs for the 3D Cel-Shading Musou engine.
 * Kept dependency-free so scene controllers, HUDs, and core-independent adapters can share them.
 */

export const WORLD_SCALE_2D_TO_3D = 0.04;
export const ARENA_2D_CENTER_X = 480;
export const ARENA_2D_CENTER_Y = 270;

export type MusouAnimState =
  | 'Idle'
  | 'Run'
  | 'Dash'
  | 'Combo1'
  | 'Combo2'
  | 'Combo3'
  | 'Combo4'
  | 'AirLaunch'
  | 'AirCombo1'
  | 'AirCombo2'
  | 'AirSlam'
  | 'SpecialWindup'
  | 'SpecialRelease'
  | 'Guard'
  | 'Parry'
  | 'Hit'
  | 'Knockback'
  | 'Down';

export const ALL_MUSOU_ANIM_STATES: readonly MusouAnimState[] = [
  'Idle',
  'Run',
  'Dash',
  'Combo1',
  'Combo2',
  'Combo3',
  'Combo4',
  'AirLaunch',
  'AirCombo1',
  'AirCombo2',
  'AirSlam',
  'SpecialWindup',
  'SpecialRelease',
  'Guard',
  'Parry',
  'Hit',
  'Knockback',
  'Down'
];

export type HakiAuraMode = 'NONE' | 'BUSO' | 'HAO' | 'GEAR5';

export type ThreeQualityTier = 'LOW' | 'MEDIUM' | 'HIGH';

export interface ThreeToonTuningConfig {
  celSteps: 2 | 3 | 4;
  shadowShiftStrength: number;
  outlineWidth: number;
  rimIntensity: number;
  bloomStrength: number;
  speedlinesOpacity: number;
  hordeTargetCount: 30 | 60 | 100;
  hitstopTicks: number;
}

export const DEFAULT_THREE_TOON_TUNING: ThreeToonTuningConfig = {
  celSteps: 3,
  shadowShiftStrength: 0.42,
  outlineWidth: 0.028,
  rimIntensity: 0.65,
  bloomStrength: 0.38,
  speedlinesOpacity: 0.78,
  hordeTargetCount: 100,
  hitstopTicks: 4
};

export interface ThreeTelemetrySnapshot {
  active: boolean;
  fps: number;
  frameTimeMs: number;
  drawCalls: number;
  triangles: number;
  geometries: number;
  textures: number;
  programs: number;
  hordeActiveCount: number;
  koCount: number;
  quality: ThreeQualityTier;
  speedlinesAlpha: number;
}

export interface MusouCounterSnapshot {
  koCount: number;
  hitComboCount: number;
  hitComboTimer: number;
  lockedBossUnitId: string | null;
  lockedBossName: string | null;
  destructiblesRemaining: number;
  destructiblesTotal: number;
}

export interface Vector3Like {
  x: number;
  y: number;
  z: number;
}

/**
 * Unidirectional projection from deterministic 2D core coordinates (960x540) to 3D ground (x, z)
 * plus 3D vertical altitude y.
 */
export function project2DTo3D(x2d: number, y2d: number, altitudeY = 0): Vector3Like {
  return {
    x: (x2d - ARENA_2D_CENTER_X) * WORLD_SCALE_2D_TO_3D,
    y: altitudeY,
    z: (y2d - ARENA_2D_CENTER_Y) * WORLD_SCALE_2D_TO_3D
  };
}
