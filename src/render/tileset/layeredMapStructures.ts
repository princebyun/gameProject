import type { TilesetManifestEntry } from '../../data/assets/types';

export interface IslandObstacleRect {
  x: number;
  y: number;
  width: number;
  height: number;
  label?: string;
}

export function hashCoord(c: number, r: number): number {
  return ((c * 73856093) ^ (r * 19349663) ^ 0x9e3779b9) >>> 0;
}

export function isBuildingObstacle(obs: IslandObstacleRect): boolean {
  if (obs.width >= 56 && obs.height >= 40) return true;
  const lbl = obs.label ?? '';
  return /주점|집|연구소|도장|여관|조선소|성|가게|시장|본거지|건물|병원|본부/.test(lbl);
}

/** Draw Layer 1 shadow, Layer 2 tiled facade wall, and Layer 4 overhanging roof. */
export function drawLayeredBuilding(
  bctx: CanvasRenderingContext2D,
  octx: CanvasRenderingContext2D,
  atlas: HTMLImageElement | HTMLCanvasElement,
  srcTs: number,
  ox: number,
  oy: number,
  ow: number,
  oh: number,
  biome: TilesetManifestEntry
): void {
  const atlasH = 'naturalHeight' in atlas && atlas.naturalHeight > 0 ? atlas.naturalHeight : atlas.height;
  const hasLayeredRows = atlasH >= 160;
  const wallTopY = oy + Math.round(oh * 0.42);
  const wallH = Math.max(18, oh - Math.round(oh * 0.42));

  bctx.fillStyle = 'rgba(7, 11, 20, 0.45)';
  bctx.fillRect(ox + 2, oy + oh - 1, ow, 5);

  // Solid opaque wall under-fill prevents transparent fallback artifacts on Frame 1
  bctx.fillStyle = biome.palette.wall;
  bctx.fillRect(ox, wallTopY, ow, wallH);

  if (hasLayeredRows) {
    const cols = Math.max(1, Math.ceil(ow / 24));
    const cellW = ow / cols;
    for (let c = 0; c < cols; c++) {
      const wx = Math.round(ox + c * cellW);
      const ww = Math.ceil(cellW);
      const isDoor = c === Math.floor(cols * 0.5) && ow >= 48;
      const tileCol = isDoor ? 5 : c % 2 === 1 ? 4 : c % 4;
      bctx.drawImage(atlas, tileCol * srcTs, srcTs * 4, srcTs, srcTs, wx, wallTopY, ww, wallH);
    }
  }
  bctx.strokeStyle = 'rgba(15, 23, 42, 0.72)';
  bctx.lineWidth = 1.5;
  bctx.strokeRect(ox, wallTopY, ow, wallH);

  const roofY = oy - 10;
  const roofH = Math.max(20, wallTopY - roofY + 5);
  // Solid opaque roof backing prevents wireframe transparency
  octx.fillStyle = biome.palette.edge;
  octx.fillRect(ox - 4, roofY, ow + 8, roofH);

  if (hasLayeredRows) {
    const rCols = Math.max(1, Math.ceil(ow / 24));
    const rW = (ow + 8) / rCols;
    for (let c = 0; c < rCols; c++) {
      const rx = Math.round(ox - 4 + c * rW);
      octx.drawImage(atlas, (c % 6) * srcTs, srcTs * 8, srcTs, srcTs, rx, roofY, Math.ceil(rW), roofH);
    }
  }
  octx.fillStyle = biome.palette.edge;
  octx.globalAlpha = 0.25;
  octx.fillRect(ox - 4, roofY, ow + 8, 4);
  octx.globalAlpha = 1;
  octx.strokeStyle = '#0f172a';
  octx.lineWidth = 2;
  octx.strokeRect(ox - 4, roofY, ow + 8, roofH);
  octx.fillStyle = 'rgba(15, 23, 42, 0.45)';
  octx.fillRect(ox - 3, roofY + roofH, ow + 6, 3);
}

/** Draw tree/rock trunk on base layer and overlapping canopy on overhead layer. */
export function drawLayeredNatureProp(
  bctx: CanvasRenderingContext2D,
  octx: CanvasRenderingContext2D,
  atlas: HTMLImageElement | HTMLCanvasElement,
  srcTs: number,
  ox: number,
  oy: number,
  ow: number,
  oh: number,
  biome: TilesetManifestEntry
): void {
  const atlasH = 'naturalHeight' in atlas && atlas.naturalHeight > 0 ? atlas.naturalHeight : atlas.height;
  const hasLayeredRows = atlasH >= 160;
  bctx.fillStyle = 'rgba(7, 11, 20, 0.4)';
  bctx.fillRect(ox + 2, oy + oh - 2, ow - 2, 5);
  if (hasLayeredRows) {
    bctx.drawImage(atlas, 0, srcTs * 2, srcTs, srcTs, ox, oy + Math.round(oh * 0.45), ow, Math.round(oh * 0.55));
    octx.drawImage(atlas, 8 * srcTs, srcTs * 9, srcTs, srcTs, ox - 4, oy - 6, ow + 8, Math.round(oh * 0.72));
  } else {
    bctx.fillStyle = biome.palette.wall;
    bctx.fillRect(ox + Math.round(ow * 0.35), oy + Math.round(oh * 0.55), Math.round(ow * 0.3), Math.round(oh * 0.45));
    octx.fillStyle = biome.palette.detail;
    octx.fillRect(ox - 2, oy - 4, ow + 4, Math.round(oh * 0.65));
  }
}
