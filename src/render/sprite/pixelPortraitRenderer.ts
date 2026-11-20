import {
  applyTintedPixelOutline,
  drawPixelEllipse,
  drawPixelLine,
  fillShadedRect,
  resolveCharacterBlueprint,
  shadeHueShift,
  type CharacterBlueprint
} from '../../assets/pixelArtPrimitives';
import type { ExternalAssetResolver } from '../../assets/externalAssetResolver';
import type { DialogueEmotion } from '../../core/rpg/scriptSchema';
import type { UnitDefinition } from '../../core/types/dataSchemas';

export const PORTRAIT_SIZE_PX = 64;

/**
 * Dedicated 64x64 Anime Bust-Up Pixel Portrait Renderer.
 * - Prioritizes external PNGs at `public/assets/portraits/{unitId}_{emotion}.png`
 * - Falls back seamlessly to a crisp 64x64 cel-shaded procedural pixel bust portrait
 *   with live 7-emotion facial expressions (eyebrow slant, pupil highlight, mouth, emotion badge).
 */
export class PixelPortraitRenderer {
  private bakedCache = new Map<string, HTMLCanvasElement>();

  constructor(private readonly resolver: ExternalAssetResolver) {}

  public getOrCreatePortrait(
    unitDef: UnitDefinition | null | undefined,
    emotion: DialogueEmotion = 'normal',
    activeFormId: string | null = null
  ): {
    image: HTMLImageElement | HTMLCanvasElement | null;
    source: 'EXTERNAL_PNG' | 'BAKED_FALLBACK';
  } {
    const uid = unitDef?.id ?? 'luffy';
    const key = `portrait_${uid}_${activeFormId ?? 'base'}_${emotion}`;
    const extSrc = `assets/portraits/${uid}_${emotion}.png`;

    const resolved = this.resolver.resolveImageSyncOrBake(key, extSrc, () =>
      this.bakeBustPortrait(unitDef, emotion, activeFormId)
    );
    return {
      image: resolved.image,
      source: resolved.source
    };
  }

  public bakeBustPortrait(
    unitDef: UnitDefinition | null | undefined,
    emotion: DialogueEmotion = 'normal',
    activeFormId: string | null = null
  ): HTMLCanvasElement | null {
    if (typeof document === 'undefined') return null;

    const cacheKey = `${unitDef?.id ?? 'generic'}_${activeFormId ?? 'base'}_${emotion}`;
    const cached = this.bakedCache.get(cacheKey);
    if (cached) return cached;

    const canvas = document.createElement('canvas');
    canvas.width = PORTRAIT_SIZE_PX;
    canvas.height = PORTRAIT_SIZE_PX;
    const ctx = canvas.getContext('2d');
    if (!ctx) return canvas;
    ctx.imageSmoothingEnabled = false;

    const bp = resolveCharacterBlueprint(unitDef, activeFormId);
    renderBustToCanvas(ctx, bp, emotion);

    this.bakedCache.set(cacheKey, canvas);
    return canvas;
  }

  public clearCache(): void {
    this.bakedCache.clear();
  }
}

function renderBustToCanvas(
  ctx: CanvasRenderingContext2D,
  bp: CharacterBlueprint,
  emotion: DialogueEmotion
): void {
  const w = PORTRAIT_SIZE_PX;
  const h = PORTRAIT_SIZE_PX;
  const cx = 32;

  // Separate transparent foreground layer so 1px tinted outline wraps cleanly around the character
  const fg = document.createElement('canvas');
  fg.width = w;
  fg.height = h;
  const fctx = fg.getContext('2d')!;
  fctx.imageSmoothingEnabled = false;

  // 1. Back hair / Cape / Admiral coat collar / Horns behind head
  if (bp.capeStyle === 'admiral_justice') {
    fillShadedRect(fctx, 8, 42, 48, 22, '#f8fafc');
    fillShadedRect(fctx, 8, 42, 10, 6, '#facc15');
    fillShadedRect(fctx, 46, 42, 10, 6, '#facc15');
  } else if (bp.capeStyle === 'flamingo_fur') {
    drawPixelEllipse(fctx, 32, 54, 26, 15, '#ec4899');
    drawPixelEllipse(fctx, 20, 48, 10, 8, '#f472b6');
    drawPixelEllipse(fctx, 44, 48, 10, 8, '#f472b6');
  } else if (bp.capeStyle === 'purple_fur_cape' || bp.capeStyle === 'dark_fur') {
    fillShadedRect(fctx, 9, 44, 46, 20, bp.capeStyle === 'purple_fur_cape' ? '#6b21a8' : '#18181b');
  }

  if (bp.hairStyle === 'long_flowing' || bp.hairStyle === 'long_straight' || bp.hairStyle === 'kaido_mane_horns') {
    fillShadedRect(fctx, 13, 20, 38, 36, bp.hairColor);
  }

  if (bp.hagoromoColor) {
    const hFill = bp.hagoromoColor === 'white' ? '#ffffff' : '#111827';
    const hRim = bp.hagoromoColor === 'white' ? '#cbd5e1' : '#a855f7';
    drawPixelEllipse(fctx, 12, 34, 6, 5, hRim);
    drawPixelEllipse(fctx, 12, 34, 4, 3, hFill);
    drawPixelEllipse(fctx, 52, 34, 6, 5, hRim);
    drawPixelEllipse(fctx, 52, 34, 4, 3, hFill);
    drawPixelEllipse(fctx, 32, 10, 9, 5, hRim);
    drawPixelEllipse(fctx, 32, 10, 7, 3, hFill);
  }

  // 2. Shoulders & Chest Outfit
  fillShadedRect(fctx, 14, 45, 36, 19, bp.torsoColor);
  if (bp.torsoStyle === 'open_cardigan_scar') {
    fillShadedRect(fctx, 24, 45, 16, 19, bp.skin, false);
    drawPixelLine(fctx, 27, 50, 37, 58, '#b45309', 2);
    drawPixelLine(fctx, 37, 50, 27, 58, '#b45309', 2);
  } else if (bp.torsoStyle === 'suit_tie' || bp.torsoStyle === 'striped_suit') {
    fillShadedRect(fctx, 26, 45, 12, 19, '#f8fafc', false);
    fillShadedRect(fctx, 30, 48, 4, 16, bp.sashColor, false);
  }
  // Neck
  fillShadedRect(fctx, 27, 40, 10, 8, shadeHueShift(bp.skin, -1), false);

  // 3. Head Base (anime jawline silhouette)
  fillShadedRect(fctx, 19, 17, 26, 24, bp.skin);
  fillShadedRect(fctx, 22, 39, 20, 4, bp.skin, false);
  // Ears
  fillShadedRect(fctx, 16, 26, 4, 7, bp.skin);
  fillShadedRect(fctx, 44, 26, 4, 7, bp.skin);

  // 4. Hair & Iconic Headgear
  if (bp.hairStyle === 'afro') {
    drawPixelEllipse(fctx, cx, 14, 20, 13, bp.hairColor);
  } else if (bp.hairStyle === 'nika_flame' || bp.hairStyle === 'flame_black') {
    drawPixelEllipse(fctx, cx, 15, 18, 9, bp.hairColor);
    fillShadedRect(fctx, 14, 15, 7, 12, bp.hairColor);
    fillShadedRect(fctx, 43, 15, 7, 12, bp.hairColor);
    fillShadedRect(fctx, 22, 6, 6, 10, bp.hairColor);
    fillShadedRect(fctx, 34, 5, 6, 11, bp.hairColor);
  } else if (bp.hairStyle === 'pompadour') {
    fillShadedRect(fctx, 16, 8, 34, 12, bp.hairColor);
  } else if (bp.hairStyle === 'sanji_bangs') {
    fillShadedRect(fctx, 17, 12, 30, 10, bp.hairColor);
    fillShadedRect(fctx, 18, 19, 12, 13, bp.hairColor, false);
  } else if (bp.hairStyle === 'pineapple') {
    fillShadedRect(fctx, 22, 6, 20, 12, bp.hairColor);
  } else {
    fillShadedRect(fctx, 17, 13, 30, 9, bp.hairColor);
    // Hair bangs
    fctx.fillStyle = bp.hairColor;
    fctx.fillRect(20, 21, 4, 4);
    fctx.fillRect(28, 21, 5, 3);
    fctx.fillRect(39, 21, 5, 4);
  }

  if (bp.hatStyle === 'straw_hat') {
    fillShadedRect(fctx, 9, 14, 46, 6, bp.hatColor ?? '#f4c542');
    fillShadedRect(fctx, 17, 6, 30, 9, bp.hatColor ?? '#f4c542');
    fctx.fillStyle = bp.hatAccent ?? '#dc2626';
    fctx.fillRect(17, 12, 30, 3);
  } else if (bp.hatStyle === 'chopper_hat') {
    drawPixelLine(fctx, 16, 15, 8, 5, '#78350f', 3);
    drawPixelLine(fctx, 48, 15, 56, 5, '#78350f', 3);
    fillShadedRect(fctx, 15, 6, 34, 13, bp.hatColor ?? '#ec4899');
    drawPixelLine(fctx, 28, 9, 36, 16, '#ffffff', 2);
    drawPixelLine(fctx, 36, 9, 28, 16, '#ffffff', 2);
  } else if (bp.hatStyle === 'spotted_hat') {
    drawPixelEllipse(fctx, cx, 13, 19, 9, bp.hatColor ?? '#f8fafc');
    fctx.fillStyle = bp.hatAccent ?? '#0f172a';
    fctx.fillRect(21, 10, 4, 4);
    fctx.fillRect(34, 8, 5, 4);
    fctx.fillRect(42, 13, 4, 3);
  } else if (bp.hatStyle === 'top_hat') {
    fillShadedRect(fctx, 14, 14, 36, 4, bp.hatColor ?? '#111827');
    fillShadedRect(fctx, 20, 3, 24, 12, bp.hatColor ?? '#111827');
  } else if (bp.hatStyle === 'marine_cap') {
    fillShadedRect(fctx, 16, 8, 34, 9, bp.hatColor ?? '#f8fafc');
    fctx.fillStyle = bp.hatAccent ?? '#1d4ed8';
    fctx.fillRect(22, 11, 20, 3);
  } else if (bp.hatStyle === 'pirate_bicorne') {
    fillShadedRect(fctx, 10, 6, 44, 11, bp.hatColor ?? '#111827');
    fillShadedRect(fctx, 28, 9, 8, 6, bp.hatAccent ?? '#facc15');
  } else if (bp.hatStyle === 'bull_horns' || bp.hatStyle === 'viking_horns') {
    const hc = bp.hatColor ?? '#f8fafc';
    drawPixelLine(fctx, 19, 17, 7, 4, hc, 4);
    drawPixelLine(fctx, 45, 17, 57, 4, hc, 4);
  } else if (bp.hatStyle === 'crown') {
    fillShadedRect(fctx, 22, 4, 20, 8, '#facc15');
  } else if (bp.hatStyle === 'sniper_goggles' || bp.hatStyle === 'sleep_mask') {
    fillShadedRect(fctx, 18, 12, 28, 6, bp.hatColor ?? '#38bdf8');
  }

  // 5. Eyes, Eyebrows & 7-Emotion Facial Expressions
  const eyeY = 27;
  const eyeColor =
    bp.eyeStyle === 'nika_red' || bp.eyeStyle === 'glowing_red'
      ? '#ef4444'
      : bp.eyeStyle === 'calm_blue'
        ? '#0284c7'
        : '#0f172a';

  if (bp.eyeStyle === 'amber_shades' || bp.eyeStyle === 'crimson_shades' || bp.eyeStyle === 'cool_shades') {
    const gc =
      bp.eyeStyle === 'crimson_shades'
        ? '#ef4444'
        : bp.eyeStyle === 'amber_shades'
          ? '#f59e0b'
          : '#0f172a';
    fillShadedRect(fctx, 20, eyeY - 1, 10, 6, gc);
    fillShadedRect(fctx, 34, eyeY - 1, 10, 6, gc);
    fctx.fillStyle = '#0f172a';
    fctx.fillRect(30, eyeY + 1, 4, 2);
  } else if (bp.eyeStyle === 'eye_bandage') {
    fillShadedRect(fctx, 18, eyeY - 2, 28, 7, '#f8fafc');
  } else if (bp.eyeStyle === 'skull') {
    drawPixelEllipse(fctx, 26, eyeY + 2, 4, 4, '#0f172a');
    drawPixelEllipse(fctx, 38, eyeY + 2, 4, 4, '#0f172a');
  } else {
    const eyeH = emotion === 'shocked' ? 6 : emotion === 'smirk' ? 3 : 4;
    // Left eye (hidden if Sanji bangs)
    if (bp.hairStyle !== 'sanji_bangs') {
      fctx.fillStyle = '#ffffff';
      fctx.fillRect(22, eyeY, 6, eyeH);
      fctx.fillStyle = eyeColor;
      fctx.fillRect(24, eyeY + 1, 3, Math.max(2, eyeH - 1));
      fctx.fillStyle = '#ffffff';
      fctx.fillRect(24, eyeY + 1, 1, 1);
    }
    // Right eye
    fctx.fillStyle = '#ffffff';
    fctx.fillRect(36, eyeY, 6, eyeH);
    fctx.fillStyle = eyeColor;
    fctx.fillRect(38, eyeY + 1, 3, Math.max(2, eyeH - 1));
    fctx.fillStyle = '#ffffff';
    fctx.fillRect(38, eyeY + 1, 1, 1);

    // Eyebrows driven by emotion
    const browCol = shadeHueShift(bp.hairColor, -1);
    if (emotion === 'angry' || emotion === 'determined') {
      drawPixelLine(fctx, 21, eyeY - 3, 28, eyeY - 1, browCol, 2);
      drawPixelLine(fctx, 43, eyeY - 3, 36, eyeY - 1, browCol, 2);
    } else if (emotion === 'sad') {
      drawPixelLine(fctx, 21, eyeY - 1, 28, eyeY - 3, browCol, 2);
      drawPixelLine(fctx, 43, eyeY - 1, 36, eyeY - 3, browCol, 2);
    } else if (emotion === 'shocked' || emotion === 'excited') {
      fctx.fillStyle = browCol;
      fctx.fillRect(21, eyeY - 4, 7, 2);
      fctx.fillRect(36, eyeY - 4, 7, 2);
    } else {
      fctx.fillStyle = browCol;
      fctx.fillRect(21, eyeY - 2, 7, 2);
      fctx.fillRect(36, eyeY - 2, 7, 2);
    }
  }

  // Signature facial scars / nose / scarf
  if (bp.eyeStyle === 'luffy_scar') {
    fctx.fillStyle = '#991b1b';
    fctx.fillRect(22, eyeY + 5, 5, 1);
  } else if (bp.eyeStyle === 'zoro_scar') {
    fctx.fillStyle = '#7f1d1d';
    fctx.fillRect(25, eyeY - 2, 2, 9);
  } else if (bp.eyeStyle === 'croc_scar') {
    fctx.fillStyle = '#7f1d1d';
    fctx.fillRect(20, eyeY + 5, 24, 1);
  } else if (bp.eyeStyle === 'clown_nose') {
    drawPixelEllipse(fctx, cx, 32, 4, 3, '#ef4444');
  } else if (bp.eyeStyle === 'blue_nose') {
    drawPixelEllipse(fctx, cx, 32, 3, 2, '#38bdf8');
  } else if (bp.eyeStyle === 'white_scarf') {
    fillShadedRect(fctx, 18, 34, 28, 10, '#f8fafc');
  } else if (bp.eyeStyle === 'steel_jaw') {
    fillShadedRect(fctx, 19, 34, 26, 8, '#94a3b8');
  }

  // Mouth driven by emotion (if not covered by scarf)
  if (bp.eyeStyle !== 'white_scarf') {
    const my = 36;
    if (emotion === 'excited') {
      // Big Luffy-style toothy grin
      fillShadedRect(fctx, 26, my - 1, 12, 5, '#ffffff', false);
      fctx.fillStyle = '#7f1d1d';
      fctx.fillRect(26, my - 1, 12, 1);
      fctx.fillRect(26, my + 4, 12, 1);
    } else if (emotion === 'angry') {
      fillShadedRect(fctx, 27, my, 10, 4, '#991b1b', false);
      fctx.fillStyle = '#ffffff';
      fctx.fillRect(28, my, 8, 1);
    } else if (emotion === 'shocked') {
      drawPixelEllipse(fctx, cx, my + 2, 3, 3, '#7f1d1d');
    } else if (emotion === 'smirk') {
      drawPixelLine(fctx, 27, my + 2, 37, my, '#7f1d1d', 1.5);
    } else if (emotion === 'sad') {
      drawPixelLine(fctx, 28, my + 2, 36, my + 2, '#7f1d1d', 1.5);
      // Tear drop
      fctx.fillStyle = '#38bdf8';
      fctx.fillRect(22, eyeY + 5, 2, 4);
    } else {
      fctx.fillStyle = '#7f1d1d';
      fctx.fillRect(28, my + 1, 8, 2);
    }
  }

  // Apply crisp 1px Hue-Shifted Dark Outline to the portrait foreground
  applyTintedPixelOutline(fctx, w, h);

  // Subtle retro gradient portrait background behind character
  const bgGrad = ctx.createLinearGradient(0, 0, 0, h);
  bgGrad.addColorStop(0, shadeHueShift(bp.auraAccent, -2));
  bgGrad.addColorStop(1, '#0f172a');
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, w, h);

  // Diagonal anime speedline shimmer in portrait background
  ctx.fillStyle = 'rgba(255, 255, 255, 0.06)';
  for (let i = -16; i < w; i += 12) {
    drawPixelLine(ctx, i, 0, i + 24, h, 'rgba(255, 255, 255, 0.06)', 2);
  }

  ctx.drawImage(fg, 0, 0);

  // Live Emotion Comic Marks on top-right corner
  if (emotion === 'angry') {
    ctx.fillStyle = '#ef4444';
    ctx.fillRect(50, 7, 6, 2);
    ctx.fillRect(52, 5, 2, 6);
  } else if (emotion === 'shocked') {
    ctx.fillStyle = '#38bdf8';
    ctx.fillRect(53, 5, 3, 8);
    ctx.fillRect(53, 15, 3, 3);
  } else if (emotion === 'excited') {
    ctx.fillStyle = '#fde047';
    ctx.fillRect(52, 6, 2, 6);
    ctx.fillRect(50, 8, 6, 2);
  }
}
