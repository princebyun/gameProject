import * as THREE from 'three';

export interface CutsceneCameraPose {
  position: THREE.Vector3;
  lookAt: THREE.Vector3;
  fov: number;
  rollRad?: number;
}

export interface MusouCameraFrameInput {
  dt: number;
  playerPos: THREE.Vector3;
  playerAimDir: THREE.Vector3;
  playerAltitudeY: number;
  isDashing: boolean;
  isSpecialActive: boolean;
  lockedBossPos: THREE.Vector3 | null;
  lockedBossScale?: number;
  flashEffect?: boolean;
  burstOrbitProgress?: number;
  powerDashFovKick?: boolean;
}

const CUTSCENE_EXIT_BLEND_DURATION_SEC = 0.25;

export class MusouCameraController {
  public readonly currentLookAt = new THREE.Vector3(0, 1.4, 0);
  public readonly currentPos = new THREE.Vector3(0, 6.2, 11.4);

  private currentFov = 48;
  private specialOrbitAngle = 0;
  private shakeTimer = 0;
  private shakeMagnitude = 0;
  private readonly shakeDir = new THREE.Vector3(1, 0.35, 0);
  private shakePhase = 0;

  private readonly desiredTarget = new THREE.Vector3();
  private readonly desiredPos = new THREE.Vector3();

  private hasCutscenePose = false;
  private readonly cutscenePos = new THREE.Vector3();
  private readonly cutsceneLookAt = new THREE.Vector3();
  private cutsceneFov = 46;
  private cutsceneRollRad = 0;

  private cutsceneExitBlendTimer = 0;
  private readonly blendStartPos = new THREE.Vector3();
  private readonly blendStartLookAt = new THREE.Vector3();
  private blendStartFov = 48;
  private blendStartRollRad = 0;

  public setCutscenePose(pose: Readonly<CutsceneCameraPose> | null): void {
    if (pose) {
      this.hasCutscenePose = true;
      this.cutsceneExitBlendTimer = 0;
      this.cutscenePos.copy(pose.position);
      this.cutsceneLookAt.copy(pose.lookAt);
      this.cutsceneFov = pose.fov;
      this.cutsceneRollRad = pose.rollRad ?? 0;
      return;
    }

    if (this.hasCutscenePose) {
      this.hasCutscenePose = false;
      this.blendStartPos.copy(this.currentPos);
      this.blendStartLookAt.copy(this.currentLookAt);
      this.blendStartFov = this.currentFov;
      this.blendStartRollRad = this.cutsceneRollRad;
      this.cutsceneExitBlendTimer = CUTSCENE_EXIT_BLEND_DURATION_SEC;
    }
  }

  public isInCutscene(): boolean {
    return this.hasCutscenePose;
  }

  public isCutsceneBlending(): boolean {
    return this.cutsceneExitBlendTimer > 0;
  }

  public reset(playerPos?: THREE.Vector3): void {
    const px = playerPos?.x ?? 0;
    const pz = playerPos?.z ?? 0;
    this.currentLookAt.set(px, 1.4, pz);
    this.currentPos.set(px, 6.4, pz + 11.4);
    this.currentFov = 48;
    this.specialOrbitAngle = 0;
    this.shakeTimer = 0;
    this.shakeMagnitude = 0;
    this.hasCutscenePose = false;
    this.cutsceneRollRad = 0;
    this.cutsceneExitBlendTimer = 0;
  }

  public triggerShake(
    dirX: number,
    dirZ: number,
    magnitude: number,
    durationSec = 0.22
  ): void {
    const len = Math.hypot(dirX, dirZ) || 1;
    this.shakeDir.set(dirX / len, 0.45, dirZ / len);
    this.shakeMagnitude = Math.max(this.shakeMagnitude, magnitude);
    this.shakeTimer = Math.max(this.shakeTimer, durationSec);
  }

  public update(camera: THREE.PerspectiveCamera, input: MusouCameraFrameInput): void {
    const dt = Math.max(0.001, Math.min(0.05, input.dt));

    if (this.hasCutscenePose) {
      this.currentPos.copy(this.cutscenePos);
      this.currentLookAt.copy(this.cutsceneLookAt);
      this.currentFov = this.cutsceneFov;
      if (Math.abs(camera.fov - this.currentFov) > 0.05) {
        camera.fov = this.currentFov;
        camera.updateProjectionMatrix();
      }
      camera.position.copy(this.currentPos);
      camera.lookAt(this.currentLookAt);
      if (Math.abs(this.cutsceneRollRad) > 0.0001) {
        camera.rotateZ(this.cutsceneRollRad);
      }
      return;
    }

    const lerpFollow = 1 - Math.exp(-9.5 * dt);
    const lerpFov = 1 - Math.exp(-8.0 * dt);

    let targetX = input.playerPos.x + input.playerAimDir.x * 1.45;
    let targetZ = input.playerPos.z + input.playerAimDir.z * 0.9;
    let targetY = 1.35 + input.playerAltitudeY * 0.78;

    let offsetY = 6.2 + input.playerAltitudeY * 0.55;
    let offsetZ = 11.2;
    let offsetX = 0;
    let targetFov = 48;

    // Sky-type / Aerial pitch & distance compensation so aerial player + horde/boss stay framed
    if (input.playerAltitudeY > 1.2) {
      const skyLift = input.playerAltitudeY - 1.2;
      targetY += skyLift * 0.25;
      offsetY += skyLift * 0.48;
      offsetZ += skyLift * 1.15;
    }

    if (input.isDashing || input.powerDashFovKick) {
      targetFov = input.flashEffect === false ? 51 : 54;
      offsetZ = Math.max(9.8, offsetZ - 0.8);
    }

    const burstProg = input.burstOrbitProgress ?? 0;
    if (burstProg > 0 && burstProg < 1) {
      const orbitTheta = burstProg * Math.PI;
      const radius = 6.4;
      offsetX = Math.sin(orbitTheta) * radius;
      offsetZ = Math.cos(orbitTheta) * radius;
      offsetY = 3.8 + input.playerAltitudeY * 0.65;
      targetFov = input.flashEffect === false ? 52 : 59;
    } else if (input.isSpecialActive) {
      this.specialOrbitAngle += dt * 1.65;
      const radius = 8.4;
      offsetX = Math.sin(this.specialOrbitAngle) * radius * 0.52;
      offsetZ = Math.cos(this.specialOrbitAngle) * radius;
      offsetY = 4.6 + input.playerAltitudeY * 0.7;
      targetFov = 58;
    } else {
      this.specialOrbitAngle *= Math.exp(-5 * dt);
    }

    if (input.lockedBossPos) {
      const dx = input.lockedBossPos.x - input.playerPos.x;
      const dz = input.lockedBossPos.z - input.playerPos.z;
      const separation = Math.hypot(dx, dz);
      const bossWeight = 0.36;
      targetX = input.playerPos.x * (1 - bossWeight) + input.lockedBossPos.x * bossWeight;
      targetZ = input.playerPos.z * (1 - bossWeight) + input.lockedBossPos.z * bossWeight;

      const bossScaleBoost = Math.max(1, (input.lockedBossScale ?? 1) * 0.9);
      const zoomOut = Math.min(9.5, separation * 0.42 + bossScaleBoost * 1.8);
      offsetY += zoomOut * 0.48;
      offsetZ += zoomOut * 0.75;
      targetY += Math.min(1.8, (input.lockedBossScale ?? 1) * 0.38);
      targetFov = Math.max(targetFov, 52);
    }

    this.desiredTarget.set(targetX, targetY, targetZ);
    this.desiredPos.set(targetX + offsetX, targetY + offsetY - 1.35, targetZ + offsetZ);

    if (this.cutsceneExitBlendTimer > 0) {
      this.cutsceneExitBlendTimer = Math.max(0, this.cutsceneExitBlendTimer - dt);
      const rawT = 1 - this.cutsceneExitBlendTimer / CUTSCENE_EXIT_BLEND_DURATION_SEC;
      const smoothT = rawT * rawT * (3 - 2 * rawT);
      this.currentLookAt.lerpVectors(this.blendStartLookAt, this.desiredTarget, smoothT);
      this.currentPos.lerpVectors(this.blendStartPos, this.desiredPos, smoothT);
      this.currentFov = this.blendStartFov + (targetFov - this.blendStartFov) * smoothT;
      const roll = this.blendStartRollRad * (1 - smoothT);

      if (Math.abs(camera.fov - this.currentFov) > 0.05) {
        camera.fov = this.currentFov;
        camera.updateProjectionMatrix();
      }
      camera.position.copy(this.currentPos);
      camera.lookAt(this.currentLookAt);
      if (Math.abs(roll) > 0.0001) {
        camera.rotateZ(roll);
      }
      return;
    }

    this.currentLookAt.lerp(this.desiredTarget, lerpFollow);
    this.currentPos.lerp(this.desiredPos, lerpFollow);

    if (this.shakeTimer > 0) {
      this.shakeTimer = Math.max(0, this.shakeTimer - dt);
      this.shakePhase += dt * 48;
      const shakeFactor =
        input.flashEffect === false ? 0.35 : 1.0;
      const decay = this.shakeMagnitude * Math.min(1, this.shakeTimer * 4.5) * shakeFactor;
      const wave = Math.sin(this.shakePhase);
      this.currentPos.addScaledVector(this.shakeDir, wave * decay);
      this.currentLookAt.x += Math.cos(this.shakePhase * 1.3) * decay * 0.35;
    } else {
      this.shakeMagnitude = 0;
    }

    this.currentFov += (targetFov - this.currentFov) * lerpFov;
    if (Math.abs(camera.fov - this.currentFov) > 0.05) {
      camera.fov = this.currentFov;
      camera.updateProjectionMatrix();
    }

    camera.position.copy(this.currentPos);
    camera.lookAt(this.currentLookAt);
  }
}
