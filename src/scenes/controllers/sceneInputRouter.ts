import { getChestWorldCenter } from '../../core/rpg/islandLivingVillage';
import { handleDialogueOverlayTap } from '../../render/dialogueAndPosterRenderer';
import { hitTestBattleSpeedHud } from '../../render/hud/battleSpeedHud';
import { handleMissionTrackerTap } from '../../render/missionTrackerHud';
import {
  computeIslandCameraTransform,
  logicalScreenToIslandWorld
} from '../../render/rpg/islandCamera';
import { isPointInBottomSafeBand } from '../../render/viewport/safeAreaLayout';
import { advanceOpeningNarrationOnTap } from '../openingNarrationScene';
import type { Disposable } from '../sceneTypes';
import {
  cycleBattleSpeedScale,
  stepBattleSpeedScale
} from './battleSpeedControl';
import type { SceneManagerHost } from './controllerContracts';

export class SceneInputRouter implements Disposable {
  private readonly abort = new AbortController();

  constructor(private readonly host: SceneManagerHost) { }

  public dispose(): void {
    this.abort.abort();
  }

  public handleHardwareBackButton(): { handledByScene: boolean } {
    if (this.host.assetPreviewScene?.getIsOpen()) {
      this.host.assetPreviewScene.close();
      return { handledByScene: true };
    }
    if (this.host.seaChartController?.state.isOpen) {
      this.host.seaChartController.close();
      return { handledByScene: true };
    }
    if (this.host.saveModalEl?.classList.contains('open')) {
      this.host.saveModalEl.classList.remove('open');
      return { handledByScene: true };
    }
    if (this.host.onlineModalEl?.classList.contains('open')) {
      this.host.onlineModalEl.classList.remove('open');
      return { handledByScene: true };
    }
    if (this.host.campModalEl?.classList.contains('open')) {
      this.host.campModalEl.classList.remove('open');
      return { handledByScene: true };
    }
    if (this.host.settingsModalEl?.classList.contains('open')) {
      this.host.settingsModalEl.classList.remove('open');
      return { handledByScene: true };
    }
    if (this.host.showWantedPosterOverlay) {
      this.host.showWantedPosterOverlay = false;
      return { handledByScene: true };
    }
    if (this.host.gateBlockedPopup) {
      this.host.gateBlockedPopup = null;
      return { handledByScene: true };
    }
    if (
      this.host.activeScene === 'STORY_BATTLE' ||
      this.host.activeScene === 'ONLINE_BATTLE' ||
      this.host.activeScene === 'ISLAND_EPISODE'
    ) {
      this.host.settingsModalEl?.classList.add('open');
      return { handledByScene: true };
    }
    return { handledByScene: false };
  }

  public setupPwaAndNetworkListeners(): void {
    if (typeof window === 'undefined') return;
    const { signal } = this.abort;

    const updateOnlineBadge = () => {
      const online = navigator.onLine !== false;
      if (!this.host.networkBadgeEl) return;
      if (online) {
        this.host.networkBadgeEl.className = 'net-badge';
        this.host.networkBadgeEl.textContent = '🟢 온라인 (오프라인 플레이 가능)';
      } else {
        this.host.networkBadgeEl.className = 'net-badge offline';
        this.host.networkBadgeEl.textContent = '🟠 오프라인 모드 (로컬 캐시 실행 중)';
      }
    };

    window.addEventListener('online', updateOnlineBadge, { signal });
    window.addEventListener('offline', updateOnlineBadge, { signal });
    updateOnlineBadge();

    const ua = navigator.userAgent || '';
    const isIos = /iPad|iPhone|iPod/.test(ua);
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
    if (isIos && !isStandalone) {
      const banner = document.getElementById('ios-pwa-banner');
      if (banner) banner.style.display = 'flex';
    }
  }

  public attachInputListeners(): void {
    const { signal } = this.abort;
    const c = this.host.renderer.canvas;

    c.addEventListener(
      'pointerdown',
      (e) => {
        const pt = this.host.renderer.clientToLogical(e.clientX, e.clientY);
        if (this.host.activeScene === 'BOOT') return;
        if (this.host.activeScene === 'TITLE') {
          this.host.titleScene?.expandMenu();
          return;
        }
        if (this.host.activeScene === 'OPENING_NARRATION') {
          this.host.audio.unlock();
          const act = advanceOpeningNarrationOnTap(this.host.openingState, pt);
          if (act === 'SKIPPED' || act === 'FINISHED') {
            this.host.audio.playSfxId('ui_confirm');
            this.host.beginFooshaVillagePrologue();
          } else {
            this.host.audio.playSfxId('ui_move');
          }
          return;
        }
        if (this.host.showWantedPosterOverlay) {
          this.host.showWantedPosterOverlay = false;
          return;
        }
        if (this.host.gateBlockedPopup) {
          this.host.gateBlockedPopup = null;
          return;
        }
        if (this.host.activeScene === 'SEA_SAILING') {
          const vmSea = this.host.renderer.getMetrics();
          if (this.host.seaChartController?.handlePointerDown(pt, vmSea, this.host)) {
            return;
          }
        }
        if (
          this.host.activeScene === 'ONLINE_BATTLE' &&
          this.host.onlineAssignedRole === 'SPECTATOR'
        ) {
          return;
        }

        if (
          this.host.activeScene === 'ISLAND_EPISODE' &&
          this.host.islandRuntime?.activeDialogueNpc
        ) {
          const res = handleDialogueOverlayTap(
            pt,
            this.host.islandRuntime.activeDialogueNpc,
            this.host.islandRuntime.dialogueLineIndex,
            this.host.dialogueUiState
          );
          if (res === 'ADVANCE') {
            this.host.audio.playSfxId('ui_move');
            this.host.pendingRpgInteract = true;
          } else if (res === 'SKIP_ALL') {
            this.host.audio.playSfxId('ui_cancel');
            this.host.islandRuntime.dialogueLineIndex = Math.max(
              0,
              this.host.islandRuntime.activeDialogueNpc.dialogueLines.length - 1
            );
            this.host.pendingRpgInteract = true;
          } else {
            this.host.audio.playSfxId('ui_move');
          }
          return;
        }

        if (
          this.host.activeScene === 'SEA_SAILING' ||
          this.host.activeScene === 'ISLAND_EPISODE'
        ) {
          const trackerAct = handleMissionTrackerTap(pt, this.host.missionTrackerState);
          if (trackerAct === 'HIGHLIGHT_GOLD') {
            this.host.storyDirector.triggerHighlightGoldMarker(4.5);
            this.host.audio.playSfxId('ui_confirm');
            const node = this.host.storyDirector.getCurrentNode(this.host.campaign);
            this.host.saveIndicatorText = `★ 목표 강조: ${node.title}`;
            this.host.saveIndicatorTimer = 2.6;
            return;
          }
          if (trackerAct === 'TOGGLED') {
            this.host.audio.playSfxId('ui_move');
            return;
          }
        }

        if (
          this.host.activeScene === 'SEA_SAILING' ||
          this.host.activeScene === 'ISLAND_EPISODE'
        ) {
          const hitBtn = this.host.input.hitTestTouchButton(pt);
          if (hitBtn === 'SKILL_0') {
            this.host.pendingRpgInteract = true;
            this.host.audio.playSfxId('ui_confirm');
            return;
          }
          if (hitBtn === 'DODGE') {
            if (this.host.activeScene === 'SEA_SAILING') {
              this.host.pendingCoupDeBurst = true;
            } else {
              this.host.pendingRpgInteract = true;
            }
            return;
          }

          const vm = this.host.renderer.getMetrics();
          if (
            Math.abs(pt.x - vm.viewWidth * 0.5) <= 220 &&
            isPointInBottomSafeBand(vm, pt.y, 68)
          ) {
            this.host.pendingRpgInteract = true;
            this.host.audio.playSfxId('ui_confirm');
            return;
          }

          if (this.host.activeScene === 'ISLAND_EPISODE' && this.host.islandRuntime) {
            const islMap = this.host.rpgRegistry.islands[this.host.islandRuntime.islandId];
            const cam = islMap
              ? computeIslandCameraTransform(islMap, this.host.islandRuntime.playerPos, vm)
              : null;
            const localPt = cam ? logicalScreenToIslandWorld(pt, cam) : pt;
            const step = this.host.lastIslandStep;
            const ts = islMap?.tileMap?.tileSize ?? 32;
            const nearNpcPos = step.nearbyNpc
              ? (this.host.islandRuntime.npcStates?.[step.nearbyNpc.npcId]?.pos ??
                step.nearbyNpc.pos)
              : null;
            const nearChestPos = step.nearbyChest
              ? getChestWorldCenter(step.nearbyChest, ts)
              : null;
            const nearActPos = step.nearbyActivityMarker
              ? {
                x: step.nearbyActivityMarker.tileX * ts + ts * 0.5,
                y: step.nearbyActivityMarker.tileY * ts + ts * 0.5
              }
              : null;
            const nearObj =
              step.nearbySwitch?.pos ??
              nearChestPos ??
              nearNpcPos ??
              step.nearbyEncounter?.pos ??
              nearActPos ??
              null;
            if (
              nearObj &&
              Math.hypot(localPt.x - nearObj.x, localPt.y - nearObj.y) <= 56
            ) {
              this.host.pendingRpgInteract = true;
              this.host.audio.playSfxId('ui_confirm');
              return;
            }
          }
        }

        if (
          this.host.activeScene === 'STORY_BATTLE' ||
          this.host.activeScene === 'SANDBOX'
        ) {
          const speedHit = hitTestBattleSpeedHud(pt, this.host.renderer.getMetrics());
          if (speedHit === 'SPEED') {
            this.host.setBattleSpeedScale(cycleBattleSpeedScale(this.host.battleSpeedScale));
            this.host.audio.playSfxId('ui_move');
            return;
          }
          if (speedHit === 'PAUSE') {
            this.host.toggleBattlePause();
            this.host.audio.playSfxId('ui_confirm');
            return;
          }
          if (this.host.isBattlePaused) {
            return;
          }
        }

        if (
          this.host.activeScene === 'STORY_BATTLE' ||
          this.host.activeScene === 'ONLINE_BATTLE' ||
          this.host.activeScene === 'SANDBOX'
        ) {
          const hudHit = this.host.input.hitTestBattleBottomHud(pt, 4);
          if (hudHit) {
            this.host.input.triggerVirtualAction(hudHit);
            return;
          }
        }

        const handledByTouchUi = this.host.input.handleCanvasPointerDown(pt, e.pointerId);
        if (
          !handledByTouchUi &&
          (this.host.activeScene === 'SEA_SAILING' ||
            this.host.activeScene === 'ISLAND_EPISODE')
        ) {
          if (this.host.islandRuntime?.activeDialogueNpc) {
            this.host.pendingRpgInteract = true;
          }
        }
      },
      { signal }
    );

    c.addEventListener(
      'pointermove',
      (e) => {
        const pt = this.host.renderer.clientToLogical(e.clientX, e.clientY);
        this.host.input.handleCanvasPointerMove(pt, e.pointerId);
      },
      { signal }
    );

    window.addEventListener(
      'pointerup',
      (e) => {
        this.host.input.handleCanvasPointerUp(e.pointerId);
      },
      { signal }
    );

    window.addEventListener(
      'pointercancel',
      (e) => {
        this.host.input.handleCanvasPointerUp(e.pointerId);
      },
      { signal }
    );

    window.addEventListener(
      'keydown',
      (e) => {
        const targetEl = e.target as HTMLElement | null;
        const tag = targetEl?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA') return;
        if (e.code === 'F9') {
          e.preventDefault();
          this.host.visualPolishDrawer?.toggle();
          return;
        }
        if (tag === 'SELECT') {
          targetEl?.blur();
        }

        if (this.host.activeScene === 'TITLE') {
          this.host.titleScene?.expandMenu();
          return;
        }

        if (this.host.activeScene === 'OPENING_NARRATION') {
          if (e.code === 'Escape') {
            this.host.audio.playSfxId('ui_confirm');
            this.host.beginFooshaVillagePrologue();
            return;
          }
          if (e.code === 'Space' || e.code === 'Enter' || e.code === 'KeyE') {
            const act = advanceOpeningNarrationOnTap(this.host.openingState);
            if (act === 'SKIPPED' || act === 'FINISHED') {
              this.host.audio.playSfxId('ui_confirm');
              this.host.beginFooshaVillagePrologue();
            } else {
              this.host.audio.playSfxId('ui_move');
            }
            return;
          }
        }

        if (e.code === 'Escape') {
          if (this.host.seaChartController?.state.isOpen) {
            this.host.seaChartController.close();
            this.host.audio.playSfxId('ui_cancel');
            return;
          }
          if (this.host.showWantedPosterOverlay) {
            this.host.showWantedPosterOverlay = false;
            return;
          }
          if (this.host.gateBlockedPopup) {
            this.host.gateBlockedPopup = null;
            return;
          }
        }

        if (e.code === 'KeyM' && this.host.activeScene === 'SEA_SAILING') {
          const hasDomModalOpen =
            this.host.saveModalEl?.classList.contains('open') ||
            this.host.campModalEl?.classList.contains('open') ||
            this.host.onlineModalEl?.classList.contains('open') ||
            this.host.settingsModalEl?.classList.contains('open') ||
            this.host.endgameModalEl?.classList.contains('open');
          if (!hasDomModalOpen && this.host.seaChartController) {
            const opened = this.host.seaChartController.toggle(this.host.campaign);
            this.host.audio.playSfxId(opened ? 'ui_confirm' : 'ui_cancel');
            this.host.clearTransientFocusAndInput();
            return;
          }
        }

        if (this.host.seaChartController?.state.isOpen) {
          return;
        }

        if (
          this.host.activeScene === 'STORY_BATTLE' ||
          this.host.activeScene === 'SANDBOX'
        ) {
          const hasDomModalOpen =
            this.host.saveModalEl?.classList.contains('open') ||
            this.host.campModalEl?.classList.contains('open') ||
            this.host.onlineModalEl?.classList.contains('open') ||
            this.host.settingsModalEl?.classList.contains('open') ||
            this.host.endgameModalEl?.classList.contains('open');
          if (!hasDomModalOpen) {
            if (e.code === 'KeyP') {
              this.host.toggleBattlePause();
              this.host.audio.playSfxId('ui_confirm');
              return;
            }
            if (e.code === 'BracketLeft') {
              this.host.setBattleSpeedScale(stepBattleSpeedScale(this.host.battleSpeedScale, -1));
              this.host.audio.playSfxId('ui_move');
              return;
            }
            if (e.code === 'BracketRight') {
              this.host.setBattleSpeedScale(stepBattleSpeedScale(this.host.battleSpeedScale, 1));
              this.host.audio.playSfxId('ui_move');
              return;
            }
          }
        }

        if (e.code === 'KeyE' || e.code === 'Space' || e.code === 'Enter') {
          if (this.host.showWantedPosterOverlay) {
            this.host.showWantedPosterOverlay = false;
            return;
          }
          if (this.host.gateBlockedPopup) {
            this.host.gateBlockedPopup = null;
            return;
          }
          if (
            this.host.activeScene === 'SEA_SAILING' ||
            this.host.activeScene === 'ISLAND_EPISODE'
          ) {
            this.host.pendingRpgInteract = true;
          }
        } else if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
          if (this.host.activeScene === 'SEA_SAILING') {
            this.host.pendingCoupDeBurst = true;
          }
        }
      },
      { signal }
    );
  }
}
