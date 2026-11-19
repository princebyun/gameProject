import type {
  GlobalSettingsPayload,
  SaveEnvelope,
  SaveSlotId
} from '../../core/save/schema';
import {
  ALL_SAVE_SLOTS,
  type SaveStorageAdapter
} from './storageAdapter';

const DB_NAME = 'OnePieceResonanceDB';
const DB_VERSION = 1;
const STORE_SAVE_SLOTS = 'save_slots';
const STORE_GLOBAL_SETTINGS = 'global_settings';
const STORE_TEAM_PRESETS = 'team_presets';

const LS_PREFIX = 'op_resonance_idb_fallback_';

export class IndexedDbStorageAdapter implements SaveStorageAdapter {
  private db: IDBDatabase | null = null;
  private fallbackActive = false;
  private memoryStore = new Map<string, string>();

  public get isFallbackActive(): boolean {
    return this.fallbackActive;
  }

  public async init(): Promise<void> {
    if (typeof window === 'undefined' || !('indexedDB' in window) || !window.indexedDB) {
      this.fallbackActive = true;
      return;
    }

    try {
      this.db = await new Promise<IDBDatabase>((resolve, reject) => {
        const req = window.indexedDB.open(DB_NAME, DB_VERSION);

        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(STORE_SAVE_SLOTS)) {
            db.createObjectStore(STORE_SAVE_SLOTS);
          }
          if (!db.objectStoreNames.contains(STORE_GLOBAL_SETTINGS)) {
            db.createObjectStore(STORE_GLOBAL_SETTINGS);
          }
          if (!db.objectStoreNames.contains(STORE_TEAM_PRESETS)) {
            db.createObjectStore(STORE_TEAM_PRESETS);
          }
        };

        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'));
        req.onblocked = () => reject(new Error('IndexedDB open blocked'));
      });
      this.fallbackActive = false;
    } catch {
      this.db = null;
      this.fallbackActive = true;
    }
  }

  private async putValue(storeName: string, key: string, value: unknown): Promise<void> {
    if (this.db && !this.fallbackActive) {
      try {
        await new Promise<void>((resolve, reject) => {
          const tx = this.db!.transaction(storeName, 'readwrite');
          const store = tx.objectStore(storeName);
          store.put(value, key);
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        });
        // Mirror to localStorage as well so synchronous crash recovery or fallback has it
        this.putFallbackValue(storeName, key, value);
        return;
      } catch {
        this.fallbackActive = true;
      }
    }
    this.putFallbackValue(storeName, key, value);
  }

  private async getValue<T>(storeName: string, key: string): Promise<T | null> {
    if (this.db && !this.fallbackActive) {
      try {
        const res = await new Promise<T | undefined>((resolve, reject) => {
          const tx = this.db!.transaction(storeName, 'readonly');
          const store = tx.objectStore(storeName);
          const req = store.get(key);
          req.onsuccess = () => resolve(req.result as T | undefined);
          req.onerror = () => reject(req.error);
        });
        if (res !== undefined) {
          return res;
        }
      } catch {
        this.fallbackActive = true;
      }
    }
    return this.getFallbackValue<T>(storeName, key);
  }

  private async deleteValue(storeName: string, key: string): Promise<void> {
    if (this.db && !this.fallbackActive) {
      try {
        await new Promise<void>((resolve, reject) => {
          const tx = this.db!.transaction(storeName, 'readwrite');
          const store = tx.objectStore(storeName);
          store.delete(key);
          tx.oncomplete = () => resolve();
          tx.onerror = () => reject(tx.error);
        });
      } catch {
        this.fallbackActive = true;
      }
    }
    this.deleteFallbackValue(storeName, key);
  }

  private putFallbackValue(storeName: string, key: string, value: unknown): void {
    const fullKey = `${LS_PREFIX}${storeName}_${key}`;
    const raw = JSON.stringify(value);
    this.memoryStore.set(fullKey, raw);
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(fullKey, raw);
      }
    } catch {
      // Ignore quota or private mode block
    }
  }

  private getFallbackValue<T>(storeName: string, key: string): T | null {
    const fullKey = `${LS_PREFIX}${storeName}_${key}`;
    let raw: string | null = null;
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        raw = window.localStorage.getItem(fullKey);
      }
    } catch {
      // Ignore
    }
    if (!raw) {
      raw = this.memoryStore.get(fullKey) ?? null;
    }
    if (!raw) return null;
    try {
      return JSON.parse(raw) as T;
    } catch {
      return null;
    }
  }

  private deleteFallbackValue(storeName: string, key: string): void {
    const fullKey = `${LS_PREFIX}${storeName}_${key}`;
    this.memoryStore.delete(fullKey);
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.removeItem(fullKey);
      }
    } catch {
      // Ignore
    }
  }

  public async saveSlot(slotId: SaveSlotId, envelope: SaveEnvelope): Promise<void> {
    const cloned: SaveEnvelope = JSON.parse(JSON.stringify(envelope));
    cloned.meta.slotId = slotId;
    await this.putValue(STORE_SAVE_SLOTS, slotId, cloned);
  }

  public async loadSlot(slotId: SaveSlotId): Promise<SaveEnvelope | null> {
    return this.getValue<SaveEnvelope>(STORE_SAVE_SLOTS, slotId);
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
    await this.deleteValue(STORE_SAVE_SLOTS, slotId);
  }

  public async clearAllSlots(): Promise<void> {
    for (const slotId of ALL_SAVE_SLOTS) {
      await this.deleteSlot(slotId);
    }
  }

  public async saveGlobalSettings(settings: GlobalSettingsPayload): Promise<void> {
    await this.putValue(STORE_GLOBAL_SETTINGS, 'settings', settings);
  }

  public async loadGlobalSettings(): Promise<GlobalSettingsPayload | null> {
    return this.getValue<GlobalSettingsPayload>(STORE_GLOBAL_SETTINGS, 'settings');
  }

  public async saveTeamPreset(presetId: string, presetData: unknown): Promise<void> {
    await this.putValue(STORE_TEAM_PRESETS, presetId, presetData);
  }

  public async loadTeamPreset(presetId: string): Promise<unknown | null> {
    return this.getValue<unknown>(STORE_TEAM_PRESETS, presetId);
  }
}
