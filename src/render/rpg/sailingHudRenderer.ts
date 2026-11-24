import { computeBountyTier } from '../../core/rpg/crewAndBountyEngine';
import { computeLogPoseNeedles, type SailingStepOutput } from '../../core/rpg/sailingPhysics';
import type { RpgCampaignState, RpgDataRegistry } from '../../core/types/rpgSchemas';
import type { SafeHudBounds } from '../viewport/safeAreaLayout';

export function renderSailingStatusHud(
  ctx: CanvasRenderingContext2D,
  state: RpgCampaignState,
  zoneName: string,
  shipName: string,
  safe: SafeHudBounds
): void {
  const hudX = 10 + safe.left;
  const hudY = 10 + safe.top;
  const bountyTier = computeBountyTier(state.totalCrewBounty);
  const weatherKo =
    state.seaWeather === 'STORM'
      ? '🌧 폭풍우'
      : state.seaWeather === 'FOG'
        ? '🌫 안개'
        : '☀ 맑음';

  ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
  ctx.fillRect(hudX, hudY, 272, 62);
  ctx.strokeStyle = '#38bdf8';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(hudX, hudY, 272, 62);

  ctx.font = 'bold 12px monospace';
  ctx.textAlign = 'left';
  ctx.fillStyle = '#fde047';
  ctx.fillText(`⚓ ${zoneName}`, hudX + 8, hudY + 17);

  ctx.font = '10px monospace';
  ctx.textAlign = 'right';
  ctx.fillStyle = '#38bdf8';
  ctx.fillText(weatherKo, hudX + 264, hudY + 17);

  ctx.textAlign = 'left';
  ctx.fillStyle = '#e2e8f0';
  ctx.fillText(
    `🚢 ${shipName} (내구도 ${Math.round(state.ship.hullHp)}/${state.ship.maxHullHp})`,
    hudX + 8,
    hudY + 35
  );
  ctx.fillStyle = '#f97316';
  ctx.fillText(
    `💰 현상금 ฿${state.totalCrewBounty.toLocaleString()} (${bountyTier.rankLabel})`,
    hudX + 8,
    hudY + 51
  );
}

export function computeLogPoseHudRect(
  zoneStyle: 'SINGLE_NEEDLE' | 'TRIPLE_NEEDLE_NEW_WORLD',
  safe: SafeHudBounds
): { x: number; y: number; w: number; h: number } {
  const w = 216;
  const h = zoneStyle === 'TRIPLE_NEEDLE_NEW_WORLD' ? 92 : 64;
  // Positioned left of top-right SeaMinimapHUD (148px @ safe.right - 158) with 8px gap
  const x = Math.round(safe.right - 158 - 8 - w);
  const y = Math.round(10 + safe.top);
  return { x, y, w, h };
}

export function renderLogPoseHud(
  ctx: CanvasRenderingContext2D,
  state: RpgCampaignState,
  rpgRegistry: RpgDataRegistry,
  tick: number,
  safe: SafeHudBounds
): void {
  const zone = rpgRegistry.seaZones[state.currentZoneId];
  const needles = computeLogPoseNeedles(state, rpgRegistry);
  const { x, y, w, h } = computeLogPoseHudRect(zone.logPoseStyle, safe);

  ctx.fillStyle = 'rgba(15, 23, 42, 0.90)';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle =
    zone.logPoseStyle === 'TRIPLE_NEEDLE_NEW_WORLD' ? '#a855f7' : '#38bdf8';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(x, y, w, h);

  ctx.font = 'bold 10px monospace';
  ctx.textAlign = 'left';
  ctx.fillStyle = '#fde047';
  const title =
    zone.logPoseStyle === 'TRIPLE_NEEDLE_NEW_WORLD'
      ? '🧭 신세계 삼침 로그 포스'
      : '🧭 그랜드 라인 기록지침';
  ctx.fillText(title, x + 8, y + 15);

  needles.forEach((nd, idx) => {
    const rowY = y + 32 + idx * 20;
    const cx = x + 18;
    const cy = rowY - 3;

    ctx.strokeStyle = '#64748b';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, 8, 0, Math.PI * 2);
    ctx.stroke();

    const jitter =
      zone.logPoseStyle === 'TRIPLE_NEEDLE_NEW_WORLD'
        ? Math.sin(tick * 0.25 * nd.dangerLevel) * 0.14
        : 0;
    const ang = nd.angleRad + jitter;
    ctx.strokeStyle = nd.completed
      ? '#4ade80'
      : nd.targetKind === 'SEA_GATE'
        ? '#38bdf8'
        : '#f43f5e';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(ang) * 7, cy + Math.sin(ang) * 7);
    ctx.stroke();

    ctx.font = '9px monospace';
    ctx.fillStyle = nd.completed ? '#4ade80' : '#f8fafc';
    const shortName =
      nd.targetName.length > 15 ? nd.targetName.slice(0, 15) : nd.targetName;
    const badge = nd.completed ? '[완료]' : `${nd.distancePx}m`;
    ctx.fillText(`${shortName} (${badge})`, x + 32, rowY);
  });
}

export function renderSailingInteractionPrompt(
  ctx: CanvasRenderingContext2D,
  state: RpgCampaignState,
  rpgRegistry: RpgDataRegistry,
  stepInfo: SailingStepOutput,
  safe: SafeHudBounds
): void {
  const cx = safe.centerX;
  const y = safe.bottom - 54;

  if (stepInfo.nearbyIsland) {
    const isl = stepInfo.nearbyIsland;
    const done = state.completedEpisodes.includes(isl.episodeId);
    ctx.fillStyle = 'rgba(15, 23, 42, 0.94)';
    ctx.fillRect(cx - 190, y, 380, 40);
    ctx.strokeStyle = done ? '#4ade80' : '#facc15';
    ctx.lineWidth = 2;
    ctx.strokeRect(cx - 190, y, 380, 40);

    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fde047';
    ctx.fillText(
      isl.playableInVerticalSlice
        ? `⚓ [E / Space / 화면 터치] "${isl.name}" 입항하기`
        : `⚓ "${isl.name}" (자유 항해 해역 거점)`,
      cx,
      y + 17
    );
    ctx.font = '10px monospace';
    ctx.fillStyle = '#cbd5e1';
    ctx.fillText(isl.summary, cx, y + 33);
  } else if (stepInfo.nearbySeaGate) {
    const gate = stepInfo.nearbySeaGate;
    ctx.fillStyle = 'rgba(15, 23, 42, 0.94)';
    ctx.fillRect(cx - 190, y, 380, 40);
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2;
    ctx.strokeRect(cx - 190, y, 380, 40);

    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#38bdf8';
    ctx.fillText(`⛩ [E / Space / 화면 터치] "${gate.name}" 진입`, cx, y + 17);
    ctx.font = '10px monospace';
    ctx.fillStyle = '#cbd5e1';
    ctx.fillText(gate.description, cx, y + 33);
  } else {
    const shipDef = rpgRegistry.ships[state.ship.shipId];
    const coupHint = shipDef?.hasCoupDeBurst
      ? state.ship.coupDeBurstCooldownTimer > 0
        ? ` · [Shift] 가속 (${state.ship.coupDeBurstCooldownTimer.toFixed(0)}초)`
        : ' · [Shift] 쿠 드 버스트 가속'
      : '';
    ctx.fillStyle = 'rgba(15, 23, 42, 0.78)';
    ctx.fillRect(cx - 165, safe.bottom - 28, 330, 20);
    ctx.font = '10px monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#cbd5e1';
    ctx.fillText(
      `[방향키 / WASD] 항해 · [E / Space] 입항${coupHint}`,
      cx,
      safe.bottom - 14
    );
  }
}
