import * as THREE from 'three';
import {
  DEFAULT_THREE_TOON_TUNING,
  HakiAuraMode,
  ThreeToonTuningConfig
} from '../threeTypes';

export interface AnimeToonMaterialOptions {
  baseColor?: THREE.ColorRepresentation;
  shadowTint?: THREE.ColorRepresentation;
  rimColor?: THREE.ColorRepresentation;
  rimIntensity?: number;
  shadowShiftStrength?: number;
  specularStrength?: number;
  celSteps?: 2 | 3 | 4;
  rampTexture?: THREE.DataTexture;
  map?: THREE.Texture | null;
  sunDirection?: THREE.Vector3;
  sunColor?: THREE.ColorRepresentation;
  ambientColor?: THREE.ColorRepresentation;
  auraMode?: HakiAuraMode;
  auraIntensity?: number;
  vertexColors?: boolean;
}

export interface ToonOutlineMaterialOptions {
  outlineColor?: THREE.ColorRepresentation;
  outlineWidth?: number;
}

let sharedWhiteFallbackTexture: THREE.DataTexture | null = null;
const sharedRampCache = new Map<2 | 3 | 4, THREE.DataTexture>();

export function getSharedWhiteFallbackTexture(): THREE.DataTexture {
  if (!sharedWhiteFallbackTexture) {
    const data = new Uint8Array([255, 255, 255, 255]);
    const tex = new THREE.DataTexture(data, 1, 1, THREE.RGBAFormat, THREE.UnsignedByteType);
    tex.minFilter = THREE.NearestFilter;
    tex.magFilter = THREE.NearestFilter;
    tex.generateMipmaps = false;
    tex.needsUpdate = true;
    sharedWhiteFallbackTexture = tex;
  }
  return sharedWhiteFallbackTexture;
}

export function createCelRampTexture(steps: 2 | 3 | 4 = 3): THREE.DataTexture {
  const levels: number[] =
    steps === 2 ? [92, 255] : steps === 4 ? [68, 132, 198, 255] : [78, 168, 255];

  const data = new Uint8Array(levels.length * 4);
  for (let i = 0; i < levels.length; i += 1) {
    const val = levels[i] ?? 255;
    const idx = i * 4;
    data[idx] = val;
    data[idx + 1] = val;
    data[idx + 2] = val;
    data[idx + 3] = 255;
  }

  const tex = new THREE.DataTexture(data, levels.length, 1, THREE.RGBAFormat, THREE.UnsignedByteType);
  tex.minFilter = THREE.NearestFilter;
  tex.magFilter = THREE.NearestFilter;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.generateMipmaps = false;
  tex.needsUpdate = true;
  return tex;
}

export function getSharedCelRampTexture(steps: 2 | 3 | 4 = 3): THREE.DataTexture {
  const existing = sharedRampCache.get(steps);
  if (existing) {
    return existing;
  }
  const created = createCelRampTexture(steps);
  sharedRampCache.set(steps, created);
  return created;
}

export function disposeSharedToonCaches(): void {
  if (sharedWhiteFallbackTexture) {
    sharedWhiteFallbackTexture.dispose();
    sharedWhiteFallbackTexture = null;
  }
  for (const tex of sharedRampCache.values()) {
    tex.dispose();
  }
  sharedRampCache.clear();
}

export function hakiAuraModeToIndex(mode: HakiAuraMode): number {
  switch (mode) {
    case 'BUSO':
      return 1;
    case 'HAO':
      return 2;
    case 'GEAR5':
      return 3;
    default:
      return 0;
  }
}

export function hakiAuraDefaultColor(mode: HakiAuraMode): THREE.Color {
  switch (mode) {
    case 'BUSO':
      return new THREE.Color('#7e22ce');
    case 'HAO':
      return new THREE.Color('#ef4444');
    case 'GEAR5':
      return new THREE.Color('#f8fafc');
    default:
      return new THREE.Color('#000000');
  }
}

const ANIME_TOON_VERTEX_SHADER = /* glsl */ `
#include <common>
#include <color_pars_vertex>
#include <skinning_pars_vertex>

varying vec3 vWorldNormal;
varying vec3 vViewDir;
varying vec2 vToonUv;

void main() {
  vToonUv = uv;
  #include <color_vertex>
  #include <beginnormal_vertex>
  #include <skinbase_vertex>
  #include <skinnormal_vertex>

  vec3 objNormal = objectNormal;
  #ifdef USE_INSTANCING
    objNormal = mat3(instanceMatrix) * objNormal;
  #endif
  vWorldNormal = normalize(mat3(modelMatrix) * objNormal);

  #include <begin_vertex>
  #include <skinning_vertex>

  vec4 worldPos = vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
    worldPos = instanceMatrix * worldPos;
  #endif
  worldPos = modelMatrix * worldPos;

  vViewDir = normalize(cameraPosition - worldPos.xyz);
  gl_Position = projectionMatrix * viewMatrix * worldPos;
}
`;

const ANIME_TOON_FRAGMENT_SHADER = /* glsl */ `
#include <common>
#include <color_pars_fragment>

uniform vec3 uBaseColor;
uniform vec3 uShadowTint;
uniform vec3 uSunDirection;
uniform vec3 uSunColor;
uniform vec3 uAmbientColor;
uniform vec3 uRimColor;
uniform float uRimIntensity;
uniform float uShadowShiftStrength;
uniform float uSpecularStrength;
uniform sampler2D uRampMap;
uniform sampler2D uMap;
uniform float uHasMap;
uniform float uAuraMode;
uniform vec3 uAuraColor;
uniform float uAuraIntensity;
uniform float uTime;

varying vec3 vWorldNormal;
varying vec3 vViewDir;
varying vec2 vToonUv;

void main() {
  vec3 N = normalize(vWorldNormal);
  vec3 L = normalize(uSunDirection);
  vec3 V = normalize(vViewDir);
  vec3 H = normalize(L + V);

  vec4 albedo = vec4(uBaseColor, 1.0);
  if (uHasMap > 0.5) {
    vec4 texel = texture2D(uMap, vToonUv);
    if (texel.a < 0.1) discard;
    albedo *= texel;
  }

  #if defined( USE_COLOR_ALPHA )
    albedo *= vColor;
  #elif defined( USE_COLOR ) || defined( USE_INSTANCING_COLOR )
    albedo.rgb *= vColor;
  #endif

  // Half-Lambert wrapped diffuse quantized via cel ramp texture
  float halfLambert = clamp(dot(N, L) * 0.5 + 0.5, 0.01, 0.99);
  float celFactor = texture2D(uRampMap, vec2(halfLambert, 0.5)).r;

  // Anime Shadow Color Shift: warm/violet hue shift rather than muddy grey
  vec3 shadowTone = albedo.rgb * uShadowTint;
  vec3 litTone = albedo.rgb * (uSunColor * 0.88 + uAmbientColor * 0.35);
  float blendWeight = mix(1.0 - uShadowShiftStrength * 0.72, 1.0, celFactor);
  vec3 baseShaded = mix(shadowTone, litTone, clamp(blendWeight, 0.0, 1.0));

  // Crisp stepped anime specular highlight
  float ndoth = max(dot(N, H), 0.0);
  float specStep = step(0.88, ndoth) * step(0.55, celFactor) * uSpecularStrength;
  vec3 specColor = uSunColor * specStep * 0.45;

  // Fresnel rim light for silhouette readability in frantic battles
  float fresnel = 1.0 - max(dot(N, V), 0.0);
  float rimMask = smoothstep(0.58, 0.86, fresnel);
  float directionalRimBoost = mix(0.45, 1.0, max(dot(N, L), 0.0) * 0.5 + 0.5);
  vec3 rimContribution = uRimColor * rimMask * uRimIntensity * directionalRimBoost;

  // Haki / Gear 5 Aura emissive overlay
  vec3 auraContribution = vec3(0.0);
  if (uAuraMode > 0.5) {
    float pulse = 0.75 + 0.25 * sin(uTime * 11.0 + fresnel * 6.0);
    float auraBand = smoothstep(0.42, 0.88, fresnel);
    if (uAuraMode > 2.5) {
      // Gear 5 white luminous rim
      auraContribution = uAuraColor * auraBand * (1.25 * uAuraIntensity * pulse);
    } else if (uAuraMode > 1.5) {
      // Haoshoku lightning edge crackle
      float arc = step(0.68, fract(sin(vToonUv.y * 24.0 + uTime * 14.0) * 43758.5453));
      auraContribution = uAuraColor * (auraBand + arc * 0.25) * uAuraIntensity * pulse;
    } else {
      // Busoshoku dark purple/amber metallic gleam
      auraContribution = uAuraColor * auraBand * uAuraIntensity * pulse;
    }
  }

  vec3 finalColor = baseShaded + specColor + rimContribution + auraContribution;
  gl_FragColor = vec4(finalColor, albedo.a);
}
`;

const TOON_OUTLINE_VERTEX_SHADER = /* glsl */ `
#include <common>
#include <skinning_pars_vertex>

uniform float uOutlineWidth;

void main() {
  #include <beginnormal_vertex>
  #include <skinbase_vertex>
  #include <skinnormal_vertex>

  vec3 objNormal = normalize(objectNormal);
  #ifdef USE_INSTANCING
    objNormal = normalize(mat3(instanceMatrix) * objNormal);
  #endif

  #include <begin_vertex>
  #include <skinning_vertex>

  vec4 worldPos = vec4(transformed, 1.0);
  #ifdef USE_INSTANCING
    worldPos = instanceMatrix * worldPos;
  #endif
  worldPos = modelMatrix * worldPos;

  vec3 worldNormal = normalize(mat3(modelMatrix) * objNormal);
  float camDistance = length(cameraPosition - worldPos.xyz);
  float distScale = clamp(camDistance * 0.085, 0.65, 2.6);
  worldPos.xyz += worldNormal * (uOutlineWidth * distScale);

  gl_Position = projectionMatrix * viewMatrix * worldPos;
}
`;

const TOON_OUTLINE_FRAGMENT_SHADER = /* glsl */ `
uniform vec3 uOutlineColor;

void main() {
  gl_FragColor = vec4(uOutlineColor, 1.0);
}
`;

export function createAnimeToonMaterial(
  options: AnimeToonMaterialOptions = {}
): THREE.ShaderMaterial {
  const celSteps = options.celSteps ?? DEFAULT_THREE_TOON_TUNING.celSteps;
  const rampTexture = options.rampTexture ?? getSharedCelRampTexture(celSteps);
  const auraMode = options.auraMode ?? 'NONE';

  return new THREE.ShaderMaterial({
    uniforms: {
      uBaseColor: { value: new THREE.Color(options.baseColor ?? '#ffffff') },
      uShadowTint: { value: new THREE.Color(options.shadowTint ?? '#765c92') },
      uSunDirection: {
        value: (options.sunDirection ?? new THREE.Vector3(0.55, 0.85, 0.35)).clone().normalize()
      },
      uSunColor: { value: new THREE.Color(options.sunColor ?? '#fff7e6') },
      uAmbientColor: { value: new THREE.Color(options.ambientColor ?? '#7d92b8') },
      uRimColor: { value: new THREE.Color(options.rimColor ?? '#ffd18a') },
      uRimIntensity: { value: options.rimIntensity ?? DEFAULT_THREE_TOON_TUNING.rimIntensity },
      uShadowShiftStrength: {
        value: options.shadowShiftStrength ?? DEFAULT_THREE_TOON_TUNING.shadowShiftStrength
      },
      uSpecularStrength: { value: options.specularStrength ?? 0.35 },
      uRampMap: { value: rampTexture },
      uMap: { value: options.map ?? getSharedWhiteFallbackTexture() },
      uHasMap: { value: options.map ? 1.0 : 0.0 },
      uAuraMode: { value: hakiAuraModeToIndex(auraMode) },
      uAuraColor: { value: hakiAuraDefaultColor(auraMode) },
      uAuraIntensity: { value: options.auraIntensity ?? (auraMode === 'NONE' ? 0.0 : 1.0) },
      uTime: { value: 0 }
    },
    vertexShader: ANIME_TOON_VERTEX_SHADER,
    fragmentShader: ANIME_TOON_FRAGMENT_SHADER,
    vertexColors: options.vertexColors ?? false,
    lights: false,
    toneMapped: true
  });
}

export function createToonOutlineMaterial(
  options: ToonOutlineMaterialOptions = {}
): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uOutlineColor: { value: new THREE.Color(options.outlineColor ?? '#16101c') },
      uOutlineWidth: { value: options.outlineWidth ?? DEFAULT_THREE_TOON_TUNING.outlineWidth }
    },
    vertexShader: TOON_OUTLINE_VERTEX_SHADER,
    fragmentShader: TOON_OUTLINE_FRAGMENT_SHADER,
    side: THREE.BackSide,
    depthWrite: true,
    transparent: false,
    lights: false,
    toneMapped: true
  });
}

export function isAnimeToonMaterial(mat: THREE.Material): mat is THREE.ShaderMaterial {
  return mat instanceof THREE.ShaderMaterial && 'uRampMap' in mat.uniforms && 'uRimIntensity' in mat.uniforms;
}

export function isToonOutlineMaterial(mat: THREE.Material): mat is THREE.ShaderMaterial {
  return mat instanceof THREE.ShaderMaterial && 'uOutlineWidth' in mat.uniforms && 'uOutlineColor' in mat.uniforms;
}

export function applyToonMaterialTuning(
  mat: THREE.ShaderMaterial,
  tuning: ThreeToonTuningConfig,
  sunDirection?: THREE.Vector3,
  sunColor?: THREE.Color,
  ambientColor?: THREE.Color
): void {
  if (isAnimeToonMaterial(mat)) {
    const rampUniform = mat.uniforms['uRampMap'];
    if (rampUniform) {
      rampUniform.value = getSharedCelRampTexture(tuning.celSteps);
    }
    const shiftUniform = mat.uniforms['uShadowShiftStrength'];
    if (shiftUniform) shiftUniform.value = tuning.shadowShiftStrength;

    const rimUniform = mat.uniforms['uRimIntensity'];
    if (rimUniform) rimUniform.value = tuning.rimIntensity;

    if (sunDirection && mat.uniforms['uSunDirection']?.value instanceof THREE.Vector3) {
      mat.uniforms['uSunDirection'].value.copy(sunDirection).normalize();
    }
    if (sunColor && mat.uniforms['uSunColor']?.value instanceof THREE.Color) {
      mat.uniforms['uSunColor'].value.copy(sunColor);
    }
    if (ambientColor && mat.uniforms['uAmbientColor']?.value instanceof THREE.Color) {
      mat.uniforms['uAmbientColor'].value.copy(ambientColor);
    }
  }
  if (isToonOutlineMaterial(mat)) {
    const widthUniform = mat.uniforms['uOutlineWidth'];
    if (widthUniform) {
      widthUniform.value = tuning.outlineWidth;
    }
  }
}

export function setToonMaterialAura(
  mat: THREE.ShaderMaterial,
  auraMode: HakiAuraMode,
  intensity = 1.0,
  elapsedSec = 0
): void {
  if (!isAnimeToonMaterial(mat)) return;
  if (mat.uniforms['uAuraMode']) mat.uniforms['uAuraMode'].value = hakiAuraModeToIndex(auraMode);
  if (mat.uniforms['uAuraColor']?.value instanceof THREE.Color) {
    mat.uniforms['uAuraColor'].value.copy(hakiAuraDefaultColor(auraMode));
  }
  if (mat.uniforms['uAuraIntensity']) {
    mat.uniforms['uAuraIntensity'].value = auraMode === 'NONE' ? 0 : intensity;
  }
  if (mat.uniforms['uTime']) {
    mat.uniforms['uTime'].value = elapsedSec;
  }
}

export interface SpeedlinesComputeInput {
  speedNormalized: number;
  isSpecialActive: boolean;
  flashEffect: boolean;
  opacityMultiplier: number;
}

/**
 * Pure helper computing overlay opacity while respecting user's photosensitive flash safety setting.
 */
export function computeSpeedlinesIntensity(input: SpeedlinesComputeInput): number {
  const clampedMult = Math.max(0, Math.min(1, input.opacityMultiplier));
  if (clampedMult <= 0.001) {
    return 0;
  }
  const motionBase = input.isSpecialActive
    ? 0.92
    : input.speedNormalized > 0.55
      ? Math.min(0.82, (input.speedNormalized - 0.55) / 0.45 * 0.82)
      : 0;
  const raw = motionBase * clampedMult;
  if (!input.flashEffect) {
    return Math.min(raw, 0.14);
  }
  return raw;
}

/**
 * Lightweight radial anime speedlines overlay synchronized with dash / Special attacks.
 * Uses only crisp polygonal strokes (zero shadowBlur) and no-ops cleanly in headless Node.
 */
export class SpeedlinesOverlay3D {
  private canvas: HTMLCanvasElement | null = null;
  private ctx: CanvasRenderingContext2D | null = null;
  private currentAlpha = 0;
  private phase = 0;

  constructor(private readonly container: HTMLElement | null) {
    if (typeof document !== 'undefined' && this.container) {
      const canvas = document.createElement('canvas');
      canvas.id = 'opgv-three-speedlines';
      canvas.style.position = 'absolute';
      canvas.style.inset = '0';
      canvas.style.width = '100%';
      canvas.style.height = '100%';
      canvas.style.pointerEvents = 'none';
      canvas.style.zIndex = '6';
      canvas.style.display = 'none';
      this.container.appendChild(canvas);
      this.canvas = canvas;
      this.ctx = canvas.getContext('2d');
    }
  }

  public get alpha(): number {
    return this.currentAlpha;
  }

  public resize(width: number, height: number): void {
    if (!this.canvas) return;
    const w = Math.max(1, Math.round(width));
    const h = Math.max(1, Math.round(height));
    if (this.canvas.width !== w || this.canvas.height !== h) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
  }

  public update(dt: number, input: SpeedlinesComputeInput): void {
    const nextAlpha = computeSpeedlinesIntensity(input);
    this.currentAlpha = nextAlpha;
    if (input.flashEffect) {
      this.phase += dt * 18;
    }

    if (!this.canvas || !this.ctx) return;
    if (nextAlpha <= 0.01) {
      this.canvas.style.display = 'none';
      return;
    }
    this.canvas.style.display = 'block';
    const w = this.canvas.width || 960;
    const h = this.canvas.height || 540;
    const cx = w * 0.5;
    const cy = h * 0.5;
    const maxR = Math.hypot(cx, cy) * 1.05;
    const innerR = Math.min(w, h) * 0.34;
    const rayCount = 42;

    this.ctx.clearRect(0, 0, w, h);
    this.ctx.save();
    this.ctx.fillStyle = `rgba(255, 250, 240, ${(nextAlpha * 0.55).toFixed(3)})`;

    for (let i = 0; i < rayCount; i += 1) {
      const jitter = Math.sin(i * 1.73 + Math.floor(this.phase) * 0.9) * 0.03;
      const angle = (i / rayCount) * Math.PI * 2 + jitter;
      const startR = innerR + ((i * 37) % 5) * 14;
      const halfSpread = 0.008 + ((i % 3) * 0.004);

      const x0 = cx + Math.cos(angle) * startR;
      const y0 = cy + Math.sin(angle) * startR;
      const x1 = cx + Math.cos(angle - halfSpread) * maxR;
      const y1 = cy + Math.sin(angle - halfSpread) * maxR;
      const x2 = cx + Math.cos(angle + halfSpread) * maxR;
      const y2 = cy + Math.sin(angle + halfSpread) * maxR;

      this.ctx.beginPath();
      this.ctx.moveTo(x0, y0);
      this.ctx.lineTo(x1, y1);
      this.ctx.lineTo(x2, y2);
      this.ctx.closePath();
      this.ctx.fill();
    }

    this.ctx.restore();
  }

  public hide(): void {
    this.currentAlpha = 0;
    if (this.canvas) {
      this.canvas.style.display = 'none';
    }
  }

  public dispose(): void {
    if (this.canvas?.parentElement) {
      this.canvas.parentElement.removeChild(this.canvas);
    }
    this.canvas = null;
    this.ctx = null;
    this.currentAlpha = 0;
  }
}
