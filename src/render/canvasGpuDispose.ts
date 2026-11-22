/**
 * Zeroes an offscreen HTMLCanvasElement backing store so Android WebView / Chromium GPU
 * texture memory is released immediately upon LRU eviction or scene disposal.
 */
export function releaseOffscreenCanvas(
  canvas: HTMLCanvasElement | null | undefined
): void {
  if (!canvas) return;
  try {
    canvas.width = 0;
    canvas.height = 0;
  } catch {
    // Ignore read-only or detached canvas errors in mock/Node environments
  }
}

/**
 * Releases canvas-like resources (offscreen canvases or mock canvases) while safely
 * ignoring HTMLImageElement instances.
 */
export function releaseCanvasLike(
  resource: HTMLImageElement | HTMLCanvasElement | null | undefined
): void {
  if (!resource) return;
  const isHtmlCanvas =
    typeof HTMLCanvasElement !== 'undefined' &&
    resource instanceof HTMLCanvasElement;
  const isCanvasDuck =
    typeof resource === 'object' &&
    'getContext' in resource &&
    typeof resource.getContext === 'function';
  if (isHtmlCanvas || isCanvasDuck) {
    releaseOffscreenCanvas(resource as HTMLCanvasElement);
  }
}
