import * as THREE from 'three';
import type {
  BossArmorState,
  MusouDamagePopupStyle
} from '../../../core/battle/musou/MusouTypes';
import type { Disposable } from '../../../core/types/disposable';
import type { ViewportMetrics } from '../../viewport/responsiveViewportManager';

export const ARMOR_SHARD_COUNT = 48;
const SHARD_LIFETIME_SEC = 1.2;
const POPUP_POOL_SIZE = 24;

export interface ProjectedDamagePopup {
  screenX: number;
  screenY: number;
  value: number;
  style: MusouDamagePopupStyle;
  alpha: number;
  scale: number;
}

export interface MusouBannerState {
  activeText: string | null;
  subText: string | null;
  color: string;
  alpha: number;
  whiteFlashAlpha: number;
}

interface DamagePopupSlot {
  active: boolean;
  worldX: number;
  worldY: number;
  worldZ: number;
  life: number;
  maxLife: number;
  value: number;
  style: MusouDamagePopupStyle;
}

/**
 * Giant Boss Armor Shield, 48-Shard Shatter InstancedMesh, Groggy Halo Stars,
 * and Zero-Allocation Damage Popup Pool.
 */
export class ArmorBreakVfxSystem implements Disposable {
  public readonly group = new THREE.Group();

  private readonly shieldGeo: THREE.IcosahedronGeometry;
  private readonly shieldMat: THREE.MeshBasicMaterial;
  private readonly shieldMesh: THREE.Mesh;

  private readonly shardGeo: THREE.TetrahedronGeometry;
  private readonly shardMat: THREE.MeshBasicMaterial;
  private readonly shardMesh: THREE.InstancedMesh;
  private readonly shardPos = new Float32Array(ARMOR_SHARD_COUNT * 3);
  private readonly shardVel = new Float32Array(ARMOR_SHARD_COUNT * 3);
  private readonly shardRot = new Float32Array(ARMOR_SHARD_COUNT * 3);
  private readonly shardSpin = new Float32Array(ARMOR_SHARD_COUNT * 3);
  private shardTimer = 0;

  private readonly groggyGroup = new THREE.Group();
  private readonly haloGeo: THREE.TorusGeometry;
  private readonly haloMat: THREE.MeshBasicMaterial;
  private readonly starGeo: THREE.OctahedronGeometry;
  private readonly starMat: THREE.MeshBasicMaterial;
  private readonly starMeshes: THREE.Mesh[] = [];

  private readonly popups: DamagePopupSlot[] = [];
  private popupCursor = 0;
  private readonly projectedPopups: ProjectedDamagePopup[] = [];
  private readonly projScratch = new THREE.Vector3();
  private readonly dummyObj = new THREE.Object3D();

  private bannerTimer = 0;
  private bannerMax = 1.4;
  private bannerText: string | null = null;
  private bannerSubText: string | null = null;
  private bannerColor = '#facc15';
  private whiteFlashAlpha = 0;
  private crackPhase = 0;
  private groggyAngle = 0;
  private disposed = false;

  constructor(scene: THREE.Scene) {
    this.group.name = 'musou_armor_break_vfx';
    scene.add(this.group);

    // 1. Hexagonal Cracked Boss Shield Overlay
    this.shieldGeo = new THREE.IcosahedronGeometry(1.75, 1);
    this.shieldMat = new THREE.MeshBasicMaterial({
      color: '#38bdf8',
      wireframe: true,
      transparent: true,
      opacity: 0.25,
      depthWrite: false
    });
    this.shieldMesh = new THREE.Mesh(this.shieldGeo, this.shieldMat);
    this.shieldMesh.visible = false;
    this.group.add(this.shieldMesh);

    // 2. Pre-allocated 48-Shard Polyhedral InstancedMesh Explosion Pool
    this.shardGeo = new THREE.TetrahedronGeometry(0.3, 0);
    this.shardMat = new THREE.MeshBasicMaterial({
      color: '#7dd3fc',
      transparent: true,
      opacity: 0.92,
      depthWrite: false
    });
    this.shardMesh = new THREE.InstancedMesh(
      this.shardGeo,
      this.shardMat,
      ARMOR_SHARD_COUNT
    );
    this.shardMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.shardMesh.frustumCulled = false;
    this.shardMesh.visible = false;
    this.group.add(this.shardMesh);

    // 3. 3D Groggy Stun Halo + 5 Orbiting Stars
    this.groggyGroup.name = 'boss_groggy_halo';
    this.haloGeo = new THREE.TorusGeometry(0.95, 0.06, 8, 24);
    this.haloGeo.rotateX(Math.PI * 0.5);
    this.haloMat = new THREE.MeshBasicMaterial({
      color: '#facc15',
      transparent: true,
      opacity: 0.95
    });
    const haloMesh = new THREE.Mesh(this.haloGeo, this.haloMat);
    this.groggyGroup.add(haloMesh);

    this.starGeo = new THREE.OctahedronGeometry(0.16, 0);
    this.starMat = new THREE.MeshBasicMaterial({ color: '#fef08a' });
    for (let i = 0; i < 5; i += 1) {
      const star = new THREE.Mesh(this.starGeo, this.starMat);
      const a = (i / 5) * Math.PI * 2;
      star.position.set(Math.cos(a) * 1.1, 0.08, Math.sin(a) * 1.1);
      this.groggyGroup.add(star);
      this.starMeshes.push(star);
    }
    this.groggyGroup.visible = false;
    this.group.add(this.groggyGroup);

    // 4. Pre-allocated Damage Popup Pool
    for (let i = 0; i < POPUP_POOL_SIZE; i += 1) {
      this.popups.push({
        active: false,
        worldX: 0,
        worldY: 0,
        worldZ: 0,
        life: 0,
        maxLife: 0.85,
        value: 0,
        style: 'NORMAL'
      });
    }
  }

  public getShardTimerRemaining(): number {
    return this.shardTimer;
  }

  public getActiveShardCount(): number {
    return this.shardTimer > 0 ? ARMOR_SHARD_COUNT : 0;
  }

  public isGroggyHaloVisible(): boolean {
    return this.groggyGroup.visible;
  }

  public isCrackedShieldVisible(): boolean {
    return this.shieldMesh.visible;
  }

  public triggerArmorBreak(
    bossPos: THREE.Vector3,
    bossScale: number,
    flashEffect: boolean
  ): void {
    if (this.disposed) return;
    this.shardTimer = SHARD_LIFETIME_SEC;
    this.shardMesh.visible = true;
    this.shardMat.color.set('#facc15');
    this.shardMat.opacity = flashEffect ? 0.95 : 0.72;

    const baseY = bossPos.y + 1.3 * bossScale;
    for (let i = 0; i < ARMOR_SHARD_COUNT; i += 1) {
      const idx = i * 3;
      const theta = ((i * 137.5) % 360) * (Math.PI / 180);
      const phi = ((i % 7) - 3) * 0.28;
      const speed = 6.5 + (i % 6) * 1.35;

      this.shardPos[idx] = bossPos.x + Math.cos(theta) * 0.65;
      this.shardPos[idx + 1] = baseY + Math.sin(phi) * 0.55;
      this.shardPos[idx + 2] = bossPos.z + Math.sin(theta) * 0.65;

      this.shardVel[idx] = Math.cos(theta) * speed;
      this.shardVel[idx + 1] = 3.8 + (i % 5) * 1.4;
      this.shardVel[idx + 2] = Math.sin(theta) * speed;

      this.shardRot[idx] = theta;
      this.shardRot[idx + 1] = phi;
      this.shardRot[idx + 2] = 0;

      this.shardSpin[idx] = 6 + (i % 4) * 2.2;
      this.shardSpin[idx + 1] = -5 + (i % 3) * 3.1;
      this.shardSpin[idx + 2] = 4.5;
    }

    this.bannerText = 'ARMOR BREAK!';
    this.bannerSubText = '5.0초 그로기! 피해 1.6x 증폭';
    this.bannerColor = '#facc15';
    this.bannerTimer = 1.4;
    this.bannerMax = 1.4;
    this.whiteFlashAlpha = flashEffect ? 0.72 : 0;
  }

  public triggerBurstBanner(actionLabel: string, flashEffect: boolean): void {
    if (this.disposed) return;
    this.bannerText = 'FULL-FORCE BURST!';
    this.bannerSubText = `${actionLabel} 진심 각성 발동!`;
    this.bannerColor = '#38bdf8';
    this.bannerTimer = 1.25;
    this.bannerMax = 1.25;
    this.whiteFlashAlpha = flashEffect ? 0.45 : 0;
  }

  public spawnDamagePopup(
    worldX: number,
    worldY: number,
    worldZ: number,
    value: number,
    style: MusouDamagePopupStyle
  ): void {
    if (this.disposed) return;
    const slot = this.popups[this.popupCursor];
    this.popupCursor = (this.popupCursor + 1) % POPUP_POOL_SIZE;
    if (!slot) return;
    slot.active = true;
    slot.worldX = worldX;
    slot.worldY = worldY;
    slot.worldZ = worldZ;
    slot.life = style === 'GROGGY_CRIT' ? 0.95 : 0.72;
    slot.maxLife = slot.life;
    slot.value = value;
    slot.style = style;
  }

  public update(
    dtSec: number,
    bossPos: THREE.Vector3,
    bossScale: number,
    armorState: BossArmorState,
    _armorRatio: number,
    flashEffect: boolean
  ): void {
    if (this.disposed) return;
    const dt = Math.max(0.001, Math.min(0.05, dtSec));

    if (this.bannerTimer > 0) {
      this.bannerTimer = Math.max(0, this.bannerTimer - dt);
      if (this.bannerTimer <= 0) {
        this.bannerText = null;
        this.bannerSubText = null;
      }
    }
    this.whiteFlashAlpha = flashEffect ? Math.max(0, this.whiteFlashAlpha - dt * 2.5) : 0;

    // 1. Boss Shield Overlay (Cracked red pulse vs Intact subtle cyan vs Hidden on Groggy)
    if (armorState === 'CRACKED') {
      this.crackPhase += dt * 10;
      this.shieldMesh.visible = true;
      this.shieldMesh.position.set(bossPos.x, bossPos.y + 1.25 * bossScale, bossPos.z);
      this.shieldMesh.scale.setScalar(bossScale * (1.0 + Math.sin(this.crackPhase) * 0.04));
      this.shieldMesh.rotation.y += dt * 0.85;
      this.shieldMat.color.set('#ef4444');
      this.shieldMat.opacity = flashEffect
        ? 0.35 + Math.abs(Math.sin(this.crackPhase)) * 0.35
        : 0.38;
    } else if (armorState === 'INTACT') {
      this.shieldMesh.visible = true;
      this.shieldMesh.position.set(bossPos.x, bossPos.y + 1.25 * bossScale, bossPos.z);
      this.shieldMesh.scale.setScalar(bossScale);
      this.shieldMesh.rotation.y += dt * 0.35;
      this.shieldMat.color.set('#38bdf8');
      this.shieldMat.opacity = 0.2;
    } else {
      this.shieldMesh.visible = false;
    }

    // 2. 48-Shard Shatter Simulation
    if (this.shardTimer > 0) {
      this.shardTimer = Math.max(0, this.shardTimer - dt);
      const t = this.shardTimer / SHARD_LIFETIME_SEC;
      const scaleOut = Math.max(0, t * t);

      for (let i = 0; i < ARMOR_SHARD_COUNT; i += 1) {
        const idx = i * 3;
        this.shardPos[idx] = (this.shardPos[idx] ?? 0) + (this.shardVel[idx] ?? 0) * dt;
        this.shardPos[idx + 1] = (this.shardPos[idx + 1] ?? 0) + (this.shardVel[idx + 1] ?? 0) * dt;
        this.shardPos[idx + 2] = (this.shardPos[idx + 2] ?? 0) + (this.shardVel[idx + 2] ?? 0) * dt;
        this.shardVel[idx + 1] = (this.shardVel[idx + 1] ?? 0) - 16.5 * dt;
        if ((this.shardPos[idx + 1] ?? 0) < 0.05) {
          this.shardPos[idx + 1] = 0.05;
          this.shardVel[idx + 1] = Math.abs(this.shardVel[idx + 1] ?? 0) * 0.35;
        }
        this.shardRot[idx] = (this.shardRot[idx] ?? 0) + (this.shardSpin[idx] ?? 0) * dt;
        this.shardRot[idx + 1] = (this.shardRot[idx + 1] ?? 0) + (this.shardSpin[idx + 1] ?? 0) * dt;
        this.shardRot[idx + 2] = (this.shardRot[idx + 2] ?? 0) + (this.shardSpin[idx + 2] ?? 0) * dt;

        this.dummyObj.position.set(
          this.shardPos[idx] ?? 0,
          this.shardPos[idx + 1] ?? 0,
          this.shardPos[idx + 2] ?? 0
        );
        this.dummyObj.rotation.set(
          this.shardRot[idx] ?? 0,
          this.shardRot[idx + 1] ?? 0,
          this.shardRot[idx + 2] ?? 0
        );
        this.dummyObj.scale.setScalar(scaleOut);
        this.dummyObj.updateMatrix();
        this.shardMesh.setMatrixAt(i, this.dummyObj.matrix);
      }
      this.shardMesh.count = ARMOR_SHARD_COUNT;
      this.shardMesh.instanceMatrix.needsUpdate = true;
      this.shardMat.opacity = (flashEffect ? 0.95 : 0.7) * Math.min(1, t * 2);
      if (this.shardTimer <= 0) {
        this.shardMesh.visible = false;
      }
    }

    // 3. Boss 3D Groggy Stun Halo & Orbiting Stars
    if (armorState === 'BROKEN_GROGGY') {
      this.groggyGroup.visible = true;
      this.groggyAngle += dt * 4.2;
      this.groggyGroup.position.set(
        bossPos.x,
        bossPos.y + 2.45 * bossScale,
        bossPos.z
      );
      this.groggyGroup.rotation.y = this.groggyAngle;
      for (let i = 0; i < this.starMeshes.length; i += 1) {
        const star = this.starMeshes[i];
        if (!star) continue;
        star.rotation.y += dt * 6;
        star.position.y = Math.sin(this.groggyAngle * 2 + i) * 0.14;
      }
    } else {
      this.groggyGroup.visible = false;
    }

    // 4. Advance Damage Popups
    for (const p of this.popups) {
      if (!p.active) continue;
      p.life = Math.max(0, p.life - dt);
      p.worldY += 1.55 * dt;
      if (p.life <= 0) {
        p.active = false;
      }
    }
  }

  public getBannerState(): MusouBannerState {
    return {
      activeText: this.bannerText,
      subText: this.bannerSubText,
      color: this.bannerColor,
      alpha: this.bannerTimer > 0 ? Math.min(1, (this.bannerTimer / this.bannerMax) * 1.4) : 0,
      whiteFlashAlpha: this.whiteFlashAlpha
    };
  }

  public getProjectedPopups(
    camera: THREE.Camera,
    viewport: ViewportMetrics
  ): readonly ProjectedDamagePopup[] {
    this.projectedPopups.length = 0;
    camera.updateMatrixWorld();
    for (const p of this.popups) {
      if (!p.active) continue;
      this.projScratch.set(p.worldX, p.worldY, p.worldZ);
      this.projScratch.project(camera);
      if (this.projScratch.z > 1) continue;
      const screenX = (this.projScratch.x * 0.5 + 0.5) * viewport.viewWidth;
      const screenY = (-this.projScratch.y * 0.5 + 0.5) * viewport.viewHeight;
      const progress = 1 - p.life / Math.max(0.01, p.maxLife);
      this.projectedPopups.push({
        screenX,
        screenY,
        value: p.value,
        style: p.style,
        alpha: Math.min(1, (p.life / Math.max(0.01, p.maxLife)) * 1.5),
        scale: p.style === 'GROGGY_CRIT' ? 1.38 - progress * 0.25 : 1.0 - progress * 0.15
      });
    }
    return this.projectedPopups;
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.shieldGeo.dispose();
    this.shieldMat.dispose();
    this.shardGeo.dispose();
    this.shardMat.dispose();
    this.haloGeo.dispose();
    this.haloMat.dispose();
    this.starGeo.dispose();
    this.starMat.dispose();
    this.groggyGroup.clear();
    this.group.clear();
    this.group.parent?.remove(this.group);
  }
}
