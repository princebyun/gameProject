import { describe, expect, it } from 'vitest';
import type { PlatformAdapter } from '../../src/platform/platformAdapter';
import {
  computeBattleSpeedHudRects,
  hitTestBattleSpeedHud
} from '../../src/render/hud/battleSpeedHud';
import { computeResponsiveViewport } from '../../src/render/viewport/responsiveViewportManager';
import { getSafeHudBounds } from '../../src/render/viewport/safeAreaLayout';
import {
  BATTLE_SPEED_STORAGE_KEY,
  computeEffectiveLoopDt,
  cycleBattleSpeedScale,
  DEFAULT_BATTLE_SPEED_SCALE,
  loadBattleSpeedScale,
  normalizeBattleSpeedScale,
  saveBattleSpeedScale,
  stepBattleSpeedScale
} from '../../src/scenes/controllers/battleSpeedControl';

interface Box {
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

function overlaps(a: Box, b: Box): boolean {
  return (
    a.x < b.x + b.w &&
    a.x + a.w > b.x &&
    a.y < b.y + b.h &&
    a.y + a.h > b.y
  );
}

function createMemoryPlatform(): PlatformAdapter {
  const store = new Map<string, string>();
  return {
    platformName: 'web-pwa',
    nowMs: () => 0,
    getStorageItem: (k) => store.get(k) ?? null,
    setStorageItem: (k, v) => {
      store.set(k, v);
    },
    removeStorageItem: (k) => {
      store.delete(k);
    },
    isFullscreen: () => false,
    toggleFullscreen: async () => false,
    vibrate: () => {},
    exportJsonFile: () => {}
  };
}

describe('Battle Speed Control & Pause Overlay', () => {
  it('defaults to 0.75x, scales only offline battle scenes (STORY_BATTLE/SANDBOX), and locks ONLINE_BATTLE & RPG to 1.0x', () => {
    expect(DEFAULT_BATTLE_SPEED_SCALE).toBe(0.75);

    const frameDt = 1 / 60;
    expect(computeEffectiveLoopDt(frameDt, 'STORY_BATTLE', 0.5, false)).toBeCloseTo(frameDt * 0.5, 6);
    expect(computeEffectiveLoopDt(frameDt, 'STORY_BATTLE', 0.75, false)).toBeCloseTo(frameDt * 0.75, 6);
    expect(computeEffectiveLoopDt(frameDt, 'SANDBOX', 1.25, false)).toBeCloseTo(frameDt * 1.25, 6);
    expect(computeEffectiveLoopDt(frameDt, 'STORY_BATTLE', 0.75, true)).toBe(0);
    expect(computeEffectiveLoopDt(frameDt, 'SANDBOX', 1, true)).toBe(0);

    // Online multiplayer lockstep & exploration scenes never slow down or pause via battle speed
    expect(computeEffectiveLoopDt(frameDt, 'ONLINE_BATTLE', 0.5, true)).toBeCloseTo(frameDt, 6);
    expect(computeEffectiveLoopDt(frameDt, 'SEA_SAILING', 0.5, true)).toBeCloseTo(frameDt, 6);
    expect(computeEffectiveLoopDt(frameDt, 'ISLAND_EPISODE', 0.5, true)).toBeCloseTo(frameDt, 6);
  });

  it('cycles, steps, normalizes, and persists speed preferences via PlatformAdapter', () => {
    expect(cycleBattleSpeedScale(0.5)).toBe(0.75);
    expect(cycleBattleSpeedScale(0.75)).toBe(1);
    expect(cycleBattleSpeedScale(1)).toBe(1.25);
    expect(cycleBattleSpeedScale(1.25)).toBe(0.5);

    expect(stepBattleSpeedScale(0.75, -1)).toBe(0.5);
    expect(stepBattleSpeedScale(0.5, -1)).toBe(0.5);
    expect(stepBattleSpeedScale(1, 1)).toBe(1.25);
    expect(stepBattleSpeedScale(1.25, 1)).toBe(1.25);

    expect(normalizeBattleSpeedScale('bad')).toBe(0.75);
    expect(normalizeBattleSpeedScale(0.49)).toBe(0.5);

    const mem = createMemoryPlatform();
    expect(loadBattleSpeedScale(mem)).toBe(0.75);
    saveBattleSpeedScale(mem, 0.5);
    expect(mem.getStorageItem(BATTLE_SPEED_STORAGE_KEY)).toBe('0.5');
    expect(loadBattleSpeedScale(mem)).toBe(0.5);
  });

  it('places Speed & Pause HUD pills with zero overlap against unit cards, timer, and Boss HP bar on S25 Ultra and Desktop', () => {
    const viewports = [
      computeResponsiveViewport(915, 412, 3, { top: 0, right: 36, bottom: 14, left: 44 }),
      computeResponsiveViewport(1280, 720, 1, { top: 0, right: 0, bottom: 0, left: 0 })
    ];

    for (const vm of viewports) {
      const safe = getSafeHudBounds(vm);
      const { speedBtn, pauseBtn } = computeBattleSpeedHudRects(safe);
      const speedBox: Box = { name: 'SpeedBtn', ...speedBtn };
      const pauseBox: Box = { name: 'PauseBtn', ...pauseBtn };
      const alphaCard: Box = { name: 'AlphaCard', x: 12 + safe.insets.left, y: 10 + safe.insets.top, w: 240, h: 62 };
      const omegaCard: Box = { name: 'OmegaCard', x: safe.right - 252, y: 10 + safe.insets.top, w: 240, h: 62 };
      const timerHud: Box = { name: 'TopTimer', x: safe.centerX - 115, y: 8 + safe.insets.top, w: 230, h: 44 };
      const bossBar: Box = { name: 'BossHpBar', x: (safe.viewWidth - 436) * 0.5, y: 55 + safe.insets.top, w: 436, h: 34 };

      for (const hud of [alphaCard, omegaCard, timerHud, bossBar]) {
        expect(overlaps(speedBox, hud), `SpeedBtn overlaps ${hud.name}`).toBe(false);
        expect(overlaps(pauseBox, hud), `PauseBtn overlaps ${hud.name}`).toBe(false);
      }
      expect(overlaps(speedBox, pauseBox)).toBe(false);

      expect(hitTestBattleSpeedHud({ x: speedBtn.x + 10, y: speedBtn.y + 10 }, vm)).toBe('SPEED');
      expect(hitTestBattleSpeedHud({ x: pauseBtn.x + 10, y: pauseBtn.y + 10 }, vm)).toBe('PAUSE');
      expect(hitTestBattleSpeedHud({ x: timerHud.x + 10, y: timerHud.y + 10 }, vm)).toBeNull();
    }
  });
});
