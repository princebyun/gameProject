import type { AssetLoader } from '../../assets/assetLoader';
import type { WantedPosterFrameTier } from '../../core/endgame/types';
import type { GameDataRegistry } from '../../core/types/dataSchemas';
import type {
  GateValidationResult,
  WantedPosterEvent
} from '../../core/types/rpgSchemas';
import {
  DEFAULT_VIEWPORT_METRICS,
  type ViewportMetrics
} from '../viewport/responsiveViewportManager';
import { getSafeHudBounds } from '../viewport/safeAreaLayout';

/**
 * SeaGate Blocked Checklist Popup (Enforces East Blue / Grand Line prerequisites before New World)
 */
export function renderSeaGateBlockedPopup(
  ctx: CanvasRenderingContext2D,
  gateResult: GateValidationResult,
  viewport: ViewportMetrics = DEFAULT_VIEWPORT_METRICS
): void {
  const safe = getSafeHudBounds(viewport);

  ctx.save();
  ctx.fillStyle = 'rgba(0, 0, 0, 0.72)';
  ctx.fillRect(0, 0, safe.viewWidth, safe.viewHeight);

  const totalItems = gateResult.checklist.length;
  const useTwoCols = totalItems > 5;
  const rows = useTwoCols ? Math.ceil(totalItems / 2) : totalItems;
  const w = useTwoCols ? 740 : 540;
  const rowStep = useTwoCols ? 32 : 34;
  const h = Math.min(470, Math.max(250, 148 + rows * rowStep));
  const x = Math.round((safe.viewWidth - w) * 0.5);
  const y = Math.round((safe.viewHeight - h) * 0.5);

  ctx.fillStyle = '#0f172a';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = '#f43f5e';
  ctx.lineWidth = 3;
  ctx.strokeRect(x, y, w, h);

  ctx.font = 'bold 16px monospace';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#fda4af';
  ctx.fillText(
    `🔒 관문 진입 차단: ${gateResult.gateName}`,
    x + w * 0.5,
    y + 30
  );

  ctx.font = '12px monospace';
  ctx.fillStyle = '#e2e8f0';
  const doneCount = gateResult.checklist.filter((c) => c.completed).length;
  ctx.fillText(
    `[${gateResult.targetZoneId.toUpperCase()}] 해역 진입 필수 에피소드 (${doneCount}/${totalItems} 완료):`,
    x + w * 0.5,
    y + 54
  );

  const colW = useTwoCols ? Math.floor((w - 52) / 2) : w - 56;
  gateResult.checklist.forEach((item, idx) => {
    const col = useTwoCols ? idx % 2 : 0;
    const row = useTwoCols ? Math.floor(idx / 2) : idx;
    const cellX = x + 20 + col * (colW + 12);
    const rowY = y + 74 + row * rowStep;
    ctx.fillStyle = item.completed
      ? 'rgba(22, 163, 74, 0.22)'
      : 'rgba(225, 29, 72, 0.22)';
    ctx.fillRect(cellX, rowY, colW, 26);
    ctx.strokeStyle = item.completed ? '#4ade80' : '#f43f5e';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(cellX, rowY, colW, 26);

    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'left';
    ctx.fillStyle = item.completed ? '#4ade80' : '#fda4af';
    const statusIcon = item.completed ? '✓' : '❌';
    const label = `${statusIcon} ${item.islandName}`;
    ctx.fillText(
      label.length > 34 ? `${label.slice(0, 33)}…` : label,
      cellX + 8,
      rowY + 17
    );
  });

  ctx.font = 'bold 11px monospace';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#fde047';
  ctx.fillText(
    '해당 섬의 정박 구역(Docking Zone)에 입항해 에피소드를 클리어한 뒤 다시 방문하세요.',
    x + w * 0.5,
    y + h - 38
  );
  ctx.fillStyle = '#38bdf8';
  ctx.fillText('[E / Space / 클릭: 팝업 닫기]', x + w * 0.5, y + h - 16);

  ctx.restore();
}

/**
 * Wanted Poster Bounty Cutscene Overlay
 */
export function renderWantedPosterOverlay(
  ctx: CanvasRenderingContext2D,
  poster: WantedPosterEvent,
  gameRegistry: GameDataRegistry,
  assets: AssetLoader,
  isTampered: boolean = false,
  frameTier: WantedPosterFrameTier = 'default',
  viewport: ViewportMetrics = DEFAULT_VIEWPORT_METRICS
): void {
  const viewW = viewport.viewWidth;
  const viewH = viewport.viewHeight;

  ctx.save();
  ctx.fillStyle = 'rgba(0, 0, 0, 0.72)';
  ctx.fillRect(0, 0, viewW, viewH);

  const w = 260;
  const h = 368;
  const x = Math.round((viewW - w) * 0.5);
  const y = Math.round((viewH - h) * 0.5);

  const framePalette: Record<
    WantedPosterFrameTier,
    { border: string; inner: string; badge: string; label: string }
  > = {
    default: { border: '#78350f', inner: '#92400e', badge: '#78350f', label: '' },
    gold: { border: '#eab308', inner: '#fef08a', badge: '#ca8a04', label: '★ GOLD FRAME ★' },
    platinum: { border: '#94a3b8', inner: '#e2e8f0', badge: '#475569', label: '✦ PLATINUM FRAME ✦' },
    diamond: { border: '#38bdf8', inner: '#bae6fd', badge: '#0284c7', label: '❖ DIAMOND CHAMPION ❖' }
  };
  const fp = framePalette[frameTier] ?? framePalette.default;

  if (frameTier !== 'default') {
    ctx.strokeStyle = fp.inner;
    ctx.lineWidth = 8;
    ctx.strokeRect(x - 4, y - 4, w + 8, h + 8);
  }

  ctx.fillStyle = '#fef3c7';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = fp.border;
  ctx.lineWidth = frameTier === 'default' ? 4 : 6;
  ctx.strokeRect(x, y, w, h);

  if (fp.label) {
    ctx.fillStyle = fp.badge;
    ctx.fillRect(x + 24, y - 14, w - 48, 18);
    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(fp.label, x + w * 0.5, y - 2);
  }

  ctx.font = 'bold 28px serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#451a03';
  ctx.fillText('WANTED', x + w * 0.5, y + 40);

  ctx.fillStyle = '#1e293b';
  ctx.fillRect(x + 35, y + 52, w - 70, 140);
  ctx.strokeStyle = '#78350f';
  ctx.lineWidth = 2.5;
  ctx.strokeRect(x + 35, y + 52, w - 70, 140);

  const unitDef = gameRegistry.units[poster.unitId];
  if (unitDef) {
    const portrait = assets.getOrCreateUnitPortrait(poster.unitId, 'smirk');
    if (portrait) {
      ctx.drawImage(portrait, x + w * 0.5 - 52, y + 70, 104, 104);
    } else {
      const sprite = assets.getOrCreateUnitSprite(unitDef, 'BASE', null);
      if (sprite) {
        ctx.drawImage(sprite, x + w * 0.5 - 48, y + 74, 96, 96);
      }
    }
  }

  ctx.font = 'bold 14px serif';
  ctx.fillStyle = '#451a03';
  ctx.fillText('DEAD OR ALIVE', x + w * 0.5, y + 214);

  ctx.font = 'bold 18px monospace';
  ctx.fillStyle = '#1c1917';
  ctx.fillText(poster.characterName, x + w * 0.5, y + 242);

  ctx.font = 'bold 11px monospace';
  ctx.fillStyle = '#78350f';
  ctx.fillText(
    `이전: ฿ ${poster.previousBounty.toLocaleString()}`,
    x + w * 0.5,
    y + 266
  );

  ctx.font = 'bold 16px monospace';
  ctx.fillStyle = '#b91c1c';
  ctx.fillText(
    `฿ ${poster.newBounty.toLocaleString()} -`,
    x + w * 0.5,
    y + 292
  );

  ctx.font = '10px monospace';
  ctx.fillStyle = '#57534e';
  ctx.fillText(`사유: ${poster.reason}`, x + w * 0.5, y + 314);

  if (isTampered) {
    ctx.fillStyle = '#dc2626';
    ctx.fillRect(x + 14, y + 322, w - 28, 18);
    ctx.font = 'bold 9px monospace';
    ctx.fillStyle = '#ffffff';
    ctx.fillText('⚠ 비공식 수정 데이터 (통신 대전 제한)', x + w * 0.5, y + 334);
  }

  ctx.font = '10px monospace';
  ctx.fillStyle = '#0284c7';
  ctx.fillText('[화면 터치 / 방향키 / Space로 닫기]', x + w * 0.5, y + 354);

  ctx.restore();
}

/**
 * Pixel Auto-Save Indicator & Persistent Tamper Warning Overlay
 */
export function renderSaveAndTamperOverlay(
  ctx: CanvasRenderingContext2D,
  saveIndicatorTimer: number,
  saveIndicatorText: string,
  isTampered: boolean,
  viewport: ViewportMetrics = DEFAULT_VIEWPORT_METRICS
): void {
  const safe = getSafeHudBounds(viewport);

  ctx.save();

  if (isTampered) {
    const bx = safe.right - 246;
    const by = 110 + safe.top;
    ctx.fillStyle = 'rgba(185, 28, 28, 0.92)';
    ctx.fillRect(bx, by, 236, 22);
    ctx.strokeStyle = '#fca5a5';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(bx, by, 236, 22);
    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffff';
    ctx.fillText('⚠ 비공식 수정 데이터 (통신 대전 제한)', bx + 118, by + 15);
  }

  if (saveIndicatorTimer > 0) {
    const sx = safe.right - 172;
    const sy = safe.bottom - 30;
    ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
    ctx.fillRect(sx, sy, 162, 22);
    ctx.strokeStyle = '#4ade80';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(sx, sy, 162, 22);
    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#4ade80';
    ctx.fillText(saveIndicatorText, sx + 81, sy + 15);
  }

  ctx.restore();
}
