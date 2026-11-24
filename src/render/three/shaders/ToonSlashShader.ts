import * as THREE from 'three';
import type { WeaponTrailTheme } from '../../../data/assets/weapons3dRegistry';

const TOON_SLASH_VERTEX_SHADER = /* glsl */ `
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const TOON_SLASH_FRAGMENT_SHADER = /* glsl */ `
uniform vec3 uCoreColor;
uniform vec3 uMidColor;
uniform vec3 uEdgeColor;
uniform vec3 uHakiColor;
uniform float uBloomIntensity;
uniform float uNoiseScale;
uniform float uLightningJagged;
uniform float uTime;
uniform float uFlashSafe;
uniform float uMasterAlpha;

varying vec2 vUv;

float hash12(vec2 p) {
  vec3 p3 = fract(vec3(p.xyx) * 0.1031);
  p3 += dot(p3, p3.yzx + 33.33);
  return fract((p3.x + p3.y) * p3.z);
}

void main() {
  // vUv.x = 1.0 at leading weapon edge, 0.0 at fading tail
  // vUv.y = 0.0 at base (hilt), 1.0 at blade tip
  float u = clamp(vUv.x, 0.0, 1.0);
  float v = clamp(vUv.y, 0.0, 1.0);

  // Brushstroke jagged tail fade
  float streakNoise = hash12(vec2(floor(u * uNoiseScale * 4.0), floor(v * 14.0 + uTime * 3.0)));
  float tailCutoff = smoothstep(0.03, 0.42, u - streakNoise * 0.28 * (1.0 - u));
  if (tailCutoff < 0.08) discard;

  // Hard-stepped cel bands across blade width (v)
  float tipMask = step(0.76, v);
  float midMask = step(0.32, v) * (1.0 - tipMask);
  float edgeMask = 1.0 - tipMask - midMask;

  vec3 bandColor = uEdgeColor * edgeMask + uMidColor * midMask + uCoreColor * tipMask;

  // Optional Conqueror / Kaido Haki jagged outer arcs
  if (uLightningJagged > 0.5) {
    float wave = abs(fract(u * 9.0 + v * 3.0 - uTime * 7.5) - 0.5) * 2.0;
    float crackle = step(0.74, wave) * step(0.45, v);
    bandColor = mix(bandColor, uHakiColor, crackle * 0.85);
  } else {
    float hakiBand = step(0.84, streakNoise) * (1.0 - tipMask) * step(0.25, u);
    bandColor = mix(bandColor, uHakiColor, hakiBand * 0.45);
  }

  // Selective bloom boost near crisp blade edge (clamped when flashEffect === false)
  float bloomMult = mix(0.85, uBloomIntensity, uFlashSafe);
  float coreBoost = 1.0 + tipMask * (bloomMult - 0.55);
  vec3 finalColor = bandColor * coreBoost;

  float tipAlpha = smoothstep(0.0, 0.14, v);
  float finalAlpha = tailCutoff * tipAlpha * uMasterAlpha;
  if (finalAlpha < 0.02) discard;

  gl_FragColor = vec4(finalColor, finalAlpha);
}
`;

export function createToonSlashMaterial(theme: WeaponTrailTheme): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: {
      uCoreColor: { value: new THREE.Color(theme.coreColor) },
      uMidColor: { value: new THREE.Color(theme.midColor) },
      uEdgeColor: { value: new THREE.Color(theme.edgeColor) },
      uHakiColor: { value: new THREE.Color(theme.hakiColor ?? theme.midColor) },
      uBloomIntensity: { value: theme.bloomIntensity },
      uNoiseScale: { value: theme.noiseScale },
      uLightningJagged: { value: theme.lightningJagged ? 1.0 : 0.0 },
      uTime: { value: 0 },
      uFlashSafe: { value: 1.0 },
      uMasterAlpha: { value: 0.94 }
    },
    vertexShader: TOON_SLASH_VERTEX_SHADER,
    fragmentShader: TOON_SLASH_FRAGMENT_SHADER,
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.NormalBlending,
    toneMapped: true
  });
}

export function updateToonSlashMaterial(
  mat: THREE.ShaderMaterial,
  theme: WeaponTrailTheme,
  flashEffect: boolean,
  elapsedSec: number
): void {
  if (mat.uniforms['uCoreColor']?.value instanceof THREE.Color) {
    mat.uniforms['uCoreColor'].value.set(theme.coreColor);
  }
  if (mat.uniforms['uMidColor']?.value instanceof THREE.Color) {
    mat.uniforms['uMidColor'].value.set(theme.midColor);
  }
  if (mat.uniforms['uEdgeColor']?.value instanceof THREE.Color) {
    mat.uniforms['uEdgeColor'].value.set(theme.edgeColor);
  }
  if (mat.uniforms['uHakiColor']?.value instanceof THREE.Color) {
    mat.uniforms['uHakiColor'].value.set(theme.hakiColor ?? theme.midColor);
  }
  if (mat.uniforms['uBloomIntensity']) {
    mat.uniforms['uBloomIntensity'].value = theme.bloomIntensity;
  }
  if (mat.uniforms['uNoiseScale']) {
    mat.uniforms['uNoiseScale'].value = theme.noiseScale;
  }
  if (mat.uniforms['uLightningJagged']) {
    mat.uniforms['uLightningJagged'].value = theme.lightningJagged ? 1.0 : 0.0;
  }
  if (mat.uniforms['uFlashSafe']) {
    mat.uniforms['uFlashSafe'].value = flashEffect ? 1.0 : 0.0;
  }
  if (mat.uniforms['uTime']) {
    mat.uniforms['uTime'].value = elapsedSec;
  }
}
