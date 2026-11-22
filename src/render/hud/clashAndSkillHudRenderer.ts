import { clamp } from '../../core/math/vector2';
import type { BattleWorldState, UnitRuntimeState } from '../../core/types/battleState';
import type { GameDataRegistry } from '../../core/types/dataSchemas';
import type { KeyBindingConfig } from '../../input/keyBindings';
import type { SafeHudBounds } from '../viewport/safeAreaLayout';

let cachedBindingsRef: KeyBindingConfig | null = null;
const CACHED_SKILL_KEYS: [string, string, string, string] = ['1', '2', '3', '4'];
let cachedDodgeKey = 'ShiftLeft';
let cachedSwapKey = 'Tab';

function ensureKeyLabels(bindings: KeyBindingConfig): void {
  if (cachedBindingsRef === bindings) return;
  cachedBindingsRef = bindings;
  CACHED_SKILL_KEYS[0] = bindings.skill1.replace('Digit', '').replace('Key', '');
  CACHED_SKILL_KEYS[1] = bindings.skill2.replace('Digit', '').replace('Key', '');
  CACHED_SKILL_KEYS[2] = bindings.skill3.replace('Digit', '').replace('Key', '');
  CACHED_SKILL_KEYS[3] = bindings.skill4.replace('Digit', '').replace('Key', '');
  cachedDodgeKey = bindings.dodge.replace('Key', '');
  cachedSwapKey = bindings.quickSwap.replace('Key', '');
}

export function renderActiveClashHud(
  ctx: CanvasRenderingContext2D,
  world: BattleWorldState,
  viewW: number,
  safeT: number
): void {
  const cx = viewW * 0.5;
  let y = 58 + safeT;

  const bc = world.beamClashes[0];
  if (bc) {
    const rem = Math.max(0, bc.maxTieSec - bc.elapsedSec);
    ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
    ctx.fillRect(cx - 130, y, 260, 26);
    ctx.strokeStyle = '#facc15';
    ctx.strokeRect(cx - 130, y, 260, 26);

    const ratio = clamp(bc.clashRatio, 0, 1);
    ctx.fillStyle = '#38bdf8';
    ctx.fillRect(cx - 126, y + 14, Math.round(252 * ratio), 8);
    ctx.fillStyle = '#f43f5e';
    ctx.fillRect(
      cx - 126 + Math.round(252 * ratio),
      y + 14,
      252 - Math.round(252 * ratio),
      8
    );

    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fde047';
    ctx.fillText(`⚡ BEAM CLASH! 무승부까지 ${rem.toFixed(1)}s`, cx, y + 11);
    y += 30;
  }

  const mg = world.meleeBeamGuards[0];
  if (mg) {
    const rem = Math.max(0, mg.durationSec - mg.elapsedSec);
    ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
    ctx.fillRect(cx - 120, y, 240, 20);
    ctx.strokeStyle = '#2dd4bf';
    ctx.strokeRect(cx - 120, y, 240, 20);
    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#2dd4bf';
    ctx.fillText(`🛡 MELEE vs BEAM GUARD (${rem.toFixed(2)}s | 30% 피해)`, cx, y + 14);
    y += 24;
  }

  const mc = world.meleeClashes[0];
  if (mc) {
    const rem = Math.max(0, mc.maxDurationSec - mc.elapsedSec);
    ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
    ctx.fillRect(cx - 135, y, 270, 22);
    ctx.strokeStyle = mc.isConquerorSkySplit ? '#ef4444' : '#facc15';
    ctx.strokeRect(cx - 135, y, 270, 22);
    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = mc.isConquerorSkySplit ? '#f87171' : '#fde047';
    ctx.fillText(
      mc.isConquerorSkySplit
        ? `⚡ 패왕색 하늘 가르기 힘겨루기! (${rem.toFixed(1)}s)`
        : `⚔ MELEE CLASH! (${rem.toFixed(1)}s)`,
      cx,
      y + 15
    );
  }
}

export function renderBottomSkillHud(
  ctx: CanvasRenderingContext2D,
  unit: UnitRuntimeState,
  world: BattleWorldState,
  registry: GameDataRegistry,
  bindings: KeyBindingConfig,
  isTouchMode: boolean,
  safe: SafeHudBounds
): void {
  const slotWidth = isTouchMode ? 84 : 118;
  const slotHeight = 44;
  const gap = 6;
  const totalSlots = unit.moveSlots.length;
  const totalW = totalSlots * slotWidth + (totalSlots - 1) * gap;
  const startX = Math.round((safe.viewWidth - totalW) * 0.5);
  const y = Math.round(safe.bottom - slotHeight - 8);
  ensureKeyLabels(bindings);

  for (let idx = 0; idx < unit.moveSlots.length; idx++) {
    const slot = unit.moveSlots[idx];
    if (!slot) continue;
    const mDef = registry.moves[slot.moveId];
    if (!mDef) continue;
    const x = startX + idx * (slotWidth + gap);
    const ready = slot.charges > 0 && slot.cooldownTimer <= 0;
    const elemMeta =
      registry.elementsById?.get(mDef.element) ??
      registry.elements.elements.find((e) => e.id === mDef.element);

    ctx.fillStyle = ready
      ? 'rgba(15, 23, 42, 0.90)'
      : 'rgba(15, 23, 42, 0.60)';
    ctx.fillRect(x, y, slotWidth, slotHeight);
    ctx.strokeStyle = mDef.hasConquerorCoating
      ? '#ef4444'
      : ready
        ? (elemMeta?.color ?? '#38bdf8')
        : '#475569';
    ctx.lineWidth = ready ? 1.5 : 1;
    ctx.strokeRect(x, y, slotWidth, slotHeight);

    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'left';
    ctx.fillStyle = ready ? '#f8fafc' : '#94a3b8';
    const shortName =
      mDef.name.length > (isTouchMode ? 7 : 10)
        ? mDef.name.slice(0, isTouchMode ? 7 : 10)
        : mDef.name;
    ctx.fillText(`[${CACHED_SKILL_KEYS[idx] ?? String(idx + 1)}] ${shortName}`, x + 5, y + 14);

    ctx.font = '9px monospace';
    const archetypeKo =
      mDef.archetype === 'MELEE'
        ? '근접'
        : mDef.archetype === 'PROJECTILE'
          ? '원거리'
          : mDef.archetype === 'BEAM'
            ? '광선'
            : mDef.archetype === 'AOE_FIELD'
              ? '범위'
              : '특수';
    const hakiTag = mDef.hasConquerorCoating
      ? '⚡패왕색'
      : mDef.hasArmamentHaki
        ? '●무장색'
        : archetypeKo;
    ctx.fillStyle = mDef.hasConquerorCoating
      ? '#f87171'
      : (elemMeta?.color ?? '#38bdf8');
    ctx.fillText(hakiTag, x + 5, y + 27);

    ctx.textAlign = 'right';
    ctx.fillStyle = slot.charges > 0 ? '#4ade80' : '#f87171';
    ctx.fillText(`${slot.charges}/${slot.maxCharges}`, x + slotWidth - 5, y + 27);

    if (slot.cooldownTimer > 0) {
      ctx.fillStyle = '#facc15';
      ctx.fillText(`${slot.cooldownTimer.toFixed(1)}초`, x + slotWidth - 5, y + 40);
    } else {
      ctx.fillStyle = '#4ade80';
      ctx.fillText('사용 가능', x + slotWidth - 5, y + 40);
    }
  }

  if (!isTouchMode) {
    const dx = startX - 96;
    ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
    ctx.fillRect(dx, y, 90, slotHeight);
    ctx.strokeStyle = '#2dd4bf';
    ctx.strokeRect(dx, y, 90, slotHeight);
    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#2dd4bf';
    ctx.fillText(`[${cachedDodgeKey}] 회피`, dx + 6, y + 15);
    ctx.fillStyle = '#f8fafc';
    ctx.fillText(`스택: ${unit.dodgeStacks}/${unit.maxDodgeStacks}`, dx + 6, y + 29);
    const rechRatio =
      unit.dodgeStacks < unit.maxDodgeStacks
        ? unit.dodgeRechargeTimer / registry.balance.dodge.rechargeSec
        : 1;
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(dx + 6, y + 34, 78, 5);
    ctx.fillStyle = '#2dd4bf';
    ctx.fillRect(dx + 6, y + 34, Math.round(78 * rechRatio), 5);

    const fx = startX + totalW + 6;
    const canShift = !unit.hasUsedFormShift && unit.isAlive && unit.exhaustionTimer <= 0;
    ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
    ctx.fillRect(fx, y, 122, slotHeight);
    ctx.strokeStyle = canShift ? '#f59e0b' : '#475569';
    ctx.strokeRect(fx, y, 122, slotHeight);
    ctx.font = 'bold 9px monospace';
    ctx.textAlign = 'left';
    ctx.fillStyle = canShift ? '#fbbf24' : '#64748b';
    ctx.fillText(`[F]변신 / [Shift+F]각성`, fx + 5, y + 15);
    ctx.fillStyle = '#e2e8f0';
    ctx.fillText(
      unit.fruitNullifyTimer > 0 && unit.fruitType !== 'NONE'
        ? `봉인 (${unit.fruitNullifyTimer.toFixed(1)}s)`
        : unit.exhaustionTimer > 0
          ? `탈진 (${unit.exhaustionTimer.toFixed(1)}s)`
          : unit.activeFormId
            ? `폼: ${unit.currentStanceRole}`
            : `대기 (${unit.currentStanceRole})`,
      fx + 5,
      y + 32
    );
  }

  const roster = world.rosters[unit.team];
  if (roster.pivotWindowTimer > 0) {
    ctx.fillStyle = 'rgba(14, 165, 233, 0.92)';
    ctx.fillRect(Math.round(safe.centerX - 135), y - 28, 270, 22);
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(
      `⚡ [${cachedSwapKey}] 즉시 파티 교체 가능 (${roster.pivotWindowTimer.toFixed(1)}s)`,
      Math.round(safe.centerX),
      y - 13
    );
  }
}
