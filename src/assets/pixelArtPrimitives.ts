import type { UnitDefinition } from '../core/types/dataSchemas';
import blueprintsJson from '../data/assets/character_blueprints.json';

export interface CharacterBlueprint {
  bodyType:
    | 'normal'
    | 'tall'
    | 'bulky'
    | 'small'
    | 'giant'
    | 'serpent_dragon'
    | 'spider_demon'
    | 'mech';
  skin: string;
  hairStyle: string;
  hairColor: string;
  hatStyle: string;
  hatColor?: string;
  hatAccent?: string;
  eyeStyle: string;
  torsoStyle: string;
  torsoColor: string;
  sashColor: string;
  pantsColor: string;
  shoesColor: string;
  capeStyle: string;
  weaponStyle: string;
  hagoromoColor: 'white' | 'black' | null;
  auraAccent: string;
  forms?: Record<string, Partial<CharacterBlueprint>>;
}

const BLUEPRINT_MAP: Record<string, CharacterBlueprint> = (
  blueprintsJson as { blueprints: Record<string, CharacterBlueprint> }
).blueprints;

export function getAllCharacterBlueprintIds(): string[] {
  return Object.keys(BLUEPRINT_MAP);
}

export function resolveCharacterBlueprint(
  unitDef: UnitDefinition | null | undefined,
  activeFormId: string | null = null
): CharacterBlueprint {
  const uid = unitDef?.id ?? 'luffy';
  const base = BLUEPRINT_MAP[uid] ?? {
    bodyType: 'normal',
    skin: '#f5c79e',
    hairStyle: 'spiky_short',
    hairColor: unitDef?.palette.secondary ?? '#1e293b',
    hatStyle: 'none',
    eyeStyle: 'bright',
    torsoStyle: 'open_cardigan_scar',
    torsoColor: unitDef?.palette.primary ?? '#38bdf8',
    sashColor: unitDef?.palette.accent ?? '#facc15',
    pantsColor: '#1e293b',
    shoesColor: '#0f172a',
    capeStyle: 'none',
    weaponStyle: 'fist_rubber',
    hagoromoColor: null,
    auraAccent: unitDef?.palette.accent ?? '#38bdf8'
  };

  if (activeFormId && base.forms && base.forms[activeFormId]) {
    return {
      ...base,
      ...base.forms[activeFormId]
    };
  }
  return base;
}

export function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  if (clean.length === 3) {
    return [
      parseInt(clean[0] + clean[0], 16),
      parseInt(clean[1] + clean[1], 16),
      parseInt(clean[2] + clean[2], 16)
    ];
  }
  if (clean.length !== 6) return [180, 180, 180];
  return [
    parseInt(clean.slice(0, 2), 16),
    parseInt(clean.slice(2, 4), 16),
    parseInt(clean.slice(4, 6), 16)
  ];
}

export function rgbToHex(r: number, g: number, b: number): string {
  const cl = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  return (
    '#' +
    cl(r).toString(16).padStart(2, '0') +
    cl(g).toString(16).padStart(2, '0') +
    cl(b).toString(16).padStart(2, '0')
  );
}

/**
 * Hue-Shifted Pixel Art 3-step shading:
 * - Positive shift (+1 highlight): warms slightly toward sunlit yellow-white
 * - Negative shift (-1 shadow, -2 deep): cools slightly toward deep indigo/purple
 * Avoids muddy gray shading and flat #000000 outlines.
 */
export function shadeHueShift(
  hex: string,
  level: 1 | 0 | -1 | -2
): string {
  if (level === 0) return hex;
  const [r, g, b] = hexToRgb(hex);
  if (level === 1) {
    return rgbToHex(
      r + (255 - r) * 0.34 + 8,
      g + (255 - g) * 0.3 + 4,
      b + (255 - b) * 0.18
    );
  }
  if (level === -1) {
    return rgbToHex(r * 0.72, g * 0.68, Math.min(255, b * 0.78 + 14));
  }
  // Deep shadow / outline tint
  return rgbToHex(
    Math.max(14, r * 0.36),
    Math.max(12, g * 0.32),
    Math.max(24, b * 0.44 + 14)
  );
}

/**
 * Draws a crisp 3-tone Hue-Shifted shaded pixel rectangle (top-left highlight, base mid, bottom-right shadow).
 */
export function fillShadedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  baseHex: string,
  highlightTop = true
): void {
  const rx = Math.round(x);
  const ry = Math.round(y);
  const rw = Math.max(1, Math.round(w));
  const rh = Math.max(1, Math.round(h));

  ctx.fillStyle = baseHex;
  ctx.fillRect(rx, ry, rw, rh);

  if (highlightTop && rw >= 3 && rh >= 3) {
    ctx.fillStyle = shadeHueShift(baseHex, 1);
    ctx.fillRect(rx, ry, rw - 1, 1);
    ctx.fillRect(rx, ry, 1, Math.max(1, Math.floor(rh * 0.55)));
  }

  if (rw >= 3 && rh >= 3) {
    ctx.fillStyle = shadeHueShift(baseHex, -1);
    ctx.fillRect(rx + 1, ry + rh - 1, rw - 1, 1);
    ctx.fillRect(rx + rw - 1, ry + 1, 1, rh - 1);
  }
}

export function drawPixelEllipse(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  color: string
): void {
  ctx.fillStyle = color;
  const irx = Math.max(1, Math.round(rx));
  const iry = Math.max(1, Math.round(ry));
  const icx = Math.round(cx);
  const icy = Math.round(cy);

  for (let dy = -iry; dy <= iry; dy++) {
    const ny = dy / iry;
    const span = Math.floor(irx * Math.sqrt(Math.max(0, 1 - ny * ny)));
    if (span >= 0) {
      ctx.fillRect(icx - span, icy + dy, span * 2 + 1, 1);
    }
  }
}

export function drawPixelLine(
  ctx: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  color: string,
  thickness: number = 1
): void {
  ctx.fillStyle = color;
  let ix0 = Math.round(x0);
  let iy0 = Math.round(y0);
  const ix1 = Math.round(x1);
  const iy1 = Math.round(y1);
  const dx = Math.abs(ix1 - ix0);
  const dy = Math.abs(iy1 - iy0);
  const sx = ix0 < ix1 ? 1 : -1;
  const sy = iy0 < iy1 ? 1 : -1;
  let err = dx - dy;
  const t = Math.max(1, Math.round(thickness));
  const half = Math.floor(t / 2);

  while (true) {
    ctx.fillRect(ix0 - half, iy0 - half, t, t);
    if (ix0 === ix1 && iy0 === iy1) break;
    const e2 = err * 2;
    if (e2 > -dy) {
      err -= dy;
      ix0 += sx;
    }
    if (e2 < dx) {
      err += dx;
      iy0 += sy;
    }
  }
}

/**
 * Post-pass 1px Colored Dark Pixel Outline:
 * Samples each transparent pixel adjacent to opaque character pixels and paints
 * a hue-shifted dark shade of the neighboring pixel (authentic GBA/NDS cel-pixel outline).
 */
export function applyTintedPixelOutline(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number
): void {
  let imgData: ImageData;
  try {
    imgData = ctx.getImageData(0, 0, width, height);
  } catch {
    return;
  }

  const src = imgData.data;
  const out = new Uint8ClampedArray(src);
  const dirs = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1]
  ];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      if (src[idx + 3] >= 180) continue;

      let rSum = 0;
      let gSum = 0;
      let bSum = 0;
      let hits = 0;

      for (const [dx, dy] of dirs) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
        const nIdx = (ny * width + nx) * 4;
        if (src[nIdx + 3] >= 180) {
          rSum += src[nIdx];
          gSum += src[nIdx + 1];
          bSum += src[nIdx + 2];
          hits += 1;
        }
      }

      if (hits > 0) {
        out[idx] = Math.max(12, Math.round((rSum / hits) * 0.28));
        out[idx + 1] = Math.max(10, Math.round((gSum / hits) * 0.24));
        out[idx + 2] = Math.max(22, Math.round((bSum / hits) * 0.36 + 12));
        out[idx + 3] = 255;
      }
    }
  }

  imgData.data.set(out);
  ctx.putImageData(imgData, 0, 0);
}
