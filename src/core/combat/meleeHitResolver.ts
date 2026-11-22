import { interceptRaidBossIncomingDamage } from '../endgame/raid';
import { isCircleIntersectingSector, scaleVec } from '../math/vector2';
import type { BattleWorldState } from '../types/battleState';
import type { GameDataRegistry } from '../types/dataSchemas';
import {
  applyFruitNullification,
  applyVenomStacksToUnit,
  triggerForesightFocusBreak
} from './bossMechanicsHooks';
import { computeDamage } from './damageCalc';
import { damageDestructibleProp } from './hazardAndSummonHooks';
import { emitNullifiedHitFeedback, notifyUnitHitByAttack } from './hitNotificationSystem';
import { openPivotSwapWindow } from './rosterManager';
import { applyStatus } from './statusEngine';
import { triggerTraitHook } from './traitHooks';
import { getUnitById } from './worldLookup';

export function applyMeleeArcHits(
  world: BattleWorldState,
  registry: GameDataRegistry
): void {
  for (const arc of world.meleeArcs) {
    if (
      arc.finished ||
      arc.clashing ||
      arc.elapsedSec > arc.activeDamageDurationSec
    ) {
      continue;
    }

    const attacker = getUnitById(world, arc.ownerUnitId);
    const moveDef = registry.moves[arc.moveId];
    if (!attacker || !moveDef) continue;

    // Stage 2-B: Melee hits destructible arena props (Alabasta water barrels)
    for (const prop of world.destructibleProps) {
      if (prop.destroyed) continue;
      if (
        isCircleIntersectingSector(
          prop.pos,
          prop.radiusPx,
          arc.origin,
          arc.dir,
          arc.radiusPx,
          arc.arcDeg
        )
      ) {
        damageDestructibleProp(prop, arc.currentPower, world, registry);
      }
    }

    for (const target of world.units) {
      if (
        !target.isAlive ||
        !target.isOnField ||
        target.isDowned ||
        target.team === arc.team ||
        target.iframeTimer > 0 ||
        arc.hitUnitIds.includes(target.instanceId)
      ) {
        continue;
      }

      if (
        isCircleIntersectingSector(
          target.pos,
          target.radiusPx,
          arc.origin,
          arc.dir,
          arc.radiusPx,
          arc.arcDeg
        )
      ) {
        arc.hitUnitIds.push(target.instanceId);
        const res = computeDamage(
          arc.currentPower,
          attacker,
          target,
          moveDef.category,
          arc.element,
          world,
          registry,
          {
            hasArmamentHaki: arc.hasArmamentHaki,
            isInternalDestruction: arc.isInternalDestruction,
            hasConquerorCoating: arc.hasConquerorCoating,
            moveId: moveDef.id,
            isSingleLinear: arc.arcDeg < 300,
            isBurstOrAoe: arc.arcDeg >= 300
          }
        );

        if (res.nullified) {
          emitNullifiedHitFeedback(
            target,
            res.nullifyReason ?? 'NONE',
            world,
            attacker,
            registry
          );
          continue;
        }

        target.lastIncomingMoveIdByAttacker[attacker.instanceId] = moveDef.id;
        const appliedMeleeDmg = interceptRaidBossIncomingDamage(
          world,
          target,
          attacker,
          res.damage,
          arc.currentPower,
          arc.hasArmamentHaki,
          arc.hasConquerorCoating,
          arc.isInternalDestruction
        );
        target.hp = Math.max(0, target.hp - appliedMeleeDmg);
        notifyUnitHitByAttack(
          attacker,
          target,
          res.damage,
          arc.hasConquerorCoating,
          world,
          registry
        );
        // Stage 2-C: Katakuri Future Sight Counterplay (Just Dodge / Obs Lv3 / 360 AoE)
        if (
          registry.traits[target.traitId]?.futureSightCounter?.enabled &&
          target.foresightBreakTimer <= 0 &&
          (attacker.justDodgeBuffTimer > 0 ||
            attacker.haki.observation >= 3 ||
            arc.arcDeg >= 300)
        ) {
          const reason =
            attacker.justDodgeBuffTimer > 0
              ? '완벽 회피 반격'
              : attacker.haki.observation >= 3
                ? '견문색 Lv.3'
                : '전방위 광역기';
          triggerForesightFocusBreak(target, world, registry, reason);
        }
        if (moveDef.confuseSec && moveDef.confuseSec > 0) {
          target.parasiteConfuseTimer = Math.max(
            target.parasiteConfuseTimer,
            moveDef.confuseSec
          );
        }

        // Stage 2-A: Don Krieg Needle Cloak melee damage reflection
        if (target.meleeReflectTimer > 0 && res.damage > 0) {
          const refDmg = Math.max(1, Math.round(res.damage * 0.25));
          attacker.hp = Math.max(0, attacker.hp - refDmg);
          world.floatingTexts.push({
            id: `ft_reflect_${world.tick}_${attacker.instanceId}`,
            pos: { x: attacker.pos.x, y: attacker.pos.y - 26 },
            text: `검산 망토 반사 -${refDmg}`,
            color: '#f59e0b',
            elapsedSec: 0,
            durationSec: 0.85,
            scale: 1.0
          });
        }

        // Stage 2-A: Smoker Seastone Jitte skill cooldown delay (+3s) on Devil Fruit users
        if (moveDef.skillCooldownDelaySec && target.fruitType !== 'NONE') {
          for (const sl of target.moveSlots) {
            sl.cooldownTimer = Math.max(sl.cooldownTimer, moveDef.skillCooldownDelaySec);
          }
          world.floatingTexts.push({
            id: `ft_seastone_${world.tick}_${target.instanceId}`,
            pos: { x: target.pos.x, y: target.pos.y - 36 },
            text: `해루석 짙테! 스킬 지연 +${moveDef.skillCooldownDelaySec}s`,
            color: '#38bdf8',
            elapsedSec: 0,
            durationSec: 1.0,
            scale: 1.05
          });
        }

        // Stage 2-B: Melee hit status & hook effects (SEA->WET, Blackbeard Fruit Nullify, Aokiji Freeze)
        if (arc.element === 'SEA' || moveDef.applyWetSec) {
          applyStatus(
            target,
            'WET',
            moveDef.applyWetSec ?? 8.0,
            attacker.instanceId,
            world,
            registry
          );
        }
        if (moveDef.nullifyFruitSec) {
          applyFruitNullification(target, moveDef.nullifyFruitSec, world, registry);
        }
        if (moveDef.applyFreezeSec) {
          applyStatus(
            target,
            'FREEZE',
            moveDef.applyFreezeSec,
            attacker.instanceId,
            world,
            registry
          );
        }
        if (moveDef.appliesVenomStacks && moveDef.appliesVenomStacks > 0) {
          applyVenomStacksToUnit(target, moveDef.appliesVenomStacks, world, registry);
        }
        triggerTraitHook('onHit', attacker, { moveArchetype: 'MELEE' }, world, registry);
        triggerTraitHook('onBeingHit', target, { moveArchetype: 'MELEE' }, world, registry);

        const rawKb = arc.hasConquerorCoating ? 210 : 140;
        const effectiveKb = rawKb * Math.max(0, 1 - target.knockbackResist);
        target.knockbackVel = scaleVec(arc.dir, effectiveKb);
        world.hitstopTimer = Math.max(
          world.hitstopTimer,
          registry.balance.presentation.defaultHitstopSec
        );
        world.screenShakeTimer = 0.14;
        world.screenShakeMagnitude = arc.hasConquerorCoating ? 6.0 : 4.5;

        if (arc.hasConquerorCoating) {
          world.vfxEvents.push({
            id: `vfx_conq_hit_${world.tick}_${target.instanceId}`,
            kind: 'CONQUEROR_LIGHTNING',
            pos: { x: target.pos.x, y: target.pos.y },
            color: '#dc2626',
            radiusPx: 42,
            elapsedSec: 0,
            durationSec: 0.35
          });
        }

        world.floatingTexts.push({
          id: `ft_mhit_${world.tick}_${target.instanceId}`,
          pos: { x: target.pos.x, y: target.pos.y - 26 },
          text:
            arc.hasConquerorCoating
              ? `⚡ -${res.damage}!`
              : res.affinity > 1.0
                ? `-${res.damage}!`
                : `-${res.damage}`,
          color: arc.hasConquerorCoating
            ? '#ef4444'
            : res.affinity > 1.0
              ? '#facc15'
              : '#f8fafc',
          elapsedSec: 0,
          durationSec: registry.balance.presentation.floatingTextDurationSec,
          scale: arc.hasConquerorCoating ? 1.25 : 1.15
        });

        if (moveDef.pivotSwapOnHit) {
          openPivotSwapWindow(attacker, world, registry);
        }
      }
    }
  }
}
