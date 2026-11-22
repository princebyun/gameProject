import type { GameDataRegistry } from '../types/dataSchemas';
import type {
  CrewRoleId,
  RpgCampaignState,
  RpgDataRegistry
} from '../types/rpgSchemas';
import {
  computeBountyTier,
  recalculateTotalCrewBounty,
  syncShipHullStatsWithRoles
} from './crewRoleBonuses';

export {
  computeBountyTier,
  computeCrewRoleBonuses,
  recalculateTotalCrewBounty,
  syncShipHullStatsWithRoles,
  type AggregatedCrewRoleBonuses,
  type BountyTierInfo
} from './crewRoleBonuses';
export {
  decipherIslandPoneglyph,
  executeShipboardCooking,
  purchaseTrainingUpgrade
} from './crewTrainingEngine';

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
