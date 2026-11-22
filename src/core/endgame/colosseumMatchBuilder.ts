import { SeededPRNG } from '../math/prng';
import type { BattleWorldConfig, UnitBuildConfig } from '../types/battleState';
import type { GameDataRegistry } from '../types/dataSchemas';
import type { RpgCampaignState } from '../types/rpgSchemas';
import type {
  ColosseumBracketMatch,
  ColosseumCompetitor,
  ColosseumLeagueDefinition,
  ColosseumTierId,
  ColosseumTournamentState,
  EndgameDataRegistry,
  WantedPosterFrameTier
} from './types';

export function isColosseumUnlocked(
  campaign: RpgCampaignState,
  endgameReg: EndgameDataRegistry
): boolean {
  if (campaign.debugUnlockEndgame) return true;
  return campaign.completedEpisodes.includes(endgameReg.colosseum.unlockEpisodeId);
}

export function getColosseumLeague(
  tierId: ColosseumTierId,
  endgameReg: EndgameDataRegistry
): ColosseumLeagueDefinition {
  const found = endgameReg.colosseum.leagues.find((l) => l.tierId === tierId);
  const fallback = endgameReg.colosseum.leagues[0];
  if (!found && !fallback) {
    throw new Error('Colosseum leagues list is empty');
  }
  return (found ?? fallback)!;
}

export function computePosterFrameTier(
  clearedTiers: ColosseumTierId[],
  tierWinCounts?: Partial<Record<ColosseumTierId, number>>
): WantedPosterFrameTier {
  const aWins = tierWinCounts?.A ?? (clearedTiers.includes('A') ? 1 : 0);
  const sWins = tierWinCounts?.S ?? (clearedTiers.includes('S') ? 1 : 0);

  if (sWins >= 3) return 'diamond';
  if (sWins >= 2 || aWins + sWins >= 3) return 'platinum';
  if (sWins >= 1 || aWins >= 1) return 'gold';
  return 'default';
}

export function createColosseumTournament(
  tierId: ColosseumTierId,
  playerUnitId: string,
  seed: number,
  ringOutEnabled: boolean,
  campaign: RpgCampaignState,
  gameReg: GameDataRegistry,
  endgameReg: EndgameDataRegistry
): ColosseumTournamentState {
  const league = getColosseumLeague(tierId, endgameReg);
  const prng = new SeededPRNG(seed >>> 0);
  const safePlayerId = gameReg.units[playerUnitId] ? playerUnitId : 'luffy';
  const playerDef =
    gameReg.units[safePlayerId] ?? Object.values(gameReg.units)[0];
  if (!playerDef) {
    throw new Error(`Missing player unit definition: ${safePlayerId}`);
  }

  const primaryPool = league.competitorPool.filter(
    (id) => id !== safePlayerId && Boolean(gameReg.units[id])
  );
  const fallbackPool = Object.keys(gameReg.units).filter(
    (id) =>
      id !== safePlayerId &&
      !id.startsWith('unit_') &&
      id !== 'doppelman' &&
      !primaryPool.includes(id)
  );
  const pool = [...primaryPool];
  const cpuIds: string[] = [];

  for (let i = 0; i < 7; i++) {
    if (pool.length > 0) {
      const idx = prng.nextInt(0, pool.length - 1);
      const picked = pool[idx];
      if (picked !== undefined) cpuIds.push(picked);
      pool.splice(idx, 1);
    } else if (fallbackPool.length > 0) {
      const idx = prng.nextInt(0, fallbackPool.length - 1);
      const picked = fallbackPool[idx];
      if (picked !== undefined) cpuIds.push(picked);
      fallbackPool.splice(idx, 1);
    }
  }

  const calcPower = (uid: string, level: number): number => {
    const d = gameReg.units[uid];
    if (!d) return 500;
    const sum =
      d.baseStats.hp * 0.5 +
      d.baseStats.atk +
      d.baseStats.def +
      d.baseStats.spAtk +
      d.baseStats.spDef +
      d.baseStats.spd;
    return Math.round(sum + level * 4);
  };

  const playerLevel = campaign.unitLevelOverrides[safePlayerId] ?? 55;
  const participants: ColosseumCompetitor[] = [
    {
      slotIndex: 0,
      unitId: safePlayerId,
      displayName: `${playerDef.name} (YOU)`,
      isPlayer: true,
      powerScore: calcPower(safePlayerId, playerLevel)
    },
    ...cpuIds.map((uid, idx) => {
      const def = gameReg.units[uid];
      return {
        slotIndex: idx + 1,
        unitId: uid,
        displayName: def?.name ?? uid,
        isPlayer: false,
        powerScore: calcPower(uid, 45 + league.aiLevel * 6)
      };
    })
  ];

  const matches: ColosseumBracketMatch[] = [
    { matchId: 'QF_0', round: 'QF', matchIndex: 0, participantA: participants[0] ?? null, participantB: participants[1] ?? null, winner: null, completed: false },
    { matchId: 'QF_1', round: 'QF', matchIndex: 1, participantA: participants[2] ?? null, participantB: participants[3] ?? null, winner: null, completed: false },
    { matchId: 'QF_2', round: 'QF', matchIndex: 2, participantA: participants[4] ?? null, participantB: participants[5] ?? null, winner: null, completed: false },
    { matchId: 'QF_3', round: 'QF', matchIndex: 3, participantA: participants[6] ?? null, participantB: participants[7] ?? null, winner: null, completed: false },
    { matchId: 'SF_0', round: 'SF', matchIndex: 0, participantA: null, participantB: null, winner: null, completed: false },
    { matchId: 'SF_1', round: 'SF', matchIndex: 1, participantA: null, participantB: null, winner: null, completed: false },
    { matchId: 'FINAL_0', round: 'FINAL', matchIndex: 0, participantA: null, participantB: null, winner: null, completed: false }
  ];

  return {
    tournamentId: `colosseum_${tierId}_${seed}`,
    seed: seed >>> 0,
    tierId,
    ringOutEnabled,
    playerUnitId: safePlayerId,
    participants,
    matches,
    currentRound: 'QF',
    champion: null,
    playerEliminated: false,
    rewardsClaimed: false
  };
}

export function getActivePlayerColosseumMatch(
  tournament: ColosseumTournamentState
): ColosseumBracketMatch | null {
  if (tournament.currentRound === 'COMPLETE' || tournament.playerEliminated) {
    return null;
  }
  return (
    tournament.matches.find(
      (m) =>
        m.round === tournament.currentRound &&
        !m.completed &&
        (m.participantA?.isPlayer || m.participantB?.isPlayer)
    ) ?? null
  );
}

export function buildColosseumMatchBattleConfig(
  tournament: ColosseumTournamentState,
  campaign: RpgCampaignState,
  gameReg: GameDataRegistry,
  endgameReg: EndgameDataRegistry
): BattleWorldConfig | null {
  const match = getActivePlayerColosseumMatch(tournament);
  if (!match || !match.participantA || !match.participantB) return null;

  const playerComp = match.participantA.isPlayer ? match.participantA : match.participantB;
  const oppComp = match.participantA.isPlayer ? match.participantB : match.participantA;

  const league = getColosseumLeague(tournament.tierId, endgameReg);
  const playerDef = gameReg.units[playerComp.unitId];
  const oppDef = gameReg.units[oppComp.unitId];
  if (!playerDef || !oppDef) {
    return null;
  }
  const playerMoves =
    campaign.unitEquippedMovesOverrides?.[playerComp.unitId] ?? playerDef.defaultMoves;

  const relicId = campaign.endgame.raids.equippedRelicMap[playerComp.unitId];
  const relicDef = relicId ? endgameReg.raidRelics[relicId] : undefined;

  const playerBuild: UnitBuildConfig = {
    instanceId: `colo_p_${playerComp.unitId}`,
    speciesId: playerComp.unitId,
    level: Math.max(50, campaign.unitLevelOverrides[playerComp.unitId] ?? 55),
    ivs: { hp: 24, atk: 24, def: 24, spAtk: 24, spDef: 24, spd: 24 },
    evs: { hp: 80, atk: 80, def: 80, spAtk: 80, spDef: 80, spd: 80 },
    moveIds: [...playerMoves.slice(0, 4)],
    equipmentId: playerDef.defaultEquipmentId,
    traitId: playerDef.traitId,
    formId:
      (campaign.unitUnlockedForms[playerComp.unitId]?.includes(playerDef.awakenedFormId ?? '')
        ? playerDef.awakenedFormId
        : playerDef.defaultFormId) ?? playerDef.defaultFormId,
    isPlayerControlled: true,
    aiLevel: 4,
    endgameBonuses: relicDef
      ? {
          atkMult: 1 + (relicDef.modifiers.atkBonusRatio ?? 0),
          maxHpMult: 1 + (relicDef.modifiers.maxHpBonusRatio ?? 0),
          fireDamageBonusRatio: relicDef.modifiers.fireDamageBonusRatio ?? 0,
          breakGaugeDamageRatio: relicDef.modifiers.breakGaugeDamageRatio ?? 0,
          dodgeRechargeBonus: relicDef.modifiers.dodgeCooldownBonusRatio ?? 0
        }
      : undefined
  };

  const roundBonusLevel =
    tournament.currentRound === 'FINAL' ? 6 : tournament.currentRound === 'SF' ? 3 : 0;

  const oppBuild: UnitBuildConfig = {
    instanceId: `colo_o_${oppComp.unitId}`,
    speciesId: oppComp.unitId,
    level: 44 + league.aiLevel * 6 + roundBonusLevel,
    ivs: { hp: 22, atk: 22, def: 22, spAtk: 22, spDef: 22, spd: 22 },
    evs: { hp: 70, atk: 70, def: 70, spAtk: 70, spDef: 70, spd: 70 },
    moveIds: [...oppDef.defaultMoves],
    equipmentId: oppDef.defaultEquipmentId,
    traitId: oppDef.traitId,
    formId: oppDef.awakenedFormId ?? oppDef.defaultFormId,
    isPlayerControlled: false,
    aiLevel: league.aiLevel
  };

  return {
    seed: (tournament.seed ^ (match.matchIndex * 997 + (tournament.currentRound === 'FINAL' ? 77 : 13))) >>> 0,
    arenaSizeKey: 'medium',
    mode: '1V1',
    teamAlpha: [playerBuild],
    teamOmega: [oppBuild],
    colosseumRingOut: tournament.ringOutEnabled
      ? { ...endgameReg.colosseum.ringOutDefaults, enabled: true }
      : undefined
  };
}
