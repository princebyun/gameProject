import type { RpgCampaignState, RpgDataRegistry } from '../types/rpgSchemas';
import { computeCrewRoleBonuses } from './crewRoleBonuses';

export function decipherIslandPoneglyph(
  state: RpgCampaignState,
  poneglyphId: string,
  rpgRegistry: RpgDataRegistry
): { success: boolean; message: string; berryBonus: number; tpBonus: number } {
  const bonuses = computeCrewRoleBonuses(state, rpgRegistry);
  if (!bonuses.canDecipherPoneglyphs) {
    return {
      success: false,
      message: '고고학자(니코 로빈) 직책이 배치되어 있어야 고대 문자 포네그리프를 해독할 수 있습니다.',
      berryBonus: 0,
      tpBonus: 0
    };
  }
  if (!state.decipheredPoneglyphIds) {
    state.decipheredPoneglyphIds = [];
  }
  if (state.decipheredPoneglyphIds.includes(poneglyphId)) {
    return {
      success: false,
      message: '이미 해독을 완료한 포네그리프입니다.',
      berryBonus: 0,
      tpBonus: 0
    };
  }
  state.decipheredPoneglyphIds.push(poneglyphId);
  const berryBonus = Math.round(25000 * bonuses.rewardMult);
  const tpBonus = Math.round(25 * bonuses.rewardMult);
  state.berries += berryBonus;
  state.trainingPoints += tpBonus;
  state.voyageLog.push(
    `[포네그리프 해독] 니코 로빈이 고대 비문(${poneglyphId})을 해독! (+${berryBonus.toLocaleString()} 베리, +${tpBonus} 수련 포인트)`
  );
  return {
    success: true,
    message: `고대 비문 해독 완료! (+${berryBonus.toLocaleString()} 베리 / +${tpBonus} 수련 포인트)`,
    berryBonus,
    tpBonus
  };
}

export function purchaseTrainingUpgrade(
  state: RpgCampaignState,
  unitId: string,
  upgradeId: string,
  rpgRegistry: RpgDataRegistry
): { success: boolean; message: string } {
  const rule = rpgRegistry.trainingRules.find((r) => r.id === upgradeId);
  if (!rule) {
    return { success: false, message: '존재하지 않는 수련 항목입니다.' };
  }
  if (
    rule.requiredEpisodeId &&
    !state.completedEpisodes.includes(rule.requiredEpisodeId)
  ) {
    return {
      success: false,
      message: `선행 에피소드(${rule.requiredEpisodeId}) 클리어가 필요합니다.`
    };
  }
  if (
    state.berries < rule.costBerries ||
    state.trainingPoints < rule.costTrainingPoints
  ) {
    return {
      success: false,
      message: `자원이 부족합니다 (필요: ${rule.costBerries} 베리 / ${rule.costTrainingPoints} TP)`
    };
  }

  state.berries -= rule.costBerries;
  state.trainingPoints -= rule.costTrainingPoints;

  if (!state.unitHakiOverrides[unitId]) {
    state.unitHakiOverrides[unitId] = { armament: 1, observation: 1, conqueror: 0 };
  }

  if (rule.category === 'HAKI_ARMAMENT' && rule.targetTier) {
    state.unitHakiOverrides[unitId].armament = Math.max(
      state.unitHakiOverrides[unitId].armament,
      rule.targetTier
    ) as 0 | 1 | 2 | 3;
  } else if (rule.category === 'HAKI_OBSERVATION' && rule.targetTier) {
    state.unitHakiOverrides[unitId].observation = Math.max(
      state.unitHakiOverrides[unitId].observation,
      rule.targetTier
    ) as 0 | 1 | 2 | 3;
  } else if (rule.category === 'HAKI_CONQUEROR' && rule.targetTier) {
    state.unitHakiOverrides[unitId].conqueror = Math.max(
      state.unitHakiOverrides[unitId].conqueror,
      rule.targetTier
    ) as 0 | 1 | 2 | 3;
  } else if (rule.category === 'FORM_UNLOCK' && rule.targetFormId) {
    if (!state.unitUnlockedForms[unitId]) {
      state.unitUnlockedForms[unitId] = [];
    }
    if (!state.unitUnlockedForms[unitId].includes(rule.targetFormId)) {
      state.unitUnlockedForms[unitId].push(rule.targetFormId);
    }
  }

  state.unitLevelOverrides[unitId] = Math.min(
    100,
    (state.unitLevelOverrides[unitId] ?? 50) + 3
  );

  const msg = `[패기/각성 수련 완료] ${rule.name} 습득!`;
  state.voyageLog.push(msg);
  return { success: true, message: msg };
}

export function executeShipboardCooking(
  state: RpgCampaignState
): { success: boolean; message: string } {
  const hasCookAssigned =
    state.unlockedCrewRoles.includes('COOK') &&
    Boolean(state.assignedCrewRoles.COOK);

  if (!hasCookAssigned) {
    return {
      success: false,
      message: '요리사(Cook) 직책이 배치되지 않았습니다. 발라티에에서 상디를 영입하세요!'
    };
  }

  if (state.shipboardCookingCooldownSec > 0) {
    return {
      success: false,
      message: `선상 요리 준비 중입니다 (${state.shipboardCookingCooldownSec.toFixed(0)}초 후 이용 가능)`
    };
  }

  for (const uid of state.recruitedUnitIds) {
    const cur = state.partyHpRatios[uid] ?? 1.0;
    state.partyHpRatios[uid] = Math.min(1.0, Number((cur + 0.5).toFixed(2)));
  }
  state.nextBattleMealAtkBuffRatio = 0.1;
  state.shipboardCookingCooldownSec = 30;

  const cookName = state.assignedCrewRoles.COOK ?? '상디';
  const msg = `[선상 요리: ${cookName}] 특제 해적 정식 완성! 파티 HP +50% 회복 및 다음 전투 공격력 +10% 버프 적용!`;
  state.voyageLog.push(msg);
  return { success: true, message: msg };
}
