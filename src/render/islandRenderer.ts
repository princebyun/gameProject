import type { AssetLoader } from '../assets/assetLoader';
import { resolveFrameSourceAndDestRect } from '../assets/smartSpriteSheetLoader';
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
import { drawPixelNineSlicePanel } from './ui/pixelNineSliceUi';
import {
  DEFAULT_VIEWPORT_METRICS,
  type ViewportMetrics
} from './viewport/responsiveViewportManager';

const islandPlayerVisualState = {
  lastIslandId: '',
  lastX: 0,
  lastY: 0,
  facingX: 1 as 1 | -1,
  moveFrames: 0
};

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

  const viewW = viewport.viewWidth;
  const viewH = viewport.viewHeight;
  const { left: safeL, top: safeT, bottom: safeB } = viewport.safeInsets;
  const offsetX = viewport.arenaOffsetX;

  ctx.imageSmoothingEnabled = false;

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

  // 3. 2.5D Elevated Obstacles & Buildings (Drop Shadow + Shaded Front Wall + Roof Cap + Animated Flags/Torches)
  for (let oIdx = 0; oIdx < islandMap.obstacles.length; oIdx++) {
    const obs = islandMap.obstacles[oIdx];
    const wallH = Math.min(18, Math.max(8, Math.round(obs.height * 0.28)));
    const roofH = Math.max(6, obs.height - wallH);

    // 2.5D ground drop shadow
    ctx.fillStyle = 'rgba(5, 9, 18, 0.44)';
    ctx.fillRect(obs.x + 5, obs.y + 6, obs.width, obs.height);

    // Darker shaded front wall thickness (south face)
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(obs.x, obs.y + roofH, obs.width, wallH);
    ctx.fillStyle = '#334155';
    ctx.fillRect(obs.x + 2, obs.y + roofH, obs.width - 4, wallH - 2);
    // Warm lit pixel windows / masonry on front wall
    ctx.fillStyle = '#f59e0b';
    for (let wx = obs.x + 10; wx < obs.x + obs.width - 14; wx += 22) {
      ctx.fillRect(wx, obs.y + roofH + 3, 6, Math.max(4, wallH - 7));
    }

    // Top roof face with sunlit rim highlight
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(obs.x, obs.y, obs.width, roofH);
    ctx.fillStyle = '#475569';
    ctx.fillRect(obs.x + 2, obs.y + 2, obs.width - 4, 3);
    ctx.strokeStyle = '#64748b';
    ctx.lineWidth = 2;
    ctx.strokeRect(obs.x, obs.y, obs.width, obs.height);

    // Animated fluttering pirate/town pennant flag on first 2 buildings
    if (oIdx < 2) {
      const fx = Math.round(obs.x + obs.width - 12);
      const fy = Math.round(obs.y - 16);
      const wave = Math.round(Math.sin(tick * 0.14 + oIdx) * 2);
      ctx.fillStyle = '#e2e8f0';
      ctx.fillRect(fx, fy, 2, 18);
      ctx.fillStyle = oIdx === 0 ? '#ef4444' : '#38bdf8';
      ctx.fillRect(fx + 2, fy + 1, 7, 7);
      ctx.fillRect(fx + 9, fy + 1 + wave, 6, 6);
    }

    if (obs.label) {
      ctx.font = 'bold 11px monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#090d16';
      ctx.fillText(
        obs.label,
        obs.x + obs.width * 0.5 + 1,
        obs.y + roofH * 0.5 + 5
      );
      ctx.fillStyle = '#f8fafc';
      ctx.fillText(
        obs.label,
        obs.x + obs.width * 0.5,
        obs.y + roofH * 0.5 + 4
      );
    }
  }

  // 3.5 Animated Swaying Pixel Grass Tufts & Flickering Harbor Torches
  ctx.save();
  const swayPx = Math.round(Math.sin(tick * 0.1) * 1.5);
  for (let g = 0; g < 14; g++) {
    const gx = 92 + ((g * 173 + islandMap.islandId.length * 41) % (LOGICAL_WIDTH - 180));
    const gy = 84 + ((g * 107 + islandMap.islandId.length * 29) % (LOGICAL_HEIGHT - 160));
    ctx.fillStyle = 'rgba(22, 163, 74, 0.55)';
    ctx.fillRect(gx, gy, 2, 4);
    ctx.fillRect(gx + 3, gy + 1, 2, 3);
    ctx.fillStyle = 'rgba(74, 222, 128, 0.65)';
    ctx.fillRect(gx + swayPx, gy - 2, 2, 2);
    ctx.fillRect(gx + 3 + swayPx, gy - 1, 2, 2);
  }
  // Flickering torches flanking the harbor exit
  const torchFlicker = (tick % 6) < 3 ? 0 : 1;
  for (const tyOff of [-26, 26]) {
    const tx = Math.round(port.pos.x + 28);
    const ty = Math.round(port.pos.y + tyOff);
    ctx.fillStyle = '#78350f';
    ctx.fillRect(tx - 1, ty, 3, 10);
    ctx.fillStyle = '#f97316';
    ctx.fillRect(tx - 3, ty - 6 - torchFlicker, 7, 7);
    ctx.fillStyle = '#fef08a';
    ctx.fillRect(tx - 1, ty - 4 - torchFlicker, 3, 4);
  }
  ctx.restore();

  // 4. Giant-Scale 2.5D Props (Wano Road Poneglyph & Elbaf Yggdrasil World Tree / Giant Sword)
  for (const prop of islandMap.giantProps) {
    const px = prop.pos.x - prop.width * 0.5;
    const py = prop.pos.y - prop.height * 0.5;
    ctx.save();
    // Drop shadow
    ctx.fillStyle = 'rgba(5, 9, 18, 0.48)';
    ctx.fillRect(px + 6, py + 8, prop.width, prop.height);
    // Main monument body + 2.5D lower plinth
    ctx.fillStyle = prop.color;
    ctx.fillRect(px, py, prop.width, prop.height);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.30)';
    ctx.fillRect(px, py + prop.height - 12, prop.width, 12);
    ctx.fillStyle = 'rgba(255, 255, 255, 0.16)';
    ctx.fillRect(px + 3, py + 3, prop.width - 6, 4);

    ctx.strokeStyle = '#fde047';
    ctx.lineWidth = 2.5;
    ctx.strokeRect(px, py, prop.width, prop.height);

    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(prop.label, prop.pos.x, prop.pos.y + 4);
    ctx.restore();
  }

  // 5. Egghead Laser Barriers & Puzzle Switches
  for (const barrier of islandMap.laserBarriers) {
    const deactivated = runtime.deactivatedBarrierIds.includes(barrier.barrierId);
    ctx.save();
    if (!deactivated) {
      ctx.fillStyle = 'rgba(239, 68, 68, 0.45)';
      ctx.fillRect(barrier.x, barrier.y, barrier.width, barrier.height);
      ctx.strokeStyle = '#f43f5e';
      ctx.lineWidth = 3;
      ctx.strokeRect(barrier.x, barrier.y, barrier.width, barrier.height);

      // Pulsing core laser line
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(barrier.x + barrier.width * 0.5, barrier.y);
      ctx.lineTo(
        barrier.x + barrier.width * 0.5,
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
    const activated = runtime.activatedSwitchIds.includes(sw.switchId);
    ctx.save();
    ctx.fillStyle = activated ? '#16a34a' : '#e11d48';
    ctx.beginPath();
    ctx.arc(sw.pos.x, sw.pos.y, 16, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = activated ? '#4ade80' : '#fda4af';
    ctx.fillText(
      activated ? `✓ ${sw.label} (해제됨)` : `⚙ ${sw.label}`,
      sw.pos.x,
      sw.pos.y - 22
    );
    ctx.restore();
  }

  // 6. NPCs (including Elbaf 2.35x Giant Warriors Dorry & Brogy)
  for (const npc of islandMap.npcs) {
    ctx.save();
    const r = Math.round(16 * npc.visualScale);
    ctx.fillStyle = npc.color;
    ctx.beginPath();
    ctx.arc(npc.pos.x, npc.pos.y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fde047';
    ctx.fillText(npc.name, npc.pos.x, npc.pos.y - r - 12);
    ctx.font = '9px monospace';
    ctx.fillStyle = '#cbd5e1';
    ctx.fillText(`<${npc.roleLabel}>`, npc.pos.x, npc.pos.y - r - 2);
    ctx.restore();
  }

  // 7. Boss / Enemy Encounters
  for (const enc of islandMap.encounters) {
    const cleared = Boolean(state.episodeFlags[enc.setsFlagOnVictory]);
    ctx.save();
    const pulse = 22 + Math.sin(tick * 0.15) * 3;
    ctx.strokeStyle = cleared ? '#4ade80' : '#ef4444';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(enc.pos.x, enc.pos.y, pulse, 0, Math.PI * 2);
    ctx.stroke();

    const bossUnit = gameRegistry.units[enc.enemyUnitIds[0]];
    if (bossUnit) {
      const sprite = assets.getOrCreateUnitSprite(bossUnit, 'BASE', null);
      if (sprite) {
        ctx.drawImage(sprite, enc.pos.x - 20, enc.pos.y - 20, 40, 40);
      }
    }

    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = cleared ? '#4ade80' : '#fca5a5';
    ctx.fillText(
      cleared ? `✓ ${enc.name} (격파 완료)` : `⚔ BOSS: ${enc.name}`,
      enc.pos.x,
      enc.pos.y - 30
    );
    ctx.restore();
  }

  // 8. Player Character Avatar (Luffy / Party Leader with ground shadow, flipX facing & walk bounce)
  const leaderId = state.activePartyUnitIds[0] ?? 'luffy';
  const leaderDef = gameRegistry.units[leaderId] ?? gameRegistry.units['luffy'];

  if (islandPlayerVisualState.lastIslandId !== runtime.islandId) {
    islandPlayerVisualState.lastIslandId = runtime.islandId;
    islandPlayerVisualState.lastX = runtime.playerPos.x;
    islandPlayerVisualState.lastY = runtime.playerPos.y;
    islandPlayerVisualState.facingX = 1;
    islandPlayerVisualState.moveFrames = 0;
  }
  const dx = runtime.playerPos.x - islandPlayerVisualState.lastX;
  const dy = runtime.playerPos.y - islandPlayerVisualState.lastY;
  const isMoving = Math.hypot(dx, dy) > 0.35;
  if (Math.abs(dx) > 0.25) {
    islandPlayerVisualState.facingX = dx < 0 ? -1 : 1;
  }
  islandPlayerVisualState.lastX = runtime.playerPos.x;
  islandPlayerVisualState.lastY = runtime.playerPos.y;
  islandPlayerVisualState.moveFrames = isMoving
    ? islandPlayerVisualState.moveFrames + 1
    : 0;

  ctx.save();
  // Ground contact shadow ellipse directly under Luffy's feet
  ctx.fillStyle = 'rgba(5, 9, 18, 0.44)';
  ctx.beginPath();
  ctx.ellipse(
    Math.round(runtime.playerPos.x),
    Math.round(runtime.playerPos.y + 8),
    15,
    5,
    0,
    0,
    Math.PI * 2
  );
  ctx.fill();

  // Subtle player position ring
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.72)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.ellipse(
    Math.round(runtime.playerPos.x),
    Math.round(runtime.playerPos.y + 8),
    runtime.playerRadiusPx,
    Math.round(runtime.playerRadiusPx * 0.48),
    0,
    0,
    Math.PI * 2
  );
  ctx.stroke();

  if (leaderDef) {
    const resolved = assets.getOrCreateUnitSpriteSheet(leaderDef, 'base', null);
    if (resolved.sheet) {
      const animState = isMoving ? 'MOVE' : 'IDLE';
      const clip = resolved.entry.animations[animState];
      const frameIdx = Math.floor((tick / 60) * clip.fps) % Math.max(1, clip.frames);
      const targetHeight = 52;
      const drawScale = targetHeight / resolved.entry.frameHeight;
      const rects = resolveFrameSourceAndDestRect(
        resolved.entry,
        resolved.meta,
        animState,
        clip.row,
        frameIdx,
        resolved.sheetFrameWidth,
        resolved.sheetFrameHeight,
        drawScale
      );
      const walkBounceY = isMoving
        ? -Math.round(Math.abs(Math.sin(islandPlayerVisualState.moveFrames * 0.34)) * 2.6)
        : 0;
      const walkTilt =
        isMoving && rects.synthesizedFromIdle
          ? Math.sin(islandPlayerVisualState.moveFrames * 0.34) * 0.06
          : 0;

      ctx.save();
      ctx.imageSmoothingEnabled = false;
      ctx.translate(
        Math.round(runtime.playerPos.x),
        Math.round(runtime.playerPos.y + 10 + walkBounceY)
      );
      ctx.scale(islandPlayerVisualState.facingX, 1);
      if (walkTilt !== 0) ctx.rotate(walkTilt);
      ctx.drawImage(
        resolved.sheet,
        rects.srcX,
        rects.srcY,
        rects.srcW,
        rects.srcH,
        rects.destX,
        rects.destY,
        rects.destW,
        rects.destH
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

  // 9. Top Episode Header & Quest Objective Checklist HUD (9-Slice Pirate-Wood RPG Frame, Safe Area)
  const hudX = 10 + safeL;
  const hudY = 10 + safeT;
  drawPixelNineSlicePanel(ctx, hudX, hudY, 424, 88, 'pirate_wood');

  ctx.font = 'bold 12px monospace';
  ctx.textAlign = 'left';
  ctx.fillStyle = '#fde047';
  ctx.fillText(`🏝 ${islandMap.name}`, hudX + 10, hudY + 19);

  if (episode) {
    const epCompleted = state.completedEpisodes.includes(episode.episodeId);
    ctx.font = 'bold 10px monospace';
    ctx.fillStyle = epCompleted ? '#4ade80' : '#38bdf8';
    ctx.fillText(
      epCompleted ? `★ ${episode.title} [클리어 완료!]` : episode.title,
      hudX + 10,
      hudY + 35
    );

    ctx.font = '10px monospace';
    episode.steps.forEach((st, idx) => {
      const done = Boolean(state.episodeFlags[st.requiredFlag]);
      ctx.fillStyle = done ? '#4ade80' : '#e2e8f0';
      const prefix = done ? '✓' : '▶';
      ctx.fillText(`${prefix} ${st.title}`, hudX + 10, hudY + 51 + idx * 13);
    });
  }

  // 10. Bottom Interaction Prompt Bar (centered in full viewWidth, respecting Safe Area bottom)
  const cx = viewW * 0.5;
  const py = viewH - 44 - safeB;
  drawPixelNineSlicePanel(ctx, cx - 214, py, 428, 36, 'navy_hud');

  ctx.font = 'bold 11px monospace';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#fde047';

  if (stepInfo.nearbySwitch) {
    ctx.fillText(
      `⚙ [E / Space / 상호작용] "${stepInfo.nearbySwitch.label}" 작동 (레이저 배리어 해제)`,
      cx,
      py + 21
    );
  } else if (stepInfo.nearbyNpc) {
    ctx.fillText(
      `💬 [E / Space / 상호작용] "${stepInfo.nearbyNpc.name}"와(과) 대화하기`,
      cx,
      py + 21
    );
  } else if (stepInfo.nearbyEncounter) {
    ctx.fillText(
      `⚔ [E / Space / 상호작용] "${stepInfo.nearbyEncounter.name}" 보스전 돌입!`,
      cx,
      py + 21
    );
  } else if (stepInfo.atBattleTerminal) {
    ctx.fillText(
      `🌐 [E / Space / 상호작용] 항구 대전 단말기 접속 (온라인 통신 대전 — 아이템 금지 & HP/PP 무손실)`,
      cx,
      py + 21
    );
  } else if (stepInfo.atPortExit) {
    ctx.fillText(
      `⚓ [E / Space / 상호작용] 항구 출구 — 직전 해역(${state.lastDockedPort.zoneId}) 바다로 복귀`,
      cx,
      py + 21
    );
  } else {
    ctx.fillStyle = '#cbd5e1';
    ctx.fillText(
      `[WASD/방향키] 섬 탐험 이동 | [E/Space] NPC 대화·퍼즐 스위치·보스전·항구 출구`,
      cx,
      py + 21
    );
  }
}
