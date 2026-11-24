import * as THREE from 'three';

export type BoneSocketName =
  | 'RightHand'
  | 'LeftHand'
  | 'Head'
  | 'Mouth'
  | 'Spine2'
  | 'RightFoot'
  | 'Hips';

const SOCKET_PATTERNS: Record<Exclude<BoneSocketName, 'Mouth'>, RegExp> = {
  RightHand: /^(?:righthand|hand_r|r_hand|weapon_r)$/i,
  LeftHand: /^(?:lefthand|hand_l|l_hand|weapon_l)$/i,
  Head: /^(?:head|head_top)$/i,
  Spine2: /^(?:spine2|upperchest|chest|spine_02)$/i,
  RightFoot: /^(?:rightfoot|foot_r|r_foot)$/i,
  Hips: /^(?:hips|pelvis|root)$/i
};

const GUIDE_COLORS: Record<BoneSocketName, number> = {
  RightHand: 0xef4444,
  LeftHand: 0x3b82f6,
  Head: 0xfacc15,
  Mouth: 0xf97316,
  Spine2: 0x22c55e,
  RightFoot: 0xa855f7,
  Hips: 0x38bdf8
};

/**
 * Strips Mixamo, Blender Armature, and Biped prefixes so bone names match canonically across rigs.
 */
export function normalizeMixamoBoneName(raw: string): string {
  return raw
    .replace(/^Armature\|/i, '')
    .replace(/^mixamorig\d*[:_]?/i, '')
    .replace(/^Bip01[\s_]?/i, '')
    .trim();
}

/**
 * Discovers Mixamo / humanoid bone sockets, manages weapon attachments,
 * computes blade/fist 3D ribbon trail endpoints, and renders F9 debug socket guides.
 */
export class BoneSocketBinder {
  private readonly sockets: Partial<Record<BoneSocketName, THREE.Object3D>> = {};
  private readonly attachedObjects = new Map<BoneSocketName, THREE.Object3D>();
  private readonly guideMarkers: Array<{
    mesh: THREE.Mesh;
    mat: THREE.MeshBasicMaterial;
  }> = [];
  private sharedGuideGeo: THREE.SphereGeometry | null = null;
  private guidesVisible = false;
  private virtualMouthAnchor: THREE.Object3D | null = null;

  private readonly tmpWorldPos = new THREE.Vector3();
  private readonly tmpWorldQuat = new THREE.Quaternion();
  private readonly tmpAxisDir = new THREE.Vector3();

  constructor(private readonly root: THREE.Object3D) {
    this.scanSockets();
  }

  private scanSockets(): void {
    const candidates: Array<{ obj: THREE.Object3D; clean: string }> = [];
    this.root.traverse((obj) => {
      if (!obj.name) return;
      candidates.push({ obj, clean: normalizeMixamoBoneName(obj.name) });
    });

    for (const socket of Object.keys(SOCKET_PATTERNS) as Array<Exclude<BoneSocketName, 'Mouth'>>) {
      const regex = SOCKET_PATTERNS[socket];
      const exact = candidates.find((c) => regex.test(c.clean));
      if (exact) {
        this.sockets[socket] = exact.obj;
        continue;
      }
      // Fallback substring match for varied Mixamo / Tripo / Sketchfab suffixes
      const lowerKey = socket.toLowerCase();
      const partial = candidates.find((c) => c.clean.toLowerCase().includes(lowerKey));
      if (partial) {
        this.sockets[socket] = partial.obj;
      }
    }

    // Fallback Spine2 -> Spine if a simplified rig omits Spine2
    if (!this.sockets.Spine2) {
      const spineFallback = candidates.find((c) => /^spine$/i.test(c.clean));
      if (spineFallback) {
        this.sockets.Spine2 = spineFallback.obj;
      }
    }

    // Create virtual Mouth socket under Head for characters like Zoro
    if (this.sockets.Head) {
      const mouth = new THREE.Group();
      mouth.name = 'VirtualMouthSocket';
      mouth.position.set(0, -0.06, 0.14);
      this.sockets.Head.add(mouth);
      this.virtualMouthAnchor = mouth;
      this.sockets.Mouth = mouth;
    }
  }

  public getSocket(socket: BoneSocketName): THREE.Object3D | null {
    return this.sockets[socket] ?? null;
  }

  public getSocketMap(): Partial<Record<BoneSocketName, THREE.Object3D>> {
    return { ...this.sockets };
  }

  public getBoundSocketNames(): BoneSocketName[] {
    return (Object.keys(this.sockets) as BoneSocketName[]).filter(
      (k) => Boolean(this.sockets[k])
    );
  }

  public attachToSocket(
    socket: BoneSocketName,
    obj: THREE.Object3D,
    localOffset?: THREE.Vector3,
    localRotation?: THREE.Euler
  ): boolean {
    const anchor = this.sockets[socket];
    if (!anchor) return false;
    const prev = this.attachedObjects.get(socket);
    if (prev && prev !== obj) {
      prev.parent?.remove(prev);
    }
    anchor.add(obj);
    if (localOffset) {
      obj.position.copy(localOffset);
    }
    if (localRotation) {
      obj.rotation.copy(localRotation);
    }
    this.attachedObjects.set(socket, obj);
    return true;
  }

  public detachFromSocket(socket: BoneSocketName): THREE.Object3D | null {
    const existing = this.attachedObjects.get(socket);
    if (!existing) return null;
    existing.parent?.remove(existing);
    this.attachedObjects.delete(socket);
    return existing;
  }

  public getSocketWorldPosition(socket: BoneSocketName, target?: THREE.Vector3): THREE.Vector3 {
    const out = target ?? new THREE.Vector3();
    const obj = this.sockets[socket] ?? this.sockets.Hips ?? this.root;
    this.root.updateMatrixWorld(true);
    return obj.getWorldPosition(out);
  }

  /**
   * Computes world-space inner & outer tip endpoints along the socket bone's local +Y axis
   * so 3D toon slash ribbons sweep smoothly along fists or attached weapons.
   */
  public getTrailSegmentWorld(
    socket: BoneSocketName,
    lengthMeters: number,
    outInner: THREE.Vector3,
    outOuter: THREE.Vector3
  ): boolean {
    const anchor = this.sockets[socket] ?? this.sockets.RightHand ?? this.sockets.Hips;
    if (!anchor) return false;

    this.root.updateMatrixWorld(true);
    anchor.getWorldPosition(this.tmpWorldPos);
    anchor.getWorldQuaternion(this.tmpWorldQuat);

    this.tmpAxisDir.set(0, 1, 0).applyQuaternion(this.tmpWorldQuat);
    if (this.tmpAxisDir.lengthSq() < 0.0001) {
      this.tmpAxisDir.set(1, 0, 0);
    } else {
      this.tmpAxisDir.normalize();
    }

    const half = Math.max(0.15, lengthMeters) * 0.5;
    outInner.copy(this.tmpWorldPos).addScaledVector(this.tmpAxisDir, -half * 0.4);
    outOuter.copy(this.tmpWorldPos).addScaledVector(this.tmpAxisDir, lengthMeters);
    return true;
  }

  public areGuidesVisible(): boolean {
    return this.guidesVisible;
  }

  public setGuidesVisible(visible: boolean): void {
    this.guidesVisible = visible;
    if (visible && this.guideMarkers.length === 0) {
      this.sharedGuideGeo = new THREE.SphereGeometry(0.075, 8, 8);
      for (const socket of this.getBoundSocketNames()) {
        const anchor = this.sockets[socket];
        if (!anchor) continue;
        const mat = new THREE.MeshBasicMaterial({
          color: GUIDE_COLORS[socket],
          depthTest: false,
          transparent: true,
          opacity: 0.92
        });
        const marker = new THREE.Mesh(this.sharedGuideGeo, mat);
        marker.renderOrder = 999;
        marker.name = `guide_${socket}`;
        anchor.add(marker);
        this.guideMarkers.push({ mesh: marker, mat });
      }
    }
    for (const entry of this.guideMarkers) {
      entry.mesh.visible = visible;
    }
  }

  public dispose(): void {
    for (const entry of this.guideMarkers) {
      entry.mesh.parent?.remove(entry.mesh);
      entry.mat.dispose();
    }
    this.guideMarkers.length = 0;

    if (this.sharedGuideGeo) {
      this.sharedGuideGeo.dispose();
      this.sharedGuideGeo = null;
    }
    if (this.virtualMouthAnchor) {
      this.virtualMouthAnchor.parent?.remove(this.virtualMouthAnchor);
      this.virtualMouthAnchor = null;
    }
    this.attachedObjects.clear();
  }
}
