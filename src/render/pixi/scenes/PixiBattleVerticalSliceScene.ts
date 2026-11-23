import { Container, Graphics, Sprite, Texture } from 'pixi.js';
import { FIXED_DT } from '../../../core/constants';
import type { BattleWorldState, UnitRuntimeState } from '../../../core/types/battleState';
import type { GameDataRegistry } from '../../../core/types/dataSchemas';
import type { Disposable } from '../../../core/types/disposable';
import { resolveBiomeForArena, type AssetManifestRegistry } from '../../../data/assets/assetManifestRegistry';
import { resolveProSpriteManifestEntry } from '../../../data/assets/proAssetManifest';
import { STANDARD_SPRITE_ANIM_STATES, type SpriteAnimState } from '../../../data/assets/types';
import { computeArenaCameraOffset } from '../../battleRenderer';
import { lerpVecInto } from '../../pools/renderScratchPools';
import { SpriteAnimationController } from '../../sprite/spriteAnimationController';
import type { RenderAccessibilitySettings } from '../../canvasRenderer';
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
import { ShockwaveDistortionEffect } from '../shaders/ShockwaveDistortionFilter';
import {
  WaterReflectionPipeline,
  type ReflectedWorldEntry
} from '../shaders/WaterReflectionPipeline';
import { BattleBanterOverlay } from './BattleBanterOverlay';
import { PixiBattleEffectsHelper } from './PixiBattleEffectsHelper';
import { PixiParryAndGimmickFeedback } from './PixiParryAndGimmickFeedback';

interface BattleFighterVisual {
  root: Container;
  shadow: Graphics;
  sprite: Sprite | null;
  placeholder: Container | null;
  lastKey: string;
}

const PARALLAX_FACTORS = [0.06, 0.18, 0.48, 1.0] as const;

export class PixiBattleVerticalSliceScene implements Disposable {
  public readonly root = new Container();

  private readonly backdropContainer = new Container();
  private readonly backdropLayerSprites: Sprite[] = [];
  private readonly arenaWorldContainer = new Container();
  private readonly shadowLayer = new Container();
  private readonly floorHazardsGfx = new Graphics();
  private readonly ysortLayer = new Container();
  private readonly emissiveLayer = new Container();
  private readonly emissiveGfx = new Graphics();

  private readonly lighting: DynamicLightingLayer;
  private readonly bloom: SelectiveBloomEffect;
  private readonly colorGrading: AtmosphereColorGradingEffect;
  private readonly godRays: GodRaysAndParticlesLayer;
  private readonly shockwave: ShockwaveDistortionEffect;
  private readonly fxHelper: PixiBattleEffectsHelper;
  private readonly parryFeedback: PixiParryAndGimmickFeedback;
  private readonly banterOverlay: BattleBanterOverlay;
  private waterReflection: WaterReflectionPipeline | null = null;

  private readonly fighterVisuals = new Map<string, BattleFighterVisual>();
  private readonly scratchLights: DynamicPointLightInput[] = [];
  private readonly scratchReflections: ReflectedWorldEntry[] = [];
  private readonly animController = new SpriteAnimationController();
  private readonly scratchPos = { x: 0, y: 0 };

  private activeBattleBundleName = 'battle_east_blue_harbor';
  private backdropLoaded = false;
  private backdropLoading = false;
  private elapsedSec = 0;
  private bloomSpike = 0;
  private visualHitstopFrames = 0;
  private disposed = false;

  constructor(private readonly host: PixiStageHost) {
    this.root.label = 'pixi_battle_vertical_slice';

    this.backdropContainer.label = 'battle_4layer_parallax';
    this.arenaWorldContainer.label = 'battle_arena_world';
    this.shadowLayer.label = 'battle_dynamic_shadows';
    this.ysortLayer.label = 'battle_ysort_units';
    this.ysortLayer.sortableChildren = true;
    this.emissiveLayer.label = 'battle_emissive_bloom';

    this.lighting = new DynamicLightingLayer(host);
    this.bloom = new SelectiveBloomEffect();
    this.colorGrading = new AtmosphereColorGradingEffect();
    this.godRays = new GodRaysAndParticlesLayer();
    this.shockwave = new ShockwaveDistortionEffect();
    this.fxHelper = new PixiBattleEffectsHelper(host);
    this.parryFeedback = new PixiParryAndGimmickFeedback();
    this.banterOverlay = new BattleBanterOverlay(host);

    this.emissiveLayer.filters = [this.bloom.filter];
    this.emissiveLayer.addChild(this.emissiveGfx);
    this.emissiveLayer.addChild(this.fxHelper.worldAssistRoot);

    this.arenaWorldContainer.addChild(this.shadowLayer);
    this.arenaWorldContainer.addChild(this.floorHazardsGfx);
    this.arenaWorldContainer.addChild(this.ysortLayer);
    this.arenaWorldContainer.addChild(this.emissiveLayer);
    this.arenaWorldContainer.addChild(this.parryFeedback.worldOverlayRoot);

    this.root.addChild(this.backdropContainer);
    this.root.addChild(this.arenaWorldContainer);
    this.root.addChild(this.lighting.displaySprite);
    this.root.addChild(this.godRays.root);
    this.root.addChild(this.banterOverlay.root);
    this.root.addChild(this.fxHelper.cutinOverlay);

    this.root.filters = [this.shockwave.filter, this.colorGrading.filter];
  }

  public get isVisualHitstopActive(): boolean {
    return this.visualHitstopFrames > 0;
  }

  public get effectsHelper(): PixiBattleEffectsHelper {
    return this.fxHelper;
  }

  public get banter(): BattleBanterOverlay {
    return this.banterOverlay;
  }

  public async preload(battleBundleName = 'battle_east_blue_harbor'): Promise<void> {
    if (this.disposed) return;
    if (this.backdropLoaded && this.activeBattleBundleName === battleBundleName) return;
    if (this.backdropLoading && this.activeBattleBundleName === battleBundleName) return;

    this.activeBattleBundleName = battleBundleName;
    this.backdropLoaded = false;
    this.backdropLoading = true;
    for (const sp of this.backdropLayerSprites) {
      sp.removeFromParent();
      sp.destroy({ texture: false });
    }
    this.backdropLayerSprites.length = 0;

    await this.host.bundleManager.loadSceneBundles([battleBundleName]);

    const bgEntry =
      this.host.loader.manifest.backgrounds[battleBundleName] ??
      this.host.loader.manifest.backgrounds['east_blue_harbor'];
    if (bgEntry && !this.disposed) {
      const textures = await this.host.loader.loadBackgroundLayers(bgEntry);
      if (textures && !this.disposed) {
        for (let i = 0; i < textures.length; i++) {
          const sp = new Sprite(textures[i] ?? Texture.EMPTY);
          sp.label = `parallax_layer_${i}`;
          this.backdropContainer.addChild(sp);
          this.backdropLayerSprites.push(sp);
        }
        this.backdropLoaded = true;
      }
    }
    this.backdropLoading = false;
  }

  private getOrCreateFighterVisual(
    unit: UnitRuntimeState,
    spriteKey: string,
    atlas: LoadedProSpriteAtlas | null,
    targetHeightPx: number
  ): BattleFighterVisual {
    const existing = this.fighterVisuals.get(unit.instanceId);
    const cacheKey = `${spriteKey}_${atlas ? 'PRO' : 'MISSING'}`;
    if (existing && existing.lastKey === cacheKey) {
      return existing;
    }
    if (existing) {
      existing.root.parent?.removeChild(existing.root);
      existing.shadow.parent?.removeChild(existing.shadow);
      existing.root.destroy({ children: true, texture: false });
      existing.shadow.destroy();
      this.fighterVisuals.delete(unit.instanceId);
    }

    const root = new Container();
    root.label = `fighter_${unit.instanceId}`;

    const shadow = new Graphics();
    shadow.ellipse(0, 0, Math.round(unit.radiusPx * 1.15), Math.max(4, Math.round(unit.radiusPx * 0.36)));
    shadow.fill({ color: 0x090d16, alpha: 0.42 });
    this.shadowLayer.addChild(shadow);

    let sprite: Sprite | null = null;
    let placeholder: Container | null = null;
    if (atlas) {
      const firstTex = atlas.clipTextures.IDLE[0] ?? Texture.EMPTY;
      sprite = new Sprite(firstTex);
      const firstFrame = atlas.parsed.clips.IDLE.frames[0];
      sprite.anchor.set(
        firstFrame?.anchorX ?? atlas.parsed.anchor.x,
        firstFrame?.anchorY ?? atlas.parsed.anchor.y
      );
      const scale = targetHeightPx / Math.max(24, atlas.parsed.referenceIdleHeight || firstTex.height);
      sprite.scale.set(scale, scale);
      root.addChild(sprite);
    } else {
      const isDev = typeof import.meta !== 'undefined' && Boolean((import.meta as { env?: { DEV?: boolean } }).env?.DEV);
      placeholder = createMissingProArtPlaceholder(spriteKey, 40, Math.round(targetHeightPx * 0.72), isDev);
      root.addChild(placeholder);
    }

    this.ysortLayer.addChild(root);
    const created: BattleFighterVisual = {
      root,
      shadow,
      sprite,
      placeholder,
      lastKey: cacheKey
    };
    this.fighterVisuals.set(unit.instanceId, created);
    return created;
  }

  public render(
    world: BattleWorldState,
    registry: GameDataRegistry,
    manifestRegistry: AssetManifestRegistry,
    alpha: number,
    settings: RenderAccessibilitySettings,
    cameraTargetIndex: 'ALL' | 0 | 1 | 2 | 3,
    viewport: ViewportMetrics,
    polish: VisualPolishConfig,
    dtSec = 1 / 60
  ): void {
    if (this.disposed) return;
    this.elapsedSec += Math.min(0.05, Math.max(0.001, dtSec));

    if (!this.backdropLoaded && !this.backdropLoading) {
      void this.preload(this.activeBattleBundleName);
    }

    const cam = computeArenaCameraOffset(world, alpha, settings, cameraTargetIndex, viewport);
    const hasGiant = world.units.some((u) => u.isOnField && u.isAlive && u.entityScale >= 1.6);
    const zoom = hasGiant ? 0.88 : 1.0;

    // 1. 4-Layer Parallax Backdrop adapted cleanly to 960~1260 x 540 viewport
    for (let i = 0; i < this.backdropLayerSprites.length; i++) {
      const sp = this.backdropLayerSprites[i];
      if (!sp) continue;
      const factor = PARALLAX_FACTORS[i] ?? 1.0;
      const w = Math.max(viewport.viewWidth + 140, 1280);
      sp.width = w;
      sp.height = viewport.viewHeight;
      const shiftX = (cam.x - viewport.arenaOffsetX) * factor;
      sp.position.set(
        Math.round((viewport.viewWidth - w) * 0.5 + shiftX * 0.35),
        Math.round(cam.y * factor * 0.15)
      );
    }

    // 2. Parry / Just-Guard / Gimmick Read-Only Evaluation & Hitstop
    const parryRes = this.parryFeedback.step(world, dtSec, polish);
    for (const pt of parryRes.shockwavePoints) {
      const sx = (pt.x + cam.x) / Math.max(1, viewport.viewWidth);
      const sy = (pt.y + cam.y) / Math.max(1, viewport.viewHeight);
      this.shockwave.trigger(sx, sy, 0.42);
      if (settings.flashEffectEnabled && polish.flashEffectEnabled) {
        this.bloomSpike = 0.78;
      }
    }
    if (parryRes.parryHitstopFrames > 0) {
      this.visualHitstopFrames = Math.max(this.visualHitstopFrames, parryRes.parryHitstopFrames);
    }
    if (parryRes.buggyBanterTriggerText) {
      this.banterOverlay.showBanter('buggy', parryRes.buggyBanterTriggerText, 2.8);
    }

    // 2.5 Arena transform (with optional 3-tick presentation parry hitstop freeze)
    if (this.visualHitstopFrames > 0) {
      this.visualHitstopFrames -= 1;
    } else {
      this.arenaWorldContainer.scale.set(zoom);
      this.arenaWorldContainer.position.set(
        Math.round(cam.x + viewport.viewWidth * 0.5 * (1 - zoom)),
        Math.round(cam.y + viewport.viewHeight * 0.5 * (1 - zoom))
      );
    }

    // 3. Floor arena frame, projectiles & beams (emissive glow for beams/projectiles)
    this.floorHazardsGfx.clear();
    this.floorHazardsGfx.rect(1, 1, world.arenaWidth - 2, world.arenaHeight - 2);
    this.floorHazardsGfx.stroke({ color: 0xfacc15, width: 2, alpha: 0.35 });

    for (const wz of world.waterZones) {
      this.floorHazardsGfx.circle(wz.x, wz.y, wz.radiusPx);
      this.floorHazardsGfx.fill({ color: 0x0ea5e9, alpha: 0.34 });
    }

    this.emissiveGfx.clear();
    this.scratchLights.length = 0;
    this.scratchReflections.length = 0;

    for (const proj of world.projectiles) {
      const isReflected = parryRes.reflectedProjectileIds.has(proj.id);
      const col = isReflected ? 0xfacc15 : proj.team === 'ALPHA' ? 0x38bdf8 : 0xf43f5e;
      this.emissiveGfx.circle(proj.pos.x, proj.pos.y, Math.max(5, proj.radiusPx + (isReflected ? 2 : 0)));
      this.emissiveGfx.fill({ color: col, alpha: 0.92 });
      this.emissiveGfx.circle(proj.pos.x, proj.pos.y, Math.max(3, proj.radiusPx * 0.5));
      this.emissiveGfx.fill({ color: 0xffffff, alpha: 0.95 });
      this.scratchLights.push({
        x: proj.pos.x + cam.x,
        y: proj.pos.y + cam.y,
        radiusPx: isReflected ? 92 : 68,
        colorInt: col,
        intensity: isReflected ? 1.0 : 0.8,
        flickerSpeed: 6,
        flickerAmp: 0.1
      });
    }

    for (const beam of world.beams) {
      const ex = beam.origin.x + beam.dir.x * beam.currentLengthPx;
      const ey = beam.origin.y + beam.dir.y * beam.currentLengthPx;
      const col = beam.team === 'ALPHA' ? 0x38bdf8 : 0xf97316;
      this.emissiveGfx.moveTo(beam.origin.x, beam.origin.y);
      this.emissiveGfx.lineTo(ex, ey);
      this.emissiveGfx.stroke({ color: col, width: Math.max(8, beam.widthPx), alpha: 0.88 });
      this.emissiveGfx.moveTo(beam.origin.x, beam.origin.y);
      this.emissiveGfx.lineTo(ex, ey);
      this.emissiveGfx.stroke({ color: 0xffffff, width: Math.max(3, beam.widthPx * 0.45), alpha: 0.98 });
    }

    for (const melee of world.meleeArcs) {
      const ang = Math.atan2(melee.dir.y, melee.dir.x);
      const halfArc = ((melee.arcDeg * Math.PI) / 180) * 0.5;
      const col = melee.hasArmamentHaki ? 0xa855f7 : melee.team === 'ALPHA' ? 0x38bdf8 : 0xfb7185;
      this.emissiveGfx.arc(melee.origin.x, melee.origin.y, melee.radiusPx, ang - halfArc, ang + halfArc);
      this.emissiveGfx.stroke({ color: col, width: melee.hasArmamentHaki ? 7 : 5, alpha: 0.85 });
    }

    // 4. Units with Aseprite Atlases / Neutral Fallback + Dynamic Sun Shadows
    const shadowTransform = computeSunShadowForTimeOfDay(polish);
    const visibleUnitIds = new Set<string>();

    for (const unit of world.units) {
      if (!unit.isOnField || !unit.isAlive) continue;
      visibleUnitIds.add(unit.instanceId);

      const pos = lerpVecInto(unit.prevPos, unit.pos, alpha, this.scratchPos);
      const proEntry = resolveProSpriteManifestEntry(unit.speciesId, unit.activeFormId);
      const atlas = proEntry ? this.host.loader.getLoadedSpriteAtlasSync(proEntry.key) : null;
      const scaleMult = proEntry?.ppuScale ? unit.visualScale : unit.entityScale * unit.visualScale;
      const displayHeight = (proEntry?.targetDisplayHeight ?? 96) * scaleMult * 0.82;
      const vis = this.getOrCreateFighterVisual(
        unit,
        proEntry?.key ?? `${unit.speciesId}_base`,
        atlas,
        displayHeight
      );
      vis.root.visible = true;
      vis.shadow.visible = true;

      const anim = this.animController.syncAndStepUnit(
        unit,
        world,
        registry,
        manifestRegistry,
        FIXED_DT
      );

      const rx = Math.round(pos.x);
      const ry = Math.round(pos.y);
      const buggySplitOffsetY =
        parryRes.buggySplitActive && unit.speciesId === 'buggy' && world.tick % 4 < 2 ? -6 : 0;
      vis.root.position.set(rx, ry + Math.round(unit.radiusPx * 0.65) + buggySplitOffsetY);
      vis.root.zIndex = ry;

      vis.shadow.position.set(
        Math.round(rx + shadowTransform.offsetX),
        Math.round(ry + unit.radiusPx * 0.65 + shadowTransform.offsetY)
      );
      vis.shadow.skew.set(shadowTransform.skewX, 0);
      vis.shadow.scale.set(1, shadowTransform.scaleY * 2.2);
      vis.shadow.alpha = shadowTransform.alpha;

      if (vis.sprite && atlas) {
        const st: SpriteAnimState = STANDARD_SPRITE_ANIM_STATES.includes(anim.step.state)
          ? anim.step.state
          : 'IDLE';
        const frames = atlas.clipTextures[st];
        const parsedFrames = atlas.parsed.clips[st].frames;
        const fIdx = anim.step.frameIndex % Math.max(1, frames.length);
        const tex = frames[fIdx] ?? frames[0];
        const frameMeta = parsedFrames[fIdx] ?? parsedFrames[0];
        if (tex) {
          vis.sprite.texture = tex;
          const sc = displayHeight / Math.max(24, atlas.parsed.referenceIdleHeight || tex.height);
          vis.sprite.scale.set(anim.visual.facingX < 0 ? -sc : sc, sc);
          if (frameMeta) {
            vis.sprite.anchor.set(frameMeta.anchorX, frameMeta.anchorY);
          }
          if (world.waterZones.length > 0) {
            this.scratchReflections.push({
              texture: tex,
              worldX: rx,
              worldY: ry + Math.round(unit.radiusPx * 0.65),
              scaleX: anim.visual.facingX < 0 ? -sc : sc,
              scaleY: sc,
              tint: 0xbae6fd,
              alpha: 0.72
            });
          }
        }
        const isArmamentParry = parryRes.armamentTintUnitIds.has(unit.instanceId);
        const isStaggered = parryRes.staggeredUnitIds.has(unit.instanceId);
        vis.sprite.tint =
          anim.step.hitFlashActive && settings.flashEffectEnabled
            ? 0xffffff
            : isArmamentParry
              ? 0x6366f1
              : isStaggered
                ? 0xfde68a
                : anim.hasArmamentActive
                  ? 0xc4b5fd
                  : 0xffffff;
        vis.sprite.alpha = unit.iframeTimer > 0 && world.tick % 2 === 0 ? 0.55 : 1;
      }

      this.scratchLights.push({
        x: rx + cam.x,
        y: ry - 18 + cam.y,
        radiusPx: 88 * unit.visualScale,
        colorInt: unit.team === 'ALPHA' ? 0xbae6fd : 0xfecaca,
        intensity: anim.hasArmamentActive ? 0.95 : 0.58,
        flickerSpeed: 2.5,
        flickerAmp: 0.05
      });
    }

    for (const [uid, vis] of this.fighterVisuals.entries()) {
      if (!visibleUnitIds.has(uid)) {
        vis.root.visible = false;
        vis.shadow.visible = false;
      }
    }

    // 5. VFX Events, Armament Parry Shockwave + 3-Tick Hitstop, Awakening Cut-in
    const triggeredShockwaves = this.fxHelper.syncVfxEvents(
      world,
      this.emissiveLayer,
      dtSec,
      (wx, wy) => {
        const sx = (wx + cam.x) / Math.max(1, viewport.viewWidth);
        const sy = (wy + cam.y) / Math.max(1, viewport.viewHeight);
        this.shockwave.trigger(sx, sy, 0.42);
        if (settings.flashEffectEnabled && polish.flashEffectEnabled) {
          this.bloomSpike = 0.75;
        }
        this.visualHitstopFrames = Math.max(this.visualHitstopFrames, 3);
      }
    );

    if (this.bloomSpike > 0) {
      this.bloomSpike = Math.max(0, this.bloomSpike - dtSec * 3.0);
    }

    this.fxHelper.updateCutinOverlay(dtSec, viewport, polish, registry, cam);
    for (const light of this.fxHelper.getCutinDynamicLights()) {
      this.scratchLights.push(light);
    }
    this.banterOverlay.update(dtSec, viewport);

    // 5.5 Lazy WaterReflectionPipeline pass when fighting on Arlong Park waterZones
    if (world.waterZones.length > 0) {
      if (!this.waterReflection) {
        this.waterReflection = new WaterReflectionPipeline(this.host);
        this.arenaWorldContainer.addChildAt(this.waterReflection.reflectionSprite, 1);
      }
      const primaryWater = world.waterZones[0];
      this.waterReflection.renderPass(
        viewport.viewWidth,
        viewport.viewHeight,
        Math.round(cam.x),
        Math.round(cam.y),
        this.elapsedSec,
        primaryWater?.y ?? 260,
        this.scratchReflections,
        polish
      );
    } else if (this.waterReflection) {
      this.waterReflection.reflectionSprite.visible = false;
    }

    this.shockwave.step(dtSec, viewport.viewWidth, viewport.viewHeight, polish);
    this.lighting.renderPass(
      viewport.viewWidth,
      viewport.viewHeight,
      this.elapsedSec,
      this.scratchLights,
      polish
    );
    this.bloom.sync(
      polish,
      viewport.viewWidth,
      viewport.viewHeight,
      0.16,
      1.15,
      this.bloomSpike +
        this.fxHelper.getCutinBloomBoost() +
        (triggeredShockwaves > 0 || parryRes.shockwavePoints.length > 0 ? 0.4 : 0)
    );
    this.godRays.update(dtSec, this.elapsedSec, viewport.viewWidth, viewport.viewHeight, polish);
    this.colorGrading.sync(polish);

    // unused biome check reference kept clean via resolveBiomeForArena
    void resolveBiomeForArena('DEFAULT', manifestRegistry);
    this.host.setSceneTelemetryTag('BATTLE_VS_WEBGL2', this.fighterVisuals.size + 6);
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.emissiveLayer.filters = [];
    this.root.filters = [];
    this.root.removeFromParent();
    this.lighting.displaySprite.removeFromParent();
    this.godRays.root.removeFromParent();
    this.banterOverlay.root.removeFromParent();
    this.fxHelper.cutinOverlay.removeFromParent();

    this.waterReflection?.dispose();
    this.waterReflection = null;
    this.lighting.dispose();
    this.bloom.dispose();
    this.colorGrading.dispose();
    this.godRays.dispose();
    this.shockwave.dispose();
    this.parryFeedback.dispose();
    this.banterOverlay.dispose();
    this.fxHelper.dispose();
    this.animController.dispose();

    this.fighterVisuals.clear();
    this.backdropLayerSprites.length = 0;
    this.root.destroy({ children: true, texture: false });
  }
}
