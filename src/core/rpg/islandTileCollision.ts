import { clamp, type Vec2 } from '../math/vector2';
import type {
  IslandMapDefinition,
  IslandTileMapData,
  IslandZoneTrigger,
  SurfaceMaterialId
} from '../types/rpgSchemas';

export interface DecodedIslandTileMap {
  tileSize: number;
  cols: number;
  rows: number;
  groundIds: Int16Array;
  detailIds: Int16Array;
  overheadIds: Int16Array;
  solidFlags: Uint8Array;
  surfaces: SurfaceMaterialId[];
}

const DECODED_MAP_CACHE = new WeakMap<IslandTileMapData, DecodedIslandTileMap>();

export function decodeIslandTileMap(
  tileMap: IslandTileMapData
): DecodedIslandTileMap {
  const cached = DECODED_MAP_CACHE.get(tileMap);
  if (cached) return cached;

  const { cols, rows, tileSize } = tileMap;
  const total = cols * rows;
  const groundIds = new Int16Array(total);
  const detailIds = new Int16Array(total);
  const overheadIds = new Int16Array(total);
  const solidFlags = new Uint8Array(total);
  const surfaces: SurfaceMaterialId[] = new Array<SurfaceMaterialId>(total);

  for (let r = 0; r < rows; r++) {
    const gRow = tileMap.groundRows[r] ?? '';
    const dRow = tileMap.detailRows[r] ?? '';
    const oRow = tileMap.overheadRows[r] ?? '';
    const sRow = tileMap.solidRows[r] ?? '';
    const mRow = tileMap.surfaceRows[r] ?? '';

    for (let c = 0; c < cols; c++) {
      const idx = r * cols + c;
      const gCh = gRow[c] ?? '.';
      const dCh = dRow[c] ?? '.';
      const oCh = oRow[c] ?? '.';
      const sCh = sRow[c] ?? '.';
      const mCh = mRow[c] ?? '.';

      const gId = tileMap.tileLegend[gCh];
      const dId = tileMap.tileLegend[dCh];
      const oId = tileMap.tileLegend[oCh];
      groundIds[idx] = gId !== undefined ? gId : -1;
      detailIds[idx] = dId !== undefined ? dId : -1;
      overheadIds[idx] = oId !== undefined ? oId : -1;
      solidFlags[idx] = sCh !== '.' && sCh !== ' ' ? 1 : 0;
      surfaces[idx] = tileMap.surfaceLegend[mCh] ?? 'stone';
    }
  }

  const decoded: DecodedIslandTileMap = {
    tileSize,
    cols,
    rows,
    groundIds,
    detailIds,
    overheadIds,
    solidFlags,
    surfaces
  };
  DECODED_MAP_CACHE.set(tileMap, decoded);
  return decoded;
}

export function circleIntersectsRect(
  c: Vec2,
  r: number,
  rect: { x: number; y: number; width: number; height: number }
): boolean {
  const closestX = clamp(c.x, rect.x, rect.x + rect.width);
  const closestY = clamp(c.y, rect.y, rect.y + rect.height);
  return Math.hypot(c.x - closestX, c.y - closestY) < r;
}

export function isCircleBlockedOnIsland(
  candidatePos: Vec2,
  radiusPx: number,
  islandMap: IslandMapDefinition,
  deactivatedBarrierIds: readonly string[]
): boolean {
  if (
    candidatePos.x < radiusPx ||
    candidatePos.x > islandMap.width - radiusPx ||
    candidatePos.y < radiusPx ||
    candidatePos.y > islandMap.height - radiusPx
  ) {
    return true;
  }

  if (islandMap.tileMap) {
    const decoded = decodeIslandTileMap(islandMap.tileMap);
    const ts = decoded.tileSize;
    // Slightly inset tile collider so 1-tile alleyways feel responsive without corner snags
    const tileRadius = Math.max(8, radiusPx - 5);
    const minCol = Math.max(0, Math.floor((candidatePos.x - tileRadius) / ts));
    const maxCol = Math.min(decoded.cols - 1, Math.floor((candidatePos.x + tileRadius) / ts));
    const minRow = Math.max(0, Math.floor((candidatePos.y - tileRadius) / ts));
    const maxRow = Math.min(decoded.rows - 1, Math.floor((candidatePos.y + tileRadius) / ts));

    for (let r = minRow; r <= maxRow; r++) {
      for (let c = minCol; c <= maxCol; c++) {
        if (decoded.solidFlags[r * decoded.cols + c] === 1) {
          if (
            circleIntersectsRect(candidatePos, tileRadius, {
              x: c * ts,
              y: r * ts,
              width: ts,
              height: ts
            })
          ) {
            return true;
          }
        }
      }
    }
  }

  for (let i = 0; i < islandMap.obstacles.length; i++) {
    const obs = islandMap.obstacles[i];
    if (obs && circleIntersectsRect(candidatePos, radiusPx, obs)) {
      return true;
    }
  }

  for (let i = 0; i < islandMap.laserBarriers.length; i++) {
    const barrier = islandMap.laserBarriers[i];
    if (!barrier) continue;
    const isDeactivated = deactivatedBarrierIds.includes(barrier.barrierId);
    if (
      barrier.activeByDefault &&
      !isDeactivated &&
      circleIntersectsRect(candidatePos, radiusPx, barrier)
    ) {
      return true;
    }
  }

  return false;
}

export function moveWithIslandSlide(
  currentPos: Vec2,
  deltaX: number,
  deltaY: number,
  radiusPx: number,
  islandMap: IslandMapDefinition,
  deactivatedBarrierIds: readonly string[]
): Vec2 {
  const minX = 24;
  const maxX = Math.max(minX, islandMap.width - 24);
  const minY = 24;
  const maxY = Math.max(minY, islandMap.height - 24);

  const fullPos: Vec2 = {
    x: clamp(currentPos.x + deltaX, minX, maxX),
    y: clamp(currentPos.y + deltaY, minY, maxY)
  };
  if (!isCircleBlockedOnIsland(fullPos, radiusPx, islandMap, deactivatedBarrierIds)) {
    return fullPos;
  }

  if (Math.abs(deltaX) > 0.01) {
    const xOnly: Vec2 = { x: fullPos.x, y: currentPos.y };
    if (!isCircleBlockedOnIsland(xOnly, radiusPx, islandMap, deactivatedBarrierIds)) {
      return xOnly;
    }
  }

  if (Math.abs(deltaY) > 0.01) {
    const yOnly: Vec2 = { x: currentPos.x, y: fullPos.y };
    if (!isCircleBlockedOnIsland(yOnly, radiusPx, islandMap, deactivatedBarrierIds)) {
      return yOnly;
    }
  }

  return currentPos;
}

export function getSurfaceMaterialAt(
  pos: Vec2,
  islandMap: IslandMapDefinition
): SurfaceMaterialId {
  if (!islandMap.tileMap) {
    if (islandMap.theme === 'FUTURE_LAB') return 'metal_cyber';
    return 'stone';
  }
  const decoded = decodeIslandTileMap(islandMap.tileMap);
  const col = clamp(Math.floor(pos.x / decoded.tileSize), 0, decoded.cols - 1);
  const row = clamp(Math.floor(pos.y / decoded.tileSize), 0, decoded.rows - 1);
  return decoded.surfaces[row * decoded.cols + col] ?? 'stone';
}

export function getZoneTriggerAt(
  pos: Vec2,
  islandMap: IslandMapDefinition
): IslandZoneTrigger | null {
  const zones = islandMap.zones;
  if (!zones || zones.length === 0) return null;
  const tileSize = islandMap.tileMap?.tileSize ?? 32;
  const tx = pos.x / tileSize;
  const ty = pos.y / tileSize;
  for (let i = 0; i < zones.length; i++) {
    const z = zones[i];
    if (!z) continue;
    if (tx >= z.tileX && tx < z.tileX + z.tileW && ty >= z.tileY && ty < z.tileY + z.tileH) {
      return z;
    }
  }
  return null;
}
