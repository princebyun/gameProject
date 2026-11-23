import type { BattleWorldState } from '../core/types/battleState';
import type { GameDataRegistry } from '../core/types/dataSchemas';
import {
  renderArenaAttacksAndProjectiles,
  renderArenaClashSparksAndFloatingTexts
} from './battle/arenaProjectilesAndVfxRenderer';
import { renderRaidTelegraphsAndFieldProps } from './battle/arenaTelegraphsAndPropsRenderer';
import {
  drawConquerorLightningBolts,
  getElementColorFast
} from './battle/arenaVfxPrimitives';
import { renderArenaEnvironmentAndHazards } from './battle/arenaZonesRenderer';
import type { VfxAtlasProvider } from './battle/vfxAtlasRenderer';
import type { ViewportWorldBounds } from './viewport/frustumCulling';

export {
  drawConquerorLightningBolts,
  getElementColorFast,
  renderArenaClashSparksAndFloatingTexts
};

export interface BattleVfxRendererHost extends VfxAtlasProvider {
  readonly vfxAtlasRenderer: {
    syncAndRenderWorldVfx(
      ctx: CanvasRenderingContext2D,
      world: BattleWorldState,
      provider: VfxAtlasProvider,
      visibleBounds?: ViewportWorldBounds
    ): void;
  };
}

export function renderArenaFloorZonesAndProjectiles(
  ctx: CanvasRenderingContext2D,
  world: BattleWorldState,
  registry: GameDataRegistry,
  alpha: number,
  visibleBounds?: ViewportWorldBounds
): void {
  renderArenaEnvironmentAndHazards(ctx, world, registry, visibleBounds);
  renderRaidTelegraphsAndFieldProps(ctx, world, visibleBounds);
  renderArenaAttacksAndProjectiles(ctx, world, registry, alpha, visibleBounds);
}
