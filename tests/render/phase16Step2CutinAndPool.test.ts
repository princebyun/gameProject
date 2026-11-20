import { describe, expect, it } from 'vitest';
import { BATTLE_CALC_VERSION } from '../../src/core/constants';
import { defaultDataRegistry } from '../../src/data/dataRegistry';
import { createAssetManifestRegistry } from '../../src/data/assets/assetManifestRegistry';
import {
  DEFAULT_PARTICLE_POOL_CAPACITY,
  ParticlePool
} from '../../src/render/vfx/particlePool';
import {
  PixelCutinOverlayController,
  type CutinDisplayMode
} from '../../src/render/vfx/PixelCutinOverlay';
import type { ActiveBattleCutin } from '../../src/core/types/battleState';
import {
  DEFAULT_VIEWPORT_METRICS,
  type ViewportMetrics
} from '../../src/render/viewport/responsiveViewportManager';
import { UnifiedInputManager } from '../../src/input/inputManager';
import { WebPlatformAdapter } from '../../src/platform/webPlatformAdapter';

function makeTestViewport(
  viewWidth: number,
  viewHeight: number,
  safeInsets: { top: number; bottom: number; left: number; right: number }
): ViewportMetrics {
  return {
    ...DEFAULT_VIEWPORT_METRICS,
    viewWidth,
    viewHeight,
    safeInsets
  };
}

function createMockCanvasCtx() {
  const ops: { fn: string; fillStyle?: string }[] = [];
  const ctx: Record<string, unknown> = {
    fillStyle: '#000000',
    strokeStyle: '#000000',
    lineWidth: 1,
    globalAlpha: 1,
    font: '12px monospace',
    textAlign: 'left',
    imageSmoothingEnabled: true,
    save: () => ops.push({ fn: 'save' }),
    restore: () => ops.push({ fn: 'restore' }),
    beginPath: () => ops.push({ fn: 'beginPath' }),
    closePath: () => ops.push({ fn: 'closePath' }),
    moveTo: () => ops.push({ fn: 'moveTo' }),
    lineTo: () => ops.push({ fn: 'lineTo' }),
    arc: () => ops.push({ fn: 'arc' }),
    clip: () => ops.push({ fn: 'clip' }),
    fill: () => ops.push({ fn: 'fill', fillStyle: String(ctx.fillStyle) }),
    stroke: () => ops.push({ fn: 'stroke' }),
    fillRect: () => ops.push({ fn: 'fillRect', fillStyle: String(ctx.fillStyle) }),
    strokeRect: () => ops.push({ fn: 'strokeRect' }),
    fillText: () => ops.push({ fn: 'fillText' }),
    translate: () => ops.push({ fn: 'translate' }),
    scale: () => ops.push({ fn: 'scale' }),
    drawImage: () => ops.push({ fn: 'drawImage' })
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, ops };
}

function makeSampleCutin(overrides: Partial<ActiveBattleCutin> = {}): ActiveBattleCutin {
  return {
    id: 'cutin_100_BOND_COMBO_luffy',
    kind: 'BOND_COMBO',
    team: 'ALPHA',
    primaryUnitId: 'p_luffy',
    primarySpeciesId: 'luffy',
    primaryName: '몽키 D. 루피',
    primaryFormId: null,
    partnerUnitId: 'p_zoro',
    partnerSpeciesId: 'zoro',
    partnerName: '롤로노아 조로',
    title: '고무고무 300파운드 공성포',
    subtitle: '고무고무 × 삼도류 — 300파운드 공성포!!',
    primaryColor: '#ef4444',
    secondaryColor: '#22c55e',
    portraitEmotion: 'excited',
    elapsedTicks: 2,
    durationTicks: 39,
    ...overrides
  };
}

describe('Phase 16 Step 2: 300-Slot ParticlePool, PixelCutinOverlay, S25 Ultra Touch Controls & 4 New SFX', () => {
  it('1. ParticlePool pre-allocates 300 slots and recycles in a zero-GC ring buffer without exceeding capacity', () => {
    const pool = new ParticlePool();
    expect(pool.capacity).toBe(DEFAULT_PARTICLE_POOL_CAPACITY);
    expect(pool.capacity).toBe(300);

    // Spawn 450 particles -> ring buffer overwrites oldest slots, activeCount stays capped at 300
    for (let i = 0; i < 450; i++) {
      pool.spawn({
        kind: i % 2 === 0 ? 'HAKI_ARC' : 'BOND_STAR',
        x: 100 + i,
        y: 200,
        vx: 40,
        vy: -20,
        color: '#facc15',
        maxAgeSec: 0.3
      });
    }
    const stats = pool.getStats();
    expect(stats.activeCount).toBe(300);
    expect(stats.totalSpawned).toBe(450);
    expect(stats.cursor).toBe(150);

    // Step past maxAgeSec -> all particles deactivate cleanly
    pool.step(0.5);
    expect(pool.getStats().activeCount).toBe(0);
  });

  it('2. PixelCutinOverlay suppresses bright entry flash when flashEffectEnabled === false and respects ON / ONCE / OFF modes', () => {
    const controller = new PixelCutinOverlayController();
    const cutin1 = makeSampleCutin({ id: 'cutin_1', elapsedTicks: 1 });
    const cutin2SamePair = makeSampleCutin({ id: 'cutin_2', elapsedTicks: 1 });
    const s25Viewport = makeTestViewport(915, 412, {
      top: 0,
      bottom: 16,
      left: 36,
      right: 16
    });

    // flashEffectEnabled === true -> renders white entry flash
    const mockFlashOn = createMockCanvasCtx();
    const resFlashOn = controller.render(
      mockFlashOn.ctx,
      cutin1,
      defaultDataRegistry,
      undefined,
      s25Viewport,
      true,
      'ON'
    );
    expect(resFlashOn.rendered).toBe(true);
    expect(resFlashOn.flashSuppressed).toBe(false);
    expect(
      mockFlashOn.ops.some(
        (o) => o.fn === 'fillRect' && o.fillStyle === 'rgba(255, 255, 255, 0.24)'
      )
    ).toBe(true);

    // flashEffectEnabled === false -> strictly suppresses bright white flash!
    const mockFlashOff = createMockCanvasCtx();
    const resFlashOff = controller.render(
      mockFlashOff.ctx,
      cutin1,
      defaultDataRegistry,
      undefined,
      s25Viewport,
      false,
      'ON'
    );
    expect(resFlashOff.rendered).toBe(true);
    expect(resFlashOff.flashSuppressed).toBe(true);
    expect(
      mockFlashOff.ops.some(
        (o) => o.fn === 'fillRect' && o.fillStyle === 'rgba(255, 255, 255, 0.24)'
      )
    ).toBe(false);

    // Mode OFF -> skips rendering completely
    const mockOff = createMockCanvasCtx();
    const resOff = controller.render(
      mockOff.ctx,
      cutin1,
      defaultDataRegistry,
      undefined,
      s25Viewport,
      true,
      'OFF'
    );
    expect(resOff.rendered).toBe(false);
    expect(resOff.modeSkipped).toBe(true);

    // Mode ONCE -> renders first occurrence, skips second identical occurrence until reset
    controller.resetBattleOnceMemory();
    const modeOnce: CutinDisplayMode = 'ONCE';
    const firstOnce = controller.render(
      createMockCanvasCtx().ctx,
      cutin1,
      defaultDataRegistry,
      undefined,
      s25Viewport,
      true,
      modeOnce
    );
    const secondOnce = controller.render(
      createMockCanvasCtx().ctx,
      cutin2SamePair,
      defaultDataRegistry,
      undefined,
      s25Viewport,
      true,
      modeOnce
    );
    expect(firstOnce.rendered).toBe(true);
    expect(secondOnce.rendered).toBe(false);
    expect(secondOnce.modeSkipped).toBe(true);
  });

  it('3. Touch GUARD & BOND_COMBO buttons stay strictly inside Galaxy S25 Ultra (915x412) & iPhone (844x390) Safe Areas without overlapping', () => {
    const input = new UnifiedInputManager(new WebPlatformAdapter());
    input.forceShowTouchUi = true;

    const viewports = [
      makeTestViewport(915, 412, { top: 0, bottom: 16, left: 36, right: 16 }),
      makeTestViewport(844, 390, { top: 0, bottom: 16, left: 34, right: 16 })
    ];

    for (const vp of viewports) {
      const buttons = input.getTouchButtons(vp);
      const guardBtn = buttons.find((b) => b.id === 'GUARD');
      const bondBtn = buttons.find((b) => b.id === 'BOND_COMBO');
      expect(guardBtn).toBeDefined();
      expect(bondBtn).toBeDefined();

      // Verify every button is strictly inside Safe Area bounds
      for (const b of buttons) {
        expect(b.x - b.r).toBeGreaterThanOrEqual(vp.safeInsets.left);
        expect(b.x + b.r).toBeLessThanOrEqual(vp.viewWidth - vp.safeInsets.right);
        expect(b.y - b.r).toBeGreaterThanOrEqual(vp.safeInsets.top);
        expect(b.y + b.r).toBeLessThanOrEqual(vp.viewHeight - vp.safeInsets.bottom);
      }

      // Verify GUARD & BOND_COMBO do not overlap any other touch button
      for (const other of buttons) {
        if (other.id !== 'GUARD') {
          const d = Math.hypot(guardBtn!.x - other.x, guardBtn!.y - other.y);
          expect(d).toBeGreaterThanOrEqual(guardBtn!.r + other.r - 2);
        }
        if (other.id !== 'BOND_COMBO') {
          const d = Math.hypot(bondBtn!.x - other.x, bondBtn!.y - other.y);
          expect(d).toBeGreaterThanOrEqual(bondBtn!.r + other.r - 2);
        }
      }
    }
  });

  it('4. Audio manifest registers all 4 new Phase 16 SFX & BATTLE_CALC_VERSION is 0.7.0', () => {
    expect(BATTLE_CALC_VERSION).toBe('0.7.0');
    const manifest = createAssetManifestRegistry();
    for (const id of [
      'parry_clang',
      'projectile_reflect',
      'cutin_whoosh',
      'bond_combo_burst'
    ]) {
      expect(manifest.sfxById[id], `Missing Phase 16 SFX: ${id}`).toBeDefined();
      expect(manifest.sfxById[id].throttleMs).toBe(50);
    }
  });
});
