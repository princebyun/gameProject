export interface ViewportWorldBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

/**
 * Computes world-space frustum bounds for a non-zoomed camera translated by (camX, camY).
 */
export function computeCameraWorldBounds(
  camX: number,
  camY: number,
  viewW: number,
  viewH: number,
  padPx: number = 48
): ViewportWorldBounds {
  return {
    minX: -camX - padPx,
    minY: -camY - padPx,
    maxX: -camX + viewW + padPx,
    maxY: -camY + viewH + padPx
  };
}

/**
 * Computes world-space frustum bounds matching `renderBattleArena`'s transform:
 * translate(viewW * 0.5, viewH * 0.5) -> scale(zoomScale, zoomScale)
 * -> translate(-viewW * 0.5, -viewH * 0.5) -> translate(camX, camY).
 */
export function computeArenaVisibleBounds(
  camX: number,
  camY: number,
  viewW: number,
  viewH: number,
  zoomScale: number = 1,
  padPx: number = 48
): ViewportWorldBounds {
  const safeZoom = Math.max(0.1, zoomScale);
  const halfW = (viewW * 0.5) / safeZoom;
  const halfH = (viewH * 0.5) / safeZoom;
  const centerWorldX = viewW * 0.5 - camX;
  const centerWorldY = viewH * 0.5 - camY;
  return {
    minX: centerWorldX - halfW - padPx,
    minY: centerWorldY - halfH - padPx,
    maxX: centerWorldX + halfW + padPx,
    maxY: centerWorldY + halfH + padPx
  };
}

export function isCircleInBounds(
  bounds: ViewportWorldBounds | undefined,
  x: number,
  y: number,
  radius: number
): boolean {
  if (!bounds) return true;
  const r = Math.max(0, radius);
  return (
    x + r >= bounds.minX &&
    x - r <= bounds.maxX &&
    y + r >= bounds.minY &&
    y - r <= bounds.maxY
  );
}

export function isRectInBounds(
  bounds: ViewportWorldBounds | undefined,
  x: number,
  y: number,
  w: number,
  h: number
): boolean {
  if (!bounds) return true;
  return (
    x + w >= bounds.minX &&
    x <= bounds.maxX &&
    y + h >= bounds.minY &&
    y <= bounds.maxY
  );
}

export function isSegmentInBounds(
  bounds: ViewportWorldBounds | undefined,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  pad: number = 0
): boolean {
  if (!bounds) return true;
  const minX = Math.min(x1, x2) - pad;
  const maxX = Math.max(x1, x2) + pad;
  const minY = Math.min(y1, y2) - pad;
  const maxY = Math.max(y1, y2) + pad;
  return (
    maxX >= bounds.minX &&
    minX <= bounds.maxX &&
    maxY >= bounds.minY &&
    minY <= bounds.maxY
  );
}
