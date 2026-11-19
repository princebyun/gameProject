import { Directory, Encoding, Filesystem } from '@capacitor/filesystem';
import { Preferences } from '@capacitor/preferences';
import type {
  GlobalSettingsPayload,
  SaveEnvelope,
  SaveSlotId
} from '../../core/save/schema';
import {
  ALL_SAVE_SLOTS,
  type SaveStorageAdapter
} from './storageAdapter';

export interface CapacitorStorageDriver {
  mkdir(path: string): Promise<void>;
  writeFile(path: string, data: string): Promise<void>;
  readFile(path: string): Promise<string | null>;
  deleteFile(path: string): Promise<void>;
  setPreference(key: string, value: string): Promise<void>;
  getPreference(key: string): Promise<string | null>;
}

const DEFAULT_CAPACITOR_DRIVER: CapacitorStorageDriver = {
  async mkdir(dirPath: string): Promise<void> {
    try {
      await Filesystem.mkdir({
        path: dirPath,
        directory: Directory.Data,
        recursive: true
      });
    } catch {
      // Directory already exists
    }
  },
  async writeFile(filePath: string, data: string): Promise<void> {
    await Filesystem.writeFile({
      path: filePath,
      data,
      directory: Directory.Data,
      encoding: Encoding.UTF8,
      recursive: true
    });
  },
  async readFile(filePath: string): Promise<string | null> {
    try {
      const res = await Filesystem.readFile({
        path: filePath,
        directory: Directory.Data,
        encoding: Encoding.UTF8
      });
      return typeof res.data === 'string' ? res.data : String(res.data);
    } catch {
      return null;
    }
  },
  async deleteFile(filePath: string): Promise<void> {
    try {
      await Filesystem.deleteFile({
        path: filePath,
        directory: Directory.Data
      });
    } catch {
      // File may not exist
    }
  },
  async setPreference(key: string, value: string): Promise<void> {
    await Preferences.set({ key, value });
  },
  async getPreference(key: string): Promise<string | null> {
    const res = await Preferences.get({ key });
    return res.value ?? null;
  }
};

const SAVES_SUBDIR = 'saves';
const PRESETS_FILE_PATH = `${SAVES_SUBDIR}/presets.json`;
const PREF_GLOBAL_SETTINGS_KEY = 'op_resonance_global_settings_v1';

export class CapacitorFilesystemStorageAdapter implements SaveStorageAdapter {
  private readonly driver: CapacitorStorageDriver;
  public readonly isFallbackActive = false;

  constructor(driver: CapacitorStorageDriver = DEFAULT_CAPACITOR_DRIVER) {
    this.driver = driver;
  }

  private slotFilePath(slotId: SaveSlotId): string {
    return `${SAVES_SUBDIR}/${slotId}.json`;
  }

  public async init(): Promise<void> {
    await this.driver.mkdir(SAVES_SUBDIR);
  }

  public async saveSlot(
    slotId: SaveSlotId,
    envelope: SaveEnvelope
  ): Promise<void> {
    const cloned: SaveEnvelope = JSON.parse(JSON.stringify(envelope));
    cloned.meta.slotId = slotId;
    await this.driver.writeFile(
      this.slotFilePath(slotId),
      JSON.stringify(cloned, null, 2)
    );
  }

  public async loadSlot(slotId: SaveSlotId): Promise<SaveEnvelope | null> {
    const raw = await this.driver.readFile(this.slotFilePath(slotId));
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
    for (const slotId of ALL_SAVE_SLOTS) {
      out[slotId] = await this.loadSlot(slotId);
    }
    return out;
  }

  public async deleteSlot(slotId: SaveSlotId): Promise<void> {
    await this.driver.deleteFile(this.slotFilePath(slotId));
  }

  public async clearAllSlots(): Promise<void> {
    for (const slotId of ALL_SAVE_SLOTS) {
      await this.deleteSlot(slotId);
    }
  }

  public async saveGlobalSettings(
    settings: GlobalSettingsPayload
  ): Promise<void> {
    await this.driver.setPreference(
      PREF_GLOBAL_SETTINGS_KEY,
      JSON.stringify(settings)
    );
  }

  public async loadGlobalSettings(): Promise<GlobalSettingsPayload | null> {
    const raw = await this.driver.getPreference(PREF_GLOBAL_SETTINGS_KEY);
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
    const existingRaw = await this.driver.readFile(PRESETS_FILE_PATH);
    let presetsMap: Record<string, unknown> = {};
    if (existingRaw) {
      try {
        presetsMap = JSON.parse(existingRaw) as Record<string, unknown>;
      } catch {
        presetsMap = {};
      }
    }
    presetsMap[presetId] = presetData;
    await this.driver.writeFile(
      PRESETS_FILE_PATH,
      JSON.stringify(presetsMap, null, 2)
    );
  }

  public async loadTeamPreset(presetId: string): Promise<unknown | null> {
    const existingRaw = await this.driver.readFile(PRESETS_FILE_PATH);
    if (!existingRaw) return null;
    try {
      const presetsMap = JSON.parse(existingRaw) as Record<string, unknown>;
      return presetsMap[presetId] ?? null;
    } catch {
      return null;
    }
  }
}
