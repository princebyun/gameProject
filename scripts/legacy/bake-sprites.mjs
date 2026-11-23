import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';
import {
  bakeCharacterSpriteSheetPixels,
  bakeShipSpriteSheetPixels
} from '../../src/render/sprite/rig/articulatedPixelRigBaker.ts';
import {
  CHARACTER_BLUEPRINT_ENTRIES,
  buildCharacterBlueprintsFile,
  getBaseCharacterBlueprintForUnit,
  getCharacterBlueprintByKey
} from '../../src/render/sprite/rig/blueprintLibrary.ts';
import { bakeCharacterPortraitPixels } from '../../src/render/sprite/rig/portraitPixelBaker.ts';
import {
  ALL_PORTRAIT_EMOTIONS,
  createStandardRigAnimations
} from '../../src/render/sprite/rig/rigTypes.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '../..');

console.warn('⚠️ [LEGACY] bake-sprites.mjs is deprecated. Use `npm run import:pro` for the PixiJS v8 pipeline.');

function makeCrcTable() {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
}

const CRC_TABLE = makeCrcTable();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function makePngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcInput = Buffer.concat([typeBuf, data]);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(crcInput), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
}

function encodeRgbaToPng(width, height, rgba) {
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // 8-bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);
  for (let y = 0; y < height; y++) {
    const rowStart = y * (stride + 1);
    raw[rowStart] = 0; // Filter type 0 (None)
    Buffer.from(rgba.buffer, rgba.byteOffset + y * stride, stride).copy(
      raw,
      rowStart + 1
    );
  }

  const compressed = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    signature,
    makePngChunk('IHDR', ihdr),
    makePngChunk('IDAT', compressed),
    makePngChunk('IEND', Buffer.alloc(0))
  ]);
}

function parseCliArgs(argv) {
  let group = null;
  let only = null;
  let force = false;
  for (const arg of argv) {
    if (arg.startsWith('--group=')) {
      group = arg.slice('--group='.length).trim();
    } else if (arg.startsWith('--only=')) {
      only = arg.slice('--only='.length).trim();
    } else if (arg === '--force') {
      force = true;
    }
  }
  return { group, only, force };
}

function main() {
  const { group, only, force } = parseCliArgs(process.argv.slice(2));

  // 1. Always write canonical character_blueprints.json
  const blueprintsFile = buildCharacterBlueprintsFile();
  const blueprintsPath = path.join(
    ROOT,
    'src/data/assets/character_blueprints.json'
  );
  fs.writeFileSync(
    blueprintsPath,
    `${JSON.stringify(blueprintsFile, null, 2)}\n`,
    'utf-8'
  );

  const spritesDir = path.join(ROOT, 'public/assets/sprites');
  const portraitsDir = path.join(ROOT, 'public/assets/portraits');
  fs.mkdirSync(spritesDir, { recursive: true });
  fs.mkdirSync(portraitsDir, { recursive: true });

  // 2. Filter target blueprints
  const targets = CHARACTER_BLUEPRINT_ENTRIES.filter((bp) => {
    if (group && bp.group !== group) return false;
    if (only && bp.key !== only && bp.unitId !== only) return false;
    return true;
  });

  let bakedSheetsCount = 0;
  let skippedCustomCount = 0;
  let bakedPortraitsCount = 0;
  const touchedUnits = new Set();

  for (const bp of targets) {
    const pngPath = path.join(spritesDir, `${bp.key}.png`);
    const metaPath = path.join(spritesDir, `${bp.key}.meta.json`);

    if (!force && fs.existsSync(metaPath) && fs.existsSync(pngPath)) {
      try {
        const existingMeta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
        if (existingMeta.source === 'USER_CUSTOM_SHEET') {
          skippedCustomCount += 1;
          continue;
        }
      } catch {
        // Proceed with re-baking if meta JSON is malformed
      }
    }

    const { width, height, data } = bakeCharacterSpriteSheetPixels(bp);
    const pngBuf = encodeRgbaToPng(width, height, data);
    fs.writeFileSync(pngPath, pngBuf);

    const sha256 = crypto.createHash('sha256').update(pngBuf).digest('hex');
    const animations = createStandardRigAnimations();
    const meta = {
      key: bp.key,
      unitId: bp.unitId,
      formId: bp.formId,
      rigType: bp.rigType,
      frameWidth: bp.frameWidth,
      frameHeight: bp.frameHeight,
      sheetWidth: width,
      sheetHeight: height,
      anchor: bp.anchor,
      source: 'PROCEDURAL_RIG_BAKED',
      sha256,
      bakedAt: new Date().toISOString(),
      animations
    };
    fs.writeFileSync(metaPath, `${JSON.stringify(meta, null, 2)}\n`, 'utf-8');
    bakedSheetsCount += 1;
    touchedUnits.add(bp.unitId);
  }

  // 3. Bake 64x64 8-emotion pixel portraits for all touched units
  for (const unitId of touchedUnits) {
    const baseBp = getBaseCharacterBlueprintForUnit(unitId);
    if (!baseBp) continue;
    for (const emotion of ALL_PORTRAIT_EMOTIONS) {
      const { width, height, data } = bakeCharacterPortraitPixels(
        baseBp,
        emotion
      );
      const pngBuf = encodeRgbaToPng(width, height, data);
      const outPath = path.join(portraitsDir, `${unitId}_${emotion}.png`);
      fs.writeFileSync(outPath, pngBuf);
      bakedPortraitsCount += 1;
    }
  }

  // 4. Sync src/data/assets/sprites.json & bake 4 ship sheets if applicable
  const spritesJsonPath = path.join(ROOT, 'src/data/assets/sprites.json');
  const spritesManifest = JSON.parse(fs.readFileSync(spritesJsonPath, 'utf-8'));
  const standardAnims = createStandardRigAnimations();

  let bakedShipsCount = 0;
  for (const entry of spritesManifest.entries) {
    const bp = getCharacterBlueprintByKey(entry.key);
    if (bp) {
      entry.frameWidth = bp.frameWidth;
      entry.frameHeight = bp.frameHeight;
      entry.anchor = { x: bp.anchor.x, y: bp.anchor.y };
      entry.rigType = bp.rigType;
      entry.animations = standardAnims;
    } else if (entry.shipId) {
      entry.animations = standardAnims;
      const shouldBakeShip =
        (!group && !only) || only === entry.key || only === entry.shipId;
      if (shouldBakeShip) {
        const { width, height, data } = bakeShipSpriteSheetPixels(
          entry.shipId,
          entry.frameWidth,
          entry.frameHeight
        );
        const pngBuf = encodeRgbaToPng(width, height, data);
        const shipPngPath = path.join(spritesDir, `${entry.key}.png`);
        const shipMetaPath = path.join(spritesDir, `${entry.key}.meta.json`);
        fs.writeFileSync(shipPngPath, pngBuf);
        const sha256 = crypto.createHash('sha256').update(pngBuf).digest('hex');
        fs.writeFileSync(
          shipMetaPath,
          `${JSON.stringify(
            {
              key: entry.key,
              unitId: entry.shipId,
              formId: 'ship',
              rigType: 'giant_beast',
              frameWidth: entry.frameWidth,
              frameHeight: entry.frameHeight,
              sheetWidth: width,
              sheetHeight: height,
              anchor: entry.anchor,
              source: 'PROCEDURAL_RIG_BAKED',
              sha256,
              bakedAt: new Date().toISOString(),
              animations: standardAnims
            },
            null,
            2
          )}\n`,
          'utf-8'
        );
        bakedShipsCount += 1;
      }
    }
  }

  // Ensure any blueprint entry missing from sprites.json is appended
  const existingKeys = new Set(spritesManifest.entries.map((e) => e.key));
  for (const bp of CHARACTER_BLUEPRINT_ENTRIES) {
    if (!existingKeys.has(bp.key)) {
      spritesManifest.entries.push({
        key: bp.key,
        unitId: bp.unitId,
        formId: bp.formId,
        src: `assets/sprites/${bp.key}.png`,
        frameWidth: bp.frameWidth,
        frameHeight: bp.frameHeight,
        anchor: { x: bp.anchor.x, y: bp.anchor.y },
        rigType: bp.rigType,
        animations: standardAnims
      });
    }
  }

  fs.writeFileSync(
    spritesJsonPath,
    `${JSON.stringify(spritesManifest, null, 2)}\n`,
    'utf-8'
  );

  console.log(
    `✅ Articulated Pixel Rig Baker completed: ${bakedSheetsCount} character sheets, ${bakedShipsCount} ship sheets, ${bakedPortraitsCount} portraits (skipped USER_CUSTOM_SHEET: ${skippedCustomCount})`
  );
}

main();
