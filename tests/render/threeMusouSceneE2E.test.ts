import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { createBattleWorld, stepBattleWorld } from '../../src/core/combat/battleWorld';
import { FIXED_DT } from '../../src/core/constants';
import { SeededPRNG } from '../../src/core/math/prng';
import { computeBattleStateHash } from '../../src/core/net/stateHasher';
import { createStandardPresetBuild } from '../../src/core/net/terminalArenaRule';
import { defaultDataRegistry } from '../../src/data/dataRegistry';
import { ThreeMusouBattleScene } from '../../src/render/three/ThreeMusouBattleScene';
import {
  ThreeComposerLike,
  ThreeRendererLike,
  ThreeStageHost
} from '../../src/render/three/ThreeStageHost';
import { computeResponsiveViewport } from '../../src/render/viewport/responsiveViewportManager';
import {
  ThreeMusouController,
  ThreeMusouHostContext
} from '../../src/scenes/controllers/threeMusouController';
import type { CanvasRenderer } from '../../src/render/canvasRenderer';

function createMockThreeHost() {
  const rendererDisposed = vi.fn();
  const composerDisposed = vi.fn();
  const composerRender = vi.fn();

  const mockRenderer: ThreeRendererLike = {
    domElement: {} as HTMLCanvasElement,
    shadowMap: { enabled: true, type: THREE.PCFSoftShadowMap },
    toneMapping: THREE.NoToneMapping,
    toneMappingExposure: 1,
    outputColorSpace: THREE.SRGBColorSpace,
    info: {
      render: { calls: 18, triangles: 29400 },
      memory: { geometries: 12, textures: 5 },
      programs: [{}]
    },
    setPixelRatio: vi.fn(),
    setSize: vi.fn(),
    render: vi.fn(),
    dispose: rendererDisposed
  };
  const mockComposer: ThreeComposerLike = {
    setSize: vi.fn(),
    render: composerRender,
    dispose: composerDisposed
  };

  const host = new ThreeStageHost({
    rendererFactory: () => mockRenderer,
    composerFactory: () => ({
      composer: mockComposer,
      bloomPass: { strength: 0.38, enabled: true }
    })
  });

  const s25 = computeResponsiveViewport(915, 412, 3, {
    top: 0,
    right: 24,
    bottom: 0,
    left: 24
  });
  host.init(null, s25);
  return { host, s25, rendererDisposed, composerDisposed, composerRender };
}

describe('Step 4 E2E: ThreeMusouBattleScene, 60FPS Budget, Core Immortality, & 5x Round-Trip Dispose', () => {
  it('runs 60 frames under 16.6ms/frame without mutating deterministic core BattleWorldState', () => {
    const { host, s25 } = createMockThreeHost();
    const world = createBattleWorld(
      {
        seed: 20261124,
        mode: '1V1',
        arenaSizeKey: 'large',
        teamAlpha: [createStandardPresetBuild('luffy', 'a1', true, 3, defaultDataRegistry)],
        teamOmega: [createStandardPresetBuild('kaido', 'o1', false, 3, defaultDataRegistry)]
      },
      defaultDataRegistry
    );
    const prng = new SeededPRNG(20261124);
    for (let i = 0; i < 15; i += 1) {
      stepBattleWorld(world, [], defaultDataRegistry, prng, FIXED_DT);
    }
    const hashBefore = computeBattleStateHash(world, prng);

    const scene3d = new ThreeMusouBattleScene(host);
    const benchStart = performance.now();
    for (let frame = 0; frame < 60; frame += 1) {
      scene3d.render(world, 1, 1 / 60, s25);
    }
    const avgFrameMs = (performance.now() - benchStart) / 60;
    expect(avgFrameMs).toBeLessThan(16.6);

    // Core simulation hash must remain 100% untouched by 3D rendering
    expect(computeBattleStateHash(world, prng)).toBe(hashBefore);

    // Lock-on, Air launch, and Musou Burst Demo work end-to-end
    const lockedId = scene3d.toggleBossLockOn(world);
    expect(lockedId).toBe('o1');
    const burst = scene3d.triggerMusouDemoBurst(world);
    expect(burst.launchedGrunts).toBeGreaterThan(0);

    const counters = scene3d.getCounterSnapshot();
    expect(counters.koCount).toBe(burst.launchedGrunts);
    expect(counters.lockedBossUnitId).toBe('o1');

    scene3d.applyTuning({
      celSteps: 4,
      shadowShiftStrength: 0.6,
      outlineWidth: 0.04,
      rimIntensity: 1.1,
      bloomStrength: 0.55,
      speedlinesOpacity: 0.9,
      hordeTargetCount: 60,
      hitstopTicks: 4
    });
    expect(scene3d.horde.getActiveCount()).toBe(60);

    scene3d.dispose();
    // Scene graph returns strictly to base host lights [sunLight, hemiLight]
    expect(host.scene.children.length).toBe(2);
    host.dispose();
  });

  it('survives 5x mount/render/dispose round-trips with 0 leaked Three.js scene children', () => {
    const { host, s25 } = createMockThreeHost();
    const world = createBattleWorld(
      {
        seed: 777,
        mode: '1V1',
        arenaSizeKey: 'medium',
        teamAlpha: [createStandardPresetBuild('luffy', 'a1', true, 3, defaultDataRegistry)],
        teamOmega: [createStandardPresetBuild('kaido', 'o1', false, 3, defaultDataRegistry)]
      },
      defaultDataRegistry
    );

    const baselineChildren = host.scene.children.length;
    expect(baselineChildren).toBe(2);

    for (let cycle = 0; cycle < 5; cycle += 1) {
      const musou = new ThreeMusouBattleScene(host);
      expect(host.scene.children.length).toBeGreaterThan(baselineChildren);
      for (let f = 0; f < 5; f += 1) {
        musou.render(world, 1, 1 / 60, s25);
      }
      musou.dispose();
      expect(host.scene.children.length).toBe(baselineChildren);
      expect(host.isActive).toBe(false);
    }

    host.dispose();
  });

  it('enforces strict mutual exclusion between ThreeMusouController and PixiVerticalSliceController', () => {
    const { host, s25 } = createMockThreeHost();
    const ctrl = new ThreeMusouController(host);
    const releasePixi = vi.fn();
    let pixiKind = 'BATTLE';

    const mockCtx = {
      save: vi.fn(),
      restore: vi.fn(),
      beginPath: vi.fn(),
      roundRect: vi.fn(),
      arc: vi.fn(),
      fill: vi.fn(),
      stroke: vi.fn(),
      fillRect: vi.fn(),
      strokeRect: vi.fn(),
      fillText: vi.fn()
    } as unknown as CanvasRenderingContext2D;

    const world = createBattleWorld(
      {
        seed: 99,
        mode: '1V1',
        arenaSizeKey: 'medium',
        teamAlpha: [createStandardPresetBuild('luffy', 'a1', true, 3, defaultDataRegistry)],
        teamOmega: [createStandardPresetBuild('kaido', 'o1', false, 3, defaultDataRegistry)]
      },
      defaultDataRegistry
    );

    const fakeHost: ThreeMusouHostContext = {
      activeScene: 'SANDBOX',
      battleWorld: world,
      renderer: { ctx: mockCtx } as unknown as CanvasRenderer,
      verticalSliceController: {
        getActiveKind: () => pixiKind,
        releaseActiveSlice: () => {
          pixiKind = 'NONE';
          releasePixi();
        }
      },
      saveIndicatorText: '',
      saveIndicatorTimer: 0,
      updateShowcaseToolbar: vi.fn()
    };

    expect(ctrl.renderFrameIfActive(fakeHost, s25, 1)).toBe(true);
    expect(releasePixi).toHaveBeenCalledTimes(1);
    expect(ctrl.getActiveScene()).not.toBeNull();

    // Switching out to SEA_SAILING releases 3D Musou scene cleanly
    fakeHost.activeScene = 'SEA_SAILING';
    expect(ctrl.renderFrameIfActive(fakeHost, s25, 1)).toBe(false);
    expect(ctrl.getActiveScene()).toBeNull();
    expect(host.scene.children.length).toBe(2);

    // Toggling 3D mode OFF in SANDBOX allows 2D fallback cleanly
    fakeHost.activeScene = 'SANDBOX';
    ctrl.toggleEnabled(fakeHost);
    expect(ctrl.isEnabled()).toBe(false);
    expect(ctrl.renderFrameIfActive(fakeHost, s25, 1)).toBe(false);

    ctrl.dispose();
  });
});
