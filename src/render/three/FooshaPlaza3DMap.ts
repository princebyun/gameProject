import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { ThreeToonTuningConfig } from './threeTypes';
import {
  applyToonMaterialTuning,
  createAnimeToonMaterial,
  createToonOutlineMaterial
} from './shaders/AnimeToonMaterial';

const SKY_VERTEX_SHADER = /* glsl */ `
varying vec3 vWorldPos;
void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  vWorldPos = wp.xyz;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const SKY_FRAGMENT_SHADER = /* glsl */ `
uniform vec3 uZenithColor;
uniform vec3 uHorizonColor;
uniform float uTime;
varying vec3 vWorldPos;

void main() {
  vec3 dir = normalize(vWorldPos);
  float h = clamp(dir.y * 0.9 + 0.15, 0.0, 1.0);
  float band = smoothstep(0.0, 0.65, h);
  vec3 sky = mix(uHorizonColor, uZenithColor, band);

  // Stylized anime horizontal cloud bands near the horizon
  float cloudWave = sin(dir.x * 7.5 + uTime * 0.15) * cos(dir.z * 6.0 - uTime * 0.1);
  float cloudMask = step(0.32, cloudWave) * smoothstep(0.05, 0.25, h) * (1.0 - smoothstep(0.28, 0.48, h));
  sky = mix(sky, vec3(1.0, 0.99, 0.96), cloudMask * 0.55);
  gl_FragColor = vec4(sky, 1.0);
}
`;

const OCEAN_VERTEX_SHADER = /* glsl */ `
uniform float uTime;
varying vec2 vWorldXZ;
varying float vWaveHeight;

void main() {
  vec4 wp = modelMatrix * vec4(position, 1.0);
  float wave = sin(wp.x * 0.45 + uTime * 1.9) * 0.14 + cos(wp.z * 0.55 - uTime * 1.4) * 0.12;
  wp.y += wave;
  vWorldXZ = wp.xz;
  vWaveHeight = wave;
  gl_Position = projectionMatrix * viewMatrix * wp;
}
`;

const OCEAN_FRAGMENT_SHADER = /* glsl */ `
uniform vec3 uDeepColor;
uniform vec3 uCrestColor;
uniform float uTime;
varying vec2 vWorldXZ;
varying float vWaveHeight;

void main() {
  float foamMask = step(0.11, vWaveHeight + sin(vWorldXZ.x * 1.1 + uTime * 2.4) * 0.06);
  float shoreBand = smoothstep(18.5, 22.0, abs(vWorldXZ.x)) * smoothstep(10.0, 13.0, abs(vWorldXZ.y));
  vec3 col = mix(uDeepColor, uCrestColor, clamp(foamMask * 0.72 + shoreBand * 0.2, 0.0, 1.0));
  gl_FragColor = vec4(col, 1.0);
}
`;

/**
 * Foosha Harbor Plaza 3D map with custom anime sky dome, stylized 3D ocean, stone harbor stage,
 * capture ring, and external ./assets/3d/maps/{mapId}.glb hot-swap support.
 */
export class FooshaPlaza3DMap {
  public readonly root = new THREE.Group();
  private readonly proceduralGroup = new THREE.Group();
  private externalMapGroup: THREE.Group | null = null;

  private readonly geometries: THREE.BufferGeometry[] = [];
  private readonly materials: THREE.Material[] = [];
  private readonly toonMaterials: THREE.ShaderMaterial[] = [];
  private readonly outlineMaterials: THREE.ShaderMaterial[] = [];

  private readonly skyMaterial: THREE.ShaderMaterial;
  private readonly oceanMaterial: THREE.ShaderMaterial;
  private readonly captureRingMesh: THREE.Mesh;
  private disposed = false;

  constructor(private readonly scene: THREE.Scene) {
    this.root.name = 'foosha_plaza_3d_map';
    this.root.add(this.proceduralGroup);
    this.scene.add(this.root);

    // 1. Anime Sky Dome
    const skyGeo = new THREE.SphereGeometry(95, 24, 14);
    this.skyMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uZenithColor: { value: new THREE.Color('#0284c7') },
        uHorizonColor: { value: new THREE.Color('#bae6fd') },
        uTime: { value: 0 }
      },
      vertexShader: SKY_VERTEX_SHADER,
      fragmentShader: SKY_FRAGMENT_SHADER,
      side: THREE.BackSide,
      depthWrite: false
    });
    const skyMesh = new THREE.Mesh(skyGeo, this.skyMaterial);
    this.geometries.push(skyGeo);
    this.materials.push(this.skyMaterial);
    this.root.add(skyMesh);

    // 2. Stylized 3D Ocean Sea surrounding dock
    const oceanGeo = new THREE.PlaneGeometry(180, 180, 28, 28);
    oceanGeo.rotateX(-Math.PI * 0.5);
    this.oceanMaterial = new THREE.ShaderMaterial({
      uniforms: {
        uDeepColor: { value: new THREE.Color('#0369a1') },
        uCrestColor: { value: new THREE.Color('#e0f2fe') },
        uTime: { value: 0 }
      },
      vertexShader: OCEAN_VERTEX_SHADER,
      fragmentShader: OCEAN_FRAGMENT_SHADER
    });
    const oceanMesh = new THREE.Mesh(oceanGeo, this.oceanMaterial);
    oceanMesh.position.y = -0.88;
    this.geometries.push(oceanGeo);
    this.materials.push(this.oceanMaterial);
    this.proceduralGroup.add(oceanMesh);

    // 3. Stone Harbor Plaza Deck (centered 39.2m x 22.4m corresponding to 960x540 core arena)
    const plazaGeo = new THREE.BoxGeometry(39.4, 1.0, 22.6);
    const plazaMat = createAnimeToonMaterial({
      baseColor: '#cbd5e1',
      shadowTint: '#64748b',
      rimColor: '#f1f5f9',
      rimIntensity: 0.22,
      specularStrength: 0.08
    });
    const plazaMesh = new THREE.Mesh(plazaGeo, plazaMat);
    plazaMesh.position.set(0, -0.5, 0);
    plazaMesh.receiveShadow = true;
    this.geometries.push(plazaGeo);
    this.materials.push(plazaMat);
    this.toonMaterials.push(plazaMat);
    this.proceduralGroup.add(plazaMesh);

    // Cobblestone lane strips & dock wood pier extension
    const laneGeo = new THREE.PlaneGeometry(36.0, 4.2);
    laneGeo.rotateX(-Math.PI * 0.5);
    const laneMat = createAnimeToonMaterial({
      baseColor: '#94a3b8',
      shadowTint: '#475569',
      rimIntensity: 0.12
    });
    const laneMesh = new THREE.Mesh(laneGeo, laneMat);
    laneMesh.position.set(0, 0.02, 0);
    laneMesh.receiveShadow = true;
    this.geometries.push(laneGeo);
    this.materials.push(laneMat);
    this.toonMaterials.push(laneMat);
    this.proceduralGroup.add(laneMesh);

    const pierGeo = new THREE.BoxGeometry(10.5, 0.45, 5.2);
    const pierMat = createAnimeToonMaterial({
      baseColor: '#b45309',
      shadowTint: '#78350f',
      rimColor: '#fde68a'
    });
    const pierOutlineMat = createToonOutlineMaterial({ outlineWidth: 0.024 });
    const pierMesh = new THREE.Mesh(pierGeo, pierMat);
    pierMesh.position.set(0, -0.22, 13.6);
    const pierOutline = new THREE.Mesh(pierGeo, pierOutlineMat);
    pierOutline.position.copy(pierMesh.position);
    this.geometries.push(pierGeo);
    this.materials.push(pierMat, pierOutlineMat);
    this.toonMaterials.push(pierMat);
    this.outlineMaterials.push(pierOutlineMat);
    this.proceduralGroup.add(pierMesh, pierOutline);

    // Central Base Capture Zone Ring
    const ringGeo = new THREE.RingGeometry(3.8, 4.35, 36);
    ringGeo.rotateX(-Math.PI * 0.5);
    const ringMat = new THREE.MeshBasicMaterial({
      color: '#38bdf8',
      transparent: true,
      opacity: 0.72,
      side: THREE.DoubleSide
    });
    this.captureRingMesh = new THREE.Mesh(ringGeo, ringMat);
    this.captureRingMesh.position.set(0, 0.04, 0);
    this.geometries.push(ringGeo);
    this.materials.push(ringMat);
    this.root.add(this.captureRingMesh);
  }

  public update(elapsedSec: number): void {
    if (this.skyMaterial.uniforms['uTime']) {
      this.skyMaterial.uniforms['uTime'].value = elapsedSec;
    }
    if (this.oceanMaterial.uniforms['uTime']) {
      this.oceanMaterial.uniforms['uTime'].value = elapsedSec;
    }
    const pulse = 1 + Math.sin(elapsedSec * 3.2) * 0.04;
    this.captureRingMesh.scale.setScalar(pulse);
  }

  public setTimeOfDayPalette(preset: string): void {
    const upper = preset.toUpperCase();
    const zenith = this.skyMaterial.uniforms['uZenithColor']?.value as THREE.Color | undefined;
    const horizon = this.skyMaterial.uniforms['uHorizonColor']?.value as THREE.Color | undefined;
    const deep = this.oceanMaterial.uniforms['uDeepColor']?.value as THREE.Color | undefined;
    const crest = this.oceanMaterial.uniforms['uCrestColor']?.value as THREE.Color | undefined;

    if (upper === 'SUNSET' || upper === 'DUSK') {
      zenith?.set('#4c1d95');
      horizon?.set('#fb923c');
      deep?.set('#1e3a8a');
      crest?.set('#fdba74');
    } else if (upper === 'NIGHT') {
      zenith?.set('#090d16');
      horizon?.set('#1e3a5f');
      deep?.set('#0f172a');
      crest?.set('#60a5fa');
    } else if (upper === 'STORM') {
      zenith?.set('#1e293b');
      horizon?.set('#64748b');
      deep?.set('#1e293b');
      crest?.set('#cbd5e1');
    } else {
      zenith?.set('#0284c7');
      horizon?.set('#bae6fd');
      deep?.set('#0369a1');
      crest?.set('#e0f2fe');
    }
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
  }

  public async tryLoadExternalMapGlb(mapId = 'foosha_plaza_3d'): Promise<boolean> {
    if (typeof fetch === 'undefined' || this.disposed) return false;
    const url = `./assets/3d/maps/${mapId}.glb`;
    try {
      const head = await fetch(url, { method: 'HEAD' });
      if (!head.ok || this.disposed) return false;

      const draco = new DRACOLoader();
      draco.setDecoderPath('./draco/');
      const gltfLoader = new GLTFLoader();
      gltfLoader.setDRACOLoader(draco);
      const gltf = await gltfLoader.loadAsync(url);
      draco.dispose();

      if (this.disposed) {
        gltf.scene.traverse((obj) => {
          if (obj instanceof THREE.Mesh) obj.geometry.dispose();
        });
        return false;
      }

      this.externalMapGroup = gltf.scene;
      this.proceduralGroup.visible = false;
      this.root.add(gltf.scene);
      return true;
    } catch {
      return false;
    }
  }

  public dispose(): void {
    this.disposed = true;
    if (this.externalMapGroup) {
      this.externalMapGroup.traverse((obj) => {
        if (obj instanceof THREE.Mesh) {
          obj.geometry.dispose();
          if (Array.isArray(obj.material)) {
            obj.material.forEach((m) => m.dispose());
          } else {
            obj.material?.dispose();
          }
        }
      });
      this.externalMapGroup = null;
    }
    for (const geo of this.geometries) geo.dispose();
    for (const mat of this.materials) mat.dispose();
    this.root.clear();
    this.root.parent?.remove(this.root);
  }
}
