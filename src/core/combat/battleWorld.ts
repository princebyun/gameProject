import { computeAiCommand } from '../ai/utilityAi';
import { FIXED_DT } from '../constants';
import { SeededPRNG } from '../math/prng';
import type { BattleWorldState, UnitInputCommand } from '../types/battleState';
import type { GameDataRegistry } from '../types/dataSchemas';
import { stepAllClashes } from './clashResolver';
import { stepFieldAndGlobalEffects } from './fieldEngine';
import { applyMeleeArcHits } from './meleeHitResolver';
import { stepUnitsMovementAndActions } from './movementAndPhysicsSystem';
import {
  applyBeamHits,
  applyProjectileHits
} from './projectileAndBeamHitResolver';
import {
  pruneFinishedAttacks,
  stepActiveAttacksPreClash
} from './projectileBeamLifecycleSystem';
import { stepTeamRosters } from './rosterManager';
import { resolveKoAndWinConditions } from './victoryAndWaveSystem';
import { stepVenomAndEndgameHazards } from './worldHazardsSystem';

export { createBattleWorld } from './worldFactory';
export {
  spawnBeamInstance,
  spawnMeleeArcInstance,
  spawnProjectileInstance
} from './attackSpawners';
export {
  activateMagellanVenomDemon,
  applyFruitNullification,
  applyVenomStacksToUnit,
  setLunarianFlameState,
  triggerForesightEvadeAndCounter,
  triggerForesightFocusBreak,
  tryTriggerRevivePassive
} from './bossMechanicsHooks';
export {
  activateBirdcage,
  damageDestructibleProp,
  spawnNextGauntletWave,
  summonOrSwapMinion
} from './hazardAndSummonHooks';
export { notifyUnitHitByAttack } from './hitNotificationSystem';

function stepUiAndVfxTimers(world: BattleWorldState, dt: number): void {
  if (world.screenShakeTimer > 0) {
    world.screenShakeTimer = Math.max(0, world.screenShakeTimer - dt);
  }
  if (world.screenFlashTimer > 0) {
    world.screenFlashTimer = Math.max(0, world.screenFlashTimer - dt);
  }
  if (world.bossIntroTimer > 0) {
    world.bossIntroTimer = Math.max(0, world.bossIntroTimer - dt);
  }
  if (world.waveBannerTimer > 0) {
    world.waveBannerTimer = Math.max(0, world.waveBannerTimer - dt);
    if (world.waveBannerTimer <= 0) {
      world.waveBannerText = null;
    }
  }
  if (world.tacticalHintTimer > 0) {
    world.tacticalHintTimer = Math.max(0, world.tacticalHintTimer - dt);
    if (world.tacticalHintTimer <= 0) {
      world.tacticalHintText = null;
    }
  }
  for (let i = world.floatingTexts.length - 1; i >= 0; i--) {
    const ft = world.floatingTexts[i];
    if (!ft) continue;
    ft.elapsedSec += dt;
    ft.pos.y -= 18 * dt;
    if (ft.elapsedSec >= ft.durationSec) {
      world.floatingTexts.splice(i, 1);
    }
  }
  for (let i = world.vfxEvents.length - 1; i >= 0; i--) {
    const vfx = world.vfxEvents[i];
    if (!vfx) continue;
    vfx.elapsedSec += dt;
    if (vfx.elapsedSec >= vfx.durationSec) {
      world.vfxEvents.splice(i, 1);
    }
  }
}

export function stepBattleWorld(
  world: BattleWorldState,
  playerCommands: UnitInputCommand[],
  registry: GameDataRegistry,
  prng: SeededPRNG,
  dt: number = FIXED_DT
): void {
  if (world.winnerTeam !== null) {
    return;
  }

  world.tick += 1;
  stepUiAndVfxTimers(world, dt);

  if (world.hitstopTimer > 0) {
    world.hitstopTimer = Math.max(0, world.hitstopTimer - dt);
    return;
  }

  let simDt = dt;
  if (world.slowMoTimer > 0) {
    world.slowMoTimer = Math.max(0, world.slowMoTimer - dt);
    simDt = dt * world.slowMoScale;
  }

  world.elapsedSec += simDt;
  stepTeamRosters(world, simDt);

  if (world.environmentField.remainingSec > 0) {
    world.environmentField.remainingSec = Math.max(
      0,
      world.environmentField.remainingSec - simDt
    );
    if (world.environmentField.remainingSec <= 0) {
      world.environmentField.kind = 'NONE';
      world.environmentField.ownerUnitId = null;
      world.environmentField.team = null;
    }
  }

  const cmdMap = new Map<string, UnitInputCommand>();
  for (const cmd of playerCommands) {
    cmdMap.set(cmd.unitId, cmd);
  }
  for (const unit of world.units) {
    if (!unit.isOnField || !unit.isAlive) continue;
    if (!unit.isPlayerControlled || world.mode === 'AI_VS_AI') {
      cmdMap.set(unit.instanceId, computeAiCommand(unit, world, registry, prng, simDt));
    }
  }

  stepUnitsMovementAndActions(world, cmdMap, simDt, registry);
  stepActiveAttacksPreClash(world, simDt, registry);
  stepAllClashes(world, simDt, registry);

  applyProjectileHits(world, registry);
  applyBeamHits(world, simDt, registry);
  applyMeleeArcHits(world, registry);

  pruneFinishedAttacks(world);
  stepFieldAndGlobalEffects(world, simDt, registry);
  stepVenomAndEndgameHazards(world, simDt, registry, prng);
  resolveKoAndWinConditions(world, simDt, registry, prng);
}
