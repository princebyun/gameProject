import type { IslandExplorationRuntime } from '../../core/rpg/episodeEngine';
import { getChestWorldCenter } from '../../core/rpg/islandLivingVillage';
import type { FormDefinition, GameDataRegistry, UnitDefinition } from '../../core/types/dataSchemas';
import type { IslandMapDefinition, RpgCampaignState } from '../../core/types/rpgSchemas';
import type { SpriteSheetManifestEntry } from '../../data/assets/types';
import { isCircleInBounds, isRectInBounds, type ViewportWorldBounds } from '../viewport/frustumCulling';
import type { LanternLightPoint } from './atmosphereLightingOverlay';
import {
  drawIslandTreasureChest,
  drawNpcAmbientBubble,
  enqueueIslandLandmarksLayer3
} from './islandLandmarksDrawer';
import { drawCompactFootShadow, type IslandYSortQueue } from './islandYSortQueue';

export interface IslandSpriteProvider {
  getOrCreateUnitSpriteSheet(
    unit: UnitDefinition,
    activeFormId?: string | null,
    formDef?: FormDefinition | null
  ): {
    entry: SpriteSheetManifestEntry;
    sheet: HTMLImageElement | HTMLCanvasElement | null;
  };
}

const KNOWN_UNIT_KEYS = [
  'luffy', 'zoro', 'nami', 'usopp', 'sanji', 'chopper', 'robin', 'franky',
  'brook', 'jinbe', 'law', 'marco', 'lucci', 'kaku', 'blueno', 'buggy',
  'morgan', 'smoker', 'arlong', 'crocodile', 'enel', 'doflamingo', 'katakuri',
  'kaido', 'kizaru', 'saturn', 'loki', 'magellan', 'wapol', 'moria', 'hody_jones'
] as const;

function matchNpcUnit(npcId: string, registry: GameDataRegistry): UnitDefinition | undefined {
  const lower = npcId.toLowerCase();
  for (let i = 0; i < KNOWN_UNIT_KEYS.length; i++) {
    const uid = KNOWN_UNIT_KEYS[i];
    if (uid && lower.includes(uid) && registry.units[uid]) {
      return registry.units[uid];
    }
  }
  return undefined;
}

function drawCrispChibiNpc(
  ctx: CanvasRenderingContext2D,
  nx: number,
  footY: number,
  color: string,
  scale: number,
  tick: number,
  idx: number
): void {
  const s = Math.max(0.85, scale);
  const w = Math.round(16 * s);
  const h = Math.round(24 * s);
  const bob = ((Math.floor(tick / 20) + idx) % 2) * 1;
  const x = Math.round(nx - w * 0.5);
  const y = Math.round(footY - h + bob);

  // Dark 1px outer silhouette (#111118)
  ctx.fillStyle = '#111118';
  ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
  // Hair & Head (top ~45%)
  const headH = Math.round(h * 0.45);
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(x, y, w, Math.round(headH * 0.42));
  ctx.fillStyle = '#f5cfa0';
  ctx.fillRect(x + 1, y + Math.round(headH * 0.36), w - 2, Math.round(headH * 0.64));
  // Crisp pixel eyes
  ctx.fillStyle = '#111118';
  ctx.fillRect(x + Math.round(w * 0.25), y + Math.round(headH * 0.62), 2, 2);
  ctx.fillRect(x + Math.round(w * 0.62), y + Math.round(headH * 0.62), 2, 2);
  // Tunic & Legs (bottom ~55%)
  ctx.fillStyle = color;
  ctx.fillRect(x, y + headH, w, Math.round(h * 0.35));
  ctx.fillStyle = '#334155';
  ctx.fillRect(x + 2, y + headH + Math.round(h * 0.35), w - 4, Math.max(3, Math.round(h * 0.2)));
}

function drawUnitOverworldSprite(
  ctx: CanvasRenderingContext2D,
  sheet: HTMLImageElement | HTMLCanvasElement,
  entry: SpriteSheetManifestEntry,
  worldX: number,
  footY: number,
  isMoving: boolean,
  facingX: 1 | -1,
  scaleMult: number,
  tick: number
): void {
  const clip = isMoving ? entry.animations.MOVE : entry.animations.IDLE;
  const frameIdx = Math.floor((tick / 60) * clip.fps) % Math.max(1, clip.frames);
  const rect = clip.frameRects?.[frameIdx];
  const sx = rect ? rect.x : frameIdx * entry.frameWidth;
  const sy = rect ? rect.y : clip.row * entry.frameHeight;
  const fw = rect ? rect.w : entry.frameWidth;
  const fh = rect ? rect.h : entry.frameHeight;
  const drawH = Math.round(44 * scaleMult);
  const drawW = Math.round((fw / Math.max(1, fh)) * drawH);
  const ax = rect ? Math.round((rect.pivotX / Math.max(1, fw)) * drawW) : Math.round(drawW * entry.anchor.x);
  const ay = rect ? Math.round((rect.pivotY / Math.max(1, fh)) * drawH) : Math.round(drawH * entry.anchor.y);

  ctx.save();
  ctx.translate(Math.round(worldX), Math.round(footY));
  ctx.scale(facingX, 1);
  ctx.drawImage(sheet, sx, sy, fw, fh, -ax, -ay, drawW, drawH);
  ctx.restore();
}

export function enqueueIslandEntitiesLayer3(
  queue: IslandYSortQueue,
  islandMap: IslandMapDefinition,
  state: RpgCampaignState,
  runtime: IslandExplorationRuntime,
  gameRegistry: GameDataRegistry,
  sprites: IslandSpriteProvider,
  tick: number,
  bounds: ViewportWorldBounds,
  lanternPoints: LanternLightPoint[]
): void {
  // 1. Lighting Points (explicit hub lanterns or legacy 3 streetlamps)
  if (islandMap.lightingProfile?.lanterns && islandMap.lightingProfile.lanterns.length > 0) {
    const ts = islandMap.tileMap?.tileSize ?? 32;
    for (let i = 0; i < islandMap.lightingProfile.lanterns.length; i++) {
      const l = islandMap.lightingProfile.lanterns[i];
      if (!l) continue;
      lanternPoints.push({
        x: l.tileX * ts + ts * 0.5,
        y: l.tileY * ts + ts * 0.3,
        color: l.color,
        radiusPx: l.radiusPx
      });
    }
  } else {
    const lampPositions: readonly [number, number][] = [
      [168, 232],
      [438, 224],
      [712, 236]
    ];
    for (let i = 0; i < lampPositions.length; i++) {
      const lp = lampPositions[i];
      if (!lp) continue;
      const lx = lp[0];
      const ly = lp[1];
      lanternPoints.push({ x: lx, y: ly - 30 });
      queue.push(ly, (ctx) => {
        drawCompactFootShadow(ctx, lx, ly, 7, 3);
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(lx - 2, ly - 32, 4, 32);
        ctx.fillStyle = '#475569';
        ctx.fillRect(lx - 4, ly - 35, 8, 4);
        ctx.fillStyle = '#38bdf8';
        ctx.fillRect(lx - 3, ly - 31, 6, 5);
      });
    }
  }

  // 1b. Architectural Landmarks (Windmill, Fountain, Cranes, Torii, Lanterns, Glass Dome, etc.)
  enqueueIslandLandmarksLayer3(queue, islandMap, tick, bounds);

  // 1c. Hidden Treasure Chests
  if (islandMap.chests && islandMap.chests.length > 0) {
    const openedSet = new Set(state.openedChestIds ?? []);
    const hasNavigator = Boolean(state.assignedCrewRoles.NAVIGATOR);
    const ts = islandMap.tileMap?.tileSize ?? 32;
    for (let i = 0; i < islandMap.chests.length; i++) {
      const chest = islandMap.chests[i];
      if (!chest) continue;
      const center = getChestWorldCenter(chest, ts);
      const footY = Math.round(center.y + 8);
      if (!isCircleInBounds(bounds, center.x, footY, 36)) continue;
      const opened = openedSet.has(chest.chestId);
      queue.push(footY, (ctx) => {
        drawIslandTreasureChest(ctx, chest, center.x, footY, opened, hasNavigator, tick);
      });
    }
  }

  // 2. Giant Props (Poneglyph / World Tree / Giant Sword)
  for (const prop of islandMap.giantProps) {
    const px = Math.round(prop.pos.x - prop.width * 0.5);
    const py = Math.round(prop.pos.y - prop.height * 0.5);
    if (!isRectInBounds(bounds, px, py, prop.width, prop.height)) continue;
    const footY = py + prop.height;
    queue.push(footY, (ctx) => {
      drawCompactFootShadow(ctx, prop.pos.x, footY, Math.round(prop.width * 0.52), 7);
      ctx.fillStyle = prop.color;
      ctx.fillRect(px, py, prop.width, prop.height);
      ctx.strokeStyle = '#fde047';
      ctx.lineWidth = 2;
      ctx.strokeRect(px, py, prop.width, prop.height);
      ctx.font = 'bold 10px monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#ffffff';
      ctx.fillText(prop.label, Math.round(prop.pos.x), Math.round(prop.pos.y + 4));
    });
  }

  // 3. Puzzle Switches
  for (const sw of islandMap.puzzleSwitches) {
    const sx = Math.round(sw.pos.x);
    const sy = Math.round(sw.pos.y);
    if (!isCircleInBounds(bounds, sx, sy, 48)) continue;
    const activated = runtime.activatedSwitchIds.includes(sw.switchId);
    queue.push(sy + 14, (ctx) => {
      drawCompactFootShadow(ctx, sx, sy + 14, 14, 5);
      ctx.fillStyle = activated ? '#16a34a' : '#e11d48';
      ctx.fillRect(sx - 12, sy - 10, 24, 20);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(sx - 12, sy - 10, 24, 20);
      ctx.font = 'bold 10px monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = activated ? '#4ade80' : '#fda4af';
      ctx.fillText(activated ? `✓ ${sw.label}` : `⚙ ${sw.label}`, sx, sy - 16);
    });
  }

  // 4. NPCs (patrol-aware positions, facing, walk animation & proximity ambient speech bubbles)
  for (let i = 0; i < islandMap.npcs.length; i++) {
    const npc = islandMap.npcs[i];
    if (!npc) continue;
    const liveState = runtime.npcStates?.[npc.npcId];
    const npcPos = liveState?.pos ?? npc.pos;
    const nx = Math.round(npcPos.x);
    const footY = Math.round(npcPos.y + 12);
    if (!isCircleInBounds(bounds, nx, footY, 64)) continue;
    const faceDir: 1 | -1 = (liveState?.facing ?? npc.facing) === 'left' ? -1 : 1;
    const npcMoving = Boolean(liveState?.isMoving);
    const showBubble =
      Boolean(npc.ambientBubbleText) &&
      !runtime.activeDialogueNpc &&
      Math.hypot(runtime.playerPos.x - npcPos.x, runtime.playerPos.y - npcPos.y) <= 115;
    const npcUnit = matchNpcUnit(npc.spriteKey ?? npc.npcId, gameRegistry);

    queue.push(footY, (ctx) => {
      const shR = Math.round(12 * npc.visualScale);
      drawCompactFootShadow(ctx, nx, footY, shR, Math.max(4, Math.round(4 * npc.visualScale)));
      const res = npcUnit ? sprites.getOrCreateUnitSpriteSheet(npcUnit, 'base', null) : null;
      if (res?.sheet) {
        drawUnitOverworldSprite(
          ctx,
          res.sheet,
          res.entry,
          nx,
          footY,
          npcMoving,
          faceDir,
          npc.visualScale,
          tick + i * 7
        );
      } else {
        drawCrispChibiNpc(ctx, nx, footY, npc.color, npc.visualScale, tick, i);
      }
      const labelY = Math.round(footY - 40 * npc.visualScale - 4);
      ctx.font = 'bold 10px monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(15, 23, 42, 0.78)';
      ctx.fillRect(nx - 48, labelY - 12, 96, 14);
      ctx.fillStyle = '#fde047';
      ctx.fillText(npc.name, nx, labelY - 1);
      if (showBubble && npc.ambientBubbleText) {
        drawNpcAmbientBubble(ctx, nx, labelY - 15, npc.ambientBubbleText);
      }
    });
  }

  // 5. Boss / Enemy Encounters
  for (const enc of islandMap.encounters) {
    const ex = Math.round(enc.pos.x);
    const footY = Math.round(enc.pos.y + 14);
    if (!isCircleInBounds(bounds, ex, footY, 64)) continue;
    const cleared = Boolean(state.episodeFlags[enc.setsFlagOnVictory]);
    const leadId = enc.enemyUnitIds[0];
    const bossUnit = leadId ? gameRegistry.units[leadId] : undefined;
    queue.push(footY, (ctx) => {
      const pulse = 20 + Math.sin(tick * 0.15) * 3;
      ctx.save();
      ctx.strokeStyle = cleared ? '#4ade80' : '#ef4444';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(ex, footY - 2, pulse, Math.round(pulse * 0.42), 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
      drawCompactFootShadow(ctx, ex, footY, 16, 5);
      if (bossUnit) {
        const res = sprites.getOrCreateUnitSpriteSheet(bossUnit, 'base', null);
        if (res.sheet) {
          drawUnitOverworldSprite(ctx, res.sheet, res.entry, ex, footY, false, -1, 1.15, tick);
        }
      }
      ctx.font = 'bold 10px monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = cleared ? '#4ade80' : '#fca5a5';
      ctx.fillText(cleared ? `✓ ${enc.name}` : `⚔ BOSS: ${enc.name}`, ex, footY - 52);
    });
  }

  // 6. Active Crew Follower trailing 1 tile behind player (reso.jhcloud.kr touch!)
  const followerId = state.activePartyUnitIds[1];
  const followerDef = followerId ? gameRegistry.units[followerId] : undefined;
  if (followerDef) {
    const fx = Math.round(runtime.playerPos.x - Math.cos(runtime.playerHeadingRad) * 28);
    const fy = Math.round(runtime.playerPos.y - Math.sin(runtime.playerHeadingRad) * 22 + 12);
    const faceF: 1 | -1 = Math.cos(runtime.playerHeadingRad) < -0.05 ? -1 : 1;
    queue.push(fy, (ctx) => {
      drawCompactFootShadow(ctx, fx, fy, 11, 4);
      const res = sprites.getOrCreateUnitSpriteSheet(followerDef, 'base', null);
      if (res.sheet) {
        drawUnitOverworldSprite(ctx, res.sheet, res.entry, fx, fy, Boolean(runtime.isMoving), faceF, 0.92, tick + 6);
      }
    });
  }

  // 7. Player Leader
  const leaderId = state.activePartyUnitIds[0] ?? 'luffy';
  const leaderDef = gameRegistry.units[leaderId] ?? gameRegistry.units['luffy'];
  const pFootY = Math.round(runtime.playerPos.y + 12);
  const faceP: 1 | -1 = Math.cos(runtime.playerHeadingRad) < -0.05 ? -1 : 1;
  queue.push(pFootY, (ctx) => {
    ctx.save();
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.72)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(Math.round(runtime.playerPos.x), pFootY - 1, 15, 6, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    drawCompactFootShadow(ctx, runtime.playerPos.x, pFootY, 13, 4);
    if (leaderDef) {
      const res = sprites.getOrCreateUnitSpriteSheet(leaderDef, 'base', null);
      if (res.sheet) {
        drawUnitOverworldSprite(
          ctx,
          res.sheet,
          res.entry,
          runtime.playerPos.x,
          pFootY,
          Boolean(runtime.isMoving),
          faceP,
          1.0,
          tick
        );
      }
    }
  });
}
