import fs from 'node:fs';
import path from 'node:path';
import { Texture } from 'pixi.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
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
import {
  defaultProAssetManifest,
  resolveProSpriteManifestEntry
} from '../../src/data/assets/proAssetManifest';
import { defaultDataRegistry } from '../../src/data/dataRegistry';
import { defaultRpgDataRegistry } from '../../src/data/rpgDataRegistry';
import type { CanvasRenderer } from '../../src/render/canvasRenderer';
import {
  PixiAssetBundleManager,
  resolveIslandBundleName
} from '../../src/render/pixi/PixiAssetBundleManager';
import { PixiStageHost } from '../../src/render/pixi/PixiStageHost';
import { ProAssetLoader } from '../../src/render/pixi/ProAssetLoader';
import { resolveBattleBackdropId } from '../../src/render/pixi/pixiBundleHelpers';
import type {
  PixiAssetsDriver,
  PixiAssetsManifestPayload
} from '../../src/render/pixi/pixiBundleTypes';
import { getIslandAtmospherePreset } from '../../src/render/pixi/scenes/islandAtmospherePresets';
import { PixiBattleVerticalSliceScene } from '../../src/render/pixi/scenes/PixiBattleVerticalSliceScene';
import { PixiFooshaIslandScene } from '../../src/render/pixi/scenes/PixiFooshaIslandScene';
import { PixiProIslandScene } from '../../src/render/pixi/scenes/PixiProIslandScene';
import { TiledMapLoader } from '../../src/render/pixi/tiled/TiledMapLoader';
import type { TiledMapJson } from '../../src/render/pixi/tiled/tiledSchema';
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

describe('Wave 3 Roster/Forms & Wave 4 Full 17/17 World Islands WebGL2 Promotion', () => {
  const cleanups: Array<() => void> = [];

  afterEach(() => {
    vi.restoreAllMocks();
    while (cleanups.length > 0) cleanups.pop()?.();
  });

  it('promotes all 10 Straw Hat crew, 19 external NDS bosses & 8 awakened forms while keeping procedural units PLACEHOLDER', () => {
    const strawHats = [
      'luffy',
      'zoro',
      'nami',
      'usopp',
      'sanji',
      'chopper',
      'robin',
      'franky',
      'brook',
      'jinbe'
    ];
    for (const uid of strawHats) {
      const ent = defaultProAssetManifest.entries.find((e) => e.id === `sprite:${uid}_base`);
      expect(ent, `Missing Straw Hat sprite ${uid}`).toBeDefined();
      expect(ent!.status === 'IMPORTED' || ent!.status === 'VERIFIED').toBe(true);
      expect(ent!.assetPath.endsWith('.webp')).toBe(true);
      expect(ent!.dimensions.width).toBeLessThanOrEqual(1024);
      expect(ent!.dimensions.height).toBeLessThanOrEqual(1024);
      if (uid !== 'luffy') {
        expect(ent!.bundle).toBe(`party_${uid}`);
      }
    }

    const expectedForms: Array<[string, string]> = [
      ['luffy', 'form_luffy_gear5'],
      ['zoro', 'form_zoro_king_of_hell'],
      ['sanji', 'form_sanji_diable_jambe'],
      ['enel', 'form_enel_amuru'],
      ['lucci', 'form_lucci_hybrid'],
      ['marco', 'form_marco_phoenix'],
      ['law', 'form_law_kroom'],
      ['doflamingo', 'form_doflamingo_awakening']
    ];
    for (const [uid, formId] of expectedForms) {
      const resolved = resolveProSpriteManifestEntry(uid, formId);
      expect(resolved, `Missing awakened form ${uid}_${formId}`).not.toBeNull();
      expect(resolved!.key).toBe(`${uid}_${formId}`);
      expect(resolved!.image.endsWith('.webp')).toBe(true);
      expect(resolved!.ppuScale).toBeGreaterThan(1.0);
    }

    // Strict zero-procedural-baking invariant: unacquired sheets MUST stay PLACEHOLDER
    const mustStayPlaceholder = [
      'morgan',
      'kaido',
      'king',
      'katakuri',
      'saturn',
      'loki',
      's_hawk',
      'blueno',
      'doppelman'
    ];
    for (const uid of mustStayPlaceholder) {
      const ent = defaultProAssetManifest.entries.find((e) => e.id === `sprite:${uid}_base`);
      expect(ent?.status, `${uid} must stay PLACEHOLDER`).toBe('PLACEHOLDER');
    }

    // Every boss resolves cleanly to its canonical 4-layer arena backdrop
    expect(resolveBattleBackdropId('battle_don_krieg', defaultProAssetManifest)).toBe('battle_don_krieg');
    expect(resolveBattleBackdropId('battle_smoker', defaultProAssetManifest)).toBe('battle_smoker');
    expect(resolveBattleBackdropId('battle_crocodile', defaultProAssetManifest)).toBe('alabasta_desert');
    expect(resolveBattleBackdropId('battle_enel', defaultProAssetManifest)).toBe('skypiea_upper_yard');
    expect(resolveBattleBackdropId('battle_lucci', defaultProAssetManifest)).toBe('water7_dock');
    expect(resolveBattleBackdropId('battle_kaido', defaultProAssetManifest)).toBe('onigashima_rooftop');
    expect(resolveBattleBackdropId('battle_saturn', defaultProAssetManifest)).toBe('egghead_lab');
    expect(resolveBattleBackdropId('battle_loki', defaultProAssetManifest)).toBe('elbaf_underworld');
    expect(resolveBattleBackdropId('battle_magellan', defaultProAssetManifest)).toBe('impel_down_hell');
  });

  it('protects shared arena backdrop textures across Lucci <-> Kaku & recovers exact VRAM across 5x full crew/boss cycles', async () => {
    const tracking = createTrackingDriver();
    const loader = new ProAssetLoader({ loadImage: async () => null, loadJson: async () => null });
    const mgr = new PixiAssetBundleManager(loader, tracking.driver);

    await mgr.init(defaultProAssetManifest);
    await mgr.loadCoreBundle(['luffy']);

    const coreVram = mgr.getVramTelemetry();
    expect(coreVram.activeBundles.map((b) => b.bundle)).toEqual(['core_always']);
    expect(coreVram.estimatedVramMb).toBeLessThan(4);

    const water7BgUrl = 'assets/pro/backgrounds/water7_dock_layer0.webp';
    const cycle1Vram: number[] = [];
    const cycle5Vram: number[] = [];

    for (let cycle = 0; cycle < 5; cycle++) {
      await mgr.syncActivePartyAssets(['luffy', 'usopp', 'chopper', 'robin']);
      expect(mgr.getAssetRefCount('assets/pro/sprites/usopp_base.webp')).toBe(1);
      expect(mgr.getAssetRefCount('assets/pro/sprites/chopper_base.webp')).toBe(1);

      await mgr.loadSceneBundles(['battle_lucci']);
      expect(mgr.getAssetRefCount(water7BgUrl)).toBe(1);
      expect(mgr.getAssetRefCount('assets/pro/sprites/lucci_base.webp')).toBe(1);

      // Switching Lucci -> Kaku keeps shared water7_dock backdrop alive (refCount 1) while unloading Lucci
      const toKaku = await mgr.loadSceneBundles(['battle_kaku']);
      expect(toKaku.committed).toBe(true);
      expect(mgr.getAssetRefCount(water7BgUrl)).toBe(1);
      expect(toKaku.unloadedUrls).not.toContain(water7BgUrl);
      expect(toKaku.unloadedUrls).toContain('assets/pro/sprites/lucci_base.webp');

      await mgr.syncActivePartyAssets(['luffy', 'franky', 'brook', 'jinbe']);
      expect(mgr.getAssetRefCount('assets/pro/sprites/chopper_base.webp')).toBe(0);
      expect(mgr.getAssetRefCount('assets/pro/sprites/jinbe_base.webp')).toBe(1);

      for (const b of ['battle_crocodile', 'battle_akainu', 'battle_kaido', 'battle_magellan']) {
        const res = await mgr.loadSceneBundles([b]);
        expect(res.committed).toBe(true);
        const vram = mgr.getVramTelemetry().estimatedVramBytes;
        if (cycle === 0) cycle1Vram.push(vram);
        if (cycle === 4) cycle5Vram.push(vram);
      }

      await mgr.loadSceneBundles([]);
      await mgr.syncActivePartyAssets(['luffy']);
    }

    expect(cycle5Vram).toEqual(cycle1Vram);
    expect(mgr.getAssetRefCount(water7BgUrl)).toBe(0);
    expect(mgr.getVramTelemetry().estimatedVramBytes).toBe(coreVram.estimatedVramBytes);
    expect(mgr.getVramTelemetry().totalLoadedUrls).toBe(coreVram.totalLoadedUrls);

    mgr.dispose();
    loader.dispose();
  });

  it('loads all 17/17 world .tmj maps via TiledMapLoader with zero embedded tilesets & verifies all 60 chests against LegalityValidator', async () => {
    const publicDir = path.join(process.cwd(), 'public');
    const loader = new ProAssetLoader({
      loadJson: async (rel) =>
        JSON.parse(fs.readFileSync(path.join(publicDir, rel.replace(/^\.\//, '')), 'utf-8')) as unknown,
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

    const allIslandIds = Object.keys(defaultRpgDataRegistry.islands).sort();
    expect(allIslandIds.length).toBe(17);

    const tiledLoader = new TiledMapLoader();
    const collectedChestIds: string[] = [];

    for (const islandId of allIslandIds) {
      const mapEntry = defaultProAssetManifest.maps[islandId];
      expect(mapEntry, `Missing Pro .tmj entry for ${islandId}`).toBeDefined();

      const rawTmj = JSON.parse(
        fs.readFileSync(path.join(publicDir, mapEntry!.tmj), 'utf-8')
      ) as TiledMapJson;
      expect(rawTmj.tilesets.every((ts) => !ts.image && Boolean(ts.source))).toBe(true);

      const runtime = await tiledLoader.loadFromManifest(
        mapEntry!.tmj,
        mapEntry!.tilesets,
        loader,
        mapEntry!.pixelScale,
        diskTextLoader
      );
      expect(runtime, `Failed loading ${mapEntry!.tmj}`).not.toBeNull();
      expect(runtime!.parsed.lights.length).toBeGreaterThanOrEqual(8);
      expect(runtime!.parsed.docks.length).toBeGreaterThanOrEqual(1);
      expect(runtime!.emissiveTileSpriteCount).toBeGreaterThanOrEqual(1);

      for (const ch of runtime!.parsed.chests) {
        const cid = String(ch.properties.chestId ?? ch.name);
        collectedChestIds.push(cid);
        const canonical = defaultRpgDataRegistry.islands[islandId]!.chests?.find((c) => c.chestId === cid);
        expect(canonical, `Unknown chest ${cid} in ${islandId}`).toBeDefined();
        expect(ch.properties.berries).toBe(canonical!.reward.berries);
        expect(ch.properties.trainingPoints).toBe(canonical!.reward.trainingPoints);
      }
      runtime!.dispose();
    }

    expect(collectedChestIds.length).toBe(60);
    expect(new Set(collectedChestIds).size).toBe(60);

    const campaign = createInitialCampaignState(defaultRpgDataRegistry, defaultDataRegistry);
    campaign.openedChestIds = collectedChestIds;
    const envelope = serializeCampaignToSaveEnvelope(
      campaign,
      'slot_1',
      240,
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

  it('routes all Wave 4 islands & Grand Line/New World battles through WebGL2 with 0 leaked RenderTextures across 5 rounds', async () => {
    const prevDoc = (globalThis as { document?: unknown }).document;
    (globalThis as { document: unknown }).document = createMinimalMockDoc();
    cleanups.push(() => {
      (globalThis as { document?: unknown }).document = prevDoc;
    });

    // Verify distinct Wave 4 atmosphere presets including Drum Kingdom post-clear Sakura Snow
    expect(getIslandAtmospherePreset('loguetown').particleTheme).toBe('RAIN_STORM');
    expect(getIslandAtmospherePreset('drum_kingdom').particleTheme).toBe('SNOW_PEAK');
    expect(getIslandAtmospherePreset('drum_kingdom').postClearParticleTheme).toBe('SAKURA_SNOW');
    expect(getIslandAtmospherePreset('skypiea').particleTheme).toBe('SKY_CLOUD');
    expect(getIslandAtmospherePreset('thriller_bark').particleTheme).toBe('SPOOKY_MIST');
    expect(getIslandAtmospherePreset('marineford').particleTheme).toBe('MARINE_ICE');
    expect(getIslandAtmospherePreset('fishman_island').particleTheme).toBe('UNDERWATER_BUBBLE');
    expect(getIslandAtmospherePreset('dressrosa').particleTheme).toBe('DRESSROSA_PETAL');
    expect(getIslandAtmospherePreset('totto_land').particleTheme).toBe('SUGAR_SPARKLE');
    expect(getIslandAtmospherePreset('elbaf').particleTheme).toBe('ELBAF_GOLDEN');

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
    vi.spyOn(PixiBattleVerticalSliceScene.prototype, 'preload').mockImplementation(async function (
      this: PixiBattleVerticalSliceScene,
      bundleName = 'battle_east_blue_harbor'
    ) {
      await bundleManager.loadSceneBundles([bundleName]);
    });

    const campaign = createInitialCampaignState(defaultRpgDataRegistry, defaultDataRegistry);
    for (const zone of Object.values(defaultRpgDataRegistry.seaZones)) {
      for (const ep of zone.islands) {
        completeEpisode(campaign, ep.episodeId, defaultRpgDataRegistry, defaultDataRegistry);
      }
    }

    const battleWorld = createBattleWorld(
      {
        seed: 20261124,
        arenaSizeKey: 'large',
        mode: '2V2',
        teamAlpha: [
          createStandardPresetBuild('luffy', 'a_luffy', true, 0, defaultDataRegistry),
          createStandardPresetBuild('jinbe', 'a_jinbe', false, 2, defaultDataRegistry)
        ],
        teamOmega: [createStandardPresetBuild('doflamingo', 'o_doffy', false, 2, defaultDataRegistry)]
      },
      defaultDataRegistry
    );

    const mockRenderer = {
      settings: { flashEffectEnabled: false, shakeIntensity: 0.8, showFps: true },
      setBackgroundTransparent: vi.fn(),
      ctx: { clearRect: vi.fn() }
    } as unknown as CanvasRenderer;

    const controller = new PixiVerticalSliceController(pixiHost);
    const s25 = computeResponsiveViewport(915, 412, 3, { top: 0, right: 36, bottom: 14, left: 44 });
    const baselineVram = bundleManager.getVramTelemetry().estimatedVramBytes;
    const wave4SampleSequence = [
      'loguetown',
      'drum_kingdom',
      'skypiea',
      'thriller_bark',
      'marineford',
      'fishman_island',
      'dressrosa',
      'totto_land',
      'elbaf'
    ];

    for (let round = 0; round < 5; round++) {
      let lastStep: ReturnType<typeof stepIslandExploration> | null = null;
      for (const islandId of wave4SampleSequence) {
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
        lastStep = step;
        const host: VerticalSliceSceneHost = {
          activeScene: 'ISLAND_EPISODE',
          islandRuntime: runtime,
          activeBattleContext: null,
          lastIslandStep: step,
          battleWorld,
          campaign,
          rpgRegistry: defaultRpgDataRegistry,
          gameRegistry: defaultDataRegistry,
          storyDirector: new StoryDirector(),
          renderer: mockRenderer,
          assets: { manifestRegistry: defaultAssetManifestRegistry } as unknown as AssetLoader,
          tickCount: round * 20 + 1,
          fps: 60
        };
        expect(controller.renderFrameIfVerticalSlice(host, s25, 0.5)).toBe(true);
        expect(controller.getActiveKind()).toBe('PRO_ISLAND');
        expect(pixiHost.trackedRenderTextureCount).toBe(2);
        await new Promise((r) => setTimeout(r, 0));
      }

      // New World Story Battle routes cleanly to WebGL2 PixiBattleVerticalSliceScene
      const battleHost: VerticalSliceSceneHost = {
        activeScene: 'STORY_BATTLE',
        islandRuntime: null,
        activeBattleContext: {
          sourceScene: 'ISLAND_EPISODE',
          zoneId: 'new_world',
          islandId: 'dressrosa',
          encounterId: 'enc_dressrosa_doflamingo',
          encounterName: '도플라밍고 결전',
          isBoss: true,
          arenaSizeKey: 'large',
          mode: '2V2',
          enemyUnitIds: ['doflamingo'],
          aiLevel: 3,
          bountyReward: 50000,
          berryReward: 2500,
          trainingPointReward: 80,
          setsFlagOnVictory: null,
          completesEpisodeIdOnVictory: 'ep_dressrosa'
        },
        lastIslandStep: lastStep!,
        battleWorld,
        campaign,
        rpgRegistry: defaultRpgDataRegistry,
        gameRegistry: defaultDataRegistry,
        storyDirector: new StoryDirector(),
        renderer: mockRenderer,
        assets: { manifestRegistry: defaultAssetManifestRegistry } as unknown as AssetLoader,
        tickCount: round * 20 + 15,
        fps: 60
      };
      expect(controller.renderFrameIfVerticalSlice(battleHost, s25, 0.5)).toBe(true);
      expect(controller.getActiveKind()).toBe('BATTLE');
      expect(pixiHost.trackedRenderTextureCount).toBe(1);
      await new Promise((r) => setTimeout(r, 0));

      controller.releaseActiveSlice(undefined);
      await bundleManager.loadSceneBundles([]);
      expect(pixiHost.trackedRenderTextureCount).toBe(0);
      expect(bundleManager.getVramTelemetry().estimatedVramBytes).toBe(baselineVram);
    }

    controller.dispose();
    expect(pixiHost.trackedRenderTextureCount).toBe(0);
  });
});
