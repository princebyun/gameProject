import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  BATTLE_CALC_VERSION,
  LOGICAL_HEIGHT,
  LOGICAL_WIDTH
} from '../../src/core/constants';
import { UnifiedInputManager } from '../../src/input/inputManager';
import type { PlatformAdapter } from '../../src/platform/platformAdapter';
import {
  computeResponsiveViewport,
  MAX_RENDER_DPR,
  MAX_VIEW_WIDTH,
  MIN_VIEW_WIDTH
} from '../../src/render/viewport/responsiveViewportManager';
import {
  computeSafeRect,
  convertCssInsetsToLogical,
  SafeAreaLayout
} from '../../src/render/viewport/safeAreaLayout';

function createMockPlatform(): PlatformAdapter {
  const store = new Map<string, string>();
  return {
    platformName: 'mobile-wrapper',
    nowMs: () => Date.now(),
    getStorageItem: (k: string) => store.get(k) ?? null,
    setStorageItem: (k: string, v: string) => {
      store.set(k, v);
    },
    removeStorageItem: (k: string) => {
      store.delete(k);
    },
    isFullscreen: () => true,
    toggleFullscreen: async () => true,
    vibrate: () => { },
    exportJsonFile: () => { }
  };
}

describe('Stage 5 Step 1 — Galaxy S25 Ultra 19.5:9 Viewport, Safe Area & Android Native Fullscreen', () => {
  it('computes dynamic horizontal viewWidth cleanly for 16:9, Galaxy S25 Ultra 19.5:9, and clamps extremes', () => {
    expect(BATTLE_CALC_VERSION).toBe('0.7.0');
    expect(LOGICAL_WIDTH).toBe(960);
    expect(LOGICAL_HEIGHT).toBe(540);

    // 1. Standard 16:9 desktop (1280x720) -> 960x540
    const desktop = computeResponsiveViewport(1280, 720, 1);
    expect(desktop.viewWidth).toBe(960);
    expect(desktop.viewHeight).toBe(540);
    expect(desktop.arenaOffsetX).toBe(0);
    expect(desktop.bufferWidth).toBe(960);
    expect(desktop.bufferHeight).toBe(540);

    // 2. Exact 19.5:9 Galaxy S25 Ultra ratio (1040x480) -> 1170x540, arenaOffsetX = 105
    const s25Exact = computeResponsiveViewport(1040, 480, 3);
    expect(s25Exact.viewWidth).toBe(1170);
    expect(s25Exact.viewHeight).toBe(540);
    expect(s25Exact.arenaOffsetX).toBe(105);
    expect(s25Exact.dpr).toBe(3);
    expect(s25Exact.bufferWidth).toBe(1170 * 3);
    expect(s25Exact.bufferHeight).toBe(540 * 3);

    // 3. Galaxy S25 Ultra Chrome/WebView landscape (915x412) -> ~1199x540 within [1170, 1260]
    const s25Web = computeResponsiveViewport(915, 412, 3.5);
    expect(s25Web.viewWidth).toBeGreaterThanOrEqual(1170);
    expect(s25Web.viewWidth).toBeLessThanOrEqual(MAX_VIEW_WIDTH);
    expect(s25Web.dpr).toBe(MAX_RENDER_DPR); // DPR capped at 3

    // 4. General mobile landscape (844x390) -> ~1169x540
    const mobile = computeResponsiveViewport(844, 390, 2);
    expect(mobile.viewWidth).toBe(1169);
    expect(mobile.viewHeight).toBe(540);

    // 5. Extreme ultra-wide & narrow clamping
    const ultraWide = computeResponsiveViewport(2560, 900, 2);
    expect(ultraWide.viewWidth).toBe(MAX_VIEW_WIDTH); // 1260

    const narrow = computeResponsiveViewport(390, 844, 3);
    expect(narrow.viewWidth).toBe(MIN_VIEW_WIDTH); // 960
  });

  it('converts CSS Safe Area insets (punch-hole & gesture bar) to logical coordinates and safe rect', () => {
    const safeArea = new SafeAreaLayout();
    safeArea.setSimulatedSafeInsets({ top: 0, right: 20, bottom: 24, left: 44 });
    const cssInsets = safeArea.readCssSafeInsets();
    expect(cssInsets).toEqual({ top: 0, right: 20, bottom: 24, left: 44 });

    const metrics = computeResponsiveViewport(915, 412, 3, cssInsets);
    const expectedLogical = convertCssInsetsToLogical(
      cssInsets,
      915,
      412,
      metrics.viewWidth,
      metrics.viewHeight
    );
    expect(metrics.safeInsets).toEqual(expectedLogical);
    expect(metrics.safeInsets.left).toBeGreaterThan(40);
    expect(metrics.safeInsets.bottom).toBeGreaterThan(20);

    const rect = computeSafeRect(
      metrics.viewWidth,
      metrics.viewHeight,
      metrics.safeInsets,
      8
    );
    expect(rect.left).toBe(metrics.safeInsets.left + 8);
    expect(rect.right).toBe(metrics.viewWidth - metrics.safeInsets.right - 8);
    expect(rect.bottom).toBe(metrics.viewHeight - metrics.safeInsets.bottom - 8);
  });

  it('places 6.9-inch ergonomic fan-shaped touch buttons & floating joystick strictly inside Safe Area and persists size/opacity', () => {
    const platform = createMockPlatform();
    const input = new UnifiedInputManager(platform);

    const s25Metrics = computeResponsiveViewport(915, 412, 3, {
      top: 8,
      right: 36,
      bottom: 24,
      left: 48
    });
    input.updateViewportMetrics(s25Metrics);

    // Verify all fan buttons stay strictly inside Safe Area bounds
    for (const preset of ['SMALL', 'MEDIUM', 'LARGE'] as const) {
      input.setTouchButtonSize(preset);
      const buttons = input.getTouchButtons(s25Metrics);
      expect(buttons.length).toBe(9);

      for (const btn of buttons) {
        expect(btn.x - btn.r).toBeGreaterThanOrEqual(s25Metrics.safeInsets.left);
        expect(btn.x + btn.r).toBeLessThanOrEqual(
          s25Metrics.viewWidth - s25Metrics.safeInsets.right
        );
        expect(btn.y - btn.r).toBeGreaterThanOrEqual(s25Metrics.safeInsets.top);
        expect(btn.y + btn.r).toBeLessThanOrEqual(
          s25Metrics.viewHeight - s25Metrics.safeInsets.bottom
        );
      }
    }

    // Verify size & opacity persistence across re-instantiation
    input.setTouchButtonSize('LARGE');
    input.setTouchOpacity(0.55);
    const reloaded = new UnifiedInputManager(platform);
    expect(reloaded.getTouchPrefs()).toEqual({
      sizePreset: 'LARGE',
      opacity: 0.55
    });

    // Verify floating joystick re-anchors on touch inside left-bottom zone and resets on release
    reloaded.forceShowTouchUi = true;
    reloaded.updateViewportMetrics(s25Metrics);
    const handled = reloaded.handleCanvasPointerDown({ x: 180, y: 390 });
    expect(handled).toBe(true);
    expect(reloaded.virtualJoystickActive).toBe(true);
    expect(reloaded.virtualJoystickOrigin.x).toBe(180);
    reloaded.handleCanvasPointerUp();
    expect(reloaded.virtualJoystickActive).toBe(false);
    expect(reloaded.virtualJoystickOrigin).toEqual(reloaded.virtualJoystickHomeOrigin);
  });

  it('verifies Android native Edge-to-Edge shortEdges cutout and immersive fullscreen config', () => {
    const root = path.resolve(__dirname, '../..');
    const stylesXml = fs.readFileSync(
      path.join(root, 'android/app/src/main/res/values/styles.xml'),
      'utf-8'
    );
    const mainActivity = fs.readFileSync(
      path.join(
        root,
        'android/app/src/main/java/com/grandvoyage/onepiece/resonance/MainActivity.java'
      ),
      'utf-8'
    );
    const manifestXml = fs.readFileSync(
      path.join(root, 'android/app/src/main/AndroidManifest.xml'),
      'utf-8'
    );

    expect(stylesXml).toContain('windowLayoutInDisplayCutoutMode');
    expect(stylesXml).toContain('shortEdges');
    expect(stylesXml).toContain('windowFullscreen');

    expect(mainActivity).toContain('WindowCompat.setDecorFitsSystemWindows(getWindow(), false)');
    expect(mainActivity).toContain('BEHAVIOR_SHOW_TRANSIENT_BARS_BY_SWIPE');
    expect(mainActivity).toContain('LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES');
    expect(mainActivity).toContain('WindowInsetsCompat.Type.systemBars()');

    expect(manifestXml).toContain('android:screenOrientation="sensorLandscape"');
  });
});
