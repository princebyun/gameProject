export interface PlatformAdapter {
  readonly platformName: 'web-pwa' | 'desktop-wrapper' | 'mobile-wrapper';
  getStorageItem(key: string): string | null;
  setStorageItem(key: string, value: string): void;
  removeStorageItem(key: string): void;
  isFullscreen(): boolean;
  toggleFullscreen(targetElement?: HTMLElement): Promise<boolean>;
  vibrate(durationMs: number | number[]): void;
  nowMs(): number;
  exportJsonFile(filename: string, jsonContent: string): void;
}
