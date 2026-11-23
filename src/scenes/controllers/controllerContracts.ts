import type { AssetLoader } from '../../assets/assetLoader';
import type { AudioManager } from '../../audio/audioManager';
import type { SeededPRNG } from '../../core/math/prng';
import type { LockstepSyncController } from '../../core/net/lockstepController';
import type { NetworkTransport } from '../../core/net/transport';
import type { RoomStateSnapshot } from '../../core/net/protocol';
import type { PreTerminalPartySnapshot } from '../../core/net/terminalArenaRule';
import type { EndgameDataRegistry } from '../../core/endgame/types';
import type {
  IslandExplorationRuntime,
  IslandStepOutput
} from '../../core/rpg/episodeEngine';
import type { SailingStepOutput } from '../../core/rpg/sailingPhysics';
import type { SaveEnvelope, SaveSlotId } from '../../core/save/schema';
import type {
  BattleWorldConfig,
  BattleWorldState,
  UnitBuildConfig
} from '../../core/types/battleState';
import type { GameDataRegistry, StatBlock } from '../../core/types/dataSchemas';
import type {
  BattleContext,
  GateValidationResult,
  RpgCampaignState,
  RpgDataRegistry
} from '../../core/types/rpgSchemas';
import type { UnifiedInputManager } from '../../input/inputManager';
import type { LoopbackNetworkHub } from '../../platform/net/loopbackTransport';
import type { PlatformAdapter } from '../../platform/platformAdapter';
import type { PlatformBridge } from '../../platform/platformBridge';
import type { SaveStorageAdapter } from '../../platform/storage/storageAdapter';
import type { CanvasRenderer } from '../../render/canvasRenderer';
import type { PixiStageHost } from '../../render/pixi/PixiStageHost';
import type { DialogueOverlayUiState } from '../../render/dialogueAndPosterRenderer';
import type { MissionTrackerState } from '../../render/missionTrackerHud';
import type { SeaWakeParticlePool } from '../../render/sea/seaWakeParticlePool';
import type { SeaWeatherRenderer } from '../../render/sea/seaWeatherRenderer';
import type { SpectatorCameraTarget } from '../../render/spectatorHudRenderer';
import type { StoryDirector } from '../../story/storyDirector';
import type { BootSceneState } from '../bootScene';
import type { AssetPreviewScene } from '../dev/assetPreviewScene';
import type { VisualPolishDrawer } from '../dev/visualPolishDrawer';
import type { OpeningNarrationState } from '../openingNarrationScene';
import type { ActiveAppScene } from '../sceneTypes';
import type { SeaChartController } from '../sea/seaChartController';
import type { TitleSceneController } from '../titleScene';
import type { BattleSpeedScale } from './battleSpeedControl';
import type { SandboxShowcaseKind } from './debugShowcaseController';
import type { PixiVerticalSliceController } from './pixiVerticalSliceController';

export const EV_PRESETS: Record<string, { label: string; evs: StatBlock }> = {
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

export interface SceneManagerHost {
  // Mutable scene/runtime state
  activeScene: ActiveAppScene;
  bootState: BootSceneState;
  bootAssetsReady: boolean;
  latestBootSaveEnvelope: SaveEnvelope | null;
  titleScene: TitleSceneController;
  openingState: OpeningNarrationState;
  missionTrackerState: MissionTrackerState;
  dialogueUiState: DialogueOverlayUiState;
  campaign: RpgCampaignState;
  islandRuntime: IslandExplorationRuntime | null;
  activeBattleContext: BattleContext | null;
  gateBlockedPopup: GateValidationResult | null;
  showWantedPosterOverlay: boolean;
  sandboxConfig: BattleWorldConfig;
  battleWorld: BattleWorldState;
  lastSailingStep: SailingStepOutput;
  lastIslandStep: IslandStepOutput;
  pendingRpgInteract: boolean;
  pendingCoupDeBurst: boolean;
  isCurrentSaveTampered: boolean;
  currentViolationCodes: string[];
  playTimeSec: number;
  saveIndicatorTimer: number;
  saveIndicatorText: string;
  tickCount: number;
  fps: number;
  battleSpeedScale: BattleSpeedScale;
  isBattlePaused: boolean;

  // Online & spectator state
  activeTransport: NetworkTransport | null;
  readonly loopbackHub: LoopbackNetworkHub;
  currentRoomState: RoomStateSnapshot | null;
  onlineAssignedRole: 'PLAYER' | 'SPECTATOR';
  onlineAssignedSlotIndex: number;
  activeLockstep: LockstepSyncController | null;
  spectatorCameraTarget: SpectatorCameraTarget;
  isTerminalOnlineMatch: boolean;
  preTerminalSnapshot: PreTerminalPartySnapshot | null;
  onlineErrorNotice: string | null;
  forfeitConfirmArmed: boolean;

  // Endgame shared hints
  selectedRaidId: string;
  onlineLobbyDefaultMode: '2V2' | '1V1' | 'COOP_RAID';

  // Core services (readonly refs)
  readonly rootEl: HTMLElement;
  readonly gameRegistry: GameDataRegistry;
  readonly rpgRegistry: RpgDataRegistry;
  readonly endgameRegistry: EndgameDataRegistry;
  readonly platform: PlatformAdapter | PlatformBridge;
  readonly platformBridge: PlatformBridge;
  readonly storage: SaveStorageAdapter;
  renderer: CanvasRenderer;
  readonly pixiHost?: PixiStageHost;
  readonly verticalSliceController?: PixiVerticalSliceController;
  visualPolishDrawer?: VisualPolishDrawer;
  readonly input: UnifiedInputManager;
  readonly assets: AssetLoader;
  readonly audio: AudioManager;
  readonly seaWakePool?: SeaWakeParticlePool;
  readonly seaWeatherRenderer?: SeaWeatherRenderer;
  readonly seaChartController?: SeaChartController;
  prng: SeededPRNG;
  readonly storyDirector: StoryDirector;
  assetPreviewScene: AssetPreviewScene;

  // DOM element refs
  sideDrawerEl: HTMLElement;
  campModalEl: HTMLElement;
  saveModalEl: HTMLElement;
  onlineModalEl: HTMLElement;
  settingsModalEl: HTMLElement;
  endgameModalEl: HTMLElement;
  showcaseBarEl: HTMLElement;
  mobileDockEl: HTMLElement;
  networkBadgeEl: HTMLElement;
  hudToggleBtnEl: HTMLButtonElement | null;

  // Orchestration methods
  switchToScene(scene: ActiveAppScene): void;
  syncSceneBundles?: () => void;
  syncActivePartyBundles?: () => void;
  setBattleSpeedScale(scale: BattleSpeedScale): void;
  toggleBattlePause(force?: boolean): void;
  clearTransientFocusAndInput(): void;
  syncSceneBgm(activeWorld?: BattleWorldState): void;
  getActiveEndgameBattleKind(): 'IMPEL_DOWN' | 'COLOSSEUM' | 'RAID' | null;
  triggerAutoSave(reason: string): Promise<void>;
  saveToSlot(slotId: SaveSlotId): Promise<SaveEnvelope>;
  applyLoadedEnvelope(envelope: SaveEnvelope): void;
  buildCurrentSaveEnvelope(slotId: SaveSlotId): SaveEnvelope;
  scanLatestSaveOnBoot(): Promise<void>;
  refreshSideDrawer(): void;
  syncLogsDom(): void;
  updateShowcaseToolbar(): void;
  updateFloatingHudToggleVisibility(): void;
  openCrewCampModal(): void;
  openSaveManagerModal(errorMessage?: string): Promise<void>;
  openOnlineLobbyModal(fromIslandTerminal?: boolean): void;
  openEndgameHub(): void;
  openImpelDownModal(): void;
  openColosseumModal(tab?: 'TOURNAMENT' | 'TUTOR'): void;
  openRaidLobbyModal(): void;
  startStoryBattle(ctx: BattleContext): void;
  finishStoryBattle(victory: boolean): void;
  finishEndgameBattle(victory: boolean): void;
  finishOnlineMatch(winnerTeam: 'ALPHA' | 'OMEGA' | 'DRAW', reason: string): void;
  enterTitleScene(): void;
  startNewAdventureFlow(): void;
  beginFooshaVillagePrologue(): void;
  executeDebugStoryJump(actionKey: string): void;
  triggerSandboxShowcase(kind: SandboxShowcaseKind): void;
  createUnitBuildFromSpecies(
    instanceId: string,
    speciesId: string,
    isPlayerControlled: boolean,
    aiLevel: number,
    evPresetKey: string
  ): UnitBuildConfig;
  createDefaultSandboxConfig(): BattleWorldConfig;
}
