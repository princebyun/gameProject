import fs from 'node:fs';
import path from 'node:path';
import { Texture } from 'pixi.js';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { getImageMetadata, validateAtlasResolution } from '../../scripts/optimize-pro-assets.mjs';
import { createBattleWorld } from '../../src/core/combat/battleWorld';
import type {
  BattleWorldConfig,
  BattleWorldState,
  UnitBuildConfig
} from '../../src/core/types/battleState';
import type { StatBlock } from '../../src/core/types/dataSchemas';
import { defaultAssetManifestRegistry } from '../../src/data/assets/assetManifestRegistry';
import {
  defaultProAssetManifest,
  findProSpriteManifestStatus,
  PRO_FORM_KEY_ALIASES,
  resolveProSpriteManifestEntry,
  type ProAssetManifestFile,
  type ProManifestEntry,
  type ProSpriteManifestEntry
} from '../../src/data/assets/proAssetManifest';
import {
  defaultWaveCombos,
  findWaveComboForPair,
  getWaveComboById
} from '../../src/data/combosRegistry';
import { defaultDataRegistry } from '../../src/data/dataRegistry';
import {
  DEFAULT_VISUAL_POLISH_CONFIG,
  type VisualPolishConfig
} from '../../src/render/backend/renderBackend';
import type { RenderAccessibilitySettings } from '../../src/render/canvasRenderer';
import {
  MOBILE_VRAM_BUDGET_MB,
  PixiAssetBundleManager,
  resolveBattleBundleName
} from '../../src/render/pixi/PixiAssetBundleManager';
import { PixiStageHost } from '../../src/render/pixi/PixiStageHost';
import { ProAssetLoader } from '../../src/render/pixi/ProAssetLoader';
import { resolveBattleBackdropId } from '../../src/render/pixi/pixiBundleHelpers';
import type {
  PixiAssetsDriver,
  PixiAssetsManifestPayload
} from '../../src/render/pixi/pixiBundleTypes';
import { PixiBattleEffectsHelper } from '../../src/render/pixi/scenes/PixiBattleEffectsHelper';
import { PixiBattleVerticalSliceScene } from '../../src/render/pixi/scenes/PixiBattleVerticalSliceScene';
import { GiantBossShaderPipeline } from '../../src/render/pixi/shaders/GiantBossShaderPipeline';
import { getBossAuraProfile } from '../../src/render/pixi/shaders/giantBossAuraProfiles';
import { computeResponsiveViewport } from '../../src/render/viewport/responsiveViewportManager';

const ROOT_DIR = path.resolve(__dirname, '../..');

const DEFAULT_TEST_IVS: StatBlock = {
  hp: 31,
  atk: 31,
  def: 31,
  spAtk: 31,
  spDef: 31,
  spd: 31
};

const DEFAULT_TEST_EVS: StatBlock = {
  hp: 100,
  atk: 100,
  def: 80,
  spAtk: 100,
  spDef: 80,
  spd: 100
};

const S25_ULTRA_SAFE_INSETS = {
  top: 0,
  right: 24,
  bottom: 18,
  left: 36
} as const;

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

interface DriverOpLog {
  kind: 'LOAD_BUNDLE_START' | 'LOAD_BUNDLE_DONE' | 'UNLOAD_START' | 'UNLOAD_DONE';
  target: string;
  liveGiantCount: number;
}

function createTrackingAssetsDriver(giantUrls: ReadonlySet<string> = new Set()) {
  let manifest: PixiAssetsManifestPayload = { bundles: [] };
  const liveByUrl = new Map<string, Texture>();
  const opLog: DriverOpLog[] = [];
  const loadedBundles: string[] = [];
  const unloadedUrls: string[] = [];
  let maxSimultaneousGiantTextures = 0;

  const countLiveGiants = (): number => {
    let count = 0;
    for (const url of liveByUrl.keys()) {
      if (giantUrls.has(url)) count += 1;
    }
    return count;
  };

  const driver: PixiAssetsDriver = {
    reset: vi.fn(() => {
      liveByUrl.clear();
    }),
    init: vi.fn(async (opts) => {
      manifest = opts.manifest;
    }),
    loadBundle: vi.fn(async (bundleName, onProgress) => {
      opLog.push({
        kind: 'LOAD_BUNDLE_START',
        target: bundleName,
        liveGiantCount: countLiveGiants()
      });
      loadedBundles.push(bundleName);
      const b = manifest.bundles.find((x) => x.name === bundleName);
      const out: Record<string, Texture> = {};
      for (const a of b?.assets ?? []) {
        const clean = a.src.replace(/^\.\//, '');
        let tex = liveByUrl.get(clean);
        if (!tex) {
          const isGiant = giantUrls.has(clean);
          tex = createMockTexture(clean, isGiant ? 2048 : 512, isGiant ? 2048 : 512);
          liveByUrl.set(clean, tex);
        }
        const giantsNow = countLiveGiants();
        if (giantsNow > maxSimultaneousGiantTextures) {
          maxSimultaneousGiantTextures = giantsNow;
        }
        for (const al of a.alias) out[al] = tex;
        out[a.src] = tex;
      }
      onProgress?.(1);
      opLog.push({
        kind: 'LOAD_BUNDLE_DONE',
        target: bundleName,
        liveGiantCount: countLiveGiants()
      });
      return out;
    }),
    unload: vi.fn(async (urls) => {
      const arr = Array.isArray(urls) ? urls : [urls];
      for (const u of arr) {
        const clean = u.replace(/^\.\//, '');
        opLog.push({
          kind: 'UNLOAD_START',
          target: clean,
          liveGiantCount: countLiveGiants()
        });
        liveByUrl.delete(clean);
        unloadedUrls.push(clean);
        opLog.push({
          kind: 'UNLOAD_DONE',
          target: clean,
          liveGiantCount: countLiveGiants()
        });
      }
    })
  };

  return {
    driver,
    liveByUrl,
    opLog,
    loadedBundles,
    unloadedUrls,
    getMaxSimultaneousGiantTextures: () => maxSimultaneousGiantTextures
  };
}

function makeUnitBuild(
  instanceId: string,
  speciesId: string,
  isPlayerControlled: boolean
): UnitBuildConfig {
  const def = defaultDataRegistry.units[speciesId] ?? defaultDataRegistry.units['luffy'];
  if (!def) {
    throw new Error(`Missing unit definition for ${speciesId}`);
  }
  return {
    instanceId,
    speciesId: def.id,
    level: 50,
    ivs: { ...DEFAULT_TEST_IVS },
    evs: { ...DEFAULT_TEST_EVS },
    moveIds: [...def.defaultMoves],
    equipmentId: def.defaultEquipmentId,
    traitId: def.traitId,
    formId: def.defaultFormId,
    isPlayerControlled,
    aiLevel: isPlayerControlled ? 0 : 4
  };
}

function makeBattleWorldForUnits(
  alphaIds: readonly string[],
  omegaIds: readonly string[],
  mode: BattleWorldConfig['mode'] = '2V2'
): BattleWorldState {
  return createBattleWorld(
    {
      seed: 20261124,
      arenaSizeKey: 'medium',
      mode,
      teamAlpha: alphaIds.map((id, idx) => makeUnitBuild(`alpha_${idx}_${id}`, id, idx === 0)),
      teamOmega: omegaIds.map((id, idx) => makeUnitBuild(`omega_${idx}_${id}`, id, false))
    },
    defaultDataRegistry
  );
}

function createSimulatedWave3StressManifest(): {
  manifest: ProAssetManifestFile;
  giantUrls: Set<string>;
} {
  const giantSprites: Record<string, { bundle: string; unitId: string; dim: number }> = {
    'sprite:kaido_dragon': { bundle: 'battle_kaido', unitId: 'kaido', dim: 2048 },
    'sprite:saturn_yokai': { bundle: 'battle_saturn', unitId: 'saturn', dim: 2048 },
    'sprite:loki_giant': { bundle: 'battle_loki', unitId: 'loki', dim: 2048 },
    'sprite:kizaru_base': { bundle: 'battle_kizaru', unitId: 'kizaru', dim: 1024 },
    'sprite:katakuri_base': { bundle: 'battle_katakuri', unitId: 'katakuri', dim: 1024 },
    'sprite:law_base': { bundle: 'battle_law', unitId: 'law', dim: 1024 },
    'sprite:doflamingo_base': { bundle: 'battle_doflamingo', unitId: 'doflamingo', dim: 1024 }
  };

  const giantUrls = new Set<string>();
  const sprites: Record<string, ProSpriteManifestEntry> = { ...defaultProAssetManifest.sprites };
  const entries: ProManifestEntry[] = defaultProAssetManifest.entries.map((ent) => {
    const spec = giantSprites[ent.id];
    if (!spec) {
      // Simulate portraits on kaido/saturn/loki/katakuri as active boss bundle assets too
      if (
        ent.category === 'portrait' &&
        (ent.bundle === 'battle_kaido' ||
          ent.bundle === 'battle_saturn' ||
          ent.bundle === 'battle_loki' ||
          ent.bundle === 'battle_katakuri')
      ) {
        return {
          ...ent,
          status: 'IMPORTED',
          dimensions: { width: 128, height: 128 },
          estimatedVramBytes: 65536
        };
      }
      return { ...ent, dimensions: { ...ent.dimensions } };
    }

    const bytes = spec.dim * spec.dim * 4;
    if (spec.dim >= 2048) {
      giantUrls.add(ent.assetPath);
    }
    const existingSpKey = ent.id.replace(/^sprite:/, '');
    if (sprites[existingSpKey]) {
      sprites[existingSpKey] = {
        ...sprites[existingSpKey],
        image: ent.assetPath,
        atlasJson: ''
      };
    }
    return {
      ...ent,
      status: 'IMPORTED',
      bundle: spec.bundle,
      unitId: spec.unitId,
      isGiant: spec.dim >= 2048,
      dimensions: { width: spec.dim, height: spec.dim },
      estimatedVramBytes: bytes
    };
  });

  return {
    manifest: {
      ...defaultProAssetManifest,
      entries,
      sprites
    },
    giantUrls
  };
}

describe('Wave 3 Straw Hat Roster, Giant Boss Shader Pipeline & Single Active Boss VRAM Lock', () => {
  const disposables: Array<{ dispose: () => void }> = [];

  afterEach(() => {
    while (disposables.length > 0) {
      const item = disposables.pop();
      item?.dispose();
    }
  });

  it('calibrates remaining 6 Straw Hats PPU and keeps 3 giant crew forms isolated to party_* bundles', async () => {
    const expectedCrewPpu: ReadonlyArray<readonly [string, number]> = [
      ['usopp', 0.98],
      ['chopper', 0.68],
      ['robin', 1.06],
      ['franky', 1.26],
      ['brook', 1.22],
      ['jinbe', 1.3]
    ];

    for (const [unitId, ppu] of expectedCrewPpu) {
      const sp = defaultProAssetManifest.sprites[`${unitId}_base`];
      const ent = defaultProAssetManifest.entries.find((e) => e.id === `sprite:${unitId}_base`);
      expect(sp).toBeDefined();
      expect(sp?.ppuScale).toBe(ppu);
      expect(ent?.status).not.toBe('PLACEHOLDER');
      expect(ent?.tier).toBe('tier1_crew');
      expect(ent?.bundle).toBe(`party_${unitId}`);
      expect(ent?.assetPath.endsWith('.webp')).toBe(true);
      expect(ent?.dimensions.width).toBeLessThanOrEqual(1024);
      expect(ent?.dimensions.height).toBeLessThanOrEqual(1024);
      const absWebp = path.join(ROOT_DIR, 'public', ent!.assetPath);
      expect(fs.existsSync(absWebp)).toBe(true);
    }

    const giantFormCases: ReadonlyArray<{
      proKey: string;
      unitId: string;
      engineFormId: string;
      bundle: string;
    }> = [
      {
        proKey: 'chopper_monster_point',
        unitId: 'chopper',
        engineFormId: 'form_chopper_monster',
        bundle: 'party_chopper'
      },
      {
        proKey: 'robin_demonio_fleur',
        unitId: 'robin',
        engineFormId: 'form_robin_demonio',
        bundle: 'party_robin'
      },
      {
        proKey: 'franky_general',
        unitId: 'franky',
        engineFormId: 'form_franky_shogun',
        bundle: 'party_franky'
      }
    ];

    for (const gf of giantFormCases) {
      expect(PRO_FORM_KEY_ALIASES[`${gf.unitId}_${gf.engineFormId}`]).toBe(gf.proKey);
      const ent = defaultProAssetManifest.entries.find((e) => e.id === `sprite:${gf.proKey}`);
      expect(ent?.status).toBe('PLACEHOLDER');
      expect(ent?.isGiant).toBe(true);
      expect(ent?.bundle).toBe(gf.bundle);
      expect(ent?.bundle).not.toBe('core_always');

      const fallbackSprite = resolveProSpriteManifestEntry(
        gf.unitId,
        gf.engineFormId,
        defaultProAssetManifest
      );
      expect(fallbackSprite?.key).toBe(`${gf.unitId}_base`);

      const simulatedImportedSprites: Record<string, ProSpriteManifestEntry> = {
        ...defaultProAssetManifest.sprites,
        [gf.proKey]: {
          key: gf.proKey,
          unitId: gf.unitId,
          formId: gf.proKey.replace(`${gf.unitId}_`, ''),
          image: `assets/pro/sprites/${gf.proKey}.webp`,
          atlasJson: `assets/pro/sprites/${gf.proKey}.json`,
          anchor: { x: 0.5, y: 0.92 },
          targetDisplayHeight: 190
        }
      };
      const resolvedImported = resolveProSpriteManifestEntry(gf.unitId, gf.engineFormId, {
        ...defaultProAssetManifest,
        sprites: simulatedImportedSprites
      });
      expect(resolvedImported?.key).toBe(gf.proKey);

      const statusEnt = findProSpriteManifestStatus(
        gf.unitId,
        gf.engineFormId,
        defaultProAssetManifest
      );
      expect(statusEnt?.id).toBe(`sprite:${gf.proKey}`);
    }

    const coreBundleEnts = defaultProAssetManifest.entries.filter((e) => e.bundle === 'core_always');
    expect(coreBundleEnts.some((e) => e.id === 'sprite:chopper_monster_point')).toBe(false);
    expect(coreBundleEnts.some((e) => e.id === 'sprite:robin_demonio_fleur')).toBe(false);
    expect(coreBundleEnts.some((e) => e.id === 'sprite:franky_general')).toBe(false);

    // Dynamic party bundle load/release for the calibrated 6 Straw Hats
    const loader = new ProAssetLoader();
    const tracking = createTrackingAssetsDriver();
    const mgr = new PixiAssetBundleManager(loader, tracking.driver);
    disposables.push(mgr, loader);

    await mgr.loadCoreBundle(['luffy']);
    expect(mgr.getActiveBundleNames()).not.toContain('party_chopper');

    await mgr.syncActivePartyAssets(['usopp', 'chopper', 'robin', 'franky']);
    const active = mgr.getActiveBundleNames();
    expect(active).toContain('party_usopp');
    expect(active).toContain('party_chopper');
    expect(active).toContain('party_robin');
    expect(active).toContain('party_franky');
    expect(active).not.toContain('party_brook');

    await mgr.syncActivePartyAssets(['brook', 'jinbe']);
    const swapped = mgr.getActiveBundleNames();
    expect(swapped).toContain('party_brook');
    expect(swapped).toContain('party_jinbe');
    expect(swapped).not.toContain('party_chopper');
  });

  it('drives all 4 new Wave 3 2:2 combos cleanly at 39 ticks on Galaxy S25 Ultra (915x412)', () => {
    expect(defaultWaveCombos.length).toBe(7);

    const wave3Pairs: ReadonlyArray<readonly [string, string, string]> = [
      ['usopp', 'franky', 'sniper_radical_barrage'],
      ['chopper', 'robin', 'giant_petal_crush'],
      ['brook', 'jinbe', 'freezing_ocean_current'],
      ['luffy', 'law', 'shambles_red_hawk']
    ];

    for (const [a, b, comboId] of wave3Pairs) {
      expect(findWaveComboForPair(a, b)?.id).toBe(comboId);
      expect(findWaveComboForPair(b, a)?.id).toBe(comboId);
      const combo = getWaveComboById(comboId);
      expect(combo?.cutinFreezeTicks).toBe(39);
    }

    const loader = new ProAssetLoader();
    const tracking = createTrackingAssetsDriver();
    const mgr = new PixiAssetBundleManager(loader, tracking.driver);
    const host = new PixiStageHost(loader, mgr);
    const helper = new PixiBattleEffectsHelper(host);
    disposables.push(helper, host);

    // Seed loaded partner atlases & portraits synchronously into loader cache so assist choreography binds real sprite paths
    for (const unitId of ['luffy', 'usopp', 'chopper', 'robin', 'franky', 'brook', 'jinbe', 'law']) {
      loader.registerExternalTexture(
        `portrait_${unitId}_battle_cry`,
        `assets/pro/portraits/${unitId}_battle_cry.webp`,
        createMockTexture(`${unitId}_portrait`, 128, 128)
      );
      loader.registerExternalTexture(
        `sprite_base_${unitId}_base`,
        `assets/pro/sprites/${unitId}_base.webp`,
        createMockTexture(`${unitId}_sheet`, 512, 128)
      );
    }

    const s25Viewport = computeResponsiveViewport(915, 412, 3, { ...S25_ULTRA_SAFE_INSETS });
    expect(s25Viewport.viewHeight).toBe(540);
    expect(s25Viewport.viewWidth).toBeGreaterThanOrEqual(1170);

    const calmPolish: VisualPolishConfig = {
      ...DEFAULT_VISUAL_POLISH_CONFIG,
      flashEffectEnabled: false
    };

    for (const [, , comboId] of wave3Pairs) {
      const combo = getWaveComboById(comboId)!;
      const triggered = helper.triggerWaveCombo(comboId, { x: 260, y: 270 }, { x: 700, y: 270 });
      expect(triggered).toBe(true);
      expect(helper.pixelCutin.isDualSplitActive).toBe(true);
      expect(helper.pixelCutin.activeComboId).toBe(comboId);

      // Step into progress ~0.43 where flash check executes
      helper.updateCutinOverlay(0.28, s25Viewport, calmPolish, defaultDataRegistry, {
        x: s25Viewport.arenaOffsetX,
        y: 0
      });
      expect(helper.pixelCutin.wasWhiteFlashSuppressed).toBe(combo.hasWhiteFlash);
      const calmBloom = helper.getCutinBloomBoost();
      expect(helper.getCutinDynamicLights().length).toBeGreaterThan(0);

      helper.triggerWaveCombo(comboId, { x: 260, y: 270 }, { x: 700, y: 270 });
      helper.updateCutinOverlay(0.28, s25Viewport, DEFAULT_VISUAL_POLISH_CONFIG, defaultDataRegistry, {
        x: s25Viewport.arenaOffsetX,
        y: 0
      });
      expect(helper.pixelCutin.wasWhiteFlashSuppressed).toBe(false);
      expect(helper.getCutinBloomBoost()).toBeGreaterThan(calmBloom);

      // Flush remaining ticks so overlay resets cleanly
      helper.updateCutinOverlay(0.6, s25Viewport, DEFAULT_VISUAL_POLISH_CONFIG, defaultDataRegistry);
      expect(helper.pixelCutin.isActive).toBe(false);
    }
  });

  it('validates all 8 Wave 3 Core/Giant Bosses, canonical battle backdrops, and 2048px atlas guardrail', async () => {
    const bossExpectations: ReadonlyArray<{
      key: string;
      bundle: string;
      backdropId: string;
      isGiant: boolean;
      imported: boolean;
    }> = [
      { key: 'law_base', bundle: 'battle_law', backdropId: 'dressrosa_colosseum', isGiant: false, imported: true },
      { key: 'lucci_base', bundle: 'battle_lucci', backdropId: 'water7_dock', isGiant: false, imported: true },
      { key: 'lucci_awakened', bundle: 'battle_lucci', backdropId: 'water7_dock', isGiant: false, imported: false },
      { key: 'kizaru_base', bundle: 'battle_kizaru', backdropId: 'marineford_ice_bay', isGiant: false, imported: true },
      { key: 'doflamingo_base', bundle: 'battle_doflamingo', backdropId: 'dressrosa_colosseum', isGiant: false, imported: true },
      { key: 'katakuri_base', bundle: 'battle_katakuri', backdropId: 'whole_cake_mirror', isGiant: false, imported: false },
      { key: 'kaido_base', bundle: 'battle_kaido', backdropId: 'onigashima_rooftop', isGiant: false, imported: false },
      { key: 'kaido_dragon', bundle: 'battle_kaido', backdropId: 'onigashima_rooftop', isGiant: true, imported: false },
      { key: 'saturn_base', bundle: 'battle_saturn', backdropId: 'egghead_lab', isGiant: true, imported: false },
      { key: 'saturn_yokai', bundle: 'battle_saturn', backdropId: 'egghead_lab', isGiant: true, imported: false },
      { key: 'loki_base', bundle: 'battle_loki', backdropId: 'elbaf_underworld', isGiant: true, imported: false },
      { key: 'loki_giant', bundle: 'battle_loki', backdropId: 'elbaf_underworld', isGiant: true, imported: false }
    ];

    for (const b of bossExpectations) {
      const ent = defaultProAssetManifest.entries.find((e) => e.id === `sprite:${b.key}`);
      expect(ent).toBeDefined();
      expect(ent?.tier).toBe('tier2_boss');
      expect(ent?.bundle).toBe(b.bundle);
      expect(Boolean(ent?.isGiant)).toBe(b.isGiant);
      expect(resolveBattleBackdropId(b.bundle, defaultProAssetManifest)).toBe(b.backdropId);

      if (b.imported) {
        expect(ent?.status).not.toBe('PLACEHOLDER');
        expect(ent?.assetPath.endsWith('.webp')).toBe(true);
        const absFile = path.join(ROOT_DIR, 'public', ent!.assetPath);
        const dims = await getImageMetadata(absFile);
        expect(dims.format).toBe('webp');
        expect(dims.width).toBeLessThanOrEqual(1024);
        expect(dims.height).toBeLessThanOrEqual(1024);
        expect(() =>
          validateAtlasResolution({ id: ent!.id, category: 'sprite', isGiant: false }, dims)
        ).not.toThrow();
      } else {
        // Unacquired external sheets remain transparent PLACEHOLDER without procedural baking
        expect(ent?.status).toBe('PLACEHOLDER');
        const absWebp = path.join(ROOT_DIR, 'public', ent!.assetPath);
        expect(fs.existsSync(absWebp)).toBe(false);
      }

      const auraProf = getBossAuraProfile(b.key.split('_')[0] ?? b.key);
      expect(auraProf).not.toBeNull();
    }

    // 2048px guardrail tests
    expect(() =>
      validateAtlasResolution(
        { id: 'sprite:kaido_dragon', category: 'sprite', isGiant: true },
        { width: 2048, height: 2048 }
      )
    ).not.toThrow();
    expect(() =>
      validateAtlasResolution(
        { id: 'sprite:kaido_dragon', category: 'sprite', isGiant: true },
        { width: 2049, height: 2048 }
      )
    ).toThrow(/2048/);
    expect(() =>
      validateAtlasResolution(
        { id: 'sprite:kaido_base', category: 'sprite', isGiant: false },
        { width: 1024, height: 1024 }
      )
    ).not.toThrow();
    expect(() =>
      validateAtlasResolution(
        { id: 'sprite:kaido_base', category: 'sprite', isGiant: false },
        { width: 1536, height: 1024 }
      )
    ).toThrow(/1024/);
  });

  it('drives GiantBossShaderPipeline camera zoom-out, telegraphs, boss shaders, ground cracks, and Phase-2 cut-in cleanly', async () => {
    const prevDoc = (globalThis as { document?: unknown }).document;
    (globalThis as { document: unknown }).document = {
      createElement: () => ({
        width: 300,
        height: 150,
        style: { cssText: '' },
        getContext: () => null
      })
    };
    disposables.push({
      dispose: () => {
        (globalThis as { document?: unknown }).document = prevDoc;
      }
    });

    const loader = new ProAssetLoader();
    const tracking = createTrackingAssetsDriver();
    const mgr = new PixiAssetBundleManager(loader, tracking.driver);
    const host = new PixiStageHost(loader, mgr);
    const scene = new PixiBattleVerticalSliceScene(host);
    disposables.push(scene, host);

    await mgr.loadCoreBundle(['luffy']);
    await scene.preload('battle_kaido');

    const s25Viewport = computeResponsiveViewport(915, 412, 3, { ...S25_ULTRA_SAFE_INSETS });
    const settings: RenderAccessibilitySettings = {
      flashEffectEnabled: true,
      shakeIntensity: 0.8,
      showFps: true
    };

    // 1) Normal-scale fight keeps camera zoom at 1.0 and headroom 0
    const normalWorld = makeBattleWorldForUnits(['luffy', 'usopp'], ['law', 'lucci'], '2V2');
    for (let i = 0; i < 6; i++) {
      scene.render(
        normalWorld,
        defaultDataRegistry,
        defaultAssetManifestRegistry,
        1,
        settings,
        'ALL',
        s25Viewport,
        DEFAULT_VISUAL_POLISH_CONFIG,
        1 / 60
      );
    }
    expect(scene.currentCameraZoom).toBe(1.0);
    expect(scene.bossPipeline.headroomOffsetY).toBe(0);

    // 2) Giant Boss (Saturn entityScale >= 1.5) smoothly zooms out into [0.78, 0.85] with top headroom
    const giantWorld = makeBattleWorldForUnits(['luffy', 'jinbe'], ['saturn'], '1V1');
    const saturn = giantWorld.units.find((u) => u.speciesId === 'saturn');
    expect(saturn).toBeDefined();
    expect(saturn!.entityScale).toBeGreaterThanOrEqual(1.5);

    saturn!.bossPhase2Triggered = true;
    saturn!.windupMoveId = 'saturn_glare_wave';

    for (let i = 0; i < 20; i++) {
      scene.render(
        giantWorld,
        defaultDataRegistry,
        defaultAssetManifestRegistry,
        1,
        settings,
        'ALL',
        s25Viewport,
        DEFAULT_VISUAL_POLISH_CONFIG,
        0.05
      );
      if (i === 0) {
        expect(scene.effectsHelper.pixelCutin.isBossPhaseCutinActive).toBe(true);
        expect(scene.effectsHelper.pixelCutin.lastBossCutinUnitId).toBe('saturn');
      }
    }
    expect(scene.currentCameraZoom).toBeGreaterThanOrEqual(0.78);
    expect(scene.currentCameraZoom).toBeLessThanOrEqual(0.85);
    expect(scene.bossPipeline.headroomOffsetY).toBeGreaterThan(0);
    expect(scene.effectsHelper.pixelCutin.isBossPhaseCutinActive).toBe(false);
    expect(scene.effectsHelper.pixelCutin.lastBossCutinUnitId).toBe('saturn');

    // 3) Direct GiantBossShaderPipeline checks: all 4 telegraph shapes + Katakuri chromatic foresight + Law ROOM + Loki crack decals
    const pipeline = new GiantBossShaderPipeline();
    disposables.push(pipeline);

    const mixedWorld = makeBattleWorldForUnits(['luffy', 'law'], ['katakuri', 'loki'], '2V2');
    const katakuri = mixedWorld.units.find((u) => u.speciesId === 'katakuri');
    const loki = mixedWorld.units.find((u) => u.speciesId === 'loki');
    const lawUnit = mixedWorld.units.find((u) => u.speciesId === 'law');
    expect(katakuri && loki && lawUnit).toBeTruthy();

    katakuri!.foresightFocus = 80;
    katakuri!.foresightBreakTimer = 0;
    loki!.windupMoveId = 'loki_ragnir_slam';

    mixedWorld.fieldZones.push({
      id: 'zone_law_room',
      moveId: 'law_room',
      ownerUnitId: lawUnit!.instanceId,
      team: 'ALPHA',
      element: 'SPECIAL',
      fieldKind: 'DOME_SHIELD',
      pos: { x: 480, y: 270 },
      radiusPx: 140,
      remainingSec: 5,
      totalSec: 6,
      tickTimer: 0,
      basePower: 40,
      offensiveStat: 120,
      domeHp: 200,
      maxDomeHp: 200
    });
    mixedWorld.raidState.active = true;
    mixedWorld.raidState.bossUnitId = loki!.instanceId;
    mixedWorld.raidState.bossName = loki!.name;
    mixedWorld.raidState.dpsCheck.active = true;
    mixedWorld.raidState.telegraphs = [
      {
        id: 't_safe',
        patternId: 'p1',
        name: 'SafeZone',
        shape: 'SAFE_ZONE',
        origin: { x: 240, y: 270 },
        dir: { x: 1, y: 0 },
        radiusPx: 80,
        arcDeg: 360,
        widthPx: 0,
        elapsedSec: 1,
        durationSec: 2,
        damageMultiplier: 1.5,
        ownerUnitId: loki!.instanceId
      },
      {
        id: 't_circle',
        patternId: 'p2',
        name: 'Circle',
        shape: 'CIRCLE',
        origin: { x: 520, y: 260 },
        dir: { x: 1, y: 0 },
        radiusPx: 95,
        arcDeg: 360,
        widthPx: 0,
        elapsedSec: 0.8,
        durationSec: 2,
        damageMultiplier: 1.4,
        ownerUnitId: loki!.instanceId
      },
      {
        id: 't_cone',
        patternId: 'p3',
        name: 'BoroCone',
        shape: 'CONE',
        origin: { x: 640, y: 240 },
        dir: { x: -1, y: 0 },
        radiusPx: 220,
        arcDeg: 55,
        widthPx: 0,
        elapsedSec: 0.6,
        durationSec: 1.8,
        damageMultiplier: 1.6,
        ownerUnitId: loki!.instanceId
      },
      {
        id: 't_cross',
        patternId: 'p4',
        name: 'CrossBeam',
        shape: 'CROSS_BEAM',
        origin: { x: 480, y: 270 },
        dir: { x: 1, y: 0 },
        radiusPx: 0,
        arcDeg: 0,
        widthPx: 54,
        elapsedSec: 1.1,
        durationSec: 2,
        damageMultiplier: 1.8,
        ownerUnitId: loki!.instanceId
      }
    ];
    mixedWorld.birdcage.active = true;
    mixedWorld.birdcage.shrinkScale = 0.72;
    mixedWorld.impelDownHazard.pendingTrapPos = { x: 400, y: 310 };
    mixedWorld.impelDownHazard.pendingTrapTelegraphTimer = 0.8;

    const highStep = pipeline.step(
      mixedWorld,
      { x: s25Viewport.arenaOffsetX, y: 0 },
      s25Viewport,
      DEFAULT_VISUAL_POLISH_CONFIG,
      1 / 60
    );
    expect(pipeline.chromaticFilter.enabled).toBe(true);
    expect(highStep.bloomBoost).toBeGreaterThan(0);
    expect(highStep.lights.length).toBeGreaterThan(0);
    expect(highStep.phaseCutin?.unitId).toBe('loki');
    expect(pipeline.activeGroundCrackCount).toBe(1);

    // Accessibility calm mode suppresses chromatic aberration pulse while keeping telegraphs crisp
    pipeline.step(
      mixedWorld,
      { x: s25Viewport.arenaOffsetX, y: 0 },
      s25Viewport,
      { ...DEFAULT_VISUAL_POLISH_CONFIG, flashEffectEnabled: false },
      1 / 60
    );
    expect(pipeline.chromaticFilter.enabled).toBe(false);

    // Ground crack decals expire cleanly after 4.5s
    loki!.windupMoveId = null;
    for (let s = 0; s < 100; s++) {
      pipeline.step(
        mixedWorld,
        { x: s25Viewport.arenaOffsetX, y: 0 },
        s25Viewport,
        DEFAULT_VISUAL_POLISH_CONFIG,
        0.05
      );
    }
    expect(pipeline.activeGroundCrackCount).toBe(0);

    scene.dispose();
    pipeline.dispose();
    host.dispose();
    expect(host.trackedRenderTextureCount).toBe(0);
  });

  it('enforces Single Active Battle Bundle VRAM Lock across 5x giant boss rotation without simultaneous 2048px overlap', async () => {
    const { manifest, giantUrls } = createSimulatedWave3StressManifest();
    const loader = new ProAssetLoader();
    const tracking = createTrackingAssetsDriver(giantUrls);
    const mgr = new PixiAssetBundleManager(loader, tracking.driver);
    disposables.push(mgr, loader);

    await mgr.init(manifest);
    await mgr.loadCoreBundle(['luffy', 'zoro']);
    const baselineTelemetry = mgr.getVramTelemetry();
    const baselineBytes = baselineTelemetry.estimatedVramBytes;

    // Verify battle_doflamingo -> battle_law shares Dressrosa backdrop URLs cleanly without re-downloading them mid-lock
    await mgr.loadSceneBundles([resolveBattleBundleName(null, makeBattleWorldForUnits(['luffy'], ['doflamingo'], '1V1'))]);
    const sharedDressrosaLayer0 = 'assets/pro/backgrounds/dressrosa_colosseum_layer0.webp';
    expect(mgr.getAssetRefCount(sharedDressrosaLayer0)).toBe(1);
    tracking.unloadedUrls.length = 0;

    await mgr.loadSceneBundles(['battle_law']);
    expect(tracking.unloadedUrls).toContain('assets/pro/sprites/doflamingo_base.webp');
    expect(tracking.unloadedUrls).not.toContain(sharedDressrosaLayer0);
    expect(mgr.getAssetRefCount(sharedDressrosaLayer0)).toBe(1);

    // Clear back to baseline before running the strict 5x giant-boss stress loop
    await mgr.loadSceneBundles([]);
    expect(mgr.getVramTelemetry().estimatedVramBytes).toBe(baselineBytes);

    const rotation = [
      'battle_kaido',
      'battle_saturn',
      'battle_loki',
      'battle_kizaru',
      'battle_katakuri'
    ] as const;

    tracking.opLog.length = 0;
    const prevLockReleases = mgr.getVramTelemetry().singleBattleLockReleases;

    for (let cycle = 0; cycle < 5; cycle++) {
      for (const battleBundle of rotation) {
        const res = await mgr.loadSceneBundles([battleBundle]);
        expect(res.committed).toBe(true);
        expect(res.activeBundles.filter((b) => b.startsWith('battle_'))).toEqual([battleBundle]);
        expect(tracking.getMaxSimultaneousGiantTextures()).toBeLessThanOrEqual(1);
      }
    }

    // Verify chronological invariant: every previous battle sprite unload happens strictly BEFORE next battle loadBundle starts
    for (let i = 1; i < tracking.opLog.length; i++) {
      const entry = tracking.opLog[i];
      if (!entry) continue;
      expect(entry.liveGiantCount).toBeLessThanOrEqual(1);
      if (entry.kind === 'LOAD_BUNDLE_START' && i > 1) {
        // Any giant URL must have 0 giant textures live when a new boss bundle starts loading
        expect(entry.liveGiantCount).toBe(0);
      }
    }

    const stressTelemetry = mgr.getVramTelemetry();
    const cycleLockReleases = stressTelemetry.singleBattleLockReleases - prevLockReleases;
    // First load into empty battle slot = 0, next 24 transitions = 24 single-battle pre-releases
    expect(cycleLockReleases).toBe(24);
    expect(cycleLockReleases).toBeGreaterThanOrEqual(20);
    expect(stressTelemetry.peakEstimatedVramMb).toBeLessThan(MOBILE_VRAM_BUDGET_MB);
    expect(stressTelemetry.overBudget).toBe(false);

    // Full exit cleanup back to base core VRAM
    await mgr.loadSceneBundles([]);
    const finalTelemetry = mgr.getVramTelemetry();
    expect(finalTelemetry.activeBundles.some((b) => b.bundle.startsWith('battle_'))).toBe(false);
    expect(finalTelemetry.estimatedVramBytes).toBe(baselineBytes);
    expect(
      Array.from(tracking.liveByUrl.keys()).some((url) => giantUrls.has(url))
    ).toBe(false);
  });
});
