import * as THREE from 'three';

export const MAX_STARBURSTS = 24;
export const MAX_CROSS_SLASHES = 16;
export const MAX_SHOCKWAVES = 12;
export const MAX_HAKI_ARCS = 12;

export type ComicSparkKind = 'STARBURST' | 'CROSS_SLASH' | 'HAKI_ARC' | 'PARRY_SHOCKWAVE';

export interface ComicSparkSpawnInput {
  kind: ComicSparkKind;
  position: THREE.Vector3;
  dir?: THREE.Vector3;
  color: THREE.ColorRepresentation;
  intensity?: number;
}

interface InstancedSparkSlot {
  active: boolean;
  life: number;
  maxLife: number;
  pos: THREE.Vector3;
  rotY: number;
  rotZ: number;
  maxScale: number;
  colorHex: number;
}

interface HakiArcLineSlot {
  line: THREE.Line;
  geometry: THREE.BufferGeometry;
  material: THREE.LineBasicMaterial;
  positions: Float32Array;
  active: boolean;
  life: number;
  maxLife: number;
}

function buildStarburstGeometry(): THREE.BufferGeometry {
  // 8-point crisp comic starburst star polygon (16 perimeter verts around center)
  const pts: number[] = [];
  const spikes = 8;
  const outerR = 0.65;
  const innerR = 0.16;

  for (let i = 0; i < spikes * 2; i += 1) {
    const a0 = (i / (spikes * 2)) * Math.PI * 2;
    const a1 = ((i + 1) / (spikes * 2)) * Math.PI * 2;
    const r0 = i % 2 === 0 ? outerR : innerR;
    const r1 = (i + 1) % 2 === 0 ? outerR : innerR;

    pts.push(0, 0, 0);
    pts.push(Math.cos(a0) * r0, Math.sin(a0) * r0, 0);
    pts.push(Math.cos(a1) * r1, Math.sin(a1) * r1, 0);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  return geo;
}

function buildCrossSlashGeometry(): THREE.BufferGeometry {
  // Sharp tapered anime slash diamond
  const pts = new Float32Array([
    -1.2, 0, 0,
    0, 0.11, 0,
    1.2, 0, 0,
    -1.2, 0, 0,
    1.2, 0, 0,
    0, -0.11, 0
  ]);
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pts, 3));
  return geo;
}

function pickCircularSlot(slots: InstancedSparkSlot[]): InstancedSparkSlot {
  let oldest = slots[0]!;
  for (let i = 0; i < slots.length; i += 1) {
    const s = slots[i];
    if (!s) continue;
    if (!s.active) return s;
    if (s.life < oldest.life) {
      oldest = s;
    }
  }
  return oldest;
}

function createSlotArray(count: number): InstancedSparkSlot[] {
  const arr: InstancedSparkSlot[] = [];
  for (let i = 0; i < count; i += 1) {
    arr.push({
      active: false,
      life: 0,
      maxLife: 0.14,
      pos: new THREE.Vector3(),
      rotY: 0,
      rotZ: 0,
      maxScale: 1,
      colorHex: 0xffffff
    });
  }
  return arr;
}

/**
 * Zero-runtime-allocation 3D comic hit spark pool supporting starburst flashes,
 * directional cross slashes, Haki lightning arcs, and shockwave rings with circular slot eviction
 * and strict photosensitive accessibility protection (flashEffect === false).
 */
export class ComicHitSparkPool {
  public readonly group = new THREE.Group();

  private readonly starGeo: THREE.BufferGeometry;
  private readonly starMat: THREE.MeshBasicMaterial;
  private readonly starMesh: THREE.InstancedMesh;
  private readonly starSlots = createSlotArray(MAX_STARBURSTS);

  private readonly crossGeo: THREE.BufferGeometry;
  private readonly crossMat: THREE.MeshBasicMaterial;
  private readonly crossMesh: THREE.InstancedMesh;
  private readonly crossSlots = createSlotArray(MAX_CROSS_SLASHES);

  private readonly ringGeo: THREE.RingGeometry;
  private readonly ringMat: THREE.MeshBasicMaterial;
  private readonly ringMesh: THREE.InstancedMesh;
  private readonly ringSlots = createSlotArray(MAX_SHOCKWAVES);

  private readonly arcSlots: HakiArcLineSlot[] = [];

  private readonly scratchObj = new THREE.Object3D();
  private readonly scratchColor = new THREE.Color();
  private readonly scratchDir = new THREE.Vector3();
  private spawnSeq = 0;

  constructor(scene: THREE.Scene) {
    this.group.name = 'comic_hit_spark_pool';
    scene.add(this.group);

    this.starGeo = buildStarburstGeometry();
    this.starMat = new THREE.MeshBasicMaterial({
      color: '#ffffff',
      transparent: true,
      opacity: 0.94,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    this.starMesh = new THREE.InstancedMesh(this.starGeo, this.starMat, MAX_STARBURSTS);
    this.starMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.starMesh.frustumCulled = false;
    this.starMesh.count = 0;
    this.starMesh.renderOrder = 30;
    for (let i = 0; i < MAX_STARBURSTS; i += 1) {
      this.starMesh.setColorAt(i, this.scratchColor.set('#fef08a'));
    }
    this.group.add(this.starMesh);

    this.crossGeo = buildCrossSlashGeometry();
    this.crossMat = new THREE.MeshBasicMaterial({
      color: '#ffffff',
      transparent: true,
      opacity: 0.92,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    this.crossMesh = new THREE.InstancedMesh(this.crossGeo, this.crossMat, MAX_CROSS_SLASHES);
    this.crossMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.crossMesh.frustumCulled = false;
    this.crossMesh.count = 0;
    this.crossMesh.renderOrder = 31;
    for (let i = 0; i < MAX_CROSS_SLASHES; i += 1) {
      this.crossMesh.setColorAt(i, this.scratchColor.set('#38bdf8'));
    }
    this.group.add(this.crossMesh);

    this.ringGeo = new THREE.RingGeometry(0.45, 0.85, 24);
    this.ringGeo.rotateX(-Math.PI * 0.5);
    this.ringMat = new THREE.MeshBasicMaterial({
      color: '#ffffff',
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    this.ringMesh = new THREE.InstancedMesh(this.ringGeo, this.ringMat, MAX_SHOCKWAVES);
    this.ringMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.ringMesh.frustumCulled = false;
    this.ringMesh.count = 0;
    this.ringMesh.renderOrder = 29;
    for (let i = 0; i < MAX_SHOCKWAVES; i += 1) {
      this.ringMesh.setColorAt(i, this.scratchColor.set('#a855f7'));
    }
    this.group.add(this.ringMesh);

    for (let i = 0; i < MAX_HAKI_ARCS; i += 1) {
      const positions = new Float32Array(7 * 3);
      const geometry = new THREE.BufferGeometry();
      const attr = new THREE.BufferAttribute(positions, 3);
      attr.setUsage(THREE.DynamicDrawUsage);
      geometry.setAttribute('position', attr);

      const material = new THREE.LineBasicMaterial({
        color: '#ef4444',
        transparent: true,
        opacity: 0.95
      });
      const line = new THREE.Line(geometry, material);
      line.frustumCulled = false;
      line.visible = false;
      line.renderOrder = 32;
      this.group.add(line);

      this.arcSlots.push({
        line,
        geometry,
        material,
        positions,
        active: false,
        life: 0,
        maxLife: 0.18
      });
    }
  }

  private resolveSafeColorHex(
    color: THREE.ColorRepresentation,
    flashEffect: boolean
  ): number {
    this.scratchColor.set(color);
    if (!flashEffect) {
      // Clamp pure bright white/over-saturated flashes under photosensitive safety mode
      this.scratchColor.multiplyScalar(0.55);
    }
    return this.scratchColor.getHex();
  }

  public spawnStarburst(
    pos: THREE.Vector3,
    color: THREE.ColorRepresentation = '#fef08a',
    flashEffect = true,
    scale = 1.15
  ): void {
    const slot = pickCircularSlot(this.starSlots);
    slot.active = true;
    slot.life = 0.14;
    slot.maxLife = 0.14;
    slot.pos.copy(pos);
    slot.rotY = (this.spawnSeq * 0.9) % (Math.PI * 2);
    slot.rotZ = (this.spawnSeq * 0.55) % (Math.PI * 2);
    slot.maxScale = flashEffect ? scale : scale * 0.72;
    slot.colorHex = this.resolveSafeColorHex(color, flashEffect);
    this.spawnSeq += 1;
  }

  public spawnCrossSlash(
    pos: THREE.Vector3,
    dir: THREE.Vector3 | undefined,
    color: THREE.ColorRepresentation = '#38bdf8',
    flashEffect = true
  ): void {
    const yaw = dir ? Math.atan2(dir.x, dir.z) : 0;
    for (let k = 0; k < 2; k += 1) {
      const slot = pickCircularSlot(this.crossSlots);
      slot.active = true;
      slot.life = 0.18;
      slot.maxLife = 0.18;
      slot.pos.copy(pos);
      slot.rotY = yaw + (k === 0 ? 0.3 : -0.3);
      slot.rotZ = k === 0 ? 0.58 : -0.58;
      slot.maxScale = flashEffect ? 1.35 : 0.9;
      slot.colorHex = this.resolveSafeColorHex(color, flashEffect);
    }
  }

  public spawnShockwave(
    pos: THREE.Vector3,
    color: THREE.ColorRepresentation = '#facc15',
    flashEffect = true,
    maxScale = 3.6
  ): void {
    const slot = pickCircularSlot(this.ringSlots);
    slot.active = true;
    slot.life = 0.28;
    slot.maxLife = 0.28;
    slot.pos.set(pos.x, Math.max(0.08, pos.y), pos.z);
    slot.rotY = 0;
    slot.rotZ = 0;
    slot.maxScale = flashEffect ? maxScale : maxScale * 0.8;
    slot.colorHex = this.resolveSafeColorHex(color, flashEffect);
  }

  public spawnHakiArc(
    pos: THREE.Vector3,
    color: THREE.ColorRepresentation = '#ef4444',
    flashEffect = true
  ): void {
    let target = this.arcSlots[0]!;
    for (const s of this.arcSlots) {
      if (!s.active) {
        target = s;
        break;
      }
      if (s.life < target.life) {
        target = s;
      }
    }

    target.active = true;
    target.life = 0.18;
    target.maxLife = 0.18;
    target.material.color.setHex(this.resolveSafeColorHex(color, flashEffect));
    target.material.opacity = flashEffect ? 0.95 : 0.55;

    const baseAngle = (this.spawnSeq * 1.37) % (Math.PI * 2);
    this.scratchDir.set(Math.cos(baseAngle), 0.35 + (this.spawnSeq % 3) * 0.2, Math.sin(baseAngle)).normalize();
    for (let v = 0; v < 7; v += 1) {
      const dist = (v / 6) * (flashEffect ? 2.4 : 1.75);
      const jitterSide = v === 0 || v === 6 ? 0 : (v % 2 === 0 ? 1 : -1) * 0.28;
      const idx = v * 3;
      target.positions[idx] = pos.x + this.scratchDir.x * dist + jitterSide * -this.scratchDir.z;
      target.positions[idx + 1] = pos.y + this.scratchDir.y * dist + Math.abs(jitterSide) * 0.45;
      target.positions[idx + 2] = pos.z + this.scratchDir.z * dist + jitterSide * this.scratchDir.x;
    }
    const posAttr = target.geometry.getAttribute('position') as THREE.BufferAttribute;
    posAttr.needsUpdate = true;
    target.line.visible = true;
    this.spawnSeq += 1;
  }

  public spawnFromCombatEvent(event: ComicSparkSpawnInput, flashEffect = true): void {
    if (event.kind === 'STARBURST') {
      this.spawnStarburst(event.position, event.color, flashEffect, event.intensity ?? 1.2);
    } else if (event.kind === 'CROSS_SLASH') {
      this.spawnStarburst(event.position, event.color, flashEffect, 1.0);
      this.spawnCrossSlash(event.position, event.dir, event.color, flashEffect);
    } else if (event.kind === 'HAKI_ARC') {
      this.spawnStarburst(event.position, '#a855f7', flashEffect, 1.3);
      this.spawnHakiArc(event.position, '#ef4444', flashEffect);
      this.spawnHakiArc(event.position, '#a855f7', flashEffect);
      this.spawnShockwave(event.position, event.color, flashEffect, 4.0);
    } else {
      this.spawnShockwave(event.position, event.color, flashEffect, 4.4);
      this.spawnStarburst(event.position, '#38bdf8', flashEffect, 1.35);
    }
  }

  public update(dtSec: number, cameraPos?: THREE.Vector3): void {
    const dt = Math.max(0.001, Math.min(0.05, dtSec));

    let starActive = 0;
    for (const s of this.starSlots) {
      if (!s.active) continue;
      s.life -= dt;
      if (s.life <= 0) {
        s.active = false;
        continue;
      }
      const p = 1 - s.life / s.maxLife;
      const scaleCurve = p < 0.35 ? 0.35 + (p / 0.35) * 0.65 : Math.max(0.02, 1 - (p - 0.35) / 0.65);
      this.scratchObj.position.copy(s.pos);
      if (cameraPos) {
        this.scratchObj.lookAt(cameraPos);
        this.scratchObj.rotateZ(s.rotZ + p * 1.4);
      } else {
        this.scratchObj.rotation.set(0, s.rotY, s.rotZ + p * 1.4);
      }
      this.scratchObj.scale.setScalar(s.maxScale * scaleCurve);
      this.scratchObj.updateMatrix();
      this.starMesh.setMatrixAt(starActive, this.scratchObj.matrix);
      this.scratchColor.setHex(s.colorHex);
      this.starMesh.setColorAt(starActive, this.scratchColor);
      starActive += 1;
    }
    this.starMesh.count = starActive;
    if (starActive > 0) {
      this.starMesh.instanceMatrix.needsUpdate = true;
      if (this.starMesh.instanceColor) this.starMesh.instanceColor.needsUpdate = true;
    }

    let crossActive = 0;
    for (const c of this.crossSlots) {
      if (!c.active) continue;
      c.life -= dt;
      if (c.life <= 0) {
        c.active = false;
        continue;
      }
      const remain = c.life / c.maxLife;
      this.scratchObj.position.copy(c.pos);
      this.scratchObj.rotation.set(0, c.rotY, c.rotZ);
      this.scratchObj.scale.set(c.maxScale * (1.2 - remain * 0.3), remain * c.maxScale, 1);
      this.scratchObj.updateMatrix();
      this.crossMesh.setMatrixAt(crossActive, this.scratchObj.matrix);
      this.scratchColor.setHex(c.colorHex);
      this.crossMesh.setColorAt(crossActive, this.scratchColor);
      crossActive += 1;
    }
    this.crossMesh.count = crossActive;
    if (crossActive > 0) {
      this.crossMesh.instanceMatrix.needsUpdate = true;
      if (this.crossMesh.instanceColor) this.crossMesh.instanceColor.needsUpdate = true;
    }

    let ringActive = 0;
    for (const r of this.ringSlots) {
      if (!r.active) continue;
      r.life -= dt;
      if (r.life <= 0) {
        r.active = false;
        continue;
      }
      const progress = 1 - r.life / r.maxLife;
      const scale = 0.4 + progress * r.maxScale;
      this.scratchObj.position.copy(r.pos);
      this.scratchObj.rotation.set(0, 0, 0);
      this.scratchObj.scale.setScalar(scale * (1 - progress * 0.25));
      this.scratchObj.updateMatrix();
      this.ringMesh.setMatrixAt(ringActive, this.scratchObj.matrix);
      this.scratchColor.setHex(r.colorHex);
      this.ringMesh.setColorAt(ringActive, this.scratchColor);
      ringActive += 1;
    }
    this.ringMesh.count = ringActive;
    if (ringActive > 0) {
      this.ringMesh.instanceMatrix.needsUpdate = true;
      if (this.ringMesh.instanceColor) this.ringMesh.instanceColor.needsUpdate = true;
    }

    for (const arc of this.arcSlots) {
      if (!arc.active) continue;
      arc.life -= dt;
      if (arc.life <= 0) {
        arc.active = false;
        arc.line.visible = false;
      } else {
        arc.material.opacity = arc.life / arc.maxLife;
      }
    }
  }

  public getPoolCounts(): {
    starbursts: number;
    crossSlashes: number;
    shockwaves: number;
    hakiArcs: number;
  } {
    return {
      starbursts: this.starMesh.count,
      crossSlashes: this.crossMesh.count,
      shockwaves: this.ringMesh.count,
      hakiArcs: this.arcSlots.filter((a) => a.active).length
    };
  }

  public dispose(): void {
    this.starGeo.dispose();
    this.starMat.dispose();
    this.crossGeo.dispose();
    this.crossMat.dispose();
    this.ringGeo.dispose();
    this.ringMat.dispose();
    for (const arc of this.arcSlots) {
      arc.geometry.dispose();
      arc.material.dispose();
    }
    this.group.clear();
    this.group.parent?.remove(this.group);
  }
}
