import {
  STANDARD_SPRITE_ANIM_STATES,
  type SpriteAnimState
} from '../data/assets/types';

export const LUFFY_FRAME_WIDTH = 48;
export const LUFFY_FRAME_HEIGHT = 48;
export const LUFFY_SHEET_COLS = 6;
export const LUFFY_SHEET_ROWS = STANDARD_SPRITE_ANIM_STATES.length; // 11
export const LUFFY_GROUND_Y = 43; // anchor.y = 0.90 -> 48 * 0.9 = 43.2 -> y=43 baseline

export type LuffyPortraitEmotion = 'neutral' | 'grin' | 'angry' | 'shock';

/**
 * Step 1: Canonical 3-Tone Pixel Palette extracted from Monkey D. Luffy reference design:
 * - Straw Hat (3 yellow tones + 3 red ribbon tones)
 * - Spiky Black/Deep-Navy Hair + 3-Tone Warm Skin + Eye/Scar details
 * - Red Open-Front Cardigan/Vest + Chest X-Scar + Yellow Waist Sash
 * - Blue Denim Shorts + Fluffy White Cuffs + Straw Sandals
 * - 1px Dark Colored Outlines (Zero anti-aliasing)
 */
export const LUFFY_PIXEL_PALETTE = {
  outlineWarm: '#241016',
  outlineCool: '#0d1526',
  outlineDark: '#120b18',

  hatLight: '#fef08a',
  hatBase: '#facc15',
  hatShadow: '#ca8a04',

  ribbonLight: '#f87171',
  ribbonBase: '#dc2626',
  ribbonShadow: '#991b1b',

  hairLight: '#334155',
  hairBase: '#1e293b',
  hairShadow: '#090d16',

  skinLight: '#ffedd5',
  skinBase: '#fdba74',
  skinShadow: '#d97706',

  eyeWhite: '#f8fafc',
  eyePupil: '#090d16',
  scarBase: '#be123c',
  scarShadow: '#881337',

  vestLight: '#f87171',
  vestBase: '#ef4444',
  vestShadow: '#b91c1c',
  vestButton: '#fde047',

  sashLight: '#fef08a',
  sashBase: '#eab308',
  sashShadow: '#a16207',

  shortsLight: '#3b82f6',
  shortsBase: '#1d4ed8',
  shortsShadow: '#1e3a8a',

  cuffLight: '#ffffff',
  cuffBase: '#e2e8f0',
  cuffShadow: '#94a3b8',

  sandalBase: '#d97706',
  sandalShadow: '#78350f',

  fxWhite: '#ffffff',
  fxGold: '#fde047',
  fxCrimson: '#ef4444',
  fxCyan: '#38bdf8',
  fxSteam: '#fbcfe8'
} as const;

interface RgbaColor {
  r: number;
  g: number;
  b: number;
  a: number;
}

function hexToRgba(hex: string, alpha = 255): RgbaColor {
  const clean = hex.replace('#', '');
  const num = parseInt(clean, 16);
  return {
    r: (num >> 16) & 255,
    g: (num >> 8) & 255,
    b: num & 255,
    a: alpha
  };
}

class PixelSurface {
  public readonly data: Uint8ClampedArray;
  constructor(
    public readonly width: number,
    public readonly height: number
  ) {
    this.data = new Uint8ClampedArray(width * height * 4);
  }

  public setPixel(x: number, y: number, hex: string, alpha = 255): void {
    const ix = Math.round(x);
    const iy = Math.round(y);
    if (ix < 0 || ix >= this.width || iy < 0 || iy >= this.height) return;
    const c = hexToRgba(hex, alpha);
    const idx = (iy * this.width + ix) * 4;
    if (alpha >= 255 || this.data[idx + 3] === 0) {
      this.data[idx] = c.r;
      this.data[idx + 1] = c.g;
      this.data[idx + 2] = c.b;
      this.data[idx + 3] = c.a;
    } else {
      const a = alpha / 255;
      const inv = 1 - a;
      this.data[idx] = Math.round(c.r * a + this.data[idx] * inv);
      this.data[idx + 1] = Math.round(c.g * a + this.data[idx + 1] * inv);
      this.data[idx + 2] = Math.round(c.b * a + this.data[idx + 2] * inv);
      this.data[idx + 3] = Math.min(255, this.data[idx + 3] + alpha);
    }
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
    for (let dy = 0; dy < rh; dy++) {
      for (let dx = 0; dx < rw; dx++) {
        this.setPixel(x0 + dx, y0 + dy, hex, alpha);
      }
    }
  }

  public strokeRect(
    x: number,
    y: number,
    w: number,
    h: number,
    hex: string
  ): void {
    const x0 = Math.round(x);
    const y0 = Math.round(y);
    const rw = Math.round(w);
    const rh = Math.round(h);
    for (let dx = 0; dx < rw; dx++) {
      this.setPixel(x0 + dx, y0, hex);
      this.setPixel(x0 + dx, y0 + rh - 1, hex);
    }
    for (let dy = 0; dy < rh; dy++) {
      this.setPixel(x0, y0 + dy, hex);
      this.setPixel(x0 + rw - 1, y0 + dy, hex);
    }
  }

  public drawSegment(
    x0: number,
    y0: number,
    x1: number,
    y1: number,
    thickness: number,
    fillHex: string,
    lightHex: string,
    outlineHex: string
  ): void {
    const ix0 = Math.round(x0);
    const iy0 = Math.round(y0);
    const ix1 = Math.round(x1);
    const iy1 = Math.round(y1);
    const steps = Math.max(1, Math.max(Math.abs(ix1 - ix0), Math.abs(iy1 - iy0)));
    const r = Math.max(1, Math.floor(thickness / 2));

    // Pass 1: 1px dark colored outline
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const cx = Math.round(ix0 + (ix1 - ix0) * t);
      const cy = Math.round(iy0 + (iy1 - iy0) * t);
      this.fillRect(cx - r - 1, cy - r - 1, r * 2 + 3, r * 2 + 3, outlineHex);
    }
    // Pass 2: inner shaded fill
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const cx = Math.round(ix0 + (ix1 - ix0) * t);
      const cy = Math.round(iy0 + (iy1 - iy0) * t);
      this.fillRect(cx - r, cy - r, r * 2 + 1, r * 2 + 1, fillHex);
      this.setPixel(cx - r, cy - r, lightHex);
    }
  }
}

export interface ArticulatedLuffyKeyPose {
  torsoX: number;
  torsoY: number;
  torsoLeanX: number;
  headOffX: number;
  headOffY: number;
  hatTilt: -1 | 0 | 1;
  expression: LuffyPortraitEmotion;
  sashSwingY: number;

  backHipX: number;
  backHipY: number;
  backKneeX: number;
  backKneeY: number;
  backFootX: number;
  backFootY: number;

  frontHipX: number;
  frontHipY: number;
  frontKneeX: number;
  frontKneeY: number;
  frontFootX: number;
  frontFootY: number;

  backShoulderX: number;
  backShoulderY: number;
  backElbowX: number;
  backElbowY: number;
  backFistX: number;
  backFistY: number;

  frontShoulderX: number;
  frontShoulderY: number;
  frontElbowX: number;
  frontElbowY: number;
  frontFistX: number;
  frontFistY: number;
  frontFistRadius: number;

  rubberStretchRings?: boolean;
  doublePalmCast?: boolean;
  clashSparks?: boolean;
  dodgeSpeedLines?: boolean;
  isDownedHorizontal?: boolean;
  steamAuraLevel?: 0 | 1 | 2;
  victorySparkles?: boolean;
   armamentFist?: boolean;
}

/**
 * Step 3: Authentic multi-frame keyposes for all 11 animation rows on a 48x48 grid.
 * Foot baseline is strictly aligned to LUFFY_GROUND_Y = 43 (anchor { x: 0.5, y: 0.9 }).
 */
export const LUFFY_11_STATE_KEYFRAMES: Record<
  SpriteAnimState,
  ArticulatedLuffyKeyPose[]
> = {
  // Row 0: IDLE (4 frames — breathing torso/hat rise & boxer fist guard bob, feet locked at y=43)
  IDLE: [
    {
      torsoX: 23,
      torsoY: 25,
      torsoLeanX: 0,
      headOffX: 0,
      headOffY: 0,
      hatTilt: 0,
      expression: 'neutral',
      sashSwingY: 0,
      backHipX: 25,
      backHipY: 32,
      backKneeX: 28,
      backKneeY: 37,
      backFootX: 29,
      backFootY: 43,
      frontHipX: 21,
      frontHipY: 32,
      frontKneeX: 19,
      frontKneeY: 37,
      frontFootX: 18,
      frontFootY: 43,
      backShoulderX: 27,
      backShoulderY: 23,
      backElbowX: 31,
      backElbowY: 27,
      backFistX: 33,
      backFistY: 24,
      frontShoulderX: 19,
      frontShoulderY: 24,
      frontElbowX: 16,
      frontElbowY: 28,
      frontFistX: 20,
      frontFistY: 26,
      frontFistRadius: 2
    },
    {
      torsoX: 23,
      torsoY: 24,
      torsoLeanX: 0,
      headOffX: 0,
      headOffY: -1,
      hatTilt: 0,
      expression: 'neutral',
      sashSwingY: -1,
      backHipX: 25,
      backHipY: 31,
      backKneeX: 28,
      backKneeY: 37,
      backFootX: 29,
      backFootY: 43,
      frontHipX: 21,
      frontHipY: 31,
      frontKneeX: 19,
      frontKneeY: 37,
      frontFootX: 18,
      frontFootY: 43,
      backShoulderX: 27,
      backShoulderY: 22,
      backElbowX: 31,
      backElbowY: 26,
      backFistX: 34,
      backFistY: 23,
      frontShoulderX: 19,
      frontShoulderY: 23,
      frontElbowX: 16,
      frontElbowY: 27,
      frontFistX: 21,
      frontFistY: 25,
      frontFistRadius: 2
    },
    {
      torsoX: 23,
      torsoY: 24,
      torsoLeanX: 1,
      headOffX: 0,
      headOffY: -1,
      hatTilt: 1,
      expression: 'grin',
      sashSwingY: 0,
      backHipX: 25,
      backHipY: 31,
      backKneeX: 28,
      backKneeY: 37,
      backFootX: 29,
      backFootY: 43,
      frontHipX: 21,
      frontHipY: 31,
      frontKneeX: 19,
      frontKneeY: 37,
      frontFootX: 18,
      frontFootY: 43,
      backShoulderX: 27,
      backShoulderY: 22,
      backElbowX: 32,
      backElbowY: 26,
      backFistX: 34,
      backFistY: 24,
      frontShoulderX: 19,
      frontShoulderY: 23,
      frontElbowX: 17,
      frontElbowY: 27,
      frontFistX: 22,
      frontFistY: 25,
      frontFistRadius: 2
    },
    {
      torsoX: 23,
      torsoY: 26,
      torsoLeanX: 0,
      headOffX: 0,
      headOffY: 0,
      hatTilt: 0,
      expression: 'neutral',
      sashSwingY: 1,
      backHipX: 25,
      backHipY: 33,
      backKneeX: 29,
      backKneeY: 38,
      backFootX: 29,
      backFootY: 43,
      frontHipX: 21,
      frontHipY: 33,
      frontKneeX: 18,
      frontKneeY: 38,
      frontFootX: 18,
      frontFootY: 43,
      backShoulderX: 27,
      backShoulderY: 24,
      backElbowX: 30,
      backElbowY: 28,
      backFistX: 32,
      backFistY: 25,
      frontShoulderX: 19,
      frontShoulderY: 25,
      frontElbowX: 16,
      frontElbowY: 29,
      frontFistX: 19,
      frontFistY: 27,
      frontFistRadius: 2
    }
  ],

  // Row 1: MOVE (6 frames — full leg-crossing run cycle & opposite arm swing)
  MOVE: [
    // Frame 0: Right/Front leg far forward stride, Left/Back leg pushing off behind
    {
      torsoX: 24,
      torsoY: 24,
      torsoLeanX: 2,
      headOffX: 2,
      headOffY: 0,
      hatTilt: -1,
      expression: 'grin',
      sashSwingY: -2,
      backHipX: 22,
      backHipY: 31,
      backKneeX: 17,
      backKneeY: 37,
      backFootX: 12,
      backFootY: 41,
      frontHipX: 25,
      frontHipY: 31,
      frontKneeX: 30,
      frontKneeY: 37,
      frontFootX: 34,
      frontFootY: 43,
      backShoulderX: 26,
      backShoulderY: 23,
      backElbowX: 31,
      backElbowY: 25,
      backFistX: 35,
      backFistY: 22,
      frontShoulderX: 20,
      frontShoulderY: 24,
      frontElbowX: 15,
      frontElbowY: 27,
      frontFistX: 12,
      frontFistY: 25,
      frontFistRadius: 2
    },
    // Frame 1: Down/Contact on front leg (x=30, y=43), back leg bends up off ground
    {
      torsoX: 24,
      torsoY: 26,
      torsoLeanX: 2,
      headOffX: 2,
      headOffY: 1,
      hatTilt: -1,
      expression: 'grin',
      sashSwingY: 1,
      backHipX: 23,
      backHipY: 33,
      backKneeX: 19,
      backKneeY: 38,
      backFootX: 15,
      backFootY: 37,
      frontHipX: 25,
      frontHipY: 33,
      frontKneeX: 29,
      frontKneeY: 38,
      frontFootX: 30,
      frontFootY: 43,
      backShoulderX: 26,
      backShoulderY: 25,
      backElbowX: 29,
      backElbowY: 27,
      backFistX: 31,
      backFistY: 25,
      frontShoulderX: 21,
      frontShoulderY: 25,
      frontElbowX: 18,
      frontElbowY: 28,
      frontFistX: 16,
      frontFistY: 27,
      frontFistRadius: 2
    },
    // Frame 2: Passing position 1 — legs cross at center, back knee drives forward
    {
      torsoX: 24,
      torsoY: 25,
      torsoLeanX: 2,
      headOffX: 2,
      headOffY: 0,
      hatTilt: 0,
      expression: 'neutral',
      sashSwingY: 0,
      backHipX: 24,
      backHipY: 32,
      backKneeX: 28,
      backKneeY: 36,
      backFootX: 25,
      backFootY: 39,
      frontHipX: 23,
      frontHipY: 32,
      frontKneeX: 24,
      frontKneeY: 38,
      frontFootX: 23,
      frontFootY: 43,
      backShoulderX: 25,
      backShoulderY: 24,
      backElbowX: 24,
      backElbowY: 28,
      backFistX: 22,
      backFistY: 27,
      frontShoulderX: 22,
      frontShoulderY: 24,
      frontElbowX: 24,
      frontElbowY: 28,
      frontFistX: 27,
      frontFistY: 26,
      frontFistRadius: 2
    },
    // Frame 3: Opposite full stride — Back leg far forward (x=34), Front leg extended behind (x=12)
    {
      torsoX: 24,
      torsoY: 24,
      torsoLeanX: 2,
      headOffX: 2,
      headOffY: 0,
      hatTilt: -1,
      expression: 'grin',
      sashSwingY: -2,
      backHipX: 25,
      backHipY: 31,
      backKneeX: 30,
      backKneeY: 37,
      backFootX: 34,
      backFootY: 43,
      frontHipX: 22,
      frontHipY: 31,
      frontKneeX: 17,
      frontKneeY: 37,
      frontFootX: 12,
      frontFootY: 41,
      backShoulderX: 25,
      backShoulderY: 23,
      backElbowX: 19,
      backElbowY: 26,
      backFistX: 14,
      backFistY: 25,
      frontShoulderX: 22,
      frontShoulderY: 24,
      frontElbowX: 29,
      frontElbowY: 26,
      frontFistX: 35,
      frontFistY: 23,
      frontFistRadius: 2
    },
    // Frame 4: Opposite Down/Contact — Back leg planted at x=30, Front leg lifts behind
    {
      torsoX: 24,
      torsoY: 26,
      torsoLeanX: 2,
      headOffX: 2,
      headOffY: 1,
      hatTilt: -1,
      expression: 'grin',
      sashSwingY: 1,
      backHipX: 25,
      backHipY: 33,
      backKneeX: 29,
      backKneeY: 38,
      backFootX: 30,
      backFootY: 43,
      frontHipX: 23,
      frontHipY: 33,
      frontKneeX: 19,
      frontKneeY: 38,
      frontFootX: 15,
      frontFootY: 37,
      backShoulderX: 25,
      backShoulderY: 25,
      backElbowX: 21,
      backElbowY: 28,
      backFistX: 18,
      backFistY: 27,
      frontShoulderX: 22,
      frontShoulderY: 25,
      frontElbowX: 27,
      frontElbowY: 27,
      frontFistX: 31,
      frontFistY: 25,
      frontFistRadius: 2
    },
    // Frame 5: Opposite Passing position 2 — Front knee drives high forward at x=28
    {
      torsoX: 24,
      torsoY: 25,
      torsoLeanX: 2,
      headOffX: 2,
      headOffY: 0,
      hatTilt: 0,
      expression: 'neutral',
      sashSwingY: 0,
      backHipX: 23,
      backHipY: 32,
      backKneeX: 24,
      backKneeY: 38,
      backFootX: 23,
      backFootY: 43,
      frontHipX: 24,
      frontHipY: 32,
      frontKneeX: 28,
      frontKneeY: 36,
      frontFootX: 26,
      frontFootY: 39,
      backShoulderX: 25,
      backShoulderY: 24,
      backElbowX: 27,
      backElbowY: 27,
      backFistX: 29,
      backFistY: 25,
      frontShoulderX: 22,
      frontShoulderY: 24,
      frontElbowX: 20,
      frontElbowY: 28,
      frontFistX: 19,
      frontFistY: 26,
      frontFistRadius: 2
    }
  ],

  // Row 2: WINDUP (3 frames — Gomu Gomu elastic arm pullback behind torso)
  WINDUP: [
    {
      torsoX: 22,
      torsoY: 25,
      torsoLeanX: -1,
      headOffX: -1,
      headOffY: 0,
      hatTilt: 1,
      expression: 'angry',
      sashSwingY: 0,
      backHipX: 25,
      backHipY: 32,
      backKneeX: 29,
      backKneeY: 37,
      backFootX: 31,
      backFootY: 43,
      frontHipX: 20,
      frontHipY: 32,
      frontKneeX: 17,
      frontKneeY: 37,
      frontFootX: 15,
      frontFootY: 43,
      backShoulderX: 25,
      backShoulderY: 23,
      backElbowX: 27,
      backElbowY: 18,
      backFistX: 25,
      backFistY: 14,
      frontShoulderX: 19,
      frontShoulderY: 24,
      frontElbowX: 14,
      frontElbowY: 25,
      frontFistX: 10,
      frontFistY: 24,
      frontFistRadius: 2
    },
    {
      torsoX: 20,
      torsoY: 26,
      torsoLeanX: -2,
      headOffX: -1,
      headOffY: 0,
      hatTilt: 1,
      expression: 'angry',
      sashSwingY: 1,
      backHipX: 24,
      backHipY: 33,
      backKneeX: 29,
      backKneeY: 38,
      backFootX: 32,
      backFootY: 43,
      frontHipX: 19,
      frontHipY: 33,
      frontKneeX: 16,
      frontKneeY: 38,
      frontFootX: 14,
      frontFootY: 43,
      backShoulderX: 24,
      backShoulderY: 24,
      backElbowX: 26,
      backElbowY: 19,
      backFistX: 24,
      backFistY: 15,
      frontShoulderX: 18,
      frontShoulderY: 24,
      frontElbowX: 11,
      frontElbowY: 24,
      frontFistX: 6,
      frontFistY: 23,
      frontFistRadius: 3,
      rubberStretchRings: true
    },
    {
      torsoX: 19,
      torsoY: 26,
      torsoLeanX: -2,
      headOffX: -2,
      headOffY: 0,
      hatTilt: 1,
      expression: 'angry',
      sashSwingY: 2,
      backHipX: 24,
      backHipY: 33,
      backKneeX: 29,
      backKneeY: 38,
      backFootX: 32,
      backFootY: 43,
      frontHipX: 18,
      frontHipY: 33,
      frontKneeX: 15,
      frontKneeY: 38,
      frontFootX: 13,
      frontFootY: 43,
      backShoulderX: 23,
      backShoulderY: 24,
      backElbowX: 25,
      backElbowY: 19,
      backFistX: 23,
      backFistY: 15,
      frontShoulderX: 17,
      frontShoulderY: 24,
      frontElbowX: 9,
      frontElbowY: 23,
      frontFistX: 3,
      frontFistY: 22,
      frontFistRadius: 3,
      rubberStretchRings: true,
      armamentFist: true
    }
  ],

  // Row 3: ATTACK_MELEE (4 frames, hitFrame=2 — Gomu Gomu no Pistol rubber stretch & recoil)
  ATTACK_MELEE: [
    // Frame 0: Torso snaps forward, punch launches past chest
    {
      torsoX: 23,
      torsoY: 25,
      torsoLeanX: 2,
      headOffX: 2,
      headOffY: 0,
      hatTilt: -1,
      expression: 'angry',
      sashSwingY: -1,
      backHipX: 21,
      backHipY: 32,
      backKneeX: 17,
      backKneeY: 38,
      backFootX: 14,
      backFootY: 43,
      frontHipX: 25,
      frontHipY: 32,
      frontKneeX: 29,
      frontKneeY: 37,
      frontFootX: 31,
      frontFootY: 43,
      backShoulderX: 21,
      backShoulderY: 24,
      backElbowX: 17,
      backElbowY: 27,
      backFistX: 15,
      backFistY: 25,
      frontShoulderX: 26,
      frontShoulderY: 23,
      frontElbowX: 30,
      frontElbowY: 23,
      frontFistX: 34,
      frontFistY: 23,
      frontFistRadius: 3
    },
    // Frame 1: Arm stretches out with rubber velocity rings
    {
      torsoX: 23,
      torsoY: 25,
      torsoLeanX: 3,
      headOffX: 3,
      headOffY: 0,
      hatTilt: -1,
      expression: 'angry',
      sashSwingY: -2,
      backHipX: 20,
      backHipY: 32,
      backKneeX: 16,
      backKneeY: 38,
      backFootX: 13,
      backFootY: 43,
      frontHipX: 25,
      frontHipY: 32,
      frontKneeX: 30,
      frontKneeY: 37,
      frontFootX: 32,
      frontFootY: 43,
      backShoulderX: 20,
      backShoulderY: 24,
      backElbowX: 16,
      backElbowY: 27,
      backFistX: 13,
      backFistY: 25,
      frontShoulderX: 26,
      frontShoulderY: 23,
      frontElbowX: 34,
      frontElbowY: 23,
      frontFistX: 40,
      frontFistY: 23,
      frontFistRadius: 3,
      rubberStretchRings: true
    },
    // Frame 2 (hitFrame = 2): Maximum rubber extension + oversized impact fist at x=44!
    {
      torsoX: 22,
      torsoY: 25,
      torsoLeanX: 3,
      headOffX: 3,
      headOffY: 0,
      hatTilt: -1,
      expression: 'angry',
      sashSwingY: -2,
      backHipX: 19,
      backHipY: 32,
      backKneeX: 15,
      backKneeY: 38,
      backFootX: 12,
      backFootY: 43,
      frontHipX: 25,
      frontHipY: 32,
      frontKneeX: 30,
      frontKneeY: 37,
      frontFootX: 32,
      frontFootY: 43,
      backShoulderX: 19,
      backShoulderY: 24,
      backElbowX: 15,
      backElbowY: 27,
      backFistX: 12,
      backFistY: 25,
      frontShoulderX: 25,
      frontShoulderY: 23,
      frontElbowX: 35,
      frontElbowY: 23,
      frontFistX: 44,
      frontFistY: 23,
      frontFistRadius: 4,
      rubberStretchRings: true,
      armamentFist: true
    },
    // Frame 3: Elastic snap-back recoil
    {
      torsoX: 23,
      torsoY: 25,
      torsoLeanX: 1,
      headOffX: 1,
      headOffY: 0,
      hatTilt: 0,
      expression: 'grin',
      sashSwingY: 0,
      backHipX: 21,
      backHipY: 32,
      backKneeX: 18,
      backKneeY: 38,
      backFootX: 16,
      backFootY: 43,
      frontHipX: 25,
      frontHipY: 32,
      frontKneeX: 29,
      frontKneeY: 37,
      frontFootX: 30,
      frontFootY: 43,
      backShoulderX: 21,
      backShoulderY: 24,
      backElbowX: 18,
      backElbowY: 27,
      backFistX: 16,
      backFistY: 26,
      frontShoulderX: 26,
      frontShoulderY: 23,
      frontElbowX: 31,
      frontElbowY: 24,
      frontFistX: 35,
      frontFistY: 24,
      frontFistRadius: 2
    }
  ],

  // Row 4: ATTACK_CAST (4 frames, hitFrame=2 — Gomu Gomu no Bazooka twin-palm shockwave)
  ATTACK_CAST: [
    {
      torsoX: 20,
      torsoY: 26,
      torsoLeanX: -2,
      headOffX: -1,
      headOffY: 0,
      hatTilt: 1,
      expression: 'angry',
      sashSwingY: 1,
      backHipX: 24,
      backHipY: 33,
      backKneeX: 29,
      backKneeY: 38,
      backFootX: 31,
      backFootY: 43,
      frontHipX: 19,
      frontHipY: 33,
      frontKneeX: 16,
      frontKneeY: 38,
      frontFootX: 14,
      frontFootY: 43,
      backShoulderX: 22,
      backShoulderY: 23,
      backElbowX: 14,
      backElbowY: 22,
      backFistX: 8,
      backFistY: 21,
      frontShoulderX: 18,
      frontShoulderY: 25,
      frontElbowX: 12,
      frontElbowY: 26,
      frontFistX: 7,
      frontFistY: 26,
      frontFistRadius: 2
    },
    {
      torsoX: 23,
      torsoY: 25,
      torsoLeanX: 2,
      headOffX: 2,
      headOffY: 0,
      hatTilt: -1,
      expression: 'angry',
      sashSwingY: -1,
      backHipX: 20,
      backHipY: 32,
      backKneeX: 16,
      backKneeY: 38,
      backFootX: 14,
      backFootY: 43,
      frontHipX: 25,
      frontHipY: 32,
      frontKneeX: 29,
      frontKneeY: 37,
      frontFootX: 31,
      frontFootY: 43,
      backShoulderX: 26,
      backShoulderY: 22,
      backElbowX: 31,
      backElbowY: 21,
      backFistX: 36,
      backFistY: 21,
      frontShoulderX: 25,
      frontShoulderY: 25,
      frontElbowX: 31,
      frontElbowY: 26,
      frontFistX: 36,
      frontFistY: 26,
      frontFistRadius: 3,
      doublePalmCast: true
    },
    {
      torsoX: 23,
      torsoY: 25,
      torsoLeanX: 3,
      headOffX: 3,
      headOffY: 0,
      hatTilt: -1,
      expression: 'angry',
      sashSwingY: -2,
      backHipX: 19,
      backHipY: 32,
      backKneeX: 15,
      backKneeY: 38,
      backFootX: 13,
      backFootY: 43,
      frontHipX: 25,
      frontHipY: 32,
      frontKneeX: 30,
      frontKneeY: 37,
      frontFootX: 32,
      frontFootY: 43,
      backShoulderX: 26,
      backShoulderY: 22,
      backElbowX: 34,
      backElbowY: 21,
      backFistX: 42,
      backFistY: 21,
      frontShoulderX: 25,
      frontShoulderY: 25,
      frontElbowX: 34,
      frontElbowY: 26,
      frontFistX: 42,
      frontFistY: 26,
      frontFistRadius: 3,
      rubberStretchRings: true,
      doublePalmCast: true
    },
    {
      torsoX: 23,
      torsoY: 25,
      torsoLeanX: 1,
      headOffX: 1,
      headOffY: 0,
      hatTilt: 0,
      expression: 'neutral',
      sashSwingY: 0,
      backHipX: 21,
      backHipY: 32,
      backKneeX: 18,
      backKneeY: 38,
      backFootX: 16,
      backFootY: 43,
      frontHipX: 25,
      frontHipY: 32,
      frontKneeX: 29,
      frontKneeY: 37,
      frontFootX: 30,
      frontFootY: 43,
      backShoulderX: 26,
      backShoulderY: 23,
      backElbowX: 30,
      backElbowY: 23,
      backFistX: 33,
      backFistY: 22,
      frontShoulderX: 24,
      frontShoulderY: 25,
      frontElbowX: 29,
      frontElbowY: 26,
      frontFistX: 33,
      frontFistY: 26,
      frontFistRadius: 2
    }
  ],

  // Row 5: CLASH (2 frames — braced Haki struggle loop)
  CLASH: [
    {
      torsoX: 23,
      torsoY: 26,
      torsoLeanX: 2,
      headOffX: 2,
      headOffY: 1,
      hatTilt: -1,
      expression: 'angry',
      sashSwingY: -1,
      backHipX: 20,
      backHipY: 33,
      backKneeX: 16,
      backKneeY: 38,
      backFootX: 13,
      backFootY: 43,
      frontHipX: 25,
      frontHipY: 33,
      frontKneeX: 30,
      frontKneeY: 38,
      frontFootX: 32,
      frontFootY: 43,
      backShoulderX: 26,
      backShoulderY: 24,
      backElbowX: 31,
      backElbowY: 23,
      backFistX: 37,
      backFistY: 22,
      frontShoulderX: 25,
      frontShoulderY: 25,
      frontElbowX: 31,
      frontElbowY: 26,
      frontFistX: 38,
      frontFistY: 25,
      frontFistRadius: 3,
      clashSparks: true,
      armamentFist: true
    },
    {
      torsoX: 22,
      torsoY: 26,
      torsoLeanX: 2,
      headOffX: 1,
      headOffY: 1,
      hatTilt: -1,
      expression: 'angry',
      sashSwingY: 1,
      backHipX: 19,
      backHipY: 33,
      backKneeX: 15,
      backKneeY: 38,
      backFootX: 13,
      backFootY: 43,
      frontHipX: 24,
      frontHipY: 33,
      frontKneeX: 29,
      frontKneeY: 38,
      frontFootX: 32,
      frontFootY: 43,
      backShoulderX: 25,
      backShoulderY: 24,
      backElbowX: 30,
      backElbowY: 23,
      backFistX: 36,
      backFistY: 22,
      frontShoulderX: 24,
      frontShoulderY: 25,
      frontElbowX: 30,
      frontElbowY: 26,
      frontFistX: 37,
      frontFistY: 25,
      frontFistRadius: 3,
      clashSparks: true,
      armamentFist: true
    }
  ],

  // Row 6: DODGE (3 frames — low crouch push-off -> horizontal dash leap -> agile landing)
  DODGE: [
    {
      torsoX: 22,
      torsoY: 28,
      torsoLeanX: 3,
      headOffX: 3,
      headOffY: 2,
      hatTilt: -1,
      expression: 'neutral',
      sashSwingY: -2,
      backHipX: 19,
      backHipY: 35,
      backKneeX: 15,
      backKneeY: 39,
      backFootX: 12,
      backFootY: 43,
      frontHipX: 24,
      frontHipY: 35,
      frontKneeX: 29,
      frontKneeY: 39,
      frontFootX: 30,
      frontFootY: 43,
      backShoulderX: 25,
      backShoulderY: 26,
      backElbowX: 27,
      backElbowY: 20,
      backFistX: 25,
      backFistY: 16,
      frontShoulderX: 20,
      frontShoulderY: 27,
      frontElbowX: 15,
      frontElbowY: 30,
      frontFistX: 11,
      frontFistY: 29,
      frontFistRadius: 2,
      dodgeSpeedLines: true
    },
    {
      torsoX: 26,
      torsoY: 25,
      torsoLeanX: 4,
      headOffX: 4,
      headOffY: 1,
      hatTilt: -1,
      expression: 'grin',
      sashSwingY: -3,
      backHipX: 22,
      backHipY: 32,
      backKneeX: 17,
      backKneeY: 35,
      backFootX: 13,
      backFootY: 37,
      frontHipX: 26,
      frontHipY: 32,
      frontKneeX: 32,
      frontKneeY: 35,
      frontFootX: 35,
      frontFootY: 39,
      backShoulderX: 28,
      backShoulderY: 23,
      backElbowX: 30,
      backElbowY: 18,
      backFistX: 28,
      backFistY: 15,
      frontShoulderX: 23,
      frontShoulderY: 25,
      frontElbowX: 18,
      frontElbowY: 28,
      frontFistX: 14,
      frontFistY: 27,
      frontFistRadius: 2,
      dodgeSpeedLines: true
    },
    {
      torsoX: 25,
      torsoY: 27,
      torsoLeanX: 2,
      headOffX: 2,
      headOffY: 1,
      hatTilt: 0,
      expression: 'grin',
      sashSwingY: -1,
      backHipX: 22,
      backHipY: 34,
      backKneeX: 18,
      backKneeY: 39,
      backFootX: 16,
      backFootY: 43,
      frontHipX: 26,
      frontHipY: 34,
      frontKneeX: 31,
      frontKneeY: 39,
      frontFootX: 34,
      frontFootY: 43,
      backShoulderX: 27,
      backShoulderY: 25,
      backElbowX: 32,
      backElbowY: 27,
      backFistX: 35,
      backFistY: 26,
      frontShoulderX: 22,
      frontShoulderY: 26,
      frontElbowX: 18,
      frontElbowY: 29,
      frontFistX: 15,
      frontFistY: 28,
      frontFistRadius: 2,
      dodgeSpeedLines: true
    }
  ],

  // Row 7: HIT (2 frames — upper body recoiling backward from impact)
  HIT: [
    {
      torsoX: 21,
      torsoY: 25,
      torsoLeanX: -2,
      headOffX: -3,
      headOffY: -1,
      hatTilt: 1,
      expression: 'shock',
      sashSwingY: 2,
      backHipX: 24,
      backHipY: 32,
      backKneeX: 28,
      backKneeY: 38,
      backFootX: 31,
      backFootY: 43,
      frontHipX: 20,
      frontHipY: 32,
      frontKneeX: 17,
      frontKneeY: 38,
      frontFootX: 15,
      frontFootY: 43,
      backShoulderX: 24,
      backShoulderY: 23,
      backElbowX: 29,
      backElbowY: 21,
      backFistX: 33,
      backFistY: 19,
      frontShoulderX: 18,
      frontShoulderY: 24,
      frontElbowX: 14,
      frontElbowY: 21,
      frontFistX: 11,
      frontFistY: 18,
      frontFistRadius: 2
    },
    {
      torsoX: 19,
      torsoY: 26,
      torsoLeanX: -3,
      headOffX: -3,
      headOffY: 0,
      hatTilt: 1,
      expression: 'shock',
      sashSwingY: 2,
      backHipX: 23,
      backHipY: 33,
      backKneeX: 28,
      backKneeY: 38,
      backFootX: 31,
      backFootY: 43,
      frontHipX: 19,
      frontHipY: 33,
      frontKneeX: 16,
      frontKneeY: 38,
      frontFootX: 13,
      frontFootY: 43,
      backShoulderX: 23,
      backShoulderY: 24,
      backElbowX: 28,
      backElbowY: 23,
      backFistX: 31,
      backFistY: 21,
      frontShoulderX: 17,
      frontShoulderY: 25,
      frontElbowX: 13,
      frontElbowY: 23,
      frontFistX: 10,
      frontFistY: 21,
      frontFistRadius: 2
    }
  ],

  // Row 8: DOWNED (2 frames — knocked flat on ground at y=36..43, subtle chest breath)
  DOWNED: [
    {
      torsoX: 24,
      torsoY: 39,
      torsoLeanX: 0,
      headOffX: -10,
      headOffY: 0,
      hatTilt: 0,
      expression: 'shock',
      sashSwingY: 0,
      backHipX: 29,
      backHipY: 40,
      backKneeX: 34,
      backKneeY: 40,
      backFootX: 39,
      backFootY: 42,
      frontHipX: 29,
      frontHipY: 41,
      frontKneeX: 35,
      frontKneeY: 42,
      frontFootX: 41,
      frontFootY: 43,
      backShoulderX: 20,
      backShoulderY: 39,
      backElbowX: 23,
      backElbowY: 37,
      backFistX: 26,
      backFistY: 38,
      frontShoulderX: 19,
      frontShoulderY: 41,
      frontElbowX: 15,
      frontElbowY: 42,
      frontFistX: 12,
      frontFistY: 43,
      frontFistRadius: 2,
      isDownedHorizontal: true
    },
    {
      torsoX: 24,
      torsoY: 38,
      torsoLeanX: 0,
      headOffX: -10,
      headOffY: 0,
      hatTilt: 0,
      expression: 'shock',
      sashSwingY: 0,
      backHipX: 29,
      backHipY: 40,
      backKneeX: 34,
      backKneeY: 40,
      backFootX: 39,
      backFootY: 42,
      frontHipX: 29,
      frontHipY: 41,
      frontKneeX: 35,
      frontKneeY: 42,
      frontFootX: 41,
      frontFootY: 43,
      backShoulderX: 20,
      backShoulderY: 38,
      backElbowX: 23,
      backElbowY: 36,
      backFistX: 26,
      backFistY: 37,
      frontShoulderX: 19,
      frontShoulderY: 41,
      frontElbowX: 15,
      frontElbowY: 42,
      frontFistX: 12,
      frontFistY: 43,
      frontFistRadius: 2,
      isDownedHorizontal: true
    }
  ],

  // Row 9: TRANSFORM (4 frames, hitFrame=2 — Gear 2 crouch pump -> rising steam burst)
  TRANSFORM: [
    {
      torsoX: 23,
      torsoY: 28,
      torsoLeanX: 2,
      headOffX: 1,
      headOffY: 2,
      hatTilt: -1,
      expression: 'angry',
      sashSwingY: 0,
      backHipX: 26,
      backHipY: 35,
      backKneeX: 31,
      backKneeY: 39,
      backFootX: 33,
      backFootY: 43,
      frontHipX: 20,
      frontHipY: 35,
      frontKneeX: 16,
      frontKneeY: 39,
      frontFootX: 14,
      frontFootY: 43,
      backShoulderX: 26,
      backShoulderY: 27,
      backElbowX: 29,
      backElbowY: 33,
      backFistX: 28,
      backFistY: 39,
      frontShoulderX: 19,
      frontShoulderY: 27,
      frontElbowX: 16,
      frontElbowY: 31,
      frontFistX: 18,
      frontFistY: 34,
      frontFistRadius: 2,
      steamAuraLevel: 1
    },
    {
      torsoX: 23,
      torsoY: 27,
      torsoLeanX: 1,
      headOffX: 1,
      headOffY: 1,
      hatTilt: 0,
      expression: 'angry',
      sashSwingY: -1,
      backHipX: 26,
      backHipY: 34,
      backKneeX: 30,
      backKneeY: 38,
      backFootX: 32,
      backFootY: 43,
      frontHipX: 20,
      frontHipY: 34,
      frontKneeX: 16,
      frontKneeY: 38,
      frontFootX: 14,
      frontFootY: 43,
      backShoulderX: 27,
      backShoulderY: 25,
      backElbowX: 32,
      backElbowY: 27,
      backFistX: 34,
      backFistY: 24,
      frontShoulderX: 19,
      frontShoulderY: 25,
      frontElbowX: 14,
      frontElbowY: 27,
      frontFistX: 12,
      frontFistY: 24,
      frontFistRadius: 2,
      steamAuraLevel: 1
    },
    {
      torsoX: 23,
      torsoY: 24,
      torsoLeanX: 0,
      headOffX: 0,
      headOffY: -1,
      hatTilt: 1,
      expression: 'angry',
      sashSwingY: -2,
      backHipX: 26,
      backHipY: 31,
      backKneeX: 30,
      backKneeY: 37,
      backFootX: 32,
      backFootY: 43,
      frontHipX: 20,
      frontHipY: 31,
      frontKneeX: 16,
      frontKneeY: 37,
      frontFootX: 14,
      frontFootY: 43,
      backShoulderX: 28,
      backShoulderY: 22,
      backElbowX: 34,
      backElbowY: 21,
      backFistX: 38,
      backFistY: 17,
      frontShoulderX: 18,
      frontShoulderY: 22,
      frontElbowX: 12,
      frontElbowY: 21,
      frontFistX: 8,
      frontFistY: 17,
      frontFistRadius: 3,
      steamAuraLevel: 2
    },
    {
      torsoX: 23,
      torsoY: 25,
      torsoLeanX: 0,
      headOffX: 0,
      headOffY: 0,
      hatTilt: 0,
      expression: 'grin',
      sashSwingY: 0,
      backHipX: 25,
      backHipY: 32,
      backKneeX: 29,
      backKneeY: 37,
      backFootX: 30,
      backFootY: 43,
      frontHipX: 21,
      frontHipY: 32,
      frontKneeX: 18,
      frontKneeY: 37,
      frontFootX: 17,
      frontFootY: 43,
      backShoulderX: 27,
      backShoulderY: 23,
      backElbowX: 31,
      backElbowY: 26,
      backFistX: 34,
      backFistY: 23,
      frontShoulderX: 19,
      frontShoulderY: 24,
      frontElbowX: 15,
      frontElbowY: 27,
      frontFistX: 19,
      frontFistY: 25,
      frontFistRadius: 2,
      steamAuraLevel: 1
    }
  ],

  // Row 10: VICTORY (4 frames — straw hat touch & cheerful two-arm celebration)
  VICTORY: [
    {
      torsoX: 23,
      torsoY: 25,
      torsoLeanX: 0,
      headOffX: 0,
      headOffY: 0,
      hatTilt: 0,
      expression: 'grin',
      sashSwingY: 0,
      backHipX: 25,
      backHipY: 32,
      backKneeX: 28,
      backKneeY: 37,
      backFootX: 29,
      backFootY: 43,
      frontHipX: 21,
      frontHipY: 32,
      frontKneeX: 19,
      frontKneeY: 37,
      frontFootX: 18,
      frontFootY: 43,
      backShoulderX: 27,
      backShoulderY: 23,
      backElbowX: 31,
      backElbowY: 19,
      backFistX: 28,
      backFistY: 14,
      frontShoulderX: 19,
      frontShoulderY: 24,
      frontElbowX: 15,
      frontElbowY: 27,
      frontFistX: 16,
      frontFistY: 31,
      frontFistRadius: 2,
      victorySparkles: true
    },
    {
      torsoX: 23,
      torsoY: 24,
      torsoLeanX: 0,
      headOffX: 0,
      headOffY: -1,
      hatTilt: 1,
      expression: 'grin',
      sashSwingY: -1,
      backHipX: 25,
      backHipY: 31,
      backKneeX: 28,
      backKneeY: 37,
      backFootX: 29,
      backFootY: 43,
      frontHipX: 21,
      frontHipY: 31,
      frontKneeX: 19,
      frontKneeY: 37,
      frontFootX: 18,
      frontFootY: 43,
      backShoulderX: 27,
      backShoulderY: 22,
      backElbowX: 32,
      backElbowY: 16,
      backFistX: 34,
      backFistY: 11,
      frontShoulderX: 19,
      frontShoulderY: 23,
      frontElbowX: 16,
      frontElbowY: 19,
      frontFistX: 18,
      frontFistY: 14,
      frontFistRadius: 2,
      victorySparkles: true
    },
    {
      torsoX: 23,
      torsoY: 23,
      torsoLeanX: 0,
      headOffX: 0,
      headOffY: -2,
      hatTilt: 1,
      expression: 'grin',
      sashSwingY: -2,
      backHipX: 25,
      backHipY: 30,
      backKneeX: 29,
      backKneeY: 36,
      backFootX: 30,
      backFootY: 42,
      frontHipX: 21,
      frontHipY: 30,
      frontKneeX: 18,
      frontKneeY: 36,
      frontFootX: 17,
      frontFootY: 42,
      backShoulderX: 27,
      backShoulderY: 21,
      backElbowX: 33,
      backElbowY: 15,
      backFistX: 36,
      backFistY: 10,
      frontShoulderX: 19,
      frontShoulderY: 21,
      frontElbowX: 13,
      frontElbowY: 15,
      frontFistX: 10,
      frontFistY: 10,
      frontFistRadius: 2,
      victorySparkles: true
    },
    {
      torsoX: 23,
      torsoY: 25,
      torsoLeanX: 0,
      headOffX: 0,
      headOffY: 0,
      hatTilt: 0,
      expression: 'grin',
      sashSwingY: 0,
      backHipX: 25,
      backHipY: 32,
      backKneeX: 28,
      backKneeY: 37,
      backFootX: 29,
      backFootY: 43,
      frontHipX: 21,
      frontHipY: 32,
      frontKneeX: 19,
      frontKneeY: 37,
      frontFootX: 18,
      frontFootY: 43,
      backShoulderX: 27,
      backShoulderY: 23,
      backElbowX: 31,
      backElbowY: 25,
      backFistX: 32,
      backFistY: 29,
      frontShoulderX: 19,
      frontShoulderY: 23,
      frontElbowX: 15,
      frontElbowY: 18,
      frontFistX: 19,
      frontFistY: 13,
      frontFistRadius: 2,
      victorySparkles: true
    }
  ]
};

function drawLuffyLeg(
  surf: PixelSurface,
  ox: number,
  oy: number,
  hipX: number,
  hipY: number,
  kneeX: number,
  kneeY: number,
  footX: number,
  footY: number
): void {
  const P = LUFFY_PIXEL_PALETTE;
  // 1. Lower leg (bare skin from knee to ankle)
  surf.drawSegment(
    ox + kneeX,
    oy + kneeY,
    ox + footX,
    oy + footY - 2,
    2,
    P.skinBase,
    P.skinLight,
    P.outlineWarm
  );

  // 2. Upper leg (Blue denim shorts from hip to knee)
  surf.drawSegment(
    ox + hipX,
    oy + hipY,
    ox + kneeX,
    oy + kneeY,
    4,
    P.shortsBase,
    P.shortsLight,
    P.outlineCool
  );
  // Shorts inner shadow pixel
  surf.setPixel(ox + Math.round((hipX + kneeX) * 0.5), oy + Math.round((hipY + kneeY) * 0.5) + 1, P.shortsShadow);

  // 3. White fluffy shorts cuff around the knee
  const kx = ox + Math.round(kneeX);
  const ky = oy + Math.round(kneeY);
  surf.fillRect(kx - 3, ky - 2, 7, 4, P.outlineCool);
  surf.fillRect(kx - 2, ky - 1, 5, 2, P.cuffBase);
  surf.setPixel(kx - 2, ky - 1, P.cuffLight);
  surf.setPixel(kx, ky - 1, P.cuffLight);
  surf.setPixel(kx + 2, ky, P.cuffShadow);

  // 4. Straw sandal at foot (strictly anchored to footY)
  const fx = ox + Math.round(footX);
  const fy = oy + Math.round(footY);
  surf.fillRect(fx - 3, fy - 2, 7, 3, P.outlineWarm);
  surf.fillRect(fx - 2, fy - 1, 5, 1, P.skinBase);
  surf.fillRect(fx - 2, fy, 5, 1, P.sandalBase);
  surf.setPixel(fx, fy - 1, P.sandalShadow); // sandal strap
}

function drawLuffyArm(
  surf: PixelSurface,
  ox: number,
  oy: number,
  shoulderX: number,
  shoulderY: number,
  elbowX: number,
  elbowY: number,
  fistX: number,
  fistY: number,
  fistRadius: number,
  armament = false
): void {
  const P = LUFFY_PIXEL_PALETTE;
  // 1. Forearm (elbow to fist)
  surf.drawSegment(
    ox + elbowX,
    oy + elbowY,
    ox + fistX,
    oy + fistY,
    2,
    armament ? '#1e1b4b' : P.skinBase,
    armament ? '#ef4444' : P.skinLight,
    P.outlineWarm
  );
  // 2. Upper arm + red cardigan short sleeve near shoulder
  surf.drawSegment(
    ox + shoulderX,
    oy + shoulderY,
    ox + elbowX,
    oy + elbowY,
    2,
    P.skinBase,
    P.skinLight,
    P.outlineWarm
  );
  const sx = ox + Math.round(shoulderX);
  const sy = oy + Math.round(shoulderY);
  surf.fillRect(sx - 2, sy - 2, 5, 5, P.outlineWarm);
  surf.fillRect(sx - 1, sy - 1, 3, 3, P.vestBase);
  surf.setPixel(sx - 1, sy - 1, P.vestLight);

  // 3. Clenched Fist (with optional Gomu-Gomu expansion or Armament Haki coating)
  const fx = ox + Math.round(fistX);
  const fy = oy + Math.round(fistY);
  const r = Math.max(2, Math.round(fistRadius));
  surf.fillRect(fx - r - 1, fy - r - 1, r * 2 + 2, r * 2 + 2, P.outlineWarm);
  surf.fillRect(
    fx - r,
    fy - r,
    r * 2,
    r * 2,
    armament ? '#111827' : P.skinBase
  );
  surf.fillRect(
    fx - r,
    fy - r,
    Math.max(1, r),
    Math.max(1, r),
    armament ? '#ef4444' : P.skinLight
  );
  surf.setPixel(fx + r - 1, fy + r - 1, armament ? '#7f1d1d' : P.skinShadow);
}

function drawLuffyTorsoAndSash(
  surf: PixelSurface,
  ox: number,
  oy: number,
  pose: ArticulatedLuffyKeyPose
): void {
  const P = LUFFY_PIXEL_PALETTE;
  const tx = ox + Math.round(pose.torsoX + pose.torsoLeanX * 0.5);
  const ty = oy + Math.round(pose.torsoY);

  // 1. Fluttering Yellow Waist Sash Tails behind hip
  const tailX = tx - 7;
  const tailY = ty + 4 + pose.sashSwingY;
  surf.fillRect(tailX - 1, tailY - 1, 5, 5, P.outlineWarm);
  surf.fillRect(tailX, tailY, 3, 3, P.sashBase);
  surf.setPixel(tailX, tailY, P.sashLight);
  surf.setPixel(tailX + 1, tailY + 2, P.sashShadow);

  // 2. Torso Silhouette (Open Red Cardigan/Vest + Bare Chest with X-Scar)
  const w = 10;
  const h = 9;
  const left = tx - 5;
  const top = ty - 3;
  surf.fillRect(left - 1, top - 1, w + 2, h + 2, P.outlineWarm);

  // Red Cardigan Left & Right panels
  surf.fillRect(left, top, 3, h - 2, P.vestBase);
  surf.fillRect(left, top, 1, h - 3, P.vestLight);
  surf.fillRect(left + 2, top + 1, 1, h - 3, P.vestShadow);

  surf.fillRect(left + 7, top, 3, h - 2, P.vestBase);
  surf.fillRect(left + 7, top, 1, h - 3, P.vestLight);
  surf.fillRect(left + 9, top + 1, 1, h - 3, P.vestShadow);
  surf.setPixel(left + 2, top + 3, P.vestButton);

  // Open bare chest center + X-shaped scar
  surf.fillRect(left + 3, top, 4, h - 2, P.skinBase);
  surf.fillRect(left + 3, top, 2, 2, P.skinLight);
  surf.fillRect(left + 3, top + 5, 4, 2, P.skinShadow);
  // Iconic Chest X-Scar
  surf.setPixel(left + 3, top + 1, P.scarBase);
  surf.setPixel(left + 6, top + 1, P.scarBase);
  surf.setPixel(left + 4, top + 2, P.scarShadow);
  surf.setPixel(left + 5, top + 2, P.scarShadow);
  surf.setPixel(left + 3, top + 3, P.scarBase);
  surf.setPixel(left + 6, top + 3, P.scarBase);

  // 3. Yellow Waist Sash Belt across lower torso
  surf.fillRect(left, top + h - 2, w, 2, P.sashBase);
  surf.fillRect(left + 1, top + h - 2, w - 3, 1, P.sashLight);
  surf.fillRect(left + 2, top + h - 1, w - 2, 1, P.sashShadow);
}

function drawLuffyHeadAndStrawHat(
  surf: PixelSurface,
  ox: number,
  oy: number,
  pose: ArticulatedLuffyKeyPose
): void {
  const P = LUFFY_PIXEL_PALETTE;
  const hx = ox + Math.round(pose.torsoX + pose.headOffX);
  const hy = oy + Math.round(pose.torsoY - 10 + pose.headOffY);

  // 1. Distinct Neck separating head from shoulders
  surf.fillRect(hx - 2, hy + 5, 5, 3, P.outlineWarm);
  surf.fillRect(hx - 1, hy + 5, 3, 2, P.skinShadow);
  surf.setPixel(hx, hy + 6, P.skinBase);

  // 2. Short Spiky Black/Deep-Navy Hair at back of head & temples (no shoulder-length block)
  surf.fillRect(hx - 6, hy - 2, 12, 5, P.outlineCool);
  surf.fillRect(hx - 5, hy - 1, 10, 4, P.hairBase);
  // Short jagged nape & temple spikes
  surf.fillRect(hx - 7, hy, 2, 2, P.outlineCool);
  surf.setPixel(hx - 6, hy, P.hairShadow);
  surf.fillRect(hx - 6, hy + 2, 2, 2, P.outlineCool);
  surf.setPixel(hx - 5, hy + 2, P.hairShadow);
  surf.fillRect(hx + 5, hy, 2, 2, P.outlineCool);
  surf.setPixel(hx + 5, hy, P.hairShadow);

  // 3. Face with tapered jawline (3-tone warm skin + eyes + under-eye scar + mouth)
  surf.fillRect(hx - 4, hy - 2, 10, 6, P.outlineWarm);
  surf.fillRect(hx - 3, hy + 4, 8, 2, P.outlineWarm); // tapered chin outline
  surf.fillRect(hx - 3, hy - 1, 8, 5, P.skinBase);
  surf.fillRect(hx - 2, hy + 4, 6, 1, P.skinShadow); // chin shading
  surf.fillRect(hx - 2, hy - 1, 6, 2, P.skinLight);

  // Left ear peeking on left side of face
  surf.fillRect(hx - 5, hy, 2, 3, P.outlineWarm);
  surf.setPixel(hx - 4, hy + 1, P.skinShadow);

  // Eyes (facing right: left & right eye pixels)
  if (pose.expression === 'shock') {
    surf.fillRect(hx - 1, hy, 2, 2, P.eyeWhite);
    surf.setPixel(hx, hy + 1, P.eyePupil);
    surf.fillRect(hx + 3, hy, 2, 2, P.eyeWhite);
    surf.setPixel(hx + 4, hy + 1, P.eyePupil);
  } else {
    surf.setPixel(hx - 1, hy, P.eyeWhite);
    surf.setPixel(hx, hy, P.eyePupil);
    surf.setPixel(hx + 3, hy, P.eyeWhite);
    surf.setPixel(hx + 4, hy, P.eyePupil);
    if (pose.expression === 'angry') {
      surf.setPixel(hx - 1, hy - 1, P.hairShadow);
      surf.setPixel(hx + 3, hy - 1, P.hairShadow);
    }
  }

  // Signature 2-stitch scar under left eye
  surf.setPixel(hx - 1, hy + 2, P.scarBase);
  surf.setPixel(hx, hy + 2, P.scarShadow);

  // Mouth / Grin
  if (pose.expression === 'grin') {
    surf.fillRect(hx, hy + 3, 4, 1, P.eyeWhite);
  } else if (pose.expression === 'angry' || pose.expression === 'shock') {
    surf.fillRect(hx + 1, hy + 3, 3, 1, P.scarShadow);
  } else {
    surf.fillRect(hx + 1, hy + 3, 2, 1, P.outlineWarm);
  }

  // Front black spiky hair bangs peeking under hat brim
  surf.setPixel(hx - 3, hy - 1, P.hairShadow);
  surf.setPixel(hx - 2, hy, P.hairShadow);
  surf.setPixel(hx + 1, hy - 1, P.hairBase);
  surf.setPixel(hx + 4, hy - 1, P.hairShadow);

  // 4. Rounded Straw Hat Dome (3-tone yellow + red ribbon band + curved wide brim)
  const hatX = hx + pose.hatTilt;
  const hatY = hy - 7;

  // Rounded Crown Dome (tapered top row -> middle row -> ribbon base)
  surf.fillRect(hatX - 4, hatY - 1, 9, 2, P.outlineWarm);
  surf.fillRect(hatX - 5, hatY, 11, 3, P.outlineWarm);
  surf.fillRect(hatX - 6, hatY + 2, 13, 3, P.outlineWarm);

  surf.fillRect(hatX - 3, hatY, 7, 1, P.hatLight);
  surf.fillRect(hatX - 4, hatY + 1, 9, 1, P.hatBase);
  surf.fillRect(hatX - 3, hatY + 1, 5, 1, P.hatLight);
  surf.fillRect(hatX - 5, hatY + 2, 11, 1, P.hatShadow);

  // Red Ribbon Band (2px tall across crown base)
  surf.fillRect(hatX - 5, hatY + 3, 11, 2, P.ribbonBase);
  surf.fillRect(hatX - 4, hatY + 3, 5, 1, P.ribbonLight);
  surf.fillRect(hatX + 2, hatY + 4, 4, 1, P.ribbonShadow);

  // Wide Curved Straw Hat Brim
  surf.fillRect(hatX - 9, hatY + 4, 19, 3, P.outlineWarm);
  surf.fillRect(hatX - 8, hatY + 5, 17, 1, P.hatLight);
  surf.fillRect(hatX - 7, hatY + 6, 15, 1, P.hatShadow);
}

function drawDownedLuffyFrame(
  surf: PixelSurface,
  ox: number,
  oy: number,
  pose: ArticulatedLuffyKeyPose
): void {
  const P = LUFFY_PIXEL_PALETTE;
  const by = oy + pose.torsoY;
  // Wide ground shadow
  surf.fillRect(ox + 7, oy + 42, 34, 3, '#090d16', 110);

  // Straw hat resting on the ground near head
  surf.fillRect(ox + 6, by - 5, 12, 5, P.outlineWarm);
  surf.fillRect(ox + 7, by - 4, 10, 2, P.hatBase);
  surf.fillRect(ox + 8, by - 4, 5, 1, P.hatLight);
  surf.fillRect(ox + 7, by - 2, 10, 1, P.ribbonBase);
  surf.fillRect(ox + 5, by - 1, 14, 1, P.hatShadow);

  // Head on left
  surf.fillRect(ox + 12, by - 3, 8, 6, P.outlineWarm);
  surf.fillRect(ox + 13, by - 2, 6, 4, P.skinBase);
  surf.fillRect(ox + 12, by - 2, 3, 4, P.hairBase);
  surf.setPixel(ox + 16, by - 1, P.outlineWarm);

  // Horizontal Torso (Red vest + chest scar + yellow sash)
  surf.fillRect(ox + 19, by - 3, 11, 6, P.outlineWarm);
  surf.fillRect(ox + 20, by - 2, 8, 4, P.vestBase);
  surf.fillRect(ox + 22, by - 2, 4, 2, P.skinBase);
  surf.setPixel(ox + 23, by - 1, P.scarBase);
  surf.fillRect(ox + 28, by - 2, 2, 4, P.sashBase);

  // Horizontal Blue Shorts + White Cuffs + Legs + Sandals
  surf.fillRect(ox + 30, by - 2, 7, 5, P.outlineCool);
  surf.fillRect(ox + 31, by - 1, 5, 3, P.shortsBase);
  surf.fillRect(ox + 36, by - 1, 2, 3, P.cuffLight);
  surf.fillRect(ox + 38, by, 4, 2, P.skinBase);
  surf.fillRect(ox + 41, by - 1, 2, 4, P.sandalBase);
}

/**
 * Renders a single 48x48 articulated Luffy frame into `surf` at cell top-left `(ox, oy)`.
 */
export function renderArticulatedLuffyCell(
  surf: PixelSurface,
  ox: number,
  oy: number,
  pose: ArticulatedLuffyKeyPose
): void {
  const P = LUFFY_PIXEL_PALETTE;

  if (pose.isDownedHorizontal) {
    drawDownedLuffyFrame(surf, ox, oy, pose);
    return;
  }

  // 0. Ground contact shadow anchored at LUFFY_GROUND_Y = 43
  const minFootX = Math.min(pose.backFootX, pose.frontFootX) - 4;
  const maxFootX = Math.max(pose.backFootX, pose.frontFootX) + 4;
  const shadowW = Math.max(14, maxFootX - minFootX);
  surf.fillRect(ox + minFootX, oy + LUFFY_GROUND_Y - 1, shadowW, 3, '#090d16', 110);

  // Optional Dodge speed lines behind character
  if (pose.dodgeSpeedLines) {
    surf.fillRect(ox + 3, oy + 20, 10, 1, P.fxCyan);
    surf.fillRect(ox + 1, oy + 27, 13, 1, P.fxWhite);
    surf.fillRect(ox + 4, oy + 34, 9, 1, P.fxCyan);
  }

  // Optional Transform Steam Aura behind character
  if (pose.steamAuraLevel && pose.steamAuraLevel >= 1) {
    const puffs =
      pose.steamAuraLevel === 2
        ? [
            { x: 10, y: 34, s: 4 },
            { x: 35, y: 33, s: 4 },
            { x: 12, y: 20, s: 5 },
            { x: 34, y: 18, s: 5 },
            { x: 23, y: 9, s: 4 }
          ]
        : [
            { x: 13, y: 37, s: 3 },
            { x: 33, y: 36, s: 3 },
            { x: 15, y: 24, s: 3 }
          ];
    for (const pf of puffs) {
      surf.fillRect(ox + pf.x, oy + pf.y, pf.s, pf.s, P.fxSteam);
      surf.fillRect(ox + pf.x + 1, oy + pf.y + 1, Math.max(1, pf.s - 2), Math.max(1, pf.s - 2), P.fxWhite);
    }
  }

  // 1. Back Arm
  drawLuffyArm(
    surf,
    ox,
    oy,
    pose.backShoulderX,
    pose.backShoulderY,
    pose.backElbowX,
    pose.backElbowY,
    pose.backFistX,
    pose.backFistY,
    pose.doublePalmCast ? pose.frontFistRadius : 2,
    pose.armamentFist
  );

  // 2. Back Leg
  drawLuffyLeg(
    surf,
    ox,
    oy,
    pose.backHipX,
    pose.backHipY,
    pose.backKneeX,
    pose.backKneeY,
    pose.backFootX,
    pose.backFootY
  );

  // 3. Torso (Red Vest, Chest X-Scar, Yellow Waist Sash)
  drawLuffyTorsoAndSash(surf, ox, oy, pose);

  // 4. Front Leg
  drawLuffyLeg(
    surf,
    ox,
    oy,
    pose.frontHipX,
    pose.frontHipY,
    pose.frontKneeX,
    pose.frontKneeY,
    pose.frontFootX,
    pose.frontFootY
  );

  // 5. Head & Straw Hat
  drawLuffyHeadAndStrawHat(surf, ox, oy, pose);

  // 6. Front Arm (including Gomu-Gomu rubber stretch & impact fist)
  drawLuffyArm(
    surf,
    ox,
    oy,
    pose.frontShoulderX,
    pose.frontShoulderY,
    pose.frontElbowX,
    pose.frontElbowY,
    pose.frontFistX,
    pose.frontFistY,
    pose.frontFistRadius,
    pose.armamentFist
  );

  // 7. Special Combat Pixel VFX (Rubber velocity rings, Double-palm Bazooka wave, Clash sparks, Victory sparkles)
  if (pose.rubberStretchRings) {
    const midX = ox + Math.round((pose.frontShoulderX + pose.frontFistX) * 0.5);
    const midY = oy + Math.round((pose.frontShoulderY + pose.frontFistY) * 0.5);
    surf.strokeRect(midX - 2, midY - 4, 4, 8, P.fxWhite);
    if (pose.frontFistX >= 40) {
      // Shockwave impact ring at full Gomu-Gomu extension
      surf.strokeRect(ox + pose.frontFistX - 5, oy + pose.frontFistY - 6, 10, 12, P.fxGold);
      surf.setPixel(ox + 46, oy + pose.frontFistY - 5, P.fxWhite);
      surf.setPixel(ox + 46, oy + pose.frontFistY + 5, P.fxWhite);
    }
  }

  if (pose.doublePalmCast && pose.frontFistX >= 36) {
    const wx = ox + pose.frontFistX + 2;
    const wy = oy + 17;
    surf.fillRect(wx, wy, 2, 13, P.fxCyan);
    surf.fillRect(wx + 2, wy + 2, 2, 9, P.fxWhite);
  }

  if (pose.clashSparks) {
    const sx = ox + pose.frontFistX + 3;
    const sy = oy + pose.frontFistY - 2;
    surf.fillRect(sx, sy, 4, 4, P.fxGold);
    surf.setPixel(sx + 1, sy + 1, P.fxWhite);
    surf.setPixel(sx - 1, sy - 2, P.fxCrimson);
    surf.setPixel(sx + 3, sy + 4, P.fxCrimson);
  }

  if (pose.victorySparkles) {
    surf.fillRect(ox + 8, oy + 10, 2, 2, P.fxGold);
    surf.fillRect(ox + 38, oy + 9, 2, 2, P.fxGold);
    surf.setPixel(ox + 12, oy + 6, P.fxWhite);
    surf.setPixel(ox + 35, oy + 14, P.fxWhite);
  }
}

/**
 * Generates the complete 288x528 (6 cols x 11 rows of 48x48) RGBA pixel buffer
 * for `luffy_base.png` using Pure TypeScript integer pixel rendering.
 */
export function renderLuffyArticulatedSheetPixels(): {
  width: number;
  height: number;
  data: Uint8ClampedArray;
} {
  const width = LUFFY_FRAME_WIDTH * LUFFY_SHEET_COLS;
  const height = LUFFY_FRAME_HEIGHT * LUFFY_SHEET_ROWS;
  const surf = new PixelSurface(width, height);

  for (let rowIdx = 0; rowIdx < STANDARD_SPRITE_ANIM_STATES.length; rowIdx++) {
    const state = STANDARD_SPRITE_ANIM_STATES[rowIdx];
    const poses = LUFFY_11_STATE_KEYFRAMES[state];
    for (let colIdx = 0; colIdx < poses.length; colIdx++) {
      renderArticulatedLuffyCell(
        surf,
        colIdx * LUFFY_FRAME_WIDTH,
        rowIdx * LUFFY_FRAME_HEIGHT,
        poses[colIdx]
      );
    }
  }

  return { width, height, data: surf.data };
}

/**
 * Generates a crisp 64x64 pixel portrait of Monkey D. Luffy for dialogue cutscenes
 * using the exact extracted 3-tone palette (`public/assets/portraits/luffy_{emotion}.png`).
 */
export function renderLuffyPortraitPixels(emotion: LuffyPortraitEmotion = 'neutral'): {
  width: number;
  height: number;
  data: Uint8ClampedArray;
} {
  const P = LUFFY_PIXEL_PALETTE;
  const surf = new PixelSurface(64, 64);

  // Subtle dark navy portrait background with gold corner border
  surf.fillRect(0, 0, 64, 64, '#0f172a');
  surf.strokeRect(0, 0, 64, 64, P.hatBase);
  surf.strokeRect(2, 2, 60, 60, '#1e293b');

  // 1. Shoulders & Red Open Cardigan/Vest + Bare Chest with X-Scar (y = 44..61)
  surf.fillRect(10, 44, 44, 18, P.outlineWarm);
  surf.fillRect(12, 46, 12, 15, P.vestBase);
  surf.fillRect(12, 46, 4, 14, P.vestLight);
  surf.fillRect(21, 47, 3, 14, P.vestShadow);
  surf.fillRect(19, 51, 2, 2, P.vestButton);

  surf.fillRect(40, 46, 12, 15, P.vestBase);
  surf.fillRect(40, 46, 3, 14, P.vestLight);
  surf.fillRect(49, 47, 3, 14, P.vestShadow);

  // Bare chest & top of X-Scar
  surf.fillRect(24, 45, 16, 16, P.skinBase);
  surf.fillRect(26, 45, 10, 4, P.skinLight);
  surf.drawSegment(27, 49, 37, 58, 2, P.scarBase, P.scarBase, P.scarShadow);
  surf.drawSegment(37, 49, 27, 58, 2, P.scarBase, P.scarBase, P.scarShadow);

  // 2. Neck (y = 38..45)
  surf.fillRect(26, 38, 12, 8, P.outlineWarm);
  surf.fillRect(28, 39, 8, 6, P.skinShadow);
  surf.fillRect(29, 41, 6, 4, P.skinBase);

  // 3. Spiky Black/Deep-Navy Hair tufts around temples & upper ears (y = 19..32)
  surf.fillRect(15, 19, 34, 10, P.outlineCool);
  surf.fillRect(17, 20, 30, 8, P.hairBase);
  // Left & Right spiky temple tufts
  surf.fillRect(13, 22, 4, 4, P.outlineCool);
  surf.fillRect(14, 23, 3, 2, P.hairShadow);
  surf.fillRect(14, 27, 4, 4, P.outlineCool);
  surf.fillRect(15, 28, 3, 2, P.hairShadow);
  surf.fillRect(47, 22, 4, 4, P.outlineCool);
  surf.fillRect(47, 23, 3, 2, P.hairShadow);
  surf.fillRect(46, 27, 4, 4, P.outlineCool);
  surf.fillRect(46, 28, 3, 2, P.hairShadow);

  // 4. Face & Ears with tapered jawline (y = 20..40)
  surf.fillRect(16, 27, 4, 6, P.outlineWarm);
  surf.fillRect(17, 28, 2, 4, P.skinShadow);
  surf.fillRect(44, 27, 4, 6, P.outlineWarm);
  surf.fillRect(45, 28, 2, 4, P.skinShadow);

  surf.fillRect(19, 20, 26, 15, P.outlineWarm);
  surf.fillRect(21, 35, 22, 3, P.outlineWarm);
  surf.fillRect(24, 38, 16, 2, P.outlineWarm);

  surf.fillRect(20, 21, 24, 14, P.skinBase);
  surf.fillRect(22, 35, 20, 2, P.skinBase);
  surf.fillRect(25, 37, 14, 2, P.skinShadow);
  surf.fillRect(22, 22, 18, 4, P.skinLight);

  // Front hair bangs over forehead
  surf.fillRect(20, 20, 4, 5, P.hairShadow);
  surf.fillRect(22, 25, 2, 2, P.hairShadow);
  surf.fillRect(27, 20, 3, 4, P.hairBase);
  surf.fillRect(34, 20, 3, 4, P.hairBase);
  surf.fillRect(40, 20, 4, 5, P.hairShadow);
  surf.fillRect(40, 25, 2, 2, P.hairShadow);

  // 5. Eyes, Brows & Iconic 2-Stitch Under-Eye Scar
  if (emotion === 'shock') {
    surf.fillRect(23, 25, 6, 6, P.eyeWhite);
    surf.fillRect(25, 27, 2, 2, P.eyePupil);
    surf.fillRect(35, 25, 6, 6, P.eyeWhite);
    surf.fillRect(37, 27, 2, 2, P.eyePupil);
  } else {
    surf.fillRect(23, 26, 5, 4, P.eyeWhite);
    surf.fillRect(25, 27, 2, 3, P.eyePupil);
    surf.fillRect(36, 26, 5, 4, P.eyeWhite);
    surf.fillRect(37, 27, 2, 3, P.eyePupil);
  }

  if (emotion === 'angry') {
    surf.drawSegment(22, 23, 28, 25, 1, P.hairShadow, P.hairShadow, P.hairShadow);
    surf.drawSegment(41, 23, 35, 25, 1, P.hairShadow, P.hairShadow, P.hairShadow);
  } else {
    surf.fillRect(23, 24, 5, 1, P.hairShadow);
    surf.fillRect(36, 24, 5, 1, P.hairShadow);
  }

  // 2-stitch scar under left eye (viewer's right side, x = 36..41, y = 31..32)
  surf.fillRect(36, 31, 5, 1, P.scarBase);
  surf.setPixel(37, 30, P.scarShadow);
  surf.setPixel(37, 32, P.scarShadow);
  surf.setPixel(39, 30, P.scarShadow);
  surf.setPixel(39, 32, P.scarShadow);

  // 6. Mouth by emotion
  if (emotion === 'grin') {
    surf.fillRect(25, 33, 14, 4, P.outlineWarm);
    surf.fillRect(26, 34, 12, 2, P.eyeWhite);
    surf.fillRect(26, 35, 12, 1, P.outlineWarm);
  } else if (emotion === 'angry') {
    surf.fillRect(27, 34, 10, 3, P.outlineWarm);
    surf.fillRect(28, 35, 8, 1, P.eyeWhite);
  } else if (emotion === 'shock') {
    surf.fillRect(29, 33, 6, 4, P.outlineWarm);
    surf.fillRect(30, 34, 4, 2, P.scarBase);
  } else {
    surf.fillRect(27, 34, 10, 2, P.outlineWarm);
    surf.fillRect(28, 34, 8, 1, P.eyeWhite);
  }

  // 7. Rounded Straw Hat Crown Dome, Red Ribbon & Curved Wide Brim (y = 5..21)
  surf.fillRect(20, 5, 24, 3, P.outlineWarm);
  surf.fillRect(16, 7, 32, 4, P.outlineWarm);
  surf.fillRect(14, 10, 36, 7, P.outlineWarm);

  surf.fillRect(21, 6, 22, 2, P.hatLight);
  surf.fillRect(18, 8, 28, 3, P.hatBase);
  surf.fillRect(20, 8, 20, 2, P.hatLight);
  surf.fillRect(16, 11, 32, 3, P.hatShadow);

  // Red Ribbon
  surf.fillRect(15, 14, 34, 3, P.ribbonBase);
  surf.fillRect(18, 14, 18, 1, P.ribbonLight);
  surf.fillRect(34, 16, 14, 1, P.ribbonShadow);

  // Wide Curved Brim
  surf.fillRect(6, 17, 52, 4, P.outlineWarm);
  surf.fillRect(8, 18, 48, 1, P.hatLight);
  surf.fillRect(8, 19, 48, 1, P.hatBase);
  surf.fillRect(10, 20, 44, 1, P.hatShadow);

  return { width: 64, height: 64, data: surf.data };
}

export function bakeArticulatedLuffySpriteSheetCanvas(): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  const { width, height, data } = renderLuffyArticulatedSheetPixels();
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  ctx.imageSmoothingEnabled = false;
  const imgData = ctx.createImageData(width, height);
  imgData.data.set(data);
  ctx.putImageData(imgData, 0, 0);
  return canvas;
}

export function bakeLuffyPortraitCanvas(
  emotion: LuffyPortraitEmotion = 'neutral'
): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  const { width, height, data } = renderLuffyPortraitPixels(emotion);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  ctx.imageSmoothingEnabled = false;
  const imgData = ctx.createImageData(width, height);
  imgData.data.set(data);
  ctx.putImageData(imgData, 0, 0);
  return canvas;
}
