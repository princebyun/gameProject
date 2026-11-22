import { describe, expect, it } from 'vitest';
import {
  createBattleWorld,
  spawnProjectileInstance
} from '../../src/core/combat/battleWorld';
import { getElementAffinity } from '../../src/core/combat/damageCalc';
import { stepUnitDodge, tryExecuteDodge } from '../../src/core/combat/dodgeSystem';
import {
  activateFormShift,
  consumeOverdriveSkillUse,
  stepUnitFormShift
} from '../../src/core/combat/formShiftEngine';
import {
  applyStatus,
  isUnitStaggered,
  stepUnitStatuses
} from '../../src/core/combat/statusEngine';
import type { BattleWorldConfig, UnitBuildConfig } from '../../src/core/types/battleState';
import { createDefaultDataRegistry } from '../../src/data/dataRegistry';

function makeUnitBuild(
  instanceId: string,
  speciesId: string,
  overrides: Partial<UnitBuildConfig> = {}
): UnitBuildConfig {
  return {
    instanceId,
    speciesId,
    level: 50,
    ivs: { hp: 15, atk: 15, def: 15, spAtk: 15, spDef: 15, spd: 15 },
    evs: { hp: 0, atk: 0, def: 0, spAtk: 0, spDef: 0, spd: 0 },
    moveIds: ['move_pyro_bolt', 'move_solar_ray', 'move_aero_crescent', 'move_magma_zone'],
    equipmentId: 'eq_resonator_core',
    traitId: 'trait_solar_core',
    formId: 'form_solar_awakening',
    isPlayerControlled: true,
    aiLevel: 3,
    ...overrides
  };
}

describe('Dodge System, Element Affinity, Form Shift & Status Timers', () => {
  it('recharges stacked dodge (2 stacks, 3.2s per stack) and triggers Just Dodge with i-frames and slow-motion when dodging imminent attack', () => {
    const registry = createDefaultDataRegistry();
    const cfg: BattleWorldConfig = {
      seed: 101,
      arenaSizeKey: 'medium',
      mode: '1V1',
      teamAlpha: [makeUnitBuild('alpha_1', 'unit_ignis_vanguard')],
      teamOmega: [makeUnitBuild('omega_1', 'unit_tideweaver')]
    };
    const world = createBattleWorld(cfg, registry);
    const player = world.units[0];
    const enemy = world.units[1];
    const pyroBoltMove = registry.moves['move_pyro_bolt'];
    if (!player || !enemy || !pyroBoltMove) throw new Error('Missing units or move');

    expect(player.dodgeStacks).toBe(2);

    // Normal dodge with no incoming threat
    const res1 = tryExecuteDodge(player, { x: 0, y: 1 }, world, registry);
    expect(res1.dodged).toBe(true);
    expect(res1.justDodge).toBe(false);
    expect(player.dodgeStacks).toBe(1);
    expect(player.iframeTimer).toBeCloseTo(registry.balance.dodge.iframeSec, 4);

    // Wait out active dodge duration (0.25s)
    stepUnitDodge(player, 0.3, registry);
    expect(player.dodgeActiveTimer).toBe(0);

    // Spawn an enemy projectile right next to player to trigger Just Dodge
    const enemyProj = spawnProjectileInstance(
      enemy,
      pyroBoltMove,
      { x: -1, y: 0 },
      world,
      registry
    );
    enemyProj.pos = { x: player.pos.x + 22, y: player.pos.y };

    const res2 = tryExecuteDodge(player, { x: 0, y: -1 }, world, registry);
    expect(res2.dodged).toBe(true);
    expect(res2.justDodge).toBe(true);
    expect(player.dodgeStacks).toBe(0);
    expect(player.iframeTimer).toBeCloseTo(registry.balance.dodge.iframeSec, 4);
    expect(player.justDodgeBuffTimer).toBeCloseTo(
      registry.balance.dodge.justDodgeBuffDurationSec,
      4
    );
    expect(world.slowMoTimer).toBeCloseTo(registry.balance.dodge.justDodgeSlowMoSec, 4);

    // Recharge 1 stack after 3.2s
    stepUnitDodge(player, 3.2, registry);
    expect(player.dodgeStacks).toBe(1);

    // Recharge 2nd stack after another 3.2s
    stepUnitDodge(player, 3.2, registry);
    expect(player.dodgeStacks).toBe(2);
  });

  it('verifies Element Affinity matrix and Awakening 25% Max HP immediate recovery + Overdrive 3-use / 20s limit', () => {
    const registry = createDefaultDataRegistry();

    // Check Element Affinity multipliers
    expect(getElementAffinity(registry.elements, 'AQUA', 'PYRO')).toBeCloseTo(1.5, 3);
    expect(getElementAffinity(registry.elements, 'PYRO', 'AQUA')).toBeCloseTo(0.67, 3);
    expect(getElementAffinity(registry.elements, 'VOLT', 'AQUA')).toBeCloseTo(1.5, 3);

    const cfg: BattleWorldConfig = {
      seed: 202,
      arenaSizeKey: 'medium',
      mode: '1V1',
      teamAlpha: [
        makeUnitBuild('alpha_1', 'unit_zephyr_blade', {
          formId: 'form_solar_awakening',
          equipmentId: 'eq_resonator_core'
        })
      ],
      teamOmega: [
        makeUnitBuild('omega_1', 'unit_tideweaver', {
          formId: 'form_colossus_overdrive',
          equipmentId: 'eq_overdrive_Dynamo'
        })
      ]
    };
    const world = createBattleWorld(cfg, registry);
    const alpha = world.units[0];
    const omega = world.units[1];
    if (!alpha || !omega) throw new Error('Missing alpha/omega units');

    // Reduce alpha HP to 50% and trigger AWAKENING
    alpha.maxHp = 400;
    alpha.hp = 200;
    const baseSpAtk = alpha.effectiveStats.spAtk;

    const awakeRes = activateFormShift(alpha, world, registry);
    expect(awakeRes.activated).toBe(true);
    expect(awakeRes.healAmount).toBe(100); // 25% of 400
    expect(alpha.hp).toBe(300);
    expect(alpha.element).toBe('PYRO'); // Shifted from AERO to PYRO
    expect(alpha.effectiveStats.spAtk).toBeGreaterThan(baseSpAtk);

    // Trigger OVERDRIVE on omega -> 20s duration & 3 skill uses limit
    const odRes = activateFormShift(omega, world, registry);
    expect(odRes.activated).toBe(true);
    expect(omega.activeFormKind).toBe('OVERDRIVE');
    expect(omega.overdriveTimeRemainingSec).toBeCloseTo(20.0, 3);
    expect(omega.overdriveUsesRemaining).toBe(3);

    // Consume 3 skill uses -> should revert back to normal form automatically
    consumeOverdriveSkillUse(omega, world, registry);
    consumeOverdriveSkillUse(omega, world, registry);
    expect(omega.activeFormKind).toBe('OVERDRIVE');
    consumeOverdriveSkillUse(omega, world, registry);
    expect(omega.activeFormKind).toBeNull();
    expect(omega.overdriveTimeRemainingSec).toBe(0);

    // Also test time expiration for Overdrive
    omega.hasUsedFormShift = false;
    activateFormShift(omega, world, registry);
    expect(omega.activeFormKind).toBe('OVERDRIVE');
    stepUnitFormShift(omega, 20.1, world, registry);
    expect(omega.activeFormKind).toBeNull();
  });

  it('enforces 3s Stagger duration followed by 5s Stagger re-application immunity', () => {
    const registry = createDefaultDataRegistry();
    const cfg: BattleWorldConfig = {
      seed: 303,
      arenaSizeKey: 'medium',
      mode: '1V1',
      teamAlpha: [makeUnitBuild('alpha_1', 'unit_ignis_vanguard')],
      teamOmega: [makeUnitBuild('omega_1', 'unit_tideweaver')]
    };
    const world = createBattleWorld(cfg, registry);
    const target = world.units[1];
    if (!target) throw new Error('Missing target unit');
    target.iframeTimer = 0;

    const applied = applyStatus(target, 'STAGGER', 3.0, 'alpha_1', world, registry);
    expect(applied).toBe(true);
    expect(isUnitStaggered(target)).toBe(true);

    // Advance 3.05s -> Stagger expires and 5s immunity activates
    stepUnitStatuses(target, 3.05, registry);
    expect(isUnitStaggered(target)).toBe(false);
    expect(target.staggerImmunityTimer).toBeCloseTo(5.0, 2);

    // Attempting to apply STAGGER during the 5s immunity window must be blocked
    const reApplied = applyStatus(target, 'STAGGER', 3.0, 'alpha_1', world, registry);
    expect(reApplied).toBe(false);
    expect(isUnitStaggered(target)).toBe(false);
  });
});
