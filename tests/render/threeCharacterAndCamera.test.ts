import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { createBattleWorld } from '../../src/core/combat/battleWorld';
import { createStandardPresetBuild } from '../../src/core/net/terminalArenaRule';
import { defaultDataRegistry } from '../../src/data/dataRegistry';
import {
  Character3DLoader,
  createGreyboxRigCharacter,
  normalizeMixamoBoneName,
  parseExternalAnimJson,
  retargetClipTrackName
} from '../../src/render/three/assets/Character3DLoader';
import { Battle3DStateAdapter } from '../../src/render/three/Battle3DStateAdapter';
import { MusouCameraController } from '../../src/render/three/MusouCameraController';
import { MusouVfx3D } from '../../src/render/three/MusouVfx3D';

describe('Step 2: Character3DLoader, Battle3DStateAdapter, MusouCameraController, MusouVfx3D', () => {
  it('retargets Mixamo bone names and parses external .anim.json clips cleanly', () => {
    expect(normalizeMixamoBoneName('mixamorig:RightHand')).toBe('RightHand');
    expect(normalizeMixamoBoneName('mixamorig_Hips')).toBe('Hips');
    expect(retargetClipTrackName('Armature|mixamorig:LeftArm.quaternion')).toBe(
      'LeftArm.quaternion'
    );

    const parsed = parseExternalAnimJson({
      clips: {
        Run: {
          duration: 0.8,
          tracks: [
            {
              name: 'mixamorig:Hips.position',
              type: 'vector',
              times: [0, 0.4, 0.8],
              values: [0, 0, 0, 0, 0.1, 0, 0, 0, 0]
            }
          ]
        },
        Combo1: {
          duration: 0.4,
          tracks: [
            {
              name: 'mixamorig:RightArm.quaternion',
              type: 'quaternion',
              times: [0, 0.4],
              values: [0, 0, 0, 1, 0.2, 0, 0, 0.98]
            }
          ]
        }
      }
    });

    expect(parsed.has('Run')).toBe(true);
    expect(parsed.has('Combo1')).toBe(true);
    expect(parsed.get('Run')?.tracks[0]?.name).toBe('Hips.position');
  });

  it('falls back cleanly to articulated neutral GreyboxRig when .glb is missing & disposes cleanly', async () => {
    const loader = new Character3DLoader();
    const luffy = await loader.loadCharacter({ characterId: 'luffy', scale: 1.1 });
    expect(luffy.source).toBe('GREYBOX_RIG');
    expect(luffy.root.scale.x).toBeCloseTo(1.1, 4);

    luffy.setState('Combo1');
    luffy.update(0.05);
    expect(luffy.currentState).toBe('Combo1');

    const handPos = luffy.getBoneWorldPosition('RightHand', new THREE.Vector3());
    expect(Number.isFinite(handPos.x)).toBe(true);
    expect(Number.isFinite(handPos.y)).toBe(true);

    const directRig = createGreyboxRigCharacter({ characterId: 'kaido_test', scale: 2.2 });
    expect(directRig.toonMaterials.length).toBeGreaterThan(0);
    expect(directRig.outlineMaterials.length).toBeGreaterThan(0);

    luffy.dispose();
    directRig.dispose();
    loader.dispose();
  });

  it('bridges 2D BattleWorldState read-only to 3D XZ + virtual Y + Boss lock-on', () => {
    const world = createBattleWorld(
      {
        seed: 2026,
        mode: '1V1',
        arenaSizeKey: 'medium',
        teamAlpha: [
          createStandardPresetBuild('luffy', 'a1', true, 3, defaultDataRegistry)
        ],
        teamOmega: [
          createStandardPresetBuild('kaido', 'o1', false, 3, defaultDataRegistry)
        ]
      },
      defaultDataRegistry
    );
    const snapshotJsonBefore = JSON.stringify(world);

    const adapter = new Battle3DStateAdapter();
    const frame1 = adapter.buildSnapshot(world, 1, 1 / 60);
    expect(frame1.playerActor).not.toBeNull();
    expect(frame1.actors.length).toBeGreaterThanOrEqual(2);
    expect(frame1.lockedBossActor).toBeNull();

    // Trigger air launch exclusively in 3D adapter (core BattleWorldState stays untouched!)
    if (frame1.playerActor) {
      adapter.triggerAirLaunch(frame1.playerActor.unitId, 9.0);
    }
    const frame2 = adapter.buildSnapshot(world, 1, 1 / 60);
    expect(frame2.playerActor?.altitudeY).toBeGreaterThan(0.1);
    expect(frame2.playerActor?.animState).toBe('AirLaunch');

    // Core world remained 100% immutable
    expect(JSON.stringify(world)).toBe(snapshotJsonBefore);

    // Boss lock-on Tab toggle
    const lockedId = adapter.toggleBossLockOn(world);
    expect(lockedId).not.toBeNull();
    const frame3 = adapter.buildSnapshot(world, 1, 1 / 60);
    expect(frame3.lockedBossActor?.unitId).toBe(lockedId);
  });

  it('updates MusouCameraController (Boss lock-on zoom-out + Dash FOV + shake) and MusouVfx3D', () => {
    const camera = new THREE.PerspectiveCamera(48, 19.5 / 9, 0.3, 240);
    const camCtrl = new MusouCameraController();
    camCtrl.reset(new THREE.Vector3(0, 0, 0));

    camCtrl.update(camera, {
      dt: 0.05,
      playerPos: new THREE.Vector3(0, 0, 0),
      playerAimDir: new THREE.Vector3(1, 0, 0),
      playerAltitudeY: 0,
      isDashing: false,
      isSpecialActive: false,
      lockedBossPos: null
    });
    const baseDist = camCtrl.currentPos.distanceTo(camCtrl.currentLookAt);

    // Enable Giant Boss lock-on -> zoom out farther & center toward boss
    for (let i = 0; i < 20; i += 1) {
      camCtrl.update(camera, {
        dt: 0.05,
        playerPos: new THREE.Vector3(-4, 0, 0),
        playerAimDir: new THREE.Vector3(1, 0, 0),
        playerAltitudeY: 0,
        isDashing: true,
        isSpecialActive: false,
        lockedBossPos: new THREE.Vector3(10, 0, -2),
        lockedBossScale: 2.6
      });
    }
    const lockedDist = camCtrl.currentPos.distanceTo(camCtrl.currentLookAt);
    expect(lockedDist).toBeGreaterThan(baseDist + 2);
    expect(camera.fov).toBeGreaterThan(50);

    // Musou VFX pooling & hitstop
    const scene = new THREE.Scene();
    const vfx = new MusouVfx3D(scene);
    vfx.triggerHitstop(3);
    expect(vfx.consumeHitstopTick()).toBe(true);
    expect(vfx.hitstopRemaining).toBe(2);

    vfx.updateDashEffects(
      0.016,
      true,
      new THREE.Vector3(0, 0, 0),
      new THREE.Vector3(1, 0, 0)
    );
    expect(vfx.activeGhostCount).toBe(1);

    vfx.spawnShockwave(new THREE.Vector3(2, 0, 1));
    expect(vfx.activeShockwaveCount).toBe(1);

    vfx.updateSlashRibbon(
      true,
      new THREE.Vector3(1.5, 1.3, 0.4),
      new THREE.Vector3(0, 1.0, 0)
    );
    vfx.update(0.05);
    vfx.dispose();
  });
});
