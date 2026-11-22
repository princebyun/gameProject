import type { Vec2 } from '../../core/math/vector2';

export interface AfterimageSample {
  x: number;
  y: number;
  facingX: number;
  row: number;
  frame: number;
  sheetKey: string;
  color: string;
  remainingSec: number;
  totalSec: number;
}

export interface PooledParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  alpha: number;
  remainingSec: number;
  totalSec: number;
}

export interface PooledFloatingText {
  x: number;
  y: number;
  vy: number;
  text: string;
  color: string;
  remainingSec: number;
  totalSec: number;
}

/**
 * Writes linear interpolation between `a` and `b` directly into `out`
 * to eliminate temporary `{ x, y }` object allocations in 60Hz render loops.
 */
export function lerpVecInto(a: Vec2, b: Vec2, t: number, out: Vec2): Vec2 {
  out.x = a.x + (b.x - a.x) * t;
  out.y = a.y + (b.y - a.y) * t;
  return out;
}

/**
 * Bounded generic pre-allocated Object Pool for 60Hz hot-path effects/particles.
 */
export class ObjectPool<T> {
  private readonly freeList: T[] = [];
  private totalCreated = 0;

  constructor(
    private readonly factory: () => T,
    private readonly reset: (item: T) => void,
    initialCapacity: number = 16,
    private readonly maxCapacity: number = 256
  ) {
    const cap = Math.max(0, Math.min(initialCapacity, maxCapacity));
    for (let i = 0; i < cap; i++) {
      this.freeList.push(this.factory());
      this.totalCreated += 1;
    }
  }

  public get pooledCount(): number {
    return this.freeList.length;
  }

  public get createdCount(): number {
    return this.totalCreated;
  }

  public acquire(): T {
    const item = this.freeList.pop();
    if (item !== undefined) {
      this.reset(item);
      return item;
    }
    this.totalCreated += 1;
    return this.factory();
  }

  public release(item: T): void {
    this.reset(item);
    if (this.freeList.length < this.maxCapacity) {
      this.freeList.push(item);
    }
  }

  public clear(): void {
    this.freeList.length = 0;
  }
}

export class ParticlePool extends ObjectPool<PooledParticle> {
  constructor(initialCapacity: number = 64, maxCapacity: number = 256) {
    super(
      () => ({
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        size: 2,
        color: '#ffffff',
        alpha: 1,
        remainingSec: 0,
        totalSec: 0.2
      }),
      (p) => {
        p.x = 0;
        p.y = 0;
        p.vx = 0;
        p.vy = 0;
        p.size = 2;
        p.color = '#ffffff';
        p.alpha = 1;
        p.remainingSec = 0;
        p.totalSec = 0.2;
      },
      initialCapacity,
      maxCapacity
    );
  }
}

export class FloatingTextPool extends ObjectPool<PooledFloatingText> {
  constructor(initialCapacity: number = 32, maxCapacity: number = 128) {
    super(
      () => ({
        x: 0,
        y: 0,
        vy: -24,
        text: '',
        color: '#ffffff',
        remainingSec: 0,
        totalSec: 0.6
      }),
      (ft) => {
        ft.x = 0;
        ft.y = 0;
        ft.vy = -24;
        ft.text = '';
        ft.color = '#ffffff';
        ft.remainingSec = 0;
        ft.totalSec = 0.6;
      },
      initialCapacity,
      maxCapacity
    );
  }
}

export function createAfterimagePool(
  initialCapacity: number = 32,
  maxCapacity: number = 128
): ObjectPool<AfterimageSample> {
  return new ObjectPool<AfterimageSample>(
    () => ({
      x: 0,
      y: 0,
      facingX: 1,
      row: 0,
      frame: 0,
      sheetKey: '',
      color: '#a855f7',
      remainingSec: 0,
      totalSec: 0.2
    }),
    (ai) => {
      ai.x = 0;
      ai.y = 0;
      ai.facingX = 1;
      ai.row = 0;
      ai.frame = 0;
      ai.sheetKey = '';
      ai.color = '#a855f7';
      ai.remainingSec = 0;
      ai.totalSec = 0.2;
    },
    initialCapacity,
    maxCapacity
  );
}
