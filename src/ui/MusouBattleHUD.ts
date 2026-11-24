import type { MusouHudSnapshot } from '../core/battle/musou/MusouTypes';
import type {
  MusouBannerState,
  ProjectedDamagePopup
} from '../render/three/musou/ArmorBreakVfxSystem';
import {
  DEFAULT_VIEWPORT_METRICS,
  type ViewportMetrics
} from '../render/viewport/responsiveViewportManager';
import { getSafeHudBounds } from '../render/viewport/safeAreaLayout';

export type MusouHudActionId =
  | 'BURST'
  | 'ATTACK'
  | 'CHARGE'
  | 'JUMP'
  | 'DASH'
  | 'SPECIAL_0'
  | 'SPECIAL_1'
  | 'SPECIAL_2'
  | 'SPECIAL_3';

export interface MusouHudRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface MusouHudCircleButton {
  id: Exclude<MusouHudActionId, 'BURST'>;
  x: number;
  y: number;
  r: number;
  label: string;
  keyHint: string;
  slotIndex?: 0 | 1 | 2 | 3;
}

export interface MusouHudLayout {
  playerCard: MusouHudRect;
  burstButton: MusouHudRect;
  bossBar: MusouHudRect;
  koCounter: MusouHudRect;
  staminaBar: MusouHudRect;
  buttons: MusouHudCircleButton[];
}

export interface MusouHudRenderOptions {
  banner?: MusouBannerState | null;
  damagePopups?: readonly ProjectedDamagePopup[];
  flashEffect?: boolean;
  elapsedSec?: number;
  lockedBossName?: string | null;
}

function clampRectInsideSafe(rect: MusouHudRect, safe: ReturnType<typeof getSafeHudBounds>): MusouHudRect {
  const x = Math.max(safe.left, Math.min(safe.right - rect.w, rect.x));
  const y = Math.max(safe.top, Math.min(safe.bottom - rect.h, rect.y));
  return { x: Math.round(x), y: Math.round(y), w: Math.round(rect.w), h: Math.round(rect.h) };
}

/**
 * Computes Safe Area HUD placement for Galaxy S25 Ultra (915x412, 19.5:9) and all 16:9..21:9 screens
 * with 0px pairwise overlap between panels, speed/pause buttons, and right-thumb Special Arc buttons.
 */
export function computeMusouHudLayout(
  viewport: ViewportMetrics = DEFAULT_VIEWPORT_METRICS
): MusouHudLayout {
  const safe = getSafeHudBounds(viewport, 8);
  const playerCard = clampRectInsideSafe(
    { x: safe.left, y: safe.top, w: 236, h: 84 },
    safe
  );
  const burstButton: MusouHudRect = {
    x: playerCard.x + 148,
    y: playerCard.y + 54,
    w: 80,
    h: 24
  };

  // Placed strictly below BattleSpeedAndPauseHud (y: insets.top + 12..42 or safe.top + 20..50)
  const bossTopY = Math.max(safe.top + 46, Math.round(viewport.safeInsets.top + 56));
  const bossBar = clampRectInsideSafe(
    {
      x: Math.round(safe.centerX - 170),
      y: bossTopY,
      w: 340,
      h: 62
    },
    safe
  );

  const koCounter = clampRectInsideSafe(
    {
      x: safe.right - 160,
      y: safe.top,
      w: 160,
      h: 88
    },
    safe
  );

  const staminaBar = clampRectInsideSafe(
    {
      x: Math.round(safe.centerX - 114),
      y: safe.bottom - 26,
      w: 228,
      h: 24
    },
    safe
  );

  const anchorX = safe.right - 66;
  const anchorY = safe.bottom - 58;
  const rawButtons: MusouHudCircleButton[] = [
    { id: 'ATTACK', x: anchorX + 14, y: anchorY + 8, r: 28, label: '약공', keyHint: 'J' },
    { id: 'DASH', x: anchorX - 56, y: anchorY + 12, r: 24, label: '대시', keyHint: 'SHF' },
    { id: 'CHARGE', x: anchorX - 42, y: anchorY - 46, r: 24, label: '강공', keyHint: 'K' },
    { id: 'JUMP', x: anchorX + 20, y: anchorY - 56, r: 23, label: '점프', keyHint: 'V' },
    { id: 'SPECIAL_0', x: anchorX - 114, y: anchorY + 14, r: 22, label: '특수1', keyHint: '1', slotIndex: 0 },
    { id: 'SPECIAL_1', x: anchorX - 106, y: anchorY - 42, r: 22, label: '특수2', keyHint: '2', slotIndex: 1 },
    { id: 'SPECIAL_2', x: anchorX - 72, y: anchorY - 96, r: 22, label: '특수3', keyHint: '3', slotIndex: 2 },
    { id: 'SPECIAL_3', x: anchorX - 14, y: anchorY - 118, r: 22, label: '궁극4', keyHint: '4', slotIndex: 3 }
  ];

  const buttons = rawButtons.map((b) => ({
    ...b,
    x: Math.round(Math.max(safe.left + b.r, Math.min(safe.right - b.r, b.x))),
    y: Math.round(Math.max(safe.top + b.r, Math.min(safe.bottom - b.r, b.y)))
  }));

  return {
    playerCard,
    burstButton,
    bossBar,
    koCounter,
    staminaBar,
    buttons
  };
}

export function hitTestMusouBattleHud(
  pt: { x: number; y: number },
  viewport: ViewportMetrics = DEFAULT_VIEWPORT_METRICS
): MusouHudActionId | null {
  const layout = computeMusouHudLayout(viewport);
  const bb = layout.burstButton;
  if (pt.x >= bb.x && pt.x <= bb.x + bb.w && pt.y >= bb.y && pt.y <= bb.y + bb.h) {
    return 'BURST';
  }
  for (const btn of layout.buttons) {
    if (Math.hypot(pt.x - btn.x, pt.y - btn.y) <= btn.r + 6) {
      return btn.id;
    }
  }
  return null;
}

/**
 * Renders PW4 Musou HUD on Canvas 2D overlay with ZERO ctx.shadowBlur calls.
 */
export function renderMusouBattleHud(
  ctx: CanvasRenderingContext2D,
  snapshot: MusouHudSnapshot,
  viewport: ViewportMetrics = DEFAULT_VIEWPORT_METRICS,
  options: MusouHudRenderOptions = {}
): void {
  const layout = computeMusouHudLayout(viewport);
  const flashEffect = options.flashEffect !== false;
  const elapsedSec = options.elapsedSec ?? 0;

  ctx.save();

  // Photosensitive-safe white screen flash only when enabled
  if (flashEffect && options.banner && options.banner.whiteFlashAlpha > 0.01) {
    ctx.fillStyle = `rgba(255, 255, 255, ${options.banner.whiteFlashAlpha.toFixed(3)})`;
    ctx.fillRect(0, 0, viewport.viewWidth, viewport.viewHeight);
  }

  // 1. Top-Left: Hero Portrait Box + HP + Action Type Badge + Burst Gauge/Button
  const pc = layout.playerCard;
  ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
  ctx.strokeStyle = snapshot.themeColor;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(pc.x, pc.y, pc.w, pc.h, 8);
  ctx.fill();
  ctx.stroke();

  // Portrait badge
  ctx.fillStyle = '#090d16';
  ctx.fillRect(pc.x + 8, pc.y + 8, 36, 36);
  ctx.strokeStyle = snapshot.themeColor;
  ctx.lineWidth = 1.5;
  ctx.strokeRect(pc.x + 8, pc.y + 8, 36, 36);
  ctx.font = 'bold 14px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = snapshot.themeColor;
  ctx.fillText(snapshot.badgeText.slice(0, 3), pc.x + 26, pc.y + 26);

  // Name & Action Type Badge
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.font = 'bold 11px sans-serif';
  ctx.fillStyle = '#f8fafc';
  ctx.fillText(snapshot.playerName, pc.x + 50, pc.y + 9, 108);

  ctx.fillStyle = snapshot.themeColor;
  ctx.fillRect(pc.x + 162, pc.y + 8, 66, 16);
  ctx.font = 'bold 9px monospace';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#090d16';
  ctx.fillText(snapshot.badgeText, pc.x + 195, pc.y + 12);

  // Player HP bar
  const hpRatio = Math.max(0, Math.min(1, snapshot.hp / Math.max(1, snapshot.maxHp)));
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(pc.x + 50, pc.y + 30, 178, 11);
  ctx.fillStyle = hpRatio > 0.35 ? '#22c55e' : '#ef4444';
  ctx.fillRect(pc.x + 50, pc.y + 30, Math.round(178 * hpRatio), 11);
  ctx.font = 'bold 8px monospace';
  ctx.fillStyle = '#f8fafc';
  ctx.fillText(`HP ${snapshot.hp}/${snapshot.maxHp}`, pc.x + 139, pc.y + 32);

  // Full-Force Burst Gauge & Instant Tap Button
  const burstReady = !snapshot.burstActive && snapshot.burstGauge >= snapshot.burstGaugeMax;
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(pc.x + 8, pc.y + 56, 134, 18);
  ctx.fillStyle = snapshot.burstActive ? '#facc15' : burstReady ? '#38bdf8' : '#f59e0b';
  ctx.fillRect(pc.x + 8, pc.y + 56, Math.round(134 * Math.max(0, Math.min(1, snapshot.burstRatio))), 18);
  ctx.font = 'bold 9px monospace';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#090d16';
  ctx.fillText(
    snapshot.burstActive
      ? `진심 버스트 ${snapshot.burstRemainingSec.toFixed(1)}s`
      : `BURST ${Math.round(snapshot.burstRatio * 100)}%`,
    pc.x + 75,
    pc.y + 61
  );

  const bb = layout.burstButton;
  const pulseOn = burstReady && (!flashEffect || Math.sin(elapsedSec * 12) > 0);
  ctx.fillStyle = snapshot.burstActive
    ? '#ca8a04'
    : burstReady
      ? pulseOn
        ? '#facc15'
        : '#0284c7'
      : '#1e293b';
  ctx.fillRect(bb.x, bb.y, bb.w, bb.h);
  ctx.strokeStyle = burstReady || snapshot.burstActive ? '#fde047' : '#475569';
  ctx.lineWidth = burstReady ? 2 : 1;
  ctx.strokeRect(bb.x, bb.y, bb.w, bb.h);
  ctx.font = 'bold 9px monospace';
  ctx.fillStyle = burstReady ? '#090d16' : '#f8fafc';
  ctx.fillText(snapshot.burstActive ? '각성중!' : '[B] 발동', bb.x + bb.w * 0.5, bb.y + 8);

  // 2. Top-Center: Giant Boss 2-Tier Gauge (Armor Shield Top + Boss HP Bottom)
  const br = layout.bossBar;
  ctx.fillStyle = 'rgba(15, 23, 42, 0.90)';
  ctx.strokeStyle =
    snapshot.bossArmorState === 'BROKEN_GROGGY'
      ? '#facc15'
      : snapshot.bossArmorState === 'CRACKED'
        ? '#f97316'
        : '#38bdf8';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(br.x, br.y, br.w, br.h, 6);
  ctx.fill();
  ctx.stroke();

  ctx.textAlign = 'left';
  ctx.font = 'bold 10px sans-serif';
  ctx.fillStyle = '#f8fafc';
  ctx.fillText(snapshot.bossName, br.x + 10, br.y + 6, br.w - 132);

  ctx.textAlign = 'right';
  ctx.font = 'bold 10px monospace';
  const stateTag =
    snapshot.bossArmorState === 'BROKEN_GROGGY'
      ? `GROGGY ${snapshot.bossGroggyRemainingSec.toFixed(1)}s (1.6x)`
      : snapshot.bossArmorState === 'CRACKED'
        ? `CRACKED ${Math.round((snapshot.bossArmor / Math.max(1, snapshot.bossMaxArmor)) * 100)}%`
        : `ARMOR ${snapshot.bossArmor}/${snapshot.bossMaxArmor}`;
  ctx.fillStyle =
    snapshot.bossArmorState === 'BROKEN_GROGGY'
      ? '#fde047'
      : snapshot.bossArmorState === 'CRACKED'
        ? '#fb923c'
        : '#7dd3fc';
  ctx.fillText(stateTag, br.x + br.w - 10, br.y + 6);

  // Top Bar: Boss Armor Shield
  const armorRatio = Math.max(0, Math.min(1, snapshot.bossArmor / Math.max(1, snapshot.bossMaxArmor)));
  ctx.fillStyle = '#090d16';
  ctx.fillRect(br.x + 10, br.y + 23, br.w - 20, 12);
  ctx.fillStyle = snapshot.bossArmorState === 'CRACKED' ? '#fb923c' : '#38bdf8';
  ctx.fillRect(br.x + 10, br.y + 23, Math.round((br.w - 20) * armorRatio), 12);
  if (snapshot.bossMarkedStacks > 0) {
    ctx.textAlign = 'center';
    ctx.font = 'bold 8px monospace';
    ctx.fillStyle = '#e9d5ff';
    ctx.fillText(`ROOM 표식 x${snapshot.bossMarkedStacks}`, br.x + br.w * 0.5, br.y + 25);
  }

  // Bottom Bar: Boss HP
  const bossHpRatio = Math.max(0, Math.min(1, snapshot.bossHp / Math.max(1, snapshot.bossMaxHp)));
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(br.x + 10, br.y + 40, br.w - 20, 14);
  ctx.fillStyle = snapshot.bossArmorState === 'BROKEN_GROGGY' ? '#eab308' : '#dc2626';
  ctx.fillRect(br.x + 10, br.y + 40, Math.round((br.w - 20) * bossHpRatio), 14);
  ctx.textAlign = 'center';
  ctx.font = 'bold 9px monospace';
  ctx.fillStyle = '#f8fafc';
  ctx.fillText(`BOSS HP ${snapshot.bossHp}/${snapshot.bossMaxHp}`, br.x + br.w * 0.5, br.y + 43);

  // 3. Top-Right: Realtime KO & HIT Combo Counter
  const kc = layout.koCounter;
  ctx.fillStyle = 'rgba(15, 23, 42, 0.86)';
  ctx.strokeStyle = snapshot.hitComboCount > 0 ? '#facc15' : '#38bdf8';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(kc.x, kc.y, kc.w, kc.h, 8);
  ctx.fill();
  ctx.stroke();

  ctx.textAlign = 'left';
  ctx.font = 'bold 20px sans-serif';
  ctx.fillStyle = '#f8fafc';
  ctx.fillText(`${snapshot.koCount}`, kc.x + 12, kc.y + 10);
  ctx.font = 'bold 11px sans-serif';
  ctx.fillStyle = '#facc15';
  ctx.fillText('K.O.', kc.x + kc.w - 38, kc.y + 14);

  ctx.font = snapshot.hitComboCount > 0 ? 'bold 16px sans-serif' : '11px sans-serif';
  ctx.fillStyle = snapshot.hitComboCount > 0 ? '#38bdf8' : '#94a3b8';
  ctx.fillText(
    snapshot.hitComboCount > 0 ? `${snapshot.hitComboCount} HIT!` : '연격 대기 중',
    kc.x + 12,
    kc.y + 38
  );

  ctx.font = 'bold 10px monospace';
  ctx.fillStyle = options.lockedBossName ? '#fb7185' : '#cbd5e1';
  ctx.fillText(
    options.lockedBossName ? `🎯 ${options.lockedBossName}` : '[TAB] 보스 록온',
    kc.x + 12,
    kc.y + 64,
    kc.w - 24
  );

  // 4. Bottom-Center: Stamina Gauge + Power Dash Cancel Indicator + Air Dash Pips
  const sb = layout.staminaBar;
  ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
  ctx.strokeStyle = snapshot.canPowerDashCancel ? '#facc15' : '#475569';
  ctx.lineWidth = snapshot.canPowerDashCancel ? 2 : 1;
  ctx.beginPath();
  ctx.roundRect(sb.x, sb.y, sb.w, sb.h, 5);
  ctx.fill();
  ctx.stroke();

  const stamRatio = Math.max(0, Math.min(1, snapshot.stamina / Math.max(1, snapshot.maxStamina)));
  ctx.fillStyle = snapshot.infiniteStamina
    ? '#a855f7'
    : snapshot.canPowerDashCancel
      ? '#22d3ee'
      : '#38bdf8';
  ctx.fillRect(sb.x + 4, sb.y + 4, Math.round((sb.w - 46) * stamRatio), sb.h - 8);

  // Air dash pips on right edge of stamina bar
  for (let i = 0; i < snapshot.maxAirDashes; i += 1) {
    const used = i < snapshot.airDashCount;
    ctx.fillStyle = used ? '#334155' : '#facc15';
    ctx.beginPath();
    ctx.arc(sb.x + sb.w - 10 - i * 11, sb.y + sb.h * 0.5, 4, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.textAlign = 'left';
  ctx.font = 'bold 8px monospace';
  ctx.fillStyle = '#090d16';
  ctx.fillText(
    snapshot.canPowerDashCancel ? 'DASH CANCEL!' : `STAMINA ${snapshot.stamina}`,
    sb.x + 8,
    sb.y + 8
  );

  // 5. Bottom-Right: Right-Thumb Ergonomic Arc + 4-Slot Special Radial Gauges
  for (const btn of layout.buttons) {
    const slot = btn.slotIndex !== undefined ? snapshot.specialSlots[btn.slotIndex] : undefined;
    const ready = slot ? slot.cooldownTicks <= 0 : true;
    const ratio = slot ? Math.max(0, Math.min(1, slot.chargeGauge / 1000)) : 1;

    ctx.fillStyle =
      btn.id === 'DASH' && snapshot.canPowerDashCancel
        ? 'rgba(34, 211, 238, 0.35)'
        : ready
          ? 'rgba(15, 23, 42, 0.84)'
          : 'rgba(15, 23, 42, 0.62)';
    ctx.beginPath();
    ctx.arc(btn.x, btn.y, btn.r, 0, Math.PI * 2);
    ctx.fill();

    // Base ring
    ctx.strokeStyle = slot ? (ready ? '#facc15' : '#475569') : btn.id === 'DASH' ? '#22d3ee' : snapshot.themeColor;
    ctx.lineWidth = btn.id === 'DASH' && snapshot.canPowerDashCancel ? 3 : 2;
    ctx.beginPath();
    ctx.arc(btn.x, btn.y, btn.r, 0, Math.PI * 2);
    ctx.stroke();

    // Radial cooldown progress arc for 4-slot specials
    if (slot && !ready && ratio > 0) {
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(btn.x, btn.y, btn.r - 2, -Math.PI * 0.5, -Math.PI * 0.5 + Math.PI * 2 * ratio);
      ctx.stroke();
    }

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `bold ${slot ? 9 : 10}px sans-serif`;
    ctx.fillStyle = ready ? '#f8fafc' : '#94a3b8';
    const labelText = slot ? slot.label.slice(0, 4) : btn.label;
    ctx.fillText(labelText, btn.x, btn.y - 4);

    ctx.font = 'bold 8px monospace';
    ctx.fillStyle = ready ? '#fde047' : '#38bdf8';
    const subText =
      slot && !ready ? `${(slot.cooldownTicks / 60).toFixed(1)}s` : `[${btn.keyHint}]`;
    ctx.fillText(subText, btn.x, btn.y + 8);
  }

  // 6. 3D Projected Damage Popups (Gold Crits for Groggy, Cyan-Gold for Armor Hits)
  if (options.damagePopups) {
    for (const p of options.damagePopups) {
      ctx.globalAlpha = Math.max(0, Math.min(1, p.alpha));
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      if (p.style === 'GROGGY_CRIT') {
        ctx.font = `bold ${Math.round(22 * p.scale)}px sans-serif`;
        ctx.fillStyle = '#fde047';
        ctx.fillText(`★ ${p.value}`, p.screenX, p.screenY);
      } else if (p.style === 'ARMOR_HIT') {
        ctx.font = `bold ${Math.round(15 * p.scale)}px monospace`;
        ctx.fillStyle = '#7dd3fc';
        ctx.fillText(`🛡 ${p.value}`, p.screenX, p.screenY);
      } else if (p.style === 'CRIT') {
        ctx.font = `bold ${Math.round(17 * p.scale)}px sans-serif`;
        ctx.fillStyle = '#fb923c';
        ctx.fillText(`${p.value}!`, p.screenX, p.screenY);
      } else {
        ctx.font = `bold ${Math.round(13 * p.scale)}px monospace`;
        ctx.fillStyle = '#f8fafc';
        ctx.fillText(`${p.value}`, p.screenX, p.screenY);
      }
    }
    ctx.globalAlpha = 1;
  }

  // 7. Comic Center Banner ("ARMOR BREAK!" / "FULL-FORCE BURST!")
  if (options.banner?.activeText && options.banner.alpha > 0.02) {
    const safe = getSafeHudBounds(viewport, 8);
    ctx.globalAlpha = options.banner.alpha;
    const bw = Math.min(360, safe.width - 40);
    const bx = Math.round(safe.centerX - bw * 0.5);
    const by = Math.max(Math.round(safe.top + 124), layout.bossBar.y + layout.bossBar.h + 8);
    ctx.fillStyle = 'rgba(9, 13, 22, 0.90)';
    ctx.strokeStyle = options.banner.color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(bx, by, bw, 52, 8);
    ctx.fill();
    ctx.stroke();

    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    ctx.font = 'bold 20px sans-serif';
    ctx.fillStyle = options.banner.color;
    ctx.fillText(options.banner.activeText, safe.centerX, by + 6);
    if (options.banner.subText) {
      ctx.font = 'bold 11px sans-serif';
      ctx.fillStyle = '#f8fafc';
      ctx.fillText(options.banner.subText, safe.centerX, by + 32);
    }
    ctx.globalAlpha = 1;
  }

  ctx.restore();
}
