import {
  applyBiomeGrade,
  blit,
  cloneImage,
  createImage,
  encodeImageToPng,
  hexToRgb,
  resizeNearest,
  tileHorizontalSeamless
} from './pngCodec.mjs';

const BG_W = 1280;
const BG_H = 540;

/**
 * Composes a 3-layer seamless 1280x540 parallax battle arena from genuinely
 * downloaded pixel parallax backgrounds and arena floors.
 */
export function buildParallaxBackdropSet(arenaDef, layerSources) {
  const { skyImg, midImg, floorImg } = layerSources;

  // 1. Sky layer (opaque, tiled seamlessly to 1280x540 and graded by arena mood)
  let sky = tileHorizontalSeamless(skyImg, BG_W, BG_H);
  sky = applyBiomeGrade(sky, {
    tintHex: arenaDef.ambientTint,
    strength: arenaDef.timeOfDay === 'NIGHT' ? 0.36 : arenaDef.timeOfDay === 'DUSK' ? 0.24 : 0.14,
    brightness: arenaDef.timeOfDay === 'NIGHT' ? 0.72 : arenaDef.timeOfDay === 'DUSK' ? 0.88 : 1.0,
    contrast: 1.06
  });

  // 2. Midground structures/horizon layer (1280x540, transparent sky top, anchored cleanly to groundY)
  const mid = createImage(BG_W, BG_H);
  if (midImg) {
    const groundY = arenaDef.groundY ?? 198;
    const midH = 220;
    const midY = Math.max(0, groundY - midH + 28);
    const tiledMid = tileHorizontalSeamless(midImg, BG_W, midH);
    const gradedMid = applyBiomeGrade(tiledMid, {
      tintHex: arenaDef.ambientTint,
      strength: 0.22,
      brightness: arenaDef.timeOfDay === 'NIGHT' ? 0.78 : 0.94
    });
    blit(mid, gradedMid, 0, 0, BG_W, midH, 0, midY, { alphaBlend: true });
  }

  // 3. Foreground battle arena floor (1280x540, transparent upper y < groundY, muted textured surface below)
  const ground = createImage(BG_W, BG_H);
  const groundY = arenaDef.groundY ?? 198;
  const floorH = BG_H - groundY;
  // Crop the lower floor portion of the downloaded RPG battle scene so only the ground plane is sampled
  const srcFloorY = Math.floor(floorImg.height * 0.56);
  const srcFloorH = Math.max(32, floorImg.height - srcFloorY);
  const floorCrop = createImage(floorImg.width, srcFloorH);
  blit(floorCrop, floorImg, 0, srcFloorY, floorImg.width, srcFloorH, 0, 0, { alphaBlend: false });

  // Muted yet richly textured floor for reso.jhcloud.kr-grade figure-ground readability
  let gradedFloor = tileHorizontalSeamless(floorCrop, BG_W, floorH);
  gradedFloor = applyBiomeGrade(gradedFloor, {
    tintHex: arenaDef.floorTint ?? arenaDef.ambientTint,
    strength: 0.3,
    brightness: arenaDef.timeOfDay === 'NIGHT' ? 0.82 : 0.92,
    contrast: 1.08
  });

  blit(ground, gradedFloor, 0, 0, BG_W, floorH, 0, groundY, { alphaBlend: false });

  // Add subtle horizon rim + perspective depth shading along top edge of arena floor
  const rimRgb = hexToRgb(arenaDef.rimHex ?? '#64748b');
  for (let y = groundY; y < Math.min(BG_H, groundY + 10); y++) {
    const t = (y - groundY) / 10;
    for (let x = 0; x < BG_W; x++) {
      const idx = (y * BG_W + x) * 4;
      if (y <= groundY + 1) {
        ground.data[idx] = rimRgb[0];
        ground.data[idx + 1] = rimRgb[1];
        ground.data[idx + 2] = rimRgb[2];
        ground.data[idx + 3] = 255;
      } else {
        const dark = 0.72 + t * 0.28;
        ground.data[idx] = Math.round(ground.data[idx] * dark);
        ground.data[idx + 1] = Math.round(ground.data[idx + 1] * dark);
        ground.data[idx + 2] = Math.round(ground.data[idx + 2] * dark);
      }
    }
  }

  return {
    skyPng: encodeImageToPng(sky),
    midPng: encodeImageToPng(mid),
    groundPng: encodeImageToPng(ground)
  };
}

/**
 * Keys solid black backgrounds out of additive-style sprite sheets using luminance alpha.
 */
export function keyBlackToAlpha(img) {
  const out = cloneImage(img);
  let transp = 0;
  for (let i = 3; i < out.data.length; i += 4) if (out.data[i] < 16) transp++;
  if (transp / (out.width * out.height) > 0.15) return out;

  for (let i = 0; i < out.data.length; i += 4) {
    const lum = Math.max(out.data[i], out.data[i + 1], out.data[i + 2]);
    out.data[i + 3] = lum < 18 ? 0 : Math.min(255, Math.round(lum * 1.45));
  }
  return out;
}

/**
 * Slices a horizontal or grid pixel VFX sheet into a normalized horizontal strip.
 */
export function normalizeVfxStrip(rawImg, options) {
  const { cols = 1, rows = 1, targetRow = 0, maxFrames = 10, tintHex = null, tintStrength = 0 } = options;
  const clean = keyBlackToAlpha(rawImg);
  const fw = Math.floor(clean.width / cols);
  const fh = Math.floor(clean.height / rows);
  const count = Math.min(maxFrames, cols);

  const out = createImage(fw * count, fh);
  const tintRgb = tintHex ? hexToRgb(tintHex) : null;
  for (let f = 0; f < count; f++) {
    blit(out, clean, f * fw, targetRow * fh, fw, fh, f * fw, 0, {
      alphaBlend: true,
      tintRgb,
      tintStrength
    });
  }

  // Scale oversized VFX down gracefully to keep bundles crisp & lightweight
  let finalImg = out;
  let finalFw = fw;
  let finalFh = fh;
  if (fh > 128) {
    const scale = 96 / fh;
    finalFw = Math.max(32, Math.round(fw * scale));
    finalFh = 96;
    finalImg = resizeNearest(out, finalFw * count, finalFh);
  }

  return {
    pngBuffer: encodeImageToPng(finalImg),
    frameWidth: finalFw,
    frameHeight: finalFh,
    frameCount: count
  };
}
