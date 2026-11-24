import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import {
  computeMusouStateHash,
  createMusouCombatState,
  fillMusouBurstGauge,
  stepMusouCombatTick
} from '../../src/core/battle/musou/MusouCombatEngine';
import { applyHordeKoToBurst } from '../../src/core/battle/musou/BurstAndSpecialSystem';
import { createBattleWorld } from '../../src/core/combat/battleWorld';
import { FIXED_DT } from '../../src/core/constants';
import { SeededPRNG } from '../../src/core/math/prng';
import { createStandardPresetBuild } from '../../src/core/net/terminalArenaRule';
import { defaultDataRegistry } from '../../src/data/dataRegistry';
import { getStoryChapterById } from '../../src/data/story/storyChaptersRegistry';
import type { StoryCameraShot3D } from '../../src/data/story/types';
import { MusouCameraController } from '../../src/render/three/MusouCameraController';
import { ThreeMusouBattleScene } from '../../src/render/three/ThreeMusouBattleScene';
import {
  ThreeStageHost,
  type ThreeComposerLike,
  type ThreeRendererLike
} from '../../src/render/three/ThreeStageHost';
import {
  computeBanterBannerRect,
  MusouPhaseBanterController
} from '../../src/render/three/story/MusouPhaseBanterController';
import {
  computeCutsceneOverlayLayout,
  ThreeCutsceneDirector,
  type CutsceneBattleStartRequest
} from '../../src/render/three/story/ThreeCutsceneDirector';
import {
  computeResponsiveViewport,
  DEFAULT_VIEWPORT_METRICS
} from '../../src/render/viewport/responsiveViewportManager';
import { getSafeHudBounds } from '../../src/render/viewport/safeAreaLayout';
import { computeMusouHudLayout } from '../../src/ui/MusouBattleHUD';

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
      render: { calls: 18, triangles: 28000 },
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
  return { host, s25, rendererDisposed, composerDisposed };
}

function rectsOverlap(
  a: { x: number; y: number; w: number; h: number },
  b: { x: number; y: number; w: number; h: number }
): boolean {
  return (
    a.x < b.x + b.w &&
    a.x + a.w > b.x &&
    a.y < b.y + b.h &&
    a.y + a.h > b.y
  );
}

describe('Step 3 E2E: ThreeCutsceneDirector, MusouPhaseBanterController & S25 Ultra Safety', () => {
  it('plays all 5 landmark chapters (Ch.01, Ch.05, Ch.10, Ch.16, Ch.18) intro -> preBattle -> start_musou_battle -> epilogue', () => {
    const landmarkIds = [
      'ch01_foosha',
      'ch05_arlong_park',
      'ch10_water_seven',
      'ch16_wano_country',
      'ch18_elbaf'
    ];

    const scene = new THREE.Scene();
    const director = new ThreeCutsceneDirector(scene);

    for (const chId of landmarkIds) {
      const ch = getStoryChapterById(chId)!;
      expect(ch).toBeDefined();

      let introCompleted = false;
      director.startChapterPhase(ch, 'intro', {
        forceGreybox: true,
        callbacks: {
          onPhaseComplete: (id, phase) => {
            if (id === chId && phase === 'intro') introCompleted = true;
          }
        }
      });
      expect(director.isActive()).toBe(true);

      let guardSteps = 0;
      while (director.isActive() && guardSteps < 40) {
        director.update(0.05);
        director.advance();
        guardSteps += 1;
      }
      expect(introCompleted).toBe(true);
      expect(director.isActive()).toBe(false);

      let battleReq: CutsceneBattleStartRequest | null = null;
      director.startChapterPhase(ch, 'preBattle', {
        forceGreybox: true,
        callbacks: {
          onStartBattle: (req) => {
            battleReq = req;
          }
        }
      });
      guardSteps = 0;
      while (director.isActive() && guardSteps < 40) {
        director.update(0.05);
        director.advance();
        guardSteps += 1;
      }
      expect(battleReq).not.toBeNull();
      expect(battleReq!.bossUnitId.length).toBeGreaterThan(0);
      expect(battleReq!.hordeCount).toBeGreaterThan(0);

      let epilogueCompleted = false;
      director.startChapterPhase(ch, 'epilogue', {
        forceGreybox: true,
        callbacks: {
          onPhaseComplete: (id, phase) => {
            if (id === chId && phase === 'epilogue') epilogueCompleted = true;
          }
        }
      });
      guardSteps = 0;
      while (director.isActive() && guardSteps < 40) {
        director.update(0.05);
        director.advance();
        guardSteps += 1;
      }
      expect(epilogueCompleted).toBe(true);
    }

    director.dispose();
    expect(scene.children.length).toBe(0);
  });

  it('supports all 6 camera presets, 0.25s smooth exit blend, and Skip 2-line summary modal inside S25 Ultra Safe Area', () => {
    const ch16 = getStoryChapterById('ch16_wano_country')!;
    const scene = new THREE.Scene();
    const director = new ThreeCutsceneDirector(scene);
    const camCtrl = new MusouCameraController();
    const camera = new THREE.PerspectiveCamera(48, 915 / 412, 0.3, 240);

    const observedShots = new Set<StoryCameraShot3D>();
    director.startChapterPhase(ch16, 'intro', { forceGreybox: true });
    for (let i = 0; i < 30 && director.isActive(); i += 1) {
      observedShots.add(director.getActiveCameraShot());
      const pose = director.update(0.05);
      if (pose) {
        camCtrl.setCutscenePose(pose);
        camCtrl.update(camera, {
          dt: 0.05,
          playerPos: new THREE.Vector3(),
          playerAimDir: new THREE.Vector3(1, 0, 0),
          playerAltitudeY: 0,
          isDashing: false,
          isSpecialActive: false,
          lockedBossPos: null
        });
      }
      director.advance();
    }

    // Confirm Skip modal + confirm flow preserves start_musou_battle on preBattle
    let skippedBattleReq: CutsceneBattleStartRequest | null = null;
    director.startChapterPhase(ch16, 'preBattle', {
      forceGreybox: true,
      callbacks: {
        onStartBattle: (req) => {
          skippedBattleReq = req;
        }
      }
    });
    const pose = director.update(0.05);
    camCtrl.setCutscenePose(pose);
    expect(camCtrl.isInCutscene()).toBe(true);

    director.requestSkip();
    expect(director.isSkipModalOpen()).toBe(true);
    director.confirmSkip();
    expect(skippedBattleReq).not.toBeNull();
    expect(director.isActive()).toBe(false);

    // 0.25s exit blend back to Musou camera
    camCtrl.setCutscenePose(null);
    expect(camCtrl.isInCutscene()).toBe(false);
    expect(camCtrl.isCutsceneBlending()).toBe(true);
    for (let step = 0; step < 6; step += 1) {
      camCtrl.update(camera, {
        dt: 0.05,
        playerPos: new THREE.Vector3(0, 0, 0),
        playerAimDir: new THREE.Vector3(1, 0, 0),
        playerAltitudeY: 0,
        isDashing: false,
        isSpecialActive: false,
        lockedBossPos: null
      });
    }
    expect(camCtrl.isCutsceneBlending()).toBe(false);

    // S25 Ultra Safe Area button layout check
    const s25 = computeResponsiveViewport(915, 412, 3, {
      top: 0,
      right: 24,
      bottom: 0,
      left: 24
    });
    const safe = getSafeHudBounds(s25, 8);
    const layout = computeCutsceneOverlayLayout(s25);
    for (const r of [layout.autoBtn, layout.logBtn, layout.skipBtn, layout.dialogueBox]) {
      expect(r.x).toBeGreaterThanOrEqual(safe.left);
      expect(r.x + r.w).toBeLessThanOrEqual(safe.right);
      expect(r.y).toBeGreaterThanOrEqual(safe.top);
      expect(r.y + r.h).toBeLessThanOrEqual(safe.bottom);
    }

    // All 6 camera presets exist across landmark chapters (Ch.01 + Ch.05 + Ch.10 + Ch.16 + Ch.18)
    for (const id of ['ch01_foosha', 'ch05_arlong_park', 'ch10_water_seven', 'ch18_elbaf']) {
      const ch = getStoryChapterById(id)!;
      for (const phase of ['intro', 'preBattle', 'epilogue'] as const) {
        for (const d of ch[phase]) {
          if (d.type === 'camera_3d') observedShots.add(d.shot);
        }
      }
    }
    expect(observedShots.size).toBe(6);

    director.dispose();
  });

  it('suppresses bloom spikes when flashEffect === false', () => {
    const ch16 = getStoryChapterById('ch16_wano_country')!;
    const scene = new THREE.Scene();
    const director = new ThreeCutsceneDirector(scene);
    const recordedBloom: number[] = [];

    director.startChapterPhase(ch16, 'intro', {
      forceGreybox: true,
      flashEffect: false,
      callbacks: {
        onTemporaryBloomChange: (boost) => {
          recordedBloom.push(boost);
        }
      }
    });
    for (let i = 0; i < 20 && director.isActive(); i += 1) {
      director.update(0.05);
      director.advance();
    }

    expect(Math.max(0, ...recordedBloom)).toBeLessThanOrEqual(0.15);
    director.dispose();
  });

  it('MusouPhaseBanterController handles priority queue, 0px S25 Ultra HUD overlap, and leaves deterministic computeMusouStateHash unchanged', () => {
    const ch16 = getStoryChapterById('ch16_wano_country')!;
    const banterCtrl = new MusouPhaseBanterController();
    banterCtrl.loadRules(ch16.battleBanters);

    const runWithObserver = (useObserver: boolean): string => {
      const state = createMusouCombatState({
        speciesId: 'luffy',
        bossSpeciesId: 'kaido',
        bossMaxHp: 24000,
        bossMaxArmor: 900
      });
      const prng = new SeededPRNG(99999);
      for (let t = 0; t < 120; t += 1) {
        if (t === 20) applyHordeKoToBurst(state, 100);
        const evs = stepMusouCombatTick(
          state,
          {
            moveXPermille: 1000,
            lightAttackPressed: t % 15 === 1,
            burstPressed: state.player.burstGauge >= 1000,
            specialSlotIndex: t === 30 ? 3 : null
          },
          prng
        );
        if (useObserver) {
          banterCtrl.observeFrame(state, evs, t >= 20 ? 100 : 0, FIXED_DT, 'gong_destroyed');
        }
      }
      return computeMusouStateHash(state, prng);
    };

    const hashWithoutBanter = runWithObserver(false);
    banterCtrl.resetForBattle();
    banterCtrl.loadRules(ch16.battleBanters);
    const hashWithBanter = runWithObserver(true);
    expect(hashWithBanter).toBe(hashWithoutBanter);

    // Priority preemption: queue KO milestone (50), then trigger Armor Break (100)
    const testState = createMusouCombatState({
      speciesId: 'luffy',
      bossSpeciesId: 'kaido',
      bossMaxHp: 20000,
      bossMaxArmor: 1000
    });
    fillMusouBurstGauge(testState);
    const pCtrl = new MusouPhaseBanterController();
    pCtrl.loadRules([
      {
        banterId: 'low_ko',
        trigger: 'onKoMilestone',
        threshold: 50,
        speakerId: 'zoro',
        speakerName: '조로',
        emotion: 'smirk',
        text: '50명 격파!'
      },
      {
        banterId: 'high_armor',
        trigger: 'onArmorBreak',
        speakerId: 'luffy',
        speakerName: '루피',
        emotion: 'battle_cry',
        text: '아머 브레이크!'
      }
    ]);
    pCtrl.observeFrame(testState, [], 60, 0.016);
    expect(pCtrl.getActiveBanner()?.rule.banterId).toBe('low_ko');

    pCtrl.observeFrame(
      testState,
      [
        {
          kind: 'BOSS_ARMOR_BREAK',
          bossUnitId: 'o1',
          xMm: 0,
          yMm: 0,
          zMm: 0,
          hitstopTicks: 6,
          groggyDurationTicks: 300
        }
      ],
      60,
      0.016
    );
    expect(pCtrl.getActiveBanner()?.rule.banterId).toBe('high_armor');

    // Auto dismiss after 3.2s
    pCtrl.observeFrame(testState, [], 60, 0.1);
    for (let i = 0; i < 40; i += 1) {
      pCtrl.observeFrame(testState, [], 60, 0.1);
    }
    expect(pCtrl.getActiveBanner()).toBeNull();

    // Zero pixel overlap with MusouBattleHUD at Galaxy S25 Ultra (915x412) and Standard (960x540)
    for (const vp of [
      computeResponsiveViewport(915, 412, 3, { top: 0, right: 24, bottom: 0, left: 24 }),
      DEFAULT_VIEWPORT_METRICS
    ]) {
      const safe = getSafeHudBounds(vp, 8);
      const bannerRect = computeBanterBannerRect(vp);
      const hud = computeMusouHudLayout(vp);

      expect(bannerRect.x).toBeGreaterThanOrEqual(safe.left);
      expect(bannerRect.x + bannerRect.w).toBeLessThanOrEqual(safe.right);
      expect(bannerRect.y).toBeGreaterThanOrEqual(safe.top);
      expect(bannerRect.y + bannerRect.h).toBeLessThanOrEqual(safe.bottom);

      expect(rectsOverlap(bannerRect, hud.playerCard)).toBe(false);
      expect(rectsOverlap(bannerRect, hud.burstButton)).toBe(false);
      expect(rectsOverlap(bannerRect, hud.bossBar)).toBe(false);
      expect(rectsOverlap(bannerRect, hud.koCounter)).toBe(false);
      expect(rectsOverlap(bannerRect, hud.staminaBar)).toBe(false);
      for (const btn of hud.buttons) {
        const btnBox = {
          x: btn.x - btn.r,
          y: btn.y - btn.r,
          w: btn.r * 2,
          h: btn.r * 2
        };
        expect(rectsOverlap(bannerRect, btnBox)).toBe(false);
      }
    }
  });

  it('survives 5x Cutscene -> Battle -> Epilogue -> Dispose round-trips with 0 leaked host.scene children and < 16.6ms frame time', () => {
    const { host, s25 } = createMockThreeHost();
    const world = createBattleWorld(
      {
        seed: 20261124,
        mode: '1V1',
        arenaSizeKey: 'medium',
        teamAlpha: [createStandardPresetBuild('luffy', 'a1', true, 3, defaultDataRegistry)],
        teamOmega: [createStandardPresetBuild('kaido', 'o1', false, 3, defaultDataRegistry)]
      },
      defaultDataRegistry
    );
    const musouState = createMusouCombatState({
      unitId: 'a1',
      speciesId: 'luffy',
      bossUnitId: 'o1',
      bossSpeciesId: 'kaido',
      bossMaxHp: 24000,
      bossMaxArmor: 900
    });
    const ch18 = getStoryChapterById('ch18_elbaf')!;

    for (let cycle = 0; cycle < 5; cycle += 1) {
      const scene = new ThreeMusouBattleScene(host);
      scene.cutsceneDirector.startChapterPhase(ch18, 'intro', { forceGreybox: true });
      for (let f = 0; f < 10; f += 1) {
        scene.render(world, 0.5, FIXED_DT, s25, musouState, []);
      }
      scene.cutsceneDirector.stop(false);
      scene.banterController.loadRules(ch18.battleBanters);

      const t0 = performance.now();
      for (let f = 0; f < 30; f += 1) {
        scene.render(world, 0.5, FIXED_DT, s25, musouState, []);
      }
      const avgFrameMs = (performance.now() - t0) / 30;
      expect(avgFrameMs).toBeLessThan(16.6);

      scene.dispose();
      // Only base sunLight & hemiLight must remain in host.scene
      expect(host.scene.children.length).toBe(2);
    }

    host.dispose();
  });
});
