import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { blit, createImage, encodeImageToPng } from '../lib/pngCodec.mjs';
import { paintEastAndGrandLandmarkFrame } from '../lib/landmarkPaintersEastAndGrand.mjs';
import { paintNewWorldLandmarkFrame } from '../lib/landmarkPaintersNewWorld.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '../..');

console.warn('⚠️ [LEGACY] bake-landmarks.mjs is deprecated. Use Tiled (.tmj) & external assets for the PixiJS v8 pipeline.');

function bakeLandmarkSheet(entry) {
  const { id, frameWidth, frameHeight, frameCount } = entry;
  const sheet = createImage(frameWidth * frameCount, frameHeight);
  for (let f = 0; f < frameCount; f++) {
    const frameImg =
      paintEastAndGrandLandmarkFrame(id, frameWidth, frameHeight, f) ??
      paintNewWorldLandmarkFrame(id, frameWidth, frameHeight, f);
    if (!frameImg) {
      throw new Error(`No landmark painter implemented for id="${id}"`);
    }
    blit(sheet, frameImg, 0, 0, frameWidth, frameHeight, f * frameWidth, 0, {
      alphaBlend: false
    });
  }
  return sheet;
}

function main() {
  const manifestPath = path.join(ROOT, 'src/data/assets/landmarks.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));
  const entries = manifest.landmarks ?? [];
  let bakedCount = 0;

  for (const entry of entries) {
    const outPath = path.join(ROOT, 'public', entry.path);
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    const sheet = bakeLandmarkSheet(entry);
    const png = encodeImageToPng(sheet);
    fs.writeFileSync(outPath, png);
    bakedCount += 1;
  }

  console.log(`✅ Baked ${bakedCount} world landmark sprite sheets into public/assets/world/landmarks/`);
}

main();
