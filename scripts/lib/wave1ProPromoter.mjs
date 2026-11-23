import fs from 'node:fs';
import path from 'node:path';
import {
  blit,
  createImage,
  decodePng,
  encodeImageToPng
} from './pngCodec.mjs';
import { decodeImageToRgba, REGULAR_ATLAS_MAX_DIM } from '../optimize-pro-assets.mjs';

const STANDARD_STATES = [
  'IDLE',
  'MOVE',
  'WINDUP',
  'ATTACK_MELEE',
  'ATTACK_CAST',
  'CLASH',
  'DODGE',
  'HIT',
  'DOWNED',
  'TRANSFORM',
  'VICTORY'
];

export const WAVE1_PPU_SPECS = Object.freeze({
  luffy: { ppuScale: 1.0, targetDisplayHeight: 108 },
  zoro: { ppuScale: 1.05, targetDisplayHeight: 113 },
  sanji: { ppuScale: 1.05, targetDisplayHeight: 113 },
  nami: { ppuScale: 0.95, targetDisplayHeight: 103 },
  morgan: { ppuScale: 1.24, targetDisplayHeight: 134 },
  buggy: { ppuScale: 1.05, targetDisplayHeight: 113 },
  arlong: { ppuScale: 1.28, targetDisplayHeight: 138 }
});

function medianNum(vals, fallback) {
  if (vals.length === 0) return fallback;
  const sorted = [...vals].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length * 0.5)] ?? fallback;
}

/**
 * TorsoWeightedPivotSolver (mirrors src/assets/slicer/rowClassifierAndPivot.ts):
 * Anchors feet on bottom opaque row and keeps stretched attacks locked on torso core.
 */
export function solveTorsoWeightedPivot(data, imgW, frame, idleMedianW) {
  const rowOpaque = new Uint16Array(frame.h);
  let lowestFallbackY = frame.h - 1;
  const lowerStartY = Math.floor(frame.h * 0.6);

  for (let ly = 0; ly < frame.h; ly++) {
    let hits = 0;
    const gy = frame.y + ly;
    for (let lx = 0; lx < frame.w; lx++) {
      const a = data[(gy * imgW + (frame.x + lx)) * 4 + 3] ?? 0;
      if (a >= 16) hits += 1;
    }
    rowOpaque[ly] = hits;
    if (hits > 0) lowestFallbackY = ly;
  }

  let pivotY = lowestFallbackY;
  for (let ly = frame.h - 1; ly >= lowerStartY; ly--) {
    if ((rowOpaque[ly] ?? 0) >= 2 && (ly === 0 || (rowOpaque[ly - 1] ?? 0) >= 2)) {
      pivotY = ly;
      break;
    }
  }

  let pivotX = Math.round(frame.w * 0.5);
  const isStretchedFrame = frame.w > idleMedianW * 1.2;

  if (!isStretchedFrame) {
    const bandY0 = Math.floor(frame.h * 0.35);
    const bandY1 = Math.min(frame.h - 1, Math.floor(frame.h * 0.85));
    let wSum = 0;
    let totalW = 0;
    for (let ly = bandY0; ly <= bandY1; ly++) {
      const gy = frame.y + ly;
      for (let lx = 0; lx < frame.w; lx++) {
        const a = data[(gy * imgW + (frame.x + lx)) * 4 + 3] ?? 0;
        if (a >= 16) {
          wSum += lx * a;
          totalW += a;
        }
      }
    }
    if (totalW === 0) {
      for (let ly = 0; ly < frame.h; ly++) {
        const gy = frame.y + ly;
        for (let lx = 0; lx < frame.w; lx++) {
          const a = data[(gy * imgW + (frame.x + lx)) * 4 + 3] ?? 0;
          if (a >= 16) {
            wSum += lx * a;
            totalW += a;
          }
        }
      }
    }
    if (totalW > 0) pivotX = Math.round(wSum / totalW);
  } else {
    const colScore = new Float64Array(frame.w);
    const torsoStartY = Math.floor(frame.h * 0.18);
    const legStartY = Math.floor(frame.h * 0.54);

    for (let lx = 0; lx < frame.w; lx++) {
      let colHeight = 0;
      let weightedSum = 0;
      const gx = frame.x + lx;
      for (let ly = torsoStartY; ly <= pivotY; ly++) {
        const a = data[((frame.y + ly) * imgW + gx) * 4 + 3] ?? 0;
        if (a >= 16) {
          colHeight += 1;
          weightedSum += ly >= legStartY ? 1.6 : 0.9;
        }
      }
      const spanRatio = colHeight / Math.max(1, pivotY - torsoStartY + 1);
      colScore[lx] = weightedSum * (0.35 + spanRatio * spanRatio);
    }

    const coreW = Math.max(8, Math.min(frame.w, Math.round(idleMedianW * 0.6)));
    let bestStart = 0;
    let bestWindowScore = -1;
    for (let sx = 0; sx <= frame.w - coreW; sx++) {
      let win = 0;
      for (let k = 0; k < coreW; k++) win += colScore[sx + k] ?? 0;
      if (win > bestWindowScore) {
        bestWindowScore = win;
        bestStart = sx;
      }
    }

    let cSum = 0;
    let cWeight = 0;
    for (let lx = bestStart; lx < bestStart + coreW; lx++) {
      const s = colScore[lx] ?? 0;
      cSum += lx * s;
      cWeight += s;
    }
    if (cWeight > 0) pivotX = Math.round(cSum / cWeight);
  }

  return {
    pivotX: Math.max(0, Math.min(frame.w - 1, pivotX)),
    pivotY: Math.max(0, Math.min(frame.h - 1, pivotY))
  };
}

function drawOverlayPixel(img, x, y, rgba) {
  if (x < 0 || x >= img.width || y < 0 || y >= img.height) return;
  const i = (y * img.width + x) * 4;
  img.data[i] = rgba[0];
  img.data[i + 1] = rgba[1];
  img.data[i + 2] = rgba[2];
  img.data[i + 3] = rgba[3];
}

function writeDebugOverlayFromAtlas(imgData, imgW, imgH, framesObj, outPath) {
  const dbg = createImage(imgW, imgH);
  for (let i = 0; i < dbg.data.length; i++) {
    dbg.data[i] = imgData[i] ?? 0;
  }
  const green = [34, 197, 94, 220];
  const red = [239, 68, 68, 255];
  const cyan = [56, 189, 248, 255];

  for (const entry of Object.values(framesObj)) {
    const f = entry.frame;
    if (!f) continue;
    for (let x = f.x; x < f.x + f.w; x++) {
      drawOverlayPixel(dbg, x, f.y, green);
      drawOverlayPixel(dbg, x, f.y + f.h - 1, green);
    }
    for (let y = f.y; y < f.y + f.h; y++) {
      drawOverlayPixel(dbg, f.x, y, green);
      drawOverlayPixel(dbg, f.x + f.w - 1, y, green);
    }
    const px = f.x + Math.round((entry.pivot?.x ?? 0.5) * f.w);
    const py = f.y + Math.round((entry.pivot?.y ?? 0.9) * f.h);
    for (let x = f.x; x < f.x + f.w; x++) {
      drawOverlayPixel(dbg, x, py, red);
    }
    for (let d = -4; d <= 4; d++) {
      drawOverlayPixel(dbg, px + d, py, cyan);
      drawOverlayPixel(dbg, px, py + d, cyan);
    }
  }

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, encodeImageToPng(dbg));
}

function findCellTightBounds(sheetImg, cellX, cellY, cellW, cellH) {
  let minX = cellW;
  let minY = cellH;
  let maxX = -1;
  let maxY = -1;
  for (let ly = 0; ly < cellH; ly++) {
    const gy = cellY + ly;
    if (gy >= sheetImg.height) break;
    for (let lx = 0; lx < cellW; lx++) {
      const gx = cellX + lx;
      if (gx >= sheetImg.width) break;
      const a = sheetImg.data[(gy * sheetImg.width + gx) * 4 + 3] ?? 0;
      if (a >= 16) {
        if (lx < minX) minX = lx;
        if (lx > maxX) maxX = lx;
        if (ly < minY) minY = ly;
        if (ly > maxY) maxY = ly;
      }
    }
  }
  if (maxX < minX || maxY < minY) return null;
  return {
    x: cellX + minX,
    y: cellY + minY,
    w: maxX - minX + 1,
    h: maxY - minY + 1
  };
}

/**
 * Tight-packs an external 96x96 NDS grid sheet (`source === EXTERNAL_WEB_SHEET`)
 * into an Aseprite JSON Hash atlas <= 1024x1024 with TorsoWeightedPivotSolver pivots.
 */
export function promoteExternalGridSheetToPro(rootDir, key, unitId) {
  const stdPngPath = path.join(rootDir, 'public/assets/sprites', `${key}.png`);
  const stdMetaPath = path.join(rootDir, 'public/assets/sprites', `${key}.meta.json`);
  if (!fs.existsSync(stdPngPath) || !fs.existsSync(stdMetaPath)) return null;

  const stdMeta = JSON.parse(fs.readFileSync(stdMetaPath, 'utf-8'));
  if (stdMeta.source !== 'EXTERNAL_WEB_SHEET') {
    return null;
  }

  const sheetImg = decodePng(fs.readFileSync(stdPngPath));
  const fw = stdMeta.frameWidth ?? 96;
  const fh = stdMeta.frameHeight ?? 96;
  const rawClips = [];
  let idleBoxes = [];

  for (const state of STANDARD_STATES) {
    const animDef = stdMeta.animations?.[state];
    const row = animDef?.row ?? 0;
    const count = Math.max(1, animDef?.frames ?? 2);
    const fps = animDef?.fps ?? 8;
    const loop = Boolean(animDef?.loop);
    const hitFrame = typeof animDef?.hitFrame === 'number' ? animDef.hitFrame : undefined;

    const boxes = [];
    for (let c = 0; c < count; c++) {
      const tight = findCellTightBounds(sheetImg, c * fw, row * fh, fw, fh);
      if (tight) boxes.push(tight);
    }
    if (boxes.length === 0 && idleBoxes.length > 0) {
      boxes.push(idleBoxes[0]);
    }
    if (state === 'IDLE') idleBoxes = boxes;
    rawClips.push({ state, fps, loop, hitFrame, boxes });
  }

  const idleMedianW = medianNum(idleBoxes.map((b) => b.w), 36);
  const idleMedianH = medianNum(idleBoxes.map((b) => b.h), 60);

  const maxAtlasW = REGULAR_ATLAS_MAX_DIM;
  const pad = 2;
  let cursorX = pad;
  let cursorY = pad;
  let rowMaxH = 0;

  const placements = [];
  const framesHash = {};
  const frameTags = [];
  let globalIdx = 0;

  for (const clip of rawClips) {
    const fromIdx = globalIdx;
    for (let f = 0; f < clip.boxes.length; f++) {
      const box = clip.boxes[f];
      if (!box) continue;
      if (cursorX + box.w + pad > maxAtlasW) {
        cursorX = pad;
        cursorY += rowMaxH + pad;
        rowMaxH = 0;
      }

      const pivotPx = solveTorsoWeightedPivot(sheetImg.data, sheetImg.width, box, idleMedianW);
      const frameName = `${clip.state.toLowerCase()}_${f}`;
      placements.push({ box, dx: cursorX, dy: cursorY });
      framesHash[frameName] = {
        frame: { x: cursorX, y: cursorY, w: box.w, h: box.h },
        rotated: false,
        trimmed: false,
        spriteSourceSize: { x: 0, y: 0, w: box.w, h: box.h },
        sourceSize: { w: box.w, h: box.h },
        duration: Math.max(40, Math.round(1000 / clip.fps)),
        pivot: {
          x: Number((pivotPx.pivotX / Math.max(1, box.w)).toFixed(4)),
          y: Number((pivotPx.pivotY / Math.max(1, box.h)).toFixed(4))
        }
      };

      cursorX += box.w + pad;
      if (box.h > rowMaxH) rowMaxH = box.h;
      globalIdx += 1;
    }
    if (globalIdx > fromIdx) {
      frameTags.push({
        name: clip.state,
        from: fromIdx,
        to: globalIdx - 1,
        direction: 'forward',
        fps: clip.fps,
        loop: clip.loop,
        ...(clip.hitFrame !== undefined ? { hitFrame: clip.hitFrame } : {})
      });
    }
  }

  const totalH = Math.max(64, cursorY + rowMaxH + pad);
  if (totalH > REGULAR_ATLAS_MAX_DIM) {
    throw new Error(`ATLAS_MAX_RESOLUTION_EXCEEDED for ${key}: ${maxAtlasW}x${totalH}`);
  }

  const atlasImg = createImage(maxAtlasW, totalH);
  for (const item of placements) {
    blit(
      atlasImg,
      sheetImg,
      item.box.x,
      item.box.y,
      item.box.w,
      item.box.h,
      item.dx,
      item.dy,
      { alphaBlend: false }
    );
  }

  const outPngPath = path.join(rootDir, 'public/assets/pro/sprites', `${key}.png`);
  const outWebpPath = path.join(rootDir, 'public/assets/pro/sprites', `${key}.webp`);
  const outJsonPath = path.join(rootDir, 'public/assets/pro/sprites', `${key}.json`);
  if (fs.existsSync(outWebpPath)) {
    // Allow fresh PNG -> lossless WebP re-encoding cleanly without duplicate conflict
    fs.unlinkSync(outWebpPath);
  }
  fs.mkdirSync(path.dirname(outPngPath), { recursive: true });
  fs.writeFileSync(outPngPath, encodeImageToPng(atlasImg));

  const ppuSpec = WAVE1_PPU_SPECS[unitId] ?? { ppuScale: 1.0, targetDisplayHeight: 108 };
  const aseJson = {
    frames: framesHash,
    meta: {
      app: 'opgv-pro-importer',
      version: '1.1',
      image: `${key}.png`,
      format: 'RGBA8888',
      size: { w: atlasImg.width, h: atlasImg.height },
      anchor: { x: 0.5, y: 0.9 },
      referenceIdleHeight: idleMedianH,
      ppuScale: ppuSpec.ppuScale,
      frameTags
    }
  };
  fs.writeFileSync(outJsonPath, `${JSON.stringify(aseJson, null, 2)}\n`, 'utf-8');

  writeDebugOverlayFromAtlas(
    atlasImg.data,
    atlasImg.width,
    atlasImg.height,
    framesHash,
    path.join(rootDir, 'exported_thumbnails/import_debug', `wave1_${key}_debug.png`)
  );

  return { key, unitId, frameCount: globalIdx, width: atlasImg.width, height: atlasImg.height, idleMedianH };
}

/**
 * Re-computes TorsoWeightedPivotSolver pivots & locked PPU reference heights
 * on already-promoted pro Aseprite Hash atlases (`luffy_base`, `zoro_base`, `buggy_base`).
 */
export async function refreshExistingProSpritePivots(rootDir, key, unitId) {
  const spritesDir = path.join(rootDir, 'public/assets/pro/sprites');
  const jsonPath = path.join(spritesDir, `${key}.json`);
  const webpPath = path.join(spritesDir, `${key}.webp`);
  const pngPath = path.join(spritesDir, `${key}.png`);
  const imgPath = fs.existsSync(webpPath) ? webpPath : fs.existsSync(pngPath) ? pngPath : null;
  if (!imgPath || !fs.existsSync(jsonPath)) return null;

  const decoded = await decodeImageToRgba(fs.readFileSync(imgPath));
  const aseJson = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
  const framesObj = aseJson.frames ?? {};
  const idleFrames = Object.entries(framesObj)
    .filter(([k]) => k.startsWith('idle_'))
    .map(([, v]) => v.frame)
    .filter(Boolean);
  const idleMedianW = medianNum(idleFrames.map((f) => f.w), 32);
  const idleMedianH = medianNum(idleFrames.map((f) => f.h), 60);

  let count = 0;
  for (const entry of Object.values(framesObj)) {
    const f = entry?.frame;
    if (!f) continue;
    const pivotPx = solveTorsoWeightedPivot(decoded.data, decoded.width, f, idleMedianW);
    entry.pivot = {
      x: Number((pivotPx.pivotX / Math.max(1, f.w)).toFixed(4)),
      y: Number((pivotPx.pivotY / Math.max(1, f.h)).toFixed(4))
    };
    count += 1;
  }

  const ppuSpec = WAVE1_PPU_SPECS[unitId] ?? { ppuScale: 1.0, targetDisplayHeight: 108 };
  aseJson.meta = aseJson.meta ?? {};
  aseJson.meta.referenceIdleHeight = idleMedianH;
  aseJson.meta.ppuScale = ppuSpec.ppuScale;
  fs.writeFileSync(jsonPath, `${JSON.stringify(aseJson, null, 2)}\n`, 'utf-8');

  writeDebugOverlayFromAtlas(
    decoded.data,
    decoded.width,
    decoded.height,
    framesObj,
    path.join(rootDir, 'exported_thumbnails/import_debug', `wave1_${key}_debug.png`)
  );

  return { key, unitId, frameCount: count, width: decoded.width, height: decoded.height, idleMedianH };
}

/**
 * Promotes external CC0 4-layer battle backdrops for Wave 1 bosses (`battle_morgan`, `battle_buggy`, `battle_arlong`).
 */
export function promoteWave1BossBackdrops(rootDir) {
  const outDir = path.join(rootDir, 'public/assets/pro/backgrounds');
  const bgSrcRoot = path.join(rootDir, 'public/assets/backgrounds');
  const rawCloudsPng = path.join(rootDir, 'raw_assets/pro_originals/backgrounds/east_blue_harbor_layer1.png');
  const rawHarborSkyPng = path.join(rootDir, 'raw_assets/pro_originals/backgrounds/east_blue_harbor_layer0.png');
  if (!fs.existsSync(rawCloudsPng) || !fs.existsSync(rawHarborSkyPng)) {
    return 0;
  }

  const specs = [
    {
      bgId: 'battle_morgan',
      layer0: path.join(bgSrcRoot, 'marineford_ice_bay/sky.png'),
      layer1: rawCloudsPng,
      layer2: path.join(bgSrcRoot, 'water7_dock/mid.png'),
      layer3: path.join(bgSrcRoot, 'water7_dock/ground.png')
    },
    {
      bgId: 'battle_buggy',
      layer0: rawHarborSkyPng,
      layer1: rawCloudsPng,
      layer2: path.join(bgSrcRoot, 'east_blue_harbor/mid.png'),
      layer3: path.join(bgSrcRoot, 'east_blue_harbor/ground.png')
    },
    {
      bgId: 'battle_arlong',
      layer0: path.join(bgSrcRoot, 'water7_dock/sky.png'),
      layer1: rawCloudsPng,
      layer2: path.join(bgSrcRoot, 'fishman_island_seabed/mid.png'),
      layer3: path.join(bgSrcRoot, 'fishman_island_seabed/ground.png')
    }
  ];

  let built = 0;
  fs.mkdirSync(outDir, { recursive: true });
  for (const s of specs) {
    const files = [s.layer0, s.layer1, s.layer2, s.layer3];
    if (files.some((f) => !fs.existsSync(f))) continue;
    for (let i = 0; i < 4; i++) {
      const destWebp = path.join(outDir, `${s.bgId}_layer${i}.webp`);
      const destPng = path.join(outDir, `${s.bgId}_layer${i}.png`);
      if (fs.existsSync(destWebp)) continue;
      fs.copyFileSync(files[i], destPng);
    }
    built += 1;
  }
  return built;
}
