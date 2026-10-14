/** Limit fragment work while retaining native-density outlines on small screens. */
export const MAX_RENDER_PIXEL_RATIO = 2;
export const MAX_RENDER_PIXELS = 3_000_000;
export const COMPACT_HULL_ZOOM = .7;

export interface RenderViewport {
  cssWidth: number;
  cssHeight: number;
  backingWidth: number;
  backingHeight: number;
  pixelRatio: number;
  scaleZoom: number;
}

const dimension = (value: number) => Number.isFinite(value) && value > 0 ? Math.max(1, Math.round(value)) : 1;

/** The backing size and CSS zoom change rendering only, never simulation coordinates. */
export function chooseRenderViewport(width: number, height: number, devicePixelRatio: number): RenderViewport {
  const cssWidth = dimension(width), cssHeight = dimension(height);
  const density = Number.isFinite(devicePixelRatio) && devicePixelRatio > 0 ? Math.max(1, devicePixelRatio) : 1;
  // Separate square roots avoid overflow for malformed, excessively large sizes.
  let pixelRatio = Math.min(MAX_RENDER_PIXEL_RATIO, density,
    Math.sqrt(MAX_RENDER_PIXELS) / Math.sqrt(cssWidth) / Math.sqrt(cssHeight),
    MAX_RENDER_PIXELS / cssWidth, MAX_RENDER_PIXELS / cssHeight);
  let backingWidth = Math.max(1, Math.round(cssWidth * pixelRatio));
  let backingHeight = Math.max(1, Math.round(cssHeight * pixelRatio));
  if (backingWidth * backingHeight > MAX_RENDER_PIXELS) {
    pixelRatio *= Math.sqrt(MAX_RENDER_PIXELS / (backingWidth * backingHeight));
    backingWidth = Math.max(1, Math.floor(cssWidth * pixelRatio));
    backingHeight = Math.max(1, Math.floor(cssHeight * pixelRatio));
  }
  return { cssWidth, cssHeight, backingWidth, backingHeight, pixelRatio, scaleZoom: 1 / pixelRatio };
}

/** Decide from the size seen by the player, independent of display pixel density. */
export function useCompactHull(cssWorldZoom: number): boolean {
  return !Number.isFinite(cssWorldZoom) || cssWorldZoom < COMPACT_HULL_ZOOM;
}
