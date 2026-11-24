import { BATTLE_CALC_VERSION } from '../constants';
import { suspendCloneRun } from '../endgame/impelDown';
import type { IslandExplorationRuntime } from '../rpg/episodeEngine';
import type { GameDataRegistry } from '../types/dataSchemas';
import type {
  RpgCampaignState,
  RpgDataRegistry,
  SeaZoneId
} from '../types/rpgSchemas';
import { evaluateAndStampAntiCheat } from './antiCheat';
import { cloneStoryProgress } from '../story/StoryStateMachine';
import {
  CURRENT_SAVE_VERSION,
  type GlobalSettingsPayload,
  type SaveEnvelope,
  type SavePayloadV1,
  type SaveSlotId,
  type SaveUnitProgress
} from './schema';
import { computeSaveIntegrity } from './sha256';

export {
  DEFAULT_GLOBAL_SETTINGS,
  deserializeSaveEnvelopeToCampaign
} from './saveDeserialization';

export function deriveUnlockedZones(
  state: RpgCampaignState,
  rpgRegistry?: RpgDataRegistry
): SeaZoneId[] {
  const zones = new Set<SeaZoneId>(['east_blue']);
  const ebRequired = state.legacyZoneUnlockV1
    ? ['ep_east_blue_start']
    : rpgRegistry
      ? rpgRegistry.seaZones.east_blue.islands
          .filter((i) => i.requiredForNextZone)
          .map((i) => i.episodeId)
      : [
          'ep_east_blue_start',
          'ep_orange_town',
          'ep_baratie',
          'ep_arlong_park',
          'ep_loguetown'
        ];
  const allEbDone = ebRequired.every((ep) => state.completedEpisodes.includes(ep));
  const glRequired = state.legacyZoneUnlockV2
    ? ['ep_water_seven']
    : rpgRegistry
      ? rpgRegistry.seaZones.grand_line.islands
          .filter((i) => i.requiredForNextZone)
          .map((i) => i.episodeId)
      : [
          'ep_drum_kingdom',
          'ep_alabasta',
          'ep_skypiea',
          'ep_water_seven',
          'ep_thriller_bark',
          'ep_marineford'
        ];
  const allGlDone = glRequired.every((ep) => state.completedEpisodes.includes(ep));

  if (
    allEbDone ||
    state.currentZoneId === 'grand_line' ||
    state.currentZoneId === 'new_world'
  ) {
    zones.add('grand_line');
  }
  if ((allEbDone && allGlDone) || state.currentZoneId === 'new_world') {
    zones.add('new_world');
  }
  return Array.from(zones);
}

export function serializeCampaignToSaveEnvelope(
  state: RpgCampaignState,
  slotId: SaveSlotId,
  playTimeSec: number,
  savedAtIso: string,
  settings: GlobalSettingsPayload,
  islandRuntime: IslandExplorationRuntime | null,
  rpgRegistry: RpgDataRegistry,
  gameRegistry: GameDataRegistry,
  preserveTamperedFlag: boolean = false
): SaveEnvelope {
  const unitProgressMap: Record<string, SaveUnitProgress> = {};
  const wanoDone = state.completedEpisodes.includes('ep_wano');

  for (const uid of state.recruitedUnitIds) {
    const unitDef = gameRegistry.units[uid];
    if (!unitDef) continue;

    const equippedMoves = [
      ...(state.unitEquippedMovesOverrides?.[uid] ?? unitDef.defaultMoves).slice(0, 4)
    ];
    const movePpMap: Record<string, number> = {};
    for (const mId of equippedMoves) {
      const mDef = gameRegistry.moves[mId];
      if (mDef) {
        movePpMap[mId] = mDef.maxCharges;
      }
    }

    const rawUnlocked = state.unitUnlockedForms[uid] ?? [];
    const safeUnlocked = rawUnlocked.filter((fId) => {
      if (
        (fId === 'form_luffy_gear5' || fId === 'form_zoro_king_of_hell') &&
        !wanoDone
      ) {
        return false;
      }
      return true;
    });

    unitProgressMap[uid] = {
      unitId: uid,
      level: state.unitLevelOverrides[uid] ?? 50,
      exp: (state.unitLevelOverrides[uid] ?? 50) * 1000,
      currentHp: unitDef.baseStats.hp,
      movePpMap,
      equippedMoveIds: equippedMoves,
      unlockedFormIds: safeUnlocked,
      haki: state.unitHakiOverrides[uid]
        ? { ...state.unitHakiOverrides[uid] }
        : unitDef.haki
          ? { ...unitDef.haki }
          : { armament: 1, observation: 1, conqueror: 0 },
      fruitAwakeningUnlocked: wanoDone,
      affinity: 100
    };
  }

  const poneglyphIds: string[] = [];
  for (let i = 0; i < state.roadPoneglyphCount; i++) {
    poneglyphIds.push(`road_poneglyph_${i + 1}`);
  }

  const payload: SavePayloadV1 = {
    world: {
      currentScene: state.activeIslandId && islandRuntime ? 'island' : 'sea',
      currentZoneId: state.currentZoneId,
      shipTransform: {
        x: state.ship.pos.x,
        y: state.ship.pos.y,
        angle: state.ship.headingRad
      },
      savedZoneShipPositions: {
        east_blue: {
          pos: { ...state.savedZoneShipPositions.east_blue.pos },
          headingRad: state.savedZoneShipPositions.east_blue.headingRad
        },
        grand_line: {
          pos: { ...state.savedZoneShipPositions.grand_line.pos },
          headingRad: state.savedZoneShipPositions.grand_line.headingRad
        },
        new_world: {
          pos: { ...state.savedZoneShipPositions.new_world.pos },
          headingRad: state.savedZoneShipPositions.new_world.headingRad
        }
      },
      currentIslandId: state.activeIslandId,
      playerIslandPos: islandRuntime ? { ...islandRuntime.playerPos } : null,
      deactivatedBarrierIds: islandRuntime
        ? [...islandRuntime.deactivatedBarrierIds]
        : [],
      activatedSwitchIds: islandRuntime ? [...islandRuntime.activatedSwitchIds] : [],
      lastDockedIslandId: state.lastDockedPort.islandId,
      lastDockedZoneId: state.lastDockedPort.zoneId,
      lastDockedReturnPos: { ...state.lastDockedPort.returnSeaPos },
      unlockedZones: deriveUnlockedZones(state, rpgRegistry),
      completedEpisodes: [...state.completedEpisodes],
      episodeStepFlags: { ...state.episodeFlags },
      collectedRoadPoneglyphs: poneglyphIds,
      worldTime: state.timeOfDay,
      weather: state.seaWeather,
      legacyZoneUnlockV1: state.legacyZoneUnlockV1 ? true : undefined,
      legacyZoneUnlockV2: state.legacyZoneUnlockV2 ? true : undefined,
      legacyElbafUnlockV3: state.legacyElbafUnlockV3 ? true : undefined,
      decipheredPoneglyphIds: state.decipheredPoneglyphIds
        ? [...state.decipheredPoneglyphIds]
        : [],
      nextBattleMealAtkBuffRatio: state.nextBattleMealAtkBuffRatio || 0,
      shipboardCookingCooldownSec: state.shipboardCookingCooldownSec || 0,
      openedChestIds: state.openedChestIds ? [...state.openedChestIds] : []
    },
    ship: {
      activeShipId: state.ship.shipId,
      ownedShipIds: [...state.unlockedShips],
      durability: Math.round(state.ship.hullHp),
      maxDurability: Math.round(state.ship.maxHullHp),
      colaCharges: state.ship.shipId === 'thousand_sunny' ? 3 : 0,
      upgradeLevels: {
        hull: state.ship.shipId === 'thousand_sunny' ? 2 : 1,
        sail: state.ship.shipId === 'thousand_sunny' ? 2 : 1,
        cannon: state.ship.shipId === 'thousand_sunny' ? 2 : 1
      }
    },
    crew: {
      recruitedUnitIds: [...state.recruitedUnitIds],
      activePartyIds: [...state.activePartyUnitIds],
      unlockedCrewRoles: [...state.unlockedCrewRoles],
      crewRoles: { ...state.assignedCrewRoles },
      unitProgressMap
    },
    economy: {
      berry: state.berries,
      bounty: state.totalCrewBounty,
      unitBounties: { ...state.unitBounties },
      trainingPoints: state.trainingPoints,
      inventory: {
        cola_barrel: state.ship.shipId === 'thousand_sunny' ? 3 : 1
      },
      codexDiscoveredIds: [...state.recruitedUnitIds],
      onlineStats: {
        wins: state.onlineStats?.wins ?? 0,
        losses: state.onlineStats?.losses ?? 0,
        draws: state.onlineStats?.draws ?? 0
      }
    },
    settings: {
      flashEffect: settings.flashEffect,
      shakeIntensity: settings.shakeIntensity,
      bgmVolume: settings.bgmVolume,
      sfxVolume: settings.sfxVolume,
      keyBindings: { ...settings.keyBindings }
    },
    endgame: {
      impelDown: {
        highestFloor: state.endgame?.impelDown?.highestFloor ?? 0,
        activeRun: state.endgame?.impelDown?.activeRun
          ? suspendCloneRun(state.endgame.impelDown.activeRun)
          : null
      },
      colosseum: {
        cp: state.endgame?.colosseum?.cp ?? 0,
        clearedTiers: [...(state.endgame?.colosseum?.clearedTiers ?? [])],
        tierWinCounts: { ...(state.endgame?.colosseum?.tierWinCounts ?? {}) },
        posterFrameTier: state.endgame?.colosseum?.posterFrameTier ?? 'default',
        tutoredMovesMap: Object.fromEntries(
          Object.entries(state.endgame?.colosseum?.tutoredMovesMap ?? {}).map(
            ([k, v]) => [k, [...v]]
          )
        )
      },
      raids: {
        clearedRaidIds: [...(state.endgame?.raids?.clearedRaidIds ?? [])],
        bestClearTimeSecMap: { ...(state.endgame?.raids?.bestClearTimeSecMap ?? {}) },
        unlockedRelicIds: [...(state.endgame?.raids?.unlockedRelicIds ?? [])],
        equippedRelicMap: { ...(state.endgame?.raids?.equippedRelicMap ?? {}) }
      }
    },
    ...(state.storyProgress
      ? { storyProgress: cloneStoryProgress(state.storyProgress) }
      : {})
  };

  const captainId = state.recruitedUnitIds[0] ?? 'luffy';
  const zoneDef = rpgRegistry.seaZones[state.currentZoneId];
  const integrity = computeSaveIntegrity(
    CURRENT_SAVE_VERSION,
    BATTLE_CALC_VERSION,
    payload
  );

  const envelope: SaveEnvelope = {
    meta: {
      saveVersion: CURRENT_SAVE_VERSION,
      battleCalcVersion: BATTLE_CALC_VERSION,
      slotId,
      savedAt: savedAtIso,
      playTimeSec: Math.round(playTimeSec),
      summary: {
        captainLevel: state.unitLevelOverrides[captainId] ?? 50,
        currentZoneName: zoneDef?.name ?? state.currentZoneId,
        currentZoneId: state.currentZoneId,
        bounty: state.totalCrewBounty,
        crewCount: state.recruitedUnitIds.length,
        completedEpisodeCount: state.completedEpisodes.length
      },
      integrity,
      antiCheat: {
        isTampered: preserveTamperedFlag,
        onlineEligible: !preserveTamperedFlag,
        violationCodes: []
      }
    },
    payload
  };

  evaluateAndStampAntiCheat(envelope, rpgRegistry, gameRegistry);
  return envelope;
}
