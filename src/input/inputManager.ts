import { clamp, distVec, type Vec2 } from '../core/math/vector2';
import type { GameDataRegistry } from '../core/types/dataSchemas';
import type {
  BattleWorldState,
  UnitInputCommand,
  UnitRuntimeState
} from '../core/types/battleState';
import type { PlatformAdapter } from '../platform/platformAdapter';
import {
  DEFAULT_VIEWPORT_METRICS,
  type ViewportMetrics
} from '../render/viewport/responsiveViewportManager';
import { getSafeHudBounds } from '../render/viewport/safeAreaLayout';
import {
  sampleBattlePlayerCommand,
  sampleExplorationMoveVector
} from './gamepadAndMoveSampler';
import {
  DEFAULT_KEY_BINDINGS,
  loadKeyBindings,
  saveKeyBindings,
  type KeyBindingConfig
} from './keyBindings';
import {
  computeJoystickHomeOrigin,
  computeTouchButtonLayout,
  hitTestBattleBottomHudLayout,
  hitTestTouchButtonsList,
  loadTouchPreferences,
  saveTouchPreferences,
  TOUCH_SIZE_SCALE_MAP,
  type TouchButtonRect,
  type TouchButtonSizePreset,
  type TouchControllerPreferences
} from './touchLayoutCalculator';

export {
  TOUCH_SIZE_SCALE_MAP,
  type TouchButtonRect,
  type TouchButtonSizePreset,
  type TouchControllerPreferences
};

export class UnifiedInputManager {
  private bindings: KeyBindingConfig;
  private keysDown = new Set<string>();
  private keysJustPressed = new Set<string>();
  private mouseLogicalPos: Vec2 | null = null;
  private mouseDown = false;
  private readonly listenerAbort = new AbortController();

  // Dynamic viewport & 6.9-inch thumb ergonomic floating joystick state
  private viewportMetrics: ViewportMetrics = { ...DEFAULT_VIEWPORT_METRICS };
  private touchPrefs: TouchControllerPreferences = {
    sizePreset: 'MEDIUM',
    opacity: 0.78
  };
  public virtualJoystickHomeOrigin: Vec2 = { x: 108, y: 432 };
  public virtualJoystickOrigin: Vec2 = { x: 108, y: 432 };
  public virtualJoystickKnob: Vec2 = { x: 108, y: 432 };
  public virtualJoystickActive: boolean = false;
  public virtualMoveVec: Vec2 = { x: 0, y: 0 };
  private joystickPointerId: number | null = null;
  private lastFormShiftTapMs = 0;
  private touchPendingSkill: number | null = null;
  private touchPendingDodge = false;
  private touchPendingFormShift = false;
  private touchPendingAwakening = false;
  private touchPendingSwap = false;
  public forceShowTouchUi = false;

  constructor(private platform: PlatformAdapter) {
    this.bindings = loadKeyBindings(platform);
    this.touchPrefs = loadTouchPreferences(platform);
    this.updateViewportMetrics(DEFAULT_VIEWPORT_METRICS);
    this.attachWindowListeners();
  }

  public dispose(): void {
    this.listenerAbort.abort();
    this.resetTransientInputState(true);
  }

  public getTouchPrefs(): TouchControllerPreferences {
    return { ...this.touchPrefs };
  }

  public getTouchScale(): number {
    return TOUCH_SIZE_SCALE_MAP[this.touchPrefs.sizePreset];
  }

  public setTouchButtonSize(preset: TouchButtonSizePreset): void {
    this.touchPrefs.sizePreset = preset;
    saveTouchPreferences(this.platform, this.touchPrefs);
    this.updateViewportMetrics(this.viewportMetrics);
  }

  public setTouchOpacity(opacity: number): void {
    this.touchPrefs.opacity = clamp(opacity, 0.35, 1.0);
    saveTouchPreferences(this.platform, this.touchPrefs);
  }

  public updateViewportMetrics(metrics: ViewportMetrics): void {
    this.viewportMetrics = metrics;
    const home = computeJoystickHomeOrigin(metrics, this.getTouchScale());
    this.virtualJoystickHomeOrigin = home;
    if (!this.virtualJoystickActive) {
      this.virtualJoystickOrigin = { ...home };
      this.virtualJoystickKnob = { ...home };
    }
  }

  public getViewportMetrics(): ViewportMetrics {
    return this.viewportMetrics;
  }

  public getBindings(): KeyBindingConfig {
    return { ...this.bindings };
  }

  public updateBinding(action: keyof KeyBindingConfig, code: string): void {
    this.bindings[action] = code;
    saveKeyBindings(this.platform, this.bindings);
  }

  public resetBindings(): void {
    this.bindings = { ...DEFAULT_KEY_BINDINGS };
    saveKeyBindings(this.platform, this.bindings);
  }

  public isTouchViewport(): boolean {
    if (this.forceShowTouchUi) return true;
    if (typeof window === 'undefined') return false;
    return (
      window.innerWidth <= 600 ||
      window.innerHeight > window.innerWidth ||
      navigator.maxTouchPoints > 0
    );
  }

  public getTouchButtons(
    metrics: ViewportMetrics = this.viewportMetrics
  ): TouchButtonRect[] {
    return computeTouchButtonLayout(metrics, this.getTouchScale());
  }

  public triggerVirtualAction(
    action: TouchButtonRect['id'] | 'AWAKENING'
  ): void {
    if (action === 'SKILL_0') this.touchPendingSkill = 0;
    else if (action === 'SKILL_1') this.touchPendingSkill = 1;
    else if (action === 'SKILL_2') this.touchPendingSkill = 2;
    else if (action === 'SKILL_3') this.touchPendingSkill = 3;
    else if (action === 'DODGE') this.touchPendingDodge = true;
    else if (action === 'FORM_SHIFT') {
      const now = this.platform.nowMs();
      if (now - this.lastFormShiftTapMs <= 380) {
        this.touchPendingAwakening = true;
      } else {
        this.touchPendingFormShift = true;
      }
      this.lastFormShiftTapMs = now;
    } else if (action === 'AWAKENING') this.touchPendingAwakening = true;
    else if (action === 'SWAP') this.touchPendingSwap = true;
  }

  public hitTestTouchButton(
    logicalPos: Vec2,
    metrics: ViewportMetrics = this.viewportMetrics
  ): TouchButtonRect['id'] | null {
    if (!this.isTouchViewport()) return null;
    return hitTestTouchButtonsList(logicalPos, this.getTouchButtons(metrics), 10);
  }

  /**
   * Hit-tests the bottom-center battle HUD skill slots, dodge card, form/awakening card,
   * and quick-swap banner so both touch and mouse players can tap/click them directly.
   */
  public hitTestBattleBottomHud(
    logicalPos: Vec2,
    totalSlots = 4,
    metrics: ViewportMetrics = this.viewportMetrics
  ): TouchButtonRect['id'] | 'AWAKENING' | null {
    return hitTestBattleBottomHudLayout(
      logicalPos,
      totalSlots,
      this.isTouchViewport(),
      metrics
    );
  }

  public handleCanvasPointerDown(logicalPos: Vec2, pointerId?: number): boolean {
    if (this.isTouchViewport()) {
      const hitBtn = hitTestTouchButtonsList(logicalPos, this.getTouchButtons(), 8);
      if (hitBtn) {
        this.triggerVirtualAction(hitBtn);
        return true;
      }
      const m = this.viewportMetrics;
      const safe = getSafeHudBounds(m);
      if (
        !this.virtualJoystickActive &&
        logicalPos.x <= safe.viewWidth * 0.42 &&
        logicalPos.y >= safe.viewHeight * 0.36
      ) {
        const s = this.getTouchScale();
        const pad = Math.round(52 * s);
        this.virtualJoystickOrigin = {
          x: Math.round(clamp(logicalPos.x, safe.left + pad, safe.viewWidth * 0.42)),
          y: Math.round(clamp(logicalPos.y, safe.viewHeight * 0.42, safe.bottom - pad))
        };
        this.virtualJoystickActive = true;
        this.joystickPointerId = pointerId ?? null;
        this.updateVirtualJoystick(logicalPos);
        return true;
      }
    }
    this.mouseLogicalPos = logicalPos;
    this.mouseDown = true;
    return false;
  }

  public handleCanvasPointerMove(logicalPos: Vec2, pointerId?: number): void {
    this.mouseLogicalPos = logicalPos;
    if (this.virtualJoystickActive) {
      if (
        this.joystickPointerId !== null &&
        pointerId !== undefined &&
        pointerId !== this.joystickPointerId
      ) {
        return;
      }
      this.updateVirtualJoystick(logicalPos);
    }
  }

  public handleCanvasPointerUp(pointerId?: number): void {
    if (
      this.virtualJoystickActive &&
      this.joystickPointerId !== null &&
      pointerId !== undefined &&
      pointerId !== this.joystickPointerId
    ) {
      return;
    }
    this.mouseDown = false;
    this.virtualJoystickActive = false;
    this.joystickPointerId = null;
    this.virtualJoystickOrigin = { ...this.virtualJoystickHomeOrigin };
    this.virtualJoystickKnob = { ...this.virtualJoystickHomeOrigin };
    this.virtualMoveVec = { x: 0, y: 0 };
  }

  private updateVirtualJoystick(pos: Vec2): void {
    const maxRadius = Math.round(46 * this.getTouchScale());
    const dx = pos.x - this.virtualJoystickOrigin.x;
    const dy = pos.y - this.virtualJoystickOrigin.y;
    const d = distVec(pos, this.virtualJoystickOrigin);
    if (d <= 0.0001) {
      this.virtualMoveVec = { x: 0, y: 0 };
      this.virtualJoystickKnob = { ...this.virtualJoystickOrigin };
      return;
    }
    this.virtualMoveVec =
      d > maxRadius
        ? { x: dx / d, y: dy / d }
        : { x: dx / maxRadius, y: dy / maxRadius };
    const knobDist = Math.min(d, maxRadius);
    this.virtualJoystickKnob = {
      x: this.virtualJoystickOrigin.x + (dx / d) * knobDist,
      y: this.virtualJoystickOrigin.y + (dy / d) * knobDist
    };
  }

  private attachWindowListeners(): void {
    if (typeof window === 'undefined') return;
    const { signal } = this.listenerAbort;

    window.addEventListener(
      'keydown',
      (e) => {
        const targetEl = e.target as HTMLElement | null;
        const tag = targetEl?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA') {
          return;
        }
        if (tag === 'SELECT') {
          targetEl?.blur();
        }
        if (!this.keysDown.has(e.code)) {
          this.keysJustPressed.add(e.code);
        }
        this.keysDown.add(e.code);
      },
      { signal }
    );

    window.addEventListener(
      'keyup',
      (e) => {
        this.keysDown.delete(e.code);
      },
      { signal }
    );

    window.addEventListener(
      'blur',
      () => {
        this.resetTransientInputState(true);
      },
      { signal }
    );
  }

  public resetTransientInputState(clearHeldKeys: boolean = false): void {
    if (clearHeldKeys) {
      this.keysDown.clear();
    }
    this.keysJustPressed.clear();
    this.mouseDown = false;
    this.virtualJoystickActive = false;
    this.joystickPointerId = null;
    this.virtualJoystickOrigin = { ...this.virtualJoystickHomeOrigin };
    this.virtualJoystickKnob = { ...this.virtualJoystickHomeOrigin };
    this.virtualMoveVec = { x: 0, y: 0 };
    this.clearOneShotPending();
  }

  private clearOneShotPending(): void {
    this.keysJustPressed.clear();
    this.touchPendingSkill = null;
    this.touchPendingDodge = false;
    this.touchPendingFormShift = false;
    this.touchPendingAwakening = false;
    this.touchPendingSwap = false;
  }

  public getExplorationMoveVector(): Vec2 {
    const move = sampleExplorationMoveVector(
      this.keysDown,
      this.bindings,
      this.virtualMoveVec
    );
    this.clearOneShotPending();
    return move;
  }

  public buildPlayerCommand(
    playerUnit: UnitRuntimeState | undefined,
    world: BattleWorldState,
    registry: GameDataRegistry
  ): UnitInputCommand | null {
    if (!playerUnit || !playerUnit.isAlive || !playerUnit.isOnField) {
      this.keysJustPressed.clear();
      return null;
    }

    const command = sampleBattlePlayerCommand(
      {
        keysDown: this.keysDown,
        keysJustPressed: this.keysJustPressed,
        bindings: this.bindings,
        virtualMoveVec: this.virtualMoveVec,
        touchPendingSkill: this.touchPendingSkill,
        touchPendingDodge: this.touchPendingDodge,
        touchPendingFormShift: this.touchPendingFormShift,
        touchPendingAwakening: this.touchPendingAwakening,
        touchPendingSwap: this.touchPendingSwap,
        mouseDown: this.mouseDown,
        mouseLogicalPos: this.mouseLogicalPos
      },
      playerUnit,
      world,
      registry
    );

    this.clearOneShotPending();
    return command;
  }
}
