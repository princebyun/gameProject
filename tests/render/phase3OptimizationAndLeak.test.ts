import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import { ExternalAssetResolver } from '../../src/assets/externalAssetResolver';
import { RetroAudioEngine } from '../../src/audio/retroAudioEngine';
import { WebDeviceAdapter } from '../../src/platform/deviceAdapter';
import { WebSocketTransport } from '../../src/platform/net/webSocketTransport';
import { CanvasRenderer } from '../../src/render/canvasRenderer';
import {
  createAfterimagePool,
  FloatingTextPool,
  lerpVecInto,
  ParticlePool
} from '../../src/render/pools/renderScratchPools';
import { SpriteEffectCache } from '../../src/render/sprite/spriteEffectCache';
import { TilemapLayerRenderer } from '../../src/render/tileset/tilemapLayerRenderer';
import {
  computeArenaVisibleBounds,
  computeCameraWorldBounds,
  isCircleInBounds,
  isRectInBounds,
  isSegmentInBounds
} from '../../src/render/viewport/frustumCulling';

interface MockCanvas {
  width: number;
  height: number;
  style: Record<string, string>;
  getContext: (kind: string) => MockCanvas2DContext | null;
  remove: () => void;
}

interface MockCanvas2DContext {
  imageSmoothingEnabled: boolean;
  globalCompositeOperation: string;
  globalAlpha: number;
  fillStyle: string;
  strokeStyle: string;
  lineWidth: number;
  shadowBlur?: number;
  drawImage: () => void;
  fillRect: () => void;
  clearRect: () => void;
}

function installMockCanvasDocument(): {
  createdCanvases: MockCanvas[];
  contexts: MockCanvas2DContext[];
  restore: () => void;
} {
  const prevDoc = (globalThis as { document?: unknown }).document;
  const createdCanvases: MockCanvas[] = [];
  const contexts: MockCanvas2DContext[] = [];

  const mockDocument = {
    createElement: (tag: string): MockCanvas => {
      if (tag !== 'canvas') {
        return {
          width: 0,
          height: 0,
          style: {},
          getContext: () => null,
          remove: () => {}
        };
      }
      const ctx: MockCanvas2DContext = {
        imageSmoothingEnabled: true,
        globalCompositeOperation: 'source-over',
        globalAlpha: 1,
        fillStyle: '#000000',
        strokeStyle: '#000000',
        lineWidth: 1,
        drawImage: () => {},
        fillRect: () => {},
        clearRect: () => {}
      };
      contexts.push(ctx);
      const canvas: MockCanvas = {
        width: 0,
        height: 0,
        style: {},
        getContext: (kind: string) => (kind === '2d' ? ctx : null),
        remove: () => {}
      };
      createdCanvases.push(canvas);
      return canvas;
    }
  };

  (globalThis as { document?: unknown }).document = mockDocument;
  return {
    createdCanvases,
    contexts,
    restore: () => {
      if (prevDoc === undefined) {
        delete (globalThis as { document?: unknown }).document;
      } else {
        (globalThis as { document?: unknown }).document = prevDoc;
      }
    }
  };
}

function walkTs(dir: string, out: string[] = []): string[] {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) walkTs(full, out);
    else if (ent.name.endsWith('.ts')) out.push(full);
  }
  return out;
}

describe('Step 3: Canvas 60FPS Optimization, Zero shadowBlur, Pools & Zero-Leak GPU Disposal', () => {
  it('verifies zero ctx.shadowBlur usage across src/render/ and src/scenes/', () => {
    const root = process.cwd();
    const files = [
      ...walkTs(path.join(root, 'src', 'render')),
      ...walkTs(path.join(root, 'src', 'scenes'))
    ];
    expect(files.length).toBeGreaterThan(15);
    for (const file of files) {
      const code = fs.readFileSync(file, 'utf8');
      expect(/\.\s*shadowBlur\b/.test(code), `Unexpected shadowBlur in ${file}`).toBe(
        false
      );
    }
  });

  it('computes frustum culling accurately for standard camera and zoomed giant-boss camera', () => {
    const stdBounds = computeCameraWorldBounds(0, 0, 1170, 540, 48);
    expect(isCircleInBounds(stdBounds, 500, 270, 24)).toBe(true);
    expect(isCircleInBounds(stdBounds, -200, 270, 24)).toBe(false);
    expect(isCircleInBounds(stdBounds, 1300, 270, 24)).toBe(false);
    expect(isRectInBounds(stdBounds, -60, 100, 30, 30)).toBe(true);
    expect(isRectInBounds(stdBounds, -160, 100, 30, 30)).toBe(false);
    expect(isSegmentInBounds(stdBounds, -100, 200, 1300, 200, 4)).toBe(true);
    expect(isSegmentInBounds(stdBounds, 100, 700, 400, 700, 4)).toBe(false);

    // Zoomed-out giant boss arena (0.88x) expands world frustum bounds symmetrically
    const bossBounds = computeArenaVisibleBounds(0, 0, 1170, 540, 0.88, 64);
    expect(bossBounds.minX).toBeLessThan(stdBounds.minX);
    expect(bossBounds.maxX).toBeGreaterThan(stdBounds.maxX);
    expect(isCircleInBounds(bossBounds, 1260, 270, 20)).toBe(true);
  });

  it('performs zero-allocation vector interpolation and bounds ObjectPool growth across reuse cycles', () => {
    const out = { x: 0, y: 0 };
    const ret = lerpVecInto({ x: 10, y: 20 }, { x: 30, y: 60 }, 0.5, out);
    expect(ret).toBe(out);
    expect(out).toEqual({ x: 20, y: 40 });

    const particles = new ParticlePool(8, 32);
    const texts = new FloatingTextPool(8, 32);
    const afterimages = createAfterimagePool(8, 32);

    for (let i = 0; i < 200; i++) {
      const p = particles.acquire();
      p.x = i;
      particles.release(p);

      const ft = texts.acquire();
      ft.text = '120';
      texts.release(ft);

      const ai = afterimages.acquire();
      ai.row = 2;
      afterimages.release(ai);
    }

    expect(particles.createdCount).toBe(8);
    expect(texts.createdCount).toBe(8);
    expect(afterimages.createdCount).toBe(8);
    expect(particles.pooledCount).toBe(8);
  });

  it('releases offscreen canvas GPU memory (width=0, height=0) on SpriteEffectCache LRU eviction and dispose', () => {
    const mockEnv = installMockCanvasDocument();
    try {
      const cache = new SpriteEffectCache(2);
      const dummySheet = { width: 256, height: 256 } as unknown as HTMLCanvasElement;

      const c0 = cache.getOrCreateEffectFrame(
        'luffy',
        dummySheet,
        0,
        0,
        48,
        48,
        'ARMAMENT_BLACK',
        '#111827'
      ) as unknown as MockCanvas | null;
      expect(c0).not.toBeNull();
      // 2 canvases allocated: cached frame + temp outline canvas (already zeroed immediately!)
      expect(mockEnv.createdCanvases.length).toBe(2);
      expect(mockEnv.createdCanvases[1]?.width).toBe(0);
      expect(mockEnv.createdCanvases[1]?.height).toBe(0);
      expect(mockEnv.contexts.every((c) => c.shadowBlur === undefined)).toBe(true);

      const c1 = cache.getOrCreateEffectFrame(
        'luffy',
        dummySheet,
        0,
        1,
        48,
        48,
        'WHITE_FLASH',
        '#ffffff'
      ) as unknown as MockCanvas | null;
      expect(cache.size).toBe(2);

      // Inserting 3rd entry evicts c0 and must zero its backing dimensions
      const c2 = cache.getOrCreateEffectFrame(
        'luffy',
        dummySheet,
        0,
        2,
        48,
        48,
        'LOGIA_SILHOUETTE',
        '#f97316'
      ) as unknown as MockCanvas | null;
      expect(cache.size).toBe(2);
      expect(c0?.width).toBe(0);
      expect(c0?.height).toBe(0);
      expect(c1?.width).toBe(48);
      expect(c2?.width).toBe(48);

      // Disposing cache must zero all remaining entries
      cache.dispose();
      expect(cache.size).toBe(0);
      expect(c1?.width).toBe(0);
      expect(c1?.height).toBe(0);
      expect(c2?.width).toBe(0);
      expect(c2?.height).toBe(0);
    } finally {
      mockEnv.restore();
    }
  });

  it('evicts oldest tilemap chunks cleanly and zeroes chunk canvases on TilemapLayerRenderer LRU eviction & dispose', () => {
    const mockEnv = installMockCanvasDocument();
    try {
      const renderer = new TilemapLayerRenderer();
      const dummyAtlas = { width: 256, height: 128 } as unknown as HTMLCanvasElement;
      const atlasProvider = {
        getOrCreateBiomeTileset: () => dummyAtlas
      };
      const fakeCtx = {
        drawImage: () => {}
      } as unknown as CanvasRenderingContext2D;

      const makeBiome = (id: string) => ({
        biomeId: id,
        category: 'ISLAND_DUNGEON' as const,
        name: id,
        src: `assets/tilesets/${id}.png`,
        tileSize: 16 as const,
        renderScale: 2 as const,
        animatedRow: 1,
        animatedFrames: 4,
        animatedFps: 4,
        palette: {
          base: '#22c55e',
          detail: '#15803d',
          edge: '#86efac',
          wall: '#1e293b',
          accent: '#16a34a',
          waterOrHazard: '#0284c7'
        }
      });

      // Bake 6 maps (maxCachedMaps = 6) -> first chunk belongs to map_0
      for (let i = 0; i < 6; i++) {
        renderer.renderBiomeBackdrop(
          fakeCtx,
          `map_${i}`,
          256,
          256,
          0,
          0,
          256,
          256,
          makeBiome(`biome_${i}`),
          atlasProvider,
          0
        );
      }
      expect(renderer.cachedMapCount).toBe(6);
      const map0Chunk = mockEnv.createdCanvases[0]!;
      expect(map0Chunk.width).toBe(256);

      // Baking a 7th map must evict map_0 and zero map0Chunk
      renderer.renderBiomeBackdrop(
        fakeCtx,
        'map_6',
        256,
        256,
        0,
        0,
        256,
        256,
        makeBiome('biome_6'),
        atlasProvider,
        0
      );
      expect(renderer.cachedMapCount).toBe(6);
      expect(map0Chunk.width).toBe(0);
      expect(map0Chunk.height).toBe(0);

      renderer.dispose();
      expect(renderer.cachedMapCount).toBe(0);
      for (const c of mockEnv.createdCanvases) {
        expect(c.width).toBe(0);
        expect(c.height).toBe(0);
      }
    } finally {
      mockEnv.restore();
    }
  });

  it('releases replaced baked fallback canvases on external PNG hot-swap and zeroes LRU entries in ExternalAssetResolver', async () => {
    const mockEnv = installMockCanvasDocument();
    try {
      const extImage = { width: 128, height: 64 } as unknown as HTMLImageElement;
      const resolver = new ExternalAssetResolver(
        async () => extImage,
        async () => null,
        2
      );

      const baked0 = mockEnv.restore; // keep reference check via createElement
      void baked0;
      const doc = (globalThis as { document: { createElement: (t: string) => MockCanvas } }).document;
      const canvasA = doc.createElement('canvas');
      canvasA.width = 64;
      canvasA.height = 64;

      const initial = resolver.resolveImageSyncOrBake(
        'luffy_base',
        'assets/sprites/luffy_base.png',
        () => canvasA as unknown as HTMLCanvasElement
      );
      expect(initial.source).toBe('BAKED_FALLBACK');
      expect(canvasA.width).toBe(64);

      // Flush background hot-swap probe promise -> replaced baked canvasA must be zeroed!
      await new Promise((r) => setTimeout(r, 0));
      expect(resolver.getSourceStatus('luffy_base')).toBe('EXTERNAL_PNG');
      expect(canvasA.width).toBe(0);
      expect(canvasA.height).toBe(0);

      // Exceed maxImageEntries (2) -> oldest baked canvas zeroed on eviction
      const canvasB = doc.createElement('canvas');
      canvasB.width = 48;
      canvasB.height = 48;
      const canvasC = doc.createElement('canvas');
      canvasC.width = 48;
      canvasC.height = 48;
      const resolver2 = new ExternalAssetResolver(
        async () => null,
        async () => null,
        2
      );
      resolver2.resolveImageSyncOrBake('k1', 'assets/a.png', () => canvasB as unknown as HTMLCanvasElement);
      resolver2.resolveImageSyncOrBake('k2', 'assets/b.png', () => canvasC as unknown as HTMLCanvasElement);
      resolver2.resolveImageSyncOrBake('k3', 'assets/c.png', () => null);
      expect(canvasB.width).toBe(0);
      expect(canvasB.height).toBe(0);
      expect(canvasC.width).toBe(48);

      resolver2.dispose();
      expect(canvasC.width).toBe(0);
      expect(canvasC.height).toBe(0);
    } finally {
      mockEnv.restore();
    }
  });

  it('detaches window AbortController listeners and cleans WebSocket/Audio handles on dispose()', () => {
    const prevWindow = (globalThis as { window?: unknown }).window;
    const signals: AbortSignal[] = [];
    const mockWindow = {
      addEventListener: vi.fn((_ev: string, _cb: unknown, opts?: { signal?: AbortSignal }) => {
        if (opts?.signal) signals.push(opts.signal);
      }),
      removeEventListener: vi.fn()
    };
    (globalThis as { window?: unknown }).window = mockWindow;

    try {
      const audio = new RetroAudioEngine();
      audio.attachGestureUnlock();
      expect(signals.length).toBe(3);
      expect(signals.every((s) => !s.aborted)).toBe(true);
      audio.dispose();
      expect(signals.every((s) => s.aborted)).toBe(true);

      const devSignalsStart = signals.length;
      const device = new WebDeviceAdapter();
      void device.init();
      expect(signals.length).toBe(devSignalsStart + 1);
      expect(signals[devSignalsStart]?.aborted).toBe(false);
      device.dispose();
      expect(signals[devSignalsStart]?.aborted).toBe(true);

      const transport = new WebSocketTransport('c1', 'ws://localhost:9999');
      transport.onMessage(() => {});
      transport.onDisconnect(() => {});
      transport.dispose();
      expect(transport.isConnected()).toBe(false);

      // CanvasRenderer + ResponsiveViewportManager + SafeArea probe cleanup
      const prevDoc = (globalThis as { document?: unknown }).document;
      const probeNodes: { parentNode: { removeChild: (n: unknown) => void } | null; id?: string; style: Record<string, string>; setAttribute: () => void }[] = [];
      const mockCtx = { imageSmoothingEnabled: true, setTransform: () => {} };
      const mainCanvas = {
        width: 0,
        height: 0,
        style: {} as Record<string, string>,
        getContext: () => mockCtx,
        getBoundingClientRect: () => ({ width: 915, height: 412, left: 0, top: 0 }),
        remove: vi.fn()
      };
      const fakeBody = {
        appendChild: (node: { parentNode: unknown }) => {
          node.parentNode = fakeBody;
        },
        removeChild: vi.fn((node: { parentNode: unknown }) => {
          node.parentNode = null;
        })
      };
      (globalThis as { document?: unknown }).document = {
        body: fakeBody,
        createElement: (tag: string) => {
          if (tag === 'canvas') return mainCanvas;
          const div = { parentNode: null, id: '', style: {}, setAttribute: () => {} };
          probeNodes.push(div);
          return div;
        }
      };
      (mockWindow as Record<string, unknown>).innerWidth = 915;
      (mockWindow as Record<string, unknown>).innerHeight = 412;
      (mockWindow as Record<string, unknown>).devicePixelRatio = 3;
      (mockWindow as Record<string, unknown>).getComputedStyle = () => ({
        paddingTop: '0px',
        paddingRight: '0px',
        paddingBottom: '0px',
        paddingLeft: '0px'
      });
      try {
        const vpStart = signals.length;
        const container = {
          getBoundingClientRect: () => ({ width: 915, height: 412 }),
          appendChild: () => {}
        } as unknown as HTMLElement;
        const cr = new CanvasRenderer(container);
        expect(signals.length).toBeGreaterThan(vpStart);
        expect(mainCanvas.width).toBeGreaterThan(0);
        cr.dispose();
        expect(signals[vpStart]?.aborted).toBe(true);
        expect(mainCanvas.width).toBe(0);
        expect(mainCanvas.height).toBe(0);
        expect(mainCanvas.remove).toHaveBeenCalledTimes(1);
        expect(fakeBody.removeChild).toHaveBeenCalledTimes(1);
      } finally {
        if (prevDoc === undefined) delete (globalThis as { document?: unknown }).document;
        else (globalThis as { document?: unknown }).document = prevDoc;
      }
    } finally {
      if (prevWindow === undefined) {
        delete (globalThis as { window?: unknown }).window;
      } else {
        (globalThis as { window?: unknown }).window = prevWindow;
      }
    }
  });
});
