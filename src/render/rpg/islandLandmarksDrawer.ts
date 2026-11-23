import type {
  IslandLandmarkDefinition,
  IslandMapDefinition,
  IslandTreasureChestDefinition
} from '../../core/types/rpgSchemas';
import { isRectInBounds, type ViewportWorldBounds } from '../viewport/frustumCulling';
import { drawCompactFootShadow, type IslandYSortQueue } from './islandYSortQueue';

export function drawIslandTreasureChest(
  ctx: CanvasRenderingContext2D,
  chest: IslandTreasureChestDefinition,
  cx: number,
  footY: number,
  isOpened: boolean,
  navigatorSparkle: boolean,
  tick: number
): void {
  drawCompactFootShadow(ctx, cx, footY, 12, 4);
  const w = 22;
  const h = 16;
  const x = Math.round(cx - w * 0.5);
  const y = Math.round(footY - h);
  const bodyColor =
    chest.rarity === 'gold' ? '#ca8a04' : chest.rarity === 'silver' ? '#64748b' : '#78350f';
  const trimColor =
    chest.rarity === 'gold' ? '#fef08a' : chest.rarity === 'silver' ? '#e2e8f0' : '#d97706';

  ctx.fillStyle = '#0f172a';
  ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
  ctx.fillStyle = bodyColor;
  ctx.fillRect(x, y + 4, w, h - 4);
  ctx.fillStyle = isOpened ? '#1e293b' : trimColor;
  ctx.fillRect(x, y, w, isOpened ? 4 : 6);
  ctx.fillStyle = trimColor;
  ctx.fillRect(x + 2, y + 6, 3, h - 7);
  ctx.fillRect(x + w - 5, y + 6, 3, h - 7);
  if (!isOpened) {
    ctx.fillStyle = '#fef08a';
    ctx.fillRect(cx - 2, y + 5, 4, 4);
    if (navigatorSparkle && Math.floor(tick / 10) % 2 === 0) {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(cx + 8, y - 5, 3, 3);
    }
  }
}

export function drawNpcAmbientBubble(
  ctx: CanvasRenderingContext2D,
  nx: number,
  topY: number,
  text: string
): void {
  ctx.save();
  ctx.font = 'bold 9px monospace';
  const textW = Math.min(136, Math.max(46, Math.round(ctx.measureText(text).width + 12)));
  const bx = Math.round(nx - textW * 0.5);
  const by = Math.round(topY - 18);
  ctx.fillStyle = 'rgba(248, 250, 252, 0.94)';
  ctx.fillRect(bx, by, textW, 15);
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(bx, by, textW, 15);
  ctx.fillStyle = '#0f172a';
  ctx.textAlign = 'center';
  ctx.fillText(text, nx, by + 11, textW - 8);
  ctx.restore();
}

function drawLandmarkBase(
  ctx: CanvasRenderingContext2D,
  lm: IslandLandmarkDefinition,
  ts: number,
  tick: number
): void {
  const x = lm.tileX * ts;
  const y = lm.tileY * ts;
  const w = lm.widthTiles * ts;
  const h = lm.heightTiles * ts;
  const cx = Math.round(x + w * 0.5);
  const footY = Math.round(y + h);

  if (lm.kind === 'WINDMILL') {
    drawCompactFootShadow(ctx, cx, footY, Math.round(w * 0.45), 6);
    ctx.fillStyle = '#78350f';
    ctx.fillRect(x + 10, y + 16, w - 20, h - 16);
    ctx.fillStyle = '#d97706';
    ctx.fillRect(x + 14, y + 20, w - 28, h - 24);
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(cx - 6, footY - 18, 12, 18);
    ctx.fillStyle = '#e2e8f0';
    ctx.fillRect(cx - 5, y + 24, 10, 8);
  } else if (lm.kind === 'DOCKED_BOAT' || lm.kind === 'SUNNY_DOCK') {
    const bob = Math.round(Math.sin(tick * 0.08) * 2);
    const isSunny = lm.kind === 'SUNNY_DOCK';
    ctx.fillStyle = 'rgba(14, 165, 233, 0.25)';
    ctx.fillRect(x + 2, footY - 10, w - 4, 8);
    ctx.fillStyle = isSunny ? '#9a3412' : '#78350f';
    ctx.fillRect(x + 6, y + 16 + bob, w - 12, h - 22);
    ctx.fillStyle = isSunny ? '#facc15' : '#cbd5e1';
    ctx.fillRect(cx - 2, y + 2 + bob, 4, 24);
    ctx.fillStyle = '#f8fafc';
    ctx.fillRect(cx - 14, y + 6 + bob, 28, 12);
    if (isSunny) {
      ctx.fillStyle = '#f59e0b';
      ctx.fillRect(x + w - 14, y + 12 + bob, 10, 10);
    }
  } else if (lm.kind === 'WATER_FOUNTAIN') {
    drawCompactFootShadow(ctx, cx, footY - 2, Math.round(w * 0.48), 7);
    ctx.fillStyle = '#64748b';
    ctx.fillRect(x + 4, y + 14, w - 8, h - 18);
    ctx.fillStyle = '#38bdf8';
    ctx.fillRect(x + 10, y + 18, w - 20, h - 26);
    const sprayH = 12 + (Math.floor(tick / 6) % 4) * 2;
    ctx.fillStyle = '#94a3b8';
    ctx.fillRect(cx - 6, y + 6, 12, Math.round(h * 0.55));
    ctx.fillStyle = '#e0f2fe';
    ctx.fillRect(cx - 3, y + 6 - sprayH, 6, sprayH);
    ctx.fillRect(cx - 12, y + 10, 24, 3);
  } else if (lm.kind === 'GALLEY_CRANE') {
    drawCompactFootShadow(ctx, cx, footY, Math.round(w * 0.45), 6);
    ctx.fillStyle = '#451a03';
    ctx.fillRect(x + 8, y + 12, 10, h - 12);
    ctx.fillRect(x + w - 18, y + 12, 10, h - 12);
    ctx.fillStyle = '#78350f';
    ctx.fillRect(x + 16, y + 26, w - 32, h - 32);
  } else if (lm.kind === 'GALLEY_FLAG') {
    const wave = (Math.floor(tick / 8) % 2) * 2;
    drawCompactFootShadow(ctx, cx, footY, 6, 3);
    ctx.fillStyle = '#475569';
    ctx.fillRect(cx - 2, y + 4, 4, h - 4);
    ctx.fillStyle = '#0284c7';
    ctx.fillRect(cx + 2, y + 6, 18, 11);
    ctx.fillStyle = '#facc15';
    ctx.fillRect(cx + 4, y + 9 + wave * 0.5, 12, 4);
  } else if (lm.kind === 'TORII_GATE') {
    ctx.fillStyle = '#b91c1c';
    ctx.fillRect(x + 8, y + 16, 10, h - 16);
    ctx.fillRect(x + w - 18, y + 16, 10, h - 16);
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(x + 6, footY - 8, 14, 8);
    ctx.fillRect(x + w - 20, footY - 8, 14, 8);
  } else if (lm.kind === 'RED_LANTERN') {
    drawCompactFootShadow(ctx, cx, footY, 6, 3);
    ctx.fillStyle = '#451a03';
    ctx.fillRect(cx - 2, y + 8, 4, h - 8);
    ctx.fillStyle = '#dc2626';
    ctx.fillRect(cx - 5, y + 4, 10, 11);
    ctx.fillStyle = '#fef08a';
    ctx.fillRect(cx - 3, y + 6, 6, 6);
  } else if (lm.kind === 'GLASS_DOME') {
    drawCompactFootShadow(ctx, cx, footY, Math.round(w * 0.45), 6);
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(x + 6, footY - 16, w - 12, 16);
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2;
    ctx.strokeRect(x + 6, footY - 16, w - 12, 16);
  } else if (lm.kind === 'HOLO_BILLBOARD') {
    drawCompactFootShadow(ctx, cx, footY, Math.round(w * 0.4), 5);
    ctx.fillStyle = '#334155';
    ctx.fillRect(cx - 4, footY - 16, 8, 16);
    ctx.fillStyle = '#0c4a6e';
    ctx.fillRect(x + 4, y + 4, w - 8, h - 20);
    ctx.strokeStyle = '#22d3ee';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x + 4, y + 4, w - 8, h - 20);
    const barY = y + 8 + ((Math.floor(tick / 4) * 3) % Math.max(8, h - 28));
    ctx.fillStyle = 'rgba(192, 132, 252, 0.72)';
    ctx.fillRect(x + 8, barY, w - 16, 3);
  } else if (lm.kind === 'ENERGY_TUBE') {
    drawCompactFootShadow(ctx, cx, footY, 10, 4);
    ctx.fillStyle = '#334155';
    ctx.fillRect(x + 6, y + 16, 8, h - 16);
    ctx.fillRect(x + w - 14, y + 16, 8, h - 16);
  } else if (lm.kind === 'WELL') {
    drawCompactFootShadow(ctx, cx, footY, Math.round(w * 0.45), 5);
    ctx.fillStyle = '#64748b';
    ctx.fillRect(x + 6, y + 16, w - 12, h - 18);
    ctx.fillStyle = '#0284c7';
    ctx.fillRect(x + 10, y + 18, w - 20, 8);
    ctx.fillStyle = '#78350f';
    ctx.fillRect(x + 8, y + 4, 4, 14);
    ctx.fillRect(x + w - 12, y + 4, 4, 14);
    ctx.fillRect(x + 4, y + 2, w - 8, 6);
  } else if (lm.kind === 'BOUNTY_BOARD') {
    drawCompactFootShadow(ctx, cx, footY, 14, 4);
    ctx.fillStyle = '#451a03';
    ctx.fillRect(x + 6, footY - 14, 4, 14);
    ctx.fillRect(x + w - 10, footY - 14, 4, 14);
    ctx.fillStyle = '#78350f';
    ctx.fillRect(x + 3, y + 6, w - 6, h - 18);
    ctx.fillStyle = '#fef3c7';
    ctx.fillRect(x + 7, y + 10, 8, 10);
    ctx.fillRect(x + w - 15, y + 10, 8, 10);
  }
}

export function enqueueIslandLandmarksLayer3(
  queue: IslandYSortQueue,
  islandMap: IslandMapDefinition,
  tick: number,
  bounds: ViewportWorldBounds
): void {
  const landmarks = islandMap.landmarks;
  if (!landmarks || landmarks.length === 0) return;
  const ts = islandMap.tileMap?.tileSize ?? 32;

  for (let i = 0; i < landmarks.length; i++) {
    const lm = landmarks[i];
    if (!lm) continue;
    const x = lm.tileX * ts;
    const y = lm.tileY * ts;
    const w = lm.widthTiles * ts;
    const h = lm.heightTiles * ts;
    if (!isRectInBounds(bounds, x - 16, y - 16, w + 32, h + 32)) continue;
    const sortY = lm.kind === 'TORII_GATE' ? y + 16 : y + h;
    queue.push(sortY, (ctx) => {
      drawLandmarkBase(ctx, lm, ts, tick);
    });
  }
}

export function renderIslandLandmarksOverhead(
  ctx: CanvasRenderingContext2D,
  islandMap: IslandMapDefinition,
  tick: number,
  bounds: ViewportWorldBounds
): void {
  const landmarks = islandMap.landmarks;
  if (!landmarks || landmarks.length === 0) return;
  const ts = islandMap.tileMap?.tileSize ?? 32;

  for (let i = 0; i < landmarks.length; i++) {
    const lm = landmarks[i];
    if (!lm || !lm.hasOverheadPart) continue;
    const x = lm.tileX * ts;
    const y = lm.tileY * ts;
    const w = lm.widthTiles * ts;
    const h = lm.heightTiles * ts;
    if (!isRectInBounds(bounds, x - 32, y - 32, w + 64, h + 64)) continue;

    const cx = Math.round(x + w * 0.5);
    if (lm.kind === 'WINDMILL') {
      const hubY = y + 14;
      const angle = (tick * 0.025) % (Math.PI * 2);
      ctx.save();
      ctx.translate(cx, hubY);
      ctx.rotate(angle);
      for (let b = 0; b < 4; b++) {
        ctx.rotate(Math.PI * 0.5);
        ctx.fillStyle = '#78350f';
        ctx.fillRect(-2, 0, 4, 28);
        ctx.fillStyle = '#fef3c7';
        ctx.fillRect(2, 6, 8, 20);
      }
      ctx.fillStyle = '#dc2626';
      ctx.fillRect(-4, -4, 8, 8);
      ctx.restore();
    } else if (lm.kind === 'TORII_GATE') {
      ctx.fillStyle = '#dc2626';
      ctx.fillRect(x - 4, y + 2, w + 8, 9);
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(x - 6, y, w + 12, 4);
      ctx.fillStyle = '#b91c1c';
      ctx.fillRect(x + 4, y + 15, w - 8, 5);
    } else if (lm.kind === 'GLASS_DOME') {
      ctx.save();
      ctx.fillStyle = 'rgba(56, 189, 248, 0.34)';
      ctx.beginPath();
      ctx.arc(cx, y + h * 0.65, w * 0.44, Math.PI, 0);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#7dd3fc';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
    } else if (lm.kind === 'ENERGY_TUBE') {
      ctx.fillStyle = 'rgba(34, 211, 238, 0.65)';
      ctx.fillRect(x, y + 4, w, 10);
      ctx.strokeStyle = '#e0f2fe';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x, y + 4, w, 10);
    } else if (lm.kind === 'GALLEY_CRANE') {
      ctx.fillStyle = '#92400e';
      ctx.fillRect(x - 4, y + 4, w + 8, 8);
      ctx.fillStyle = '#eab308';
      ctx.fillRect(cx - 2, y + 12, 4, 14);
    }
  }
}
