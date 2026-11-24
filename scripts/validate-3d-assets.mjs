import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { REQUIRED_DRACO_FILES } from './sync-draco-decoder.mjs';

export const GLB_MAGIC = 0x46546c67;
export const GLB_JSON_CHUNK_TYPE = 0x4e4f534a;
export const GLB_BIN_CHUNK_TYPE = 0x004e4942;

export const DEFAULT_MAX_TRIS_STANDARD = 30000;
export const DEFAULT_MAX_TRIS_BOSS = 50000;
export const DEFAULT_MAX_TRIS_WEAPON = 8000;
export const DEFAULT_MAX_TEX_DIM = 1024;
export const DEFAULT_MAX_FILE_BYTES = 8 * 1024 * 1024;

export const ALLOWED_WEAPON_BONES = [
  'mixamorigRightHand',
  'mixamorigLeftHand',
  'mixamorigHead',
  'mixamorigHips',
  'mixamorigSpine2',
  'mixamorigRightFoot'
];

const REQUIRED_CLIPS = ['IDLE', 'RUN', 'COMBO_1'];
const REQUIRED_SOCKETS = ['hips', 'righthand', 'lefthand'];

export function isGiantBossAssetName(name) {
  return /kaido_dragon|saturn_yokai|loki_giant|giant|dragon|yokai|boss/i.test(name);
}

function normalizeBoneName(raw) {
  return String(raw || '')
    .replace(/^Armature\|/i, '')
    .replace(/^mixamorig\d*[:_]?/i, '')
    .replace(/^Bip01[\s_]?/i, '')
    .trim()
    .toLowerCase();
}

function normalizeClipKey(raw) {
  return String(raw || '')
    .toUpperCase()
    .replace(/[\s-]+/g, '_');
}

function hasRequiredClip(animNamesUpper, target) {
  if (target === 'COMBO_1') {
    return animNamesUpper.some((n) => n === 'COMBO_1' || n === 'COMBO1' || n.includes('COMBO_1'));
  }
  return animNamesUpper.some((n) => n === target || n.includes(target));
}

export function parseGlbBuffer(buffer) {
  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  if (buf.length < 12) {
    throw new Error(`Invalid GLB: buffer too short (${buf.length} bytes)`);
  }
  const magic = buf.readUInt32LE(0);
  if (magic !== GLB_MAGIC) {
    throw new Error(`Invalid GLB header magic: 0x${magic.toString(16)}`);
  }
  const version = buf.readUInt32LE(4);
  if (version !== 2) {
    throw new Error(`Unsupported glTF version: ${version}`);
  }
  const totalLength = buf.readUInt32LE(8);
  if (totalLength > buf.length) {
    throw new Error(`Truncated GLB: header declares ${totalLength} bytes, got ${buf.length}`);
  }

  let offset = 12;
  let json = null;
  let binBuffer = Buffer.alloc(0);

  while (offset + 8 <= totalLength) {
    const chunkLen = buf.readUInt32LE(offset);
    const chunkType = buf.readUInt32LE(offset + 4);
    offset += 8;
    const chunkEnd = offset + chunkLen;
    if (chunkEnd > buf.length) {
      throw new Error(`Truncated GLB chunk ending at ${chunkEnd}`);
    }
    const chunkData = buf.subarray(offset, chunkEnd);
    if (chunkType === GLB_JSON_CHUNK_TYPE && json === null) {
      json = JSON.parse(chunkData.toString('utf8'));
    } else if (chunkType === GLB_BIN_CHUNK_TYPE && binBuffer.length === 0) {
      binBuffer = chunkData;
    }
    offset = chunkEnd;
  }

  if (!json || typeof json !== 'object') {
    throw new Error('Invalid GLB: missing JSON chunk');
  }
  return { version, totalLength, json, binBuffer };
}

export function detectImageDimensions(bytes) {
  const buf = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  if (buf.length < 16) return null;

  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 && buf.length >= 24) {
    return {
      format: 'png',
      width: buf.readUInt32BE(16),
      height: buf.readUInt32BE(20)
    };
  }

  if (
    buf.toString('ascii', 0, 4) === 'RIFF' &&
    buf.toString('ascii', 8, 12) === 'WEBP' &&
    buf.length >= 30
  ) {
    const chunkFourCc = buf.toString('ascii', 12, 16);
    if (chunkFourCc === 'VP8X' && buf.length >= 30) {
      const width = 1 + (buf[24] | (buf[25] << 8) | (buf[26] << 16));
      const height = 1 + (buf[27] | (buf[28] << 8) | (buf[29] << 16));
      return { format: 'webp', width, height };
    }
    if (chunkFourCc === 'VP8L' && buf.length >= 25) {
      const bits = buf.readUInt32LE(21);
      const width = (bits & 0x3fff) + 1;
      const height = ((bits >> 14) & 0x3fff) + 1;
      return { format: 'webp', width, height };
    }
    if (chunkFourCc === 'VP8 ' && buf.length >= 30) {
      const width = buf.readUInt16LE(26) & 0x3fff;
      const height = buf.readUInt16LE(28) & 0x3fff;
      return { format: 'webp', width, height };
    }
  }

  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let idx = 2;
    while (idx + 8 < buf.length) {
      if (buf[idx] !== 0xff) {
        idx += 1;
        continue;
      }
      const marker = buf[idx + 1];
      if (marker === 0xc0 || marker === 0xc1 || marker === 0xc2) {
        return {
          format: 'jpeg',
          height: buf.readUInt16BE(idx + 5),
          width: buf.readUInt16BE(idx + 7)
        };
      }
      const segLen = buf.readUInt16BE(idx + 2);
      if (segLen < 2) break;
      idx += 2 + segLen;
    }
  }

  return null;
}

function inspectGlbCoreMetrics(json, binBuffer, fileName, bufferSize, opts) {
  const requireDraco = opts.requireDraco ?? true;
  const maxTexDim = opts.maxTexDim ?? DEFAULT_MAX_TEX_DIM;
  const maxFileBytes = opts.maxFileBytes ?? DEFAULT_MAX_FILE_BYTES;
  const maxTriangles = opts.maxTriangles;

  const errors = [];
  const warnings = [];

  const meshes = Array.isArray(json.meshes) ? json.meshes : [];
  let hasDracoExt =
    Array.isArray(json.extensionsUsed) &&
    json.extensionsUsed.includes('KHR_draco_mesh_compression');

  let triangleCount = 0;
  const accessors = Array.isArray(json.accessors) ? json.accessors : [];

  for (const mesh of meshes) {
    const prims = Array.isArray(mesh?.primitives) ? mesh.primitives : [];
    for (const prim of prims) {
      if (prim?.extensions?.KHR_draco_mesh_compression) {
        hasDracoExt = true;
      }
      if (typeof prim?.indices === 'number' && accessors[prim.indices]?.count) {
        triangleCount += Math.floor(accessors[prim.indices].count / 3);
      } else if (
        typeof prim?.attributes?.POSITION === 'number' &&
        accessors[prim.attributes.POSITION]?.count
      ) {
        triangleCount += Math.floor(accessors[prim.attributes.POSITION].count / 3);
      }
    }
  }

  if (!hasDracoExt) {
    const msg = `${fileName}: Missing KHR_draco_mesh_compression`;
    if (requireDraco) errors.push(msg);
    else warnings.push(msg);
  }

  if (triangleCount > maxTriangles) {
    errors.push(
      `${fileName}: Triangle count ${triangleCount} exceeds limit ${maxTriangles}`
    );
  }

  const images = Array.isArray(json.images) ? json.images : [];
  const bufferViews = Array.isArray(json.bufferViews) ? json.bufferViews : [];
  let maxObservedTexDim = 0;
  const imageFormats = new Set();

  for (let i = 0; i < images.length; i += 1) {
    const img = images[i];
    if (!img) continue;
    let imgBytes = null;
    if (typeof img.bufferView === 'number') {
      const bv = bufferViews[img.bufferView];
      if (bv) {
        const start = bv.byteOffset ?? 0;
        const end = start + (bv.byteLength ?? 0);
        if (end <= binBuffer.length) {
          imgBytes = binBuffer.subarray(start, end);
        }
      }
    } else if (typeof img.uri === 'string' && img.uri.startsWith('data:')) {
      const b64Idx = img.uri.indexOf('base64,');
      if (b64Idx >= 0) {
        imgBytes = Buffer.from(img.uri.slice(b64Idx + 7), 'base64');
      }
    }

    if (imgBytes) {
      const dims = detectImageDimensions(imgBytes);
      if (dims) {
        imageFormats.add(dims.format);
        maxObservedTexDim = Math.max(maxObservedTexDim, dims.width, dims.height);
        if (dims.width > maxTexDim || dims.height > maxTexDim) {
          errors.push(
            `${fileName}: Texture #${i} (${dims.width}x${dims.height} ${dims.format}) exceeds max ${maxTexDim}px`
          );
        }
      }
    } else if (img.mimeType) {
      imageFormats.add(String(img.mimeType).replace('image/', ''));
    }
  }

  if (bufferSize > maxFileBytes) {
    warnings.push(
      `${fileName}: File size ${(bufferSize / (1024 * 1024)).toFixed(2)}MB exceeds recommended ${(maxFileBytes / (1024 * 1024)).toFixed(0)}MB`
    );
  }

  return {
    hasDracoExt,
    triangleCount,
    maxTriangles,
    maxObservedTexDim,
    imageFormats: Array.from(imageFormats),
    sizeBytes: bufferSize,
    errors,
    warnings
  };
}

export function auditGlbBuffer(buffer, fileName, options = {}) {
  const maxTriangles =
    options.maxTriangles ??
    (isGiantBossAssetName(fileName) ? DEFAULT_MAX_TRIS_BOSS : DEFAULT_MAX_TRIS_STANDARD);

  const parsed = parseGlbBuffer(buffer);
  const { json, binBuffer } = parsed;
  const sizeBytes = Buffer.isBuffer(buffer) ? buffer.length : buffer.byteLength;
  const core = inspectGlbCoreMetrics(json, binBuffer, fileName, sizeBytes, {
    ...options,
    maxTriangles
  });

  const animations = Array.isArray(json.animations) ? json.animations : [];
  const animNamesUpper = animations.map((a) => normalizeClipKey(a?.name));
  const missingClips = REQUIRED_CLIPS.filter((req) => !hasRequiredClip(animNamesUpper, req));
  if (missingClips.length > 0) {
    core.errors.push(`${fileName}: Missing required clip(s): ${missingClips.join(', ')}`);
  }

  const nodes = Array.isArray(json.nodes) ? json.nodes : [];
  const normNodeNames = new Set(nodes.map((n) => normalizeBoneName(n?.name)));
  const missingSockets = REQUIRED_SOCKETS.filter((sock) => {
    for (const candidate of normNodeNames) {
      if (candidate === sock || candidate.includes(sock)) return false;
    }
    return true;
  });
  if (missingSockets.length > 0) {
    core.errors.push(`${fileName}: Missing required Mixamo bone(s): ${missingSockets.join(', ')}`);
  }

  return {
    fileName,
    ok: core.errors.length === 0,
    ...core,
    clipCount: animations.length,
    missingClips,
    missingSockets
  };
}

export function auditWeaponGlbBuffer(buffer, fileName, options = {}) {
  const maxTriangles = options.maxTriangles ?? DEFAULT_MAX_TRIS_WEAPON;
  const parsed = parseGlbBuffer(buffer);
  const { json, binBuffer } = parsed;
  const sizeBytes = Buffer.isBuffer(buffer) ? buffer.length : buffer.byteLength;
  const core = inspectGlbCoreMetrics(json, binBuffer, fileName, sizeBytes, {
    ...options,
    maxTriangles
  });

  return {
    fileName,
    ok: core.errors.length === 0,
    ...core,
    clipCount: 0,
    missingClips: [],
    missingSockets: []
  };
}

export function validateWeapons3dManifest(manifest, rootDir = process.cwd()) {
  const errors = [];
  const warnings = [];
  const allowedBones = new Set(ALLOWED_WEAPON_BONES);

  if (!manifest || typeof manifest !== 'object') {
    return { ok: false, weaponCount: 0, loadoutCount: 0, errors: ['weapons_3d.json must be an object'], warnings };
  }

  const weapons = manifest.weapons ?? {};
  const loadouts = manifest.characterLoadouts ?? {};
  const weaponIds = Object.keys(weapons);

  for (const [id, spec] of Object.entries(weapons)) {
    if (!spec || typeof spec !== 'object') {
      errors.push(`weapons_3d.json weapon '${id}' is invalid`);
      continue;
    }
    if (!spec.combatSocket || !allowedBones.has(spec.combatSocket.bone)) {
      errors.push(
        `weapons_3d.json weapon '${id}': invalid combatSocket.bone '${spec.combatSocket?.bone}'`
      );
    }
    if (spec.holsterSocket && !allowedBones.has(spec.holsterSocket.bone)) {
      errors.push(
        `weapons_3d.json weapon '${id}': invalid holsterSocket.bone '${spec.holsterSocket.bone}'`
      );
    }
    if (typeof spec.modelPath !== 'string' || !spec.modelPath.endsWith('.glb')) {
      errors.push(`weapons_3d.json weapon '${id}': invalid modelPath '${spec.modelPath}'`);
    } else {
      const relClean = spec.modelPath.replace(/^\.\//, '');
      const diskPath = path.join(rootDir, 'public', relClean);
      if (fs.existsSync(diskPath) && !existsCaseSensitive(diskPath)) {
        errors.push(`weapons_3d.json weapon '${id}': case mismatch for ${relClean}`);
      }
    }
  }

  for (const [lid, loadout] of Object.entries(loadouts)) {
    if (!loadout || typeof loadout !== 'object') continue;
    for (const [slotKey, weaponId] of Object.entries(loadout.slots ?? {})) {
      if (weaponId && !weapons[weaponId]) {
        errors.push(
          `weapons_3d.json loadout '${lid}' slot '${slotKey}' references unknown weapon '${weaponId}'`
        );
      }
    }
    for (const [clipName, rules] of Object.entries(loadout.trailWindows ?? {})) {
      if (!Array.isArray(rules)) {
        errors.push(`weapons_3d.json loadout '${lid}' trailWindows['${clipName}'] must be array`);
        continue;
      }
      for (let i = 0; i < rules.length; i += 1) {
        const rule = rules[i];
        if (
          !rule ||
          typeof rule.start !== 'number' ||
          typeof rule.end !== 'number' ||
          rule.start < 0 ||
          rule.end > 1 ||
          rule.start >= rule.end
        ) {
          errors.push(
            `weapons_3d.json loadout '${lid}' trailWindows['${clipName}'][${i}]: must satisfy 0 <= start < end <= 1`
          );
        }
      }
    }
  }

  return {
    ok: errors.length === 0,
    weaponCount: weaponIds.length,
    loadoutCount: Object.keys(loadouts).length,
    errors,
    warnings
  };
}

function collectFilesRecursive(dir, extFilter) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...collectFilesRecursive(full, extFilter));
    } else if (entry.name.toLowerCase().endsWith(extFilter)) {
      out.push(full);
    }
  }
  return out;
}

function existsCaseSensitive(targetPath) {
  if (!fs.existsSync(targetPath)) return false;
  const dir = path.dirname(targetPath);
  const base = path.basename(targetPath);
  return fs.readdirSync(dir).includes(base);
}

export function runValidate3dAssets(options = {}) {
  const rootDir = options.rootDir ?? process.cwd();
  const requireDraco = options.requireDraco ?? true;
  const errors = [];
  const warnings = [];
  const auditedGlbs = [];
  const auditedWeapons = [];

  // 1. Offline Draco decoder check (public/draco/)
  const dracoDir = path.join(rootDir, 'public', 'draco');
  const dracoFiles = [];
  if (!fs.existsSync(dracoDir)) {
    errors.push(`Missing offline Draco directory: ${dracoDir} (run npm run sync:draco)`);
  } else {
    const diskSet = new Set(fs.readdirSync(dracoDir));
    for (const fileName of REQUIRED_DRACO_FILES) {
      const fullPath = path.join(dracoDir, fileName);
      if (!diskSet.has(fileName) || fs.statSync(fullPath).size <= 0) {
        errors.push(`Missing or empty offline Draco file: public/draco/${fileName}`);
      } else {
        dracoFiles.push({ fileName, size: fs.statSync(fullPath).size });
      }
    }
  }

  // 2. Scan characters & animations GLBs
  const assets3dRoot = path.join(rootDir, 'public', 'assets', '3d');
  const glbPaths = [
    ...collectFilesRecursive(path.join(assets3dRoot, 'characters'), '.glb'),
    ...collectFilesRecursive(path.join(assets3dRoot, 'animations'), '.glb')
  ];

  for (const glbPath of glbPaths) {
    const rel = path.relative(rootDir, glbPath).split(path.sep).join('/');
    const buf = fs.readFileSync(glbPath);
    const report = auditGlbBuffer(buf, rel, { requireDraco });
    auditedGlbs.push(report);
    errors.push(...report.errors);
    warnings.push(...report.warnings);
  }

  // 3. Scan weapons GLBs (<= 8,000 tris)
  const weaponGlbPaths = collectFilesRecursive(path.join(assets3dRoot, 'weapons'), '.glb');
  for (const wPath of weaponGlbPaths) {
    const rel = path.relative(rootDir, wPath).split(path.sep).join('/');
    const buf = fs.readFileSync(wPath);
    const report = auditWeaponGlbBuffer(buf, rel, { requireDraco });
    auditedWeapons.push(report);
    errors.push(...report.errors);
    warnings.push(...report.warnings);
  }

  // 4. Validate weapons_3d.json manifest schema & bone/trailWindow rules
  const weaponsManifestPath = path.join(rootDir, 'src', 'data', 'assets', 'weapons_3d.json');
  let weaponsManifestSummary = { ok: true, weaponCount: 0, loadoutCount: 0 };
  if (fs.existsSync(weaponsManifestPath)) {
    try {
      const parsedWeaponsJson = JSON.parse(fs.readFileSync(weaponsManifestPath, 'utf8'));
      const mRes = validateWeapons3dManifest(parsedWeaponsJson, rootDir);
      weaponsManifestSummary = {
        ok: mRes.ok,
        weaponCount: mRes.weaponCount,
        loadoutCount: mRes.loadoutCount
      };
      errors.push(...mRes.errors);
      warnings.push(...mRes.warnings);
    } catch (err) {
      errors.push(
        `src/data/assets/weapons_3d.json: Invalid JSON (${err instanceof Error ? err.message : String(err)})`
      );
      weaponsManifestSummary = { ok: false, weaponCount: 0, loadoutCount: 0 };
    }
  }

  // 5. Validate .anim.json metadata & exact-case matching .glb references
  const animJsonPaths = collectFilesRecursive(assets3dRoot, '.anim.json');
  for (const jsonPath of animJsonPaths) {
    const rel = path.relative(rootDir, jsonPath).split(path.sep).join('/');
    try {
      const parsed = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
      if (parsed && typeof parsed.glbRef === 'string') {
        const refTarget = path.join(path.dirname(jsonPath), parsed.glbRef);
        if (!existsCaseSensitive(refTarget)) {
          errors.push(`${rel}: glbRef '${parsed.glbRef}' does not exist with matching case`);
        }
      }
    } catch (err) {
      errors.push(`${rel}: Invalid JSON (${err instanceof Error ? err.message : String(err)})`);
    }
  }

  return {
    ok: errors.length === 0,
    dracoFiles,
    auditedGlbs,
    auditedWeapons,
    weaponsManifestSummary,
    animJsonCount: animJsonPaths.length,
    errors,
    warnings
  };
}

const isMainModule =
  process.argv[1] &&
  path.resolve(process.argv[1]).toLowerCase() ===
  path.resolve(fileURLToPath(import.meta.url)).toLowerCase();

if (isMainModule) {
  const res = runValidate3dAssets();
  console.log('=== 3D Asset Validation Report ===');
  console.log(
    `Offline Draco (public/draco/): ${res.dracoFiles.map((d) => `${d.fileName} (${(d.size / 1024).toFixed(1)}KB)`).join(', ') || 'NONE'}`
  );
  console.log(
    `weapons_3d.json: ${res.weaponsManifestSummary.weaponCount} weapon(s), ${res.weaponsManifestSummary.loadoutCount} loadout(s)`
  );

  if (res.auditedGlbs.length === 0) {
    console.log(
      'Character GLB Models: 0 dropped in public/assets/3d/characters/ (using GreyboxRig until .glb is placed).'
    );
  } else {
    console.log('File | Draco | Tris / Max | MaxTex | SizeMB | Clips | Status');
    for (const r of res.auditedGlbs) {
      console.log(
        `${r.fileName} | ${r.hasDracoExt ? 'YES' : 'NO'} | ${r.triangleCount}/${r.maxTriangles} | ${r.maxObservedTexDim}px | ${(r.sizeBytes / (1024 * 1024)).toFixed(2)} | ${r.clipCount} | ${r.ok ? 'PASS' : 'FAIL'}`
      );
    }
  }

  if (res.auditedWeapons.length === 0) {
    console.log(
      'Weapon GLB Models: 0 dropped in public/assets/3d/weapons/ (using Greybox Weapon Proxy until .glb is placed).'
    );
  } else {
    console.log('Weapon GLB | Draco | Tris / 8000 | MaxTex | SizeMB | Status');
    for (const r of res.auditedWeapons) {
      console.log(
        `${r.fileName} | ${r.hasDracoExt ? 'YES' : 'NO'} | ${r.triangleCount}/${r.maxTriangles} | ${r.maxObservedTexDim}px | ${(r.sizeBytes / (1024 * 1024)).toFixed(2)} | ${r.ok ? 'PASS' : 'FAIL'}`
      );
    }
  }

  for (const w of res.warnings) {
    console.warn(`⚠️ ${w}`);
  }
  for (const e of res.errors) {
    console.error(`❌ ${e}`);
  }

  if (res.ok) {
    console.log(`✅ 3D Asset validation PASSED (0 errors, ${res.warnings.length} warning(s)).`);
  } else {
    console.error(`❌ 3D Asset validation FAILED (${res.errors.length} error(s)).`);
    process.exit(1);
  }
}
