import * as THREE from 'three';
import type { Disposable } from '../../../core/types/disposable';

interface RuneRingSlot {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
}

interface DetonationWaveSlot {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  life: number;
  maxLife: number;
}

/**
 * 3D VFX Pool for TECHNIQUE Action Type:
 * - Rotating purple ROOM rune rings while enemy is MARKED
 * - Detonation implosion/shockwave torus waves on mark detonation
 */
export class TechniqueMarkVfxPool implements Disposable {
  public readonly group = new THREE.Group();

  private readonly ringGeo: THREE.RingGeometry;
  private readonly runeRings: RuneRingSlot[] = [];

  private readonly waveGeo: THREE.TorusGeometry;
  private readonly waves: DetonationWaveSlot[] = [];

  private spinPhase = 0;
  private disposed = false;

  constructor(scene: THREE.Scene) {
    this.group.name = 'musou_technique_mark_vfx';
    scene.add(this.group);

    this.ringGeo = new THREE.RingGeometry(0.85, 1.15, 24);
    this.ringGeo.rotateX(-Math.PI * 0.5);
    for (let i = 0; i < 8; i += 1) {
      const mat = new THREE.MeshBasicMaterial({
        color: i % 2 === 0 ? '#a855f7' : '#c084fc',
        transparent: true,
        opacity: 0.78,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      });
      const mesh = new THREE.Mesh(this.ringGeo, mat);
      mesh.visible = false;
      this.group.add(mesh);
      this.runeRings.push({ mesh, mat });
    }

    this.waveGeo = new THREE.TorusGeometry(1.1, 0.08, 8, 28);
    this.waveGeo.rotateX(Math.PI * 0.5);
    for (let i = 0; i < 2; i += 1) {
      const mat = new THREE.MeshBasicMaterial({
        color: '#c084fc',
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      });
      const mesh = new THREE.Mesh(this.waveGeo, mat);
      mesh.visible = false;
      this.group.add(mesh);
      this.waves.push({ mesh, mat, life: 0, maxLife: 0.4 });
    }
  }

  public getVisibleMarkRingCount(): number {
    let n = 0;
    for (const r of this.runeRings) {
      if (r.mesh.visible) n += 1;
    }
    return n;
  }

  public syncBossMark(
    bossPos: THREE.Vector3,
    bossScale: number,
    markedTicks: number,
    stacks: number
  ): void {
    if (this.disposed) return;
    const count = markedTicks > 0 ? Math.min(this.runeRings.length, Math.max(1, stacks * 2)) : 0;
    for (let i = 0; i < this.runeRings.length; i += 1) {
      const r = this.runeRings[i];
      if (!r) continue;
      if (i >= count) {
        r.mesh.visible = false;
        continue;
      }
      r.mesh.visible = true;
      r.mesh.position.set(bossPos.x, bossPos.y + 0.35 + i * 0.42, bossPos.z);
      r.mesh.rotation.y = this.spinPhase * (i % 2 === 0 ? 1 : -1.3) + i * 0.7;
      r.mesh.scale.setScalar(bossScale * (1.1 + i * 0.16));
    }
  }

  public triggerDetonation(pos: THREE.Vector3, flashEffect: boolean): void {
    if (this.disposed) return;
    const slot = this.waves.find((w) => w.life <= 0) ?? this.waves[0];
    if (!slot) return;
    slot.life = slot.maxLife;
    slot.mesh.position.set(pos.x, pos.y + 0.5, pos.z);
    slot.mesh.scale.setScalar(4.8);
    slot.mat.opacity = flashEffect ? 0.92 : 0.45;
    slot.mesh.visible = true;
  }

  public update(dtSec: number, flashEffect: boolean): void {
    if (this.disposed) return;
    const dt = Math.max(0.001, Math.min(0.05, dtSec));
    this.spinPhase += dt * 3.2;

    for (const w of this.waves) {
      if (w.life <= 0) continue;
      w.life = Math.max(0, w.life - dt);
      const t = w.life / Math.max(0.01, w.maxLife);
      // Implode inward toward mark center on detonation
      w.mesh.scale.setScalar(0.5 + t * 4.4);
      w.mat.opacity = (flashEffect ? 0.92 : 0.45) * t;
      if (w.life <= 0) {
        w.mesh.visible = false;
      }
    }
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.ringGeo.dispose();
    for (const r of this.runeRings) r.mat.dispose();
    this.waveGeo.dispose();
    for (const w of this.waves) w.mat.dispose();
    this.group.clear();
    this.group.parent?.remove(this.group);
  }
}
