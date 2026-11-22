import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { AssetLoader } from '../../src/assets/assetLoader';
import { createBattleWorld, stepBattleWorld } from '../../src/core/combat/battleWorld';
import { activateFormShift } from '../../src/core/combat/formShiftEngine';
import { BATTLE_CALC_VERSION, FIXED_DT } from '../../src/core/constants';
import { SeededPRNG } from '../../src/core/math/prng';
import { createStandardPresetBuild } from '../../src/core/net/terminalArenaRule';
import { createInitialCampaignState } from '../../src/core/rpg/campaignState';
import { enterIslandEpisode, stepIslandExploration } from '../../src/core/rpg/episodeEngine';
import { stepSeaSailing } from '../../src/core/rpg/sailingPhysics';
import spritesManifest from '../../src/data/assets/sprites.json';
import { defaultDataRegistry } from '../../src/data/dataRegistry';
import { defaultRpgDataRegistry } from '../../src/data/rpgDataRegistry';
import { computeArenaCameraOffset } from '../../src/render/battleRenderer';
import { UnifiedInputManager } from '../../src/input/inputManager';
import { computeSafeRect } from '../../src/render/viewport/safeAreaLayout';
import { computeResponsiveViewport } from '../../src/render/viewport/responsiveViewportManager';
import { createBootSceneState, stepBootScene } from '../../src/scenes/bootScene';
import {
  advanceOpeningNarrationOnTap,
  createOpeningNarrationState,
  stepOpeningNarration
} from '../../src/scenes/openingNarrationScene';

describe('Step 3 & Step 4: Production dist-web/ Bundle Audit & Galaxy S25 Ultra (19.5:9, 915x412) E2E Flow', () => {
  it('verifies production dist-web/ exists, has 0 forbidden/contaminated files, and uses relative ./ asset URLs', () => {
    const distDir = path.resolve(process.cwd(), 'dist-web');
    expect(fs.existsSync(distDir)).toBe(true);

    const indexHtml = fs.readFileSync(path.join(distDir, 'index.html'), 'utf-8');
    expect(indexHtml).toContain('./assets/');

    function walk(dir: string): { rel: string; size: number }[] {
      const out: { rel: string; size: number }[] = [];
      for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, ent.name);
        if (ent.isDirectory()) {
          out.push(...walk(full));
        } else {
          out.push({
            rel: path.relative(distDir, full).split(path.sep).join('/'),
            size: fs.statSync(full).size
          });
        }
      }
      return out;
    }

    const files = walk(distDir);
    expect(files.length).toBeGreaterThanOrEqual(550);

    // 1. Contamination check: 0 markdown docs, raw_assets, .env, or .map files
    const contaminated = files.filter(
      (f) =>
        /^(raw_assets|exported_thumbnails)\//i.test(f.rel) ||
        /(AGENTS|HANDOFF|CLAUDE|AI_BUNDLE|GEMINI)\.md$/i.test(f.rel) ||
        /\.env/i.test(f.rel) ||
        /\.map$/i.test(f.rel)
    );
    expect(contaminated).toEqual([]);

    // 2. Every sprite in sprites.json is present in dist-web/assets/sprites/ and under 1MB
    for (const entry of spritesManifest.entries) {
      const found = files.find((f) => f.rel === entry.src);
      expect(found, `Missing in dist-web: ${entry.src}`).toBeDefined();
      expect(found!.size).toBeGreaterThan(0);
      expect(found!.size).toBeLessThan(1024 * 1024);
    }
  });

  it('executes full Galaxy S25 Ultra (915x412, 19.5:9) E2E scene pipeline: Boot -> Title -> Opening -> Foosha Island -> East Blue Sailing -> Battle (Luffy, Zoro, Sanji, Kaido Dragon, Saturn)', () => {
    expect(BATTLE_CALC_VERSION).toBe('0.6.0');

    // 1. Galaxy S25 Ultra 19.5:9 Landscape Viewport + Safe Area Insets
    const viewport = computeResponsiveViewport(915, 412, 3, {
      top: 0,
      right: 36,
      bottom: 14,
      left: 44
    });
    expect(viewport.viewWidth).toBeGreaterThanOrEqual(1170);
    expect(viewport.viewHeight).toBe(540);
    expect(viewport.arenaOffsetX).toBeGreaterThanOrEqual(105);

    const safeRect = computeSafeRect(
      viewport.viewWidth,
      viewport.viewHeight,
      viewport.safeInsets,
      8
    );
    expect(safeRect.left).toBe(viewport.safeInsets.left + 8);
    expect(safeRect.right).toBe(viewport.viewWidth - viewport.safeInsets.right - 8);

    // 2. BootScene -> TitleScene -> OpeningNarrationScene
    const boot = createBootSceneState();
    for (let i = 0; i < 150; i++) {
      stepBootScene(boot, true, FIXED_DT);
    }
    expect(boot.completed).toBe(true);

    const opening = createOpeningNarrationState();
    let openingFinished = false;
    for (let s = 0; s < 4; s++) {
      stepOpeningNarration(opening, 0.5);
      if (advanceOpeningNarrationOnTap(opening)) openingFinished = true;
      if (advanceOpeningNarrationOnTap(opening)) openingFinished = true;
    }
    expect(openingFinished).toBe(true);

    // 3. Foosha Village Island Exploration -> Free Sailing
    const campaign = createInitialCampaignState(
      defaultRpgDataRegistry,
      defaultDataRegistry
    );
    const enterRes = enterIslandEpisode(
      campaign,
      'foosha_shells',
      defaultRpgDataRegistry
    );
    expect(enterRes.allowed).toBe(true);
    const rt = enterRes.runtime!;
    const stepOut = stepIslandExploration(
      campaign,
      rt,
      { x: 1, y: 0 },
      false,
      FIXED_DT,
      defaultRpgDataRegistry,
      defaultDataRegistry
    );
    expect(rt.isMoving).toBe(true);
    expect(stepOut.triggeredBattle).toBeNull();

    const sailOut = stepSeaSailing(
      campaign,
      {
        moveVec: { x: 1, y: 0 },
        dockOrInteractPressed: false,
        coupDeBurstPressed: true
      },
      FIXED_DT,
      defaultRpgDataRegistry
    );
    expect(sailOut.triggeredBattle).toBeNull();
    expect(Math.hypot(campaign.ship.vel.x, campaign.ship.vel.y)).toBeGreaterThan(0);

    // 4. Battle Scene with Luffy, Zoro, Sanji, Kaido (Azure Dragon), and Saturn
    const assets = new AssetLoader();
    const world = createBattleWorld(
      {
        seed: 20261122,
        mode: '2V2',
        arenaSizeKey: 'medium',
        teamAlpha: [
          createStandardPresetBuild('luffy', 'alpha_luffy', true, 4, defaultDataRegistry),
          createStandardPresetBuild('zoro', 'alpha_zoro', false, 4, defaultDataRegistry),
          createStandardPresetBuild('sanji', 'alpha_sanji', false, 4, defaultDataRegistry)
        ],
        teamOmega: [
          createStandardPresetBuild('kaido', 'omega_kaido', false, 4, defaultDataRegistry),
          createStandardPresetBuild('saturn', 'omega_saturn', false, 4, defaultDataRegistry)
        ]
      },
      defaultDataRegistry
    );

    const prng = new SeededPRNG(20261122);
    const kaidoUnit = world.units[3];
    const saturnUnit = world.units[4];
    expect(kaidoUnit).toBeDefined();
    expect(saturnUnit).toBeDefined();
    if (!kaidoUnit || !saturnUnit) throw new Error('Missing boss unit');
    activateFormShift(kaidoUnit, world, defaultDataRegistry, 'form_kaido_beast');
    activateFormShift(saturnUnit, world, defaultDataRegistry, 'form_saturn_gyuki');

    for (let tick = 0; tick < 30; tick++) {
      stepBattleWorld(
        world,
        [
          {
            unitId: 'alpha_luffy',
            moveVec: { x: 1, y: 0 },
            aimVec: { x: 1, y: 0 },
            castMoveSlotIndex: tick === 5 ? 0 : null,
            dodgePressed: false,
            formShiftPressed: tick === 1,
            awakeningPressed: tick === 1,
            swapToBenchUnitId: null
          }
        ],
        defaultDataRegistry,
        prng
      );
      for (const u of world.units) {
        if (!u.isOnField) continue;
        const step = assets.spriteController.syncAndStepUnit(
          u,
          world,
          defaultDataRegistry,
          assets.manifestRegistry,
          FIXED_DT
        );
        expect(step.entry?.animations[step.step.state].frames).toBeGreaterThanOrEqual(2);
      }
    }

    const cam = computeArenaCameraOffset(
      world,
      1.0,
      {
        flashEffectEnabled: true,
        shakeIntensity: 0.8,
        showFps: true
      },
      'ALL',
      viewport
    );
    expect(cam.x).toBe(Math.round((viewport.viewWidth - world.arenaWidth) * 0.5));

    // 5. Post-Battle Movement Regression Check:
    // Even if battleWorld.units[0] is KO'd (isAlive = false) or swapped off-field (isOnField = false)
    // when a battle ends, directional movement in Island / Sea exploration must never lock up.
    const leadUnit = world.units[0];
    expect(leadUnit).toBeDefined();
    if (!leadUnit) throw new Error('Missing lead unit');
    leadUnit.isAlive = false;
    leadUnit.isOnField = false;

    const input = new UnifiedInputManager({
      platformName: 'web-pwa',
      nowMs: () => 1000,
      getStorageItem: () => null,
      setStorageItem: () => {},
      removeStorageItem: () => {},
      isFullscreen: () => false,
      toggleFullscreen: async () => false,
      vibrate: () => {},
      exportJsonFile: () => {}
    });
    input.virtualMoveVec = { x: 1, y: 0 };

    // Confirm old buildPlayerCommand(world.units[0]) returns null when units[0] is dead/off-field:
    expect(input.buildPlayerCommand(world.units[0], world, defaultDataRegistry)).toBeNull();

    // Confirm getExplorationMoveVector() works independently of battleWorld.units[0]:
    const postBattleMoveVec = input.getExplorationMoveVector();
    expect(postBattleMoveVec.x).toBeCloseTo(1, 3);
    expect(postBattleMoveVec.y).toBeCloseTo(0, 3);

    const prevIslandX = rt.playerPos.x;
    stepIslandExploration(
      campaign,
      rt,
      postBattleMoveVec,
      false,
      FIXED_DT,
      defaultRpgDataRegistry,
      defaultDataRegistry
    );
    expect(rt.playerPos.x).toBeGreaterThan(prevIslandX);
  });
});
