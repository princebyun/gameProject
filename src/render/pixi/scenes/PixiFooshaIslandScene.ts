import { Container, Graphics, Sprite, Text, Texture } from 'pixi.js';
import type { IslandExplorationRuntime, IslandStepOutput } from '../../../core/rpg/episodeEngine';
import type { GameDataRegistry } from '../../../core/types/dataSchemas';
import type { IslandMapDefinition, RpgCampaignState, RpgDataRegistry } from '../../../core/types/rpgSchemas';
import type { Disposable } from '../../../core/types/disposable';
import { STANDARD_SPRITE_ANIM_STATES, type SpriteAnimState } from '../../../data/assets/types';
import { computeIslandCameraTransform } from '../../rpg/islandCamera';
import { getChestWorldCenter } from '../../../core/rpg/islandLivingVillage';
import type { WorldMarker } from '../../../story/worldMarkerSystem';
import type { VisualPolishConfig } from '../../backend/renderBackend';
import type { ViewportMetrics } from '../../viewport/responsiveViewportManager';
import type { PixiStageHost } from '../PixiStageHost';
import {
  createMissingProArtPlaceholder,
  type LoadedProSpriteAtlas
} from '../ProAssetLoader';
import { AtmosphereColorGradingEffect } from '../shaders/AtmosphereColorGradingFilter';
import {
  computeSunShadowForTimeOfDay,
  DynamicLightingLayer,
  type DynamicPointLightInput
} from '../shaders/DynamicLightingLayer';
import { GodRaysAndParticlesLayer } from '../shaders/GodRaysAndParticlesLayer';
import { SelectiveBloomEffect } from '../shaders/SelectiveBloomFilter';
import {
  WaterReflectionPipeline,
  type ReflectedWorldEntry
} from '../shaders/WaterReflectionPipeline';
import { TiledMapLoader, type TiledMapRuntime } from '../tiled/TiledMapLoader';

interface AnimatedActorVisual {
  root: Container;
  shadow: Graphics;
  sprite: Sprite | null;
  placeholder: Container | null;
  facingX: number;
  lastKey: string;
}

const FOOSHA_WATERLINE_WORLD_Y = 928;

export class PixiFooshaIslandScene implements Disposable {
  public readonly root = new Container();

  private readonly waterWorldContainer = new Container();
  private readonly landWorldContainer = new Container();
  private readonly shadowLayer = new Container();
  private readonly entitySortLayer = new Container();
  private readonly emissiveLayer = new Container();
  private readonly lighting: DynamicLightingLayer;
  private readonly bloom: SelectiveBloomEffect;
  private readonly waterReflection: WaterReflectionPipeline;
  private readonly colorGrading: AtmosphereColorGradingEffect;
  private readonly godRays: GodRaysAndParticlesLayer;

  private mapRuntime: TiledMapRuntime | null = null;
  private mapLoadingStarted = false;
  private readonly actorCache = new Map<string, AnimatedActorVisual>();
  private readonly chestCache = new Map<string, Container>();
  private readonly markerCache = new Map<string, Container>();
  private readonly staticEmissiveSprites: Graphics[] = [];
  private readonly scratchLights: DynamicPointLightInput[] = [];
  private readonly scratchReflections: ReflectedWorldEntry[] = [];
  private emissivePopulated = false;
  private elapsedSec = 0;
  private disposed = false;

  constructor(private readonly host: PixiStageHost) {
    this.root.label = 'pixi_foosha_vertical_slice';

    this.waterWorldContainer.label = 'foosha_water_world';
    this.landWorldContainer.label = 'foosha_land_world';
    this.shadowLayer.label = 'foosha_dynamic_shadows';
    this.entitySortLayer.label = 'foosha_ysort_entities';
    this.entitySortLayer.sortableChildren = true;
    this.emissiveLayer.label = 'foosha_emissive_bloom';

    this.lighting = new DynamicLightingLayer(host);
    this.bloom = new SelectiveBloomEffect();
    this.waterReflection = new WaterReflectionPipeline(host);
    this.colorGrading = new AtmosphereColorGradingEffect();
    this.godRays = new GodRaysAndParticlesLayer();

    this.emissiveLayer.filters = [this.bloom.filter];

    this.root.addChild(this.waterWorldContainer);
    this.root.addChild(this.waterReflection.reflectionSprite);
    this.root.addChild(this.landWorldContainer);
    this.landWorldContainer.addChild(this.shadowLayer);
    this.landWorldContainer.addChild(this.entitySortLayer);
    this.landWorldContainer.addChild(this.emissiveLayer);

    this.root.addChild(this.lighting.displaySprite);
    this.root.addChild(this.godRays.root);
    this.root.filters = [this.colorGrading.filter];
  }

  public isMapLoaded(): boolean {
    return this.mapRuntime !== null;
  }

  public async preload(): Promise<void> {
    if (this.mapRuntime || this.mapLoadingStarted || this.disposed) return;
    this.mapLoadingStarted = true;
    const mapEntry = this.host.loader.manifest.maps['foosha_shells'];
    if (!mapEntry) return;

    await this.host.loader.preloadVerticalSliceCore();
    const tiledLoader = new TiledMapLoader();
    const runtime = await tiledLoader.loadFromManifest(
      mapEntry.tmj,
      mapEntry.tilesets,
      this.host.loader,
      mapEntry.pixelScale
    );
    if (!runtime || this.disposed) {
      runtime?.dispose();
      return;
    }

    this.mapRuntime = runtime;
    this.waterWorldContainer.addChild(runtime.waterContainer);
    this.landWorldContainer.addChildAt(runtime.groundContainer, 0);
    this.landWorldContainer.addChildAt(runtime.wallsContainer, 1);
    // Keep shadowLayer(2), entitySortLayer(3), then overheadContainer(4), emissiveLayer(5)
    const overheadIdx = Math.min(4, this.landWorldContainer.children.length - 1);
    this.landWorldContainer.addChildAt(runtime.overheadContainer, overheadIdx);
    this.populateStaticEmissiveHalos();
  }

  private populateStaticEmissiveHalos(): void {
    if (this.emissivePopulated || !this.mapRuntime) return;
    this.emissivePopulated = true;
    for (const light of this.mapRuntime.parsed.lights) {
      const halo = new Graphics();
      halo.circle(0, 0, Math.max(8, light.radiusPx * 0.14));
      halo.fill({ color: light.colorInt, alpha: 0.72 });
      halo.position.set(Math.round(light.x), Math.round(light.y));
      halo.blendMode = 'add';
      this.emissiveLayer.addChild(halo);
      this.staticEmissiveSprites.push(halo);
    }
  }

  private getOrCreateActorVisual(
    actorId: string,
    spriteKey: string,
    atlas: LoadedProSpriteAtlas | null,
    targetHeightPx: number,
    labelText?: string
  ): AnimatedActorVisual {
    const existing = this.actorCache.get(actorId);
    const cacheKey = `${spriteKey}_${atlas ? 'PRO' : 'MISSING'}`;
    if (existing && existing.lastKey === cacheKey) {
      return existing;
    }
    if (existing) {
      this.entitySortLayer.removeChild(existing.root);
      this.shadowLayer.removeChild(existing.shadow);
      existing.root.destroy({ children: true, texture: false });
      existing.shadow.destroy();
      this.actorCache.delete(actorId);
    }

    const root = new Container();
    root.label = `actor_${actorId}`;

    const shadow = new Graphics();
    shadow.ellipse(0, 0, 12, 4.5);
    shadow.fill({ color: 0x090d16, alpha: 0.36 });
    this.shadowLayer.addChild(shadow);

    let sprite: Sprite | null = null;
    let placeholder: Container | null = null;
    if (atlas) {
      const idleFrames = atlas.clipTextures.IDLE;
      const firstTex = idleFrames[0] ?? Texture.EMPTY;
      sprite = new Sprite(firstTex);
      sprite.anchor.set(atlas.parsed.anchor.x, atlas.parsed.anchor.y);
      const scale = targetHeightPx / Math.max(24, firstTex.height);
      sprite.scale.set(scale, scale);
      root.addChild(sprite);
    } else {
      const isDev = typeof import.meta !== 'undefined' && Boolean((import.meta as { env?: { DEV?: boolean } }).env?.DEV);
      placeholder = createMissingProArtPlaceholder(spriteKey, 28, Math.round(targetHeightPx * 0.9), isDev);
      root.addChild(placeholder);
    }

    if (labelText) {
      const lbl = new Text({
        text: labelText,
        style: {
          fontFamily: 'sans-serif',
          fontSize: 9,
          fontWeight: 'bold',
          fill: 0xf8fafc,
          stroke: { color: 0x090d16, width: 2.5 }
        }
      });
      lbl.anchor.set(0.5, 1);
      lbl.position.set(0, -targetHeightPx - 4);
      root.addChild(lbl);
    }

    this.entitySortLayer.addChild(root);
    const vis: AnimatedActorVisual = {
      root,
      shadow,
      sprite,
      placeholder,
      facingX: 1,
      lastKey: cacheKey
    };
    this.actorCache.set(actorId, vis);
    return vis;
  }

  private syncActorPose(
    vis: AnimatedActorVisual,
    atlas: LoadedProSpriteAtlas | null,
    state: SpriteAnimState,
    worldX: number,
    worldY: number,
    facingX: number,
    targetHeightPx: number,
    shadowTransform: ReturnType<typeof computeSunShadowForTimeOfDay>,
    timeSec: number,
    allowWaterReflection: boolean
  ): void {
    const rx = Math.round(worldX);
    const ry = Math.round(worldY);
    vis.root.position.set(rx, ry);
    vis.root.zIndex = ry;
    vis.facingX = facingX;

    vis.shadow.position.set(
      Math.round(rx + shadowTransform.offsetX),
      Math.round(ry + shadowTransform.offsetY)
    );
    vis.shadow.skew.set(shadowTransform.skewX, 0);
    vis.shadow.scale.set(1, shadowTransform.scaleY * 2.2);
    vis.shadow.alpha = shadowTransform.alpha;

    if (vis.sprite && atlas) {
      const safeState = STANDARD_SPRITE_ANIM_STATES.includes(state) ? state : 'IDLE';
      const frames = atlas.clipTextures[safeState];
      const fps = Math.max(1, atlas.clipFps[safeState]);
      const idx = frames.length > 0 ? Math.floor(timeSec * fps) % frames.length : 0;
      const tex = frames[idx] ?? frames[0];
      if (tex) {
        vis.sprite.texture = tex;
        const scale = targetHeightPx / Math.max(24, tex.height);
        vis.sprite.scale.set(facingX < 0 ? -scale : scale, scale);
        if (allowWaterReflection && worldY >= FOOSHA_WATERLINE_WORLD_Y - 170) {
          this.scratchReflections.push({
            texture: tex,
            worldX,
            worldY,
            scaleX: facingX < 0 ? -scale : scale,
            scaleY: scale
          });
        }
      }
    }
  }

  public render(
    campaign: RpgCampaignState,
    runtime: IslandExplorationRuntime,
    _stepInfo: IslandStepOutput,
    rpgRegistry: RpgDataRegistry,
    _gameRegistry: GameDataRegistry,
    tick: number,
    viewport: ViewportMetrics,
    worldMarkers: readonly WorldMarker[] | undefined,
    highlightGoldMarker: boolean,
    polish: VisualPolishConfig,
    dtSec = 1 / 60
  ): void {
    if (this.disposed) return;
    this.elapsedSec += Math.min(0.05, Math.max(0.001, dtSec));

    if (!this.mapRuntime && !this.mapLoadingStarted) {
      void this.preload();
    }

    const islandMap: IslandMapDefinition | undefined = rpgRegistry.islands[runtime.islandId];
    if (!islandMap) return;

    const cam = computeIslandCameraTransform(islandMap, runtime.playerPos, viewport);
    const worldTransX = Math.round(cam.offsetX - cam.camX);
    const worldTransY = Math.round(-cam.camY);

    this.waterWorldContainer.position.set(worldTransX, worldTransY);
    this.landWorldContainer.position.set(worldTransX, worldTransY);

    let visibleChunks = 0;
    if (this.mapRuntime) {
      this.mapRuntime.stepAnimations(dtSec * 1000);
      this.mapRuntime.updateOverheadFade(runtime.playerPos.x, runtime.playerPos.y, dtSec);
      visibleChunks = this.mapRuntime.updateViewportCulling(
        cam.camX - cam.offsetX,
        cam.camY,
        viewport.viewWidth,
        viewport.viewHeight
      );
    }

    const shadowTransform = computeSunShadowForTimeOfDay(polish);
    this.scratchReflections.length = 0;

    // 1. Docked sailboat reflection at pier (matches foosha_village dock coords)
    const luffyAtlas = this.host.loader.getLoadedSpriteAtlasSync('luffy_base');
    const luffyVis = this.getOrCreateActorVisual('player_luffy', 'luffy_base', luffyAtlas, 52);
    const cosH = Math.cos(runtime.playerHeadingRad);
    const luffyFacing = cosH < -0.15 ? -1 : cosH > 0.15 ? 1 : luffyVis.facingX;
    this.syncActorPose(
      luffyVis,
      luffyAtlas,
      runtime.isMoving ? 'MOVE' : 'IDLE',
      runtime.playerPos.x,
      runtime.playerPos.y,
      luffyFacing,
      52,
      shadowTransform,
      this.elapsedSec,
      true
    );

    // 2. Follower crew (Zoro after recruited)
    const followerId = campaign.recruitedUnitIds.find((id) => id !== 'luffy');
    if (followerId) {
      const followPos = {
        x: runtime.playerPos.x - Math.cos(runtime.playerHeadingRad) * 28,
        y: runtime.playerPos.y - Math.sin(runtime.playerHeadingRad) * 22 + 4
      };
      const followKey = `${followerId}_base`;
      const followAtlas = this.host.loader.getLoadedSpriteAtlasSync(followKey);
      const followVis = this.getOrCreateActorVisual(`follower_${followerId}`, followKey, followAtlas, 52);
      this.syncActorPose(
        followVis,
        followAtlas,
        runtime.isMoving ? 'MOVE' : 'IDLE',
        followPos.x,
        followPos.y,
        runtime.playerPos.x < followPos.x ? -1 : 1,
        52,
        shadowTransform,
        this.elapsedSec,
        true
      );
    }

    // 3. NPCs (Zoro uses pro atlas; others use crisp neutral silhouettes with zero procedural dot baking)
    for (const npc of islandMap.npcs) {
      if (npc.npcId === 'npc_zoro_bound' && campaign.recruitedUnitIds.includes('zoro')) {
        const zOld = this.actorCache.get(`npc_${npc.npcId}`);
        if (zOld) zOld.root.visible = false;
        continue;
      }
      const npcRt = runtime.npcStates?.[npc.npcId];
      const pos = npcRt?.pos ?? npc.pos;
      const facing = npcRt?.facing ?? npc.facing;
      const fx = facing === 'left' ? -1 : 1;
      const isZoro = npc.npcId === 'npc_zoro_bound';
      const npcKey = isZoro ? 'zoro_base' : `${npc.npcId}_base`;
      const npcAtlas = isZoro ? this.host.loader.getLoadedSpriteAtlasSync('zoro_base') : null;
      const nVis = this.getOrCreateActorVisual(`npc_${npc.npcId}`, npcKey, npcAtlas, 48, npc.name);
      nVis.root.visible = true;
      this.syncActorPose(
        nVis,
        npcAtlas,
        npcRt?.isMoving ? 'MOVE' : 'IDLE',
        pos.x,
        pos.y,
        fx,
        48,
        shadowTransform,
        this.elapsedSec,
        true
      );
    }

    // 4. Hidden Chests
    for (const chest of islandMap.chests ?? []) {
      const opened = (campaign.openedChestIds ?? []).includes(chest.chestId);
      let cBox = this.chestCache.get(chest.chestId);
      if (!cBox) {
        cBox = new Container();
        const pos = getChestWorldCenter(chest, islandMap.tileMap?.tileSize ?? 32);
        cBox.position.set(Math.round(pos.x), Math.round(pos.y));
        cBox.zIndex = Math.round(pos.y);

        const body = new Graphics();
        const col = chest.rarity === 'gold' ? 0xfacc15 : chest.rarity === 'silver' ? 0x94a3b8 : 0xb45309;
        body.roundRect(-10, -14, 20, 14, 2);
        body.fill({ color: col, alpha: 1 });
        body.stroke({ color: 0x0f172a, width: 1.5 });
        body.rect(-3, -9, 6, 4);
        body.fill({ color: 0xfef08a });
        cBox.addChild(body);
        this.entitySortLayer.addChild(cBox);
        this.chestCache.set(chest.chestId, cBox);
      }
      cBox.alpha = opened ? 0.45 : 1;
    }

    // 5. Story Beacons (gold/blue/silver)
    const activeMarkerIds = new Set<string>();
    if (worldMarkers) {
      for (const m of worldMarkers) {
        activeMarkerIds.add(m.id);
        let mNode = this.markerCache.get(m.id);
        if (!mNode) {
          mNode = new Container();
          const col = m.kind === 'MAIN' ? 0xfacc15 : m.kind === 'SIDE' ? 0x38bdf8 : 0xfb7185;
          const g = new Graphics();
          g.poly([0, -24, 6, -16, 0, -8, -6, -16]);
          g.fill({ color: col, alpha: 0.92 });
          g.stroke({ color: 0x090d16, width: 1.2 });
          mNode.addChild(g);
          this.entitySortLayer.addChild(mNode);
          this.markerCache.set(m.id, mNode);
        }
        mNode.visible = true;
        const bob = Math.sin(tick * 0.14) * (highlightGoldMarker && m.kind === 'MAIN' ? 5 : 2.5);
        mNode.position.set(Math.round(m.x), Math.round(m.y - 26 + bob));
        mNode.zIndex = Math.round(m.y + 4);
      }
    }
    for (const [markerId, node] of this.markerCache.entries()) {
      if (!activeMarkerIds.has(markerId)) {
        node.visible = false;
      }
    }

    // 6. Real-Time Water Reflection Pass
    this.waterReflection.renderPass(
      viewport.viewWidth,
      viewport.viewHeight,
      worldTransX,
      worldTransY,
      this.elapsedSec,
      FOOSHA_WATERLINE_WORLD_Y,
      this.scratchReflections,
      polish
    );

    // 7. Dynamic 2D Lighting (Tiled point lights converted to screen coords + player warm lantern aura)
    this.scratchLights.length = 0;
    if (this.mapRuntime) {
      for (const l of this.mapRuntime.parsed.lights) {
        this.scratchLights.push({
          x: l.x + worldTransX,
          y: l.y + worldTransY,
          radiusPx: l.radiusPx,
          colorInt: l.colorInt,
          intensity: l.intensity,
          flickerSpeed: l.flickerSpeed,
          flickerAmp: l.flickerAmp,
          phaseOffset: l.id * 0.9
        });
      }
    }
    this.scratchLights.push({
      x: runtime.playerPos.x + worldTransX,
      y: runtime.playerPos.y - 18 + worldTransY,
      radiusPx: 92,
      colorInt: 0xfef3c7,
      intensity: 0.72,
      flickerSpeed: 2.0,
      flickerAmp: 0.04,
      phaseOffset: 0
    });
    this.lighting.renderPass(
      viewport.viewWidth,
      viewport.viewHeight,
      this.elapsedSec,
      this.scratchLights,
      polish
    );

    // 8. Selective Bloom, God Rays / Particles & Color Grading
    const nightBoost = polish.timeOfDay === 'NIGHT' ? 0.25 : polish.timeOfDay === 'SUNSET' ? 0.15 : 0;
    for (const h of this.staticEmissiveSprites) {
      h.alpha = polish.timeOfDay === 'NIGHT' ? 0.88 : polish.timeOfDay === 'SUNSET' ? 0.65 : 0.28;
    }
    this.bloom.sync(
      polish,
      viewport.viewWidth,
      viewport.viewHeight,
      0.18,
      0.95 + nightBoost,
      0
    );
    this.godRays.update(dtSec, this.elapsedSec, viewport.viewWidth, viewport.viewHeight, polish);
    this.colorGrading.sync(polish);

    this.host.setSceneTelemetryTag('FOOSHA_TMJ_WEBGL2', visibleChunks + this.actorCache.size + 4);
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.emissiveLayer.filters = [];
    this.root.filters = [];
    this.root.removeFromParent();
    this.waterReflection.reflectionSprite.removeFromParent();
    this.lighting.displaySprite.removeFromParent();
    this.godRays.root.removeFromParent();

    this.lighting.dispose();
    this.bloom.dispose();
    this.waterReflection.dispose();
    this.colorGrading.dispose();
    this.godRays.dispose();

    this.mapRuntime?.dispose();
    this.mapRuntime = null;
    this.actorCache.clear();
    this.chestCache.clear();
    this.markerCache.clear();
    this.staticEmissiveSprites.length = 0;

    this.root.destroy({ children: true, texture: false });
  }
}
