import type { SurfaceMaterialId } from '../../core/types/rpgSchemas';
import { ObjectPool } from '../pools/renderScratchPools';
import { isCircleInBounds, type ViewportWorldBounds } from '../viewport/frustumCulling';

interface FootstepEffectItem {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  kind: 'DUST' | 'RIPPLE' | 'SPARK';
  color: string;
}

const MAX_ACTIVE_FOOTSTEPS = 32;

/**
 * Pooled ground footstep dust/water-ripple/cyber-spark renderer (0 GC).
 */
export class FootstepEffectPool {
  private readonly pool = new ObjectPool<FootstepEffectItem>(
    () => ({
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      life: 0,
      maxLife: 18,
      size: 3,
      kind: 'DUST',
      color: '#cbd5e1'
    }),
    (p) => {
      p.life = 0;
    },
    24,
    48
  );
  private readonly active: FootstepEffectItem[] = [];
  private lastTick = -1;

  public get activeCount(): number {
    return this.active.length;
  }

  public clear(): void {
    while (this.active.length > 0) {
      const item = this.active.pop();
      if (item) this.pool.release(item);
    }
  }

  public spawn(material: SurfaceMaterialId, worldX: number, worldY: number): void {
    if (this.active.length >= MAX_ACTIVE_FOOTSTEPS) {
      const oldest = this.active.shift();
      if (oldest) this.pool.release(oldest);
    }

    const p = this.pool.acquire();
    p.x = worldX;
    p.y = worldY + 11;
    p.life = 1;

    if (material === 'water_shallow') {
      p.kind = 'RIPPLE';
      p.vx = 0;
      p.vy = 0;
      p.maxLife = 24;
      p.size = 6;
      p.color = '#7dd3fc';
    } else if (material === 'metal_cyber') {
      p.kind = 'SPARK';
      p.vx = ((this.active.length % 2) * 2 - 1) * 0.45;
      p.vy = -0.35;
      p.maxLife = 16;
      p.size = 3;
      p.color = '#22d3ee';
    } else if (material === 'sand') {
      p.kind = 'DUST';
      p.vx = ((this.active.length % 2) * 2 - 1) * 0.35;
      p.vy = -0.25;
      p.maxLife = 18;
      p.size = 4;
      p.color = '#fde68a';
    } else if (material === 'grass') {
      p.kind = 'DUST';
      p.vx = ((this.active.length % 2) * 2 - 1) * 0.4;
      p.vy = -0.4;
      p.maxLife = 18;
      p.size = 3;
      p.color = '#86efac';
    } else if (material === 'snow') {
      p.kind = 'DUST';
      p.vx = ((this.active.length % 2) * 2 - 1) * 0.35;
      p.vy = -0.3;
      p.maxLife = 18;
      p.size = 4;
      p.color = '#f8fafc';
    } else if (material === 'wood_dock') {
      p.kind = 'DUST';
      p.vx = 0;
      p.vy = -0.2;
      p.maxLife = 14;
      p.size = 3;
      p.color = '#d97706';
    } else {
      p.kind = 'DUST';
      p.vx = ((this.active.length % 2) * 2 - 1) * 0.3;
      p.vy = -0.25;
      p.maxLife = 16;
      p.size = 3;
      p.color = '#cbd5e1';
    }
    this.active.push(p);
  }

  public stepAndRender(
    ctx: CanvasRenderingContext2D,
    tick: number,
    bounds: ViewportWorldBounds
  ): void {
    const advance = this.lastTick === tick ? 0 : 1;
    this.lastTick = tick;

    ctx.save();
    for (let i = this.active.length - 1; i >= 0; i--) {
      const p = this.active[i];
      if (!p) continue;
      if (advance > 0) {
        p.x += p.vx;
        p.y += p.vy;
        p.life += 1;
        if (p.life >= p.maxLife) {
          this.active.splice(i, 1);
          this.pool.release(p);
          continue;
        }
      }
      if (!isCircleInBounds(bounds, p.x, p.y, 18)) continue;
      const ratio = 1 - p.life / p.maxLife;
      ctx.globalAlpha = Math.max(0.15, ratio * 0.8);
      if (p.kind === 'RIPPLE') {
        const r = p.size + p.life * 0.55;
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.ellipse(Math.round(p.x), Math.round(p.y), r, Math.round(r * 0.45), 0, 0, Math.PI * 2);
        ctx.stroke();
      } else {
        ctx.fillStyle = p.color;
        ctx.fillRect(Math.round(p.x - p.size * 0.5), Math.round(p.y - p.size * 0.5), p.size, p.size);
      }
    }
    ctx.restore();
  }
}
