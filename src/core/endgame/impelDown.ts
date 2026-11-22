import type { BattleWorldState } from '../types/battleState';
import type { GameDataRegistry } from '../types/dataSchemas';
import type { RpgCampaignState } from '../types/rpgSchemas';
import {
  drawSeededBuffChoices,
  getFloorDefinitionForRun,
  suspendCloneRun
} from './impelDownFloorBuilder';
import type {
  EndgameDataRegistry,
  ImpelDownBuffDefinition,
  ImpelDownRunState,
  ImpelDownUnitCarryover
} from './types';

export {
  aggregateImpelDownBuffBonuses,
  buildImpelDownFloorBattleConfig,
  drawSeededBuffChoices,
  getFloorDefinitionForRun,
  isImpelDownUnlocked,
  suspendCloneRun
} from './impelDownFloorBuilder';

export function startImpelDownRun(
  partyUnitIds: string[],
  seed: number,
  campaign: RpgCampaignState,
  gameReg: GameDataRegistry,
  endgameReg: EndgameDataRegistry
): ImpelDownRunState {
  const maxParty = endgameReg.impelDown.maxPartySize;
  const sanitizedParty = partyUnitIds
    .filter((uid) => Boolean(gameReg.units[uid]))
    .slice(0, maxParty);
  const finalParty =
    sanitizedParty.length > 0 ? sanitizedParty : [campaign.activePartyUnitIds[0] ?? 'luffy'];

  const carryoverMap: Record<string, ImpelDownUnitCarryover> = {};
  for (const uid of finalParty) {
    const unitDef = gameReg.units[uid];
    if (!unitDef) continue;
    const moveIds = campaign.unitEquippedMovesOverrides?.[uid] ?? unitDef.defaultMoves;
    const moveChargesMap: Record<string, number> = {};
    for (const mId of moveIds.slice(0, 4)) {
      const mDef = gameReg.moves[mId];
      if (mDef) {
        moveChargesMap[mId] = mDef.maxCharges;
      }
    }
    carryoverMap[uid] = {
      unitId: uid,
      hpRatio: 1.0,
      moveChargesMap,
      awakeningReadyRatio: 0
    };
  }

  const run: ImpelDownRunState = {
    runId: `impel_${seed}_${finalParty.join('_')}`,
    seed: seed >>> 0,
    currentFloor: 1,
    isEndlessMode: false,
    partyUnitIds: finalParty,
    carryoverMap,
    selectedBuffIds: [],
    pendingDraftBuffIds: null,
    status: 'IN_FLOOR',
    totalBerriesEarned: 0,
    totalTpEarned: 0
  };

  campaign.endgame.impelDown.activeRun = suspendCloneRun(run);
  return run;
}

export function recordImpelDownFloorOutcome(
  run: ImpelDownRunState,
  world: BattleWorldState,
  victory: boolean,
  campaign: RpgCampaignState,
  endgameReg: EndgameDataRegistry
): {
  clearedFloor: number;
  draftChoices: ImpelDownBuffDefinition[];
  berriesAwarded: number;
  tpAwarded: number;
} {
  for (const unit of world.units) {
    if (unit.team !== 'ALPHA' || unit.isMinion) continue;
    const hpRatio = unit.isAlive
      ? Math.max(0.01, Math.min(1.0, unit.hp / Math.max(1, unit.maxHp)))
      : 0;
    const moveChargesMap: Record<string, number> = {};
    for (const slot of unit.moveSlots) {
      moveChargesMap[slot.moveId] = Math.max(0, Math.floor(slot.charges));
    }
    const prev = run.carryoverMap[unit.speciesId];
    run.carryoverMap[unit.speciesId] = {
      unitId: unit.speciesId,
      hpRatio,
      moveChargesMap,
      awakeningReadyRatio: prev?.awakeningReadyRatio ?? 0
    };
  }

  const floorDef = getFloorDefinitionForRun(run.currentFloor, run.seed, endgameReg);

  if (!victory) {
    run.status = 'FAILED';
    run.pendingDraftBuffIds = null;
    campaign.endgame.impelDown.activeRun = null;
    campaign.voyageLog.push(
      `[임펠 다운 패배] ${floorDef.name}에서 전멸했습니다. (최고 기록: Level ${campaign.endgame.impelDown.highestFloor})`
    );
    return {
      clearedFloor: 0,
      draftChoices: [],
      berriesAwarded: 0,
      tpAwarded: 0
    };
  }

  const clearedFloor = run.currentFloor;
  if (clearedFloor > campaign.endgame.impelDown.highestFloor) {
    campaign.endgame.impelDown.highestFloor = clearedFloor;
  }

  campaign.berries += floorDef.berryReward;
  campaign.trainingPoints += floorDef.trainingPointReward;
  run.totalBerriesEarned += floorDef.berryReward;
  run.totalTpEarned += floorDef.trainingPointReward;

  const draftChoices = drawSeededBuffChoices(run, endgameReg, 3);
  run.pendingDraftBuffIds = draftChoices.map((b) => b.id);
  run.status = 'DRAFTING';

  campaign.endgame.impelDown.activeRun = suspendCloneRun(run);
  campaign.voyageLog.push(
    `[임펠 다운 돌파] ${floorDef.name} 클리어! (+${floorDef.berryReward.toLocaleString()} 베리, +${floorDef.trainingPointReward} TP) — 3택 유물 버프를 선택하세요.`
  );

  return {
    clearedFloor,
    draftChoices,
    berriesAwarded: floorDef.berryReward,
    tpAwarded: floorDef.trainingPointReward
  };
}

export function selectImpelDownDraftBuff(
  run: ImpelDownRunState,
  buffId: string,
  campaign: RpgCampaignState,
  gameReg: GameDataRegistry,
  endgameReg: EndgameDataRegistry
): { applied: boolean; buff: ImpelDownBuffDefinition | null; message: string } {
  if (run.status !== 'DRAFTING' || !run.pendingDraftBuffIds?.includes(buffId)) {
    return {
      applied: false,
      buff: null,
      message: '현재 드래프트 선택지에 없는 버프입니다.'
    };
  }

  const buff = endgameReg.impelDown.buffs.find((b) => b.id === buffId) ?? null;
  if (!buff) {
    return { applied: false, buff: null, message: '존재하지 않는 버프 ID입니다.' };
  }

  run.selectedBuffIds.push(buff.id);
  run.pendingDraftBuffIds = null;

  for (const uid of run.partyUnitIds) {
    const entry = run.carryoverMap[uid];
    if (!entry) continue;

    if (buff.effect.healPartyHpRatio && entry.hpRatio > 0) {
      entry.hpRatio = Math.min(1.0, entry.hpRatio + buff.effect.healPartyHpRatio);
    }

    if (buff.effect.restorePpRatio && entry.hpRatio > 0) {
      const unitDef = gameReg.units[uid];
      if (unitDef) {
        for (const [mId, curCharges] of Object.entries(entry.moveChargesMap)) {
          const mDef = gameReg.moves[mId];
          if (!mDef) continue;
          const add = Math.max(1, Math.ceil(mDef.maxCharges * buff.effect.restorePpRatio));
          entry.moveChargesMap[mId] = Math.min(mDef.maxCharges, curCharges + add);
        }
      }
    }

    if (buff.effect.startAwakeningGaugeRatio && entry.hpRatio > 0) {
      entry.awakeningReadyRatio = Math.min(
        1.0,
        entry.awakeningReadyRatio + buff.effect.startAwakeningGaugeRatio
      );
    }
  }

  if (run.currentFloor === 6 && !run.isEndlessMode) {
    run.status = 'FLOOR6_CLEAR_CHOICE';
  } else {
    run.currentFloor += 1;
    run.status = 'IN_FLOOR';
  }

  campaign.endgame.impelDown.activeRun = suspendCloneRun(run);
  campaign.voyageLog.push(`[임펠 다운 버프 획득] ${buff.icon} ${buff.name} 적용 완료!`);

  return {
    applied: true,
    buff,
    message: `${buff.icon} ${buff.name} 선택 완료!`
  };
}

export function continueImpelDownEndless(
  run: ImpelDownRunState,
  campaign: RpgCampaignState
): void {
  run.isEndlessMode = true;
  run.currentFloor = Math.max(7, run.currentFloor + 1);
  run.status = 'IN_FLOOR';
  campaign.endgame.impelDown.activeRun = suspendCloneRun(run);
  campaign.voyageLog.push(
    `[임펠 다운 무한 심층] Level ${run.currentFloor} 무한 지옥 도전을 시작합니다!`
  );
}

export function completeAndExitImpelDownRun(campaign: RpgCampaignState): void {
  campaign.endgame.impelDown.activeRun = null;
  campaign.voyageLog.push('[임펠 다운 완주] 6층 무한지옥 정복을 마치고 귀환했습니다!');
}

export function suspendImpelDownRun(
  campaign: RpgCampaignState,
  run: ImpelDownRunState
): ImpelDownRunState {
  const snapshot = suspendCloneRun(run);
  campaign.endgame.impelDown.activeRun = snapshot;
  return snapshot;
}

export function resumeImpelDownRun(
  campaign: RpgCampaignState
): ImpelDownRunState | null {
  if (!campaign.endgame.impelDown.activeRun) return null;
  return suspendCloneRun(campaign.endgame.impelDown.activeRun);
}
