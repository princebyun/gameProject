import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  loadSheetRecipe,
  sliceAndPackIrregularSheet
} from './lib/irregularSheetSlicer.mjs';
import {
  decodePng,
  encodeImageToPng,
  isValidPngBuffer,
  resizeNearest
} from './lib/pngCodec.mjs';
import { extractZipToDir } from './lib/zipReader.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const EMOTIONS = ['normal', 'angry', 'determined', 'shocked', 'smirk', 'sad', 'excited', 'battle_cry'];

function normalizeToken(str) {
  return str
    .toLowerCase()
    .replace(/\.png$/i, '')
    .replace(/[^a-z0-9_]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function resolveSpriteKeyFromFile(relPath, spriteMap, unitBaseMap) {
  const baseName = path.basename(relPath, '.png');
  const normBase = normalizeToken(baseName);
  if (spriteMap.has(normBase)) return normBase;

  const normFull = normalizeToken(relPath.replace(/[\\/]+/g, '_'));
  if (spriteMap.has(normFull)) return normFull;

  const stripped = normBase.replace(/_(pack|sheet|sprites?|custom)$/g, '');
  if (spriteMap.has(stripped)) return stripped;

  const allKeys = Array.from(spriteMap.keys()).sort((a, b) => b.length - a.length);
  for (const key of allKeys) {
    if (normFull === key || normFull.startsWith(`${key}_`) || normFull.endsWith(`_${key}`)) {
      return key;
    }
  }

  const units = Array.from(unitBaseMap.keys()).sort((a, b) => b.length - a.length);
  for (const uid of units) {
    if (stripped === uid || stripped.startsWith(`${uid}_`) || normFull.startsWith(`${uid}_`)) {
      return unitBaseMap.get(uid);
    }
  }
  return null;
}

function resolvePortraitTarget(relPath, unitIds) {
  const normBase = normalizeToken(path.basename(relPath, '.png'));
  const normFull = normalizeToken(relPath.replace(/[\\/]+/g, '_'));
  if (!normFull.includes('portrait') && !normFull.includes('mug')) return null;

  const sortedUnits = Array.from(unitIds).sort((a, b) => b.length - a.length);
  for (const uid of sortedUnits) {
    if (!normFull.includes(uid)) continue;
    for (const emo of EMOTIONS) {
      if (normBase.endsWith(`_${emo.toLowerCase()}`)) {
        return { unitId: uid, emotions: [emo] };
      }
    }
    return { unitId: uid, emotions: ['normal'] };
  }
  return null;
}

function collectPngFiles(dir, rootDir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectPngFiles(abs, rootDir, out);
    } else if (entry.isFile() && entry.name.toLowerCase().endsWith('.png')) {
      out.push({ abs, rel: path.relative(rootDir, abs) });
    }
  }
  return out;
}

function regenerateMissingReport(spritesManifest, spritesDir, rootDir) {
  const acquired = new Set();
  for (const entry of spritesManifest.entries) {
    if (entry.shipId) continue;
    const metaPath = path.join(spritesDir, `${entry.key}.meta.json`);
    if (!fs.existsSync(metaPath)) continue;
    try {
      const meta = JSON.parse(fs.readFileSync(metaPath, 'utf-8'));
      if (meta.source === 'EXTERNAL_WEB_SHEET' || meta.source === 'USER_CUSTOM_SHEET') {
        acquired.add(entry.key);
      }
    } catch {
      // ignore invalid meta
    }
  }

  const unitEntries = spritesManifest.entries.filter((e) => !e.shipId);
  const missingEntries = unitEntries.filter((e) => !acquired.has(e.key));
  const lines = [
    '# MISSING_SPRITES.md — 외부 원피스 캐릭터 도트 시트 수급 현황 및 추가 가이드',
    '',
    `> **최종 갱신:** ${new Date().toISOString()}`,
    `> **외부/사용자 원피스 도트 시트 확보:** **${acquired.size} / ${unitEntries.length}종** (나머지 ${missingEntries.length}종은 6종 관절 픽셀 리그 시트로 안전 유지 중)`,
    '',
    '## 1. 안내',
    '- 아래 목록은 외부 아카이브 미수집 또는 변신 폼 시트입니다. 커스텀 비규격 PNG 시트나 `.zip` 팩을 **`raw_assets/packs/`** 폴더에 넣은 뒤 **`npm run import:pack`** 을 실행하면 상단 헤더·구분선·텍스트 라벨을 자동 제외하고 몸통 중심 피벗까지 계산해 등록됩니다.',
    '',
    '## 2. 원클릭 임포트 및 디버그 검수 사용법',
    '```powershell',
    '# 1) raw_assets/packs/ 폴더에 {spriteKey}.png 또는 캐릭터명.zip (선택적으로 .recipe.json) 투입',
    'npm run import:pack',
    '',
    '# 2) 실제 반영 전 디버그 오버레이(exported_thumbnails/import_debug/*.png)만 미리 확인',
    'npm run import:pack -- --file=kaido_base.png --preview-only',
    '',
    '# 3) 무결성 검증',
    'npm run validate:assets',
    '```',
    '',
    '## 3. 미수집 캐릭터·변신 폼 목록 & 추천 검색 키워드',
    '| Sprite Key | Unit ID | Form / Role | 추천 검색 키워드 | 드롭 경로 (`raw_assets/packs/`) |',
    '| :--- | :--- | :--- | :--- | :--- |'
  ];

  const keywordHint = {
    kaido: 'Kaido One Piece JUS / MUGEN sprite sheet png',
    katakuri: 'Charlotte Katakuri One Piece sprite sheet png',
    king: 'King The Wildfire One Piece sprite sheet png',
    s_hawk: 'Seraphim S-Hawk Mihawk One Piece sprite sheet png',
    saturn: 'Saint Jaygarcia Saturn One Piece sprite sheet png',
    loki: 'Loki Elbaf One Piece pixel sprite sheet png',
    morgan: 'Axe-Hand Morgan One Piece sprite sheet png',
    blueno: 'Blueno CP9 One Piece sprite sheet png',
    doppelman: 'Gecko Moria Doppelman shadow sprite sheet png'
  };

  for (const e of missingEntries) {
    const uid = e.unitId || e.key;
    const hint = keywordHint[uid] || `${uid.replace(/^unit_/, '')} One Piece pixel sprite sheet png`;
    lines.push(`| \`${e.key}\` | \`${uid}\` | ${e.formId || 'base'} | ${hint} | \`raw_assets/packs/${e.key}.png\` |`);
  }

  fs.writeFileSync(path.join(rootDir, 'MISSING_SPRITES.md'), `${lines.join('\n')}\n`, 'utf-8');
  return { acquiredCount: acquired.size, missingCount: missingEntries.length };
}

/**
 * Irregular sprite sheet importer (`npm run import:pack`).
 * Supports `.png` and `.zip` inputs, `.recipe.json` overrides, multi-layer background &
 * divider removal, header/text filtering, satellite part merging, torso-weighted pivots,
 * VARIABLE_PACK atlas export, debug overlay PNG generation, and portrait extraction.
 */
export function runImportSpritePack(options = {}) {
  const rootDir = options.rootDir || ROOT;
  const packsDir = options.packsDir || path.join(rootDir, 'raw_assets', 'packs');
  const spritesJsonPath = path.join(rootDir, 'src', 'data', 'assets', 'sprites.json');
  const spritesDir = path.join(rootDir, 'public', 'assets', 'sprites');
  const portraitsDir = path.join(rootDir, 'public', 'assets', 'portraits');
  const debugDir = path.join(rootDir, 'exported_thumbnails', 'import_debug');

  fs.mkdirSync(packsDir, { recursive: true });
  fs.mkdirSync(spritesDir, { recursive: true });
  fs.mkdirSync(portraitsDir, { recursive: true });

  const previewOnly = Boolean(options.previewOnly);
  const fileFilter = options.file ? normalizeToken(path.basename(options.file, '.png')) : null;
  const spritesManifest = JSON.parse(fs.readFileSync(spritesJsonPath, 'utf-8'));
  const spriteMap = new Map();
  const unitBaseMap = new Map();
  const unitIds = new Set();

  for (const entry of spritesManifest.entries) {
    spriteMap.set(entry.key.toLowerCase(), entry);
    if (entry.unitId) {
      unitIds.add(entry.unitId);
      if ((entry.formId || 'base') === 'base') {
        unitBaseMap.set(entry.unitId, entry.key);
      }
    }
  }

  const topEntries = fs.readdirSync(packsDir, { withFileTypes: true });
  const zipFiles = topEntries
    .filter((d) => d.isFile() && d.name.toLowerCase().endsWith('.zip'))
    .map((d) => path.join(packsDir, d.name));

  const tempExtractRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opgv-pack-'));
  let candidates = collectPngFiles(packsDir, packsDir);

  try {
    for (const zf of zipFiles) {
      const subDir = path.join(tempExtractRoot, path.basename(zf, '.zip'));
      const extracted = extractZipToDir(zf, subDir, ['.png']);
      for (const filePath of extracted) {
        candidates.push({
          abs: filePath,
          rel: `${path.basename(zf, '.zip')}/${path.relative(subDir, filePath)}`
        });
      }
    }

    if (fileFilter) {
      candidates = candidates.filter((c) => {
        const baseNorm = normalizeToken(path.basename(c.rel, '.png'));
        const fullNorm = normalizeToken(c.rel.replace(/[\\/]+/g, '_'));
        return baseNorm === fileFilter || fullNorm === fileFilter || path.basename(c.rel) === options.file;
      });
    }

    if (candidates.length === 0) {
      const report = previewOnly
        ? { acquiredCount: 0, missingCount: 0 }
        : regenerateMissingReport(spritesManifest, spritesDir, rootDir);
      console.log(`ℹ️ No matching .zip or .png packs found in ${packsDir}`);
      console.log(`   Drop {spriteKey}.png or {character}.zip into raw_assets/packs/ and re-run npm run import:pack.`);
      return { importedSprites: 0, importedPortraits: 0, skipped: 0, debugOutputs: [], ...report };
    }

    let importedSprites = 0;
    let importedPortraits = 0;
    let skipped = 0;
    const debugOutputs = [];

    for (const file of candidates) {
      const buf = fs.readFileSync(file.abs);
      if (!isValidPngBuffer(buf)) {
        skipped += 1;
        continue;
      }

      const portraitTarget = resolvePortraitTarget(file.rel, unitIds);
      if (portraitTarget && !previewOnly) {
        const raw = decodePng(buf);
        const side = Math.max(64, Math.min(256, Math.max(raw.width, raw.height)));
        const outPortrait = raw.width === raw.height && raw.width >= 64
          ? raw
          : resizeNearest(raw, side, side);
        const pngOut = encodeImageToPng(outPortrait);
        for (const emo of portraitTarget.emotions) {
          fs.writeFileSync(path.join(portraitsDir, `${portraitTarget.unitId}_${emo}.png`), pngOut);
          importedPortraits += 1;
        }
        continue;
      }

      const matchedKey = resolveSpriteKeyFromFile(file.rel, spriteMap, unitBaseMap);
      if (!matchedKey) {
        console.warn(`   ⚠️ Unmatched sprite pack file: ${file.rel} (name file as e.g. kaido_base.png)`);
        skipped += 1;
        continue;
      }

      const entry = spriteMap.get(matchedKey);
      const unitId = entry.unitId || matchedKey.split('_')[0];
      const formId = entry.formId || 'base';
      const recipe = loadSheetRecipe(packsDir, entry.key, unitId, formId);
      const slicerOpts = {
        ...(typeof options.tolerance === 'number' ? { tolerance: options.tolerance } : {}),
        ...(typeof options.flipHorizontal === 'boolean' ? { flipHorizontal: options.flipHorizontal } : {}),
        ...(typeof options.scale === 'number' ? { scale: options.scale } : {}),
        ...(typeof options.keepPortraits === 'boolean' ? { keepPortraits: options.keepPortraits } : {})
      };

      const sliced = sliceAndPackIrregularSheet(
        buf,
        { key: entry.key, unitId, formId },
        slicerOpts,
        recipe
      );

      fs.mkdirSync(debugDir, { recursive: true });
      const debugPath = path.join(debugDir, `${entry.key}_debug.png`);
      fs.writeFileSync(debugPath, sliced.debugPngBuffer);
      debugOutputs.push(debugPath);

      if (previewOnly) {
        console.log(
          `   🔍 [Preview Only] ${entry.key}: ${sliced.analysis.frames.length} frame(s), ${sliced.analysis.rows.length} row(s), ${sliced.analysis.excludedRegions.length} excluded region(s) -> ${path.relative(rootDir, debugPath)}`
        );
        continue;
      }

      fs.writeFileSync(path.join(spritesDir, `${entry.key}.png`), sliced.pngBuffer);
      const sha256 = crypto.createHash('sha256').update(sliced.pngBuffer).digest('hex');
      const meta = {
        key: entry.key,
        unitId,
        formId,
        rigType: entry.rigType || 'humanoid_brawler',
        atlasMode: 'VARIABLE_PACK',
        frameWidth: sliced.packed.frameWidth,
        frameHeight: sliced.packed.frameHeight,
        sheetWidth: sliced.packed.atlasSurface.width,
        sheetHeight: sliced.packed.atlasSurface.height,
        anchor: { x: 0.5, y: 0.9 },
        source: 'USER_CUSTOM_SHEET',
        sha256,
        bakedAt: new Date().toISOString(),
        animations: sliced.packed.animations
      };
      fs.writeFileSync(
        path.join(spritesDir, `${entry.key}.meta.json`),
        `${JSON.stringify(meta, null, 2)}\n`,
        'utf-8'
      );

      entry.source = 'USER_CUSTOM_SHEET';
      entry.atlasMode = 'VARIABLE_PACK';
      entry.frameWidth = sliced.packed.frameWidth;
      entry.frameHeight = sliced.packed.frameHeight;
      entry.targetDisplayHeight = entry.targetDisplayHeight ?? 96;
      entry.animations = sliced.packed.animations;

      const normalPortraitPath = path.join(portraitsDir, `${unitId}_normal.png`);
      const keepExistingPortrait = Boolean(slicerOpts.keepPortraits) || Boolean(recipe?.options.keepPortraits);
      if (sliced.portraitPngBuffer && (!keepExistingPortrait || !fs.existsSync(normalPortraitPath))) {
        fs.writeFileSync(normalPortraitPath, sliced.portraitPngBuffer);
        importedPortraits += 1;
      }

      importedSprites += 1;
      console.log(
        `   ✅ Imported ${entry.key} [VARIABLE_PACK ${sliced.packed.totalUniqueFrames}f, ${sliced.packed.atlasSurface.width}x${sliced.packed.atlasSurface.height}, debug=${path.relative(rootDir, debugPath)}]`
      );
    }

    if (!previewOnly && importedSprites > 0) {
      fs.writeFileSync(spritesJsonPath, `${JSON.stringify(spritesManifest, null, 2)}\n`, 'utf-8');
    }
    const report = previewOnly
      ? { acquiredCount: 0, missingCount: 0 }
      : regenerateMissingReport(spritesManifest, spritesDir, rootDir);
    console.log(`\n🎉 Pack import finished: ${importedSprites} sprite(s), ${importedPortraits} portrait(s), ${skipped} skipped, ${debugOutputs.length} debug overlay(s).`);
    return { importedSprites, importedPortraits, skipped, debugOutputs, ...report };
  } finally {
    fs.rmSync(tempExtractRoot, { recursive: true, force: true });
  }
}

export function parseCliArgs(argv) {
  const opts = {};
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--dir' && argv[i + 1]) {
      opts.packsDir = path.resolve(argv[i + 1]);
      i += 1;
    } else if (arg.startsWith('--dir=')) {
      opts.packsDir = path.resolve(arg.slice('--dir='.length));
    } else if (arg.startsWith('--file=')) {
      opts.file = arg.slice('--file='.length).trim();
    } else if (arg === '--file' && argv[i + 1]) {
      opts.file = argv[i + 1].trim();
      i += 1;
    } else if (arg === '--preview-only') {
      opts.previewOnly = true;
    } else if (arg === '--flip-x') {
      opts.flipHorizontal = true;
    } else if (arg === '--keep-portraits') {
      opts.keepPortraits = true;
    } else if (arg.startsWith('--tolerance=')) {
      const tol = Number(arg.slice('--tolerance='.length));
      if (!Number.isNaN(tol)) opts.tolerance = tol;
    } else if (arg.startsWith('--scale=')) {
      const sc = Number(arg.slice('--scale='.length));
      if (!Number.isNaN(sc) && sc > 0) opts.scale = sc;
    }
  }
  return opts;
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(__filename)) {
  runImportSpritePack(parseCliArgs(process.argv.slice(2)));
}
