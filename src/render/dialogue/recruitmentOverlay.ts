import type { AssetLoader } from '../../assets/assetLoader';
import { resolveFrameSourceAndDestRect } from '../../assets/smartSpriteSheetLoader';
import type { GameDataRegistry } from '../../core/types/dataSchemas';
import {
  DEFAULT_VIEWPORT_METRICS,
  type ViewportMetrics
} from '../viewport/responsiveViewportManager';

export interface RecruitmentBannerState {
  unitId: string;
  characterName: string;
  roleName: string;
  passiveSummary: string;
  elapsedSec: number;
  dismissed: boolean;
}

export function createRecruitmentBannerState(
  unitId: string,
  roleName: string,
  passiveSummary: string,
  gameRegistry?: GameDataRegistry
): RecruitmentBannerState {
  const unitDef = gameRegistry?.units[unitId];
  return {
    unitId,
    characterName: unitDef?.name ?? unitId,
    roleName,
    passiveSummary,
    elapsedSec: 0,
    dismissed: false
  };
}

export function stepRecruitmentBanner(
  state: RecruitmentBannerState,
  dt: number
): void {
  if (state.dismissed) return;
  state.elapsedSec += Math.max(0, dt);
}

/**
 * Dismisses the recruitment splash banner after a brief 0.35s accidental-tap guard.
 */
export function tryDismissRecruitmentBanner(
  state: RecruitmentBannerState,
  force = false
): boolean {
  if (state.dismissed) return true;
  if (!force && state.elapsedSec < 0.35) return false;
  state.dismissed = true;
  return true;
}

/**
 * Bandai-RPG Pixel Splash Banner sweeping across the screen when a new crewmate joins.
 */
export function renderRecruitmentOverlay(
  ctx: CanvasRenderingContext2D,
  state: RecruitmentBannerState,
  gameRegistry: GameDataRegistry,
  assets: AssetLoader,
  tick: number,
  viewport: ViewportMetrics = DEFAULT_VIEWPORT_METRICS
): void {
  if (state.dismissed) return;

  const viewW = viewport.viewWidth;
  const viewH = viewport.viewHeight;
  const { left: safeL, right: safeR } = viewport.safeInsets;

  const slideT = Math.min(1, state.elapsedSec / 0.28);
  const eased = 1 - Math.pow(1 - slideT, 3);
  const pulse = 0.78 + Math.sin(tick * 0.16) * 0.22;

  ctx.save();
  ctx.imageSmoothingEnabled = false;

  // Dim backdrop
  ctx.fillStyle = `rgba(5, 9, 18, ${0.76 * eased})`;
  ctx.fillRect(0, 0, viewW, viewH);

  // Full-width Bandai splash ribbon
  const bannerH = 166;
  const bannerY = Math.round((viewH - bannerH) * 0.5);
  const ribbonX = Math.round((1 - eased) * -viewW);

  ctx.save();
  ctx.translate(ribbonX, 0);

  // Gold energy speedlines top & bottom
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, bannerY, viewW, bannerH);

  const grad = ctx.createLinearGradient(0, bannerY, viewW, bannerY);
  grad.addColorStop(0, 'rgba(250, 204, 21, 0.08)');
  grad.addColorStop(0.25, 'rgba(14, 165, 233, 0.24)');
  grad.addColorStop(0.5, 'rgba(250, 204, 21, 0.26)');
  grad.addColorStop(0.75, 'rgba(14, 165, 233, 0.24)');
  grad.addColorStop(1, 'rgba(250, 204, 21, 0.08)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, bannerY + 4, viewW, bannerH - 8);

  // Double pixel gold borders
  ctx.fillStyle = '#facc15';
  ctx.fillRect(0, bannerY, viewW, 4);
  ctx.fillRect(0, bannerY + bannerH - 4, viewW, 4);
  ctx.fillStyle = '#38bdf8';
  ctx.fillRect(0, bannerY + 6, viewW, 2);
  ctx.fillRect(0, bannerY + bannerH - 8, viewW, 2);

  // Inner centered card inside Safe Area
  const contentW = Math.min(640, viewW - safeL - safeR - 32);
  const contentX = Math.round((viewW - contentW) * 0.5);

  // Top Header Ribbon Badge
  const tagW = 248;
  const tagX = Math.round((viewW - tagW) * 0.5);
  ctx.fillStyle = '#b45309';
  ctx.fillRect(tagX, bannerY - 16, tagW, 26);
  ctx.strokeStyle = '#fde047';
  ctx.lineWidth = 2;
  ctx.strokeRect(tagX, bannerY - 16, tagW, 26);

  ctx.font = 'bold 13px monospace';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#fef9c3';
  ctx.fillText('★ 새로운 동료 합류! ★', viewW * 0.5, bannerY + 2);

  // Left Pixel Avatar Frame (104x104)
  const avatarSize = 104;
  const avatarX = contentX + 12;
  const avatarY = bannerY + 28;
  ctx.fillStyle = '#162033';
  ctx.fillRect(avatarX, avatarY, avatarSize, avatarSize);
  ctx.strokeStyle = '#facc15';
  ctx.lineWidth = 2.5;
  ctx.strokeRect(avatarX, avatarY, avatarSize, avatarSize);

  const unitDef = gameRegistry.units[state.unitId];
  if (unitDef) {
    const resolved = assets.getOrCreateUnitSpriteSheet(unitDef, 'base', null);
    if (resolved.sheet) {
      const clip = resolved.entry.animations.IDLE;
      const frameIdx = Math.floor((tick / 60) * clip.fps) % Math.max(1, clip.frames);
      const rects = resolveFrameSourceAndDestRect(
        resolved.entry,
        resolved.meta,
        'IDLE',
        clip.row,
        frameIdx,
        resolved.sheetFrameWidth,
        resolved.sheetFrameHeight,
        1
      );
      ctx.drawImage(
        resolved.sheet,
        rects.srcX,
        rects.srcY,
        rects.srcW,
        rects.srcH,
        avatarX + 6,
        avatarY + 6,
        avatarSize - 12,
        avatarSize - 12
      );
    }
  }

  // Right Info Block
  const infoX = avatarX + avatarSize + 20;
  const infoMaxW = Math.max(200, contentW - avatarSize - 44);

  ctx.textAlign = 'left';
  ctx.font = 'bold 20px monospace';
  ctx.fillStyle = '#fde047';
  ctx.fillText(state.characterName, infoX, bannerY + 52);

  // Role Pill
  ctx.fillStyle = 'rgba(2, 132, 199, 0.35)';
  ctx.fillRect(infoX, bannerY + 62, Math.min(240, infoMaxW), 22);
  ctx.strokeStyle = '#38bdf8';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(infoX, bannerY + 62, Math.min(240, infoMaxW), 22);
  ctx.font = 'bold 11px monospace';
  ctx.fillStyle = '#bae6fd';
  ctx.fillText(`직책 해금 · ${state.roleName}`, infoX + 8, bannerY + 77);

  // Passive 1-line summary (auto-clipped cleanly if narrow)
  ctx.font = 'bold 12px monospace';
  ctx.fillStyle = '#f8fafc';
  const passiveText = `✦ 패시브: ${state.passiveSummary}`;
  const clipped =
    ctx.measureText(passiveText).width > infoMaxW
      ? `${passiveText.slice(0, Math.max(16, Math.floor(infoMaxW / 10)))}…`
      : passiveText;
  ctx.fillText(clipped, infoX, bannerY + 108);

  // Dismiss prompt
  ctx.font = 'bold 11px monospace';
  ctx.fillStyle = `rgba(125, 211, 252, ${pulse})`;
  ctx.fillText(
    '▶ [화면 터치 / Space / E] 동료 합류 확인',
    infoX,
    bannerY + 136
  );

  ctx.restore();
  ctx.restore();
}
