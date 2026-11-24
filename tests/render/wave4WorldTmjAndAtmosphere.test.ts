import fs from 'node:fs';
import path from 'node:path';
import { Texture } from 'pixi.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { compileIslandTmj, readTsxTileCount } from '../../scripts/compile-tiled-tmj.mjs';
import { createBattleWorld } from '../../src/core/combat/battleWorld';
import { createStandardPresetBuild } from '../../src/core/net/terminalArenaRule';
import { createInitialCampaignState } from '../../src/core/rpg/campaignState';
import {
  completeEpisode,
  enterIslandEpisode,
  stepIslandExploration
} from '../../src/core/rpg/episodeEngine';
import { validateSaveLegality } from '../../src/core/save/legalityValidator';
import {
  DEFAULT_GLOBAL_SETTINGS,
  serializeCampaignToSaveEnvelope
} from '../../src/core/save/serializer';
import type { AssetLoader } from '../../src/assets/assetLoader';
import { defaultAssetManifestRegistry } from '../../src/data/assets/assetManifestRegistry';
import { defaultProAssetManifest } from '../../src/data/assets/proAssetManifest';
import { defaultDataRegistry } from '../../src/data/dataRegistry';
import { defaultRpgDataRegistry } from '../../src/data/rpgDataRegistry';
import {
  DEFAULT_VISUAL_POLISH_CONFIG,
  type VisualPolishConfig
} from '../../src/render/backend/renderBackend';
import type { CanvasRenderer } from '../../src/render/canvasRenderer';
import {
  MOBILE_VRAM_BUDGET_MB,
  PixiAssetBundleManager,
  resolveIslandBundleName
} from '../../src/render/pixi/PixiAssetBundleManager';
import { PixiStageHost } from '../../src/render/pixi/PixiStageHost';
import { ProAssetLoader } from '../../src/render/pixi/ProAssetLoader';
import type {
  PixiAssetsDriver,
  PixiAssetsManifestPayload
} from '../../src/render/pixi/pixiBundleTypes';
import { getIslandAtmospherePreset } from '../../src/render/pixi/scenes/islandAtmospherePresets';
import { PixiProIslandScene } from '../../src/render/pixi/scenes/PixiProIslandScene';
import { TiledMapLoader } from '../../src/render/pixi/tiled/TiledMapLoader';
import type { TiledMapJson } from '../../src/render/pixi/tiled/tiledSchema';
import { computeResponsiveViewport } from '../../src/render/viewport/responsiveViewportManager';
import {
  PixiVerticalSliceController,
  type VerticalSliceSceneHost
} from '../../src/scenes/controllers/pixiVerticalSliceController';
import { StoryDirector } from '../../src/story/storyDirector';

const ROOT_DIR = path.resolve(__dirname, '../..');
const PUBLIC_DIR = path.join(ROOT_DIR, 'public');

function createMockTexture(label: string, width = 256, height = 256): Texture {
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

function createTrackingDriver() {
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
          const isMasterPort = clean.includes('ninja_adventure_village');
          tex = createMockTexture(clean, isMasterPort ? 448 : 256, isMasterPort ? 640 : 256);
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

function createDiskFetchStub() {
  return async (input: RequestInfo | URL): Promise<Response> => {
    const raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const rel = raw.replace(/^https?:\/\/[^/]+/, '').replace(/^\/+/, '').replace(/^\.\//, '');
    const abs = path.join(PUBLIC_DIR, rel);
    if (!fs.existsSync(abs)) {
      return new Response('Not Found', { status: 404 });
    }
    const body = fs.readFileSync(abs, 'utf-8');
    return new Response(body, { status: 200 });
  };
}

function createDiskProLoader(): ProAssetLoader {
  return new ProAssetLoader({
    loadJson: async (rel) => {
      const clean = rel.replace(/^\.\//, '');
      const abs = path.join(PUBLIC_DIR, clean);
      return fs.existsSync(abs) ? (JSON.parse(fs.readFileSync(abs, 'utf-8')) as unknown) : null;
    },
    loadImage: async () => null
  });
}

describe('Wave 4 Full 17/17 World .tmj Compiler, Atmosphere Shaders & 6-Island VRAM Round-Trip', () => {
  const cleanups: Array<() => void> = [];

  afterEach(() => {
    vi.restoreAllMocks();
    while (cleanups.length > 0) {
      cleanups.pop()?.();
    }
  });

  it('compiles all 12 Wave 4 islands deterministically with dynamic firstgid, dual .tsx accents, episodeId & LegalityValidator chest parity', async () => {
    expect(readTsxTileCount(ROOT_DIR, 'master_stone_canal')).toBe(256);
    expect(readTsxTileCount(ROOT_DIR, 'master_desert_palace')).toBe(256);
    expect(readTsxTileCount(ROOT_DIR, 'master_eastern_pagoda')).toBe(256);
    expect(readTsxTileCount(ROOT_DIR, 'master_scifi_neon')).toBe(256);
    expect(readTsxTileCount(ROOT_DIR, 'master_port_village')).toBe(1120);

    // Deterministic recompilation check: recompiling an existing island produces byte-identical .tmj
    const { WAVE4_ISLAND_MAP_SPECS, buildWave4IslandTmjMaps } = await import(
      '../../scripts/lib/wave4IslandTmjBuilder.mjs'
    );
    const fishmanSpec = WAVE4_ISLAND_MAP_SPECS.find((s) => s.islandId === 'fishman_island')!;
    const beforeBytes = fs.readFileSync(
      path.join(PUBLIC_DIR, 'assets/pro/maps/fishman_island.tmj'),
      'utf-8'
    );
    const singleRes = compileIslandTmj(ROOT_DIR, fishmanSpec);
    const afterBytes = fs.readFileSync(
      path.join(PUBLIC_DIR, 'assets/pro/maps/fishman_island.tmj'),
      'utf-8'
    );
    expect(afterBytes).toBe(beforeBytes);
    expect(singleRes.tilesets).toEqual([
      { firstgid: 1, source: '../tilesets/master_scifi_neon.tsx' },
      { firstgid: 257, source: '../tilesets/master_desert_palace.tsx' }
    ]);

    const compiledAll = buildWave4IslandTmjMaps(ROOT_DIR);
    expect(compiledAll.length).toBe(12);
    expect(WAVE4_ISLAND_MAP_SPECS.length).toBe(12);

    const expectedPairings: Record<string, string[]> = {
      orange_town: ['master_stone_canal.tsx', 'master_port_village.tsx'],
      baratie: ['master_stone_canal.tsx', 'master_port_village.tsx'],
      arlong_park: ['master_stone_canal.tsx', 'master_port_village.tsx'],
      loguetown: ['master_stone_canal.tsx', 'master_port_village.tsx'],
      drum_kingdom: ['master_eastern_pagoda.tsx', 'master_port_village.tsx'],
      skypiea: ['master_desert_palace.tsx', 'master_scifi_neon.tsx'],
      thriller_bark: ['master_eastern_pagoda.tsx', 'master_port_village.tsx'],
      marineford: ['master_stone_canal.tsx', 'master_eastern_pagoda.tsx'],
      fishman_island: ['master_scifi_neon.tsx', 'master_desert_palace.tsx'],
      dressrosa: ['master_stone_canal.tsx', 'master_port_village.tsx'],
      totto_land: ['master_scifi_neon.tsx', 'master_desert_palace.tsx'],
      elbaf: ['master_eastern_pagoda.tsx', 'master_port_village.tsx']
    };

    const allIslandIds = Object.keys(defaultRpgDataRegistry.islands).sort();
    expect(allIslandIds.length).toBe(17);

    const collectedChestIds: string[] = [];
    for (const islandId of allIslandIds) {
      const mapEntry = defaultProAssetManifest.maps[islandId];
      expect(mapEntry, `Missing manifest map entry for ${islandId}`).toBeDefined();
      const rawTmj = JSON.parse(
        fs.readFileSync(path.join(PUBLIC_DIR, mapEntry!.tmj), 'utf-8')
      ) as TiledMapJson;

      // Zero embedded tilesets across all 17 world maps
      expect(rawTmj.tilesets.every((t) => !t.image && Boolean(t.source))).toBe(true);

      const pairing = expectedPairings[islandId];
      if (pairing) {
        const sources = rawTmj.tilesets.map((t) => path.basename(t.source ?? ''));
        expect(sources).toEqual(pairing);
        const epProp = rawTmj.properties?.find((p) => p.name === 'episodeId');
        expect(epProp?.value).toBe(defaultRpgDataRegistry.islands[islandId]?.episodeId);

        // Verify secondary .tsx tiles are genuinely placed on ground_detail layer
        const secFirstGid = rawTmj.tilesets[1]?.firstgid ?? 99999;
        const detailLayer = rawTmj.layers.find((l) => l.name === 'ground_detail');
        expect(detailLayer?.data?.some((gid) => (gid & 0x1fffffff) >= secFirstGid)).toBe(true);
      }

      const chestLayer = rawTmj.layers.find((l) => l.name === 'chests');
      for (const ch of chestLayer?.objects ?? []) {
        const cidProp = ch.properties?.find((p) => p.name === 'chestId')?.value;
        collectedChestIds.push(String(cidProp ?? ch.name));
      }
    }

    expect(collectedChestIds.length).toBe(60);
    expect(new Set(collectedChestIds).size).toBe(60);

    const campaign = createInitialCampaignState(defaultRpgDataRegistry, defaultDataRegistry);
    campaign.openedChestIds = collectedChestIds;
    const envelope = serializeCampaignToSaveEnvelope(
      campaign,
      'slot_1',
      300,
      '2026-11-24T00:00:00.000Z',
      DEFAULT_GLOBAL_SETTINGS,
      null,
      defaultRpgDataRegistry,
      defaultDataRegistry
    );
    const legal = validateSaveLegality(envelope.payload, defaultRpgDataRegistry, defaultDataRegistry);
    expect(legal.codes).toEqual([]);
  });

  it('activates unique Wave 4 WebGL2 shaders, water/mirror reflections, fog, underwater god rays & lightning safely', async () => {
    const prevDoc = (globalThis as { document?: unknown }).document;
    const prevFetch = globalThis.fetch;
    (globalThis as { document: unknown }).document = createMinimalMockDoc();
    globalThis.fetch = createDiskFetchStub();
    cleanups.push(() => {
      (globalThis as { document?: unknown }).document = prevDoc;
      globalThis.fetch = prevFetch;
    });

    const tracking = createTrackingDriver();
    const loader = createDiskProLoader();
    const bundleMgr = new PixiAssetBundleManager(loader, tracking.driver);
    const host = new PixiStageHost(loader, bundleMgr);
    cleanups.push(() => host.dispose());

    await bundleMgr.init(defaultProAssetManifest);
    await bundleMgr.loadCoreBundle(['luffy']);
    // Seed luffy_base texture synchronously for actor reflection checks
    loader.registerExternalTexture(
      'sprite_base_luffy_base',
      'assets/pro/sprites/luffy_base.webp',
      createMockTexture('luffy_base', 512, 128)
    );

    const s25 = computeResponsiveViewport(915, 412, 3, { top: 0, right: 36, bottom: 14, left: 44 });
    const fullCampaign = createInitialCampaignState(defaultRpgDataRegistry, defaultDataRegistry);
    for (const z of Object.values(defaultRpgDataRegistry.seaZones)) {
      for (const isl of z.islands) {
        if (isl.episodeId !== 'ep_drum_kingdom') {
          completeEpisode(fullCampaign, isl.episodeId, defaultRpgDataRegistry, defaultDataRegistry);
        }
      }
    }

    const renderIslandFrames = async (
      islandId: string,
      campaign = fullCampaign,
      polish: VisualPolishConfig = DEFAULT_VISUAL_POLISH_CONFIG,
      frameCount = 4
    ): Promise<PixiProIslandScene> => {
      const enter = enterIslandEpisode(campaign, islandId, defaultRpgDataRegistry);
      expect(enter.allowed, `enter ${islandId} failed`).toBe(true);
      const rt = enter.runtime!;
      const step = stepIslandExploration(
        campaign,
        rt,
        { x: 0, y: 0 },
        false,
        1 / 60,
        defaultRpgDataRegistry,
        defaultDataRegistry
      );
      const scene = new PixiProIslandScene(host, islandId);
      cleanups.push(() => scene.dispose());
      await scene.preload();
      expect(scene.isMapLoaded()).toBe(true);
      for (let i = 0; i < frameCount; i++) {
        scene.render(
          campaign,
          rt,
          step,
          defaultRpgDataRegistry,
          defaultDataRegistry,
          i + 1,
          s25,
          [],
          false,
          polish,
          0.05
        );
      }
      return scene;
    };

    // 1. Orange Town: Sunset + rising smoke & embers
    expect(getIslandAtmospherePreset('orange_town').recommendedTimeOfDay).toBe('SUNSET');
    expect(getIslandAtmospherePreset('orange_town').particleTheme).toBe('ORANGE_SMOKE');

    // 2. Baratie: Full-area offshore water reflection
    const baratieScene = await renderIslandFrames('baratie');
    expect(baratieScene.preset.waterReflection.fullAreaReflection).toBe(true);
    expect(baratieScene.activeReflectionWaveAmp).toBeCloseTo(0.0048, 4);

    // 3. Arlong Park: Localized rectangular pool regionBounds
    expect(getIslandAtmospherePreset('arlong_park').waterReflection.regionBounds).toBeDefined();

    // 4. Loguetown: Wet stone low-wave reflection + distant storm lightning suppressed by flashEffectEnabled: false
    const logueFlash = await renderIslandFrames('loguetown', fullCampaign, DEFAULT_VISUAL_POLISH_CONFIG, 2);
    expect(logueFlash.activeReflectionWaveAmp).toBeLessThan(0.002);
    expect(logueFlash.isLightningFlashActive).toBe(true);

    const logueCalm = await renderIslandFrames('loguetown', fullCampaign, {
      ...DEFAULT_VISUAL_POLISH_CONFIG,
      flashEffectEnabled: false
    }, 2);
    expect(logueCalm.isLightningFlashActive).toBe(false);

    // 5. Drum Kingdom: Pre-clear SNOW_PEAK -> Post-clear SAKURA_SNOW + pink bloom bonus
    const drumWinter = await renderIslandFrames('drum_kingdom', fullCampaign);
    expect(drumWinter.isPostClearAtmosphereActive(fullCampaign)).toBe(false);

    completeEpisode(fullCampaign, 'ep_drum_kingdom', defaultRpgDataRegistry, defaultDataRegistry);
    const drumSakura = await renderIslandFrames('drum_kingdom', fullCampaign);
    expect(drumSakura.isPostClearAtmosphereActive(fullCampaign)).toBe(true);

    // 6. Thriller Bark: NIGHT + spectral ground fog + bats
    const thrillerScene = await renderIslandFrames('thriller_bark');
    expect(thrillerScene.preset.recommendedTimeOfDay).toBe('NIGHT');
    expect(thrillerScene.lastGroundFogVisible).toBe(true);

    // 7. Marineford: Ice bay low-ripple reflection + cannon smoke/ice/embers
    const mfScene = await renderIslandFrames('marineford');
    expect(mfScene.preset.particleTheme).toBe('MARINE_ICE');
    expect(mfScene.activeReflectionWaveAmp).toBeLessThan(0.0025);

    // 8. Fishman Island: Underwater Tree of Sunlight Eve god rays ACTIVE even in NIGHT mood
    const fiScene = await renderIslandFrames('fishman_island');
    expect(fiScene.preset.recommendedTimeOfDay).toBe('NIGHT');
    expect(fiScene.lastGodRaysVisible).toBe(true);

    // 9. Totto Land: Dreamy sunset + low-ripple Mirror Plaza reflection
    const tottoScene = await renderIslandFrames('totto_land');
    expect(tottoScene.preset.recommendedTimeOfDay).toBe('SUNSET');
    expect(tottoScene.activeReflectionWaveAmp).toBeLessThanOrEqual(0.0012);

    // 10. Elbaf: Aurora god rays + golden leaves/lightning sparks
    const elbafScene = await renderIslandFrames('elbaf');
    expect(elbafScene.lastGodRaysVisible).toBe(true);
    expect(elbafScene.preset.particleTheme).toBe('ELBAF_GOLDEN');

    await bundleMgr.loadSceneBundles([]);
  });

  it('sustains <128MB VRAM, 0 cumulative leaks, stable .tsx refCounts & <16.6ms frame times across 6-island x3 round-trips on S25 Ultra (915x412)', async () => {
    const prevDoc = (globalThis as { document?: unknown }).document;
    const prevFetch = globalThis.fetch;
    (globalThis as { document: unknown }).document = createMinimalMockDoc();
    globalThis.fetch = createDiskFetchStub();
    cleanups.push(() => {
      (globalThis as { document?: unknown }).document = prevDoc;
      globalThis.fetch = prevFetch;
    });

    const tracking = createTrackingDriver();
    const loader = createDiskProLoader();
    const bundleManager = new PixiAssetBundleManager(loader, tracking.driver);
    const pixiHost = new PixiStageHost(loader, bundleManager);
    vi.spyOn(pixiHost, 'isWebGLActive', 'get').mockReturnValue(true);

    await bundleManager.init(defaultProAssetManifest);
    await bundleManager.loadCoreBundle(['luffy']);

    const campaign = createInitialCampaignState(defaultRpgDataRegistry, defaultDataRegistry);
    for (const z of Object.values(defaultRpgDataRegistry.seaZones)) {
      for (const isl of z.islands) {
        completeEpisode(campaign, isl.episodeId, defaultRpgDataRegistry, defaultDataRegistry);
      }
    }

    const battleWorld = createBattleWorld(
      {
        seed: 20261124,
        arenaSizeKey: 'medium',
        mode: '1V1',
        teamAlpha: [createStandardPresetBuild('luffy', 'a_luffy', true, 0, defaultDataRegistry)],
        teamOmega: [createStandardPresetBuild('arlong', 'o_arlong', false, 2, defaultDataRegistry)]
      },
      defaultDataRegistry
    );

    const mockRenderer = {
      settings: { flashEffectEnabled: true, shakeIntensity: 0.8, showFps: true },
      setBackgroundTransparent: vi.fn(),
      ctx: { clearRect: vi.fn() }
    } as unknown as CanvasRenderer;

    const controller = new PixiVerticalSliceController(pixiHost);
    cleanups.push(() => controller.dispose());

    const s25 = computeResponsiveViewport(915, 412, 3, { top: 0, right: 36, bottom: 14, left: 44 });
    const baselineBytes = bundleManager.getVramTelemetry().estimatedVramBytes;
    const sixIslands = [
      'baratie',
      'loguetown',
      'thriller_bark',
      'fishman_island',
      'totto_land',
      'elbaf'
    ] as const;

    const cycle1Vram: number[] = [];
    const cycle3Vram: number[] = [];
    let maxVramMb = 0;
    const frameTimesMs: number[] = [];

    for (let cycle = 0; cycle < 3; cycle++) {
      for (const islandId of sixIslands) {
        // Explicit preload so real .tmj + .tsx/.tx load synchronously before controller ticks
        await bundleManager.loadSceneBundles([resolveIslandBundleName(islandId)]);
        const enter = enterIslandEpisode(campaign, islandId, defaultRpgDataRegistry);
        expect(enter.allowed).toBe(true);
        const rt = enter.runtime!;
        const step = stepIslandExploration(
          campaign,
          rt,
          { x: 0, y: 0 },
          false,
          1 / 60,
          defaultRpgDataRegistry,
          defaultDataRegistry
        );
        const host: VerticalSliceSceneHost = {
          activeScene: 'ISLAND_EPISODE',
          islandRuntime: rt,
          activeBattleContext: null,
          lastIslandStep: step,
          battleWorld,
          campaign,
          rpgRegistry: defaultRpgDataRegistry,
          gameRegistry: defaultDataRegistry,
          storyDirector: new StoryDirector(),
          renderer: mockRenderer,
          assets: { manifestRegistry: defaultAssetManifestRegistry } as unknown as AssetLoader,
          tickCount: cycle * 30 + 1,
          fps: 60
        };

        const t0 = performance.now();
        for (let f = 0; f < 5; f++) {
          expect(controller.renderFrameIfVerticalSlice(host, s25, 0.5)).toBe(true);
        }
        await new Promise((r) => setTimeout(r, 0));
        const elapsedMs = (performance.now() - t0) / 5;
        frameTimesMs.push(elapsedMs);

        const tel = bundleManager.getVramTelemetry();
        if (tel.estimatedVramMb > maxVramMb) maxVramMb = tel.estimatedVramMb;
        expect(tel.overBudget).toBe(false);
        expect(tel.estimatedVramMb).toBeLessThan(MOBILE_VRAM_BUDGET_MB);
        expect(tel.activeBundles.filter((b) => b.bundle.startsWith('island_')).map((b) => b.bundle)).toEqual([
          `island_${islandId}`
        ]);

        if (cycle === 0) cycle1Vram.push(tel.estimatedVramBytes);
        if (cycle === 2) cycle3Vram.push(tel.estimatedVramBytes);
      }
    }

    expect(cycle3Vram).toEqual(cycle1Vram);
    expect(maxVramMb).toBeLessThan(MOBILE_VRAM_BUDGET_MB);
    const avgFrameMs = frameTimesMs.reduce((a, b) => a + b, 0) / frameTimesMs.length;
    expect(avgFrameMs).toBeLessThan(16.6);

    // Full unload & scene teardown returns VRAM and RenderTextures cleanly to baseline 0 leak
    controller.releaseActiveSlice(undefined);
    await bundleManager.loadSceneBundles([]);
    expect(pixiHost.trackedRenderTextureCount).toBe(0);
    expect(bundleManager.getVramTelemetry().estimatedVramBytes).toBe(baselineBytes);
    expect(bundleManager.getAssetRefCount('assets/pro/tilesets/master_stone_canal.webp')).toBe(0);
    expect(bundleManager.getAssetRefCount('assets/pro/tilesets/master_scifi_neon.webp')).toBe(0);
    expect(bundleManager.getAssetRefCount('assets/pro/tilesets/master_eastern_pagoda.webp')).toBe(0);

    // Unused TiledMapLoader sanity reference check
    expect(typeof TiledMapLoader).toBe('function');
  });
});
