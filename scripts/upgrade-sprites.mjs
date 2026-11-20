#!/usr/bin/env node
/**
 * Step 3 (Optional): Semi-Automated Style-Unified Sprite Upgrader using Gemini Image API.
 * Sends:
 *   1) Style Reference: Luffy IDLE single frame extracted from `public/assets/sprites/luffy_base.png`
 *   2) Pose/Color Reference: `exported_thumbnails/units/{key}.png`
 *   3) Prompt from `exported_thumbnails/manifest.json` / `prompt_pack.md`
 * Saves upgraded image to `raw_assets/{key}.png` and optionally triggers `npm run sync:sprites` (`--apply`).
 *
 * Usage:
 *   npm run upgrade:sprites -- --unit=zoro --dry-run
 *   npm run upgrade:sprites -- --unit=zoro --apply
 *   npm run upgrade:sprites -- --group=strawhats --apply
 *   npm run upgrade:sprites -- --group=bosses --delay-ms=3000
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { decodePng, encodePng } from './lib/spriteImageOps.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const MANIFEST_PATH = path.join(ROOT, 'exported_thumbnails/manifest.json');
const LUFFY_STYLE_PATH = path.join(ROOT, 'public/assets/sprites/luffy_base.png');
const LUFFY_META_PATH = path.join(ROOT, 'public/assets/sprites/luffy_base.meta.json');
const RAW_DIR = path.join(ROOT, 'raw_assets');

const STRAWHAT_IDS = new Set([
  'luffy',
  'zoro',
  'nami',
  'usopp',
  'sanji',
  'chopper',
  'robin',
  'franky',
  'brook',
  'jinbe'
]);

const MAJOR_BOSS_IDS = new Set([
  'morgan',
  'buggy',
  'krieg',
  'arlong',
  'smoker',
  'wapol',
  'crocodile',
  'enel',
  'lucci',
  'moria',
  'hody',
  'doflamingo',
  'katakuri',
  'kaido',
  'kizaru',
  'akainu',
  'aokiji',
  'blackbeard',
  'saturn',
  'loki',
  'king',
  'magellan'
]);

function loadDotEnvSafely() {
  const envPath = path.join(ROOT, '.env');
  const parsed = {};
  if (!fs.existsSync(envPath)) return parsed;
  const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const k = line.slice(0, eq).trim();
    let v = line.slice(eq + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    parsed[k] = v;
  }
  return parsed;
}

function parseArgs(argv) {
  const opts = {
    unit: null,
    key: null,
    group: null,
    dryRun: false,
    apply: false,
    includeExternal: false,
    delayMs: 2500,
    retries: 3,
    model: 'gemini-2.5-flash-image'
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run') opts.dryRun = true;
    else if (a === '--apply') opts.apply = true;
    else if (a === '--include-external') opts.includeExternal = true;
    else if (a.startsWith('--unit=')) opts.unit = a.slice(7).trim();
    else if (a.startsWith('--key=')) opts.key = a.slice(6).trim();
    else if (a.startsWith('--group=')) opts.group = a.slice(8).trim().toLowerCase();
    else if (a.startsWith('--delay-ms=')) opts.delayMs = Math.max(200, Number(a.slice(11)) || 2500);
    else if (a.startsWith('--retries=')) opts.retries = Math.max(1, Number(a.slice(10)) || 3);
    else if (a.startsWith('--model=')) opts.model = a.slice(8).trim();
  }
  return opts;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Extracts Luffy's single clean IDLE frame as PNG base64 so the image model receives
 * a crisp 1-character style reference rather than a 5-frame strip.
 */
function buildLuffyStyleRefPngBuffer() {
  const dec = decodePng(fs.readFileSync(LUFFY_STYLE_PATH));
  let rx = 0;
  let ry = 0;
  let rw = dec.width;
  let rh = dec.height;
  if (fs.existsSync(LUFFY_META_PATH)) {
    const meta = JSON.parse(fs.readFileSync(LUFFY_META_PATH, 'utf8'));
    const fr = meta?.animations?.IDLE?.frames?.[0];
    if (fr) {
      rx = fr.x;
      ry = fr.y;
      rw = fr.w;
      rh = fr.h;
    }
  }
  const sub = new Uint8ClampedArray(rw * rh * 4);
  for (let y = 0; y < rh; y++) {
    for (let x = 0; x < rw; x++) {
      const s = ((ry + y) * dec.width + (rx + x)) * 4;
      const d = (y * rw + x) * 4;
      sub[d] = dec.rgba[s];
      sub[d + 1] = dec.rgba[s + 1];
      sub[d + 2] = dec.rgba[s + 2];
      sub[d + 3] = dec.rgba[s + 3];
    }
  }
  return encodePng(rw, rh, sub);
}

async function callGeminiImageWithRetry({
  apiKey,
  model,
  stylePngBuf,
  thumbPngBuf,
  prompt,
  retries
}) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
  const body = {
    contents: [
      {
        parts: [
          {
            text:
              'Image 1 is the EXACT art-style reference (GBA/NDS 2.5-head pixel art sprite of Luffy). Image 2 is the target character color/pose/silhouette thumbnail to redraw in Image 1 style.'
          },
          {
            inlineData: {
              mimeType: 'image/png',
              data: stylePngBuf.toString('base64')
            }
          },
          {
            inlineData: {
              mimeType: 'image/png',
              data: thumbPngBuf.toString('base64')
            }
          },
          { text: prompt }
        ]
      }
    ],
    generationConfig: {
      responseModalities: ['IMAGE']
    }
  };

  let attempt = 0;
  let lastErr = null;
  while (attempt < retries) {
    attempt += 1;
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      if (res.status === 429 || res.status >= 500) {
        const backoff = Math.min(20000, 1500 * Math.pow(2, attempt - 1));
        console.warn(`  ⏳ HTTP ${res.status} — ${backoff}ms 후 재시도 (${attempt}/${retries})...`);
        await sleep(backoff);
        continue;
      }
      if (!res.ok) {
        const errText = await res.text();
        throw new Error(`HTTP ${res.status}: ${errText.slice(0, 240)}`);
      }
      const json = await res.json();
      const parts = json?.candidates?.[0]?.content?.parts ?? [];
      const imgPart = parts.find((p) => p?.inlineData?.data);
      if (!imgPart) {
        throw new Error('API 응답에 이미지 inlineData가 포함되지 않았습니다.');
      }
      return Buffer.from(imgPart.inlineData.data, 'base64');
    } catch (err) {
      lastErr = err;
      if (attempt < retries) {
        const backoff = Math.min(15000, 1500 * Math.pow(2, attempt - 1));
        console.warn(`  ⏳ 요청 실패 (${err.message}) — ${backoff}ms 후 재시도 (${attempt}/${retries})...`);
        await sleep(backoff);
      }
    }
  }
  throw lastErr ?? new Error('이미지 생성 요청 실패');
}

function selectTargetEntries(entries, opts) {
  let list = entries;
  if (opts.key) {
    list = list.filter((e) => e.key === opts.key);
  } else if (opts.unit) {
    list = list.filter((e) => e.unitId === opts.unit && e.formId === 'base');
  } else if (opts.group === 'strawhats') {
    list = list.filter((e) => STRAWHAT_IDS.has(e.unitId) && e.formId === 'base');
  } else if (opts.group === 'bosses') {
    list = list.filter((e) => MAJOR_BOSS_IDS.has(e.unitId) && e.formId === 'base');
  } else if (opts.group === 'forms') {
    list = list.filter((e) => e.formId !== 'base');
  } else if (opts.group === 'all') {
    // keep all
  } else {
    return [];
  }

  if (!opts.includeExternal) {
    list = list.filter((e) => e.status !== 'EXTERNAL');
  }
  return list;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const dotEnv = loadDotEnvSafely();
  const apiKey = process.env.GEMINI_API_KEY || dotEnv.GEMINI_API_KEY || '';
  const model = process.env.GEMINI_IMAGE_MODEL || dotEnv.GEMINI_IMAGE_MODEL || opts.model;

  if (!opts.unit && !opts.key && !opts.group) {
    console.log('사용법:');
    console.log('  npm run upgrade:sprites -- --unit=zoro --dry-run');
    console.log('  npm run upgrade:sprites -- --unit=zoro --apply');
    console.log('  npm run upgrade:sprites -- --group=strawhats --apply');
    console.log('  npm run upgrade:sprites -- --group=bosses --delay-ms=3000');
    process.exit(0);
  }

  if (!fs.existsSync(MANIFEST_PATH)) {
    console.error('❌ exported_thumbnails/manifest.json이 없습니다. 먼저 `npm run export:thumbnails`를 실행하세요.');
    process.exit(1);
  }
  if (!fs.existsSync(LUFFY_STYLE_PATH)) {
    console.error('❌ 스타일 기준 이미지(public/assets/sprites/luffy_base.png)를 찾을 수 없습니다.');
    process.exit(1);
  }

  const manifest = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8'));
  const targets = selectTargetEntries(manifest.entries, opts);

  if (targets.length === 0) {
    console.log('ℹ️ 조건에 맞는 고도화 대상(FALLBACK)이 없습니다. (이미 EXTERNAL인 항목을 포함하려면 --include-external 추가)');
    process.exit(0);
  }

  if (!opts.dryRun && !apiKey) {
    console.log('⚠ GEMINI_API_KEY가 설정되어 있지 않습니다 (.env 파일 또는 환경 변수).');
    console.log('  1) 프로젝트 루트의 `.env` 파일에 `GEMINI_API_KEY=your_key_here` 를 추가하세요.');
    console.log('  2) 실제 API 호출 전 전달 구성을 확인하려면 `--dry-run` 옵션을 사용하세요.');
    console.log('  3) 또는 `exported_thumbnails/prompt_pack.md`의 프롬프트를 수동 생성 후 `raw_assets/`에 넣고 `npm run sync:sprites`를 실행할 수 있습니다.');
    process.exit(0);
  }

  const stylePngBuf = buildLuffyStyleRefPngBuffer();
  fs.mkdirSync(RAW_DIR, { recursive: true });

  console.log(
    `🎨 upgrade:sprites (${opts.dryRun ? 'DRY-RUN' : 'LIVE API'}) | 대상 ${targets.length}건 | 모델: ${model}`
  );

  let generatedCount = 0;

  for (let i = 0; i < targets.length; i++) {
    const item = targets[i];
    const thumbAbs = path.join(ROOT, item.thumbRelPath);
    const outRawAbs = path.join(RAW_DIR, `${item.key}.png`);
    const outRawRel = `raw_assets/${item.key}.png`;

    if (!fs.existsSync(thumbAbs)) {
      console.error(`  ❌ 썸네일 누락: ${item.thumbRelPath}`);
      continue;
    }

    if (opts.dryRun) {
      console.log(`\n[${i + 1}/${targets.length}] DRY-RUN 검증: ${item.key} (${item.unitName}${item.formName ? ' · ' + item.formName : ''})`);
      console.log(`  • 화풍 기준 레퍼런스: public/assets/sprites/luffy_base.png (IDLE 단일 프레임 ${stylePngBuf.length} bytes)`);
      console.log(`  • 대상 썸네일 참조:   ${item.thumbRelPath} (존재 확인 OK)`);
      console.log(`  • 권장 크로마키 배경: ${item.chromaBgHex} | 정규화 크기: ${item.targetFrameSize}x${item.targetFrameSize}`);
      console.log(`  • 저장 예정 경로:     ${outRawRel}`);
      console.log(`  • 프롬프트:\n    ${item.prompt}`);
      continue;
    }

    console.log(`\n[${i + 1}/${targets.length}] 생성 중: ${item.key} (${item.unitName})...`);
    const thumbPngBuf = fs.readFileSync(thumbAbs);
    const resultBuf = await callGeminiImageWithRetry({
      apiKey,
      model,
      stylePngBuf,
      thumbPngBuf,
      prompt: item.prompt,
      retries: opts.retries
    });
    fs.writeFileSync(outRawAbs, resultBuf);
    generatedCount += 1;
    console.log(`  ✓ 저장 완료: ${outRawRel} (${resultBuf.length} bytes)`);

    if (i + 1 < targets.length) {
      await sleep(opts.delayMs);
    }
  }

  if (opts.dryRun) {
    console.log(`\n✅ DRY-RUN 검증 완료 (${targets.length}건 · API 호출 없음).`);
    return;
  }

  console.log(`\n✅ 이미지 생성 완료: ${generatedCount}/${targets.length}건`);
  if (opts.apply && generatedCount > 0) {
    console.log('\n🔄 --apply 옵션 활성화: `scripts/sync-sprites.mjs` 자동 실행 중...');
    execFileSync(process.execPath, [path.join(ROOT, 'scripts/sync-sprites.mjs')], {
      stdio: 'inherit'
    });
  }
}

main().catch((err) => {
  console.error('❌ upgrade-sprites failed:', err.message);
  process.exit(1);
});
