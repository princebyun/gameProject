export interface DecodedRgbaResult {
  data: Buffer;
  width: number;
  height: number;
  channels: number;
}

export interface ImageMetadataResult {
  width: number;
  height: number;
  format: string;
}

export interface AtlasPolicyMeta {
  id?: string;
  category?: string;
  isGiant?: boolean;
}

export interface OptimizePipelineResult {
  convertedCount: number;
  keptMicroPngCount: number;
  deletedDuplicatePngCount: number;
  totalPngBytes: number;
  totalOutBytes: number;
  savedBytes: number;
  savedPercent: number;
  pathMap: Map<string, string>;
  updatedMetaFiles: string[];
}

export const LOSSLESS_WEBP_OPTIONS: {
  readonly lossless: true;
  readonly effort: 6;
  readonly alphaQuality: 100;
  readonly nearLossless: false;
  readonly exact: true;
};
export const REGULAR_ATLAS_MAX_DIM: number;
export const GIANT_OR_TILESET_MAX_DIM: number;

export function encodeLosslessWebpBuffer(pngBuffer: Buffer): Promise<Buffer>;
export function decodeImageToRgba(imageBuffer: Buffer): Promise<DecodedRgbaResult>;
export function getImageMetadata(input: string | Buffer): Promise<ImageMetadataResult>;
export function validateAtlasResolution(
  meta: AtlasPolicyMeta,
  dims: { width: number; height: number }
): void;
export function syncLinkedMetadataFiles(
  rootDir: string,
  pathMap: Map<string, string>
): { updatedFiles: string[] };
export function optimizeProAssetsPipeline(options?: {
  rootDir?: string;
  dryRun?: boolean;
  archiveOriginals?: boolean;
}): Promise<OptimizePipelineResult>;
