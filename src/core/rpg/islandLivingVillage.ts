import { distVec, type Vec2 } from '../math/vector2';
import type {
  IslandEncounterDefinition,
  IslandMapDefinition,
  IslandMapMarkerDefinition,
  IslandNpcDefinition,
  IslandPuzzleSwitch,
  IslandTreasureChestDefinition,
  NpcFacingDir,
  RpgCampaignState,
  SurfaceMaterialId
} from '../types/rpgSchemas';
import { isCircleBlockedOnIsland } from './islandTileCollision';

export interface IslandNpcRuntimeState {
  pos: Vec2;
  facing: NpcFacingDir;
  waypointIndex: number;
  pauseRemainingTicks: number;
  isMoving: boolean;
  resumeFacing: NpcFacingDir;
}

export interface IslandFootstepEvent {
  material: SurfaceMaterialId;
  x: number;
  y: number;
}

export interface OpenedChestEvent {
  chest: IslandTreasureChestDefinition;
  berriesAwarded: number;
  tpAwarded: number;
  healedParty: boolean;
}

export function computeFacingBetween(from: Vec2, to: Vec2): NpcFacingDir {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (Math.abs(dx) >= Math.abs(dy)) {
    return dx < 0 ? 'left' : 'right';
  }
  return dy < 0 ? 'up' : 'down';
}

export function getChestWorldCenter(
  chest: IslandTreasureChestDefinition,
  tileSize = 32
): Vec2 {
  return {
    x: chest.tileX * tileSize + tileSize * 0.5,
    y: chest.tileY * tileSize + tileSize * 0.5
  };
}

export function createInitialNpcStates(
  islandMap: IslandMapDefinition
): Record<string, IslandNpcRuntimeState> {
  const states: Record<string, IslandNpcRuntimeState> = {};
  for (let i = 0; i < islandMap.npcs.length; i++) {
    const npc = islandMap.npcs[i];
    if (!npc) continue;
    const baseFacing: NpcFacingDir = npc.facing ?? 'down';
    const hasPatrol = Boolean(npc.patrolWaypoints && npc.patrolWaypoints.length >= 2);
    states[npc.npcId] = {
      pos: { x: npc.pos.x, y: npc.pos.y },
      facing: baseFacing,
      waypointIndex: hasPatrol ? 1 : 0,
      pauseRemainingTicks: 0,
      isMoving: false,
      resumeFacing: baseFacing
    };
  }
  return states;
}

export function stepNpcPatrols(
  islandMap: IslandMapDefinition,
  npcStates: Record<string, IslandNpcRuntimeState>,
  playerPos: Vec2,
  activeDialogueNpcId: string | null,
  deactivatedBarrierIds: readonly string[],
  dt: number
): void {
  for (let i = 0; i < islandMap.npcs.length; i++) {
    const npc = islandMap.npcs[i];
    if (!npc) continue;

    let st = npcStates[npc.npcId];
    if (!st) {
      const baseFacing: NpcFacingDir = npc.facing ?? 'down';
      st = {
        pos: { x: npc.pos.x, y: npc.pos.y },
        facing: baseFacing,
        waypointIndex: npc.patrolWaypoints && npc.patrolWaypoints.length >= 2 ? 1 : 0,
        pauseRemainingTicks: 0,
        isMoving: false,
        resumeFacing: baseFacing
      };
      npcStates[npc.npcId] = st;
    }

    if (activeDialogueNpcId === npc.npcId) {
      st.isMoving = false;
      st.facing = computeFacingBetween(st.pos, playerPos);
      continue;
    }

    const waypoints = npc.patrolWaypoints;
    if (!waypoints || waypoints.length < 2) {
      st.isMoving = false;
      st.facing = npc.facing ?? st.resumeFacing;
      continue;
    }

    if (st.pauseRemainingTicks > 0) {
      st.pauseRemainingTicks -= 1;
      st.isMoving = false;
      continue;
    }

    const target = waypoints[st.waypointIndex % waypoints.length];
    if (!target) {
      st.isMoving = false;
      continue;
    }

    const dx = target.x - st.pos.x;
    const dy = target.y - st.pos.y;
    const dist = Math.hypot(dx, dy);
    const speedPx = npc.patrolSpeedPx ?? 48;
    const stepPx = speedPx * dt;

    if (dist <= Math.max(2, stepPx)) {
      if (
        distVec(target, playerPos) >= 24 &&
        !isCircleBlockedOnIsland(target, 12, islandMap, deactivatedBarrierIds)
      ) {
        st.pos = { x: target.x, y: target.y };
      }
      st.waypointIndex = (st.waypointIndex + 1) % waypoints.length;
      st.pauseRemainingTicks = npc.pauseTicks ?? 60;
      st.isMoving = false;
      st.resumeFacing = st.facing;
      continue;
    }

    const nx = st.pos.x + (dx / dist) * stepPx;
    const ny = st.pos.y + (dy / dist) * stepPx;
    const candidate: Vec2 = { x: nx, y: ny };

    if (distVec(candidate, playerPos) < 28) {
      // Politely pause and look at the player without shoving
      st.isMoving = false;
      st.facing = computeFacingBetween(st.pos, playerPos);
      continue;
    }

    if (!isCircleBlockedOnIsland(candidate, 12, islandMap, deactivatedBarrierIds)) {
      st.pos = candidate;
      st.isMoving = true;
      st.facing = computeFacingBetween({ x: 0, y: 0 }, { x: dx, y: dy });
      st.resumeFacing = st.facing;
    } else {
      st.waypointIndex = (st.waypointIndex + 1) % waypoints.length;
      st.pauseRemainingTicks = 24;
      st.isMoving = false;
    }
  }
}

export function findNearbyUnopenedChest(
  state: RpgCampaignState,
  islandMap: IslandMapDefinition,
  playerPos: Vec2
): IslandTreasureChestDefinition | null {
  const chests = islandMap.chests;
  if (!chests || chests.length === 0) return null;
  const opened = state.openedChestIds ?? [];
  const tileSize = islandMap.tileMap?.tileSize ?? 32;
  for (let i = 0; i < chests.length; i++) {
    const chest = chests[i];
    if (!chest || opened.includes(chest.chestId)) continue;
    const center = getChestWorldCenter(chest, tileSize);
    if (distVec(playerPos, center) <= 46) {
      return chest;
    }
  }
  return null;
}

export function claimIslandChest(
  state: RpgCampaignState,
  chest: IslandTreasureChestDefinition
): OpenedChestEvent {
  if (!state.openedChestIds) {
    state.openedChestIds = [];
  }
  if (!state.openedChestIds.includes(chest.chestId)) {
    state.openedChestIds.push(chest.chestId);
  }

  const berriesAwarded = Math.max(0, Math.round(chest.reward.berries));
  const tpAwarded = Math.max(0, Math.round(chest.reward.trainingPoints));
  state.berries = Math.min(50_000_000_000, state.berries + berriesAwarded);
  state.trainingPoints = Math.min(1_000_000, state.trainingPoints + tpAwarded);

  let healedParty = false;
  const healRatio = chest.reward.healPartyRatio ?? 0;
  if (healRatio > 0) {
    healedParty = true;
    for (let i = 0; i < state.activePartyUnitIds.length; i++) {
      const uid = state.activePartyUnitIds[i];
      if (!uid) continue;
      const cur = state.partyHpRatios[uid] ?? 1.0;
      state.partyHpRatios[uid] = Math.min(1.0, Number((cur + healRatio).toFixed(3)));
    }
  }

  const itemNote = chest.reward.itemLabel ? ` / ${chest.reward.itemLabel}` : '';
  const healNote = healedParty ? ` / 파티 HP +${Math.round(healRatio * 100)}%` : '';
  state.voyageLog.push(
    `[보물상자 발견!] ${chest.hiddenHint} -> +${berriesAwarded.toLocaleString()} 베리, +${tpAwarded} TP${itemNote}${healNote}`
  );

  return {
    chest,
    berriesAwarded,
    tpAwarded,
    healedParty
  };
}

export function findNearbyIslandInteractables(
  state: RpgCampaignState,
  islandMap: IslandMapDefinition,
  playerPos: Vec2,
  npcStates: Record<string, IslandNpcRuntimeState>
): {
  nearbySwitch: IslandPuzzleSwitch | null;
  nearbyNpc: IslandNpcDefinition | null;
  nearbyEncounter: IslandEncounterDefinition | null;
  nearbyActivityMarker: IslandMapMarkerDefinition | null;
} {
  let nearbySwitch: IslandPuzzleSwitch | null = null;
  for (const sw of islandMap.puzzleSwitches) {
    if (distVec(playerPos, sw.pos) <= sw.radiusPx + 14) {
      nearbySwitch = sw;
      break;
    }
  }

  let nearbyNpc: IslandNpcDefinition | null = null;
  for (const npc of islandMap.npcs) {
    const livePos = npcStates[npc.npcId]?.pos ?? npc.pos;
    if (distVec(playerPos, livePos) <= npc.interactRadiusPx) {
      nearbyNpc = npc;
      break;
    }
  }

  let nearbyEncounter: IslandEncounterDefinition | null = null;
  for (const enc of islandMap.encounters) {
    if (state.episodeFlags[enc.setsFlagOnVictory]) continue;
    if (distVec(playerPos, enc.pos) <= enc.triggerRadiusPx) {
      nearbyEncounter = enc;
      break;
    }
  }

  let nearbyActivityMarker: IslandMapMarkerDefinition | null = null;
  if (islandMap.markers) {
    const ts = islandMap.tileMap?.tileSize ?? 32;
    for (const marker of islandMap.markers) {
      if (marker.actionKind !== 'CAMP_TRAINING' && marker.actionKind !== 'BOUNTY_BOARD') {
        continue;
      }
      const mPos = { x: marker.tileX * ts + ts * 0.5, y: marker.tileY * ts + ts * 0.5 };
      if (distVec(playerPos, mPos) <= 46) {
        nearbyActivityMarker = marker;
        break;
      }
    }
  }

  return { nearbySwitch, nearbyNpc, nearbyEncounter, nearbyActivityMarker };
}
