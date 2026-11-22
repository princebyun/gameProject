import type { SpriteAnimState } from '../../../data/assets/types';
import type { CharacterBlueprintEntry } from './rigTypes';

export interface JointFramePose {
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
export function computeJointPoseForFrame(
  bp: CharacterBlueprintEntry,
  state: SpriteAnimState,
  f: number,
  totalFrames: number
): JointFramePose {
  const fw = bp.frameWidth;
  const fh = bp.frameHeight;
  const s = fw / 48;
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
  const wingFlapOffset = Math.round(
    Math.sin((f / Math.max(1, totalFrames)) * Math.PI * 2) * 5 * s
  );
  let splitBodyOffset = 0;

  if (state === 'IDLE') {
    const breath = f === 1 || f === 2 ? -Math.max(1, Math.round(1 * s)) : 0;
    torsoY += breath;
    headY += breath;
    backHandY += breath;
    frontHandY += f % 2 === 1 ? -1 : 0;
    weaponAngleRad = -0.55 + (f % 2) * 0.08;
  } else if (state === 'MOVE') {
    const strideTable = [8, 4, 0, -8, -4, 0];
    const liftFrontTable = [0, 0, -3, -2, -3, 0];
    const liftBackTable = [-2, -3, 0, 0, 0, -3];
    const bobTable = [-1, 1, 0, -1, 1, 0];
    const idx = f % 6;
    const stride = Math.round((strideTable[idx] ?? 0) * s);

    torsoX = cx + Math.round(2 * s);
    torsoY += Math.round((bobTable[idx] ?? 0) * s);
    headX = torsoX + Math.round(1 * s);
    headY = torsoY - Math.round((isSmall ? 7 : 9) * s);

    frontFootX = cx + stride;
    frontFootY = groundY + Math.round((liftFrontTable[idx] ?? 0) * s);
    backFootX = cx - stride;
    backFootY = groundY + Math.round((liftBackTable[idx] ?? 0) * s);

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
      torsoX = cx - Math.round(1 * s);
      headX = torsoX - Math.round(2 * s);
      backFootX = cx - Math.round(2 * s);
      backFootY = groundY;
      frontFootX = cx + Math.round((f === 0 ? 8 : f === 1 ? 14 : isHit ? 19 : 11) * s);
      frontFootY = groundY - Math.round((f === 0 ? 5 : f === 1 ? 12 : isHit ? 16 : 7) * s);
      frontHandX = torsoX - Math.round(4 * s);
      frontHandY = torsoY + Math.round(3 * s);
      smearArcActive = f === 1 || isHit;
    } else if (bp.attackStyle === 'stretch_punch') {
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
