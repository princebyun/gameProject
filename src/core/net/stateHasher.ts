import type { SeededPRNG } from '../math/prng';
import { sha256Hex } from '../save/sha256';
import type { BattleWorldState } from '../types/battleState';

/**
 * Computes a deterministic 256-bit stateHash of the battle simulation at a given tick.
 * Includes unit HP, quantized positions, active form/stance, clash sessions, weather/field, and PRNG internal seed state.
 */
export function computeBattleStateHash(
  world: BattleWorldState,
  prng: SeededPRNG
): string {
  const unitParts = world.units.map((u) => {
    const px = Math.round(u.pos.x * 10);
    const py = Math.round(u.pos.y * 10);
    const ex = Math.round(u.exhaustionTimer * 100);
    const st = u.statuses.map((s) => `${s.kind}:${Math.round(s.remainingSec * 10)}`).join(',');
    return `${u.instanceId}|${u.hp}/${u.maxHp}|${px},${py}|${u.currentStanceRole}|${
      u.activeFormId ?? '-'
    }|${u.dodgeStacks}|${ex}|${st}|V:${u.venomStacks}|D:${u.isDowned ? 1 : 0}:${Math.round(
      u.downedTimer * 10
    )}:${Math.round(u.reviveProgressSec * 10)}`;
  });

  const clashPart = `BC:${world.beamClashes.length}|MC:${world.meleeClashes.length}|MG:${world.meleeBeamGuards.length}`;
  const entitiesPart = `P:${world.projectiles.length}|B:${world.beams.length}|M:${world.meleeArcs.length}|F:${world.fieldZones.length}`;
  const envPart = `W:${world.weather.id}|E:${world.environmentField.kind}|R:${world.ruleReversal.kind}`;
  const raidPart = world.raidState.active
    ? `RAID:${world.raidState.raidId}|BG:${Math.round(world.raidState.breakGauge)}|GR:${Math.round(
        world.raidState.groggyTimer * 10
      )}|DPS:${world.raidState.dpsCheck.active ? Math.round(world.raidState.dpsCheck.shieldHp) : 0}|REV:${
        world.raidState.teamRevivesRemaining
      }|TEL:${world.raidState.telegraphs.length}`
    : 'RAID:0';

  const canonicalState = [
    `T:${world.tick}`,
    `PRNG:${prng.getSeedState()}`,
    ...unitParts,
    clashPart,
    entitiesPart,
    envPart,
    raidPart
  ].join('||');

  return sha256Hex(canonicalState);
}
