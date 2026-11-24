import type { CompiledTmjResult, TmjCompilerIslandSpec } from '../compile-tiled-tmj.mjs';

export const WAVE4_ISLAND_MAP_SPECS: ReadonlyArray<TmjCompilerIslandSpec>;

export function buildWave4IslandTmjMaps(rootDir: string): CompiledTmjResult[];
