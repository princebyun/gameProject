import type { PlatformAdapter } from '../platform/platformAdapter';

export interface KeyBindingConfig {
  moveUp: string;
  moveDown: string;
  moveLeft: string;
  moveRight: string;
  skill1: string;
  skill2: string;
  skill3: string;
  skill4: string;
  dodge: string;
  formShift: string;
  quickSwap: string;
}

export const DEFAULT_KEY_BINDINGS: KeyBindingConfig = {
  moveUp: 'KeyW',
  moveDown: 'KeyS',
  moveLeft: 'KeyA',
  moveRight: 'KeyD',
  skill1: 'Digit1',
  skill2: 'Digit2',
  skill3: 'Digit3',
  skill4: 'Digit4',
  dodge: 'Space',
  formShift: 'KeyF',
  quickSwap: 'KeyQ'
};

const STORAGE_KEY = 'aether_clash_key_bindings_v1';

export function loadKeyBindings(platform: PlatformAdapter): KeyBindingConfig {
  const raw = platform.getStorageItem(STORAGE_KEY);
  if (!raw) {
    return { ...DEFAULT_KEY_BINDINGS };
  }
  try {
    const parsed = JSON.parse(raw) as Partial<KeyBindingConfig>;
    return { ...DEFAULT_KEY_BINDINGS, ...parsed };
  } catch {
    return { ...DEFAULT_KEY_BINDINGS };
  }
}

export function saveKeyBindings(
  platform: PlatformAdapter,
  bindings: KeyBindingConfig
): void {
  platform.setStorageItem(STORAGE_KEY, JSON.stringify(bindings));
}
