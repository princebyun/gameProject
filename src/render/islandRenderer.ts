import type { AssetLoader } from '../assets/assetLoader';
import {
  ISLAND_BATTLE_TERMINAL_POS,
  type IslandExplorationRuntime,
  type IslandStepOutput
} from '../core/rpg/episodeEngine';
import type { GameDataRegistry } from '../core/types/dataSchemas';
import type { RpgCampaignState, RpgDataRegistry } from '../core/types/rpgSchemas';
import { resolveBiomeForIsland } from '../data/assets/assetManifestRegistry';
import { renderWorldMarkerBeacons, type WorldMarker } from '../story/worldMarkerSystem';
import type { LightingMood, LanternLightPoint } from './rpg/atmosphereLightingOverlay';
import { computeIslandCameraTransform } from './rpg/islandCamera';
import { enqueueIslandEntitiesLayer3 } from './rpg/islandEntityDrawers';
import { renderIslandHeaderAndPromptHud } from './rpg/islandHudRenderer';
import { renderIslandLandmarksOverhead } from './rpg/islandLandmarksDrawer';
import { IslandYSortQueue } from './rpg/islandYSortQueue';
import { isRectInBounds, type ViewportWorldBounds } from './viewport/frustumCulling';
import { DEFAULT_VIEWPORT_METRICS, type ViewportMetrics } from './viewport/responsiveViewportManager';
import { getSafeHudBounds } from './viewport/safeAreaLayout';

const SHARED_Y_SORT_QUEUE = new IslandYSortQueue();
const SHARED_LANTERN_POINTS: LanternLightPoint[] = [];

function resolveLightingMood(
  state: RpgCampaignState,
  theme: string,
  lightingDefault?: string
): LightingMood {
  if (lightingDefault === 'DUSK') return 'DUSK';
  if (lightingDefault === 'NIGHT' || state.timeOfDay === 'NIGHT' || theme === 'ONIGASHIMA_DOME') {
    return 'NIGHT';
  }
  if (state.timeOfDay === 'EVENING') return 'DUSK';
  return 'DAY';
}

export function renderIslandEpisodeCanvas(
  ctx: CanvasRenderingContext2D,
  state: RpgCampaignState,
  runtime: IslandExplorationRuntime,
  stepInfo: IslandStepOutput,
  rpgRegistry: RpgDataRegistry,
  gameRegistry: GameDataRegistry,
  assets: AssetLoader,
  tick: number,
  viewport: ViewportMetrics = DEFAULT_VIEWPORT_METRICS,
  worldMarkers?: WorldMarker[],
  highlightGoldMarker: boolean = false
): void {
  const islandMap = rpgRegistry.islands[runtime.islandId];
  const episode = islandMap ? rpgRegistry.episodes[islandMap.episodeId] : null;
  if (!islandMap) return;

  const safe = getSafeHudBounds(viewport);
  const viewW = safe.viewWidth;
  const viewH = safe.viewHeight;
  const cam = computeIslandCameraTransform(islandMap, runtime.playerPos, viewport);
  const offsetX = cam.offsetX;
  const worldTransX = offsetX - cam.camX;
  const worldTransY = -cam.camY;
  const islandBounds: ViewportWorldBounds = {
    minX: cam.camX - offsetX - 64,
    minY: cam.camY - 64,
    maxX: cam.camX + viewW - offsetX + 64,
    maxY: cam.camY + viewH + 64
  };

  const islandBiome = resolveBiomeForIsland(islandMap.islandId, assets.manifestRegistry);
  const waterStripY =
    !islandMap.tileMap && islandMap.theme === 'CANAL_DOCKYARD'
      ? { minY: 235, maxY: 305 }
      : undefined;

  // Solid opaque frame clear prevents any per-frame ghost smear on uncached/transparent areas
  ctx.fillStyle = islandBiome.palette.base;
  ctx.fillRect(0, 0, viewW, viewH);

  // Outer biome edge fill only needed for fixed 960x540 legacy islands on wide viewports
  if (!cam.isScrolling) {
    assets.layeredTilemap.renderBaseLayers(
      ctx,
      `island_outer_${islandMap.islandId}_${viewW}`,
      viewW,
      viewH,
      0,
      0,
      viewW,
      viewH,
      islandBiome,
      assets,
      tick,
      undefined,
      waterStripY
    );
  }

  ctx.save();
  ctx.translate(worldTransX, worldTransY);

  // Layers 0-2 Island Ground, Autotile Paths, Coastal Foam, Contact Shadows & Building Walls
  assets.layeredTilemap.renderBaseLayers(
    ctx,
    `island_${islandMap.islandId}`,
    islandMap.width,
    islandMap.height,
    Math.max(0, cam.camX),
    Math.max(0, cam.camY),
    viewW,
    viewH,
    islandBiome,
    assets,
    tick,
    islandMap.obstacles,
    waterStripY,
    islandMap.tileMap
  );

  // Port Exit & Online Battle Terminal Markers (Ground decals)
  const port = islandMap.portExitZone;
  ctx.save();
  ctx.fillStyle = 'rgba(14, 165, 233, 0.25)';
  ctx.beginPath();
  ctx.arc(port.pos.x, port.pos.y, port.radiusPx, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#38bdf8';
  ctx.lineWidth = 2;
  ctx.setLineDash([5, 4]);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.font = 'bold 10px monospace';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#7dd3fc';
  ctx.fillText('⚓ 항구 출구', port.pos.x, port.pos.y - 4);
  ctx.fillText('(바다 복귀)', port.pos.x, port.pos.y + 10);
  ctx.restore();

  const terminalPos = islandMap.battleTerminalPos ?? ISLAND_BATTLE_TERMINAL_POS;
  ctx.save();
  ctx.fillStyle = 'rgba(168, 85, 247, 0.28)';
  ctx.beginPath();
  ctx.arc(terminalPos.x, terminalPos.y, 22, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = '#c084fc';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(terminalPos.x - 10, terminalPos.y - 10, 20, 20);
  ctx.strokeStyle = '#38bdf8';
  ctx.strokeRect(terminalPos.x - 10, terminalPos.y - 10, 20, 20);
  ctx.font = 'bold 10px monospace';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#e9d5ff';
  ctx.fillText('🌐 대전 단말기', terminalPos.x, terminalPos.y - 26);
  ctx.restore();

  // Egghead Laser Barriers
  for (const barrier of islandMap.laserBarriers) {
    if (!isRectInBounds(islandBounds, barrier.x, barrier.y, barrier.width, barrier.height)) continue;
    const deactivated = runtime.deactivatedBarrierIds.includes(barrier.barrierId);
    ctx.save();
    if (!deactivated) {
      ctx.fillStyle = 'rgba(239, 68, 68, 0.45)';
      ctx.fillRect(barrier.x, barrier.y, barrier.width, barrier.height);
      ctx.strokeStyle = '#f43f5e';
      ctx.lineWidth = 3;
      ctx.strokeRect(barrier.x, barrier.y, barrier.width, barrier.height);
    } else {
      ctx.strokeStyle = 'rgba(74, 222, 128, 0.35)';
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(barrier.x, barrier.y, barrier.width, barrier.height);
    }
    ctx.restore();
  }

  // Footstep dust / water ripple / cyber spark decals
  assets.footstepParticles.stepAndRender(ctx, tick, islandBounds);

  // Layer 3: Y-Sorted Characters, Active Crew Follower, NPCs, Chests, Landmarks & Bosses
  SHARED_Y_SORT_QUEUE.reset();
  SHARED_LANTERN_POINTS.length = 0;
  enqueueIslandEntitiesLayer3(
    SHARED_Y_SORT_QUEUE,
    islandMap,
    state,
    runtime,
    gameRegistry,
    assets,
    tick,
    islandBounds,
    SHARED_LANTERN_POINTS
  );
  SHARED_Y_SORT_QUEUE.flush(ctx);

  // Layer 4: Overhanging Roofs, Tree Canopies & Landmark Arches/Sails (occludes characters behind)
  assets.layeredTilemap.renderOverheadLayer(
    ctx,
    `island_${islandMap.islandId}`,
    islandBiome,
    islandMap.obstacles.length,
    Math.max(0, cam.camX),
    Math.max(0, cam.camY),
    viewW,
    viewH
  );
  renderIslandLandmarksOverhead(ctx, islandMap, tick, islandBounds);

  // Building Labels rendered cleanly over roof tops
  ctx.save();
  ctx.font = 'bold 10px monospace';
  ctx.textAlign = 'center';
  for (const obs of islandMap.obstacles) {
    if (!obs.label || !isRectInBounds(islandBounds, obs.x, obs.y, obs.width, obs.height)) continue;
    const lx = Math.round(obs.x + obs.width * 0.5);
    const ly = Math.round(obs.y + 8);
    ctx.fillStyle = 'rgba(15, 23, 42, 0.78)';
    ctx.fillRect(lx - 52, ly - 10, 104, 13);
    ctx.fillStyle = '#e2e8f0';
    ctx.fillText(obs.label, lx, ly);
  }
  ctx.restore();

  if (worldMarkers && worldMarkers.length > 0) {
    renderWorldMarkerBeacons(ctx, worldMarkers, tick, highlightGoldMarker);
  }

  ctx.restore();

  // Layer 5: Pooled Biome Ambient Particles
  assets.ambientParticles.stepAndRender(
    ctx,
    islandBiome.biomeId,
    viewW,
    viewH,
    tick,
    islandMap.ambientProfile
  );

  // Layer 6: Atmospheric Time-of-Day Tint, Pre-Baked Glow Pools & Vignette (0 blur)
  const mood = resolveLightingMood(
    state,
    islandMap.theme,
    islandMap.lightingProfile?.defaultMood
  );
  assets.atmosphereLighting.render(
    ctx,
    mood,
    islandBiome.palette.accent,
    viewW,
    viewH,
    SHARED_LANTERN_POINTS,
    worldTransX,
    worldTransY,
    islandMap.lightingProfile
  );

  // Layer 7: Crisp Screen-Space HUD & Safe-Area Zone Banner
  renderIslandHeaderAndPromptHud(ctx, state, islandMap, episode, stepInfo, viewport, runtime);
}
