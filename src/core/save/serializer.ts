import { BATTLE_CALC_VERSION } from '../constants';
import { suspendCloneRun } from '../endgame/impelDown';
import { createDefaultEndgameState } from '../endgame/types';
import { createInitialCampaignState } from '../rpg/campaignState';
import { syncShipHullStatsWithRoles } from '../rpg/crewAndBountyEngine';
import type { IslandExplorationRuntime } from '../rpg/episodeEngine';
import type { GameDataRegistry } from '../types/dataSchemas';
import type {
  RpgCampaignState,
  RpgDataRegistry,
  SeaZoneId
} from '../types/rpgSchemas';
import { evaluateAndStampAntiCheat } from './antiCheat';
import {
  CURRENT_SAVE_VERSION,
  type GlobalSettingsPayload,
  type SaveEnvelope,
  type SavePayloadV1,
  type SaveSlotId,
  type SaveUnitProgress
} from './schema';
import { computeSaveIntegrity } from './sha256';

export const DEFAULT_GLOBAL_SETTINGS: GlobalSettingsPayload = {
  flashEffect: true,
  shakeIntensity: 0.8,
  bgmVolume: 0.7,
  sfxVolume: 0.8,
  keyBindings: {
    moveUp: 'KeyW',
    moveDown: 'KeyS',
    moveLeft: 'KeyA',
    moveRight: 'KeyD',
    skill1: 'Digit1',
    skill2: 'Digit2',
    skill3: 'Digit3',
    skill4: 'Digit4',
    dodge: 'Space',
    formShift: 'KeyF',
    quickSwap: 'KeyQ'
  }
};

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
      activatedSwitchIds: islandRuntime
        ? [...islandRuntime.activatedSwitchIds]
        : [],
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
      shipboardCookingCooldownSec: state.shipboardCookingCooldownSec || 0
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
    }
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

export function deserializeSaveEnvelopeToCampaign(
  envelope: SaveEnvelope,
  rpgRegistry: RpgDataRegistry,
  gameRegistry: GameDataRegistry
): {
  campaign: RpgCampaignState;
  islandRuntime: IslandExplorationRuntime | null;
  settings: GlobalSettingsPayload;
} {
  evaluateAndStampAntiCheat(envelope, rpgRegistry, gameRegistry);

  const campaign = createInitialCampaignState(rpgRegistry, gameRegistry);
  const { world, ship, crew, economy, settings } = envelope.payload;

  campaign.currentZoneId = world.currentZoneId;
  campaign.activeIslandId =
    world.currentScene === 'island' ? world.currentIslandId : null;

  campaign.ship.shipId =
    ship.activeShipId === 'thousand_sunny' ? 'thousand_sunny' : 'going_merry';
  campaign.ship.pos = { x: world.shipTransform.x, y: world.shipTransform.y };
  campaign.ship.headingRad = world.shipTransform.angle;
  campaign.ship.hullHp = ship.durability;
  campaign.ship.maxHullHp = ship.maxDurability;

  if (world.savedZoneShipPositions) {
    campaign.savedZoneShipPositions = {
      east_blue: {
        pos: { ...world.savedZoneShipPositions.east_blue.pos },
        headingRad: world.savedZoneShipPositions.east_blue.headingRad
      },
      grand_line: {
        pos: { ...world.savedZoneShipPositions.grand_line.pos },
        headingRad: world.savedZoneShipPositions.grand_line.headingRad
      },
      new_world: {
        pos: { ...world.savedZoneShipPositions.new_world.pos },
        headingRad: world.savedZoneShipPositions.new_world.headingRad
      }
    };
  }

  campaign.lastDockedPort = {
    zoneId: world.lastDockedZoneId ?? world.currentZoneId,
    islandId: world.lastDockedIslandId ?? 'foosha_shells',
    returnSeaPos: world.lastDockedReturnPos
      ? { ...world.lastDockedReturnPos }
      : { x: world.shipTransform.x, y: world.shipTransform.y }
  };

  campaign.timeOfDay = world.worldTime;
  campaign.seaWeather = world.weather;
  campaign.legacyZoneUnlockV1 = Boolean(world.legacyZoneUnlockV1);
  campaign.legacyZoneUnlockV2 = Boolean(world.legacyZoneUnlockV2);
  campaign.legacyElbafUnlockV3 = Boolean(world.legacyElbafUnlockV3);
  campaign.decipheredPoneglyphIds = Array.isArray(world.decipheredPoneglyphIds)
    ? [...world.decipheredPoneglyphIds]
    : [];
  campaign.nextBattleMealAtkBuffRatio = world.nextBattleMealAtkBuffRatio ?? 0;
  campaign.shipboardCookingCooldownSec = world.shipboardCookingCooldownSec ?? 0;
  campaign.completedEpisodes = [...world.completedEpisodes];
  campaign.episodeFlags = { ...world.episodeStepFlags };
  campaign.roadPoneglyphCount = world.collectedRoadPoneglyphs?.length ?? 0;

  campaign.unlockedShips = ship.ownedShipIds.filter(
    (s): s is 'going_merry' | 'thousand_sunny' =>
      s === 'going_merry' || s === 'thousand_sunny'
  );
  if (campaign.unlockedShips.length === 0) {
    campaign.unlockedShips = ['going_merry'];
  }

  campaign.recruitedUnitIds = [...crew.recruitedUnitIds];
  campaign.activePartyUnitIds = [...crew.activePartyIds];
  campaign.unlockedCrewRoles = [...crew.unlockedCrewRoles];
  campaign.assignedCrewRoles = { ...crew.crewRoles };

  for (const [uid, prog] of Object.entries(crew.unitProgressMap ?? {})) {
    campaign.unitLevelOverrides[uid] = prog.level;
    campaign.unitHakiOverrides[uid] = { ...prog.haki };
    campaign.unitUnlockedForms[uid] = [...prog.unlockedFormIds];
    if (prog.equippedMoveIds && prog.equippedMoveIds.length > 0) {
      if (!campaign.unitEquippedMovesOverrides) {
        campaign.unitEquippedMovesOverrides = {};
      }
      campaign.unitEquippedMovesOverrides[uid] = [...prog.equippedMoveIds.slice(0, 4)];
    }
  }

  const eg = envelope.payload.endgame ?? createDefaultEndgameState();
  campaign.endgame = {
    impelDown: {
      highestFloor: eg.impelDown?.highestFloor ?? 0,
      activeRun: eg.impelDown?.activeRun
        ? suspendCloneRun(eg.impelDown.activeRun)
        : null
    },
    colosseum: {
      cp: eg.colosseum?.cp ?? 0,
      clearedTiers: [...(eg.colosseum?.clearedTiers ?? [])],
      tierWinCounts: { ...(eg.colosseum?.tierWinCounts ?? {}) },
      posterFrameTier: eg.colosseum?.posterFrameTier ?? 'default',
      tutoredMovesMap: Object.fromEntries(
        Object.entries(eg.colosseum?.tutoredMovesMap ?? {}).map(([k, v]) => [k, [...v]])
      )
    },
    raids: {
      clearedRaidIds: [...(eg.raids?.clearedRaidIds ?? [])],
      bestClearTimeSecMap: { ...(eg.raids?.bestClearTimeSecMap ?? {}) },
      unlockedRelicIds: [...(eg.raids?.unlockedRelicIds ?? [])],
      equippedRelicMap: { ...(eg.raids?.equippedRelicMap ?? {}) }
    }
  };

  campaign.berries = economy.berry;
  campaign.totalCrewBounty = economy.bounty;
  campaign.unitBounties = {
    ...(economy.unitBounties ?? { luffy: economy.bounty })
  };
  campaign.trainingPoints = economy.trainingPoints;
  campaign.onlineStats = {
    wins: economy.onlineStats?.wins ?? 0,
    losses: economy.onlineStats?.losses ?? 0,
    draws: economy.onlineStats?.draws ?? 0
  };

  syncShipHullStatsWithRoles(campaign, rpgRegistry);
  campaign.ship.hullHp = Math.min(campaign.ship.maxHullHp, ship.durability);

  let islandRuntime: IslandExplorationRuntime | null = null;
  if (world.currentScene === 'island' && world.currentIslandId) {
    const islMap = rpgRegistry.islands[world.currentIslandId];
    if (islMap) {
      islandRuntime = {
        islandId: world.currentIslandId,
        playerPos: world.playerIslandPos
          ? { ...world.playerIslandPos }
          : { ...islMap.spawnPoint },
        playerHeadingRad: 0,
        playerRadiusPx: 16,
        deactivatedBarrierIds: [...(world.deactivatedBarrierIds ?? [])],
        activatedSwitchIds: [...(world.activatedSwitchIds ?? [])],
        activeDialogueNpc: null,
        dialogueLineIndex: 0
      };
    }
  }

  if (envelope.meta.antiCheat.isTampered) {
    campaign.voyageLog.push(
      `[안티치트 경고] 비공식 수정 데이터가 감지되어 온라인 통신 대전 자격이 제한되었습니다 (${envelope.meta.antiCheat.violationCodes.join(', ')}).`
    );
  } else {
    campaign.voyageLog.push(
      `[세이브 복원] 슬롯 [${envelope.meta.slotId}] 데이터를 성공적으로 불러왔습니다.`
    );
  }

  return {
    campaign,
    islandRuntime,
    settings: {
      flashEffect: settings?.flashEffect ?? DEFAULT_GLOBAL_SETTINGS.flashEffect,
      shakeIntensity:
        settings?.shakeIntensity ?? DEFAULT_GLOBAL_SETTINGS.shakeIntensity,
      bgmVolume: settings?.bgmVolume ?? DEFAULT_GLOBAL_SETTINGS.bgmVolume,
      sfxVolume: settings?.sfxVolume ?? DEFAULT_GLOBAL_SETTINGS.sfxVolume,
      keyBindings: {
        ...DEFAULT_GLOBAL_SETTINGS.keyBindings,
        ...(settings?.keyBindings ?? {})
      }
    }
  };
}
