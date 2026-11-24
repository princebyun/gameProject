import fs from 'node:fs';
import path from 'node:path';
import {
  encodeLosslessWebpBuffer,
  getImageMetadata,
  REGULAR_ATLAS_MAX_DIM,
  validateAtlasResolution
} from '../optimize-pro-assets.mjs';

export const WAVE5_SHIP_KEYS = [
  'ship_going_merry',
  'ship_thousand_sunny',
  'ship_marine_warship',
  'ship_sea_king'
];

export const WAVE5_SEA_SHIP_MANIFEST_IDS = WAVE5_SHIP_KEYS.map((k) => `sea:${k}`);

export const WAVE5_SEA_ZONE_ANCHOR_LANDMARKS = new Set([
  'foosha_shells',
  'drum_kingdom',
  'fishman_island'
]);

async function promoteImageToLosslessWebp(srcPath, destWebpPath, metaLabel, isGiant = false) {
  const srcBuf = fs.readFileSync(srcPath);
  const srcLower = srcPath.toLowerCase();
  const outBuf = srcLower.endsWith('.webp') ? srcBuf : await encodeLosslessWebpBuffer(srcBuf);
  const dims = await getImageMetadata(outBuf);
  const maxAllowed = isGiant ? 2048 : REGULAR_ATLAS_MAX_DIM;
  validateAtlasResolution(
    { id: metaLabel, category: 'sprite', isGiant },
    dims
  );
  if (dims.width > maxAllowed || dims.height > maxAllowed) {
    throw new Error(`Wave 5 sea asset exceeds ${maxAllowed}px cap: ${metaLabel}`);
  }
  fs.mkdirSync(path.dirname(destWebpPath), { recursive: true });
  fs.writeFileSync(destWebpPath, outBuf);
  return dims;
}

/**
 * Promotes all 20 sea worldmap landmarks and 4 ships into lossless `.webp`
 * under `public/assets/pro/landmarks/` and `public/assets/pro/sprites/`.
 * Priority: `raw_assets/packs/{landmarks,ships}/` override -> existing external PNG sheets.
 * Never invokes procedural shape/pixel bakers.
 */
export async function promoteWave5SeaAssets(rootDir) {
  const landmarksFile = JSON.parse(
    fs.readFileSync(path.join(rootDir, 'src/data/assets/landmarks.json'), 'utf-8')
  );
  const packLandmarksDir = path.join(rootDir, 'raw_assets/packs/landmarks');
  const outLandmarksDir = path.join(rootDir, 'public/assets/pro/landmarks');
  fs.mkdirSync(outLandmarksDir, { recursive: true });

  let landmarkCount = 0;
  for (const lm of landmarksFile.landmarks ?? []) {
    const packWebp = path.join(packLandmarksDir, `${lm.id}.webp`);
    const packPng = path.join(packLandmarksDir, `${lm.id}.png`);
    const extPng = path.join(rootDir, 'public', lm.path);

    const chosenSrc = fs.existsSync(packWebp)
      ? packWebp
      : fs.existsSync(packPng)
        ? packPng
        : fs.existsSync(extPng)
          ? extPng
          : null;
    if (!chosenSrc) continue;

    const destWebp = path.join(outLandmarksDir, `${lm.id}.webp`);
    const legacyPng = path.join(outLandmarksDir, `${lm.id}.png`);
    if (fs.existsSync(legacyPng)) fs.unlinkSync(legacyPng);

    await promoteImageToLosslessWebp(chosenSrc, destWebp, `sea:landmark_${lm.id}`);
    landmarkCount += 1;
  }

  const packShipsDir = path.join(rootDir, 'raw_assets/packs/ships');
  const outSpritesDir = path.join(rootDir, 'public/assets/pro/sprites');
  fs.mkdirSync(outSpritesDir, { recursive: true });

  let shipCount = 0;
  for (const key of WAVE5_SHIP_KEYS) {
    const packWebp = path.join(packShipsDir, `${key}.webp`);
    const packPng = path.join(packShipsDir, `${key}.png`);
    const extPng = path.join(rootDir, 'public/assets/sprites', `${key}.png`);

    const chosenImg = fs.existsSync(packWebp)
      ? packWebp
      : fs.existsSync(packPng)
        ? packPng
        : fs.existsSync(extPng)
          ? extPng
          : null;
    if (!chosenImg) continue;

    const destWebp = path.join(outSpritesDir, `${key}.webp`);
    const legacyPng = path.join(outSpritesDir, `${key}.png`);
    if (fs.existsSync(legacyPng)) fs.unlinkSync(legacyPng);

    const dims = await promoteImageToLosslessWebp(
      chosenImg,
      destWebp,
      `sea:${key}`,
      key === 'ship_sea_king'
    );

    const packJson = path.join(packShipsDir, `${key}.json`);
    const packMeta = path.join(packShipsDir, `${key}.meta.json`);
    const extMeta = path.join(rootDir, 'public/assets/sprites', `${key}.meta.json`);
    const chosenMetaPath = fs.existsSync(packJson)
      ? packJson
      : fs.existsSync(packMeta)
        ? packMeta
        : fs.existsSync(extMeta)
          ? extMeta
          : null;
    if (!chosenMetaPath) continue;

    const rawMeta = JSON.parse(fs.readFileSync(chosenMetaPath, 'utf-8'));
    const anchor = rawMeta.anchor ?? rawMeta.meta?.anchor ?? { x: 0.5, y: 0.55 };
    const proAtlasJson = {
      ...rawMeta,
      key,
      image: `${key}.webp`,
      sheetWidth: dims.width,
      sheetHeight: dims.height,
      anchor,
      referenceIdleHeight: rawMeta.frameHeight ?? 48,
      meta: {
        ...(rawMeta.meta ?? {}),
        image: `${key}.webp`,
        size: { w: dims.width, h: dims.height },
        anchor,
        referenceIdleHeight: rawMeta.frameHeight ?? 48
      }
    };
    fs.writeFileSync(
      path.join(outSpritesDir, `${key}.json`),
      `${JSON.stringify(proAtlasJson, null, 2)}\n`,
      'utf-8'
    );
    shipCount += 1;
  }

  return { landmarkCount, shipCount };
}
