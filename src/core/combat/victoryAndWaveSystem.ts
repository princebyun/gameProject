import {
  RAID_DOWNED_DURATION_SEC,
  stepRaidBattleRules
} from '../endgame/raid';
import { SeededPRNG } from '../math/prng';
import { distVec } from '../math/vector2';
import type { BattleWorldState } from '../types/battleState';
import type { GameDataRegistry } from '../types/dataSchemas';
import { assertNever } from '../types/exhaustive';
import { tryTriggerRevivePassive } from './bossMechanicsHooks';
import { spawnNextGauntletWave } from './hazardAndSummonHooks';
import { executeRosterSwap } from './rosterManager';

export function resolveKoAndWinConditions(
  world: BattleWorldState,
  simDt: number,
  registry: GameDataRegistry,
  prng: SeededPRNG
): void {
  for (const unit of world.units) {
    if (unit.isAlive && !unit.isDowned && unit.hp <= 0) {
      // Stage 2-B Hook 5: Marco Phoenix Revive Passive (1x per battle)
      if (tryTriggerRevivePassive(unit, world, registry)) {
        continue;
      }

      // Stage 3 Step 2: Raid Downed State (15s rescue timer instead of instant death)
      if (world.raidState.active && unit.team === 'ALPHA' && unit.isOnField) {
        unit.hp = 0;
        unit.isDowned = true;
        unit.downedTimer = RAID_DOWNED_DURATION_SEC;
        unit.reviveProgressSec = 0;
        unit.windupMoveId = null;
        unit.activeBeamId = null;
        unit.clashLockId = null;
        unit.vel = { x: 0, y: 0 };
        world.floatingTexts.push({
          id: `ft_downed_${world.tick}_${unit.instanceId}`,
          pos: { x: unit.pos.x, y: unit.pos.y - 30 },
          text: `🆘 DOWNED! (15초 내 동료 구조 필요)`,
          color: '#f43f5e',
          elapsedSec: 0,
          durationSec: 1.5,
          scale: 1.15
        });
        world.combatLog.push(
          `[레이드 다운] ${unit.name}이(가) 다운되었습니다! 동료가 2초간 구조하면 HP 40%로 부활합니다.`
        );
        continue;
      }

      unit.hp = 0;
      unit.isAlive = false;
      unit.windupMoveId = null;
      unit.activeBeamId = null;
      unit.clashLockId = null;
      if (world.birdcage.active && world.birdcage.ownerUnitId === unit.instanceId) {
        world.birdcage.active = false;
        world.birdcage.shrinkScale = 1.0;
        world.birdcage.ownerUnitId = null;
        world.combatLog.push('[새장 붕괴] 보스 격파로 새장이 즉시 해제되었습니다!');
      }
      world.combatLog.push(`[전투 불능] ${unit.name} 쓰러짐!`);

      if (unit.isOnField) {
        const replacement = world.units.find(
          (u) => u.team === unit.team && !u.isOnField && u.isAlive
        );
        if (replacement) {
          executeRosterSwap(unit, replacement.instanceId, world, registry, true);
        } else {
          unit.isOnField = false;
        }
      }
    }
  }

  // Stage 3 Step 2: Step Giant Boss Co-op Raid Rules (Groggy, DPS Check, Telegraphs, Down/Rescue)
  if (world.raidState.active) {
    stepRaidBattleRules(world, simDt, registry, prng);
  }

  const alphaAlive = world.units.some(
    (u) => u.team === 'ALPHA' && u.isAlive && !u.isMinion
  );
  const omegaAlive = world.units.some(
    (u) => u.team === 'OMEGA' && u.isAlive && !u.isMinion
  );

  // Stage 2-B Hook 5: Multi-Wave Gauntlet (Marineford 3-Wave transition)
  if (alphaAlive && !omegaAlive && world.currentWaveIndex + 1 < world.gauntletWaves.length) {
    if (spawnNextGauntletWave(world, registry)) {
      return;
    }
  }

  // Stage 2-A Special Win Conditions (SURVIVE_TIME & REACH_EXTRACTION)
  if (alphaAlive) {
    switch (world.winCondition.kind) {
      case 'DEFEAT_ALL':
        break;
      case 'SURVIVE_TIME': {
        if (world.elapsedSec >= world.winCondition.targetSec) {
          world.winnerTeam = 'ALPHA';
          world.winReasonText =
            world.winCondition.escapeCutsceneText ??
            `생존 목표 ${world.winCondition.targetSec}초 달성! 안전하게 탈출했습니다!`;
          world.combatLog.push(`[특수 미션 승리] ${world.winReasonText}`);
          return;
        }
        break;
      }
      case 'REACH_EXTRACTION': {
        if (world.elapsedSec >= world.winCondition.unlockAfterSec) {
          world.extractionZoneActive = true;
          const ez = world.winCondition.extractionZone;
          const reached = world.units.some(
            (u) =>
              u.team === 'ALPHA' &&
              u.isAlive &&
              u.isOnField &&
              distVec(u.pos, ez) <= ez.radiusPx + u.radiusPx
          );
          if (reached) {
            world.winnerTeam = 'ALPHA';
            world.winReasonText =
              world.winCondition.escapeCutsceneText ??
              '탈출 구역 도달 성공! 항구로 무사히 출항했습니다!';
            world.combatLog.push(`[탈출 미션 승리] ${world.winReasonText}`);
            return;
          }
        }
        break;
      }
      default:
        assertNever(world.winCondition, 'Unhandled BattleWinCondition kind');
    }
  }

  if (!alphaAlive && !omegaAlive) {
    world.winnerTeam = 'DRAW';
    world.combatLog.push(`[전투 종료] 무승부 (DRAW)`);
  } else if (!omegaAlive) {
    world.winnerTeam = 'ALPHA';
    world.combatLog.push(`[전투 종료] ALPHA 팀 승리!`);
  } else if (!alphaAlive) {
    world.winnerTeam = 'OMEGA';
    world.combatLog.push(`[전투 종료] OMEGA 팀 승리!`);
  }
}
