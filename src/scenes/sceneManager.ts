import { AssetLoader } from '../assets/assetLoader';
import { AudioManager } from '../audio/audioManager';
import { resolveBgmForSeaZone } from '../data/assets/assetManifestRegistry';
import { AssetPreviewScene } from './dev/assetPreviewScene';
import {
  buildColosseumMatchBattleConfig,
  createColosseumTournament,
  isColosseumUnlocked,
  purchaseTutorMove,
  recordColosseumPlayerMatchResult
} from '../core/endgame/colosseum';
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
} from '../core/endgame/impelDown';
import {
  buildOfflineRaidBattleConfig,
  equipRaidRelic,
  recordRaidOutcome
} from '../core/endgame/raid';
import type {
  ColosseumTierId,
  ColosseumTournamentState,
  EndgameDataRegistry,
  ImpelDownRunState
} from '../core/endgame/types';
import { defaultEndgameRegistry } from '../data/endgame/endgameRegistry';
import { renderColosseumModal } from './endgame/colosseumScene';
import { renderEndgameHubModal } from './endgame/endgameHubScene';
import { renderImpelDownModal } from './endgame/impelDownScene';
import { renderRaidLobbyModal } from './endgame/raidLobbyScene';
import {
  createBattleWorld,
  stepBattleWorld
} from '../core/combat/battleWorld';
import { activateFormShift } from '../core/combat/formShiftEngine';
import { BATTLE_CALC_VERSION, FIXED_DT } from '../core/constants';
import { SeededPRNG } from '../core/math/prng';
import {
  LockstepSyncController,
  type LockstepConfig
} from '../core/net/lockstepController';
import type {
  OnlineRosterPayload,
  PartyRuleMode,
  RoomStateSnapshot,
  ServerToClientMessage
} from '../core/net/protocol';
import {
  applyTerminalBattleOutcome,
  capturePreTerminalPartySnapshot,
  createStandardPresetBuild,
  type PreTerminalPartySnapshot
} from '../core/net/terminalArenaRule';
import type { NetworkTransport } from '../core/net/transport';
import {
  applyBattleResultToCampaign,
  createBattleWorldFromContext
} from '../core/rpg/battleBridge';
import { createInitialCampaignState } from '../core/rpg/campaignState';
import { computeBountyTier } from '../core/rpg/crewAndBountyEngine';
import {
  enterIslandEpisode,
  exitIslandToSea,
  stepIslandExploration,
  type IslandExplorationRuntime,
  type IslandStepOutput
} from '../core/rpg/episodeEngine';
import {
  stepSeaSailing,
  type SailingStepOutput
} from '../core/rpg/sailingPhysics';
import { tryTransitionThroughSeaGate } from '../core/rpg/seaGateValidator';
import type {
  GlobalSettingsPayload,
  SaveEnvelope,
  SaveSlotId
} from '../core/save/schema';
import {
  deserializeSaveEnvelopeToCampaign,
  serializeCampaignToSaveEnvelope
} from '../core/save/serializer';
import type { GameDataRegistry, StatBlock } from '../core/types/dataSchemas';
import type {
  BattleWorldConfig,
  BattleWorldState,
  UnitBuildConfig
} from '../core/types/battleState';
import type {
  BattleContext,
  GateValidationResult,
  RpgCampaignState,
  RpgDataRegistry
} from '../core/types/rpgSchemas';
import {
  UnifiedInputManager,
  type TouchButtonSizePreset
} from '../input/inputManager';
import type { KeyBindingConfig } from '../input/keyBindings';
import type { WindowDisplayMode } from '../platform/deviceAdapter';
import { LoopbackNetworkHub } from '../platform/net/loopbackTransport';
import { WebSocketTransport } from '../platform/net/webSocketTransport';
import type { PlatformAdapter } from '../platform/platformAdapter';
import {
  createPlatformBridge,
  type PlatformBridge
} from '../platform/platformBridge';
import type { ImportedSavePreview } from '../platform/storage/saveFileIO';
import type { SaveStorageAdapter } from '../platform/storage/storageAdapter';
import {
  runDebugStoryJump,
  runSandboxShowcaseScenario,
  type SandboxShowcaseKind
} from './controllers/debugShowcaseController';
import {
  createCrewCampModalElement,
  renderCrewCampModal
} from './modals/crewCampModal';
import {
  createOnlineLobbyModalElement as buildOnlineLobbyModalElement,
  renderOnlineLobbyModalContents as renderOnlineLobbyModalDom
} from './modals/onlineLobbyModal';
import {
  createSaveManagerModalElement,
  renderSaveManagerModal
} from './modals/saveManagerModal';
import {
  createMobileVirtualControllerDockElement,
  createSettingsModalElement
} from './modals/settingsModal';
import { renderBattleArena } from '../render/battleRenderer';
import { CanvasRenderer } from '../render/canvasRenderer';
import {
  createDialogueOverlayUiState,
  handleDialogueOverlayTap,
  renderDialogueCutsceneOverlay,
  renderSaveAndTamperOverlay,
  renderSeaGateBlockedPopup,
  renderWantedPosterOverlay,
  stepDialogueOverlayUi,
  type DialogueOverlayUiState
} from '../render/dialogueAndPosterRenderer';
import {
  createInitialMissionTrackerState,
  handleMissionTrackerTap,
  renderMissionTrackerHud,
  type MissionTrackerState
} from '../render/missionTrackerHud';
import {
  createBootSceneState,
  renderBootScene,
  stepBootScene,
  type BootSceneState
} from './bootScene';
import {
  advanceOpeningNarrationOnTap,
  createOpeningNarrationState,
  renderOpeningNarrationScene,
  stepOpeningNarration,
  type OpeningNarrationState
} from './openingNarrationScene';
import {
  formatPlayTime,
  renderTitleSceneCanvas,
  TitleSceneController,
  type TitleSavePreview
} from './titleScene';
import { StoryDirector } from '../story/storyDirector';
import {
  collectIslandWorldMarkers,
  collectSeaWorldMarkers
} from '../story/worldMarkerSystem';
import { renderBattleHud } from '../render/hudRenderer';
import { renderIslandEpisodeCanvas } from '../render/islandRenderer';
import { renderSeaSailingCanvas } from '../render/sailingRenderer';
import {
  renderOnlineAndSpectatorHud,
  type SpectatorCameraTarget
} from '../render/spectatorHudRenderer';
import { renderTouchOverlay } from '../render/touchOverlayRenderer';

export type ActiveAppScene =
  | 'BOOT'
  | 'TITLE'
  | 'OPENING_NARRATION'
  | 'SEA_SAILING'
  | 'ISLAND_EPISODE'
  | 'STORY_BATTLE'
  | 'ONLINE_BATTLE'
  | 'SANDBOX';

const EV_PRESETS: Record<string, { label: string; evs: StatBlock }> = {
  balanced: {
    label: '밸런스형 (Balanced)',
    evs: { hp: 80, atk: 80, def: 80, spAtk: 80, spDef: 80, spd: 80 }
  },
  specialSweeper: {
    label: '특수 딜러형 (SpAtk/Spd)',
    evs: { hp: 20, atk: 0, def: 20, spAtk: 200, spDef: 20, spd: 200 }
  },
  physicalBrawler: {
    label: '물리 패기 격투형 (Atk/HP)',
    evs: { hp: 180, atk: 200, def: 40, spAtk: 0, spDef: 40, spd: 40 }
  },
  fortressTank: {
    label: '사황 중장갑형 (HP/Def/SpDef)',
    evs: { hp: 200, atk: 60, def: 130, spAtk: 40, spDef: 130, spd: 0 }
  }
};

export class SceneManager {
  public activeScene: ActiveAppScene = 'BOOT';
  public readonly storyDirector = new StoryDirector();
  private bootState: BootSceneState = createBootSceneState();
  private bootAssetsReady = false;
  private latestBootSaveEnvelope: SaveEnvelope | null = null;
  private titleScene!: TitleSceneController;
  private openingState: OpeningNarrationState = createOpeningNarrationState();
  private missionTrackerState: MissionTrackerState =
    createInitialMissionTrackerState();
  private dialogueUiState: DialogueOverlayUiState =
    createDialogueOverlayUiState();
  private hudToggleBtnEl: HTMLButtonElement | null = null;
  private typewriterSfxCounter = 0;
  public campaign: RpgCampaignState;
  public islandRuntime: IslandExplorationRuntime | null = null;
  public activeBattleContext: BattleContext | null = null;
  public gateBlockedPopup: GateValidationResult | null = null;
  public showWantedPosterOverlay = false;
  private wantedPosterOpenTimer = 0;
  private devToolsExpanded = false;

  public platformBridge: PlatformBridge;
  public storage: SaveStorageAdapter;
  public isCurrentSaveTampered = false;
  public currentViolationCodes: string[] = [];
  public playTimeSec = 0;
  public saveIndicatorTimer = 0;
  public saveIndicatorText = '💾 저장 완료';

  // Phase 4 Online Multiplayer & Spectator state
  public activeTransport: NetworkTransport | null = null;
  public loopbackHub: LoopbackNetworkHub;
  public currentRoomState: RoomStateSnapshot | null = null;
  public onlineAssignedRole: 'PLAYER' | 'SPECTATOR' = 'PLAYER';
  public onlineAssignedSlotIndex = 0;
  public activeLockstep: LockstepSyncController | null = null;
  public spectatorCameraTarget: SpectatorCameraTarget = 'ALL';
  public isTerminalOnlineMatch = false;
  public preTerminalSnapshot: PreTerminalPartySnapshot | null = null;
  public onlineErrorNotice: string | null = null;
  public forfeitConfirmArmed = false;

  private renderer!: CanvasRenderer;
  private input: UnifiedInputManager;
  private assets: AssetLoader;
  private audio: AudioManager;
  private prng: SeededPRNG;

  private sandboxConfig: BattleWorldConfig;
  private battleWorld: BattleWorldState;
  private lastSailingStep: SailingStepOutput = {
    nearbyIsland: null,
    nearbySeaGate: null,
    triggeredBattle: null,
    collectedNotice: null
  };
  private lastIslandStep: IslandStepOutput = {
    nearbyNpc: null,
    nearbySwitch: null,
    nearbyEncounter: null,
    atPortExit: false,
    atBattleTerminal: false,
    triggeredBattle: null,
    requestedExitToSea: false,
    requestedOpenOnlineTerminal: false
  };

  private pendingRpgInteract = false;
  private pendingCoupDeBurst = false;
  private tickCount = 0;
  private accumulator = 0;
  private lastTimeMs = 0;
  private fps = 60;
  private frameCounter = 0;
  private fpsTimerMs = 0;

  private sideDrawerEl!: HTMLElement;
  private campModalEl!: HTMLElement;
  private saveModalEl!: HTMLElement;
  private onlineModalEl!: HTMLElement;
  private settingsModalEl!: HTMLElement;
  private endgameModalEl!: HTMLElement;
  private assetPreviewScene!: AssetPreviewScene;
  private endgameRegistry: EndgameDataRegistry = defaultEndgameRegistry;
  private activeImpelDownRun: ImpelDownRunState | null = null;
  private activeColosseumTournament: ColosseumTournamentState | null = null;
  private activeEndgameBattleKind: 'IMPEL_DOWN' | 'COLOSSEUM' | 'RAID' | null = null;
  private colosseumTab: 'TOURNAMENT' | 'TUTOR' = 'TOURNAMENT';
  private colosseumNotice: string | null = null;
  private colosseumTutorUnitId = 'luffy';
  private selectedRaidId = 'raid_kaido_flame';
  private selectedRaidRelicUnitId = 'luffy';
  private raidLobbyNotice: string | null = null;
  private activeOfflineRaidId: string | null = null;
  private onlineLobbyDefaultMode: '2V2' | '1V1' | 'COOP_RAID' = '2V2';
  private showcaseBarEl!: HTMLElement;
  private mobileDockEl!: HTMLElement;
  private networkBadgeEl!: HTMLElement;
  private pendingImportPreview: ImportedSavePreview | null = null;
  private pendingImportTargetSlot: SaveSlotId = 'slot_1';
  private lastVoyageLogLen = 0;
  private lastCombatLogLen = 0;

  constructor(
    private rootEl: HTMLElement,
    private gameRegistry: GameDataRegistry,
    private rpgRegistry: RpgDataRegistry,
    private platform: PlatformAdapter | PlatformBridge,
    customStorage?: SaveStorageAdapter
  ) {
    this.platformBridge =
      'runtimeTarget' in platform ? platform : createPlatformBridge();
    this.storage = customStorage ?? this.platformBridge.storage;
    this.loopbackHub = new LoopbackNetworkHub(
      gameRegistry,
      rpgRegistry,
      BATTLE_CALC_VERSION
    );
    this.input = new UnifiedInputManager(platform);
    this.assets = new AssetLoader();
    this.audio = new AudioManager();
    this.prng = new SeededPRNG(20261119);

    this.campaign = createInitialCampaignState(rpgRegistry, gameRegistry);
    this.sandboxConfig = this.createDefaultSandboxConfig();
    this.battleWorld = createBattleWorld(this.sandboxConfig, gameRegistry);
  }

  public async init(): Promise<void> {
    await this.platformBridge.init();
    if (this.storage !== this.platformBridge.storage) {
      await this.storage.init();
    }
    this.platformBridge.device.onHardwareBack(
      () => this.handleHardwareBackButton(),
      (toastMsg) => {
        this.saveIndicatorText = toastMsg;
        this.saveIndicatorTimer = 2.0;
      }
    );
    this.audio.attachGestureUnlock();
    this.buildDomLayout();
    this.titleScene = new TitleSceneController(this.rootEl, {
      onFirstInteraction: () => {
        this.audio.unlock();
        void this.audio.playBgm('title_adventure');
        this.audio.playSfxId('ui_confirm');
      },
      onContinue: () => {
        this.audio.unlock();
        this.audio.playSfxId('ui_confirm');
        if (this.latestBootSaveEnvelope) {
          this.titleScene.hide();
          this.applyLoadedEnvelope(this.latestBootSaveEnvelope);
        }
      },
      onNewAdventure: () => {
        this.audio.unlock();
        this.audio.playSfxId('awakening_drums');
        this.startNewAdventureFlow();
      },
      onSandbox: () => {
        this.audio.unlock();
        this.audio.playSfxId('ui_confirm');
        this.titleScene.hide();
        this.switchToScene('SANDBOX');
      },
      onOnlineOrRaid: () => {
        this.audio.unlock();
        this.audio.playSfxId('ui_confirm');
        this.titleScene.hide();
        this.switchToScene('SEA_SAILING');
        this.openOnlineLobbyModal(false);
      },
      onSettings: () => {
        this.audio.unlock();
        this.audio.playSfxId('ui_move');
        this.settingsModalEl?.classList.add('open');
      }
    });
    this.assetPreviewScene = new AssetPreviewScene(
      this.rootEl,
      this.gameRegistry,
      this.assets,
      this.audio,
      {
        onClose: () => this.syncSceneBgm()
      }
    );

    this.activeScene = 'BOOT';
    this.bootState = createBootSceneState();
    this.bootAssetsReady = false;
    this.updateFloatingHudToggleVisibility();

    this.attachInputListeners();
    this.setupPwaAndNetworkListeners();
    this.refreshSideDrawer();
    this.lastTimeMs = this.platform.nowMs();
    this.fpsTimerMs = this.lastTimeMs;
    requestAnimationFrame((t) => this.loop(t));

    // Preload core assets & scan saves asynchronously while BootScene animates
    await this.assets.preloadCoreAssets(this.gameRegistry.units);
    await this.scanLatestSaveOnBoot();
    this.bootAssetsReady = true;
  }

  private updateFloatingHudToggleVisibility(): void {
    if (!this.hudToggleBtnEl) return;
    const hideMenuBtn =
      this.activeScene === 'BOOT' ||
      this.activeScene === 'TITLE' ||
      this.activeScene === 'OPENING_NARRATION';
    this.hudToggleBtnEl.style.display = hideMenuBtn ? 'none' : '';
  }

  private buildTitleSavePreview(envelope: SaveEnvelope): TitleSavePreview {
    const temp = deserializeSaveEnvelopeToCampaign(
      envelope,
      this.rpgRegistry,
      this.gameRegistry
    );
    const tempDirector = new StoryDirector();
    const node = tempDirector.syncFromLoadedCampaign(temp.campaign);
    const island = temp.campaign.activeIslandId
      ? this.rpgRegistry.islands[temp.campaign.activeIslandId]
      : null;
    const zone = this.rpgRegistry.seaZones[temp.campaign.currentZoneId];
    return {
      envelope,
      chapterLabel: node.chapterLabel,
      locationName: island
        ? `🏝 ${island.name}`
        : `⚓ ${zone?.name ?? envelope.meta.summary.currentZoneName}`,
      bounty: temp.campaign.totalCrewBounty,
      playTimeLabel: formatPlayTime(envelope.meta.playTimeSec ?? 0)
    };
  }

  public enterTitleScene(): void {
    this.activeScene = 'TITLE';
    this.updateFloatingHudToggleVisibility();
    const preview = this.latestBootSaveEnvelope
      ? this.buildTitleSavePreview(this.latestBootSaveEnvelope)
      : null;
    this.titleScene?.show(preview);
    void this.audio.playBgm('title_adventure');
  }

  public startNewAdventureFlow(): void {
    this.titleScene?.hide();
    this.campaign = createInitialCampaignState(this.rpgRegistry, this.gameRegistry);
    this.islandRuntime = null;
    this.playTimeSec = 0;
    this.isCurrentSaveTampered = false;
    this.currentViolationCodes = [];
    this.openingState = createOpeningNarrationState();
    this.activeScene = 'OPENING_NARRATION';
    this.updateFloatingHudToggleVisibility();
    void this.audio.playBgm('title_adventure', { forceRestart: true, crossfadeSec: 0.35 });
  }

  public beginFooshaVillagePrologue(): void {
    this.storyDirector.startNewAdventurePrologue(this.campaign);
    this.campaign.currentZoneId = 'east_blue';
    this.campaign.ship.pos = { x: 360, y: 300 };
    const res = enterIslandEpisode(this.campaign, 'foosha_shells', this.rpgRegistry);
    if (res.allowed && res.runtime) {
      this.islandRuntime = res.runtime;
      this.switchToScene('ISLAND_EPISODE');
    } else {
      this.switchToScene('SEA_SAILING');
    }
    this.campaign.voyageLog.push(
      '[제1장: 모험의 여명] 후샤 마을에서 도보로 이동해 골드 마커 [마키노]와 대화하세요!'
    );
    void this.triggerAutoSave('제1장 시작');
    this.refreshSideDrawer();
  }

  private handleHardwareBackButton(): { handledByScene: boolean } {
    if (this.assetPreviewScene?.getIsOpen()) {
      this.assetPreviewScene.close();
      return { handledByScene: true };
    }
    if (this.saveModalEl?.classList.contains('open')) {
      this.saveModalEl.classList.remove('open');
      return { handledByScene: true };
    }
    if (this.onlineModalEl?.classList.contains('open')) {
      this.onlineModalEl.classList.remove('open');
      return { handledByScene: true };
    }
    if (this.campModalEl?.classList.contains('open')) {
      this.campModalEl.classList.remove('open');
      return { handledByScene: true };
    }
    if (this.settingsModalEl?.classList.contains('open')) {
      this.settingsModalEl.classList.remove('open');
      return { handledByScene: true };
    }
    if (this.showWantedPosterOverlay) {
      this.showWantedPosterOverlay = false;
      return { handledByScene: true };
    }
    if (this.gateBlockedPopup) {
      this.gateBlockedPopup = null;
      return { handledByScene: true };
    }
    if (
      this.activeScene === 'STORY_BATTLE' ||
      this.activeScene === 'ONLINE_BATTLE' ||
      this.activeScene === 'ISLAND_EPISODE'
    ) {
      this.settingsModalEl?.classList.add('open');
      return { handledByScene: true };
    }
    return { handledByScene: false };
  }

  private getCurrentGlobalSettings(): GlobalSettingsPayload {
    const vols = this.audio.getVolumes();
    return {
      flashEffect: this.renderer?.settings.flashEffectEnabled ?? true,
      shakeIntensity: this.renderer?.settings.shakeIntensity ?? 0.8,
      bgmVolume: vols.bgm,
      sfxVolume: vols.muted ? 0 : vols.sfx,
      keyBindings: { ...this.input.getBindings() }
    };
  }

  private applyAudioAndVisualSettings(settings: GlobalSettingsPayload): void {
    if (this.renderer) {
      this.renderer.settings.flashEffectEnabled = settings.flashEffect;
      this.renderer.settings.shakeIntensity = settings.shakeIntensity;
    }
    if (typeof settings.bgmVolume === 'number') {
      this.audio.setBgmVolume(settings.bgmVolume);
    }
    if (typeof settings.sfxVolume === 'number') {
      this.audio.setSfxVolume(settings.sfxVolume);
    }
    if (this.settingsModalEl) {
      const chkFlash = this.settingsModalEl.querySelector('#chk-flash') as HTMLInputElement | null;
      const rngShake = this.settingsModalEl.querySelector('#rng-shake') as HTMLInputElement | null;
      const rngBgm = this.settingsModalEl.querySelector('#rng-bgm-vol') as HTMLInputElement | null;
      const rngSfx = this.settingsModalEl.querySelector('#rng-sfx-vol') as HTMLInputElement | null;
      if (chkFlash) chkFlash.checked = settings.flashEffect;
      if (rngShake) rngShake.value = String(Math.round(settings.shakeIntensity * 100));
      if (rngBgm && typeof settings.bgmVolume === 'number') {
        rngBgm.value = String(Math.round(settings.bgmVolume * 100));
      }
      if (rngSfx && typeof settings.sfxVolume === 'number') {
        rngSfx.value = String(Math.round(settings.sfxVolume * 100));
      }
    }
  }

  public buildCurrentSaveEnvelope(slotId: SaveSlotId): SaveEnvelope {
    return serializeCampaignToSaveEnvelope(
      this.campaign,
      slotId,
      this.playTimeSec,
      new Date().toISOString(),
      this.getCurrentGlobalSettings(),
      this.islandRuntime,
      this.rpgRegistry,
      this.gameRegistry,
      this.isCurrentSaveTampered
    );
  }

  public async triggerAutoSave(reason: string): Promise<void> {
    this.saveIndicatorText = `💾 저장 중... (${reason})`;
    this.saveIndicatorTimer = 2.2;
    const envelope = this.buildCurrentSaveEnvelope('auto');
    await this.storage.saveSlot('auto', envelope);
    this.saveIndicatorText = `✓ 자동 저장됨 (${reason})`;
  }

  public async saveToSlot(slotId: SaveSlotId): Promise<SaveEnvelope> {
    const envelope = this.buildCurrentSaveEnvelope(slotId);
    await this.storage.saveSlot(slotId, envelope);
    await this.storage.saveGlobalSettings(this.getCurrentGlobalSettings());
    this.saveIndicatorText = `✓ [${slotId}] 저장 완료`;
    this.saveIndicatorTimer = 2.4;
    this.campaign.voyageLog.push(`[세이브] 슬롯 [${slotId}]에 현재 진행 상태를 저장했습니다.`);
    this.refreshSideDrawer();
    return envelope;
  }

  public applyLoadedEnvelope(envelope: SaveEnvelope): void {
    const restored = deserializeSaveEnvelopeToCampaign(
      envelope,
      this.rpgRegistry,
      this.gameRegistry
    );
    this.campaign = restored.campaign;
    this.islandRuntime = restored.islandRuntime;
    this.playTimeSec = envelope.meta.playTimeSec ?? 0;
    this.isCurrentSaveTampered = envelope.meta.antiCheat.isTampered;
    this.currentViolationCodes = [...envelope.meta.antiCheat.violationCodes];

    this.applyAudioAndVisualSettings(restored.settings);
    this.storyDirector.syncFromLoadedCampaign(this.campaign);
    this.titleScene?.hide();

    if (this.campaign.activeIslandId && this.islandRuntime) {
      this.activeScene = 'ISLAND_EPISODE';
    } else {
      this.activeScene = 'SEA_SAILING';
    }

    this.updateFloatingHudToggleVisibility();
    this.syncSceneBgm();
    this.updateShowcaseToolbar();
    this.refreshSideDrawer();
  }

  private async scanLatestSaveOnBoot(): Promise<void> {
    const savedSettings = await this.storage.loadGlobalSettings();
    if (savedSettings) {
      this.applyAudioAndVisualSettings(savedSettings);
    }

    const slots = await this.storage.listAllSlots();
    let latest: SaveEnvelope | null = null;
    for (const s of Object.values(slots)) {
      if (!s) continue;
      if (!latest || (s.meta.savedAt || '') > (latest.meta.savedAt || '')) {
        latest = s;
      }
    }

    this.latestBootSaveEnvelope = latest;
  }

  private createUnitBuildFromSpecies(
    instanceId: string,
    speciesId: string,
    isPlayerControlled: boolean,
    aiLevel: number,
    evPresetKey: string
  ): UnitBuildConfig {
    const unitDef =
      this.gameRegistry.units[speciesId] ??
      Object.values(this.gameRegistry.units)[0];
    const evs = EV_PRESETS[evPresetKey]?.evs ?? EV_PRESETS.balanced.evs;
    return {
      instanceId,
      speciesId: unitDef.id,
      level: 50,
      ivs: { hp: 31, atk: 31, def: 31, spAtk: 31, spDef: 31, spd: 31 },
      evs: { ...evs },
      moveIds: [...unitDef.defaultMoves],
      equipmentId: unitDef.defaultEquipmentId,
      traitId: unitDef.traitId,
      formId: unitDef.defaultFormId,
      isPlayerControlled,
      aiLevel
    };
  }

  private createDefaultSandboxConfig(): BattleWorldConfig {
    return {
      seed: 20261119,
      arenaSizeKey: 'medium',
      mode: '1V1',
      teamAlpha: [
        this.createUnitBuildFromSpecies('alpha_1', 'luffy', true, 4, 'physicalBrawler'),
        this.createUnitBuildFromSpecies('alpha_2', 'zoro', false, 4, 'physicalBrawler'),
        this.createUnitBuildFromSpecies('alpha_3', 'law', false, 4, 'specialSweeper')
      ],
      teamOmega: [
        this.createUnitBuildFromSpecies('omega_1', 'kaido', false, 4, 'fortressTank'),
        this.createUnitBuildFromSpecies('omega_2', 'kizaru', false, 4, 'specialSweeper'),
        this.createUnitBuildFromSpecies('omega_3', 'lucci', false, 4, 'physicalBrawler')
      ]
    };
  }

  private syncSceneBgm(activeWorld?: BattleWorldState): void {
    if (this.assetPreviewScene?.getIsOpen()) return;
    if (
      this.activeScene === 'BOOT' ||
      this.activeScene === 'TITLE' ||
      this.activeScene === 'OPENING_NARRATION'
    ) {
      this.audio.setBreakFilterActive(false);
      if (this.activeScene === 'TITLE') {
        void this.audio.playBgm('title_adventure');
      }
      return;
    }

    if (this.activeScene === 'SEA_SAILING') {
      this.audio.setBreakFilterActive(false);
      void this.audio.playBgm(resolveBgmForSeaZone(this.campaign.currentZoneId));
      return;
    }

    if (this.activeScene === 'ISLAND_EPISODE') {
      this.audio.setBreakFilterActive(false);
      void this.audio.playBgm('island_peaceful');
      return;
    }

    const world =
      activeWorld ??
      (this.activeScene === 'ONLINE_BATTLE' && this.activeLockstep
        ? this.activeLockstep.world
        : this.battleWorld);

    if (!world) {
      void this.audio.playBgm('battle_normal');
      return;
    }

    const isGroggy = Boolean(world.raidState && world.raidState.groggyTimer > 0);
    this.audio.setBreakFilterActive(isGroggy);

    const isGiantRaid =
      world.mode === 'COOP_RAID' ||
      this.activeEndgameBattleKind === 'RAID' ||
      world.units.some((u) => u.speciesId.startsWith('raid_'));

    if (isGiantRaid) {
      void this.audio.setBattleMood('RAID_GIANT');
      return;
    }

    const hasAwakeningOrPhase2 = world.units.some((u) => {
      if (!u.isAlive) return false;
      if (u.bossPhase2Triggered) return true;
      if (!u.activeFormId) return false;
      const fDef = this.gameRegistry.forms[u.activeFormId];
      return (
        u.activeFormId === 'form_luffy_gear5' ||
        u.activeFormId === 'form_kaido_beast' ||
        u.activeFormId === 'form_lucci_awakened' ||
        u.activeFormId === 'form_magellan_venom_demon' ||
        fDef?.formCategory === 'AWAKENED_ZOAN' ||
        fDef?.formCategory === 'ENVIRONMENT_AWAKENING'
      );
    });

    if (hasAwakeningOrPhase2) {
      void this.audio.setBattleMood('YONKO_AWAKENING');
      return;
    }

    const isBossFight =
      Boolean(this.activeEndgameBattleKind) ||
      world.units.some(
        (u) =>
          u.team === 'OMEGA' &&
          [
            'kaido',
            'kizaru',
            'saturn',
            'loki',
            'magellan',
            'katakuri',
            'doflamingo',
            'lucci',
            'enel',
            'crocodile',
            'arlong',
            'akainu',
            'aokiji',
            'blackbeard',
            'morgan',
            'buggy',
            'don_krieg',
            'smoker',
            'wapol',
            'moria',
            'hody'
          ].includes(u.speciesId)
      );

    void this.audio.setBattleMood(isBossFight ? 'BOSS' : 'NORMAL');
  }

  private clearTransientFocusAndInput(): void {
    this.input.resetTransientInputState(false);
    if (
      typeof document !== 'undefined' &&
      document.activeElement instanceof HTMLElement &&
      document.activeElement !== this.renderer?.canvas
    ) {
      document.activeElement.blur();
    }
  }

  public switchToScene(scene: ActiveAppScene): void {
    this.activeScene = scene;
    this.gateBlockedPopup = null;
    this.forfeitConfirmArmed = false;
    this.clearTransientFocusAndInput();
    if (scene !== 'TITLE') {
      this.titleScene?.hide();
    }
    this.updateFloatingHudToggleVisibility();

    if (scene === 'SANDBOX') {
      this.prng = new SeededPRNG(this.sandboxConfig.seed);
      this.battleWorld = createBattleWorld(this.sandboxConfig, this.gameRegistry);
    }

    // Hide mobile virtual gamepad when in Spectator mode
    if (this.mobileDockEl) {
      if (scene === 'ONLINE_BATTLE' && this.onlineAssignedRole === 'SPECTATOR') {
        this.mobileDockEl.style.display = 'none';
      } else {
        this.mobileDockEl.style.display = '';
      }
    }

    this.syncSceneBgm();
    this.updateShowcaseToolbar();
    this.refreshSideDrawer();
  }

  public startStoryBattle(ctx: BattleContext): void {
    this.activeBattleContext = ctx;
    this.activeScene = 'STORY_BATTLE';
    this.clearTransientFocusAndInput();
    this.titleScene?.hide();
    this.updateFloatingHudToggleVisibility();
    this.storyDirector.enterStoryMission(ctx.encounterId, ctx.encounterName);
    this.prng = new SeededPRNG(20261119 + this.tickCount);
    this.battleWorld = createBattleWorldFromContext(
      this.campaign,
      ctx,
      this.rpgRegistry,
      this.gameRegistry,
      20261119 + this.tickCount
    );
    this.audio.playSfx('CLASH');
    this.syncSceneBgm(this.battleWorld);
    this.updateShowcaseToolbar();
    this.refreshSideDrawer();
  }

  public finishStoryBattle(victory: boolean): void {
    if (this.activeEndgameBattleKind) {
      this.finishEndgameBattle(victory);
      return;
    }
    if (!this.activeBattleContext) return;
    const ctx = this.activeBattleContext;
    const prevPoster = this.campaign.latestWantedPoster;

    applyBattleResultToCampaign(
      this.campaign,
      {
        context: ctx,
        victory,
        survivingPartyHpRatios: {}
      },
      this.rpgRegistry,
      this.gameRegistry
    );

    if (this.campaign.latestWantedPoster !== prevPoster && this.campaign.latestWantedPoster) {
      this.showWantedPosterOverlay = true;
      this.wantedPosterOpenTimer = 0;
      this.audio.playSfxId('wanted_poster_slam');
    }

    this.activeBattleContext = null;
    if (victory && ctx.sourceScene === 'ISLAND_EPISODE' && this.islandRuntime) {
      this.activeScene = 'ISLAND_EPISODE';
    } else {
      this.activeScene = 'SEA_SAILING';
    }
    this.clearTransientFocusAndInput();

    if (victory) {
      const outcome = this.storyDirector.completeStoryMission(
        this.campaign,
        ctx.setsFlagOnVictory ?? undefined
      );
      if (outcome.notice) {
        this.campaign.voyageLog.push(outcome.notice);
        this.saveIndicatorText = outcome.notice.slice(0, 26);
        this.saveIndicatorTimer = 3.2;
      }
      void this.triggerAutoSave('전투 승리');
      void this.audio.playBgm('victory_fanfare', { forceRestart: true, crossfadeSec: 0.2 });
    } else {
      this.storyDirector.abortStoryMissionToFreeRoam();
      this.syncSceneBgm();
    }

    this.audio.playSfx('FORM_SHIFT');
    this.updateShowcaseToolbar();
    this.refreshSideDrawer();
  }

  public openEndgameHub(): void {
    renderEndgameHubModal(
      this.endgameModalEl,
      this.campaign,
      this.endgameRegistry,
      {
        onOpenImpelDown: () => this.openImpelDownModal(),
        onOpenColosseum: () => this.openColosseumModal('TOURNAMENT'),
        onOpenRaidLobby: () => this.openRaidLobbyModal(),
        onToggleDebugUnlock: (enabled) => {
          this.campaign.debugUnlockEndgame = enabled;
          this.openEndgameHub();
        },
        onClose: () => {
          this.endgameModalEl.classList.remove('open');
        }
      }
    );
  }

  public openImpelDownModal(): void {
    if (!isImpelDownUnlocked(this.campaign, this.endgameRegistry)) {
      this.openEndgameHub();
      return;
    }
    if (!this.activeImpelDownRun) {
      this.activeImpelDownRun = resumeImpelDownRun(this.campaign);
    }
    renderImpelDownModal(
      this.endgameModalEl,
      this.activeImpelDownRun,
      this.campaign,
      this.gameRegistry,
      this.endgameRegistry,
      {
        onStartNewRun: (partyUnitIds) => {
          this.activeImpelDownRun = startImpelDownRun(
            partyUnitIds,
            20261119 + this.tickCount,
            this.campaign,
            this.gameRegistry,
            this.endgameRegistry
          );
          void this.triggerAutoSave('임펠 다운 도전 시작');
          this.openImpelDownModal();
        },
        onStartFloorBattle: (run) => {
          const { config } = buildImpelDownFloorBattleConfig(
            run,
            this.campaign,
            this.gameRegistry,
            this.endgameRegistry
          );
          this.activeImpelDownRun = run;
          this.activeEndgameBattleKind = 'IMPEL_DOWN';
          this.activeBattleContext = null;
          this.endgameModalEl.classList.remove('open');
          this.prng = new SeededPRNG(config.seed);
          this.battleWorld = createBattleWorld(config, this.gameRegistry);
          this.activeScene = 'STORY_BATTLE';
          this.audio.playSfx('CLASH');
          this.updateShowcaseToolbar();
          this.refreshSideDrawer();
        },
        onPickBuff: (run, buffId) => {
          selectImpelDownDraftBuff(
            run,
            buffId,
            this.campaign,
            this.gameRegistry,
            this.endgameRegistry
          );
          void this.triggerAutoSave('임펠 다운 버프 선택');
          this.openImpelDownModal();
        },
        onContinueEndless: (run) => {
          continueImpelDownEndless(run, this.campaign);
          void this.triggerAutoSave('임펠 다운 무한 심층 돌입');
          this.openImpelDownModal();
        },
        onFinishRun: () => {
          completeAndExitImpelDownRun(this.campaign);
          this.activeImpelDownRun = null;
          void this.triggerAutoSave('임펠 다운 6층 완주');
          this.endgameModalEl.classList.remove('open');
          this.refreshSideDrawer();
        },
        onSuspendAndClose: (run) => {
          suspendImpelDownRun(this.campaign, run);
          void this.triggerAutoSave('임펠 다운 중단 저장');
          this.endgameModalEl.classList.remove('open');
          this.refreshSideDrawer();
        },
        onClose: () => {
          this.endgameModalEl.classList.remove('open');
        }
      }
    );
  }

  public openColosseumModal(tab?: 'TOURNAMENT' | 'TUTOR'): void {
    if (!isColosseumUnlocked(this.campaign, this.endgameRegistry)) {
      this.openEndgameHub();
      return;
    }
    if (tab) this.colosseumTab = tab;
    renderColosseumModal(
      this.endgameModalEl,
      this.activeColosseumTournament,
      this.colosseumTab,
      this.colosseumTutorUnitId,
      this.colosseumNotice,
      this.campaign,
      this.gameRegistry,
      this.endgameRegistry,
      {
        onCreateTournament: (tierId: ColosseumTierId, playerUnitId: string, ringOutEnabled: boolean) => {
          this.colosseumNotice = null;
          this.activeColosseumTournament = createColosseumTournament(
            tierId,
            playerUnitId,
            20261119 + this.tickCount,
            ringOutEnabled,
            this.campaign,
            this.gameRegistry,
            this.endgameRegistry
          );
          this.openColosseumModal('TOURNAMENT');
        },
        onStartNextMatch: (tournament) => {
          const config = buildColosseumMatchBattleConfig(
            tournament,
            this.campaign,
            this.gameRegistry,
            this.endgameRegistry
          );
          if (!config) return;
          this.activeColosseumTournament = tournament;
          this.activeEndgameBattleKind = 'COLOSSEUM';
          this.activeBattleContext = null;
          this.endgameModalEl.classList.remove('open');
          this.prng = new SeededPRNG(config.seed);
          this.battleWorld = createBattleWorld(config, this.gameRegistry);
          this.activeScene = 'STORY_BATTLE';
          this.audio.playSfx('CLASH');
          this.updateShowcaseToolbar();
          this.refreshSideDrawer();
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
            this.campaign,
            this.gameRegistry,
            this.endgameRegistry
          );
          this.colosseumNotice = res.message;
          if (res.success) {
            void this.triggerAutoSave('콜로세움 기술 전수');
          }
          this.openColosseumModal('TUTOR');
        },
        onClose: () => {
          this.endgameModalEl.classList.remove('open');
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
      this.endgameModalEl,
      this.selectedRaidId,
      this.selectedRaidRelicUnitId,
      this.raidLobbyNotice,
      this.campaign,
      this.gameRegistry,
      this.endgameRegistry,
      {
        onStartOfflineRaid: (raidId, squadUnitIds) => {
          const cfg = buildOfflineRaidBattleConfig(
            raidId,
            squadUnitIds,
            20261119 + this.tickCount,
            this.campaign,
            this.gameRegistry,
            this.endgameRegistry
          );
          if (!cfg) return;
          this.selectedRaidId = raidId;
          this.activeOfflineRaidId = raidId;
          this.activeEndgameBattleKind = 'RAID';
          this.activeBattleContext = null;
          this.endgameModalEl.classList.remove('open');
          this.prng = new SeededPRNG(cfg.seed);
          this.battleWorld = createBattleWorld(cfg, this.gameRegistry);
          this.activeScene = 'STORY_BATTLE';
          this.audio.playSfx('CLASH');
          this.updateShowcaseToolbar();
          this.refreshSideDrawer();
        },
        onOpenOnlineCoopRaid: (raidId) => {
          this.selectedRaidId = raidId;
          this.onlineLobbyDefaultMode = 'COOP_RAID';
          this.endgameModalEl.classList.remove('open');
          this.openOnlineLobbyModal(false);
        },
        onEquipRelic: (unitId, relicId) => {
          const res = equipRaidRelic(
            unitId,
            relicId,
            this.campaign,
            this.gameRegistry,
            this.endgameRegistry
          );
          this.raidLobbyNotice = res.message;
          if (res.success) {
            void this.triggerAutoSave('레이드 유물 장착');
          }
          this.openRaidLobbyModal();
        },
        onClose: () => {
          this.endgameModalEl.classList.remove('open');
        }
      },
      (raidId, relicUnitId) => {
        this.selectedRaidId = raidId;
        this.selectedRaidRelicUnitId = relicUnitId;
        this.openRaidLobbyModal();
      }
    );
  }

  public finishEndgameBattle(victory: boolean): void {
    const kind = this.activeEndgameBattleKind;
    this.activeEndgameBattleKind = null;
    this.activeScene = this.islandRuntime ? 'ISLAND_EPISODE' : 'SEA_SAILING';
    this.clearTransientFocusAndInput();
    this.audio.playSfx('FORM_SHIFT');
    this.updateShowcaseToolbar();
    this.refreshSideDrawer();

    if (kind === 'IMPEL_DOWN' && this.activeImpelDownRun) {
      recordImpelDownFloorOutcome(
        this.activeImpelDownRun,
        this.battleWorld,
        victory,
        this.campaign,
        this.endgameRegistry
      );
      void this.triggerAutoSave(victory ? '임펠 다운 층 돌파' : '임펠 다운 종료');
      this.openImpelDownModal();
    } else if (kind === 'COLOSSEUM' && this.activeColosseumTournament) {
      const res = recordColosseumPlayerMatchResult(
        this.activeColosseumTournament,
        victory,
        this.battleWorld.colosseumRingOut.resolvedByRingOut,
        this.campaign,
        this.endgameRegistry
      );
      if (res.playerChampion) {
        this.colosseumNotice = `🏆 ${this.activeColosseumTournament.tierId}급 토너먼트 우승! +${res.cpAwarded} CP / 수배서 프레임: ${res.newFrameTier.toUpperCase()}`;
        void this.triggerAutoSave('코리다 콜로세움 우승');
      }
      this.openColosseumModal('TOURNAMENT');
    } else if (kind === 'RAID' && this.activeOfflineRaidId) {
      const raidId = this.activeOfflineRaidId;
      this.activeOfflineRaidId = null;
      const res = recordRaidOutcome(
        raidId,
        victory,
        this.battleWorld.elapsedSec,
        this.campaign,
        this.endgameRegistry
      );
      this.raidLobbyNotice = victory
        ? `🏆 레이드 토벌 성공 (${this.battleWorld.elapsedSec.toFixed(1)}s)!${res.unlockedRelic ? ` 유물 해금: ${res.unlockedRelic.icon} ${res.unlockedRelic.name}` : ''}`
        : '💀 거대 보스 레이드 실패 — 스쿼드 편성과 유물을 정비하고 재도전하세요!';
      if (victory) {
        void this.triggerAutoSave('거대 보스 레이드 토벌');
      }
      this.openRaidLobbyModal();
    }
  }

  public finishOnlineMatch(winnerTeam: 'ALPHA' | 'OMEGA' | 'DRAW', reason: string): void {
    const isCoopRaid = this.currentRoomState?.mode === 'COOP_RAID';
    const myTeam = isCoopRaid
      ? 'ALPHA'
      : this.onlineAssignedSlotIndex === 0 || this.onlineAssignedSlotIndex === 1
        ? 'ALPHA'
        : 'OMEGA';
    if (isCoopRaid && winnerTeam === 'ALPHA' && this.currentRoomState?.raidId) {
      recordRaidOutcome(
        this.currentRoomState.raidId,
        true,
        this.activeLockstep?.world.elapsedSec ?? 30,
        this.campaign,
        this.endgameRegistry
      );
    }
    const outcome: 'WIN' | 'LOSS' | 'DRAW' =
      winnerTeam === 'DRAW'
        ? 'DRAW'
        : winnerTeam === myTeam
          ? 'WIN'
          : 'LOSS';

    if (this.onlineAssignedRole === 'PLAYER') {
      if (this.isTerminalOnlineMatch && this.preTerminalSnapshot) {
        const currentEnv = this.buildCurrentSaveEnvelope('auto');
        const updatedEnv = applyTerminalBattleOutcome(
          this.campaign,
          currentEnv,
          outcome,
          this.preTerminalSnapshot
        );
        void this.storage.saveSlot('auto', updatedEnv);
      } else {
        if (outcome === 'WIN') this.campaign.onlineStats.wins += 1;
        else if (outcome === 'LOSS') this.campaign.onlineStats.losses += 1;
        else this.campaign.onlineStats.draws += 1;
        void this.triggerAutoSave('통신 대전 종료');
      }
    }

    this.campaign.voyageLog.push(`[통신 대전 종료] ${reason} (승자: ${winnerTeam})`);
    this.activeLockstep = null;
    this.clearTransientFocusAndInput();
    if (this.isTerminalOnlineMatch && this.islandRuntime) {
      this.switchToScene('ISLAND_EPISODE');
    } else {
      this.switchToScene('SEA_SAILING');
    }
    this.openOnlineLobbyModal(this.isTerminalOnlineMatch);
  }

  public executeDebugStoryJump(actionKey: string): void {
    runDebugStoryJump(
      {
        activeScene: this.activeScene,
        campaign: this.campaign,
        rpgRegistry: this.rpgRegistry,
        gameRegistry: this.gameRegistry,
        assetPreviewScene: this.assetPreviewScene,
        getIslandRuntime: () => this.islandRuntime,
        setIslandRuntime: (rt) => {
          this.islandRuntime = rt;
        },
        setGateBlockedPopup: (popup) => {
          this.gateBlockedPopup = popup;
        },
        setShowWantedPosterOverlay: (show) => {
          this.showWantedPosterOverlay = show;
        },
        switchToScene: (scene) => this.switchToScene(scene),
        triggerAutoSave: (reason) => this.triggerAutoSave(reason),
        refreshSideDrawer: () => this.refreshSideDrawer()
      },
      actionKey
    );
  }

  private buildDomLayout(): void {
    this.rootEl.innerHTML = '';

    const style = document.createElement('style');
    style.textContent = `
      * { box-sizing: border-box; margin: 0; padding: 0; }
      html, body {
        width: 100dvw;
        height: 100dvh;
        background: #070b12;
        color: #e2e8f0;
        font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
        overflow: hidden;
        touch-action: none;
        user-select: none;
        -webkit-user-select: none;
        -webkit-touch-callout: none;
        overscroll-behavior: none;
      }
      #app {
        position: relative;
        width: 100dvw;
        height: 100dvh;
        overflow: hidden;
      }
      .hud-drawer-toggle-btn {
        position: fixed;
        top: calc(env(safe-area-inset-top, 0px) + 6px);
        right: calc(env(safe-area-inset-right, 0px) + 6px);
        z-index: 65;
        background: rgba(15, 23, 42, 0.86);
        color: #fde047;
        border: 1.5px solid #38bdf8;
        border-radius: 6px;
        padding: 5px 10px;
        font-size: 12px;
        font-weight: 700;
        box-shadow: 0 2px 8px rgba(0, 0, 0, 0.45);
      }
      .top-bar {
        position: fixed;
        top: calc(env(safe-area-inset-top, 0px) + 40px);
        left: calc(env(safe-area-inset-left, 0px) + 8px);
        right: calc(env(safe-area-inset-right, 0px) + 8px);
        z-index: 60;
        display: none;
        flex-wrap: wrap;
        align-items: center;
        justify-content: space-between;
        gap: 6px;
        padding: 8px 10px;
        background: rgba(15, 23, 42, 0.94);
        border: 1.5px solid #38bdf8;
        border-radius: 8px;
        font-size: 12px;
        max-height: 44dvh;
        overflow-y: auto;
        touch-action: pan-y;
      }
      .top-bar.open {
        display: flex;
      }
      .top-bar-group {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: 6px;
      }
      .brand-title {
        font-weight: 700;
        color: #facc15;
        letter-spacing: 0.4px;
        margin-right: 4px;
      }
      .net-badge {
        font-size: 11px;
        padding: 2px 6px;
        border-radius: 4px;
        background: #064e3b;
        color: #6ee7b7;
        border: 1px solid #10b981;
      }
      .net-badge.offline {
        background: #78350f;
        color: #fcd34d;
        border-color: #f59e0b;
      }
      select, button, input, textarea {
        background: #1e293b;
        color: #f8fafc;
        border: 1px solid #334155;
        border-radius: 4px;
        padding: 4px 8px;
        font-size: 12px;
        cursor: pointer;
      }
      button:disabled {
        opacity: 0.45;
        cursor: not-allowed;
      }
      button:hover:not(:disabled) {
        background: #334155;
        border-color: #38bdf8;
      }
      .btn-tab-active {
        background: #0284c7;
        border-color: #38bdf8;
        font-weight: 700;
      }
      .btn-showcase {
        background: #1e1b4b;
        border-color: #818cf8;
        color: #e0e7ff;
        font-size: 11px;
      }
      .btn-danger {
        background: #7f1d1d;
        border-color: #ef4444;
        color: #fecaca;
      }
      .workspace-main {
        position: fixed;
        inset: 0;
        width: 100dvw;
        height: 100dvh;
        overflow: hidden;
      }
      .canvas-stage-col {
        position: fixed;
        inset: 0;
        width: 100dvw;
        height: 100dvh;
        overflow: hidden;
      }
      .canvas-wrapper {
        position: fixed;
        inset: 0;
        width: 100dvw;
        height: 100dvh;
        border: none;
        border-radius: 0;
        overflow: hidden;
        background: #070b12;
      }
      .canvas-wrapper canvas {
        width: 100%;
        height: 100%;
        display: block;
        image-rendering: pixelated;
        touch-action: none;
        user-select: none;
      }
      .showcase-bar {
        position: fixed;
        bottom: calc(env(safe-area-inset-bottom, 0px) + 6px);
        left: calc(env(safe-area-inset-left, 0px) + 8px);
        right: calc(env(safe-area-inset-right, 0px) + 8px);
        z-index: 58;
        display: none;
        flex-wrap: wrap;
        gap: 5px;
        padding: 6px;
        border-radius: 8px;
        background: rgba(15, 23, 42, 0.92);
        border: 1px solid #334155;
        justify-content: center;
      }
      .showcase-bar.open {
        display: flex;
      }
      .mobile-gamepad-dock {
        display: none !important;
      }
      .side-drawer {
        position: fixed;
        top: calc(env(safe-area-inset-top, 0px) + 40px);
        right: calc(env(safe-area-inset-right, 0px) + 8px);
        bottom: calc(env(safe-area-inset-bottom, 0px) + 46px);
        width: min(350px, 86dvw);
        z-index: 59;
        display: none;
        background: rgba(15, 23, 42, 0.96);
        border: 1.5px solid #38bdf8;
        border-radius: 8px;
        padding: 10px;
        font-size: 12px;
        overflow-y: auto;
        touch-action: pan-y;
        flex-direction: column;
        gap: 8px;
      }
      .side-drawer.open {
        display: flex;
      }
      .config-card {
        background: #162032;
        border: 1px solid #26354d;
        border-radius: 5px;
        padding: 8px;
        display: flex;
        flex-direction: column;
        gap: 5px;
      }
      .config-card h4 {
        font-size: 12px;
        color: #38bdf8;
        margin-bottom: 2px;
      }
      .field-row {
        display: flex;
        align-items: center;
        justify-content: space-between;
        gap: 6px;
      }
      .field-row label {
        color: #94a3b8;
        font-size: 11px;
      }
      .combat-log-box {
        height: 115px;
        overflow-y: auto;
        background: #090d16;
        border: 1px solid #1e293b;
        border-radius: 4px;
        padding: 6px;
        font-family: monospace;
        font-size: 11px;
        color: #cbd5e1;
      }
      .modal-backdrop {
        position: fixed;
        inset: 0;
        background: rgba(0, 0, 0, 0.78);
        display: none;
        align-items: center;
        justify-content: center;
        z-index: 100;
        padding: 12px;
      }
      .modal-backdrop.open {
        display: flex;
      }
      .modal-box {
        background: #0f172a;
        border: 1px solid #38bdf8;
        border-radius: 8px;
        padding: 16px;
        width: 100%;
        max-width: 600px;
        max-height: 90vh;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        gap: 10px;
      }
      .slot-card {
        background: #162032;
        border: 1px solid #334155;
        border-radius: 6px;
        padding: 8px 10px;
        display: flex;
        flex-direction: column;
        gap: 6px;
      }
      .drop-zone {
        border: 2px dashed #38bdf8;
        border-radius: 6px;
        padding: 12px;
        text-align: center;
        background: rgba(2, 132, 199, 0.10);
        font-size: 11px;
        color: #bae6fd;
      }
      .ios-install-banner {
        display: none;
        background: #1e1b4b;
        border-top: 1px solid #818cf8;
        padding: 6px 12px;
        font-size: 11px;
        color: #e0e7ff;
        align-items: center;
        justify-content: space-between;
      }
      .endgame-modal-box {
        max-width: 740px;
        width: 94vw;
        max-height: 88vh;
        overflow-y: auto;
      }
      .endgame-card-grid {
        display: grid;
        grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
        gap: 10px;
      }
      .endgame-mode-card {
        background: #0f172a;
        border: 1.5px solid #334155;
        border-radius: 8px;
        padding: 10px;
        display: flex;
        flex-direction: column;
        justify-content: space-between;
      }
      .impel-draft-grid {
        display: grid;
        grid-template-columns: repeat(3, 1fr);
        gap: 8px;
      }
      .impel-draft-card {
        background: #0f172a;
        border: 1.5px solid #64748b;
        border-radius: 8px;
        padding: 10px;
        display: flex;
        flex-direction: column;
      }
      @media (max-width: 600px) {
        .mobile-gamepad-dock {
          display: flex;
        }
        .side-drawer {
          max-width: 100%;
        }
        .endgame-modal-box {
          width: 96vw;
          padding: 10px;
        }
        .impel-draft-grid {
          grid-template-columns: 1fr;
        }
      }
    `;
    document.head.appendChild(style);

    const topBar = document.createElement('header');
    topBar.className = 'top-bar';
    topBar.innerHTML = `
      <div class="top-bar-group">
        <span class="brand-title">🏴‍☠️ 원피스 그랜드 보야지</span>
        <button id="tab-rpg" class="btn-tab-active">⚓ 모험 계속</button>
        <button id="btn-camp-menu" style="background:#0f766e;border-color:#2dd4bf;color:#f0fdf4;">🏕 동료 & 수련</button>
        <button id="tab-endgame" style="background:#713f12;border-color:#facc15;color:#fef08a;">🏆 도전 모드</button>
        <button id="tab-online" style="background:#581c87;border-color:#c084fc;">🌐 통신 대전</button>
        <button id="btn-save-menu">💾 저장 / 불러오기</button>
        <button id="btn-toggle-journal">📜 항해 일지</button>
        <button id="btn-settings">⚙ 설정</button>
        <button id="btn-return-title" style="background:#334155;border-color:#94a3b8;color:#f8fafc;">🏠 타이틀</button>
      </div>
      <div class="top-bar-group">
        <span id="net-status-badge" class="net-badge">🟢 온라인</span>
        <button id="btn-toggle-devtools" class="btn-showcase" title="스토리 스킵 및 개발자 테스트 도구 열기">🛠 개발자 도구</button>
      </div>
      <div id="dev-tools-bar-row" class="top-bar-group" style="display:none;width:100%;padding-top:6px;margin-top:4px;border-top:1px dashed #334155;justify-content:space-between;">
        <div class="top-bar-group">
          <label style="color:#fde047;font-size:11px;">⚡ 스토리 빠른 이동:
            <select id="sel-debug-jump" aria-label="스토리 점프">
              <option value="">-- 해역 / 에피소드 즉시 이동 --</option>
              <option value="sea_east_blue">1. [이스트 블루] 자유 항해</option>
              <option value="dock_foosha">2. [이스트 블루 1/5] 후샤 마을 & 쉘즈타운 (도끼손 모건)</option>
              <option value="dock_orange_town">2-2. [이스트 블루 2/5] 오렌지 마을 (버기 · 참격 면역)</option>
              <option value="dock_baratie">2-3. [이스트 블루 3/5] 발라티에 (돈 클리크 · 상디·우솝 합류)</option>
              <option value="dock_arlong_park">2-4. [이스트 블루 4/5] 아론 파크 (아론 수변전 · 나미 합류)</option>
              <option value="dock_loguetown">2-5. [이스트 블루 5/5] 로그타운 (스모커 45초 생존 탈출)</option>
              <option value="gate_reverse_mountain">3. [관문 검증] 리버스 마운틴 통과 시도 (5개 섬 검증)</option>
              <option value="sea_grand_line">4. [위대한 항로] 이스트 블루 5개 완료 + 진입</option>
              <option value="dock_drum_kingdom">4-1. [위대한 항로 1/6] 드럼 왕국 (와포루 · 쵸파 선의 합류)</option>
              <option value="dock_alabasta">4-2. [위대한 항로 2/6] 알라바스타 (크로커다일 물통 젖음 · 로빈 합류)</option>
              <option value="dock_skypiea">4-3. [위대한 항로 3/6] 하늘섬 스카이피아 (갓 에넬 · 고무 천적)</option>
              <option value="dock_water_seven">4-4. [위대한 항로 4/6] 워터 세븐 (블루노·카쿠·루치 & 프랑키)</option>
              <option value="dock_thriller_bark">4-5. [위대한 항로 5/6] 스릴러 바크 (모리아 분신 · 브룩 음악가)</option>
              <option value="dock_marineford">4-6. [위대한 항로 6/6] 마린포드 정상전쟁 (마르코 2:2 동맹 3연전)</option>
              <option value="gate_red_line_blocked">5. [관문 차단 검증] 위대한 항로 미완료 시 신세계 6섬 체크리스트 팝업</option>
              <option value="sea_new_world">7. [신세계] 위대한 항로 6개 완료 + 레드라인 돌파</option>
              <option value="dock_fishman_island">7-1. [신세계 1/6] 어인섬 (호디 폭주 · 징베 조타수 합류)</option>
              <option value="dock_dressrosa">7-2. [신세계 2/6] 드레스로자 (도플라밍고 새장 · 실 각성)</option>
              <option value="dock_totto_land">7-3. [신세계 3/6] 토트랜드 (카타쿠리 미래 예지 · 로드 포네그리프)</option>
              <option value="dock_wano">8. [신세계 4/6] 와노쿠니 오니가시마 (킹·카이도 & 기어5)</option>
              <option value="dock_egghead">9. [신세계 5/6] 미래섬 에그헤드 (S-호크·키자루·새턴 성)</option>
              <option value="dock_elbaf">10. [신세계 6/6] 거인족의 나라 엘바프 (거대 보스: 로키)</option>
              <option value="clear_current_island">★ 현재 입항한 섬 에피소드 즉시 클리어</option>
              <option value="open_asset_preview">🎨 [Dev] AssetPreviewScene (스프라이트·타일셋·오디오)</option>
            </select>
          </label>
        </div>
        <div class="top-bar-group">
          <button id="tab-sandbox" class="btn-showcase">⚔ 배틀 샌드박스</button>
          <button id="btn-asset-preview" class="btn-showcase">🎨 도트 에셋 프리뷰</button>
        </div>
      </div>
    `;
    const hudToggleBtn = document.createElement('button');
    hudToggleBtn.id = 'btn-toggle-hud-drawer';
    hudToggleBtn.className = 'hud-drawer-toggle-btn';
    hudToggleBtn.textContent = '☰ 메뉴';
    this.hudToggleBtnEl = hudToggleBtn;
    this.rootEl.appendChild(hudToggleBtn);

    this.rootEl.appendChild(topBar);
    this.networkBadgeEl = topBar.querySelector('#net-status-badge') as HTMLElement;

    if (this.storage.isFallbackActive) {
      const warnBar = document.createElement('div');
      warnBar.style.cssText =
        'background:#78350f;color:#fde047;padding:4px 12px;font-size:11px;text-align:center;';
      warnBar.textContent =
        '⚠ 브라우저 IndexedDB 접근이 제한되어 localStorage 폴백 모드로 동작 중입니다. JSON 내보내기(Export) 백업을 권장합니다.';
      this.rootEl.appendChild(warnBar);
    }

    const main = document.createElement('main');
    main.className = 'workspace-main';

    const stageCol = document.createElement('div');
    stageCol.className = 'canvas-stage-col';

    const canvasWrapper = document.createElement('div');
    canvasWrapper.className = 'canvas-wrapper';
    this.renderer = new CanvasRenderer(canvasWrapper);
    this.input.updateViewportMetrics(this.renderer.getMetrics());
    this.renderer.viewport.onChange((m) => {
      this.input.updateViewportMetrics(m);
    });
    if (typeof window !== 'undefined') {
      (window as unknown as { __OPGV_VIEWPORT__?: unknown }).__OPGV_VIEWPORT__ =
        this.renderer.viewport;
    }
    stageCol.appendChild(canvasWrapper);

    this.showcaseBarEl = document.createElement('div');
    this.showcaseBarEl.className = 'showcase-bar';
    stageCol.appendChild(this.showcaseBarEl);

    this.mobileDockEl = this.createMobileVirtualControllerDock();
    stageCol.appendChild(this.mobileDockEl);

    main.appendChild(stageCol);

    this.sideDrawerEl = document.createElement('aside');
    this.sideDrawerEl.className = 'side-drawer';
    main.appendChild(this.sideDrawerEl);

    this.rootEl.appendChild(main);

    const iosBanner = document.createElement('div');
    iosBanner.className = 'ios-install-banner';
    iosBanner.id = 'ios-pwa-banner';
    iosBanner.innerHTML = `
      <span>📲 Safari 공유 버튼 → [홈 화면에 추가]를 선택하면 전체화면 오프라인 앱으로 플레이할 수 있습니다.</span>
      <button id="btn-close-ios-banner">닫기</button>
    `;
    this.rootEl.appendChild(iosBanner);
    iosBanner
      .querySelector('#btn-close-ios-banner')
      ?.addEventListener('click', () => {
        iosBanner.style.display = 'none';
      });

    this.campModalEl = this.createCrewCampModal();
    this.rootEl.appendChild(this.campModalEl);

    this.saveModalEl = this.createSaveManagerModal();
    this.rootEl.appendChild(this.saveModalEl);

    this.onlineModalEl = this.createOnlineLobbyModalElement();
    this.rootEl.appendChild(this.onlineModalEl);

    this.settingsModalEl = this.createSettingsModal();
    this.rootEl.appendChild(this.settingsModalEl);

    this.endgameModalEl = document.createElement('div');
    this.endgameModalEl.className = 'modal-backdrop';
    this.endgameModalEl.id = 'endgame-modal';
    this.rootEl.appendChild(this.endgameModalEl);

    this.bindTopBarEvents(topBar);
    this.updateShowcaseToolbar();
  }

  private setupPwaAndNetworkListeners(): void {
    if (typeof window === 'undefined') return;

    const updateOnlineBadge = () => {
      const online = navigator.onLine !== false;
      if (!this.networkBadgeEl) return;
      if (online) {
        this.networkBadgeEl.className = 'net-badge';
        this.networkBadgeEl.textContent = '🟢 온라인 (오프라인 플레이 가능)';
      } else {
        this.networkBadgeEl.className = 'net-badge offline';
        this.networkBadgeEl.textContent = '🟠 오프라인 모드 (로컬 캐시 실행 중)';
      }
    };

    window.addEventListener('online', updateOnlineBadge);
    window.addEventListener('offline', updateOnlineBadge);
    updateOnlineBadge();

    const ua = navigator.userAgent || '';
    const isIos = /iPad|iPhone|iPod/.test(ua);
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches;
    if (isIos && !isStandalone) {
      const banner = document.getElementById('ios-pwa-banner');
      if (banner) banner.style.display = 'flex';
    }
  }

  private createOnlineLobbyModalElement(): HTMLElement {
    return buildOnlineLobbyModalElement();
  }

  private async ensureOnlineTransportConnected(
    preferWebSocket: boolean = true
  ): Promise<NetworkTransport> {
    if (this.activeTransport && this.activeTransport.isConnected()) {
      return this.activeTransport;
    }

    const clientId = `peer_${Math.floor(Math.random() * 900000 + 100000)}`;
    if (preferWebSocket && typeof window !== 'undefined' && navigator.onLine !== false) {
      try {
        const wsTransport = new WebSocketTransport(
          clientId,
          this.platformBridge.multiplayerUrl
        );
        await wsTransport.connect();
        this.attachTransportHandlers(wsTransport);
        this.activeTransport = wsTransport;
        return wsTransport;
      } catch {
        // Fallback to local LoopbackNetworkHub if ws://localhost:8787 is not running
      }
    }

    const loopTransport = this.loopbackHub.createClientTransport(clientId);
    await loopTransport.connect();
    this.attachTransportHandlers(loopTransport);
    this.activeTransport = loopTransport;
    return loopTransport;
  }

  private attachTransportHandlers(transport: NetworkTransport): void {
    transport.onMessage((msg: ServerToClientMessage) => {
      if (msg.type === 'ROOM_JOINED') {
        this.currentRoomState = msg.roomState;
        this.onlineAssignedRole = msg.assignedRole;
        this.onlineAssignedSlotIndex = msg.assignedSlotIndex;
        this.onlineErrorNotice = null;
        this.renderOnlineLobbyModalContents();
      } else if (msg.type === 'ROOM_STATE_UPDATED') {
        this.currentRoomState = msg.roomState;
        this.renderOnlineLobbyModalContents();
      } else if (msg.type === 'MATCH_STARTED') {
        const cfg: LockstepConfig = {
          roomCode: msg.roomCode,
          matchSeed: msg.matchSeed,
          battleConfig: msg.battleConfig,
          humanSlotIndices: msg.humanSlotIndices,
          slotToUnitInstanceId: msg.slotToUnitInstanceId,
          localSlotIndex:
            this.onlineAssignedRole === 'SPECTATOR'
              ? -1
              : this.onlineAssignedSlotIndex,
          inputDelayTicks: msg.inputDelayTicks
        };
        this.activeLockstep = new LockstepSyncController(
          cfg,
          this.gameRegistry,
          transport
        );
        this.spectatorCameraTarget = 'ALL';
        this.onlineModalEl.classList.remove('open');
        this.switchToScene('ONLINE_BATTLE');
      } else if (msg.type === 'TICK_INPUT_BUNDLE') {
        this.activeLockstep?.recordIncomingFrames(msg.tick, msg.frames);
      } else if (msg.type === 'DESYNC_ALERT') {
        if (this.activeLockstep) {
          this.activeLockstep.desyncDetected = true;
          this.activeLockstep.desyncReason = `Tick ${msg.tick} 상태 해시 불일치 (${msg.offendingClientId}): 기대값 ${msg.expectedHash.slice(0, 8)} != 보고값 ${msg.reportedHash.slice(0, 8)}`;
        }
        this.campaign.voyageLog.push(
          `[DESYNC_DETECTED] Tick ${msg.tick} 동기화 어긋남 감지로 매치가 안전 중단되었습니다.`
        );
      } else if (msg.type === 'PEER_DISCONNECTED') {
        this.activeLockstep?.notifyPeerDisconnected(msg.reconnectWaitSec);
      } else if (msg.type === 'MATCH_ENDED') {
        this.finishOnlineMatch(msg.winnerTeam, msg.reason);
      } else if (msg.type === 'ERROR_REJECTED') {
        this.onlineErrorNotice = `[${msg.code}] ${msg.message}`;
        this.renderOnlineLobbyModalContents();
      }
    });
  }

  private buildOnlineRosterPayload(partyRule: PartyRuleMode): OnlineRosterPayload {
    const saveEnv = this.buildCurrentSaveEnvelope('auto');
    const units: UnitBuildConfig[] = this.campaign.activePartyUnitIds.map(
      (uid, idx) =>
        createStandardPresetBuild(uid, `online_${idx}_${uid}`, true, 4, this.gameRegistry)
    );
    return {
      partyRule,
      saveEnvelope: partyRule === 'rpg_save' ? saveEnv : undefined,
      units
    };
  }

  public openOnlineLobbyModal(fromIslandTerminal: boolean = false): void {
    this.isTerminalOnlineMatch = fromIslandTerminal;
    if (fromIslandTerminal) {
      this.preTerminalSnapshot = capturePreTerminalPartySnapshot(
        this.buildCurrentSaveEnvelope('auto')
      );
    }
    this.onlineModalEl.classList.add('open');
    this.renderOnlineLobbyModalContents();
  }

  private renderOnlineLobbyModalContents(): void {
    renderOnlineLobbyModalDom({
      onlineModalEl: this.onlineModalEl,
      campaign: this.campaign,
      rpgRegistry: this.rpgRegistry,
      gameRegistry: this.gameRegistry,
      endgameRegistry: this.endgameRegistry,
      getCurrentRoomState: () => this.currentRoomState,
      setCurrentRoomState: (room) => {
        this.currentRoomState = room;
      },
      getOnlineAssignedRole: () => this.onlineAssignedRole,
      setOnlineAssignedRole: (role) => {
        this.onlineAssignedRole = role;
      },
      getOnlineErrorNotice: () => this.onlineErrorNotice,
      setOnlineErrorNotice: (msg) => {
        this.onlineErrorNotice = msg;
      },
      getIsTerminalOnlineMatch: () => this.isTerminalOnlineMatch,
      getOnlineLobbyDefaultMode: () => this.onlineLobbyDefaultMode,
      getSelectedRaidId: () => this.selectedRaidId,
      getActiveTransport: () => this.activeTransport,
      ensureOnlineTransportConnected: (preferWs) =>
        this.ensureOnlineTransportConnected(preferWs),
      buildCurrentSaveEnvelope: (slot) => this.buildCurrentSaveEnvelope(slot),
      buildOnlineRosterPayload: (rule) => this.buildOnlineRosterPayload(rule)
    });
  }

  private createSaveManagerModal(): HTMLElement {
    return createSaveManagerModalElement();
  }

  public async openSaveManagerModal(errorMessage?: string): Promise<void> {
    await renderSaveManagerModal(
      {
        saveModalEl: this.saveModalEl,
        storage: this.storage,
        platformBridge: this.platformBridge,
        campaign: this.campaign,
        rpgRegistry: this.rpgRegistry,
        gameRegistry: this.gameRegistry,
        getPendingImportPreview: () => this.pendingImportPreview,
        setPendingImportPreview: (preview) => {
          this.pendingImportPreview = preview;
        },
        getPendingImportTargetSlot: () => this.pendingImportTargetSlot,
        setPendingImportTargetSlot: (slot) => {
          this.pendingImportTargetSlot = slot;
        },
        buildCurrentSaveEnvelope: (slot) => this.buildCurrentSaveEnvelope(slot),
        saveToSlot: (slot) => this.saveToSlot(slot),
        applyLoadedEnvelope: (env) => this.applyLoadedEnvelope(env),
        syncLogsDom: () => this.syncLogsDom()
      },
      errorMessage
    );
  }

  private updateShowcaseToolbar(): void {
    if (!this.showcaseBarEl) return;

    if (this.activeScene === 'SEA_SAILING') {
      this.showcaseBarEl.innerHTML = `
        <button id="btn-act-interact" class="btn-tab-active">⚓ 섬 입항 / 관문 진입 [E]</button>
        <button id="btn-act-coup" class="btn-showcase">🚀 쿠 드 버스트 [Shift]</button>
        <button id="btn-act-online" style="background:#581c87;border-color:#c084fc;">🌐 실시간 통신 대전 로비</button>
        <button id="btn-act-save" class="btn-showcase">💾 빠른 수동 저장 (SLOT 1)</button>
      `;
      this.showcaseBarEl
        .querySelector('#btn-act-interact')
        ?.addEventListener('click', () => {
          this.pendingRpgInteract = true;
        });
      this.showcaseBarEl
        .querySelector('#btn-act-coup')
        ?.addEventListener('click', () => {
          this.pendingCoupDeBurst = true;
        });
      this.showcaseBarEl
        .querySelector('#btn-act-online')
        ?.addEventListener('click', () => {
          this.openOnlineLobbyModal(false);
        });
      this.showcaseBarEl
        .querySelector('#btn-act-save')
        ?.addEventListener('click', () => {
          void this.saveToSlot('slot_1');
        });
    } else if (this.activeScene === 'ISLAND_EPISODE') {
      this.showcaseBarEl.innerHTML = `
        <button id="btn-isl-interact" class="btn-tab-active">💬 대화 / 퍼즐 스위치 / 보스전 [E]</button>
        <button id="btn-isl-terminal" style="background:#581c87;border-color:#c084fc;">🌐 항구 대전 단말기 접속 (아이템금지/HP무손실)</button>
        <button id="btn-isl-clear" class="btn-showcase">★ 현재 섬 에피소드 즉시 완료</button>
        <button id="btn-isl-exit" class="btn-showcase">⚓ 항구 출구 (바다 복귀)</button>
      `;
      this.showcaseBarEl
        .querySelector('#btn-isl-interact')
        ?.addEventListener('click', () => {
          this.pendingRpgInteract = true;
        });
      this.showcaseBarEl
        .querySelector('#btn-isl-terminal')
        ?.addEventListener('click', () => {
          this.openOnlineLobbyModal(true);
        });
      this.showcaseBarEl
        .querySelector('#btn-isl-clear')
        ?.addEventListener('click', () => {
          this.executeDebugStoryJump('clear_current_island');
        });
      this.showcaseBarEl
        .querySelector('#btn-isl-exit')
        ?.addEventListener('click', () => {
          exitIslandToSea(this.campaign);
          void this.triggerAutoSave('항구 출항');
          this.switchToScene('SEA_SAILING');
        });
    } else if (this.activeScene === 'ONLINE_BATTLE') {
      if (this.onlineAssignedRole === 'SPECTATOR') {
        this.showcaseBarEl.innerHTML = `
          <button data-spec-cam="ALL" class="btn-tab-active">🎥 전체 아레나 카메라</button>
          <button data-spec-cam="0" class="btn-showcase">🎥 P1 추적</button>
          <button data-spec-cam="1" class="btn-showcase">🎥 P2 추적</button>
          <button data-spec-cam="2" class="btn-showcase">🎥 P3 추적</button>
          <button data-spec-cam="3" class="btn-showcase">🎥 P4 추적</button>
          <button id="btn-spec-leave" class="btn-danger">관전 종료 및 로비 복귀</button>
        `;
        this.showcaseBarEl
          .querySelectorAll<HTMLButtonElement>('[data-spec-cam]')
          .forEach((btn) => {
            btn.addEventListener('click', () => {
              const v = btn.dataset.specCam;
              this.spectatorCameraTarget =
                v === 'ALL' ? 'ALL' : (Number(v) as 0 | 1 | 2 | 3);
            });
          });
        this.showcaseBarEl
          .querySelector('#btn-spec-leave')
          ?.addEventListener('click', () => {
            this.finishOnlineMatch('DRAW', '관전을 종료하고 로비로 복귀했습니다.');
          });
      } else {
        this.showcaseBarEl.innerHTML = `
          <button id="btn-online-forfeit" class="btn-danger">
            ${this.forfeitConfirmArmed
            ? '⚠ 다시 클릭 시 배틀 포기 확정 (패배 처리)'
            : '🏳 배틀 포기 (2회 확인)'
          }
          </button>
        `;
        this.showcaseBarEl
          .querySelector('#btn-online-forfeit')
          ?.addEventListener('click', () => {
            if (!this.forfeitConfirmArmed) {
              this.forfeitConfirmArmed = true;
              this.updateShowcaseToolbar();
              return;
            }
            if (this.activeLockstep && this.activeTransport) {
              this.activeTransport.send({
                type: 'FORFEIT_MATCH',
                roomCode: this.activeLockstep.config.roomCode
              });
            }
          });
      }
    } else if (this.activeScene === 'STORY_BATTLE') {
      this.showcaseBarEl.innerHTML = `
        <button id="btn-btl-win" class="btn-tab-active">⚡ 스토리 전투 즉시 승리 (보상 & 에피소드 완료)</button>
        <button id="btn-btl-form" class="btn-showcase">☁ 기어5 / 각성 발동 [Shift+F]</button>
        <button id="btn-btl-retreat" class="btn-showcase">⚓ 정박 항구로 후퇴</button>
      `;
      this.showcaseBarEl
        .querySelector('#btn-btl-win')
        ?.addEventListener('click', () => {
          this.finishStoryBattle(true);
        });
      this.showcaseBarEl
        .querySelector('#btn-btl-form')
        ?.addEventListener('click', () => {
          const playerUnit = this.battleWorld.units.find(
            (u) => u.team === 'ALPHA' && u.isOnField
          );
          if (playerUnit) {
            activateFormShift(playerUnit, this.battleWorld, this.gameRegistry);
          }
        });
      this.showcaseBarEl
        .querySelector('#btn-btl-retreat')
        ?.addEventListener('click', () => {
          this.finishStoryBattle(false);
        });
    } else {
      this.showcaseBarEl.innerHTML = `
        <button id="btn-demo-beam" class="btn-showcase">⚡ 보로 브레스 vs 레이저 빔 맞대결</button>
        <button id="btn-demo-melee" class="btn-showcase">👑 루피 vs 카이도 패왕색 하늘 가르기</button>
        <button id="btn-demo-form" class="btn-showcase">☁ 기어5(흰 구름띠) & 루치(검은 구름띠) 각성</button>
        <button id="btn-demo-zoan" class="btn-showcase">🔄 동물계 변신 순환 (인간↔인수↔청룡)</button>
        <button id="btn-demo-status" class="btn-showcase">✨ 자연계(키자루) 비패기 흘려보내기</button>
      `;
      this.showcaseBarEl
        .querySelector('#btn-demo-beam')
        ?.addEventListener('click', () => this.triggerSandboxShowcase('BEAM_CLASH'));
      this.showcaseBarEl
        .querySelector('#btn-demo-melee')
        ?.addEventListener('click', () =>
          this.triggerSandboxShowcase('CONQUEROR_CLASH')
        );
      this.showcaseBarEl
        .querySelector('#btn-demo-form')
        ?.addEventListener('click', () =>
          this.triggerSandboxShowcase('HAGOROMO_AWAKENING')
        );
      this.showcaseBarEl
        .querySelector('#btn-demo-zoan')
        ?.addEventListener('click', () => this.triggerSandboxShowcase('ZOAN_CYCLE'));
      this.showcaseBarEl
        .querySelector('#btn-demo-status')
        ?.addEventListener('click', () => this.triggerSandboxShowcase('LOGIA_PASS'));
    }
  }

  public triggerSandboxShowcase(kind: SandboxShowcaseKind): void {
    runSandboxShowcaseScenario(this.battleWorld, this.gameRegistry, kind);
  }

  private refreshSideDrawer(): void {
    if (!this.sideDrawerEl) return;

    if (this.activeScene === 'SANDBOX') {
      this.renderSandboxDrawer();
      return;
    }

    const zone = this.rpgRegistry.seaZones[this.campaign.currentZoneId];
    const shipDef = this.rpgRegistry.ships[this.campaign.ship.shipId];
    const tierInfo = computeBountyTier(this.campaign.totalCrewBounty);

    const tamperBanner = this.isCurrentSaveTampered
      ? `<div style="background:#7f1d1d;border:1px solid #ef4444;color:#fecaca;padding:6px;border-radius:4px;font-size:11px;font-weight:bold;">
          ⚠ 비공식 수정 데이터 (통신 대전 제한)<br/>
          위반 코드: ${this.currentViolationCodes.join(', ')}
        </div>`
      : '';

    const episodeItemsHtml = Object.values(this.rpgRegistry.seaZones)
      .flatMap((z) =>
        z.islands
          .filter((i) => i.playableInVerticalSlice)
          .map((i) => {
            const done = this.campaign.completedEpisodes.includes(i.episodeId);
            return `<div style="display:flex;justify-content:space-between;font-size:11px;color:${done ? '#4ade80' : '#fde047'
              };">
              <span>${done ? '✓' : '●'} [${z.id}] ${i.name}</span>
              <span>${done ? '완료' : i.requiredForNextZone ? '필수' : '선택'}</span>
            </div>`;
          })
      )
      .join('');

    const partyHtml = this.campaign.recruitedUnitIds
      .map((uid) => {
        const u = this.gameRegistry.units[uid];
        const haki = this.campaign.unitHakiOverrides[uid] ?? u?.haki;
        return `<div style="font-size:11px;color:#e2e8f0;display:flex;justify-content:space-between;">
          <span>🏴‍☠️ ${u?.name ?? uid} (Lv.${this.campaign.unitLevelOverrides[uid] ?? 50})</span>
          <span style="color:#38bdf8;">무${haki?.armament ?? 1}/견${haki?.observation ?? 1}/패${haki?.conqueror ?? 0}</span>
        </div>`;
      })
      .join('');

    this.sideDrawerEl.innerHTML = `
      ${tamperBanner}
      <div class="config-card">
        <h4>🧭 현재 항해 & 해적단 현황</h4>
        <div class="field-row"><label>현재 위치:</label><span>${this.activeScene === 'ISLAND_EPISODE' && this.islandRuntime
        ? `🏝 ${this.rpgRegistry.islands[this.islandRuntime.islandId]?.name}`
        : `⚓ ${zone.name}`
      }</span></div>
        <div class="field-row"><label>탑승 선박:</label><span style="color:#fde047;">${shipDef?.name}</span></div>
        <div class="field-row"><label>보유 자금:</label><span style="color:#4ade80;">฿ ${this.campaign.berries.toLocaleString()} | 수련Pt: ${this.campaign.trainingPoints}</span></div>
        <div class="field-row"><label>총 현상금:</label><span style="color:#f97316;">฿ ${this.campaign.totalCrewBounty.toLocaleString()}</span></div>
        <div class="field-row"><label>해적단 위상:</label><span>${tierInfo.rankLabel} (해군AI Lv.${tierInfo.patrolAiLevel})</span></div>
        <div class="field-row"><label>로드 포네그리프:</label><span style="color:#f43f5e;">${this.campaign.roadPoneglyphCount} / 4 확보</span></div>
        <div class="field-row"><label>통신 대전 전적:</label><span style="color:#c084fc;">${this.campaign.onlineStats.wins}승 ${this.campaign.onlineStats.losses}패 ${this.campaign.onlineStats.draws}무</span></div>
      </div>

      <div class="config-card">
        <h4>🗺 해역별 에피소드 클리어 현황</h4>
        ${episodeItemsHtml}
      </div>

      <div class="config-card">
        <h4>👥 영입된 동료 파티 (${this.campaign.recruitedUnitIds.length}명)</h4>
        ${partyHtml}
      </div>

      <div class="config-card">
        <h4>📜 항해 일지 (Voyage Log)</h4>
        <div id="combat-log-box" class="combat-log-box"></div>
      </div>
    `;

    this.lastVoyageLogLen = 0;
    this.syncLogsDom();
  }

  private renderSandboxDrawer(): void {
    const unitOptions = Object.values(this.gameRegistry.units)
      .map(
        (u) =>
          `<option value="${u.id}">${u.name} [${u.fruitType ?? u.element}]</option>`
      )
      .join('');
    const formOptions = Object.values(this.gameRegistry.forms)
      .map((f) => `<option value="${f.id}">${f.name}</option>`)
      .join('');

    const alphaLead = this.sandboxConfig.teamAlpha[0];
    const omegaLead = this.sandboxConfig.teamOmega[0];

    this.sideDrawerEl.innerHTML = `
      <div class="config-card">
        <h4>⚔ 배틀 샌드박스 설정</h4>
        <div class="field-row">
          <label>전투 모드:</label>
          <select id="sel-mode">
            <option value="1V1">1:1 (Player vs AI)</option>
            <option value="2V2">2:2 (Player+AI vs 2 AI)</option>
            <option value="AI_VS_AI">AI vs AI (관전 모드)</option>
          </select>
        </div>
        <div class="field-row">
          <label>ALPHA 리더:</label>
          <select id="alpha-unit">${unitOptions}</select>
        </div>
        <div class="field-row">
          <label>ALPHA 각성폼:</label>
          <select id="alpha-form">${formOptions}</select>
        </div>
        <div class="field-row">
          <label>OMEGA 리더:</label>
          <select id="omega-unit">${unitOptions}</select>
        </div>
        <div class="field-row">
          <label>OMEGA 각성폼:</label>
          <select id="omega-form">${formOptions}</select>
        </div>
        <button id="btn-sandbox-restart" class="btn-tab-active" style="margin-top:4px;">▶ 샌드박스 전투 재시작</button>
      </div>
      <div class="config-card">
        <h4>📜 실시간 맞대결 전투 로그</h4>
        <div id="combat-log-box" class="combat-log-box"></div>
      </div>
    `;

    const selMode = this.sideDrawerEl.querySelector('#sel-mode') as HTMLSelectElement;
    const selAlpha = this.sideDrawerEl.querySelector('#alpha-unit') as HTMLSelectElement;
    const selAlphaForm = this.sideDrawerEl.querySelector(
      '#alpha-form'
    ) as HTMLSelectElement;
    const selOmega = this.sideDrawerEl.querySelector('#omega-unit') as HTMLSelectElement;
    const selOmegaForm = this.sideDrawerEl.querySelector(
      '#omega-form'
    ) as HTMLSelectElement;

    selMode.value = this.sandboxConfig.mode;
    selAlpha.value = alphaLead.speciesId;
    selAlphaForm.value = alphaLead.formId;
    selOmega.value = omegaLead.speciesId;
    selOmegaForm.value = omegaLead.formId;

    const applyChanges = () => {
      this.sandboxConfig.mode = selMode.value as '1V1' | '2V2' | 'AI_VS_AI';
      alphaLead.speciesId = selAlpha.value;
      alphaLead.formId = selAlphaForm.value;
      alphaLead.moveIds = [
        ...(this.gameRegistry.units[alphaLead.speciesId]?.defaultMoves ??
          alphaLead.moveIds)
      ];
      alphaLead.isPlayerControlled = this.sandboxConfig.mode !== 'AI_VS_AI';

      omegaLead.speciesId = selOmega.value;
      omegaLead.formId = selOmegaForm.value;
      omegaLead.moveIds = [
        ...(this.gameRegistry.units[omegaLead.speciesId]?.defaultMoves ??
          omegaLead.moveIds)
      ];
      this.prng = new SeededPRNG(this.sandboxConfig.seed);
      this.battleWorld = createBattleWorld(this.sandboxConfig, this.gameRegistry);
      void this.storage.saveTeamPreset('sandbox_default', this.sandboxConfig);
    };

    selMode.addEventListener('change', applyChanges);
    selAlpha.addEventListener('change', () => {
      const u = this.gameRegistry.units[selAlpha.value];
      if (u) selAlphaForm.value = u.defaultFormId;
      applyChanges();
    });
    selAlphaForm.addEventListener('change', applyChanges);
    selOmega.addEventListener('change', () => {
      const u = this.gameRegistry.units[selOmega.value];
      if (u) selOmegaForm.value = u.defaultFormId;
      applyChanges();
    });
    selOmegaForm.addEventListener('change', applyChanges);
    this.sideDrawerEl
      .querySelector('#btn-sandbox-restart')
      ?.addEventListener('click', applyChanges);
  }

  private createCrewCampModal(): HTMLElement {
    return createCrewCampModalElement();
  }

  private openCrewCampModal(): void {
    renderCrewCampModal({
      campModalEl: this.campModalEl,
      campaign: this.campaign,
      rpgRegistry: this.rpgRegistry,
      audio: this.audio,
      triggerAutoSave: (reason) => this.triggerAutoSave(reason),
      refreshSideDrawer: () => this.refreshSideDrawer()
    });
  }

  private createMobileVirtualControllerDock(): HTMLElement {
    return createMobileVirtualControllerDockElement(
      this.input,
      () =>
        this.activeScene === 'SEA_SAILING' ||
        this.activeScene === 'ISLAND_EPISODE',
      () => {
        this.pendingRpgInteract = true;
      },
      () => {
        this.pendingCoupDeBurst = true;
      }
    );
  }

  private createSettingsModal(): HTMLElement {
    return createSettingsModalElement(this.input, this.platformBridge);
  }

  private bindTopBarEvents(topBar: HTMLElement): void {
    const toggleBtn = this.rootEl.querySelector('#btn-toggle-hud-drawer') as HTMLButtonElement | null;
    const devToolsRow = topBar.querySelector('#dev-tools-bar-row') as HTMLElement | null;
    const btnToggleJournal = topBar.querySelector('#btn-toggle-journal') as HTMLButtonElement | null;
    const btnToggleDevTools = topBar.querySelector('#btn-toggle-devtools') as HTMLButtonElement | null;

    const closeTopMenu = () => {
      topBar.classList.remove('open');
      this.sideDrawerEl?.classList.remove('open');
      if (!this.devToolsExpanded) {
        this.showcaseBarEl?.classList.remove('open');
      }
      if (toggleBtn) toggleBtn.textContent = '☰ 메뉴';
      this.clearTransientFocusAndInput();
    };

    toggleBtn?.addEventListener('click', () => {
      const opening = !topBar.classList.contains('open');
      topBar.classList.toggle('open', opening);
      if (!opening) {
        this.sideDrawerEl?.classList.remove('open');
        if (!this.devToolsExpanded) {
          this.showcaseBarEl?.classList.remove('open');
        }
      } else if (this.devToolsExpanded) {
        this.showcaseBarEl?.classList.add('open');
      }
      toggleBtn.textContent = opening ? '✕ 닫기' : '☰ 메뉴';
      this.clearTransientFocusAndInput();
    });

    btnToggleJournal?.addEventListener('click', () => {
      const open = !this.sideDrawerEl?.classList.contains('open');
      this.sideDrawerEl?.classList.toggle('open', open);
      if (btnToggleJournal) {
        btnToggleJournal.classList.toggle('btn-tab-active', Boolean(open));
      }
      this.clearTransientFocusAndInput();
    });

    btnToggleDevTools?.addEventListener('click', () => {
      this.devToolsExpanded = !this.devToolsExpanded;
      if (devToolsRow) {
        devToolsRow.style.display = this.devToolsExpanded ? 'flex' : 'none';
      }
      this.showcaseBarEl?.classList.toggle('open', this.devToolsExpanded);
      btnToggleDevTools.classList.toggle('btn-tab-active', this.devToolsExpanded);
      this.clearTransientFocusAndInput();
    });

    const tabRpg = topBar.querySelector('#tab-rpg') as HTMLButtonElement;
    const tabEndgame = topBar.querySelector('#tab-endgame') as HTMLButtonElement | null;
    const tabOnline = topBar.querySelector('#tab-online') as HTMLButtonElement;
    const tabSandbox = topBar.querySelector('#tab-sandbox') as HTMLButtonElement;

    tabRpg.addEventListener('click', () => {
      tabRpg.classList.add('btn-tab-active');
      tabSandbox.classList.remove('btn-tab-active');
      closeTopMenu();
      this.switchToScene(
        this.campaign.activeIslandId ? 'ISLAND_EPISODE' : 'SEA_SAILING'
      );
    });

    tabEndgame?.addEventListener('click', () => {
      closeTopMenu();
      this.openEndgameHub();
    });

    tabOnline.addEventListener('click', () => {
      closeTopMenu();
      this.openOnlineLobbyModal(false);
    });

    tabSandbox.addEventListener('click', () => {
      tabSandbox.classList.add('btn-tab-active');
      tabRpg.classList.remove('btn-tab-active');
      this.sideDrawerEl?.classList.add('open');
      this.showcaseBarEl?.classList.add('open');
      this.switchToScene('SANDBOX');
    });

    const selJump = topBar.querySelector('#sel-debug-jump') as HTMLSelectElement;
    selJump.addEventListener('change', () => {
      if (!selJump.value) return;
      const targetJump = selJump.value;
      selJump.value = '';
      selJump.blur();
      tabRpg.classList.add('btn-tab-active');
      tabSandbox.classList.remove('btn-tab-active');
      closeTopMenu();
      this.executeDebugStoryJump(targetJump);
    });

    topBar.querySelector('#btn-asset-preview')?.addEventListener('click', () => {
      this.audio.unlock();
      closeTopMenu();
      this.assetPreviewScene?.open();
    });

    topBar.querySelector('#btn-return-title')?.addEventListener('click', async () => {
      await this.scanLatestSaveOnBoot();
      closeTopMenu();
      this.enterTitleScene();
    });

    topBar.querySelector('#btn-save-menu')?.addEventListener('click', () => {
      closeTopMenu();
      void this.openSaveManagerModal();
    });

    topBar.querySelector('#btn-camp-menu')?.addEventListener('click', () => {
      closeTopMenu();
      this.openCrewCampModal();
    });

    topBar.querySelector('#btn-settings')?.addEventListener('click', () => {
      closeTopMenu();
      this.settingsModalEl.classList.add('open');
    });

    this.settingsModalEl
      .querySelector('#btn-close-settings')
      ?.addEventListener('click', () => {
        void this.storage.saveGlobalSettings(this.getCurrentGlobalSettings());
        this.settingsModalEl.classList.remove('open');
      });

    const chkFlash = this.settingsModalEl.querySelector('#chk-flash') as HTMLInputElement;
    chkFlash.addEventListener('change', () => {
      this.renderer.settings.flashEffectEnabled = chkFlash.checked;
      void this.storage.saveGlobalSettings(this.getCurrentGlobalSettings());
    });

    const selWinMode = this.settingsModalEl.querySelector(
      '#sel-window-mode'
    ) as HTMLSelectElement | null;
    selWinMode?.addEventListener('change', () => {
      void this.platformBridge.device.setDisplayMode(
        selWinMode.value as WindowDisplayMode
      );
    });

    const chkHaptics = this.settingsModalEl.querySelector(
      '#chk-haptics'
    ) as HTMLInputElement | null;
    chkHaptics?.addEventListener('change', () => {
      this.platformBridge.device.setHapticsEnabled(chkHaptics.checked);
    });

    this.settingsModalEl
      .querySelector('#btn-quit-game')
      ?.addEventListener('click', () => {
        void this.platformBridge.device.requestQuitWithConfirmation();
      });

    const rngShake = this.settingsModalEl.querySelector('#rng-shake') as HTMLInputElement;
    rngShake.addEventListener('input', () => {
      this.renderer.settings.shakeIntensity = Number(rngShake.value) / 100;
      void this.storage.saveGlobalSettings(this.getCurrentGlobalSettings());
    });

    const rngBgmVol = this.settingsModalEl.querySelector('#rng-bgm-vol') as HTMLInputElement | null;
    rngBgmVol?.addEventListener('input', () => {
      this.audio.setBgmVolume(Number(rngBgmVol.value) / 100);
      void this.storage.saveGlobalSettings(this.getCurrentGlobalSettings());
    });

    const rngSfxVol = this.settingsModalEl.querySelector('#rng-sfx-vol') as HTMLInputElement | null;
    rngSfxVol?.addEventListener('input', () => {
      this.audio.setSfxVolume(Number(rngSfxVol.value) / 100);
      void this.storage.saveGlobalSettings(this.getCurrentGlobalSettings());
    });

    const chkMute = this.settingsModalEl.querySelector('#chk-mute') as HTMLInputElement;
    chkMute.addEventListener('change', () => {
      this.audio.setMuted(chkMute.checked);
      void this.storage.saveGlobalSettings(this.getCurrentGlobalSettings());
    });

    const chkTouch = this.settingsModalEl.querySelector('#chk-touch-ui') as HTMLInputElement;
    chkTouch.addEventListener('change', () => {
      this.input.forceShowTouchUi = chkTouch.checked;
    });

    const selTouchSize = this.settingsModalEl.querySelector(
      '#sel-touch-size'
    ) as HTMLSelectElement | null;
    selTouchSize?.addEventListener('change', () => {
      this.input.setTouchButtonSize(selTouchSize.value as TouchButtonSizePreset);
    });

    const rngTouchOpacity = this.settingsModalEl.querySelector(
      '#rng-touch-opacity'
    ) as HTMLInputElement | null;
    rngTouchOpacity?.addEventListener('input', () => {
      this.input.setTouchOpacity(Number(rngTouchOpacity.value) / 100);
    });

    const bindDodge = this.settingsModalEl.querySelector('#bind-dodge') as HTMLInputElement;
    bindDodge.addEventListener('change', () => {
      this.input.updateBinding('dodge' as keyof KeyBindingConfig, bindDodge.value.trim());
    });

    const bindForm = this.settingsModalEl.querySelector('#bind-form') as HTMLInputElement;
    bindForm.addEventListener('change', () => {
      this.input.updateBinding('formShift' as keyof KeyBindingConfig, bindForm.value.trim());
    });

    this.settingsModalEl
      .querySelector('#btn-reset-binds')
      ?.addEventListener('click', () => {
        this.input.resetBindings();
        const b = this.input.getBindings();
        bindDodge.value = b.dodge;
        bindForm.value = b.formShift;
      });
  }

  private attachInputListeners(): void {
    const c = this.renderer.canvas;
    c.addEventListener('pointerdown', (e) => {
      const pt = this.renderer.clientToLogical(e.clientX, e.clientY);
      if (this.activeScene === 'BOOT') return;
      if (this.activeScene === 'TITLE') {
        this.titleScene?.expandMenu();
        return;
      }
      if (this.activeScene === 'OPENING_NARRATION') {
        this.audio.unlock();
        const act = advanceOpeningNarrationOnTap(this.openingState, pt);
        if (act === 'SKIPPED' || act === 'FINISHED') {
          this.audio.playSfxId('ui_confirm');
          this.beginFooshaVillagePrologue();
        } else {
          this.audio.playSfxId('ui_move');
        }
        return;
      }
      if (this.showWantedPosterOverlay) {
        this.showWantedPosterOverlay = false;
        return;
      }
      if (this.gateBlockedPopup) {
        this.gateBlockedPopup = null;
        return;
      }
      if (
        this.activeScene === 'ONLINE_BATTLE' &&
        this.onlineAssignedRole === 'SPECTATOR'
      ) {
        return;
      }

      // Bandai RPG Dialogue tap-to-complete / tap-to-advance + [Auto / Log / Skip]
      if (
        this.activeScene === 'ISLAND_EPISODE' &&
        this.islandRuntime?.activeDialogueNpc
      ) {
        const res = handleDialogueOverlayTap(
          pt,
          this.islandRuntime.activeDialogueNpc,
          this.islandRuntime.dialogueLineIndex,
          this.dialogueUiState
        );
        if (res === 'ADVANCE') {
          this.audio.playSfxId('ui_move');
          this.pendingRpgInteract = true;
        } else if (res === 'SKIP_ALL') {
          this.audio.playSfxId('ui_cancel');
          // Advance straight to final line and finish dialogue cleanly
          this.islandRuntime.dialogueLineIndex = Math.max(
            0,
            this.islandRuntime.activeDialogueNpc.dialogueLines.length - 1
          );
          this.pendingRpgInteract = true;
        } else {
          this.audio.playSfxId('ui_move');
        }
        return;
      }

      // MissionTrackerHUD tap (collapse/expand or Gold Marker highlight)
      if (
        this.activeScene === 'SEA_SAILING' ||
        this.activeScene === 'ISLAND_EPISODE'
      ) {
        const trackerAct = handleMissionTrackerTap(pt, this.missionTrackerState);
        if (trackerAct === 'HIGHLIGHT_GOLD') {
          this.storyDirector.triggerHighlightGoldMarker(4.5);
          this.audio.playSfxId('ui_confirm');
          const node = this.storyDirector.getCurrentNode(this.campaign);
          this.saveIndicatorText = `★ 목표 강조: ${node.title}`;
          this.saveIndicatorTimer = 2.6;
          return;
        }
        if (trackerAct === 'TOGGLED') {
          this.audio.playSfxId('ui_move');
          return;
        }
      }

      // Mobile RPG Touch Buttons & Bottom Prompt Banner Interaction (SEA_SAILING / ISLAND_EPISODE)
      if (
        this.activeScene === 'SEA_SAILING' ||
        this.activeScene === 'ISLAND_EPISODE'
      ) {
        const hitBtn = this.input.hitTestTouchButton(pt);
        if (hitBtn === 'SKILL_0') {
          this.pendingRpgInteract = true;
          this.audio.playSfxId('ui_confirm');
          return;
        }
        if (hitBtn === 'DODGE') {
          if (this.activeScene === 'SEA_SAILING') {
            this.pendingCoupDeBurst = true;
          } else {
            this.pendingRpgInteract = true;
          }
          return;
        }

        // Tapping the bottom-center interaction prompt banner or an in-range interactable object triggers interact directly
        const vm = this.renderer.getMetrics();
        if (
          Math.abs(pt.x - vm.viewWidth * 0.5) <= 220 &&
          pt.y >= vm.viewHeight - vm.safeInsets.bottom - 68
        ) {
          this.pendingRpgInteract = true;
          this.audio.playSfxId('ui_confirm');
          return;
        }

        if (this.activeScene === 'ISLAND_EPISODE' && this.islandRuntime) {
          const localPt = { x: pt.x - vm.arenaOffsetX, y: pt.y };
          const nearObj =
            this.lastIslandStep.nearbySwitch?.pos ??
            this.lastIslandStep.nearbyNpc?.pos ??
            this.lastIslandStep.nearbyEncounter?.pos ??
            null;
          if (
            nearObj &&
            Math.hypot(localPt.x - nearObj.x, localPt.y - nearObj.y) <= 56
          ) {
            this.pendingRpgInteract = true;
            this.audio.playSfxId('ui_confirm');
            return;
          }
        }
      }

      // Battle scenes: tapping/clicking bottom HUD skill slots, dodge/form cards, or quick-swap banner
      if (
        this.activeScene === 'STORY_BATTLE' ||
        this.activeScene === 'ONLINE_BATTLE' ||
        this.activeScene === 'SANDBOX'
      ) {
        const hudHit = this.input.hitTestBattleBottomHud(pt, 4);
        if (hudHit) {
          this.input.triggerVirtualAction(hudHit);
          return;
        }
      }

      const handledByTouchUi = this.input.handleCanvasPointerDown(pt, e.pointerId);
      if (
        !handledByTouchUi &&
        (this.activeScene === 'SEA_SAILING' || this.activeScene === 'ISLAND_EPISODE')
      ) {
        if (this.islandRuntime?.activeDialogueNpc) {
          this.pendingRpgInteract = true;
        }
      }
    });
    c.addEventListener('pointermove', (e) => {
      const pt = this.renderer.clientToLogical(e.clientX, e.clientY);
      this.input.handleCanvasPointerMove(pt, e.pointerId);
    });
    window.addEventListener('pointerup', (e) => {
      this.input.handleCanvasPointerUp(e.pointerId);
    });
    window.addEventListener('pointercancel', (e) => {
      this.input.handleCanvasPointerUp(e.pointerId);
    });

    window.addEventListener('keydown', (e) => {
      const targetEl = e.target as HTMLElement | null;
      const tag = targetEl?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (tag === 'SELECT') {
        targetEl?.blur();
      }

      if (this.activeScene === 'TITLE') {
        this.titleScene?.expandMenu();
        return;
      }

      if (this.activeScene === 'OPENING_NARRATION') {
        if (e.code === 'Escape') {
          this.audio.playSfxId('ui_confirm');
          this.beginFooshaVillagePrologue();
          return;
        }
        if (e.code === 'Space' || e.code === 'Enter' || e.code === 'KeyE') {
          const act = advanceOpeningNarrationOnTap(this.openingState);
          if (act === 'SKIPPED' || act === 'FINISHED') {
            this.audio.playSfxId('ui_confirm');
            this.beginFooshaVillagePrologue();
          } else {
            this.audio.playSfxId('ui_move');
          }
          return;
        }
      }

      if (e.code === 'Escape') {
        if (this.showWantedPosterOverlay) {
          this.showWantedPosterOverlay = false;
          return;
        }
        if (this.gateBlockedPopup) {
          this.gateBlockedPopup = null;
          return;
        }
      }

      if (e.code === 'KeyE' || e.code === 'Space' || e.code === 'Enter') {
        if (this.showWantedPosterOverlay) {
          this.showWantedPosterOverlay = false;
          return;
        }
        if (this.gateBlockedPopup) {
          this.gateBlockedPopup = null;
          return;
        }
        if (this.activeScene === 'SEA_SAILING' || this.activeScene === 'ISLAND_EPISODE') {
          this.pendingRpgInteract = true;
        }
      } else if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
        if (this.activeScene === 'SEA_SAILING') {
          this.pendingCoupDeBurst = true;
        }
      }
    });
  }

  private syncLogsDom(): void {
    const logBox = this.sideDrawerEl?.querySelector('#combat-log-box');
    if (!logBox) return;

    const currentBattle =
      this.activeScene === 'ONLINE_BATTLE' && this.activeLockstep
        ? this.activeLockstep.world
        : this.battleWorld;

    if (
      this.activeScene === 'SANDBOX' ||
      this.activeScene === 'STORY_BATTLE' ||
      this.activeScene === 'ONLINE_BATTLE'
    ) {
      if (currentBattle.combatLog.length === this.lastCombatLogLen) return;
      this.lastCombatLogLen = currentBattle.combatLog.length;
      const recent = currentBattle.combatLog.slice(-18);
      logBox.innerHTML = recent.map((l) => `<div>${l}</div>`).join('');
      logBox.scrollTop = logBox.scrollHeight;
    } else {
      if (this.campaign.voyageLog.length === this.lastVoyageLogLen) return;
      this.lastVoyageLogLen = this.campaign.voyageLog.length;
      const recent = this.campaign.voyageLog.slice(-18);
      logBox.innerHTML = recent.map((l) => `<div>${l}</div>`).join('');
      logBox.scrollTop = logBox.scrollHeight;
    }
  }

  private stepRpgFrame(dt: number): void {
    this.playTimeSec += dt;
    this.storyDirector.stepTimers(dt);
    if (this.saveIndicatorTimer > 0) {
      this.saveIndicatorTimer = Math.max(0, this.saveIndicatorTimer - dt);
    }
    if (this.islandRuntime?.activeDialogueNpc) {
      const dlgStep = stepDialogueOverlayUi(
        this.dialogueUiState,
        this.islandRuntime.activeDialogueNpc,
        this.islandRuntime.dialogueLineIndex,
        dt
      );
      if (dlgStep.charRevealed) {
        this.typewriterSfxCounter += 1;
        if (this.typewriterSfxCounter % 3 === 0) {
          this.audio.playSfxId('ui_move');
        }
      }
      if (dlgStep.shouldAutoAdvance) {
        this.pendingRpgInteract = true;
      }
    } else {
      stepDialogueOverlayUi(this.dialogueUiState, null, -1, dt);
    }
    if (this.campaign.shipboardCookingCooldownSec > 0) {
      this.campaign.shipboardCookingCooldownSec = Math.max(
        0,
        this.campaign.shipboardCookingCooldownSec - dt
      );
    }

    // Use BattleWorld-independent movement input so exploration never locks up
    // even if battleWorld.units[0] was KO'd or swapped off-field during the last battle.
    const moveVec = this.input.getExplorationMoveVector();
    const interactPressed = this.pendingRpgInteract;
    const coupPressed = this.pendingCoupDeBurst;
    this.pendingRpgInteract = false;
    this.pendingCoupDeBurst = false;

    if (this.showWantedPosterOverlay) {
      this.wantedPosterOpenTimer += dt;
      // Allow directional input to dismiss the wanted poster once displayed for 0.8s
      if (
        this.wantedPosterOpenTimer >= 0.8 &&
        (Math.abs(moveVec.x) > 0.1 || Math.abs(moveVec.y) > 0.1)
      ) {
        this.showWantedPosterOverlay = false;
      } else {
        return;
      }
    }

    if (this.gateBlockedPopup) {
      return;
    }

    if (this.activeScene === 'SEA_SAILING') {
      if (coupPressed) {
        this.audio.playSfxId('coup_de_burst');
      }
      this.lastSailingStep = stepSeaSailing(
        this.campaign,
        {
          moveVec,
          coupDeBurstPressed: coupPressed,
          dockOrInteractPressed: interactPressed
        },
        dt,
        this.rpgRegistry
      );

      if (this.lastSailingStep.collectedNotice) {
        this.audio.playSfx('FORM_SHIFT');
        this.refreshSideDrawer();
      }

      if (this.lastSailingStep.triggeredBattle) {
        this.startStoryBattle(this.lastSailingStep.triggeredBattle);
        return;
      }

      if (interactPressed) {
        if (
          this.lastSailingStep.nearbyIsland &&
          this.lastSailingStep.nearbyIsland.endgameMode === 'IMPEL_DOWN'
        ) {
          if (isImpelDownUnlocked(this.campaign, this.endgameRegistry)) {
            this.openImpelDownModal();
            this.audio.playSfx('UI_CLICK');
          } else {
            this.campaign.voyageLog.push(
              '[임펠 다운 잠김] 마린포드 에피소드(ep_marineford) 완료 후 입항할 수 있습니다. (엔드게임 허브 Debug 토글 가능)'
            );
            this.openEndgameHub();
          }
        } else if (
          this.lastSailingStep.nearbyIsland &&
          this.lastSailingStep.nearbyIsland.playableInVerticalSlice
        ) {
          const dockRes = enterIslandEpisode(
            this.campaign,
            this.lastSailingStep.nearbyIsland.islandId,
            this.rpgRegistry
          );
          if (dockRes.allowed && dockRes.runtime) {
            this.islandRuntime = dockRes.runtime;
            this.switchToScene('ISLAND_EPISODE');
            void this.triggerAutoSave('섬 입항');
            this.audio.playSfx('UI_CLICK');
          }
        } else if (this.lastSailingStep.nearbySeaGate) {
          const gateRes = tryTransitionThroughSeaGate(
            this.campaign,
            this.rpgRegistry
          );
          if (!gateRes.allowed) {
            this.gateBlockedPopup = gateRes;
            this.audio.playSfx('HIT');
          } else {
            void this.triggerAutoSave('해역 관문 통과');
            this.audio.playSfx('FORM_SHIFT');
            this.syncSceneBgm();
            this.refreshSideDrawer();
          }
        }
      }
    } else if (this.activeScene === 'ISLAND_EPISODE' && this.islandRuntime) {
      this.lastIslandStep = stepIslandExploration(
        this.campaign,
        this.islandRuntime,
        moveVec,
        interactPressed,
        dt,
        this.rpgRegistry,
        this.gameRegistry
      );

      if (interactPressed) {
        this.audio.playSfx('UI_CLICK');
        void this.triggerAutoSave('에피소드 진행');
        this.refreshSideDrawer();
      }

      if (this.lastIslandStep.requestedOpenOnlineTerminal) {
        this.openOnlineLobbyModal(true);
        return;
      }

      if (this.lastIslandStep.requestedEndgameMode) {
        if (this.lastIslandStep.requestedEndgameMode === 'COLOSSEUM') {
          this.openColosseumModal('TOURNAMENT');
        } else if (this.lastIslandStep.requestedEndgameMode === 'IMPEL_DOWN') {
          this.openImpelDownModal();
        } else if (this.lastIslandStep.requestedEndgameMode === 'RAID') {
          this.openRaidLobbyModal();
        } else {
          this.openEndgameHub();
        }
        return;
      }

      if (this.lastIslandStep.triggeredBattle) {
        this.startStoryBattle(this.lastIslandStep.triggeredBattle);
        return;
      }

      if (this.lastIslandStep.requestedExitToSea) {
        this.islandRuntime = null;
        if (this.storyDirector.shouldTriggerFirstSailTutorial(this.campaign)) {
          this.campaign.voyageLog.push(
            '[제1장 첫 출항] 알비다 해적단이 근해를 가로막았다! 첫 해상전 튜토리얼 돌입!'
          );
          void this.triggerAutoSave('첫 출항');
          this.startStoryBattle(
            this.storyDirector.createAlvidaTutorialBattleContext()
          );
          return;
        }
        void this.triggerAutoSave('항구 출항');
        this.switchToScene('SEA_SAILING');
      }
    }
  }

  private loop(nowMs: number): void {
    const frameDtSec = Math.min(0.1, Math.max(0, (nowMs - this.lastTimeMs) / 1000));
    this.lastTimeMs = nowMs;

    this.frameCounter += 1;
    if (nowMs - this.fpsTimerMs >= 500) {
      this.fps = Math.min(
        60,
        Math.max(1, Math.round((this.frameCounter * 1000) / (nowMs - this.fpsTimerMs)))
      );
      this.frameCounter = 0;
      this.fpsTimerMs = nowMs;
    }

    this.accumulator += frameDtSec;
    let steps = 0;
    while (this.accumulator >= FIXED_DT && steps < 6) {
      this.tickCount += 1;

      if (this.activeScene === 'BOOT') {
        const bootDone = stepBootScene(
          this.bootState,
          this.bootAssetsReady,
          FIXED_DT
        );
        if (bootDone) {
          this.enterTitleScene();
        }
      } else if (this.activeScene === 'TITLE') {
        // Title canvas animates smoothly via tickCount
      } else if (this.activeScene === 'OPENING_NARRATION') {
        const opStep = stepOpeningNarration(this.openingState, FIXED_DT);
        if (opStep.charRevealed) {
          this.typewriterSfxCounter += 1;
          if (this.typewriterSfxCounter % 3 === 0) {
            this.audio.playSfxId('ui_move');
          }
        }
        if (opStep.bgmSwellTriggered) {
          void this.audio.playBgm('sea_new_world', { crossfadeSec: 0.6 });
        }
      } else if (this.activeScene === 'SEA_SAILING' || this.activeScene === 'ISLAND_EPISODE') {
        this.stepRpgFrame(FIXED_DT);
      } else if (this.activeScene === 'ONLINE_BATTLE' && this.activeLockstep) {
        const lockstep = this.activeLockstep;
        if (lockstep.stepDisconnectTimer(FIXED_DT)) {
          const myTeam =
            this.onlineAssignedSlotIndex === 0 || this.onlineAssignedSlotIndex === 1
              ? 'ALPHA'
              : 'OMEGA';
          this.finishOnlineMatch(
            myTeam,
            '상대 플레이어 15초 재접속 대기 시간 초과로 자동 승리 판정되었습니다.'
          );
          break;
        }

        if (this.onlineAssignedRole === 'PLAYER') {
          const myUnitId =
            lockstep.config.slotToUnitInstanceId[this.onlineAssignedSlotIndex];
          const myUnit = lockstep.world.units.find(
            (u) => u.instanceId === myUnitId
          );
          const localCmd = this.input.buildPlayerCommand(
            myUnit,
            lockstep.world,
            this.gameRegistry
          );
          lockstep.submitLocalCommandForNextTick(localCmd);
        }

        lockstep.tryAdvanceTick();

        if (lockstep.world.winnerTeam !== null) {
          this.finishOnlineMatch(
            lockstep.world.winnerTeam,
            '실시간 통신 대전 결판이 났습니다!'
          );
          break;
        }
      } else {
        let playerUnit = this.battleWorld.units.find(
          (u) =>
            u.team === 'ALPHA' &&
            u.isOnField &&
            u.isAlive &&
            !u.isDowned &&
            u.isPlayerControlled
        );
        // Auto-transfer player control if current controlled ally was KO'd, downed, or swapped out
        if (
          !playerUnit &&
          !(this.activeScene === 'SANDBOX' && this.sandboxConfig.mode === 'AI_VS_AI')
        ) {
          const nextStanding = this.battleWorld.units.find(
            (u) => u.team === 'ALPHA' && u.isOnField && u.isAlive && !u.isDowned
          );
          if (nextStanding) {
            for (const u of this.battleWorld.units) {
              if (u.team === 'ALPHA') u.isPlayerControlled = u.instanceId === nextStanding.instanceId;
            }
            playerUnit = nextStanding;
          }
        }
        const playerCmd = this.input.buildPlayerCommand(
          playerUnit,
          this.battleWorld,
          this.gameRegistry
        );
        // Offline Co-op Raid: Q-key tag switch between standing squad members
        if (
          this.battleWorld.raidState.active &&
          playerUnit &&
          playerCmd?.swapToBenchUnitId
        ) {
          const standing = this.battleWorld.units.filter(
            (u) => u.team === 'ALPHA' && u.isOnField && u.isAlive && !u.isDowned
          );
          if (standing.length > 1) {
            const curIdx = standing.findIndex((u) => u.instanceId === playerUnit!.instanceId);
            const nextAlly = standing[(curIdx + 1) % standing.length];
            for (const u of this.battleWorld.units) {
              if (u.team === 'ALPHA') u.isPlayerControlled = u.instanceId === nextAlly.instanceId;
            }
            playerCmd.swapToBenchUnitId = null;
          }
        }
        const cmds = playerCmd ? [playerCmd] : [];
        const prevClashes =
          this.battleWorld.beamClashes.length +
          this.battleWorld.meleeClashes.length +
          this.battleWorld.meleeBeamGuards.length;
        const prevSlowMo = this.battleWorld.slowMoTimer;
        const prevFormId = playerUnit?.activeFormId ?? null;

        stepBattleWorld(
          this.battleWorld,
          cmds,
          this.gameRegistry,
          this.prng,
          FIXED_DT
        );

        const nextClashes =
          this.battleWorld.beamClashes.length +
          this.battleWorld.meleeClashes.length +
          this.battleWorld.meleeBeamGuards.length;
        if (nextClashes > prevClashes) {
          void this.platformBridge.device.triggerHaptic('clash');
          this.audio.playSfxId(
            this.battleWorld.beamClashes.length > 0
              ? 'beam_clash_loop'
              : 'melee_clash_clang'
          );
        } else if (this.battleWorld.slowMoTimer > prevSlowMo) {
          void this.platformBridge.device.triggerHaptic('just_dodge');
          this.audio.playSfxId('just_dodge_chime');
        } else if (playerUnit && playerUnit.activeFormId !== prevFormId && playerUnit.activeFormId) {
          void this.platformBridge.device.triggerHaptic('awakening');
          this.audio.playSfxId(
            playerUnit.activeFormId === 'form_luffy_gear5'
              ? 'awakening_drums'
              : 'transform_burst'
          );
          this.syncSceneBgm(this.battleWorld);
        }

        // Dynamic raid break low-pass filter & boss phase-2 / awakening BGM sync
        this.audio.setBreakFilterActive(
          Boolean(this.battleWorld.raidState && this.battleWorld.raidState.groggyTimer > 0)
        );
        if (this.tickCount % 30 === 0) {
          this.syncSceneBgm(this.battleWorld);
        }

        if (
          this.activeScene === 'STORY_BATTLE' &&
          this.battleWorld.winnerTeam !== null
        ) {
          this.finishStoryBattle(this.battleWorld.winnerTeam === 'ALPHA');
        }
      }

      this.accumulator -= FIXED_DT;
      steps += 1;
    }

    const alpha = this.accumulator / FIXED_DT;
    const viewport = this.renderer.beginFrame();
    const ctx = this.renderer.ctx;

    if (this.activeScene === 'BOOT') {
      renderBootScene(ctx, this.bootState, this.tickCount, viewport);
    } else if (this.activeScene === 'TITLE') {
      renderTitleSceneCanvas(ctx, this.assets, this.tickCount, viewport);
    } else if (this.activeScene === 'OPENING_NARRATION') {
      renderOpeningNarrationScene(ctx, this.openingState, this.tickCount, viewport);
    } else if (this.activeScene === 'SEA_SAILING') {
      const storyNode = this.storyDirector.getCurrentNode(this.campaign);
      const seaMarkers = collectSeaWorldMarkers(
        this.campaign,
        this.rpgRegistry,
        storyNode
      );
      renderSeaSailingCanvas(
        ctx,
        this.campaign,
        this.rpgRegistry,
        this.lastSailingStep,
        this.tickCount,
        this.fps,
        this.assets,
        viewport,
        seaMarkers,
        this.storyDirector.isGoldMarkerHighlighted()
      );
      renderMissionTrackerHud(
        ctx,
        storyNode,
        this.storyDirector.getLoopMode(),
        this.missionTrackerState,
        viewport,
        78
      );
      if (this.gateBlockedPopup) {
        renderSeaGateBlockedPopup(ctx, this.gateBlockedPopup, viewport);
      }
      if (this.showWantedPosterOverlay && this.campaign.latestWantedPoster) {
        renderWantedPosterOverlay(
          ctx,
          this.campaign.latestWantedPoster,
          this.gameRegistry,
          this.assets,
          this.isCurrentSaveTampered,
          this.campaign.endgame.colosseum.posterFrameTier,
          viewport
        );
      }
      const hasSeaInteractable = Boolean(
        this.lastSailingStep.nearbyIsland || this.lastSailingStep.nearbySeaGate
      );
      renderTouchOverlay(ctx, this.input, 'SEA', hasSeaInteractable);
    } else if (this.activeScene === 'ISLAND_EPISODE' && this.islandRuntime) {
      const storyNode = this.storyDirector.getCurrentNode(this.campaign);
      const islandMap = this.rpgRegistry.islands[this.islandRuntime.islandId];
      const islandMarkers = islandMap
        ? collectIslandWorldMarkers(this.campaign, islandMap, storyNode)
        : [];
      renderIslandEpisodeCanvas(
        ctx,
        this.campaign,
        this.islandRuntime,
        this.lastIslandStep,
        this.rpgRegistry,
        this.gameRegistry,
        this.assets,
        this.tickCount,
        viewport,
        islandMarkers,
        this.storyDirector.isGoldMarkerHighlighted()
      );
      renderMissionTrackerHud(
        ctx,
        storyNode,
        this.storyDirector.getLoopMode(),
        this.missionTrackerState,
        viewport,
        66
      );
      if (this.islandRuntime.activeDialogueNpc) {
        renderDialogueCutsceneOverlay(
          ctx,
          this.islandRuntime.activeDialogueNpc,
          this.islandRuntime.dialogueLineIndex,
          viewport,
          this.dialogueUiState,
          this.gameRegistry,
          this.assets
        );
      }
      if (this.showWantedPosterOverlay && this.campaign.latestWantedPoster) {
        renderWantedPosterOverlay(
          ctx,
          this.campaign.latestWantedPoster,
          this.gameRegistry,
          this.assets,
          this.isCurrentSaveTampered,
          this.campaign.endgame.colosseum.posterFrameTier,
          viewport
        );
      }
      if (!this.islandRuntime.activeDialogueNpc) {
        const hasIslandInteractable = Boolean(
          this.lastIslandStep.nearbyNpc ||
            this.lastIslandStep.nearbySwitch ||
            this.lastIslandStep.nearbyEncounter ||
            this.lastIslandStep.atBattleTerminal ||
            this.lastIslandStep.atPortExit
        );
        renderTouchOverlay(ctx, this.input, 'ISLAND', hasIslandInteractable);
      }
    } else if (this.activeScene === 'ONLINE_BATTLE' && this.activeLockstep) {
      const isSpec = this.onlineAssignedRole === 'SPECTATOR';
      renderBattleArena(
        ctx,
        this.activeLockstep.world,
        this.gameRegistry,
        this.assets,
        alpha,
        this.renderer.settings,
        isSpec ? this.spectatorCameraTarget : 'ALL',
        viewport
      );
      renderBattleHud(
        ctx,
        this.activeLockstep.world,
        this.gameRegistry,
        this.input.getBindings(),
        this.fps,
        this.input.isTouchViewport(),
        viewport
      );
      if (!isSpec) {
        renderTouchOverlay(ctx, this.input);
      }
      renderOnlineAndSpectatorHud(
        ctx,
        this.activeLockstep.world,
        this.activeLockstep,
        isSpec,
        this.spectatorCameraTarget,
        this.activeTransport?.getRttMs() ?? 12,
        this.fps,
        this.isTerminalOnlineMatch,
        viewport
      );
    } else {
      renderBattleArena(
        ctx,
        this.battleWorld,
        this.gameRegistry,
        this.assets,
        alpha,
        this.renderer.settings,
        'ALL',
        viewport
      );
      renderBattleHud(
        ctx,
        this.battleWorld,
        this.gameRegistry,
        this.input.getBindings(),
        this.fps,
        this.input.isTouchViewport(),
        viewport
      );
      renderTouchOverlay(ctx, this.input);
    }

    renderSaveAndTamperOverlay(
      ctx,
      this.saveIndicatorTimer,
      this.saveIndicatorText,
      this.isCurrentSaveTampered,
      viewport
    );

    this.syncLogsDom();
    requestAnimationFrame((t) => this.loop(t));
  }
}
