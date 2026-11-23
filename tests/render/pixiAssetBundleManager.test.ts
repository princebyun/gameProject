import { Texture } from 'pixi.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ProAssetManifestFile } from '../../src/data/assets/proAssetManifest';
import { defaultProAssetManifest } from '../../src/data/assets/proAssetManifest';
import {
  MOBILE_VRAM_BUDGET_MB,
  PixiAssetBundleManager
} from '../../src/render/pixi/PixiAssetBundleManager';
import {
  LOADING_OVERLAY_DELAY_MS,
  PixiBundleLoadingOverlay
} from '../../src/render/pixi/PixiBundleLoadingOverlay';
import { ProAssetLoader } from '../../src/render/pixi/ProAssetLoader';
import type {
  PixiAssetsDriver,
  PixiAssetsManifestPayload
} from '../../src/render/pixi/pixiBundleTypes';
import { parseTiledTsxXml } from '../../src/render/pixi/tiled/tiledSchema';

function createFakeTexture(label: string): Texture {
  const tex = new Texture({ label });
  tex.source.scaleMode = 'linear'; // intentionally start non-nearest to verify enforcement
  return tex;
}

function createMockAssetsDriver(options?: {
  deferredBundles?: Map<string, () => Promise<void>>;
}) {
  let manifest: PixiAssetsManifestPayload = { bundles: [] };
  const loadedBundles: string[] = [];
  const unloadedUrls: string[] = [];
  const cachedByUrl = new Map<string, Texture>();

  const driver: PixiAssetsDriver = {
    reset: vi.fn(() => {
      cachedByUrl.clear();
    }),
    init: vi.fn(async (opts) => {
      manifest = opts.manifest;
    }),
    loadBundle: vi.fn(async (bundleName, onProgress) => {
      const gate = options?.deferredBundles?.get(bundleName);
      if (gate) {
        await gate();
      }
      loadedBundles.push(bundleName);
      const b = manifest.bundles.find((x) => x.name === bundleName);
      const out: Record<string, Texture> = {};
      for (const a of b?.assets ?? []) {
        const clean = a.src.replace(/^\.\//, '');
        let tex = cachedByUrl.get(clean);
        if (!tex) {
          tex = createFakeTexture(clean);
          cachedByUrl.set(clean, tex);
        }
        for (const al of a.alias) {
          out[al] = tex;
        }
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
        cachedByUrl.delete(clean);
      }
    })
  };

  return { driver, loadedBundles, unloadedUrls, cachedByUrl };
}

function buildSharedTilesetManifest(hugeVram = false): ProAssetManifestFile {
  const now = '2026-11-23T00:00:00.000Z';
  const vram = hugeVram ? 140 * 1024 * 1024 : 512 * 512 * 4;
  return {
    version: '2.0.0',
    entries: [
      {
        id: 'vfx:slash_arc',
        category: 'vfx',
        wave: 0,
        tier: 'env',
        bundle: 'core_always',
        status: 'IMPORTED',
        assetPath: 'assets/pro/vfx/slash_arc.webp',
        dimensions: { width: 160, height: 32 },
        fileSizeBytes: 300,
        estimatedVramBytes: 160 * 32 * 4,
        updatedAt: now
      },
      {
        id: 'sprite:luffy_base',
        category: 'sprite',
        wave: 0,
        tier: 'tier1_crew',
        bundle: 'core_always',
        status: 'VERIFIED',
        assetPath: 'assets/pro/sprites/luffy_base.webp',
        metaPath: 'assets/pro/sprites/luffy_base.json',
        dimensions: { width: 512, height: 256 },
        fileSizeBytes: 10000,
        estimatedVramBytes: 512 * 256 * 4,
        updatedAt: now,
        unitId: 'luffy',
        formId: 'base'
      },
      {
        id: 'sprite:zoro_base',
        category: 'sprite',
        wave: 0,
        tier: 'tier1_crew',
        bundle: 'island_A',
        status: 'IMPORTED',
        assetPath: 'assets/pro/sprites/zoro_base.webp',
        metaPath: 'assets/pro/sprites/zoro_base.json',
        dimensions: { width: 512, height: 256 },
        fileSizeBytes: 12000,
        estimatedVramBytes: 512 * 256 * 4,
        updatedAt: now,
        unitId: 'zoro',
        formId: 'base'
      },
      {
        id: 'tileset:master_port_village',
        category: 'tileset',
        wave: 0,
        tier: 'env',
        bundle: 'island_A',
        status: 'IMPORTED',
        assetPath: 'assets/pro/tilesets/ninja_adventure_village.webp',
        metaPath: 'assets/pro/tilesets/master_port_village.tsx',
        dimensions: { width: 448, height: 640 },
        fileSizeBytes: 35000,
        estimatedVramBytes: vram,
        updatedAt: now
      },
      {
        id: 'map:island_A',
        category: 'map',
        wave: 0,
        tier: 'env',
        bundle: 'island_A',
        status: 'IMPORTED',
        assetPath: 'assets/pro/maps/foosha_village.tmj',
        dimensions: { width: 1536, height: 1088 },
        fileSizeBytes: 130000,
        estimatedVramBytes: 0,
        updatedAt: now,
        islandId: 'island_A',
        sharedTilesetIds: ['tileset:master_port_village']
      },
      {
        id: 'portrait:island_b_exclusive',
        category: 'portrait',
        wave: 1,
        tier: 'tier3_npc',
        bundle: 'island_B',
        status: 'IMPORTED',
        assetPath: 'assets/pro/portraits/buggy_normal.webp',
        dimensions: { width: 64, height: 64 },
        fileSizeBytes: 900,
        estimatedVramBytes: 64 * 64 * 4,
        updatedAt: now
      },
      {
        id: 'map:island_B',
        category: 'map',
        wave: 4,
        tier: 'env',
        bundle: 'island_B',
        status: 'IMPORTED',
        assetPath: 'assets/pro/maps/orange_town.tmj',
        dimensions: { width: 1408, height: 960 },
        fileSizeBytes: 90000,
        estimatedVramBytes: 0,
        updatedAt: now,
        islandId: 'island_B',
        sharedTilesetIds: ['tileset:master_port_village']
      }
    ],
    sprites: {},
    portraits: {},
    cutins: {},
    maps: {},
    backgrounds: {},
    vfx: {}
  };
}

describe('Step 2: PixiAssetBundleManager (4-Tier Bundles, Ref-Counting, Epoch Guard, VRAM)', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('protects shared .tsx master tileset textures via URL ref-counting across island_A -> island_B -> Title', async () => {
    const loader = new ProAssetLoader({
      loadImage: async () => null,
      loadJson: async () => null
    });
    const mock = createMockAssetsDriver();
    const manager = new PixiAssetBundleManager(loader, mock.driver);
    const sharedUrl = 'assets/pro/tilesets/ninja_adventure_village.webp';
    const exclusiveB = 'assets/pro/portraits/buggy_normal.webp';

    await manager.init(buildSharedTilesetManifest());
    await manager.loadCoreBundle(['luffy']);

    // 1. Load island_A -> shared tileset refCount becomes 1, scaleMode forced to nearest
    await manager.loadSceneBundles(['island_A']);
    expect(manager.getAssetRefCount(sharedUrl)).toBe(1);
    expect(mock.cachedByUrl.get(sharedUrl)?.source.scaleMode).toBe('nearest');

    // 2. Switch to island_B (shares master_port_village): acquire island_B (refCount 2), release island_A (refCount 1)
    const resB = await manager.loadSceneBundles(['island_B']);
    expect(resB.committed).toBe(true);
    expect(manager.getAssetRefCount(sharedUrl)).toBe(1);
    expect(mock.unloadedUrls).not.toContain(sharedUrl);
    expect(mock.cachedByUrl.has(sharedUrl)).toBe(true);
    expect(mock.cachedByUrl.has(exclusiveB)).toBe(true);

    // 3. Return to Title ([]): island_B unloaded -> shared tileset hits refCount 0 and is unloaded once
    await manager.loadSceneBundles([]);
    expect(manager.getAssetRefCount(sharedUrl)).toBe(0);
    expect(mock.unloadedUrls).toContain(sharedUrl);
    expect(mock.unloadedUrls).toContain(exclusiveB);

    // Core bundle remains pinned & never unloaded
    expect(manager.getAssetRefCount('assets/pro/vfx/slash_arc.webp')).toBeGreaterThanOrEqual(1);
    expect(manager.getActiveBundleNames()).toEqual(['core_always']);

    manager.dispose();
  });

  it('prevents async race conditions with transitionEpoch rollback when switching island_A -> island_B mid-load', async () => {
    let resolveA!: () => void;
    const deferred = new Map<string, () => Promise<void>>([
      [
        'island_A',
        () =>
          new Promise<void>((res) => {
            resolveA = res;
          })
      ]
    ]);
    const loader = new ProAssetLoader({
      loadImage: async () => null,
      loadJson: async () => null
    });
    const mock = createMockAssetsDriver({ deferredBundles: deferred });
    const manager = new PixiAssetBundleManager(loader, mock.driver);

    await manager.init(buildSharedTilesetManifest());
    await manager.loadCoreBundle(['luffy']);

    // Start slow island_A load, then immediately switch to island_B
    const pendingA = manager.loadSceneBundles(['island_A']);
    const resB = await manager.loadSceneBundles(['island_B']);

    expect(resB.committed).toBe(true);
    expect(manager.getActiveBundleNames()).toEqual(['core_always', 'island_B']);

    // Now resolve stale island_A load -> must abort cleanly and roll back zoro_base without harming shared tileset
    resolveA();
    const resA = await pendingA;
    expect(resA.committed).toBe(false);
    expect(resA.abortedByEpoch).toBe(true);
    expect(manager.getActiveBundleNames()).toEqual(['core_always', 'island_B']);
    expect(manager.getAssetRefCount('assets/pro/tilesets/ninja_adventure_village.webp')).toBe(1);
    expect(manager.getAssetRefCount('assets/pro/sprites/zoro_base.webp')).toBe(0);
    expect(mock.unloadedUrls).toContain('assets/pro/sprites/zoro_base.webp');

    manager.dispose();
  });

  it('incrementally loads and safely unloads party members via syncActivePartyAssets (max 4)', async () => {
    const loader = new ProAssetLoader({
      loadImage: async () => null,
      loadJson: async () => null
    });
    const mock = createMockAssetsDriver();
    const manager = new PixiAssetBundleManager(loader, mock.driver);

    await manager.init(buildSharedTilesetManifest());
    await manager.loadCoreBundle(['luffy']);
    expect(manager.getAssetRefCount('assets/pro/sprites/zoro_base.webp')).toBe(0);

    // Zoro joins active party -> incrementally loaded
    await manager.syncActivePartyAssets(['luffy', 'zoro']);
    expect(manager.getAssetRefCount('assets/pro/sprites/zoro_base.webp')).toBe(1);
    expect(mock.loadedBundles.filter((b) => b === 'party_luffy').length).toBe(1);
    expect(mock.loadedBundles.filter((b) => b === 'party_zoro').length).toBe(1);

    // Zoro leaves party -> unloaded cleanly when no active scene uses him
    await manager.syncActivePartyAssets(['luffy']);
    expect(manager.getAssetRefCount('assets/pro/sprites/zoro_base.webp')).toBe(0);
    expect(mock.unloadedUrls).toContain('assets/pro/sprites/zoro_base.webp');

    manager.dispose();
  });

  it('debounces PixiBundleLoadingOverlay by 120ms and emits VRAM warning above 128MB', async () => {
    vi.useFakeTimers();
    const createdNodes: { style: Record<string, string>; id: string; removed: boolean; children: unknown[] }[] = [];
    const prevDoc = (globalThis as { document?: unknown }).document;
    (globalThis as { document: unknown }).document = {
      createElement: () => {
        const node = {
          id: '',
          style: { cssText: '', display: 'none', width: '0%' },
          children: [] as unknown[],
          removed: false,
          innerHTML: '',
          setAttribute: () => {},
          querySelector: () => ({ style: { width: '0%' }, textContent: '' }),
          remove: () => {
            node.removed = true;
          }
        };
        createdNodes.push(node);
        return node;
      }
    };

    try {
      const container = { appendChild: vi.fn() } as unknown as HTMLElement;
      const overlay = new PixiBundleLoadingOverlay(container);

      // Fast load (<120ms) never flashes visible
      const t1 = overlay.beginLoad();
      vi.advanceTimersByTime(80);
      expect(overlay.isVisible).toBe(false);
      overlay.endLoad(t1);
      vi.advanceTimersByTime(100);
      expect(overlay.isVisible).toBe(false);

      // Slow load (>=120ms) displays cleanly
      const t2 = overlay.beginLoad();
      vi.advanceTimersByTime(LOADING_OVERLAY_DELAY_MS);
      expect(overlay.isVisible).toBe(true);
      overlay.endLoad(t2);
      expect(overlay.isVisible).toBe(false);
      overlay.dispose();

      // VRAM budget telemetry check
      const loader = new ProAssetLoader({ loadImage: async () => null, loadJson: async () => null });
      const mock = createMockAssetsDriver();
      const manager = new PixiAssetBundleManager(loader, mock.driver);
      await manager.init(buildSharedTilesetManifest(true));
      await manager.loadCoreBundle(['luffy']);
      await manager.loadSceneBundles(['island_A']);
      const vram = manager.getVramTelemetry();
      expect(vram.budgetMb).toBe(MOBILE_VRAM_BUDGET_MB);
      expect(vram.overBudget).toBe(true);
      expect(vram.estimatedVramMb).toBeGreaterThan(128);
      manager.dispose();
    } finally {
      (globalThis as { document?: unknown }).document = prevDoc;
    }
  });

  it('maintains identical VRAM & loaded URL counts across 5x Title -> Foosha -> Sea -> Battle -> Foosha round-trips', async () => {
    const loader = new ProAssetLoader({
      loadImage: async () => null,
      loadJson: async () => null
    });
    const mock = createMockAssetsDriver();
    const manager = new PixiAssetBundleManager(loader, mock.driver);

    await manager.init(defaultProAssetManifest);
    await manager.loadCoreBundle(['luffy']);

    const coreSnap = manager.getVramTelemetry();
    expect(coreSnap.activeBundles.map((b) => b.bundle)).toEqual(['core_always']);

    const cycle1Snapshots: Array<{ bundles: string[]; urls: number; vramMb: number }> = [];
    const cycle5Snapshots: Array<{ bundles: string[]; urls: number; vramMb: number }> = [];

    for (let cycle = 0; cycle < 5; cycle++) {
      const steps: string[][] = [
        ['island_foosha_village'],
        ['sea_east_blue'],
        ['battle_east_blue_harbor'],
        ['island_foosha_village'],
        []
      ];
      for (const target of steps) {
        const res = await manager.loadSceneBundles(target);
        expect(res.committed).toBe(true);
        const tele = manager.getVramTelemetry();
        const entry = {
          bundles: tele.activeBundles.map((b) => b.bundle),
          urls: tele.totalLoadedUrls,
          vramMb: tele.estimatedVramMb
        };
        if (cycle === 0) cycle1Snapshots.push(entry);
        if (cycle === 4) cycle5Snapshots.push(entry);
      }
    }

    expect(cycle5Snapshots).toEqual(cycle1Snapshots);
    expect(manager.getVramTelemetry().totalLoadedUrls).toBe(coreSnap.totalLoadedUrls);
    expect(manager.getVramTelemetry().estimatedVramMb).toBe(coreSnap.estimatedVramMb);

    // External .tsx XML parser smoke check
    const parsedTsx = parseTiledTsxXml(
      `<tileset name="master_port_village" tilewidth="16" tileheight="16" tilecount="1120" columns="28"><image source="ninja_adventure_village.webp" width="448" height="640"/></tileset>`,
      1,
      'assets/pro/tilesets/master_port_village.tsx'
    );
    expect(parsedTsx?.image).toBe('assets/pro/tilesets/ninja_adventure_village.webp');
    expect(parsedTsx?.columns).toBe(28);

    manager.dispose();
  });
});
