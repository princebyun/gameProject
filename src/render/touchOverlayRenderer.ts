import type { UnifiedInputManager } from '../input/inputManager';

export type TouchOverlayMode = 'BATTLE' | 'ISLAND' | 'SEA';

export function renderTouchOverlay(
  ctx: CanvasRenderingContext2D,
  input: UnifiedInputManager,
  mode: TouchOverlayMode = 'BATTLE',
  hasNearbyInteractable: boolean = false
): void {
  if (!input.isTouchViewport()) {
    return;
  }

  const prefs = input.getTouchPrefs();
  const scale = input.getTouchScale();

  ctx.save();
  ctx.globalAlpha = prefs.opacity;

  // 1. Bottom-Left Floating Virtual Joystick (6.9-inch thumb ergonomic)
  const origin = input.virtualJoystickOrigin;
  const knob = input.virtualJoystickKnob;
  const outerR = Math.round(48 * scale);
  const knobR = Math.round(20 * scale);

  ctx.fillStyle = input.virtualJoystickActive
    ? 'rgba(14, 165, 233, 0.25)'
    : 'rgba(15, 23, 42, 0.55)';
  ctx.beginPath();
  ctx.arc(origin.x, origin.y, outerR, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = input.virtualJoystickActive
    ? 'rgba(125, 211, 252, 0.95)'
    : 'rgba(56, 189, 248, 0.72)';
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.fillStyle = 'rgba(56, 189, 248, 0.88)';
  ctx.beginPath();
  ctx.arc(knob.x, knob.y, knobR, 0, Math.PI * 2);
  ctx.fill();

  // 2. Bottom-Right Ergonomic Action Buttons (context-aware for BATTLE vs ISLAND/SEA)
  const buttons = input.getTouchButtons();
  for (const btn of buttons) {
    if (mode !== 'BATTLE') {
      if (btn.id !== 'SKILL_0' && !(mode === 'SEA' && btn.id === 'DODGE')) {
        continue;
      }
    }

    let label = btn.label;
    let subLabel = btn.subLabel;
    let color = btn.color;
    let fill = 'rgba(15, 23, 42, 0.76)';

    if (mode !== 'BATTLE' && btn.id === 'SKILL_0') {
      label = hasNearbyInteractable ? '상호작용' : '확인';
      subLabel = mode === 'SEA' ? '입항/관문' : '대화/조사';
      color = hasNearbyInteractable ? '#facc15' : '#38bdf8';
      fill = hasNearbyInteractable
        ? 'rgba(180, 83, 9, 0.88)'
        : 'rgba(15, 23, 42, 0.78)';
    } else if (mode === 'SEA' && btn.id === 'DODGE') {
      label = '가속';
      subLabel = 'BURST';
      color = '#2dd4bf';
    }

    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.arc(btn.x, btn.y, btn.r, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = color;
    ctx.lineWidth = hasNearbyInteractable && mode !== 'BATTLE' && btn.id === 'SKILL_0' ? 3 : 2;
    ctx.stroke();

    ctx.font = `bold ${Math.max(10, Math.round(11 * scale))}px monospace`;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#f8fafc';
    ctx.fillText(label, btn.x, btn.y - 1);

    ctx.font = `${Math.max(7, Math.round(8 * scale))}px monospace`;
    ctx.fillStyle = color;
    ctx.fillText(subLabel, btn.x, btn.y + Math.round(10 * scale));
  }

  ctx.restore();
}
