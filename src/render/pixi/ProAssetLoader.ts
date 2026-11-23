import {
  Container,
  Graphics,
  ImageSource,
  Rectangle,
  Text,
  Texture
} from 'pixi.js';
import type { Disposable } from '../../core/types/disposable';
import {
  defaultProAssetManifest,
  type ProAssetManifestFile,
  type ProBackgroundManifestEntry,
  type ProCutinManifestEntry,
  type ProMapManifestEntry,
  type ProPortraitManifestEntry,
  type ProSpriteManifestEntry,
  type ProVfxManifestEntry
} from '../../data/assets/proAssetManifest';
import {
  STANDARD_SPRITE_ANIM_STATES,
  type SpriteAnimState
} from '../../data/assets/types';

export type ParsedAtlasFormat =
  | 'ASEPRITE_HASH'
  | 'ASEPRITE_ARRAY'
  | 'TEXTURE_PACKER'
  | 'LEGACY_META_VARIABLE'
  | 'LEGACY_META_GRID';

export interface ParsedProAtlasFrame {
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  durationMs: number;
  pivotX: number;
  pivotY: number;
}

export interface ParsedProAnimClip {
  state: SpriteAnimState;
  fps: number;
  loop: boolean;
  hitFrame?: number;
  frames: ParsedProAtlasFrame[];
}

export interface ParsedProSpriteAtlas {
  format: ParsedAtlasFormat;
  texWidth: number;
  texHeight: number;
  anchor: { x: number; y: number };
  clips: Record<SpriteAnimState, ParsedProAnimClip>;
}

export interface LoadedProSpriteAtlas {
  key: string;
  entry: ProSpriteManifestEntry;
  baseTexture: Texture;
  parsed: ParsedProSpriteAtlas;
  clipTextures: Record<SpriteAnimState, Texture[]>;
  clipFps: Record<SpriteAnimState, number>;
  clipLoop: Record<SpriteAnimState, boolean>;
}

export interface LoadedProVfxAtlas {
  entry: ProVfxManifestEntry;
  baseTexture: Texture;
  frames: Texture[];
}

export interface ProAssetFetchers {
  loadImage: (url: string) => Promise<HTMLImageElement | null>;
  loadJson: (url: string) => Promise<unknown | null>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readNum(obj: Record<string, unknown>, key: string, fallback: number): number {
  const v = obj[key];
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function readStr(obj: Record<string, unknown>, key: string, fallback: string): string {
  const v = obj[key];
  return typeof v === 'string' ? v : fallback;
}

function readBool(obj: Record<string, unknown>, key: string, fallback: boolean): boolean {
  const v = obj[key];
  return typeof v === 'boolean' ? v : fallback;
}

const DEFAULT_ANIM_META: Record<SpriteAnimState, { fps: number; loop: boolean }> = {
  IDLE: { fps: 6, loop: true },
  MOVE: { fps: 12, loop: true },
  WINDUP: { fps: 10, loop: false },
  ATTACK_MELEE: { fps: 14, loop: false },
  ATTACK_CAST: { fps: 12, loop: false },
  CLASH: { fps: 12, loop: true },
  DODGE: { fps: 12, loop: false },
  HIT: { fps: 10, loop: false },
  DOWNED: { fps: 4, loop: true },
  TRANSFORM: { fps: 10, loop: false },
  VICTORY: { fps: 6, loop: true }
};

export function mapTagNameToSpriteState(rawTag: string): SpriteAnimState | null {
  const upper = rawTag.trim().toUpperCase().replace(/[^A-Z0-9_]+/g, '_');
  for (const st of STANDARD_SPRITE_ANIM_STATES) {
    if (upper === st || upper.startsWith(`${st}_`)) return st;
  }
  if (upper.includes('IDLE') || upper.includes('STAND')) return 'IDLE';
  if (upper.includes('MOVE') || upper.includes('RUN') || upper.includes('WALK')) return 'MOVE';
  if (upper.includes('WINDUP') || upper.includes('CHARGE') || upper.includes('PREP')) return 'WINDUP';
  if (upper.includes('CAST') || upper.includes('SPECIAL') || upper.includes('GATLING') || upper.includes('BAZOOKA')) return 'ATTACK_CAST';
  if (upper.includes('MELEE') || upper.includes('ATTACK') || upper.includes('PUNCH') || upper.includes('SLASH')) return 'ATTACK_MELEE';
  if (upper.includes('CLASH') || upper.includes('GUARD') || upper.includes('PARRY') || upper.includes('BLOCK')) return 'CLASH';
  if (upper.includes('DODGE') || upper.includes('DASH') || upper.includes('JUMP') || upper.includes('EVADE')) return 'DODGE';
  if (upper.includes('HIT') || upper.includes('HURT') || upper.includes('DAMAGE')) return 'HIT';
  if (upper.includes('DOWN') || upper.includes('KO') || upper.includes('FALL')) return 'DOWNED';
  if (upper.includes('TRANSFORM') || upper.includes('AWAKEN') || upper.includes('GEAR')) return 'TRANSFORM';
  if (upper.includes('VICTORY') || upper.includes('WIN') || upper.includes('POSE')) return 'VICTORY';
  return null;
}

function buildClipMapWithFallback(
  partial: Partial<Record<SpriteAnimState, ParsedProAnimClip>>,
  orderedFrames: ParsedProAtlasFrame[]
): Record<SpriteAnimState, ParsedProAnimClip> {
  const fallbackFrame: ParsedProAtlasFrame = orderedFrames[0] ?? {
    name: 'fallback_0',
    x: 0,
    y: 0,
    w: 32,
    h: 32,
    durationMs: 100,
    pivotX: 16,
    pivotY: 29
  };
  const idleClip: ParsedProAnimClip = partial.IDLE ?? {
    state: 'IDLE',
    fps: DEFAULT_ANIM_META.IDLE.fps,
    loop: DEFAULT_ANIM_META.IDLE.loop,
    frames: [fallbackFrame]
  };
  const out = {} as Record<SpriteAnimState, ParsedProAnimClip>;
  for (const state of STANDARD_SPRITE_ANIM_STATES) {
    const existing = partial[state];
    if (existing && existing.frames.length > 0) {
      out[state] = existing;
    } else {
      const def = DEFAULT_ANIM_META[state];
      out[state] = {
        state,
        fps: def.fps,
        loop: def.loop,
        frames: idleClip.frames
      };
    }
  }
  return out;
}

function parseFrameObjectEntry(
  name: string,
  entryObj: Record<string, unknown>
): ParsedProAtlasFrame | null {
  const frameObj = isRecord(entryObj.frame) ? entryObj.frame : null;
  if (!frameObj) return null;
  const x = Math.max(0, Math.round(readNum(frameObj, 'x', 0)));
  const y = Math.max(0, Math.round(readNum(frameObj, 'y', 0)));
  const w = Math.max(1, Math.round(readNum(frameObj, 'w', 32)));
  const h = Math.max(1, Math.round(readNum(frameObj, 'h', 32)));
  const durationMs = Math.max(16, readNum(entryObj, 'duration', 100));
  const pivotObj = isRecord(entryObj.pivot) ? entryObj.pivot : null;
  const pivotX = pivotObj ? Math.round(readNum(pivotObj, 'x', 0.5) * w) : Math.round(w * 0.5);
  const pivotY = pivotObj ? Math.round(readNum(pivotObj, 'y', 0.9) * h) : Math.round(h * 0.9);
  return { name, x, y, w, h, durationMs, pivotX, pivotY };
}

function parseLegacyMeta(
  root: Record<string, unknown>,
  texWidth: number,
  texHeight: number
): ParsedProSpriteAtlas | null {
  const animsObj = isRecord(root.animations) ? root.animations : null;
  if (!animsObj || !('IDLE' in animsObj)) return null;

  const isVariablePack = readStr(root, 'atlasMode', 'GRID') === 'VARIABLE_PACK';
  const fw = Math.max(16, Math.round(readNum(root, 'frameWidth', 48)));
  const fh = Math.max(16, Math.round(readNum(root, 'frameHeight', 48)));
  const anchorObj = isRecord(root.anchor) ? root.anchor : null;
  const anchor = {
    x: anchorObj ? readNum(anchorObj, 'x', 0.5) : 0.5,
    y: anchorObj ? readNum(anchorObj, 'y', 0.9) : 0.9
  };

  const partial: Partial<Record<SpriteAnimState, ParsedProAnimClip>> = {};
  const allFrames: ParsedProAtlasFrame[] = [];

  for (const state of STANDARD_SPRITE_ANIM_STATES) {
    const clipRaw = animsObj[state];
    if (!isRecord(clipRaw)) continue;
    const row = Math.max(0, Math.round(readNum(clipRaw, 'row', 0)));
    const count = Math.max(1, Math.round(readNum(clipRaw, 'frames', 1)));
    const fps = Math.max(1, readNum(clipRaw, 'fps', DEFAULT_ANIM_META[state].fps));
    const loop = readBool(clipRaw, 'loop', DEFAULT_ANIM_META[state].loop);
    const hitFrameVal = clipRaw.hitFrame;
    const hitFrame = typeof hitFrameVal === 'number' ? hitFrameVal : undefined;
    const frames: ParsedProAtlasFrame[] = [];

    if (isVariablePack && Array.isArray(clipRaw.frameRects)) {
      for (let i = 0; i < clipRaw.frameRects.length; i++) {
        const fr = clipRaw.frameRects[i];
        if (!isRecord(fr)) continue;
        const w = Math.max(1, Math.round(readNum(fr, 'w', fw)));
        const h = Math.max(1, Math.round(readNum(fr, 'h', fh)));
        const parsed: ParsedProAtlasFrame = {
          name: `${state}_${i}`,
          x: Math.max(0, Math.round(readNum(fr, 'x', 0))),
          y: Math.max(0, Math.round(readNum(fr, 'y', 0))),
          w,
          h,
          durationMs: Math.round(1000 / fps),
          pivotX: readNum(fr, 'pivotX', w * anchor.x),
          pivotY: readNum(fr, 'pivotY', h * anchor.y)
        };
        frames.push(parsed);
        allFrames.push(parsed);
      }
    } else {
      for (let c = 0; c < count; c++) {
        const fx = c * fw;
        const fy = row * fh;
        if (fx + fw > texWidth && texWidth >= fw) continue;
        if (fy + fh > texHeight && texHeight >= fh) continue;
        const parsed: ParsedProAtlasFrame = {
          name: `${state}_${c}`,
          x: fx,
          y: fy,
          w: fw,
          h: fh,
          durationMs: Math.round(1000 / fps),
          pivotX: Math.round(fw * anchor.x),
          pivotY: Math.round(fh * anchor.y)
        };
        frames.push(parsed);
        allFrames.push(parsed);
      }
    }

    if (frames.length > 0) {
      partial[state] = {
        state,
        fps,
        loop,
        ...(hitFrame !== undefined ? { hitFrame } : {}),
        frames
      };
    }
  }

  return {
    format: isVariablePack ? 'LEGACY_META_VARIABLE' : 'LEGACY_META_GRID',
    texWidth,
    texHeight,
    anchor,
    clips: buildClipMapWithFallback(partial, allFrames)
  };
}

/**
 * Automatically parses 3+ industry-standard atlas formats without touching procedural bakers:
 * 1) Aseprite JSON Hash (frames object + meta.frameTags)
 * 2) Aseprite JSON Array (frames array + meta.frameTags)
 * 3) TexturePacker JSON (frames object/array + animations or name-prefix grouping)
 * 4) Existing import-sprite-pack `.meta.json` (VARIABLE_PACK / GRID)
 */
export function parseSpriteAtlasDescriptor(
  rawJson: unknown,
  texWidth: number,
  texHeight: number
): ParsedProSpriteAtlas {
  if (!isRecord(rawJson)) {
    throw new Error('Sprite atlas JSON root must be an object');
  }

  const legacy = parseLegacyMeta(rawJson, texWidth, texHeight);
  if (legacy) return legacy;

  const orderedFrames: ParsedProAtlasFrame[] = [];
  const frameByName = new Map<string, ParsedProAtlasFrame>();
  let format: ParsedAtlasFormat = 'TEXTURE_PACKER';

  if (Array.isArray(rawJson.frames)) {
    format = 'ASEPRITE_ARRAY';
    for (let i = 0; i < rawJson.frames.length; i++) {
      const item = rawJson.frames[i];
      if (!isRecord(item)) continue;
      const name = readStr(item, 'filename', `frame_${i}`);
      const parsed = parseFrameObjectEntry(name, item);
      if (parsed) {
        orderedFrames.push(parsed);
        frameByName.set(name, parsed);
      }
    }
  } else if (isRecord(rawJson.frames)) {
    const entries = Object.entries(rawJson.frames);
    for (const [key, val] of entries) {
      if (!isRecord(val)) continue;
      const parsed = parseFrameObjectEntry(key, val);
      if (parsed) {
        orderedFrames.push(parsed);
        frameByName.set(key, parsed);
      }
    }
  }

  const metaObj = isRecord(rawJson.meta) ? rawJson.meta : null;
  const anchorObj = metaObj && isRecord(metaObj.anchor) ? metaObj.anchor : null;
  const anchor = {
    x: anchorObj ? readNum(anchorObj, 'x', 0.5) : 0.5,
    y: anchorObj ? readNum(anchorObj, 'y', 0.9) : 0.9
  };

  const partial: Partial<Record<SpriteAnimState, ParsedProAnimClip>> = {};

  // Aseprite meta.frameTags
  const frameTags = metaObj && Array.isArray(metaObj.frameTags) ? metaObj.frameTags : null;
  if (frameTags && frameTags.length > 0) {
    if (format !== 'ASEPRITE_ARRAY') {
      format = 'ASEPRITE_HASH';
    }
    for (const rawTag of frameTags) {
      if (!isRecord(rawTag)) continue;
      const tagName = readStr(rawTag, 'name', '');
      const state = mapTagNameToSpriteState(tagName);
      if (!state) continue;
      const from = Math.max(0, Math.round(readNum(rawTag, 'from', 0)));
      const to = Math.min(orderedFrames.length - 1, Math.round(readNum(rawTag, 'to', from)));
      if (to < from) continue;
      const tagFrames = orderedFrames.slice(from, to + 1);
      if (tagFrames.length === 0) continue;
      const avgMs =
        tagFrames.reduce((sum, f) => sum + f.durationMs, 0) / tagFrames.length;
      const tagFps = Math.max(1, Math.round(1000 / Math.max(16, avgMs)));
      const def = DEFAULT_ANIM_META[state];
      const explicitFps = readNum(rawTag, 'fps', tagFps);
      const explicitLoop = readBool(rawTag, 'loop', def.loop);
      const hitFrame =
        typeof rawTag.hitFrame === 'number' ? rawTag.hitFrame : undefined;
      partial[state] = {
        state,
        fps: explicitFps,
        loop: explicitLoop,
        ...(hitFrame !== undefined ? { hitFrame } : {}),
        frames: tagFrames
      };
    }
  } else if (isRecord(rawJson.animations)) {
    // TexturePacker `animations` map
    format = 'TEXTURE_PACKER';
    for (const [animName, rawNames] of Object.entries(rawJson.animations)) {
      const state = mapTagNameToSpriteState(animName);
      if (!state || !Array.isArray(rawNames)) continue;
      const frames: ParsedProAtlasFrame[] = [];
      for (const fname of rawNames) {
        if (typeof fname !== 'string') continue;
        const found = frameByName.get(fname);
        if (found) frames.push(found);
      }
      if (frames.length > 0) {
        const def = DEFAULT_ANIM_META[state];
        partial[state] = {
          state,
          fps: def.fps,
          loop: def.loop,
          frames
        };
      }
    }
  } else {
    // Fallback: group by filename prefix (e.g. "idle_0.png", "move_1.png")
    for (const frame of orderedFrames) {
      const prefix = frame.name.replace(/\.[^.]+$/, '').replace(/[_\-\s]*\d+$/, '');
      const state = mapTagNameToSpriteState(prefix) ?? 'IDLE';
      const existing = partial[state];
      if (existing) {
        existing.frames.push(frame);
      } else {
        const def = DEFAULT_ANIM_META[state];
        partial[state] = {
          state,
          fps: def.fps,
          loop: def.loop,
          frames: [frame]
        };
      }
    }
  }

  return {
    format,
    texWidth,
    texHeight,
    anchor,
    clips: buildClipMapWithFallback(partial, orderedFrames)
  };
}

export function normalizeProAssetUrl(relPath: string): string {
  if (
    relPath.startsWith('./') ||
    relPath.startsWith('/') ||
    relPath.startsWith('http://') ||
    relPath.startsWith('https://') ||
    relPath.startsWith('data:')
  ) {
    return relPath;
  }
  return `./${relPath}`;
}

function defaultBrowserLoadImage(url: string): Promise<HTMLImageElement | null> {
  if (typeof Image === 'undefined' || typeof window === 'undefined') {
    return Promise.resolve(null);
  }
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      if (img.naturalWidth > 0 && img.naturalHeight > 0) {
        resolve(img);
      } else {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = normalizeProAssetUrl(url);
  });
}

async function defaultBrowserLoadJson(url: string): Promise<unknown | null> {
  if (typeof fetch === 'undefined' || typeof window === 'undefined') {
    return null;
  }
  try {
    const res = await fetch(normalizeProAssetUrl(url));
    if (!res.ok) return null;
    const contentType = res.headers.get('content-type') ?? '';
    if (contentType.includes('text/html')) return null;
    return (await res.json()) as unknown;
  } catch {
    return null;
  }
}

export function createMissingProArtPlaceholder(
  id: string,
  width = 40,
  height = 52,
  isDevMode = false
): Container {
  const container = new Container();
  container.label = `missing_pro_art_${id}`;

  const gfx = new Graphics();
  const hw = Math.round(width * 0.5);
  const hh = Math.round(height);
  gfx.roundRect(-hw + 4, -hh + 6, Math.max(12, width - 8), Math.max(16, hh - 10), 6);
  gfx.fill({ color: 0x334155, alpha: 0.78 });
  gfx.stroke({ color: 0x94a3b8, width: 1.5, alpha: 0.9 });

  // Clean neutral head indicator without any procedural pixel-art generation
  gfx.circle(0, -hh + 14, 7);
  gfx.fill({ color: 0x64748b, alpha: 0.9 });
  gfx.stroke({ color: 0xe2e8f0, width: 1, alpha: 0.75 });
  container.addChild(gfx);

  if (isDevMode) {
    const badge = new Text({
      text: `PRO ART REQUIRED: ${id}`,
      style: {
        fontFamily: 'monospace',
        fontSize: 9,
        fontWeight: 'bold',
        fill: 0xfef08a,
        stroke: { color: 0x090d16, width: 2 }
      }
    });
    badge.anchor.set(0.5, 1);
    badge.position.set(0, -hh - 2);
    container.addChild(badge);
  }

  return container;
}

/**
 * Strictly external Pro Asset Loader for PixiJS v8 WebGL2 pipeline.
 * Has ZERO dependency on legacy procedural pixel/tileset bakers.
 */
export class ProAssetLoader implements Disposable {
  public manifest: ProAssetManifestFile = defaultProAssetManifest;
  private readonly baseTextures = new Map<string, Texture>();
  private readonly subTextures: Texture[] = [];
  private readonly spriteAtlases = new Map<string, LoadedProSpriteAtlas>();
  private readonly vfxAtlases = new Map<string, LoadedProVfxAtlas>();
  private readonly missingKeys = new Set<string>();
  private readonly pendingLoads = new Map<string, Promise<unknown>>();
  private readonly fetchers: ProAssetFetchers;
  private disposed = false;

  constructor(fetchers?: Partial<ProAssetFetchers>) {
    this.fetchers = {
      loadImage: fetchers?.loadImage ?? defaultBrowserLoadImage,
      loadJson: fetchers?.loadJson ?? defaultBrowserLoadJson
    };
  }

  public getLoadedTextureCount(): number {
    return this.baseTextures.size + this.subTextures.length;
  }

  public getLoadedSpriteAtlasSync(key: string): LoadedProSpriteAtlas | null {
    return this.spriteAtlases.get(key) ?? null;
  }

  public getLoadedTextureSync(cacheKey: string): Texture | null {
    return this.baseTextures.get(cacheKey) ?? null;
  }

  public getLoadedVfxAtlasSync(id: string): LoadedProVfxAtlas | null {
    return this.vfxAtlases.get(id) ?? null;
  }

  public getMissingProArtKeys(): string[] {
    return Array.from(this.missingKeys).sort();
  }

  public markMissingProArt(key: string): void {
    this.missingKeys.add(key);
  }

  public async loadTexture(cacheKey: string, relPath: string): Promise<Texture | null> {
    if (this.disposed) return null;
    const existing = this.baseTextures.get(cacheKey);
    if (existing) return existing;

    const pendingKey = `tex:${cacheKey}`;
    const existingPending = this.pendingLoads.get(pendingKey);
    if (existingPending) {
      return (await existingPending) as Texture | null;
    }

    const promise = (async (): Promise<Texture | null> => {
      const img = await this.fetchers.loadImage(relPath);
      if (!img || this.disposed) {
        this.missingKeys.add(cacheKey);
        return null;
      }
      const source = new ImageSource({
        resource: img,
        scaleMode: 'nearest'
      });
      const tex = new Texture({ source, label: cacheKey });
      this.baseTextures.set(cacheKey, tex);
      this.missingKeys.delete(cacheKey);
      return tex;
    })();

    this.pendingLoads.set(pendingKey, promise);
    try {
      return await promise;
    } finally {
      this.pendingLoads.delete(pendingKey);
    }
  }

  public async loadJson<T = unknown>(relPath: string): Promise<T | null> {
    if (this.disposed) return null;
    const data = await this.fetchers.loadJson(relPath);
    return (data as T | null) ?? null;
  }

  public createSubTexture(baseTexture: Texture, x: number, y: number, w: number, h: number): Texture {
    const sub = new Texture({
      source: baseTexture.source,
      frame: new Rectangle(x, y, w, h)
    });
    this.subTextures.push(sub);
    return sub;
  }

  public async loadSpriteAtlas(entry: ProSpriteManifestEntry): Promise<LoadedProSpriteAtlas | null> {
    if (this.disposed) return null;
    const existing = this.spriteAtlases.get(entry.key);
    if (existing) return existing;

    const pendingKey = `sprite:${entry.key}`;
    const pending = this.pendingLoads.get(pendingKey);
    if (pending) {
      return (await pending) as LoadedProSpriteAtlas | null;
    }

    const promise = (async (): Promise<LoadedProSpriteAtlas | null> => {
      const [baseTexture, rawJson] = await Promise.all([
        this.loadTexture(`sprite_base_${entry.key}`, entry.image),
        this.loadJson(entry.atlasJson)
      ]);
      if (!baseTexture || !rawJson || this.disposed) {
        this.missingKeys.add(entry.key);
        return null;
      }

      const parsed = parseSpriteAtlasDescriptor(
        rawJson,
        baseTexture.width,
        baseTexture.height
      );

      const clipTextures = {} as Record<SpriteAnimState, Texture[]>;
      const clipFps = {} as Record<SpriteAnimState, number>;
      const clipLoop = {} as Record<SpriteAnimState, boolean>;

      for (const state of STANDARD_SPRITE_ANIM_STATES) {
        const clip = parsed.clips[state];
        clipFps[state] = clip.fps;
        clipLoop[state] = clip.loop;
        const textures: Texture[] = [];
        for (const fr of clip.frames) {
          const sx = Math.max(0, Math.min(baseTexture.width - 1, fr.x));
          const sy = Math.max(0, Math.min(baseTexture.height - 1, fr.y));
          const sw = Math.max(1, Math.min(baseTexture.width - sx, fr.w));
          const sh = Math.max(1, Math.min(baseTexture.height - sy, fr.h));
          textures.push(this.createSubTexture(baseTexture, sx, sy, sw, sh));
        }
        clipTextures[state] = textures;
      }

      const loaded: LoadedProSpriteAtlas = {
        key: entry.key,
        entry,
        baseTexture,
        parsed,
        clipTextures,
        clipFps,
        clipLoop
      };
      this.spriteAtlases.set(entry.key, loaded);
      this.missingKeys.delete(entry.key);
      return loaded;
    })();

    this.pendingLoads.set(pendingKey, promise);
    try {
      return await promise;
    } finally {
      this.pendingLoads.delete(pendingKey);
    }
  }

  public async loadPortrait(key: string, entry: ProPortraitManifestEntry): Promise<Texture | null> {
    return this.loadTexture(`portrait_${key}`, entry.image);
  }

  public async loadCutin(key: string, entry: ProCutinManifestEntry): Promise<Texture | null> {
    return this.loadTexture(`cutin_${key}`, entry.image);
  }

  public async loadBackgroundLayers(
    entry: ProBackgroundManifestEntry
  ): Promise<Texture[] | null> {
    const textures = await Promise.all(
      entry.layers.map((src, idx) => this.loadTexture(`bg_${entry.bgId}_layer${idx}`, src))
    );
    if (textures.some((t) => t === null)) return null;
    return textures as Texture[];
  }

  public async loadVfxAtlas(entry: ProVfxManifestEntry): Promise<LoadedProVfxAtlas | null> {
    if (this.disposed) return null;
    const existing = this.vfxAtlases.get(entry.id);
    if (existing) return existing;

    const baseTexture = await this.loadTexture(`vfx_${entry.id}`, entry.image);
    if (!baseTexture || this.disposed) return null;

    const cols = Math.max(1, Math.floor(baseTexture.width / Math.max(1, entry.frameWidth)));
    const count = Math.min(cols, Math.max(1, entry.frameCount));
    const frames: Texture[] = [];
    for (let i = 0; i < count; i++) {
      frames.push(
        this.createSubTexture(
          baseTexture,
          i * entry.frameWidth,
          0,
          Math.min(entry.frameWidth, baseTexture.width),
          Math.min(entry.frameHeight, baseTexture.height)
        )
      );
    }
    const loaded: LoadedProVfxAtlas = { entry, baseTexture, frames };
    this.vfxAtlases.set(entry.id, loaded);
    return loaded;
  }

  public async preloadMapAndTilesets(mapEntry: ProMapManifestEntry): Promise<{
    tmj: unknown | null;
    tilesetTextures: Map<string, Texture>;
  }> {
    const [tmj, ...texList] = await Promise.all([
      this.loadJson(mapEntry.tmj),
      ...mapEntry.tilesets.map((tsPath) =>
        this.loadTexture(`tileset_${tsPath}`, tsPath).then((tex) => ({ tsPath, tex }))
      )
    ]);
    const tilesetTextures = new Map<string, Texture>();
    for (const item of texList) {
      if (item.tex) {
        tilesetTextures.set(item.tsPath, item.tex);
      }
    }
    return { tmj, tilesetTextures };
  }

  public async preloadVerticalSliceCore(): Promise<void> {
    const tasks: Promise<unknown>[] = [];
    for (const spriteEntry of Object.values(this.manifest.sprites)) {
      tasks.push(this.loadSpriteAtlas(spriteEntry));
    }
    for (const [k, pEntry] of Object.entries(this.manifest.portraits)) {
      tasks.push(this.loadPortrait(k, pEntry));
    }
    for (const [k, cEntry] of Object.entries(this.manifest.cutins)) {
      tasks.push(this.loadCutin(k, cEntry));
    }
    for (const bgEntry of Object.values(this.manifest.backgrounds)) {
      tasks.push(this.loadBackgroundLayers(bgEntry));
    }
    for (const vfxEntry of Object.values(this.manifest.vfx)) {
      tasks.push(this.loadVfxAtlas(vfxEntry));
    }
    await Promise.all(tasks);
  }

  public releaseTransientSubTextures(): void {
    for (const sub of this.subTextures) {
      if (!sub.destroyed) {
        sub.destroy(false);
      }
    }
    this.subTextures.length = 0;
  }

  public dispose(): void {
    this.disposed = true;
    this.releaseTransientSubTextures();
    for (const base of this.baseTextures.values()) {
      if (!base.destroyed) {
        base.destroy(true);
      }
    }
    this.baseTextures.clear();
    this.spriteAtlases.clear();
    this.vfxAtlases.clear();
    this.missingKeys.clear();
    this.pendingLoads.clear();
  }
}
