import type { AssetLoader } from '../../assets/assetLoader';
import type { Vec2 } from '../../core/math/vector2';
import {
  DIALOGUE_EMOTION_META,
  evaluateLineDirectives,
  type DialogueDirective,
  type DialogueLineNode,
  type DialogueScript,
  type DirectiveAccessibilityConfig,
  type NpcSpeakerProfile
} from '../../core/rpg/scriptSchema';
import type { GameDataRegistry } from '../../core/types/dataSchemas';
import { drawPixelNineSlicePanel } from '../ui/pixelNineSliceUi';
import {
  DEFAULT_VIEWPORT_METRICS,
  type ViewportMetrics
} from '../viewport/responsiveViewportManager';

export interface ActiveChapterCardState {
  chapterNum: string;
  title: string;
  subtitle: string;
  elapsedSec: number;
  durationSec: number;
}

export interface CutsceneDirectiveCallbacks {
  onBgm?: (trackId: string, fadeSec?: number) => void;
  onSfx?: (sfxId: string) => void;
  onRecruitmentBanner?: (
    unitId: string,
    roleName: string,
    passiveSummary: string
  ) => void;
  onWantedPoster?: (bounty: number, title: string) => void;
  onComplete?: (script: DialogueScript) => void;
}

export interface DialogueScriptPlayerState {
  script: DialogueScript;
  lineIndex: number;
  revealedChars: number;
  charTimer: number;
  autoAdvance: boolean;
  autoWaitTimer: number;
  showLog: boolean;
  history: { speaker: string; text: string }[];
  finished: boolean;

  // Active dual portrait memory (Bandai RPG left/right speaker dimming)
  leftSpeaker: { speakerId: string; speakerName: string; emotion: DialogueLineNode['emotion'] } | null;
  rightSpeaker: { speakerId: string; speakerName: string; emotion: DialogueLineNode['emotion'] } | null;

  // Active DSL visual effects
  shakeTimer: number;
  shakeDuration: number;
  shakeIntensity: number;
  flashTimer: number;
  flashDuration: number;
  flashColor: string;
  chapterCard: ActiveChapterCardState | null;

  // Control button hitboxes (updated every render)
  autoBtnBounds: { x: number; y: number; w: number; h: number };
  logBtnBounds: { x: number; y: number; w: number; h: number };
  skipBtnBounds: { x: number; y: number; w: number; h: number };

  executedLineIndices: Set<number>;
}

function hitRect(
  pos: Vec2,
  r: { x: number; y: number; w: number; h: number }
): boolean {
  return pos.x >= r.x && pos.x <= r.x + r.w && pos.y >= r.y && pos.y <= r.y + r.h;
}

export function createDialogueScriptPlayer(
  script: DialogueScript,
  accessibility: DirectiveAccessibilityConfig,
  callbacks: CutsceneDirectiveCallbacks = {}
): DialogueScriptPlayerState {
  const state: DialogueScriptPlayerState = {
    script,
    lineIndex: 0,
    revealedChars: 0,
    charTimer: 0,
    autoAdvance: false,
    autoWaitTimer: 0,
    showLog: false,
    history: [],
    finished: script.lines.length === 0,
    leftSpeaker: null,
    rightSpeaker: null,
    shakeTimer: 0,
    shakeDuration: 0,
    shakeIntensity: 0,
    flashTimer: 0,
    flashDuration: 0,
    flashColor: '#ffffff',
    chapterCard: null,
    autoBtnBounds: { x: 0, y: 0, w: 0, h: 0 },
    logBtnBounds: { x: 0, y: 0, w: 0, h: 0 },
    skipBtnBounds: { x: 0, y: 0, w: 0, h: 0 },
    executedLineIndices: new Set<number>()
  };

  if (!state.finished) {
    enterLine(state, 0, accessibility, callbacks);
  }
  return state;
}

function enterLine(
  state: DialogueScriptPlayerState,
  index: number,
  accessibility: DirectiveAccessibilityConfig,
  callbacks: CutsceneDirectiveCallbacks
): void {
  const line = state.script.lines[index];
  if (!line) {
    state.finished = true;
    callbacks.onComplete?.(state.script);
    return;
  }

  state.lineIndex = index;
  state.revealedChars = 0;
  state.charTimer = 0;
  state.autoWaitTimer = 0;

  // Track left / right dual portraits
  if (line.side === 'left') {
    state.leftSpeaker = {
      speakerId: line.speakerId,
      speakerName: line.speakerName,
      emotion: line.emotion
    };
  } else if (line.side === 'right') {
    state.rightSpeaker = {
      speakerId: line.speakerId,
      speakerName: line.speakerName,
      emotion: line.emotion
    };
  }

  const prevHist = state.history[state.history.length - 1];
  if (!prevHist || prevHist.text !== line.text || prevHist.speaker !== line.speakerName) {
    state.history.push({ speaker: line.speakerName, text: line.text });
    if (state.history.length > 40) state.history.shift();
  }

  if (state.executedLineIndices.has(index)) return;
  state.executedLineIndices.add(index);

  const evaluated = evaluateLineDirectives(line, accessibility);
  for (const cmd of evaluated) {
    if (cmd.suppressedByAccessibility) continue;
    applyDirective(state, cmd.directive, cmd.effectiveShakeIntensity, callbacks);
  }
}

function applyDirective(
  state: DialogueScriptPlayerState,
  directive: DialogueDirective,
  effectiveShakeIntensity: number | undefined,
  callbacks: CutsceneDirectiveCallbacks
): void {
  switch (directive.type) {
    case 'bgm':
      callbacks.onBgm?.(directive.trackId, directive.fadeSec);
      break;
    case 'sfx':
      callbacks.onSfx?.(directive.sfxId);
      break;
    case 'cameraShake':
      state.shakeIntensity = effectiveShakeIntensity ?? directive.intensity;
      state.shakeDuration = Math.max(0.05, directive.durationSec);
      state.shakeTimer = state.shakeDuration;
      break;
    case 'screenFlash':
      state.flashColor = directive.color;
      state.flashDuration = Math.max(0.05, directive.durationSec);
      state.flashTimer = state.flashDuration;
      break;
    case 'chapterCard':
      state.chapterCard = {
        chapterNum: directive.chapterNum,
        title: directive.title,
        subtitle: directive.subtitle,
        elapsedSec: 0,
        durationSec: 2.1
      };
      break;
    case 'recruitmentBanner':
      callbacks.onRecruitmentBanner?.(
        directive.unitId,
        directive.roleName,
        directive.passiveSummary
      );
      break;
    case 'wantedPoster':
      callbacks.onWantedPoster?.(directive.bounty, directive.title);
      break;
  }
}

export function stepDialogueScriptPlayer(
  state: DialogueScriptPlayerState,
  dt: number,
  accessibility: DirectiveAccessibilityConfig,
  callbacks: CutsceneDirectiveCallbacks = {}
): { charRevealed: boolean; finishedNow: boolean } {
  if (state.finished) return { charRevealed: false, finishedNow: false };

  if (state.shakeTimer > 0) {
    state.shakeTimer = Math.max(0, state.shakeTimer - dt);
  }
  if (state.flashTimer > 0) {
    state.flashTimer = Math.max(0, state.flashTimer - dt);
  }

  if (state.chapterCard) {
    state.chapterCard.elapsedSec += dt;
    if (state.chapterCard.elapsedSec >= state.chapterCard.durationSec) {
      state.chapterCard = null;
    }
    return { charRevealed: false, finishedNow: false };
  }

  if (state.showLog) {
    return { charRevealed: false, finishedNow: false };
  }

  const line = state.script.lines[state.lineIndex];
  if (!line) {
    state.finished = true;
    callbacks.onComplete?.(state.script);
    return { charRevealed: false, finishedNow: true };
  }

  if (state.revealedChars < line.text.length) {
    state.charTimer += dt;
    if (state.charTimer >= 0.024) {
      state.charTimer = 0;
      state.revealedChars += 1;
      return { charRevealed: true, finishedNow: false };
    }
    return { charRevealed: false, finishedNow: false };
  }

  if (state.autoAdvance) {
    state.autoWaitTimer += dt;
    if (state.autoWaitTimer >= 1.55) {
      state.autoWaitTimer = 0;
      const finishedNow = advanceDialogueScriptLine(state, accessibility, callbacks);
      return { charRevealed: false, finishedNow };
    }
  }

  return { charRevealed: false, finishedNow: false };
}

export function advanceDialogueScriptLine(
  state: DialogueScriptPlayerState,
  accessibility: DirectiveAccessibilityConfig,
  callbacks: CutsceneDirectiveCallbacks = {}
): boolean {
  if (state.finished) return true;
  if (state.lineIndex + 1 < state.script.lines.length) {
    enterLine(state, state.lineIndex + 1, accessibility, callbacks);
    return false;
  }
  state.finished = true;
  callbacks.onComplete?.(state.script);
  return true;
}

/**
 * Skips the cutscene cleanly while still firing critical reward/recruitment directives
 * on remaining lines (such as recruitmentBanner / wantedPoster) so story beats are never lost.
 */
export function skipDialogueScriptPlayer(
  state: DialogueScriptPlayerState,
  accessibility: DirectiveAccessibilityConfig,
  callbacks: CutsceneDirectiveCallbacks = {}
): void {
  if (state.finished) return;
  state.showLog = false;
  state.chapterCard = null;

  for (let i = state.lineIndex; i < state.script.lines.length; i++) {
    if (state.executedLineIndices.has(i)) continue;
    state.executedLineIndices.add(i);
    const line = state.script.lines[i];
    const evaluated = evaluateLineDirectives(line, accessibility);
    for (const cmd of evaluated) {
      if (cmd.suppressedByAccessibility) continue;
      if (
        cmd.directive.type === 'recruitmentBanner' ||
        cmd.directive.type === 'wantedPoster'
      ) {
        applyDirective(state, cmd.directive, cmd.effectiveShakeIntensity, callbacks);
      }
    }
  }

  state.finished = true;
  callbacks.onComplete?.(state.script);
}

export function handleDialogueScriptTap(
  pos: Vec2 | null,
  state: DialogueScriptPlayerState,
  accessibility: DirectiveAccessibilityConfig,
  callbacks: CutsceneDirectiveCallbacks = {}
):
  | 'TOGGLED_AUTO'
  | 'TOGGLED_LOG'
  | 'SKIPPED'
  | 'DISMISSED_CARD'
  | 'COMPLETED_LINE'
  | 'ADVANCED'
  | 'FINISHED' {
  if (state.finished) return 'FINISHED';

  if (pos) {
    if (hitRect(pos, state.autoBtnBounds)) {
      state.autoAdvance = !state.autoAdvance;
      state.autoWaitTimer = 0;
      return 'TOGGLED_AUTO';
    }
    if (hitRect(pos, state.logBtnBounds)) {
      state.showLog = !state.showLog;
      return 'TOGGLED_LOG';
    }
    if (hitRect(pos, state.skipBtnBounds)) {
      skipDialogueScriptPlayer(state, accessibility, callbacks);
      return 'SKIPPED';
    }
  }

  if (state.showLog) {
    state.showLog = false;
    return 'TOGGLED_LOG';
  }

  if (state.chapterCard) {
    state.chapterCard = null;
    return 'DISMISSED_CARD';
  }

  const line = state.script.lines[state.lineIndex];
  if (line && state.revealedChars < line.text.length) {
    state.revealedChars = line.text.length;
    return 'COMPLETED_LINE';
  }

  const done = advanceDialogueScriptLine(state, accessibility, callbacks);
  return done ? 'FINISHED' : 'ADVANCED';
}

function wrapKoreanDialogueLines(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidthPx: number,
  maxLines: number = 3
): string[] {
  if (!text) return [''];
  const lines: string[] = [];
  let cursor = 0;

  while (cursor < text.length && lines.length < maxLines) {
    let end = cursor;
    let lastSpace = -1;
    while (end < text.length) {
      const slice = text.slice(cursor, end + 1);
      if (ctx.measureText(slice).width > maxWidthPx) {
        break;
      }
      if (text[end] === ' ') lastSpace = end;
      end += 1;
    }

    if (end >= text.length) {
      lines.push(text.slice(cursor).trim());
      break;
    }

    if (lines.length === maxLines - 1) {
      lines.push(text.slice(cursor, end).trim());
      break;
    }

    if (lastSpace > cursor + Math.floor((end - cursor) * 0.55)) {
      lines.push(text.slice(cursor, lastSpace).trim());
      cursor = lastSpace + 1;
    } else {
      lines.push(text.slice(cursor, Math.max(cursor + 1, end)).trim());
      cursor = Math.max(cursor + 1, end);
    }
  }

  return lines;
}

function drawSpeakerPortrait(
  ctx: CanvasRenderingContext2D,
  speakerId: string,
  emotion: DialogueLineNode['emotion'],
  x: number,
  y: number,
  size: number,
  isActive: boolean,
  flipHorizontal: boolean,
  gameRegistry: GameDataRegistry,
  assets: AssetLoader,
  npcCatalog?: Record<string, NpcSpeakerProfile>
): void {
  const emotionMeta = DIALOGUE_EMOTION_META[emotion] ?? DIALOGUE_EMOTION_META.normal;
  const npcProfile = npcCatalog?.[speakerId];

  ctx.save();
  ctx.globalAlpha = isActive ? 1.0 : 0.45;
  ctx.imageSmoothingEnabled = false;

  // Frame background
  ctx.fillStyle = isActive ? '#162033' : '#0b1120';
  ctx.fillRect(x, y, size, size);
  ctx.strokeStyle = isActive ? emotionMeta.borderColor : '#475569';
  ctx.lineWidth = isActive ? 2.5 : 1.5;
  ctx.strokeRect(x, y, size, size);

  const unitDef = gameRegistry.units[speakerId];
  if (unitDef) {
    const portrait = assets.getOrCreateUnitPortrait(unitDef, emotion, null);
    if (portrait.image) {
      ctx.save();
      if (flipHorizontal) {
        ctx.translate(x + size, y);
        ctx.scale(-1, 1);
        ctx.drawImage(portrait.image, 3, 3, size - 6, size - 6);
      } else {
        ctx.drawImage(portrait.image, x + 3, y + 3, size - 6, size - 6);
      }
      ctx.restore();
    }
  } else {
    const accent = npcProfile?.accentColor ?? '#38bdf8';
    ctx.fillStyle = accent;
    ctx.fillRect(x + Math.round(size * 0.24), y + Math.round(size * 0.16), Math.round(size * 0.52), Math.round(size * 0.4));
    ctx.fillStyle = '#fde68a';
    ctx.fillRect(x + Math.round(size * 0.3), y + Math.round(size * 0.24), Math.round(size * 0.4), Math.round(size * 0.3));
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(x + Math.round(size * 0.37), y + Math.round(size * 0.34), 5, 5);
    ctx.fillRect(x + Math.round(size * 0.57), y + Math.round(size * 0.34), 5, 5);
    ctx.fillStyle = accent;
    ctx.fillRect(x + Math.round(size * 0.2), y + Math.round(size * 0.62), Math.round(size * 0.6), Math.round(size * 0.28));
  }

  // Emotion icon badge on top-right corner of active portrait
  if (isActive && emotionMeta.icon) {
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(x + size - 22, y + 2, 20, 20);
    ctx.strokeStyle = emotionMeta.borderColor;
    ctx.lineWidth = 1.2;
    ctx.strokeRect(x + size - 22, y + 2, 20, 20);
    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(emotionMeta.icon, x + size - 12, y + 16);
  }

  ctx.restore();
}

/**
 * Renders the Bandai-RPG DSL Cutscene Overlay with:
 * - Left / Right dual portrait highlight & non-speaker dimming
 * - Center cinematic narration mode
 * - Emotion frame tone & icon badge
 * - Camera shake & accessibility-gated screen flash
 * - Chapter title card
 * - [자동 진행], [로그 보기], [건너뛰기] controls
 */
export function renderDialogueScriptOverlay(
  ctx: CanvasRenderingContext2D,
  state: DialogueScriptPlayerState,
  gameRegistry: GameDataRegistry,
  assets: AssetLoader,
  tick: number,
  viewport: ViewportMetrics = DEFAULT_VIEWPORT_METRICS,
  npcCatalog?: Record<string, NpcSpeakerProfile>
): void {
  if (state.finished) return;

  const viewW = viewport.viewWidth;
  const viewH = viewport.viewHeight;
  const { left: safeL, right: safeR, top: safeT, bottom: safeB } = viewport.safeInsets;

  ctx.save();
  ctx.imageSmoothingEnabled = false;

  // Apply DSL camera shake offset
  if (state.shakeTimer > 0 && state.shakeIntensity > 0) {
    const decay = state.shakeTimer / Math.max(0.05, state.shakeDuration);
    const amp = state.shakeIntensity * 8 * decay;
    const ox = Math.round(Math.sin(tick * 1.9) * amp);
    const oy = Math.round(Math.cos(tick * 2.3) * amp * 0.7);
    ctx.translate(ox, oy);
  }

  // Chapter Card full-screen cinematic beat
  if (state.chapterCard) {
    const cc = state.chapterCard;
    const fadeIn = Math.min(1, cc.elapsedSec / 0.3);
    const fadeOut = Math.min(1, Math.max(0, (cc.durationSec - cc.elapsedSec) / 0.35));
    const a = Math.min(fadeIn, fadeOut);

    ctx.fillStyle = `rgba(5, 8, 16, ${0.88 * a})`;
    ctx.fillRect(0, 0, viewW, viewH);

    ctx.globalAlpha = a;
    ctx.fillStyle = '#facc15';
    ctx.fillRect(Math.round(viewW * 0.18), Math.round(viewH * 0.5 - 52), Math.round(viewW * 0.64), 2);
    ctx.fillRect(Math.round(viewW * 0.18), Math.round(viewH * 0.5 + 52), Math.round(viewW * 0.64), 2);

    ctx.textAlign = 'center';
    ctx.font = 'bold 13px monospace';
    ctx.fillStyle = '#38bdf8';
    ctx.fillText(cc.chapterNum, viewW * 0.5, viewH * 0.5 - 24);

    ctx.font = 'bold 24px monospace';
    ctx.fillStyle = '#fde047';
    ctx.fillText(cc.title, viewW * 0.5, viewH * 0.5 + 8);

    ctx.font = 'bold 12px monospace';
    ctx.fillStyle = '#e2e8f0';
    ctx.fillText(cc.subtitle, viewW * 0.5, viewH * 0.5 + 34);

    ctx.font = '10px monospace';
    ctx.fillStyle = '#94a3b8';
    ctx.fillText('[화면 터치 / Space로 계속]', viewW * 0.5, viewH - safeB - 20);
    ctx.restore();
    return;
  }

  const line = state.script.lines[state.lineIndex];
  if (!line) {
    ctx.restore();
    return;
  }

  const emotionMeta = DIALOGUE_EMOTION_META[line.emotion] ?? DIALOGUE_EMOTION_META.normal;
  const isNarration = line.side === 'center_narration';

  // Subtle bottom cinematic scrim
  const scrimH = 190 + safeB;
  const scrimGrad = ctx.createLinearGradient(0, viewH - scrimH, 0, viewH);
  scrimGrad.addColorStop(0, 'rgba(5, 9, 18, 0)');
  scrimGrad.addColorStop(1, 'rgba(5, 9, 18, 0.72)');
  ctx.fillStyle = scrimGrad;
  ctx.fillRect(0, viewH - scrimH, viewW, scrimH);

  const boxW = Math.min(820, viewW - safeL - safeR - 20);
  const boxH = 136;
  const x = Math.round((viewW - boxW) * 0.5);
  const y = viewH - safeB - boxH - 10;

  // Dual standing portraits floating cleanly above/beside the dialogue box (when not narration)
  const hasLeftPortrait = !isNarration && state.leftSpeaker !== null;
  const hasRightPortrait = !isNarration && state.rightSpeaker !== null;
  const portSize = viewH <= 440 ? 74 : 84;

  // Authentic 9-Slice Pirate-Wood / Marine Dialogue Box Frame
  drawPixelNineSlicePanel(
    ctx,
    x,
    y,
    boxW,
    boxH,
    isNarration ? 'navy_hud' : 'pirate_wood',
    isNarration ? '#38bdf8' : emotionMeta.borderColor
  );

  // Speaker Nameplate floating on top border (left, right, or center for narration)
  const speakerLabel =
    !isNarration && emotionMeta.icon
      ? `${emotionMeta.icon} ${line.speakerName}`
      : line.speakerName;
  ctx.font = 'bold 12px monospace';
  const measuredNameW = Math.ceil(ctx.measureText(speakerLabel).width) + 28;
  const nameTagW = Math.min(340, Math.max(150, measuredNameW));
  const nameTagX =
    line.side === 'center_narration'
      ? Math.round(x + (boxW - nameTagW) * 0.5)
      : x + 14;

  ctx.fillStyle = '#0f172a';
  ctx.fillRect(nameTagX, y - 16, nameTagW, 24);
  ctx.strokeStyle = isNarration ? '#38bdf8' : emotionMeta.borderColor;
  ctx.lineWidth = 1.6;
  ctx.strokeRect(nameTagX, y - 16, nameTagW, 24);
  ctx.textAlign = isNarration ? 'center' : 'left';
  ctx.fillStyle = isNarration ? '#7dd3fc' : '#fde047';
  ctx.fillText(
    speakerLabel,
    isNarration ? nameTagX + nameTagW * 0.5 : nameTagX + 12,
    y + 1
  );

  // Top-right Control buttons: [자동 진행] [로그 보기] [건너뛰기]
  const btnH = 22;
  const btnY = y - 15;
  const skipW = 70;
  const logW = 70;
  const autoW = 82;
  const skipX = x + boxW - skipW - 8;
  const logX = skipX - logW - 5;
  const autoX = logX - autoW - 5;

  state.autoBtnBounds = { x: autoX, y: btnY, w: autoW, h: btnH };
  state.logBtnBounds = { x: logX, y: btnY, w: logW, h: btnH };
  state.skipBtnBounds = { x: skipX, y: btnY, w: skipW, h: btnH };

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

  drawCtrlBtn(
    autoX,
    autoW,
    state.autoAdvance ? '자동: ON' : '자동 진행',
    state.autoAdvance,
    '#38bdf8'
  );
  drawCtrlBtn(logX, logW, '로그 보기', state.showLog, '#94a3b8');
  drawCtrlBtn(skipX, skipW, '건너뛰기', false, '#f59e0b');

  // Render Left & Right Portraits inside the box edges (never overlapping text)
  const portY = y + Math.round((boxH - portSize) * 0.5) + 4;
  if (hasLeftPortrait && state.leftSpeaker) {
    drawSpeakerPortrait(
      ctx,
      state.leftSpeaker.speakerId,
      state.leftSpeaker.emotion,
      x + 14,
      portY,
      portSize,
      line.side === 'left',
      false,
      gameRegistry,
      assets,
      npcCatalog
    );
  }
  if (hasRightPortrait && state.rightSpeaker) {
    drawSpeakerPortrait(
      ctx,
      state.rightSpeaker.speakerId,
      state.rightSpeaker.emotion,
      x + boxW - portSize - 14,
      portY,
      portSize,
      line.side === 'right',
      true,
      gameRegistry,
      assets,
      npcCatalog
    );
  }

  // Compute safe inner text region between portraits
  const leftPad = hasLeftPortrait ? portSize + 28 : 22;
  const rightPad = hasRightPortrait ? portSize + 28 : 22;
  const textX = x + leftPad;
  const textMaxW = Math.max(220, boxW - leftPad - rightPad);

  const visibleText = line.text.slice(0, state.revealedChars);
  ctx.font = isNarration ? 'bold 13px monospace' : 'bold 13px monospace';
  ctx.fillStyle = isNarration ? '#e0f2fe' : '#f8fafc';
  ctx.textAlign = isNarration ? 'center' : 'left';

  const wrappedLines = wrapKoreanDialogueLines(ctx, visibleText, textMaxW, 3);
  const drawAnchorX = isNarration ? x + boxW * 0.5 : textX;
  const baseLineY = wrappedLines.length === 1 ? y + 58 : y + 44;
  wrappedLines.forEach((wl, idx) => {
    ctx.fillText(wl, drawAnchorX, baseLineY + idx * 23);
  });

  // Footer progress & prompt
  const doneTyping = state.revealedChars >= line.text.length;
  ctx.font = 'bold 10px monospace';
  ctx.textAlign = 'right';
  ctx.fillStyle = doneTyping ? '#38bdf8' : '#94a3b8';
  const promptText = doneTyping
    ? `[터치 / Space] 계속 (${state.lineIndex + 1}/${state.script.lines.length}) ▶`
    : `[터치] 문장 즉시 완성`;
  ctx.fillText(promptText, x + boxW - (hasRightPortrait ? portSize + 24 : 16), y + boxH - 12);

  // Script title badge bottom-left (when narration)
  ctx.textAlign = 'left';
  ctx.fillStyle = '#64748b';
  ctx.fillText(
    state.script.title,
    x + (hasLeftPortrait ? portSize + 28 : 16),
    y + boxH - 12
  );

  // Dialogue History Log Modal
  if (state.showLog) {
    const lw = Math.min(640, viewW - safeL - safeR - 36);
    const lh = Math.min(240, viewH - safeT - safeB - boxH - 36);
    const lx = Math.round((viewW - lw) * 0.5);
    const ly = Math.max(12 + safeT, y - lh - 20);
    ctx.fillStyle = 'rgba(9, 13, 22, 0.97)';
    ctx.fillRect(lx, ly, lw, lh);
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2;
    ctx.strokeRect(lx, ly, lw, lh);

    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#fde047';
    ctx.fillText('📜 대화 로그 (화면을 터치하면 닫힙니다)', lx + 12, ly + 20);

    const maxRows = Math.max(4, Math.floor((lh - 34) / 24));
    const recent = state.history.slice(-maxRows);
    ctx.font = '11px monospace';
    recent.forEach((h, idx) => {
      const ry = ly + 42 + idx * 24;
      ctx.fillStyle = '#38bdf8';
      const spk = h.speaker.length > 14 ? `${h.speaker.slice(0, 13)}…` : h.speaker;
      ctx.fillText(`[${spk}]`, lx + 12, ry);
      ctx.fillStyle = '#e2e8f0';
      const maxMsgChars = Math.max(24, Math.floor((lw - 148) / 10));
      const clipped = h.text.length > maxMsgChars ? `${h.text.slice(0, maxMsgChars - 1)}…` : h.text;
      ctx.fillText(clipped, lx + 132, ry);
    });
  }

  // Accessibility-gated Screen Flash overlay
  if (state.flashTimer > 0 && state.flashDuration > 0) {
    const ratio = state.flashTimer / state.flashDuration;
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(0.65, ratio * 0.65));
    ctx.fillStyle = state.flashColor;
    ctx.fillRect(-20, -20, viewW + 40, viewH + 40);
    ctx.restore();
  }

  ctx.restore();
}
