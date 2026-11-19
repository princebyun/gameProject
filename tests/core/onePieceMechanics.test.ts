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
  resolveMeleeVsMelee
} from '../../src/core/combat/clashResolver';
import { computeDamage, getUnitCurrentStat } from '../../src/core/combat/damageCalc';
import {
  activateFormShift,
  canActivateFormShift,
  cycleZoanStance,
  stepUnitFormShift
} from '../../src/core/combat/formShiftEngine';
import { FIXED_DT } from '../../src/core/constants';
import { SeededPRNG } from '../../src/core/math/prng';
import type { BattleWorldConfig, UnitBuildConfig } from '../../src/core/types/battleState';
import { createDefaultDataRegistry } from '../../src/data/dataRegistry';

function buildOnePieceUnit(
  instanceId: string,
  speciesId: string,
  overrides: Partial<UnitBuildConfig> = {}
): UnitBuildConfig {
  const reg = createDefaultDataRegistry();
  const u = reg.units[speciesId];
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
    isPlayerControlled: true,
    aiLevel: 4,
    ...overrides
  };
}

describe('Phase 1.5 One Piece Combat Rules, Devil Fruit Awakening & Haki Mechanics', () => {
  it('Logia Intangibility vs Armament Haki: Kizaru nullifies non-Haki attacks (0 DMG) and takes damage from Armament Haki attacks', () => {
    const registry = createDefaultDataRegistry();
    const cfg: BattleWorldConfig = {
      seed: 1001,
      arenaSizeKey: 'medium',
      mode: '1V1',
      teamAlpha: [buildOnePieceUnit('alpha_luffy', 'luffy')],
      teamOmega: [buildOnePieceUnit('omega_kizaru', 'kizaru')]
    };
    const world = createBattleWorld(cfg, registry);
    const luffy = world.units[0];
    const kizaru = world.units[1];
    kizaru.iframeTimer = 0;

    expect(kizaru.fruitType).toBe('LOGIA');

    // 1. Non-Haki Gomu Gomu no Pistol (`hasArmamentHaki: false`) -> nullified by Logia Intangibility
    const pistolMove = registry.moves['move_luffy_pistol'];
    expect(pistolMove.hasArmamentHaki).toBe(false);

    const nonHakiRes = computeDamage(
      pistolMove.basePower,
      luffy,
      kizaru,
      pistolMove.category,
      pistolMove.element,
      world,
      registry,
      { hasArmamentHaki: pistolMove.hasArmamentHaki }
    );
    expect(nonHakiRes.nullified).toBe(true);
    expect(nonHakiRes.nullifyReason).toBe('LOGIA_INTANGIBLE');
    expect(nonHakiRes.damage).toBe(0);
    expect(kizaru.logiaDispersionTimer).toBeGreaterThan(0);

    // 2. Armament Haki Red Hawk (`hasArmamentHaki: true`) -> hits Logia tangible body!
    const redHawkMove = registry.moves['move_luffy_red_hawk'];
    expect(redHawkMove.hasArmamentHaki).toBe(true);

    const hakiRes = computeDamage(
      redHawkMove.basePower,
      luffy,
      kizaru,
      redHawkMove.category,
      redHawkMove.element,
      world,
      registry,
      { hasArmamentHaki: redHawkMove.hasArmamentHaki }
    );
    expect(hakiRes.nullified).toBe(false);
    expect(hakiRes.damage).toBeGreaterThan(25);
  });

  it('Luffy Rubber Body & Gear 5: immune to LIGHTNING, reduces non-Haki BLUNT by 50%, heals 25% HP on Gear 5 with White Hagoromo, and applies 6s Exhaustion after expiry', () => {
    const registry = createDefaultDataRegistry();
    const cfg: BattleWorldConfig = {
      seed: 1002,
      arenaSizeKey: 'medium',
      mode: '1V1',
      teamAlpha: [buildOnePieceUnit('alpha_luffy', 'luffy')],
      teamOmega: [buildOnePieceUnit('omega_kaido', 'kaido')]
    };
    const world = createBattleWorld(cfg, registry);
    const luffy = world.units[0];
    const kaido = world.units[1];
    luffy.iframeTimer = 0;

    // 1. Rubber Body immunity to LIGHTNING
    const lightningRes = computeDamage(
      120,
      kaido,
      luffy,
      'SPECIAL',
      'LIGHTNING',
      world,
      registry,
      { hasArmamentHaki: false }
    );
    expect(lightningRes.nullified).toBe(true);
    expect(lightningRes.nullifyReason).toBe('ELEMENT_IMMUNE');
    expect(lightningRes.damage).toBe(0);

    // 2. Non-Haki BLUNT damage is reduced by 50% compared to Haki BLUNT
    const nonHakiBlunt = computeDamage(
      100,
      kaido,
      luffy,
      'PHYSICAL',
      'BLUNT',
      world,
      registry,
      { hasArmamentHaki: false }
    );
    const hakiBlunt = computeDamage(
      100,
      kaido,
      luffy,
      'PHYSICAL',
      'BLUNT',
      world,
      registry,
      { hasArmamentHaki: true }
    );
    expect(nonHakiBlunt.damage).toBeLessThan(hakiBlunt.damage * 0.6);

    // 3. Activate Gear 5 -> 25% Max HP heal, white Hagoromo cloud sash, RUBBER_BOUNCE_ZONE field
    luffy.maxHp = 400;
    luffy.hp = 200;
    const g5Res = activateFormShift(luffy, world, registry);
    expect(g5Res.activated).toBe(true);
    expect(g5Res.healAmount).toBe(100); // 25% of 400
    expect(luffy.hp).toBe(300);
    expect(luffy.hagoromoColor).toBe('white');
    expect(world.environmentField.kind).toBe('RUBBER_BOUNCE_ZONE');
    expect(luffy.moveSlots.some((s) => s.moveId === 'move_luffy_bajrang_gun')).toBe(true);

    // 4. Expire Gear 5 duration (18s) -> applies 6s Exhaustion debuff (speed drop + form lock)
    const normalSpd = getUnitCurrentStat(luffy, 'spd', world, registry);
    stepUnitFormShift(luffy, 18.5, world, registry);
    expect(luffy.activeFormId).toBeNull();
    expect(luffy.hagoromoColor).toBeNull();
    expect(luffy.exhaustionTimer).toBeCloseTo(6.0, 2);

    const exhaustedSpd = getUnitCurrentStat(luffy, 'spd', world, registry);
    expect(exhaustedSpd).toBeLessThan(normalSpd);
    expect(canActivateFormShift(luffy, registry).allowed).toBe(false);
  });

  it('Rob Lucci Multi-Stage Zoan Transformation: BASE -> HYBRID -> AWAKENED (Black Hagoromo) with stat and moveset replacement', () => {
    const registry = createDefaultDataRegistry();
    const cfg: BattleWorldConfig = {
      seed: 1003,
      arenaSizeKey: 'medium',
      mode: '1V1',
      teamAlpha: [buildOnePieceUnit('alpha_lucci', 'lucci')],
      teamOmega: [buildOnePieceUnit('omega_zoro', 'zoro')]
    };
    const world = createBattleWorld(cfg, registry);
    const lucci = world.units[0];

    // Stage 1: BASE Human Form
    expect(lucci.currentStanceRole).toBe('BASE');
    expect(lucci.activeFormId).toBeNull();
    const baseAtk = lucci.effectiveStats.atk;
    const baseSpd = lucci.effectiveStats.spd;
    expect(lucci.moveSlots.some((s) => s.moveId === 'move_lucci_rokuogan')).toBe(true);

    // Stage 2: Cycle Zoan Stance -> HYBRID Form (form_lucci_hybrid)
    const shiftHybrid = cycleZoanStance(lucci, world, registry);
    expect(shiftHybrid.shifted).toBe(true);
    expect(lucci.currentStanceRole).toBe('HYBRID');
    expect(lucci.activeFormId).toBe('form_lucci_hybrid');
    const hybridAtk = lucci.effectiveStats.atk;
    const hybridSpd = lucci.effectiveStats.spd;
    expect(hybridAtk).toBeGreaterThan(baseAtk);
    expect(hybridSpd).toBeGreaterThan(baseSpd);
    expect(
      lucci.moveSlots.some((s) => s.moveId === 'move_lucci_saidairin_rokuogan')
    ).toBe(true);

    // Stage 3: Activate Devil Fruit Awakening -> AWAKENED Leopard (form_lucci_awakened)
    lucci.maxHp = 320;
    lucci.hp = 160;
    const awakeRes = activateFormShift(lucci, world, registry);
    expect(awakeRes.activated).toBe(true);
    expect(awakeRes.healAmount).toBe(80); // 25% of 320
    expect(lucci.hp).toBe(240);
    expect(lucci.activeFormId).toBe('form_lucci_awakened');
    expect(lucci.hagoromoColor).toBe('black');
    expect(lucci.effectiveStats.atk).toBeGreaterThan(hybridAtk);
    expect(lucci.effectiveStats.spd).toBeGreaterThan(hybridSpd);
    expect(
      lucci.moveSlots.some((s) => s.moveId === 'move_lucci_shugan_madara')
    ).toBe(true);
  });

  it('Kaido Boro Breath vs Kizaru Laser Beam clash & Luffy vs Kaido Conqueror Haki Sky-Split melee clash', () => {
    const registry = createDefaultDataRegistry();
    const cfg: BattleWorldConfig = {
      seed: 1004,
      arenaSizeKey: 'large',
      mode: '2V2',
      teamAlpha: [
        buildOnePieceUnit('alpha_kaido', 'kaido'),
        buildOnePieceUnit('alpha_luffy', 'luffy')
      ],
      teamOmega: [
        buildOnePieceUnit('omega_kizaru', 'kizaru'),
        buildOnePieceUnit('omega_kaido', 'kaido')
      ]
    };
    const world = createBattleWorld(cfg, registry);
    const prng = new SeededPRNG(1004);

    const kaidoA = world.units[0];
    const luffyA = world.units[1];
    const kizaruB = world.units[2];
    const kaidoB = world.units[3];

    // Shift Kaido A into HYBRID -> BEAST (Giant Azure Dragon)
    cycleZoanStance(kaidoA, world, registry);
    expect(kaidoA.currentStanceRole).toBe('HYBRID');
    kaidoA.stanceCooldownTimer = 0;
    cycleZoanStance(kaidoA, world, registry);
    expect(kaidoA.currentStanceRole).toBe('BEAST');
    expect(kaidoA.ignoreTerrainCollision).toBe(true);
    expect(kaidoA.moveSlots.some((s) => s.moveId === 'move_kaido_boro_breath')).toBe(true);

    // 1. Beam vs Beam Clash: Kaido Boro Breath vs Kizaru Laser Beam
    kaidoA.pos = { x: 220, y: 180 };
    kaidoA.aimDir = { x: 1, y: 0 };
    kizaruB.pos = { x: 620, y: 180 };
    kizaruB.aimDir = { x: -1, y: 0 };

    spawnBeamInstance(
      kaidoA,
      registry.moves['move_kaido_boro_breath'],
      { x: 1, y: 0 },
      world,
      registry
    );
    spawnBeamInstance(
      kizaruB,
      registry.moves['move_kizaru_laser_beam'],
      { x: -1, y: 0 },
      world,
      registry
    );

    resolveBeamVsBeam(world, FIXED_DT, registry);
    expect(world.beamClashes.length).toBe(1);

    // 2. Conqueror's Haki Lv3 Non-Contact Melee Clash: Luffy Bajrang Gun vs Kaido Ragnaraku
    luffyA.pos = { x: 400, y: 420 };
    luffyA.aimDir = { x: 1, y: 0 };
    kaidoB.pos = { x: 520, y: 420 };
    kaidoB.aimDir = { x: -1, y: 0 };

    spawnMeleeArcInstance(
      luffyA,
      registry.moves['move_luffy_bajrang_gun'],
      { x: 1, y: 0 },
      world,
      registry
    );
    spawnMeleeArcInstance(
      kaidoB,
      registry.moves['move_kaido_ragnaraku'],
      { x: -1, y: 0 },
      world,
      registry
    );

    resolveMeleeVsMelee(world, FIXED_DT, registry);
    expect(world.meleeClashes.length).toBe(1);
    expect(world.meleeClashes[0].isConquerorSkySplit).toBe(true);
    expect(
      world.vfxEvents.some((v) => v.kind === 'SKY_SPLIT_SHOCKWAVE')
    ).toBe(true);

    // Clear clash lock & hitstop to verify Gear 5 Rubber Bounce floor reflection
    luffyA.clashLockId = null;
    world.hitstopTimer = 0;
    world.meleeArcs = [];
    activateFormShift(luffyA, world, registry);
    expect(world.environmentField.kind).toBe('RUBBER_BOUNCE_ZONE');
    const enemyProj = spawnProjectileInstance(
      kizaruB,
      registry.moves['move_kizaru_yasakani'],
      { x: -1, y: 0 },
      world,
      registry
    );
    enemyProj.pos = { x: luffyA.pos.x + 40, y: luffyA.pos.y };
    stepBattleWorld(world, [], registry, prng, FIXED_DT);
    expect(enemyProj.bouncedByRubberFloor).toBe(true);
    expect(enemyProj.team).toBe('ALPHA');
  });

  it('runs full 6-character One Piece 2v2 match with Zoro non-fruit Sea immunity and Law ROOM / K-ROOM Shock Wille internal destruction', () => {
    const registry = createDefaultDataRegistry();
    const cfg: BattleWorldConfig = {
      seed: 1005,
      arenaSizeKey: 'large',
      mode: '2V2',
      teamAlpha: [
        buildOnePieceUnit('a_zoro', 'zoro', { isPlayerControlled: false }),
        buildOnePieceUnit('a_law', 'law', { isPlayerControlled: false }),
        buildOnePieceUnit('a_luffy', 'luffy', { isPlayerControlled: false })
      ],
      teamOmega: [
        buildOnePieceUnit('o_kaido', 'kaido', { isPlayerControlled: false }),
        buildOnePieceUnit('o_lucci', 'lucci', { isPlayerControlled: false }),
        buildOnePieceUnit('o_kizaru', 'kizaru', { isPlayerControlled: false })
      ]
    };

    const world = createBattleWorld(cfg, registry);
    const prng = new SeededPRNG(1005);

    const zoro = world.units[0];
    const law = world.units[1];
    const kaido = world.units[3];

    // Zoro is NONE (non-fruit user) -> takes no SEA bonus penalty compared to a Devil Fruit user
    const seaOnZoro = computeDamage(
      100,
      kaido,
      zoro,
      'SPECIAL',
      'SEA',
      world,
      registry,
      { hasArmamentHaki: true }
    );
    const seaOnLaw = computeDamage(
      100,
      kaido,
      law,
      'SPECIAL',
      'SEA',
      world,
      registry,
      { hasArmamentHaki: true }
    );
    expect(seaOnLaw.damage).toBeGreaterThan(seaOnZoro.damage);

    // Law activates Type C Environment Awakening: K-ROOM
    const kroomRes = activateFormShift(law, world, registry);
    expect(kroomRes.activated).toBe(true);
    expect(world.environmentField.kind).toBe('K_ROOM_FIELD');
    expect(law.moveSlots.some((s) => s.moveId === 'move_law_shock_wille')).toBe(true);

    // Run 300 ticks (5 seconds at 60 FPS) of 2v2 battle
    for (let i = 0; i < 300; i++) {
      stepBattleWorld(world, [], registry, prng, FIXED_DT);
    }
    expect(world.tick).toBe(300);
  });
});
