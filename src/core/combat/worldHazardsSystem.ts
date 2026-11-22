import { SeededPRNG } from '../math/prng';
import {
  clamp,
  distVec,
  normalizeVec,
  scaleVec,
  subVec
} from '../math/vector2';
import type { BattleWorldState } from '../types/battleState';
import type { GameDataRegistry } from '../types/dataSchemas';
import {
  activateMagellanVenomDemon,
  applyVenomStacksToUnit
} from './bossMechanicsHooks';
import { computeDamage } from './damageCalc';
import { getUnitById } from './worldLookup';

export function stepVenomAndEndgameHazards(
  world: BattleWorldState,
  simDt: number,
  registry: GameDataRegistry,
  prng: SeededPRNG
): void {
  // Stage 3 Hook A: Magellan Venom Demon Phase 2 Auto-Trigger, Aura & Stacking Venom DoT
  for (const unit of world.units) {
    if (!unit.isAlive || !unit.isOnField) continue;
    const venomSpec = registry.traits[unit.traitId]?.venomDemonPassive;
    if (venomSpec?.enabled) {
      if (!unit.venomDemonActive && unit.hp <= unit.maxHp * venomSpec.triggerHpRatio) {
        activateMagellanVenomDemon(unit, world, registry);
      }
      if (unit.venomDemonActive) {
        unit.venomAuraTickTimer += simDt;
        if (unit.venomAuraTickTimer >= venomSpec.tickIntervalSec) {
          unit.venomAuraTickTimer -= venomSpec.tickIntervalSec;
          for (const enemy of world.units) {
            if (!enemy.isAlive || !enemy.isOnField || enemy.team === unit.team) continue;
            if (distVec(unit.pos, enemy.pos) <= venomSpec.auraRadiusPx + enemy.radiusPx) {
              applyVenomStacksToUnit(enemy, 1, world, registry, venomSpec.maxStacks);
            }
          }
        }
      }
    }

    if (unit.venomStacks > 0) {
      unit.venomDecayTimer = Math.max(0, unit.venomDecayTimer - simDt);
      unit.venomTickTimer += simDt;
      if (unit.venomTickTimer >= 0.5) {
        unit.venomTickTimer -= 0.5;
        const resist = Math.min(0.85, unit.endgameHazardResistRatio);
        // Stacking damage strictly grows per stack: (14 + 7 * stacks) * 0.5s
        const rawHalfSecDmg = (14 + 7 * unit.venomStacks) * 0.5;
        const dmg = Math.max(1, Math.round(rawHalfSecDmg * (1 - resist)));
        unit.hp = Math.max(0, unit.hp - dmg);
        world.floatingTexts.push({
          id: `ft_vdot_${world.tick}_${unit.instanceId}`,
          pos: { x: unit.pos.x, y: unit.pos.y - 24 },
          text: `☠ -${dmg} (x${unit.venomStacks})`,
          color: '#a855f7',
          elapsedSec: 0,
          durationSec: 0.65,
          scale: 0.9
        });
      }
      if (unit.venomDecayTimer <= 0) {
        unit.venomStacks = Math.max(0, unit.venomStacks - 1);
        if (unit.venomStacks > 0) {
          unit.venomDecayTimer = 3.0;
        }
      }
    }
  }

  // Stage 3 Hook B: Impel Down Floor 1 Crimson Slash Trap (telegraphed periodic floor SLASH)
  if (world.impelDownHazard.active && world.impelDownHazard.kind === 'CRIMSON_SLASH_TRAP') {
    if (world.impelDownHazard.pendingTrapPos) {
      world.impelDownHazard.pendingTrapTelegraphTimer -= simDt;
      if (world.impelDownHazard.pendingTrapTelegraphTimer <= 0) {
        const trapPos = world.impelDownHazard.pendingTrapPos;
        world.impelDownHazard.pendingTrapPos = null;
        world.impelDownHazard.trapTimer = 4.2;
        world.vfxEvents.push({
          id: `vfx_crimson_trap_${world.tick}`,
          kind: 'CROSS_SLASH',
          pos: { ...trapPos },
          color: '#f43f5e',
          radiusPx: 68,
          elapsedSec: 0,
          durationSec: 0.35
        });
        for (const u of world.units) {
          if (!u.isAlive || !u.isOnField || u.team !== 'ALPHA' || u.iframeTimer > 0) continue;
          if (distVec(u.pos, trapPos) <= 68 + u.radiusPx) {
            const resist = Math.min(0.85, u.endgameHazardResistRatio);
            const dmg = Math.max(4, Math.round(32 * (1 - resist)));
            u.hp = Math.max(0, u.hp - dmg);
            world.floatingTexts.push({
              id: `ft_ctrap_${world.tick}_${u.instanceId}`,
              pos: { x: u.pos.x, y: u.pos.y - 26 },
              text: `⚔ 홍련 함정 -${dmg}`,
              color: '#f43f5e',
              elapsedSec: 0,
              durationSec: 0.75,
              scale: 1.0
            });
          }
        }
      }
    } else {
      world.impelDownHazard.trapTimer -= simDt;
      if (world.impelDownHazard.trapTimer <= 0) {
        const targetAlpha = world.units.find((u) => u.isAlive && u.isOnField && u.team === 'ALPHA');
        if (targetAlpha) {
          world.impelDownHazard.pendingTrapPos = {
            x: clamp(targetAlpha.pos.x + prng.nextRange(-28, 28), 60, world.arenaWidth - 60),
            y: clamp(targetAlpha.pos.y + prng.nextRange(-28, 28), 60, world.arenaHeight - 60)
          };
          world.impelDownHazard.pendingTrapTelegraphTimer = 1.1;
        }
      }
    }
  }

  // Stage 3 Hook C: Corrida Colosseum Circular Water Moat Ring-Out Rule
  if (world.colosseumRingOut.active) {
    const ro = world.colosseumRingOut;
    for (const u of world.units) {
      if (!u.isAlive || !u.isOnField) continue;
      const dFromCenter = distVec(u.pos, ro.center);
      if (dFromCenter > ro.safeRadiusPx) {
        u.inWaterTerrain = true;
        u.ringOutTimer += simDt;
        const dpsTick = u.maxHp * ro.outOfBoundsDpsRatio * simDt;
        u.hp = Math.max(0, u.hp - dpsTick);
        if (u.ringOutTimer >= ro.outOfBoundsLimitSec) {
          if (ro.instantRingOutKo) {
            u.hp = 0;
            ro.resolvedByRingOut = true;
            world.winReasonText = `🌊 링아웃 판정! ${u.name}이(가) 해자 외곽에서 2초 이상 체류하여 탈락!`;
            world.floatingTexts.push({
              id: `ft_ringout_${world.tick}_${u.instanceId}`,
              pos: { x: u.pos.x, y: u.pos.y - 36 },
              text: '🌊 RING OUT!!',
              color: '#38bdf8',
              elapsedSec: 0,
              durationSec: 1.4,
              scale: 1.35
            });
            world.combatLog.push(world.winReasonText);
          } else {
            const penalty = Math.max(10, Math.round(u.maxHp * 0.14));
            u.hp = Math.max(0, u.hp - penalty);
            u.ringOutTimer = 0;
          }
        }
      } else {
        u.ringOutTimer = Math.max(0, u.ringOutTimer - simDt * 1.5);
      }
    }
  }

  // Stage 2-C Hook 1: Step Shrinking Arena (Doflamingo Birdcage)
  if (world.birdcage.active) {
    const owner = world.birdcage.ownerUnitId
      ? getUnitById(world, world.birdcage.ownerUnitId)
      : undefined;
    if (!owner || !owner.isAlive) {
      world.birdcage.active = false;
      world.birdcage.shrinkScale = 1.0;
      world.birdcage.ownerUnitId = null;
      world.floatingTexts.push({
        id: `ft_cage_break_${world.tick}`,
        pos: { x: world.arenaWidth * 0.5, y: 110 },
        text: '✨ 새장 붕괴! 아레나가 해방되었습니다!',
        color: '#4ade80',
        elapsedSec: 0,
        durationSec: 1.5,
        scale: 1.3
      });
      world.combatLog.push('[새장 붕괴] 시전자 격파로 새장이 즉시 해제되었습니다!');
    } else {
      world.birdcage.shrinkScale = Math.max(
        world.birdcage.minScaleRatio,
        world.birdcage.shrinkScale - world.birdcage.shrinkRatePerSec * simDt
      );
      const halfW = (world.arenaWidth * world.birdcage.shrinkScale) * 0.5;
      const halfH = (world.arenaHeight * world.birdcage.shrinkScale) * 0.5;
      const cx = world.arenaWidth * 0.5;
      const cy = world.arenaHeight * 0.5;
      const minX = cx - halfW;
      const maxX = cx + halfW;
      const minY = cy - halfH;
      const maxY = cy + halfH;

      world.birdcage.tickTimer += simDt;
      const applySlashTick = world.birdcage.tickTimer >= 0.5;
      if (applySlashTick) {
        world.birdcage.tickTimer -= 0.5;
      }

      for (const u of world.units) {
        if (!u.isAlive || !u.isOnField) continue;
        const touchingCage =
          u.pos.x - u.radiusPx <= minX ||
          u.pos.x + u.radiusPx >= maxX ||
          u.pos.y - u.radiusPx <= minY ||
          u.pos.y + u.radiusPx >= maxY;
        if (touchingCage) {
          u.pos.x = clamp(u.pos.x, minX + u.radiusPx, maxX - u.radiusPx);
          u.pos.y = clamp(u.pos.y, minY + u.radiusPx, maxY - u.radiusPx);
          if (u.team !== owner.team && u.iframeTimer <= 0 && applySlashTick) {
            const toCenter = normalizeVec(subVec({ x: cx, y: cy }, u.pos), { x: 1, y: 0 });
            const kbSpeed =
              world.birdcage.boundaryKnockbackSpeed * Math.max(0, 1 - u.knockbackResist);
            u.knockbackVel = scaleVec(toCenter, kbSpeed);
            const slashRes = computeDamage(
              world.birdcage.boundarySlashDamage,
              owner,
              u,
              'PHYSICAL',
              'SLASH',
              world,
              registry,
              { hasArmamentHaki: true, isBurstOrAoe: true }
            );
            if (!slashRes.nullified) {
              u.hp = Math.max(0, u.hp - slashRes.damage);
              world.floatingTexts.push({
                id: `ft_cagehit_${world.tick}_${u.instanceId}`,
                pos: { x: u.pos.x, y: u.pos.y - 26 },
                text: `🕸 새장 참격 -${slashRes.damage}`,
                color: '#f43f5e',
                elapsedSec: 0,
                durationSec: 0.75,
                scale: 1.0
              });
            }
          }
        }
      }
    }
  }
}
