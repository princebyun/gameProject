import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const REQUIRED_DRACO_FILES = [
  'draco_decoder.js',
  'draco_decoder.wasm',
  'draco_wasm_wrapper.js'
];

export function syncDracoDecoders(rootDir = process.cwd()) {
  const candidateSources = [
    path.join(rootDir, 'node_modules', 'three', 'examples', 'jsm', 'libs', 'draco', 'gltf'),
    path.join(rootDir, 'node_modules', 'three', 'examples', 'jsm', 'libs', 'draco')
  ];

  const sourceDir = candidateSources.find((dir) =>
    REQUIRED_DRACO_FILES.every((file) => fs.existsSync(path.join(dir, file)))
  );

  if (!sourceDir) {
    throw new Error(
      `Draco decoder files not found under ${candidateSources.join(' or ')}. Run npm install first.`
    );
  }

  const destDir = path.join(rootDir, 'public', 'draco');
  fs.mkdirSync(destDir, { recursive: true });

  const copied = [];
  for (const fileName of REQUIRED_DRACO_FILES) {
    const srcPath = path.join(sourceDir, fileName);
    const dstPath = path.join(destDir, fileName);
    fs.copyFileSync(srcPath, dstPath);
    const stat = fs.statSync(dstPath);
    if (stat.size <= 0) {
      throw new Error(`Copied empty Draco file: ${dstPath}`);
    }
    copied.push({ fileName, size: stat.size });
  }

  // Case-sensitive exact filename verification on disk
  const diskEntries = new Set(fs.readdirSync(destDir));
  for (const fileName of REQUIRED_DRACO_FILES) {
    if (!diskEntries.has(fileName)) {
      throw new Error(`Case-sensitive check failed for ${fileName} in ${destDir}`);
    }
  }

  // Remove legacy duplicate public/assets/3d/draco/ if present to keep dist-web compact
  const legacyDracoDir = path.join(rootDir, 'public', 'assets', '3d', 'draco');
  let removedLegacy = false;
  if (fs.existsSync(legacyDracoDir)) {
    fs.rmSync(legacyDracoDir, { recursive: true, force: true });
    removedLegacy = true;
  }

  return {
    sourceDir,
    destDir,
    copied,
    removedLegacy
  };
}

const isMainModule =
  process.argv[1] &&
  path.resolve(process.argv[1]).toLowerCase() ===
    path.resolve(fileURLToPath(import.meta.url)).toLowerCase();

if (isMainModule) {
  const res = syncDracoDecoders();
  const summary = res.copied
    .map((c) => `${c.fileName}(${(c.size / 1024).toFixed(1)}KB)`)
    .join(', ');
  console.log(`✅ Offline Draco decoders synced -> public/draco/: ${summary}`);
  if (res.removedLegacy) {
    console.log('   🧹 Removed legacy duplicate public/assets/3d/draco/');
  }
}
