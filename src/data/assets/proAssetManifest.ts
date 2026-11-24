import rawProManifest from '../../assets/pro_manifest.json';

export type ProAtlasFormatHint =
  | 'ASEPRITE_HASH'
  | 'ASEPRITE_ARRAY'
  | 'TEXTURE_PACKER'
  | 'LEGACY_META';

export type ProAssetCategory =
  | 'sprite'
  | 'portrait'
  | 'map'
  | 'tileset'
  | 'background'
  | 'vfx'
  | 'audio';

export type ProAssetWave = 0 | 1 | 2 | 3 | 4;
export type ProAssetTier = 'tier1_crew' | 'tier2_boss' | 'tier3_npc' | 'env';
export type ProAssetStatus = 'PLACEHOLDER' | 'IMPORTED' | 'VERIFIED';

export interface ProManifestEntry {
  id: string;
  category: ProAssetCategory;
  wave: ProAssetWave;
  tier: ProAssetTier;
  bundle: string;
  status: ProAssetStatus;
  assetPath: string;
  metaPath?: string | null;
  dimensions: { width: number; height: number };
  fileSizeBytes: number;
  estimatedVramBytes: number;
  updatedAt: string;
  unitId?: string;
  formId?: string;
  islandId?: string;
  seaZoneId?: string;
  isGiant?: boolean;
  sharedTilesetIds?: string[];
  sharedAssetIds?: string[];
}

export interface ProManifestStatusSummary {
  total: number;
  placeholder: number;
  imported: number;
  verified: number;
  totalDiskBytes: number;
  totalEstimatedVramBytes: number;
}

export interface ProSpriteManifestEntry {
  key: string;
  unitId: string;
  formId: string;
  image: string;
  atlasJson: string;
  anchor: { x: number; y: number };
  targetDisplayHeight: number;
  ppuScale?: number;
  referenceIdleHeight?: number;
  formatHint?: ProAtlasFormatHint;
}

export interface ProPortraitManifestEntry {
  image: string;
  width: number;
  height: number;
}

export interface ProCutinManifestEntry {
  image: string;
}

export interface ProMapManifestEntry {
  mapId: string;
  tmj: string;
  pixelScale: number;
  tilesets: string[];
}

export interface ProBackgroundManifestEntry {
  bgId: string;
  layers: [string, string, string, string];
  parallaxFactors: [number, number, number, number];
}

export interface ProVfxManifestEntry {
  id: string;
  image: string;
  atlasJson?: string;
  frameWidth: number;
  frameHeight: number;
  frameCount: number;
  fps: number;
  blendMode: 'normal' | 'add';
  scale: number;
}

export interface ProAssetManifestFile {
  version: string;
  entries: ProManifestEntry[];
  sprites: Record<string, ProSpriteManifestEntry>;
  portraits: Record<string, ProPortraitManifestEntry>;
  cutins: Record<string, ProCutinManifestEntry>;
  maps: Record<string, ProMapManifestEntry>;
  backgrounds: Record<string, ProBackgroundManifestEntry>;
  vfx: Record<string, ProVfxManifestEntry>;
}

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function assertValidProAssetManifest(data: unknown): ProAssetManifestFile {
  if (!isObjectRecord(data)) {
    throw new Error('[pro_manifest.json] Root must be an object');
  }
  if (typeof data.version !== 'string' || !data.version) {
    throw new Error('[pro_manifest.json] Missing version string');
  }
  if (!Array.isArray(data.entries)) {
    throw new Error('[pro_manifest.json] Missing entries array');
  }
  for (const section of ['sprites', 'portraits', 'cutins', 'maps', 'backgrounds', 'vfx'] as const) {
    if (!isObjectRecord(data[section])) {
      throw new Error(`[pro_manifest.json] Missing object section "${section}"`);
    }
  }
  return data as unknown as ProAssetManifestFile;
}

export const defaultProAssetManifest: ProAssetManifestFile =
  assertValidProAssetManifest(rawProManifest);

/**
 * Read-only alias table bridging canonical engine form IDs (`src/data/forms.json`)
 * to Wave 3 pro external sprite asset keys (`raw_assets/packs/` drop naming).
 */
export const PRO_FORM_KEY_ALIASES: Readonly<Record<string, string>> = {
  chopper_form_chopper_monster: 'chopper_monster_point',
  robin_form_robin_demonio: 'robin_demonio_fleur',
  franky_form_franky_shogun: 'franky_general',
  lucci_form_lucci_awakened: 'lucci_awakened',
  kaido_form_kaido_beast: 'kaido_dragon',
  kaido_form_kaido_flame_dragon: 'kaido_dragon',
  saturn_form_saturn_gyuki: 'saturn_yokai',
  loki_form_loki_ragnir: 'loki_giant'
};

export function resolveProSpriteManifestEntry(
  unitId: string,
  formId: string | null = null,
  manifest: ProAssetManifestFile = defaultProAssetManifest
): ProSpriteManifestEntry | null {
  if (formId) {
    const formKey = `${unitId}_${formId}`;
    const foundForm = manifest.sprites[formKey];
    if (foundForm) return foundForm;
    const aliasKey = PRO_FORM_KEY_ALIASES[formKey];
    if (aliasKey && manifest.sprites[aliasKey]) {
      return manifest.sprites[aliasKey];
    }
  }
  return manifest.sprites[`${unitId}_base`] ?? null;
}

export function resolveProPortraitManifestEntry(
  unitId: string,
  emotion = 'normal',
  manifest: ProAssetManifestFile = defaultProAssetManifest
): ProPortraitManifestEntry | null {
  return (
    manifest.portraits[`${unitId}_${emotion}`] ??
    manifest.portraits[`${unitId}_normal`] ??
    null
  );
}

export function getProManifestStatusSummary(
  manifest: ProAssetManifestFile = defaultProAssetManifest
): ProManifestStatusSummary {
  let placeholder = 0;
  let imported = 0;
  let verified = 0;
  let totalDiskBytes = 0;
  let totalEstimatedVramBytes = 0;

  for (const ent of manifest.entries) {
    if (ent.status === 'PLACEHOLDER') placeholder += 1;
    else if (ent.status === 'IMPORTED') imported += 1;
    else if (ent.status === 'VERIFIED') verified += 1;
    totalDiskBytes += ent.fileSizeBytes;
    totalEstimatedVramBytes += ent.estimatedVramBytes;
  }

  return {
    total: manifest.entries.length,
    placeholder,
    imported,
    verified,
    totalDiskBytes,
    totalEstimatedVramBytes
  };
}

export function findProSpriteManifestStatus(
  unitId: string,
  formId: string | null = null,
  manifest: ProAssetManifestFile = defaultProAssetManifest
): ProManifestEntry | null {
  const form = formId && formId.length > 0 ? formId : 'base';
  const rawKey = `${unitId}_${form}`;
  const aliasKey = PRO_FORM_KEY_ALIASES[rawKey];
  const exact = manifest.entries.find(
    (e) =>
      e.id === `sprite:${rawKey}` ||
      (aliasKey ? e.id === `sprite:${aliasKey}` : false) ||
      (e.category === 'sprite' && e.unitId === unitId && e.formId === form)
  );
  if (exact) return exact;
  return (
    manifest.entries.find(
      (e) => e.id === `sprite:${unitId}_base` || (e.category === 'sprite' && e.unitId === unitId && e.formId === 'base')
    ) ?? null
  );
}

export function findProTilesetManifestStatus(
  tilesetOrBiomeId: string,
  manifest: ProAssetManifestFile = defaultProAssetManifest
): ProManifestEntry | null {
  return (
    manifest.entries.find(
      (e) =>
        e.category === 'tileset' &&
        (e.id === `tileset:${tilesetOrBiomeId}` ||
          e.id.includes(tilesetOrBiomeId) ||
          e.assetPath.includes(tilesetOrBiomeId))
    ) ?? null
  );
}

export function findProMapManifestStatus(
  islandId: string,
  manifest: ProAssetManifestFile = defaultProAssetManifest
): ProManifestEntry | null {
  return (
    manifest.entries.find(
      (e) => e.category === 'map' && (e.islandId === islandId || e.id === `map:${islandId}`)
    ) ?? null
  );
}

export function getManifestEntriesByBundle(
  manifest: ProAssetManifestFile = defaultProAssetManifest,
  includePlaceholders = false
): Map<string, ProManifestEntry[]> {
  const map = new Map<string, ProManifestEntry[]>();
  for (const ent of manifest.entries) {
    if (!includePlaceholders && ent.status === 'PLACEHOLDER') continue;
    let arr = map.get(ent.bundle);
    if (!arr) {
      arr = [];
      map.set(ent.bundle, arr);
    }
    arr.push(ent);
  }
  return map;
}
