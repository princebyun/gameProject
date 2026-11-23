import { AssetLoader } from '../assets/assetLoader';
import { AudioManager } from '../audio/audioManager';
import { createBattleWorld } from '../core/combat/battleWorld';
import { BATTLE_CALC_VERSION, FIXED_DT } from '../core/constants';
import type { EndgameDataRegistry } from '../core/endgame/types';
import { SeededPRNG } from '../core/math/prng';
import type { LockstepSyncController } from '../core/net/lockstepController';
import type { RoomStateSnapshot } from '../core/net/protocol';
import type { PreTerminalPartySnapshot } from '../core/net/terminalArenaRule';
import type { NetworkTransport } from '../core/net/transport';
import { createInitialCampaignState } from '../core/rpg/campaignState';
import type { IslandExplorationRuntime, IslandStepOutput } from '../core/rpg/episodeEngine';
import type { SailingStepOutput } from '../core/rpg/sailingPhysics';
import type { SaveEnvelope, SaveSlotId } from '../core/save/schema';
import type { BattleWorldConfig, BattleWorldState, UnitBuildConfig } from '../core/types/battleState';
import type { GameDataRegistry } from '../core/types/dataSchemas';
import type { BattleContext, GateValidationResult, RpgCampaignState, RpgDataRegistry } from '../core/types/rpgSchemas';
import { defaultEndgameRegistry } from '../data/endgame/endgameRegistry';
import { UnifiedInputManager } from '../input/inputManager';
import { LoopbackNetworkHub } from '../platform/net/loopbackTransport';
import type { PlatformAdapter } from '../platform/platformAdapter';
import { createPlatformBridge, type PlatformBridge } from '../platform/platformBridge';
import type { SaveStorageAdapter } from '../platform/storage/storageAdapter';
import type { CanvasRenderer } from '../render/canvasRenderer';
import { PixiStageHost } from '../render/pixi/PixiStageHost';
import { createDialogueOverlayUiState, type DialogueOverlayUiState } from '../render/dialogueAndPosterRenderer';
import { createInitialMissionTrackerState, type MissionTrackerState } from '../render/missionTrackerHud';
import { SeaWakeParticlePool } from '../render/sea/seaWakeParticlePool';
import { SeaWeatherRenderer } from '../render/sea/seaWeatherRenderer';
import type { SpectatorCameraTarget } from '../render/spectatorHudRenderer';
import { StoryDirector } from '../story/storyDirector';
import { createBootSceneState, type BootSceneState } from './bootScene';
import { BattleLoopRenderer } from './controllers/battleLoopRenderer';
import {
  computeEffectiveLoopDt,
  DEFAULT_BATTLE_SPEED_SCALE,
  formatBattleSpeedLabel,
  loadBattleSpeedScale,
  normalizeBattleSpeedScale,
  saveBattleSpeedScale,
  type BattleSpeedScale
} from './controllers/battleSpeedControl';
import type { SceneManagerHost } from './controllers/controllerContracts';
import { runDebugStoryJump, runSandboxShowcaseScenario, type SandboxShowcaseKind } from './controllers/debugShowcaseController';
import { EndgameModalController } from './controllers/endgameModalController';
import { OnlineMatchController } from './controllers/onlineMatchController';
import { RpgWorldController } from './controllers/rpgWorldController';
import { SceneAudioDirector } from './controllers/sceneAudioDirector';
import {
  createInitialIslandStepState,
  createInitialSailingStepState,
  initializeSceneDomAndSubScenes
} from './controllers/sceneBootInitializer';
import { SceneInputRouter } from './controllers/sceneInputRouter';
import { ScenePersistenceController } from './controllers/scenePersistenceController';
import { SceneShowcaseToolbarController } from './controllers/sceneShowcaseToolbarController';
import { SceneSideDrawerController } from './controllers/sceneSideDrawerController';
import { SceneTopBarController } from './controllers/sceneTopBarController';
import type { AssetPreviewScene } from './dev/assetPreviewScene';
import type { VisualPolishDrawer } from './dev/visualPolishDrawer';
import { PixiVerticalSliceController } from './controllers/pixiVerticalSliceController';
import { renderCrewCampModal } from './modals/crewCampModal';
import { createOpeningNarrationState, type OpeningNarrationState } from './openingNarrationScene';
import type { ActiveAppScene, Disposable } from './sceneTypes';
import { SeaChartController } from './sea/seaChartController';
import type { TitleSceneController } from './titleScene';

export type { ActiveAppScene, Disposable };

export class SceneManager implements Disposable, SceneManagerHost {
  public activeScene: ActiveAppScene = 'BOOT';
  public readonly storyDirector = new StoryDirector();
  public bootState: BootSceneState = createBootSceneState();
  public bootAssetsReady = false;
  public latestBootSaveEnvelope: SaveEnvelope | null = null;
  public titleScene!: TitleSceneController;
  public openingState: OpeningNarrationState = createOpeningNarrationState();
  public missionTrackerState: MissionTrackerState = createInitialMissionTrackerState();
  public dialogueUiState: DialogueOverlayUiState = createDialogueOverlayUiState();
  public hudToggleBtnEl: HTMLButtonElement | null = null;
  public campaign: RpgCampaignState;
  public islandRuntime: IslandExplorationRuntime | null = null;
  public activeBattleContext: BattleContext | null = null;
  public gateBlockedPopup: GateValidationResult | null = null;
  public showWantedPosterOverlay = false;

  public readonly platformBridge: PlatformBridge;
  public readonly storage: SaveStorageAdapter;
  public isCurrentSaveTampered = false;
  public currentViolationCodes: string[] = [];
  public playTimeSec = 0;
  public saveIndicatorTimer = 0;
  public saveIndicatorText = '💾 저장 완료';

  public activeTransport: NetworkTransport | null = null;
  public readonly loopbackHub: LoopbackNetworkHub;
  public currentRoomState: RoomStateSnapshot | null = null;
  public onlineAssignedRole: 'PLAYER' | 'SPECTATOR' = 'PLAYER';
  public onlineAssignedSlotIndex = 0;
  public activeLockstep: LockstepSyncController | null = null;
  public spectatorCameraTarget: SpectatorCameraTarget = 'ALL';
  public isTerminalOnlineMatch = false;
  public preTerminalSnapshot: PreTerminalPartySnapshot | null = null;
  public onlineErrorNotice: string | null = null;
  public forfeitConfirmArmed = false;

  public renderer!: CanvasRenderer;
  public readonly pixiHost = new PixiStageHost();
  public readonly verticalSliceController = new PixiVerticalSliceController(this.pixiHost);
  public visualPolishDrawer?: VisualPolishDrawer;
  public readonly input: UnifiedInputManager;
  public readonly assets: AssetLoader;
  public readonly audio: AudioManager;
  public readonly seaWakePool = new SeaWakeParticlePool();
  public readonly seaWeatherRenderer = new SeaWeatherRenderer();
  public readonly seaChartController = new SeaChartController();
  public prng: SeededPRNG;

  public sandboxConfig: BattleWorldConfig;
  public battleWorld: BattleWorldState;
  public lastSailingStep: SailingStepOutput = createInitialSailingStepState();
  public lastIslandStep: IslandStepOutput = createInitialIslandStepState();

  public pendingRpgInteract = false;
  public pendingCoupDeBurst = false;
  public tickCount = 0;
  public fps = 60;
  public battleSpeedScale: BattleSpeedScale = DEFAULT_BATTLE_SPEED_SCALE;
  public isBattlePaused = false;
  private accumulator = 0;
  private lastTimeMs = 0;
  private frameCounter = 0;
  private fpsTimerMs = 0;
  private rafId: number | null = null;
  private viewportListenerCleanup: (() => void) | null = null;

  public sideDrawerEl!: HTMLElement;
  public campModalEl!: HTMLElement;
  public saveModalEl!: HTMLElement;
  public onlineModalEl!: HTMLElement;
  public settingsModalEl!: HTMLElement;
  public endgameModalEl!: HTMLElement;
  public assetPreviewScene!: AssetPreviewScene;
  public readonly endgameRegistry: EndgameDataRegistry = defaultEndgameRegistry;
  public selectedRaidId = 'raid_kaido_flame';
  public onlineLobbyDefaultMode: '2V2' | '1V1' | 'COOP_RAID' = '2V2';
  public showcaseBarEl!: HTMLElement;
  public mobileDockEl!: HTMLElement;
  public networkBadgeEl!: HTMLElement;

  private readonly audioDirector: SceneAudioDirector;
  private readonly persistenceController: ScenePersistenceController;
  private readonly endgameController: EndgameModalController;
  private readonly onlineController: OnlineMatchController;
  private readonly showcaseController: SceneShowcaseToolbarController;
  private readonly sideDrawerController: SceneSideDrawerController;
  private readonly topBarController: SceneTopBarController;
  private readonly inputRouter: SceneInputRouter;
  private readonly rpgController: RpgWorldController;
  private readonly battleLoop: BattleLoopRenderer;

  constructor(
    public readonly rootEl: HTMLElement,
    public readonly gameRegistry: GameDataRegistry,
    public readonly rpgRegistry: RpgDataRegistry,
    public readonly platform: PlatformAdapter | PlatformBridge,
    customStorage?: SaveStorageAdapter
  ) {
    this.platformBridge = 'runtimeTarget' in platform ? platform : createPlatformBridge();
    this.storage = customStorage ?? this.platformBridge.storage;
    this.loopbackHub = new LoopbackNetworkHub(gameRegistry, rpgRegistry, BATTLE_CALC_VERSION);
    this.input = new UnifiedInputManager(platform);
    this.assets = new AssetLoader();
    this.audio = new AudioManager();
    this.prng = new SeededPRNG(20261119);

    this.audioDirector = new SceneAudioDirector(this);
    this.persistenceController = new ScenePersistenceController(this, this.audioDirector);
    this.endgameController = new EndgameModalController(this);
    this.onlineController = new OnlineMatchController(this);
    this.showcaseController = new SceneShowcaseToolbarController(this);
    this.sideDrawerController = new SceneSideDrawerController(this);
    this.topBarController = new SceneTopBarController(this, this.audioDirector);
    this.inputRouter = new SceneInputRouter(this);
    this.rpgController = new RpgWorldController(this, this.persistenceController);
    this.battleLoop = new BattleLoopRenderer(this, this.rpgController);

    this.campaign = createInitialCampaignState(rpgRegistry, gameRegistry);
    this.battleSpeedScale = loadBattleSpeedScale(platform);
    this.sandboxConfig = this.battleLoop.createDefaultSandboxConfig();
    this.battleWorld = createBattleWorld(this.sandboxConfig, gameRegistry);
  }

  public async init(): Promise<void> {
    await this.platformBridge.init();
    if (this.storage !== this.platformBridge.storage) await this.storage.init();

    const domInit = initializeSceneDomAndSubScenes(
      this,
      this.topBarController,
      this.showcaseController,
      this.inputRouter
    );
    this.viewportListenerCleanup = domInit.cleanupViewport;

    this.activeScene = 'BOOT';
    this.bootState = createBootSceneState();
    this.bootAssetsReady = false;
    this.updateFloatingHudToggleVisibility();

    this.inputRouter.attachInputListeners();
    this.inputRouter.setupPwaAndNetworkListeners();
    this.refreshSideDrawer();
    this.lastTimeMs = this.platform.nowMs();
    this.fpsTimerMs = this.lastTimeMs;
    this.rafId = requestAnimationFrame((t) => this.loop(t));

    await this.pixiHost.init(domInit.canvasWrapper, this.renderer.getMetrics());
    void this.pixiHost.loader.preloadVerticalSliceCore();
    this.visualPolishDrawer?.refreshTelemetry();
    await this.assets.preloadCoreAssets(this.gameRegistry.units);
    await this.scanLatestSaveOnBoot();
    this.bootAssetsReady = true;
  }

  public dispose(): void {
    if (this.rafId !== null && typeof cancelAnimationFrame === 'function') {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.viewportListenerCleanup?.();
    this.viewportListenerCleanup = null;
    this.inputRouter.dispose();
    this.topBarController.dispose();
    this.showcaseController.dispose();
    this.sideDrawerController.dispose();
    this.onlineController.dispose();
    this.endgameController.dispose();
    this.persistenceController.dispose();
    this.audioDirector.dispose();
    this.rpgController.dispose();
    this.battleLoop.dispose();
    this.input.dispose();
    this.titleScene?.dispose();
    this.assetPreviewScene?.dispose();
    this.visualPolishDrawer?.dispose();
    this.verticalSliceController.dispose();
    this.activeTransport?.disconnect();
    this.activeTransport = null;
    this.renderer?.dispose();
    this.seaChartController.dispose();
    this.seaWakePool.dispose();
    this.seaWeatherRenderer.dispose();
    this.assets.dispose();
    this.audio.dispose();
    this.platformBridge.device.dispose?.();
  }

  public updateFloatingHudToggleVisibility(): void {
    if (!this.hudToggleBtnEl) return;
    const hide =
      this.activeScene === 'BOOT' ||
      this.activeScene === 'TITLE' ||
      this.activeScene === 'OPENING_NARRATION';
    this.hudToggleBtnEl.style.display = hide ? 'none' : '';
  }

  public clearTransientFocusAndInput(): void {
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
    this.isBattlePaused = false;
    this.gateBlockedPopup = null;
    this.forfeitConfirmArmed = false;
    this.verticalSliceController.releaseActiveSlice(this);
    if (scene !== 'SEA_SAILING') this.seaChartController.close();
    this.clearTransientFocusAndInput();
    if (scene !== 'TITLE') this.titleScene?.hide();
    this.updateFloatingHudToggleVisibility();

    if (scene === 'SANDBOX') {
      this.prng = new SeededPRNG(this.sandboxConfig.seed);
      this.battleWorld = createBattleWorld(this.sandboxConfig, this.gameRegistry);
    }

    if (this.mobileDockEl) {
      this.mobileDockEl.style.display =
        scene === 'ONLINE_BATTLE' && this.onlineAssignedRole === 'SPECTATOR' ? 'none' : '';
    }

    this.syncSceneBgm();
    this.updateShowcaseToolbar();
    this.refreshSideDrawer();
  }

  public setBattleSpeedScale(scale: BattleSpeedScale): void {
    this.battleSpeedScale = normalizeBattleSpeedScale(scale);
    saveBattleSpeedScale(this.platform, this.battleSpeedScale);
    const sel = this.settingsModalEl?.querySelector('#sel-battle-speed') as HTMLSelectElement | null;
    if (sel) {
      sel.value = String(this.battleSpeedScale);
    }
    this.saveIndicatorText = `⏱ 전투 속도: ${formatBattleSpeedLabel(this.battleSpeedScale)}`;
    this.saveIndicatorTimer = 1.8;
  }

  public toggleBattlePause(force?: boolean): void {
    if (this.activeScene !== 'STORY_BATTLE' && this.activeScene !== 'SANDBOX') {
      this.isBattlePaused = false;
      return;
    }
    this.isBattlePaused = force !== undefined ? force : !this.isBattlePaused;
    this.clearTransientFocusAndInput();
    this.saveIndicatorText = this.isBattlePaused ? '⏸ 전투 일시정지' : '▶ 전투 재개';
    this.saveIndicatorTimer = 1.4;
  }

  public syncSceneBgm(activeWorld?: BattleWorldState): void {
    this.audioDirector.syncSceneBgm(activeWorld);
  }

  public getActiveEndgameBattleKind(): 'IMPEL_DOWN' | 'COLOSSEUM' | 'RAID' | null {
    return this.endgameController.getActiveBattleKind();
  }

  public buildCurrentSaveEnvelope(slotId: SaveSlotId): SaveEnvelope {
    return this.persistenceController.buildCurrentSaveEnvelope(slotId);
  }

  public async triggerAutoSave(reason: string): Promise<void> {
    return this.persistenceController.triggerAutoSave(reason);
  }

  public async saveToSlot(slotId: SaveSlotId): Promise<SaveEnvelope> {
    return this.persistenceController.saveToSlot(slotId);
  }

  public applyLoadedEnvelope(envelope: SaveEnvelope): void {
    this.persistenceController.applyLoadedEnvelope(envelope);
  }

  public async scanLatestSaveOnBoot(): Promise<void> {
    return this.persistenceController.scanLatestSaveOnBoot();
  }

  public async openSaveManagerModal(errorMessage?: string): Promise<void> {
    return this.persistenceController.openSaveManagerModal(errorMessage);
  }

  public openCrewCampModal(): void {
    renderCrewCampModal({
      campModalEl: this.campModalEl,
      campaign: this.campaign,
      rpgRegistry: this.rpgRegistry,
      audio: this.audio,
      triggerAutoSave: (reason) => this.triggerAutoSave(reason),
      refreshSideDrawer: () => this.refreshSideDrawer()
    });
  }

  public enterTitleScene(): void { this.rpgController.enterTitleScene(); }
  public startNewAdventureFlow(): void { this.rpgController.startNewAdventureFlow(); }
  public beginFooshaVillagePrologue(): void { this.rpgController.beginFooshaVillagePrologue(); }
  public startStoryBattle(ctx: BattleContext): void { this.rpgController.startStoryBattle(ctx); }
  public finishStoryBattle(victory: boolean): void { this.rpgController.finishStoryBattle(victory); }
  public openEndgameHub(): void { this.endgameController.openEndgameHub(); }
  public openImpelDownModal(): void { this.endgameController.openImpelDownModal(); }
  public openColosseumModal(tab?: 'TOURNAMENT' | 'TUTOR'): void { this.endgameController.openColosseumModal(tab); }
  public openRaidLobbyModal(): void { this.endgameController.openRaidLobbyModal(); }
  public finishEndgameBattle(victory: boolean): void { this.endgameController.finishEndgameBattle(victory); }
  public openOnlineLobbyModal(fromIslandTerminal = false): void { this.onlineController.openOnlineLobbyModal(fromIslandTerminal); }
  public finishOnlineMatch(winnerTeam: 'ALPHA' | 'OMEGA' | 'DRAW', reason: string): void { this.onlineController.finishOnlineMatch(winnerTeam, reason); }
  public refreshSideDrawer(): void { this.sideDrawerController.refreshSideDrawer(); }
  public syncLogsDom(): void { this.sideDrawerController.syncLogsDom(); }
  public updateShowcaseToolbar(): void { this.showcaseController.updateShowcaseToolbar(); }

  public triggerSandboxShowcase(kind: SandboxShowcaseKind): void {
    runSandboxShowcaseScenario(this.battleWorld, this.gameRegistry, kind);
  }

  public createUnitBuildFromSpecies(
    instanceId: string,
    speciesId: string,
    isPlayerControlled: boolean,
    aiLevel: number,
    evPresetKey: string
  ): UnitBuildConfig {
    return this.battleLoop.createUnitBuildFromSpecies(instanceId, speciesId, isPlayerControlled, aiLevel, evPresetKey);
  }

  public createDefaultSandboxConfig(): BattleWorldConfig {
    return this.battleLoop.createDefaultSandboxConfig();
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
        setIslandRuntime: (rt) => { this.islandRuntime = rt; },
        setGateBlockedPopup: (popup) => { this.gateBlockedPopup = popup; },
        setShowWantedPosterOverlay: (show) => { this.showWantedPosterOverlay = show; },
        switchToScene: (scene) => this.switchToScene(scene),
        triggerAutoSave: (reason) => this.triggerAutoSave(reason),
        refreshSideDrawer: () => this.refreshSideDrawer()
      },
      actionKey
    );
  }

  private loop(nowMs: number): void {
    const frameDtSec = Math.min(0.1, Math.max(0, (nowMs - this.lastTimeMs) / 1000));
    this.lastTimeMs = nowMs;

    this.frameCounter += 1;
    if (nowMs - this.fpsTimerMs >= 500) {
      this.fps = Math.min(60, Math.max(1, Math.round((this.frameCounter * 1000) / (nowMs - this.fpsTimerMs))));
      this.frameCounter = 0;
      this.fpsTimerMs = nowMs;
    }

    const isModalPause = Boolean(
      this.settingsModalEl?.classList.contains('open') ||
        this.rootEl.querySelector('.top-bar.open')
    );
    const effectiveDt = computeEffectiveLoopDt(
      frameDtSec,
      this.activeScene,
      this.battleSpeedScale,
      this.isBattlePaused || isModalPause
    );

    this.accumulator += effectiveDt;
    let steps = 0;
    while (this.accumulator >= FIXED_DT && steps < 6) {
      this.tickCount += 1;
      const keepStepping = this.battleLoop.stepFixedTick();
      this.accumulator -= FIXED_DT;
      steps += 1;
      if (!keepStepping) break;
    }

    const alpha = this.accumulator / FIXED_DT;
    this.battleLoop.renderFrame(alpha);
    this.syncLogsDom();
    this.rafId = requestAnimationFrame((t) => this.loop(t));
  }
}
