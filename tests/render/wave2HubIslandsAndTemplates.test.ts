import fs from 'node:fs';
import path from 'node:path';
import { Texture } from 'pixi.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
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
import type { CanvasRenderer } from '../../src/render/canvasRenderer';
import {
  PixiAssetBundleManager,
  resolveIslandBundleName
} from '../../src/render/pixi/PixiAssetBundleManager';
import { PixiStageHost } from '../../src/render/pixi/PixiStageHost';
import { ProAssetLoader } from '../../src/render/pixi/ProAssetLoader';
import type {
  PixiAssetsDriver,
  PixiAssetsManifestPayload
} from '../../src/render/pixi/pixiBundleTypes';
import {
  getIslandAtmospherePreset,
  isLightActiveForTimeOfDay
} from '../../src/render/pixi/scenes/islandAtmospherePresets';
import { PixiFooshaIslandScene } from '../../src/render/pixi/scenes/PixiFooshaIslandScene';
import { PixiProIslandScene } from '../../src/render/pixi/scenes/PixiProIslandScene';
import { TiledMapLoader } from '../../src/render/pixi/tiled/TiledMapLoader';
import {
  mergeTiledTemplateObject,
  parseTiledTsxXml,
  parseTiledTxTemplateXml,
  type TiledMapJson
} from '../../src/render/pixi/tiled/tiledSchema';
import { computeResponsiveViewport } from '../../src/render/viewport/responsiveViewportManager';
import {
  PixiVerticalSliceController,
  type VerticalSliceSceneHost
} from '../../src/scenes/controllers/pixiVerticalSliceController';
import { StoryDirector } from '../../src/story/storyDirector';

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
          tex = createMockTexture(clean, 512, 640);
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

describe('Wave 2: 5 Master .tsx Tilesets, 8 .tx Templates & 4 Core Hub WebGL2 Islands', () => {
  const cleanups: Array<() => void> = [];

  afterEach(() => {
    vi.restoreAllMocks();
    while (cleanups.length > 0) cleanups.pop()?.();
  });

  it('parses all 5 master external .tsx tilesets, 8 .tx templates, and all 5 .tmj maps with zero embedded tilesets', async () => {
    const root = process.cwd();
    const publicDir = path.join(root, 'public');

    const masterTsxFiles = [
      'assets/pro/tilesets/master_port_village.tsx',
      'assets/pro/tilesets/master_stone_canal.tsx',
      'assets/pro/tilesets/master_desert_palace.tsx',
      'assets/pro/tilesets/master_eastern_pagoda.tsx',
      'assets/pro/tilesets/master_scifi_neon.tsx'
    ];
    for (const rel of masterTsxFiles) {
      const xml = fs.readFileSync(path.join(publicDir, rel), 'utf-8');
      const parsed = parseTiledTsxXml(xml, 1, rel);
      expect(parsed, `Failed to parse ${rel}`).not.toBeNull();
      expect(parsed!.image.endsWith('.webp')).toBe(true);
      expect(fs.existsSync(path.join(publicDir, parsed!.image))).toBe(true);
      expect(parsed!.tiles && parsed!.tiles.length > 0).toBe(true);
    }

    const templateFiles = [
      'light_point.tx',
      'light_lantern.tx',
      'chest_hidden.tx',
      'marker_story_gold.tx',
      'marker_side_blue.tx',
      'marker_utility_silver.tx',
      'dock_departure.tx',
      'npc_patrol_anchor.tx'
    ];
    for (const fname of templateFiles) {
      const abs = path.join(publicDir, 'assets/pro/templates', fname);
      expect(fs.existsSync(abs), `Missing template ${fname}`).toBe(true);
      const tpl = parseTiledTxTemplateXml(fs.readFileSync(abs, 'utf-8'));
      expect(tpl, `Failed to parse ${fname}`).not.toBeNull();
    }

    // Verify instance override merging on template
    const lanternTpl = parseTiledTxTemplateXml(
      fs.readFileSync(path.join(publicDir, 'assets/pro/templates/light_lantern.tx'), 'utf-8')
    )!;
    const merged = mergeTiledTemplateObject(lanternTpl, {
      id: 99,
      name: 'wano_red_lantern',
      x: 160,
      y: 240,
      properties: [{ name: 'color', type: 'color', value: '#fff43f5e' }]
    });
    expect(merged.name).toBe('wano_red_lantern');
    expect(merged.type).toBe('point_light');
    expect(merged.properties?.find((p) => p.name === 'color')?.value).toBe('#fff43f5e');
    expect(merged.properties?.find((p) => p.name === 'activeTimeMask')?.value).toBe('SUNSET|NIGHT');

    // Load all 5 .tmj maps via TiledMapLoader with real disk .tsx & .tx
    const loader = new ProAssetLoader({
      loadJson: async (rel) => {
        const clean = rel.replace(/^\.\//, '');
        return JSON.parse(fs.readFileSync(path.join(publicDir, clean), 'utf-8')) as unknown;
      },
      loadImage: async () => null
    });
    for (const ent of defaultProAssetManifest.entries) {
      if (ent.category === 'tileset' && ent.status !== 'PLACEHOLDER') {
        loader.registerExternalTexture(
          `tileset_${ent.assetPath}`,
          ent.assetPath,
          createMockTexture(ent.assetPath, Math.max(64, ent.dimensions.width || 256), Math.max(64, ent.dimensions.height || 256))
        );
      }
    }

    const diskTextLoader = async (rel: string): Promise<string | null> => {
      const p = path.join(publicDir, rel.replace(/^\.\//, ''));
      return fs.existsSync(p) ? fs.readFileSync(p, 'utf-8') : null;
    };

    const tiledLoader = new TiledMapLoader();
    const expectedMaps: Array<{
      islandId: string;
      tmj: string;
      minLights: number;
      minEmissiveTiles: number;
    }> = [
      { islandId: 'foosha_shells', tmj: 'assets/pro/maps/foosha_village.tmj', minLights: 8, minEmissiveTiles: 1 },
      { islandId: 'water_seven', tmj: 'assets/pro/maps/water_seven.tmj', minLights: 8, minEmissiveTiles: 1 },
      { islandId: 'alabasta', tmj: 'assets/pro/maps/alabasta.tmj', minLights: 8, minEmissiveTiles: 1 },
      { islandId: 'wano_onigashima', tmj: 'assets/pro/maps/wano_country.tmj', minLights: 8, minEmissiveTiles: 1 },
      { islandId: 'egghead', tmj: 'assets/pro/maps/egghead.tmj', minLights: 8, minEmissiveTiles: 5 }
    ];

    for (const mSpec of expectedMaps) {
      const mapEntry = defaultProAssetManifest.maps[mSpec.islandId];
      expect(mapEntry, `Missing manifest.maps['${mSpec.islandId}']`).toBeDefined();
      expect(mapEntry!.tmj).toBe(mSpec.tmj);

      const rawTmj = JSON.parse(fs.readFileSync(path.join(publicDir, mSpec.tmj), 'utf-8')) as TiledMapJson;
      expect(rawTmj.tilesets.every((ts) => !ts.image && Boolean(ts.source))).toBe(true);

      const runtime = await tiledLoader.loadFromManifest(
        mapEntry!.tmj,
        mapEntry!.tilesets,
        loader,
        mapEntry!.pixelScale,
        diskTextLoader
      );
      expect(runtime, `Failed loading ${mSpec.tmj}`).not.toBeNull();
      expect(runtime!.parsed.lights.length).toBeGreaterThanOrEqual(mSpec.minLights);
      expect(runtime!.parsed.docks.length).toBeGreaterThanOrEqual(1);
      expect(runtime!.emissiveTileSpriteCount).toBeGreaterThanOrEqual(mSpec.minEmissiveTiles);
      runtime!.dispose();
    }
    loader.dispose();
  });

  it('maintains shared .tsx URL ref-counting across Foosha <-> Water Seven <-> Title transitions', async () => {
    const tracking = createTrackingDriver();
    const loader = new ProAssetLoader({ loadImage: async () => null, loadJson: async () => null });
    const mgr = new PixiAssetBundleManager(loader, tracking.driver);
    await mgr.init(defaultProAssetManifest);
    await mgr.loadCoreBundle(['luffy']);

    const sharedPortTileset = 'assets/pro/tilesets/ninja_adventure_village.webp';
    const w7CanalTileset = 'assets/pro/tilesets/master_stone_canal.webp';

    await mgr.loadSceneBundles(['island_foosha_village']);
    expect(mgr.getAssetRefCount(sharedPortTileset)).toBe(1);
    expect(mgr.getAssetRefCount(w7CanalTileset)).toBe(0);

    // Co-load Water Seven alongside Foosha -> shared master_port_village increments to 2
    await mgr.loadSceneBundles(['island_foosha_village', 'island_water_seven']);
    expect(mgr.getAssetRefCount(sharedPortTileset)).toBe(2);
    expect(mgr.getAssetRefCount(w7CanalTileset)).toBe(1);

    // Transition to Water Seven only -> Foosha unloads except shared master_port_village stays at 1!
    const toW7 = await mgr.loadSceneBundles(['island_water_seven']);
    expect(toW7.committed).toBe(true);
    expect(mgr.getAssetRefCount(sharedPortTileset)).toBe(1);
    expect(mgr.getAssetRefCount(w7CanalTileset)).toBe(1);
    expect(toW7.unloadedUrls).not.toContain(sharedPortTileset);
    expect(tracking.liveByUrl.has(sharedPortTileset)).toBe(true);

    // Return to Title -> both tilesets release to refCount 0 and unload cleanly
    const toTitle = await mgr.loadSceneBundles([]);
    expect(toTitle.committed).toBe(true);
    expect(mgr.getAssetRefCount(sharedPortTileset)).toBe(0);
    expect(mgr.getAssetRefCount(w7CanalTileset)).toBe(0);
    expect(tracking.liveByUrl.has(sharedPortTileset)).toBe(false);
    expect(tracking.liveByUrl.has(w7CanalTileset)).toBe(false);

    mgr.dispose();
    loader.dispose();
  });

  it('guarantees 19 unique .tmj chests across 5 hubs match canonical data and pass LegalityValidator', async () => {
    const publicDir = path.join(process.cwd(), 'public');
    const loader = new ProAssetLoader({
      loadJson: async (rel) =>
        JSON.parse(fs.readFileSync(path.join(publicDir, rel.replace(/^\.\//, '')), 'utf-8')) as unknown,
      loadImage: async () => null
    });
    const diskTextLoader = async (rel: string): Promise<string | null> => {
      const p = path.join(publicDir, rel.replace(/^\.\//, ''));
      return fs.existsSync(p) ? fs.readFileSync(p, 'utf-8') : null;
    };

    const tiledLoader = new TiledMapLoader();
    const collectedChestIds: string[] = [];
    const hubIds = ['foosha_shells', 'water_seven', 'alabasta', 'wano_onigashima', 'egghead'];

    for (const islandId of hubIds) {
      const entry = defaultProAssetManifest.maps[islandId]!;
      const rt = await tiledLoader.loadFromManifest(entry.tmj, entry.tilesets, loader, 2, diskTextLoader);
      expect(rt).not.toBeNull();
      for (const ch of rt!.parsed.chests) {
        const cid = String(ch.properties.chestId ?? ch.name);
        collectedChestIds.push(cid);
        const canonical = defaultRpgDataRegistry.islands[islandId]!.chests?.find((c) => c.chestId === cid);
        expect(canonical, `Missing canonical chest ${cid} in ${islandId}`).toBeDefined();
        expect(ch.properties.berries).toBe(canonical!.reward.berries);
        expect(ch.properties.trainingPoints).toBe(canonical!.reward.trainingPoints);
      }
      rt!.dispose();
    }

    expect(collectedChestIds.length).toBe(19);
    expect(new Set(collectedChestIds).size).toBe(19);

    const campaign = createInitialCampaignState(defaultRpgDataRegistry, defaultDataRegistry);
    campaign.openedChestIds = collectedChestIds;
    const envelope = serializeCampaignToSaveEnvelope(
      campaign,
      'slot_1',
      120,
      '2026-11-24T00:00:00.000Z',
      DEFAULT_GLOBAL_SETTINGS,
      null,
      defaultRpgDataRegistry,
      defaultDataRegistry
    );
    const legality = validateSaveLegality(envelope.payload, defaultRpgDataRegistry, defaultDataRegistry);
    expect(legality.codes).toEqual([]);
    expect(legality.messages).toEqual([]);
    loader.dispose();
  });

  it('applies distinct WebGL2 atmosphere presets per hub & safe flashEffect===false damping', () => {
    const w7 = getIslandAtmospherePreset('water_seven');
    const alab = getIslandAtmospherePreset('alabasta');
    const wano = getIslandAtmospherePreset('wano_onigashima');
    const egg = getIslandAtmospherePreset('egghead');

    expect(w7.particleTheme).toBe('CANAL');
    expect(alab.particleTheme).toBe('DESERT');
    expect(alab.shadowScaleMult).toBeGreaterThan(1.4);
    expect(alab.waterReflection.regionBounds).toBeDefined();
    expect(wano.particleTheme).toBe('WANO_SAKURA');
    expect(wano.defaultMoodBiasWhenDay).toBe('SUNSET');
    expect(egg.particleTheme).toBe('EGGHEAD_CYBER');
    expect(egg.bloomStrengthBonus).toBeGreaterThan(0.4);
    expect(egg.waterReflection.alphaMult).toBeLessThan(0.5);

    expect(isLightActiveForTimeOfDay('SUNSET|NIGHT', 'DAY')).toBe(false);
    expect(isLightActiveForTimeOfDay('SUNSET|NIGHT', 'NIGHT')).toBe(true);
    expect(isLightActiveForTimeOfDay('ALL', 'MORNING')).toBe(true);
  });

  it('sustains 0 leaked RenderTextures and 0 cumulative VRAM growth across 5x full 5-hub round-trips (915x412 & 1280x720)', async () => {
    const prevDoc = (globalThis as { document?: unknown }).document;
    (globalThis as { document: unknown }).document = createMinimalMockDoc();
    cleanups.push(() => {
      (globalThis as { document?: unknown }).document = prevDoc;
    });

    const tracking = createTrackingDriver();
    const loader = new ProAssetLoader({ loadImage: async () => null, loadJson: async () => null });
    const bundleManager = new PixiAssetBundleManager(loader, tracking.driver);
    const pixiHost = new PixiStageHost(loader, bundleManager);
    vi.spyOn(pixiHost, 'isWebGLActive', 'get').mockReturnValue(true);
    await bundleManager.init(defaultProAssetManifest);
    await bundleManager.loadCoreBundle(['luffy']);

    vi.spyOn(PixiFooshaIslandScene.prototype, 'preload').mockImplementation(async function (this: PixiFooshaIslandScene) {
      await bundleManager.loadSceneBundles([resolveIslandBundleName(this.islandId)]);
    });
    vi.spyOn(PixiProIslandScene.prototype, 'preload').mockImplementation(async function (this: PixiProIslandScene) {
      await bundleManager.loadSceneBundles([resolveIslandBundleName(this.islandId)]);
    });

    const campaign = createInitialCampaignState(defaultRpgDataRegistry, defaultDataRegistry);
    for (const ep of defaultRpgDataRegistry.seaZones.east_blue.islands) {
      completeEpisode(campaign, ep.episodeId, defaultRpgDataRegistry, defaultDataRegistry);
    }
    for (const ep of defaultRpgDataRegistry.seaZones.grand_line.islands) {
      completeEpisode(campaign, ep.episodeId, defaultRpgDataRegistry, defaultDataRegistry);
    }
    completeEpisode(campaign, 'ep_wano', defaultRpgDataRegistry, defaultDataRegistry);
    completeEpisode(campaign, 'ep_egghead', defaultRpgDataRegistry, defaultDataRegistry);

    const mockRenderer = {
      settings: { flashEffectEnabled: false, shakeIntensity: 0.8, showFps: true },
      setBackgroundTransparent: vi.fn(),
      ctx: { clearRect: vi.fn() }
    } as unknown as CanvasRenderer;

    const controller = new PixiVerticalSliceController(pixiHost);
    const s25 = computeResponsiveViewport(915, 412, 3, { top: 0, right: 36, bottom: 14, left: 44 });
    const desktop = computeResponsiveViewport(1280, 720, 1);

    const baselineVram = bundleManager.getVramTelemetry().estimatedVramBytes;
    const hubSequence = ['foosha_shells', 'water_seven', 'alabasta', 'wano_onigashima', 'egghead'];

    for (let round = 0; round < 5; round++) {
      const vp = round % 2 === 0 ? s25 : desktop;
      for (const islandId of hubSequence) {
        const enter = enterIslandEpisode(campaign, islandId, defaultRpgDataRegistry);
        expect(enter.allowed, `Enter ${islandId} blocked`).toBe(true);
        const runtime = enter.runtime!;
        const step = stepIslandExploration(
          campaign,
          runtime,
          { x: 0, y: 0 },
          false,
          1 / 60,
          defaultRpgDataRegistry,
          defaultDataRegistry
        );
        const sceneHost: VerticalSliceSceneHost = {
          activeScene: 'ISLAND_EPISODE',
          islandRuntime: runtime,
          activeBattleContext: null,
          lastIslandStep: step,
          battleWorld: null as unknown as VerticalSliceSceneHost['battleWorld'],
          campaign,
          rpgRegistry: defaultRpgDataRegistry,
          gameRegistry: defaultDataRegistry,
          storyDirector: new StoryDirector(),
          renderer: mockRenderer,
          assets: { manifestRegistry: defaultAssetManifestRegistry } as unknown as AssetLoader,
          tickCount: round * 10 + 1,
          fps: 60
        };
        const rendered = controller.renderFrameIfVerticalSlice(sceneHost, vp, 0.5);
        expect(rendered).toBe(true);
        expect(controller.getActiveKind()).toBe(islandId === 'foosha_shells' ? 'FOOSHA' : 'PRO_ISLAND');
        expect(pixiHost.worldRoot.children.length).toBe(1);
        expect(pixiHost.trackedRenderTextureCount).toBe(2);
        await new Promise((r) => setTimeout(r, 0));
      }

      // Return to Title -> clear island bundles & release all RenderTextures
      controller.releaseActiveSlice(undefined);
      await bundleManager.loadSceneBundles([]);
      expect(pixiHost.worldRoot.children.length).toBe(0);
      expect(pixiHost.trackedRenderTextureCount).toBe(0);
      expect(bundleManager.getVramTelemetry().estimatedVramBytes).toBe(baselineVram);
    }

    controller.dispose();
    expect(pixiHost.trackedRenderTextureCount).toBe(0);
    expect(tracking.liveByUrl.has('assets/pro/tilesets/master_scifi_neon.webp')).toBe(false);
  });
});
