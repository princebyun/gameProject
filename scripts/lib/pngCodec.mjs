import zlib from 'node:zlib';

const PNG_SIG = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}

function makeChunk(type, data) {
  const len = Buffer.allocUnsafe(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, 'ascii');
  const crcInput = Buffer.concat([typeBuf, data]);
  const crcBuf = Buffer.allocUnsafe(4);
  crcBuf.writeUInt32BE(crc32(crcInput), 0);
  return Buffer.concat([len, typeBuf, data, crcBuf]);
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

export function isValidPngBuffer(buf) {
  return (
    Buffer.isBuffer(buf) &&
    buf.byteLength >= 33 &&
    buf.subarray(0, 8).equals(PNG_SIG)
  );
}

export function createImage(width, height, fillRgba = null) {
  const w = Math.max(1, Math.floor(width));
  const h = Math.max(1, Math.floor(height));
  const data = new Uint8ClampedArray(w * h * 4);
  if (fillRgba) {
    const [r, g, b, a = 255] = fillRgba;
    for (let i = 0; i < data.length; i += 4) {
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = a;
    }
  }
  return { width: w, height: h, data };
}

export function cloneImage(img) {
  return {
    width: img.width,
    height: img.height,
    data: new Uint8ClampedArray(img.data)
  };
}

/**
 * Pure-Node PNG decoder supporting color types 0 (Gray), 2 (RGB), 3 (Indexed+tRNS),
 * 4 (Gray+Alpha), 6 (RGBA) at bit depths 1, 2, 4, 8 (non-interlaced and Adam7).
 */
export function decodePng(buffer) {
  if (!isValidPngBuffer(buffer)) {
    throw new Error('Invalid PNG signature');
  }

  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 8;
  let colorType = 6;
  let interlace = 0;
  let palette = null;
  let trns = null;
  const idatChunks = [];

  while (offset + 8 <= buffer.length) {
    const len = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const dataStart = offset + 8;
    const dataEnd = dataStart + len;
    if (dataEnd + 4 > buffer.length) break;
    const chunk = buffer.subarray(dataStart, dataEnd);

    if (type === 'IHDR') {
      width = chunk.readUInt32BE(0);
      height = chunk.readUInt32BE(4);
      bitDepth = chunk[8];
      colorType = chunk[9];
      interlace = chunk[12];
    } else if (type === 'PLTE') {
      palette = chunk;
    } else if (type === 'tRNS') {
      trns = chunk;
    } else if (type === 'IDAT') {
      idatChunks.push(chunk);
    } else if (type === 'IEND') {
      break;
    }
    offset = dataEnd + 4;
  }

  if (width <= 0 || height <= 0 || idatChunks.length === 0) {
    throw new Error('Incomplete PNG chunks');
  }
  if (bitDepth !== 8 && bitDepth !== 4 && bitDepth !== 2 && bitDepth !== 1 && bitDepth !== 16) {
    throw new Error(`Unsupported PNG bitDepth=${bitDepth}`);
  }

  const raw = zlib.inflateSync(Buffer.concat(idatChunks));
  const channels =
    colorType === 0 ? 1 :
    colorType === 2 ? 3 :
    colorType === 3 ? 1 :
    colorType === 4 ? 2 :
    colorType === 6 ? 4 : 0;
  if (channels === 0) {
    throw new Error(`Unsupported PNG colorType=${colorType}`);
  }

  const bpp = Math.max(1, Math.ceil((channels * bitDepth) / 8));
  const out = new Uint8ClampedArray(width * height * 4);

  const decodePass = (passW, passH, startX, startY, stepX, stepY, inOffset) => {
    if (passW <= 0 || passH <= 0) return inOffset;
    const rowBytes = Math.ceil((passW * channels * bitDepth) / 8);
    let prev = new Uint8Array(rowBytes);
    for (let py = 0; py < passH; py++) {
      const filterType = raw[inOffset++];
      const cur = new Uint8Array(rowBytes);
      for (let i = 0; i < rowBytes; i++) {
        const x = raw[inOffset++] ?? 0;
        const a = i >= bpp ? cur[i - bpp] : 0;
        const b = prev[i];
        const c = i >= bpp ? prev[i - bpp] : 0;
        if (filterType === 0) cur[i] = x;
        else if (filterType === 1) cur[i] = (x + a) & 0xff;
        else if (filterType === 2) cur[i] = (x + b) & 0xff;
        else if (filterType === 3) cur[i] = (x + ((a + b) >> 1)) & 0xff;
        else cur[i] = (x + paethPredictor(a, b, c)) & 0xff;
      }

      const dstY = startY + py * stepY;
      for (let px = 0; px < passW; px++) {
        const dstX = startX + px * stepX;
        const oIdx = (dstY * width + dstX) * 4;

        if (colorType === 6 && bitDepth === 8) {
          const s = px * 4;
          out[oIdx] = cur[s];
          out[oIdx + 1] = cur[s + 1];
          out[oIdx + 2] = cur[s + 2];
          out[oIdx + 3] = cur[s + 3];
        } else if (colorType === 2 && bitDepth === 8) {
          const s = px * 3;
          const r = cur[s];
          const g = cur[s + 1];
          const b = cur[s + 2];
          let a = 255;
          if (trns && trns.length >= 6) {
            const tr = trns.readUInt16BE(0) & 0xff;
            const tg = trns.readUInt16BE(2) & 0xff;
            const tb = trns.readUInt16BE(4) & 0xff;
            if (r === tr && g === tg && b === tb) a = 0;
          }
          out[oIdx] = r;
          out[oIdx + 1] = g;
          out[oIdx + 2] = b;
          out[oIdx + 3] = a;
        } else if (colorType === 3) {
          const idx =
            bitDepth === 8 ? cur[px] :
            bitDepth === 4 ? (cur[px >> 1] >> (px % 2 === 0 ? 4 : 0)) & 0x0f :
            bitDepth === 2 ? (cur[px >> 2] >> ((3 - (px % 4)) * 2)) & 0x03 :
            (cur[px >> 3] >> (7 - (px % 8))) & 0x01;
          const pOff = idx * 3;
          out[oIdx] = palette ? (palette[pOff] ?? 0) : idx;
          out[oIdx + 1] = palette ? (palette[pOff + 1] ?? 0) : idx;
          out[oIdx + 2] = palette ? (palette[pOff + 2] ?? 0) : idx;
          out[oIdx + 3] = trns && idx < trns.length ? trns[idx] : 255;
        } else if (colorType === 0 && bitDepth === 8) {
          const v = cur[px];
          const a = trns && trns.length >= 2 && v === (trns.readUInt16BE(0) & 0xff) ? 0 : 255;
          out[oIdx] = v;
          out[oIdx + 1] = v;
          out[oIdx + 2] = v;
          out[oIdx + 3] = a;
        } else if (colorType === 4 && bitDepth === 8) {
          const s = px * 2;
          const v = cur[s];
          out[oIdx] = v;
          out[oIdx + 1] = v;
          out[oIdx + 2] = v;
          out[oIdx + 3] = cur[s + 1];
        } else if (bitDepth === 16) {
          const byteStep = channels * 2;
          const s = px * byteStep;
          if (colorType === 6) {
            out[oIdx] = cur[s];
            out[oIdx + 1] = cur[s + 2];
            out[oIdx + 2] = cur[s + 4];
            out[oIdx + 3] = cur[s + 6];
          } else if (colorType === 2) {
            out[oIdx] = cur[s];
            out[oIdx + 1] = cur[s + 2];
            out[oIdx + 2] = cur[s + 4];
            out[oIdx + 3] = 255;
          } else if (colorType === 4) {
            out[oIdx] = out[oIdx + 1] = out[oIdx + 2] = cur[s];
            out[oIdx + 3] = cur[s + 2];
          } else {
            out[oIdx] = out[oIdx + 1] = out[oIdx + 2] = cur[s];
            out[oIdx + 3] = 255;
          }
        }
      }
      prev = cur;
    }
    return inOffset;
  };

  if (interlace === 1) {
    const passes = [
      [0, 0, 8, 8],
      [4, 0, 8, 8],
      [0, 4, 4, 8],
      [2, 0, 4, 4],
      [0, 2, 2, 4],
      [1, 0, 2, 2],
      [0, 1, 1, 2]
    ];
    let pos = 0;
    for (const [sx, sy, stepX, stepY] of passes) {
      const pw = Math.ceil((width - sx) / stepX);
      const ph = Math.ceil((height - sy) / stepY);
      pos = decodePass(pw, ph, sx, sy, stepX, stepY, pos);
    }
  } else {
    decodePass(width, height, 0, 0, 1, 1, 0);
  }

  return { width, height, data: out };
}

export function encodePng(width, height, rgba) {
  const ihdr = Buffer.allocUnsafe(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const stride = width * 4;
  const raw = Buffer.allocUnsafe((stride + 1) * height);
  const view = Buffer.from(rgba.buffer, rgba.byteOffset, width * height * 4);
  for (let y = 0; y < height; y++) {
    const rowStart = y * (stride + 1);
    raw[rowStart] = 0;
    view.copy(raw, rowStart + 1, y * stride, (y + 1) * stride);
  }

  const compressed = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([
    PNG_SIG,
    makeChunk('IHDR', ihdr),
    makeChunk('IDAT', compressed),
    makeChunk('IEND', Buffer.alloc(0))
  ]);
}

export function encodeImageToPng(img) {
  return encodePng(img.width, img.height, img.data);
}

export function blit(
  dst,
  src,
  sx = 0,
  sy = 0,
  sw = src.width,
  sh = src.height,
  dx = 0,
  dy = 0,
  options = {}
) {
  const { alphaBlend = true, flipX = false, tintRgb = null, tintStrength = 0 } = options;
  for (let py = 0; py < sh; py++) {
    const srcY = sy + py;
    const dstY = dy + py;
    if (srcY < 0 || srcY >= src.height || dstY < 0 || dstY >= dst.height) continue;
    for (let px = 0; px < sw; px++) {
      const srcX = sx + (flipX ? sw - 1 - px : px);
      const dstX = dx + px;
      if (srcX < 0 || srcX >= src.width || dstX < 0 || dstX >= dst.width) continue;
      const si = (srcY * src.width + srcX) * 4;
      let r = src.data[si];
      let g = src.data[si + 1];
      let b = src.data[si + 2];
      const a = src.data[si + 3];
      if (a === 0 && alphaBlend) continue;
      if (tintRgb && tintStrength > 0) {
        r = Math.round(r * (1 - tintStrength) + tintRgb[0] * tintStrength);
        g = Math.round(g * (1 - tintStrength) + tintRgb[1] * tintStrength);
        b = Math.round(b * (1 - tintStrength) + tintRgb[2] * tintStrength);
      }
      const di = (dstY * dst.width + dstX) * 4;
      if (!alphaBlend || a === 255) {
        dst.data[di] = r;
        dst.data[di + 1] = g;
        dst.data[di + 2] = b;
        dst.data[di + 3] = a;
      } else {
        const sa = a / 255;
        const da = dst.data[di + 3] / 255;
        const outA = sa + da * (1 - sa);
        if (outA > 0) {
          dst.data[di] = Math.round((r * sa + dst.data[di] * da * (1 - sa)) / outA);
          dst.data[di + 1] = Math.round((g * sa + dst.data[di + 1] * da * (1 - sa)) / outA);
          dst.data[di + 2] = Math.round((b * sa + dst.data[di + 2] * da * (1 - sa)) / outA);
          dst.data[di + 3] = Math.round(outA * 255);
        }
      }
    }
  }
}

export function resizeNearest(src, targetWidth, targetHeight) {
  const dst = createImage(targetWidth, targetHeight);
  for (let y = 0; y < targetHeight; y++) {
    const sy = Math.min(src.height - 1, Math.floor((y * src.height) / targetHeight));
    for (let x = 0; x < targetWidth; x++) {
      const sx = Math.min(src.width - 1, Math.floor((x * src.width) / targetWidth));
      const si = (sy * src.width + sx) * 4;
      const di = (y * targetWidth + x) * 4;
      dst.data[di] = src.data[si];
      dst.data[di + 1] = src.data[si + 1];
      dst.data[di + 2] = src.data[si + 2];
      dst.data[di + 3] = src.data[si + 3];
    }
  }
  return dst;
}

export function hexToRgb(hex) {
  const clean = hex.replace('#', '');
  const full = clean.length === 3
    ? clean.split('').map((c) => c + c).join('')
    : clean.slice(0, 6);
  const num = parseInt(full, 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

export function applyBiomeGrade(img, options = {}) {
  const { tintHex = null, strength = 0.28, brightness = 1, contrast = 1 } = options;
  const tint = tintHex ? hexToRgb(tintHex) : null;
  const out = cloneImage(img);
  for (let i = 0; i < out.data.length; i += 4) {
    if (out.data[i + 3] === 0) continue;
    let r = out.data[i];
    let g = out.data[i + 1];
    let b = out.data[i + 2];
    if (tint && strength > 0) {
      r = r * (1 - strength) + tint[0] * strength;
      g = g * (1 - strength) + tint[1] * strength;
      b = b * (1 - strength) + tint[2] * strength;
    }
    r = ((r - 128) * contrast + 128) * brightness;
    g = ((g - 128) * contrast + 128) * brightness;
    b = ((b - 128) * contrast + 128) * brightness;
    out.data[i] = Math.max(0, Math.min(255, Math.round(r)));
    out.data[i + 1] = Math.max(0, Math.min(255, Math.round(g)));
    out.data[i + 2] = Math.max(0, Math.min(255, Math.round(b)));
  }
  return out;
}

export function tileHorizontalSeamless(src, targetWidth, targetHeight) {
  const scaled = resizeNearest(src, Math.max(targetWidth, Math.round((src.width * targetHeight) / src.height)), targetHeight);
  const dst = createImage(targetWidth, targetHeight);
  for (let y = 0; y < targetHeight; y++) {
    for (let x = 0; x < targetWidth; x++) {
      const sx = x % scaled.width;
      const si = (y * scaled.width + sx) * 4;
      const di = (y * targetWidth + x) * 4;
      dst.data[di] = scaled.data[si];
      dst.data[di + 1] = scaled.data[si + 1];
      dst.data[di + 2] = scaled.data[si + 2];
      dst.data[di + 3] = scaled.data[si + 3];
    }
  }
  return dst;
}
