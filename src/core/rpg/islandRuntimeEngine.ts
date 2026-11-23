import {
  distVec,
  lenVec,
  normalizeVec,
  type Vec2
} from '../math/vector2';
import type { GameDataRegistry } from '../types/dataSchemas';
import type {
  BattleContext,
  IslandEncounterDefinition,
  IslandMapMarkerDefinition,
  IslandNpcDefinition,
  IslandPuzzleSwitch,
  IslandTreasureChestDefinition,
  RpgCampaignState,
  RpgDataRegistry,
  SurfaceMaterialId
} from '../types/rpgSchemas';
import { computeCrewRoleBonuses, recruitCrewMember } from './crewAndBountyEngine';
import {
  claimIslandChest,
  computeFacingBetween,
  createInitialNpcStates,
  findNearbyIslandInteractables,
  findNearbyUnopenedChest,
  stepNpcPatrols,
  type IslandFootstepEvent,
  type IslandNpcRuntimeState,
  type OpenedChestEvent
} from './islandLivingVillage';
import {
  getSurfaceMaterialAt,
  getZoneTriggerAt,
  moveWithIslandSlide
} from './islandTileCollision';
import { validateIslandDocking } from './seaGateValidator';

export interface IslandExplorationRuntime {
  islandId: string;
  playerPos: Vec2;
  playerHeadingRad: number;
  playerRadiusPx: number;
  isMoving?: boolean;
  deactivatedBarrierIds: string[];
  activatedSwitchIds: string[];
  activeDialogueNpc: IslandNpcDefinition | null;
  dialogueLineIndex: number;
  npcStates?: Record<string, IslandNpcRuntimeState>;
  currentZoneId?: string | null;
  zoneBannerName?: string | null;
  zoneBannerSubtitle?: string | null;
  zoneBannerAccent?: string | null;
  zoneBannerTimerSec?: number;
  footstepDistanceAccumPx?: number;
  currentSurface?: SurfaceMaterialId;
}

export const ISLAND_BATTLE_TERMINAL_POS: Vec2 = { x: 148, y: 185 };
export const ISLAND_BATTLE_TERMINAL_RADIUS_PX = 42;

export interface IslandStepOutput {
  nearbyNpc: IslandNpcDefinition | null;
  nearbySwitch: IslandPuzzleSwitch | null;
  nearbyEncounter: IslandEncounterDefinition | null;
  nearbyChest?: IslandTreasureChestDefinition | null;
  openedChest?: OpenedChestEvent | null;
  nearbyActivityMarker?: IslandMapMarkerDefinition | null;
  footstepEvent?: IslandFootstepEvent | null;
  atPortExit: boolean;
  atBattleTerminal: boolean;
  triggeredBattle: BattleContext | null;
  requestedExitToSea: boolean;
  requestedOpenOnlineTerminal: boolean;
  requestedEndgameMode?: 'IMPEL_DOWN' | 'COLOSSEUM' | 'RAID';
}

export function enterIslandEpisode(
  state: RpgCampaignState,
  islandId: string,
  rpgRegistry: RpgDataRegistry
): {
  allowed: boolean;
  missingEpisodeIds: string[];
  runtime: IslandExplorationRuntime | null;
} {
  const zone = rpgRegistry.seaZones[state.currentZoneId];
  const node = zone?.islands.find((i) => i.islandId === islandId);
  if (node) {
    const check = validateIslandDocking(state, node);
    if (!check.allowed) {
      return {
        allowed: false,
        missingEpisodeIds: check.missingEpisodeIds,
        runtime: null
      };
    }
  }

  const islandMap = rpgRegistry.islands[islandId];
  if (!islandMap) {
    return { allowed: false, missingEpisodeIds: [], runtime: null };
  }

  state.savedZoneShipPositions[state.currentZoneId] = {
    pos: { x: state.ship.pos.x, y: state.ship.pos.y },
    headingRad: state.ship.headingRad
  };
  state.lastDockedPort = {
    zoneId: state.currentZoneId,
    islandId,
    returnSeaPos: { x: state.ship.pos.x, y: state.ship.pos.y }
  };
  state.activeIslandId = islandId;

  const deactivatedBarrierIds: string[] = [];
  const activatedSwitchIds: string[] = [];
  for (const sw of islandMap.puzzleSwitches) {
    if (state.episodeFlags[sw.setsFlag]) {
      activatedSwitchIds.push(sw.switchId);
      deactivatedBarrierIds.push(sw.deactivatesBarrierId);
    }
  }

  state.voyageLog.push(`[섬 입항] ${islandMap.name} 에피소드 페이지에 상륙했습니다.`);

  const spawn = { x: islandMap.spawnPoint.x, y: islandMap.spawnPoint.y };
  const initialZone = getZoneTriggerAt(spawn, islandMap);

  return {
    allowed: true,
    missingEpisodeIds: [],
    runtime: {
      islandId,
      playerPos: spawn,
      playerHeadingRad: 0,
      playerRadiusPx: 16,
      deactivatedBarrierIds,
      activatedSwitchIds,
      activeDialogueNpc: null,
      dialogueLineIndex: 0,
      npcStates: createInitialNpcStates(islandMap),
      currentZoneId: initialZone?.zoneId ?? null,
      zoneBannerName: initialZone?.name ?? null,
      zoneBannerSubtitle: initialZone?.subtitle ?? null,
      zoneBannerAccent: initialZone?.accentColor ?? '#facc15',
      zoneBannerTimerSec: initialZone ? 2.2 : 0,
      footstepDistanceAccumPx: 0,
      currentSurface: getSurfaceMaterialAt(spawn, islandMap)
    }
  };
}

export function exitIslandToSea(state: RpgCampaignState): void {
  const port = state.lastDockedPort;
  state.activeIslandId = null;
  state.currentZoneId = port.zoneId;
  state.ship.pos = { x: port.returnSeaPos.x, y: port.returnSeaPos.y };
  state.ship.vel = { x: 0, y: 0 };
  state.voyageLog.push(`[출항 복귀] 항구를 떠나 바다(${port.zoneId}) 직전 좌표로 복귀했습니다.`);
}

export function createBattleContextFromIslandEncounter(
  state: RpgCampaignState,
  islandId: string,
  episodeId: string,
  enc: IslandEncounterDefinition,
  rpgRegistry: RpgDataRegistry
): BattleContext {
  const roleBonuses = computeCrewRoleBonuses(state, rpgRegistry);
  return {
    sourceScene: 'ISLAND_EPISODE',
    zoneId: state.currentZoneId,
    islandId,
    encounterId: enc.encounterId,
    encounterName: enc.name,
    isBoss: enc.isBoss,
    arenaSizeKey: enc.arenaSizeKey,
    mode:
      (state.activePartyUnitIds.length >= 2 ||
        (enc.guestAllyUnitIds && enc.guestAllyUnitIds.length > 0)) &&
      (enc.enemyUnitIds.length >= 2 ||
        (enc.gauntletWaves && enc.gauntletWaves.length > 0))
        ? '2V2'
        : '1V1',
    enemyUnitIds: [...enc.enemyUnitIds],
    aiLevel: enc.aiLevel,
    bountyReward: enc.bountyReward,
    berryReward: Math.round(enc.berryReward * roleBonuses.rewardMult),
    trainingPointReward: Math.round(enc.trainingPointReward * roleBonuses.rewardMult),
    setsFlagOnVictory: enc.setsFlagOnVictory,
    completesEpisodeIdOnVictory: enc.completesEpisodeOnVictory ? episodeId : null,
    winCondition: enc.winCondition,
    arenaTerrain: enc.arenaTerrain,
    gauntletWaves: enc.gauntletWaves
      ? enc.gauntletWaves.map((w) => ({ ...w, enemyUnitIds: [...w.enemyUnitIds] }))
      : undefined,
    guestAllyUnitIds: enc.guestAllyUnitIds ? [...enc.guestAllyUnitIds] : undefined
  };
}

export function stepIslandExploration(
  state: RpgCampaignState,
  runtime: IslandExplorationRuntime,
  moveVec: Vec2,
  interactPressed: boolean,
  dt: number,
  rpgRegistry: RpgDataRegistry,
  gameRegistry: GameDataRegistry
): IslandStepOutput {
  const islandMap = rpgRegistry.islands[runtime.islandId];
  const emptyOut: IslandStepOutput = {
    nearbyNpc: null,
    nearbySwitch: null,
    nearbyEncounter: null,
    nearbyChest: null,
    openedChest: null,
    nearbyActivityMarker: null,
    footstepEvent: null,
    atPortExit: false,
    atBattleTerminal: false,
    triggeredBattle: null,
    requestedExitToSea: false,
    requestedOpenOnlineTerminal: false
  };
  if (!islandMap) return emptyOut;

  if (!runtime.npcStates) {
    runtime.npcStates = createInitialNpcStates(islandMap);
  }

  let footstepEvent: IslandFootstepEvent | null = null;
  runtime.isMoving = false;
  if (!runtime.activeDialogueNpc && lenVec(moveVec) > 0.05) {
    const dir = normalizeVec(moveVec);
    runtime.playerHeadingRad = Math.atan2(dir.y, dir.x);
    runtime.isMoving = true;
    const walkSpeedPx = 195;
    const prevPos = runtime.playerPos;
    const nextPos = moveWithIslandSlide(
      prevPos,
      dir.x * walkSpeedPx * dt,
      dir.y * walkSpeedPx * dt,
      runtime.playerRadiusPx,
      islandMap,
      runtime.deactivatedBarrierIds
    );
    runtime.playerPos = nextPos;

    const surface = getSurfaceMaterialAt(nextPos, islandMap);
    runtime.currentSurface = surface;
    const movedDist = distVec(prevPos, nextPos);
    if (movedDist > 0.05) {
      const accum = (runtime.footstepDistanceAccumPx ?? 0) + movedDist;
      if (accum >= 42) {
        runtime.footstepDistanceAccumPx = accum - 42;
        footstepEvent = {
          material: surface,
          x: nextPos.x,
          y: nextPos.y
        };
      } else {
        runtime.footstepDistanceAccumPx = accum;
      }
    }
  } else {
    runtime.currentSurface = getSurfaceMaterialAt(runtime.playerPos, islandMap);
  }

  if ((runtime.zoneBannerTimerSec ?? 0) > 0) {
    runtime.zoneBannerTimerSec = Math.max(0, (runtime.zoneBannerTimerSec ?? 0) - dt);
  }
  const activeZone = getZoneTriggerAt(runtime.playerPos, islandMap);
  if (activeZone && activeZone.zoneId !== runtime.currentZoneId) {
    runtime.currentZoneId = activeZone.zoneId;
    runtime.zoneBannerName = activeZone.name;
    runtime.zoneBannerSubtitle = activeZone.subtitle ?? null;
    runtime.zoneBannerAccent = activeZone.accentColor ?? '#facc15';
    runtime.zoneBannerTimerSec = 2.2;
  }

  stepNpcPatrols(
    islandMap,
    runtime.npcStates,
    runtime.playerPos,
    runtime.activeDialogueNpc?.npcId ?? null,
    runtime.deactivatedBarrierIds,
    dt
  );

  const terminalPos = islandMap.battleTerminalPos ?? ISLAND_BATTLE_TERMINAL_POS;
  const atPortExit =
    distVec(runtime.playerPos, islandMap.portExitZone.pos) <= islandMap.portExitZone.radiusPx;
  const atBattleTerminal =
    distVec(runtime.playerPos, terminalPos) <= ISLAND_BATTLE_TERMINAL_RADIUS_PX;

  const nearbyChest = findNearbyUnopenedChest(state, islandMap, runtime.playerPos);
  const { nearbySwitch, nearbyNpc, nearbyEncounter, nearbyActivityMarker } =
    findNearbyIslandInteractables(state, islandMap, runtime.playerPos, runtime.npcStates);

  let triggeredBattle: BattleContext | null = null;
  let openedChest: OpenedChestEvent | null = null;
  let requestedExitToSea = false;
  let requestedOpenOnlineTerminal = false;
  let requestedEndgameMode: 'IMPEL_DOWN' | 'COLOSSEUM' | 'RAID' | undefined;

  if (interactPressed) {
    if (runtime.activeDialogueNpc) {
      const npc = runtime.activeDialogueNpc;
      if (runtime.dialogueLineIndex + 1 < npc.dialogueLines.length) {
        runtime.dialogueLineIndex += 1;
      } else {
        if (npc.choices && npc.choices.length > 0) {
          const ch = npc.choices[0];
          if (ch) {
            if (ch.setsFlag) state.episodeFlags[ch.setsFlag] = true;
            if (ch.recruitsUnitId) {
              recruitCrewMember(state, ch.recruitsUnitId, rpgRegistry, gameRegistry);
            }
            if (ch.triggersEndgameMode) requestedEndgameMode = ch.triggersEndgameMode;
            state.voyageLog.push(`[대화: ${npc.name}] ${ch.responseLine}`);
          }
        }
        runtime.activeDialogueNpc = null;
        runtime.dialogueLineIndex = 0;
      }
    } else if (nearbySwitch) {
      if (!runtime.activatedSwitchIds.includes(nearbySwitch.switchId)) {
        runtime.activatedSwitchIds.push(nearbySwitch.switchId);
      }
      if (!runtime.deactivatedBarrierIds.includes(nearbySwitch.deactivatesBarrierId)) {
        runtime.deactivatedBarrierIds.push(nearbySwitch.deactivatesBarrierId);
      }
      state.episodeFlags[nearbySwitch.setsFlag] = true;
      state.voyageLog.push(
        `[퍼즐 장치 작동] ${nearbySwitch.label} 해제 완료! -> 레이저 배리어 비활성화!`
      );
    } else if (nearbyChest) {
      openedChest = claimIslandChest(state, nearbyChest);
    } else if (nearbyNpc) {
      runtime.activeDialogueNpc = nearbyNpc;
      runtime.dialogueLineIndex = 0;
      const npcState = runtime.npcStates[nearbyNpc.npcId];
      if (npcState) {
        npcState.isMoving = false;
        npcState.facing = computeFacingBetween(npcState.pos, runtime.playerPos);
      }
      if (nearbyNpc.setsQuestFlagOnTalk) {
        state.episodeFlags[nearbyNpc.setsQuestFlagOnTalk] = true;
      }
    } else if (nearbyEncounter) {
      triggeredBattle = createBattleContextFromIslandEncounter(
        state,
        islandMap.islandId,
        islandMap.episodeId,
        nearbyEncounter,
        rpgRegistry
      );
    } else if (atBattleTerminal) {
      requestedOpenOnlineTerminal = true;
      state.voyageLog.push(
        `[대전 단말기 접속] ${islandMap.name} 항구 통신 대전 단말기에 연결했습니다 (회복 아이템 금지 / HP·PP 무손실).`
      );
    } else if (atPortExit) {
      exitIslandToSea(state);
      requestedExitToSea = true;
    }
  }

  return {
    nearbyNpc,
    nearbySwitch,
    nearbyEncounter,
    nearbyChest,
    openedChest,
    nearbyActivityMarker,
    footstepEvent,
    atPortExit,
    atBattleTerminal,
    triggeredBattle,
    requestedExitToSea,
    requestedOpenOnlineTerminal,
    requestedEndgameMode
  };
}
