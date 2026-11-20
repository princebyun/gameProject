import type { AssetLoader } from '../assets/assetLoader';
import { isTeamBondComboAvailable } from '../core/battle/tagCombo';
import { FIXED_DT } from '../core/constants';
import { clamp } from '../core/math/vector2';
import type { GameDataRegistry } from '../core/types/dataSchemas';
import type { BattleWorldState, UnitRuntimeState } from '../core/types/battleState';
import type { KeyBindingConfig } from '../input/keyBindings';
import {
  computeCooldownWipeRatio,
  drawPixelNineSlicePanel,
  drawPulsingHakiGauge,
  drawRadialCooldownWipe,
  drawSlantedPixelHpBar,
  sharedHpDelayTracker
} from './ui/pixelNineSliceUi';
import {
  DEFAULT_VIEWPORT_METRICS,
  type ViewportMetrics
} from './viewport/responsiveViewportManager';

export function renderBattleHud(
  ctx: CanvasRenderingContext2D,
  world: BattleWorldState,
  registry: GameDataRegistry,
  bindings: KeyBindingConfig,
  fps: number,
  isTouchMode: boolean,
  viewport: ViewportMetrics = DEFAULT_VIEWPORT_METRICS,
  assets?: AssetLoader
): void {
  const viewW = viewport.viewWidth;
  const viewH = viewport.viewHeight;
  const { left: safeL, right: safeR, top: safeT, bottom: safeB } = viewport.safeInsets;

  ctx.save();

  // 1. Top-Left: Team ALPHA HUD Cards (respecting Safe Area)
  const alphaOnField = world.units.filter((u) => u.team === 'ALPHA' && u.isOnField);
  if (world.raidState.active) {
    renderRaidSquadHud(ctx, alphaOnField, world, safeL, safeT);
  } else {
    alphaOnField.forEach((unit, idx) => {
      renderUnitHudCard(
        ctx,
        unit,
        10 + safeL,
        10 + safeT + idx * 70,
        false,
        world,
        registry,
        assets
      );
    });
  }

  // 2. Top-Right: Team OMEGA HUD Cards (respecting Safe Area)
  const omegaOnField = world.units.filter((u) => u.team === 'OMEGA' && u.isOnField);
  omegaOnField.forEach((unit, idx) => {
    renderUnitHudCard(
      ctx,
      unit,
      viewW - 268 - safeR,
      10 + safeT + idx * 70,
      true,
      world,
      registry,
      assets
    );
  });

  // 3. Top-Center: Global Weather, Environment Awakening Field, Rule Reversal, Timer & FPS
  renderTopCenterGlobalHud(ctx, world, fps, viewW, safeT);

  // 3.5 Phase 6: Dedicated Top Boss HP Bar (with 50% Phase 2 Notch, Lunarian Flame & Super Regen Lockout Timers)
  renderTopBossHpBar(ctx, world, registry, viewW, safeT);

  // 4. Active Clash Gauge Overlay (Beam vs Beam, Melee vs Beam Guard, Melee vs Melee + Conqueror Sky Split)
  renderActiveClashHud(ctx, world, viewW, safeT);

  // 4.5 Phase 6: 1.5s Boss Intro Banner (Name, Title/Epithet, Bounty/Rank)
  if (world.bossIntroTimer > 0 && world.bossIntroName) {
    renderBossIntroBanner(ctx, world, viewW, safeT);
  }
  renderWaveGauntletBanner(ctx, world, viewW, safeT);

  // 5. Bottom Action & Skill Bar for Primary Controlled Alpha Unit
  const primaryUnit =
    alphaOnField.find((u) => u.isPlayerControlled && u.isAlive && !u.isDowned) ??
    alphaOnField.find((u) => u.isAlive && !u.isDowned) ??
    alphaOnField[0] ??
    world.units.find((u) => u.team === 'ALPHA');
  if (primaryUnit) {
    renderBottomSkillHud(ctx, primaryUnit, world, registry, bindings, isTouchMode, viewW, viewH, safeB);
  }

  // 6. Winner Banner
  if (world.winnerTeam !== null) {
    drawPixelNineSlicePanel(
      ctx,
      viewW * 0.5 - 186,
      viewH * 0.5 - 46,
      372,
      92,
      'gold_ribbon'
    );

    ctx.font = 'bold 22px monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fde047';
    const title =
      world.winnerTeam === 'DRAW'
        ? 'BATTLE DRAW!'
        : `${world.winnerTeam} TEAM VICTORY!`;
    ctx.fillText(title, viewW * 0.5, viewH * 0.5 - 4);
    ctx.font = '11px monospace';
    ctx.fillStyle = '#cbd5e1';
    ctx.fillText(
      world.winReasonText ?? '상단 [전투 재시작] 버튼으로 새 매치를 시작하세요',
      viewW * 0.5,
      viewH * 0.5 + 22
    );
  }

  // 7. Stage 2-A Tactical Hint Banner (e.g. Buggy Slash Immunity Swap Hint)
  if (world.tacticalHintText && world.tacticalHintTimer > 0) {
    ctx.fillStyle = 'rgba(127, 29, 29, 0.92)';
    ctx.fillRect(viewW * 0.5 - 230, viewH - 96 - safeB, 460, 26);
    ctx.strokeStyle = '#facc15';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(viewW * 0.5 - 230, viewH - 96 - safeB, 460, 26);
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fde047';
    ctx.fillText(world.tacticalHintText, viewW * 0.5, viewH - 79 - safeB);
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
  registry: GameDataRegistry,
  assets?: AssetLoader
): void {
  const w = 258;
  const h = 66;
  drawPixelNineSlicePanel(
    ctx,
    x,
    y,
    w,
    h,
    unit.team === 'ALPHA' ? 'navy_hud' : 'crimson_boss'
  );

  // Mini 64x64 Pixel Portrait Frame (46x46)
  const portSize = 46;
  const portX = rightAligned ? x + w - portSize - 7 : x + 7;
  const portY = y + 10;
  ctx.fillStyle = '#090d16';
  ctx.fillRect(portX, portY, portSize, portSize);
  ctx.strokeStyle = unit.activeFormId
    ? '#facc15'
    : unit.team === 'ALPHA'
      ? '#38bdf8'
      : '#f43f5e';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(portX, portY, portSize, portSize);

  const unitDef = registry.units[unit.speciesId];
  if (unitDef && assets) {
    const emo =
      unit.hp / Math.max(1, unit.maxHp) < 0.3
        ? 'angry'
        : unit.activeFormId
          ? 'excited'
          : 'determined';
    const pRes = assets.getOrCreateUnitPortrait(unitDef, emo, unit.activeFormId);
    if (pRes.image) {
      ctx.save();
      ctx.imageSmoothingEnabled = false;
      if (rightAligned) {
        ctx.translate(portX + portSize, portY);
        ctx.scale(-1, 1);
        ctx.drawImage(pRes.image, 1, 1, portSize - 2, portSize - 2);
      } else {
        ctx.drawImage(pRes.image, portX + 1, portY + 1, portSize - 2, portSize - 2);
      }
      ctx.restore();
    }
  }

  const contentX = rightAligned ? x + 8 : portX + portSize + 7;
  const contentW = w - portSize - 22;

  // Unit Name, Stance & Haki Badge
  const elemMeta = registry.elements.elements.find((e) => e.id === unit.element);
  ctx.font = 'bold 10px monospace';
  ctx.textAlign = 'left';
  ctx.fillStyle = '#f8fafc';
  const stanceTag =
    unit.currentStanceRole !== 'BASE' ? ` (${unit.currentStanceRole})` : '';
  const nameRaw = `${unit.name}${stanceTag}`;
  ctx.fillText(nameRaw.length > 13 ? `${nameRaw.slice(0, 12)}…` : nameRaw, contentX, y + 15);

  ctx.fillStyle = elemMeta?.color ?? '#38bdf8';
  ctx.textAlign = 'right';
  const hakiText = `무${unit.haki.armament}/견${unit.haki.observation}/패${unit.haki.conqueror}`;
  ctx.fillText(hakiText, contentX + contentW, y + 15);

  // Slanted Pixel HP Bar with Trailing White Damage Delay Bar
  const hpRatio = clamp(unit.hp / Math.max(1, unit.maxHp), 0, 1);
  const delayedHp = sharedHpDelayTracker.sample(unit.instanceId, hpRatio, FIXED_DT);
  const hpColor = hpRatio > 0.5 ? '#22c55e' : hpRatio > 0.25 ? '#f59e0b' : '#ef4444';
  drawSlantedPixelHpBar(ctx, contentX, y + 19, contentW, 11, hpRatio, delayedHp, hpColor, 4);

  ctx.font = 'bold 9px monospace';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(`${unit.hp} / ${unit.maxHp}`, contentX + contentW * 0.5, y + 28);

  // Pulsing Gold Haki / Awakening Gauge Strip
  const canShift = !unit.hasUsedFormShift && unit.isAlive && unit.exhaustionTimer <= 0;
  const hakiGaugeRatio = unit.activeFormId
    ? unit.activeFormKind === 'OVERDRIVE'
      ? clamp(unit.overdriveTimeRemainingSec / 12, 0, 1)
      : 1
    : canShift
      ? 1
      : 0.25;
  drawPulsingHakiGauge(
    ctx,
    contentX,
    y + 33,
    contentW,
    5,
    hakiGaugeRatio,
    world.tick,
    Boolean(unit.activeFormId)
  );

  // Row 3: Dodge stacks, Hagoromo Cloud Sash / Awakening / Exhaustion status
  ctx.textAlign = 'left';
  ctx.font = '9px monospace';
  ctx.fillStyle = '#2dd4bf';
  ctx.fillText(`회피:${unit.dodgeStacks}/${unit.maxDodgeStacks}`, contentX, y + 48);

  if (unit.exhaustionTimer > 0) {
    ctx.fillStyle = '#f87171';
    ctx.fillText(`탈진:${unit.exhaustionTimer.toFixed(1)}s`, contentX + 54, y + 48);
  } else if (unit.activeFormKind === 'OVERDRIVE') {
    ctx.fillStyle = '#e879f9';
    const hag = unit.hagoromoColor ? `☁${unit.hagoromoColor.toUpperCase()}` : '★OD';
    ctx.fillText(
      `${hag} ${unit.overdriveTimeRemainingSec.toFixed(1)}s`,
      contentX + 54,
      y + 48
    );
  } else if (unit.activeFormId) {
    ctx.fillStyle = '#fb923c';
    const hag = unit.hagoromoColor ? `☁${unit.hagoromoColor}` : `★${unit.currentStanceRole}`;
    ctx.fillText(hag, contentX + 54, y + 48);
  } else {
    ctx.fillStyle = '#94a3b8';
    ctx.fillText(`[${unit.fruitType}]`, contentX + 54, y + 48);
  }

  // Row 4: Real-time Status Effect Timer pills
  let sx = rightAligned ? contentX + contentW : contentX;
  ctx.font = 'bold 9px monospace';
  for (const st of unit.statuses) {
    const label = `${st.kind}:${st.remainingSec.toFixed(1)}s`;
    ctx.fillStyle = st.kind === 'STAGGER' ? '#facc15' : '#c084fc';
    ctx.textAlign = rightAligned ? 'right' : 'left';
    ctx.fillText(label, sx, y + 59);
    sx += rightAligned ? -72 : 72;
  }
  if (unit.staggerImmunityTimer > 0 && unit.statuses.length === 0) {
    ctx.fillStyle = '#94a3b8';
    ctx.textAlign = rightAligned ? 'right' : 'left';
    ctx.fillText(`면역:${unit.staggerImmunityTimer.toFixed(1)}s`, sx, y + 59);
  }

  // Stage 2-B: Fruit Nullification countdown badge on unit HUD
  if (unit.fruitNullifyTimer > 0 && unit.fruitType !== 'NONE') {
    ctx.fillStyle = '#a855f7';
    ctx.font = 'bold 9px monospace';
    ctx.textAlign = rightAligned ? 'right' : 'left';
    ctx.fillText(
      `🌑능력봉인:${unit.fruitNullifyTimer.toFixed(1)}s`,
      rightAligned ? contentX + contentW : contentX,
      y + 72
    );
  }

  // Roster party dots & swap cooldown
  const teamUnits = world.units.filter((u) => u.team === unit.team);
  const roster = world.rosters[unit.team];
  let dotX = contentX + contentW - 4;
  for (let i = teamUnits.length - 1; i >= 0; i--) {
    const tu = teamUnits[i];
    ctx.fillStyle = !tu.isAlive
      ? '#475569'
      : tu.isOnField
        ? '#38bdf8'
        : '#22c55e';
    ctx.beginPath();
    ctx.arc(dotX, y + 46, 3, 0, Math.PI * 2);
    ctx.fill();
    dotX -= 9;
  }

  if (roster.pivotWindowTimer > 0) {
    ctx.fillStyle = '#38bdf8';
    ctx.textAlign = 'right';
    ctx.fillText(`교체찬스 ${roster.pivotWindowTimer.toFixed(1)}s!`, contentX + contentW, y + 59);
  } else if (roster.voluntarySwapCooldownTimer > 0) {
    ctx.fillStyle = '#94a3b8';
    ctx.textAlign = 'right';
    ctx.fillText(`교체CD ${roster.voluntarySwapCooldownTimer.toFixed(0)}s`, contentX + contentW, y + 59);
  }
}

function renderTopCenterGlobalHud(
  ctx: CanvasRenderingContext2D,
  world: BattleWorldState,
  fps: number,
  viewW: number,
  safeT: number
): void {
  const cx = viewW * 0.5;
  drawPixelNineSlicePanel(ctx, cx - 120, 8 + safeT, 240, 44, 'pirate_wood');

  ctx.font = 'bold 12px monospace';
  ctx.textAlign = 'center';
  ctx.fillStyle =
    world.winCondition.kind === 'SURVIVE_TIME' ? '#fde047' : '#f8fafc';
  if (world.winCondition.kind === 'SURVIVE_TIME') {
    const rem = Math.max(0, world.winCondition.targetSec - world.elapsedSec);
    ctx.fillText(`⏱ 생존 탈출: ${rem.toFixed(1)}s | ${fps} FPS`, cx, 23);
  } else if (world.winCondition.kind === 'REACH_EXTRACTION') {
    const rem = Math.max(0, world.winCondition.unlockAfterSec - world.elapsedSec);
    ctx.fillText(
      rem > 0 ? `⚓ 탈출구 개방: ${rem.toFixed(1)}s` : `⚓ 탈출 구역 이동!`,
      cx,
      23
    );
  } else {
    ctx.fillText(`TIME ${world.elapsedSec.toFixed(1)}s | ${fps} FPS`, cx, 23);
  }

  ctx.font = 'bold 9px monospace';
  const badges: string[] = [];
  if (world.environmentField.kind !== 'NONE' && world.environmentField.remainingSec > 0) {
    badges.push(
      `각성필드:${world.environmentField.kind} (${world.environmentField.remainingSec.toFixed(1)}s)`
    );
  }
  if (world.weather.id !== 'NONE' && world.weather.remainingSec > 0) {
    badges.push(`날씨:${world.weather.id} (${world.weather.remainingSec.toFixed(1)}s)`);
  }
  if (world.ruleReversal.kind !== 'NONE' && world.ruleReversal.remainingSec > 0) {
    badges.push(`반전:SPEED_INV (${world.ruleReversal.remainingSec.toFixed(1)}s)`);
  }

  if (world.persistentZones.splitActive) {
    badges.push('🔥❄ 마그마/빙결 반반 분할');
  } else if (world.persistentZones.magmaActive) {
    badges.push('🔥 대분화 지대(화상/+25%)');
  } else if (world.persistentZones.iceActive) {
    badges.push('❄ 아이스 에이지(둔화/+25%)');
  }
  if (world.gauntletWaves.length > 1) {
    badges.push(`WAVE ${world.currentWaveIndex + 1}/${world.gauntletWaves.length}`);
  }
  if (world.birdcage.active) {
    const shrinkPct = Math.round((1 - world.birdcage.shrinkScale) * 100);
    badges.push(`🕸 새장 축소 ${shrinkPct}%`);
  }

  if (badges.length === 0) {
    ctx.fillStyle = '#64748b';
    ctx.fillText(`ONE PIECE CLASH ENGINE | ${world.mode}`, cx, 42);
  } else {
    ctx.fillStyle = '#facc15';
    ctx.fillText(badges.join(' | '), cx, 42);
  }
}

function renderTopBossHpBar(
  ctx: CanvasRenderingContext2D,
  world: BattleWorldState,
  registry: GameDataRegistry,
  viewW: number,
  safeT: number
): void {
  const boss = world.units.find(
    (u) => u.team === 'OMEGA' && u.isOnField && u.isAlive && u.isBossUnit
  );
  if (!boss) return;

  const w = 436;
  const x = Math.round((viewW - w) * 0.5);
  const y = 55 + safeT;
  const h = 34;

  ctx.save();
  drawPixelNineSlicePanel(
    ctx,
    x,
    y,
    w,
    h,
    boss.bossPhase2Triggered ? 'crimson_boss' : 'pirate_wood'
  );

  // Boss Name & Mechanic Tag (Lunarian Flame / Super Regen Lockout)
  ctx.font = 'bold 10px monospace';
  ctx.textAlign = 'left';
  ctx.fillStyle = '#fde047';
  const phaseTag = boss.bossPhase2Triggered ? ' [2페이즈]' : '';
  ctx.fillText(`☠ BOSS: ${boss.name}${phaseTag}`, x + 8, y + 12);

  const trait = registry.traits[boss.traitId];
  let mechText = `Scale ${boss.entityScale.toFixed(1)}x`;
  let mechColor = '#cbd5e1';

  if (trait?.lunarianFlame?.enabled) {
    if (boss.lunarianFlameOn) {
      mechText = '🔥 불꽃 ON (피해-75%/경직면역)';
      mechColor = '#fb923c';
    } else {
      mechText = `💨 불꽃 OFF (속도+45%/재점화 ${boss.lunarianReigniteTimer.toFixed(1)}s)`;
      mechColor = '#38bdf8';
    }
  } else if (trait?.superRegeneration?.enabled) {
    if (boss.superRegenLockoutTimer > 0) {
      mechText = `⚡ 재생 억제: ${boss.superRegenLockoutTimer.toFixed(1)}s`;
      mechColor = '#ef4444';
    } else {
      mechText = '🩸 초재생 활성 (+3% HP/s)';
      mechColor = '#4ade80';
    }
  } else if (trait?.futureSightCounter?.enabled) {
    if (boss.foresightBreakTimer > 0) {
      mechText = `💥 집중 붕괴: ${boss.foresightBreakTimer.toFixed(1)}s (피해+20%)`;
      mechColor = '#facc15';
    } else {
      mechText = `👁 미래 예지 집중도: ${Math.round(boss.foresightFocus)}/100`;
      mechColor = '#e879f9';
    }
  } else if (trait?.shrinkingArena?.enabled && world.birdcage.active) {
    const shrinkPct = Math.round((1 - world.birdcage.shrinkScale) * 100);
    mechText = `🕸 새장 축소율: ${shrinkPct}%`;
    mechColor = '#f43f5e';
  } else if (trait?.energySteroidOverdrive?.enabled && boss.steroidOverdriveActive) {
    mechText = '💊 E.S 백발 폭주 (+35% 공/속 · 피격+15%)';
    mechColor = '#ef4444';
  }

  ctx.textAlign = 'right';
  ctx.fillStyle = mechColor;
  ctx.fillText(mechText, x + w - 8, y + 12);

  // Large Slanted Boss HP Bar with Trailing White Delay Bar & 50% Phase 2 Divider Notch
  const barX = x + 10;
  const barY = y + 16;
  const barW = w - 20;
  const barH = 12;
  const hpRatio = clamp(boss.hp / Math.max(1, boss.maxHp), 0, 1);
  const delayedBossHp = sharedHpDelayTracker.sample(
    `boss_${boss.instanceId}`,
    hpRatio,
    FIXED_DT
  );

  drawSlantedPixelHpBar(
    ctx,
    barX,
    barY,
    barW,
    barH,
    hpRatio,
    delayedBossHp,
    boss.bossPhase2Triggered ? '#dc2626' : '#f97316',
    6
  );

  // 50% Phase 2 Divider Notch
  const midX = Math.round(barX + barW * 0.5);
  ctx.fillStyle = '#fde047';
  ctx.fillRect(midX - 1, barY - 1, 2, barH + 2);

  ctx.font = 'bold 9px monospace';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(
    `${boss.hp} / ${boss.maxHp} (50% 2페이즈 경계)`,
    barX + barW * 0.5,
    barY + 9
  );

  // Stage 3 Step 2: Raid Break Gauge Bar & Team DPS Check Shield Bar underneath Boss HP
  if (world.raidState.active && world.raidState.bossUnitId === boss.instanceId) {
    const rs = world.raidState;
    const brY = y + h + 3;
    const brH = 18;
    ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
    ctx.fillRect(x, brY, w, brH);
    ctx.strokeStyle = rs.groggyTimer > 0 ? '#facc15' : '#38bdf8';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x, brY, w, brH);

    const brBarX = x + 8;
    const brBarY = brY + 3;
    const brBarW = w - 16;
    const brBarH = 12;
    const ratio =
      rs.groggyTimer > 0
        ? clamp(rs.groggyTimer / Math.max(0.1, rs.groggyDurationSec), 0, 1)
        : clamp(rs.breakGauge / Math.max(1, rs.breakGaugeMax), 0, 1);

    ctx.fillStyle = '#1e293b';
    ctx.fillRect(brBarX, brBarY, brBarW, brBarH);
    ctx.fillStyle = rs.groggyTimer > 0 ? '#facc15' : '#38bdf8';
    ctx.fillRect(brBarX, brBarY, Math.round(brBarW * ratio), brBarH);

    ctx.font = 'bold 9px monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = rs.groggyTimer > 0 ? '#0f172a' : '#ffffff';
    ctx.fillText(
      rs.groggyTimer > 0
        ? `💥 BREAK! 그로기 ${rs.groggyTimer.toFixed(1)}s (초재생 정지 · 피해 ×${rs.groggyDamageMult})`
        : `⚡ BREAK GAUGE: ${Math.round(rs.breakGauge)} / ${rs.breakGaugeMax}`,
      brBarX + brBarW * 0.5,
      brBarY + 9
    );

    if (rs.dpsCheck.active) {
      const dpsY = brY + brH + 3;
      const dpsH = 18;
      ctx.fillStyle = 'rgba(67, 20, 7, 0.94)';
      ctx.fillRect(x, dpsY, w, dpsH);
      ctx.strokeStyle = '#fb923c';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x, dpsY, w, dpsH);

      const sRatio = clamp(
        rs.dpsCheck.shieldHp / Math.max(1, rs.dpsCheck.maxShieldHp),
        0,
        1
      );
      ctx.fillStyle = '#1e293b';
      ctx.fillRect(brBarX, dpsY + 3, brBarW, 12);
      ctx.fillStyle = '#f97316';
      ctx.fillRect(brBarX, dpsY + 3, Math.round(brBarW * sRatio), 12);

      ctx.fillStyle = '#ffffff';
      ctx.fillText(
        `🛡 DPS CHECK 보호막: ${Math.round(rs.dpsCheck.shieldHp)} / ${rs.dpsCheck.maxShieldHp} (${rs.dpsCheck.remainingSec.toFixed(1)}s)`,
        brBarX + brBarW * 0.5,
        dpsY + 12
      );
    }
  }
  ctx.restore();
}

function renderRaidSquadHud(
  ctx: CanvasRenderingContext2D,
  squad: UnitRuntimeState[],
  world: BattleWorldState,
  safeL: number,
  safeT: number
): void {
  const x = 10 + safeL;
  const w = 236;
  const cardH = 42;
  squad.slice(0, 3).forEach((u, idx) => {
    const y = 10 + safeT + idx * (cardH + 4);
    ctx.fillStyle = u.isDowned
      ? 'rgba(127, 29, 29, 0.9)'
      : 'rgba(15, 23, 42, 0.88)';
    ctx.fillRect(x, y, w, cardH);
    ctx.strokeStyle = u.isDowned
      ? '#f43f5e'
      : u.isPlayerControlled
        ? '#facc15'
        : '#38bdf8';
    ctx.lineWidth = u.isPlayerControlled ? 2 : 1.2;
    ctx.strokeRect(x, y, w, cardH);

    ctx.font = 'bold 9px monospace';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#f8fafc';
    const roleTag = u.isPlayerControlled ? '★YOU' : 'AI/ALLY';
    ctx.fillText(`[${roleTag}] ${u.name}`, x + 6, y + 12);

    ctx.textAlign = 'right';
    ctx.fillStyle = u.isDowned ? '#fda4af' : '#94a3b8';
    ctx.fillText(
      u.isDowned ? `🆘 ${u.downedTimer.toFixed(1)}s` : `${u.hp}/${u.maxHp}`,
      x + w - 6,
      y + 12
    );

    const hpPct = clamp(u.hp / Math.max(1, u.maxHp), 0, 1);
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(x + 6, y + 17, w - 12, 9);
    ctx.fillStyle = u.isDowned
      ? '#f43f5e'
      : hpPct > 0.5
        ? '#22c55e'
        : hpPct > 0.25
          ? '#eab308'
          : '#ef4444';
    ctx.fillRect(x + 6, y + 17, Math.round((w - 12) * hpPct), 9);

    ctx.font = '8px monospace';
    ctx.textAlign = 'left';
    ctx.fillStyle = u.isDowned ? '#86efac' : '#7dd3fc';
    ctx.fillText(
      u.isDowned
        ? `구조 진행: ${Math.round((u.reviveProgressSec / 2.0) * 100)}% (반경 내 2초)`
        : `회피 ${u.dodgeStacks}/${u.maxDodgeStacks}${u.activeFormId ? ' · 각성' : ''}`,
      x + 6,
      y + 36
    );
  });

  // Shared Team Revives Badge cleanly below the 3 squad bars
  const revY = 10 + Math.min(3, squad.length) * (cardH + 4) + 2;
  ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
  ctx.fillRect(x, revY, w, 20);
  ctx.strokeStyle = world.raidState.teamRevivesRemaining > 0 ? '#4ade80' : '#ef4444';
  ctx.lineWidth = 1.2;
  ctx.strokeRect(x, revY, w, 20);
  ctx.font = 'bold 9px monospace';
  ctx.textAlign = 'center';
  ctx.fillStyle = world.raidState.teamRevivesRemaining > 0 ? '#86efac' : '#fca5a5';
  ctx.fillText(
    `❤️ 팀 공용 부활 잔여: ${world.raidState.teamRevivesRemaining} / ${world.raidState.teamRevivesMax}회`,
    x + w * 0.5,
    revY + 13
  );
}

function renderBossIntroBanner(
  ctx: CanvasRenderingContext2D,
  world: BattleWorldState,
  viewW: number,
  safeT: number
): void {
  const cx = viewW * 0.5;
  const y = 116 + safeT;
  const w = 440;
  const h = 64;

  ctx.save();
  ctx.fillStyle = 'rgba(9, 13, 22, 0.92)';
  ctx.fillRect(cx - w * 0.5, y, w, h);
  ctx.strokeStyle = '#ef4444';
  ctx.lineWidth = 2;
  ctx.strokeRect(cx - w * 0.5, y, w, h);

  ctx.font = 'bold 10px monospace';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#f87171';
  ctx.fillText('━━━ ☠ BOSS ENCOUNTER ☠ ━━━', cx, y + 15);

  ctx.font = 'bold 16px monospace';
  ctx.fillStyle = '#fde047';
  ctx.fillText(world.bossIntroName ?? 'BOSS', cx, y + 34);

  ctx.font = 'bold 11px monospace';
  ctx.fillStyle = '#e2e8f0';
  const sub = [world.bossIntroTitle, world.bossIntroBountyLabel]
    .filter(Boolean)
    .join(' | ');
  ctx.fillText(sub.slice(0, 52), cx, y + 52);
  ctx.restore();
}

function renderWaveGauntletBanner(
  ctx: CanvasRenderingContext2D,
  world: BattleWorldState,
  viewW: number,
  safeT: number
): void {
  if (world.waveBannerTimer <= 0 || !world.waveBannerText) return;
  const cx = viewW * 0.5;
  const y = 96 + safeT;
  ctx.save();
  ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
  ctx.fillRect(cx - 190, y, 380, 26);
  ctx.strokeStyle = '#38bdf8';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(cx - 190, y, 380, 26);
  ctx.font = 'bold 12px monospace';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#38bdf8';
  ctx.fillText(`⚔ ${world.waveBannerText}`, cx, y + 17);
  ctx.restore();
}

function renderActiveClashHud(
  ctx: CanvasRenderingContext2D,
  world: BattleWorldState,
  viewW: number,
  safeT: number
): void {
  const cx = viewW * 0.5;
  let y = 58 + safeT;

  if (world.beamClashes.length > 0) {
    const bc = world.beamClashes[0];
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

  if (world.meleeBeamGuards.length > 0) {
    const mg = world.meleeBeamGuards[0];
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

  if (world.meleeClashes.length > 0) {
    const mc = world.meleeClashes[0];
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

function renderBottomSkillHud(
  ctx: CanvasRenderingContext2D,
  unit: UnitRuntimeState,
  world: BattleWorldState,
  registry: GameDataRegistry,
  bindings: KeyBindingConfig,
  isTouchMode: boolean,
  viewW: number,
  viewH: number,
  safeB: number
): void {
  const slotWidth = isTouchMode ? 84 : 118;
  const slotHeight = 44;
  const gap = 6;
  const totalSlots = unit.moveSlots.length;
  const totalW = totalSlots * slotWidth + (totalSlots - 1) * gap;
  const startX = Math.round((viewW - totalW) * 0.5);
  const y = viewH - slotHeight - 8 - safeB;

  const keyLabels = [
    bindings.skill1.replace('Digit', '').replace('Key', ''),
    bindings.skill2.replace('Digit', '').replace('Key', ''),
    bindings.skill3.replace('Digit', '').replace('Key', ''),
    bindings.skill4.replace('Digit', '').replace('Key', '')
  ];

  unit.moveSlots.forEach((slot, idx) => {
    const mDef = registry.moves[slot.moveId];
    if (!mDef) return;
    const x = startX + idx * (slotWidth + gap);
    const ready = slot.charges > 0 && slot.cooldownTimer <= 0;
    const elemMeta = registry.elements.elements.find((e) => e.id === mDef.element);

    drawPixelNineSlicePanel(
      ctx,
      x,
      y,
      slotWidth,
      slotHeight,
      mDef.hasConquerorCoating ? 'crimson_boss' : ready ? 'navy_hud' : 'pirate_wood',
      mDef.hasConquerorCoating
        ? '#ef4444'
        : ready
          ? (elemMeta?.color ?? '#38bdf8')
          : '#475569'
    );

    if (slot.cooldownTimer > 0) {
      const cdRatio = computeCooldownWipeRatio(
        slot.cooldownTimer,
        Math.max(0.5, mDef.cooldownSec ?? 6)
      );
      drawRadialCooldownWipe(ctx, x + 3, y + 3, slotWidth - 6, slotHeight - 6, cdRatio);
    }

    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'left';
    ctx.fillStyle = ready ? '#f8fafc' : '#94a3b8';
    const shortName =
      mDef.name.length > (isTouchMode ? 7 : 10)
        ? mDef.name.slice(0, isTouchMode ? 7 : 10)
        : mDef.name;
    ctx.fillText(`[${keyLabels[idx]}] ${shortName}`, x + 5, y + 14);

    ctx.font = '9px monospace';
    const hakiTag = mDef.hasConquerorCoating
      ? '⚡패왕'
      : mDef.hasArmamentHaki
        ? '●무장'
        : mDef.archetype.slice(0, 4);
    ctx.fillStyle = mDef.hasConquerorCoating
      ? '#f87171'
      : (elemMeta?.color ?? '#38bdf8');
    ctx.fillText(hakiTag, x + 5, y + 27);

    ctx.textAlign = 'right';
    ctx.fillStyle = slot.charges > 0 ? '#4ade80' : '#f87171';
    ctx.fillText(`${slot.charges}/${slot.maxCharges}`, x + slotWidth - 5, y + 27);

    if (slot.cooldownTimer > 0) {
      ctx.fillStyle = '#facc15';
      ctx.fillText(`CD ${slot.cooldownTimer.toFixed(1)}s`, x + slotWidth - 5, y + 40);
    } else {
      ctx.fillStyle = '#94a3b8';
      ctx.fillText(`PWR ${mDef.basePower}`, x + slotWidth - 5, y + 40);
    }
  });

  if (!isTouchMode) {
    const dx = startX - 96;
    ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
    ctx.fillRect(dx, y, 90, slotHeight);
    ctx.strokeStyle = '#2dd4bf';
    ctx.strokeRect(dx, y, 90, slotHeight);
    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#2dd4bf';
    ctx.fillText(`[${bindings.dodge.replace('Key', '')}] 회피`, dx + 6, y + 15);
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
  // Phase 16: Compact Guard Stamina & 2:2 Bond Tag Combo Gauge Strip above Bottom Skill Bar
  const gaugeY = y - 18;
  const bondActive = isTeamBondComboAvailable(unit.team, world);
  const halfW = bondActive ? Math.floor((totalW - 8) * 0.5) : totalW;

  // Left: Armament Guard Stamina Bar
  const guardRatio = clamp(
    unit.guardStamina / Math.max(1, unit.guardMaxStamina),
    0,
    1
  );
  const guardBroken = unit.guardBreakTicks > 0;
  ctx.fillStyle = 'rgba(9, 13, 22, 0.88)';
  ctx.fillRect(startX, gaugeY, halfW, 14);
  ctx.strokeStyle = guardBroken
    ? '#ef4444'
    : unit.justGuardFlashTicks > 0
      ? '#fde047'
      : unit.guardHeld
        ? '#c084fc'
        : '#475569';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(startX, gaugeY, halfW, 14);

  ctx.fillStyle = guardBroken
    ? '#dc2626'
    : unit.justGuardFlashTicks > 0
      ? '#facc15'
      : '#a855f7';
  ctx.fillRect(startX + 2, gaugeY + 2, Math.round((halfW - 4) * guardRatio), 10);

  ctx.font = 'bold 9px monospace';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffffff';
  const guardKey = bindings.guard.replace('Key', '');
  ctx.fillText(
    guardBroken
      ? `💥 GUARD BREAK (${(unit.guardBreakTicks / 60).toFixed(1)}s)`
      : `🛡 가드 [${guardKey}/Shift] ${Math.round(unit.guardStamina)}%`,
    startX + halfW * 0.5,
    gaugeY + 10
  );

  // Right: Team 2:2 Bond Tag Combo Gauge Bar (visible when >= 2 alive allies)
  if (bondActive) {
    const bx = startX + halfW + 8;
    const bondRatio = clamp(roster.bondGauge / 100, 0, 1);
    const bondReady = roster.bondGauge >= 100;
    const pulse = bondReady ? Math.sin(world.tick * 0.25) * 0.5 + 0.5 : 0;
    ctx.fillStyle = 'rgba(9, 13, 22, 0.88)';
    ctx.fillRect(bx, gaugeY, halfW, 14);
    ctx.strokeStyle = bondReady ? '#fde047' : '#f59e0b';
    ctx.lineWidth = bondReady ? 2 : 1.5;
    ctx.strokeRect(bx, gaugeY, halfW, 14);

    ctx.fillStyle = bondReady
      ? pulse > 0.5
        ? '#fde047'
        : '#f59e0b'
      : '#d97706';
    ctx.fillRect(bx + 2, gaugeY + 2, Math.round((halfW - 4) * bondRatio), 10);

    ctx.font = 'bold 9px monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = bondReady ? '#090d16' : '#ffffff';
    const bondKey = bindings.bondCombo.replace('Key', '');
    ctx.fillText(
      bondReady
        ? `★ [${bondKey}] 동료 합동기 READY!`
        : `★ 합동기 [${bondKey}] ${Math.floor(roster.bondGauge)}%`,
      bx + halfW * 0.5,
      gaugeY + 10
    );
  }

  if (roster.pivotWindowTimer > 0) {
    ctx.fillStyle = 'rgba(14, 165, 233, 0.92)';
    ctx.fillRect(viewW * 0.5 - 135, gaugeY - 26, 270, 22);
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(
      `⚡ [${bindings.quickSwap.replace('Key', '')}] 즉시 파티 교체 가능 (${roster.pivotWindowTimer.toFixed(1)}s)`,
      viewW * 0.5,
      gaugeY - 11
    );
  }
}
