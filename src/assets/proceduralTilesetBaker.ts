import type { TilesetManifestEntry } from '../data/assets/types';
import {
  AUTOTILE_EAST,
  AUTOTILE_NORTH,
  AUTOTILE_SOUTH,
  AUTOTILE_WEST
} from '../render/tileset/autotileBitmask';

export const TILESET_ATLAS_COLS = 16;
export const TILESET_ATLAS_ROWS = 4;

/**
 * Bakes a 16x16 pixel biome tileset atlas (16 cols x 4 rows = 256x64 px):
 * - Row 0 (cols 0..15): 16-variant 4-direction autotile ground/edge tiles
 * - Row 1 (cols 0..3):  4-frame animated water/wave/lava/ice/laser tiles
 * - Row 2 (cols 0..3):  Wall / cliff / brick / cyber panel / giant bark tiles
 * - Row 3 (cols 0..3):  Decor overlays (tufts, ripples, sakura, coral, runes, bars)
 */
export function bakeProceduralBiomeTileset(
  biome: TilesetManifestEntry
): HTMLCanvasElement | null {
  if (typeof document === 'undefined') {
    return null;
  }

  const ts = biome.tileSize; // 16
  const canvas = document.createElement('canvas');
  canvas.width = ts * TILESET_ATLAS_COLS;
  canvas.height = ts * TILESET_ATLAS_ROWS;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  ctx.imageSmoothingEnabled = false;
  const pal = biome.palette;

  // Row 0: 16 autotile bitmask variants (0..15)
  for (let mask = 0; mask < 16; mask++) {
    const x0 = mask * ts;
    const y0 = 0;

    // Base fill
    ctx.fillStyle = pal.base;
    ctx.fillRect(x0, y0, ts, ts);

    // Biome-specific subtle pixel texture
    ctx.fillStyle = pal.detail;
    if (biome.biomeId === 'egghead_cyber') {
      ctx.fillRect(x0 + 1, y0 + 1, ts - 2, 1);
      ctx.fillRect(x0 + 1, y0 + 1, 1, ts - 2);
      ctx.fillStyle = pal.accent;
      ctx.fillRect(x0 + 7, y0 + 7, 2, 2);
    } else if (biome.biomeId === 'desert_alabasta') {
      ctx.fillRect(x0 + 2, y0 + 4, 6, 1);
      ctx.fillRect(x0 + 8, y0 + 10, 6, 1);
    } else if (biome.biomeId === 'wano_castle') {
      ctx.fillRect(x0, y0 + 7, ts, 1);
      ctx.fillRect(x0 + 7, y0, 1, 8);
      ctx.fillRect(x0 + 3, y0 + 8, 1, 8);
    } else if (biome.biomeId === 'impel_hell') {
      ctx.fillRect(x0 + 2, y0 + 2, 5, 5);
      ctx.fillRect(x0 + 9, y0 + 9, 5, 5);
    } else if (biome.biomeId === 'snow_drum' || biome.biomeId === 'sky_cloud') {
      ctx.fillRect(x0 + 3, y0 + 3, 3, 2);
      ctx.fillRect(x0 + 10, y0 + 11, 4, 2);
    } else {
      // Cobblestone / grass / ocean grain
      ctx.fillRect(x0 + 2, y0 + 3, 2, 2);
      ctx.fillRect(x0 + 10, y0 + 9, 3, 2);
      ctx.fillRect(x0 + 5, y0 + 12, 2, 2);
    }

    // Draw crisp 2px autotile edge trim on sides WITHOUT matching neighbors
    ctx.fillStyle = pal.edge;
    if ((mask & AUTOTILE_NORTH) === 0) {
      ctx.fillRect(x0, y0, ts, 2);
    }
    if ((mask & AUTOTILE_SOUTH) === 0) {
      ctx.fillRect(x0, y0 + ts - 2, ts, 2);
    }
    if ((mask & AUTOTILE_WEST) === 0) {
      ctx.fillRect(x0, y0, 2, ts);
    }
    if ((mask & AUTOTILE_EAST) === 0) {
      ctx.fillRect(x0 + ts - 2, y0, 2, ts);
    }
  }

  // Row 1: 4-frame animated water / wave / magma / ice / cyber laser tiles
  for (let f = 0; f < 4; f++) {
    const x0 = f * ts;
    const y0 = ts;
    const shift = f * 4;

    ctx.fillStyle = biome.category === 'SEA' ? pal.base : pal.waterOrHazard;
    ctx.fillRect(x0, y0, ts, ts);

    ctx.fillStyle = biome.category === 'SEA' ? pal.detail : pal.base;
    ctx.fillRect(x0 + ((shift + 2) % ts), y0 + 2, 5, 2);
    ctx.fillRect(x0 + ((shift + 9) % ts), y0 + 9, 6, 2);

    // Animated crest / gleam / lightning reflection / lava bubble
    ctx.fillStyle = biome.biomeId === 'sea_new_world' && f === 2 ? pal.accent : pal.edge;
    ctx.fillRect(x0 + (shift % (ts - 4)), y0 + 4, 4, 1);
    ctx.fillRect(x0 + ((shift + 6) % (ts - 3)), y0 + 12, 3, 1);

    if (biome.biomeId === 'egghead_cyber') {
      ctx.fillStyle = pal.accent;
      ctx.fillRect(x0, y0 + ((f * 4) % ts), ts, 1);
    }
  }

  // Row 2: 4 wall / obstacle / building tiles
  for (let i = 0; i < 4; i++) {
    const x0 = i * ts;
    const y0 = ts * 2;
    ctx.fillStyle = pal.wall;
    ctx.fillRect(x0, y0, ts, ts);

    // Top roof/ledge highlight + mortar lines
    ctx.fillStyle = pal.edge;
    ctx.fillRect(x0, y0, ts, 2);
    ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
    ctx.fillRect(x0, y0 + 7, ts, 1);
    ctx.fillRect(x0 + (i % 2 === 0 ? 7 : 4), y0 + 2, 1, 5);
    ctx.fillRect(x0 + (i % 2 === 0 ? 12 : 9), y0 + 8, 1, 8);

    if (biome.biomeId === 'impel_hell' && i >= 2) {
      // Prison iron bars
      ctx.fillStyle = '#94a3b8';
      for (let bx = 2; bx < ts; bx += 4) {
        ctx.fillRect(x0 + bx, y0 + 1, 2, ts - 2);
      }
    } else if (biome.biomeId === 'egghead_cyber') {
      ctx.fillStyle = pal.accent;
      ctx.fillRect(x0 + 3, y0 + 4, 10, 2);
    }
  }

  // Row 3: 4 decor overlay tiles (transparent background)
  for (let i = 0; i < 4; i++) {
    const x0 = i * ts;
    const y0 = ts * 3;
    ctx.clearRect(x0, y0, ts, ts);

    ctx.fillStyle = i % 2 === 0 ? pal.accent : pal.edge;
    if (biome.biomeId === 'wano_castle' || biome.biomeId === 'snow_drum') {
      // Cherry blossom petals / snow crystals
      ctx.fillRect(x0 + 3, y0 + 4, 2, 2);
      ctx.fillRect(x0 + 10, y0 + 3, 2, 2);
      ctx.fillRect(x0 + 7, y0 + 11, 2, 2);
    } else if (biome.biomeId === 'elbaf_giant') {
      // Nordic glowing rune glyph
      ctx.fillRect(x0 + 7, y0 + 2, 2, 12);
      ctx.fillRect(x0 + 4, y0 + 5, 8, 2);
      ctx.fillRect(x0 + 9, y0 + 9, 4, 2);
    } else if (biome.biomeId === 'fishman_coral') {
      // Coral branch & bubble
      ctx.fillRect(x0 + 6, y0 + 6, 4, 8);
      ctx.fillRect(x0 + 4, y0 + 4, 2, 4);
      ctx.fillStyle = '#bae6fd';
      ctx.fillRect(x0 + 11, y0 + 3, 2, 2);
    } else {
      // Ground pebbles / grass / accents
      ctx.fillRect(x0 + 4, y0 + 10, 2, 3);
      ctx.fillRect(x0 + 7, y0 + 9, 2, 4);
      ctx.fillRect(x0 + 10, y0 + 11, 2, 2);
    }
  }

  return canvas;
}
