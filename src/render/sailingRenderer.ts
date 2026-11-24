import { computeCrewRoleBonuses } from '../core/rpg/crewAndBountyEngine';
import type { SailingStepOutput } from '../core/rpg/sailingPhysics';
import { resolveActiveShipId } from '../core/rpg/seaCurrentPhysics';
import type {
  RpgCampaignState,
  RpgDataRegistry
} from '../core/types/rpgSchemas';
import type { WorldMarker } from '../story/worldMarkerSystem';
import {
  renderLogPoseHud,
  renderSailingInteractionPrompt,
  renderSailingStatusHud
} from './rpg/sailingHudRenderer';
import { renderTopRightSeaMinimapHud } from './sea/seaMinimapHud';
import {
  DEFAULT_VIEWPORT_METRICS,
  type ViewportMetrics
} from './viewport/responsiveViewportManager';
import { getSafeHudBounds } from './viewport/safeAreaLayout';

export interface SeaSailingHudOptions {
  showWorldMinimap?: boolean;
}

/**
 * Renders ONLY the Safe Area Sea Sailing HUDs on the transparent 2D UI canvas.
 * World ocean waves, weather particles, landmarks, and ships are rendered on WebGL2 via PixiSeaSailingScene.
 */
export function renderSeaSailingHudOverlay(
  ctx: CanvasRenderingContext2D,
  state: RpgCampaignState,
  rpgRegistry: RpgDataRegistry,
  stepInfo: SailingStepOutput,
  tick: number,
  viewport: ViewportMetrics = DEFAULT_VIEWPORT_METRICS,
  worldMarkers?: WorldMarker[],
  options?: SeaSailingHudOptions
): void {
  const safe = getSafeHudBounds(viewport);
  const zone = rpgRegistry.seaZones[state.currentZoneId];
  if (!zone) return;
  const activeShipId = resolveActiveShipId(state);
  const shipDef =
    rpgRegistry.ships[activeShipId] ?? rpgRegistry.ships['going_merry'];
  const roleBonuses = computeCrewRoleBonuses(state, rpgRegistry);

  renderSailingStatusHud(
    ctx,
    state,
    zone.name,
    shipDef?.name ?? '고잉 메리호',
    safe
  );
  renderLogPoseHud(ctx, state, rpgRegistry, tick, safe);
  if (options?.showWorldMinimap !== false) {
    renderTopRightSeaMinimapHud(
      ctx,
      state,
      rpgRegistry,
      roleBonuses.revealsHiddenChests,
      tick,
      safe,
      worldMarkers
    );
  }
  renderSailingInteractionPrompt(ctx, state, rpgRegistry, stepInfo, safe);
}

/**
 * Compatibility wrapper retaining signature while strictly excluding legacy Canvas 2D ocean tiling
 * or procedural island drawing. Draws HUD overlays on top of WebGL2 PixiSeaSailingScene.
 */
export function renderSeaSailingCanvas(
  ctx: CanvasRenderingContext2D,
  state: RpgCampaignState,
  rpgRegistry: RpgDataRegistry,
  stepInfo: SailingStepOutput,
  tick: number,
  _fps: number,
  _assets: unknown,
  viewport: ViewportMetrics = DEFAULT_VIEWPORT_METRICS,
  worldMarkers?: WorldMarker[]
): void {
  renderSeaSailingHudOverlay(ctx, state, rpgRegistry, stepInfo, tick, viewport, worldMarkers);
}
