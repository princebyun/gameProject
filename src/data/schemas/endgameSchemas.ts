import type { StatBlock } from './gameDataSchemas';

export type ImpelDownHazardKind =
  | 'CRIMSON_SLASH_TRAP'
  | 'BEAST_SWARM'
  | 'STARVATION_DRAIN'
  | 'BLAZING_MAGMA'
  | 'FREEZING_ICE'
  | 'ETERNAL_ELITE_GAUNTLET';

export interface ImpelDownFloorDefinition {
  floor: number;
  name: string;
  subtitle: string;
  hazardKind: ImpelDownHazardKind;
  hazardDescription: string;
  arenaSizeKey: 'small' | 'medium' | 'large';
  aiLevel: number;
  waves: {
    waveName: string;
    enemyUnitIds: string[];
    introText?: string;
  }[];
  useSeededEliteGauntlet?: boolean;
  berryReward: number;
  trainingPointReward: number;
}

export interface ImpelDownBuffEffect {
  healPartyHpRatio?: number;
  restorePpRatio?: number;
  armorPenRatio?: number;
  hazardAndPoisonResistRatio?: number;
  cooldownReductionRatio?: number;
  startAwakeningGaugeRatio?: number;
  atkMult?: number;
  spdMult?: number;
  maxHpMult?: number;
  dodgeRechargeBonus?: number;
}

export interface ImpelDownBuffDefinition {
  id: string;
  name: string;
  rarity: 'COMMON' | 'RARE' | 'LEGENDARY';
  icon: string;
  description: string;
  effect: ImpelDownBuffEffect;
}

export interface ImpelDownConfig {
  unlockEpisodeId: string;
  maxPartySize: number;
  allowBagRecoveryItems: boolean;
  floors: ImpelDownFloorDefinition[];
  eliteBossPool: string[];
  buffs: ImpelDownBuffDefinition[];
}

export interface ImpelDownUnitCarryover {
  unitId: string;
  hpRatio: number;
  moveChargesMap: Record<string, number>;
  awakeningReadyRatio: number;
}

export interface ImpelDownRunState {
  runId: string;
  seed: number;
  currentFloor: number;
  isEndlessMode: boolean;
  partyUnitIds: string[];
  carryoverMap: Record<string, ImpelDownUnitCarryover>;
  selectedBuffIds: string[];
  pendingDraftBuffIds: string[] | null;
  status: 'IN_FLOOR' | 'DRAFTING' | 'FLOOR6_CLEAR_CHOICE' | 'FAILED';
  totalBerriesEarned: number;
  totalTpEarned: number;
}

export interface ImpelDownProgressState {
  highestFloor: number;
  activeRun: ImpelDownRunState | null;
}

export type ColosseumTierId = 'C' | 'B' | 'A' | 'S';
export type WantedPosterFrameTier = 'default' | 'gold' | 'platinum' | 'diamond';

export interface ColosseumLeagueDefinition {
  tierId: ColosseumTierId;
  name: string;
  subtitle: string;
  aiLevel: number;
  rewardMultiplier: number;
  baseCpReward: number;
  baseBerryReward: number;
  baseTrainingPointReward: number;
  competitorPool: string[];
}

export interface ColosseumRingOutConfig {
  enabled: boolean;
  safeRadiusRatio: number;
  outOfBoundsLimitSec: number;
  outOfBoundsDpsRatio: number;
  instantRingOutKo: boolean;
}

export interface ColosseumConfig {
  unlockEpisodeId: string;
  maxLegalCp: number;
  ringOutDefaults: ColosseumRingOutConfig;
  leagues: ColosseumLeagueDefinition[];
}

export interface TutorMoveDefinition {
  moveId: string;
  name: string;
  tier: 'HIGH' | 'MID' | 'UTILITY';
  costCp: number;
  description: string;
  compatibleUnitIds?: string[];
}

export interface ColosseumCompetitor {
  slotIndex: number;
  unitId: string;
  displayName: string;
  isPlayer: boolean;
  powerScore: number;
}

export interface ColosseumBracketMatch {
  matchId: string;
  round: 'QF' | 'SF' | 'FINAL';
  matchIndex: number;
  participantA: ColosseumCompetitor | null;
  participantB: ColosseumCompetitor | null;
  winner: ColosseumCompetitor | null;
  completed: boolean;
  resolvedByRingOut?: boolean;
}

export interface ColosseumTournamentState {
  tournamentId: string;
  seed: number;
  tierId: ColosseumTierId;
  ringOutEnabled: boolean;
  playerUnitId: string;
  participants: ColosseumCompetitor[];
  matches: ColosseumBracketMatch[];
  currentRound: 'QF' | 'SF' | 'FINAL' | 'COMPLETE';
  champion: ColosseumCompetitor | null;
  playerEliminated: boolean;
  rewardsClaimed: boolean;
}

export interface ColosseumProgressState {
  cp: number;
  clearedTiers: ColosseumTierId[];
  tierWinCounts?: Partial<Record<ColosseumTierId, number>>;
  posterFrameTier: WantedPosterFrameTier;
  tutoredMovesMap: Record<string, string[]>;
}

export type RaidTelegraphShape = 'CIRCLE' | 'CONE' | 'CROSS_BEAM' | 'SAFE_ZONE';

export interface RaidTelegraphPatternDef {
  id: string;
  name: string;
  shape: RaidTelegraphShape;
  telegraphSec: number;
  radiusPx: number;
  arcDeg?: number;
  widthPx?: number;
  damageMultiplier: number;
  applyStatus?: 'STAGGER' | 'ROOT' | 'FREEZE';
  cooldownSec: number;
}

export interface RaidBossDefinition {
  raidId: string;
  name: string;
  subtitle: string;
  speciesId: string;
  entityScale: number;
  bossLevel: number;
  hpMultiplier: number;
  breakGaugeMax: number;
  groggyDurationSec: number;
  groggyDamageMult: number;
  dpsCheckTriggerHpRatios: number[];
  dpsCheckShieldHp: number;
  dpsCheckDurationSec: number;
  teamRevivesMax: number;
  requiredEpisodeId: string;
  rewardRelicId: string;
  berryReward: number;
  trainingPointReward: number;
  weatherOnStart?: 'NONE' | 'SOLAR_FLARE' | 'TEMPEST_RAIN' | 'ION_STORM';
  telegraphPatterns: RaidTelegraphPatternDef[];
}

export interface RaidRelicModifiers {
  fireDamageBonusRatio?: number;
  breakGaugeDamageRatio?: number;
  maxHpBonusRatio?: number;
  atkBonusRatio?: number;
  dodgeCooldownBonusRatio?: number;
  statFlat?: Partial<StatBlock>;
}

export interface RaidRelicDefinition {
  relicId: string;
  name: string;
  requiredRaidId: string;
  icon: string;
  description: string;
  modifiers: RaidRelicModifiers;
}

export interface RaidProgressState {
  clearedRaidIds: string[];
  bestClearTimeSecMap: Record<string, number>;
  unlockedRelicIds: string[];
  equippedRelicMap: Record<string, string>;
}

export interface SaveEndgameBlock {
  impelDown: ImpelDownProgressState;
  colosseum: ColosseumProgressState;
  raids: RaidProgressState;
}

export interface EndgameDataRegistry {
  impelDown: ImpelDownConfig;
  colosseum: ColosseumConfig;
  tutorMoves: Record<string, TutorMoveDefinition>;
  tutorMovesMap: ReadonlyMap<string, TutorMoveDefinition>;
  raids: Record<string, RaidBossDefinition>;
  raidsMap: ReadonlyMap<string, RaidBossDefinition>;
  raidRelics: Record<string, RaidRelicDefinition>;
  raidRelicsMap: ReadonlyMap<string, RaidRelicDefinition>;
}
