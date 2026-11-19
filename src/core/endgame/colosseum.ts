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
  TutorMoveDefinition,
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
  return found ?? endgameReg.colosseum.leagues[0];
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
  const playerDef = gameReg.units[safePlayerId];

  // Build candidate pool of 7 unique CPU fighters
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
      cpuIds.push(pool[idx]);
      pool.splice(idx, 1);
    } else if (fallbackPool.length > 0) {
      const idx = prng.nextInt(0, fallbackPool.length - 1);
      cpuIds.push(fallbackPool[idx]);
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

  // 8-player bracket: QF (4 matches), SF (2 matches), FINAL (1 match)
  const matches: ColosseumBracketMatch[] = [
    {
      matchId: 'QF_0',
      round: 'QF',
      matchIndex: 0,
      participantA: participants[0],
      participantB: participants[1],
      winner: null,
      completed: false
    },
    {
      matchId: 'QF_1',
      round: 'QF',
      matchIndex: 1,
      participantA: participants[2],
      participantB: participants[3],
      winner: null,
      completed: false
    },
    {
      matchId: 'QF_2',
      round: 'QF',
      matchIndex: 2,
      participantA: participants[4],
      participantB: participants[5],
      winner: null,
      completed: false
    },
    {
      matchId: 'QF_3',
      round: 'QF',
      matchIndex: 3,
      participantA: participants[6],
      participantB: participants[7],
      winner: null,
      completed: false
    },
    {
      matchId: 'SF_0',
      round: 'SF',
      matchIndex: 0,
      participantA: null,
      participantB: null,
      winner: null,
      completed: false
    },
    {
      matchId: 'SF_1',
      round: 'SF',
      matchIndex: 1,
      participantA: null,
      participantB: null,
      winner: null,
      completed: false
    },
    {
      matchId: 'FINAL_0',
      round: 'FINAL',
      matchIndex: 0,
      participantA: null,
      participantB: null,
      winner: null,
      completed: false
    }
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

  const playerComp = match.participantA.isPlayer
    ? match.participantA
    : match.participantB;
  const oppComp = match.participantA.isPlayer
    ? match.participantB
    : match.participantA;

  const league = getColosseumLeague(tournament.tierId, endgameReg);
  const playerDef = gameReg.units[playerComp.unitId];
  const oppDef = gameReg.units[oppComp.unitId];
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
      (campaign.unitUnlockedForms[playerComp.unitId]?.includes(
        playerDef.awakenedFormId ?? ''
      )
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
    tournament.currentRound === 'FINAL'
      ? 6
      : tournament.currentRound === 'SF'
        ? 3
        : 0;

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

function resolveCpuMatchDeterministically(
  match: ColosseumBracketMatch,
  prng: SeededPRNG
): void {
  if (match.completed || !match.participantA || !match.participantB) return;
  const scoreA = match.participantA.powerScore + prng.nextRange(-65, 65);
  const scoreB = match.participantB.powerScore + prng.nextRange(-65, 65);
  match.winner = scoreA >= scoreB ? match.participantA : match.participantB;
  match.completed = true;
}

function propagateWinnersToNextRound(tournament: ColosseumTournamentState): void {
  const qf = tournament.matches.filter((m) => m.round === 'QF');
  const sf = tournament.matches.filter((m) => m.round === 'SF');
  const fin = tournament.matches.find((m) => m.round === 'FINAL')!;

  if (qf.every((m) => m.completed)) {
    sf[0].participantA = qf[0].winner;
    sf[0].participantB = qf[1].winner;
    sf[1].participantA = qf[2].winner;
    sf[1].participantB = qf[3].winner;
  }
  if (sf.every((m) => m.completed)) {
    fin.participantA = sf[0].winner;
    fin.participantB = sf[1].winner;
  }
}

export function recordColosseumPlayerMatchResult(
  tournament: ColosseumTournamentState,
  playerWon: boolean,
  resolvedByRingOut: boolean,
  campaign: RpgCampaignState,
  endgameReg: EndgameDataRegistry
): {
  tournamentFinished: boolean;
  playerChampion: boolean;
  cpAwarded: number;
  berriesAwarded: number;
  tpAwarded: number;
  newFrameTier: WantedPosterFrameTier;
} {
  const match = getActivePlayerColosseumMatch(tournament);
  if (!match || !match.participantA || !match.participantB) {
    return {
      tournamentFinished: tournament.currentRound === 'COMPLETE',
      playerChampion: Boolean(tournament.champion?.isPlayer),
      cpAwarded: 0,
      berriesAwarded: 0,
      tpAwarded: 0,
      newFrameTier: campaign.endgame.colosseum.posterFrameTier
    };
  }

  const playerComp = match.participantA.isPlayer
    ? match.participantA
    : match.participantB;
  const oppComp = match.participantA.isPlayer
    ? match.participantB
    : match.participantA;

  match.winner = playerWon ? playerComp : oppComp;
  match.completed = true;
  match.resolvedByRingOut = resolvedByRingOut;

  const prng = new SeededPRNG(
    (tournament.seed ^ (tournament.currentRound === 'QF' ? 101 : tournament.currentRound === 'SF' ? 202 : 303)) >>> 0
  );

  // Resolve all sibling CPU matches in the current round
  for (const m of tournament.matches) {
    if (m.round === tournament.currentRound && !m.completed) {
      resolveCpuMatchDeterministically(m, prng);
    }
  }
  propagateWinnersToNextRound(tournament);

  if (!playerWon) {
    tournament.playerEliminated = true;
    // Simulate remaining tournament rounds so bracket finishes cleanly
    for (const m of tournament.matches) {
      if (m.round === 'SF' && !m.completed) {
        resolveCpuMatchDeterministically(m, prng);
      }
    }
    propagateWinnersToNextRound(tournament);
    const fin = tournament.matches.find((m) => m.round === 'FINAL')!;
    if (!fin.completed) {
      resolveCpuMatchDeterministically(fin, prng);
    }
    tournament.champion = fin.winner;
    tournament.currentRound = 'COMPLETE';
    campaign.voyageLog.push(
      `[코리다 콜로세움] ${tournament.tierId}급 토너먼트에서 탈락했습니다. (최종 우승: ${fin.winner?.displayName ?? 'CPU'})`
    );
    return {
      tournamentFinished: true,
      playerChampion: false,
      cpAwarded: 0,
      berriesAwarded: 0,
      tpAwarded: 0,
      newFrameTier: campaign.endgame.colosseum.posterFrameTier
    };
  }

  // Player won the current round!
  if (tournament.currentRound === 'QF') {
    tournament.currentRound = 'SF';
    return {
      tournamentFinished: false,
      playerChampion: false,
      cpAwarded: 0,
      berriesAwarded: 0,
      tpAwarded: 0,
      newFrameTier: campaign.endgame.colosseum.posterFrameTier
    };
  }
  if (tournament.currentRound === 'SF') {
    tournament.currentRound = 'FINAL';
    return {
      tournamentFinished: false,
      playerChampion: false,
      cpAwarded: 0,
      berriesAwarded: 0,
      tpAwarded: 0,
      newFrameTier: campaign.endgame.colosseum.posterFrameTier
    };
  }

  // Player won FINAL -> Champion!
  tournament.champion = playerComp;
  tournament.currentRound = 'COMPLETE';

  const league = getColosseumLeague(tournament.tierId, endgameReg);
  const cpAwarded = Math.round(league.baseCpReward * league.rewardMultiplier);
  const berriesAwarded = Math.round(league.baseBerryReward * league.rewardMultiplier);
  const tpAwarded = Math.round(league.baseTrainingPointReward * league.rewardMultiplier);

  if (!tournament.rewardsClaimed) {
    tournament.rewardsClaimed = true;
    const colo = campaign.endgame.colosseum;
    colo.cp = Math.min(endgameReg.colosseum.maxLegalCp, colo.cp + cpAwarded);
    if (!colo.clearedTiers.includes(tournament.tierId)) {
      colo.clearedTiers.push(tournament.tierId);
    }
    if (!colo.tierWinCounts) {
      colo.tierWinCounts = {};
    }
    colo.tierWinCounts[tournament.tierId] = (colo.tierWinCounts[tournament.tierId] ?? 0) + 1;
    colo.posterFrameTier = computePosterFrameTier(colo.clearedTiers, colo.tierWinCounts);

    campaign.berries += berriesAwarded;
    campaign.trainingPoints += tpAwarded;

    campaign.voyageLog.push(
      `[코리다 콜로세움 우승!] ${league.name} 제패! (+${cpAwarded} CP, +${berriesAwarded.toLocaleString()} 베리, +${tpAwarded} TP / 수배서 프레임: ${colo.posterFrameTier.toUpperCase()})`
    );
  }

  return {
    tournamentFinished: true,
    playerChampion: true,
    cpAwarded,
    berriesAwarded,
    tpAwarded,
    newFrameTier: campaign.endgame.colosseum.posterFrameTier
  };
}

export function purchaseTutorMove(
  unitId: string,
  moveId: string,
  equipSlotIndex: number | null,
  campaign: RpgCampaignState,
  gameReg: GameDataRegistry,
  endgameReg: EndgameDataRegistry
): { success: boolean; message: string; remainingCp: number } {
  const unitDef = gameReg.units[unitId];
  const tutorDef: TutorMoveDefinition | undefined = endgameReg.tutorMoves[moveId];
  const moveDef = gameReg.moves[moveId];
  const colo = campaign.endgame.colosseum;

  if (!unitDef) {
    return { success: false, message: '존재하지 않는 캐릭터입니다.', remainingCp: colo.cp };
  }
  if (!tutorDef || !moveDef) {
    return {
      success: false,
      message: '기술 전수 교관 카탈로그에 없는 스킬입니다.',
      remainingCp: colo.cp
    };
  }
  if (
    tutorDef.compatibleUnitIds &&
    tutorDef.compatibleUnitIds.length > 0 &&
    !tutorDef.compatibleUnitIds.includes(unitId)
  ) {
    return {
      success: false,
      message: `${unitDef.name}은(는) [${tutorDef.name}]을 습득할 수 없습니다.`,
      remainingCp: colo.cp
    };
  }

  const learned = colo.tutoredMovesMap[unitId] ?? [];
  const alreadyLearned = learned.includes(moveId);

  if (!alreadyLearned) {
    if (colo.cp < tutorDef.costCp) {
      return {
        success: false,
        message: `콜로세움 포인트(CP)가 부족합니다. (필요: ${tutorDef.costCp} CP / 보유: ${colo.cp} CP)`,
        remainingCp: colo.cp
      };
    }
    colo.cp -= tutorDef.costCp;
    colo.tutoredMovesMap[unitId] = [...learned, moveId];
  }

  if (equipSlotIndex !== null && equipSlotIndex >= 0 && equipSlotIndex <= 3) {
    equipTutoredMove(unitId, moveId, equipSlotIndex, campaign, gameReg);
  }

  const msg = alreadyLearned
    ? `${unitDef.name}에게 이미 습득한 [${tutorDef.name}]을 슬롯에 장착했습니다.`
    : `${unitDef.name}이(가) ${tutorDef.costCp} CP로 [${tutorDef.name}]을 전수받았습니다!`;
  campaign.voyageLog.push(`[기술 전수 교관] ${msg}`);

  return {
    success: true,
    message: msg,
    remainingCp: colo.cp
  };
}

export function equipTutoredMove(
  unitId: string,
  moveId: string,
  slotIndex: number,
  campaign: RpgCampaignState,
  gameReg: GameDataRegistry
): boolean {
  const unitDef = gameReg.units[unitId];
  if (!unitDef || slotIndex < 0 || slotIndex > 3) return false;
  const learned = campaign.endgame.colosseum.tutoredMovesMap[unitId] ?? [];
  if (!learned.includes(moveId) && !unitDef.defaultMoves.includes(moveId)) {
    return false;
  }

  if (!campaign.unitEquippedMovesOverrides) {
    campaign.unitEquippedMovesOverrides = {};
  }
  const current = [
    ...(campaign.unitEquippedMovesOverrides[unitId] ?? unitDef.defaultMoves).slice(0, 4)
  ];
  while (current.length < 4) {
    current.push(unitDef.defaultMoves[current.length] ?? moveId);
  }
  // Avoid duplicate slot assignment
  const existingIdx = current.indexOf(moveId);
  if (existingIdx >= 0 && existingIdx !== slotIndex) {
    current[existingIdx] = current[slotIndex];
  }
  current[slotIndex] = moveId;
  campaign.unitEquippedMovesOverrides[unitId] = current;
  return true;
}
