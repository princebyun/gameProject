#!/usr/bin/env node
/**
 * Step 1: Export All Character & Form Thumbnails, Portraits, Contact Sheet & AI Upgrade Prompt Pack.
 * Run via: `npm run export:thumbnails` (node --import tsx scripts/export-thumbnails.mjs)
 *
 * Outputs into `exported_thumbnails/` (gitignored & excluded from Vite/PWA builds):
 *  - exported_thumbnails/units/{key}.png           (128x128 transparent PNG)
 *  - exported_thumbnails/units/{key}_bg.png        (128x128 solid #FF00FF or #00FF00 chroma PNG)
 *  - exported_thumbnails/portraits/{unitId}_normal.png (64x64 portrait PNG)
 *  - exported_thumbnails/contact_sheet.png         (full comparison grid with EXTERNAL/FALLBACK badges)
 *  - exported_thumbnails/prompt_pack.md            (copy-pasteable upgrade prompts per character/form)
 *  - exported_thumbnails/manifest.json             (machine-readable index for upgrade-sprites.mjs)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  drawBitmapText,
  installSoftwareDocumentShim
} from './lib/softwareCanvas2d.mjs';
import {
  blitNearestIntoCell,
  compositeOverSolidBg,
  decodePng,
  encodePng,
  extractTightRegion,
  selectSafeChromaBgHex
} from './lib/spriteImageOps.mjs';

installSoftwareDocumentShim();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const OUT_ROOT = path.join(ROOT, 'exported_thumbnails');
const OUT_UNITS = path.join(OUT_ROOT, 'units');
const OUT_PORTRAITS = path.join(OUT_ROOT, 'portraits');

function readJson(rel) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
}

function fillRectRgba(buf, strideW, strideH, x, y, w, h, r, g, b, a = 255) {
  const x0 = Math.max(0, Math.round(x));
  const y0 = Math.max(0, Math.round(y));
  const x1 = Math.min(strideW, Math.round(x + w));
  const y1 = Math.min(strideH, Math.round(y + h));
  for (let py = y0; py < y1; py++) {
    for (let px = x0; px < x1; px++) {
      const p = (py * strideW + px) * 4;
      buf[p] = r;
      buf[p + 1] = g;
      buf[p + 2] = b;
      buf[p + 3] = a;
    }
  }
}

function strokeRectRgba(buf, strideW, strideH, x, y, w, h, r, g, b) {
  fillRectRgba(buf, strideW, strideH, x, y, w, 1, r, g, b, 255);
  fillRectRgba(buf, strideW, strideH, x, y + h - 1, w, 1, r, g, b, 255);
  fillRectRgba(buf, strideW, strideH, x, y, 1, h, r, g, b, 255);
  fillRectRgba(buf, strideW, strideH, x + w - 1, y, 1, h, r, g, b, 255);
}

function blitRgbaOver(src, sw, sh, dst, dw, dh, dx, dy) {
  for (let y = 0; y < sh; y++) {
    const ty = dy + y;
    if (ty < 0 || ty >= dh) continue;
    for (let x = 0; x < sw; x++) {
      const tx = dx + x;
      if (tx < 0 || tx >= dw) continue;
      const sp = (y * sw + x) * 4;
      const sa = src[sp + 3];
      if (sa === 0) continue;
      const dp = (ty * dw + tx) * 4;
      if (sa === 255) {
        dst[dp] = src[sp];
        dst[dp + 1] = src[sp + 1];
        dst[dp + 2] = src[sp + 2];
        dst[dp + 3] = 255;
      } else {
        const a = sa / 255;
        dst[dp] = Math.round(src[sp] * a + dst[dp] * (1 - a));
        dst[dp + 1] = Math.round(src[sp + 1] * a + dst[dp + 1] * (1 - a));
        dst[dp + 2] = Math.round(src[sp + 2] * a + dst[dp + 2] * (1 - a));
        dst[dp + 3] = 255;
      }
    }
  }
}

function resolveTargetOutputFrameSize(entry, formDef) {
  if (entry.frameWidth >= 96 || (formDef && formDef.visualScale >= 1.55)) {
    return 96;
  }
  return 64;
}

function buildCharacterUpgradePrompt(item) {
  const { entry, unit, form, bp, chromaBgHex, targetFrameSize } = item;
  const formText = form
    ? `Transformed/Awakened Form: ${form.name} (${form.id}, category: ${form.formCategory ?? form.kind})`
    : `Base Combat Stance`;
  const bgName = chromaBgHex === '#00FF00' ? 'solid bright chroma-key green (#00FF00)' : 'solid bright chroma-key magenta (#FF00FF)';

  const visualTraits = [
    bp?.bodyType ? `body proportions: ${bp.bodyType}` : '2.5-head anime chibi proportions',
    bp?.hairStyle ? `hair: ${bp.hairStyle} (${bp.hairColor})` : '',
    bp?.hatStyle && bp.hatStyle !== 'none' ? `headgear: ${bp.hatStyle} (${bp.hatColor ?? ''})` : '',
    bp?.torsoStyle ? `outfit: ${bp.torsoStyle} (${bp.torsoColor}), sash ${bp.sashColor}, pants ${bp.pantsColor}` : '',
    bp?.capeStyle && bp.capeStyle !== 'none' ? `cape/coat: ${bp.capeStyle}` : '',
    bp?.weaponStyle && bp.weaponStyle !== 'none' ? `weapon/combat pose: ${bp.weaponStyle}` : '',
    bp?.hagoromoColor ? `floating Zoan awakening hagoromo cloud scarf (${bp.hagoromoColor})` : '',
    form?.auraColor ? `subtle aura accent (${form.auraColor})` : ''
  ]
    .filter(Boolean)
    .join('; ');

  return [
    `Create a single 2D retro pixel-art game sprite of One Piece character "${unit.name}" (${unit.title ?? unit.id}) — ${formText}.`,
    `STYLE REFERENCE: Match the EXACT pixel density, 2.5-head GBA/NDS One Piece Gigant Battle anime proportions, crisp 1px dark ink pixel outline, 3-step cel shading, and right-facing combat stance of the attached Luffy reference image (public/assets/sprites/luffy_base.png).`,
    `CHARACTER REFERENCE: Preserve the identity, silhouette, outfit colors, and iconic accessories shown in the attached thumbnail (${item.thumbRelPath}) — ${visualTraits}.`,
    `FRAMING & BACKGROUND: Single full-body character centered in frame facing RIGHT, feet planted horizontally near the bottom (anchor y=0.90), target normalized game resolution ${targetFrameSize}x${targetFrameSize}px, placed on a completely flat ${bgName} background with ZERO gradients, ZERO floor shadow, ZERO text, ZERO watermark.`
  ].join(' ');
}

async function main() {
  const { bakeProceduralUnitSpriteSheet } = await import('../src/assets/proceduralPixelSheetBaker.ts');
  const { resolveCharacterBlueprint } = await import('../src/assets/pixelArtPrimitives.ts');
  const { PixelPortraitRenderer } = await import('../src/render/sprite/pixelPortraitRenderer.ts');
  const { ExternalAssetResolver } = await import('../src/assets/externalAssetResolver.ts');
  const { resolveBakedFrameSize } = await import('../src/assets/smartSpriteSheetLoader.ts');

  const unitsArr = readJson('src/data/units.json');
  const formsArr = readJson('src/data/forms.json');
  const spritesFile = readJson('src/data/assets/sprites.json');

  const unitsById = Object.fromEntries(unitsArr.map((u) => [u.id, u]));
  const formsById = Object.fromEntries(formsArr.map((f) => [f.id, f]));

  fs.mkdirSync(OUT_UNITS, { recursive: true });
  fs.mkdirSync(OUT_PORTRAITS, { recursive: true });

  // Filter all registered unit + form entries (exclude 4 ships)
  const unitFormEntries = spritesFile.entries.filter((e) => !e.key.startsWith('ship_'));
  const portraitRenderer = new PixelPortraitRenderer(new ExternalAssetResolver());

  const exportedUnits = [];
  let externalSpriteCount = 0;
  let fallbackSpriteCount = 0;

  for (const entry of unitFormEntries) {
    const unit = unitsById[entry.unitId];
    if (!unit) continue;
    const form = entry.formId !== 'base' ? formsById[entry.formId] ?? null : null;
    const bp = resolveCharacterBlueprint(unit, form ? form.id : null);

    const extPngPath = path.join(ROOT, 'public', entry.src);
    const extMetaPath = extPngPath.replace(/\.png$/i, '.meta.json');
    let status = 'FALLBACK';
    let srcRgba = null;
    let srcW = 0;
    let srcH = 0;

    if (fs.existsSync(extPngPath)) {
      status = 'EXTERNAL';
      externalSpriteCount += 1;
      const dec = decodePng(fs.readFileSync(extPngPath));
      let cropX = 0;
      let cropY = 0;
      let cropW = dec.width;
      let cropH = dec.height;
      if (fs.existsSync(extMetaPath)) {
        try {
          const meta = JSON.parse(fs.readFileSync(extMetaPath, 'utf8'));
          const idleFrame = meta?.animations?.IDLE?.frames?.[0];
          if (idleFrame) {
            cropX = idleFrame.x;
            cropY = idleFrame.y;
            cropW = idleFrame.w;
            cropH = idleFrame.h;
          }
        } catch {
          // fallback to full or square
        }
      } else if (dec.width > dec.height && dec.width % dec.height === 0) {
        cropW = dec.height;
        cropH = dec.height;
      }

      const sub = new Uint8ClampedArray(cropW * cropH * 4);
      for (let y = 0; y < cropH; y++) {
        for (let x = 0; x < cropW; x++) {
          const sIdx = ((cropY + y) * dec.width + (cropX + x)) * 4;
          const dIdx = (y * cropW + x) * 4;
          sub[dIdx] = dec.rgba[sIdx];
          sub[dIdx + 1] = dec.rgba[sIdx + 1];
          sub[dIdx + 2] = dec.rgba[sIdx + 2];
          sub[dIdx + 3] = dec.rgba[sIdx + 3];
        }
      }
      srcRgba = sub;
      srcW = cropW;
      srcH = cropH;
    } else {
      fallbackSpriteCount += 1;
      const bakedCanvas = bakeProceduralUnitSpriteSheet(entry, unit, form);
      const bakedSize = resolveBakedFrameSize(entry.frameWidth);
      const sub = new Uint8ClampedArray(bakedSize * bakedSize * 4);
      const sheetW = bakedCanvas.width;
      for (let y = 0; y < bakedSize; y++) {
        for (let x = 0; x < bakedSize; x++) {
          const sIdx = (y * sheetW + x) * 4;
          const dIdx = (y * bakedSize + x) * 4;
          sub[dIdx] = bakedCanvas.data[sIdx];
          sub[dIdx + 1] = bakedCanvas.data[sIdx + 1];
          sub[dIdx + 2] = bakedCanvas.data[sIdx + 2];
          sub[dIdx + 3] = bakedCanvas.data[sIdx + 3];
        }
      }
      srcRgba = sub;
      srcW = bakedSize;
      srcH = bakedSize;
    }

    // Scale into crisp 128x128 transparent thumbnail (Nearest-Neighbor, foot-aligned)
    const tight = extractTightRegion(srcRgba, srcW, srcH);
    const thumbSize = 128;
    const thumbTransparent = new Uint8ClampedArray(thumbSize * thumbSize * 4);
    if (tight) {
      blitNearestIntoCell(
        tight.rgba,
        tight.width,
        tight.height,
        thumbTransparent,
        thumbSize,
        0,
        0,
        thumbSize,
        { mode: 'sprite', footY: 118, padX: 6, padTop: 6 }
      );
    }

    const chromaBgHex = selectSafeChromaBgHex(thumbTransparent, thumbSize, thumbSize, bp);
    const thumbBg = compositeOverSolidBg(thumbTransparent, thumbSize, thumbSize, chromaBgHex);

    const outTransPath = path.join(OUT_UNITS, `${entry.key}.png`);
    const outBgPath = path.join(OUT_UNITS, `${entry.key}_bg.png`);
    fs.writeFileSync(outTransPath, encodePng(thumbSize, thumbSize, thumbTransparent));
    fs.writeFileSync(outBgPath, encodePng(thumbSize, thumbSize, thumbBg));

    const targetFrameSize = resolveTargetOutputFrameSize(entry, form);
    const item = {
      key: entry.key,
      unitId: entry.unitId,
      formId: entry.formId,
      unitName: unit.name,
      unitTitle: unit.title ?? '',
      formName: form?.name ?? null,
      status,
      chromaBgHex,
      targetFrameSize,
      thumbRelPath: `exported_thumbnails/units/${entry.key}.png`,
      thumbBgRelPath: `exported_thumbnails/units/${entry.key}_bg.png`,
      thumbTransparent,
      entry,
      unit,
      form,
      bp
    };
    item.prompt = buildCharacterUpgradePrompt(item);
    exportedUnits.push(item);
  }

  // Export 64x64 portraits for all 44 units
  let externalPortraitCount = 0;
  const exportedPortraits = [];
  for (const unit of unitsArr) {
    const extPortPath = path.join(ROOT, 'public/assets/portraits', `${unit.id}_normal.png`);
    const outPortPath = path.join(OUT_PORTRAITS, `${unit.id}_normal.png`);
    let pStatus = 'FALLBACK';
    if (fs.existsSync(extPortPath)) {
      fs.copyFileSync(extPortPath, outPortPath);
      pStatus = 'EXTERNAL';
      externalPortraitCount += 1;
    } else {
      const bakedPort = portraitRenderer.bakeBustPortrait(unit, 'normal', null);
      if (bakedPort && bakedPort.data) {
        fs.writeFileSync(outPortPath, encodePng(bakedPort.width, bakedPort.height, bakedPort.data));
      }
    }
    exportedPortraits.push({
      unitId: unit.id,
      status: pStatus,
      relPath: `exported_thumbnails/portraits/${unit.id}_normal.png`
    });
  }

  // Build Contact Sheet PNG (10 cols grid, cell 148x174, header bar 42px)
  const cols = 10;
  const rows = Math.ceil(exportedUnits.length / cols);
  const cellW = 148;
  const cellH = 176;
  const headerH = 44;
  const sheetW = cols * cellW + 16;
  const sheetH = headerH + rows * cellH + 16;
  const sheetBuf = new Uint8ClampedArray(sheetW * sheetH * 4);
  fillRectRgba(sheetBuf, sheetW, sheetH, 0, 0, sheetW, sheetH, 11, 17, 32, 255);

  // Header Banner
  fillRectRgba(sheetBuf, sheetW, sheetH, 0, 0, sheetW, headerH, 23, 37, 64, 255);
  fillRectRgba(sheetBuf, sheetW, sheetH, 0, headerH - 2, sheetW, 2, 250, 204, 21, 255);
  drawBitmapText(
    sheetBuf,
    sheetW,
    sheetH,
    `ONE PIECE GRAND VOYAGE - CONTACT SHEET (${exportedUnits.length} UNITS/FORMS | EXTERNAL:${externalSpriteCount} FALLBACK:${fallbackSpriteCount})`,
    14,
    14,
    '#fde047',
    2
  );

  exportedUnits.forEach((item, idx) => {
    const c = idx % cols;
    const r = Math.floor(idx / cols);
    const x0 = 8 + c * cellW;
    const y0 = headerH + 8 + r * cellH;
    const isExt = item.status === 'EXTERNAL';

    // Cell card background
    fillRectRgba(sheetBuf, sheetW, sheetH, x0 + 2, y0 + 2, cellW - 4, cellH - 4, 15, 23, 42, 255);
    // Subtle checkerboard behind 128x128 thumbnail
    const tx0 = x0 + 10;
    const ty0 = y0 + 6;
    for (let cy = 0; cy < 128; cy += 16) {
      for (let cx = 0; cx < 128; cx += 16) {
        const dark = ((cx / 16 + cy / 16) & 1) === 0;
        fillRectRgba(
          sheetBuf,
          sheetW,
          sheetH,
          tx0 + cx,
          ty0 + cy,
          16,
          16,
          dark ? 20 : 28,
          dark ? 30 : 41,
          dark ? 50 : 64,
          255
        );
      }
    }
    blitRgbaOver(item.thumbTransparent, 128, 128, sheetBuf, sheetW, sheetH, tx0, ty0);

    // Card border (bright green for EXTERNAL, amber/slate for FALLBACK)
    strokeRectRgba(
      sheetBuf,
      sheetW,
      sheetH,
      x0 + 2,
      y0 + 2,
      cellW - 4,
      cellH - 4,
      isExt ? 74 : 71,
      isExt ? 222 : 85,
      isExt ? 128 : 105
    );

    // Key label (clipped to 22 chars)
    const shortKey = item.key.length > 22 ? item.key.slice(0, 21) : item.key;
    drawBitmapText(sheetBuf, sheetW, sheetH, shortKey, x0 + 6, y0 + 140, '#f8fafc', 1);

    // Status pill + target frame size + chroma key indicator
    fillRectRgba(
      sheetBuf,
      sheetW,
      sheetH,
      x0 + 6,
      y0 + 153,
      58,
      13,
      isExt ? 22 : 120,
      isExt ? 101 : 53,
      isExt ? 52 : 15,
      255
    );
    drawBitmapText(
      sheetBuf,
      sheetW,
      sheetH,
      isExt ? 'EXTERNAL' : 'FALLBACK',
      x0 + 9,
      y0 + 156,
      isExt ? '#bbf7d0' : '#fde68a',
      1
    );
    drawBitmapText(
      sheetBuf,
      sheetW,
      sheetH,
      `${item.targetFrameSize}PX ${item.chromaBgHex === '#00FF00' ? 'GRN' : 'MAG'}`,
      x0 + 70,
      y0 + 156,
      item.chromaBgHex === '#00FF00' ? '#86efac' : '#f0abfc',
      1
    );
  });

  const contactSheetPath = path.join(OUT_ROOT, 'contact_sheet.png');
  fs.writeFileSync(contactSheetPath, encodePng(sheetW, sheetH, sheetBuf));

  // Build prompt_pack.md
  const mdLines = [
    '# One Piece Grand Voyage — 전 캐릭터 도트 고도화 프롬프트팩 (루피 화풍 통일)',
    '',
    `- **총 등록 유닛/폼:** ${exportedUnits.length}종 (EXTERNAL: ${externalSpriteCount}종, FALLBACK: ${fallbackSpriteCount}종)`,
    `- **초상화 추출:** ${exportedPortraits.length}종 (EXTERNAL: ${externalPortraitCount}종)`,
    `- **공통 화풍 레퍼런스 첨부 파일:** \`public/assets/sprites/luffy_base.png\``,
    `- **출력 저장 경로:** 생성된 이미지를 \`raw_assets/{key}.png\`에 저장한 뒤 \`npm run sync:sprites\` 실행`,
    '',
    '---',
    ''
  ];

  for (const item of exportedUnits) {
    const label = item.formName
      ? `${item.unitName} — ${item.formName}`
      : `${item.unitName} (기본 폼)`;
    mdLines.push(`## \`${item.key}\` — ${label} [${item.status}]`);
    mdLines.push(`- **참조 썸네일 (투명 / 크로마키):** \`${item.thumbRelPath}\` / \`${item.thumbBgRelPath}\``);
    mdLines.push(`- **권장 크로마키 배경:** \`${item.chromaBgHex}\` | **게임 정규화 규격:** \`${item.targetFrameSize}x${item.targetFrameSize}\``);
    mdLines.push(`- **저장할 파일명:** \`raw_assets/${item.key}.png\``);
    mdLines.push('');
    mdLines.push('```text');
    mdLines.push(item.prompt);
    mdLines.push('```');
    mdLines.push('');
  }

  fs.writeFileSync(path.join(OUT_ROOT, 'prompt_pack.md'), mdLines.join('\n'), 'utf8');

  // Machine-readable manifest.json for upgrade-sprites.mjs
  const manifestData = {
    generatedAt: new Date().toISOString(),
    styleReference: 'public/assets/sprites/luffy_base.png',
    totals: {
      unitForms: exportedUnits.length,
      externalSprites: externalSpriteCount,
      fallbackSprites: fallbackSpriteCount,
      portraits: exportedPortraits.length,
      externalPortraits: externalPortraitCount
    },
    entries: exportedUnits.map((i) => ({
      key: i.key,
      unitId: i.unitId,
      formId: i.formId,
      unitName: i.unitName,
      formName: i.formName,
      status: i.status,
      chromaBgHex: i.chromaBgHex,
      targetFrameSize: i.targetFrameSize,
      thumbRelPath: i.thumbRelPath,
      thumbBgRelPath: i.thumbBgRelPath,
      prompt: i.prompt
    }))
  };
  fs.writeFileSync(
    path.join(OUT_ROOT, 'manifest.json'),
    JSON.stringify(manifestData, null, 2) + '\n',
    'utf8'
  );

  console.log('✅ Export Thumbnails COMPLETE!');
  console.log(`   • Units/Forms exported: ${exportedUnits.length} (128x128 transparent + chroma-bg = ${exportedUnits.length * 2} PNGs)`);
  console.log(`   • Portraits exported:   ${exportedPortraits.length} (64x64 PNGs)`);
  console.log(`   • Sprite Status:        EXTERNAL=${externalSpriteCount}, FALLBACK=${fallbackSpriteCount}`);
  console.log(`   • Contact Sheet:        exported_thumbnails/contact_sheet.png (${sheetW}x${sheetH})`);
  console.log(`   • Prompt Pack:          exported_thumbnails/prompt_pack.md`);
}

main().catch((err) => {
  console.error('❌ export-thumbnails failed:', err);
  process.exit(1);
});
