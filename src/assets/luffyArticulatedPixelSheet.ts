/**
 * @deprecated Legacy procedural Luffy sheet baker isolated in `./legacy/luffyArticulatedPixelSheet`.
 * New PixiJS v8 rendering paths (`src/render/pixi/`) are strictly forbidden from importing this module.
 */
export {
  LUFFY_FRAME_WIDTH,
  LUFFY_FRAME_HEIGHT,
  LUFFY_SHEET_COLS,
  LUFFY_SHEET_ROWS,
  LUFFY_GROUND_Y,
  LUFFY_PIXEL_PALETTE,
  LUFFY_11_STATE_KEYFRAMES,
  renderLuffyArticulatedSheetPixels,
  renderLuffyPortraitPixels,
  bakeArticulatedLuffySpriteSheetCanvas,
  bakeLuffyPortraitCanvas,
  type LuffyPortraitEmotion
} from './legacy/luffyArticulatedPixelSheet';
