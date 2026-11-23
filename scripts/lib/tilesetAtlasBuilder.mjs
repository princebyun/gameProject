import {
  applyBiomeGrade,
  blit,
  createImage,
  encodeImageToPng,
  hexToRgb,
  resizeNearest
} from './pngCodec.mjs';

const TILE = 16;
const ATLAS_W = 256; // 16 cols * 16px
const ATLAS_H = 256; // 16 rows * 16px

function isTileNonEmpty(img, sx, sy) {
  if (sx + TILE > img.width || sy + TILE > img.height) return false;
  let opaque = 0;
  for (let y = sy; y < sy + TILE; y++) {
    for (let x = sx; x < sx + TILE; x++) {
      if (img.data[(y * img.width + x) * 4 + 3] >= 24) opaque++;
    }
  }
  return opaque >= 24;
}

function isTileOpaque(img, sx, sy) {
  if (sx + TILE > img.width || sy + TILE > img.height) return false;
  let opaque = 0;
  for (let y = sy; y < sy + TILE; y++) {
    for (let x = sx; x < sx + TILE; x++) {
      if (img.data[(y * img.width + x) * 4 + 3] >= 200) opaque++;
    }
  }
  return opaque >= 248;
}

function collectTiles(img, maxSamples = 96, requireOpaque = false) {
  if (!img) return [];
  const tiles = [];
  const cols = Math.floor(img.width / TILE);
  const rows = Math.floor(img.height / TILE);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const sx = c * TILE;
      const sy = r * TILE;
      const ok = requireOpaque ? isTileOpaque(img, sx, sy) : isTileNonEmpty(img, sx, sy);
      if (ok) {
        tiles.push({ img, sx, sy });
        if (tiles.length >= maxSamples) return tiles;
      }
    }
  }
  return tiles;
}

function forceTileOpaque(atlas, col, row) {
  const ox = col * TILE;
  const oy = row * TILE;
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      atlas.data[((oy + y) * ATLAS_W + ox + x) * 4 + 3] = 255;
    }
  }
}

function makeSolidTile(hex, detailHex, seed) {
  const tile = createImage(TILE, TILE);
  const base = hexToRgb(hex);
  const det = hexToRgb(detailHex);
  let s = (seed + 1) * 2654435761;
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      s = (s * 1664525 + 1013904223) >>> 0;
      const pick = (s % 11 === 0) || ((x * 7 + y * 13) % 17 === 0);
      const rgb = pick ? det : base;
      const di = (y * TILE + x) * 4;
      tile.data[di] = rgb[0];
      tile.data[di + 1] = rgb[1];
      tile.data[di + 2] = rgb[2];
      tile.data[di + 3] = 255;
    }
  }
  return tile;
}

function stampTile(atlas, col, row, src, sx, sy, opts = {}) {
  blit(atlas, src, sx, sy, TILE, TILE, col * TILE, row * TILE, opts);
}

function fillTileWithCrop(atlas, col, row, srcImg, xRatio, yRatio, wFrac, hFrac, tintHex = null, strength = 0.25) {
  const sx = Math.max(0, Math.min(srcImg.width - 16, Math.floor(srcImg.width * xRatio)));
  const sy = Math.max(0, Math.min(srcImg.height - 16, Math.floor(srcImg.height * yRatio)));
  const sw = Math.max(16, Math.min(srcImg.width - sx, Math.floor(srcImg.width * wFrac)));
  const sh = Math.max(16, Math.min(srcImg.height - sy, Math.floor(srcImg.height * hFrac)));
  const crop = createImage(sw, sh);
  blit(crop, srcImg, sx, sy, sw, sh, 0, 0, { alphaBlend: false });
  let resized = resizeNearest(crop, TILE, TILE);
  if (tintHex) {
    resized = applyBiomeGrade(resized, { tintHex, strength });
  }
  stampTile(atlas, col, row, resized, 0, 0, { alphaBlend: true });
}

function addOrganicGroundDetails(atlas, biome) {
  const pal = biome.palette;
  const edge = hexToRgb(pal.edge);
  const accent = hexToRgb(pal.accent);
  const detail = hexToRgb(pal.detail);
  const wall = hexToRgb(pal.wall);
  const water = hexToRgb(pal.waterOrHazard);

  // Ensure Row 0 cols 0..15 have organic curved autotile edges + ground tufts
  for (let mask = 0; mask < 16; mask++) {
    const ox = mask * TILE;
    for (let y = 0; y < TILE; y++) {
      for (let x = 0; x < TILE; x++) {
        const di = (y * ATLAS_W + ox + x) * 4;
        // Scalloped organic trim on cardinal exposed sides
        const wave = ((x + y) % 3 === 0) ? 3 : 2;
        const nEdge = !(mask & 1) && y < wave;
        const eEdge = !(mask & 2) && x >= TILE - wave;
        const sEdge = !(mask & 4) && y >= TILE - wave;
        const wEdge = !(mask & 8) && x < wave;
        if (nEdge || eEdge || sEdge || wEdge) {
          atlas.data[di] = Math.round(atlas.data[di] * 0.45 + edge[0] * 0.55);
          atlas.data[di + 1] = Math.round(atlas.data[di + 1] * 0.45 + edge[1] * 0.55);
          atlas.data[di + 2] = Math.round(atlas.data[di + 2] * 0.45 + edge[2] * 0.55);
          atlas.data[di + 3] = 255;
        } else if (((x * 13 + y * 7 + mask * 5) % 29) === 0) {
          // Scattered 2px ground tuft / texture
          atlas.data[di] = detail[0];
          atlas.data[di + 1] = detail[1];
          atlas.data[di + 2] = detail[2];
          atlas.data[di + 3] = 255;
        }
      }
    }
  }

  // Row 1 cols 4..7: 4-frame animated white/sky coastal foam halos
  for (let f = 0; f < 4; f++) {
    const ox = (4 + f) * TILE;
    for (let y = 0; y < TILE; y++) {
      for (let x = 0; x < TILE; x++) {
        const di = ((1 * TILE + y) * ATLAS_W + ox + x) * 4;
        const ripple = Math.sin((x + f * 4) * 0.65) + Math.cos((y - f * 2) * 0.65);
        const isFoam = ripple > 1.15 || (y <= 1 && (x + f) % 3 !== 0);
        if (isFoam) {
          atlas.data[di] = 232;
          atlas.data[di + 1] = 246;
          atlas.data[di + 2] = 255;
          atlas.data[di + 3] = 255;
        } else {
          atlas.data[di] = water[0];
          atlas.data[di + 1] = water[1];
          atlas.data[di + 2] = water[2];
          atlas.data[di + 3] = 255;
        }
      }
    }
  }

  // Row 3 cols 12..15: 3-5px dark contact shadow decals (transparent ground shadow)
  for (let c = 12; c < 16; c++) {
    const ox = c * TILE;
    for (let y = 0; y < TILE; y++) {
      for (let x = 0; x < TILE; x++) {
        const di = ((3 * TILE + y) * ATLAS_W + ox + x) * 4;
        const shadowBand = c === 12 ? y < 5 : c === 13 ? y >= 11 : c === 14 ? (y < 4 && x > 1) : (Math.hypot(x - 7.5, y - 8) < 6);
        if (shadowBand) {
          atlas.data[di] = 8;
          atlas.data[di + 1] = 12;
          atlas.data[di + 2] = 22;
          atlas.data[di + 3] = 115;
        } else {
          atlas.data[di + 3] = 0;
        }
      }
    }
  }

  // Row 3 cols 8..11: crisp wildflowers & biome scatter decals on transparent bg
  for (let c = 8; c < 12; c++) {
    const ox = c * TILE;
    for (let y = 0; y < TILE; y++) {
      for (let x = 0; x < TILE; x++) {
        const di = ((3 * TILE + y) * ATLAS_W + ox + x) * 4;
        const hit = (x === 4 && y === 5) || (x === 11 && y === 10) || (x === 6 && y === 12);
        const leaf = (x === 4 && y === 6) || (x === 11 && y === 11);
        if (hit) {
          atlas.data[di] = accent[0];
          atlas.data[di + 1] = accent[1];
          atlas.data[di + 2] = accent[2];
          atlas.data[di + 3] = 255;
        } else if (leaf) {
          atlas.data[di] = detail[0];
          atlas.data[di + 1] = detail[1];
          atlas.data[di + 2] = detail[2];
          atlas.data[di + 3] = 255;
        } else {
          atlas.data[di + 3] = 0;
        }
      }
    }
  }

  // Row 4 cols 4..5: opaque multi-pane reflective blue window & recessed wood door
  for (let y = 0; y < TILE; y++) {
    for (let x = 0; x < TILE; x++) {
      const plankShade = y % 4 === 0 ? -18 : 0;
      const wallR = Math.max(0, Math.min(255, wall[0] + plankShade));
      const wallG = Math.max(0, Math.min(255, wall[1] + plankShade));
      const wallB = Math.max(0, Math.min(255, wall[2] + plankShade));

      const wi = ((4 * TILE + y) * ATLAS_W + 4 * TILE + x) * 4;
      const inFrame = x >= 2 && x <= 13 && y >= 2 && y <= 13;
      const glass = x >= 4 && x <= 11 && y >= 4 && y <= 11 && x !== 7 && x !== 8 && y !== 7 && y !== 8;
      if (inFrame) {
        atlas.data[wi] = glass ? (x + y < 13 ? 125 : 56) : Math.max(16, wall[0] - 28);
        atlas.data[wi + 1] = glass ? (x + y < 13 ? 211 : 148) : Math.max(16, wall[1] - 28);
        atlas.data[wi + 2] = glass ? 248 : Math.max(18, wall[2] - 24);
      } else {
        atlas.data[wi] = wallR;
        atlas.data[wi + 1] = wallG;
        atlas.data[wi + 2] = wallB;
      }
      atlas.data[wi + 3] = 255;

      const dIdx = ((4 * TILE + y) * ATLAS_W + 5 * TILE + x) * 4;
      const inDoor = x >= 3 && x <= 12 && y >= 2;
      if (inDoor) {
        const border = x === 3 || x === 12 || y === 2;
        const knob = x === 10 && y === 9;
        atlas.data[dIdx] = knob ? 250 : border ? 24 : Math.max(20, wall[0] - 32);
        atlas.data[dIdx + 1] = knob ? 204 : border ? 20 : Math.max(18, wall[1] - 32);
        atlas.data[dIdx + 2] = knob ? 21 : border ? 24 : Math.max(18, wall[2] - 28);
      } else {
        atlas.data[dIdx] = wallR;
        atlas.data[dIdx + 1] = wallG;
        atlas.data[dIdx + 2] = wallB;
      }
      atlas.data[dIdx + 3] = 255;
    }
  }
}

/**
 * Builds a 256x256 (16 cols x 16 rows of 16x16 tiles) multi-layer pixel RPG tileset
 * composed strictly from genuine downloaded external tilesets & pixel-buildings, color-graded per biome.
 */
export function buildLayeredBiomeTileset(biome, sources) {
  const {
    medTiles,
    ninjaTiles,
    ninjaSnow,
    prehistTiles,
    ogaWaterGrassSand,
    ogaWaterworld,
    ogaDesert,
    ogaFloors,
    kenneyTiles,
    buildingsSummer,
    buildingsWinter
  } = sources;

  const atlas = createImage(ATLAS_W, ATLAS_H);
  const pal = biome.palette;

  // Choose primary downloaded tileset per biome theme
  const isSnow = biome.biomeId === 'snow_drum' || biome.biomeId === 'marine_ice';
  const isDesert = biome.biomeId === 'desert_alabasta';
  const isWano = biome.biomeId === 'wano_castle';
  const isSeaOrCoral = biome.category === 'SEA' || biome.biomeId === 'fishman_coral';
  const isCyber = biome.biomeId === 'egghead_cyber';
  const isDark = biome.biomeId === 'spooky_fog' || biome.biomeId === 'impel_hell';

  const primarySheet = isWano
    ? ninjaTiles
    : isSnow
      ? (ninjaSnow ?? ogaFloors)
      : isDesert
        ? (ogaDesert ?? ogaWaterGrassSand)
        : isSeaOrCoral
          ? (ogaWaterworld ?? ogaWaterGrassSand)
          : isDark
            ? (ogaFloors ?? medTiles)
            : (medTiles ?? ninjaTiles);

  const primaryTiles = collectTiles(primarySheet, 128, true);
  const medPool = collectTiles(medTiles ?? primarySheet, 96, false);
  const medOpaque = collectTiles(medTiles ?? primarySheet, 96, true);
  const floorOpaque = collectTiles(ogaFloors ?? primarySheet, 64, true);
  const ninjaPool = collectTiles(ninjaTiles ?? primarySheet, 96, false);
  const waterPool = collectTiles(ogaWaterworld ?? ogaWaterGrassSand ?? primarySheet, 64, true);
  const floorPool = collectTiles(ogaFloors ?? primarySheet, 64, false);
  const kenneyPool = (kenneyTiles ?? []).flatMap((img) => collectTiles(img, 4, true)).filter(Boolean);

  const pick = (pool, idx) => {
    if (pool.length > 0) return pool[idx % pool.length];
    return null;
  };

  // Row 0 (cols 0..15): 100% opaque ground terrain autotiles graded to biome palette
  for (let c = 0; c < 16; c++) {
    const srcTile = isCyber
      ? pick(floorOpaque, (c % 4))
      : isDesert
        ? pick(primaryTiles, (c % 4))
        : pick(primaryTiles, c % 4) ?? pick(medOpaque, c);
    if (srcTile) {
      const cell = createImage(TILE, TILE);
      blit(cell, srcTile.img, srcTile.sx, srcTile.sy, TILE, TILE, 0, 0, { alphaBlend: false });
      const graded = applyBiomeGrade(cell, { tintHex: pal.base, strength: isSeaOrCoral ? 0.54 : 0.42, contrast: 1.06 });
      stampTile(atlas, c, 0, graded, 0, 0, { alphaBlend: false });
    } else {
      const fallback = makeSolidTile(pal.base, pal.detail, c);
      stampTile(atlas, c, 0, fallback, 0, 0, { alphaBlend: false });
    }
    forceTileOpaque(atlas, c, 0);
  }

  // Row 1 cols 0..3: Seamless phase-shifted animated ocean wave tiles (NO checkerboard!)
  const seaBase = makeSolidTile(pal.waterOrHazard, pal.accent, 3);
  const sampledWater = pick(waterPool, 0);
  if (sampledWater) {
    const rawW = createImage(TILE, TILE);
    blit(rawW, sampledWater.img, sampledWater.sx, sampledWater.sy, TILE, TILE, 0, 0, { alphaBlend: false });
    const gradedW = applyBiomeGrade(rawW, { tintHex: pal.waterOrHazard, strength: 0.72, contrast: 0.92 });
    blit(seaBase, gradedW, 0, 0, TILE, TILE, 0, 0, { alphaBlend: false });
  }
  const wRgb = hexToRgb(pal.waterOrHazard);
  const aRgb = hexToRgb(pal.accent);
  for (let f = 0; f < 4; f++) {
    const ox = f * TILE;
    for (let y = 0; y < TILE; y++) {
      for (let x = 0; x < TILE; x++) {
        const sx = (x + f * 4) % TILE;
        const si = (y * TILE + sx) * 4;
        const di = ((1 * TILE + y) * ATLAS_W + ox + x) * 4;
        const crest = ((y === 3 || y === 11) && ((x + f * 4 + y) % 16) >= 3 && ((x + f * 4 + y) % 16) <= 7);
        const trough = (y === 4 || y === 12) && ((x + f * 4 + y) % 16) >= 4 && ((x + f * 4 + y) % 16) <= 7;
        let r = Math.round(seaBase.data[si] * 0.45 + wRgb[0] * 0.55);
        let g = Math.round(seaBase.data[si + 1] * 0.45 + wRgb[1] * 0.55);
        let b = Math.round(seaBase.data[si + 2] * 0.45 + wRgb[2] * 0.55);
        if (crest) {
          r = Math.min(255, Math.round(r * 0.5 + aRgb[0] * 0.5 + 35));
          g = Math.min(255, Math.round(g * 0.5 + aRgb[1] * 0.5 + 45));
          b = Math.min(255, Math.round(b * 0.5 + aRgb[2] * 0.5 + 50));
        } else if (trough) {
          r = Math.max(0, r - 18);
          g = Math.max(0, g - 16);
          b = Math.max(0, b - 12);
        }
        atlas.data[di] = r;
        atlas.data[di + 1] = g;
        atlas.data[di + 2] = b;
        atlas.data[di + 3] = 255;
      }
    }
  }
  for (let c = 8; c < 16; c++) {
    const fallbackH = makeSolidTile(pal.waterOrHazard, pal.detail, c);
    stampTile(atlas, c, 1, fallbackH, 0, 0, { alphaBlend: false });
  }

  // Row 2: Props/trunks (0..11) + Opaque cobblestone / pier roads (12..15)
  const detailRgb = hexToRgb(pal.detail);
  const edgeRgb = hexToRgb(pal.edge);
  for (let c = 0; c < 12; c++) {
    const srcTile = (c >= 4 && c < 8 && kenneyPool.length > 0)
      ? pick(kenneyPool, c)
      : pick(medOpaque, 4 + c) ?? makeSolidTile(pal.wall, pal.detail, c);
    if (srcTile.img) {
      const cell = createImage(TILE, TILE);
      blit(cell, srcTile.img, srcTile.sx, srcTile.sy, TILE, TILE, 0, 0, { alphaBlend: false });
      const graded = applyBiomeGrade(cell, { tintHex: pal.wall, strength: 0.45 });
      stampTile(atlas, c, 2, graded, 0, 0, { alphaBlend: false });
    } else {
      stampTile(atlas, c, 2, srcTile, 0, 0, { alphaBlend: false });
    }
    forceTileOpaque(atlas, c, 2);
  }
  for (let c = 12; c < 16; c++) {
    const roadBase = makeSolidTile(pal.detail, pal.base, c + 19);
    const ox = c * TILE;
    for (let y = 0; y < TILE; y++) {
      for (let x = 0; x < TILE; x++) {
        const si = (y * TILE + x) * 4;
        const di = ((2 * TILE + y) * ATLAS_W + ox + x) * 4;
        const seam = (y === 0 || y === 8 || ((y < 8 ? x : x + 4) % 8 === 0));
        const pebble = ((x * 5 + y * 9 + c * 3) % 19 === 0);
        const r = Math.round(roadBase.data[si] * 0.6 + detailRgb[0] * 0.4);
        const g = Math.round(roadBase.data[si + 1] * 0.6 + detailRgb[1] * 0.4);
        const b = Math.round(roadBase.data[si + 2] * 0.6 + detailRgb[2] * 0.4);
        atlas.data[di] = seam ? Math.max(0, r - 24) : pebble ? Math.min(255, Math.round((r + edgeRgb[0]) * 0.5)) : r;
        atlas.data[di + 1] = seam ? Math.max(0, g - 24) : pebble ? Math.min(255, Math.round((g + edgeRgb[1]) * 0.5)) : g;
        atlas.data[di + 2] = seam ? Math.max(0, b - 22) : pebble ? Math.min(255, Math.round((b + edgeRgb[2]) * 0.5)) : b;
        atlas.data[di + 3] = 255;
      }
    }
  }

  // Row 3: Ground decals (preserve transparency)
  for (let c = 0; c < 8; c++) {
    const srcTile = pick(ninjaPool, 24 + c) ?? pick(medPool, 24 + c);
    if (srcTile) {
      const cell = createImage(TILE, TILE);
      blit(cell, srcTile.img, srcTile.sx, srcTile.sy, TILE, TILE, 0, 0, { alphaBlend: true });
      const graded = applyBiomeGrade(cell, { tintHex: pal.accent, strength: 0.25 });
      stampTile(atlas, c, 3, graded, 0, 0, { alphaBlend: true });
    }
  }

  // Row 4..7: 100% Opaque brick / plank masonry building facade walls graded to pal.wall
  const wallRgb = hexToRgb(pal.wall);
  for (let r = 4; r <= 7; r++) {
    for (let c = 0; c < 16; c++) {
      const ox = c * TILE;
      const oy = r * TILE;
      for (let y = 0; y < TILE; y++) {
        for (let x = 0; x < TILE; x++) {
          const di = ((oy + y) * ATLAS_W + ox + x) * 4;
          const mortar = (y % 4 === 0) || ((Math.floor(y / 4) % 2 === 0 ? x : x + 4) % 8 === 0);
          const timberTrim = c % 4 === 0 && (x <= 1 || x >= 14);
          const hi = y % 4 === 1;
          atlas.data[di] = Math.max(12, Math.min(255, wallRgb[0] + (timberTrim ? -28 : mortar ? -22 : hi ? 14 : 0)));
          atlas.data[di + 1] = Math.max(12, Math.min(255, wallRgb[1] + (timberTrim ? -28 : mortar ? -22 : hi ? 14 : 0)));
          atlas.data[di + 2] = Math.max(14, Math.min(255, wallRgb[2] + (timberTrim ? -24 : mortar ? -20 : hi ? 12 : 0)));
          atlas.data[di + 3] = 255;
        }
      }
    }
  }

  // Row 8..11: Opaque roof shingles (cols 0..7) + 4-tone cel-shaded tree foliage clusters (cols 8..15)
  const bldgCrop = buildingsSummer ? collectTiles(buildingsSummer, 48, true) : [];
  const winCrop = buildingsWinter ? collectTiles(buildingsWinter, 48, true) : [];
  for (let r = 8; r <= 11; r++) {
    for (let c = 0; c < 8; c++) {
      const ox = c * TILE;
      const oy = r * TILE;
      const srcRoof = isSnow && winCrop.length > 0 ? pick(winCrop, c) : pick(bldgCrop, c);
      const roofBase = makeSolidTile(pal.edge, pal.detail, r * 16 + c);
      if (srcRoof) {
        const tmp = createImage(TILE, TILE);
        blit(tmp, srcRoof.img, srcRoof.sx, srcRoof.sy, TILE, TILE, 0, 0, { alphaBlend: false });
        const gradedRoof = applyBiomeGrade(tmp, { tintHex: pal.edge, strength: 0.72, contrast: 1.1 });
        blit(roofBase, gradedRoof, 0, 0, TILE, TILE, 0, 0, { alphaBlend: false });
      }
      for (let y = 0; y < TILE; y++) {
        for (let x = 0; x < TILE; x++) {
          const si = (y * TILE + x) * 4;
          const di = ((oy + y) * ATLAS_W + ox + x) * 4;
          const ridge = (y % 4 === 3);
          const scallop = ((Math.floor(y / 4) % 2 === 0 ? x : x + 3) % 6 === 0);
          const highlight = y % 4 === 0;
          const bR = Math.round(roofBase.data[si] * 0.45 + edgeRgb[0] * 0.55);
          const bG = Math.round(roofBase.data[si + 1] * 0.45 + edgeRgb[1] * 0.55);
          const bB = Math.round(roofBase.data[si + 2] * 0.45 + edgeRgb[2] * 0.55);
          atlas.data[di] = Math.max(10, Math.min(255, bR + (ridge ? -36 : scallop ? -18 : highlight ? 22 : 0)));
          atlas.data[di + 1] = Math.max(10, Math.min(255, bG + (ridge ? -36 : scallop ? -18 : highlight ? 22 : 0)));
          atlas.data[di + 2] = Math.max(12, Math.min(255, bB + (ridge ? -30 : scallop ? -14 : highlight ? 18 : 0)));
          atlas.data[di + 3] = 255;
        }
      }
    }
    for (let c = 8; c < 16; c++) {
      const ox = c * TILE;
      const oy = r * TILE;
      const leafBase = hexToRgb(pal.base);
      const leafLit = hexToRgb(pal.accent);
      const leafShade = hexToRgb(pal.detail);
      for (let y = 0; y < TILE; y++) {
        for (let x = 0; x < TILE; x++) {
          const di = ((oy + y) * ATLAS_W + ox + x) * 4;
          const d = Math.hypot((x - 7.5) / 7.2, (y - 8) / 7.0);
          if (d <= 0.98) {
            const isOutline = d > 0.84;
            const isSun = !isOutline && y < 7 && x < 10 && ((x + y) % 3 !== 0);
            const isShadow = !isOutline && y > 10;
            const colRgb = isOutline ? [15, 23, 42] : isSun ? leafLit : isShadow ? leafShade : leafBase;
            atlas.data[di] = colRgb[0];
            atlas.data[di + 1] = colRgb[1];
            atlas.data[di + 2] = colRgb[2];
            atlas.data[di + 3] = 255;
          } else {
            atlas.data[di + 3] = 0;
          }
        }
      }
    }
  }

  // Row 12..15: Y-sorted props (trunks, lamps, crates, chests, flags, torches)
  for (let r = 12; r <= 15; r++) {
    for (let c = 0; c < 16; c++) {
      const srcTile = pick(medPool, 48 + c + (r - 12) * 4) ?? pick(ninjaPool, 80 + c);
      if (srcTile) {
        const cell = createImage(TILE, TILE);
        blit(cell, srcTile.img, srcTile.sx, srcTile.sy, TILE, TILE, 0, 0, { alphaBlend: true });
        const graded = applyBiomeGrade(cell, { tintHex: pal.accent, strength: 0.18 });
        stampTile(atlas, c, r, graded, 0, 0, { alphaBlend: true });
      }
    }
  }

  addOrganicGroundDetails(atlas, biome);
  return encodeImageToPng(atlas);
}
