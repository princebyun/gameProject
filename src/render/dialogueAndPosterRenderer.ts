import type { AssetLoader } from '../assets/assetLoader';
import { LOGICAL_HEIGHT, LOGICAL_WIDTH } from '../core/constants';
import type { GameDataRegistry } from '../core/types/dataSchemas';
import type {
  GateValidationResult,
  IslandNpcDefinition,
  WantedPosterEvent
} from '../core/types/rpgSchemas';

/**
 * 1. OS-Font-Independent Canvas Dialogue & Choice Cutscene Overlay
 */
export function renderDialogueCutsceneOverlay(
  ctx: CanvasRenderingContext2D,
  npc: IslandNpcDefinition,
  lineIndex: number
): void {
  ctx.save();
  const boxW = 680;
  const boxH = 148;
  const x = Math.round((LOGICAL_WIDTH - boxW) * 0.5);
  const y = LOGICAL_HEIGHT - boxH - 18;

  ctx.fillStyle = 'rgba(9, 13, 22, 0.95)';
  ctx.fillRect(x, y, boxW, boxH);
  ctx.strokeStyle = '#facc15';
  ctx.lineWidth = 2.5;
  ctx.strokeRect(x, y, boxW, boxH);

  // Portrait badge
  ctx.fillStyle = npc.color;
  ctx.fillRect(x + 16, y + 18, 64, 64);
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 2;
  ctx.strokeRect(x + 16, y + 18, 64, 64);

  // Speaker Name & Role
  ctx.font = 'bold 14px monospace';
  ctx.textAlign = 'left';
  ctx.fillStyle = '#fde047';
  ctx.fillText(`${npc.name}  [${npc.roleLabel}]`, x + 96, y + 32);

  // Dialogue text line
  const line = npc.dialogueLines[lineIndex] ?? npc.dialogueLines[0] ?? '';
  ctx.font = '12px monospace';
  ctx.fillStyle = '#f8fafc';
  // Wrap line if longer than 52 chars
  const chunk1 = line.slice(0, 48);
  const chunk2 = line.slice(48, 96);
  ctx.fillText(chunk1, x + 96, y + 58);
  if (chunk2) {
    ctx.fillText(chunk2, x + 96, y + 76);
  }

  // Choice or Next prompt
  const isLastLine = lineIndex + 1 >= npc.dialogueLines.length;
  if (isLastLine && npc.choices && npc.choices.length > 0) {
    const ch = npc.choices[0];
    ctx.fillStyle = 'rgba(2, 132, 199, 0.35)';
    ctx.fillRect(x + 96, y + 92, boxW - 116, 28);
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x + 96, y + 92, boxW - 116, 28);

    ctx.font = 'bold 11px monospace';
    ctx.fillStyle = '#7dd3fc';
    ctx.fillText(`▶ [E / Space / 클릭 선택] ${ch.label}`, x + 106, y + 110);
  } else {
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'right';
    ctx.fillStyle = '#38bdf8';
    ctx.fillText(
      `[E / Space / 클릭] 다음 대화 (${lineIndex + 1}/${npc.dialogueLines.length}) ▶`,
      x + boxW - 18,
      y + boxH - 14
    );
  }

  ctx.restore();
}

/**
 * 2. SeaGate Blocked Checklist Popup (Enforces East Blue / Grand Line prerequisites before New World)
 */
export function renderSeaGateBlockedPopup(
  ctx: CanvasRenderingContext2D,
  gateResult: GateValidationResult
): void {
  ctx.save();
  ctx.fillStyle = 'rgba(0, 0, 0, 0.72)';
  ctx.fillRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);

  const totalItems = gateResult.checklist.length;
  const useTwoCols = totalItems > 5;
  const rows = useTwoCols ? Math.ceil(totalItems / 2) : totalItems;
  const w = useTwoCols ? 740 : 540;
  const rowStep = useTwoCols ? 32 : 34;
  const h = Math.min(470, Math.max(250, 148 + rows * rowStep));
  const x = Math.round((LOGICAL_WIDTH - w) * 0.5);
  const y = Math.round((LOGICAL_HEIGHT - h) * 0.5);

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
 * 3. Wanted Poster Bounty Cutscene Overlay
 */
export function renderWantedPosterOverlay(
  ctx: CanvasRenderingContext2D,
  poster: WantedPosterEvent,
  gameRegistry: GameDataRegistry,
  assets: AssetLoader,
  isTampered: boolean = false
): void {
  ctx.save();
  ctx.fillStyle = 'rgba(0, 0, 0, 0.72)';
  ctx.fillRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);

  const w = 260;
  const h = 368;
  const x = Math.round((LOGICAL_WIDTH - w) * 0.5);
  const y = Math.round((LOGICAL_HEIGHT - h) * 0.5);

  // Aged parchment paper background
  ctx.fillStyle = '#fef3c7';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = '#78350f';
  ctx.lineWidth = 4;
  ctx.strokeRect(x, y, w, h);

  ctx.font = 'bold 28px serif';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#451a03';
  ctx.fillText('WANTED', x + w * 0.5, y + 40);

  // Portrait frame
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(x + 35, y + 52, w - 70, 140);
  ctx.strokeStyle = '#78350f';
  ctx.lineWidth = 2.5;
  ctx.strokeRect(x + 35, y + 52, w - 70, 140);

  const unitDef = gameRegistry.units[poster.unitId];
  if (unitDef) {
    const sprite = assets.getOrCreateUnitSprite(unitDef, 'BASE', null);
    if (sprite) {
      ctx.drawImage(sprite, x + w * 0.5 - 48, y + 74, 96, 96);
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
  ctx.fillText('[클릭 또는 E/Space: 수배서 닫기]', x + w * 0.5, y + 354);

  ctx.restore();
}

/**
 * 4. Pixel Auto-Save Indicator & Persistent Tamper Warning Overlay
 */
export function renderSaveAndTamperOverlay(
  ctx: CanvasRenderingContext2D,
  saveIndicatorTimer: number,
  saveIndicatorText: string,
  isTampered: boolean
): void {
  ctx.save();

  if (isTampered) {
    const bx = LOGICAL_WIDTH - 246;
    const by = 110;
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
    const sx = LOGICAL_WIDTH - 165;
    const sy = LOGICAL_HEIGHT - 30;
    ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
    ctx.fillRect(sx, sy, 155, 22);
    ctx.strokeStyle = '#4ade80';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(sx, sy, 155, 22);
    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#4ade80';
    ctx.fillText(saveIndicatorText, sx + 77, sy + 15);
  }

  ctx.restore();
}
