import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { runValidate3dAssets } from './validate-3d-assets.mjs';

export function parsePack3dArgs(argv, rootDir = process.cwd()) {
  let unit = '';
  let inputDir = '';
  let outputPath = '';
  let rotateY180 = false;
  let maxTexSize = 1024;
  let dryRun = false;

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg) continue;
    if (arg === '--rotate-y-180') {
      rotateY180 = true;
    } else if (arg === '--dry-run') {
      dryRun = true;
    } else if (arg.startsWith('--unit=')) {
      unit = arg.slice('--unit='.length).trim();
    } else if (arg === '--unit' && argv[i + 1]) {
      unit = String(argv[++i]).trim();
    } else if (arg.startsWith('--input=')) {
      inputDir = arg.slice('--input='.length).trim();
    } else if (arg === '--input' && argv[i + 1]) {
      inputDir = String(argv[++i]).trim();
    } else if (arg.startsWith('--output=')) {
      outputPath = arg.slice('--output='.length).trim();
    } else if (arg === '--output' && argv[i + 1]) {
      outputPath = String(argv[++i]).trim();
    } else if (arg.startsWith('--max-tex-size=')) {
      const parsed = Number(arg.slice('--max-tex-size='.length));
      if (Number.isFinite(parsed) && parsed > 0) maxTexSize = Math.round(parsed);
    } else if (arg === '--max-tex-size' && argv[i + 1]) {
      const parsed = Number(argv[++i]);
      if (Number.isFinite(parsed) && parsed > 0) maxTexSize = Math.round(parsed);
    }
  }

  const resolvedUnit = unit || 'luffy_base';
  const resolvedInput =
    inputDir || path.join(rootDir, 'raw_assets', '3d', 'mixamo', resolvedUnit);
  const resolvedOutput =
    outputPath || path.join(rootDir, 'public', 'assets', '3d', 'characters', `${resolvedUnit}.glb`);

  return {
    unit: resolvedUnit,
    inputDir: resolvedInput,
    outputPath: resolvedOutput,
    rotateY180,
    maxTexSize,
    dryRun
  };
}

export function buildBlenderCommandArgs(parsed, scriptPath) {
  const args = [
    '--background',
    '--python',
    scriptPath,
    '--',
    '--input',
    parsed.inputDir,
    '--output',
    parsed.outputPath,
    '--max-tex-size',
    String(parsed.maxTexSize)
  ];
  if (parsed.rotateY180) {
    args.push('--rotate-y-180');
  }
  return args;
}

export function findBlenderExecutable(options = {}) {
  const env = options.env ?? process.env;
  const platform = options.platform ?? process.platform;
  const existsFn = options.existsFn ?? ((p) => fs.existsSync(p));
  const readdirFn = options.readdirFn ?? ((p) => (fs.existsSync(p) ? fs.readdirSync(p) : []));
  const probeCommandFn =
    options.probeCommandFn ??
    ((cmd) => {
      const res = spawnSync(cmd, ['--version'], { encoding: 'utf8', stdio: 'pipe' });
      return res.status === 0;
    });

  if (env.BLENDER_BIN && existsFn(env.BLENDER_BIN)) {
    return env.BLENDER_BIN;
  }

  const pathCmd = platform === 'win32' ? 'blender.exe' : 'blender';
  if (probeCommandFn(pathCmd)) {
    return pathCmd;
  }

  if (platform === 'win32') {
    const baseDirs = [
      'C:\\Program Files\\Blender Foundation',
      'C:\\Program Files (x86)\\Blender Foundation',
      env.LOCALAPPDATA ? path.join(env.LOCALAPPDATA, 'Programs', 'Blender Foundation') : ''
    ].filter(Boolean);

    for (const base of baseDirs) {
      for (const entry of readdirFn(base).sort().reverse()) {
        const candidate = path.join(base, entry, 'blender.exe');
        if (existsFn(candidate)) return candidate;
      }
    }
  } else if (platform === 'darwin') {
    const macBin = '/Applications/Blender.app/Contents/MacOS/Blender';
    if (existsFn(macBin)) return macBin;
  } else {
    for (const linuxBin of ['/usr/bin/blender', '/usr/local/bin/blender', '/snap/bin/blender']) {
      if (existsFn(linuxBin)) return linuxBin;
    }
  }

  return null;
}

export function formatMissingBlenderMessage(parsed, blenderArgs) {
  const manualCmd = `blender ${blenderArgs.map((a) => (a.includes(' ') ? `"${a}"` : a)).join(' ')}`;
  return [
    '❌ Blender 4.x 실행 파일을 찾을 수 없습니다 (PATH / 표준 설치 경로 미발견).',
    '   1. Blender 4.x 다운로드 및 설치: https://www.blender.org/download/',
    '   2. 또는 환경 변수 BLENDER_BIN에 blender.exe 전체 경로를 지정하세요.',
    `   3. 대상 입력 폴더: ${parsed.inputDir}`,
    `   4. 수동 실행 명령: ${manualCmd}`
  ].join('\n');
}

export function runPack3dCharacter(argv = process.argv.slice(2), deps = {}) {
  const rootDir = deps.rootDir ?? process.cwd();
  const parsed = parsePack3dArgs(argv, rootDir);
  const scriptPath = path.join(rootDir, 'scripts', 'blender', 'merge_mixamo_to_glb.py');
  const blenderArgs = buildBlenderCommandArgs(parsed, scriptPath);
  const blenderBin = deps.findBlender ? deps.findBlender() : findBlenderExecutable();

  if (!blenderBin) {
    const message = formatMissingBlenderMessage(parsed, blenderArgs);
    return {
      ok: false,
      reason: 'BLENDER_NOT_FOUND',
      parsed,
      blenderArgs,
      message
    };
  }

  if (!fs.existsSync(parsed.inputDir)) {
    return {
      ok: false,
      reason: 'INPUT_DIR_NOT_FOUND',
      parsed,
      blenderArgs,
      message: `❌ Mixamo FBX 입력 폴더를 찾을 수 없습니다: ${parsed.inputDir}\n   raw_assets/3d/mixamo/${parsed.unit}/ 아래에 IDLE.fbx 및 모션 FBX를 배치하세요.`
    };
  }

  if (parsed.dryRun) {
    return {
      ok: true,
      reason: 'DRY_RUN',
      parsed,
      blenderBin,
      blenderArgs,
      message: `ℹ️ Dry run: ${blenderBin} ${blenderArgs.join(' ')}`
    };
  }

  const spawnFn = deps.spawnSyncFn ?? spawnSync;
  const runRes = spawnFn(blenderBin, blenderArgs, { stdio: 'inherit' });
  if (runRes.status !== 0) {
    return {
      ok: false,
      reason: 'BLENDER_FAILED',
      parsed,
      blenderBin,
      blenderArgs,
      message: `❌ Blender 변환 실패 (exit code ${runRes.status ?? 'unknown'})`
    };
  }

  const validation = runValidate3dAssets({ rootDir, requireDraco: true });
  return {
    ok: validation.ok,
    reason: validation.ok ? 'PACKED_AND_VALIDATED' : 'VALIDATION_FAILED',
    parsed,
    blenderBin,
    blenderArgs,
    validation,
    message: validation.ok
      ? `✅ Mixamo GLB 패킹 및 검증 완료 -> ${parsed.outputPath}`
      : `❌ GLB 패킹 후 검증 실패 (${validation.errors.length}건)`
  };
}

const isMainModule =
  process.argv[1] &&
  path.resolve(process.argv[1]).toLowerCase() ===
    path.resolve(fileURLToPath(import.meta.url)).toLowerCase();

if (isMainModule) {
  const result = runPack3dCharacter();
  console.log(result.message);
  if (!result.ok) {
    process.exit(1);
  }
}
