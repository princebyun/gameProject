import {
  CapacitorDeviceAdapter,
  ElectronDeviceAdapter,
  WebDeviceAdapter,
  type DeviceAdapter
} from './deviceAdapter';
import {
  CapacitorFileTransferAdapter,
  ElectronFileTransferAdapter,
  WebFileTransferAdapter,
  type FileTransferAdapter
} from './fileTransferAdapter';
import type { PlatformAdapter } from './platformAdapter';
import {
  CapacitorFilesystemStorageAdapter,
  type CapacitorStorageDriver
} from './storage/capacitorFilesystemStorageAdapter';
import {
  ElectronFileStorageAdapter,
  type ElectronPreloadBridge
} from './storage/electronFileStorageAdapter';
import { IndexedDbStorageAdapter } from './storage/indexedDbStorageAdapter';
import type { SaveStorageAdapter } from './storage/storageAdapter';
import { WebPlatformAdapter } from './webPlatformAdapter';

export type RuntimePlatformTarget = 'electron' | 'capacitor' | 'web';

export interface PlatformDetectionContext {
  electronBridge?: ElectronPreloadBridge | null;
  capacitorGlobal?: {
    isNativePlatform?: () => boolean;
    getPlatform?: () => string;
  } | null;
  capacitorDriver?: CapacitorStorageDriver;
}

/**
 * Detects runtime target in strict priority order:
 * 1. `electron` (`window.opElectronBridge.isElectron === true`)
 * 2. `capacitor` (`window.Capacitor.isNativePlatform() === true`)
 * 3. `web` (Web / iOS / macOS PWA default)
 */
export function detectRuntimePlatformTarget(
  ctx?: PlatformDetectionContext
): RuntimePlatformTarget {
  const electronBridge =
    ctx?.electronBridge !== undefined
      ? ctx.electronBridge
      : typeof window !== 'undefined'
        ? window.opElectronBridge
        : undefined;

  if (electronBridge && electronBridge.isElectron === true) {
    return 'electron';
  }

  const cap =
    ctx?.capacitorGlobal !== undefined
      ? ctx.capacitorGlobal
      : typeof window !== 'undefined'
        ? window.Capacitor
        : undefined;

  if (cap && typeof cap.isNativePlatform === 'function' && cap.isNativePlatform()) {
    return 'capacitor';
  }

  return 'web';
}

/**
 * Resolves the multiplayer WebSocket URL (`VITE_MULTIPLAYER_URL`),
 * enforcing `wss://` protocol in production builds for remote hosts.
 */
export function resolveMultiplayerServerUrl(
  rawEnvUrl?: string,
  isProductionBuild?: boolean
): string {
  const envVal =
    rawEnvUrl ??
    ((import.meta as unknown as { env?: Record<string, string | undefined> }).env
      ?.VITE_MULTIPLAYER_URL ??
      '');
  const isProd =
    isProductionBuild ??
    Boolean(
      (import.meta as unknown as { env?: Record<string, boolean | undefined> })
        .env?.PROD
    );

  const trimmed = envVal.trim();
  if (!trimmed) {
    return isProd ? 'wss://relay.grandvoyage.example.com' : 'ws://localhost:8787';
  }

  if (isProd && trimmed.startsWith('ws://')) {
    const isLocalhost =
      trimmed.startsWith('ws://localhost') ||
      trimmed.startsWith('ws://127.0.0.1');
    if (!isLocalhost) {
      return `wss://${trimmed.slice('ws://'.length)}`;
    }
  }

  return trimmed;
}

export interface PlatformBridge extends PlatformAdapter {
  readonly runtimeTarget: RuntimePlatformTarget;
  readonly storage: SaveStorageAdapter;
  readonly fileTransfer: FileTransferAdapter;
  readonly device: DeviceAdapter;
  readonly multiplayerUrl: string;
  init(): Promise<void>;
}

class UnifiedPlatformBridge implements PlatformBridge {
  public readonly runtimeTarget: RuntimePlatformTarget;
  public readonly platformName:
    | 'web-pwa'
    | 'desktop-wrapper'
    | 'mobile-wrapper';
  public readonly storage: SaveStorageAdapter;
  public readonly fileTransfer: FileTransferAdapter;
  public readonly device: DeviceAdapter;
  public readonly multiplayerUrl: string;
  private readonly baseWebAdapter = new WebPlatformAdapter();

  constructor(
    runtimeTarget: RuntimePlatformTarget,
    storage: SaveStorageAdapter,
    fileTransfer: FileTransferAdapter,
    device: DeviceAdapter,
    multiplayerUrl: string
  ) {
    this.runtimeTarget = runtimeTarget;
    this.platformName =
      runtimeTarget === 'electron'
        ? 'desktop-wrapper'
        : runtimeTarget === 'capacitor'
          ? 'mobile-wrapper'
          : 'web-pwa';
    this.storage = storage;
    this.fileTransfer = fileTransfer;
    this.device = device;
    this.multiplayerUrl = multiplayerUrl;
  }

  public async init(): Promise<void> {
    await this.storage.init();
    await this.device.init();
  }

  public getStorageItem(key: string): string | null {
    return this.baseWebAdapter.getStorageItem(key);
  }

  public setStorageItem(key: string, value: string): void {
    this.baseWebAdapter.setStorageItem(key, value);
  }

  public removeStorageItem(key: string): void {
    this.baseWebAdapter.removeStorageItem(key);
  }

  public isFullscreen(): boolean {
    return this.baseWebAdapter.isFullscreen();
  }

  public async toggleFullscreen(targetElement?: HTMLElement): Promise<boolean> {
    return this.device.toggleFullscreen(targetElement);
  }

  public vibrate(durationMs: number | number[]): void {
    if (!this.device.isHapticsEnabled()) return;
    this.baseWebAdapter.vibrate(durationMs);
  }

  public nowMs(): number {
    return this.baseWebAdapter.nowMs();
  }

  public exportJsonFile(filename: string, jsonContent: string): void {
    this.baseWebAdapter.exportJsonFile(filename, jsonContent);
  }
}

export function createPlatformBridge(
  ctx?: PlatformDetectionContext
): PlatformBridge {
  const target = detectRuntimePlatformTarget(ctx);
  const multiplayerUrl = resolveMultiplayerServerUrl();

  if (target === 'electron') {
    const bridge =
      ctx?.electronBridge ??
      (typeof window !== 'undefined' ? window.opElectronBridge : undefined);
    const storage = new ElectronFileStorageAdapter(bridge ?? undefined);
    const fileTransfer = new ElectronFileTransferAdapter(bridge ?? undefined);
    const device = new ElectronDeviceAdapter(bridge ?? undefined);
    return new UnifiedPlatformBridge(
      'electron',
      storage,
      fileTransfer,
      device,
      multiplayerUrl
    );
  }

  if (target === 'capacitor') {
    const storage = new CapacitorFilesystemStorageAdapter(ctx?.capacitorDriver);
    const fileTransfer = new CapacitorFileTransferAdapter();
    const device = new CapacitorDeviceAdapter();
    return new UnifiedPlatformBridge(
      'capacitor',
      storage,
      fileTransfer,
      device,
      multiplayerUrl
    );
  }

  const storage = new IndexedDbStorageAdapter();
  const fileTransfer = new WebFileTransferAdapter();
  const device = new WebDeviceAdapter();
  return new UnifiedPlatformBridge(
    'web',
    storage,
    fileTransfer,
    device,
    multiplayerUrl
  );
}
