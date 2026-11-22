import { renderLuffyArticulatedSheetPixels } from '../../../assets/luffyArticulatedPixelSheet';
import {
  STANDARD_SPRITE_ANIM_STATES,
  type SpriteAnimState
} from '../../../data/assets/types';
import { RigPixelSurface } from './pixelSurface';
import {
  clampCellToGroundPlane,
  drawBackLayerCoatWingsHagoromo,
  drawHeadAndFace
} from './rigAnatomyDrawer';
import { drawGiantBeastCell } from './rigGiantBeastDrawer';
import { computeJointPoseForFrame } from './rigJointPoseSolver';
import {
  createStandardRigAnimations,
  type CharacterBlueprintEntry,
  type ThreeToneHex
} from './rigTypes';
import {
  bakeShipSpriteSheetPixels,
  RIG_SHEET_COLUMNS,
  RIG_SHEET_ROWS
} from './shipRigBaker';

export { bakeShipSpriteSheetPixels, RIG_SHEET_COLUMNS, RIG_SHEET_ROWS };

/**
 * Renders a single frame `(state, frameIdx)` of any `CharacterBlueprintEntry` into `surf` at `(ox, oy)`.
 */
export function renderBlueprintFrameCell(
  surf: RigPixelSurface,
  ox: number,
  oy: number,
  bp: CharacterBlueprintEntry,
  state: SpriteAnimState,
  frameIdx: number,
  totalFrames: number
): void {
  const fw = bp.frameWidth;
  const fh = bp.frameHeight;
  const s = fw / 48;
  const groundY = Math.round(fh * bp.anchor.y);

  if (
    bp.rigType === 'giant_beast' &&
    bp.giantSubRig &&
    bp.giantSubRig !== 'giant_humanoid'
  ) {
    drawGiantBeastCell(surf, ox, oy, bp, state, frameIdx, totalFrames);
    clampCellToGroundPlane(surf, ox, oy, fw, fh, groundY);
    surf.applyCellHueShiftedOutline(ox, oy, fw, fh, groundY);
    return;
  }

  if (bp.smallSubMode === 'guard_sphere') {
    const bob = frameIdx % 2 === 1 ? -1 : 0;
    const stride =
      state === 'MOVE'
        ? Math.round(Math.sin((frameIdx / Math.max(1, totalFrames)) * Math.PI * 2) * 3)
        : state === 'ATTACK_MELEE' || state === 'ATTACK_CAST'
          ? frameIdx
          : 0;
    const liftL = state === 'MOVE' && frameIdx % 3 === 1 ? -1 : 0;
    const liftR = state === 'MOVE' && frameIdx % 3 === 2 ? -1 : 0;
    surf.fillRect(ox + 12, oy + groundY - 1, 24, 2, '#090d16', 110);
    surf.fillRect(ox + 17 - stride, oy + groundY - 2 + liftL, 4, 3, bp.palette.bottom[2]);
    surf.fillRect(ox + 27 + stride, oy + groundY - 2 + liftR, 4, 3, bp.palette.bottom[2]);
    surf.fillCircle(ox + 24 + Math.sign(stride), oy + groundY - 15 + bob, 13, bp.palette.top);
    surf.fillShadedBox(ox + 19 + stride, oy + groundY - 30 + bob, 10, 6, bp.palette.hatOrHelm ?? bp.palette.accent);
    clampCellToGroundPlane(surf, ox, oy, fw, fh, groundY);
    surf.applyCellHueShiftedOutline(ox, oy, fw, fh, groundY);
    return;
  }

  const pose = computeJointPoseForFrame(bp, state, frameIdx, totalFrames);

  if (pose.isDowned) {
    const by = oy + groundY - Math.round(3 * s);
    surf.fillRect(ox + Math.round(8 * s), oy + groundY - 1, Math.round(32 * s), 2, '#090d16', 110);
    surf.fillShadedBox(ox + Math.round(10 * s), by - Math.round(3 * s), Math.round(8 * s), Math.round(6 * s), bp.palette.skin);
    surf.fillShadedBox(ox + Math.round(18 * s), by - Math.round(3 * s), Math.round(12 * s), Math.round(6 * s), bp.palette.top);
    surf.fillShadedBox(ox + Math.round(30 * s), oy + groundY - Math.round(5 * s) + 1, Math.round(10 * s), Math.round(5 * s), bp.palette.bottom);
    surf.applyCellHueShiftedOutline(ox, oy, fw, fh, groundY);
    return;
  }

  // 1. Ground Shadow
  const minFootX = Math.min(pose.backFootX, pose.frontFootX) - Math.round(4 * s);
  const maxFootX = Math.max(pose.backFootX, pose.frontFootX) + Math.round(4 * s);
  surf.fillRect(
    ox + minFootX,
    oy + groundY - 1,
    Math.max(Math.round(14 * s), maxFootX - minFootX),
    2,
    '#090d16',
    110
  );

  // 2. Back Layer Coat / Wings / Hagoromo
  drawBackLayerCoatWingsHagoromo(surf, ox, oy, bp, pose, s);

  const limbR = Math.max(1, Math.round((bp.rigType === 'bulky_tall_coat' || bp.rigType === 'giant_beast' ? 2.4 : 1.6) * s));
  const footH = Math.max(2, Math.round(2 * s));
  const armTones: ThreeToneHex =
    bp.coatStyle === 'cyborg_arms'
      ? bp.palette.top
      : bp.elementalArm
        ? bp.palette.weaponOrEffect
        : bp.palette.skin;

  // 3. Back Arm
  surf.drawLimbSegment(ox + pose.backShoulderX, oy + pose.backShoulderY, ox + pose.backElbowX, oy + pose.backElbowY, limbR, bp.palette.top);
  surf.drawLimbSegment(ox + pose.backElbowX, oy + pose.backElbowY, ox + pose.backHandX, oy + pose.backHandY, limbR, armTones);

  if (bp.weaponMount === 'dual_hand' || bp.weaponMount === 'santoryu_mouth' || bp.weaponMount === 'quad_giraffe') {
    surf.drawWeaponBlade(
      ox + pose.backHandX,
      oy + pose.backHandY,
      pose.weaponAngleRad + 0.5,
      Math.round(13 * s),
      Math.max(1, Math.round(1.5 * s)),
      bp.palette.weaponOrEffect
    );
  }

  // 4. Back Leg
  surf.drawLimbSegment(ox + pose.backHipX, oy + pose.backHipY, ox + pose.backKneeX, oy + pose.backKneeY, limbR + 1, bp.palette.bottom);
  surf.drawLimbSegment(ox + pose.backKneeX, oy + pose.backKneeY, ox + pose.backFootX, oy + pose.backFootY - limbR - 1, limbR, bp.palette.bottom);
  surf.fillRect(ox + pose.backFootX - Math.round(2 * s), oy + pose.backFootY - footH + 1, Math.max(4, Math.round(5 * s)), footH, bp.palette.accent[2]);

  // 5. Torso & Outfit
  const tw = Math.round((bp.rigType === 'bulky_tall_coat' ? 13 : 10) * s);
  const th = Math.round((bp.rigType === 'small_agile' ? 7 : 10) * s);
  surf.fillShadedBox(ox + pose.torsoX - Math.round(tw * 0.5), oy + pose.torsoY - Math.round(th * 0.45), tw, th, bp.palette.top);
  surf.fillShadedBox(ox + pose.torsoX - Math.round(tw * 0.5), oy + pose.torsoY + Math.round(th * 0.25), tw, Math.max(2, Math.round(2.5 * s)), bp.palette.accent);

  // 6 & 7. Head & Face
  drawHeadAndFace(surf, ox, oy, bp, pose, s);

  if (bp.weaponMount === 'santoryu_mouth') {
    surf.drawWeaponBlade(ox + pose.headX + Math.round(2 * s), oy + pose.headY + Math.round(2 * s), 0.05, Math.round(14 * s), Math.max(1, Math.round(1.5 * s)), bp.palette.weaponOrEffect, '#f8fafc');
  }

  // 8. Front Leg
  const frontLegTones: ThreeToneHex =
    bp.elementalArm === 'fire_leg' || (bp.attackStyle === 'kick' && pose.smearArcActive)
      ? bp.palette.weaponOrEffect
      : bp.palette.bottom;
  surf.drawLimbSegment(ox + pose.frontHipX, oy + pose.frontHipY, ox + pose.frontKneeX, oy + pose.frontKneeY, limbR + 1, bp.palette.bottom);
  surf.drawLimbSegment(ox + pose.frontKneeX, oy + pose.frontKneeY, ox + pose.frontFootX, oy + pose.frontFootY - limbR - 1, limbR, frontLegTones);
  surf.fillRect(ox + pose.frontFootX - Math.round(2 * s), oy + pose.frontFootY - footH + 1, Math.max(4, Math.round(5 * s)), footH, frontLegTones[2]);

  // 9. Front Arm
  const fistR =
    bp.coatStyle === 'cyborg_arms'
      ? limbR + Math.round(2 * s)
      : bp.attackStyle === 'stretch_punch' && pose.smearArcActive
        ? limbR + Math.round(2 * s)
        : limbR;
  surf.drawLimbSegment(ox + pose.frontShoulderX, oy + pose.frontShoulderY, ox + pose.frontElbowX, oy + pose.frontElbowY, limbR, bp.palette.top);
  surf.drawLimbSegment(ox + pose.frontElbowX, oy + pose.frontElbowY, ox + pose.frontHandX, oy + pose.frontHandY, fistR, armTones);

  // 10. Foreground Weapon / Caster Prop / Smear Arc
  if (bp.rigType === 'swordsman_weapon' || bp.weaponMount) {
    const bladeLen =
      bp.weaponMount === 'nodachi' || bp.weaponMount === 'trident' || bp.weaponMount === 'kiribachi'
        ? Math.round(18 * s)
        : Math.round(14 * s);
    const bladeThick =
      bp.weaponMount === 'axe_arm' || bp.weaponMount === 'kiribachi'
        ? Math.max(2, Math.round(3 * s))
        : Math.max(1, Math.round(1.8 * s));
    surf.drawWeaponBlade(ox + pose.frontHandX, oy + pose.frontHandY, pose.weaponAngleRad, bladeLen, bladeThick, bp.palette.weaponOrEffect);
  } else if (bp.casterProp === 'clima_tact_zeus') {
    surf.drawWeaponBlade(ox + pose.frontHandX, oy + pose.frontHandY, pose.weaponAngleRad, Math.round(13 * s), 2, ['#7dd3fc', '#0284c7', '#0369a1']);
    surf.fillCircle(ox + pose.torsoX + Math.round(12 * s), oy + pose.headY - Math.round(2 * s), Math.round(3.5 * s), ['#ffffff', '#fef08a', '#facc15']);
  } else if (bp.casterProp === 'kabuto_slingshot') {
    surf.drawWeaponBlade(ox + pose.frontHandX, oy + pose.frontHandY, 0, Math.round(9 * s), 2, bp.palette.weaponOrEffect);
  }

  if (pose.smearArcActive) {
    surf.drawSmearArc(ox + pose.torsoX + Math.round(2 * s), oy + pose.torsoY, Math.round(14 * s), -0.95, 0.85, bp.palette.weaponOrEffect);
  }

  if (pose.castBurstActive) {
    surf.fillCircle(ox + Math.min(fw - 6, pose.frontHandX + Math.round(4 * s)), oy + pose.frontHandY, Math.max(2, Math.round(3.5 * s)), bp.palette.weaponOrEffect);
  }

  // 11. Clamp to ground plane and apply automatic 1px Hue-Shifted Exterior Outline
  clampCellToGroundPlane(surf, ox, oy, fw, fh, groundY);
  surf.applyCellHueShiftedOutline(ox, oy, fw, fh, groundY);
}

/**
 * Generates the complete 6-col x 11-row multi-frame RGBA pixel buffer for a character blueprint.
 */
export function bakeCharacterSpriteSheetPixels(bp: CharacterBlueprintEntry): {
  width: number;
  height: number;
  data: Uint8ClampedArray;
} {
  if (bp.key === 'luffy_base') {
    return renderLuffyArticulatedSheetPixels();
  }

  const fw = bp.frameWidth;
  const fh = bp.frameHeight;
  const width = fw * RIG_SHEET_COLUMNS;
  const height = fh * RIG_SHEET_ROWS;
  const surf = new RigPixelSurface(width, height);
  const anims = createStandardRigAnimations();

  for (let rowIdx = 0; rowIdx < STANDARD_SPRITE_ANIM_STATES.length; rowIdx++) {
    const state = STANDARD_SPRITE_ANIM_STATES[rowIdx];
    if (!state) continue;
    const clip = anims[state];
    for (let colIdx = 0; colIdx < clip.frames; colIdx++) {
      renderBlueprintFrameCell(
        surf,
        colIdx * fw,
        rowIdx * fh,
        bp,
        state,
        colIdx,
        clip.frames
      );
    }
  }

  return { width, height, data: surf.data };
}

export function bakeCharacterSpriteSheetCanvas(
  bp: CharacterBlueprintEntry
): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  const { width, height, data } = bakeCharacterSpriteSheetPixels(bp);
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
