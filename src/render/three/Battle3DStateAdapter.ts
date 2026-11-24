import * as THREE from 'three';
import type { BattleWorldState, UnitRuntimeState } from '../../core/types/battleState';
import {
  HakiAuraMode,
  MusouAnimState,
  project2DTo3D,
  WORLD_SCALE_2D_TO_3D
} from './threeTypes';

import type { ComicSparkSpawnInput } from './vfx/ComicHitSparkPool';

export interface Actor3DVisualState {
  unitId: string;
  speciesId: string;
  activeFormId: string | null;
  name: string;
  team: 'ALPHA' | 'OMEGA';
  isPlayerControlled: boolean;
  isBossUnit: boolean;
  position: THREE.Vector3;
  aimDir: THREE.Vector3;
  yawRad: number;
  scale: number;
  altitudeY: number;
  animState: MusouAnimState;
  normalizedClipProgress: number;
  auraMode: HakiAuraMode;
  speedNormalized: number;
  isDashing: boolean;
  isAttacking: boolean;
  isSpecialActive: boolean;
  hpRatio: number;
  isAlive: boolean;
}

export interface AttackSweepVolume3D {
  sourceUnitId: string;
  team: 'ALPHA' | 'OMEGA';
  origin: THREE.Vector3;
  dir: THREE.Vector3;
  radiusMeters: number;
  power: number;
  isSpecial: boolean;
  isAirLaunch: boolean;
}

export interface Battle3DFrameSnapshot {
  actors: Actor3DVisualState[];
  playerActor: Actor3DVisualState | null;
  lockedBossActor: Actor3DVisualState | null;
  attackSweeps: AttackSweepVolume3D[];
  hitSparkEvents: ComicSparkSpawnInput[];
  shouldTriggerHitstop: boolean;
  shakeImpulse: { dirX: number; dirZ: number; magnitude: number } | null;
}

interface InternalActorTrack {
  altitudeY: number;
  verticalVel: number;
  comboStep: number;
  comboResetTimer: number;
  lastMeleeArcId: string | null;
  hitReactTimer: number;
  lastHp: number;
  yawRad: number;
}

const GRAVITY_3D = 18.5;

function lerpAngle(current: number, target: number, factor: number): number {
  let diff = target - current;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return current + diff * factor;
}

function classifyHakiAura(
  unit: UnitRuntimeState,
  isAttacking: boolean,
  isSpecialActive: boolean
): HakiAuraMode {
  const formLower = (unit.activeFormId ?? '').toLowerCase();
  if (
    formLower.includes('gear5') ||
    formLower.includes('nika') ||
    unit.hagoromoColor === 'white'
  ) {
    return 'GEAR5';
  }
  if (
    unit.haki.conqueror >= 1 &&
    (isSpecialActive || unit.overdriveTimeRemainingSec > 0 || unit.hagoromoColor === 'black')
  ) {
    return 'HAO';
  }
  if (unit.haki.armament >= 1 && (isAttacking || unit.dodgeActiveTimer > 0)) {
    return 'BUSO';
  }
  return 'NONE';
}

function resolveActorAnimState(
  unit: UnitRuntimeState,
  track: InternalActorTrack,
  speedNorm: number,
  activeMeleeMoveId: string | null,
  hasActiveBeam: boolean
): { animState: MusouAnimState; isSpecialActive: boolean; isAttacking: boolean } {
  if (!unit.isAlive) {
    return { animState: 'Down', isSpecialActive: false, isAttacking: false };
  }
  if (track.hitReactTimer > 0 || unit.exhaustionTimer > 0) {
    return {
      animState: track.altitudeY > 0.35 ? 'Knockback' : 'Hit',
      isSpecialActive: false,
      isAttacking: false
    };
  }
  if (unit.justDodgeBuffTimer > 0.25) {
    return { animState: 'Parry', isSpecialActive: false, isAttacking: false };
  }
  if (unit.dodgeActiveTimer > 0) {
    return { animState: 'Dash', isSpecialActive: false, isAttacking: false };
  }
  if (hasActiveBeam) {
    return { animState: 'SpecialRelease', isSpecialActive: true, isAttacking: true };
  }
  if (unit.windupMoveId) {
    const moveLower = unit.windupMoveId.toLowerCase();
    const isSpecial =
      moveLower.includes('ult') ||
      moveLower.includes('bajrang') ||
      moveLower.includes('kong') ||
      moveLower.includes('special') ||
      moveLower.includes('raimei') ||
      moveLower.includes('boro');
    return {
      animState: isSpecial ? 'SpecialWindup' : 'Combo1',
      isSpecialActive: isSpecial,
      isAttacking: false
    };
  }
  if (activeMeleeMoveId) {
    const lower = activeMeleeMoveId.toLowerCase();
    const isSpecial =
      lower.includes('ult') ||
      lower.includes('bajrang') ||
      lower.includes('conqueror') ||
      lower.includes('special');
    if (isSpecial) {
      return { animState: 'SpecialRelease', isSpecialActive: true, isAttacking: true };
    }
    if (track.altitudeY > 0.18) {
      const step = track.comboStep % 3;
      const anim: MusouAnimState =
        step === 0 ? 'AirCombo1' : step === 1 ? 'AirCombo2' : 'AirSlam';
      return { animState: anim, isSpecialActive: false, isAttacking: true };
    }
    const step = track.comboStep % 4;
    const anim: MusouAnimState =
      step === 0 ? 'Combo1' : step === 1 ? 'Combo2' : step === 2 ? 'Combo3' : 'Combo4';
    return { animState: anim, isSpecialActive: false, isAttacking: true };
  }
  if (track.altitudeY > 0.18) {
    return { animState: 'AirLaunch', isSpecialActive: false, isAttacking: false };
  }
  if (speedNorm > 0.08) {
    return { animState: 'Run', isSpecialActive: false, isAttacking: false };
  }
  return { animState: 'Idle', isSpecialActive: false, isAttacking: false };
}

/**
 * Unidirectional Read-Only bridge converting deterministic 2D core BattleWorldState
 * into 3D Musou coordinates (2D x,y -> 3D x,z + virtual jump altitude y) without altering core state.
 */
export class Battle3DStateAdapter {
  private readonly tracks = new Map<string, InternalActorTrack>();
  private readonly seenVfxIds = new Set<string>();
  private lockedBossId: string | null = null;
  private prevWorldHitstopTimer = 0;
  private prevShakeTimer = 0;

  public reset(): void {
    this.tracks.clear();
    this.seenVfxIds.clear();
    this.lockedBossId = null;
    this.prevWorldHitstopTimer = 0;
    this.prevShakeTimer = 0;
  }

  public getLockedBossId(): string | null {
    return this.lockedBossId;
  }

  public toggleBossLockOn(world: Readonly<BattleWorldState>): string | null {
    const aliveBosses = world.units.filter(
      (u) => u.isOnField && u.isAlive && u.isBossUnit && u.team === 'OMEGA'
    );
    const candidates =
      aliveBosses.length > 0
        ? aliveBosses
        : world.units.filter((u) => u.isOnField && u.isAlive && u.team === 'OMEGA');

    if (candidates.length === 0) {
      this.lockedBossId = null;
      return null;
    }

    if (this.lockedBossId) {
      const idx = candidates.findIndex((c) => c.instanceId === this.lockedBossId);
      if (idx >= 0 && idx + 1 < candidates.length) {
        this.lockedBossId = candidates[idx + 1]?.instanceId ?? null;
      } else {
        this.lockedBossId = null;
      }
    } else {
      this.lockedBossId = candidates[0]?.instanceId ?? null;
    }
    return this.lockedBossId;
  }

  public triggerAirLaunch(unitId: string, impulseY = 8.4): void {
    const track = this.tracks.get(unitId);
    if (!track) return;
    track.verticalVel = Math.max(track.verticalVel, impulseY);
    track.altitudeY = Math.max(track.altitudeY, 0.15);
  }

  public buildSnapshot(
    world: Readonly<BattleWorldState>,
    alpha: number,
    dtSec: number
  ): Battle3DFrameSnapshot {
    const dt = Math.max(0.001, Math.min(0.05, dtSec));
    const clampedAlpha = Math.max(0, Math.min(1, alpha));
    const actors: Actor3DVisualState[] = [];
    const attackSweeps: AttackSweepVolume3D[] = [];
    let playerActor: Actor3DVisualState | null = null;
    let lockedBossActor: Actor3DVisualState | null = null;

    // Validate existing boss lock-on
    if (this.lockedBossId) {
      const stillValid = world.units.some(
        (u) => u.instanceId === this.lockedBossId && u.isOnField && u.isAlive
      );
      if (!stillValid) {
        this.lockedBossId = null;
      }
    }

    for (const arc of world.meleeArcs) {
      if (arc.finished) continue;
      const p3 = project2DTo3D(arc.origin.x, arc.origin.y, 0);
      const lower = arc.moveId.toLowerCase();
      attackSweeps.push({
        sourceUnitId: arc.ownerUnitId,
        team: arc.team,
        origin: new THREE.Vector3(p3.x, 1.0, p3.z),
        dir: new THREE.Vector3(arc.dir.x, 0, arc.dir.y).normalize(),
        radiusMeters: Math.max(1.8, arc.radiusPx * WORLD_SCALE_2D_TO_3D * 1.25),
        power: arc.currentPower,
        isSpecial: lower.includes('ult') || lower.includes('special') || lower.includes('kong'),
        isAirLaunch: lower.includes('launch') || lower.includes('upper') || lower.includes('kick')
      });
    }

    for (const unit of world.units) {
      if (!unit.isOnField) continue;

      let track = this.tracks.get(unit.instanceId);
      if (!track) {
        track = {
          altitudeY: 0,
          verticalVel: 0,
          comboStep: 0,
          comboResetTimer: 0,
          lastMeleeArcId: null,
          hitReactTimer: 0,
          lastHp: unit.hp,
          yawRad: Math.atan2(unit.aimDir.x, unit.aimDir.y)
        };
        this.tracks.set(unit.instanceId, track);
      }

      if (unit.hp < track.lastHp - 0.5) {
        track.hitReactTimer = 0.22;
      }
      track.lastHp = unit.hp;
      track.hitReactTimer = Math.max(0, track.hitReactTimer - dt);
      track.comboResetTimer = Math.max(0, track.comboResetTimer - dt);
      if (track.comboResetTimer <= 0) {
        track.comboStep = 0;
      }

      const activeMelee = world.meleeArcs.find(
        (m) => !m.finished && m.ownerUnitId === unit.instanceId
      );
      if (activeMelee && activeMelee.id !== track.lastMeleeArcId) {
        track.lastMeleeArcId = activeMelee.id;
        track.comboStep += 1;
        track.comboResetTimer = 1.1;
        const moveLower = activeMelee.moveId.toLowerCase();
        if (
          moveLower.includes('launch') ||
          moveLower.includes('upper') ||
          track.comboStep % 4 === 3
        ) {
          if (track.altitudeY < 0.25 && unit.isPlayerControlled) {
            track.verticalVel = 7.4;
          }
        }
      }

      const hasActiveBeam = world.beams.some(
        (b) => !b.terminated && b.ownerUnitId === unit.instanceId
      );

      // Simulate vertical 3D altitude without touching 2D core state
      if (track.altitudeY > 0 || track.verticalVel !== 0) {
        track.altitudeY += track.verticalVel * dt;
        track.verticalVel -= GRAVITY_3D * dt;
        if (track.altitudeY <= 0) {
          track.altitudeY = 0;
          track.verticalVel = 0;
        }
      }

      const ix = unit.prevPos.x + (unit.pos.x - unit.prevPos.x) * clampedAlpha;
      const iy = unit.prevPos.y + (unit.pos.y - unit.prevPos.y) * clampedAlpha;
      const projected = project2DTo3D(ix, iy, track.altitudeY);

      const aimLen = Math.hypot(unit.aimDir.x, unit.aimDir.y) || 1;
      const aimX = unit.aimDir.x / aimLen;
      const aimZ = unit.aimDir.y / aimLen;
      const targetYaw = Math.atan2(aimX, aimZ);
      track.yawRad = lerpAngle(track.yawRad, targetYaw, 1 - Math.exp(-14 * dt));

      const speedPx = Math.hypot(unit.vel.x, unit.vel.y);
      const speedNorm = Math.min(1, speedPx / 260);
      const { animState, isSpecialActive, isAttacking } = resolveActorAnimState(
        unit,
        track,
        speedNorm,
        activeMelee?.moveId ?? null,
        hasActiveBeam
      );
      const auraMode = classifyHakiAura(unit, isAttacking, isSpecialActive);
      const scale = Math.max(0.7, unit.entityScale * unit.visualScale);
      const normalizedClipProgress = activeMelee
        ? Math.max(
            0,
            Math.min(1, activeMelee.elapsedSec / Math.max(0.05, activeMelee.totalLingerDurationSec))
          )
        : 0;

      const visual: Actor3DVisualState = {
        unitId: unit.instanceId,
        speciesId: unit.speciesId,
        activeFormId: unit.activeFormId,
        name: unit.name,
        team: unit.team,
        isPlayerControlled: unit.isPlayerControlled,
        isBossUnit: unit.isBossUnit,
        position: new THREE.Vector3(projected.x, projected.y, projected.z),
        aimDir: new THREE.Vector3(aimX, 0, aimZ),
        yawRad: track.yawRad,
        scale,
        altitudeY: track.altitudeY,
        animState,
        normalizedClipProgress,
        auraMode,
        speedNormalized: unit.dodgeActiveTimer > 0 ? 1 : speedNorm,
        isDashing: unit.dodgeActiveTimer > 0,
        isAttacking,
        isSpecialActive,
        hpRatio: unit.maxHp > 0 ? Math.max(0, Math.min(1, unit.hp / unit.maxHp)) : 0,
        isAlive: unit.isAlive
      };

      actors.push(visual);
      if (unit.isPlayerControlled && !playerActor) {
        playerActor = visual;
      }
      if (this.lockedBossId === unit.instanceId) {
        lockedBossActor = visual;
      }
    }

    if (!playerActor) {
      playerActor = actors.find((a) => a.team === 'ALPHA' && a.isAlive) ?? actors[0] ?? null;
    }

    // Read-only subscription to core BattleWorldState.vfxEvents
    const hitSparkEvents: ComicSparkSpawnInput[] = [];
    const currentVfxIds = new Set<string>();
    for (const vfxEv of world.vfxEvents) {
      currentVfxIds.add(vfxEv.id);
      if (this.seenVfxIds.has(vfxEv.id)) continue;
      this.seenVfxIds.add(vfxEv.id);

      const p3 = project2DTo3D(vfxEv.pos.x, vfxEv.pos.y, 1.05);
      const pos = new THREE.Vector3(p3.x, p3.y, p3.z);
      const dir = new THREE.Vector3(1, 0, 0);
      if (vfxEv.targetPos) {
        const tp = project2DTo3D(vfxEv.targetPos.x, vfxEv.targetPos.y, 1.05);
        dir.set(tp.x - p3.x, 0, tp.z - p3.z);
        if (dir.lengthSq() > 0.001) dir.normalize();
        else dir.set(1, 0, 0);
      }

      let kind: ComicSparkSpawnInput['kind'] = 'STARBURST';
      if (vfxEv.kind === 'CROSS_SLASH' || vfxEv.kind === 'BEAM_BREAK') {
        kind = 'CROSS_SLASH';
      } else if (
        vfxEv.kind === 'CONQUEROR_LIGHTNING' ||
        vfxEv.kind === 'SKY_SPLIT_SHOCKWAVE'
      ) {
        kind = 'HAKI_ARC';
      } else if (
        vfxEv.kind === 'JUST_DODGE_RING' ||
        vfxEv.kind === 'CLASH_SHOCKWAVE' ||
        vfxEv.kind === 'FORM_BURST'
      ) {
        kind = 'PARRY_SHOCKWAVE';
      }

      hitSparkEvents.push({
        kind,
        position: pos,
        dir,
        color: vfxEv.color || '#fef08a',
        intensity: Math.min(1.6, Math.max(0.85, vfxEv.radiusPx / 45))
      });
    }
    for (const oldId of this.seenVfxIds) {
      if (!currentVfxIds.has(oldId)) {
        this.seenVfxIds.delete(oldId);
      }
    }

    const shouldTriggerHitstop =
      world.hitstopTimer > this.prevWorldHitstopTimer + 0.005;
    this.prevWorldHitstopTimer = world.hitstopTimer;

    let shakeImpulse: { dirX: number; dirZ: number; magnitude: number } | null = null;
    if (world.screenShakeTimer > this.prevShakeTimer + 0.005) {
      shakeImpulse = {
        dirX: playerActor?.aimDir.x ?? 1,
        dirZ: playerActor?.aimDir.z ?? 0,
        magnitude: Math.min(0.8, Math.max(0.18, world.screenShakeMagnitude * 0.04))
      };
    }
    this.prevShakeTimer = world.screenShakeTimer;

    return {
      actors,
      playerActor,
      lockedBossActor,
      attackSweeps,
      hitSparkEvents,
      shouldTriggerHitstop,
      shakeImpulse
    };
  }
}
