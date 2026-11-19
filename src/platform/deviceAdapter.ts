import { App } from '@capacitor/app';
import { Haptics, ImpactStyle } from '@capacitor/haptics';
import { ScreenOrientation } from '@capacitor/screen-orientation';
import { StatusBar } from '@capacitor/status-bar';
import type {
  ElectronDisplayMode,
  ElectronPreloadBridge
} from './storage/electronFileStorageAdapter';

export type WindowDisplayMode = ElectronDisplayMode; // 'windowed' | 'fullscreen' | 'borderless'
export type HapticFeedbackKind = 'clash' | 'just_dodge' | 'awakening' | 'ui_tap';

export interface BackButtonHandlingResult {
  /** True if an open modal or active battle pause menu handled the back press */
  handledByScene: boolean;
}

export type HardwareBackCallback = () => BackButtonHandlingResult;
export type ToastNotificationCallback = (message: string) => void;

export interface DeviceAdapter {
  readonly supportsWindowDisplayModes: boolean;
  init(): Promise<void>;
  getDisplayMode(): Promise<WindowDisplayMode>;
  setDisplayMode(mode: WindowDisplayMode): Promise<WindowDisplayMode>;
  toggleFullscreen(targetElement?: HTMLElement): Promise<boolean>;
  isHapticsEnabled(): boolean;
  setHapticsEnabled(enabled: boolean): void;
  triggerHaptic(kind: HapticFeedbackKind): Promise<void>;
  onHardwareBack(
    handler: HardwareBackCallback,
    onToast?: ToastNotificationCallback
  ): void;
  requestQuitWithConfirmation(): Promise<boolean>;
}

function attachGlobalFullscreenShortcuts(toggleFn: () => void): void {
  if (typeof window === 'undefined') return;
  window.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'F11' || (e.altKey && e.key === 'Enter')) {
      e.preventDefault();
      toggleFn();
    }
  });
}

export class WebDeviceAdapter implements DeviceAdapter {
  public readonly supportsWindowDisplayModes = false;
  private hapticsEnabled = true;
  private displayMode: WindowDisplayMode = 'windowed';

  public async init(): Promise<void> {
    attachGlobalFullscreenShortcuts(() => {
      void this.toggleFullscreen();
    });
  }

  public async getDisplayMode(): Promise<WindowDisplayMode> {
    if (typeof document !== 'undefined' && document.fullscreenElement) {
      return 'fullscreen';
    }
    return this.displayMode;
  }

  public async setDisplayMode(mode: WindowDisplayMode): Promise<WindowDisplayMode> {
    this.displayMode = mode;
    if (typeof document !== 'undefined') {
      try {
        if (mode === 'fullscreen' && !document.fullscreenElement) {
          await document.documentElement.requestFullscreen();
        } else if (mode !== 'fullscreen' && document.fullscreenElement) {
          await document.exitFullscreen();
        }
      } catch {
        // Ignore browser fullscreen permission error
      }
    }
    return this.displayMode;
  }

  public async toggleFullscreen(targetElement?: HTMLElement): Promise<boolean> {
    if (typeof document === 'undefined') return false;
    try {
      if (!document.fullscreenElement) {
        const el = targetElement ?? document.documentElement;
        await el.requestFullscreen();
        this.displayMode = 'fullscreen';
        return true;
      } else {
        await document.exitFullscreen();
        this.displayMode = 'windowed';
        return false;
      }
    } catch {
      return false;
    }
  }

  public isHapticsEnabled(): boolean {
    return this.hapticsEnabled;
  }

  public setHapticsEnabled(enabled: boolean): void {
    this.hapticsEnabled = enabled;
  }

  public async triggerHaptic(kind: HapticFeedbackKind): Promise<void> {
    if (!this.hapticsEnabled) return;
    try {
      if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        const ms =
          kind === 'awakening'
            ? [35, 30, 65]
            : kind === 'clash'
              ? 40
              : kind === 'just_dodge'
                ? 25
                : 12;
        navigator.vibrate(ms);
      }
    } catch {
      // Ignore unsupported vibrate
    }
  }

  public onHardwareBack(
    _handler: HardwareBackCallback,
    _onToast?: ToastNotificationCallback
  ): void {
    // Web uses Escape key handled by UnifiedInputManager
  }

  public async requestQuitWithConfirmation(): Promise<boolean> {
    return false;
  }
}

export class ElectronDeviceAdapter implements DeviceAdapter {
  public readonly supportsWindowDisplayModes = true;
  private readonly bridge: ElectronPreloadBridge;
  private hapticsEnabled = true;
  private cachedMode: WindowDisplayMode = 'windowed';

  constructor(bridge?: ElectronPreloadBridge) {
    const resolved =
      bridge ??
      (typeof window !== 'undefined' ? window.opElectronBridge : undefined);
    if (!resolved) {
      throw new Error(
        'ElectronDeviceAdapter requires window.opElectronBridge or an injected ElectronPreloadBridge.'
      );
    }
    this.bridge = resolved;
  }

  public async init(): Promise<void> {
    this.cachedMode = await this.bridge.windowGetDisplayMode();
    attachGlobalFullscreenShortcuts(() => {
      void this.toggleFullscreen();
    });
  }

  public async getDisplayMode(): Promise<WindowDisplayMode> {
    this.cachedMode = await this.bridge.windowGetDisplayMode();
    return this.cachedMode;
  }

  public async setDisplayMode(mode: WindowDisplayMode): Promise<WindowDisplayMode> {
    this.cachedMode = await this.bridge.windowSetDisplayMode(mode);
    return this.cachedMode;
  }

  public async toggleFullscreen(): Promise<boolean> {
    const current = await this.getDisplayMode();
    const next: WindowDisplayMode =
      current === 'fullscreen' ? 'windowed' : 'fullscreen';
    const updated = await this.setDisplayMode(next);
    return updated === 'fullscreen';
  }

  public isHapticsEnabled(): boolean {
    return this.hapticsEnabled;
  }

  public setHapticsEnabled(enabled: boolean): void {
    this.hapticsEnabled = enabled;
  }

  public async triggerHaptic(_kind: HapticFeedbackKind): Promise<void> {
    // Desktop gamepad rumble is optional; no-op for desktop window
  }

  public onHardwareBack(
    _handler: HardwareBackCallback,
    _onToast?: ToastNotificationCallback
  ): void {
    // Desktop uses Escape key
  }

  public async requestQuitWithConfirmation(): Promise<boolean> {
    if (typeof window !== 'undefined') {
      const confirmed = window.confirm(
        '원피스 그랜드 보야지(Windows PC)를 종료하시겠습니까? (자동 저장 데이터가 유지됩니다)'
      );
      if (!confirmed) return false;
    }
    await this.bridge.windowQuit();
    return true;
  }
}

export class CapacitorDeviceAdapter implements DeviceAdapter {
  public readonly supportsWindowDisplayModes = false;
  private hapticsEnabled = true;
  private lastRootBackPressAtMs = 0;

  public async init(): Promise<void> {
    try {
      await ScreenOrientation.lock({ orientation: 'landscape' });
    } catch {
      // Ignore if running in browser preview
    }
    try {
      await StatusBar.setOverlaysWebView({ overlay: true });
      await StatusBar.hide();
    } catch {
      // Ignore if StatusBar is unavailable
    }
    this.applySafeAreaCssVariables();
  }

  private applySafeAreaCssVariables(): void {
    if (typeof document === 'undefined') return;
    document.documentElement.classList.add('capacitor-immersive-safe-area');
  }

  public async getDisplayMode(): Promise<WindowDisplayMode> {
    return 'fullscreen';
  }

  public async setDisplayMode(
    _mode: WindowDisplayMode
  ): Promise<WindowDisplayMode> {
    return 'fullscreen';
  }

  public async toggleFullscreen(): Promise<boolean> {
    try {
      await StatusBar.hide();
    } catch {
      // Ignore
    }
    return true;
  }

  public isHapticsEnabled(): boolean {
    return this.hapticsEnabled;
  }

  public setHapticsEnabled(enabled: boolean): void {
    this.hapticsEnabled = enabled;
  }

  public async triggerHaptic(kind: HapticFeedbackKind): Promise<void> {
    if (!this.hapticsEnabled) return;
    try {
      if (kind === 'awakening') {
        await Haptics.impact({ style: ImpactStyle.Heavy });
      } else if (kind === 'clash') {
        await Haptics.impact({ style: ImpactStyle.Medium });
      } else if (kind === 'just_dodge') {
        await Haptics.impact({ style: ImpactStyle.Light });
      } else {
        await Haptics.vibrate({ duration: 15 });
      }
    } catch {
      // Fallback to navigator.vibrate
      try {
        if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
          navigator.vibrate(25);
        }
      } catch {
        // Ignore
      }
    }
  }

  public onHardwareBack(
    handler: HardwareBackCallback,
    onToast?: ToastNotificationCallback
  ): void {
    try {
      void App.addListener('backButton', () => {
        const res = handler();
        if (res.handledByScene) {
          return;
        }
        const now = Date.now();
        if (now - this.lastRootBackPressAtMs < 2000) {
          void App.exitApp();
        } else {
          this.lastRootBackPressAtMs = now;
          onToast?.('📱 뒤로가기를 한 번 더 누르면 게임이 종료됩니다.');
        }
      });
    } catch {
      // Ignore if not running inside Capacitor native shell
    }
  }

  public async requestQuitWithConfirmation(): Promise<boolean> {
    try {
      await App.exitApp();
      return true;
    } catch {
      return false;
    }
  }
}
