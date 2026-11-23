import type { SeaZoneDefinition } from '../../core/types/rpgSchemas';
import {
  isCircleInBounds,
  type ViewportWorldBounds
} from '../viewport/frustumCulling';

function drawCurrentChevron(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  ux: number,
  uy: number,
  size: number,
  color: string
): void {
  const px = -uy;
  const py = ux;
  const tipX = x + ux * size;
  const tipY = y + uy * size;
  const leftX = x - ux * (size * 0.6) + px * (size * 0.7);
  const leftY = y - uy * (size * 0.6) + py * (size * 0.7);
  const rightX = x - ux * (size * 0.6) - px * (size * 0.7);
  const rightY = y - uy * (size * 0.6) - py * (size * 0.7);

  ctx.strokeStyle = color;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(leftX, leftY);
  ctx.lineTo(tipX, tipY);
  ctx.lineTo(rightX, rightY);
  ctx.stroke();
}

export function renderSeaCurrentsAndWhirlpools(
  ctx: CanvasRenderingContext2D,
  zone: SeaZoneDefinition,
  tick: number,
  visibleBounds?: ViewportWorldBounds
): void {
  const currents = zone.currents ?? [];
  if (currents.length > 0) {
    ctx.save();
    for (const route of currents) {
      if (route.points.length < 2) continue;
      let anyVisible = false;
      for (const pt of route.points) {
        if (isCircleInBounds(visibleBounds, pt.x, pt.y, route.widthPx + 140)) {
          anyVisible = true;
          break;
        }
      }
      if (!anyVisible && visibleBounds) {
        for (let i = 0; i < route.points.length - 1; i++) {
          const a = route.points[i];
          const b = route.points[i + 1];
          if (
            a &&
            b &&
            isCircleInBounds(
              visibleBounds,
              (a.x + b.x) * 0.5,
              (a.y + b.y) * 0.5,
              route.widthPx + 220
            )
          ) {
            anyVisible = true;
            break;
          }
        }
      }
      if (!anyVisible) continue;

      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.16)';
      ctx.lineWidth = route.widthPx * 0.62;
      ctx.beginPath();
      const first = route.points[0]!;
      ctx.moveTo(first.x, first.y);
      for (let i = 1; i < route.points.length; i++) {
        const pt = route.points[i]!;
        ctx.lineTo(pt.x, pt.y);
      }
      ctx.stroke();

      const dashOffset = -(tick * (route.speedPx * 0.045));
      ctx.setLineDash([16, 14]);
      ctx.lineDashOffset = dashOffset;
      ctx.strokeStyle = 'rgba(224, 242, 254, 0.55)';
      ctx.lineWidth = 2.5;
      ctx.stroke();

      ctx.lineDashOffset = dashOffset + 12;
      ctx.strokeStyle = 'rgba(125, 211, 252, 0.42)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.setLineDash([]);

      for (let i = 0; i < route.points.length - 1; i++) {
        const a = route.points[i];
        const b = route.points[i + 1];
        if (!a || !b) continue;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const len = Math.hypot(dx, dy);
        if (len < 10) continue;
        const ux = dx / len;
        const uy = dy / len;
        const stepCount = Math.max(1, Math.floor(len / 95));
        const shift = ((tick * 0.9) % 95) / Math.max(95, len);
        for (let k = 0; k < stepCount; k++) {
          const t = (k / stepCount + shift) % 1;
          const cx = a.x + dx * t;
          const cy = a.y + dy * t;
          if (!isCircleInBounds(visibleBounds, cx, cy, 32)) continue;
          drawCurrentChevron(ctx, cx, cy, ux, uy, 6, 'rgba(240, 249, 255, 0.72)');
        }
      }
    }
    ctx.restore();
  }

  const whirlpools = zone.whirlpools ?? [];
  if (whirlpools.length > 0) {
    ctx.save();
    for (const wp of whirlpools) {
      const wx = Math.round(wp.pos.x);
      const wy = Math.round(wp.pos.y);
      if (!isCircleInBounds(visibleBounds, wx, wy, wp.outerRadiusPx + 24)) continue;

      const dir = wp.clockwise ? 1 : -1;
      const baseAngle = tick * 0.06 * dir;

      ctx.fillStyle = 'rgba(15, 23, 42, 0.34)';
      ctx.beginPath();
      ctx.arc(wx, wy, wp.outerRadiusPx * 0.72, 0, Math.PI * 2);
      ctx.fill();

      for (let ring = 0; ring < 3; ring++) {
        const radius =
          wp.coreRadiusPx + ((wp.outerRadiusPx - wp.coreRadiusPx) * (ring + 1)) / 3.2;
        ctx.strokeStyle =
          ring === 0
            ? 'rgba(240, 249, 255, 0.78)'
            : ring === 1
              ? 'rgba(125, 211, 252, 0.62)'
              : 'rgba(56, 189, 248, 0.42)';
        ctx.lineWidth = ring === 0 ? 2.5 : 2;
        for (let arm = 0; arm < 2; arm++) {
          const startA = baseAngle * (1.25 - ring * 0.2) + arm * Math.PI + ring * 0.7;
          ctx.beginPath();
          ctx.arc(wx, wy, radius, startA, startA + 1.35);
          ctx.stroke();
        }
      }

      ctx.fillStyle = 'rgba(12, 74, 110, 0.72)';
      ctx.beginPath();
      ctx.arc(wx, wy, Math.max(8, wp.coreRadiusPx * 0.45), 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(224, 242, 254, 0.85)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    ctx.restore();
  }
}
