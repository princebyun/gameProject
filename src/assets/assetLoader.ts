import type { DialogueEmotion } from '../core/rpg/scriptSchema';
import type {
  FormDefinition,
  UnitDefinition,
  ZoanStanceRole
} from '../core/types/dataSchemas';
import {
  defaultAssetManifestRegistry,
  resolveShipSpriteEntry,
  resolveSpriteSheetEntry,
  type AssetManifestRegistry
} from '../data/assets/assetManifestRegistry';
import type {
  SpriteSheetManifestEntry,
  TilesetManifestEntry
} from '../data/assets/types';
import { PixelPortraitRenderer } from '../render/sprite/pixelPortraitRenderer';
import { SpriteAnimationController } from '../render/sprite/spriteAnimationController';
import { TilemapLayerRenderer } from '../render/tileset/tilemapLayerRenderer';
import { ExternalAssetResolver } from './externalAssetResolver';
import {
  bakeProceduralShipSpriteSheet,
  bakeProceduralUnitSpriteSheet
} from './proceduralPixelSheetBaker';
import { bakeProceduralBiomeTileset } from './proceduralTilesetBaker';
import {
  SmartSpriteSheetLoader,
  resolveFrameSourceAndDestRect,
  type SmartResolvedSpriteSheet
} from './smartSpriteSheetLoader';

export class AssetLoader {
  private spriteCache = new Map<string, HTMLCanvasElement>();
  private tileCache = new Map<string, HTMLCanvasElement>();
  public readonly resolver = new ExternalAssetResolver();
  public readonly smartLoader = new SmartSpriteSheetLoader(this.resolver);
  public readonly portraitRenderer = new PixelPortraitRenderer(this.resolver);
  public readonly manifestRegistry: AssetManifestRegistry =
    defaultAssetManifestRegistry;
  public readonly spriteController = new SpriteAnimationController();
  public readonly tilemapRenderer = new TilemapLayerRenderer();

  public getOrCreateUnitSpriteSheet(
    unit: UnitDefinition,
    activeFormId: string | null = null,
    formDef: FormDefinition | null = null
  ): SmartResolvedSpriteSheet {
    const entry: SpriteSheetManifestEntry =
      resolveSpriteSheetEntry(unit.id, activeFormId, this.manifestRegistry) ?? {
        key: `${unit.id}_base`,
        unitId: unit.id,
        formId: 'base',
        src: `assets/sprites/${unit.id}_base.png`,
        frameWidth: 32,
        frameHeight: 32,
        anchor: { x: 0.5, y: 0.85 },
        animations: {
          IDLE: { row: 0, frames: 4, fps: 5, loop: true },
          MOVE: { row: 1, frames: 6, fps: 10, loop: true },
          WINDUP: { row: 2, frames: 3, fps: 10, loop: false },
          ATTACK_MELEE: { row: 3, frames: 4, fps: 14, loop: false, hitFrame: 2 },
          ATTACK_CAST: { row: 4, frames: 3, fps: 12, loop: false, hitFrame: 1 },
          CLASH: { row: 5, frames: 2, fps: 12, loop: true },
          DODGE: { row: 6, frames: 2, fps: 12, loop: false },
          HIT: { row: 7, frames: 2, fps: 10, loop: false },
          DOWNED: { row: 8, frames: 2, fps: 4, loop: true },
          TRANSFORM: { row: 9, frames: 4, fps: 10, loop: false, hitFrame: 2 },
          VICTORY: { row: 10, frames: 4, fps: 6, loop: true }
        }
      };

    return this.smartLoader.resolveSyncOrBake(entry, () =>
      bakeProceduralUnitSpriteSheet(entry, unit, formDef)
    );
  }

  public getOrCreateShipSpriteSheet(shipId: string): {
    entry: SpriteSheetManifestEntry | null;
    sheet: HTMLImageElement | HTMLCanvasElement | null;
    source: 'EXTERNAL_PNG' | 'BAKED_FALLBACK';
    sheetFrameWidth: number;
    sheetFrameHeight: number;
  } {
    const entry = resolveShipSpriteEntry(shipId, this.manifestRegistry);
    if (!entry) {
      return {
        entry: null,
        sheet: null,
        source: 'BAKED_FALLBACK',
        sheetFrameWidth: 48,
        sheetFrameHeight: 48
      };
    }
    const resolved = this.smartLoader.resolveSyncOrBake(entry, () =>
      bakeProceduralShipSpriteSheet(entry)
    );
    return {
      entry: resolved.entry,
      sheet: resolved.sheet,
      source: resolved.source,
      sheetFrameWidth: resolved.sheetFrameWidth,
      sheetFrameHeight: resolved.sheetFrameHeight
    };
  }

  public getOrCreateUnitPortrait(
    unit: UnitDefinition | null | undefined,
    emotion: DialogueEmotion = 'normal',
    activeFormId: string | null = null
  ): {
    image: HTMLImageElement | HTMLCanvasElement | null;
    source: 'EXTERNAL_PNG' | 'BAKED_FALLBACK';
  } {
    return this.portraitRenderer.getOrCreatePortrait(unit, emotion, activeFormId);
  }

  public getOrCreateBiomeTileset(
    biome: TilesetManifestEntry
  ): HTMLImageElement | HTMLCanvasElement | null {
    const resolved = this.resolver.resolveImageSyncOrBake(
      `tileset_${biome.biomeId}`,
      biome.src,
      () => bakeProceduralBiomeTileset(biome)
    );
    return resolved.image;
  }

  public async preloadCoreAssets(units: Record<string, UnitDefinition>): Promise<void> {
    if (typeof document === 'undefined') {
      return;
    }
    const luffy = units['luffy'];
    if (luffy) {
      const luffyEntry = resolveSpriteSheetEntry('luffy', null, this.manifestRegistry);
      if (luffyEntry) {
        await this.smartLoader.resolveAsync(luffyEntry, () =>
          bakeProceduralUnitSpriteSheet(luffyEntry, luffy, null)
        );
      }
      // Kick off portrait probes for all 7 emotions so dialogue/HUD immediately use external PNGs
      const emotions: DialogueEmotion[] = [
        'normal',
        'angry',
        'determined',
        'shocked',
        'smirk',
        'sad',
        'excited'
      ];
      for (const emo of emotions) {
        this.getOrCreateUnitPortrait(luffy, emo, null);
      }
    }
    for (const unit of Object.values(units)) {
      this.getOrCreateUnitPortrait(unit, 'normal', null);
    }
    this.getOrCreateArenaTile('default');
  }

  /**
   * Single-frame high-detail pixel avatar extracted directly from the external PNG atlas
   * or 48/64/112px blueprint sprite sheet (replaces legacy 32x32 flat geometric shapes).
   */
  public getOrCreateUnitSprite(
    unit: UnitDefinition,
    stanceRole: ZoanStanceRole = 'BASE',
    activeFormId: string | null = null
  ): HTMLCanvasElement | null {
    if (typeof document === 'undefined') {
      return null;
    }
    const resolved = this.getOrCreateUnitSpriteSheet(unit, activeFormId, null);
    const cacheKey = `${unit.id}_${stanceRole}_${activeFormId ?? 'none'}_${resolved.source}`;
    const existing = this.spriteCache.get(cacheKey);
    if (existing) {
      return existing;
    }

    const rects = resolveFrameSourceAndDestRect(
      resolved.entry,
      resolved.meta,
      'IDLE',
      0,
      0,
      resolved.sheetFrameWidth,
      resolved.sheetFrameHeight,
      1
    );
    const canvas = document.createElement('canvas');
    canvas.width = rects.srcW;
    canvas.height = rects.srcH;
    const ctx = canvas.getContext('2d');
    if (ctx && resolved.sheet) {
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(
        resolved.sheet,
        rects.srcX,
        rects.srcY,
        rects.srcW,
        rects.srcH,
        0,
        0,
        canvas.width,
        canvas.height
      );
    }
    this.spriteCache.set(cacheKey, canvas);
    return canvas;
  }

  public getOrCreateArenaTile(theme: string): HTMLCanvasElement | null {
    if (typeof document === 'undefined') {
      return null;
    }
    const existing = this.tileCache.get(theme);
    if (existing) return existing;

    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext('2d');
    if (!ctx) return canvas;

    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#111827';
    ctx.fillRect(0, 0, 32, 32);
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(0, 0, 31, 31);
    ctx.fillStyle = '#172033';
    ctx.fillRect(2, 2, 27, 27);
    ctx.fillStyle = '#334155';
    ctx.fillRect(15, 15, 2, 2);

    this.tileCache.set(theme, canvas);
    return canvas;
  }
}
