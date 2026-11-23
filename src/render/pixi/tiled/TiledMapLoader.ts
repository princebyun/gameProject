import { Container, Sprite, type Texture } from 'pixi.js';
import type { Disposable } from '../../../core/types/disposable';
import type { ProAssetLoader } from '../ProAssetLoader';
import {
  decodeTiledGid,
  mergeTiledTemplateObject,
  parseTiledMapData,
  parseTiledTsxXml,
  parseTiledTxTemplateXml,
  type NormalizedTiledTileset,
  type ParsedTiledAnimation,
  type ParsedTiledMapData,
  type ParsedTiledTileLayer,
  type TiledLayerJson,
  type TiledMapJson,
  type TiledObjectJson
} from './tiledSchema';

export const TILED_CHUNK_SIZE = 16;

export interface ChunkWorldBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface TileChunkBucket {
  bounds: ChunkWorldBounds;
  container: Container;
  hasSprites: boolean;
}

export interface AnimatedTileInstance {
  sprite: Sprite;
  anim: ParsedTiledAnimation;
  elapsedMs: number;
  frameIndex: number;
}

export interface OverheadCluster {
  bounds: ChunkWorldBounds;
  container: Container;
  currentAlpha: number;
}

export function computeChunkVisibility(
  bounds: ChunkWorldBounds,
  camX: number,
  camY: number,
  viewW: number,
  viewH: number,
  marginPx = 64
): boolean {
  const vMinX = camX - marginPx;
  const vMinY = camY - marginPx;
  const vMaxX = camX + viewW + marginPx;
  const vMaxY = camY + viewH + marginPx;
  return (
    bounds.maxX >= vMinX &&
    bounds.minX <= vMaxX &&
    bounds.maxY >= vMinY &&
    bounds.minY <= vMaxY
  );
}

export function computeOverheadProximityTargetAlpha(
  playerX: number,
  playerY: number,
  bounds: ChunkWorldBounds,
  fadedAlpha = 0.36
): number {
  const inside =
    playerX >= bounds.minX &&
    playerX <= bounds.maxX &&
    playerY >= bounds.minY &&
    playerY <= bounds.maxY + 12;
  return inside ? fadedAlpha : 1.0;
}

function buildTilesetGidMap(
  parsed: ParsedTiledMapData,
  tilesetTextures: ReadonlyMap<string, Texture>,
  loader: ProAssetLoader
): Map<number, Texture> {
  const gidMap = new Map<number, Texture>();
  for (const ts of parsed.tilesets) {
    // Match exact path or basename ending
    let baseTex: Texture | undefined = tilesetTextures.get(ts.image);
    if (!baseTex) {
      const targetName = ts.image.split('/').pop() ?? ts.image;
      for (const [k, tex] of tilesetTextures.entries()) {
        if (k.endsWith(targetName) || k.endsWith(ts.image)) {
          baseTex = tex;
          break;
        }
      }
    }
    if (!baseTex) continue;

    const spacing = ts.spacing ?? 0;
    const margin = ts.margin ?? 0;
    const cols = Math.max(
      1,
      ts.columns ||
        Math.floor((baseTex.width - margin * 2 + spacing) / (ts.tilewidth + spacing))
    );
    const total = Math.max(
      1,
      ts.tilecount ||
        cols * Math.floor((baseTex.height - margin * 2 + spacing) / (ts.tileheight + spacing))
    );

    for (let i = 0; i < total; i++) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const sx = margin + col * (ts.tilewidth + spacing);
      const sy = margin + row * (ts.tileheight + spacing);
      if (sx + ts.tilewidth > baseTex.width || sy + ts.tileheight > baseTex.height) {
        continue;
      }
      const sub = loader.createSubTexture(baseTex, sx, sy, ts.tilewidth, ts.tileheight);
      gidMap.set(ts.firstgid + i, sub);
    }
  }
  return gidMap;
}

function createChunkSprite(
  tex: Texture,
  cx: number,
  cy: number,
  pixelScale: number,
  flipH: boolean,
  flipV: boolean,
  flipD: boolean,
  opacity: number
): Sprite {
  const sprite = new Sprite(tex);
  sprite.anchor.set(0.5, 0.5);
  sprite.position.set(cx, cy);
  sprite.alpha = opacity;

  if (flipD) {
    sprite.rotation = Math.PI * 0.5;
    sprite.scale.x = flipV ? -pixelScale : pixelScale;
    sprite.scale.y = flipH ? pixelScale : -pixelScale;
  } else {
    sprite.scale.x = flipH ? -pixelScale : pixelScale;
    sprite.scale.y = flipV ? -pixelScale : pixelScale;
  }
  return sprite;
}

export class TiledMapRuntime implements Disposable {
  public readonly waterContainer = new Container();
  public readonly groundContainer = new Container();
  public readonly wallsContainer = new Container();
  public readonly ysortContainer = new Container();
  public readonly overheadContainer = new Container();
  public readonly emissiveTileContainer = new Container();

  private readonly chunks: TileChunkBucket[] = [];
  private readonly animatedInstances: AnimatedTileInstance[] = [];
  private readonly overheadClusters: OverheadCluster[] = [];
  private readonly gidTextures: Map<number, Texture>;
  private visibleChunkCount = 0;
  private emissiveSpriteCount = 0;
  private disposed = false;

  constructor(
    public readonly parsed: ParsedTiledMapData,
    tilesetTextures: ReadonlyMap<string, Texture>,
    loader: ProAssetLoader
  ) {
    this.waterContainer.label = 'tiled_water_layer';
    this.groundContainer.label = 'tiled_ground_layer';
    this.wallsContainer.label = 'tiled_walls_layer';
    this.ysortContainer.label = 'tiled_ysort_layer';
    this.ysortContainer.sortableChildren = true;
    this.overheadContainer.label = 'tiled_overhead_layer';
    this.emissiveTileContainer.label = 'tiled_emissive_tiles';

    this.gidTextures = buildTilesetGidMap(parsed, tilesetTextures, loader);

    this.buildStaticLayers(parsed.waterLayers, this.waterContainer, false);
    this.buildStaticLayers(parsed.groundLayers, this.groundContainer, true);
    this.buildStaticLayers(parsed.groundDetailLayers, this.groundContainer, true);
    this.buildStaticLayers(parsed.wallsPropsLayers, this.wallsContainer, true);
    this.buildOverheadLayers(parsed.overheadLayers, this.overheadContainer);
  }

  public get totalChunkCount(): number {
    return this.chunks.length;
  }

  public get lastVisibleChunkCount(): number {
    return this.visibleChunkCount;
  }

  public get animatedTileSpriteCount(): number {
    return this.animatedInstances.length;
  }

  public get emissiveTileSpriteCount(): number {
    return this.emissiveSpriteCount;
  }

  private maybeAttachEmissiveTile(
    gid: number,
    tex: Texture,
    cx: number,
    cy: number,
    pixelScale: number,
    flipH: boolean,
    flipV: boolean,
    flipD: boolean,
    opacity: number,
    anim: ParsedTiledAnimation | undefined,
    emissiveBucket: Container
  ): boolean {
    const meta = this.parsed.tileMetadataByGid.get(gid);
    if (!meta?.emissive) return false;
    const emSp = createChunkSprite(
      tex,
      cx,
      cy,
      pixelScale,
      flipH,
      flipV,
      flipD,
      opacity * 0.72
    );
    emSp.blendMode = 'add';
    emissiveBucket.addChild(emSp);
    this.emissiveSpriteCount += 1;
    if (anim) {
      this.animatedInstances.push({
        sprite: emSp,
        anim,
        elapsedMs: 0,
        frameIndex: 0
      });
    }
    return true;
  }

  private buildStaticLayers(
    layers: readonly ParsedTiledTileLayer[],
    parent: Container,
    emitEmissive: boolean
  ): void {
    const { cols, rows, scaledTileWidth: tw, scaledTileHeight: th, pixelScale } =
      this.parsed;
    const chunkCols = Math.ceil(cols / TILED_CHUNK_SIZE);
    const chunkRows = Math.ceil(rows / TILED_CHUNK_SIZE);

    for (const layer of layers) {
      for (let cy = 0; cy < chunkRows; cy++) {
        for (let cx = 0; cx < chunkCols; cx++) {
          const startC = cx * TILED_CHUNK_SIZE;
          const startR = cy * TILED_CHUNK_SIZE;
          const endC = Math.min(layer.cols, startC + TILED_CHUNK_SIZE);
          const endR = Math.min(layer.rows, startR + TILED_CHUNK_SIZE);

          const chunkContainer = new Container();
          chunkContainer.label = `${layer.name}_c${cx}_${cy}`;
          const emissiveBucket = new Container();
          emissiveBucket.label = `${layer.name}_em_c${cx}_${cy}`;
          let hasSprites = false;
          let hasEmissive = false;

          for (let r = startR; r < endR; r++) {
            for (let c = startC; c < endC; c++) {
              const raw = layer.data[r * layer.cols + c] ?? 0;
              if (raw === 0) continue;
              const decoded = decodeTiledGid(raw);
              if (decoded.gid === 0) continue;
              const tex = this.gidTextures.get(decoded.gid);
              if (!tex) continue;

              const worldX = (c + 0.5) * tw;
              const worldY = (r + 0.5) * th;
              const sp = createChunkSprite(
                tex,
                worldX,
                worldY,
                pixelScale,
                decoded.flipH,
                decoded.flipV,
                decoded.flipD,
                layer.opacity
              );
              chunkContainer.addChild(sp);
              hasSprites = true;

              const anim = this.parsed.animatedTiles.get(decoded.gid);
              if (anim) {
                this.animatedInstances.push({
                  sprite: sp,
                  anim,
                  elapsedMs: 0,
                  frameIndex: 0
                });
              }

              if (
                emitEmissive &&
                this.maybeAttachEmissiveTile(
                  decoded.gid,
                  tex,
                  worldX,
                  worldY,
                  pixelScale,
                  decoded.flipH,
                  decoded.flipV,
                  decoded.flipD,
                  layer.opacity,
                  anim,
                  emissiveBucket
                )
              ) {
                hasEmissive = true;
              }
            }
          }

          const bounds: ChunkWorldBounds = {
            minX: startC * tw,
            minY: startR * th,
            maxX: endC * tw,
            maxY: endR * th
          };
          if (hasSprites) {
            parent.addChild(chunkContainer);
            this.chunks.push({
              bounds,
              container: chunkContainer,
              hasSprites: true
            });
          } else {
            chunkContainer.destroy({ children: true, texture: false });
          }

          if (hasEmissive) {
            this.emissiveTileContainer.addChild(emissiveBucket);
            this.chunks.push({
              bounds,
              container: emissiveBucket,
              hasSprites: true
            });
          } else {
            emissiveBucket.destroy({ children: true, texture: false });
          }
        }
      }
    }
  }

  private buildOverheadLayers(
    layers: readonly ParsedTiledTileLayer[],
    parent: Container
  ): void {
    const clusterTilesW = 6;
    const clusterTilesH = 6;
    const { cols, rows, scaledTileWidth: tw, scaledTileHeight: th, pixelScale } =
      this.parsed;
    const numCols = Math.ceil(cols / clusterTilesW);
    const numRows = Math.ceil(rows / clusterTilesH);

    for (const layer of layers) {
      for (let cy = 0; cy < numRows; cy++) {
        for (let cx = 0; cx < numCols; cx++) {
          const startC = cx * clusterTilesW;
          const startR = cy * clusterTilesH;
          const endC = Math.min(layer.cols, startC + clusterTilesW);
          const endR = Math.min(layer.rows, startR + clusterTilesH);

          const clusterContainer = new Container();
          let minC = endC;
          let minR = endR;
          let maxC = startC;
          let maxR = startR;
          let count = 0;

          for (let r = startR; r < endR; r++) {
            for (let c = startC; c < endC; c++) {
              const raw = layer.data[r * layer.cols + c] ?? 0;
              if (raw === 0) continue;
              const decoded = decodeTiledGid(raw);
              if (decoded.gid === 0) continue;
              const tex = this.gidTextures.get(decoded.gid);
              if (!tex) continue;

              const sp = createChunkSprite(
                tex,
                (c + 0.5) * tw,
                (r + 0.5) * th,
                pixelScale,
                decoded.flipH,
                decoded.flipV,
                decoded.flipD,
                layer.opacity
              );
              clusterContainer.addChild(sp);
              count += 1;
              if (c < minC) minC = c;
              if (r < minR) minR = r;
              if (c + 1 > maxC) maxC = c + 1;
              if (r + 1 > maxR) maxR = r + 1;

              const anim = this.parsed.animatedTiles.get(decoded.gid);
              if (anim) {
                this.animatedInstances.push({
                  sprite: sp,
                  anim,
                  elapsedMs: 0,
                  frameIndex: 0
                });
              }
            }
          }

          if (count > 0) {
            const bounds: ChunkWorldBounds = {
              minX: minC * tw,
              minY: minR * th,
              maxX: maxC * tw,
              maxY: maxR * th
            };
            parent.addChild(clusterContainer);
            this.overheadClusters.push({
              bounds,
              container: clusterContainer,
              currentAlpha: 1
            });
            this.chunks.push({
              bounds,
              container: clusterContainer,
              hasSprites: true
            });
          } else {
            clusterContainer.destroy({ children: true, texture: false });
          }
        }
      }
    }
  }

  public updateViewportCulling(
    camX: number,
    camY: number,
    viewW: number,
    viewH: number
  ): number {
    let visible = 0;
    for (let i = 0; i < this.chunks.length; i++) {
      const ch = this.chunks[i];
      if (!ch) continue;
      const isVis = computeChunkVisibility(ch.bounds, camX, camY, viewW, viewH, 64);
      ch.container.visible = isVis;
      if (isVis) visible += 1;
    }
    this.visibleChunkCount = visible;
    return visible;
  }

  public stepAnimations(dtMs: number): void {
    const safeDt = Math.max(0, dtMs);
    for (let i = 0; i < this.animatedInstances.length; i++) {
      const inst = this.animatedInstances[i];
      if (!inst || inst.anim.frames.length <= 1) continue;
      inst.elapsedMs = (inst.elapsedMs + safeDt) % inst.anim.totalDurationMs;

      let accum = 0;
      let targetIdx = 0;
      for (let f = 0; f < inst.anim.frames.length; f++) {
        const frame = inst.anim.frames[f];
        if (!frame) continue;
        accum += frame.durationMs;
        if (inst.elapsedMs < accum) {
          targetIdx = f;
          break;
        }
      }
      if (targetIdx !== inst.frameIndex) {
        inst.frameIndex = targetIdx;
        const targetFrame = inst.anim.frames[targetIdx];
        const tex = targetFrame ? this.gidTextures.get(targetFrame.gid) : undefined;
        if (tex) {
          inst.sprite.texture = tex;
        }
      }
    }
  }

  public updateOverheadFade(playerX: number, playerY: number, dtSec: number): void {
    const blend = Math.min(1, Math.max(0.08, dtSec * 10));
    for (let i = 0; i < this.overheadClusters.length; i++) {
      const cluster = this.overheadClusters[i];
      if (!cluster) continue;
      const target = computeOverheadProximityTargetAlpha(playerX, playerY, cluster.bounds);
      cluster.currentAlpha += (target - cluster.currentAlpha) * blend;
      cluster.container.alpha = cluster.currentAlpha;
    }
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.animatedInstances.length = 0;
    this.overheadClusters.length = 0;
    this.chunks.length = 0;
    this.gidTextures.clear();
    this.waterContainer.destroy({ children: true, texture: false });
    this.groundContainer.destroy({ children: true, texture: false });
    this.wallsContainer.destroy({ children: true, texture: false });
    this.ysortContainer.destroy({ children: true, texture: false });
    this.overheadContainer.destroy({ children: true, texture: false });
    this.emissiveTileContainer.destroy({ children: true, texture: false });
  }
}

function resolveRelativeMapAsset(mapRelPath: string, sourceRel: string): string {
  const parts = mapRelPath.replace(/\\/g, '/').split('/');
  parts.pop();
  for (const seg of sourceRel.replace(/\\/g, '/').split('/')) {
    if (seg === '..') parts.pop();
    else if (seg && seg !== '.') parts.push(seg);
  }
  return parts.join('/');
}

async function fetchTextBestEffort(relPath: string): Promise<string | null> {
  if (typeof fetch === 'undefined' || typeof window === 'undefined') return null;
  const url = relPath.startsWith('./') || relPath.startsWith('/') ? relPath : `./${relPath}`;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    return await res.text();
  } catch {
    return null;
  }
}

export class TiledMapLoader {
  public async loadFromManifest(
    tmjRelPath: string,
    tilesetPaths: readonly string[],
    loader: ProAssetLoader,
    pixelScale = 2,
    textLoader: (relPath: string) => Promise<string | null> = fetchTextBestEffort
  ): Promise<TiledMapRuntime | null> {
    const rawTmj = await loader.loadJson<TiledMapJson>(tmjRelPath);
    if (!rawTmj) return null;

    const textCache = new Map<string, Promise<string | null>>();
    const loadTextCached = (rel: string): Promise<string | null> => {
      const hit = textCache.get(rel);
      if (hit) return hit;
      const p = textLoader(rel);
      textCache.set(rel, p);
      return p;
    };

    const resolvedTilesetPaths = new Set<string>(tilesetPaths);
    const updatedTs: NormalizedTiledTileset[] = [];
    if (Array.isArray(rawTmj.tilesets)) {
      for (const ts of rawTmj.tilesets) {
        if (ts.source && ts.source.toLowerCase().endsWith('.tsx')) {
          const tsxRel = resolveRelativeMapAsset(tmjRelPath, ts.source);
          const xml = await loadTextCached(tsxRel);
          const parsedTsx = xml ? parseTiledTsxXml(xml, ts.firstgid, tsxRel) : null;
          if (parsedTsx) {
            resolvedTilesetPaths.add(parsedTsx.image);
            updatedTs.push(parsedTsx);
            continue;
          }
        }
        if (ts.image) {
          resolvedTilesetPaths.add(ts.image);
          updatedTs.push({
            firstgid: ts.firstgid,
            name: ts.name ?? `ts_${ts.firstgid}`,
            ...(ts.source ? { source: ts.source } : {}),
            tilewidth: ts.tilewidth ?? 16,
            tileheight: ts.tileheight ?? 16,
            tilecount: ts.tilecount ?? 1,
            columns: ts.columns ?? 1,
            ...(ts.spacing !== undefined ? { spacing: ts.spacing } : {}),
            ...(ts.margin !== undefined ? { margin: ts.margin } : {}),
            image: ts.image,
            imagewidth: ts.imagewidth ?? 16,
            imageheight: ts.imageheight ?? 16,
            ...(ts.tiles ? { tiles: ts.tiles } : {})
          });
        }
      }
    }

    const templateCache = new Map<string, TiledObjectJson | null>();
    const resolveLayerTemplates = async (
      layers: readonly TiledLayerJson[]
    ): Promise<TiledLayerJson[]> => {
      const out: TiledLayerJson[] = [];
      for (const layer of layers) {
        if (layer.type === 'group' && Array.isArray(layer.layers)) {
          out.push({ ...layer, layers: await resolveLayerTemplates(layer.layers) });
          continue;
        }
        if (layer.type === 'objectgroup' && Array.isArray(layer.objects)) {
          const resolvedObjects: TiledObjectJson[] = [];
          for (const obj of layer.objects) {
            if (typeof obj.template === 'string' && obj.template.length > 0) {
              const tplRel = resolveRelativeMapAsset(tmjRelPath, obj.template);
              let parsedTpl = templateCache.get(tplRel);
              if (parsedTpl === undefined) {
                const xml = await loadTextCached(tplRel);
                parsedTpl = xml ? parseTiledTxTemplateXml(xml) : null;
                templateCache.set(tplRel, parsedTpl);
              }
              resolvedObjects.push(
                parsedTpl ? mergeTiledTemplateObject(parsedTpl, obj) : obj
              );
            } else {
              resolvedObjects.push(obj);
            }
          }
          out.push({ ...layer, objects: resolvedObjects });
          continue;
        }
        out.push(layer);
      }
      return out;
    };

    const clonedTmj: TiledMapJson = {
      ...rawTmj,
      tilesets: updatedTs.length > 0 ? updatedTs : rawTmj.tilesets,
      layers: Array.isArray(rawTmj.layers)
        ? await resolveLayerTemplates(rawTmj.layers)
        : rawTmj.layers
    };

    const { tilesetTextures } = await loader.preloadMapAndTilesets({
      mapId: tmjRelPath,
      tmj: tmjRelPath,
      pixelScale,
      tilesets: Array.from(resolvedTilesetPaths)
    });
    const parsed = parseTiledMapData(clonedTmj, pixelScale);
    return new TiledMapRuntime(parsed, tilesetTextures, loader);
  }
}
