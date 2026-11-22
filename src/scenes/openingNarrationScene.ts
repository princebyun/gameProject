import type { Vec2 } from '../core/math/vector2';
import {
  DEFAULT_VIEWPORT_METRICS,
  type ViewportMetrics
} from '../render/viewport/responsiveViewportManager';
import { getSafeHudBounds } from '../render/viewport/safeAreaLayout';

export interface OpeningSlideDef {
  id: 'ROGER_SCAFFOLD' | 'GREAT_PIRATE_ERA' | 'STRAW_HAT_PROMISE' | 'CHAPTER_1_CARD';
  heading: string;
  speaker: string;
  subtitle: string;
  chapterCardTitle?: string;
  chapterCardSubtitle?: string;
}

export const OPENING_NARRATION_SLIDES: readonly OpeningSlideDef[] = [
  {
    id: 'ROGER_SCAFFOLD',
    heading: '로그타운 — 처형대의 비',
    speaker: '나레이션',
    subtitle:
      '부, 명성, 힘... 이 세상의 모든 것을 손에 넣은 남자, 해적왕 골 D. 로저.'
  },
  {
    id: 'GREAT_PIRATE_ERA',
    heading: '대해적 시대의 개막',
    speaker: '해적왕 골 D. 로저',
    subtitle:
      '"내 보물 말이냐? 원한다면 주지... 찾아봐라! 이 세상 전부를 거기에 두고 왔으니!"'
  },
  {
    id: 'STRAW_HAT_PROMISE',
    heading: '후샤 마을의 약속',
    speaker: '붉은 머리 샹크스',
    subtitle: '"언젠가 꼭 돌려주러 와라, 훌륭한 해적이 되어서!"'
  },
  {
    id: 'CHAPTER_1_CARD',
    heading: '출항의 아침',
    speaker: '몽키 D. 루피',
    subtitle: '"해적왕에, 나는 될 거야!" — 후샤 마을에서 위대한 항해가 시작된다.',
    chapterCardTitle: '제1장: 모험의 여명',
    chapterCardSubtitle: '이스트 블루, 후샤 마을'
  }
] as const;

export interface OpeningNarrationState {
  slideIndex: number;
  revealedChars: number;
  charTimer: number;
  slideElapsedSec: number;
  finished: boolean;
  skipButtonBounds: { x: number; y: number; w: number; h: number };
}

export function createOpeningNarrationState(): OpeningNarrationState {
  return {
    slideIndex: 0,
    revealedChars: 0,
    charTimer: 0,
    slideElapsedSec: 0,
    finished: false,
    skipButtonBounds: { x: 820, y: 14, w: 120, h: 30 }
  };
}

export function stepOpeningNarration(
  state: OpeningNarrationState,
  dt: number
): { charRevealed: boolean; bgmSwellTriggered: boolean } {
  if (state.finished) {
    return { charRevealed: false, bgmSwellTriggered: false };
  }
  const slide = OPENING_NARRATION_SLIDES[state.slideIndex];
  if (!slide) {
    state.finished = true;
    return { charRevealed: false, bgmSwellTriggered: false };
  }

  state.slideElapsedSec += dt;
  state.charTimer += dt;
  let charRevealed = false;

  if (state.revealedChars < slide.subtitle.length && state.charTimer >= 0.036) {
    state.charTimer = 0;
    state.revealedChars += 1;
    charRevealed = true;
  }

  return {
    charRevealed,
    bgmSwellTriggered: state.slideIndex === 1 && state.slideElapsedSec < 0.05
  };
}

/**
 * Tap anywhere:
 * - If Skip button tapped -> immediately finishes opening sequence.
 * - If current subtitle is still typing -> completes the full line immediately.
 * - Otherwise -> advances to the next slide (or finishes after Slide 4).
 */
export function advanceOpeningNarrationOnTap(
  state: OpeningNarrationState,
  tapPos?: Vec2
): 'SKIPPED' | 'COMPLETED_LINE' | 'NEXT_SLIDE' | 'FINISHED' {
  if (state.finished) return 'FINISHED';

  if (tapPos) {
    const sb = state.skipButtonBounds;
    if (
      tapPos.x >= sb.x &&
      tapPos.x <= sb.x + sb.w &&
      tapPos.y >= sb.y &&
      tapPos.y <= sb.y + sb.h
    ) {
      state.finished = true;
      return 'SKIPPED';
    }
  }

  const slide = OPENING_NARRATION_SLIDES[state.slideIndex];
  if (slide && state.revealedChars < slide.subtitle.length) {
    state.revealedChars = slide.subtitle.length;
    return 'COMPLETED_LINE';
  }

  if (state.slideIndex + 1 < OPENING_NARRATION_SLIDES.length) {
    state.slideIndex += 1;
    state.revealedChars = 0;
    state.charTimer = 0;
    state.slideElapsedSec = 0;
    return 'NEXT_SLIDE';
  }

  state.finished = true;
  return 'FINISHED';
}

export function skipOpeningNarration(state: OpeningNarrationState): void {
  state.finished = true;
}

export function renderOpeningNarrationScene(
  ctx: CanvasRenderingContext2D,
  state: OpeningNarrationState,
  tick: number,
  viewport: ViewportMetrics = DEFAULT_VIEWPORT_METRICS
): void {
  const safe = getSafeHudBounds(viewport);
  const w = safe.viewWidth;
  const h = safe.viewHeight;
  const cx = Math.round(safe.centerX);
  const slide =
    OPENING_NARRATION_SLIDES[state.slideIndex] ?? OPENING_NARRATION_SLIDES[0];
  if (!slide) return;

  ctx.save();

  // 1. Scene-specific Pixel Illustration Backdrop
  if (slide.id === 'ROGER_SCAFFOLD') {
    ctx.fillStyle = '#090d16';
    ctx.fillRect(0, 0, w, h);
    // Stormy sky & Loguetown scaffold silhouette
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(0, Math.round(h * 0.55), w, h);
    ctx.fillStyle = '#020617';
    ctx.fillRect(cx - 56, Math.round(h * 0.24), 112, 180);
    ctx.fillRect(cx - 72, Math.round(h * 0.24), 144, 14);
    // Roger silhouette kneeling in crimson coat
    ctx.fillStyle = '#991b1b';
    ctx.fillRect(cx - 18, Math.round(h * 0.16), 36, 44);
    ctx.fillStyle = '#facc15';
    ctx.fillRect(cx - 14, Math.round(h * 0.18), 28, 6);
    // Falling rain pixels
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.35)';
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 42; i++) {
      const rx = (i * 67 + tick * 7) % w;
      const ry = (i * 43 + tick * 15) % h;
      ctx.beginPath();
      ctx.moveTo(rx, ry);
      ctx.lineTo(rx - 5, ry + 16);
      ctx.stroke();
    }
  } else if (slide.id === 'GREAT_PIRATE_ERA') {
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#451a03');
    grad.addColorStop(0.52, '#b45309');
    grad.addColorStop(0.55, '#0c4a6e');
    grad.addColorStop(1, '#082f49');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // Pirate ship silhouettes sailing across golden waves
    for (let i = 0; i < 5; i++) {
      const sx = Math.round(
        ((i * 220 + tick * (0.8 + i * 0.12)) % (w + 120)) - 60
      );
      const sy = Math.round(h * 0.48 + (i % 2) * 18 + Math.sin(tick * 0.1 + i) * 4);
      ctx.fillStyle = '#090d16';
      ctx.fillRect(sx, sy + 18, 48, 14);
      ctx.fillRect(sx + 20, sy - 18, 4, 36);
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(sx + 8, sy - 14, 28, 22);
    }
  } else if (slide.id === 'STRAW_HAT_PROMISE') {
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#7c2d12');
    grad.addColorStop(0.6, '#ea580c');
    grad.addColorStop(1, '#1e293b');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    // Warm sunset glow + iconic pixel Straw Hat emblem
    ctx.fillStyle = 'rgba(254, 240, 138, 0.32)';
    ctx.beginPath();
    ctx.arc(cx, Math.round(h * 0.38), 96, 0, Math.PI * 2);
    ctx.fill();

    // Enlarged Pixel Straw Hat
    const hy = Math.round(h * 0.36 + Math.sin(tick * 0.06) * 4);
    ctx.fillStyle = '#facc15';
    ctx.fillRect(cx - 72, hy + 14, 144, 16);
    ctx.fillRect(cx - 42, hy - 22, 84, 36);
    ctx.fillStyle = '#dc2626';
    ctx.fillRect(cx - 42, hy + 2, 84, 12);
    ctx.strokeStyle = '#78350f';
    ctx.lineWidth = 3;
    ctx.strokeRect(cx - 72, hy + 14, 144, 16);
  } else {
    // Scene 4: Chapter 1 Title Card (fade-in dawn)
    const fade = Math.min(1, state.slideElapsedSec / 0.8);
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#0f172a');
    grad.addColorStop(0.6, '#1e3a8a');
    grad.addColorStop(1, '#0284c7');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    ctx.globalAlpha = fade;
    const cardW = Math.min(620, safe.width - 48);
    const cardX = Math.round(cx - cardW * 0.5);
    const cardY = Math.round(h * 0.22);
    ctx.fillStyle = 'rgba(9, 13, 22, 0.84)';
    ctx.fillRect(cardX, cardY, cardW, 134);
    ctx.strokeStyle = '#facc15';
    ctx.lineWidth = 3;
    ctx.strokeRect(cardX, cardY, cardW, 134);

    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#38bdf8';
    ctx.fillText('━━━ CHAPTER 1 ━━━', cx, cardY + 28);

    ctx.font = 'bold 28px monospace';
    ctx.fillStyle = '#fde047';
    ctx.fillText(slide.chapterCardTitle ?? '제1장: 모험의 여명', cx, cardY + 72);

    ctx.font = 'bold 15px monospace';
    ctx.fillStyle = '#f8fafc';
    ctx.fillText(
      slide.chapterCardSubtitle ?? '이스트 블루, 후샤 마을',
      cx,
      cardY + 108
    );
    ctx.globalAlpha = 1;
  }

  // 2. Top-Left Slide Header & Progress Dots (Safe Area)
  ctx.font = 'bold 12px monospace';
  ctx.textAlign = 'left';
  ctx.fillStyle = '#fde047';
  ctx.fillText(
    `SCENE ${state.slideIndex + 1}/${OPENING_NARRATION_SLIDES.length} · ${slide.heading}`,
    16 + safe.left,
    28 + safe.top
  );

  // 3. Top-Right [건너뛰기 >>] Button (Safe Area)
  const skipW = 124;
  const skipH = 30;
  const skipX = safe.right - skipW - 16;
  const skipY = 12 + safe.top;
  state.skipButtonBounds = { x: skipX, y: skipY, w: skipW, h: skipH };

  ctx.fillStyle = 'rgba(15, 23, 42, 0.86)';
  ctx.fillRect(skipX, skipY, skipW, skipH);
  ctx.strokeStyle = '#facc15';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(skipX, skipY, skipW, skipH);
  ctx.font = 'bold 12px monospace';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#fef08a';
  ctx.fillText('건너뛰기 >>', skipX + skipW * 0.5, skipY + 19);

  // 4. Bandai-style Wide Bottom Typewriter Subtitle Box (Safe Area)
  const boxW = Math.min(820, safe.width - 32);
  const boxH = 114;
  const boxX = Math.round(cx - boxW * 0.5);
  const boxY = safe.bottom - boxH - 16;

  ctx.fillStyle = 'rgba(9, 13, 22, 0.92)';
  ctx.fillRect(boxX, boxY, boxW, boxH);
  ctx.strokeStyle = '#facc15';
  ctx.lineWidth = 2;
  ctx.strokeRect(boxX, boxY, boxW, boxH);

  // Speaker Nameplate
  ctx.fillStyle = '#b45309';
  ctx.fillRect(boxX + 14, boxY - 14, 180, 24);
  ctx.strokeStyle = '#fde047';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(boxX + 14, boxY - 14, 180, 24);
  ctx.font = 'bold 12px monospace';
  ctx.textAlign = 'left';
  ctx.fillStyle = '#fef08a';
  ctx.fillText(slide.speaker, boxX + 24, boxY + 2);

  // Typewriter revealed text
  const visibleText = slide.subtitle.slice(0, state.revealedChars);
  ctx.font = 'bold 15px monospace';
  ctx.fillStyle = '#f8fafc';
  const maxCharsPerLine = Math.max(30, Math.floor((boxW - 44) / 14));
  const line1 = visibleText.slice(0, maxCharsPerLine);
  const line2 = visibleText.slice(maxCharsPerLine);
  ctx.fillText(line1, boxX + 22, boxY + 42);
  if (line2) {
    ctx.fillText(line2, boxX + 22, boxY + 66);
  }

  // Next / Tap prompt
  const doneTyping = state.revealedChars >= slide.subtitle.length;
  ctx.font = 'bold 11px monospace';
  ctx.textAlign = 'right';
  ctx.fillStyle = doneTyping ? '#38bdf8' : '#94a3b8';
  ctx.fillText(
    doneTyping
      ? state.slideIndex + 1 >= OPENING_NARRATION_SLIDES.length
        ? '▶ [터치 / Space] 후샤 마을에서 모험 시작!'
        : '▶ [터치 / Space] 다음 장면으로'
      : '▶ [터치] 문장 즉시 표시',
    boxX + boxW - 18,
    boxY + boxH - 14
  );

  ctx.restore();
}
