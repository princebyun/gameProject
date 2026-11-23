export interface YSortDrawableItem {
  footY: number;
  draw: (ctx: CanvasRenderingContext2D) => void;
}

/**
 * Reusable Layer-3 Y-Sorted Render Queue (0 per-frame array reallocations).
 * Ensures characters, companion followers, NPCs, props, streetlamps, chests, and bosses
 * interleave smoothly based on exact foot baseline Y coordinate.
 */
export class IslandYSortQueue {
  private readonly items: YSortDrawableItem[] = [];
  private activeCount = 0;

  public reset(): void {
    this.activeCount = 0;
  }

  public push(footY: number, draw: (ctx: CanvasRenderingContext2D) => void): void {
    let slot = this.items[this.activeCount];
    if (!slot) {
      slot = { footY, draw };
      this.items.push(slot);
    } else {
      slot.footY = footY;
      slot.draw = draw;
    }
    this.activeCount += 1;
  }

  public get length(): number {
    return this.activeCount;
  }

  public getOrderedFootYs(): number[] {
    this.sortInPlace();
    const out: number[] = [];
    for (let i = 0; i < this.activeCount; i++) {
      const it = this.items[i];
      if (it) out.push(it.footY);
    }
    return out;
  }

  public flush(ctx: CanvasRenderingContext2D): void {
    this.sortInPlace();
    for (let i = 0; i < this.activeCount; i++) {
      const item = this.items[i];
      if (item) item.draw(ctx);
    }
    this.activeCount = 0;
  }

  private sortInPlace(): void {
    // Insertion sort is O(n) for nearly-sorted entities and allocates zero memory
    for (let i = 1; i < this.activeCount; i++) {
      const cur = this.items[i];
      if (!cur) continue;
      const curFootY = cur.footY;
      const curDraw = cur.draw;
      let j = i - 1;
      while (j >= 0) {
        const prev = this.items[j];
        if (!prev || prev.footY <= curFootY) break;
        const target = this.items[j + 1];
        if (target) {
          target.footY = prev.footY;
          target.draw = prev.draw;
        }
        j -= 1;
      }
      const dst = this.items[j + 1];
      if (dst) {
        dst.footY = curFootY;
        dst.draw = curDraw;
      }
    }
  }
}

export function drawCompactFootShadow(
  ctx: CanvasRenderingContext2D,
  x: number,
  footY: number,
  radiusX = 12,
  radiusY = 4
): void {
  ctx.save();
  ctx.fillStyle = 'rgba(7, 11, 20, 0.46)';
  ctx.beginPath();
  ctx.ellipse(Math.round(x), Math.round(footY), radiusX, radiusY, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
