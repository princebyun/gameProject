import * as THREE from 'three';
import type { MusouActionType } from '../../../core/battle/musou/MusouTypes';
import type { Disposable } from '../../../core/types/disposable';

const ACTION_TYPE_COLORS: Record<MusouActionType, string> = {
  POWER: '#ef4444',
  SPEED: '#22d3ee',
  TECHNIQUE: '#a855f7',
  SKY: '#facc15'
};

interface DashGhostSlot {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  life: number;
  maxLife: number;
  baseOpacity: number;
}

interface SkyHoverRingSlot {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  life: number;
  maxLife: number;
}

/**
 * Zero-allocation 3D VFX pool for Power Dash Cancel:
 * - 3x staggered Toon afterimage silhouettes tinted by Action Type
 * - 1x sonic Wind Cone aligned to dash heading
 * - 6x Sky Moonwalk air-hop shockwave rings
 */
export class PowerDashVfxPool implements Disposable {
  public readonly group = new THREE.Group();

  private readonly ghostGeo: THREE.CapsuleGeometry;
  private readonly ghosts: DashGhostSlot[] = [];

  private readonly windConeGeo: THREE.ConeGeometry;
  private readonly windConeMat: THREE.MeshBasicMaterial;
  private readonly windConeMesh: THREE.Mesh;
  private windConeLife = 0;

  private readonly ringGeo: THREE.RingGeometry;
  private readonly hoverRings: SkyHoverRingSlot[] = [];

  private readonly lookAtScratch = new THREE.Vector3();
  private disposed = false;

  constructor(scene: THREE.Scene) {
    this.group.name = 'musou_power_dash_vfx';
    scene.add(this.group);

    this.ghostGeo = new THREE.CapsuleGeometry(0.32, 0.96, 4, 8);
    for (let i = 0; i < 3; i += 1) {
      const mat = new THREE.MeshBasicMaterial({
        color: ACTION_TYPE_COLORS.SPEED,
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      });
      const mesh = new THREE.Mesh(this.ghostGeo, mat);
      mesh.visible = false;
      this.group.add(mesh);
      this.ghosts.push({
        mesh,
        mat,
        life: 0,
        maxLife: 0.28 + i * 0.06,
        baseOpacity: 0.62 - i * 0.14
      });
    }

    this.windConeGeo = new THREE.ConeGeometry(1.05, 2.8, 16, 1, true);
    this.windConeGeo.rotateX(Math.PI * 0.5);
    this.windConeMat = new THREE.MeshBasicMaterial({
      color: '#e0f2fe',
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    this.windConeMesh = new THREE.Mesh(this.windConeGeo, this.windConeMat);
    this.windConeMesh.visible = false;
    this.group.add(this.windConeMesh);

    this.ringGeo = new THREE.RingGeometry(0.45, 0.92, 24);
    this.ringGeo.rotateX(-Math.PI * 0.5);
    for (let i = 0; i < 6; i += 1) {
      const mat = new THREE.MeshBasicMaterial({
        color: ACTION_TYPE_COLORS.SKY,
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      });
      const mesh = new THREE.Mesh(this.ringGeo, mat);
      mesh.visible = false;
      this.group.add(mesh);
      this.hoverRings.push({
        mesh,
        mat,
        life: 0,
        maxLife: 0.34
      });
    }
  }

  public getActiveGhostCount(): number {
    let n = 0;
    for (const g of this.ghosts) {
      if (g.life > 0) n += 1;
    }
    return n;
  }

  public getActiveHoverRingCount(): number {
    let n = 0;
    for (const r of this.hoverRings) {
      if (r.life > 0) n += 1;
    }
    return n;
  }

  public isWindConeVisible(): boolean {
    return this.windConeMesh.visible;
  }

  public triggerPowerDash(
    pos: THREE.Vector3,
    dir: THREE.Vector3,
    actionType: MusouActionType,
    isAirborne: boolean,
    flashEffect: boolean
  ): void {
    if (this.disposed) return;
    const tint = ACTION_TYPE_COLORS[actionType] ?? '#38bdf8';
    const yaw = Math.atan2(dir.x, dir.z);
    const maxOpacityCap = flashEffect ? 0.65 : 0.28;

    for (let i = 0; i < this.ghosts.length; i += 1) {
      const slot = this.ghosts[i];
      if (!slot) continue;
      const offsetBack = 0.2 + i * 0.62;
      slot.life = slot.maxLife;
      slot.mat.color.set(tint);
      slot.baseOpacity = Math.min(maxOpacityCap, 0.62 - i * 0.14);
      slot.mat.opacity = slot.baseOpacity;
      slot.mesh.position.set(
        pos.x - dir.x * offsetBack,
        pos.y + 0.92,
        pos.z - dir.z * offsetBack
      );
      slot.mesh.rotation.y = yaw;
      slot.mesh.scale.setScalar(1.0 + i * 0.05);
      slot.mesh.visible = true;
    }

    this.windConeLife = 0.24;
    this.windConeMesh.visible = true;
    this.windConeMesh.position.set(
      pos.x + dir.x * 1.1,
      pos.y + 1.05,
      pos.z + dir.z * 1.1
    );
    this.lookAtScratch.set(
      this.windConeMesh.position.x + dir.x,
      this.windConeMesh.position.y,
      this.windConeMesh.position.z + dir.z
    );
    this.windConeMesh.lookAt(this.lookAtScratch);
    this.windConeMesh.scale.setScalar(1.0);
    this.windConeMat.color.set(tint);
    this.windConeMat.opacity = flashEffect ? 0.44 : 0.2;

    if (isAirborne) {
      this.triggerSkyHoverRing(pos, flashEffect);
    }
  }

  public triggerSkyHoverRing(pos: THREE.Vector3, flashEffect: boolean): void {
    if (this.disposed) return;
    const slot = this.hoverRings.find((r) => r.life <= 0) ?? this.hoverRings[0];
    if (!slot) return;
    slot.life = slot.maxLife;
    slot.mat.color.set(ACTION_TYPE_COLORS.SKY);
    slot.mat.opacity = flashEffect ? 0.85 : 0.35;
    slot.mesh.position.set(pos.x, Math.max(0.15, pos.y + 0.05), pos.z);
    slot.mesh.scale.setScalar(0.55);
    slot.mesh.visible = true;
  }

  public update(dtSec: number, flashEffect: boolean): void {
    if (this.disposed) return;
    const dt = Math.max(0.001, Math.min(0.05, dtSec));

    for (const g of this.ghosts) {
      if (g.life <= 0) continue;
      g.life = Math.max(0, g.life - dt);
      const t = g.life / Math.max(0.01, g.maxLife);
      g.mat.opacity = g.baseOpacity * t * (flashEffect ? 1.0 : 0.55);
      g.mesh.scale.setScalar(1.0 + (1 - t) * 0.22);
      if (g.life <= 0) {
        g.mesh.visible = false;
      }
    }

    if (this.windConeLife > 0) {
      this.windConeLife = Math.max(0, this.windConeLife - dt);
      const t = this.windConeLife / 0.24;
      this.windConeMat.opacity = (flashEffect ? 0.44 : 0.2) * t;
      this.windConeMesh.scale.set(1.0 + (1 - t) * 0.45, 1.0 + (1 - t) * 0.45, 1.0 + (1 - t) * 0.6);
      if (this.windConeLife <= 0) {
        this.windConeMesh.visible = false;
      }
    }

    for (const r of this.hoverRings) {
      if (r.life <= 0) continue;
      r.life = Math.max(0, r.life - dt);
      const progress = 1 - r.life / Math.max(0.01, r.maxLife);
      r.mesh.scale.setScalar(0.55 + progress * 2.1);
      r.mat.opacity = (flashEffect ? 0.85 : 0.35) * (1 - progress);
      if (r.life <= 0) {
        r.mesh.visible = false;
      }
    }
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.ghostGeo.dispose();
    for (const g of this.ghosts) g.mat.dispose();
    this.windConeGeo.dispose();
    this.windConeMat.dispose();
    this.ringGeo.dispose();
    for (const r of this.hoverRings) r.mat.dispose();
    this.group.clear();
    this.group.parent?.remove(this.group);
  }
}
