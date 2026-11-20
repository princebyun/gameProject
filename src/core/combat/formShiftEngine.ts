import { triggerBattleCutin } from '../battle/tagCombo';
import type { FormDefinition, GameDataRegistry, StatBlock } from '../types/dataSchemas';
import type { BattleWorldState, MoveSlotRuntime, UnitRuntimeState } from '../types/battleState';
import { isUnitStaggered } from './statusEngine';
import { triggerTraitHook } from './traitHooks';

function applyStatMultipliersFromBase(
  baseStats: StatBlock,
  mults: Partial<StatBlock>
): StatBlock {
  return {
    hp: baseStats.hp,
    atk: Math.round(baseStats.atk * (mults.atk ?? 1.0)),
    def: Math.round(baseStats.def * (mults.def ?? 1.0)),
    spAtk: Math.round(baseStats.spAtk * (mults.spAtk ?? 1.0)),
    spDef: Math.round(baseStats.spDef * (mults.spDef ?? 1.0)),
    spd: Math.round(baseStats.spd * (mults.spd ?? 1.0))
  };
}

function buildMoveSlotsFromIds(
  moveIds: string[],
  registry: GameDataRegistry
): MoveSlotRuntime[] {
  const slots: MoveSlotRuntime[] = [];
  for (const mId of moveIds) {
    const mDef = registry.moves[mId];
    if (!mDef) continue;
    slots.push({
      moveId: mDef.id,
      charges: mDef.maxCharges,
      maxCharges: mDef.maxCharges,
      chargeRechargeTimer: 0,
      cooldownTimer: 0
    });
  }
  return slots;
}

export function canActivateFormShift(
  unit: UnitRuntimeState,
  registry: GameDataRegistry,
  targetFormId?: string
): { allowed: boolean; reason?: string } {
  if (!unit.isAlive || !unit.isOnField) {
    return { allowed: false, reason: '유닛이 전장에 없습니다.' };
  }
  if (unit.fruitNullifyTimer > 0 && unit.fruitType !== 'NONE') {
    return {
      allowed: false,
      reason: `어둠 능력 봉인 중입니다 (${unit.fruitNullifyTimer.toFixed(1)}s)`
    };
  }
  if (unit.exhaustionTimer > 0) {
    return {
      allowed: false,
      reason: `각성 탈진 상태입니다 (${unit.exhaustionTimer.toFixed(1)}s)`
    };
  }
  if (isUnitStaggered(unit) || unit.clashLockId !== null) {
    return { allowed: false, reason: '행동불가 또는 힘겨루기 중입니다.' };
  }

  const formId = targetFormId ?? unit.awakenedFormId ?? unit.configuredFormId;
  const formDef = registry.forms[formId];
  if (!formDef) {
    return { allowed: false, reason: '설정된 각성 폼이 없습니다.' };
  }

  if (formDef.formCategory !== 'ZOAN_STANCE' && unit.hasUsedFormShift) {
    return { allowed: false, reason: '이번 전투에서 이미 각성/오버드라이브를 사용했습니다.' };
  }

  if (formDef.kind === 'AWAKENING' && formDef.requiredEquipmentId) {
    const eq = registry.equipment[unit.equipmentId];
    if (unit.equipmentId !== formDef.requiredEquipmentId && !eq?.enablesAwakening) {
      return {
        allowed: false,
        reason: `필요 장비 미착용 (${formDef.requiredEquipmentId})`
      };
    }
  }

  return { allowed: true };
}

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
    // If unit has no Zoan stances, fall back to normal Awakening/Overdrive
    const res = activateFormShift(unit, world, registry);
    return {
      shifted: res.activated,
      newStanceRole: unit.currentStanceRole,
      activeFormId: unit.activeFormId
    };
  }

  unit.stanceCooldownTimer = 0.8;

  // Cycle index: -1 (BASE) -> 0 -> 1 -> ... -> -1 (BASE)
  const nextIndex =
    unit.stanceIndex + 1 >= unit.stanceFormIds.length ? -1 : unit.stanceIndex + 1;
  unit.stanceIndex = nextIndex;

  if (nextIndex === -1) {
    // Revert to BASE human form
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
  const formDef = registry.forms[stanceFormId];
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

function applyFormTransformToUnit(
  unit: UnitRuntimeState,
  formDef: FormDefinition,
  world: BattleWorldState,
  registry: GameDataRegistry,
  markAwakeningUsed: boolean
): number {
  if (markAwakeningUsed) {
    unit.hasUsedFormShift = true;
  }
  unit.activeFormId = formDef.id;
  unit.activeFormKind = formDef.kind;
  unit.currentStanceRole = formDef.stanceRole ?? unit.currentStanceRole;
  unit.visualScale = formDef.visualScale;
  unit.auraColor = formDef.auraColor;
  unit.hagoromoColor = formDef.hagoromoColor ?? null;
  unit.regenHpRatioPerSec = formDef.regenHpRatioPerSec ?? 0;
  unit.ignoreTerrainCollision = Boolean(formDef.ignoreTerrainCollision);
  unit.radiusPx = Math.round(unit.baseRadiusPx * (formDef.hitboxRadiusScale ?? 1.0));
  unit.effectiveStats = applyStatMultipliersFromBase(
    unit.baseComputedStats,
    formDef.statMultipliers
  );

  if (formDef.overrideMoveIds && formDef.overrideMoveIds.length > 0) {
    const nextSlots = buildMoveSlotsFromIds(formDef.overrideMoveIds, registry);
    if (nextSlots.length > 0) {
      unit.moveSlots = nextSlots;
    }
  }

  // Type C or Gear 5 / Persistent Magma & Ice Environment Field activation
  if (formDef.environmentFieldKind) {
    const dur = formDef.durationSec ?? 16.0;
    world.environmentField = {
      kind: formDef.environmentFieldKind,
      ownerUnitId: unit.instanceId,
      team: unit.team,
      remainingSec: dur
    };
    if (formDef.environmentFieldKind === 'MAGMA_HAZARD_ZONE') {
      world.persistentZones.magmaActive = true;
      world.persistentZones.magmaOwnerId = unit.instanceId;
      world.persistentZones.magmaTeam = unit.team;
      if (world.persistentZones.iceActive) {
        world.persistentZones.splitActive = true;
        world.floatingTexts.push({
          id: `ft_punksplit_${world.tick}`,
          pos: { x: world.arenaWidth * 0.5, y: 90 },
          text: '🔥❄ 마그마 & 빙결 아레나 반반 분할!',
          color: '#fb923c',
          elapsedSec: 0,
          durationSec: 1.8,
          scale: 1.35
        });
        world.combatLog.push(
          '[영구 환경 각성 충돌] 대분화 지대와 아이스 에이지가 동시 발동하여 아레나가 좌(마그마)/우(빙결)로 분할됨!'
        );
      }
    } else if (formDef.environmentFieldKind === 'ICE_AGE_ZONE') {
      world.persistentZones.iceActive = true;
      world.persistentZones.iceOwnerId = unit.instanceId;
      world.persistentZones.iceTeam = unit.team;
      if (world.persistentZones.magmaActive) {
        world.persistentZones.splitActive = true;
        world.floatingTexts.push({
          id: `ft_punksplit_${world.tick}`,
          pos: { x: world.arenaWidth * 0.5, y: 90 },
          text: '🔥❄ 마그마 & 빙결 아레나 반반 분할!',
          color: '#38bdf8',
          elapsedSec: 0,
          durationSec: 1.8,
          scale: 1.35
        });
        world.combatLog.push(
          '[영구 환경 각성 충돌] 아이스 에이지와 대분화 지대가 동시 발동하여 아레나가 좌(마그마)/우(빙결)로 분할됨!'
        );
      }
    } else if (formDef.environmentFieldKind === 'STRING_AWAKENING_FIELD') {
      const trait = registry.traits[unit.traitId];
      if (!world.birdcage.active) {
        world.birdcage = {
          active: true,
          ownerUnitId: unit.instanceId,
          shrinkScale: 1.0,
          minScaleRatio: trait?.shrinkingArena?.minScaleRatio ?? 0.45,
          shrinkRatePerSec: trait?.shrinkingArena?.shrinkRatePerSec ?? 0.025,
          boundarySlashDamage: trait?.shrinkingArena?.boundarySlashDamage ?? 18,
          boundaryKnockbackSpeed: trait?.shrinkingArena?.boundaryKnockbackSpeed ?? 220,
          tickTimer: 0
        };
        world.floatingTexts.push({
          id: `ft_birdcage_${world.tick}`,
          pos: { x: world.arenaWidth * 0.5, y: 88 },
          text: '🕸 새장(BIRDCAGE) 전개! 아레나가 축소됩니다!',
          color: '#f43f5e',
          elapsedSec: 0,
          durationSec: 1.8,
          scale: 1.35
        });
        world.combatLog.push(
          `[새장 전개] ${unit.name} 실 각성과 함께 점진 축소 아레나 [새장] 전개!`
        );
      }
    }
    world.combatLog.push(
      `[환경 각성 필드] ${formDef.environmentFieldKind} 전개 (${dur}초)`
    );
  }
  unit.shadowsAsgardDamageTaken = 0;

  let healAmount = 0;
  const healRatio =
    formDef.healRatioOnActivate !== undefined
      ? formDef.healRatioOnActivate
      : formDef.formCategory === 'ZOAN_STANCE'
        ? 0
        : registry.balance.formShift.awakeningHealRatio;

  if (healRatio > 0) {
    healAmount = Math.round(unit.maxHp * healRatio);
    unit.hp = Math.min(unit.maxHp, unit.hp + healAmount);
  }

  if (formDef.newElement) {
    unit.element = formDef.newElement;
  }
  if (formDef.newTraitId) {
    unit.traitId = formDef.newTraitId;
    triggerTraitHook('onEnterField', unit, {}, world, registry);
  }

  if (formDef.kind === 'OVERDRIVE') {
    unit.overdriveTimeRemainingSec =
      formDef.durationSec ?? registry.balance.formShift.overdriveDefaultDurationSec;
    unit.overdriveUsesRemaining =
      formDef.maxSkillUses ?? registry.balance.formShift.overdriveDefaultMaxUses;
  }

  world.floatingTexts.push({
    id: `ft_form_${world.tick}_${unit.instanceId}`,
    pos: { x: unit.pos.x, y: unit.pos.y - 36 },
    text:
      healAmount > 0
        ? `${formDef.name}! +${healAmount} HP`
        : `${formDef.name}!`,
    color: formDef.auraColor,
    elapsedSec: 0,
    durationSec: 1.2,
    scale: 1.25
  });

  world.vfxEvents.push({
    id: `vfx_form_${world.tick}_${unit.instanceId}`,
    kind: 'FORM_BURST',
    pos: { x: unit.pos.x, y: unit.pos.y },
    color: formDef.auraColor,
    radiusPx: 64,
    elapsedSec: 0,
    durationSec: 0.55
  });

  world.screenFlashTimer = 0.14;
  world.screenFlashColor = formDef.auraColor;

  return healAmount;
}

/**
 * Type B & C: Devil Fruit Awakening / Overdrive Activation
 */
export function activateFormShift(
  unit: UnitRuntimeState,
  world: BattleWorldState,
  registry: GameDataRegistry,
  explicitFormId?: string
): { activated: boolean; healAmount: number } {
  const targetId = explicitFormId ?? unit.awakenedFormId ?? unit.configuredFormId;
  const check = canActivateFormShift(unit, registry, targetId);
  if (!check.allowed) {
    return { activated: false, healAmount: 0 };
  }

  const formDef = registry.forms[targetId];
  const isStanceOnly = formDef.formCategory === 'ZOAN_STANCE';
  const healAmount = applyFormTransformToUnit(
    unit,
    formDef,
    world,
    registry,
    !isStanceOnly
  );

  if (formDef.kind === 'OVERDRIVE') {
    world.combatLog.push(
      `[오버드라이브/각성] ${unit.name} -> ${formDef.name} (${unit.overdriveTimeRemainingSec}초 / +${healAmount} HP)`
    );
  } else {
    world.combatLog.push(
      `[각성/변신] ${unit.name} -> ${formDef.name} 발동! (+${healAmount} HP)`
    );
  }

  if (!isStanceOnly && world.tick > 0 && world.mode !== 'AI_VS_AI' && unit.isPlayerControlled) {
    triggerBattleCutin(world, {
      kind: 'AWAKENING',
      team: unit.team,
      primaryUnit: unit,
      title: formDef.name,
      subtitle: `${unit.name} · ${formDef.kind === 'OVERDRIVE' ? 'AWAKENING OVERDRIVE' : 'AWAKENED FORM'}`,
      primaryColor: formDef.auraColor || '#facc15',
      secondaryColor: formDef.hagoromoColor === 'white' ? '#f8fafc' : '#f97316',
      portraitEmotion: 'determined'
    });
  }

  return { activated: true, healAmount };
}

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

  if (
    world.environmentField.ownerUnitId === unit.instanceId
  ) {
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

  // Awakened Zoan continuous passive HP regeneration
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
