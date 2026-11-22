import {
  addVec,
  clamp,
  distVec,
  lenVec,
  normalizeVec,
  scaleVec
} from '../math/vector2';
import type { BattleWorldState, UnitInputCommand } from '../types/battleState';
import type { GameDataRegistry } from '../types/dataSchemas';
import { spawnProjectileInstance } from './attackSpawners';
import { setLunarianFlameState } from './bossMechanicsHooks';
import { getUnitCurrentStat } from './damageCalc';
import { stepUnitDodge, tryExecuteDodge } from './dodgeSystem';
import {
  activateFormShift,
  cycleZoanStance,
  stepUnitFormShift
} from './formShiftEngine';
import { executeRosterSwap } from './rosterManager';
import { executeMoveCast, tryStartMoveWindup } from './skillExecutionSystem';
import {
  isUnitRooted,
  isUnitStaggered,
  stepUnitStatuses
} from './statusEngine';

export function stepUnitsMovementAndActions(
  world: BattleWorldState,
  cmdMap: Map<string, UnitInputCommand>,
  simDt: number,
  registry: GameDataRegistry
): void {
  for (const unit of world.units) {
    unit.prevPos = { x: unit.pos.x, y: unit.pos.y };
    if (!unit.isAlive) continue;

    const steroidTrait = registry.traits[unit.traitId]?.energySteroidOverdrive;
    const steroidCdBonus =
      unit.steroidOverdriveActive && steroidTrait?.enabled
        ? steroidTrait.cooldownAccelRatio
        : 0;
    const cdAccelMult =
      (unit.cooldownAccelTimer > 0 ? 1 + unit.cooldownAccelRatio : 1.0) +
      steroidCdBonus +
      unit.endgameCooldownReductionRatio;
    if (unit.cooldownAccelTimer > 0) {
      unit.cooldownAccelTimer = Math.max(0, unit.cooldownAccelTimer - simDt);
      if (unit.cooldownAccelTimer <= 0) {
        unit.cooldownAccelRatio = 0;
      }
    }
    if (unit.fruitNullifyTimer > 0) {
      unit.fruitNullifyTimer = Math.max(0, unit.fruitNullifyTimer - simDt);
    }
    if (unit.mochiMorphTimer > 0) {
      unit.mochiMorphTimer = Math.max(0, unit.mochiMorphTimer - simDt);
    }
    if (unit.parasiteConfuseTimer > 0) {
      unit.parasiteConfuseTimer = Math.max(0, unit.parasiteConfuseTimer - simDt);
    }
    // Stage 2-C: Katakuri Foresight Focus Break & Focus Regen
    const fsTrait = registry.traits[unit.traitId]?.futureSightCounter;
    if (fsTrait?.enabled) {
      if (unit.foresightBreakTimer > 0) {
        unit.foresightBreakTimer = Math.max(0, unit.foresightBreakTimer - simDt);
      } else if (unit.foresightFocus < fsTrait.maxFocus) {
        unit.foresightFocus = Math.min(
          fsTrait.maxFocus,
          unit.foresightFocus + fsTrait.focusRegenPerSec * simDt
        );
      }
    }

    for (const slot of unit.moveSlots) {
      if (slot.cooldownTimer > 0) {
        slot.cooldownTimer = Math.max(0, slot.cooldownTimer - simDt * cdAccelMult);
      }
      const mDef = registry.moves[slot.moveId];
      if (mDef && slot.charges < slot.maxCharges) {
        slot.chargeRechargeTimer += simDt * cdAccelMult;
        if (slot.chargeRechargeTimer >= mDef.chargeRecoverySec) {
          slot.chargeRechargeTimer -= mDef.chargeRecoverySec;
          slot.charges += 1;
        }
      } else {
        slot.chargeRechargeTimer = 0;
      }
    }

    if (!unit.isOnField) continue;

    stepUnitStatuses(unit, simDt, registry);
    const dodgeEnvMult =
      world.impelDownHazard.active && unit.team === 'ALPHA'
        ? world.impelDownHazard.dodgeRechargeMult
        : 1.0;
    stepUnitDodge(unit, simDt, registry, dodgeEnvMult);
    stepUnitFormShift(unit, simDt, world, registry);

    // Stage 2-A timers & arena water terrain detection
    if (unit.baraSplitTimer > 0) {
      unit.baraSplitTimer = Math.max(0, unit.baraSplitTimer - simDt);
    }
    if (unit.meleeReflectTimer > 0) {
      unit.meleeReflectTimer = Math.max(0, unit.meleeReflectTimer - simDt);
    }
    unit.inWaterTerrain = world.waterZones.some(
      (wz) => distVec(unit.pos, wz) <= wz.radiusPx + unit.radiusPx * 0.5
    );

    // Phase 6 Hook 1: Lunarian Flame auto-reignite countdown
    const uTrait = registry.traits[unit.traitId];
    if (
      uTrait?.lunarianFlame?.enabled &&
      !unit.lunarianFlameOn &&
      unit.lunarianReigniteTimer > 0
    ) {
      unit.lunarianReigniteTimer = Math.max(
        0,
        unit.lunarianReigniteTimer - simDt
      );
      if (unit.lunarianReigniteTimer <= 0) {
        setLunarianFlameState(unit, true, world, registry);
      }
    }

    // Phase 6 Hook 2: Super Regeneration (+3% MaxHP/sec after 1.5s post-hit delay, paused for 6s by Conqueror Lv3 hit)
    if (uTrait?.superRegeneration?.enabled && unit.isAlive) {
      if (unit.superRegenLockoutTimer > 0) {
        unit.superRegenLockoutTimer = Math.max(
          0,
          unit.superRegenLockoutTimer - simDt
        );
      } else {
        unit.superRegenIdleTimer += simDt;
        const delayReq = uTrait.superRegeneration.delayAfterHitSec ?? 1.5;
        if (unit.superRegenIdleTimer >= delayReq && unit.hp < unit.maxHp) {
          const regenPerSec =
            uTrait.superRegeneration.regenMaxHpRatioPerSec ?? 0.03;
          unit.regenAccumTimer += simDt;
          if (unit.regenAccumTimer >= 0.5) {
            const ticksElapsed = unit.regenAccumTimer;
            unit.regenAccumTimer = 0;
            const healAmt = Math.max(
              1,
              Math.round(unit.maxHp * regenPerSec * ticksElapsed)
            );
            unit.hp = Math.min(unit.maxHp, unit.hp + healAmt);
          }
        }
      }
    }

    if (unit.pendingBurst && !isUnitStaggered(unit)) {
      unit.pendingBurst.intervalTimer -= simDt;
      if (unit.pendingBurst.intervalTimer <= 0) {
        const mDef = registry.moves[unit.pendingBurst.moveId];
        if (mDef) {
          spawnProjectileInstance(unit, mDef, unit.pendingBurst.aimDir, world, registry);
        }
        unit.pendingBurst.remainingCount -= 1;
        if (unit.pendingBurst.remainingCount <= 0) {
          unit.pendingBurst = null;
        } else {
          unit.pendingBurst.intervalTimer += unit.pendingBurst.intervalSec;
        }
      }
    }

    const cmd = cmdMap.get(unit.instanceId);
    if (cmd) {
      if (cmd.swapToBenchUnitId) {
        executeRosterSwap(unit, cmd.swapToBenchUnitId, world, registry, false);
        continue;
      }
      if (cmd.aimVec && lenVec(cmd.aimVec) > 0.05) {
        unit.aimDir = normalizeVec(cmd.aimVec, unit.aimDir);
      }
      if (cmd.awakeningPressed) {
        activateFormShift(unit, world, registry);
      } else if (cmd.formShiftPressed) {
        if (unit.stanceFormIds.length > 0) {
          cycleZoanStance(unit, world, registry);
        } else {
          activateFormShift(unit, world, registry);
        }
      }
      if (cmd.dodgePressed) {
        tryExecuteDodge(unit, cmd.moveVec, world, registry);
      }
      if (cmd.castMoveSlotIndex !== null) {
        tryStartMoveWindup(unit, cmd.castMoveSlotIndex, unit.aimDir, world, registry);
      }
    }

    if (unit.windupMoveId) {
      unit.windupTimer -= simDt;
      if (unit.windupTimer <= 0) {
        const mDef = registry.moves[unit.windupMoveId];
        const aim = { x: unit.windupAimDir.x, y: unit.windupAimDir.y };
        unit.windupMoveId = null;
        unit.windupTimer = 0;
        if (mDef) {
          executeMoveCast(unit, mDef, aim, world, registry);
        }
      }
    }

    const spdStat = getUnitCurrentStat(unit, 'spd', world, registry);
    const moveSpeedPx =
      registry.balance.unitPhysics.baseMoveSpeedPx +
      spdStat * registry.balance.unitPhysics.speedStatScale;

    if (
      unit.isDowned ||
      (world.raidState.active &&
        world.raidState.bossUnitId === unit.instanceId &&
        world.raidState.groggyTimer > 0) ||
      unit.clashLockId !== null ||
      isUnitStaggered(unit) ||
      isUnitRooted(unit)
    ) {
      unit.vel = { x: 0, y: 0 };
    } else if (unit.dodgeActiveTimer > 0) {
      unit.vel = scaleVec(
        unit.dodgeDir,
        moveSpeedPx * registry.balance.dodge.speedMultiplier
      );
    } else if (cmd && lenVec(cmd.moveVec) > 0.05) {
      let mDir = normalizeVec(cmd.moveVec);
      if (unit.parasiteConfuseTimer > 0) {
        mDir = { x: -mDir.x, y: -mDir.y };
      }
      const castSlow = unit.windupMoveId || unit.activeBeamId ? 0.45 : 1.0;
      unit.vel = scaleVec(mDir, moveSpeedPx * castSlow);
    } else {
      const friction = unit.onIceHazard ? 1.8 : 10;
      unit.vel = scaleVec(unit.vel, Math.max(0, 1 - friction * simDt));
    }

    const totalVel = addVec(unit.vel, unit.knockbackVel);
    unit.pos.x = clamp(
      unit.pos.x + totalVel.x * simDt,
      unit.radiusPx,
      world.arenaWidth - unit.radiusPx
    );
    unit.pos.y = clamp(
      unit.pos.y + totalVel.y * simDt,
      unit.radiusPx,
      world.arenaHeight - unit.radiusPx
    );

    const kbDecay = Math.max(
      0,
      1 - registry.balance.unitPhysics.knockbackFriction * simDt
    );
    unit.knockbackVel = scaleVec(unit.knockbackVel, kbDecay);
  }
}
