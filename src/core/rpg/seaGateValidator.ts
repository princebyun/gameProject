import type {
  GateMissingEpisodeItem,
  GateValidationResult,
  RpgCampaignState,
  RpgDataRegistry,
  SeaIslandNode,
  SeaZoneId
} from '../types/rpgSchemas';

/**
 * Validates whether the player can pass the SeaGate of the specified SeaZone.
 * - east_blue -> grand_line requires all requiredForNextZone episodes in east_blue.
 * - grand_line -> new_world requires all requiredForNextZone episodes in BOTH east_blue AND grand_line.
 */
export function validateSeaGateAccess(
  state: RpgCampaignState,
  fromZoneId: SeaZoneId,
  rpgRegistry: RpgDataRegistry
): GateValidationResult {
  const zone = rpgRegistry.seaZones[fromZoneId];
  const gate = zone?.seaGate;
  if (!gate) {
    return {
      allowed: false,
      gateName: '관문 없음',
      targetZoneId: fromZoneId,
      missingEpisodes: [],
      checklist: []
    };
  }

  const checklist: GateMissingEpisodeItem[] = [];
  const missingEpisodes: GateMissingEpisodeItem[] = [];

  for (const reqZoneId of gate.requiredZoneIds) {
    const reqZone = rpgRegistry.seaZones[reqZoneId];
    if (!reqZone) continue;

    for (const isl of reqZone.islands) {
      if (!isl.requiredForNextZone) continue;
      const completed = state.completedEpisodes.includes(isl.episodeId);
      const item: GateMissingEpisodeItem = {
        episodeId: isl.episodeId,
        islandId: isl.islandId,
        islandName: isl.name,
        zoneId: reqZone.id,
        zoneName: reqZone.name,
        completed
      };
      checklist.push(item);
      if (!completed) {
        missingEpisodes.push(item);
      }
    }
  }

  return {
    allowed: missingEpisodes.length === 0,
    gateName: gate.name,
    targetZoneId: gate.toZoneId,
    missingEpisodes,
    checklist
  };
}

/**
 * Attempts to transition the ship through the current zone's SeaGate.
 * If prerequisite episodes are missing, blocks transition and returns the missing checklist.
 */
export function tryTransitionThroughSeaGate(
  state: RpgCampaignState,
  rpgRegistry: RpgDataRegistry
): GateValidationResult {
  const validation = validateSeaGateAccess(state, state.currentZoneId, rpgRegistry);
  if (!validation.allowed) {
    const names = validation.missingEpisodes.map((m) => m.islandName).join(', ');
    state.voyageLog.push(
      `[관문 진입 차단] ${validation.gateName}: 선행 필수 에피소드 미완료 (${names})`
    );
    return validation;
  }

  // Save current zone position
  state.savedZoneShipPositions[state.currentZoneId] = {
    pos: { ...state.ship.pos },
    headingRad: state.ship.headingRad
  };

  // Switch to target SeaZone
  const nextZone = rpgRegistry.seaZones[validation.targetZoneId];
  state.currentZoneId = nextZone.id;
  state.ship.pos = { ...nextZone.spawnPoint };
  state.ship.vel = { x: 0, y: 0 };
  state.ship.headingRad = 0;

  state.voyageLog.push(
    `[해역 돌파] ${validation.gateName} 통과! 새로운 바다 [${nextZone.name}]에 진입했습니다!`
  );

  return validation;
}

/**
 * Validates optional island-specific requiredEpisodes (e.g., if Elbaf is configured to require Egghead).
 */
export function validateIslandDocking(
  state: RpgCampaignState,
  island: SeaIslandNode
): { allowed: boolean; missingEpisodeIds: string[] } {
  const missing: string[] = [];
  for (const reqEpId of island.requiredEpisodes ?? []) {
    if (!state.completedEpisodes.includes(reqEpId)) {
      missing.push(reqEpId);
    }
  }
  return {
    allowed: missing.length === 0,
    missingEpisodeIds: missing
  };
}
