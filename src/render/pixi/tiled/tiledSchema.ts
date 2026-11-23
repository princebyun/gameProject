export type TiledLayerRole =
  | 'water'
  | 'ground'
  | 'ground_detail'
  | 'walls_props'
  | 'ysort'
  | 'overhead'
  | 'collision'
  | 'lights'
  | 'markers'
  | 'spawns'
  | 'npcs'
  | 'chests'
  | 'zones'
  | 'other';

export interface TiledPropertyJson {
  name: string;
  type?: string;
  value: unknown;
}

export interface TiledPointJson {
  x: number;
  y: number;
}

export interface TiledObjectJson {
  id: number;
  name?: string;
  type?: string;
  class?: string;
  x: number;
  y: number;
  width?: number;
  height?: number;
  rotation?: number;
  visible?: boolean;
  point?: boolean;
  polygon?: TiledPointJson[];
  properties?: TiledPropertyJson[];
}

export interface TiledLayerJson {
  id?: number;
  name: string;
  type: 'tilelayer' | 'objectgroup' | 'group' | 'imagelayer';
  visible?: boolean;
  opacity?: number;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  data?: number[];
  objects?: TiledObjectJson[];
  layers?: TiledLayerJson[];
  properties?: TiledPropertyJson[];
}

export interface TiledTileAnimationFrameJson {
  tileid: number;
  duration: number;
}

export interface TiledTileMetadataJson {
  id: number;
  animation?: TiledTileAnimationFrameJson[];
  properties?: TiledPropertyJson[];
}

export interface TiledTilesetJson {
  firstgid: number;
  name: string;
  tilewidth: number;
  tileheight: number;
  tilecount: number;
  columns: number;
  spacing?: number;
  margin?: number;
  image: string;
  imagewidth: number;
  imageheight: number;
  tiles?: TiledTileMetadataJson[];
}

export interface TiledMapJson {
  version?: string | number;
  tiledversion?: string;
  orientation?: string;
  renderorder?: string;
  width: number;
  height: number;
  tilewidth: number;
  tileheight: number;
  infinite?: boolean;
  layers: TiledLayerJson[];
  tilesets: TiledTilesetJson[];
  properties?: TiledPropertyJson[];
}

export interface DecodedTiledGid {
  gid: number;
  flipH: boolean;
  flipV: boolean;
  flipD: boolean;
}

export interface ParsedTiledAnimation {
  baseGid: number;
  frames: { gid: number; durationMs: number }[];
  totalDurationMs: number;
}

export interface ParsedTiledTileLayer {
  name: string;
  role: TiledLayerRole;
  cols: number;
  rows: number;
  opacity: number;
  data: Uint32Array;
}

export interface ParsedTiledCollisionObject {
  id: number;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  polygon?: TiledPointJson[];
}

export interface ParsedTiledLightObject {
  id: number;
  name: string;
  x: number;
  y: number;
  colorHex: string;
  colorInt: number;
  radiusPx: number;
  intensity: number;
  flickerSpeed: number;
  flickerAmp: number;
}

export interface ParsedTiledGenericObject {
  id: number;
  name: string;
  kind: string;
  x: number;
  y: number;
  width: number;
  height: number;
  properties: Record<string, string | number | boolean>;
}

export interface ParsedTiledMapData {
  cols: number;
  rows: number;
  tileWidth: number;
  tileHeight: number;
  pixelScale: number;
  scaledTileWidth: number;
  scaledTileHeight: number;
  worldWidth: number;
  worldHeight: number;
  tilesets: TiledTilesetJson[];
  animatedTiles: Map<number, ParsedTiledAnimation>;
  waterLayers: ParsedTiledTileLayer[];
  groundLayers: ParsedTiledTileLayer[];
  groundDetailLayers: ParsedTiledTileLayer[];
  wallsPropsLayers: ParsedTiledTileLayer[];
  overheadLayers: ParsedTiledTileLayer[];
  collisions: ParsedTiledCollisionObject[];
  lights: ParsedTiledLightObject[];
  spawns: ParsedTiledGenericObject[];
  markers: ParsedTiledGenericObject[];
  npcs: ParsedTiledGenericObject[];
  chests: ParsedTiledGenericObject[];
  zones: ParsedTiledGenericObject[];
}

const FLIPPED_HORIZONTALLY_FLAG = 0x80000000;
const FLIPPED_VERTICALLY_FLAG = 0x40000000;
const FLIPPED_DIAGONALLY_FLAG = 0x20000000;
const GID_MASK = 0x1fffffff;

export function decodeTiledGid(rawGid: number): DecodedTiledGid {
  const unsigned = rawGid >>> 0;
  return {
    gid: unsigned & GID_MASK,
    flipH: (unsigned & FLIPPED_HORIZONTALLY_FLAG) !== 0,
    flipV: (unsigned & FLIPPED_VERTICALLY_FLAG) !== 0,
    flipD: (unsigned & FLIPPED_DIAGONALLY_FLAG) !== 0
  };
}

export function getTiledProperty(
  props: readonly TiledPropertyJson[] | undefined,
  propName: string
): unknown {
  if (!props) return undefined;
  const target = propName.toLowerCase();
  for (const p of props) {
    if (p.name.toLowerCase() === target) return p.value;
  }
  return undefined;
}

export function propertiesToRecord(
  props: readonly TiledPropertyJson[] | undefined
): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  if (!props) return out;
  for (const p of props) {
    if (
      typeof p.value === 'string' ||
      typeof p.value === 'number' ||
      typeof p.value === 'boolean'
    ) {
      out[p.name] = p.value;
    }
  }
  return out;
}

export function normalizeHexToInt(hex: string, fallback = 0xfde047): number {
  const clean = hex.trim().replace(/^#/, '');
  if (clean.length === 8) {
    // Tiled `#AARRGGBB` color format
    const parsed = Number.parseInt(clean.slice(2), 16);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  if (clean.length === 6) {
    const parsed = Number.parseInt(clean, 16);
    return Number.isFinite(parsed) ? parsed : fallback;
  }
  return fallback;
}

export function normalizeTiledHexColor(raw: unknown, fallback = '#fde047'): string {
  if (typeof raw !== 'string') return fallback;
  const clean = raw.trim().replace(/^#/, '');
  if (clean.length === 8) return `#${clean.slice(2)}`;
  if (clean.length === 6) return `#${clean}`;
  return fallback;
}

export function resolveTiledLayerRole(layer: TiledLayerJson): TiledLayerRole {
  const customRole = getTiledProperty(layer.properties, 'layerRole');
  const candidate = (
    typeof customRole === 'string' && customRole.trim().length > 0
      ? customRole
      : layer.name
  )
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '_');

  if (candidate === 'water' || candidate.includes('water')) return 'water';
  if (candidate === 'ground_detail' || candidate === 'detail' || candidate.includes('detail')) {
    return 'ground_detail';
  }
  if (candidate === 'ground' || candidate.includes('terrain')) return 'ground';
  if (
    candidate === 'walls_props' ||
    candidate === 'walls' ||
    candidate === 'props' ||
    candidate.includes('wall')
  ) {
    return 'walls_props';
  }
  if (candidate === 'ysort' || candidate === 'entities') return 'ysort';
  if (candidate === 'overhead' || candidate === 'roof' || candidate.includes('overhead')) {
    return 'overhead';
  }
  if (candidate === 'collision' || candidate === 'collisions' || candidate.includes('solid')) {
    return 'collision';
  }
  if (candidate === 'lights' || candidate === 'lighting' || candidate.includes('light')) {
    return 'lights';
  }
  if (candidate === 'markers' || candidate.includes('marker')) return 'markers';
  if (candidate === 'spawns' || candidate.includes('spawn')) return 'spawns';
  if (candidate === 'npcs' || candidate.includes('npc')) return 'npcs';
  if (candidate === 'chests' || candidate.includes('chest')) return 'chests';
  if (candidate === 'zones' || candidate.includes('zone')) return 'zones';
  return 'other';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function parseTiledMapData(
  raw: unknown,
  defaultPixelScale = 2
): ParsedTiledMapData {
  if (!isRecord(raw) || !Array.isArray(raw.layers) || !Array.isArray(raw.tilesets)) {
    throw new Error('Invalid Tiled .tmj map: missing layers or tilesets');
  }
  const map = raw as unknown as TiledMapJson;
  const cols = Math.max(1, Math.round(map.width));
  const rows = Math.max(1, Math.round(map.height));
  const tileWidth = Math.max(8, Math.round(map.tilewidth));
  const tileHeight = Math.max(8, Math.round(map.tileheight));
  const propScale = getTiledProperty(map.properties, 'pixelScale');
  const pixelScale =
    typeof propScale === 'number' && propScale > 0 ? propScale : defaultPixelScale;
  const scaledTileWidth = tileWidth * pixelScale;
  const scaledTileHeight = tileHeight * pixelScale;

  const animatedTiles = new Map<number, ParsedTiledAnimation>();
  for (const ts of map.tilesets) {
    if (!ts.tiles) continue;
    for (const tileMeta of ts.tiles) {
      if (!tileMeta.animation || tileMeta.animation.length === 0) continue;
      const baseGid = ts.firstgid + tileMeta.id;
      const frames = tileMeta.animation.map((f) => ({
        gid: ts.firstgid + f.tileid,
        durationMs: Math.max(30, f.duration)
      }));
      const totalDurationMs = frames.reduce((acc, f) => acc + f.durationMs, 0);
      animatedTiles.set(baseGid, {
        baseGid,
        frames,
        totalDurationMs: Math.max(30, totalDurationMs)
      });
    }
  }

  const waterLayers: ParsedTiledTileLayer[] = [];
  const groundLayers: ParsedTiledTileLayer[] = [];
  const groundDetailLayers: ParsedTiledTileLayer[] = [];
  const wallsPropsLayers: ParsedTiledTileLayer[] = [];
  const overheadLayers: ParsedTiledTileLayer[] = [];
  const collisions: ParsedTiledCollisionObject[] = [];
  const lights: ParsedTiledLightObject[] = [];
  const spawns: ParsedTiledGenericObject[] = [];
  const markers: ParsedTiledGenericObject[] = [];
  const npcs: ParsedTiledGenericObject[] = [];
  const chests: ParsedTiledGenericObject[] = [];
  const zones: ParsedTiledGenericObject[] = [];

  const visitLayers = (layers: readonly TiledLayerJson[]) => {
    for (const layer of layers) {
      if (layer.visible === false && layer.type === 'tilelayer') continue;
      if (layer.type === 'group' && Array.isArray(layer.layers)) {
        visitLayers(layer.layers);
        continue;
      }

      const role = resolveTiledLayerRole(layer);
      if (layer.type === 'tilelayer' && Array.isArray(layer.data)) {
        const parsedLayer: ParsedTiledTileLayer = {
          name: layer.name,
          role,
          cols: layer.width ?? cols,
          rows: layer.height ?? rows,
          opacity: typeof layer.opacity === 'number' ? layer.opacity : 1,
          data: Uint32Array.from(layer.data, (v) => v >>> 0)
        };
        if (role === 'water') waterLayers.push(parsedLayer);
        else if (role === 'ground') groundLayers.push(parsedLayer);
        else if (role === 'ground_detail') groundDetailLayers.push(parsedLayer);
        else if (role === 'walls_props') wallsPropsLayers.push(parsedLayer);
        else if (role === 'overhead') overheadLayers.push(parsedLayer);
        else groundDetailLayers.push(parsedLayer);
      } else if (layer.type === 'objectgroup' && Array.isArray(layer.objects)) {
        for (const obj of layer.objects) {
          const objType = (obj.class ?? obj.type ?? '').toLowerCase();
          const props = propertiesToRecord(obj.properties);
          const ox = obj.x * pixelScale;
          const oy = obj.y * pixelScale;
          const ow = (obj.width ?? 0) * pixelScale;
          const oh = (obj.height ?? 0) * pixelScale;

          if (role === 'collision' || objType === 'collision') {
            collisions.push({
              id: obj.id,
              name: obj.name ?? `col_${obj.id}`,
              x: ox,
              y: oy,
              width: ow,
              height: oh,
              ...(obj.polygon
                ? {
                    polygon: obj.polygon.map((pt) => ({
                      x: pt.x * pixelScale,
                      y: pt.y * pixelScale
                    }))
                  }
                : {})
            });
          } else if (role === 'lights' || objType === 'light' || objType === 'point_light') {
            const colorHex = normalizeTiledHexColor(props.color, '#fde047');
            lights.push({
              id: obj.id,
              name: obj.name ?? `light_${obj.id}`,
              x: ox + ow * 0.5,
              y: oy + oh * 0.5,
              colorHex,
              colorInt: normalizeHexToInt(colorHex, 0xfde047),
              radiusPx:
                typeof props.radius === 'number' ? props.radius * pixelScale : 96,
              intensity: typeof props.intensity === 'number' ? props.intensity : 0.9,
              flickerSpeed:
                typeof props.flickerSpeed === 'number' ? props.flickerSpeed : 3.2,
              flickerAmp: typeof props.flickerAmp === 'number' ? props.flickerAmp : 0.08
            });
          } else {
            const generic: ParsedTiledGenericObject = {
              id: obj.id,
              name: obj.name ?? `${role}_${obj.id}`,
              kind: objType || role,
              x: ox,
              y: oy,
              width: ow,
              height: oh,
              properties: props
            };
            if (role === 'spawns' || objType.includes('spawn')) spawns.push(generic);
            else if (role === 'markers' || objType.includes('marker')) markers.push(generic);
            else if (role === 'npcs' || objType.includes('npc')) npcs.push(generic);
            else if (role === 'chests' || objType.includes('chest')) chests.push(generic);
            else if (role === 'zones' || objType.includes('zone')) zones.push(generic);
          }
        }
      }
    }
  };

  visitLayers(map.layers);

  return {
    cols,
    rows,
    tileWidth,
    tileHeight,
    pixelScale,
    scaledTileWidth,
    scaledTileHeight,
    worldWidth: cols * scaledTileWidth,
    worldHeight: rows * scaledTileHeight,
    tilesets: map.tilesets,
    animatedTiles,
    waterLayers,
    groundLayers,
    groundDetailLayers,
    wallsPropsLayers,
    overheadLayers,
    collisions,
    lights,
    spawns,
    markers,
    npcs,
    chests,
    zones
  };
}
