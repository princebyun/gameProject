import type { GameDataRegistry } from '../types/dataSchemas';
import type { BattleWorldState, TeamId, UnitRuntimeState } from '../types/battleState';
import { triggerTraitHook } from './traitHooks';

export function stepTeamRosters(world: BattleWorldState, dt: number): void {
  for (const team of ['ALPHA', 'OMEGA'] as TeamId[]) {
    const roster = world.rosters[team];
    if (roster.voluntarySwapCooldownTimer > 0) {
      roster.voluntarySwapCooldownTimer = Math.max(0, roster.voluntarySwapCooldownTimer - dt);
    }
    if (roster.pivotWindowTimer > 0) {
      roster.pivotWindowTimer = Math.max(0, roster.pivotWindowTimer - dt);
      if (roster.pivotWindowTimer <= 0) {
        roster.pivotTriggeredByUnitId = null;
      }
    }
  }
}

export function openPivotSwapWindow(
  unit: UnitRuntimeState,
  world: BattleWorldState,
  registry: GameDataRegistry
): void {
  const benchHasAlive = world.units.some(
    (u) => u.team === unit.team && !u.isOnField && u.isAlive
  );
  if (!benchHasAlive) return;

  const roster = world.rosters[unit.team];
  roster.pivotWindowTimer = registry.balance.roster.pivotSelectWindowSec;
  roster.pivotTriggeredByUnitId = unit.instanceId;

  world.floatingTexts.push({
    id: `ft_pivot_${world.tick}_${unit.instanceId}`,
    pos: { x: unit.pos.x, y: unit.pos.y - 34 },
    text: `QUICK SWAP (${roster.pivotWindowTimer.toFixed(0)}s)`,
    color: '#38bdf8',
    elapsedSec: 0,
    durationSec: 1.0,
    scale: 1.1
  });
}

export function executeRosterSwap(
  outgoingUnit: UnitRuntimeState,
  incomingUnitId: string,
  world: BattleWorldState,
  registry: GameDataRegistry,
  isForcedKoReplacement: boolean = false
): boolean {
  const incoming = world.units.find(
    (u) =>
      u.instanceId === incomingUnitId &&
      u.team === outgoingUnit.team &&
      !u.isOnField &&
      u.isAlive
  );
  if (!incoming) return false;

  const roster = world.rosters[outgoingUnit.team];
  const isPivotSwap =
    roster.pivotWindowTimer > 0 && roster.pivotTriggeredByUnitId === outgoingUnit.instanceId;

  if (!isForcedKoReplacement && !isPivotSwap && roster.voluntarySwapCooldownTimer > 0) {
    return false;
  }

  // Terminate any active beam owned by outgoingUnit
  for (const beam of world.beams) {
    if (beam.ownerUnitId === outgoingUnit.instanceId) {
      beam.terminated = true;
    }
  }

  const fieldSlot = outgoingUnit.slotIndex;
  const benchSlot = incoming.slotIndex;

  outgoingUnit.isOnField = false;
  outgoingUnit.slotIndex = benchSlot;
  outgoingUnit.windupMoveId = null;
  outgoingUnit.windupTimer = 0;
  outgoingUnit.activeBeamId = null;
  outgoingUnit.clashLockId = null;
  outgoingUnit.pendingBurst = null;

  incoming.isOnField = true;
  incoming.slotIndex = fieldSlot;
  incoming.pos = { x: outgoingUnit.pos.x, y: outgoingUnit.pos.y };
  incoming.prevPos = { x: outgoingUnit.pos.x, y: outgoingUnit.pos.y };
  incoming.aimDir = { x: outgoingUnit.aimDir.x, y: outgoingUnit.aimDir.y };
  incoming.vel = { x: 0, y: 0 };
  incoming.knockbackVel = { x: 0, y: 0 };
  incoming.iframeTimer = 0.35;

  if (isPivotSwap) {
    roster.pivotWindowTimer = 0;
    roster.pivotTriggeredByUnitId = null;
  } else if (!isForcedKoReplacement) {
    roster.voluntarySwapCooldownTimer = registry.balance.roster.voluntarySwapCooldownSec;
  }

  triggerTraitHook('onEnterField', incoming, {}, world, registry);

  world.floatingTexts.push({
    id: `ft_swap_${world.tick}_${incoming.instanceId}`,
    pos: { x: incoming.pos.x, y: incoming.pos.y - 30 },
    text: `TAG IN: ${incoming.name}`,
    color: '#38bdf8',
    elapsedSec: 0,
    durationSec: 1.0,
    scale: 1.15
  });
  world.combatLog.push(`[파티 교체] ${outgoingUnit.name} <-> ${incoming.name} 투입`);

  return true;
}
