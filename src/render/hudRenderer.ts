import { clamp } from '../core/math/vector2';
import type { BattleWorldState, UnitRuntimeState } from '../core/types/battleState';
import type { GameDataRegistry } from '../core/types/dataSchemas';
import type { KeyBindingConfig } from '../input/keyBindings';
import {
  renderBossIntroBanner,
  renderRaidSquadHud,
  renderTopBossHpBar,
  renderWaveGauntletBanner
} from './hud/bossAndRaidHudRenderer';
import {
  renderActiveClashHud,
  renderBottomSkillHud
} from './hud/clashAndSkillHudRenderer';
import {
  DEFAULT_VIEWPORT_METRICS,
  type ViewportMetrics
} from './viewport/responsiveViewportManager';
import { getSafeHudBounds } from './viewport/safeAreaLayout';

const SCRATCH_ALPHA_FIELD: UnitRuntimeState[] = [];
const SCRATCH_OMEGA_FIELD: UnitRuntimeState[] = [];
const SCRATCH_BADGES: string[] = [];

export function renderBattleHud(
  ctx: CanvasRenderingContext2D,
  world: BattleWorldState,
  registry: GameDataRegistry,
  bindings: KeyBindingConfig,
  fps: number,
  isTouchMode: boolean,
  viewport: ViewportMetrics = DEFAULT_VIEWPORT_METRICS
): void {
  const safe = getSafeHudBounds(viewport);
  const viewW = safe.viewWidth;
  const viewH = safe.viewHeight;

  ctx.save();

  SCRATCH_ALPHA_FIELD.length = 0;
  SCRATCH_OMEGA_FIELD.length = 0;
  let primaryUnit: UnitRuntimeState | undefined;
  let firstAliveAlpha: UnitRuntimeState | undefined;
  let firstAnyAlpha: UnitRuntimeState | undefined;

  for (let i = 0; i < world.units.length; i++) {
    const u = world.units[i];
    if (!u) continue;
    if (u.team === 'ALPHA') {
      if (!firstAnyAlpha) firstAnyAlpha = u;
      if (u.isOnField) {
        SCRATCH_ALPHA_FIELD.push(u);
        if (!primaryUnit && u.isPlayerControlled && u.isAlive && !u.isDowned) {
          primaryUnit = u;
        } else if (!firstAliveAlpha && u.isAlive && !u.isDowned) {
          firstAliveAlpha = u;
        }
      }
    } else if (u.team === 'OMEGA' && u.isOnField) {
      SCRATCH_OMEGA_FIELD.push(u);
    }
  }

  // 1. Top-Left: Team ALPHA HUD Cards (respecting Safe Area)
  if (world.raidState.active) {
    renderRaidSquadHud(ctx, SCRATCH_ALPHA_FIELD, world, safe.insets.left, safe.insets.top);
  } else {
    for (let idx = 0; idx < SCRATCH_ALPHA_FIELD.length; idx++) {
      const unit = SCRATCH_ALPHA_FIELD[idx];
      if (!unit) continue;
      renderUnitHudCard(ctx, unit, Math.round(12 + safe.insets.left), Math.round(10 + safe.insets.top + idx * 66), false, world, registry);
    }
  }

  // 2. Top-Right: Team OMEGA HUD Cards (respecting Safe Area)
  for (let idx = 0; idx < SCRATCH_OMEGA_FIELD.length; idx++) {
    const unit = SCRATCH_OMEGA_FIELD[idx];
    if (!unit) continue;
    renderUnitHudCard(ctx, unit, Math.round(safe.right - 252), Math.round(10 + safe.insets.top + idx * 66), true, world, registry);
  }

  // 3. Top-Center: Global Weather, Environment Awakening Field, Rule Reversal, Timer
  renderTopCenterGlobalHud(ctx, world, fps, viewW, safe.insets.top);

  // 3.5 Dedicated Top Boss HP Bar
  renderTopBossHpBar(ctx, world, registry, viewW, safe.insets.top);

  // 4. Active Clash Gauge Overlay
  renderActiveClashHud(ctx, world, viewW, safe.insets.top);

  // 4.5 Boss Intro & Wave Gauntlet Banners
  if (world.bossIntroTimer > 0 && world.bossIntroName) {
    renderBossIntroBanner(ctx, world, viewW, safe.insets.top);
  }
  renderWaveGauntletBanner(ctx, world, viewW, safe.insets.top);

  // 5. Bottom Action & Skill Bar for Primary Controlled Alpha Unit
  const resolvedPrimary =
    primaryUnit ?? firstAliveAlpha ?? SCRATCH_ALPHA_FIELD[0] ?? firstAnyAlpha;
  if (resolvedPrimary) {
    renderBottomSkillHud(ctx, resolvedPrimary, world, registry, bindings, isTouchMode, safe);
  }

  SCRATCH_ALPHA_FIELD.length = 0;
  SCRATCH_OMEGA_FIELD.length = 0;

  // 6. Winner Banner
  if (world.winnerTeam !== null) {
    ctx.fillStyle = 'rgba(9, 13, 22, 0.78)';
    ctx.fillRect(safe.centerX - 180, viewH * 0.5 - 42, 360, 84);
    ctx.strokeStyle = '#facc15';
    ctx.lineWidth = 2;
    ctx.strokeRect(safe.centerX - 180, viewH * 0.5 - 42, 360, 84);

    ctx.font = 'bold 22px monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fde047';
    const title =
      world.winnerTeam === 'DRAW'
        ? 'BATTLE DRAW!'
        : `${world.winnerTeam} TEAM VICTORY!`;
    ctx.fillText(title, safe.centerX, viewH * 0.5 - 4);
    ctx.font = '11px monospace';
    ctx.fillStyle = '#cbd5e1';
    ctx.fillText(
      world.winReasonText ?? '상단 [전투 재시작] 버튼으로 새 매치를 시작하세요',
      safe.centerX,
      viewH * 0.5 + 22
    );
  }

  // 7. Tactical Hint Banner
  if (world.tacticalHintText && world.tacticalHintTimer > 0) {
    ctx.fillStyle = 'rgba(127, 29, 29, 0.92)';
    ctx.fillRect(safe.centerX - 230, safe.bottom - 96, 460, 26);
    ctx.strokeStyle = '#facc15';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(safe.centerX - 230, safe.bottom - 96, 460, 26);
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fde047';
    ctx.fillText(world.tacticalHintText, safe.centerX, safe.bottom - 79);
  }

  ctx.restore();
}

function renderUnitHudCard(
  ctx: CanvasRenderingContext2D,
  unit: UnitRuntimeState,
  x: number,
  y: number,
  rightAligned: boolean,
  world: BattleWorldState,
  registry: GameDataRegistry
): void {
  const w = 240;
  const h = 62;
  ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = unit.team === 'ALPHA' ? '#38bdf8' : '#f43f5e';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(x, y, w, h);

  const elemMeta =
    registry.elementsById?.get(unit.element) ??
    registry.elements.elements.find((e) => e.id === unit.element);
  ctx.font = 'bold 10px monospace';
  ctx.textAlign = 'left';
  ctx.fillStyle = '#f8fafc';
  const stanceTag =
    unit.currentStanceRole !== 'BASE' ? ` (${unit.currentStanceRole})` : '';
  ctx.fillText(`${unit.name}${stanceTag}`, x + 7, y + 13);

  ctx.fillStyle = elemMeta?.color ?? '#38bdf8';
  ctx.textAlign = 'right';
  const hakiText = `무${unit.haki.armament}/견${unit.haki.observation}/패${unit.haki.conqueror}`;
  ctx.fillText(hakiText, x + w - 7, y + 13);

  const hpRatio = clamp(unit.hp / Math.max(1, unit.maxHp), 0, 1);
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(x + 8, y + 18, w - 16, 11);
  ctx.fillStyle =
    hpRatio > 0.5 ? '#22c55e' : hpRatio > 0.25 ? '#f59e0b' : '#ef4444';
  ctx.fillRect(x + 8, y + 18, Math.round((w - 16) * hpRatio), 11);

  ctx.font = 'bold 9px monospace';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(`${unit.hp} / ${unit.maxHp}`, x + w * 0.5, y + 27);

  ctx.textAlign = 'left';
  ctx.font = '9px monospace';
  ctx.fillStyle = '#2dd4bf';
  ctx.fillText(`회피 ${unit.dodgeStacks}/${unit.maxDodgeStacks}`, x + 8, y + 41);

  if (unit.exhaustionTimer > 0) {
    ctx.fillStyle = '#f87171';
    ctx.fillText(`탈진 ${unit.exhaustionTimer.toFixed(1)}초`, x + 72, y + 41);
  } else if (unit.activeFormKind === 'OVERDRIVE') {
    ctx.fillStyle = '#e879f9';
    ctx.fillText(
      `★각성 ${unit.overdriveTimeRemainingSec.toFixed(1)}초`,
      x + 72,
      y + 41
    );
  } else if (unit.activeFormId) {
    ctx.fillStyle = '#fb923c';
    ctx.fillText(`★변신 중`, x + 72, y + 41);
  }

  let sx = rightAligned ? x + w - 8 : x + 8;
  ctx.font = 'bold 9px monospace';
  for (const st of unit.statuses) {
    const label = `${st.kind}:${st.remainingSec.toFixed(1)}s`;
    ctx.fillStyle = st.kind === 'STAGGER' ? '#facc15' : '#c084fc';
    ctx.textAlign = rightAligned ? 'right' : 'left';
    ctx.fillText(label, sx, y + 55);
    sx += rightAligned ? -78 : 78;
  }
  if (unit.staggerImmunityTimer > 0 && unit.statuses.length === 0) {
    ctx.fillStyle = '#94a3b8';
    ctx.textAlign = rightAligned ? 'right' : 'left';
    ctx.fillText(`면역:${unit.staggerImmunityTimer.toFixed(1)}s`, sx, y + 55);
  }

  if (unit.fruitNullifyTimer > 0 && unit.fruitType !== 'NONE') {
    ctx.fillStyle = '#a855f7';
    ctx.font = 'bold 9px monospace';
    ctx.textAlign = rightAligned ? 'right' : 'left';
    ctx.fillText(
      `🌑능력봉인:${unit.fruitNullifyTimer.toFixed(1)}s`,
      rightAligned ? x + w - 8 : x + 8,
      y + 66
    );
  }

  const roster = world.rosters[unit.team];
  let dotX = x + w - 12;
  for (let i = world.units.length - 1; i >= 0; i--) {
    const tu = world.units[i];
    if (!tu || tu.team !== unit.team) continue;
    ctx.fillStyle = !tu.isAlive
      ? '#475569'
      : tu.isOnField
        ? '#38bdf8'
        : '#22c55e';
    ctx.beginPath();
    ctx.arc(dotX, y + 40, 3.5, 0, Math.PI * 2);
    ctx.fill();
    dotX -= 10;
  }

  if (roster.pivotWindowTimer > 0) {
    ctx.fillStyle = '#38bdf8';
    ctx.textAlign = 'right';
    ctx.fillText(`교체찬스 ${roster.pivotWindowTimer.toFixed(1)}s!`, x + w - 8, y + 55);
  } else if (roster.voluntarySwapCooldownTimer > 0) {
    ctx.fillStyle = '#94a3b8';
    ctx.textAlign = 'right';
    ctx.fillText(`교체CD ${roster.voluntarySwapCooldownTimer.toFixed(0)}s`, x + w - 8, y + 55);
  }
}

function renderTopCenterGlobalHud(
  ctx: CanvasRenderingContext2D,
  world: BattleWorldState,
  _fps: number,
  viewW: number,
  safeT: number
): void {
  const cx = viewW * 0.5;
  ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
  ctx.fillRect(cx - 115, 8 + safeT, 230, 44);
  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 1;
  ctx.strokeRect(cx - 115, 8 + safeT, 230, 44);

  ctx.font = 'bold 12px monospace';
  ctx.textAlign = 'center';
  ctx.fillStyle =
    world.winCondition.kind === 'SURVIVE_TIME' ? '#fde047' : '#f8fafc';
  if (world.winCondition.kind === 'SURVIVE_TIME') {
    const rem = Math.max(0, world.winCondition.targetSec - world.elapsedSec);
    ctx.fillText(`⏱ 생존 목표: ${rem.toFixed(1)}초`, cx, 23 + safeT);
  } else if (world.winCondition.kind === 'REACH_EXTRACTION') {
    const rem = Math.max(0, world.winCondition.unlockAfterSec - world.elapsedSec);
    ctx.fillText(
      rem > 0 ? `⚓ 탈출구 개방: ${rem.toFixed(1)}초` : `⚓ 탈출 구역으로 이동!`,
      cx,
      23 + safeT
    );
  } else {
    ctx.fillText(`⚔ 전투 시간 ${world.elapsedSec.toFixed(0)}초`, cx, 23 + safeT);
  }

  ctx.font = 'bold 9px monospace';
  SCRATCH_BADGES.length = 0;
  if (world.environmentField.kind !== 'NONE' && world.environmentField.remainingSec > 0) {
    SCRATCH_BADGES.push(
      `⚡ 각성 필드 (${world.environmentField.remainingSec.toFixed(0)}초)`
    );
  }
  if (world.weather.id !== 'NONE' && world.weather.remainingSec > 0) {
    SCRATCH_BADGES.push(`날씨 효과 (${world.weather.remainingSec.toFixed(0)}초)`);
  }
  if (world.ruleReversal.kind !== 'NONE' && world.ruleReversal.remainingSec > 0) {
    SCRATCH_BADGES.push(`속도 반전 (${world.ruleReversal.remainingSec.toFixed(0)}초)`);
  }

  if (world.persistentZones.splitActive) {
    SCRATCH_BADGES.push('🔥❄ 마그마/빙결 지대');
  } else if (world.persistentZones.magmaActive) {
    SCRATCH_BADGES.push('🔥 대분화 지대');
  } else if (world.persistentZones.iceActive) {
    SCRATCH_BADGES.push('❄ 빙결 지대');
  }
  if (world.gauntletWaves.length > 1) {
    SCRATCH_BADGES.push(`웨이브 ${world.currentWaveIndex + 1}/${world.gauntletWaves.length}`);
  }
  if (world.birdcage.active) {
    const shrinkPct = Math.round((1 - world.birdcage.shrinkScale) * 100);
    SCRATCH_BADGES.push(`🕸 새장 축소 ${shrinkPct}%`);
  }

  if (SCRATCH_BADGES.length === 0) {
    ctx.fillStyle = '#94a3b8';
    ctx.fillText(world.mode === '2V2' ? '2:2 팀 배틀' : world.mode === 'COOP_RAID' ? '거대 보스 레이드' : '1:1 결투', cx, 42 + safeT);
  } else {
    ctx.fillStyle = '#facc15';
    ctx.fillText(SCRATCH_BADGES.join(' | '), cx, 42 + safeT);
  }
  SCRATCH_BADGES.length = 0;
}
