import {
  addVec,
  clamp,
  distVec,
  lerpVec,
  normalizeVec,
  scaleVec,
  subVec
} from '../../math/vector2';
import type { BattleWorldState } from '../../types/battleState';
import type { GameDataRegistry } from '../../types/dataSchemas';
import { computeDamage, computeEffectiveClashPower } from '../damageCalc';
import { applyStatus } from '../statusEngine';
import { triggerTraitHook } from '../traitHooks';
import { getMeleeArcById, getUnitById } from '../worldLookup';

/**
 * 6. Melee vs Melee (including Conqueror's Haki Lv3 Non-Contact Sky-Splitting Clash)
 */
export function resolveMeleeVsMelee(
  world: BattleWorldState,
  dt: number,
  registry: GameDataRegistry
): void {
  const { melee: meleeCfg } = registry.balance;

  for (let i = 0; i < world.meleeArcs.length; i++) {
    const a = world.meleeArcs[i];
    if (!a || a.finished || a.clashing) continue;

    for (let j = i + 1; j < world.meleeArcs.length; j++) {
      const b = world.meleeArcs[j];
      if (!b || b.finished || b.clashing || a.team === b.team) continue;

      const d = distVec(a.origin, b.origin);
      const nonContactBonus = a.hasConquerorCoating || b.hasConquerorCoating ? 26 : 0;

      if (d <= a.radiusPx + b.radiusPx + nonContactBonus) {
        const unitA = getUnitById(world, a.ownerUnitId);
        const unitB = getUnitById(world, b.ownerUnitId);
        if (!unitA || !unitB || !unitA.isAlive || !unitB.isAlive) continue;

        const clashId = `mclash_${world.tick}_${a.id}_${b.id}`;
        a.clashing = true;
        b.clashing = true;
        unitA.clashLockId = clashId;
        unitB.clashLockId = clashId;

        triggerTraitHook('onClash', unitA, { moveArchetype: 'MELEE' }, world, registry);
        triggerTraitHook('onClash', unitB, { moveArchetype: 'MELEE' }, world, registry);

        const isSkySplit = Boolean(a.hasConquerorCoating || b.hasConquerorCoating);
        const mid = lerpVec(unitA.pos, unitB.pos, 0.5);

        world.meleeClashes.push({
          id: clashId,
          meleeAId: a.id,
          unitAId: unitA.instanceId,
          meleeBId: b.id,
          unitBId: unitB.instanceId,
          clashPoint: mid,
          dominanceRatio: 0.5,
          elapsedSec: 0,
          maxDurationSec: meleeCfg.meleeClashMaxSec,
          isConquerorSkySplit: isSkySplit,
          resolved: false
        });

        if (isSkySplit) {
          world.vfxEvents.push({
            id: `vfx_skysplit_${world.tick}`,
            kind: 'SKY_SPLIT_SHOCKWAVE',
            pos: mid,
            color: '#dc2626',
            radiusPx: 92,
            elapsedSec: 0,
            durationSec: 0.65
          });
          world.floatingTexts.push({
            id: `ft_skysplit_${world.tick}`,
            pos: { x: mid.x, y: mid.y - 38 },
            text: '⚡ CONQUEROR SKY SPLIT! ⚡',
            color: '#ef4444',
            elapsedSec: 0,
            durationSec: 1.15,
            scale: 1.3
          });
          world.screenShakeTimer = 0.25;
          world.screenShakeMagnitude = 6.5;
          world.combatLog.push(
            `[패왕색 휘감기 충돌] ${unitA.name} vs ${unitB.name} 비접촉 하늘 가르기 충격파!`
          );
        } else {
          world.combatLog.push(`[근접 맞대결] ${unitA.name} vs ${unitB.name} 검격 충돌!`);
        }

        world.hitstopTimer = Math.max(
          world.hitstopTimer,
          registry.balance.presentation.clashHitstopSec
        );
        break;
      }
    }
  }

  for (let i = world.meleeClashes.length - 1; i >= 0; i--) {
    const session = world.meleeClashes[i];
    if (!session) continue;
    if (session.resolved) {
      world.meleeClashes.splice(i, 1);
      continue;
    }

    const arcA = getMeleeArcById(world, session.meleeAId);
    const arcB = getMeleeArcById(world, session.meleeBId);
    const unitA = getUnitById(world, session.unitAId);
    const unitB = getUnitById(world, session.unitBId);

    if (!arcA || !arcB || !unitA || !unitB || !unitA.isAlive || !unitB.isAlive) {
      if (unitA && unitA.clashLockId === session.id) unitA.clashLockId = null;
      if (unitB && unitB.clashLockId === session.id) unitB.clashLockId = null;
      if (arcA) arcA.clashing = false;
      if (arcB) arcB.clashing = false;
      session.resolved = true;
      world.meleeClashes.splice(i, 1);
      continue;
    }

    arcA.elapsedSec = Math.min(arcA.elapsedSec, arcA.totalLingerDurationSec * 0.5);
    arcB.elapsedSec = Math.min(arcB.elapsedSec, arcB.totalLingerDurationSec * 0.5);

    session.elapsedSec += dt;

    const powerA = computeEffectiveClashPower(
      arcA.currentPower, arcA.offensiveStat, arcA.element, arcB.element,
      arcA.traitClashMult, registry.elements, arcA.hasConquerorCoating, arcA.hasArmamentHaki
    );
    const powerB = computeEffectiveClashPower(
      arcB.currentPower, arcB.offensiveStat, arcB.element, arcA.element,
      arcB.traitClashMult, registry.elements, arcB.hasConquerorCoating, arcB.hasArmamentHaki
    );

    const diff = (powerA - powerB) / Math.max(1, powerA + powerB);
    const pushRate = session.isConquerorSkySplit
      ? meleeCfg.meleeClashPushRate * 1.35
      : meleeCfg.meleeClashPushRate;
    session.dominanceRatio = clamp(session.dominanceRatio + diff * pushRate * dt, 0, 1);

    const timedOut = session.elapsedSec >= session.maxDurationSec;
    if (session.dominanceRatio >= 1.0 || session.dominanceRatio <= 0.0 || timedOut) {
      session.resolved = true;
      unitA.clashLockId = null;
      unitB.clashLockId = null;
      arcA.finished = true;
      arcB.finished = true;

      if (Math.abs(session.dominanceRatio - 0.5) < 0.03) {
        const dirAB = normalizeVec(subVec(unitB.pos, unitA.pos));
        const pushSpeed = session.isConquerorSkySplit ? 240 : 160;
        unitA.knockbackVel = scaleVec(dirAB, -pushSpeed * Math.max(0, 1 - unitA.knockbackResist));
        unitB.knockbackVel = scaleVec(dirAB, pushSpeed * Math.max(0, 1 - unitB.knockbackResist));
        world.floatingTexts.push({
          id: `ft_mdraw_${world.tick}`,
          pos: { x: session.clashPoint.x, y: session.clashPoint.y - 24 },
          text: session.isConquerorSkySplit
            ? 'SKY SPLIT SHOCKWAVE DRAW!'
            : 'MELEE CLASH DRAW!',
          color: '#e2e8f0',
          elapsedSec: 0,
          durationSec: 0.85,
          scale: 1.1
        });
      } else {
        const aWins = session.dominanceRatio > 0.5;
        const winner = aWins ? unitA : unitB;
        const loser = aWins ? unitB : unitA;
        const winArc = aWins ? arcA : arcB;

        const moveDef = registry.moves[winArc.moveId];
        const { damage } = computeDamage(
          winArc.currentPower, winner, loser, moveDef?.category ?? 'PHYSICAL',
          winArc.element, world, registry,
          {
            hasArmamentHaki: winArc.hasArmamentHaki,
            isInternalDestruction: winArc.isInternalDestruction,
            hasConquerorCoating: winArc.hasConquerorCoating
          }
        );
        loser.hp = Math.max(0, loser.hp - damage);
        const loserTrait = registry.traits[loser.traitId];
        if (loserTrait?.futureSightCounter?.enabled) {
          loser.foresightFocus = 0;
          loser.foresightBreakTimer = loserTrait.futureSightCounter.focusBreakDurationSec;
          world.floatingTexts.push({
            id: `ft_fbreak_clash_${world.tick}_${loser.instanceId}`,
            pos: { x: loser.pos.x, y: loser.pos.y - 40 },
            text: `💥 맞대결 승리! 집중 붕괴 (${loser.foresightBreakTimer.toFixed(0)}s)!`,
            color: '#facc15',
            elapsedSec: 0,
            durationSec: 1.4,
            scale: 1.25
          });
          world.combatLog.push(
            `[미래 예지 파훼] ${winner.name}의 맞대결 승리로 ${loser.name}의 집중이 5초간 붕괴됨!`
          );
        }
        applyStatus(
          loser,
          'STAGGER',
          registry.balance.status.staggerDurationSec,
          winner.instanceId,
          world,
          registry
        );

        if (winArc.subtype === 'SLASH') {
          const startPos = { x: winner.pos.x, y: winner.pos.y };
          const dirThrough = normalizeVec(subVec(loser.pos, winner.pos), winArc.dir);
          const rawBehind = addVec(loser.pos, scaleVec(dirThrough, meleeCfg.crossSlashDashDistancePx));
          winner.pos = {
            x: clamp(rawBehind.x, winner.radiusPx, world.arenaWidth - winner.radiusPx),
            y: clamp(rawBehind.y, winner.radiusPx, world.arenaHeight - winner.radiusPx)
          };

          world.vfxEvents.push({
            id: `vfx_xslash_${world.tick}`,
            kind: 'CROSS_SLASH',
            pos: startPos,
            targetPos: { x: winner.pos.x, y: winner.pos.y },
            color: '#2dd4bf',
            radiusPx: 40,
            elapsedSec: 0,
            durationSec: 0.45
          });
          world.floatingTexts.push({
            id: `ft_xslash_${world.tick}_${winner.instanceId}`,
            pos: { x: loser.pos.x, y: loser.pos.y - 36 },
            text: `CROSS SLASH BREAK! -${damage}`,
            color: '#2dd4bf',
            elapsedSec: 0,
            durationSec: 1.1,
            scale: 1.25
          });
          world.combatLog.push(
            `[베기 교차 돌파] ${winner.name} 맞대결 승리! ${loser.name}의 등 뒤로 교차 참격!`
          );
        } else {
          const pushDir = normalizeVec(subVec(loser.pos, winner.pos), winArc.dir);
          const rawKbSpeed = session.isConquerorSkySplit
            ? meleeCfg.overpowerKnockbackSpeed * 1.35
            : meleeCfg.overpowerKnockbackSpeed;
          const kbSpeed = rawKbSpeed * Math.max(0, 1 - loser.knockbackResist);
          loser.knockbackVel = scaleVec(pushDir, kbSpeed);
          world.floatingTexts.push({
            id: `ft_mwin_${world.tick}_${winner.instanceId}`,
            pos: { x: loser.pos.x, y: loser.pos.y - 30 },
            text: session.isConquerorSkySplit
              ? `CONQUEROR OVERPOWER! -${damage}`
              : `CLASH WIN! -${damage}`,
            color: session.isConquerorSkySplit ? '#ef4444' : '#facc15',
            elapsedSec: 0,
            durationSec: 0.95,
            scale: 1.15
          });
        }
      }

      world.meleeClashes.splice(i, 1);
    }
  }
}
