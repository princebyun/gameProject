import { clamp, distVec, lenVec, normalizeVec, subVec, type Vec2 } from '../core/math/vector2';
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
import {
  DEFAULT_KEY_BINDINGS,
  loadKeyBindings,
  saveKeyBindings,
  type KeyBindingConfig
} from './keyBindings';

export type TouchButtonSizePreset = 'SMALL' | 'MEDIUM' | 'LARGE';

export interface TouchControllerPreferences {
  sizePreset: TouchButtonSizePreset;
  opacity: number; // 0.35 ~ 1.0
}

export const TOUCH_SIZE_SCALE_MAP: Record<TouchButtonSizePreset, number> = {
  SMALL: 0.85,
  MEDIUM: 1.0,
  LARGE: 1.2
};

const TOUCH_PREFS_STORAGE_KEY = 'opgv_touch_prefs_v1';

export interface TouchButtonRect {
  id: 'SKILL_0' | 'SKILL_1' | 'SKILL_2' | 'SKILL_3' | 'DODGE' | 'FORM_SHIFT' | 'SWAP';
  label: string;
  subLabel: string;
  x: number;
  y: number;
  r: number;
  color: string;
}

export class UnifiedInputManager {
  private bindings: KeyBindingConfig;
  private keysDown = new Set<string>();
  private keysJustPressed = new Set<string>();
  private mouseLogicalPos: Vec2 | null = null;
  private mouseDown = false;

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
  private touchPendingSkill: number | null = null;
  private touchPendingDodge = false;
  private touchPendingFormShift = false;
  private touchPendingAwakening = false;
  private touchPendingSwap = false;
  public forceShowTouchUi = false;

  constructor(private platform: PlatformAdapter) {
    this.bindings = loadKeyBindings(platform);
    this.touchPrefs = this.loadTouchPrefs();
    this.updateViewportMetrics(DEFAULT_VIEWPORT_METRICS);
    this.attachWindowListeners();
  }

  private loadTouchPrefs(): TouchControllerPreferences {
    try {
      const raw = this.platform.getStorageItem(TOUCH_PREFS_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<TouchControllerPreferences>;
        const preset: TouchButtonSizePreset =
          parsed.sizePreset === 'SMALL' ||
          parsed.sizePreset === 'MEDIUM' ||
          parsed.sizePreset === 'LARGE'
            ? parsed.sizePreset
            : 'MEDIUM';
        const opacity =
          typeof parsed.opacity === 'number'
            ? clamp(parsed.opacity, 0.35, 1.0)
            : 0.78;
        return { sizePreset: preset, opacity };
      }
    } catch {
      // ignore storage errors
    }
    return { sizePreset: 'MEDIUM', opacity: 0.78 };
  }

  public getTouchPrefs(): TouchControllerPreferences {
    return { ...this.touchPrefs };
  }

  public getTouchScale(): number {
    return TOUCH_SIZE_SCALE_MAP[this.touchPrefs.sizePreset];
  }

  public setTouchButtonSize(preset: TouchButtonSizePreset): void {
    this.touchPrefs.sizePreset = preset;
    this.platform.setStorageItem(
      TOUCH_PREFS_STORAGE_KEY,
      JSON.stringify(this.touchPrefs)
    );
    this.updateViewportMetrics(this.viewportMetrics);
  }

  public setTouchOpacity(opacity: number): void {
    this.touchPrefs.opacity = clamp(opacity, 0.35, 1.0);
    this.platform.setStorageItem(
      TOUCH_PREFS_STORAGE_KEY,
      JSON.stringify(this.touchPrefs)
    );
  }

  public updateViewportMetrics(metrics: ViewportMetrics): void {
    this.viewportMetrics = metrics;
    const s = this.getTouchScale();
    const { left: safeL, bottom: safeB } = metrics.safeInsets;
    const homeX = Math.round(safeL + Math.max(82, 96 * s));
    const homeY = Math.round(metrics.viewHeight - safeB - Math.max(82, 92 * s));
    this.virtualJoystickHomeOrigin = { x: homeX, y: homeY };
    if (!this.virtualJoystickActive) {
      this.virtualJoystickOrigin = { x: homeX, y: homeY };
      this.virtualJoystickKnob = { x: homeX, y: homeY };
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
    // 6.9-inch thumb-ergonomic fan-shaped action layout anchored inside Safe Area
    const s = this.getTouchScale();
    const { right: safeR, bottom: safeB, top: safeT, left: safeL } = metrics.safeInsets;
    const anchorX = metrics.viewWidth - safeR - Math.round(74 * s);
    const anchorY = metrics.viewHeight - safeB - Math.round(68 * s);

    const raw: TouchButtonRect[] = [
      {
        id: 'SKILL_0',
        label: '공격',
        subLabel: 'S1',
        x: anchorX,
        y: anchorY,
        r: Math.round(31 * s),
        color: '#38bdf8'
      },
      {
        id: 'DODGE',
        label: '회피',
        subLabel: 'DODGE',
        x: Math.round(anchorX - 78 * s),
        y: Math.round(anchorY + 10 * s),
        r: Math.round(27 * s),
        color: '#2dd4bf'
      },
      {
        id: 'SKILL_1',
        label: 'S2',
        subLabel: '스킬2',
        x: Math.round(anchorX - 72 * s),
        y: Math.round(anchorY - 46 * s),
        r: Math.round(25 * s),
        color: '#38bdf8'
      },
      {
        id: 'SKILL_2',
        label: 'S3',
        subLabel: '스킬3',
        x: Math.round(anchorX - 24 * s),
        y: Math.round(anchorY - 78 * s),
        r: Math.round(25 * s),
        color: '#38bdf8'
      },
      {
        id: 'SKILL_3',
        label: 'S4',
        subLabel: '스킬4',
        x: Math.round(anchorX + 34 * s),
        y: Math.round(anchorY - 68 * s),
        r: Math.round(25 * s),
        color: '#38bdf8'
      },
      {
        id: 'FORM_SHIFT',
        label: '각성',
        subLabel: 'FORM',
        x: Math.round(anchorX - 122 * s),
        y: Math.round(anchorY - 82 * s),
        r: Math.round(23 * s),
        color: '#f59e0b'
      },
      {
        id: 'SWAP',
        label: '교체',
        subLabel: 'TAG',
        x: Math.round(anchorX + 36 * s),
        y: Math.round(anchorY - 126 * s),
        r: Math.round(22 * s),
        color: '#c084fc'
      }
    ];

    // Clamp every button strictly inside Safe Area bounds so punch-holes & corners never clip buttons
    return raw.map((btn) => ({
      ...btn,
      x: Math.round(
        clamp(btn.x, safeL + btn.r + 6, metrics.viewWidth - safeR - btn.r - 6)
      ),
      y: Math.round(
        clamp(btn.y, safeT + btn.r + 6, metrics.viewHeight - safeB - btn.r - 6)
      )
    }));
  }

  public triggerVirtualAction(
    action: TouchButtonRect['id'] | 'AWAKENING'
  ): void {
    if (action === 'SKILL_0') this.touchPendingSkill = 0;
    else if (action === 'SKILL_1') this.touchPendingSkill = 1;
    else if (action === 'SKILL_2') this.touchPendingSkill = 2;
    else if (action === 'SKILL_3') this.touchPendingSkill = 3;
    else if (action === 'DODGE') this.touchPendingDodge = true;
    else if (action === 'FORM_SHIFT') this.touchPendingFormShift = true;
    else if (action === 'AWAKENING') this.touchPendingAwakening = true;
    else if (action === 'SWAP') this.touchPendingSwap = true;
  }

  public handleCanvasPointerDown(logicalPos: Vec2): boolean {
    if (this.isTouchViewport()) {
      for (const btn of this.getTouchButtons()) {
        if (distVec(logicalPos, { x: btn.x, y: btn.y }) <= btn.r + 8) {
          this.triggerVirtualAction(btn.id);
          return true;
        }
      }
      // Left-bottom floating joystick zone
      const m = this.viewportMetrics;
      if (logicalPos.x <= m.viewWidth * 0.42 && logicalPos.y >= m.viewHeight * 0.36) {
        const s = this.getTouchScale();
        const pad = Math.round(52 * s);
        this.virtualJoystickOrigin = {
          x: Math.round(
            clamp(logicalPos.x, m.safeInsets.left + pad, m.viewWidth * 0.42)
          ),
          y: Math.round(
            clamp(logicalPos.y, m.viewHeight * 0.42, m.viewHeight - m.safeInsets.bottom - pad)
          )
        };
        this.virtualJoystickActive = true;
        this.updateVirtualJoystick(logicalPos);
        return true;
      }
    }
    this.mouseLogicalPos = logicalPos;
    this.mouseDown = true;
    return false;
  }

  public handleCanvasPointerMove(logicalPos: Vec2): void {
    this.mouseLogicalPos = logicalPos;
    if (this.virtualJoystickActive) {
      this.updateVirtualJoystick(logicalPos);
    }
  }

  public handleCanvasPointerUp(): void {
    this.mouseDown = false;
    this.virtualJoystickActive = false;
    this.virtualJoystickOrigin = { ...this.virtualJoystickHomeOrigin };
    this.virtualJoystickKnob = { ...this.virtualJoystickHomeOrigin };
    this.virtualMoveVec = { x: 0, y: 0 };
  }

  private updateVirtualJoystick(pos: Vec2): void {
    const maxRadius = Math.round(46 * this.getTouchScale());
    const delta = subVec(pos, this.virtualJoystickOrigin);
    const d = lenVec(delta);
    const clamped = d > maxRadius ? normalizeVec(delta) : { x: delta.x / maxRadius, y: delta.y / maxRadius };
    this.virtualMoveVec = clamped;
    const knobDist = Math.min(d, maxRadius);
    const dir = normalizeVec(delta, { x: 0, y: 0 });
    this.virtualJoystickKnob = {
      x: this.virtualJoystickOrigin.x + dir.x * knobDist,
      y: this.virtualJoystickOrigin.y + dir.y * knobDist
    };
  }

  private attachWindowListeners(): void {
    if (typeof window === 'undefined') return;

    window.addEventListener('keydown', (e) => {
      const tag = (e.target as HTMLElement | null)?.tagName;
      if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') {
        return;
      }
      if (!this.keysDown.has(e.code)) {
        this.keysJustPressed.add(e.code);
      }
      this.keysDown.add(e.code);
    });

    window.addEventListener('keyup', (e) => {
      this.keysDown.delete(e.code);
    });

    window.addEventListener('blur', () => {
      this.keysDown.clear();
      this.keysJustPressed.clear();
    });
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

    // 1. Movement vector from Keyboard + Gamepad + Virtual Joystick
    let mx = 0;
    let my = 0;

    if (this.keysDown.has(this.bindings.moveUp) || this.keysDown.has('ArrowUp')) my -= 1;
    if (this.keysDown.has(this.bindings.moveDown) || this.keysDown.has('ArrowDown')) my += 1;
    if (this.keysDown.has(this.bindings.moveLeft) || this.keysDown.has('ArrowLeft')) mx -= 1;
    if (this.keysDown.has(this.bindings.moveRight) || this.keysDown.has('ArrowRight')) mx += 1;

    if (lenVec(this.virtualMoveVec) > 0.08) {
      mx += this.virtualMoveVec.x;
      my += this.virtualMoveVec.y;
    }

    // Poll Gamepad API if connected
    let gamepadAim: Vec2 | null = null;
    let gpSkill: number | null = null;
    let gpDodge = false;
    let gpFormShift = false;
    let gpSwap = false;

    if (typeof navigator !== 'undefined' && typeof navigator.getGamepads === 'function') {
      const pads = navigator.getGamepads();
      const pad = pads?.[0];
      if (pad) {
        if (Math.abs(pad.axes[0]) > 0.18) mx += pad.axes[0];
        if (Math.abs(pad.axes[1]) > 0.18) my += pad.axes[1];
        if (Math.hypot(pad.axes[2] ?? 0, pad.axes[3] ?? 0) > 0.25) {
          gamepadAim = normalizeVec({ x: pad.axes[2], y: pad.axes[3] });
        }
        if (pad.buttons[0]?.pressed) gpSkill = 0;
        if (pad.buttons[1]?.pressed) gpSkill = 1;
        if (pad.buttons[2]?.pressed) gpSkill = 2;
        if (pad.buttons[3]?.pressed) gpSkill = 3;
        if (pad.buttons[4]?.pressed || pad.buttons[6]?.pressed) gpDodge = true;
        if (pad.buttons[11]?.pressed || pad.buttons[5]?.pressed) gpFormShift = true;
        if (pad.buttons[7]?.pressed) gpSwap = true;
      }
    }

    const moveVec = lenVec({ x: mx, y: my }) > 0.05 ? normalizeVec({ x: mx, y: my }) : { x: 0, y: 0 };

    // 2. Skill slot activation
    let castMoveSlotIndex: number | null = null;
    if (this.keysJustPressed.has(this.bindings.skill1)) castMoveSlotIndex = 0;
    else if (this.keysJustPressed.has(this.bindings.skill2)) castMoveSlotIndex = 1;
    else if (this.keysJustPressed.has(this.bindings.skill3)) castMoveSlotIndex = 2;
    else if (this.keysJustPressed.has(this.bindings.skill4)) castMoveSlotIndex = 3;
    else if (this.touchPendingSkill !== null) castMoveSlotIndex = this.touchPendingSkill;
    else if (gpSkill !== null) castMoveSlotIndex = gpSkill;

    const dodgePressed =
      this.keysJustPressed.has(this.bindings.dodge) ||
      this.touchPendingDodge ||
      gpDodge;

    const shiftHeld =
      this.keysDown.has('ShiftLeft') || this.keysDown.has('ShiftRight');
    const rawFormKey = this.keysJustPressed.has(this.bindings.formShift);

    const awakeningPressed =
      (rawFormKey && shiftHeld) ||
      this.keysJustPressed.has('KeyG') ||
      this.touchPendingAwakening;

    const formShiftPressed =
      (rawFormKey && !shiftHeld) ||
      this.touchPendingFormShift ||
      gpFormShift;

    let swapToBenchUnitId: string | null = null;
    if (
      this.keysJustPressed.has(this.bindings.quickSwap) ||
      this.touchPendingSwap ||
      gpSwap
    ) {
      const benchUnit = world.units.find(
        (u) => u.team === playerUnit.team && !u.isOnField && u.isAlive
      );
      if (benchUnit) {
        swapToBenchUnitId = benchUnit.instanceId;
      }
    }

    // 3. Aim vector logic:
    // - Gamepad right stick takes manual aim priority
    // - For dash/placement skills, prioritize movement direction if held
    // - Otherwise auto-aim at the nearest alive enemy on field
    let aimVec: Vec2 | null = null;
    const selectedMoveId =
      castMoveSlotIndex !== null
        ? playerUnit.moveSlots[castMoveSlotIndex]?.moveId
        : null;
    const selectedMoveDef = selectedMoveId ? registry.moves[selectedMoveId] : null;
    const isDashOrPlacement =
      selectedMoveDef?.meleeSpec?.subtype === 'DASH' ||
      selectedMoveDef?.archetype === 'AOE_FIELD';

    if (gamepadAim) {
      aimVec = gamepadAim;
    } else if (isDashOrPlacement && lenVec(moveVec) > 0.1) {
      aimVec = moveVec;
    } else {
      // Nearest enemy auto-aim
      let nearestEnemy: UnitRuntimeState | null = null;
      let nearestDist = Infinity;
      for (const u of world.units) {
        if (!u.isAlive || !u.isOnField || u.team === playerUnit.team) continue;
        const d = distVec(playerUnit.pos, u.pos);
        if (d < nearestDist) {
          nearestDist = d;
          nearestEnemy = u;
        }
      }
      if (nearestEnemy) {
        aimVec = normalizeVec(subVec(nearestEnemy.pos, playerUnit.pos), playerUnit.aimDir);
      } else if (lenVec(moveVec) > 0.1) {
        aimVec = moveVec;
      } else if (this.mouseDown && this.mouseLogicalPos) {
        aimVec = normalizeVec(subVec(this.mouseLogicalPos, playerUnit.pos), playerUnit.aimDir);
      }
    }

    // Clear one-shot input flags
    this.keysJustPressed.clear();
    this.touchPendingSkill = null;
    this.touchPendingDodge = false;
    this.touchPendingFormShift = false;
    this.touchPendingAwakening = false;
    this.touchPendingSwap = false;

    return {
      unitId: playerUnit.instanceId,
      moveVec,
      aimVec,
      castMoveSlotIndex,
      dodgePressed,
      formShiftPressed,
      awakeningPressed,
      swapToBenchUnitId
    };
  }
}
