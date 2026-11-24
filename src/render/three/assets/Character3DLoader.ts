import * as THREE from 'three';
import { GLTFLoader, type GLTF } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import * as SkeletonUtils from 'three/examples/jsm/utils/SkeletonUtils.js';
import {
  ALL_MUSOU_ANIM_STATES,
  DEFAULT_THREE_TOON_TUNING,
  HakiAuraMode,
  MusouAnimState,
  ThreeToonTuningConfig
} from '../threeTypes';
import {
  applyToonMaterialTuning,
  createAnimeToonMaterial,
  createToonOutlineMaterial,
  setToonMaterialAura
} from '../shaders/AnimeToonMaterial';
import {
  BoneSocketBinder,
  normalizeMixamoBoneName,
  type BoneSocketName
} from './BoneSocketBinder';

export { BoneSocketBinder, normalizeMixamoBoneName, type BoneSocketName };

export interface AnimJsonClipEntry {
  name?: string;
  duration?: number;
  loop?: boolean;
  tracks?: Array<{
    name: string;
    type: 'vector' | 'quaternion' | 'number';
    times: number[];
    values: number[];
  }>;
}

export interface Character3DMetaConfig {
  targetHeight?: number;
  modelForwardOffset?: number;
  outlineThickness?: number;
  shadowColorShift?: number;
  rimIntensity?: number;
  lockRootMotionXZ?: boolean;
}

export type ExternalAnimJsonPayload =
  | (Record<string, AnimJsonClipEntry> & Partial<Character3DMetaConfig>)
  | (Character3DMetaConfig & { clips?: Record<string, AnimJsonClipEntry> });

export interface Character3DLoadOptions {
  characterId: string;
  modelId?: string;
  scale?: number;
  baseTint?: THREE.ColorRepresentation;
  tuning?: ThreeToonTuningConfig;
  metaOverride?: Character3DMetaConfig;
  forceGreybox?: boolean;
}

export interface CharacterInstance3D {
  readonly characterId: string;
  readonly source: 'GLB_EXTERNAL' | 'GREYBOX_RIG';
  readonly root: THREE.Group;
  readonly modelPivot: THREE.Group;
  readonly mixer: THREE.AnimationMixer;
  readonly actions: Map<MusouAnimState, THREE.AnimationAction>;
  readonly actionsByClipName: Map<string, THREE.AnimationAction>;
  readonly availableClipNames: string[];
  readonly toonMaterials: THREE.ShaderMaterial[];
  readonly outlineMaterials: THREE.ShaderMaterial[];
  readonly boneSockets: Partial<Record<BoneSocketName, THREE.Object3D>>;
  readonly socketBinder: BoneSocketBinder;
  currentState: MusouAnimState;
  activeClipName: string;
  setState(next: MusouAnimState, fadeSec?: number): void;
  playClipByName(clipName: string, fadeSec?: number): boolean;
  setPaused(paused: boolean): void;
  isPaused(): boolean;
  setForwardOffset(rad: number): void;
  getForwardOffset(): number;
  setRootMotionXZLocked(locked: boolean): void;
  isRootMotionXZLocked(): boolean;
  setSocketGuidesVisible(visible: boolean): void;
  areSocketGuidesVisible(): boolean;
  setUserScaleMultiplier(mult: number): void;
  getUserScaleMultiplier(): number;
  exportAnimJsonConfig(): string;
  setAura(mode: HakiAuraMode, intensity?: number, elapsedSec?: number): void;
  applyTuning(
    tuning: ThreeToonTuningConfig,
    sunDirection?: THREE.Vector3,
    sunColor?: THREE.Color,
    ambientColor?: THREE.Color
  ): void;
  getBoneWorldPosition(socket: BoneSocketName, target?: THREE.Vector3): THREE.Vector3;
  update(dt: number): void;
  dispose(): void;
}

const ANIM_STATE_ALIASES: Record<MusouAnimState, readonly string[]> = {
  Idle: ['idle', 'stand', 'breathing'],
  Run: ['run', 'sprint', 'jog', 'move', 'walk'],
  Dash: ['power_dash', 'powerdash', 'dash', 'dodge', 'evade', 'step'],
  Combo1: ['combo_1', 'combo1', 'attack1', 'punch1', 'slash1', 'light1'],
  Combo2: ['combo_2', 'combo2', 'attack2', 'punch2', 'slash2', 'light2'],
  Combo3: ['combo_3', 'combo3', 'attack3', 'punch3', 'slash3', 'heavy1'],
  Combo4: ['combo_4', 'combo4', 'attack4', 'finisher', 'smash', 'heavy2'],
  AirLaunch: ['jump', 'airlaunch', 'launch', 'uppercut'],
  AirCombo1: ['air_combo_1', 'air_combo', 'aircombo1', 'airattack1', 'air1'],
  AirCombo2: ['air_combo_2', 'aircombo2', 'airattack2', 'air2'],
  AirSlam: ['air_slam', 'airslam', 'slam', 'dive', 'meteor'],
  SpecialWindup: ['special_1', 'special_2', 'specialwindup', 'charge', 'windup', 'cast'],
  SpecialRelease: [
    'burst_awakening',
    'special_3',
    'special_4',
    'specialrelease',
    'special',
    'ultimate',
    'burst',
    'musou'
  ],
  Guard: ['guard', 'block', 'defend'],
  Parry: ['victory', 'parry', 'counter', 'deflect'],
  Hit: ['hit', 'hurt', 'damage', 'flinch'],
  Knockback: ['knockback', 'blown', 'flyback', 'ragdoll'],
  Down: ['downed', 'down', 'knockdown', 'fall', 'ko', 'defeat']
};

const LOOPING_STATES = new Set<MusouAnimState>(['Idle', 'Run', 'Guard', 'SpecialWindup', 'Down']);
const ROOT_BONE_PATTERN = /^(?:hips|pelvis|root)$/i;

export function retargetClipTrackName(rawTrackName: string): string {
  const dotIdx = rawTrackName.indexOf('.');
  if (dotIdx <= 0) {
    return normalizeMixamoBoneName(rawTrackName);
  }
  const bonePart = rawTrackName.slice(0, dotIdx);
  const propPart = rawTrackName.slice(dotIdx);
  return `${normalizeMixamoBoneName(bonePart)}${propPart}`;
}

function isRootPositionTrack(trackName: string): boolean {
  const dotIdx = trackName.indexOf('.');
  if (dotIdx <= 0) return false;
  const bonePart = trackName.slice(0, dotIdx);
  const propPart = trackName.slice(dotIdx).toLowerCase();
  if (propPart !== '.position') return false;
  const cleanBone = normalizeMixamoBoneName(bonePart);
  return ROOT_BONE_PATTERN.test(cleanBone);
}

/**
 * Strips horizontal X/Z translation from Mixamo Hips/Pelvis/Root .position tracks
 * while preserving Y vertical bounce so In-Place unchecked animations stay anchored.
 */
export function stripRootMotionXZ(
  clip: THREE.AnimationClip,
  lockXZ = true
): THREE.AnimationClip {
  const cloned = clip.clone();
  if (!lockXZ) return cloned;
  for (const track of cloned.tracks) {
    if (!isRootPositionTrack(track.name)) continue;
    const vals = track.values;
    for (let i = 0; i + 2 < vals.length; i += 3) {
      vals[i] = 0;
      vals[i + 2] = 0;
    }
  }
  return cloned;
}

/**
 * Scales a loaded model root cleanly to `targetHeight` meters and grounds Box3.min.y at y = 0.
 */
export function normalizeCharacterHeightAndGround(
  modelRoot: THREE.Object3D,
  targetHeight = 1.7
): { appliedScale: number; groundOffsetY: number } {
  modelRoot.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(modelRoot);
  if (box.isEmpty()) {
    return { appliedScale: 1, groundOffsetY: 0 };
  }

  let appliedScale = 1;
  const rawHeight = box.max.y - box.min.y;
  if (targetHeight > 0 && rawHeight > 0.01) {
    appliedScale = targetHeight / rawHeight;
    modelRoot.scale.multiplyScalar(appliedScale);
  }

  modelRoot.updateMatrixWorld(true);
  const groundedBox = new THREE.Box3().setFromObject(modelRoot);
  const groundOffsetY = Number.isFinite(groundedBox.min.y) ? -groundedBox.min.y : 0;
  modelRoot.position.y += groundOffsetY;
  modelRoot.updateMatrixWorld(true);

  return { appliedScale, groundOffsetY };
}

export function extractMetaFromAnimJson(payload: unknown): Character3DMetaConfig {
  if (!payload || typeof payload !== 'object') return {};
  const obj = payload as Record<string, unknown>;
  const meta: Character3DMetaConfig = {};
  if (typeof obj['targetHeight'] === 'number') meta.targetHeight = obj['targetHeight'];
  if (typeof obj['modelForwardOffset'] === 'number') {
    meta.modelForwardOffset = obj['modelForwardOffset'];
  }
  if (typeof obj['outlineThickness'] === 'number') meta.outlineThickness = obj['outlineThickness'];
  if (typeof obj['shadowColorShift'] === 'number') meta.shadowColorShift = obj['shadowColorShift'];
  if (typeof obj['rimIntensity'] === 'number') meta.rimIntensity = obj['rimIntensity'];
  if (typeof obj['lockRootMotionXZ'] === 'boolean') meta.lockRootMotionXZ = obj['lockRootMotionXZ'];
  return meta;
}

export function parseExternalAnimJson(payload: unknown): Map<MusouAnimState, THREE.AnimationClip> {
  const result = new Map<MusouAnimState, THREE.AnimationClip>();
  if (!payload || typeof payload !== 'object') return result;

  const rawRecord =
    'clips' in payload && payload.clips && typeof payload.clips === 'object'
      ? (payload.clips as Record<string, AnimJsonClipEntry>)
      : (payload as Record<string, AnimJsonClipEntry>);

  const clipsList: THREE.AnimationClip[] = [];
  for (const [key, entry] of Object.entries(rawRecord)) {
    if (!entry || typeof entry !== 'object' || !Array.isArray(entry.tracks)) continue;
    const tracks: THREE.KeyframeTrack[] = [];
    for (const t of entry.tracks) {
      if (!t || typeof t.name !== 'string' || !Array.isArray(t.times) || !Array.isArray(t.values)) {
        continue;
      }
      const normName = retargetClipTrackName(t.name);
      if (t.type === 'quaternion') {
        tracks.push(new THREE.QuaternionKeyframeTrack(normName, t.times, t.values));
      } else if (t.type === 'number') {
        tracks.push(new THREE.NumberKeyframeTrack(normName, t.times, t.values));
      } else {
        tracks.push(new THREE.VectorKeyframeTrack(normName, t.times, t.values));
      }
    }
    if (tracks.length > 0) {
      clipsList.push(new THREE.AnimationClip(entry.name ?? key, entry.duration ?? -1, tracks));
    }
  }

  for (const state of ALL_MUSOU_ANIM_STATES) {
    const matched = matchClipForState(state, clipsList);
    if (matched) result.set(state, matched);
  }
  return result;
}

function matchClipForState(
  state: MusouAnimState,
  clips: readonly THREE.AnimationClip[]
): THREE.AnimationClip | null {
  if (clips.length === 0) return null;
  const aliases = ANIM_STATE_ALIASES[state];
  const exact = clips.find((c) => c.name.toLowerCase() === state.toLowerCase());
  if (exact) return exact;

  for (const alias of aliases) {
    const exactAlias = clips.find((c) => c.name.toLowerCase() === alias);
    if (exactAlias) return exactAlias;
  }
  for (const alias of aliases) {
    const found = clips.find((c) => c.name.toLowerCase().includes(alias));
    if (found) return found;
  }
  return null;
}

function buildSkeletonNodeLookup(root: THREE.Object3D): {
  exactNames: Set<string>;
  byNormLower: Map<string, string>;
} {
  const exactNames = new Set<string>();
  const byNormLower = new Map<string, string>();
  root.traverse((obj) => {
    if (!obj.name) return;
    exactNames.add(obj.name);
    const normLower = normalizeMixamoBoneName(obj.name).toLowerCase();
    if (normLower && !byNormLower.has(normLower)) {
      byNormLower.set(normLower, obj.name);
    }
  });
  return { exactNames, byNormLower };
}

function retargetClipToSkeleton(
  clip: THREE.AnimationClip,
  lookup: { exactNames: Set<string>; byNormLower: Map<string, string> }
): THREE.AnimationClip {
  const cloned = clip.clone();
  for (const track of cloned.tracks) {
    const dotIdx = track.name.indexOf('.');
    if (dotIdx <= 0) continue;
    const rawNode = track.name.slice(0, dotIdx);
    const prop = track.name.slice(dotIdx);
    if (lookup.exactNames.has(rawNode)) continue;
    const resolved = lookup.byNormLower.get(normalizeMixamoBoneName(rawNode).toLowerCase());
    if (resolved) {
      track.name = `${resolved}${prop}`;
    }
  }
  return cloned;
}

function attachAnimeToonToSubtree(
  root: THREE.Object3D,
  tuning: ThreeToonTuningConfig,
  meta: Character3DMetaConfig,
  tint?: THREE.ColorRepresentation
): {
  toonMaterials: THREE.ShaderMaterial[];
  outlineMaterials: THREE.ShaderMaterial[];
  ownedGeometries: Set<THREE.BufferGeometry>;
} {
  const toonMaterials: THREE.ShaderMaterial[] = [];
  const outlineMaterials: THREE.ShaderMaterial[] = [];
  const ownedGeometries = new Set<THREE.BufferGeometry>();
  const outlineTargets: THREE.Mesh[] = [];

  root.traverse((obj) => {
    if (obj instanceof THREE.Mesh && !(obj.userData['isToonOutline'] === true)) {
      outlineTargets.push(obj);
    }
  });

  const outlineWidth = meta.outlineThickness ?? tuning.outlineWidth;
  const shadowShift = meta.shadowColorShift ?? tuning.shadowShiftStrength;
  const rim = meta.rimIntensity ?? tuning.rimIntensity;

  for (const mesh of outlineTargets) {
    ownedGeometries.add(mesh.geometry);
    const firstMat = Array.isArray(mesh.material) ? mesh.material[0] : mesh.material;
    const stdMat = firstMat as { color?: THREE.Color; map?: THREE.Texture | null } | undefined;
    const baseColor = tint ?? stdMat?.color ?? '#cbd5e1';
    const map = stdMat?.map ?? null;

    const toonMat = createAnimeToonMaterial({
      baseColor,
      map,
      celSteps: tuning.celSteps,
      shadowShiftStrength: shadowShift,
      rimIntensity: rim
    });

    if (Array.isArray(mesh.material)) {
      mesh.material.forEach((m) => m.dispose());
    } else if (mesh.material) {
      mesh.material.dispose();
    }
    mesh.material = toonMat;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    toonMaterials.push(toonMat);

    const outlineMat = createToonOutlineMaterial({ outlineWidth });
    outlineMaterials.push(outlineMat);

    if (mesh instanceof THREE.SkinnedMesh) {
      const outlineSkinned = new THREE.SkinnedMesh(mesh.geometry, outlineMat);
      outlineSkinned.bind(mesh.skeleton, mesh.bindMatrix);
      outlineSkinned.userData['isToonOutline'] = true;
      outlineSkinned.frustumCulled = mesh.frustumCulled;
      mesh.parent?.add(outlineSkinned);
    } else {
      const outlineMesh = new THREE.Mesh(mesh.geometry, outlineMat);
      outlineMesh.userData['isToonOutline'] = true;
      outlineMesh.position.copy(mesh.position);
      outlineMesh.rotation.copy(mesh.rotation);
      outlineMesh.scale.copy(mesh.scale);
      mesh.parent?.add(outlineMesh);
    }
  }

  return { toonMaterials, outlineMaterials, ownedGeometries };
}

function buildAnimJsonExport(
  targetHeight: number,
  forwardOffset: number,
  outlineThickness: number,
  shadowColorShift: number,
  rimIntensity: number,
  lockRootMotionXZ: boolean
): string {
  return JSON.stringify(
    {
      targetHeight: Number(targetHeight.toFixed(3)),
      modelForwardOffset: Number(forwardOffset.toFixed(4)),
      outlineThickness: Number(outlineThickness.toFixed(4)),
      shadowColorShift: Number(shadowColorShift.toFixed(3)),
      rimIntensity: Number(rimIntensity.toFixed(3)),
      lockRootMotionXZ
    },
    null,
    2
  );
}

/**
 * Clean articulated single neutral-grey humanoid rig used ONLY as a pre-.glb pipeline test harness.
 */
export function createGreyboxRigCharacter(options: {
  characterId: string;
  scale?: number;
  tuning?: ThreeToonTuningConfig;
  meta?: Character3DMetaConfig;
}): CharacterInstance3D {
  const tuning = options.tuning ?? DEFAULT_THREE_TOON_TUNING;
  const meta = options.meta ?? {};
  const scale = options.scale ?? 1;
  const targetHeight = meta.targetHeight ?? 1.7;

  const root = new THREE.Group();
  root.name = `greybox_${options.characterId}`;
  root.scale.setScalar(scale);

  const modelPivot = new THREE.Group();
  modelPivot.name = 'model_pivot';
  let forwardOffset = meta.modelForwardOffset ?? 0;
  modelPivot.rotation.y = forwardOffset;
  root.add(modelPivot);

  const rigBody = new THREE.Group();
  rigBody.name = 'greybox_rig_body';
  modelPivot.add(rigBody);

  const sharedGeos: THREE.BufferGeometry[] = [];
  const toonMaterials: THREE.ShaderMaterial[] = [];
  const outlineMaterials: THREE.ShaderMaterial[] = [];

  let currentOutlineWidth = meta.outlineThickness ?? tuning.outlineWidth;
  let currentShadowShift = meta.shadowColorShift ?? tuning.shadowShiftStrength;
  let currentRimIntensity = meta.rimIntensity ?? tuning.rimIntensity;

  const greyMat = createAnimeToonMaterial({
    baseColor: '#94a3b8',
    shadowTint: '#475569',
    rimColor: '#e2e8f0',
    celSteps: tuning.celSteps,
    shadowShiftStrength: currentShadowShift,
    rimIntensity: currentRimIntensity
  });
  const outlineMat = createToonOutlineMaterial({ outlineWidth: currentOutlineWidth });
  toonMaterials.push(greyMat);
  outlineMaterials.push(outlineMat);

  const addLimb = (
    parent: THREE.Object3D,
    name: string,
    radius: number,
    length: number,
    offsetY: number
  ): THREE.Group => {
    const joint = new THREE.Group();
    joint.name = name;
    parent.add(joint);

    const geo = new THREE.CapsuleGeometry(radius, length, 6, 12);
    sharedGeos.push(geo);

    const mesh = new THREE.Mesh(geo, greyMat);
    mesh.position.y = offsetY;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    joint.add(mesh);

    const outline = new THREE.Mesh(geo, outlineMat);
    outline.position.y = offsetY;
    outline.userData['isToonOutline'] = true;
    joint.add(outline);

    return joint;
  };

  const hips = addLimb(rigBody, 'mixamorigHips', 0.24, 0.22, 0.92);
  const spine = addLimb(hips, 'mixamorigSpine2', 0.27, 0.42, 1.32);
  addLimb(spine, 'mixamorigHead', 0.22, 0.14, 1.88);

  const rightArm = addLimb(spine, 'mixamorigRightArm', 0.1, 0.42, -0.22);
  rightArm.position.set(0.36, 1.54, 0);
  const rightHand = new THREE.Group();
  rightHand.name = 'mixamorigRightHand';
  rightHand.position.set(0, -0.52, 0);
  rightArm.add(rightHand);

  const leftArm = addLimb(spine, 'mixamorigLeftArm', 0.1, 0.42, -0.22);
  leftArm.position.set(-0.36, 1.54, 0);
  const leftHand = new THREE.Group();
  leftHand.name = 'mixamorigLeftHand';
  leftHand.position.set(0, -0.52, 0);
  leftArm.add(leftHand);

  const rightLeg = addLimb(hips, 'mixamorigRightLeg', 0.12, 0.48, -0.34);
  rightLeg.position.set(0.15, 0.82, 0);
  const rightFoot = new THREE.Group();
  rightFoot.name = 'mixamorigRightFoot';
  rightFoot.position.set(0, -0.74, 0);
  rightLeg.add(rightFoot);

  const leftLeg = addLimb(hips, 'mixamorigLeftLeg', 0.12, 0.48, -0.34);
  leftLeg.position.set(-0.15, 0.82, 0);

  normalizeCharacterHeightAndGround(rigBody, targetHeight);

  const socketBinder = new BoneSocketBinder(rigBody);
  const mixer = new THREE.AnimationMixer(rigBody);
  const actions = new Map<MusouAnimState, THREE.AnimationAction>();
  const actionsByClipName = new Map<string, THREE.AnimationAction>();
  const availableClipNames = [...ALL_MUSOU_ANIM_STATES];

  let currentState: MusouAnimState = 'Idle';
  let activeClipName = 'Idle';
  let stateTime = 0;
  let paused = false;
  let lockRootMotionXZ = meta.lockRootMotionXZ ?? true;
  let userScaleMultiplier = 1;
  const tmpPos = new THREE.Vector3();

  const updateGreyboxPose = (dt: number): void => {
    stateTime += dt;
    hips.position.y = 0;
    hips.rotation.set(0, 0, 0);
    spine.rotation.set(0, 0, 0);
    rightArm.rotation.set(0, 0, -0.15);
    leftArm.rotation.set(0, 0, 0.15);
    rightLeg.rotation.set(0, 0, 0);
    leftLeg.rotation.set(0, 0, 0);

    switch (currentState) {
      case 'Run': {
        const s = Math.sin(stateTime * 11);
        hips.position.y = Math.abs(Math.cos(stateTime * 11)) * 0.08;
        spine.rotation.x = 0.25;
        rightArm.rotation.x = -s * 0.85;
        leftArm.rotation.x = s * 0.85;
        rightLeg.rotation.x = s * 0.78;
        leftLeg.rotation.x = -s * 0.78;
        break;
      }
      case 'Dash': {
        spine.rotation.x = 0.55;
        rightArm.rotation.x = 0.9;
        leftArm.rotation.x = 0.9;
        rightLeg.rotation.x = -0.35;
        leftLeg.rotation.x = 0.35;
        break;
      }
      case 'Combo1':
      case 'Combo2':
      case 'AirCombo1':
      case 'AirCombo2': {
        const swing = Math.sin(Math.min(1, stateTime * 9) * Math.PI);
        spine.rotation.y = currentState === 'Combo2' ? 0.5 * swing : -0.45 * swing;
        rightArm.rotation.x = -1.65 * swing;
        leftArm.rotation.x = currentState === 'Combo2' ? -1.45 * swing : 0.45;
        break;
      }
      case 'Combo3':
      case 'Combo4':
      case 'SpecialRelease':
      case 'AirSlam': {
        const burst = Math.sin(Math.min(1, stateTime * 7) * Math.PI);
        spine.rotation.x = 0.35 * burst;
        rightArm.rotation.x = -2.1 * burst;
        leftArm.rotation.x = -2.1 * burst;
        break;
      }
      case 'SpecialWindup': {
        spine.rotation.x = -0.25;
        rightArm.rotation.x = 0.55;
        leftArm.rotation.x = 0.55;
        break;
      }
      case 'Guard':
      case 'Parry': {
        rightArm.rotation.x = -1.1;
        rightArm.rotation.z = 0.55;
        leftArm.rotation.x = -1.1;
        leftArm.rotation.z = -0.55;
        break;
      }
      case 'Hit':
      case 'Knockback': {
        spine.rotation.x = -0.48;
        hips.rotation.x = -0.22;
        break;
      }
      case 'Down': {
        hips.position.y = -0.65;
        hips.rotation.x = -Math.PI * 0.46;
        break;
      }
      default: {
        const breathe = Math.sin(stateTime * 2.6) * 0.03;
        hips.position.y = breathe;
        rightArm.rotation.z = -0.18 + breathe;
        leftArm.rotation.z = 0.18 - breathe;
        break;
      }
    }
  };

  return {
    characterId: options.characterId,
    source: 'GREYBOX_RIG',
    root,
    modelPivot,
    mixer,
    actions,
    actionsByClipName,
    availableClipNames,
    toonMaterials,
    outlineMaterials,
    boneSockets: socketBinder.getSocketMap(),
    socketBinder,
    get currentState() {
      return currentState;
    },
    set currentState(val: MusouAnimState) {
      currentState = val;
    },
    get activeClipName() {
      return activeClipName;
    },
    set activeClipName(val: string) {
      activeClipName = val;
    },
    setState(next: MusouAnimState) {
      if (currentState !== next) {
        currentState = next;
        activeClipName = next;
        stateTime = 0;
      }
    },
    playClipByName(clipName: string) {
      const matched = ALL_MUSOU_ANIM_STATES.find(
        (s) => s.toLowerCase() === clipName.toLowerCase()
      );
      if (matched) {
        currentState = matched;
        activeClipName = matched;
        stateTime = 0;
        return true;
      }
      return false;
    },
    setPaused(next: boolean) {
      paused = next;
    },
    isPaused() {
      return paused;
    },
    setForwardOffset(rad: number) {
      forwardOffset = rad;
      modelPivot.rotation.y = rad;
    },
    getForwardOffset() {
      return forwardOffset;
    },
    setRootMotionXZLocked(locked: boolean) {
      lockRootMotionXZ = locked;
    },
    isRootMotionXZLocked() {
      return lockRootMotionXZ;
    },
    setSocketGuidesVisible(visible: boolean) {
      socketBinder.setGuidesVisible(visible);
    },
    areSocketGuidesVisible() {
      return socketBinder.areGuidesVisible();
    },
    setUserScaleMultiplier(mult: number) {
      userScaleMultiplier = Math.max(0.4, Math.min(3.0, mult));
      modelPivot.scale.setScalar(userScaleMultiplier);
    },
    getUserScaleMultiplier() {
      return userScaleMultiplier;
    },
    exportAnimJsonConfig() {
      return buildAnimJsonExport(
        targetHeight * userScaleMultiplier,
        forwardOffset,
        currentOutlineWidth,
        currentShadowShift,
        currentRimIntensity,
        lockRootMotionXZ
      );
    },
    setAura(mode: HakiAuraMode, intensity = 1, elapsedSec = 0) {
      for (const mat of toonMaterials) {
        setToonMaterialAura(mat, mode, intensity, elapsedSec);
      }
    },
    applyTuning(nextTuning, sunDirection, sunColor, ambientColor) {
      currentShadowShift = nextTuning.shadowShiftStrength;
      currentRimIntensity = nextTuning.rimIntensity;
      currentOutlineWidth = nextTuning.outlineWidth;
      for (const mat of toonMaterials) {
        applyToonMaterialTuning(mat, nextTuning, sunDirection, sunColor, ambientColor);
      }
      for (const mat of outlineMaterials) {
        applyToonMaterialTuning(mat, nextTuning);
      }
    },
    getBoneWorldPosition(socket: BoneSocketName, target?: THREE.Vector3): THREE.Vector3 {
      return socketBinder.getSocketWorldPosition(socket, target ?? tmpPos);
    },
    update(dt: number) {
      if (paused) return;
      updateGreyboxPose(dt);
      mixer.update(dt);
    },
    dispose() {
      socketBinder.dispose();
      mixer.stopAllAction();
      mixer.uncacheRoot(rigBody);
      for (const geo of sharedGeos) {
        geo.dispose();
      }
      for (const mat of toonMaterials) {
        mat.dispose();
      }
      for (const mat of outlineMaterials) {
        mat.dispose();
      }
      root.clear();
    }
  };
}

interface CachedGltfTemplate {
  gltf: GLTF;
  sidecarClips: Map<MusouAnimState, THREE.AnimationClip>;
  meta: Character3DMetaConfig;
}

interface RootTrackBackup {
  clip: THREE.AnimationClip;
  rawRootTracks: Array<{ track: THREE.KeyframeTrack; originalValues: Float32Array }>;
}

export class Character3DLoader {
  private readonly gltfLoader: GLTFLoader;
  private readonly dracoLoader: DRACOLoader;
  private readonly cache = new Map<string, CachedGltfTemplate | null>();

  constructor(dracoDecoderPath = './draco/') {
    this.dracoLoader = new DRACOLoader();
    this.dracoLoader.setDecoderPath(dracoDecoderPath);
    this.gltfLoader = new GLTFLoader();
    this.gltfLoader.setDRACOLoader(this.dracoLoader);
  }

  public async loadCharacter(options: Character3DLoadOptions): Promise<CharacterInstance3D> {
    const tuning = options.tuning ?? DEFAULT_THREE_TOON_TUNING;
    const scale = options.scale ?? 1;
    if (options.forceGreybox || typeof fetch === 'undefined') {
      return createGreyboxRigCharacter({
        characterId: options.characterId,
        scale,
        tuning,
        meta: options.metaOverride
      });
    }

    const key = options.modelId ?? options.characterId;
    let template = this.cache.get(key);
    if (template === undefined) {
      template = await this.tryFetchExternalTemplate(key);
      this.cache.set(key, template);
    }

    if (!template) {
      return createGreyboxRigCharacter({
        characterId: options.characterId,
        scale,
        tuning,
        meta: options.metaOverride
      });
    }

    const meta: Character3DMetaConfig = {
      ...template.meta,
      ...options.metaOverride
    };
    const targetHeight = meta.targetHeight ?? 1.7;
    let forwardOffset = meta.modelForwardOffset ?? 0;
    let lockRootMotionXZ = meta.lockRootMotionXZ ?? true;
    let currentOutlineWidth = meta.outlineThickness ?? tuning.outlineWidth;
    let currentShadowShift = meta.shadowColorShift ?? tuning.shadowShiftStrength;
    let currentRimIntensity = meta.rimIntensity ?? tuning.rimIntensity;

    const clonedRoot = SkeletonUtils.clone(template.gltf.scene) as THREE.Group;
    const modelPivot = new THREE.Group();
    modelPivot.name = 'model_pivot';
    modelPivot.rotation.y = forwardOffset;
    modelPivot.add(clonedRoot);

    const wrapper = new THREE.Group();
    wrapper.name = `glb_${options.characterId}`;
    wrapper.scale.setScalar(scale);
    wrapper.add(modelPivot);

    normalizeCharacterHeightAndGround(clonedRoot, targetHeight);

    const { toonMaterials, outlineMaterials, ownedGeometries } = attachAnimeToonToSubtree(
      clonedRoot,
      tuning,
      meta,
      options.baseTint
    );

    const socketBinder = new BoneSocketBinder(clonedRoot);
    const skeletonLookup = buildSkeletonNodeLookup(clonedRoot);
    const mixer = new THREE.AnimationMixer(clonedRoot);
    const actions = new Map<MusouAnimState, THREE.AnimationAction>();
    const actionsByClipName = new Map<string, THREE.AnimationAction>();
    const rootTrackBackups: RootTrackBackup[] = [];
    const preparedClips: THREE.AnimationClip[] = [];

    const registerPreparedClip = (rawClip: THREE.AnimationClip): THREE.AnimationClip => {
      const retargeted = retargetClipToSkeleton(rawClip, skeletonLookup);
      const originalRootTracks: Array<{ track: THREE.KeyframeTrack; originalValues: Float32Array }> = [];
      for (const t of retargeted.tracks) {
        if (isRootPositionTrack(t.name)) {
          originalRootTracks.push({
            track: t,
            originalValues: Float32Array.from(t.values)
          });
        }
      }
      const processed = stripRootMotionXZ(retargeted, lockRootMotionXZ);
      // Restore captured originals on backup reference pointing to processed clip's tracks
      const processedBackups = originalRootTracks.map((orig, idx) => {
        const matchingTrack = processed.tracks.filter((t) => isRootPositionTrack(t.name))[idx];
        return matchingTrack
          ? { track: matchingTrack, originalValues: orig.originalValues }
          : orig;
      });
      rootTrackBackups.push({ clip: processed, rawRootTracks: processedBackups });
      preparedClips.push(processed);
      return processed;
    };

    for (const embeddedClip of template.gltf.animations) {
      const prepped = registerPreparedClip(embeddedClip);
      const act = mixer.clipAction(prepped);
      actionsByClipName.set(prepped.name, act);
    }

    const sidecarPrepared = new Map<MusouAnimState, THREE.AnimationClip>();
    for (const [state, sidecarClip] of template.sidecarClips.entries()) {
      const prepped = registerPreparedClip(sidecarClip);
      sidecarPrepared.set(state, prepped);
      if (!actionsByClipName.has(prepped.name)) {
        actionsByClipName.set(prepped.name, mixer.clipAction(prepped));
      }
    }

    for (const state of ALL_MUSOU_ANIM_STATES) {
      const clip = sidecarPrepared.get(state) ?? matchClipForState(state, preparedClips);
      if (clip) {
        const action = mixer.clipAction(clip);
        if (!LOOPING_STATES.has(state)) {
          action.setLoop(THREE.LoopOnce, 1);
          action.clampWhenFinished = true;
        }
        actions.set(state, action);
      }
    }

    const availableClipNames = Array.from(actionsByClipName.keys());
    const idleAction = actions.get('Idle') ?? actionsByClipName.get(availableClipNames[0] ?? '');
    idleAction?.play();

    let currentState: MusouAnimState = 'Idle';
    let activeClipName = idleAction?.getClip().name ?? 'Idle';
    let activeAction: THREE.AnimationAction | undefined = idleAction;
    let paused = false;
    let userScaleMultiplier = 1;
    const tmpVec = new THREE.Vector3();

    const applyRootMotionLockState = (locked: boolean) => {
      lockRootMotionXZ = locked;
      for (const entry of rootTrackBackups) {
        for (const rt of entry.rawRootTracks) {
          const dst = rt.track.values;
          const src = rt.originalValues;
          for (let i = 0; i + 2 < dst.length; i += 3) {
            dst[i] = locked ? 0 : (src[i] ?? 0);
            dst[i + 1] = src[i + 1] ?? 0;
            dst[i + 2] = locked ? 0 : (src[i + 2] ?? 0);
          }
        }
      }
    };

    return {
      characterId: options.characterId,
      source: 'GLB_EXTERNAL',
      root: wrapper,
      modelPivot,
      mixer,
      actions,
      actionsByClipName,
      availableClipNames,
      toonMaterials,
      outlineMaterials,
      boneSockets: socketBinder.getSocketMap(),
      socketBinder,
      get currentState() {
        return currentState;
      },
      set currentState(val: MusouAnimState) {
        currentState = val;
      },
      get activeClipName() {
        return activeClipName;
      },
      set activeClipName(val: string) {
        activeClipName = val;
      },
      setState(next: MusouAnimState, fadeSec = 0.11) {
        if (next === currentState) return;
        const nextAction = actions.get(next) ?? actions.get('Idle');
        currentState = next;
        if (nextAction && nextAction !== activeAction) {
          const prevAction = activeAction;
          nextAction.reset();
          nextAction.play();
          if (prevAction) {
            prevAction.crossFadeTo(nextAction, Math.max(0.08, Math.min(0.15, fadeSec)), true);
          }
          activeAction = nextAction;
          activeClipName = nextAction.getClip().name;
        }
      },
      playClipByName(clipName: string, fadeSec = 0.11) {
        const direct =
          actionsByClipName.get(clipName) ??
          Array.from(actionsByClipName.entries()).find(
            ([k]) => k.toLowerCase() === clipName.toLowerCase()
          )?.[1];
        if (!direct) return false;
        const prevAction = activeAction;
        direct.reset();
        direct.play();
        if (prevAction && prevAction !== direct) {
          prevAction.crossFadeTo(direct, Math.max(0.08, Math.min(0.15, fadeSec)), true);
        }
        activeAction = direct;
        activeClipName = direct.getClip().name;
        return true;
      },
      setPaused(next: boolean) {
        paused = next;
      },
      isPaused() {
        return paused;
      },
      setForwardOffset(rad: number) {
        forwardOffset = rad;
        modelPivot.rotation.y = rad;
      },
      getForwardOffset() {
        return forwardOffset;
      },
      setRootMotionXZLocked(locked: boolean) {
        applyRootMotionLockState(locked);
      },
      isRootMotionXZLocked() {
        return lockRootMotionXZ;
      },
      setSocketGuidesVisible(visible: boolean) {
        socketBinder.setGuidesVisible(visible);
      },
      areSocketGuidesVisible() {
        return socketBinder.areGuidesVisible();
      },
      setUserScaleMultiplier(mult: number) {
        userScaleMultiplier = Math.max(0.4, Math.min(3.0, mult));
        modelPivot.scale.setScalar(userScaleMultiplier);
      },
      getUserScaleMultiplier() {
        return userScaleMultiplier;
      },
      exportAnimJsonConfig() {
        return buildAnimJsonExport(
          targetHeight * userScaleMultiplier,
          forwardOffset,
          currentOutlineWidth,
          currentShadowShift,
          currentRimIntensity,
          lockRootMotionXZ
        );
      },
      setAura(mode: HakiAuraMode, intensity = 1, elapsedSec = 0) {
        for (const mat of toonMaterials) {
          setToonMaterialAura(mat, mode, intensity, elapsedSec);
        }
      },
      applyTuning(nextTuning, sunDirection, sunColor, ambientColor) {
        currentShadowShift = nextTuning.shadowShiftStrength;
        currentRimIntensity = nextTuning.rimIntensity;
        currentOutlineWidth = nextTuning.outlineWidth;
        for (const mat of toonMaterials) {
          applyToonMaterialTuning(mat, nextTuning, sunDirection, sunColor, ambientColor);
        }
        for (const mat of outlineMaterials) {
          applyToonMaterialTuning(mat, nextTuning);
        }
      },
      getBoneWorldPosition(socket: BoneSocketName, target?: THREE.Vector3): THREE.Vector3 {
        return socketBinder.getSocketWorldPosition(socket, target ?? tmpVec);
      },
      update(dt: number) {
        if (paused) return;
        mixer.update(dt);
      },
      dispose() {
        socketBinder.dispose();
        mixer.stopAllAction();
        mixer.uncacheRoot(clonedRoot);
        for (const geo of ownedGeometries) {
          geo.dispose();
        }
        for (const mat of toonMaterials) {
          for (const u of Object.values(mat.uniforms)) {
            if (u?.value instanceof THREE.Texture && u.value.image?.width > 4) {
              u.value.dispose();
            }
          }
          mat.dispose();
        }
        for (const mat of outlineMaterials) {
          mat.dispose();
        }
        wrapper.clear();
      }
    };
  }

  private async tryFetchExternalTemplate(id: string): Promise<CachedGltfTemplate | null> {
    const candidateUrls = [
      `./assets/3d/characters/${id}.glb`,
      `./assets/3d/characters/${id}_base.glb`,
      `./assets/3d/models/${id}.glb`
    ];
    for (const url of candidateUrls) {
      try {
        const head = await fetch(url, { method: 'HEAD' });
        if (!head.ok) continue;
        const gltf = await this.gltfLoader.loadAsync(url);
        const sidecar = await this.tryLoadAnimSidecar(id);
        return { gltf, sidecarClips: sidecar.clips, meta: sidecar.meta };
      } catch {
        // Fallback smoothly to next candidate or greybox rig
      }
    }
    return null;
  }

  private async tryLoadAnimSidecar(
    id: string
  ): Promise<{ clips: Map<MusouAnimState, THREE.AnimationClip>; meta: Character3DMetaConfig }> {
    const urls = [
      `./assets/3d/characters/${id}.anim.json`,
      `./assets/3d/characters/${id}_base.anim.json`,
      `./assets/3d/animations/${id}.anim.json`,
      `./assets/3d/animations/${id}_base.anim.json`,
      `./assets/3d/animations/mixamo_musou_base.anim.json`
    ];
    for (const url of urls) {
      try {
        const res = await fetch(url);
        if (!res.ok) continue;
        const json: unknown = await res.json();
        const clips = parseExternalAnimJson(json);
        const meta = extractMetaFromAnimJson(json);
        if (clips.size > 0 || Object.keys(meta).length > 0) {
          return { clips, meta };
        }
      } catch {
        // Optional sidecar missing
      }
    }
    return { clips: new Map(), meta: {} };
  }

  public dispose(): void {
    for (const entry of this.cache.values()) {
      if (!entry) continue;
      entry.gltf.scene.traverse((obj) => {
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
    this.cache.clear();
    this.dracoLoader.dispose();
  }
}
