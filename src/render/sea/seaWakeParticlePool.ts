import type { Disposable } from '../../core/types/disposable';
import {
  isCircleInBounds,
  type ViewportWorldBounds
} from '../viewport/frustumCulling';

interface WakeParticleSlot {
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

const WAKE_POOL_CAPACITY = 96;

/**
 * Zero-GC fixed ring buffer for stern water-foam wakes behind player ships.
 */
export class SeaWakeParticlePool implements Disposable {
  private readonly slots: WakeParticleSlot[] = Array.from(
    { length: WAKE_POOL_CAPACITY },
    () => ({
      active: false,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      life: 0,
      maxLife: 24,
      size: 4,
      isBurst: false
    })
  );
  private writeIndex = 0;
  private lastTick = -1;
  private emitCounter = 0;

  public get capacity(): number {
    return WAKE_POOL_CAPACITY;
  }

  public get activeCount(): number {
    let n = 0;
    for (let i = 0; i < this.slots.length; i++) {
      if (this.slots[i]?.active) n += 1;
    }
    return n;
  }

  public clear(): void {
    for (let i = 0; i < this.slots.length; i++) {
      const slot = this.slots[i];
      if (slot) slot.active = false;
    }
    this.writeIndex = 0;
    this.lastTick = -1;
    this.emitCounter = 0;
  }

  public dispose(): void {
    this.clear();
  }

  private emit(
    x: number,
    y: number,
    vx: number,
    vy: number,
    size: number,
    maxLife: number,
    isBurst: boolean
  ): void {
    const slot = this.slots[this.writeIndex];
    this.writeIndex = (this.writeIndex + 1) % WAKE_POOL_CAPACITY;
    if (!slot) return;
    slot.active = true;
    slot.x = x;
    slot.y = y;
    slot.vx = vx;
    slot.vy = vy;
    slot.life = 0;
    slot.maxLife = maxLife;
    slot.size = size;
    slot.isBurst = isBurst;
  }

  public stepAndRender(
    ctx: CanvasRenderingContext2D,
    shipPosX: number,
    shipPosY: number,
    headingRad: number,
    speedPx: number,
    tailwindRatio: number,
    coupDeBurstActive: boolean,
    tick: number,
    bounds?: ViewportWorldBounds
  ): void {
    const advance = this.lastTick === tick ? 0 : 1;
    this.lastTick = tick;

    if (advance > 0 && (speedPx > 14 || coupDeBurstActive)) {
      this.emitCounter += 1;
      const emitEvery = coupDeBurstActive ? 1 : tailwindRatio > 0.25 ? 2 : 3;
      if (this.emitCounter % emitEvery === 0) {
        const backX = -Math.cos(headingRad);
        const backY = -Math.sin(headingRad);
        const perpX = -backY;
        const perpY = backX;
        const sternX = shipPosX + backX * 18;
        const sternY = shipPosY + backY * 18 + 6;
        const spread = ((this.emitCounter % 3) - 1) * 5;
        this.emit(
          sternX + perpX * spread,
          sternY + perpY * spread,
          backX * 0.35 + perpX * (spread * 0.05),
          backY * 0.35 + perpY * (spread * 0.05),
          coupDeBurstActive ? 7 : tailwindRatio > 0.2 ? 5 : 4,
          coupDeBurstActive ? 28 : 22,
          coupDeBurstActive
        );
      }
    }

    ctx.save();
    for (let i = 0; i < this.slots.length; i++) {
      const p = this.slots[i];
      if (!p || !p.active) continue;
      if (advance > 0) {
        p.x += p.vx;
        p.y += p.vy;
        p.life += 1;
        if (p.life >= p.maxLife) {
          p.active = false;
          continue;
        }
      }
      if (!isCircleInBounds(bounds, p.x, p.y, 16)) continue;
      const ratio = 1 - p.life / p.maxLife;
      ctx.globalAlpha = Math.max(0.1, ratio * (p.isBurst ? 0.85 : 0.65));
      ctx.fillStyle = p.isBurst
        ? p.life % 2 === 0
          ? '#e0f2fe'
          : '#38bdf8'
        : '#f0f9ff';
      const w = Math.round(p.size * (0.7 + (1 - ratio) * 0.9));
      const h = Math.max(2, Math.round(w * 0.55));
      ctx.fillRect(Math.round(p.x - w * 0.5), Math.round(p.y - h * 0.5), w, h);
    }
    ctx.restore();
  }
}
