import fs from 'node:fs';
import path from 'node:path';
import { Texture } from 'pixi.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createBattleWorld } from '../../src/core/combat/battleWorld';
import { createStandardPresetBuild } from '../../src/core/net/terminalArenaRule';
import { createInitialCampaignState } from '../../src/core/rpg/campaignState';
import type { AudioManager } from '../../src/audio/audioManager';
import { defaultAssetManifestRegistry } from '../../src/data/assets/assetManifestRegistry';
import { defaultProAssetManifest } from '../../src/data/assets/proAssetManifest';
import { defaultWaveCombos, findWaveComboForPair } from '../../src/data/combosRegistry';
import { defaultDataRegistry } from '../../src/data/dataRegistry';
import { defaultRpgDataRegistry } from '../../src/data/rpgDataRegistry';
import type { CanvasRenderer } from '../../src/render/canvasRenderer';
import { DEFAULT_VISUAL_POLISH_CONFIG } from '../../src/render/backend/renderBackend';
import { PixiAssetBundleManager } from '../../src/render/pixi/PixiAssetBundleManager';
import { PixiStageHost } from '../../src/render/pixi/PixiStageHost';
import { ProAssetLoader } from '../../src/render/pixi/ProAssetLoader';
import { resolveBattleBundleName } from '../../src/render/pixi/pixiBundleHelpers';
import type {
  PixiAssetsDriver,
  PixiAssetsManifestPayload
} from '../../src/render/pixi/pixiBundleTypes';
import { BattleBanterOverlay } from '../../src/render/pixi/scenes/BattleBanterOverlay';
import { PixiBattleEffectsHelper } from '../../src/render/pixi/scenes/PixiBattleEffectsHelper';
import { PixiBattleVerticalSliceScene } from '../../src/render/pixi/scenes/PixiBattleVerticalSliceScene';
import { PixiParryAndGimmickFeedback } from '../../src/render/pixi/scenes/PixiParryAndGimmickFeedback';
import { computeResponsiveViewport } from '../../src/render/viewport/responsiveViewportManager';
import { renderCrewCampModal } from '../../src/scenes/modals/crewCampModal';

function createMockTexture(label: string): Texture {
  const tex = new Texture({ label });
  tex.source.scaleMode = 'linear';
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
          tex = createMockTexture(clean);
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

describe('Wave 1 Pro Art Promotion, Party/Boss Bundles & 2:2 Combo / Parry WebGL2', () => {
  const cleanups: Array<() => void> = [];

  afterEach(() => {
    vi.restoreAllMocks();
    while (cleanups.length > 0) cleanups.pop()?.();
  });

  it('keeps external NDS Wave 1 units IMPORTED with PPU normalization + torso pivots while morgan stays PLACEHOLDER', () => {
    const root = process.cwd();
    const expectedPpu: Record<string, { ppu: number; height: number }> = {
      luffy: { ppu: 1.0, height: 108 },
      zoro: { ppu: 1.05, height: 113 },
      sanji: { ppu: 1.05, height: 113 },
      nami: { ppu: 0.95, height: 103 },
      buggy: { ppu: 1.05, height: 113 },
      arlong: { ppu: 1.28, height: 138 }
    };

    for (const [uid, spec] of Object.entries(expectedPpu)) {
      const ent = defaultProAssetManifest.entries.find((e) => e.id === `sprite:${uid}_base`);
      expect(ent, `Missing manifest entry for ${uid}`).toBeDefined();
      expect(ent!.status === 'IMPORTED' || ent!.status === 'VERIFIED').toBe(true);
      expect(ent!.assetPath.endsWith('.webp')).toBe(true);
      expect(ent!.dimensions.width).toBeLessThanOrEqual(1024);
      expect(ent!.dimensions.height).toBeLessThanOrEqual(1024);

      const spriteSec = defaultProAssetManifest.sprites[`${uid}_base`];
      expect(spriteSec?.ppuScale).toBe(spec.ppu);
      expect(spriteSec?.targetDisplayHeight).toBe(spec.height);

      const atlasJson = JSON.parse(
        fs.readFileSync(path.join(root, 'public', spriteSec!.atlasJson), 'utf-8')
      ) as {
        meta: { referenceIdleHeight?: number; image?: string };
        frames: Record<string, { pivot?: { x: number; y: number } }>;
      };
      expect(atlasJson.meta.image?.endsWith('.webp')).toBe(true);
      expect(atlasJson.meta.referenceIdleHeight).toBeGreaterThan(24);
      const firstFrame = Object.values(atlasJson.frames)[0];
      expect(firstFrame?.pivot?.x).toBeGreaterThan(0);
      expect(firstFrame?.pivot?.y).toBeGreaterThan(0.5);
    }

    // Morgan remains transparent PLACEHOLDER (zero procedural baking)
    const morganSprite = defaultProAssetManifest.entries.find((e) => e.id === 'sprite:morgan_base');
    expect(morganSprite?.status).toBe('PLACEHOLDER');
    for (const emo of ['normal', 'angry', 'battle_cry']) {
      const mp = defaultProAssetManifest.entries.find((e) => e.id === `portrait:morgan_${emo}`);
      expect(mp?.status).toBe('PLACEHOLDER');
    }

    // Wave 1 boss 4-layer backdrops exist as WebP
    for (const bgId of ['battle_morgan', 'battle_buggy', 'battle_arlong']) {
      const bg = defaultProAssetManifest.backgrounds[bgId];
      expect(bg, `Missing backdrop ${bgId}`).toBeDefined();
      expect(bg!.layers.length).toBe(4);
      for (const layerPath of bg!.layers) {
        expect(layerPath.endsWith('.webp')).toBe(true);
      }
    }
  });

  it('recovers VRAM with 0 cumulative leak across 5x party swap ([luffy,zoro] <-> [sanji,nami]) & 3-boss cycles', async () => {
    const loader = new ProAssetLoader({
      loadImage: async () => null,
      loadJson: async () => null
    });
    const mock = createTrackingDriver();
    const manager = new PixiAssetBundleManager(loader, mock.driver);

    await manager.init(defaultProAssetManifest);
    await manager.loadCoreBundle(['luffy', 'zoro']);

    expect(manager.getActiveBundleNames()).toContain('party_zoro');
    expect(manager.getAssetRefCount('assets/pro/sprites/zoro_base.webp')).toBe(1);
    const baselineSnap = manager.getVramTelemetry();

    const cycle1Vram: number[] = [];
    const cycle5Vram: number[] = [];

    for (let cycle = 0; cycle < 5; cycle++) {
      await manager.syncActivePartyAssets(['sanji', 'nami']);
      expect(manager.getAssetRefCount('assets/pro/sprites/zoro_base.webp')).toBe(0);
      expect(manager.getAssetRefCount('assets/pro/sprites/sanji_base.webp')).toBe(1);
      expect(manager.getAssetRefCount('assets/pro/sprites/nami_base.webp')).toBe(1);

      for (const bossBundle of ['battle_morgan', 'battle_buggy', 'battle_arlong']) {
        const res = await manager.loadSceneBundles([bossBundle]);
        expect(res.committed).toBe(true);
        const vram = manager.getVramTelemetry().estimatedVramBytes;
        if (cycle === 0) cycle1Vram.push(vram);
        if (cycle === 4) cycle5Vram.push(vram);
      }

      await manager.loadSceneBundles([]);
      await manager.syncActivePartyAssets(['luffy', 'zoro']);
    }

    expect(cycle5Vram).toEqual(cycle1Vram);
    expect(manager.getVramTelemetry().totalLoadedUrls).toBe(baselineSnap.totalLoadedUrls);
    expect(manager.getVramTelemetry().estimatedVramBytes).toBe(baselineSnap.estimatedVramBytes);
    expect(mock.unloadedUrls).toContain('assets/pro/sprites/arlong_base.webp');
    expect(mock.unloadedUrls).toContain('assets/pro/sprites/buggy_base.webp');
    expect(mock.unloadedUrls).toContain('assets/pro/sprites/sanji_base.webp');

    // Verify CrewCampModal party toggle mutates activePartyUnitIds & invokes bundle sync callback
    const campaign = createInitialCampaignState(defaultRpgDataRegistry, defaultDataRegistry);
    campaign.recruitedUnitIds = ['luffy', 'zoro', 'sanji', 'nami'];
    campaign.activePartyUnitIds = ['luffy', 'zoro'];

    const listeners = new Map<string, () => void>();
    const toggleBtn = {
      dataset: { togglePartyUnit: 'sanji' },
      addEventListener: (ev: string, fn: () => void) => listeners.set(ev, fn)
    };
    const fakeModalEl = {
      innerHTML: '',
      classList: { add: vi.fn(), remove: vi.fn() },
      querySelector: () => null,
      querySelectorAll: (sel: string) => (sel === '[data-toggle-party-unit]' ? [toggleBtn] : [])
    } as unknown as HTMLElement;

    const onPartyChanged = vi.fn();
    renderCrewCampModal({
      campModalEl: fakeModalEl,
      campaign,
      rpgRegistry: defaultRpgDataRegistry,
      audio: { playSfx: vi.fn() } as unknown as AudioManager,
      triggerAutoSave: async () => {},
      refreshSideDrawer: vi.fn(),
      onPartyOrCrewChanged: onPartyChanged
    });
    expect(fakeModalEl.innerHTML).toContain('출전 파티 편성');
    listeners.get('click')?.();
    expect(campaign.activePartyUnitIds).toContain('sanji');
    expect(onPartyChanged).toHaveBeenCalledTimes(1);

    // Check resolveBattleBundleName routing for all 3 Wave 1 bosses
    const mkWorld = (bossId: 'morgan' | 'buggy' | 'arlong') =>
      createBattleWorld(
        {
          seed: 1,
          arenaSizeKey: 'medium',
          mode: '2V2',
          teamAlpha: [createStandardPresetBuild('luffy', 'a1', true, 0, defaultDataRegistry)],
          teamOmega: [createStandardPresetBuild(bossId, 'o1', false, 2, defaultDataRegistry)]
        },
        defaultDataRegistry
      );
    expect(resolveBattleBundleName(null, mkWorld('morgan'))).toBe('battle_morgan');
    expect(resolveBattleBundleName(null, mkWorld('buggy'))).toBe('battle_buggy');
    expect(resolveBattleBundleName(null, mkWorld('arlong'))).toBe('battle_arlong');

    manager.dispose();
  });

  it('renders all 3 Wave 1 2:2 dual-split combos on S25 Ultra (915x412) and suppresses white flash when flashEffectEnabled === false', () => {
    const s25 = computeResponsiveViewport(915, 412, 3, {
      top: 0,
      right: 36,
      bottom: 14,
      left: 44
    });

    const host = new PixiStageHost(
      new ProAssetLoader({ loadImage: async () => null, loadJson: async () => null })
    );
    for (const key of [
      'portrait_luffy_battle_cry',
      'portrait_zoro_battle_cry',
      'portrait_zoro_determined',
      'portrait_sanji_battle_cry',
      'portrait_nami_battle_cry'
    ]) {
      host.loader.registerExternalTexture(key, `assets/pro/portraits/${key}.webp`, createMockTexture(key));
    }

    const helper = new PixiBattleEffectsHelper(host);
    expect(defaultWaveCombos.length).toBe(7);
    expect(findWaveComboForPair('zoro', 'luffy')?.id).toBe('rubber_three_sword_cannon');
    expect(findWaveComboForPair('zoro', 'sanji')?.id).toBe('demon_flame_cross');
    expect(findWaveComboForPair('luffy', 'nami')?.id).toBe('thunder_gear_storm');

    for (const combo of defaultWaveCombos) {
      expect(combo.cutinFreezeTicks).toBe(39);
      const started = helper.triggerWaveCombo(combo.id, { x: 260, y: 280 }, { x: 640, y: 280 });
      expect(started).toBe(true);
      helper.updateCutinOverlay(0.28, s25, DEFAULT_VISUAL_POLISH_CONFIG, defaultDataRegistry);
      expect(helper.pixelCutin.isDualSplitActive).toBe(true);
      expect(helper.pixelCutin.activeComboId).toBe(combo.id);
      expect(helper.getCutinDynamicLights().length).toBeGreaterThanOrEqual(1);

      // Step past 39 ticks (0.65s) + assist window (0.72s)
      helper.updateCutinOverlay(0.5, s25, DEFAULT_VISUAL_POLISH_CONFIG, defaultDataRegistry);
      expect(helper.pixelCutin.isActive).toBe(false);
    }

    // Accessibility check on thunder_gear_storm: flashEffectEnabled === false blocks white flash
    helper.triggerWaveCombo('thunder_gear_storm', { x: 260, y: 280 }, { x: 640, y: 280 });
    helper.updateCutinOverlay(
      0.27,
      s25,
      { ...DEFAULT_VISUAL_POLISH_CONFIG, flashEffectEnabled: false },
      defaultDataRegistry
    );
    expect(helper.pixelCutin.wasWhiteFlashSuppressed).toBe(true);
    expect(helper.getCutinBloomBoost()).toBeLessThanOrEqual(0.25);

    helper.dispose();
    host.dispose();
  });

  it('triggers Boss Parry Shockwaves, Projectile Reflection Trails, Buggy Split Banter & Arlong WaterReflectionPipeline', () => {
    const prevDoc = (globalThis as { document?: unknown }).document;
    (globalThis as { document: unknown }).document = {
      createElement: () => ({
        width: 300,
        height: 150,
        style: { cssText: '' },
        getContext: () => null
      })
    };
    cleanups.push(() => {
      (globalThis as { document?: unknown }).document = prevDoc;
    });

    const s25 = computeResponsiveViewport(915, 412, 3, {
      top: 0,
      right: 36,
      bottom: 14,
      left: 44
    });

    const host = new PixiStageHost(
      new ProAssetLoader({ loadImage: async () => null, loadJson: async () => null })
    );
    vi.spyOn(host, 'isWebGLActive', 'get').mockReturnValue(true);

    const world = createBattleWorld(
      {
        seed: 77,
        arenaSizeKey: 'large',
        mode: '2V2',
        teamAlpha: [
          createStandardPresetBuild('luffy', 'a_luffy', true, 0, defaultDataRegistry),
          createStandardPresetBuild('zoro', 'a_zoro', false, 2, defaultDataRegistry)
        ],
        teamOmega: [createStandardPresetBuild('arlong', 'o_arlong', false, 2, defaultDataRegistry)],
        arenaTerrain: {
          waterZones: [{ x: 480, y: 270, radiusPx: 120 }]
        }
      },
      defaultDataRegistry
    );

    const feedback = new PixiParryAndGimmickFeedback();
    const banter = new BattleBanterOverlay(host);

    const luffy = world.units[0]!;
    const arlong = world.units[2]!;
    arlong.statuses.push({ kind: 'STAGGER', remainingSec: 1.4, totalSec: 1.4, sourceUnitId: luffy.instanceId });
    arlong.inWaterTerrain = true;
    world.slashImmuneMissCount = 1;
    world.vfxEvents.push(
      {
        id: 'vfx_jd_test',
        kind: 'JUST_DODGE_RING',
        pos: { x: luffy.pos.x, y: luffy.pos.y },
        color: '#38bdf8',
        radiusPx: 46,
        elapsedSec: 0,
        durationSec: 0.35
      },
      {
        id: 'vfx_deflect_test',
        kind: 'HIT_SPARK',
        pos: { x: luffy.pos.x + 30, y: luffy.pos.y },
        color: '#2dd4bf',
        radiusPx: 24,
        elapsedSec: 0,
        durationSec: 0.22
      }
    );
    world.projectiles.push({
      id: 'proj_reflected_1',
      moveId: 'move_arlong_shark_on_darts',
      ownerUnitId: luffy.instanceId,
      team: 'ALPHA',
      element: 'SEA',
      pos: { x: 400, y: 260 },
      prevPos: { x: 380, y: 260 },
      vel: { x: 260, y: 0 },
      radiusPx: 10,
      currentPower: 40,
      initialPower: 40,
      offensiveStat: 40,
      traitClashMult: 1,
      hasArmamentHaki: false,
      hasConquerorCoating: false,
      isInternalDestruction: false,
      elapsedSec: 0.1,
      maxDurationSec: 1.5,
      pattern: 'SINGLE',
      bypassGroundCollision: false,
      isInsideBeam: false,
      bouncedByRubberFloor: true,
      destroyed: false
    });

    const stepRes = feedback.step(world, 1 / 60, DEFAULT_VISUAL_POLISH_CONFIG);
    expect(stepRes.parryHitstopFrames).toBe(3);
    expect(stepRes.shockwavePoints.length).toBe(1);
    expect(stepRes.armamentTintUnitIds.has(luffy.instanceId)).toBe(true);
    expect(stepRes.staggeredUnitIds.has(arlong.instanceId)).toBe(true);
    expect(stepRes.reflectedProjectileIds.has('proj_reflected_1')).toBe(true);
    expect(stepRes.buggySplitActive).toBe(true);
    expect(stepRes.buggyBanterTriggerText).toContain('동강동강');

    banter.showBanter('buggy', stepRes.buggyBanterTriggerText!, 2.4);
    banter.update(0.05, s25);
    expect(banter.isVisible).toBe(true);

    // Battle scene with waterZones lazily creates WaterReflectionPipeline (2 RTs: DynamicLighting + WaterReflection) & disposes to 0
    const scene = new PixiBattleVerticalSliceScene(host);
    vi.spyOn(scene, 'preload').mockResolvedValue(undefined);
    const mockCanvasRenderer = {
      settings: { flashEffectEnabled: true, shakeIntensity: 0.8, showFps: true }
    } as unknown as CanvasRenderer;

    scene.render(
      world,
      defaultDataRegistry,
      defaultAssetManifestRegistry,
      0.5,
      mockCanvasRenderer.settings,
      'ALL',
      s25,
      DEFAULT_VISUAL_POLISH_CONFIG,
      1 / 60
    );
    expect(host.trackedRenderTextureCount).toBe(2);

    scene.dispose();
    feedback.dispose();
    banter.dispose();
    host.dispose();
    expect(host.trackedRenderTextureCount).toBe(0);
  });
});
