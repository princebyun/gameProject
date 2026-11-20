#!/usr/bin/env node
/**
 * Zero-dependency Local Image -> Pixel-Art Sprite Converter CLI (`npm run pixelize:sprite`)
 *
 * Pipeline:
 * 1. Pure Node.js PNG decoder (IHDR/PLTE/tRNS/IDAT/IEND + scanline unfiltering)
 * 2. Edge flood-fill / chroma-key background removal (samples top-left pixel color)
 * 3. Tight bounding-box crop & aspect-preserving Nearest-Neighbor downsampling (48 / 64 / 96px)
 * 4. Median-Cut palette quantization (24~32 retro colors)
 * 5. Automatic 1px Hue-Shifted Dark Pixel Outline pass
 * 6. Pure Node.js PNG encoder -> outputs crisp pixel-art PNG into public/assets/sprites/
 *
 * Usage:
 *   npm run pixelize:sprite -- --input raw_assets/luffy.png --out public/assets/sprites --size 48
 *   npm run pixelize:sprite -- --input raw_assets --out public/assets/sprites --size 64 --colors 28
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';

const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

// Precompute IEEE 802.3 CRC32 table for PNG chunk checksums
const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) {
    c = (c & 1) !== 0 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  }
  CRC_TABLE[n] = c >>> 0;
}

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function paethPredictor(a, b, c) {
  const p = a + b - c;
  const pa = Math.abs(p - a);
  const pb = Math.abs(p - b);
  const pc = Math.abs(p - c);
  if (pa <= pb && pa <= pc) return a;
  if (pb <= pc) return b;
  return c;
}

/**
 * Pure Node.js PNG decoder supporting 8-bit Grayscale(0), RGB(2), Indexed(3), GrayAlpha(4), RGBA(6).
 */
export function decodePng(buffer) {
  if (buffer.length < 24 || !buffer.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new Error('Invalid PNG signature');
  }

  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 8;
  let colorType = 6;
  let palette = null;
  let trns = null;
  const idatChunks = [];

  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const dataStart = offset + 8;
    const dataEnd = dataStart + length;
    if (dataEnd + 4 > buffer.length) break;
    const chunkData = buffer.subarray(dataStart, dataEnd);

    if (type === 'IHDR') {
      width = chunkData.readUInt32BE(0);
      height = chunkData.readUInt32BE(4);
      bitDepth = chunkData[8];
      colorType = chunkData[9];
      if (bitDepth !== 8) {
        throw new Error(`Unsupported PNG bit depth: ${bitDepth} (expected 8-bit)`);
      }
    } else if (type === 'PLTE') {
      palette = chunkData;
    } else if (type === 'tRNS') {
      trns = chunkData;
    } else if (type === 'IDAT') {
      idatChunks.push(chunkData);
    } else if (type === 'IEND') {
      break;
    }

    offset = dataEnd + 4;
  }

  if (width <= 0 || height <= 0 || idatChunks.length === 0) {
    throw new Error('Incomplete PNG image data');
  }

  const raw = zlib.inflateSync(Buffer.concat(idatChunks));
  const bppMap = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };
  const bpp = bppMap[colorType];
  if (!bpp) {
    throw new Error(`Unsupported PNG colorType: ${colorType}`);
  }

  const stride = width * bpp;
  const recon = new Uint8Array(height * stride);

  for (let y = 0; y < height; y++) {
    const filterType = raw[y * (stride + 1)];
    const rowInStart = y * (stride + 1) + 1;
    const rowOutStart = y * stride;

    for (let x = 0; x < stride; x++) {
      const filt = raw[rowInStart + x];
      const a = x >= bpp ? recon[rowOutStart + x - bpp] : 0;
      const b = y > 0 ? recon[rowOutStart - stride + x] : 0;
      const c = x >= bpp && y > 0 ? recon[rowOutStart - stride + x - bpp] : 0;
      let val = filt;
      if (filterType === 1) val = (filt + a) & 0xff;
      else if (filterType === 2) val = (filt + b) & 0xff;
      else if (filterType === 3) val = (filt + ((a + b) >> 1)) & 0xff;
      else if (filterType === 4) val = (filt + paethPredictor(a, b, c)) & 0xff;
      recon[rowOutStart + x] = val;
    }
  }

  const rgba = new Uint8ClampedArray(width * height * 4);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const pIdx = (y * width + x) * 4;
      const rIdx = y * stride + x * bpp;
      if (colorType === 6) {
        rgba[pIdx] = recon[rIdx];
        rgba[pIdx + 1] = recon[rIdx + 1];
        rgba[pIdx + 2] = recon[rIdx + 2];
        rgba[pIdx + 3] = recon[rIdx + 3];
      } else if (colorType === 2) {
        rgba[pIdx] = recon[rIdx];
        rgba[pIdx + 1] = recon[rIdx + 1];
        rgba[pIdx + 2] = recon[rIdx + 2];
        rgba[pIdx + 3] = 255;
      } else if (colorType === 3 && palette) {
        const idx = recon[rIdx];
        rgba[pIdx] = palette[idx * 3] ?? 0;
        rgba[pIdx + 1] = palette[idx * 3 + 1] ?? 0;
        rgba[pIdx + 2] = palette[idx * 3 + 2] ?? 0;
        rgba[pIdx + 3] = trns && idx < trns.length ? trns[idx] : 255;
      } else if (colorType === 4) {
        rgba[pIdx] = recon[rIdx];
        rgba[pIdx + 1] = recon[rIdx];
        rgba[pIdx + 2] = recon[rIdx];
        rgba[pIdx + 3] = recon[rIdx + 1];
      } else {
        rgba[pIdx] = recon[rIdx];
        rgba[pIdx + 1] = recon[rIdx];
        rgba[pIdx + 2] = recon[rIdx];
        rgba[pIdx + 3] = 255;
      }
    }
  }

  return { width, height, rgba };
}

function makePngChunk(type, data) {
  const typeBuf = Buffer.from(type, 'ascii');
  const lenBuf = Buffer.alloc(4);
  lenBuf.writeUInt32BE(data.length, 0);
  const crcInput = Buffer.concat([typeBuf, data]);
  const crcBuf = Buffer.alloc(4);
  crcBuf.writeUInt32BE(crc32(crcInput), 0);
  return Buffer.concat([lenBuf, typeBuf, data, crcBuf]);
}

/**
 * Pure Node.js RGBA8 PNG encoder.
 */
export function encodePng(width, height, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const stride = width * 4;
  const raw = Buffer.alloc(height * (stride + 1));
  for (let y = 0; y < height; y++) {
    raw[y * (stride + 1)] = 0; // filter None
    const srcStart = y * stride;
    for (let x = 0; x < stride; x++) {
      raw[y * (stride + 1) + 1 + x] = rgba[srcStart + x];
    }
  }

  const compressed = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    PNG_SIGNATURE,
    makePngChunk('IHDR', ihdr),
    makePngChunk('IDAT', compressed),
    makePngChunk('IEND', Buffer.alloc(0))
  ]);
}

/**
 * Removes solid background color via border flood-fill from all 4 corners matching (0,0) color.
 */
function removeBackgroundEdgeFloodFill(rgba, width, height, tolerance = 26) {
  const total = width * height;
  let alreadyTransparent = 0;
  for (let i = 3; i < rgba.length; i += 4) {
    if (rgba[i] < 16) alreadyTransparent += 1;
  }
  if (alreadyTransparent / total >= 0.05) {
    return;
  }

  const bgR = rgba[0];
  const bgG = rgba[1];
  const bgB = rgba[2];
  const tolSq = tolerance * tolerance * 3;

  const isBg = (idx) => {
    const p = idx * 4;
    if (rgba[p + 3] < 16) return true;
    const dr = rgba[p] - bgR;
    const dg = rgba[p + 1] - bgG;
    const db = rgba[p + 2] - bgB;
    return dr * dr + dg * dg + db * db <= tolSq;
  };

  const visited = new Uint8Array(total);
  const queue = new Int32Array(total);
  let head = 0;
  let tail = 0;

  const pushIfBg = (x, y) => {
    const idx = y * width + x;
    if (visited[idx] || !isBg(idx)) return;
    visited[idx] = 1;
    queue[tail++] = idx;
  };

  for (let x = 0; x < width; x++) {
    pushIfBg(x, 0);
    pushIfBg(x, height - 1);
  }
  for (let y = 0; y < height; y++) {
    pushIfBg(0, y);
    pushIfBg(width - 1, y);
  }

  while (head < tail) {
    const idx = queue[head++];
    rgba[idx * 4 + 3] = 0;
    const cx = idx % width;
    const cy = Math.floor(idx / width);
    if (cx > 0) pushIfBg(cx - 1, cy);
    if (cx + 1 < width) pushIfBg(cx + 1, cy);
    if (cy > 0) pushIfBg(cx, cy - 1);
    if (cy + 1 < height) pushIfBg(cx, cy + 1);
  }
}

/**
 * Median-Cut palette quantization (24~32 retro colors) on opaque pixels.
 */
function quantizePalette(rgba, maxColors = 28) {
  const opaqueIndices = [];
  const samples = [];
  for (let i = 0; i < rgba.length; i += 4) {
    if (rgba[i + 3] >= 128) {
      opaqueIndices.push(i);
      samples.push([rgba[i], rgba[i + 1], rgba[i + 2]]);
    } else {
      rgba[i + 3] = 0;
    }
  }
  if (samples.length === 0) return;

  const boxes = [samples];
  while (boxes.length < maxColors) {
    let bestIdx = -1;
    let bestRange = -1;
    let bestChannel = 0;

    for (let i = 0; i < boxes.length; i++) {
      const b = boxes[i];
      if (b.length < 2) continue;
      for (let ch = 0; ch < 3; ch++) {
        let lo = 255;
        let hi = 0;
        for (let k = 0; k < b.length; k++) {
          const v = b[k][ch];
          if (v < lo) lo = v;
          if (v > hi) hi = v;
        }
        if (hi - lo > bestRange) {
          bestRange = hi - lo;
          bestIdx = i;
          bestChannel = ch;
        }
      }
    }

    if (bestIdx === -1 || bestRange <= 4) break;
    const target = boxes.splice(bestIdx, 1)[0];
    target.sort((a, b) => a[bestChannel] - b[bestChannel]);
    const mid = Math.floor(target.length / 2);
    boxes.push(target.slice(0, mid), target.slice(mid));
  }

  const palette = boxes.map((b) => {
    let sr = 0;
    let sg = 0;
    let sb = 0;
    for (let k = 0; k < b.length; k++) {
      sr += b[k][0];
      sg += b[k][1];
      sb += b[k][2];
    }
    const len = Math.max(1, b.length);
    return [Math.round(sr / len), Math.round(sg / len), Math.round(sb / len)];
  });

  for (let i = 0; i < opaqueIndices.length; i++) {
    const p = opaqueIndices[i];
    const r = rgba[p];
    const g = rgba[p + 1];
    const b = rgba[p + 2];
    let bestD = Infinity;
    let bestC = palette[0];
    for (let j = 0; j < palette.length; j++) {
      const c = palette[j];
      const dr = r - c[0];
      const dg = g - c[1];
      const db = b - c[2];
      const d = dr * dr + dg * dg + db * db;
      if (d < bestD) {
        bestD = d;
        bestC = c;
      }
    }
    rgba[p] = bestC[0];
    rgba[p + 1] = bestC[1];
    rgba[p + 2] = bestC[2];
    rgba[p + 3] = 255;
  }
}

/**
 * Adds a 1px dark hue-shifted pixel outline around opaque foreground silhouettes.
 */
function applyPixelArtOutline(rgba, width, height) {
  const out = new Uint8ClampedArray(rgba);
  const dirs = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1]
  ];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      if (rgba[idx + 3] >= 128) continue;

      let rSum = 0;
      let gSum = 0;
      let bSum = 0;
      let hits = 0;
      for (const [dx, dy] of dirs) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
        const nIdx = (ny * width + nx) * 4;
        if (rgba[nIdx + 3] >= 128) {
          rSum += rgba[nIdx];
          gSum += rgba[nIdx + 1];
          bSum += rgba[nIdx + 2];
          hits += 1;
        }
      }

      if (hits > 0) {
        // Hue-shifted dark outline snapped to retro 16-step palette buckets (keeps total colors <= 32)
        const snap = (v) => Math.max(8, Math.min(248, Math.round(v / 16) * 16));
        out[idx] = snap(Math.max(12, (rSum / hits) * 0.24));
        out[idx + 1] = snap(Math.max(10, (gSum / hits) * 0.2));
        out[idx + 2] = snap(Math.max(24, (bSum / hits) * 0.32 + 12));
        out[idx + 3] = 255;
      }
    }
  }
  return out;
}

/**
 * Full programmatic PNG -> Retro Pixel-Art buffer converter (exported for Vitest & CLI).
 */
export function pixelizePngBuffer(
  pngBuffer,
  options = {}
) {
  const targetSize = Number(options.size ?? 48);
  const maxColors = Math.max(8, Math.min(64, Number(options.colors ?? 28)));
  const addOutline = options.outline !== false;
  const tolerance = Number(options.tolerance ?? 26);

  const decoded = decodePng(pngBuffer);
  const srcRgba = new Uint8ClampedArray(decoded.rgba);
  removeBackgroundEdgeFloodFill(srcRgba, decoded.width, decoded.height, tolerance);

  // Tight bounding box around foreground
  let minX = decoded.width;
  let minY = decoded.height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < decoded.height; y++) {
    for (let x = 0; x < decoded.width; x++) {
      if (srcRgba[(y * decoded.width + x) * 4 + 3] >= 128) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX < minX || maxY < minY) {
    minX = 0;
    minY = 0;
    maxX = decoded.width - 1;
    maxY = decoded.height - 1;
  }

  const cropW = maxX - minX + 1;
  const cropH = maxY - minY + 1;

  // Leave 2px border padding for 1px outline + foot clearance
  const innerLimit = Math.max(8, targetSize - 4);
  const scale = Math.min(innerLimit / cropW, innerLimit / cropH);
  const scaledW = Math.max(1, Math.round(cropW * scale));
  const scaledH = Math.max(1, Math.round(cropH * scale));
  const offsetX = Math.floor((targetSize - scaledW) * 0.5);
  const offsetY = Math.max(1, targetSize - scaledH - 2);

  // Nearest-Neighbor downsample into targetSize x targetSize canvas
  let outRgba = new Uint8ClampedArray(targetSize * targetSize * 4);
  for (let dy = 0; dy < scaledH; dy++) {
    const sy = minY + Math.min(cropH - 1, Math.floor((dy / scaledH) * cropH));
    for (let dx = 0; dx < scaledW; dx++) {
      const sx = minX + Math.min(cropW - 1, Math.floor((dx / scaledW) * cropW));
      const sIdx = (sy * decoded.width + sx) * 4;
      const dIdx = ((offsetY + dy) * targetSize + (offsetX + dx)) * 4;
      outRgba[dIdx] = srcRgba[sIdx];
      outRgba[dIdx + 1] = srcRgba[sIdx + 1];
      outRgba[dIdx + 2] = srcRgba[sIdx + 2];
      outRgba[dIdx + 3] = srcRgba[sIdx + 3];
    }
  }

  quantizePalette(outRgba, maxColors);
  if (addOutline) {
    outRgba = applyPixelArtOutline(outRgba, targetSize, targetSize);
  }

  return {
    width: targetSize,
    height: targetSize,
    rgba: outRgba,
    pngBuffer: encodePng(targetSize, targetSize, outRgba)
  };
}

function parseCliArgs(argv) {
  const args = {
    input: 'raw_assets',
    out: 'public/assets/sprites',
    size: 48,
    colors: 28,
    outline: true,
    tolerance: 26
  };
  for (let i = 0; i < argv.length; i++) {
    const k = argv[i];
    const v = argv[i + 1];
    if (k === '--input' && v) {
      args.input = v;
      i += 1;
    } else if (k === '--out' && v) {
      args.out = v;
      i += 1;
    } else if (k === '--size' && v) {
      args.size = Number(v);
      i += 1;
    } else if (k === '--colors' && v) {
      args.colors = Number(v);
      i += 1;
    } else if (k === '--outline' && v) {
      args.outline = v !== 'false';
      i += 1;
    } else if (k === '--tolerance' && v) {
      args.tolerance = Number(v);
      i += 1;
    }
  }
  return args;
}

function runCli() {
  const args = parseCliArgs(process.argv.slice(2));
  const inputAbs = path.resolve(process.cwd(), args.input);
  const outAbs = path.resolve(process.cwd(), args.out);

  if (!fs.existsSync(inputAbs)) {
    console.log(
      `[pixelize:sprite] Input path "${args.input}" does not exist. Place raw PNGs in raw_assets/ or pass --input <file.png>.`
    );
    process.exit(0);
  }

  fs.mkdirSync(outAbs, { recursive: true });
  const stat = fs.statSync(inputAbs);
  const files = stat.isDirectory()
    ? fs
        .readdirSync(inputAbs)
        .filter((f) => f.toLowerCase().endsWith('.png'))
        .map((f) => path.join(inputAbs, f))
    : [inputAbs];

  if (files.length === 0) {
    console.log(`[pixelize:sprite] No .png files found in "${args.input}".`);
    process.exit(0);
  }

  for (const file of files) {
    const rawBuf = fs.readFileSync(file);
    const res = pixelizePngBuffer(rawBuf, args);
    const outFile = path.join(outAbs, path.basename(file));
    fs.writeFileSync(outFile, res.pngBuffer);
    console.log(
      `✅ [pixelize:sprite] ${path.basename(file)} -> ${path.relative(process.cwd(), outFile)} (${res.width}x${res.height}, ${args.colors} colors, outline=${args.outline})`
    );
  }
}

const isMain =
  process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));
if (isMain) {
  runCli();
}
