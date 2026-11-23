import type { IslandAmbientProfile } from '../../core/types/rpgSchemas';
import { ObjectPool } from '../pools/renderScratchPools';
import {
  applyAmbientParticleKind,
  renderAmbientParticle,
  type AmbientParticleItem
} from './ambientParticlePresets';

export type { AmbientParticleItem } from './ambientParticlePresets';

const MAX_AMBIENT_PARTICLES = 42;

/**
 * Layer-5 Biome Ambient Particle System backed by a bounded ObjectPool (0 GC).
 * Renders sakura petals, desert sand, snow, sea spray/gulls, rain, bats, bubbles & sparks.
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
    profile?: IslandAmbientProfile,
    usePostClear = false
  ): void {
    const activeKinds =
      usePostClear && profile?.postClearParticles && profile.postClearParticles.length > 0
        ? profile.postClearParticles
        : profile?.particles;
    const profileKey = profile
      ? `${biomeId}_${(activeKinds ?? []).join('_')}_${profile.density}_${usePostClear ? 1 : 0}`
      : biomeId;
    if (this.activeBiomeId !== profileKey) {
      this.clear();
      this.activeBiomeId = profileKey;
      this.seedParticles(biomeId, viewW, viewH, profile, usePostClear);
    }

    const stepDelta = this.lastTick === tick ? 0 : 1;
    this.lastTick = tick;

    ctx.save();
    for (let i = 0; i < this.active.length; i++) {
      const p = this.active[i];
      if (!p) continue;
      if (stepDelta > 0) {
        const swayY =
          p.kind === 'PETAL' || p.kind === 'LEAF' || p.kind === 'GOLDEN_LEAF'
            ? Math.sin(tick * 0.08 + p.phase) * 0.35
            : p.kind === 'BAT'
              ? Math.sin(tick * 0.11 + p.phase) * 0.45
              : 0;
        const swayX = p.kind === 'SNOW' ? Math.sin(tick * 0.07 + p.phase) * 0.25 : 0;
        p.x += p.vx + swayX;
        p.y += p.vy + swayY;
        if (p.x > viewW + 16) p.x = -12;
        if (p.x < -16) p.x = viewW + 12;
        if (p.y > viewH + 12) p.y = -10;
        if (p.y < -16) p.y = viewH + 10;
      }

      const rx = Math.round(p.x);
      const ry = Math.round(p.y);
      renderAmbientParticle(ctx, p, rx, ry, tick, i);
    }
    ctx.restore();
  }

  private seedParticles(
    biomeId: string,
    viewW: number,
    viewH: number,
    profile?: IslandAmbientProfile,
    usePostClear = false
  ): void {
    const count = Math.min(MAX_AMBIENT_PARTICLES, profile?.density ?? 28);
    const chosenList =
      usePostClear && profile?.postClearParticles && profile.postClearParticles.length > 0
        ? profile.postClearParticles
        : profile?.particles;
    for (let i = 0; i < count && this.active.length < MAX_AMBIENT_PARTICLES; i++) {
      const p = this.pool.acquire();
      const s = ((i + 1) * 2654435761) >>> 0;
      p.x = s % Math.max(320, viewW);
      p.y = (s >>> 8) % Math.max(240, viewH);
      p.phase = (i * 0.7) % (Math.PI * 2);

      if (chosenList && chosenList.length > 0) {
        const chosen = chosenList[i % chosenList.length] ?? 'SPRAY';
        applyAmbientParticleKind(p, chosen, i);
        this.active.push(p);
        continue;
      }

      if (biomeId === 'wano_castle') {
        applyAmbientParticleKind(p, 'PETAL', i);
      } else if (biomeId === 'desert_alabasta') {
        applyAmbientParticleKind(p, 'SAND', i);
      } else if (biomeId === 'snow_drum' || biomeId === 'marine_ice') {
        applyAmbientParticleKind(p, 'SNOW', i);
      } else if (biomeId === 'egghead_cyber') {
        applyAmbientParticleKind(p, 'HOLOGRAM', i);
      } else if (biomeId === 'impel_hell') {
        applyAmbientParticleKind(p, 'EMBER', i);
      } else {
        applyAmbientParticleKind(p, i % 7 === 0 ? 'GULL' : 'SPRAY', i);
      }
      this.active.push(p);
    }
  }
}
