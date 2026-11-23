import type { PlatformAdapter } from '../../platform/platformAdapter';
import type { ActiveAppScene } from '../sceneTypes';

export const BATTLE_SPEED_PRESETS = [0.5, 0.75, 1, 1.25] as const;
export type BattleSpeedScale = (typeof BATTLE_SPEED_PRESETS)[number];
export const DEFAULT_BATTLE_SPEED_SCALE: BattleSpeedScale = 0.75;
export const BATTLE_SPEED_STORAGE_KEY = 'opgv_battle_speed_v1';

export function normalizeBattleSpeedScale(raw: unknown): BattleSpeedScale {
  const num = typeof raw === 'number' ? raw : Number(raw);
  if (!Number.isFinite(num)) {
    return DEFAULT_BATTLE_SPEED_SCALE;
  }
  let best: BattleSpeedScale = DEFAULT_BATTLE_SPEED_SCALE;
  let bestDiff = Number.POSITIVE_INFINITY;
  for (const preset of BATTLE_SPEED_PRESETS) {
    const diff = Math.abs(preset - num);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = preset;
    }
  }
  return best;
}

export function loadBattleSpeedScale(platform: PlatformAdapter): BattleSpeedScale {
  try {
    const raw = platform.getStorageItem(BATTLE_SPEED_STORAGE_KEY);
    if (!raw) return DEFAULT_BATTLE_SPEED_SCALE;
    return normalizeBattleSpeedScale(raw);
  } catch {
    return DEFAULT_BATTLE_SPEED_SCALE;
  }
}

export function saveBattleSpeedScale(
  platform: PlatformAdapter,
  scale: BattleSpeedScale
): void {
  try {
    platform.setStorageItem(BATTLE_SPEED_STORAGE_KEY, String(scale));
  } catch {
    // Ignore storage quota / sandbox write errors
  }
}

export function cycleBattleSpeedScale(current: BattleSpeedScale): BattleSpeedScale {
  const idx = BATTLE_SPEED_PRESETS.indexOf(current);
  const nextIdx = idx < 0 ? 0 : (idx + 1) % BATTLE_SPEED_PRESETS.length;
  return BATTLE_SPEED_PRESETS[nextIdx] ?? DEFAULT_BATTLE_SPEED_SCALE;
}

export function stepBattleSpeedScale(
  current: BattleSpeedScale,
  delta: -1 | 1
): BattleSpeedScale {
  const idx = BATTLE_SPEED_PRESETS.indexOf(current);
  const baseIdx = idx < 0 ? BATTLE_SPEED_PRESETS.indexOf(DEFAULT_BATTLE_SPEED_SCALE) : idx;
  const clamped = Math.max(0, Math.min(BATTLE_SPEED_PRESETS.length - 1, baseIdx + delta));
  return BATTLE_SPEED_PRESETS[clamped] ?? DEFAULT_BATTLE_SPEED_SCALE;
}

export function formatBattleSpeedLabel(scale: BattleSpeedScale): string {
  if (scale === 1) return '1.0x';
  return `${scale}x`;
}

export function isOfflineSpeedAdjustableScene(scene: ActiveAppScene): boolean {
  return scene === 'STORY_BATTLE' || scene === 'SANDBOX';
}

export function computeEffectiveLoopDt(
  frameDtSec: number,
  activeScene: ActiveAppScene,
  speedScale: BattleSpeedScale,
  isPaused: boolean
): number {
  if (!isOfflineSpeedAdjustableScene(activeScene)) {
    return frameDtSec;
  }
  if (isPaused) {
    return 0;
  }
  return frameDtSec * normalizeBattleSpeedScale(speedScale);
}
