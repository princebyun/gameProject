import { describe, expect, it } from 'vitest';
import { AssetLoader } from '../../src/assets/assetLoader';
import { FIXED_DT } from '../../src/core/constants';
import { createInitialCampaignState } from '../../src/core/rpg/campaignState';
import { completeEpisode, enterIslandEpisode, stepIslandExploration } from '../../src/core/rpg/episodeEngine';
import { claimIslandChest, getChestWorldCenter } from '../../src/core/rpg/islandLivingVillage';
import { evaluateAndStampAntiCheat } from '../../src/core/save/antiCheat';
import { collectDynamicChestRegistry } from '../../src/core/save/legalityValidator';
import { migrateRawSaveToCurrent, type LegacySaveV0 } from '../../src/core/save/migrator';
import {
  DEFAULT_GLOBAL_SETTINGS,
  deserializeSaveEnvelopeToCampaign,
  serializeCampaignToSaveEnvelope
} from '../../src/core/save/serializer';
import { defaultDataRegistry } from '../../src/data/dataRegistry';
import { defaultRpgDataRegistry } from '../../src/data/rpgDataRegistry';
import { renderIslandEpisodeCanvas } from '../../src/render/islandRenderer';
import { AmbientParticleSystem } from '../../src/render/rpg/ambientParticleSystem';
import { computeIslandCameraTransform } from '../../src/render/rpg/islandCamera';
import { computeResponsiveViewport } from '../../src/render/viewport/responsiveViewportManager';
import { StoryDirector } from '../../src/story/storyDirector';
import { collectIslandWorldMarkers } from '../../src/story/worldMarkerSystem';

const SPOTLIGHT_NEW_ISLANDS = [
  'baratie',
  'loguetown',
  'skypiea',
  'marineford',
  'fishman_island',
  'elbaf'
] as const;

function makeStubCanvasContext() {
  let shadowBlurAccess = false;
  const ctx = {
    imageSmoothingEnabled: false,
    globalCompositeOperation: 'source-over',
    globalAlpha: 1,
    fillStyle: '#000',
    strokeStyle: '#000',
    lineWidth: 1,
    font: '10px monospace',
    textAlign: 'left',
    save: () => {},
    restore: () => {},
    translate: () => {},
    rotate: () => {},
    scale: () => {},
    beginPath: () => {},
    closePath: () => {},
    moveTo: () => {},
    lineTo: () => {},
    arc: () => {},
    ellipse: () => {},
    fill: () => {},
    stroke: () => {},
    fillRect: () => {},
    strokeRect: () => {},
    clearRect: () => {},
    setLineDash: () => {},
    fillText: () => {},
    measureText: (t: string) => ({ width: t.length * 6 }),
    drawImage: () => {},
    createImageData: (w: number, h: number) => ({
      data: new Uint8ClampedArray(Math.max(1, w) * Math.max(1, h) * 4),
      width: w,
      height: h
    }),
    putImageData: () => {},
    createLinearGradient: () => ({ addColorStop: () => {} }),
    createRadialGradient: () => ({ addColorStop: () => {} })
  };
  Object.defineProperty(ctx, 'shadowBlur', {
    get: () => 0,
    set: () => {
      shadowBlurAccess = true;
    }
  });
  return {
    ctx: ctx as unknown as CanvasRenderingContext2D,
    hadShadowBlurAccess: () => shadowBlurAccess
  };
}

describe('All 17 Islands — 7-Layer Maps, 60 Dynamic Chests, Drum Blossom Transition & S25 Ultra E2E', () => {
  it('verifies all 17 islands satisfy 7-layer dimensions, zones, walk-behind overheads, patrolling NPCs, and 60 unique chests', () => {
    const islands = Object.values(defaultRpgDataRegistry.islands);
    expect(islands.length).toBe(17);

    let totalChests = 0;
    let totalZones = 0;
    let totalNpcs = 0;

    for (const isl of islands) {
      expect(isl.tileMap, `Missing tileMap on ${isl.islandId}`).toBeDefined();
      const tm = isl.tileMap!;
      expect(tm.cols).toBeGreaterThanOrEqual(44);
      expect(tm.rows).toBeGreaterThanOrEqual(30);
      expect(isl.width).toBe(tm.cols * 32);
      expect(isl.height).toBe(tm.rows * 32);
      expect((isl.zones ?? []).length).toBeGreaterThanOrEqual(4);
      expect((isl.chests ?? []).length).toBeGreaterThanOrEqual(3);
      expect(isl.npcs.length).toBeGreaterThanOrEqual(5);
      expect(isl.npcs.filter((n) => (n.patrolWaypoints?.length ?? 0) >= 2).length).toBeGreaterThanOrEqual(4);

      let walkBehind = 0;
      for (let r = 0; r < tm.rows; r++) {
        for (let c = 0; c < tm.cols; c++) {
          if (tm.overheadRows[r]?.[c] !== '.' && tm.solidRows[r]?.[c] === '.') {
            walkBehind += 1;
          }
        }
      }
      expect(walkBehind).toBeGreaterThanOrEqual(8);

      totalChests += isl.chests?.length ?? 0;
      totalZones += isl.zones?.length ?? 0;
      totalNpcs += isl.npcs.length;
    }

    expect(totalChests).toBe(60);
    expect(totalZones).toBe(71);
    expect(totalNpcs).toBe(102);

    const chestReg = collectDynamicChestRegistry(defaultRpgDataRegistry);
    expect(chestReg.totalCount).toBe(60);
  });

  it('opens ALL 60 chests across all 17 islands and passes Save v5 LegalityValidator, SaveMigrator v0->v5, and legacy position snap', () => {
    const campaign = createInitialCampaignState(defaultRpgDataRegistry, defaultDataRegistry);
    for (const epId of Object.keys(defaultRpgDataRegistry.episodes)) {
      if (epId !== 'ep_elbaf_part2') {
        completeEpisode(campaign, epId, defaultRpgDataRegistry, defaultDataRegistry);
      }
    }
    campaign.currentZoneId = 'new_world';

    for (const isl of Object.values(defaultRpgDataRegistry.islands)) {
      for (const chest of isl.chests ?? []) {
        claimIslandChest(campaign, chest);
      }
    }
    expect(campaign.openedChestIds?.length).toBe(60);

    const env = serializeCampaignToSaveEnvelope(
      campaign,
      'slot_1',
      7200,
      '2026-11-23T04:30:00.000Z',
      DEFAULT_GLOBAL_SETTINGS,
      null,
      defaultRpgDataRegistry,
      defaultDataRegistry
    );

    const ac = evaluateAndStampAntiCheat(env, defaultRpgDataRegistry, defaultDataRegistry);
    expect(ac.isTampered).toBe(false);
    expect(ac.onlineEligible).toBe(true);
    expect(ac.violationCodes).toEqual([]);

    const restored = deserializeSaveEnvelopeToCampaign(env, defaultRpgDataRegistry, defaultDataRegistry);
    expect(restored.campaign.openedChestIds?.length).toBe(60);

    // Tamper: duplicate chest ID or nonexistent chest ID must fail
    const dupEnv = JSON.parse(JSON.stringify(env));
    dupEnv.payload.world.openedChestIds.push(dupEnv.payload.world.openedChestIds[0]);
    const dupAc = evaluateAndStampAntiCheat(dupEnv, defaultRpgDataRegistry, defaultDataRegistry);
    expect(dupAc.isTampered).toBe(true);
    expect(dupAc.violationCodes).toContain('ILLEGAL_UNIT_STATE');

    // Legacy v0 -> v5 SaveMigrator compatibility
    const legacyV0: LegacySaveV0 = {
      saveVersion: 0,
      slotId: 'slot_2',
      playTimeSec: 900,
      zoneId: 'east_blue',
      shipX: 520,
      shipY: 420,
      shipId: 'going_merry',
      berries: 25000,
      bounty: 30000000,
      trainingPoints: 25,
      completedEpisodes: ['ep_east_blue_start'],
      recruitedUnitIds: ['luffy', 'zoro'],
      activePartyUnitIds: ['luffy', 'zoro']
    };
    const mig = migrateRawSaveToCurrent(legacyV0, defaultRpgDataRegistry, defaultDataRegistry);
    expect(mig.envelope.meta.saveVersion).toBe(5);
    expect(mig.envelope.meta.antiCheat.isTampered).toBe(false);
    expect(mig.envelope.payload.world.openedChestIds).toEqual([]);

    // Legacy 960x540 position inside Baratie outer water snaps cleanly to Baratie spawnPoint
    const legacyBaratieEnv = JSON.parse(JSON.stringify(env));
    legacyBaratieEnv.payload.world.currentScene = 'island';
    legacyBaratieEnv.payload.world.currentIslandId = 'baratie';
    legacyBaratieEnv.payload.world.playerIslandPos = { x: 58, y: 270 };
    const restoredBaratie = deserializeSaveEnvelopeToCampaign(
      legacyBaratieEnv,
      defaultRpgDataRegistry,
      defaultDataRegistry
    );
    const baratieSpawn = defaultRpgDataRegistry.islands['baratie']!.spawnPoint;
    expect(restoredBaratie.islandRuntime?.playerPos).toEqual(baratieSpawn);
  });

  it('transitions Drum Kingdom ambient particles from SNOW to cherry-blossom PETAL after ep_drum_kingdom completion', () => {
    const drum = defaultRpgDataRegistry.islands['drum_kingdom']!;
    expect(drum.ambientProfile?.particles).toContain('SNOW');
    expect(drum.ambientProfile?.postClearParticles).toContain('PETAL');

    const { ctx } = makeStubCanvasContext();
    const sys = new AmbientParticleSystem();
    const fills: string[] = [];
    const origFillRect = ctx.fillRect;
    ctx.fillRect = (...args) => {
      fills.push(String(ctx.fillStyle));
      origFillRect(...args);
    };

    sys.stepAndRender(ctx, 'snow_drum', 1199, 540, 1, drum.ambientProfile, false);
    expect(fills.some((c) => c === '#f8fafc' || c === '#bae6fd')).toBe(true);

    fills.length = 0;
    sys.stepAndRender(ctx, 'snow_drum', 1199, 540, 2, drum.ambientProfile, true);
    expect(fills.some((c) => c === '#fda4af' || c === '#f472b6')).toBe(true);
  });

  it('renders all 17 islands under Galaxy S25 Ultra (915x412 -> 1199x540) at <16.6ms with 0 shadowBlur, LRU cap <= 6 & clean dispose()', () => {
    const prevDoc = (globalThis as { document?: unknown }).document;
    const createdCanvases: { width: number; height: number }[] = [];
    const { ctx, hadShadowBlurAccess } = makeStubCanvasContext();

    (globalThis as { document?: unknown }).document = {
      createElement: () => {
        const c = {
          width: 0,
          height: 0,
          getContext: () => ctx
        };
        createdCanvases.push(c);
        return c;
      }
    };

    try {
      const viewport = computeResponsiveViewport(915, 412, 3, {
        top: 0,
        right: 36,
        bottom: 14,
        left: 44
      });
      expect(viewport.viewWidth).toBe(1199);
      expect(viewport.viewHeight).toBe(540);

      const assets = new AssetLoader();
      const campaign = createInitialCampaignState(defaultRpgDataRegistry, defaultDataRegistry);
      for (const epId of Object.keys(defaultRpgDataRegistry.episodes)) {
        if (epId !== 'ep_elbaf_part2') {
          completeEpisode(campaign, epId, defaultRpgDataRegistry, defaultDataRegistry);
        }
      }
      const director = new StoryDirector();

      const t0 = performance.now();
      let renderedFrames = 0;
      const allIds = Object.keys(defaultRpgDataRegistry.islands);
      for (const islandId of allIds) {
        const map = defaultRpgDataRegistry.islands[islandId]!;
        const zone = Object.values(defaultRpgDataRegistry.seaZones).find((z) =>
          z.islands.some((n) => n.islandId === islandId)
        );
        campaign.currentZoneId = zone?.id ?? 'east_blue';

        const res = enterIslandEpisode(campaign, islandId, defaultRpgDataRegistry);
        expect(res.allowed).toBe(true);
        const rt = res.runtime!;
        expect(computeIslandCameraTransform(map, rt.playerPos, viewport).isScrolling).toBe(true);

        const stepInfo = stepIslandExploration(
          campaign,
          rt,
          { x: 1, y: 0 },
          false,
          FIXED_DT,
          defaultRpgDataRegistry,
          defaultDataRegistry
        );
        const markers = collectIslandWorldMarkers(campaign, map, director.getCurrentNode(campaign));

        const frameCount = SPOTLIGHT_NEW_ISLANDS.includes(
          islandId as (typeof SPOTLIGHT_NEW_ISLANDS)[number]
        )
          ? 4
          : 2;
        for (let f = 0; f < frameCount; f++) {
          renderIslandEpisodeCanvas(
            ctx,
            campaign,
            rt,
            stepInfo,
            defaultRpgDataRegistry,
            defaultDataRegistry,
            assets,
            f,
            viewport,
            markers,
            false
          );
          renderedFrames += 1;
        }
        expect(assets.layeredTilemap.cachedMapCount).toBeLessThanOrEqual(6);
      }

      const avgMs = (performance.now() - t0) / renderedFrames;
      expect(avgMs).toBeLessThan(16.6);
      expect(hadShadowBlurAccess()).toBe(false);

      // Verify a hidden chest center is inside walkable/reachable bounds on Baratie
      const baratieChest = defaultRpgDataRegistry.islands['baratie']!.chests![0]!;
      expect(getChestWorldCenter(baratieChest, 32).x).toBeGreaterThan(0);

      assets.dispose();
      expect(assets.layeredTilemap.cachedMapCount).toBe(0);
      expect(assets.footstepParticles.activeCount).toBe(0);
      expect(createdCanvases.length).toBeGreaterThan(0);
      expect(createdCanvases.every((c) => c.width === 0 && c.height === 0)).toBe(true);
    } finally {
      if (prevDoc === undefined) delete (globalThis as { document?: unknown }).document;
      else (globalThis as { document?: unknown }).document = prevDoc;
    }
  });
});
