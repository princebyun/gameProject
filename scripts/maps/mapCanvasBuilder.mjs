export const STANDARD_TILE_LEGEND = {
  '.': -1,
  g: 14,
  G: 15,
  W: 16,
  '~': 20,
  s: 3,
  p: 44,
  q: 45,
  d: 46,
  b: 65,
  B: 66,
  w: 68,
  D: 69,
  c: 32,
  C: 47,
  L: 28,
  f: 56,
  F: 57,
  t: 58,
  T: 59,
  h: 60,
  j: 63,
  k: 194,
  l: 196,
  m: 48,
  R: 128,
  r: 130,
  e: 132,
  O: 136,
  o: 138,
  A: 134,
  H: 140
};

export const STANDARD_SURFACE_LEGEND = {
  '.': 'stone',
  g: 'grass',
  p: 'stone',
  d: 'wood_dock',
  s: 'sand',
  w: 'water_shallow',
  m: 'metal_cyber',
  n: 'snow'
};

export function hash2d(x, y, seed = 17) {
  let h = (x * 374761393 + y * 668265263 + seed * 1442695041) | 0;
  h = ((h ^ (h >>> 13)) * 1274126177) | 0;
  return (h ^ (h >>> 16)) >>> 0;
}

export function tileCenter(tx, ty) {
  return { x: tx * 32 + 16, y: ty * 32 + 16 };
}

export function tileRect(tx, ty, wTiles, hTiles, label) {
  return {
    x: tx * 32,
    y: ty * 32,
    width: wTiles * 32,
    height: hTiles * 32,
    ...(label ? { label } : {})
  };
}

export class GridCanvas {
  constructor(cols, rows, defaultGround = 'G', defaultSurface = 'g') {
    this.cols = cols;
    this.rows = rows;
    this.ground = Array.from({ length: rows }, () => Array(cols).fill(defaultGround));
    this.detail = Array.from({ length: rows }, () => Array(cols).fill('.'));
    this.solid = Array.from({ length: rows }, () => Array(cols).fill('.'));
    this.overhead = Array.from({ length: rows }, () => Array(cols).fill('.'));
    this.surface = Array.from({ length: rows }, () => Array(cols).fill(defaultSurface));
    this.roadMask = Array.from({ length: rows }, () => Array(cols).fill(false));
    this.obstacles = [];
  }

  inBounds(x, y) {
    return x >= 0 && x < this.cols && y >= 0 && y < this.rows;
  }

  set(layer, x, y, ch) {
    if (!this.inBounds(x, y)) return this;
    this[layer][y][x] = ch;
    return this;
  }

  fillRect(layer, x, y, w, h, ch) {
    for (let ry = y; ry < y + h; ry++) {
      for (let rx = x; rx < x + w; rx++) {
        if (this.inBounds(rx, ry)) this[layer][ry][rx] = ch;
      }
    }
    return this;
  }

  borderSolid(ch = 'c') {
    for (let x = 0; x < this.cols; x++) {
      this.solid[0][x] = '#';
      this.solid[this.rows - 1][x] = '#';
      this.ground[0][x] = ch;
      this.ground[this.rows - 1][x] = ch;
    }
    for (let y = 0; y < this.rows; y++) {
      this.solid[y][0] = '#';
      this.solid[y][this.cols - 1] = '#';
      this.ground[y][0] = ch;
      this.ground[y][this.cols - 1] = ch;
    }
    return this;
  }

  paintGround(x, y, w, h, groundCh, surfCh) {
    this.fillRect('ground', x, y, w, h, groundCh);
    if (surfCh) this.fillRect('surface', x, y, w, h, surfCh);
    return this;
  }

  paintRoad(x, y, w, h, groundCh = 'p', surfCh = 'p') {
    for (let ry = y; ry < y + h; ry++) {
      for (let rx = x; rx < x + w; rx++) {
        if (!this.inBounds(rx, ry)) continue;
        this.ground[ry][rx] = groundCh;
        this.detail[ry][rx] = groundCh;
        this.surface[ry][rx] = surfCh;
        this.solid[ry][rx] = '.';
        this.roadMask[ry][rx] = true;
      }
    }
    return this;
  }

  paintWaterRect(x, y, w, h, foamBorder = true) {
    for (let ry = y; ry < y + h; ry++) {
      for (let rx = x; rx < x + w; rx++) {
        if (!this.inBounds(rx, ry)) continue;
        const isEdge =
          foamBorder && (rx === x || rx === x + w - 1 || ry === y || ry === y + h - 1);
        this.ground[ry][rx] = isEdge ? '~' : 'W';
        this.detail[ry][rx] = '.';
        this.solid[ry][rx] = '#';
        this.surface[ry][rx] = 'w';
      }
    }
    return this;
  }

  paintShallowStepping(x, y, w, h, stoneChar = 'q') {
    for (let ry = y; ry < y + h; ry++) {
      for (let rx = x; rx < x + w; rx++) {
        if (!this.inBounds(rx, ry)) continue;
        this.ground[ry][rx] = '~';
        this.detail[ry][rx] = stoneChar;
        this.solid[ry][rx] = '.';
        this.surface[ry][rx] = 'w';
        this.roadMask[ry][rx] = true;
      }
    }
    return this;
  }

  stampBuilding(x, y, w, h, opts = {}) {
    const label = opts.label;
    const roofRows = opts.roofRows ?? 2;
    const roofChar = opts.roofChar ?? 'R';
    const trimChar = opts.trimChar ?? 'r';
    const eaveChar = opts.eaveChar ?? 'e';
    const walkBehind = opts.walkBehind !== false;

    for (let ry = y; ry < y + h; ry++) {
      for (let rx = x; rx < x + w; rx++) {
        if (!this.inBounds(rx, ry)) continue;
        const isDoor = ry === y + h - 1 && rx === x + Math.floor(w / 2);
        const isWindow = ry === y + h - 1 && !isDoor && (rx - x) % 2 === 1;
        this.ground[ry][rx] = isDoor ? 'D' : isWindow ? 'w' : ry === y ? 'B' : 'b';
        this.detail[ry][rx] = '.';
        this.solid[ry][rx] = '#';
      }
    }

    const roofStartY = y - roofRows;
    for (let ry = roofStartY; ry < y; ry++) {
      for (let rx = x - 1; rx <= x + w; rx++) {
        if (!this.inBounds(rx, ry)) continue;
        const isTop = ry === roofStartY;
        const isEdge = rx === x - 1 || rx === x + w;
        this.overhead[ry][rx] = isEdge ? eaveChar : isTop ? trimChar : roofChar;
        if (walkBehind && this.solid[ry][rx] === '#') {
          this.solid[ry][rx] = '.';
        }
      }
    }
    for (let rx = x; rx < x + w; rx++) {
      if (this.inBounds(rx, y)) {
        this.overhead[y][rx] = roofChar;
      }
    }

    if (label) {
      this.obstacles.push(tileRect(x, y, w, h, label));
    }
    return this;
  }

  stampTreeCanopy(cx, cy, opts = {}) {
    const leafCenter = opts.centerChar ?? 'O';
    const leafEdge = opts.edgeChar ?? 'o';
    if (this.inBounds(cx, cy)) {
      this.solid[cy][cx] = '#';
      this.detail[cy][cx] = 'c';
    }
    for (let dy = -2; dy <= 0; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const tx = cx + dx;
        const ty = cy + dy;
        if (!this.inBounds(tx, ty)) continue;
        const isCenter = dx === 0 && dy === -1;
        this.overhead[ty][tx] = isCenter ? leafCenter : leafEdge;
      }
    }
    return this;
  }

  stampArchOverhead(x, y, w, h, overheadChar = 'A', pillarChar = 'C') {
    for (let ry = y; ry < y + h; ry++) {
      for (let rx = x; rx < x + w; rx++) {
        if (!this.inBounds(rx, ry)) continue;
        if (ry === y) {
          this.overhead[ry][rx] = overheadChar;
        }
        if (rx === x || rx === x + w - 1) {
          this.solid[ry][rx] = '#';
          this.detail[ry][rx] = pillarChar;
        }
      }
    }
    return this;
  }

  stampRockOrWall(x, y, w, h, tileChar = 'c') {
    for (let ry = y; ry < y + h; ry++) {
      for (let rx = x; rx < x + w; rx++) {
        if (!this.inBounds(rx, ry)) continue;
        this.ground[ry][rx] = tileChar;
        this.solid[ry][rx] = '#';
      }
    }
    return this;
  }

  stampProps(coords, char = 'k', solid = true) {
    for (const [x, y] of coords) {
      if (!this.inBounds(x, y)) continue;
      this.detail[y][x] = char;
      if (solid) this.solid[y][x] = '#';
    }
    return this;
  }

  scatterDecor(x, y, w, h, chars = ['f', 'F', 't', 'T'], mod = 7, seed = 42) {
    for (let ry = y; ry < y + h; ry++) {
      for (let rx = x; rx < x + w; rx++) {
        if (!this.inBounds(rx, ry)) continue;
        if (this.solid[ry][rx] !== '.' || this.roadMask[ry][rx]) continue;
        if (this.detail[ry][rx] !== '.') continue;
        const hv = hash2d(rx, ry, seed);
        if (hv % mod === 0) {
          this.detail[ry][rx] = chars[hv % chars.length];
        }
      }
    }
    return this;
  }

  paintCoastalFoamAuto() {
    for (let y = 1; y < this.rows - 1; y++) {
      for (let x = 1; x < this.cols - 1; x++) {
        if (this.ground[y][x] !== 'W') continue;
        const adjWalkable =
          this.solid[y - 1][x] === '.' ||
          this.solid[y + 1][x] === '.' ||
          this.solid[y][x - 1] === '.' ||
          this.solid[y][x + 1] === '.';
        if (adjWalkable) {
          this.ground[y][x] = '~';
        }
      }
    }
    return this;
  }

  stampContactShadows() {
    for (let y = 1; y < this.rows; y++) {
      for (let x = 0; x < this.cols; x++) {
        if (
          this.solid[y][x] === '.' &&
          this.solid[y - 1][x] === '#' &&
          this.detail[y][x] === '.' &&
          !this.roadMask[y][x]
        ) {
          this.detail[y][x] = 'h';
        }
      }
    }
    return this;
  }

  toTileMap() {
    this.stampContactShadows();
    return {
      tileSize: 32,
      cols: this.cols,
      rows: this.rows,
      tileLegend: { ...STANDARD_TILE_LEGEND },
      surfaceLegend: { ...STANDARD_SURFACE_LEGEND },
      groundRows: this.ground.map((r) => r.join('')),
      detailRows: this.detail.map((r) => r.join('')),
      solidRows: this.solid.map((r) => r.join('')),
      overheadRows: this.overhead.map((r) => r.join('')),
      surfaceRows: this.surface.map((r) => r.join(''))
    };
  }
}

export function assertSelfReachable(island) {
  const tm = island.tileMap;
  const ts = tm.tileSize;
  const cols = tm.cols;
  const rows = tm.rows;
  const pointInRect = (px, py, r) =>
    px >= r.x && px <= r.x + r.width && py >= r.y && py <= r.y + r.height;

  const isBlocked = (tx, ty) => {
    if (tx < 0 || tx >= cols || ty < 0 || ty >= rows) return true;
    if (tm.solidRows[ty]?.[tx] !== '.') return true;
    const wx = tx * ts + 16;
    const wy = ty * ts + 16;
    for (const obs of island.obstacles ?? []) {
      if (pointInRect(wx, wy, obs)) return true;
    }
    return false;
  };

  const spTx = Math.floor(island.spawnPoint.x / ts);
  const spTy = Math.floor(island.spawnPoint.y / ts);
  if (isBlocked(spTx, spTy)) {
    throw new Error(`[${island.islandId}] Spawn (${spTx},${spTy}) is blocked`);
  }

  const visited = new Uint8Array(cols * rows);
  const queue = [[spTx, spTy]];
  let head = 0;
  visited[spTy * cols + spTx] = 1;
  while (head < queue.length) {
    const [cx, cy] = queue[head++];
    for (const [dx, dy] of [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1]
    ]) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || nx >= cols || ny < 0 || ny >= rows) continue;
      const idx = ny * cols + nx;
      if (visited[idx] || isBlocked(nx, ny)) continue;
      visited[idx] = 1;
      queue.push([nx, ny]);
    }
  }

  const canReachAdj = (tx, ty) =>
    [
      [0, 0],
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1]
    ].some(([dx, dy]) => {
      const rx = tx + dx;
      const ry = ty + dy;
      return rx >= 0 && rx < cols && ry >= 0 && ry < rows && visited[ry * cols + rx] === 1;
    });

  const checkPt = (label, pt) => {
    const tx = Math.floor(pt.x / ts);
    const ty = Math.floor(pt.y / ts);
    if (!canReachAdj(tx, ty)) {
      throw new Error(`[${island.islandId}] ${label} at (${tx},${ty}) unreachable`);
    }
  };

  checkPt('portExit', island.portExitZone.pos);
  if (island.battleTerminalPos) checkPt('battleTerminal', island.battleTerminalPos);
  for (const m of island.markers ?? []) {
    if (!canReachAdj(m.tileX, m.tileY)) {
      throw new Error(`[${island.islandId}] Marker ${m.markerId} (${m.tileX},${m.tileY}) unreachable`);
    }
  }
  for (const ch of island.chests ?? []) {
    if (!canReachAdj(ch.tileX, ch.tileY)) {
      throw new Error(`[${island.islandId}] Chest ${ch.chestId} (${ch.tileX},${ch.tileY}) unreachable`);
    }
  }
  for (const npc of island.npcs ?? []) {
    checkPt(`NPC:${npc.npcId}`, npc.pos);
    const wps = npc.patrolWaypoints ?? [];
    for (let i = 0; i < wps.length; i++) {
      const a = wps[i];
      const b = wps[(i + 1) % wps.length];
      for (const t of [0, 0.25, 0.5, 0.75]) {
        const sx = Math.floor((a.x + (b.x - a.x) * t) / ts);
        const sy = Math.floor((a.y + (b.y - a.y) * t) / ts);
        if (isBlocked(sx, sy)) {
          throw new Error(
            `[${island.islandId}] NPC:${npc.npcId} patrol segment ${i} blocked at (${sx},${sy})`
          );
        }
      }
    }
  }
  for (const enc of island.encounters ?? []) {
    checkPt(`Encounter:${enc.encounterId}`, enc.pos);
  }
}
