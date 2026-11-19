import { clamp } from '../core/math/vector2';
import type { LockstepSyncController } from '../core/net/lockstepController';
import type { BattleWorldState } from '../core/types/battleState';
import {
  DEFAULT_VIEWPORT_METRICS,
  type ViewportMetrics
} from './viewport/responsiveViewportManager';

export type SpectatorCameraTarget = 'ALL' | 0 | 1 | 2 | 3;

export function renderOnlineAndSpectatorHud(
  ctx: CanvasRenderingContext2D,
  world: BattleWorldState,
  lockstep: LockstepSyncController,
  isSpectator: boolean,
  cameraTarget: SpectatorCameraTarget,
  pingMs: number,
  fps: number,
  isTerminalMatch: boolean,
  viewport: ViewportMetrics = DEFAULT_VIEWPORT_METRICS
): void {
  const viewW = viewport.viewWidth;
  const viewH = viewport.viewHeight;
  const { top: safeT, bottom: safeB } = viewport.safeInsets;

  ctx.save();

  const cx = viewW * 0.5;

  // 1. Top Online Match Status & Sync Integrity Banner
  ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
  ctx.fillRect(cx - 190, 54 + safeT, 380, 22);
  ctx.strokeStyle = isSpectator ? '#a855f7' : '#38bdf8';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(cx - 190, 54 + safeT, 380, 22);

  const latestHashShort = lockstep.getLatestStateHash().slice(0, 8);
  ctx.font = 'bold 10px monospace';
  ctx.textAlign = 'center';
  ctx.fillStyle = isSpectator ? '#e9d5ff' : '#7dd3fc';
  const roleTag = isSpectator
    ? '🎥 SPECTATOR LIVE'
    : isTerminalMatch
      ? '🌐 단말기 통신 대전 (아이템 금지/HP무손실)'
      : '🌐 ONLINE LOCKSTEP';
  ctx.fillText(
    `${roleTag} | ROOM:${lockstep.config.roomCode} | PING:${pingMs}ms | HASH:${latestHashShort} | ${fps}FPS`,
    cx,
    68 + safeT
  );

  // 2. Spectator Dedicated Broadcast Footer (Replaces player skill bar & touch controls)
  if (isSpectator) {
    const fy = viewH - 54 - safeB;
    ctx.fillStyle = 'rgba(15, 23, 42, 0.94)';
    ctx.fillRect(cx - 320, fy, 640, 46);
    ctx.strokeStyle = '#a855f7';
    ctx.lineWidth = 2;
    ctx.strokeRect(cx - 320, fy, 640, 46);

    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fde047';
    const camLabel =
      cameraTarget === 'ALL'
        ? '전체 아레나 (ALL)'
        : `P${cameraTarget + 1} 유닛 추적 카메라`;
    ctx.fillText(
      `🎥 관전 전용 중계 HUD — 현재 카메라: [${camLabel}] (하단 버튼으로 카메라 전환)`,
      cx,
      fy + 17
    );

    // Mini team summary bar inside spectator footer
    const alphaUnits = world.units.filter((u) => u.team === 'ALPHA');
    const omegaUnits = world.units.filter((u) => u.team === 'OMEGA');
    const alphaSummary = alphaUnits
      .map(
        (u) =>
          `${u.name}(${Math.round((u.hp / Math.max(1, u.maxHp)) * 100)}%/${u.currentStanceRole})`
      )
      .join(' ');
    const omegaSummary = omegaUnits
      .map(
        (u) =>
          `${u.name}(${Math.round((u.hp / Math.max(1, u.maxHp)) * 100)}%/${u.currentStanceRole})`
      )
      .join(' ');

    ctx.font = '10px monospace';
    ctx.fillStyle = '#38bdf8';
    ctx.textAlign = 'left';
    ctx.fillText(`BLUE: ${alphaSummary}`, cx - 308, fy + 36);

    ctx.fillStyle = '#f43f5e';
    ctx.textAlign = 'right';
    ctx.fillText(`RED: ${omegaSummary}`, cx + 308, fy + 36);
  }

  // 3. 15-Second Opponent Disconnect Reconnect Countdown Overlay
  if (lockstep.opponentDisconnected) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.72)';
    ctx.fillRect(0, 0, viewW, viewH);

    ctx.fillStyle = '#0f172a';
    ctx.fillRect(cx - 210, viewH * 0.5 - 52, 420, 104);
    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 2.5;
    ctx.strokeRect(cx - 210, viewH * 0.5 - 52, 420, 104);

    ctx.font = 'bold 15px monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fde047';
    ctx.fillText(
      '📡 상대 플레이어 연결 끊김 — 재접속 대기 중...',
      cx,
      viewH * 0.5 - 18
    );

    const ratio = clamp(lockstep.reconnectCountdownSec / 15, 0, 1);
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(cx - 160, viewH * 0.5, 320, 12);
    ctx.fillStyle = '#f59e0b';
    ctx.fillRect(cx - 160, viewH * 0.5, Math.round(320 * ratio), 12);

    ctx.font = 'bold 12px monospace';
    ctx.fillStyle = '#f8fafc';
    ctx.fillText(
      `자동 승리 판정까지 ${lockstep.reconnectCountdownSec.toFixed(1)}초`,
      cx,
      viewH * 0.5 + 34
    );
  }

  // 4. Desync Alert Overlay
  if (lockstep.desyncDetected) {
    ctx.fillStyle = 'rgba(0, 0, 0, 0.78)';
    ctx.fillRect(0, 0, viewW, viewH);

    ctx.fillStyle = '#450a0a';
    ctx.fillRect(cx - 230, viewH * 0.5 - 55, 460, 110);
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 3;
    ctx.strokeRect(cx - 230, viewH * 0.5 - 55, 460, 110);

    ctx.font = 'bold 16px monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fca5a5';
    ctx.fillText(
      '⚠ DESYNC_DETECTED — 클라이언트 상태 해시 불일치 감지',
      cx,
      viewH * 0.5 - 20
    );
    ctx.font = '11px monospace';
    ctx.fillStyle = '#fecaca';
    ctx.fillText(
      lockstep.desyncReason ?? '매치를 안전하게 중단하고 로비로 복귀합니다.',
      cx,
      viewH * 0.5 + 10
    );
  }

  ctx.restore();
}
