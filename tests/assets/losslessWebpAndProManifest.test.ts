import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  defaultProAssetManifest,
  getManifestEntriesByBundle,
  getProManifestStatusSummary
} from '../../src/data/assets/proAssetManifest';
import { encodePng } from '../../scripts/lib/pngCodec.mjs';
import {
  decodeImageToRgba,
  encodeLosslessWebpBuffer,
  optimizeProAssetsPipeline,
  validateAtlasResolution
} from '../../scripts/optimize-pro-assets.mjs';
import {
  validateProManifest,
  verifyManifestEntries
} from '../../scripts/pro-manifest-cli.mjs';

describe('Step 1: Lossless WebP Pipeline & pro_manifest.json SSOT', () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    while (tempDirs.length > 0) {
      const dir = tempDirs.pop();
      if (dir && fs.existsSync(dir)) {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    }
  });

  it('guarantees 100% bit-exact RGBA pixel preservation (0 error) after lossless WebP conversion', async () => {
    const w = 48;
    const h = 48;
    const rgba = new Uint8ClampedArray(w * h * 4);

    // Paint transparent (0,0,0,0) background + 1px dark outline + multi-tone pixel shading + semi-transparent edge glow
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const inBox = x >= 8 && x <= 39 && y >= 6 && y <= 43;
        if (!inBox) continue;

        const isOutline = x === 8 || x === 39 || y === 6 || y === 43;
        if (isOutline) {
          rgba[i] = 14;
          rgba[i + 1] = 18;
          rgba[i + 2] = 32;
          rgba[i + 3] = 255;
        } else if (x === 9 || y === 7) {
          // Semi-transparent anti-aliased inner rim test
          rgba[i] = 250;
          rgba[i + 1] = 204;
          rgba[i + 2] = 21;
          rgba[i + 3] = 192;
        } else {
          rgba[i] = (x * 7) & 0xff;
          rgba[i + 1] = (y * 9) & 0xff;
          rgba[i + 2] = ((x + y) * 5) & 0xff;
          rgba[i + 3] = 255;
        }
      }
    }

    const pngBuf = encodePng(w, h, rgba);
    const webpBuf = await encodeLosslessWebpBuffer(pngBuf);

    const decodedOrig = await decodeImageToRgba(pngBuf);
    const decodedWebp = await decodeImageToRgba(webpBuf);

    expect(decodedWebp.width).toBe(w);
    expect(decodedWebp.height).toBe(h);
    expect(decodedWebp.channels).toBe(4);
    expect(decodedWebp.data.length).toBe(decodedOrig.data.length);

    let maxChannelDiff = 0;
    let diffPixels = 0;
    for (let i = 0; i < decodedOrig.data.length; i += 4) {
      const dr = Math.abs((decodedOrig.data[i] ?? 0) - (decodedWebp.data[i] ?? 0));
      const dg = Math.abs((decodedOrig.data[i + 1] ?? 0) - (decodedWebp.data[i + 1] ?? 0));
      const db = Math.abs((decodedOrig.data[i + 2] ?? 0) - (decodedWebp.data[i + 2] ?? 0));
      const da = Math.abs((decodedOrig.data[i + 3] ?? 0) - (decodedWebp.data[i + 3] ?? 0));
      const d = Math.max(dr, dg, db, da);
      if (d > 0) diffPixels += 1;
      if (d > maxChannelDiff) maxChannelDiff = d;
    }

    expect(diffPixels).toBe(0);
    expect(maxChannelDiff).toBe(0);
    expect(Buffer.compare(decodedOrig.data, decodedWebp.data)).toBe(0);
  });

  it('enforces 1024x1024 cap on regular atlases and 2048x2048 cap on giant bosses & tilesets', () => {
    expect(() =>
      validateAtlasResolution({ id: 'sprite:test', category: 'sprite', isGiant: false }, { width: 1024, height: 1024 })
    ).not.toThrow();

    expect(() =>
      validateAtlasResolution({ id: 'sprite:oversized', category: 'sprite', isGiant: false }, { width: 1025, height: 512 })
    ).toThrow(/ATLAS_MAX_RESOLUTION_EXCEEDED/);

    expect(() =>
      validateAtlasResolution({ id: 'vfx:oversized', category: 'vfx', isGiant: false }, { width: 512, height: 1025 })
    ).toThrow(/ATLAS_MAX_RESOLUTION_EXCEEDED/);

    expect(() =>
      validateAtlasResolution({ id: 'sprite:kaido_beast', category: 'sprite', isGiant: true }, { width: 2048, height: 2048 })
    ).not.toThrow();

    expect(() =>
      validateAtlasResolution({ id: 'tileset:master_port_village', category: 'tileset', isGiant: false }, { width: 2048, height: 1536 })
    ).not.toThrow();

    expect(() =>
      validateAtlasResolution({ id: 'tileset:too_big', category: 'tileset', isGiant: false }, { width: 2049, height: 1024 })
    ).toThrow(/GIANT_OR_TILESET_MAX_RESOLUTION_EXCEEDED/);
  });

  it('converts PNGs to .webp, removes redundant PNGs, and auto-syncs Aseprite JSON, .meta.json, .tsx & .tmj', async () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opgv-webp-sync-'));
    tempDirs.push(tmpRoot);

    const spritesDir = path.join(tmpRoot, 'public/assets/pro/sprites');
    const tilesDir = path.join(tmpRoot, 'public/assets/pro/tilesets');
    const mapsDir = path.join(tmpRoot, 'public/assets/pro/maps');
    fs.mkdirSync(spritesDir, { recursive: true });
    fs.mkdirSync(tilesDir, { recursive: true });
    fs.mkdirSync(mapsDir, { recursive: true });

    // Create noisy 256x256 pixel image (>1KB) so WebP is strictly adopted & PNG deleted
    const w = 256;
    const h = 256;
    const rgba = new Uint8ClampedArray(w * h * 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        rgba[i] = (x * 13 + y * 7) % 255;
        rgba[i + 1] = (x * 5 + y * 19) % 255;
        rgba[i + 2] = (x * 23 + y * 3) % 255;
        rgba[i + 3] = (x + y) % 5 === 0 ? 0 : 255;
      }
    }
    const bigPng = encodePng(w, h, rgba);
    fs.writeFileSync(path.join(spritesDir, 'nami_base.png'), bigPng);
    fs.writeFileSync(path.join(tilesDir, 'master_port.png'), bigPng);

    fs.writeFileSync(
      path.join(spritesDir, 'nami_base.json'),
      JSON.stringify({ frames: {}, meta: { image: 'nami_base.png' } }, null, 2)
    );
    fs.writeFileSync(
      path.join(spritesDir, 'nami_base.meta.json'),
      JSON.stringify({ image: 'nami_base.png', animations: {} }, null, 2)
    );
    fs.writeFileSync(
      path.join(tilesDir, 'master_port.tsx'),
      `<?xml version="1.0" encoding="UTF-8"?>\n<tileset name="master_port" tilewidth="16" tileheight="16" tilecount="256" columns="16">\n <image source="master_port.png" width="256" height="256"/>\n</tileset>\n`
    );
    fs.writeFileSync(
      path.join(mapsDir, 'test_map.tmj'),
      JSON.stringify({
        width: 4,
        height: 4,
        tilewidth: 16,
        tileheight: 16,
        tilesets: [
          {
            firstgid: 1,
            source: '../tilesets/master_port.tsx',
            image: 'assets/pro/tilesets/master_port.png'
          }
        ],
        layers: []
      })
    );

    const res = await optimizeProAssetsPipeline({ rootDir: tmpRoot });
    expect(res.convertedCount).toBe(2);
    expect(res.deletedDuplicatePngCount).toBe(2);

    // Redundant PNGs removed from public/, originals preserved under raw_assets/
    expect(fs.existsSync(path.join(spritesDir, 'nami_base.png'))).toBe(false);
    expect(fs.existsSync(path.join(spritesDir, 'nami_base.webp'))).toBe(true);
    expect(fs.existsSync(path.join(tmpRoot, 'raw_assets/pro_originals/sprites/nami_base.png'))).toBe(true);

    // Linked metadata updated to .webp
    const updatedAse = JSON.parse(fs.readFileSync(path.join(spritesDir, 'nami_base.json'), 'utf8'));
    expect(updatedAse.meta.image).toBe('nami_base.webp');
    const updatedMeta = JSON.parse(fs.readFileSync(path.join(spritesDir, 'nami_base.meta.json'), 'utf8'));
    expect(updatedMeta.image).toBe('nami_base.webp');
    const updatedTsx = fs.readFileSync(path.join(tilesDir, 'master_port.tsx'), 'utf8');
    expect(updatedTsx).toContain('source="master_port.webp"');
    const updatedTmj = JSON.parse(fs.readFileSync(path.join(mapsDir, 'test_map.tmj'), 'utf8'));
    expect(updatedTmj.tilesets[0].image).toBe('assets/pro/tilesets/master_port.webp');
  });

  it('validates repository pro_manifest.json SSOT and rejects verifying PLACEHOLDER entries', async () => {
    const { errors } = await validateProManifest(process.cwd());
    expect(errors).toEqual([]);

    const summary = getProManifestStatusSummary(defaultProAssetManifest);
    expect(summary.total).toBeGreaterThanOrEqual(150);
    expect(summary.imported + summary.verified).toBeGreaterThanOrEqual(60);
    expect(summary.placeholder).toBeGreaterThanOrEqual(80);

    const bundles = getManifestEntriesByBundle(defaultProAssetManifest);
    expect(bundles.has('core_always')).toBe(true);
    expect(bundles.has('sea_east_blue')).toBe(true);
    expect(bundles.has('island_foosha_village')).toBe(true);
    expect(bundles.has('battle_east_blue_harbor')).toBe(true);

    // Reject PLACEHOLDER promotion
    await expect(
      verifyManifestEntries(process.cwd(), ['sprite:morgan_base'])
    ).rejects.toThrow(/Cannot verify PLACEHOLDER/);
  });
});
