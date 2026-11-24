import * as THREE from 'three';

interface DashGhostEntry {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  life: number;
  maxLife: number;
}

interface ShockwaveRingEntry {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  life: number;
  maxLife: number;
  maxScale: number;
}

interface StarSparkEntry {
  mesh: THREE.Mesh;
  mat: THREE.MeshBasicMaterial;
  vel: THREE.Vector3;
  life: number;
  maxLife: number;
}

const RIBBON_SEGMENTS = 14;
const RIBBON_VERTICES = RIBBON_SEGMENTS * 2;

export class MusouVfx3D {
  public readonly group = new THREE.Group();

  private readonly ghostGeo: THREE.CapsuleGeometry;
  private readonly ghosts: DashGhostEntry[] = [];
  private ghostSpawnCooldown = 0;

  private readonly windConeGeo: THREE.ConeGeometry;
  private readonly windConeMat: THREE.MeshBasicMaterial;
  private readonly windCone: THREE.Mesh;

  private readonly ribbonGeo: THREE.BufferGeometry;
  private readonly ribbonPositions: Float32Array;
  private readonly ribbonColors: Float32Array;
  private readonly ribbonMat: THREE.MeshBasicMaterial;
  private readonly ribbonMesh: THREE.Mesh;
  private readonly ribbonHistory: Array<{
    inner: THREE.Vector3;
    outer: THREE.Vector3;
    active: boolean;
  }> = [];

  private readonly ringGeo: THREE.RingGeometry;
  private readonly rings: ShockwaveRingEntry[] = [];

  private readonly sparkGeo: THREE.OctahedronGeometry;
  private readonly sparks: StarSparkEntry[] = [];

  private hitstopTicksRemaining = 0;

  constructor(scene: THREE.Scene) {
    this.group.name = 'musou_vfx_3d';
    scene.add(this.group);

    // 3x Power Dash afterimage silhouettes
    this.ghostGeo = new THREE.CapsuleGeometry(0.32, 0.95, 4, 8);
    for (let i = 0; i < 3; i += 1) {
      const mat = new THREE.MeshBasicMaterial({
        color: '#38bdf8',
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      });
      const mesh = new THREE.Mesh(this.ghostGeo, mat);
      mesh.visible = false;
      this.group.add(mesh);
      this.ghosts.push({ mesh, mat, life: 0, maxLife: 0.24 });
    }

    // Power Dash anime wind cone
    this.windConeGeo = new THREE.ConeGeometry(0.95, 2.4, 14, 1, true);
    this.windConeGeo.rotateX(Math.PI * 0.5);
    this.windConeMat = new THREE.MeshBasicMaterial({
      color: '#e0f2fe',
      transparent: true,
      opacity: 0,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    this.windCone = new THREE.Mesh(this.windConeGeo, this.windConeMat);
    this.windCone.visible = false;
    this.group.add(this.windCone);

    // Dynamic bone-socket slash ribbon trail
    this.ribbonPositions = new Float32Array(RIBBON_VERTICES * 3);
    this.ribbonColors = new Float32Array(RIBBON_VERTICES * 3);
    const indices: number[] = [];
    for (let i = 0; i < RIBBON_SEGMENTS - 1; i += 1) {
      const a = i * 2;
      const b = a + 1;
      const c = a + 2;
      const d = a + 3;
      indices.push(a, b, c, b, d, c);
    }
    this.ribbonGeo = new THREE.BufferGeometry();
    this.ribbonGeo.setAttribute(
      'position',
      new THREE.BufferAttribute(this.ribbonPositions, 3)
    );
    this.ribbonGeo.setAttribute(
      'color',
      new THREE.BufferAttribute(this.ribbonColors, 3)
    );
    this.ribbonGeo.setIndex(indices);
    this.ribbonMat = new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.85,
      side: THREE.DoubleSide,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    });
    this.ribbonMesh = new THREE.Mesh(this.ribbonGeo, this.ribbonMat);
    this.ribbonMesh.frustumCulled = false;
    this.ribbonMesh.visible = false;
    this.group.add(this.ribbonMesh);

    for (let i = 0; i < RIBBON_SEGMENTS; i += 1) {
      this.ribbonHistory.push({
        inner: new THREE.Vector3(),
        outer: new THREE.Vector3(),
        active: false
      });
    }

    // Pooled Shockwave Rings (8)
    this.ringGeo = new THREE.RingGeometry(0.45, 0.9, 24);
    this.ringGeo.rotateX(-Math.PI * 0.5);
    for (let i = 0; i < 8; i += 1) {
      const mat = new THREE.MeshBasicMaterial({
        color: '#fbbf24',
        transparent: true,
        opacity: 0,
        side: THREE.DoubleSide,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      });
      const mesh = new THREE.Mesh(this.ringGeo, mat);
      mesh.visible = false;
      this.group.add(mesh);
      this.rings.push({ mesh, mat, life: 0, maxLife: 0.35, maxScale: 4 });
    }

    // Pooled Star Impact Sparks (16)
    this.sparkGeo = new THREE.OctahedronGeometry(0.18, 0);
    for (let i = 0; i < 16; i += 1) {
      const mat = new THREE.MeshBasicMaterial({
        color: '#fef08a',
        transparent: true,
        opacity: 0,
        depthWrite: false,
        blending: THREE.AdditiveBlending
      });
      const mesh = new THREE.Mesh(this.sparkGeo, mat);
      mesh.visible = false;
      this.group.add(mesh);
      this.sparks.push({
        mesh,
        mat,
        vel: new THREE.Vector3(),
        life: 0,
        maxLife: 0.25
      });
    }
  }

  public get activeGhostCount(): number {
    let count = 0;
    for (const g of this.ghosts) {
      if (g.life > 0) count += 1;
    }
    return count;
  }

  public get activeShockwaveCount(): number {
    let count = 0;
    for (const r of this.rings) {
      if (r.life > 0) count += 1;
    }
    return count;
  }

  public get hitstopRemaining(): number {
    return this.hitstopTicksRemaining;
  }

  public triggerHitstop(ticks = 4): void {
    this.hitstopTicksRemaining = Math.max(this.hitstopTicksRemaining, Math.round(ticks));
  }

  public consumeHitstopTick(): boolean {
    if (this.hitstopTicksRemaining > 0) {
      this.hitstopTicksRemaining -= 1;
      return true;
    }
    return false;
  }

  public spawnShockwave(
    pos: THREE.Vector3,
    color: THREE.ColorRepresentation = '#fbbf24',
    maxScale = 4.2,
    durationSec = 0.32
  ): void {
    const slot = this.rings.find((r) => r.life <= 0) ?? this.rings[0];
    if (!slot) return;
    slot.life = durationSec;
    slot.maxLife = durationSec;
    slot.maxScale = maxScale;
    slot.mat.color.set(color);
    slot.mat.opacity = 0.92;
    slot.mesh.position.set(pos.x, Math.max(0.08, pos.y + 0.12), pos.z);
    slot.mesh.scale.setScalar(0.5);
    slot.mesh.visible = true;
  }

  public spawnImpactSparks(
    pos: THREE.Vector3,
    count = 6,
    color: THREE.ColorRepresentation = '#fef08a'
  ): void {
    let spawned = 0;
    for (let i = 0; i < this.sparks.length && spawned < count; i += 1) {
      const slot = this.sparks[i];
      if (!slot || slot.life > 0) continue;
      const angle = (spawned / Math.max(1, count)) * Math.PI * 2 + spawned * 0.4;
      slot.life = 0.24;
      slot.maxLife = 0.24;
      slot.mat.color.set(color);
      slot.mat.opacity = 1;
      slot.mesh.position.copy(pos);
      slot.mesh.scale.setScalar(1.2);
      slot.mesh.visible = true;
      slot.vel.set(Math.cos(angle) * 7.5, 3.2 + (spawned % 3) * 1.4, Math.sin(angle) * 7.5);
      spawned += 1;
    }
  }

  public updateDashEffects(
    dt: number,
    isDashing: boolean,
    actorPos: THREE.Vector3,
    aimDir: THREE.Vector3,
    tint: THREE.ColorRepresentation = '#38bdf8'
  ): void {
    if (isDashing) {
      this.windCone.visible = true;
      this.windCone.position.set(actorPos.x, actorPos.y + 1.0, actorPos.z);
      const targetLook = actorPos.clone().add(aimDir);
      targetLook.y = actorPos.y + 1.0;
      this.windCone.lookAt(targetLook);
      this.windConeMat.color.set(tint);
      this.windConeMat.opacity = 0.34;

      this.ghostSpawnCooldown -= dt;
      if (this.ghostSpawnCooldown <= 0) {
        this.ghostSpawnCooldown = 0.055;
        const slot = this.ghosts.find((g) => g.life <= 0) ?? this.ghosts[0];
        if (slot) {
          slot.life = slot.maxLife;
          slot.mat.color.set(tint);
          slot.mat.opacity = 0.55;
          slot.mesh.position.set(actorPos.x, actorPos.y + 0.9, actorPos.z);
          slot.mesh.rotation.y = Math.atan2(aimDir.x, aimDir.z);
          slot.mesh.visible = true;
        }
      }
    } else {
      this.windConeMat.opacity = Math.max(0, this.windConeMat.opacity - dt * 4);
      if (this.windConeMat.opacity <= 0.01) {
        this.windCone.visible = false;
      }
    }
  }

  public updateSlashRibbon(
    isAttacking: boolean,
    socketWorldPos: THREE.Vector3,
    actorCenterPos: THREE.Vector3,
    trailColor: THREE.ColorRepresentation = '#f59e0b'
  ): void {
    const inner = new THREE.Vector3();
    const outer = new THREE.Vector3();
    if (isAttacking) {
      const dir = socketWorldPos.clone().sub(actorCenterPos);
      if (dir.lengthSq() < 0.001) dir.set(1, 0, 0);
      dir.normalize();
      inner.copy(socketWorldPos).addScaledVector(dir, -0.35);
      outer.copy(socketWorldPos).addScaledVector(dir, 0.72);
    }
    this.flushSlashRibbonSegment(isAttacking, inner, outer, actorCenterPos, trailColor);
  }

  public updateSlashRibbonSegment(
    isAttacking: boolean,
    innerWorldPos: THREE.Vector3,
    outerWorldPos: THREE.Vector3,
    trailColor: THREE.ColorRepresentation = '#f59e0b'
  ): void {
    this.flushSlashRibbonSegment(isAttacking, innerWorldPos, outerWorldPos, innerWorldPos, trailColor);
  }

  private flushSlashRibbonSegment(
    isAttacking: boolean,
    innerWorldPos: THREE.Vector3,
    outerWorldPos: THREE.Vector3,
    fallbackPos: THREE.Vector3,
    trailColor: THREE.ColorRepresentation
  ): void {
    for (let i = RIBBON_SEGMENTS - 1; i > 0; i -= 1) {
      const dst = this.ribbonHistory[i];
      const src = this.ribbonHistory[i - 1];
      if (!dst || !src) continue;
      dst.inner.copy(src.inner);
      dst.outer.copy(src.outer);
      dst.active = src.active;
    }

    const head = this.ribbonHistory[0];
    if (head) {
      if (isAttacking) {
        head.inner.copy(innerWorldPos);
        head.outer.copy(outerWorldPos);
        head.active = true;
      } else {
        head.active = false;
      }
    }

    let anyActive = false;
    const baseCol = new THREE.Color(trailColor);
    for (let i = 0; i < RIBBON_SEGMENTS; i += 1) {
      const seg = this.ribbonHistory[i];
      const fade = seg?.active ? 1 - i / (RIBBON_SEGMENTS - 1) : 0;
      if (fade > 0.01) anyActive = true;

      const vIdx = i * 6;
      const inPos = seg?.inner ?? fallbackPos;
      const outPos = seg?.outer ?? fallbackPos;
      this.ribbonPositions[vIdx] = inPos.x;
      this.ribbonPositions[vIdx + 1] = inPos.y;
      this.ribbonPositions[vIdx + 2] = inPos.z;
      this.ribbonPositions[vIdx + 3] = outPos.x;
      this.ribbonPositions[vIdx + 4] = outPos.y;
      this.ribbonPositions[vIdx + 5] = outPos.z;

      this.ribbonColors[vIdx] = baseCol.r * fade;
      this.ribbonColors[vIdx + 1] = baseCol.g * fade;
      this.ribbonColors[vIdx + 2] = baseCol.b * fade;
      this.ribbonColors[vIdx + 3] = baseCol.r * fade;
      this.ribbonColors[vIdx + 4] = baseCol.g * fade;
      this.ribbonColors[vIdx + 5] = baseCol.b * fade;
    }

    this.ribbonMesh.visible = anyActive;
    if (anyActive) {
      const posAttr = this.ribbonGeo.getAttribute('position') as THREE.BufferAttribute;
      const colAttr = this.ribbonGeo.getAttribute('color') as THREE.BufferAttribute;
      posAttr.needsUpdate = true;
      colAttr.needsUpdate = true;
    }
  }

  public update(dt: number): void {
    for (const g of this.ghosts) {
      if (g.life <= 0) continue;
      g.life = Math.max(0, g.life - dt);
      const t = g.life / g.maxLife;
      g.mat.opacity = t * 0.55;
      g.mesh.scale.setScalar(1 + (1 - t) * 0.15);
      if (g.life <= 0) g.mesh.visible = false;
    }

    for (const r of this.rings) {
      if (r.life <= 0) continue;
      r.life = Math.max(0, r.life - dt);
      const progress = 1 - r.life / r.maxLife;
      r.mesh.scale.setScalar(0.5 + progress * r.maxScale);
      r.mat.opacity = (1 - progress) * 0.92;
      if (r.life <= 0) r.mesh.visible = false;
    }

    for (const s of this.sparks) {
      if (s.life <= 0) continue;
      s.life = Math.max(0, s.life - dt);
      s.mesh.position.addScaledVector(s.vel, dt);
      s.vel.y -= 12 * dt;
      s.mesh.rotation.z += dt * 10;
      const t = s.life / s.maxLife;
      s.mat.opacity = t;
      s.mesh.scale.setScalar(0.4 + t * 0.9);
      if (s.life <= 0) s.mesh.visible = false;
    }
  }

  public dispose(): void {
    this.ghostGeo.dispose();
    for (const g of this.ghosts) g.mat.dispose();
    this.windConeGeo.dispose();
    this.windConeMat.dispose();
    this.ribbonGeo.dispose();
    this.ribbonMat.dispose();
    this.ringGeo.dispose();
    for (const r of this.rings) r.mat.dispose();
    this.sparkGeo.dispose();
    for (const s of this.sparks) s.mat.dispose();
    this.group.clear();
    this.group.parent?.remove(this.group);
  }
}
