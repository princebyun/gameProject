import type { AssetLoader } from '../../assets/assetLoader';
import { clamp } from '../../core/math/vector2';
import type { ActiveBattleCutin } from '../../core/types/battleState';
import type { GameDataRegistry } from '../../core/types/dataSchemas';
import {
  DEFAULT_VIEWPORT_METRICS,
  type ViewportMetrics
} from '../viewport/responsiveViewportManager';

export type CutinDisplayMode = 'ON' | 'ONCE' | 'OFF';

export interface CutinRenderResult {
  rendered: boolean;
  flashSuppressed: boolean;
  modeSkipped: boolean;
}

/**
 * High-Speed Bandai Console RPG Pixel Cut-In Overlay (0.65s / 39 ticks).
 * - Renders full-wide (960~1260px) 19.5:9 speedline banner with zero black bars.
 * - Draws 64x64 pixel portraits at exact integer scaling (2x / 3x, imageSmoothingEnabled=false).
 * - Supports Dual Split Panel for 2:2 Bond Tag Combos.
 * - Strictly respects `flashEffectEnabled === false` (dark dimming instead of bright flash)
 *   and `cutinDisplayMode: 'ON' | 'ONCE' | 'OFF'` without altering core deterministic 39-tick timing.
 */
export class PixelCutinOverlayController {
  private readonly seenOnceKeys = new Set<string>();
  private activeCutinId: string | null = null;
  private activeCutinAllowed = true;

  public resetBattleOnceMemory(): void {
    this.seenOnceKeys.clear();
    this.activeCutinId = null;
    this.activeCutinAllowed = true;
  }

  public evaluateDisplayPermission(
    cutin: ActiveBattleCutin | null,
    displayMode: CutinDisplayMode
  ): boolean {
    if (!cutin) {
      this.activeCutinId = null;
      return false;
    }
    if (displayMode === 'OFF') {
      return false;
    }
    if (this.activeCutinId === cutin.id) {
      return this.activeCutinAllowed;
    }
    this.activeCutinId = cutin.id;
    if (displayMode === 'ONCE') {
      const key = `${cutin.kind}:${cutin.primarySpeciesId}:${cutin.partnerSpeciesId ?? ''}`;
      if (this.seenOnceKeys.has(key)) {
        this.activeCutinAllowed = false;
        return false;
      }
      this.seenOnceKeys.add(key);
    }
    this.activeCutinAllowed = true;
    return true;
  }

  public render(
    ctx: CanvasRenderingContext2D,
    cutin: ActiveBattleCutin | null,
    registry: GameDataRegistry,
    assets: AssetLoader | undefined,
    viewport: ViewportMetrics = DEFAULT_VIEWPORT_METRICS,
    flashEffectEnabled: boolean = true,
    displayMode: CutinDisplayMode = 'ON'
  ): CutinRenderResult {
    if (!cutin) {
      return { rendered: false, flashSuppressed: !flashEffectEnabled, modeSkipped: false };
    }
    if (!this.evaluateDisplayPermission(cutin, displayMode)) {
      return { rendered: false, flashSuppressed: !flashEffectEnabled, modeSkipped: true };
    }

    const viewW = viewport.viewWidth;
    const viewH = viewport.viewHeight;
    const progress = clamp(
      cutin.elapsedTicks / Math.max(1, cutin.durationTicks),
      0,
      1
    );

    // Slide-in (0..0.18), hold (0.18..0.82), slide-out (0.82..1.0)
    let slideAlpha = 1.0;
    let slideOffsetX = 0;
    if (progress < 0.18) {
      const t = progress / 0.18;
      const ease = 1 - (1 - t) * (1 - t);
      slideOffsetX = Math.round((1 - ease) * viewW * 0.42);
      slideAlpha = clamp(t * 1.4, 0, 1);
    } else if (progress > 0.82) {
      const t = (progress - 0.82) / 0.18;
      slideOffsetX = -Math.round(t * t * viewW * 0.48);
      slideAlpha = clamp(1 - t, 0, 1);
    }

    const bandH = Math.min(204, Math.max(146, Math.round(viewH * 0.36)));
    const bandY = Math.round((viewH - bandH) * 0.5);
    const isDual = cutin.kind === 'BOND_COMBO' && Boolean(cutin.partnerSpeciesId);

    ctx.save();
    ctx.imageSmoothingEnabled = false;

    // 1. Full-screen atmospheric dim (never bright white flash when flashEffectEnabled === false)
    ctx.fillStyle = flashEffectEnabled
      ? 'rgba(5, 8, 18, 0.56)'
      : 'rgba(5, 8, 18, 0.72)';
    ctx.fillRect(0, 0, viewW, viewH);

    // Optional entry impact flash ONLY when flashEffectEnabled === true
    if (flashEffectEnabled && cutin.elapsedTicks <= 3) {
      ctx.fillStyle = 'rgba(255, 255, 255, 0.24)';
      ctx.fillRect(0, 0, viewW, viewH);
    }

    ctx.globalAlpha = slideAlpha;

    // 2. Full-wide slanted banner strip spanning entire 960~1260px viewport
    const slant = 28;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(0, bandY);
    ctx.lineTo(viewW, bandY - 8);
    ctx.lineTo(viewW, bandY + bandH + 8);
    ctx.lineTo(0, bandY + bandH);
    ctx.closePath();
    ctx.clip();

    // Rich split or single gradient background
    if (isDual) {
      const midX = Math.round(viewW * 0.5);
      ctx.fillStyle = '#090f20';
      ctx.fillRect(0, bandY - 12, viewW, bandH + 24);

      ctx.fillStyle = cutin.primaryColor;
      ctx.globalAlpha = slideAlpha * 0.32;
      ctx.beginPath();
      ctx.moveTo(0, bandY - 12);
      ctx.lineTo(midX + slant, bandY - 12);
      ctx.lineTo(midX - slant, bandY + bandH + 12);
      ctx.lineTo(0, bandY + bandH + 12);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = cutin.secondaryColor;
      ctx.beginPath();
      ctx.moveTo(midX + slant, bandY - 12);
      ctx.lineTo(viewW, bandY - 12);
      ctx.lineTo(viewW, bandY + bandH + 12);
      ctx.lineTo(midX - slant, bandY + bandH + 12);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = slideAlpha;
    } else {
      ctx.fillStyle = '#090f20';
      ctx.fillRect(0, bandY - 12, viewW, bandH + 24);
      ctx.fillStyle = cutin.primaryColor;
      ctx.globalAlpha = slideAlpha * 0.28;
      ctx.fillRect(0, bandY - 12, viewW, bandH + 24);
      ctx.globalAlpha = slideAlpha;
    }

    // 3. High-speed anime horizontal speedlines (deterministic per elapsedTicks)
    const speedShift = (cutin.elapsedTicks * 46) % viewW;
    for (let i = 0; i < 18; i++) {
      const ly = bandY + Math.round(((i + 0.5) / 18) * bandH);
      const lw = 110 + ((i * 53) % 190);
      const lx = ((i * 137 + speedShift) % (viewW + lw)) - lw;
      const lineH = i % 3 === 0 ? 4 : 2;
      ctx.fillStyle =
        i % 2 === 0
          ? flashEffectEnabled
            ? 'rgba(255, 255, 255, 0.26)'
            : 'rgba(226, 232, 240, 0.14)'
          : cutin.primaryColor;
      ctx.globalAlpha = slideAlpha * (i % 2 === 0 ? 0.8 : 0.35);
      ctx.fillRect(Math.round(lx), ly, lw, lineH);
    }
    ctx.globalAlpha = slideAlpha;

    // 4. Integer-scaled 64x64 Pixel Portraits (2x = 128px or 3x = 192px)
    const intScale = bandH >= 196 ? 3 : 2;
    const portSize = 64 * intScale;
    const portY = Math.round(bandY + (bandH - portSize) * 0.5);

    const primaryDef = registry.units[cutin.primarySpeciesId];
    const primaryPortrait =
      primaryDef && assets
        ? assets.getOrCreateUnitPortrait(
            primaryDef,
            cutin.portraitEmotion,
            cutin.primaryFormId
          ).image
        : null;

    if (isDual && cutin.partnerSpeciesId) {
      const partnerDef = registry.units[cutin.partnerSpeciesId];
      const partnerPortrait =
        partnerDef && assets
          ? assets.getOrCreateUnitPortrait(partnerDef, cutin.portraitEmotion, null).image
          : null;

      // Left portrait (Primary)
      const leftX = Math.round(viewW * 0.16 - portSize * 0.5) - slideOffsetX;
      drawFramedCutinPortrait(
        ctx,
        primaryPortrait,
        leftX,
        portY,
        portSize,
        cutin.primaryColor,
        false
      );

      // Right portrait (Partner, mirrored facing inward)
      const rightX = Math.round(viewW * 0.84 - portSize * 0.5) + slideOffsetX;
      drawFramedCutinPortrait(
        ctx,
        partnerPortrait,
        rightX,
        portY,
        portSize,
        cutin.secondaryColor,
        true
      );

      // Center diagonal golden clash bolt
      const midX = Math.round(viewW * 0.5);
      ctx.strokeStyle = '#fde047';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(midX + slant, bandY - 10);
      ctx.lineTo(midX - slant, bandY + bandH + 10);
      ctx.stroke();
    } else {
      const sideX =
        cutin.team === 'ALPHA'
          ? Math.round(viewW * 0.22 - portSize * 0.5) - slideOffsetX
          : Math.round(viewW * 0.78 - portSize * 0.5) + slideOffsetX;
      drawFramedCutinPortrait(
        ctx,
        primaryPortrait,
        sideX,
        portY,
        portSize,
        cutin.primaryColor,
        cutin.team === 'OMEGA'
      );
    }

    // 5. Bold Pixel RPG Cut-In Typography (Title + Callout Subtitle + Kind Tag)
    const textCenterX = isDual
      ? Math.round(viewW * 0.5)
      : cutin.team === 'ALPHA'
        ? Math.round(viewW * 0.6) + Math.round(slideOffsetX * 0.35)
        : Math.round(viewW * 0.4) - Math.round(slideOffsetX * 0.35);

    const badgeText =
      cutin.kind === 'BOND_COMBO'
        ? '★ 2:2 BOND TAG COMBO ★'
        : cutin.kind === 'AWAKENING'
          ? '⚡ AWAKENING OVERDRIVE ⚡'
          : cutin.kind === 'RAID_ULTIMATE'
            ? '☠ RAID BOSS ULTIMATE ☠'
            : '⚠ BOSS PHASE 2 ⚠';

    ctx.textAlign = 'center';
    ctx.font = 'bold 12px monospace';
    ctx.fillStyle = '#090d16';
    ctx.fillText(badgeText, textCenterX + 2, bandY + Math.round(bandH * 0.28) + 2);
    ctx.fillStyle = '#fde047';
    ctx.fillText(badgeText, textCenterX, bandY + Math.round(bandH * 0.28));

    ctx.font = `bold ${viewW >= 1000 ? 28 : 23}px monospace`;
    ctx.fillStyle = '#090d16';
    ctx.fillText(cutin.title, textCenterX + 3, bandY + Math.round(bandH * 0.56) + 3);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(cutin.title, textCenterX, bandY + Math.round(bandH * 0.56));

    ctx.font = 'bold 13px monospace';
    ctx.fillStyle = '#090d16';
    ctx.fillText(cutin.subtitle, textCenterX + 2, bandY + Math.round(bandH * 0.78) + 2);
    ctx.fillStyle = cutin.secondaryColor || '#fde047';
    ctx.fillText(cutin.subtitle, textCenterX, bandY + Math.round(bandH * 0.78));

    ctx.restore();

    // 6. Top & bottom metallic pixel borders
    ctx.strokeStyle = '#fde047';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(0, bandY);
    ctx.lineTo(viewW, bandY - 8);
    ctx.moveTo(0, bandY + bandH);
    ctx.lineTo(viewW, bandY + bandH + 8);
    ctx.stroke();

    ctx.strokeStyle = cutin.primaryColor;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, bandY + 5);
    ctx.lineTo(viewW, bandY - 3);
    ctx.moveTo(0, bandY + bandH - 5);
    ctx.lineTo(viewW, bandY + bandH + 3);
    ctx.stroke();

    ctx.restore();

    return {
      rendered: true,
      flashSuppressed: !flashEffectEnabled,
      modeSkipped: false
    };
  }
}

function drawFramedCutinPortrait(
  ctx: CanvasRenderingContext2D,
  img: CanvasImageSource | null,
  x: number,
  y: number,
  size: number,
  accentColor: string,
  mirrorX: boolean
): void {
  ctx.save();
  ctx.fillStyle = 'rgba(9, 13, 22, 0.85)';
  ctx.fillRect(x - 4, y - 4, size + 8, size + 8);
  ctx.strokeStyle = accentColor;
  ctx.lineWidth = 3;
  ctx.strokeRect(x - 4, y - 4, size + 8, size + 8);

  if (img) {
    ctx.imageSmoothingEnabled = false;
    if (mirrorX) {
      ctx.translate(x + size, y);
      ctx.scale(-1, 1);
      ctx.drawImage(img, 0, 0, size, size);
    } else {
      ctx.drawImage(img, x, y, size, size);
    }
  }
  ctx.restore();
}

export const sharedPixelCutinOverlay = new PixelCutinOverlayController();
