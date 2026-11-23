import { Container, Graphics, Sprite, Text, Texture } from 'pixi.js';
import type { Disposable } from '../../../core/types/disposable';
import type { ViewportMetrics } from '../../viewport/responsiveViewportManager';
import type { PixiStageHost } from '../PixiStageHost';

export class BattleBanterOverlay implements Disposable {
  public readonly root = new Container();
  private readonly bgGfx = new Graphics();
  private readonly portraitSprite = new Sprite(Texture.EMPTY);
  private readonly messageText: Text;

  private remainingSec = 0;
  private currentUnitId = 'buggy';
  private currentMessage = '';
  private disposed = false;

  constructor(private readonly host: PixiStageHost) {
    this.root.label = 'battle_banter_overlay';
    this.root.visible = false;

    this.portraitSprite.anchor.set(0, 0.5);
    this.messageText = new Text({
      text: '',
      style: {
        fontFamily: 'sans-serif',
        fontSize: 12,
        fontWeight: 'bold',
        fill: 0xf8fafc,
        stroke: { color: 0x090d16, width: 3 },
        wordWrap: true,
        wordWrapWidth: 420
      }
    });
    this.messageText.anchor.set(0, 0.5);

    this.root.addChild(this.bgGfx);
    this.root.addChild(this.portraitSprite);
    this.root.addChild(this.messageText);
  }

  public get isVisible(): boolean {
    return this.root.visible;
  }

  public get activeMessage(): string {
    return this.currentMessage;
  }

  public showBanter(unitId: string, message: string, durationSec = 2.6): void {
    if (!message || this.disposed) return;
    this.currentUnitId = unitId;
    this.currentMessage = message;
    this.remainingSec = Math.max(0.6, durationSec);
  }

  public update(dtSec: number, viewport: ViewportMetrics): void {
    if (this.disposed) return;
    if (this.remainingSec <= 0) {
      this.root.visible = false;
      return;
    }

    this.remainingSec = Math.max(0, this.remainingSec - dtSec);
    this.root.visible = true;
    const alpha = Math.min(1, this.remainingSec * 3.0);

    // Keep safely below top HP/settings HUD bars and inside Safe Area horizontal bounds
    const maxBoxW = Math.min(480, Math.max(220, viewport.safeRect.width - 180));
    const boxH = 44;
    const boxX = Math.round(viewport.safeRect.left + (viewport.safeRect.width - maxBoxW) * 0.5);
    const boxY = Math.round(viewport.safeRect.top + 48);

    this.bgGfx.clear();
    this.bgGfx.roundRect(boxX, boxY, maxBoxW, boxH, 6);
    this.bgGfx.fill({ color: 0x0f172a, alpha: 0.9 * alpha });
    this.bgGfx.stroke({ color: 0xf59e0b, width: 1.5, alpha: 0.95 * alpha });

    const tex =
      this.host.loader.getLoadedTextureSync(`portrait_${this.currentUnitId}_angry`) ??
      this.host.loader.getLoadedTextureSync(`portrait_${this.currentUnitId}_normal`);
    const cy = Math.round(boxY + boxH * 0.5);
    if (tex) {
      if (tex.source) tex.source.scaleMode = 'nearest';
      this.portraitSprite.visible = true;
      this.portraitSprite.texture = tex;
      const sc = 34 / Math.max(16, tex.height);
      this.portraitSprite.scale.set(sc, sc);
      this.portraitSprite.position.set(boxX + 8, cy);
      this.portraitSprite.alpha = alpha;
      this.messageText.style.wordWrapWidth = maxBoxW - 58;
      this.messageText.position.set(boxX + 48, cy);
    } else {
      this.portraitSprite.visible = false;
      this.messageText.style.wordWrapWidth = maxBoxW - 20;
      this.messageText.position.set(boxX + 10, cy);
    }
    this.messageText.text = this.currentMessage;
    this.messageText.alpha = alpha;
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.root.destroy({ children: true, texture: false });
  }
}
