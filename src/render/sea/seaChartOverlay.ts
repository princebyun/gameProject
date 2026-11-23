import type { AssetLoader } from '../../assets/assetLoader';
import {
  computeGlobalChestProgress,
  computeZoneChestProgress,
  isIslandVisited,
  isSeaZoneUnlocked
} from '../../core/rpg/seaChartLogic';
import type {
  RpgCampaignState,
  RpgDataRegistry,
  SeaIslandNode,
  SeaZoneId
} from '../../core/types/rpgSchemas';
import {
  collectSeaWorldMarkers,
  type WorldMarker
} from '../../story/worldMarkerSystem';
import type { StoryNodeSnapshot } from '../../story/storyDirector';
import type { SafeHudBounds } from '../viewport/safeAreaLayout';
import {
  renderSeaChartDetailCard,
  type SeaChartOverlayState,
  type SeaChartRect
} from './seaChartDetailCard';

export type { SeaChartOverlayState, SeaChartRect } from './seaChartDetailCard';

export interface SeaChartHitRegions {
  modalRect: SeaChartRect;
  closeBtnRect: SeaChartRect;
  zoneTabRects: { zoneId: SeaZoneId; rect: SeaChartRect }[];
  islandHitCircles: { islandId: string; cx: number; cy: number; r: number }[];
  fastSailBtnRect: SeaChartRect | null;
}

const ZONE_TAB_ORDER: { id: SeaZoneId; label: string }[] = [
  { id: 'east_blue', label: '이스트 블루' },
  { id: 'grand_line', label: '위대한 항로' },
  { id: 'new_world', label: '신세계' }
];

export function renderSeaChartOverlay(
  ctx: CanvasRenderingContext2D,
  state: RpgCampaignState,
  rpgRegistry: RpgDataRegistry,
  overlayState: SeaChartOverlayState,
  storyNode: StoryNodeSnapshot,
  tick: number,
  safe: SafeHudBounds,
  assets?: AssetLoader
): SeaChartHitRegions {
  const modalW = Math.min(860, Math.max(540, safe.width - 24));
  const modalH = Math.min(448, Math.max(360, safe.height - 20));
  const mx = Math.round(safe.left + (safe.width - modalW) * 0.5);
  const my = Math.round(safe.top + (safe.height - modalH) * 0.5);

  const regions: SeaChartHitRegions = {
    modalRect: { x: mx, y: my, w: modalW, h: modalH },
    closeBtnRect: { x: mx + modalW - 36, y: my + 8, w: 28, h: 24 },
    zoneTabRects: [],
    islandHitCircles: [],
    fastSailBtnRect: null
  };

  ctx.save();
  ctx.fillStyle = 'rgba(7, 11, 22, 0.72)';
  ctx.fillRect(0, 0, safe.viewWidth, safe.viewHeight);

  ctx.fillStyle = '#3b2414';
  ctx.fillRect(mx - 3, my - 3, modalW + 6, modalH + 6);
  ctx.fillStyle = '#e7c894';
  ctx.fillRect(mx, my, modalW, modalH);
  ctx.strokeStyle = '#6b4226';
  ctx.lineWidth = 2;
  ctx.strokeRect(mx + 2, my + 2, modalW - 4, modalH - 4);

  ctx.fillStyle = '#452815';
  ctx.fillRect(mx + 4, my + 4, modalW - 8, 34);

  const globalChest = computeGlobalChestProgress(state, rpgRegistry);
  ctx.font = 'bold 13px monospace';
  ctx.textAlign = 'left';
  ctx.fillStyle = '#fde047';
  ctx.fillText('🗺 항해 해도 · WORLD SEA CHART', mx + 14, my + 25);

  ctx.font = 'bold 10px monospace';
  ctx.textAlign = 'right';
  ctx.fillStyle = globalChest.percent >= 100 ? '#facc15' : '#fef3c7';
  ctx.fillText(
    `전 세계 보물 ${globalChest.opened}/${globalChest.total} (${globalChest.percent}%)`,
    mx + modalW - 46,
    my + 25
  );

  const cb = regions.closeBtnRect;
  ctx.fillStyle = '#991b1b';
  ctx.fillRect(cb.x, cb.y, cb.w, cb.h);
  ctx.strokeStyle = '#fca5a5';
  ctx.lineWidth = 1;
  ctx.strokeRect(cb.x, cb.y, cb.w, cb.h);
  ctx.font = 'bold 12px monospace';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffffff';
  ctx.fillText('✕', cb.x + cb.w * 0.5, cb.y + 16);

  const tabY = my + 44;
  const tabW = 136;
  const zoneProg = computeZoneChestProgress(
    state,
    overlayState.activeZoneId,
    rpgRegistry
  );
  ZONE_TAB_ORDER.forEach((tab, idx) => {
    const tx = mx + 12 + idx * (tabW + 8);
    const unlocked = isSeaZoneUnlocked(state, tab.id, rpgRegistry);
    const active = overlayState.activeZoneId === tab.id;
    const rect = { x: tx, y: tabY, w: tabW, h: 26 };
    regions.zoneTabRects.push({ zoneId: tab.id, rect });

    ctx.fillStyle = active ? '#1e3a8a' : unlocked ? '#9a6b3b' : '#574332';
    ctx.fillRect(tx, tabY, tabW, 26);
    ctx.strokeStyle = active ? '#fde047' : '#452815';
    ctx.lineWidth = active ? 2 : 1;
    ctx.strokeRect(tx, tabY, tabW, 26);

    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = active ? '#fde047' : unlocked ? '#fef3c7' : '#cbd5e1';
    ctx.fillText(
      unlocked ? tab.label : `🔒 ${tab.label}`,
      tx + tabW * 0.5,
      tabY + 17
    );
  });

  ctx.font = 'bold 10px monospace';
  ctx.textAlign = 'right';
  ctx.fillStyle = '#452815';
  ctx.fillText(
    `해역 보물 ${zoneProg.opened}/${zoneProg.total} (${zoneProg.percent}%)`,
    mx + modalW - 14,
    tabY + 17
  );

  const bodyY = tabY + 34;
  const bodyH = modalH - (bodyY - my) - 12;
  const leftW = Math.round(modalW * 0.57);
  const mapX = mx + 12;
  const mapY = bodyY;
  const mapH = bodyH;

  const zone = rpgRegistry.seaZones[overlayState.activeZoneId];
  ctx.fillStyle =
    zone.id === 'new_world'
      ? '#1e1b4b'
      : zone.id === 'grand_line'
        ? '#0c4a6e'
        : '#0369a1';
  ctx.fillRect(mapX, mapY, leftW, mapH);
  ctx.strokeStyle = '#452815';
  ctx.lineWidth = 2;
  ctx.strokeRect(mapX, mapY, leftW, mapH);

  ctx.strokeStyle = 'rgba(186, 230, 253, 0.14)';
  ctx.lineWidth = 1;
  for (let gx = mapX + 48; gx < mapX + leftW; gx += 48) {
    ctx.beginPath();
    ctx.moveTo(gx, mapY);
    ctx.lineTo(gx, mapY + mapH);
    ctx.stroke();
  }
  for (let gy = mapY + 48; gy < mapY + mapH; gy += 48) {
    ctx.beginPath();
    ctx.moveTo(mapX, gy);
    ctx.lineTo(mapX + leftW, gy);
    ctx.stroke();
  }

  const innerPad = 18;
  const sX = (leftW - innerPad * 2) / zone.width;
  const sY = (mapH - innerPad * 2) / zone.height;
  const toChartPos = (wx: number, wy: number) => ({
    x: mapX + innerPad + wx * sX,
    y: mapY + innerPad + wy * sY
  });

  ctx.strokeStyle = 'rgba(125, 211, 252, 0.55)';
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 4]);
  for (const route of zone.currents ?? []) {
    if (route.points.length < 2) continue;
    ctx.beginPath();
    const p0 = toChartPos(route.points[0]!.x, route.points[0]!.y);
    ctx.moveTo(p0.x, p0.y);
    for (let i = 1; i < route.points.length; i++) {
      const p = toChartPos(route.points[i]!.x, route.points[i]!.y);
      ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
  }
  ctx.setLineDash([]);

  for (const wp of zone.whirlpools ?? []) {
    const c = toChartPos(wp.pos.x, wp.pos.y);
    ctx.strokeStyle = 'rgba(186, 230, 253, 0.72)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(c.x, c.y, 7, tick * 0.05, tick * 0.05 + 4.4);
    ctx.stroke();
  }

  const markers: WorldMarker[] =
    state.currentZoneId === zone.id
      ? collectSeaWorldMarkers(state, rpgRegistry, storyNode)
      : [];

  let selectedIsland: SeaIslandNode | undefined = zone.islands.find(
    (i) => i.islandId === overlayState.selectedIslandId
  );
  if (!selectedIsland) {
    selectedIsland = zone.islands[0];
  }

  for (const isl of zone.islands) {
    const p = toChartPos(isl.pos.x, isl.pos.y);
    const ix = Math.round(p.x);
    const iy = Math.round(p.y);
    const isSelected = selectedIsland?.islandId === isl.islandId;
    const done = state.completedEpisodes.includes(isl.episodeId);
    const visited = isIslandVisited(state, isl);
    const chest = zoneProg.byIsland[isl.islandId];

    regions.islandHitCircles.push({
      islandId: isl.islandId,
      cx: ix,
      cy: iy,
      r: 18
    });

    if (isSelected) {
      ctx.strokeStyle = '#fde047';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(ix, iy, 13, 0, Math.PI * 2);
      ctx.stroke();
    }

    ctx.fillStyle = done
      ? '#22c55e'
      : isl.endgameMode
        ? '#a855f7'
        : visited
          ? '#38bdf8'
          : '#64748b';
    ctx.beginPath();
    ctx.arc(ix, iy, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = chest?.isComplete ? '#facc15' : '#0f172a';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    const isMain =
      storyNode.targetZoneId === zone.id &&
      storyNode.targetIslandId === isl.islandId;
    const hasSide = markers.some(
      (m) => m.kind === 'SIDE' && Math.hypot(m.x - isl.pos.x, m.y - isl.pos.y) < 32
    );
    if (isMain) {
      ctx.fillStyle = '#fde047';
      ctx.font = 'bold 10px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('★', ix, iy - 11);
    } else if (hasSide) {
      ctx.fillStyle = '#7dd3fc';
      ctx.font = 'bold 9px monospace';
      ctx.textAlign = 'center';
      ctx.fillText('◆', ix, iy - 11);
    }

    ctx.font = 'bold 9px monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = isSelected ? '#fde047' : '#f8fafc';
    const shortName =
      isl.name.length > 10 ? `${isl.name.slice(0, 10)}…` : isl.name;
    ctx.fillText(shortName, ix, iy + 19);
  }

  if (zone.seaGate) {
    const gp = toChartPos(zone.seaGate.pos.x, zone.seaGate.pos.y);
    ctx.fillStyle = '#f43f5e';
    ctx.fillRect(gp.x - 5, gp.y - 5, 10, 10);
    ctx.font = 'bold 8px monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fda4af';
    ctx.fillText('⛩ 관문', gp.x, gp.y + 15);
  }

  if (state.currentZoneId === zone.id) {
    const sp = toChartPos(state.ship.pos.x, state.ship.pos.y);
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(sp.x, sp.y, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  regions.fastSailBtnRect = renderSeaChartDetailCard(
    ctx,
    state,
    rpgRegistry,
    overlayState,
    storyNode,
    zone.id,
    selectedIsland,
    {
      x: mapX + leftW + 10,
      y: mapY,
      w: modalW - leftW - 34,
      h: mapH
    },
    tick,
    assets
  );

  ctx.restore();
  return regions;
}
