import fs from 'node:fs';
import path from 'node:path';
import { Texture } from 'pixi.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createBattleWorld } from '../../src/core/combat/battleWorld';
import { createStandardPresetBuild } from '../../src/core/net/terminalArenaRule';
import { createInitialCampaignState } from '../../src/core/rpg/campaignState';
import { completeEpisode } from '../../src/core/rpg/episodeEngine';
import {
  computeGlobalChestProgress,
  computeZoneChestProgress,
  executeFastSailToIsland,
  VISITED_ISLAND_FLAG_PREFIX
} from '../../src/core/rpg/seaChartLogic';
import type { AssetLoader } from '../../src/assets/assetLoader';
import { defaultProAssetManifest } from '../../src/data/assets/proAssetManifest';
import { defaultDataRegistry } from '../../src/data/dataRegistry';
import { defaultRpgDataRegistry } from '../../src/data/rpgDataRegistry';
import { computeJoystickHomeOrigin, computeTouchButtonLayout } from '../../src/input/touchLayoutCalculator';
import { DEFAULT_VISUAL_POLISH_CONFIG } from '../../src/render/backend/renderBackend';
import type { CanvasRenderer } from '../../src/render/canvasRenderer';
import {
  MOBILE_VRAM_BUDGET_MB,
  PixiAssetBundleManager,
  resolveSeaBundleName
} from '../../src/render/pixi/PixiAssetBundleManager';
import { PixiStageHost } from '../../src/render/pixi/PixiStageHost';
import { ProAssetLoader } from '../../src/render/pixi/ProAssetLoader';
import type {
  PixiAssetsDriver,
  PixiAssetsManifestPayload
} from '../../src/render/pixi/pixiBundleTypes';
import { PixiSeaSailingScene } from '../../src/render/pixi/scenes/PixiSeaSailingScene';
import { computeLogPoseHudRect } from '../../src/render/rpg/sailingHudRenderer';
import { computeSeaMinimapRect } from '../../src/render/sea/seaMinimapHud';
import { computeResponsiveViewport } from '../../src/render/viewport/responsiveViewportManager';
import { getSafeHudBounds } from '../../src/render/viewport/safeAreaLayout';
import {
  PixiVerticalSliceController,
  type VerticalSliceSceneHost
} from '../../src/scenes/controllers/pixiVerticalSliceController';
import {
  createInitialIslandStepState,
  createInitialSailingStepState
} from '../../src/scenes/controllers/sceneBootInitializer';
import { StoryDirector } from '../../src/story/storyDirector';

const PUBLIC_DIR = path.resolve(process.cwd(), 'public');

function createMockTexture(label: string, width = 448, height = 112): Texture {
  const tex = new Texture({ label });
  Object.defineProperty(tex, 'width', { value: width, configurable: true });
  Object.defineProperty(tex, 'height', { value: height, configurable: true });
  Object.defineProperty(tex.source, 'width', { value: width, configurable: true });
  Object.defineProperty(tex.source, 'height', { value: height, configurable: true });
  Object.defineProperty(tex.source, 'pixelWidth', { value: width, configurable: true });
  Object.defineProperty(tex.source, 'pixelHeight', { value: height, configurable: true });
  tex.source.scaleMode = 'nearest';
  return tex;
}

function createDiskAwareProLoader(): ProAssetLoader {
  return new ProAssetLoader({
    loadJson: async (relPath) => {
      const clean = relPath.replace(/^\.\//, '');
      const abs = path.join(PUBLIC_DIR, clean);
      return fs.existsSync(abs) ? (JSON.parse(fs.readFileSync(abs, 'utf-8')) as unknown) : null;
    },
    loadImage: async () => null
  });
}

function createTrackingSeaDriver() {
  let manifest: PixiAssetsManifestPayload = { bundles: [] };
  const loadedBundles: string[] = [];
  const unloadedUrls: string[] = [];
  const liveByUrl = new Map<string, Texture>();

  const driver: PixiAssetsDriver = {
    reset: vi.fn(() => liveByUrl.clear()),
    init: vi.fn(async (opts) => {
      manifest = opts.manifest;
    }),
    loadBundle: vi.fn(async (bundleName, onProgress) => {
      loadedBundles.push(bundleName);
      const b = manifest.bundles.find((x) => x.name === bundleName);
      const out: Record<string, Texture> = {};
      for (const a of b?.assets ?? []) {
        const clean = a.src.replace(/^\.\//, '');
        let tex = liveByUrl.get(clean);
        if (!tex) {
          const isShip = clean.includes('ship_');
          const isSeaKing = clean.includes('ship_sea_king');
          tex = createMockTexture(
            clean,
            isSeaKing ? 576 : isShip ? 288 : 448,
            isSeaKing ? 1056 : isShip ? 528 : 112
          );
          liveByUrl.set(clean, tex);
        }
        for (const al of a.alias) out[al] = tex;
        out[a.src] = tex;
      }
      onProgress?.(1);
      return out;
    }),
    unload: vi.fn(async (urls) => {
      const arr = Array.isArray(urls) ? urls : [urls];
      for (const u of arr) {
        const clean = u.replace(/^\.\//, '');
        unloadedUrls.push(clean);
        liveByUrl.delete(clean);
      }
    })
  };

  return { driver, loadedBundles, unloadedUrls, liveByUrl };
}

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

describe('Wave 5 Step 3: SeaSailingScene WebGL2, 20 Landmarks/4 Ships WebP, 5x 3-Zone Round-Trip VRAM & Safe Area E2E', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('verifies all 20 landmarks and 4 ship sprite sheets are promoted to lossless .webp in pro_manifest.json with strict resolution caps', () => {
    const landmarkEntries = defaultProAssetManifest.entries.filter((e) =>
      e.id.startsWith('sea:landmark_')
    );
    expect(landmarkEntries.length).toBe(20);
    for (const ent of landmarkEntries) {
      expect(ent.status === 'IMPORTED' || ent.status === 'VERIFIED').toBe(true);
      expect(ent.assetPath.startsWith('assets/pro/landmarks/')).toBe(true);
      expect(ent.assetPath.endsWith('.webp')).toBe(true);
      expect(ent.dimensions.width).toBeLessThanOrEqual(1024);
      expect(ent.dimensions.height).toBeLessThanOrEqual(1024);
      expect(fs.existsSync(path.join(PUBLIC_DIR, ent.assetPath))).toBe(true);
    }

    const shipKeys = [
      'ship_going_merry',
      'ship_thousand_sunny',
      'ship_marine_warship',
      'ship_sea_king'
    ] as const;
    for (const key of shipKeys) {
      const ent = defaultProAssetManifest.entries.find((e) => e.id === `sea:${key}`);
      expect(ent, `Missing manifest entry sea:${key}`).toBeDefined();
      expect(ent!.status === 'IMPORTED' || ent!.status === 'VERIFIED').toBe(true);
      expect(ent!.assetPath).toBe(`assets/pro/sprites/${key}.webp`);
      const cap = key === 'ship_sea_king' ? 2048 : 1024;
      expect(ent!.dimensions.width).toBeLessThanOrEqual(cap);
      expect(ent!.dimensions.height).toBeLessThanOrEqual(cap);
      expect(fs.existsSync(path.join(PUBLIC_DIR, ent!.assetPath))).toBe(true);
      expect(fs.existsSync(path.join(PUBLIC_DIR, ent!.metaPath!))).toBe(true);
      expect(defaultProAssetManifest.sprites[key]).toBeDefined();
    }
  });

  it('maintains Single Active Sea Bundle Lock, unloads previous sea landmarks, preserves shared ships across 5x 3-zone round-trips, and leaks 0 RenderTextures', async () => {
    vi.stubGlobal('document', createMinimalMockDoc());
    const loader = createDiskAwareProLoader();
    const tracking = createTrackingSeaDriver();
    const manager = new PixiAssetBundleManager(loader, tracking.driver);
    const host = new PixiStageHost(loader, manager);

    await manager.init(defaultProAssetManifest);
    await manager.loadCoreBundle(['luffy']);

    const coreVram = manager.getVramTelemetry();
    // Core VRAM stays clean & untouched (< 4 MB) because ships live only in sea_* bundles
    expect(coreVram.estimatedVramMb).toBeLessThan(4);

    const cycle1Vram: number[] = [];
    const cycle5Vram: number[] = [];
    const zoneSequence: Array<'east_blue' | 'grand_line' | 'new_world'> = [
      'east_blue',
      'grand_line',
      'new_world'
    ];

    for (let cycle = 0; cycle < 5; cycle++) {
      for (const zId of zoneSequence) {
        const bundleName = resolveSeaBundleName(zId);
        const res = await manager.loadSceneBundles([bundleName]);
        expect(res.committed).toBe(true);

        const activeSea = manager
          .getActiveBundleNames()
          .filter((b) => b.startsWith('sea_'));
        expect(activeSea).toEqual([bundleName]);

        // Every landmark in the active zone is registered into ProAssetLoader
        const zLandmarks = defaultProAssetManifest.entries.filter(
          (e) => e.id.startsWith('sea:landmark_') && e.seaZoneId === zId
        );
        for (const lm of zLandmarks) {
          expect(loader.getLoadedTextureSync(lm.id)).not.toBeNull();
          expect(manager.getAssetRefCount(lm.assetPath)).toBe(1);
        }

        // Landmarks from inactive zones have refCount === 0
        const otherLandmarks = defaultProAssetManifest.entries.filter(
          (e) => e.id.startsWith('sea:landmark_') && e.seaZoneId !== zId
        );
        for (const oldLm of otherLandmarks) {
          expect(manager.getAssetRefCount(oldLm.assetPath)).toBe(0);
        }

        // All 4 ship atlases are hydrated while any sea zone is active
        expect(loader.getLoadedSpriteAtlasSync('ship_going_merry')).not.toBeNull();
        expect(loader.getLoadedSpriteAtlasSync('ship_thousand_sunny')).not.toBeNull();
        expect(loader.getLoadedSpriteAtlasSync('ship_marine_warship')).not.toBeNull();
        expect(loader.getLoadedSpriteAtlasSync('ship_sea_king')).not.toBeNull();

        const snap = manager.getVramTelemetry();
        expect(snap.overBudget).toBe(false);
        expect(snap.estimatedVramMb).toBeLessThan(MOBILE_VRAM_BUDGET_MB);
        if (cycle === 0) cycle1Vram.push(snap.estimatedVramBytes);
        if (cycle === 4) cycle5Vram.push(snap.estimatedVramBytes);
      }
    }

    expect(cycle5Vram).toEqual(cycle1Vram);
    expect(manager.getVramTelemetry().singleSeaLockReleases).toBeGreaterThanOrEqual(14);

    // Leaving Sea Sailing unloads ALL zone landmarks & ships cleanly back to core baseline
    await manager.loadSceneBundles([]);
    expect(manager.getVramTelemetry().totalLoadedUrls).toBe(coreVram.totalLoadedUrls);
    expect(manager.getVramTelemetry().estimatedVramBytes).toBe(coreVram.estimatedVramBytes);
    expect(manager.getAssetRefCount('assets/pro/sprites/ship_going_merry.webp')).toBe(0);

    // Scene lifecycle & RenderTexture leak check
    const seaScene = new PixiSeaSailingScene(host);
    const gameReg = defaultDataRegistry;
    const rpgReg = defaultRpgDataRegistry;
    const state = createInitialCampaignState(rpgReg, gameReg);
    const s25Viewport = computeResponsiveViewport(915, 412, 3, {
      top: 0,
      right: 36,
      bottom: 14,
      left: 44
    });

    await manager.loadSceneBundles(['sea_east_blue']);
    seaScene.render(
      state,
      rpgReg,
      {
        nearbyIsland: rpgReg.seaZones.east_blue.islands[0]!,
        nearbySeaGate: null,
        collectedNotice: null,
        triggeredBattle: null,
        activeShipId: 'going_merry',
        currentTailwindRatio: 0.25
      },
      30,
      s25Viewport,
      { ...DEFAULT_VISUAL_POLISH_CONFIG, timeOfDay: 'NIGHT' },
      1 / 60
    );
    expect(seaScene.getLastBoundProLandmarkCount()).toBe(6);
    expect(seaScene.getLastEmittedLightCount()).toBeGreaterThanOrEqual(2);

    // Completing Water 7 upgrades player ship to Thousand Sunny automatically
    completeEpisode(state, 'ep_water_seven', rpgReg, gameReg);
    seaScene.render(
      state,
      rpgReg,
      {
        nearbyIsland: null,
        nearbySeaGate: null,
        collectedNotice: null,
        triggeredBattle: null,
        activeShipId: 'thousand_sunny',
        currentTailwindRatio: 0.35
      },
      31,
      s25Viewport,
      { ...DEFAULT_VISUAL_POLISH_CONFIG, timeOfDay: 'SUNSET' },
      1 / 60
    );
    expect(seaScene.getLastEmittedLightCount()).toBeGreaterThanOrEqual(1);

    seaScene.dispose();
    host.releaseActiveScene();
    expect(host.trackedRenderTextureCount).toBe(0);
    host.dispose();
  });

  it('routes SEA_SAILING through PixiVerticalSliceController, syncs 60 chests with .tmj maps & preserves zero Safe Area overlap', async () => {
    vi.stubGlobal('document', createMinimalMockDoc());
    const loader = createDiskAwareProLoader();
    const tracking = createTrackingSeaDriver();
    const manager = new PixiAssetBundleManager(loader, tracking.driver);
    const host = new PixiStageHost(loader, manager);
    Object.defineProperty(host, 'isWebGLActive', { value: true, configurable: true });
    await manager.init(defaultProAssetManifest);
    await manager.loadCoreBundle(['luffy']);

    const gameReg = defaultDataRegistry;
    const rpgReg = defaultRpgDataRegistry;
    const campaign = createInitialCampaignState(rpgReg, gameReg);
    const storyDirector = new StoryDirector();

    // 1. Verify 60-chest total parity between RPG registry & compiled .tmj maps
    const tmjNameMap: Record<string, string> = {
      foosha_shells: 'foosha_village',
      wano_onigashima: 'wano_country'
    };
    let tmjChestSum = 0;
    for (const z of Object.values(rpgReg.seaZones)) {
      for (const isl of z.islands) {
        const tmjFile = `${tmjNameMap[isl.islandId] ?? isl.islandId}.tmj`;
        const absTmj = path.join(PUBLIC_DIR, 'assets/pro/maps', tmjFile);
        if (!fs.existsSync(absTmj)) continue;
        const rawTmj = JSON.parse(fs.readFileSync(absTmj, 'utf-8')) as {
          layers?: Array<{ objects?: Array<{ template?: string; type?: string }> }>;
        };
        const objs = (rawTmj.layers ?? []).flatMap((l) => l.objects ?? []);
        tmjChestSum += objs.filter(
          (o) => (o.template && o.template.includes('chest_hidden')) || o.type === 'CHEST'
        ).length;
      }
    }
    const globalProg = computeGlobalChestProgress(campaign, rpgReg);
    expect(globalProg.total).toBe(60);
    expect(tmjChestSum).toBe(60);
    expect(computeZoneChestProgress(campaign, 'east_blue', rpgReg).total).toBe(15);
    expect(computeZoneChestProgress(campaign, 'grand_line', rpgReg).total).toBe(21);
    expect(computeZoneChestProgress(campaign, 'new_world', rpgReg).total).toBe(24);

    // 2. Verify PixiVerticalSliceController resolves SEA_SAILING -> 'SEA' & tracks Fast Sail zone switches
    const dummyCtx = {
      clearRect: vi.fn(),
      fillRect: vi.fn(),
      strokeRect: vi.fn(),
      beginPath: vi.fn(),
      arc: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      closePath: vi.fn(),
      fill: vi.fn(),
      stroke: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      fillText: vi.fn()
    } as unknown as CanvasRenderingContext2D;

    const fakeRenderer = {
      ctx: dummyCtx,
      settings: { flashEffectEnabled: true },
      setBackgroundTransparent: vi.fn()
    } as unknown as CanvasRenderer;

    const battleWorld = createBattleWorld(
      {
        mode: '1V1',
        seed: 7,
        arenaSizeKey: 'large',
        teamAlpha: [createStandardPresetBuild('luffy', 'a_luffy', true, 0, gameReg)],
        teamOmega: [createStandardPresetBuild('buggy', 'o_buggy', false, 2, gameReg)]
      },
      gameReg
    );

    const sliceHost: VerticalSliceSceneHost = {
      activeScene: 'SEA_SAILING',
      islandRuntime: null,
      activeBattleContext: null,
      lastSailingStep: createInitialSailingStepState(),
      lastIslandStep: createInitialIslandStepState(),
      battleWorld,
      campaign,
      rpgRegistry: rpgReg,
      gameRegistry: gameReg,
      storyDirector,
      renderer: fakeRenderer,
      assets: {} as AssetLoader,
      tickCount: 10,
      fps: 60
    };

    const ctrl = new PixiVerticalSliceController(host);
    const s25 = computeResponsiveViewport(915, 412, 3, {
      top: 0,
      right: 36,
      bottom: 14,
      left: 44
    });

    expect(ctrl.resolveTargetSlice(sliceHost)).toBe('SEA');
    expect(ctrl.renderFrameIfVerticalSlice(sliceHost, s25, 1)).toBe(true);
    expect(ctrl.getActiveKind()).toBe('SEA');
    expect(ctrl.getActiveSeaZoneId()).toBe('east_blue');
    expect(dummyCtx.clearRect).toHaveBeenCalledWith(0, 0, s25.viewWidth, s25.viewHeight);

    // Fast Sail across sea zones after unlocking Grand Line -> updates activeSeaZoneId immediately
    for (const epId of [
      'ep_east_blue_start',
      'ep_orange_town',
      'ep_baratie',
      'ep_arlong_park',
      'ep_loguetown'
    ]) {
      completeEpisode(campaign, epId, rpgReg, gameReg);
    }
    campaign.episodeFlags[`${VISITED_ISLAND_FLAG_PREFIX}water_seven`] = true;
    const fastRes = executeFastSailToIsland(campaign, 'grand_line', 'water_seven', rpgReg);
    expect(fastRes.ok).toBe(true);
    expect(ctrl.renderFrameIfVerticalSlice(sliceHost, s25, 1)).toBe(true);
    expect(ctrl.getActiveSeaZoneId()).toBe('grand_line');

    // 3. Re-verify Safe Area HUD bounds including bottom-center SailingInteractionPrompt
    for (const vp of [
      s25,
      computeResponsiveViewport(1280, 720, 1, { top: 0, right: 0, bottom: 0, left: 0 })
    ]) {
      const safe = getSafeHudBounds(vp);
      const boxes = [
        { name: 'SailingStatusHUD', x: 10 + safe.left, y: 10 + safe.top, w: 272, h: 62 },
        { name: 'MissionTrackerHUD', x: 10 + safe.left, y: 78 + safe.top, w: 316, h: 44 },
        { name: 'LogPoseHUD', ...computeLogPoseHudRect('TRIPLE_NEEDLE_NEW_WORLD', safe) },
        { name: 'SeaMinimapHUD', ...computeSeaMinimapRect(safe) },
        { name: 'Prompt', x: safe.centerX - 190, y: safe.bottom - 54, w: 380, h: 40 },
        (() => {
          const j = computeJoystickHomeOrigin(vp, 1.0);
          return { name: 'Joystick', x: j.x - 48, y: j.y - 48, w: 96, h: 96 };
        })(),
        ...computeTouchButtonLayout(vp, 1.0)
          .filter((b) => b.id === 'SKILL_0' || b.id === 'DODGE')
          .map((b) => ({ name: b.id, x: b.x - b.r, y: b.y - b.r, w: b.r * 2, h: b.r * 2 }))
      ];
      for (let i = 0; i < boxes.length; i++) {
        const a = boxes[i]!;
        expect(a.x).toBeGreaterThanOrEqual(safe.left);
        expect(a.x + a.w).toBeLessThanOrEqual(safe.right);
        expect(a.y).toBeGreaterThanOrEqual(safe.top);
        expect(a.y + a.h).toBeLessThanOrEqual(safe.bottom);
        for (let j = i + 1; j < boxes.length; j++) {
          const b = boxes[j]!;
          const overlaps =
            a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
          expect(overlaps, `${a.name} overlaps ${b.name}`).toBe(false);
        }
      }
    }

    ctrl.dispose();
    expect(host.trackedRenderTextureCount).toBe(0);
  });
});
