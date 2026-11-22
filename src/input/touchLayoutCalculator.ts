import { clamp, distVec, type Vec2 } from '../core/math/vector2';
import type { PlatformAdapter } from '../platform/platformAdapter';
import type { ViewportMetrics } from '../render/viewport/responsiveViewportManager';
import { getSafeHudBounds, isPointInBottomSafeBand } from '../render/viewport/safeAreaLayout';

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

export const TOUCH_PREFS_STORAGE_KEY = 'opgv_touch_prefs_v1';

export interface TouchButtonRect {
  id: 'SKILL_0' | 'SKILL_1' | 'SKILL_2' | 'SKILL_3' | 'DODGE' | 'FORM_SHIFT' | 'SWAP';
  label: string;
  subLabel: string;
  x: number;
  y: number;
  r: number;
  color: string;
}

export function loadTouchPreferences(platform: PlatformAdapter): TouchControllerPreferences {
  try {
    const raw = platform.getStorageItem(TOUCH_PREFS_STORAGE_KEY);
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

export function saveTouchPreferences(
  platform: PlatformAdapter,
  prefs: TouchControllerPreferences
): void {
  platform.setStorageItem(TOUCH_PREFS_STORAGE_KEY, JSON.stringify(prefs));
}

export function computeJoystickHomeOrigin(metrics: ViewportMetrics, scale: number): Vec2 {
  const safe = getSafeHudBounds(metrics);
  return {
    x: Math.round(safe.left + Math.max(82, 96 * scale)),
    y: Math.round(safe.bottom - Math.max(82, 92 * scale))
  };
}

export function computeTouchButtonLayout(
  metrics: ViewportMetrics,
  scale: number
): TouchButtonRect[] {
  const safe = getSafeHudBounds(metrics);
  const anchorX = safe.right - Math.round(74 * scale);
  const anchorY = safe.bottom - Math.round(68 * scale);

  const raw: TouchButtonRect[] = [
    {
      id: 'SKILL_0',
      label: '공격',
      subLabel: 'S1',
      x: anchorX,
      y: anchorY,
      r: Math.round(31 * scale),
      color: '#38bdf8'
    },
    {
      id: 'DODGE',
      label: '회피',
      subLabel: 'DODGE',
      x: Math.round(anchorX - 78 * scale),
      y: Math.round(anchorY + 10 * scale),
      r: Math.round(27 * scale),
      color: '#2dd4bf'
    },
    {
      id: 'SKILL_1',
      label: 'S2',
      subLabel: '스킬2',
      x: Math.round(anchorX - 72 * scale),
      y: Math.round(anchorY - 46 * scale),
      r: Math.round(25 * scale),
      color: '#38bdf8'
    },
    {
      id: 'SKILL_2',
      label: 'S3',
      subLabel: '스킬3',
      x: Math.round(anchorX - 24 * scale),
      y: Math.round(anchorY - 78 * scale),
      r: Math.round(25 * scale),
      color: '#38bdf8'
    },
    {
      id: 'SKILL_3',
      label: 'S4',
      subLabel: '스킬4',
      x: Math.round(anchorX + 34 * scale),
      y: Math.round(anchorY - 68 * scale),
      r: Math.round(25 * scale),
      color: '#38bdf8'
    },
    {
      id: 'FORM_SHIFT',
      label: '각성',
      subLabel: 'FORM',
      x: Math.round(anchorX - 122 * scale),
      y: Math.round(anchorY - 82 * scale),
      r: Math.round(23 * scale),
      color: '#f59e0b'
    },
    {
      id: 'SWAP',
      label: '교체',
      subLabel: 'TAG',
      x: Math.round(anchorX + 36 * scale),
      y: Math.round(anchorY - 126 * scale),
      r: Math.round(22 * scale),
      color: '#c084fc'
    }
  ];

  // Clamp every button strictly inside Safe Area bounds so punch-holes & corners never clip buttons
  return raw.map((btn) => ({
    ...btn,
    x: Math.round(clamp(btn.x, safe.left + btn.r + 6, safe.right - btn.r - 6)),
    y: Math.round(clamp(btn.y, safe.top + btn.r + 6, safe.bottom - btn.r - 6))
  }));
}

export function hitTestTouchButtonsList(
  logicalPos: Vec2,
  buttons: TouchButtonRect[],
  extraRadiusPx: number
): TouchButtonRect['id'] | null {
  for (const btn of buttons) {
    if (distVec(logicalPos, { x: btn.x, y: btn.y }) <= btn.r + extraRadiusPx) {
      return btn.id;
    }
  }
  return null;
}

export function hitTestBattleBottomHudLayout(
  logicalPos: Vec2,
  totalSlots: number,
  isTouch: boolean,
  metrics: ViewportMetrics
): TouchButtonRect['id'] | 'AWAKENING' | null {
  if (totalSlots <= 0) return null;
  const safe = getSafeHudBounds(metrics);
  const slotWidth = isTouch ? 84 : 118;
  const slotHeight = 44;
  const gap = 6;
  const totalW = totalSlots * slotWidth + (totalSlots - 1) * gap;
  const startX = Math.round((safe.viewWidth - totalW) * 0.5);
  const y = safe.bottom - slotHeight - 8;

  if (
    logicalPos.x >= safe.centerX - 135 &&
    logicalPos.x <= safe.centerX + 135 &&
    logicalPos.y >= y - 28 &&
    logicalPos.y <= y - 4
  ) {
    return 'SWAP';
  }

  if (isPointInBottomSafeBand(metrics, logicalPos.y, slotHeight + 8) && logicalPos.y >= y && logicalPos.y <= y + slotHeight) {
    for (let idx = 0; idx < totalSlots; idx++) {
      const sx = startX + idx * (slotWidth + gap);
      if (logicalPos.x >= sx && logicalPos.x <= sx + slotWidth) {
        const actions: TouchButtonRect['id'][] = ['SKILL_0', 'SKILL_1', 'SKILL_2', 'SKILL_3'];
        return actions[idx] ?? null;
      }
    }
    if (!isTouch) {
      const dx = startX - 96;
      if (logicalPos.x >= dx && logicalPos.x <= dx + 90) {
        return 'DODGE';
      }
      const fx = startX + totalW + 6;
      if (logicalPos.x >= fx && logicalPos.x <= fx + 122) {
        return 'FORM_SHIFT';
      }
    }
  }
  return null;
}
