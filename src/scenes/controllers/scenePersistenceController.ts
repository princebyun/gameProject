import type { SaveEnvelope, SaveSlotId } from '../../core/save/schema';
import {
  deserializeSaveEnvelopeToCampaign,
  serializeCampaignToSaveEnvelope
} from '../../core/save/serializer';
import type { ImportedSavePreview } from '../../platform/storage/saveFileIO';
import { StoryDirector } from '../../story/storyDirector';
import { renderSaveManagerModal } from '../modals/saveManagerModal';
import type { Disposable } from '../sceneTypes';
import { formatPlayTime, type TitleSavePreview } from '../titleScene';
import type { SceneManagerHost } from './controllerContracts';
import type { SceneAudioDirector } from './sceneAudioDirector';

export class ScenePersistenceController implements Disposable {
  private pendingImportPreview: ImportedSavePreview | null = null;
  private pendingImportTargetSlot: SaveSlotId = 'slot_1';

  constructor(
    private readonly host: SceneManagerHost,
    private readonly audioDirector: SceneAudioDirector
  ) {}

  public dispose(): void {
    this.pendingImportPreview = null;
  }

  public buildTitleSavePreview(envelope: SaveEnvelope): TitleSavePreview {
    const temp = deserializeSaveEnvelopeToCampaign(
      envelope,
      this.host.rpgRegistry,
      this.host.gameRegistry
    );
    const tempDirector = new StoryDirector();
    const node = tempDirector.syncFromLoadedCampaign(temp.campaign);
    const island = temp.campaign.activeIslandId
      ? this.host.rpgRegistry.islands[temp.campaign.activeIslandId]
      : null;
    const zone = this.host.rpgRegistry.seaZones[temp.campaign.currentZoneId];
    return {
      envelope,
      chapterLabel: node.chapterLabel,
      locationName: island
        ? `🏝 ${island.name}`
        : `⚓ ${zone?.name ?? envelope.meta.summary.currentZoneName}`,
      bounty: temp.campaign.totalCrewBounty,
      playTimeLabel: formatPlayTime(envelope.meta.playTimeSec ?? 0)
    };
  }

  public buildCurrentSaveEnvelope(slotId: SaveSlotId): SaveEnvelope {
    return serializeCampaignToSaveEnvelope(
      this.host.campaign,
      slotId,
      this.host.playTimeSec,
      new Date().toISOString(),
      this.audioDirector.getCurrentGlobalSettings(),
      this.host.islandRuntime,
      this.host.rpgRegistry,
      this.host.gameRegistry,
      this.host.isCurrentSaveTampered
    );
  }

  public async triggerAutoSave(reason: string): Promise<void> {
    this.host.saveIndicatorText = `💾 저장 중... (${reason})`;
    this.host.saveIndicatorTimer = 2.2;
    const envelope = this.buildCurrentSaveEnvelope('auto');
    await this.host.storage.saveSlot('auto', envelope);
    this.host.saveIndicatorText = `✓ 자동 저장됨 (${reason})`;
  }

  public async saveToSlot(slotId: SaveSlotId): Promise<SaveEnvelope> {
    const envelope = this.buildCurrentSaveEnvelope(slotId);
    await this.host.storage.saveSlot(slotId, envelope);
    await this.host.storage.saveGlobalSettings(this.audioDirector.getCurrentGlobalSettings());
    this.host.saveIndicatorText = `✓ [${slotId}] 저장 완료`;
    this.host.saveIndicatorTimer = 2.4;
    this.host.campaign.voyageLog.push(`[세이브] 슬롯 [${slotId}]에 현재 진행 상태를 저장했습니다.`);
    this.host.refreshSideDrawer();
    return envelope;
  }

  public applyLoadedEnvelope(envelope: SaveEnvelope): void {
    const restored = deserializeSaveEnvelopeToCampaign(
      envelope,
      this.host.rpgRegistry,
      this.host.gameRegistry
    );
    this.host.campaign = restored.campaign;
    this.host.islandRuntime = restored.islandRuntime;
    this.host.playTimeSec = envelope.meta.playTimeSec ?? 0;
    this.host.isCurrentSaveTampered = envelope.meta.antiCheat.isTampered;
    this.host.currentViolationCodes = [...envelope.meta.antiCheat.violationCodes];

    this.audioDirector.applyAudioAndVisualSettings(restored.settings);
    this.host.storyDirector.syncFromLoadedCampaign(this.host.campaign);
    this.host.titleScene?.hide();

    if (this.host.campaign.activeIslandId && this.host.islandRuntime) {
      this.host.activeScene = 'ISLAND_EPISODE';
    } else {
      this.host.activeScene = 'SEA_SAILING';
    }

    this.host.updateFloatingHudToggleVisibility();
    this.host.syncSceneBgm();
    this.host.syncActivePartyBundles?.();
    this.host.syncSceneBundles?.();
    this.host.updateShowcaseToolbar();
    this.host.refreshSideDrawer();
  }

  public async scanLatestSaveOnBoot(): Promise<void> {
    const savedSettings = await this.host.storage.loadGlobalSettings();
    if (savedSettings) {
      this.audioDirector.applyAudioAndVisualSettings(savedSettings);
    }

    const slots = await this.host.storage.listAllSlots();
    let latest: SaveEnvelope | null = null;
    for (const s of Object.values(slots)) {
      if (!s) continue;
      if (!latest || (s.meta.savedAt || '') > (latest.meta.savedAt || '')) {
        latest = s;
      }
    }

    this.host.latestBootSaveEnvelope = latest;
  }

  public async openSaveManagerModal(errorMessage?: string): Promise<void> {
    await renderSaveManagerModal(
      {
        saveModalEl: this.host.saveModalEl,
        storage: this.host.storage,
        platformBridge: this.host.platformBridge,
        campaign: this.host.campaign,
        rpgRegistry: this.host.rpgRegistry,
        gameRegistry: this.host.gameRegistry,
        getPendingImportPreview: () => this.pendingImportPreview,
        setPendingImportPreview: (preview) => {
          this.pendingImportPreview = preview;
        },
        getPendingImportTargetSlot: () => this.pendingImportTargetSlot,
        setPendingImportTargetSlot: (slot) => {
          this.pendingImportTargetSlot = slot;
        },
        buildCurrentSaveEnvelope: (slot) => this.buildCurrentSaveEnvelope(slot),
        saveToSlot: (slot) => this.saveToSlot(slot),
        applyLoadedEnvelope: (env) => this.applyLoadedEnvelope(env),
        syncLogsDom: () => this.host.syncLogsDom()
      },
      errorMessage
    );
  }
}
