import type { AssetLoader } from '../../assets/assetLoader';
import type { TilesetManifestEntry } from '../../data/assets/types';
import { computeCardinalBitmask } from './autotileBitmask';

export interface TileChunkCacheEntry {
  cacheKey: string;
  chunkSizePx: number;
  cols: number;
  rows: number;
  chunks: HTMLCanvasElement[];
}

export interface IslandRectObstacle {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Chunk-Cached Biome Tilemap Renderer (256x256 offscreen chunks, LRU max 6 maps).
 * Renders static ground/wall/decor layers once into offscreen chunks and draws only
 * visible chunks + 4-frame animated tiles per frame for crisp 60FPS pixel rendering.
 */
export class TilemapLayerRenderer {
  private mapChunkCache = new Map<string, TileChunkCacheEntry>();
  private readonly chunkSizePx = 256;
  private readonly maxCachedMaps = 6;

  public get cachedMapCount(): number {
    return this.mapChunkCache.size;
  }

  public clearCache(): void {
    this.mapChunkCache.clear();
  }

  private putCache(key: string, entry: TileChunkCacheEntry): void {
    if (this.mapChunkCache.has(key)) {
      this.mapChunkCache.delete(key);
    } else if (this.mapChunkCache.size >= this.maxCachedMaps) {
      const oldest = this.mapChunkCache.keys().next().value;
      if (oldest !== undefined) {
        this.mapChunkCache.delete(oldest);
      }
    }
    this.mapChunkCache.set(key, entry);
  }

  private getOrBakeStaticChunks(
    mapKey: string,
    worldWidth: number,
    worldHeight: number,
    biome: TilesetManifestEntry,
    atlas: HTMLImageElement | HTMLCanvasElement,
    obstacles: IslandRectObstacle[],
    waterStripY?: { minY: number; maxY: number }
  ): TileChunkCacheEntry | null {
    if (typeof document === 'undefined') return null;

    const existing = this.mapChunkCache.get(mapKey);
    if (existing) {
      // Touch LRU
      this.mapChunkCache.delete(mapKey);
      this.mapChunkCache.set(mapKey, existing);
      return existing;
    }

    const srcTs = biome.tileSize; // 16
    const drawTs = srcTs * biome.renderScale; // 32
    const gridCols = Math.ceil(worldWidth / drawTs);
    const gridRows = Math.ceil(worldHeight / drawTs);

    // Classify tiles: 0 = ground, 1 = wall/obstacle, 2 = animated water/canal
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
          !inWall &&
          Boolean(waterStripY && wy >= waterStripY.minY && wy <= waterStripY.maxY);
        rowArr.push(inWall ? 1 : inWater ? 2 : 0);
      }
      grid.push(rowArr);
    }

    const chunkCols = Math.ceil(worldWidth / this.chunkSizePx);
    const chunkRows = Math.ceil(worldHeight / this.chunkSizePx);
    const chunks: HTMLCanvasElement[] = [];

    for (let cr = 0; cr < chunkRows; cr++) {
      for (let cc = 0; cc < chunkCols; cc++) {
        const chunkCanvas = document.createElement('canvas');
        chunkCanvas.width = this.chunkSizePx;
        chunkCanvas.height = this.chunkSizePx;
        const cctx = chunkCanvas.getContext('2d')!;
        cctx.imageSmoothingEnabled = false;

        const startCol = Math.floor((cc * this.chunkSizePx) / drawTs);
        const endCol = Math.min(
          gridCols,
          Math.ceil(((cc + 1) * this.chunkSizePx) / drawTs)
        );
        const startRow = Math.floor((cr * this.chunkSizePx) / drawTs);
        const endRow = Math.min(
          gridRows,
          Math.ceil(((cr + 1) * this.chunkSizePx) / drawTs)
        );

        for (let r = startRow; r < endRow; r++) {
          for (let c = startCol; c < endCol; c++) {
            const cell = grid[r][c];
            const dx = c * drawTs - cc * this.chunkSizePx;
            const dy = r * drawTs - cr * this.chunkSizePx;

            if (cell === 1) {
              // Wall tile (row 2)
              const wallVariant = (c + r) % 4;
              cctx.drawImage(
                atlas,
                wallVariant * srcTs,
                srcTs * 2,
                srcTs,
                srcTs,
                dx,
                dy,
                drawTs,
                drawTs
              );
            } else {
              // Ground autotile (row 0, bitmask 0..15 connects same-type ground tiles)
              const mask = computeCardinalBitmask(
                grid,
                c,
                r,
                (v) => v === 0,
                true
              );
              cctx.drawImage(
                atlas,
                mask * srcTs,
                0,
                srcTs,
                srcTs,
                dx,
                dy,
                drawTs,
                drawTs
              );

              // Deterministic sparse biome decor overlay (row 3)
              const hash = ((c * 73856093) ^ (r * 19349663)) >>> 0;
              if (cell === 0 && hash % 7 === 0) {
                const decorCol = hash % 4;
                cctx.drawImage(
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
            }
          }
        }
        chunks.push(chunkCanvas);
      }
    }

    const entry: TileChunkCacheEntry = {
      cacheKey: mapKey,
      chunkSizePx: this.chunkSizePx,
      cols: chunkCols,
      rows: chunkRows,
      chunks
    };
    this.putCache(mapKey, entry);
    return entry;
  }

  /**
   * Renders a full biome tilemap (static chunk layer + animated water/hazard overlay)
   * clipped strictly to the camera viewport for 60FPS performance.
   */
  public renderBiomeBackdrop(
    ctx: CanvasRenderingContext2D,
    mapKey: string,
    worldWidth: number,
    worldHeight: number,
    viewMinX: number,
    viewMinY: number,
    viewWidth: number,
    viewHeight: number,
    biome: TilesetManifestEntry,
    assets: AssetLoader,
    tick: number,
    obstacles: IslandRectObstacle[] = [],
    waterStripY?: { minY: number; maxY: number }
  ): void {
    const atlas = assets.getOrCreateBiomeTileset(biome);
    if (!atlas) return;

    ctx.imageSmoothingEnabled = false;
    const srcTs = biome.tileSize;
    const drawTs = srcTs * biome.renderScale;

    if (biome.category === 'SEA') {
      // Sea zones render crisp 4-frame animated ocean tiles strictly within camera viewport
      const animFrame =
        Math.floor((tick / 60) * biome.animatedFps) %
        Math.max(1, biome.animatedFrames);
      const startCol = Math.max(0, Math.floor(viewMinX / drawTs));
      const endCol = Math.min(
        Math.ceil(worldWidth / drawTs),
        Math.ceil((viewMinX + viewWidth) / drawTs)
      );
      const startRow = Math.max(0, Math.floor(viewMinY / drawTs));
      const endRow = Math.min(
        Math.ceil(worldHeight / drawTs),
        Math.ceil((viewMinY + viewHeight) / drawTs)
      );

      for (let r = startRow; r < endRow; r++) {
        for (let c = startCol; c < endCol; c++) {
          const tileFrame = (animFrame + ((c + r) % 2)) % biome.animatedFrames;
          ctx.drawImage(
            atlas,
            tileFrame * srcTs,
            biome.animatedRow * srcTs,
            srcTs,
            srcTs,
            c * drawTs,
            r * drawTs,
            drawTs,
            drawTs
          );
        }
      }
      return;
    }

    // Island / Dungeon / Arena: blit cached static chunks intersecting viewport
    const cached = this.getOrBakeStaticChunks(
      `${mapKey}_${biome.biomeId}_${obstacles.length}`,
      worldWidth,
      worldHeight,
      biome,
      atlas,
      obstacles,
      waterStripY
    );
    if (!cached) return;

    const startChunkCol = Math.max(0, Math.floor(viewMinX / cached.chunkSizePx));
    const endChunkCol = Math.min(
      cached.cols - 1,
      Math.floor((viewMinX + viewWidth) / cached.chunkSizePx)
    );
    const startChunkRow = Math.max(0, Math.floor(viewMinY / cached.chunkSizePx));
    const endChunkRow = Math.min(
      cached.rows - 1,
      Math.floor((viewMinY + viewHeight) / cached.chunkSizePx)
    );

    for (let cr = startChunkRow; cr <= endChunkRow; cr++) {
      for (let cc = startChunkCol; cc <= endChunkCol; cc++) {
        const chunk = cached.chunks[cr * cached.cols + cc];
        if (chunk) {
          ctx.drawImage(chunk, cc * cached.chunkSizePx, cr * cached.chunkSizePx);
        }
      }
    }

    // Overlay 4-frame animated canal/water strip if present (e.g. Water 7 canal)
    if (waterStripY) {
      const animFrame =
        Math.floor((tick / 60) * biome.animatedFps) %
        Math.max(1, biome.animatedFrames);
      const startCol = Math.max(0, Math.floor(viewMinX / drawTs));
      const endCol = Math.min(
        Math.ceil(worldWidth / drawTs),
        Math.ceil((viewMinX + viewWidth) / drawTs)
      );
      const startRow = Math.max(0, Math.floor(waterStripY.minY / drawTs));
      const endRow = Math.min(
        Math.ceil(worldHeight / drawTs),
        Math.ceil(waterStripY.maxY / drawTs)
      );

      for (let r = startRow; r < endRow; r++) {
        for (let c = startCol; c < endCol; c++) {
          ctx.drawImage(
            atlas,
            animFrame * srcTs,
            biome.animatedRow * srcTs,
            srcTs,
            srcTs,
            c * drawTs,
            r * drawTs,
            drawTs,
            drawTs
          );
        }
      }
    }
  }
}
