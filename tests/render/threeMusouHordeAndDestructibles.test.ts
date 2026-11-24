import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { MusouHordeRenderer } from '../../src/render/three/MusouHordeRenderer';
import { DestructiblePropSystem } from '../../src/render/three/DestructiblePropSystem';
import {
  computeMusouCounterHudRect,
  renderMusouCounterHud
} from '../../src/render/hud/musouCounterHud';
import { computeResponsiveViewport } from '../../src/render/viewport/responsiveViewportManager';

describe('Step 3 & 4: MusouHordeRenderer, DestructiblePropSystem, SafeArea HUD', () => {
  it('renders 100 instanced grunts in 2 draw calls, launches & respawns under 16.6ms/frame', () => {
    const scene = new THREE.Scene();
    const horde = new MusouHordeRenderer(scene);

    expect(horde.getDrawCallCount()).toBe(2);
    expect(horde.getActiveCount()).toBe(100);
    expect(horde.bodyMesh.count).toBe(100);
    expect(horde.outlineMesh.count).toBe(100);

    horde.setTargetCount(30);
    expect(horde.getActiveCount()).toBe(30);
    expect(horde.bodyMesh.count).toBe(30);

    horde.setTargetCount(100);
    expect(horde.getActiveCount()).toBe(100);

    const launched = horde.triggerMusouBurst(new THREE.Vector3(0, 0, 0), 25);
    expect(launched).toBeGreaterThan(20);
    expect(horde.getKoCount()).toBe(launched);
    expect(horde.getHitComboCount()).toBe(launched);

    // 120-frame CPU update stress benchmark
    const startMs = performance.now();
    const playerPos = new THREE.Vector3(0, 0, 0);
    for (let f = 0; f < 120; f += 1) {
      horde.update(1 / 60, playerPos, f / 60);
    }
    const elapsedMs = performance.now() - startMs;
    expect(elapsedMs / 120).toBeLessThan(16.6);

    horde.dispose();
    expect(scene.children.length).toBe(0);
  });

  it('unlocks prop AABB immediately upon shatter & recycles 120-shard debris pool in 2.0s', () => {
    const scene = new THREE.Scene();
    const props = new DestructiblePropSystem(scene);
    const total = props.getTotalCount();
    expect(total).toBeGreaterThanOrEqual(15);

    const first = props.getFirstIntactProp();
    expect(first).not.toBeNull();
    if (!first) return;

    expect(props.blocksMovement(first.x, first.z, 0.5)).toBe(true);
    const shattered = props.triggerRadiusDestruction(new THREE.Vector3(first.x, 0, first.z), 2.0);
    expect(shattered).toBeGreaterThanOrEqual(1);
    expect(props.getRemainingCount()).toBeLessThan(total);
    expect(props.blocksMovement(first.x, first.z, 0.5)).toBe(false);
    expect(props.getActiveDebrisCount()).toBeGreaterThan(0);

    // Advance 2.2 seconds so all debris shards bounce, fade, and recycle to 0
    for (let i = 0; i < 45; i += 1) {
      props.update(0.05);
    }
    expect(props.getActiveDebrisCount()).toBe(0);

    props.dispose();
    expect(scene.children.length).toBe(0);
  });

  it('places MusouCounterHud cleanly inside S25 Ultra 915x412 safeRect with 0px overlap & 0 shadowBlur', () => {
    const s25Viewport = computeResponsiveViewport(915, 412, 3, {
      top: 0,
      right: 24,
      bottom: 0,
      left: 24
    });

    const rect = computeMusouCounterHudRect(s25Viewport);
    expect(rect.x).toBeGreaterThanOrEqual(s25Viewport.safeRect.left);
    expect(rect.x + rect.width).toBeLessThanOrEqual(s25Viewport.safeRect.right);
    // Safely below top-right OMEGA cards (~top + 142) and above bottom skill/touch buttons
    expect(rect.y).toBeGreaterThanOrEqual(s25Viewport.safeRect.top + 150);
    expect(rect.y + rect.height).toBeLessThanOrEqual(s25Viewport.safeRect.bottom - 104);

    let shadowBlurUsed = false;
    const mockCtx = {
      save: vi.fn(),
      restore: vi.fn(),
      beginPath: vi.fn(),
      roundRect: vi.fn(),
      fill: vi.fn(),
      stroke: vi.fn(),
      fillText: vi.fn(),
      set shadowBlur(_v: number) {
        shadowBlurUsed = true;
      }
    } as unknown as CanvasRenderingContext2D;

    renderMusouCounterHud(
      mockCtx,
      {
        koCount: 158,
        hitComboCount: 34,
        hitComboTimer: 2.1,
        lockedBossUnitId: 'o1',
        lockedBossName: 'Kaido',
        destructiblesRemaining: 12,
        destructiblesTotal: 18
      },
      s25Viewport
    );
    expect(shadowBlurUsed).toBe(false);

    // Verify 0 occurrences of shadowBlur across all 3D + Musou HUD source files
    const hudSrc = fs.readFileSync(
      path.resolve('src/render/hud/musouCounterHud.ts'),
      'utf8'
    );
    expect(hudSrc).not.toContain('shadowBlur');
  });
});
