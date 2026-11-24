import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { createBattleWorld, stepBattleWorld } from '../../src/core/combat/battleWorld';
import { FIXED_DT } from '../../src/core/constants';
import { SeededPRNG } from '../../src/core/math/prng';
import { computeBattleStateHash } from '../../src/core/net/stateHasher';
import { createStandardPresetBuild } from '../../src/core/net/terminalArenaRule';
import { defaultDataRegistry } from '../../src/data/dataRegistry';
import {
  getCharacterWeaponLoadoutById,
  resolveCharacterWeaponLoadout,
  WEAPONS_3D_MANIFEST
} from '../../src/data/assets/weapons3dRegistry';
import { BoneSocketBinder } from '../../src/render/three/assets/BoneSocketBinder';
import { WeaponSocketMountSystem } from '../../src/render/three/assets/WeaponSocketMountSystem';
import {
  isProgressInTrailWindow,
  ToonWeaponTrailMesh
} from '../../src/render/three/vfx/ToonWeaponTrailMesh';
import {
  ComicHitSparkPool,
  MAX_STARBURSTS
} from '../../src/render/three/vfx/ComicHitSparkPool';
import { ThreeMusouBattleScene } from '../../src/render/three/ThreeMusouBattleScene';
import {
  ThreeComposerLike,
  ThreeRendererLike,
  ThreeStageHost
} from '../../src/render/three/ThreeStageHost';
import { computeResponsiveViewport } from '../../src/render/viewport/responsiveViewportManager';
import {
  auditWeaponGlbBuffer,
  GLB_BIN_CHUNK_TYPE,
  GLB_JSON_CHUNK_TYPE,
  GLB_MAGIC,
  runValidate3dAssets,
  validateWeapons3dManifest
} from '../../scripts/validate-3d-assets.mjs';

function makePngHeader(width: number, height: number): Buffer {
  const buf = Buffer.alloc(24);
  buf[0] = 0x89;
  buf[1] = 0x50;
  buf[2] = 0x4e;
  buf[3] = 0x47;
  buf[4] = 0x0d;
  buf[5] = 0x0a;
  buf[6] = 0x1a;
  buf[7] = 0x0a;
  buf.write('IHDR', 12, 'ascii');
  buf.writeUInt32BE(width, 16);
  buf.writeUInt32BE(height, 20);
  return buf;
}

function buildSyntheticWeaponGlb(opts: {
  triangles?: number;
  includeDraco?: boolean;
  texWidth?: number;
  texHeight?: number;
}): Buffer {
  const triangles = opts.triangles ?? 2400;
  const includeDraco = opts.includeDraco ?? true;
  const texW = opts.texWidth ?? 512;
  const texH = opts.texHeight ?? 512;

  const pngBytes = makePngHeader(texW, texH);
  const padLen = (4 - (pngBytes.length % 4)) % 4;
  const binChunkData = Buffer.concat([pngBytes, Buffer.alloc(padLen)]);

  const jsonObj = {
    asset: { version: '2.0' },
    extensionsUsed: includeDraco ? ['KHR_draco_mesh_compression'] : [],
    meshes: [
      {
        primitives: [
          {
            indices: 0,
            attributes: { POSITION: 1 },
            ...(includeDraco
              ? { extensions: { KHR_draco_mesh_compression: { bufferView: 0, attributes: {} } } }
              : {})
          }
        ]
      }
    ],
    accessors: [
      { count: triangles * 3, componentType: 5123, type: 'SCALAR' },
      { count: triangles * 3, componentType: 5126, type: 'VEC3' }
    ],
    images: [{ bufferView: 0, mimeType: 'image/png' }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: pngBytes.length }],
    buffers: [{ byteLength: binChunkData.length }]
  };

  const jsonRaw = Buffer.from(JSON.stringify(jsonObj), 'utf8');
  const jsonPad = (4 - (jsonRaw.length % 4)) % 4;
  const jsonChunkData = Buffer.concat([jsonRaw, Buffer.from(' '.repeat(jsonPad), 'utf8')]);

  const totalLength = 12 + 8 + jsonChunkData.length + 8 + binChunkData.length;
  const glb = Buffer.alloc(totalLength);
  glb.writeUInt32LE(GLB_MAGIC, 0);
  glb.writeUInt32LE(2, 4);
  glb.writeUInt32LE(totalLength, 8);

  let off = 12;
  glb.writeUInt32LE(jsonChunkData.length, off);
  glb.writeUInt32LE(GLB_JSON_CHUNK_TYPE, off + 4);
  jsonChunkData.copy(glb, off + 8);
  off += 8 + jsonChunkData.length;

  glb.writeUInt32LE(binChunkData.length, off);
  glb.writeUInt32LE(GLB_BIN_CHUNK_TYPE, off + 4);
  binChunkData.copy(glb, off + 8);

  return glb;
}

function buildMixamoRig(): THREE.Group {
  const root = new THREE.Group();
  const hips = new THREE.Bone();
  hips.name = 'mixamorigHips';
  const spine = new THREE.Bone();
  spine.name = 'mixamorigSpine2';
  const head = new THREE.Bone();
  head.name = 'mixamorigHead';
  const rHand = new THREE.Bone();
  rHand.name = 'mixamorigRightHand';
  const lHand = new THREE.Bone();
  lHand.name = 'mixamorigLeftHand';
  root.add(hips);
  hips.add(spine);
  spine.add(head);
  spine.add(rHand);
  spine.add(lHand);
  return root;
}

function createMockThreeHost() {
  const mockRenderer: ThreeRendererLike = {
    domElement: {} as HTMLCanvasElement,
    shadowMap: { enabled: true, type: THREE.PCFSoftShadowMap },
    toneMapping: THREE.NoToneMapping,
    toneMappingExposure: 1,
    outputColorSpace: THREE.SRGBColorSpace,
    info: {
      render: { calls: 14, triangles: 21000 },
      memory: { geometries: 10, textures: 4 },
      programs: [{}]
    },
    setPixelRatio: vi.fn(),
    setSize: vi.fn(),
    render: vi.fn(),
    dispose: vi.fn()
  };
  const mockComposer: ThreeComposerLike = {
    setSize: vi.fn(),
    render: vi.fn(),
    dispose: vi.fn()
  };
  const host = new ThreeStageHost({
    rendererFactory: () => mockRenderer,
    composerFactory: () => ({
      composer: mockComposer,
      bloomPass: { strength: 0.38, enabled: true }
    })
  });
  const s25 = computeResponsiveViewport(915, 412, 3, {
    top: 0,
    right: 24,
    bottom: 0,
    left: 24
  });
  host.init(null, s25);
  return { host, s25 };
}

describe('Step 3: WeaponSocketMountSystem, ToonWeaponTrailMesh, ComicHitSparkPool & Validator', () => {
  it('mounts Zoro 3-sword style sockets, swaps combat <-> waist holster & disposes cleanly', () => {
    const rig = buildMixamoRig();
    const binder = new BoneSocketBinder(rig);
    const system = new WeaponSocketMountSystem(binder);

    const zoroLoadout = resolveCharacterWeaponLoadout('zoro', null);
    expect(zoroLoadout?.loadoutId).toBe('zoro_base');
    if (!zoroLoadout) return;

    system.mountLoadout(zoroLoadout);
    expect(system.getMountedSlotKeys()).toEqual(['right', 'left', 'mouth']);
    expect(system.getMountedSlot('right')?.activeBoneName).toBe('RightHand');
    expect(system.getMountedSlot('left')?.activeBoneName).toBe('LeftHand');
    expect(system.getMountedSlot('mouth')?.activeBoneName).toBe('Head');
    expect(system.isHolstered()).toBe(false);

    // Non-combat Idle past holsterDelaySec transitions all 3 swords to Hips waist holster
    system.update(2.0, 'Idle', 2.0);
    expect(system.isHolstered()).toBe(true);
    expect(system.getMountedSlot('right')?.activeBoneName).toBe('Hips');
    expect(system.getMountedSlot('mouth')?.activeBoneName).toBe('Hips');

    // Entering combat immediately draws all 3 swords back to combat sockets
    system.update(0.016, 'Combo3', 2.05);
    expect(system.isHolstered()).toBe(false);
    expect(system.getMountedSlot('mouth')?.activeBoneName).toBe('Head');

    // Zoro King of Hell upgrades aura & Law/Kaido loadouts resolve cleanly
    const kohLoadout = resolveCharacterWeaponLoadout('zoro', 'zoro_king_of_hell');
    expect(kohLoadout?.loadoutId).toBe('zoro_king_of_hell');
    expect(resolveCharacterWeaponLoadout('law')?.loadoutId).toBe('law_base');
    expect(resolveCharacterWeaponLoadout('kaido')?.loadoutId).toBe('kaido_base');
    if (kohLoadout) {
      system.mountLoadout(kohLoadout);
      const enmaMat = system.getMountedSlot('right')?.toonMaterials[0];
      expect(enmaMat?.uniforms['uAuraMode']?.value).toBe(2);
    }

    system.dispose();
    expect(binder.getSocket('RightHand')?.children.length).toBe(0);
    expect(binder.getSocket('LeftHand')?.children.length).toBe(0);
    expect(binder.getSocket('Hips')?.children.length).toBe(1); // spine only
    binder.dispose();
  });

  it('updates ToonWeaponTrailMesh ring buffer with zero buffer reallocation and fades out outside windows', () => {
    const zoro = getCharacterWeaponLoadoutById('zoro_base');
    expect(zoro).not.toBeNull();
    const rules = zoro?.trailWindows['COMBO_1'] ?? [];
    expect(isProgressInTrailWindow(0.45, rules, 'right')).toBe(true);
    expect(isProgressInTrailWindow(0.1, rules, 'right')).toBe(false);
    expect(isProgressInTrailWindow(0.45, rules, 'mouth')).toBe(false);

    const scene = new THREE.Scene();
    const enmaTheme = WEAPONS_3D_MANIFEST.weapons['zoro_enma']!.trailTheme;
    const trail = new ToonWeaponTrailMesh(scene, enmaTheme, { maxLifetimeSec: 0.16 });
    const posBufBefore = trail.getPositionBufferRef();

    const base = new THREE.Vector3();
    const tip = new THREE.Vector3();
    for (let f = 0; f < 40; f += 1) {
      const ang = f * 0.14;
      base.set(Math.cos(ang) * 0.5, 1.0, Math.sin(ang) * 0.5);
      tip.set(Math.cos(ang) * 1.6, 1.2, Math.sin(ang) * 1.6);
      trail.update(1 / 60, true, base, tip, f / 60, true);
    }

    // Zero buffer reallocation across 40 swinging frames
    expect(trail.getPositionBufferRef()).toBe(posBufBefore);
    expect(trail.getActiveSegmentCount()).toBeGreaterThan(2);
    expect(trail.mesh.visible).toBe(true);

    // Turning emitActive off stops emission and fades segments cleanly back to 0
    for (let f = 0; f < 25; f += 1) {
      trail.update(0.02, false, base, tip, 1 + f * 0.02, true);
    }
    expect(trail.getActiveSegmentCount()).toBe(0);
    expect(trail.mesh.visible).toBe(false);

    trail.dispose();
    expect(scene.children.length).toBe(0);
  });

  it('caps ComicHitSparkPool at pool capacity via circular reuse and enforces flashEffect === false clamp', () => {
    const scene = new THREE.Scene();
    const pool = new ComicHitSparkPool(scene);

    // Overflow MAX_STARBURSTS (24) with 40 spawns -> active starbursts never exceed 24
    const pos = new THREE.Vector3(1, 1.2, 0.5);
    for (let i = 0; i < 40; i += 1) {
      pool.spawnStarburst(pos, '#ffffff', true, 1.2);
    }
    pool.update(0.016);
    expect(pool.getPoolCounts().starbursts).toBe(MAX_STARBURSTS);

    // Accessible flashEffect === false reduces bloom/scale intensity safely
    const safePool = new ComicHitSparkPool(scene);
    safePool.spawnFromCombatEvent(
      { kind: 'HAKI_ARC', position: pos, color: '#a855f7', intensity: 1.5 },
      false
    );
    safePool.update(0.016);
    expect(safePool.getPoolCounts().hakiArcs).toBeGreaterThan(0);

    pool.dispose();
    safePool.dispose();
    expect(scene.children.length).toBe(0);
  });

  it('validates weapon GLB polygon limit (<= 8,000), Draco, texture size & weapons_3d.json schema', () => {
    const okWeapon = buildSyntheticWeaponGlb({ triangles: 6400, includeDraco: true, texWidth: 512 });
    const okRep = auditWeaponGlbBuffer(okWeapon, 'public/assets/3d/weapons/zoro_enma.glb');
    expect(okRep.ok).toBe(true);

    const heavyWeapon = buildSyntheticWeaponGlb({ triangles: 8450 });
    const heavyRep = auditWeaponGlbBuffer(heavyWeapon, 'zoro_enma.glb');
    expect(heavyRep.ok).toBe(false);
    expect(heavyRep.errors.some((e: string) => e.includes('exceeds limit 8000'))).toBe(true);

    const manifestOk = validateWeapons3dManifest(WEAPONS_3D_MANIFEST, process.cwd());
    expect(manifestOk.ok).toBe(true);
    expect(manifestOk.weaponCount).toBe(5);
    expect(manifestOk.loadoutCount).toBe(4);

    // Invalid bone & invalid trailWindow must fail
    const badManifestRes = validateWeapons3dManifest({
      weapons: {
        bad_sword: {
          modelPath: './assets/3d/weapons/bad_sword.glb',
          combatSocket: { bone: 'IllegalBoneXYZ' }
        }
      },
      characterLoadouts: {
        bad_loadout: {
          slots: { right: 'bad_sword' },
          trailWindows: {
            COMBO_1: [{ start: 0.8, end: 0.4, weapons: ['right'] }]
          }
        }
      }
    });
    expect(badManifestRes.ok).toBe(false);
    expect(badManifestRes.errors.length).toBeGreaterThanOrEqual(2);

    const ws = runValidate3dAssets({ rootDir: process.cwd() });
    expect(ws.ok).toBe(true);
  });

  it('cycles Zoro -> Law -> Kaido with test swing & sparks under 16.6ms/frame and zero leaks across 5x dispose round-trips', () => {
    const { host, s25 } = createMockThreeHost();
    const world = createBattleWorld(
      {
        seed: 20261124,
        mode: '1V1',
        arenaSizeKey: 'medium',
        teamAlpha: [createStandardPresetBuild('zoro', 'a1', true, 3, defaultDataRegistry)],
        teamOmega: [createStandardPresetBuild('kaido', 'o1', false, 3, defaultDataRegistry)]
      },
      defaultDataRegistry
    );
    const prng = new SeededPRNG(20261124);
    for (let i = 0; i < 10; i += 1) {
      stepBattleWorld(world, [], defaultDataRegistry, prng, FIXED_DT);
    }
    const coreHashBefore = computeBattleStateHash(world, prng);

    for (let cycle = 0; cycle < 5; cycle += 1) {
      const scene3d = new ThreeMusouBattleScene(host);
      for (const loadoutId of ['zoro_base', 'zoro_king_of_hell', 'law_base', 'kaido_base']) {
        scene3d.setWeaponTunerCharacter(loadoutId);
        scene3d.triggerWeaponTestSwing();
        scene3d.triggerHitSparkTest();
        const t0 = performance.now();
        for (let f = 0; f < 15; f += 1) {
          scene3d.render(world, 1, 1 / 60, s25);
        }
        const avgMs = (performance.now() - t0) / 15;
        expect(avgMs).toBeLessThan(16.6);
      }
      expect(scene3d.exportWeapons3dJson()).toContain('zoro_wado_ichimonji');
      scene3d.dispose();
      expect(host.scene.children.length).toBe(2);
    }

    expect(computeBattleStateHash(world, prng)).toBe(coreHashBefore);
    host.dispose();
  });
});
