import type { ThreeToneHex } from './rigTypes';

export interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

export function parseHexRgba(hex: string, alpha = 255): Rgba {
  const clean = hex.replace('#', '');
  const num = parseInt(clean, 16) || 0;
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
    a: alpha
  };
}

/**
 * Computes a dark hue-shifted outline color from an interior pixel RGB value
 * (shifts luminance down to ~14-20% while preserving subtle chromatic hue).
 */
export function computeHueShiftedDarkOutline(r: number, g: number, b: number): Rgba {
  return {
    r: Math.max(10, Math.min(48, Math.round(r * 0.17 + 8))),
    g: Math.max(8, Math.min(42, Math.round(g * 0.14 + 6))),
    b: Math.max(14, Math.min(56, Math.round(b * 0.21 + 12))),
    a: 255
  };
}

/**
 * Pure integer-pixel surface buffer (`Uint8ClampedArray`) with zero anti-aliasing.
 * Supports 3-tone shaded limbs, rotated pixel weapon sprites, smear arcs,
 * and automatic 1px hue-shifted exterior outlining.
 */
export class RigPixelSurface {
  public readonly data: Uint8ClampedArray;

  constructor(
    public readonly width: number,
    public readonly height: number
  ) {
    this.data = new Uint8ClampedArray(width * height * 4);
  }

  public setRgba(x: number, y: number, c: Rgba): void {
    const ix = Math.round(x);
    const iy = Math.round(y);
    if (ix < 0 || ix >= this.width || iy < 0 || iy >= this.height) return;
    const idx = (iy * this.width + ix) * 4;
    this.data[idx] = c.r;
    this.data[idx + 1] = c.g;
    this.data[idx + 2] = c.b;
    this.data[idx + 3] = c.a;
  }

  public setPixel(x: number, y: number, hex: string, alpha = 255): void {
    this.setRgba(x, y, parseHexRgba(hex, alpha));
  }

  public getAlpha(x: number, y: number): number {
    if (x < 0 || x >= this.width || y < 0 || y >= this.height) return 0;
    return this.data[(y * this.width + x) * 4 + 3];
  }

  public fillRect(
    x: number,
    y: number,
    w: number,
    h: number,
    hex: string,
    alpha = 255
  ): void {
    const x0 = Math.round(x);
    const y0 = Math.round(y);
    const rw = Math.round(w);
    const rh = Math.round(h);
    const c = parseHexRgba(hex, alpha);
    for (let dy = 0; dy < rh; dy++) {
      for (let dx = 0; dx < rw; dx++) {
        this.setRgba(x0 + dx, y0 + dy, c);
      }
    }
  }

  public fillShadedBox(
    x: number,
    y: number,
    w: number,
    h: number,
    tones: ThreeToneHex
  ): void {
    const x0 = Math.round(x);
    const y0 = Math.round(y);
    const rw = Math.max(1, Math.round(w));
    const rh = Math.max(1, Math.round(h));
    const [light, base, shadow] = tones;

    this.fillRect(x0, y0, rw, rh, base);
    // Top & left highlight
    this.fillRect(x0, y0, Math.max(1, rw - 1), 1, light);
    if (rh > 2) {
      this.fillRect(x0, y0, 1, Math.max(1, rh - 1), light);
    }
    // Bottom & right shadow
    if (rh >= 2) {
      this.fillRect(x0, y0 + rh - 1, rw, 1, shadow);
    }
    if (rw >= 2) {
      this.fillRect(x0 + rw - 1, y0 + 1, 1, Math.max(1, rh - 1), shadow);
    }
  }

  public fillCircle(
    cx: number,
    cy: number,
    r: number,
    tones: ThreeToneHex
  ): void {
    const ix = Math.round(cx);
    const iy = Math.round(cy);
    const ir = Math.max(1, Math.round(r));
    const [light, base, shadow] = tones;
    for (let dy = -ir; dy <= ir; dy++) {
      for (let dx = -ir; dx <= ir; dx++) {
        if (dx * dx + dy * dy <= ir * ir + 1) {
          const tone =
            dx + dy < -Math.max(1, Math.floor(ir * 0.4))
              ? light
              : dx + dy > Math.max(1, Math.floor(ir * 0.45))
                ? shadow
                : base;
          this.setPixel(ix + dx, iy + dy, tone);
        }
      }
    }
  }

  public drawLimbSegment(
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    radius: number,
    tones: ThreeToneHex
  ): void {
    const ix0 = Math.round(x0);
    const iy0 = Math.round(y0);
    const ix1 = Math.round(x1);
    const iy1 = Math.round(y1);
    const steps = Math.max(1, Math.max(Math.abs(ix1 - ix0), Math.abs(iy1 - iy0)));
    const r = Math.max(1, Math.round(radius));
    const [light, base, shadow] = tones;

    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const cx = Math.round(ix0 + (ix1 - ix0) * t);
      const cy = Math.round(iy0 + (iy1 - iy0) * t);
      this.fillRect(cx - r, cy - r, r * 2 + 1, r * 2 + 1, base);
      this.setPixel(cx - r, cy - r, light);
      this.setPixel(cx + r, cy + r, shadow);
    }
  }

  public drawWeaponBlade(
    pivotX: number,
    pivotY: number,
    angleRad: number,
    lengthPx: number,
    thicknessPx: number,
    bladeTones: ThreeToneHex,
    hiltHex = '#ca8a04'
  ): void {
    const cos = Math.cos(angleRad);
    const sin = Math.sin(angleRad);
    const nx = -sin;
    const ny = cos;

    // Hilt behind pivot
    for (let d = -3; d <= 1; d++) {
      this.setPixel(pivotX + cos * d, pivotY + sin * d, hiltHex);
      this.setPixel(pivotX + cos * d + nx, pivotY + sin * d + ny, hiltHex);
    }

    // Blade along angleRad
    const halfT = Math.max(0, Math.floor((thicknessPx - 1) * 0.5));
    for (let d = 2; d <= lengthPx; d++) {
      const bx = pivotX + cos * d;
      const by = pivotY + sin * d;
      for (let w = -halfT; w <= halfT; w++) {
        const tone = w < 0 ? bladeTones[0] : w > 0 ? bladeTones[2] : bladeTones[1];
        this.setPixel(bx + nx * w, by + ny * w, tone);
      }
    }
  }

  public drawSmearArc(
    cx: number,
    cy: number,
    radiusPx: number,
    startAngleRad: number,
    endAngleRad: number,
    tones: ThreeToneHex
  ): void {
    const steps = Math.max(12, Math.round(radiusPx * 1.8));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const ang = startAngleRad + (endAngleRad - startAngleRad) * t;
      const cos = Math.cos(ang);
      const sin = Math.sin(ang);
      for (let dr = -2; dr <= 1; dr++) {
        const r = radiusPx + dr;
        const tone = dr === 1 ? tones[0] : dr === 0 ? tones[1] : tones[2];
        this.setPixel(cx + cos * r, cy + sin * r, tone);
      }
    }
  }

  /**
   * Post-pass filter for a single frame cell `(cellX, cellY, cellW, cellH)`:
   * Wraps all opaque interior silhouette pixels in a 1px dark hue-shifted outline
   * without spilling across cell boundaries or touching the ground-contact row below `maxOutlineY`.
   */
  public applyCellHueShiftedOutline(
    cellX: number,
    cellY: number,
    cellW: number,
    cellH: number,
    maxOutlineY: number
  ): void {
    const toOutline: { x: number; y: number; color: Rgba }[] = [];
    const dirs = [
      [-1, 0],
      [1, 0],
      [0, -1],
      [0, 1]
    ];

    const yLimit = Math.min(cellY + cellH - 1, cellY + maxOutlineY);

    for (let y = cellY + 1; y <= yLimit; y++) {
      for (let x = cellX + 1; x < cellX + cellW - 1; x++) {
        if (this.getAlpha(x, y) !== 0) continue;

        let neighborR = 0;
        let neighborG = 0;
        let neighborB = 0;
        let foundOpaqueNeighbor = false;

        for (const [dx, dy] of dirs) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < cellX || nx >= cellX + cellW || ny < cellY || ny >= cellY + cellH) {
            continue;
          }
          const nIdx = (ny * this.width + nx) * 4;
          const na = this.data[nIdx + 3];
          // Only outline opaque character pixels (skip semi-transparent ground shadow)
          if (na === 255) {
            neighborR = this.data[nIdx];
            neighborG = this.data[nIdx + 1];
            neighborB = this.data[nIdx + 2];
            foundOpaqueNeighbor = true;
            break;
          }
        }

        if (foundOpaqueNeighbor) {
          toOutline.push({
            x,
            y,
            color: computeHueShiftedDarkOutline(neighborR, neighborG, neighborB)
          });
        }
      }
    }

    for (const item of toOutline) {
      this.setRgba(item.x, item.y, item.color);
    }
  }
}
