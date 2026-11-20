import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  getAllCharacterBlueprintIds,
  resolveCharacterBlueprint,
  shadeHueShift
} from '../../src/assets/pixelArtPrimitives';
import {
  SmartSpriteSheetLoader,
  applyChromaKeyToPixels,
  detectSpriteFramesAuto,
  resolveBakedFrameSize,
  resolveFrameSourceAndDestRect,
  type SpriteSheetMetaJson
} from '../../src/assets/smartSpriteSheetLoader';
import { defaultAssetManifestRegistry } from '../../src/data/assets/assetManifestRegistry';
import type { UnitDefinition } from '../../src/core/types/dataSchemas';
// @ts-expect-error Pure Node ESM utility script without .d.ts
import { decodePng, encodePng, pixelizePngBuffer } from '../../scripts/pixelize-sprite.mjs';

describe('Phase 14 Step 1 — SmartSpriteSheetLoader, Chroma-Key, Auto Slicer, Pixelizer CLI & Character Blueprints', () => {
  it('auto chroma-key removes solid (0,0) green/magenta background while preserving sprite pixels', () => {
    const w = 16;
    const h = 16;
    const rgba = new Uint8ClampedArray(w * h * 4);
    // Fill solid magenta background (255, 0, 255)
    for (let i = 0; i < w * h; i++) {
      rgba[i * 4] = 255;
      rgba[i * 4 + 1] = 0;
      rgba[i * 4 + 2] = 255;
      rgba[i * 4 + 3] = 255;
    }
    // Paint a 6x6 red sprite block in the center
    for (let y = 5; y < 11; y++) {
      for (let x = 5; x < 11; x++) {
        const idx = (y * w + x) * 4;
        rgba[idx] = 220;
        rgba[idx + 1] = 38;
        rgba[idx + 2] = 38;
        rgba[idx + 3] = 255;
      }
    }

    const res = applyChromaKeyToPixels(rgba, w, h, { tolerance: 20 });
    expect(res.sampledColor).toEqual([255, 0, 255]);
    expect(res.removedCount).toBe(w * h - 36);
    // Corner pixel is transparent
    expect(rgba[3]).toBe(0);
    // Center sprite pixel remains opaque
    expect(rgba[(7 * w + 7) * 4 + 3]).toBe(255);
  });

  it('auto chroma-key skips already-transparent PNGs unless force=true', () => {
    const w = 10;
    const h = 10;
    const rgba = new Uint8ClampedArray(w * h * 4);
    // Half transparent, half white
    for (let i = 0; i < w * h; i++) {
      rgba[i * 4] = 255;
      rgba[i * 4 + 1] = 255;
      rgba[i * 4 + 2] = 255;
      rgba[i * 4 + 3] = i < 50 ? 0 : 255;
    }
    const res = applyChromaKeyToPixels(rgba, w, h, { tolerance: 20 });
    expect(res.removedCount).toBe(0);
  });

  it('detectSpriteFramesAuto finds non-uniform variable-size sprite frames in row-major order', () => {
    const w = 80;
    const h = 60;
    const rgba = new Uint8ClampedArray(w * h * 4);
    const paintBox = (bx: number, by: number, bw: number, bh: number) => {
      for (let y = by; y < by + bh; y++) {
        for (let x = bx; x < bx + bw; x++) {
          const idx = (y * w + x) * 4;
          rgba[idx] = 240;
          rgba[idx + 1] = 180;
          rgba[idx + 2] = 40;
          rgba[idx + 3] = 255;
        }
      }
    };

    // Row 0: two frames of different widths/heights
    paintBox(4, 5, 16, 20);
    paintBox(30, 3, 28, 22);
    // Row 1: one wide attack frame
    paintBox(10, 34, 42, 18);

    const boxes = detectSpriteFramesAuto(rgba, w, h, 12, 16);
    expect(boxes.length).toBe(3);
    expect(boxes[0]).toMatchObject({ x: 4, y: 5, w: 16, h: 20 });
    expect(boxes[1]).toMatchObject({ x: 30, y: 3, w: 28, h: 22 });
    expect(boxes[2]).toMatchObject({ x: 10, y: 34, w: 42, h: 18 });
  });

  it('resolveFrameSourceAndDestRect aligns variable-bbox atlas frames cleanly to foot pivotY', () => {
    const entry = defaultAssetManifestRegistry.spritesByKey['luffy_base'];
    expect(entry).toBeDefined();

    const meta: SpriteSheetMetaJson = {
      version: '1.0.0',
      mode: 'atlas',
      frameWidth: 48,
      frameHeight: 48,
      animations: {
        ATTACK_MELEE: {
          fps: 12,
          loop: false,
          frames: [
            { x: 0, y: 0, w: 32, h: 40, pivotX: 0.5, pivotY: 0.9 },
            { x: 40, y: 0, w: 68, h: 52, pivotX: 0.4, pivotY: 0.9 }
          ]
        }
      }
    };

    const r0 = resolveFrameSourceAndDestRect(
      entry,
      meta,
      'ATTACK_MELEE',
      3,
      0,
      48,
      48,
      1.5
    );
    const r1 = resolveFrameSourceAndDestRect(
      entry,
      meta,
      'ATTACK_MELEE',
      3,
      1,
      48,
      48,
      1.5
    );

    expect(r0.srcW).toBe(32);
    expect(r1.srcW).toBe(68);
    // Both frames place their foot pivot exactly at y = 0 in local foot-anchored coordinates
    expect(r0.destY + Math.round(r0.destH * 0.9)).toBe(0);
    expect(r1.destY + Math.round(r1.destH * 0.9)).toBe(0);
  });

  it('SmartSpriteSheetLoader prioritizes external PNG + .meta.json over procedural fallback', async () => {
    const entry = defaultAssetManifestRegistry.spritesByKey['luffy_base'];
    const fakeImg = { width: 288, height: 528 } as HTMLImageElement;
    const fakeMeta: SpriteSheetMetaJson = {
      version: '1.0.0',
      mode: 'atlas',
      chromaKey: { enabled: false },
      frameWidth: 48,
      frameHeight: 48,
      animations: {
        IDLE: {
          fps: 6,
          loop: true,
          frames: [{ x: 0, y: 0, w: 48, h: 48, pivotX: 0.5, pivotY: 0.9 }]
        }
      }
    };

    const loader = SmartSpriteSheetLoader.createWithCustomLoaders(
      async (src) => (src === entry.src ? fakeImg : null),
      async (metaSrc) =>
        metaSrc === entry.src.replace(/\.png$/, '.meta.json') ? fakeMeta : null
    );

    const resolved = await loader.resolveAsync(entry, () => null);
    expect(resolved.source).toBe('EXTERNAL_PNG');
    expect(resolved.sheet).toBe(fakeImg);
    expect(resolved.meta?.mode).toBe('atlas');
    expect(resolved.sheetFrameWidth).toBe(48);
  });

  it('pixelize-sprite CLI & pixelizePngBuffer convert a high-res PNG into a quantized 48x48 outlined pixel sprite', () => {
    // Generate a 128x128 synthetic raw PNG with bright green bg and a gradient red/gold circle inside
    const rawW = 128;
    const rawH = 128;
    const rgba = new Uint8ClampedArray(rawW * rawH * 4);
    for (let y = 0; y < rawH; y++) {
      for (let x = 0; x < rawW; x++) {
        const idx = (y * rawW + x) * 4;
        const dx = x - 64;
        const dy = y - 64;
        const dist = Math.hypot(dx, dy);
        if (dist <= 40) {
          rgba[idx] = Math.min(255, 190 + (x % 60));
          rgba[idx + 1] = Math.min(255, 40 + (y % 90));
          rgba[idx + 2] = 35;
          rgba[idx + 3] = 255;
        } else {
          // Solid green screen background
          rgba[idx] = 0;
          rgba[idx + 1] = 255;
          rgba[idx + 2] = 0;
          rgba[idx + 3] = 255;
        }
      }
    }

    const rawPng = encodePng(rawW, rawH, rgba);
    const out = pixelizePngBuffer(rawPng, {
      size: 48,
      colors: 24,
      outline: true
    });

    expect(out.width).toBe(48);
    expect(out.height).toBe(48);

    // Verify decoded output PNG is valid 48x48 with transparent corners, dark 1px outline, and quantized palette
    const decoded = decodePng(out.pngBuffer);
    expect(decoded.width).toBe(48);
    expect(decoded.height).toBe(48);
    expect(decoded.rgba[3]).toBe(0); // top-left background stripped

    const uniqueColors = new Set<string>();
    let darkOutlinePixels = 0;
    for (let i = 0; i < decoded.width * decoded.height; i++) {
      const a = decoded.rgba[i * 4 + 3];
      if (a > 0) {
        const r = decoded.rgba[i * 4];
        const g = decoded.rgba[i * 4 + 1];
        const b = decoded.rgba[i * 4 + 2];
        uniqueColors.add(`${r},${g},${b}`);
        if (r < 75 && g < 60 && b < 95) darkOutlinePixels += 1;
      }
    }
    expect(darkOutlinePixels).toBeGreaterThan(20);
    expect(uniqueColors.size).toBeGreaterThan(2);
    expect(uniqueColors.size).toBeLessThanOrEqual(48);

    // End-to-end CLI invocation on a temporary directory
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'opgv-pixelize-'));
    try {
      const inDir = path.join(tmpDir, 'in');
      const outDir = path.join(tmpDir, 'out');
      fs.mkdirSync(inDir, { recursive: true });
      const inFile = path.join(inDir, 'sample_raw.png');
      const outFile = path.join(outDir, 'sample_raw.png');
      fs.writeFileSync(inFile, rawPng);
      const cliOut = execFileSync(
        process.execPath,
        [
          path.resolve(process.cwd(), 'scripts/pixelize-sprite.mjs'),
          '--input',
          inDir,
          '--out',
          outDir,
          '--size',
          '48',
          '--colors',
          '24'
        ],
        { encoding: 'utf8' }
      );
      expect(cliOut).toContain('48x48');
      expect(fs.existsSync(outFile)).toBe(true);
      const cliDecoded = decodePng(fs.readFileSync(outFile));
      expect(cliDecoded.width).toBe(48);
      expect(cliDecoded.height).toBe(48);
    } finally {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('character_blueprints.json covers all 10 Straw Hats + major bosses & forms with high-res baked sizes', () => {
    const requiredUnits = [
      'luffy',
      'zoro',
      'nami',
      'usopp',
      'sanji',
      'chopper',
      'robin',
      'franky',
      'brook',
      'jinbe',
      'law',
      'lucci',
      'kaido',
      'kizaru',
      'doflamingo',
      'katakuri',
      'blackbeard',
      'marco',
      'saturn',
      'loki'
    ];
    const blueprintIds = new Set(getAllCharacterBlueprintIds());
    for (const id of requiredUnits) {
      expect(blueprintIds.has(id), `Missing blueprint for unit ${id}`).toBe(true);
    }

    // Check Gear 5 & Kaido Beast form blueprint overrides
    const g5 = resolveCharacterBlueprint(
      { id: 'luffy' } as UnitDefinition,
      'form_luffy_gear5'
    );
    expect(g5.hairStyle).toBe('nika_flame');
    expect(g5.hagoromoColor).toBe('white');

    const kaidoDragon = resolveCharacterBlueprint(
      { id: 'kaido' } as UnitDefinition,
      'form_kaido_beast'
    );
    expect(kaidoDragon.bodyType).toBe('serpent_dragon');

    // Check hue-shifting cel shading & upgraded baking resolutions (keeping sprites.json 32/48/96 intact)
    const baseHex = '#dc2626';
    const hi = shadeHueShift(baseHex, 1);
    const sh = shadeHueShift(baseHex, -1);
    const deep = shadeHueShift(baseHex, -2);
    expect(hi).not.toBe(baseHex);
    expect(sh).not.toBe(baseHex);
    expect(deep).not.toBe(sh);

    expect(resolveBakedFrameSize(32)).toBe(48);
    expect(resolveBakedFrameSize(48)).toBe(64);
    expect(resolveBakedFrameSize(96)).toBe(112);
  });
});
