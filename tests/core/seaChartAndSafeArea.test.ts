import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { createInitialCampaignState } from '../../src/core/rpg/campaignState';
import { completeEpisode, enterIslandEpisode, exitIslandToSea } from '../../src/core/rpg/episodeEngine';
import {
  computeGlobalChestProgress,
  computeIslandChestProgress,
  computeZoneChestProgress,
  evaluateFastSailEligibility,
  executeFastSailToIsland,
  VISITED_ISLAND_FLAG_PREFIX
} from '../../src/core/rpg/seaChartLogic';
import { createDefaultDataRegistry } from '../../src/data/dataRegistry';
import { createDefaultRpgDataRegistry } from '../../src/data/rpgDataRegistry';
import { computeJoystickHomeOrigin, computeTouchButtonLayout } from '../../src/input/touchLayoutCalculator';
import { computeLogPoseHudRect } from '../../src/render/rpg/sailingHudRenderer';
import { computeSeaMinimapRect } from '../../src/render/sea/seaMinimapHud';
import { SeaWakeParticlePool } from '../../src/render/sea/seaWakeParticlePool';
import { SeaWeatherRenderer } from '../../src/render/sea/seaWeatherRenderer';
import { computeResponsiveViewport } from '../../src/render/viewport/responsiveViewportManager';
import { getSafeHudBounds } from '../../src/render/viewport/safeAreaLayout';
import { SeaChartController } from '../../src/scenes/sea/seaChartController';

interface Box {
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

function boxesOverlap(a: Box, b: Box): boolean {
  return (
    a.x < b.x + b.w &&
    a.x + a.w > b.x &&
    a.y < b.y + b.h &&
    a.y + a.h > b.y
  );
}

describe('Stage 14 Step 2: World Sea Chart, Dynamic Chest Progress, Fast Sail & Safe Area Layout', () => {
  it('aggregates island, zone, and global treasure chests dynamically from DataRegistry without hardcoded totals', () => {
    const gameReg = createDefaultDataRegistry();
    const rpgReg = createDefaultRpgDataRegistry();
    const state = createInitialCampaignState(rpgReg, gameReg);

    const expectedTotal = Object.values(rpgReg.islands).reduce(
      (sum, isl) => sum + (isl.chests?.length ?? 0),
      0
    );
    expect(expectedTotal).toBeGreaterThanOrEqual(60);

    const g0 = computeGlobalChestProgress(state, rpgReg);
    expect(g0.total).toBe(expectedTotal);
    expect(g0.opened).toBe(0);
    expect(g0.percent).toBe(0);

    // Open every chest on Foosha Village -> island should report 100% isComplete for gold crown badge
    const fooshaChests = rpgReg.islands['foosha_shells']!.chests!;
    state.openedChestIds = fooshaChests.map((c) => c.chestId);

    const fooshaProg = computeIslandChestProgress(state, 'foosha_shells', rpgReg);
    expect(fooshaProg.opened).toBe(fooshaChests.length);
    expect(fooshaProg.total).toBe(fooshaChests.length);
    expect(fooshaProg.percent).toBe(100);
    expect(fooshaProg.isComplete).toBe(true);

    const ebProg = computeZoneChestProgress(state, 'east_blue', rpgReg);
    expect(ebProg.opened).toBe(fooshaChests.length);
    expect(ebProg.total).toBeGreaterThan(fooshaChests.length);
    expect(ebProg.isComplete).toBe(false);
  });

  it('tracks visited islands via episodeFlags and enforces SeaGate + visited + prerequisite rules on Fast Sail', () => {
    const gameReg = createDefaultDataRegistry();
    const rpgReg = createDefaultRpgDataRegistry();
    const state = createInitialCampaignState(rpgReg, gameReg);

    const orangeNode = rpgReg.seaZones.east_blue.islands.find(
      (i) => i.islandId === 'orange_town'
    )!;
    const fooshaNode = rpgReg.seaZones.east_blue.islands.find(
      (i) => i.islandId === 'foosha_shells'
    )!;

    // Starting port Foosha is always Fast-Sail eligible
    expect(evaluateFastSailEligibility(state, 'east_blue', fooshaNode, rpgReg).allowed).toBe(true);

    // Unvisited Orange Town is blocked
    expect(evaluateFastSailEligibility(state, 'east_blue', orangeNode, rpgReg).allowed).toBe(false);
    const blockedRes = executeFastSailToIsland(state, 'east_blue', 'orange_town', rpgReg);
    expect(blockedRes.ok).toBe(false);

    // Docking at Orange Town sets visited flag (compatible with Save v5 episodeFlags)
    const dockRes = enterIslandEpisode(state, 'orange_town', rpgReg);
    expect(dockRes.allowed).toBe(true);
    expect(state.episodeFlags[`${VISITED_ISLAND_FLAG_PREFIX}orange_town`]).toBe(true);
    exitIslandToSea(state);

    // Now move ship back to Foosha and Fast Sail to Orange Town
    state.ship.pos = { x: 360, y: 300 };
    const sailRes = executeFastSailToIsland(state, 'east_blue', 'orange_town', rpgReg);
    expect(sailRes.ok).toBe(true);
    expect(
      Math.hypot(state.ship.pos.x - orangeNode.pos.x, state.ship.pos.y - orangeNode.pos.y)
    ).toBeLessThanOrEqual(orangeNode.dockingRadiusPx);

    // Cross-zone Fast Sail to Grand Line blocked until East Blue episodes are done
    state.episodeFlags[`${VISITED_ISLAND_FLAG_PREFIX}drum_kingdom`] = true;
    const drumNode = rpgReg.seaZones.grand_line.islands.find(
      (i) => i.islandId === 'drum_kingdom'
    )!;
    expect(evaluateFastSailEligibility(state, 'grand_line', drumNode, rpgReg).allowed).toBe(false);

    // Elbaf remains locked until ep_egghead is completed even in New World
    for (const epId of [
      'ep_east_blue_start',
      'ep_orange_town',
      'ep_baratie',
      'ep_arlong_park',
      'ep_loguetown',
      'ep_drum_kingdom',
      'ep_alabasta',
      'ep_skypiea',
      'ep_water_seven',
      'ep_thriller_bark',
      'ep_marineford'
    ]) {
      completeEpisode(state, epId, rpgReg, gameReg);
    }
    state.episodeFlags[`${VISITED_ISLAND_FLAG_PREFIX}elbaf`] = true;
    const elbafNode = rpgReg.seaZones.new_world.islands.find(
      (i) => i.islandId === 'elbaf'
    )!;
    expect(evaluateFastSailEligibility(state, 'new_world', elbafNode, rpgReg).allowed).toBe(false);

    completeEpisode(state, 'ep_egghead', rpgReg, gameReg);
    expect(evaluateFastSailEligibility(state, 'new_world', elbafNode, rpgReg).allowed).toBe(true);
    const elbafSail = executeFastSailToIsland(state, 'new_world', 'elbaf', rpgReg);
    expect(elbafSail.ok).toBe(true);
    expect(state.currentZoneId).toBe('new_world');
  });

  it('maintains zero Safe Area HUD overlaps on Galaxy S25 Ultra (915x412) and Desktop (1280x720)', () => {
    const cases = [
      {
        label: 'Galaxy S25 Ultra (19.5:9)',
        metrics: computeResponsiveViewport(915, 412, 3, {
          top: 0,
          right: 36,
          bottom: 14,
          left: 44
        })
      },
      {
        label: 'Desktop (16:9)',
        metrics: computeResponsiveViewport(1280, 720, 1, {
          top: 0,
          right: 0,
          bottom: 0,
          left: 0
        })
      }
    ];

    for (const c of cases) {
      const safe = getSafeHudBounds(c.metrics);
      const statusHud: Box = { name: 'SailingStatusHUD', x: 10 + safe.left, y: 10 + safe.top, w: 272, h: 62 };
      const missionHud: Box = { name: 'MissionTrackerHUD', x: 10 + safe.left, y: 78 + safe.top, w: 316, h: 44 };
      const menuBtn: Box = { name: 'DomMenuBtn', x: safe.right - 102, y: safe.top + 6, w: 96, h: 30 };
      const lp = computeLogPoseHudRect('TRIPLE_NEEDLE_NEW_WORLD', safe);
      const logPoseHud: Box = { name: 'LogPoseHUD', ...lp };
      const mm = computeSeaMinimapRect(safe);
      const minimapHud: Box = { name: 'SeaMinimapHUD', ...mm };

      const joy = computeJoystickHomeOrigin(c.metrics, 1.0);
      const joystickBox: Box = { name: 'Joystick', x: joy.x - 48, y: joy.y - 48, w: 96, h: 96 };
      const seaTouchBtns = computeTouchButtonLayout(c.metrics, 1.0).filter(
        (b) => b.id === 'SKILL_0' || b.id === 'DODGE'
      );
      const touchBoxes: Box[] = seaTouchBtns.map((b) => ({
        name: `TouchBtn_${b.id}`,
        x: b.x - b.r,
        y: b.y - b.r,
        w: b.r * 2,
        h: b.r * 2
      }));

      const allBoxes = [
        statusHud,
        missionHud,
        menuBtn,
        logPoseHud,
        minimapHud,
        joystickBox,
        ...touchBoxes
      ];

      for (let i = 0; i < allBoxes.length; i++) {
        const a = allBoxes[i]!;
        // Must sit cleanly inside viewport & safe margins
        expect(a.x, `${c.label} ${a.name}.x`).toBeGreaterThanOrEqual(safe.left);
        expect(a.x + a.w, `${c.label} ${a.name}.right`).toBeLessThanOrEqual(safe.right);
        expect(a.y, `${c.label} ${a.name}.y`).toBeGreaterThanOrEqual(safe.top);
        expect(a.y + a.h, `${c.label} ${a.name}.bottom`).toBeLessThanOrEqual(safe.bottom);

        for (let j = i + 1; j < allBoxes.length; j++) {
          const b = allBoxes[j]!;
          expect(
            boxesOverlap(a, b),
            `${c.label}: ${a.name} overlaps ${b.name}`
          ).toBe(false);
        }
      }
    }
  });

  it('uses zero shadowBlur in src/render/sea and cleans up pools/controllers across 5 sea-island round-trips', () => {
    const seaRenderDir = path.resolve(process.cwd(), 'src/render/sea');
    const files = fs.readdirSync(seaRenderDir).filter((f) => f.endsWith('.ts'));
    expect(files.length).toBeGreaterThanOrEqual(5);
    for (const file of files) {
      const content = fs.readFileSync(path.join(seaRenderDir, file), 'utf-8');
      expect(content.includes('shadowBlur'), `${file} must not reference shadowBlur`).toBe(false);
    }

    const gameReg = createDefaultDataRegistry();
    const rpgReg = createDefaultRpgDataRegistry();
    const state = createInitialCampaignState(rpgReg, gameReg);
    const wakePool = new SeaWakeParticlePool();
    const weatherFx = new SeaWeatherRenderer();
    const chartCtrl = new SeaChartController();

    for (let trip = 0; trip < 5; trip++) {
      chartCtrl.open(state);
      chartCtrl.step(1 / 60);
      chartCtrl.close();

      const dock = enterIslandEpisode(state, 'foosha_shells', rpgReg);
      expect(dock.allowed).toBe(true);
      exitIslandToSea(state);
    }

    expect(wakePool.capacity).toBe(96);
    wakePool.dispose();
    weatherFx.dispose();
    chartCtrl.dispose();
    expect(wakePool.activeCount).toBe(0);
    expect(chartCtrl.state.isOpen).toBe(false);
  });
});
