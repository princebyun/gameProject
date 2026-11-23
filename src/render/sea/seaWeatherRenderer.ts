import { clamp } from '../../core/math/vector2';
import type { Disposable } from '../../core/types/disposable';
import type { RpgCampaignState, SeaZoneDefinition } from '../../core/types/rpgSchemas';
import {
  isCircleInBounds,
  type ViewportWorldBounds
} from '../viewport/frustumCulling';

interface WeatherParticleSlot {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  phase: number;
}

const WEATHER_PARTICLE_COUNT = 54;
const LIGHTNING_CYCLE_TICKS = 240;

/**
 * Pure deterministic lightning intensity helper.
 * When `flashEffectEnabled === false` (accessibility mode), MUST return 0 on every tick.
 */
export function computeNewWorldLightningIntensity(
  tick: number,
  flashEffectEnabled: boolean
): number {
  if (!flashEffectEnabled) return 0;
  const phase = ((tick % LIGHTNING_CYCLE_TICKS) + LIGHTNING_CYCLE_TICKS) % LIGHTNING_CYCLE_TICKS;
  if (phase === 18 || phase === 19) return 0.34;
  if (phase === 24) return 0.22;
  if (phase === 132) return 0.26;
  return 0;
}

export class SeaWeatherRenderer implements Disposable {
  private readonly particles: WeatherParticleSlot[] = Array.from(
    { length: WEATHER_PARTICLE_COUNT },
    (_, i) => {
      const h = (((i + 1) * 2654435761) >>> 0) % 1000;
      return {
        x: (h * 1.27) % 1260,
        y: ((h * 3.13) % 540),
        vx: (i % 2 === 0 ? 1 : -1) * (0.4 + (i % 4) * 0.2),
        vy: 0.5 + (i % 5) * 0.3,
        size: 2 + (i % 3),
        phase: i * 0.65
      };
    }
  );
  private lastTick = -1;

  public dispose(): void {
    this.lastTick = -1;
  }

  public renderUnderwaterSeaKingShadows(
    ctx: CanvasRenderingContext2D,
    zone: SeaZoneDefinition,
    tick: number,
    visibleBounds?: ViewportWorldBounds
  ): void {
    if (zone.id !== 'new_world' && zone.id !== 'grand_line') return;
    const count = zone.id === 'new_world' ? 3 : 1;
    ctx.save();
    for (let i = 0; i < count; i++) {
      const spanW = zone.width + 320;
      const sx = (((tick * (0.85 + i * 0.25) + i * 740) % spanW) - 160);
      const sy = 240 + i * 330 + Math.sin(tick * 0.015 + i * 1.7) * 44;
      if (!isCircleInBounds(visibleBounds, sx, sy, 140)) continue;

      ctx.fillStyle = 'rgba(8, 16, 36, 0.24)';
      for (let seg = 0; seg < 6; seg++) {
        const rx = sx - seg * 26;
        const ry = sy + Math.sin(tick * 0.08 - seg * 0.7) * 8;
        const rad = 22 - seg * 2.5;
        ctx.beginPath();
        ctx.ellipse(Math.round(rx), Math.round(ry), rad, Math.round(rad * 0.52), 0, 0, Math.PI * 2);
        ctx.fill();
      }
      // Subtle dorsal crest
      ctx.fillStyle = 'rgba(15, 23, 42, 0.20)';
      ctx.fillRect(Math.round(sx - 34), Math.round(sy - 14), 16, 6);
    }
    ctx.restore();
  }

  public renderWorldSpaceIceFloes(
    ctx: CanvasRenderingContext2D,
    zone: SeaZoneDefinition,
    tick: number,
    visibleBounds?: ViewportWorldBounds
  ): void {
    if (zone.id !== 'grand_line') return;
    const marineford = zone.islands.find((i) => i.islandId === 'marineford');
    if (!marineford) return;

    ctx.save();
    for (let i = 0; i < 8; i++) {
      const driftX = Math.sin(tick * 0.009 + i * 1.4) * 28;
      const driftY = Math.cos(tick * 0.008 + i * 1.1) * 16;
      const fx = marineford.pos.x + ((i % 4) - 1.5) * 95 + driftX;
      const fy = marineford.pos.y + (Math.floor(i / 4) - 0.5) * 160 + driftY;
      if (!isCircleInBounds(visibleBounds, fx, fy, 42)) continue;

      ctx.fillStyle = 'rgba(186, 230, 253, 0.72)';
      ctx.fillRect(Math.round(fx - 14), Math.round(fy - 7), 28, 14);
      ctx.fillStyle = 'rgba(248, 250, 252, 0.9)';
      ctx.fillRect(Math.round(fx - 12), Math.round(fy - 6), 24, 9);
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 1;
      ctx.strokeRect(Math.round(fx - 14), Math.round(fy - 7), 28, 14);
    }
    ctx.restore();
  }

  public renderZoneWeatherOverlay(
    ctx: CanvasRenderingContext2D,
    state: RpgCampaignState,
    zone: SeaZoneDefinition,
    viewW: number,
    viewH: number,
    tick: number,
    flashEffectEnabled: boolean
  ): void {
    const advance = this.lastTick === tick ? 0 : 1;
    this.lastTick = tick;

    if (zone.id === 'east_blue') {
      this.renderEastBlueWeather(ctx, state, viewW, viewH, tick, advance);
      return;
    }

    if (zone.id === 'grand_line') {
      this.renderGrandLineWeather(ctx, state, zone, viewW, viewH, tick, advance);
      return;
    }

    this.renderNewWorldWeather(
      ctx,
      state,
      zone,
      viewW,
      viewH,
      tick,
      advance,
      flashEffectEnabled
    );
  }

  private renderEastBlueWeather(
    ctx: CanvasRenderingContext2D,
    state: RpgCampaignState,
    viewW: number,
    viewH: number,
    tick: number,
    advance: number
  ): void {
    ctx.save();
    if (state.seaWeather !== 'STORM') {
      ctx.fillStyle = 'rgba(253, 224, 71, 0.06)';
      ctx.fillRect(0, 0, viewW, viewH);
    }
    for (let i = 0; i < 18; i++) {
      const p = this.particles[i];
      if (!p) continue;
      if (advance > 0) {
        p.x = (p.x + 0.9 + (i % 3) * 0.25) % (viewW + 40);
        p.y = (p.y + Math.sin(tick * 0.05 + p.phase) * 0.45 + viewH) % viewH;
      }
      const gx = Math.round(p.x - 20);
      const gy = Math.round(p.y);
      if (i < 6) {
        // Flying white pixel gull silhouettes
        const wing = Math.floor(tick / 10 + i) % 2 === 0 ? -2 : 1;
        ctx.fillStyle = 'rgba(248, 250, 252, 0.85)';
        ctx.fillRect(gx - 3, gy + wing, 3, 2);
        ctx.fillRect(gx, gy, 2, 2);
        ctx.fillRect(gx + 2, gy + wing, 3, 2);
      } else {
        // Water glint pixel
        ctx.fillStyle = 'rgba(224, 242, 254, 0.42)';
        ctx.fillRect(gx, gy, 3, 2);
      }
    }
    this.renderGenericRainOrFog(ctx, state, viewW, viewH, tick);
    ctx.restore();
  }

  private renderGrandLineWeather(
    ctx: CanvasRenderingContext2D,
    state: RpgCampaignState,
    zone: SeaZoneDefinition,
    viewW: number,
    viewH: number,
    tick: number,
    advance: number
  ): void {
    const prox = (id: string, radius = 320): number => {
      const isl = zone.islands.find((i) => i.islandId === id);
      if (!isl) return 0;
      const d = Math.hypot(state.ship.pos.x - isl.pos.x, state.ship.pos.y - isl.pos.y);
      return clamp(1 - d / radius, 0, 1);
    };

    const drumW = prox('drum_kingdom', 320);
    const drumCleared = state.completedEpisodes.includes('ep_drum_kingdom');
    const alabastaW = prox('alabasta', 320);
    const thrillerW = prox('thriller_bark', 340);

    ctx.save();
    if (drumW > 0.05) {
      ctx.fillStyle = `rgba(224, 242, 254, ${(0.08 * drumW).toFixed(3)})`;
      ctx.fillRect(0, 0, viewW, viewH);
      const count = Math.max(8, Math.round(28 * drumW));
      for (let i = 0; i < count; i++) {
        const p = this.particles[i];
        if (!p) continue;
        if (advance > 0) {
          p.x = (p.x + Math.sin(tick * 0.05 + p.phase) * 0.6 + viewW) % viewW;
          p.y = (p.y + 1.35) % viewH;
        }
        ctx.fillStyle = drumCleared && i % 3 === 0 ? '#f9a8d4' : '#ffffff';
        ctx.globalAlpha = 0.72 * drumW;
        ctx.fillRect(Math.round(p.x), Math.round(p.y), p.size, p.size);
      }
    }

    if (alabastaW > 0.05) {
      ctx.globalAlpha = 1;
      ctx.fillStyle = `rgba(245, 158, 11, ${(0.14 * alabastaW).toFixed(3)})`;
      ctx.fillRect(0, 0, viewW, viewH);
      for (let i = 18; i < 36; i++) {
        const p = this.particles[i];
        if (!p) continue;
        if (advance > 0) {
          p.x = (p.x + 2.4) % viewW;
          p.y = (p.y + 0.35) % viewH;
        }
        ctx.fillStyle = 'rgba(253, 230, 138, 0.55)';
        ctx.globalAlpha = 0.65 * alabastaW;
        ctx.fillRect(Math.round(p.x), Math.round(p.y), 6, 2);
      }
    }

    if (thrillerW > 0.05) {
      ctx.globalAlpha = 1;
      ctx.fillStyle = `rgba(88, 28, 135, ${(0.24 * thrillerW).toFixed(3)})`;
      ctx.fillRect(0, 0, viewW, viewH);
      for (let m = 0; m < 4; m++) {
        const mx = ((tick * (0.4 + m * 0.15) + m * 290) % (viewW + 240)) - 240;
        const my = ((m * 130) % Math.max(120, viewH - 90)) + 20;
        ctx.fillStyle = `rgba(226, 232, 240, ${(0.12 * thrillerW).toFixed(3)})`;
        ctx.fillRect(Math.round(mx), my, 220, 46);
      }
    }

    ctx.globalAlpha = 1;
    this.renderGenericRainOrFog(ctx, state, viewW, viewH, tick);
    ctx.restore();
  }

  private renderNewWorldWeather(
    ctx: CanvasRenderingContext2D,
    state: RpgCampaignState,
    zone: SeaZoneDefinition,
    viewW: number,
    viewH: number,
    tick: number,
    advance: number,
    flashEffectEnabled: boolean
  ): void {
    ctx.save();
    // Moving storm cloud shadows
    const flash = computeNewWorldLightningIntensity(tick, flashEffectEnabled);
    const cloudMod = flashEffectEnabled ? 0 : Math.sin(tick * 0.025) * 0.03;
    for (let c = 0; c < 4; c++) {
      const cx = ((tick * (0.55 + c * 0.12) + c * 340) % (viewW + 260)) - 260;
      const cy = ((c * 145 + 30) % Math.max(160, viewH - 80));
      ctx.fillStyle = `rgba(9, 13, 24, ${(0.16 + cloudMod).toFixed(3)})`;
      ctx.fillRect(Math.round(cx), cy, 240, 74);
    }

    // Diagonal storm rain
    const rainDensity = state.seaWeather === 'STORM' ? 40 : 18;
    ctx.strokeStyle = 'rgba(186, 230, 253, 0.28)';
    ctx.lineWidth = 1.5;
    for (let i = 0; i < rainDensity; i++) {
      const p = this.particles[i];
      if (!p) continue;
      if (advance > 0) {
        p.x = (p.x - 2.6 + viewW) % viewW;
        p.y = (p.y + 6.5) % viewH;
      }
      ctx.beginPath();
      ctx.moveTo(Math.round(p.x), Math.round(p.y));
      ctx.lineTo(Math.round(p.x - 6), Math.round(p.y + 14));
      ctx.stroke();
    }

    // Elbaf proximity golden Norse aurora reflection
    const elbaf = zone.islands.find((i) => i.islandId === 'elbaf');
    if (elbaf) {
      const dist = Math.hypot(state.ship.pos.x - elbaf.pos.x, state.ship.pos.y - elbaf.pos.y);
      const auroraW = clamp(1 - dist / 420, 0, 1);
      if (auroraW > 0.05) {
        ctx.fillStyle = `rgba(250, 204, 21, ${(0.11 * auroraW).toFixed(3)})`;
        ctx.fillRect(0, 0, viewW, Math.round(viewH * 0.34));
        ctx.fillStyle = `rgba(52, 211, 153, ${(0.07 * auroraW).toFixed(3)})`;
        ctx.fillRect(0, 14, viewW, 38);
      }
    }

    // Distant lightning bolt & water shimmer — strictly blocked when flashEffectEnabled === false
    if (flash > 0) {
      const boltX = ((Math.floor(tick / LIGHTNING_CYCLE_TICKS) * 317) % Math.max(240, viewW - 120)) + 60;
      ctx.strokeStyle = 'rgba(240, 249, 255, 0.9)';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(boltX, 12);
      ctx.lineTo(boltX - 10, 44);
      ctx.lineTo(boltX + 8, 62);
      ctx.lineTo(boltX - 6, 98);
      ctx.stroke();

      ctx.fillStyle = `rgba(224, 242, 254, ${flash.toFixed(2)})`;
      ctx.fillRect(0, 0, viewW, viewH);
    }

    ctx.restore();
  }

  private renderGenericRainOrFog(
    ctx: CanvasRenderingContext2D,
    state: RpgCampaignState,
    viewW: number,
    viewH: number,
    tick: number
  ): void {
    if (state.seaWeather === 'STORM') {
      ctx.strokeStyle = 'rgba(186, 230, 253, 0.26)';
      ctx.lineWidth = 1.5;
      for (let i = 0; i < 24; i++) {
        const rx = (i * 73 + tick * 8) % viewW;
        const ry = (i * 59 + tick * 13) % viewH;
        ctx.beginPath();
        ctx.moveTo(rx, ry);
        ctx.lineTo(rx - 7, ry + 16);
        ctx.stroke();
      }
    } else if (state.seaWeather === 'FOG') {
      ctx.fillStyle = 'rgba(226, 232, 240, 0.11)';
      ctx.fillRect(0, 0, viewW, viewH);
    }
  }
}
