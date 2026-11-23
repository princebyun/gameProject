import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  analyzeIrregularSpriteSheet,
  createSyntheticIrregularTestSheet
} from '../../src/assets/slicer/irregularSheetPipeline';
import { renderDebugOverlayRgba } from '../../src/assets/slicer/atlasPackerAndDebug';
import {
  serializeRecipe,
  type IrregularSheetRecipeV1
} from '../../src/assets/slicer/slicerTypes';
import { createImage, decodePng, encodeImageToPng } from '../../scripts/lib/pngCodec.mjs';
import { runImportSpritePack } from '../../scripts/import-sprite-pack.mjs';

describe('Irregular Sprite Sheet Slicer Engine (Step 1 & 3)', () => {
  it('excludes banner, dividers, and pixel text labels while merging 3px floating hats and fixing long punch torso pivotX', () => {
    const raw = createSyntheticIrregularTestSheet();
    const res = analyzeIrregularSpriteSheet(raw);

    // Must extract ONLY the 6 real fighter frames (4 IDLE + 2 long ATTACK), 0 banner/text leaks!
    expect(res.frames.length).toBe(6);
    expect(res.rows.length).toBe(2);

    const reasons = new Set(res.excludedRegions.map((e) => e.reason));
    expect(reasons.has('HEADER_BANNER')).toBe(true);
    expect(reasons.has('DIVIDER_LINE')).toBe(true);
    expect(reasons.has('TEXT_LABEL')).toBe(true);

    // Every excluded header/label y sits above the sprite panels or matches dividers
    for (const f of res.frames) {
      expect(f.y).toBeGreaterThanOrEqual(64);
      expect(f.w).toBeGreaterThanOrEqual(18);
      // Floating hat 3px above head must be merged into every fighter frame
      expect(f.sourceComponents.length).toBeGreaterThanOrEqual(2);
      expect(f.h).toBeGreaterThanOrEqual(40);
    }

    const idleRow = res.rows[0]!;
    const atkRow = res.rows[1]!;
    expect(idleRow.assignedState).toBe('IDLE');
    expect(atkRow.assignedState).toBe('ATTACK_MELEE');

    const idleFrame = idleRow.frames[0]!;
    const atkFrame = atkRow.frames[0]!;
    // Long stretched fist attack must be ~96px wide, while pivotX stays locked near left torso (~14px), NOT geometric center (~48px)!
    expect(atkFrame.w).toBeGreaterThanOrEqual(90);
    expect(atkFrame.pivotX).toBeLessThan(26);
    expect(Math.abs(atkFrame.pivotX - idleFrame.pivotX)).toBeLessThanOrEqual(4);
    expect(Math.abs(atkFrame.pivotY - idleFrame.pivotY)).toBeLessThanOrEqual(1);

    // Debug overlay renders red/green/yellow markers cleanly at original dimensions
    const overlay = renderDebugOverlayRgba(raw, res);
    expect(overlay.width).toBe(raw.width);
    expect(overlay.height).toBe(raw.height);
  });

  it('applies .recipe.json overrides (row states, manual pivots, restores) with 100% priority over heuristics', () => {
    const raw = createSyntheticIrregularTestSheet();
    const recipe: IrregularSheetRecipeV1 = {
      version: 1,
      unitId: 'luffy',
      formId: 'base',
      options: { tolerance: 18, flipHorizontal: false, scale: 1.0, paddingPx: 2, keepPortraits: false },
      excludedRegions: [],
      restoredRegions: [],
      mergedGroups: [],
      rowStateOverrides: {
        '0': 'VICTORY',
        '1': 'ATTACK_CAST'
      },
      framePivotOverrides: {
        row_1_col_0: { pivotX: 19, pivotY: 42 }
      }
    };

    const res = analyzeIrregularSpriteSheet(raw, {}, recipe);
    expect(res.rows[0]?.assignedState).toBe('VICTORY');
    expect(res.rows[1]?.assignedState).toBe('ATTACK_CAST');
    expect(res.rows[1]?.frames[0]?.pivotX).toBe(19);
    expect(res.rows[1]?.frames[0]?.pivotY).toBe(42);
  });

  it('runImportSpritePack honors --preview-only, .recipe.json, VARIABLE_PACK meta, and --keep-portraits', () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opgv-slicer-cli-'));
    try {
      const packsDir = path.join(tmpRoot, 'raw_assets', 'packs');
      const dataDir = path.join(tmpRoot, 'src', 'data', 'assets');
      const spritesDir = path.join(tmpRoot, 'public', 'assets', 'sprites');
      const portraitsDir = path.join(tmpRoot, 'public', 'assets', 'portraits');
      fs.mkdirSync(packsDir, { recursive: true });
      fs.mkdirSync(dataDir, { recursive: true });
      fs.mkdirSync(spritesDir, { recursive: true });
      fs.mkdirSync(portraitsDir, { recursive: true });

      const sampleManifest = {
        version: '1.0.0',
        entries: [
          {
            key: 'kaido_base',
            unitId: 'kaido',
            formId: 'base',
            rigType: 'giant_boss',
            src: 'assets/sprites/kaido_base.png',
            frameWidth: 64,
            frameHeight: 64,
            anchor: { x: 0.5, y: 0.9 },
            animations: {
              IDLE: { row: 0, frames: 4, fps: 5, loop: true },
              MOVE: { row: 1, frames: 6, fps: 12, loop: true },
              WINDUP: { row: 2, frames: 3, fps: 10, loop: false },
              ATTACK_MELEE: { row: 3, frames: 4, fps: 14, loop: false, hitFrame: 2 },
              ATTACK_CAST: { row: 4, frames: 4, fps: 12, loop: false, hitFrame: 2 },
              CLASH: { row: 5, frames: 2, fps: 12, loop: true },
              DODGE: { row: 6, frames: 3, fps: 12, loop: false },
              HIT: { row: 7, frames: 2, fps: 10, loop: false },
              DOWNED: { row: 8, frames: 2, fps: 4, loop: true },
              TRANSFORM: { row: 9, frames: 4, fps: 10, loop: false, hitFrame: 2 },
              VICTORY: { row: 10, frames: 3, fps: 6, loop: true }
            }
          }
        ]
      };
      fs.writeFileSync(path.join(dataDir, 'sprites.json'), JSON.stringify(sampleManifest, null, 2));

      const raw = createSyntheticIrregularTestSheet();
      fs.writeFileSync(path.join(packsDir, 'kaido_base.png'), encodeImageToPng(raw));

      // Recipe forcing Row 1 to ATTACK_CAST
      const recipe: IrregularSheetRecipeV1 = {
        version: 1,
        unitId: 'kaido',
        formId: 'base',
        options: { tolerance: 18, flipHorizontal: false, scale: 1.0, paddingPx: 2, keepPortraits: false },
        excludedRegions: [],
        restoredRegions: [],
        mergedGroups: [],
        rowStateOverrides: { '1': 'ATTACK_CAST' },
        framePivotOverrides: {}
      };
      fs.writeFileSync(path.join(packsDir, 'kaido_base.recipe.json'), serializeRecipe(recipe));

      // 1. Preview-only emits debug overlay WITHOUT touching public/assets/sprites
      const prevRes = runImportSpritePack({ rootDir: tmpRoot, packsDir, file: 'kaido_base.png', previewOnly: true });
      expect(prevRes.importedSprites).toBe(0);
      expect(prevRes.debugOutputs.length).toBe(1);
      expect(fs.existsSync(prevRes.debugOutputs[0]!)).toBe(true);
      expect(fs.existsSync(path.join(spritesDir, 'kaido_base.png'))).toBe(false);

      // Seed custom existing portrait and test keepPortraits: true preserves it
      const existingPortraitBuf = encodeImageToPng(createImage(64, 64, [12, 34, 56, 255]));
      fs.writeFileSync(path.join(portraitsDir, 'kaido_normal.png'), existingPortraitBuf);

      // 2. Full import registers VARIABLE_PACK atlas + frameRects + protects source
      const res = runImportSpritePack({
        rootDir: tmpRoot,
        packsDir,
        file: 'kaido_base.png',
        keepPortraits: true
      });
      expect(res.importedSprites).toBe(1);
      expect(res.importedPortraits).toBe(0);
      expect(decodePng(fs.readFileSync(path.join(portraitsDir, 'kaido_normal.png'))).data[0]).toBe(12);

      const meta = JSON.parse(fs.readFileSync(path.join(spritesDir, 'kaido_base.meta.json'), 'utf-8'));
      expect(meta.source).toBe('USER_CUSTOM_SHEET');
      expect(meta.atlasMode).toBe('VARIABLE_PACK');
      expect(meta.animations.ATTACK_CAST.frameRects.length).toBe(2);
      expect(meta.animations.ATTACK_CAST.frameRects[0].w).toBeGreaterThanOrEqual(90);

      // 3. Re-import with keepPortraits: false extracts face portrait from IDLE frame
      const res2 = runImportSpritePack({
        rootDir: tmpRoot,
        packsDir,
        file: 'kaido_base.png',
        keepPortraits: false
      });
      expect(res2.importedPortraits).toBe(1);
      const portraitDims = decodePng(fs.readFileSync(path.join(portraitsDir, 'kaido_normal.png')));
      expect(portraitDims.width).toBe(64);
      expect(portraitDims.height).toBe(64);
    } finally {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    }
  });
});
