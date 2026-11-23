import type { AssetManifestRegistry } from '../../data/assets/assetManifestRegistry';
import { resolveBattleBackdrop } from '../../data/assets/assetManifestRegistry';
import type {
  BackdropLayerKey,
  BattleBackdropManifestEntry
} from '../../data/assets/types';

export interface BattleBackdropProvider {
  readonly manifestRegistry: AssetManifestRegistry;
  getOrCreateBattleBackdropLayer(
    backdrop: BattleBackdropManifestEntry,
    layer: BackdropLayerKey
  ): HTMLImageElement | HTMLCanvasElement | null;
}

export interface BattleBackdropContext {
  islandId?: string | null;
  seaZoneId?: string | null;
  arenaMode?: string;
}

interface FloorScorchDecal {
  x: number;
  y: number;
  radius: number;
  isIce: boolean;
}

const MAX_SCORCH_DECALS = 24;

/**
 * Multi-Layer Parallax Battle Arena Backdrop (1280x540+ 3-Tier Scroll + Ground Decals).
 * Covers full 960..1260px dynamic viewports and 0.88x giant-boss zoom-out with zero seams.
 */
export class ParallaxBattleBackdrop {
  private readonly decals: FloorScorchDecal[] = [];
  private readonly seenVfx = new WeakSet<object>();
  private lastArenaId = '';

  public clearDecals(): void {
    this.decals.length = 0;
    this.lastArenaId = '';
  }

  public get decalCount(): number {
    return this.decals.length;
  }

  public recordExplosionDecals(
    events: readonly { pos: { x: number; y: number }; radiusPx: number; color: string; kind: string }[]
  ): void {
    for (let i = 0; i < events.length; i++) {
      const ev = events[i];
      if (!ev || this.seenVfx.has(ev)) continue;
      this.seenVfx.add(ev);
      if (
        ev.kind === 'SKY_SPLIT_SHOCKWAVE' ||
        ev.kind === 'CONQUEROR_LIGHTNING' ||
        ev.kind === 'CROSS_SLASH' ||
        ev.radiusPx >= 36
      ) {
        if (this.decals.length >= MAX_SCORCH_DECALS) {
          this.decals.shift();
        }
        this.decals.push({
          x: Math.round(ev.pos.x),
          y: Math.round(ev.pos.y),
          radius: Math.max(12, Math.min(34, Math.round(ev.radiusPx * 0.42))),
          isIce: ev.color === '#38bdf8' || ev.color === '#bae6fd'
        });
      }
    }
  }

  public render(
    ctx: CanvasRenderingContext2D,
    provider: BattleBackdropProvider,
    context: BattleBackdropContext,
    camX: number,
    camY: number,
    viewW: number,
    viewH: number,
    zoomScale: number
  ): BattleBackdropManifestEntry {
    const entry = resolveBattleBackdrop(
      context.islandId,
      context.seaZoneId,
      context.arenaMode ?? 'DEFAULT',
      provider.manifestRegistry
    );

    if (this.lastArenaId && this.lastArenaId !== entry.id) {
      this.decals.length = 0;
    }
    this.lastArenaId = entry.id;

    // Fallback base fill while background PNGs finish async load on first frame
    ctx.fillStyle = entry.timeOfDay === 'NIGHT' ? '#090d1a' : '#132033';
    ctx.fillRect(0, 0, viewW, viewH);

    // Extra margin ensures 0.88x giant-boss zoom-out never exposes edge bars
    const spanW = zoomScale < 1 ? Math.ceil(viewW / zoomScale) + 64 : viewW;
    const spanH = zoomScale < 1 ? Math.ceil(viewH / zoomScale) + 48 : viewH;
    const originX = Math.round((viewW - spanW) * 0.5);
    const originY = Math.round((viewH - spanH) * 0.5);

    const layers: readonly [BackdropLayerKey, number][] = [
      ['sky', entry.parallaxFactors[0]],
      ['mid', entry.parallaxFactors[1]],
      ['ground', entry.parallaxFactors[2]]
    ];

    for (let i = 0; i < layers.length; i++) {
      const spec = layers[i];
      if (!spec) continue;
      const [layerKey, factor] = spec;
      const img = provider.getOrCreateBattleBackdropLayer(entry, layerKey);
      if (!img) continue;

      const iw = 'naturalWidth' in img && img.naturalWidth > 0 ? img.naturalWidth : img.width;
      const ih = 'naturalHeight' in img && img.naturalHeight > 0 ? img.naturalHeight : img.height;
      if (iw <= 0 || ih <= 0) continue;

      const shiftX = Math.round(camX * factor);
      const wrapW = Math.max(iw, entry.width);
      let startX = ((originX + shiftX) % wrapW);
      if (startX > originX) startX -= wrapW;
      const drawY = layerKey === 'ground' ? Math.round(originY + camY * 0.25) : originY;

      for (let x = startX; x < originX + spanW; x += wrapW) {
        ctx.drawImage(img, 0, 0, iw, ih, Math.round(x), drawY, wrapW, spanH);
      }
    }

    return entry;
  }

  public renderGroundDecals(ctx: CanvasRenderingContext2D): void {
    if (this.decals.length === 0) return;
    ctx.save();
    for (let i = 0; i < this.decals.length; i++) {
      const d = this.decals[i];
      if (!d) continue;
      ctx.fillStyle = d.isIce ? 'rgba(186, 230, 253, 0.24)' : 'rgba(9, 11, 18, 0.36)';
      ctx.beginPath();
      ctx.ellipse(d.x, d.y, d.radius, Math.max(5, Math.round(d.radius * 0.42)), 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}
