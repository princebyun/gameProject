import type { BattleWorldState, UnitRuntimeState } from '../types/battleState';
import type { GameDataRegistry } from '../types/dataSchemas';
import {
  activateFormShift,
  applyFormTransformToUnit
} from './formActivationSystem';
import { isUnitStaggered } from './statusEngine';

/**
 * Type A: Zoan Multi-Form Stance Cycle (BASE <-> HYBRID <-> BEAST)
 */
export function cycleZoanStance(
  unit: UnitRuntimeState,
  world: BattleWorldState,
  registry: GameDataRegistry
): { shifted: boolean; newStanceRole: string; activeFormId: string | null } {
  if (
    !unit.isAlive ||
    !unit.isOnField ||
    (unit.fruitNullifyTimer > 0 && unit.fruitType !== 'NONE') ||
    unit.exhaustionTimer > 0 ||
    unit.stanceCooldownTimer > 0 ||
    isUnitStaggered(unit) ||
    unit.clashLockId !== null
  ) {
    return {
      shifted: false,
      newStanceRole: unit.currentStanceRole,
      activeFormId: unit.activeFormId
    };
  }

  if (unit.stanceFormIds.length === 0) {
    const res = activateFormShift(unit, world, registry);
    return {
      shifted: res.activated,
      newStanceRole: unit.currentStanceRole,
      activeFormId: unit.activeFormId
    };
  }

  unit.stanceCooldownTimer = 0.8;

  const nextIndex =
    unit.stanceIndex + 1 >= unit.stanceFormIds.length ? -1 : unit.stanceIndex + 1;
  unit.stanceIndex = nextIndex;

  if (nextIndex === -1) {
    unit.activeFormId = null;
    unit.activeFormKind = null;
    unit.currentStanceRole = 'BASE';
    unit.effectiveStats = { ...unit.baseComputedStats };
    unit.radiusPx = unit.baseRadiusPx;
    unit.visualScale = 1.0;
    unit.auraColor = null;
    unit.hagoromoColor = null;
    unit.regenHpRatioPerSec = 0;
    unit.ignoreTerrainCollision = false;
    if (unit.baseMoveSlots.length > 0) {
      unit.moveSlots = unit.baseMoveSlots.map((s) => ({ ...s }));
    }

    world.floatingTexts.push({
      id: `ft_zoan_base_${world.tick}_${unit.instanceId}`,
      pos: { x: unit.pos.x, y: unit.pos.y - 30 },
      text: 'ZOAN: BASE FORM',
      color: '#cbd5e1',
      elapsedSec: 0,
      durationSec: 0.9,
      scale: 1.05
    });
    world.combatLog.push(`[동물계 변신] ${unit.name} -> 인간형(BASE) 복귀`);
    return { shifted: true, newStanceRole: 'BASE', activeFormId: null };
  }

  const stanceFormId = unit.stanceFormIds[nextIndex];
  const formDef = stanceFormId ? registry.forms[stanceFormId] : undefined;
  if (!formDef) {
    return {
      shifted: false,
      newStanceRole: unit.currentStanceRole,
      activeFormId: unit.activeFormId
    };
  }

  applyFormTransformToUnit(unit, formDef, world, registry, false);
  world.combatLog.push(
    `[동물계 변신] ${unit.name} -> ${formDef.name} (${unit.currentStanceRole})`
  );

  return {
    shifted: true,
    newStanceRole: unit.currentStanceRole,
    activeFormId: unit.activeFormId
  };
}
