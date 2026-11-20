import type { AssetLoader } from '../assets/assetLoader';
import {
  isTeamBondComboAvailable,
  selectBondPartnerUnit
} from '../core/battle/tagCombo';
import type { BattleWorldState } from '../core/types/battleState';
import type { GameDataRegistry } from '../core/types/dataSchemas';
import type { UnifiedInputManager } from '../input/inputManager';

export type TouchOverlayMode = 'BATTLE' | 'ISLAND' | 'SEA';

export function renderTouchOverlay(
  ctx: CanvasRenderingContext2D,
  input: UnifiedInputManager,
  mode: TouchOverlayMode = 'BATTLE',
  hasNearbyInteractable: boolean = false,
  world?: BattleWorldState,
  registry?: GameDataRegistry,
  assets?: AssetLoader
): void {
  if (!input.isTouchViewport()) {
    return;
  }

  const prefs = input.getTouchPrefs();
  const scale = input.getTouchScale();

  const primaryAlpha = world?.units.find(
    (u) => u.team === 'ALPHA' && u.isOnField && u.isAlive && u.isPlayerControlled
  ) ?? world?.units.find((u) => u.team === 'ALPHA' && u.isOnField && u.isAlive);
  const bondAvailable = world ? isTeamBondComboAvailable('ALPHA', world) : false;
  const bondGauge = world ? world.rosters.ALPHA.bondGauge : 0;
  const bondReady = bondAvailable && bondGauge >= 100;
  const bondPartner =
    world && primaryAlpha && bondAvailable
      ? selectBondPartnerUnit(primaryAlpha, world)
      : null;

  ctx.save();
  ctx.globalAlpha = prefs.opacity;

  // 1. Bottom-Left Floating Virtual Joystick (6.9-inch thumb ergonomic)
  const origin = input.virtualJoystickOrigin;
  const knob = input.virtualJoystickKnob;
  const outerR = Math.round(48 * scale);
  const knobR = Math.round(20 * scale);

  ctx.fillStyle = input.virtualJoystickActive
    ? 'rgba(14, 165, 233, 0.25)'
    : 'rgba(15, 23, 42, 0.55)';
  ctx.beginPath();
  ctx.arc(origin.x, origin.y, outerR, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = input.virtualJoystickActive
    ? 'rgba(125, 211, 252, 0.95)'
    : 'rgba(56, 189, 248, 0.72)';
  ctx.lineWidth = 2;
  ctx.stroke();

  ctx.fillStyle = 'rgba(56, 189, 248, 0.88)';
  ctx.beginPath();
  ctx.arc(knob.x, knob.y, knobR, 0, Math.PI * 2);
  ctx.fill();

  // 2. Bottom-Right Ergonomic Action Buttons (context-aware for BATTLE vs ISLAND/SEA)
  const buttons = input.getTouchButtons();
  for (const btn of buttons) {
    if (mode !== 'BATTLE') {
      if (btn.id !== 'SKILL_0' && !(mode === 'SEA' && btn.id === 'DODGE')) {
        continue;
      }
    }
    if (mode === 'BATTLE' && btn.id === 'BOND_COMBO' && world && !bondAvailable) {
      continue;
    }

    let label = btn.label;
    let subLabel = btn.subLabel;
    let color = btn.color;
    let fill = 'rgba(15, 23, 42, 0.76)';
    let lineWidth = 2;

    if (mode !== 'BATTLE' && btn.id === 'SKILL_0') {
      label = hasNearbyInteractable ? '상호작용' : '확인';
      subLabel = mode === 'SEA' ? '입항/관문' : '대화/조사';
      color = hasNearbyInteractable ? '#facc15' : '#38bdf8';
      fill = hasNearbyInteractable
        ? 'rgba(180, 83, 9, 0.88)'
        : 'rgba(15, 23, 42, 0.78)';
      lineWidth = hasNearbyInteractable ? 3 : 2;
    } else if (mode === 'SEA' && btn.id === 'DODGE') {
      label = '가속';
      subLabel = 'BURST';
      color = '#2dd4bf';
    } else if (mode === 'BATTLE' && btn.id === 'GUARD') {
      const guarding = input.isTouchGuardHeld() || Boolean(primaryAlpha?.guardHeld);
      const broken = (primaryAlpha?.guardBreakTicks ?? 0) > 0;
      fill = broken
        ? 'rgba(127, 29, 29, 0.85)'
        : guarding
          ? 'rgba(109, 40, 217, 0.88)'
          : 'rgba(15, 23, 42, 0.78)';
      color = broken ? '#ef4444' : guarding ? '#facc15' : '#a855f7';
      lineWidth = guarding ? 3 : 2;
      subLabel = broken
        ? 'BREAK'
        : primaryAlpha
          ? `${Math.round(primaryAlpha.guardStamina)}%`
          : 'PARRY';
    } else if (mode === 'BATTLE' && btn.id === 'BOND_COMBO') {
      const pulse = bondReady && world ? Math.sin(world.tick * 0.22) * 0.5 + 0.5 : 0;
      fill = bondReady
        ? `rgba(180, 83, 9, ${(0.82 + pulse * 0.16).toFixed(2)})`
        : 'rgba(15, 23, 42, 0.65)';
      color = bondReady ? '#fde047' : '#64748b';
      lineWidth = bondReady ? 3.5 : 1.5;
      subLabel = bondReady ? 'READY!' : `${Math.floor(bondGauge)}%`;
    }

    ctx.fillStyle = fill;
    ctx.beginPath();
    ctx.arc(btn.x, btn.y, btn.r, 0, Math.PI * 2);
    ctx.fill();

    // Progress ring for GUARD stamina or BOND gauge
    if (mode === 'BATTLE' && btn.id === 'GUARD' && primaryAlpha) {
      const ratio = Math.max(0, Math.min(1, primaryAlpha.guardStamina / Math.max(1, primaryAlpha.guardMaxStamina)));
      ctx.strokeStyle = color;
      ctx.lineWidth = lineWidth;
      ctx.beginPath();
      ctx.arc(btn.x, btn.y, btn.r, -Math.PI * 0.5, -Math.PI * 0.5 + Math.PI * 2 * ratio);
      ctx.stroke();
    } else if (mode === 'BATTLE' && btn.id === 'BOND_COMBO') {
      const ratio = Math.max(0, Math.min(1, bondGauge / 100));
      ctx.strokeStyle = 'rgba(100, 116, 139, 0.45)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(btn.x, btn.y, btn.r, 0, Math.PI * 2);
      ctx.stroke();

      ctx.strokeStyle = bondReady ? '#fde047' : '#f59e0b';
      ctx.lineWidth = lineWidth;
      ctx.beginPath();
      ctx.arc(btn.x, btn.y, btn.r, -Math.PI * 0.5, -Math.PI * 0.5 + Math.PI * 2 * ratio);
      ctx.stroke();

      // Golden pulsing dual mini-portraits when Bond Combo is READY!
      if (bondReady && primaryAlpha && bondPartner && registry && assets) {
        const pDefA = registry.units[primaryAlpha.speciesId];
        const pDefB = registry.units[bondPartner.speciesId];
        const imgA = pDefA
          ? assets.getOrCreateUnitPortrait(pDefA, 'excited', primaryAlpha.activeFormId).image
          : null;
        const imgB = pDefB
          ? assets.getOrCreateUnitPortrait(pDefB, 'excited', null).image
          : null;
        const mini = Math.round(btn.r * 0.78);
        ctx.save();
        ctx.imageSmoothingEnabled = false;
        if (imgA) {
          ctx.drawImage(imgA, Math.round(btn.x - mini - 1), Math.round(btn.y - mini * 0.65), mini, mini);
        }
        if (imgB) {
          ctx.drawImage(imgB, Math.round(btn.x + 1), Math.round(btn.y - mini * 0.65), mini, mini);
        }
        ctx.restore();
      }
    } else {
      ctx.strokeStyle = color;
      ctx.lineWidth = lineWidth;
      ctx.stroke();
    }

    ctx.font = `bold ${Math.max(9, Math.round(10 * scale))}px monospace`;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#f8fafc';
    const labelY =
      mode === 'BATTLE' && btn.id === 'BOND_COMBO' && bondReady
        ? btn.y + Math.round(10 * scale)
        : btn.y - 1;
    ctx.fillText(label, btn.x, labelY);

    if (!(mode === 'BATTLE' && btn.id === 'BOND_COMBO' && bondReady)) {
      ctx.font = `${Math.max(7, Math.round(8 * scale))}px monospace`;
      ctx.fillStyle = color;
      ctx.fillText(subLabel, btn.x, btn.y + Math.round(10 * scale));
    }
  }

  ctx.restore();
}
