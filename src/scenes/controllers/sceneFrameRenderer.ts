import { renderBattleArena } from '../../render/battleRenderer';
import {
  renderDialogueCutsceneOverlay,
  renderSaveAndTamperOverlay,
  renderSeaGateBlockedPopup,
  renderWantedPosterOverlay
} from '../../render/dialogueAndPosterRenderer';
import { renderBattleHud } from '../../render/hudRenderer';
import { renderIslandEpisodeCanvas } from '../../render/islandRenderer';
import { renderMissionTrackerHud } from '../../render/missionTrackerHud';
import { renderSeaSailingCanvas } from '../../render/sailingRenderer';
import { renderOnlineAndSpectatorHud } from '../../render/spectatorHudRenderer';
import { renderTouchOverlay } from '../../render/touchOverlayRenderer';
import {
  collectIslandWorldMarkers,
  collectSeaWorldMarkers
} from '../../story/worldMarkerSystem';
import { renderBootScene } from '../bootScene';
import { renderOpeningNarrationScene } from '../openingNarrationScene';
import { renderTitleSceneCanvas } from '../titleScene';
import type { SceneManagerHost } from './controllerContracts';

export function renderActiveSceneFrame(
  host: SceneManagerHost,
  alpha: number
): void {
  const viewport = host.renderer.beginFrame();
  const ctx = host.renderer.ctx;

  if (host.activeScene === 'BOOT') {
    renderBootScene(ctx, host.bootState, host.tickCount, viewport);
  } else if (host.activeScene === 'TITLE') {
    renderTitleSceneCanvas(ctx, host.assets, host.tickCount, viewport);
  } else if (host.activeScene === 'OPENING_NARRATION') {
    renderOpeningNarrationScene(ctx, host.openingState, host.tickCount, viewport);
  } else if (host.activeScene === 'SEA_SAILING') {
    const storyNode = host.storyDirector.getCurrentNode(host.campaign);
    const seaMarkers = collectSeaWorldMarkers(
      host.campaign,
      host.rpgRegistry,
      storyNode
    );
    renderSeaSailingCanvas(
      ctx,
      host.campaign,
      host.rpgRegistry,
      host.lastSailingStep,
      host.tickCount,
      host.fps,
      host.assets,
      viewport,
      seaMarkers,
      host.storyDirector.isGoldMarkerHighlighted()
    );
    renderMissionTrackerHud(
      ctx,
      storyNode,
      host.storyDirector.getLoopMode(),
      host.missionTrackerState,
      viewport,
      78
    );
    if (host.gateBlockedPopup) {
      renderSeaGateBlockedPopup(ctx, host.gateBlockedPopup, viewport);
    }
    if (host.showWantedPosterOverlay && host.campaign.latestWantedPoster) {
      renderWantedPosterOverlay(
        ctx,
        host.campaign.latestWantedPoster,
        host.gameRegistry,
        host.assets,
        host.isCurrentSaveTampered,
        host.campaign.endgame.colosseum.posterFrameTier,
        viewport
      );
    }
    const hasSeaInteractable = Boolean(
      host.lastSailingStep.nearbyIsland || host.lastSailingStep.nearbySeaGate
    );
    renderTouchOverlay(ctx, host.input, 'SEA', hasSeaInteractable);
  } else if (host.activeScene === 'ISLAND_EPISODE' && host.islandRuntime) {
    const storyNode = host.storyDirector.getCurrentNode(host.campaign);
    const islandMap = host.rpgRegistry.islands[host.islandRuntime.islandId];
    const islandMarkers = islandMap
      ? collectIslandWorldMarkers(host.campaign, islandMap, storyNode)
      : [];
    renderIslandEpisodeCanvas(
      ctx,
      host.campaign,
      host.islandRuntime,
      host.lastIslandStep,
      host.rpgRegistry,
      host.gameRegistry,
      host.assets,
      host.tickCount,
      viewport,
      islandMarkers,
      host.storyDirector.isGoldMarkerHighlighted()
    );
    renderMissionTrackerHud(
      ctx,
      storyNode,
      host.storyDirector.getLoopMode(),
      host.missionTrackerState,
      viewport,
      66
    );
    if (host.islandRuntime.activeDialogueNpc) {
      renderDialogueCutsceneOverlay(
        ctx,
        host.islandRuntime.activeDialogueNpc,
        host.islandRuntime.dialogueLineIndex,
        viewport,
        host.dialogueUiState,
        host.gameRegistry,
        host.assets
      );
    }
    if (host.showWantedPosterOverlay && host.campaign.latestWantedPoster) {
      renderWantedPosterOverlay(
        ctx,
        host.campaign.latestWantedPoster,
        host.gameRegistry,
        host.assets,
        host.isCurrentSaveTampered,
        host.campaign.endgame.colosseum.posterFrameTier,
        viewport
      );
    }
    if (!host.islandRuntime.activeDialogueNpc) {
      const hasIslandInteractable = Boolean(
        host.lastIslandStep.nearbyNpc ||
          host.lastIslandStep.nearbySwitch ||
          host.lastIslandStep.nearbyChest ||
          host.lastIslandStep.nearbyEncounter ||
          host.lastIslandStep.atBattleTerminal ||
          host.lastIslandStep.atPortExit ||
          host.lastIslandStep.nearbyActivityMarker
      );
      renderTouchOverlay(ctx, host.input, 'ISLAND', hasIslandInteractable);
    }
  } else if (host.activeScene === 'ONLINE_BATTLE' && host.activeLockstep) {
    const isSpec = host.onlineAssignedRole === 'SPECTATOR';
    renderBattleArena(
      ctx,
      host.activeLockstep.world,
      host.gameRegistry,
      host.assets,
      alpha,
      host.renderer.settings,
      isSpec ? host.spectatorCameraTarget : 'ALL',
      viewport
    );
    renderBattleHud(
      ctx,
      host.activeLockstep.world,
      host.gameRegistry,
      host.input.getBindings(),
      host.fps,
      host.input.isTouchViewport(),
      viewport
    );
    if (!isSpec) {
      renderTouchOverlay(ctx, host.input);
    }
    renderOnlineAndSpectatorHud(
      ctx,
      host.activeLockstep.world,
      host.activeLockstep,
      isSpec,
      host.spectatorCameraTarget,
      host.activeTransport?.getRttMs() ?? 12,
      host.fps,
      host.isTerminalOnlineMatch,
      viewport
    );
  } else {
    renderBattleArena(
      ctx,
      host.battleWorld,
      host.gameRegistry,
      host.assets,
      alpha,
      host.renderer.settings,
      'ALL',
      viewport,
      {
        islandId: host.islandRuntime?.islandId ?? host.campaign.activeIslandId ?? host.campaign.lastDockedPort.islandId,
        seaZoneId: host.campaign.currentZoneId
      }
    );
    renderBattleHud(
      ctx,
      host.battleWorld,
      host.gameRegistry,
      host.input.getBindings(),
      host.fps,
      host.input.isTouchViewport(),
      viewport
    );
    renderTouchOverlay(ctx, host.input);
  }

  renderSaveAndTamperOverlay(
    ctx,
    host.saveIndicatorTimer,
    host.saveIndicatorText,
    host.isCurrentSaveTampered,
    viewport
  );
}
