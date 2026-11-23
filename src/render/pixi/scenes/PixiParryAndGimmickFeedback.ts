import { Container, Graphics, Text } from 'pixi.js';
import type { BattleWorldState } from '../../../core/types/battleState';
import type { Disposable } from '../../../core/types/disposable';
import type { VisualPolishConfig } from '../../backend/renderBackend';

interface PopupBadge {
  text: Text;
  remainingSec: number;
  baseY: number;
}

interface SplashDroplet {
  x: number;
  y: number;
  vx: number;
  vy: number;
  lifeSec: number;
  maxLifeSec: number;
  color: number;
}

interface ReflectStreak {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  lifeSec: number;
}

export interface ParryFeedbackFrameResult {
  parryHitstopFrames: number;
  armamentTintUnitIds: ReadonlySet<string>;
  staggeredUnitIds: ReadonlySet<string>;
  buggySplitActive: boolean;
  reflectedProjectileIds: ReadonlySet<string>;
  shockwavePoints: Array<{ x: number; y: number }>;
  buggyBanterTriggerText: string | null;
}

export class PixiParryAndGimmickFeedback implements Disposable {
  public readonly worldOverlayRoot = new Container();
  private readonly gfx = new Graphics();
  private readonly popups: PopupBadge[] = [];
  private readonly splashes: SplashDroplet[] = [];
  private readonly reflectStreaks: ReflectStreak[] = [];
  private readonly armamentTimers = new Map<string, number>();
  private readonly projectileLastTeam = new Map<string, string>();
  private readonly seenVfxIds = new Set<string>();
  private readonly prevStaggeredIds = new Set<string>();
  private lastSlashImmuneCount = 0;
  private buggySplitVisualTimer = 0;
  private disposed = false;

  constructor() {
    this.worldOverlayRoot.label = 'parry_and_gimmick_feedback';
    this.worldOverlayRoot.addChild(this.gfx);
  }

  private spawnPopup(x: number, y: number, label: string, color: number): void {
    if (this.popups.length >= 10) {
      const oldest = this.popups.shift();
      if (oldest) {
        oldest.text.removeFromParent();
        oldest.text.destroy();
      }
    }
    const t = new Text({
      text: label,
      style: {
        fontFamily: 'monospace',
        fontSize: 12,
        fontWeight: 'bold',
        fill: color,
        stroke: { color: 0x090d16, width: 3 }
      }
    });
    t.anchor.set(0.5, 1);
    t.position.set(Math.round(x), Math.round(y));
    this.worldOverlayRoot.addChild(t);
    this.popups.push({ text: t, remainingSec: 0.9, baseY: y });
  }

  private spawnWaterSplash(x: number, y: number, count = 4): void {
    for (let i = 0; i < count; i++) {
      if (this.splashes.length >= 40) break;
      const ang = (Math.PI * 2 * i) / count + (i % 2) * 0.35;
      this.splashes.push({
        x,
        y,
        vx: Math.cos(ang) * (24 + i * 8),
        vy: -28 - (i % 3) * 14,
        lifeSec: 0.38,
        maxLifeSec: 0.38,
        color: i % 2 === 0 ? 0x38bdf8 : 0xe0f2fe
      });
    }
  }

  public step(
    world: BattleWorldState,
    dtSec: number,
    polish: VisualPolishConfig
  ): ParryFeedbackFrameResult {
    const shockwavePoints: Array<{ x: number; y: number }> = [];
    const armamentTintUnitIds = new Set<string>();
    const staggeredUnitIds = new Set<string>();
    const reflectedProjectileIds = new Set<string>();
    let parryHitstopFrames = 0;
    let buggyBanterTriggerText: string | null = null;

    // 1. Track parry / clash / deflect VFX events
    for (const ev of world.vfxEvents) {
      if (this.seenVfxIds.has(ev.id)) continue;
      this.seenVfxIds.add(ev.id);
      if (this.seenVfxIds.size > 256) {
        this.seenVfxIds.clear();
        this.seenVfxIds.add(ev.id);
      }

      if (ev.kind === 'JUST_DODGE_RING' || ev.kind === 'CLASH_SHOCKWAVE' || ev.kind === 'BEAM_BREAK') {
        shockwavePoints.push({ x: ev.pos.x, y: ev.pos.y });
        parryHitstopFrames = Math.max(parryHitstopFrames, 3);
        const defender = world.units.find(
          (u) => u.isOnField && u.isAlive && Math.hypot(u.pos.x - ev.pos.x, u.pos.y - ev.pos.y) < 64
        );
        if (defender) {
          this.armamentTimers.set(defender.instanceId, 0.24);
          this.spawnPopup(defender.pos.x, defender.pos.y - 38, 'JUST GUARD!', 0xfef08a);
        }
      } else if (ev.id.startsWith('vfx_deflect_')) {
        const enemyBoss = world.units.find((u) => u.team === 'OMEGA' && u.isAlive && u.isOnField);
        if (enemyBoss) {
          this.reflectStreaks.push({
            x1: ev.pos.x,
            y1: ev.pos.y,
            x2: enemyBoss.pos.x,
            y2: enemyBoss.pos.y,
            lifeSec: 0.28
          });
        }
        this.spawnPopup(ev.pos.x, ev.pos.y - 22, 'REFLECT!', 0x38bdf8);
      }
    }

    // 2. Unit armament glow, 1.4s stagger counter icon, and Arlong water splashes
    for (const u of world.units) {
      if (!u.isAlive || !u.isOnField) continue;
      const isStaggered = u.statuses.some((s) => s.kind === 'STAGGER' && s.remainingSec > 0);
      if (isStaggered) {
        staggeredUnitIds.add(u.instanceId);
        if (!this.prevStaggeredIds.has(u.instanceId) && u.isBossUnit) {
          this.spawnPopup(u.pos.x, u.pos.y - 44, 'PARRY BREAK!', 0xfacc15);
        }
      }
      if (u.inWaterTerrain && world.tick % 12 === 0) {
        this.spawnWaterSplash(u.pos.x, u.pos.y + Math.round(u.radiusPx * 0.55), 4);
      }
    }
    this.prevStaggeredIds.clear();
    for (const id of staggeredUnitIds) this.prevStaggeredIds.add(id);

    for (const [uid, t] of this.armamentTimers.entries()) {
      const next = t - dtSec;
      if (next <= 0) this.armamentTimers.delete(uid);
      else {
        this.armamentTimers.set(uid, next);
        armamentTintUnitIds.add(uid);
      }
    }

    // 3. Buggy slash-split feedback + BattleBanterOverlay hint
    if (world.slashImmuneMissCount > this.lastSlashImmuneCount) {
      this.lastSlashImmuneCount = world.slashImmuneMissCount;
      this.buggySplitVisualTimer = 0.65;
      buggyBanterTriggerText =
        world.tacticalHintText ??
        '버기: "동강동강 열매 앞에서 참격은 무효다!" (타격 동료로 교체)';
    }
    if (this.buggySplitVisualTimer > 0) {
      this.buggySplitVisualTimer = Math.max(0, this.buggySplitVisualTimer - dtSec);
    }

    // 4. Reflected projectile detection & trails
    this.gfx.clear();
    for (const p of world.projectiles) {
      if (p.destroyed) continue;
      const prevTeam = this.projectileLastTeam.get(p.id);
      if ((prevTeam && prevTeam !== p.team) || p.bouncedByRubberFloor) {
        reflectedProjectileIds.add(p.id);
      }
      this.projectileLastTeam.set(p.id, p.team);
    }
    for (const pid of Array.from(this.projectileLastTeam.keys())) {
      if (!world.projectiles.some((p) => p.id === pid && !p.destroyed)) {
        this.projectileLastTeam.delete(pid);
      }
    }

    for (const p of world.projectiles) {
      if (p.destroyed || !reflectedProjectileIds.has(p.id)) continue;
      const speed = Math.max(1, Math.hypot(p.vel.x, p.vel.y));
      const nx = p.vel.x / speed;
      const ny = p.vel.y / speed;
      const tx = p.pos.x - nx * 36;
      const ty = p.pos.y - ny * 36;
      this.gfx.moveTo(tx, ty);
      this.gfx.lineTo(p.pos.x, p.pos.y);
      this.gfx.stroke({
        color: 0xfacc15,
        width: polish.flashEffectEnabled ? 5 : 3,
        alpha: polish.flashEffectEnabled ? 0.92 : 0.6
      });
      this.gfx.circle(p.pos.x, p.pos.y, p.radiusPx + 4);
      this.gfx.stroke({ color: 0xe0f2fe, width: 2, alpha: 0.85 });
    }

    for (let i = this.reflectStreaks.length - 1; i >= 0; i--) {
      const s = this.reflectStreaks[i];
      if (!s) continue;
      s.lifeSec -= dtSec;
      if (s.lifeSec <= 0) {
        this.reflectStreaks.splice(i, 1);
        continue;
      }
      const alpha = s.lifeSec / 0.28;
      this.gfx.moveTo(s.x1, s.y1);
      this.gfx.lineTo(s.x2, s.y2);
      this.gfx.stroke({ color: 0xfacc15, width: 3, alpha: alpha * 0.85 });
    }

    // Overhead stagger counter-window icons
    for (const u of world.units) {
      if (!u.isAlive || !u.isOnField || !staggeredUnitIds.has(u.instanceId)) continue;
      const topY = u.pos.y - Math.round(u.radiusPx * 2.2) - 18;
      const phase = world.elapsedSec * 7.5;
      for (let k = 0; k < 3; k++) {
        const ang = phase + (k * Math.PI * 2) / 3;
        const sx = u.pos.x + Math.cos(ang) * 14;
        const sy = topY + Math.sin(ang) * 4;
        this.gfx.circle(sx, sy, 3);
        this.gfx.fill({ color: 0xfef08a, alpha: 0.95 });
      }
    }

    // Water splash particles
    for (let i = this.splashes.length - 1; i >= 0; i--) {
      const d = this.splashes[i];
      if (!d) continue;
      d.lifeSec -= dtSec;
      if (d.lifeSec <= 0) {
        this.splashes.splice(i, 1);
        continue;
      }
      d.x += d.vx * dtSec;
      d.y += d.vy * dtSec;
      d.vy += 120 * dtSec;
      this.gfx.rect(Math.round(d.x) - 1, Math.round(d.y) - 1, 3, 3);
      this.gfx.fill({ color: d.color, alpha: d.lifeSec / d.maxLifeSec });
    }

    // Floating popups
    for (let i = this.popups.length - 1; i >= 0; i--) {
      const p = this.popups[i];
      if (!p) continue;
      p.remainingSec -= dtSec;
      if (p.remainingSec <= 0) {
        p.text.removeFromParent();
        p.text.destroy();
        this.popups.splice(i, 1);
        continue;
      }
      const prog = 1 - p.remainingSec / 0.9;
      p.text.y = Math.round(p.baseY - prog * 18);
      p.text.alpha = Math.min(1, p.remainingSec * 2.5);
    }

    return {
      parryHitstopFrames,
      armamentTintUnitIds,
      staggeredUnitIds,
      buggySplitActive: this.buggySplitVisualTimer > 0,
      reflectedProjectileIds,
      shockwavePoints,
      buggyBanterTriggerText
    };
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const p of this.popups) p.text.destroy();
    this.popups.length = 0;
    this.splashes.length = 0;
    this.reflectStreaks.length = 0;
    this.armamentTimers.clear();
    this.projectileLastTeam.clear();
    this.seenVfxIds.clear();
    this.prevStaggeredIds.clear();
    this.worldOverlayRoot.destroy({ children: true, texture: false });
  }
}
