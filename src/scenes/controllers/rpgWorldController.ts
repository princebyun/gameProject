import { isImpelDownUnlocked } from '../../core/endgame/impelDown';
import { SeededPRNG } from '../../core/math/prng';
import {
  applyBattleResultToCampaign,
  createBattleWorldFromContext
} from '../../core/rpg/battleBridge';
import { createInitialCampaignState } from '../../core/rpg/campaignState';
import {
  enterIslandEpisode,
  stepIslandExploration
} from '../../core/rpg/episodeEngine';
import { stepSeaSailing } from '../../core/rpg/sailingPhysics';
import { tryTransitionThroughSeaGate } from '../../core/rpg/seaGateValidator';
import type { BattleContext } from '../../core/types/rpgSchemas';
import { stepDialogueOverlayUi } from '../../render/dialogueAndPosterRenderer';
import {
  createOpeningNarrationState,
  stepOpeningNarration
} from '../openingNarrationScene';
import type { Disposable } from '../sceneTypes';
import type { SceneManagerHost } from './controllerContracts';
import type { ScenePersistenceController } from './scenePersistenceController';

const FOOTSTEP_SFX_BY_SURFACE: Record<
  string,
  { id: string; volumeScale: number; pitchScale: number }
> = {
  water_shallow: { id: 'water_splash', volumeScale: 0.24, pitchScale: 1.25 },
  metal_cyber: { id: 'ui_move', volumeScale: 0.22, pitchScale: 1.35 },
  wood_dock: { id: 'blunt_hit', volumeScale: 0.18, pitchScale: 1.45 },
  stone: { id: 'guard_block', volumeScale: 0.2, pitchScale: 1.55 },
  sand: { id: 'dodge_whoosh', volumeScale: 0.16, pitchScale: 1.15 },
  snow: { id: 'dodge_whoosh', volumeScale: 0.17, pitchScale: 0.92 },
  grass: { id: 'dodge_whoosh', volumeScale: 0.18, pitchScale: 1.45 }
};

export class RpgWorldController implements Disposable {
  private wantedPosterOpenTimer = 0;
  private typewriterSfxCounter = 0;

  constructor(
    private readonly host: SceneManagerHost,
    private readonly persistence: ScenePersistenceController
  ) {}

  public dispose(): void {
    this.wantedPosterOpenTimer = 0;
    this.typewriterSfxCounter = 0;
  }

  public enterTitleScene(): void {
    this.host.activeScene = 'TITLE';
    this.host.syncSceneBundles?.();
    this.host.updateFloatingHudToggleVisibility();
    const preview = this.host.latestBootSaveEnvelope
      ? this.persistence.buildTitleSavePreview(this.host.latestBootSaveEnvelope)
      : null;
    this.host.titleScene?.show(preview);
    void this.host.audio.playBgm('title_adventure');
  }

  public startNewAdventureFlow(): void {
    this.host.titleScene?.hide();
    this.host.campaign = createInitialCampaignState(
      this.host.rpgRegistry,
      this.host.gameRegistry
    );
    this.host.islandRuntime = null;
    this.host.playTimeSec = 0;
    this.host.isCurrentSaveTampered = false;
    this.host.currentViolationCodes = [];
    this.host.openingState = createOpeningNarrationState();
    this.host.activeScene = 'OPENING_NARRATION';
    this.host.updateFloatingHudToggleVisibility();
    void this.host.audio.playBgm('title_adventure', {
      forceRestart: true,
      crossfadeSec: 0.35
    });
  }

  public beginFooshaVillagePrologue(): void {
    this.host.storyDirector.startNewAdventurePrologue(this.host.campaign);
    this.host.campaign.currentZoneId = 'east_blue';
    this.host.campaign.ship.pos = { x: 360, y: 300 };
    const res = enterIslandEpisode(
      this.host.campaign,
      'foosha_shells',
      this.host.rpgRegistry
    );
    if (res.allowed && res.runtime) {
      this.host.islandRuntime = res.runtime;
      this.host.switchToScene('ISLAND_EPISODE');
    } else {
      this.host.switchToScene('SEA_SAILING');
    }
    this.host.campaign.voyageLog.push(
      '[제1장: 모험의 여명] 후샤 마을에서 도보로 이동해 골드 마커 [마키노]와 대화하세요!'
    );
    void this.host.triggerAutoSave('제1장 시작');
    this.host.refreshSideDrawer();
  }

  public stepOpeningFrame(dt: number): void {
    const opStep = stepOpeningNarration(this.host.openingState, dt);
    if (opStep.charRevealed) {
      this.typewriterSfxCounter += 1;
      if (this.typewriterSfxCounter % 3 === 0) {
        this.host.audio.playSfxId('ui_move');
      }
    }
    if (opStep.bgmSwellTriggered) {
      void this.host.audio.playBgm('sea_new_world', { crossfadeSec: 0.6 });
    }
  }

  public startStoryBattle(ctx: BattleContext): void {
    this.host.activeBattleContext = ctx;
    this.host.isBattlePaused = false;
    this.host.activeScene = 'STORY_BATTLE';
    this.host.clearTransientFocusAndInput();
    this.host.titleScene?.hide();
    this.host.updateFloatingHudToggleVisibility();
    this.host.storyDirector.enterStoryMission(ctx.encounterId, ctx.encounterName);
    this.host.prng = new SeededPRNG(20261119 + this.host.tickCount);
    this.host.battleWorld = createBattleWorldFromContext(
      this.host.campaign,
      ctx,
      this.host.rpgRegistry,
      this.host.gameRegistry,
      20261119 + this.host.tickCount
    );
    this.host.audio.playSfx('CLASH');
    this.host.syncSceneBgm(this.host.battleWorld);
    this.host.syncSceneBundles?.();
    this.host.updateShowcaseToolbar();
    this.host.refreshSideDrawer();
  }

  public finishStoryBattle(victory: boolean): void {
    if (this.host.getActiveEndgameBattleKind()) {
      this.host.finishEndgameBattle(victory);
      return;
    }
    if (!this.host.activeBattleContext) return;
    const ctx = this.host.activeBattleContext;
    const prevPoster = this.host.campaign.latestWantedPoster;

    applyBattleResultToCampaign(
      this.host.campaign,
      {
        context: ctx,
        victory,
        survivingPartyHpRatios: {}
      },
      this.host.rpgRegistry,
      this.host.gameRegistry
    );

    if (
      this.host.campaign.latestWantedPoster !== prevPoster &&
      this.host.campaign.latestWantedPoster
    ) {
      this.host.showWantedPosterOverlay = true;
      this.wantedPosterOpenTimer = 0;
      this.host.audio.playSfxId('wanted_poster_slam');
    }

    this.host.activeBattleContext = null;
    if (victory && ctx.sourceScene === 'ISLAND_EPISODE' && this.host.islandRuntime) {
      this.host.activeScene = 'ISLAND_EPISODE';
    } else {
      this.host.activeScene = 'SEA_SAILING';
    }
    this.host.clearTransientFocusAndInput();

    if (victory) {
      const outcome = this.host.storyDirector.completeStoryMission(
        this.host.campaign,
        ctx.setsFlagOnVictory ?? undefined
      );
      if (outcome.notice) {
        this.host.campaign.voyageLog.push(outcome.notice);
        this.host.saveIndicatorText = outcome.notice.slice(0, 26);
        this.host.saveIndicatorTimer = 3.2;
      }
      void this.host.triggerAutoSave('전투 승리');
      void this.host.audio.playBgm('victory_fanfare', {
        forceRestart: true,
        crossfadeSec: 0.2
      });
      this.host.syncActivePartyBundles?.();
    } else {
      this.host.storyDirector.abortStoryMissionToFreeRoam();
      this.host.syncSceneBgm();
    }

    this.host.syncSceneBundles?.();
    this.host.audio.playSfx('FORM_SHIFT');
    this.host.updateShowcaseToolbar();
    this.host.refreshSideDrawer();
  }

  public stepRpgFrame(dt: number): void {
    this.host.playTimeSec += dt;
    this.host.storyDirector.stepTimers(dt);
    if (this.host.saveIndicatorTimer > 0) {
      this.host.saveIndicatorTimer = Math.max(0, this.host.saveIndicatorTimer - dt);
    }
    if (this.host.islandRuntime?.activeDialogueNpc) {
      const dlgStep = stepDialogueOverlayUi(
        this.host.dialogueUiState,
        this.host.islandRuntime.activeDialogueNpc,
        this.host.islandRuntime.dialogueLineIndex,
        dt
      );
      if (dlgStep.charRevealed) {
        this.typewriterSfxCounter += 1;
        if (this.typewriterSfxCounter % 3 === 0) {
          this.host.audio.playSfxId('ui_move');
        }
      }
      if (dlgStep.shouldAutoAdvance) {
        this.host.pendingRpgInteract = true;
      }
    } else {
      stepDialogueOverlayUi(this.host.dialogueUiState, null, -1, dt);
    }
    if (this.host.campaign.shipboardCookingCooldownSec > 0) {
      this.host.campaign.shipboardCookingCooldownSec = Math.max(
        0,
        this.host.campaign.shipboardCookingCooldownSec - dt
      );
    }

    const moveVec = this.host.input.getExplorationMoveVector();
    const interactPressed = this.host.pendingRpgInteract;
    const coupPressed = this.host.pendingCoupDeBurst;
    this.host.pendingRpgInteract = false;
    this.host.pendingCoupDeBurst = false;

    if (this.host.showWantedPosterOverlay) {
      this.wantedPosterOpenTimer += dt;
      if (
        this.wantedPosterOpenTimer >= 0.8 &&
        (Math.abs(moveVec.x) > 0.1 || Math.abs(moveVec.y) > 0.1)
      ) {
        this.host.showWantedPosterOverlay = false;
      } else {
        return;
      }
    }

    if (this.host.gateBlockedPopup) {
      return;
    }

    if (this.host.activeScene === 'SEA_SAILING') {
      this.stepSeaSailingScene(moveVec, coupPressed, interactPressed, dt);
    } else if (this.host.activeScene === 'ISLAND_EPISODE' && this.host.islandRuntime) {
      this.stepIslandScene(moveVec, interactPressed, dt);
    }
  }

  private stepSeaSailingScene(
    moveVec: { x: number; y: number },
    coupPressed: boolean,
    interactPressed: boolean,
    dt: number
  ): void {
    this.host.seaChartController?.step(dt);
    if (this.host.seaChartController?.state.isOpen) {
      return;
    }
    if (coupPressed) {
      this.host.audio.playSfxId('coup_de_burst');
    }
    this.host.lastSailingStep = stepSeaSailing(
      this.host.campaign,
      {
        moveVec,
        coupDeBurstPressed: coupPressed,
        dockOrInteractPressed: interactPressed
      },
      dt,
      this.host.rpgRegistry
    );

    if (this.host.lastSailingStep.collectedNotice) {
      this.host.audio.playSfx('FORM_SHIFT');
      this.host.refreshSideDrawer();
    }

    if (this.host.lastSailingStep.triggeredBattle) {
      this.startStoryBattle(this.host.lastSailingStep.triggeredBattle);
      return;
    }

    if (!interactPressed) return;

    const nearbyIsl = this.host.lastSailingStep.nearbyIsland;
    if (nearbyIsl && nearbyIsl.endgameMode === 'IMPEL_DOWN') {
      if (isImpelDownUnlocked(this.host.campaign, this.host.endgameRegistry)) {
        this.host.openImpelDownModal();
        this.host.audio.playSfx('UI_CLICK');
      } else {
        this.host.campaign.voyageLog.push(
          '[임펠 다운 잠김] 마린포드 에피소드(ep_marineford) 완료 후 입항할 수 있습니다. (엔드게임 허브 Debug 토글 가능)'
        );
        this.host.openEndgameHub();
      }
    } else if (nearbyIsl && nearbyIsl.playableInVerticalSlice) {
      const dockRes = enterIslandEpisode(
        this.host.campaign,
        nearbyIsl.islandId,
        this.host.rpgRegistry
      );
      if (dockRes.allowed && dockRes.runtime) {
        this.host.islandRuntime = dockRes.runtime;
        this.host.switchToScene('ISLAND_EPISODE');
        void this.host.triggerAutoSave('섬 입항');
        this.host.audio.playSfx('UI_CLICK');
      }
    } else if (this.host.lastSailingStep.nearbySeaGate) {
      const gateRes = tryTransitionThroughSeaGate(
        this.host.campaign,
        this.host.rpgRegistry
      );
      if (!gateRes.allowed) {
        this.host.gateBlockedPopup = gateRes;
        this.host.audio.playSfx('HIT');
      } else {
        void this.host.triggerAutoSave('해역 관문 통과');
        this.host.audio.playSfx('FORM_SHIFT');
        this.host.syncSceneBgm();
        this.host.syncSceneBundles?.();
        this.host.refreshSideDrawer();
      }
    }
  }

  private stepIslandScene(
    moveVec: { x: number; y: number },
    interactPressed: boolean,
    dt: number
  ): void {
    if (!this.host.islandRuntime) return;
    const prevZoneId = this.host.islandRuntime.currentZoneId ?? null;
    this.host.lastIslandStep = stepIslandExploration(
      this.host.campaign,
      this.host.islandRuntime,
      moveVec,
      interactPressed,
      dt,
      this.host.rpgRegistry,
      this.host.gameRegistry
    );

    const step = this.host.lastIslandStep;
    if (step.footstepEvent) {
      const fs = step.footstepEvent;
      this.host.assets.footstepParticles.spawn(fs.material, fs.x, fs.y);
      const sfxProfile = FOOTSTEP_SFX_BY_SURFACE[fs.material] ?? {
        id: 'dodge_whoosh',
        volumeScale: 0.18,
        pitchScale: 1.45
      };
      this.host.audio.playSfxId(sfxProfile.id, {
        volumeScale: sfxProfile.volumeScale,
        pitchScale: sfxProfile.pitchScale
      });
    }

    if (
      this.host.islandRuntime.currentZoneId &&
      this.host.islandRuntime.currentZoneId !== prevZoneId
    ) {
      this.host.audio.playSfxId('ui_move', { volumeScale: 0.35, pitchScale: 1.2 });
    }

    if (step.openedChest) {
      const oc = step.openedChest;
      this.host.audio.playSfxId('just_dodge_chime');
      this.host.saveIndicatorText = `💎 보물상자: +${oc.berriesAwarded.toLocaleString()}B / +${oc.tpAwarded}TP`;
      this.host.saveIndicatorTimer = 3.2;
      void this.host.triggerAutoSave('보물상자 개봉');
      this.host.refreshSideDrawer();
      return;
    }

    if (interactPressed) {
      if (step.nearbyActivityMarker) {
        if (step.nearbyActivityMarker.actionKind === 'CAMP_TRAINING') {
          this.host.openCrewCampModal();
        } else if (step.nearbyActivityMarker.actionKind === 'BOUNTY_BOARD') {
          this.host.saveIndicatorText = `📜 현상금 ${this.host.campaign.totalCrewBounty.toLocaleString()} 베리 (${this.host.campaign.recruitedUnitIds.length}명)`;
          this.host.saveIndicatorTimer = 3.0;
        }
      }
      this.host.audio.playSfx('UI_CLICK');
      void this.host.triggerAutoSave('에피소드 진행');
      this.host.refreshSideDrawer();
    }

    if (this.host.lastIslandStep.requestedOpenOnlineTerminal) {
      this.host.openOnlineLobbyModal(true);
      return;
    }

    if (this.host.lastIslandStep.requestedEndgameMode) {
      const mode = this.host.lastIslandStep.requestedEndgameMode;
      if (mode === 'COLOSSEUM') {
        this.host.openColosseumModal('TOURNAMENT');
      } else if (mode === 'IMPEL_DOWN') {
        this.host.openImpelDownModal();
      } else if (mode === 'RAID') {
        this.host.openRaidLobbyModal();
      } else {
        this.host.openEndgameHub();
      }
      return;
    }

    if (this.host.lastIslandStep.triggeredBattle) {
      this.startStoryBattle(this.host.lastIslandStep.triggeredBattle);
      return;
    }

    if (this.host.lastIslandStep.requestedExitToSea) {
      this.host.islandRuntime = null;
      if (this.host.storyDirector.shouldTriggerFirstSailTutorial(this.host.campaign)) {
        this.host.campaign.voyageLog.push(
          '[제1장 첫 출항] 알비다 해적단이 근해를 가로막았다! 첫 해상전 튜토리얼 돌입!'
        );
        void this.host.triggerAutoSave('첫 출항');
        this.startStoryBattle(
          this.host.storyDirector.createAlvidaTutorialBattleContext()
        );
        return;
      }
      void this.host.triggerAutoSave('항구 출항');
      this.host.switchToScene('SEA_SAILING');
    }
  }
}
