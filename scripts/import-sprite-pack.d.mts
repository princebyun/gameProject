export interface ImportPackOptions {
  rootDir?: string;
  packsDir?: string;
  file?: string;
  previewOnly?: boolean;
  flipHorizontal?: boolean;
  tolerance?: number;
  scale?: number;
  keepPortraits?: boolean;
}

export interface ImportPackResult {
  importedSprites: number;
  importedPortraits: number;
  skipped: number;
  debugOutputs: string[];
  acquiredCount: number;
  missingCount: number;
}

export function runImportSpritePack(options?: ImportPackOptions): ImportPackResult;
export function parseCliArgs(argv: string[]): ImportPackOptions;
