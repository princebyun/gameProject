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
import {
  DEFAULT_VIEWPORT_METRICS,
  type ViewportMetrics
} from './viewport/responsiveViewportManager';

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

  // 3. Obstacles & Buildings
  for (const obs of islandMap.obstacles) {
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(obs.x, obs.y, obs.width, obs.height);
    ctx.strokeStyle = '#64748b';
    ctx.lineWidth = 2;
    ctx.strokeRect(obs.x, obs.y, obs.width, obs.height);

    if (obs.label) {
      ctx.font = 'bold 11px monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#e2e8f0';
      ctx.fillText(
        obs.label,
        obs.x + obs.width * 0.5,
        obs.y + obs.height * 0.5 + 4
      );
    }
  }

  // 4. Giant-Scale Props (Wano Road Poneglyph & Elbaf Yggdrasil World Tree / Giant Sword)
  for (const prop of islandMap.giantProps) {
    ctx.save();
    ctx.fillStyle = prop.color;
    ctx.fillRect(
      prop.pos.x - prop.width * 0.5,
      prop.pos.y - prop.height * 0.5,
      prop.width,
      prop.height
    );
    ctx.strokeStyle = '#fde047';
    ctx.lineWidth = 2.5;
    ctx.strokeRect(
      prop.pos.x - prop.width * 0.5,
      prop.pos.y - prop.height * 0.5,
      prop.width,
      prop.height
    );

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
      const idleClip = resolved.entry.animations.IDLE;
      const frameIdx = Math.floor((tick / 60) * idleClip.fps) % idleClip.frames;
      const fw = resolved.entry.frameWidth;
      const fh = resolved.entry.frameHeight;
      const drawW = 44;
      const drawH = 44;
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(
        resolved.sheet,
        frameIdx * fw,
        idleClip.row * fh,
        fw,
        fh,
        Math.round(runtime.playerPos.x - drawW * resolved.entry.anchor.x),
        Math.round(runtime.playerPos.y - drawH * resolved.entry.anchor.y + 8),
        drawW,
        drawH
      );
    }
  }
  ctx.restore();

  // 8.5 Render GTA-style Gold(MAIN) / Blue(SIDE) / Silver(ACTIVITY) Beacons inside island space
  if (worldMarkers && worldMarkers.length > 0) {
    renderWorldMarkerBeacons(ctx, worldMarkers, tick, highlightGoldMarker);
  }

  // Exit centered island coordinate space before drawing screen-space Safe-Area HUDs
  ctx.restore();

  // 9. Top Episode Header & Quest Objective Checklist HUD (respecting Safe Area)
  const hudX = 10 + safeL;
  const hudY = 10 + safeT;
  ctx.fillStyle = 'rgba(15, 23, 42, 0.90)';
  ctx.fillRect(hudX, hudY, 420, 86);
  ctx.strokeStyle = '#facc15';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(hudX, hudY, 420, 86);

  ctx.font = 'bold 12px monospace';
  ctx.textAlign = 'left';
  ctx.fillStyle = '#fde047';
  ctx.fillText(`🏝 ${islandMap.name}`, hudX + 8, hudY + 17);

  if (episode) {
    const epCompleted = state.completedEpisodes.includes(episode.episodeId);
    ctx.font = 'bold 10px monospace';
    ctx.fillStyle = epCompleted ? '#4ade80' : '#38bdf8';
    ctx.fillText(
      epCompleted ? `★ ${episode.title} [클리어 완료!]` : episode.title,
      hudX + 8,
      hudY + 33
    );

    ctx.font = '10px monospace';
    episode.steps.forEach((st, idx) => {
      const done = Boolean(state.episodeFlags[st.requiredFlag]);
      ctx.fillStyle = done ? '#4ade80' : '#e2e8f0';
      const prefix = done ? '✓' : '▶';
      ctx.fillText(`${prefix} ${st.title}`, hudX + 8, hudY + 49 + idx * 13);
    });
  }

  // 10. Bottom Interaction Prompt Bar (centered in full viewWidth, respecting Safe Area bottom)
  const cx = viewW * 0.5;
  const py = viewH - 44 - safeB;
  ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
  ctx.fillRect(cx - 210, py, 420, 34);
  ctx.strokeStyle = '#38bdf8';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(cx - 210, py, 420, 34);

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
