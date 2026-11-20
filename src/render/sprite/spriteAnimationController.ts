import { lenVec, type Vec2 } from '../../core/math/vector2';
import type {
  BattleWorldState,
  UnitRuntimeState
} from '../../core/types/battleState';
import type { GameDataRegistry } from '../../core/types/dataSchemas';
import {
  resolveSpriteSheetEntry,
  type AssetManifestRegistry
} from '../../data/assets/assetManifestRegistry';
import type {
  SpriteAnimClipDef,
  SpriteAnimState,
  SpriteSheetManifestEntry
} from '../../data/assets/types';
import {
  resolveFrameSourceAndDestRect,
  type SpriteSheetMetaJson
} from '../../assets/smartSpriteSheetLoader';
import { SpriteEffectCache } from './spriteEffectCache';

export interface AfterimageSample {
  x: number;
  y: number;
  facingX: number;
  row: number;
  frame: number;
  sheetKey: string;
  color: string;
  remainingSec: number;
  totalSec: number;
}

export interface UnitSpriteVisualState {
  instanceId: string;
  animState: SpriteAnimState;
  elapsedSec: number;
  frameIndex: number;
  finishedOneShot: boolean;
  hitFrameTriggered: boolean;
  facingX: 1 | -1;
  lastObservedHp: number;
  lastObservedFormId: string | null;
  hitFlashTimerSec: number; // 80ms white flash on HP drop
  transformAnimTimerSec: number;
  attackAnimTimerSec: number;
  attackAnimKind: 'ATTACK_MELEE' | 'ATTACK_CAST';
  afterimages: AfterimageSample[];
  afterimageSpawnAccumSec: number;
}

export interface SpriteAnimStepResult {
  state: SpriteAnimState;
  row: number;
  frameIndex: number;
  hitFrameFiredThisTick: boolean;
  finishedOneShot: boolean;
  hitFlashActive: boolean;
}

/**
 * Pure TypeScript 11-state Sprite Animation Controller & Visual Effect Tracker.
 * Reads `src/core/` BattleWorldState without mutating simulation state.
 */
export class SpriteAnimationController {
  private unitStates = new Map<string, UnitSpriteVisualState>();
  public readonly effectCache = new SpriteEffectCache(256);

  public getUnitState(instanceId: string): UnitSpriteVisualState | undefined {
    return this.unitStates.get(instanceId);
  }

  public clear(): void {
    this.unitStates.clear();
  }

  /**
   * Direct state-machine driver (also used by AssetPreviewScene & unit tests).
   */
  public stepClip(
    instanceId: string,
    targetState: SpriteAnimState,
    entry: SpriteSheetManifestEntry,
    dt: number,
    options?: {
      facingX?: 1 | -1;
      forceRestart?: boolean;
      hitFlashSec?: number;
    }
  ): SpriteAnimStepResult {
    let st = this.unitStates.get(instanceId);
    if (!st) {
      st = {
        instanceId,
        animState: targetState,
        elapsedSec: 0,
        frameIndex: 0,
        finishedOneShot: false,
        hitFrameTriggered: false,
        facingX: options?.facingX ?? 1,
        lastObservedHp: 100,
        lastObservedFormId: null,
        hitFlashTimerSec: 0,
        transformAnimTimerSec: 0,
        attackAnimTimerSec: 0,
        attackAnimKind: 'ATTACK_MELEE',
        afterimages: [],
        afterimageSpawnAccumSec: 0
      };
      this.unitStates.set(instanceId, st);
    }

    if (options?.facingX) {
      st.facingX = options.facingX;
    }
    if (options?.hitFlashSec && options.hitFlashSec > 0) {
      st.hitFlashTimerSec = Math.max(st.hitFlashTimerSec, options.hitFlashSec);
    } else if (st.hitFlashTimerSec > 0) {
      st.hitFlashTimerSec = Math.max(0, st.hitFlashTimerSec - dt);
    }

    if (st.animState !== targetState || options?.forceRestart) {
      st.animState = targetState;
      st.elapsedSec = 0;
      st.frameIndex = 0;
      st.finishedOneShot = false;
      st.hitFrameTriggered = false;
    } else {
      st.elapsedSec += Math.max(0, dt);
    }

    const clip: SpriteAnimClipDef =
      entry.animations[st.animState] ?? entry.animations.IDLE;
    const rawFrame = Math.floor(st.elapsedSec * Math.max(1, clip.fps));

    if (clip.loop) {
      st.frameIndex = rawFrame % Math.max(1, clip.frames);
      st.finishedOneShot = false;
    } else {
      if (rawFrame >= clip.frames) {
        st.frameIndex = Math.max(0, clip.frames - 1);
        st.finishedOneShot = true;
      } else {
        st.frameIndex = rawFrame;
        st.finishedOneShot = false;
      }
    }

    let hitFrameFiredThisTick = false;
    if (
      clip.hitFrame !== undefined &&
      !st.hitFrameTriggered &&
      st.frameIndex >= clip.hitFrame
    ) {
      st.hitFrameTriggered = true;
      hitFrameFiredThisTick = true;
    }

    return {
      state: st.animState,
      row: clip.row,
      frameIndex: st.frameIndex,
      hitFrameFiredThisTick,
      finishedOneShot: st.finishedOneShot,
      hitFlashActive: st.hitFlashTimerSec > 0
    };
  }

  /**
   * Observes a UnitRuntimeState in BattleWorldState, derives the priority-ordered 11-state animation,
   * detects HP drops for 80ms hit flash, detects form shifts for TRANSFORM, and maintains afterimages.
   */
  public syncAndStepUnit(
    unit: UnitRuntimeState,
    world: BattleWorldState,
    registry: GameDataRegistry,
    manifestRegistry: AssetManifestRegistry,
    dt: number
  ): {
    entry: SpriteSheetManifestEntry | null;
    step: SpriteAnimStepResult;
    visual: UnitSpriteVisualState;
    hasArmamentActive: boolean;
  } {
    const entry = resolveSpriteSheetEntry(
      unit.speciesId,
      unit.activeFormId,
      manifestRegistry
    );

    let st = this.unitStates.get(unit.instanceId);
    if (!st) {
      st = {
        instanceId: unit.instanceId,
        animState: 'IDLE',
        elapsedSec: 0,
        frameIndex: 0,
        finishedOneShot: false,
        hitFrameTriggered: false,
        facingX: unit.aimDir.x < -0.05 ? -1 : 1,
        lastObservedHp: unit.hp,
        lastObservedFormId: unit.activeFormId,
        hitFlashTimerSec: 0,
        transformAnimTimerSec: 0,
        attackAnimTimerSec: 0,
        attackAnimKind: 'ATTACK_MELEE',
        afterimages: [],
        afterimageSpawnAccumSec: 0
      };
      this.unitStates.set(unit.instanceId, st);
    }

    // Track facingX cleanly
    if (Math.abs(unit.aimDir.x) > 0.08) {
      st.facingX = unit.aimDir.x < 0 ? -1 : 1;
    } else if (Math.abs(unit.vel.x) > 8) {
      st.facingX = unit.vel.x < 0 ? -1 : 1;
    }

    // Detect HP decrease -> trigger 80ms white flash!
    if (unit.hp < st.lastObservedHp) {
      st.hitFlashTimerSec = 0.08;
    }
    st.lastObservedHp = unit.hp;

    // Detect Form Shift / Awakening change -> 0.4s TRANSFORM animation!
    if (unit.activeFormId !== st.lastObservedFormId) {
      if (unit.activeFormId) {
        st.transformAnimTimerSec = 0.42;
      }
      st.lastObservedFormId = unit.activeFormId;
    }

    // Decrement transient presentation timers
    if (st.transformAnimTimerSec > 0) {
      st.transformAnimTimerSec = Math.max(0, st.transformAnimTimerSec - dt);
    }
    if (st.attackAnimTimerSec > 0) {
      st.attackAnimTimerSec = Math.max(0, st.attackAnimTimerSec - dt);
    }

    // Detect active melee arcs or newly spawned projectiles/beams for attack animation
    const hasOwnMelee = world.meleeArcs.some(
      (a) => !a.finished && a.ownerUnitId === unit.instanceId
    );
    const hasOwnBeam = Boolean(unit.activeBeamId);
    const hasOwnFreshProj = world.projectiles.some(
      (p) => !p.destroyed && p.ownerUnitId === unit.instanceId && p.elapsedSec < 0.16
    );
    if (hasOwnMelee) {
      st.attackAnimKind = 'ATTACK_MELEE';
      st.attackAnimTimerSec = Math.max(st.attackAnimTimerSec, 0.22);
    } else if (hasOwnBeam || hasOwnFreshProj) {
      st.attackAnimKind = 'ATTACK_CAST';
      st.attackAnimTimerSec = Math.max(st.attackAnimTimerSec, 0.22);
    }

    // Priority-ordered 11-state derivation
    const isStaggered = unit.statuses.some(
      (s) => s.kind === 'STAGGER' && s.remainingSec > 0
    );
    let desired: SpriteAnimState = 'IDLE';

    if (!unit.isAlive || unit.isDowned) {
      desired = 'DOWNED';
    } else if (world.winnerTeam === unit.team) {
      desired = 'VICTORY';
    } else if (st.transformAnimTimerSec > 0) {
      desired = 'TRANSFORM';
    } else if (unit.clashLockId !== null) {
      desired = 'CLASH';
    } else if (unit.dodgeActiveTimer > 0) {
      desired = 'DODGE';
    } else if (isStaggered || st.hitFlashTimerSec > 0.02) {
      desired = 'HIT';
    } else if (st.attackAnimTimerSec > 0) {
      desired = st.attackAnimKind;
    } else if (unit.windupMoveId !== null && unit.windupTimer > 0) {
      desired = 'WINDUP';
    } else if (lenVec(unit.vel) > 14) {
      desired = 'MOVE';
    } else {
      desired = 'IDLE';
    }

    const fallbackEntry: SpriteSheetManifestEntry = entry ?? {
      key: `${unit.speciesId}_base`,
      unitId: unit.speciesId,
      formId: 'base',
      src: `assets/sprites/${unit.speciesId}_base.png`,
      frameWidth: 32,
      frameHeight: 32,
      anchor: { x: 0.5, y: 0.85 },
      animations: {
        IDLE: { row: 0, frames: 4, fps: 5, loop: true },
        MOVE: { row: 1, frames: 6, fps: 10, loop: true },
        WINDUP: { row: 2, frames: 3, fps: 10, loop: false },
        ATTACK_MELEE: { row: 3, frames: 4, fps: 14, loop: false, hitFrame: 2 },
        ATTACK_CAST: { row: 4, frames: 3, fps: 12, loop: false, hitFrame: 1 },
        CLASH: { row: 5, frames: 2, fps: 12, loop: true },
        DODGE: { row: 6, frames: 2, fps: 12, loop: false },
        HIT: { row: 7, frames: 2, fps: 10, loop: false },
        DOWNED: { row: 8, frames: 2, fps: 4, loop: true },
        TRANSFORM: { row: 9, frames: 4, fps: 10, loop: false, hitFrame: 2 },
        VICTORY: { row: 10, frames: 4, fps: 6, loop: true }
      }
    };

    const step = this.stepClip(unit.instanceId, desired, fallbackEntry, dt, {
      facingX: st.facingX
    });

    // Update & spawn Afterimage Trail (3-4 frames on Dodge, Just Dodge buff, High-speed Dash, Cross Slash)
    for (let i = st.afterimages.length - 1; i >= 0; i--) {
      st.afterimages[i].remainingSec -= dt;
      if (st.afterimages[i].remainingSec <= 0) {
        st.afterimages.splice(i, 1);
      }
    }
    const isHighSpeedAction =
      unit.dodgeActiveTimer > 0 ||
      unit.justDodgeBuffTimer > 0 ||
      lenVec(unit.vel) > 265;
    if (isHighSpeedAction && unit.isAlive && !unit.isDowned) {
      st.afterimageSpawnAccumSec += dt;
      if (st.afterimageSpawnAccumSec >= 0.045) {
        st.afterimageSpawnAccumSec = 0;
        st.afterimages.push({
          x: unit.pos.x,
          y: unit.pos.y,
          facingX: st.facingX,
          row: step.row,
          frame: step.frameIndex,
          sheetKey: fallbackEntry.key,
          color:
            unit.justDodgeBuffTimer > 0
              ? '#38bdf8'
              : unit.haki.conqueror >= 3
                ? '#ef4444'
                : '#a855f7',
          remainingSec: 0.2,
          totalSec: 0.2
        });
        if (st.afterimages.length > 4) {
          st.afterimages.shift();
        }
      }
    } else {
      st.afterimageSpawnAccumSec = 0;
    }

    // Determine Armament Haki Blackening state
    const activeWindupMove = unit.windupMoveId
      ? registry.moves[unit.windupMoveId]
      : null;
    const hasArmamentActive = Boolean(
      unit.haki.armament >= 2 &&
      (activeWindupMove?.hasArmamentHaki ||
        hasOwnMelee ||
        unit.clashLockId !== null ||
        st.attackAnimTimerSec > 0)
    );

    return {
      entry: fallbackEntry,
      step,
      visual: st,
      hasArmamentActive
    };
  }

  /**
   * Renders the sprite frame with integer pixel coordinates, anchor pivot, afterimages,
   * Armament blackening, 80ms white hit flash (respecting flashEffectEnabled), and Logia dispersion.
   */
  public drawAnimatedUnitFrame(
    ctx: CanvasRenderingContext2D,
    sheet: HTMLImageElement | HTMLCanvasElement,
    entry: SpriteSheetManifestEntry,
    row: number,
    frameIndex: number,
    worldPos: Vec2,
    facingX: 1 | -1,
    drawScale: number,
    opts: {
      hitFlashActive: boolean;
      flashEffectEnabled: boolean;
      hasArmamentActive: boolean;
      logiaDispersionTimer: number;
      elementColor: string;
      afterimages: AfterimageSample[];
      tick: number;
      sheetFrameWidth?: number;
      sheetFrameHeight?: number;
      atlasMeta?: SpriteSheetMetaJson | null;
      animState?: SpriteAnimState;
    }
  ): void {
    const fw = opts.sheetFrameWidth ?? entry.frameWidth;
    const fh = opts.sheetFrameHeight ?? entry.frameHeight;
    const animState = opts.animState ?? 'IDLE';
    const rects = resolveFrameSourceAndDestRect(
      entry,
      opts.atlasMeta ?? null,
      animState,
      row,
      frameIndex,
      fw,
      fh,
      drawScale
    );
    const drawW = rects.destW;
    const drawH = rects.destH;
    const anchorOffX = -rects.destX;
    const anchorOffY = -rects.destY;

    ctx.imageSmoothingEnabled = false;

    // 1. Afterimage Trail (behind main sprite — works for BOTH grid sheets AND external PNG atlases!)
    for (const ai of opts.afterimages) {
      const alpha = Math.max(0.08, (ai.remainingSec / ai.totalSec) * 0.48);
      const aiRects = resolveFrameSourceAndDestRect(
        entry,
        opts.atlasMeta ?? null,
        animState,
        ai.row,
        ai.frame,
        fw,
        fh,
        drawScale
      );
      const tinted = this.effectCache.getOrCreateEffectRect(
        entry.key,
        sheet,
        aiRects.srcX,
        aiRects.srcY,
        aiRects.srcW,
        aiRects.srcH,
        'AFTERIMAGE',
        ai.color
      );
      if (!tinted) continue;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(Math.round(ai.x), Math.round(ai.y));
      ctx.scale(ai.facingX, 1);
      ctx.drawImage(tinted, aiRects.destX, aiRects.destY, aiRects.destW, aiRects.destH);
      ctx.restore();
    }

    // 2. Logia Element Particle Dispersion (splits sprite into elemental pixel particles)
    if (opts.logiaDispersionTimer > 0) {
      const spread = Math.min(1, opts.logiaDispersionTimer / 0.38);
      const logiaFrame = this.effectCache.getOrCreateEffectRect(
        entry.key,
        sheet,
        rects.srcX,
        rects.srcY,
        rects.srcW,
        rects.srcH,
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

      // Scatter 10 crisp elemental pixel particles around unit
      ctx.save();
      ctx.fillStyle = opts.elementColor;
      for (let p = 0; p < 10; p++) {
        const ang = (p / 10) * Math.PI * 2 + opts.tick * 0.15;
        const dist = (8 + (p % 3) * 8) * spread * drawScale;
        const px = Math.round(worldPos.x + Math.cos(ang) * dist);
        const py = Math.round(worldPos.y - drawH * 0.35 + Math.sin(ang) * dist);
        ctx.fillRect(px, py, Math.max(3, Math.round(3 * drawScale)), Math.max(3, Math.round(3 * drawScale)));
      }
      ctx.restore();
      return;
    }

    // 3. Main Sprite Frame (with cached White Hit Flash or Armament Blackening — works for Grid AND External Atlas PNGs!)
    let sourceImg: HTMLImageElement | HTMLCanvasElement = sheet;
    let srcX = rects.srcX;
    let srcY = rects.srcY;
    let srcW = rects.srcW;
    let srcH = rects.srcH;

    if (opts.hitFlashActive && opts.flashEffectEnabled) {
      const flashCanvas = this.effectCache.getOrCreateEffectRect(
        entry.key,
        sheet,
        rects.srcX,
        rects.srcY,
        rects.srcW,
        rects.srcH,
        'WHITE_FLASH',
        '#ffffff'
      );
      if (flashCanvas) {
        sourceImg = flashCanvas;
        srcX = 0;
        srcY = 0;
        srcW = rects.srcW;
        srcH = rects.srcH;
      }
    } else if (opts.hasArmamentActive) {
      const armCanvas = this.effectCache.getOrCreateEffectRect(
        entry.key,
        sheet,
        rects.srcX,
        rects.srcY,
        rects.srcW,
        rects.srcH,
        'ARMAMENT_BLACK',
        '#111827'
      );
      if (armCanvas) {
        sourceImg = armCanvas;
        srcX = 0;
        srcY = 0;
        srcW = rects.srcW;
        srcH = rects.srcH;
      }
    }

    // 4. Procedural Motion Synthesis for missing states on real External Atlas PNGs (never reverts to procedural shapes!)
    let offsetX = 0;
    let offsetY = 0;
    let tiltRad = 0;
    let alphaMult = 1;
    if (rects.synthesizedFromIdle) {
      const t = opts.tick * 0.28;
      if (animState === 'MOVE') {
        // Crisp 2-3px walk bounce + subtle forward/back stride tilt
        offsetY = -Math.round(Math.abs(Math.sin(t)) * 3);
        tiltRad = Math.sin(t) * 0.08;
      } else if (animState === 'ATTACK_MELEE' || animState === 'ATTACK_CAST') {
        offsetX = 4;
        tiltRad = 0.14;
      } else if (animState === 'DODGE') {
        offsetX = 3;
        offsetY = -2;
        tiltRad = 0.18;
        alphaMult = 0.85;
      } else if (animState === 'HIT') {
        offsetX = -4;
        tiltRad = -0.15;
      } else if (animState === 'DOWNED') {
        offsetY = -4;
        tiltRad = -1.2;
        alphaMult = 0.72;
      } else if (animState === 'TRANSFORM') {
        offsetY = -Math.round(Math.abs(Math.sin(t * 1.6)) * 4);
      } else if (animState === 'VICTORY') {
        offsetY = -Math.round(Math.abs(Math.sin(t * 0.9)) * 5);
      }
    }

    // Subtle ground contact shadow beneath feet
    ctx.save();
    ctx.fillStyle = 'rgba(5, 9, 18, 0.36)';
    ctx.beginPath();
    ctx.ellipse(
      Math.round(worldPos.x),
      Math.round(worldPos.y + 1),
      Math.max(10, Math.round(rects.destW * 0.3)),
      Math.max(4, Math.round(rects.destW * 0.11)),
      0,
      0,
      Math.PI * 2
    );
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.globalAlpha *= alphaMult;
    ctx.translate(Math.round(worldPos.x), Math.round(worldPos.y));
    ctx.scale(facingX, 1);
    if (offsetX !== 0 || offsetY !== 0) {
      ctx.translate(offsetX, offsetY);
    }
    if (tiltRad !== 0) {
      ctx.rotate(tiltRad);
    }
    if (opts.hasArmamentActive) {
      ctx.shadowColor = '#a855f7';
      ctx.shadowBlur = 6;
    }
    ctx.drawImage(
      sourceImg,
      srcX,
      srcY,
      srcW,
      srcH,
      rects.destX,
      rects.destY,
      rects.destW,
      rects.destH
    );
    ctx.restore();
  }
}
