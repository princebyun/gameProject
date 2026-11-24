import * as THREE from 'three';
import type { Disposable } from '../../../core/types/disposable';
import { normalizeStoryUnitId } from '../../../core/story/StoryStateMachine';
import { resolveCharacterWeaponLoadout } from '../../../data/assets/weapons3dRegistry';
import {
  assertNeverDirective,
  type StoryAnimClipName,
  type StoryCameraShot3D,
  type StoryChapterScript,
  type StoryDirective3D,
  type StoryPortraitEmotion,
  type StoryVfx3DEffect,
  type StoryWeather3D
} from '../../../data/story/types';
import {
  DEFAULT_VIEWPORT_METRICS,
  type ViewportMetrics
} from '../../viewport/responsiveViewportManager';
import { getSafeHudBounds } from '../../viewport/safeAreaLayout';
import type { CutsceneCameraPose } from '../MusouCameraController';
import {
  Character3DLoader,
  createGreyboxRigCharacter,
  type CharacterInstance3D
} from '../assets/Character3DLoader';
import { WeaponSocketMountSystem } from '../assets/WeaponSocketMountSystem';
import {
  DEFAULT_THREE_TOON_TUNING,
  type MusouAnimState,
  type ThreeToonTuningConfig
} from '../threeTypes';

export type CutscenePortraitResolver = (
  speakerId: string,
  emotion: StoryPortraitEmotion
) => HTMLImageElement | HTMLCanvasElement | null;

export interface CutsceneBattleStartRequest {
  chapterId: string;
  battleId: string;
  bossUnitId: string;
  hordeCount: number;
  preDialogueDoneFlag: string;
}

export interface CutscenePlayCallbacks {
  onPhaseComplete?: (chapterId: string, phase: CutscenePhaseKind) => void;
  onStartBattle?: (req: CutsceneBattleStartRequest) => void;
  onBgmChange?: (trackId: string, fadeMs?: number) => void;
  onSfxPlay?: (sfxId: string) => void;
  onStageArenaChanged?: (
    arenaId: string,
    timeOfDay: 'morning' | 'day' | 'sunset' | 'night',
    weather: StoryWeather3D
  ) => void;
  onTemporaryBloomChange?: (boost: number) => void;
}

export type CutscenePhaseKind = 'intro' | 'preBattle' | 'epilogue';

interface CutsceneActorSlot {
  actorId: string;
  unitId: string;
  drawWeapons: boolean;
  instance: CharacterInstance3D;
  weapons: WeaponSocketMountSystem | null;
  rimOverrideIntensity: number;
  rimOverrideColor: THREE.Color | null;
}

interface CutsceneLogEntry {
  speakerName: string;
  text: string;
}

export interface CutsceneRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface CutsceneOverlayLayout {
  autoBtn: CutsceneRect;
  logBtn: CutsceneRect;
  skipBtn: CutsceneRect;
  dialogueBox: CutsceneRect;
  skipConfirmBtn: CutsceneRect;
  skipCancelBtn: CutsceneRect;
}

const WEATHER_COUNT = 80;
const TYPEWRITER_CPS = 44;
const AUTO_ADVANCE_HOLD_SEC = 1.65;
const CHAPTER_CARD_DURATION_SEC = 2.0;

export function mapStoryClipToMusouAnimState(clip: StoryAnimClipName): MusouAnimState {
  switch (clip) {
    case 'IDLE':
      return 'Idle';
    case 'RUN':
      return 'Run';
    case 'DASH':
      return 'Dash';
    case 'COMBO_1':
      return 'Combo1';
    case 'COMBO_2':
      return 'Combo2';
    case 'COMBO_3':
      return 'Combo3';
    case 'COMBO_4':
      return 'Combo4';
    case 'AIR_LAUNCH':
      return 'AirLaunch';
    case 'BURST_AWAKENING':
      return 'SpecialRelease';
    case 'VICTORY':
      return 'SpecialWindup';
    case 'GUARD':
      return 'Guard';
    case 'PARRY':
      return 'Parry';
    case 'HIT':
      return 'Hit';
    case 'DOWN':
      return 'Down';
  }
}

export function computeCutsceneOverlayLayout(
  viewport: ViewportMetrics = DEFAULT_VIEWPORT_METRICS
): CutsceneOverlayLayout {
  const safe = getSafeHudBounds(viewport, 8);
  const topY = Math.max(safe.top, 16);
  const btnW = 58;
  const btnH = 24;
  const gap = 6;
  const skipBtn: CutsceneRect = {
    x: safe.right - btnW,
    y: topY,
    w: btnW,
    h: btnH
  };
  const logBtn: CutsceneRect = {
    x: skipBtn.x - btnW - gap,
    y: topY,
    w: btnW,
    h: btnH
  };
  const autoBtn: CutsceneRect = {
    x: logBtn.x - btnW - gap,
    y: topY,
    w: btnW,
    h: btnH
  };

  const boxW = Math.min(720, safe.width);
  const boxH = 84;
  const dialogueBox: CutsceneRect = {
    x: Math.round(safe.centerX - boxW / 2),
    y: Math.round(safe.bottom - boxH - 4),
    w: Math.round(boxW),
    h: boxH
  };

  const modalW = Math.min(440, safe.width - 24);
  const modalH = 148;
  const mx = Math.round(safe.centerX - modalW / 2);
  const safeCenterY = Math.round((safe.top + safe.bottom) / 2);
  const my = Math.round(safeCenterY - modalH / 2);
  const skipConfirmBtn: CutsceneRect = {
    x: mx + Math.round(modalW * 0.52),
    y: my + modalH - 36,
    w: Math.round(modalW * 0.42),
    h: 26
  };
  const skipCancelBtn: CutsceneRect = {
    x: mx + 14,
    y: my + modalH - 36,
    w: Math.round(modalW * 0.34),
    h: 26
  };

  return {
    autoBtn,
    logBtn,
    skipBtn,
    dialogueBox,
    skipConfirmBtn,
    skipCancelBtn
  };
}

function hitRect(pt: { x: number; y: number }, r: CutsceneRect): boolean {
  return pt.x >= r.x && pt.x <= r.x + r.w && pt.y >= r.y && pt.y <= r.y + r.h;
}

function easeProgress(
  t01: number,
  easing: 'linear' | 'easeOutCubic' | 'easeInOutQuad' = 'easeOutCubic'
): number {
  const clamped = Math.max(0, Math.min(1, t01));
  if (easing === 'linear') return clamped;
  if (easing === 'easeInOutQuad') {
    return clamped < 0.5
      ? 2 * clamped * clamped
      : 1 - Math.pow(-2 * clamped + 2, 2) / 2;
  }
  return 1 - Math.pow(1 - clamped, 3);
}

/**
 * 3D Story Cutscene Director running natively on ThreeStageHost's WebGL2 pipeline.
 * Owns staged actors, 6 camera presets, InstancedMesh weather, GPU VFX, letterbox/dialogue UX,
 * Auto/Log/Skip 2-line summary, flashEffect===false suppression, and 0-leak .dispose().
 */
export class ThreeCutsceneDirector implements Disposable {
  public readonly cutsceneGroup = new THREE.Group();
  private readonly actorsGroup = new THREE.Group();
  private readonly vfxGroup = new THREE.Group();
  private readonly actors = new Map<string, CutsceneActorSlot>();

  private weatherMesh: THREE.InstancedMesh | null = null;
  private weatherGeo: THREE.BufferGeometry | null = null;
  private weatherMat: THREE.MeshBasicMaterial | null = null;
  private readonly weatherSeeds = new Float32Array(WEATHER_COUNT * 4);
  private currentWeather: StoryWeather3D = 'clear';

  private shockRingMesh: THREE.Mesh | null = null;
  private shockRingGeo: THREE.BufferGeometry | null = null;
  private shockRingMat: THREE.MeshBasicMaterial | null = null;
  private boltMesh: THREE.Mesh | null = null;
  private boltGeo: THREE.BufferGeometry | null = null;
  private boltMat: THREE.MeshBasicMaterial | null = null;
  private vfxTimer = 0;
  private vfxDuration = 0.65;

  private attachedToHostScene = false;
  private disposed = false;

  private activeChapter: StoryChapterScript | null = null;
  private activePhase: CutscenePhaseKind = 'intro';
  private directives: readonly StoryDirective3D[] = [];
  private cursor = 0;
  private active = false;
  private forceGreybox = true;
  private flashEffect = true;
  private tuning: ThreeToonTuningConfig = DEFAULT_THREE_TOON_TUNING;
  private callbacks: CutscenePlayCallbacks = {};

  private elapsedSec = 0;
  private autoMode = false;
  private logOpen = false;
  private skipModalOpen = false;
  private readonly logHistory: CutsceneLogEntry[] = [];

  private activeCard: {
    chapterNo: string;
    act: 1 | 2 | 3;
    title: string;
    subtitle: string;
    timerSec: number;
  } | null = null;

  private activeDialogue: {
    kind: 'line' | 'narration';
    speakerId: string;
    speakerName: string;
    side: 'left' | 'right' | 'center';
    emotion: StoryPortraitEmotion;
    text: string;
    narrationStyle: 'parchment' | 'dramatic_dark';
    revealedChars: number;
    autoHoldSec: number;
  } | null = null;

  // Camera transition state & zero-alloc scratch buffers
  private cameraFromPos = new THREE.Vector3(0, 4.5, 11.0);
  private cameraFromLook = new THREE.Vector3(0, 1.4, 0);
  private cameraFromFov = 48;
  private cameraFromRoll = 0;

  private cameraToPos = new THREE.Vector3(0, 4.5, 11.0);
  private cameraToLook = new THREE.Vector3(0, 1.4, 0);
  private cameraToFov = 48;
  private cameraToRoll = 0;

  private activeCameraShot: StoryCameraShot3D = 'wide_establishing';
  private activeCameraTargetId: string | undefined;
  private cameraElapsedSec = 0;
  private cameraDurationSec = 0.6;
  private cameraEasing: 'linear' | 'easeOutCubic' | 'easeInOutQuad' = 'easeOutCubic';
  private hasCameraPose = false;

  private readonly camPosOut = new THREE.Vector3();
  private readonly camLookOut = new THREE.Vector3();
  private readonly cameraPoseOut: CutsceneCameraPose = {
    position: this.camPosOut,
    lookAt: this.camLookOut,
    fov: 48,
    rollRad: 0
  };
  private readonly dummyObj = new THREE.Object3D();
  private readonly targetScratch = new THREE.Vector3();
  private readonly secondaryScratch = new THREE.Vector3();
  private readonly dirScratch = new THREE.Vector3();
  private readonly rightScratch = new THREE.Vector3();
  private readonly vfxOriginScratch = new THREE.Vector3();
  private readonly tempColorScratch = new THREE.Color();

  private pendingBattleRequest: CutsceneBattleStartRequest | null = null;

  constructor(
    private readonly hostScene: THREE.Scene,
    private readonly loader: Character3DLoader = new Character3DLoader()
  ) {
    this.cutsceneGroup.name = 'story_cutscene_stage_3d';
    this.actorsGroup.name = 'story_cutscene_actors';
    this.vfxGroup.name = 'story_cutscene_vfx';
    this.cutsceneGroup.add(this.actorsGroup);
    this.cutsceneGroup.add(this.vfxGroup);
    this.initPools();
  }

  private initPools(): void {
    this.weatherGeo = new THREE.BoxGeometry(0.08, 0.28, 0.08);
    this.weatherMat = new THREE.MeshBasicMaterial({
      color: '#bae6fd',
      transparent: true,
      opacity: 0.72,
      depthWrite: false
    });
    this.weatherMesh = new THREE.InstancedMesh(
      this.weatherGeo,
      this.weatherMat,
      WEATHER_COUNT
    );
    this.weatherMesh.name = 'story_weather_particles';
    this.weatherMesh.visible = false;
    this.weatherMesh.frustumCulled = false;

    for (let i = 0; i < WEATHER_COUNT; i += 1) {
      const idx = i * 4;
      this.weatherSeeds[idx] = ((i * 73) % 100) / 100 - 0.5;
      this.weatherSeeds[idx + 1] = ((i * 41) % 100) / 100;
      this.weatherSeeds[idx + 2] = ((i * 29) % 100) / 100 - 0.5;
      this.weatherSeeds[idx + 3] = 0.65 + ((i * 17) % 10) * 0.07;
    }
    this.vfxGroup.add(this.weatherMesh);

    this.shockRingGeo = new THREE.RingGeometry(0.65, 1.0, 28);
    this.shockRingGeo.rotateX(-Math.PI * 0.5);
    this.shockRingMat = new THREE.MeshBasicMaterial({
      color: '#facc15',
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    this.shockRingMesh = new THREE.Mesh(this.shockRingGeo, this.shockRingMat);
    this.shockRingMesh.visible = false;
    this.vfxGroup.add(this.shockRingMesh);

    this.boltGeo = new THREE.CylinderGeometry(0.08, 0.22, 12.0, 6);
    this.boltMat = new THREE.MeshBasicMaterial({
      color: '#e0f2fe',
      transparent: true,
      opacity: 0,
      depthWrite: false
    });
    this.boltMesh = new THREE.Mesh(this.boltGeo, this.boltMat);
    this.boltMesh.visible = false;
    this.vfxGroup.add(this.boltMesh);
  }

  public isActive(): boolean {
    return this.active;
  }

  public isAutoMode(): boolean {
    return this.autoMode;
  }

  public isLogOpen(): boolean {
    return this.logOpen;
  }

  public isSkipModalOpen(): boolean {
    return this.skipModalOpen;
  }

  public getActiveChapterId(): string | null {
    return this.activeChapter?.chapterId ?? null;
  }

  public getActivePhase(): CutscenePhaseKind {
    return this.activePhase;
  }

  public getActiveCameraShot(): StoryCameraShot3D {
    return this.activeCameraShot;
  }

  public getCurrentWeather(): StoryWeather3D {
    return this.currentWeather;
  }

  public getStagedActorIds(): string[] {
    return Array.from(this.actors.keys());
  }

  public consumePendingBattleRequest(): CutsceneBattleStartRequest | null {
    const req = this.pendingBattleRequest;
    this.pendingBattleRequest = null;
    return req;
  }

  public setFlashEffect(enabled: boolean): void {
    this.flashEffect = enabled;
    if (!enabled) {
      this.callbacks.onTemporaryBloomChange?.(0);
    }
  }

  public applyTuning(tuning: ThreeToonTuningConfig): void {
    this.tuning = tuning;
    for (const slot of this.actors.values()) {
      const effective =
        slot.rimOverrideIntensity > 0
          ? {
              ...tuning,
              rimIntensity: Math.min(2.2, Math.max(tuning.rimIntensity, slot.rimOverrideIntensity))
            }
          : tuning;
      slot.instance.applyTuning(effective);
      slot.weapons?.applyTuning(effective);
    }
  }

  public startChapterPhase(
    chapter: StoryChapterScript,
    phase: CutscenePhaseKind,
    options?: {
      forceGreybox?: boolean;
      flashEffect?: boolean;
      tuning?: ThreeToonTuningConfig;
      callbacks?: CutscenePlayCallbacks;
    }
  ): void {
    if (this.disposed) return;
    this.stop(false);

    this.activeChapter = chapter;
    this.activePhase = phase;
    this.directives = chapter[phase];
    this.cursor = 0;
    this.active = true;
    this.autoMode = false;
    this.logOpen = false;
    this.skipModalOpen = false;
    this.logHistory.length = 0;
    this.pendingBattleRequest = null;
    this.forceGreybox = options?.forceGreybox ?? typeof fetch === 'undefined';
    if (typeof options?.flashEffect === 'boolean') {
      this.flashEffect = options.flashEffect;
    }
    if (options?.tuning) {
      this.tuning = options.tuning;
    }
    this.callbacks = options?.callbacks ?? {};

    if (!this.attachedToHostScene) {
      this.hostScene.add(this.cutsceneGroup);
      this.attachedToHostScene = true;
    }

    this.pumpUntilWait();
  }

  public stop(notifyComplete = false): void {
    const finishedChapter = this.activeChapter;
    const finishedPhase = this.activePhase;

    this.active = false;
    this.activeChapter = null;
    this.directives = [];
    this.cursor = 0;
    this.activeCard = null;
    this.activeDialogue = null;
    this.logOpen = false;
    this.skipModalOpen = false;
    this.hasCameraPose = false;
    this.vfxTimer = 0;
    this.currentWeather = 'clear';
    if (this.weatherMesh) this.weatherMesh.visible = false;
    if (this.shockRingMesh) this.shockRingMesh.visible = false;
    if (this.boltMesh) this.boltMesh.visible = false;

    this.callbacks.onTemporaryBloomChange?.(0);
    this.clearActors();

    if (this.attachedToHostScene) {
      this.hostScene.remove(this.cutsceneGroup);
      this.attachedToHostScene = false;
    }

    if (notifyComplete && finishedChapter) {
      this.callbacks.onPhaseComplete?.(finishedChapter.chapterId, finishedPhase);
    }
  }

  private clearActors(): void {
    for (const slot of this.actors.values()) {
      slot.weapons?.dispose();
      this.actorsGroup.remove(slot.instance.root);
      slot.instance.dispose();
    }
    this.actors.clear();
  }

  private pumpUntilWait(): void {
    while (this.active && this.cursor < this.directives.length) {
      const directive = this.directives[this.cursor]!;
      this.cursor += 1;

      const blocks = this.executeDirective(directive);
      if (blocks) {
        return;
      }
    }

    if (this.active) {
      this.stop(true);
    }
  }

  private executeDirective(d: StoryDirective3D): boolean {
    switch (d.type) {
      case 'chapter_card':
        this.activeCard = {
          chapterNo: d.chapterNo,
          act: d.act,
          title: d.title,
          subtitle: d.subtitle,
          timerSec: CHAPTER_CARD_DURATION_SEC
        };
        return true;

      case 'bgm':
        this.callbacks.onBgmChange?.(d.trackId, d.fadeMs);
        return false;

      case 'stage_3d':
        this.stageActorsFromDirective(d);
        this.currentWeather = d.weather ?? 'clear';
        this.applyWeatherAppearance(this.currentWeather);
        this.callbacks.onStageArenaChanged?.(
          d.arenaId,
          d.timeOfDay,
          this.currentWeather
        );
        return false;

      case 'camera_3d':
        this.configureCameraTransition(
          d.shot,
          d.targetActorId,
          d.secondaryActorId,
          d.fov,
          d.durationMs,
          d.easing
        );
        // Only block if this is the final directive in the phase; otherwise animate camera live over next line
        return this.cursor >= this.directives.length;

      case 'actor_action': {
        const slot = this.actors.get(d.actorId);
        if (slot) {
          slot.instance.setState(mapStoryClipToMusouAnimState(d.animClip), 0.12);
          if (typeof d.rimIntensity === 'number') {
            slot.rimOverrideIntensity =
              this.flashEffect === false
                ? Math.min(1.0, d.rimIntensity)
                : d.rimIntensity;
          }
          if (d.rimColorHex) {
            slot.rimOverrideColor = this.tempColorScratch.set(d.rimColorHex).clone();
            for (const mat of slot.instance.toonMaterials) {
              if (mat.uniforms['uRimColor']?.value instanceof THREE.Color) {
                mat.uniforms['uRimColor'].value.set(d.rimColorHex);
              }
            }
          }
          if (d.animClip === 'BURST_AWAKENING') {
            slot.instance.setAura(
              this.actors.get(d.actorId)?.unitId === 'luffy' ? 'GEAR5' : 'HAO',
              this.flashEffect === false ? 0.55 : 1.15,
              this.elapsedSec
            );
          }
          if (typeof d.bloomBoost === 'number') {
            const safeBoost =
              this.flashEffect === false
                ? Math.min(0.12, d.bloomBoost * 0.25)
                : d.bloomBoost;
            this.callbacks.onTemporaryBloomChange?.(safeBoost);
          }
        }
        return false;
      }

      case 'vfx_3d':
        this.triggerCutsceneVfx(d.effect, d.targetActorId);
        return false;

      case 'line':
        this.activeDialogue = {
          kind: 'line',
          speakerId: d.speakerId,
          speakerName: d.speakerName,
          side: d.side,
          emotion: d.emotion,
          text: d.text,
          narrationStyle: 'dramatic_dark',
          revealedChars: 0,
          autoHoldSec: AUTO_ADVANCE_HOLD_SEC
        };
        this.logHistory.push({ speakerName: d.speakerName, text: d.text });
        if (d.focusActorId && !this.hasCameraPose) {
          this.configureCameraTransition(
            'closeup_speaker',
            d.focusActorId,
            undefined,
            38,
            380,
            'easeOutCubic'
          );
        }
        if (d.sfx) {
          this.callbacks.onSfxPlay?.(d.sfx);
        }
        return true;

      case 'narration':
        this.activeDialogue = {
          kind: 'narration',
          speakerId: 'narrator',
          speakerName: '나레이션',
          side: 'center',
          emotion: 'normal',
          text: d.text,
          narrationStyle: d.style,
          revealedChars: 0,
          autoHoldSec: AUTO_ADVANCE_HOLD_SEC
        };
        this.logHistory.push({ speakerName: '나레이션', text: d.text });
        return true;

      case 'start_musou_battle':
        this.pendingBattleRequest = {
          chapterId: this.activeChapter?.chapterId ?? '',
          battleId: d.battleId,
          bossUnitId: normalizeStoryUnitId(d.bossUnitId),
          hordeCount: d.hordeCount,
          preDialogueDoneFlag: d.preDialogueDoneFlag
        };
        this.callbacks.onStartBattle?.(this.pendingBattleRequest);
        this.stop(false);
        return true;

      default:
        return assertNeverDirective(d);
    }
  }

  private stageActorsFromDirective(
    d: Extract<StoryDirective3D, { type: 'stage_3d' }>
  ): void {
    this.clearActors();

    for (const spec of d.actors) {
      const unitId = normalizeStoryUnitId(spec.unitId);
      const instance = createGreyboxRigCharacter({
        characterId: unitId,
        scale: 1,
        tuning: this.tuning
      });
      instance.root.position.set(spec.position[0], spec.position[1], spec.position[2]);
      instance.root.rotation.y = (spec.rotationYDeg * Math.PI) / 180;
      instance.setState(mapStoryClipToMusouAnimState(spec.animClip), 0);
      this.actorsGroup.add(instance.root);

      const loadout = resolveCharacterWeaponLoadout(unitId);
      let weapons: WeaponSocketMountSystem | null = null;
      if (loadout) {
        weapons = new WeaponSocketMountSystem(instance.socketBinder);
        weapons.mountLoadout(loadout, this.tuning);
        weapons.setHolstered(!(spec.drawWeapons ?? false));
      }

      const slot: CutsceneActorSlot = {
        actorId: spec.actorId,
        unitId,
        drawWeapons: spec.drawWeapons ?? false,
        instance,
        weapons,
        rimOverrideIntensity: 0,
        rimOverrideColor: null
      };
      this.actors.set(spec.actorId, slot);

      if (!this.forceGreybox && typeof fetch !== 'undefined') {
        void this.tryUpgradeActorToExternalGlb(slot, unitId, spec.drawWeapons ?? false);
      }
    }
  }

  private async tryUpgradeActorToExternalGlb(
    slot: CutsceneActorSlot,
    unitId: string,
    drawWeapons: boolean
  ): Promise<void> {
    try {
      const upgraded = await this.loader.loadCharacter({
        characterId: unitId,
        tuning: this.tuning,
        forceGreybox: false
      });
      if (this.disposed || !this.active || this.actors.get(slot.actorId) !== slot) {
        upgraded.dispose();
        return;
      }
      if (upgraded.source === 'GREYBOX_RIG') {
        upgraded.dispose();
        return;
      }

      upgraded.root.position.copy(slot.instance.root.position);
      upgraded.root.rotation.copy(slot.instance.root.rotation);
      upgraded.setState(slot.instance.currentState, 0);

      slot.weapons?.dispose();
      this.actorsGroup.remove(slot.instance.root);
      slot.instance.dispose();

      this.actorsGroup.add(upgraded.root);
      slot.instance = upgraded;

      const loadout = resolveCharacterWeaponLoadout(unitId);
      if (loadout) {
        const ws = new WeaponSocketMountSystem(upgraded.socketBinder);
        ws.mountLoadout(loadout, this.tuning);
        ws.setHolstered(!drawWeapons);
        slot.weapons = ws;
      } else {
        slot.weapons = null;
      }
    } catch {
      // Keep clean Greybox rig on offline fallback
    }
  }

  private applyWeatherAppearance(weather: StoryWeather3D): void {
    if (!this.weatherMesh || !this.weatherMat) return;
    if (weather === 'clear') {
      this.weatherMesh.visible = false;
      return;
    }
    this.weatherMesh.visible = true;
    switch (weather) {
      case 'rain':
        this.weatherMat.color.set('#7dd3fc');
        this.weatherMat.opacity = 0.68;
        break;
      case 'storm':
        this.weatherMat.color.set('#38bdf8');
        this.weatherMat.opacity = 0.8;
        break;
      case 'snow':
        this.weatherMat.color.set('#f8fafc');
        this.weatherMat.opacity = 0.85;
        break;
      case 'cherry_blossom':
        this.weatherMat.color.set('#f9a8d4');
        this.weatherMat.opacity = 0.88;
        break;
      case 'sandstorm':
        this.weatherMat.color.set('#eab308');
        this.weatherMat.opacity = 0.62;
        break;
      case 'fog':
        this.weatherMat.color.set('#cbd5e1');
        this.weatherMat.opacity = 0.42;
        break;
      case 'aurora':
        this.weatherMat.color.set('#34d399');
        this.weatherMat.opacity = 0.72;
        break;
    }
  }

  private configureCameraTransition(
    shot: StoryCameraShot3D,
    targetActorId?: string,
    secondaryActorId?: string,
    fovOverride?: number,
    durationMs = 600,
    easing: 'linear' | 'easeOutCubic' | 'easeInOutQuad' = 'easeOutCubic'
  ): void {
    if (this.hasCameraPose) {
      this.cameraFromPos.copy(this.camPosOut);
      this.cameraFromLook.copy(this.camLookOut);
      this.cameraFromFov = this.cameraPoseOut.fov;
      this.cameraFromRoll = this.cameraPoseOut.rollRad ?? 0;
    } else {
      this.computeShotPose(
        shot,
        targetActorId,
        secondaryActorId,
        fovOverride,
        this.cameraFromPos,
        this.cameraFromLook
      );
      this.cameraFromPos.y += 1.4;
      this.cameraFromPos.z += 2.2;
      this.cameraFromFov = fovOverride ?? 48;
      this.cameraFromRoll = 0;
    }

    this.activeCameraShot = shot;
    this.activeCameraTargetId = targetActorId;
    this.cameraEasing = easing;
    this.cameraDurationSec = Math.max(0.05, durationMs / 1000);
    this.cameraElapsedSec = 0;

    const shotMeta = this.computeShotPose(
      shot,
      targetActorId,
      secondaryActorId,
      fovOverride,
      this.cameraToPos,
      this.cameraToLook
    );
    this.cameraToFov = shotMeta.fov;
    this.cameraToRoll = shotMeta.rollRad;
    this.hasCameraPose = true;

    this.camPosOut.copy(this.cameraFromPos);
    this.camLookOut.copy(this.cameraFromLook);
    this.cameraPoseOut.fov = this.cameraFromFov;
    this.cameraPoseOut.rollRad = this.cameraFromRoll;
  }

  private computeShotPose(
    shot: StoryCameraShot3D,
    targetActorId: string | undefined,
    secondaryActorId: string | undefined,
    fovOverride: number | undefined,
    outPos: THREE.Vector3,
    outLook: THREE.Vector3
  ): { fov: number; rollRad: number } {
    const primary = targetActorId
      ? this.actors.get(targetActorId)
      : this.actors.values().next().value;
    if (primary) {
      this.targetScratch.copy(primary.instance.root.position);
    } else {
      this.targetScratch.set(0, 0, 0);
    }

    const secondary = secondaryActorId
      ? this.actors.get(secondaryActorId)
      : undefined;
    if (secondary) {
      this.secondaryScratch.copy(secondary.instance.root.position);
    } else {
      this.secondaryScratch.set(
        this.targetScratch.x + 3.0,
        this.targetScratch.y,
        this.targetScratch.z
      );
    }

    const tx = this.targetScratch.x;
    const ty = this.targetScratch.y;
    const tz = this.targetScratch.z;

    switch (shot) {
      case 'wide_establishing':
        outLook.set(tx, ty + 1.4, tz);
        outPos.set(tx + 1.8, ty + 4.8, tz + 11.4);
        return { fov: fovOverride ?? 52, rollRad: 0 };

      case 'over_shoulder': {
        this.dirScratch
          .set(
            this.secondaryScratch.x - tx,
            0,
            this.secondaryScratch.z - tz
          );
        if (this.dirScratch.lengthSq() < 0.001) {
          this.dirScratch.set(1, 0, 0);
        } else {
          this.dirScratch.normalize();
        }
        this.rightScratch.set(-this.dirScratch.z, 0, this.dirScratch.x);
        outLook.set(
          this.secondaryScratch.x,
          this.secondaryScratch.y + 1.45,
          this.secondaryScratch.z
        );
        outPos.set(
          tx - this.dirScratch.x * 2.55 + this.rightScratch.x * 0.92,
          ty + 1.95,
          tz - this.dirScratch.z * 2.55 + this.rightScratch.z * 0.92
        );
        return { fov: fovOverride ?? 44, rollRad: 0 };
      }

      case 'boss_low_angle':
        outLook.set(tx, ty + 2.1, tz);
        outPos.set(tx - 1.6, ty + 0.68, tz + 4.15);
        return { fov: fovOverride ?? 50, rollRad: -0.04 };

      case 'orbit_hero':
        outLook.set(tx, ty + 1.35, tz);
        outPos.set(tx + 3.4, ty + 2.3, tz + 3.8);
        return { fov: fovOverride ?? 46, rollRad: 0 };

      case 'closeup_speaker':
        outLook.set(tx, ty + 1.52, tz);
        outPos.set(tx + 0.45, ty + 1.62, tz + 2.55);
        return { fov: fovOverride ?? 38, rollRad: 0 };

      case 'dramatic_dutch':
        outLook.set(tx, ty + 1.5, tz);
        outPos.set(tx - 2.35, ty + 2.15, tz + 3.85);
        return { fov: fovOverride ?? 49, rollRad: 0.24 };
    }
  }

  private triggerCutsceneVfx(
    effect: StoryVfx3DEffect,
    targetActorId?: string
  ): void {
    const slot = targetActorId ? this.actors.get(targetActorId) : undefined;
    if (slot) {
      this.vfxOriginScratch.copy(slot.instance.root.position);
    } else {
      this.vfxOriginScratch.set(0, 0, 0);
    }

    this.vfxDuration = effect === 'lightning_strike' ? 0.55 : 0.85;
    this.vfxTimer = this.vfxDuration;

    if (this.shockRingMesh && this.shockRingMat) {
      this.shockRingMesh.position.set(
        this.vfxOriginScratch.x,
        0.1,
        this.vfxOriginScratch.z
      );
      this.shockRingMesh.scale.setScalar(0.5);
      this.shockRingMesh.visible = true;
      this.shockRingMat.color.set(
        effect === 'haki_clash'
          ? '#a855f7'
          : effect === 'sakura_gust'
            ? '#f9a8d4'
            : effect === 'burst_aura'
              ? '#facc15'
              : '#38bdf8'
      );
      this.shockRingMat.opacity = this.flashEffect ? 0.85 : 0.35;
    }

    if (this.boltMesh && this.boltMat) {
      if (effect === 'lightning_strike' || effect === 'haki_clash') {
        this.boltMesh.position.set(
          this.vfxOriginScratch.x,
          6.0,
          this.vfxOriginScratch.z
        );
        this.boltMesh.visible = true;
        this.boltMat.color.set(effect === 'lightning_strike' ? '#e0f2fe' : '#c084fc');
        this.boltMat.opacity = this.flashEffect ? 0.92 : 0.28;
      } else {
        this.boltMesh.visible = false;
      }
    }

    const boost = this.flashEffect ? 0.62 : 0.12;
    this.callbacks.onTemporaryBloomChange?.(boost);
  }

  public update(dtSec: number): CutsceneCameraPose | null {
    if (!this.active || this.disposed) return null;

    const dt = Math.max(0.001, Math.min(0.05, dtSec));
    this.elapsedSec += dt;

    for (const slot of this.actors.values()) {
      slot.instance.update(dt);
      slot.weapons?.update(dt, slot.instance.currentState, this.elapsedSec, slot.drawWeapons);
    }

    this.updateWeather(dt);
    this.updateVfx(dt);

    if (this.activeCard) {
      this.activeCard.timerSec -= dt;
      if (this.activeCard.timerSec <= 0) {
        this.activeCard = null;
        this.pumpUntilWait();
      }
    } else if (this.activeDialogue && !this.skipModalOpen && !this.logOpen) {
      const len = this.activeDialogue.text.length;
      if (this.activeDialogue.revealedChars < len) {
        this.activeDialogue.revealedChars = Math.min(
          len,
          this.activeDialogue.revealedChars + TYPEWRITER_CPS * dt
        );
      } else if (this.autoMode) {
        this.activeDialogue.autoHoldSec -= dt;
        if (this.activeDialogue.autoHoldSec <= 0) {
          this.advance();
        }
      }
    }

    if (!this.active || !this.hasCameraPose) {
      return null;
    }

    this.cameraElapsedSec = Math.min(this.cameraDurationSec, this.cameraElapsedSec + dt);
    const linearT = this.cameraElapsedSec / this.cameraDurationSec;
    const easedT = easeProgress(linearT, this.cameraEasing);

    this.camPosOut.lerpVectors(this.cameraFromPos, this.cameraToPos, easedT);
    this.camLookOut.lerpVectors(this.cameraFromLook, this.cameraToLook, easedT);
    this.cameraPoseOut.fov =
      this.cameraFromFov + (this.cameraToFov - this.cameraFromFov) * easedT;
    this.cameraPoseOut.rollRad =
      this.cameraFromRoll + (this.cameraToRoll - this.cameraFromRoll) * easedT;

    if (this.activeCameraShot === 'orbit_hero') {
      const target = this.activeCameraTargetId
        ? this.actors.get(this.activeCameraTargetId)
        : undefined;
      if (target) {
        const angle = linearT * Math.PI * 0.85;
        const base = target.instance.root.position;
        this.camPosOut.set(
          base.x + Math.sin(angle) * 4.4,
          base.y + 2.15,
          base.z + Math.cos(angle) * 4.4
        );
      }
    }

    return this.cameraPoseOut;
  }

  private updateWeather(_dt: number): void {
    if (!this.weatherMesh || this.currentWeather === 'clear') return;
    const fallSpeed =
      this.currentWeather === 'rain' || this.currentWeather === 'storm'
        ? 11.5
        : this.currentWeather === 'snow' || this.currentWeather === 'cherry_blossom'
          ? 2.1
          : 1.4;
    const windX =
      this.currentWeather === 'sandstorm'
        ? 9.0
        : this.currentWeather === 'cherry_blossom'
          ? 2.4
          : 0.7;

    for (let i = 0; i < WEATHER_COUNT; i += 1) {
      const idx = i * 4;
      const sx = this.weatherSeeds[idx] ?? 0;
      const sy = this.weatherSeeds[idx + 1] ?? 0;
      const sz = this.weatherSeeds[idx + 2] ?? 0;
      const speedMul = this.weatherSeeds[idx + 3] ?? 1;

      const wrapY =
        ((sy * 12 - this.elapsedSec * fallSpeed * speedMul) % 12 + 12) % 12;
      const wrapX =
        (((sx * 24 + this.elapsedSec * windX + Math.sin(this.elapsedSec + i) * 0.6) %
          24) +
          24) %
          24 -
        12;
      this.dummyObj.position.set(wrapX, wrapY + 0.3, sz * 18);
      if (this.currentWeather === 'rain' || this.currentWeather === 'storm') {
        this.dummyObj.scale.set(0.35, 1.9, 0.35);
      } else if (this.currentWeather === 'aurora') {
        this.dummyObj.position.y = 7.5 + Math.sin(this.elapsedSec * 1.4 + i * 0.2) * 1.1;
        this.dummyObj.scale.set(5.2, 0.6, 1.2);
      } else {
        this.dummyObj.scale.set(1.0, 0.42, 1.0);
      }
      this.dummyObj.updateMatrix();
      this.weatherMesh.setMatrixAt(i, this.dummyObj.matrix);
    }
    this.weatherMesh.instanceMatrix.needsUpdate = true;
  }

  private updateVfx(dt: number): void {
    if (this.vfxTimer <= 0) return;
    this.vfxTimer = Math.max(0, this.vfxTimer - dt);
    const prog = 1 - this.vfxTimer / this.vfxDuration;

    if (this.shockRingMesh && this.shockRingMat) {
      this.shockRingMesh.scale.setScalar(0.6 + prog * 5.8);
      const peakAlpha = this.flashEffect ? 0.85 : 0.32;
      this.shockRingMat.opacity = Math.max(0, (1 - prog) * peakAlpha);
      if (this.vfxTimer <= 0) this.shockRingMesh.visible = false;
    }

    if (this.boltMesh && this.boltMat && this.boltMesh.visible) {
      // Zero high-frequency strobe when flashEffect is disabled for photosensitivity safety
      const flicker = this.flashEffect
        ? 0.55 + 0.45 * Math.abs(Math.sin(this.elapsedSec * 52))
        : 0.25;
      this.boltMat.opacity = Math.max(0, (1 - prog) * flicker);
      if (this.vfxTimer <= 0) this.boltMesh.visible = false;
    }

    if (this.vfxTimer <= 0) {
      this.callbacks.onTemporaryBloomChange?.(0);
    }
  }

  public advance(): void {
    if (!this.active) return;

    if (this.activeCard) {
      this.activeCard = null;
      this.pumpUntilWait();
      return;
    }

    if (this.skipModalOpen) {
      this.confirmSkip();
      return;
    }

    if (this.logOpen) {
      this.logOpen = false;
      return;
    }

    if (this.activeDialogue) {
      const len = this.activeDialogue.text.length;
      if (this.activeDialogue.revealedChars < len) {
        this.activeDialogue.revealedChars = len;
        return;
      }
      this.activeDialogue = null;
      this.pumpUntilWait();
      return;
    }

    this.pumpUntilWait();
  }

  public toggleAutoMode(): boolean {
    this.autoMode = !this.autoMode;
    return this.autoMode;
  }

  public toggleLogOpen(): boolean {
    this.logOpen = !this.logOpen;
    if (this.logOpen) this.skipModalOpen = false;
    return this.logOpen;
  }

  public requestSkip(): void {
    if (!this.active) return;
    this.skipModalOpen = true;
    this.logOpen = false;
  }

  public cancelSkip(): void {
    this.skipModalOpen = false;
  }

  public confirmSkip(): void {
    if (!this.active) return;
    this.skipModalOpen = false;

    // Preserve chapter unlocks / start_musou_battle triggers even when skipped
    for (let i = this.cursor; i < this.directives.length; i += 1) {
      const d = this.directives[i];
      if (!d) continue;
      if (d.type === 'start_musou_battle') {
        this.pendingBattleRequest = {
          chapterId: this.activeChapter?.chapterId ?? '',
          battleId: d.battleId,
          bossUnitId: normalizeStoryUnitId(d.bossUnitId),
          hordeCount: d.hordeCount,
          preDialogueDoneFlag: d.preDialogueDoneFlag
        };
        this.callbacks.onStartBattle?.(this.pendingBattleRequest);
        this.stop(false);
        return;
      }
    }
    this.stop(true);
  }

  public hitTestOverlay(
    logicalPt: { x: number; y: number },
    viewport: ViewportMetrics = DEFAULT_VIEWPORT_METRICS
  ): boolean {
    if (!this.active) return false;
    const layout = computeCutsceneOverlayLayout(viewport);

    if (this.skipModalOpen) {
      if (hitRect(logicalPt, layout.skipConfirmBtn)) {
        this.confirmSkip();
        return true;
      }
      if (hitRect(logicalPt, layout.skipCancelBtn)) {
        this.cancelSkip();
        return true;
      }
      return true;
    }

    if (hitRect(logicalPt, layout.autoBtn)) {
      this.toggleAutoMode();
      return true;
    }
    if (hitRect(logicalPt, layout.logBtn)) {
      this.toggleLogOpen();
      return true;
    }
    if (hitRect(logicalPt, layout.skipBtn)) {
      this.requestSkip();
      return true;
    }

    this.advance();
    return true;
  }

  public handleKeyDown(key: string): boolean {
    if (!this.active) return false;
    if (key === ' ' || key === 'Enter') {
      this.advance();
      return true;
    }
    if (key === 'Escape') {
      if (this.skipModalOpen) this.cancelSkip();
      else if (this.logOpen) this.logOpen = false;
      else this.requestSkip();
      return true;
    }
    if (key === 'a' || key === 'A') {
      this.toggleAutoMode();
      return true;
    }
    if (key === 'l' || key === 'L') {
      this.toggleLogOpen();
      return true;
    }
    return false;
  }

  public renderOverlay(
    ctx: CanvasRenderingContext2D,
    viewport: ViewportMetrics = DEFAULT_VIEWPORT_METRICS,
    resolvePortrait?: CutscenePortraitResolver
  ): void {
    if (!this.active) return;

    const safe = getSafeHudBounds(viewport, 8);
    const layout = computeCutsceneOverlayLayout(viewport);

    ctx.save();

    // Cinematic 2.39:1 top/bottom letterbox bars compactly scaled to keep Safe HUD clean
    const barH = Math.max(14, Math.min(26, Math.round(viewport.viewHeight * 0.055)));
    ctx.fillStyle = 'rgba(3, 7, 18, 0.92)';
    ctx.fillRect(0, 0, viewport.viewWidth, barH);
    ctx.fillRect(0, viewport.viewHeight - barH, viewport.viewWidth, barH);

    // Top control pills (AUTO / LOG / SKIP) inside Safe Area
    const drawPill = (rect: CutsceneRect, label: string, active: boolean, border: string) => {
      ctx.fillStyle = active ? border : 'rgba(15, 23, 42, 0.88)';
      ctx.beginPath();
      ctx.roundRect(rect.x, rect.y, rect.w, rect.h, 6);
      ctx.fill();
      ctx.strokeStyle = border;
      ctx.lineWidth = 1.4;
      ctx.stroke();
      ctx.fillStyle = active ? '#090d16' : '#f8fafc';
      ctx.font = 'bold 10px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, rect.x + rect.w / 2, rect.y + rect.h / 2);
    };

    drawPill(layout.autoBtn, this.autoMode ? 'AUTO ON' : 'AUTO', this.autoMode, '#38bdf8');
    drawPill(layout.logBtn, 'LOG', this.logOpen, '#a855f7');
    drawPill(layout.skipBtn, 'SKIP ⏭', this.skipModalOpen, '#facc15');

    // Chapter Title Card
    if (this.activeCard) {
      const cardW = Math.min(440, safe.width);
      const cardH = 88;
      const safeCenterY = Math.round((safe.top + safe.bottom) / 2);
      const cx = Math.round(safe.centerX - cardW / 2);
      const cy = Math.round(safeCenterY - cardH / 2);
      ctx.fillStyle = 'rgba(9, 13, 22, 0.92)';
      ctx.beginPath();
      ctx.roundRect(cx, cy, cardW, cardH, 10);
      ctx.fill();
      ctx.strokeStyle = '#facc15';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.textAlign = 'center';
      ctx.textBaseline = 'top';
      ctx.fillStyle = '#38bdf8';
      ctx.font = 'bold 11px monospace';
      ctx.fillText(
        `ACT ${this.activeCard.act} · ${this.activeCard.chapterNo}`,
        safe.centerX,
        cy + 12
      );
      ctx.fillStyle = '#fde047';
      ctx.font = 'bold 18px sans-serif';
      ctx.fillText(this.activeCard.title, safe.centerX, cy + 30, cardW - 24);
      ctx.fillStyle = '#cbd5e1';
      ctx.font = '12px sans-serif';
      ctx.fillText(this.activeCard.subtitle, safe.centerX, cy + 56, cardW - 24);
    }

    // Active Dialogue / Narration Box
    if (this.activeDialogue && !this.skipModalOpen && !this.logOpen) {
      const box = layout.dialogueBox;
      const isParchment =
        this.activeDialogue.kind === 'narration' &&
        this.activeDialogue.narrationStyle === 'parchment';

      ctx.fillStyle = isParchment
        ? 'rgba(56, 39, 20, 0.94)'
        : 'rgba(9, 13, 22, 0.9)';
      ctx.beginPath();
      ctx.roundRect(box.x, box.y, box.w, box.h, 10);
      ctx.fill();
      ctx.strokeStyle =
        this.activeDialogue.kind === 'narration' ? '#facc15' : '#38bdf8';
      ctx.lineWidth = 2;
      ctx.stroke();

      let textStartX = box.x + 14;
      if (this.activeDialogue.kind === 'line') {
        const pSize = 64;
        const px = box.x + 10;
        const py = box.y + 10;
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(px, py, pSize, pSize);
        const portrait = resolvePortrait?.(
          this.activeDialogue.speakerId,
          this.activeDialogue.emotion
        );
        if (portrait) {
          ctx.drawImage(portrait, px, py, pSize, pSize);
        } else {
          ctx.fillStyle = '#fde047';
          ctx.font = 'bold 22px monospace';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(
            this.activeDialogue.speakerName.slice(0, 1) || '★',
            px + pSize / 2,
            py + pSize / 2
          );
        }
        ctx.strokeStyle = '#94a3b8';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(px, py, pSize, pSize);
        textStartX = px + pSize + 12;
      }

      const maxTextW = box.x + box.w - textStartX - 16;
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillStyle = '#fde047';
      ctx.font = 'bold 12px sans-serif';
      ctx.fillText(this.activeDialogue.speakerName, textStartX, box.y + 9, maxTextW);

      const shown = this.activeDialogue.text.slice(
        0,
        Math.floor(this.activeDialogue.revealedChars)
      );
      ctx.fillStyle = '#f8fafc';
      ctx.font = '13px sans-serif';
      const splitIdx = shown.length > 42 ? 42 : shown.length;
      ctx.fillText(shown.slice(0, splitIdx), textStartX, box.y + 29, maxTextW);
      if (shown.length > splitIdx) {
        ctx.fillText(shown.slice(splitIdx, 86), textStartX, box.y + 49, maxTextW);
      }

      if (this.activeDialogue.revealedChars >= this.activeDialogue.text.length) {
        ctx.fillStyle = '#7dd3fc';
        ctx.font = 'bold 10px monospace';
        ctx.textAlign = 'right';
        ctx.fillText('▼ NEXT', box.x + box.w - 12, box.y + box.h - 18);
      }
    }

    // Log Modal
    if (this.logOpen) {
      const mw = Math.min(540, safe.width - 16);
      const mh = Math.min(240, safe.height - 44);
      const safeCenterY = Math.round((safe.top + safe.bottom) / 2);
      const mx = Math.round(safe.centerX - mw / 2);
      const my = Math.round(safeCenterY - mh / 2);
      ctx.fillStyle = 'rgba(2, 6, 23, 0.96)';
      ctx.beginPath();
      ctx.roundRect(mx, my, mw, mh, 10);
      ctx.fill();
      ctx.strokeStyle = '#a855f7';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillStyle = '#e9d5ff';
      ctx.font = 'bold 13px sans-serif';
      ctx.fillText('📜 대사 로그 (LOG) — 아무 곳이나 탭해 닫기', mx + 12, my + 10);

      const recent = this.logHistory.slice(-6);
      let rowY = my + 34;
      for (const row of recent) {
        ctx.fillStyle = '#38bdf8';
        ctx.font = 'bold 11px sans-serif';
        ctx.fillText(`[${row.speakerName}]`, mx + 12, rowY);
        ctx.fillStyle = '#f1f5f9';
        ctx.font = '11px sans-serif';
        ctx.fillText(row.text, mx + 92, rowY, mw - 106);
        rowY += 30;
      }
    }

    // Skip 2-Line Summary Modal
    if (this.skipModalOpen && this.activeChapter) {
      const mw = Math.min(440, safe.width - 24);
      const mh = 148;
      const safeCenterY = Math.round((safe.top + safe.bottom) / 2);
      const mx = Math.round(safe.centerX - mw / 2);
      const my = Math.round(safeCenterY - mh / 2);
      ctx.fillStyle = 'rgba(2, 6, 23, 0.96)';
      ctx.beginPath();
      ctx.roundRect(mx, my, mw, mh, 10);
      ctx.fill();
      ctx.strokeStyle = '#facc15';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.fillStyle = '#fde047';
      ctx.font = 'bold 13px sans-serif';
      ctx.fillText(`⏭ ${this.activeChapter.chapterNo} 컷신 스킵 요약`, mx + 14, my + 12);

      ctx.fillStyle = '#e2e8f0';
      ctx.font = '12px sans-serif';
      ctx.fillText(this.activeChapter.summary2Lines[0], mx + 14, my + 40, mw - 28);
      ctx.fillText(this.activeChapter.summary2Lines[1], mx + 14, my + 60, mw - 28);

      drawPill(layout.skipCancelBtn, '취소', false, '#64748b');
      drawPill(layout.skipConfirmBtn, '스킵 · 다음 진행 ▶', true, '#facc15');
    }

    ctx.restore();
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.stop(false);

    if (this.weatherMesh) {
      this.vfxGroup.remove(this.weatherMesh);
      this.weatherMesh = null;
    }
    this.weatherGeo?.dispose();
    this.weatherGeo = null;
    this.weatherMat?.dispose();
    this.weatherMat = null;

    if (this.shockRingMesh) {
      this.vfxGroup.remove(this.shockRingMesh);
      this.shockRingMesh = null;
    }
    this.shockRingGeo?.dispose();
    this.shockRingGeo = null;
    this.shockRingMat?.dispose();
    this.shockRingMat = null;

    if (this.boltMesh) {
      this.vfxGroup.remove(this.boltMesh);
      this.boltMesh = null;
    }
    this.boltGeo?.dispose();
    this.boltGeo = null;
    this.boltMat?.dispose();
    this.boltMat = null;

    this.cutsceneGroup.clear();
  }
}
