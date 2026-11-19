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
import {
  computeCrewRoleBonuses,
  increaseCaptainBounty,
  recruitCrewMember,
  syncShipHullStatsWithRoles
} from './crewAndBountyEngine';
import { validateIslandDocking } from './seaGateValidator';

export interface IslandExplorationRuntime {
  islandId: string;
  playerPos: Vec2;
  playerHeadingRad: number;
  playerRadiusPx: number;
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

  // Save exact sea coordinates right outside the island so exiting restores them
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

  // Restore any already-triggered switch flags from episodeFlags
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

  // 1. Movement & obstacle / active Laser Barrier collision
  if (!runtime.activeDialogueNpc && lenVec(moveVec) > 0.05) {
    const dir = normalizeVec(moveVec);
    runtime.playerHeadingRad = Math.atan2(dir.y, dir.x);
    const walkSpeedPx = 195;
    const candidatePos = {
      x: clamp(
        runtime.playerPos.x + dir.x * walkSpeedPx * dt,
        24,
        islandMap.width - 24
      ),
      y: clamp(
        runtime.playerPos.y + dir.y * walkSpeedPx * dt,
        24,
        islandMap.height - 24
      )
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
        const isDeactivated = runtime.deactivatedBarrierIds.includes(
          barrier.barrierId
        );
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

  // 2. Check proximity to Port Exit, Puzzle Switches, NPCs, Encounters
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

  if (interactPressed) {
    if (runtime.activeDialogueNpc) {
      // Advance dialogue or select default choice
      const npc = runtime.activeDialogueNpc;
      if (runtime.dialogueLineIndex + 1 < npc.dialogueLines.length) {
        runtime.dialogueLineIndex += 1;
      } else {
        if (npc.choices && npc.choices.length > 0) {
          const ch = npc.choices[0];
          if (ch.setsFlag) {
            state.episodeFlags[ch.setsFlag] = true;
          }
          if (ch.recruitsUnitId) {
            recruitCrewMember(state, ch.recruitsUnitId, rpgRegistry, gameRegistry);
          }
          state.voyageLog.push(`[대화: ${npc.name}] ${ch.responseLine}`);
        }
        runtime.activeDialogueNpc = null;
        runtime.dialogueLineIndex = 0;
      }
    } else if (nearbySwitch) {
      if (!runtime.activatedSwitchIds.includes(nearbySwitch.switchId)) {
        runtime.activatedSwitchIds.push(nearbySwitch.switchId);
      }
      if (
        !runtime.deactivatedBarrierIds.includes(nearbySwitch.deactivatesBarrierId)
      ) {
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
    requestedOpenOnlineTerminal
  };
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
    trainingPointReward: Math.round(
      enc.trainingPointReward * roleBonuses.rewardMult
    ),
    setsFlagOnVictory: enc.setsFlagOnVictory,
    completesEpisodeIdOnVictory: enc.completesEpisodeOnVictory
      ? episodeId
      : null,
    winCondition: enc.winCondition,
    arenaTerrain: enc.arenaTerrain,
    gauntletWaves: enc.gauntletWaves
      ? enc.gauntletWaves.map((w) => ({ ...w, enemyUnitIds: [...w.enemyUnitIds] }))
      : undefined,
    guestAllyUnitIds: enc.guestAllyUnitIds ? [...enc.guestAllyUnitIds] : undefined
  };
}

export function completeEpisode(
  state: RpgCampaignState,
  episodeId: string,
  rpgRegistry: RpgDataRegistry,
  gameRegistry: GameDataRegistry
): boolean {
  const ep = rpgRegistry.episodes[episodeId];
  if (!ep) return false;

  const isFirstClear = !state.completedEpisodes.includes(episodeId);
  if (isFirstClear) {
    state.completedEpisodes.push(episodeId);
  }

  // Mark all step flags true
  for (const step of ep.steps) {
    state.episodeFlags[step.requiredFlag] = true;
  }

  const roleBonuses = computeCrewRoleBonuses(state, rpgRegistry);
  const berries = Math.round(ep.rewards.berries * roleBonuses.rewardMult);
  const tp = Math.round(ep.rewards.trainingPoints * roleBonuses.rewardMult);
  state.berries += berries;
  state.trainingPoints += tp;

  // Crew roles unlock
  if (ep.rewards.unlocksCrewRoles) {
    for (const rId of ep.rewards.unlocksCrewRoles) {
      if (!state.unlockedCrewRoles.includes(rId)) {
        state.unlockedCrewRoles.push(rId);
      }
      if (!state.assignedCrewRoles[rId]) {
        const roleDef = rpgRegistry.crewRoles[rId];
        state.assignedCrewRoles[rId] = roleDef?.defaultHolderName ?? rId;
      }
    }
  }

  // Recruit crew members
  for (const unitId of ep.rewards.recruitsUnitIds) {
    recruitCrewMember(state, unitId, rpgRegistry, gameRegistry);
  }

  // Ship upgrade (e.g., going_merry -> thousand_sunny on ep_water_seven)
  if (ep.rewards.unlocksShipId) {
    const newShipId = ep.rewards.unlocksShipId;
    if (!state.unlockedShips.includes(newShipId)) {
      state.unlockedShips.push(newShipId);
    }
    state.ship.shipId = newShipId;
    syncShipHullStatsWithRoles(state, rpgRegistry);
    state.ship.hullHp = state.ship.maxHullHp;
    const shipDef = rpgRegistry.ships[newShipId];
    state.voyageLog.push(
      `[신형 선박 해금!] ${shipDef?.name ?? newShipId} 진수 완료! (쿠 드 버스트 & 어온 캐논 사용 가능)`
    );
  }

  // Form / Awakening unlocks (e.g., Gear 5 & King of Hell on ep_wano)
  if (ep.rewards.unlocksFormIds) {
    for (const uf of ep.rewards.unlocksFormIds) {
      if (!state.unitUnlockedForms[uf.unitId]) {
        state.unitUnlockedForms[uf.unitId] = [];
      }
      if (!state.unitUnlockedForms[uf.unitId].includes(uf.formId)) {
        state.unitUnlockedForms[uf.unitId].push(uf.formId);
      }
    }
  }

  // Haki Training Unlocks (e.g. Luffy Observation Haki Lv.3 Future Sight on ep_totto_land)
  if (ep.rewards.unlocksHakiTraining) {
    for (const ht of ep.rewards.unlocksHakiTraining) {
      const unitDef = gameRegistry.units[ht.unitId];
      const current = state.unitHakiOverrides[ht.unitId] ?? {
        armament: unitDef?.haki?.armament ?? 0,
        observation: unitDef?.haki?.observation ?? 0,
        conqueror: unitDef?.haki?.conqueror ?? 0
      };
      if (current[ht.hakiKey] < ht.tier) {
        current[ht.hakiKey] = ht.tier;
        state.unitHakiOverrides[ht.unitId] = current;
        state.voyageLog.push(
          `[패기 개안!] ${unitDef?.name ?? ht.unitId}의 ${ht.hakiKey.toUpperCase()} 패기가 Lv.${ht.tier}에 도달했습니다!`
        );
      }
    }
  }

  // Road Poneglyph
  if (ep.rewards.awardsRoadPoneglyph && isFirstClear) {
    state.roadPoneglyphCount = Math.min(4, state.roadPoneglyphCount + 1);
    state.voyageLog.push(
      `[로드 포네그리프 확보] 현재 보유 로드 포네그리프: ${state.roadPoneglyphCount} / 4`
    );
  }

  // Bounty increase & Wanted Poster update
  if (isFirstClear && ep.rewards.bountyIncrease > 0) {
    increaseCaptainBounty(
      state,
      ep.rewards.bountyIncrease,
      `${ep.title} 클리어`,
      gameRegistry
    );
  }

  state.voyageLog.push(`[에피소드 클리어!] ${ep.title} 완수!`);
  return true;
}
