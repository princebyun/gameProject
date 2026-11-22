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

    if (roleDef.sailingSpeedBonusRatio) bonuses.sailingSpeedMult += roleDef.sailingSpeedBonusRatio;
    if (roleDef.stormResistanceRatio) {
      bonuses.stormResistanceRatio = Math.max(bonuses.stormResistanceRatio, roleDef.stormResistanceRatio);
    }
    if (roleDef.revealsHiddenChests) bonuses.revealsHiddenChests = true;
    if (roleDef.openingAtkBonusRatio) bonuses.openingAtkMult += roleDef.openingAtkBonusRatio;
    if (roleDef.maxHpMealBonusRatio) bonuses.maxHpMealMult += roleDef.maxHpMealBonusRatio;
    if (roleDef.postBattleHealRatio) {
      bonuses.postBattleHealRatio = Math.max(bonuses.postBattleHealRatio, roleDef.postBattleHealRatio);
    }
    if (roleDef.hullMaxHpBonusRatio) bonuses.hullMaxHpMult += roleDef.hullMaxHpBonusRatio;
    if (roleDef.hullAutoRepairPerSec) bonuses.hullAutoRepairBonus += roleDef.hullAutoRepairPerSec;
    if (roleDef.rewardBonusRatio) bonuses.rewardMult += roleDef.rewardBonusRatio;
    if (roleDef.awakeningChargeBonusRatio) bonuses.awakeningChargeMult += roleDef.awakeningChargeBonusRatio;
    if (roleDef.skillCooldownReductionRatio) {
      bonuses.skillCooldownReductionRatio = Math.max(
        bonuses.skillCooldownReductionRatio,
        roleDef.skillCooldownReductionRatio
      );
    }
    if (roleDef.canDecipherPoneglyphs) bonuses.canDecipherPoneglyphs = true;
    if (roleDef.shipTurnSpeedBonusRatio) bonuses.shipTurnSpeedMult += roleDef.shipTurnSpeedBonusRatio;
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

export function recalculateTotalCrewBounty(state: RpgCampaignState): number {
  let sum = 0;
  for (const uid of state.recruitedUnitIds) {
    sum += state.unitBounties[uid] ?? 0;
  }
  state.totalCrewBounty = sum;
  return sum;
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
