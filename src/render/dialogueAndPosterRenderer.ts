import type { AssetLoader } from '../assets/assetLoader';
import type { Vec2 } from '../core/math/vector2';
import type { GameDataRegistry } from '../core/types/dataSchemas';
import type { IslandNpcDefinition } from '../core/types/rpgSchemas';
import {
  renderSaveAndTamperOverlay,
  renderSeaGateBlockedPopup,
  renderWantedPosterOverlay
} from './rpg/cutsceneOverlayRenderer';
import {
  DEFAULT_VIEWPORT_METRICS,
  type ViewportMetrics
} from './viewport/responsiveViewportManager';
import { getSafeHudBounds } from './viewport/safeAreaLayout';

export {
  renderSaveAndTamperOverlay,
  renderSeaGateBlockedPopup,
  renderWantedPosterOverlay
};

export interface DialogueOverlayUiState {
  lastNpcId: string | null;
  lastLineIndex: number;
  revealedChars: number;
  charTimer: number;
  autoAdvance: boolean;
  autoWaitTimer: number;
  showLog: boolean;
  history: { speaker: string; text: string }[];
  autoBtnBounds: { x: number; y: number; w: number; h: number };
  logBtnBounds: { x: number; y: number; w: number; h: number };
  skipBtnBounds: { x: number; y: number; w: number; h: number };
}

export function createDialogueOverlayUiState(): DialogueOverlayUiState {
  return {
    lastNpcId: null,
    lastLineIndex: -1,
    revealedChars: 0,
    charTimer: 0,
    autoAdvance: false,
    autoWaitTimer: 0,
    showLog: false,
    history: [],
    autoBtnBounds: { x: 0, y: 0, w: 0, h: 0 },
    logBtnBounds: { x: 0, y: 0, w: 0, h: 0 },
    skipBtnBounds: { x: 0, y: 0, w: 0, h: 0 }
  };
}

export function stepDialogueOverlayUi(
  ui: DialogueOverlayUiState,
  npc: IslandNpcDefinition | null,
  lineIndex: number,
  dt: number
): { charRevealed: boolean; shouldAutoAdvance: boolean } {
  if (!npc) {
    ui.lastNpcId = null;
    ui.lastLineIndex = -1;
    ui.showLog = false;
    return { charRevealed: false, shouldAutoAdvance: false };
  }

  const line = npc.dialogueLines[lineIndex] ?? npc.dialogueLines[0] ?? '';
  if (ui.lastNpcId !== npc.npcId || ui.lastLineIndex !== lineIndex) {
    ui.lastNpcId = npc.npcId;
    ui.lastLineIndex = lineIndex;
    ui.revealedChars = 0;
    ui.charTimer = 0;
    ui.autoWaitTimer = 0;
    const prev = ui.history[ui.history.length - 1];
    if (!prev || prev.text !== line) {
      ui.history.push({ speaker: npc.name, text: line });
      if (ui.history.length > 30) ui.history.shift();
    }
  }

  if (ui.showLog) {
    return { charRevealed: false, shouldAutoAdvance: false };
  }

  let charRevealed = false;
  if (ui.revealedChars < line.length) {
    ui.charTimer += dt;
    if (ui.charTimer >= 0.028) {
      ui.charTimer = 0;
      ui.revealedChars += 1;
      charRevealed = true;
    }
    return { charRevealed, shouldAutoAdvance: false };
  }

  if (ui.autoAdvance) {
    ui.autoWaitTimer += dt;
    if (ui.autoWaitTimer >= 1.65) {
      ui.autoWaitTimer = 0;
      return { charRevealed: false, shouldAutoAdvance: true };
    }
  }
  return { charRevealed: false, shouldAutoAdvance: false };
}

function hitRect(
  pos: Vec2,
  r: { x: number; y: number; w: number; h: number }
): boolean {
  return pos.x >= r.x && pos.x <= r.x + r.w && pos.y >= r.y && pos.y <= r.y + r.h;
}

/**
 * Handles tap/click anywhere during Dialogue Cutscene:
 * - Control buttons ([자동 진행], [로그 보기], [건너뛰기])
 * - 1st tap completes typewriter immediately; 2nd tap advances to next line.
 */
export function handleDialogueOverlayTap(
  pos: Vec2,
  npc: IslandNpcDefinition,
  lineIndex: number,
  ui: DialogueOverlayUiState
): 'TOGGLED_AUTO' | 'TOGGLED_LOG' | 'SKIP_ALL' | 'COMPLETED_LINE' | 'ADVANCE' {
  if (hitRect(pos, ui.autoBtnBounds)) {
    ui.autoAdvance = !ui.autoAdvance;
    ui.autoWaitTimer = 0;
    return 'TOGGLED_AUTO';
  }
  if (hitRect(pos, ui.logBtnBounds)) {
    ui.showLog = !ui.showLog;
    return 'TOGGLED_LOG';
  }
  if (hitRect(pos, ui.skipBtnBounds)) {
    ui.showLog = false;
    return 'SKIP_ALL';
  }
  if (ui.showLog) {
    ui.showLog = false;
    return 'TOGGLED_LOG';
  }

  const line = npc.dialogueLines[lineIndex] ?? npc.dialogueLines[0] ?? '';
  if (ui.revealedChars < line.length) {
    ui.revealedChars = line.length;
    return 'COMPLETED_LINE';
  }
  return 'ADVANCE';
}

const PORTRAIT_UNIT_CANDIDATES = [
  'luffy', 'zoro', 'nami', 'usopp', 'sanji', 'chopper', 'robin',
  'franky', 'brook', 'jinbe', 'law', 'marco', 'lucci', 'kaku',
  'blueno', 'buggy', 'morgan', 'smoker', 'arlong', 'crocodile', 'enel',
  'doflamingo', 'katakuri', 'kaido', 'kizaru', 'saturn', 'loki', 'magellan'
] as const;

function guessPortraitUnitId(npc: IslandNpcDefinition): string | null {
  const id = npc.npcId.toLowerCase();
  for (let i = 0; i < PORTRAIT_UNIT_CANDIDATES.length; i++) {
    const cid = PORTRAIT_UNIT_CANDIDATES[i];
    if (cid && id.includes(cid)) return cid;
  }
  return null;
}

/**
 * Bandai RPG-Style Wide Bottom Dialogue & Choice Cutscene Overlay (Safe Area compliant)
 */
export function renderDialogueCutsceneOverlay(
  ctx: CanvasRenderingContext2D,
  npc: IslandNpcDefinition,
  lineIndex: number,
  viewport: ViewportMetrics = DEFAULT_VIEWPORT_METRICS,
  ui?: DialogueOverlayUiState,
  gameRegistry?: GameDataRegistry,
  assets?: AssetLoader
): void {
  const safe = getSafeHudBounds(viewport);
  const viewW = safe.viewWidth;

  ctx.save();

  const boxW = Math.min(820, safe.width - 24);
  const boxH = 148;
  const x = Math.round((viewW - boxW) * 0.5);
  const y = safe.bottom - boxH - 14;

  // Bandai console dialogue backdrop
  ctx.fillStyle = 'rgba(9, 13, 22, 0.95)';
  ctx.fillRect(x, y, boxW, boxH);
  ctx.strokeStyle = '#facc15';
  ctx.lineWidth = 2.5;
  ctx.strokeRect(x, y, boxW, boxH);

  // Speaker Nameplate floating on top-left border
  const nameTagW = Math.min(280, Math.max(170, (npc.name.length + npc.roleLabel.length) * 10 + 36));
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(x + 14, y - 16, nameTagW, 24);
  ctx.strokeStyle = '#facc15';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(x + 14, y - 16, nameTagW, 24);
  ctx.font = 'bold 12px monospace';
  ctx.textAlign = 'left';
  ctx.fillStyle = '#fde047';
  ctx.fillText(`${npc.name} [${npc.roleLabel}]`, x + 22, y + 1);

  // Control buttons on top-right border: [자동 진행] [로그 보기] [건너뛰기]
  const btnH = 22;
  const btnY = y - 15;
  const skipW = 74;
  const logW = 74;
  const autoW = 86;
  const skipX = x + boxW - skipW - 10;
  const logX = skipX - logW - 6;
  const autoX = logX - autoW - 6;

  if (ui) {
    ui.autoBtnBounds = { x: autoX, y: btnY, w: autoW, h: btnH };
    ui.logBtnBounds = { x: logX, y: btnY, w: logW, h: btnH };
    ui.skipBtnBounds = { x: skipX, y: btnY, w: skipW, h: btnH };
  }

  const drawCtrlBtn = (
    bx: number,
    bw: number,
    label: string,
    active: boolean,
    borderColor: string
  ) => {
    ctx.fillStyle = active ? '#0284c7' : 'rgba(15, 23, 42, 0.94)';
    ctx.fillRect(bx, btnY, bw, btnH);
    ctx.strokeStyle = borderColor;
    ctx.lineWidth = 1.2;
    ctx.strokeRect(bx, btnY, bw, btnH);
    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = active ? '#ffffff' : '#e2e8f0';
    ctx.fillText(label, bx + bw * 0.5, btnY + 15);
  };

  drawCtrlBtn(autoX, autoW, ui?.autoAdvance ? '자동: ON' : '자동 진행', Boolean(ui?.autoAdvance), '#38bdf8');
  drawCtrlBtn(logX, logW, '로그 보기', Boolean(ui?.showLog), '#94a3b8');
  drawCtrlBtn(skipX, skipW, '건너뛰기', false, '#f59e0b');

  // Enlarged Pixel Portrait Frame (84x84)
  const portX = x + 16;
  const portY = y + 20;
  const portSize = 84;
  ctx.fillStyle = '#162033';
  ctx.fillRect(portX, portY, portSize, portSize);
  ctx.strokeStyle = npc.color;
  ctx.lineWidth = 2;
  ctx.strokeRect(portX, portY, portSize, portSize);

  const matchedUnitId = guessPortraitUnitId(npc);
  const unitDef = matchedUnitId && gameRegistry ? gameRegistry.units[matchedUnitId] : null;
  if (matchedUnitId && assets) {
    const portrait = assets.getOrCreateUnitPortrait(
      matchedUnitId,
      matchedUnitId === 'luffy' ? 'excited' : 'normal'
    );
    if (portrait) {
      ctx.drawImage(
        portrait,
        0,
        0,
        64,
        64,
        portX + 4,
        portY + 4,
        portSize - 8,
        portSize - 8
      );
    } else if (unitDef) {
      const resolved = assets.getOrCreateUnitSpriteSheet(unitDef, null, null);
      if (resolved.sheet) {
        const fw = resolved.entry.frameWidth;
        const fh = resolved.entry.frameHeight;
        ctx.drawImage(
          resolved.sheet,
          0,
          0,
          fw,
          fh,
          portX + 4,
          portY + 4,
          portSize - 8,
          portSize - 8
        );
      }
    }
  } else {
    ctx.fillStyle = npc.color;
    ctx.fillRect(portX + 20, portY + 16, 44, 34);
    ctx.fillStyle = '#fde68a';
    ctx.fillRect(portX + 26, portY + 22, 32, 24);
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(portX + 32, portY + 30, 5, 5);
    ctx.fillRect(portX + 47, portY + 30, 5, 5);
    ctx.fillStyle = npc.color;
    ctx.fillRect(portX + 18, portY + 52, 48, 24);
  }

  // Dialogue text line (typewriter reveal)
  const fullLine = npc.dialogueLines[lineIndex] ?? npc.dialogueLines[0] ?? '';
  const visibleLine = ui ? fullLine.slice(0, ui.revealedChars) : fullLine;
  const textX = portX + portSize + 16;
  const textMaxW = boxW - (portSize + 48);
  const maxChars = Math.max(28, Math.floor(textMaxW / 12));

  ctx.font = 'bold 13px monospace';
  ctx.textAlign = 'left';
  ctx.fillStyle = '#f8fafc';
  const chunk1 = visibleLine.slice(0, maxChars);
  const chunk2 = visibleLine.slice(maxChars, maxChars * 2);
  const chunk3 = visibleLine.slice(maxChars * 2);
  ctx.fillText(chunk1, textX, y + 40);
  if (chunk2) ctx.fillText(chunk2, textX, y + 60);
  if (chunk3) ctx.fillText(chunk3, textX, y + 80);

  // Choice or Next prompt
  const isLastLine = lineIndex + 1 >= npc.dialogueLines.length;
  const doneTyping = !ui || ui.revealedChars >= fullLine.length;

  if (isLastLine && doneTyping && npc.choices && npc.choices.length > 0) {
    const ch = npc.choices[0];
    if (ch) {
      ctx.fillStyle = 'rgba(2, 132, 199, 0.35)';
      ctx.fillRect(textX, y + 96, boxW - (portSize + 44), 30);
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(textX, y + 96, boxW - (portSize + 44), 30);

      ctx.font = 'bold 11px monospace';
      ctx.fillStyle = '#7dd3fc';
      ctx.fillText(`▶ [터치 / E / Space 선택] ${ch.label}`, textX + 10, y + 115);
    }
  } else {
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'right';
    ctx.fillStyle = doneTyping ? '#38bdf8' : '#94a3b8';
    ctx.fillText(
      doneTyping
        ? `[터치 / Space] 다음 대화 (${lineIndex + 1}/${npc.dialogueLines.length}) ▶`
        : `[터치] 문장 즉시 완성`,
      x + boxW - 18,
      y + boxH - 14
    );
  }

  // Optional Dialogue History Log Modal Overlay
  if (ui?.showLog) {
    const lw = Math.min(640, safe.width - 40);
    const lh = Math.min(280, safe.height - 190);
    const lx = Math.round((viewW - lw) * 0.5);
    const ly = Math.max(16 + safe.top, y - lh - 24);
    ctx.fillStyle = 'rgba(9, 13, 22, 0.96)';
    ctx.fillRect(lx, ly, lw, lh);
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2;
    ctx.strokeRect(lx, ly, lw, lh);

    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#fde047';
    ctx.fillText('📜 대화 로그 (화면을 터치하면 닫힙니다)', lx + 12, ly + 22);

    const startIdx = Math.max(0, ui.history.length - 8);
    ctx.font = '11px monospace';
    for (let idx = startIdx; idx < ui.history.length; idx++) {
      const h = ui.history[idx];
      if (!h) continue;
      const ry = ly + 44 + (idx - startIdx) * 26;
      ctx.fillStyle = '#38bdf8';
      ctx.fillText(`[${h.speaker}]`, lx + 12, ry);
      ctx.fillStyle = '#e2e8f0';
      const clipped = h.text.length > 44 ? `${h.text.slice(0, 43)}…` : h.text;
      ctx.fillText(clipped, lx + 110, ry);
    }
  }

  ctx.restore();
}
