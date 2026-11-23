import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import zlib from 'node:zlib';

const EOCD_SIGNATURE = 0x06054b50;
const CEN_SIGNATURE = 0x02014b50;
const LOC_SIGNATURE = 0x04034b50;

function sanitizeEntryName(name) {
  const normalized = name.replace(/\\/g, '/').replace(/^\/+/, '');
  const parts = normalized.split('/').filter(Boolean);
  if (parts.length === 0 || parts.some((p) => p === '..' || p === '.')) {
    return null;
  }
  if (/^[A-Za-z]:/.test(normalized)) {
    return null;
  }
  return parts.join('/');
}

/**
 * Pure-Node ZIP archive reader supporting Store (0) & Deflate (8) entries.
 * Rejects path traversal entries.
 */
export function extractZipEntries(zipBuffer) {
  if (!Buffer.isBuffer(zipBuffer) || zipBuffer.length < 22) {
    throw new Error('Invalid ZIP buffer');
  }
  if (zipBuffer.readUInt32LE(0) !== LOC_SIGNATURE && zipBuffer.readUInt32LE(0) !== EOCD_SIGNATURE) {
    throw new Error('Not a ZIP file signature');
  }

  let eocdOffset = -1;
  const searchMin = Math.max(0, zipBuffer.length - 65557);
  for (let pos = zipBuffer.length - 22; pos >= searchMin; pos--) {
    if (zipBuffer.readUInt32LE(pos) === EOCD_SIGNATURE) {
      eocdOffset = pos;
      break;
    }
  }
  if (eocdOffset < 0) {
    throw new Error('ZIP End-of-Central-Directory not found');
  }

  const totalEntries = zipBuffer.readUInt16LE(eocdOffset + 10);
  const centralDirOffset = zipBuffer.readUInt32LE(eocdOffset + 16);
  const files = new Map();
  let cursor = centralDirOffset;

  for (let i = 0; i < totalEntries; i++) {
    if (cursor + 46 > zipBuffer.length) break;
    const sig = zipBuffer.readUInt32LE(cursor);
    if (sig !== CEN_SIGNATURE) break;

    const method = zipBuffer.readUInt16LE(cursor + 10);
    const compSize = zipBuffer.readUInt32LE(cursor + 20);
    const fileNameLen = zipBuffer.readUInt16LE(cursor + 28);
    const extraLen = zipBuffer.readUInt16LE(cursor + 30);
    const commentLen = zipBuffer.readUInt16LE(cursor + 32);
    const localHeaderOffset = zipBuffer.readUInt32LE(cursor + 42);

    const rawName = zipBuffer.toString('utf-8', cursor + 46, cursor + 46 + fileNameLen);
    cursor += 46 + fileNameLen + extraLen + commentLen;

    if (rawName.endsWith('/')) continue;
    const safeName = sanitizeEntryName(rawName);
    if (!safeName) continue;
    if (localHeaderOffset + 30 > zipBuffer.length) continue;
    if (zipBuffer.readUInt32LE(localHeaderOffset) !== LOC_SIGNATURE) continue;

    const lNameLen = zipBuffer.readUInt16LE(localHeaderOffset + 26);
    const lExtraLen = zipBuffer.readUInt16LE(localHeaderOffset + 28);
    const dataStart = localHeaderOffset + 30 + lNameLen + lExtraLen;
    const compressed = zipBuffer.subarray(dataStart, dataStart + compSize);

    if (method === 0) {
      files.set(safeName, Buffer.from(compressed));
    } else if (method === 8) {
      files.set(safeName, zlib.inflateRawSync(compressed));
    }
  }

  return files;
}

export function extractZipToDir(zipPath, outDir, filterExts = null) {
  fs.mkdirSync(outDir, { recursive: true });
  const extSet = filterExts
    ? new Set(filterExts.map((e) => e.toLowerCase()))
    : null;
  const extractedPaths = [];

  try {
    const buf = fs.readFileSync(zipPath);
    const entries = extractZipEntries(buf);
    for (const [rel, content] of entries.entries()) {
      const ext = path.extname(rel).toLowerCase();
      if (extSet && !extSet.has(ext)) continue;
      const dest = path.resolve(outDir, rel);
      if (!dest.startsWith(path.resolve(outDir) + path.sep)) continue;
      fs.mkdirSync(path.dirname(dest), { recursive: true });
      fs.writeFileSync(dest, content);
      extractedPaths.push(dest);
    }
    return extractedPaths;
  } catch {
    // Fallback to Windows system tar.exe (libarchive supports Zip64 & Deflate64)
    execFileSync('tar', ['-xf', zipPath, '-C', outDir], { stdio: 'ignore' });
    const walk = (dir) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
        } else {
          const ext = path.extname(entry.name).toLowerCase();
          if (!extSet || extSet.has(ext)) {
            extractedPaths.push(full);
          }
        }
      }
    };
    walk(outDir);
    return extractedPaths;
  }
}
