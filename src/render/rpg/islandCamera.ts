import { LOGICAL_HEIGHT, LOGICAL_WIDTH } from '../../core/constants';
import { clamp, type Vec2 } from '../../core/math/vector2';
import type { IslandMapDefinition } from '../../core/types/rpgSchemas';
import type { ViewportMetrics } from '../viewport/responsiveViewportManager';

export interface IslandCameraTransform {
  camX: number;
  camY: number;
  offsetX: number;
  isScrolling: boolean;
  viewWidth: number;
  viewHeight: number;
}

/**
 * Computes scrolling world camera for expanded 7-layer hub maps (>960x540)
 * while preserving exact centered arenaOffsetX framing on legacy 960x540 islands.
 */
export function computeIslandCameraTransform(
  islandMap: Pick<IslandMapDefinition, 'width' | 'height' | 'tileMap'>,
  playerPos: Vec2,
  viewport: ViewportMetrics
): IslandCameraTransform {
  const isExpandedMap =
    islandMap.width > LOGICAL_WIDTH ||
    islandMap.height > LOGICAL_HEIGHT ||
    Boolean(islandMap.tileMap);

  if (!isExpandedMap) {
    return {
      camX: 0,
      camY: 0,
      offsetX: viewport.arenaOffsetX,
      isScrolling: false,
      viewWidth: viewport.viewWidth,
      viewHeight: viewport.viewHeight
    };
  }

  const maxCamX = Math.max(0, islandMap.width - viewport.viewWidth);
  const maxCamY = Math.max(0, islandMap.height - viewport.viewHeight);
  const camX =
    maxCamX > 0 ? clamp(Math.round(playerPos.x - viewport.viewWidth * 0.5), 0, maxCamX) : 0;
  const camY =
    maxCamY > 0 ? clamp(Math.round(playerPos.y - viewport.viewHeight * 0.5), 0, maxCamY) : 0;
  const offsetX =
    islandMap.width < viewport.viewWidth
      ? Math.round((viewport.viewWidth - islandMap.width) * 0.5)
      : 0;

  return {
    camX,
    camY,
    offsetX,
    isScrolling: true,
    viewWidth: viewport.viewWidth,
    viewHeight: viewport.viewHeight
  };
}

export function logicalScreenToIslandWorld(
  pt: Vec2,
  cam: IslandCameraTransform
): Vec2 {
  return {
    x: pt.x - cam.offsetX + cam.camX,
    y: pt.y + cam.camY
  };
}
