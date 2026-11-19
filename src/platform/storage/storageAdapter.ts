import type {
  GlobalSettingsPayload,
  SaveEnvelope,
  SaveSlotId
} from '../../core/save/schema';

export const ALL_SAVE_SLOTS: SaveSlotId[] = [
  'auto',
  'slot_1',
  'slot_2',
  'slot_3'
];

export interface SaveStorageAdapter {
  readonly isFallbackActive: boolean;
  init(): Promise<void>;
  saveSlot(slotId: SaveSlotId, envelope: SaveEnvelope): Promise<void>;
  loadSlot(slotId: SaveSlotId): Promise<SaveEnvelope | null>;
  listAllSlots(): Promise<Record<SaveSlotId, SaveEnvelope | null>>;
  deleteSlot(slotId: SaveSlotId): Promise<void>;
  clearAllSlots(): Promise<void>;
  saveGlobalSettings(settings: GlobalSettingsPayload): Promise<void>;
  loadGlobalSettings(): Promise<GlobalSettingsPayload | null>;
  saveTeamPreset(presetId: string, presetData: unknown): Promise<void>;
  loadTeamPreset(presetId: string): Promise<unknown | null>;
}
