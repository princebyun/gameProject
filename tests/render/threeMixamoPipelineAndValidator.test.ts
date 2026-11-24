import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { createBattleWorld } from '../../src/core/combat/battleWorld';
import { createStandardPresetBuild } from '../../src/core/net/terminalArenaRule';
import { defaultDataRegistry } from '../../src/data/dataRegistry';
import {
  BoneSocketBinder,
  normalizeMixamoBoneName
} from '../../src/render/three/assets/BoneSocketBinder';
import {
  createGreyboxRigCharacter,
  normalizeCharacterHeightAndGround,
  stripRootMotionXZ
} from '../../src/render/three/assets/Character3DLoader';
import { ThreeMusouBattleScene } from '../../src/render/three/ThreeMusouBattleScene';
import {
  ThreeComposerLike,
  ThreeRendererLike,
  ThreeStageHost
} from '../../src/render/three/ThreeStageHost';
import { computeResponsiveViewport } from '../../src/render/viewport/responsiveViewportManager';
import {
  auditGlbBuffer,
  GLB_BIN_CHUNK_TYPE,
  GLB_JSON_CHUNK_TYPE,
  GLB_MAGIC,
  runValidate3dAssets
} from '../../scripts/validate-3d-assets.mjs';
import {
  formatMissingBlenderMessage,
  parsePack3dArgs,
  runPack3dCharacter
} from '../../scripts/pack-3d-character.mjs';

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

function buildSyntheticGlb(opts: {
  triangles?: number;
  includeDraco?: boolean;
  texWidth?: number;
  texHeight?: number;
  clips?: string[];
  nodeNames?: string[];
}): Buffer {
  const triangles = opts.triangles ?? 1200;
  const includeDraco = opts.includeDraco ?? true;
  const texW = opts.texWidth ?? 512;
  const texH = opts.texHeight ?? 512;
  const clips = opts.clips ?? ['IDLE', 'RUN', 'COMBO_1'];
  const nodeNames = opts.nodeNames ?? [
    'mixamorigHips',
    'mixamorigRightHand',
    'mixamorigLeftHand'
  ];

  const pngBytes = makePngHeader(texW, texH);
  const padLen = (4 - (pngBytes.length % 4)) % 4;
  const binChunkData = Buffer.concat([pngBytes, Buffer.alloc(padLen)]);

  const jsonObj = {
    asset: { version: '2.0' },
    extensionsUsed: includeDraco ? ['KHR_draco_mesh_compression'] : [],
    nodes: nodeNames.map((name) => ({ name })),
    animations: clips.map((name) => ({ name, channels: [], samplers: [] })),
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
    images: [
      {
        bufferView: 0,
        mimeType: 'image/png'
      }
    ],
    bufferViews: [
      {
        buffer: 0,
        byteOffset: 0,
        byteLength: pngBytes.length
      }
    ],
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

describe('Step 3: Mixamo Root Motion Lock, BoneSocketBinder, GLB Validator CLI & Packer', () => {
  it('stripRootMotionXZ locks horizontal X/Z translation on mixamorigHips while preserving Y bounce', () => {
    const hipsPos = new THREE.VectorKeyframeTrack(
      'mixamorigHips.position',
      [0, 0.25, 0.5],
      [0, 0.9, 0, 1.25, 1.08, 2.4, 2.5, 0.92, 4.8]
    );
    const armQuat = new THREE.QuaternionKeyframeTrack(
      'mixamorigRightArm.quaternion',
      [0, 0.5],
      [0, 0, 0, 1, 0.3, 0, 0, 0.95]
    );
    const rawClip = new THREE.AnimationClip('RUN', 0.5, [hipsPos, armQuat]);
    const stripped = stripRootMotionXZ(rawClip, true);

    const outHips = stripped.tracks[0];
    const outArm = stripped.tracks[1];
    expect(outHips?.values[0]).toBe(0);
    expect(outHips?.values[1]).toBeCloseTo(0.9, 5);
    expect(outHips?.values[2]).toBe(0);
    expect(outHips?.values[3]).toBe(0);
    expect(outHips?.values[4]).toBeCloseTo(1.08, 5);
    expect(outHips?.values[5]).toBe(0);
    expect(outHips?.values[6]).toBe(0);
    expect(outHips?.values[7]).toBeCloseTo(0.92, 5);
    expect(outHips?.values[8]).toBe(0);

    // Non-root tracks must remain untouched
    expect(Array.from(outArm?.values ?? [])).toEqual(Array.from(armQuat.values));

    // Greybox runtime root-lock & forward-flip inspector methods work cleanly
    const grey = createGreyboxRigCharacter({ characterId: 'luffy_test' });
    expect(grey.isRootMotionXZLocked()).toBe(true);
    grey.setRootMotionXZLocked(false);
    expect(grey.isRootMotionXZLocked()).toBe(false);
    grey.setForwardOffset(Math.PI);
    expect(grey.modelPivot.rotation.y).toBeCloseTo(Math.PI, 4);
    expect(grey.exportAnimJsonConfig()).toContain('"modelForwardOffset"');
    grey.dispose();
  });

  it('BoneSocketBinder locates Mixamo bones, binds weapons, tracks slash ribbon & disposes cleanly', () => {
    expect(normalizeMixamoBoneName('Armature|mixamorig:RightHand')).toBe('RightHand');

    const root = new THREE.Group();
    const hips = new THREE.Bone();
    hips.name = 'mixamorigHips';
    const spine = new THREE.Bone();
    spine.name = 'mixamorigSpine2';
    spine.position.set(0, 0.5, 0);
    const head = new THREE.Bone();
    head.name = 'mixamorigHead';
    head.position.set(0, 0.4, 0);
    const rHand = new THREE.Bone();
    rHand.name = 'mixamorigRightHand';
    rHand.position.set(0.4, 0.2, 0.1);
    const lHand = new THREE.Bone();
    lHand.name = 'Armature|mixamorig:LeftHand';
    lHand.position.set(-0.4, 0.2, 0.1);
    const rFoot = new THREE.Bone();
    rFoot.name = 'mixamorig_RightFoot';
    rFoot.position.set(0.15, -0.8, 0);

    root.add(hips);
    hips.add(spine);
    hips.add(rFoot);
    spine.add(head);
    spine.add(rHand);
    spine.add(lHand);

    const binder = new BoneSocketBinder(root);
    expect(binder.getSocket('RightHand')).toBe(rHand);
    expect(binder.getSocket('LeftHand')).toBe(lHand);
    expect(binder.getSocket('Head')).toBe(head);
    expect(binder.getSocket('Spine2')).toBe(spine);
    expect(binder.getSocket('RightFoot')).toBe(rFoot);
    expect(binder.getSocket('Hips')).toBe(hips);
    expect(binder.getSocket('Mouth')).not.toBeNull();

    const sword = new THREE.Group();
    expect(binder.attachToSocket('RightHand', sword)).toBe(true);
    expect(sword.parent).toBe(rHand);
    expect(binder.detachFromSocket('RightHand')).toBe(sword);

    const inner = new THREE.Vector3();
    const outer = new THREE.Vector3();
    expect(binder.getTrailSegmentWorld('RightHand', 1.2, inner, outer)).toBe(true);
    expect(inner.distanceTo(outer)).toBeGreaterThan(1.0);

    binder.setGuidesVisible(true);
    expect(binder.areGuidesVisible()).toBe(true);
    binder.dispose();
  });

  it('normalizes model height to targetHeight and grounds Box3.min.y at y = 0', () => {
    const model = new THREE.Group();
    const geo = new THREE.BoxGeometry(1, 3.4, 1);
    const mat = new THREE.MeshBasicMaterial();
    const mesh = new THREE.Mesh(geo, mat);
    mesh.position.y = 2.2; // ranges y = 0.5 .. 3.9
    model.add(mesh);

    const res = normalizeCharacterHeightAndGround(model, 1.7);
    expect(res.appliedScale).toBeCloseTo(0.5, 4);

    model.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(model);
    expect(box.min.y).toBeCloseTo(0, 4);
    expect(box.max.y - box.min.y).toBeCloseTo(1.7, 4);

    geo.dispose();
    mat.dispose();
  });

  it('validates synthetic GLB compression, triangle budgets, texture sizes, clips & sockets', () => {
    const validGlb = buildSyntheticGlb({});
    const okReport = auditGlbBuffer(validGlb, 'public/assets/3d/characters/luffy_base.glb');
    expect(okReport.ok).toBe(true);
    expect(okReport.errors).toEqual([]);
    expect(okReport.hasDracoExt).toBe(true);
    expect(okReport.maxObservedTexDim).toBe(512);

    // 1. Over standard 30k polygon limit
    const highPoly = buildSyntheticGlb({ triangles: 32500 });
    const polyReport = auditGlbBuffer(highPoly, 'luffy_base.glb');
    expect(polyReport.ok).toBe(false);
    expect(polyReport.errors.some((e: string) => e.includes('Triangle count'))).toBe(true);

    // Allowed under 50k for Giant Boss name
    const bossReport = auditGlbBuffer(highPoly, 'kaido_dragon.glb');
    expect(bossReport.ok).toBe(true);
    expect(bossReport.maxTriangles).toBe(50000);

    // 2. Uncompressed (no Draco)
    const noDraco = buildSyntheticGlb({ includeDraco: false });
    const dracoReport = auditGlbBuffer(noDraco, 'zoro.glb', { requireDraco: true });
    expect(dracoReport.ok).toBe(false);
    expect(dracoReport.errors.some((e: string) => e.includes('KHR_draco_mesh_compression'))).toBe(
      true
    );

    // 3. Oversized texture (> 1024px)
    const bigTex = buildSyntheticGlb({ texWidth: 2048, texHeight: 1024 });
    const texReport = auditGlbBuffer(bigTex, 'nami.glb');
    expect(texReport.ok).toBe(false);
    expect(texReport.errors.some((e: string) => e.includes('exceeds max 1024px'))).toBe(true);

    // 4. Missing required clip & Mixamo socket
    const missingMeta = buildSyntheticGlb({
      clips: ['IDLE'],
      nodeNames: ['mixamorigHips']
    });
    const metaReport = auditGlbBuffer(missingMeta, 'sanji.glb');
    expect(metaReport.ok).toBe(false);
    expect(metaReport.missingClips).toEqual(['RUN', 'COMBO_1']);
    expect(metaReport.missingSockets).toEqual(['righthand', 'lefthand']);

    // 5. Workspace offline Draco check passes on public/draco/
    const workspaceCheck = runValidate3dAssets({ rootDir: process.cwd() });
    expect(workspaceCheck.ok).toBe(true);
    expect(workspaceCheck.dracoFiles.map((d) => d.fileName)).toContain('draco_decoder.wasm');
  });

  it('parses pack:3d CLI flags cleanly and reports friendly manual fallback when Blender is absent', () => {
    const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'opgv-pack3d-'));
    try {
      const parsed = parsePack3dArgs(
        ['--unit=luffy_base', '--rotate-y-180', '--max-tex-size=1024'],
        tmpRoot
      );
      expect(parsed.unit).toBe('luffy_base');
      expect(parsed.rotateY180).toBe(true);
      expect(parsed.maxTexSize).toBe(1024);

      const res = runPack3dCharacter(['--unit=luffy_base'], {
        rootDir: tmpRoot,
        findBlender: () => null
      });
      expect(res.ok).toBe(false);
      expect(res.reason).toBe('BLENDER_NOT_FOUND');
      const hint = formatMissingBlenderMessage(parsed, ['--background', '--python', 'merge.py']);
      expect(hint).toContain('blender.org/download');
    } finally {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    }
  });

  it('supports live F9 3D Character Inspector clip playback, forward flip, root-lock, guides, and .anim.json export', () => {
    const mockRenderer: ThreeRendererLike = {
      domElement: {} as HTMLCanvasElement,
      shadowMap: { enabled: true, type: THREE.PCFSoftShadowMap },
      toneMapping: THREE.NoToneMapping,
      toneMappingExposure: 1,
      outputColorSpace: THREE.SRGBColorSpace,
      info: {
        render: { calls: 4, triangles: 1200 },
        memory: { geometries: 4, textures: 2 },
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
    const viewport = computeResponsiveViewport(915, 412, 3);
    host.init(null, viewport);

    const world = createBattleWorld(
      {
        seed: 4242,
        mode: '1V1',
        arenaSizeKey: 'medium',
        teamAlpha: [createStandardPresetBuild('luffy', 'a1', true, 3, defaultDataRegistry)],
        teamOmega: [createStandardPresetBuild('kaido', 'o1', false, 3, defaultDataRegistry)]
      },
      defaultDataRegistry
    );

    const scene3d = new ThreeMusouBattleScene(host);
    scene3d.render(world, 1, 1 / 60, viewport);

    expect(scene3d.selectInspectorClip('Combo1')).toBe(true);
    scene3d.setInspectorPaused(true);
    scene3d.setInspectorForwardFlipped(true);
    scene3d.setInspectorRootMotionLock(false);
    scene3d.setInspectorSocketGuides(true);
    scene3d.setInspectorScaleMultiplier(1.25);

    const snap = scene3d.getInspectorSnapshot();
    expect(snap.active).toBe(true);
    expect(snap.activeClip).toBe('Combo1');
    expect(snap.paused).toBe(true);
    expect(snap.forwardFlipped).toBe(true);
    expect(snap.lockRootMotionXZ).toBe(false);
    expect(snap.socketGuidesVisible).toBe(true);
    expect(snap.scaleMultiplier).toBeCloseTo(1.25, 3);
    expect(snap.boundSockets).toContain('RightHand');

    const exported = JSON.parse(scene3d.exportInspectorAnimJson()) as Record<string, unknown>;
    expect(exported['lockRootMotionXZ']).toBe(false);
    expect(Number(exported['modelForwardOffset'])).toBeCloseTo(Math.PI, 3);

    scene3d.dispose();
    host.dispose();
  });
});
