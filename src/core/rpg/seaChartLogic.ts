import type {
  RpgCampaignState,
  RpgDataRegistry,
  SeaIslandNode,
  SeaZoneId
} from '../types/rpgSchemas';
import { validateIslandDocking, validateSeaGateAccess } from './seaGateValidator';

export const VISITED_ISLAND_FLAG_PREFIX = 'visited_island_';

export interface IslandChestProgress {
  islandId: string;
  opened: number;
  total: number;
  percent: number;
  isComplete: boolean;
}

export interface ZoneChestProgress {
  zoneId: SeaZoneId;
  opened: number;
  total: number;
  percent: number;
  isComplete: boolean;
  byIsland: Record<string, IslandChestProgress>;
}

export interface GlobalChestProgress {
  opened: number;
  total: number;
  percent: number;
  byZone: Record<SeaZoneId, ZoneChestProgress>;
}

export function markIslandVisited(
  state: RpgCampaignState,
  islandId: string
): void {
  state.episodeFlags[`${VISITED_ISLAND_FLAG_PREFIX}${islandId}`] = true;
}

export function isIslandVisited(
  state: RpgCampaignState,
  island: SeaIslandNode
): boolean {
  if (state.episodeFlags[`${VISITED_ISLAND_FLAG_PREFIX}${island.islandId}`]) {
    return true;
  }
  if (island.islandId === 'foosha_shells') return true;
  if (state.lastDockedPort?.islandId === island.islandId) return true;
  if (!island.endgameMode && state.completedEpisodes.includes(island.episodeId)) {
    return true;
  }
  return false;
}

export function computeIslandChestProgress(
  state: RpgCampaignState,
  islandId: string,
  rpgRegistry: RpgDataRegistry,
  openedSet?: ReadonlySet<string>
): IslandChestProgress {
  const islMap = rpgRegistry.islands[islandId];
  const chests = islMap?.chests ?? [];
  const total = chests.length;
  if (total === 0) {
    return {
      islandId,
      opened: 0,
      total: 0,
      percent: 0,
      isComplete: false
    };
  }
  const set = openedSet ?? new Set(state.openedChestIds ?? []);
  let opened = 0;
  for (const ch of chests) {
    if (set.has(ch.chestId)) {
      opened += 1;
    }
  }
  const percent = Math.round((opened / total) * 100);
  return {
    islandId,
    opened,
    total,
    percent,
    isComplete: opened >= total
  };
}

export function computeZoneChestProgress(
  state: RpgCampaignState,
  zoneId: SeaZoneId,
  rpgRegistry: RpgDataRegistry,
  openedSet?: ReadonlySet<string>
): ZoneChestProgress {
  const zone = rpgRegistry.seaZones[zoneId];
  const set = openedSet ?? new Set(state.openedChestIds ?? []);
  const byIsland: Record<string, IslandChestProgress> = {};
  let opened = 0;
  let total = 0;
  for (const isl of zone?.islands ?? []) {
    const p = computeIslandChestProgress(state, isl.islandId, rpgRegistry, set);
    byIsland[isl.islandId] = p;
    opened += p.opened;
    total += p.total;
  }
  const percent = total > 0 ? Math.round((opened / total) * 100) : 0;
  return {
    zoneId,
    opened,
    total,
    percent,
    isComplete: total > 0 && opened >= total,
    byIsland
  };
}

export function computeGlobalChestProgress(
  state: RpgCampaignState,
  rpgRegistry: RpgDataRegistry
): GlobalChestProgress {
  const set = new Set(state.openedChestIds ?? []);
  const east_blue = computeZoneChestProgress(state, 'east_blue', rpgRegistry, set);
  const grand_line = computeZoneChestProgress(state, 'grand_line', rpgRegistry, set);
  const new_world = computeZoneChestProgress(state, 'new_world', rpgRegistry, set);
  const opened = east_blue.opened + grand_line.opened + new_world.opened;
  const total = east_blue.total + grand_line.total + new_world.total;
  const percent = total > 0 ? Math.round((opened / total) * 100) : 0;
  return {
    opened,
    total,
    percent,
    byZone: {
      east_blue,
      grand_line,
      new_world
    }
  };
}

export function isSeaZoneUnlocked(
  state: RpgCampaignState,
  zoneId: SeaZoneId,
  rpgRegistry: RpgDataRegistry
): boolean {
  if (zoneId === 'east_blue') return true;
  if (zoneId === 'grand_line') {
    return (
      state.currentZoneId === 'grand_line' ||
      state.currentZoneId === 'new_world' ||
      validateSeaGateAccess(state, 'east_blue', rpgRegistry).allowed
    );
  }
  return (
    state.currentZoneId === 'new_world' ||
    validateSeaGateAccess(state, 'grand_line', rpgRegistry).allowed
  );
}

export function evaluateFastSailEligibility(
  state: RpgCampaignState,
  zoneId: SeaZoneId,
  island: SeaIslandNode,
  rpgRegistry: RpgDataRegistry
): { allowed: boolean; reason: string } {
  if (!isSeaZoneUnlocked(state, zoneId, rpgRegistry)) {
    return { allowed: false, reason: '해역 관문 개방 후 이용 가능' };
  }
  const dockCheck = validateIslandDocking(state, island);
  if (!dockCheck.allowed) {
    return { allowed: false, reason: '선행 에피소드 완료 필요' };
  }
  if (!isIslandVisited(state, island)) {
    return { allowed: false, reason: '미방문 섬 — 직접 항해하여 발견하세요' };
  }
  return { allowed: true, reason: '방문 완료 — 즉시 항해 가능' };
}

export function executeFastSailToIsland(
  state: RpgCampaignState,
  zoneId: SeaZoneId,
  islandId: string,
  rpgRegistry: RpgDataRegistry
): { ok: boolean; notice: string } {
  const zone = rpgRegistry.seaZones[zoneId];
  const island = zone?.islands.find((i) => i.islandId === islandId);
  if (!zone || !island) {
    return { ok: false, notice: '대상 섬 정보를 찾을 수 없습니다.' };
  }
  const eligibility = evaluateFastSailEligibility(state, zoneId, island, rpgRegistry);
  if (!eligibility.allowed) {
    return { ok: false, notice: `[빠른 항해 불가] ${eligibility.reason}` };
  }

  state.savedZoneShipPositions[state.currentZoneId] = {
    pos: { ...state.ship.pos },
    headingRad: state.ship.headingRad
  };
  state.currentZoneId = zoneId;

  const approachOffset = Math.min(54, island.dockingRadiusPx * 0.65);
  const targetX = Math.max(
    48,
    Math.min(zone.width - 48, island.pos.x - approachOffset)
  );
  const targetY = Math.max(48, Math.min(zone.height - 48, island.pos.y));
  state.ship.pos = { x: targetX, y: targetY };
  state.ship.vel = { x: 0, y: 0 };
  state.ship.headingRad = 0;

  const notice = `[빠른 항해] ${island.name} 부두 앞바다로 즉시 이동했습니다!`;
  state.voyageLog.push(notice);
  return { ok: true, notice };
}
