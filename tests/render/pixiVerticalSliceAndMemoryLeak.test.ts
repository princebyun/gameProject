import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createBattleWorld } from '../../src/core/combat/battleWorld';
import { createInitialCampaignState } from '../../src/core/rpg/campaignState';
import {
  enterIslandEpisode,
  stepIslandExploration
} from '../../src/core/rpg/episodeEngine';
import { createStandardPresetBuild } from '../../src/core/net/terminalArenaRule';
import type { AssetLoader } from '../../src/assets/assetLoader';
import { defaultAssetManifestRegistry } from '../../src/data/assets/assetManifestRegistry';
import { defaultProAssetManifest } from '../../src/data/assets/proAssetManifest';
import { defaultDataRegistry } from '../../src/data/dataRegistry';
import { defaultRpgDataRegistry } from '../../src/data/rpgDataRegistry';
import type { CanvasRenderer } from '../../src/render/canvasRenderer';
import { DEFAULT_VISUAL_POLISH_CONFIG } from '../../src/render/backend/renderBackend';
import { PixiStageHost } from '../../src/render/pixi/PixiStageHost';
import { ProAssetLoader } from '../../src/render/pixi/ProAssetLoader';
import { PixiBattleEffectsHelper } from '../../src/render/pixi/scenes/PixiBattleEffectsHelper';
import { PixiBattleVerticalSliceScene } from '../../src/render/pixi/scenes/PixiBattleVerticalSliceScene';
import { PixiFooshaIslandScene } from '../../src/render/pixi/scenes/PixiFooshaIslandScene';
import { computeEffectiveBloomIntensity } from '../../src/render/pixi/shaders/SelectiveBloomFilter';
import { ShockwaveDistortionEffect } from '../../src/render/pixi/shaders/ShockwaveDistortionFilter';
import { parseTiledMapData, type TiledMapJson } from '../../src/render/pixi/tiled/tiledSchema';
import { computeResponsiveViewport } from '../../src/render/viewport/responsiveViewportManager';
import {
  PixiVerticalSliceController,
  type VerticalSliceSceneHost
} from '../../src/scenes/controllers/pixiVerticalSliceController';
import { VisualPolishDrawer } from '../../src/scenes/dev/visualPolishDrawer';
import { StoryDirector } from '../../src/story/storyDirector';

interface MockDomElement {
  id: string;
  tagName: string;
  style: Record<string, string>;
  dataset: Record<string, string>;
  checked: boolean;
  value: string;
  removed: boolean;
  attributes: Record<string, string>;
  children: MockDomElement[];
  listeners: Map<string, Set<() => void>>;
  width: number;
  height: number;
  getContext: () => null;
  _innerHtml: string;
  innerHTML: string;
  setAttribute: (k: string, v: string) => void;
  appendChild: (child: MockDomElement) => MockDomElement;
  addEventListener: (
    ev: string,
    fn: () => void,
    opts?: { signal?: AbortSignal }
  ) => void;
  dispatch: (ev: string) => void;
  querySelector: (selector: string) => MockDomElement | null;
  querySelectorAll: <T = MockDomElement>(selector: string) => T[];
  remove: () => void;
}

function createMockElement(tagName: string): MockDomElement {
  const el: MockDomElement = {
    id: '',
    tagName: tagName.toUpperCase(),
    style: { cssText: '' },
    dataset: {},
    checked: true,
    value: 'HIGH',
    removed: false,
    attributes: {},
    children: [],
    listeners: new Map(),
    width: 300,
    height: 150,
    getContext: () => null,
    _innerHtml: '',
    get innerHTML() {
      return el._innerHtml;
    },
    set innerHTML(html: string) {
      el._innerHtml = html;
      el.children = [];
      if (html.includes('vp-btn-close')) {
        const closeBtn = createMockElement('button');
        closeBtn.id = 'vp-btn-close';
        el.children.push(closeBtn);
      }
      for (const t of ['MORNING', 'DAY', 'SUNSET', 'NIGHT']) {
        if (html.includes(`data-vp-time="${t}"`)) {
          const btn = createMockElement('button');
          btn.dataset.vpTime = t;
          el.children.push(btn);
        }
      }
      for (const k of [
        'dynamicLighting',
        'selectiveBloom',
        'waterReflection',
        'godRaysAndParticles',
        'colorGrading'
      ]) {
        if (html.includes(`data-vp-toggle="${k}"`)) {
          const chk = createMockElement('input');
          chk.dataset.vpToggle = k;
          chk.checked = true;
          el.children.push(chk);
        }
      }
      if (html.includes('vp-sel-quality')) {
        const sel = createMockElement('select');
        sel.id = 'vp-sel-quality';
        sel.value = 'HIGH';
        el.children.push(sel);
      }
      if (html.includes('vp-telemetry')) {
        const tele = createMockElement('div');
        tele.id = 'vp-telemetry';
        el.children.push(tele);
      }
      if (html.includes('vp-btn-prune-bundles')) {
        const pruneBtn = createMockElement('button');
        pruneBtn.id = 'vp-btn-prune-bundles';
        el.children.push(pruneBtn);
      }
      for (const id of ['vp-vram-summary', 'vp-bundle-tags', 'vp-manifest-progress']) {
        if (html.includes(id)) {
          const d = createMockElement('div');
          d.id = id;
          el.children.push(d);
        }
      }
    },
    setAttribute: (k, v) => {
      el.attributes[k] = v;
    },
    appendChild: (child) => {
      el.children.push(child);
      return child;
    },
    addEventListener: (ev, fn, opts) => {
      let set = el.listeners.get(ev);
      if (!set) {
        set = new Set();
        el.listeners.set(ev, set);
      }
      set.add(fn);
      opts?.signal?.addEventListener('abort', () => {
        set?.delete(fn);
      });
    },
    dispatch: (ev) => {
      const set = el.listeners.get(ev);
      if (!set) return;
      for (const fn of Array.from(set)) {
        fn();
      }
    },
    querySelector: (selector) => {
      if (selector.startsWith('#')) {
        const targetId = selector.slice(1);
        return el.children.find((c) => c.id === targetId) ?? null;
      }
      return null;
    },
    querySelectorAll: <T = MockDomElement>(selector: string): T[] => {
      if (selector === '[data-vp-time]') {
        return el.children.filter((c) => Boolean(c.dataset.vpTime)) as unknown as T[];
      }
      if (selector === '[data-vp-toggle]') {
        return el.children.filter((c) => Boolean(c.dataset.vpToggle)) as unknown as T[];
      }
      return [];
    },
    remove: () => {
      el.removed = true;
    }
  };
  return el;
}

describe('Step 3 Vertical Slice: Pro Assets, 5x Round-Trip Leak Audit, Shockwave & VisualPolishDrawer', () => {
  const restoreGlobals: Array<() => void> = [];

  afterEach(() => {
    vi.restoreAllMocks();
    while (restoreGlobals.length > 0) {
      restoreGlobals.pop()?.();
    }
  });

  it('verifies every file in public/assets/pro/ + PRO_ART_DROP_GUIDE.md exists on disk and parses foosha_village.tmj cleanly', () => {
    const root = process.cwd();
    const publicDir = path.join(root, 'public');
    const expectedFiles = new Set<string>([
      'assets/pro/pro_manifest.json',
      'assets/pro/CREDITS.md'
    ]);

    for (const s of Object.values(defaultProAssetManifest.sprites)) {
      expectedFiles.add(s.image);
      expectedFiles.add(s.atlasJson);
    }
    for (const p of Object.values(defaultProAssetManifest.portraits)) {
      expectedFiles.add(p.image);
    }
    for (const c of Object.values(defaultProAssetManifest.cutins)) {
      expectedFiles.add(c.image);
    }
    for (const m of Object.values(defaultProAssetManifest.maps)) {
      expectedFiles.add(m.tmj);
      for (const t of m.tilesets) expectedFiles.add(t);
    }
    for (const bg of Object.values(defaultProAssetManifest.backgrounds)) {
      for (const layer of bg.layers) expectedFiles.add(layer);
    }
    for (const v of Object.values(defaultProAssetManifest.vfx)) {
      expectedFiles.add(v.image);
    }

    for (const rel of expectedFiles) {
      const full = path.join(publicDir, rel);
      expect(fs.existsSync(full), `Missing pro asset file: ${full}`).toBe(true);
      expect(fs.statSync(full).size, `Empty pro asset file: ${full}`).toBeGreaterThan(0);
    }

    const dropGuide = path.join(root, 'PRO_ART_DROP_GUIDE.md');
    expect(fs.existsSync(dropGuide)).toBe(true);
    expect(fs.statSync(dropGuide).size).toBeGreaterThan(500);

    const tmjPath = path.join(publicDir, 'assets/pro/maps/foosha_village.tmj');
    const rawTmj = JSON.parse(fs.readFileSync(tmjPath, 'utf8')) as TiledMapJson;
    const parsed = parseTiledMapData(rawTmj, 2);

    expect(parsed.cols).toBe(48);
    expect(parsed.rows).toBe(34);
    expect(parsed.waterLayers.length).toBeGreaterThanOrEqual(1);
    expect(parsed.groundLayers.length).toBeGreaterThanOrEqual(1);
    expect(parsed.overheadLayers.length).toBeGreaterThanOrEqual(1);
    expect(parsed.lights.length).toBeGreaterThanOrEqual(8);
    expect(parsed.chests.length).toBe(3);
    expect(parsed.npcs.length).toBe(7);
  });

  it('maintains 0 leaked RenderTextures and 0 dangling worldRoot children across 5x Title -> Foosha -> Battle -> Title round-trips', () => {
    const prevDoc = (globalThis as { document?: unknown }).document;
    (globalThis as { document: unknown }).document = {
      createElement: (tag: string) => createMockElement(tag)
    };
    restoreGlobals.push(() => {
      (globalThis as { document?: unknown }).document = prevDoc;
    });

    const loader = new ProAssetLoader({
      loadImage: async () => null,
      loadJson: async () => null
    });
    const pixiHost = new PixiStageHost(loader);
    vi.spyOn(pixiHost, 'isWebGLActive', 'get').mockReturnValue(true);

    const s25 = computeResponsiveViewport(915, 412, 3, {
      top: 0,
      right: 36,
      bottom: 14,
      left: 44
    });

    const campaign = createInitialCampaignState(defaultRpgDataRegistry, defaultDataRegistry);
    const enter = enterIslandEpisode(campaign, 'foosha_shells', defaultRpgDataRegistry);
    expect(enter.allowed).toBe(true);
    const islandRuntime = enter.runtime!;
    const lastIslandStep = stepIslandExploration(
      campaign,
      islandRuntime,
      { x: 0, y: 0 },
      false,
      1 / 60,
      defaultRpgDataRegistry,
      defaultDataRegistry
    );

    const battleWorld = createBattleWorld(
      {
        seed: 20261123,
        arenaSizeKey: 'medium',
        mode: '2V2',
        teamAlpha: [
          createStandardPresetBuild('luffy', 'alpha_luffy', true, 0, defaultDataRegistry),
          createStandardPresetBuild('zoro', 'alpha_zoro', false, 2, defaultDataRegistry)
        ],
        teamOmega: [
          createStandardPresetBuild('buggy', 'omega_buggy', false, 2, defaultDataRegistry),
          createStandardPresetBuild('morgan', 'omega_morgan', false, 2, defaultDataRegistry)
        ]
      },
      defaultDataRegistry
    );

    const mockRenderer = {
      settings: { flashEffectEnabled: true, shakeIntensity: 0.8, showFps: true },
      setBackgroundTransparent: vi.fn(),
      ctx: { clearRect: vi.fn() }
    } as unknown as CanvasRenderer;

    const sceneHost: VerticalSliceSceneHost = {
      activeScene: 'TITLE',
      islandRuntime,
      activeBattleContext: {
        sourceScene: 'ISLAND_EPISODE',
        zoneId: 'east_blue',
        islandId: 'foosha_shells',
        encounterId: 'enc_ch1_alvida_tutorial',
        encounterName: '알비다 & 해군기지',
        isBoss: true,
        arenaSizeKey: 'medium',
        mode: '2V2',
        enemyUnitIds: ['buggy', 'morgan'],
        aiLevel: 2,
        bountyReward: 5000,
        berryReward: 200,
        trainingPointReward: 20,
        setsFlagOnVictory: null,
        completesEpisodeIdOnVictory: 'ep_east_blue_start'
      },
      lastIslandStep,
      battleWorld,
      campaign,
      rpgRegistry: defaultRpgDataRegistry,
      gameRegistry: defaultDataRegistry,
      storyDirector: new StoryDirector(),
      renderer: mockRenderer,
      assets: { manifestRegistry: defaultAssetManifestRegistry } as unknown as AssetLoader,
      tickCount: 1,
      fps: 60
    };

    const controller = new PixiVerticalSliceController(pixiHost);

    // Prevent scene constructors' void this.preload() from hitting missing DOM/fetch in tests
    const fooshaPreloadSpy = vi
      .spyOn(PixiFooshaIslandScene.prototype, 'preload')
      .mockResolvedValue(undefined);
    const battlePreloadSpy = vi
      .spyOn(PixiBattleVerticalSliceScene.prototype, 'preload')
      .mockResolvedValue(undefined);

    for (let cycle = 0; cycle < 5; cycle++) {
      // 1. Foosha Vertical Slice (allocates DynamicLighting RT + WaterReflection RT = 2)
      sceneHost.activeScene = 'ISLAND_EPISODE';
      sceneHost.tickCount += 1;
      const renderedFoosha = controller.renderFrameIfVerticalSlice(sceneHost, s25, 0.5);
      expect(renderedFoosha).toBe(true);
      expect(controller.getActiveKind()).toBe('FOOSHA');
      expect(pixiHost.worldRoot.children.length).toBe(1);
      expect(pixiHost.trackedRenderTextureCount).toBe(2);

      // 2. First Battle Vertical Slice (releases Foosha RTs, allocates Battle DynamicLighting RT = 1)
      sceneHost.activeScene = 'STORY_BATTLE';
      sceneHost.tickCount += 1;
      const renderedBattle = controller.renderFrameIfVerticalSlice(sceneHost, s25, 0.5);
      expect(renderedBattle).toBe(true);
      expect(controller.getActiveKind()).toBe('BATTLE');
      expect(pixiHost.worldRoot.children.length).toBe(1);
      expect(pixiHost.trackedRenderTextureCount).toBe(1);

      // 3. Return to Title (must drop RenderTextures & worldRoot children to exact 0)
      sceneHost.activeScene = 'TITLE';
      const renderedTitle = controller.renderFrameIfVerticalSlice(sceneHost, s25, 0.5);
      expect(renderedTitle).toBe(false);
      expect(controller.getActiveKind()).toBe('NONE');
      expect(pixiHost.worldRoot.children.length).toBe(0);
      expect(pixiHost.trackedRenderTextureCount).toBe(0);
    }

    expect(fooshaPreloadSpy).toHaveBeenCalled();
    expect(battlePreloadSpy).toHaveBeenCalled();

    controller.dispose();
    expect(pixiHost.worldRoot.children.length).toBe(0);
    expect(pixiHost.trackedRenderTextureCount).toBe(0);
  });

  it('triggers Armament parry ShockwaveDistortionEffect + cut-in overlay and disables hazards when flashEffectEnabled === false', () => {
    const prevDoc = (globalThis as { document?: unknown }).document;
    (globalThis as { document: unknown }).document = {
      createElement: (tag: string) => createMockElement(tag)
    };
    restoreGlobals.push(() => {
      (globalThis as { document?: unknown }).document = prevDoc;
    });

    const shockwave = new ShockwaveDistortionEffect();
    shockwave.trigger(0.45, 0.55, 0.42);
    expect(shockwave.isActive).toBe(true);

    shockwave.step(0.1, 1170, 540, DEFAULT_VISUAL_POLISH_CONFIG);
    expect(shockwave.isActive).toBe(true);
    expect(shockwave.filter.enabled).toBe(true);

    // Accessibility: flashEffectEnabled === false immediately turns off shockwave filter and clamps bloom
    const flashSafeConfig = { ...DEFAULT_VISUAL_POLISH_CONFIG, flashEffectEnabled: false };
    shockwave.step(0.05, 1170, 540, flashSafeConfig);
    expect(shockwave.isActive).toBe(false);
    expect(shockwave.filter.enabled).toBe(false);

    const safeBloom = computeEffectiveBloomIntensity(flashSafeConfig, 1.15, 0.9);
    expect(safeBloom.enabled).toBe(true);
    expect(safeBloom.intensity).toBeLessThanOrEqual(0.45);
    shockwave.dispose();

    const host = new PixiStageHost(
      new ProAssetLoader({ loadImage: async () => null, loadJson: async () => null })
    );
    const helper = new PixiBattleEffectsHelper(host);
    const s25 = computeResponsiveViewport(915, 412, 3);
    helper.triggerCutin('luffy', '2:2 밀짚모자 합동기 발동!', 0.8);
    helper.updateCutinOverlay(0.1, s25, DEFAULT_VISUAL_POLISH_CONFIG, defaultDataRegistry);
    expect(helper.cutinOverlay.visible).toBe(true);

    helper.updateCutinOverlay(1.0, s25, DEFAULT_VISUAL_POLISH_CONFIG, defaultDataRegistry);
    helper.updateCutinOverlay(0.016, s25, DEFAULT_VISUAL_POLISH_CONFIG, defaultDataRegistry);
    expect(helper.cutinOverlay.visible).toBe(false);

    helper.dispose();
    host.dispose();
  });

  it('manages VisualPolishDrawer F9 time-of-day, shader A/B toggles, quality sync, and interval cleanup on dispose()', async () => {
    const prevDoc = (globalThis as { document?: unknown }).document;
    const prevWin = (globalThis as { window?: unknown }).window;

    const clearedIntervals: number[] = [];
    let nextTimerId = 100;
    const mockWindow = {
      setInterval: vi.fn(() => ++nextTimerId),
      clearInterval: vi.fn((id: number) => {
        clearedIntervals.push(id);
      })
    };
    const mockDocument = {
      createElement: (tag: string) => createMockElement(tag)
    };
    (globalThis as { document: unknown }).document = mockDocument;
    (globalThis as { window: unknown }).window = mockWindow;
    restoreGlobals.push(() => {
      (globalThis as { document?: unknown }).document = prevDoc;
      (globalThis as { window?: unknown }).window = prevWin;
    });

    const host = new PixiStageHost(
      new ProAssetLoader({ loadImage: async () => null, loadJson: async () => null })
    );
    const rootEl = createMockElement('div');
    const onConfigChanged = vi.fn();

    const drawer = new VisualPolishDrawer(rootEl as unknown as HTMLElement, host, {
      onConfigChanged
    });

    expect(drawer.isOpen()).toBe(false);
    drawer.open();
    expect(drawer.isOpen()).toBe(true);
    expect(mockWindow.setInterval).toHaveBeenCalledTimes(1);

    const aside = rootEl.children[0]!;
    const sunsetBtn = aside
      .querySelectorAll<MockDomElement>('[data-vp-time]')
      .find((b) => b.dataset.vpTime === 'SUNSET')!;
    sunsetBtn.dispatch('click');
    expect(host.getPolishConfig().timeOfDay).toBe('SUNSET');
    expect(onConfigChanged).toHaveBeenCalled();

    const bloomToggle = aside
      .querySelectorAll<MockDomElement>('[data-vp-toggle]')
      .find((c) => c.dataset.vpToggle === 'selectiveBloom')!;
    bloomToggle.checked = false;
    bloomToggle.dispatch('change');
    expect(host.getPolishConfig().selectiveBloom).toBe(false);

    const qualitySel = aside.querySelector('#vp-sel-quality')!;
    qualitySel.value = 'MEDIUM';
    qualitySel.dispatch('change');
    expect(host.getPolishConfig().quality).toBe('MEDIUM');

    const pruneBtn = aside.querySelector('#vp-btn-prune-bundles')!;
    expect(pruneBtn).toBeDefined();
    pruneBtn.dispatch('click');
    await Promise.resolve();
    const vramSummary = aside.querySelector('#vp-vram-summary')!;
    expect(vramSummary._innerHtml).toContain('128 MB');

    drawer.dispose();
    expect(drawer.isOpen()).toBe(false);
    expect(clearedIntervals.length).toBe(1);
    expect(aside.removed).toBe(true);

    host.dispose();
  });
});
