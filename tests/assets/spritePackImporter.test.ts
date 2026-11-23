import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  createImage,
  decodePng,
  encodeImageToPng,
  isValidPngBuffer
} from '../../scripts/lib/pngCodec.mjs';
import { normalizeSpriteSheet } from '../../scripts/lib/spriteSheetProcessor.mjs';
import { runImportSpritePack } from '../../scripts/import-sprite-pack.mjs';

function buildSyntheticChromaSheet(rowsCount = 4, colsCount = 4) {
  const cellW = 48;
  const cellH = 56;
  const img = createImage(cellW * colsCount, cellH * rowsCount, [255, 0, 255, 255]);
  for (let r = 0; r < rowsCount; r++) {
    for (let c = 0; c < colsCount; c++) {
      const bx = c * cellW + 10;
      const by = r * cellH + 8 + (c % 2) * 3;
      for (let py = 0; py < 36; py++) {
        for (let px = 0; px < 22; px++) {
          const i = ((by + py) * img.width + (bx + px)) * 4;
          img.data[i] = py < 12 ? 240 : 180;
          img.data[i + 1] = py < 12 ? 60 : 120;
          img.data[i + 2] = py < 12 ? 60 : 80;
          img.data[i + 3] = 255;
        }
      }
    }
  }
  return img;
}

describe('Step 3 Sprite Sheet Processor & One-Click Pack Importer', () => {
  it('roundtrips PNG encoding/decoding and strips chroma-key with 0px foot alignment', () => {
    const raw = buildSyntheticChromaSheet();
    const encoded = encodeImageToPng(raw);
    expect(isValidPngBuffer(encoded)).toBe(true);
    const decoded = decodePng(encoded);
    expect(decoded.width).toBe(raw.width);
    expect(decoded.height).toBe(raw.height);

    const norm = normalizeSpriteSheet(decoded, {
      key: 'kaido_base',
      unitId: 'kaido',
      formId: 'base',
      rigType: 'giant_boss',
      source: 'USER_CUSTOM_SHEET'
    });

    expect([48, 64, 96, 128]).toContain(norm.frameWidth);
    expect(norm.pngBuffer.byteLength).toBeLessThan(1024 * 1024);
    expect(norm.meta.source).toBe('USER_CUSTOM_SHEET');
    expect(norm.meta.sheetWidth).toBe(norm.frameWidth * 6);
    expect(norm.meta.sheetHeight).toBe(norm.frameHeight * 11);

    const outImg = decodePng(norm.pngBuffer);
    // Top-left corner must be transparent after chroma-key removal
    expect(outImg.data[3]).toBe(0);

    // Every IDLE cell's bottom opaque pixel must land precisely on anchorY row
    const expectedFootY = Math.round(norm.frameHeight * 0.9);
    for (let col = 0; col < 4; col++) {
      let bottomY = -1;
      for (let y = norm.frameHeight - 1; y >= 0; y--) {
        for (let x = col * norm.frameWidth; x < (col + 1) * norm.frameWidth; x++) {
          if (outImg.data[(y * outImg.width + x) * 4 + 3]! >= 16) {
            bottomY = y;
            break;
          }
        }
        if (bottomY >= 0) break;
      }
      expect(bottomY).toBe(expectedFootY);
    }
  });

  it('runImportSpritePack imports raw PNG packs, updates metadata, and handles empty dirs gracefully', () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opgv-import-test-'));
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

      // 1. Empty packs dir -> clean exit
      const emptyRes = runImportSpritePack({ rootDir: tmpRoot, packsDir });
      expect(emptyRes.importedSprites).toBe(0);
      expect(fs.existsSync(path.join(tmpRoot, 'MISSING_SPRITES.md'))).toBe(true);

      // 2. Drop PNG pack -> normalized & registered
      const dropPng = encodeImageToPng(buildSyntheticChromaSheet());
      fs.writeFileSync(path.join(packsDir, 'kaido_base.png'), dropPng);
      const res = runImportSpritePack({ rootDir: tmpRoot, packsDir });
      expect(res.importedSprites).toBe(1);
      expect(res.acquiredCount).toBe(1);
      expect(res.missingCount).toBe(0);
      expect(fs.existsSync(path.join(spritesDir, 'kaido_base.png'))).toBe(true);
      const writtenMeta = JSON.parse(fs.readFileSync(path.join(spritesDir, 'kaido_base.meta.json'), 'utf-8'));
      expect(writtenMeta.source).toBe('USER_CUSTOM_SHEET');
    } finally {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    }
  });
});
