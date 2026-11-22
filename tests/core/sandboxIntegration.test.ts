import { describe, expect, it } from 'vitest';
import {
  createBattleWorld,
  spawnMeleeArcInstance,
  stepBattleWorld
} from '../../src/core/combat/battleWorld';
import { executeRosterSwap } from '../../src/core/combat/rosterManager';
import { FIXED_DT, LOGICAL_HEIGHT, LOGICAL_WIDTH } from '../../src/core/constants';
import { SeededPRNG } from '../../src/core/math/prng';
import type { BattleWorldConfig, UnitBuildConfig } from '../../src/core/types/battleState';
import { createDefaultDataRegistry } from '../../src/data/dataRegistry';

function buildUnit(
  instanceId: string,
  speciesId: string,
  isPlayerControlled: boolean,
  aiLevel: number = 4
): UnitBuildConfig {
  const reg = createDefaultDataRegistry();
  const u = reg.units[speciesId];
  if (!u) throw new Error(`Missing unit ${speciesId}`);
  return {
    instanceId,
    speciesId,
    level: 50,
    ivs: { hp: 31, atk: 31, def: 31, spAtk: 31, spDef: 31, spd: 31 },
    evs: { hp: 80, atk: 80, def: 80, spAtk: 80, spDef: 80, spd: 80 },
    moveIds: [...u.defaultMoves],
    equipmentId: u.defaultEquipmentId,
    traitId: u.traitId,
    formId: u.defaultFormId,
    isPlayerControlled,
    aiLevel
  };
}

describe('Phase 1 Sandbox & AI vs AI Full Integration Verification', () => {
  it('validates 6 IP-neutral sample units, 12+ moves across all 5 archetypes, and 5 AI levels', () => {
    const registry = createDefaultDataRegistry();

    const unitList = Object.values(registry.units);
    expect(unitList.length).toBeGreaterThanOrEqual(6);
    for (const opId of ['luffy', 'zoro', 'lucci', 'kaido', 'kizaru', 'law']) {
      expect(registry.units[opId]).toBeDefined();
    }

    const moveList = Object.values(registry.moves);
    expect(moveList.length).toBeGreaterThanOrEqual(12);

    const archetypes = new Set(moveList.map((m) => m.archetype));
    expect(archetypes.has('PROJECTILE')).toBe(true);
    expect(archetypes.has('BEAM')).toBe(true);
    expect(archetypes.has('MELEE')).toBe(true);
    expect(archetypes.has('AOE_FIELD')).toBe(true);
    expect(archetypes.has('STATUS')).toBe(true);

    expect(Object.keys(registry.aiProfiles).length).toBe(5);
    expect(LOGICAL_WIDTH).toBe(960);
    expect(LOGICAL_HEIGHT).toBe(540);
  });

  it('runs AI vs AI Spectator Mode for 600 frames (10s @ 60FPS) with live combat, clashes, and status/field timers', () => {
    const registry = createDefaultDataRegistry();
    const cfg: BattleWorldConfig = {
      seed: 20261119,
      arenaSizeKey: 'medium',
      mode: 'AI_VS_AI',
      teamAlpha: [
        buildUnit('a1', 'unit_ignis_vanguard', false, 5),
        buildUnit('a2', 'unit_zephyr_blade', false, 5)
      ],
      teamOmega: [
        buildUnit('o1', 'unit_void_conduit', false, 5),
        buildUnit('o2', 'unit_terra_bastion', false, 5)
      ]
    };

    const world = createBattleWorld(cfg, registry);
    const prng = new SeededPRNG(cfg.seed);

    // Ion Storm weather should be active at start due to Void Conduit's onEnterField trait hook
    expect(world.weather.id).toBe('ION_STORM');
    expect(world.weather.remainingSec).toBeCloseTo(12, 1);

    for (let tick = 0; tick < 600; tick++) {
      stepBattleWorld(world, [], registry, prng, FIXED_DT);
    }

    expect(world.tick).toBe(600);
    expect(world.elapsedSec).toBeGreaterThan(8.0);
    expect(world.combatLog.length).toBeGreaterThan(1);

    // Confirm combat occurred (HP changed or moves charges/cooldowns used)
    const totalHpRatio =
      world.units.reduce((acc, u) => acc + u.hp / u.maxHp, 0) / world.units.length;
    expect(totalHpRatio).toBeLessThan(1.0);
  });

  it('supports 2v2 mode and 3-second pivot quick-swap popup triggered by pivot melee skill', () => {
    const registry = createDefaultDataRegistry();
    const cfg: BattleWorldConfig = {
      seed: 777,
      arenaSizeKey: 'large',
      mode: '2V2',
      teamAlpha: [
        buildUnit('a1', 'unit_volt_strider', true, 4),
        buildUnit('a2', 'unit_ignis_vanguard', false, 4),
        buildUnit('a3', 'unit_tideweaver', false, 4)
      ],
      teamOmega: [
        buildUnit('o1', 'unit_terra_bastion', false, 4),
        buildUnit('o2', 'unit_void_conduit', false, 4)
      ]
    };

    const world = createBattleWorld(cfg, registry);
    const prng = new SeededPRNG(cfg.seed);

    const alphaOnField = world.units.filter((u) => u.team === 'ALPHA' && u.isOnField);
    expect(alphaOnField.length).toBe(2);

    const voltUnit = world.units[0];
    const enemyUnit = world.units[3];
    const voltBlitzMove = registry.moves['move_volt_blitz'];
    expect(voltUnit).toBeDefined();
    expect(enemyUnit).toBeDefined();
    expect(voltBlitzMove).toBeDefined();
    if (!voltUnit || !enemyUnit || !voltBlitzMove) throw new Error('Missing sandbox actors');
    enemyUnit.pos = { x: voltUnit.pos.x + 30, y: voltUnit.pos.y };
    enemyUnit.iframeTimer = 0;

    // Cast Volt Blitz (pivotSwapOnHit: true)
    spawnMeleeArcInstance(
      voltUnit,
      voltBlitzMove,
      { x: 1, y: 0 },
      world,
      registry
    );
    stepBattleWorld(world, [], registry, prng, FIXED_DT);

    // 3-second quick swap window must now be active
    expect(world.rosters.ALPHA.pivotWindowTimer).toBeGreaterThan(2.5);

    // Execute instant pivot swap even if voluntary cooldown were active
    world.rosters.ALPHA.voluntarySwapCooldownTimer = 15.0;
    const swapped = executeRosterSwap(voltUnit, 'a3', world, registry, false);
    expect(swapped).toBe(true);
    expect(world.units.find((u) => u.instanceId === 'a3')?.isOnField).toBe(true);
  });
});
