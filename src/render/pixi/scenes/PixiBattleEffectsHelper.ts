import { Container, Sprite, Texture } from 'pixi.js';
import type { BattleWorldState } from '../../../core/types/battleState';
import type { GameDataRegistry } from '../../../core/types/dataSchemas';
import type { Disposable } from '../../../core/types/disposable';
import { findWaveComboForPair } from '../../../data/combosRegistry';
import type { VisualPolishConfig } from '../../backend/renderBackend';
import type { ViewportMetrics } from '../../viewport/responsiveViewportManager';
import type { PixiStageHost } from '../PixiStageHost';
import type { DynamicPointLightInput } from '../shaders/DynamicLightingLayer';
import { PixelCutinOverlay } from './PixelCutinOverlay';

interface ActiveVfxSpriteInstance {
  sprite: Sprite;
  frames: Texture[];
  fps: number;
  elapsedSec: number;
}

export class PixiBattleEffectsHelper implements Disposable {
  public readonly pixelCutin: PixelCutinOverlay;
  public readonly cutinOverlay: Container;
  public readonly worldAssistRoot: Container;

  private readonly activeVfxPool: ActiveVfxSpriteInstance[] = [];
  private readonly seenVfxIds = new Set<string>();
  private lastCutinTriggerKey = '';
  private lastCutinLights: DynamicPointLightInput[] = [];
  private lastCutinBloomBoost = 0;
  private disposed = false;

  constructor(private readonly host: PixiStageHost) {
    this.pixelCutin = new PixelCutinOverlay(host);
    this.cutinOverlay = this.pixelCutin.overlayRoot;
    this.worldAssistRoot = this.pixelCutin.worldAssistRoot;
  }

  public getCutinDynamicLights(): readonly DynamicPointLightInput[] {
    return this.lastCutinLights;
  }

  public getCutinBloomBoost(): number {
    return this.lastCutinBloomBoost;
  }

  public triggerWaveCombo(
    comboId: string,
    anchorWorldPos = { x: 320, y: 270 },
    targetWorldPos = { x: 640, y: 270 }
  ): boolean {
    return this.pixelCutin.triggerWaveCombo(comboId, anchorWorldPos, targetWorldPos);
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

    // Trigger Wave 1 2:2 dual-split combo cut-in when 2 ALPHA allies cast simultaneously
    const activeAllyCasts = world.units.filter(
      (u) =>
        u.team === 'ALPHA' &&
        u.isOnField &&
        u.isAlive &&
        (u.windupMoveId !== null || u.activeBeamId !== null)
    );
    if (world.mode === '2V2' && activeAllyCasts.length >= 2) {
      const key = `combo_${Math.floor(world.tick / 120)}`;
      if (this.lastCutinTriggerKey !== key) {
        this.lastCutinTriggerKey = key;
        const unitA = activeAllyCasts[0]!;
        const unitB = activeAllyCasts[1]!;
        const enemyTarget = world.units.find((u) => u.team === 'OMEGA' && u.isOnField && u.isAlive);
        const combo = findWaveComboForPair(unitA.speciesId, unitB.speciesId);
        if (combo) {
          this.pixelCutin.triggerWaveCombo(
            combo.id,
            unitB.pos,
            enemyTarget?.pos ?? unitA.pos
          );
        } else {
          this.triggerCutin(unitA.speciesId, '2:2 밀짚모자 합동기 발동!');
        }
      }
    } else if (
      world.bossIntroTimer > 1.25 &&
      world.bossIntroName &&
      !this.pixelCutin.isBossPhaseCutinActive &&
      !this.pixelCutin.isDualSplitActive
    ) {
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
    this.pixelCutin.triggerSingle(unitId, caption, durationSec);
  }

  public updateCutinOverlay(
    dtSec: number,
    viewport: ViewportMetrics,
    polish: VisualPolishConfig,
    registry: GameDataRegistry,
    camOffset: { x: number; y: number } = { x: 0, y: 0 }
  ): void {
    void registry;
    const res = this.pixelCutin.update(dtSec, viewport, polish, camOffset);
    this.lastCutinBloomBoost = res.bloomBoost;
    this.lastCutinLights = res.lights;
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const item of this.activeVfxPool) {
      item.sprite.destroy({ texture: false });
    }
    this.activeVfxPool.length = 0;
    this.seenVfxIds.clear();
    this.lastCutinLights = [];
    this.pixelCutin.dispose();
  }
}
