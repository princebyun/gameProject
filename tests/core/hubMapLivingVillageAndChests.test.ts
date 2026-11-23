import { describe, expect, it } from 'vitest';
import { AssetLoader } from '../../src/assets/assetLoader';
import { FIXED_DT } from '../../src/core/constants';
import { createInitialCampaignState } from '../../src/core/rpg/campaignState';
import { enterIslandEpisode, stepIslandExploration } from '../../src/core/rpg/episodeEngine';
import { getChestWorldCenter } from '../../src/core/rpg/islandLivingVillage';
import { getZoneTriggerAt } from '../../src/core/rpg/islandTileCollision';
import { evaluateAndStampAntiCheat } from '../../src/core/save/antiCheat';
import {
  DEFAULT_GLOBAL_SETTINGS,
  deserializeSaveEnvelopeToCampaign,
  serializeCampaignToSaveEnvelope
} from '../../src/core/save/serializer';
import { defaultDataRegistry } from '../../src/data/dataRegistry';
import { defaultRpgDataRegistry } from '../../src/data/rpgDataRegistry';
import { renderIslandEpisodeCanvas } from '../../src/render/islandRenderer';
import { computeIslandCameraTransform } from '../../src/render/rpg/islandCamera';
import { computeResponsiveViewport } from '../../src/render/viewport/responsiveViewportManager';
import { StoryDirector } from '../../src/story/storyDirector';
import { collectIslandWorldMarkers } from '../../src/story/worldMarkerSystem';

const CORE_HUB_IDS = [
  'foosha_shells',
  'water_seven',
  'wano_onigashima',
  'egghead'
] as const;

function makeStubCanvasContext() {
  const canvases: { width: number; height: number }[] = [];
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
    canvases,
    hadShadowBlurAccess: () => shadowBlurAccess
  };
}

describe('4 Core Hub Islands — 7-Layer Tilemaps, Living Village, Chest Persistence & S25 Ultra 60FPS Render', () => {
  it('validates all 4 redesigned hub maps (44x32..56x40, zones, chests, patrol NPCs, 2.5D overhead walk-behind alleys)', () => {
    let totalChests = 0;
    for (const id of CORE_HUB_IDS) {
      const map = defaultRpgDataRegistry.islands[id];
      expect(map, `Missing hub map ${id}`).toBeDefined();
      if (!map || !map.tileMap) throw new Error(`Missing tileMap on ${id}`);

      expect(map.tileMap.cols).toBeGreaterThanOrEqual(44);
      expect(map.tileMap.rows).toBeGreaterThanOrEqual(32);
      expect(map.width).toBe(map.tileMap.cols * 32);
      expect(map.height).toBe(map.tileMap.rows * 32);
      expect((map.zones ?? []).length).toBeGreaterThanOrEqual(4);
      expect((map.chests ?? []).length).toBeGreaterThanOrEqual(3);
      expect(map.npcs.length).toBeGreaterThanOrEqual(7);
      expect(map.npcs.filter((n) => (n.patrolWaypoints?.length ?? 0) >= 2).length).toBeGreaterThanOrEqual(4);

      totalChests += map.chests?.length ?? 0;

      // Ensure walk-behind overhead tiles exist (walkable '.' on solidRows with non-empty overheadRows)
      let walkBehind = 0;
      for (let r = 0; r < map.tileMap.rows; r++) {
        for (let c = 0; c < map.tileMap.cols; c++) {
          if (map.tileMap.overheadRows[r]?.[c] !== '.' && map.tileMap.solidRows[r]?.[c] === '.') {
            walkBehind += 1;
          }
        }
      }
      expect(walkBehind).toBeGreaterThanOrEqual(8);
    }
    expect(totalChests).toBe(15); // Foosha 3 + Water Seven 4 + Wano 4 + Egghead 4
  });

  it('executes Living Village patrol, turn-to-player dialogue & resume, footstep surface tags, and zone entry banner', () => {
    const campaign = createInitialCampaignState(defaultRpgDataRegistry, defaultDataRegistry);
    const enterRes = enterIslandEpisode(campaign, 'foosha_shells', defaultRpgDataRegistry);
    expect(enterRes.allowed).toBe(true);
    const rt = enterRes.runtime!;
    expect(rt.zoneBannerName).toBe('후샤 항구 & 목조 부두');
    expect(rt.zoneBannerTimerSec).toBeGreaterThan(2.0);

    // 1. Patrol NPC moves deterministically when player is away
    const woopBefore = { ...rt.npcStates!['npc_woop_slap']!.pos };
    for (let t = 0; t < 20; t++) {
      stepIslandExploration(campaign, rt, { x: 0, y: 0 }, false, FIXED_DT, defaultRpgDataRegistry, defaultDataRegistry);
    }
    const woopAfter = rt.npcStates!['npc_woop_slap']!.pos;
    expect(Math.hypot(woopAfter.x - woopBefore.x, woopAfter.y - woopBefore.y)).toBeGreaterThan(2);

    // 2. Approaching Makino and starting dialogue turns Makino to face player, and ending dialogue lets her resume patrol
    const makinoPos = rt.npcStates!['npc_makino']!.pos;
    rt.playerPos = { x: makinoPos.x - 32, y: makinoPos.y };
    stepIslandExploration(campaign, rt, { x: 0, y: 0 }, true, FIXED_DT, defaultRpgDataRegistry, defaultDataRegistry);
    expect(rt.activeDialogueNpc?.npcId).toBe('npc_makino');
    expect(rt.npcStates!['npc_makino']!.facing).toBe('left');
    expect(rt.npcStates!['npc_makino']!.isMoving).toBe(false);

    // Advance & finish dialogue
    stepIslandExploration(campaign, rt, { x: 0, y: 0 }, true, FIXED_DT, defaultRpgDataRegistry, defaultDataRegistry);
    stepIslandExploration(campaign, rt, { x: 0, y: 0 }, true, FIXED_DT, defaultRpgDataRegistry, defaultDataRegistry);
    expect(rt.activeDialogueNpc).toBeNull();

    rt.playerPos = { x: 688, y: 912 };
    const makinoEndPos = { ...rt.npcStates!['npc_makino']!.pos };
    for (let t = 0; t < 25; t++) {
      stepIslandExploration(campaign, rt, { x: 0, y: 0 }, false, FIXED_DT, defaultRpgDataRegistry, defaultDataRegistry);
    }
    const makinoResumedPos = rt.npcStates!['npc_makino']!.pos;
    expect(Math.hypot(makinoResumedPos.x - makinoEndPos.x, makinoResumedPos.y - makinoEndPos.y)).toBeGreaterThan(1);

    // 3. Walking triggers footstep events matching surfaceGrid materials & entering Plaza triggers new Zone Banner
    const fooshaMap = defaultRpgDataRegistry.islands['foosha_shells']!;
    rt.playerPos = { x: 688, y: 912 };
    const fsDock = (() => {
      for (let t = 0; t < 20; t++) {
        const o = stepIslandExploration(campaign, rt, { x: 0, y: -1 }, false, FIXED_DT, defaultRpgDataRegistry, defaultDataRegistry);
        if (o.footstepEvent) return o.footstepEvent;
      }
      return null;
    })();
    expect(fsDock?.material).toBe('wood_dock');

    // Walk into Central Stone Plaza zone
    const plazaZone = fooshaMap.zones!.find((z) => z.zoneId === 'zone_foosha_plaza')!;
    rt.playerPos = { x: (plazaZone.tileX + 2) * 32 + 16, y: (plazaZone.tileY + 2) * 32 + 16 };
    const fsStone = (() => {
      for (let t = 0; t < 20; t++) {
        const o = stepIslandExploration(campaign, rt, { x: 1, y: 0 }, false, FIXED_DT, defaultRpgDataRegistry, defaultDataRegistry);
        if (o.footstepEvent) return o.footstepEvent;
      }
      return null;
    })();
    expect(getZoneTriggerAt(rt.playerPos, fooshaMap)?.zoneId).toBe('zone_foosha_plaza');
    expect(rt.zoneBannerName).toBe('중앙 돌길 광장');
    expect(fsStone?.material).toBe('stone');
  });

  it('persists opened hidden chests in Save v5, validates LegalityValidator, and supports legacy saves cleanly', () => {
    const campaign = createInitialCampaignState(defaultRpgDataRegistry, defaultDataRegistry);
    const enterRes = enterIslandEpisode(campaign, 'foosha_shells', defaultRpgDataRegistry);
    const rt = enterRes.runtime!;
    const fooshaMap = defaultRpgDataRegistry.islands['foosha_shells']!;
    const chest = fooshaMap.chests![0]!;
    const prevBerries = campaign.berries;
    const prevTp = campaign.trainingPoints;

    // Move next to chest & open it
    rt.playerPos = getChestWorldCenter(chest, 32);
    const openOut = stepIslandExploration(campaign, rt, { x: 0, y: 0 }, true, FIXED_DT, defaultRpgDataRegistry, defaultDataRegistry);
    expect(openOut.openedChest?.chest.chestId).toBe(chest.chestId);
    expect(campaign.openedChestIds).toContain(chest.chestId);
    expect(campaign.berries).toBe(prevBerries + chest.reward.berries);
    expect(campaign.trainingPoints).toBe(prevTp + chest.reward.trainingPoints);

    // Interacting again does NOT re-claim the already-opened chest
    const secondOut = stepIslandExploration(campaign, rt, { x: 0, y: 0 }, true, FIXED_DT, defaultRpgDataRegistry, defaultDataRegistry);
    expect(secondOut.openedChest).toBeNull();
    expect(campaign.berries).toBe(prevBerries + chest.reward.berries);

    // Serialize -> Save v5 integrity & LegalityValidator pass
    const env = serializeCampaignToSaveEnvelope(
      campaign,
      'slot_1',
      200,
      '2026-11-23T02:40:00.000Z',
      DEFAULT_GLOBAL_SETTINGS,
      rt,
      defaultRpgDataRegistry,
      defaultDataRegistry
    );
    expect(env.meta.saveVersion).toBe(5);
    expect(env.meta.antiCheat.isTampered).toBe(false);
    expect(env.meta.antiCheat.onlineEligible).toBe(true);
    expect(env.payload.world.openedChestIds).toContain(chest.chestId);

    // Reload -> openedChestIds preserved
    const restored = deserializeSaveEnvelopeToCampaign(env, defaultRpgDataRegistry, defaultDataRegistry);
    expect(restored.campaign.openedChestIds).toContain(chest.chestId);

    // Legacy v5 payload missing openedChestIds loads safely with []
    const legacyNoChests = JSON.parse(JSON.stringify(env));
    delete legacyNoChests.payload.world.openedChestIds;
    const restoredLegacy = deserializeSaveEnvelopeToCampaign(legacyNoChests, defaultRpgDataRegistry, defaultDataRegistry);
    expect(restoredLegacy.campaign.openedChestIds).toEqual([]);

    // Injecting nonexistent chestId -> caught by LegalityValidator even with recomputed signature
    const tamperedChestEnv = JSON.parse(JSON.stringify(env));
    tamperedChestEnv.payload.world.openedChestIds.push('chest_fake_hacked_999');
    const ac = evaluateAndStampAntiCheat(tamperedChestEnv, defaultRpgDataRegistry, defaultDataRegistry);
    expect(ac.isTampered).toBe(true);
    expect(ac.onlineEligible).toBe(false);
  });

  it('renders all 4 hubs under Galaxy S25 Ultra (915x412 -> 1170x540) with zero shadowBlur, chunk culling & clean dispose()', () => {
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
      campaign.completedEpisodes.push('ep_east_blue_start', 'ep_water_seven', 'ep_wano');
      const director = new StoryDirector();

      const t0 = performance.now();
      for (const hubId of CORE_HUB_IDS) {
        campaign.currentZoneId =
          hubId === 'foosha_shells' ? 'east_blue' : hubId === 'water_seven' ? 'grand_line' : 'new_world';
        const res = enterIslandEpisode(campaign, hubId, defaultRpgDataRegistry);
        expect(res.allowed).toBe(true);
        const rt = res.runtime!;
        const map = defaultRpgDataRegistry.islands[hubId]!;

        const cam = computeIslandCameraTransform(map, rt.playerPos, viewport);
        expect(cam.isScrolling).toBe(true);

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

        for (let frame = 0; frame < 5; frame++) {
          renderIslandEpisodeCanvas(
            ctx,
            campaign,
            rt,
            stepInfo,
            defaultRpgDataRegistry,
            defaultDataRegistry,
            assets,
            frame,
            viewport,
            markers,
            false
          );
        }
      }
      const avgMs = (performance.now() - t0) / 20;
      expect(avgMs).toBeLessThan(16.6);
      expect(hadShadowBlurAccess()).toBe(false);

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
