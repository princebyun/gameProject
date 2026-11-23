import type { AssetLoader } from '../assets/assetLoader';
import { clamp } from '../core/math/vector2';
import { computeCrewRoleBonuses } from '../core/rpg/crewAndBountyEngine';
import type { SailingStepOutput } from '../core/rpg/sailingPhysics';
import { resolveActiveShipId } from '../core/rpg/seaCurrentPhysics';
import type {
  RpgCampaignState,
  RpgDataRegistry
} from '../core/types/rpgSchemas';
import { resolveBiomeForSeaZone } from '../data/assets/assetManifestRegistry';
import {
  renderWorldMarkerBeacons,
  type WorldMarker
} from '../story/worldMarkerSystem';
import {
  renderDynamicSeaObjects,
  renderPlayerShip
} from './rpg/sailingEntityRenderer';
import {
  renderLogPoseHud,
  renderSailingInteractionPrompt,
  renderSailingStatusHud
} from './rpg/sailingHudRenderer';
import { renderSeaCurrentsAndWhirlpools } from './sea/seaCurrentsRenderer';
import { renderWorldLandmarksAndGate } from './sea/seaLandmarkRenderer';
import { renderTopRightSeaMinimapHud } from './sea/seaMinimapHud';
import type { SeaWakeParticlePool } from './sea/seaWakeParticlePool';
import { SeaWeatherRenderer } from './sea/seaWeatherRenderer';
import { computeCameraWorldBounds } from './viewport/frustumCulling';
import {
  DEFAULT_VIEWPORT_METRICS,
  type ViewportMetrics
} from './viewport/responsiveViewportManager';
import { getSafeHudBounds } from './viewport/safeAreaLayout';

export interface SeaSailingRenderOptions {
  flashEffectEnabled?: boolean;
  wakePool?: SeaWakeParticlePool;
  weatherRenderer?: SeaWeatherRenderer;
}

const defaultWeatherRenderer = new SeaWeatherRenderer();

export function renderSeaSailingCanvas(
  ctx: CanvasRenderingContext2D,
  state: RpgCampaignState,
  rpgRegistry: RpgDataRegistry,
  stepInfo: SailingStepOutput,
  tick: number,
  _fps: number,
  assets?: AssetLoader,
  viewport: ViewportMetrics = DEFAULT_VIEWPORT_METRICS,
  worldMarkers?: WorldMarker[],
  highlightGoldMarker: boolean = false,
  options?: SeaSailingRenderOptions
): void {
  const safe = getSafeHudBounds(viewport);
  const viewW = safe.viewWidth;
  const viewH = safe.viewHeight;
  const zone = rpgRegistry.seaZones[state.currentZoneId];
  const activeShipId = resolveActiveShipId(state);
  const shipDef =
    rpgRegistry.ships[activeShipId] ?? rpgRegistry.ships['going_merry'];
  const roleBonuses = computeCrewRoleBonuses(state, rpgRegistry);
  const flashEnabled = options?.flashEffectEnabled ?? true;
  const weatherFx = options?.weatherRenderer ?? defaultWeatherRenderer;

  // 1. Ocean background color by Sea Zone & Time-of-Day
  let seaColor = '#0c4a6e';
  if (zone.id === 'grand_line') seaColor = '#1e3a8a';
  else if (zone.id === 'new_world') seaColor = '#311042';

  if (state.timeOfDay === 'NIGHT') {
    seaColor = '#091526';
  } else if (state.timeOfDay === 'EVENING') {
    seaColor = '#3b1d38';
  }

  ctx.fillStyle = seaColor;
  ctx.fillRect(0, 0, viewW, viewH);

  // Camera centered on ship, clamped to sea zone bounds
  const camX = clamp(
    Math.round(viewW * 0.5 - state.ship.pos.x),
    Math.min(0, viewW - zone.width),
    0
  );
  const camY = clamp(
    Math.round(viewH * 0.5 - state.ship.pos.y),
    Math.min(0, viewH - zone.height),
    0
  );

  ctx.save();
  ctx.translate(camX, camY);

  // 2. Biome Animated Sea Tileset
  if (assets) {
    const seaBiome = resolveBiomeForSeaZone(zone.id, assets.manifestRegistry);
    assets.tilemapRenderer.renderBiomeBackdrop(
      ctx,
      `sea_${zone.id}`,
      zone.width,
      zone.height,
      Math.max(0, -camX - 32),
      Math.max(0, -camY - 32),
      viewW + 64,
      viewH + 64,
      seaBiome,
      assets,
      tick
    );
    if (state.timeOfDay === 'NIGHT') {
      ctx.fillStyle = 'rgba(7, 11, 24, 0.42)';
      ctx.fillRect(-camX, -camY, viewW, viewH);
    } else if (state.timeOfDay === 'EVENING') {
      ctx.fillStyle = 'rgba(88, 28, 135, 0.22)';
      ctx.fillRect(-camX, -camY, viewW, viewH);
    }
  } else {
    ctx.strokeStyle = 'rgba(125, 211, 252, 0.10)';
    ctx.lineWidth = 1;
    for (let x = 0; x <= zone.width; x += 120) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, zone.height);
      ctx.stroke();
    }
    for (let y = 0; y <= zone.height; y += 120) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(zone.width, y);
      ctx.stroke();
    }
  }

  const visibleBounds = computeCameraWorldBounds(camX, camY, viewW, viewH, 112);

  // 2.5 Deep Sea King silhouettes & Marineford drifting ice floes (world space)
  weatherFx.renderUnderwaterSeaKingShadows(ctx, zone, tick, visibleBounds);
  weatherFx.renderWorldSpaceIceFloes(ctx, zone, tick, visibleBounds);

  // 3. Directional Sea Currents & Whirlpools (Frustum culled)
  renderSeaCurrentsAndWhirlpools(ctx, zone, tick, visibleBounds);

  // 4. 20 Unique Animated Pixel Landmarks & SeaGate (Frustum culled)
  renderWorldLandmarksAndGate(
    ctx,
    state,
    rpgRegistry,
    zone,
    stepInfo.nearbyIsland,
    tick,
    assets,
    visibleBounds,
    worldMarkers
  );

  // 5. Dynamic Sea Objects (Frustum culled)
  renderDynamicSeaObjects(
    ctx,
    state,
    zone.id,
    roleBonuses.revealsHiddenChests,
    tick,
    assets,
    visibleBounds
  );

  // 5.5 Render GTA-style World Marker Beacons
  if (worldMarkers && worldMarkers.length > 0) {
    renderWorldMarkerBeacons(ctx, worldMarkers, tick, highlightGoldMarker);
  }

  // 6. Pooled Wake Foam & Upgraded Player Ship
  const shipSpeed = Math.hypot(state.ship.vel.x, state.ship.vel.y);
  options?.wakePool?.stepAndRender(
    ctx,
    state.ship.pos.x,
    state.ship.pos.y,
    state.ship.headingRad,
    shipSpeed,
    stepInfo.currentTailwindRatio ?? 0,
    state.ship.coupDeBurstActiveTimer > 0,
    tick,
    visibleBounds
  );
  renderPlayerShip(
    ctx,
    state,
    tick,
    assets,
    stepInfo.currentTailwindRatio ?? 0
  );

  ctx.restore();

  // 7. Zone-Specific Dynamic Weather & Accessibility Lightning Guard
  weatherFx.renderZoneWeatherOverlay(
    ctx,
    state,
    zone,
    viewW,
    viewH,
    tick,
    flashEnabled
  );

  // 8-11. Safe Area HUDs
  renderSailingStatusHud(
    ctx,
    state,
    zone.name,
    shipDef?.name ?? '고잉 메리호',
    safe
  );
  renderLogPoseHud(ctx, state, rpgRegistry, tick, safe);
  renderTopRightSeaMinimapHud(
    ctx,
    state,
    rpgRegistry,
    roleBonuses.revealsHiddenChests,
    tick,
    safe,
    worldMarkers
  );
  renderSailingInteractionPrompt(ctx, state, rpgRegistry, stepInfo, safe);
}
