import { lenVec } from '../../core/math/vector2';
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
  createAfterimagePool,
  type AfterimageSample
} from '../pools/renderScratchPools';

export type { AfterimageSample };

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
  hitFlashTimerSec: number;
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

function createDefaultVisualState(
  instanceId: string,
  animState: SpriteAnimState,
  facingX: 1 | -1,
  lastObservedHp: number,
  lastObservedFormId: string | null
): UnitSpriteVisualState {
  return {
    instanceId,
    animState,
    elapsedSec: 0,
    frameIndex: 0,
    finishedOneShot: false,
    hitFrameTriggered: false,
    facingX,
    lastObservedHp,
    lastObservedFormId,
    hitFlashTimerSec: 0,
    transformAnimTimerSec: 0,
    attackAnimTimerSec: 0,
    attackAnimKind: 'ATTACK_MELEE',
    afterimages: [],
    afterimageSpawnAccumSec: 0
  };
}

function buildFallbackSheetEntry(speciesId: string): SpriteSheetManifestEntry {
  return {
    key: `${speciesId}_base`,
    unitId: speciesId,
    formId: 'base',
    src: `assets/sprites/${speciesId}_base.png`,
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
}

/**
 * Pure TypeScript 11-state sprite animation state machine (zero Canvas/DOM API calls).
 */
export class SpriteAnimationStateMachine {
  private readonly unitStates = new Map<string, UnitSpriteVisualState>();
  private readonly afterimagePool = createAfterimagePool(32, 128);

  public getUnitState(instanceId: string): UnitSpriteVisualState | undefined {
    return this.unitStates.get(instanceId);
  }

  public clear(): void {
    for (const st of this.unitStates.values()) {
      for (let i = 0; i < st.afterimages.length; i++) {
        const ai = st.afterimages[i];
        if (ai) this.afterimagePool.release(ai);
      }
      st.afterimages.length = 0;
    }
    this.unitStates.clear();
  }

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
      st = createDefaultVisualState(instanceId, targetState, options?.facingX ?? 1, 100, null);
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
    } else if (rawFrame >= clip.frames) {
      st.frameIndex = Math.max(0, clip.frames - 1);
      st.finishedOneShot = true;
    } else {
      st.frameIndex = rawFrame;
      st.finishedOneShot = false;
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
      st = createDefaultVisualState(
        unit.instanceId,
        'IDLE',
        unit.aimDir.x < -0.05 ? -1 : 1,
        unit.hp,
        unit.activeFormId
      );
      this.unitStates.set(unit.instanceId, st);
    }

    if (Math.abs(unit.aimDir.x) > 0.08) {
      st.facingX = unit.aimDir.x < 0 ? -1 : 1;
    } else if (Math.abs(unit.vel.x) > 8) {
      st.facingX = unit.vel.x < 0 ? -1 : 1;
    }

    if (unit.hp < st.lastObservedHp) {
      st.hitFlashTimerSec = 0.08;
    }
    st.lastObservedHp = unit.hp;

    if (unit.activeFormId !== st.lastObservedFormId) {
      if (unit.activeFormId) {
        st.transformAnimTimerSec = 0.42;
      }
      st.lastObservedFormId = unit.activeFormId;
    }

    if (st.transformAnimTimerSec > 0) {
      st.transformAnimTimerSec = Math.max(0, st.transformAnimTimerSec - dt);
    }
    if (st.attackAnimTimerSec > 0) {
      st.attackAnimTimerSec = Math.max(0, st.attackAnimTimerSec - dt);
    }

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

    const fallbackEntry = entry ?? buildFallbackSheetEntry(unit.speciesId);
    const step = this.stepClip(unit.instanceId, desired, fallbackEntry, dt, {
      facingX: st.facingX
    });

    for (let i = st.afterimages.length - 1; i >= 0; i--) {
      const ghost = st.afterimages[i];
      if (!ghost) continue;
      ghost.remainingSec -= dt;
      if (ghost.remainingSec <= 0) {
        const removed = st.afterimages.splice(i, 1)[0];
        if (removed) this.afterimagePool.release(removed);
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
        const ai = this.afterimagePool.acquire();
        ai.x = unit.pos.x;
        ai.y = unit.pos.y;
        ai.facingX = st.facingX;
        ai.row = step.row;
        ai.frame = step.frameIndex;
        ai.sheetKey = fallbackEntry.key;
        ai.color =
          unit.justDodgeBuffTimer > 0
            ? '#38bdf8'
            : unit.haki.conqueror >= 3
              ? '#ef4444'
              : '#a855f7';
        ai.remainingSec = 0.2;
        ai.totalSec = 0.2;
        st.afterimages.push(ai);
        if (st.afterimages.length > 4) {
          const evicted = st.afterimages.shift();
          if (evicted) this.afterimagePool.release(evicted);
        }
      }
    } else {
      st.afterimageSpawnAccumSec = 0;
    }

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
}
