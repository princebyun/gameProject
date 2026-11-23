import {
  computeZoneChestProgress,
  isIslandVisited
} from '../../core/rpg/seaChartLogic';
import type { RpgCampaignState, RpgDataRegistry } from '../../core/types/rpgSchemas';
import type { WorldMarker } from '../../story/worldMarkerSystem';
import type { SafeHudBounds } from '../viewport/safeAreaLayout';

export interface SeaMinimapRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function computeSeaMinimapRect(safe: SafeHudBounds): SeaMinimapRect {
  const w = 148;
  const h = 98;
  return {
    x: Math.round(safe.right - w - 10),
    y: Math.round(safe.top + 42),
    w,
    h
  };
}

export function isPointInSeaMinimap(
  pt: { x: number; y: number },
  safe: SafeHudBounds
): boolean {
  const r = computeSeaMinimapRect(safe);
  return pt.x >= r.x && pt.x <= r.x + r.w && pt.y >= r.y && pt.y <= r.y + r.h;
}

function drawNineSliceParchmentFrame(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number
): void {
  // Outer border & 9-slice parchment rim
  ctx.fillStyle = '#3b2414';
  ctx.fillRect(x - 2, y - 2, w + 4, h + 4);
  ctx.fillStyle = '#c89b62';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = '#e7c894';
  ctx.fillRect(x + 2, y + 2, w - 4, h - 4);
  ctx.strokeStyle = '#6b4226';
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 2.5, y + 2.5, w - 5, h - 5);

  // Corner brass rivets
  const rivets: [number, number][] = [
    [x + 3, y + 3],
    [x + w - 5, y + 3],
    [x + 3, y + h - 5],
    [x + w - 5, y + h - 5]
  ];
  ctx.fillStyle = '#fde047';
  for (const [rx, ry] of rivets) {
    ctx.fillRect(rx, ry, 2, 2);
  }
}

export function renderTopRightSeaMinimapHud(
  ctx: CanvasRenderingContext2D,
  state: RpgCampaignState,
  rpgRegistry: RpgDataRegistry,
  showHiddenChests: boolean,
  tick: number,
  safe: SafeHudBounds,
  worldMarkers?: readonly WorldMarker[]
): SeaMinimapRect {
  const zone = rpgRegistry.seaZones[state.currentZoneId];
  const rect = computeSeaMinimapRect(safe);
  const { x, y, w, h } = rect;
  const padX = 7;
  const mapTop = y + 16;
  const mapW = w - padX * 2;
  const mapH = h - 34;

  ctx.save();
  drawNineSliceParchmentFrame(ctx, x, y, w, h);

  // Header strip with mini compass rose + [M] expand hint
  ctx.fillStyle = '#452815';
  ctx.fillRect(x + 4, y + 4, w - 8, 11);
  ctx.font = 'bold 8px monospace';
  ctx.textAlign = 'left';
  ctx.fillStyle = '#fef3c7';
  const zoneTag =
    zone.id === 'east_blue'
      ? 'EAST BLUE'
      : zone.id === 'grand_line'
        ? 'GRAND LINE'
        : 'NEW WORLD';
  ctx.fillText(`N ✦ ${zoneTag}`, x + 7, y + 12);
  ctx.textAlign = 'right';
  ctx.fillStyle = '#fde047';
  ctx.fillText('[M해도]', x + w - 7, y + 12);

  // Sea canvas inset
  ctx.fillStyle =
    zone.id === 'new_world'
      ? '#1e1b4b'
      : zone.id === 'grand_line'
        ? '#0c4a6e'
        : '#0369a1';
  ctx.fillRect(x + padX, mapTop, mapW, mapH);
  ctx.strokeStyle = '#6b4226';
  ctx.lineWidth = 1;
  ctx.strokeRect(x + padX, mapTop, mapW, mapH);

  const scaleX = mapW / zone.width;
  const scaleY = mapH / zone.height;

  // Sea current lines on minimap
  ctx.strokeStyle = 'rgba(186, 230, 253, 0.45)';
  ctx.lineWidth = 1;
  for (const route of zone.currents ?? []) {
    if (route.points.length < 2) continue;
    ctx.beginPath();
    const p0 = route.points[0]!;
    ctx.moveTo(x + padX + p0.x * scaleX, mapTop + p0.y * scaleY);
    for (let i = 1; i < route.points.length; i++) {
      const pt = route.points[i]!;
      ctx.lineTo(x + padX + pt.x * scaleX, mapTop + pt.y * scaleY);
    }
    ctx.stroke();
  }

  // Whirlpools on minimap
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.72)';
  for (const wp of zone.whirlpools ?? []) {
    const wx = Math.round(x + padX + wp.pos.x * scaleX);
    const wy = Math.round(mapTop + wp.pos.y * scaleY);
    ctx.beginPath();
    ctx.arc(wx, wy, 2.5, 0, Math.PI * 1.5);
    ctx.stroke();
  }

  // Islands by visited / cleared status
  for (const isl of zone.islands) {
    const ix = Math.round(x + padX + isl.pos.x * scaleX);
    const iy = Math.round(mapTop + isl.pos.y * scaleY);
    const done = state.completedEpisodes.includes(isl.episodeId);
    const visited = isIslandVisited(state, isl);

    ctx.fillStyle = done
      ? '#4ade80'
      : isl.endgameMode
        ? '#c084fc'
        : visited
          ? '#38bdf8'
          : '#94a3b8';
    ctx.fillRect(ix - 3, iy - 3, 6, 6);
    if (done) {
      ctx.strokeStyle = '#facc15';
      ctx.lineWidth = 1;
      ctx.strokeRect(ix - 3.5, iy - 3.5, 7, 7);
    }
  }

  // Pulsing Gold Marker & Blue Marker overlay dots
  const pulse = Math.floor(tick / 12) % 2 === 0;
  for (const m of worldMarkers ?? []) {
    if (m.kind !== 'MAIN' && m.kind !== 'SIDE') continue;
    const mx = Math.round(x + padX + m.x * scaleX);
    const my = Math.round(mapTop + m.y * scaleY);
    if (m.kind === 'MAIN') {
      ctx.strokeStyle = pulse ? '#fde047' : '#f59e0b';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(mx, my, pulse ? 6 : 4, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      ctx.fillStyle = '#7dd3fc';
      ctx.fillRect(mx + 2, my - 4, 2, 2);
    }
  }

  // SeaGate diamond
  if (zone.seaGate) {
    const gx = Math.round(x + padX + zone.seaGate.pos.x * scaleX);
    const gy = Math.round(mapTop + zone.seaGate.pos.y * scaleY);
    ctx.fillStyle = '#f43f5e';
    ctx.fillRect(gx - 3, gy - 3, 6, 6);
  }

  // Dynamic Sea objects (filtered for hidden chests)
  for (const obj of state.seaObjectsByZone[zone.id] ?? []) {
    if (obj.collectedOrDefeated) continue;
    if (obj.hiddenByDefault && !showHiddenChests) continue;
    const ox = Math.round(x + padX + obj.pos.x * scaleX);
    const oy = Math.round(mapTop + obj.pos.y * scaleY);
    ctx.fillStyle = obj.kind === 'TREASURE_CHEST' ? '#fde047' : '#fb7185';
    ctx.fillRect(ox - 1, oy - 1, 3, 3);
  }

  // Directional ship triangle
  const sx = x + padX + state.ship.pos.x * scaleX;
  const sy = mapTop + state.ship.pos.y * scaleY;
  const cos = Math.cos(state.ship.headingRad);
  const sin = Math.sin(state.ship.headingRad);
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(sx + cos * 5.5, sy + sin * 5.5);
  ctx.lineTo(sx - cos * 3.5 - sin * 3.5, sy - sin * 3.5 + cos * 3.5);
  ctx.lineTo(sx - cos * 3.5 + sin * 3.5, sy - sin * 3.5 - cos * 3.5);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  // Bottom 1-line dynamic Zone Chest collection bar
  const chestProg = computeZoneChestProgress(state, zone.id, rpgRegistry);
  ctx.fillStyle = '#3b2414';
  ctx.fillRect(x + 4, y + h - 15, w - 8, 11);
  ctx.font = 'bold 8px monospace';
  ctx.textAlign = 'center';
  ctx.fillStyle = chestProg.isComplete ? '#facc15' : '#fef3c7';
  const crown = chestProg.isComplete ? ' ★' : '';
  ctx.fillText(
    `보물 ${chestProg.opened}/${chestProg.total} · ${chestProg.percent}%${crown}`,
    x + w * 0.5,
    y + h - 7
  );

  ctx.restore();
  return rect;
}
