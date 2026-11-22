import type { SpriteAnimState } from '../../../data/assets/types';
import type { RigPixelSurface } from './pixelSurface';
import type { CharacterBlueprintEntry } from './rigTypes';

export function drawGiantBeastCell(
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

  surf.fillRect(ox + Math.round(fw * 0.16), oy + groundY - 1, Math.round(fw * 0.68), 2, '#090d16', 110);

  if (sub === 'serpentine_dragon') {
    const phase = (f / Math.max(1, totalFrames)) * Math.PI * 2;
    const isCast = state === 'ATTACK_CAST' || state === 'ATTACK_MELEE';

    surf.fillShadedBox(ox + 18, oy + groundY - 8, 56, 9, bp.palette.bottom);

    for (let seg = 0; seg < 7; seg++) {
      const waveY = Math.round(Math.sin(phase + seg * 0.9) * 6);
      const sx = ox + 18 + seg * 9 + (isCast && f === 2 ? 4 : 0);
      const sy = Math.min(oy + groundY - 9, oy + groundY - 14 - seg * 7 + waveY);
      surf.fillCircle(sx, sy, 8 - Math.floor(seg * 0.4), bp.palette.top);
      surf.fillRect(sx - 3, sy + 3, 6, 3, bp.palette.accent[1]);
    }

    const headX = ox + 64 + (isCast && f >= 1 ? 6 : 0);
    const headY = oy + 26 + (f % 2 === 0 ? -2 : 1);
    surf.fillShadedBox(headX - 8, headY - 7, 18, 13, bp.palette.top);
    surf.drawLimbSegment(headX - 4, headY - 7, headX - 10, headY - 16, 2, bp.palette.hair);
    surf.drawLimbSegment(headX + 2, headY - 7, headX - 2, headY - 16, 2, bp.palette.hair);
    surf.fillRect(headX + 4, headY - 3, 3, 2, '#ef4444');
    if (isCast && f >= 1) {
      surf.fillShadedBox(headX + 8, headY - 3, 14, 9, bp.palette.weaponOrEffect);
    }
    return;
  }

  if (sub === 'spider_oni') {
    const legPairs = [-24, -10, 8, 22];
    legPairs.forEach((offX, idx) => {
      const stepLift = state === 'MOVE' && (f + idx) % 2 === 1 ? -4 : 0;
      const footX = ox + cx + offX + (state === 'MOVE' ? ((f + idx) % 3) * 2 - 2 : 0);
      const footY = oy + groundY + stepLift;
      const kneeX = ox + cx + Math.round(offX * 1.25);
      const kneeY = oy + groundY - 18 + stepLift;
      surf.drawLimbSegment(ox + cx + Math.round(offX * 0.4), oy + groundY - 22, kneeX, kneeY, 3, bp.palette.bottom);
      surf.drawLimbSegment(kneeX, kneeY, footX, footY - 2, 2, bp.palette.bottom);
    });
    surf.fillShadedBox(ox + cx - 12, oy + groundY - 3, 6, 4, bp.palette.accent);
    surf.fillShadedBox(ox + cx + 8, oy + groundY - 3, 6, 4, bp.palette.accent);

    const bodyY = oy + groundY - 36 + (f % 2 === 1 ? -2 : 0);
    surf.fillCircle(ox + cx - 6, bodyY + 12, 16, bp.palette.bottom);
    surf.fillShadedBox(ox + cx - 14, bodyY - 14, 28, 24, bp.palette.top);

    for (let deg = 160; deg <= 380; deg += 25) {
      const rad = (deg * Math.PI) / 180;
      surf.fillCircle(
        ox + cx + Math.round(Math.cos(rad) * 26),
        bodyY - 4 + Math.round(Math.sin(rad) * 18),
        4,
        ['#475569', '#1e293b', '#090d16']
      );
    }

    surf.drawLimbSegment(ox + cx - 10, bodyY - 16, ox + cx - 22, bodyY - 28, 3, bp.palette.hatOrHelm ?? bp.palette.hair);
    surf.drawLimbSegment(ox + cx + 10, bodyY - 16, ox + cx + 22, bodyY - 28, 3, bp.palette.hatOrHelm ?? bp.palette.hair);
    surf.fillShadedBox(ox + cx - 10, bodyY - 6, 20, 10, bp.palette.hair);
    surf.fillRect(ox + cx - 4, bodyY - 11, 3, 2, '#ef4444');
    surf.fillRect(ox + cx + 4, bodyY - 11, 3, 2, '#ef4444');
    return;
  }

  if (sub === 'winged_phoenix') {
    const phase = (f / Math.max(1, totalFrames)) * Math.PI * 2;
    const flapY = Math.round(Math.sin(phase) * 12);
    const surgeX = state === 'MOVE' ? Math.round(Math.cos(phase) * 4) : f % 2 === 1 ? 1 : -1;
    const bodyY = oy + groundY - Math.round(fh * 0.36) + (f % 2 === 1 ? -1 : 0);

    surf.drawLimbSegment(ox + cx + surgeX - 5, bodyY + 10, ox + cx - 7, oy + groundY - 2, 2, bp.palette.accent);
    surf.drawLimbSegment(ox + cx + surgeX + 5, bodyY + 10, ox + cx + 7, oy + groundY - 2, 2, bp.palette.accent);

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

    surf.fillCircle(ox + cx + surgeX, bodyY, Math.round(fw * 0.14), bp.palette.top);
    surf.fillCircle(ox + cx + surgeX + 6, bodyY - Math.round(fw * 0.14), Math.round(fw * 0.09), bp.palette.hair);
    surf.fillRect(ox + cx + surgeX + 12, bodyY - Math.round(fw * 0.15), 4, 3, bp.palette.accent[0]);
  }
}
