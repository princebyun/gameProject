import type { BattleWorldState } from '../../core/types/battleState';
import type { BattleContext } from '../../core/types/rpgSchemas';
import type {
  ProAssetManifestFile,
  ProManifestEntry
} from '../../data/assets/proAssetManifest';
import { normalizeProAssetUrl } from './ProAssetLoader';
import type {
  BundleTierKind,
  PixiAssetsBundleDef,
  PixiAssetsManifestPayload,
  RegisteredBundleRecord
} from './pixiBundleTypes';

export function normalizeRelUrl(relPath: string): string {
  return relPath.replace(/\\/g, '/').replace(/^\.\//, '');
}

export function isTextureAssetEntry(entry: ProManifestEntry): boolean {
  if (entry.status === 'PLACEHOLDER') return false;
  if (entry.category === 'audio' || entry.category === 'map') return false;
  const lower = entry.assetPath.toLowerCase();
  return lower.endsWith('.webp') || lower.endsWith('.png');
}

export function inferBundleTierKind(bundleName: string): BundleTierKind {
  if (bundleName === 'core_always' || bundleName.startsWith('party_')) return 'CORE';
  if (bundleName.startsWith('sea_')) return 'SEA';
  if (bundleName.startsWith('island_')) return 'ISLAND';
  return 'BATTLE';
}

export function resolveIslandBundleName(islandId: string): string {
  if (islandId === 'foosha_shells' || islandId === 'foosha_village') {
    return 'island_foosha_village';
  }
  if (islandId === 'wano_onigashima' || islandId === 'wano_country') {
    return 'island_wano_country';
  }
  return `island_${islandId}`;
}

export function resolveSeaBundleName(seaZoneId: string): string {
  return seaZoneId.startsWith('sea_') ? seaZoneId : `sea_${seaZoneId}`;
}

const WAVE1_NAMED_BOSS_IDS = new Set(['morgan', 'buggy', 'arlong']);

export function resolveBattleBundleName(
  ctx: BattleContext | null,
  world?: BattleWorldState | null
): string {
  if (!ctx) {
    const namedWave1 = world?.units.find(
      (u) => u.team === 'OMEGA' && WAVE1_NAMED_BOSS_IDS.has(u.speciesId)
    );
    if (namedWave1) {
      return `battle_${namedWave1.speciesId}`;
    }
    const boss = world?.units.find((u) => u.team === 'OMEGA' && u.isBossUnit);
    if (boss) {
      return `battle_${boss.speciesId}`;
    }
    return 'battle_east_blue_harbor';
  }
  if (
    ctx.zoneId === 'east_blue' &&
    (!ctx.enemyUnitIds.some(
      (id) =>
        id === 'morgan' ||
        id === 'buggy' ||
        id === 'don_krieg' ||
        id === 'arlong' ||
        id === 'smoker'
    ) ||
      ctx.encounterId === 'enc_ch1_alvida_tutorial')
  ) {
    return 'battle_east_blue_harbor';
  }
  const primaryBoss = ctx.enemyUnitIds[0] ?? 'east_blue_harbor';
  return `battle_${primaryBoss}`;
}

export function buildRegisteredBundlesAndManifest(manifest: ProAssetManifestFile): {
  bundleRecords: Map<string, RegisteredBundleRecord>;
  entryById: Map<string, ProManifestEntry>;
  entryByRelUrl: Map<string, ProManifestEntry>;
  payload: PixiAssetsManifestPayload;
} {
  const bundleRecords = new Map<string, RegisteredBundleRecord>();
  const entryById = new Map<string, ProManifestEntry>();
  const entryByRelUrl = new Map<string, ProManifestEntry>();
  const byBundle = new Map<string, ProManifestEntry[]>();
  const byUnitId = new Map<string, ProManifestEntry[]>();

  for (const ent of manifest.entries) {
    entryById.set(ent.id, ent);
    const norm = normalizeRelUrl(ent.assetPath);
    entryByRelUrl.set(norm, ent);

    let list = byBundle.get(ent.bundle);
    if (!list) {
      list = [];
      byBundle.set(ent.bundle, list);
    }
    list.push(ent);

    if (ent.unitId && isTextureAssetEntry(ent)) {
      let uList = byUnitId.get(ent.unitId);
      if (!uList) {
        uList = [];
        byUnitId.set(ent.unitId, uList);
      }
      uList.push(ent);
    }
  }

  for (const [bundleName, entries] of byBundle.entries()) {
    const urlSet = new Set<string>();
    const allEntries = [...entries];

    for (const ent of entries) {
      if (isTextureAssetEntry(ent)) {
        urlSet.add(normalizeRelUrl(ent.assetPath));
      }
      const sharedIds = [
        ...(ent.sharedTilesetIds ?? []),
        ...(ent.sharedAssetIds ?? [])
      ];
      for (const sharedId of sharedIds) {
        const sharedEnt = entryById.get(sharedId);
        if (sharedEnt && isTextureAssetEntry(sharedEnt)) {
          urlSet.add(normalizeRelUrl(sharedEnt.assetPath));
          if (!allEntries.some((x) => x.id === sharedEnt.id)) {
            allEntries.push(sharedEnt);
          }
        }
      }
    }

    bundleRecords.set(bundleName, {
      bundleName,
      tier: inferBundleTierKind(bundleName),
      entries: allEntries,
      textureUrls: Array.from(urlSet)
    });
  }

  // Register per-unit incremental party_{unitId} bundles for syncActivePartyAssets
  for (const [unitId, unitEntries] of byUnitId.entries()) {
    const partyBundleName = `party_${unitId}`;
    if (bundleRecords.has(partyBundleName)) continue;
    const urlSet = new Set<string>();
    for (const ent of unitEntries) {
      urlSet.add(normalizeRelUrl(ent.assetPath));
    }
    bundleRecords.set(partyBundleName, {
      bundleName: partyBundleName,
      tier: 'CORE',
      entries: [...unitEntries],
      textureUrls: Array.from(urlSet)
    });
  }

  const pixiBundles: PixiAssetsBundleDef[] = [];
  for (const [bundleName, record] of bundleRecords.entries()) {
    pixiBundles.push({
      name: bundleName,
      assets: record.textureUrls.map((relUrl) => {
        const ent = entryByRelUrl.get(relUrl);
        return {
          alias: ent ? [ent.id, relUrl] : [relUrl],
          src: normalizeProAssetUrl(relUrl),
          data: { scaleMode: 'nearest' }
        };
      })
    });
  }

  return {
    bundleRecords,
    entryById,
    entryByRelUrl,
    payload: { bundles: pixiBundles }
  };
}
