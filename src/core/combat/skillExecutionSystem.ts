import {
  addVec,
  clamp,
  distVec,
  normalizeVec,
  scaleVec,
  subVec,
  type Vec2
} from '../math/vector2';
import type { BattleWorldState, UnitRuntimeState } from '../types/battleState';
import type { GameDataRegistry, MoveDefinition } from '../types/dataSchemas';
import {
  spawnBeamInstance,
  spawnMeleeArcInstance,
  spawnProjectileInstance
} from './attackSpawners';
import {
  activateMagellanVenomDemon,
  setLunarianFlameState
} from './bossMechanicsHooks';
import { computeDamage } from './damageCalc';
import { spawnFieldMove } from './fieldEngine';
import { consumeOverdriveSkillUse } from './formShiftEngine';
import { activateBirdcage, summonOrSwapMinion } from './hazardAndSummonHooks';
import { notifyUnitHitByAttack } from './hitNotificationSystem';
import { applyStatus, isUnitSkillSealed, isUnitStaggered } from './statusEngine';
import { triggerTraitHook } from './traitHooks';
import { findFirstActiveEnemy } from './worldLookup';

function findEnemyInRange(
  world: BattleWorldState,
  caster: UnitRuntimeState,
  maxDistExtra: number
): UnitRuntimeState | undefined {
  return world.units.find(
    (u) =>
      u.isAlive &&
      u.isOnField &&
      u.team !== caster.team &&
      distVec(u.pos, caster.pos) <= maxDistExtra + u.radiusPx
  );
}

export function executeMoveCast(
  caster: UnitRuntimeState,
  moveDef: MoveDefinition,
  aimDir: Vec2,
  world: BattleWorldState,
  registry: GameDataRegistry
): void {
  triggerTraitHook('onCast', caster, { moveArchetype: moveDef.archetype }, world, registry);
  consumeOverdriveSkillUse(caster, world, registry);

  // Phase 6: Air Door Teleport Behind Target (Blueno)
  if (moveDef.teleportBehindTarget) {
    const enemy = findFirstActiveEnemy(world, caster.team);
    if (enemy) {
      caster.iframeTimer = Math.max(caster.iframeTimer, 0.35);
      const behindOffset = enemy.radiusPx + caster.radiusPx + 14;
      const behindDir = scaleVec(normalizeVec(enemy.aimDir, { x: 1, y: 0 }), -1);
      caster.pos = {
        x: clamp(enemy.pos.x + behindDir.x * behindOffset, caster.radiusPx, world.arenaWidth - caster.radiusPx),
        y: clamp(enemy.pos.y + behindDir.y * behindOffset, caster.radiusPx, world.arenaHeight - caster.radiusPx)
      };
      caster.prevPos = { ...caster.pos };
      const newAim = normalizeVec(subVec(enemy.pos, caster.pos), aimDir);
      caster.aimDir = newAim;
      aimDir = newAim;
      world.floatingTexts.push({
        id: `ft_airdoor_${world.tick}_${caster.instanceId}`,
        pos: { x: caster.pos.x, y: caster.pos.y - 28 },
        text: '🚪 AIR DOOR AMBUSH!',
        color: '#2dd4bf',
        elapsedSec: 0,
        durationSec: 0.85,
        scale: 1.1
      });
      world.combatLog.push(
        `[문문 열매 기습] ${caster.name} 에어 도어로 ${enemy.name}의 배후로 순간이동!`
      );
    }
  }

  // Phase 6: Self Stat Buff on Cast
  if (moveDef.selfBuff) {
    caster.statBuffs.push({
      id: `${moveDef.id}_${world.tick}`,
      stat: moveDef.selfBuff.stat,
      multiplier: moveDef.selfBuff.multiplier,
      remainingSec: moveDef.selfBuff.durationSec
    });
    world.floatingTexts.push({
      id: `ft_sbuff_${world.tick}_${caster.instanceId}`,
      pos: { x: caster.pos.x, y: caster.pos.y - 28 },
      text: `${moveDef.name}! (${moveDef.selfBuff.stat.toUpperCase()} UP)`,
      color: '#fde047',
      elapsedSec: 0,
      durationSec: 0.85,
      scale: 1.05
    });
  }

  if (moveDef.activatesBirdcage) {
    activateBirdcage(caster, world, registry);
  }
  if (moveDef.meleeReflectSec && moveDef.meleeReflectSec > 0) {
    caster.meleeReflectTimer = Math.max(caster.meleeReflectTimer, moveDef.meleeReflectSec);
  }

  if (moveDef.summonMinionSpeciesId || moveDef.swapWithMinionIfAlive) {
    summonOrSwapMinion(caster, moveDef, world, registry);
    return;
  }

  if (moveDef.healPartyHpRatio && moveDef.healPartyHpRatio > 0) {
    for (const ally of world.units) {
      if (!ally.isAlive || !ally.isOnField || ally.team !== caster.team) continue;
      const healAmt = Math.max(1, Math.round(ally.maxHp * moveDef.healPartyHpRatio));
      ally.hp = Math.min(ally.maxHp, ally.hp + healAmt);
      world.floatingTexts.push({
        id: `ft_pheal_${world.tick}_${ally.instanceId}`,
        pos: { x: ally.pos.x, y: ally.pos.y - 28 },
        text: `💚 +${healAmt} HP`,
        color: '#4ade80',
        elapsedSec: 0,
        durationSec: 1.0,
        scale: 1.1
      });
    }
  }

  if (moveDef.allyCooldownAccel) {
    for (const ally of world.units) {
      if (!ally.isAlive || ally.team !== caster.team) continue;
      ally.cooldownAccelTimer = Math.max(ally.cooldownAccelTimer, moveDef.allyCooldownAccel.durationSec);
      ally.cooldownAccelRatio = Math.max(ally.cooldownAccelRatio, moveDef.allyCooldownAccel.ratio);
    }
    world.floatingTexts.push({
      id: `ft_music_${world.tick}_${caster.instanceId}`,
      pos: { x: caster.pos.x, y: caster.pos.y - 34 },
      text: `🎵 뉴 월드 연주! 쿨타임 -${Math.round(moveDef.allyCooldownAccel.ratio * 100)}%`,
      color: '#fde047',
      elapsedSec: 0,
      durationSec: 1.3,
      scale: 1.15
    });
  }

  if (moveDef.shatterProjectilesAndBeams) {
    for (const p of world.projectiles) {
      if (p.team !== caster.team && distVec(p.pos, caster.pos) <= moveDef.rangePx + 40) {
        p.destroyed = true;
      }
    }
    for (const b of world.beams) {
      if (b.team !== caster.team && distVec(b.origin, caster.pos) <= moveDef.rangePx + 180) {
        b.dimmed = true;
        b.currentPower *= 0.45;
      }
    }
  }

  if (moveDef.pullTargetTowardCasterPx && moveDef.pullTargetTowardCasterPx > 0) {
    const enemy = findEnemyInRange(world, caster, moveDef.rangePx);
    if (enemy) {
      const toCaster = normalizeVec(subVec(caster.pos, enemy.pos), { x: -1, y: 0 });
      const pullDist = Math.min(
        moveDef.pullTargetTowardCasterPx,
        Math.max(0, distVec(enemy.pos, caster.pos) - (caster.radiusPx + enemy.radiusPx + 10))
      );
      enemy.pos = addVec(enemy.pos, scaleVec(toCaster, pullDist));
      enemy.prevPos = { ...enemy.pos };
      world.floatingTexts.push({
        id: `ft_kurouzu_${world.tick}_${enemy.instanceId}`,
        pos: { x: enemy.pos.x, y: enemy.pos.y - 32 },
        text: '🌑 쿠로우즈 흡입!',
        color: '#a855f7',
        elapsedSec: 0,
        durationSec: 0.9,
        scale: 1.15
      });
    }
  }

  if (moveDef.remoteTargetStrike) {
    const enemy = findEnemyInRange(world, caster, moveDef.rangePx);
    if (enemy) {
      if (moveDef.basePower > 0) {
        const res = computeDamage(
          moveDef.basePower, caster, enemy, moveDef.category, moveDef.element, world, registry,
          {
            hasArmamentHaki: moveDef.hasArmamentHaki,
            isInternalDestruction: moveDef.isInternalDestruction,
            hasConquerorCoating: moveDef.hasConquerorCoating
          }
        );
        if (!res.nullified) {
          enemy.hp = Math.max(0, enemy.hp - res.damage);
          notifyUnitHitByAttack(caster, enemy, res.damage, Boolean(moveDef.hasConquerorCoating), world, registry);
          world.floatingTexts.push({
            id: `ft_clutch_${world.tick}_${enemy.instanceId}`,
            pos: { x: enemy.pos.x, y: enemy.pos.y - 28 },
            text: `🌸 클러치 -${res.damage}!`,
            color: '#f472b6',
            elapsedSec: 0,
            durationSec: 1.0,
            scale: 1.15
          });
        }
      }
      if (moveDef.statusSpec) {
        applyStatus(enemy, moveDef.statusSpec.statusKind, moveDef.statusSpec.durationSec, caster.instanceId, world, registry);
      }
      return;
    }
  }

  if (moveDef.archetype === 'PROJECTILE') {
    const spec = moveDef.projectileSpec;
    spawnProjectileInstance(caster, moveDef, aimDir, world, registry);
    if (spec && spec.pattern === 'BURST' && spec.burstCount > 1) {
      caster.pendingBurst = {
        moveId: moveDef.id,
        remainingCount: spec.burstCount - 1,
        intervalTimer: spec.burstIntervalSec,
        intervalSec: spec.burstIntervalSec,
        aimDir: { x: aimDir.x, y: aimDir.y }
      };
    }
  } else if (moveDef.archetype === 'BEAM') {
    spawnBeamInstance(caster, moveDef, aimDir, world, registry);
  } else if (moveDef.archetype === 'MELEE') {
    if (moveDef.triggersVenomDemon && !caster.venomDemonActive) {
      activateMagellanVenomDemon(caster, world, registry);
    }
    spawnMeleeArcInstance(caster, moveDef, aimDir, world, registry);
  } else if (moveDef.archetype === 'AOE_FIELD') {
    const targetPos = addVec(caster.pos, scaleVec(aimDir, Math.min(moveDef.rangePx, 180)));
    spawnFieldMove(caster, moveDef, targetPos, world, registry);
  } else if (moveDef.archetype === 'STATUS' && moveDef.statusSpec) {
    for (const enemy of world.units) {
      if (!enemy.isAlive || !enemy.isOnField || enemy.team === caster.team) continue;
      if (distVec(caster.pos, enemy.pos) <= moveDef.rangePx + enemy.radiusPx) {
        if (moveDef.basePower > 0) {
          const { damage } = computeDamage(
            moveDef.basePower, caster, enemy, 'SPECIAL', moveDef.element, world, registry,
            {
              hasArmamentHaki: moveDef.hasArmamentHaki,
              isInternalDestruction: moveDef.isInternalDestruction,
              hasConquerorCoating: moveDef.hasConquerorCoating
            }
          );
          enemy.hp = Math.max(0, enemy.hp - damage);
          notifyUnitHitByAttack(caster, enemy, damage, Boolean(moveDef.hasConquerorCoating), world, registry);
        }
        applyStatus(enemy, moveDef.statusSpec.statusKind, moveDef.statusSpec.durationSec, caster.instanceId, world, registry);
      }
    }
  }
}

export function tryStartMoveWindup(
  unit: UnitRuntimeState,
  slotIndex: number,
  aimDir: Vec2,
  world: BattleWorldState,
  registry: GameDataRegistry
): boolean {
  if (
    !unit.isAlive ||
    !unit.isOnField ||
    unit.isDowned ||
    (world.raidState.active && world.raidState.bossUnitId === unit.instanceId && world.raidState.groggyTimer > 0) ||
    unit.windupMoveId !== null ||
    unit.dodgeActiveTimer > 0 ||
    unit.clashLockId !== null ||
    isUnitStaggered(unit)
  ) {
    return false;
  }

  const slot = unit.moveSlots[slotIndex];
  if (!slot || slot.charges <= 0 || slot.cooldownTimer > 0) {
    return false;
  }

  const moveDef = registry.moves[slot.moveId];
  if (!moveDef) return false;

  if (isUnitSkillSealed(unit) && moveDef.category === 'SPECIAL') {
    world.floatingTexts.push({
      id: `ft_sealed_${world.tick}_${unit.instanceId}`,
      pos: { x: unit.pos.x, y: unit.pos.y - 24 },
      text: 'SKILL SEALED!',
      color: '#c084fc',
      elapsedSec: 0,
      durationSec: 0.7,
      scale: 0.95
    });
    return false;
  }

  slot.charges -= 1;
  slot.cooldownTimer = moveDef.cooldownSec;

  const traitDef = registry.traits[unit.traitId];
  if (traitDef?.lunarianFlame?.enabled && moveDef.extinguishesLunarianFlame && unit.lunarianFlameOn) {
    setLunarianFlameState(unit, false, world, registry);
  }

  let windupSec = moveDef.windupSec;
  if (traitDef?.lunarianFlame?.enabled && !unit.lunarianFlameOn) {
    windupSec *= traitDef.lunarianFlame.flameOffWindupMultiplier;
  }
  if (
    (world.weather.id === 'SOLAR_FLARE' && (moveDef.element === 'PYRO' || moveDef.element === 'FIRE')) ||
    (world.weather.id === 'TEMPEST_RAIN' && moveDef.element === 'AQUA') ||
    (world.weather.id === 'ION_STORM' && (moveDef.element === 'VOLT' || moveDef.element === 'VOID' || moveDef.element === 'LIGHT'))
  ) {
    windupSec /= registry.balance.field.weatherCastSpeedMultiplier;
  }

  unit.windupMoveId = moveDef.id;
  unit.windupTimer = Math.max(0.02, windupSec);
  unit.windupAimDir = normalizeVec(aimDir, unit.aimDir);
  unit.aimDir = { x: unit.windupAimDir.x, y: unit.windupAimDir.y };

  return true;
}
