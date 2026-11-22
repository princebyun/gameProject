import {
  clamp,
  distVec,
  lenVec,
  normalizeVec,
  type Vec2
} from '../math/vector2';
import type { GameDataRegistry } from '../types/dataSchemas';
import type {
  BattleContext,
  IslandEncounterDefinition,
  IslandNpcDefinition,
  IslandPuzzleSwitch,
  RpgCampaignState,
  RpgDataRegistry
} from '../types/rpgSchemas';
import { computeCrewRoleBonuses, recruitCrewMember } from './crewAndBountyEngine';
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
}

export const ISLAND_BATTLE_TERMINAL_POS: Vec2 = { x: 148, y: 185 };
export const ISLAND_BATTLE_TERMINAL_RADIUS_PX = 42;

export interface IslandStepOutput {
  nearbyNpc: IslandNpcDefinition | null;
  nearbySwitch: IslandPuzzleSwitch | null;
  nearbyEncounter: IslandEncounterDefinition | null;
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

  return {
    allowed: true,
    missingEpisodeIds: [],
    runtime: {
      islandId,
      playerPos: { x: islandMap.spawnPoint.x, y: islandMap.spawnPoint.y },
      playerHeadingRad: 0,
      playerRadiusPx: 16,
      deactivatedBarrierIds,
      activatedSwitchIds,
      activeDialogueNpc: null,
      dialogueLineIndex: 0
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

function circleIntersectsRect(
  c: Vec2,
  r: number,
  rect: { x: number; y: number; width: number; height: number }
): boolean {
  const closestX = clamp(c.x, rect.x, rect.x + rect.width);
  const closestY = clamp(c.y, rect.y, rect.y + rect.height);
  return Math.hypot(c.x - closestX, c.y - closestY) < r;
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
    atPortExit: false,
    atBattleTerminal: false,
    triggeredBattle: null,
    requestedExitToSea: false,
    requestedOpenOnlineTerminal: false
  };
  if (!islandMap) return emptyOut;

  runtime.isMoving = false;
  if (!runtime.activeDialogueNpc && lenVec(moveVec) > 0.05) {
    const dir = normalizeVec(moveVec);
    runtime.playerHeadingRad = Math.atan2(dir.y, dir.x);
    runtime.isMoving = true;
    const walkSpeedPx = 195;
    const candidatePos = {
      x: clamp(runtime.playerPos.x + dir.x * walkSpeedPx * dt, 24, islandMap.width - 24),
      y: clamp(runtime.playerPos.y + dir.y * walkSpeedPx * dt, 24, islandMap.height - 24)
    };

    let blocked = false;
    for (const obs of islandMap.obstacles) {
      if (circleIntersectsRect(candidatePos, runtime.playerRadiusPx, obs)) {
        blocked = true;
        break;
      }
    }
    if (!blocked) {
      for (const barrier of islandMap.laserBarriers) {
        const isDeactivated = runtime.deactivatedBarrierIds.includes(barrier.barrierId);
        if (
          barrier.activeByDefault &&
          !isDeactivated &&
          circleIntersectsRect(candidatePos, runtime.playerRadiusPx, barrier)
        ) {
          blocked = true;
          break;
        }
      }
    }

    if (!blocked) {
      runtime.playerPos = candidatePos;
    }
  }

  const atPortExit =
    distVec(runtime.playerPos, islandMap.portExitZone.pos) <=
    islandMap.portExitZone.radiusPx;
  const atBattleTerminal =
    distVec(runtime.playerPos, ISLAND_BATTLE_TERMINAL_POS) <=
    ISLAND_BATTLE_TERMINAL_RADIUS_PX;

  let nearbySwitch: IslandPuzzleSwitch | null = null;
  for (const sw of islandMap.puzzleSwitches) {
    if (distVec(runtime.playerPos, sw.pos) <= sw.radiusPx + 14) {
      nearbySwitch = sw;
      break;
    }
  }

  let nearbyNpc: IslandNpcDefinition | null = null;
  for (const npc of islandMap.npcs) {
    if (distVec(runtime.playerPos, npc.pos) <= npc.interactRadiusPx) {
      nearbyNpc = npc;
      break;
    }
  }

  let nearbyEncounter: IslandEncounterDefinition | null = null;
  for (const enc of islandMap.encounters) {
    if (state.episodeFlags[enc.setsFlagOnVictory]) continue;
    if (distVec(runtime.playerPos, enc.pos) <= enc.triggerRadiusPx) {
      nearbyEncounter = enc;
      break;
    }
  }

  let triggeredBattle: BattleContext | null = null;
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
    } else if (nearbyNpc) {
      runtime.activeDialogueNpc = nearbyNpc;
      runtime.dialogueLineIndex = 0;
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
    atPortExit,
    atBattleTerminal,
    triggeredBattle,
    requestedExitToSea,
    requestedOpenOnlineTerminal,
    requestedEndgameMode
  };
}
