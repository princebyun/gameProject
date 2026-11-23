import { clamp, type Vec2 } from '../../core/math/vector2';
import type { BattleWorldState } from '../../core/types/battleState';
import type { GameDataRegistry } from '../../core/types/dataSchemas';
import { lerpVecInto } from '../pools/renderScratchPools';
import {
  isCircleInBounds,
  isSegmentInBounds,
  type ViewportWorldBounds
} from '../viewport/frustumCulling';
import {
  drawConquerorLightningBolts,
  getElementColorFast
} from './arenaVfxPrimitives';
import type { VfxAtlasProvider, VfxAtlasRenderer } from './vfxAtlasRenderer';

const SCRATCH_PROJ_POS: Vec2 = { x: 0, y: 0 };
const SCRATCH_BOLT_POS: Vec2 = { x: 0, y: 0 };

export function renderArenaAttacksAndProjectiles(
  ctx: CanvasRenderingContext2D,
  world: BattleWorldState,
  registry: GameDataRegistry,
  alpha: number,
  visibleBounds?: ViewportWorldBounds
): void {
  // Observation Haki Lv.3 Future Sight Prediction Lines
  let hasFutureSightObserver = false;
  for (let i = 0; i < world.units.length; i++) {
    const u = world.units[i];
    if (u && u.isOnField && u.isAlive && (u.haki?.observation ?? 0) >= 3) {
      hasFutureSightObserver = true;
      break;
    }
  }
  if (hasFutureSightObserver) {
    for (let i = 0; i < world.units.length; i++) {
      const u = world.units[i];
      if (!u || !u.isOnField || !u.isAlive || !u.windupMoveId || u.windupTimer <= 0) continue;
      const mDef = registry.moves[u.windupMoveId];
      if (!mDef) continue;
      const ux = Math.round(u.pos.x);
      const uy = Math.round(u.pos.y);
      const ex = Math.round(u.pos.x + u.windupAimDir.x * mDef.rangePx);
      const ey = Math.round(u.pos.y + u.windupAimDir.y * mDef.rangePx);
      if (!isSegmentInBounds(visibleBounds, ux, uy, ex, ey, 24)) continue;

      ctx.save();
      ctx.setLineDash([6, 4]);
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(ux, uy);
      ctx.lineTo(ex, ey);
      ctx.stroke();
      ctx.font = 'bold 9px monospace';
      ctx.fillStyle = '#f87171';
      ctx.textAlign = 'center';
      ctx.fillText('FUTURE SIGHT!', ux, uy - 38);
      ctx.restore();
    }
  }

  // Active Melee Arcs
  for (const arc of world.meleeArcs) {
    const ax = Math.round(arc.origin.x);
    const ay = Math.round(arc.origin.y);
    if (!isCircleInBounds(visibleBounds, ax, ay, arc.radiusPx + 16)) continue;
    const baseAngle = Math.atan2(arc.dir.y, arc.dir.x);
    const halfArc = (arc.arcDeg * 0.5 * Math.PI) / 180;
    const isLingeringDeflect = arc.elapsedSec > arc.activeDamageDurationSec;

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.arc(ax, ay, arc.radiusPx, baseAngle - halfArc, baseAngle + halfArc);
    ctx.closePath();

    if (arc.hasConquerorCoating) {
      ctx.fillStyle = 'rgba(220, 38, 38, 0.28)';
      ctx.fill();
      ctx.strokeStyle = '#090d16';
      ctx.lineWidth = 4;
      ctx.stroke();
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 2;
      ctx.stroke();
      drawConquerorLightningBolts(ctx, arc.origin, arc.radiusPx * 0.9, world.tick, 3);
    } else if (arc.hasArmamentHaki) {
      ctx.fillStyle = isLingeringDeflect
        ? 'rgba(15, 23, 42, 0.32)'
        : 'rgba(15, 23, 42, 0.52)';
      ctx.fill();
      ctx.strokeStyle = '#e11d48';
      ctx.lineWidth = 3;
      ctx.stroke();
    } else {
      ctx.fillStyle = isLingeringDeflect
        ? 'rgba(45, 212, 191, 0.16)'
        : 'rgba(250, 204, 21, 0.28)';
      ctx.fill();
      ctx.strokeStyle = isLingeringDeflect ? '#2dd4bf' : '#fde047';
      ctx.lineWidth = isLingeringDeflect ? 2 : 3;
      ctx.stroke();
    }
    ctx.restore();
  }

  // Active Beams
  for (const beam of world.beams) {
    const ox = Math.round(beam.origin.x);
    const oy = Math.round(beam.origin.y);
    const endX = Math.round(beam.origin.x + beam.dir.x * beam.currentLengthPx);
    const endY = Math.round(beam.origin.y + beam.dir.y * beam.currentLengthPx);
    if (!isSegmentInBounds(visibleBounds, ox, oy, endX, endY, beam.widthPx)) continue;
    const beamColor = getElementColorFast(registry, beam.element, '#38bdf8');

    ctx.save();
    ctx.globalAlpha = beam.dimmed ? 0.45 : 0.92;
    if (beam.dimmed) {
      ctx.setLineDash([10, 6]);
    }

    ctx.strokeStyle = beamColor;
    ctx.lineWidth = beam.widthPx;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(ox, oy);
    ctx.lineTo(endX, endY);
    ctx.stroke();

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = Math.max(4, beam.widthPx * 0.38);
    ctx.beginPath();
    ctx.moveTo(ox, oy);
    ctx.lineTo(endX, endY);
    ctx.stroke();
    ctx.restore();
  }

  // Active Projectiles
  for (const proj of world.projectiles) {
    const p = lerpVecInto(proj.prevPos, proj.pos, alpha, SCRATCH_PROJ_POS);
    const px = Math.round(p.x);
    const py = Math.round(p.y);
    if (!isCircleInBounds(visibleBounds, px, py, proj.radiusPx * 2 + 24)) continue;
    const color = getElementColorFast(registry, proj.element, '#f97316');

    let heightOffset = 0;
    if (proj.pattern === 'PARABOLIC') {
      const t = clamp(proj.elapsedSec / Math.max(0.01, proj.maxDurationSec), 0, 1);
      heightOffset = Math.round(Math.sin(t * Math.PI) * 38);
      ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
      ctx.beginPath();
      ctx.arc(px, py, proj.radiusPx * 0.7, 0, Math.PI * 2);
      ctx.fill();
    }

    const drawY = py - heightOffset;
    ctx.save();
    ctx.fillStyle = proj.hasArmamentHaki ? '#090d16' : color;
    ctx.beginPath();
    ctx.arc(px, drawY, proj.radiusPx, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = proj.hasConquerorCoating ? '#ef4444' : color;
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(px, drawY, proj.radiusPx * 0.4, 0, Math.PI * 2);
    ctx.fill();

    if (proj.hasConquerorCoating) {
      SCRATCH_BOLT_POS.x = px;
      SCRATCH_BOLT_POS.y = drawY;
      drawConquerorLightningBolts(ctx, SCRATCH_BOLT_POS, proj.radiusPx * 1.6, world.tick, 2);
    }
    ctx.restore();
  }
}

export interface ArenaVfxHost extends VfxAtlasProvider {
  readonly vfxAtlasRenderer: VfxAtlasRenderer;
}

export function renderArenaClashSparksAndFloatingTexts(
  ctx: CanvasRenderingContext2D,
  world: BattleWorldState,
  visibleBounds?: ViewportWorldBounds,
  vfxHost?: ArenaVfxHost
): void {
  if (vfxHost) {
    vfxHost.vfxAtlasRenderer.syncAndRenderWorldVfx(ctx, world, vfxHost, visibleBounds);
  }
  for (const bc of world.beamClashes) {
    const cx = Math.round(bc.clashPoint.x);
    const cy = Math.round(bc.clashPoint.y);
    if (!isCircleInBounds(visibleBounds, cx, cy, 32)) continue;
    const pulse = 18 + Math.sin(world.tick * 0.6) * 5;
    ctx.save();
    ctx.fillStyle = '#fde047';
    ctx.beginPath();
    ctx.arc(cx, cy, pulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(cx, cy, pulse * 0.55, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  for (const mg of world.meleeBeamGuards) {
    const gx = Math.round(mg.clashPoint.x);
    const gy = Math.round(mg.clashPoint.y);
    if (!isCircleInBounds(visibleBounds, gx, gy, 30)) continue;
    ctx.save();
    ctx.strokeStyle = '#2dd4bf';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(gx, gy, 24, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  for (const mc of world.meleeClashes) {
    const mx = Math.round(mc.clashPoint.x);
    const my = Math.round(mc.clashPoint.y);
    if (!isCircleInBounds(visibleBounds, mx, my, 64)) continue;
    ctx.save();
    if (mc.isConquerorSkySplit) {
      drawConquerorLightningBolts(ctx, mc.clashPoint, 58, world.tick, 6);
    }
    ctx.strokeStyle = mc.isConquerorSkySplit ? '#ef4444' : '#facc15';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(mx - 16, my - 16);
    ctx.lineTo(mx + 16, my + 16);
    ctx.moveTo(mx + 16, my - 16);
    ctx.lineTo(mx - 16, my + 16);
    ctx.stroke();
    ctx.restore();
  }

  for (const vfx of world.vfxEvents) {
    const vx = Math.round(vfx.pos.x);
    const vy = Math.round(vfx.pos.y);
    if (vfx.kind === 'CROSS_SLASH' && vfx.targetPos) {
      if (!isSegmentInBounds(visibleBounds, vx, vy, vfx.targetPos.x, vfx.targetPos.y, 16)) {
        continue;
      }
    } else if (!isCircleInBounds(visibleBounds, vx, vy, vfx.radiusPx * 1.25 + 16)) {
      continue;
    }
    const t = clamp(vfx.elapsedSec / Math.max(0.01, vfx.durationSec), 0, 1);
    ctx.save();
    ctx.globalAlpha = 1 - t;
    ctx.strokeStyle = vfx.color;
    ctx.lineWidth = 3;

    if (vfx.kind === 'CROSS_SLASH' && vfx.targetPos) {
      ctx.beginPath();
      ctx.moveTo(vx, vy);
      ctx.lineTo(Math.round(vfx.targetPos.x), Math.round(vfx.targetPos.y));
      ctx.stroke();
    } else if (vfx.kind === 'CONQUEROR_LIGHTNING' || vfx.kind === 'SKY_SPLIT_SHOCKWAVE') {
      drawConquerorLightningBolts(ctx, vfx.pos, vfx.radiusPx * (0.5 + t * 0.7), world.tick, 5);
      ctx.beginPath();
      ctx.arc(vx, vy, vfx.radiusPx * (0.4 + t * 0.8), 0, Math.PI * 2);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.arc(vx, vy, vfx.radiusPx * (0.4 + t * 0.8), 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  if (world.floatingTexts.length === 0) return;
  ctx.save();
  ctx.font = 'bold 11px monospace';
  ctx.textAlign = 'center';
  for (const ft of world.floatingTexts) {
    const fx = Math.round(ft.pos.x);
    const fy = Math.round(ft.pos.y);
    if (!isCircleInBounds(visibleBounds, fx, fy, 48)) continue;
    const t = clamp(ft.elapsedSec / Math.max(0.01, ft.durationSec), 0, 1);
    ctx.globalAlpha = 1 - t * 0.85;
    ctx.fillStyle = '#000000';
    ctx.fillText(ft.text, fx + 1, fy + 1);
    ctx.fillStyle = ft.color;
    ctx.fillText(ft.text, fx, fy);
  }
  ctx.restore();
}
