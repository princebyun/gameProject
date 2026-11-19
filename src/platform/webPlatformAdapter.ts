import type { PlatformAdapter } from './platformAdapter';

export class WebPlatformAdapter implements PlatformAdapter {
  public readonly platformName = 'web-pwa' as const;
  private memoryFallback = new Map<string, string>();

  public getStorageItem(key: string): string | null {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        return window.localStorage.getItem(key);
      }
    } catch {
      // Fallback to in-memory storage if blocked
    }
    return this.memoryFallback.get(key) ?? null;
  }

  public setStorageItem(key: string, value: string): void {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(key, value);
        return;
      }
    } catch {
      // Fallback to in-memory storage
    }
    this.memoryFallback.set(key, value);
  }

  public removeStorageItem(key: string): void {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.removeItem(key);
      }
    } catch {
      // Ignore storage error
    }
    this.memoryFallback.delete(key);
  }

  public isFullscreen(): boolean {
    if (typeof document === 'undefined') {
      return false;
    }
    return Boolean(document.fullscreenElement);
  }

  public async toggleFullscreen(targetElement?: HTMLElement): Promise<boolean> {
    if (typeof document === 'undefined') {
      return false;
    }
    try {
      if (!document.fullscreenElement) {
        const el = targetElement ?? document.documentElement;
        await el.requestFullscreen();
        return true;
      } else {
        await document.exitFullscreen();
        return false;
      }
    } catch {
      return false;
    }
  }

  public vibrate(durationMs: number | number[]): void {
    try {
      if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        navigator.vibrate(durationMs);
      }
    } catch {
      // Ignore if vibration is unsupported
    }
  }

  public nowMs(): number {
    if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
      return performance.now();
    }
    return Date.now();
  }

  public exportJsonFile(filename: string, jsonContent: string): void {
    if (typeof document === 'undefined' || typeof Blob === 'undefined') {
      return;
    }
    const blob = new Blob([jsonContent], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }
}
