import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

// Prevent libvips file-handle retention on Windows during rapid PNG -> WebP replacement
sharp.cache(false);

async function withWindowsFsRetry(op) {
  for (let attempt = 0; attempt < 8; attempt++) {
    try {
      return op();
    } catch (err) {
      if ((err?.code === 'EPERM' || err?.code === 'EBUSY' || err?.code === 'EACCES') && attempt < 7) {
        await new Promise((r) => setTimeout(r, 50 * (attempt + 1)));
        continue;
      }
      throw err;
    }
  }
  return op();
}

async function safeUnlink(filePath) {
  await withWindowsFsRetry(() => {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  });
}

async function safeReadBuffer(filePath) {
  return withWindowsFsRetry(() => fs.readFileSync(filePath));
}

async function safeWriteBuffer(filePath, buf) {
  await withWindowsFsRetry(() => fs.writeFileSync(filePath, buf));
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

export const LOSSLESS_WEBP_OPTIONS = Object.freeze({
  lossless: true,
  effort: 6,
  alphaQuality: 100,
  nearLossless: false,
  exact: true
});

export const REGULAR_ATLAS_MAX_DIM = 1024;
export const GIANT_OR_TILESET_MAX_DIM = 2048;

export function toPosixRel(rootDir, absPath) {
  return path.relative(rootDir, absPath).split(path.sep).join('/');
}

export function normalizeAssetRel(relPath) {
  return relPath.replace(/\\/g, '/').replace(/^\.\//, '');
}

export async function encodeLosslessWebpBuffer(pngBuffer) {
  return sharp(pngBuffer).webp(LOSSLESS_WEBP_OPTIONS).toBuffer();
}

export async function decodeImageToRgba(imageBuffer) {
  const { data, info } = await sharp(imageBuffer)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  return {
    data,
    width: info.width,
    height: info.height,
    channels: info.channels
  };
}

export async function getImageMetadata(input) {
  const buf = typeof input === 'string' ? fs.readFileSync(input) : input;
  const meta = await sharp(buf).metadata();
  return {
    width: meta.width ?? 0,
    height: meta.height ?? 0,
    format: meta.format ?? 'unknown'
  };
}

export function getResolutionLimitForMeta(meta) {
  const isGiantOrEnv =
    Boolean(meta?.isGiant) ||
    meta?.category === 'tileset' ||
    meta?.category === 'background';
  return isGiantOrEnv ? GIANT_OR_TILESET_MAX_DIM : REGULAR_ATLAS_MAX_DIM;
}

export function validateAtlasResolution(meta, dims) {
  const limit = getResolutionLimitForMeta(meta);
  if (!dims || dims.width <= 0 || dims.height <= 0) {
    throw new Error(`INVALID_IMAGE_DIMENSIONS: ${meta?.id ?? 'unknown'} (${dims?.width}x${dims?.height})`);
  }
  if (dims.width > limit || dims.height > limit) {
    const code = limit > REGULAR_ATLAS_MAX_DIM
      ? 'GIANT_OR_TILESET_MAX_RESOLUTION_EXCEEDED'
      : 'ATLAS_MAX_RESOLUTION_EXCEEDED';
    throw new Error(
      `${code}: ${meta?.id ?? 'asset'} is ${dims.width}x${dims.height} (max ${limit}x${limit})`
    );
  }
}

export function inferAssetPolicyFromPath(relPublicPath, manifestEntriesByPath) {
  const normalized = normalizeAssetRel(relPublicPath);
  const hit = manifestEntriesByPath.get(normalized);
  if (hit) {
    return {
      id: hit.id,
      category: hit.category,
      isGiant: Boolean(hit.isGiant)
    };
  }
  if (normalized.includes('/tilesets/')) {
    return { id: normalized, category: 'tileset', isGiant: false };
  }
  if (normalized.includes('/backgrounds/')) {
    return { id: normalized, category: 'background', isGiant: false };
  }
  if (normalized.includes('/vfx/')) {
    return { id: normalized, category: 'vfx', isGiant: false };
  }
  if (normalized.includes('/portraits/')) {
    return { id: normalized, category: 'portrait', isGiant: false };
  }
  const isGiantHint =
    /(?:kaido|saturn|loki|amuru|flame_dragon|gyuki|ragnir|giant|monster_point|demonio_fleur|franky_general|yokai|dragon|sea_king)/i.test(
      normalized
    );
  return { id: normalized, category: 'sprite', isGiant: isGiantHint };
}

function walkFiles(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      walkFiles(full, out);
    } else {
      out.push(full);
    }
  }
  return out;
}

function resolveMappedRelPath(rawRef, contextDirInPublic, publicDir, pathMap) {
  if (!rawRef || typeof rawRef !== 'string') return rawRef;
  const clean = normalizeAssetRel(rawRef);
  if (pathMap.has(clean)) {
    return pathMap.get(clean);
  }
  const absCandidate = path.resolve(contextDirInPublic, clean);
  if (absCandidate.startsWith(publicDir)) {
    const relFromPublic = toPosixRel(publicDir, absCandidate);
    if (pathMap.has(relFromPublic)) {
      const targetAbs = path.join(publicDir, pathMap.get(relFromPublic));
      const relBack = toPosixRel(contextDirInPublic, targetAbs);
      return rawRef.startsWith('./') ? `./${relBack}` : relBack;
    }
  }
  if (clean.toLowerCase().endsWith('.png')) {
    const webpCandidate = clean.replace(/\.png$/i, '.webp');
    for (const [oldP, newP] of pathMap.entries()) {
      if (path.posix.basename(oldP) === path.posix.basename(clean)) {
        const dirPart = path.posix.dirname(rawRef);
        const nextBase = path.posix.basename(newP);
        return dirPart === '.' ? nextBase : `${dirPart}/${nextBase}`;
      }
      if (oldP === webpCandidate) {
        return newP;
      }
    }
  }
  return rawRef;
}

export function syncLinkedMetadataFiles(rootDir, pathMap) {
  const publicDir = path.join(rootDir, 'public');
  const proDir = path.join(publicDir, 'assets', 'pro');
  if (!fs.existsSync(proDir)) return { updatedFiles: [] };

  const updatedFiles = [];
  const allFiles = walkFiles(proDir);

  for (const absFile of allFiles) {
    const lower = absFile.toLowerCase();
    const fileDir = path.dirname(absFile);

    if (lower.endsWith('.json') && !lower.endsWith('pro_manifest.json')) {
      const rawText = fs.readFileSync(absFile, 'utf-8');
      let parsed;
      try {
        parsed = JSON.parse(rawText);
      } catch {
        continue;
      }
      let changed = false;
      if (parsed && typeof parsed === 'object') {
        if (parsed.meta && typeof parsed.meta.image === 'string') {
          const nextImg = resolveMappedRelPath(parsed.meta.image, fileDir, publicDir, pathMap);
          if (nextImg !== parsed.meta.image) {
            parsed.meta.image = nextImg;
            changed = true;
          }
        }
        if (typeof parsed.image === 'string') {
          const nextImg = resolveMappedRelPath(parsed.image, fileDir, publicDir, pathMap);
          if (nextImg !== parsed.image) {
            parsed.image = nextImg;
            changed = true;
          }
        }
      }
      if (changed) {
        fs.writeFileSync(absFile, `${JSON.stringify(parsed, null, 2)}\n`, 'utf-8');
        updatedFiles.push(toPosixRel(rootDir, absFile));
      }
    } else if (lower.endsWith('.tsx')) {
      const xml = fs.readFileSync(absFile, 'utf-8');
      let changed = false;
      const nextXml = xml.replace(
        /(<image\b[^>]*\bsource\s*=\s*")([^"]+)("[^>]*>)/gi,
        (full, prefix, srcVal, suffix) => {
          const nextSrc = resolveMappedRelPath(srcVal, fileDir, publicDir, pathMap);
          if (nextSrc !== srcVal) {
            changed = true;
            return `${prefix}${nextSrc}${suffix}`;
          }
          return full;
        }
      );
      if (changed) {
        fs.writeFileSync(absFile, nextXml, 'utf-8');
        updatedFiles.push(toPosixRel(rootDir, absFile));
      }
    } else if (lower.endsWith('.tmj') || lower.endsWith('.tsj')) {
      const rawText = fs.readFileSync(absFile, 'utf-8');
      let parsed;
      try {
        parsed = JSON.parse(rawText);
      } catch {
        continue;
      }
      let changed = false;
      if (Array.isArray(parsed?.tilesets)) {
        for (const ts of parsed.tilesets) {
          if (typeof ts.image === 'string') {
            const nextImg = resolveMappedRelPath(ts.image, publicDir, publicDir, pathMap);
            if (nextImg !== ts.image) {
              ts.image = nextImg;
              changed = true;
            }
          }
        }
      }
      if (typeof parsed?.image === 'string') {
        const nextImg = resolveMappedRelPath(parsed.image, fileDir, publicDir, pathMap);
        if (nextImg !== parsed.image) {
          parsed.image = nextImg;
          changed = true;
        }
      }
      if (changed) {
        fs.writeFileSync(absFile, `${JSON.stringify(parsed, null, 2)}\n`, 'utf-8');
        updatedFiles.push(toPosixRel(rootDir, absFile));
      }
    }
  }

  return { updatedFiles };
}

function loadManifestPathMap(rootDir) {
  const byPath = new Map();
  const srcManifest = path.join(rootDir, 'src', 'assets', 'pro_manifest.json');
  if (!fs.existsSync(srcManifest)) return byPath;
  try {
    const parsed = JSON.parse(fs.readFileSync(srcManifest, 'utf-8'));
    for (const ent of parsed.entries ?? []) {
      if (ent?.assetPath) {
        byPath.set(normalizeAssetRel(ent.assetPath), ent);
        if (ent.assetPath.endsWith('.webp')) {
          byPath.set(normalizeAssetRel(ent.assetPath.replace(/\.webp$/i, '.png')), ent);
        }
      }
    }
  } catch {
    // ignore malformed partial manifest during bootstrap
  }
  return byPath;
}

export async function optimizeProAssetsPipeline(options = {}) {
  const rootDir = options.rootDir ?? ROOT;
  const dryRun = Boolean(options.dryRun);
  const archiveOriginals = options.archiveOriginals !== false;

  const publicDir = path.join(rootDir, 'public');
  const proDir = path.join(publicDir, 'assets', 'pro');
  const originalsRoot = path.join(rootDir, 'raw_assets', 'pro_originals');
  const manifestByPath = loadManifestPathMap(rootDir);

  if (!fs.existsSync(proDir)) {
    return {
      convertedCount: 0,
      keptMicroPngCount: 0,
      deletedDuplicatePngCount: 0,
      totalPngBytes: 0,
      totalOutBytes: 0,
      savedBytes: 0,
      savedPercent: 0,
      pathMap: new Map(),
      updatedMetaFiles: []
    };
  }

  const allFiles = walkFiles(proDir).sort();
  const pngFiles = allFiles.filter((f) => f.toLowerCase().endsWith('.png'));
  const webpFiles = allFiles.filter((f) => f.toLowerCase().endsWith('.webp'));

  const pathMap = new Map();
  let convertedCount = 0;
  let keptMicroPngCount = 0;
  let deletedDuplicatePngCount = 0;
  let totalPngBytes = 0;
  let totalOutBytes = 0;

  for (const absPng of pngFiles) {
    const relFromPublic = toPosixRel(publicDir, absPng);
    const relUnderPro = toPosixRel(proDir, absPng);
    const pngBuf = await safeReadBuffer(absPng);
    const dims = await getImageMetadata(pngBuf);
    const policy = inferAssetPolicyFromPath(relFromPublic, manifestByPath);
    validateAtlasResolution(policy, dims);

    const webpBuf = await encodeLosslessWebpBuffer(pngBuf);
    totalPngBytes += pngBuf.byteLength;

    if (archiveOriginals && !dryRun) {
      const backupPath = path.join(originalsRoot, relUnderPro);
      fs.mkdirSync(path.dirname(backupPath), { recursive: true });
      if (!fs.existsSync(backupPath)) {
        await safeWriteBuffer(backupPath, pngBuf);
      }
    }

    const absWebp = absPng.replace(/\.png$/i, '.webp');
    const relWebp = relFromPublic.replace(/\.png$/i, '.webp');

    if (pngBuf.byteLength < 1024 && pngBuf.byteLength <= webpBuf.byteLength) {
      totalOutBytes += pngBuf.byteLength;
      keptMicroPngCount += 1;
      pathMap.set(relFromPublic, relFromPublic);
      if (!dryRun && fs.existsSync(absWebp)) {
        await safeUnlink(absWebp);
      }
    } else {
      totalOutBytes += webpBuf.byteLength;
      convertedCount += 1;
      pathMap.set(relFromPublic, relWebp);
      if (!dryRun) {
        await safeWriteBuffer(absWebp, webpBuf);
        await safeUnlink(absPng);
        deletedDuplicatePngCount += 1;
      }
    }
  }

  // Validate pre-existing WebP files as well and clean any duplicate PNG siblings
  for (const absWebp of webpFiles) {
    const relFromPublic = toPosixRel(publicDir, absWebp);
    const webpBuf = await safeReadBuffer(absWebp);
    const dims = await getImageMetadata(webpBuf);
    const policy = inferAssetPolicyFromPath(relFromPublic, manifestByPath);
    validateAtlasResolution(policy, dims);
    const relPng = relFromPublic.replace(/\.webp$/i, '.png');
    if (!pathMap.has(relPng)) {
      pathMap.set(relPng, relFromPublic);
    }
    const stat = fs.statSync(absWebp);
    if (!pngFiles.some((p) => p.replace(/\.png$/i, '.webp') === absWebp)) {
      totalPngBytes += stat.size;
      totalOutBytes += stat.size;
    }
  }

  const syncRes = dryRun ? { updatedFiles: [] } : syncLinkedMetadataFiles(rootDir, pathMap);

  const savedBytes = Math.max(0, totalPngBytes - totalOutBytes);
  const savedPercent = totalPngBytes > 0 ? Number(((savedBytes / totalPngBytes) * 100).toFixed(2)) : 0;

  return {
    convertedCount,
    keptMicroPngCount,
    deletedDuplicatePngCount,
    totalPngBytes,
    totalOutBytes,
    savedBytes,
    savedPercent,
    pathMap,
    updatedMetaFiles: syncRes.updatedFiles
  };
}

async function runCli() {
  const dryRun = process.argv.includes('--dry-run');
  const res = await optimizeProAssetsPipeline({ rootDir: ROOT, dryRun });

  // Sync pro_manifest.json after WebP conversion so assetPath/fileSizeBytes stay exact
  if (!dryRun) {
    const cliMod = await import('./pro-manifest-cli.mjs');
    await cliMod.syncProManifestFiles(ROOT);
  }

  console.log('✅ Lossless WebP Optimization Complete:');
  console.log(
    `   • Converted to .webp: ${res.convertedCount} | Micro-PNG kept (<1KB): ${res.keptMicroPngCount} | Redundant PNGs removed: ${res.deletedDuplicatePngCount}`
  );
  console.log(
    `   • Disk Size: ${(res.totalPngBytes / 1024).toFixed(1)} KB -> ${(res.totalOutBytes / 1024).toFixed(1)} KB (Saved ${(res.savedBytes / 1024).toFixed(1)} KB / ${res.savedPercent}%)`
  );
  console.log(`   • Metadata synced: ${res.updatedMetaFiles.length} linked file(s)`);
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]).toLowerCase() === path.resolve(__filename).toLowerCase()
) {
  runCli().catch((err) => {
    console.error('❌ Lossless WebP optimization failed:', err);
    process.exit(1);
  });
}
