import type { BattleWorldState, UnitRuntimeState } from '../types/battleState';
import type { GameDataRegistry } from '../types/dataSchemas';

export {
  activateFormShift,
  applyFormTransformToUnit,
  canActivateFormShift
} from './formActivationSystem';
export { cycleZoanStance } from './zoanStanceSystem';

export function revertOverdriveForm(
  unit: UnitRuntimeState,
  world: BattleWorldState,
  registry: GameDataRegistry
): void {
  if (unit.activeFormKind !== 'OVERDRIVE' || !unit.activeFormId) {
    return;
  }
  const formDef = registry.forms[unit.activeFormId];
  const exhaustionSec = formDef?.exhaustionDebuffSec ?? 0;

  unit.effectiveStats = { ...unit.baseComputedStats };
  if (unit.baseMoveSlots.length > 0) {
    unit.moveSlots = unit.baseMoveSlots.map((slot) => ({ ...slot }));
  }

  if (world.environmentField.ownerUnitId === unit.instanceId) {
    world.environmentField.kind = 'NONE';
    world.environmentField.ownerUnitId = null;
    world.environmentField.remainingSec = 0;
  }

  unit.activeFormId = null;
  unit.activeFormKind = null;
  unit.currentStanceRole = 'BASE';
  unit.stanceIndex = -1;
  unit.hagoromoColor = null;
  unit.regenHpRatioPerSec = 0;
  unit.ignoreTerrainCollision = false;
  unit.radiusPx = unit.baseRadiusPx;
  unit.overdriveTimeRemainingSec = 0;
  unit.overdriveUsesRemaining = 0;
  unit.visualScale = 1.0;
  unit.auraColor = null;

  if (exhaustionSec > 0) {
    unit.exhaustionTimer = exhaustionSec;
    world.floatingTexts.push({
      id: `ft_exhaust_${world.tick}_${unit.instanceId}`,
      pos: { x: unit.pos.x, y: unit.pos.y - 30 },
      text: `EXHAUSTED (${exhaustionSec.toFixed(0)}s)`,
      color: '#94a3b8',
      elapsedSec: 0,
      durationSec: 1.1,
      scale: 1.1
    });
    world.combatLog.push(
      `[각성 탈진] ${unit.name} 기어 5 종료 -> ${exhaustionSec}초간 탈진(이동속도 저하 및 각성 잠금)`
    );
  } else {
    world.floatingTexts.push({
      id: `ft_od_end_${world.tick}_${unit.instanceId}`,
      pos: { x: unit.pos.x, y: unit.pos.y - 28 },
      text: 'OVERDRIVE END',
      color: '#cbd5e1',
      elapsedSec: 0,
      durationSec: 0.9,
      scale: 1.0
    });
    world.combatLog.push(`[오버드라이브 종료] ${unit.name} 일반 폼으로 복귀`);
  }
}

export function consumeOverdriveSkillUse(
  unit: UnitRuntimeState,
  world: BattleWorldState,
  registry: GameDataRegistry
): void {
  if (unit.activeFormKind !== 'OVERDRIVE') return;
  unit.overdriveUsesRemaining = Math.max(0, unit.overdriveUsesRemaining - 1);
  if (unit.overdriveUsesRemaining <= 0) {
    revertOverdriveForm(unit, world, registry);
  }
}

export function forceRevertAllFormsForNullification(
  unit: UnitRuntimeState,
  world: BattleWorldState,
  registry: GameDataRegistry
): boolean {
  if (!unit.activeFormId && unit.currentStanceRole === 'BASE') {
    return false;
  }
  const prevName = unit.activeFormId
    ? (registry.forms[unit.activeFormId]?.name ?? unit.activeFormId)
    : unit.currentStanceRole;

  unit.effectiveStats = { ...unit.baseComputedStats };
  if (unit.baseMoveSlots.length > 0) {
    unit.moveSlots = unit.baseMoveSlots.map((slot) => ({ ...slot }));
  }
  unit.activeFormId = null;
  unit.activeFormKind = null;
  unit.currentStanceRole = 'BASE';
  unit.stanceIndex = -1;
  unit.hagoromoColor = null;
  unit.regenHpRatioPerSec = 0;
  unit.ignoreTerrainCollision = false;
  unit.radiusPx = unit.baseRadiusPx;
  unit.overdriveTimeRemainingSec = 0;
  unit.overdriveUsesRemaining = 0;
  unit.visualScale = unit.entityScale;
  unit.auraColor = null;
  unit.shadowsAsgardDamageTaken = 0;

  world.combatLog.push(
    `[열매 능력 봉인] ${unit.name}의 [${prevName}] 변신/각성이 어둠 열매로 강제 해제됨!`
  );
  return true;
}

export function forceRevertFormByDamageThreshold(
  unit: UnitRuntimeState,
  world: BattleWorldState,
  registry: GameDataRegistry
): boolean {
  if (!unit.activeFormId) return false;
  const formDef = registry.forms[unit.activeFormId];
  if (!formDef?.damageThresholdRevertRatio) return false;
  if (unit.shadowsAsgardDamageTaken < unit.maxHp * formDef.damageThresholdRevertRatio) {
    return false;
  }
  forceRevertAllFormsForNullification(unit, world, registry);
  world.floatingTexts.push({
    id: `ft_shadow_eject_${world.tick}_${unit.instanceId}`,
    pos: { x: unit.pos.x, y: unit.pos.y - 36 },
    text: '👻 그림자 토출! 아스가르드 해제!',
    color: '#c084fc',
    elapsedSec: 0,
    durationSec: 1.3,
    scale: 1.25
  });
  return true;
}

export function stepUnitFormShift(
  unit: UnitRuntimeState,
  dt: number,
  world: BattleWorldState,
  registry: GameDataRegistry
): void {
  if (unit.stanceCooldownTimer > 0) {
    unit.stanceCooldownTimer = Math.max(0, unit.stanceCooldownTimer - dt);
  }
  if (unit.exhaustionTimer > 0) {
    unit.exhaustionTimer = Math.max(0, unit.exhaustionTimer - dt);
  }
  if (unit.logiaDispersionTimer > 0) {
    unit.logiaDispersionTimer = Math.max(0, unit.logiaDispersionTimer - dt);
  }

  if (unit.regenHpRatioPerSec > 0 && unit.isAlive && unit.hp < unit.maxHp) {
    unit.regenAccumTimer += dt;
    if (unit.regenAccumTimer >= 1.0) {
      unit.regenAccumTimer -= 1.0;
      const regenAmt = Math.max(1, Math.round(unit.maxHp * unit.regenHpRatioPerSec));
      unit.hp = Math.min(unit.maxHp, unit.hp + regenAmt);
    }
  }

  if (unit.activeFormKind === 'OVERDRIVE') {
    unit.overdriveTimeRemainingSec -= dt;
    if (unit.overdriveTimeRemainingSec <= 0) {
      revertOverdriveForm(unit, world, registry);
    }
  }
}
