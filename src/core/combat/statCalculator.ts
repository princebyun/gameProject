import { clamp } from '../math/vector2';
import type { BattleWorldState, UnitBuildConfig, UnitRuntimeState } from '../types/battleState';
import type {
  AiProfileDefinition,
  BalanceConfig,
  ElementId,
  ElementsConfig,
  FormDefinition,
  GameDataRegistry,
  StatBlock,
  UnitDefinition
} from '../types/dataSchemas';

export function getElementAffinity(
  elementsConfig: ElementsConfig,
  attackElement: ElementId,
  defendElement: ElementId
): number {
  const row = elementsConfig.matrix[attackElement];
  if (!row) return 1.0;
  return row[defendElement] ?? 1.0;
}

export function computeEffectiveStats(
  unitDef: UnitDefinition,
  build: UnitBuildConfig,
  registry: GameDataRegistry,
  activeForm: FormDefinition | null = null,
  aiProfile: AiProfileDefinition | null = null
): StatBlock {
  const { balance, equipment } = registry;
  const eq = equipment[build.equipmentId];
  const lvlScale = 1 + (build.level - 1) * balance.unitPhysics.levelBaseStatScale;
  const aiMult = build.isPlayerControlled ? 1.0 : (aiProfile?.statMultiplier ?? 1.0);

  const calcOne = (key: keyof StatBlock, isHp: boolean): number => {
    const base = unitDef.baseStats[key];
    const iv = (build.ivs[key] ?? 0) * balance.unitPhysics.ivStatScale;
    const ev = (build.evs[key] ?? 0) * balance.unitPhysics.evStatScale;
    let raw = (base + iv + ev) * lvlScale;
    if (isHp) {
      raw += build.level * 4;
    }
    const eqMult = eq?.statModifiers?.[key] ?? 1.0;
    const formMult = activeForm?.statMultipliers?.[key] ?? 1.0;
    let endgameMult = 1.0;
    if (build.endgameBonuses) {
      if (isHp && build.endgameBonuses.maxHpMult) {
        endgameMult *= build.endgameBonuses.maxHpMult;
      }
      if ((key === 'atk' || key === 'spAtk') && build.endgameBonuses.atkMult) {
        endgameMult *= build.endgameBonuses.atkMult;
      }
      if (key === 'spd' && build.endgameBonuses.spdMult) {
        endgameMult *= build.endgameBonuses.spdMult;
      }
    }
    if (isHp && build.hpMultiplier && build.hpMultiplier > 0) {
      endgameMult *= build.hpMultiplier;
    }
    return Math.max(10, Math.round(raw * eqMult * formMult * aiMult * endgameMult));
  };

  return {
    hp: calcOne('hp', true),
    atk: calcOne('atk', false),
    def: calcOne('def', false),
    spAtk: calcOne('spAtk', false),
    spDef: calcOne('spDef', false),
    spd: calcOne('spd', false)
  };
}

export function getUnitCurrentStat(
  unit: UnitRuntimeState,
  statKey: keyof StatBlock,
  world: BattleWorldState,
  registry: GameDataRegistry
): number {
  let value = unit.effectiveStats[statKey];

  for (const buff of unit.statBuffs) {
    if (buff.stat === statKey && buff.remainingSec > 0) {
      value *= buff.multiplier;
    }
  }

  if ((statKey === 'atk' || statKey === 'spAtk') && unit.justDodgeBuffTimer > 0) {
    value *= 1 + registry.balance.dodge.justDodgeAttackBuffRatio;
  }

  if (
    statKey === 'spd' &&
    world.ruleReversal.kind === 'SPEED_INVERSION' &&
    world.ruleReversal.remainingSec > 0
  ) {
    const ref = registry.balance.field.speedReversalReferenceSpd;
    value = clamp(ref - value, 45, 210);
  }

  if (statKey === 'spd' && unit.activeFormKind === 'OVERDRIVE' && unit.activeFormId) {
    const formDef = registry.forms[unit.activeFormId];
    if (formDef?.moveSpeedScale) {
      value *= formDef.moveSpeedScale;
    }
  }

  if (statKey === 'spd' && unit.exhaustionTimer > 0) {
    value *= 0.55;
  }

  if (statKey === 'spd' && !unit.lunarianFlameOn) {
    const trait = registry.traits[unit.traitId];
    if (trait?.lunarianFlame?.enabled) {
      value *= trait.lunarianFlame.flameOffMoveSpeedMultiplier;
    }
  }

  if (unit.inWaterTerrain) {
    const trait = registry.traits[unit.traitId];
    if (unit.race === 'FISHMAN' || trait?.fishmanWaterBuff?.enabled) {
      const atkM = trait?.fishmanWaterBuff?.atkMult ?? 1.2;
      const spdM = trait?.fishmanWaterBuff?.spdMult ?? 1.2;
      if (statKey === 'atk' || statKey === 'spAtk') {
        value *= atkM;
      } else if (statKey === 'spd') {
        value *= spdM;
      }
    } else if (
      unit.fruitType !== 'NONE' &&
      !trait?.ignoreWaterTerrainPenalty &&
      statKey === 'spd'
    ) {
      value *= 0.7;
    }
  }

  if (statKey === 'spd' && unit.onIceHazard && unit.element !== 'ICE') {
    value *= 0.8;
  }

  if (unit.steroidOverdriveActive) {
    const trait = registry.traits[unit.traitId];
    if (trait?.energySteroidOverdrive?.enabled) {
      if (statKey === 'atk' || statKey === 'spAtk') {
        value *= trait.energySteroidOverdrive.atkMult;
      } else if (statKey === 'spd') {
        value *= trait.energySteroidOverdrive.spdMult;
      }
    }
  }

  return Math.max(1, Math.round(value));
}

export function computeBeamDynamicRange(offensiveStat: number, balance: BalanceConfig): number {
  const { minRangePx, maxRangePx, statRangeMin, statRangeMax } = balance.beam;
  const t = clamp((offensiveStat - statRangeMin) / Math.max(1, statRangeMax - statRangeMin), 0, 1);
  return Math.round(minRangePx + t * (maxRangePx - minRangePx));
}
