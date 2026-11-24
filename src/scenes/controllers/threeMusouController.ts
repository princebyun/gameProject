import type { Disposable } from '../../core/types/disposable';
import { FIXED_DT } from '../../core/constants';
import type { AssetLoader } from '../../assets/assetLoader';
import type { AudioManager } from '../../audio/audioManager';
import {
  buildMusouHudSnapshot,
  createMusouCombatState,
  fillMusouBurstGauge,
  setBossArmorToRatio,
  setMusouActionTypeOverride,
  setMusouInfiniteStamina,
  stepMusouCombatTick
} from '../../core/battle/musou/MusouCombatEngine';
import { applyHordeKoToBurst } from '../../core/battle/musou/BurstAndSpecialSystem';
import type {
  BossArmorState,
  MusouActionType,
  MusouCombatState,
  MusouHudSnapshot,
  MusouTickEvent
} from '../../core/battle/musou/MusouTypes';
import { SeededPRNG } from '../../core/math/prng';
import { normalizeStoryUnitId } from '../../core/story/StoryStateMachine';
import type { BattleWorldState } from '../../core/types/battleState';
import type { WeaponTunerSlotKey } from '../../data/assets/weapons3dRegistry';
import { getStoryChapterById } from '../../data/story/storyChaptersRegistry';
import {
  STORY_NPC_SPEAKER_PORTRAIT_MAP,
  type StoryChapterScript,
  type StoryPortraitEmotion
} from '../../data/story/types';
import type { CanvasRenderer } from '../../render/canvasRenderer';
import {
  ThreeMusouBattleScene,
  type ThreeInspectorSnapshot,
  type ThreeWeaponTunerSnapshot
} from '../../render/three/ThreeMusouBattleScene';
import type {
  CutsceneBattleStartRequest,
  CutscenePhaseKind
} from '../../render/three/story/ThreeCutsceneDirector';
import { ThreeStageHost, ThreeStagePolishInput } from '../../render/three/ThreeStageHost';
import type { ThreeToonTuningConfig } from '../../render/three/threeTypes';
import type { ViewportMetrics } from '../../render/viewport/responsiveViewportManager';
import {
  hitTestMusouBattleHud,
  renderMusouBattleHud,
  type MusouHudActionId
} from '../../ui/MusouBattleHUD';
import type { ActiveAppScene } from '../sceneTypes';

export interface MusouDebugSnapshot {
  active: boolean;
  actionType: MusouActionType;
  stamina: number;
  maxStamina: number;
  infiniteStamina: boolean;
  burstGauge: number;
  burstActive: boolean;
  bossArmor: number;
  bossMaxArmor: number;
  bossArmorState: BossArmorState;
  bossGroggyRemainingSec: number;
  koCount: number;
}

export interface ThreeMusouHostContext {
  activeScene: ActiveAppScene;
  battleWorld: BattleWorldState;
  renderer: CanvasRenderer;
  assets?: AssetLoader;
  audio?: AudioManager;
  input?: {
    getExplorationMoveVector(): { x: number; y: number };
  };
  verticalSliceController?: {
    getActiveKind(): string;
    releaseActiveSlice(): void;
  };
  visualPolishDrawer?: {
    refreshTelemetry(): void;
  };
  saveIndicatorText: string;
  saveIndicatorTimer: number;
  updateShowcaseToolbar(): void;
}

export interface ThreeMusouStoryHooks {
  onPhaseComplete?: (chapter: StoryChapterScript, phase: CutscenePhaseKind) => void;
  onStartBattleRequest?: (
    chapter: StoryChapterScript,
    req: CutsceneBattleStartRequest
  ) => void;
}

export class ThreeMusouController implements Disposable {
  private activeScene: ThreeMusouBattleScene | null = null;
  private enabled = true;
  private lastRenderTimeMs = 0;

  private musouState: MusouCombatState | null = null;
  private musouPrng = new SeededPRNG(20261124);
  private pendingEvents: MusouTickEvent[] = [];
  private lastObservedKoCount = 0;

  private pendingLightAttack = false;
  private pendingChargeAttack = false;
  private pendingJump = false;
  private pendingPowerDash = false;
  private pendingBurst = false;
  private pendingParry = false;
  private pendingSpecialSlot: 0 | 1 | 2 | 3 | null = null;

  private activeStoryChapter: StoryChapterScript | null = null;
  private pendingStoryCutscene: {
    chapter: StoryChapterScript;
    phase: CutscenePhaseKind;
  } | null = null;
  private storyHooks: ThreeMusouStoryHooks = {};

  constructor(private readonly threeHost: ThreeStageHost) {}

  public setStoryHooks(hooks: ThreeMusouStoryHooks): void {
    this.storyHooks = hooks;
  }

  public getActiveStoryChapter(): StoryChapterScript | null {
    return this.activeStoryChapter;
  }

  public isCutsceneActive(): boolean {
    return Boolean(this.activeScene?.cutsceneDirector.isActive());
  }

  public handleCutsceneTap(
    logicalPt: { x: number; y: number },
    viewport: ViewportMetrics
  ): boolean {
    if (!this.activeScene?.cutsceneDirector.isActive()) return false;
    return this.activeScene.cutsceneDirector.hitTestOverlay(logicalPt, viewport);
  }

  public handleCutsceneKeyDown(key: string): boolean {
    if (!this.activeScene?.cutsceneDirector.isActive()) return false;
    return this.activeScene.cutsceneDirector.handleKeyDown(key);
  }

  public startStoryChapterCutscene(
    chapterIdOrScript: string | StoryChapterScript,
    phase: CutscenePhaseKind,
    host?: ThreeMusouHostContext
  ): boolean {
    const chapter =
      typeof chapterIdOrScript === 'string'
        ? getStoryChapterById(chapterIdOrScript)
        : chapterIdOrScript;
    if (!chapter) return false;

    this.activeStoryChapter = chapter;
    this.pendingStoryCutscene = { chapter, phase };
    if (this.activeScene && host) {
      this.launchPendingCutsceneIfReady(host);
    }
    return true;
  }

  public loadStoryChapterBanters(
    chapterIdOrScript: string | StoryChapterScript | null
  ): void {
    const chapter =
      typeof chapterIdOrScript === 'string'
        ? getStoryChapterById(chapterIdOrScript) ?? null
        : chapterIdOrScript;
    this.activeStoryChapter = chapter;
    this.activeScene?.banterController.loadRules(chapter?.battleBanters ?? []);
  }

  public notifyBanterGimmickHit(gimmickTag: string): void {
    if (!this.activeScene || !this.musouState) return;
    this.activeScene.banterController.observeFrame(
      this.musouState,
      [],
      this.activeScene.horde.getKoCount(),
      0,
      gimmickTag
    );
  }

  private resolvePortrait(
    host: ThreeMusouHostContext,
    speakerId: string,
    emotion: StoryPortraitEmotion
  ): HTMLImageElement | HTMLCanvasElement | null {
    if (!host.assets) return null;
    const mapped =
      STORY_NPC_SPEAKER_PORTRAIT_MAP[speakerId] ?? normalizeStoryUnitId(speakerId);
    return host.assets.getOrCreateUnitPortrait(mapped, emotion);
  }

  private launchPendingCutsceneIfReady(host: ThreeMusouHostContext): void {
    if (!this.activeScene || !this.pendingStoryCutscene) return;
    const { chapter, phase } = this.pendingStoryCutscene;
    this.pendingStoryCutscene = null;

    this.activeScene.banterController.loadRules(chapter.battleBanters);
    this.activeScene.cutsceneDirector.startChapterPhase(chapter, phase, {
      flashEffect: this.threeHost.isFlashEffectEnabled(),
      tuning: this.threeHost.getTuning(),
      callbacks: {
        onBgmChange: (trackId, fadeMs) => {
          void host.audio?.playBgm(trackId, {
            crossfadeSec: (fadeMs ?? 400) / 1000
          });
        },
        onSfxPlay: (sfxId) => {
          host.audio?.playSfxId(sfxId);
        },
        onStageArenaChanged: (_arenaId, timeOfDay) => {
          this.activeScene?.map.setTimeOfDayPalette(timeOfDay);
        },
        onTemporaryBloomChange: (boost) => {
          this.threeHost.setTemporaryBloomBoost(boost);
        },
        onStartBattle: (req) => {
          this.storyHooks.onStartBattleRequest?.(chapter, req);
        },
        onPhaseComplete: (_finishedId, finishedPhase) => {
          this.storyHooks.onPhaseComplete?.(chapter, finishedPhase);
        }
      }
    });
  }

  public isEnabled(): boolean {
    return this.enabled;
  }

  public setEnabled(next: boolean, host?: ThreeMusouHostContext): void {
    if (this.enabled === next) return;
    this.enabled = next;
    if (!next) {
      this.releaseActiveScene();
    } else {
      host?.verticalSliceController?.releaseActiveSlice();
    }
    host?.updateShowcaseToolbar();
  }

  public toggleEnabled(host: ThreeMusouHostContext): boolean {
    this.setEnabled(!this.enabled, host);
    return this.enabled;
  }

  public isTargetBattleScene(host: ThreeMusouHostContext): boolean {
    return (
      this.enabled &&
      this.threeHost.isWebGL2Ready &&
      (host.activeScene === 'SANDBOX' || host.activeScene === 'STORY_BATTLE')
    );
  }

  public getActiveScene(): ThreeMusouBattleScene | null {
    return this.activeScene;
  }

  public getMusouCombatState(): MusouCombatState | null {
    return this.musouState;
  }

  public toggleBossLockOn(host: ThreeMusouHostContext): string | null {
    if (!this.activeScene) return null;
    const lockedId = this.activeScene.toggleBossLockOn(host.battleWorld);
    host.visualPolishDrawer?.refreshTelemetry();
    return lockedId;
  }

  public triggerMusouDemoBurst(host: ThreeMusouHostContext): void {
    if (!this.activeScene) return;
    if (this.musouState) {
      fillMusouBurstGauge(this.musouState);
      this.pendingBurst = true;
    }
    const res = this.activeScene.triggerMusouDemoBurst(host.battleWorld);
    host.saveIndicatorText = `💥 무쌍 난무! 격파 +${res.launchedGrunts}, 건물 파괴 ${res.shatteredProps}`;
    host.saveIndicatorTimer = 2.0;
    host.visualPolishDrawer?.refreshTelemetry();
  }

  public queueMusouAction(action: MusouHudActionId): void {
    if (action === 'ATTACK') this.pendingLightAttack = true;
    else if (action === 'CHARGE') this.pendingChargeAttack = true;
    else if (action === 'JUMP') this.pendingJump = true;
    else if (action === 'DASH') this.pendingPowerDash = true;
    else if (action === 'BURST') this.pendingBurst = true;
    else if (action === 'SPECIAL_0') this.pendingSpecialSlot = 0;
    else if (action === 'SPECIAL_1') this.pendingSpecialSlot = 1;
    else if (action === 'SPECIAL_2') this.pendingSpecialSlot = 2;
    else if (action === 'SPECIAL_3') this.pendingSpecialSlot = 3;
  }

  public handleMusouHudTap(
    logicalPt: { x: number; y: number },
    viewport: ViewportMetrics
  ): boolean {
    if (!this.activeScene || !this.musouState) return false;
    const hit = hitTestMusouBattleHud(logicalPt, viewport);
    if (!hit) return false;
    this.queueMusouAction(hit);
    return true;
  }

  public setMusouActionTypeOverride(actionType: MusouActionType | null): void {
    if (!this.musouState) return;
    setMusouActionTypeOverride(this.musouState, actionType);
  }

  public fillMusouBurst(activateNow = false): void {
    if (!this.musouState) return;
    fillMusouBurstGauge(this.musouState);
    if (activateNow) {
      this.pendingBurst = true;
    }
  }

  public setMusouInfiniteStamina(enabled: boolean): void {
    if (!this.musouState) return;
    setMusouInfiniteStamina(this.musouState, enabled);
  }

  public setBossArmorToTenPercent(): void {
    if (!this.musouState) return;
    setBossArmorToRatio(this.musouState, 0.1);
  }

  public respawnHorde100(): void {
    this.activeScene?.horde.setTargetCount(100);
    this.activeScene?.horde.reset();
    this.lastObservedKoCount = 0;
  }

  public getMusouDebugSnapshot(): MusouDebugSnapshot {
    const s = this.musouState;
    if (!s) {
      return {
        active: false,
        actionType: 'POWER',
        stamina: 1000,
        maxStamina: 1000,
        infiniteStamina: false,
        burstGauge: 0,
        burstActive: false,
        bossArmor: 1200,
        bossMaxArmor: 1200,
        bossArmorState: 'INTACT',
        bossGroggyRemainingSec: 0,
        koCount: 0
      };
    }
    return {
      active: true,
      actionType: s.player.actionType,
      stamina: s.player.stamina,
      maxStamina: s.player.maxStamina,
      infiniteStamina: s.player.infiniteStamina,
      burstGauge: s.player.burstGauge,
      burstActive: s.player.burstActive,
      bossArmor: s.boss.armorGauge,
      bossMaxArmor: s.boss.maxArmor,
      bossArmorState: s.boss.armorState,
      bossGroggyRemainingSec: Number((s.boss.groggyTicksRemaining / 60).toFixed(1)),
      koCount: this.activeScene?.horde.getKoCount() ?? 0
    };
  }

  private ensureMusouStateSynced(world: Readonly<BattleWorldState>): MusouCombatState {
    const playerUnit =
      world.units.find((u) => u.team === 'ALPHA' && u.isOnField && u.isAlive && u.isPlayerControlled) ??
      world.units.find((u) => u.team === 'ALPHA' && u.isOnField);
    const bossUnit =
      world.units.find((u) => u.team === 'OMEGA' && u.isOnField && u.isBossUnit) ??
      world.units.find((u) => u.team === 'OMEGA' && u.isOnField);

    if (
      !this.musouState ||
      (playerUnit && this.musouState.player.speciesId !== playerUnit.speciesId)
    ) {
      this.musouState = createMusouCombatState({
        unitId: playerUnit?.instanceId ?? 'alpha_1',
        speciesId: playerUnit?.speciesId ?? 'luffy',
        activeFormId: playerUnit?.activeFormId ?? null,
        maxHp: playerUnit?.maxHp ?? 4200,
        bossUnitId: bossUnit?.instanceId ?? 'omega_1',
        bossName: bossUnit?.name ?? '카이도',
        bossSpeciesId: bossUnit?.speciesId ?? 'kaido',
        bossMaxHp: bossUnit?.maxHp ?? 24000,
        bossMaxArmor: 1200
      });
    } else if (bossUnit) {
      this.musouState.boss.bossUnitId = bossUnit.instanceId;
      this.musouState.boss.bossName = bossUnit.name;
      this.musouState.boss.speciesId = bossUnit.speciesId;
    }

    return this.musouState;
  }

  public stepMusouTickIfActive(host: ThreeMusouHostContext): void {
    if (!this.isTargetBattleScene(host)) return;
    if (this.activeScene?.cutsceneDirector.isActive()) return;
    const state = this.ensureMusouStateSynced(host.battleWorld);

    const curKo = this.activeScene?.horde.getKoCount() ?? this.lastObservedKoCount;
    if (curKo > this.lastObservedKoCount) {
      applyHordeKoToBurst(state, curKo - this.lastObservedKoCount);
    }
    this.lastObservedKoCount = curKo;

    const move = host.input?.getExplorationMoveVector() ?? { x: 0, y: 0 };
    const evs = stepMusouCombatTick(
      state,
      {
        moveXPermille: Math.round(move.x * 1000),
        moveZPermille: Math.round(move.y * 1000),
        lightAttackPressed: this.pendingLightAttack,
        chargeAttackPressed: this.pendingChargeAttack,
        jumpPressed: this.pendingJump,
        powerDashPressed: this.pendingPowerDash,
        burstPressed: this.pendingBurst,
        parryPressed: this.pendingParry,
        specialSlotIndex: this.pendingSpecialSlot
      },
      this.musouPrng
    );

    this.pendingLightAttack = false;
    this.pendingChargeAttack = false;
    this.pendingJump = false;
    this.pendingPowerDash = false;
    this.pendingBurst = false;
    this.pendingParry = false;
    this.pendingSpecialSlot = null;

    for (const ev of evs) {
      this.pendingEvents.push(ev);
    }
  }

  public setTuning(partial: Partial<ThreeToonTuningConfig>): ThreeToonTuningConfig {
    const updated = this.threeHost.setTuning(partial);
    this.activeScene?.applyTuning(updated);
    return updated;
  }

  public applyVisualPolish(config: ThreeStagePolishInput): void {
    if (this.activeScene) {
      this.activeScene.applyVisualPolish(config);
    } else {
      this.threeHost.applyVisualPolishConfig(config);
    }
  }

  public renderFrameIfActive(
    host: ThreeMusouHostContext,
    viewport: ViewportMetrics,
    alpha: number
  ): boolean {
    if (!this.isTargetBattleScene(host)) {
      if (this.activeScene) {
        this.releaseActiveScene();
      }
      return false;
    }

    // Mutually exclusive WebGL canvases: ensure PixiJS battle slice releases first
    if (host.verticalSliceController?.getActiveKind() !== 'NONE') {
      host.verticalSliceController?.releaseActiveSlice();
    }

    if (!this.activeScene) {
      this.threeHost.resize(viewport);
      this.activeScene = new ThreeMusouBattleScene(this.threeHost);
      this.lastRenderTimeMs = typeof performance !== 'undefined' ? performance.now() : 0;
      this.lastObservedKoCount = 0;
      if (this.activeStoryChapter) {
        this.activeScene.banterController.loadRules(this.activeStoryChapter.battleBanters);
      }
    }
    this.launchPendingCutsceneIfReady(host);

    const state = this.ensureMusouStateSynced(host.battleWorld);
    const nowMs = typeof performance !== 'undefined' ? performance.now() : this.lastRenderTimeMs + 16.67;
    const dtSec =
      this.lastRenderTimeMs > 0
        ? Math.max(0.001, Math.min(0.05, (nowMs - this.lastRenderTimeMs) / 1000))
        : FIXED_DT;
    this.lastRenderTimeMs = nowMs;

    const eventsToRender = this.pendingEvents.splice(0, this.pendingEvents.length);
    this.activeScene.render(host.battleWorld, alpha, dtSec, viewport, state, eventsToRender);

    if (this.activeScene.cutsceneDirector.isActive()) {
      this.activeScene.cutsceneDirector.renderOverlay(
        host.renderer.ctx,
        viewport,
        (speakerId, emotion) => this.resolvePortrait(host, speakerId, emotion)
      );
      return true;
    }

    const counters = this.activeScene.getCounterSnapshot();
    const playerUnit = host.battleWorld.units.find((u) => u.instanceId === state.player.unitId);
    const hudSnap: MusouHudSnapshot = buildMusouHudSnapshot(
      state,
      counters.koCount,
      playerUnit?.name ?? state.player.speciesId.toUpperCase()
    );

    renderMusouBattleHud(host.renderer.ctx, hudSnap, viewport, {
      banner: this.activeScene.getMusouBannerState(),
      damagePopups: this.activeScene.getProjectedDamagePopups(viewport),
      flashEffect: this.threeHost.isFlashEffectEnabled(),
      elapsedSec: host.battleWorld.elapsedSec,
      lockedBossName: counters.lockedBossName
    });
    this.activeScene.banterController.renderOverlay(
      host.renderer.ctx,
      viewport,
      (speakerId, emotion) => this.resolvePortrait(host, speakerId, emotion)
    );
    return true;
  }

  public getInspectorSnapshot(): ThreeInspectorSnapshot {
    if (this.activeScene) {
      return this.activeScene.getInspectorSnapshot();
    }
    return {
      active: false,
      unitId: null,
      characterId: null,
      source: null,
      availableClips: [],
      activeClip: 'Idle',
      paused: false,
      forwardFlipped: false,
      lockRootMotionXZ: true,
      socketGuidesVisible: false,
      scaleMultiplier: 1,
      boundSockets: []
    };
  }

  public selectInspectorClip(clipName: string): boolean {
    return this.activeScene?.selectInspectorClip(clipName) ?? false;
  }

  public setInspectorPaused(paused: boolean): void {
    this.activeScene?.setInspectorPaused(paused);
  }

  public setInspectorForwardFlipped(flipped: boolean): void {
    this.activeScene?.setInspectorForwardFlipped(flipped);
  }

  public setInspectorRootMotionLock(locked: boolean): void {
    this.activeScene?.setInspectorRootMotionLock(locked);
  }

  public setInspectorSocketGuides(visible: boolean): void {
    this.activeScene?.setInspectorSocketGuides(visible);
  }

  public setInspectorScaleMultiplier(mult: number): void {
    this.activeScene?.setInspectorScaleMultiplier(mult);
  }

  public exportInspectorAnimJson(): string {
    return this.activeScene?.exportInspectorAnimJson() ?? '{}';
  }

  public getWeaponTunerSnapshot(): ThreeWeaponTunerSnapshot {
    if (this.activeScene) {
      return this.activeScene.getWeaponTunerSnapshot();
    }
    return {
      active: false,
      loadoutId: 'zoro_base',
      slotKey: 'right',
      enableHolsterSwap: true,
      holstered: false,
      weaponLabel: '염마 (Enma)',
      bone: 'mixamorigRightHand',
      position: [0.02, 0.04, 0.04],
      rotationDeg: [82, 0, -10],
      scale: 1,
      trailBaseY: 0.16,
      trailTipY: 1.18
    };
  }

  public setWeaponTunerCharacter(loadoutId: string): void {
    this.activeScene?.setWeaponTunerCharacter(loadoutId);
  }

  public setWeaponTunerSlot(slotKey: WeaponTunerSlotKey): void {
    this.activeScene?.setWeaponTunerSlot(slotKey);
  }

  public updateWeaponSlotTransform(partial: {
    posX?: number;
    posY?: number;
    posZ?: number;
    rotX?: number;
    rotY?: number;
    rotZ?: number;
    scale?: number;
  }): void {
    this.activeScene?.updateWeaponSlotTransform(partial);
  }

  public updateWeaponTrailLengths(baseY: number, tipY: number): void {
    this.activeScene?.updateWeaponTrailLengths(baseY, tipY);
  }

  public setWeaponHolsterSwap(enabled: boolean): void {
    this.activeScene?.setWeaponHolsterSwap(enabled);
  }

  public triggerWeaponTestSwing(): void {
    this.activeScene?.triggerWeaponTestSwing();
  }

  public triggerHitSparkTest(): void {
    this.activeScene?.triggerHitSparkTest();
  }

  public exportWeapons3dJson(): string {
    return this.activeScene?.exportWeapons3dJson() ?? '{}';
  }

  public releaseActiveScene(): void {
    if (!this.activeScene) return;
    this.activeScene.dispose();
    this.activeScene = null;
    this.lastRenderTimeMs = 0;
    this.musouState = null;
    this.pendingEvents.length = 0;
    this.lastObservedKoCount = 0;
  }

  public dispose(): void {
    this.releaseActiveScene();
    this.threeHost.dispose();
  }
}
