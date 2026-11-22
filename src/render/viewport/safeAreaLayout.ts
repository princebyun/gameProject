export interface SafeAreaInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface SafeRect {
  left: number;
  top: number;
  right: number;
  bottom: number;
  width: number;
  height: number;
}

export const ZERO_SAFE_INSETS: SafeAreaInsets = {
  top: 0,
  right: 0,
  bottom: 0,
  left: 0
};

/**
 * Probes CSS `env(safe-area-inset-*)` values in CSS pixels so canvas HUDs,
 * minimaps, dialogue overlays, and virtual touch controllers stay clear of
 * Galaxy S25 Ultra punch-holes, display cutouts, and rounded screen corners.
 */
export class SafeAreaLayout {
  private probeEl: HTMLElement | null = null;
  private simulatedCssInsets: SafeAreaInsets | null = null;

  public setSimulatedSafeInsets(insets: SafeAreaInsets | null): void {
    this.simulatedCssInsets = insets ? { ...insets } : null;
  }

  public getSimulatedSafeInsets(): SafeAreaInsets | null {
    return this.simulatedCssInsets ? { ...this.simulatedCssInsets } : null;
  }

  public readCssSafeInsets(): SafeAreaInsets {
    if (this.simulatedCssInsets) {
      return { ...this.simulatedCssInsets };
    }
    if (typeof document === 'undefined' || typeof window === 'undefined') {
      return { ...ZERO_SAFE_INSETS };
    }

    if (!this.probeEl && document.body) {
      const el = document.createElement('div');
      el.id = 'opgv-safe-area-probe';
      el.setAttribute('aria-hidden', 'true');
      el.style.cssText = [
        'position:fixed',
        'top:0',
        'left:0',
        'width:0',
        'height:0',
        'visibility:hidden',
        'pointer-events:none',
        'padding-top:env(safe-area-inset-top, 0px)',
        'padding-right:env(safe-area-inset-right, 0px)',
        'padding-bottom:env(safe-area-inset-bottom, 0px)',
        'padding-left:env(safe-area-inset-left, 0px)'
      ].join(';');
      document.body.appendChild(el);
      this.probeEl = el;
    }

    if (!this.probeEl) {
      return { ...ZERO_SAFE_INSETS };
    }

    const cs = window.getComputedStyle(this.probeEl);
    return {
      top: Math.max(0, parseFloat(cs.paddingTop) || 0),
      right: Math.max(0, parseFloat(cs.paddingRight) || 0),
      bottom: Math.max(0, parseFloat(cs.paddingBottom) || 0),
      left: Math.max(0, parseFloat(cs.paddingLeft) || 0)
    };
  }

  public destroy(): void {
    if (this.probeEl && this.probeEl.parentNode) {
      this.probeEl.parentNode.removeChild(this.probeEl);
    }
    this.probeEl = null;
  }
}

export function convertCssInsetsToLogical(
  cssInsets: SafeAreaInsets,
  cssWidth: number,
  cssHeight: number,
  viewWidth: number,
  viewHeight: number
): SafeAreaInsets {
  const scaleX = cssWidth > 0 ? viewWidth / cssWidth : 1;
  const scaleY = cssHeight > 0 ? viewHeight / cssHeight : 1;
  return {
    top: Math.min(Math.round(viewHeight * 0.2), Math.max(0, Math.round(cssInsets.top * scaleY))),
    bottom: Math.min(Math.round(viewHeight * 0.2), Math.max(0, Math.round(cssInsets.bottom * scaleY))),
    left: Math.min(Math.round(viewWidth * 0.2), Math.max(0, Math.round(cssInsets.left * scaleX))),
    right: Math.min(Math.round(viewWidth * 0.2), Math.max(0, Math.round(cssInsets.right * scaleX)))
  };
}

export function computeSafeRect(
  viewWidth: number,
  viewHeight: number,
  insets: SafeAreaInsets,
  extraPadding = 0
): SafeRect {
  const left = insets.left + extraPadding;
  const top = insets.top + extraPadding;
  const right = Math.max(left + 1, viewWidth - insets.right - extraPadding);
  const bottom = Math.max(top + 1, viewHeight - insets.bottom - extraPadding);
  return {
    left,
    top,
    right,
    bottom,
    width: right - left,
    height: bottom - top
  };
}

export interface ViewportBoundsLike {
  viewWidth: number;
  viewHeight: number;
  arenaOffsetX: number;
  safeInsets: SafeAreaInsets;
}

export interface SafeHudBounds extends SafeRect {
  viewWidth: number;
  viewHeight: number;
  centerX: number;
  arenaOffsetX: number;
  insets: SafeAreaInsets;
}

/**
 * Extracts normalized Safe Area inset coordinates and safe bounding box from any ViewportMetrics-like object.
 */
export function getSafeHudBounds(viewport: ViewportBoundsLike, extraPadding = 0): SafeHudBounds {
  const rect = computeSafeRect(
    viewport.viewWidth,
    viewport.viewHeight,
    viewport.safeInsets,
    extraPadding
  );
  return {
    ...rect,
    viewWidth: viewport.viewWidth,
    viewHeight: viewport.viewHeight,
    centerX: viewport.viewWidth * 0.5,
    arenaOffsetX: viewport.arenaOffsetX,
    insets: viewport.safeInsets
  };
}

/**
 * Converts a viewport-logical coordinate (x in 0..viewWidth) into 960x540 deterministic arena/island space.
 */
export function logicalToArenaPoint(
  viewport: Pick<ViewportBoundsLike, 'arenaOffsetX'>,
  pt: { x: number; y: number }
): { x: number; y: number } {
  return {
    x: pt.x - viewport.arenaOffsetX,
    y: pt.y
  };
}

/**
 * Checks whether a logical Y coordinate falls within a bottom HUD band inset from safeInsets.bottom.
 */
export function isPointInBottomSafeBand(
  viewport: Pick<ViewportBoundsLike, 'viewHeight' | 'safeInsets'>,
  ptY: number,
  bandHeight: number
): boolean {
  const safeBottomEdge = viewport.viewHeight - viewport.safeInsets.bottom;
  return ptY >= safeBottomEdge - bandHeight && ptY <= viewport.viewHeight;
}
