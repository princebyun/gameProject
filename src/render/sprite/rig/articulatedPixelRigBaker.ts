import { renderLuffyArticulatedSheetPixels } from '../../../assets/luffyArticulatedPixelSheet';
import {
  STANDARD_SPRITE_ANIM_STATES,
  type SpriteAnimState
} from '../../../data/assets/types';
import { RigPixelSurface } from './pixelSurface';
import {
  createStandardRigAnimations,
  type CharacterBlueprintEntry,
  type ThreeToneHex
} from './rigTypes';

export const RIG_SHEET_COLUMNS = 6;
export const RIG_SHEET_ROWS = STANDARD_SPRITE_ANIM_STATES.length; // 11

interface JointFramePose {
  torsoX: number;
  torsoY: number;
  headX: number;
  headY: number;
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
  backHandX: number;
  backHandY: number;
  frontShoulderX: number;
  frontShoulderY: number;
  frontElbowX: number;
  frontElbowY: number;
  frontHandX: number;
  frontHandY: number;
  weaponAngleRad: number;
  smearArcActive: boolean;
  castBurstActive: boolean;
  isDowned: boolean;
  capeFlutterOffset: number;
  wingFlapOffset: number;
  splitBodyOffset: number;
}

/**
 * Computes articulated joint positions for a frame `(state, frameIdx, totalFrames)`
 * normalized to cell size `fw x fh` and strictly anchored to `groundY = Math.round(fh * anchor.y)`.
 */
function computeJointPoseForFrame(
  bp: CharacterBlueprintEntry,
  state: SpriteAnimState,
  f: number,
  totalFrames: number
): JointFramePose {
  const fw = bp.frameWidth;
  const fh = bp.frameHeight;
  const s = fw / 48; // 1.0 for 48x48, 1.333 for 64x64, 2.0 for 96x96
  const groundY = Math.round(fh * bp.anchor.y);
  const cx = Math.round(fw * 0.48);

  const isSmall = bp.rigType === 'small_agile';
  const legLen = Math.round((isSmall ? 8 : 12) * s);
  const torsoH = Math.round((isSmall ? 7 : 10) * s);

  let torsoX = cx;
  let torsoY = groundY - legLen - Math.round(torsoH * 0.5);
  let headX = torsoX;
  let headY = torsoY - Math.round((isSmall ? 7 : 9) * s);

  let backFootX = cx + Math.round(5 * s);
  let backFootY = groundY;
  let frontFootX = cx - Math.round(5 * s);
  let frontFootY = groundY;

  let backHandX = cx + Math.round(9 * s);
  let backHandY = torsoY + Math.round(1 * s);
  let frontHandX = cx - Math.round(6 * s);
  let frontHandY = torsoY + Math.round(2 * s);

  let weaponAngleRad = -0.45;
  let smearArcActive = false;
  let castBurstActive = false;
  let isDowned = false;
  let capeFlutterOffset = f % 2 === 0 ? 0 : Math.round(2 * s);
  let wingFlapOffset = Math.round(Math.sin((f / Math.max(1, totalFrames)) * Math.PI * 2) * 5 * s);
  let splitBodyOffset = 0;

  if (state === 'IDLE') {
    const breath = f === 1 || f === 2 ? -Math.max(1, Math.round(1 * s)) : 0;
    torsoY += breath;
    headY += breath;
    backHandY += breath;
    frontHandY += f % 2 === 1 ? -1 : 0;
    weaponAngleRad = -0.55 + (f % 2) * 0.08;
  } else if (state === 'MOVE') {
    // 6-frame full leg-crossing run cycle
    const strideTable = [8, 4, 0, -8, -4, 0];
    const liftFrontTable = [0, 0, -3, -2, -3, 0];
    const liftBackTable = [-2, -3, 0, 0, 0, -3];
    const bobTable = [-1, 1, 0, -1, 1, 0];
    const idx = f % 6;
    const stride = Math.round(strideTable[idx] * s);

    torsoX = cx + Math.round(2 * s);
    torsoY += Math.round(bobTable[idx] * s);
    headX = torsoX + Math.round(1 * s);
    headY = torsoY - Math.round((isSmall ? 7 : 9) * s);

    frontFootX = cx + stride;
    frontFootY = groundY + Math.round(liftFrontTable[idx] * s);
    backFootX = cx - stride;
    backFootY = groundY + Math.round(liftBackTable[idx] * s);

    // Ensure at least one foot touches groundY on contact/pass frames
    if (frontFootY < groundY && backFootY < groundY) {
      frontFootY = groundY;
    }

    frontHandX = torsoX - stride;
    frontHandY = torsoY + Math.round(1 * s);
    backHandX = torsoX + stride + Math.round(2 * s);
    backHandY = torsoY;
    weaponAngleRad = -0.85 + Math.sin((idx / 6) * Math.PI * 2) * 0.35;
    capeFlutterOffset = Math.round((2 + (idx % 3)) * s);
  } else if (state === 'WINDUP') {
    torsoX = cx - Math.round((2 + f * 1.5) * s);
    torsoY += Math.round(1 * s);
    headX = torsoX - Math.round(1 * s);
    headY = torsoY - Math.round((isSmall ? 7 : 9) * s);
    frontFootX = cx - Math.round(7 * s);
    backFootX = cx + Math.round(6 * s);
    frontHandX = torsoX - Math.round((6 + f * 3) * s);
    frontHandY = torsoY - Math.round(f * s);
    backHandX = torsoX + Math.round(5 * s);
    backHandY = torsoY - Math.round(2 * s);
    weaponAngleRad = -2.1 - f * 0.2;
  } else if (state === 'ATTACK_MELEE') {
    const isHit = f === 2;
    torsoX = cx + Math.round((f === 0 ? 1 : isHit ? 4 : 2) * s);
    headX = torsoX + Math.round(2 * s);
    headY = torsoY - Math.round((isSmall ? 7 : 9) * s);
    frontFootX = cx + Math.round(8 * s);
    backFootX = cx - Math.round(7 * s);

    if (bp.attackStyle === 'kick') {
      // Sanji dedicated high roundhouse / Diable Jambe kick articulation!
      torsoX = cx - Math.round(1 * s);
      headX = torsoX - Math.round(2 * s);
      backFootX = cx - Math.round(2 * s);
      backFootY = groundY;
      frontFootX =
        cx + Math.round((f === 0 ? 8 : f === 1 ? 14 : isHit ? 19 : 11) * s);
      frontFootY =
        groundY - Math.round((f === 0 ? 5 : f === 1 ? 12 : isHit ? 16 : 7) * s);
      frontHandX = torsoX - Math.round(4 * s);
      frontHandY = torsoY + Math.round(3 * s);
      smearArcActive = f === 1 || isHit;
    } else if (bp.attackStyle === 'stretch_punch') {
      // Gomu-Gomu / Elastic stretched arm
      const reach = f === 0 ? 9 : f === 1 ? 15 : isHit ? 20 : 11;
      frontHandX = Math.min(fw - 4, torsoX + Math.round(reach * s));
      frontHandY = torsoY - Math.round(1 * s);
      smearArcActive = isHit;
    } else {
      const reach = f === 0 ? 7 : f === 1 ? 12 : isHit ? 15 : 9;
      frontHandX = Math.min(fw - 5, torsoX + Math.round(reach * s));
      frontHandY = torsoY + Math.round((isHit ? 0 : -2) * s);
      backHandX = torsoX - Math.round(5 * s);
      weaponAngleRad = f === 0 ? -1.4 : f === 1 ? -0.15 : isHit ? 0.45 : 0.75;
      smearArcActive = f === 1 || isHit;
    }
  } else if (state === 'ATTACK_CAST') {
    const isHit = f === 2;
    torsoX = cx + Math.round((isHit ? 3 : 1) * s);
    headX = torsoX + Math.round(1 * s);
    frontFootX = cx + Math.round(6 * s);
    backFootX = cx - Math.round(6 * s);
    const reach = f === 0 ? -4 : f === 1 ? 9 : isHit ? 14 : 8;
    frontHandX = torsoX + Math.round(reach * s);
    frontHandY = torsoY - Math.round(1 * s);
    backHandX = torsoX + Math.round(reach * s);
    backHandY = torsoY + Math.round(2 * s);
    weaponAngleRad = 0;
    castBurstActive = f === 1 || isHit;
    if (bp.casterProp === 'bara_split_body' && (f === 1 || isHit)) {
      splitBodyOffset = Math.round(5 * s);
    }
  } else if (state === 'CLASH') {
    const jitter = f % 2 === 0 ? 1 : -1;
    torsoX = cx + Math.round(2 * s) + jitter;
    torsoY += Math.round(1 * s);
    headX = torsoX + Math.round(1 * s);
    headY = torsoY - Math.round((isSmall ? 7 : 9) * s);
    frontFootX = cx + Math.round(8 * s);
    backFootX = cx - Math.round(7 * s);
    frontHandX = torsoX + Math.round(10 * s);
    frontHandY = torsoY - Math.round(1 * s);
    backHandX = torsoX + Math.round(8 * s);
    backHandY = torsoY + Math.round(1 * s);
    weaponAngleRad = -0.25;
    smearArcActive = true;
  } else if (state === 'DODGE') {
    torsoX = cx + Math.round((f - 1) * 3 * s);
    torsoY += Math.round((f === 1 ? 1 : 3) * s);
    headX = torsoX + Math.round(2 * s);
    headY = torsoY - Math.round((isSmall ? 6 : 8) * s);
    frontFootX = torsoX + Math.round(6 * s);
    backFootX = torsoX - Math.round(7 * s);
    frontHandX = torsoX - Math.round(5 * s);
    backHandX = torsoX + Math.round(6 * s);
    if (bp.casterProp === 'bara_split_body') {
      splitBodyOffset = Math.round((3 + f * 2) * s);
    }
  } else if (state === 'HIT') {
    torsoX = cx - Math.round((3 + f * 2) * s);
    headX = torsoX - Math.round(2 * s);
    headY = torsoY - Math.round((isSmall ? 7 : 9) * s);
    frontFootX = cx + Math.round(5 * s);
    backFootX = cx - Math.round(6 * s);
    frontHandX = torsoX - Math.round(6 * s);
    frontHandY = torsoY - Math.round(3 * s);
    backHandX = torsoX + Math.round(6 * s);
    backHandY = torsoY - Math.round(4 * s);
    if (bp.casterProp === 'bara_split_body') {
      splitBodyOffset = Math.round(6 * s);
    }
  } else if (state === 'DOWNED') {
    isDowned = true;
    torsoY = groundY - Math.round(4 * s) - (f % 2);
  } else if (state === 'TRANSFORM') {
    const rise = f === 2 ? -Math.round(2 * s) : 0;
    torsoY += rise - Math.round(splitBodyOffset);
    headY = torsoY - Math.round((isSmall ? 7 : 9) * s);
    frontFootX = cx - Math.round(7 * s);
    backFootX = cx + Math.round(7 * s);
    frontHandX = torsoX - Math.round((5 + f * 2) * s);
    frontHandY = torsoY - Math.round(f * 3 * s);
    backHandX = torsoX + Math.round((5 + f * 2) * s);
    backHandY = torsoY - Math.round(f * 3 * s);
    castBurstActive = f >= 1;
  } else if (state === 'VICTORY') {
    const raise = f === 1 || f === 2;
    torsoY += f === 2 ? -Math.round(1 * s) : 0;
    headY = torsoY - Math.round((isSmall ? 7 : 9) * s);
    frontHandX = torsoX - Math.round(6 * s);
    frontHandY = raise ? headY - Math.round(4 * s) : torsoY;
    backHandX = torsoX + Math.round(7 * s);
    backHandY = headY - Math.round((raise ? 6 : 2) * s);
    weaponAngleRad = -1.45;
  }

  const hipY = torsoY + Math.round(torsoH * 0.45);
  const backHipX = torsoX + Math.round(2 * s);
  const frontHipX = torsoX - Math.round(2 * s);

  const backKneeX = Math.round((backHipX + backFootX) * 0.5 + 1 * s);
  const backKneeY = Math.round((hipY + backFootY) * 0.5);
  const frontKneeX = Math.round((frontHipX + frontFootX) * 0.5 + 1 * s);
  const frontKneeY = Math.round((hipY + frontFootY) * 0.5);

  const shoulderY = torsoY - Math.round(torsoH * 0.3) - splitBodyOffset;
  const backShoulderX = torsoX + Math.round(4 * s);
  const frontShoulderX = torsoX - Math.round(4 * s);

  const backElbowX = Math.round((backShoulderX + backHandX) * 0.5);
  const backElbowY = Math.round((shoulderY + backHandY) * 0.5 + 1 * s);
  const frontElbowX = Math.round((frontShoulderX + frontHandX) * 0.5);
  const frontElbowY = Math.round((shoulderY + frontHandY) * 0.5 + 1 * s);

  return {
    torsoX,
    torsoY: torsoY - splitBodyOffset,
    headX,
    headY: headY - splitBodyOffset,
    backHipX,
    backHipY: hipY,
    backKneeX,
    backKneeY,
    backFootX,
    backFootY,
    frontHipX,
    frontHipY: hipY,
    frontKneeX,
    frontKneeY,
    frontFootX,
    frontFootY,
    backShoulderX,
    backShoulderY: shoulderY,
    backElbowX,
    backElbowY,
    backHandX,
    backHandY: backHandY - splitBodyOffset,
    frontShoulderX,
    frontShoulderY: shoulderY,
    frontElbowX,
    frontElbowY,
    frontHandX,
    frontHandY: frontHandY - splitBodyOffset,
    weaponAngleRad,
    smearArcActive,
    castBurstActive,
    isDowned,
    capeFlutterOffset,
    wingFlapOffset,
    splitBodyOffset
  };
}

function drawBackLayerCoatWingsHagoromo(
  surf: RigPixelSurface,
  ox: number,
  oy: number,
  bp: CharacterBlueprintEntry,
  pose: JointFramePose,
  s: number
): void {
  const coatTones: ThreeToneHex = bp.palette.coatOrWings ?? bp.palette.accent;

  // 1. Floating Hagoromo Cloud Sash (Gear 5 White / Awakened Lucci, Saturn, Kaido, Loki Black)
  if (bp.hagoromoCloud) {
    const hagTones: ThreeToneHex =
      bp.hagoromoCloud === 'white'
        ? ['#ffffff', '#e2e8f0', '#94a3b8']
        : ['#475569', '#1e293b', '#090d16'];
    const arcR = Math.round(11 * s);
    for (let deg = 165; deg <= 375; deg += 22) {
      const rad = (deg * Math.PI) / 180;
      const px = ox + pose.torsoX + Math.round(Math.cos(rad) * arcR);
      const py =
        oy +
        pose.torsoY -
        Math.round(3 * s) +
        Math.round(Math.sin(rad) * arcR * 0.75);
      surf.fillCircle(px, py, Math.max(2, Math.round(2.4 * s)), hagTones);
    }
  }

  // 2. Lunarian Back Flame (King & S-Hawk)
  if (bp.coatStyle === 'lunarian_wings') {
    const flameTones: ThreeToneHex = ['#fef08a', '#f97316', '#dc2626'];
    surf.fillCircle(
      ox + pose.torsoX - Math.round(6 * s),
      oy + pose.torsoY - Math.round(5 * s) - (pose.capeFlutterOffset % 3),
      Math.max(2, Math.round(3.5 * s)),
      flameTones
    );
    // Dark feathered wings
    surf.drawLimbSegment(
      ox + pose.torsoX - Math.round(2 * s),
      oy + pose.torsoY - Math.round(2 * s),
      ox + pose.torsoX - Math.round(13 * s),
      oy + pose.torsoY - Math.round(9 * s) + pose.wingFlapOffset,
      Math.max(2, Math.round(2.5 * s)),
      coatTones
    );
  }

  // 3. Admiral Justice Coat / Pirate Captain Coat / Feather Coat billowing in 4 frames
  if (
    bp.coatStyle === 'admiral_justice_coat' ||
    bp.coatStyle === 'pirate_captain_coat' ||
    bp.casterProp === 'ito_strings_coat'
  ) {
    const cw = Math.round(14 * s);
    const ch = Math.round(13 * s);
    const cx = ox + pose.torsoX - Math.round(cw * 0.55) - pose.capeFlutterOffset;
    const cy = oy + pose.torsoY - Math.round(4 * s);
    surf.fillShadedBox(cx, cy, cw, ch, coatTones);
  }

  // 4. Magellan Venom Wings / Robin Demonio Wings
  if (bp.coatStyle === 'venom_wings') {
    surf.drawLimbSegment(
      ox + pose.torsoX,
      oy + pose.torsoY - Math.round(2 * s),
      ox + pose.torsoX - Math.round(13 * s),
      oy + pose.torsoY - Math.round(10 * s) + pose.wingFlapOffset,
      Math.max(2, Math.round(2.5 * s)),
      coatTones
    );
    surf.drawLimbSegment(
      ox + pose.torsoX,
      oy + pose.torsoY - Math.round(2 * s),
      ox + pose.torsoX + Math.round(11 * s),
      oy + pose.torsoY - Math.round(9 * s) - pose.wingFlapOffset,
      Math.max(2, Math.round(2.2 * s)),
      coatTones
    );
  }
}

function drawHeadAndFace(
  surf: RigPixelSurface,
  ox: number,
  oy: number,
  bp: CharacterBlueprintEntry,
  pose: JointFramePose,
  s: number
): void {
  const hx = ox + pose.headX;
  const hy = oy + pose.headY;
  const headR = Math.max(3, Math.round(4.2 * s));

  // Neck
  surf.fillRect(
    hx - Math.round(1.5 * s),
    hy + headR - 1,
    Math.max(2, Math.round(3 * s)),
    Math.max(2, Math.round(3 * s)),
    bp.palette.skin[2]
  );

  // Face base
  surf.fillShadedBox(
    hx - headR,
    hy - headR + 1,
    headR * 2 + 1,
    headR * 2,
    bp.palette.skin
  );

  // Hair / Hat / Horns by hairStyle
  const hair = bp.palette.hair;
  const hat = bp.palette.hatOrHelm ?? bp.palette.accent;
  const hs = bp.head.hairStyle;

  if (hs === 'flame_white_nika') {
    // Gear 5 billowing white cloud-flame hair
    surf.fillCircle(hx, hy - headR - Math.round(1 * s), Math.round(5 * s), hair);
    surf.fillCircle(
      hx - Math.round(4 * s),
      hy - headR,
      Math.round(3 * s),
      hair
    );
    surf.fillCircle(
      hx + Math.round(4 * s),
      hy - headR - Math.round(1 * s),
      Math.round(3 * s),
      hair
    );
  } else if (hs === 'reindeer_antlers_hat') {
    // Chopper antlers + pink/blue X hat
    surf.fillShadedBox(
      hx - headR - Math.round(4 * s),
      hy - headR - Math.round(2 * s),
      Math.max(2, Math.round(3 * s)),
      Math.max(3, Math.round(4 * s)),
      ['#d97706', '#92400e', '#451a03']
    );
    surf.fillShadedBox(
      hx + headR + Math.round(1 * s),
      hy - headR - Math.round(2 * s),
      Math.max(2, Math.round(3 * s)),
      Math.max(3, Math.round(4 * s)),
      ['#d97706', '#92400e', '#451a03']
    );
    surf.fillShadedBox(
      hx - headR - 1,
      hy - headR - Math.round(3 * s),
      headR * 2 + 3,
      Math.max(4, Math.round(5 * s)),
      hat
    );
    // White X emblem on hat
    surf.setPixel(hx, hy - headR - Math.round(1 * s), '#ffffff');
    surf.setPixel(hx - 1, hy - headR - Math.round(2 * s), '#ffffff');
    surf.setPixel(hx + 1, hy - headR - Math.round(2 * s), '#ffffff');
  } else if (hs === 'giant_afro_skull') {
    // Brook giant round black afro + golden crown
    surf.fillCircle(hx - 1, hy - Math.round(3 * s), Math.round(7.5 * s), hair);
  } else if (hs === 'oni_horns_mane' || hs === 'viking_horned_helm') {
    // Kaido / Loki giant curved horns + long mane
    surf.fillShadedBox(
      hx - headR - Math.round(2 * s),
      hy - headR,
      headR * 2 + Math.round(3 * s),
      headR * 2 + Math.round(3 * s),
      hair
    );
    surf.fillShadedBox(
      hx - headR + 1,
      hy - headR + 2,
      headR * 2 - 1,
      headR * 2 - 1,
      bp.palette.skin
    );
    surf.drawLimbSegment(
      hx - headR,
      hy - headR + 1,
      hx - headR - Math.round(5 * s),
      hy - headR - Math.round(6 * s),
      Math.max(1, Math.round(1.5 * s)),
      hat
    );
    surf.drawLimbSegment(
      hx + headR,
      hy - headR + 1,
      hx + headR + Math.round(5 * s),
      hy - headR - Math.round(6 * s),
      Math.max(1, Math.round(1.5 * s)),
      hat
    );
  } else if (
    hs === 'marine_cap' ||
    hs === 'spotted_hat' ||
    hs === 'top_hat_pigeon' ||
    hs === 'clown_hat_tails'
  ) {
    surf.fillShadedBox(
      hx - headR,
      hy - headR - Math.round(3 * s),
      headR * 2 + 2,
      Math.max(3, Math.round(4 * s)),
      hat
    );
    // Visor / brim
    surf.fillRect(
      hx - headR - 2,
      hy - headR + 1,
      headR * 2 + 5,
      Math.max(1, Math.round(1.5 * s)),
      hat[0]
    );
  } else if (hs === 'long_wavy' || hs === 'long_straight_dark') {
    // Nami / Robin long flowing hair
    surf.fillShadedBox(
      hx - headR - 1,
      hy - headR - 1,
      headR * 2 + 2,
      Math.max(3, Math.round(3.5 * s)),
      hair
    );
    surf.fillShadedBox(
      hx - headR - 2,
      hy - headR + 1,
      Math.max(2, Math.round(3 * s)),
      headR * 2 + Math.round(4 * s),
      hair
    );
  } else {
    // Standard anime spiky / cropped / pompadour top hair
    surf.fillShadedBox(
      hx - headR - 1,
      hy - headR - Math.round(2 * s),
      headR * 2 + 3,
      Math.max(3, Math.round(3.5 * s)),
      hair
    );
  }

  // Eyes & Face feature
  const eyeHex = bp.palette.eyeColor ?? '#090d16';
  surf.setPixel(hx + Math.round(2 * s), hy, eyeHex);
  if (bp.head.hairStyle !== 'side_sweep_left_covered') {
    surf.setPixel(hx - Math.round(1 * s), hy, eyeHex);
  }
  if (bp.head.faceFeature === 'long_nose_goggles') {
    // Usopp long sniper nose
    surf.fillRect(
      hx + headR,
      hy,
      Math.max(3, Math.round(4 * s)),
      Math.max(1, Math.round(1.5 * s)),
      bp.palette.skin[1]
    );
  } else if (bp.head.faceFeature === 'clown_red_nose') {
    surf.fillRect(hx + Math.round(1 * s), hy, 2, 2, '#ef4444');
  } else if (bp.head.faceFeature === 'doffy_shades' || bp.head.faceFeature === 'admiral_shades') {
    surf.fillRect(hx - 1, hy - 1, Math.round(4 * s), 2, '#f43f5e');
  } else if (bp.head.faceFeature === 'left_eye_scar' && bp.palette.scarColor) {
    surf.setPixel(hx + Math.round(2 * s), hy + 1, bp.palette.scarColor);
  }
}

function drawGiantBeastCell(
  surf: RigPixelSurface,
  ox: number,
  oy: number,
  bp: CharacterBlueprintEntry,
  state: SpriteAnimState,
  f: number,
  totalFrames: number
): void {
  const fw = bp.frameWidth;
  const fh = bp.frameHeight;
  const groundY = Math.round(fh * bp.anchor.y);
  const cx = Math.round(fw * 0.5);
  const sub = bp.giantSubRig ?? 'giant_humanoid';

  // Ground shadow anchored strictly at groundY - 1 .. groundY
  surf.fillRect(ox + Math.round(fw * 0.16), oy + groundY - 1, Math.round(fw * 0.68), 2, '#090d16', 110);

  if (sub === 'serpentine_dragon') {
    // Kaido Azure Dragon / Flame Dragon: S-curve undulating coils + Boro Breath jaw
    const phase = (f / Math.max(1, totalFrames)) * Math.PI * 2;
    const isCast = state === 'ATTACK_CAST' || state === 'ATTACK_MELEE';

    // Anchor tail/lower coil solidly at groundY so baseline check passes with 0px error
    surf.fillShadedBox(ox + 18, oy + groundY - 8, 56, 9, bp.palette.bottom);

    for (let seg = 0; seg < 7; seg++) {
      const waveY = Math.round(Math.sin(phase + seg * 0.9) * 6);
      const sx = ox + 18 + seg * 9 + (isCast && f === 2 ? 4 : 0);
      const sy = Math.min(oy + groundY - 9, oy + groundY - 14 - seg * 7 + waveY);
      surf.fillCircle(sx, sy, 8 - Math.floor(seg * 0.4), bp.palette.top);
      // Golden dragon belly scales
      surf.fillRect(sx - 3, sy + 3, 6, 3, bp.palette.accent[1]);
    }

    // Dragon Head, Horns & Jaws
    const headX = ox + 64 + (isCast && f >= 1 ? 6 : 0);
    const headY = oy + 26 + (f % 2 === 0 ? -2 : 1);
    surf.fillShadedBox(headX - 8, headY - 7, 18, 13, bp.palette.top);
    // Horns
    surf.drawLimbSegment(headX - 4, headY - 7, headX - 10, headY - 16, 2, bp.palette.hair);
    surf.drawLimbSegment(headX + 2, headY - 7, headX - 2, headY - 16, 2, bp.palette.hair);
    // Glowing eye
    surf.fillRect(headX + 4, headY - 3, 3, 2, '#ef4444');
    // Boro Breath Blast on ATTACK_CAST / ATTACK_MELEE
    if (isCast && f >= 1) {
      surf.fillShadedBox(headX + 8, headY - 3, 14, 9, bp.palette.weaponOrEffect);
    }
    return;
  }

  if (sub === 'spider_oni') {
    // Saint Jaygarcia Saturn (Gyuki spider-demon): 6 alternating spider legs + horned elder torso + black hagoromo
    const legPairs = [-24, -10, 8, 22];
    legPairs.forEach((offX, idx) => {
      const stepLift =
        state === 'MOVE' && (f + idx) % 2 === 1 ? -4 : 0;
      const footX = ox + cx + offX + (state === 'MOVE' ? ((f + idx) % 3) * 2 - 2 : 0);
      const footY = oy + groundY + stepLift;
      const kneeX = ox + cx + Math.round(offX * 1.25);
      const kneeY = oy + groundY - 18 + stepLift;
      surf.drawLimbSegment(ox + cx + Math.round(offX * 0.4), oy + groundY - 22, kneeX, kneeY, 3, bp.palette.bottom);
      surf.drawLimbSegment(kneeX, kneeY, footX, footY - 2, 2, bp.palette.bottom);
    });
    // Ensure center spider claws always touch exact groundY
    surf.fillShadedBox(ox + cx - 12, oy + groundY - 3, 6, 4, bp.palette.accent);
    surf.fillShadedBox(ox + cx + 8, oy + groundY - 3, 6, 4, bp.palette.accent);

    // Spider abdomen & Demon Upper Torso
    const bodyY = oy + groundY - 36 + (f % 2 === 1 ? -2 : 0);
    surf.fillCircle(ox + cx - 6, bodyY + 12, 16, bp.palette.bottom);
    surf.fillShadedBox(ox + cx - 14, bodyY - 14, 28, 24, bp.palette.top);

    // Black Hagoromo Cloud Sash
    for (let deg = 160; deg <= 380; deg += 25) {
      const rad = (deg * Math.PI) / 180;
      surf.fillCircle(
        ox + cx + Math.round(Math.cos(rad) * 26),
        bodyY - 4 + Math.round(Math.sin(rad) * 18),
        4,
        ['#475569', '#1e293b', '#090d16']
      );
    }

    // Bull Horns, White Beard & Glowing Eyes
    surf.drawLimbSegment(ox + cx - 10, bodyY - 16, ox + cx - 22, bodyY - 28, 3, bp.palette.hatOrHelm ?? bp.palette.hair);
    surf.drawLimbSegment(ox + cx + 10, bodyY - 16, ox + cx + 22, bodyY - 28, 3, bp.palette.hatOrHelm ?? bp.palette.hair);
    surf.fillShadedBox(ox + cx - 10, bodyY - 6, 20, 10, bp.palette.hair);
    surf.fillRect(ox + cx - 4, bodyY - 11, 3, 2, '#ef4444');
    surf.fillRect(ox + cx + 4, bodyY - 11, 3, 2, '#ef4444');
    return;
  }

  if (sub === 'winged_phoenix') {
    // Marco Phoenix / King Pteranodon: Large flapping wings + talons anchored to groundY
    const phase = (f / Math.max(1, totalFrames)) * Math.PI * 2;
    const flapY = Math.round(Math.sin(phase) * 12);
    const surgeX = state === 'MOVE' ? Math.round(Math.cos(phase) * 4) : f % 2 === 1 ? 1 : -1;
    const bodyY = oy + groundY - Math.round(fh * 0.36) + (f % 2 === 1 ? -1 : 0);

    // Talons touching exact groundY
    surf.drawLimbSegment(ox + cx + surgeX - 5, bodyY + 10, ox + cx - 7, oy + groundY - 2, 2, bp.palette.accent);
    surf.drawLimbSegment(ox + cx + surgeX + 5, bodyY + 10, ox + cx + 7, oy + groundY - 2, 2, bp.palette.accent);

    // Back & Front Giant Wings
    surf.drawLimbSegment(
      ox + cx + surgeX - 4,
      bodyY,
      ox + cx + surgeX - Math.round(fw * 0.36),
      bodyY - 10 + flapY,
      Math.max(3, Math.round(fw * 0.06)),
      bp.palette.coatOrWings ?? bp.palette.top
    );
    surf.drawLimbSegment(
      ox + cx + surgeX + 4,
      bodyY,
      ox + cx + surgeX + Math.round(fw * 0.36),
      bodyY - 10 - flapY,
      Math.max(3, Math.round(fw * 0.06)),
      bp.palette.top
    );

    // Avian Body & Crest
    surf.fillCircle(ox + cx + surgeX, bodyY, Math.round(fw * 0.14), bp.palette.top);
    surf.fillCircle(ox + cx + surgeX + 6, bodyY - Math.round(fw * 0.14), Math.round(fw * 0.09), bp.palette.hair);
    surf.fillRect(ox + cx + surgeX + 12, bodyY - Math.round(fw * 0.15), 4, 3, bp.palette.accent[0]);
    return;
  }
}

function clampCellToGroundPlane(
  surf: RigPixelSurface,
  ox: number,
  oy: number,
  fw: number,
  fh: number,
  groundY: number
): void {
  for (let y = oy + groundY + 1; y < oy + fh; y++) {
    for (let x = ox; x < ox + fw; x++) {
      const idx = (y * surf.width + x) * 4;
      surf.data[idx] = 0;
      surf.data[idx + 1] = 0;
      surf.data[idx + 2] = 0;
      surf.data[idx + 3] = 0;
    }
  }
}

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

  // Special Giant Beast sub-rigs (Dragon, Spider-Oni, Winged Phoenix)
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

  // Chopper Guard Point spherical fur expansion
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
    // Tiny hooves at exact groundY
    surf.fillRect(ox + 17 - stride, oy + groundY - 2 + liftL, 4, 3, bp.palette.bottom[2]);
    surf.fillRect(ox + 27 + stride, oy + groundY - 2 + liftR, 4, 3, bp.palette.bottom[2]);
    // Giant fluffy fur sphere
    surf.fillCircle(ox + 24 + Math.sign(stride), oy + groundY - 15 + bob, 13, bp.palette.top);
    // Head & pink hat peeking at top
    surf.fillShadedBox(ox + 19 + stride, oy + groundY - 30 + bob, 10, 6, bp.palette.hatOrHelm ?? bp.palette.accent);
    clampCellToGroundPlane(surf, ox, oy, fw, fh, groundY);
    surf.applyCellHueShiftedOutline(ox, oy, fw, fh, groundY);
    return;
  }

  const pose = computeJointPoseForFrame(bp, state, frameIdx, totalFrames);

  // Downed horizontal pose anchored at groundY
  if (pose.isDowned) {
    const by = oy + groundY - Math.round(3 * s);
    surf.fillRect(ox + Math.round(8 * s), oy + groundY - 1, Math.round(32 * s), 2, '#090d16', 110);
    surf.fillShadedBox(ox + Math.round(10 * s), by - Math.round(3 * s), Math.round(8 * s), Math.round(6 * s), bp.palette.skin);
    surf.fillShadedBox(ox + Math.round(18 * s), by - Math.round(3 * s), Math.round(12 * s), Math.round(6 * s), bp.palette.top);
    surf.fillShadedBox(ox + Math.round(30 * s), oy + groundY - Math.round(5 * s) + 1, Math.round(10 * s), Math.round(5 * s), bp.palette.bottom);
    surf.applyCellHueShiftedOutline(ox, oy, fw, fh, groundY);
    return;
  }

  // 1. Ground Shadow anchored strictly at groundY - 1 .. groundY
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

  // 2. Back Cape / Justice Coat / Wings / Hagoromo Cloud Sash
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
  surf.drawLimbSegment(
    ox + pose.backShoulderX,
    oy + pose.backShoulderY,
    ox + pose.backElbowX,
    oy + pose.backElbowY,
    limbR,
    bp.palette.top
  );
  surf.drawLimbSegment(
    ox + pose.backElbowX,
    oy + pose.backElbowY,
    ox + pose.backHandX,
    oy + pose.backHandY,
    limbR,
    armTones
  );

  // Dual-wield or Santoryu left-hand blade
  if (
    bp.weaponMount === 'dual_hand' ||
    bp.weaponMount === 'santoryu_mouth' ||
    bp.weaponMount === 'quad_giraffe'
  ) {
    surf.drawWeaponBlade(
      ox + pose.backHandX,
      oy + pose.backHandY,
      pose.weaponAngleRad + 0.5,
      Math.round(13 * s),
      Math.max(1, Math.round(1.5 * s)),
      bp.palette.weaponOrEffect
    );
  }

  // 4. Back Leg (strictly touching pose.backFootY as its lowest opaque row)
  surf.drawLimbSegment(
    ox + pose.backHipX,
    oy + pose.backHipY,
    ox + pose.backKneeX,
    oy + pose.backKneeY,
    limbR + 1,
    bp.palette.bottom
  );
  surf.drawLimbSegment(
    ox + pose.backKneeX,
    oy + pose.backKneeY,
    ox + pose.backFootX,
    oy + pose.backFootY - limbR - 1,
    limbR,
    bp.palette.bottom
  );
  surf.fillRect(
    ox + pose.backFootX - Math.round(2 * s),
    oy + pose.backFootY - footH + 1,
    Math.max(4, Math.round(5 * s)),
    footH,
    bp.palette.accent[2]
  );

  // 5. Torso & Outfit
  const tw = Math.round((bp.rigType === 'bulky_tall_coat' ? 13 : 10) * s);
  const th = Math.round((bp.rigType === 'small_agile' ? 7 : 10) * s);
  surf.fillShadedBox(
    ox + pose.torsoX - Math.round(tw * 0.5),
    oy + pose.torsoY - Math.round(th * 0.45),
    tw,
    th,
    bp.palette.top
  );
  // Waist sash / haramaki / belt
  surf.fillShadedBox(
    ox + pose.torsoX - Math.round(tw * 0.5),
    oy + pose.torsoY + Math.round(th * 0.25),
    tw,
    Math.max(2, Math.round(2.5 * s)),
    bp.palette.accent
  );

  // 6 & 7. Head, Hair, Hat & Face details
  drawHeadAndFace(surf, ox, oy, bp, pose, s);

  // Santoryu 3rd sword in mouth (Zoro!)
  if (bp.weaponMount === 'santoryu_mouth') {
    surf.drawWeaponBlade(
      ox + pose.headX + Math.round(2 * s),
      oy + pose.headY + Math.round(2 * s),
      0.05,
      Math.round(14 * s),
      Math.max(1, Math.round(1.5 * s)),
      bp.palette.weaponOrEffect,
      '#f8fafc'
    );
  }

  // 8. Front Leg (with optional Sanji Diable Jambe flame leg, strictly touching pose.frontFootY)
  const frontLegTones: ThreeToneHex =
    bp.elementalArm === 'fire_leg' || (bp.attackStyle === 'kick' && pose.smearArcActive)
      ? bp.palette.weaponOrEffect
      : bp.palette.bottom;
  surf.drawLimbSegment(
    ox + pose.frontHipX,
    oy + pose.frontHipY,
    ox + pose.frontKneeX,
    oy + pose.frontKneeY,
    limbR + 1,
    bp.palette.bottom
  );
  surf.drawLimbSegment(
    ox + pose.frontKneeX,
    oy + pose.frontKneeY,
    ox + pose.frontFootX,
    oy + pose.frontFootY - limbR - 1,
    limbR,
    frontLegTones
  );
  surf.fillRect(
    ox + pose.frontFootX - Math.round(2 * s),
    oy + pose.frontFootY - footH + 1,
    Math.max(4, Math.round(5 * s)),
    footH,
    frontLegTones[2]
  );

  // 9. Front Arm
  const fistR =
    bp.coatStyle === 'cyborg_arms'
      ? limbR + Math.round(2 * s)
      : bp.attackStyle === 'stretch_punch' && pose.smearArcActive
        ? limbR + Math.round(2 * s)
        : limbR;
  surf.drawLimbSegment(
    ox + pose.frontShoulderX,
    oy + pose.frontShoulderY,
    ox + pose.frontElbowX,
    oy + pose.frontElbowY,
    limbR,
    bp.palette.top
  );
  surf.drawLimbSegment(
    ox + pose.frontElbowX,
    oy + pose.frontElbowY,
    ox + pose.frontHandX,
    oy + pose.frontHandY,
    fistR,
    armTones
  );

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
    surf.drawWeaponBlade(
      ox + pose.frontHandX,
      oy + pose.frontHandY,
      pose.weaponAngleRad,
      bladeLen,
      bladeThick,
      bp.palette.weaponOrEffect
    );
  } else if (bp.casterProp === 'clima_tact_zeus') {
    // Nami Clima-Tact staff + floating Zeus cloud
    surf.drawWeaponBlade(
      ox + pose.frontHandX,
      oy + pose.frontHandY,
      pose.weaponAngleRad,
      Math.round(13 * s),
      2,
      ['#7dd3fc', '#0284c7', '#0369a1']
    );
    surf.fillCircle(
      ox + pose.torsoX + Math.round(12 * s),
      oy + pose.headY - Math.round(2 * s),
      Math.round(3.5 * s),
      ['#ffffff', '#fef08a', '#facc15']
    );
  } else if (bp.casterProp === 'kabuto_slingshot') {
    surf.drawWeaponBlade(
      ox + pose.frontHandX,
      oy + pose.frontHandY,
      0,
      Math.round(9 * s),
      2,
      bp.palette.weaponOrEffect
    );
  }

  if (pose.smearArcActive) {
    surf.drawSmearArc(
      ox + pose.torsoX + Math.round(2 * s),
      oy + pose.torsoY,
      Math.round(14 * s),
      -0.95,
      0.85,
      bp.palette.weaponOrEffect
    );
  }

  if (pose.castBurstActive) {
    surf.fillCircle(
      ox + Math.min(fw - 6, pose.frontHandX + Math.round(4 * s)),
      oy + pose.frontHandY,
      Math.max(2, Math.round(3.5 * s)),
      bp.palette.weaponOrEffect
    );
  }

  // 11. Clamp to ground plane and apply automatic 1px Hue-Shifted Exterior Outline
  clampCellToGroundPlane(surf, ox, oy, fw, fh, groundY);
  surf.applyCellHueShiftedOutline(ox, oy, fw, fh, groundY);
}

/**
 * Generates multi-frame RGBA pixel buffer for a ship sprite sheet (Going Merry, Thousand Sunny, Marine Warship, Sea King).
 */
export function bakeShipSpriteSheetPixels(
  shipId: string,
  fw: number,
  fh: number
): { width: number; height: number; data: Uint8ClampedArray } {
  const width = fw * RIG_SHEET_COLUMNS;
  const height = fh * RIG_SHEET_ROWS;
  const surf = new RigPixelSurface(width, height);
  const anims = createStandardRigAnimations();
  const s = Math.max(1, fw / 48);
  const groundY = Math.round(fh * 0.85);

  const hullTones: ThreeToneHex =
    shipId === 'thousand_sunny'
      ? ['#F59E0B', '#B45309', '#78350F']
      : shipId === 'marine_warship'
        ? ['#94A3B8', '#475569', '#1E293B']
        : shipId === 'sea_king'
          ? ['#2DD4BF', '#0F766E', '#134E4A']
          : ['#D97706', '#92400E', '#451A03'];
  const sailTones: ThreeToneHex =
    shipId === 'sea_king'
      ? ['#5EEAD4', '#14B8A6', '#0F766E']
      : ['#FFFFFF', '#E2E8F0', '#94A3B8'];
  const emblemTones: ThreeToneHex =
    shipId === 'thousand_sunny'
      ? ['#FEF08A', '#FACC15', '#CA8A04']
      : shipId === 'marine_warship'
        ? ['#7DD3FC', '#0284C7', '#1E3A8A']
        : ['#F87171', '#DC2626', '#7F1D1D'];

  for (let rowIdx = 0; rowIdx < STANDARD_SPRITE_ANIM_STATES.length; rowIdx++) {
    const state = STANDARD_SPRITE_ANIM_STATES[rowIdx];
    const clip = anims[state];
    for (let f = 0; f < clip.frames; f++) {
      const ox = f * fw;
      const oy = rowIdx * fh;
      const bob = f % 2 === 1 ? -Math.round(1 * s) : 0;
      const sailBillow = (f % 3) * Math.round(1 * s);

      // Wake water foam
      surf.fillRect(
        ox + Math.round(fw * 0.14),
        oy + groundY - Math.round(2 * s),
        Math.round(fw * 0.72),
        Math.max(2, Math.round(2 * s)),
        '#bae6fd',
        140
      );

      if (shipId === 'sea_king') {
        surf.fillShadedBox(
          ox + Math.round(fw * 0.16),
          oy + Math.round(fh * 0.42) + bob,
          Math.round(fw * 0.62),
          Math.round(fh * 0.36),
          hullTones
        );
        surf.fillShadedBox(
          ox + Math.round(fw * 0.56),
          oy + Math.round(fh * 0.2) + bob,
          Math.round(fw * 0.26),
          Math.round(fh * 0.32),
          sailTones
        );
        surf.fillRect(
          ox + Math.round(fw * 0.7),
          oy + Math.round(fh * 0.26) + bob,
          Math.max(2, Math.round(3 * s)),
          Math.max(2, Math.round(3 * s)),
          '#ef4444'
        );
      } else {
        // Coup de Burst rear jet on DODGE / TRANSFORM / MOVE
        if (state === 'DODGE' || state === 'TRANSFORM' || (state === 'MOVE' && f % 2 === 0)) {
          surf.fillShadedBox(
            ox + Math.round(fw * 0.04),
            oy + Math.round(fh * 0.52) + bob,
            Math.round(fw * 0.16),
            Math.round(fh * 0.14),
            ['#E0F2FE', '#38BDF8', '#0284C7']
          );
        }
        // Hull
        surf.fillShadedBox(
          ox + Math.round(fw * 0.18),
          oy + Math.round(fh * 0.56) + bob,
          Math.round(fw * 0.62),
          Math.round(fh * 0.22),
          hullTones
        );
        // Mast
        surf.fillRect(
          ox + Math.round(fw * 0.46),
          oy + Math.round(fh * 0.16) + bob,
          Math.max(2, Math.round(3 * s)),
          Math.round(fh * 0.42),
          '#451a03'
        );
        // Billowing Sail
        surf.fillShadedBox(
          ox + Math.round(fw * 0.32),
          oy + Math.round(fh * 0.22) + bob,
          Math.round(fw * 0.34) + sailBillow,
          Math.round(fh * 0.28),
          sailTones
        );
        // Figurehead & Emblem
        surf.fillShadedBox(
          ox + Math.round(fw * 0.44),
          oy + Math.round(fh * 0.3) + bob,
          Math.round(fw * 0.12),
          Math.round(fh * 0.1),
          emblemTones
        );
        surf.fillShadedBox(
          ox + Math.round(fw * 0.74),
          oy + Math.round(fh * 0.46) + bob,
          Math.round(fw * 0.14),
          Math.round(fh * 0.16),
          emblemTones
        );
      }
      surf.applyCellHueShiftedOutline(ox, oy, fw, fh, groundY);
    }
  }

  return { width, height, data: surf.data };
}

/**
 * Generates the complete 6-col x 11-row multi-frame RGBA pixel buffer for a character blueprint.
 */
export function bakeCharacterSpriteSheetPixels(bp: CharacterBlueprintEntry): {
  width: number;
  height: number;
  data: Uint8ClampedArray;
} {
  // Preserve exact canonical luffy_base pixel sheet
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
