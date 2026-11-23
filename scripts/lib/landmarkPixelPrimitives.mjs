import { createImage, hexToRgb } from './pngCodec.mjs';

export function makeCanvas(w, h) {
  return createImage(w, h);
}

export function rgb(hex, a = 255) {
  const [r, g, b] = hexToRgb(hex);
  return [r, g, b, a];
}

export function setPx(img, x, y, rgba) {
  const ix = Math.round(x);
  const iy = Math.round(y);
  if (ix < 0 || iy < 0 || ix >= img.width || iy >= img.height) return;
  const idx = (iy * img.width + ix) * 4;
  const [, , , a = 255] = rgba;
  if (a === 255) {
    img.data[idx] = rgba[0];
    img.data[idx + 1] = rgba[1];
    img.data[idx + 2] = rgba[2];
    img.data[idx + 3] = 255;
  } else if (a > 0) {
    const sa = a / 255;
    const da = img.data[idx + 3] / 255;
    const outA = sa + da * (1 - sa);
    if (outA > 0) {
      img.data[idx] = Math.round((rgba[0] * sa + img.data[idx] * da * (1 - sa)) / outA);
      img.data[idx + 1] = Math.round((rgba[1] * sa + img.data[idx + 1] * da * (1 - sa)) / outA);
      img.data[idx + 2] = Math.round((rgba[2] * sa + img.data[idx + 2] * da * (1 - sa)) / outA);
      img.data[idx + 3] = Math.round(outA * 255);
    }
  }
}

export function fillRect(img, x, y, w, h, rgba) {
  const x0 = Math.round(x);
  const y0 = Math.round(y);
  const x1 = x0 + Math.round(w);
  const y1 = y0 + Math.round(h);
  for (let py = y0; py < y1; py++) {
    for (let px = x0; px < x1; px++) {
      setPx(img, px, py, rgba);
    }
  }
}

export function fillEllipse(img, cx, cy, rx, ry, rgba) {
  if (rx <= 0 || ry <= 0) return;
  const x0 = Math.floor(cx - rx);
  const x1 = Math.ceil(cx + rx);
  const y0 = Math.floor(cy - ry);
  const y1 = Math.ceil(cy + ry);
  for (let py = y0; py <= y1; py++) {
    for (let px = x0; px <= x1; px++) {
      const dx = (px - cx) / rx;
      const dy = (py - cy) / ry;
      if (dx * dx + dy * dy <= 1) {
        setPx(img, px, py, rgba);
      }
    }
  }
}

export function fillTriangle(img, x0, y0, x1, y1, x2, y2, rgba) {
  const minX = Math.floor(Math.min(x0, x1, x2));
  const maxX = Math.ceil(Math.max(x0, x1, x2));
  const minY = Math.floor(Math.min(y0, y1, y2));
  const maxY = Math.ceil(Math.max(y0, y1, y2));
  const area = (x1 - x0) * (y2 - y0) - (y1 - y0) * (x2 - x0);
  if (Math.abs(area) < 0.001) return;
  const sign = area > 0 ? 1 : -1;
  for (let py = minY; py <= maxY; py++) {
    for (let px = minX; px <= maxX; px++) {
      const w0 = ((x1 - x0) * (py - y0) - (y1 - y0) * (px - x0)) * sign;
      const w1 = ((x2 - x1) * (py - y1) - (y2 - y1) * (px - x1)) * sign;
      const w2 = ((x0 - x2) * (py - y2) - (y0 - y2) * (px - x2)) * sign;
      if (w0 >= 0 && w1 >= 0 && w2 >= 0) {
        setPx(img, px, py, rgba);
      }
    }
  }
}

export function drawLine(img, x0, y0, x1, y1, rgba, thickness = 1) {
  const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0)));
  const r = Math.max(0, Math.floor((thickness - 1) / 2));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const px = Math.round(x0 + (x1 - x0) * t);
    const py = Math.round(y0 + (y1 - y0) * t);
    if (r === 0) {
      setPx(img, px, py, rgba);
    } else {
      fillRect(img, px - r, py - r, thickness, thickness, rgba);
    }
  }
}

export function drawWaveFoamBase(img, cx, cy, rx, ry, frameIdx, tintHex = '#e0f2fe', foamHex = '#ffffff') {
  const phase = (frameIdx * Math.PI) / 2;
  const r1 = rgb(tintHex, 155);
  const r2 = rgb(foamHex, 225);
  for (let a = 0; a < 48; a++) {
    const ang = (a / 48) * Math.PI * 2;
    const wob = Math.sin(ang * 4 + phase) * 1.4;
    const px = cx + Math.cos(ang) * (rx + wob);
    const py = cy + Math.sin(ang) * (ry + wob * 0.5);
    setPx(img, px, py, r1);
    if ((a + frameIdx) % 3 === 0) {
      setPx(img, px + (Math.cos(ang) > 0 ? 1 : -1), py, r2);
    }
  }
}

export function applyChromaticOutline(img, outlineHex = '#1b2438') {
  const out = createImage(img.width, img.height);
  out.data.set(img.data);
  const [or, og, ob] = hexToRgb(outlineHex);
  const dirs = [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1]
  ];
  for (let y = 0; y < img.height; y++) {
    for (let x = 0; x < img.width; x++) {
      const idx = (y * img.width + x) * 4;
      if (img.data[idx + 3] > 24) continue;
      let touchesOpaque = false;
      for (const [dx, dy] of dirs) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= img.width || ny >= img.height) continue;
        const nIdx = (ny * img.width + nx) * 4;
        if (img.data[nIdx + 3] >= 180) {
          touchesOpaque = true;
          break;
        }
      }
      if (touchesOpaque) {
        out.data[idx] = or;
        out.data[idx + 1] = og;
        out.data[idx + 2] = ob;
        out.data[idx + 3] = 240;
      }
    }
  }
  return out;
}

export function drawIslandMound(img, w, h, rockDark, rockMid, grassMid, grassHi, cliffH = 18) {
  const cx = w / 2;
  const baseY = h - 18;
  const rx = w * 0.38;
  fillEllipse(img, cx, baseY, rx, 13, rgb(rockDark));
  fillEllipse(img, cx, baseY - 4, rx - 3, 12, rgb(rockMid));
  fillEllipse(img, cx, baseY - cliffH, rx - 7, 11, rgb(grassMid));
  fillEllipse(img, cx - 3, baseY - cliffH - 2, rx - 14, 7, rgb(grassHi));
}
