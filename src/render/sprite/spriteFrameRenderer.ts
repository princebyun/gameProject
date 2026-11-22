import type { Vec2 } from '../../core/math/vector2';
import type { SpriteSheetManifestEntry } from '../../data/assets/types';
import type { AfterimageSample } from './spriteAnimationStateMachine';
import type { SpriteEffectCache } from './spriteEffectCache';

export interface DrawUnitFrameOptions {
  hitFlashActive: boolean;
  flashEffectEnabled: boolean;
  hasArmamentActive: boolean;
  logiaDispersionTimer: number;
  elementColor: string;
  afterimages: AfterimageSample[];
  tick: number;
}

/**
 * Pure Canvas 2D sprite frame drawer with afterimage trail, Logia dispersion,
 * white hit flash, and Armament Haki blackening using pre-baked effect cache.
 */
export function drawAnimatedUnitFrameToCanvas(
  ctx: CanvasRenderingContext2D,
  sheet: HTMLImageElement | HTMLCanvasElement,
  entry: SpriteSheetManifestEntry,
  row: number,
  frameIndex: number,
  worldPos: Vec2,
  facingX: 1 | -1,
  drawScale: number,
  effectCache: SpriteEffectCache,
  opts: DrawUnitFrameOptions
): void {
  const fw = entry.frameWidth;
  const fh = entry.frameHeight;
  const drawW = Math.round(fw * drawScale);
  const drawH = Math.round(fh * drawScale);
  const anchorOffX = Math.round(drawW * entry.anchor.x);
  const anchorOffY = Math.round(drawH * entry.anchor.y);

  // 1. Afterimage Trail (behind main sprite)
  for (const ai of opts.afterimages) {
    const alpha = Math.max(0.08, (ai.remainingSec / ai.totalSec) * 0.45);
    const tinted = effectCache.getOrCreateEffectFrame(
      entry.key,
      sheet,
      ai.row,
      ai.frame,
      fw,
      fh,
      'AFTERIMAGE',
      ai.color
    );
    if (!tinted) continue;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(Math.round(ai.x), Math.round(ai.y));
    ctx.scale(ai.facingX, 1);
    ctx.drawImage(tinted, -anchorOffX, -anchorOffY, drawW, drawH);
    ctx.restore();
  }

  // 2. Logia Element Particle Dispersion
  if (opts.logiaDispersionTimer > 0) {
    const spread = Math.min(1, opts.logiaDispersionTimer / 0.38);
    const logiaFrame = effectCache.getOrCreateEffectFrame(
      entry.key,
      sheet,
      row,
      frameIndex,
      fw,
      fh,
      'LOGIA_SILHOUETTE',
      opts.elementColor
    );
    ctx.save();
    ctx.globalAlpha = 0.42;
    ctx.translate(Math.round(worldPos.x), Math.round(worldPos.y));
    ctx.scale(facingX, 1);
    if (logiaFrame) {
      ctx.drawImage(
        logiaFrame,
        Math.round(-anchorOffX + Math.sin(opts.tick * 0.7) * 6 * spread),
        -anchorOffY,
        drawW,
        drawH
      );
    }
    ctx.restore();

    ctx.save();
    ctx.fillStyle = opts.elementColor;
    for (let p = 0; p < 10; p++) {
      const ang = (p / 10) * Math.PI * 2 + opts.tick * 0.15;
      const dist = (8 + (p % 3) * 8) * spread * drawScale;
      const px = Math.round(worldPos.x + Math.cos(ang) * dist);
      const py = Math.round(worldPos.y - drawH * 0.35 + Math.sin(ang) * dist);
      const sz = Math.max(3, Math.round(3 * drawScale));
      ctx.fillRect(px, py, sz, sz);
    }
    ctx.restore();
    return;
  }

  // 3. Main Sprite Frame (cached White Hit Flash or Armament Blackening)
  let sourceImg: HTMLImageElement | HTMLCanvasElement = sheet;
  let srcX = frameIndex * fw;
  let srcY = row * fh;

  if (opts.hitFlashActive && opts.flashEffectEnabled) {
    const flashCanvas = effectCache.getOrCreateEffectFrame(
      entry.key,
      sheet,
      row,
      frameIndex,
      fw,
      fh,
      'WHITE_FLASH',
      '#ffffff'
    );
    if (flashCanvas) {
      sourceImg = flashCanvas;
      srcX = 0;
      srcY = 0;
    }
  } else if (opts.hasArmamentActive) {
    const armCanvas = effectCache.getOrCreateEffectFrame(
      entry.key,
      sheet,
      row,
      frameIndex,
      fw,
      fh,
      'ARMAMENT_BLACK',
      '#111827'
    );
    if (armCanvas) {
      sourceImg = armCanvas;
      srcX = 0;
      srcY = 0;
    }
  }

  ctx.save();
  ctx.translate(Math.round(worldPos.x), Math.round(worldPos.y));
  ctx.scale(facingX, 1);
  ctx.drawImage(
    sourceImg,
    srcX,
    srcY,
    fw,
    fh,
    -anchorOffX,
    -anchorOffY,
    drawW,
    drawH
  );
  ctx.restore();
}
