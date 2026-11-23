import type { Disposable } from '../../core/types/disposable';
import type { IslandTileMapData } from '../../core/types/rpgSchemas';
import type { TilesetManifestEntry } from '../../data/assets/types';
import { releaseOffscreenCanvas } from '../canvasGpuDispose';
import { computeCardinalBitmask } from './autotileBitmask';
import {
  bakeExplicitTilemapChunks,
  renderExplicitAnimatedWater,
  type BakedExplicitTilemapChunks
} from './explicitTilemapBaker';
import {
  drawLayeredBuilding,
  drawLayeredNatureProp,
  hashCoord,
  isBuildingObstacle,
  type IslandObstacleRect
} from './layeredMapStructures';

export type { IslandObstacleRect } from './layeredMapStructures';

export interface LayeredTilesetProvider {
  getOrCreateBiomeTileset(
    biome: TilesetManifestEntry
  ): HTMLImageElement | HTMLCanvasElement | null;
}

interface LayeredMapChunkEntry {
  cacheKey: string;
  atlas: HTMLImageElement | HTMLCanvasElement;
  chunkSizePx: number;
  cols: number;
  rows: number;
  baseChunks: HTMLCanvasElement[];
  overheadChunks: HTMLCanvasElement[];
  explicitBaked?: BakedExplicitTilemapChunks;
  explicitTileSize?: number;
}

/**
 * 7-Layer Tiled-grade Biome Map Renderer (Layers 0, 1, 2 static + Layer 4 overhead).
 * Uses 256x256 offscreen chunks with LRU max 6 maps and immediate GPU texture release.
 */
export class LayeredTilemapRenderer implements Disposable {
  private mapCache = new Map<string, LayeredMapChunkEntry>();
  private readonly chunkSizePx = 256;
  private readonly maxCachedMaps = 6;

  public get cachedMapCount(): number {
    return this.mapCache.size;
  }

  private releaseEntry(entry: LayeredMapChunkEntry | undefined): void {
    if (!entry) return;
    for (let i = 0; i < entry.baseChunks.length; i++) {
      releaseOffscreenCanvas(entry.baseChunks[i]);
    }
    for (let i = 0; i < entry.overheadChunks.length; i++) {
      releaseOffscreenCanvas(entry.overheadChunks[i]);
    }
    entry.baseChunks.length = 0;
    entry.overheadChunks.length = 0;
  }

  public clearCache(): void {
    for (const entry of this.mapCache.values()) {
      this.releaseEntry(entry);
    }
    this.mapCache.clear();
  }

  public dispose(): void {
    this.clearCache();
  }

  private putCache(key: string, entry: LayeredMapChunkEntry): void {
    const existing = this.mapCache.get(key);
    if (existing) {
      this.mapCache.delete(key);
      if (existing !== entry) this.releaseEntry(existing);
    } else if (this.mapCache.size >= this.maxCachedMaps) {
      const oldest = this.mapCache.keys().next().value;
      if (oldest !== undefined) {
        const oldEntry = this.mapCache.get(oldest);
        this.mapCache.delete(oldest);
        this.releaseEntry(oldEntry);
      }
    }
    this.mapCache.set(key, entry);
  }

  private getOrBakeChunks(
    mapKey: string,
    worldWidth: number,
    worldHeight: number,
    biome: TilesetManifestEntry,
    atlas: HTMLImageElement | HTMLCanvasElement,
    obstacles: IslandObstacleRect[],
    waterStripY?: { minY: number; maxY: number },
    tileMap?: IslandTileMapData
  ): LayeredMapChunkEntry | null {
    if (typeof document === 'undefined') return null;

    const existing = this.mapCache.get(mapKey);
    if (existing && existing.atlas === atlas) {
      this.mapCache.delete(mapKey);
      this.mapCache.set(mapKey, existing);
      return existing;
    }
    if (existing) {
      this.mapCache.delete(mapKey);
      this.releaseEntry(existing);
    }

    if (tileMap) {
      const explicitBaked = bakeExplicitTilemapChunks(
        tileMap,
        biome,
        atlas,
        obstacles,
        this.chunkSizePx
      );
      const entry: LayeredMapChunkEntry = {
        cacheKey: mapKey,
        atlas,
        chunkSizePx: this.chunkSizePx,
        cols: explicitBaked.cols,
        rows: explicitBaked.rows,
        baseChunks: explicitBaked.baseChunks,
        overheadChunks: explicitBaked.overheadChunks,
        explicitBaked,
        explicitTileSize: tileMap.tileSize
      };
      this.putCache(mapKey, entry);
      return entry;
    }

    const srcTs = biome.tileSize; // 16
    const drawTs = srcTs * biome.renderScale; // 32
    const gridCols = Math.ceil(worldWidth / drawTs);
    const gridRows = Math.ceil(worldHeight / drawTs);

    // 0 = ground, 1 = wall/building/tree, 2 = water, 3 = cobblestone/pier path
    const grid: number[][] = [];
    for (let r = 0; r < gridRows; r++) {
      const rowArr: number[] = [];
      for (let c = 0; c < gridCols; c++) {
        const wx = c * drawTs + drawTs * 0.5;
        const wy = r * drawTs + drawTs * 0.5;
        const inWall = obstacles.some(
          (o) => wx >= o.x && wx <= o.x + o.width && wy >= o.y && wy <= o.y + o.height
        );
        const inWater =
          !inWall && Boolean(waterStripY && wy >= waterStripY.minY && wy <= waterStripY.maxY);
        const onMainPath =
          !inWall &&
          !inWater &&
          (Math.abs(wy - worldHeight * 0.52) < 38 || Math.abs(wx - 210) < 30);
        rowArr.push(inWall ? 1 : inWater ? 2 : onMainPath ? 3 : 0);
      }
      grid.push(rowArr);
    }

    const chunkCols = Math.ceil(worldWidth / this.chunkSizePx);
    const chunkRows = Math.ceil(worldHeight / this.chunkSizePx);
    const baseChunks: HTMLCanvasElement[] = [];
    const overheadChunks: HTMLCanvasElement[] = [];

    for (let cr = 0; cr < chunkRows; cr++) {
      for (let cc = 0; cc < chunkCols; cc++) {
        const baseCanvas = document.createElement('canvas');
        baseCanvas.width = this.chunkSizePx;
        baseCanvas.height = this.chunkSizePx;
        const bctx = baseCanvas.getContext('2d')!;
        bctx.imageSmoothingEnabled = false;

        const overCanvas = document.createElement('canvas');
        overCanvas.width = this.chunkSizePx;
        overCanvas.height = this.chunkSizePx;
        const octx = overCanvas.getContext('2d')!;
        octx.imageSmoothingEnabled = false;

        const chunkOriginX = cc * this.chunkSizePx;
        const chunkOriginY = cr * this.chunkSizePx;
        const startCol = Math.floor(chunkOriginX / drawTs);
        const endCol = Math.min(gridCols, Math.ceil((chunkOriginX + this.chunkSizePx) / drawTs));
        const startRow = Math.floor(chunkOriginY / drawTs);
        const endRow = Math.min(gridRows, Math.ceil((chunkOriginY + this.chunkSizePx) / drawTs));

        // Layer 0 & Layer 1: Ground base with deterministic variants, paths, contact shadows & flora
        for (let r = startRow; r < endRow; r++) {
          for (let c = startCol; c < endCol; c++) {
            const cell = grid[r]?.[c] ?? 0;
            const dx = c * drawTs - chunkOriginX;
            const dy = r * drawTs - chunkOriginY;
            const h = hashCoord(c, r);

            if (cell === 3) {
              bctx.fillStyle = biome.palette.detail;
              bctx.fillRect(dx, dy, drawTs, drawTs);
              const pathCol = 12 + (h % 4);
              bctx.drawImage(atlas, pathCol * srcTs, srcTs * 2, srcTs, srcTs, dx, dy, drawTs, drawTs);
            } else {
              bctx.fillStyle = biome.palette.base;
              bctx.fillRect(dx, dy, drawTs, drawTs);
              const mask = computeCardinalBitmask(grid, c, r, (v) => v === 0, true);
              const tileCol = mask === 15 && h % 3 === 0 ? 15 : mask;
              bctx.drawImage(atlas, tileCol * srcTs, 0, srcTs, srcTs, dx, dy, drawTs, drawTs);
            }

            if (cell === 0 && h % 5 === 0) {
              const decorCol = h % 12;
              bctx.drawImage(
                atlas,
                decorCol * srcTs,
                srcTs * 3,
                srcTs,
                srcTs,
                dx,
                dy,
                drawTs,
                drawTs
              );
            }

            // Northern neighbor was obstacle/building -> draw 4px ground contact shadow (Row 3 cols 12)
            const aboveCell = grid[r - 1]?.[c] ?? 0;
            if (cell !== 1 && aboveCell === 1) {
              bctx.drawImage(atlas, 12 * srcTs, srcTs * 3, srcTs, srcTs, dx, dy, drawTs, drawTs);
            }
          }
        }

        // Layer 2 (lower walls/trunks) & Layer 4 (overhanging roofs/canopies) for obstacles
        for (const obs of obstacles) {
          const ox = Math.round(obs.x) - chunkOriginX;
          const oy = Math.round(obs.y) - chunkOriginY;
          const ow = Math.round(obs.width);
          const oh = Math.round(obs.height);
          const overPad = 18;
          if (
            ox + ow < -overPad ||
            oy + oh < -overPad ||
            ox > this.chunkSizePx + overPad ||
            oy > this.chunkSizePx + overPad
          ) {
            continue;
          }

          if (isBuildingObstacle(obs)) {
            drawLayeredBuilding(bctx, octx, atlas, srcTs, ox, oy, ow, oh, biome);
          } else {
            drawLayeredNatureProp(bctx, octx, atlas, srcTs, ox, oy, ow, oh, biome);
          }
        }

        baseChunks.push(baseCanvas);
        overheadChunks.push(overCanvas);
      }
    }

    const entry: LayeredMapChunkEntry = {
      cacheKey: mapKey,
      atlas,
      chunkSizePx: this.chunkSizePx,
      cols: chunkCols,
      rows: chunkRows,
      baseChunks,
      overheadChunks
    };
    this.putCache(mapKey, entry);
    return entry;
  }

  public renderBaseLayers(
    ctx: CanvasRenderingContext2D,
    mapKey: string,
    worldWidth: number,
    worldHeight: number,
    viewMinX: number,
    viewMinY: number,
    viewWidth: number,
    viewHeight: number,
    biome: TilesetManifestEntry,
    assets: LayeredTilesetProvider,
    tick: number,
    obstacles: IslandObstacleRect[] = [],
    waterStripY?: { minY: number; maxY: number },
    tileMap?: IslandTileMapData
  ): void {
    const atlas = assets.getOrCreateBiomeTileset(biome);
    if (!atlas) return;
    const srcTs = biome.tileSize;
    const drawTs = srcTs * biome.renderScale;

    if (biome.category === 'SEA') {
      const animFrame = Math.floor((tick / 60) * biome.animatedFps) % Math.max(1, biome.animatedFrames);
      const startCol = Math.max(0, Math.floor(viewMinX / drawTs));
      const endCol = Math.min(Math.ceil(worldWidth / drawTs), Math.ceil((viewMinX + viewWidth) / drawTs));
      const startRow = Math.max(0, Math.floor(viewMinY / drawTs));
      const endRow = Math.min(Math.ceil(worldHeight / drawTs), Math.ceil((viewMinY + viewHeight) / drawTs));
      for (let r = startRow; r < endRow; r++) {
        for (let c = startCol; c < endCol; c++) {
          const tileFrame = (animFrame + ((c + r) % 2)) % biome.animatedFrames;
          ctx.drawImage(atlas, tileFrame * srcTs, biome.animatedRow * srcTs, srcTs, srcTs, c * drawTs, r * drawTs, drawTs, drawTs);
        }
      }
      return;
    }

    const cached = this.getOrBakeChunks(
      `${mapKey}_${biome.biomeId}_${obstacles.length}`,
      worldWidth,
      worldHeight,
      biome,
      atlas,
      obstacles,
      waterStripY,
      tileMap
    );
    if (!cached) return;

    this.blitVisibleChunks(ctx, cached.baseChunks, cached, viewMinX, viewMinY, viewWidth, viewHeight);

    if (cached.explicitBaked && cached.explicitTileSize) {
      renderExplicitAnimatedWater(
        ctx, atlas, biome, cached.explicitBaked, cached.explicitTileSize,
        viewMinX, viewMinY, viewWidth, viewHeight, tick
      );
    } else if (waterStripY) {
      this.renderAnimatedWaterStrip(ctx, atlas, biome, worldWidth, viewMinX, viewWidth, waterStripY, tick);
    }
  }

  public renderOverheadLayer(
    ctx: CanvasRenderingContext2D,
    mapKey: string,
    biome: TilesetManifestEntry,
    obstaclesCount: number,
    viewMinX: number,
    viewMinY: number,
    viewWidth: number,
    viewHeight: number
  ): void {
    const cached = this.mapCache.get(`${mapKey}_${biome.biomeId}_${obstaclesCount}`);
    if (!cached) return;
    this.blitVisibleChunks(ctx, cached.overheadChunks, cached, viewMinX, viewMinY, viewWidth, viewHeight);
  }

  private blitVisibleChunks(
    ctx: CanvasRenderingContext2D,
    chunks: HTMLCanvasElement[],
    meta: LayeredMapChunkEntry,
    viewMinX: number,
    viewMinY: number,
    viewWidth: number,
    viewHeight: number
  ): void {
    const sCol = Math.max(0, Math.floor(viewMinX / meta.chunkSizePx));
    const eCol = Math.min(meta.cols - 1, Math.floor((viewMinX + viewWidth) / meta.chunkSizePx));
    const sRow = Math.max(0, Math.floor(viewMinY / meta.chunkSizePx));
    const eRow = Math.min(meta.rows - 1, Math.floor((viewMinY + viewHeight) / meta.chunkSizePx));
    for (let cr = sRow; cr <= eRow; cr++) {
      for (let cc = sCol; cc <= eCol; cc++) {
        const chunk = chunks[cr * meta.cols + cc];
        if (chunk) ctx.drawImage(chunk, cc * meta.chunkSizePx, cr * meta.chunkSizePx);
      }
    }
  }

  private renderAnimatedWaterStrip(
    ctx: CanvasRenderingContext2D,
    atlas: HTMLImageElement | HTMLCanvasElement,
    biome: TilesetManifestEntry,
    worldWidth: number,
    viewMinX: number,
    viewWidth: number,
    waterStripY: { minY: number; maxY: number },
    tick: number
  ): void {
    const srcTs = biome.tileSize;
    const drawTs = srcTs * biome.renderScale;
    const animFrame = Math.floor((tick / 60) * biome.animatedFps) % Math.max(1, biome.animatedFrames);
    const startCol = Math.max(0, Math.floor(viewMinX / drawTs));
    const endCol = Math.min(Math.ceil(worldWidth / drawTs), Math.ceil((viewMinX + viewWidth) / drawTs));
    const startRow = Math.max(0, Math.floor(waterStripY.minY / drawTs));
    const endRow = Math.ceil(waterStripY.maxY / drawTs);

    for (let r = startRow; r < endRow; r++) {
      for (let c = startCol; c < endCol; c++) {
        const isEdge = r === startRow || r === endRow - 1;
        const tileCol = isEdge ? 4 + animFrame : animFrame;
        ctx.drawImage(atlas, tileCol * srcTs, biome.animatedRow * srcTs, srcTs, srcTs, c * drawTs, r * drawTs, drawTs, drawTs);
      }
    }
  }
}
