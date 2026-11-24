import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import {
  DEFAULT_THREE_TOON_TUNING,
  project2DTo3D
} from '../../src/render/three/threeTypes';
import {
  applyToonMaterialTuning,
  computeSpeedlinesIntensity,
  createAnimeToonMaterial,
  createCelRampTexture,
  createToonOutlineMaterial,
  disposeSharedToonCaches,
  isAnimeToonMaterial,
  isToonOutlineMaterial,
  setToonMaterialAura,
  SpeedlinesOverlay3D
} from '../../src/render/three/shaders/AnimeToonMaterial';
import { computeResponsiveViewport } from '../../src/render/viewport/responsiveViewportManager';
import {
  ThreeComposerLike,
  ThreeRendererLike,
  ThreeStageHost
} from '../../src/render/three/ThreeStageHost';

function createMockThreeDeps() {
  let pixelRatio = 1;
  let sizeW = 960;
  let sizeH = 540;
  const rendererDisposed = vi.fn();
  const composerDisposed = vi.fn();
  const renderCalls = vi.fn();
  const composerRenderCalls = vi.fn();

  const mockRenderer: ThreeRendererLike = {
    domElement: {} as HTMLCanvasElement,
    shadowMap: { enabled: true, type: THREE.PCFSoftShadowMap },
    toneMapping: THREE.NoToneMapping,
    toneMappingExposure: 1,
    outputColorSpace: THREE.SRGBColorSpace,
    info: {
      render: { calls: 12, triangles: 24500 },
      memory: { geometries: 14, textures: 6 },
      programs: [{}]
    },
    setPixelRatio: (v: number) => {
      pixelRatio = v;
    },
    setSize: (w: number, h: number) => {
      sizeW = w;
      sizeH = h;
    },
    render: renderCalls,
    dispose: rendererDisposed
  };

  const bloomPass = { strength: 0.38, enabled: true };
  const mockComposer: ThreeComposerLike = {
    setSize: vi.fn(),
    render: composerRenderCalls,
    dispose: composerDisposed
  };

  return {
    hostDeps: {
      rendererFactory: () => mockRenderer,
      composerFactory: () => ({ composer: mockComposer, bloomPass })
    },
    getState: () => ({ pixelRatio, sizeW, sizeH }),
    bloomPass,
    renderCalls,
    composerRenderCalls,
    rendererDisposed,
    composerDisposed
  };
}

describe('Step 1: AnimeToonMaterial & ThreeStageHost', () => {
  it('maps 2D arena center and corners cleanly into 3D XZ ground coordinates', () => {
    expect(project2DTo3D(480, 270)).toEqual({ x: 0, y: 0, z: 0 });
    const corner = project2DTo3D(960, 540, 2.5);
    expect(corner.x).toBeCloseTo(19.2, 4);
    expect(corner.y).toBeCloseTo(2.5, 4);
    expect(corner.z).toBeCloseTo(10.8, 4);
  });

  it('builds nearest-filtered cel ramp textures for 2, 3, and 4 shading bands', () => {
    for (const steps of [2, 3, 4] as const) {
      const ramp = createCelRampTexture(steps);
      expect(ramp.image.width).toBe(steps);
      expect(ramp.image.height).toBe(1);
      expect(ramp.minFilter).toBe(THREE.NearestFilter);
      expect(ramp.magFilter).toBe(THREE.NearestFilter);
      expect(ramp.generateMipmaps).toBe(false);
      const data = ramp.image.data as Uint8Array;
      for (let i = 1; i < steps; i += 1) {
        expect(data[i * 4]).toBeGreaterThan(data[(i - 1) * 4] ?? 0);
      }
      ramp.dispose();
    }
  });

  it('constructs cel shader & BackSide ink outline supporting skinning and instancing', () => {
    const toon = createAnimeToonMaterial({
      baseColor: '#ef4444',
      auraMode: 'HAO',
      celSteps: 3
    });
    const outline = createToonOutlineMaterial({ outlineWidth: 0.032 });

    expect(isAnimeToonMaterial(toon)).toBe(true);
    expect(isToonOutlineMaterial(outline)).toBe(true);
    expect(outline.side).toBe(THREE.BackSide);
    expect(toon.vertexShader).toContain('#include <skinning_pars_vertex>');
    expect(toon.vertexShader).toContain('USE_INSTANCING');
    expect(outline.vertexShader).toContain('#include <skinning_vertex>');
    expect(outline.vertexShader).toContain('USE_INSTANCING');

    applyToonMaterialTuning(toon, { ...DEFAULT_THREE_TOON_TUNING, celSteps: 4, rimIntensity: 1.4 });
    applyToonMaterialTuning(outline, { ...DEFAULT_THREE_TOON_TUNING, outlineWidth: 0.05 });
    expect(toon.uniforms['uRimIntensity']?.value).toBeCloseTo(1.4, 4);
    expect(outline.uniforms['uOutlineWidth']?.value).toBeCloseTo(0.05, 4);

    setToonMaterialAura(toon, 'GEAR5', 1.25, 2.0);
    expect(toon.uniforms['uAuraMode']?.value).toBe(3);
    expect(toon.uniforms['uAuraIntensity']?.value).toBeCloseTo(1.25, 4);

    toon.dispose();
    outline.dispose();
    disposeSharedToonCaches();
  });

  it('clamps speedlines intensity strictly when flashEffect is false', () => {
    const normal = computeSpeedlinesIntensity({
      speedNormalized: 1,
      isSpecialActive: true,
      flashEffect: true,
      opacityMultiplier: 1
    });
    const safeFlash = computeSpeedlinesIntensity({
      speedNormalized: 1,
      isSpecialActive: true,
      flashEffect: false,
      opacityMultiplier: 1
    });
    expect(normal).toBeGreaterThan(0.8);
    expect(safeFlash).toBeLessThanOrEqual(0.14);

    const overlay = new SpeedlinesOverlay3D(null);
    overlay.update(0.016, {
      speedNormalized: 1,
      isSpecialActive: false,
      flashEffect: true,
      opacityMultiplier: 0.8
    });
    expect(overlay.alpha).toBeGreaterThan(0.5);
    overlay.dispose();
  });

  it('returns false cleanly in headless Node when no DOM or WebGL2 is present', () => {
    const host = new ThreeStageHost();
    expect(host.init(null)).toBe(false);
    expect(host.isWebGL2Ready).toBe(false);
    host.dispose();
  });

  it('handles 19.5:9 S25 Ultra resize, quality bloom bypass, telemetry, and 0-leak dispose', () => {
    const mock = createMockThreeDeps();
    const host = new ThreeStageHost(mock.hostDeps);

    const s25Viewport = computeResponsiveViewport(915, 412, 3, {
      top: 0,
      right: 24,
      bottom: 0,
      left: 24
    });
    const ok = host.init(null, s25Viewport);
    expect(ok).toBe(true);
    expect(host.camera.aspect).toBeCloseTo(915 / 412, 3);
    expect(mock.getState().pixelRatio).toBeLessThanOrEqual(2);

    host.activate();
    host.renderFrame(1 / 60);
    expect(mock.composerRenderCalls).toHaveBeenCalledTimes(1);

    host.applyVisualPolishConfig({ quality: 'LOW', timeOfDay: 'NIGHT', flashEffect: false });
    expect(host.getQualityTier()).toBe('LOW');
    expect(host.isComposerActiveForRender()).toBe(false);
    expect(mock.getState().pixelRatio).toBe(1);

    host.renderFrame(1 / 60);
    expect(mock.renderCalls).toHaveBeenCalledTimes(1);

    host.setTuning({ bloomStrength: 0.72, hordeTargetCount: 60 });
    expect(mock.bloomPass.strength).toBeCloseTo(0.72, 4);
    expect(host.getTuning().hordeTargetCount).toBe(60);

    host.recordBattleStats(100, 42);
    const telemetry = host.getTelemetrySnapshot();
    expect(telemetry.drawCalls).toBe(12);
    expect(telemetry.triangles).toBe(24500);
    expect(telemetry.hordeActiveCount).toBe(100);
    expect(telemetry.koCount).toBe(42);

    host.dispose();
    expect(mock.composerDisposed).toHaveBeenCalledTimes(1);
    expect(mock.rendererDisposed).toHaveBeenCalledTimes(1);
    expect(host.isWebGL2Ready).toBe(false);
  });
});
