import type { BattleWorldState } from '../../core/types/battleState';
import type { GameDataRegistry } from '../../core/types/dataSchemas';
import {
  isCircleInBounds,
  type ViewportWorldBounds
} from '../viewport/frustumCulling';

const MOCHI_PORTAL_RATIOS: readonly (readonly [number, number])[] = [
  [0.3, 0.25],
  [0.5, 0.18],
  [0.7, 0.25]
];

export function renderArenaEnvironmentAndHazards(
  ctx: CanvasRenderingContext2D,
  world: BattleWorldState,
  registry: GameDataRegistry,
  visibleBounds?: ViewportWorldBounds
): void {
  // Type C Environment Awakening Arena Overlay
  if (world.environmentField.kind !== 'NONE' && world.environmentField.remainingSec > 0) {
    ctx.save();
    if (world.environmentField.kind === 'RUBBER_BOUNCE_ZONE') {
      ctx.fillStyle = 'rgba(248, 250, 252, 0.10)';
      ctx.fillRect(0, 0, world.arenaWidth, world.arenaHeight);
      ctx.strokeStyle = 'rgba(244, 114, 182, 0.35)';
      ctx.lineWidth = 2;
      for (let x = 32; x < world.arenaWidth; x += 64) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x + Math.sin(world.tick * 0.1) * 10, world.arenaHeight);
        ctx.stroke();
      }
    } else if (world.environmentField.kind === 'K_ROOM_FIELD') {
      ctx.fillStyle = 'rgba(56, 189, 248, 0.10)';
      ctx.fillRect(0, 0, world.arenaWidth, world.arenaHeight);
    } else if (world.environmentField.kind === 'LIGHT_SPEED_REALM') {
      ctx.fillStyle = 'rgba(250, 204, 21, 0.09)';
      ctx.fillRect(0, 0, world.arenaWidth, world.arenaHeight);
    }
    ctx.restore();
  }

  // Persistent Magma & Ice Awakening Zones
  if (world.persistentZones.magmaActive || world.persistentZones.iceActive) {
    ctx.save();
    if (world.persistentZones.splitActive) {
      const midX = world.arenaWidth * 0.5;
      ctx.fillStyle = 'rgba(220, 38, 38, 0.24)';
      ctx.fillRect(0, 0, midX, world.arenaHeight);
      ctx.fillStyle = 'rgba(56, 189, 248, 0.24)';
      ctx.fillRect(midX, 0, world.arenaWidth - midX, world.arenaHeight);
      ctx.strokeStyle = '#f8fafc';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(midX, 0);
      for (let y = 24; y <= world.arenaHeight; y += 24) {
        ctx.lineTo(midX + (y % 48 === 0 ? 1 : -1) * 8, y);
      }
      ctx.stroke();
    } else if (world.persistentZones.magmaActive) {
      ctx.fillStyle = 'rgba(220, 38, 38, 0.20)';
      ctx.fillRect(0, 0, world.arenaWidth, world.arenaHeight);
    } else if (world.persistentZones.iceActive) {
      ctx.fillStyle = 'rgba(56, 189, 248, 0.20)';
      ctx.fillRect(0, 0, world.arenaWidth, world.arenaHeight);
    }
    ctx.restore();
  }

  // Doflamingo Birdcage Shrinking Red String Arena Overlay
  if (world.birdcage.active) {
    ctx.save();
    const halfW = world.arenaWidth * world.birdcage.shrinkScale * 0.5;
    const halfH = world.arenaHeight * world.birdcage.shrinkScale * 0.5;
    const cx = world.arenaWidth * 0.5;
    const cy = world.arenaHeight * 0.5;
    const bx = cx - halfW;
    const by = cy - halfH;
    const bw = halfW * 2;
    const bh = halfH * 2;

    ctx.fillStyle = 'rgba(225, 29, 72, 0.28)';
    ctx.fillRect(0, 0, world.arenaWidth, by);
    ctx.fillRect(0, by + bh, world.arenaWidth, world.arenaHeight - (by + bh));
    ctx.fillRect(0, by, bx, bh);
    ctx.fillRect(bx + bw, by, world.arenaWidth - (bx + bw), bh);

    ctx.strokeStyle = '#f43f5e';
    ctx.lineWidth = 3;
    ctx.strokeRect(bx, by, bw, bh);
    ctx.strokeStyle = 'rgba(253, 164, 175, 0.55)';
    ctx.lineWidth = 1;
    for (let sx = bx + 20; sx < bx + bw; sx += 28) {
      ctx.beginPath();
      ctx.moveTo(sx, by);
      ctx.lineTo(sx, by + 16);
      ctx.moveTo(sx, by + bh - 16);
      ctx.lineTo(sx, by + bh);
      ctx.stroke();
    }
    ctx.restore();
  }

  if (
    world.environmentField.kind === 'MOCHI_DONUT_WORLD' &&
    world.environmentField.remainingSec > 0
  ) {
    ctx.save();
    ctx.fillStyle = 'rgba(232, 121, 249, 0.12)';
    ctx.fillRect(0, 0, world.arenaWidth, world.arenaHeight);
    ctx.strokeStyle = '#e879f9';
    ctx.lineWidth = 4;
    for (let i = 0; i < MOCHI_PORTAL_RATIOS.length; i++) {
      const ratio = MOCHI_PORTAL_RATIOS[i];
      if (!ratio) continue;
      const px = Math.round(world.arenaWidth * ratio[0]);
      const py = Math.round(world.arenaHeight * ratio[1]);
      if (!isCircleInBounds(visibleBounds, px, py, 24)) continue;
      ctx.beginPath();
      ctx.arc(px, py, 18, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  // Arena tactical center lines & border
  ctx.strokeStyle =
    world.ruleReversal.kind === 'SPEED_INVERSION' && world.ruleReversal.remainingSec > 0
      ? '#c084fc'
      : '#38bdf8';
  ctx.lineWidth = 2;
  ctx.strokeRect(0, 0, world.arenaWidth, world.arenaHeight);

  ctx.strokeStyle = 'rgba(148, 163, 184, 0.14)';
  ctx.beginPath();
  ctx.moveTo(world.arenaWidth * 0.5, 0);
  ctx.lineTo(world.arenaWidth * 0.5, world.arenaHeight);
  ctx.stroke();

  if (world.weather.remainingSec > 0 && world.weather.id !== 'NONE') {
    if (world.weather.id === 'SOLAR_FLARE') {
      ctx.fillStyle = 'rgba(249, 115, 22, 0.08)';
    } else if (world.weather.id === 'TEMPEST_RAIN') {
      ctx.fillStyle = 'rgba(56, 189, 248, 0.09)';
    } else {
      ctx.fillStyle = 'rgba(192, 132, 252, 0.09)';
    }
    ctx.fillRect(0, 0, world.arenaWidth, world.arenaHeight);
  }

  // Corrida Colosseum Circular Water Moat Ring-Out Boundary
  if (world.colosseumRingOut.active) {
    const ro = world.colosseumRingOut;
    ctx.save();
    ctx.fillStyle = 'rgba(14, 165, 233, 0.24)';
    ctx.beginPath();
    ctx.rect(0, 0, world.arenaWidth, world.arenaHeight);
    ctx.arc(ro.center.x, ro.center.y, ro.safeRadiusPx, 0, Math.PI * 2, true);
    ctx.fill();

    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 3.5;
    ctx.setLineDash([10, 6]);
    ctx.beginPath();
    ctx.arc(ro.center.x, ro.center.y, ro.safeRadiusPx, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  // Impel Down Floor 1 Crimson Slash Trap Telegraph
  if (world.impelDownHazard.active && world.impelDownHazard.pendingTrapPos) {
    const tp = world.impelDownHazard.pendingTrapPos;
    const prog = Math.max(
      0,
      Math.min(1, 1 - world.impelDownHazard.pendingTrapTelegraphTimer / 1.1)
    );
    ctx.save();
    ctx.fillStyle = 'rgba(244, 63, 94, 0.22)';
    ctx.beginPath();
    ctx.arc(tp.x, tp.y, 68, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(244, 63, 94, 0.38)';
    ctx.beginPath();
    ctx.arc(tp.x, tp.y, 68 * prog, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#f43f5e';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(tp.x, tp.y, 68, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // Magellan Venom Demon Aura Ring
  for (let i = 0; i < world.units.length; i++) {
    const u = world.units[i];
    if (!u || !u.isAlive || !u.isOnField || !u.venomDemonActive) continue;
    const venomSpec = registry.traits[u.traitId]?.venomDemonPassive;
    const auraR = venomSpec?.auraRadiusPx ?? 155;
    const ux = Math.round(u.pos.x);
    const uy = Math.round(u.pos.y);
    if (!isCircleInBounds(visibleBounds, ux, uy, auraR + 8)) continue;
    const pulse = 0.85 + Math.sin(world.tick * 0.2) * 0.15;
    ctx.save();
    ctx.fillStyle = 'rgba(185, 28, 28, 0.18)';
    ctx.beginPath();
    ctx.arc(ux, uy, auraR, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = `rgba(239, 68, 68, ${pulse.toFixed(2)})`;
    ctx.lineWidth = 3;
    ctx.setLineDash([8, 5]);
    ctx.beginPath();
    ctx.arc(ux, uy, auraR, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }
}
