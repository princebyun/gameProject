import { describe, expect, it } from 'vitest';
import {
  ExternalAssetResolver,
  isValidMultiFrameSpriteSheet
} from '../../src/assets/externalAssetResolver';
import {
  LUFFY_11_STATE_KEYFRAMES,
  LUFFY_FRAME_HEIGHT,
  LUFFY_FRAME_WIDTH,
  LUFFY_PIXEL_PALETTE,
  renderLuffyArticulatedSheetPixels,
  renderLuffyPortraitPixels
} from '../../src/assets/luffyArticulatedPixelSheet';
import { createBattleWorld } from '../../src/core/combat/battleWorld';
import { BATTLE_CALC_VERSION, FIXED_DT } from '../../src/core/constants';
import {
  defaultAssetManifestRegistry,
  resolveBiomeForIsland,
  resolveBiomeForSeaZone,
  resolveShipSpriteEntry,
  resolveSpriteSheetEntry
} from '../../src/data/assets/assetManifestRegistry';
import { STANDARD_SPRITE_ANIM_STATES } from '../../src/data/assets/types';
import { defaultDataRegistry } from '../../src/data/dataRegistry';
import { defaultRpgDataRegistry } from '../../src/data/rpgDataRegistry';
import { SpriteAnimationController } from '../../src/render/sprite/spriteAnimationController';
import {
  AUTOTILE_EAST,
  AUTOTILE_NORTH,
  AUTOTILE_SOUTH,
  AUTOTILE_WEST,
  computeBitmaskFromNeighbors,
  computeCardinalBitmask
} from '../../src/render/tileset/autotileBitmask';

describe('Phase 11 Step 1: Sprite Animation State Machine, Autotile Bitmask & Hot-Swap Fallback Priority', () => {
  it('1. BATTLE_CALC_VERSION remains 0.6.0 and sprites.json covers all units, forms & 4 ships with 11 standard states', () => {
    expect(BATTLE_CALC_VERSION).toBe('0.6.0');
    expect(defaultAssetManifestRegistry.spritesFile.standardRowOrder).toEqual([
      ...STANDARD_SPRITE_ANIM_STATES
    ]);

    for (const unit of Object.values(defaultDataRegistry.units)) {
      const baseEntry = resolveSpriteSheetEntry(unit.id, null);
      expect(baseEntry, `Missing base sprite manifest for ${unit.id}`).not.toBeNull();
      expect([32, 48, 64, 96]).toContain(baseEntry!.frameWidth);
      expect(baseEntry!.anchor.x).toBe(0.5);
      expect([0.85, 0.9]).toContain(baseEntry!.anchor.y);
      for (const st of STANDARD_SPRITE_ANIM_STATES) {
        expect(baseEntry!.animations[st]).toBeDefined();
      }
    }

    // Specific size & anchor checks: Luffy Base (48x48, anchor 0.5/0.9), Gear 5 (48), Kaido Dragon (96), Saturn (96), Loki (96)
    const luffyBaseEntry = resolveSpriteSheetEntry('luffy', null)!;
    expect(luffyBaseEntry.frameWidth).toBe(48);
    expect(luffyBaseEntry.frameHeight).toBe(48);
    expect(luffyBaseEntry.anchor).toEqual({ x: 0.5, y: 0.9 });
    expect(luffyBaseEntry.animations.IDLE.frames).toBe(4);
    expect(luffyBaseEntry.animations.MOVE.frames).toBe(6);
    expect(luffyBaseEntry.animations.ATTACK_MELEE.frames).toBe(4);
    expect(luffyBaseEntry.animations.ATTACK_CAST.frames).toBe(4);
    expect(luffyBaseEntry.animations.DODGE.frames).toBe(3);
    expect(resolveSpriteSheetEntry('luffy', 'form_luffy_gear5')?.frameWidth).toBe(48);
    expect(resolveSpriteSheetEntry('kaido', 'form_kaido_beast')?.frameWidth).toBe(96);
    expect(resolveSpriteSheetEntry('saturn', null)?.frameWidth).toBe(96);
    expect(resolveSpriteSheetEntry('loki', null)?.frameWidth).toBe(96);

    for (const shipId of ['going_merry', 'thousand_sunny', 'marine_warship', 'sea_king']) {
      expect(resolveShipSpriteEntry(shipId)).not.toBeNull();
    }
  });

  it('2. SpriteAnimationController: 11-state transitions, loop vs one-shot completion, hitFrame sync & 80ms HP-drop flash', () => {
    const controller = new SpriteAnimationController();
    const luffyEntry = resolveSpriteSheetEntry('luffy', null)!;

    // Loop test (IDLE: 4 frames @ 5 fps -> 0.8s full loop wraps back to frame 0)
    const s0 = controller.stepClip('u1', 'IDLE', luffyEntry, 0);
    expect(s0.state).toBe('IDLE');
    expect(s0.frameIndex).toBe(0);
    expect(s0.finishedOneShot).toBe(false);
    const sLoop = controller.stepClip('u1', 'IDLE', luffyEntry, 0.85);
    expect(sLoop.frameIndex).toBe(0);
    expect(sLoop.finishedOneShot).toBe(false);

    // One-shot + hitFrame sync test (ATTACK_MELEE: 4 frames @ 14 fps, hitFrame = 2)
    let hitFiredCount = 0;
    let finished = false;
    controller.stepClip('u1', 'ATTACK_MELEE', luffyEntry, 0, { forceRestart: true });
    for (let i = 0; i < 20; i++) {
      const r = controller.stepClip('u1', 'ATTACK_MELEE', luffyEntry, 0.03);
      if (r.hitFrameFiredThisTick) hitFiredCount += 1;
      if (r.finishedOneShot) finished = true;
    }
    expect(hitFiredCount).toBe(1); // Fires exactly once when passing hitFrame
    expect(finished).toBe(true); // Clamps at final frame once one-shot ends

    // Verify all 11 standard states can transition cleanly
    for (const state of STANDARD_SPRITE_ANIM_STATES) {
      const r = controller.stepClip('u_all', state, luffyEntry, 0.05);
      expect(r.state).toBe(state);
      expect(r.row).toBe(luffyEntry.animations[state].row);
    }

    // BattleWorldState read-only observation: HP drop triggers 80ms hitFlashActive
    const luffyDef = defaultDataRegistry.units['luffy'];
    const zoroDef = defaultDataRegistry.units['zoro'];
    if (!luffyDef || !zoroDef) throw new Error('Missing luffy or zoro unit def');
    const world = createBattleWorld(
      {
        seed: 42,
        arenaSizeKey: 'medium',
        mode: '1V1',
        teamAlpha: [
          {
            instanceId: 'p_luffy',
            speciesId: 'luffy',
            level: 50,
            ivs: { hp: 20, atk: 20, def: 20, spAtk: 20, spDef: 20, spd: 20 },
            evs: { hp: 60, atk: 60, def: 60, spAtk: 60, spDef: 60, spd: 60 },
            moveIds: [...luffyDef.defaultMoves],
            equipmentId: luffyDef.defaultEquipmentId,
            traitId: luffyDef.traitId,
            formId: luffyDef.defaultFormId,
            isPlayerControlled: true,
            aiLevel: 4
          }
        ],
        teamOmega: [
          {
            instanceId: 'e_zoro',
            speciesId: 'zoro',
            level: 50,
            ivs: { hp: 20, atk: 20, def: 20, spAtk: 20, spDef: 20, spd: 20 },
            evs: { hp: 60, atk: 60, def: 60, spAtk: 60, spDef: 60, spd: 60 },
            moveIds: [...zoroDef.defaultMoves],
            equipmentId: zoroDef.defaultEquipmentId,
            traitId: zoroDef.traitId,
            formId: zoroDef.defaultFormId,
            isPlayerControlled: false,
            aiLevel: 4
          }
        ]
      },
      defaultDataRegistry
    );

    const pLuffy = world.units[0];
    if (!pLuffy) throw new Error('Missing pLuffy');
    const firstSync = controller.syncAndStepUnit(
      pLuffy,
      world,
      defaultDataRegistry,
      defaultAssetManifestRegistry,
      FIXED_DT
    );
    expect(firstSync.step.state).toBe('IDLE');
    expect(firstSync.step.hitFlashActive).toBe(false);

    // Drop HP -> triggers HIT & 80ms white flash without modifying src/core/
    pLuffy.hp -= 50;
    const hitSync = controller.syncAndStepUnit(
      pLuffy,
      world,
      defaultDataRegistry,
      defaultAssetManifestRegistry,
      FIXED_DT
    );
    expect(hitSync.step.state).toBe('HIT');
    expect(hitSync.step.hitFlashActive).toBe(true);
  });

  it('3. 4-direction autotile bitmask covers all 16 combinations and tilesets.json maps all 3 seas & 17 islands', () => {
    // Exhaustive verification of all 16 cardinal neighbor combinations
    const seen = new Set<number>();
    for (const n of [false, true]) {
      for (const e of [false, true]) {
        for (const s of [false, true]) {
          for (const w of [false, true]) {
            const mask = computeBitmaskFromNeighbors(n, e, s, w);
            expect(mask).toBeGreaterThanOrEqual(0);
            expect(mask).toBeLessThanOrEqual(15);
            seen.add(mask);
          }
        }
      }
    }
    expect(seen.size).toBe(16);

    // Verify grid evaluation on a 3x3 cross pattern
    const grid = [
      [0, 1, 0],
      [1, 1, 1],
      [0, 1, 0]
    ];
    expect(computeCardinalBitmask(grid, 1, 1, (v) => v === 1, false)).toBe(
      AUTOTILE_NORTH | AUTOTILE_EAST | AUTOTILE_SOUTH | AUTOTILE_WEST
    );
    expect(computeCardinalBitmask(grid, 1, 0, (v) => v === 1, false)).toBe(
      AUTOTILE_SOUTH
    );
    expect(computeCardinalBitmask(grid, 0, 1, (v) => v === 1, false)).toBe(
      AUTOTILE_EAST
    );

    // Verify all 3 seas and all 17 episode islands resolve to valid biome tilesets
    expect(defaultAssetManifestRegistry.tilesetsFile.biomes.length).toBeGreaterThanOrEqual(12);
    for (const zId of ['east_blue', 'grand_line', 'new_world']) {
      expect(resolveBiomeForSeaZone(zId).category).toBe('SEA');
    }
    for (const islId of Object.keys(defaultRpgDataRegistry.islands)) {
      const biome = resolveBiomeForIsland(islId);
      expect(biome).toBeDefined();
      expect(biome.tileSize).toBe(16);
    }
  });

  it('4. ExternalAssetResolver: falls back to BAKED_FALLBACK when external PNG missing, overrides with EXTERNAL_PNG when present', async () => {
    const fakeExternalImg = { width: 192, height: 352 } as unknown as HTMLCanvasElement;
    const fakeBakedImg = { width: 192, height: 352, baked: true } as unknown as HTMLCanvasElement;

    // Case A: External file does NOT exist -> BAKED_FALLBACK
    const resolverMissing = new ExternalAssetResolver(async () => null);
    const resFallback = await resolverMissing.resolveImageAsync(
      'luffy_base',
      'assets/sprites/luffy_base.png',
      () => fakeBakedImg
    );
    expect(resFallback.source).toBe('BAKED_FALLBACK');
    expect(resFallback.image).toBe(fakeBakedImg);
    expect(resolverMissing.getSourceStatus('luffy_base')).toBe('BAKED_FALLBACK');

    // Case B: External multi-frame PNG exists (width >= frameWidth * 4) -> EXTERNAL_PNG takes priority over baked fallback!
    const resolverPresent = new ExternalAssetResolver(async (src) =>
      src === 'assets/sprites/luffy_base.png' ? fakeExternalImg : null
    );
    const resExternal = await resolverPresent.resolveImageAsync(
      'luffy_base',
      'assets/sprites/luffy_base.png',
      () => fakeBakedImg,
      { frameWidth: 48, minHorizontalFrames: 4 }
    );
    expect(resExternal.source).toBe('EXTERNAL_PNG');
    expect(resExternal.image).toBe(fakeExternalImg);
    expect(resolverPresent.getSourceStatus('luffy_base')).toBe('EXTERNAL_PNG');

    // Case C: Single stationary PNG (width < frameWidth * 4, e.g. 48x48 single frame) is rejected as reference-only!
    const singleStaticImg = { width: 48, height: 48 } as unknown as HTMLCanvasElement;
    expect(isValidMultiFrameSpriteSheet(singleStaticImg, 48, 4)).toBe(false);
    expect(isValidMultiFrameSpriteSheet(fakeExternalImg, 48, 4)).toBe(true);
    const resolverSingleStatic = new ExternalAssetResolver(async () => singleStaticImg);
    const resRejectedSingle = await resolverSingleStatic.resolveImageAsync(
      'luffy_base',
      'assets/sprites/luffy_base.png',
      () => fakeBakedImg,
      { frameWidth: 48, minHorizontalFrames: 4 }
    );
    expect(resRejectedSingle.source).toBe('BAKED_FALLBACK');

    // Case D: Articulated 48x48 luffy_base pixel sheet verifies distinct limb crossing & Gomu-Gomu arm stretch
    expect(LUFFY_PIXEL_PALETTE.hatBase).toBe('#facc15');
    expect(LUFFY_PIXEL_PALETTE.ribbonBase).toBe('#dc2626');
    expect(LUFFY_PIXEL_PALETTE.vestBase).toBe('#ef4444');
    expect(LUFFY_PIXEL_PALETTE.shortsBase).toBe('#1d4ed8');
    const moveFrame0 = LUFFY_11_STATE_KEYFRAMES.MOVE[0];
    const moveFrame3 = LUFFY_11_STATE_KEYFRAMES.MOVE[3];
    const attackMeleeFrame2 = LUFFY_11_STATE_KEYFRAMES.ATTACK_MELEE[2];
    if (!moveFrame0 || !moveFrame3 || !attackMeleeFrame2) {
      throw new Error('Missing expected Luffy keyframe');
    }
    expect(moveFrame0.frontFootX).toBeGreaterThan(
      moveFrame0.backFootX
    );
    expect(moveFrame3.frontFootX).toBeLessThan(
      moveFrame3.backFootX
    );
    expect(attackMeleeFrame2.frontFistX).toBeGreaterThanOrEqual(44);

    const sheetPixels = renderLuffyArticulatedSheetPixels();
    expect(sheetPixels.width).toBe(LUFFY_FRAME_WIDTH * 6);
    expect(sheetPixels.height).toBe(LUFFY_FRAME_HEIGHT * 11);

    for (const emotion of ['neutral', 'grin', 'angry', 'shock'] as const) {
      const portrait = renderLuffyPortraitPixels(emotion);
      expect(portrait.width).toBe(64);
      expect(portrait.height).toBe(64);
    }
  });
});
