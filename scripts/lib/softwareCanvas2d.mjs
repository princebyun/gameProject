/**
 * Pure-JS Software Canvas2D Shim for Node CLI thumbnail & portrait baking.
 * Supports the exact CanvasRenderingContext2D subset used by ProceduralPixelSheetBaker
 * and PixelPortraitRenderer, plus a crisp built-in 5x7 pixel bitmap font for contact_sheet.png.
 */

function parseCssColor(colorStr) {
  if (!colorStr || typeof colorStr !== 'string') return [0, 0, 0, 255];
  const s = colorStr.trim().toLowerCase();
  if (s === 'transparent') return [0, 0, 0, 0];

  if (s.startsWith('#')) {
    const hex = s.slice(1);
    if (hex.length === 3) {
      return [
        parseInt(hex[0] + hex[0], 16),
        parseInt(hex[1] + hex[1], 16),
        parseInt(hex[2] + hex[2], 16),
        255
      ];
    }
    if (hex.length === 6) {
      return [
        parseInt(hex.slice(0, 2), 16),
        parseInt(hex.slice(2, 4), 16),
        parseInt(hex.slice(4, 6), 16),
        255
      ];
    }
    if (hex.length === 8) {
      return [
        parseInt(hex.slice(0, 2), 16),
        parseInt(hex.slice(2, 4), 16),
        parseInt(hex.slice(4, 6), 16),
        parseInt(hex.slice(6, 8), 16)
      ];
    }
  }

  const rgbaMatch = s.match(
    /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)$/
  );
  if (rgbaMatch) {
    return [
      Math.round(Number(rgbaMatch[1])),
      Math.round(Number(rgbaMatch[2])),
      Math.round(Number(rgbaMatch[3])),
      rgbaMatch[4] !== undefined ? Math.round(Number(rgbaMatch[4]) * 255) : 255
    ];
  }

  return [255, 255, 255, 255];
}

class SoftwareLinearGradient {
  constructor(x0, y0, x1, y1) {
    this.x0 = x0;
    this.y0 = y0;
    this.x1 = x1;
    this.y1 = y1;
    this.stops = [];
  }
  addColorStop(offset, color) {
    this.stops.push({ offset: Math.max(0, Math.min(1, offset)), rgba: parseCssColor(color) });
    this.stops.sort((a, b) => a.offset - b.offset);
  }
  sample(x, y) {
    if (this.stops.length === 0) return [0, 0, 0, 255];
    if (this.stops.length === 1) return this.stops[0].rgba;
    const dx = this.x1 - this.x0;
    const dy = this.y1 - this.y0;
    const lenSq = dx * dx + dy * dy;
    const t =
      lenSq <= 0.0001
        ? 0
        : Math.max(0, Math.min(1, ((x - this.x0) * dx + (y - this.y0) * dy) / lenSq));
    let left = this.stops[0];
    let right = this.stops[this.stops.length - 1];
    for (let i = 0; i < this.stops.length - 1; i++) {
      if (t >= this.stops[i].offset && t <= this.stops[i + 1].offset) {
        left = this.stops[i];
        right = this.stops[i + 1];
        break;
      }
    }
    const span = Math.max(0.0001, right.offset - left.offset);
    const localT = Math.max(0, Math.min(1, (t - left.offset) / span));
    return [
      Math.round(left.rgba[0] + (right.rgba[0] - left.rgba[0]) * localT),
      Math.round(left.rgba[1] + (right.rgba[1] - left.rgba[1]) * localT),
      Math.round(left.rgba[2] + (right.rgba[2] - left.rgba[2]) * localT),
      Math.round(left.rgba[3] + (right.rgba[3] - left.rgba[3]) * localT)
    ];
  }
}

export class SoftwareCanvas2D {
  constructor(width = 300, height = 150) {
    this._width = Math.max(1, Math.round(width));
    this._height = Math.max(1, Math.round(height));
    this.data = new Uint8ClampedArray(this._width * this._height * 4);
    this._ctx = new SoftwareContext2D(this);
  }

  get width() {
    return this._width;
  }
  set width(v) {
    const nv = Math.max(1, Math.round(v));
    this._width = nv;
    this.data = new Uint8ClampedArray(this._width * this._height * 4);
  }
  get height() {
    return this._height;
  }
  set height(v) {
    const nv = Math.max(1, Math.round(v));
    this._height = nv;
    this.data = new Uint8ClampedArray(this._width * this._height * 4);
  }

  getContext(type) {
    if (type === '2d') return this._ctx;
    return null;
  }
}

class SoftwareContext2D {
  constructor(canvas) {
    this.canvas = canvas;
    this.fillStyle = '#000000';
    this.strokeStyle = '#000000';
    this.lineWidth = 1;
    this.lineCap = 'butt';
    this.globalAlpha = 1;
    this.globalCompositeOperation = 'source-over';
    this.imageSmoothingEnabled = false;
    this._tx = 0;
    this._ty = 0;
    this._sx = 1;
    this._sy = 1;
    this._stack = [];
    this._path = [];
  }

  save() {
    this._stack.push({
      fillStyle: this.fillStyle,
      strokeStyle: this.strokeStyle,
      lineWidth: this.lineWidth,
      lineCap: this.lineCap,
      globalAlpha: this.globalAlpha,
      globalCompositeOperation: this.globalCompositeOperation,
      tx: this._tx,
      ty: this._ty,
      sx: this._sx,
      sy: this._sy
    });
  }

  restore() {
    const st = this._stack.pop();
    if (!st) return;
    this.fillStyle = st.fillStyle;
    this.strokeStyle = st.strokeStyle;
    this.lineWidth = st.lineWidth;
    this.lineCap = st.lineCap;
    this.globalAlpha = st.globalAlpha;
    this.globalCompositeOperation = st.globalCompositeOperation;
    this._tx = st.tx;
    this._ty = st.ty;
    this._sx = st.sx;
    this._sy = st.sy;
  }

  translate(x, y) {
    this._tx += x * this._sx;
    this._ty += y * this._sy;
  }

  scale(x, y) {
    this._sx *= x;
    this._sy *= y;
  }

  rotate() {
    // Not required by proceduralPixelSheetBaker or pixelPortraitRenderer
  }

  createLinearGradient(x0, y0, x1, y1) {
    return new SoftwareLinearGradient(x0, y0, x1, y1);
  }

  _blendPixel(x, y, r, g, b, a) {
    const ix = Math.round(x);
    const iy = Math.round(y);
    const w = this.canvas.width;
    const h = this.canvas.height;
    if (ix < 0 || ix >= w || iy < 0 || iy >= h) return;

    const effA = (a / 255) * this.globalAlpha;
    if (effA <= 0.002) return;

    const p = (iy * w + ix) * 4;
    const buf = this.canvas.data;

    if (this.globalCompositeOperation === 'source-atop') {
      if (buf[p + 3] === 0) return;
      buf[p] = Math.round(r * effA + buf[p] * (1 - effA));
      buf[p + 1] = Math.round(g * effA + buf[p + 1] * (1 - effA));
      buf[p + 2] = Math.round(b * effA + buf[p + 2] * (1 - effA));
      return;
    }

    if (effA >= 0.996) {
      buf[p] = r;
      buf[p + 1] = g;
      buf[p + 2] = b;
      buf[p + 3] = 255;
      return;
    }

    const dstA = buf[p + 3] / 255;
    const outA = effA + dstA * (1 - effA);
    if (outA <= 0.001) return;
    buf[p] = Math.round((r * effA + buf[p] * dstA * (1 - effA)) / outA);
    buf[p + 1] = Math.round((g * effA + buf[p + 1] * dstA * (1 - effA)) / outA);
    buf[p + 2] = Math.round((b * effA + buf[p + 2] * dstA * (1 - effA)) / outA);
    buf[p + 3] = Math.round(outA * 255);
  }

  _sampleStyle(style, x, y) {
    if (style instanceof SoftwareLinearGradient) {
      return style.sample(x, y);
    }
    return parseCssColor(style);
  }

  clearRect(x, y, w, h) {
    const x0 = Math.max(0, Math.floor(x * this._sx + this._tx));
    const y0 = Math.max(0, Math.floor(y * this._sy + this._ty));
    const x1 = Math.min(this.canvas.width, Math.ceil((x + w) * this._sx + this._tx));
    const y1 = Math.min(this.canvas.height, Math.ceil((y + h) * this._sy + this._ty));
    const buf = this.canvas.data;
    const cw = this.canvas.width;
    for (let py = y0; py < y1; py++) {
      for (let px = x0; px < x1; px++) {
        const p = (py * cw + px) * 4;
        buf[p] = 0;
        buf[p + 1] = 0;
        buf[p + 2] = 0;
        buf[p + 3] = 0;
      }
    }
  }

  fillRect(x, y, w, h) {
    const rx0 = x * this._sx + this._tx;
    const ry0 = y * this._sy + this._ty;
    const rx1 = (x + w) * this._sx + this._tx;
    const ry1 = (y + h) * this._sy + this._ty;
    const x0 = Math.max(0, Math.floor(Math.min(rx0, rx1)));
    const y0 = Math.max(0, Math.floor(Math.min(ry0, ry1)));
    const x1 = Math.min(this.canvas.width, Math.ceil(Math.max(rx0, rx1)));
    const y1 = Math.min(this.canvas.height, Math.ceil(Math.max(ry0, ry1)));
    const isGrad = this.fillStyle instanceof SoftwareLinearGradient;
    const flat = isGrad ? null : parseCssColor(this.fillStyle);

    for (let py = y0; py < y1; py++) {
      for (let px = x0; px < x1; px++) {
        const [r, g, b, a] = isGrad ? this._sampleStyle(this.fillStyle, px, py) : flat;
        this._blendPixel(px, py, r, g, b, a);
      }
    }
  }

  strokeRect(x, y, w, h) {
    const lw = Math.max(1, Math.round(this.lineWidth));
    const prev = this.fillStyle;
    this.fillStyle = this.strokeStyle;
    this.fillRect(x, y, w, lw);
    this.fillRect(x, y + h - lw, w, lw);
    this.fillRect(x, y, lw, h);
    this.fillRect(x + w - lw, y, lw, h);
    this.fillStyle = prev;
  }

  beginPath() {
    this._path = [];
  }

  moveTo(x, y) {
    this._path.push({ type: 'M', x: x * this._sx + this._tx, y: y * this._sy + this._ty });
  }

  lineTo(x, y) {
    this._path.push({ type: 'L', x: x * this._sx + this._tx, y: y * this._sy + this._ty });
  }

  arc(cx, cy, r, startAngle, endAngle) {
    this._path.push({
      type: 'ARC',
      cx: cx * this._sx + this._tx,
      cy: cy * this._sy + this._ty,
      r: Math.abs(r * this._sx),
      startAngle,
      endAngle
    });
  }

  closePath() {
    this._path.push({ type: 'Z' });
  }

  _drawDisc(cx, cy, rad, rgba) {
    const r = Math.max(0.5, rad);
    const x0 = Math.floor(cx - r);
    const x1 = Math.ceil(cx + r);
    const y0 = Math.floor(cy - r);
    const y1 = Math.ceil(cy + r);
    const rSq = r * r;
    for (let py = y0; py <= y1; py++) {
      for (let px = x0; px <= x1; px++) {
        const dx = px - cx;
        const dy = py - cy;
        if (dx * dx + dy * dy <= rSq) {
          this._blendPixel(px, py, rgba[0], rgba[1], rgba[2], rgba[3]);
        }
      }
    }
  }

  _drawSegment(x0, y0, x1, y1, lw, rgba) {
    const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 1.5));
    const rad = lw * 0.5;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      this._drawDisc(x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, rad, rgba);
    }
  }

  stroke() {
    const rgba = parseCssColor(this.strokeStyle);
    const lw = Math.max(1, this.lineWidth);
    let lastX = 0;
    let lastY = 0;
    let startX = 0;
    let startY = 0;

    for (const cmd of this._path) {
      if (cmd.type === 'M') {
        lastX = cmd.x;
        lastY = cmd.y;
        startX = cmd.x;
        startY = cmd.y;
      } else if (cmd.type === 'L') {
        this._drawSegment(lastX, lastY, cmd.x, cmd.y, lw, rgba);
        lastX = cmd.x;
        lastY = cmd.y;
      } else if (cmd.type === 'Z') {
        this._drawSegment(lastX, lastY, startX, startY, lw, rgba);
      } else if (cmd.type === 'ARC') {
        const span = Math.abs(cmd.endAngle - cmd.startAngle);
        const segs = Math.max(12, Math.ceil(cmd.r * span * 1.4));
        const step = (cmd.endAngle - cmd.startAngle) / segs;
        for (let i = 0; i <= segs; i++) {
          const a = cmd.startAngle + step * i;
          this._drawDisc(
            cmd.cx + Math.cos(a) * cmd.r,
            cmd.cy + Math.sin(a) * cmd.r,
            lw * 0.5,
            rgba
          );
        }
      }
    }
  }

  fill() {
    const rgba = parseCssColor(this.fillStyle);
    for (const cmd of this._path) {
      if (cmd.type === 'ARC') {
        this._drawDisc(cmd.cx, cmd.cy, cmd.r, rgba);
      }
    }
  }

  drawImage(img, ...args) {
    if (!img || !img.data) return;
    const sw0 = img.width;
    const sh0 = img.height;
    let sx = 0;
    let sy = 0;
    let sw = sw0;
    let sh = sh0;
    let dx = 0;
    let dy = 0;
    let dw = sw0;
    let dh = sh0;

    if (args.length === 2) {
      [dx, dy] = args;
    } else if (args.length === 4) {
      [dx, dy, dw, dh] = args;
    } else if (args.length >= 8) {
      [sx, sy, sw, sh, dx, dy, dw, dh] = args;
    }

    const rdx = Math.round(dx * this._sx + this._tx);
    const rdy = Math.round(dy * this._sy + this._ty);
    const rdw = Math.max(1, Math.round(Math.abs(dw * this._sx)));
    const rdh = Math.max(1, Math.round(Math.abs(dh * this._sy)));

    for (let y = 0; y < rdh; y++) {
      const srcY = Math.floor(sy + ((y + 0.5) / rdh) * sh);
      if (srcY < 0 || srcY >= sh0) continue;
      for (let x = 0; x < rdw; x++) {
        const srcX = Math.floor(sx + ((x + 0.5) / rdw) * sw);
        if (srcX < 0 || srcX >= sw0) continue;
        const p = (srcY * sw0 + srcX) * 4;
        const a = img.data[p + 3];
        if (a === 0) continue;
        this._blendPixel(rdx + x, rdy + y, img.data[p], img.data[p + 1], img.data[p + 2], a);
      }
    }
  }

  getImageData(x, y, w, h) {
    const rx = Math.round(x);
    const ry = Math.round(y);
    const rw = Math.max(1, Math.round(w));
    const rh = Math.max(1, Math.round(h));
    const out = new Uint8ClampedArray(rw * rh * 4);
    const cw = this.canvas.width;
    const ch = this.canvas.height;
    const buf = this.canvas.data;
    for (let py = 0; py < rh; py++) {
      const sy = ry + py;
      if (sy < 0 || sy >= ch) continue;
      for (let px = 0; px < rw; px++) {
        const sx = rx + px;
        if (sx < 0 || sx >= cw) continue;
        const sIdx = (sy * cw + sx) * 4;
        const dIdx = (py * rw + px) * 4;
        out[dIdx] = buf[sIdx];
        out[dIdx + 1] = buf[sIdx + 1];
        out[dIdx + 2] = buf[sIdx + 2];
        out[dIdx + 3] = buf[sIdx + 3];
      }
    }
    return { width: rw, height: rh, data: out };
  }

  putImageData(imgData, dx, dy) {
    const rx = Math.round(dx);
    const ry = Math.round(dy);
    const rw = imgData.width;
    const rh = imgData.height;
    const cw = this.canvas.width;
    const ch = this.canvas.height;
    const buf = this.canvas.data;
    for (let py = 0; py < rh; py++) {
      const ty = ry + py;
      if (ty < 0 || ty >= ch) continue;
      for (let px = 0; px < rw; px++) {
        const tx = rx + px;
        if (tx < 0 || tx >= cw) continue;
        const sIdx = (py * rw + px) * 4;
        const dIdx = (ty * cw + tx) * 4;
        buf[dIdx] = imgData.data[sIdx];
        buf[dIdx + 1] = imgData.data[sIdx + 1];
        buf[dIdx + 2] = imgData.data[sIdx + 2];
        buf[dIdx + 3] = imgData.data[sIdx + 3];
      }
    }
  }
}

/**
 * Installs minimal `globalThis.document` shim so browser-targeted bakers work identically in Node.
 */
export function installSoftwareDocumentShim() {
  if (typeof globalThis.document === 'undefined') {
    globalThis.document = {
      createElement(tag) {
        if (tag === 'canvas') return new SoftwareCanvas2D();
        return {};
      }
    };
  }
}

// Compact 5x7 uppercase + digit + symbol pixel bitmap font for contact_sheet.png labels
const FONT_5X7 = {
  A: ['01110', '10001', '10001', '11111', '10001', '10001', '10001'],
  B: ['11110', '10001', '10001', '11110', '10001', '10001', '11110'],
  C: ['01110', '10001', '10000', '10000', '10000', '10001', '01110'],
  D: ['11110', '10001', '10001', '10001', '10001', '10001', '11110'],
  E: ['11111', '10000', '10000', '11110', '10000', '10000', '11111'],
  F: ['11111', '10000', '10000', '11110', '10000', '10000', '10000'],
  G: ['01110', '10001', '10000', '10111', '10001', '10001', '01110'],
  H: ['10001', '10001', '10001', '11111', '10001', '10001', '10001'],
  I: ['01110', '00100', '00100', '00100', '00100', '00100', '01110'],
  J: ['00111', '00010', '00010', '00010', '10010', '10010', '01100'],
  K: ['10001', '10010', '10100', '11000', '10100', '10010', '10001'],
  L: ['10000', '10000', '10000', '10000', '10000', '10000', '11111'],
  M: ['10001', '11011', '10101', '10101', '10001', '10001', '10001'],
  N: ['10001', '11001', '10101', '10011', '10001', '10001', '10001'],
  O: ['01110', '10001', '10001', '10001', '10001', '10001', '01110'],
  P: ['11110', '10001', '10001', '11110', '10000', '10000', '10000'],
  Q: ['01110', '10001', '10001', '10001', '10101', '10010', '01101'],
  R: ['11110', '10001', '10001', '11110', '10100', '10010', '10001'],
  S: ['01111', '10000', '10000', '01110', '00001', '00001', '11110'],
  T: ['11111', '00100', '00100', '00100', '00100', '00100', '00100'],
  U: ['10001', '10001', '10001', '10001', '10001', '10001', '01110'],
  V: ['10001', '10001', '10001', '10001', '10001', '01010', '00100'],
  W: ['10001', '10001', '10001', '10101', '10101', '11011', '10001'],
  X: ['10001', '10001', '01010', '00100', '01010', '10001', '10001'],
  Y: ['10001', '10001', '01010', '00100', '00100', '00100', '00100'],
  Z: ['11111', '00001', '00010', '00100', '01000', '10000', '11111'],
  '0': ['01110', '10011', '10101', '10101', '11001', '10001', '01110'],
  '1': ['00100', '01100', '00100', '00100', '00100', '00100', '01110'],
  '2': ['01110', '10001', '00001', '00110', '01000', '10000', '11111'],
  '3': ['11110', '00001', '00001', '01110', '00001', '00001', '11110'],
  '4': ['00010', '00110', '01010', '10010', '11111', '00010', '00010'],
  '5': ['11111', '10000', '11110', '00001', '00001', '10001', '01110'],
  '6': ['01110', '10000', '11110', '10001', '10001', '10001', '01110'],
  '7': ['11111', '00001', '00010', '00100', '01000', '01000', '01000'],
  '8': ['01110', '10001', '10001', '01110', '10001', '10001', '01110'],
  '9': ['01110', '10001', '10001', '01111', '00001', '00001', '01110'],
  '_': ['00000', '00000', '00000', '00000', '00000', '00000', '11111'],
  '-': ['00000', '00000', '00000', '11111', '00000', '00000', '00000'],
  '/': ['00001', '00010', '00010', '00100', '01000', '01000', '10000'],
  ':': ['00000', '00100', '00100', '00000', '00100', '00100', '00000'],
  '.': ['00000', '00000', '00000', '00000', '00000', '01100', '01100'],
  '(': ['00010', '00100', '01000', '01000', '01000', '00100', '00010'],
  ')': ['01000', '00100', '00010', '00010', '00010', '00100', '01000'],
  '#': ['01010', '11111', '01010', '01010', '11111', '01010', '00000'],
  '%': ['11001', '11010', '00100', '00100', '01011', '10011', '00000'],
  ' ': ['00000', '00000', '00000', '00000', '00000', '00000', '00000']
};

export function drawBitmapText(rgba, strideW, strideH, text, startX, startY, colorHex, scale = 1) {
  const [r, g, b, a] = parseCssColor(colorHex);
  const upper = String(text ?? '').toUpperCase();
  let cx = Math.round(startX);
  const cy = Math.round(startY);

  for (let i = 0; i < upper.length; i++) {
    const ch = upper[i];
    const glyph = FONT_5X7[ch] ?? FONT_5X7[' '];
    for (let gy = 0; gy < 7; gy++) {
      const row = glyph[gy];
      for (let gx = 0; gx < 5; gx++) {
        if (row[gx] !== '1') continue;
        for (let sy = 0; sy < scale; sy++) {
          for (let sx = 0; sx < scale; sx++) {
            const px = cx + gx * scale + sx;
            const py = cy + gy * scale + sy;
            if (px < 0 || px >= strideW || py < 0 || py >= strideH) continue;
            const p = (py * strideW + px) * 4;
            rgba[p] = r;
            rgba[p + 1] = g;
            rgba[p + 2] = b;
            rgba[p + 3] = a;
          }
        }
      }
    }
    cx += 6 * scale;
  }
}
