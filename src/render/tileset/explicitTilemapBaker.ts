import { decodeIslandTileMap } from '../../core/rpg/islandTileCollision';
import type { IslandTileMapData, SurfaceMaterialId } from '../../core/types/rpgSchemas';
import type { TilesetManifestEntry } from '../../data/assets/types';
import {
  drawLayeredBuilding,
  drawLayeredNatureProp,
  hashCoord,
  isBuildingObstacle,
  type IslandObstacleRect
} from './layeredMapStructures';

export interface AnimatedWaterRowSpan {
  colsAndFoam: number[];
}

export interface BakedExplicitTilemapChunks {
  baseChunks: HTMLCanvasElement[];
  overheadChunks: HTMLCanvasElement[];
  cols: number;
  rows: number;
  tileCols: number;
  tileRows: number;
  waterRowIndex: Uint16Array;
  waterRowStarts: Int32Array;
}

function drawAtlasTile(
  targetCtx: CanvasRenderingContext2D,
  atlas: HTMLImageElement | HTMLCanvasElement,
  tileId: number,
  srcTs: number,
  dx: number,
  dy: number,
  drawTs: number
): void {
  if (tileId < 0) return;
  const col = tileId % 16;
  const row = Math.floor(tileId / 16);
  targetCtx.drawImage(
    atlas,
    col * srcTs,
    row * srcTs,
    srcTs,
    srcTs,
    dx,
    dy,
    drawTs,
    drawTs
  );
}

function drawSurfaceMicroDetail(
  bctx: CanvasRenderingContext2D,
  surface: SurfaceMaterialId,
  biomeId: string,
  dx: number,
  dy: number,
  ts: number,
  c: number,
  r: number
): void {
  const h = hashCoord(c, r);
  if (surface === 'wood_dock') {
    bctx.fillStyle = biomeId === 'wano_castle' ? '#7c2d12' : '#92400e';
    bctx.fillRect(dx, dy, ts, ts);
    bctx.fillStyle = biomeId === 'wano_castle' ? '#9a3412' : '#b45309';
    for (let p = 0; p < 4; p++) {
      bctx.fillRect(dx + 1, dy + p * 8 + 1, ts - 2, 6);
    }
    bctx.fillStyle = '#451a03';
    bctx.fillRect(dx + 3, dy + 3, 2, 2);
    bctx.fillRect(dx + ts - 5, dy + ts - 5, 2, 2);
  } else if (surface === 'sand') {
    bctx.fillStyle = '#f3d08a';
    bctx.fillRect(dx, dy, ts, ts);
    bctx.fillStyle = '#e5b968';
    if (h % 3 === 0) {
      bctx.fillRect(dx + 4, dy + 8, 6, 2);
      bctx.fillRect(dx + 18, dy + 22, 6, 2);
    } else {
      bctx.fillRect(dx + 10, dy + 16, 4, 2);
    }
  } else if (surface === 'water_shallow') {
    bctx.fillStyle = biomeId === 'wano_castle' ? '#0f766e' : '#0284c7';
    bctx.fillRect(dx, dy, ts, ts);
    bctx.fillStyle = '#bae6fd';
    bctx.fillRect(dx + 6, dy + 10, 12, 2);
    bctx.fillRect(dx + 12, dy + 22, 10, 2);
    // Crisp flat stepping stone in pond/shallow crossing
    bctx.fillStyle = '#64748b';
    bctx.fillRect(dx + 5, dy + 6, 22, 18);
    bctx.fillStyle = '#94a3b8';
    bctx.fillRect(dx + 7, dy + 8, 18, 12);
  } else if (surface === 'metal_cyber' && h % 2 === 0) {
    bctx.strokeStyle = 'rgba(56, 189, 248, 0.28)';
    bctx.lineWidth = 1;
    bctx.strokeRect(dx + 2, dy + 2, ts - 4, ts - 4);
  }
}

export function bakeExplicitTilemapChunks(
  tileMap: IslandTileMapData,
  biome: TilesetManifestEntry,
  atlas: HTMLImageElement | HTMLCanvasElement,
  obstacles: IslandObstacleRect[],
  chunkSizePx: number
): BakedExplicitTilemapChunks {
  const decoded = decodeIslandTileMap(tileMap);
  const srcTs = biome.tileSize;
  const drawTs = tileMap.tileSize;
  const worldW = decoded.cols * drawTs;
  const worldH = decoded.rows * drawTs;
  const chunkCols = Math.ceil(worldW / chunkSizePx);
  const chunkRows = Math.ceil(worldH / chunkSizePx);

  const baseChunks: HTMLCanvasElement[] = [];
  const overheadChunks: HTMLCanvasElement[] = [];

  // Index animated water/coastal foam tiles per row for fast frustum-culled playback
  const waterCellsPerRow: number[][] = Array.from({ length: decoded.rows }, () => []);
  let totalWaterCells = 0;
  for (let r = 0; r < decoded.rows; r++) {
    for (let c = 0; c < decoded.cols; c++) {
      const idx = r * decoded.cols + c;
      const gId = decoded.groundIds[idx] ?? -1;
      const dId = decoded.detailIds[idx] ?? -1;
      const waterTile =
        dId >= 16 && dId <= 23 ? dId : gId >= 16 && gId <= 23 ? gId : -1;
      if (waterTile >= 16) {
        const isFoam = waterTile >= 20 ? 1 : 0;
        waterCellsPerRow[r]?.push(c, isFoam);
        totalWaterCells += 1;
      }
    }
  }

  const waterRowStarts = new Int32Array(decoded.rows + 1);
  const waterRowIndex = new Uint16Array(totalWaterCells * 2);
  let cursor = 0;
  for (let r = 0; r < decoded.rows; r++) {
    waterRowStarts[r] = cursor;
    const rowList = waterCellsPerRow[r] ?? [];
    for (let i = 0; i < rowList.length; i += 2) {
      waterRowIndex[cursor * 2] = rowList[i] ?? 0;
      waterRowIndex[cursor * 2 + 1] = rowList[i + 1] ?? 0;
      cursor += 1;
    }
  }
  waterRowStarts[decoded.rows] = cursor;

  for (let cr = 0; cr < chunkRows; cr++) {
    for (let cc = 0; cc < chunkCols; cc++) {
      const baseCanvas = document.createElement('canvas');
      baseCanvas.width = chunkSizePx;
      baseCanvas.height = chunkSizePx;
      const bctx = baseCanvas.getContext('2d')!;
      bctx.imageSmoothingEnabled = false;

      const overCanvas = document.createElement('canvas');
      overCanvas.width = chunkSizePx;
      overCanvas.height = chunkSizePx;
      const octx = overCanvas.getContext('2d')!;
      octx.imageSmoothingEnabled = false;

      const chunkOriginX = cc * chunkSizePx;
      const chunkOriginY = cr * chunkSizePx;
      const startCol = Math.floor(chunkOriginX / drawTs);
      const endCol = Math.min(decoded.cols, Math.ceil((chunkOriginX + chunkSizePx) / drawTs));
      const startRow = Math.floor(chunkOriginY / drawTs);
      const endRow = Math.min(decoded.rows, Math.ceil((chunkOriginY + chunkSizePx) / drawTs));

      for (let r = startRow; r < endRow; r++) {
        for (let c = startCol; c < endCol; c++) {
          const idx = r * decoded.cols + c;
          const dx = c * drawTs - chunkOriginX;
          const dy = r * drawTs - chunkOriginY;
          const gId = decoded.groundIds[idx] ?? 0;
          const dId = decoded.detailIds[idx] ?? -1;
          const oId = decoded.overheadIds[idx] ?? -1;
          const solid = decoded.solidFlags[idx] ?? 0;
          const surface = decoded.surfaces[idx] ?? 'stone';

          bctx.fillStyle =
            gId >= 16 && gId <= 23 ? biome.palette.waterOrHazard : biome.palette.base;
          bctx.fillRect(dx, dy, drawTs, drawTs);
          drawAtlasTile(bctx, atlas, gId, srcTs, dx, dy, drawTs);

          if (surface === 'wood_dock' || surface === 'sand' || surface === 'water_shallow') {
            drawSurfaceMicroDetail(bctx, surface, biome.biomeId, dx, dy, drawTs, c, r);
          }

          if (dId >= 0) {
            drawAtlasTile(bctx, atlas, dId, srcTs, dx, dy, drawTs);
          }
          if (surface === 'metal_cyber') {
            drawSurfaceMicroDetail(bctx, surface, biome.biomeId, dx, dy, drawTs, c, r);
          }

          // Contact shadow under northern solid walls/cliffs
          if (solid === 0 && r > 0 && decoded.solidFlags[(r - 1) * decoded.cols + c] === 1) {
            drawAtlasTile(bctx, atlas, 60, srcTs, dx, dy, drawTs);
          }

          if (oId >= 0) {
            drawAtlasTile(octx, atlas, oId, srcTs, dx, dy, drawTs);
          }
        }
      }

      for (let i = 0; i < obstacles.length; i++) {
        const obs = obstacles[i];
        if (!obs) continue;
        const ox = Math.round(obs.x) - chunkOriginX;
        const oy = Math.round(obs.y) - chunkOriginY;
        const ow = Math.round(obs.width);
        const oh = Math.round(obs.height);
        const overPad = 24;
        if (
          ox + ow < -overPad ||
          oy + oh < -overPad ||
          ox > chunkSizePx + overPad ||
          oy > chunkSizePx + overPad
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

  return {
    baseChunks,
    overheadChunks,
    cols: chunkCols,
    rows: chunkRows,
    tileCols: decoded.cols,
    tileRows: decoded.rows,
    waterRowIndex,
    waterRowStarts
  };
}

export function renderExplicitAnimatedWater(
  ctx: CanvasRenderingContext2D,
  atlas: HTMLImageElement | HTMLCanvasElement,
  biome: TilesetManifestEntry,
  baked: BakedExplicitTilemapChunks,
  tileSize: number,
  viewMinX: number,
  viewMinY: number,
  viewWidth: number,
  viewHeight: number,
  tick: number
): void {
  const totalWater = baked.waterRowIndex.length / 2;
  if (totalWater === 0) return;

  const srcTs = biome.tileSize;
  const animFrame =
    Math.floor((tick / 60) * biome.animatedFps) % Math.max(1, biome.animatedFrames);
  const startCol = Math.max(0, Math.floor(viewMinX / tileSize));
  const endCol = Math.min(baked.tileCols - 1, Math.ceil((viewMinX + viewWidth) / tileSize));
  const startRow = Math.max(0, Math.floor(viewMinY / tileSize));
  const endRow = Math.min(baked.tileRows - 1, Math.ceil((viewMinY + viewHeight) / tileSize));

  for (let r = startRow; r <= endRow; r++) {
    const startIdx = baked.waterRowStarts[r] ?? 0;
    const endIdx = baked.waterRowStarts[r + 1] ?? startIdx;
    for (let k = startIdx; k < endIdx; k++) {
      const c = baked.waterRowIndex[k * 2] ?? 0;
      if (c < startCol || c > endCol) continue;
      const isFoam = (baked.waterRowIndex[k * 2 + 1] ?? 0) === 1;
      const tileCol = isFoam ? 4 + animFrame : (animFrame + ((c + r) % 2)) % biome.animatedFrames;
      ctx.drawImage(
        atlas,
        tileCol * srcTs,
        biome.animatedRow * srcTs,
        srcTs,
        srcTs,
        c * tileSize,
        r * tileSize,
        tileSize,
        tileSize
      );
    }
  }
}
