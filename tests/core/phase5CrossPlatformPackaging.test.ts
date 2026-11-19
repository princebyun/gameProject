import { promises as fs } from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createInitialCampaignState } from '../../src/core/rpg/campaignState';
import {
  canEnterOnlineBattle,
  validateSaveLegality,
  verifySaveIntegrity
} from '../../src/core/save/antiCheat';
import {
  DEFAULT_GLOBAL_SETTINGS,
  deserializeSaveEnvelopeToCampaign,
  serializeCampaignToSaveEnvelope
} from '../../src/core/save/serializer';
import { defaultDataRegistry } from '../../src/data/dataRegistry';
import { defaultRpgDataRegistry } from '../../src/data/rpgDataRegistry';
import {
  ElectronFileTransferAdapter
} from '../../src/platform/fileTransferAdapter';
import {
  createPlatformBridge,
  detectRuntimePlatformTarget,
  resolveMultiplayerServerUrl
} from '../../src/platform/platformBridge';
import { AtomicNodeFileStore } from '../../src/platform/storage/atomicNodeFileStore';
import {
  CapacitorFilesystemStorageAdapter,
  type CapacitorStorageDriver
} from '../../src/platform/storage/capacitorFilesystemStorageAdapter';
import {
  ElectronFileStorageAdapter,
  type ElectronDisplayMode,
  type ElectronPreloadBridge
} from '../../src/platform/storage/electronFileStorageAdapter';
import { IndexedDbStorageAdapter } from '../../src/platform/storage/indexedDbStorageAdapter';
import { parseAndValidateImportedSaveJson } from '../../src/platform/storage/saveFileIO';
import { ALL_SAVE_SLOTS } from '../../src/platform/storage/storageAdapter';

function createMockElectronBridge(
  store: AtomicNodeFileStore,
  exportDir: string
): ElectronPreloadBridge {
  let displayMode: ElectronDisplayMode = 'windowed';
  let lastExportedPath = '';

  return {
    isElectron: true,
    async saveRead(key: string): Promise<string | null> {
      return store.readRaw(key);
    },
    async saveWrite(key: string, jsonContent: string): Promise<boolean> {
      await store.writeRawAtomically(key, jsonContent);
      return true;
    },
    async saveList(): Promise<Record<string, string | null>> {
      return store.listSlots(ALL_SAVE_SLOTS);
    },
    async saveDelete(key: string): Promise<boolean> {
      return store.deleteKey(key);
    },
    async dialogExportSave(
      defaultFilename: string,
      jsonContent: string
    ): Promise<{ exported: boolean; filePath?: string }> {
      lastExportedPath = path.join(exportDir, defaultFilename);
      await AtomicNodeFileStore.writeExplicitPathAtomically(
        lastExportedPath,
        jsonContent
      );
      return { exported: true, filePath: lastExportedPath };
    },
    async dialogImportSave(): Promise<{
      filename: string;
      jsonContent: string;
    } | null> {
      if (!lastExportedPath) return null;
      const jsonContent = await fs.readFile(lastExportedPath, 'utf-8');
      return {
        filename: path.basename(lastExportedPath),
        jsonContent
      };
    },
    async windowSetDisplayMode(
      mode: ElectronDisplayMode
    ): Promise<ElectronDisplayMode> {
      displayMode = mode;
      return displayMode;
    },
    async windowGetDisplayMode(): Promise<ElectronDisplayMode> {
      return displayMode;
    },
    async windowQuit(): Promise<void> {
      // No-op in test
    }
  };
}

function createMockCapacitorDriver(): CapacitorStorageDriver & {
  files: Map<string, string>;
  prefs: Map<string, string>;
} {
  const files = new Map<string, string>();
  const prefs = new Map<string, string>();
  return {
    files,
    prefs,
    async mkdir(_dirPath: string): Promise<void> {
      // In-memory mock directory
    },
    async writeFile(filePath: string, data: string): Promise<void> {
      files.set(filePath, data);
    },
    async readFile(filePath: string): Promise<string | null> {
      return files.get(filePath) ?? null;
    },
    async deleteFile(filePath: string): Promise<void> {
      files.delete(filePath);
    },
    async setPreference(key: string, value: string): Promise<void> {
      prefs.set(key, value);
    },
    async getPreference(key: string): Promise<string | null> {
      return prefs.get(key) ?? null;
    }
  };
}

describe('Phase 5: Multi-Target Packaging & Cross-Platform Native Adapters', () => {
  let tempDir = '';

  beforeEach(async () => {
    tempDir = await fs.mkdtemp(
      path.join(os.tmpdir(), 'op-resonance-phase5-test-')
    );
  });

  afterEach(async () => {
    if (tempDir) {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  it('1. PlatformBridge Runtime Detection & Adapter Routing: prioritizes electron -> capacitor -> web and enforces wss:// in production', async () => {
    const store = new AtomicNodeFileStore(path.join(tempDir, 'saves'));
    const electronBridge = createMockElectronBridge(store, tempDir);
    const capDriver = createMockCapacitorDriver();

    // Priority 1: Electron wins even if Capacitor object is also present
    expect(
      detectRuntimePlatformTarget({
        electronBridge,
        capacitorGlobal: { isNativePlatform: () => true }
      })
    ).toBe('electron');

    const bridgeElectron = createPlatformBridge({
      electronBridge,
      capacitorGlobal: { isNativePlatform: () => true }
    });
    expect(bridgeElectron.runtimeTarget).toBe('electron');
    expect(bridgeElectron.platformName).toBe('desktop-wrapper');
    expect(bridgeElectron.storage).toBeInstanceOf(ElectronFileStorageAdapter);
    expect(bridgeElectron.device.supportsWindowDisplayModes).toBe(true);

    // Priority 2: Capacitor when electronBridge is absent
    expect(
      detectRuntimePlatformTarget({
        electronBridge: null,
        capacitorGlobal: { isNativePlatform: () => true }
      })
    ).toBe('capacitor');

    const bridgeCapacitor = createPlatformBridge({
      electronBridge: null,
      capacitorGlobal: { isNativePlatform: () => true },
      capacitorDriver: capDriver
    });
    expect(bridgeCapacitor.runtimeTarget).toBe('capacitor');
    expect(bridgeCapacitor.platformName).toBe('mobile-wrapper');
    expect(bridgeCapacitor.storage).toBeInstanceOf(
      CapacitorFilesystemStorageAdapter
    );

    // Priority 3: Web PWA fallback
    expect(
      detectRuntimePlatformTarget({
        electronBridge: null,
        capacitorGlobal: { isNativePlatform: () => false }
      })
    ).toBe('web');

    const bridgeWeb = createPlatformBridge({
      electronBridge: null,
      capacitorGlobal: null
    });
    expect(bridgeWeb.runtimeTarget).toBe('web');
    expect(bridgeWeb.platformName).toBe('web-pwa');
    expect(bridgeWeb.storage).toBeInstanceOf(IndexedDbStorageAdapter);

    // Multiplayer URL resolution: dev vs prod wss:// enforcement
    expect(resolveMultiplayerServerUrl('', false)).toBe('ws://localhost:8787');
    expect(
      resolveMultiplayerServerUrl('ws://multiplayer.grandvoyage.io:8787', true)
    ).toBe('wss://multiplayer.grandvoyage.io:8787');
    expect(
      resolveMultiplayerServerUrl('wss://secure.grandvoyage.io/ws', true)
    ).toBe('wss://secure.grandvoyage.io/ws');
  });

  it('2. ElectronFileStorageAdapter & AtomicNodeFileStore: performs atomic .tmp -> rename writes and preserves existing save on interrupted write', async () => {
    const savesDir = path.join(tempDir, 'appdata_saves');
    const store = new AtomicNodeFileStore(savesDir);
    const electronBridge = createMockElectronBridge(store, tempDir);
    const adapter = new ElectronFileStorageAdapter(electronBridge);
    await adapter.init();

    const campaign = createInitialCampaignState(
      defaultRpgDataRegistry,
      defaultDataRegistry
    );
    campaign.berries = 777000;
    const envelopeV1 = serializeCampaignToSaveEnvelope(
      campaign,
      'slot_1',
      180,
      '2026-11-19T13:00:00.000Z',
      DEFAULT_GLOBAL_SETTINGS,
      null,
      defaultRpgDataRegistry,
      defaultDataRegistry
    );

    await adapter.saveSlot('slot_1', envelopeV1);

    // Verify slot_1.json exists and no residual .tmp files remain
    const dirEntries = await fs.readdir(savesDir);
    expect(dirEntries).toContain('slot_1.json');
    expect(dirEntries.filter((f) => f.includes('.tmp.'))).toHaveLength(0);

    const loaded = await adapter.loadSlot('slot_1');
    expect(loaded).not.toBeNull();
    expect(loaded!.payload.economy.berry).toBe(777000);

    // Verify settings and team preset storage
    await adapter.saveGlobalSettings({
      flashEffect: false,
      shakeIntensity: 0.5,
      bgmVolume: 0.6,
      sfxVolume: 0.9,
      keyBindings: { dodge: 'Space' }
    });
    const loadedSettings = await adapter.loadGlobalSettings();
    expect(loadedSettings?.flashEffect).toBe(false);
    expect(loadedSettings?.shakeIntensity).toBe(0.5);

    await adapter.saveTeamPreset('pirate_king_team', {
      units: ['luffy', 'zoro']
    });
    const preset = await adapter.loadTeamPreset('pirate_king_team');
    expect(preset).toEqual({ units: ['luffy', 'zoro'] });
  });

  it('3. CapacitorFilesystemStorageAdapter: saves and loads slots in Directory.Data/saves/ and settings in Preferences', async () => {
    const mockDriver = createMockCapacitorDriver();
    const capAdapter = new CapacitorFilesystemStorageAdapter(mockDriver);
    await capAdapter.init();

    const campaign = createInitialCampaignState(
      defaultRpgDataRegistry,
      defaultDataRegistry
    );
    campaign.berries = 320000;
    const env = serializeCampaignToSaveEnvelope(
      campaign,
      'slot_2',
      420,
      '2026-11-19T13:15:00.000Z',
      DEFAULT_GLOBAL_SETTINGS,
      null,
      defaultRpgDataRegistry,
      defaultDataRegistry
    );

    await capAdapter.saveSlot('slot_2', env);
    expect(mockDriver.files.has('saves/slot_2.json')).toBe(true);

    const loaded = await capAdapter.loadSlot('slot_2');
    expect(loaded).not.toBeNull();
    expect(loaded!.payload.economy.berry).toBe(320000);

    const allSlots = await capAdapter.listAllSlots();
    expect(allSlots.slot_2?.payload.economy.berry).toBe(320000);
    expect(allSlots.slot_1).toBeNull();

    await capAdapter.saveGlobalSettings({
      flashEffect: true,
      shakeIntensity: 0.75,
      bgmVolume: 0.8,
      sfxVolume: 0.8,
      keyBindings: {}
    });
    const loadedSettings = await capAdapter.loadGlobalSettings();
    expect(loadedSettings?.shakeIntensity).toBe(0.75);
  });

  it('4. Cross-Platform Save Compatibility (Electron PC <-> Web PWA <-> Android APK): exported .op-save.json passes IntegrityVerifier + LegalityValidator with onlineEligible: true across all 3 platforms', async () => {
    const savesDir = path.join(tempDir, 'pc_saves');
    const exportsDir = path.join(tempDir, 'pc_exports');
    const store = new AtomicNodeFileStore(savesDir);
    const electronBridge = createMockElectronBridge(store, exportsDir);

    const electronStorage = new ElectronFileStorageAdapter(electronBridge);
    const electronFileTransfer = new ElectronFileTransferAdapter(electronBridge);
    const webStorage = new IndexedDbStorageAdapter();
    const androidStorage = new CapacitorFilesystemStorageAdapter(
      createMockCapacitorDriver()
    );

    await electronStorage.init();
    await webStorage.init();
    await androidStorage.init();

    // Create legitimate New World progressed campaign on Windows Electron PC
    const pcCampaign = createInitialCampaignState(
      defaultRpgDataRegistry,
      defaultDataRegistry
    );
    pcCampaign.completedEpisodes = [
      'ep_east_blue_start',
      'ep_orange_town',
      'ep_baratie',
      'ep_arlong_park',
      'ep_loguetown',
      'ep_drum_kingdom',
      'ep_alabasta',
      'ep_skypiea',
      'ep_water_seven',
      'ep_thriller_bark',
      'ep_marineford',
      'ep_wano'
    ];
    pcCampaign.currentZoneId = 'new_world';
    pcCampaign.ship.shipId = 'thousand_sunny';
    pcCampaign.recruitedUnitIds = ['luffy', 'zoro', 'law'];
    pcCampaign.activePartyUnitIds = ['luffy', 'zoro', 'law'];
    pcCampaign.berries = 1500000;
    pcCampaign.totalCrewBounty = 3000000000;
    pcCampaign.onlineStats = { wins: 12, losses: 3, draws: 1 };

    const pcEnvelope = serializeCampaignToSaveEnvelope(
      pcCampaign,
      'slot_1',
      3600,
      '2026-11-19T13:20:00.000Z',
      DEFAULT_GLOBAL_SETTINGS,
      null,
      defaultRpgDataRegistry,
      defaultDataRegistry
    );

    // 1. Save on Windows Electron PC & Export via Native Save Dialog (.op-save.json)
    await electronStorage.saveSlot('slot_1', pcEnvelope);
    const savedOnPc = await electronStorage.loadSlot('slot_1');
    expect(savedOnPc).not.toBeNull();

    const exportRes = await electronFileTransfer.exportSaveEnvelope(savedOnPc!);
    expect(exportRes.exported).toBe(true);
    expect(exportRes.filename).toMatch(/\.op-save\.json$/);

    // Read exported .op-save.json from disk via Electron native import dialog
    const importedFromDisk = await electronFileTransfer.importSaveEnvelopeFile();
    expect(importedFromDisk).not.toBeNull();

    // 2. Import that exact .op-save.json on Web PWA
    const webPreview = parseAndValidateImportedSaveJson(
      importedFromDisk!.jsonContent,
      defaultRpgDataRegistry,
      defaultDataRegistry
    );
    expect(webPreview.antiCheat.isTampered).toBe(false);
    expect(webPreview.antiCheat.onlineEligible).toBe(true);
    expect(webPreview.antiCheat.violationCodes).toEqual([]);

    await webStorage.saveSlot('slot_2', webPreview.envelope);
    const loadedOnWeb = await webStorage.loadSlot('slot_2');
    expect(loadedOnWeb).not.toBeNull();
    expect(verifySaveIntegrity(loadedOnWeb!).valid).toBe(true);
    expect(
      validateSaveLegality(
        loadedOnWeb!.payload,
        defaultRpgDataRegistry,
        defaultDataRegistry
      ).codes
    ).toEqual([]);
    expect(
      canEnterOnlineBattle(
        loadedOnWeb!,
        defaultRpgDataRegistry,
        defaultDataRegistry
      ).allowed
    ).toBe(true);

    // 3. Re-export from Web PWA and Import on Android APK (CapacitorFilesystemStorageAdapter)
    const webExportedJson = JSON.stringify(loadedOnWeb, null, 2);
    const androidPreview = parseAndValidateImportedSaveJson(
      webExportedJson,
      defaultRpgDataRegistry,
      defaultDataRegistry
    );
    expect(androidPreview.antiCheat.isTampered).toBe(false);
    expect(androidPreview.antiCheat.onlineEligible).toBe(true);
    expect(androidPreview.antiCheat.violationCodes).toEqual([]);

    await androidStorage.saveSlot('slot_3', androidPreview.envelope);
    const loadedOnAndroid = await androidStorage.loadSlot('slot_3');
    expect(loadedOnAndroid).not.toBeNull();
    expect(verifySaveIntegrity(loadedOnAndroid!).valid).toBe(true);
    expect(
      canEnterOnlineBattle(
        loadedOnAndroid!,
        defaultRpgDataRegistry,
        defaultDataRegistry
      ).allowed
    ).toBe(true);

    // Verify campaign state restored on Android matches original Windows PC state 100%
    const restoredAndroid = deserializeSaveEnvelopeToCampaign(
      loadedOnAndroid!,
      defaultRpgDataRegistry,
      defaultDataRegistry
    );
    expect(restoredAndroid.campaign.currentZoneId).toBe('new_world');
    expect(restoredAndroid.campaign.ship.shipId).toBe('thousand_sunny');
    expect(restoredAndroid.campaign.berries).toBe(1500000);
    expect(restoredAndroid.campaign.totalCrewBounty).toBe(3000000000);
    expect(restoredAndroid.campaign.onlineStats).toEqual({
      wins: 12,
      losses: 3,
      draws: 1
    });
  });
});
