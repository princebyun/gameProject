import rawProManifest from './pro_manifest.json';

export type ProAtlasFormatHint =
  | 'ASEPRITE_HASH'
  | 'ASEPRITE_ARRAY'
  | 'TEXTURE_PACKER'
  | 'LEGACY_META';

export interface ProSpriteManifestEntry {
  key: string;
  unitId: string;
  formId: string;
  image: string;
  atlasJson: string;
  anchor: { x: number; y: number };
  targetDisplayHeight: number;
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
  for (const section of ['sprites', 'portraits', 'cutins', 'maps', 'backgrounds', 'vfx'] as const) {
    if (!isObjectRecord(data[section])) {
      throw new Error(`[pro_manifest.json] Missing object section "${section}"`);
    }
  }
  return data as unknown as ProAssetManifestFile;
}

export const defaultProAssetManifest: ProAssetManifestFile =
  assertValidProAssetManifest(rawProManifest);

export function resolveProSpriteManifestEntry(
  unitId: string,
  formId: string | null = null,
  manifest: ProAssetManifestFile = defaultProAssetManifest
): ProSpriteManifestEntry | null {
  if (formId) {
    const formKey = `${unitId}_${formId}`;
    const foundForm = manifest.sprites[formKey];
    if (foundForm) return foundForm;
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
