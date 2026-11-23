import type { Texture } from 'pixi.js';
import type { ProManifestEntry } from '../../data/assets/proAssetManifest';

export type BundleTierKind = 'CORE' | 'SEA' | 'ISLAND' | 'BATTLE';

export interface PixiBundleAssetDescriptor {
  alias: string[];
  src: string;
  data?: { scaleMode: 'nearest' };
}

export interface PixiAssetsBundleDef {
  name: string;
  assets: PixiBundleAssetDescriptor[];
}

export interface PixiAssetsManifestPayload {
  bundles: PixiAssetsBundleDef[];
}

export interface PixiAssetsDriver {
  reset(): void;
  init(options: { manifest: PixiAssetsManifestPayload }): Promise<void>;
  loadBundle(
    bundleName: string,
    onProgress?: (progress: number) => void
  ): Promise<Record<string, Texture>>;
  unload(urls: string | string[]): Promise<void>;
}

export interface BundleTelemetryItem {
  bundle: string;
  tier: BundleTierKind;
  assetCount: number;
  loadedTextureCount: number;
  estimatedVramBytes: number;
  estimatedVramMb: number;
}

export interface VramTelemetrySnapshot {
  activeBundles: BundleTelemetryItem[];
  totalLoadedUrls: number;
  totalLoadedTextures: number;
  estimatedVramBytes: number;
  estimatedVramMb: number;
  budgetMb: number;
  overBudget: boolean;
  transitionEpoch: number;
  manifestProgress: {
    verified: number;
    imported: number;
    placeholder: number;
    total: number;
    readyPercent: number;
  };
  lastPrunedBundles: string[];
}

export interface BundleTransitionResult {
  committed: boolean;
  abortedByEpoch: boolean;
  activeBundles: string[];
  loadedBundles: string[];
  unloadedUrls: string[];
}

export interface RegisteredBundleRecord {
  bundleName: string;
  tier: BundleTierKind;
  entries: ProManifestEntry[];
  textureUrls: string[];
}
