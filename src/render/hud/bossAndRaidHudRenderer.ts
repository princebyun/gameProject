import { clamp } from '../../core/math/vector2';
import type { BattleWorldState, UnitRuntimeState } from '../../core/types/battleState';
import type { GameDataRegistry } from '../../core/types/dataSchemas';

export function renderTopBossHpBar(
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
  ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = boss.bossPhase2Triggered ? '#ef4444' : '#f59e0b';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(x, y, w, h);

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

  const barX = x + 8;
  const barY = y + 16;
  const barW = w - 16;
  const barH = 12;
  const hpRatio = clamp(boss.hp / Math.max(1, boss.maxHp), 0, 1);

  ctx.fillStyle = '#1e293b';
  ctx.fillRect(barX, barY, barW, barH);
  ctx.fillStyle = boss.bossPhase2Triggered ? '#dc2626' : '#f97316';
  ctx.fillRect(barX, barY, Math.round(barW * hpRatio), barH);

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

export function renderRaidSquadHud(
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

  const revY = 10 + safeT + Math.min(3, squad.length) * (cardH + 4) + 2;
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

export function renderBossIntroBanner(
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

export function renderWaveGauntletBanner(
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
