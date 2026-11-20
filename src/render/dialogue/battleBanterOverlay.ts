import type { AssetLoader } from '../../assets/assetLoader';
import type { ActiveBanterItem } from '../../core/rpg/battleBanterEngine';
import { DIALOGUE_EMOTION_META } from '../../core/rpg/scriptSchema';
import type { GameDataRegistry } from '../../core/types/dataSchemas';
import { drawPixelNineSlicePanel } from '../ui/pixelNineSliceUi';
import {
  DEFAULT_VIEWPORT_METRICS,
  type ViewportMetrics
} from '../viewport/responsiveViewportManager';

/**
 * Wraps Korean dialogue text cleanly into at most 2 lines within maxWidthPx.
 */
export function wrapCompactBanterText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidthPx: number
): [string, string] {
  if (ctx.measureText(text).width <= maxWidthPx) {
    return [text, ''];
  }

  let line1 = '';
  let splitIdx = 0;
  for (let i = 0; i < text.length; i++) {
    const candidate = line1 + text[i];
    if (ctx.measureText(candidate).width > maxWidthPx) {
      break;
    }
    line1 = candidate;
    splitIdx = i + 1;
  }

  // Prefer breaking at last space if nearby
  const lastSpace = line1.lastIndexOf(' ');
  if (lastSpace >= Math.floor(line1.length * 0.6)) {
    splitIdx = lastSpace + 1;
    line1 = text.slice(0, lastSpace).trimEnd();
  }

  let line2 = text.slice(splitIdx).trimStart();
  if (ctx.measureText(line2).width > maxWidthPx) {
    while (line2.length > 4 && ctx.measureText(`${line2}…`).width > maxWidthPx) {
      line2 = line2.slice(0, -1);
    }
    line2 = `${line2}…`;
  }
  return [line1, line2];
}

/**
 * Non-blocking Mid-Battle Real-Time Banter Banner.
 * Positioned below the Top Boss HP Bar (inside Safe Area) so movement/dodge/skill touch controls
 * are 100% unobstructed and battle input is never paused.
 */
export function renderBattleBanterOverlay(
  ctx: CanvasRenderingContext2D,
  activeItem: ActiveBanterItem | null,
  alpha: number,
  gameRegistry: GameDataRegistry,
  assets: AssetLoader,
  viewport: ViewportMetrics = DEFAULT_VIEWPORT_METRICS,
  hasBossHpBar: boolean = true,
  hasRaidExtraBars: boolean = false
): void {
  if (!activeItem || alpha <= 0.01) return;

  const entry = activeItem.entry;
  const viewW = viewport.viewWidth;
  const { left: safeL, right: safeR, top: safeT } = viewport.safeInsets;
  const emotionMeta = DIALOGUE_EMOTION_META[entry.emotion] ?? DIALOGUE_EMOTION_META.normal;

  // Compact width that avoids left/right unit HUD cards & Safe Area edges
  const w = Math.min(440, Math.max(290, viewW - safeL - safeR - 200));
  const h = 50;
  const x = Math.round((viewW - w) * 0.5);
  const y =
    safeT +
    (hasBossHpBar ? (hasRaidExtraBars ? 116 : 94) : 56);

  ctx.save();
  ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
  ctx.imageSmoothingEnabled = false;

  // Authentic 9-Slice Pirate-Wood / Emotion-tinted Compact Banter Panel
  drawPixelNineSlicePanel(ctx, x, y, w, h, 'pirate_wood', emotionMeta.borderColor);

  // Left compact 38x38 pixel portrait
  const pSize = 38;
  const px = x + 6;
  const py = y + 6;
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(px, py, pSize, pSize);
  ctx.strokeStyle = emotionMeta.borderColor;
  ctx.lineWidth = 1.2;
  ctx.strokeRect(px, py, pSize, pSize);

  const unitDef = gameRegistry.units[entry.speakerId];
  if (unitDef) {
    const portrait = assets.getOrCreateUnitPortrait(unitDef, entry.emotion, null);
    if (portrait.image) {
      ctx.drawImage(portrait.image, px + 1, py + 1, pSize - 2, pSize - 2);
    }
  } else {
    ctx.fillStyle = emotionMeta.borderColor;
    ctx.fillRect(px + 10, py + 8, 18, 14);
    ctx.fillStyle = '#fde68a';
    ctx.fillRect(px + 12, py + 10, 14, 10);
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(px + 14, py + 14, 3, 3);
    ctx.fillRect(px + 21, py + 14, 3, 3);
    ctx.fillStyle = emotionMeta.borderColor;
    ctx.fillRect(px + 8, py + 24, 22, 10);
  }

  // Speaker Name + Emotion Glyph
  const textX = px + pSize + 10;
  const textMaxW = w - pSize - 24;

  ctx.font = 'bold 10px monospace';
  ctx.textAlign = 'left';
  ctx.fillStyle = '#fde047';
  const nameHeader = emotionMeta.icon
    ? `${emotionMeta.icon} ${entry.speakerName}`
    : entry.speakerName;
  ctx.fillText(nameHeader, textX, y + 14);

  // Trigger tag on top-right
  const tagMap: Record<string, string> = {
    battle_start: '개전',
    boss_hp_50: '2페이즈',
    gimmick_hint: '공략 힌트',
    player_awakening: '각성!',
    clash_start: '격돌!'
  };
  const tagText = tagMap[entry.trigger] ?? '';
  if (tagText) {
    ctx.font = 'bold 9px monospace';
    ctx.textAlign = 'right';
    ctx.fillStyle = emotionMeta.borderColor;
    ctx.fillText(`[${tagText}]`, x + w - 8, y + 13);
  }

  // 1~2 line compact banter text
  ctx.font = 'bold 11px monospace';
  ctx.textAlign = 'left';
  ctx.fillStyle = '#f8fafc';
  const [line1, line2] = wrapCompactBanterText(ctx, entry.text, textMaxW);
  ctx.fillText(line1, textX, y + 29);
  if (line2) {
    ctx.fillText(line2, textX, y + 43);
  }

  ctx.restore();
}
