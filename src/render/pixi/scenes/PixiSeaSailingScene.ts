import { Container, Graphics, Sprite, Text, Texture } from 'pixi.js';
import { clamp } from '../../../core/math/vector2';
import { computeCrewRoleBonuses } from '../../../core/rpg/crewAndBountyEngine';
import type { SailingStepOutput } from '../../../core/rpg/sailingPhysics';
import { computeIslandChestProgress } from '../../../core/rpg/seaChartLogic';
import { resolveActiveShipId } from '../../../core/rpg/seaCurrentPhysics';
import { validateSeaGateAccess } from '../../../core/rpg/seaGateValidator';
import type { Disposable } from '../../../core/types/disposable';
import type {
  RpgCampaignState,
  RpgDataRegistry,
  SeaIslandNode,
  SeaZoneDefinition,
  SeaZoneId
} from '../../../core/types/rpgSchemas';
import {
  defaultAssetManifestRegistry,
  resolveWorldLandmark
} from '../../../data/assets/assetManifestRegistry';
import type { SpriteAnimState } from '../../../data/assets/types';
import type { WorldMarker } from '../../../story/worldMarkerSystem';
import type { VisualPolishConfig } from '../../backend/renderBackend';
import {
  computeCameraWorldBounds,
  isCircleInBounds,
  type ViewportWorldBounds
} from '../../viewport/frustumCulling';
import type { ViewportMetrics } from '../../viewport/responsiveViewportManager';
import { resolveSeaBundleName } from '../pixiBundleHelpers';
import type { PixiStageHost } from '../PixiStageHost';
import {
  createMissingProArtPlaceholder,
  type LoadedProSpriteAtlas
} from '../ProAssetLoader';
import { AtmosphereColorGradingEffect } from '../shaders/AtmosphereColorGradingFilter';
import {
  DynamicLightingLayer,
  type DynamicPointLightInput
} from '../shaders/DynamicLightingLayer';
import {
  OceanWaterShaderPipeline
} from '../shaders/OceanWaterShaderPipeline';
import { SeaAtmospherePipeline } from '../shaders/SeaAtmospherePipeline';
import type {
  OceanIslandCircleInput,
  SeaNavigationTelemetry
} from '../shaders/seaTypes';

interface WakeSlotPixi {
  sprite: Sprite;
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  isBurst: boolean;
}

interface LandmarkSubTexCache {
  baseTex: Texture;
  frames: Texture[];
  fps: number;
}

interface LandmarkVisualNode {
  root: Container;
  ringGfx: Graphics;
  sprite: Sprite | null;
  placeholder: Container | null;
  nameplateContainer: Container;
  nameText: Text;
  cherryGfx: Graphics | null;
  hasProTexture: boolean;
}

interface SeaObjectVisualNode {
  root: Container;
  sprite: Sprite | null;
  fallbackGfx: Graphics | null;
  labelText: Text;
  lastKey: string;
}

interface MarkerVisualNode {
  root: Container;
  ringGfx: Graphics;
  diamondGfx: Graphics;
  labelText: Text;
  kind: WorldMarker['kind'];
}

const WAKE_POOL_CAPACITY = 96;
const COUP_JET_COLOR = 0x38bdf8;

function resolveEffectiveSeaPolish(
  campaign: RpgCampaignState,
  polish: VisualPolishConfig
): VisualPolishConfig {
  if (polish.timeOfDay !== 'DAY') {
    return polish;
  }
  const mapped =
    campaign.timeOfDay === 'EVENING'
      ? 'SUNSET'
      : campaign.timeOfDay === 'NIGHT'
        ? 'NIGHT'
        : campaign.timeOfDay === 'MORNING'
          ? 'MORNING'
          : 'DAY';
  return mapped === 'DAY' ? polish : { ...polish, timeOfDay: mapped };
}

export class PixiSeaSailingScene implements Disposable {
  public readonly root = new Container();

  private readonly oceanWater: OceanWaterShaderPipeline;
  private readonly atmosphere: SeaAtmospherePipeline;
  private readonly worldContainer = new Container();
  private readonly currentsGfx = new Graphics();
  private readonly whirlpoolsGfx = new Graphics();
  private readonly wakePoolLayer = new Container();
  private readonly landmarksLayer = new Container();
  private readonly markersLayer = new Container();
  private readonly seaObjectsLayer = new Container();
  private readonly shipRoot = new Container();
  private readonly coupJetGfx = new Graphics();
  private readonly proximityBanner = new Container();
  private readonly lighting: DynamicLightingLayer;
  private readonly colorGrading: AtmosphereColorGradingEffect;

  private readonly wakeSlots: WakeSlotPixi[] = [];
  private readonly landmarkSubTexCache = new Map<string, LandmarkSubTexCache>();
  private readonly landmarkNodes = new Map<string, LandmarkVisualNode>();
  private readonly markerNodes = new Map<string, MarkerVisualNode>();
  private readonly seaObjectNodes = new Map<string, SeaObjectVisualNode>();
  private readonly scratchLights: DynamicPointLightInput[] = [];
  private readonly scratchIslandCircles: OceanIslandCircleInput[] = [];

  private shipSprite: Sprite | null = null;
  private shipPlaceholder: Container | null = null;
  private lastShipVisualKey = '';

  private proximityBgGfx = new Graphics();
  private proximityTitleText: Text;
  private proximitySubText: Text;
  private proximityBadgeText: Text;
  private proximityCompleteText: Text;

  private activeZoneId: SeaZoneId = 'east_blue';
  private loadingStartedZone: SeaZoneId | null = null;
  private wakeWriteIdx = 0;
  private wakeEmitCounter = 0;
  private lastWakeTick = -1;
  private elapsedSec = 0;
  private lastEmittedLightCount = 0;
  private lastBoundProLandmarkCount = 0;
  private disposed = false;

  constructor(private readonly host: PixiStageHost) {
    this.root.label = 'pixi_sea_sailing_scene';
    this.oceanWater = new OceanWaterShaderPipeline('east_blue');
    this.atmosphere = new SeaAtmospherePipeline();
    this.lighting = new DynamicLightingLayer(host);
    this.colorGrading = new AtmosphereColorGradingEffect();

    this.worldContainer.label = 'sea_world_container';
    this.currentsGfx.label = 'sea_currents_ribbons';
    this.whirlpoolsGfx.label = 'sea_whirlpool_vortices';
    this.wakePoolLayer.label = 'sea_wake_foam_pool';
    this.landmarksLayer.label = 'sea_landmarks_and_gates';
    this.markersLayer.label = 'sea_world_markers';
    this.seaObjectsLayer.label = 'sea_dynamic_objects';
    this.shipRoot.label = 'sea_player_ship';

    this.shipRoot.addChild(this.coupJetGfx);

    for (let i = 0; i < WAKE_POOL_CAPACITY; i++) {
      const sp = new Sprite(Texture.WHITE);
      sp.anchor.set(0.5, 0.5);
      sp.visible = false;
      this.wakePoolLayer.addChild(sp);
      this.wakeSlots.push({
        sprite: sp,
        active: false,
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        life: 0,
        maxLife: 22,
        size: 4,
        isBurst: false
      });
    }

    this.proximityBanner.label = 'sea_island_proximity_banner';
    this.proximityBanner.visible = false;
    this.proximityBanner.addChild(this.proximityBgGfx);
    this.proximityTitleText = new Text({
      text: '',
      style: { fontFamily: 'monospace', fontSize: 10, fontWeight: 'bold', fill: 0xfde047 }
    });
    this.proximitySubText = new Text({
      text: '',
      style: { fontFamily: 'monospace', fontSize: 9, fill: 0xcbd5e1 }
    });
    this.proximityBadgeText = new Text({
      text: '[입항]',
      style: { fontFamily: 'monospace', fontSize: 9, fontWeight: 'bold', fill: 0xffffff }
    });
    this.proximityCompleteText = new Text({
      text: '100% ★',
      style: { fontFamily: 'monospace', fontSize: 9, fontWeight: 'bold', fill: 0xfacc15 }
    });
    this.proximityBanner.addChild(
      this.proximityTitleText,
      this.proximitySubText,
      this.proximityBadgeText,
      this.proximityCompleteText
    );

    this.worldContainer.addChild(this.currentsGfx);
    this.worldContainer.addChild(this.whirlpoolsGfx);
    this.worldContainer.addChild(this.wakePoolLayer);
    this.worldContainer.addChild(this.landmarksLayer);
    this.worldContainer.addChild(this.markersLayer);
    this.worldContainer.addChild(this.seaObjectsLayer);
    this.worldContainer.addChild(this.shipRoot);
    this.worldContainer.addChild(this.proximityBanner);

    this.root.addChild(this.oceanWater.sprite);
    this.root.addChild(this.atmosphere.underwaterLayer);
    this.root.addChild(this.worldContainer);
    this.root.addChild(this.lighting.displaySprite);
    this.root.addChild(this.atmosphere.overlayLayer);
    this.root.filters = [this.colorGrading.filter];
  }

  public getActiveZoneId(): SeaZoneId {
    return this.activeZoneId;
  }

  public getLastEmittedLightCount(): number {
    return this.lastEmittedLightCount;
  }

  public getLastBoundProLandmarkCount(): number {
    return this.lastBoundProLandmarkCount;
  }

  public getOceanWaterPipeline(): OceanWaterShaderPipeline {
    return this.oceanWater;
  }

  public getAtmospherePipeline(): SeaAtmospherePipeline {
    return this.atmosphere;
  }

  public async preload(zoneId: SeaZoneId = 'east_blue'): Promise<void> {
    if (this.disposed) return;
    if (this.loadingStartedZone === zoneId) return;
    this.loadingStartedZone = zoneId;
    if (this.activeZoneId !== zoneId) {
      this.clearZoneVisualCaches();
      this.activeZoneId = zoneId;
    }
    const bundleName = resolveSeaBundleName(zoneId);
    await this.host.bundleManager.loadSceneBundles([bundleName]);
  }

  public switchZone(zoneId: SeaZoneId): Promise<void> {
    if (this.activeZoneId !== zoneId) {
      this.clearZoneVisualCaches();
      this.activeZoneId = zoneId;
      this.loadingStartedZone = null;
    }
    return this.preload(zoneId);
  }

  private clearZoneVisualCaches(): void {
    this.landmarkSubTexCache.clear();
    for (const node of this.landmarkNodes.values()) {
      node.root.removeFromParent();
      node.root.destroy({ children: true, texture: false });
    }
    this.landmarkNodes.clear();

    for (const marker of this.markerNodes.values()) {
      marker.root.removeFromParent();
      marker.root.destroy({ children: true, texture: false });
    }
    this.markerNodes.clear();

    for (const obj of this.seaObjectNodes.values()) {
      obj.root.removeFromParent();
      obj.root.destroy({ children: true, texture: false });
    }
    this.seaObjectNodes.clear();

    for (const slot of this.wakeSlots) {
      slot.active = false;
      slot.sprite.visible = false;
    }
    this.proximityBanner.visible = false;
  }

  private resolveLandmarkFrames(landmarkId: string): {
    frames: Texture[];
    fps: number;
    frameWidth: number;
    frameHeight: number;
  } | null {
    const entry = resolveWorldLandmark(landmarkId, defaultAssetManifestRegistry);
    const loadedTex = this.host.loader.getLoadedTextureSync(`sea:landmark_${landmarkId}`);
    if (!entry || !loadedTex || loadedTex.destroyed) {
      return null;
    }
    const cached = this.landmarkSubTexCache.get(landmarkId);
    if (cached && cached.baseTex === loadedTex && cached.frames.every((f) => !f.destroyed)) {
      return {
        frames: cached.frames,
        fps: cached.fps,
        frameWidth: entry.frameWidth,
        frameHeight: entry.frameHeight
      };
    }

    const frames: Texture[] = [];
    const safeCount = Math.max(
      1,
      Math.min(entry.frameCount, Math.floor(loadedTex.width / Math.max(1, entry.frameWidth)))
    );
    for (let i = 0; i < safeCount; i++) {
      frames.push(
        this.host.loader.createSubTexture(
          loadedTex,
          i * entry.frameWidth,
          0,
          entry.frameWidth,
          Math.min(entry.frameHeight, loadedTex.height)
        )
      );
    }
    if (frames.length === 0) {
      frames.push(loadedTex);
    }
    this.landmarkSubTexCache.set(landmarkId, {
      baseTex: loadedTex,
      frames,
      fps: entry.fps
    });
    return {
      frames,
      fps: entry.fps,
      frameWidth: entry.frameWidth,
      frameHeight: entry.frameHeight
    };
  }

  private syncCurrentsAndWhirlpools(
    zone: SeaZoneDefinition,
    tick: number,
    bounds: ViewportWorldBounds
  ): void {
    this.currentsGfx.clear();
    for (const route of zone.currents ?? []) {
      if (route.points.length < 2) continue;
      let anyVisible = false;
      for (const pt of route.points) {
        if (isCircleInBounds(bounds, pt.x, pt.y, route.widthPx + 140)) {
          anyVisible = true;
          break;
        }
      }
      if (!anyVisible) {
        for (let i = 0; i < route.points.length - 1; i++) {
          const a = route.points[i]!;
          const b = route.points[i + 1]!;
          if (isCircleInBounds(bounds, (a.x + b.x) * 0.5, (a.y + b.y) * 0.5, route.widthPx + 220)) {
            anyVisible = true;
            break;
          }
        }
      }
      if (!anyVisible) continue;

      this.currentsGfx.moveTo(route.points[0]!.x, route.points[0]!.y);
      for (let i = 1; i < route.points.length; i++) {
        this.currentsGfx.lineTo(route.points[i]!.x, route.points[i]!.y);
      }
      this.currentsGfx.stroke({
        color: 0x38bdf8,
        width: Math.max(8, route.widthPx * 0.45),
        alpha: 0.16,
        cap: 'round',
        join: 'round'
      });

      // Flowing directional chevrons along current spine
      for (let i = 0; i < route.points.length - 1; i++) {
        const a = route.points[i]!;
        const b = route.points[i + 1]!;
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const len = Math.hypot(dx, dy);
        if (len < 12) continue;
        const ux = dx / len;
        const uy = dy / len;
        const px = -uy;
        const py = ux;
        const stepCount = Math.max(1, Math.floor(len / 88));
        const shift = ((tick * (route.speedPx * 0.022)) % 88) / Math.max(88, len);
        for (let k = 0; k < stepCount; k++) {
          const t = (k / stepCount + shift) % 1;
          const cx = a.x + dx * t;
          const cy = a.y + dy * t;
          if (!isCircleInBounds(bounds, cx, cy, 28)) continue;
          const sz = 6.5;
          this.currentsGfx
            .moveTo(cx - ux * sz * 0.6 + px * sz * 0.7, cy - uy * sz * 0.6 + py * sz * 0.7)
            .lineTo(cx + ux * sz, cy + uy * sz)
            .lineTo(cx - ux * sz * 0.6 - px * sz * 0.7, cy - uy * sz * 0.6 - py * sz * 0.7)
            .stroke({ color: 0xe0f2fe, width: 2, alpha: 0.72 });
        }
      }
    }

    this.whirlpoolsGfx.clear();
    for (const wp of zone.whirlpools ?? []) {
      const wx = Math.round(wp.pos.x);
      const wy = Math.round(wp.pos.y);
      if (!isCircleInBounds(bounds, wx, wy, wp.outerRadiusPx + 24)) continue;
      const dir = wp.clockwise ? 1 : -1;
      const baseAngle = tick * 0.06 * dir;

      this.whirlpoolsGfx.circle(wx, wy, wp.outerRadiusPx * 0.72);
      this.whirlpoolsGfx.fill({ color: 0x091326, alpha: 0.36 });

      for (let ring = 0; ring < 3; ring++) {
        const radius =
          wp.coreRadiusPx + ((wp.outerRadiusPx - wp.coreRadiusPx) * (ring + 1)) / 3.2;
        const color = ring === 0 ? 0xf0f9ff : ring === 1 ? 0x7dd3fc : 0x38bdf8;
        const alpha = ring === 0 ? 0.78 : ring === 1 ? 0.6 : 0.4;
        for (let arm = 0; arm < 2; arm++) {
          const startA = baseAngle * (1.25 - ring * 0.2) + arm * Math.PI + ring * 0.7;
          this.whirlpoolsGfx.arc(wx, wy, radius, startA, startA + 1.35);
          this.whirlpoolsGfx.stroke({ color, width: ring === 0 ? 2.5 : 2, alpha });
        }
      }

      this.whirlpoolsGfx.circle(wx, wy, Math.max(8, wp.coreRadiusPx * 0.45));
      this.whirlpoolsGfx.fill({ color: 0x0c4a6e, alpha: 0.78 });
      this.whirlpoolsGfx.stroke({ color: 0xe0f2fe, width: 1.5, alpha: 0.88 });
    }
  }

  private stepWakeFoamPool(
    state: RpgCampaignState,
    speedPx: number,
    tailwindRatio: number,
    wakeEmitMultiplier: number,
    coupDeBurstActive: boolean,
    tick: number,
    bounds: ViewportWorldBounds
  ): void {
    const advance = this.lastWakeTick === tick ? 0 : 1;
    this.lastWakeTick = tick;

    if (advance > 0 && (speedPx > 14 || coupDeBurstActive)) {
      this.wakeEmitCounter += 1;
      const emitEvery = coupDeBurstActive ? 1 : wakeEmitMultiplier > 1.3 ? 2 : 3;
      if (this.wakeEmitCounter % emitEvery === 0) {
        const backX = -Math.cos(state.ship.headingRad);
        const backY = -Math.sin(state.ship.headingRad);
        const perpX = -backY;
        const perpY = backX;
        const sternX = state.ship.pos.x + backX * 18;
        const sternY = state.ship.pos.y + backY * 18 + 6;
        const spread = ((this.wakeEmitCounter % 3) - 1) * 5;
        const slot = this.wakeSlots[this.wakeWriteIdx];
        this.wakeWriteIdx = (this.wakeWriteIdx + 1) % WAKE_POOL_CAPACITY;
        if (slot) {
          slot.active = true;
          slot.x = sternX + perpX * spread;
          slot.y = sternY + perpY * spread;
          slot.vx = backX * 0.35 + perpX * (spread * 0.05);
          slot.vy = backY * 0.35 + perpY * (spread * 0.05);
          slot.life = 0;
          slot.maxLife = coupDeBurstActive ? 28 : 22;
          slot.size = coupDeBurstActive ? 7 : tailwindRatio > 0.2 ? 5.5 : 4;
          slot.isBurst = coupDeBurstActive;
        }
      }
    }

    for (const p of this.wakeSlots) {
      if (!p.active) {
        p.sprite.visible = false;
        continue;
      }
      if (advance > 0) {
        p.x += p.vx;
        p.y += p.vy;
        p.life += 1;
        if (p.life >= p.maxLife) {
          p.active = false;
          p.sprite.visible = false;
          continue;
        }
      }
      if (!isCircleInBounds(bounds, p.x, p.y, 18)) {
        p.sprite.visible = false;
        continue;
      }
      const ratio = 1 - p.life / p.maxLife;
      const w = Math.round(p.size * (0.7 + (1 - ratio) * 0.9));
      const h = Math.max(2, Math.round(w * 0.55));
      p.sprite.visible = true;
      p.sprite.position.set(Math.round(p.x), Math.round(p.y));
      p.sprite.width = w;
      p.sprite.height = h;
      p.sprite.alpha = Math.max(0.1, ratio * (p.isBurst ? 0.88 : 0.65));
      p.sprite.tint = p.isBurst ? (p.life % 2 === 0 ? 0xe0f2fe : COUP_JET_COLOR) : 0xf0f9ff;
    }
  }

  private getOrCreateLandmarkNode(
    id: string,
    label: string,
    isGate: boolean,
    frameData: ReturnType<PixiSeaSailingScene['resolveLandmarkFrames']>
  ): LandmarkVisualNode {
    const existing = this.landmarkNodes.get(id);
    const hasPro = Boolean(frameData);
    if (existing && existing.hasProTexture === hasPro) {
      return existing;
    }
    if (existing) {
      existing.root.removeFromParent();
      existing.root.destroy({ children: true, texture: false });
      this.landmarkNodes.delete(id);
    }

    const root = new Container();
    root.label = `sea_lm_${id}`;
    const ringGfx = new Graphics();
    root.addChild(ringGfx);

    let sprite: Sprite | null = null;
    let placeholder: Container | null = null;
    if (frameData) {
      sprite = new Sprite(frameData.frames[0] ?? Texture.EMPTY);
      sprite.anchor.set(0.5, 0.56);
      root.addChild(sprite);
    } else {
      const isDev =
        typeof import.meta !== 'undefined' &&
        Boolean((import.meta as { env?: { DEV?: boolean } }).env?.DEV);
      placeholder = createMissingProArtPlaceholder(
        id,
        isGate ? 96 : 84,
        isGate ? 84 : 74,
        isDev
      );
      placeholder.position.set(0, 26);
      root.addChild(placeholder);
    }

    const nameplateContainer = new Container();
    const labelW = clamp(label.length * 8 + 20, 118, 224);
    const plateBg = new Graphics();
    plateBg.rect(-Math.round(labelW * 0.5), 0, labelW, 20);
    plateBg.fill({ color: 0x0f172a, alpha: 0.88 });
    plateBg.stroke({ color: isGate ? 0xf43f5e : 0x475569, width: 1 });
    nameplateContainer.addChild(plateBg);

    const nameText = new Text({
      text: label,
      style: { fontFamily: 'monospace', fontSize: 10, fontWeight: 'bold', fill: 0xf8fafc }
    });
    nameText.anchor.set(0.5, 0.5);
    nameText.position.set(0, 10);
    nameplateContainer.addChild(nameText);
    nameplateContainer.position.set(0, 36);
    root.addChild(nameplateContainer);

    let cherryGfx: Graphics | null = null;
    if (id === 'drum_kingdom') {
      cherryGfx = new Graphics();
      cherryGfx.visible = false;
      root.addChild(cherryGfx);
    }

    this.landmarksLayer.addChild(root);
    const created: LandmarkVisualNode = {
      root,
      ringGfx,
      sprite,
      placeholder,
      nameplateContainer,
      nameText,
      cherryGfx,
      hasProTexture: hasPro
    };
    this.landmarkNodes.set(id, created);
    return created;
  }

  private syncLandmarksAndGates(
    state: RpgCampaignState,
    rpgRegistry: RpgDataRegistry,
    zone: SeaZoneDefinition,
    nearbyIsland: SeaIslandNode | null,
    tick: number,
    bounds: ViewportWorldBounds,
    worldMarkers?: readonly WorldMarker[]
  ): void {
    let proBoundCount = 0;

    if (zone.seaGate) {
      const gate = zone.seaGate;
      const gx = Math.round(gate.pos.x);
      const gy = Math.round(gate.pos.y);
      const frames = this.resolveLandmarkFrames(gate.gateId);
      if (frames) proBoundCount += 1;
      const gateCheck = validateSeaGateAccess(state, zone.id, rpgRegistry);
      const gateText = gateCheck.allowed
        ? `⛩ ${gate.name} · 개방됨 -> ${gate.toZoneId.toUpperCase()}`
        : `⛩ ${gate.name} · 잠김 (${gateCheck.missingEpisodes.length}개 미완료)`;
      const node = this.getOrCreateLandmarkNode(gate.gateId, gateText, true, frames);
      const visible = isCircleInBounds(bounds, gx, gy, gate.triggerRadiusPx + 110);
      node.root.visible = visible;
      if (visible) {
        node.root.position.set(gx, gy);
        node.ringGfx.clear();
        node.ringGfx.circle(0, 0, gate.triggerRadiusPx);
        node.ringGfx.stroke({
          color: gateCheck.allowed ? 0x22c55e : 0xf43f5e,
          width: 2.5,
          alpha: 0.85
        });
        if (node.sprite && frames) {
          const fr = Math.floor((tick / 60) * frames.fps) % frames.frames.length;
          node.sprite.texture = frames.frames[fr] ?? node.sprite.texture;
        }
        node.nameText.text = gateText;
        node.nameText.style.fill = gateCheck.allowed ? 0x4ade80 : 0xfca5a5;
      }
    }

    for (const isl of zone.islands) {
      const ix = Math.round(isl.pos.x);
      const iy = Math.round(isl.pos.y);
      const frames = this.resolveLandmarkFrames(isl.islandId);
      if (frames) proBoundCount += 1;
      const completed = state.completedEpisodes.includes(isl.episodeId);
      const isNear = nearbyIsland?.islandId === isl.islandId;
      const node = this.getOrCreateLandmarkNode(isl.islandId, isl.name, false, frames);
      const visible = isCircleInBounds(bounds, ix, iy, isl.dockingRadiusPx + 110);
      node.root.visible = visible;
      if (!visible) continue;

      node.root.position.set(ix, iy);
      const ringColor = isNear
        ? 0xfde047
        : completed
          ? 0x4ade80
          : isl.requiredForNextZone
            ? 0xfacc15
            : 0x38bdf8;
      node.ringGfx.clear();
      node.ringGfx.circle(0, 0, isl.dockingRadiusPx);
      node.ringGfx.stroke({
        color: ringColor,
        width: isNear ? 2.5 : 1.75,
        alpha: isNear ? 0.95 : 0.72
      });

      if (node.sprite && frames) {
        const fr = Math.floor((tick / 60) * frames.fps) % frames.frames.length;
        node.sprite.texture = frames.frames[fr] ?? node.sprite.texture;
      }

      if (node.cherryGfx) {
        if (completed) {
          node.cherryGfx.visible = true;
          node.cherryGfx.clear();
          for (let p = 0; p < 6; p++) {
            const px = -22 + ((p * 11 + tick) % 44);
            const py = -42 + ((p * 9 + tick) % 30);
            node.cherryGfx.rect(px, py, 3, 2);
            node.cherryGfx.fill({ color: p % 2 === 0 ? 0xf9a8d4 : 0xfbcfe8, alpha: 0.9 });
          }
        } else {
          node.cherryGfx.visible = false;
        }
      }

      node.nameText.text = completed ? `★ ${isl.name}` : isl.name;
      node.nameText.style.fill = completed ? 0x86efac : 0xf8fafc;
    }

    this.lastBoundProLandmarkCount = proBoundCount;

    // 9-slice style Proximity Info Tag for nearby island
    if (nearbyIsland) {
      const ix = Math.round(nearbyIsland.pos.x);
      const iy = Math.round(nearbyIsland.pos.y);
      const completed = state.completedEpisodes.includes(nearbyIsland.episodeId);
      const chest = computeIslandChestProgress(state, nearbyIsland.islandId, rpgRegistry);
      const hasGold = Boolean(
        worldMarkers?.some(
          (m) =>
            m.kind === 'MAIN' &&
            Math.hypot(m.x - nearbyIsland.pos.x, m.y - nearbyIsland.pos.y) < 36
        )
      );
      const hasBlue = Boolean(
        worldMarkers?.some(
          (m) =>
            m.kind === 'SIDE' &&
            Math.hypot(m.x - nearbyIsland.pos.x, m.y - nearbyIsland.pos.y) < 36
        )
      );

      const w = 192;
      const h = 44;
      this.proximityBanner.position.set(Math.round(ix - w * 0.5), Math.round(iy - 98));
      this.proximityBgGfx.clear();
      this.proximityBgGfx.rect(0, 0, w, h);
      this.proximityBgGfx.fill({ color: 0x0f172a, alpha: 0.94 });
      this.proximityBgGfx.stroke({ color: completed ? 0x4ade80 : 0xfacc15, width: 2 });
      this.proximityBgGfx.rect(w - 44, 4, 40, 14);
      this.proximityBgGfx.fill({
        color: nearbyIsland.playableInVerticalSlice ? 0x16a34a : 0x475569,
        alpha: 1
      });

      const prefix = hasGold ? '★ ' : hasBlue ? '◆ ' : '';
      const shortName =
        nearbyIsland.name.length > 14 ? `${nearbyIsland.name.slice(0, 14)}…` : nearbyIsland.name;
      this.proximityTitleText.text = `${prefix}${shortName}`;
      this.proximityTitleText.style.fill = hasGold ? 0xfde047 : hasBlue ? 0x38bdf8 : 0xf8fafc;
      this.proximityTitleText.position.set(7, 4);

      this.proximityBadgeText.position.set(w - 40, 5);
      const clearTag = completed ? '★클리어' : '미완료';
      const chestTag = chest.total > 0 ? `보물 ${chest.opened}/${chest.total}` : '특수 거점';
      this.proximitySubText.text = `${clearTag} · ${chestTag}`;
      this.proximitySubText.style.fill = completed ? 0x4ade80 : 0xcbd5e1;
      this.proximitySubText.position.set(7, 25);

      this.proximityCompleteText.visible = chest.isComplete;
      this.proximityCompleteText.position.set(w - 44, 25);
      this.proximityBanner.visible = true;
    } else {
      this.proximityBanner.visible = false;
    }
  }

  private syncWorldMarkers(
    worldMarkers: readonly WorldMarker[] | undefined,
    tick: number,
    highlightGold: boolean,
    bounds: ViewportWorldBounds
  ): void {
    const activeIds = new Set<string>();
    for (const m of worldMarkers ?? []) {
      activeIds.add(m.id);
      if (!isCircleInBounds(bounds, m.x, m.y, 120)) {
        const hidden = this.markerNodes.get(m.id);
        if (hidden) hidden.root.visible = false;
        continue;
      }

      let node = this.markerNodes.get(m.id);
      if (!node || node.kind !== m.kind) {
        if (node) {
          node.root.removeFromParent();
          node.root.destroy({ children: true, texture: false });
        }
        const root = new Container();
        const ringGfx = new Graphics();
        const diamondGfx = new Graphics();
        const colorNum = Number.parseInt(m.color.replace('#', ''), 16) || 0xfacc15;
        diamondGfx.poly([0, -7, 6, 0, 0, 7, -6, 0]);
        diamondGfx.fill({ color: colorNum, alpha: 0.96 });
        diamondGfx.stroke({ color: 0x0f172a, width: 1 });
        const labelText = new Text({
          text: m.label,
          style: { fontFamily: 'monospace', fontSize: 10, fontWeight: 'bold', fill: colorNum }
        });
        labelText.anchor.set(0.5, 1);
        labelText.visible = m.kind === 'MAIN' || m.kind === 'SIDE';
        root.addChild(ringGfx, diamondGfx, labelText);
        this.markersLayer.addChild(root);
        node = { root, ringGfx, diamondGfx, labelText, kind: m.kind };
        this.markerNodes.set(m.id, node);
      }

      const pulse = m.pulse ? 0.68 + Math.sin(tick * 0.14) * 0.32 : 0.65;
      const isHighlightedMain = m.kind === 'MAIN' && highlightGold;
      const radius = isHighlightedMain ? 30 : m.kind === 'MAIN' ? 22 : 16;
      const beamH = isHighlightedMain ? 84 : m.kind === 'MAIN' ? 58 : 36;
      const colorNum = Number.parseInt(m.color.replace('#', ''), 16) || 0xfacc15;
      const bobY = -beamH - 6 + Math.sin(tick * 0.12) * 4;

      node.root.visible = true;
      node.root.position.set(Math.round(m.x), Math.round(m.y));
      node.ringGfx.clear();
      node.ringGfx.ellipse(0, 8, radius, Math.round(radius * 0.45));
      node.ringGfx.stroke({ color: colorNum, width: isHighlightedMain ? 3 : 2, alpha: pulse });
      node.ringGfx.rect(-Math.round(radius * 0.45), -beamH, Math.round(radius * 0.9), beamH + 8);
      node.ringGfx.fill({
        color: colorNum,
        alpha: m.kind === 'MAIN' ? 0.28 * pulse : 0.16 * pulse
      });

      node.diamondGfx.visible = m.kind === 'MAIN' || m.kind === 'SIDE';
      node.diamondGfx.position.set(0, Math.round(bobY));
      node.labelText.text = m.label;
      node.labelText.position.set(0, Math.round(bobY - 10));
    }

    for (const [id, node] of this.markerNodes.entries()) {
      if (!activeIds.has(id)) {
        node.root.visible = false;
      }
    }
  }

  private syncDynamicSeaObjects(
    state: RpgCampaignState,
    zoneId: SeaZoneId,
    revealsHiddenChests: boolean,
    tick: number,
    bounds: ViewportWorldBounds
  ): void {
    const seaObjects = state.seaObjectsByZone[zoneId] ?? [];
    const seenIds = new Set<string>();

    for (const obj of seaObjects) {
      if (obj.collectedOrDefeated) continue;
      if (obj.hiddenByDefault && !revealsHiddenChests) continue;
      seenIds.add(obj.id);

      const ox = Math.round(obj.pos.x);
      const oy = Math.round(obj.pos.y);
      const isVisible = isCircleInBounds(bounds, ox, oy, 56);
      const atlasKey =
        obj.kind === 'MARINE_PATROL'
          ? 'ship_marine_warship'
          : obj.kind === 'SEA_KING'
            ? 'ship_sea_king'
            : null;
      const atlas = atlasKey ? this.host.loader.getLoadedSpriteAtlasSync(atlasKey) : null;
      const cacheKey = `${obj.kind}_${atlas ? 'ATLAS' : 'ICON'}`;

      let node = this.seaObjectNodes.get(obj.id);
      if (!node || node.lastKey !== cacheKey) {
        if (node) {
          node.root.removeFromParent();
          node.root.destroy({ children: true, texture: false });
        }
        const root = new Container();
        let sprite: Sprite | null = null;
        let fallbackGfx: Graphics | null = null;

        if (atlas) {
          const clipState: SpriteAnimState = obj.kind === 'MARINE_PATROL' ? 'MOVE' : 'IDLE';
          const tex = atlas.clipTextures[clipState][0] ?? Texture.EMPTY;
          sprite = new Sprite(tex);
          sprite.anchor.set(0.5, 0.5);
          const targetSize = obj.kind === 'SEA_KING' ? 56 : 44;
          const s = targetSize / Math.max(24, tex.height);
          sprite.scale.set(s, s);
          root.addChild(sprite);
        } else {
          fallbackGfx = new Graphics();
          if (obj.kind === 'TREASURE_CHEST') {
            fallbackGfx.rect(-10, -8, 20, 16);
            fallbackGfx.fill({ color: 0xf59e0b, alpha: 1 });
            fallbackGfx.stroke({ color: 0xfde047, width: 2 });
          } else {
            fallbackGfx.circle(0, 0, obj.kind === 'SEA_KING' ? 18 : 13);
            fallbackGfx.fill({
              color:
                obj.kind === 'MERCHANT_SHIP'
                  ? 0x38bdf8
                  : obj.kind === 'MARINE_PATROL'
                    ? 0xf43f5e
                    : 0xa855f7,
              alpha: 0.9
            });
          }
          root.addChild(fallbackGfx);
        }

        const labelStr =
          obj.kind === 'TREASURE_CHEST'
            ? '보물상자'
            : obj.kind === 'MERCHANT_SHIP'
              ? '보급선'
              : obj.kind === 'MARINE_PATROL'
                ? '해군함대'
                : '해왕류';
        const labelCol =
          obj.kind === 'TREASURE_CHEST'
            ? 0xfde047
            : obj.kind === 'MERCHANT_SHIP'
              ? 0xbae6fd
              : obj.kind === 'MARINE_PATROL'
                ? 0xfda4af
                : 0xe9d5ff;

        const labelText = new Text({
          text: labelStr,
          style: { fontFamily: 'monospace', fontSize: 9, fontWeight: 'bold', fill: labelCol }
        });
        labelText.anchor.set(0.5, 1);
        labelText.position.set(0, -22);
        root.addChild(labelText);

        this.seaObjectsLayer.addChild(root);
        node = { root, sprite, fallbackGfx, labelText, lastKey: cacheKey };
        this.seaObjectNodes.set(obj.id, node);
      }

      node.root.visible = isVisible;
      if (!isVisible) continue;
      node.root.position.set(ox, oy);

      if (node.sprite && atlas) {
        const clipState: SpriteAnimState = obj.kind === 'MARINE_PATROL' ? 'MOVE' : 'IDLE';
        const textures = atlas.clipTextures[clipState];
        const fps = atlas.clipFps[clipState];
        const fr = Math.floor((tick / 60) * fps) % Math.max(1, textures.length);
        node.sprite.texture = textures[fr] ?? node.sprite.texture;
      }
    }

    for (const [id, node] of this.seaObjectNodes.entries()) {
      if (!seenIds.has(id)) {
        node.root.visible = false;
      }
    }
  }

  private syncPlayerShip(
    state: RpgCampaignState,
    activeShipId: 'going_merry' | 'thousand_sunny',
    speedPx: number,
    tailwindRatio: number,
    sailBillowFactor: number,
    tick: number
  ): void {
    const shipKey = `ship_${activeShipId}`;
    const atlas: LoadedProSpriteAtlas | null =
      this.host.loader.getLoadedSpriteAtlasSync(shipKey);
    const cacheTag = `${shipKey}_${atlas ? 'ATLAS' : 'MISSING'}`;

    if (this.lastShipVisualKey !== cacheTag) {
      this.lastShipVisualKey = cacheTag;
      if (this.shipSprite) {
        this.shipSprite.removeFromParent();
        this.shipSprite.destroy({ texture: false });
        this.shipSprite = null;
      }
      if (this.shipPlaceholder) {
        this.shipPlaceholder.removeFromParent();
        this.shipPlaceholder.destroy({ children: true, texture: false });
        this.shipPlaceholder = null;
      }

      if (atlas) {
        const tex = atlas.clipTextures.IDLE[0] ?? Texture.EMPTY;
        this.shipSprite = new Sprite(tex);
        this.shipSprite.anchor.set(atlas.parsed.anchor.x, atlas.parsed.anchor.y);
        this.shipRoot.addChild(this.shipSprite);
      } else {
        const isDev =
          typeof import.meta !== 'undefined' &&
          Boolean((import.meta as { env?: { DEV?: boolean } }).env?.DEV);
        this.shipPlaceholder = createMissingProArtPlaceholder(shipKey, 48, 48, isDev);
        this.shipRoot.addChild(this.shipPlaceholder);
      }
    }

    const sector = Math.round(state.ship.headingRad / (Math.PI / 4)) * (Math.PI / 4);
    const tiltRad = Math.sin(sector) * 0.14;
    const facingX = Math.cos(sector) < -0.05 ? -1 : 1;
    const bobY = speedPx > 10 ? Math.round(Math.sin(tick * 0.18) * 1.5) : 0;

    this.shipRoot.position.set(
      Math.round(state.ship.pos.x),
      Math.round(state.ship.pos.y + bobY)
    );
    this.shipRoot.rotation = tiltRad * facingX;
    this.shipRoot.scale.set(facingX, 1);

    const coupActive = state.ship.coupDeBurstActiveTimer > 0;
    this.coupJetGfx.clear();
    if (coupActive) {
      this.coupJetGfx.rect(-34, -10, 14, 12);
      this.coupJetGfx.fill({ color: COUP_JET_COLOR, alpha: 0.78 });
      this.coupJetGfx.rect(-28, -7, 8, 6);
      this.coupJetGfx.fill({ color: 0xe0f2fe, alpha: 0.92 });
    } else if (tailwindRatio > 0.15) {
      this.coupJetGfx.rect(-22, -18, 6, 10);
      this.coupJetGfx.fill({ color: 0xe0f2fe, alpha: 0.55 });
    }

    if (this.shipSprite && atlas) {
      const animState: SpriteAnimState = coupActive
        ? 'DODGE'
        : speedPx > 12 || tailwindRatio > 0.15
          ? 'MOVE'
          : 'IDLE';
      const textures = atlas.clipTextures[animState];
      const fps = atlas.clipFps[animState];
      const fr = Math.floor((tick / 60) * fps) % Math.max(1, textures.length);
      this.shipSprite.texture = textures[fr] ?? this.shipSprite.texture;
      const billowScale = 1 + sailBillowFactor * 0.08;
      this.shipSprite.scale.set(billowScale, 1 + sailBillowFactor * 0.04);
    }
  }

  public render(
    state: RpgCampaignState,
    rpgRegistry: RpgDataRegistry,
    stepInfo: SailingStepOutput,
    tick: number,
    viewport: ViewportMetrics,
    polish: VisualPolishConfig,
    dtSec: number,
    worldMarkers?: readonly WorldMarker[],
    highlightGoldMarker = false,
    telemetry?: SeaNavigationTelemetry
  ): void {
    if (this.disposed) return;

    const zone = rpgRegistry.seaZones[state.currentZoneId];
    if (!zone) return;

    if (zone.id !== this.activeZoneId) {
      void this.switchZone(zone.id);
    } else if (this.loadingStartedZone !== zone.id) {
      void this.preload(zone.id);
    }

    const safeDt = Math.min(0.1, Math.max(0.001, dtSec));
    this.elapsedSec += safeDt;

    const effectivePolish = resolveEffectiveSeaPolish(state, polish);
    const viewW = Math.max(1, viewport.viewWidth);
    const viewH = Math.max(1, viewport.viewHeight);

    // Viewport camera centered on ship, clamped to sea zone bounds (supports 960~1260px widths)
    const camX = clamp(
      Math.round(viewW * 0.5 - state.ship.pos.x),
      Math.min(0, viewW - zone.width),
      0
    );
    const camY = clamp(
      Math.round(viewH * 0.5 - state.ship.pos.y),
      Math.min(0, viewH - zone.height),
      0
    );

    this.worldContainer.position.set(camX, camY);
    const bounds = computeCameraWorldBounds(camX, camY, viewW, viewH, 128);

    // 1. Pack visible island/gate shoreline circles into OceanWaterShaderPipeline uniforms
    this.scratchIslandCircles.length = 0;
    for (const isl of zone.islands) {
      if (this.scratchIslandCircles.length >= 8) break;
      if (!isCircleInBounds(bounds, isl.pos.x, isl.pos.y, isl.dockingRadiusPx + 60)) continue;
      this.scratchIslandCircles.push({
        screenX: isl.pos.x + camX,
        screenY: isl.pos.y + camY,
        radiusPx: Math.max(36, isl.dockingRadiusPx * 0.72),
        isGate: false
      });
    }
    if (zone.seaGate && this.scratchIslandCircles.length < 8) {
      if (isCircleInBounds(bounds, zone.seaGate.pos.x, zone.seaGate.pos.y, zone.seaGate.triggerRadiusPx + 70)) {
        this.scratchIslandCircles.push({
          screenX: zone.seaGate.pos.x + camX,
          screenY: zone.seaGate.pos.y + camY,
          radiusPx: Math.max(44, zone.seaGate.triggerRadiusPx * 0.72),
          isGate: true
        });
      }
    }

    this.oceanWater.update(
      zone.id,
      safeDt,
      this.elapsedSec,
      viewW,
      viewH,
      -camX,
      -camY,
      effectivePolish,
      this.scratchIslandCircles
    );

    // 2. Underwater Sea King shadows, Marineford ice floes, and zone weather atmosphere
    this.atmosphere.update(
      state,
      zone,
      camX,
      camY,
      viewW,
      viewH,
      tick,
      effectivePolish,
      bounds
    );

    // 3. Sea currents, whirlpools, pooled wake foam, 20 WebP landmarks, markers, sea objects & ship
    this.syncCurrentsAndWhirlpools(zone, tick, bounds);

    const activeShipId = telemetry?.activeShipId ?? resolveActiveShipId(state);
    const speedPx = telemetry?.shipSpeedPx ?? Math.hypot(state.ship.vel.x, state.ship.vel.y);
    const tailwindRatio = telemetry?.currentSample.tailwindRatio ?? stepInfo.currentTailwindRatio ?? 0;
    const wakeMult = telemetry?.wakeEmitMultiplier ?? 1;
    const sailBillow = telemetry?.sailBillowFactor ?? clamp(speedPx / 180, 0, 1);

    this.stepWakeFoamPool(
      state,
      speedPx,
      tailwindRatio,
      wakeMult,
      state.ship.coupDeBurstActiveTimer > 0,
      tick,
      bounds
    );

    this.syncLandmarksAndGates(
      state,
      rpgRegistry,
      zone,
      stepInfo.nearbyIsland,
      tick,
      bounds,
      worldMarkers
    );

    this.syncWorldMarkers(worldMarkers, tick, highlightGoldMarker, bounds);

    const roleBonuses = computeCrewRoleBonuses(state, rpgRegistry);
    this.syncDynamicSeaObjects(
      state,
      zone.id,
      roleBonuses.revealsHiddenChests,
      tick,
      bounds
    );

    this.syncPlayerShip(
      state,
      activeShipId,
      speedPx,
      tailwindRatio,
      sailBillow,
      tick
    );

    // 4. Night / Sunset Dynamic Bow Lantern & Port Beacons
    this.scratchLights.length = 0;
    const bowOffsetX = Math.cos(state.ship.headingRad) * 20;
    const bowOffsetY = Math.sin(state.ship.headingRad) * 16 - 4;
    const isDarkMood =
      effectivePolish.timeOfDay === 'NIGHT' || effectivePolish.timeOfDay === 'SUNSET';
    this.scratchLights.push({
      x: state.ship.pos.x + bowOffsetX + camX,
      y: state.ship.pos.y + bowOffsetY + camY,
      radiusPx: isDarkMood ? 148 : 88,
      colorInt: activeShipId === 'thousand_sunny' ? 0xfacc15 : 0xfef3c7,
      intensity: isDarkMood ? 0.92 : 0.45,
      flickerSpeed: 3.2,
      flickerAmp: effectivePolish.flashEffectEnabled ? 0.06 : 0.015,
      phaseOffset: 0
    });

    for (const isl of zone.islands) {
      if (this.scratchLights.length >= 16) break;
      if (!isCircleInBounds(bounds, isl.pos.x, isl.pos.y, isl.dockingRadiusPx + 60)) continue;
      this.scratchLights.push({
        x: isl.pos.x + camX,
        y: isl.pos.y - 12 + camY,
        radiusPx: 96,
        colorInt: isl.islandId === 'egghead' ? 0x38bdf8 : 0xfde68a,
        intensity: isDarkMood ? 0.68 : 0.3,
        flickerSpeed: 2.1,
        flickerAmp: effectivePolish.flashEffectEnabled ? 0.04 : 0.01,
        phaseOffset: isl.pos.x * 0.01
      });
    }

    if (zone.seaGate && this.scratchLights.length < 16) {
      if (isCircleInBounds(bounds, zone.seaGate.pos.x, zone.seaGate.pos.y, 140)) {
        this.scratchLights.push({
          x: zone.seaGate.pos.x + camX,
          y: zone.seaGate.pos.y + camY,
          radiusPx: 120,
          colorInt: 0x38bdf8,
          intensity: isDarkMood ? 0.75 : 0.35,
          flickerSpeed: 2.8,
          flickerAmp: 0.03,
          phaseOffset: 1.4
        });
      }
    }

    this.lastEmittedLightCount = this.scratchLights.length;
    this.lighting.renderPass(
      viewW,
      viewH,
      this.elapsedSec,
      this.scratchLights,
      effectivePolish
    );

    const gradeTint: [number, number, number] | undefined =
      zone.id === 'new_world'
        ? [0.92, 0.88, 1.08]
        : zone.id === 'grand_line'
          ? [0.94, 1.0, 1.08]
          : undefined;
    this.colorGrading.sync(effectivePolish, gradeTint);

    this.host.setSceneTelemetryTag(
      `SEA_${zone.id.toUpperCase()}_WEBGL2`,
      this.landmarkNodes.size + this.seaObjectNodes.size + 6
    );
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.root.filters = [];
    this.root.removeFromParent();
    this.clearZoneVisualCaches();

    this.oceanWater.dispose();
    this.atmosphere.dispose();
    this.lighting.dispose();
    this.colorGrading.dispose();

    this.wakeSlots.length = 0;
    this.scratchLights.length = 0;
    this.scratchIslandCircles.length = 0;
    this.shipSprite = null;
    this.shipPlaceholder = null;
    this.root.destroy({ children: true, texture: false });
  }
}
