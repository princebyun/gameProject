import type {
  MusouCombatState,
  MusouTickEvent
} from '../../../core/battle/musou/MusouTypes';
import type {
  BattleBanterRule,
  BattleBanterTriggerKind,
  StoryPortraitEmotion
} from '../../../data/story/types';
import {
  DEFAULT_VIEWPORT_METRICS,
  type ViewportMetrics
} from '../../viewport/responsiveViewportManager';
import { getSafeHudBounds } from '../../viewport/safeAreaLayout';

export type BanterPortraitResolver = (
  speakerId: string,
  emotion: StoryPortraitEmotion
) => HTMLImageElement | HTMLCanvasElement | null;

export interface ActiveBanterBanner {
  rule: BattleBanterRule;
  priority: number;
  remainingSec: number;
  durationSec: number;
}

export interface BanterRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

const BANTER_PRIORITY: Record<BattleBanterTriggerKind, number> = {
  onArmorBreak: 100,
  onBurstActivated: 90,
  bossHpBelow: 80,
  onGimmickHit: 70,
  onJustParry: 60,
  onKoMilestone: 50
};

const BANTER_DISPLAY_DURATION_SEC = 3.2;

/**
 * Computes Safe Area HUD bounds for the live mid-battle story comms banner.
 * Positioned directly beneath `playerCard` (x: safe.left, y: safe.top..safe.top+84) and strictly
 * left of center `bossBar` & `staminaBar`, ensuring 0px overlap at 915x412 (S25 Ultra) and 960x540.
 */
export function computeBanterBannerRect(
  viewport: ViewportMetrics = DEFAULT_VIEWPORT_METRICS
): BanterRect {
  const safe = getSafeHudBounds(viewport, 8);
  const maxAllowedRight = Math.round(safe.centerX - 178);
  const desiredW = Math.max(210, Math.min(296, maxAllowedRight - safe.left));
  const w = Math.min(desiredW, safe.width);
  const h = 54;
  const x = Math.max(safe.left, Math.min(safe.right - w, safe.left));
  const y = Math.max(safe.top + 92, Math.min(safe.bottom - h - 32, safe.top + 92));
  return {
    x: Math.round(x),
    y: Math.round(y),
    w: Math.round(w),
    h
  };
}

/**
 * Strictly read-only battle state & event observer for dynamic mid-combat dialogue banters.
 * Never mutates `MusouCombatState`, ensuring 0% drift on deterministic `stateHash`.
 */
export class MusouPhaseBanterController {
  private rules: readonly BattleBanterRule[] = [];
  private readonly firedIds = new Set<string>();
  private readonly queue: Array<{ rule: BattleBanterRule; priority: number }> = [];
  private activeBanner: ActiveBanterBanner | null = null;
  private justParrySeen = false;

  public loadRules(rules: readonly BattleBanterRule[]): void {
    this.rules = rules;
    this.resetForBattle();
  }

  public resetForBattle(): void {
    this.firedIds.clear();
    this.queue.length = 0;
    this.activeBanner = null;
    this.justParrySeen = false;
  }

  public hasFired(banterId: string): boolean {
    return this.firedIds.has(banterId);
  }

  public getActiveBanner(): Readonly<ActiveBanterBanner> | null {
    return this.activeBanner;
  }

  public getQueuedCount(): number {
    return this.queue.length;
  }

  public notifyJustParry(): void {
    this.justParrySeen = true;
  }

  public observeFrame(
    musouState: Readonly<MusouCombatState> | null,
    events: readonly MusouTickEvent[],
    koCount: number,
    dtSec: number,
    gimmickTag?: string | null
  ): void {
    const dt = Math.max(0, Math.min(0.1, dtSec));
    if (this.activeBanner) {
      this.activeBanner.remainingSec -= dt;
      if (this.activeBanner.remainingSec <= 0) {
        this.activeBanner = null;
      }
    }

    if (this.rules.length > 0 && musouState) {
      const hasArmorBreakEvent = events.some((e) => e.kind === 'BOSS_ARMOR_BREAK');
      const hasBurstEvent =
        events.some((e) => e.kind === 'BURST_ACTIVATE') || musouState.player.burstActive;
      const bossHpRatio = musouState.boss.hp / Math.max(1, musouState.boss.maxHp);

      for (const rule of this.rules) {
        if (this.firedIds.has(rule.banterId)) continue;
        let triggered = false;
        switch (rule.trigger) {
          case 'onArmorBreak':
            triggered =
              hasArmorBreakEvent || musouState.boss.armorState === 'BROKEN_GROGGY';
            break;
          case 'onBurstActivated':
            triggered = hasBurstEvent;
            break;
          case 'bossHpBelow':
            triggered = bossHpRatio <= (rule.threshold ?? 0.5);
            break;
          case 'onKoMilestone':
            triggered = koCount >= (rule.threshold ?? 30);
            break;
          case 'onJustParry':
            triggered = this.justParrySeen || musouState.player.invulnTicks >= 20;
            break;
          case 'onGimmickHit':
            triggered = Boolean(
              gimmickTag && (!rule.gimmickTag || rule.gimmickTag === gimmickTag)
            );
            break;
        }

        if (triggered) {
          this.enqueueRule(rule);
        }
      }
    }

    this.justParrySeen = false;

    if (!this.activeBanner && this.queue.length > 0) {
      const next = this.queue.shift()!;
      this.activeBanner = {
        rule: next.rule,
        priority: next.priority,
        remainingSec: BANTER_DISPLAY_DURATION_SEC,
        durationSec: BANTER_DISPLAY_DURATION_SEC
      };
    }
  }

  private enqueueRule(rule: BattleBanterRule): void {
    this.firedIds.add(rule.banterId);
    const priority = BANTER_PRIORITY[rule.trigger] ?? 50;

    // Higher-priority emergency trigger (e.g., Armor Break / Burst) preempts lower active banter
    if (this.activeBanner && priority > this.activeBanner.priority) {
      this.activeBanner = {
        rule,
        priority,
        remainingSec: BANTER_DISPLAY_DURATION_SEC,
        durationSec: BANTER_DISPLAY_DURATION_SEC
      };
      return;
    }

    this.queue.push({ rule, priority });
    this.queue.sort((a, b) => b.priority - a.priority);
    if (this.queue.length > 3) {
      this.queue.length = 3;
    }
  }

  public renderOverlay(
    ctx: CanvasRenderingContext2D,
    viewport: ViewportMetrics,
    resolvePortrait?: BanterPortraitResolver
  ): void {
    if (!this.activeBanner) return;
    renderMusouBanterBanner(ctx, viewport, this.activeBanner, resolvePortrait);
  }
}

export function renderMusouBanterBanner(
  ctx: CanvasRenderingContext2D,
  viewport: ViewportMetrics,
  banner: Readonly<ActiveBanterBanner>,
  resolvePortrait?: BanterPortraitResolver
): void {
  const rect = computeBanterBannerRect(viewport);
  const fadeAlpha =
    banner.remainingSec < 0.35 ? Math.max(0, banner.remainingSec / 0.35) : 1;

  ctx.save();
  ctx.globalAlpha = fadeAlpha;

  ctx.fillStyle = 'rgba(9, 13, 22, 0.88)';
  ctx.beginPath();
  ctx.roundRect(rect.x, rect.y, rect.w, rect.h, 8);
  ctx.fill();

  const accent =
    banner.rule.trigger === 'onArmorBreak'
      ? '#facc15'
      : banner.rule.trigger === 'onBurstActivated'
        ? '#f97316'
        : '#38bdf8';
  ctx.strokeStyle = accent;
  ctx.lineWidth = 1.6;
  ctx.stroke();

  // Left portrait frame
  const portraitSize = 42;
  const px = rect.x + 6;
  const py = rect.y + 6;
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(px, py, portraitSize, portraitSize);
  const portraitImg = resolvePortrait?.(banner.rule.speakerId, banner.rule.emotion);
  if (portraitImg) {
    ctx.drawImage(portraitImg, px, py, portraitSize, portraitSize);
  } else {
    ctx.fillStyle = accent;
    ctx.font = 'bold 14px monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(
      banner.rule.speakerName.slice(0, 1) || '★',
      px + portraitSize / 2,
      py + portraitSize / 2
    );
  }
  ctx.strokeStyle = '#94a3b8';
  ctx.lineWidth = 1;
  ctx.strokeRect(px, py, portraitSize, portraitSize);

  const tx = px + portraitSize + 8;
  const maxTextW = rect.x + rect.w - tx - 8;

  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillStyle = accent;
  ctx.font = 'bold 10px sans-serif';
  ctx.fillText(`📡 ${banner.rule.speakerName}`, tx, rect.y + 6, maxTextW);

  ctx.fillStyle = '#f8fafc';
  ctx.font = '11px sans-serif';
  const raw = banner.rule.text;
  const line1 = raw.length > 26 ? raw.slice(0, 26) : raw;
  const line2 = raw.length > 26 ? raw.slice(26, 52) : '';
  ctx.fillText(line1, tx, rect.y + 20, maxTextW);
  if (line2) {
    ctx.fillText(line2, tx, rect.y + 34, maxTextW);
  }

  ctx.restore();
}
