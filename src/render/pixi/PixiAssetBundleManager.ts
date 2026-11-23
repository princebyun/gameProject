import { Assets, TextureStyle, type Texture } from 'pixi.js';
import type { Disposable } from '../../core/types/disposable';
import {
  defaultProAssetManifest,
  getProManifestStatusSummary,
  type ProAssetManifestFile,
  type ProManifestEntry
} from '../../data/assets/proAssetManifest';
import {
  normalizeProAssetUrl,
  type ProAssetLoader
} from './ProAssetLoader';
import type { PixiBundleLoadingOverlay } from './PixiBundleLoadingOverlay';
import {
  buildRegisteredBundlesAndManifest,
  isTextureAssetEntry,
  normalizeRelUrl,
  resolveBattleBundleName,
  resolveIslandBundleName,
  resolveSeaBundleName
} from './pixiBundleHelpers';
import type {
  BundleTelemetryItem,
  BundleTransitionResult,
  PixiAssetsDriver,
  RegisteredBundleRecord,
  VramTelemetrySnapshot
} from './pixiBundleTypes';

export { resolveBattleBundleName, resolveIslandBundleName, resolveSeaBundleName };

export const MOBILE_VRAM_BUDGET_MB = 128;
const MAX_ACTIVE_PARTY_UNITS = 4;

function createDefaultPixiAssetsDriver(): PixiAssetsDriver {
  return {
    reset: () => {
      Assets.reset();
    },
    init: async (options) => {
      await Assets.init({ manifest: options.manifest });
    },
    loadBundle: async (bundleName, onProgress) => {
      const res = await Assets.loadBundle(bundleName, onProgress);
      return (res ?? {}) as Record<string, Texture>;
    },
    unload: async (urls) => {
      await Assets.unload(urls);
    }
  };
}

export class PixiAssetBundleManager implements Disposable {
  private readonly driver: PixiAssetsDriver;
  private bundleRecords = new Map<string, RegisteredBundleRecord>();
  private entryByRelUrl = new Map<string, ProManifestEntry>();
  private readonly assetRefCount = new Map<string, number>();
  private readonly loadedTexturesByRelUrl = new Map<string, Texture>();
  private readonly pinnedCoreUrls = new Set<string>();
  private readonly activePartyUnitIds = new Set<string>();
  private readonly activeNonCoreBundles = new Set<string>();
  private readonly desiredNonCoreBundles = new Set<string>();

  private manifest: ProAssetManifestFile = defaultProAssetManifest;
  private loadingOverlay: PixiBundleLoadingOverlay | null = null;
  private transitionEpoch = 0;
  private coreLoaded = false;
  private initialized = false;
  private disposed = false;
  private warnedOverBudget = false;
  private lastPrunedBundles: string[] = [];

  constructor(
    private readonly loader: ProAssetLoader,
    driver?: PixiAssetsDriver
  ) {
    this.driver = driver ?? createDefaultPixiAssetsDriver();
    TextureStyle.defaultOptions.scaleMode = 'nearest';
  }

  public attachLoadingOverlay(overlay: PixiBundleLoadingOverlay | null): void {
    this.loadingOverlay = overlay;
  }

  public isInitialized(): boolean {
    return this.initialized;
  }

  public getTransitionEpoch(): number {
    return this.transitionEpoch;
  }

  public getAssetRefCount(relUrl: string): number {
    return this.assetRefCount.get(normalizeRelUrl(relUrl)) ?? 0;
  }

  public getActiveBundleNames(): string[] {
    const names: string[] = [];
    if (this.coreLoaded) names.push('core_always');
    const activePartyBundles: string[] = [];
    for (const uid of this.activePartyUnitIds) {
      const partyName = `party_${uid}`;
      const rec = this.bundleRecords.get(partyName);
      if (!rec || rec.textureUrls.length === 0) continue;
      const hasNonPinned = rec.textureUrls.some((url) => !this.pinnedCoreUrls.has(url));
      if (hasNonPinned) {
        activePartyBundles.push(partyName);
      }
    }
    for (const pb of activePartyBundles.sort()) {
      names.push(pb);
    }
    for (const b of Array.from(this.activeNonCoreBundles).sort()) {
      names.push(b);
    }
    return names;
  }

  public hasBundle(bundleName: string): boolean {
    return this.bundleRecords.has(bundleName);
  }

  public async init(manifest: ProAssetManifestFile = defaultProAssetManifest): Promise<void> {
    if (this.disposed) return;
    this.manifest = manifest;
    this.loader.manifest = manifest;
    TextureStyle.defaultOptions.scaleMode = 'nearest';

    const built = buildRegisteredBundlesAndManifest(manifest);
    this.bundleRecords = built.bundleRecords;
    this.entryByRelUrl = built.entryByRelUrl;

    this.driver.reset();
    await this.driver.init({ manifest: built.payload });
    this.initialized = true;
  }

  public async loadCoreBundle(initialPartyUnitIds: readonly string[] = ['luffy']): Promise<void> {
    if (this.disposed) return;
    if (!this.initialized) {
      await this.init(this.manifest);
    }
    const coreRecord = this.bundleRecords.get('core_always');
    if (!this.coreLoaded && coreRecord) {
      for (const url of coreRecord.textureUrls) {
        this.pinnedCoreUrls.add(url);
      }
      await this.acquireBundleInternal('core_always');
      this.coreLoaded = true;
    }
    await this.syncActivePartyAssets(initialPartyUnitIds);
  }

  public async syncActivePartyAssets(unitIds: readonly string[]): Promise<void> {
    if (this.disposed) return;
    if (!this.initialized) {
      await this.init(this.manifest);
    }
    const nextUnits = new Set<string>();
    for (const uid of unitIds) {
      if (uid && nextUnits.size < MAX_ACTIVE_PARTY_UNITS) {
        nextUnits.add(uid);
      }
    }

    for (const uid of nextUnits) {
      if (this.activePartyUnitIds.has(uid)) continue;
      await this.acquireBundleInternal(`party_${uid}`);
    }

    for (const prevUid of Array.from(this.activePartyUnitIds)) {
      if (nextUnits.has(prevUid)) continue;
      await this.releaseBundleInternal(`party_${prevUid}`);
    }

    this.activePartyUnitIds.clear();
    for (const uid of nextUnits) {
      this.activePartyUnitIds.add(uid);
    }
    this.checkVramBudgetWarning();
  }

  public async loadSceneBundles(
    targetBundles: readonly string[],
    onProgress?: (progress: number) => void
  ): Promise<BundleTransitionResult> {
    if (this.disposed) {
      return {
        committed: false,
        abortedByEpoch: false,
        activeBundles: [],
        loadedBundles: [],
        unloadedUrls: []
      };
    }
    if (!this.initialized) {
      await this.init(this.manifest);
    }
    if (!this.coreLoaded) {
      await this.loadCoreBundle(Array.from(this.activePartyUnitIds));
    }

    const myEpoch = ++this.transitionEpoch;
    const targetNonCore = Array.from(
      new Set(
        targetBundles.filter(
          (b) =>
            b &&
            b !== 'core_always' &&
            !b.startsWith('party_') &&
            this.bundleRecords.has(b)
        )
      )
    );

    this.desiredNonCoreBundles.clear();
    for (const b of targetNonCore) {
      this.desiredNonCoreBundles.add(b);
    }

    const toAcquire = targetNonCore.filter((b) => !this.activeNonCoreBundles.has(b));
    const loadToken =
      toAcquire.length > 0 ? this.loadingOverlay?.beginLoad('에셋 로딩') : undefined;

    const acquiredInThisEpoch: string[] = [];
    const totalSteps = Math.max(1, toAcquire.length);

    for (let i = 0; i < toAcquire.length; i++) {
      const bName = toAcquire[i]!;
      await this.acquireBundleInternal(bName, (p) => {
        const overall = (i + p) / totalSteps;
        this.loadingOverlay?.setProgress(overall);
        onProgress?.(overall);
      });
      acquiredInThisEpoch.push(bName);

      if (myEpoch !== this.transitionEpoch || this.disposed) {
        const rolledBackUrls = await this.rollbackEpochBundles(acquiredInThisEpoch);
        this.loadingOverlay?.endLoad(loadToken);
        return {
          committed: false,
          abortedByEpoch: true,
          activeBundles: this.getActiveBundleNames(),
          loadedBundles: [],
          unloadedUrls: rolledBackUrls
        };
      }
    }

    for (const b of acquiredInThisEpoch) {
      this.activeNonCoreBundles.add(b);
    }

    const targetSet = new Set(targetNonCore);
    const toRelease = Array.from(this.activeNonCoreBundles).filter((b) => !targetSet.has(b));
    const unloadedUrls: string[] = [];

    for (const oldBundle of toRelease) {
      this.activeNonCoreBundles.delete(oldBundle);
      const freed = await this.releaseBundleInternal(oldBundle);
      unloadedUrls.push(...freed);
    }

    if (toAcquire.length === 0) {
      onProgress?.(1);
    }
    this.loadingOverlay?.endLoad(loadToken);
    this.checkVramBudgetWarning();

    return {
      committed: true,
      abortedByEpoch: false,
      activeBundles: this.getActiveBundleNames(),
      loadedBundles: acquiredInThisEpoch,
      unloadedUrls
    };
  }

  public async pruneUnusedBundles(): Promise<{ prunedBundles: string[]; unloadedUrls: string[] }> {
    const toPrune = Array.from(this.activeNonCoreBundles).filter(
      (b) => !this.desiredNonCoreBundles.has(b)
    );
    const unloadedUrls: string[] = [];
    for (const b of toPrune) {
      this.activeNonCoreBundles.delete(b);
      const freed = await this.releaseBundleInternal(b);
      unloadedUrls.push(...freed);
    }
    this.loader.releaseTransientSubTextures();
    this.lastPrunedBundles = toPrune;
    return { prunedBundles: toPrune, unloadedUrls };
  }

  public getVramTelemetry(): VramTelemetrySnapshot {
    const activeNames = this.getActiveBundleNames();
    const activeBundles: BundleTelemetryItem[] = [];

    for (const bName of activeNames) {
      const rec = this.bundleRecords.get(bName);
      if (!rec) continue;
      let loadedTextureCount = 0;
      let bundleVram = 0;
      for (const url of rec.textureUrls) {
        if (this.loadedTexturesByRelUrl.has(url) || (this.assetRefCount.get(url) ?? 0) > 0) {
          loadedTextureCount += 1;
          bundleVram += this.entryByRelUrl.get(url)?.estimatedVramBytes ?? 0;
        }
      }
      activeBundles.push({
        bundle: bName,
        tier: rec.tier,
        assetCount: rec.entries.length,
        loadedTextureCount,
        estimatedVramBytes: bundleVram,
        estimatedVramMb: Number((bundleVram / (1024 * 1024)).toFixed(2))
      });
    }

    let totalVram = 0;
    for (const url of this.assetRefCount.keys()) {
      totalVram += this.entryByRelUrl.get(url)?.estimatedVramBytes ?? 0;
    }

    const totalMb = Number((totalVram / (1024 * 1024)).toFixed(2));
    const ms = getProManifestStatusSummary(this.manifest);
    const readyCount = ms.verified + ms.imported;

    return {
      activeBundles,
      totalLoadedUrls: this.assetRefCount.size,
      totalLoadedTextures: Math.max(
        this.loadedTexturesByRelUrl.size,
        this.loader.getLoadedTextureCount()
      ),
      estimatedVramBytes: totalVram,
      estimatedVramMb: totalMb,
      budgetMb: MOBILE_VRAM_BUDGET_MB,
      overBudget: totalMb > MOBILE_VRAM_BUDGET_MB,
      transitionEpoch: this.transitionEpoch,
      manifestProgress: {
        verified: ms.verified,
        imported: ms.imported,
        placeholder: ms.placeholder,
        total: ms.total,
        readyPercent: ms.total > 0 ? Number(((readyCount / ms.total) * 100).toFixed(1)) : 0
      },
      lastPrunedBundles: [...this.lastPrunedBundles]
    };
  }

  private async acquireBundleInternal(
    bundleName: string,
    onProgress?: (p: number) => void
  ): Promise<void> {
    const rec = this.bundleRecords.get(bundleName);
    if (!rec) return;

    for (const url of rec.textureUrls) {
      this.assetRefCount.set(url, (this.assetRefCount.get(url) ?? 0) + 1);
    }

    if (rec.textureUrls.length === 0) {
      onProgress?.(1);
      return;
    }

    const loadedMap = await this.driver.loadBundle(bundleName, onProgress);
    this.syncLoadedBundleTextures(rec, loadedMap);
    await this.hydrateSpriteMetadataForBundle(rec);
  }

  private syncLoadedBundleTextures(
    rec: RegisteredBundleRecord,
    loadedMap: Record<string, Texture>
  ): void {
    for (const ent of rec.entries) {
      if (!isTextureAssetEntry(ent)) continue;
      const relUrl = normalizeRelUrl(ent.assetPath);
      const tex =
        loadedMap[ent.id] ??
        loadedMap[relUrl] ??
        loadedMap[normalizeProAssetUrl(relUrl)];
      if (!tex) continue;

      if (tex.source) {
        tex.source.scaleMode = 'nearest';
      }
      this.loadedTexturesByRelUrl.set(relUrl, tex);

      if (ent.category === 'sprite' && ent.unitId) {
        const key = `${ent.unitId}_${ent.formId ?? 'base'}`;
        this.loader.registerExternalTexture(`sprite_base_${key}`, relUrl, tex);
      } else if (ent.category === 'portrait') {
        const pKey = ent.id.replace(/^portrait:/, '');
        if (pKey.endsWith('_cutin')) {
          this.loader.registerExternalTexture(`cutin_${pKey.replace(/_cutin$/, '')}`, relUrl, tex);
        } else {
          this.loader.registerExternalTexture(`portrait_${pKey}`, relUrl, tex);
        }
      } else if (ent.category === 'vfx') {
        this.loader.registerExternalTexture(`vfx_${ent.id.replace(/^vfx:/, '')}`, relUrl, tex);
      } else if (ent.category === 'tileset') {
        this.loader.registerExternalTexture(`tileset_${relUrl}`, relUrl, tex);
      } else if (ent.category === 'background') {
        const m = ent.id.match(/^bg:(.+)_layer(\d+)$/);
        this.loader.registerExternalTexture(
          m ? `bg_${m[1]}_layer${m[2]}` : `bg_${ent.id}`,
          relUrl,
          tex
        );
      }
    }
  }

  private async hydrateSpriteMetadataForBundle(rec: RegisteredBundleRecord): Promise<void> {
    const tasks: Promise<unknown>[] = [];
    for (const ent of rec.entries) {
      if (ent.category === 'sprite' && ent.unitId) {
        const spriteManifest = this.manifest.sprites[`${ent.unitId}_${ent.formId ?? 'base'}`];
        if (spriteManifest) tasks.push(this.loader.loadSpriteAtlas(spriteManifest));
      } else if (ent.category === 'vfx') {
        const vfxManifest = this.manifest.vfx[ent.id.replace(/^vfx:/, '')];
        if (vfxManifest) tasks.push(this.loader.loadVfxAtlas(vfxManifest));
      }
    }
    if (tasks.length > 0) await Promise.all(tasks);
  }

  private async releaseBundleInternal(bundleName: string): Promise<string[]> {
    const rec = this.bundleRecords.get(bundleName);
    if (!rec) return [];

    const urlsToUnload: string[] = [];
    for (const url of rec.textureUrls) {
      const next = Math.max(0, (this.assetRefCount.get(url) ?? 0) - 1);
      if (next === 0) {
        if (this.pinnedCoreUrls.has(url)) {
          this.assetRefCount.set(url, 1);
        } else {
          this.assetRefCount.delete(url);
          urlsToUnload.push(url);
        }
      } else {
        this.assetRefCount.set(url, next);
      }
    }

    if (urlsToUnload.length > 0) {
      await this.unloadUrlsFromGpu(urlsToUnload);
    }
    return urlsToUnload;
  }

  private async rollbackEpochBundles(bundleNames: readonly string[]): Promise<string[]> {
    const freed: string[] = [];
    for (const bName of bundleNames) {
      const urls = await this.releaseBundleInternal(bName);
      freed.push(...urls);
    }
    return freed;
  }

  private async unloadUrlsFromGpu(relUrls: readonly string[]): Promise<void> {
    const driverUnloadTargets: string[] = [];
    for (const relUrl of relUrls) {
      this.loadedTexturesByRelUrl.delete(relUrl);
      this.loader.evictByRelPath(relUrl);
      driverUnloadTargets.push(relUrl);
    }
    if (driverUnloadTargets.length > 0) {
      try {
        await this.driver.unload(driverUnloadTargets);
      } catch {
        // Ignore mock drivers that do not track every partial alias
      }
    }
  }

  private checkVramBudgetWarning(): void {
    const snap = this.getVramTelemetry();
    const isDev =
      typeof import.meta !== 'undefined' &&
      Boolean((import.meta as { env?: { DEV?: boolean } }).env?.DEV);
    if (snap.overBudget && isDev && !this.warnedOverBudget) {
      this.warnedOverBudget = true;
      console.warn(
        `[PixiAssetBundleManager] Estimated VRAM ${snap.estimatedVramMb}MB exceeds ${MOBILE_VRAM_BUDGET_MB}MB mobile budget!`
      );
    } else if (!snap.overBudget) {
      this.warnedOverBudget = false;
    }
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.transitionEpoch += 1;
    this.loadingOverlay?.dispose();
    this.loadingOverlay = null;
    this.activeNonCoreBundles.clear();
    this.desiredNonCoreBundles.clear();
    this.pinnedCoreUrls.clear();
    this.activePartyUnitIds.clear();
    this.assetRefCount.clear();
    this.loadedTexturesByRelUrl.clear();
    this.coreLoaded = false;
    this.initialized = false;
  }
}
