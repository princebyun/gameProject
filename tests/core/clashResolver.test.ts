import { describe, expect, it } from 'vitest';
import {
  createBattleWorld,
  spawnBeamInstance,
  spawnMeleeArcInstance,
  spawnProjectileInstance,
  stepBattleWorld
} from '../../src/core/combat/battleWorld';
import {
  resolveBeamVsBeam,
  resolveMeleeVsBeam,
  resolveMeleeVsProjectile,
  resolveProjectileVsProjectile
} from '../../src/core/combat/clashResolver';
import { FIXED_DT } from '../../src/core/constants';
import { SeededPRNG } from '../../src/core/math/prng';
import type { BattleWorldConfig, UnitBuildConfig } from '../../src/core/types/battleState';
import { createDefaultDataRegistry } from '../../src/data/dataRegistry';

function makeTestBuild(
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

function make1v1World(
  alphaOverrides: Partial<UnitBuildConfig> = {},
  omegaOverrides: Partial<UnitBuildConfig> = {}
) {
  const registry = createDefaultDataRegistry();
  const cfg: BattleWorldConfig = {
    seed: 42,
    arenaSizeKey: 'medium',
    mode: '1V1',
    teamAlpha: [makeTestBuild('alpha_1', 'unit_ignis_vanguard', alphaOverrides)],
    teamOmega: [makeTestBuild('omega_1', 'unit_ignis_vanguard', omegaOverrides)]
  };
  const world = createBattleWorld(cfg, registry);
  return { world, registry, prng: new SeededPRNG(42) };
}

describe('ClashResolver — 5-Archetype Clash Physics', () => {
  it('Beam vs Beam: pushes clash point toward weaker caster and resolves in a 2.5s draw when equal', () => {
    const { world, registry } = make1v1World();
    const unitA = world.units[0];
    const unitB = world.units[1];

    unitA.pos = { x: 200, y: 230 };
    unitA.aimDir = { x: 1, y: 0 };
    unitB.pos = { x: 520, y: 230 };
    unitB.aimDir = { x: -1, y: 0 };

    // Make stats identical for draw test
    unitA.effectiveStats.spAtk = 150;
    unitB.effectiveStats.spAtk = 150;

    const beamMove = registry.moves['move_solar_ray'];
    const beamA = spawnBeamInstance(unitA, beamMove, { x: 1, y: 0 }, world, registry);
    const beamB = spawnBeamInstance(unitB, beamMove, { x: -1, y: 0 }, world, registry);

    // Step initial clash detection
    resolveBeamVsBeam(world, FIXED_DT, registry);
    expect(world.beamClashes.length).toBe(1);
    expect(world.beamClashes[0].clashRatio).toBeCloseTo(0.5, 4);

    // Run for 2.5s with equal power -> should end in a draw and terminate both beams
    const stepsForTie = Math.ceil(registry.balance.beam.clashTieTimeoutSec / FIXED_DT) + 2;
    for (let i = 0; i < stepsForTie; i++) {
      resolveBeamVsBeam(world, FIXED_DT, registry);
    }

    expect(world.beamClashes.length).toBe(0);
    expect(beamA.terminated).toBe(true);
    expect(beamB.terminated).toBe(true);

    // Now test stronger Beam A pushing the clash point toward Beam B (clashRatio > 0.5)
    const beamA2 = spawnBeamInstance(unitA, beamMove, { x: 1, y: 0 }, world, registry);
    const beamB2 = spawnBeamInstance(unitB, beamMove, { x: -1, y: 0 }, world, registry);
    beamA2.offensiveStat = 260;
    beamB2.offensiveStat = 100;

    resolveBeamVsBeam(world, FIXED_DT, registry);
    expect(world.beamClashes.length).toBe(1);
    for (let i = 0; i < 30; i++) {
      resolveBeamVsBeam(world, FIXED_DT, registry);
    }
    expect(world.beamClashes[0].clashRatio).toBeGreaterThan(0.58);

    // Test angle break when aim diverges >= 30 degrees
    beamA2.dir = { x: 0.5, y: 0.866 }; // 60 degrees away from +X axis
    resolveBeamVsBeam(world, FIXED_DT, registry);
    expect(world.beamClashes.length).toBe(0);
    expect(beamA2.clashingWithBeamId).toBeNull();
  });

  it('Melee vs Projectile: 0.6s lingering slash arc sequentially deflects burst projectiles and applies residual knockback when overpowered', () => {
    const { world, registry } = make1v1World();
    const meleeUnit = world.units[0];
    const shooterUnit = world.units[1];

    meleeUnit.pos = { x: 250, y: 230 };
    meleeUnit.aimDir = { x: 1, y: 0 };
    shooterUnit.pos = { x: 350, y: 230 };
    shooterUnit.aimDir = { x: -1, y: 0 };

    const slashMove = registry.moves['move_aero_crescent'];
    const barrageMove = registry.moves['move_aqua_barrage'];

    const arc = spawnMeleeArcInstance(meleeUnit, slashMove, { x: 1, y: 0 }, world, registry);
    expect(arc.totalLingerDurationSec).toBeGreaterThanOrEqual(0.6);

    // Advance arc to 0.45s (past normal 0.35s active swing, inside 0.6s lingering deflect window)
    arc.elapsedSec = 0.45;
    arc.currentPower = 120;
    arc.offensiveStat = 150;

    // Spawn 2 sequential burst projectiles entering the melee arc
    const p1 = spawnProjectileInstance(shooterUnit, barrageMove, { x: -1, y: 0 }, world, registry);
    p1.pos = { x: 290, y: 230 };
    p1.currentPower = 42;
    p1.offensiveStat = 100;

    const p2 = spawnProjectileInstance(shooterUnit, barrageMove, { x: -1, y: 0 }, world, registry);
    p2.pos = { x: 295, y: 230 };
    p2.currentPower = 42;
    p2.offensiveStat = 100;

    resolveMeleeVsProjectile(world, registry);
    expect(p1.destroyed).toBe(true);
    expect(p2.destroyed).toBe(true);
    expect(arc.finished).toBe(false);

    // Now fire an overpowering projectile stronger than the remaining melee arc power
    const heavyProj = spawnProjectileInstance(
      shooterUnit,
      registry.moves['move_overdrive_meteor'],
      { x: -1, y: 0 },
      world,
      registry
    );
    heavyProj.pos = { x: 285, y: 230 };
    heavyProj.currentPower = 240;
    heavyProj.offensiveStat = 220;

    const hpBefore = meleeUnit.hp;
    resolveMeleeVsProjectile(world, registry);

    expect(heavyProj.destroyed).toBe(true);
    expect(arc.finished).toBe(true);
    expect(meleeUnit.hp).toBeLessThan(hpBefore);
    // Knockback velocity applied in projectile direction (-X)
    expect(meleeUnit.knockbackVel.x).toBeLessThan(-100);
  });

  it('Melee vs Beam: guards for 0.4~0.8s taking 30% continuous damage, cuts beam and dashes forward on win, or weakens/dims beam on loss', () => {
    const { world, registry } = make1v1World();
    const meleeUnit = world.units[0];
    const beamUnit = world.units[1];

    meleeUnit.pos = { x: 260, y: 230 };
    meleeUnit.aimDir = { x: 1, y: 0 };
    beamUnit.pos = { x: 460, y: 230 };
    beamUnit.aimDir = { x: -1, y: 0 };

    const slashMove = registry.moves['move_aero_crescent'];
    const beamMove = registry.moves['move_solar_ray'];

    // Case 1: Melee is stronger -> takes 30% graze damage during guard, then severs beam and dashes forward
    const arcWin = spawnMeleeArcInstance(meleeUnit, slashMove, { x: 1, y: 0 }, world, registry);
    arcWin.currentPower = 150;
    arcWin.offensiveStat = 200;

    const beamLose = spawnBeamInstance(beamUnit, beamMove, { x: -1, y: 0 }, world, registry);
    beamLose.currentPower = 80;
    beamLose.offensiveStat = 90;

    const initialHp = meleeUnit.hp;
    const initialX = meleeUnit.pos.x;

    // Trigger guard session
    resolveMeleeVsBeam(world, FIXED_DT, registry);
    expect(world.meleeBeamGuards.length).toBe(1);
    const guardDuration = world.meleeBeamGuards[0].durationSec;
    expect(guardDuration).toBeGreaterThanOrEqual(registry.balance.melee.beamGuardMinSec);
    expect(guardDuration).toBeLessThanOrEqual(registry.balance.melee.beamGuardMaxSec);

    const steps = Math.ceil(guardDuration / FIXED_DT) + 2;
    for (let i = 0; i < steps; i++) {
      resolveMeleeVsBeam(world, FIXED_DT, registry);
    }

    // Took 30% continuous graze damage during guard
    expect(meleeUnit.hp).toBeLessThan(initialHp);
    // Beam was severed and melee unit dashed forward
    expect(beamLose.terminated).toBe(true);
    expect(meleeUnit.pos.x).toBeGreaterThan(initialX + 20);
    expect(meleeUnit.vel.x).toBeGreaterThan(200);

    // Case 2: Beam is stronger -> melee loses guard, remaining beam power is weakened and dimmed
    world.meleeArcs = [];
    world.beams = [];
    const arcLose = spawnMeleeArcInstance(meleeUnit, slashMove, { x: 1, y: 0 }, world, registry);
    arcLose.currentPower = 50;
    arcLose.offensiveStat = 70;

    const beamWin = spawnBeamInstance(beamUnit, beamMove, { x: -1, y: 0 }, world, registry);
    beamWin.currentPower = 140;
    beamWin.offensiveStat = 200;

    resolveMeleeVsBeam(world, FIXED_DT, registry);
    expect(world.meleeBeamGuards.length).toBe(1);
    for (let i = 0; i < steps; i++) {
      resolveMeleeVsBeam(world, FIXED_DT, registry);
    }

    expect(beamWin.terminated).toBe(false);
    expect(beamWin.dimmed).toBe(true);
    expect(beamWin.currentPower).toBeLessThan(140);
  });

  it('Projectile vs Projectile: respects parabolic apex bypass and residual power reduction', () => {
    const { world, registry, prng } = make1v1World();
    const uA = world.units[0];
    const uB = world.units[1];

    // Parabolic mortar in mid-flight apex should bypass ground bolt
    const mortar = spawnProjectileInstance(
      uA,
      registry.moves['move_terra_mortar'],
      { x: 1, y: 0 },
      world,
      registry
    );
    const bolt = spawnProjectileInstance(
      uB,
      registry.moves['move_pyro_bolt'],
      { x: -1, y: 0 },
      world,
      registry
    );
    mortar.pos = { x: 350, y: 230 };
    bolt.pos = { x: 350, y: 230 };
    mortar.elapsedSec = mortar.maxDurationSec * 0.5; // Apex (50% progress)

    resolveProjectileVsProjectile(world, registry);
    expect(mortar.destroyed).toBe(false);
    expect(bolt.destroyed).toBe(false);

    // Ground vs Ground with unequal power -> weaker destroyed, stronger keeps reduced residual power
    mortar.bypassGroundCollision = false;
    mortar.currentPower = 120;
    mortar.offensiveStat = 160;
    bolt.currentPower = 60;
    bolt.offensiveStat = 100;

    resolveProjectileVsProjectile(world, registry);
    expect(bolt.destroyed).toBe(true);
    expect(mortar.destroyed).toBe(false);
    expect(mortar.currentPower).toBeLessThan(120);

    // Step world to verify clean simulation tick
    stepBattleWorld(world, [], registry, prng, FIXED_DT);
  });
});
