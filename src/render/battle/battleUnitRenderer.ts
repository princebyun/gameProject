import type { AssetLoader } from '../../assets/assetLoader';
import { FIXED_DT } from '../../core/constants';
import { clamp, type Vec2 } from '../../core/math/vector2';
import type { BattleWorldState, UnitRuntimeState } from '../../core/types/battleState';
import type { GameDataRegistry } from '../../core/types/dataSchemas';
import type { RenderAccessibilitySettings } from '../canvasRenderer';
import { lerpVecInto } from '../pools/renderScratchPools';
import {
  drawConquerorLightningBolts,
  getElementColorFast
} from './arenaVfxPrimitives';

const SCRATCH_UNIT_RAW_POS: Vec2 = { x: 0, y: 0 };
const SCRATCH_UNIT_INT_POS: Vec2 = { x: 0, y: 0 };
const SCRATCH_FOOT_POS: Vec2 = { x: 0, y: 0 };

const HAGOROMO_PUFF_ANGLES = [
  Math.PI * 0.9,
  Math.PI * 1.2,
  Math.PI * 1.5,
  Math.PI * 1.8,
  Math.PI * 2.1
] as const;

function drawHagoromoCloudSash(
  ctx: CanvasRenderingContext2D,
  pos: Vec2,
  scale: number,
  hagoromoColor: 'white' | 'black',
  tick: number
): void {
  ctx.save();
  const r = 20 * scale;
  const bob = Math.sin(tick * 0.14) * 2.5;
  const isWhite = hagoromoColor === 'white';

  ctx.strokeStyle = isWhite ? '#e2e8f0' : '#a855f7';
  ctx.lineWidth = 6 * scale;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(pos.x, pos.y - 3 + bob, r, Math.PI * 0.85, Math.PI * 2.15);
  ctx.stroke();

  ctx.strokeStyle = isWhite ? '#ffffff' : '#090d16';
  ctx.lineWidth = 3.8 * scale;
  ctx.beginPath();
  ctx.arc(pos.x, pos.y - 3 + bob, r, Math.PI * 0.85, Math.PI * 2.15);
  ctx.stroke();

  for (let i = 0; i < HAGOROMO_PUFF_ANGLES.length; i++) {
    const a = HAGOROMO_PUFF_ANGLES[i];
    if (a === undefined) continue;
    const px = pos.x + Math.cos(a) * r;
    const py = pos.y - 3 + bob + Math.sin(a) * r;
    ctx.fillStyle = isWhite ? '#ffffff' : '#090d16';
    ctx.strokeStyle = isWhite ? '#cbd5e1' : '#a855f7';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(px, py, 4.2 * scale, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  ctx.restore();
}

export function renderUnitOnArena(
  ctx: CanvasRenderingContext2D,
  unit: UnitRuntimeState,
  world: BattleWorldState,
  registry: GameDataRegistry,
  assets: AssetLoader,
  alpha: number,
  settings: RenderAccessibilitySettings
): void {
  const rawPos = lerpVecInto(unit.prevPos, unit.pos, alpha, SCRATCH_UNIT_RAW_POS);
  const px = Math.round(rawPos.x);
  const py = Math.round(rawPos.y);
  SCRATCH_UNIT_INT_POS.x = px;
  SCRATCH_UNIT_INT_POS.y = py;
  const pos = SCRATCH_UNIT_INT_POS;
  const unitDef = registry.units[unit.speciesId];
  const elemColor = getElementColorFast(registry, unit.element, '#38bdf8');

  ctx.save();

  if (unit.auraColor) {
    ctx.strokeStyle = unit.auraColor;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(
      pos.x,
      pos.y,
      unit.radiusPx * unit.visualScale + 6 + Math.sin(world.tick * 0.25) * 2,
      0,
      Math.PI * 2
    );
    ctx.stroke();
  }

  if (unit.hagoromoColor) {
    drawHagoromoCloudSash(ctx, pos, unit.visualScale, unit.hagoromoColor, world.tick);
  }

  const unitTrait = registry.traits[unit.traitId];
  if (unitTrait?.lunarianFlame?.enabled) {
    if (unit.lunarianFlameOn) {
      const flameSideX = pos.x - unit.aimDir.x * (10 * unit.visualScale);
      const flameBaseY = pos.y - 8 * unit.visualScale;
      const flicker = Math.sin(world.tick * 0.35) * 4;
      ctx.fillStyle = '#f97316';
      ctx.fillRect(
        Math.round(flameSideX - 6),
        Math.round(flameBaseY - 14 + flicker),
        12,
        16
      );
      ctx.fillStyle = '#fde047';
      ctx.fillRect(
        Math.round(flameSideX - 3),
        Math.round(flameBaseY - 10 + flicker),
        6,
        10
      );
    } else {
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.65)';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, unit.radiusPx + 5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  if (unitTrait?.superRegeneration?.enabled) {
    if (unit.superRegenLockoutTimer > 0) {
      drawConquerorLightningBolts(ctx, pos, unit.radiusPx + 10, world.tick, 3);
    } else if (unit.superRegenIdleTimer >= (unitTrait.superRegeneration.delayAfterHitSec ?? 1.5)) {
      ctx.strokeStyle = 'rgba(220, 38, 38, 0.72)';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(
        pos.x,
        pos.y,
        unit.radiusPx + 6 + Math.sin(world.tick * 0.2) * 3,
        0,
        Math.PI * 2
      );
      ctx.stroke();
    }
  }

  if (unit.logiaDispersionTimer > 0) {
    ctx.globalAlpha = 0.45;
    for (let i = 0; i < 6; i++) {
      const ang = (i * Math.PI) / 3 + world.tick * 0.3;
      ctx.fillStyle = elemColor;
      ctx.beginPath();
      ctx.arc(
        pos.x + Math.cos(ang) * 18,
        pos.y + Math.sin(ang) * 18,
        4,
        0,
        Math.PI * 2
      );
      ctx.fill();
    }
  }

  ctx.strokeStyle = unit.team === 'ALPHA' ? '#38bdf8' : '#f43f5e';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(pos.x, pos.y, unit.radiusPx, 0, Math.PI * 2);
  ctx.stroke();

  const tipX = pos.x + unit.aimDir.x * (unit.radiusPx + 8);
  const tipY = pos.y + unit.aimDir.y * (unit.radiusPx + 8);
  ctx.fillStyle = elemColor;
  ctx.beginPath();
  ctx.arc(tipX, tipY, 3.5, 0, Math.PI * 2);
  ctx.fill();

  if (unit.iframeTimer > 0 && world.tick % 2 === 0) {
    ctx.globalAlpha = 0.55;
  }

  if (unitDef) {
    const formDef = unit.activeFormId ? registry.forms[unit.activeFormId] ?? null : null;
    const { entry: sheetEntry, sheet } = assets.getOrCreateUnitSpriteSheet(
      unitDef,
      unit.activeFormId,
      formDef
    );
    const animRes = assets.spriteController.syncAndStepUnit(
      unit,
      world,
      registry,
      assets.manifestRegistry,
      FIXED_DT
    );

    if (unit.baraSplitTimer > 0 && sheet) {
      const fw = sheetEntry.frameWidth;
      const fh = sheetEntry.frameHeight;
      const halfH = Math.floor(fh * 0.5);
      const sx = animRes.step.frameIndex * fw;
      const sy = animRes.step.row * fh;
      const size = Math.round(42 * unit.entityScale * unit.visualScale);
      const splitGap = Math.round(Math.sin((unit.baraSplitTimer / 0.48) * Math.PI) * 14);
      ctx.save();
      ctx.translate(Math.round(pos.x), Math.round(pos.y));
      if (animRes.visual.facingX < 0) ctx.scale(-1, 1);
      ctx.drawImage(sheet, sx, sy, fw, halfH, -size * 0.5, -size * 0.5 - splitGap, size, size * 0.5);
      ctx.drawImage(sheet, sx, sy + halfH, fw, fh - halfH, -size * 0.5, splitGap * 0.5, size, size * 0.5);
      ctx.restore();
    } else if (sheet) {
      const targetPixelHeight = 42 * unit.entityScale * unit.visualScale;
      const drawScale = Math.max(0.75, targetPixelHeight / sheetEntry.frameHeight);
      SCRATCH_FOOT_POS.x = pos.x;
      SCRATCH_FOOT_POS.y = Math.round(pos.y + unit.radiusPx * 0.65);

      assets.spriteController.drawAnimatedUnitFrame(
        ctx,
        sheet,
        sheetEntry,
        animRes.step.row,
        animRes.step.frameIndex,
        SCRATCH_FOOT_POS,
        animRes.visual.facingX,
        drawScale,
        {
          hitFlashActive: animRes.step.hitFlashActive,
          flashEffectEnabled: settings.flashEffectEnabled,
          hasArmamentActive: animRes.hasArmamentActive,
          logiaDispersionTimer: unit.logiaDispersionTimer,
          elementColor: elemColor,
          afterimages: animRes.visual.afterimages,
          tick: world.tick
        }
      );
    }
  }

  ctx.globalAlpha = 1.0;

  // Overhead mini HP bar
  const hpRatio = clamp(unit.hp / Math.max(1, unit.maxHp), 0, 1);
  const barW = 42;
  const barX = Math.round(pos.x - barW * 0.5);
  const barY = Math.round(pos.y - unit.radiusPx * unit.visualScale - 16);
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(barX - 1, barY - 1, barW + 2, 6);
  ctx.fillStyle = unit.team === 'ALPHA' ? '#22c55e' : '#ef4444';
  ctx.fillRect(barX, barY, Math.round(barW * hpRatio), 4);

  // Overhead real-time status & exhaustion timer badges
  let badgeY = barY - 6;
  ctx.font = 'bold 9px monospace';
  ctx.textAlign = 'center';
  for (let i = 0; i < unit.statuses.length; i++) {
    const st = unit.statuses[i];
    if (!st) continue;
    ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
    ctx.fillRect(pos.x - 32, badgeY - 10, 64, 11);
    ctx.fillStyle = st.kind === 'STAGGER' ? '#facc15' : '#c084fc';
    ctx.fillText(`${st.kind} ${st.remainingSec.toFixed(1)}s`, pos.x, badgeY - 1);
    badgeY -= 12;
  }
  if (unit.exhaustionTimer > 0) {
    ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
    ctx.fillRect(pos.x - 38, badgeY - 10, 76, 11);
    ctx.fillStyle = '#f87171';
    ctx.fillText(`EXHAUST ${unit.exhaustionTimer.toFixed(1)}s`, pos.x, badgeY - 1);
    badgeY -= 12;
  }
  if (unit.staggerImmunityTimer > 0) {
    ctx.fillStyle = 'rgba(15, 23, 42, 0.82)';
    ctx.fillRect(pos.x - 34, badgeY - 10, 68, 11);
    ctx.fillStyle = '#94a3b8';
    ctx.fillText(`IMMUNE ${unit.staggerImmunityTimer.toFixed(1)}s`, pos.x, badgeY - 1);
  }

  ctx.restore();
}
