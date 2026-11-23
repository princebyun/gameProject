import type { AssetLoader } from '../assets/assetLoader';
import { clamp, type Vec2 } from '../core/math/vector2';
import type { BattleWorldState } from '../core/types/battleState';
import type { GameDataRegistry } from '../core/types/dataSchemas';
import { resolveBiomeForArena } from '../data/assets/assetManifestRegistry';
import { renderUnitOnArena } from './battle/battleUnitRenderer';
import type { BattleBackdropContext } from './battle/parallaxBattleBackdrop';
import {
  renderArenaClashSparksAndFloatingTexts,
  renderArenaFloorZonesAndProjectiles
} from './battleArenaHazardsRenderer';
import type { RenderAccessibilitySettings } from './canvasRenderer';
import { lerpVecInto } from './pools/renderScratchPools';
import {
  computeArenaVisibleBounds,
  isCircleInBounds
} from './viewport/frustumCulling';
import {
  DEFAULT_VIEWPORT_METRICS,
  type ViewportMetrics
} from './viewport/responsiveViewportManager';

const SCRATCH_CAM_POS: Vec2 = { x: 0, y: 0 };
const SCRATCH_UNIT_POS: Vec2 = { x: 0, y: 0 };

export function computeArenaCameraOffset(
  world: BattleWorldState,
  alpha: number,
  settings: RenderAccessibilitySettings,
  cameraTargetIndex: 'ALL' | 0 | 1 | 2 | 3 = 'ALL',
  viewport: ViewportMetrics = DEFAULT_VIEWPORT_METRICS
): Vec2 {
  const viewW = viewport.viewWidth;
  const viewH = viewport.viewHeight;
  let focusX = world.arenaWidth * 0.5;
  let focusY = world.arenaHeight * 0.5;

  if (
    cameraTargetIndex !== 'ALL' &&
    world.units[cameraTargetIndex] &&
    world.units[cameraTargetIndex].isOnField
  ) {
    const tracked = world.units[cameraTargetIndex];
    const p = lerpVecInto(tracked.prevPos, tracked.pos, alpha, SCRATCH_CAM_POS);
    focusX = p.x;
    focusY = p.y;
  } else {
    let sx = 0;
    let sy = 0;
    let count = 0;
    for (let i = 0; i < world.units.length; i++) {
      const u = world.units[i];
      if (!u || !u.isOnField || !u.isAlive) continue;
      sx += u.prevPos.x + (u.pos.x - u.prevPos.x) * alpha;
      sy += u.prevPos.y + (u.pos.y - u.prevPos.y) * alpha;
      count += 1;
    }
    if (count > 0) {
      focusX = sx / count;
      focusY = sy / count;
    }
  }

  let camX = viewW * 0.5 - focusX;
  let camY = viewH * 0.5 - focusY;

  if (world.arenaWidth <= viewW) {
    camX = (viewW - world.arenaWidth) * 0.5;
  } else {
    camX = clamp(camX, viewW - world.arenaWidth - 24, 24);
  }

  if (world.arenaHeight <= viewH - 120) {
    camY = (viewH - world.arenaHeight) * 0.5 - 8;
  } else {
    camY = clamp(camY, viewH - world.arenaHeight - 76, 56);
  }

  if (world.screenShakeTimer > 0 && settings.shakeIntensity > 0) {
    const mag = world.screenShakeMagnitude * settings.shakeIntensity;
    const phase = world.tick * 1.9;
    camX += Math.sin(phase) * mag;
    camY += Math.cos(phase * 1.3) * mag;
  }

  return { x: Math.round(camX), y: Math.round(camY) };
}

export function renderBattleArena(
  ctx: CanvasRenderingContext2D,
  world: BattleWorldState,
  registry: GameDataRegistry,
  assets: AssetLoader,
  alpha: number,
  settings: RenderAccessibilitySettings,
  cameraTargetIndex: 'ALL' | 0 | 1 | 2 | 3 = 'ALL',
  viewport: ViewportMetrics = DEFAULT_VIEWPORT_METRICS,
  backdropContext?: BattleBackdropContext
): void {
  const viewW = viewport.viewWidth;
  const viewH = viewport.viewHeight;

  const arenaBiomeKey = world.impelDownHazard.active
    ? 'IMPEL_DOWN'
    : world.colosseumRingOut.active
      ? 'COLOSSEUM'
      : world.raidState.active
        ? world.raidState.raidId === 'raid_loki_ragnir'
          ? 'ELBAF'
          : world.raidState.raidId === 'raid_saturn_abyss'
            ? 'LAB'
            : 'COOP_RAID'
        : world.persistentZones.iceActive
          ? 'ICE'
          : world.persistentZones.magmaActive
            ? 'MAGMA'
            : 'DEFAULT';
  const arenaBiome = resolveBiomeForArena(arenaBiomeKey, assets.manifestRegistry);

  const cam = computeArenaCameraOffset(
    world,
    alpha,
    settings,
    cameraTargetIndex,
    viewport
  );
  let hasGiantBossOnField = false;
  for (let i = 0; i < world.units.length; i++) {
    const u = world.units[i];
    if (u && u.isOnField && u.isAlive && u.entityScale >= 1.6) {
      hasGiantBossOnField = true;
      break;
    }
  }
  const zoomScale = hasGiantBossOnField ? 0.88 : 1.0;

  // 1. Multi-layer 1280x540+ Parallax Battle Backdrop (Sky -> Mid -> Muted Arena Floor)
  const backdropEntry = assets.parallaxBackdrop.render(
    ctx,
    assets,
    {
      islandId: backdropContext?.islandId ?? null,
      seaZoneId: backdropContext?.seaZoneId ?? null,
      arenaMode: arenaBiomeKey
    },
    cam.x,
    cam.y,
    viewW,
    viewH,
    zoomScale
  );

  const visibleBounds = computeArenaVisibleBounds(
    cam.x,
    cam.y,
    viewW,
    viewH,
    zoomScale,
    64
  );

  ctx.save();
  if (zoomScale !== 1.0) {
    ctx.translate(Math.round(viewW * 0.5), Math.round(viewH * 0.5));
    ctx.scale(zoomScale, zoomScale);
    ctx.translate(-Math.round(viewW * 0.5), -Math.round(viewH * 0.5));
  }
  ctx.translate(cam.x, cam.y);

  // Persistent scorch / ice floor impact decals
  assets.parallaxBackdrop.recordExplosionDecals(world.vfxEvents);
  assets.parallaxBackdrop.renderGroundDecals(ctx);

  ctx.strokeStyle = 'rgba(250, 204, 21, 0.35)';
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, world.arenaWidth - 2, world.arenaHeight - 2);

  // 2~5. Arena floor zones, hazards, melee arcs, beams, and projectiles
  renderArenaFloorZonesAndProjectiles(ctx, world, registry, alpha, visibleBounds);

  // 6. On-field Units (Frustum culled)
  for (let i = 0; i < world.units.length; i++) {
    const unit = world.units[i];
    if (!unit || !unit.isOnField || !unit.isAlive) continue;
    const uPos = lerpVecInto(unit.prevPos, unit.pos, alpha, SCRATCH_UNIT_POS);
    const visRadius = unit.radiusPx * unit.entityScale * unit.visualScale + 52;
    if (!isCircleInBounds(visibleBounds, uPos.x, uPos.y, visRadius)) continue;
    renderUnitOnArena(ctx, unit, world, registry, assets, alpha, settings);
  }

  // 7~9. Pooled Sprite-Sheet VFX Atlases, clash sparks, and floating combat texts
  renderArenaClashSparksAndFloatingTexts(ctx, world, visibleBounds, assets);

  ctx.restore();

  // Subtle biome particles & time-of-day atmospheric wash
  assets.ambientParticles.stepAndRender(ctx, arenaBiome.biomeId, viewW, viewH, world.tick);
  assets.atmosphereLighting.render(
    ctx,
    backdropEntry.timeOfDay,
    backdropEntry.ambientTint,
    viewW,
    viewH
  );

  if (settings.flashEffectEnabled && world.screenFlashTimer > 0) {
    ctx.save();
    ctx.globalAlpha = Math.min(0.32, world.screenFlashTimer * 2);
    ctx.fillStyle = world.screenFlashColor;
    ctx.fillRect(0, 0, viewW, viewH);
    ctx.restore();
  }
}
