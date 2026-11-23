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

export class GodRaysAndParticlesLayer implements Disposable {
  public readonly root = new Container();
  private readonly raysGfx = new Graphics();
  private readonly particleRoot = new Container();
  private readonly particles: AmbientGpuParticle[] = [];
  private particleTheme: IslandParticleTheme = 'PORT';
  private lastRayMode = '';
  private lastWidth = 0;
  private disposed = false;

  constructor() {
    this.root.label = 'godrays_and_particles_layer';
    this.raysGfx.blendMode = 'add';
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

  private rebuildRaysIfNeeded(viewW: number, viewH: number, polish: VisualPolishConfig): void {
    const profile = TIME_OF_DAY_PROFILES[polish.timeOfDay];
    const modeKey = `${polish.timeOfDay}_${viewW}_${viewH}`;
    if (this.lastRayMode === modeKey && this.lastWidth === viewW) return;
    this.lastRayMode = modeKey;
    this.lastWidth = viewW;

    this.raysGfx.clear();
    if (profile.godRayAlpha <= 0.01) return;

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
        .fill({ color: profile.godRayHex, alpha: profile.godRayAlpha * (i % 2 === 0 ? 1 : 0.72) });
    }
  }

  public update(
    dtSec: number,
    timeSec: number,
    viewW: number,
    viewH: number,
    polish: VisualPolishConfig,
    godRayAlphaMult = 1.0
  ): void {
    if (this.disposed) return;
    if (!polish.godRaysAndParticles) {
      this.root.visible = false;
      return;
    }

    this.root.visible = true;
    const raysAllowed = polish.quality !== 'LOW' && polish.timeOfDay !== 'NIGHT';
    this.raysGfx.visible = raysAllowed;
    if (raysAllowed) {
      this.rebuildRaysIfNeeded(viewW, viewH, polish);
      this.raysGfx.alpha = Math.min(1, (0.85 + Math.sin(timeSec * 0.7) * 0.15) * godRayAlphaMult);
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
      } else if (this.particleTheme === 'WANO_SAKURA') {
        p.sprite.rotation = Math.sin(timeSec * 2.6 + p.phase) * 0.75;
        p.sprite.alpha = p.baseAlpha;
      } else if (this.particleTheme === 'EGGHEAD_CYBER') {
        const pulseAmp = polish.flashEffectEnabled ? 0.35 : 0.1;
        p.sprite.alpha = p.baseAlpha * (1 - pulseAmp + pulseAmp * Math.sin(timeSec * 3.2 + p.phase));
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
