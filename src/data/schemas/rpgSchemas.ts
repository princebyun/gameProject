import type { ArenaTerrainConfig, BattleWinCondition } from './battleSchemas';
import type { Vec2 } from './commonSchemas';
import type { SaveEndgameBlock } from './endgameSchemas';
import type { HakiLevels } from './gameDataSchemas';

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
  endgameMode?: 'IMPEL_DOWN' | 'COLOSSEUM' | 'RAID';
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

export interface SeaCurrentRoute {
  id: string;
  name: string;
  points: Vec2[];
  widthPx: number;
  speedPx: number;
}

export interface SeaWhirlpoolNode {
  id: string;
  pos: Vec2;
  outerRadiusPx: number;
  coreRadiusPx: number;
  clockwise: boolean;
  swirlStrengthPx: number;
  pullStrengthPx: number;
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
  currents?: SeaCurrentRoute[];
  whirlpools?: SeaWhirlpoolNode[];
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

export type SurfaceMaterialId =
  | 'grass'
  | 'stone'
  | 'wood_dock'
  | 'sand'
  | 'water_shallow'
  | 'metal_cyber'
  | 'snow';

export type NpcFacingDir = 'left' | 'right' | 'up' | 'down';

export interface IslandTileMapData {
  tileSize: 32;
  cols: number;
  rows: number;
  tileLegend: Record<string, number>;
  surfaceLegend: Record<string, SurfaceMaterialId>;
  groundRows: string[];
  detailRows: string[];
  solidRows: string[];
  overheadRows: string[];
  surfaceRows: string[];
}

export interface IslandZoneTrigger {
  zoneId: string;
  name: string;
  subtitle?: string;
  tileX: number;
  tileY: number;
  tileW: number;
  tileH: number;
  accentColor?: string;
}

export interface IslandTreasureChestDefinition {
  chestId: string;
  tileX: number;
  tileY: number;
  rarity: 'wooden' | 'silver' | 'gold';
  hiddenHint: string;
  reward: {
    berries: number;
    trainingPoints: number;
    healPartyRatio?: number;
    itemLabel?: string;
  };
}

export interface IslandMapMarkerDefinition {
  markerId: string;
  kind: 'PORT_EXIT' | 'MAIN' | 'SIDE' | 'ACTIVITY';
  label: string;
  tileX: number;
  tileY: number;
  hideWhenFlagSet?: string;
  actionKind?:
    | 'PORT_EXIT'
    | 'BATTLE_TERMINAL'
    | 'CAMP_TRAINING'
    | 'BOUNTY_BOARD'
    | 'STORY';
}

export interface IslandLandmarkDefinition {
  landmarkId: string;
  kind:
    | 'WINDMILL'
    | 'DOCKED_BOAT'
    | 'WATER_FOUNTAIN'
    | 'GALLEY_CRANE'
    | 'GALLEY_FLAG'
    | 'TORII_GATE'
    | 'RED_LANTERN'
    | 'SUNNY_DOCK'
    | 'GLASS_DOME'
    | 'HOLO_BILLBOARD'
    | 'ENERGY_TUBE'
    | 'WELL'
    | 'BOUNTY_BOARD'
    | 'CIRCUS_TENT'
    | 'FISH_PROW'
    | 'SHARK_GATE'
    | 'EXECUTION_PLATFORM'
    | 'ROPEWAY_TOWER'
    | 'CLOCK_TOWER'
    | 'BEANSTALK_ARCH'
    | 'GOLDEN_BELL'
    | 'GOTHIC_MAST'
    | 'WARSHIP_HULL'
    | 'CORAL_ARCH'
    | 'COLOSSEUM_ARCH'
    | 'WAFFLE_ARCH'
    | 'WORLD_TREE_ROOT'
    | 'RUNE_MONOLITH';
  tileX: number;
  tileY: number;
  widthTiles: number;
  heightTiles: number;
  label?: string;
  hasOverheadPart?: boolean;
}

export type IslandAmbientParticleKind =
  | 'GULL'
  | 'LEAF'
  | 'SPRAY'
  | 'DROPLET'
  | 'PETAL'
  | 'LANTERN_MOTE'
  | 'HOLOGRAM'
  | 'CLOUD_MIST'
  | 'SMOKE'
  | 'RAIN'
  | 'SNOW'
  | 'SAND'
  | 'BAT'
  | 'EMBER'
  | 'BUBBLE'
  | 'SUGAR_SPARKLE'
  | 'GOLDEN_LEAF'
  | 'LIGHTNING_SPARK';

export interface IslandAmbientProfile {
  particles: IslandAmbientParticleKind[];
  postClearParticles?: IslandAmbientParticleKind[];
  density: number;
}

export interface IslandLightingProfile {
  defaultMood: 'MORNING' | 'DAY' | 'DUSK' | 'NIGHT' | 'CYBER';
  tintHex: string;
  tintAlpha: number;
  sunbeams?: boolean;
  lanterns: {
    tileX: number;
    tileY: number;
    color: string;
    radiusPx: number;
  }[];
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
    triggersEndgameMode?: 'IMPEL_DOWN' | 'COLOSSEUM' | 'RAID';
    responseLine: string;
  }[];
  setsQuestFlagOnTalk?: string;
  patrolWaypoints?: Vec2[];
  patrolSpeedPx?: number;
  pauseTicks?: number;
  facing?: NpcFacingDir;
  ambientBubbleText?: string;
  spriteKey?: string;
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
  tileMap?: IslandTileMapData;
  zones?: IslandZoneTrigger[];
  chests?: IslandTreasureChestDefinition[];
  markers?: IslandMapMarkerDefinition[];
  landmarks?: IslandLandmarkDefinition[];
  battleTerminalPos?: Vec2;
  ambientProfile?: IslandAmbientProfile;
  lightingProfile?: IslandLightingProfile;
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
  unitEquippedMovesOverrides?: Record<string, string[]>;

  completedEpisodes: string[];
  episodeFlags: Record<string, boolean>;
  openedChestIds?: string[];
  unlockedShips: ('going_merry' | 'thousand_sunny')[];

  seaObjectsByZone: Record<SeaZoneId, SeaDynamicObject[]>;
  onlineStats: OnlineMatchStats;
  endgame: SaveEndgameBlock;
  debugUnlockEndgame?: boolean;
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
  seaZonesMap: ReadonlyMap<SeaZoneId, SeaZoneDefinition>;
  ships: Record<string, ShipDefinition>;
  shipsMap: ReadonlyMap<string, ShipDefinition>;
  crewRoles: Record<CrewRoleId, CrewRoleDefinition>;
  crewRolesMap: ReadonlyMap<CrewRoleId, CrewRoleDefinition>;
  recruitmentRules: RecruitmentRule[];
  recruitmentByUnitIdMap: ReadonlyMap<string, RecruitmentRule>;
  trainingRules: TrainingUpgradeRule[];
  trainingRulesMap: ReadonlyMap<string, TrainingUpgradeRule>;
  islands: Record<string, IslandMapDefinition>;
  islandsMap: ReadonlyMap<string, IslandMapDefinition>;
  episodes: Record<string, EpisodeDefinition>;
  episodesMap: ReadonlyMap<string, EpisodeDefinition>;
}
