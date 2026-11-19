import type { SaveEndgameBlock } from '../endgame/types';
import type { Vec2 } from '../math/vector2';
import type { HakiLevels } from '../types/dataSchemas';
import type {
  CrewRoleId,
  SeaWeatherId,
  SeaZoneId,
  TimeOfDayId
} from '../types/rpgSchemas';

export const CURRENT_SAVE_VERSION = 5 as const;

export type SaveSlotId = 'auto' | 'slot_1' | 'slot_2' | 'slot_3';

export type AntiCheatViolationCode =
  | 'INTEGRITY_MISMATCH'
  | 'ILLEGAL_ZONE_ACCESS'
  | 'ILLEGAL_CREW_OR_SHIP'
  | 'ILLEGAL_UNIT_STATE'
  | 'ILLEGAL_ENDGAME_STATE';

export interface SaveSlotSummary {
  captainLevel: number;
  currentZoneName: string;
  currentZoneId: SeaZoneId;
  bounty: number;
  crewCount: number;
  completedEpisodeCount: number;
}

export interface SaveIntegrityBlock {
  algorithm: 'HMAC-SHA256-DERIVED';
  signature: string;
  payloadHash: string;
}

export interface SaveAntiCheatBlock {
  isTampered: boolean;
  onlineEligible: boolean;
  violationCodes: AntiCheatViolationCode[];
  violationMessages?: string[];
}

export interface SaveEnvelopeMeta {
  saveVersion: number;
  battleCalcVersion: string;
  slotId: SaveSlotId;
  savedAt: string;
  playTimeSec: number;
  summary: SaveSlotSummary;
  integrity: SaveIntegrityBlock;
  antiCheat: SaveAntiCheatBlock;
}

export interface SaveUnitProgress {
  unitId: string;
  level: number;
  exp: number;
  currentHp: number;
  movePpMap: Record<string, number>;
  equippedMoveIds: string[];
  unlockedFormIds: string[];
  haki: HakiLevels;
  fruitAwakeningUnlocked: boolean;
  affinity: number;
}

export interface GlobalSettingsPayload {
  flashEffect: boolean;
  shakeIntensity: number;
  bgmVolume: number;
  sfxVolume: number;
  keyBindings: Record<string, string>;
}

export interface SavePayloadV1 {
  world: {
    currentScene: 'sea' | 'island';
    currentZoneId: SeaZoneId;
    shipTransform: { x: number; y: number; angle: number };
    savedZoneShipPositions: Record<SeaZoneId, { pos: Vec2; headingRad: number }>;
    currentIslandId: string | null;
    playerIslandPos: Vec2 | null;
    deactivatedBarrierIds: string[];
    activatedSwitchIds: string[];
    lastDockedIslandId: string;
    lastDockedZoneId: SeaZoneId;
    lastDockedReturnPos: Vec2;
    unlockedZones: SeaZoneId[];
    completedEpisodes: string[];
    episodeStepFlags: Record<string, boolean>;
    collectedRoadPoneglyphs: string[];
    worldTime: TimeOfDayId;
    weather: SeaWeatherId;
    legacyZoneUnlockV1?: boolean;
    legacyZoneUnlockV2?: boolean;
    legacyElbafUnlockV3?: boolean;
    decipheredPoneglyphIds?: string[];
    nextBattleMealAtkBuffRatio?: number;
    shipboardCookingCooldownSec?: number;
  };
  ship: {
    activeShipId: string;
    ownedShipIds: string[];
    durability: number;
    maxDurability: number;
    colaCharges: number;
    upgradeLevels: {
      hull: number;
      sail: number;
      cannon: number;
    };
  };
  crew: {
    recruitedUnitIds: string[];
    activePartyIds: string[];
    unlockedCrewRoles: CrewRoleId[];
    crewRoles: Partial<Record<CrewRoleId, string>>;
    unitProgressMap: Record<string, SaveUnitProgress>;
  };
  economy: {
    berry: number;
    bounty: number;
    unitBounties: Record<string, number>;
    trainingPoints: number;
    inventory: Record<string, number>;
    codexDiscoveredIds: string[];
    onlineStats?: {
      wins: number;
      losses: number;
      draws: number;
    };
  };
  settings: GlobalSettingsPayload;
  endgame?: SaveEndgameBlock;
}

export interface SaveEnvelope {
  meta: SaveEnvelopeMeta;
  payload: SavePayloadV1;
}
