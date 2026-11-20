import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

function readTextSafe(relPath) {
  const abs = path.join(ROOT, relPath);
  if (!fs.existsSync(abs)) return '';
  return fs.readFileSync(abs, 'utf-8');
}

function readJsonSafe(relPath, fallback) {
  const txt = readTextSafe(relPath);
  if (!txt) return fallback;
  try {
    return JSON.parse(txt);
  } catch {
    return fallback;
  }
}

function listFilesSafe(relDir, extFilter = null) {
  const abs = path.join(ROOT, relDir);
  if (!fs.existsSync(abs)) return [];
  return fs
    .readdirSync(abs)
    .filter((name) => {
      if (extFilter && !name.toLowerCase().endsWith(extFilter)) return false;
      const stat = fs.statSync(path.join(abs, name));
      return stat.isFile();
    })
    .sort();
}

function walkJsonFiles(relDir) {
  const abs = path.join(ROOT, relDir);
  if (!fs.existsSync(abs)) return [];
  const results = [];
  const stack = [abs];
  while (stack.length > 0) {
    const dir = stack.pop();
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        stack.push(full);
      } else if (entry.name.endsWith('.json')) {
        results.push(path.relative(ROOT, full).replace(/\\/g, '/'));
      }
    }
  }
  return results.sort();
}

function getRecentGitLog() {
  try {
    const out = execSync('git log -n 5 --oneline', {
      cwd: ROOT,
      encoding: 'utf-8',
      stdio: ['ignore', 'pipe', 'ignore']
    }).trim();
    return out || '(커밋 이력 없음)';
  } catch {
    return '(Git 저장소가 아니거나 git CLI를 사용할 수 없음)';
  }
}

function buildAutoSnapshotSection() {
  const nowIso = new Date().toISOString();
  const constantsSrc = readTextSafe('src/core/constants.ts');
  const saveSchemaSrc = readTextSafe('src/core/save/schema.ts');
  const pkg = readJsonSafe('package.json', { scripts: {}, dependencies: {}, devDependencies: {} });

  const battleCalcVersion =
    (constantsSrc.match(/BATTLE_CALC_VERSION\s*=\s*['"]([^'"]+)['"]/) || [])[1] ?? 'unknown';
  const saveVersion =
    (saveSchemaSrc.match(/CURRENT_SAVE_VERSION\s*=\s*(\d+)/) || [])[1] ?? 'unknown';

  const units = readJsonSafe('src/data/units.json', []);
  const forms = readJsonSafe('src/data/forms.json', []);
  const seaZones = readJsonSafe('src/data/sea_zones.json', []);
  const combos = readJsonSafe('src/data/combos.json', []);
  const spritesManifest = readJsonSafe('src/data/assets/sprites.json', { entries: [] });
  const audioManifest = readJsonSafe('src/data/assets/audio.json', { bgmTracks: [], sfxEntries: [] });

  const islandFiles = listFilesSafe('src/data/islands', '.json');
  const dialogueFiles = walkJsonFiles('src/data/dialogues');
  const rawAssetFiles = listFilesSafe('raw_assets').filter((f) => !f.startsWith('.'));
  const publicSpritePngs = listFilesSafe('public/assets/sprites', '.png');
  const publicPortraitPngs = listFilesSafe('public/assets/portraits', '.png');

  const spriteEntries = Array.isArray(spritesManifest.entries) ? spritesManifest.entries : [];
  const externalSpriteKeys = spriteEntries
    .filter((entry) => entry?.src && fs.existsSync(path.join(ROOT, 'public', entry.src)))
    .map((entry) => entry.key);
  const fallbackSpriteCount = Math.max(0, spriteEntries.length - externalSpriteKeys.length);

  const scriptNames = Object.keys(pkg.scripts || {});
  const recentGitLog = getRecentGitLog();

  return [
    '## 0. 자동 추출 실시간 코드베이스 스냅샷 (`npm run ai:handoff`)',
    '',
    `- **생성 시각 (UTC):** \`${nowIso}\``,
    `- **코어 버전:** \`BATTLE_CALC_VERSION = "${battleCalcVersion}"\`, \`CURRENT_SAVE_VERSION = ${saveVersion}\``,
    `- **데이터 레지스트리 현황:**`,
    `  - \`src/data/units.json\`: **${Array.isArray(units) ? units.length : 0}**종`,
    `  - \`src/data/forms.json\`: **${Array.isArray(forms) ? forms.length : 0}**종`,
    `  - \`src/data/sea_zones.json\`: **${Array.isArray(seaZones) ? seaZones.length : 0}**개 해역`,
    `  - \`src/data/islands/*.json\`: **${islandFiles.length}**개 에피소드 섬`,
    `  - \`src/data/combos.json\`: **${Array.isArray(combos) ? combos.length : 0}**종 합동기`,
    `  - \`src/data/dialogues/**/*.json\`: **${dialogueFiles.length}**개 대사 스크립트 파일`,
    `  - \`src/data/assets/sprites.json\`: 총 **${spriteEntries.length}**개 시트 (\`EXTERNAL_PNG\`: **${externalSpriteKeys.length}**종, \`FALLBACK\`: **${fallbackSpriteCount}**종)`,
    `  - \`src/data/assets/audio.json\`: BGM **${Array.isArray(audioManifest.bgmTracks) ? audioManifest.bgmTracks.length : 0}**트랙 / SFX **${Array.isArray(audioManifest.sfxEntries) ? audioManifest.sfxEntries.length : 0}**종`,
    `- **\`raw_assets/\` 원본 파일 (${rawAssetFiles.length}개):** ${rawAssetFiles.length > 0 ? rawAssetFiles.map((f) => `\`${f}\``).join(', ') : '(없음)'}`,
    `- **\`public/assets/sprites/\` 외부 PNG (${publicSpritePngs.length}개):** ${publicSpritePngs.length > 0 ? publicSpritePngs.map((f) => `\`${f}\``).join(', ') : '(없음)'}`,
    `- **\`public/assets/portraits/\` 외부 초상화 PNG (${publicPortraitPngs.length}개):** ${publicPortraitPngs.length > 0 ? publicPortraitPngs.map((f) => `\`${f}\``).join(', ') : '(없음)'}`,
    `- **\`package.json\` 주요 스크립트 (${scriptNames.length}개):** ${scriptNames.map((s) => `\`${s}\``).join(', ')}`,
    '- **최근 Git 커밋 (`git log -n 5 --oneline`):**',
    '```text',
    recentGitLog,
    '```'
  ].join('\n');
}

function main() {
  const agentsMd = readTextSafe('AGENTS.md').trim();
  const handoffMd = readTextSafe('HANDOFF.md').trim();

  if (!agentsMd) {
    console.error('❌ 프로젝트 루트에 AGENTS.md 파일이 없습니다.');
    process.exit(1);
  }
  if (!handoffMd) {
    console.error('❌ 프로젝트 루트에 HANDOFF.md 파일이 없습니다.');
    process.exit(1);
  }

  const snapshotSection = buildAutoSnapshotSection();

  const bundleContent = [
    '# AI_BUNDLE.md — 원피스 2D 액션 RPG 공용 AI 컨텍스트 합본',
    '',
    '> 웹 채팅 AI(Gemini, Claude, ChatGPT 등)에 이 파일 1개만 첨부하면 불변 규칙(`AGENTS.md`), 실시간 작업 기억(`HANDOFF.md`), 최신 코드베이스 스냅샷을 즉시 공유할 수 있습니다.',
    '',
    '---',
    '',
    snapshotSection,
    '',
    '---',
    '',
    agentsMd,
    '',
    '---',
    '',
    handoffMd,
    ''
  ].join('\n');

  const outPath = path.join(ROOT, 'AI_BUNDLE.md');
  fs.writeFileSync(outPath, bundleContent, 'utf-8');

  const charCount = bundleContent.length;
  const byteSize = Buffer.byteLength(bundleContent, 'utf-8');
  // Korean + English + Markdown mixed token estimate (~2.8~3.5 chars per token)
  const estTokensLow = Math.ceil(charCount / 3.5);
  const estTokensHigh = Math.ceil(charCount / 2.6);

  console.log('✅ AI_BUNDLE.md 생성 완료!');
  console.log(`   • 출력 경로: ${outPath}`);
  console.log(`   • 총 글자 수: ${charCount.toLocaleString()} chars (${(byteSize / 1024).toFixed(2)} KB)`);
  console.log(`   • 추정 토큰 수: 약 ${estTokensLow.toLocaleString()} ~ ${estTokensHigh.toLocaleString()} tokens`);
}

main();
