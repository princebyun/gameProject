export const GLB_MAGIC: number;
export const GLB_JSON_CHUNK_TYPE: number;
export const GLB_BIN_CHUNK_TYPE: number;
export const DEFAULT_MAX_TRIS_STANDARD: number;
export const DEFAULT_MAX_TRIS_BOSS: number;
export const DEFAULT_MAX_TRIS_WEAPON: number;
export const DEFAULT_MAX_TEX_DIM: number;
export const DEFAULT_MAX_FILE_BYTES: number;
export const ALLOWED_WEAPON_BONES: readonly string[];

export interface ParsedGlb {
  version: number;
  totalLength: number;
  json: Record<string, unknown>;
  binBuffer: Buffer;
}

export interface GlbAuditOptions {
  requireDraco?: boolean;
  maxTexDim?: number;
  maxFileBytes?: number;
  maxTriangles?: number;
}

export interface GlbAuditReport {
  fileName: string;
  ok: boolean;
  hasDracoExt: boolean;
  triangleCount: number;
  maxTriangles: number;
  maxObservedTexDim: number;
  imageFormats: string[];
  sizeBytes: number;
  clipCount: number;
  missingClips: string[];
  missingSockets: string[];
  errors: string[];
  warnings: string[];
}

export interface WeaponsManifestValidationResult {
  ok: boolean;
  weaponCount: number;
  loadoutCount: number;
  errors: string[];
  warnings: string[];
}

export interface Validate3dAssetsResult {
  ok: boolean;
  dracoFiles: Array<{ fileName: string; size: number }>;
  auditedGlbs: GlbAuditReport[];
  auditedWeapons: GlbAuditReport[];
  weaponsManifestSummary: { ok: boolean; weaponCount: number; loadoutCount: number };
  animJsonCount: number;
  errors: string[];
  warnings: string[];
}

export function isGiantBossAssetName(name: string): boolean;
export function parseGlbBuffer(buffer: Buffer | Uint8Array): ParsedGlb;
export function detectImageDimensions(
  bytes: Buffer | Uint8Array
): { format: string; width: number; height: number } | null;
export function auditGlbBuffer(
  buffer: Buffer | Uint8Array,
  fileName: string,
  options?: GlbAuditOptions
): GlbAuditReport;
export function auditWeaponGlbBuffer(
  buffer: Buffer | Uint8Array,
  fileName: string,
  options?: GlbAuditOptions
): GlbAuditReport;
export function validateWeapons3dManifest(
  manifest: unknown,
  rootDir?: string
): WeaponsManifestValidationResult;
export function runValidate3dAssets(options?: {
  rootDir?: string;
  requireDraco?: boolean;
}): Validate3dAssetsResult;
