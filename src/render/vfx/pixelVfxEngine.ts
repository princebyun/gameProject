import { clamp, type Vec2 } from '../../core/math/vector2';
import type {
  ActiveBeam,
  ActiveMeleeArc,
  BattleWorldState,
  CombatVfxEvent
} from '../../core/types/battleState';

type ActiveBeamClash = BattleWorldState['beamClashes'][number];
type ActiveMeleeClash = BattleWorldState['meleeClashes'][number];

export interface PooledPixelSpark {
  active: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  color: string;
  ageSec: number;
  maxAgeSec: number;
}

export interface PooledGroundDecal {
  active: boolean;
  x: number;
  y: number;
  radius: number;
  kind: 'SCORCH' | 'CRACK' | 'FROST';
  ageSec: number;
  maxAgeSec: number;
}

export interface ImpactFrameState {
  remainingFrames: number;
  invertPolarity: boolean;
  center: Vec2;
  accentColor: string;
}

const SPARK_POOL_SIZE = 128;
const DECAL_POOL_SIZE = 48;

/**
 * Pokémon-Resonance-grade Multi-Layer Pixel VFX Engine (purely visual, read-only on BattleWorldState).
 * Uses fixed pre-allocated object pools so 60FPS combat never triggers GC spikes.
 */
export class PixelVfxEngine {
  private readonly sparks: PooledPixelSpark[];
  private readonly decals: PooledGroundDecal[];
  private sparkCursor = 0;
  private decalCursor = 0;
  private lastObservedTick = -1;
  private seenVfxIds = new Set<string>();
  private impactFrame: ImpactFrameState = {
    remainingFrames: 0,
    invertPolarity: false,
    center: { x: 480, y: 270 },
    accentColor: '#ffffff'
  };

  constructor() {
    this.sparks = Array.from({ length: SPARK_POOL_SIZE }, () => ({
      active: false,
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      size: 2,
      color: '#fde047',
      ageSec: 0,
      maxAgeSec: 0.4
    }));
    this.decals = Array.from({ length: DECAL_POOL_SIZE }, () => ({
      active: false,
      x: 0,
      y: 0,
      radius: 18,
      kind: 'SCORCH',
      ageSec: 0,
      maxAgeSec: 2.5
    }));
  }

  public reset(): void {
    for (const s of this.sparks) s.active = false;
    for (const d of this.decals) d.active = false;
    this.seenVfxIds.clear();
    this.lastObservedTick = -1;
    this.impactFrame.remainingFrames = 0;
  }

  public getPoolStats(): {
    sparkCapacity: number;
    activeSparks: number;
    decalCapacity: number;
    activeDecals: number;
    impactFramesLeft: number;
  } {
    let activeSparks = 0;
    for (const s of this.sparks) if (s.active) activeSparks += 1;
    let activeDecals = 0;
    for (const d of this.decals) if (d.active) activeDecals += 1;
    return {
      sparkCapacity: SPARK_POOL_SIZE,
      activeSparks,
      decalCapacity: DECAL_POOL_SIZE,
      activeDecals,
      impactFramesLeft: this.impactFrame.remainingFrames
    };
  }

  public spawnSpark(
    x: number,
    y: number,
    vx: number,
    vy: number,
    color: string,
    size = 3,
    maxAgeSec = 0.36
  ): void {
    const slot = this.sparks[this.sparkCursor];
    this.sparkCursor = (this.sparkCursor + 1) % SPARK_POOL_SIZE;
    slot.active = true;
    slot.x = x;
    slot.y = y;
    slot.vx = vx;
    slot.vy = vy;
    slot.color = color;
    slot.size = size;
    slot.ageSec = 0;
    slot.maxAgeSec = Math.max(0.08, maxAgeSec);
  }

  public spawnGroundDecal(
    x: number,
    y: number,
    radius: number,
    kind: PooledGroundDecal['kind'] = 'SCORCH',
    maxAgeSec = 2.6
  ): void {
    const slot = this.decals[this.decalCursor];
    this.decalCursor = (this.decalCursor + 1) % DECAL_POOL_SIZE;
    slot.active = true;
    slot.x = x;
    slot.y = y;
    slot.radius = Math.max(10, Math.min(72, radius));
    slot.kind = kind;
    slot.ageSec = 0;
    slot.maxAgeSec = Math.max(0.5, maxAgeSec);
  }

  /**
   * Triggers a 2–3 frame high-contrast B&W anime Impact Frame on heavy finishers / clashes / awakenings.
   * Strictly respects accessibility: when `flashEffectEnabled === false`, this is a complete no-op!
   */
  public triggerImpactFrame(
    center: Vec2,
    flashEffectEnabled: boolean,
    frames: number = 3,
    accentColor: string = '#ffffff'
  ): boolean {
    if (!flashEffectEnabled) {
      this.impactFrame.remainingFrames = 0;
      return false;
    }
    this.impactFrame.remainingFrames = Math.max(
      this.impactFrame.remainingFrames,
      Math.min(3, Math.max(1, frames))
    );
    this.impactFrame.invertPolarity = true;
    this.impactFrame.center = { x: center.x, y: center.y };
    this.impactFrame.accentColor = accentColor;
    return true;
  }

  /**
   * Advances pooled particles/decals and observes new combat events from BattleWorldState (read-only).
   */
  public syncWithWorld(
    world: BattleWorldState,
    flashEffectEnabled: boolean,
    dtSec = 1 / 60
  ): void {
    if (world.tick < this.lastObservedTick) {
      this.reset();
    }
    if (world.tick === this.lastObservedTick) {
      return;
    }
    const ticksAdvanced =
      this.lastObservedTick < 0
        ? 1
        : Math.min(4, Math.max(1, world.tick - this.lastObservedTick));
    this.lastObservedTick = world.tick;
    const stepDt = dtSec * ticksAdvanced;

    // Step pooled sparks
    for (const s of this.sparks) {
      if (!s.active) continue;
      s.ageSec += stepDt;
      if (s.ageSec >= s.maxAgeSec) {
        s.active = false;
        continue;
      }
      s.x += s.vx * stepDt;
      s.y += s.vy * stepDt;
      s.vx *= 0.92;
      s.vy *= 0.92;
    }

    // Step pooled ground decals
    for (const d of this.decals) {
      if (!d.active) continue;
      d.ageSec += stepDt;
      if (d.ageSec >= d.maxAgeSec) {
        d.active = false;
      }
    }

    if (this.impactFrame.remainingFrames > 0) {
      this.impactFrame.remainingFrames = Math.max(
        0,
        this.impactFrame.remainingFrames - 1
      );
      this.impactFrame.invertPolarity = !this.impactFrame.invertPolarity;
    }

    // Observe newly emitted CombatVfxEvents for decals, spark bursts, and Impact Frames
    if (this.seenVfxIds.size > 120) {
      this.seenVfxIds.clear();
    }
    for (const vfx of world.vfxEvents) {
      if (this.seenVfxIds.has(vfx.id)) continue;
      this.seenVfxIds.add(vfx.id);
      this.handleNewVfxEvent(vfx, world.tick, flashEffectEnabled);
    }

    // Continuous muzzle / tip sparks along active beams & beam clashes
    for (const beam of world.beams) {
      if (world.tick % 2 === 0) {
        const endX = beam.origin.x + beam.dir.x * beam.currentLengthPx;
        const endY = beam.origin.y + beam.dir.y * beam.currentLengthPx;
        const seed = (world.tick * 37 + Math.round(endX)) % 360;
        const ang = (seed * Math.PI) / 180;
        this.spawnSpark(
          endX,
          endY,
          Math.cos(ang) * 95,
          Math.sin(ang) * 95,
          '#fef08a',
          3,
          0.26
        );
        if (world.tick % 8 === 0) {
          this.spawnGroundDecal(endX, endY, Math.max(12, beam.widthPx * 0.7), 'SCORCH', 2.2);
        }
      }
    }

    for (const bc of world.beamClashes) {
      for (let i = 0; i < 2; i++) {
        const ang = ((world.tick * 41 + i * 180) % 360) * (Math.PI / 180);
        this.spawnSpark(
          bc.clashPoint.x,
          bc.clashPoint.y,
          Math.cos(ang) * 145,
          Math.sin(ang) * 145,
          i === 0 ? '#ffffff' : '#fde047',
          3,
          0.32
        );
      }
    }

    for (const mc of world.meleeClashes) {
      if (mc.isConquerorSkySplit && world.tick % 3 === 0) {
        const ang = ((world.tick * 67) % 360) * (Math.PI / 180);
        this.spawnSpark(
          mc.clashPoint.x,
          mc.clashPoint.y,
          Math.cos(ang) * 170,
          Math.sin(ang) * 170,
          '#ef4444',
          4,
          0.34
        );
      }
    }
  }

  private handleNewVfxEvent(
    vfx: CombatVfxEvent,
    tick: number,
    flashEffectEnabled: boolean
  ): void {
    const burstCount =
      vfx.kind === 'SKY_SPLIT_SHOCKWAVE' || vfx.kind === 'CONQUEROR_LIGHTNING'
        ? 10
        : 6;
    for (let i = 0; i < burstCount; i++) {
      const ang = ((i / burstCount) * Math.PI * 2) + (tick % 7) * 0.19;
      const spd = 85 + (i % 3) * 42;
      this.spawnSpark(
        vfx.pos.x,
        vfx.pos.y,
        Math.cos(ang) * spd,
        Math.sin(ang) * spd,
        i % 2 === 0 ? '#ffffff' : vfx.color,
        i % 3 === 0 ? 4 : 2,
        0.34
      );
    }

    if (
      vfx.kind === 'SKY_SPLIT_SHOCKWAVE' ||
      vfx.kind === 'CONQUEROR_LIGHTNING' ||
      vfx.kind === 'CROSS_SLASH'
    ) {
      this.spawnGroundDecal(
        vfx.pos.x,
        vfx.pos.y,
        Math.min(48, Math.max(18, vfx.radiusPx * 0.55)),
        vfx.kind === 'CROSS_SLASH' ? 'CRACK' : 'SCORCH',
        2.8
      );
      this.triggerImpactFrame(vfx.pos, flashEffectEnabled, 3, vfx.color);
    } else if (vfx.radiusPx >= 42) {
      this.spawnGroundDecal(
        vfx.pos.x,
        vfx.pos.y,
        Math.min(34, vfx.radiusPx * 0.45),
        vfx.color.toLowerCase().includes('38bdf8') ? 'FROST' : 'SCORCH',
        2.4
      );
    }
  }

  /**
   * 1) Persistent Ground Decals (Scorch marks, Impact cracks, Frost rings) — drawn under units.
   */
  public renderGroundDecals(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    for (const d of this.decals) {
      if (!d.active) continue;
      const alpha = clamp(1 - d.ageSec / d.maxAgeSec, 0, 1);
      ctx.globalAlpha = alpha * 0.55;
      const x = Math.round(d.x);
      const y = Math.round(d.y);
      const r = Math.round(d.radius);

      if (d.kind === 'SCORCH') {
        ctx.fillStyle = '#090d16';
        ctx.fillRect(x - r, y - Math.round(r * 0.55), r * 2, Math.round(r * 1.1));
        ctx.fillStyle = '#292524';
        ctx.fillRect(
          x - Math.round(r * 0.65),
          y - Math.round(r * 0.35),
          Math.round(r * 1.3),
          Math.round(r * 0.7)
        );
        // Radiating crack pixels
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(x - r - 4, y - 1, 5, 2);
        ctx.fillRect(x + r - 1, y - 1, 5, 2);
        ctx.fillRect(x - 1, y - Math.round(r * 0.55) - 3, 2, 4);
        ctx.fillRect(x - 1, y + Math.round(r * 0.55) - 1, 2, 4);
      } else if (d.kind === 'CRACK') {
        ctx.strokeStyle = '#0f172a';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(x - r, y - Math.round(r * 0.4));
        ctx.lineTo(x - Math.round(r * 0.3), y + 2);
        ctx.lineTo(x + r, y + Math.round(r * 0.35));
        ctx.moveTo(x - Math.round(r * 0.2), y - Math.round(r * 0.5));
        ctx.lineTo(x + Math.round(r * 0.25), y + Math.round(r * 0.55));
        ctx.stroke();
      } else {
        ctx.fillStyle = '#bae6fd';
        ctx.fillRect(x - r, y - Math.round(r * 0.45), r * 2, Math.round(r * 0.9));
      }
    }
    ctx.restore();
  }

  /**
   * 2) Multi-Tone Crescent Slash Smear for Melee Arcs (2–3 frame anime smear instead of flat pie wedge).
   */
  public renderCrescentSlashSmear(
    ctx: CanvasRenderingContext2D,
    arc: ActiveMeleeArc,
    tick: number
  ): void {
    const baseAngle = Math.atan2(arc.dir.y, arc.dir.x);
    const halfArc = ((arc.arcDeg * 0.5) * Math.PI) / 180;
    const progress = clamp(
      arc.elapsedSec / Math.max(0.05, arc.activeDamageDurationSec * 1.35),
      0,
      1
    );
    const isLingeringDeflect = arc.elapsedSec > arc.activeDamageDurationSec;

    const outerColor = arc.hasConquerorCoating
      ? '#dc2626'
      : arc.hasArmamentHaki
        ? '#9f1239'
        : isLingeringDeflect
          ? '#2dd4bf'
          : '#f59e0b';
    const midColor = arc.hasConquerorCoating
      ? '#090d16'
      : arc.hasArmamentHaki
        ? '#1e1b4b'
        : isLingeringDeflect
          ? '#99f6e4'
          : '#fde047';
    const coreColor = arc.hasConquerorCoating ? '#fca5a5' : '#ffffff';

    ctx.save();
    ctx.globalAlpha = clamp(1 - progress * 0.45, 0.25, 1);

    // Outer wide crescent smear band
    const rOuter = arc.radiusPx;
    const rInner = Math.max(10, arc.radiusPx * (0.48 + progress * 0.24));
    const startA = baseAngle - halfArc;
    const endA = baseAngle + halfArc;

    ctx.beginPath();
    ctx.arc(arc.origin.x, arc.origin.y, rOuter, startA, endA, false);
    ctx.arc(arc.origin.x, arc.origin.y, rInner, endA, startA, true);
    ctx.closePath();
    ctx.fillStyle = outerColor;
    ctx.fill();

    // Mid tone sharper crescent edge
    ctx.beginPath();
    ctx.arc(arc.origin.x, arc.origin.y, rOuter - 2, startA + 0.06, endA - 0.06, false);
    ctx.arc(
      arc.origin.x,
      arc.origin.y,
      rInner + (rOuter - rInner) * 0.35,
      endA - 0.06,
      startA + 0.06,
      true
    );
    ctx.closePath();
    ctx.fillStyle = midColor;
    ctx.fill();

    // Leading-edge blazing pixel highlight arc
    ctx.strokeStyle = coreColor;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(arc.origin.x, arc.origin.y, rOuter - 2, startA + 0.1, endA - 0.1);
    ctx.stroke();

    // 3 pixel slash streaks along the sweep arc
    ctx.fillStyle = coreColor;
    for (let i = 0; i < 4; i++) {
      const a = startA + ((endA - startA) * (i + 0.5)) / 4;
      const rr = rOuter - 5 - ((tick + i) % 3) * 4;
      const sx = Math.round(arc.origin.x + Math.cos(a) * rr);
      const sy = Math.round(arc.origin.y + Math.sin(a) * rr);
      ctx.fillRect(sx - 2, sy - 2, 4, 4);
    }

    if (arc.hasConquerorCoating) {
      this.renderConquerorPixelLightning(
        ctx,
        arc.origin,
        arc.radiusPx * 0.95,
        tick,
        4
      );
    }
    ctx.restore();
  }

  /**
   * 3) 3-Layer Pixel Beam (Outer flickering pixel aura + Element Mid Layer + Pure White Core + Muzzle Ring).
   */
  public renderMultiLayerPixelBeam(
    ctx: CanvasRenderingContext2D,
    beam: ActiveBeam,
    elementColor: string,
    tick: number
  ): void {
    const endX = beam.origin.x + beam.dir.x * beam.currentLengthPx;
    const endY = beam.origin.y + beam.dir.y * beam.currentLengthPx;
    const flicker = (tick % 2 === 0 ? 1 : -1) * 2.5;
    const outerW = Math.max(8, beam.widthPx * 1.45 + flicker);
    const midW = Math.max(6, beam.widthPx * 0.92);
    const coreW = Math.max(3, beam.widthPx * 0.42);

    ctx.save();
    ctx.globalAlpha = beam.dimmed ? 0.42 : 0.96;
    if (beam.dimmed) ctx.setLineDash([10, 6]);
    ctx.lineCap = 'round';

    // Layer 1: Outer flickering pixel aura
    ctx.strokeStyle = elementColor;
    ctx.globalAlpha = beam.dimmed ? 0.2 : 0.34;
    ctx.lineWidth = outerW;
    ctx.beginPath();
    ctx.moveTo(beam.origin.x, beam.origin.y);
    ctx.lineTo(endX, endY);
    ctx.stroke();

    // Layer 2: Vivid Element Mid Layer
    ctx.globalAlpha = beam.dimmed ? 0.45 : 0.92;
    ctx.strokeStyle = elementColor;
    ctx.lineWidth = midW;
    ctx.beginPath();
    ctx.moveTo(beam.origin.x, beam.origin.y);
    ctx.lineTo(endX, endY);
    ctx.stroke();

    // Layer 3: Pure white incandescent core
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = coreW;
    ctx.beginPath();
    ctx.moveTo(beam.origin.x, beam.origin.y);
    ctx.lineTo(endX, endY);
    ctx.stroke();
    ctx.setLineDash([]);

    // Muzzle convergence ring & pixel flare at origin
    const muzzleR = Math.max(8, beam.widthPx * 0.78 + (tick % 3));
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(beam.origin.x, beam.origin.y, muzzleR, 0, Math.PI * 2);
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(
      Math.round(beam.origin.x - 4),
      Math.round(beam.origin.y - 4),
      8,
      8
    );

    // Impact flare burst at beam tip
    const tipR = Math.max(7, beam.widthPx * 0.62);
    ctx.fillStyle = elementColor;
    ctx.fillRect(
      Math.round(endX - tipR),
      Math.round(endY - tipR),
      Math.round(tipR * 2),
      Math.round(tipR * 2)
    );
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(
      Math.round(endX - tipR * 0.5),
      Math.round(endY - tipR * 0.5),
      Math.round(tipR),
      Math.round(tipR)
    );

    ctx.restore();
  }

  /**
   * 4) Rotating Beam-Clash Energy Orb & Concentric Pixel Shockwave Rings.
   */
  public renderBeamClashOrb(
    ctx: CanvasRenderingContext2D,
    bc: ActiveBeamClash,
    tick: number
  ): void {
    const cx = Math.round(bc.clashPoint.x);
    const cy = Math.round(bc.clashPoint.y);
    const baseR = 20 + Math.sin(tick * 0.65) * 5;

    ctx.save();
    // Concentric expanding shockwave rings
    const ringPhase = (tick % 16) / 16;
    ctx.strokeStyle = `rgba(254, 240, 138, ${(1 - ringPhase).toFixed(2)})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(cx, cy, baseR + ringPhase * 34, 0, Math.PI * 2);
    ctx.stroke();

    // Rotating 4-point energy star spikes
    ctx.strokeStyle = '#fde047';
    ctx.lineWidth = 3;
    const rot = tick * 0.22;
    for (let i = 0; i < 4; i++) {
      const a = rot + (i * Math.PI) / 2;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * (baseR * 0.4), cy + Math.sin(a) * (baseR * 0.4));
      ctx.lineTo(cx + Math.cos(a) * (baseR * 1.75), cy + Math.sin(a) * (baseR * 1.75));
      ctx.stroke();
    }

    // Core clash orb
    ctx.fillStyle = '#f59e0b';
    ctx.beginPath();
    ctx.arc(cx, cy, baseR, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fef08a';
    ctx.beginPath();
    ctx.arc(cx, cy, baseR * 0.72, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(cx, cy, baseR * 0.42, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /**
   * 5) Conqueror's Haki Jagged Black-Red Pixel Lightning + Non-Contact Shockwave Ring.
   */
  public renderConquerorPixelLightning(
    ctx: CanvasRenderingContext2D,
    center: Vec2,
    radius: number,
    tick: number,
    boltCount = 5
  ): void {
    ctx.save();
    for (let i = 0; i < boltCount; i++) {
      const baseAngle = (i * Math.PI * 2) / boltCount + (tick % 13) * 0.29;
      const pts: Vec2[] = [{ x: Math.round(center.x), y: Math.round(center.y) }];
      for (let seg = 1; seg <= 3; seg++) {
        const dist = (radius * seg) / 3;
        const jag = (seg % 2 === 0 ? 1 : -1) * (0.24 + ((i + tick) % 3) * 0.05);
        pts.push({
          x: Math.round(center.x + Math.cos(baseAngle + jag) * dist),
          y: Math.round(center.y + Math.sin(baseAngle + jag) * dist)
        });
      }

      // Outer vivid crimson pixel glow
      ctx.strokeStyle = '#dc2626';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let k = 1; k < pts.length; k++) ctx.lineTo(pts[k].x, pts[k].y);
      ctx.stroke();

      // Inner obsidian-black Conqueror core
      ctx.strokeStyle = '#09090b';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let k = 1; k < pts.length; k++) ctx.lineTo(pts[k].x, pts[k].y);
      ctx.stroke();
    }
    ctx.restore();
  }

  /**
   * 6) Renders active Melee Clashes & CombatVfxEvents (including Cross-Slash diagonal flash).
   */
  public renderEnhancedVfxEvent(
    ctx: CanvasRenderingContext2D,
    vfx: CombatVfxEvent,
    tick: number
  ): void {
    const t = clamp(vfx.elapsedSec / Math.max(0.01, vfx.durationSec), 0, 1);
    ctx.save();
    ctx.globalAlpha = clamp(1 - t, 0, 1);

    if (vfx.kind === 'CROSS_SLASH' && vfx.targetPos) {
      // Wide glowing slash beam + blazing white diagonal flash line
      ctx.strokeStyle = vfx.color;
      ctx.lineWidth = Math.max(3, Math.round(10 * (1 - t)));
      ctx.beginPath();
      ctx.moveTo(vfx.pos.x, vfx.pos.y);
      ctx.lineTo(vfx.targetPos.x, vfx.targetPos.y);
      ctx.stroke();

      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = Math.max(2, Math.round(4 * (1 - t)));
      ctx.beginPath();
      ctx.moveTo(vfx.pos.x, vfx.pos.y);
      ctx.lineTo(vfx.targetPos.x, vfx.targetPos.y);
      ctx.stroke();
    } else if (
      vfx.kind === 'CONQUEROR_LIGHTNING' ||
      vfx.kind === 'SKY_SPLIT_SHOCKWAVE'
    ) {
      const r = vfx.radiusPx * (0.45 + t * 0.85);
      this.renderConquerorPixelLightning(ctx, vfx.pos, r, tick, 6);
      // Non-contact double shockwave ring
      ctx.strokeStyle = '#dc2626';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(vfx.pos.x, vfx.pos.y, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = '#09090b';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(vfx.pos.x, vfx.pos.y, r * 0.82, 0, Math.PI * 2);
      ctx.stroke();
    } else {
      ctx.strokeStyle = vfx.color;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(vfx.pos.x, vfx.pos.y, vfx.radiusPx * (0.4 + t * 0.8), 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  public renderMeleeClashEffect(
    ctx: CanvasRenderingContext2D,
    mc: ActiveMeleeClash,
    tick: number
  ): void {
    ctx.save();
    if (mc.isConquerorSkySplit) {
      this.renderConquerorPixelLightning(ctx, mc.clashPoint, 68, tick, 7);
      // Non-contact spherical repulsion dome
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(
        mc.clashPoint.x,
        mc.clashPoint.y,
        28 + (tick % 6) * 3,
        0,
        Math.PI * 2
      );
      ctx.stroke();
    }
    const s = 18 + (tick % 3) * 3;
    ctx.strokeStyle = mc.isConquerorSkySplit ? '#ef4444' : '#facc15';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(mc.clashPoint.x - s, mc.clashPoint.y - s);
    ctx.lineTo(mc.clashPoint.x + s, mc.clashPoint.y + s);
    ctx.moveTo(mc.clashPoint.x + s, mc.clashPoint.y - s);
    ctx.lineTo(mc.clashPoint.x - s, mc.clashPoint.y + s);
    ctx.stroke();

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }

  /**
   * 7) Pooled Pixel Sparks — crisp square pixel embers rendered on top of units.
   */
  public renderSparks(ctx: CanvasRenderingContext2D): void {
    ctx.save();
    for (const s of this.sparks) {
      if (!s.active) continue;
      const a = clamp(1 - s.ageSec / s.maxAgeSec, 0, 1);
      ctx.globalAlpha = a;
      const px = Math.round(s.x);
      const py = Math.round(s.y);
      ctx.fillStyle = s.color;
      ctx.fillRect(px, py, s.size, s.size);
      if (s.size >= 3) {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(px + 1, py + 1, Math.max(1, s.size - 2), Math.max(1, s.size - 2));
      }
    }
    ctx.restore();
  }

  /**
   * 8) Screen-Space 2–3 Frame High-Contrast Anime Impact Frame Overlay.
   * Guaranteed completely bypassed if `flashEffectEnabled === false`.
   */
  public renderImpactFrameOverlay(
    ctx: CanvasRenderingContext2D,
    viewW: number,
    viewH: number,
    flashEffectEnabled: boolean
  ): boolean {
    if (!flashEffectEnabled || this.impactFrame.remainingFrames <= 0) {
      return false;
    }

    ctx.save();
    const isBlackFrame = this.impactFrame.invertPolarity;
    ctx.fillStyle = isBlackFrame
      ? 'rgba(5, 7, 12, 0.72)'
      : 'rgba(248, 250, 252, 0.56)';
    ctx.fillRect(0, 0, viewW, viewH);

    // High-contrast anime radial speedlines around screen edges
    const cx = viewW * 0.5;
    const cy = viewH * 0.5;
    const outerR = Math.hypot(cx, cy);
    ctx.strokeStyle = isBlackFrame ? '#ffffff' : '#09090b';
    ctx.lineWidth = 3;
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2 + this.impactFrame.remainingFrames * 0.12;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(a) * (outerR * 0.42), cy + Math.sin(a) * (outerR * 0.42));
      ctx.lineTo(cx + Math.cos(a) * outerR, cy + Math.sin(a) * outerR);
      ctx.stroke();
    }
    ctx.restore();
    return true;
  }
}

export const sharedBattlePixelVfxEngine = new PixelVfxEngine();
