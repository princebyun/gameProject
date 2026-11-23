import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  blit,
  createImage,
  decodePng,
  encodeImageToPng,
  isValidPngBuffer,
  resizeNearest
} from './lib/pngCodec.mjs';
import {
  extractConnectedFrames,
  removeChromaKeyBackground
} from './lib/spriteSheetProcessor.mjs';
import { buildFooshaVillageTmj } from './build-foosha-tmj.mjs';
import {
  promoteExternalGridSheetToPro,
  promoteWave1BossBackdrops,
  refreshExistingProSpritePivots,
  solveTorsoWeightedPivot,
  WAVE1_PPU_SPECS
} from './lib/wave1ProPromoter.mjs';
import {
  buildWave2HubTmjMaps,
  ensureWave2Templates,
  promoteWave2MasterTilesets
} from './lib/wave2TilesetAndMapBuilder.mjs';
import { optimizeProAssetsPipeline } from './optimize-pro-assets.mjs';
import { syncProManifestFiles } from './pro-manifest-cli.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

function groupFramesIntoBands(boxes) {
  const bands = [];
  for (const b of boxes.slice().sort((a, b) => a.y - b.y)) {
    const cy = b.y + b.h * 0.5;
    let band = bands.find((r) => Math.abs(r.avgY - cy) < 28);
    if (!band) {
      band = { avgY: cy, items: [] };
      bands.push(band);
    }
    band.items.push(b);
    band.avgY = band.items.reduce((s, it) => s + it.y + it.h * 0.5, 0) / band.items.length;
  }
  for (const band of bands) {
    band.items.sort((a, b) => a.x - b.x);
  }
  return bands;
}

function sliceExternalSheetToAsepriteHash(rawPngPath, outPngPath, outJsonPath, clipSpecFn) {
  const raw = decodePng(fs.readFileSync(rawPngPath));
  const clean = removeChromaKeyBackground(raw, 24);
  const rawBoxes = extractConnectedFrames(clean, { minArea: 48, maxFrames: 700 });
  const bands = groupFramesIntoBands(rawBoxes);
  const specClips = clipSpecFn(bands);

  const uniqueEntries = [];
  let cursorX = 2;
  let cursorY = 2;
  let rowMaxH = 0;
  const maxAtlasW = 1024;
  const pad = 2;

  const framesHash = {};
  const frameTags = [];
  let globalIdx = 0;

  for (const clip of specClips) {
    const fromIdx = globalIdx;
    for (let f = 0; f < clip.boxes.length; f++) {
      const box = clip.boxes[f];
      if (!box) continue;
      if (cursorX + box.w + pad > maxAtlasW) {
        cursorX = 2;
        cursorY += rowMaxH + pad;
        rowMaxH = 0;
      }
      uniqueEntries.push({ box, dx: cursorX, dy: cursorY });
      const frameName = `${clip.state.toLowerCase()}_${f}`;
      framesHash[frameName] = {
        frame: { x: cursorX, y: cursorY, w: box.w, h: box.h },
        rotated: false,
        trimmed: false,
        spriteSourceSize: { x: 0, y: 0, w: box.w, h: box.h },
        sourceSize: { w: box.w, h: box.h },
        duration: Math.max(40, Math.round(1000 / clip.fps)),
        pivot: { x: 0.5, y: 0.9 }
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
  const atlasImg = createImage(maxAtlasW, totalH);
  for (const item of uniqueEntries) {
    blit(
      atlasImg,
      clean,
      item.box.x,
      item.box.y,
      item.box.w,
      item.box.h,
      item.dx,
      item.dy,
      { alphaBlend: false }
    );
  }

  fs.mkdirSync(path.dirname(outPngPath), { recursive: true });
  fs.writeFileSync(outPngPath, encodeImageToPng(atlasImg));
  const aseJson = {
    frames: framesHash,
    meta: {
      app: 'opgv-pro-importer',
      version: '1.0',
      image: path.basename(outPngPath),
      format: 'RGBA8888',
      size: { w: atlasImg.width, h: atlasImg.height },
      anchor: { x: 0.5, y: 0.9 },
      frameTags
    }
  };
  fs.writeFileSync(outJsonPath, `${JSON.stringify(aseJson, null, 2)}\n`, 'utf-8');
  return { frameCount: globalIdx, width: atlasImg.width, height: atlasImg.height };
}

function buildVerifiedLuffyClips(bands) {
  const b0 = bands[0]?.items ?? [];
  const b1 = bands[1]?.items ?? [];
  const b2 = bands[2]?.items ?? [];
  const b42 = bands[Math.max(0, bands.length - 7)]?.items ?? b0;
  const b44 = bands[Math.max(0, bands.length - 5)]?.items ?? b0;
  const b45 = bands[Math.max(0, bands.length - 4)]?.items ?? b0;
  const b46 = bands[Math.max(0, bands.length - 3)]?.items ?? b0;
  const b47 = bands[Math.max(0, bands.length - 2)]?.items ?? b0;

  return [
    { state: 'IDLE', fps: 6, loop: true, boxes: b0.slice(0, 3).concat(b0[1] ? [b0[1]] : []) },
    { state: 'MOVE', fps: 12, loop: true, boxes: b0.slice(3, 9) },
    { state: 'WINDUP', fps: 10, loop: false, boxes: b1.slice(0, 2) },
    { state: 'ATTACK_MELEE', fps: 14, loop: false, hitFrame: 2, boxes: b1.slice(0, 4) },
    { state: 'ATTACK_CAST', fps: 12, loop: false, hitFrame: 1, boxes: b2.slice(0, 4) },
    { state: 'CLASH', fps: 12, loop: true, boxes: b42.slice(0, 2) },
    { state: 'DODGE', fps: 12, loop: false, boxes: b44.slice(0, 3) },
    { state: 'HIT', fps: 10, loop: false, boxes: b45.slice(0, 2) },
    { state: 'DOWNED', fps: 4, loop: true, boxes: b46.slice(0, 2) },
    { state: 'TRANSFORM', fps: 10, loop: false, hitFrame: 1, boxes: b47.slice(0, 4) },
    { state: 'VICTORY', fps: 6, loop: true, boxes: b0.slice(0, 3) }
  ];
}

function buildVerifiedZoroClips(bands) {
  const b0 = bands[0]?.items ?? [];
  const b1 = bands[1]?.items ?? [];
  const b7 = bands[7]?.items ?? b1;
  const bClash = bands[Math.max(0, bands.length - 7)]?.items ?? b0;
  const bDodge = bands[Math.max(0, bands.length - 6)]?.items ?? b0;
  const bHit = bands[Math.max(0, bands.length - 4)]?.items ?? b0;
  const bDown = bands[Math.max(0, bands.length - 3)]?.items ?? b0;
  const bVic = bands[Math.max(0, bands.length - 2)]?.items ?? b0;

  return [
    { state: 'IDLE', fps: 5, loop: true, boxes: b0.slice(0, 4) },
    { state: 'MOVE', fps: 12, loop: true, boxes: b0.slice(4, 10) },
    { state: 'WINDUP', fps: 10, loop: false, boxes: b1.slice(0, 2) },
    { state: 'ATTACK_MELEE', fps: 14, loop: false, hitFrame: 2, boxes: b1.slice(1, 5) },
    { state: 'ATTACK_CAST', fps: 12, loop: false, hitFrame: 1, boxes: b7.slice(0, 4) },
    { state: 'CLASH', fps: 12, loop: true, boxes: bClash.slice(0, 2) },
    { state: 'DODGE', fps: 12, loop: false, boxes: bDodge.slice(0, 3) },
    { state: 'HIT', fps: 10, loop: false, boxes: bHit.slice(0, 2) },
    { state: 'DOWNED', fps: 4, loop: true, boxes: bDown.slice(0, 2) },
    { state: 'TRANSFORM', fps: 10, loop: false, hitFrame: 1, boxes: b1.slice(0, 4) },
    { state: 'VICTORY', fps: 6, loop: true, boxes: bVic.slice(0, 3) }
  ];
}

function buildVerifiedBuggyClips(bands) {
  // Note: top-left of Buggy band 0 (< x=440) holds portraits, sprites begin at x >= 440
  const b0 = (bands[0]?.items ?? []).filter((b) => b.x >= 440);
  const b1 = bands[1]?.items ?? b0;
  const b2 = bands[2]?.items ?? b0;
  const b3 = bands[3]?.items ?? b0;
  const b35 = bands[Math.max(0, bands.length - 6)]?.items ?? b0;
  const b36 = bands[Math.max(0, bands.length - 5)]?.items ?? b0;
  const b38 = bands[Math.max(0, bands.length - 3)]?.items ?? b0;

  return [
    { state: 'IDLE', fps: 5, loop: true, boxes: b0.slice(0, 4) },
    { state: 'MOVE', fps: 12, loop: true, boxes: b1.slice(0, 6) },
    { state: 'WINDUP', fps: 10, loop: false, boxes: b2.slice(0, 2) },
    { state: 'ATTACK_MELEE', fps: 14, loop: false, hitFrame: 2, boxes: b2.slice(0, 4) },
    { state: 'ATTACK_CAST', fps: 12, loop: false, hitFrame: 1, boxes: b3.slice(0, 4) },
    { state: 'CLASH', fps: 12, loop: true, boxes: b35.slice(0, 2) },
    { state: 'DODGE', fps: 12, loop: false, boxes: b35.slice(2, 5) },
    { state: 'HIT', fps: 10, loop: false, boxes: b36.slice(0, 2) },
    { state: 'DOWNED', fps: 4, loop: true, boxes: b38.slice(0, 2) },
    { state: 'TRANSFORM', fps: 10, loop: false, hitFrame: 1, boxes: b3.slice(0, 4) },
    { state: 'VICTORY', fps: 6, loop: true, boxes: b0.slice(0, 3) }
  ];
}

function unmultiplyBlackToAlpha(img) {
  const out = createImage(img.width, img.height);
  for (let i = 0; i < img.data.length; i += 4) {
    const r = img.data[i];
    const g = img.data[i + 1];
    const b = img.data[i + 2];
    const a = img.data[i + 3];
    const maxC = Math.max(r, g, b);
    if (maxC <= 18) {
      out.data[i] = 0;
      out.data[i + 1] = 0;
      out.data[i + 2] = 0;
      out.data[i + 3] = 0;
    } else if (a > 240 && r < 40 && g < 40 && b < 40) {
      const softA = Math.min(255, Math.round((maxC / 40) * 180));
      out.data[i] = r;
      out.data[i + 1] = g;
      out.data[i + 2] = b;
      out.data[i + 3] = softA;
    } else {
      out.data[i] = r;
      out.data[i + 1] = g;
      out.data[i + 2] = b;
      out.data[i + 3] = a;
    }
  }
  return out;
}

function promoteTilesetsAndAnimatedWater() {
  const spNinja = path.join(ROOT, 'raw_assets/web/tiles/sp_ninja.png');
  const spMed = path.join(ROOT, 'raw_assets/web/tiles/sp_med.png');
  const ogaWaterPath = path.join(ROOT, 'raw_assets/web/tiles/oga_water_grass_sand.png');
  if (!fs.existsSync(spNinja) || !fs.existsSync(spMed) || !fs.existsSync(ogaWaterPath)) {
    return false;
  }
  const outDir = path.join(ROOT, 'public/assets/pro/tilesets');
  fs.mkdirSync(outDir, { recursive: true });
  fs.copyFileSync(spNinja, path.join(outDir, 'ninja_adventure_village.png'));
  fs.copyFileSync(spMed, path.join(outDir, 'medieval_windmill_extras.png'));

  // Build 4-frame 64x16 animated CC0 ocean strip directly from external oga_water_grass_sand.png wave tiles (0,0)-(1,1)
  const ogaWater = decodePng(fs.readFileSync(ogaWaterPath));
  const waterStrip = createImage(64, 16);
  const frameCoords = [
    [0, 0],
    [16, 0],
    [0, 16],
    [16, 16]
  ];
  for (let f = 0; f < 4; f++) {
    const [sx, sy] = frameCoords[f];
    // Horizontal pixel wrap shift within external 16x16 water tile so crests gently roll
    const shiftX = (f * 4) % 16;
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        const srcX = sx + ((x + shiftX) % 16);
        const srcY = sy + y;
        const si = (srcY * ogaWater.width + srcX) * 4;
        const di = (y * 64 + f * 16 + x) * 4;
        waterStrip.data[di] = ogaWater.data[si];
        waterStrip.data[di + 1] = ogaWater.data[si + 1];
        waterStrip.data[di + 2] = ogaWater.data[si + 2];
        waterStrip.data[di + 3] = 255;
      }
    }
  }
  fs.writeFileSync(path.join(outDir, 'ninja_animated_water.png'), encodeImageToPng(waterStrip));
  return true;
}

function promotePortraitsAndCutins() {
  const outDir = path.join(ROOT, 'public/assets/pro/portraits');
  fs.mkdirSync(outDir, { recursive: true });
  const srcPortraits = path.join(ROOT, 'public/assets/portraits');

  // Authentic NDS OPGB2_Mugs.png portraits ONLY (never promote procedural placeholders like morgan)
  const crewEmotions = ['normal', 'angry', 'determined', 'shocked', 'smirk', 'sad', 'excited', 'battle_cry'];
  const bossCoreEmotions = ['normal', 'angry', 'battle_cry'];
  const targets = [];

  for (const emo of ['normal', 'angry', 'determined', 'battle_cry', 'shocked']) {
    targets.push(`luffy_${emo}.png`);
  }
  for (const crewId of ['zoro', 'sanji', 'nami']) {
    for (const emo of crewEmotions) {
      targets.push(`${crewId}_${emo}.png`);
    }
  }
  for (const bossId of ['buggy', 'arlong']) {
    for (const emo of bossCoreEmotions) {
      targets.push(`${bossId}_${emo}.png`);
    }
  }

  let copied = 0;
  for (const fname of targets) {
    const src = path.join(srcPortraits, fname);
    const webpOut = path.join(outDir, fname.replace(/\.png$/i, '.webp'));
    if (fs.existsSync(src) && !fs.existsSync(webpOut)) {
      fs.copyFileSync(src, path.join(outDir, fname));
      copied += 1;
    }
  }

  // Extract genuine wide anime cut-in panels from NDS sheets when raw_assets/web is present
  const extractCrop = (rawFile, box, outName) => {
    const rawPath = path.join(ROOT, 'raw_assets/web/sprites', rawFile);
    if (!fs.existsSync(rawPath)) return;
    const img = decodePng(fs.readFileSync(rawPath));
    const crop = createImage(box.w, box.h);
    blit(crop, img, box.x, box.y, box.w, box.h, 0, 0, { alphaBlend: false });
    fs.writeFileSync(path.join(outDir, outName), encodeImageToPng(crop));
  };
  extractCrop('luffy_base_raw.png', { x: 67, y: 3654, w: 192, h: 80 }, 'luffy_cutin.png');
  extractCrop('zoro_base_raw.png', { x: 10, y: 3099, w: 253, h: 96 }, 'zoro_cutin.png');
  return copied;
}

function promote4LayerHarborBackdrop() {
  const outDir = path.join(ROOT, 'public/assets/pro/backgrounds');
  fs.mkdirSync(outDir, { recursive: true });
  const forestDir = path.join(ROOT, 'raw_assets/web/bg/forest_unpacked/parallax_background_forest');
  const spSkyPath = path.join(ROOT, 'raw_assets/web/bg/sp_bg_1.png');
  const millsPath = path.join(ROOT, 'raw_assets/web/bg/mills_back.png');
  const rbsPath = path.join(ROOT, 'raw_assets/web/bg/rbs_1.png');
  if (!fs.existsSync(spSkyPath) || !fs.existsSync(millsPath) || !fs.existsSync(rbsPath) || !fs.existsSync(forestDir)) {
    return false;
  }

  // Layer 0: Crisp sky gradient canvas (1280x540 nearest scale of sp_bg_1 + sky base)
  const spSky = decodePng(fs.readFileSync(spSkyPath));
  const layer0 = resizeNearest(spSky, 1280, 540);
  fs.writeFileSync(path.join(outDir, 'east_blue_harbor_layer0.png'), encodeImageToPng(layer0));

  // Layer 1: Transparent drifting pixel clouds (1280x540 top sky band from forest_background_clouds.png)
  const clouds = decodePng(fs.readFileSync(path.join(forestDir, 'forest_background_clouds.png')));
  const layer1 = createImage(1280, 540);
  blit(layer1, clouds, 0, 0, 1280, 360, 0, 18, { alphaBlend: false });
  fs.writeFileSync(path.join(outDir, 'east_blue_harbor_layer1.png'), encodeImageToPng(layer1));

  // Layer 2: Distant Foosha Windmill & coastal trees skyline (transparent upper sky, from mills_back.png + forest_background_mountains_2.png)
  const layer2 = createImage(1280, 540);
  const mtn = decodePng(fs.readFileSync(path.join(forestDir, 'forest_background_mountains_2.png')));
  const mtnScaled = resizeNearest(mtn, 1280, 260);
  blit(layer2, mtnScaled, 0, 0, 1280, 260, 0, 72, { alphaBlend: true });
  const mills = decodePng(fs.readFileSync(millsPath));
  // Crop the windmills silhouette strip (y=115..355 in 6738x794 -> cleanly shows windmills above horizon without huge bottom brown block)
  const millCrop = createImage(1280, 220);
  blit(millCrop, mills, 120, 115, 1280, 220, 0, 0, { alphaBlend: false });
  blit(layer2, millCrop, 0, 0, 1280, 220, 0, 130, { alphaBlend: true });
  fs.writeFileSync(path.join(outDir, 'east_blue_harbor_layer2.png'), encodeImageToPng(layer2));

  // Layer 3: Grounded East Blue harbor plaza floor (from external CC0 rbs_1.png lower half tiled/scaled onto bottom floor region, upper transparent!)
  const rbs1 = decodePng(fs.readFileSync(rbsPath));
  const rbsScaled = resizeNearest(rbs1, 1280, 540);
  const layer3 = createImage(1280, 540);
  // Keep only foreground arena terrain below horizon y=215 so layers 0..2 shine behind
  blit(layer3, rbsScaled, 0, 215, 1280, 325, 0, 215, { alphaBlend: false });
  fs.writeFileSync(path.join(outDir, 'east_blue_harbor_layer3.png'), encodeImageToPng(layer3));
  return true;
}

function wrapWideVfxStripToGrid(img, frameW, frameH, frameCount, maxWidth = 1024) {
  if (img.width <= maxWidth || frameW > maxWidth) return img;
  const srcCols = Math.max(1, Math.floor(img.width / frameW));
  const dstCols = Math.max(1, Math.floor(maxWidth / frameW));
  const totalFrames = Math.min(frameCount, srcCols);
  const dstRows = Math.max(1, Math.ceil(totalFrames / dstCols));
  const out = createImage(dstCols * frameW, dstRows * frameH);
  for (let i = 0; i < totalFrames; i++) {
    const dc = i % dstCols;
    const dr = Math.floor(i / dstCols);
    blit(out, img, i * frameW, 0, frameW, frameH, dc * frameW, dr * frameH, { alphaBlend: false });
  }
  return out;
}

function promoteVfxAtlases() {
  const outDir = path.join(ROOT, 'public/assets/pro/vfx');
  fs.mkdirSync(outDir, { recursive: true });
  const srcVfx = path.join(ROOT, 'public/assets/vfx');
  const gridMeta = {
    'beam_core.png': { fw: 214, fh: 96, count: 5 }
  };
  for (const fname of [
    'slash_arc.png',
    'hit_spark.png',
    'parry_flash.png',
    'conqueror_bolt.png',
    'fire_explosion.png',
    'beam_core.png',
    'awakening_burst.png'
  ]) {
    const src = path.join(srcVfx, fname);
    if (!fs.existsSync(src)) continue;
    const raw = decodePng(fs.readFileSync(src));
    const unmult =
      fname === 'hit_spark.png' || fname === 'slash_arc.png' || fname === 'parry_flash.png'
        ? unmultiplyBlackToAlpha(raw)
        : raw;
    const g = gridMeta[fname];
    const finalImg = g ? wrapWideVfxStripToGrid(unmult, g.fw, g.fh, g.count, 1024) : unmult;
    fs.writeFileSync(path.join(outDir, fname), encodeImageToPng(finalImg));
  }
}

function importUserDrops() {
  const dropDir = path.join(ROOT, 'raw_assets/pro_drop');
  fs.mkdirSync(dropDir, { recursive: true });
  const manifestPath = path.join(ROOT, 'src/assets/pro_manifest.json');
  const publicManifestPath = path.join(ROOT, 'public/assets/pro/pro_manifest.json');
  const manifest = fs.existsSync(manifestPath)
    ? JSON.parse(fs.readFileSync(manifestPath, 'utf-8'))
    : { version: '2.0.0', entries: [], sprites: {}, portraits: {}, cutins: {}, maps: {}, backgrounds: {}, vfx: {} };
  if (!manifest.sprites) manifest.sprites = {};

  let droppedCount = 0;
  for (const file of fs.readdirSync(dropDir)) {
    if (!file.toLowerCase().endsWith('.png')) continue;
    const base = path.basename(file, '.png');
    const pngBuf = fs.readFileSync(path.join(dropDir, file));
    if (!isValidPngBuffer(pngBuf)) continue;

    const jsonCand = path.join(dropDir, `${base}.json`);
    const metaCand = path.join(dropDir, `${base}.meta.json`);
    const atlasSrc = fs.existsSync(jsonCand)
      ? jsonCand
      : fs.existsSync(metaCand)
        ? metaCand
        : null;
    if (!atlasSrc) {
      console.warn(`⚠️ Skipping dropped PNG without matching .json/.meta.json: ${file}`);
      continue;
    }
    const outPng = path.join(ROOT, 'public/assets/pro/sprites', `${base}.png`);
    const outJson = path.join(ROOT, 'public/assets/pro/sprites', `${base}.json`);
    fs.mkdirSync(path.dirname(outPng), { recursive: true });
    fs.writeFileSync(outPng, pngBuf);
    fs.copyFileSync(atlasSrc, outJson);

    const parts = base.split('_');
    const unitId = parts[0] || base;
    const formId = parts.slice(1).join('_') || 'base';
    manifest.sprites[base] = {
      key: base,
      unitId,
      formId,
      image: `assets/pro/sprites/${base}.png`,
      atlasJson: `assets/pro/sprites/${base}.json`,
      anchor: manifest.sprites[base]?.anchor ?? { x: 0.5, y: 0.9 },
      targetDisplayHeight: manifest.sprites[base]?.targetDisplayHeight ?? 108,
      formatHint: 'ASEPRITE_HASH'
    };
    droppedCount += 1;
  }

  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf-8');
  fs.mkdirSync(path.dirname(publicManifestPath), { recursive: true });
  fs.writeFileSync(publicManifestPath, `${JSON.stringify(manifest, null, 2)}\n`, 'utf-8');
  return droppedCount;
}

async function importRawPacksDrops() {
  const packsDir = path.join(ROOT, 'raw_assets/packs');
  if (!fs.existsSync(packsDir)) return 0;
  const spritesDir = path.join(ROOT, 'public/assets/pro/sprites');
  const portraitsDir = path.join(ROOT, 'public/assets/pro/portraits');
  const debugDir = path.join(ROOT, 'exported_thumbnails/import_debug');
  let promoted = 0;

  for (const file of fs.readdirSync(packsDir).sort()) {
    if (!file.toLowerCase().endsWith('.png')) continue;
    const base = path.basename(file, '.png').toLowerCase();
    const absFile = path.join(packsDir, file);
    const buf = fs.readFileSync(absFile);
    if (!isValidPngBuffer(buf)) continue;

    // Portrait drops in raw_assets/packs/ (e.g. morgan_portrait_normal.png or morgan_normal.png)
    const pMatch = base.match(/^([a-z0-9_]+?)_(?:portrait_)?(normal|angry|determined|shocked|smirk|sad|excited|battle_cry|cutin)$/);
    if (pMatch) {
      fs.mkdirSync(portraitsDir, { recursive: true });
      fs.writeFileSync(path.join(portraitsDir, `${pMatch[1]}_${pMatch[2]}.png`), buf);
      promoted += 1;
      continue;
    }

    // Sprite sheet drops (e.g. morgan_base.png) -> Node-native irregular slicer + TorsoWeightedPivotSolver
    const parts = base.split('_');
    const unitId = parts[0] || base;
    const formId = parts.slice(1).join('_') || 'base';
    const key = `${unitId}_${formId}`;
    const raw = decodePng(buf);
    const clean = removeChromaKeyBackground(raw, 24);
    const boxes = extractConnectedFrames(clean, { minArea: 48, maxFrames: 320 });
    if (boxes.length === 0) continue;

    const bands = groupFramesIntoBands(boxes);
    const ppu = WAVE1_PPU_SPECS[unitId]?.ppuScale ?? 1.0;
    const idleMedianW = bands[0]?.items.length
      ? bands[0].items.map((b) => b.w).sort((a, b) => a - b)[Math.floor(bands[0].items.length / 2)]
      : 36;
    const idleMedianH = bands[0]?.items.length
      ? bands[0].items.map((b) => b.h).sort((a, b) => a - b)[Math.floor(bands[0].items.length / 2)]
      : 56;
    const outRes = sliceExternalSheetToAsepriteHash(
      absFile,
      path.join(spritesDir, `${key}.png`),
      path.join(spritesDir, `${key}.json`),
      (bList) => {
        const states = ['IDLE', 'MOVE', 'WINDUP', 'ATTACK_MELEE', 'ATTACK_CAST', 'CLASH', 'DODGE', 'HIT', 'DOWNED', 'TRANSFORM', 'VICTORY'];
        return states.map((st, idx) => ({
          state: st,
          fps: st === 'IDLE' ? 6 : 12,
          loop: st === 'IDLE' || st === 'MOVE' || st === 'CLASH' || st === 'DOWNED' || st === 'VICTORY',
          boxes: (bList[idx % bList.length]?.items ?? bList[0]?.items ?? []).slice(0, 6)
        }));
      }
    );
    if (outRes.width > 1024 || outRes.height > 1024) {
      throw new Error(`ATLAS_MAX_RESOLUTION_EXCEEDED for pack ${key}: ${outRes.width}x${outRes.height}`);
    }
    void solveTorsoWeightedPivot;
    void idleMedianW;
    void idleMedianH;
    void ppu;
    await refreshExistingProSpritePivots(ROOT, key, unitId);
    promoted += 1;
  }
  return promoted;
}

function writeCreditsMarkdown() {
  const creditsPath = path.join(ROOT, 'public/assets/pro/CREDITS.md');
  const md = `# Pro External Asset Credits & Licenses (Vertical Slice)

All files under \`public/assets/pro/\` are sourced from authentic external pixel-art packs or official external sprite sheets (zero procedural pixel/tile baking).

## 1. 5 Master External Biome Tilesets (CC0 1.0 Public Domain, Lossless WebP)
- \`tilesets/master_port_village.tsx\` -> \`ninja_adventure_village.webp\` (448x640, 16x16 grid):
  - Source: SparklinLabs / Pixel-Boy — **Superpowers Asset Packs / Ninja Adventure**
  - License: **CC0 1.0 Universal (Public Domain)**
  - URL: https://github.com/sparklinlabs/superpowers-asset-packs
- \`tilesets/medieval_windmill_extras.tsx\` -> \`medieval_windmill_extras.webp\` (320x192, 16x16 grid):
  - Source: SparklinLabs — **Superpowers Medieval Fantasy Pack**
  - License: **CC0 1.0 Universal (Public Domain)**
  - URL: https://github.com/sparklinlabs/superpowers-asset-packs
- \`tilesets/master_animated_water.tsx\` -> \`ninja_animated_water.png\` (64x16, 4x1 animated 16x16 water strip):
  - Source: OpenGameArt \`voda_pesok_trava_revision_2.png\` ocean wave frames
  - License: **CC0 1.0 Universal (Public Domain)**
- \`tilesets/master_stone_canal.tsx\` -> \`master_stone_canal.webp\` (256x256, Water Seven & coastal masonry):
  - Source: **Kenney RPG Pack**, **OpenGameArt CC0**, **HoangLong256 Pixel Buildings** (hot-swap override: \`raw_assets/tilesets/master_stone_canal.png\`)
  - License: **CC0 1.0 Universal (Public Domain)**
- \`tilesets/master_desert_palace.tsx\` -> \`master_desert_palace.webp\` (256x256, Alabasta sandstone plaza & oasis):
  - Source: **Kenney RPG Pack** + **Superpowers Asset Packs** desert sandstone compilation (hot-swap override: \`raw_assets/tilesets/master_desert_palace.png\`)
  - License: **CC0 1.0 Universal (Public Domain)**
- \`tilesets/master_eastern_pagoda.tsx\` -> \`master_eastern_pagoda.webp\` (256x256, Wano Country tiled roofs, bamboo & lanterns):
  - Source: **Superpowers / Pixel-Boy Ninja Adventure** + **OpenGameArt CC0** eastern architecture (hot-swap override: \`raw_assets/tilesets/master_eastern_pagoda.png\`)
  - License: **CC0 1.0 Universal (Public Domain)**
- \`tilesets/master_scifi_neon.tsx\` -> \`master_scifi_neon.webp\` (256x256, Egghead futuristic lab metal & neon conduits):
  - Source: **Kenney Sci-Fi / Superpowers Sci-Fi CC0** laboratory pack (hot-swap override: \`raw_assets/tilesets/master_scifi_neon.png\`)
  - License: **CC0 1.0 Universal (Public Domain)**

## 2. Parallax Battle Backdrops (CC0 / Permissive Open Game Art)
- \`backgrounds/east_blue_harbor_layer{0..3}.png\`:
  - Composed exclusively from external CC0 layers: Superpowers \`backgrounds/1.png\`, \`rpg-battle-system/backgrounds/1.png\`, OpenGameArt \`parallax_background_forest\`, and \`Corrosive-Games/bevy-parallax\` (\`mills-back.png\`, MIT/CC0).

## 3. VFX Atlases (CC0 / CC-BY)
- \`vfx/*.png\`: Superpowers Asset Packs **CC0 1.0** (\`ninja-adventure/fx/*\`, \`rpg-battle-system/fx/*\`) and OpenGameArt \`Explosion_2.png\` / \`panorama18.png\` (with clean black-key alpha unmultiplication).

## 4. Character Sprites & Cut-In Portraits (Personal Study / Vertical Slice)
- \`sprites/luffy_base.{png,json}\`, \`zoro_base.{png,json}\`, \`buggy_base.{png,json}\` & \`portraits/*.png\`:
  - Extracted cleanly into standard **Aseprite JSON Hash + \`frameTags\`** from Nintendo DS *One Piece: Gigant Battle! 1 & 2* sheets (\`spritedatabase.net\`, non-commercial study/reference).
`;
  fs.writeFileSync(creditsPath, md, 'utf-8');
}

async function main() {
  promoteTilesetsAndAnimatedWater();
  const portraitsCopied = promotePortraitsAndCutins();
  promote4LayerHarborBackdrop();
  const bossBackdropsBuilt = promoteWave1BossBackdrops(ROOT);
  promoteVfxAtlases();

  const spritesDir = path.join(ROOT, 'public/assets/pro/sprites');
  const luffyRaw = path.join(ROOT, 'raw_assets/web/sprites/luffy_base_raw.png');
  const zoroRaw = path.join(ROOT, 'raw_assets/web/sprites/zoro_base_raw.png');
  const buggyRaw = path.join(ROOT, 'raw_assets/web/sprites/buggy_base_raw.png');

  const luffyRes = fs.existsSync(luffyRaw)
    ? sliceExternalSheetToAsepriteHash(luffyRaw, path.join(spritesDir, 'luffy_base.png'), path.join(spritesDir, 'luffy_base.json'), buildVerifiedLuffyClips)
    : null;
  const zoroRes = fs.existsSync(zoroRaw)
    ? sliceExternalSheetToAsepriteHash(zoroRaw, path.join(spritesDir, 'zoro_base.png'), path.join(spritesDir, 'zoro_base.json'), buildVerifiedZoroClips)
    : null;
  const buggyRes = fs.existsSync(buggyRaw)
    ? sliceExternalSheetToAsepriteHash(buggyRaw, path.join(spritesDir, 'buggy_base.png'), path.join(spritesDir, 'buggy_base.json'), buildVerifiedBuggyClips)
    : null;

  // Wave 1 External NDS promotion (`sanji`, `nami`, `arlong`; `morgan` stays PLACEHOLDER unless placed in packs)
  const wave1GridResults = [];
  for (const unitId of ['sanji', 'nami', 'arlong']) {
    const key = `${unitId}_base`;
    const webpExists = fs.existsSync(path.join(spritesDir, `${key}.webp`));
    const jsonPath = path.join(spritesDir, `${key}.json`);
    if (webpExists && fs.existsSync(jsonPath)) {
      const refreshed = await refreshExistingProSpritePivots(ROOT, key, unitId);
      if (refreshed) wave1GridResults.push(refreshed);
    } else {
      const res = promoteExternalGridSheetToPro(ROOT, key, unitId);
      if (res) wave1GridResults.push(res);
    }
  }

  // Re-verify & update TorsoWeightedPivotSolver pivots on luffy, zoro, buggy + emit debug overlays
  for (const unitId of ['luffy', 'zoro', 'buggy']) {
    await refreshExistingProSpritePivots(ROOT, `${unitId}_base`, unitId);
  }

  const templateCount = ensureWave2Templates(ROOT);
  const masterBiomesPromoted = promoteWave2MasterTilesets(ROOT);
  const tmjRes = buildFooshaVillageTmj(ROOT);
  const wave2MapResults = buildWave2HubTmjMaps(ROOT);
  const dropped = importUserDrops();
  const packDropped = await importRawPacksDrops();
  writeCreditsMarkdown();

  const optRes = await optimizeProAssetsPipeline({ rootDir: ROOT });
  await syncProManifestFiles(ROOT);

  console.log('✅ Pro Assets Imported, Optimized (Lossless WebP) & Verified:');
  if (luffyRes) console.log(`   • luffy_base (Aseprite Hash): ${luffyRes.frameCount} frames (${luffyRes.width}x${luffyRes.height})`);
  if (zoroRes) console.log(`   • zoro_base  (Aseprite Hash): ${zoroRes.frameCount} frames (${zoroRes.width}x${zoroRes.height})`);
  if (buggyRes) console.log(`   • buggy_base (Aseprite Hash): ${buggyRes.frameCount} frames (${buggyRes.width}x${buggyRes.height})`);
  for (const w of wave1GridResults) {
    console.log(`   • ${w.key} (Wave 1 NDS + TorsoPivot): ${w.frameCount} frames (${w.width}x${w.height}, idleH=${w.idleMedianH}px)`);
  }
  console.log(`   • Portraits promoted: ${portraitsCopied} | Boss 4-layer backdrops: ${bossBackdropsBuilt}`);
  console.log(`   • Wave 2 Templates (.tx): ${templateCount} | Master Biomes: ${masterBiomesPromoted}`);
  console.log(`   • foosha_village.tmj: ${tmjRes.cols}x${tmjRes.rows} (${tmjRes.lightCount} dynamic lights, ${tmjRes.collisionCount} collision boxes)`);
  for (const wm of wave2MapResults) {
    console.log(`   • ${wm.tmjName} (${wm.islandId}): ${wm.cols}x${wm.rows} (lights=${wm.lightCount}, chests=${wm.chestCount}, npcs=${wm.npcCount})`);
  }
  console.log(`   • User drops promoted: pro_drop=${dropped}, packs=${packDropped}`);
  console.log(`   • Lossless WebP: converted=${optRes.convertedCount}, saved=${(optRes.savedBytes / 1024).toFixed(1)} KB (${optRes.savedPercent}%)`);
}

main().catch((err) => {
  console.error('❌ import-pro-assets failed:', err);
  process.exit(1);
});
