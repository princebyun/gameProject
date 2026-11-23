import type { Disposable } from '../core/types/disposable';
import type {
  FormDefinition,
  UnitDefinition,
  ZoanStanceRole
} from '../core/types/dataSchemas';
import { releaseOffscreenCanvas } from '../render/canvasGpuDispose';
import {
  defaultAssetManifestRegistry,
  resolveShipSpriteEntry,
  resolveSpriteSheetEntry,
  resolveWorldLandmark,
  type AssetManifestRegistry
} from '../data/assets/assetManifestRegistry';
import type {
  BackdropLayerKey,
  BattleBackdropManifestEntry,
  SpriteSheetManifestEntry,
  TilesetManifestEntry,
  VfxAtlasManifestEntry,
  WorldLandmarkManifestEntry
} from '../data/assets/types';
import { getBaseCharacterBlueprintForUnit } from '../render/sprite/rig/blueprintLibrary';
import { bakeCharacterPortraitCanvas } from '../render/sprite/rig/portraitPixelBaker';
import {
  createStandardRigAnimations,
  type PortraitEmotion
} from '../render/sprite/rig/rigTypes';
import { SpriteAnimationController } from '../render/sprite/spriteAnimationController';
import { LayeredTilemapRenderer } from '../render/tileset/layeredTilemapRenderer';
import { TilemapLayerRenderer } from '../render/tileset/tilemapLayerRenderer';
import { ParallaxBattleBackdrop } from '../render/battle/parallaxBattleBackdrop';
import { VfxAtlasRenderer } from '../render/battle/vfxAtlasRenderer';
import { AmbientParticleSystem } from '../render/rpg/ambientParticleSystem';
import { AtmosphereLightingOverlay } from '../render/rpg/atmosphereLightingOverlay';
import { FootstepEffectPool } from '../render/rpg/footstepEffectPool';
import { ExternalAssetResolver } from './externalAssetResolver';
import {
  bakeLuffyPortraitCanvas,
  type LuffyPortraitEmotion
} from './luffyArticulatedPixelSheet';
import {
  bakeProceduralShipSpriteSheet,
  bakeProceduralUnitSpriteSheet
} from './proceduralPixelSheetBaker';
import { bakeProceduralBiomeTileset } from './proceduralTilesetBaker';

export class AssetLoader implements Disposable {
  private spriteCache = new Map<string, HTMLCanvasElement>();
  private tileCache = new Map<string, HTMLCanvasElement>();
  private readonly maxSpriteIconEntries = 96;
  private readonly maxArenaTileEntries = 32;
  public readonly resolver = new ExternalAssetResolver();
  public readonly manifestRegistry: AssetManifestRegistry =
    defaultAssetManifestRegistry;
  public readonly spriteController = new SpriteAnimationController();
  public readonly tilemapRenderer = new TilemapLayerRenderer();
  public readonly layeredTilemap = new LayeredTilemapRenderer();
  public readonly parallaxBackdrop = new ParallaxBattleBackdrop();
  public readonly vfxAtlasRenderer = new VfxAtlasRenderer();
  public readonly ambientParticles = new AmbientParticleSystem();
  public readonly footstepParticles = new FootstepEffectPool();
  public readonly atmosphereLighting = new AtmosphereLightingOverlay();

  public getOrCreateUnitSpriteSheet(
    unit: UnitDefinition,
    activeFormId: string | null = null,
    formDef: FormDefinition | null = null
  ): {
    entry: SpriteSheetManifestEntry;
    sheet: HTMLImageElement | HTMLCanvasElement | null;
    source: 'EXTERNAL_PNG' | 'BAKED_FALLBACK';
  } {
    const entry: SpriteSheetManifestEntry =
      resolveSpriteSheetEntry(unit.id, activeFormId, this.manifestRegistry) ?? {
        key: `${unit.id}_base`,
        unitId: unit.id,
        formId: 'base',
        src: `assets/sprites/${unit.id}_base.png`,
        frameWidth: 48,
        frameHeight: 48,
        anchor: { x: 0.5, y: 0.9 },
        animations: createStandardRigAnimations()
      };

    const resolved = this.resolver.resolveImageSyncOrBake(
      entry.key,
      entry.src,
      () => bakeProceduralUnitSpriteSheet(entry, unit, formDef, null),
      {
        frameWidth: entry.frameWidth,
        minHorizontalFrames: entry.atlasMode === 'VARIABLE_PACK' ? 1 : 4
      }
    );

    return {
      entry,
      sheet: resolved.image,
      source: resolved.source
    };
  }

  public getOrCreateLuffyPortrait(
    emotion: LuffyPortraitEmotion = 'neutral'
  ): HTMLImageElement | HTMLCanvasElement | null {
    const key = `portrait_luffy_${emotion}`;
    const src = `assets/portraits/luffy_${emotion}.png`;
    return this.resolver.resolveImageSyncOrBake(
      key,
      src,
      () => bakeLuffyPortraitCanvas(emotion),
      { minHorizontalFrames: 1, frameWidth: 64 }
    ).image;
  }

  public getOrCreateUnitPortrait(
    unitId: string,
    emotion: PortraitEmotion = 'normal'
  ): HTMLImageElement | HTMLCanvasElement | null {
    const key = `portrait_${unitId}_${emotion}`;
    const src = `assets/portraits/${unitId}_${emotion}.png`;
    return this.resolver.resolveImageSyncOrBake(
      key,
      src,
      () => {
        const bp = getBaseCharacterBlueprintForUnit(unitId);
        if (!bp) return null;
        return bakeCharacterPortraitCanvas(bp, emotion);
      },
      { minHorizontalFrames: 1, frameWidth: 64 }
    ).image;
  }

  public getOrCreateShipSpriteSheet(shipId: string): {
    entry: SpriteSheetManifestEntry | null;
    sheet: HTMLImageElement | HTMLCanvasElement | null;
    source: 'EXTERNAL_PNG' | 'BAKED_FALLBACK';
  } {
    const entry = resolveShipSpriteEntry(shipId, this.manifestRegistry);
    if (!entry) {
      return { entry: null, sheet: null, source: 'BAKED_FALLBACK' };
    }
    const resolved = this.resolver.resolveImageSyncOrBake(
      entry.key,
      entry.src,
      () => bakeProceduralShipSpriteSheet(entry)
    );
    return { entry, sheet: resolved.image, source: resolved.source };
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

  public getOrCreateBattleBackdropLayer(
    backdrop: BattleBackdropManifestEntry,
    layer: BackdropLayerKey
  ): HTMLImageElement | HTMLCanvasElement | null {
    const resolved = this.resolver.resolveImageSyncOrBake(
      `bg_${backdrop.id}_${layer}`,
      backdrop.layers[layer],
      () => null,
      { minHorizontalFrames: 1, frameWidth: backdrop.width }
    );
    return resolved.image;
  }

  public getOrCreateVfxAtlas(
    vfx: VfxAtlasManifestEntry
  ): HTMLImageElement | HTMLCanvasElement | null {
    const resolved = this.resolver.resolveImageSyncOrBake(
      `vfx_${vfx.id}`,
      vfx.src,
      () => null,
      { minHorizontalFrames: 1, frameWidth: vfx.frameWidth }
    );
    return resolved.image;
  }

  public getWorldLandmarkSheet(landmarkId: string): {
    entry: WorldLandmarkManifestEntry | null;
    sheet: HTMLImageElement | HTMLCanvasElement | null;
    source: 'EXTERNAL_PNG' | 'BAKED_FALLBACK';
  } {
    const entry = resolveWorldLandmark(landmarkId, this.manifestRegistry);
    if (!entry) {
      return { entry: null, sheet: null, source: 'BAKED_FALLBACK' };
    }
    const resolved = this.resolver.resolveImageSyncOrBake(
      `world_landmark_${entry.id}`,
      entry.path,
      () => null,
      {
        minHorizontalFrames: entry.frameCount,
        frameWidth: entry.frameWidth
      }
    );
    return { entry, sheet: resolved.image, source: resolved.source };
  }

  public async preloadCoreAssets(units: Record<string, UnitDefinition>): Promise<void> {
    if (typeof document === 'undefined') {
      return;
    }
    for (const unit of Object.values(units)) {
      this.getOrCreateUnitSpriteSheet(unit, null, null);
    }
    for (const lm of this.manifestRegistry.landmarksFile.landmarks) {
      this.getWorldLandmarkSheet(lm.id);
    }
    this.getOrCreateArenaTile('default');
  }

  /**
   * Returns a cached 32x32 single-frame icon canvas extracted from frame 0 (`IDLE`)
   * of the unit's articulated multi-frame 2D pixel sprite sheet.
   */
  public getOrCreateUnitSprite(
    unit: UnitDefinition,
    stanceRole: ZoanStanceRole = 'BASE',
    activeFormId: string | null = null
  ): HTMLCanvasElement | null {
    if (typeof document === 'undefined') {
      return null;
    }
    const cacheKey = `${unit.id}_${stanceRole}_${activeFormId ?? 'none'}`;
    const existing = this.spriteCache.get(cacheKey);
    if (existing) {
      this.spriteCache.delete(cacheKey);
      this.spriteCache.set(cacheKey, existing);
      return existing;
    }

    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext('2d');
    if (!ctx) return canvas;
    ctx.imageSmoothingEnabled = false;

    const { entry, sheet } = this.getOrCreateUnitSpriteSheet(
      unit,
      activeFormId,
      null
    );
    if (sheet) {
      ctx.drawImage(
        sheet,
        0,
        0,
        entry.frameWidth,
        entry.frameHeight,
        0,
        0,
        32,
        32
      );
    }

    if (this.spriteCache.size >= this.maxSpriteIconEntries) {
      const oldestKey = this.spriteCache.keys().next().value;
      if (oldestKey !== undefined) {
        const oldest = this.spriteCache.get(oldestKey);
        this.spriteCache.delete(oldestKey);
        releaseOffscreenCanvas(oldest);
      }
    }
    this.spriteCache.set(cacheKey, canvas);
    return canvas;
  }

  public getOrCreateArenaTile(theme: string): HTMLCanvasElement | null {
    if (typeof document === 'undefined') {
      return null;
    }
    const existing = this.tileCache.get(theme);
    if (existing) {
      this.tileCache.delete(theme);
      this.tileCache.set(theme, existing);
      return existing;
    }

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

    if (this.tileCache.size >= this.maxArenaTileEntries) {
      const oldestKey = this.tileCache.keys().next().value;
      if (oldestKey !== undefined) {
        const oldest = this.tileCache.get(oldestKey);
        this.tileCache.delete(oldestKey);
        releaseOffscreenCanvas(oldest);
      }
    }
    this.tileCache.set(theme, canvas);
    return canvas;
  }

  public dispose(): void {
    for (const c of this.spriteCache.values()) {
      releaseOffscreenCanvas(c);
    }
    this.spriteCache.clear();
    for (const c of this.tileCache.values()) {
      releaseOffscreenCanvas(c);
    }
    this.tileCache.clear();
    this.spriteController.dispose();
    this.tilemapRenderer.dispose();
    this.layeredTilemap.dispose();
    this.atmosphereLighting.dispose();
    this.vfxAtlasRenderer.clear();
    this.ambientParticles.clear();
    this.footstepParticles.clear();
    this.parallaxBackdrop.clearDecals();
    this.resolver.dispose();
  }
}
