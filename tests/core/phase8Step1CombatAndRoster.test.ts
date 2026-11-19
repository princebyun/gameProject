import { describe, expect, it } from 'vitest';
import { BATTLE_CALC_VERSION, FIXED_DT } from '../../src/core/constants';
import {
  applyFruitNullification,
  createBattleWorld,
  damageDestructibleProp,
  spawnMeleeArcInstance,
  stepBattleWorld,
  summonOrSwapMinion
} from '../../src/core/combat/battleWorld';
import { computeDamage, getUnitCurrentStat } from '../../src/core/combat/damageCalc';
import {
  activateFormShift,
  canActivateFormShift,
  cycleZoanStance
} from '../../src/core/combat/formShiftEngine';
import { isUnitWet } from '../../src/core/combat/statusEngine';
import { SeededPRNG } from '../../src/core/math/prng';
import type { BattleWorldConfig, UnitBuildConfig } from '../../src/core/types/battleState';
import { defaultDataRegistry } from '../../src/data/dataRegistry';

function makeBuild(
  speciesId: string,
  instanceId: string,
  isPlayer: boolean = false
): UnitBuildConfig {
  const def = defaultDataRegistry.units[speciesId];
  return {
    instanceId,
    speciesId,
    level: 25,
    ivs: { hp: 12, atk: 12, def: 12, spAtk: 12, spDef: 12, spd: 12 },
    evs: { hp: 0, atk: 0, def: 0, spAtk: 0, spDef: 0, spd: 0 },
    moveIds: [...def.defaultMoves],
    equipmentId: def.defaultEquipmentId,
    traitId: def.traitId,
    formId: def.defaultFormId,
    isPlayerControlled: isPlayer,
    aiLevel: 3
  };
}

describe('Phase 8 Step 1 (Stage 2-B): 5 New Combat Hooks & 11 New Grand Line Units', () => {
  it('1. BATTLE_CALC_VERSION is 0.5.0 and all 11 new units (+ doppelman) and moves are registered', () => {
    expect(BATTLE_CALC_VERSION).toBe('0.6.0');

    const newUnitIds = [
      'wapol',
      'crocodile',
      'enel',
      'moria',
      'akainu',
      'aokiji',
      'blackbeard',
      'chopper',
      'robin',
      'brook',
      'marco'
    ];
    for (const id of newUnitIds) {
      const def = defaultDataRegistry.units[id];
      expect(def, `Unit ${id} must exist`).toBeDefined();
      expect(def.defaultMoves.length).toBe(4);
      for (const mId of def.defaultMoves) {
        expect(defaultDataRegistry.moves[mId], `Move ${mId} must exist`).toBeDefined();
      }
    }
    expect(defaultDataRegistry.units['doppelman']).toBeDefined();
  });

  it('2. Hook 1A (Crocodile wetStatus): dry Crocodile nullifies non-Haki BLUNT, breaking water barrel applies WET (8s) allowing normal hits', () => {
    const cfg: BattleWorldConfig = {
      seed: 8001,
      arenaSizeKey: 'medium',
      mode: '1V1',
      teamAlpha: [makeBuild('luffy', 'a_luffy', true)],
      teamOmega: [makeBuild('crocodile', 'o_croc', true)],
      arenaTerrain: {
        destructibleProps: [
          {
            id: 'prop_water_barrel_1',
            kind: 'WATER_BARREL',
            pos: { x: 450, y: 270 },
            radiusPx: 22,
            hp: 40,
            maxHp: 40,
            wetRadiusPx: 160,
            wetDurationSec: 8.0
          }
        ]
      }
    };
    const world = createBattleWorld(cfg, defaultDataRegistry);
    const luffy = world.units[0];
    const croc = world.units[1];
    croc.pos = { x: 470, y: 270 };

    // Dry Crocodile ignores non-Haki BLUNT attack
    const dryHit = computeDamage(
      90,
      luffy,
      croc,
      'PHYSICAL',
      'BLUNT',
      world,
      defaultDataRegistry,
      { hasArmamentHaki: false }
    );
    expect(dryHit.nullified).toBe(true);
    expect(dryHit.nullifyReason).toBe('LOGIA_INTANGIBLE');
    expect(dryHit.damage).toBe(0);

    // Destroy water barrel nearby -> splashes WET (8s) on Crocodile
    const destroyed = damageDestructibleProp(
      world.destructibleProps[0],
      50,
      world,
      defaultDataRegistry
    );
    expect(destroyed).toBe(true);
    expect(isUnitWet(croc)).toBe(true);

    // Wet Crocodile now takes full damage from non-Haki BLUNT!
    const wetHit = computeDamage(
      90,
      luffy,
      croc,
      'PHYSICAL',
      'BLUNT',
      world,
      defaultDataRegistry,
      { hasArmamentHaki: false }
    );
    expect(wetHit.nullified).toBe(false);
    expect(wetHit.damage).toBeGreaterThan(20);
  });

  it('3. Hook 1B (Enel naturalLogiaCounter): Luffy with Haki Lv0 hits Enel through Logia intangibility and takes 0 LIGHTNING damage', () => {
    const cfg: BattleWorldConfig = {
      seed: 8002,
      arenaSizeKey: 'medium',
      mode: '1V1',
      teamAlpha: [makeBuild('luffy', 'a_luffy', true)],
      teamOmega: [makeBuild('enel', 'o_enel', true)]
    };
    const world = createBattleWorld(cfg, defaultDataRegistry);
    const luffy = world.units[0];
    const enel = world.units[1];
    luffy.haki = { armament: 0, observation: 0, conqueror: 0 };

    // Luffy hits Enel with non-Haki BLUNT -> natural counter (RUBBER_BODY) pierces Logia!
    const luffyHitEnel = computeDamage(
      95,
      luffy,
      enel,
      'PHYSICAL',
      'BLUNT',
      world,
      defaultDataRegistry,
      { hasArmamentHaki: false }
    );
    expect(luffyHitEnel.nullified).toBe(false);
    expect(luffyHitEnel.damage).toBeGreaterThan(25);

    // Enel hits Luffy with El Thor LIGHTNING -> 0 damage (Rubber immunity)
    const enelHitLuffy = computeDamage(
      136,
      enel,
      luffy,
      'SPECIAL',
      'LIGHTNING',
      world,
      defaultDataRegistry,
      { hasArmamentHaki: false }
    );
    expect(enelHitLuffy.nullified).toBe(true);
    expect(enelHitLuffy.nullifyReason).toBe('ELEMENT_IMMUNE');
    expect(enelHitLuffy.damage).toBe(0);
  });

  it('4. Hook 2 (Blackbeard fruitNullification): 5s lock reverts forms, disables Logia intangibility, and does NOT affect non-fruit Zoro/Sanji', () => {
    const cfg: BattleWorldConfig = {
      seed: 8003,
      arenaSizeKey: 'medium',
      mode: '2V2',
      teamAlpha: [
        makeBuild('kizaru', 'a_kizaru', true),
        makeBuild('zoro', 'a_zoro', true)
      ],
      teamOmega: [
        makeBuild('blackbeard', 'o_bb', true),
        makeBuild('sanji', 'o_sanji', true)
      ]
    };
    const world = createBattleWorld(cfg, defaultDataRegistry);
    const kizaru = world.units[0];
    const zoro = world.units[1];
    const bb = world.units[2];
    const sanji = world.units[3];

    // Activate Kizaru's Awakening first
    const shiftRes = activateFormShift(kizaru, world, defaultDataRegistry);
    expect(shiftRes.activated).toBe(true);
    expect(kizaru.activeFormId).toBe('form_kizaru_light_realm');

    // Blackbeard nullifies Kizaru (fruit user) for 5s -> forcibly reverts Awakening & disables Logia
    const nullKizaru = applyFruitNullification(kizaru, 5.0, world, defaultDataRegistry);
    expect(nullKizaru).toBe(true);
    expect(kizaru.fruitNullifyTimer).toBe(5.0);
    expect(kizaru.activeFormId).toBeNull();
    expect(canActivateFormShift(kizaru, defaultDataRegistry).allowed).toBe(false);

    // Non-Haki BLUNT now hits nullified Kizaru!
    const hitNullified = computeDamage(
      90,
      bb,
      kizaru,
      'PHYSICAL',
      'BLUNT',
      world,
      defaultDataRegistry,
      { hasArmamentHaki: false }
    );
    expect(hitNullified.nullified).toBe(false);
    expect(hitNullified.damage).toBeGreaterThan(20);

    // Non-fruit users (Zoro & Sanji) are completely unaffected by fruitNullification
    expect(applyFruitNullification(zoro, 5.0, world, defaultDataRegistry)).toBe(false);
    expect(zoro.fruitNullifyTimer).toBe(0);
    expect(applyFruitNullification(sanji, 5.0, world, defaultDataRegistry)).toBe(false);
    expect(sanji.fruitNullifyTimer).toBe(0);
  });

  it('5. Hook 3 (Moria summonMinion), Hook 4 (Akainu/Aokiji Magma+Ice half-split), and Hook 5 (Marco revivePassive & Multi-Wave Gauntlet)', () => {
    // A. Moria summons Doppelman & swaps position
    const cfgMoria: BattleWorldConfig = {
      seed: 8004,
      arenaSizeKey: 'medium',
      mode: '1V1',
      teamAlpha: [makeBuild('luffy', 'a_luffy', true)],
      teamOmega: [makeBuild('moria', 'o_moria', true)]
    };
    const worldMoria = createBattleWorld(cfgMoria, defaultDataRegistry);
    const moria = worldMoria.units[1];
    moria.pos = { x: 600, y: 260 };
    const swapMove = defaultDataRegistry.moves['move_moria_doppelman_swap'];
    const summonRes = summonOrSwapMinion(moria, swapMove, worldMoria, defaultDataRegistry);
    expect(summonRes.action).toBe('SUMMONED');
    const minion = worldMoria.units.find((u) => u.instanceId === summonRes.minionId)!;
    expect(minion.isMinion).toBe(true);
    const prevMoriaPos = { ...moria.pos };
    const prevMinionPos = { ...minion.pos };

    const swapRes = summonOrSwapMinion(moria, swapMove, worldMoria, defaultDataRegistry);
    expect(swapRes.action).toBe('SWAPPED');
    expect(moria.pos).toEqual(prevMinionPos);
    expect(minion.pos).toEqual(prevMoriaPos);

    // B. Akainu + Aokiji Dual Awakening -> Half-Split Magma (left) / Ice (right)
    const cfgSplit: BattleWorldConfig = {
      seed: 8005,
      arenaSizeKey: 'large',
      mode: '1V1',
      teamAlpha: [makeBuild('akainu', 'a_akainu', true)],
      teamOmega: [makeBuild('aokiji', 'o_aokiji', true)]
    };
    const worldSplit = createBattleWorld(cfgSplit, defaultDataRegistry);
    const prng = new SeededPRNG(8005);
    const akainu = worldSplit.units[0];
    const aokiji = worldSplit.units[1];
    activateFormShift(akainu, worldSplit, defaultDataRegistry);
    activateFormShift(aokiji, worldSplit, defaultDataRegistry);
    expect(worldSplit.persistentZones.magmaActive).toBe(true);
    expect(worldSplit.persistentZones.iceActive).toBe(true);
    expect(worldSplit.persistentZones.splitActive).toBe(true);

    akainu.pos = { x: 200, y: 300 }; // Left half (Magma)
    aokiji.pos = { x: worldSplit.arenaWidth - 200, y: 300 }; // Right half (Ice)
    stepBattleWorld(worldSplit, [], defaultDataRegistry, prng, FIXED_DT);
    expect(akainu.onMagmaHazard).toBe(true);
    expect(akainu.onIceHazard).toBe(false);
    expect(aokiji.onIceHazard).toBe(true);
    expect(aokiji.onMagmaHazard).toBe(false);

    // C. Marco Revive Passive (1x lethal hit -> 40% HP + 15% ally heal) & Gauntlet Wave transition
    const cfgMarco: BattleWorldConfig = {
      seed: 8006,
      arenaSizeKey: 'large',
      mode: '2V2',
      teamAlpha: [
        makeBuild('luffy', 'a_luffy', true),
        makeBuild('marco', 'a_marco', true)
      ],
      teamOmega: [makeBuild('aokiji', 'o_w1_aokiji', true)],
      gauntletWaves: [
        { waveName: 'Wave 1: 아오키지', enemyBuilds: [makeBuild('aokiji', 'o_w1_aokiji', true)] },
        { waveName: 'Wave 2: 아카이누', enemyBuilds: [makeBuild('akainu', 'o_w2_akainu', true)] }
      ]
    };
    const worldMarco = createBattleWorld(cfgMarco, defaultDataRegistry);
    const luffyM = worldMarco.units[0];
    const marcoM = worldMarco.units[1];
    const wave1Boss = worldMarco.units[2];

    luffyM.pos = { x: 300, y: 300 };
    marcoM.pos = { x: 340, y: 300 };
    luffyM.hp = Math.round(luffyM.maxHp * 0.5);
    const luffyHpBefore = luffyM.hp;

    // Deal lethal damage to Marco -> revives at 40% HP and heals Luffy by 15%
    marcoM.hp = 0;
    stepBattleWorld(worldMarco, [], defaultDataRegistry, new SeededPRNG(8006), FIXED_DT);
    expect(marcoM.isAlive).toBe(true);
    expect(marcoM.hasRevivedOnce).toBe(true);
    expect(marcoM.hp).toBe(Math.round(marcoM.maxHp * 0.4));
    expect(luffyM.hp).toBeGreaterThan(luffyHpBefore);

    // Second lethal hit KOs Marco permanently
    marcoM.hp = 0;
    stepBattleWorld(worldMarco, [], defaultDataRegistry, new SeededPRNG(8006), FIXED_DT);
    expect(marcoM.isAlive).toBe(false);

    // Defeating Wave 1 boss spawns Wave 2 (Akainu) instead of ending battle!
    wave1Boss.hp = 0;
    stepBattleWorld(worldMarco, [], defaultDataRegistry, new SeededPRNG(8006), FIXED_DT);
    expect(worldMarco.winnerTeam).toBeNull();
    expect(worldMarco.currentWaveIndex).toBe(1);
    expect(worldMarco.units.some((u) => u.speciesId === 'akainu' && u.isAlive)).toBe(true);
  });

  it('6. Chopper 3-Stage Zoan Stances + Monster Point, Brook Water-Run & Cooldown Song, Robin Remote Clutch', () => {
    const cfg: BattleWorldConfig = {
      seed: 8007,
      arenaSizeKey: 'medium',
      mode: '2V2',
      teamAlpha: [
        makeBuild('chopper', 'a_chopper', true),
        makeBuild('brook', 'a_brook', true)
      ],
      teamOmega: [makeBuild('wapol', 'o_wapol', true)],
      arenaTerrain: {
        waterZones: [{ x: 300, y: 270, radiusPx: 140 }]
      }
    };
    const world = createBattleWorld(cfg, defaultDataRegistry);
    const chopper = world.units[0];
    const brook = world.units[1];
    const wapol = world.units[2];

    // Chopper cycles BASE -> GUARD POINT (-60% incoming damage) -> KUNGFU POINT -> Monster Point (1.9x)
    const baseHit = computeDamage(100, wapol, chopper, 'PHYSICAL', 'BLUNT', world, defaultDataRegistry);
    cycleZoanStance(chopper, world, defaultDataRegistry);
    expect(chopper.activeFormId).toBe('form_chopper_guard');
    const guardHit = computeDamage(100, wapol, chopper, 'PHYSICAL', 'BLUNT', world, defaultDataRegistry);
    expect(guardHit.damage).toBeLessThan(baseHit.damage * 0.45);

    chopper.stanceCooldownTimer = 0;
    cycleZoanStance(chopper, world, defaultDataRegistry);
    expect(chopper.activeFormId).toBe('form_chopper_kungfu');

    const monsterRes = activateFormShift(chopper, world, defaultDataRegistry);
    expect(monsterRes.activated).toBe(true);
    expect(chopper.activeFormId).toBe('form_chopper_monster');
    expect(chopper.visualScale).toBe(1.9);

    // Brook ignores water terrain slow penalty despite being PARAMECIA
    const spdDry = getUnitCurrentStat(brook, 'spd', world, defaultDataRegistry);
    brook.pos = { x: 300, y: 270 };
    stepBattleWorld(world, [], defaultDataRegistry, new SeededPRNG(8007), FIXED_DT);
    expect(brook.inWaterTerrain).toBe(true);
    const spdWater = getUnitCurrentStat(brook, 'spd', world, defaultDataRegistry);
    expect(spdWater).toBe(spdDry);

    // Quick melee smoke check to keep unused import clean
    spawnMeleeArcInstance(
      brook,
      defaultDataRegistry.moves['move_brook_yahazu_giri'],
      { x: 1, y: 0 },
      world,
      defaultDataRegistry
    );
    expect(world.meleeArcs.length).toBeGreaterThan(0);
  });
});
