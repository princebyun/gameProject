import { Container, Graphics, Sprite, Text, Texture } from 'pixi.js';
import type { Disposable } from '../../../core/types/disposable';
import {
  getWaveComboById,
  parseHexColorInt,
  type WaveComboDefinition
} from '../../../data/combosRegistry';
import type { VisualPolishConfig } from '../../backend/renderBackend';
import type { ViewportMetrics } from '../../viewport/responsiveViewportManager';
import type { PixiStageHost } from '../PixiStageHost';
import type { DynamicPointLightInput } from '../shaders/DynamicLightingLayer';

const CUTIN_BAND_HEIGHT = 112;
const ASSIST_GHOST_COUNT = 3;

export class PixelCutinOverlay implements Disposable {
  public readonly overlayRoot = new Container();
  public readonly worldAssistRoot = new Container();

  private readonly scrimGfx = new Graphics();
  private readonly bandGfx = new Graphics();
  private readonly speedlinesGfx = new Graphics();
  private readonly flashOverlayGfx = new Graphics();
  private readonly leftPortrait = new Sprite(Texture.EMPTY);
  private readonly rightPortrait = new Sprite(Texture.EMPTY);
  private readonly titleText: Text;

  private readonly assistGfx = new Graphics();
  private readonly partnerSprite = new Sprite(Texture.EMPTY);
  private readonly ghostSprites: Sprite[] = [];

  private mode: 'NONE' | 'SINGLE' | 'DUAL' = 'NONE';
  private timerSec = 0;
  private durationSec = 0.65;
  private singleUnitId = 'luffy';
  private singleCaption = '';
  private activeCombo: WaveComboDefinition | null = null;
  private assistTimerSec = 0;
  private assistDurationSec = 0.72;
  private anchorWorld = { x: 320, y: 270 };
  private targetWorld = { x: 640, y: 270 };
  private flashBlockedByAccessibility = false;
  private disposed = false;

  constructor(private readonly host: PixiStageHost) {
    this.overlayRoot.label = 'pixel_cutin_overlay';
    this.overlayRoot.visible = false;
    this.worldAssistRoot.label = 'combo_ally_assist_layer';
    this.worldAssistRoot.visible = false;

    this.speedlinesGfx.blendMode = 'add';
    this.leftPortrait.anchor.set(0.5, 0.5);
    this.rightPortrait.anchor.set(0.5, 0.5);

    this.titleText = new Text({
      text: '',
      style: {
        fontFamily: 'sans-serif',
        fontSize: 17,
        fontWeight: 'bold',
        fill: 0xfef08a,
        stroke: { color: 0x090d16, width: 4 }
      }
    });
    this.titleText.anchor.set(0.5, 0.5);

    this.overlayRoot.addChild(this.scrimGfx);
    this.overlayRoot.addChild(this.bandGfx);
    this.overlayRoot.addChild(this.speedlinesGfx);
    this.overlayRoot.addChild(this.leftPortrait);
    this.overlayRoot.addChild(this.rightPortrait);
    this.overlayRoot.addChild(this.flashOverlayGfx);
    this.overlayRoot.addChild(this.titleText);

    this.partnerSprite.anchor.set(0.5, 0.9);
    for (let i = 0; i < ASSIST_GHOST_COUNT; i++) {
      const ghost = new Sprite(Texture.EMPTY);
      ghost.anchor.set(0.5, 0.9);
      ghost.visible = false;
      this.ghostSprites.push(ghost);
      this.worldAssistRoot.addChild(ghost);
    }
    this.worldAssistRoot.addChild(this.assistGfx);
    this.worldAssistRoot.addChild(this.partnerSprite);
  }

  public get isActive(): boolean {
    return this.timerSec > 0;
  }

  public get isDualSplitActive(): boolean {
    return this.timerSec > 0 && this.mode === 'DUAL';
  }

  public get activeComboId(): string | null {
    return this.activeCombo?.id ?? null;
  }

  public get wasWhiteFlashSuppressed(): boolean {
    return this.flashBlockedByAccessibility;
  }

  public triggerSingle(unitId: string, caption: string, durationSec = 0.95): void {
    this.mode = 'SINGLE';
    this.activeCombo = null;
    this.singleUnitId = unitId;
    this.singleCaption = caption;
    this.durationSec = Math.max(0.4, durationSec);
    this.timerSec = this.durationSec;
    this.assistTimerSec = 0;
  }

  public triggerWaveCombo(
    comboId: string,
    anchorWorldPos = { x: 320, y: 270 },
    targetWorldPos = { x: 640, y: 270 }
  ): boolean {
    const combo = getWaveComboById(comboId);
    if (!combo) return false;
    this.mode = 'DUAL';
    this.activeCombo = combo;
    this.durationSec = Math.max(0.45, combo.cutinFreezeTicks / 60);
    this.timerSec = this.durationSec;
    this.assistDurationSec = 0.72;
    this.assistTimerSec = this.assistDurationSec;
    this.anchorWorld = { ...anchorWorldPos };
    this.targetWorld = { ...targetWorldPos };
    return true;
  }

  private resolvePortraitTex(unitId: string, emotion: string): Texture | null {
    const tex =
      this.host.loader.getLoadedTextureSync(`portrait_${unitId}_${emotion}`) ??
      this.host.loader.getLoadedTextureSync(`cutin_${unitId}`) ??
      this.host.loader.getLoadedTextureSync(`portrait_${unitId}_battle_cry`) ??
      this.host.loader.getLoadedTextureSync(`portrait_${unitId}_normal`);
    if (tex?.source) {
      tex.source.scaleMode = 'nearest';
    }
    return tex;
  }

  public update(
    dtSec: number,
    viewport: ViewportMetrics,
    polish: VisualPolishConfig,
    camOffset: { x: number; y: number }
  ): { bloomBoost: number; lights: DynamicPointLightInput[] } {
    const lights: DynamicPointLightInput[] = [];
    let bloomBoost = 0;
    this.flashBlockedByAccessibility = false;

    if (this.timerSec <= 0) {
      this.overlayRoot.visible = false;
      this.mode = 'NONE';
    } else {
      this.timerSec = Math.max(0, this.timerSec - dtSec);
      this.overlayRoot.visible = true;
      const progress = 1 - this.timerSec / Math.max(0.01, this.durationSec);
      const ease =
        progress < 0.18
          ? progress / 0.18
          : progress > 0.82
            ? (1 - progress) / 0.18
            : 1;

      if (this.mode === 'DUAL' && this.activeCombo) {
        this.renderDualSplitOverlay(viewport, polish, ease, progress);
        bloomBoost = polish.flashEffectEnabled ? 0.55 * ease : 0.2 * ease;
      } else {
        this.renderSingleOverlay(viewport, polish, ease, progress);
      }
    }

    if (this.assistTimerSec <= 0 || !this.activeCombo) {
      this.worldAssistRoot.visible = false;
    } else {
      this.assistTimerSec = Math.max(0, this.assistTimerSec - dtSec);
      this.worldAssistRoot.visible = true;
      const ap = 1 - this.assistTimerSec / Math.max(0.01, this.assistDurationSec);
      const assistRes = this.renderAssistChoreography(this.activeCombo, ap, polish, camOffset);
      bloomBoost = Math.max(bloomBoost, assistRes.bloomBoost);
      if (assistRes.light) lights.push(assistRes.light);
    }

    return { bloomBoost, lights };
  }

  private renderSingleOverlay(
    viewport: ViewportMetrics,
    polish: VisualPolishConfig,
    ease: number,
    progress: number
  ): void {
    const vw = viewport.viewWidth;
    const vh = viewport.viewHeight;
    const bandY = Math.round(vh * 0.5 - CUTIN_BAND_HEIGHT * 0.5);

    this.scrimGfx.clear();
    this.scrimGfx.rect(0, 0, vw, vh);
    this.scrimGfx.fill({ color: 0x050814, alpha: 0.58 * ease });

    this.bandGfx.clear();
    this.bandGfx.rect(0, bandY, vw, CUTIN_BAND_HEIGHT);
    this.bandGfx.fill({ color: 0x0f172a, alpha: 0.92 * ease });
    this.bandGfx.rect(0, bandY, vw, 3);
    this.bandGfx.fill({ color: 0xfacc15, alpha: 0.95 * ease });
    this.bandGfx.rect(0, bandY + CUTIN_BAND_HEIGHT - 3, vw, 3);
    this.bandGfx.fill({ color: 0xfacc15, alpha: 0.95 * ease });

    this.flashOverlayGfx.clear();
    this.speedlinesGfx.clear();
    if (polish.flashEffectEnabled) {
      for (let i = 0; i < 8; i++) {
        const ly = bandY + 10 + i * 12;
        const lx = ((progress * 900 + i * 140) % (vw + 220)) - 220;
        this.speedlinesGfx.rect(lx, ly, 160, 2);
        this.speedlinesGfx.fill({ color: 0x38bdf8, alpha: 0.48 * ease });
      }
    }

    this.rightPortrait.visible = false;
    const tex = this.resolvePortraitTex(this.singleUnitId, 'battle_cry');
    if (tex) {
      this.leftPortrait.visible = true;
      this.leftPortrait.texture = tex;
      const sc = (CUTIN_BAND_HEIGHT - 10) / Math.max(32, tex.height);
      this.leftPortrait.scale.set(sc, sc);
      const slide = (1 - ease) * 90;
      const ax = Math.round(viewport.safeRect.left + tex.width * sc * 0.5 + 24 - slide);
      this.leftPortrait.position.set(ax, Math.round(vh * 0.5));
      this.leftPortrait.alpha = ease;
      this.titleText.anchor.set(0, 0.5);
      this.titleText.position.set(Math.round(ax + tex.width * sc * 0.5 + 18), Math.round(vh * 0.5));
    } else {
      this.leftPortrait.visible = false;
      this.titleText.anchor.set(0.5, 0.5);
      this.titleText.position.set(Math.round(vw * 0.5), Math.round(vh * 0.5));
    }

    this.titleText.text = this.singleCaption || `${this.singleUnitId.toUpperCase()} 필살기!!`;
    this.titleText.alpha = ease;
  }

  private renderDualSplitOverlay(
    viewport: ViewportMetrics,
    polish: VisualPolishConfig,
    ease: number,
    progress: number
  ): void {
    const combo = this.activeCombo;
    if (!combo) return;

    const vw = viewport.viewWidth;
    const vh = viewport.viewHeight;
    const bandY = Math.round(vh * 0.5 - CUTIN_BAND_HEIGHT * 0.5);
    const bandBot = bandY + CUTIN_BAND_HEIGHT;
    const midX = vw * 0.5;
    const skew = 48;

    const leftCol = parseHexColorInt(combo.leftThemeColors[0], 0xdc2626);
    const leftAccent = parseHexColorInt(combo.leftThemeColors[1], 0xfacc15);
    const rightCol = parseHexColorInt(combo.rightThemeColors[0], 0x10b981);
    const rightAccent = parseHexColorInt(combo.rightThemeColors[1], 0x38bdf8);

    this.scrimGfx.clear();
    this.scrimGfx.rect(0, 0, vw, vh);
    this.scrimGfx.fill({
      color: 0x050814,
      alpha: (polish.flashEffectEnabled ? 0.64 : 0.42) * ease
    });

    // Edge-to-edge diagonal split polygons spanning 0..vw
    this.bandGfx.clear();
    this.bandGfx.poly([0, bandY, midX + skew, bandY, midX - skew, bandBot, 0, bandBot]);
    this.bandGfx.fill({ color: leftCol, alpha: 0.92 * ease });
    this.bandGfx.poly([midX + skew, bandY, vw, bandY, vw, bandBot, midX - skew, bandBot]);
    this.bandGfx.fill({ color: rightCol, alpha: 0.92 * ease });

    // Top/bottom borders + gold diagonal slash seam
    this.bandGfx.rect(0, bandY, vw, 3);
    this.bandGfx.fill({ color: 0xfef08a, alpha: 0.95 * ease });
    this.bandGfx.rect(0, bandBot - 3, vw, 3);
    this.bandGfx.fill({ color: 0xfef08a, alpha: 0.95 * ease });
    this.bandGfx.moveTo(midX + skew, bandY);
    this.bandGfx.lineTo(midX - skew, bandBot);
    this.bandGfx.stroke({ color: 0xfef08a, width: 4, alpha: ease });

    this.speedlinesGfx.clear();
    if (polish.flashEffectEnabled) {
      for (let i = 0; i < 6; i++) {
        const ly = bandY + 12 + i * 16;
        const lx = ((progress * 1100 + i * 110) % (midX + 120)) - 120;
        this.speedlinesGfx.rect(lx, ly, 120, 2);
        this.speedlinesGfx.fill({ color: leftAccent, alpha: 0.55 * ease });
        const rx = vw - ((progress * 1100 + i * 95) % (midX + 120));
        this.speedlinesGfx.rect(rx, ly + 4, 120, 2);
        this.speedlinesGfx.fill({ color: rightAccent, alpha: 0.55 * ease });
      }
    }

    // White flash safety guard (`thunder_gear_storm` etc.)
    this.flashOverlayGfx.clear();
    if (combo.hasWhiteFlash && progress >= 0.3 && progress <= 0.55) {
      if (polish.flashEffectEnabled) {
        const pulse = 1 - Math.abs(progress - 0.425) / 0.125;
        this.flashOverlayGfx.rect(0, 0, vw, vh);
        this.flashOverlayGfx.fill({ color: 0xe0f2fe, alpha: Math.max(0, pulse) * 0.45 });
      } else {
        this.flashBlockedByAccessibility = true;
        this.flashOverlayGfx.rect(0, 0, vw, vh);
        this.flashOverlayGfx.fill({ color: 0x0ea5e9, alpha: 0.14 });
      }
    }

    const slideOffset = (1 - ease) * 96;
    const leftTex = this.resolvePortraitTex(combo.leftUnitId, combo.leftPortraitEmotion);
    if (leftTex) {
      this.leftPortrait.visible = true;
      this.leftPortrait.texture = leftTex;
      const sc = (CUTIN_BAND_HEIGHT - 16) / Math.max(32, leftTex.height);
      this.leftPortrait.scale.set(sc, sc);
      const lx = Math.round(viewport.safeRect.left + leftTex.width * sc * 0.5 + 16 - slideOffset);
      this.leftPortrait.position.set(lx, Math.round(vh * 0.5));
      this.leftPortrait.alpha = ease;
    } else {
      this.leftPortrait.visible = false;
    }

    const rightTex = this.resolvePortraitTex(combo.rightUnitId, combo.rightPortraitEmotion);
    if (rightTex) {
      this.rightPortrait.visible = true;
      this.rightPortrait.texture = rightTex;
      const sc = (CUTIN_BAND_HEIGHT - 16) / Math.max(32, rightTex.height);
      this.rightPortrait.scale.set(-sc, sc);
      const rx = Math.round(viewport.safeRect.right - rightTex.width * sc * 0.5 - 16 + slideOffset);
      this.rightPortrait.position.set(rx, Math.round(vh * 0.5));
      this.rightPortrait.alpha = ease;
    } else {
      this.rightPortrait.visible = false;
    }

    const centerX = Math.round((viewport.safeRect.left + viewport.safeRect.right) * 0.5);
    this.titleText.anchor.set(0.5, 0.5);
    this.titleText.position.set(centerX, Math.round(vh * 0.5));
    this.titleText.text = `⚡ ${combo.name} ⚡`;
    this.titleText.alpha = ease;
  }

  private renderAssistChoreography(
    combo: WaveComboDefinition,
    progress: number,
    polish: VisualPolishConfig,
    camOffset: { x: number; y: number }
  ): { bloomBoost: number; light: DynamicPointLightInput | null } {
    const partnerAtlas = this.host.loader.getLoadedSpriteAtlasSync(`${combo.rightUnitId}_base`);
    const tex =
      partnerAtlas?.clipTextures.ATTACK_CAST[0] ??
      partnerAtlas?.clipTextures.ATTACK_MELEE[0] ??
      Texture.EMPTY;
    if (tex.source) tex.source.scaleMode = 'nearest';

    const ax = this.anchorWorld.x + (this.targetWorld.x - this.anchorWorld.x) * progress;
    const ay =
      combo.assistPattern === 'THUNDER_STRIKE_SLAM'
        ? this.targetWorld.y - 44 * (1 - progress)
        : this.anchorWorld.y + (this.targetWorld.y - this.anchorWorld.y) * progress;

    this.partnerSprite.visible = tex !== Texture.EMPTY;
    if (this.partnerSprite.visible) {
      this.partnerSprite.texture = tex;
      const sc = 82 / Math.max(24, tex.height);
      this.partnerSprite.scale.set(this.targetWorld.x < this.anchorWorld.x ? -sc : sc, sc);
      this.partnerSprite.position.set(Math.round(ax), Math.round(ay));
      this.partnerSprite.alpha = Math.sin(progress * Math.PI);
    }

    for (let i = 0; i < this.ghostSprites.length; i++) {
      const ghost = this.ghostSprites[i];
      if (!ghost) continue;
      const backProgress = Math.max(0, progress - (i + 1) * 0.08);
      if (!this.partnerSprite.visible || backProgress <= 0) {
        ghost.visible = false;
        continue;
      }
      ghost.visible = true;
      ghost.texture = tex;
      ghost.scale.copyFrom(this.partnerSprite.scale);
      ghost.position.set(
        Math.round(this.anchorWorld.x + (this.targetWorld.x - this.anchorWorld.x) * backProgress),
        Math.round(this.anchorWorld.y + (this.targetWorld.y - this.anchorWorld.y) * backProgress)
      );
      ghost.tint = parseHexColorInt(combo.bloomColor, 0x38bdf8);
      ghost.alpha = (0.42 - i * 0.11) * Math.sin(progress * Math.PI);
    }

    this.assistGfx.clear();
    const bloomCol = parseHexColorInt(combo.bloomColor, 0xfacc15);
    const pulseAlpha = Math.sin(progress * Math.PI) * (polish.flashEffectEnabled ? 0.85 : 0.45);
    if (combo.assistPattern === 'X_CROSS_DASH') {
      const r = 64 * (0.4 + progress * 0.8);
      this.assistGfx.moveTo(this.targetWorld.x - r, this.targetWorld.y - r);
      this.assistGfx.lineTo(this.targetWorld.x + r, this.targetWorld.y + r);
      this.assistGfx.moveTo(this.targetWorld.x + r, this.targetWorld.y - r);
      this.assistGfx.lineTo(this.targetWorld.x - r, this.targetWorld.y + r);
      this.assistGfx.stroke({ color: bloomCol, width: 5, alpha: pulseAlpha });
    } else if (combo.assistPattern === 'THUNDER_STRIKE_SLAM') {
      const boltX = this.targetWorld.x;
      this.assistGfx.moveTo(boltX - 10, this.targetWorld.y - 160);
      this.assistGfx.lineTo(boltX + 8, this.targetWorld.y - 80);
      this.assistGfx.lineTo(boltX - 6, this.targetWorld.y - 40);
      this.assistGfx.lineTo(boltX, this.targetWorld.y);
      this.assistGfx.stroke({
        color: polish.flashEffectEnabled ? 0xe0f2fe : 0x0284c7,
        width: polish.flashEffectEnabled ? 6 : 4,
        alpha: pulseAlpha
      });
    } else {
      this.assistGfx.circle(this.targetWorld.x, this.targetWorld.y, 18 + progress * 58);
      this.assistGfx.stroke({ color: bloomCol, width: 4, alpha: pulseAlpha });
    }

    return {
      bloomBoost: polish.flashEffectEnabled ? pulseAlpha * 0.7 : pulseAlpha * 0.3,
      light: {
        x: this.targetWorld.x + camOffset.x,
        y: this.targetWorld.y + camOffset.y,
        radiusPx: 145,
        colorInt: parseHexColorInt(combo.pointLightColor, 0xfb923c),
        intensity: polish.flashEffectEnabled ? 1.1 : 0.55,
        flickerSpeed: 10,
        flickerAmp: 0.15
      }
    };
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.overlayRoot.destroy({ children: true, texture: false });
    this.worldAssistRoot.destroy({ children: true, texture: false });
    this.ghostSprites.length = 0;
  }
}
