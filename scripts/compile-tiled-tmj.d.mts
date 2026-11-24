export interface TmjCompilerLightSpec {
  readonly name: string;
  readonly tx: number;
  readonly ty: number;
  readonly color: string;
  readonly radius: number;
  readonly intensity: number;
  readonly flickerSpeed: number;
  readonly mask: string;
}

export interface TmjCompilerIslandSpec {
  readonly islandId: string;
  readonly tmjName: string;
  readonly primaryTileset: string;
  readonly secondaryTileset: string | null;
  readonly waterlineTileY: number;
  readonly extraLights: ReadonlyArray<TmjCompilerLightSpec>;
  readonly secondaryAccents?: ReadonlyArray<readonly [number, number, number]>;
}

export interface CompiledTmjResult {
  tmjName: string;
  islandId: string;
  episodeId: string | null;
  tilesets: Array<{ firstgid: number; source: string }>;
  cols: number;
  rows: number;
  lightCount: number;
  chestCount: number;
  npcCount: number;
  collisionCount: number;
}

export function readTsxTileCount(rootDir: string, tilesetId: string): number;

export function compileIslandTmj(
  rootDir: string,
  spec: TmjCompilerIslandSpec
): CompiledTmjResult;

export function compileTmjSpecs(
  rootDir: string,
  specs: ReadonlyArray<TmjCompilerIslandSpec>
): CompiledTmjResult[];

export function compileAllWave4Tmj(
  rootDir: string,
  islandFilter?: string | null
): Promise<CompiledTmjResult[]>;
