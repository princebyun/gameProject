import type { AssetLoader } from '../assets/assetLoader';
import { clamp } from '../core/math/vector2';
import { computeCrewRoleBonuses } from '../core/rpg/crewAndBountyEngine';
import type { SailingStepOutput } from '../core/rpg/sailingPhysics';
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
  renderPlayerShip,
  renderSeaGateAndIslands
} from './rpg/sailingEntityRenderer';
import { renderLogPoseHud, renderSailingInteractionPrompt, renderSailingStatusHud, renderSeaMinimapHud } from './rpg/sailingHudRenderer';
import { computeCameraWorldBounds } from './viewport/frustumCulling';
import {
  DEFAULT_VIEWPORT_METRICS,
  type ViewportMetrics
} from './viewport/responsiveViewportManager';
import { getSafeHudBounds } from './viewport/safeAreaLayout';

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
  highlightGoldMarker: boolean = false
): void {
  const safe = getSafeHudBounds(viewport);
  const viewW = safe.viewWidth;
  const viewH = safe.viewHeight;
  const zone = rpgRegistry.seaZones[state.currentZoneId];
  const shipDef =
    rpgRegistry.ships[state.ship.shipId] ?? rpgRegistry.ships['going_merry'];
  const roleBonuses = computeCrewRoleBonuses(state, rpgRegistry);

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

  const visibleBounds = computeCameraWorldBounds(camX, camY, viewW, viewH, 96);

  // 3-4. SeaGate & Islands (Frustum culled)
  renderSeaGateAndIslands(ctx, state, rpgRegistry, zone, visibleBounds);

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

  // 6. Player Ship
  renderPlayerShip(ctx, state, tick, assets);

  ctx.restore();

  // 7. Weather visual overlay (STORM rain / FOG mist)
  if (state.seaWeather === 'STORM') {
    ctx.save();
    ctx.strokeStyle = 'rgba(186, 230, 253, 0.25)';
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 28; i++) {
      const rx = (i * 73 + tick * 9) % viewW;
      const ry = (i * 59 + tick * 14) % viewH;
      ctx.beginPath();
      ctx.moveTo(rx, ry);
      ctx.lineTo(rx - 8, ry + 18);
      ctx.stroke();
    }
    ctx.restore();
  } else if (state.seaWeather === 'FOG') {
    ctx.fillStyle = 'rgba(226, 232, 240, 0.10)';
    ctx.fillRect(0, 0, viewW, viewH);
  }

  // 8-11. Safe Area HUDs
  renderSailingStatusHud(
    ctx,
    state,
    zone.name,
    shipDef?.name ?? '고잉 메리호',
    safe
  );
  renderLogPoseHud(ctx, state, rpgRegistry, tick, safe);
  renderSeaMinimapHud(
    ctx,
    state,
    rpgRegistry,
    roleBonuses.revealsHiddenChests,
    safe
  );
  renderSailingInteractionPrompt(ctx, state, rpgRegistry, stepInfo, safe);
}
