import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');
const ANDROID_DIR = path.join(ROOT, 'android');

function runOrExit(cmd, args, cwd) {
  const res = spawnSync(cmd, args, {
    cwd,
    stdio: 'inherit',
    shell: process.platform === 'win32'
  });
  if (res.error) {
    console.error(`❌ Failed to execute "${cmd} ${args.join(' ')}":`, res.error.message);
    process.exit(1);
  }
  if ((res.status ?? 1) !== 0) {
    process.exit(res.status ?? 1);
  }
}

function main() {
  const isRelease = process.argv.includes('--release');
  const skipSync = process.argv.includes('--skip-sync');
  const gradleTask = isRelease ? 'assembleRelease' : 'assembleDebug';

  if (!skipSync) {
    console.log('1) Building Android web bundle & syncing Capacitor...');
    runOrExit('npm', ['run', 'package:android:sync'], ROOT);
  }

  const gradlew = process.platform === 'win32' ? 'gradlew.bat' : './gradlew';
  const gradlewPath = path.join(ANDROID_DIR, process.platform === 'win32' ? 'gradlew.bat' : 'gradlew');
  if (!fs.existsSync(gradlewPath)) {
    console.error(`❌ Missing Gradle wrapper at ${gradlewPath}`);
    process.exit(1);
  }

  console.log(`2) Running Gradle ${gradleTask} (${process.platform})...`);
  runOrExit(gradlew, [gradleTask], ANDROID_DIR);

  const apkRel = isRelease
    ? 'android/app/build/outputs/apk/release/app-release.apk'
    : 'android/app/build/outputs/apk/debug/app-debug.apk';
  const apkAbs = path.join(ROOT, apkRel);
  if (fs.existsSync(apkAbs)) {
    const sizeMb = (fs.statSync(apkAbs).size / (1024 * 1024)).toFixed(2);
    console.log(`✅ Android APK ready: ${apkRel} (${sizeMb} MiB)`);
  }
}

main();
