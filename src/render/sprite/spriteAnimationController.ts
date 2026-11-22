import type { Disposable } from '../../core/types/disposable';
import type { Vec2 } from '../../core/math/vector2';
import type {
  BattleWorldState,
  UnitRuntimeState
} from '../../core/types/battleState';
import type { GameDataRegistry } from '../../core/types/dataSchemas';
import type { AssetManifestRegistry } from '../../data/assets/assetManifestRegistry';
import type {
  SpriteAnimState,
  SpriteSheetManifestEntry
} from '../../data/assets/types';
import {
  SpriteAnimationStateMachine,
  type AfterimageSample,
  type SpriteAnimStepResult,
  type UnitSpriteVisualState
} from './spriteAnimationStateMachine';
import { SpriteEffectCache } from './spriteEffectCache';
import {
  drawAnimatedUnitFrameToCanvas,
  type DrawUnitFrameOptions
} from './spriteFrameRenderer';

export type { AfterimageSample, SpriteAnimStepResult, UnitSpriteVisualState };

/**
 * Facade composing the pure `SpriteAnimationStateMachine` (logic) with Canvas 2D
 * `SpriteEffectCache` & `drawAnimatedUnitFrameToCanvas` (rendering I/O).
 */
export class SpriteAnimationController implements Disposable {
  private readonly stateMachine = new SpriteAnimationStateMachine();
  public readonly effectCache = new SpriteEffectCache(256);

  public getUnitState(instanceId: string): UnitSpriteVisualState | undefined {
    return this.stateMachine.getUnitState(instanceId);
  }

  public clear(): void {
    this.stateMachine.clear();
  }

  public dispose(): void {
    this.stateMachine.clear();
    this.effectCache.dispose();
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
    return this.stateMachine.stepClip(instanceId, targetState, entry, dt, options);
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
    return this.stateMachine.syncAndStepUnit(
      unit,
      world,
      registry,
      manifestRegistry,
      dt
    );
  }

  public drawAnimatedUnitFrame(
    ctx: CanvasRenderingContext2D,
    sheet: HTMLImageElement | HTMLCanvasElement,
    entry: SpriteSheetManifestEntry,
    row: number,
    frameIndex: number,
    worldPos: Vec2,
    facingX: 1 | -1,
    drawScale: number,
    opts: DrawUnitFrameOptions
  ): void {
    drawAnimatedUnitFrameToCanvas(
      ctx,
      sheet,
      entry,
      row,
      frameIndex,
      worldPos,
      facingX,
      drawScale,
      this.effectCache,
      opts
    );
  }
}
