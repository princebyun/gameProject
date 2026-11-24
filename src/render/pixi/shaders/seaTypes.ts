import type { Vec2 } from '../../../core/math/vector2';
import type {
  SeaCurrentSample,
  SeaWhirlpoolSample
} from '../../../core/rpg/seaCurrentPhysics';
import type { SeaZoneId } from '../../../core/types/rpgSchemas';

export type SeaCurrentKind = 'TAILWIND' | 'HEADWIND' | 'NONE';

export interface SeaZoneWaterPalette {
  zoneId: SeaZoneId;
  deepRgb: [number, number, number];
  midRgb: [number, number, number];
  shallowRgb: [number, number, number];
  foamRgb: [number, number, number];
  sunsetAccentRgb: [number, number, number];
}

export interface OceanIslandCircleInput {
  screenX: number;
  screenY: number;
  radiusPx: number;
  isGate: boolean;
}

export interface SeaNavigationTelemetry {
  activeShipId: 'going_merry' | 'thousand_sunny';
  currentKind: SeaCurrentKind;
  currentSample: SeaCurrentSample;
  whirlpoolSample: SeaWhirlpoolSample;
  sailBillowFactor: number;
  wakeEmitMultiplier: number;
  whirlpoolDangerRatio: number;
  coreEjected: boolean;
  shipSpeedPx: number;
  shipPos: Vec2;
}
