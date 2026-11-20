import { describe, expect, it } from 'vitest';
import {
  resolveFrameSourceAndDestRect,
  type SpriteSheetMetaJson
} from '../../src/assets/smartSpriteSheetLoader';
import { BATTLE_CALC_VERSION } from '../../src/core/constants';
import { defaultAssetManifestRegistry } from '../../src/data/assets/assetManifestRegistry';
import characterBlueprintsJson from '../../src/data/assets/character_blueprints.json';
// @ts-expect-error Pure Node ESM utility script without .d.ts
import { cropUpperBustPortrait, selectSafeChromaBgHex } from '../../scripts/lib/spriteImageOps.mjs';
// @ts-expect-error Pure Node ESM CLI script without .d.ts
import { parseRawAssetFileName } from '../../scripts/sync-sprites.mjs';

describe('Phase 15 — Thumbnail Export, Batch Sprite Sync & Safe Single-Frame External Fallback', () => {
  it('selectSafeChromaBgHex assigns #00FF00 to pink/purple characters and #FF00FF to others', () => {
    const bps = (characterBlueprintsJson as { blueprints: Record<string, Record<string, unknown>> })
      .blueprints;

    expect(selectSafeChromaBgHex(null, 0, 0, bps['chopper'])).toBe('#00FF00');
    expect(selectSafeChromaBgHex(null, 0, 0, bps['doflamingo'])).toBe('#00FF00');
    expect(selectSafeChromaBgHex(null, 0, 0, bps['katakuri'])).toBe('#00FF00');
    expect(selectSafeChromaBgHex(null, 0, 0, bps['magellan'])).toBe('#00FF00');

    expect(selectSafeChromaBgHex(null, 0, 0, bps['luffy'])).toBe('#FF00FF');
    expect(selectSafeChromaBgHex(null, 0, 0, bps['zoro'])).toBe('#FF00FF');
    expect(selectSafeChromaBgHex(null, 0, 0, bps['sanji'])).toBe('#FF00FF');
  });

  it('parseRawAssetFileName classifies standing sprites, action strips, and portrait sheets accurately', () => {
    const validKeys = new Set(Object.keys(defaultAssetManifestRegistry.spritesByKey));
    const validUnits = new Set(['luffy', 'zoro', 'nami', 'kaido', 'chopper']);

    expect(parseRawAssetFileName('luffy_base.png', validKeys, validUnits)).toMatchObject({
      kind: 'SPRITE_STANDING',
      spriteKey: 'luffy_base'
    });
    expect(parseRawAssetFileName('zoro.png', validKeys, validUnits)).toMatchObject({
      kind: 'SPRITE_STANDING',
      spriteKey: 'zoro_base'
    });
    expect(
      parseRawAssetFileName('luffy_base_attack_melee.png', validKeys, validUnits)
    ).toMatchObject({
      kind: 'SPRITE_ACTION',
      spriteKey: 'luffy_base',
      actionState: 'ATTACK_MELEE'
    });
    expect(
      parseRawAssetFileName('zoro_base_move.png', validKeys, validUnits)
    ).toMatchObject({
      kind: 'SPRITE_ACTION',
      spriteKey: 'zoro_base',
      actionState: 'MOVE'
    });
    expect(
      parseRawAssetFileName('portrait_luffy_sheet.png', validKeys, validUnits)
    ).toMatchObject({
      kind: 'PORTRAIT_SHEET',
      unitId: 'luffy'
    });
    expect(
      parseRawAssetFileName('portrait_zoro_angry.png', validKeys, validUnits)
    ).toMatchObject({
      kind: 'PORTRAIT_SINGLE',
      unitId: 'zoro',
      emotion: 'angry'
    });
  });

  it('cropUpperBustPortrait extracts a 64x64 upper-body portrait from a standing full-body sprite', () => {
    const w = 64;
    const h = 64;
    const rgba = new Uint8ClampedArray(w * h * 4);
    // Paint a synthetic standing character from y=8..60, x=22..42
    for (let y = 8; y < 60; y++) {
      for (let x = 22; x < 42; x++) {
        const p = (y * w + x) * 4;
        rgba[p] = y < 26 ? 245 : 30;
        rgba[p + 1] = y < 26 ? 195 : 140;
        rgba[p + 2] = y < 26 ? 150 : 60;
        rgba[p + 3] = 255;
      }
    }
    const bust = cropUpperBustPortrait(rgba, w, h, 64);
    expect(bust.length).toBe(64 * 64 * 4);
    let opaquePx = 0;
    for (let i = 3; i < bust.length; i += 4) {
      if (bust[i] > 0) opaquePx += 1;
    }
    expect(opaquePx).toBeGreaterThan(400);
  });

  it('single-frame external PNG keeps synthesizedFromIdle fallback on MOVE/DODGE/HIT without reverting to procedural shapes', () => {
    const zoroEntry = defaultAssetManifestRegistry.spritesByKey['zoro_base'];
    expect(zoroEntry).toBeDefined();

    const singleFrameMeta: SpriteSheetMetaJson = {
      version: '1.0.0',
      mode: 'atlas',
      frameWidth: 64,
      frameHeight: 64,
      animations: {
        IDLE: {
          fps: 5,
          loop: true,
          frames: [{ x: 0, y: 0, w: 64, h: 64, pivotX: 0.5, pivotY: 0.94 }]
        }
      }
    };

    for (const missingState of ['MOVE', 'ATTACK_MELEE', 'DODGE', 'HIT'] as const) {
      const rect = resolveFrameSourceAndDestRect(
        zoroEntry,
        singleFrameMeta,
        missingState,
        1,
        0,
        64,
        64,
        1.5
      );
      expect(rect.srcX).toBe(0);
      expect(rect.srcY).toBe(0);
      expect(rect.srcW).toBe(64);
      expect(rect.srcH).toBe(64);
      expect(rect.synthesizedFromIdle).toBe(true);
    }

    const idleRect = resolveFrameSourceAndDestRect(
      zoroEntry,
      singleFrameMeta,
      'IDLE',
      0,
      0,
      64,
      64,
      1.5
    );
    expect(idleRect.synthesizedFromIdle).toBe(false);
    expect(BATTLE_CALC_VERSION).toBe('0.7.0');
  });
});
