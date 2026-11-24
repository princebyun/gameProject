import * as THREE from 'three';
import type { Disposable } from '../../core/types/disposable';
import type { BattleWorldState } from '../../core/types/battleState';
import type { ViewportMetrics } from '../viewport/responsiveViewportManager';
import type { MusouCounterSnapshot, ThreeTelemetrySnapshot, ThreeToonTuningConfig } from './threeTypes';
import { ThreeStageHost, ThreeStagePolishInput } from './ThreeStageHost';
import { Character3DLoader, CharacterInstance3D, createGreyboxRigCharacter } from './assets/Character3DLoader';
import { Battle3DStateAdapter, Battle3DFrameSnapshot } from './Battle3DStateAdapter';
import { MusouCameraController } from './MusouCameraController';
import { MusouVfx3D } from './MusouVfx3D';
import { MusouHordeRenderer } from './MusouHordeRenderer';
import { DestructiblePropSystem } from './DestructiblePropSystem';
import { FooshaPlaza3DMap } from './FooshaPlaza3DMap';

import {
  getCharacterWeaponLoadoutById,
  getWeapon3DSpec,
  resolveCharacterWeaponLoadout,
  resolveTrailWindowsForState,
  type CharacterWeaponLoadout,
  type WeaponSlotKey,
  type WeaponTunerSlotKey
} from '../../data/assets/weapons3dRegistry';
import { WeaponSocketMountSystem } from './assets/WeaponSocketMountSystem';
import type {
  MusouCombatState,
  MusouTickEvent
} from '../../core/battle/musou/MusouTypes';
import {
  isProgressInTrailWindow,
  ToonWeaponTrailMesh
} from './vfx/ToonWeaponTrailMesh';
import { ComicHitSparkPool } from './vfx/ComicHitSparkPool';
import { PowerDashVfxPool } from './musou/PowerDashVfxPool';
import { BurstCinematicController } from './musou/BurstCinematicController';
import {
  ArmorBreakVfxSystem,
  type MusouBannerState,
  type ProjectedDamagePopup
} from './musou/ArmorBreakVfxSystem';
import { TechniqueMarkVfxPool } from './musou/TechniqueMarkVfxPool';
import { ThreeCutsceneDirector } from './story/ThreeCutsceneDirector';
import { MusouPhaseBanterController } from './story/MusouPhaseBanterController';

interface WeaponRigBundle {
  loadoutId: string;
  loadout: CharacterWeaponLoadout;
  mountSystem: WeaponSocketMountSystem;
  trails: Partial<Record<WeaponSlotKey, ToonWeaponTrailMesh>>;
}

interface ActorSlot {
  instance: CharacterInstance3D;
  requestedExternal: boolean;
  weapons: WeaponRigBundle | null;
}

export interface ThreeWeaponTunerSnapshot {
  active: boolean;
  loadoutId: string;
  slotKey: WeaponTunerSlotKey;
  enableHolsterSwap: boolean;
  holstered: boolean;
  weaponLabel: string;
  bone: string;
  position: [number, number, number];
  rotationDeg: [number, number, number];
  scale: number;
  trailBaseY: number;
  trailTipY: number;
}

export interface ThreeInspectorSnapshot {
  active: boolean;
  unitId: string | null;
  characterId: string | null;
  source: 'GLB_EXTERNAL' | 'GREYBOX_RIG' | null;
  availableClips: string[];
  activeClip: string;
  paused: boolean;
  forwardFlipped: boolean;
  lockRootMotionXZ: boolean;
  socketGuidesVisible: boolean;
  scaleMultiplier: number;
  boundSockets: string[];
}

export class ThreeMusouBattleScene implements Disposable {
  public readonly actorsGroup = new THREE.Group();
  public readonly loader = new Character3DLoader();
  public readonly adapter = new Battle3DStateAdapter();
  public readonly cameraController = new MusouCameraController();
  public readonly vfx: MusouVfx3D;
  public readonly powerDashVfx: PowerDashVfxPool;
  public readonly burstCinematic: BurstCinematicController;
  public readonly armorBreakVfx: ArmorBreakVfxSystem;
  public readonly techniqueMarkVfx: TechniqueMarkVfxPool;
  public readonly horde: MusouHordeRenderer;
  public readonly destructibles: DestructiblePropSystem;
  public readonly map: FooshaPlaza3DMap;
  public readonly cutsceneDirector: ThreeCutsceneDirector;
  public readonly banterController = new MusouPhaseBanterController();

  private readonly actors = new Map<string, ActorSlot>();
  private readonly comicHitSparks: ComicHitSparkPool;
  private readonly rightHandPos = new THREE.Vector3();
  private readonly ribbonInnerPos = new THREE.Vector3();
  private readonly ribbonOuterPos = new THREE.Vector3();
  private readonly weaponBaseScratch = new THREE.Vector3();
  private readonly weaponTipScratch = new THREE.Vector3();
  private readonly sparkPosScratch = new THREE.Vector3();
  private readonly sparkDirScratch = new THREE.Vector3();
  private readonly playerCenterPos = new THREE.Vector3();
  private readonly musouOriginScratch = new THREE.Vector3();
  private readonly musouDirScratch = new THREE.Vector3();
  private readonly fallbackAimDir = new THREE.Vector3(1, 0, 0);
  private readonly bossPosScratch = new THREE.Vector3(1.2, 0, 0);

  private elapsedSec = 0;
  private disposed = false;
  private flashEffect = true;
  private lastSnapshot: Battle3DFrameSnapshot | null = null;
  private demoBurstTimer = 0;
  private powerDashKickTimer = 0;
  private musouRimBoost = 0;

  private inspectedUnitId: string | null = null;
  private inspectorClipOverride: string | null = null;
  private inspectorPaused = false;
  private inspectorForwardFlipped = false;
  private inspectorRootLockXZ = true;
  private inspectorGuidesVisible = false;
  private inspectorScaleMultiplier = 1;

  private weaponTunerLoadoutOverride: string | null = null;
  private weaponTunerSlot: WeaponTunerSlotKey = 'right';
  private weaponTestSwingTimer = 0;

  constructor(private readonly host: ThreeStageHost) {
    this.actorsGroup.name = 'musou_actors_3d';
    this.host.scene.add(this.actorsGroup);

    this.vfx = new MusouVfx3D(this.host.scene);
    this.powerDashVfx = new PowerDashVfxPool(this.host.scene);
    this.burstCinematic = new BurstCinematicController(this.host.scene);
    this.armorBreakVfx = new ArmorBreakVfxSystem(this.host.scene);
    this.techniqueMarkVfx = new TechniqueMarkVfxPool(this.host.scene);
    this.comicHitSparks = new ComicHitSparkPool(this.host.scene);
    this.horde = new MusouHordeRenderer(this.host.scene);
    this.destructibles = new DestructiblePropSystem(this.host.scene);
    this.map = new FooshaPlaza3DMap(this.host.scene);
    this.cutsceneDirector = new ThreeCutsceneDirector(this.host.scene, this.loader);

    const tuning = this.host.getTuning();
    this.applyTuning(tuning);
    this.map.setTimeOfDayPalette(this.host.getTimeOfDay());

    if (typeof fetch !== 'undefined') {
      void this.map.tryLoadExternalMapGlb('foosha_plaza_3d');
    }

    this.host.activate();
  }

  public getActorCount(): number {
    return this.actors.size;
  }

  public toggleBossLockOn(world: Readonly<BattleWorldState>): string | null {
    return this.adapter.toggleBossLockOn(world);
  }

  public triggerAirLaunch(world: Readonly<BattleWorldState>): void {
    const player = world.units.find((u) => u.isOnField && u.isAlive && u.isPlayerControlled);
    if (player) {
      this.adapter.triggerAirLaunch(player.instanceId, 8.8);
    }
  }

  public triggerMusouDemoBurst(world: Readonly<BattleWorldState>): {
    launchedGrunts: number;
    shatteredProps: number;
  } {
    const snap = this.lastSnapshot ?? this.adapter.buildSnapshot(world, 1, 1 / 60);
    const origin = snap.playerActor?.position.clone() ?? new THREE.Vector3(0, 0, 0);
    const tuning = this.host.getTuning();

    const launchedGrunts = this.horde.triggerMusouBurst(origin, 9.5);
    const shatteredProps = this.destructibles.triggerRadiusDestruction(origin, 11.0);
    this.vfx.spawnShockwave(origin, '#facc15', 7.5, 0.42);
    this.vfx.spawnImpactSparks(origin.clone().setY(1.2), 10, '#fef08a');
    this.sparkPosScratch.set(origin.x, origin.y + 1.25, origin.z);
    this.comicHitSparks.spawnFromCombatEvent(
      {
        kind: 'HAKI_ARC',
        position: this.sparkPosScratch,
        color: '#a855f7',
        intensity: 1.4
      },
      this.flashEffect
    );
    this.vfx.triggerHitstop(tuning.hitstopTicks);
    this.cameraController.triggerShake(
      snap.playerActor?.aimDir.x ?? 1,
      snap.playerActor?.aimDir.z ?? 0,
      0.55,
      0.32
    );
    this.demoBurstTimer = 0.55;
    if (snap.playerActor) {
      this.adapter.triggerAirLaunch(snap.playerActor.unitId, 7.2);
    }

    return { launchedGrunts, shatteredProps };
  }

  public applyTuning(tuning: ThreeToonTuningConfig): void {
    const lighting = this.host.getLightingState();
    const effectiveTuning =
      this.musouRimBoost > 0.01
        ? { ...tuning, rimIntensity: Math.min(2.2, tuning.rimIntensity + this.musouRimBoost) }
        : tuning;
    this.map.applyTuning(effectiveTuning, lighting.sunDirection, lighting.sunColor, lighting.ambientSky);
    this.horde.applyTuning(effectiveTuning, lighting.sunDirection, lighting.sunColor, lighting.ambientSky);
    this.destructibles.applyTuning(
      effectiveTuning,
      lighting.sunDirection,
      lighting.sunColor,
      lighting.ambientSky
    );
    for (const slot of this.actors.values()) {
      slot.instance.applyTuning(
        effectiveTuning,
        lighting.sunDirection,
        lighting.sunColor,
        lighting.ambientSky
      );
      slot.weapons?.mountSystem.applyTuning(
        effectiveTuning,
        lighting.sunDirection,
        lighting.sunColor,
        lighting.ambientSky
      );
    }
    this.cutsceneDirector.applyTuning(effectiveTuning);
  }

  public applyVisualPolish(config: ThreeStagePolishInput): void {
    this.host.applyVisualPolishConfig(config);
    if (typeof config.flashEffect === 'boolean') {
      this.flashEffect = config.flashEffect;
      this.cutsceneDirector.setFlashEffect(this.flashEffect);
    }
    this.map.setTimeOfDayPalette(this.host.getTimeOfDay());
    this.applyTuning(this.host.getTuning());
  }

  public render(
    world: Readonly<BattleWorldState>,
    alpha: number,
    dtSec: number,
    _viewport: ViewportMetrics,
    musouState?: Readonly<MusouCombatState> | null,
    musouEvents?: readonly MusouTickEvent[]
  ): void {
    if (this.disposed) return;

    const dt = Math.max(0.001, Math.min(0.05, dtSec));
    this.elapsedSec += dt;
    if (this.demoBurstTimer > 0) {
      this.demoBurstTimer = Math.max(0, this.demoBurstTimer - dt);
    }
    if (this.weaponTestSwingTimer > 0) {
      this.weaponTestSwingTimer = Math.max(0, this.weaponTestSwingTimer - dt);
    }
    if (this.powerDashKickTimer > 0) {
      this.powerDashKickTimer = Math.max(0, this.powerDashKickTimer - dt);
    }

    if (this.cutsceneDirector.isActive()) {
      this.actorsGroup.visible = false;
      const cutscenePose = this.cutsceneDirector.update(dt);
      this.cameraController.setCutscenePose(cutscenePose);
      this.cameraController.update(this.host.camera, {
        dt,
        playerPos: this.playerCenterPos.set(0, 0, 0),
        playerAimDir: this.fallbackAimDir,
        playerAltitudeY: 0,
        isDashing: false,
        isSpecialActive: false,
        lockedBossPos: null,
        flashEffect: this.flashEffect
      });
      this.map.update(this.elapsedSec);
      this.host.recordBattleStats(this.horde.getActiveCount(), this.horde.getKoCount());
      this.host.renderFrame(dt);
      return;
    }

    this.actorsGroup.visible = true;
    if (this.cameraController.isInCutscene()) {
      this.cameraController.setCutscenePose(null);
    }

    const snap = this.adapter.buildSnapshot(world, alpha, dt);
    this.lastSnapshot = snap;

    if (snap.shouldTriggerHitstop) {
      this.vfx.triggerHitstop(this.host.getTuning().hitstopTicks);
    }
    if (snap.shakeImpulse) {
      this.cameraController.triggerShake(
        snap.shakeImpulse.dirX,
        snap.shakeImpulse.dirZ,
        snap.shakeImpulse.magnitude
      );
    }

    // Consume deterministic Musou core events before updating VFX & actors
    if (musouEvents && musouEvents.length > 0) {
      this.consumeMusouEvents(musouEvents, musouState ?? null);
    }

    // Strictly read-only observation of battle state & events for mid-combat dialogue banters
    this.banterController.observeFrame(
      musouState ?? null,
      musouEvents ?? [],
      this.horde.getKoCount(),
      dt
    );

    const hitstopPaused = this.vfx.consumeHitstopTick();
    const actorStepDt = hitstopPaused ? 0 : dt;

    // Synchronize active hero/boss actors
    const seenIds = new Set<string>();
    const tuning = this.host.getTuning();
    const lighting = this.host.getLightingState();

    for (const actorState of snap.actors) {
      seenIds.add(actorState.unitId);
      let slot = this.actors.get(actorState.unitId);
      if (!slot) {
        const grey = createGreyboxRigCharacter({
          characterId: actorState.speciesId,
          scale: actorState.scale,
          tuning
        });
        this.actorsGroup.add(grey.root);
        slot = { instance: grey, requestedExternal: false, weapons: null };
        this.actors.set(actorState.unitId, slot);
        if (actorState.isPlayerControlled && !this.inspectedUnitId) {
          this.inspectedUnitId = actorState.unitId;
          this.applyInspectorStateToSlot(slot.instance);
        }

        if (typeof fetch !== 'undefined') {
          slot.requestedExternal = true;
          this.tryUpgradeActorToGlb(actorState.unitId, actorState.speciesId, actorState.scale);
        }
      }

      if (actorState.unitId === this.inspectedUnitId && !this.inspectedUnitId) {
        this.inspectedUnitId = actorState.unitId;
      }

      // Apply PW4 Musou air altitude / burst form / boss groggy height cleanly
      if (musouState && actorState.isPlayerControlled) {
        actorState.altitudeY = Math.max(actorState.altitudeY, musouState.player.yMm / 1000);
        actorState.position.y = Math.max(actorState.position.y, actorState.altitudeY);
        if (musouState.player.activeFormId) {
          actorState.activeFormId = musouState.player.activeFormId;
          if (musouState.player.activeFormId === 'form_luffy_gear5') {
            actorState.auraMode = 'GEAR5';
          } else if (musouState.player.burstActive) {
            actorState.auraMode = 'HAO';
          }
        } else if (musouState.player.burstActive && actorState.auraMode === 'NONE') {
          actorState.auraMode = 'HAO';
        }
      } else if (musouState && actorState.unitId === musouState.boss.bossUnitId) {
        if (musouState.boss.airborneYMm > 0) {
          actorState.position.y += musouState.boss.airborneYMm / 1000;
        }
      }

      slot.instance.root.position.copy(actorState.position);
      slot.instance.root.rotation.y = actorState.yawRad;
      slot.instance.root.scale.setScalar(actorState.scale);
      const isSwingingDemo =
        this.weaponTestSwingTimer > 0 && actorState.unitId === this.inspectedUnitId;
      if (!(this.inspectorClipOverride && actorState.unitId === this.inspectedUnitId)) {
        slot.instance.setState(isSwingingDemo ? 'Combo3' : actorState.animState);
      }
      slot.instance.setAura(
        actorState.auraMode,
        actorState.auraMode === 'NONE' ? 0 : 1 + this.musouRimBoost * 0.5,
        this.elapsedSec
      );
      const effectiveRimTuning =
        this.musouRimBoost > 0.01 && actorState.isPlayerControlled
          ? { ...tuning, rimIntensity: Math.min(2.2, tuning.rimIntensity + this.musouRimBoost) }
          : tuning;
      slot.instance.applyTuning(
        effectiveRimTuning,
        lighting.sunDirection,
        lighting.sunColor,
        lighting.ambientSky
      );
      if (actorStepDt > 0 && !slot.instance.isPaused()) {
        slot.instance.update(actorStepDt);
      }

      this.syncActorWeaponsAndTrails(slot, actorState, actorStepDt, isSwingingDemo);
    }

    for (const [id, slot] of this.actors.entries()) {
      if (!seenIds.has(id)) {
        this.disposeWeaponRigBundle(slot);
        this.actorsGroup.remove(slot.instance.root);
        slot.instance.dispose();
        this.actors.delete(id);
      }
    }

    for (const ev of snap.hitSparkEvents) {
      this.comicHitSparks.spawnFromCombatEvent(ev, this.flashEffect);
    }

    // Apply player/ally attack sweeps against instanced horde & destructibles
    if (snap.attackSweeps.length > 0) {
      const launched = this.horde.applyAttackSweeps(snap.attackSweeps);
      const broken = this.destructibles.applyAttackSweeps(snap.attackSweeps);
      if (launched > 0 || broken > 0) {
        const firstSweep = snap.attackSweeps[0];
        if (firstSweep) {
          this.vfx.spawnShockwave(firstSweep.origin, '#38bdf8', 4.5, 0.28);
          this.vfx.spawnImpactSparks(firstSweep.origin, 5);
          this.comicHitSparks.spawnFromCombatEvent(
            {
              kind: firstSweep.isSpecial ? 'HAKI_ARC' : 'CROSS_SLASH',
              position: firstSweep.origin,
              dir: firstSweep.dir,
              color: firstSweep.isSpecial ? '#ef4444' : '#38bdf8',
              intensity: 1.25
            },
            this.flashEffect
          );
        }
      }
    }

    const playerPos = snap.playerActor?.position ?? this.playerCenterPos.set(0, 0, 0);
    if (!hitstopPaused) {
      this.horde.update(dt, playerPos, this.elapsedSec);
      this.destructibles.update(dt);
      this.map.update(this.elapsedSec);
    }
    this.comicHitSparks.update(dt, this.host.camera.position);

    // Update PW4 3D VFX Pools (zero per-frame allocations)
    const burstFrame = this.burstCinematic.update(
      dt,
      playerPos,
      Boolean(musouState?.player.burstActive),
      musouState?.player.actionType ?? 'POWER',
      musouState?.player.activeFormId ?? null,
      this.flashEffect
    );
    this.musouRimBoost = burstFrame.rimBoost;
    this.host.setTemporaryBloomBoost(burstFrame.bloomBoost);

    this.powerDashVfx.update(dt, this.flashEffect);

    const bossActor =
      snap.lockedBossActor ??
      snap.actors.find((a) => a.team === 'OMEGA' && a.isBossUnit) ??
      snap.actors.find((a) => a.team === 'OMEGA') ??
      null;
    if (bossActor) {
      this.bossPosScratch.copy(bossActor.position);
    } else if (musouState) {
      this.bossPosScratch.set(
        musouState.boss.xMm / 1000,
        musouState.boss.airborneYMm / 1000,
        musouState.boss.zMm / 1000
      );
    } else {
      this.bossPosScratch.set(1.2, 0, 0);
    }
    const bossScale = bossActor?.scale ?? 1.45;
    const bossArmorRatio = musouState
      ? musouState.boss.armorGauge / Math.max(1, musouState.boss.maxArmor)
      : 1;
    this.armorBreakVfx.update(
      dt,
      this.bossPosScratch,
      bossScale,
      musouState?.boss.armorState ?? 'INTACT',
      bossArmorRatio,
      this.flashEffect
    );
    this.techniqueMarkVfx.syncBossMark(
      this.bossPosScratch,
      bossScale,
      musouState?.boss.markedTicks ?? 0,
      musouState?.boss.markedStacks ?? 0
    );
    this.techniqueMarkVfx.update(dt, this.flashEffect);

    // Unarmed fallback ribbon (when character has no mounted weapon trails)
    const playerSlot = snap.playerActor ? this.actors.get(snap.playerActor.unitId) : undefined;
    if (snap.playerActor && playerSlot && !playerSlot.weapons) {
      this.vfx.updateDashEffects(
        dt,
        snap.playerActor.isDashing || this.demoBurstTimer > 0.25,
        snap.playerActor.position,
        snap.playerActor.aimDir
      );
      const ribbonActive = playerSlot.instance.socketBinder.getTrailSegmentWorld(
        'RightHand',
        1.15,
        this.ribbonInnerPos,
        this.ribbonOuterPos
      );
      const isSwinging = snap.playerActor.isAttacking || this.demoBurstTimer > 0.2;
      const trailColor = snap.playerActor.auraMode === 'HAO' ? '#ef4444' : '#38bdf8';
      if (ribbonActive) {
        this.vfx.updateSlashRibbonSegment(
          isSwinging,
          this.ribbonInnerPos,
          this.ribbonOuterPos,
          trailColor
        );
      } else {
        playerSlot.instance.getBoneWorldPosition('RightHand', this.rightHandPos);
        this.playerCenterPos.copy(snap.playerActor.position);
        this.playerCenterPos.y += 1.05;
        this.vfx.updateSlashRibbon(
          isSwinging,
          this.rightHandPos,
          this.playerCenterPos,
          trailColor
        );
      }
    } else if (snap.playerActor && playerSlot) {
      this.vfx.updateDashEffects(
        dt,
        snap.playerActor.isDashing || this.demoBurstTimer > 0.25,
        snap.playerActor.position,
        snap.playerActor.aimDir
      );
    }
    this.vfx.update(dt);

    // Dynamic 3rd-person Musou camera (including Sky altitude framing, Power Dash FOV kick, & Burst orbit)
    this.cameraController.update(this.host.camera, {
      dt,
      playerPos,
      playerAimDir: snap.playerActor?.aimDir ?? this.fallbackAimDir,
      playerAltitudeY: snap.playerActor?.altitudeY ?? 0,
      isDashing: (snap.playerActor?.isDashing ?? false) || this.powerDashKickTimer > 0,
      powerDashFovKick: this.powerDashKickTimer > 0,
      burstOrbitProgress: burstFrame.cinematicActive ? burstFrame.orbitProgress01 : 0,
      isSpecialActive: (snap.playerActor?.isSpecialActive ?? false) || this.demoBurstTimer > 0,
      lockedBossPos: snap.lockedBossActor?.position ?? null,
      lockedBossScale: snap.lockedBossActor?.scale ?? 1,
      flashEffect: this.flashEffect
    });

    this.host.updateSpeedlines(
      dt,
      Math.max(
        snap.playerActor?.speedNormalized ?? 0,
        this.powerDashKickTimer > 0 ? 1 : 0
      ),
      (snap.playerActor?.isSpecialActive ?? false) ||
        this.demoBurstTimer > 0 ||
        burstFrame.cinematicActive
    );
    this.host.recordBattleStats(this.horde.getActiveCount(), this.horde.getKoCount());
    this.host.renderFrame(dt);
  }

  private consumeMusouEvents(
    events: readonly MusouTickEvent[],
    musouState: Readonly<MusouCombatState> | null
  ): void {
    for (const ev of events) {
      if (ev.kind === 'POWER_DASH_CANCEL') {
        this.musouOriginScratch.set(ev.xMm / 1000, ev.yMm / 1000, ev.zMm / 1000);
        this.musouDirScratch.set(ev.dirXPermille / 1000, 0, ev.dirZPermille / 1000).normalize();
        this.powerDashVfx.triggerPowerDash(
          this.musouOriginScratch,
          this.musouDirScratch,
          ev.actionType,
          ev.isAirborne,
          this.flashEffect
        );
        this.powerDashKickTimer = 0.24;
      } else if (ev.kind === 'SKY_AIR_HOP') {
        this.musouOriginScratch.set(ev.xMm / 1000, ev.yMm / 1000, ev.zMm / 1000);
        this.powerDashVfx.triggerSkyHoverRing(this.musouOriginScratch, this.flashEffect);
      } else if (ev.kind === 'BURST_ACTIVATE') {
        this.musouOriginScratch.set(ev.xMm / 1000, ev.yMm / 1000, ev.zMm / 1000);
        this.burstCinematic.triggerBurst(
          this.musouOriginScratch,
          ev.actionType,
          ev.awakenedFormId,
          this.flashEffect
        );
        this.horde.triggerFullForceBurstKnockback(
          this.musouOriginScratch,
          ev.shockwaveRadiusMm / 1000
        );
        this.destructibles.triggerRadiusDestruction(
          this.musouOriginScratch,
          ev.shockwaveRadiusMm / 1000
        );
        this.armorBreakVfx.triggerBurstBanner(ev.actionType, this.flashEffect);
        this.cameraController.triggerShake(1, 0, this.flashEffect ? 0.65 : 0.25, 0.3);
      } else if (ev.kind === 'TECH_MARK_DETONATED') {
        this.musouOriginScratch.set(ev.xMm / 1000, ev.yMm / 1000, ev.zMm / 1000);
        this.techniqueMarkVfx.triggerDetonation(this.musouOriginScratch, this.flashEffect);
        this.horde.pullGruntsToward(this.musouOriginScratch, ev.pullRadiusMm / 1000);
        this.comicHitSparks.spawnHakiArc(this.musouOriginScratch, '#a855f7', this.flashEffect);
      } else if (ev.kind === 'BOSS_ARMOR_BREAK') {
        this.musouOriginScratch.set(ev.xMm / 1000, ev.yMm / 1000, ev.zMm / 1000);
        this.armorBreakVfx.triggerArmorBreak(
          this.musouOriginScratch,
          1.45,
          this.flashEffect
        );
        this.vfx.triggerHitstop(ev.hitstopTicks);
        this.cameraController.triggerShake(1, 0.4, this.flashEffect ? 0.85 : 0.3, 0.36);
        this.comicHitSparks.spawnFromCombatEvent(
          {
            kind: 'HAKI_ARC',
            position: this.musouOriginScratch,
            color: '#facc15',
            intensity: 1.5
          },
          this.flashEffect
        );
      } else if (ev.kind === 'BOSS_GROGGY_RECOVERY') {
        this.musouOriginScratch.set(ev.xMm / 1000, ev.yMm / 1000, ev.zMm / 1000);
        this.vfx.spawnShockwave(this.musouOriginScratch, '#ef4444', 6.0, 0.36);
      } else if (ev.kind === 'DAMAGE_POPUP') {
        this.armorBreakVfx.spawnDamagePopup(
          ev.xMm / 1000,
          ev.yMm / 1000,
          ev.zMm / 1000,
          ev.value,
          ev.style
        );
      } else if (ev.kind === 'ATTACK_SWING') {
        this.musouOriginScratch.set(ev.xMm / 1000, 1.0, ev.zMm / 1000);
        if (musouState) {
          this.musouDirScratch.set(
            musouState.player.aimXPermille / 1000,
            0,
            musouState.player.aimZPermille / 1000
          );
        } else {
          this.musouDirScratch.set(1, 0, 0);
        }
        const singleSweep = [
          {
            sourceUnitId: musouState?.player.unitId ?? 'alpha_1',
            team: 'ALPHA' as const,
            origin: this.musouOriginScratch,
            dir: this.musouDirScratch,
            radiusMeters: Math.max(2.2, ev.radiusMm / 1000),
            power: ev.isSpecial ? 220 : 120,
            isSpecial: ev.isSpecial,
            isAirLaunch: ev.isAirLaunch
          }
        ];
        const hitGrunts = this.horde.applyAttackSweeps(singleSweep);
        this.destructibles.applyAttackSweeps(singleSweep);
        if (hitGrunts > 0) {
          this.comicHitSparks.spawnFromCombatEvent(
            {
              kind: ev.isSpecial ? 'CROSS_SLASH' : 'STARBURST',
              position: this.musouOriginScratch,
              dir: this.musouDirScratch,
              color: ev.isSpecial ? '#facc15' : '#38bdf8',
              intensity: 1.25
            },
            this.flashEffect
          );
        }
      }
    }
  }

  public getMusouBannerState(): MusouBannerState {
    return this.armorBreakVfx.getBannerState();
  }

  public getProjectedDamagePopups(
    viewport: ViewportMetrics
  ): readonly ProjectedDamagePopup[] {
    return this.armorBreakVfx.getProjectedPopups(this.host.camera, viewport);
  }

  private async tryUpgradeActorToGlb(
    unitId: string,
    speciesId: string,
    scale: number
  ): Promise<void> {
    const loaded = await this.loader.loadCharacter({
      characterId: speciesId,
      scale,
      tuning: this.host.getTuning()
    });
    if (this.disposed) {
      loaded.dispose();
      return;
    }
    if (loaded.source !== 'GLB_EXTERNAL') {
      loaded.dispose();
      return;
    }
    const current = this.actors.get(unitId);
    if (!current) {
      loaded.dispose();
      return;
    }
    this.disposeWeaponRigBundle(current);
    this.actorsGroup.remove(current.instance.root);
    current.instance.dispose();
    current.instance = loaded;
    this.actorsGroup.add(loaded.root);
    if (unitId === this.inspectedUnitId || !this.inspectedUnitId) {
      this.inspectedUnitId = unitId;
      this.applyInspectorStateToSlot(loaded);
    }
  }

  private resolveDesiredLoadout(
    unitId: string,
    speciesId: string,
    activeFormId: string | null
  ): CharacterWeaponLoadout | null {
    if (unitId === this.inspectedUnitId && this.weaponTunerLoadoutOverride) {
      return getCharacterWeaponLoadoutById(this.weaponTunerLoadoutOverride);
    }
    return resolveCharacterWeaponLoadout(speciesId, activeFormId);
  }

  private createWeaponRigBundle(
    instance: CharacterInstance3D,
    loadout: CharacterWeaponLoadout
  ): WeaponRigBundle {
    const mountSystem = new WeaponSocketMountSystem(instance.socketBinder);
    mountSystem.mountLoadout(loadout, this.host.getTuning());

    const trails: Partial<Record<WeaponSlotKey, ToonWeaponTrailMesh>> = {};
    const slotOrder: Record<WeaponSlotKey, number> = {
      right: 20,
      left: 21,
      mouth: 22
    };
    for (const slotKey of mountSystem.getMountedSlotKeys()) {
      const mounted = mountSystem.getMountedSlot(slotKey);
      if (!mounted) continue;
      trails[slotKey] = new ToonWeaponTrailMesh(this.host.scene, mounted.spec.trailTheme, {
        renderOrder: slotOrder[slotKey]
      });
    }

    return {
      loadoutId: loadout.loadoutId,
      loadout,
      mountSystem,
      trails
    };
  }

  private disposeWeaponRigBundle(slot: ActorSlot): void {
    if (!slot.weapons) return;
    for (const trail of Object.values(slot.weapons.trails)) {
      trail?.dispose();
    }
    slot.weapons.mountSystem.dispose();
    slot.weapons = null;
  }

  private syncActorWeaponsAndTrails(
    slot: ActorSlot,
    actorState: Battle3DFrameSnapshot['actors'][number],
    stepDt: number,
    isSwingingDemo: boolean
  ): void {
    const desiredLoadout = this.resolveDesiredLoadout(
      actorState.unitId,
      actorState.speciesId,
      actorState.activeFormId
    );

    if (desiredLoadout?.loadoutId !== slot.weapons?.loadoutId) {
      this.disposeWeaponRigBundle(slot);
      if (desiredLoadout) {
        slot.weapons = this.createWeaponRigBundle(slot.instance, desiredLoadout);
      }
    }

    const bundle = slot.weapons;
    if (!bundle) return;

    const dt = stepDt > 0 ? stepDt : 1 / 60;
    const combatActive = isSwingingDemo || actorState.isAttacking || actorState.isSpecialActive;
    bundle.mountSystem.update(
      dt,
      isSwingingDemo ? 'Combo3' : actorState.animState,
      this.elapsedSec,
      combatActive,
      actorState.auraMode === 'HAO' || bundle.loadout.kingOfHellAura ? 'HAO' : undefined
    );

    const rules = resolveTrailWindowsForState(
      bundle.loadout,
      isSwingingDemo ? 'Combo3' : actorState.animState
    );
    const clipProg = isSwingingDemo
      ? Math.max(0.18, Math.min(0.85, 1 - this.weaponTestSwingTimer / 0.75))
      : actorState.normalizedClipProgress;

    for (const slotKey of ['right', 'left', 'mouth'] as const) {
      const trail = bundle.trails[slotKey];
      if (!trail) continue;

      const hasAnchors = bundle.mountSystem.getWeaponTrailWorldAnchors(
        slotKey,
        this.weaponBaseScratch,
        this.weaponTipScratch
      );
      const inWindow =
        isSwingingDemo ||
        isProgressInTrailWindow(clipProg, rules, slotKey) ||
        (actorState.isAttacking && rules.length === 0 && slotKey === 'right');

      if (hasAnchors) {
        trail.update(
          dt,
          inWindow && !bundle.mountSystem.isHolstered(),
          this.weaponBaseScratch,
          this.weaponTipScratch,
          this.elapsedSec,
          this.flashEffect
        );
      }
    }

    if (
      bundle.loadout.hakiArcSlot &&
      (actorState.isSpecialActive || isSwingingDemo) &&
      Math.floor(this.elapsedSec * 12) !== Math.floor((this.elapsedSec - dt) * 12)
    ) {
      if (
        bundle.mountSystem.getHakiArcWorldPosition(
          bundle.loadout.hakiArcSlot,
          this.sparkPosScratch
        )
      ) {
        this.comicHitSparks.spawnHakiArc(
          this.sparkPosScratch,
          '#a855f7',
          this.flashEffect
        );
      }
    }
  }

  private resolveInspectedSlot(): { unitId: string; instance: CharacterInstance3D } | null {
    if (this.inspectedUnitId) {
      const slot = this.actors.get(this.inspectedUnitId);
      if (slot) return { unitId: this.inspectedUnitId, instance: slot.instance };
    }
    const playerId = this.lastSnapshot?.playerActor?.unitId;
    if (playerId) {
      const slot = this.actors.get(playerId);
      if (slot) {
        this.inspectedUnitId = playerId;
        return { unitId: playerId, instance: slot.instance };
      }
    }
    const first = this.actors.entries().next();
    if (!first.done) {
      const [uid, slot] = first.value;
      this.inspectedUnitId = uid;
      return { unitId: uid, instance: slot.instance };
    }
    return null;
  }

  private applyInspectorStateToSlot(instance: CharacterInstance3D): void {
    instance.setForwardOffset(this.inspectorForwardFlipped ? Math.PI : 0);
    instance.setRootMotionXZLocked(this.inspectorRootLockXZ);
    instance.setSocketGuidesVisible(this.inspectorGuidesVisible);
    instance.setUserScaleMultiplier(this.inspectorScaleMultiplier);
    instance.setPaused(this.inspectorPaused);
    if (this.inspectorClipOverride) {
      instance.playClipByName(this.inspectorClipOverride);
    }
  }

  public getInspectorSnapshot(): ThreeInspectorSnapshot {
    const resolved = this.resolveInspectedSlot();
    if (!resolved) {
      return {
        active: false,
        unitId: null,
        characterId: null,
        source: null,
        availableClips: [],
        activeClip: 'Idle',
        paused: this.inspectorPaused,
        forwardFlipped: this.inspectorForwardFlipped,
        lockRootMotionXZ: this.inspectorRootLockXZ,
        socketGuidesVisible: this.inspectorGuidesVisible,
        scaleMultiplier: this.inspectorScaleMultiplier,
        boundSockets: []
      };
    }
    const inst = resolved.instance;
    return {
      active: true,
      unitId: resolved.unitId,
      characterId: inst.characterId,
      source: inst.source,
      availableClips: [...inst.availableClipNames],
      activeClip: inst.activeClipName,
      paused: inst.isPaused(),
      forwardFlipped: Math.abs(inst.getForwardOffset()) > 0.5,
      lockRootMotionXZ: inst.isRootMotionXZLocked(),
      socketGuidesVisible: inst.areSocketGuidesVisible(),
      scaleMultiplier: inst.getUserScaleMultiplier(),
      boundSockets: inst.socketBinder.getBoundSocketNames()
    };
  }

  public selectInspectorClip(clipName: string): boolean {
    const clean = clipName.trim();
    this.inspectorClipOverride = clean.length > 0 ? clean : null;
    const resolved = this.resolveInspectedSlot();
    if (!resolved || !this.inspectorClipOverride) return Boolean(resolved);
    return resolved.instance.playClipByName(this.inspectorClipOverride);
  }

  public setInspectorPaused(paused: boolean): void {
    this.inspectorPaused = paused;
    this.resolveInspectedSlot()?.instance.setPaused(paused);
  }

  public setInspectorForwardFlipped(flipped: boolean): void {
    this.inspectorForwardFlipped = flipped;
    this.resolveInspectedSlot()?.instance.setForwardOffset(flipped ? Math.PI : 0);
  }

  public setInspectorRootMotionLock(locked: boolean): void {
    this.inspectorRootLockXZ = locked;
    this.resolveInspectedSlot()?.instance.setRootMotionXZLocked(locked);
  }

  public setInspectorSocketGuides(visible: boolean): void {
    this.inspectorGuidesVisible = visible;
    this.resolveInspectedSlot()?.instance.setSocketGuidesVisible(visible);
  }

  public setInspectorScaleMultiplier(mult: number): void {
    this.inspectorScaleMultiplier = Math.max(0.4, Math.min(3.0, mult));
    this.resolveInspectedSlot()?.instance.setUserScaleMultiplier(this.inspectorScaleMultiplier);
  }

  public exportInspectorAnimJson(): string {
    const resolved = this.resolveInspectedSlot();
    if (resolved) {
      return resolved.instance.exportAnimJsonConfig();
    }
    return JSON.stringify(
      {
        targetHeight: Number((1.7 * this.inspectorScaleMultiplier).toFixed(3)),
        modelForwardOffset: this.inspectorForwardFlipped ? Number(Math.PI.toFixed(4)) : 0,
        outlineThickness: this.host.getTuning().outlineWidth,
        shadowColorShift: this.host.getTuning().shadowShiftStrength,
        rimIntensity: this.host.getTuning().rimIntensity,
        lockRootMotionXZ: this.inspectorRootLockXZ
      },
      null,
      2
    );
  }

  public getCounterSnapshot(): MusouCounterSnapshot {
    const lockedId = this.adapter.getLockedBossId();
    const lockedActor = lockedId
      ? this.lastSnapshot?.actors.find((a) => a.unitId === lockedId) ?? null
      : null;
    return {
      koCount: this.horde.getKoCount(),
      hitComboCount: this.horde.getHitComboCount(),
      hitComboTimer: this.horde.getHitComboTimer(),
      lockedBossUnitId: lockedId,
      lockedBossName: lockedActor?.name ?? null,
      destructiblesRemaining: this.destructibles.getRemainingCount(),
      destructiblesTotal: this.destructibles.getTotalCount()
    };
  }

  public getTelemetry(): ThreeTelemetrySnapshot {
    return this.host.getTelemetrySnapshot();
  }

  public getWeaponTunerSnapshot(): ThreeWeaponTunerSnapshot {
    const resolved = this.resolveInspectedSlot();
    const slot = resolved ? this.actors.get(resolved.unitId) : undefined;
    const bundle = slot?.weapons;
    const loadoutId =
      this.weaponTunerLoadoutOverride ?? bundle?.loadoutId ?? 'zoro_base';

    if (bundle) {
      const tunerState = bundle.mountSystem.getSlotTunerState(this.weaponTunerSlot);
      if (tunerState) {
        return {
          active: true,
          loadoutId,
          slotKey: this.weaponTunerSlot,
          enableHolsterSwap: bundle.mountSystem.isHolsterSwapEnabled(),
          holstered: bundle.mountSystem.isHolstered(),
          weaponLabel: tunerState.label,
          bone: tunerState.bone,
          position: tunerState.position,
          rotationDeg: tunerState.rotationDeg,
          scale: tunerState.scale,
          trailBaseY: tunerState.baseLocalY,
          trailTipY: tunerState.tipLocalY
        };
      }
    }

    const fallbackLoadout = getCharacterWeaponLoadoutById(loadoutId);
    const fallbackWeaponId =
      fallbackLoadout?.slots[this.weaponTunerSlot === 'holster' ? 'right' : this.weaponTunerSlot] ??
      fallbackLoadout?.slots.right ??
      'zoro_enma';
    const spec = getWeapon3DSpec(fallbackWeaponId);
    const tf =
      this.weaponTunerSlot === 'holster' && spec?.holsterSocket
        ? spec.holsterSocket
        : spec?.combatSocket;
    return {
      active: Boolean(resolved),
      loadoutId,
      slotKey: this.weaponTunerSlot,
      enableHolsterSwap: fallbackLoadout?.enableHolsterSwap ?? true,
      holstered: false,
      weaponLabel: spec?.label ?? fallbackWeaponId,
      bone: tf?.bone ?? 'mixamorigRightHand',
      position: tf ? [...tf.position] : [0, 0, 0],
      rotationDeg: tf ? [...tf.rotationDeg] : [0, 0, 0],
      scale: tf?.scale ?? 1,
      trailBaseY: spec?.trailAnchors.baseLocal[1] ?? 0.15,
      trailTipY: spec?.trailAnchors.tipLocal[1] ?? 1.15
    };
  }

  public setWeaponTunerCharacter(loadoutId: string): void {
    const clean = loadoutId.trim();
    this.weaponTunerLoadoutOverride = clean.length > 0 ? clean : null;
    const resolved = this.resolveInspectedSlot();
    const slot = resolved ? this.actors.get(resolved.unitId) : undefined;
    if (slot) {
      this.disposeWeaponRigBundle(slot);
      const nextLoadout = clean ? getCharacterWeaponLoadoutById(clean) : null;
      if (nextLoadout) {
        slot.weapons = this.createWeaponRigBundle(slot.instance, nextLoadout);
      }
    }
  }

  public setWeaponTunerSlot(slotKey: WeaponTunerSlotKey): void {
    this.weaponTunerSlot = slotKey;
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
    const resolved = this.resolveInspectedSlot();
    const bundle = resolved ? this.actors.get(resolved.unitId)?.weapons : null;
    bundle?.mountSystem.setSlotTransformOverride(this.weaponTunerSlot, partial);
  }

  public updateWeaponTrailLengths(baseY: number, tipY: number): void {
    const resolved = this.resolveInspectedSlot();
    const bundle = resolved ? this.actors.get(resolved.unitId)?.weapons : null;
    if (!bundle) return;
    const key: WeaponSlotKey =
      this.weaponTunerSlot === 'holster' ? 'right' : this.weaponTunerSlot;
    bundle.mountSystem.setSlotTrailLengths(key, baseY, tipY);
  }

  public setWeaponHolsterSwap(enabled: boolean): void {
    const resolved = this.resolveInspectedSlot();
    const bundle = resolved ? this.actors.get(resolved.unitId)?.weapons : null;
    bundle?.mountSystem.setEnableHolsterSwap(enabled);
  }

  public triggerWeaponTestSwing(): void {
    this.weaponTestSwingTimer = 0.75;
    const resolved = this.resolveInspectedSlot();
    const bundle = resolved ? this.actors.get(resolved.unitId)?.weapons : null;
    if (bundle) {
      bundle.mountSystem.setHolstered(false);
    }
  }

  public triggerHitSparkTest(): void {
    const resolved = this.resolveInspectedSlot();
    const slot = resolved ? this.actors.get(resolved.unitId) : undefined;
    if (
      slot?.weapons?.mountSystem.getWeaponTrailWorldAnchors(
        'right',
        this.weaponBaseScratch,
        this.sparkPosScratch
      )
    ) {
      // sparkPosScratch populated at weapon tip
    } else if (resolved) {
      this.sparkPosScratch.copy(resolved.instance.root.position).setY(1.3);
    } else {
      this.sparkPosScratch.set(0, 1.3, 0);
    }
    this.sparkDirScratch.set(1, 0.25, 0.35).normalize();
    this.comicHitSparks.spawnFromCombatEvent(
      {
        kind: 'CROSS_SLASH',
        position: this.sparkPosScratch,
        dir: this.sparkDirScratch,
        color: '#38bdf8',
        intensity: 1.4
      },
      this.flashEffect
    );
    this.comicHitSparks.spawnFromCombatEvent(
      {
        kind: 'HAKI_ARC',
        position: this.sparkPosScratch,
        color: '#a855f7',
        intensity: 1.35
      },
      this.flashEffect
    );
  }

  public exportWeapons3dJson(): string {
    const resolved = this.resolveInspectedSlot();
    const bundle = resolved ? this.actors.get(resolved.unitId)?.weapons : null;
    if (bundle) {
      return bundle.mountSystem.exportModifiedWeapons3dJson();
    }
    const tempBinder = resolved?.instance.socketBinder;
    if (tempBinder) {
      const tmp = new WeaponSocketMountSystem(tempBinder);
      const out = tmp.exportModifiedWeapons3dJson();
      tmp.dispose();
      return out;
    }
    return '{}';
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const slot of this.actors.values()) {
      this.disposeWeaponRigBundle(slot);
      this.actorsGroup.remove(slot.instance.root);
      slot.instance.dispose();
    }
    this.actors.clear();
    this.actorsGroup.parent?.remove(this.actorsGroup);

    this.cutsceneDirector.dispose();
    this.banterController.resetForBattle();
    this.comicHitSparks.dispose();
    this.powerDashVfx.dispose();
    this.burstCinematic.dispose();
    this.armorBreakVfx.dispose();
    this.techniqueMarkVfx.dispose();
    this.vfx.dispose();
    this.horde.dispose();
    this.destructibles.dispose();
    this.map.dispose();
    this.loader.dispose();
    this.host.deactivate();
  }
}
