import type { UnifiedInputManager } from '../input/inputManager';

export function renderTouchOverlay(
  ctx: CanvasRenderingContext2D,
  input: UnifiedInputManager
): void {
  if (!input.isTouchViewport()) {
    return;
  }

  ctx.save();

  // 1. Bottom-Left Virtual Joystick
  const origin = input.virtualJoystickOrigin;
  const knob = input.virtualJoystickKnob;

  ctx.fillStyle = 'rgba(15, 23, 42, 0.55)';
  ctx.beginPath();
  ctx.arc(origin.x, origin.y, 48, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.75)';
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.fillStyle = 'rgba(56, 189, 248, 0.85)';
  ctx.beginPath();
  ctx.arc(knob.x, knob.y, 20, 0, Math.PI * 2);
  ctx.fill();

  // 2. Bottom-Right Fixed Action Buttons
  const buttons = input.getTouchButtons();
  for (const btn of buttons) {
    ctx.fillStyle = 'rgba(15, 23, 42, 0.72)';
    ctx.beginPath();
    ctx.arc(btn.x, btn.y, btn.r, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = btn.color;
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#f8fafc';
    ctx.fillText(btn.label, btn.x, btn.y - 1);

    ctx.font = '8px monospace';
    ctx.fillStyle = btn.color;
    ctx.fillText(btn.subLabel, btn.x, btn.y + 10);
  }

  ctx.restore();
}
