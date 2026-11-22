import { clamp } from '../../core/math/vector2';
import type { BattleWorldState } from '../../core/types/battleState';
import {
  isCircleInBounds,
  type ViewportWorldBounds
} from '../viewport/frustumCulling';

export function renderRaidTelegraphsAndFieldProps(
  ctx: CanvasRenderingContext2D,
  world: BattleWorldState,
  visibleBounds?: ViewportWorldBounds
): void {
  // Giant Boss Raid Floor Telegraphs & Downed Rescue Rings
  if (world.raidState.active) {
    for (const tele of world.raidState.telegraphs) {
      const tx = Math.round(tele.origin.x);
      const ty = Math.round(tele.origin.y);
      if (
        (tele.shape === 'CIRCLE' || tele.shape === 'CONE') &&
        !isCircleInBounds(visibleBounds, tx, ty, tele.radiusPx + 16)
      ) {
        continue;
      }
      const prog = Math.max(0, Math.min(1, tele.elapsedSec / Math.max(0.1, tele.durationSec)));
      ctx.save();
      if (tele.shape === 'CIRCLE') {
        ctx.fillStyle = 'rgba(239, 68, 68, 0.22)';
        ctx.beginPath();
        ctx.arc(tx, ty, tele.radiusPx, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(239, 68, 68, 0.42)';
        ctx.beginPath();
        ctx.arc(tx, ty, tele.radiusPx * prog, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(tx, ty, tele.radiusPx, 0, Math.PI * 2);
        ctx.stroke();
      } else if (tele.shape === 'SAFE_ZONE') {
        ctx.fillStyle = `rgba(220, 38, 38, ${(0.18 + prog * 0.24).toFixed(2)})`;
        ctx.beginPath();
        ctx.rect(0, 0, world.arenaWidth, world.arenaHeight);
        ctx.arc(tx, ty, tele.radiusPx, 0, Math.PI * 2, true);
        ctx.fill();

        ctx.fillStyle = 'rgba(34, 197, 94, 0.2)';
        ctx.beginPath();
        ctx.arc(tx, ty, tele.radiusPx, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#4ade80';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(tx, ty, tele.radiusPx, 0, Math.PI * 2);
        ctx.stroke();

        ctx.font = 'bold 11px monospace';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#86efac';
        ctx.fillText(
          `🛡 SAFE ZONE (${Math.max(0, tele.durationSec - tele.elapsedSec).toFixed(1)}s)`,
          tx,
          ty + 4
        );
      } else if (tele.shape === 'CONE') {
        const baseAngle = Math.atan2(tele.dir.y, tele.dir.x);
        const halfRad = ((tele.arcDeg * Math.PI) / 180) * 0.5;
        ctx.fillStyle = 'rgba(239, 68, 68, 0.22)';
        ctx.beginPath();
        ctx.moveTo(tx, ty);
        ctx.arc(tx, ty, tele.radiusPx, baseAngle - halfRad, baseAngle + halfRad);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = 'rgba(239, 68, 68, 0.42)';
        ctx.beginPath();
        ctx.moveTo(tx, ty);
        ctx.arc(tx, ty, tele.radiusPx * prog, baseAngle - halfRad, baseAngle + halfRad);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 2.5;
        ctx.stroke();
      } else if (tele.shape === 'CROSS_BEAM') {
        const halfW = tele.widthPx * 0.5;
        ctx.fillStyle = 'rgba(239, 68, 68, 0.22)';
        ctx.fillRect(0, Math.round(ty - halfW), world.arenaWidth, tele.widthPx);
        ctx.fillRect(Math.round(tx - halfW), 0, tele.widthPx, world.arenaHeight);
        const innerW = tele.widthPx * prog;
        ctx.fillStyle = 'rgba(248, 113, 113, 0.42)';
        ctx.fillRect(0, Math.round(ty - innerW * 0.5), world.arenaWidth, Math.round(innerW));
        ctx.fillRect(Math.round(tx - innerW * 0.5), 0, Math.round(innerW), world.arenaHeight);
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 2;
        ctx.strokeRect(0, Math.round(ty - halfW), world.arenaWidth, tele.widthPx);
        ctx.strokeRect(Math.round(tx - halfW), 0, tele.widthPx, world.arenaHeight);
      }

      if (tele.shape !== 'SAFE_ZONE') {
        ctx.font = 'bold 10px monospace';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#fecaca';
        ctx.fillText(
          `⚠ ${tele.name} (${Math.max(0, tele.durationSec - tele.elapsedSec).toFixed(1)}s)`,
          tx,
          Math.max(22, ty - 12)
        );
      }
      ctx.restore();
    }

    for (const u of world.units) {
      if (!u.isAlive || !u.isOnField) continue;
      const ux = Math.round(u.pos.x);
      const uy = Math.round(u.pos.y);
      if (u.isDowned) {
        if (!isCircleInBounds(visibleBounds, ux, uy, 82)) continue;
        ctx.save();
        ctx.strokeStyle = '#f43f5e';
        ctx.lineWidth = 2.5;
        ctx.setLineDash([6, 4]);
        ctx.beginPath();
        ctx.arc(ux, uy, 78, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);

        const revPct = Math.min(1, u.reviveProgressSec / 2.0);
        if (revPct > 0) {
          ctx.strokeStyle = '#4ade80';
          ctx.lineWidth = 5;
          ctx.beginPath();
          ctx.arc(ux, uy, u.radiusPx + 14, -Math.PI * 0.5, -Math.PI * 0.5 + Math.PI * 2 * revPct);
          ctx.stroke();
        }
        ctx.font = 'bold 10px monospace';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#fda4af';
        ctx.fillText(
          `🆘 DOWN (${u.downedTimer.toFixed(1)}s)`,
          ux,
          uy - u.radiusPx - 14
        );
        ctx.restore();
      } else if (
        world.raidState.bossUnitId === u.instanceId &&
        world.raidState.dpsCheck.active
      ) {
        if (!isCircleInBounds(visibleBounds, ux, uy, u.radiusPx + 28)) continue;
        ctx.save();
        ctx.fillStyle = 'rgba(249, 115, 22, 0.16)';
        ctx.beginPath();
        ctx.arc(ux, uy, u.radiusPx + 24, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#fb923c';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(ux, uy, u.radiusPx + 24, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    }
  }

  // Water Terrain Pools, Destructible Props, Extraction Zone & Field Zones
  for (const wz of world.waterZones) {
    const wx = Math.round(wz.x);
    const wy = Math.round(wz.y);
    if (!isCircleInBounds(visibleBounds, wx, wy, wz.radiusPx + 16)) continue;
    ctx.save();
    ctx.fillStyle = 'rgba(14, 165, 233, 0.28)';
    ctx.beginPath();
    ctx.arc(wx, wy, wz.radiusPx, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.font = 'bold 9px monospace';
    ctx.fillStyle = '#bae6fd';
    ctx.textAlign = 'center';
    ctx.fillText('🌊 수변 지형 (어인+20% / 열매-30%)', wx, wy - wz.radiusPx + 14);
    ctx.restore();
  }

  for (const prop of world.destructibleProps) {
    if (prop.destroyed) continue;
    const px = Math.round(prop.pos.x);
    const py = Math.round(prop.pos.y);
    if (!isCircleInBounds(visibleBounds, px, py, prop.radiusPx + 16)) continue;
    ctx.save();
    ctx.fillStyle = '#0284c7';
    ctx.beginPath();
    ctx.arc(px, py, prop.radiusPx, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#bae6fd';
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.fillStyle = '#e0f2fe';
    ctx.font = 'bold 9px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('💧물통', px, py + 3);
    ctx.restore();
  }

  if (
    world.extractionZoneActive &&
    world.winCondition.kind === 'REACH_EXTRACTION'
  ) {
    const ez = world.winCondition.extractionZone;
    const ex = Math.round(ez.x);
    const ey = Math.round(ez.y);
    if (isCircleInBounds(visibleBounds, ex, ey, ez.radiusPx + 16)) {
      ctx.save();
      ctx.fillStyle = 'rgba(34, 197, 94, 0.28)';
      ctx.beginPath();
      ctx.arc(ex, ey, ez.radiusPx, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#4ade80';
      ctx.lineWidth = 3;
      ctx.stroke();
      ctx.font = 'bold 10px monospace';
      ctx.fillStyle = '#bbf7d0';
      ctx.textAlign = 'center';
      ctx.fillText('⚓ 탈출 구역 (EXTRACTION)', ex, ey + 4);
      ctx.restore();
    }
  }

  for (const zone of world.fieldZones) {
    const zx = Math.round(zone.pos.x);
    const zy = Math.round(zone.pos.y);
    if (!isCircleInBounds(visibleBounds, zx, zy, zone.radiusPx + 16)) continue;
    ctx.save();
    if (zone.fieldKind === 'HAZARD_ZONE') {
      ctx.fillStyle = zone.isPoisonCloud
        ? 'rgba(168, 85, 247, 0.30)'
        : 'rgba(249, 115, 22, 0.22)';
      ctx.beginPath();
      ctx.arc(zx, zy, zone.radiusPx, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = zone.isPoisonCloud ? '#c084fc' : '#fb923c';
      ctx.lineWidth = 2;
      ctx.stroke();
      if (zone.isPoisonCloud) {
        ctx.font = 'bold 9px monospace';
        ctx.fillStyle = '#e9d5ff';
        ctx.textAlign = 'center';
        ctx.fillText('☠ MH5 맹독가스', zx, zy + 3);
      }
    } else if (zone.fieldKind === 'DOME_SHIELD') {
      ctx.fillStyle = 'rgba(56, 189, 248, 0.16)';
      ctx.beginPath();
      ctx.arc(zx, zy, zone.radiusPx, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2.5;
      ctx.stroke();

      ctx.font = 'bold 10px monospace';
      ctx.fillStyle = 'rgba(125, 211, 252, 0.85)';
      ctx.textAlign = 'center';
      ctx.fillText('ROOM', zx, zy - zone.radiusPx + 14);

      const hpRatio = clamp(zone.domeHp / Math.max(1, zone.maxDomeHp), 0, 1);
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(zx - 26, Math.round(zy - zone.radiusPx - 12), 52, 6);
      ctx.fillStyle = '#38bdf8';
      ctx.fillRect(zx - 25, Math.round(zy - zone.radiusPx - 11), Math.round(50 * hpRatio), 4);
    }
    ctx.restore();
  }
}
