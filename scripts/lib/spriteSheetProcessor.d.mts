import type { DecodedPngImage } from './pngCodec.mjs';

export interface NormalizeSpriteOptions {
  key: string;
  unitId?: string;
  formId?: string;
  rigType?: string;
  anchor?: { x: number; y: number };
  preferredSize?: number | null;
  existingAnimations?: Record<string, unknown> | null;
  source?: string;
}

export interface NormalizedSpriteResult {
  pngBuffer: Buffer;
  meta: {
    key: string;
    unitId: string;
    formId: string;
    rigType: string;
    frameWidth: number;
    frameHeight: number;
    sheetWidth: number;
    sheetHeight: number;
    anchor: { x: number; y: number };
    source: string;
    sha256: string;
    bakedAt: string;
    animations: Record<string, unknown>;
  };
  frameWidth: number;
  frameHeight: number;
  frameCountDetected: number;
}

export function normalizeSpriteSheet(
  rawImg: DecodedPngImage,
  options: NormalizeSpriteOptions
): NormalizedSpriteResult;
