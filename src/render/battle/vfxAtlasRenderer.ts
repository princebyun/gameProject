import type { BattleWorldState } from '../../core/types/battleState';
import type { AssetManifestRegistry } from '../../data/assets/assetManifestRegistry';
import { resolveVfxAtlas } from '../../data/assets/assetManifestRegistry';
import type { VfxAtlasManifestEntry } from '../../data/assets/types';
import { ObjectPool } from '../pools/renderScratchPools';
import {
  isCircleInBounds,
  type ViewportWorldBounds
} from '../viewport/frustumCulling';

export interface VfxAtlasProvider {
  readonly manifestRegistry: AssetManifestRegistry;
  getOrCreateVfxAtlas(
    vfx: VfxAtlasManifestEntry
  ): HTMLImageElement | HTMLCanvasElement | null;
}

interface PooledVfxInstance {
  atlasId: string;
  x: number;
  y: number;
  elapsedSec: number;
  durationSec: number;
  scale: number;
  rotationRad: number;
}

function pickVfxIdForEvent(kind: string, color: string): string {
  const c = color.toLowerCase();
  if (kind === 'CROSS_SLASH') return 'cross_slash';
  if (kind === 'CONQUEROR_LIGHTNING' || kind === 'SKY_SPLIT_SHOCKWAVE') return 'conqueror_bolt';
  if (c.includes('ef4444') || c.includes('f97316') || c.includes('dc2626')) return 'fire_explosion';
  if (c.includes('38bdf8') || c.includes('7dd3fc') || c.includes('bae6fd')) return 'ice_shatter';
  if (c.includes('facc15') || c.includes('fde047')) return 'lightning_strike';
  if (c.includes('0ea5e9') || c.includes('0284c7')) return 'water_splash';
  if (c.includes('a855f7') || c.includes('c084fc')) return 'awakening_burst';
  return 'hit_spark';
}

/**
 * Pooled Frame-Based Pixel VFX Atlas Renderer (ObjectPool 128 slots, 0 GC).
 * Synchronizes non-destructively with BattleWorldState events and attacks.
 */
export class VfxAtlasRenderer {
  private readonly pool = new ObjectPool<PooledVfxInstance>(
    () => ({
      atlasId: 'hit_spark',
      x: 0,
      y: 0,
      elapsedSec: 0,
      durationSec: 0.35,
      scale: 1,
      rotationRad: 0
    }),
    (v) => {
      v.atlasId = 'hit_spark';
      v.x = 0;
      v.y = 0;
      v.elapsedSec = 0;
      v.durationSec = 0.35;
      v.scale = 1;
      v.rotationRad = 0;
    },
    32,
    128
  );
  private readonly active: PooledVfxInstance[] = [];
  private readonly seenEvents = new WeakSet<object>();
  private readonly seenArcs = new WeakSet<object>();
  private lastTick = -1;

  public get activeCount(): number {
    return this.active.length;
  }

  public get createdPoolCount(): number {
    return this.pool.createdCount;
  }

  public clear(): void {
    while (this.active.length > 0) {
      const item = this.active.pop();
      if (item) this.pool.release(item);
    }
    this.lastTick = -1;
  }

  public spawn(
    atlasId: string,
    x: number,
    y: number,
    scale = 1,
    rotationRad = 0,
    provider?: VfxAtlasProvider
  ): void {
    if (this.active.length >= 128) return;
    const atlas = provider ? resolveVfxAtlas(atlasId, provider.manifestRegistry) : null;
    const dur = atlas ? Math.max(0.22, atlas.frameCount / Math.max(1, atlas.fps)) : 0.35;
    const item = this.pool.acquire();
    item.atlasId = atlasId;
    item.x = x;
    item.y = y;
    item.elapsedSec = 0;
    item.durationSec = dur;
    item.scale = scale;
    item.rotationRad = rotationRad;
    this.active.push(item);
  }

  public syncAndRenderWorldVfx(
    ctx: CanvasRenderingContext2D,
    world: BattleWorldState,
    provider: VfxAtlasProvider,
    visibleBounds?: ViewportWorldBounds
  ): void {
    // 1. Trigger pooled atlas animations for newly appeared BattleWorldState events
    for (let i = 0; i < world.vfxEvents.length; i++) {
      const ev = world.vfxEvents[i];
      if (!ev || this.seenEvents.has(ev)) continue;
      this.seenEvents.add(ev);
      const atlasId = pickVfxIdForEvent(ev.kind, ev.color);
      const tx = ev.kind === 'CROSS_SLASH' && ev.targetPos ? (ev.pos.x + ev.targetPos.x) * 0.5 : ev.pos.x;
      const ty = ev.kind === 'CROSS_SLASH' && ev.targetPos ? (ev.pos.y + ev.targetPos.y) * 0.5 : ev.pos.y;
      const rot = ev.kind === 'CROSS_SLASH' && ev.targetPos
        ? Math.atan2(ev.targetPos.y - ev.pos.y, ev.targetPos.x - ev.pos.x)
        : 0;
      const radiusFactor = Math.max(0.85, Math.min(2.0, ev.radiusPx / 42));
      this.spawn(atlasId, tx, ty, radiusFactor, rot, provider);
    }

    for (let i = 0; i < world.meleeArcs.length; i++) {
      const arc = world.meleeArcs[i];
      if (!arc || this.seenArcs.has(arc)) continue;
      this.seenArcs.add(arc);
      const sx = arc.origin.x + arc.dir.x * arc.radiusPx * 0.65;
      const sy = arc.origin.y + arc.dir.y * arc.radiusPx * 0.65;
      const rot = Math.atan2(arc.dir.y, arc.dir.x);
      this.spawn(
        arc.hasConquerorCoating ? 'conqueror_bolt' : 'slash_arc',
        sx,
        sy,
        Math.max(1.0, arc.radiusPx / 42),
        rot,
        provider
      );
    }

    // 2. Step pooled instances once per world tick
    const dt = this.lastTick !== world.tick ? 1 / 60 : 0;
    this.lastTick = world.tick;

    let writeIdx = 0;
    for (let i = 0; i < this.active.length; i++) {
      const item = this.active[i];
      if (!item) continue;
      item.elapsedSec += dt;
      if (item.elapsedSec >= item.durationSec) {
        this.pool.release(item);
        continue;
      }
      this.active[writeIdx++] = item;
      if (!isCircleInBounds(visibleBounds, item.x, item.y, 128)) continue;
      this.drawPooledFrame(ctx, item, provider);
    }
    this.active.length = writeIdx;

    // 3. Looping VFX overlays for active beam clashes & parry/melee clashes
    for (let i = 0; i < world.beamClashes.length; i++) {
      const bc = world.beamClashes[i];
      if (!bc || !isCircleInBounds(visibleBounds, bc.clashPoint.x, bc.clashPoint.y, 96)) continue;
      this.drawLoopAtlas(ctx, 'beam_core', bc.clashPoint.x, bc.clashPoint.y, world.tick, 0.85, provider);
    }
    for (let i = 0; i < world.meleeBeamGuards.length; i++) {
      const mg = world.meleeBeamGuards[i];
      if (!mg || !isCircleInBounds(visibleBounds, mg.clashPoint.x, mg.clashPoint.y, 80)) continue;
      this.drawLoopAtlas(ctx, 'parry_flash', mg.clashPoint.x, mg.clashPoint.y, world.tick, 1.35, provider);
    }
    for (let i = 0; i < world.meleeClashes.length; i++) {
      const mc = world.meleeClashes[i];
      if (!mc || !isCircleInBounds(visibleBounds, mc.clashPoint.x, mc.clashPoint.y, 96)) continue;
      this.drawLoopAtlas(
        ctx,
        mc.isConquerorSkySplit ? 'conqueror_bolt' : 'hit_spark',
        mc.clashPoint.x,
        mc.clashPoint.y,
        world.tick,
        mc.isConquerorSkySplit ? 1.55 : 1.3,
        provider
      );
    }
  }

  private drawPooledFrame(
    ctx: CanvasRenderingContext2D,
    item: PooledVfxInstance,
    provider: VfxAtlasProvider
  ): void {
    const atlas = resolveVfxAtlas(item.atlasId, provider.manifestRegistry);
    if (!atlas) return;
    const sheet = provider.getOrCreateVfxAtlas(atlas);
    if (!sheet) return;
    const prog = Math.max(0, Math.min(0.999, item.elapsedSec / Math.max(0.01, item.durationSec)));
    const frameIdx = Math.floor(prog * atlas.frameCount);
    this.blitAtlasFrame(ctx, sheet, atlas, frameIdx, item.x, item.y, item.scale, item.rotationRad);
  }

  private drawLoopAtlas(
    ctx: CanvasRenderingContext2D,
    atlasId: string,
    x: number,
    y: number,
    tick: number,
    scale: number,
    provider: VfxAtlasProvider
  ): void {
    const atlas = resolveVfxAtlas(atlasId, provider.manifestRegistry);
    if (!atlas) return;
    const sheet = provider.getOrCreateVfxAtlas(atlas);
    if (!sheet) return;
    const frameIdx = Math.floor((tick / 60) * atlas.fps) % Math.max(1, atlas.frameCount);
    this.blitAtlasFrame(ctx, sheet, atlas, frameIdx, x, y, scale, 0);
  }

  private blitAtlasFrame(
    ctx: CanvasRenderingContext2D,
    sheet: HTMLImageElement | HTMLCanvasElement,
    atlas: VfxAtlasManifestEntry,
    frameIdx: number,
    x: number,
    y: number,
    scale: number,
    rotationRad: number
  ): void {
    const drawW = Math.round(atlas.frameWidth * atlas.scale * scale);
    const drawH = Math.round(atlas.frameHeight * atlas.scale * scale);
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.globalCompositeOperation = atlas.blendMode;
    ctx.translate(Math.round(x), Math.round(y));
    if (rotationRad !== 0) ctx.rotate(rotationRad);
    ctx.drawImage(
      sheet,
      frameIdx * atlas.frameWidth,
      0,
      atlas.frameWidth,
      atlas.frameHeight,
      Math.round(-drawW * 0.5),
      Math.round(-drawH * 0.5),
      drawW,
      drawH
    );
    ctx.restore();
  }
}
