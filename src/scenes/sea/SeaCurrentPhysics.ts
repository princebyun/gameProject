import { clamp, type Vec2 } from '../../core/math/vector2';
import { computeCrewRoleBonuses } from '../../core/rpg/crewAndBountyEngine';
import { stepSeaSailing } from '../../core/rpg/sailingPhysics';
import {
  resolveActiveShipId,
  sampleSeaCurrentAt,
  sampleWhirlpoolAt,
  type SeaCurrentSample,
  type SeaWhirlpoolSample
} from '../../core/rpg/seaCurrentPhysics';
import type {
  RpgCampaignState,
  RpgDataRegistry,
  SeaZoneDefinition
} from '../../core/types/rpgSchemas';
import type {
  SeaCurrentKind,
  SeaNavigationTelemetry
} from '../../render/pixi/shaders/seaTypes';

export type { SeaCurrentKind, SeaNavigationTelemetry };

export const SEA_CURRENT_TAILWIND_MAX_BONUS = 0.35;
export const SEA_CURRENT_HEADWIND_MAX_PENALTY = 0.20;
export const WHIRLPOOL_CORE_ESCAPE_MARGIN_PX = 14;

export function resolveEffectiveCurrentResist(
  state: RpgCampaignState,
  rpgRegistry?: RpgDataRegistry
): number {
  if (!rpgRegistry) return 0;
  const activeShipId = resolveActiveShipId(state);
  const shipDef =
    rpgRegistry.ships[activeShipId] ??
    rpgRegistry.ships['going_merry'] ??
    Object.values(rpgRegistry.ships)[0];
  if (!shipDef) return 0;
  const roleBonuses = computeCrewRoleBonuses(state, rpgRegistry);
  return Math.min(
    0.95,
    shipDef.currentResistance +
      (1 - shipDef.currentResistance) * roleBonuses.currentAndStormDriftResist
  );
}

/**
 * Scene-layer adapter over immutable `src/core/rpg/seaCurrentPhysics.ts`.
 * Computes real-time speed/drift/whirlpool anti-trap physics telemetry for WebGL2
 * sail billowing, wake foam density, and bow lantern light sync.
 */
export function evaluateSeaNavigationTelemetry(
  state: RpgCampaignState,
  zone: SeaZoneDefinition,
  headingOverride?: Vec2,
  rpgRegistry?: RpgDataRegistry
): SeaNavigationTelemetry {
  const activeShipId = resolveActiveShipId(state);
  const effectiveResist = resolveEffectiveCurrentResist(state, rpgRegistry);
  const headingVec: Vec2 = headingOverride ?? {
    x: Math.cos(state.ship.headingRad),
    y: Math.sin(state.ship.headingRad)
  };
  const currentSample: SeaCurrentSample = sampleSeaCurrentAt(
    state.ship.pos,
    headingVec,
    zone.currents,
    effectiveResist
  );
  const coupActive = state.ship.coupDeBurstActiveTimer > 0;
  const whirlpoolSample: SeaWhirlpoolSample = sampleWhirlpoolAt(
    state.ship.pos,
    zone.whirlpools,
    effectiveResist,
    coupActive
  );

  let currentKind: SeaCurrentKind = 'NONE';
  if (currentSample.inCurrent) {
    if (currentSample.tailwindRatio > 0.05) currentKind = 'TAILWIND';
    else if (currentSample.headwindRatio > 0.05) currentKind = 'HEADWIND';
  }

  const shipSpeedPx = Math.hypot(state.ship.vel.x, state.ship.vel.y);
  const speedRatio = clamp(shipSpeedPx / 180, 0, 1);
  const tailwindBoost = currentSample.tailwindRatio * 0.45;
  const burstBonus = coupActive ? 0.4 : 0;
  const sailBillowFactor = clamp(
    speedRatio * 0.55 + tailwindBoost + burstBonus,
    0,
    1
  );

  const wakeEmitMultiplier = coupActive
    ? 2.4
    : currentKind === 'TAILWIND'
      ? 1 + clamp(currentSample.tailwindRatio, 0, 1) * 0.85
      : 1;

  const whirlpoolDangerRatio = whirlpoolSample.inWhirlpool
    ? clamp(whirlpoolSample.intensity, 0, 1)
    : 0;

  return {
    activeShipId,
    currentKind,
    currentSample,
    whirlpoolSample,
    sailBillowFactor,
    wakeEmitMultiplier,
    whirlpoolDangerRatio,
    coreEjected: whirlpoolSample.escapedCore,
    shipSpeedPx,
    shipPos: { x: state.ship.pos.x, y: state.ship.pos.y }
  };
}

/**
 * Deterministic verification helper checking that entering any whirlpool core
 * ejects safely via anti-trap physics rather than holding the ship inside coreRadiusPx.
 */
export function simulateWhirlpoolAntiTrapCheck(
  state: RpgCampaignState,
  rpgRegistry: RpgDataRegistry,
  whirlpoolIndex = 0,
  ticks = 90
): {
  tested: boolean;
  escapedCore: boolean;
  finalDistPx: number;
  coreRadiusPx: number;
} {
  const zone = rpgRegistry.seaZones[state.currentZoneId];
  const wp = zone?.whirlpools?.[whirlpoolIndex];
  if (!wp) {
    return { tested: false, escapedCore: false, finalDistPx: 0, coreRadiusPx: 0 };
  }

  state.ship.pos = { x: wp.pos.x + 2, y: wp.pos.y + 1 };
  let sawCoreEscape = false;

  const effectiveResist = resolveEffectiveCurrentResist(state, rpgRegistry);
  for (let i = 0; i < ticks; i++) {
    const sample = sampleWhirlpoolAt(
      state.ship.pos,
      zone.whirlpools,
      effectiveResist,
      false
    );
    if (sample.escapedCore) {
      sawCoreEscape = true;
    }
    stepSeaSailing(
      state,
      {
        moveVec: { x: 1, y: 0 },
        coupDeBurstPressed: false,
        dockOrInteractPressed: false
      },
      1 / 60,
      rpgRegistry
    );
  }

  const finalDistPx = Math.hypot(
    state.ship.pos.x - wp.pos.x,
    state.ship.pos.y - wp.pos.y
  );

  return {
    tested: true,
    escapedCore: sawCoreEscape || finalDistPx > wp.coreRadiusPx,
    finalDistPx,
    coreRadiusPx: wp.coreRadiusPx
  };
}
