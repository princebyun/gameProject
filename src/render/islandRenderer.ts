import type { AssetLoader } from '../assets/assetLoader';
import { LOGICAL_HEIGHT, LOGICAL_WIDTH } from '../core/constants';
import {
  ISLAND_BATTLE_TERMINAL_POS,
  type IslandExplorationRuntime,
  type IslandStepOutput
} from '../core/rpg/episodeEngine';
import type { GameDataRegistry } from '../core/types/dataSchemas';
import type {
  RpgCampaignState,
  RpgDataRegistry
} from '../core/types/rpgSchemas';
import { resolveBiomeForIsland } from '../data/assets/assetManifestRegistry';
import {
  renderWorldMarkerBeacons,
  type WorldMarker
} from '../story/worldMarkerSystem';
import { renderIslandHeaderAndPromptHud } from './rpg/islandHudRenderer';
import {
  isCircleInBounds,
  isRectInBounds,
  type ViewportWorldBounds
} from './viewport/frustumCulling';
import {
  DEFAULT_VIEWPORT_METRICS,
  type ViewportMetrics
} from './viewport/responsiveViewportManager';
import { getSafeHudBounds } from './viewport/safeAreaLayout';

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
  const offsetX = safe.arenaOffsetX;
  const islandBounds: ViewportWorldBounds = {
    minX: -offsetX - 48,
    minY: -48,
    maxX: viewW - offsetX + 48,
    maxY: viewH + 48
  };

  // 1. Chunk-Cached Biome Autotile Tileset Backdrop across full Edge-to-Edge width
  const islandBiome = resolveBiomeForIsland(
    islandMap.islandId,
    assets.manifestRegistry
  );
  const waterStripY =
    islandMap.theme === 'CANAL_DOCKYARD' ? { minY: 235, maxY: 305 } : undefined;
  assets.tilemapRenderer.renderBiomeBackdrop(
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

  // Translate into centered deterministic 960x540 island coordinate space
  ctx.save();
  ctx.translate(offsetX, 0);
  assets.tilemapRenderer.renderBiomeBackdrop(
    ctx,
    `island_${islandMap.islandId}`,
    LOGICAL_WIDTH,
    LOGICAL_HEIGHT,
    0,
    0,
    LOGICAL_WIDTH,
    LOGICAL_HEIGHT,
    islandBiome,
    assets,
    tick,
    islandMap.obstacles,
    waterStripY
  );

  // 2. Port Exit Zone (Left Harbor)
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

  // 2.5 Harbor Online Battle Terminal (대전 단말기)
  ctx.save();
  ctx.fillStyle = 'rgba(168, 85, 247, 0.28)';
  ctx.beginPath();
  ctx.arc(
    ISLAND_BATTLE_TERMINAL_POS.x,
    ISLAND_BATTLE_TERMINAL_POS.y,
    22,
    0,
    Math.PI * 2
  );
  ctx.fill();
  ctx.strokeStyle = '#c084fc';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(
    ISLAND_BATTLE_TERMINAL_POS.x - 10,
    ISLAND_BATTLE_TERMINAL_POS.y - 10,
    20,
    20
  );
  ctx.strokeStyle = '#38bdf8';
  ctx.strokeRect(
    ISLAND_BATTLE_TERMINAL_POS.x - 10,
    ISLAND_BATTLE_TERMINAL_POS.y - 10,
    20,
    20
  );
  ctx.font = 'bold 10px monospace';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#e9d5ff';
  ctx.fillText(
    '🌐 대전 단말기',
    ISLAND_BATTLE_TERMINAL_POS.x,
    ISLAND_BATTLE_TERMINAL_POS.y - 26
  );
  ctx.restore();

  // 3. Obstacles & Buildings
  for (const obs of islandMap.obstacles) {
    if (!isRectInBounds(islandBounds, obs.x, obs.y, obs.width, obs.height)) continue;
    const ox = Math.round(obs.x);
    const oy = Math.round(obs.y);
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(ox, oy, obs.width, obs.height);
    ctx.strokeStyle = '#64748b';
    ctx.lineWidth = 2;
    ctx.strokeRect(ox, oy, obs.width, obs.height);

    if (obs.label) {
      ctx.font = 'bold 11px monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#e2e8f0';
      ctx.fillText(
        obs.label,
        Math.round(ox + obs.width * 0.5),
        Math.round(oy + obs.height * 0.5 + 4)
      );
    }
  }

  // 4. Giant-Scale Props (Wano Road Poneglyph & Elbaf Yggdrasil World Tree / Giant Sword)
  for (const prop of islandMap.giantProps) {
    const px = Math.round(prop.pos.x - prop.width * 0.5);
    const py = Math.round(prop.pos.y - prop.height * 0.5);
    if (!isRectInBounds(islandBounds, px, py, prop.width, prop.height)) continue;
    ctx.save();
    ctx.fillStyle = prop.color;
    ctx.fillRect(px, py, prop.width, prop.height);
    ctx.strokeStyle = '#fde047';
    ctx.lineWidth = 2.5;
    ctx.strokeRect(px, py, prop.width, prop.height);

    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(prop.label, Math.round(prop.pos.x), Math.round(prop.pos.y + 4));
    ctx.restore();
  }

  // 5. Egghead Laser Barriers & Puzzle Switches
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

      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(Math.round(barrier.x + barrier.width * 0.5), barrier.y);
      ctx.lineTo(
        Math.round(barrier.x + barrier.width * 0.5),
        barrier.y + barrier.height
      );
      ctx.stroke();
    } else {
      ctx.strokeStyle = 'rgba(74, 222, 128, 0.35)';
      ctx.setLineDash([4, 4]);
      ctx.strokeRect(barrier.x, barrier.y, barrier.width, barrier.height);
    }
    ctx.restore();
  }

  for (const sw of islandMap.puzzleSwitches) {
    const sx = Math.round(sw.pos.x);
    const sy = Math.round(sw.pos.y);
    if (!isCircleInBounds(islandBounds, sx, sy, 48)) continue;
    const activated = runtime.activatedSwitchIds.includes(sw.switchId);
    ctx.save();
    ctx.fillStyle = activated ? '#16a34a' : '#e11d48';
    ctx.beginPath();
    ctx.arc(sx, sy, 16, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = activated ? '#4ade80' : '#fda4af';
    ctx.fillText(
      activated ? `✓ ${sw.label} (해제됨)` : `⚙ ${sw.label}`,
      sx,
      sy - 22
    );
    ctx.restore();
  }

  // 6. NPCs (including Elbaf 2.35x Giant Warriors Dorry & Brogy)
  for (const npc of islandMap.npcs) {
    const r = Math.round(16 * npc.visualScale);
    const nx = Math.round(npc.pos.x);
    const ny = Math.round(npc.pos.y);
    if (!isCircleInBounds(islandBounds, nx, ny, r + 48)) continue;
    ctx.save();
    ctx.fillStyle = npc.color;
    ctx.beginPath();
    ctx.arc(nx, ny, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fde047';
    ctx.fillText(npc.name, nx, ny - r - 12);
    ctx.font = '9px monospace';
    ctx.fillStyle = '#cbd5e1';
    ctx.fillText(`<${npc.roleLabel}>`, nx, ny - r - 2);
    ctx.restore();
  }

  // 7. Boss / Enemy Encounters
  for (const enc of islandMap.encounters) {
    const ex = Math.round(enc.pos.x);
    const ey = Math.round(enc.pos.y);
    if (!isCircleInBounds(islandBounds, ex, ey, 56)) continue;
    const cleared = Boolean(state.episodeFlags[enc.setsFlagOnVictory]);
    ctx.save();
    const pulse = 22 + Math.sin(tick * 0.15) * 3;
    ctx.strokeStyle = cleared ? '#4ade80' : '#ef4444';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(ex, ey, pulse, 0, Math.PI * 2);
    ctx.stroke();

    const leadEnemyId = enc.enemyUnitIds[0];
    const bossUnit = leadEnemyId ? gameRegistry.units[leadEnemyId] : undefined;
    if (bossUnit) {
      const resolved = assets.getOrCreateUnitSpriteSheet(bossUnit, 'base', null);
      if (resolved.sheet) {
        const fw = resolved.entry.frameWidth;
        const fh = resolved.entry.frameHeight;
        const animClip = resolved.entry.animations.IDLE;
        const frameIdx =
          Math.floor((tick / 60) * animClip.fps) % Math.max(1, animClip.frames);
        ctx.drawImage(
          resolved.sheet,
          frameIdx * fw,
          animClip.row * fh,
          fw,
          fh,
          ex - 22,
          ey - 24,
          44,
          44
        );
      }
    }

    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = cleared ? '#4ade80' : '#fca5a5';
    ctx.fillText(
      cleared ? `✓ ${enc.name} (격파 완료)` : `⚔ BOSS: ${enc.name}`,
      ex,
      ey - 30
    );
    ctx.restore();
  }

  // 8. Player Character Avatar (Luffy / Party Leader)
  const leaderId = state.activePartyUnitIds[0] ?? 'luffy';
  const leaderDef = gameRegistry.units[leaderId] ?? gameRegistry.units['luffy'];
  ctx.save();
  ctx.strokeStyle = '#38bdf8';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(
    runtime.playerPos.x,
    runtime.playerPos.y,
    runtime.playerRadiusPx,
    0,
    Math.PI * 2
  );
  ctx.stroke();

  if (leaderDef) {
    const resolved = assets.getOrCreateUnitSpriteSheet(leaderDef, 'base', null);
    if (resolved.sheet) {
      const animClip = runtime.isMoving
        ? resolved.entry.animations.MOVE
        : resolved.entry.animations.IDLE;
      const frameIdx =
        Math.floor((tick / 60) * animClip.fps) % Math.max(1, animClip.frames);
      const fw = resolved.entry.frameWidth;
      const fh = resolved.entry.frameHeight;
      const drawW = fw;
      const drawH = fh;
      const facingX = Math.cos(runtime.playerHeadingRad) < -0.05 ? -1 : 1;
      const anchorX = Math.round(drawW * resolved.entry.anchor.x);
      const anchorY = Math.round(drawH * resolved.entry.anchor.y);
      ctx.save();
      ctx.translate(
        Math.round(runtime.playerPos.x),
        Math.round(runtime.playerPos.y + 10)
      );
      ctx.scale(facingX, 1);
      ctx.drawImage(
        resolved.sheet,
        frameIdx * fw,
        animClip.row * fh,
        fw,
        fh,
        -anchorX,
        -anchorY,
        drawW,
        drawH
      );
      ctx.restore();
    }
  }
  ctx.restore();

  // 8.5 Render GTA-style Gold(MAIN) / Blue(SIDE) / Silver(ACTIVITY) Beacons inside island space
  if (worldMarkers && worldMarkers.length > 0) {
    renderWorldMarkerBeacons(ctx, worldMarkers, tick, highlightGoldMarker);
  }

  // Exit centered island coordinate space before drawing screen-space Safe-Area HUDs
  ctx.restore();

  // 9-10. Compact Top-Left Header & Bottom Interaction Prompt HUD
  renderIslandHeaderAndPromptHud(ctx, state, islandMap, episode, stepInfo, viewport);
}
