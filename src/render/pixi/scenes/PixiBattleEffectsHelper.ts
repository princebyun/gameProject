import { Container, Graphics, Sprite, Text, Texture } from 'pixi.js';
import type { BattleWorldState } from '../../../core/types/battleState';
import type { GameDataRegistry } from '../../../core/types/dataSchemas';
import type { Disposable } from '../../../core/types/disposable';
import type { VisualPolishConfig } from '../../backend/renderBackend';
import type { ViewportMetrics } from '../../viewport/responsiveViewportManager';
import type { PixiStageHost } from '../PixiStageHost';

interface ActiveVfxSpriteInstance {
  sprite: Sprite;
  frames: Texture[];
  fps: number;
  elapsedSec: number;
}

export class PixiBattleEffectsHelper implements Disposable {
  public readonly cutinOverlay = new Container();
  private readonly cutinScrim = new Graphics();
  private readonly cutinSpeedlines = new Graphics();
  private readonly cutinPortraitSprite = new Sprite(Texture.EMPTY);
  private readonly cutinTitleText: Text;

  private readonly activeVfxPool: ActiveVfxSpriteInstance[] = [];
  private readonly seenVfxIds = new Set<string>();
  private cutinTimerSec = 0;
  private cutinDurationSec = 0.95;
  private cutinUnitId = 'luffy';
  private cutinCaption = '';
  private lastCutinTriggerKey = '';
  private disposed = false;

  constructor(private readonly host: PixiStageHost) {
    this.cutinOverlay.label = 'battle_cutin_overlay';
    this.cutinOverlay.visible = false;

    this.cutinSpeedlines.blendMode = 'add';
    this.cutinPortraitSprite.anchor.set(0.5, 0.5);
    this.cutinTitleText = new Text({
      text: '',
      style: {
        fontFamily: 'sans-serif',
        fontSize: 18,
        fontWeight: 'bold',
        fill: 0xfef08a,
        stroke: { color: 0x090d16, width: 4 }
      }
    });
    this.cutinTitleText.anchor.set(0, 0.5);

    this.cutinOverlay.addChild(this.cutinScrim);
    this.cutinOverlay.addChild(this.cutinSpeedlines);
    this.cutinOverlay.addChild(this.cutinPortraitSprite);
    this.cutinOverlay.addChild(this.cutinTitleText);
  }

  public syncVfxEvents(
    world: BattleWorldState,
    emissiveLayer: Container,
    dtSec: number,
    onShockwaveTrigger: (worldX: number, worldY: number) => void
  ): number {
    let newShockwaves = 0;

    for (let i = 0; i < world.vfxEvents.length; i++) {
      const ev = world.vfxEvents[i];
      if (!ev || this.seenVfxIds.has(ev.id)) continue;
      this.seenVfxIds.add(ev.id);
      if (this.seenVfxIds.size > 256) {
        this.seenVfxIds.clear();
        this.seenVfxIds.add(ev.id);
      }

      if (
        ev.kind === 'JUST_DODGE_RING' ||
        ev.kind === 'CLASH_SHOCKWAVE' ||
        ev.kind === 'SKY_SPLIT_SHOCKWAVE' ||
        ev.kind === 'BEAM_BREAK'
      ) {
        onShockwaveTrigger(ev.pos.x, ev.pos.y);
        newShockwaves += 1;
      }

      if (ev.kind === 'FORM_BURST') {
        const carrier = world.units.find(
          (u) => u.isOnField && Math.hypot(u.pos.x - ev.pos.x, u.pos.y - ev.pos.y) < 48
        );
        this.triggerCutin(
          carrier?.speciesId ?? 'luffy',
          carrier ? `${carrier.name} 각성 / 합동기!` : '해적 합동 필살기!'
        );
      }

      const atlasId =
        ev.kind === 'HIT_SPARK'
          ? 'hit_spark'
          : ev.kind === 'JUST_DODGE_RING' || ev.kind === 'CLASH_SHOCKWAVE'
            ? 'parry_flash'
            : ev.kind === 'CROSS_SLASH'
              ? 'slash_arc'
              : ev.kind === 'CONQUEROR_LIGHTNING' || ev.kind === 'SKY_SPLIT_SHOCKWAVE'
                ? 'conqueror_bolt'
                : ev.kind === 'FORM_BURST'
                  ? 'awakening_burst'
                  : 'fire_explosion';

      const loaded = this.host.loader.getLoadedVfxAtlasSync(atlasId);
      if (loaded && loaded.frames.length > 0) {
        const sp = new Sprite(loaded.frames[0] ?? Texture.EMPTY);
        sp.anchor.set(0.5, 0.5);
        sp.position.set(Math.round(ev.pos.x), Math.round(ev.pos.y));
        sp.scale.set(loaded.entry.scale * Math.max(0.8, ev.radiusPx / 32));
        sp.blendMode = loaded.entry.blendMode === 'add' ? 'add' : 'normal';
        emissiveLayer.addChild(sp);
        this.activeVfxPool.push({
          sprite: sp,
          frames: loaded.frames,
          fps: loaded.entry.fps,
          elapsedSec: 0
        });
      }
    }

    // Also trigger 2:2 dual-team combo cut-in if 2 allies cast simultaneously
    const activeAllyCasts = world.units.filter(
      (u) => u.team === 'ALPHA' && u.isOnField && u.isAlive && (u.windupMoveId !== null || u.activeBeamId !== null)
    );
    if (world.mode === '2V2' && activeAllyCasts.length >= 2) {
      const key = `combo_${Math.floor(world.tick / 120)}`;
      if (this.lastCutinTriggerKey !== key) {
        this.lastCutinTriggerKey = key;
        this.triggerCutin(activeAllyCasts[0]?.speciesId ?? 'luffy', '2:2 밀짚모자 합동기 발동!');
      }
    } else if (world.bossIntroTimer > 1.25 && world.bossIntroName) {
      const bossKey = `boss_${world.bossIntroName}`;
      if (this.lastCutinTriggerKey !== bossKey) {
        this.lastCutinTriggerKey = bossKey;
        const bossUnit = world.units.find((u) => u.team === 'OMEGA' && u.isBossUnit);
        this.triggerCutin(bossUnit?.speciesId ?? 'buggy', `VS ${world.bossIntroName}`);
      }
    }

    for (let i = this.activeVfxPool.length - 1; i >= 0; i--) {
      const item = this.activeVfxPool[i];
      if (!item) continue;
      item.elapsedSec += dtSec;
      const fIdx = Math.floor(item.elapsedSec * item.fps);
      if (fIdx >= item.frames.length) {
        item.sprite.parent?.removeChild(item.sprite);
        item.sprite.destroy({ texture: false });
        this.activeVfxPool.splice(i, 1);
      } else {
        const tex = item.frames[fIdx];
        if (tex) item.sprite.texture = tex;
      }
    }

    return newShockwaves;
  }

  public triggerCutin(unitId: string, caption: string, durationSec = 0.95): void {
    this.cutinUnitId = unitId;
    this.cutinCaption = caption;
    this.cutinDurationSec = Math.max(0.4, durationSec);
    this.cutinTimerSec = this.cutinDurationSec;
  }

  public updateCutinOverlay(
    dtSec: number,
    viewport: ViewportMetrics,
    polish: VisualPolishConfig,
    registry: GameDataRegistry
  ): void {
    if (this.cutinTimerSec <= 0) {
      this.cutinOverlay.visible = false;
      return;
    }

    this.cutinTimerSec = Math.max(0, this.cutinTimerSec - dtSec);
    this.cutinOverlay.visible = true;

    const progress = 1 - this.cutinTimerSec / this.cutinDurationSec;
    const ease = progress < 0.18 ? progress / 0.18 : progress > 0.82 ? (1 - progress) / 0.18 : 1;
    const vw = viewport.viewWidth;
    const vh = viewport.viewHeight;
    const bandH = 104;
    const bandY = Math.round(vh * 0.5 - bandH * 0.5);

    this.cutinScrim.clear();
    this.cutinScrim.rect(0, 0, vw, vh);
    this.cutinScrim.fill({ color: 0x050814, alpha: 0.62 * ease });
    this.cutinScrim.rect(0, bandY, vw, bandH);
    this.cutinScrim.fill({ color: 0x0f172a, alpha: 0.92 * ease });
    this.cutinScrim.rect(0, bandY, vw, 3);
    this.cutinScrim.fill({ color: 0xfacc15, alpha: 0.95 * ease });
    this.cutinScrim.rect(0, bandY + bandH - 3, vw, 3);
    this.cutinScrim.fill({ color: 0xfacc15, alpha: 0.95 * ease });

    this.cutinSpeedlines.clear();
    if (polish.flashEffectEnabled) {
      for (let i = 0; i < 8; i++) {
        const ly = bandY + 10 + i * 12;
        const lx = ((progress * 900 + i * 140) % (vw + 220)) - 220;
        this.cutinSpeedlines.rect(lx, ly, 160, 2);
        this.cutinSpeedlines.fill({ color: 0x38bdf8, alpha: 0.48 * ease });
      }
    }

    const tex =
      this.host.loader.getLoadedTextureSync(`cutin_${this.cutinUnitId}`) ??
      this.host.loader.getLoadedTextureSync(`portrait_${this.cutinUnitId}_battle_cry`) ??
      this.host.loader.getLoadedTextureSync(`portrait_${this.cutinUnitId}_normal`);

    if (tex) {
      this.cutinPortraitSprite.visible = true;
      this.cutinPortraitSprite.texture = tex;
      const scale = (bandH - 8) / Math.max(32, tex.height);
      this.cutinPortraitSprite.scale.set(scale, scale);
      const slideOffset = (1 - ease) * 90;
      const anchorX = Math.round(viewport.safeRect.left + tex.width * scale * 0.5 + 24 - slideOffset);
      this.cutinPortraitSprite.position.set(anchorX, Math.round(vh * 0.5));
      this.cutinPortraitSprite.alpha = ease;

      this.cutinTitleText.position.set(
        Math.round(anchorX + tex.width * scale * 0.5 + 18),
        Math.round(vh * 0.5)
      );
    } else {
      this.cutinPortraitSprite.visible = false;
      this.cutinTitleText.position.set(Math.round(viewport.safeRect.left + 32), Math.round(vh * 0.5));
    }

    const uName = registry.units[this.cutinUnitId]?.name ?? this.cutinUnitId.toUpperCase();
    this.cutinTitleText.text = this.cutinCaption || `${uName} 필살기!!`;
    this.cutinTitleText.alpha = ease;
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const item of this.activeVfxPool) {
      item.sprite.destroy({ texture: false });
    }
    this.activeVfxPool.length = 0;
    this.seenVfxIds.clear();
    this.cutinOverlay.destroy({ children: true, texture: false });
  }
}
