import type {
  GlobalSettingsPayload,
  SaveEnvelope,
  SaveSlotId
} from '../../core/save/schema';
import {
  ALL_SAVE_SLOTS,
  type SaveStorageAdapter
} from './storageAdapter';

export type ElectronDisplayMode = 'windowed' | 'fullscreen' | 'borderless';

/**
 * Strictly whitelisted IPC bridge exposed by `electron/preload.ts` via
 * `contextBridge.exposeInMainWorld('opElectronBridge', ...)` with
 * `contextIsolation: true` and `nodeIntegration: false`.
 */
export interface ElectronPreloadBridge {
  readonly isElectron: true;
  saveRead(key: string): Promise<string | null>;
  saveWrite(key: string, jsonContent: string): Promise<boolean>;
  saveList(): Promise<Record<string, string | null>>;
  saveDelete(key: string): Promise<boolean>;
  dialogExportSave(
    defaultFilename: string,
    jsonContent: string
  ): Promise<{ exported: boolean; filePath?: string }>;
  dialogImportSave(): Promise<{ filename: string; jsonContent: string } | null>;
  windowSetDisplayMode(mode: ElectronDisplayMode): Promise<ElectronDisplayMode>;
  windowGetDisplayMode(): Promise<ElectronDisplayMode>;
  windowQuit(): Promise<void>;
}

declare global {
  interface Window {
    opElectronBridge?: ElectronPreloadBridge;
    Capacitor?: {
      isNativePlatform?: () => boolean;
      getPlatform?: () => string;
    };
  }
}

export class ElectronFileStorageAdapter implements SaveStorageAdapter {
  private readonly bridge: ElectronPreloadBridge;
  public readonly isFallbackActive = false;

  constructor(bridge?: ElectronPreloadBridge) {
    const resolved =
      bridge ??
      (typeof window !== 'undefined' ? window.opElectronBridge : undefined);
    if (!resolved) {
      throw new Error(
        'ElectronFileStorageAdapter requires window.opElectronBridge or an injected ElectronPreloadBridge.'
      );
    }
    this.bridge = resolved;
  }

  public async init(): Promise<void> {
    // Verify bridge connectivity on init by reading settings key
    await this.bridge.saveRead('settings');
  }

  public async saveSlot(
    slotId: SaveSlotId,
    envelope: SaveEnvelope
  ): Promise<void> {
    const cloned: SaveEnvelope = JSON.parse(JSON.stringify(envelope));
    cloned.meta.slotId = slotId;
    const raw = JSON.stringify(cloned, null, 2);
    await this.bridge.saveWrite(slotId, raw);
  }

  public async loadSlot(slotId: SaveSlotId): Promise<SaveEnvelope | null> {
    const raw = await this.bridge.saveRead(slotId);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as SaveEnvelope;
    } catch {
      return null;
    }
  }

  public async listAllSlots(): Promise<Record<SaveSlotId, SaveEnvelope | null>> {
    const out: Record<SaveSlotId, SaveEnvelope | null> = {
      auto: null,
      slot_1: null,
      slot_2: null,
      slot_3: null
    };
    const rawMap = await this.bridge.saveList();
    for (const slotId of ALL_SAVE_SLOTS) {
      const raw = rawMap[slotId];
      if (!raw) {
        out[slotId] = null;
        continue;
      }
      try {
        out[slotId] = JSON.parse(raw) as SaveEnvelope;
      } catch {
        out[slotId] = null;
      }
    }
    return out;
  }

  public async deleteSlot(slotId: SaveSlotId): Promise<void> {
    await this.bridge.saveDelete(slotId);
  }

  public async clearAllSlots(): Promise<void> {
    for (const slotId of ALL_SAVE_SLOTS) {
      await this.bridge.saveDelete(slotId);
    }
  }

  public async saveGlobalSettings(
    settings: GlobalSettingsPayload
  ): Promise<void> {
    await this.bridge.saveWrite('settings', JSON.stringify(settings, null, 2));
  }

  public async loadGlobalSettings(): Promise<GlobalSettingsPayload | null> {
    const raw = await this.bridge.saveRead('settings');
    if (!raw) return null;
    try {
      return JSON.parse(raw) as GlobalSettingsPayload;
    } catch {
      return null;
    }
  }

  public async saveTeamPreset(
    presetId: string,
    presetData: unknown
  ): Promise<void> {
    const existingRaw = await this.bridge.saveRead('presets');
    let presetsMap: Record<string, unknown> = {};
    if (existingRaw) {
      try {
        presetsMap = JSON.parse(existingRaw) as Record<string, unknown>;
      } catch {
        presetsMap = {};
      }
    }
    presetsMap[presetId] = presetData;
    await this.bridge.saveWrite('presets', JSON.stringify(presetsMap, null, 2));
  }

  public async loadTeamPreset(presetId: string): Promise<unknown | null> {
    const existingRaw = await this.bridge.saveRead('presets');
    if (!existingRaw) return null;
    try {
      const presetsMap = JSON.parse(existingRaw) as Record<string, unknown>;
      return presetsMap[presetId] ?? null;
    } catch {
      return null;
    }
  }
}
