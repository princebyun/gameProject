#!/usr/bin/env node
/**
 * Step 2: Incremental Batch Sync from `raw_assets/` -> `public/assets/sprites/` + `.meta.json`
 *         + `public/assets/portraits/` + `src/data/assets/sprites.json`.
 * Run via: `npm run sync:sprites` (or `npm run sync:sprites -- --force`)
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  blitNearestIntoCell,
  cleanChromaAndDefringe,
  cropUpperBustPortrait,
  decodePng,
  encodePng,
  ensureCrispDarkPixelOutline,
  extractTightRegion,
  PORTRAIT_EMOTIONS_8,
  purgeResidualChromaEdges,
  sliceHorizontalActionStrip,
  slicePortraitGrid4x2,
  stripDetachedCornerArtifacts
} from './lib/spriteImageOps.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const RAW_DIR = path.join(ROOT, 'raw_assets');
const OUT_SPRITES_DIR = path.join(ROOT, 'public/assets/sprites');
const OUT_PORTRAITS_DIR = path.join(ROOT, 'public/assets/portraits');
const SPRITES_JSON_PATH = path.join(ROOT, 'src/data/assets/sprites.json');
const CACHE_PATH = path.join(RAW_DIR, '.sync-cache.json');

const ACTION_SUFFIX_TO_STATE = {
  idle: 'IDLE',
  move: 'MOVE',
  walk: 'MOVE',
  run: 'MOVE',
  windup: 'WINDUP',
  attack_melee: 'ATTACK_MELEE',
  attack: 'ATTACK_MELEE',
  melee: 'ATTACK_MELEE',
  attack_cast: 'ATTACK_CAST',
  cast: 'ATTACK_CAST',
  clash: 'CLASH',
  dodge: 'DODGE',
  hit: 'HIT',
  downed: 'DOWNED',
  transform: 'TRANSFORM',
  victory: 'VICTORY'
};

function readJson(p) {
  return JSON.parse(fs.readFileSync(p, 'utf8'));
}

function getFileStamp(absPath) {
  const st = fs.statSync(absPath);
  return `${st.size}:${Math.round(st.mtimeMs)}`;
}

/**
 * Classifies a raw_assets filename against known sprites.json keys and portrait patterns.
 */
export function parseRawAssetFileName(fileName, validSpriteKeysSet, validUnitIdsSet) {
  const stem = fileName.replace(/\.png$/i, '');
  const lower = stem.toLowerCase();

  // 1) Portrait 4x2 sheet: portrait_{unitId}_sheet.png
  const sheetMatch = lower.match(/^portrait_([a-z0-9_]+)_sheet$/);
  if (sheetMatch && validUnitIdsSet.has(sheetMatch[1])) {
    return { kind: 'PORTRAIT_SHEET', unitId: sheetMatch[1], fileName };
  }

  // 2) Single emotion portrait: portrait_{unitId}_{emotion}.png
  for (const emo of PORTRAIT_EMOTIONS_8) {
    const m = lower.match(new RegExp(`^portrait_([a-z0-9_]+)_${emo}$`));
    if (m && validUnitIdsSet.has(m[1])) {
      return { kind: 'PORTRAIT_SINGLE', unitId: m[1], emotion: emo, fileName };
    }
  }

  // 3) Exact sprite key match: {unitId}_{formId}.png (e.g., luffy_base.png, kaido_form_kaido_beast.png)
  if (validSpriteKeysSet.has(lower)) {
    return { kind: 'SPRITE_STANDING', spriteKey: lower, fileName };
  }

  // 4) Action strip match: {spriteKey}_{action}.png (sorted longest suffix first so attack_melee matches before melee)
  const suffixes = Object.keys(ACTION_SUFFIX_TO_STATE).sort((a, b) => b.length - a.length);
  for (const suf of suffixes) {
    if (lower.endsWith(`_${suf}`)) {
      const baseKey = lower.slice(0, -(suf.length + 1));
      if (validSpriteKeysSet.has(baseKey)) {
        return {
          kind: 'SPRITE_ACTION',
          spriteKey: baseKey,
          actionState: ACTION_SUFFIX_TO_STATE[suf],
          fileName
        };
      }
      // Allow shorthand `{unitId}_{action}.png` -> defaults to `{unitId}_base`
      const baseShort = `${baseKey}_base`;
      if (validSpriteKeysSet.has(baseShort)) {
        return {
          kind: 'SPRITE_ACTION',
          spriteKey: baseShort,
          actionState: ACTION_SUFFIX_TO_STATE[suf],
          fileName
        };
      }
    }
  }

  // 5) Shorthand `{unitId}.png` -> maps to `{unitId}_base`
  if (validUnitIdsSet.has(lower) && validSpriteKeysSet.has(`${lower}_base`)) {
    return { kind: 'SPRITE_STANDING', spriteKey: `${lower}_base`, fileName };
  }

  return { kind: 'UNKNOWN', fileName };
}

function resolveNormalizedFrameSize(spriteEntry, formDef, baseSizeOverride = null) {
  if (spriteEntry.frameWidth >= 96 || (formDef && formDef.visualScale >= 1.55)) {
    return 96;
  }
  if (spriteEntry.frameWidth >= 48) {
    return 64;
  }
  return baseSizeOverride ?? 64;
}

function detectChromaKeyMode(keyHex) {
  if (!keyHex || keyHex === 'TRANSPARENT') return 'auto';
  const r = parseInt(keyHex.slice(1, 3), 16) || 0;
  const g = parseInt(keyHex.slice(3, 5), 16) || 0;
  const b = parseInt(keyHex.slice(5, 7), 16) || 0;
  if (g > 175 && r < 95 && b < 95) return 'green';
  if (r > 175 && b > 175 && g < 90) return 'magenta';
  return 'auto';
}

function processSpriteGroup(spriteKey, group, spriteEntry, formDef, opts) {
  const cellSize = resolveNormalizedFrameSize(spriteEntry, formDef, opts.baseSize);
  const footY = Math.round(cellSize * 0.9375); // ~60/64 or 90/96
  const pivotY = Number((footY / cellSize).toFixed(2));

  const packedFrames = []; // { state, region, pivotX, pivotY, scale }
  let masterIdleRegion = null;
  let referenceScale = null;
  let chromaModeForPurge = 'auto';

  // 1) Standing Master (IDLE)
  if (group.standingFile) {
    const dec = decodePng(fs.readFileSync(path.join(RAW_DIR, group.standingFile)));
    const cleaned = cleanChromaAndDefringe(dec.rgba, dec.width, dec.height);
    chromaModeForPurge = detectChromaKeyMode(cleaned.keyHex);
    stripDetachedCornerArtifacts(cleaned.rgba, dec.width, dec.height);

    // If aspect ratio >= 1.85 and width/height suggests 4-frame strip inside main file, still slice cleanly
    const tight = extractTightRegion(cleaned.rgba, dec.width, dec.height);
    if (tight) {
      masterIdleRegion = tight;
      referenceScale = (footY - 4) / tight.height;
      packedFrames.push({
        state: 'IDLE',
        region: tight,
        pivotX: 0.5,
        pivotY,
        scale: referenceScale
      });
    }
  }

  // 2) Action Strips (ATTACK_MELEE, MOVE, etc.)
  const actionEntries = Object.entries(group.actions).sort(([a], [b]) => a.localeCompare(b));
  for (const [actionState, fileName] of actionEntries) {
    const dec = decodePng(fs.readFileSync(path.join(RAW_DIR, fileName)));
    const cleaned = cleanChromaAndDefringe(dec.rgba, dec.width, dec.height);
    chromaModeForPurge = detectChromaKeyMode(cleaned.keyHex);
    stripDetachedCornerArtifacts(cleaned.rgba, dec.width, dec.height);

    let regions;
    // Special precision seam for luffy_base_attack_melee.png (frame 1 & 2 foot contact)
    if (fileName.toLowerCase() === 'luffy_base_attack_melee.png' && dec.width === 1024) {
      const preds = [
        (x) => x <= 263,
        (x, y) => x >= 265 && (y < 380 ? x <= 564 : x <= 511),
        (x, y) => (y < 380 ? x >= 565 : x >= 512) && (y < 298 ? x <= 798 : x <= 762),
        (x, y) => (y < 298 ? x >= 799 : x >= 763)
      ];
      regions = preds
        .map((pred) => extractTightRegion(cleaned.rgba, dec.width, dec.height, 0, 0, dec.width - 1, dec.height - 1, pred))
        .filter(Boolean);
    } else if (dec.width / dec.height >= 1.65) {
      regions = sliceHorizontalActionStrip(cleaned.rgba, dec.width, dec.height, 4);
    } else {
      const single = extractTightRegion(cleaned.rgba, dec.width, dec.height);
      regions = single ? [single] : [];
    }

    if (regions.length === 0) continue;
    const maxH = Math.max(...regions.map((r) => r.height));
    const stripScale = (footY - 4) / maxH;
    regions.forEach((reg, idx) => {
      const isExtendedStrike =
        (actionState === 'ATTACK_MELEE' || actionState === 'ATTACK_CAST') &&
        regions.length >= 3 &&
        (idx === 1 || idx === 2);
      packedFrames.push({
        state: actionState,
        region: reg,
        pivotX: isExtendedStrike ? 0.42 : 0.5,
        pivotY,
        scale: stripScale
      });
    });
  }

  if (packedFrames.length === 0) {
    return null;
  }

  // Pack all frames horizontally into a clean Atlas PNG (N * cellSize x cellSize)
  const sheetW = packedFrames.length * cellSize;
  const sheetH = cellSize;
  const sheetRgba = new Uint8ClampedArray(sheetW * sheetH * 4);
  const animBuckets = {};

  packedFrames.forEach((pf, idx) => {
    const cellX = idx * cellSize;
    const cellBuf = new Uint8ClampedArray(cellSize * cellSize * 4);
    blitNearestIntoCell(
      pf.region.rgba,
      pf.region.width,
      pf.region.height,
      cellBuf,
      cellSize,
      0,
      0,
      cellSize,
      { mode: 'sprite', scale: pf.scale, footY, padX: 1, padTop: 2 }
    );
    purgeResidualChromaEdges(cellBuf, cellSize, cellSize, chromaModeForPurge);
    ensureCrispDarkPixelOutline(cellBuf, cellSize, cellSize);

    // Copy cell into atlas strip
    for (let y = 0; y < cellSize; y++) {
      for (let x = 0; x < cellSize; x++) {
        const sIdx = (y * cellSize + x) * 4;
        const dIdx = (y * sheetW + (cellX + x)) * 4;
        sheetRgba[dIdx] = cellBuf[sIdx];
        sheetRgba[dIdx + 1] = cellBuf[sIdx + 1];
        sheetRgba[dIdx + 2] = cellBuf[sIdx + 2];
        sheetRgba[dIdx + 3] = cellBuf[sIdx + 3];
      }
    }

    if (!animBuckets[pf.state]) animBuckets[pf.state] = [];
    animBuckets[pf.state].push({
      x: cellX,
      y: 0,
      w: cellSize,
      h: cellSize,
      pivotX: pf.pivotX,
      pivotY: pf.pivotY
    });
  });

  // Build animations map for .meta.json (unregistered states fall back cleanly to real IDLE PNG!)
  const animations = {};
  for (const [st, frames] of Object.entries(animBuckets)) {
    animations[st] = {
      fps: st === 'IDLE' ? 5 : st === 'MOVE' ? 10 : st === 'ATTACK_MELEE' ? 14 : 12,
      loop: st === 'IDLE' || st === 'MOVE' || st === 'CLASH' || st === 'VICTORY' || st === 'DOWNED',
      ...(st === 'ATTACK_MELEE' && frames.length >= 3 ? { hitFrame: 2 } : {}),
      ...(st === 'ATTACK_CAST' && frames.length >= 2 ? { hitFrame: 1 } : {}),
      frames
    };
  }
  // Helpful automatic derived clips if ATTACK_MELEE exists without WINDUP/CAST/CLASH
  if (animations.ATTACK_MELEE && !animations.WINDUP) {
    animations.WINDUP = { fps: 10, loop: false, frames: [animations.ATTACK_MELEE.frames[0]] };
  }
  if (animations.ATTACK_MELEE && !animations.ATTACK_CAST) {
    animations.ATTACK_CAST = {
      fps: 12,
      loop: false,
      hitFrame: Math.min(1, animations.ATTACK_MELEE.frames.length - 1),
      frames: animations.ATTACK_MELEE.frames.slice(0, 3)
    };
  }
  if (animations.ATTACK_MELEE && !animations.CLASH && animations.ATTACK_MELEE.frames.length >= 3) {
    animations.CLASH = {
      fps: 12,
      loop: true,
      frames: [animations.ATTACK_MELEE.frames[1], animations.ATTACK_MELEE.frames[2]]
    };
  }

  const metaJson = {
    version: '1.0.0',
    mode: 'atlas',
    chromaKey: { enabled: false },
    frameWidth: cellSize,
    frameHeight: cellSize,
    animations
  };

  fs.mkdirSync(OUT_SPRITES_DIR, { recursive: true });
  const outPngPath = path.join(OUT_SPRITES_DIR, `${spriteKey}.png`);
  const outMetaPath = path.join(OUT_SPRITES_DIR, `${spriteKey}.meta.json`);
  fs.writeFileSync(outPngPath, encodePng(sheetW, sheetH, sheetRgba));
  fs.writeFileSync(outMetaPath, JSON.stringify(metaJson, null, 2) + '\n', 'utf8');

  // Auto-generate upper-body portrait `{unitId}_normal.png` ONLY if unit is base form and no portrait exists yet
  let autoPortraitCreated = false;
  if (spriteEntry.formId === 'base' && masterIdleRegion) {
    fs.mkdirSync(OUT_PORTRAITS_DIR, { recursive: true });
    const outPortPath = path.join(OUT_PORTRAITS_DIR, `${spriteEntry.unitId}_normal.png`);
    if (!fs.existsSync(outPortPath) && !group.hasDedicatedPortrait) {
      const bustRgba = cropUpperBustPortrait(
        masterIdleRegion.rgba,
        masterIdleRegion.width,
        masterIdleRegion.height,
        64
      );
      purgeResidualChromaEdges(bustRgba, 64, 64, chromaModeForPurge);
      ensureCrispDarkPixelOutline(bustRgba, 64, 64);
      fs.writeFileSync(outPortPath, encodePng(64, 64, bustRgba));
      autoPortraitCreated = true;
    }
  }

  return {
    spriteKey,
    cellSize,
    frameCount: packedFrames.length,
    states: Object.keys(animations),
    autoPortraitCreated
  };
}

function processPortraitSheetFile(unitId, fileName) {
  const dec = decodePng(fs.readFileSync(path.join(RAW_DIR, fileName)));
  const cleaned = cleanChromaAndDefringe(dec.rgba, dec.width, dec.height);
  const chromaMode = detectChromaKeyMode(cleaned.keyHex);
  const cells = slicePortraitGrid4x2(cleaned.rgba, dec.width, dec.height);

  fs.mkdirSync(OUT_PORTRAITS_DIR, { recursive: true });
  let count = 0;
  for (const cell of cells) {
    if (!cell.region) continue;
    const outRgba = new Uint8ClampedArray(64 * 64 * 4);
    blitNearestIntoCell(cell.region.rgba, cell.region.width, cell.region.height, outRgba, 64, 0, 0, 64, {
      mode: 'portrait'
    });
    purgeResidualChromaEdges(outRgba, 64, 64, chromaMode);
    fs.writeFileSync(
      path.join(OUT_PORTRAITS_DIR, `${unitId}_${cell.emotion}.png`),
      encodePng(64, 64, outRgba)
    );
    count += 1;
  }
  return count;
}

function processSinglePortraitFile(unitId, emotion, fileName) {
  const dec = decodePng(fs.readFileSync(path.join(RAW_DIR, fileName)));
  const cleaned = cleanChromaAndDefringe(dec.rgba, dec.width, dec.height);
  const chromaMode = detectChromaKeyMode(cleaned.keyHex);
  const tight = extractTightRegion(cleaned.rgba, dec.width, dec.height);
  if (!tight) return false;
  const outRgba = new Uint8ClampedArray(64 * 64 * 4);
  blitNearestIntoCell(tight.rgba, tight.width, tight.height, outRgba, 64, 0, 0, 64, { mode: 'portrait' });
  purgeResidualChromaEdges(outRgba, 64, 64, chromaMode);
  fs.mkdirSync(OUT_PORTRAITS_DIR, { recursive: true });
  fs.writeFileSync(path.join(OUT_PORTRAITS_DIR, `${unitId}_${emotion}.png`), encodePng(64, 64, outRgba));
  return true;
}

export function runSyncSprites(cliArgs = process.argv.slice(2)) {
  const force = cliArgs.includes('--force');
  const baseSizeArg = cliArgs.find((a) => a.startsWith('--base-size='));
  const baseSize = baseSizeArg ? Number(baseSizeArg.split('=')[1]) : 64;

  if (!fs.existsSync(RAW_DIR)) {
    console.log('ℹ️ raw_assets/ 폴더가 없습니다. 생성할 원본 PNG가 없어 동기화를 건너뜁니다.');
    return { processedSprites: 0, skippedSprites: 0, processedPortraits: 0 };
  }

  const unitsArr = readJson(path.join(ROOT, 'src/data/units.json'));
  const formsArr = readJson(path.join(ROOT, 'src/data/forms.json'));
  const spritesFile = readJson(SPRITES_JSON_PATH);

  const formsById = Object.fromEntries(formsArr.map((f) => [f.id, f]));
  const spriteEntryByKey = Object.fromEntries(spritesFile.entries.map((e) => [e.key, e]));
  const validSpriteKeysSet = new Set(Object.keys(spriteEntryByKey));
  const validUnitIdsSet = new Set(unitsArr.map((u) => u.id));

  let prevCache = {};
  if (fs.existsSync(CACHE_PATH)) {
    try {
      prevCache = readJson(CACHE_PATH);
    } catch {
      prevCache = {};
    }
  }
  const nextCache = { ...prevCache };

  const files = fs
    .readdirSync(RAW_DIR)
    .filter((f) => f.toLowerCase().endsWith('.png'))
    .sort();

  const spriteGroups = new Map();
  const portraitSheetFiles = [];
  const portraitSingleFiles = [];
  const dedicatedPortraitUnits = new Set();
  const unknownFiles = [];

  for (const f of files) {
    const parsed = parseRawAssetFileName(f, validSpriteKeysSet, validUnitIdsSet);
    if (parsed.kind === 'PORTRAIT_SHEET') {
      portraitSheetFiles.push(parsed);
      dedicatedPortraitUnits.add(parsed.unitId);
    } else if (parsed.kind === 'PORTRAIT_SINGLE') {
      portraitSingleFiles.push(parsed);
      dedicatedPortraitUnits.add(parsed.unitId);
    } else if (parsed.kind === 'SPRITE_STANDING' || parsed.kind === 'SPRITE_ACTION') {
      if (!spriteGroups.has(parsed.spriteKey)) {
        spriteGroups.set(parsed.spriteKey, {
          standingFile: null,
          actions: {},
          files: [],
          hasDedicatedPortrait: false
        });
      }
      const g = spriteGroups.get(parsed.spriteKey);
      g.files.push(f);
      if (parsed.kind === 'SPRITE_STANDING') {
        g.standingFile = f;
      } else {
        g.actions[parsed.actionState] = f;
      }
    } else {
      unknownFiles.push(f);
    }
  }

  let processedPortraits = 0;
  let skippedPortraits = 0;

  // 1. Sync Portrait Sheets (incremental)
  for (const p of portraitSheetFiles) {
    const cacheKey = `portrait_sheet:${p.fileName}`;
    const stamp = getFileStamp(path.join(RAW_DIR, p.fileName));
    const expectedOut = path.join(OUT_PORTRAITS_DIR, `${p.unitId}_normal.png`);
    if (!force && prevCache[cacheKey] === stamp && fs.existsSync(expectedOut)) {
      skippedPortraits += 1;
      continue;
    }
    const count = processPortraitSheetFile(p.unitId, p.fileName);
    nextCache[cacheKey] = stamp;
    processedPortraits += count;
    console.log(`  ✓ [PORTRAIT SHEET] ${p.fileName} -> ${count} emotions (${p.unitId}_*.png)`);
  }

  for (const p of portraitSingleFiles) {
    const cacheKey = `portrait_single:${p.fileName}`;
    const stamp = getFileStamp(path.join(RAW_DIR, p.fileName));
    const expectedOut = path.join(OUT_PORTRAITS_DIR, `${p.unitId}_${p.emotion}.png`);
    if (!force && prevCache[cacheKey] === stamp && fs.existsSync(expectedOut)) {
      skippedPortraits += 1;
      continue;
    }
    if (processSinglePortraitFile(p.unitId, p.emotion, p.fileName)) {
      nextCache[cacheKey] = stamp;
      processedPortraits += 1;
      console.log(`  ✓ [PORTRAIT] ${p.fileName} -> public/assets/portraits/${p.unitId}_${p.emotion}.png`);
    }
  }

  // 2. Sync Sprite Groups (incremental, preserves existing EXTERNAL_PNG like luffy_base safely!)
  let processedSprites = 0;
  let skippedSprites = 0;
  let spritesJsonMutated = false;

  for (const [spriteKey, group] of spriteGroups.entries()) {
    const entry = spriteEntryByKey[spriteKey];
    if (!entry) continue;
    group.hasDedicatedPortrait = dedicatedPortraitUnits.has(entry.unitId);

    const groupStamp = group.files
      .sort()
      .map((f) => `${f}=${getFileStamp(path.join(RAW_DIR, f))}`)
      .join('|');
    const cacheKey = `sprite:${spriteKey}`;
    const outPng = path.join(OUT_SPRITES_DIR, `${spriteKey}.png`);
    const outMeta = path.join(OUT_SPRITES_DIR, `${spriteKey}.meta.json`);

    // Incremental protection: if outputs already exist and input stamps match (or first sync sees already-baked luffy_base),
    // record stamp without touching existing working assets unless --force is passed!
    const outputsExist = fs.existsSync(outPng) && fs.existsSync(outMeta);
    if (!force && outputsExist && prevCache[cacheKey] === groupStamp) {
      skippedSprites += 1;
      continue;
    }

    const formDef = entry.formId !== 'base' ? formsById[entry.formId] ?? null : null;
    const res = processSpriteGroup(spriteKey, group, entry, formDef, { baseSize });
    if (res) {
      nextCache[cacheKey] = groupStamp;
      processedSprites += 1;
      const expectedSrc = `assets/sprites/${spriteKey}.png`;
      if (entry.src !== expectedSrc) {
        entry.src = expectedSrc;
        spritesJsonMutated = true;
      }
      console.log(
        `  ✓ [SPRITE] ${spriteKey} (${res.cellSize}x${res.cellSize} × ${res.frameCount}f · states: ${res.states.join(', ')}${res.autoPortraitCreated ? ' + auto portrait' : ''})`
      );
    }
  }

  if (spritesJsonMutated) {
    fs.writeFileSync(SPRITES_JSON_PATH, JSON.stringify(spritesFile, null, 2) + '\n', 'utf8');
  }
  fs.writeFileSync(CACHE_PATH, JSON.stringify(nextCache, null, 2) + '\n', 'utf8');

  if (unknownFiles.length > 0) {
    console.log(`  ⚠ 미분류 파일(무시됨): ${unknownFiles.join(', ')}`);
  }

  console.log(
    `\n✅ sync:sprites 완료 — 스프라이트 처리 ${processedSprites}건 (증분 스킵 ${skippedSprites}건) · 초상화 처리 ${processedPortraits}건 (스킵 ${skippedPortraits}건)`
  );
  return { processedSprites, skippedSprites, processedPortraits, skippedPortraits };
}

if (process.argv[1] && path.resolve(process.argv[1]) === __filename) {
  runSyncSprites();
}
