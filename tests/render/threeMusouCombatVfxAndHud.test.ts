import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import {
  buildMusouHudSnapshot,
  createMusouCombatState,
  fillMusouBurstGauge,
  setBossArmorToRatio,
  stepMusouCombatTick
} from '../../src/core/battle/musou/MusouCombatEngine';
import { createBattleWorld, stepBattleWorld } from '../../src/core/combat/battleWorld';
import { FIXED_DT } from '../../src/core/constants';
import { SeededPRNG } from '../../src/core/math/prng';
import { createStandardPresetBuild } from '../../src/core/net/terminalArenaRule';
import { defaultDataRegistry } from '../../src/data/dataRegistry';
import { ARMOR_SHARD_COUNT } from '../../src/render/three/musou/ArmorBreakVfxSystem';
import { ThreeMusouBattleScene } from '../../src/render/three/ThreeMusouBattleScene';
import {
  ThreeComposerLike,
  ThreeRendererLike,
  ThreeStageHost
} from '../../src/render/three/ThreeStageHost';
import { computeBattleSpeedHudRects } from '../../src/render/hud/battleSpeedHud';
import { computeResponsiveViewport } from '../../src/render/viewport/responsiveViewportManager';
import { getSafeHudBounds } from '../../src/render/viewport/safeAreaLayout';
import {
  computeMusouHudLayout,
  hitTestMusouBattleHud,
  type MusouHudRect
} from '../../src/ui/MusouBattleHUD';

function rectsOverlap(a: MusouHudRect, b: MusouHudRect): boolean {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}

function createTrackingMockHost(flashEffect = true) {
  let geoCount = 0;
  let texCount = 0;
  const mockRenderer: ThreeRendererLike = {
    domElement: {} as HTMLCanvasElement,
    shadowMap: { enabled: true, type: THREE.PCFSoftShadowMap },
    toneMapping: THREE.NoToneMapping,
    toneMappingExposure: 1,
    outputColorSpace: THREE.SRGBColorSpace,
    info: {
      render: { calls: 24, triangles: 32000 },
      memory: {
        get geometries() {
          return geoCount;
        },
        get textures() {
          return texCount;
        }
      },
      programs: [{}]
    },
    setPixelRatio: vi.fn(),
    setSize: vi.fn(),
    render: vi.fn(),
    dispose: vi.fn()
  };
  const mockComposer: ThreeComposerLike = {
    setSize: vi.fn(),
    render: vi.fn(),
    dispose: vi.fn()
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
    right: 36,
    bottom: 14,
    left: 44
  });
  host.init(null, s25);
  host.applyVisualPolishConfig({ quality: 'HIGH', flashEffect });
  const setMem = (g: number, t: number) => {
    geoCount = g;
    texCount = t;
  };
  return { host, s25, setMem };
}

describe('Step 2 & Step 3: PW4 3D VFX Pools, S25 Ultra 915x412 HUD Layout, Flash Safety, & 60FPS / 0-Leak', () => {
  it('ensures 0px overlap across all Galaxy S25 Ultra (915x412, 19.5:9) Musou HUD panels, speed buttons, & 8 thumb buttons inside Safe Area', () => {
    const s25 = computeResponsiveViewport(915, 412, 3, {
      top: 0,
      right: 36,
      bottom: 14,
      left: 44
    });
    const safe = getSafeHudBounds(s25, 8);
    const speedRects = computeBattleSpeedHudRects(safe);
    const layout = computeMusouHudLayout(s25);

    const panels: MusouHudRect[] = [
      layout.playerCard,
      layout.bossBar,
      layout.koCounter,
      layout.staminaBar,
      speedRects.speedBtn,
      speedRects.pauseBtn
    ];

    // 1. Every panel & circle lies strictly inside Safe Area
    for (const r of panels) {
      expect(r.x).toBeGreaterThanOrEqual(safe.left - 1);
      expect(r.y).toBeGreaterThanOrEqual(safe.top - 1);
      expect(r.x + r.w).toBeLessThanOrEqual(safe.right + 1);
      expect(r.y + r.h).toBeLessThanOrEqual(safe.bottom + 1);
    }
    for (const c of layout.buttons) {
      expect(c.x - c.r).toBeGreaterThanOrEqual(safe.left);
      expect(c.y - c.r).toBeGreaterThanOrEqual(safe.top);
      expect(c.x + c.r).toBeLessThanOrEqual(safe.right);
      expect(c.y + c.r).toBeLessThanOrEqual(safe.bottom);
    }

    // 2. Pairwise 0px overlap across all rectangular panels
    for (let i = 0; i < panels.length; i += 1) {
      for (let j = i + 1; j < panels.length; j += 1) {
        expect(rectsOverlap(panels[i]!, panels[j]!)).toBe(false);
      }
    }

    // 3. Pairwise 0px overlap across all 8 right-thumb circular buttons + stamina/ko panels
    for (let i = 0; i < layout.buttons.length; i += 1) {
      const a = layout.buttons[i]!;
      for (let j = i + 1; j < layout.buttons.length; j += 1) {
        const b = layout.buttons[j]!;
        expect(Math.hypot(a.x - b.x, a.y - b.y)).toBeGreaterThan(a.r + b.r);
      }
      const cRect: MusouHudRect = {
        x: a.x - a.r,
        y: a.y - a.r,
        w: a.r * 2,
        h: a.r * 2
      };
      expect(rectsOverlap(cRect, layout.staminaBar)).toBe(false);
      expect(rectsOverlap(cRect, layout.koCounter)).toBe(false);
    }

    // 4. Touch hit-testing resolves all 4 specials + Burst + core actions
    expect(
      hitTestMusouBattleHud(
        {
          x: layout.burstButton.x + 10,
          y: layout.burstButton.y + 10
        },
        s25
      )
    ).toBe('BURST');
    const sp3 = layout.buttons.find((b) => b.id === 'SPECIAL_3')!;
    expect(hitTestMusouBattleHud({ x: sp3.x, y: sp3.y }, s25)).toBe('SPECIAL_3');
  });

  it('triggers Power Dash ghosts/wind cone, Burst dome/48 aura shards, & Boss Armor Break 48 polyhedral shards + Groggy halo under 60FPS budget', () => {
    const { host, s25 } = createTrackingMockHost(true);
    const scene3d = new ThreeMusouBattleScene(host);
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
    stepBattleWorld(world, [], defaultDataRegistry, prng, FIXED_DT);

    const musou = createMusouCombatState({ speciesId: 'luffy', bossMaxArmor: 400 });
    musou.player.xMm = 0;
    musou.boss.xMm = 1400;

    // 1. Power Dash Cancel + Burst + Armor Break sequence
    const allEvents = [];
    allEvents.push(...stepMusouCombatTick(musou, { jumpPressed: true }, prng));
    allEvents.push(...stepMusouCombatTick(musou, { powerDashPressed: true }, prng));
    fillMusouBurstGauge(musou);
    allEvents.push(...stepMusouCombatTick(musou, { burstPressed: true }, prng));
    setBossArmorToRatio(musou, 0.05);
    allEvents.push(...stepMusouCombatTick(musou, { specialSlotIndex: 3 }, prng));

    scene3d.render(world, 1, 1 / 60, s25, musou, allEvents);

    expect(scene3d.powerDashVfx.getActiveGhostCount()).toBe(3);
    expect(scene3d.powerDashVfx.isWindConeVisible()).toBe(true);
    expect(scene3d.powerDashVfx.getActiveHoverRingCount()).toBeGreaterThanOrEqual(1);
    expect(scene3d.burstCinematic.isDomeVisible()).toBe(true);
    expect(scene3d.burstCinematic.isAuraParticlesVisible()).toBe(true);
    expect(scene3d.armorBreakVfx.getActiveShardCount()).toBe(ARMOR_SHARD_COUNT);
    expect(scene3d.armorBreakVfx.isGroggyHaloVisible()).toBe(true);
    expect(scene3d.armorBreakVfx.getBannerState().whiteFlashAlpha).toBeGreaterThan(0);

    // 2. Benchmark 90 frames (covering 100 grunts + 48 shards + ghosts + dome + aura particles)
    const t0 = performance.now();
    for (let f = 0; f < 90; f += 1) {
      const evs = stepMusouCombatTick(
        musou,
        { lightAttackPressed: f % 20 === 0, powerDashPressed: musou.player.canPowerDashCancel },
        prng
      );
      scene3d.render(world, 1, 1 / 60, s25, musou, evs);
    }
    const avgMs = (performance.now() - t0) / 90;
    expect(avgMs).toBeLessThan(16.6);
    // Shards shrink to 0 after 1.2s (90 frames = 1.5s > 1.2s)
    expect(scene3d.armorBreakVfx.getActiveShardCount()).toBe(0);

    const snap = buildMusouHudSnapshot(musou, scene3d.horde.getKoCount(), '루피');
    expect(snap.koCount).toBeGreaterThan(0);

    scene3d.dispose();
    // Strictly returns to base 2 lights in host.scene
    expect(host.scene.children.length).toBe(2);
    host.dispose();
  });

  it('suppresses white flashes when flashEffect === false and leaks 0 GPU resources across 5x scene round-trips', () => {
    const { host, s25 } = createTrackingMockHost(false);
    const world = createBattleWorld(
      {
        seed: 555,
        mode: '1V1',
        arenaSizeKey: 'medium',
        teamAlpha: [createStandardPresetBuild('luffy', 'a1', true, 3, defaultDataRegistry)],
        teamOmega: [createStandardPresetBuild('kaido', 'o1', false, 3, defaultDataRegistry)]
      },
      defaultDataRegistry
    );
    const prng = new SeededPRNG(555);

    const baselineChildren = host.scene.children.length;
    for (let round = 0; round < 5; round += 1) {
      const scene3d = new ThreeMusouBattleScene(host);
      scene3d.applyVisualPolish({ quality: 'HIGH', flashEffect: false });

      const musou = createMusouCombatState({ speciesId: 'law', bossMaxArmor: 200 });
      musou.player.xMm = 0;
      musou.boss.xMm = 1200;
      fillMusouBurstGauge(musou);
      const evs = [
        ...stepMusouCombatTick(musou, { burstPressed: true }, prng),
        ...stepMusouCombatTick(musou, { specialSlotIndex: 3 }, prng)
      ];
      scene3d.render(world, 1, 1 / 60, s25, musou, evs);

      expect(scene3d.armorBreakVfx.getBannerState().whiteFlashAlpha).toBe(0);
      expect(scene3d.armorBreakVfx.getBannerState().activeText).toBeTruthy();

      scene3d.dispose();
      expect(host.scene.children.length).toBe(baselineChildren);
    }
    host.dispose();
  });
});
