import type {
  IrregularSheetRecipeV1,
  PackedAtlasOutput,
  RgbaSurface,
  SlicerAnalysisResult,
  SlicerOptions
} from '../../src/assets/slicer/slicerTypes';

export function loadSheetRecipe(
  packsDir: string,
  key: string,
  unitId: string,
  formId: string
): IrregularSheetRecipeV1 | null;

export function writeDebugOverlayPng(
  rawSurface: RgbaSurface,
  analysis: SlicerAnalysisResult,
  outPath: string
): void;

export function sliceAndPackIrregularSheet(
  rawPngBuffer: Buffer,
  metaOpts: {
    key: string;
    unitId?: string;
    formId?: string;
  },
  slicerOpts?: Partial<SlicerOptions>,
  recipe?: IrregularSheetRecipeV1 | null
): {
  rawSurface: RgbaSurface;
  analysis: SlicerAnalysisResult;
  packed: PackedAtlasOutput;
  pngBuffer: Buffer;
  debugPngBuffer: Buffer;
  portraitPngBuffer: Buffer | null;
};
