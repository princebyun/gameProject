import type { Vec2 } from '../math/vector2';
import type { ArenaTerrainConfig, BattleWinCondition } from './battleState';
import type { HakiLevels } from './dataSchemas';

export type SeaZoneId = 'east_blue' | 'grand_line' | 'new_world';
export type TimeOfDayId = 'MORNING' | 'DAY' | 'EVENING' | 'NIGHT';
export type SeaWeatherId = 'CLEAR' | 'STORM' | 'FOG';

export type CrewRoleId =
  | 'CAPTAIN'
  | 'SWORDSMAN'
  | 'NAVIGATOR'
  | 'COOK'
  | 'DOCTOR'
  | 'SHIPWRIGHT'
  | 'ARCHAEOLOGIST'
  | 'MUSICIAN'
  | 'HELMSMAN';

export interface SeaIslandNode {
  islandId: string;
  name: string;
  sagaName: string;
  episodeId: string;
  pos: Vec2;
  dockingRadiusPx: number;
  requiredForNextZone: boolean;
  requiredEpisodes: string[];
  dangerLevel: 1 | 2 | 3 | 4 | 5;
  playableInVerticalSlice: boolean;
  summary: string;
  color: string;
}

export interface SeaGateDefinition {
  gateId: string;
  name: string;
  fromZoneId: SeaZoneId;
  toZoneId: SeaZoneId;
  pos: Vec2;
  triggerRadiusPx: number;
  requiredZoneIds: SeaZoneId[];
  description: string;
}

export interface SeaZoneDefinition {
  id: SeaZoneId;
  name: string;
  subtitle: string;
  width: number;
  height: number;
  logPoseStyle: 'SINGLE_NEEDLE' | 'TRIPLE_NEEDLE_NEW_WORLD';
  baseCurrentVec: Vec2;
  spawnPoint: Vec2;
  islands: SeaIslandNode[];
  seaGate: SeaGateDefinition | null;
}

export interface ShipDefinition {
  id: 'going_merry' | 'thousand_sunny';
  name: string;
  description: string;
  maxHullHp: number;
  maxSpeedPx: number;
  accelerationPx: number;
  dragPerSec: number;
  turnRateRadPerSec: number;
  currentResistance: number;
  hasCoupDeBurst: boolean;
  coupDeBurstSpeedMult: number;
  coupDeBurstDurationSec: number;
  coupDeBurstCooldownSec: number;
  hasGaonCannon: boolean;
  autoRepairPerSec: number;
  unlockedByEpisodeId: string | null;
}

export interface CrewRoleDefinition {
  roleId: CrewRoleId;
  name: string;
  defaultHolderName: string;
  description: string;
  sailingSpeedBonusRatio?: number;
  stormResistanceRatio?: number;
  revealsHiddenChests?: boolean;
  openingAtkBonusRatio?: number;
  preBattleHealRatio?: number;
  maxHpMealBonusRatio?: number;
  postBattleHealRatio?: number;
  hullMaxHpBonusRatio?: number;
  hullAutoRepairPerSec?: number;
  rewardBonusRatio?: number;
  awakeningChargeBonusRatio?: number;
  skillCooldownReductionRatio?: number;
  canDecipherPoneglyphs?: boolean;
  shipTurnSpeedBonusRatio?: number;
  currentAndStormDriftResistRatio?: number;
  coupDeBurstCooldownReductionRatio?: number;
}

export interface RecruitmentRule {
  id: string;
  unitId: string;
  characterName: string;
  track: 'MAIN_EPISODE' | 'ALLIANCE_SUBQUEST';
  triggerEpisodeId: string;
  defaultRole: CrewRoleId;
  initialBounty: number;
  joinDialogue: string;
}

export interface TrainingUpgradeRule {
  id: string;
  name: string;
  category: 'HAKI_ARMAMENT' | 'HAKI_OBSERVATION' | 'HAKI_CONQUEROR' | 'FORM_UNLOCK';
  targetTier?: 1 | 2 | 3;
  targetFormId?: string;
  costBerries: number;
  costTrainingPoints: number;
  requiredEpisodeId?: string;
  description: string;
}

export interface IslandNpcDefinition {
  npcId: string;
  name: string;
  roleLabel: string;
  pos: Vec2;
  interactRadiusPx: number;
  visualScale: number;
  color: string;
  dialogueLines: string[];
  choices?: {
    label: string;
    setsFlag?: string;
    recruitsUnitId?: string;
    triggersBattleEncounterId?: string;
    responseLine: string;
  }[];
  setsQuestFlagOnTalk?: string;
}

export interface IslandPuzzleSwitch {
  switchId: string;
  label: string;
  pos: Vec2;
  radiusPx: number;
  deactivatesBarrierId: string;
  setsFlag: string;
}

export interface IslandLaserBarrier {
  barrierId: string;
  x: number;
  y: number;
  width: number;
  height: number;
  activeByDefault: boolean;
}

export interface IslandGiantProp {
  propId: string;
  label: string;
  pos: Vec2;
  width: number;
  height: number;
  visualScale: number;
  color: string;
}

export interface IslandEncounterDefinition {
  encounterId: string;
  name: string;
  isBoss: boolean;
  pos: Vec2;
  triggerRadiusPx: number;
  enemyUnitIds: string[];
  aiLevel: number;
  arenaSizeKey: 'small' | 'medium' | 'large';
  setsFlagOnVictory: string;
  completesEpisodeOnVictory?: boolean;
  bountyReward: number;
  berryReward: number;
  trainingPointReward: number;
  winCondition?: BattleWinCondition;
  arenaTerrain?: ArenaTerrainConfig;
  gauntletWaves?: {
    waveName: string;
    enemyUnitIds: string[];
    aiLevel: number;
    introText?: string;
  }[];
  guestAllyUnitIds?: string[];
  dialogueBeforeBattle?: string[];
}

export interface IslandMapDefinition {
  islandId: string;
  name: string;
  episodeId: string;
  width: number;
  height: number;
  theme: 'HARBOR_TOWN' | 'CANAL_DOCKYARD' | 'ONIGASHIMA_DOME' | 'FUTURE_LAB' | 'GIANT_ELBAF';
  spawnPoint: Vec2;
  portExitZone: { pos: Vec2; radiusPx: number };
  obstacles: { x: number; y: number; width: number; height: number; label?: string }[];
  laserBarriers: IslandLaserBarrier[];
  puzzleSwitches: IslandPuzzleSwitch[];
  giantProps: IslandGiantProp[];
  npcs: IslandNpcDefinition[];
  encounters: IslandEncounterDefinition[];
}

export interface EpisodeQuestStep {
  stepId: string;
  title: string;
  description: string;
  requiredFlag: string;
  targetPos: Vec2;
}

export interface EpisodeDefinition {
  episodeId: string;
  islandId: string;
  zoneId: SeaZoneId;
  title: string;
  sagaName: string;
  requiredForNextZone: boolean;
  introDialogue: string[];
  outroDialogue: string[];
  steps: EpisodeQuestStep[];
  rewards: {
    berries: number;
    trainingPoints: number;
    bountyIncrease: number;
    recruitsUnitIds: string[];
    unlocksShipId?: 'going_merry' | 'thousand_sunny';
    unlocksFormIds?: { unitId: string; formId: string }[];
    unlocksCrewRoles?: CrewRoleId[];
    awardsRoadPoneglyph?: boolean;
    unlocksHakiTraining?: {
      unitId: string;
      hakiKey: 'armament' | 'observation' | 'conqueror';
      tier: 1 | 2 | 3;
    }[];
  };
}

export interface SeaDynamicObject {
  id: string;
  kind: 'MARINE_PATROL' | 'SEA_KING' | 'TREASURE_CHEST' | 'MERCHANT_SHIP';
  name: string;
  pos: Vec2;
  vel: Vec2;
  radiusPx: number;
  aiLevel: number;
  enemyUnitIds: string[];
  berryValue: number;
  trainingPointValue: number;
  hiddenByDefault?: boolean;
  collectedOrDefeated: boolean;
}

export interface ShipRuntimeState {
  shipId: 'going_merry' | 'thousand_sunny';
  pos: Vec2;
  vel: Vec2;
  headingRad: number;
  hullHp: number;
  maxHullHp: number;
  coupDeBurstCooldownTimer: number;
  coupDeBurstActiveTimer: number;
}

export interface WantedPosterEvent {
  unitId: string;
  characterName: string;
  title: string;
  previousBounty: number;
  newBounty: number;
  reason: string;
}

export interface GateMissingEpisodeItem {
  episodeId: string;
  islandId: string;
  islandName: string;
  zoneId: SeaZoneId;
  zoneName: string;
  completed: boolean;
}

export interface GateValidationResult {
  allowed: boolean;
  gateName: string;
  targetZoneId: SeaZoneId;
  missingEpisodes: GateMissingEpisodeItem[];
  checklist: GateMissingEpisodeItem[];
}

export interface BattleContext {
  sourceScene: 'SEA_SAILING' | 'ISLAND_EPISODE';
  zoneId: SeaZoneId;
  islandId: string | null;
  encounterId: string;
  encounterName: string;
  isBoss: boolean;
  arenaSizeKey: 'small' | 'medium' | 'large';
  mode: '1V1' | '2V2';
  enemyUnitIds: string[];
  aiLevel: number;
  bountyReward: number;
  berryReward: number;
  trainingPointReward: number;
  setsFlagOnVictory: string | null;
  completesEpisodeIdOnVictory: string | null;
  winCondition?: BattleWinCondition;
  arenaTerrain?: ArenaTerrainConfig;
  gauntletWaves?: {
    waveName: string;
    enemyUnitIds: string[];
    aiLevel: number;
    introText?: string;
  }[];
  guestAllyUnitIds?: string[];
}

export interface BattleResult {
  context: BattleContext;
  victory: boolean;
  survivingPartyHpRatios: Record<string, number>;
}

export interface OnlineMatchStats {
  wins: number;
  losses: number;
  draws: number;
}

export interface RpgCampaignState {
  currentZoneId: SeaZoneId;
  activeIslandId: string | null;

  ship: ShipRuntimeState;
  savedZoneShipPositions: Record<SeaZoneId, { pos: Vec2; headingRad: number }>;
  lastDockedPort: {
    zoneId: SeaZoneId;
    islandId: string;
    returnSeaPos: Vec2;
  };

  timeOfDay: TimeOfDayId;
  timeOfDayTimerSec: number;
  seaWeather: SeaWeatherId;
  weatherTimerSec: number;

  berries: number;
  trainingPoints: number;
  totalCrewBounty: number;
  unitBounties: Record<string, number>;
  roadPoneglyphCount: number;

  recruitedUnitIds: string[];
  activePartyUnitIds: string[];
  unlockedCrewRoles: CrewRoleId[];
  assignedCrewRoles: Partial<Record<CrewRoleId, string>>;

  unitHakiOverrides: Record<string, HakiLevels>;
  unitUnlockedForms: Record<string, string[]>;
  unitLevelOverrides: Record<string, number>;

  completedEpisodes: string[];
  episodeFlags: Record<string, boolean>;
  unlockedShips: ('going_merry' | 'thousand_sunny')[];

  seaObjectsByZone: Record<SeaZoneId, SeaDynamicObject[]>;
  onlineStats: OnlineMatchStats;
  legacyZoneUnlockV1?: boolean;
  legacyZoneUnlockV2?: boolean;
  legacyElbafUnlockV3?: boolean;
  decipheredPoneglyphIds?: string[];
  nextBattleMealAtkBuffRatio: number;
  shipboardCookingCooldownSec: number;
  partyHpRatios: Record<string, number>;
  latestWantedPoster: WantedPosterEvent | null;
  voyageLog: string[];
}

export interface RpgDataRegistry {
  seaZones: Record<SeaZoneId, SeaZoneDefinition>;
  ships: Record<string, ShipDefinition>;
  crewRoles: Record<CrewRoleId, CrewRoleDefinition>;
  recruitmentRules: RecruitmentRule[];
  trainingRules: TrainingUpgradeRule[];
  islands: Record<string, IslandMapDefinition>;
  episodes: Record<string, EpisodeDefinition>;
}
