import { suspendCloneRun } from '../endgame/impelDown';
import { createDefaultEndgameState } from '../endgame/types';
import { createInitialCampaignState } from '../rpg/campaignState';
import { syncShipHullStatsWithRoles } from '../rpg/crewAndBountyEngine';
import type { IslandExplorationRuntime } from '../rpg/episodeEngine';
import { createInitialNpcStates } from '../rpg/islandLivingVillage';
import { isCircleBlockedOnIsland } from '../rpg/islandTileCollision';
import type { GameDataRegistry } from '../types/dataSchemas';
import type { RpgCampaignState, RpgDataRegistry } from '../types/rpgSchemas';
import { STORY_CHAPTERS_LIST } from '../../data/story/storyChaptersRegistry';
import {
  cloneStoryProgress,
  deriveStoryProgressFromLegacyEpisodes
} from '../story/StoryStateMachine';
import { evaluateAndStampAntiCheat } from './antiCheat';
import type { GlobalSettingsPayload, SaveEnvelope } from './schema';

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
  campaign.storyProgress = envelope.payload.storyProgress
    ? cloneStoryProgress(envelope.payload.storyProgress)
    : deriveStoryProgressFromLegacyEpisodes(
        world.completedEpisodes,
        STORY_CHAPTERS_LIST
      );
  campaign.openedChestIds = Array.isArray(world.openedChestIds)
    ? [...world.openedChestIds]
    : [];
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
      const deactivated = [...(world.deactivatedBarrierIds ?? [])];
      const candidatePos = world.playerIslandPos
        ? { ...world.playerIslandPos }
        : { ...islMap.spawnPoint };
      const safePlayerPos = isCircleBlockedOnIsland(
        candidatePos,
        16,
        islMap,
        deactivated
      )
        ? { ...islMap.spawnPoint }
        : candidatePos;
      islandRuntime = {
        islandId: world.currentIslandId,
        playerPos: safePlayerPos,
        playerHeadingRad: 0,
        playerRadiusPx: 16,
        deactivatedBarrierIds: deactivated,
        activatedSwitchIds: [...(world.activatedSwitchIds ?? [])],
        activeDialogueNpc: null,
        dialogueLineIndex: 0,
        npcStates: createInitialNpcStates(islMap)
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
