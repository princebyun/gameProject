import type { AssetLoader } from '../../assets/assetLoader';
import { clamp } from '../../core/math/vector2';
import { computeIslandChestProgress } from '../../core/rpg/seaChartLogic';
import { validateSeaGateAccess } from '../../core/rpg/seaGateValidator';
import type {
  RpgCampaignState,
  RpgDataRegistry,
  SeaIslandNode,
  SeaZoneDefinition
} from '../../core/types/rpgSchemas';
import type { WorldMarker } from '../../story/worldMarkerSystem';
import {
  isCircleInBounds,
  type ViewportWorldBounds
} from '../viewport/frustumCulling';

function drawLandmarkFallback(
  ctx: CanvasRenderingContext2D,
  id: string,
  x: number,
  y: number,
  color: string,
  tick: number,
  isGate: boolean
): void {
  const pulse = Math.sin(tick * 0.1) * 1.5;
  ctx.fillStyle = isGate ? '#7f1d1d' : '#1e293b';
  ctx.beginPath();
  ctx.ellipse(x, y + 20, 38, 12, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = color;
  ctx.fillRect(x - 24, y - 16 + pulse * 0.3, 48, 34);
  ctx.strokeStyle = '#1b2438';
  ctx.lineWidth = 2;
  ctx.strokeRect(x - 24, y - 16 + pulse * 0.3, 48, 34);
  ctx.fillStyle = '#e0f2fe';
  ctx.fillRect(x - 8, y - 26, 16, 10);
  if (id === 'gate_reverse_mountain' || id === 'gate_red_line') {
    ctx.fillStyle = '#38bdf8';
    ctx.fillRect(x - 6, y - 10, 12, 26);
  }
}

function renderIslandProximityBanner(
  ctx: CanvasRenderingContext2D,
  island: SeaIslandNode,
  state: RpgCampaignState,
  rpgRegistry: RpgDataRegistry,
  worldMarkers: readonly WorldMarker[] | undefined,
  ix: number,
  iy: number
): void {
  const completed = state.completedEpisodes.includes(island.episodeId);
  const chest = computeIslandChestProgress(state, island.islandId, rpgRegistry);
  const hasGold = Boolean(
    worldMarkers?.some(
      (m) =>
        m.kind === 'MAIN' &&
        Math.hypot(m.x - island.pos.x, m.y - island.pos.y) < 36
    )
  );
  const hasBlue = Boolean(
    worldMarkers?.some(
      (m) =>
        m.kind === 'SIDE' &&
        Math.hypot(m.x - island.pos.x, m.y - island.pos.y) < 36
    )
  );

  const w = 186;
  const h = 44;
  const bx = Math.round(ix - w * 0.5);
  const by = Math.round(iy - 96);

  ctx.save();
  ctx.fillStyle = 'rgba(15, 23, 42, 0.94)';
  ctx.fillRect(bx, by, w, h);
  ctx.strokeStyle = completed ? '#4ade80' : '#facc15';
  ctx.lineWidth = 2;
  ctx.strokeRect(bx, by, w, h);

  ctx.fillStyle = island.playableInVerticalSlice ? '#16a34a' : '#475569';
  ctx.fillRect(bx + w - 42, by + 4, 38, 14);
  ctx.font = 'bold 9px monospace';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffffff';
  ctx.fillText('[입항]', bx + w - 23, by + 14);

  const markerPrefix = hasGold ? '★ ' : hasBlue ? '◆ ' : '';
  ctx.textAlign = 'left';
  ctx.font = 'bold 10px monospace';
  ctx.fillStyle = hasGold ? '#fde047' : hasBlue ? '#38bdf8' : '#f8fafc';
  const shortTitle =
    island.name.length > 14 ? `${island.name.slice(0, 14)}…` : island.name;
  ctx.fillText(`${markerPrefix}${shortTitle}`, bx + 7, by + 15);

  const clearTag = completed ? '★클리어' : '미완료';
  const chestTag =
    chest.total > 0 ? `보물 ${chest.opened}/${chest.total}` : '특수 거점';
  ctx.font = '9px monospace';
  ctx.fillStyle = completed ? '#4ade80' : '#cbd5e1';
  ctx.fillText(`${clearTag} · ${chestTag}`, bx + 7, by + 33);

  if (chest.isComplete) {
    ctx.textAlign = 'right';
    ctx.fillStyle = '#facc15';
    ctx.fillText('100% ★', bx + w - 7, by + 33);
  }
  ctx.restore();
}

export function renderWorldLandmarksAndGate(
  ctx: CanvasRenderingContext2D,
  state: RpgCampaignState,
  rpgRegistry: RpgDataRegistry,
  zone: SeaZoneDefinition,
  nearbyIsland: SeaIslandNode | null,
  tick: number,
  assets?: AssetLoader,
  visibleBounds?: ViewportWorldBounds,
  worldMarkers?: readonly WorldMarker[]
): void {
  if (zone.seaGate) {
    const gate = zone.seaGate;
    const gx = Math.round(gate.pos.x);
    const gy = Math.round(gate.pos.y);
    if (isCircleInBounds(visibleBounds, gx, gy, gate.triggerRadiusPx + 96)) {
      const gateCheck = validateSeaGateAccess(state, zone.id, rpgRegistry);
      const lm = assets?.getWorldLandmarkSheet(gate.gateId);

      ctx.save();
      ctx.strokeStyle = gateCheck.allowed ? '#22c55e' : '#f43f5e';
      ctx.lineWidth = 2.5;
      ctx.setLineDash([7, 5]);
      ctx.beginPath();
      ctx.arc(gx, gy, gate.triggerRadiusPx, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);

      if (lm?.entry && lm.sheet) {
        const fr = Math.floor((tick / 60) * lm.entry.fps) % Math.max(1, lm.entry.frameCount);
        const fw = lm.entry.frameWidth;
        const fh = lm.entry.frameHeight;
        ctx.drawImage(
          lm.sheet,
          fr * fw,
          0,
          fw,
          fh,
          Math.round(gx - fw * 0.5),
          Math.round(gy - fh * 0.56),
          fw,
          fh
        );
      } else {
        drawLandmarkFallback(ctx, gate.gateId, gx, gy, '#dc2626', tick, true);
      }

      const tagW = clamp(gate.name.length * 7 + 20, 140, 240);
      ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
      ctx.fillRect(gx - tagW * 0.5, gy + 38, tagW, 28);
      ctx.strokeStyle = gateCheck.allowed ? '#22c55e' : '#f43f5e';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(gx - tagW * 0.5, gy + 38, tagW, 28);

      ctx.font = 'bold 10px monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#fde047';
      ctx.fillText(`⛩ ${gate.name}`, gx, gy + 50, tagW - 8);
      ctx.font = '9px monospace';
      ctx.fillStyle = gateCheck.allowed ? '#4ade80' : '#fca5a5';
      ctx.fillText(
        gateCheck.allowed
          ? `개방됨 -> ${gate.toZoneId.toUpperCase()}`
          : `잠김 (필수 ${gateCheck.missingEpisodes.length}개 미완료)`,
        gx,
        gy + 62,
        tagW - 8
      );
      ctx.restore();
    }
  }

  for (const isl of zone.islands) {
    const ix = Math.round(isl.pos.x);
    const iy = Math.round(isl.pos.y);
    if (!isCircleInBounds(visibleBounds, ix, iy, isl.dockingRadiusPx + 96)) continue;

    const completed = state.completedEpisodes.includes(isl.episodeId);
    const isNear = nearbyIsland?.islandId === isl.islandId;
    const lm = assets?.getWorldLandmarkSheet(isl.islandId);

    ctx.save();
    ctx.strokeStyle = isNear
      ? '#fde047'
      : completed
        ? 'rgba(74, 222, 128, 0.72)'
        : isl.requiredForNextZone
          ? 'rgba(250, 204, 21, 0.65)'
          : 'rgba(56, 189, 248, 0.62)';
    ctx.lineWidth = isNear ? 2.5 : 1.75;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.arc(ix, iy, isl.dockingRadiusPx, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    if (lm?.entry && lm.sheet) {
      const fr = Math.floor((tick / 60) * lm.entry.fps) % Math.max(1, lm.entry.frameCount);
      const fw = lm.entry.frameWidth;
      const fh = lm.entry.frameHeight;
      ctx.drawImage(
        lm.sheet,
        fr * fw,
        0,
        fw,
        fh,
        Math.round(ix - fw * 0.5),
        Math.round(iy - fh * 0.56),
        fw,
        fh
      );
    } else {
      drawLandmarkFallback(ctx, isl.islandId, ix, iy, isl.color, tick, false);
    }

    if (isl.islandId === 'drum_kingdom' && completed) {
      for (let p = 0; p < 6; p++) {
        const px = ix - 22 + ((p * 11 + tick) % 44);
        const py = iy - 42 + ((p * 9 + tick) % 30);
        ctx.fillStyle = p % 2 === 0 ? '#f9a8d4' : '#fbcfe8';
        ctx.fillRect(px, py, 3, 2);
      }
    }

    const labelW = clamp(isl.name.length * 8 + 20, 118, 210);
    const labelY = iy + 36;
    ctx.fillStyle = 'rgba(15, 23, 42, 0.86)';
    ctx.fillRect(Math.round(ix - labelW * 0.5), labelY, labelW, 20);
    ctx.strokeStyle = completed ? '#4ade80' : '#475569';
    ctx.lineWidth = 1;
    ctx.strokeRect(Math.round(ix - labelW * 0.5), labelY, labelW, 20);

    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = completed ? '#86efac' : '#f8fafc';
    ctx.fillText(
      completed ? `★ ${isl.name}` : isl.name,
      ix,
      labelY + 13,
      labelW - 10
    );
    ctx.restore();

    if (isNear) {
      renderIslandProximityBanner(
        ctx,
        isl,
        state,
        rpgRegistry,
        worldMarkers,
        ix,
        iy
      );
    }
  }
}
