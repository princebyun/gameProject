import type { RigPixelSurface } from './pixelSurface';
import type { JointFramePose } from './rigJointPoseSolver';
import type { CharacterBlueprintEntry, ThreeToneHex } from './rigTypes';

export function drawBackLayerCoatWingsHagoromo(
  surf: RigPixelSurface,
  ox: number,
  oy: number,
  bp: CharacterBlueprintEntry,
  pose: JointFramePose,
  s: number
): void {
  const coatTones: ThreeToneHex = bp.palette.coatOrWings ?? bp.palette.accent;

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

  if (bp.coatStyle === 'lunarian_wings') {
    const flameTones: ThreeToneHex = ['#fef08a', '#f97316', '#dc2626'];
    surf.fillCircle(
      ox + pose.torsoX - Math.round(6 * s),
      oy + pose.torsoY - Math.round(5 * s) - (pose.capeFlutterOffset % 3),
      Math.max(2, Math.round(3.5 * s)),
      flameTones
    );
    surf.drawLimbSegment(
      ox + pose.torsoX - Math.round(2 * s),
      oy + pose.torsoY - Math.round(2 * s),
      ox + pose.torsoX - Math.round(13 * s),
      oy + pose.torsoY - Math.round(9 * s) + pose.wingFlapOffset,
      Math.max(2, Math.round(2.5 * s)),
      coatTones
    );
  }

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

export function drawHeadAndFace(
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

  surf.fillRect(
    hx - Math.round(1.5 * s),
    hy + headR - 1,
    Math.max(2, Math.round(3 * s)),
    Math.max(2, Math.round(3 * s)),
    bp.palette.skin[2]
  );

  surf.fillShadedBox(
    hx - headR,
    hy - headR + 1,
    headR * 2 + 1,
    headR * 2,
    bp.palette.skin
  );

  const hair = bp.palette.hair;
  const hat = bp.palette.hatOrHelm ?? bp.palette.accent;
  const hs = bp.head.hairStyle;

  if (hs === 'flame_white_nika') {
    surf.fillCircle(hx, hy - headR - Math.round(1 * s), Math.round(5 * s), hair);
    surf.fillCircle(hx - Math.round(4 * s), hy - headR, Math.round(3 * s), hair);
    surf.fillCircle(hx + Math.round(4 * s), hy - headR - Math.round(1 * s), Math.round(3 * s), hair);
  } else if (hs === 'reindeer_antlers_hat') {
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
    surf.setPixel(hx, hy - headR - Math.round(1 * s), '#ffffff');
    surf.setPixel(hx - 1, hy - headR - Math.round(2 * s), '#ffffff');
    surf.setPixel(hx + 1, hy - headR - Math.round(2 * s), '#ffffff');
  } else if (hs === 'giant_afro_skull') {
    surf.fillCircle(hx - 1, hy - Math.round(3 * s), Math.round(7.5 * s), hair);
  } else if (hs === 'oni_horns_mane' || hs === 'viking_horned_helm') {
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
    surf.fillRect(
      hx - headR - 2,
      hy - headR + 1,
      headR * 2 + 5,
      Math.max(1, Math.round(1.5 * s)),
      hat[0]
    );
  } else if (hs === 'long_wavy' || hs === 'long_straight_dark') {
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
    surf.fillShadedBox(
      hx - headR - 1,
      hy - headR - Math.round(2 * s),
      headR * 2 + 3,
      Math.max(3, Math.round(3.5 * s)),
      hair
    );
  }

  const eyeHex = bp.palette.eyeColor ?? '#090d16';
  surf.setPixel(hx + Math.round(2 * s), hy, eyeHex);
  if (bp.head.hairStyle !== 'side_sweep_left_covered') {
    surf.setPixel(hx - Math.round(1 * s), hy, eyeHex);
  }
  if (bp.head.faceFeature === 'long_nose_goggles') {
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

export function clampCellToGroundPlane(
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
