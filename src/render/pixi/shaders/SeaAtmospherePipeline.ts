import { Container, Graphics, Sprite, Texture } from 'pixi.js';
import { clamp } from '../../../core/math/vector2';
import type { Disposable } from '../../../core/types/disposable';
import type {
  RpgCampaignState,
  SeaZoneDefinition,
  SeaZoneId
} from '../../../core/types/rpgSchemas';
import type { VisualPolishConfig } from '../../backend/renderBackend';
import { computeNewWorldLightningIntensity } from '../../sea/seaWeatherRenderer';
import {
  isCircleInBounds,
  type ViewportWorldBounds
} from '../../viewport/frustumCulling';

const WEATHER_PARTICLE_COUNT = 54;
const GULL_COUNT = 6;
const CLOUD_BAND_COUNT = 4;
const ICE_FLOE_COUNT = 8;
const MAX_SEA_KING_SHADOWS = 3;
const LIGHTNING_CYCLE_TICKS = 240;

interface WeatherParticleData {
  sprite: Sprite;
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  phase: number;
}

interface GullSlot {
  gfx: Graphics;
  x: number;
  y: number;
  speedX: number;
  phase: number;
  lastWingSign: number;
}

export class SeaAtmospherePipeline implements Disposable {
  public readonly underwaterLayer = new Container();
  public readonly overlayLayer = new Container();

  private readonly seaKingGfxPool: Graphics[] = [];
  private readonly iceFloePool: Graphics[] = [];

  private readonly tintBackdrop = new Graphics();
  private readonly mistBandPool: Graphics[] = [];
  private readonly gullPool: GullSlot[] = [];
  private readonly particles: WeatherParticleData[] = [];
  private readonly auroraGfx = new Graphics();
  private readonly lightningBoltGfx = new Graphics();
  private readonly lightningFlashQuad = new Graphics();

  private activeZoneId: SeaZoneId = 'east_blue';
  private activeSeaKingCount = 0;
  private drumBlossomActive = false;
  private lightningVisible = false;
  private lastTick = -1;
  private disposed = false;

  constructor() {
    this.underwaterLayer.label = 'sea_underwater_shadows_and_floes';
    this.overlayLayer.label = 'sea_weather_atmosphere_overlay';

    // Pre-allocate underwater Sea King sinuous 6-segment shadow graphics
    for (let i = 0; i < MAX_SEA_KING_SHADOWS; i++) {
      const g = new Graphics();
      for (let seg = 0; seg < 6; seg++) {
        const rad = 22 - seg * 2.5;
        g.ellipse(-seg * 26, Math.sin(seg * 0.8) * 6, rad, Math.round(rad * 0.52));
        g.fill({ color: 0x061024, alpha: 0.28 });
      }
      g.rect(-34, -14, 16, 6);
      g.fill({ color: 0x0f172a, alpha: 0.24 });
      g.visible = false;
      this.underwaterLayer.addChild(g);
      this.seaKingGfxPool.push(g);
    }

    // Pre-allocate Marineford floating ice floes
    for (let i = 0; i < ICE_FLOE_COUNT; i++) {
      const g = new Graphics();
      g.rect(-14, -7, 28, 14);
      g.fill({ color: 0xbae6fd, alpha: 0.72 });
      g.rect(-12, -6, 24, 9);
      g.fill({ color: 0xf8fafc, alpha: 0.92 });
      g.rect(-14, -7, 28, 14);
      g.stroke({ color: 0x38bdf8, width: 1 });
      g.visible = false;
      this.underwaterLayer.addChild(g);
      this.iceFloePool.push(g);
    }

    this.tintBackdrop.label = 'sea_weather_tint_quad';
    this.overlayLayer.addChild(this.tintBackdrop);

    this.auroraGfx.label = 'sea_elbaf_aurora';
    this.auroraGfx.blendMode = 'add';
    this.auroraGfx.visible = false;
    this.overlayLayer.addChild(this.auroraGfx);

    for (let i = 0; i < CLOUD_BAND_COUNT; i++) {
      const band = new Graphics();
      band.rect(0, 0, 240, 68);
      band.fill({ color: 0xffffff, alpha: 1 });
      band.visible = false;
      this.overlayLayer.addChild(band);
      this.mistBandPool.push(band);
    }

    for (let i = 0; i < GULL_COUNT; i++) {
      const g = new Graphics();
      g.visible = false;
      this.overlayLayer.addChild(g);
      this.gullPool.push({
        gfx: g,
        x: ((i * 211 + 40) % 1200),
        y: 44 + (i * 53) % 210,
        speedX: 0.85 + (i % 3) * 0.25,
        phase: i * 0.9,
        lastWingSign: 99
      });
    }

    for (let i = 0; i < WEATHER_PARTICLE_COUNT; i++) {
      const sp = new Sprite(Texture.WHITE);
      sp.anchor.set(0.5, 0.5);
      sp.visible = false;
      this.overlayLayer.addChild(sp);
      const h = (((i + 1) * 2654435761) >>> 0) % 1000;
      this.particles.push({
        sprite: sp,
        x: (h * 1.27) % 1260,
        y: (h * 3.13) % 540,
        vx: (i % 2 === 0 ? 1 : -1) * (0.4 + (i % 4) * 0.2),
        vy: 0.5 + (i % 5) * 0.3,
        size: 2 + (i % 3),
        phase: i * 0.65
      });
    }

    this.lightningFlashQuad.label = 'sea_lightning_flash_quad';
    this.lightningFlashQuad.blendMode = 'add';
    this.lightningFlashQuad.visible = false;
    this.overlayLayer.addChild(this.lightningFlashQuad);

    this.lightningBoltGfx.label = 'sea_lightning_bolt';
    this.lightningBoltGfx.visible = false;
    this.overlayLayer.addChild(this.lightningBoltGfx);
  }

  public get activeWeatherZone(): SeaZoneId {
    return this.activeZoneId;
  }

  public get isLightningVisible(): boolean {
    return this.lightningVisible;
  }

  public get activeDrumBlossomMode(): boolean {
    return this.drumBlossomActive;
  }

  public get activeSeaKingShadowCount(): number {
    return this.activeSeaKingCount;
  }

  public update(
    state: RpgCampaignState,
    zone: SeaZoneDefinition,
    camX: number,
    camY: number,
    viewW: number,
    viewH: number,
    tick: number,
    polish: VisualPolishConfig,
    visibleBounds?: ViewportWorldBounds
  ): void {
    if (this.disposed) return;
    this.activeZoneId = zone.id;
    const advance = this.lastTick === tick ? 0 : 1;
    this.lastTick = tick;

    this.underwaterLayer.position.set(Math.round(camX), Math.round(camY));
    this.updateUnderwaterEntities(zone, tick, visibleBounds);
    this.resetScreenOverlays();

    if (zone.id === 'east_blue') {
      this.drumBlossomActive = false;
      this.updateEastBlueWeather(state, viewW, viewH, tick, advance);
    } else if (zone.id === 'grand_line') {
      this.updateGrandLineWeather(state, zone, viewW, viewH, tick, advance);
    } else {
      this.drumBlossomActive = false;
      this.updateNewWorldWeather(
        state,
        zone,
        viewW,
        viewH,
        tick,
        advance,
        polish.flashEffectEnabled
      );
    }
  }

  private updateUnderwaterEntities(
    zone: SeaZoneDefinition,
    tick: number,
    visibleBounds?: ViewportWorldBounds
  ): void {
    const desiredCount = zone.id === 'new_world' ? 3 : zone.id === 'grand_line' ? 1 : 0;
    let shownShadows = 0;

    for (let i = 0; i < this.seaKingGfxPool.length; i++) {
      const g = this.seaKingGfxPool[i];
      if (!g) continue;
      if (i >= desiredCount) {
        g.visible = false;
        continue;
      }
      const spanW = zone.width + 320;
      const sx = ((tick * (0.85 + i * 0.25) + i * 740) % spanW) - 160;
      const sy = 240 + i * 330 + Math.sin(tick * 0.015 + i * 1.7) * 44;
      if (visibleBounds && !isCircleInBounds(visibleBounds, sx, sy, 150)) {
        g.visible = false;
        continue;
      }
      g.position.set(Math.round(sx), Math.round(sy));
      g.rotation = Math.sin(tick * 0.05 + i) * 0.08;
      g.visible = true;
      shownShadows += 1;
    }
    this.activeSeaKingCount = shownShadows;

    const marineford =
      zone.id === 'grand_line'
        ? zone.islands.find((isl) => isl.islandId === 'marineford')
        : undefined;
    for (let i = 0; i < this.iceFloePool.length; i++) {
      const g = this.iceFloePool[i];
      if (!g) continue;
      if (!marineford) {
        g.visible = false;
        continue;
      }
      const driftX = Math.sin(tick * 0.009 + i * 1.4) * 28;
      const driftY = Math.cos(tick * 0.008 + i * 1.1) * 16;
      const fx = marineford.pos.x + ((i % 4) - 1.5) * 95 + driftX;
      const fy = marineford.pos.y + (Math.floor(i / 4) - 0.5) * 160 + driftY;
      if (visibleBounds && !isCircleInBounds(visibleBounds, fx, fy, 42)) {
        g.visible = false;
        continue;
      }
      g.position.set(Math.round(fx), Math.round(fy));
      g.visible = true;
    }
  }

  private resetScreenOverlays(): void {
    this.tintBackdrop.clear();
    this.auroraGfx.visible = false;
    this.auroraGfx.clear();
    this.lightningBoltGfx.visible = false;
    this.lightningFlashQuad.visible = false;
    this.lightningVisible = false;
    for (const band of this.mistBandPool) band.visible = false;
    for (const gull of this.gullPool) gull.gfx.visible = false;
    for (const p of this.particles) p.sprite.visible = false;
  }

  private updateEastBlueWeather(
    state: RpgCampaignState,
    viewW: number,
    viewH: number,
    tick: number,
    advance: number
  ): void {
    if (state.seaWeather !== 'STORM') {
      this.tintBackdrop.rect(0, 0, viewW, viewH);
      this.tintBackdrop.fill({ color: 0xfde047, alpha: 0.05 });
    }

    for (let i = 0; i < this.gullPool.length; i++) {
      const g = this.gullPool[i];
      if (!g) continue;
      if (advance > 0) {
        g.x = (g.x + g.speedX) % (viewW + 40);
        g.y = (g.y + Math.sin(tick * 0.05 + g.phase) * 0.45 + viewH) % viewH;
      }
      const wing = Math.floor(tick / 10 + i) % 2 === 0 ? -2 : 1;
      if (wing !== g.lastWingSign) {
        g.lastWingSign = wing;
        g.gfx.clear();
        g.gfx.rect(-3, wing, 3, 2);
        g.gfx.rect(0, 0, 2, 2);
        g.gfx.rect(2, wing, 3, 2);
        g.gfx.fill({ color: 0xf8fafc, alpha: 0.88 });
      }
      g.gfx.position.set(Math.round(g.x - 20), Math.round(g.y));
      g.gfx.visible = true;
    }

    // Gentle sunlit water glints
    for (let i = 6; i < 18; i++) {
      const p = this.particles[i];
      if (!p) continue;
      if (advance > 0) {
        p.x = (p.x + 0.9 + (i % 3) * 0.25) % (viewW + 40);
        p.y = (p.y + Math.sin(tick * 0.05 + p.phase) * 0.35 + viewH) % viewH;
      }
      const sp = p.sprite;
      sp.position.set(Math.round(p.x - 20), Math.round(p.y));
      sp.width = 3;
      sp.height = 2;
      sp.rotation = 0;
      sp.tint = 0xe0f2fe;
      sp.alpha = 0.42;
      sp.visible = true;
    }

    this.applyGenericRainOrFog(state, viewW, viewH, tick, 18);
  }

  private updateGrandLineWeather(
    state: RpgCampaignState,
    zone: SeaZoneDefinition,
    viewW: number,
    viewH: number,
    tick: number,
    advance: number
  ): void {
    const proximity = (id: string, radius: number): number => {
      const isl = zone.islands.find((item) => item.islandId === id);
      if (!isl) return 0;
      const d = Math.hypot(state.ship.pos.x - isl.pos.x, state.ship.pos.y - isl.pos.y);
      return clamp(1 - d / radius, 0, 1);
    };

    const drumW = proximity('drum_kingdom', 340);
    const drumCleared = state.completedEpisodes.includes('ep_drum_kingdom');
    this.drumBlossomActive = drumW > 0.05 && drumCleared;
    const alabastaW = proximity('alabasta', 340);
    const thrillerW = proximity('thriller_bark', 360);

    if (drumW > 0.05) {
      this.tintBackdrop.rect(0, 0, viewW, viewH);
      this.tintBackdrop.fill({
        color: drumCleared ? 0xfbcfe8 : 0xe0f2fe,
        alpha: 0.08 * drumW
      });
      const count = Math.max(8, Math.round(28 * drumW));
      for (let i = 0; i < count; i++) {
        const p = this.particles[i];
        if (!p) continue;
        if (advance > 0) {
          p.x = (p.x + Math.sin(tick * 0.05 + p.phase) * 0.6 + viewW) % viewW;
          p.y = (p.y + 1.35) % viewH;
        }
        const sp = p.sprite;
        sp.position.set(Math.round(p.x), Math.round(p.y));
        sp.width = drumCleared && i % 3 === 0 ? 4 : p.size;
        sp.height = drumCleared && i % 3 === 0 ? 2.5 : p.size;
        sp.rotation = drumCleared && i % 3 === 0 ? (tick * 0.04 + i) % 3 : 0;
        sp.tint = drumCleared && i % 3 === 0 ? 0xf9a8d4 : 0xffffff;
        sp.alpha = 0.78 * drumW;
        sp.visible = true;
      }
    }

    if (alabastaW > 0.05) {
      this.tintBackdrop.rect(0, 0, viewW, viewH);
      this.tintBackdrop.fill({ color: 0xf59e0b, alpha: 0.14 * alabastaW });
      for (let i = 28; i < 46; i++) {
        const p = this.particles[i];
        if (!p) continue;
        if (advance > 0) {
          p.x = (p.x + 2.4) % viewW;
          p.y = (p.y + 0.35) % viewH;
        }
        const sp = p.sprite;
        sp.position.set(Math.round(p.x), Math.round(p.y));
        sp.width = 7;
        sp.height = 2;
        sp.rotation = 0;
        sp.tint = 0xfde68a;
        sp.alpha = 0.65 * alabastaW;
        sp.visible = true;
      }
    }

    if (thrillerW > 0.05) {
      this.tintBackdrop.rect(0, 0, viewW, viewH);
      this.tintBackdrop.fill({ color: 0x581c87, alpha: 0.24 * thrillerW });
      for (let m = 0; m < this.mistBandPool.length; m++) {
        const band = this.mistBandPool[m];
        if (!band) continue;
        const mx = ((tick * (0.4 + m * 0.15) + m * 290) % (viewW + 240)) - 240;
        const my = ((m * 130) % Math.max(120, viewH - 90)) + 20;
        band.position.set(Math.round(mx), Math.round(my));
        band.tint = 0xe2e8f0;
        band.alpha = 0.14 * thrillerW;
        band.visible = true;
      }
    }

    this.applyGenericRainOrFog(state, viewW, viewH, tick, 30);
  }

  private updateNewWorldWeather(
    state: RpgCampaignState,
    zone: SeaZoneDefinition,
    viewW: number,
    viewH: number,
    tick: number,
    advance: number,
    flashEffectEnabled: boolean
  ): void {
    const cloudMod = flashEffectEnabled ? 0 : Math.sin(tick * 0.025) * 0.03;
    for (let c = 0; c < this.mistBandPool.length; c++) {
      const band = this.mistBandPool[c];
      if (!band) continue;
      const cx = ((tick * (0.55 + c * 0.12) + c * 340) % (viewW + 260)) - 260;
      const cy = (c * 145 + 30) % Math.max(160, viewH - 80);
      band.position.set(Math.round(cx), Math.round(cy));
      band.tint = 0x090d18;
      band.alpha = 0.16 + cloudMod;
      band.visible = true;
    }

    // Diagonal storm rain
    const rainDensity = state.seaWeather === 'STORM' ? 40 : 18;
    for (let i = 0; i < rainDensity; i++) {
      const p = this.particles[i];
      if (!p) continue;
      if (advance > 0) {
        p.x = (p.x - 2.6 + viewW) % viewW;
        p.y = (p.y + 6.5) % viewH;
      }
      const sp = p.sprite;
      sp.position.set(Math.round(p.x), Math.round(p.y));
      sp.width = 2;
      sp.height = 14;
      sp.rotation = 0.38;
      sp.tint = 0xbae6fd;
      sp.alpha = state.seaWeather === 'STORM' ? 0.34 : 0.24;
      sp.visible = true;
    }

    // Elbaf proximity golden-emerald Norse aurora shimmer
    const elbaf = zone.islands.find((isl) => isl.islandId === 'elbaf');
    if (elbaf) {
      const dist = Math.hypot(state.ship.pos.x - elbaf.pos.x, state.ship.pos.y - elbaf.pos.y);
      const auroraW = clamp(1 - dist / 440, 0, 1);
      if (auroraW > 0.05) {
        this.auroraGfx.rect(0, 0, viewW, Math.round(viewH * 0.34));
        this.auroraGfx.fill({ color: 0xfacc15, alpha: 0.12 * auroraW });
        this.auroraGfx.rect(0, 14, viewW, 38);
        this.auroraGfx.fill({ color: 0x34d399, alpha: 0.08 * auroraW });
        this.auroraGfx.visible = true;
      }
    }

    // Distant lightning bolt & water flash — strictly disabled when flashEffectEnabled === false
    const flash = computeNewWorldLightningIntensity(tick, flashEffectEnabled);
    if (flash > 0) {
      this.lightningVisible = true;
      const boltX = ((Math.floor(tick / LIGHTNING_CYCLE_TICKS) * 317) % Math.max(240, viewW - 120)) + 60;
      this.lightningBoltGfx.clear();
      this.lightningBoltGfx
        .moveTo(boltX, 12)
        .lineTo(boltX - 10, 44)
        .lineTo(boltX + 8, 62)
        .lineTo(boltX - 6, 98)
        .stroke({ color: 0xf0f9ff, width: 2.5, alpha: 0.92 });
      this.lightningBoltGfx.visible = true;

      this.lightningFlashQuad.clear();
      this.lightningFlashQuad.rect(0, 0, viewW, viewH);
      this.lightningFlashQuad.fill({ color: 0xe0f2fe, alpha: flash });
      this.lightningFlashQuad.visible = true;
    }
  }

  private applyGenericRainOrFog(
    state: RpgCampaignState,
    viewW: number,
    viewH: number,
    tick: number,
    startIdx: number
  ): void {
    if (state.seaWeather === 'STORM') {
      for (let i = startIdx; i < Math.min(this.particles.length, startIdx + 24); i++) {
        const p = this.particles[i];
        if (!p) continue;
        const rx = ((i - startIdx) * 73 + tick * 8) % viewW;
        const ry = ((i - startIdx) * 59 + tick * 13) % viewH;
        const sp = p.sprite;
        sp.position.set(Math.round(rx), Math.round(ry));
        sp.width = 2;
        sp.height = 15;
        sp.rotation = 0.36;
        sp.tint = 0xbae6fd;
        sp.alpha = 0.28;
        sp.visible = true;
      }
    } else if (state.seaWeather === 'FOG') {
      this.tintBackdrop.rect(0, 0, viewW, viewH);
      this.tintBackdrop.fill({ color: 0xe2e8f0, alpha: 0.12 });
    }
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.underwaterLayer.removeFromParent();
    this.overlayLayer.removeFromParent();
    this.underwaterLayer.destroy({ children: true, texture: false });
    this.overlayLayer.destroy({ children: true, texture: false });
    this.seaKingGfxPool.length = 0;
    this.iceFloePool.length = 0;
    this.mistBandPool.length = 0;
    this.gullPool.length = 0;
    this.particles.length = 0;
  }
}
