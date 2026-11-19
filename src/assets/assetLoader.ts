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
import { SpriteAnimationController } from '../render/sprite/spriteAnimationController';
import { TilemapLayerRenderer } from '../render/tileset/tilemapLayerRenderer';
import { ExternalAssetResolver } from './externalAssetResolver';
import {
  bakeProceduralShipSpriteSheet,
  bakeProceduralUnitSpriteSheet
} from './proceduralPixelSheetBaker';
import { bakeProceduralBiomeTileset } from './proceduralTilesetBaker';

export class AssetLoader {
  private spriteCache = new Map<string, HTMLCanvasElement>();
  private tileCache = new Map<string, HTMLCanvasElement>();
  public readonly resolver = new ExternalAssetResolver();
  public readonly manifestRegistry: AssetManifestRegistry =
    defaultAssetManifestRegistry;
  public readonly spriteController = new SpriteAnimationController();
  public readonly tilemapRenderer = new TilemapLayerRenderer();

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

    const resolved = this.resolver.resolveImageSyncOrBake(
      entry.key,
      entry.src,
      () => {
        const baseAvatar = this.getOrCreateUnitSprite(
          unit,
          formDef?.stanceRole ?? 'BASE',
          activeFormId
        );
        return bakeProceduralUnitSpriteSheet(entry, unit, formDef, baseAvatar);
      }
    );

    return {
      entry,
      sheet: resolved.image,
      source: resolved.source
    };
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

  public async preloadCoreAssets(units: Record<string, UnitDefinition>): Promise<void> {
    if (typeof document === 'undefined') {
      return;
    }
    for (const unit of Object.values(units)) {
      this.getOrCreateUnitSprite(unit, 'BASE', null);
    }
    this.getOrCreateArenaTile('default');
  }

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
      return existing;
    }

    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext('2d');
    if (!ctx) return canvas;

    ctx.imageSmoothingEnabled = false;

    // Ground shadow
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.fillRect(6, 27, 20, 4);

    const avatarId = unit.palette.avatarId;

    if (avatarId === 'LUFFY') {
      const isGear5 = activeFormId === 'form_luffy_gear5';
      // Legs & shorts
      ctx.fillStyle = isGear5 ? '#f8fafc' : '#1d4ed8';
      ctx.fillRect(10, 20, 5, 6);
      ctx.fillRect(17, 20, 5, 6);
      // Torso vest
      ctx.fillStyle = isGear5 ? '#ffffff' : '#ef4444';
      ctx.fillRect(9, 13, 14, 8);
      // Yellow sash
      ctx.fillStyle = isGear5 ? '#c084fc' : '#facc15';
      ctx.fillRect(10, 19, 12, 2);
      // Skin face
      ctx.fillStyle = '#fed7aa';
      ctx.fillRect(11, 7, 10, 7);
      if (isGear5) {
        // Gear 5 white flame hair
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(9, 3, 14, 5);
        ctx.fillRect(7, 5, 4, 3);
        ctx.fillRect(21, 5, 4, 3);
        // Glowing red Nika eyes
        ctx.fillStyle = '#e11d48';
        ctx.fillRect(17, 9, 3, 2);
      } else {
        // Straw Hat
        ctx.fillStyle = '#facc15';
        ctx.fillRect(7, 4, 18, 3);
        ctx.fillRect(10, 2, 12, 3);
        ctx.fillStyle = '#dc2626';
        ctx.fillRect(10, 4, 12, 1);
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(17, 9, 2, 2);
      }
    } else if (avatarId === 'ZORO') {
      // Dark trousers & boots
      ctx.fillStyle = '#111827';
      ctx.fillRect(10, 20, 5, 7);
      ctx.fillRect(17, 20, 5, 7);
      // Green coat & haramaki
      ctx.fillStyle = '#15803d';
      ctx.fillRect(9, 12, 14, 9);
      ctx.fillStyle = '#166534';
      ctx.fillRect(10, 18, 12, 3);
      // Head & green hair
      ctx.fillStyle = '#fed7aa';
      ctx.fillRect(11, 7, 10, 6);
      ctx.fillStyle = '#22c55e';
      ctx.fillRect(10, 4, 12, 4);
      // Three swords + Enma black blade
      ctx.fillStyle = '#090d16';
      ctx.fillRect(22, 9, 9, 2);
      ctx.fillRect(21, 14, 9, 2);
      ctx.fillStyle = '#a855f7';
      ctx.fillRect(23, 8, 7, 1);
    } else if (avatarId === 'LUCCI') {
      const isAwakened = activeFormId === 'form_lucci_awakened';
      const isHybrid = stanceRole === 'HYBRID' || isAwakened;
      if (isHybrid) {
        // Leopard Hybrid / Awakened silhouette
        ctx.fillStyle = isAwakened ? '#d97706' : '#f59e0b';
        ctx.fillRect(7, 9, 18, 15);
        ctx.fillRect(9, 4, 14, 7);
        // Leopard black rosette spots
        ctx.fillStyle = '#090d16';
        ctx.fillRect(9, 11, 2, 2);
        ctx.fillRect(15, 13, 2, 2);
        ctx.fillRect(12, 17, 2, 2);
        ctx.fillRect(19, 15, 2, 2);
        // Tail
        ctx.fillRect(3, 16, 5, 3);
        // Glowing eyes
        ctx.fillStyle = '#ef4444';
        ctx.fillRect(18, 6, 3, 2);
      } else {
        // White CP0 Suit & top hat
        ctx.fillStyle = '#f8fafc';
        ctx.fillRect(9, 13, 14, 13);
        ctx.fillStyle = '#fed7aa';
        ctx.fillRect(11, 7, 10, 6);
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(10, 2, 12, 5);
        ctx.fillRect(8, 6, 16, 2);
      }
    } else if (avatarId === 'KAIDO') {
      if (stanceRole === 'BEAST') {
        // Giant Azure Dragon serpentine coil silhouette
        ctx.fillStyle = activeFormId === 'form_kaido_flame_dragon' ? '#f97316' : '#0284c7';
        ctx.fillRect(5, 16, 22, 9);
        ctx.fillRect(8, 10, 16, 8);
        ctx.fillRect(12, 4, 14, 8);
        // Belly scales
        ctx.fillStyle = '#fde047';
        ctx.fillRect(9, 21, 14, 3);
        // Dragon horns & whiskers
        ctx.fillStyle = '#e2e8f0';
        ctx.fillRect(11, 1, 3, 4);
        ctx.fillRect(18, 1, 3, 4);
        // Glowing dragon eyes & jaws
        ctx.fillStyle = '#ef4444';
        ctx.fillRect(21, 6, 3, 2);
      } else {
        const isHybrid = stanceRole === 'HYBRID';
        // Horned Oni / Hybrid Dragon-Oni
        ctx.fillStyle = isHybrid ? '#0284c7' : '#fed7aa';
        ctx.fillRect(7, 10, 18, 12);
        ctx.fillStyle = '#6d28d9';
        ctx.fillRect(6, 19, 20, 7);
        // Giant horns
        ctx.fillStyle = '#e2e8f0';
        ctx.fillRect(8, 2, 3, 6);
        ctx.fillRect(21, 2, 3, 6);
        // Spiked Kanabo Club
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(23, 8, 7, 14);
      }
    } else if (avatarId === 'KIZARU') {
      // Yellow striped suit & white Admiral coat
      ctx.fillStyle = '#eab308';
      ctx.fillRect(9, 13, 14, 13);
      ctx.fillStyle = '#ca8a04';
      ctx.fillRect(11, 13, 2, 13);
      ctx.fillRect(16, 13, 2, 13);
      // White marine coat shoulders
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(6, 11, 5, 11);
      ctx.fillRect(21, 11, 5, 11);
      // Face & tinted sunglasses
      ctx.fillStyle = '#fed7aa';
      ctx.fillRect(11, 6, 10, 7);
      ctx.fillStyle = '#f59e0b';
      ctx.fillRect(15, 8, 6, 3);
      // Glowing light hand
      ctx.fillStyle = '#fef08a';
      ctx.fillRect(23, 14, 6, 5);
    } else if (avatarId === 'LAW') {
      // Dark coat with gold emblem
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(9, 13, 14, 13);
      ctx.fillStyle = '#facc15';
      ctx.fillRect(13, 16, 6, 5);
      // Face
      ctx.fillStyle = '#fed7aa';
      ctx.fillRect(11, 7, 10, 6);
      // Spotted White Hat
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(9, 3, 14, 5);
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(11, 5, 2, 2);
      ctx.fillRect(17, 4, 2, 2);
      // Kikoku Nodachi sword
      ctx.fillStyle = '#38bdf8';
      ctx.fillRect(22, 6, 8, 2);
      ctx.fillRect(20, 8, 8, 2);
    } else if (avatarId === 'MORGAN') {
      // Marine white coat & navy trousers
      ctx.fillStyle = '#1e3a8a';
      ctx.fillRect(10, 20, 5, 7);
      ctx.fillRect(17, 20, 5, 7);
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(7, 11, 16, 10);
      // Face + Steel Jaw
      ctx.fillStyle = '#fed7aa';
      ctx.fillRect(11, 5, 10, 5);
      ctx.fillStyle = '#94a3b8';
      ctx.fillRect(10, 9, 12, 3);
      // Giant Steel Axe Right Arm
      ctx.fillStyle = '#cbd5e1';
      ctx.fillRect(22, 6, 8, 14);
      ctx.fillStyle = '#475569';
      ctx.fillRect(21, 11, 4, 4);
    } else if (avatarId === 'BLUENO') {
      // CP9 black suit + teal Air Door aura
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(8, 11, 16, 15);
      ctx.fillStyle = '#fed7aa';
      ctx.fillRect(11, 6, 10, 6);
      // Bull-horn dark hairstyle
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(8, 2, 3, 5);
      ctx.fillRect(21, 2, 3, 5);
      ctx.fillRect(11, 4, 10, 2);
      // Air Door glowing portal edge
      ctx.fillStyle = '#2dd4bf';
      ctx.fillRect(23, 8, 6, 14);
    } else if (avatarId === 'KAKU') {
      const isGiraffe = stanceRole === 'HYBRID' || activeFormId === 'form_kaku_giraffe';
      if (isGiraffe) {
        // Yellow Giraffe Hybrid with brown square spots & twin swords
        ctx.fillStyle = '#facc15';
        ctx.fillRect(8, 11, 16, 14);
        ctx.fillRect(12, 3, 8, 10);
        ctx.fillStyle = '#a16207';
        ctx.fillRect(10, 14, 3, 3);
        ctx.fillRect(17, 16, 3, 3);
        // Long square nose
        ctx.fillStyle = '#fde047';
        ctx.fillRect(19, 6, 8, 3);
      } else {
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(9, 12, 14, 14);
        ctx.fillStyle = '#fed7aa';
        ctx.fillRect(11, 6, 10, 6);
        // Signature long square nose & cap
        ctx.fillRect(20, 8, 6, 2);
        ctx.fillStyle = '#f8fafc';
        ctx.fillRect(10, 3, 13, 3);
      }
      // Twin Shirasaya swords
      ctx.fillStyle = '#e2e8f0';
      ctx.fillRect(22, 12, 8, 2);
      ctx.fillRect(22, 16, 8, 2);
    } else if (avatarId === 'FRANKY') {
      const isShogun = activeFormId === 'form_franky_shogun';
      if (isShogun) {
        // Iron Pirate General Franky Mech
        ctx.fillStyle = '#facc15';
        ctx.fillRect(5, 8, 22, 18);
        ctx.fillStyle = '#0284c7';
        ctx.fillRect(8, 11, 16, 12);
        ctx.fillStyle = '#ef4444';
        ctx.fillRect(4, 6, 6, 8);
        ctx.fillRect(22, 6, 6, 8);
        // Franken Sword & Radical Beam port
        ctx.fillStyle = '#38bdf8';
        ctx.fillRect(13, 14, 6, 6);
      } else {
        // Red shirt & oversized blue cyborg forearms
        ctx.fillStyle = '#ef4444';
        ctx.fillRect(9, 12, 14, 10);
        ctx.fillStyle = '#38bdf8';
        ctx.fillRect(4, 13, 5, 8);
        ctx.fillRect(23, 12, 7, 9);
        // Face & Cyan Pompadour hair
        ctx.fillStyle = '#fed7aa';
        ctx.fillRect(11, 6, 10, 6);
        ctx.fillStyle = '#38bdf8';
        ctx.fillRect(10, 2, 13, 4);
      }
    } else if (avatarId === 'KING') {
      const isPtera = stanceRole === 'HYBRID' || activeFormId === 'form_king_pteranodon';
      // Black wings
      ctx.fillStyle = isPtera ? '#7c2d12' : '#090d16';
      ctx.fillRect(3, 8, 6, 14);
      ctx.fillRect(23, 8, 6, 14);
      // Black Lunarian armor
      ctx.fillStyle = '#18181b';
      ctx.fillRect(9, 11, 14, 15);
      // White hair & dark mask
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(11, 3, 10, 4);
      ctx.fillStyle = '#27272a';
      ctx.fillRect(11, 7, 10, 5);
      // Flame sword
      ctx.fillStyle = '#f97316';
      ctx.fillRect(22, 11, 9, 3);
    } else if (avatarId === 'S_HAWK') {
      // Lunarian black wings
      ctx.fillStyle = '#090d16';
      ctx.fillRect(4, 9, 5, 13);
      // Dark coat & brown skin + white hair
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(9, 12, 14, 14);
      ctx.fillStyle = '#b45309';
      ctx.fillRect(11, 6, 10, 6);
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(10, 3, 12, 4);
      // Glowing green Black-Blade Yoru replica
      ctx.fillStyle = '#22c55e';
      ctx.fillRect(21, 5, 9, 3);
      ctx.fillRect(23, 8, 3, 14);
    } else if (avatarId === 'SATURN') {
      // Giant Ushi-Oni (Gyuki) spider legs & horned demon silhouette
      ctx.fillStyle = '#581c87';
      ctx.fillRect(3, 18, 26, 4);
      ctx.fillRect(2, 22, 4, 6);
      ctx.fillRect(9, 22, 4, 6);
      ctx.fillRect(19, 22, 4, 6);
      ctx.fillRect(26, 22, 4, 6);
      ctx.fillStyle = '#3b0764';
      ctx.fillRect(7, 10, 18, 11);
      // Bull horns & white beard
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(6, 2, 4, 7);
      ctx.fillRect(22, 2, 4, 7);
      ctx.fillRect(10, 11, 12, 4);
      // Glowing crimson eyes
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(13, 7, 3, 2);
      ctx.fillRect(18, 7, 3, 2);
    } else if (avatarId === 'LOKI') {
      // Giant Elbaf Prince with horned Viking crown, eye bandage & Ragnir hammer
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(6, 11, 18, 15);
      ctx.fillStyle = '#dc2626';
      ctx.fillRect(5, 12, 4, 13);
      // Face & eye bandage
      ctx.fillStyle = '#fed7aa';
      ctx.fillRect(10, 5, 11, 6);
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(10, 7, 11, 2);
      // Giant golden Viking horns
      ctx.fillStyle = '#facc15';
      ctx.fillRect(5, 1, 4, 7);
      ctx.fillRect(21, 1, 4, 7);
      // Ragnir Thunder Warhammer
      ctx.fillStyle = '#38bdf8';
      ctx.fillRect(22, 5, 9, 8);
      ctx.fillStyle = '#94a3b8';
      ctx.fillRect(25, 13, 3, 12);
    } else if (avatarId === 'BUGGY') {
      // Red pirate captain coat, blue hair, clown red nose & striped shirt
      ctx.fillStyle = '#dc2626';
      ctx.fillRect(7, 12, 18, 13);
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(11, 14, 10, 9);
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(11, 16, 10, 2);
      ctx.fillRect(11, 20, 10, 2);
      // Blue hair & tricorne pirate hat
      ctx.fillStyle = '#38bdf8';
      ctx.fillRect(7, 6, 4, 7);
      ctx.fillRect(21, 6, 4, 7);
      ctx.fillStyle = '#fed7aa';
      ctx.fillRect(11, 7, 10, 6);
      // Signature big red clown nose
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(15, 9, 4, 3);
      ctx.fillStyle = '#b91c1c';
      ctx.fillRect(8, 2, 16, 5);
    } else if (avatarId === 'DON_KRIEG') {
      // Heavy Wootz Steel Golden Armor & purple fur cape + Battle Spear
      ctx.fillStyle = '#eab308';
      ctx.fillRect(6, 10, 20, 16);
      ctx.fillStyle = '#ca8a04';
      ctx.fillRect(9, 13, 14, 10);
      ctx.fillStyle = '#7e22ce';
      ctx.fillRect(4, 11, 4, 13);
      ctx.fillStyle = '#fed7aa';
      ctx.fillRect(11, 5, 10, 6);
      ctx.fillStyle = '#64748b';
      ctx.fillRect(10, 3, 12, 3);
      // Giant Golden Battle Spear
      ctx.fillStyle = '#facc15';
      ctx.fillRect(24, 3, 5, 22);
    } else if (avatarId === 'ARLONG') {
      // Blue Sawshark Fishman + saw-nose + Kiribachi serrated greatsword
      ctx.fillStyle = '#0284c7';
      ctx.fillRect(8, 10, 16, 15);
      ctx.fillStyle = '#facc15';
      ctx.fillRect(9, 14, 14, 7);
      ctx.fillStyle = '#0369a1';
      ctx.fillRect(10, 4, 11, 7);
      // Sawtooth nose
      ctx.fillStyle = '#7dd3fc';
      ctx.fillRect(20, 6, 7, 3);
      // Kiribachi sawblade sword
      ctx.fillStyle = '#e2e8f0';
      ctx.fillRect(23, 8, 6, 16);
      ctx.fillStyle = '#94a3b8';
      ctx.fillRect(27, 10, 3, 2);
      ctx.fillRect(27, 14, 3, 2);
      ctx.fillRect(27, 18, 3, 2);
    } else if (avatarId === 'SMOKER') {
      // White Marine Captain fur-lined coat, white hair, cigars & Seastone Jitte
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(7, 11, 18, 15);
      ctx.fillStyle = '#cbd5e1';
      ctx.fillRect(10, 13, 12, 10);
      ctx.fillStyle = '#fed7aa';
      ctx.fillRect(11, 6, 10, 6);
      ctx.fillStyle = '#e2e8f0';
      ctx.fillRect(10, 2, 12, 5);
      // Seastone Jitte with glowing sea-blue tip
      ctx.fillStyle = '#475569';
      ctx.fillRect(23, 9, 3, 15);
      ctx.fillStyle = '#38bdf8';
      ctx.fillRect(23, 5, 3, 5);
    } else if (avatarId === 'SANJI') {
      const isDiable = activeFormId === 'form_sanji_diable_jambe';
      // Black suit + blonde hair + glowing Diable Jambe flame leg
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(9, 12, 14, 14);
      ctx.fillStyle = '#38bdf8';
      ctx.fillRect(13, 13, 6, 4);
      ctx.fillStyle = '#fed7aa';
      ctx.fillRect(11, 6, 10, 6);
      ctx.fillStyle = '#facc15';
      ctx.fillRect(10, 3, 12, 5);
      if (isDiable) {
        ctx.fillStyle = '#f97316';
        ctx.fillRect(16, 19, 10, 8);
        ctx.fillStyle = '#fde047';
        ctx.fillRect(18, 21, 6, 5);
      }
    } else if (avatarId === 'USOPP') {
      // Brown overalls, yellow bandanna/goggles, long nose & slingshot
      ctx.fillStyle = '#92400e';
      ctx.fillRect(9, 13, 14, 13);
      ctx.fillStyle = '#fed7aa';
      ctx.fillRect(11, 6, 10, 6);
      // Long sniper nose
      ctx.fillRect(20, 8, 6, 2);
      // Curly black hair & sniper goggles
      ctx.fillStyle = '#18181b';
      ctx.fillRect(9, 4, 12, 4);
      ctx.fillStyle = '#38bdf8';
      ctx.fillRect(12, 4, 8, 2);
      // Kabuto / Slingshot
      ctx.fillStyle = '#22c55e';
      ctx.fillRect(23, 10, 6, 9);
    } else if (avatarId === 'NAMI') {
      // Orange hair, blue-white shirt, Clima-Tact lightning staff
      ctx.fillStyle = '#38bdf8';
      ctx.fillRect(10, 13, 12, 7);
      ctx.fillStyle = '#1d4ed8';
      ctx.fillRect(10, 20, 12, 6);
      ctx.fillStyle = '#fed7aa';
      ctx.fillRect(11, 7, 10, 6);
      ctx.fillStyle = '#f97316';
      ctx.fillRect(9, 3, 14, 6);
      // Clima-Tact Staff with lightning spark
      ctx.fillStyle = '#38bdf8';
      ctx.fillRect(22, 6, 3, 18);
      ctx.fillStyle = '#facc15';
      ctx.fillRect(21, 3, 5, 4);
    } else if (avatarId === 'WAPOL') {
      // Wide steel jaw, white hippo fur coat, purple armor & crown
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(6, 11, 20, 15);
      ctx.fillStyle = '#9333ea';
      ctx.fillRect(9, 13, 14, 10);
      ctx.fillStyle = '#fed7aa';
      ctx.fillRect(10, 5, 12, 7);
      // Giant steel lower jaw
      ctx.fillStyle = '#94a3b8';
      ctx.fillRect(9, 9, 14, 4);
      ctx.fillStyle = '#facc15';
      ctx.fillRect(11, 2, 10, 3);
    } else if (avatarId === 'CROCODILE') {
      // Black fur coat, sand swirl, gold hook hand & cigar
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(7, 10, 18, 16);
      ctx.fillStyle = '#d97706';
      ctx.fillRect(11, 13, 10, 11);
      ctx.fillStyle = '#fed7aa';
      ctx.fillRect(11, 5, 10, 6);
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(10, 3, 12, 3);
      // Signature golden poison hook
      ctx.fillStyle = '#facc15';
      ctx.fillRect(23, 12, 6, 6);
      ctx.fillRect(26, 9, 3, 4);
    } else if (avatarId === 'ENEL') {
      const isAmuru = activeFormId === 'form_enel_amuru';
      // Lightning drums ring on back + white bandana + golden staff
      ctx.fillStyle = isAmuru ? '#38bdf8' : '#facc15';
      ctx.fillRect(4, 3, 4, 4);
      ctx.fillRect(24, 3, 4, 4);
      ctx.fillRect(6, 1, 20, 2);
      ctx.fillStyle = isAmuru ? '#7dd3fc' : '#fed7aa';
      ctx.fillRect(10, 7, 12, 13);
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(10, 5, 12, 3);
      ctx.fillStyle = '#fb923c';
      ctx.fillRect(9, 20, 14, 7);
      // Golden Nonosama Bo staff
      ctx.fillStyle = '#facc15';
      ctx.fillRect(24, 8, 3, 18);
    } else if (avatarId === 'MORIA') {
      // Giant purple goth pirate, stitched neck, horns & shadow bats
      ctx.fillStyle = '#18181b';
      ctx.fillRect(6, 11, 20, 16);
      ctx.fillStyle = '#9333ea';
      ctx.fillRect(10, 14, 12, 11);
      ctx.fillStyle = '#e0e7ff';
      ctx.fillRect(10, 5, 12, 7);
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(12, 2, 8, 4);
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(8, 3, 3, 4);
      ctx.fillRect(21, 3, 3, 4);
    } else if (avatarId === 'DOPPELMAN') {
      // Pitch black shadow silhouette with glowing purple eyes & aura
      ctx.fillStyle = '#090d16';
      ctx.fillRect(8, 6, 16, 20);
      ctx.fillStyle = '#a855f7';
      ctx.fillRect(7, 5, 18, 2);
      ctx.fillStyle = '#e879f9';
      ctx.fillRect(11, 10, 3, 3);
      ctx.fillRect(18, 10, 3, 3);
    } else if (avatarId === 'AKAINU') {
      // Admiral red suit, white justice cape, marine cap & magma fist
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(5, 10, 22, 15);
      ctx.fillStyle = '#b91c1c';
      ctx.fillRect(9, 12, 14, 14);
      ctx.fillStyle = '#fed7aa';
      ctx.fillRect(11, 6, 10, 6);
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(9, 3, 14, 4);
      // Molten Magma fist
      ctx.fillStyle = '#f97316';
      ctx.fillRect(22, 13, 8, 8);
      ctx.fillStyle = '#fde047';
      ctx.fillRect(24, 15, 4, 4);
    } else if (avatarId === 'AOKIJI') {
      // Admiral white vest, blue shirt, sleeping mask & ice spear
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(7, 11, 18, 15);
      ctx.fillStyle = '#0284c7';
      ctx.fillRect(11, 13, 10, 12);
      ctx.fillStyle = '#fed7aa';
      ctx.fillRect(11, 6, 10, 6);
      ctx.fillStyle = '#18181b';
      ctx.fillRect(10, 3, 12, 4);
      ctx.fillStyle = '#38bdf8';
      ctx.fillRect(11, 4, 10, 2);
      // Ice Saber
      ctx.fillStyle = '#bae6fd';
      ctx.fillRect(23, 6, 4, 18);
    } else if (avatarId === 'BLACKBEARD') {
      // Broad black captain coat, dark beard, purple darkness hand & white quake orb
      ctx.fillStyle = '#090d16';
      ctx.fillRect(5, 10, 22, 17);
      ctx.fillStyle = '#facc15';
      ctx.fillRect(9, 17, 14, 3);
      ctx.fillStyle = '#d97706';
      ctx.fillRect(11, 5, 10, 7);
      ctx.fillStyle = '#18181b';
      ctx.fillRect(10, 9, 12, 4);
      // Left hand Darkness swirl, Right hand Quake crack sphere
      ctx.fillStyle = '#7e22ce';
      ctx.fillRect(2, 13, 6, 7);
      ctx.fillStyle = '#e0f2fe';
      ctx.fillRect(24, 13, 6, 7);
    } else if (avatarId === 'CHOPPER') {
      const isMonster = activeFormId === 'form_chopper_monster';
      const isGuard = activeFormId === 'form_chopper_guard';
      if (isGuard) {
        // Giant fluffy brown fur ball
        ctx.fillStyle = '#b45309';
        ctx.fillRect(5, 7, 22, 20);
        ctx.fillStyle = '#ec4899';
        ctx.fillRect(10, 4, 12, 5);
      } else {
        // Reindeer body + iconic pink hat with white X + blue nose
        ctx.fillStyle = isMonster ? '#78350f' : '#b45309';
        ctx.fillRect(isMonster ? 6 : 10, 12, isMonster ? 20 : 12, 14);
        ctx.fillStyle = '#d97706';
        ctx.fillRect(11, 7, 10, 6);
        ctx.fillStyle = '#38bdf8';
        ctx.fillRect(15, 10, 2, 2);
        // Pink hat & antlers
        ctx.fillStyle = '#ec4899';
        ctx.fillRect(9, 3, 14, 5);
        ctx.fillStyle = '#f8fafc';
        ctx.fillRect(14, 4, 4, 3);
        ctx.fillStyle = '#78350f';
        ctx.fillRect(6, 2, 3, 5);
        ctx.fillRect(23, 2, 3, 5);
      }
    } else if (avatarId === 'ROBIN') {
      const isDemonio = activeFormId === 'form_robin_demonio';
      // Purple outfit, long dark hair, cherry blossom petals & blooming arms
      ctx.fillStyle = isDemonio ? '#9f1239' : '#7c3aed';
      ctx.fillRect(9, 12, 14, 14);
      ctx.fillStyle = isDemonio ? '#e11d48' : '#fed7aa';
      ctx.fillRect(11, 6, 10, 6);
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(9, 3, 14, 6);
      // Floating blooming flower petals
      ctx.fillStyle = '#f472b6';
      ctx.fillRect(4, 9, 4, 4);
      ctx.fillRect(24, 11, 4, 4);
      ctx.fillRect(22, 5, 3, 3);
    } else if (avatarId === 'BROOK') {
      // Giant black afro, white skull, black gentleman suit & Soul Solid cane sword
      ctx.fillStyle = '#090d16';
      ctx.fillRect(8, 1, 16, 8);
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(11, 8, 10, 6);
      ctx.fillStyle = '#18181b';
      ctx.fillRect(13, 10, 2, 2);
      ctx.fillRect(17, 10, 2, 2);
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(10, 14, 12, 13);
      // Frozen Soul Solid blade
      ctx.fillStyle = '#38bdf8';
      ctx.fillRect(23, 8, 3, 16);
    } else if (avatarId === 'MARCO') {
      // Blonde pineapple hair, purple jacket & glowing cyan Phoenix flame wings
      ctx.fillStyle = '#0ea5e9';
      ctx.fillRect(2, 9, 7, 13);
      ctx.fillRect(23, 9, 7, 13);
      ctx.fillStyle = '#38bdf8';
      ctx.fillRect(4, 11, 4, 8);
      ctx.fillRect(24, 11, 4, 8);
      ctx.fillStyle = '#7e22ce';
      ctx.fillRect(9, 12, 14, 14);
      ctx.fillStyle = '#fed7aa';
      ctx.fillRect(11, 6, 10, 6);
      ctx.fillStyle = '#facc15';
      ctx.fillRect(11, 2, 10, 5);
    } else if (avatarId === 'HODY_JONES') {
      // Great White Shark Fishman, white rampage hair, red eyes, dorsal fin blade
      ctx.fillStyle = '#475569';
      ctx.fillRect(6, 10, 20, 16);
      ctx.fillStyle = '#64748b';
      ctx.fillRect(10, 5, 12, 7);
      // White Steroid Overdrive spiky hair & crimson eyes
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(8, 2, 16, 4);
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(12, 7, 3, 2);
      ctx.fillRect(17, 7, 3, 2);
      // Kirisame Shark Fin Blade
      ctx.fillStyle = '#cbd5e1';
      ctx.fillRect(24, 6, 5, 14);
    } else if (avatarId === 'DOFLAMINGO') {
      // Iconic pink flamingo feather coat, blonde hair, crimson sunglasses & glowing string threads
      ctx.fillStyle = '#ec4899';
      ctx.fillRect(4, 10, 24, 16);
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(11, 13, 10, 12);
      ctx.fillStyle = '#fed7aa';
      ctx.fillRect(11, 6, 10, 6);
      ctx.fillStyle = '#facc15';
      ctx.fillRect(10, 3, 12, 4);
      // Pointed red sunglasses
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(10, 7, 12, 3);
      // String threads
      ctx.fillStyle = '#fda4af';
      ctx.fillRect(24, 7, 6, 2);
      ctx.fillRect(24, 13, 6, 2);
    } else if (avatarId === 'KATAKURI') {
      // Tall dark biker vest, crimson hair, white scarf covering mouth, Mogura trident & floating Mochi Donuts
      ctx.fillStyle = '#18181b';
      ctx.fillRect(7, 11, 18, 16);
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(9, 9, 14, 5);
      ctx.fillStyle = '#fed7aa';
      ctx.fillRect(11, 5, 10, 5);
      ctx.fillStyle = '#be185d';
      ctx.fillRect(10, 2, 12, 4);
      // Mogura Trident
      ctx.fillStyle = '#cbd5e1';
      ctx.fillRect(24, 3, 3, 22);
      ctx.fillRect(22, 3, 7, 3);
      // Floating Mochi Donut Ring
      ctx.fillStyle = '#e879f9';
      ctx.fillRect(2, 6, 5, 5);
    } else if (avatarId === 'JINBE') {
      // Whale Shark Fishman blue skin, orange traditional kimono, black topknot & water-karate aura
      ctx.fillStyle = '#f97316';
      ctx.fillRect(5, 11, 22, 16);
      ctx.fillStyle = '#0284c7';
      ctx.fillRect(10, 5, 12, 8);
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(12, 2, 8, 4);
      // Sun Pirates emblem & Water Karate aura fist
      ctx.fillStyle = '#ef4444';
      ctx.fillRect(14, 15, 4, 4);
      ctx.fillStyle = '#38bdf8';
      ctx.fillRect(23, 13, 6, 6);
    } else if (avatarId === 'MAGELLAN') {
      // Impel Down Warden Magellan: horned dark coat, bat wings, purple Hydra venom & crimson Venom Demon glow
      ctx.fillStyle = '#1e1b4b';
      ctx.fillRect(4, 10, 24, 18);
      // Bat-like warden wings
      ctx.fillStyle = '#312e81';
      ctx.fillRect(1, 11, 4, 11);
      ctx.fillRect(27, 11, 4, 11);
      // Warden coat collar & gold epaulettes
      ctx.fillStyle = '#facc15';
      ctx.fillRect(6, 11, 4, 3);
      ctx.fillRect(22, 11, 4, 3);
      // Face & demon horns
      ctx.fillStyle = '#fde68a';
      ctx.fillRect(11, 6, 10, 7);
      ctx.fillStyle = '#7e22ce';
      ctx.fillRect(8, 2, 3, 5);
      ctx.fillRect(21, 2, 3, 5);
      // Venom Hydra / Venom Demon droplets
      ctx.fillStyle = activeFormId === 'form_magellan_venom_demon' ? '#dc2626' : '#a855f7';
      ctx.fillRect(2, 6, 4, 4);
      ctx.fillRect(26, 6, 4, 4);
      ctx.fillRect(13, 15, 6, 5);
    } else {
      // Fallback generic Phase 1 shapes
      const { primary, secondary, accent, shape } = unit.palette;
      ctx.fillStyle = primary;
      if (shape === 'HEX_KNIGHT') {
        ctx.fillRect(8, 8, 16, 16);
        ctx.fillStyle = secondary;
        ctx.fillRect(10, 6, 12, 4);
        ctx.fillStyle = accent;
        ctx.fillRect(20, 12, 8, 4);
      } else if (shape === 'CRESCENT_MAGE') {
        ctx.fillRect(9, 7, 14, 18);
        ctx.fillStyle = secondary;
        ctx.fillRect(7, 10, 4, 12);
        ctx.fillStyle = accent;
        ctx.fillRect(19, 10, 6, 6);
      } else if (shape === 'BLADE_RUNNER') {
        ctx.fillRect(10, 9, 12, 15);
        ctx.fillStyle = secondary;
        ctx.fillRect(14, 6, 10, 4);
        ctx.fillStyle = accent;
        ctx.fillRect(22, 13, 8, 3);
      } else if (shape === 'GOLEM_TITAN') {
        ctx.fillRect(6, 6, 20, 20);
        ctx.fillStyle = secondary;
        ctx.fillRect(8, 8, 16, 6);
        ctx.fillStyle = accent;
        ctx.fillRect(18, 11, 6, 6);
      } else if (shape === 'WING_DUELIST') {
        ctx.fillRect(9, 8, 14, 16);
        ctx.fillStyle = secondary;
        ctx.fillRect(5, 7, 4, 10);
        ctx.fillRect(23, 11, 6, 3);
      } else {
        ctx.fillRect(8, 7, 16, 17);
        ctx.fillStyle = secondary;
        ctx.fillRect(11, 10, 10, 10);
        ctx.fillStyle = accent;
        ctx.fillRect(14, 13, 6, 4);
      }
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(17, 11, 6, 4);
      ctx.fillStyle = '#f8fafc';
      ctx.fillRect(19, 12, 3, 2);
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
