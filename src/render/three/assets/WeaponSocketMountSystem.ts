import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import {
  getWeapon3DSpec,
  WEAPONS_3D_MANIFEST,
  type CharacterWeaponLoadout,
  type Weapon3DSpec,
  type WeaponSlotKey,
  type WeaponSocketTransform,
  type WeaponTunerSlotKey
} from '../../../data/assets/weapons3dRegistry';
import {
  applyToonMaterialTuning,
  createAnimeToonMaterial,
  createToonOutlineMaterial,
  setToonMaterialAura
} from '../shaders/AnimeToonMaterial';
import {
  DEFAULT_THREE_TOON_TUNING,
  HakiAuraMode,
  MusouAnimState,
  ThreeToonTuningConfig
} from '../threeTypes';
import type { BoneSocketBinder, BoneSocketName } from './BoneSocketBinder';

const COMBAT_ACTIVE_STATES = new Set<MusouAnimState>([
  'Combo1',
  'Combo2',
  'Combo3',
  'Combo4',
  'AirLaunch',
  'AirCombo1',
  'AirCombo2',
  'AirSlam',
  'SpecialWindup',
  'SpecialRelease',
  'Parry',
  'Guard',
  'Dash'
]);

const DEG_TO_RAD = Math.PI / 180;
const RAD_TO_DEG = 180 / Math.PI;

export function manifestBoneToSocketName(boneName: string): BoneSocketName {
  const clean = boneName.replace(/^mixamorig\d*[:_]?/i, '').toLowerCase();
  if (clean.includes('lefthand')) return 'LeftHand';
  if (clean.includes('head')) return 'Head';
  if (clean.includes('hips') || clean.includes('pelvis')) return 'Hips';
  if (clean.includes('spine')) return 'Spine2';
  if (clean.includes('rightfoot')) return 'RightFoot';
  return 'RightHand';
}

export interface MountedWeaponSlotRuntime {
  readonly slotKey: WeaponSlotKey;
  readonly spec: Weapon3DSpec;
  source: 'GLB_EXTERNAL' | 'GREYBOX_PROXY';
  readonly pivotRoot: THREE.Group;
  readonly meshGroup: THREE.Group;
  readonly trailBaseNode: THREE.Object3D;
  readonly trailTipNode: THREE.Object3D;
  readonly hakiAnchorNode: THREE.Object3D;
  combatTransform: WeaponSocketTransform;
  holsterTransform: WeaponSocketTransform;
  baseLocalY: number;
  tipLocalY: number;
  ownedGeometries: THREE.BufferGeometry[];
  toonMaterials: THREE.ShaderMaterial[];
  outlineMaterials: THREE.ShaderMaterial[];
  activeBoneName: BoneSocketName;
}

/**
 * Data-driven weapon mounting manager supporting multi-socket equipping (e.g. Zoro 3-sword style),
 * Law's Kikoku, Kaido's Hassaikai, combat/holster scabbard swapping, toon shader wrapping,
 * Greybox silhouette proxy fallback before external .glb placement, and strict zero-leak .dispose().
 */
export class WeaponSocketMountSystem {
  private readonly mountedSlots = new Map<WeaponSlotKey, MountedWeaponSlotRuntime>();
  private readonly templateCache = new Map<string, GLTF | null>();
  private readonly gltfLoader: GLTFLoader;
  private readonly dracoLoader: DRACOLoader;

  private loadout: CharacterWeaponLoadout | null = null;
  private enableHolsterSwap = true;
  private holstered = false;
  private nonCombatIdleSec = 0;
  private disposed = false;

  constructor(
    private readonly socketBinder: BoneSocketBinder,
    dracoDecoderPath = './draco/'
  ) {
    this.dracoLoader = new DRACOLoader();
    this.dracoLoader.setDecoderPath(dracoDecoderPath);
    this.gltfLoader = new GLTFLoader();
    this.gltfLoader.setDRACOLoader(this.dracoLoader);
  }

  public getLoadout(): CharacterWeaponLoadout | null {
    return this.loadout;
  }

  public getMountedSlotKeys(): WeaponSlotKey[] {
    return Array.from(this.mountedSlots.keys());
  }

  public getMountedSlot(slotKey: WeaponSlotKey): MountedWeaponSlotRuntime | null {
    return this.mountedSlots.get(slotKey) ?? null;
  }

  public isHolstered(): boolean {
    return this.holstered;
  }

  public isHolsterSwapEnabled(): boolean {
    return this.enableHolsterSwap;
  }

  public setEnableHolsterSwap(enabled: boolean): void {
    this.enableHolsterSwap = enabled;
    if (!enabled && this.holstered) {
      this.setHolstered(false);
    }
  }

  public setHolstered(nextHolstered: boolean): void {
    if (this.holstered === nextHolstered) return;
    this.holstered = nextHolstered;
    for (const slot of this.mountedSlots.values()) {
      this.attachRuntimeToCurrentSocket(slot);
    }
  }

  public mountLoadout(
    loadout: CharacterWeaponLoadout,
    tuning: ThreeToonTuningConfig = DEFAULT_THREE_TOON_TUNING
  ): void {
    this.clearMountedSlots();
    this.loadout = loadout;
    this.enableHolsterSwap = loadout.enableHolsterSwap;
    this.holstered = false;
    this.nonCombatIdleSec = 0;

    for (const slotKey of ['right', 'left', 'mouth'] as const) {
      const weaponId = loadout.slots[slotKey];
      if (!weaponId) continue;
      const spec = getWeapon3DSpec(weaponId);
      if (!spec) continue;

      const combatTransform: WeaponSocketTransform = {
        bone: spec.combatSocket.bone,
        position: [...spec.combatSocket.position],
        rotationDeg: [...spec.combatSocket.rotationDeg],
        scale: spec.combatSocket.scale
      };
      const holsterSrc = spec.holsterSocket ?? spec.combatSocket;
      const holsterTransform: WeaponSocketTransform = {
        bone: holsterSrc.bone,
        position: [...holsterSrc.position],
        rotationDeg: [...holsterSrc.rotationDeg],
        scale: holsterSrc.scale
      };

      const pivotRoot = new THREE.Group();
      pivotRoot.name = `weapon_pivot_${slotKey}_${spec.weaponId}`;

      const meshGroup = new THREE.Group();
      meshGroup.name = `weapon_mesh_${spec.weaponId}`;
      pivotRoot.add(meshGroup);

      const trailBaseNode = new THREE.Object3D();
      trailBaseNode.name = 'trailBase';
      trailBaseNode.position.set(
        spec.trailAnchors.baseLocal[0],
        spec.trailAnchors.baseLocal[1],
        spec.trailAnchors.baseLocal[2]
      );
      pivotRoot.add(trailBaseNode);

      const trailTipNode = new THREE.Object3D();
      trailTipNode.name = 'trailTip';
      trailTipNode.position.set(
        spec.trailAnchors.tipLocal[0],
        spec.trailAnchors.tipLocal[1],
        spec.trailAnchors.tipLocal[2]
      );
      pivotRoot.add(trailTipNode);

      const hakiAnchorNode = new THREE.Object3D();
      hakiAnchorNode.name = 'hakiArcAnchor';
      hakiAnchorNode.position.set(
        spec.trailAnchors.tipLocal[0] * 0.7,
        spec.trailAnchors.tipLocal[1] * 0.7,
        spec.trailAnchors.tipLocal[2] * 0.7
      );
      pivotRoot.add(hakiAnchorNode);

      const runtime: MountedWeaponSlotRuntime = {
        slotKey,
        spec,
        source: 'GREYBOX_PROXY',
        pivotRoot,
        meshGroup,
        trailBaseNode,
        trailTipNode,
        hakiAnchorNode,
        combatTransform,
        holsterTransform,
        baseLocalY: spec.trailAnchors.baseLocal[1],
        tipLocalY: spec.trailAnchors.tipLocal[1],
        ownedGeometries: [],
        toonMaterials: [],
        outlineMaterials: [],
        activeBoneName: manifestBoneToSocketName(combatTransform.bone)
      };

      this.buildGreyboxWeaponProxy(runtime, tuning, Boolean(loadout.kingOfHellAura));
      this.mountedSlots.set(slotKey, runtime);
      this.attachRuntimeToCurrentSocket(runtime);

      if (typeof fetch !== 'undefined') {
        void this.tryUpgradeWeaponToGlb(runtime, tuning, Boolean(loadout.kingOfHellAura));
      }
    }
  }

  private buildGreyboxWeaponProxy(
    runtime: MountedWeaponSlotRuntime,
    tuning: ThreeToonTuningConfig,
    kingOfHellAura: boolean
  ): void {
    const lengthY = Math.max(0.55, runtime.tipLocalY);
    const isKanabo = runtime.spec.proxyShape === 'KANABO';

    const baseColor = kingOfHellAura ? '#d1fae5' : isKanabo ? '#475569' : '#cbd5e1';
    const rimColor = kingOfHellAura ? '#22c55e' : '#e2e8f0';

    const toonMat = createAnimeToonMaterial({
      baseColor,
      shadowTint: kingOfHellAura ? '#3b0764' : '#475569',
      rimColor,
      celSteps: tuning.celSteps,
      shadowShiftStrength: tuning.shadowShiftStrength,
      rimIntensity: kingOfHellAura ? Math.max(1.2, tuning.rimIntensity) : tuning.rimIntensity,
      auraMode: kingOfHellAura ? 'HAO' : 'NONE',
      auraIntensity: kingOfHellAura ? 1.15 : 0
    });
    const outlineMat = createToonOutlineMaterial({ outlineWidth: tuning.outlineWidth });
    runtime.toonMaterials.push(toonMat);
    runtime.outlineMaterials.push(outlineMat);

    // Build clean single-proportion weapon proxy (NO elaborate fake details)
    const bodyGeo = isKanabo
      ? new THREE.CylinderGeometry(0.11, 0.045, lengthY, 8)
      : new THREE.BoxGeometry(0.032, lengthY, 0.085);
    bodyGeo.translate(0, lengthY * 0.5, 0);
    runtime.ownedGeometries.push(bodyGeo);

    const mesh = new THREE.Mesh(bodyGeo, toonMat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    runtime.meshGroup.add(mesh);

    const outline = new THREE.Mesh(bodyGeo, outlineMat);
    outline.userData['isToonOutline'] = true;
    runtime.meshGroup.add(outline);

    // Subtle hilt guard cross-bar so blade vs handle orientation is visually clear during F9 tuning
    const guardGeo = isKanabo
      ? new THREE.CylinderGeometry(0.06, 0.06, 0.12, 8)
      : new THREE.BoxGeometry(0.12, 0.025, 0.14);
    guardGeo.translate(0, Math.min(0.22, runtime.baseLocalY), 0);
    runtime.ownedGeometries.push(guardGeo);

    const guardMesh = new THREE.Mesh(guardGeo, toonMat);
    runtime.meshGroup.add(guardMesh);
    const guardOutline = new THREE.Mesh(guardGeo, outlineMat);
    guardOutline.userData['isToonOutline'] = true;
    runtime.meshGroup.add(guardOutline);
  }

  private async tryUpgradeWeaponToGlb(
    runtime: MountedWeaponSlotRuntime,
    tuning: ThreeToonTuningConfig,
    kingOfHellAura: boolean
  ): Promise<void> {
    const url = runtime.spec.modelPath;
    let gltf = this.templateCache.get(url);
    if (gltf === undefined) {
      try {
        const head = await fetch(url, { method: 'HEAD' });
        if (!head.ok) {
          this.templateCache.set(url, null);
          return;
        }
        gltf = await this.gltfLoader.loadAsync(url);
        this.templateCache.set(url, gltf);
      } catch {
        this.templateCache.set(url, null);
        return;
      }
    }
    if (!gltf || this.disposed || this.mountedSlots.get(runtime.slotKey) !== runtime) {
      return;
    }

    this.disposeSlotMeshAssets(runtime);
    runtime.meshGroup.clear();

    const cloned = gltf.scene.clone(true);
    const targets: THREE.Mesh[] = [];
    cloned.traverse((obj) => {
      if (obj instanceof THREE.Mesh) targets.push(obj);
    });

    for (const mesh of targets) {
      const clonedGeo = mesh.geometry.clone();
      mesh.geometry = clonedGeo;
      runtime.ownedGeometries.push(clonedGeo);

      const firstMat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
      const srcMat = firstMat as { color?: THREE.Color; map?: THREE.Texture | null } | undefined;
      const toonMat = createAnimeToonMaterial({
        baseColor: srcMat?.color ?? '#ffffff',
        map: srcMat?.map ?? null,
        rimColor: kingOfHellAura ? '#22c55e' : '#ffd18a',
        celSteps: tuning.celSteps,
        shadowShiftStrength: tuning.shadowShiftStrength,
        rimIntensity: kingOfHellAura ? Math.max(1.2, tuning.rimIntensity) : tuning.rimIntensity,
        auraMode: kingOfHellAura ? 'HAO' : 'NONE',
        auraIntensity: kingOfHellAura ? 1.15 : 0
      });
      if (Array.isArray(mesh.material)) {
        mesh.material.forEach((m) => m.dispose());
      } else {
        mesh.material?.dispose();
      }
      mesh.material = toonMat;
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      runtime.toonMaterials.push(toonMat);

      const outlineMat = createToonOutlineMaterial({ outlineWidth: tuning.outlineWidth });
      runtime.outlineMaterials.push(outlineMat);
      const outlineMesh = new THREE.Mesh(clonedGeo, outlineMat);
      outlineMesh.userData['isToonOutline'] = true;
      outlineMesh.position.copy(mesh.position);
      outlineMesh.rotation.copy(mesh.rotation);
      outlineMesh.scale.copy(mesh.scale);
      mesh.parent?.add(outlineMesh);
    }

    runtime.meshGroup.add(cloned);
    runtime.source = 'GLB_EXTERNAL';
  }

  private attachRuntimeToCurrentSocket(runtime: MountedWeaponSlotRuntime): void {
    const transform = this.holstered ? runtime.holsterTransform : runtime.combatTransform;
    const boneKey = manifestBoneToSocketName(transform.bone);
    runtime.activeBoneName = boneKey;

    const anchor =
      this.socketBinder.getSocket(boneKey) ?? this.socketBinder.getSocket('Hips');
    if (anchor) {
      anchor.add(runtime.pivotRoot);
    }
    runtime.pivotRoot.position.set(
      transform.position[0],
      transform.position[1],
      transform.position[2]
    );
    runtime.pivotRoot.rotation.set(
      transform.rotationDeg[0] * DEG_TO_RAD,
      transform.rotationDeg[1] * DEG_TO_RAD,
      transform.rotationDeg[2] * DEG_TO_RAD
    );
    runtime.pivotRoot.scale.setScalar(transform.scale);
  }

  public update(
    dtSec: number,
    animState: MusouAnimState,
    elapsedSec: number,
    forceCombat = false,
    hakiOverrideMode?: HakiAuraMode
  ): void {
    if (this.mountedSlots.size === 0) return;
    const isCombat = forceCombat || COMBAT_ACTIVE_STATES.has(animState);

    if (isCombat) {
      this.nonCombatIdleSec = 0;
      if (this.holstered) {
        this.setHolstered(false);
      }
    } else if (this.enableHolsterSwap) {
      this.nonCombatIdleSec += dtSec;
      const delay = this.loadout?.holsterDelaySec ?? 1.5;
      if (this.nonCombatIdleSec >= delay && !this.holstered) {
        this.setHolstered(true);
      }
    }

    const kingAura = Boolean(this.loadout?.kingOfHellAura);
    const desiredAura: HakiAuraMode =
      hakiOverrideMode ?? (kingAura ? 'HAO' : 'NONE');
    for (const slot of this.mountedSlots.values()) {
      for (const mat of slot.toonMaterials) {
        setToonMaterialAura(
          mat,
          desiredAura,
          desiredAura === 'NONE' ? 0 : 1.15,
          elapsedSec
        );
      }
    }
  }

  public getWeaponTrailWorldAnchors(
    slotKey: WeaponSlotKey,
    outBase: THREE.Vector3,
    outTip: THREE.Vector3
  ): boolean {
    const slot = this.mountedSlots.get(slotKey);
    if (!slot) return false;
    slot.pivotRoot.updateWorldMatrix(true, true);
    slot.trailBaseNode.getWorldPosition(outBase);
    slot.trailTipNode.getWorldPosition(outTip);
    return true;
  }

  public getHakiArcWorldPosition(
    slotKey: WeaponSlotKey,
    outPos: THREE.Vector3
  ): boolean {
    const slot = this.mountedSlots.get(slotKey);
    if (!slot) return false;
    slot.pivotRoot.updateWorldMatrix(true, true);
    slot.hakiAnchorNode.getWorldPosition(outPos);
    return true;
  }

  public getSlotTunerState(tunerSlot: WeaponTunerSlotKey): {
    weaponId: string;
    label: string;
    bone: string;
    position: [number, number, number];
    rotationDeg: [number, number, number];
    scale: number;
    baseLocalY: number;
    tipLocalY: number;
  } | null {
    const targetSlotKey: WeaponSlotKey =
      tunerSlot === 'holster'
        ? this.mountedSlots.has('right')
          ? 'right'
          : (this.getMountedSlotKeys()[0] ?? 'right')
        : tunerSlot;
    const runtime = this.mountedSlots.get(targetSlotKey);
    if (!runtime) return null;
    const tf =
      tunerSlot === 'holster' ? runtime.holsterTransform : runtime.combatTransform;
    return {
      weaponId: runtime.spec.weaponId,
      label: runtime.spec.label,
      bone: tf.bone,
      position: [...tf.position],
      rotationDeg: [...tf.rotationDeg],
      scale: tf.scale,
      baseLocalY: runtime.baseLocalY,
      tipLocalY: runtime.tipLocalY
    };
  }

  public setSlotTransformOverride(
    tunerSlot: WeaponTunerSlotKey,
    partial: {
      posX?: number;
      posY?: number;
      posZ?: number;
      rotX?: number;
      rotY?: number;
      rotZ?: number;
      scale?: number;
    }
  ): void {
    const targetKey: WeaponSlotKey =
      tunerSlot === 'holster'
        ? this.mountedSlots.has('right')
          ? 'right'
          : (this.getMountedSlotKeys()[0] ?? 'right')
        : tunerSlot;
    const runtime = this.mountedSlots.get(targetKey);
    if (!runtime) return;

    const tf = tunerSlot === 'holster' ? runtime.holsterTransform : runtime.combatTransform;
    if (partial.posX !== undefined) tf.position[0] = partial.posX;
    if (partial.posY !== undefined) tf.position[1] = partial.posY;
    if (partial.posZ !== undefined) tf.position[2] = partial.posZ;
    if (partial.rotX !== undefined) tf.rotationDeg[0] = partial.rotX;
    if (partial.rotY !== undefined) tf.rotationDeg[1] = partial.rotY;
    if (partial.rotZ !== undefined) tf.rotationDeg[2] = partial.rotZ;
    if (partial.scale !== undefined) tf.scale = Math.max(0.25, Math.min(3.0, partial.scale));

    this.setHolstered(tunerSlot === 'holster');
    this.attachRuntimeToCurrentSocket(runtime);
  }

  public setSlotTrailLengths(slotKey: WeaponSlotKey, baseY: number, tipY: number): void {
    const runtime = this.mountedSlots.get(slotKey);
    if (!runtime) return;
    runtime.baseLocalY = Math.max(0, Math.min(2.0, baseY));
    runtime.tipLocalY = Math.max(runtime.baseLocalY + 0.1, Math.min(3.5, tipY));
    runtime.trailBaseNode.position.y = runtime.baseLocalY;
    runtime.trailTipNode.position.y = runtime.tipLocalY;
  }

  public applyTuning(
    tuning: ThreeToonTuningConfig,
    sunDirection?: THREE.Vector3,
    sunColor?: THREE.Color,
    ambientColor?: THREE.Color
  ): void {
    for (const runtime of this.mountedSlots.values()) {
      for (const mat of runtime.toonMaterials) {
        applyToonMaterialTuning(mat, tuning, sunDirection, sunColor, ambientColor);
      }
      for (const mat of runtime.outlineMaterials) {
        applyToonMaterialTuning(mat, tuning);
      }
    }
  }

  public exportModifiedWeapons3dJson(): string {
    const clonedWeapons: Record<string, Weapon3DSpec> = {};
    for (const [id, spec] of Object.entries(WEAPONS_3D_MANIFEST.weapons)) {
      clonedWeapons[id] = {
        ...spec,
        combatSocket: {
          ...spec.combatSocket,
          position: [...spec.combatSocket.position],
          rotationDeg: [...spec.combatSocket.rotationDeg]
        },
        ...(spec.holsterSocket
          ? {
              holsterSocket: {
                ...spec.holsterSocket,
                position: [...spec.holsterSocket.position],
                rotationDeg: [...spec.holsterSocket.rotationDeg]
              }
            }
          : {}),
        trailAnchors: {
          baseLocal: [...spec.trailAnchors.baseLocal],
          tipLocal: [...spec.trailAnchors.tipLocal]
        },
        trailTheme: { ...spec.trailTheme }
      };
    }

    for (const runtime of this.mountedSlots.values()) {
      const target = clonedWeapons[runtime.spec.weaponId];
      if (!target) continue;
      target.combatSocket = {
        bone: runtime.combatTransform.bone,
        position: [
          Number(runtime.combatTransform.position[0].toFixed(3)),
          Number(runtime.combatTransform.position[1].toFixed(3)),
          Number(runtime.combatTransform.position[2].toFixed(3))
        ],
        rotationDeg: [
          Number(runtime.combatTransform.rotationDeg[0].toFixed(1)),
          Number(runtime.combatTransform.rotationDeg[1].toFixed(1)),
          Number(runtime.combatTransform.rotationDeg[2].toFixed(1))
        ],
        scale: Number(runtime.combatTransform.scale.toFixed(3))
      };
      if (target.holsterSocket) {
        target.holsterSocket = {
          bone: runtime.holsterTransform.bone,
          position: [
            Number(runtime.holsterTransform.position[0].toFixed(3)),
            Number(runtime.holsterTransform.position[1].toFixed(3)),
            Number(runtime.holsterTransform.position[2].toFixed(3))
          ],
          rotationDeg: [
            Number(runtime.holsterTransform.rotationDeg[0].toFixed(1)),
            Number(runtime.holsterTransform.rotationDeg[1].toFixed(1)),
            Number(runtime.holsterTransform.rotationDeg[2].toFixed(1))
          ],
          scale: Number(runtime.holsterTransform.scale.toFixed(3))
        };
      }
      target.trailAnchors = {
        baseLocal: [
          target.trailAnchors.baseLocal[0],
          Number(runtime.baseLocalY.toFixed(3)),
          target.trailAnchors.baseLocal[2]
        ],
        tipLocal: [
          target.trailAnchors.tipLocal[0],
          Number(runtime.tipLocalY.toFixed(3)),
          target.trailAnchors.tipLocal[2]
        ]
      };
    }

    return JSON.stringify(
      {
        version: WEAPONS_3D_MANIFEST.version,
        weapons: clonedWeapons,
        characterLoadouts: WEAPONS_3D_MANIFEST.characterLoadouts
      },
      null,
      2
    );
  }

  private disposeSlotMeshAssets(runtime: MountedWeaponSlotRuntime): void {
    for (const geo of runtime.ownedGeometries) {
      geo.dispose();
    }
    runtime.ownedGeometries.length = 0;

    for (const mat of runtime.toonMaterials) {
      for (const u of Object.values(mat.uniforms)) {
        if (u?.value instanceof THREE.Texture && u.value.image?.width > 4) {
          u.value.dispose();
        }
      }
      mat.dispose();
    }
    runtime.toonMaterials.length = 0;

    for (const mat of runtime.outlineMaterials) {
      mat.dispose();
    }
    runtime.outlineMaterials.length = 0;
  }

  public clearMountedSlots(): void {
    for (const runtime of this.mountedSlots.values()) {
      runtime.pivotRoot.parent?.remove(runtime.pivotRoot);
      this.disposeSlotMeshAssets(runtime);
      runtime.meshGroup.clear();
      runtime.pivotRoot.clear();
    }
    this.mountedSlots.clear();
    this.loadout = null;
  }

  public dispose(): void {
    this.disposed = true;
    this.clearMountedSlots();
    for (const gltf of this.templateCache.values()) {
      if (!gltf) continue;
      gltf.scene.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
          if (Array.isArray(obj.material)) {
            obj.material.forEach((m) => m.dispose());
          } else {
            obj.material?.dispose();
          }
        }
      });
    }
    this.templateCache.clear();
    this.dracoLoader.dispose();
  }
}

export function radToDeg(rad: number): number {
  return rad * RAD_TO_DEG;
}
