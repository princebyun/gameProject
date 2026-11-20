export type PooledParticleKind =
  | 'SPARK'
  | 'HAKI_ARC'
  | 'REFLECT_RING'
  | 'BOND_STAR'
  | 'SLASH_STREAK';

export interface PooledParticle {
  active: boolean;
  kind: PooledParticleKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  secondaryColor: string;
  ageSec: number;
  maxAgeSec: number;
  drag: number;
  rotation: number;
}

export const DEFAULT_PARTICLE_POOL_CAPACITY = 300;

/**
 * Zero-GC fixed-capacity object pool (default 300 slots) for high-intensity
 * parry sparks, Armament Haki arcs, reflected projectile rings, and Bond Combo bursts.
 */
export class ParticlePool {
  public readonly capacity: number;
  private readonly slots: PooledParticle[];
  private cursor = 0;
  private totalSpawned = 0;

  constructor(capacity: number = DEFAULT_PARTICLE_POOL_CAPACITY) {
    this.capacity = Math.max(16, Math.floor(capacity));
    this.slots = Array.from({ length: this.capacity }, () => ({
      active: false,
      kind: 'SPARK',
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      size: 3,
      color: '#facc15',
      secondaryColor: '#ffffff',
      ageSec: 0,
      maxAgeSec: 0.35,
      drag: 0.92,
      rotation: 0
    }));
  }

  public reset(): void {
    for (let i = 0; i < this.capacity; i++) {
      this.slots[i].active = false;
    }
    this.cursor = 0;
  }

  public spawn(params: {
    kind: PooledParticleKind;
    x: number;
    y: number;
    vx: number;
    vy: number;
    size?: number;
    color: string;
    secondaryColor?: string;
    maxAgeSec?: number;
    drag?: number;
    rotation?: number;
  }): PooledParticle {
    const p = this.slots[this.cursor];
    this.cursor = (this.cursor + 1) % this.capacity;
    this.totalSpawned += 1;

    p.active = true;
    p.kind = params.kind;
    p.x = params.x;
    p.y = params.y;
    p.vx = params.vx;
    p.vy = params.vy;
    p.size = params.size ?? 3;
    p.color = params.color;
    p.secondaryColor = params.secondaryColor ?? '#ffffff';
    p.ageSec = 0;
    p.maxAgeSec = Math.max(0.06, params.maxAgeSec ?? 0.35);
    p.drag = params.drag ?? 0.92;
    p.rotation = params.rotation ?? 0;
    return p;
  }

  public spawnRadialBurst(
    x: number,
    y: number,
    count: number,
    speed: number,
    color: string,
    secondaryColor: string,
    kind: PooledParticleKind = 'SPARK',
    seed: number = 1
  ): void {
    const n = Math.max(1, Math.min(48, count));
    for (let i = 0; i < n; i++) {
      const ang = (i * Math.PI * 2) / n + ((seed * 17 + i * 13) % 31) * 0.02;
      const spd = speed * (0.65 + (((seed + i * 7) % 10) / 10) * 0.7);
      this.spawn({
        kind,
        x,
        y,
        vx: Math.cos(ang) * spd,
        vy: Math.sin(ang) * spd,
        size: kind === 'HAKI_ARC' ? 5 : kind === 'BOND_STAR' ? 6 : 3,
        color,
        secondaryColor,
        maxAgeSec: kind === 'REFLECT_RING' ? 0.28 : 0.38,
        drag: kind === 'REFLECT_RING' ? 0.96 : 0.9,
        rotation: ang
      });
    }
  }

  public step(dtSec: number): void {
    const dt = Math.max(0, dtSec);
    for (let i = 0; i < this.capacity; i++) {
      const p = this.slots[i];
      if (!p.active) continue;
      p.ageSec += dt;
      if (p.ageSec >= p.maxAgeSec) {
        p.active = false;
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= p.drag;
      p.vy *= p.drag;
    }
  }

  public render(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    for (let i = 0; i < this.capacity; i++) {
      const p = this.slots[i];
      if (!p.active) continue;

      const t = Math.min(1, p.ageSec / p.maxAgeSec);
      const alpha = Math.max(0, 1 - t);
      ctx.globalAlpha = alpha;
      const px = Math.round(p.x);
      const py = Math.round(p.y);

      if (p.kind === 'REFLECT_RING') {
        const r = Math.round(p.size + t * 28);
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(px, py, r, 0, Math.PI * 2);
        ctx.stroke();
      } else if (p.kind === 'HAKI_ARC') {
        const len = Math.round(p.size * 2.2);
        const ex = Math.round(px + Math.cos(p.rotation) * len);
        const ey = Math.round(py + Math.sin(p.rotation) * len);
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(ex, ey);
        ctx.stroke();
        ctx.strokeStyle = p.secondaryColor;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(ex, ey);
        ctx.stroke();
      } else if (p.kind === 'BOND_STAR') {
        const s = Math.max(2, Math.round(p.size * (1 - t * 0.45)));
        ctx.fillStyle = p.color;
        ctx.fillRect(px - s, py - 1, s * 2 + 1, 3);
        ctx.fillRect(px - 1, py - s, 3, s * 2 + 1);
        ctx.fillStyle = p.secondaryColor;
        ctx.fillRect(px - 1, py - 1, 3, 3);
      } else if (p.kind === 'SLASH_STREAK') {
        const len = Math.round(p.size * 3.5);
        ctx.strokeStyle = p.color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(
          Math.round(px - Math.cos(p.rotation) * len),
          Math.round(py - Math.sin(p.rotation) * len)
        );
        ctx.stroke();
      } else {
        const s = Math.max(2, Math.round(p.size * (1 - t * 0.5)));
        ctx.fillStyle = p.color;
        ctx.fillRect(px - (s >> 1), py - (s >> 1), s, s);
        if (s >= 3) {
          ctx.fillStyle = p.secondaryColor;
          ctx.fillRect(px, py, 1, 1);
        }
      }
    }
    ctx.restore();
  }

  public getStats(): {
    capacity: number;
    activeCount: number;
    totalSpawned: number;
    cursor: number;
  } {
    let activeCount = 0;
    for (let i = 0; i < this.capacity; i++) {
      if (this.slots[i].active) activeCount += 1;
    }
    return {
      capacity: this.capacity,
      activeCount,
      totalSpawned: this.totalSpawned,
      cursor: this.cursor
    };
  }
}

export const sharedBattleParticlePool = new ParticlePool(DEFAULT_PARTICLE_POOL_CAPACITY);
