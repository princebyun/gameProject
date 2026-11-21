import {
  renderLuffyPortraitPixels,
  type LuffyPortraitEmotion
} from '../../../assets/luffyArticulatedPixelSheet';
import { RigPixelSurface } from './pixelSurface';
import type {
  CharacterBlueprintEntry,
  PortraitEmotion,
  ThreeToneHex
} from './rigTypes';

function mapToLuffyLegacyEmotion(emotion: PortraitEmotion): LuffyPortraitEmotion {
  if (emotion === 'angry' || emotion === 'battle_cry') return 'angry';
  if (emotion === 'shocked' || emotion === 'sad') return 'shock';
  if (emotion === 'smirk' || emotion === 'excited') return 'grin';
  return 'neutral';
}

/**
 * Generates a crisp 64x64 pixel portrait for any unit blueprint and emotion (`PortraitEmotion`).
 * Uses the character's exact 3-tone palette, hairstyle, headgear, facial features, and 1px hue-shifted outline.
 */
export function bakeCharacterPortraitPixels(
  bp: CharacterBlueprintEntry,
  emotion: PortraitEmotion = 'normal'
): { width: number; height: number; data: Uint8ClampedArray } {
  if (bp.unitId === 'luffy' && bp.formId === 'base') {
    return renderLuffyPortraitPixels(mapToLuffyLegacyEmotion(emotion));
  }

  const surf = new RigPixelSurface(64, 64);

  // 1. Dark Navy Frame & Accent Border
  surf.fillRect(0, 0, 64, 64, '#0b1120');
  surf.fillRect(0, 0, 64, 2, bp.palette.accent[1]);
  surf.fillRect(0, 62, 64, 2, bp.palette.accent[2]);
  surf.fillRect(0, 0, 2, 64, bp.palette.accent[1]);
  surf.fillRect(62, 0, 2, 64, bp.palette.accent[2]);

  // Background energy aura for battle_cry / excited / determined
  if (emotion === 'battle_cry' || emotion === 'excited') {
    surf.fillRect(4, 4, 56, 56, bp.palette.weaponOrEffect[2], 70);
  }

  const skin = bp.palette.skin;
  const hair = bp.palette.hair;
  const top = bp.palette.top;
  const hat: ThreeToneHex = bp.palette.hatOrHelm ?? bp.palette.accent;

  // 2. Shoulders & Upper Torso (y = 44..61)
  surf.fillShadedBox(11, 45, 42, 16, top);
  if (bp.head.chestFeature === 'x_scar_open_vest' || bp.head.chestFeature === 'diagonal_scar_haramaki') {
    surf.fillShadedBox(24, 45, 16, 16, skin);
    if (bp.palette.scarColor) {
      surf.drawLimbSegment(26, 48, 37, 58, 1, [
        bp.palette.scarColor,
        bp.palette.scarColor,
        bp.palette.scarColor
      ]);
    }
  } else if (bp.head.chestFeature === 'black_suit_tie') {
    surf.fillRect(28, 45, 8, 16, '#f8fafc');
    surf.fillRect(31, 46, 2, 14, bp.palette.accent[1]);
  } else {
    surf.fillShadedBox(25, 46, 14, 15, bp.palette.accent);
  }

  // 3. Neck (y = 38..45)
  surf.fillShadedBox(26, 38, 12, 8, skin);

  // 4. Back Hair / Side Locks / Horns
  const hs = bp.head.hairStyle;
  if (hs === 'giant_afro_skull') {
    surf.fillCircle(32, 22, 18, hair);
  } else if (hs === 'long_wavy' || hs === 'long_straight_dark') {
    surf.fillShadedBox(14, 16, 36, 28, hair);
  } else if (hs === 'oni_horns_mane' || hs === 'viking_horned_helm') {
    surf.fillShadedBox(13, 16, 38, 26, hair);
    surf.drawLimbSegment(16, 16, 7, 5, 2, hat);
    surf.drawLimbSegment(48, 16, 57, 5, 2, hat);
  } else if (hs === 'reindeer_antlers_hat') {
    surf.drawLimbSegment(15, 16, 7, 7, 2, ['#d97706', '#92400e', '#451a03']);
    surf.drawLimbSegment(49, 16, 57, 7, 2, ['#d97706', '#92400e', '#451a03']);
  } else {
    surf.fillShadedBox(15, 16, 34, 16, hair);
  }

  // 5. Face & Jawline (y = 19..39)
  const faceTones: ThreeToneHex =
    bp.head.faceFeature === 'skull_sockets'
      ? ['#ffffff', '#f1f5f9', '#cbd5e1']
      : skin;
  surf.fillShadedBox(19, 19, 26, 16, faceTones);
  surf.fillShadedBox(22, 35, 20, 4, faceTones);

  // 6. Eyes & Facial Features by Emotion
  const eyeColor = bp.palette.eyeColor ?? '#090d16';
  if (bp.head.faceFeature === 'skull_sockets') {
    surf.fillRect(23, 24, 6, 6, '#090d16');
    surf.fillRect(35, 24, 6, 6, '#090d16');
  } else if (bp.head.faceFeature === 'doffy_shades' || bp.head.faceFeature === 'admiral_shades') {
    surf.fillShadedBox(21, 24, 10, 5, ['#fda4af', '#e11d48', '#881337']);
    surf.fillShadedBox(33, 24, 10, 5, ['#fda4af', '#e11d48', '#881337']);
  } else if (bp.head.faceFeature === 'eye_bandage') {
    surf.fillShadedBox(20, 23, 24, 6, ['#ffffff', '#e2e8f0', '#94a3b8']);
  } else {
    const eyeH = emotion === 'shocked' || emotion === 'excited' ? 5 : 4;
    if (bp.head.hairStyle !== 'side_sweep_left_covered') {
      surf.fillRect(23, 25, 5, eyeH, '#f8fafc');
      surf.fillRect(25, 26, 2, eyeH - 1, eyeColor);
    }
    if (bp.head.faceFeature === 'left_eye_scar') {
      // Zoro closed left eye + vertical scar
      surf.fillRect(35, 27, 6, 1, '#090d16');
      surf.fillRect(38, 23, 1, 9, bp.palette.scarColor ?? '#be123c');
    } else {
      surf.fillRect(36, 25, 5, eyeH, '#f8fafc');
      surf.fillRect(37, 26, 2, eyeH - 1, eyeColor);
    }
  }

  // Eyebrows
  if (emotion === 'angry' || emotion === 'battle_cry' || emotion === 'determined') {
    surf.drawLimbSegment(22, 22, 28, 24, 1, hair);
    surf.drawLimbSegment(42, 22, 36, 24, 1, hair);
  } else if (emotion === 'sad') {
    surf.drawLimbSegment(22, 24, 28, 22, 1, hair);
    surf.drawLimbSegment(42, 24, 36, 22, 1, hair);
  } else {
    surf.fillRect(23, 23, 5, 1, hair[2]);
    surf.fillRect(36, 23, 5, 1, hair[2]);
  }

  // Special Nose / Scar / Mustache
  if (bp.head.faceFeature === 'long_nose_goggles') {
    surf.fillShadedBox(31, 28, 12, 3, skin);
  } else if (bp.head.faceFeature === 'blue_nose') {
    surf.fillRect(31, 29, 3, 2, '#2563eb');
  } else if (bp.head.faceFeature === 'clown_red_nose') {
    surf.fillRect(30, 28, 4, 4, '#ef4444');
  } else if (bp.head.faceFeature === 'under_eye_scar') {
    surf.fillRect(36, 30, 5, 1, bp.palette.scarColor ?? '#be123c');
  } else if (bp.head.faceFeature === 'mouth_scarf_fangs') {
    surf.fillShadedBox(20, 31, 24, 9, ['#ffffff', '#e2e8f0', '#94a3b8']);
  }

  // 7. Mouth by 8 Emotions
  if (bp.head.faceFeature !== 'mouth_scarf_fangs') {
    if (emotion === 'battle_cry' || emotion === 'angry') {
      surf.fillRect(26, 33, 12, 4, '#881337');
      surf.fillRect(27, 33, 10, 1, '#ffffff');
      surf.fillRect(27, 36, 10, 1, '#ffffff');
    } else if (emotion === 'smirk' || emotion === 'excited') {
      surf.fillRect(25, 33, 14, 3, '#ffffff');
      surf.fillRect(25, 34, 14, 1, '#090d16');
    } else if (emotion === 'shocked') {
      surf.fillRect(29, 32, 6, 5, '#881337');
    } else if (emotion === 'sad') {
      surf.fillRect(28, 34, 8, 1, '#090d16');
      surf.setPixel(27, 35, '#090d16');
      surf.setPixel(36, 35, '#090d16');
    } else {
      surf.fillRect(27, 34, 10, 2, '#090d16');
      surf.fillRect(28, 34, 8, 1, '#ffffff');
    }
  }

  // 8. Top Hair / Hat / Crown
  if (bp.head.hasStrawHat) {
    surf.fillShadedBox(16, 7, 32, 8, hat);
    surf.fillRect(16, 13, 32, 2, '#dc2626');
    surf.fillShadedBox(7, 15, 50, 4, hat);
  } else if (
    hs === 'reindeer_antlers_hat' ||
    hs === 'marine_cap' ||
    hs === 'spotted_hat' ||
    hs === 'top_hat_pigeon' ||
    hs === 'clown_hat_tails'
  ) {
    surf.fillShadedBox(14, 7, 36, 11, hat);
    surf.fillShadedBox(10, 17, 44, 3, hat);
  } else if (hs === 'flame_white_nika') {
    surf.fillCircle(32, 13, 11, hair);
    surf.fillCircle(20, 16, 7, hair);
    surf.fillCircle(44, 15, 7, hair);
  } else if (hs === 'side_sweep_left_covered') {
    // Sanji blonde hair covering left side of face
    surf.fillShadedBox(16, 11, 32, 10, hair);
    surf.fillShadedBox(18, 20, 12, 11, hair);
  } else if (hs !== 'giant_afro_skull') {
    surf.fillShadedBox(16, 11, 32, 10, hair);
  }

  surf.applyCellHueShiftedOutline(2, 2, 60, 59, 60);
  return { width: 64, height: 64, data: surf.data };
}

export function bakeCharacterPortraitCanvas(
  bp: CharacterBlueprintEntry,
  emotion: PortraitEmotion = 'normal'
): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  const { width, height, data } = bakeCharacterPortraitPixels(bp, emotion);
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
