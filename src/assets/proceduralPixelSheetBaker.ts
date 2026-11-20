import type {
  FormDefinition,
  UnitDefinition
} from '../core/types/dataSchemas';
import {
  STANDARD_SPRITE_ANIM_STATES,
  type SpriteAnimState,
  type SpriteSheetManifestEntry
} from '../data/assets/types';
import {
  applyTintedPixelOutline,
  drawPixelEllipse,
  drawPixelLine,
  fillShadedRect,
  resolveCharacterBlueprint,
  shadeHueShift,
  type CharacterBlueprint
} from './pixelArtPrimitives';
import { resolveBakedFrameSize } from './smartSpriteSheetLoader';

export const SHEET_COLUMNS = 6;
export const SHEET_ROWS = STANDARD_SPRITE_ANIM_STATES.length; // 11 rows

interface FramePose {
  bobY: number;
  shiftX: number;
  legStride: number; // -2..+2
  armSwing: number; // -1..+2
  capeSway: number;
  weaponRaise: number; // 0..1
  leanForward: number;
  crouchY: number;
  isAttackHit: boolean;
  isCastPeak: boolean;
  isDowned: boolean;
  isVictory: boolean;
  isTransform: boolean;
  transformT: number;
  hagoromoPhase: number;
}

function computePose(
  state: SpriteAnimState,
  frameIdx: number,
  frameCount: number,
  hitFrame?: number
): FramePose {
  const t = frameCount > 1 ? frameIdx / (frameCount - 1) : 0;
  const pose: FramePose = {
    bobY: 0,
    shiftX: 0,
    legStride: 0,
    armSwing: 0,
    capeSway: frameIdx % 2 === 0 ? 0 : 1,
    weaponRaise: 0,
    leanForward: 0,
    crouchY: 0,
    isAttackHit: false,
    isCastPeak: false,
    isDowned: false,
    isVictory: false,
    isTransform: false,
    transformT: t,
    hagoromoPhase: frameIdx
  };

  if (state === 'IDLE') {
    pose.bobY = frameIdx === 1 || frameIdx === 2 ? -1 : 0;
    pose.capeSway = frameIdx % 2 === 1 ? 1 : 0;
  } else if (state === 'MOVE') {
    const cycle = [0, 2, 1, 0, -2, -1];
    pose.legStride = cycle[frameIdx % cycle.length];
    pose.bobY = frameIdx % 2 === 0 ? -1 : 0;
    pose.leanForward = 1;
    pose.capeSway = 2 + (frameIdx % 2);
  } else if (state === 'WINDUP') {
    pose.crouchY = 2;
    pose.shiftX = -2;
    pose.weaponRaise = 0.7;
  } else if (state === 'ATTACK_MELEE') {
    const isHit = frameIdx === (hitFrame ?? 2);
    pose.isAttackHit = isHit;
    pose.shiftX = isHit ? 4 : frameIdx === 0 ? -2 : 2;
    pose.armSwing = isHit ? 2 : frameIdx === 0 ? -1 : 1;
    pose.weaponRaise = isHit ? 1 : 0.4;
    pose.legStride = isHit ? 2 : 1;
    pose.capeSway = isHit ? 3 : 1;
  } else if (state === 'ATTACK_CAST') {
    const isPeak = frameIdx === (hitFrame ?? 1);
    pose.isCastPeak = isPeak;
    pose.shiftX = isPeak ? 2 : 0;
    pose.armSwing = isPeak ? 2 : 1;
    pose.capeSway = 2;
  } else if (state === 'CLASH') {
    pose.shiftX = frameIdx % 2 === 0 ? 2 : 1;
    pose.crouchY = 1;
    pose.weaponRaise = 0.85;
    pose.isAttackHit = true;
  } else if (state === 'DODGE') {
    pose.shiftX = 3;
    pose.crouchY = 1;
    pose.capeSway = 3;
    pose.leanForward = 2;
  } else if (state === 'HIT') {
    pose.shiftX = -3 - frameIdx;
    pose.bobY = -1;
    pose.capeSway = -1;
  } else if (state === 'DOWNED') {
    pose.isDowned = true;
    pose.bobY = 6;
  } else if (state === 'TRANSFORM') {
    pose.isTransform = true;
    pose.bobY = -Math.round(t * 3);
    pose.capeSway = 3;
  } else if (state === 'VICTORY') {
    pose.isVictory = true;
    pose.bobY = frameIdx % 2 === 0 ? -2 : 0;
    pose.armSwing = 2;
  }

  return pose;
}

/**
 * Special Giant Silhouette #1: Kaido Serpentine Azure/Flame Dragon (S-curve dragon coils, golden horns, whiskers, flame clouds).
 */
function drawSerpentDragonCharacter(
  ctx: CanvasRenderingContext2D,
  fw: number,
  fh: number,
  bp: CharacterBlueprint,
  pose: FramePose
): void {
  const cx = Math.round(fw * 0.5) + pose.shiftX;
  const footY = Math.round(fh * 0.84);
  const scale = fw / 64;
  const bodyColor = bp.torsoColor;
  const bellyColor = bp.sashColor;
  const wave = Math.sin(pose.hagoromoPhase * 1.3) * 3 * scale;

  // Coiled S-curve dragon body segments
  const segs = [
    { x: cx - 18 * scale, y: footY - 8 * scale, r: 6.5 * scale },
    { x: cx - 11 * scale, y: footY - 12 * scale + wave * 0.4, r: 7.5 * scale },
    { x: cx - 2 * scale, y: footY - 17 * scale - wave * 0.5, r: 8.5 * scale },
    { x: cx + 8 * scale, y: footY - 22 * scale + wave * 0.4, r: 8 * scale },
    { x: cx + 2 * scale, y: footY - 30 * scale - wave * 0.4, r: 7.5 * scale },
    { x: cx - 6 * scale, y: footY - 36 * scale + wave * 0.3, r: 7 * scale },
    { x: cx + 4 * scale, y: footY - 42 * scale + pose.bobY, r: 8 * scale }
  ];

  // Flame clouds beneath dragon coils
  for (let i = 0; i < 4; i++) {
    drawPixelEllipse(
      ctx,
      cx - 14 * scale + i * 9 * scale,
      footY - 6 * scale - (i % 2) * 3 * scale,
      6 * scale,
      3.5 * scale,
      i % 2 === 0 ? '#f97316' : '#fbbf24'
    );
  }

  for (let i = 0; i < segs.length; i++) {
    const s = segs[i];
    drawPixelEllipse(ctx, s.x, s.y, s.r, s.r * 0.86, bodyColor);
    drawPixelEllipse(
      ctx,
      s.x - s.r * 0.2,
      s.y - s.r * 0.25,
      s.r * 0.5,
      s.r * 0.35,
      shadeHueShift(bodyColor, 1)
    );
    // Golden belly scales
    drawPixelEllipse(
      ctx,
      s.x + s.r * 0.1,
      s.y + s.r * 0.32,
      s.r * 0.6,
      s.r * 0.32,
      bellyColor
    );
    // Dorsal mane spine
    fillShadedRect(
      ctx,
      s.x - 2 * scale,
      s.y - s.r - 2 * scale,
      4 * scale,
      3 * scale,
      '#1e1b4b',
      false
    );
  }

  // Dragon Head facing right
  const hx = cx + 10 * scale;
  const hy = footY - 43 * scale + pose.bobY;
  fillShadedRect(ctx, hx - 5 * scale, hy - 5 * scale, 14 * scale, 9 * scale, bodyColor);
  fillShadedRect(ctx, hx + 5 * scale, hy - 3 * scale, 9 * scale, 6 * scale, bodyColor);
  // Open roaring jaw on attack/cast
  if (pose.isAttackHit || pose.isCastPeak) {
    fillShadedRect(ctx, hx + 6 * scale, hy + 2 * scale, 8 * scale, 4 * scale, '#dc2626', false);
    fillShadedRect(ctx, hx + 11 * scale, hy + 1 * scale, 4 * scale, 4 * scale, '#fef08a', false);
  }
  // Golden dragon horns
  drawPixelLine(ctx, hx - 1 * scale, hy - 5 * scale, hx - 6 * scale, hy - 14 * scale, '#fde047', 2 * scale);
  drawPixelLine(ctx, hx + 3 * scale, hy - 5 * scale, hx + 1 * scale, hy - 14 * scale, '#fde047', 2 * scale);
  // Flowing golden whiskers
  drawPixelLine(ctx, hx + 10 * scale, hy + 1 * scale, hx + 17 * scale, hy + 6 * scale + wave, '#fde047', 1.5 * scale);
  drawPixelLine(ctx, hx + 10 * scale, hy - 1 * scale, hx + 16 * scale, hy - 6 * scale - wave, '#fde047', 1.5 * scale);
  // Glowing crimson eye
  ctx.fillStyle = '#fef08a';
  ctx.fillRect(Math.round(hx + 4 * scale), Math.round(hy - 3 * scale), Math.max(2, Math.round(3 * scale)), Math.max(2, Math.round(2 * scale)));
  ctx.fillStyle = '#ef4444';
  ctx.fillRect(Math.round(hx + 5 * scale), Math.round(hy - 3 * scale), Math.max(1, Math.round(2 * scale)), Math.max(2, Math.round(2 * scale)));
}

/**
 * Special Giant Silhouette #2: Saint Saturn Ushi-Oni (Gyuki) — 6 spider legs, bull horns, white beard, black cloud sash.
 */
function drawSpiderDemonCharacter(
  ctx: CanvasRenderingContext2D,
  fw: number,
  fh: number,
  _bp: CharacterBlueprint,
  pose: FramePose
): void {
  const cx = Math.round(fw * 0.5) + pose.shiftX;
  const footY = Math.round(fh * 0.86);
  const s = fw / 64;

  // 6 articulated venom spider legs
  const legSpread = [-20, -13, -6, 6, 13, 20];
  for (let i = 0; i < legSpread.length; i++) {
    const dir = legSpread[i] < 0 ? -1 : 1;
    const kneeX = cx + legSpread[i] * s;
    const stepLift = ((pose.hagoromoPhase + i) % 2 === 0 ? -2 : 0) * s;
    const kneeY = footY - 17 * s + stepLift;
    const tipX = kneeX + dir * 4 * s;
    drawPixelLine(ctx, cx + dir * 5 * s, footY - 13 * s, kneeX, kneeY, '#4c1d95', 3 * s);
    drawPixelLine(ctx, kneeX, kneeY, tipX, footY + stepLift * 0.5, '#3b0764', 2.5 * s);
    ctx.fillStyle = '#dc2626';
    ctx.fillRect(Math.round(tipX - s), Math.round(footY - 2 * s + stepLift * 0.5), Math.max(2, Math.round(2 * s)), Math.max(2, Math.round(3 * s)));
  }

  // Lower spider carapace & demonic upper torso
  drawPixelEllipse(ctx, cx, footY - 14 * s, 14 * s, 7 * s, '#3b0764');
  fillShadedRect(ctx, cx - 10 * s, footY - 34 * s + pose.bobY, 20 * s, 18 * s, '#4c1d95');

  // Head + white dreads + long white beard + giant bull horns
  const headY = footY - 45 * s + pose.bobY;
  fillShadedRect(ctx, cx - 7 * s, headY, 14 * s, 11 * s, '#f1f5f9');
  fillShadedRect(ctx, cx - 8 * s, headY + 7 * s, 16 * s, 8 * s, '#e2e8f0');
  drawPixelLine(ctx, cx - 6 * s, headY + 2 * s, cx - 16 * s, headY - 9 * s, '#f8fafc', 3 * s);
  drawPixelLine(ctx, cx + 6 * s, headY + 2 * s, cx + 16 * s, headY - 9 * s, '#f8fafc', 3 * s);
  // Crimson glowing eyes
  ctx.fillStyle = '#ef4444';
  ctx.fillRect(Math.round(cx - 4 * s), Math.round(headY + 4 * s), Math.max(2, Math.round(3 * s)), Math.max(2, Math.round(2 * s)));
  ctx.fillRect(Math.round(cx + 2 * s), Math.round(headY + 4 * s), Math.max(2, Math.round(3 * s)), Math.max(2, Math.round(2 * s)));

  // Flowing Black Awakening Hagoromo Cloud Sash
  drawHagoromoSashInFrame(ctx, cx, footY - 30 * s + pose.bobY, 15 * s, 'black', pose.hagoromoPhase);
}

/**
 * Special Silhouette #3: Iron Pirate General Franky Mecha.
 */
function drawMechCharacter(
  ctx: CanvasRenderingContext2D,
  fw: number,
  fh: number,
  bp: CharacterBlueprint,
  pose: FramePose
): void {
  const cx = Math.round(fw * 0.5) + pose.shiftX;
  const footY = Math.round(fh * 0.86);
  const s = fw / 48;

  // Heavy mecha legs
  fillShadedRect(ctx, cx - 10 * s, footY - 12 * s, 7 * s, 12 * s, '#334155');
  fillShadedRect(ctx, cx + 3 * s, footY - 12 * s, 7 * s, 12 * s, '#334155');
  // Broad golden/blue armored chassis
  fillShadedRect(ctx, cx - 13 * s, footY - 30 * s + pose.bobY, 26 * s, 19 * s, bp.torsoColor);
  fillShadedRect(ctx, cx - 9 * s, footY - 27 * s + pose.bobY, 18 * s, 12 * s, bp.pantsColor);
  // Giant red BF-38 shoulder domes
  drawPixelEllipse(ctx, cx - 14 * s, footY - 27 * s + pose.bobY, 5.5 * s, 5.5 * s, '#dc2626');
  drawPixelEllipse(ctx, cx + 14 * s, footY - 27 * s + pose.bobY, 5.5 * s, 5.5 * s, '#dc2626');
  // Glowing cyan Radical Beam chest core
  fillShadedRect(ctx, cx - 3 * s, footY - 23 * s + pose.bobY, 6 * s, 6 * s, '#38bdf8');
  // Mecha head & cyan visor
  fillShadedRect(ctx, cx - 5 * s, footY - 37 * s + pose.bobY, 10 * s, 8 * s, '#0f172a');
  ctx.fillStyle = '#38bdf8';
  ctx.fillRect(Math.round(cx - 3 * s), Math.round(footY - 34 * s + pose.bobY), Math.round(7 * s), Math.max(2, Math.round(2 * s)));
  // Franken Sword on right arm
  drawPixelLine(
    ctx,
    cx + 14 * s,
    footY - 22 * s + pose.bobY,
    cx + (20 + pose.armSwing * 3) * s,
    footY - (33 - pose.armSwing * 4) * s + pose.bobY,
    '#e2e8f0',
    2.5 * s
  );
}

function drawHagoromoSashInFrame(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  radius: number,
  color: 'white' | 'black',
  phase: number
): void {
  const fill = color === 'white' ? '#ffffff' : '#111827';
  const rim = color === 'white' ? '#cbd5e1' : '#a855f7';
  const bob = (phase % 2 === 0 ? -1 : 1);

  const pts = [
    { a: Math.PI * 0.88, r: 1.0 },
    { a: Math.PI * 1.15, r: 1.05 },
    { a: Math.PI * 1.5, r: 1.12 },
    { a: Math.PI * 1.85, r: 1.05 },
    { a: Math.PI * 2.12, r: 1.0 }
  ];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const px = cx + Math.cos(p.a) * radius * p.r;
    const py = cy + Math.sin(p.a) * radius * 0.72 + (i % 2 === 0 ? bob : -bob);
    drawPixelEllipse(ctx, px, py, Math.max(2, radius * 0.24), Math.max(2, radius * 0.2), rim);
    drawPixelEllipse(ctx, px, py, Math.max(1.5, radius * 0.17), Math.max(1.5, radius * 0.14), fill);
  }
}

/**
 * 2.5-Head Anime Proportion Layered Pixel Character Renderer (48x48 / 64x64 / 112x112).
 * Draws layered anatomy: Back Cape -> Legs (4-frame walk) -> Torso -> Head/Hair/Hat -> Face -> Weapon -> Hagoromo.
 */
function drawLayeredHumanoidFrame(
  ctx: CanvasRenderingContext2D,
  fw: number,
  fh: number,
  bp: CharacterBlueprint,
  pose: FramePose
): void {
  const s = fw / 48; // 1.0 for 48px, 1.33 for 64px, 2.33 for 112px
  const cx = Math.round(fw * 0.5) + Math.round(pose.shiftX * s);
  const footY = Math.round(fh * 0.86);

  const widthMult =
    bp.bodyType === 'giant'
      ? 1.28
      : bp.bodyType === 'bulky'
        ? 1.2
        : bp.bodyType === 'small'
          ? 0.82
          : 1.0;
  const heightMult =
    bp.bodyType === 'giant'
      ? 1.12
      : bp.bodyType === 'tall'
        ? 1.06
        : bp.bodyType === 'small'
          ? 0.82
          : 1.0;

  const legH = Math.round(10 * s * heightMult);
  const torsoH = Math.round(11 * s * heightMult);
  const torsoW = Math.round(12 * s * widthMult);
  const headW = Math.round(11 * s * (bp.bodyType === 'small' ? 0.95 : 1.0));
  const headH = Math.round(10 * s * (bp.bodyType === 'small' ? 0.95 : 1.0));

  const bodyOffsetY = Math.round((pose.bobY + pose.crouchY) * s);
  const hipY = footY - legH + bodyOffsetY;
  const shoulderY = hipY - torsoH;
  const headY = shoulderY - headH + Math.round(1 * s);
  const sway = Math.round(pose.capeSway * s);

  if (pose.isDowned) {
    // Crisp horizontal knocked-down silhouette near footY
    fillShadedRect(ctx, cx - 12 * s, footY - 6 * s, 16 * s, 6 * s, bp.torsoColor);
    fillShadedRect(ctx, cx - 17 * s, footY - 7 * s, 7 * s, 7 * s, bp.skin);
    fillShadedRect(ctx, cx + 4 * s, footY - 5 * s, 9 * s, 5 * s, bp.pantsColor);
    return;
  }

  // === LAYER 1: BACK CAPE / ADMIRAL JUSTICE COAT / WINGS / TAIL / SCABBARDS ===
  if (bp.capeStyle === 'admiral_justice') {
    // Flowing white Marine Admiral coat draped over shoulders with blue "정의" back stripes
    fillShadedRect(
      ctx,
      cx - torsoW * 0.85 - sway,
      shoulderY - 1 * s,
      torsoW * 1.45 + sway,
      torsoH + legH * 0.72,
      '#f8fafc'
    );
    ctx.fillStyle = '#1d4ed8';
    ctx.fillRect(
      Math.round(cx - torsoW * 0.75 - sway),
      Math.round(shoulderY + torsoH + 2 * s),
      Math.round(torsoW * 1.2),
      Math.max(2, Math.round(2 * s))
    );
    // Golden epaulettes on shoulders
    fillShadedRect(ctx, cx - torsoW * 0.78, shoulderY - 1 * s, 4 * s, 3 * s, '#facc15');
    fillShadedRect(ctx, cx + torsoW * 0.42, shoulderY - 1 * s, 4 * s, 3 * s, '#facc15');
  } else if (bp.capeStyle === 'flamingo_fur') {
    // Iconic voluminous pink flamingo feather coat
    drawPixelEllipse(ctx, cx - 1 * s - sway * 0.5, shoulderY + torsoH * 0.55, torsoW * 0.95, torsoH * 0.9, '#ec4899');
    drawPixelEllipse(ctx, cx - 3 * s - sway * 0.6, shoulderY + torsoH * 0.35, torsoW * 0.65, torsoH * 0.45, '#f472b6');
  } else if (bp.capeStyle === 'purple_fur_cape' || bp.capeStyle === 'dark_fur' || bp.capeStyle === 'red_cape') {
    const cCol =
      bp.capeStyle === 'purple_fur_cape'
        ? '#6b21a8'
        : bp.capeStyle === 'red_cape'
          ? '#b91c1c'
          : '#18181b';
    fillShadedRect(
      ctx,
      cx - torsoW * 0.82 - sway,
      shoulderY,
      torsoW * 1.4 + sway,
      torsoH + legH * 0.65,
      cCol
    );
  } else if (bp.capeStyle === 'wings_black' || bp.capeStyle === 'phoenix_wings') {
    const wCol = bp.capeStyle === 'phoenix_wings' ? '#0ea5e9' : '#111827';
    const wHi = bp.capeStyle === 'phoenix_wings' ? '#7dd3fc' : '#334155';
    const flap = pose.hagoromoPhase % 2 === 0 ? -2 * s : 2 * s;
    drawPixelEllipse(ctx, cx - torsoW * 0.95, shoulderY + 4 * s + flap, 6 * s, 9 * s, wCol);
    drawPixelEllipse(ctx, cx + torsoW * 0.95, shoulderY + 4 * s - flap, 6 * s, 9 * s, wCol);
    drawPixelEllipse(ctx, cx - torsoW * 0.9, shoulderY + 3 * s + flap, 3 * s, 5 * s, wHi);
    drawPixelEllipse(ctx, cx + torsoW * 0.9, shoulderY + 3 * s - flap, 3 * s, 5 * s, wHi);
  } else if (bp.capeStyle === 'leopard_tail' || bp.capeStyle === 'dragon_tail') {
    const tCol = bp.capeStyle === 'dragon_tail' ? '#0284c7' : '#f59e0b';
    drawPixelLine(
      ctx,
      cx - torsoW * 0.45,
      hipY + 1 * s,
      cx - torsoW * 1.15 - sway,
      hipY - 4 * s + sway,
      tCol,
      2.5 * s
    );
  } else if (bp.capeStyle === 'three_scabbards') {
    // Zoro's 3 sword scabbards strapped at left hip
    drawPixelLine(ctx, cx - torsoW * 0.5, hipY - 1 * s, cx - torsoW * 1.15, hipY + 3 * s, '#111827', 2 * s);
    drawPixelLine(ctx, cx - torsoW * 0.5, hipY + 1 * s, cx - torsoW * 1.15, hipY + 5 * s, '#991b1b', 2 * s);
    drawPixelLine(ctx, cx - torsoW * 0.5, hipY - 3 * s, cx - torsoW * 1.1, hipY + 1 * s, '#f8fafc', 1.8 * s);
  } else if (bp.capeStyle === 'thunder_drums') {
    // Enel's floating tomoe thunder drum ring behind back
    for (let i = 0; i < 4; i++) {
      const ang = Math.PI * (0.9 + i * 0.4);
      const dx = cx + Math.cos(ang) * 12 * s;
      const dy = shoulderY + 2 * s + Math.sin(ang) * 10 * s;
      drawPixelEllipse(ctx, dx, dy, 2.5 * s, 2.5 * s, '#facc15');
    }
  } else if (bp.capeStyle === 'zeus_cloud') {
    drawPixelEllipse(ctx, cx - 12 * s, headY + 2 * s + pose.bobY, 4.5 * s, 3 * s, '#f8fafc');
    ctx.fillStyle = '#facc15';
    ctx.fillRect(Math.round(cx - 13 * s), Math.round(headY + 4 * s + pose.bobY), Math.max(2, Math.round(2 * s)), Math.max(2, Math.round(2 * s)));
  } else if (bp.capeStyle === 'mochi_donuts') {
    drawPixelEllipse(ctx, cx - 13 * s, shoulderY - 2 * s, 4 * s, 4 * s, '#e879f9');
    drawPixelEllipse(ctx, cx - 13 * s, shoulderY - 2 * s, 1.5 * s, 1.5 * s, '#0f172a');
  } else if (bp.capeStyle === 'petals') {
    ctx.fillStyle = '#f472b6';
    ctx.fillRect(Math.round(cx - 14 * s), Math.round(shoulderY + sway), Math.max(2, Math.round(2.5 * s)), Math.max(2, Math.round(2.5 * s)));
    ctx.fillRect(Math.round(cx + 12 * s), Math.round(headY + 4 * s - sway), Math.max(2, Math.round(2.5 * s)), Math.max(2, Math.round(2.5 * s)));
  } else if (bp.capeStyle === 'room_ring') {
    ctx.strokeStyle = 'rgba(34, 211, 238, 0.55)';
    ctx.lineWidth = Math.max(1, Math.round(1.5 * s));
    ctx.beginPath();
    ctx.arc(cx, shoulderY + 4 * s, 15 * s, 0, Math.PI * 2);
    ctx.stroke();
  }

  // === LAYER 2: LEGS & SHOES (4-FRAME WALK CYCLE + SANJI DIABLE JAMBE FLAME) ===
  const stridePx = Math.round(pose.legStride * 1.5 * s);
  const legW = Math.max(3, Math.round(4 * s * widthMult));
  const leftLegX = cx - Math.round(torsoW * 0.36) - Math.round(stridePx * 0.5);
  const rightLegX = cx + Math.round(torsoW * 0.08) + Math.round(stridePx * 0.5);

  fillShadedRect(ctx, leftLegX, hipY, legW, legH - Math.round(2 * s), bp.pantsColor);
  fillShadedRect(ctx, rightLegX, hipY, legW, legH - Math.round(2 * s), bp.pantsColor);
  // Boots / Sandals
  fillShadedRect(ctx, leftLegX - 1 * s, footY - Math.round(3 * s), legW + 1 * s, Math.round(3 * s), bp.shoesColor);
  fillShadedRect(ctx, rightLegX, footY - Math.round(3 * s), legW + 1.5 * s, Math.round(3 * s), bp.shoesColor);

  // Sanji Diable / Ifrit Jambe flaming kick leg
  if (bp.weaponStyle === 'kick_flame') {
    drawPixelEllipse(ctx, rightLegX + legW * 0.7, footY - 4 * s, 4.5 * s, 5.5 * s, '#f97316');
    drawPixelEllipse(ctx, rightLegX + legW * 0.7, footY - 4 * s, 2.5 * s, 3.5 * s, '#fde047');
  }

  // === LAYER 3: TORSO & ICONIC OUTFIT ===
  const torsoX = cx - Math.round(torsoW * 0.5) + Math.round(pose.leanForward * s);
  fillShadedRect(ctx, torsoX, shoulderY, torsoW, torsoH, bp.torsoColor);

  if (bp.torsoStyle === 'open_cardigan_scar') {
    // Open chest showing skin + Luffy's iconic X-shaped chest scar
    fillShadedRect(ctx, torsoX + torsoW * 0.28, shoulderY + 1 * s, torsoW * 0.44, torsoH - 2 * s, bp.skin, false);
    drawPixelLine(ctx, torsoX + torsoW * 0.36, shoulderY + 3 * s, torsoX + torsoW * 0.64, shoulderY + 7 * s, '#b45309', 1 * s);
    drawPixelLine(ctx, torsoX + torsoW * 0.64, shoulderY + 3 * s, torsoX + torsoW * 0.36, shoulderY + 7 * s, '#b45309', 1 * s);
  } else if (bp.torsoStyle === 'suit_tie' || bp.torsoStyle === 'striped_suit') {
    if (bp.torsoStyle === 'striped_suit') {
      ctx.fillStyle = shadeHueShift(bp.torsoColor, -1);
      for (let sx = torsoX + 2 * s; sx < torsoX + torsoW - 1 * s; sx += 3 * s) {
        ctx.fillRect(Math.round(sx), Math.round(shoulderY), Math.max(1, Math.round(s)), torsoH);
      }
    }
    // Shirt collar & tie
    fillShadedRect(ctx, torsoX + torsoW * 0.34, shoulderY, torsoW * 0.32, torsoH * 0.55, '#f8fafc', false);
    fillShadedRect(ctx, torsoX + torsoW * 0.44, shoulderY + 1 * s, torsoW * 0.14, torsoH * 0.6, bp.sashColor, false);
  } else if (bp.torsoStyle === 'samurai_coat' || bp.torsoStyle === 'kimono') {
    // Diagonal kimono/samurai lapel
    drawPixelLine(ctx, torsoX + 2 * s, shoulderY + 1 * s, torsoX + torsoW - 2 * s, shoulderY + torsoH - 2 * s, shadeHueShift(bp.torsoColor, -2), 1.5 * s);
  } else if (bp.torsoStyle === 'leopard_spots') {
    ctx.fillStyle = '#111827';
    ctx.fillRect(Math.round(torsoX + 2 * s), Math.round(shoulderY + 2 * s), Math.max(2, Math.round(2 * s)), Math.max(2, Math.round(2 * s)));
    ctx.fillRect(Math.round(torsoX + torsoW - 4 * s), Math.round(shoulderY + 4 * s), Math.max(2, Math.round(2 * s)), Math.max(2, Math.round(2 * s)));
    ctx.fillRect(Math.round(torsoX + 4 * s), Math.round(shoulderY + 7 * s), Math.max(2, Math.round(2 * s)), Math.max(2, Math.round(2 * s)));
  } else if (bp.torsoStyle === 'striped_pirate') {
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(Math.round(torsoX + 2 * s), Math.round(shoulderY + 3 * s), Math.round(torsoW - 4 * s), Math.max(1, Math.round(2 * s)));
    ctx.fillRect(Math.round(torsoX + 2 * s), Math.round(shoulderY + 7 * s), Math.round(torsoW - 4 * s), Math.max(1, Math.round(2 * s)));
  } else if (bp.torsoStyle === 'law_coat') {
    // Golden Heart Pirates emblem on Law's coat
    drawPixelEllipse(ctx, torsoX + torsoW * 0.52, shoulderY + torsoH * 0.55, 2.5 * s, 2.5 * s, '#facc15');
  }

  // Waist Sash / Haramaki / Belt
  fillShadedRect(ctx, torsoX - 0.5 * s, hipY - Math.round(3 * s), torsoW + 1 * s, Math.round(3 * s), bp.sashColor);

  // Franky oversized blue cyborg forearms
  if (bp.capeStyle === 'cyborg_arms') {
    fillShadedRect(ctx, torsoX - 5 * s, shoulderY + 2 * s, 5 * s, 8 * s, '#38bdf8');
    fillShadedRect(ctx, torsoX + torsoW, shoulderY + 1 * s, 6 * s, 9 * s, '#38bdf8');
  }

  // === LAYER 4: HEAD, HAIRSTYLE & ICONIC HAT ===
  const headX = cx - Math.round(headW * 0.5) + Math.round(pose.leanForward * s);
  fillShadedRect(ctx, headX, headY, headW, headH, bp.skin);

  // Hair rendering
  if (bp.hairStyle === 'nika_flame' || bp.hairStyle === 'flame_black') {
    drawPixelEllipse(ctx, cx + pose.leanForward * s, headY + 1 * s, headW * 0.72, 4.5 * s, bp.hairColor);
    drawPixelEllipse(ctx, headX - 1 * s, headY + 3 * s, 3 * s, 3 * s, bp.hairColor);
    drawPixelEllipse(ctx, headX + headW + 1 * s, headY + 2 * s, 3 * s, 3 * s, bp.hairColor);
    // Flowing flame tips
    ctx.fillStyle = bp.hairColor;
    ctx.fillRect(Math.round(headX + 2 * s), Math.round(headY - 4 * s), Math.round(3 * s), Math.round(4 * s));
    ctx.fillRect(Math.round(headX + 6 * s), Math.round(headY - 5 * s), Math.round(3 * s), Math.round(5 * s));
  } else if (bp.hairStyle === 'afro') {
    drawPixelEllipse(ctx, cx, headY - 2 * s, headW * 0.85, headH * 0.65, bp.hairColor);
  } else if (bp.hairStyle === 'pompadour') {
    fillShadedRect(ctx, headX - 1 * s, headY - 4 * s, headW + 4 * s, 5 * s, bp.hairColor);
  } else if (bp.hairStyle === 'long_flowing' || bp.hairStyle === 'long_straight') {
    fillShadedRect(ctx, headX - 2 * s, headY - 1 * s, headW + 3 * s, 4 * s, bp.hairColor);
    fillShadedRect(ctx, headX - 2 * s, headY + 2 * s, 3 * s, headH + 4 * s, bp.hairColor);
  } else if (bp.hairStyle === 'sanji_bangs') {
    fillShadedRect(ctx, headX - 1 * s, headY - 2 * s, headW + 2 * s, 4 * s, bp.hairColor);
    // Golden bang sweeping over one eye
    fillShadedRect(ctx, headX + 1 * s, headY + 2 * s, 4 * s, 4 * s, bp.hairColor, false);
  } else if (bp.hairStyle === 'pineapple') {
    fillShadedRect(ctx, headX + 1 * s, headY - 4 * s, headW - 2 * s, 5 * s, bp.hairColor);
  } else if (bp.hairStyle === 'kaido_mane_horns') {
    fillShadedRect(ctx, headX - 3 * s, headY - 1 * s, headW + 6 * s, 5 * s, bp.hairColor);
    fillShadedRect(ctx, headX - 4 * s, headY + 3 * s, 4 * s, 11 * s, bp.hairColor);
  } else if (bp.hairStyle === 'blueno_horns') {
    fillShadedRect(ctx, headX - 2 * s, headY - 4 * s, 3 * s, 6 * s, bp.hairColor);
    fillShadedRect(ctx, headX + headW - 1 * s, headY - 4 * s, 3 * s, 6 * s, bp.hairColor);
    fillShadedRect(ctx, headX, headY - 1 * s, headW, 3 * s, bp.hairColor);
  } else if (bp.hairStyle === 'reindeer_antlers') {
    drawPixelLine(ctx, headX - 1 * s, headY, headX - 5 * s, headY - 5 * s, bp.hairColor, 1.8 * s);
    drawPixelLine(ctx, headX + headW + 1 * s, headY, headX + headW + 5 * s, headY - 5 * s, bp.hairColor, 1.8 * s);
  } else if (bp.hairStyle === 'topknot') {
    fillShadedRect(ctx, headX, headY - 1 * s, headW, 3 * s, bp.hairColor);
    fillShadedRect(ctx, cx - 2 * s, headY - 5 * s, 4 * s, 4 * s, bp.hairColor);
  } else if (bp.hairStyle === 'blackbeard_beard') {
    fillShadedRect(ctx, headX - 1 * s, headY + headH - 3 * s, headW + 2 * s, 5 * s, bp.hairColor);
  } else {
    fillShadedRect(ctx, headX - 1 * s, headY - 2 * s, headW + 2 * s, 4 * s, bp.hairColor);
  }

  // Iconic Hats & Horns
  if (bp.hatStyle === 'straw_hat') {
    fillShadedRect(ctx, headX - 4 * s, headY - 1 * s, headW + 8 * s, 3 * s, bp.hatColor ?? '#f4c542');
    fillShadedRect(ctx, headX - 1 * s, headY - 5 * s, headW + 2 * s, 4 * s, bp.hatColor ?? '#f4c542');
    ctx.fillStyle = bp.hatAccent ?? '#dc2626';
    ctx.fillRect(Math.round(headX - 1 * s), Math.round(headY - 2 * s), Math.round(headW + 2 * s), Math.max(1, Math.round(1.5 * s)));
  } else if (bp.hatStyle === 'chopper_hat') {
    fillShadedRect(ctx, headX - 2 * s, headY - 5 * s, headW + 4 * s, 6 * s, bp.hatColor ?? '#ec4899');
    // White X emblem
    drawPixelLine(ctx, cx - 2 * s, headY - 4 * s, cx + 2 * s, headY - 1 * s, '#ffffff', 1 * s);
    drawPixelLine(ctx, cx + 2 * s, headY - 4 * s, cx - 2 * s, headY - 1 * s, '#ffffff', 1 * s);
  } else if (bp.hatStyle === 'spotted_hat') {
    drawPixelEllipse(ctx, cx, headY - 2 * s, headW * 0.68, 4 * s, bp.hatColor ?? '#f8fafc');
    ctx.fillStyle = bp.hatAccent ?? '#0f172a';
    ctx.fillRect(Math.round(cx - 4 * s), Math.round(headY - 3 * s), Math.max(2, Math.round(2 * s)), Math.max(2, Math.round(2 * s)));
    ctx.fillRect(Math.round(cx + 2 * s), Math.round(headY - 2 * s), Math.max(2, Math.round(2 * s)), Math.max(2, Math.round(2 * s)));
  } else if (bp.hatStyle === 'top_hat') {
    fillShadedRect(ctx, headX - 2 * s, headY - 1 * s, headW + 4 * s, 2 * s, bp.hatColor ?? '#111827');
    fillShadedRect(ctx, headX + 1 * s, headY - 7 * s, headW - 2 * s, 6 * s, bp.hatColor ?? '#111827');
  } else if (bp.hatStyle === 'marine_cap') {
    fillShadedRect(ctx, headX - 1 * s, headY - 4 * s, headW + 4 * s, 4 * s, bp.hatColor ?? '#f8fafc');
    ctx.fillStyle = bp.hatAccent ?? '#1d4ed8';
    ctx.fillRect(Math.round(headX + 2 * s), Math.round(headY - 3 * s), Math.round(headW - 4 * s), Math.max(1, Math.round(1.5 * s)));
  } else if (bp.hatStyle === 'pirate_bicorne') {
    fillShadedRect(ctx, headX - 4 * s, headY - 5 * s, headW + 8 * s, 5 * s, bp.hatColor ?? '#111827');
    ctx.fillStyle = bp.hatAccent ?? '#facc15';
    ctx.fillRect(Math.round(cx - 2 * s), Math.round(headY - 4 * s), Math.round(4 * s), Math.round(3 * s));
  } else if (bp.hatStyle === 'bull_horns' || bp.hatStyle === 'viking_horns') {
    const hCol = bp.hatColor ?? '#f8fafc';
    drawPixelLine(ctx, headX, headY, headX - 6 * s, headY - 7 * s, hCol, 2.2 * s);
    drawPixelLine(ctx, headX + headW, headY, headX + headW + 6 * s, headY - 7 * s, hCol, 2.2 * s);
  } else if (bp.hatStyle === 'crown') {
    fillShadedRect(ctx, headX + 1 * s, headY - 6 * s, headW - 2 * s, 4 * s, bp.hatColor ?? '#facc15');
  } else if (bp.hatStyle === 'sniper_goggles' || bp.hatStyle === 'sleep_mask') {
    fillShadedRect(ctx, headX, headY - 2 * s, headW, 3 * s, bp.hatColor ?? '#38bdf8');
  } else if (bp.hatStyle === 'bandana_black' || bp.hatStyle === 'white_bandana') {
    fillShadedRect(ctx, headX - 1 * s, headY - 2 * s, headW + 2 * s, 3 * s, bp.hatColor ?? '#0f172a');
  }

  // === LAYER 5: FACE DETAILS (EYES, SCARS, SUNGLASSES, NOSES, BANDAGES) ===
  const eyeY = Math.round(headY + headH * 0.42);
  if (bp.eyeStyle === 'amber_shades' || bp.eyeStyle === 'crimson_shades' || bp.eyeStyle === 'cool_shades') {
    const gCol =
      bp.eyeStyle === 'crimson_shades'
        ? '#ef4444'
        : bp.eyeStyle === 'amber_shades'
          ? '#f59e0b'
          : '#0f172a';
    fillShadedRect(ctx, headX + 2 * s, eyeY - 1 * s, headW - 2 * s, 3 * s, gCol);
  } else if (bp.eyeStyle === 'eye_bandage') {
    fillShadedRect(ctx, headX, eyeY - 1 * s, headW, 3 * s, '#f8fafc');
  } else if (bp.eyeStyle === 'skull') {
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(Math.round(headX + 3 * s), eyeY, Math.max(2, Math.round(2 * s)), Math.max(2, Math.round(2.5 * s)));
    ctx.fillRect(Math.round(headX + headW - 4 * s), eyeY, Math.max(2, Math.round(2 * s)), Math.max(2, Math.round(2.5 * s)));
  } else {
    const eCol = bp.eyeStyle === 'nika_red' || bp.eyeStyle === 'glowing_red' ? '#ef4444' : '#0f172a';
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(Math.round(headX + headW - 5 * s), eyeY, Math.max(2, Math.round(3 * s)), Math.max(2, Math.round(2 * s)));
    ctx.fillStyle = eCol;
    ctx.fillRect(Math.round(headX + headW - 4 * s), eyeY, Math.max(1, Math.round(2 * s)), Math.max(2, Math.round(2 * s)));
    if (bp.eyeStyle === 'luffy_scar') {
      ctx.fillStyle = '#991b1b';
      ctx.fillRect(Math.round(headX + headW - 4 * s), Math.round(eyeY + 3 * s), Math.max(2, Math.round(2 * s)), 1);
    } else if (bp.eyeStyle === 'zoro_scar') {
      ctx.fillStyle = '#7f1d1d';
      ctx.fillRect(Math.round(headX + 3 * s), Math.round(eyeY - 1 * s), 1, Math.max(3, Math.round(4 * s)));
    } else if (bp.eyeStyle === 'clown_nose') {
      drawPixelEllipse(ctx, headX + headW - 2 * s, eyeY + 2 * s, 2.2 * s, 2 * s, '#ef4444');
    } else if (bp.eyeStyle === 'long_nose' || bp.eyeStyle === 'saw_nose') {
      fillShadedRect(ctx, headX + headW, eyeY + 1 * s, 5 * s, 2 * s, bp.skin, false);
    } else if (bp.eyeStyle === 'blue_nose') {
      ctx.fillStyle = '#38bdf8';
      ctx.fillRect(Math.round(headX + headW - 2 * s), Math.round(eyeY + 2 * s), Math.max(2, Math.round(2 * s)), Math.max(2, Math.round(2 * s)));
    } else if (bp.eyeStyle === 'white_scarf') {
      fillShadedRect(ctx, headX - 1 * s, eyeY + 3 * s, headW + 2 * s, 4 * s, '#f8fafc');
    } else if (bp.eyeStyle === 'steel_jaw') {
      fillShadedRect(ctx, headX - 1 * s, eyeY + 3 * s, headW + 2 * s, 3.5 * s, '#94a3b8');
    }
  }

  // === LAYER 6: FRONT ARM & ICONIC WEAPON ===
  const handX = torsoX + torsoW + Math.round(pose.armSwing * 1.5 * s);
  const handY = shoulderY + Math.round(5 * s) - Math.round(pose.weaponRaise * 5 * s);
  const swingExtend = pose.isAttackHit ? 6 * s : 0;

  if (bp.weaponStyle === 'three_swords' || bp.weaponStyle === 'three_swords_koh') {
    const isKoh = bp.weaponStyle === 'three_swords_koh';
    const bladeCol = isKoh ? '#4ade80' : '#e2e8f0';
    drawPixelLine(ctx, handX, handY, handX + 11 * s + swingExtend, handY - 7 * s, bladeCol, 1.8 * s);
    drawPixelLine(ctx, handX - 2 * s, handY + 3 * s, handX + 10 * s + swingExtend, handY + 5 * s, '#cbd5e1', 1.5 * s);
    // Mouth sword (Wado Ichimonji)
    drawPixelLine(ctx, headX + headW, eyeY + 3 * s, headX + headW + 10 * s + swingExtend, eyeY + 1 * s, '#ffffff', 1.5 * s);
    if (isKoh) {
      drawPixelLine(ctx, handX + 3 * s, handY - 3 * s, handX + 13 * s, handY - 9 * s, '#ef4444', 1 * s);
    }
  } else if (bp.weaponStyle === 'kanabo') {
    drawPixelLine(ctx, handX - 2 * s, handY + 4 * s, handX + 10 * s + swingExtend, handY - 12 * s, '#334155', 4 * s);
    ctx.fillStyle = '#94a3b8';
    ctx.fillRect(Math.round(handX + 7 * s + swingExtend), Math.round(handY - 10 * s), Math.max(2, Math.round(2 * s)), Math.max(2, Math.round(2 * s)));
  } else if (bp.weaponStyle === 'light_sword') {
    drawPixelLine(ctx, handX, handY, handX + 12 * s + swingExtend, handY - 8 * s, '#fef08a', 3 * s);
    drawPixelLine(ctx, handX, handY, handX + 12 * s + swingExtend, handY - 8 * s, '#ffffff', 1.2 * s);
  } else if (bp.weaponStyle === 'magma_fist') {
    drawPixelEllipse(ctx, handX + 4 * s + swingExtend, handY, 5 * s, 5 * s, '#ea580c');
    drawPixelEllipse(ctx, handX + 4 * s + swingExtend, handY, 2.5 * s, 2.5 * s, '#fde047');
  } else if (bp.weaponStyle === 'ice_saber') {
    drawPixelLine(ctx, handX, handY, handX + 13 * s + swingExtend, handY - 7 * s, '#7dd3fc', 2.5 * s);
    drawPixelLine(ctx, handX, handY, handX + 13 * s + swingExtend, handY - 7 * s, '#ffffff', 1 * s);
  } else if (bp.weaponStyle === 'kikoku' || bp.weaponStyle === 'cane_sword' || bp.weaponStyle === 'twin_swords' || bp.weaponStyle === 'yoru_blade' || bp.weaponStyle === 'flame_sword') {
    const col =
      bp.weaponStyle === 'flame_sword'
        ? '#f97316'
        : bp.weaponStyle === 'yoru_blade'
          ? '#22c55e'
          : bp.weaponStyle === 'cane_sword'
            ? '#38bdf8'
            : '#e2e8f0';
    drawPixelLine(ctx, handX - 1 * s, handY + 2 * s, handX + 13 * s + swingExtend, handY - 10 * s, col, 2 * s);
  } else if (bp.weaponStyle === 'trident' || bp.weaponStyle === 'battle_spear' || bp.weaponStyle === 'golden_staff' || bp.weaponStyle === 'clima_tact' || bp.weaponStyle === 'seastone_jitte') {
    const col =
      bp.weaponStyle === 'golden_staff' || bp.weaponStyle === 'battle_spear'
        ? '#facc15'
        : bp.weaponStyle === 'clima_tact'
          ? '#38bdf8'
          : '#cbd5e1';
    drawPixelLine(ctx, handX - 2 * s, handY + 8 * s, handX + 9 * s + swingExtend, handY - 12 * s, col, 2 * s);
  } else if (bp.weaponStyle === 'ragnir_hammer') {
    drawPixelLine(ctx, handX, handY + 6 * s, handX + 9 * s + swingExtend, handY - 9 * s, '#94a3b8', 2.2 * s);
    fillShadedRect(ctx, handX + 5 * s + swingExtend, handY - 14 * s, 9 * s, 7 * s, '#38bdf8');
  } else if (bp.weaponStyle === 'axe_arm' || bp.weaponStyle === 'kiribachi') {
    fillShadedRect(ctx, handX, handY - 7 * s, 7 * s + swingExtend * 0.5, 13 * s, '#cbd5e1');
  } else if (bp.weaponStyle === 'slingshot') {
    drawPixelLine(ctx, handX, handY + 3 * s, handX + 5 * s, handY - 6 * s, '#22c55e', 2 * s);
    drawPixelLine(ctx, handX + 5 * s, handY - 6 * s, handX + 9 * s, handY - 10 * s, '#4ade80', 1.5 * s);
  } else if (bp.weaponStyle === 'gold_hook') {
    fillShadedRect(ctx, handX, handY - 2 * s, 5 * s, 5 * s, '#facc15');
    drawPixelLine(ctx, handX + 4 * s, handY - 2 * s, handX + 7 * s, handY - 6 * s, '#fde047', 1.5 * s);
  } else if (bp.weaponStyle === 'dark_quake') {
    // Blackbeard: left hand Darkness vortex, right hand White Quake sphere
    drawPixelEllipse(ctx, torsoX - 4 * s, handY, 4.5 * s, 4.5 * s, '#7e22ce');
    drawPixelEllipse(ctx, handX + 4 * s + swingExtend, handY, 4.5 * s, 4.5 * s, '#e0f2fe');
  } else if (bp.weaponStyle === 'string_threads') {
    drawPixelLine(ctx, handX, handY, handX + 11 * s + swingExtend, handY - 4 * s, '#fda4af', 1.2 * s);
    drawPixelLine(ctx, handX, handY + 2 * s, handX + 11 * s + swingExtend, handY + 3 * s, '#f43f5e', 1.2 * s);
  } else {
    // Stretched/impact fist on melee attack (Luffy rubber punch, Jinbe karate, etc.)
    const fistR = pose.isAttackHit ? 3.5 * s : 2.2 * s;
    drawPixelEllipse(ctx, handX + swingExtend, handY, fistR, fistR, bp.skin);
  }

  // === LAYER 7: FLOWING HAGOROMO CLOUD SASH (GEAR 5 / AWAKENED LUCCI / KAIDO HYBRID) ===
  if (bp.hagoromoColor) {
    drawHagoromoSashInFrame(
      ctx,
      cx,
      shoulderY + 2 * s,
      12 * s * widthMult,
      bp.hagoromoColor,
      pose.hagoromoPhase
    );
  }
}

/**
 * Bakes a high-resolution (48x48 / 64x64 / 112x112 per cell) 6x11 GBA/NDS pixel-art sprite sheet
 * using character_blueprints.json, Hue-Shifted 3-step cel shading, and 1px tinted dark outlines.
 */
export function bakeProceduralUnitSpriteSheet(
  entry: SpriteSheetManifestEntry,
  unitDef: UnitDefinition,
  formDef: FormDefinition | null,
  _legacyAvatarCanvas?: HTMLCanvasElement | null
): HTMLCanvasElement | null {
  if (typeof document === 'undefined') {
    return null;
  }

  const fw = resolveBakedFrameSize(entry.frameWidth);
  const fh = resolveBakedFrameSize(entry.frameHeight);
  const sheet = document.createElement('canvas');
  sheet.width = fw * SHEET_COLUMNS;
  sheet.height = fh * SHEET_ROWS;
  const ctx = sheet.getContext('2d');
  if (!ctx) return sheet;

  ctx.imageSmoothingEnabled = false;

  const bp = resolveCharacterBlueprint(unitDef, formDef?.id ?? null);
  const auraColor = formDef?.auraColor ?? bp.auraAccent;

  const cell = document.createElement('canvas');
  cell.width = fw;
  cell.height = fh;
  const cctx = cell.getContext('2d')!;
  cctx.imageSmoothingEnabled = false;

  for (const state of STANDARD_SPRITE_ANIM_STATES) {
    const clip = entry.animations[state];
    const row = clip.row;
    const frameCount = Math.min(SHEET_COLUMNS, Math.max(1, clip.frames));

    for (let f = 0; f < frameCount; f++) {
      cctx.clearRect(0, 0, fw, fh);
      const pose = computePose(state, f, frameCount, clip.hitFrame);

      // Character sprite rendered onto clean transparent cell first so 1px tinted outline wraps cleanly
      if (bp.bodyType === 'serpent_dragon') {
        drawSerpentDragonCharacter(cctx, fw, fh, bp, pose);
      } else if (bp.bodyType === 'spider_demon') {
        drawSpiderDemonCharacter(cctx, fw, fh, bp, pose);
      } else if (bp.bodyType === 'mech') {
        drawMechCharacter(cctx, fw, fh, bp, pose);
      } else {
        drawLayeredHumanoidFrame(cctx, fw, fh, bp, pose);
      }

      // Apply authentic 1px Hue-Shifted Colored Dark Pixel Outline around the character
      applyTintedPixelOutline(cctx, fw, fh);

      // Draw translucent ground shadow behind character (destination-over)
      cctx.save();
      cctx.globalCompositeOperation = 'destination-over';
      drawPixelEllipse(
        cctx,
        fw * 0.5,
        fh * 0.87,
        fw * (bp.bodyType === 'serpent_dragon' || bp.bodyType === 'spider_demon' ? 0.34 : 0.24),
        Math.max(2, fh * 0.05),
        'rgba(8, 12, 24, 0.42)'
      );
      cctx.restore();

      // Action-specific crisp pixel VFX accents inside cell
      if (state === 'ATTACK_MELEE' && f >= 1) {
        cctx.fillStyle = pose.isAttackHit ? '#ffffff' : auraColor;
        const arcX = Math.round(fw * 0.66);
        const arcY = Math.round(fh * (0.28 + (f - 1) * 0.1));
        cctx.fillRect(arcX, arcY, Math.round(fw * 0.24), Math.max(2, Math.round(fh * 0.06)));
      } else if (state === 'ATTACK_CAST' && pose.isCastPeak) {
        drawPixelEllipse(cctx, fw * 0.78, fh * 0.48, fw * 0.1, fw * 0.1, auraColor);
        drawPixelEllipse(cctx, fw * 0.78, fh * 0.48, fw * 0.05, fw * 0.05, '#ffffff');
      } else if (state === 'TRANSFORM') {
        cctx.save();
        cctx.globalAlpha = 0.38;
        cctx.fillStyle = auraColor;
        const pillarW = Math.round(fw * (0.22 + pose.transformT * 0.24));
        cctx.fillRect(Math.round((fw - pillarW) * 0.5), Math.round(fh * 0.08), pillarW, Math.round(fh * 0.8));
        cctx.restore();
      } else if (state === 'DODGE') {
        cctx.fillStyle = 'rgba(56, 189, 248, 0.78)';
        for (let l = 0; l < 3; l++) {
          cctx.fillRect(Math.round(fw * 0.06), Math.round(fh * (0.32 + l * 0.16)), Math.round(fw * 0.2), Math.max(1, Math.round(fh * 0.03)));
        }
      } else if (state === 'VICTORY') {
        cctx.fillStyle = '#fde047';
        cctx.fillRect(Math.round(fw * (0.2 + (f % 3) * 0.28)), Math.round(fh * 0.12), Math.max(2, Math.round(fw * 0.05)), Math.max(2, Math.round(fw * 0.05)));
      }

      ctx.drawImage(cell, f * fw, row * fh);
    }
  }

  return sheet;
}

/**
 * Bakes multi-frame pixel ship sheets (Going Merry, Thousand Sunny, Marine Warship, Sea King)
 * with shaded wooden hulls, billowing sails, figureheads, and 1px tinted pixel outlines.
 */
export function bakeProceduralShipSpriteSheet(
  entry: SpriteSheetManifestEntry
): HTMLCanvasElement | null {
  if (typeof document === 'undefined') {
    return null;
  }

  const fw = resolveBakedFrameSize(entry.frameWidth);
  const fh = resolveBakedFrameSize(entry.frameHeight);
  const sheet = document.createElement('canvas');
  sheet.width = fw * SHEET_COLUMNS;
  sheet.height = fh * SHEET_ROWS;
  const ctx = sheet.getContext('2d');
  if (!ctx) return sheet;
  ctx.imageSmoothingEnabled = false;

  const shipId = entry.shipId ?? 'going_merry';
  const hullColor =
    shipId === 'thousand_sunny'
      ? '#b45309'
      : shipId === 'marine_warship'
        ? '#475569'
        : shipId === 'sea_king'
          ? '#0f766e'
          : '#92400e';
  const sailColor =
    shipId === 'marine_warship'
      ? '#e2e8f0'
      : shipId === 'sea_king'
        ? '#14b8a6'
        : '#f8fafc';
  const emblemColor =
    shipId === 'thousand_sunny'
      ? '#facc15'
      : shipId === 'marine_warship'
        ? '#38bdf8'
        : shipId === 'sea_king'
          ? '#f43f5e'
          : '#ef4444';

  const cell = document.createElement('canvas');
  cell.width = fw;
  cell.height = fh;
  const cctx = cell.getContext('2d')!;
  cctx.imageSmoothingEnabled = false;

  for (const state of STANDARD_SPRITE_ANIM_STATES) {
    const clip = entry.animations[state];
    const row = clip.row;
    const frames = Math.min(SHEET_COLUMNS, Math.max(1, clip.frames));

    for (let f = 0; f < frames; f++) {
      cctx.clearRect(0, 0, fw, fh);
      const bob = f % 2 === 1 ? -1 : 0;
      const sailBillow = f % 2 === 0 ? Math.round(fw * 0.04) : 0;

      if (shipId === 'sea_king') {
        drawPixelEllipse(cctx, fw * 0.36, fh * 0.6 + bob, fw * 0.22, fh * 0.14, hullColor);
        drawPixelEllipse(cctx, fw * 0.68, fh * 0.34 + bob, fw * 0.18, fh * 0.18, sailColor);
        cctx.fillStyle = emblemColor;
        cctx.fillRect(Math.round(fw * 0.72), Math.round(fh * 0.28 + bob), Math.max(3, Math.round(fw * 0.07)), Math.max(3, Math.round(fh * 0.07)));
      } else {
        if (state === 'DODGE' || state === 'TRANSFORM') {
          fillShadedRect(cctx, fw * 0.03, fh * 0.52 + bob, fw * (0.2 + (f % 2) * 0.06), fh * 0.14, '#38bdf8');
          fillShadedRect(cctx, fw * 0.08, fh * 0.55 + bob, fw * 0.12, fh * 0.08, '#fde047');
        }
        // Shaded wooden hull
        fillShadedRect(cctx, fw * 0.18, fh * 0.56 + bob, fw * 0.6, fh * 0.2, hullColor);
        fillShadedRect(cctx, fw * 0.22, fh * 0.52 + bob, fw * 0.52, fh * 0.06, shadeHueShift(hullColor, 1));
        // Mast
        fillShadedRect(cctx, fw * 0.45, fh * 0.14 + bob, Math.max(2, fw * 0.06), fh * 0.44, '#451a03');
        // Billowing shaded sail
        fillShadedRect(cctx, fw * 0.32, fh * 0.2 + bob, fw * 0.34 + sailBillow, fh * 0.28, sailColor);
        // Jolly Roger / Marine Emblem
        drawPixelEllipse(cctx, fw * 0.49, fh * 0.34 + bob, fw * 0.07, fh * 0.06, emblemColor);
        // Figurehead (Golden Lion for Sunny, White Ram for Merry)
        drawPixelEllipse(
          cctx,
          fw * 0.8,
          fh * 0.54 + bob,
          fw * 0.09,
          fh * 0.1,
          shipId === 'thousand_sunny' ? '#facc15' : '#f8fafc'
        );
      }

      applyTintedPixelOutline(cctx, fw, fh);

      // Subtle wake foam under hull
      cctx.save();
      cctx.globalCompositeOperation = 'destination-over';
      cctx.fillStyle = 'rgba(186, 230, 253, 0.58)';
      cctx.fillRect(Math.round(fw * 0.12), Math.round(fh * 0.74), Math.round(fw * 0.76), Math.max(2, Math.round(fh * 0.06)));
      cctx.restore();

      ctx.drawImage(cell, f * fw, row * fh);
    }
  }

  return sheet;
}
