import * as THREE from 'three';
import type { AttackSweepVolume3D } from './Battle3DStateAdapter';
import { ThreeToonTuningConfig } from './threeTypes';
import {
  applyToonMaterialTuning,
  createAnimeToonMaterial,
  createToonOutlineMaterial
} from './shaders/AnimeToonMaterial';

export type DestructiblePropKind =
  | 'WOOD_HOUSE'
  | 'WATCHTOWER'
  | 'STONE_PILLAR'
  | 'CRATE_STACK'
  | 'WOOD_FENCE';

interface DestructiblePropEntry {
  id: string;
  kind: DestructiblePropKind;
  x: number;
  z: number;
  halfW: number;
  halfD: number;
  hp: number;
  maxHp: number;
  destroyed: boolean;
  group: THREE.Group;
}

interface DebrisShardSlot {
  active: boolean;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  rot: THREE.Vector3;
  spin: THREE.Vector3;
  life: number;
  maxLife: number;
  scale: number;
  colorHex: number;
}

interface DustPuffSlot {
  active: boolean;
  pos: THREE.Vector3;
  velY: number;
  life: number;
  maxLife: number;
  maxScale: number;
}

const DEBRIS_POOL_SIZE = 120;
const DUST_POOL_SIZE = 16;

interface PropSpec {
  id: string;
  kind: DestructiblePropKind;
  x: number;
  z: number;
}

const FOOSHA_PROP_LAYOUT: readonly PropSpec[] = [
  { id: 'house_nw', kind: 'WOOD_HOUSE', x: -13.5, z: -7.0 },
  { id: 'house_ne', kind: 'WOOD_HOUSE', x: 13.5, z: -7.0 },
  { id: 'tower_w', kind: 'WATCHTOWER', x: -15.5, z: 0.5 },
  { id: 'tower_e', kind: 'WATCHTOWER', x: 15.5, z: 0.5 },
  { id: 'pillar_n1', kind: 'STONE_PILLAR', x: -6.5, z: -5.8 },
  { id: 'pillar_n2', kind: 'STONE_PILLAR', x: 6.5, z: -5.8 },
  { id: 'pillar_s1', kind: 'STONE_PILLAR', x: -6.5, z: 5.8 },
  { id: 'pillar_s2', kind: 'STONE_PILLAR', x: 6.5, z: 5.8 },
  { id: 'crate_1', kind: 'CRATE_STACK', x: -9.5, z: -2.4 },
  { id: 'crate_2', kind: 'CRATE_STACK', x: 9.5, z: -2.4 },
  { id: 'crate_3', kind: 'CRATE_STACK', x: -9.5, z: 3.4 },
  { id: 'crate_4', kind: 'CRATE_STACK', x: 9.5, z: 3.4 },
  { id: 'crate_5', kind: 'CRATE_STACK', x: 0, z: -7.8 },
  { id: 'fence_1', kind: 'WOOD_FENCE', x: -12.0, z: 6.8 },
  { id: 'fence_2', kind: 'WOOD_FENCE', x: 12.0, z: 6.8 },
  { id: 'fence_3', kind: 'WOOD_FENCE', x: -3.2, z: 7.4 },
  { id: 'fence_4', kind: 'WOOD_FENCE', x: 3.2, z: 7.4 },
  { id: 'fence_5', kind: 'WOOD_FENCE', x: 0, z: -4.2 }
];

export class DestructiblePropSystem {
  public readonly group = new THREE.Group();

  private readonly props: DestructiblePropEntry[] = [];
  private readonly ownedGeometries: THREE.BufferGeometry[] = [];
  private readonly toonMaterials: THREE.ShaderMaterial[] = [];
  private readonly outlineMaterials: THREE.ShaderMaterial[] = [];

  private readonly debrisGeo: THREE.BoxGeometry;
  private readonly debrisMat: THREE.ShaderMaterial;
  private readonly debrisMesh: THREE.InstancedMesh;
  private readonly debrisSlots: DebrisShardSlot[] = [];

  private readonly dustGeo: THREE.DodecahedronGeometry;
  private readonly dustMat: THREE.MeshBasicMaterial;
  private readonly dustMesh: THREE.InstancedMesh;
  private readonly dustSlots: DustPuffSlot[] = [];

  private readonly scratchObj = new THREE.Object3D();
  private readonly scratchColor = new THREE.Color();

  constructor(scene: THREE.Scene) {
    this.group.name = 'foosha_destructibles_3d';
    scene.add(this.group);

    const woodMat = createAnimeToonMaterial({
      baseColor: '#d97706',
      shadowTint: '#78350f',
      rimColor: '#fde68a'
    });
    const roofMat = createAnimeToonMaterial({
      baseColor: '#dc2626',
      shadowTint: '#7f1d1d',
      rimColor: '#fca5a5'
    });
    const stoneMat = createAnimeToonMaterial({
      baseColor: '#cbd5e1',
      shadowTint: '#64748b',
      rimColor: '#f8fafc'
    });
    const outlineMat = createToonOutlineMaterial({ outlineWidth: 0.03 });
    this.toonMaterials.push(woodMat, roofMat, stoneMat);
    this.outlineMaterials.push(outlineMat);

    const houseBodyGeo = new THREE.BoxGeometry(2.6, 2.0, 2.2);
    const houseRoofGeo = new THREE.ConeGeometry(2.2, 1.3, 4);
    houseRoofGeo.rotateY(Math.PI * 0.25);

    const towerGeo = new THREE.BoxGeometry(1.5, 3.8, 1.5);
    const pillarGeo = new THREE.CylinderGeometry(0.55, 0.65, 2.9, 8);
    const crateGeo = new THREE.BoxGeometry(1.1, 1.0, 1.1);
    const fenceGeo = new THREE.BoxGeometry(2.4, 0.95, 0.35);

    this.ownedGeometries.push(
      houseBodyGeo,
      houseRoofGeo,
      towerGeo,
      pillarGeo,
      crateGeo,
      fenceGeo
    );

    const addPropMesh = (
      parent: THREE.Group,
      geo: THREE.BufferGeometry,
      mat: THREE.ShaderMaterial,
      y: number
    ) => {
      const m = new THREE.Mesh(geo, mat);
      m.position.y = y;
      m.castShadow = true;
      m.receiveShadow = true;
      parent.add(m);

      const o = new THREE.Mesh(geo, outlineMat);
      o.position.y = y;
      parent.add(o);
    };

    for (const spec of FOOSHA_PROP_LAYOUT) {
      const propGroup = new THREE.Group();
      propGroup.position.set(spec.x, 0, spec.z);
      let halfW = 0.7;
      let halfD = 0.7;
      let maxHp = 30;

      if (spec.kind === 'WOOD_HOUSE') {
        addPropMesh(propGroup, houseBodyGeo, woodMat, 1.0);
        addPropMesh(propGroup, houseRoofGeo, roofMat, 2.65);
        halfW = 1.4;
        halfD = 1.2;
        maxHp = 80;
      } else if (spec.kind === 'WATCHTOWER') {
        addPropMesh(propGroup, towerGeo, woodMat, 1.9);
        addPropMesh(propGroup, houseRoofGeo, roofMat, 4.35);
        halfW = 0.9;
        halfD = 0.9;
        maxHp = 70;
      } else if (spec.kind === 'STONE_PILLAR') {
        addPropMesh(propGroup, pillarGeo, stoneMat, 1.45);
        halfW = 0.7;
        halfD = 0.7;
        maxHp = 60;
      } else if (spec.kind === 'CRATE_STACK') {
        addPropMesh(propGroup, crateGeo, woodMat, 0.5);
        halfW = 0.65;
        halfD = 0.65;
        maxHp = 25;
      } else {
        addPropMesh(propGroup, fenceGeo, woodMat, 0.48);
        halfW = 1.25;
        halfD = 0.3;
        maxHp = 20;
      }

      this.group.add(propGroup);
      this.props.push({
        id: spec.id,
        kind: spec.kind,
        x: spec.x,
        z: spec.z,
        halfW,
        halfD,
        hp: maxHp,
        maxHp,
        destroyed: false,
        group: propGroup
      });
    }

    // Shared 120-shard Debris InstancedMesh pool (1 draw call)
    this.debrisGeo = new THREE.BoxGeometry(0.28, 0.22, 0.34);
    this.debrisMat = createAnimeToonMaterial({
      baseColor: '#ffffff',
      shadowTint: '#475569',
      rimColor: '#fde68a'
    });
    this.debrisMesh = new THREE.InstancedMesh(this.debrisGeo, this.debrisMat, DEBRIS_POOL_SIZE);
    this.debrisMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.debrisMesh.frustumCulled = false;

    for (let i = 0; i < DEBRIS_POOL_SIZE; i += 1) {
      this.debrisSlots.push({
        active: false,
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        rot: new THREE.Vector3(),
        spin: new THREE.Vector3(),
        life: 0,
        maxLife: 2.0,
        scale: 1,
        colorHex: 0xd97706
      });
      this.scratchColor.setHex(0xd97706);
      this.debrisMesh.setColorAt(i, this.scratchColor);
    }
    this.debrisMesh.count = 0;
    this.group.add(this.debrisMesh);

    // Shared 16-puff Toon Dust InstancedMesh pool (1 draw call)
    this.dustGeo = new THREE.DodecahedronGeometry(0.75, 0);
    this.dustMat = new THREE.MeshBasicMaterial({
      color: '#f1f5f9',
      transparent: true,
      opacity: 0.72
    });
    this.dustMesh = new THREE.InstancedMesh(this.dustGeo, this.dustMat, DUST_POOL_SIZE);
    this.dustMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.dustMesh.frustumCulled = false;
    this.dustMesh.count = 0;
    for (let i = 0; i < DUST_POOL_SIZE; i += 1) {
      this.dustSlots.push({
        active: false,
        pos: new THREE.Vector3(),
        velY: 1.4,
        life: 0,
        maxLife: 0.65,
        maxScale: 2.2
      });
    }
    this.group.add(this.dustMesh);
  }

  public getTotalCount(): number {
    return this.props.length;
  }

  public getRemainingCount(): number {
    let rem = 0;
    for (const p of this.props) {
      if (!p.destroyed) rem += 1;
    }
    return rem;
  }

  public getActiveDebrisCount(): number {
    let count = 0;
    for (const d of this.debrisSlots) {
      if (d.active) count += 1;
    }
    return count;
  }

  public blocksMovement(x: number, z: number, radius = 0.55): boolean {
    for (const prop of this.props) {
      if (prop.destroyed) continue;
      if (
        Math.abs(x - prop.x) < prop.halfW + radius &&
        Math.abs(z - prop.z) < prop.halfD + radius
      ) {
        return true;
      }
    }
    return false;
  }

  public getFirstIntactProp(): Readonly<{ id: string; x: number; z: number }> | null {
    const found = this.props.find((p) => !p.destroyed);
    return found ? { id: found.id, x: found.x, z: found.z } : null;
  }

  public applyAttackSweeps(sweeps: readonly AttackSweepVolume3D[]): number {
    if (sweeps.length === 0) return 0;
    let shattered = 0;

    for (const sweep of sweeps) {
      const rSq = (sweep.radiusMeters + 0.9) * (sweep.radiusMeters + 0.9);
      for (const prop of this.props) {
        if (prop.destroyed) continue;
        const dx = prop.x - sweep.origin.x;
        const dz = prop.z - sweep.origin.z;
        if (dx * dx + dz * dz <= rSq) {
          prop.hp -= Math.max(35, sweep.power * 0.45);
          if (prop.hp <= 0) {
            this.shatterProp(prop, sweep.origin);
            shattered += 1;
          }
        }
      }
    }
    return shattered;
  }

  public triggerRadiusDestruction(origin: THREE.Vector3, radiusMeters = 9.0): number {
    const rSq = radiusMeters * radiusMeters;
    let shattered = 0;

    for (const prop of this.props) {
      if (prop.destroyed) continue;
      const dx = prop.x - origin.x;
      const dz = prop.z - origin.z;
      if (dx * dx + dz * dz <= rSq) {
        this.shatterProp(prop, origin);
        shattered += 1;
      }
    }
    return shattered;
  }

  private shatterProp(prop: DestructiblePropEntry, impactOrigin: THREE.Vector3): void {
    prop.hp = 0;
    prop.destroyed = true;
    prop.group.visible = false;

    const shardColor =
      prop.kind === 'STONE_PILLAR'
        ? 0xcbd5e1
        : prop.kind === 'WOOD_HOUSE'
          ? 0xdc2626
          : 0xd97706;
    const dx = prop.x - impactOrigin.x;
    const dz = prop.z - impactOrigin.z;
    const dist = Math.hypot(dx, dz) || 1;
    const dirX = dx / dist;
    const dirZ = dz / dist;

    let spawned = 0;
    for (let i = 0; i < this.debrisSlots.length && spawned < 10; i += 1) {
      const slot = this.debrisSlots[i];
      if (!slot || slot.active) continue;
      const spreadAngle = ((spawned - 4.5) / 5) * 1.4;
      const vx = (Math.cos(spreadAngle) * dirX - Math.sin(spreadAngle) * dirZ) * (5 + (spawned % 4));
      const vz = (Math.sin(spreadAngle) * dirX + Math.cos(spreadAngle) * dirZ) * (5 + (spawned % 4));

      slot.active = true;
      slot.life = 2.0;
      slot.maxLife = 2.0;
      slot.pos.set(prop.x, 0.8 + (spawned % 3) * 0.45, prop.z);
      slot.vel.set(vx, 5.5 + (spawned % 4) * 1.4, vz);
      slot.rot.set(spawned * 0.5, spawned * 0.7, 0);
      slot.spin.set(7.5, -5.2, 6.4);
      slot.scale = prop.kind === 'WOOD_HOUSE' || prop.kind === 'WATCHTOWER' ? 1.35 : 0.95;
      slot.colorHex = spawned % 3 === 0 && prop.kind === 'WOOD_HOUSE' ? 0xdc2626 : shardColor;
      spawned += 1;
    }

    let dustSpawned = 0;
    for (let i = 0; i < this.dustSlots.length && dustSpawned < 2; i += 1) {
      const slot = this.dustSlots[i];
      if (!slot || slot.active) continue;
      slot.active = true;
      slot.life = 0.65;
      slot.maxLife = 0.65;
      slot.pos.set(prop.x + (dustSpawned === 0 ? -0.4 : 0.4), 0.75, prop.z);
      slot.velY = 1.6;
      slot.maxScale = 2.1;
      dustSpawned += 1;
    }
  }

  public update(dtSec: number): void {
    const dt = Math.max(0.001, Math.min(0.05, dtSec));

    let activeDebris = 0;
    for (const slot of this.debrisSlots) {
      if (!slot.active) continue;
      slot.life -= dt;
      if (slot.life <= 0) {
        slot.active = false;
        continue;
      }
      slot.pos.addScaledVector(slot.vel, dt);
      slot.vel.y -= 20 * dt;
      if (slot.pos.y <= 0.14 && slot.vel.y < 0) {
        slot.pos.y = 0.14;
        slot.vel.y = Math.abs(slot.vel.y) * 0.35;
        slot.vel.x *= 0.68;
        slot.vel.z *= 0.68;
      }
      slot.rot.addScaledVector(slot.spin, dt);

      const fade = slot.life < 0.45 ? Math.max(0.01, slot.life / 0.45) : 1;
      this.scratchObj.position.copy(slot.pos);
      this.scratchObj.rotation.set(slot.rot.x, slot.rot.y, slot.rot.z);
      this.scratchObj.scale.setScalar(slot.scale * fade);
      this.scratchObj.updateMatrix();

      this.debrisMesh.setMatrixAt(activeDebris, this.scratchObj.matrix);
      this.scratchColor.setHex(slot.colorHex);
      this.debrisMesh.setColorAt(activeDebris, this.scratchColor);
      activeDebris += 1;
    }
    this.debrisMesh.count = activeDebris;
    if (activeDebris > 0) {
      this.debrisMesh.instanceMatrix.needsUpdate = true;
      if (this.debrisMesh.instanceColor) {
        this.debrisMesh.instanceColor.needsUpdate = true;
      }
    }

    let activeDust = 0;
    for (const d of this.dustSlots) {
      if (!d.active) continue;
      d.life -= dt;
      if (d.life <= 0) {
        d.active = false;
        continue;
      }
      d.pos.y += d.velY * dt;
      const t = 1 - d.life / d.maxLife;
      const scale = d.maxScale * (0.45 + t * 0.85) * (d.life / d.maxLife);
      this.scratchObj.position.copy(d.pos);
      this.scratchObj.rotation.set(t * 2, t * 3, 0);
      this.scratchObj.scale.setScalar(Math.max(0.01, scale));
      this.scratchObj.updateMatrix();
      this.dustMesh.setMatrixAt(activeDust, this.scratchObj.matrix);
      activeDust += 1;
    }
    this.dustMesh.count = activeDust;
    if (activeDust > 0) {
      this.dustMesh.instanceMatrix.needsUpdate = true;
    }
  }

  public resetAll(): void {
    for (const p of this.props) {
      p.hp = p.maxHp;
      p.destroyed = false;
      p.group.visible = true;
    }
    for (const s of this.debrisSlots) s.active = false;
    for (const d of this.dustSlots) d.active = false;
    this.debrisMesh.count = 0;
    this.dustMesh.count = 0;
  }

  public applyTuning(
    tuning: ThreeToonTuningConfig,
    sunDirection?: THREE.Vector3,
    sunColor?: THREE.Color,
    ambientColor?: THREE.Color
  ): void {
    for (const mat of this.toonMaterials) {
      applyToonMaterialTuning(mat, tuning, sunDirection, sunColor, ambientColor);
    }
    for (const mat of this.outlineMaterials) {
      applyToonMaterialTuning(mat, tuning);
    }
    applyToonMaterialTuning(this.debrisMat, tuning, sunDirection, sunColor, ambientColor);
  }

  public dispose(): void {
    for (const geo of this.ownedGeometries) geo.dispose();
    for (const mat of this.toonMaterials) mat.dispose();
    for (const mat of this.outlineMaterials) mat.dispose();
    this.debrisGeo.dispose();
    this.debrisMat.dispose();
    this.dustGeo.dispose();
    this.dustMat.dispose();
    this.group.clear();
    this.group.parent?.remove(this.group);
  }
}
