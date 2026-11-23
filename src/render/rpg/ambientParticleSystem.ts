import type {
  IslandAmbientParticleKind,
  IslandAmbientProfile
} from '../../core/types/rpgSchemas';
import { ObjectPool } from '../pools/renderScratchPools';

export interface AmbientParticleItem {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  phase: number;
  kind:
    | 'PETAL'
    | 'SAND'
    | 'SNOW'
    | 'SPRAY'
    | 'HOLOGRAM'
    | 'EMBER'
    | 'GULL'
    | 'LEAF'
    | 'DROPLET'
    | 'LANTERN_MOTE'
    | 'CLOUD_MIST';
  color: string;
  alpha: number;
}

const MAX_AMBIENT_PARTICLES = 42;

/**
 * Layer-5 Biome Ambient Particle System backed by a bounded ObjectPool (0 GC).
 * Renders sakura petals, desert sand, snow, sea spray/gulls, cyber motes, and embers.
 */
export class AmbientParticleSystem {
  private readonly pool = new ObjectPool<AmbientParticleItem>(
    () => ({
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      size: 3,
      phase: 0,
      kind: 'SPRAY',
      color: '#e2e8f0',
      alpha: 0.7
    }),
    (p) => {
      p.x = 0;
      p.y = 0;
      p.vx = 0;
      p.vy = 0;
      p.size = 3;
      p.phase = 0;
      p.kind = 'SPRAY';
      p.color = '#e2e8f0';
      p.alpha = 0.7;
    },
    32,
    96
  );
  private readonly active: AmbientParticleItem[] = [];
  private activeBiomeId = '';
  private lastTick = -1;

  public get pooledFreeCount(): number {
    return this.pool.pooledCount;
  }

  public get createdPoolCount(): number {
    return this.pool.createdCount;
  }

  public get activeCount(): number {
    return this.active.length;
  }

  public clear(): void {
    while (this.active.length > 0) {
      const p = this.active.pop();
      if (p) this.pool.release(p);
    }
    this.activeBiomeId = '';
  }

  public stepAndRender(
    ctx: CanvasRenderingContext2D,
    biomeId: string,
    viewW: number,
    viewH: number,
    tick: number,
    profile?: IslandAmbientProfile
  ): void {
    const profileKey = profile ? `${biomeId}_${profile.particles.join('_')}_${profile.density}` : biomeId;
    if (this.activeBiomeId !== profileKey) {
      this.clear();
      this.activeBiomeId = profileKey;
      this.seedParticles(biomeId, viewW, viewH, profile);
    }

    const stepDelta = this.lastTick === tick ? 0 : 1;
    this.lastTick = tick;

    ctx.save();
    for (let i = 0; i < this.active.length; i++) {
      const p = this.active[i];
      if (!p) continue;
      if (stepDelta > 0) {
        const sway =
          p.kind === 'PETAL' || p.kind === 'LEAF'
            ? Math.sin(tick * 0.08 + p.phase) * 0.35
            : 0;
        p.x += p.vx;
        p.y += p.vy + sway;
        if (p.x > viewW + 16) p.x = -12;
        if (p.x < -16) p.x = viewW + 12;
        if (p.y > viewH + 12) p.y = -10;
        if (p.y < -16) p.y = viewH + 10;
      }

      const rx = Math.round(p.x);
      const ry = Math.round(p.y);
      ctx.globalAlpha = p.alpha;
      if (p.kind === 'GULL') {
        const wing = Math.sin(tick * 0.14 + p.phase) * 3;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(rx - 5, ry + wing);
        ctx.lineTo(rx, ry);
        ctx.lineTo(rx + 5, ry + wing);
        ctx.stroke();
      } else if (p.kind === 'SAND') {
        ctx.fillStyle = p.color;
        ctx.fillRect(rx, ry, p.size + 4, 2);
      } else if (p.kind === 'CLOUD_MIST') {
        ctx.fillStyle = p.color;
        ctx.fillRect(rx, ry, p.size * 5, p.size);
      } else if (p.kind === 'PETAL' || p.kind === 'LEAF') {
        ctx.fillStyle = p.color;
        ctx.fillRect(rx, ry, p.size, p.size - 1);
        ctx.fillRect(rx + 1, ry + 1, p.size - 1, p.size - 1);
      } else {
        ctx.fillStyle = p.color;
        ctx.fillRect(rx, ry, p.size, p.size);
      }
    }
    ctx.restore();
  }

  private applyExplicitKind(p: AmbientParticleItem, kind: IslandAmbientParticleKind, i: number): void {
    p.kind = kind;
    if (kind === 'GULL') {
      p.color = '#f8fafc';
      p.vx = 0.7;
      p.vy = 0.05;
      p.size = 2;
      p.alpha = 0.65;
    } else if (kind === 'LEAF') {
      p.color = i % 2 === 0 ? '#4ade80' : '#86efac';
      p.vx = 0.45 + (i % 3) * 0.15;
      p.vy = 0.35 + (i % 2) * 0.2;
      p.size = 3;
      p.alpha = 0.72;
    } else if (kind === 'DROPLET') {
      p.color = '#e0f2fe';
      p.vx = ((i % 3) - 1) * 0.15;
      p.vy = -0.35 - (i % 2) * 0.2;
      p.size = 2;
      p.alpha = 0.58;
    } else if (kind === 'PETAL') {
      p.color = i % 2 === 0 ? '#fda4af' : '#f472b6';
      p.vx = 0.55 + (i % 3) * 0.2;
      p.vy = 0.42 + (i % 2) * 0.25;
      p.size = 4;
      p.alpha = 0.8;
    } else if (kind === 'LANTERN_MOTE') {
      p.color = '#fde047';
      p.vx = ((i % 2) * 2 - 1) * 0.18;
      p.vy = -0.32 - (i % 3) * 0.1;
      p.size = 3;
      p.alpha = 0.7;
    } else if (kind === 'HOLOGRAM') {
      p.color = i % 2 === 0 ? '#22d3ee' : '#c084fc';
      p.vx = 0;
      p.vy = -0.55 - (i % 3) * 0.15;
      p.size = 3;
      p.alpha = 0.7;
    } else if (kind === 'CLOUD_MIST') {
      p.color = '#bae6fd';
      p.vx = 0.38;
      p.vy = 0;
      p.size = 3;
      p.alpha = 0.28;
    } else {
      p.color = '#bae6fd';
      p.vx = 0.45;
      p.vy = -0.15;
      p.size = 2;
      p.alpha = 0.38;
    }
  }

  private seedParticles(
    biomeId: string,
    viewW: number,
    viewH: number,
    profile?: IslandAmbientProfile
  ): void {
    const count = Math.min(MAX_AMBIENT_PARTICLES, profile?.density ?? 28);
    for (let i = 0; i < count && this.active.length < MAX_AMBIENT_PARTICLES; i++) {
      const p = this.pool.acquire();
      const s = ((i + 1) * 2654435761) >>> 0;
      p.x = s % Math.max(320, viewW);
      p.y = (s >>> 8) % Math.max(240, viewH);
      p.phase = (i * 0.7) % (Math.PI * 2);

      if (profile && profile.particles.length > 0) {
        const chosen = profile.particles[i % profile.particles.length] ?? 'SPRAY';
        this.applyExplicitKind(p, chosen, i);
        this.active.push(p);
        continue;
      }

      if (biomeId === 'wano_castle') {
        p.kind = 'PETAL';
        p.color = i % 2 === 0 ? '#fda4af' : '#f472b6';
        p.vx = 0.5 + (i % 3) * 0.2;
        p.vy = 0.4 + (i % 2) * 0.25;
        p.size = 4;
        p.alpha = 0.78;
      } else if (biomeId === 'desert_alabasta') {
        p.kind = 'SAND';
        p.color = '#fde68a';
        p.vx = 1.6 + (i % 4) * 0.4;
        p.vy = 0.12;
        p.size = 3;
        p.alpha = 0.42;
      } else if (biomeId === 'snow_drum' || biomeId === 'marine_ice') {
        p.kind = 'SNOW';
        p.color = i % 4 === 0 ? '#bae6fd' : '#f8fafc';
        p.vx = 0.25 - (i % 3) * 0.2;
        p.vy = 0.65 + (i % 3) * 0.25;
        p.size = i % 3 === 0 ? 3 : 2;
        p.alpha = 0.72;
      } else if (biomeId === 'egghead_cyber') {
        p.kind = 'HOLOGRAM';
        p.color = i % 2 === 0 ? '#22d3ee' : '#c084fc';
        p.vx = 0;
        p.vy = -0.55 - (i % 3) * 0.15;
        p.size = 3;
        p.alpha = 0.68;
      } else if (biomeId === 'impel_hell') {
        p.kind = 'EMBER';
        p.color = i % 2 === 0 ? '#f97316' : '#ef4444';
        p.vx = i % 2 === 0 ? 0.35 : -0.25;
        p.vy = -0.75 - (i % 3) * 0.25;
        p.size = 3;
        p.alpha = 0.74;
      } else {
        p.kind = i % 7 === 0 ? 'GULL' : 'SPRAY';
        p.color = i % 7 === 0 ? '#f8fafc' : '#bae6fd';
        p.vx = i % 7 === 0 ? 0.65 : 0.45;
        p.vy = i % 7 === 0 ? 0.04 : -0.15;
        p.size = 2;
        p.alpha = i % 7 === 0 ? 0.55 : 0.35;
      }
      this.active.push(p);
    }
  }
}
