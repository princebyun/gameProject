import { Container, Graphics, Sprite, Texture } from 'pixi.js';
import type { Disposable } from '../../../core/types/disposable';
import type { VisualPolishConfig } from '../../backend/renderBackend';
import type { IslandParticleTheme } from '../scenes/islandAtmospherePresets';
import { TIME_OF_DAY_PROFILES } from './glslUtils';

interface AmbientGpuParticle {
  sprite: Sprite;
  kind: 'LEAF' | 'DUST' | 'GULL' | 'SPRAY';
  x: number;
  y: number;
  vx: number;
  vy: number;
  phase: number;
  baseAlpha: number;
}

const MAX_GPU_PARTICLES = 48;

export interface GodRaysExtraOptions {
  allowAtNight?: boolean;
  customRayHex?: number;
  groundFogColor?: number;
  groundFogAlpha?: number;
}

export class GodRaysAndParticlesLayer implements Disposable {
  public readonly root = new Container();
  private readonly groundFogGfx = new Graphics();
  private readonly raysGfx = new Graphics();
  private readonly particleRoot = new Container();
  private readonly particles: AmbientGpuParticle[] = [];
  private particleTheme: IslandParticleTheme = 'PORT';
  private lastRayMode = '';
  private lastWidth = 0;
  private lastRaysVisible = false;
  private lastFogVisible = false;
  private disposed = false;

  constructor() {
    this.root.label = 'godrays_and_particles_layer';
    this.groundFogGfx.label = 'island_ground_fog_layer';
    this.raysGfx.blendMode = 'add';
    this.root.addChild(this.groundFogGfx);
    this.root.addChild(this.raysGfx);
    this.root.addChild(this.particleRoot);

    for (let i = 0; i < MAX_GPU_PARTICLES; i++) {
      const sp = new Sprite(Texture.WHITE);
      sp.anchor.set(0.5, 0.5);
      const kind: AmbientGpuParticle['kind'] =
        i < 8 ? 'GULL' : i < 24 ? 'LEAF' : i < 36 ? 'DUST' : 'SPRAY';

      // Deterministic scatter seed
      const sx = ((i * 197 + 53) % 1260);
      const sy = ((i * 131 + 29) % 540);
      this.particleRoot.addChild(sp);
      this.particles.push({
        sprite: sp,
        kind,
        x: sx,
        y: sy,
        vx: 10,
        vy: 0,
        phase: i * 0.7,
        baseAlpha: 0.7
      });
    }
    this.applyParticleTheme('PORT');
  }

  public get isGodRaysVisible(): boolean {
    return this.lastRaysVisible;
  }

  public get isGroundFogVisible(): boolean {
    return this.lastFogVisible;
  }

  public get activeParticleTheme(): IslandParticleTheme {
    return this.particleTheme;
  }

  public setParticleTheme(theme: IslandParticleTheme): void {
    if (this.particleTheme === theme) return;
    this.applyParticleTheme(theme);
  }

  private applyParticleTheme(theme: IslandParticleTheme): void {
    this.particleTheme = theme;
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      if (!p) continue;
      const sp = p.sprite;
      const kind = p.kind;
      sp.rotation = 0;
      sp.scale.set(1, 1);
      sp.blendMode = 'normal';

      if (theme === 'DESERT') {
        if (i < 28) {
          sp.width = 9 + (i % 4) * 2;
          sp.height = 1.5;
          sp.tint = i % 2 === 0 ? 0xfde68a : 0xd97706;
          p.baseAlpha = 0.56;
          p.vx = 68 + (i % 6) * 11;
          p.vy = 2 + (i % 3);
        } else {
          sp.width = 3;
          sp.height = 2;
          sp.tint = 0xfef08a;
          p.baseAlpha = 0.48;
          p.vx = 42 + (i % 5) * 6;
          p.vy = -3 + (i % 4) * 2;
          sp.blendMode = 'add';
        }
        sp.alpha = p.baseAlpha;
        continue;
      }

      if (theme === 'WANO_SAKURA') {
        if (kind === 'DUST' || kind === 'GULL') {
          sp.width = 3;
          sp.height = 3;
          sp.tint = 0xfb923c;
          p.baseAlpha = 0.74;
          p.vx = 8 + (i % 4) * 2;
          p.vy = -10 - (i % 3) * 3;
          sp.blendMode = 'add';
        } else {
          sp.width = 4.5;
          sp.height = 2.5;
          sp.tint = i % 2 === 0 ? 0xfda4af : 0xfbcfe8;
          p.baseAlpha = 0.85;
          p.vx = 18 + (i % 5) * 4;
          p.vy = 11 + (i % 3) * 4;
        }
        sp.alpha = p.baseAlpha;
        continue;
      }

      if (theme === 'EGGHEAD_CYBER') {
        if (kind === 'SPRAY' || kind === 'GULL') {
          sp.width = 6;
          sp.height = 3;
          sp.tint = 0xe0f2fe;
          p.baseAlpha = 0.36;
          p.vx = 14 + (i % 4) * 3;
          p.vy = -2;
        } else {
          sp.width = 3;
          sp.height = 3;
          sp.tint = i % 2 === 0 ? 0x38bdf8 : 0xf472b6;
          p.baseAlpha = 0.76;
          p.vx = 10 + (i % 5) * 3;
          p.vy = -9 - (i % 4) * 3;
          sp.blendMode = 'add';
        }
        sp.alpha = p.baseAlpha;
        continue;
      }

      if (theme === 'ORANGE_SMOKE') {
        if (i < 30) {
          sp.width = 10 + (i % 5) * 3;
          sp.height = 5 + (i % 3) * 1.5;
          sp.tint = i % 2 === 0 ? 0x94a3b8 : 0x64748b;
          p.baseAlpha = 0.38;
          p.vx = 10 + (i % 4) * 3;
          p.vy = -12 - (i % 4) * 3;
        } else {
          sp.width = 3;
          sp.height = 3;
          sp.tint = i % 2 === 0 ? 0xf97316 : 0xfbbf24;
          p.baseAlpha = 0.78;
          p.vx = 8 + (i % 5) * 3;
          p.vy = -18 - (i % 4) * 4;
          sp.blendMode = 'add';
        }
        sp.alpha = p.baseAlpha;
        continue;
      }

      if (theme === 'RAIN_STORM') {
        sp.width = 1.5;
        sp.height = 10 + (i % 4) * 3;
        sp.tint = i % 3 === 0 ? 0xbae6fd : 0x7dd3fc;
        p.baseAlpha = 0.62;
        p.vx = -38 - (i % 4) * 6;
        p.vy = 210 + (i % 5) * 24;
        sp.rotation = 0.18;
        sp.alpha = p.baseAlpha;
        continue;
      }

      if (theme === 'SNOW_PEAK' || theme === 'SAKURA_SNOW') {
        const isSakura = theme === 'SAKURA_SNOW';
        sp.width = isSakura ? 4.5 : 3 + (i % 2);
        sp.height = isSakura ? 2.5 : 3 + (i % 2);
        sp.tint = isSakura
          ? i % 2 === 0
            ? 0xf9a8d4
            : 0xfce7f3
          : i % 3 === 0
            ? 0xe0f2fe
            : 0xf8fafc;
        p.baseAlpha = isSakura ? 0.86 : 0.82;
        p.vx = (isSakura ? 18 : 10) + (i % 5) * 3;
        p.vy = (isSakura ? 14 : 22) + (i % 4) * 5;
        sp.alpha = p.baseAlpha;
        continue;
      }

      if (theme === 'SKY_CLOUD') {
        sp.width = i < 20 ? 12 + (i % 4) * 3 : 3;
        sp.height = i < 20 ? 4 : 3;
        sp.tint = i < 20 ? 0xf0f9ff : 0xfef08a;
        p.baseAlpha = i < 20 ? 0.34 : 0.72;
        p.vx = i < 20 ? 18 + (i % 4) * 4 : 8;
        p.vy = i < 20 ? -1 : -8 - (i % 3) * 3;
        if (i >= 20) sp.blendMode = 'add';
        sp.alpha = p.baseAlpha;
        continue;
      }

      if (theme === 'SPOOKY_MIST') {
        if (i < 16) {
          // Silhouetted flapping bats + spectral violet eyes
          sp.width = 7;
          sp.height = 2.5;
          sp.tint = i % 4 === 0 ? 0xc084fc : 0x1e1b4b;
          p.baseAlpha = 0.85;
          p.vx = 28 + (i % 5) * 6;
          p.vy = -4 + (i % 3) * 4;
        } else {
          sp.width = 12 + (i % 4) * 3;
          sp.height = 4.5;
          sp.tint = i % 2 === 0 ? 0xa855f7 : 0x2dd4bf;
          p.baseAlpha = 0.3;
          p.vx = 10 + (i % 3) * 3;
          p.vy = -3;
          sp.blendMode = 'add';
        }
        sp.alpha = p.baseAlpha;
        continue;
      }

      if (theme === 'MARINE_ICE') {
        if (i < 16) {
          // Battle cannon smoke clouds
          sp.width = 10 + (i % 4) * 3;
          sp.height = 5;
          sp.tint = 0x94a3b8;
          p.baseAlpha = 0.42;
          p.vx = 18 + (i % 4) * 4;
          p.vy = -10 - (i % 3) * 2;
        } else if (i < 32) {
          // Kuzan ice crystals
          sp.width = 3;
          sp.height = 3;
          sp.tint = 0xe0f2fe;
          p.baseAlpha = 0.74;
          p.vx = 14 + (i % 4) * 4;
          p.vy = 20 + (i % 4) * 5;
        } else {
          // Akainu magma embers
          sp.width = 3.5;
          sp.height = 3.5;
          sp.tint = i % 2 === 0 ? 0xf97316 : 0xfacc15;
          p.baseAlpha = 0.8;
          p.vx = 12 + (i % 5) * 3;
          p.vy = -15 - (i % 4) * 4;
          sp.blendMode = 'add';
        }
        sp.alpha = p.baseAlpha;
        continue;
      }

      if (theme === 'UNDERWATER_BUBBLE') {
        sp.width = 3 + (i % 3) * 1.5;
        sp.height = 3 + (i % 3) * 1.5;
        sp.tint = i % 3 === 0 ? 0x5eead4 : 0xbae6fd;
        p.baseAlpha = 0.62;
        p.vx = 4 + (i % 3) * 2;
        p.vy = -18 - (i % 5) * 5;
        sp.blendMode = 'add';
        sp.alpha = p.baseAlpha;
        continue;
      }

      if (theme === 'DRESSROSA_PETAL' || theme === 'SUGAR_SPARKLE' || theme === 'ELBAF_GOLDEN') {
        const isElbafSpark = theme === 'ELBAF_GOLDEN' && i >= 36;
        sp.width = theme === 'SUGAR_SPARKLE' || isElbafSpark ? 3 : 4.5;
        sp.height = theme === 'SUGAR_SPARKLE' ? 3 : isElbafSpark ? 9 : 2.5;
        sp.tint =
          theme === 'DRESSROSA_PETAL'
            ? i % 2 === 0
              ? 0xfb7185
              : 0xfacc15
            : theme === 'SUGAR_SPARKLE'
              ? i % 2 === 0
                ? 0xf472b6
                : 0xfef08a
              : isElbafSpark
                ? 0x38bdf8
                : i % 2 === 0
                  ? 0xfacc15
                  : 0xa3e635;
        p.baseAlpha = isElbafSpark ? 0.85 : 0.8;
        p.vx = isElbafSpark ? 4 : 16 + (i % 5) * 4;
        p.vy = theme === 'SUGAR_SPARKLE' ? -8 + (i % 4) * 4 : isElbafSpark ? 55 : 11 + (i % 3) * 4;
        if (theme === 'SUGAR_SPARKLE' || isElbafSpark || (theme === 'ELBAF_GOLDEN' && i % 3 === 0)) {
          sp.blendMode = 'add';
        }
        sp.alpha = p.baseAlpha;
        continue;
      }

      // PORT & CANAL
      if (kind === 'GULL') {
        sp.width = 7;
        sp.height = 2;
        sp.tint = 0xf8fafc;
        p.baseAlpha = 0.85;
        p.vx = 24 + (i % 4) * 5;
        p.vy = 0;
      } else if (kind === 'LEAF') {
        sp.width = 4;
        sp.height = 2;
        sp.tint = theme === 'CANAL' ? 0x7dd3fc : i % 2 === 0 ? 0x4ade80 : 0x86efac;
        p.baseAlpha = theme === 'CANAL' ? 0.62 : 0.78;
        p.vx = 14 + (i % 5) * 3;
        p.vy = 9 + (i % 3) * 4;
      } else if (kind === 'SPRAY') {
        sp.width = 3;
        sp.height = 3;
        sp.tint = theme === 'CANAL' ? 0x38bdf8 : 0xbae6fd;
        p.baseAlpha = theme === 'CANAL' ? 0.68 : 0.55;
        p.vx = 6;
        p.vy = -4;
      } else {
        sp.width = 2;
        sp.height = 2;
        sp.tint = 0xfef08a;
        p.baseAlpha = 0.65;
        p.vx = 6;
        p.vy = -4;
        sp.blendMode = 'add';
      }
      sp.alpha = p.baseAlpha;
    }
  }

  private rebuildRaysIfNeeded(
    viewW: number,
    viewH: number,
    polish: VisualPolishConfig,
    customRayHex?: number,
    allowAtNight = false
  ): void {
    const profile = TIME_OF_DAY_PROFILES[polish.timeOfDay];
    const modeKey = `${polish.timeOfDay}_${viewW}_${viewH}_${customRayHex ?? -1}_${allowAtNight ? 1 : 0}`;
    if (this.lastRayMode === modeKey && this.lastWidth === viewW) return;
    this.lastRayMode = modeKey;
    this.lastWidth = viewW;

    this.raysGfx.clear();
    const effectiveAlpha =
      profile.godRayAlpha > 0.01 ? profile.godRayAlpha : allowAtNight ? 0.18 : 0;
    if (effectiveAlpha <= 0.01) return;

    const rayHex = customRayHex ?? profile.godRayHex;
    const lean = polish.timeOfDay === 'MORNING' ? -80 : polish.timeOfDay === 'SUNSET' ? 120 : 60;
    const beamOffsets = [0.12, 0.34, 0.61, 0.82];
    for (let i = 0; i < beamOffsets.length; i++) {
      const ratio = beamOffsets[i] ?? 0.5;
      const topX = viewW * ratio;
      const wTop = 34 + (i % 2) * 18;
      const wBot = 92 + (i % 2) * 28;
      this.raysGfx
        .poly([
          topX,
          -10,
          topX + wTop,
          -10,
          topX + lean + wBot,
          viewH + 10,
          topX + lean,
          viewH + 10
        ])
        .fill({ color: rayHex, alpha: effectiveAlpha * (i % 2 === 0 ? 1 : 0.72) });
    }
  }

  public update(
    dtSec: number,
    timeSec: number,
    viewW: number,
    viewH: number,
    polish: VisualPolishConfig,
    godRayAlphaMult = 1.0,
    extraOptions?: GodRaysExtraOptions
  ): void {
    if (this.disposed) return;
    if (!polish.godRaysAndParticles) {
      this.root.visible = false;
      this.lastRaysVisible = false;
      this.lastFogVisible = false;
      return;
    }

    this.root.visible = true;
    const raysAllowed =
      polish.quality !== 'LOW' &&
      (polish.timeOfDay !== 'NIGHT' || Boolean(extraOptions?.allowAtNight));
    this.raysGfx.visible = raysAllowed;
    this.lastRaysVisible = raysAllowed;
    if (raysAllowed) {
      this.rebuildRaysIfNeeded(
        viewW,
        viewH,
        polish,
        extraOptions?.customRayHex,
        Boolean(extraOptions?.allowAtNight)
      );
      this.raysGfx.alpha = Math.min(1, (0.85 + Math.sin(timeSec * 0.7) * 0.15) * godRayAlphaMult);
    }

    // Low-lying atmospheric fog bands (e.g. Thriller Bark spectral mist)
    this.groundFogGfx.clear();
    if (
      polish.quality !== 'LOW' &&
      extraOptions?.groundFogColor !== undefined &&
      (extraOptions.groundFogAlpha ?? 0) > 0
    ) {
      this.groundFogGfx.visible = true;
      this.lastFogVisible = true;
      const fogAlpha = extraOptions.groundFogAlpha ?? 0.2;
      for (let i = 0; i < 3; i++) {
        const y = Math.round(viewH * (0.58 + i * 0.14) + Math.sin(timeSec * 0.8 + i) * 6);
        const h = Math.round(viewH * 0.13);
        this.groundFogGfx.rect(-10, y, viewW + 20, h);
        this.groundFogGfx.fill({
          color: extraOptions.groundFogColor,
          alpha: fogAlpha * (1 - i * 0.2)
        });
      }
    } else {
      this.groundFogGfx.visible = false;
      this.lastFogVisible = false;
    }

    const activeCount =
      polish.quality === 'LOW'
        ? 14
        : polish.quality === 'MEDIUM'
          ? 28
          : MAX_GPU_PARTICLES;

    const dt = Math.min(0.05, Math.max(0.001, dtSec));
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      if (!p) continue;
      if (i >= activeCount) {
        p.sprite.visible = false;
        continue;
      }
      p.sprite.visible = true;

      p.x += p.vx * dt;
      p.y += p.vy * dt + Math.sin(timeSec * 2.2 + p.phase) * (p.kind === 'GULL' ? 0.25 : 0.15);

      if (p.x > viewW + 20) p.x = -20;
      if (p.y > viewH + 16) p.y = -16;
      if (p.y < -20) p.y = viewH + 12;

      p.sprite.position.set(Math.round(p.x), Math.round(p.y));
      if (this.particleTheme === 'DESERT') {
        p.sprite.alpha = p.baseAlpha * (0.75 + 0.25 * Math.sin(timeSec * 3.1 + p.phase));
      } else if (
        this.particleTheme === 'WANO_SAKURA' ||
        this.particleTheme === 'SAKURA_SNOW' ||
        this.particleTheme === 'DRESSROSA_PETAL'
      ) {
        p.sprite.rotation = Math.sin(timeSec * 2.6 + p.phase) * 0.75;
        p.sprite.alpha = p.baseAlpha;
      } else if (this.particleTheme === 'ELBAF_GOLDEN') {
        if (i >= 36) {
          p.sprite.alpha = polish.flashEffectEnabled
            ? p.baseAlpha * (0.45 + 0.55 * Math.abs(Math.sin(timeSec * 14 + p.phase)))
            : p.baseAlpha * 0.2;
        } else {
          p.sprite.rotation = Math.sin(timeSec * 2.6 + p.phase) * 0.75;
          p.sprite.alpha = p.baseAlpha;
        }
      } else if (this.particleTheme === 'ORANGE_SMOKE') {
        p.sprite.alpha = p.baseAlpha * (0.65 + 0.35 * Math.sin(timeSec * 2.4 + p.phase));
      } else if (
        this.particleTheme === 'EGGHEAD_CYBER' ||
        this.particleTheme === 'SUGAR_SPARKLE' ||
        this.particleTheme === 'UNDERWATER_BUBBLE'
      ) {
        const pulseAmp = polish.flashEffectEnabled ? 0.32 : 0.1;
        p.sprite.alpha = p.baseAlpha * (1 - pulseAmp + pulseAmp * Math.sin(timeSec * 3.2 + p.phase));
      } else if (this.particleTheme === 'RAIN_STORM') {
        p.sprite.alpha = polish.flashEffectEnabled ? p.baseAlpha : p.baseAlpha * 0.7;
      } else if (this.particleTheme === 'SPOOKY_MIST') {
        if (i < 16) {
          p.sprite.scale.y = 0.75 + Math.abs(Math.sin(timeSec * 7.5 + p.phase)) * 1.45;
        }
        p.sprite.alpha = p.baseAlpha * (0.7 + 0.3 * Math.sin(timeSec * 2.1 + p.phase));
      } else if (p.kind === 'LEAF') {
        p.sprite.rotation = Math.sin(timeSec * 3.1 + p.phase) * 0.65;
      } else if (p.kind === 'GULL') {
        p.sprite.scale.y = 0.8 + Math.abs(Math.sin(timeSec * 6.5 + p.phase)) * 1.4;
      } else if (p.kind === 'DUST') {
        p.sprite.tint = polish.timeOfDay === 'NIGHT' ? 0xbae6fd : 0xfef08a;
        p.sprite.alpha =
          (polish.timeOfDay === 'NIGHT' ? 0.72 : 0.55) *
          (0.65 + 0.35 * Math.sin(timeSec * 2.8 + p.phase));
      }
    }
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.particles.length = 0;
    this.root.destroy({ children: true, texture: false });
  }
}
