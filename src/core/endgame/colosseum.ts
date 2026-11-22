import { SeededPRNG } from '../math/prng';
import type { RpgCampaignState } from '../types/rpgSchemas';
import {
  computePosterFrameTier,
  getActivePlayerColosseumMatch,
  getColosseumLeague
} from './colosseumMatchBuilder';
import type {
  ColosseumBracketMatch,
  ColosseumTournamentState,
  EndgameDataRegistry,
  WantedPosterFrameTier
} from './types';

export {
  buildColosseumMatchBattleConfig,
  computePosterFrameTier,
  createColosseumTournament,
  getActivePlayerColosseumMatch,
  getColosseumLeague,
  isColosseumUnlocked
} from './colosseumMatchBuilder';
export { equipTutoredMove, purchaseTutorMove } from './colosseumTutor';

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
  const fin = tournament.matches.find((m) => m.round === 'FINAL');
  if (!fin) return;

  if (qf.every((m) => m.completed) && sf[0] && sf[1] && qf[0] && qf[1] && qf[2] && qf[3]) {
    sf[0].participantA = qf[0].winner;
    sf[0].participantB = qf[1].winner;
    sf[1].participantA = qf[2].winner;
    sf[1].participantB = qf[3].winner;
  }
  if (sf.every((m) => m.completed) && sf[0] && sf[1]) {
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

  for (const m of tournament.matches) {
    if (m.round === tournament.currentRound && !m.completed) {
      resolveCpuMatchDeterministically(m, prng);
    }
  }
  propagateWinnersToNextRound(tournament);

  if (!playerWon) {
    tournament.playerEliminated = true;
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
