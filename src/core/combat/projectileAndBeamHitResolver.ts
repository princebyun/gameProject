import { interceptRaidBossIncomingDamage } from '../endgame/raid';
import { addVec, distVec, pointToSegmentDist, scaleVec } from '../math/vector2';
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

export function applyProjectileHits(
  world: BattleWorldState,
  registry: GameDataRegistry
): void {
  for (const proj of world.projectiles) {
    if (proj.destroyed) continue;
    const attacker = getUnitById(world, proj.ownerUnitId);
    const moveDef = registry.moves[proj.moveId];

    // Stage 2-B: Hit destructible arena props (Alabasta water barrels)
    for (const prop of world.destructibleProps) {
      if (prop.destroyed) continue;
      if (distVec(proj.pos, prop.pos) <= proj.radiusPx + prop.radiusPx) {
        proj.destroyed = true;
        damageDestructibleProp(prop, proj.currentPower, world, registry);
        break;
      }
    }
    if (proj.destroyed) continue;

    for (const target of world.units) {
      if (
        !target.isAlive ||
        !target.isOnField ||
        target.isDowned ||
        target.team === proj.team ||
        target.iframeTimer > 0
      ) {
        continue;
      }

      if (distVec(proj.pos, target.pos) <= proj.radiusPx + target.radiusPx) {
        proj.destroyed = true;
        if (attacker && moveDef) {
          const isBurstProj = moveDef.projectileSpec?.pattern === 'BURST';
          const res = computeDamage(
            proj.currentPower,
            attacker,
            target,
            moveDef.category,
            proj.element,
            world,
            registry,
            {
              hasArmamentHaki: proj.hasArmamentHaki,
              isInternalDestruction: proj.isInternalDestruction,
              hasConquerorCoating: proj.hasConquerorCoating,
              isProjectile: true,
              moveId: moveDef.id,
              isSingleLinear: !isBurstProj,
              isBurstOrAoe: isBurstProj
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
            break;
          }

          target.lastIncomingMoveIdByAttacker[attacker.instanceId] = moveDef.id;
          const appliedProjDmg = interceptRaidBossIncomingDamage(
            world,
            target,
            attacker,
            res.damage,
            proj.currentPower,
            proj.hasArmamentHaki,
            proj.hasConquerorCoating,
            proj.isInternalDestruction
          );
          target.hp = Math.max(0, target.hp - appliedProjDmg);
          if (proj.appliesVenomStacks && proj.appliesVenomStacks > 0) {
            applyVenomStacksToUnit(target, proj.appliesVenomStacks, world, registry);
          }
          notifyUnitHitByAttack(
            attacker,
            target,
            res.damage,
            proj.hasConquerorCoating,
            world,
            registry
          );
          // Stage 2-C: Katakuri Future Sight Counterplay (Just Dodge / Obs Lv3 / Burst)
          if (
            registry.traits[target.traitId]?.futureSightCounter?.enabled &&
            target.foresightBreakTimer <= 0 &&
            (attacker.justDodgeBuffTimer > 0 ||
              attacker.haki.observation >= 3 ||
              isBurstProj)
          ) {
            const reason =
              attacker.justDodgeBuffTimer > 0
                ? '완벽 회피 반격'
                : attacker.haki.observation >= 3
                  ? '견문색 Lv.3'
                  : '연타 투사체';
            triggerForesightFocusBreak(target, world, registry, reason);
          }
          if (moveDef.confuseSec && moveDef.confuseSec > 0) {
            target.parasiteConfuseTimer = Math.max(
              target.parasiteConfuseTimer,
              moveDef.confuseSec
            );
            applyStatus(target, 'ROOT', moveDef.confuseSec, attacker.instanceId, world, registry);
          }
          if (proj.element === 'SEA' || moveDef.applyWetSec) {
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
          triggerTraitHook(
            'onHit',
            attacker,
            { moveArchetype: 'PROJECTILE' },
            world,
            registry
          );
          triggerTraitHook(
            'onBeingHit',
            target,
            { moveArchetype: 'PROJECTILE' },
            world,
            registry
          );

          world.hitstopTimer = Math.max(
            world.hitstopTimer,
            registry.balance.presentation.defaultHitstopSec
          );
          world.screenShakeTimer = 0.12;
          world.screenShakeMagnitude = 3.5;

          const color =
            res.affinity > 1.0
              ? '#facc15'
              : res.affinity < 1.0
                ? '#94a3b8'
                : '#f8fafc';
          world.floatingTexts.push({
            id: `ft_phit_${world.tick}_${target.instanceId}_${proj.id}`,
            pos: { x: target.pos.x, y: target.pos.y - 24 },
            text: res.affinity > 1.0 ? `-${res.damage}!` : `-${res.damage}`,
            color,
            elapsedSec: 0,
            durationSec: registry.balance.presentation.floatingTextDurationSec,
            scale: res.affinity > 1.0 ? 1.15 : 1.0
          });
          world.vfxEvents.push({
            id: `vfx_phit_${world.tick}_${proj.id}`,
            kind: proj.hasConquerorCoating ? 'CONQUEROR_LIGHTNING' : 'HIT_SPARK',
            pos: { x: proj.pos.x, y: proj.pos.y },
            color: proj.hasConquerorCoating ? '#ef4444' : color,
            radiusPx: 20,
            elapsedSec: 0,
            durationSec: 0.22
          });

          if (moveDef.pivotSwapOnHit) {
            openPivotSwapWindow(attacker, world, registry);
          }
        }
        break;
      }
    }
  }
}

export function applyBeamHits(
  world: BattleWorldState,
  dt: number,
  registry: GameDataRegistry
): void {
  for (const beam of world.beams) {
    if (beam.terminated || beam.clashingWithBeamId || beam.guardedByMeleeId) {
      continue;
    }

    let maxLen = beam.maxRangePx;
    for (const zone of world.fieldZones) {
      if (zone.fieldKind !== 'DOME_SHIELD' || zone.team === beam.team || zone.domeHp <= 0) {
        continue;
      }
      const beamEnd = addVec(beam.origin, scaleVec(beam.dir, maxLen));
      const d = pointToSegmentDist(zone.pos, beam.origin, beamEnd);
      if (d <= zone.radiusPx) {
        maxLen = Math.max(24, distVec(beam.origin, zone.pos) - zone.radiusPx);
        zone.domeHp -= beam.currentPower * 0.45 * dt;
      }
    }
    beam.currentLengthPx = maxLen;

    beam.tickTimer += dt;
    if (beam.tickTimer < beam.tickIntervalSec) continue;
    beam.tickTimer -= beam.tickIntervalSec;

    const attacker = getUnitById(world, beam.ownerUnitId);
    const moveDef = registry.moves[beam.moveId];
    if (!attacker || !moveDef) continue;

    const beamEnd = addVec(beam.origin, scaleVec(beam.dir, beam.currentLengthPx));
    for (const target of world.units) {
      if (
        !target.isAlive ||
        !target.isOnField ||
        target.isDowned ||
        target.team === beam.team ||
        target.iframeTimer > 0
      ) {
        continue;
      }

      const d = pointToSegmentDist(target.pos, beam.origin, beamEnd);
      if (d <= target.radiusPx + beam.widthPx * 0.5) {
        const res = computeDamage(
          beam.currentPower * 0.28,
          attacker,
          target,
          moveDef.category,
          beam.element,
          world,
          registry,
          {
            hasArmamentHaki: beam.hasArmamentHaki,
            isInternalDestruction: beam.isInternalDestruction,
            hasConquerorCoating: beam.hasConquerorCoating
          }
        );

        if (res.nullified) {
          emitNullifiedHitFeedback(target, res.nullifyReason ?? 'NONE', world);
          continue;
        }

        const appliedBeamDmg = interceptRaidBossIncomingDamage(
          world,
          target,
          attacker,
          res.damage,
          beam.currentPower * 0.35,
          beam.hasArmamentHaki,
          beam.hasConquerorCoating,
          beam.isInternalDestruction
        );
        target.hp = Math.max(0, target.hp - appliedBeamDmg);
        notifyUnitHitByAttack(
          attacker,
          target,
          res.damage,
          beam.hasConquerorCoating,
          world,
          registry
        );
        triggerTraitHook('onHit', attacker, { moveArchetype: 'BEAM' }, world, registry);
        triggerTraitHook('onBeingHit', target, { moveArchetype: 'BEAM' }, world, registry);

        world.floatingTexts.push({
          id: `ft_bhit_${world.tick}_${target.instanceId}`,
          pos: { x: target.pos.x, y: target.pos.y - 24 },
          text: `-${res.damage}`,
          color: res.affinity > 1.0 ? '#facc15' : '#38bdf8',
          elapsedSec: 0,
          durationSec: 0.55,
          scale: 0.95
        });
      }
    }
  }
}
