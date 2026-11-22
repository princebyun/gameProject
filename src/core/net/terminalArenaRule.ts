import type { SaveEnvelope, SaveUnitProgress } from '../save/schema';
import { computeSaveIntegrity } from '../save/sha256';
import type { GameDataRegistry, StatBlock } from '../types/dataSchemas';
import type { UnitBuildConfig } from '../types/battleState';
import type { RpgCampaignState } from '../types/rpgSchemas';

const STANDARD_EVS: StatBlock = {
  hp: 100,
  atk: 100,
  def: 100,
  spAtk: 100,
  spDef: 100,
  spd: 100
};

export function createStandardPresetBuild(
  speciesId: string,
  instanceId: string,
  isPlayerControlled: boolean,
  aiLevel: number,
  gameRegistry: GameDataRegistry
): UnitBuildConfig {
  const unitDef =
    gameRegistry.units[speciesId] ?? Object.values(gameRegistry.units)[0];
  if (!unitDef) {
    throw new Error(`Missing unit definition for speciesId=${speciesId}`);
  }
  return {
    instanceId,
    speciesId: unitDef.id,
    level: 50,
    ivs: { hp: 31, atk: 31, def: 31, spAtk: 31, spDef: 31, spd: 31 },
    evs: { ...STANDARD_EVS },
    moveIds: [...unitDef.defaultMoves],
    equipmentId: unitDef.defaultEquipmentId,
    traitId: unitDef.traitId,
    formId: unitDef.defaultFormId,
    isPlayerControlled,
    aiLevel
  };
}

export interface PreTerminalPartySnapshot {
  unitProgressSnapshot: Record<string, SaveUnitProgress>;
  berries: number;
  bounty: number;
}

export function capturePreTerminalPartySnapshot(
  envelope: SaveEnvelope
): PreTerminalPartySnapshot {
  const snap: Record<string, SaveUnitProgress> = {};
  for (const [uid, prog] of Object.entries(
    envelope.payload.crew.unitProgressMap
  )) {
    snap[uid] = {
      ...prog,
      movePpMap: { ...prog.movePpMap },
      equippedMoveIds: [...prog.equippedMoveIds],
      unlockedFormIds: [...prog.unlockedFormIds],
      haki: { ...prog.haki }
    };
  }
  return {
    unitProgressSnapshot: snap,
    berries: envelope.payload.economy.berry,
    bounty: envelope.payload.economy.bounty
  };
}

/**
 * Enforces the Island Battle Terminal Non-Destructive Rule:
 * - Restores pre-battle unit HP and move PP/Charges 100% without loss
 * - Increments only onlineStats (wins / losses / draws)
 * - Re-signs the SaveEnvelope integrity block
 */
export function applyTerminalBattleOutcome(
  campaign: RpgCampaignState,
  envelope: SaveEnvelope,
  outcome: 'WIN' | 'LOSS' | 'DRAW',
  preMatchSnapshot: PreTerminalPartySnapshot
): SaveEnvelope {
  // 1. Restore pre-battle unit HP & move PP
  for (const [uid, snapProg] of Object.entries(
    preMatchSnapshot.unitProgressSnapshot
  )) {
    if (envelope.payload.crew.unitProgressMap[uid]) {
      envelope.payload.crew.unitProgressMap[uid].currentHp = snapProg.currentHp;
      envelope.payload.crew.unitProgressMap[uid].movePpMap = {
        ...snapProg.movePpMap
      };
    }
  }

  // 2. Increment onlineStats only
  if (!campaign.onlineStats) {
    campaign.onlineStats = { wins: 0, losses: 0, draws: 0 };
  }
  if (outcome === 'WIN') campaign.onlineStats.wins += 1;
  else if (outcome === 'LOSS') campaign.onlineStats.losses += 1;
  else campaign.onlineStats.draws += 1;

  envelope.payload.economy.onlineStats = { ...campaign.onlineStats };

  if (!envelope.meta.antiCheat.isTampered) {
    envelope.meta.integrity = computeSaveIntegrity(
      envelope.meta.saveVersion,
      envelope.meta.battleCalcVersion,
      envelope.payload
    );
  }

  campaign.voyageLog.push(
    `[대전 단말기 전적 갱신] 결과: ${outcome} (통산 ${campaign.onlineStats.wins}승 ${campaign.onlineStats.losses}패 ${campaign.onlineStats.draws}무 — 파티 HP/PP 무손실 복원)`
  );

  return envelope;
}
