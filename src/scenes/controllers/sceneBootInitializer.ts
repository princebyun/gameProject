import { AssetPreviewScene } from '../dev/assetPreviewScene';
import { VisualPolishDrawer } from '../dev/visualPolishDrawer';
import { TitleSceneController } from '../titleScene';
import type { SceneManagerHost } from './controllerContracts';
import { buildSceneDomShell } from './sceneDomShell';
import type { SceneInputRouter } from './sceneInputRouter';
import type { SceneShowcaseToolbarController } from './sceneShowcaseToolbarController';
import type { SceneTopBarController } from './sceneTopBarController';

export function createInitialSailingStepState() {
  return {
    nearbyIsland: null,
    nearbySeaGate: null,
    triggeredBattle: null,
    collectedNotice: null,
    currentSpeedMult: 1,
    currentTailwindRatio: 0,
    inWhirlpool: false,
    whirlpoolIntensity: 0,
    activeShipId: 'going_merry' as const
  };
}

export function createInitialIslandStepState() {
  return {
    nearbyNpc: null,
    nearbySwitch: null,
    nearbyEncounter: null,
    atPortExit: false,
    atBattleTerminal: false,
    triggeredBattle: null,
    requestedExitToSea: false,
    requestedOpenOnlineTerminal: false
  };
}

export function initializeSceneDomAndSubScenes(
  host: SceneManagerHost,
  topBarController: SceneTopBarController,
  showcaseController: SceneShowcaseToolbarController,
  inputRouter: SceneInputRouter
): { canvasWrapper: HTMLElement; cleanupViewport: () => void } {
  host.platformBridge.device.onHardwareBack(
    () => inputRouter.handleHardwareBackButton(),
    (toastMsg) => {
      host.saveIndicatorText = toastMsg;
      host.saveIndicatorTimer = 2.0;
    }
  );
  host.audio.attachGestureUnlock();

  const shell = buildSceneDomShell({
    rootEl: host.rootEl,
    storage: host.storage,
    input: host.input,
    platformBridge: host.platformBridge,
    initialBattleSpeed: host.battleSpeedScale,
    isRpgActive: () =>
      host.activeScene === 'SEA_SAILING' || host.activeScene === 'ISLAND_EPISODE',
    onRpgInteract: () => {
      host.pendingRpgInteract = true;
    },
    onCoupDeBurst: () => {
      host.pendingCoupDeBurst = true;
    }
  });
  host.renderer = shell.renderer;
  const unsubPixiResize = host.pixiHost
    ? shell.renderer.viewport.onChange((m) => host.pixiHost?.resize(m))
    : null;
  if (host.pixiHost) {
    host.visualPolishDrawer = new VisualPolishDrawer(host.rootEl, host.pixiHost, {
      onConfigChanged: (cfg) => {
        const selQuality = host.settingsModalEl?.querySelector('#sel-graphics-quality') as HTMLSelectElement | null;
        if (selQuality) selQuality.value = cfg.quality;
      }
    });
  }
  host.sideDrawerEl = shell.sideDrawerEl;
  host.showcaseBarEl = shell.showcaseBarEl;
  host.mobileDockEl = shell.mobileDockEl;
  host.networkBadgeEl = shell.networkBadgeEl;
  host.hudToggleBtnEl = shell.hudToggleBtnEl;
  host.campModalEl = shell.campModalEl;
  host.saveModalEl = shell.saveModalEl;
  host.onlineModalEl = shell.onlineModalEl;
  host.settingsModalEl = shell.settingsModalEl;
  host.endgameModalEl = shell.endgameModalEl;

  topBarController.bindTopBarEvents(shell.topBar);
  showcaseController.updateShowcaseToolbar();

  host.titleScene = new TitleSceneController(host.rootEl, {
    onFirstInteraction: () => {
      host.audio.unlock();
      void host.audio.playBgm('title_adventure');
      host.audio.playSfxId('ui_confirm');
    },
    onContinue: () => {
      host.audio.unlock();
      host.audio.playSfxId('ui_confirm');
      if (host.latestBootSaveEnvelope) {
        host.titleScene.hide();
        host.applyLoadedEnvelope(host.latestBootSaveEnvelope);
      }
    },
    onNewAdventure: () => {
      host.audio.unlock();
      host.audio.playSfxId('awakening_drums');
      host.startNewAdventureFlow();
    },
    onSandbox: () => {
      host.audio.unlock();
      host.audio.playSfxId('ui_confirm');
      host.titleScene.hide();
      host.switchToScene('SANDBOX');
    },
    onOnlineOrRaid: () => {
      host.audio.unlock();
      host.audio.playSfxId('ui_confirm');
      host.titleScene.hide();
      host.switchToScene('SEA_SAILING');
      host.openOnlineLobbyModal(false);
    },
    onSettings: () => {
      host.audio.unlock();
      host.audio.playSfxId('ui_move');
      host.settingsModalEl?.classList.add('open');
    }
  });

  host.assetPreviewScene = new AssetPreviewScene(
    host.rootEl,
    host.gameRegistry,
    host.assets,
    host.audio,
    { onClose: () => host.syncSceneBgm() }
  );

  return {
    canvasWrapper: shell.canvasWrapper,
    cleanupViewport: () => {
      unsubPixiResize?.();
      shell.viewportListenerCleanup();
    }
  };
}
