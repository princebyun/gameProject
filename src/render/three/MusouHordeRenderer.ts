import * as THREE from 'three';
import type { AttackSweepVolume3D } from './Battle3DStateAdapter';
import { ThreeToonTuningConfig } from './threeTypes';
import {
  applyToonMaterialTuning,
  createAnimeToonMaterial,
  createToonOutlineMaterial
} from './shaders/AnimeToonMaterial';

export const HORDE_MAX_CAPACITY = 120;

type GruntState = 'INACTIVE' | 'ALIVE' | 'LAUNCHED' | 'KO_FADING';
type GruntArchetype = 'MARINE_SEAMAN' | 'MARINE_CAPTAIN' | 'PIRATE_RAIDER';

interface GruntSlot {
  state: GruntState;
  archetype: GruntArchetype;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  yawRad: number;
  spinVel: THREE.Vector3;
  rotX: number;
  rotZ: number;
  scale: number;
  timer: number;
  seedAngle: number;
  preferRadius: number;
}

const ARCHETYPE_COLORS: Record<GruntArchetype, number> = {
  MARINE_SEAMAN: 0xe2e8f0,
  MARINE_CAPTAIN: 0xfef08a,
  PIRATE_RAIDER: 0xfca5a5
};

const ARCHETYPE_ORDER: readonly GruntArchetype[] = [
  'MARINE_SEAMAN',
  'MARINE_SEAMAN',
  'PIRATE_RAIDER',
  'MARINE_CAPTAIN'
];

/**
 * Instanced horde renderer rendering up to 120 Marines/pirate fodder in exactly 2 GPU draw calls
 * (1x AnimeToon InstancedMesh + 1x BackSide Outline InstancedMesh) with zero per-frame allocations.
 */
export class MusouHordeRenderer {
  public readonly bodyMesh: THREE.InstancedMesh;
  public readonly outlineMesh: THREE.InstancedMesh;

  private readonly sharedGeometry: THREE.CapsuleGeometry;
  private readonly bodyMaterial: THREE.ShaderMaterial;
  private readonly outlineMaterial: THREE.ShaderMaterial;

  private readonly slots: GruntSlot[] = [];
  private readonly scratchObj = new THREE.Object3D();
  private readonly scratchDelta = new THREE.Vector3();
  private readonly scratchColor = new THREE.Color();

  private targetCount: 30 | 60 | 100 = 100;
  private koCount = 0;
  private hitComboCount = 0;
  private hitComboTimer = 0;

  constructor(private readonly scene: THREE.Scene) {
    this.sharedGeometry = new THREE.CapsuleGeometry(0.32, 0.92, 4, 8);
    this.sharedGeometry.translate(0, 0.78, 0);

    this.bodyMaterial = createAnimeToonMaterial({
      baseColor: '#ffffff',
      shadowTint: '#64748b',
      rimColor: '#93c5fd',
      rimIntensity: 0.55
    });
    this.outlineMaterial = createToonOutlineMaterial({
      outlineWidth: 0.025
    });

    this.bodyMesh = new THREE.InstancedMesh(
      this.sharedGeometry,
      this.bodyMaterial,
      HORDE_MAX_CAPACITY
    );
    this.bodyMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.bodyMesh.frustumCulled = false;
    this.bodyMesh.castShadow = false;
    this.bodyMesh.receiveShadow = true;

    this.outlineMesh = new THREE.InstancedMesh(
      this.sharedGeometry,
      this.outlineMaterial,
      HORDE_MAX_CAPACITY
    );
    this.outlineMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.outlineMesh.frustumCulled = false;

    for (let i = 0; i < HORDE_MAX_CAPACITY; i += 1) {
      const archetype = ARCHETYPE_ORDER[i % ARCHETYPE_ORDER.length] ?? 'MARINE_SEAMAN';
      const angle = (i / HORDE_MAX_CAPACITY) * Math.PI * 2;
      const dist = 6 + ((i * 1.7) % 10);
      this.slots.push({
        state: i < this.targetCount ? 'ALIVE' : 'INACTIVE',
        archetype,
        pos: new THREE.Vector3(Math.cos(angle) * dist, 0, Math.sin(angle) * (dist * 0.65)),
        vel: new THREE.Vector3(),
        yawRad: angle + Math.PI,
        spinVel: new THREE.Vector3(),
        rotX: 0,
        rotZ: 0,
        scale: archetype === 'MARINE_CAPTAIN' ? 1.15 : 0.96,
        timer: 0,
        seedAngle: angle,
        preferRadius: 2.8 + (i % 5) * 0.85
      });

      this.scratchColor.setHex(ARCHETYPE_COLORS[archetype]);
      this.bodyMesh.setColorAt(i, this.scratchColor);
    }
    if (this.bodyMesh.instanceColor) {
      this.bodyMesh.instanceColor.needsUpdate = true;
    }

    this.scene.add(this.bodyMesh);
    this.scene.add(this.outlineMesh);
    this.syncInstanceMatrices();
  }

  public getDrawCallCount(): number {
    return 2;
  }

  public getActiveCount(): number {
    let active = 0;
    for (const s of this.slots) {
      if (s.state !== 'INACTIVE') active += 1;
    }
    return active;
  }

  public getKoCount(): number {
    return this.koCount;
  }

  public getHitComboCount(): number {
    return this.hitComboCount;
  }

  public getHitComboTimer(): number {
    return this.hitComboTimer;
  }

  public setTargetCount(count: 30 | 60 | 100): void {
    this.targetCount = count;
    for (let i = 0; i < HORDE_MAX_CAPACITY; i += 1) {
      const slot = this.slots[i];
      if (!slot) continue;
      if (i >= count) {
        slot.state = 'INACTIVE';
      } else if (slot.state === 'INACTIVE') {
        this.respawnSlot(slot, i, 0, 0);
      }
    }
    this.syncInstanceMatrices();
  }

  public reset(): void {
    this.koCount = 0;
    this.hitComboCount = 0;
    this.hitComboTimer = 0;
    for (let i = 0; i < HORDE_MAX_CAPACITY; i += 1) {
      const slot = this.slots[i];
      if (!slot) continue;
      if (i < this.targetCount) {
        this.respawnSlot(slot, i, 0, 0);
      } else {
        slot.state = 'INACTIVE';
      }
    }
    this.syncInstanceMatrices();
  }

  public applyAttackSweeps(sweeps: readonly AttackSweepVolume3D[]): number {
    if (sweeps.length === 0) return 0;
    let launchedNow = 0;

    for (const sweep of sweeps) {
      if (sweep.team !== 'ALPHA') continue;
      const rSq = sweep.radiusMeters * sweep.radiusMeters;

      for (const slot of this.slots) {
        if (slot.state !== 'ALIVE') continue;
        const dx = slot.pos.x - sweep.origin.x;
        const dz = slot.pos.z - sweep.origin.z;
        const distSq = dx * dx + dz * dz;
        if (distSq > rSq) continue;

        const dist = Math.sqrt(distSq) || 0.25;
        const impulseSpeed = sweep.isSpecial ? 14.5 : 9.8;
        slot.state = 'LAUNCHED';
        slot.timer = 0;
        slot.vel.set(
          (dx / dist) * impulseSpeed + sweep.dir.x * 3.5,
          sweep.isAirLaunch ? 11.5 : 7.8,
          (dz / dist) * impulseSpeed + sweep.dir.z * 3.5
        );
        slot.spinVel.set(6.5, 4.2, -5.8);
        launchedNow += 1;
      }
    }

    if (launchedNow > 0) {
      this.koCount += launchedNow;
      this.hitComboCount += launchedNow;
      this.hitComboTimer = 3.2;
    }
    return launchedNow;
  }

  public triggerMusouBurst(origin: THREE.Vector3, radiusMeters = 7.5): number {
    const rSq = radiusMeters * radiusMeters;
    let launchedNow = 0;

    for (const slot of this.slots) {
      if (slot.state !== 'ALIVE') continue;
      const dx = slot.pos.x - origin.x;
      const dz = slot.pos.z - origin.z;
      const distSq = dx * dx + dz * dz;
      if (distSq > rSq) continue;

      const dist = Math.sqrt(distSq) || 0.3;
      slot.state = 'LAUNCHED';
      slot.timer = 0;
      slot.vel.set((dx / dist) * 15, 11.2, (dz / dist) * 15);
      slot.spinVel.set(9.2, 5.5, -7.4);
      launchedNow += 1;
    }

    if (launchedNow > 0) {
      this.koCount += launchedNow;
      this.hitComboCount += launchedNow;
      this.hitComboTimer = 3.5;
    }
    return launchedNow;
  }

  public pullGruntsToward(origin: THREE.Vector3, radiusMeters = 8.5): number {
    const rSq = radiusMeters * radiusMeters;
    let pulled = 0;
    for (const slot of this.slots) {
      if (slot.state !== 'ALIVE') continue;
      const dx = origin.x - slot.pos.x;
      const dz = origin.z - slot.pos.z;
      const distSq = dx * dx + dz * dz;
      if (distSq > rSq || distSq < 0.04) continue;
      const factor = 0.62;
      slot.pos.x += dx * factor;
      slot.pos.z += dz * factor;
      pulled += 1;
    }
    if (pulled > 0) {
      this.hitComboCount += pulled;
      this.hitComboTimer = 3.5;
    }
    return pulled;
  }

  public triggerFullForceBurstKnockback(
    origin: THREE.Vector3,
    radiusMeters = 14.0
  ): number {
    return this.triggerMusouBurst(origin, radiusMeters);
  }

  public update(dtSec: number, playerPos: THREE.Vector3, elapsedSec: number): void {
    const dt = Math.max(0.001, Math.min(0.05, dtSec));
    if (this.hitComboTimer > 0) {
      this.hitComboTimer = Math.max(0, this.hitComboTimer - dt);
      if (this.hitComboTimer <= 0) {
        this.hitComboCount = 0;
      }
    }

    for (let i = 0; i < this.slots.length; i += 1) {
      const slot = this.slots[i];
      if (!slot || slot.state === 'INACTIVE') continue;

      if (slot.state === 'ALIVE') {
        const orbit = slot.seedAngle + elapsedSec * 0.25;
        const targetX = playerPos.x + Math.cos(orbit) * slot.preferRadius;
        const targetZ = playerPos.z + Math.sin(orbit) * slot.preferRadius;
        this.scratchDelta.set(targetX - slot.pos.x, 0, targetZ - slot.pos.z);
        const dist = this.scratchDelta.length();
        if (dist > 0.2) {
          this.scratchDelta.multiplyScalar(1 / dist);
          const speed = Math.min(3.4, dist * 1.4);
          slot.pos.x += this.scratchDelta.x * speed * dt;
          slot.pos.z += this.scratchDelta.z * speed * dt;
        }
        slot.pos.x = Math.max(-18.2, Math.min(18.2, slot.pos.x));
        slot.pos.z = Math.max(-9.8, Math.min(9.8, slot.pos.z));
        slot.yawRad = Math.atan2(playerPos.x - slot.pos.x, playerPos.z - slot.pos.z);
        slot.rotX = Math.sin(elapsedSec * 7 + i) * 0.06;
        slot.rotZ = 0;
      } else if (slot.state === 'LAUNCHED') {
        slot.timer += dt;
        slot.pos.addScaledVector(slot.vel, dt);
        slot.vel.y -= 24.5 * dt;
        slot.rotX += slot.spinVel.x * dt;
        slot.rotZ += slot.spinVel.z * dt;

        if (slot.pos.y <= 0 && slot.vel.y < 0) {
          slot.pos.y = 0;
          slot.vel.y = Math.abs(slot.vel.y) * 0.42;
          slot.vel.x *= 0.62;
          slot.vel.z *= 0.62;
          if (slot.vel.y < 1.2 || slot.timer > 1.1) {
            slot.state = 'KO_FADING';
            slot.timer = 0;
          }
        }
      } else if (slot.state === 'KO_FADING') {
        slot.timer += dt;
        if (slot.timer >= 0.45) {
          this.respawnSlot(slot, i, playerPos.x, playerPos.z);
        }
      }
    }

    this.syncInstanceMatrices();
  }

  private respawnSlot(slot: GruntSlot, index: number, centerX: number, centerZ: number): void {
    const angle = slot.seedAngle + index * 0.37;
    const spawnDist = 11.5 + (index % 6) * 1.25;
    slot.state = 'ALIVE';
    slot.pos.set(
      Math.max(-17.8, Math.min(17.8, centerX + Math.cos(angle) * spawnDist)),
      0,
      Math.max(-9.5, Math.min(9.5, centerZ + Math.sin(angle) * (spawnDist * 0.58)))
    );
    slot.vel.set(0, 0, 0);
    slot.spinVel.set(0, 0, 0);
    slot.rotX = 0;
    slot.rotZ = 0;
    slot.timer = 0;
    slot.scale = slot.archetype === 'MARINE_CAPTAIN' ? 1.15 : 0.96;
  }

  private syncInstanceMatrices(): void {
    let visibleCount = 0;
    for (let i = 0; i < HORDE_MAX_CAPACITY; i += 1) {
      const slot = this.slots[i];
      if (!slot || slot.state === 'INACTIVE') {
        continue;
      }

      const fadeScale =
        slot.state === 'KO_FADING'
          ? Math.max(0.01, 1 - slot.timer / 0.45) * slot.scale
          : slot.scale;

      this.scratchObj.position.copy(slot.pos);
      this.scratchObj.rotation.set(slot.rotX, slot.yawRad, slot.rotZ);
      this.scratchObj.scale.setScalar(fadeScale);
      this.scratchObj.updateMatrix();

      this.bodyMesh.setMatrixAt(visibleCount, this.scratchObj.matrix);
      this.outlineMesh.setMatrixAt(visibleCount, this.scratchObj.matrix);

      this.scratchColor.setHex(ARCHETYPE_COLORS[slot.archetype]);
      this.bodyMesh.setColorAt(visibleCount, this.scratchColor);
      visibleCount += 1;
    }

    this.bodyMesh.count = visibleCount;
    this.outlineMesh.count = visibleCount;
    this.bodyMesh.instanceMatrix.needsUpdate = true;
    this.outlineMesh.instanceMatrix.needsUpdate = true;
    if (this.bodyMesh.instanceColor) {
      this.bodyMesh.instanceColor.needsUpdate = true;
    }
  }

  public applyTuning(
    tuning: ThreeToonTuningConfig,
    sunDirection?: THREE.Vector3,
    sunColor?: THREE.Color,
    ambientColor?: THREE.Color
  ): void {
    this.setTargetCount(tuning.hordeTargetCount);
    applyToonMaterialTuning(this.bodyMaterial, tuning, sunDirection, sunColor, ambientColor);
    applyToonMaterialTuning(this.outlineMaterial, tuning);
  }

  public dispose(): void {
    this.bodyMesh.parent?.remove(this.bodyMesh);
    this.outlineMesh.parent?.remove(this.outlineMesh);
    this.sharedGeometry.dispose();
    this.bodyMaterial.dispose();
    this.outlineMaterial.dispose();
  }
}
