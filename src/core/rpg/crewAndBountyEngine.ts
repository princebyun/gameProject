import type { GameDataRegistry } from '../types/dataSchemas';
import type {
  CrewRoleId,
  RpgCampaignState,
  RpgDataRegistry
} from '../types/rpgSchemas';

export interface BountyTierInfo {
  tier: 1 | 2 | 3 | 4 | 5;
  rankLabel: string;
  patrolAiLevel: 1 | 2 | 3 | 4 | 5;
  patrolCompositionLabel: string;
  patrolEnemyIds: string[];
}

export function computeBountyTier(totalBounty: number): BountyTierInfo {
  if (totalBounty >= 3_000_000_000) {
    return {
      tier: 5,
      rankLabel: '사황 (Four Emperors)',
      patrolAiLevel: 5,
      patrolCompositionLabel: '해군본부 대장 & 세라핌 포위 함대',
      patrolEnemyIds: ['kizaru', 'lucci']
    };
  }
  if (totalBounty >= 1_000_000_000) {
    return {
      tier: 4,
      rankLabel: '바다의 제왕 (오황)',
      patrolAiLevel: 4,
      patrolCompositionLabel: 'CP0 각성 요원 & 본부 중장 함대',
      patrolEnemyIds: ['lucci', 'kizaru']
    };
  }
  if (totalBounty >= 250_000_000) {
    return {
      tier: 3,
      rankLabel: '최악의 세대 (Worst Generation)',
      patrolAiLevel: 3,
      patrolCompositionLabel: '해군 중장 & CP9 정예 타격대',
      patrolEnemyIds: ['lucci']
    };
  }
  if (totalBounty >= 30_000_000) {
    return {
      tier: 2,
      rankLabel: '주목받는 초신성 (Supernova)',
      patrolAiLevel: 2,
      patrolCompositionLabel: '해군 본부 장교 초계함',
      patrolEnemyIds: ['lucci']
    };
  }
  return {
    tier: 1,
    rankLabel: '이스트 블루 루키 (Rookie)',
    patrolAiLevel: 1,
    patrolCompositionLabel: '해군 지부 해병 순찰선',
    patrolEnemyIds: ['lucci']
  };
}

export interface AggregatedCrewRoleBonuses {
  sailingSpeedMult: number;
  stormResistanceRatio: number;
  revealsHiddenChests: boolean;
  openingAtkMult: number;
  maxHpMealMult: number;
  postBattleHealRatio: number;
  hullMaxHpMult: number;
  hullAutoRepairBonus: number;
  rewardMult: number;
  awakeningChargeMult: number;
  skillCooldownReductionRatio: number;
  canDecipherPoneglyphs: boolean;
  shipTurnSpeedMult: number;
  currentAndStormDriftResist: number;
  coupDeBurstCooldownReductionRatio: number;
}

export function computeCrewRoleBonuses(
  state: RpgCampaignState,
  rpgRegistry: RpgDataRegistry
): AggregatedCrewRoleBonuses {
  const bonuses: AggregatedCrewRoleBonuses = {
    sailingSpeedMult: 1.0,
    stormResistanceRatio: 0,
    revealsHiddenChests: false,
    openingAtkMult: 1.0,
    maxHpMealMult: 1.0,
    postBattleHealRatio: 0,
    hullMaxHpMult: 1.0,
    hullAutoRepairBonus: 0,
    rewardMult: 1.0,
    awakeningChargeMult: 1.0,
    skillCooldownReductionRatio: 0,
    canDecipherPoneglyphs: false,
    shipTurnSpeedMult: 1.0,
    currentAndStormDriftResist: 0,
    coupDeBurstCooldownReductionRatio: 0
  };

  for (const [roleIdStr, holder] of Object.entries(state.assignedCrewRoles)) {
    if (!holder) continue;
    const roleDef = rpgRegistry.crewRoles[roleIdStr as CrewRoleId];
    if (!roleDef) continue;

    if (roleDef.sailingSpeedBonusRatio) {
      bonuses.sailingSpeedMult += roleDef.sailingSpeedBonusRatio;
    }
    if (roleDef.stormResistanceRatio) {
      bonuses.stormResistanceRatio = Math.max(
        bonuses.stormResistanceRatio,
        roleDef.stormResistanceRatio
      );
    }
    if (roleDef.revealsHiddenChests) {
      bonuses.revealsHiddenChests = true;
    }
    if (roleDef.openingAtkBonusRatio) {
      bonuses.openingAtkMult += roleDef.openingAtkBonusRatio;
    }
    if (roleDef.maxHpMealBonusRatio) {
      bonuses.maxHpMealMult += roleDef.maxHpMealBonusRatio;
    }
    if (roleDef.postBattleHealRatio) {
      bonuses.postBattleHealRatio = Math.max(
        bonuses.postBattleHealRatio,
        roleDef.postBattleHealRatio
      );
    }
    if (roleDef.hullMaxHpBonusRatio) {
      bonuses.hullMaxHpMult += roleDef.hullMaxHpBonusRatio;
    }
    if (roleDef.hullAutoRepairPerSec) {
      bonuses.hullAutoRepairBonus += roleDef.hullAutoRepairPerSec;
    }
    if (roleDef.rewardBonusRatio) {
      bonuses.rewardMult += roleDef.rewardBonusRatio;
    }
    if (roleDef.awakeningChargeBonusRatio) {
      bonuses.awakeningChargeMult += roleDef.awakeningChargeBonusRatio;
    }
    if (roleDef.skillCooldownReductionRatio) {
      bonuses.skillCooldownReductionRatio = Math.max(
        bonuses.skillCooldownReductionRatio,
        roleDef.skillCooldownReductionRatio
      );
    }
    if (roleDef.canDecipherPoneglyphs) {
      bonuses.canDecipherPoneglyphs = true;
    }
    if (roleDef.shipTurnSpeedBonusRatio) {
      bonuses.shipTurnSpeedMult += roleDef.shipTurnSpeedBonusRatio;
    }
    if (roleDef.currentAndStormDriftResistRatio) {
      bonuses.currentAndStormDriftResist = Math.max(
        bonuses.currentAndStormDriftResist,
        roleDef.currentAndStormDriftResistRatio
      );
    }
    if (roleDef.coupDeBurstCooldownReductionRatio) {
      bonuses.coupDeBurstCooldownReductionRatio = Math.max(
        bonuses.coupDeBurstCooldownReductionRatio,
        roleDef.coupDeBurstCooldownReductionRatio
      );
    }
  }

  return bonuses;
}

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

export function recalculateTotalCrewBounty(state: RpgCampaignState): number {
  let sum = 0;
  for (const uid of state.recruitedUnitIds) {
    sum += state.unitBounties[uid] ?? 0;
  }
  state.totalCrewBounty = sum;
  return sum;
}

export function recruitCrewMember(
  state: RpgCampaignState,
  unitId: string,
  rpgRegistry: RpgDataRegistry,
  gameRegistry: GameDataRegistry
): boolean {
  const unitDef = gameRegistry.units[unitId];
  if (!unitDef) return false;

  const alreadyRecruited = state.recruitedUnitIds.includes(unitId);
  if (!alreadyRecruited) {
    state.recruitedUnitIds.push(unitId);
  }
  if (!state.activePartyUnitIds.includes(unitId) && state.activePartyUnitIds.length < 6) {
    state.activePartyUnitIds.push(unitId);
  }

  const rule = rpgRegistry.recruitmentRules.find((r) => r.unitId === unitId);
  if (rule) {
    if (!state.unlockedCrewRoles.includes(rule.defaultRole)) {
      state.unlockedCrewRoles.push(rule.defaultRole);
    }
    if (!state.assignedCrewRoles[rule.defaultRole]) {
      state.assignedCrewRoles[rule.defaultRole] = unitId;
    }
    if ((state.unitBounties[unitId] ?? 0) < rule.initialBounty) {
      state.unitBounties[unitId] = rule.initialBounty;
    }
    if (!alreadyRecruited) {
      state.voyageLog.push(`[동료 영입] ${unitDef.name} 합류! ("${rule.joinDialogue}")`);
    }
  } else if (!alreadyRecruited) {
    state.voyageLog.push(`[동료 영입] ${unitDef.name} 파티에 합류!`);
  }

  recalculateTotalCrewBounty(state);
  syncShipHullStatsWithRoles(state, rpgRegistry);
  return !alreadyRecruited;
}

export function syncShipHullStatsWithRoles(
  state: RpgCampaignState,
  rpgRegistry: RpgDataRegistry
): void {
  const shipDef = rpgRegistry.ships[state.ship.shipId];
  if (!shipDef) return;
  const bonuses = computeCrewRoleBonuses(state, rpgRegistry);
  const newMax = Math.round(shipDef.maxHullHp * bonuses.hullMaxHpMult);
  const delta = newMax - state.ship.maxHullHp;
  state.ship.maxHullHp = newMax;
  if (delta > 0) {
    state.ship.hullHp = Math.min(newMax, state.ship.hullHp + delta);
  } else {
    state.ship.hullHp = Math.min(newMax, state.ship.hullHp);
  }
}

export function assignCrewRole(
  state: RpgCampaignState,
  roleId: CrewRoleId,
  holderIdOrName: string,
  rpgRegistry: RpgDataRegistry
): void {
  if (!state.unlockedCrewRoles.includes(roleId)) {
    state.unlockedCrewRoles.push(roleId);
  }
  state.assignedCrewRoles[roleId] = holderIdOrName;
  syncShipHullStatsWithRoles(state, rpgRegistry);
}

export function increaseCaptainBounty(
  state: RpgCampaignState,
  bountyIncrease: number,
  reason: string,
  gameRegistry: GameDataRegistry
): void {
  if (bountyIncrease <= 0) return;
  const captainId = state.recruitedUnitIds[0] ?? 'luffy';
  const unitDef = gameRegistry.units[captainId];
  const prev = state.unitBounties[captainId] ?? 0;
  const next = prev + bountyIncrease;
  state.unitBounties[captainId] = next;

  // Also increase crewmates' bounties proportionally
  for (const uid of state.recruitedUnitIds) {
    if (uid === captainId) continue;
    const uPrev = state.unitBounties[uid] ?? 0;
    state.unitBounties[uid] = uPrev + Math.round(bountyIncrease * 0.35);
  }

  recalculateTotalCrewBounty(state);

  state.latestWantedPoster = {
    unitId: captainId,
    characterName: unitDef?.name ?? '몽키 D. 루피',
    title: unitDef?.title ?? '밀짚모자 일당 선장',
    previousBounty: prev,
    newBounty: next,
    reason
  };

  const tierInfo = computeBountyTier(state.totalCrewBounty);
  state.voyageLog.push(
    `[수배서 갱신] ${state.latestWantedPoster.characterName} 현상금: ${next.toLocaleString()} 베리 (${tierInfo.rankLabel})`
  );
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

/**
 * Stage 2-A: Sanji's Cook Role — Shipboard Cooking (선상 요리)
 * Cooldown-based (30s), zero berry/ingredient cost: restores party HP by +50%
 * and grants a +10% ATK meal buff for the next battle.
 */
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
