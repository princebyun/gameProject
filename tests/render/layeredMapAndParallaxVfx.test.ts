import { describe, expect, it } from 'vitest';
import { createAssetManifestRegistry } from '../../src/data/assets/assetManifestRegistry';
import type { BattleWorldState } from '../../src/core/types/battleState';
import { AmbientParticleSystem } from '../../src/render/rpg/ambientParticleSystem';
import { AtmosphereLightingOverlay } from '../../src/render/rpg/atmosphereLightingOverlay';
import { IslandYSortQueue } from '../../src/render/rpg/islandYSortQueue';
import { ParallaxBattleBackdrop } from '../../src/render/battle/parallaxBattleBackdrop';
import { VfxAtlasRenderer } from '../../src/render/battle/vfxAtlasRenderer';
import { computeNormalizedUnitDrawScale } from '../../src/render/sprite/spriteFrameRenderer';
import { LayeredTilemapRenderer } from '../../src/render/tileset/layeredTilemapRenderer';

interface StubCanvas {
  width: number;
  height: number;
  getContext: (kind: string) => StubCtx | null;
}

interface StubCtx {
  imageSmoothingEnabled: boolean;
  globalCompositeOperation: string;
  globalAlpha: number;
  fillStyle: string | CanvasGradient;
  strokeStyle: string;
  lineWidth: number;
  drawCalls: { dx: number; dy: number; dw: number; dh: number }[];
  drawImage: (...args: number[]) => void;
  fillRect: () => void;
  strokeRect: () => void;
  clearRect: () => void;
  beginPath: () => void;
  closePath: () => void;
  moveTo: () => void;
  lineTo: () => void;
  arc: () => void;
  ellipse: () => void;
  fill: () => void;
  stroke: () => void;
  save: () => void;
  restore: () => void;
  translate: () => void;
  rotate: () => void;
  scale: () => void;
  createRadialGradient: () => { addColorStop: () => void };
}

function makeStubCtx(): StubCtx {
  const drawCalls: { dx: number; dy: number; dw: number; dh: number }[] = [];
  return {
    imageSmoothingEnabled: false,
    globalCompositeOperation: 'source-over',
    globalAlpha: 1,
    fillStyle: '#000',
    strokeStyle: '#000',
    lineWidth: 1,
    drawCalls,
    drawImage: (...args: unknown[]) => {
      if (args.length >= 9) {
        drawCalls.push({
          dx: Number(args[5]),
          dy: Number(args[6]),
          dw: Number(args[7]),
          dh: Number(args[8])
        });
      }
    },
    fillRect: () => {},
    strokeRect: () => {},
    clearRect: () => {},
    beginPath: () => {},
    closePath: () => {},
    moveTo: () => {},
    lineTo: () => {},
    arc: () => {},
    ellipse: () => {},
    fill: () => {},
    stroke: () => {},
    save: () => {},
    restore: () => {},
    translate: () => {},
    rotate: () => {},
    scale: () => {},
    createRadialGradient: () => ({ addColorStop: () => {} })
  };
}

function withMockDocument<T>(fn: (canvases: StubCanvas[], contexts: StubCtx[]) => T): T {
  const prevDoc = (globalThis as { document?: unknown }).document;
  const canvases: StubCanvas[] = [];
  const contexts: StubCtx[] = [];
  (globalThis as { document?: unknown }).document = {
    createElement: (tag: string): StubCanvas => {
      const ctx = makeStubCtx();
      if (tag === 'canvas') contexts.push(ctx);
      const canvas: StubCanvas = {
        width: 0,
        height: 0,
        getContext: (kind: string) => (kind === '2d' ? ctx : null)
      };
      if (tag === 'canvas') canvases.push(canvas);
      return canvas;
    }
  };
  try {
    return fn(canvases, contexts);
  } finally {
    if (prevDoc === undefined) {
      delete (globalThis as { document?: unknown }).document;
    } else {
      (globalThis as { document?: unknown }).document = prevDoc;
    }
  }
}

describe('Step 2 Renderers — 7-Layer Maps, Y-Sort, Parallax Backdrops & Pooled VFX', () => {
  it('LayeredTilemapRenderer caches <= 6 maps via LRU and zeroes GPU chunk dimensions on dispose', () => {
    withMockDocument((canvases) => {
      const registry = createAssetManifestRegistry();
      const biome = registry.tilesetsFile.biomes.find((b) => b.category !== 'SEA')!;
      const renderer = new LayeredTilemapRenderer();
      const mainCtx = makeStubCtx() as unknown as CanvasRenderingContext2D;
      const stubAtlas = { width: 256, height: 256 } as unknown as HTMLCanvasElement;
      const provider = { getOrCreateBiomeTileset: () => stubAtlas };

      for (let i = 0; i < 8; i++) {
        renderer.renderBaseLayers(
          mainCtx,
          `island_${i}`,
          640,
          480,
          0,
          0,
          640,
          480,
          biome,
          provider,
          i,
          [{ x: 80, y: 80, width: 96, height: 72, label: '주점' }]
        );
        renderer.renderOverheadLayer(mainCtx, `island_${i}`, biome, 1, 0, 0, 640, 480);
      }

      expect(renderer.cachedMapCount).toBe(6);

      // Swapping fallback 256x64 atlas to decoded 256x256 external PNG triggers re-bake & releases old chunks
      const canvasesBeforeUpgrade = canvases.length;
      const upgradedAtlas = { width: 256, height: 256, naturalHeight: 256 } as unknown as HTMLImageElement;
      const upgradedProvider = { getOrCreateBiomeTileset: () => upgradedAtlas };
      renderer.renderBaseLayers(
        mainCtx,
        'island_7',
        640,
        480,
        0,
        0,
        640,
        480,
        biome,
        upgradedProvider,
        9,
        [{ x: 80, y: 80, width: 96, height: 72, label: '주점' }]
      );
      expect(canvases.length).toBeGreaterThan(canvasesBeforeUpgrade);

      renderer.dispose();
      expect(renderer.cachedMapCount).toBe(0);
      expect(canvases.length).toBeGreaterThan(0);
      expect(canvases.every((c) => c.width === 0 && c.height === 0)).toBe(true);
    });
  });

  it('IslandYSortQueue flushes items ordered monotonically by footY', () => {
    const q = new IslandYSortQueue();
    const order: number[] = [];
    q.push(240, () => order.push(240));
    q.push(95, () => order.push(95));
    q.push(160, () => order.push(160));
    q.push(160, () => order.push(160));
    expect(q.getOrderedFootYs()).toEqual([95, 160, 160, 240]);
    q.flush(makeStubCtx() as unknown as CanvasRenderingContext2D);
    expect(order).toEqual([95, 160, 160, 240]);
    expect(q.length).toBe(0);
  });

  it('AmbientParticleSystem reuses bounded ObjectPool across biome transitions', () => {
    const sys = new AmbientParticleSystem();
    const ctx = makeStubCtx() as unknown as CanvasRenderingContext2D;
    for (const biome of ['foosha_port', 'alabasta_desert', 'drum_snow', 'egghead_lab']) {
      for (let t = 0; t < 10; t++) {
        sys.stepAndRender(ctx, biome, 1170, 540, t);
      }
    }
    expect(sys.activeCount).toBeGreaterThan(0);
    expect(sys.activeCount).toBeLessThanOrEqual(42);
    expect(sys.createdPoolCount).toBeLessThanOrEqual(96);
    sys.clear();
    expect(sys.activeCount).toBe(0);
  });

  it('AtmosphereLightingOverlay never uses shadowBlur and zeroes offscreen canvas on dispose', () => {
    withMockDocument((canvases, contexts) => {
      const overlay = new AtmosphereLightingOverlay();
      const ctx = makeStubCtx() as unknown as CanvasRenderingContext2D;
      overlay.render(ctx, 'DAY', '#38bdf8', 1170, 540);
      overlay.render(ctx, 'NIGHT', '#0f172a', 1170, 540, [{ x: 140, y: 200 }], 105);
      expect((ctx as unknown as { shadowBlur?: number }).shadowBlur).toBeUndefined();
      expect(contexts.every((c) => !('shadowBlur' in c))).toBe(true);
      overlay.dispose();
      expect(canvases.every((c) => c.width === 0 && c.height === 0)).toBe(true);
    });
  });

  it('ParallaxBattleBackdrop covers 1170x540 & 1260x540 with 0.88x zoom and caps decals at 24', () => {
    const registry = createAssetManifestRegistry();
    const backdrop = new ParallaxBattleBackdrop();
    const layerStub = { width: 1280, height: 540 } as unknown as HTMLCanvasElement;
    const provider = {
      manifestRegistry: registry,
      getOrCreateBattleBackdropLayer: () => layerStub
    };

    for (const viewW of [960, 1170, 1260]) {
      for (const zoom of [1, 0.88]) {
        const ctx = makeStubCtx();
        const entry = backdrop.render(
          ctx as unknown as CanvasRenderingContext2D,
          provider,
          { islandId: 'wano_onigashima' },
          320,
          12,
          viewW,
          540,
          zoom
        );
        expect(entry.id).toBe('onigashima_rooftop');
        expect(ctx.drawCalls.length).toBeGreaterThanOrEqual(3);
        const minX = Math.min(...ctx.drawCalls.map((d) => d.dx));
        const maxRight = Math.max(...ctx.drawCalls.map((d) => d.dx + d.dw));
        expect(minX).toBeLessThanOrEqual(0);
        expect(maxRight).toBeGreaterThanOrEqual(viewW);
      }
    }

    const fakeEvents = Array.from({ length: 40 }, (_, i) => ({
      pos: { x: 100 + i * 10, y: 300 },
      radiusPx: 48,
      color: i % 2 === 0 ? '#ef4444' : '#38bdf8',
      kind: 'SKY_SPLIT_SHOCKWAVE'
    }));
    backdrop.recordExplosionDecals(fakeEvents);
    expect(backdrop.decalCount).toBe(24);
    backdrop.clearDecals();
    expect(backdrop.decalCount).toBe(0);
  });

  it('VfxAtlasRenderer syncs world VFX and recycles ObjectPool instances cleanly', () => {
    const registry = createAssetManifestRegistry();
    const vfx = new VfxAtlasRenderer();
    const sheetStub = { width: 512, height: 64 } as unknown as HTMLCanvasElement;
    const provider = {
      manifestRegistry: registry,
      getOrCreateVfxAtlas: () => sheetStub
    };
    const ctx = makeStubCtx() as unknown as CanvasRenderingContext2D;
    const fakeWorld = {
      tick: 1,
      vfxEvents: [
        { pos: { x: 300, y: 260 }, radiusPx: 46, color: '#ef4444', kind: 'CROSS_SLASH' },
        { pos: { x: 420, y: 280 }, radiusPx: 60, color: '#facc15', kind: 'CONQUEROR_LIGHTNING' }
      ],
      meleeArcs: [
        {
          origin: { x: 250, y: 270 },
          dir: { x: 1, y: 0 },
          radiusPx: 48,
          hasConquerorCoating: false
        }
      ],
      beamClashes: [],
      meleeBeamGuards: [],
      meleeClashes: []
    } as unknown as BattleWorldState;

    vfx.syncAndRenderWorldVfx(ctx, fakeWorld, provider);
    expect(vfx.activeCount).toBe(3);

    for (let t = 2; t <= 120; t++) {
      fakeWorld.tick = t;
      vfx.syncAndRenderWorldVfx(ctx, fakeWorld, provider);
    }
    expect(vfx.activeCount).toBe(0);
    expect(vfx.createdPoolCount).toBeLessThanOrEqual(128);
  });

  it('computeNormalizedUnitDrawScale normalizes 48px-128px frames consistently', () => {
    const registry = createAssetManifestRegistry();
    const luffyEntry = registry.spritesFile.entries.find((e) => e.key === 'luffy_base')!;
    const s = computeNormalizedUnitDrawScale(luffyEntry, 1.0, 1.0);
    expect(s * luffyEntry.frameHeight).toBeCloseTo(luffyEntry.targetDisplayHeight ?? 76, 0);
  });
});
