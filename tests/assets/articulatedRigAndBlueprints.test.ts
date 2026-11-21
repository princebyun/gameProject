import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import spritesManifest from '../../src/data/assets/sprites.json';
import unitsData from '../../src/data/units.json';
import { bakeCharacterSpriteSheetPixels } from '../../src/render/sprite/rig/articulatedPixelRigBaker';
import {
  CHARACTER_BLUEPRINT_ENTRIES,
  getBaseCharacterBlueprintForUnit,
  getCharacterBlueprintByKey
} from '../../src/render/sprite/rig/blueprintLibrary';
import { bakeCharacterPortraitPixels } from '../../src/render/sprite/rig/portraitPixelBaker';
import {
  ALL_PORTRAIT_EMOTIONS,
  type RigType
} from '../../src/render/sprite/rig/rigTypes';

function hashCellPixels(
  sheetData: Uint8ClampedArray,
  sheetWidth: number,
  cellX: number,
  cellY: number,
  fw: number,
  fh: number
): string {
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let y = 0; y < fh; y++) {
    for (let x = 0; x < fw; x++) {
      const idx = ((cellY + y) * sheetWidth + (cellX + x)) * 4;
      const r = sheetData[idx];
      const g = sheetData[idx + 1];
      const b = sheetData[idx + 2];
      const a = sheetData[idx + 3];
      const packed = ((r << 24) | (g << 16) | (b << 8) | a) >>> 0;
      h1 ^= packed;
      h1 = Math.imul(h1, 0x01000193) >>> 0;
      h2 = (h2 + packed + Math.imul(x + 1, y + 1)) >>> 0;
    }
  }
  return `${h1.toString(16)}_${h2.toString(16)}`;
}

describe('6-Archetype Articulated 2D Pixel Rig Baker & Blueprints Coverage', () => {
  it('maps 100% of registered units and forms in character_blueprints.json and on disk (.png + .meta.json)', () => {
    expect(CHARACTER_BLUEPRINT_ENTRIES.length).toBeGreaterThanOrEqual(94);

    for (const unit of unitsData) {
      const baseKey = `${unit.id}_base`;
      const baseBp = getCharacterBlueprintByKey(baseKey);
      expect(baseBp, `Missing base blueprint for ${baseKey}`).not.toBeNull();

      const formIds = new Set<string>();
      if (unit.defaultFormId) formIds.add(unit.defaultFormId);
      if ('awakenedFormId' in unit && unit.awakenedFormId) {
        formIds.add(unit.awakenedFormId);
      }
      if ('forms' in unit && Array.isArray(unit.forms)) {
        for (const fid of unit.forms) formIds.add(fid);
      }
      for (const fid of formIds) {
        const formKey = `${unit.id}_${fid}`;
        const formBp = getCharacterBlueprintByKey(formKey);
        expect(formBp, `Missing form blueprint for ${formKey}`).not.toBeNull();
      }

      // Check 8-emotion 64x64 portraits on disk
      for (const emotion of ALL_PORTRAIT_EMOTIONS) {
        const portraitPath = path.resolve(
          process.cwd(),
          `public/assets/portraits/${unit.id}_${emotion}.png`
        );
        expect(
          fs.existsSync(portraitPath),
          `Missing portrait PNG: ${portraitPath}`
        ).toBe(true);
      }
    }

    for (const entry of spritesManifest.entries) {
      const pngPath = path.resolve(process.cwd(), 'public', entry.src);
      const metaPath = path.resolve(
        process.cwd(),
        `public/assets/sprites/${entry.key}.meta.json`
      );
      expect(fs.existsSync(pngPath), `Missing sprite PNG: ${pngPath}`).toBe(
        true
      );
      expect(fs.existsSync(metaPath), `Missing sprite meta: ${metaPath}`).toBe(
        true
      );
    }
  });

  it('guarantees 0px foot baseline accuracy (anchor.y = 0.9), transparent corners, and multi-frame distinctness across all 6 rigTypes', () => {
    const coveredRigTypes = new Set<RigType>();
    const representativeKeys = [
      'luffy_base',
      'luffy_form_luffy_gear5',
      'zoro_base',
      'sanji_form_sanji_diable_jambe',
      'nami_base',
      'usopp_base',
      'chopper_base',
      'chopper_form_chopper_guard',
      'chopper_form_chopper_kungfu',
      'chopper_form_chopper_monster',
      'robin_base',
      'robin_form_robin_demonio',
      'franky_base',
      'franky_form_franky_shogun',
      'brook_base',
      'jinbe_base',
      'buggy_base',
      'doflamingo_base',
      'katakuri_base',
      'king_base',
      'king_form_king_pteranodon',
      'kaido_base',
      'kaido_form_kaido_beast',
      'kaido_form_kaido_flame_dragon',
      'kizaru_base',
      'akainu_base',
      'aokiji_base',
      'blackbeard_base',
      'marco_form_marco_phoenix',
      'law_base',
      'saturn_base',
      'loki_base'
    ];

    for (const key of representativeKeys) {
      const bp = getCharacterBlueprintByKey(key);
      expect(bp, `Blueprint not found for ${key}`).not.toBeNull();
      if (!bp) continue;
      coveredRigTypes.add(bp.rigType);

      const { width, height, data } = bakeCharacterSpriteSheetPixels(bp);
      const fw = bp.frameWidth;
      const fh = bp.frameHeight;
      expect(width).toBe(fw * 6);
      expect(height).toBe(fh * 11);

      const expectedGroundY = Math.round(fh * bp.anchor.y);

      // 1. Check IDLE frame 0 lowest opaque pixel == expectedGroundY (0px error)
      let maxOpaqueY = -1;
      for (let y = 0; y < fh; y++) {
        for (let x = 0; x < fw; x++) {
          const a = data[(y * width + x) * 4 + 3];
          if (a === 255 && y > maxOpaqueY) {
            maxOpaqueY = y;
          }
        }
      }
      expect(
        maxOpaqueY,
        `Foot baseline mismatch on ${key} (${bp.rigType}): got y=${maxOpaqueY}, expected y=${expectedGroundY}`
      ).toBe(expectedGroundY);

      // 2. Check transparent corners (alpha === 0) on IDLE frame 0
      const corners = [
        [0, 0],
        [fw - 1, 0],
        [0, fh - 1],
        [fw - 1, fh - 1]
      ];
      for (const [cx, cy] of corners) {
        const a = data[(cy * width + cx) * 4 + 3];
        expect(a, `Corner (${cx},${cy}) not transparent on ${key}`).toBe(0);
      }

      // 3. Multi-frame distinctness in IDLE (row 0) and MOVE (row 1)
      const idle0 = hashCellPixels(data, width, 0, 0, fw, fh);
      const idle1 = hashCellPixels(data, width, fw, 0, fw, fh);
      expect(idle0, `IDLE f0 and f1 are identical on ${key}`).not.toBe(idle1);

      const moveHashes = new Set<string>();
      for (let f = 0; f < 6; f++) {
        moveHashes.add(hashCellPixels(data, width, f * fw, fh, fw, fh));
      }
      expect(
        moveHashes.size,
        `MOVE row on ${key} does not have distinct multi-frame animation`
      ).toBeGreaterThanOrEqual(4);
    }

    expect(coveredRigTypes.size).toBe(6);
  });

  it('bakes distinct 64x64 pixel portraits across emotions for any unit', () => {
    const zoroBp = getBaseCharacterBlueprintForUnit('zoro')!;
    const normal = bakeCharacterPortraitPixels(zoroBp, 'normal');
    const angry = bakeCharacterPortraitPixels(zoroBp, 'angry');
    const shocked = bakeCharacterPortraitPixels(zoroBp, 'shocked');

    expect(normal.width).toBe(64);
    expect(normal.height).toBe(64);

    const hNormal = hashCellPixels(normal.data, 64, 0, 0, 64, 64);
    const hAngry = hashCellPixels(angry.data, 64, 0, 0, 64, 64);
    const hShocked = hashCellPixels(shocked.data, 64, 0, 0, 64, 64);

    expect(hNormal).not.toBe(hAngry);
    expect(hAngry).not.toBe(hShocked);
  });
});
