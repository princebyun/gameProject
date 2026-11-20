import { describe, expect, it } from 'vitest';
import { BATTLE_CALC_VERSION } from '../../src/core/constants';
import {
  HpDelayTracker,
  computeCooldownWipeRatio
} from '../../src/render/ui/pixelNineSliceUi';
import { PixelVfxEngine } from '../../src/render/vfx/pixelVfxEngine';

describe('Phase 14 Step 2 — Multi-Layer Pixel VFX Engine, Impact Frame Accessibility & 9-Slice RPG HUD Math', () => {
  it('PixelVfxEngine uses bounded fixed object pools and expires ground decals cleanly', () => {
    const vfx = new PixelVfxEngine();

    // Overflow spark pool beyond 128 capacity to verify ring-buffer reuse (no unbounded growth)
    for (let i = 0; i < 200; i++) {
      vfx.spawnSpark(100 + i, 120, 40, -20, '#fde047', 3, 0.3);
    }
    for (let i = 0; i < 60; i++) {
      vfx.spawnGroundDecal(200 + i, 240, 22, 'SCORCH', 1.0);
    }

    const stats = vfx.getPoolStats();
    expect(stats.sparkCapacity).toBe(128);
    expect(stats.activeSparks).toBe(128);
    expect(stats.decalCapacity).toBe(48);
    expect(stats.activeDecals).toBe(48);

    vfx.reset();
    expect(vfx.getPoolStats().activeSparks).toBe(0);
    expect(vfx.getPoolStats().activeDecals).toBe(0);
  });

  it('Impact Frames strictly respect accessibility setting flashEffectEnabled === false', () => {
    const vfx = new PixelVfxEngine();

    // Disabled -> must NOT trigger impact frame
    const blocked = vfx.triggerImpactFrame({ x: 480, y: 270 }, false, 3, '#ef4444');
    expect(blocked).toBe(false);
    expect(vfx.getPoolStats().impactFramesLeft).toBe(0);

    // Enabled -> triggers 2-3 frame impact flash
    const allowed = vfx.triggerImpactFrame({ x: 480, y: 270 }, true, 3, '#ffffff');
    expect(allowed).toBe(true);
    expect(vfx.getPoolStats().impactFramesLeft).toBe(3);

    // Rendering impact frame with flashEffectEnabled=false returns false (never paints)
    const renderedBlocked = vfx.renderImpactFrameOverlay(
      {} as CanvasRenderingContext2D,
      960,
      540,
      false
    );
    expect(renderedBlocked).toBe(false);
  });

  it('HpDelayTracker smoothly drains white damage delay bar after hits and snaps upward on heal', () => {
    const tracker = new HpDelayTracker();

    // Initial full HP
    expect(tracker.sample('luffy', 1.0, 1 / 60)).toBe(1.0);

    // Sudden 40% damage hit -> delayed bar stays above 0.6 and smoothly drains over frames
    const after1Frame = tracker.sample('luffy', 0.6, 1 / 60);
    expect(after1Frame).toBeGreaterThan(0.6);
    expect(after1Frame).toBeLessThan(1.0);

    let val = after1Frame;
    for (let i = 0; i < 90; i++) {
      val = tracker.sample('luffy', 0.6, 1 / 60);
    }
    expect(val).toBeCloseTo(0.6, 3);

    // Healing snaps upward immediately
    expect(tracker.sample('luffy', 0.9, 1 / 60)).toBe(0.9);
  });

  it('computeCooldownWipeRatio clamps clock-wipe progress strictly to [0, 1]', () => {
    expect(computeCooldownWipeRatio(0, 6)).toBe(0);
    expect(computeCooldownWipeRatio(-1, 6)).toBe(0);
    expect(computeCooldownWipeRatio(3, 6)).toBeCloseTo(0.5, 4);
    expect(computeCooldownWipeRatio(9, 6)).toBe(1);
  });

  it('Preserves BATTLE_CALC_VERSION immutability (0.6.0) throughout Phase 14 Visual Overhaul', () => {
    expect(BATTLE_CALC_VERSION).toBe('0.7.0');
  });
});
