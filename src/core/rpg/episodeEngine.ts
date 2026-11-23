import type { GameDataRegistry } from '../types/dataSchemas';
import type { RpgCampaignState, RpgDataRegistry } from '../types/rpgSchemas';
import {
  computeCrewRoleBonuses,
  increaseCaptainBounty,
  recruitCrewMember,
  syncShipHullStatsWithRoles
} from './crewAndBountyEngine';

export {
  createBattleContextFromIslandEncounter,
  enterIslandEpisode,
  exitIslandToSea,
  ISLAND_BATTLE_TERMINAL_POS,
  ISLAND_BATTLE_TERMINAL_RADIUS_PX,
  stepIslandExploration,
  type IslandExplorationRuntime,
  type IslandStepOutput
} from './islandRuntimeEngine';
export type {
  IslandFootstepEvent,
  IslandNpcRuntimeState,
  OpenedChestEvent
} from './islandLivingVillage';

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

  for (const step of ep.steps) {
    state.episodeFlags[step.requiredFlag] = true;
  }

  const roleBonuses = computeCrewRoleBonuses(state, rpgRegistry);
  const berries = Math.round(ep.rewards.berries * roleBonuses.rewardMult);
  const tp = Math.round(ep.rewards.trainingPoints * roleBonuses.rewardMult);
  state.berries += berries;
  state.trainingPoints += tp;

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

  for (const unitId of ep.rewards.recruitsUnitIds) {
    recruitCrewMember(state, unitId, rpgRegistry, gameRegistry);
  }

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

  if (ep.rewards.unlocksFormIds) {
    for (const uf of ep.rewards.unlocksFormIds) {
      const unlockedList =
        state.unitUnlockedForms[uf.unitId] ??
        (state.unitUnlockedForms[uf.unitId] = []);
      if (!unlockedList.includes(uf.formId)) {
        unlockedList.push(uf.formId);
      }
    }
  }

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

  if (ep.rewards.awardsRoadPoneglyph && isFirstClear) {
    state.roadPoneglyphCount = Math.min(4, state.roadPoneglyphCount + 1);
    state.voyageLog.push(
      `[로드 포네그리프 확보] 현재 보유 로드 포네그리프: ${state.roadPoneglyphCount} / 4`
    );
  }

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
