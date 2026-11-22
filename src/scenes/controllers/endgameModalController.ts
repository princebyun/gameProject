import { createBattleWorld } from '../../core/combat/battleWorld';
import {
  buildColosseumMatchBattleConfig,
  createColosseumTournament,
  isColosseumUnlocked,
  purchaseTutorMove,
  recordColosseumPlayerMatchResult
} from '../../core/endgame/colosseum';
import {
  buildImpelDownFloorBattleConfig,
  completeAndExitImpelDownRun,
  continueImpelDownEndless,
  isImpelDownUnlocked,
  recordImpelDownFloorOutcome,
  resumeImpelDownRun,
  selectImpelDownDraftBuff,
  startImpelDownRun,
  suspendImpelDownRun
} from '../../core/endgame/impelDown';
import {
  buildOfflineRaidBattleConfig,
  equipRaidRelic,
  recordRaidOutcome
} from '../../core/endgame/raid';
import type {
  ColosseumTierId,
  ColosseumTournamentState,
  ImpelDownRunState
} from '../../core/endgame/types';
import { SeededPRNG } from '../../core/math/prng';
import { renderColosseumModal } from '../endgame/colosseumScene';
import { renderEndgameHubModal } from '../endgame/endgameHubScene';
import { renderImpelDownModal } from '../endgame/impelDownScene';
import { renderRaidLobbyModal } from '../endgame/raidLobbyScene';
import type { Disposable } from '../sceneTypes';
import type { SceneManagerHost } from './controllerContracts';

export class EndgameModalController implements Disposable {
  private activeImpelDownRun: ImpelDownRunState | null = null;
  private activeColosseumTournament: ColosseumTournamentState | null = null;
  private activeEndgameBattleKind: 'IMPEL_DOWN' | 'COLOSSEUM' | 'RAID' | null = null;
  private colosseumTab: 'TOURNAMENT' | 'TUTOR' = 'TOURNAMENT';
  private colosseumNotice: string | null = null;
  private colosseumTutorUnitId = 'luffy';
  private selectedRaidRelicUnitId = 'luffy';
  private raidLobbyNotice: string | null = null;
  private activeOfflineRaidId: string | null = null;

  constructor(private readonly host: SceneManagerHost) {}

  public dispose(): void {
    this.activeEndgameBattleKind = null;
  }

  public getActiveBattleKind(): 'IMPEL_DOWN' | 'COLOSSEUM' | 'RAID' | null {
    return this.activeEndgameBattleKind;
  }

  public openEndgameHub(): void {
    renderEndgameHubModal(
      this.host.endgameModalEl,
      this.host.campaign,
      this.host.endgameRegistry,
      {
        onOpenImpelDown: () => this.openImpelDownModal(),
        onOpenColosseum: () => this.openColosseumModal('TOURNAMENT'),
        onOpenRaidLobby: () => this.openRaidLobbyModal(),
        onToggleDebugUnlock: (enabled) => {
          this.host.campaign.debugUnlockEndgame = enabled;
          this.openEndgameHub();
        },
        onClose: () => {
          this.host.endgameModalEl.classList.remove('open');
        }
      }
    );
  }

  public openImpelDownModal(): void {
    if (!isImpelDownUnlocked(this.host.campaign, this.host.endgameRegistry)) {
      this.openEndgameHub();
      return;
    }
    if (!this.activeImpelDownRun) {
      this.activeImpelDownRun = resumeImpelDownRun(this.host.campaign);
    }
    renderImpelDownModal(
      this.host.endgameModalEl,
      this.activeImpelDownRun,
      this.host.campaign,
      this.host.gameRegistry,
      this.host.endgameRegistry,
      {
        onStartNewRun: (partyUnitIds) => {
          this.activeImpelDownRun = startImpelDownRun(
            partyUnitIds,
            20261119 + this.host.tickCount,
            this.host.campaign,
            this.host.gameRegistry,
            this.host.endgameRegistry
          );
          void this.host.triggerAutoSave('임펠 다운 도전 시작');
          this.openImpelDownModal();
        },
        onStartFloorBattle: (run) => {
          const { config } = buildImpelDownFloorBattleConfig(
            run,
            this.host.campaign,
            this.host.gameRegistry,
            this.host.endgameRegistry
          );
          this.activeImpelDownRun = run;
          this.activeEndgameBattleKind = 'IMPEL_DOWN';
          this.host.activeBattleContext = null;
          this.host.endgameModalEl.classList.remove('open');
          this.host.prng = new SeededPRNG(config.seed);
          this.host.battleWorld = createBattleWorld(config, this.host.gameRegistry);
          this.host.activeScene = 'STORY_BATTLE';
          this.host.audio.playSfx('CLASH');
          this.host.updateShowcaseToolbar();
          this.host.refreshSideDrawer();
        },
        onPickBuff: (run, buffId) => {
          selectImpelDownDraftBuff(
            run,
            buffId,
            this.host.campaign,
            this.host.gameRegistry,
            this.host.endgameRegistry
          );
          void this.host.triggerAutoSave('임펠 다운 버프 선택');
          this.openImpelDownModal();
        },
        onContinueEndless: (run) => {
          continueImpelDownEndless(run, this.host.campaign);
          void this.host.triggerAutoSave('임펠 다운 무한 심층 돌입');
          this.openImpelDownModal();
        },
        onFinishRun: () => {
          completeAndExitImpelDownRun(this.host.campaign);
          this.activeImpelDownRun = null;
          void this.host.triggerAutoSave('임펠 다운 6층 완주');
          this.host.endgameModalEl.classList.remove('open');
          this.host.refreshSideDrawer();
        },
        onSuspendAndClose: (run) => {
          suspendImpelDownRun(this.host.campaign, run);
          void this.host.triggerAutoSave('임펠 다운 중단 저장');
          this.host.endgameModalEl.classList.remove('open');
          this.host.refreshSideDrawer();
        },
        onClose: () => {
          this.host.endgameModalEl.classList.remove('open');
        }
      }
    );
  }

  public openColosseumModal(tab?: 'TOURNAMENT' | 'TUTOR'): void {
    if (!isColosseumUnlocked(this.host.campaign, this.host.endgameRegistry)) {
      this.openEndgameHub();
      return;
    }
    if (tab) this.colosseumTab = tab;
    renderColosseumModal(
      this.host.endgameModalEl,
      this.activeColosseumTournament,
      this.colosseumTab,
      this.colosseumTutorUnitId,
      this.colosseumNotice,
      this.host.campaign,
      this.host.gameRegistry,
      this.host.endgameRegistry,
      {
        onCreateTournament: (tierId: ColosseumTierId, playerUnitId: string, ringOutEnabled: boolean) => {
          this.colosseumNotice = null;
          this.activeColosseumTournament = createColosseumTournament(
            tierId,
            playerUnitId,
            20261119 + this.host.tickCount,
            ringOutEnabled,
            this.host.campaign,
            this.host.gameRegistry,
            this.host.endgameRegistry
          );
          this.openColosseumModal('TOURNAMENT');
        },
        onStartNextMatch: (tournament) => {
          const config = buildColosseumMatchBattleConfig(
            tournament,
            this.host.campaign,
            this.host.gameRegistry,
            this.host.endgameRegistry
          );
          if (!config) return;
          this.activeColosseumTournament = tournament;
          this.activeEndgameBattleKind = 'COLOSSEUM';
          this.host.activeBattleContext = null;
          this.host.endgameModalEl.classList.remove('open');
          this.host.prng = new SeededPRNG(config.seed);
          this.host.battleWorld = createBattleWorld(config, this.host.gameRegistry);
          this.host.activeScene = 'STORY_BATTLE';
          this.host.audio.playSfx('CLASH');
          this.host.updateShowcaseToolbar();
          this.host.refreshSideDrawer();
        },
        onResetTournament: () => {
          this.activeColosseumTournament = null;
          this.colosseumNotice = null;
          this.openColosseumModal('TOURNAMENT');
        },
        onPurchaseTutorMove: (unitId, moveId, slotIndex) => {
          const res = purchaseTutorMove(
            unitId,
            moveId,
            slotIndex,
            this.host.campaign,
            this.host.gameRegistry,
            this.host.endgameRegistry
          );
          this.colosseumNotice = res.message;
          if (res.success) {
            void this.host.triggerAutoSave('콜로세움 기술 전수');
          }
          this.openColosseumModal('TUTOR');
        },
        onClose: () => {
          this.host.endgameModalEl.classList.remove('open');
        }
      },
      (nextTab, nextUnitId) => {
        this.colosseumTab = nextTab;
        if (nextUnitId) this.colosseumTutorUnitId = nextUnitId;
        this.openColosseumModal();
      }
    );
  }

  public openRaidLobbyModal(): void {
    renderRaidLobbyModal(
      this.host.endgameModalEl,
      this.host.selectedRaidId,
      this.selectedRaidRelicUnitId,
      this.raidLobbyNotice,
      this.host.campaign,
      this.host.gameRegistry,
      this.host.endgameRegistry,
      {
        onStartOfflineRaid: (raidId, squadUnitIds) => {
          const cfg = buildOfflineRaidBattleConfig(
            raidId,
            squadUnitIds,
            20261119 + this.host.tickCount,
            this.host.campaign,
            this.host.gameRegistry,
            this.host.endgameRegistry
          );
          if (!cfg) return;
          this.host.selectedRaidId = raidId;
          this.activeOfflineRaidId = raidId;
          this.activeEndgameBattleKind = 'RAID';
          this.host.activeBattleContext = null;
          this.host.endgameModalEl.classList.remove('open');
          this.host.prng = new SeededPRNG(cfg.seed);
          this.host.battleWorld = createBattleWorld(cfg, this.host.gameRegistry);
          this.host.activeScene = 'STORY_BATTLE';
          this.host.audio.playSfx('CLASH');
          this.host.updateShowcaseToolbar();
          this.host.refreshSideDrawer();
        },
        onOpenOnlineCoopRaid: (raidId) => {
          this.host.selectedRaidId = raidId;
          this.host.onlineLobbyDefaultMode = 'COOP_RAID';
          this.host.endgameModalEl.classList.remove('open');
          this.host.openOnlineLobbyModal(false);
        },
        onEquipRelic: (unitId, relicId) => {
          const res = equipRaidRelic(
            unitId,
            relicId,
            this.host.campaign,
            this.host.gameRegistry,
            this.host.endgameRegistry
          );
          this.raidLobbyNotice = res.message;
          if (res.success) {
            void this.host.triggerAutoSave('레이드 유물 장착');
          }
          this.openRaidLobbyModal();
        },
        onClose: () => {
          this.host.endgameModalEl.classList.remove('open');
        }
      },
      (raidId, relicUnitId) => {
        this.host.selectedRaidId = raidId;
        this.selectedRaidRelicUnitId = relicUnitId;
        this.openRaidLobbyModal();
      }
    );
  }

  public finishEndgameBattle(victory: boolean): void {
    const kind = this.activeEndgameBattleKind;
    this.activeEndgameBattleKind = null;
    this.host.activeScene = this.host.islandRuntime ? 'ISLAND_EPISODE' : 'SEA_SAILING';
    this.host.clearTransientFocusAndInput();
    this.host.audio.playSfx('FORM_SHIFT');
    this.host.updateShowcaseToolbar();
    this.host.refreshSideDrawer();

    if (kind === 'IMPEL_DOWN' && this.activeImpelDownRun) {
      recordImpelDownFloorOutcome(
        this.activeImpelDownRun,
        this.host.battleWorld,
        victory,
        this.host.campaign,
        this.host.endgameRegistry
      );
      void this.host.triggerAutoSave(victory ? '임펠 다운 층 돌파' : '임펠 다운 종료');
      this.openImpelDownModal();
    } else if (kind === 'COLOSSEUM' && this.activeColosseumTournament) {
      const res = recordColosseumPlayerMatchResult(
        this.activeColosseumTournament,
        victory,
        this.host.battleWorld.colosseumRingOut.resolvedByRingOut,
        this.host.campaign,
        this.host.endgameRegistry
      );
      if (res.playerChampion) {
        this.colosseumNotice = `🏆 ${this.activeColosseumTournament.tierId}급 토너먼트 우승! +${res.cpAwarded} CP / 수배서 프레임: ${res.newFrameTier.toUpperCase()}`;
        void this.host.triggerAutoSave('코리다 콜로세움 우승');
      }
      this.openColosseumModal('TOURNAMENT');
    } else if (kind === 'RAID' && this.activeOfflineRaidId) {
      const raidId = this.activeOfflineRaidId;
      this.activeOfflineRaidId = null;
      const res = recordRaidOutcome(
        raidId,
        victory,
        this.host.battleWorld.elapsedSec,
        this.host.campaign,
        this.host.endgameRegistry
      );
      this.raidLobbyNotice = victory
        ? `🏆 레이드 토벌 성공 (${this.host.battleWorld.elapsedSec.toFixed(1)}s)!${res.unlockedRelic ? ` 유물 해금: ${res.unlockedRelic.icon} ${res.unlockedRelic.name}` : ''}`
        : '💀 거대 보스 레이드 실패 — 스쿼드 편성과 유물을 정비하고 재도전하세요!';
      if (victory) {
        void this.host.triggerAutoSave('거대 보스 레이드 토벌');
      }
      this.openRaidLobbyModal();
    }
  }
}
