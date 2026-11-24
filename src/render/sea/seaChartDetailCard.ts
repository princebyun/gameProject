import type { AssetLoader } from '../../assets/assetLoader';
import {
  computeIslandChestProgress,
  evaluateFastSailEligibility,
  isIslandVisited
} from '../../core/rpg/seaChartLogic';
import type {
  RpgCampaignState,
  RpgDataRegistry,
  SeaIslandNode,
  SeaZoneId
} from '../../core/types/rpgSchemas';
import type { StoryNodeSnapshot } from '../../story/storyDirector';

export interface SeaChartRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface SeaChartOverlayState {
  isOpen: boolean;
  activeZoneId: SeaZoneId;
  selectedIslandId: string | null;
  feedbackNotice: string | null;
  feedbackTimerSec: number;
}

function drawGoldCrownBadge(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number
): void {
  ctx.fillStyle = '#422006';
  ctx.fillRect(x, y, 66, 17);
  ctx.strokeStyle = '#facc15';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(x, y, 66, 17);

  ctx.fillStyle = '#facc15';
  ctx.fillRect(x + 5, y + 8, 9, 4);
  ctx.fillRect(x + 5, y + 5, 2, 3);
  ctx.fillRect(x + 8, y + 4, 3, 4);
  ctx.fillRect(x + 12, y + 5, 2, 3);

  ctx.font = 'bold 9px monospace';
  ctx.textAlign = 'left';
  ctx.fillStyle = '#fef08a';
  ctx.fillText('100% ★', x + 18, y + 12);
}

export function renderSeaChartDetailCard(
  ctx: CanvasRenderingContext2D,
  state: RpgCampaignState,
  rpgRegistry: RpgDataRegistry,
  overlayState: SeaChartOverlayState,
  storyNode: StoryNodeSnapshot,
  zoneId: SeaZoneId,
  selectedIsland: SeaIslandNode | undefined,
  cardRect: SeaChartRect,
  tick: number,
  assets?: AssetLoader
): SeaChartRect | null {
  const { x: cardX, y: cardY, w: cardW, h: cardH } = cardRect;
  ctx.fillStyle = '#2d1a0e';
  ctx.fillRect(cardX, cardY, cardW, cardH);
  ctx.strokeStyle = '#8b5e34';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(cardX, cardY, cardW, cardH);

  if (!selectedIsland) return null;

  const lm = assets?.getWorldLandmarkSheet(selectedIsland.islandId);
  const previewSize = 84;
  const prevX = cardX + 12;
  const prevY = cardY + 12;

  ctx.fillStyle = '#0c4a6e';
  ctx.fillRect(prevX, prevY, previewSize, previewSize);
  ctx.strokeStyle = '#c89b62';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(prevX, prevY, previewSize, previewSize);

  if (lm?.entry && lm.sheet) {
    const fr = Math.floor((tick / 60) * lm.entry.fps) % Math.max(1, lm.entry.frameCount);
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(
      lm.sheet,
      fr * lm.entry.frameWidth,
      0,
      lm.entry.frameWidth,
      lm.entry.frameHeight,
      prevX + 2,
      prevY + 2,
      previewSize - 4,
      previewSize - 4
    );
    ctx.restore();
  } else {
    ctx.fillStyle = selectedIsland.color;
    ctx.fillRect(prevX + 18, prevY + 18, 48, 48);
  }

  const done = state.completedEpisodes.includes(selectedIsland.episodeId);
  const visited = isIslandVisited(state, selectedIsland);
  const islChest = computeIslandChestProgress(
    state,
    selectedIsland.islandId,
    rpgRegistry
  );
  const fastCheck = evaluateFastSailEligibility(
    state,
    zoneId,
    selectedIsland,
    rpgRegistry
  );

  const metaX = prevX + previewSize + 10;
  const metaW = cardW - previewSize - 32;
  ctx.textAlign = 'left';
  ctx.font = 'bold 12px monospace';
  ctx.fillStyle = '#fde047';
  ctx.fillText(selectedIsland.name, metaX, prevY + 16, metaW);

  ctx.font = '9px monospace';
  ctx.fillStyle = '#e2e8f0';
  ctx.fillText(selectedIsland.sagaName, metaX, prevY + 32, metaW);

  ctx.fillStyle = done ? '#4ade80' : visited ? '#38bdf8' : '#94a3b8';
  ctx.fillText(
    done
      ? '★ 에피소드 클리어'
      : visited
        ? '⚓ 방문 완료 · 탐색 가능'
        : '○ 미방문 지역',
    metaX,
    prevY + 48,
    metaW
  );
  ctx.fillStyle = '#fca5a5';
  ctx.fillText(`위험도 ★×${selectedIsland.dangerLevel}`, metaX, prevY + 64, metaW);

  if (
    storyNode.targetZoneId === zoneId &&
    storyNode.targetIslandId === selectedIsland.islandId
  ) {
    ctx.fillStyle = '#fde047';
    ctx.fillText('★ MAIN 스토리 목표 지점', metaX, prevY + 80, metaW);
  }

  const chestBoxY = prevY + previewSize + 14;
  ctx.fillStyle = '#1c1008';
  ctx.fillRect(cardX + 12, chestBoxY, cardW - 24, 52);
  ctx.strokeStyle = islChest.isComplete ? '#facc15' : '#6b4226';
  ctx.lineWidth = 1;
  ctx.strokeRect(cardX + 12, chestBoxY, cardW - 24, 52);

  ctx.font = 'bold 10px monospace';
  ctx.textAlign = 'left';
  ctx.fillStyle = '#fef3c7';
  ctx.fillText(
    islChest.total > 0
      ? `보물상자 수집: ${islChest.opened} / ${islChest.total} (${islChest.percent}%)`
      : '특수 해역 거점 (상자 없음)',
    cardX + 20,
    chestBoxY + 18
  );

  if (islChest.isComplete) {
    drawGoldCrownBadge(ctx, cardX + cardW - 84, chestBoxY + 5);
  }

  const barW = cardW - 40;
  ctx.fillStyle = '#3b2414';
  ctx.fillRect(cardX + 20, chestBoxY + 29, barW, 10);
  if (islChest.total > 0) {
    ctx.fillStyle = islChest.isComplete ? '#facc15' : '#38bdf8';
    ctx.fillRect(
      cardX + 20,
      chestBoxY + 29,
      Math.round((barW * islChest.opened) / islChest.total),
      10
    );
  }

  ctx.font = '10px monospace';
  ctx.fillStyle = '#cbd5e1';
  ctx.fillText(selectedIsland.summary, cardX + 12, chestBoxY + 72, cardW - 24);

  const btnW = cardW - 24;
  const btnH = 38;
  const btnX = cardX + 12;
  const btnY = cardY + cardH - btnH - 28;

  ctx.fillStyle = fastCheck.allowed ? '#15803d' : '#334155';
  ctx.fillRect(btnX, btnY, btnW, btnH);
  ctx.strokeStyle = fastCheck.allowed ? '#4ade80' : '#64748b';
  ctx.lineWidth = 2;
  ctx.strokeRect(btnX, btnY, btnW, btnH);

  ctx.font = 'bold 12px monospace';
  ctx.textAlign = 'center';
  ctx.fillStyle = fastCheck.allowed ? '#ffffff' : '#94a3b8';
  ctx.fillText(
    fastCheck.allowed ? '⛵ [빠른 항해] 즉시 이동하기' : '🔒 빠른 항해 잠김',
    btnX + btnW * 0.5,
    btnY + 23
  );

  ctx.font = '9px monospace';
  ctx.fillStyle =
    overlayState.feedbackNotice && overlayState.feedbackTimerSec > 0
      ? '#fca5a5'
      : fastCheck.allowed
        ? '#86efac'
        : '#cbd5e1';
  const note =
    overlayState.feedbackNotice && overlayState.feedbackTimerSec > 0
      ? overlayState.feedbackNotice
      : fastCheck.reason;
  ctx.fillText(note, btnX + btnW * 0.5, btnY + btnH + 15, btnW);

  return { x: btnX, y: btnY, w: btnW, h: btnH };
}
