import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createInitialCampaignState } from '../../src/core/rpg/campaignState';
import { completeEpisode } from '../../src/core/rpg/episodeEngine';
import { stepSeaSailing } from '../../src/core/rpg/sailingPhysics';
import {
  resolveActiveShipId,
  sampleSeaCurrentAt,
  sampleWhirlpoolAt
} from '../../src/core/rpg/seaCurrentPhysics';
import { createDefaultDataRegistry } from '../../src/data/dataRegistry';
import { createAssetManifestRegistry } from '../../src/data/assets/assetManifestRegistry';
import { createDefaultRpgDataRegistry } from '../../src/data/rpgDataRegistry';
import { computeNewWorldLightningIntensity } from '../../src/render/sea/seaWeatherRenderer';

describe('Stage 14 Step 1: Sea Worldmap Landmarks, Currents, Whirlpools, Weather & Ship Sync', () => {
  it('registers all 20 island and sea-gate landmarks in landmarks.json and public PNG files exist', () => {
    const rpg = createDefaultRpgDataRegistry();
    const assetsReg = createAssetManifestRegistry();

    const expectedIds: string[] = [];
    for (const zone of Object.values(rpg.seaZones)) {
      for (const isl of zone.islands) expectedIds.push(isl.islandId);
      if (zone.seaGate) expectedIds.push(zone.seaGate.gateId);
    }
    expect(expectedIds.length).toBe(20);

    for (const id of expectedIds) {
      const entry = assetsReg.landmarksMap.get(id);
      expect(entry, `Missing landmarks.json entry for ${id}`).toBeDefined();
      const absPng = path.resolve(process.cwd(), 'public', entry!.path);
      expect(fs.existsSync(absPng), `Missing landmark PNG: ${absPng}`).toBe(true);
    }
  });

  it('ocean currents give +35% speed boost on tailwind and -20% gentle drag on headwind without stalling', () => {
    const routes = [
      {
        id: 'test_route',
        name: 'Test Current',
        points: [
          { x: 100, y: 200 },
          { x: 500, y: 200 }
        ],
        widthPx: 100,
        speedPx: 40
      }
    ];

    const tailwind = sampleSeaCurrentAt({ x: 300, y: 200 }, { x: 1, y: 0 }, routes, 0);
    expect(tailwind.inCurrent).toBe(true);
    expect(tailwind.speedMultiplier).toBeCloseTo(1.35, 3);
    expect(tailwind.driftVec.x).toBeCloseTo(40, 2);

    const headwind = sampleSeaCurrentAt({ x: 300, y: 200 }, { x: -1, y: 0 }, routes, 0);
    expect(headwind.inCurrent).toBe(true);
    expect(headwind.speedMultiplier).toBeCloseTo(0.8, 3);

    const outside = sampleSeaCurrentAt({ x: 300, y: 400 }, { x: 1, y: 0 }, routes, 0);
    expect(outside.inCurrent).toBe(false);
    expect(outside.speedMultiplier).toBe(1);
  });

  it('whirlpools swirl smoothly, bounce safely out of core without trapping, and Coup de Burst escapes', () => {
    const gameReg = createDefaultDataRegistry();
    const rpgReg = createDefaultRpgDataRegistry();
    const state = createInitialCampaignState(rpgReg, gameReg);
    state.currentZoneId = 'grand_line';
    const wp = rpgReg.seaZones.grand_line.whirlpools![0]!;

    // Center placement triggers safe anti-trap core bounce
    const centerSample = sampleWhirlpoolAt(
      { x: wp.pos.x + 2, y: wp.pos.y },
      rpgReg.seaZones.grand_line.whirlpools,
      0,
      false
    );
    expect(centerSample.inWhirlpool).toBe(true);
    expect(centerSample.escapedCore).toBe(true);
    expect(centerSample.pushOutPos).not.toBeNull();
    expect(
      Math.hypot(centerSample.pushOutPos!.x - wp.pos.x, centerSample.pushOutPos!.y - wp.pos.y)
    ).toBeGreaterThan(wp.coreRadiusPx);

    // Stepping 60 ticks from near core keeps hull intact and exits core safely
    state.ship.pos = { x: wp.pos.x + 5, y: wp.pos.y };
    const startHull = state.ship.hullHp;
    for (let i = 0; i < 60; i++) {
      stepSeaSailing(
        state,
        { moveVec: { x: 1, y: 0 }, coupDeBurstPressed: i === 0, dockOrInteractPressed: false },
        1 / 60,
        rpgReg
      );
    }
    expect(state.ship.hullHp).toBeGreaterThanOrEqual(startHull);
    const distAfter = Math.hypot(state.ship.pos.x - wp.pos.x, state.ship.pos.y - wp.pos.y);
    expect(distAfter).toBeGreaterThan(wp.coreRadiusPx);
  });

  it('auto-upgrades ship sprite/physics from Going Merry to Thousand Sunny after Water 7 completion', () => {
    const gameReg = createDefaultDataRegistry();
    const rpgReg = createDefaultRpgDataRegistry();
    const state = createInitialCampaignState(rpgReg, gameReg);

    expect(resolveActiveShipId(state)).toBe('going_merry');
    completeEpisode(state, 'ep_water_seven', rpgReg, gameReg);
    expect(resolveActiveShipId(state)).toBe('thousand_sunny');

    // Also auto-syncs older save states that only have ep_water_seven in completedEpisodes
    state.ship.shipId = 'going_merry';
    const step = stepSeaSailing(
      state,
      { moveVec: { x: 1, y: 0 }, coupDeBurstPressed: false, dockOrInteractPressed: false },
      1 / 60,
      rpgReg
    );
    expect(step.activeShipId).toBe('thousand_sunny');
    expect(state.ship.shipId).toBe('thousand_sunny');
  });

  it('strictly disables New World storm lightning flashes when flashEffectEnabled is false', () => {
    let seenNonZeroWithEnabled = false;
    for (let tick = 0; tick < 600; tick++) {
      expect(computeNewWorldLightningIntensity(tick, false)).toBe(0);
      if (computeNewWorldLightningIntensity(tick, true) > 0) {
        seenNonZeroWithEnabled = true;
      }
    }
    expect(seenNonZeroWithEnabled).toBe(true);
  });
});
