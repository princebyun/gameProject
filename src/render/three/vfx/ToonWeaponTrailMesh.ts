import * as THREE from 'three';
import type {
  TrailWindowRule,
  WeaponSlotKey,
  WeaponTrailTheme
} from '../../../data/assets/weapons3dRegistry';
import {
  createToonSlashMaterial,
  updateToonSlashMaterial
} from '../shaders/ToonSlashShader';

export const TRAIL_MAX_SEGMENTS = 32;
export const TRAIL_VERTEX_COUNT = TRAIL_MAX_SEGMENTS * 2;

interface TrailSampleSlot {
  base: THREE.Vector3;
  tip: THREE.Vector3;
  age: number;
  active: boolean;
}

export function isProgressInTrailWindow(
  normalizedProgress: number,
  rules: readonly TrailWindowRule[],
  slot: WeaponSlotKey
): boolean {
  if (rules.length === 0) return false;
  const p = Math.max(0, Math.min(1, normalizedProgress));
  for (let i = 0; i < rules.length; i += 1) {
    const r = rules[i];
    if (!r) continue;
    if (r.weapons.includes(slot) && p >= r.start && p <= r.end) {
      return true;
    }
  }
  return false;
}

function catmullRomScalar(p0: number, p1: number, p2: number, p3: number, t: number): number {
  const t2 = t * t;
  const t3 = t2 * t;
  return (
    0.5 *
    (2 * p1 +
      (-p0 + p2) * t +
      (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
      (-p0 + 3 * p1 - 3 * p2 + p3) * t3)
  );
}

/**
 * Zero-allocation pre-allocated 32-segment ring-buffer 3D weapon trail mesh
 * with Catmull-Rom 3-step spline subsampling and attack-frame window synchronization.
 */
export class ToonWeaponTrailMesh {
  public readonly geometry: THREE.BufferGeometry;
  public readonly material: THREE.ShaderMaterial;
  public readonly mesh: THREE.Mesh;

  private readonly positions: Float32Array;
  private readonly uvs: Float32Array;
  private readonly positionAttr: THREE.BufferAttribute;
  private readonly uvAttr: THREE.BufferAttribute;

  private readonly ring: TrailSampleSlot[] = [];
  private headIdx = 0;
  private activeCount = 0;

  private readonly maxLifetimeSec: number;
  private theme: WeaponTrailTheme;

  // Pre-allocated Catmull-Rom spline history & scratch vectors (zero per-frame heap allocation)
  private hasPrevSamples = false;
  private readonly histBase0 = new THREE.Vector3();
  private readonly histBase1 = new THREE.Vector3();
  private readonly histBase2 = new THREE.Vector3();
  private readonly histTip0 = new THREE.Vector3();
  private readonly histTip1 = new THREE.Vector3();
  private readonly histTip2 = new THREE.Vector3();
  private readonly scratchBase = new THREE.Vector3();
  private readonly scratchTip = new THREE.Vector3();

  constructor(
    scene: THREE.Scene,
    theme: WeaponTrailTheme,
    options?: { renderOrder?: number; maxLifetimeSec?: number }
  ) {
    this.theme = { ...theme };
    this.maxLifetimeSec = options?.maxLifetimeSec ?? 0.22;

    this.positions = new Float32Array(TRAIL_VERTEX_COUNT * 3);
    this.uvs = new Float32Array(TRAIL_VERTEX_COUNT * 2);

    const indices = new Uint16Array((TRAIL_MAX_SEGMENTS - 1) * 6);
    for (let i = 0; i < TRAIL_MAX_SEGMENTS - 1; i += 1) {
      const a = i * 2;
      const b = a + 1;
      const c = a + 2;
      const d = a + 3;
      const idxOff = i * 6;
      indices[idxOff] = a;
      indices[idxOff + 1] = b;
      indices[idxOff + 2] = c;
      indices[idxOff + 3] = b;
      indices[idxOff + 4] = d;
      indices[idxOff + 5] = c;
    }

    this.geometry = new THREE.BufferGeometry();
    this.positionAttr = new THREE.BufferAttribute(this.positions, 3);
    this.positionAttr.setUsage(THREE.DynamicDrawUsage);
    this.uvAttr = new THREE.BufferAttribute(this.uvs, 2);
    this.uvAttr.setUsage(THREE.DynamicDrawUsage);

    this.geometry.setAttribute('position', this.positionAttr);
    this.geometry.setAttribute('uv', this.uvAttr);
    this.geometry.setIndex(new THREE.BufferAttribute(indices, 1));
    this.geometry.setDrawRange(0, 0);

    for (let i = 0; i < TRAIL_MAX_SEGMENTS; i += 1) {
      this.ring.push({
        base: new THREE.Vector3(),
        tip: new THREE.Vector3(),
        age: 0,
        active: false
      });
    }

    this.material = createToonSlashMaterial(this.theme);
    this.mesh = new THREE.Mesh(this.geometry, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    this.mesh.renderOrder = options?.renderOrder ?? 20;
    this.mesh.name = `toon_weapon_trail_${this.mesh.renderOrder}`;
    scene.add(this.mesh);
  }

  public getPositionBufferRef(): Float32Array {
    return this.positions;
  }

  public getActiveSegmentCount(): number {
    return this.activeCount;
  }

  public applyTheme(theme: WeaponTrailTheme, flashEffect = true, elapsedSec = 0): void {
    this.theme = { ...theme };
    updateToonSlashMaterial(this.material, this.theme, flashEffect, elapsedSec);
  }

  public clear(): void {
    for (let i = 0; i < this.ring.length; i += 1) {
      const slot = this.ring[i];
      if (slot) {
        slot.active = false;
        slot.age = 0;
      }
    }
    this.activeCount = 0;
    this.hasPrevSamples = false;
    this.geometry.setDrawRange(0, 0);
    this.mesh.visible = false;
  }

  private pushSlice(base: THREE.Vector3, tip: THREE.Vector3): void {
    this.headIdx = (this.headIdx - 1 + TRAIL_MAX_SEGMENTS) % TRAIL_MAX_SEGMENTS;
    const slot = this.ring[this.headIdx];
    if (!slot) return;
    slot.base.copy(base);
    slot.tip.copy(tip);
    slot.age = 0;
    slot.active = true;
    if (this.activeCount < TRAIL_MAX_SEGMENTS) {
      this.activeCount += 1;
    }
  }

  public update(
    dtSec: number,
    emitActive: boolean,
    baseWorld: THREE.Vector3,
    tipWorld: THREE.Vector3,
    elapsedSec: number,
    flashEffect = true
  ): void {
    const dt = Math.max(0.0005, Math.min(0.05, dtSec));
    updateToonSlashMaterial(this.material, this.theme, flashEffect, elapsedSec);

    // Age active samples & retire expired tail slices
    let nextActiveCount = 0;
    for (let offset = 0; offset < this.activeCount; offset += 1) {
      const idx = (this.headIdx + offset) % TRAIL_MAX_SEGMENTS;
      const slot = this.ring[idx];
      if (!slot || !slot.active) continue;
      slot.age += dt;
      if (slot.age >= this.maxLifetimeSec) {
        slot.active = false;
        break;
      }
      nextActiveCount += 1;
    }
    this.activeCount = nextActiveCount;

    if (emitActive) {
      if (!this.hasPrevSamples) {
        this.histBase0.copy(baseWorld);
        this.histBase1.copy(baseWorld);
        this.histBase2.copy(baseWorld);
        this.histTip0.copy(tipWorld);
        this.histTip1.copy(tipWorld);
        this.histTip2.copy(tipWorld);
        this.hasPrevSamples = true;
        this.pushSlice(baseWorld, tipWorld);
      } else {
        const tipDistSq = this.histTip2.distanceToSquared(tipWorld);
        const substeps = tipDistSq > 0.025 ? 3 : tipDistSq > 0.004 ? 2 : 1;

        for (let step = 1; step <= substeps; step += 1) {
          const t = step / substeps;
          this.scratchBase.set(
            catmullRomScalar(
              this.histBase0.x,
              this.histBase1.x,
              this.histBase2.x,
              baseWorld.x,
              t
            ),
            catmullRomScalar(
              this.histBase0.y,
              this.histBase1.y,
              this.histBase2.y,
              baseWorld.y,
              t
            ),
            catmullRomScalar(
              this.histBase0.z,
              this.histBase1.z,
              this.histBase2.z,
              baseWorld.z,
              t
            )
          );
          this.scratchTip.set(
            catmullRomScalar(
              this.histTip0.x,
              this.histTip1.x,
              this.histTip2.x,
              tipWorld.x,
              t
            ),
            catmullRomScalar(
              this.histTip0.y,
              this.histTip1.y,
              this.histTip2.y,
              tipWorld.y,
              t
            ),
            catmullRomScalar(
              this.histTip0.z,
              this.histTip1.z,
              this.histTip2.z,
              tipWorld.z,
              t
            )
          );
          this.pushSlice(this.scratchBase, this.scratchTip);
        }

        this.histBase0.copy(this.histBase1);
        this.histBase1.copy(this.histBase2);
        this.histBase2.copy(baseWorld);
        this.histTip0.copy(this.histTip1);
        this.histTip1.copy(this.histTip2);
        this.histTip2.copy(tipWorld);
      }
    } else {
      this.hasPrevSamples = false;
    }

    if (this.activeCount < 2) {
      this.geometry.setDrawRange(0, 0);
      this.mesh.visible = false;
      return;
    }

    const denom = Math.max(1, this.activeCount - 1);
    for (let offset = 0; offset < this.activeCount; offset += 1) {
      const slot = this.ring[(this.headIdx + offset) % TRAIL_MAX_SEGMENTS];
      if (!slot) continue;

      const pOff = offset * 6;
      this.positions[pOff] = slot.base.x;
      this.positions[pOff + 1] = slot.base.y;
      this.positions[pOff + 2] = slot.base.z;
      this.positions[pOff + 3] = slot.tip.x;
      this.positions[pOff + 4] = slot.tip.y;
      this.positions[pOff + 5] = slot.tip.z;

      const u = 1.0 - offset / denom;
      const uvOff = offset * 4;
      this.uvs[uvOff] = u;
      this.uvs[uvOff + 1] = 0.0;
      this.uvs[uvOff + 2] = u;
      this.uvs[uvOff + 3] = 1.0;
    }

    this.positionAttr.needsUpdate = true;
    this.uvAttr.needsUpdate = true;
    this.geometry.setDrawRange(0, (this.activeCount - 1) * 6);
    this.mesh.visible = true;
  }

  public dispose(): void {
    this.mesh.parent?.remove(this.mesh);
    this.geometry.dispose();
    this.material.dispose();
  }
}
