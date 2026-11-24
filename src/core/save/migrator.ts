import { BATTLE_CALC_VERSION } from '../constants';
import { createDefaultEndgameState } from '../endgame/types';
import { createInitialCampaignState } from '../rpg/campaignState';
import type { GameDataRegistry } from '../types/dataSchemas';
import type { RpgDataRegistry, SeaZoneId } from '../types/rpgSchemas';
import {
  CURRENT_SAVE_VERSION,
  type SaveEnvelope,
  type SaveSlotId
} from './schema';
import {
  DEFAULT_GLOBAL_SETTINGS,
  serializeCampaignToSaveEnvelope
} from './serializer';
import { STORY_CHAPTERS_LIST } from '../../data/story/storyChaptersRegistry';
import { deriveStoryProgressFromLegacyEpisodes } from '../story/StoryStateMachine';
import { verifySaveIntegrity } from './antiCheat';
import { computeSaveIntegrity } from './sha256';

/**
 * Legacy v0 flat save format (prior to Phase 3 SaveEnvelope v1)
 */
export interface LegacySaveV0 {
  saveVersion?: 0;
  slotId?: SaveSlotId;
  savedAt?: string;
  playTimeSec?: number;
  zoneId?: SeaZoneId;
  shipX?: number;
  shipY?: number;
  shipId?: 'going_merry' | 'thousand_sunny';
  berries?: number;
  bounty?: number;
  trainingPoints?: number;
  completedEpisodes?: string[];
  recruitedUnitIds?: string[];
  activePartyUnitIds?: string[];
}

function isLegacyV0Input(raw: unknown): raw is LegacySaveV0 {
  if (!raw || typeof raw !== 'object') return false;
  const obj = raw as Record<string, unknown>;
  if (obj.saveVersion === 0) return true;
  if ('meta' in obj && typeof obj.meta === 'object' && obj.meta !== null) {
    const meta = obj.meta as Record<string, unknown>;
    return meta.saveVersion === 0;
  }
  return !('meta' in obj) && ('zoneId' in obj || 'berries' in obj);
}

/**
 * Migrates a v0 legacy save object into a signed v1 SaveEnvelope
 */
export function migrateV0ToV1(
  rawV0: LegacySaveV0 | { meta?: { saveVersion?: 0; slotId?: SaveSlotId }; payload?: LegacySaveV0 },
  rpgRegistry: RpgDataRegistry,
  gameRegistry: GameDataRegistry
): SaveEnvelope {
  const flat: LegacySaveV0 =
    'payload' in rawV0 && rawV0.payload ? rawV0.payload : (rawV0 as LegacySaveV0);
  const slotId: SaveSlotId =
    ('meta' in rawV0 && rawV0.meta?.slotId) || flat.slotId || 'slot_1';

  const baseState = createInitialCampaignState(rpgRegistry, gameRegistry);

  if (flat.zoneId && rpgRegistry.seaZones[flat.zoneId]) {
    baseState.currentZoneId = flat.zoneId;
  }
  if (typeof flat.shipX === 'number' && typeof flat.shipY === 'number') {
    baseState.ship.pos = { x: flat.shipX, y: flat.shipY };
  }
  if (flat.shipId === 'thousand_sunny' || flat.shipId === 'going_merry') {
    baseState.ship.shipId = flat.shipId;
    if (!baseState.unlockedShips.includes(flat.shipId)) {
      baseState.unlockedShips.push(flat.shipId);
    }
  }
  if (typeof flat.berries === 'number') {
    baseState.berries = flat.berries;
  }
  if (typeof flat.bounty === 'number') {
    baseState.totalCrewBounty = flat.bounty;
    baseState.unitBounties['luffy'] = flat.bounty;
  }
  if (typeof flat.trainingPoints === 'number') {
    baseState.trainingPoints = flat.trainingPoints;
  }
  if (Array.isArray(flat.completedEpisodes)) {
    baseState.completedEpisodes = [...flat.completedEpisodes];
  }
  if (Array.isArray(flat.recruitedUnitIds) && flat.recruitedUnitIds.length > 0) {
    baseState.recruitedUnitIds = [...flat.recruitedUnitIds];
  }
  if (
    Array.isArray(flat.activePartyUnitIds) &&
    flat.activePartyUnitIds.length > 0
  ) {
    baseState.activePartyUnitIds = [...flat.activePartyUnitIds];
  }

  // Legacy v0/v1 saves only required ep_east_blue_start (Grand Line) and ep_water_seven (New World)
  if (
    (baseState.currentZoneId === 'grand_line' ||
      baseState.currentZoneId === 'new_world') &&
    baseState.completedEpisodes.includes('ep_east_blue_start')
  ) {
    baseState.legacyZoneUnlockV1 = true;
  }
  if (
    baseState.currentZoneId === 'new_world' &&
    baseState.completedEpisodes.includes('ep_water_seven')
  ) {
    baseState.legacyZoneUnlockV2 = true;
  }

  baseState.storyProgress = deriveStoryProgressFromLegacyEpisodes(
    baseState.completedEpisodes,
    STORY_CHAPTERS_LIST
  );

  return serializeCampaignToSaveEnvelope(
    baseState,
    slotId,
    flat.playTimeSec ?? 0,
    flat.savedAt ?? new Date().toISOString(),
    DEFAULT_GLOBAL_SETTINGS,
    null,
    rpgRegistry,
    gameRegistry
  );
}

/**
 * Sequential migration pipeline: brings any older saveVersion up to CURRENT_SAVE_VERSION (v1)
 */
export function migrateRawSaveToCurrent(
  rawInput: unknown,
  rpgRegistry: RpgDataRegistry,
  gameRegistry: GameDataRegistry
): {
  envelope: SaveEnvelope;
  migrated: boolean;
  migratedFromVersion: number;
} {
  if (!rawInput || typeof rawInput !== 'object') {
    throw new Error('유효하지 않은 세이브 데이터 형식입니다 (JSON 객체가 아님).');
  }

  if (isLegacyV0Input(rawInput)) {
    const env = migrateV0ToV1(rawInput, rpgRegistry, gameRegistry);
    return {
      envelope: env,
      migrated: true,
      migratedFromVersion: 0
    };
  }

  const candidate = rawInput as Partial<SaveEnvelope>;
  if (
    !candidate.meta ||
    typeof candidate.meta !== 'object' ||
    !candidate.payload ||
    typeof candidate.payload !== 'object'
  ) {
    throw new Error('세이브 파일에 필수 블록(meta 또는 payload)이 누락되었습니다.');
  }

  const version = candidate.meta.saveVersion ?? 0;
  if (version > CURRENT_SAVE_VERSION) {
    throw new Error(
      `현재 엔진(v${CURRENT_SAVE_VERSION})보다 높은 버전(v${version})의 세이브 파일입니다.`
    );
  }

  if (version === 0) {
    const env = migrateV0ToV1(
      rawInput as { meta?: { saveVersion?: 0; slotId?: SaveSlotId }; payload?: LegacySaveV0 },
      rpgRegistry,
      gameRegistry
    );
    return {
      envelope: env,
      migrated: true,
      migratedFromVersion: 0
    };
  }

  // Sequential migration: v1/v2/v3/v4 -> v5 (Stage 2-A, 2-B, 2-C & Stage 3 Endgame compatibility)
  if (version === 1 || version === 2 || version === 3 || version === 4) {
    const oldEnv = JSON.parse(JSON.stringify(candidate)) as SaveEnvelope;
    const wasIntegrityValid = verifySaveIntegrity(oldEnv).valid;

    const unlocked = oldEnv.payload.world?.unlockedZones ?? [];
    const curZone = oldEnv.payload.world?.currentZoneId;
    const completed = oldEnv.payload.world?.completedEpisodes ?? [];
    const hadGrandLineOrHigher =
      curZone === 'grand_line' ||
      curZone === 'new_world' ||
      unlocked.includes('grand_line') ||
      unlocked.includes('new_world');
    const hadNewWorld =
      curZone === 'new_world' || unlocked.includes('new_world');
    const hadElbaf =
      oldEnv.payload.world?.currentIslandId === 'elbaf' ||
      completed.includes('ep_elbaf');

    if (version === 1 && hadGrandLineOrHigher) {
      oldEnv.payload.world.legacyZoneUnlockV1 = true;
    }
    if ((version === 1 || version === 2) && hadNewWorld) {
      oldEnv.payload.world.legacyZoneUnlockV2 = true;
    }
    if (version <= 3 && hadElbaf) {
      oldEnv.payload.world.legacyElbafUnlockV3 = true;
    }

    // Safely initialize Stage 2-C crewRoles.HELMSMAN field if absent
    if (oldEnv.payload.crew && !oldEnv.payload.crew.crewRoles) {
      oldEnv.payload.crew.crewRoles = {};
    }
    if (oldEnv.payload.crew && !('HELMSMAN' in oldEnv.payload.crew.crewRoles)) {
      oldEnv.payload.crew.crewRoles.HELMSMAN = undefined;
    }

    // Stage 3 (v4 -> v5): Initialize empty default payload.endgame block preserving onlineEligible === true
    if (!oldEnv.payload.endgame) {
      oldEnv.payload.endgame = createDefaultEndgameState();
    } else {
      const def = createDefaultEndgameState();
      oldEnv.payload.endgame = {
        impelDown: { ...def.impelDown, ...(oldEnv.payload.endgame.impelDown ?? {}) },
        colosseum: { ...def.colosseum, ...(oldEnv.payload.endgame.colosseum ?? {}) },
        raids: { ...def.raids, ...(oldEnv.payload.endgame.raids ?? {}) }
      };
    }

    if (!oldEnv.payload.storyProgress) {
      oldEnv.payload.storyProgress = deriveStoryProgressFromLegacyEpisodes(
        completed,
        STORY_CHAPTERS_LIST
      );
    }

    oldEnv.meta.saveVersion = CURRENT_SAVE_VERSION;
    oldEnv.meta.battleCalcVersion = BATTLE_CALC_VERSION;

    if (wasIntegrityValid) {
      oldEnv.meta.integrity = computeSaveIntegrity(
        CURRENT_SAVE_VERSION,
        BATTLE_CALC_VERSION,
        oldEnv.payload
      );
    }

    return {
      envelope: oldEnv,
      migrated: true,
      migratedFromVersion: version
    };
  }

  // Already v5
  const envelope = candidate as SaveEnvelope;
  if (!envelope.meta.battleCalcVersion) {
    envelope.meta.battleCalcVersion = BATTLE_CALC_VERSION;
  } else if (
    (envelope.meta.battleCalcVersion === '0.1.0' ||
      envelope.meta.battleCalcVersion === '0.2.0' ||
      envelope.meta.battleCalcVersion === '0.3.0' ||
      envelope.meta.battleCalcVersion === '0.4.0' ||
      envelope.meta.battleCalcVersion === '0.5.0') &&
    verifySaveIntegrity(envelope).valid
  ) {
    envelope.meta.battleCalcVersion = BATTLE_CALC_VERSION;
    envelope.meta.integrity = computeSaveIntegrity(
      envelope.meta.saveVersion,
      BATTLE_CALC_VERSION,
      envelope.payload
    );
  }

  return {
    envelope,
    migrated: false,
    migratedFromVersion: CURRENT_SAVE_VERSION
  };
}
