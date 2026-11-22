import type { IslandStepOutput } from '../../core/rpg/episodeEngine';
import type { RpgCampaignState, RpgDataRegistry } from '../../core/types/rpgSchemas';
import type { ViewportMetrics } from '../viewport/responsiveViewportManager';
import { getSafeHudBounds } from '../viewport/safeAreaLayout';

export function renderIslandHeaderAndPromptHud(
  ctx: CanvasRenderingContext2D,
  state: RpgCampaignState,
  islandMap: RpgDataRegistry['islands'][string],
  episode: RpgDataRegistry['episodes'][string] | null | undefined,
  stepInfo: IslandStepOutput,
  viewport: ViewportMetrics
): void {
  const safe = getSafeHudBounds(viewport);

  // Compact Top-Left Island Episode Header HUD (respecting Safe Area)
  const hudX = 10 + safe.left;
  const hudY = 10 + safe.top;
  ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
  ctx.fillRect(hudX, hudY, 316, 50);
  ctx.strokeStyle = '#facc15';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(hudX, hudY, 316, 50);

  ctx.font = 'bold 12px monospace';
  ctx.textAlign = 'left';
  ctx.fillStyle = '#fde047';
  ctx.fillText(`🏝 ${islandMap.name}`, hudX + 8, hudY + 18);

  if (episode) {
    const epCompleted = state.completedEpisodes.includes(episode.episodeId);
    let doneSteps = 0;
    for (let i = 0; i < episode.steps.length; i++) {
      const st = episode.steps[i];
      if (st && state.episodeFlags[st.requiredFlag]) {
        doneSteps += 1;
      }
    }
    ctx.font = 'bold 10px monospace';
    ctx.fillStyle = epCompleted ? '#4ade80' : '#38bdf8';
    ctx.fillText(
      epCompleted
        ? `★ ${episode.title} [클리어 완료]`
        : `${episode.title} (${doneSteps}/${episode.steps.length})`,
      hudX + 8,
      hudY + 37
    );
  }

  // Bottom Interaction Prompt Bar (centered in full viewWidth, respecting Safe Area bottom)
  const cx = safe.centerX;
  const py = safe.bottom - 42;
  const hasAction = Boolean(
    stepInfo.nearbySwitch ||
      stepInfo.nearbyNpc ||
      stepInfo.nearbyEncounter ||
      stepInfo.atBattleTerminal ||
      stepInfo.atPortExit
  );
  const boxW = hasAction ? 360 : 300;
  const boxH = hasAction ? 32 : 22;
  const boxY = hasAction ? py : safe.bottom - 30;

  ctx.fillStyle = hasAction ? 'rgba(15, 23, 42, 0.94)' : 'rgba(15, 23, 42, 0.78)';
  ctx.fillRect(cx - boxW * 0.5, boxY, boxW, boxH);
  if (hasAction) {
    ctx.strokeStyle = '#facc15';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(cx - boxW * 0.5, boxY, boxW, boxH);
  }

  ctx.font = hasAction ? 'bold 11px monospace' : '10px monospace';
  ctx.textAlign = 'center';
  ctx.fillStyle = hasAction ? '#fde047' : '#cbd5e1';

  if (stepInfo.nearbySwitch) {
    ctx.fillText(
      `⚙ [E / Space / 터치] "${stepInfo.nearbySwitch.label}" 작동하기`,
      cx,
      boxY + 20
    );
  } else if (stepInfo.nearbyNpc) {
    ctx.fillText(
      `💬 [E / Space / 터치] "${stepInfo.nearbyNpc.name}" 대화하기`,
      cx,
      boxY + 20
    );
  } else if (stepInfo.nearbyEncounter) {
    ctx.fillText(
      `⚔ [E / Space / 터치] "${stepInfo.nearbyEncounter.name}" 전투 시작!`,
      cx,
      boxY + 20
    );
  } else if (stepInfo.atBattleTerminal) {
    ctx.fillText(
      `🌐 [E / Space / 터치] 항구 통신 대전 단말기 접속`,
      cx,
      boxY + 20
    );
  } else if (stepInfo.atPortExit) {
    ctx.fillText(
      `⚓ [E / Space / 터치] 바다로 출항하기`,
      cx,
      boxY + 20
    );
  } else {
    ctx.fillText(
      `[방향키 / WASD] 이동 · [E / Space] 대화 및 조사`,
      cx,
      boxY + 15
    );
  }
}
