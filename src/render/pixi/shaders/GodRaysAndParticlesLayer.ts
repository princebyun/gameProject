import { Container, Graphics, Sprite, Texture } from 'pixi.js';
import type { Disposable } from '../../../core/types/disposable';
import type { VisualPolishConfig } from '../../backend/renderBackend';
import { TIME_OF_DAY_PROFILES } from './glslUtils';

interface AmbientGpuParticle {
  sprite: Sprite;
  kind: 'LEAF' | 'DUST' | 'GULL' | 'SPRAY';
  x: number;
  y: number;
  vx: number;
  vy: number;
  phase: number;
}

const MAX_GPU_PARTICLES = 48;

export class GodRaysAndParticlesLayer implements Disposable {
  public readonly root = new Container();
  private readonly raysGfx = new Graphics();
  private readonly particleRoot = new Container();
  private readonly particles: AmbientGpuParticle[] = [];
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
      if (kind === 'GULL') {
        sp.width = 7;
        sp.height = 2;
        sp.tint = 0xf8fafc;
        sp.alpha = 0.85;
      } else if (kind === 'LEAF') {
        sp.width = 4;
        sp.height = 2;
        sp.tint = i % 2 === 0 ? 0x4ade80 : 0x86efac;
        sp.alpha = 0.78;
      } else if (kind === 'SPRAY') {
        sp.width = 3;
        sp.height = 3;
        sp.tint = 0xbae6fd;
        sp.alpha = 0.55;
      } else {
        sp.width = 2;
        sp.height = 2;
        sp.tint = 0xfef08a;
        sp.alpha = 0.65;
        sp.blendMode = 'add';
      }

      // Deterministic scatter seed
      const sx = ((i * 197 + 53) % 1260);
      const sy = ((i * 131 + 29) % 540);
      const vx = kind === 'GULL' ? 24 + (i % 4) * 5 : kind === 'LEAF' ? 14 + (i % 5) * 3 : 6;
      const vy = kind === 'GULL' ? 0 : kind === 'LEAF' ? 9 + (i % 3) * 4 : -4;
      this.particleRoot.addChild(sp);
      this.particles.push({
        sprite: sp,
        kind,
        x: sx,
        y: sy,
        vx,
        vy,
        phase: i * 0.7
      });
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
    polish: VisualPolishConfig
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
      this.raysGfx.alpha = 0.85 + Math.sin(timeSec * 0.7) * 0.15;
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
      if (p.kind === 'LEAF') {
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
