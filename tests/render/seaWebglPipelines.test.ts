import { afterEach, describe, expect, it, vi } from 'vitest';
import { createInitialCampaignState } from '../../src/core/rpg/campaignState';
import { completeEpisode } from '../../src/core/rpg/episodeEngine';
import { createDefaultDataRegistry } from '../../src/data/dataRegistry';
import { createDefaultRpgDataRegistry } from '../../src/data/rpgDataRegistry';
import { DEFAULT_VISUAL_POLISH_CONFIG } from '../../src/render/backend/renderBackend';
import {
  OceanWaterShaderPipeline,
  SEA_ZONE_WATER_PALETTES
} from '../../src/render/pixi/shaders/OceanWaterShaderPipeline';
import { SeaAtmospherePipeline } from '../../src/render/pixi/shaders/SeaAtmospherePipeline';
import { computeCameraWorldBounds } from '../../src/render/viewport/frustumCulling';
import {
  evaluateSeaNavigationTelemetry,
  SEA_CURRENT_HEADWIND_MAX_PENALTY,
  SEA_CURRENT_TAILWIND_MAX_BONUS,
  simulateWhirlpoolAntiTrapCheck
} from '../../src/scenes/sea/SeaCurrentPhysics';

function createMinimalMockDoc() {
  return {
    createElement: () => ({
      style: {},
      width: 300,
      height: 150,
      getContext: () => null,
      setAttribute: () => undefined,
      appendChild: () => undefined
    })
  };
}

describe('Wave 5 Step 1: WebGL2 Ocean Water Shader, Sea Atmosphere & Current/Whirlpool Physics', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('interpolates OceanWaterShaderPipeline palette smoothly across all 3 sea zones and updates time-of-day specular & island circles', () => {
    vi.stubGlobal('document', createMinimalMockDoc());
    const pipeline = new OceanWaterShaderPipeline('east_blue');
    pipeline.snapToZonePalette('east_blue');

    const ebSnap = pipeline.getCurrentPaletteSnapshot();
    expect(ebSnap.deepRgb[1]).toBeCloseTo(SEA_ZONE_WATER_PALETTES.east_blue.deepRgb[1], 3);

    // Partial interpolation toward new_world over dt = 0.1s
    pipeline.update(
      'new_world',
      0.1,
      1.0,
      1170,
      540,
      120,
      80,
      { ...DEFAULT_VISUAL_POLISH_CONFIG, timeOfDay: 'SUNSET', flashEffectEnabled: true },
      [
        { screenX: 300, screenY: 220, radiusPx: 72, isGate: false },
        { screenX: 840, screenY: 310, radiusPx: 88, isGate: true }
      ]
    );
    const midSnap = pipeline.getLastUniformState();
    expect(midSnap.zoneId).toBe('new_world');
    expect(midSnap.islandCircleCount).toBe(2);
    expect(midSnap.deepRgb[1]).toBeLessThan(ebSnap.deepRgb[1]);
    expect(midSnap.deepRgb[1]).toBeGreaterThan(SEA_ZONE_WATER_PALETTES.new_world.deepRgb[1]);
    expect(midSnap.specularStrength).toBeGreaterThan(0.8);

    // Accessibility flashEffectEnabled === false softens harsh water specular shimmer
    pipeline.update(
      'grand_line',
      0.2,
      2.0,
      960,
      540,
      0,
      0,
      { ...DEFAULT_VISUAL_POLISH_CONFIG, timeOfDay: 'DAY', flashEffectEnabled: false },
      []
    );
    const safeDaySnap = pipeline.getLastUniformState();
    expect(safeDaySnap.specularStrength).toBeLessThan(0.4);
    expect(safeDaySnap.islandCircleCount).toBe(0);

    pipeline.dispose();
  });

  it('drives SeaAtmospherePipeline across all 3 zones, Drum post-clear cherry blossoms, Sea King shadows, and flashEffect lightning guard', () => {
    const gameReg = createDefaultDataRegistry();
    const rpgReg = createDefaultRpgDataRegistry();
    const state = createInitialCampaignState(rpgReg, gameReg);
    const atm = new SeaAtmospherePipeline();

    // 1. East Blue -> 0 Sea King shadows
    const ebZone = rpgReg.seaZones.east_blue;
    atm.update(state, ebZone, 0, 0, 1170, 540, 12, DEFAULT_VISUAL_POLISH_CONFIG);
    expect(atm.activeWeatherZone).toBe('east_blue');
    expect(atm.activeSeaKingShadowCount).toBe(0);
    expect(atm.isLightningVisible).toBe(false);

    // 2. Grand Line Drum Kingdom: Snow before clear -> Cherry blossoms after clear
    state.currentZoneId = 'grand_line';
    const glZone = rpgReg.seaZones.grand_line;
    const drumNode = glZone.islands.find((i) => i.islandId === 'drum_kingdom')!;
    state.ship.pos = { x: drumNode.pos.x + 20, y: drumNode.pos.y + 10 };
    const glBounds = computeCameraWorldBounds(0, 0, glZone.width, glZone.height, 200);
    atm.update(state, glZone, 0, 0, 1170, 540, 20, DEFAULT_VISUAL_POLISH_CONFIG, glBounds);
    expect(atm.activeSeaKingShadowCount).toBe(1);
    expect(atm.activeDrumBlossomMode).toBe(false);

    completeEpisode(state, 'ep_drum_kingdom', rpgReg, gameReg);
    atm.update(state, glZone, 0, 0, 1170, 540, 21, DEFAULT_VISUAL_POLISH_CONFIG, glBounds);
    expect(atm.activeDrumBlossomMode).toBe(true);

    // 3. New World: 3 underwater Sea King shadows + tick 18 lightning active when flash enabled, strictly blocked when disabled
    state.currentZoneId = 'new_world';
    const nwZone = rpgReg.seaZones.new_world;
    const nwBounds = computeCameraWorldBounds(0, 0, nwZone.width, nwZone.height, 250);
    atm.update(state, nwZone, 0, 0, 1170, 540, 18, {
      ...DEFAULT_VISUAL_POLISH_CONFIG,
      flashEffectEnabled: true
    }, nwBounds);
    expect(atm.activeWeatherZone).toBe('new_world');
    expect(atm.activeSeaKingShadowCount).toBe(3);
    expect(atm.isLightningVisible).toBe(true);

    // Verify 300 ticks with flashEffectEnabled === false produce ZERO lightning flashes
    for (let t = 0; t < 300; t++) {
      atm.update(state, nwZone, 0, 0, 1170, 540, t, {
        ...DEFAULT_VISUAL_POLISH_CONFIG,
        flashEffectEnabled: false
      }, nwBounds);
      expect(atm.isLightningVisible).toBe(false);
    }

    atm.dispose();
  });

  it('computes +35% tailwind / -20% headwind telemetry and verifies whirlpool anti-trap escape in SeaCurrentPhysics.ts', () => {
    const gameReg = createDefaultDataRegistry();
    const rpgReg = createDefaultRpgDataRegistry();
    const state = createInitialCampaignState(rpgReg, gameReg);
    const glZone = rpgReg.seaZones.grand_line;
    state.currentZoneId = 'grand_line';

    const firstRoute = glZone.currents![0]!;
    const p0 = firstRoute.points[0]!;
    const p1 = firstRoute.points[1]!;
    const dx = p1.x - p0.x;
    const dy = p1.y - p0.y;
    const len = Math.hypot(dx, dy);
    const ux = dx / len;
    const uy = dy / len;

    state.ship.pos = { x: (p0.x + p1.x) * 0.5, y: (p0.y + p1.y) * 0.5 };
    state.ship.vel = { x: ux * 160, y: uy * 160 };

    const tailwindTelem = evaluateSeaNavigationTelemetry(state, glZone, { x: ux, y: uy });
    expect(tailwindTelem.currentKind).toBe('TAILWIND');
    expect(tailwindTelem.currentSample.speedMultiplier).toBeCloseTo(
      1 + SEA_CURRENT_TAILWIND_MAX_BONUS,
      2
    );
    expect(tailwindTelem.sailBillowFactor).toBeGreaterThan(0.6);
    expect(tailwindTelem.wakeEmitMultiplier).toBeGreaterThan(1.4);

    const headwindTelem = evaluateSeaNavigationTelemetry(state, glZone, { x: -ux, y: -uy });
    expect(headwindTelem.currentKind).toBe('HEADWIND');
    expect(headwindTelem.currentSample.speedMultiplier).toBeCloseTo(
      1 - SEA_CURRENT_HEADWIND_MAX_PENALTY,
      2
    );

    const antiTrap = simulateWhirlpoolAntiTrapCheck(state, rpgReg, 0, 90);
    expect(antiTrap.tested).toBe(true);
    expect(antiTrap.escapedCore).toBe(true);
    expect(antiTrap.finalDistPx).toBeGreaterThan(antiTrap.coreRadiusPx);
  });
});
