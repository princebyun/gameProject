import type { SpriteAnimClipDef, SpriteAnimState } from '../../data/assets/types';

export interface RgbaSurface {
  width: number;
  height: number;
  data: Uint8ClampedArray;
}

export interface BBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface DetectedComponent extends BBox {
  id: number;
  pixelCount: number;
  area: number;
}

export type ExcludedRegionReason =
  | 'HEADER_BANNER'
  | 'TEXT_LABEL'
  | 'DIVIDER_LINE'
  | 'DUST'
  | 'USER_EXCLUDED';

export interface ExcludedRegion extends BBox {
  reason: ExcludedRegionReason;
  label?: string;
}

export interface SlicedFrame extends BBox {
  id: number;
  rowIndex: number;
  colIndex: number;
  pivotX: number;
  pivotY: number;
  sourceComponents: BBox[];
}

export interface SlicerRowCluster {
  rowIndex: number;
  minY: number;
  maxY: number;
  assignedState: SpriteAnimState;
  assignmentReason: string;
  frames: SlicedFrame[];
}

export interface SlicerOptions {
  tolerance: number;
  flipHorizontal: boolean;
  scale: number;
  paddingPx: number;
  keepPortraits: boolean;
}

export const DEFAULT_SLICER_OPTIONS: SlicerOptions = {
  tolerance: 18,
  flipHorizontal: false,
  scale: 1.0,
  paddingPx: 2,
  keepPortraits: false
};

export interface IrregularSheetRecipeV1 {
  version: 1;
  unitId: string;
  formId: string;
  options: SlicerOptions;
  excludedRegions: BBox[];
  restoredRegions: BBox[];
  mergedGroups: BBox[][];
  rowStateOverrides: Record<string, SpriteAnimState>;
  framePivotOverrides: Record<string, { pivotX: number; pivotY: number }>;
}

export interface SlicerAnalysisResult {
  rawWidth: number;
  rawHeight: number;
  cleanedSurface: RgbaSurface;
  dominantBgRgb: [number, number, number];
  frames: SlicedFrame[];
  rows: SlicerRowCluster[];
  excludedRegions: ExcludedRegion[];
  stateMapping: Record<SpriteAnimState, number>;
  idleMedianW: number;
  idleMedianH: number;
}

export interface PackedAtlasOutput {
  atlasSurface: RgbaSurface;
  frameWidth: 32 | 48 | 64 | 96 | 128;
  frameHeight: 32 | 48 | 64 | 96 | 128;
  animations: Record<SpriteAnimState, SpriteAnimClipDef>;
  totalUniqueFrames: number;
}

export function createSurface(width: number, height: number): RgbaSurface {
  const w = Math.max(1, Math.floor(width));
  const h = Math.max(1, Math.floor(height));
  return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) };
}

export function cloneSurface(src: RgbaSurface): RgbaSurface {
  return { width: src.width, height: src.height, data: new Uint8ClampedArray(src.data) };
}

export function bboxIoU(a: BBox, b: BBox): number {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.w, b.x + b.w);
  const y2 = Math.min(a.y + a.h, b.y + b.h);
  if (x2 <= x1 || y2 <= y1) return 0;
  const inter = (x2 - x1) * (y2 - y1);
  const union = a.w * a.h + b.w * b.h - inter;
  return union > 0 ? inter / union : 0;
}

export function bboxContainsCenter(outer: BBox, inner: BBox): boolean {
  const cx = inner.x + inner.w * 0.5;
  const cy = inner.y + inner.h * 0.5;
  return cx >= outer.x && cx <= outer.x + outer.w && cy >= outer.y && cy <= outer.y + outer.h;
}

export function normalizeRecipe(
  raw: Partial<IrregularSheetRecipeV1> | null | undefined,
  unitId: string,
  formId: string
): IrregularSheetRecipeV1 {
  const opts = raw?.options;
  return {
    version: 1,
    unitId: raw?.unitId || unitId,
    formId: raw?.formId || formId,
    options: {
      tolerance: typeof opts?.tolerance === 'number' ? opts.tolerance : DEFAULT_SLICER_OPTIONS.tolerance,
      flipHorizontal: Boolean(opts?.flipHorizontal),
      scale: typeof opts?.scale === 'number' && opts.scale > 0 ? opts.scale : 1.0,
      paddingPx: typeof opts?.paddingPx === 'number' && opts.paddingPx >= 0 ? opts.paddingPx : 2,
      keepPortraits: Boolean(opts?.keepPortraits)
    },
    excludedRegions: Array.isArray(raw?.excludedRegions) ? raw.excludedRegions : [],
    restoredRegions: Array.isArray(raw?.restoredRegions) ? raw.restoredRegions : [],
    mergedGroups: Array.isArray(raw?.mergedGroups) ? raw.mergedGroups : [],
    rowStateOverrides: raw?.rowStateOverrides ? { ...raw.rowStateOverrides } : {},
    framePivotOverrides: raw?.framePivotOverrides ? { ...raw.framePivotOverrides } : {}
  };
}

export function serializeRecipe(recipe: IrregularSheetRecipeV1): string {
  return `${JSON.stringify(recipe, null, 2)}\n`;
}
