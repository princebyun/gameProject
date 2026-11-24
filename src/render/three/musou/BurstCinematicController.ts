import * as THREE from 'three';
import type { MusouActionType } from '../../../core/battle/musou/MusouTypes';
import type { Disposable } from '../../../core/types/disposable';

const AURA_PARTICLE_COUNT = 48;
const CINEMATIC_DURATION_SEC = 0.45;

const TYPE_COLORS: Record<MusouActionType, string> = {
  POWER: '#ef4444',
  SPEED: '#22d3ee',
  TECHNIQUE: '#a855f7',
  SKY: '#facc15'
};

export interface BurstCinematicFrameState {
  cinematicActive: boolean;
  orbitProgress01: number;
  rimBoost: number;
  bloomBoost: number;
  bannerTimer: number;
  whiteFlashAlpha: number;
}

/**
 * Full-Force Burst 3D Cinematic & Rising Aura VFX Pool (zero per-frame heap allocation):
 * - Expanding spherical energy dome on Burst activation
 * - 48-instance InstancedMesh rising aura shards around awakened hero
 * - 0.45s half-orbit zoom curve + Fresnel rim & UnrealBloomPass boost
 * - Respects flashEffect === false by clamping bloom spikes & suppressing white flash
 */
export class BurstCinematicController implements Disposable {
  public readonly group = new THREE.Group();

  private readonly domeGeo: THREE.SphereGeometry;
  private readonly domeMat: THREE.MeshBasicMaterial;
  private readonly domeMesh: THREE.Mesh;

  private readonly particleGeo: THREE.OctahedronGeometry;
  private readonly particleMat: THREE.MeshBasicMaterial;
  private readonly particleMesh: THREE.InstancedMesh;

  private readonly pAngles = new Float32Array(AURA_PARTICLE_COUNT);
  private readonly pRadii = new Float32Array(AURA_PARTICLE_COUNT);
  private readonly pHeights = new Float32Array(AURA_PARTICLE_COUNT);
  private readonly pSpeeds = new Float32Array(AURA_PARTICLE_COUNT);
  private readonly scratchObj = new THREE.Object3D();

  private cinematicTimer = 0;
  private domeTimer = 0;
  private bannerTimer = 0;
  private whiteFlashAlpha = 0;
  private currentAuraColor = new THREE.Color('#facc15');
  private disposed = false;

  constructor(scene: THREE.Scene) {
    this.group.name = 'musou_burst_cinematic_vfx';
    scene.add(this.group);

    this.domeGeo = new THREE.SphereGeometry(1.0, 20, 14);
    this.domeMat = new THREE.MeshBasicMaterial({
      color: '#fde047',
      transparent: true,
      opacity: 0,
      wireframe: false,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    this.domeMesh = new THREE.Mesh(this.domeGeo, this.domeMat);
    this.domeMesh.visible = false;
    this.group.add(this.domeMesh);

    this.particleGeo = new THREE.OctahedronGeometry(0.14, 0);
    this.particleMat = new THREE.MeshBasicMaterial({
      color: '#fde047',
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    this.particleMesh = new THREE.InstancedMesh(
      this.particleGeo,
      this.particleMat,
      AURA_PARTICLE_COUNT
    );
    this.particleMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.particleMesh.frustumCulled = false;
    this.particleMesh.visible = false;
    this.group.add(this.particleMesh);

    for (let i = 0; i < AURA_PARTICLE_COUNT; i += 1) {
      this.pAngles[i] = (i / AURA_PARTICLE_COUNT) * Math.PI * 2 * 3;
      this.pRadii[i] = 0.75 + (i % 5) * 0.24;
      this.pHeights[i] = ((i * 0.37) % 2.4);
      this.pSpeeds[i] = 1.6 + (i % 4) * 0.45;
    }
  }

  public static resolveBurstAuraColor(
    actionType: MusouActionType,
    activeFormId: string | null
  ): string {
    const formLower = (activeFormId ?? '').toLowerCase();
    if (formLower.includes('gear5') || formLower.includes('nika')) {
      return '#f8fafc';
    }
    if (formLower.includes('king_of_hell')) {
      return '#10b981';
    }
    return TYPE_COLORS[actionType] ?? '#facc15';
  }

  public isDomeVisible(): boolean {
    return this.domeMesh.visible;
  }

  public isAuraParticlesVisible(): boolean {
    return this.particleMesh.visible;
  }

  public triggerBurst(
    origin: THREE.Vector3,
    actionType: MusouActionType,
    activeFormId: string | null,
    flashEffect: boolean
  ): void {
    if (this.disposed) return;
    const hex = BurstCinematicController.resolveBurstAuraColor(actionType, activeFormId);
    this.currentAuraColor.set(hex);

    this.cinematicTimer = CINEMATIC_DURATION_SEC;
    this.domeTimer = 0.48;
    this.bannerTimer = 1.25;
    this.whiteFlashAlpha = flashEffect ? 0.55 : 0;

    this.domeMesh.visible = true;
    this.domeMesh.position.set(origin.x, origin.y + 0.6, origin.z);
    this.domeMesh.scale.setScalar(0.85);
    this.domeMat.color.copy(this.currentAuraColor);
    this.domeMat.opacity = flashEffect ? 0.52 : 0.2;
    this.particleMat.color.copy(this.currentAuraColor);
  }

  public update(
    dtSec: number,
    playerPos: THREE.Vector3,
    burstActive: boolean,
    actionType: MusouActionType,
    activeFormId: string | null,
    flashEffect: boolean
  ): BurstCinematicFrameState {
    if (this.disposed) {
      return {
        cinematicActive: false,
        orbitProgress01: 0,
        rimBoost: 0,
        bloomBoost: 0,
        bannerTimer: 0,
        whiteFlashAlpha: 0
      };
    }

    const dt = Math.max(0.001, Math.min(0.05, dtSec));
    const hex = BurstCinematicController.resolveBurstAuraColor(actionType, activeFormId);
    this.currentAuraColor.set(hex);
    this.particleMat.color.copy(this.currentAuraColor);

    if (this.cinematicTimer > 0) {
      this.cinematicTimer = Math.max(0, this.cinematicTimer - dt);
    }
    if (this.bannerTimer > 0) {
      this.bannerTimer = Math.max(0, this.bannerTimer - dt);
    }
    if (this.whiteFlashAlpha > 0) {
      this.whiteFlashAlpha = flashEffect ? Math.max(0, this.whiteFlashAlpha - dt * 2.4) : 0;
    }

    if (this.domeTimer > 0) {
      this.domeTimer = Math.max(0, this.domeTimer - dt);
      const p = 1 - this.domeTimer / 0.48;
      this.domeMesh.scale.setScalar(0.85 + p * 11.2);
      this.domeMat.opacity = (flashEffect ? 0.52 : 0.2) * (1 - p);
      if (this.domeTimer <= 0) {
        this.domeMesh.visible = false;
      }
    }

    if (burstActive) {
      this.particleMesh.visible = true;
      for (let i = 0; i < AURA_PARTICLE_COUNT; i += 1) {
        const nextY = ((this.pHeights[i] ?? 0) + (this.pSpeeds[i] ?? 1.8) * dt) % 2.6;
        this.pHeights[i] = nextY;
        const angle = (this.pAngles[i] ?? 0) + dt * 2.8;
        this.pAngles[i] = angle;
        const radius = this.pRadii[i] ?? 1.0;
        const scale = Math.max(0.15, (1 - nextY / 2.6) * 1.15);

        this.scratchObj.position.set(
          playerPos.x + Math.cos(angle) * radius,
          playerPos.y + nextY + 0.15,
          playerPos.z + Math.sin(angle) * radius
        );
        this.scratchObj.rotation.set(angle, angle * 1.5, 0);
        this.scratchObj.scale.setScalar(scale);
        this.scratchObj.updateMatrix();
        this.particleMesh.setMatrixAt(i, this.scratchObj.matrix);
      }
      this.particleMesh.count = AURA_PARTICLE_COUNT;
      this.particleMesh.instanceMatrix.needsUpdate = true;
    } else {
      this.particleMesh.visible = false;
    }

    const cinematicActive = this.cinematicTimer > 0;
    const orbitProgress01 = cinematicActive
      ? 1 - this.cinematicTimer / CINEMATIC_DURATION_SEC
      : 0;
    const rimBoost = cinematicActive ? 0.85 : burstActive ? 0.48 : 0;
    const rawBloom = cinematicActive ? 0.52 : burstActive ? 0.24 : 0;
    const bloomBoost = flashEffect ? rawBloom : Math.min(0.12, rawBloom);

    return {
      cinematicActive,
      orbitProgress01,
      rimBoost,
      bloomBoost,
      bannerTimer: this.bannerTimer,
      whiteFlashAlpha: flashEffect ? this.whiteFlashAlpha : 0
    };
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.domeGeo.dispose();
    this.domeMat.dispose();
    this.particleGeo.dispose();
    this.particleMat.dispose();
    this.group.clear();
    this.group.parent?.remove(this.group);
  }
}
