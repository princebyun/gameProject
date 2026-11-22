import { describe, expect, it } from 'vitest';
import { BATTLE_CALC_VERSION, FIXED_DT } from '../../src/core/constants';
import {
  activateBirdcage,
  createBattleWorld,
  notifyUnitHitByAttack,
  spawnMeleeArcInstance,
  spawnProjectileInstance,
  stepBattleWorld
} from '../../src/core/combat/battleWorld';
import { computeDamage, getUnitCurrentStat } from '../../src/core/combat/damageCalc';
import { SeededPRNG } from '../../src/core/math/prng';
import { createInitialCampaignState } from '../../src/core/rpg/campaignState';
import { assignCrewRole } from '../../src/core/rpg/crewAndBountyEngine';
import { completeEpisode, enterIslandEpisode } from '../../src/core/rpg/episodeEngine';
import {
  computeLogPoseNeedles,
  stepSeaSailing,
  tryActivateCoupDeBurst
} from '../../src/core/rpg/sailingPhysics';
import {
  canEnterOnlineBattle,
  evaluateAndStampAntiCheat
} from '../../src/core/save/antiCheat';
import { migrateRawSaveToCurrent } from '../../src/core/save/migrator';
import { CURRENT_SAVE_VERSION } from '../../src/core/save/schema';
import {
  DEFAULT_GLOBAL_SETTINGS,
  serializeCampaignToSaveEnvelope
} from '../../src/core/save/serializer';
import { computeSaveIntegrity } from '../../src/core/save/sha256';
import type { BattleWorldConfig, UnitBuildConfig } from '../../src/core/types/battleState';
import { defaultDataRegistry } from '../../src/data/dataRegistry';
import { defaultRpgDataRegistry } from '../../src/data/rpgDataRegistry';

function makeBuild(
  speciesId: string,
  instanceId: string,
  isPlayer: boolean = false
): UnitBuildConfig {
  const def = defaultDataRegistry.units[speciesId];
  if (!def) throw new Error(`Missing unit species: ${speciesId}`);
  return {
    instanceId,
    speciesId,
    level: 50,
    ivs: { hp: 20, atk: 20, def: 20, spAtk: 20, spDef: 20, spd: 20 },
    evs: { hp: 0, atk: 0, def: 0, spAtk: 0, spDef: 0, spd: 0 },
    moveIds: [...def.defaultMoves],
    equipmentId: def.defaultEquipmentId,
    traitId: def.traitId,
    formId: def.defaultFormId,
    isPlayerControlled: isPlayer,
    aiLevel: 4
  };
}

const ALL_PRE_NW_EPS = [
  'ep_east_blue_start',
  'ep_orange_town',
  'ep_baratie',
  'ep_arlong_park',
  'ep_loguetown',
  'ep_drum_kingdom',
  'ep_alabasta',
  'ep_skypiea',
  'ep_water_seven',
  'ep_thriller_bark',
  'ep_marineford'
];

describe('Phase 9 (Stage 2-C): New World Mid-Sea Expansion — 3 Hooks, 4 Units, 6 New World Islands (17 Total), Helmsman & Save v4', () => {
  it('1. BATTLE_CALC_VERSION is 0.5.0, CURRENT_SAVE_VERSION is 4, 4 new units & 17 total episode islands exist', () => {
    expect(BATTLE_CALC_VERSION).toBe('0.6.0');
    expect(CURRENT_SAVE_VERSION).toBe(5);

    for (const id of ['hody_jones', 'doflamingo', 'katakuri', 'jinbe']) {
      const def = defaultDataRegistry.units[id];
      expect(def, `Unit ${id} must exist`).toBeDefined();
      if (!def) throw new Error(`Unit ${id} must exist`);
      expect(def.defaultMoves.length).toBe(4);
      for (const mId of def.defaultMoves) {
        expect(defaultDataRegistry.moves[mId], `Move ${mId} must exist`).toBeDefined();
      }
    }

    const totalIslands =
      defaultRpgDataRegistry.seaZones.east_blue.islands.filter((i) => !i.endgameMode).length +
      defaultRpgDataRegistry.seaZones.grand_line.islands.filter((i) => !i.endgameMode).length +
      defaultRpgDataRegistry.seaZones.new_world.islands.filter((i) => !i.endgameMode).length;
    expect(totalIslands).toBe(17);
    expect(defaultRpgDataRegistry.seaZones.new_world.islands.map((i) => i.islandId)).toEqual([
      'fishman_island',
      'dressrosa',
      'totto_land',
      'wano_onigashima',
      'egghead',
      'elbaf'
    ]);
  });

  it('2. Hook 1 (Doflamingo shrinkingArena Birdcage): activates <=65% HP, shrinks arena, deals SLASH + center knockback on boundary touch, collapses on KO', () => {
    const cfg: BattleWorldConfig = {
      seed: 9001,
      arenaSizeKey: 'medium',
      mode: '1V1',
      teamAlpha: [makeBuild('luffy', 'a_luffy', true)],
      teamOmega: [makeBuild('doflamingo', 'o_doffy', true)]
    };
    const world = createBattleWorld(cfg, defaultDataRegistry);
    const prng = new SeededPRNG(9001);
    const luffy = world.units[0];
    const doffy = world.units[1];
    if (!luffy || !doffy) throw new Error('Missing luffy or doflamingo');

    // Drop Doflamingo to 60% HP -> triggers Birdcage!
    doffy.hp = Math.round(doffy.maxHp * 0.6);
    notifyUnitHitByAttack(luffy, doffy, 50, false, world, defaultDataRegistry);
    expect(world.birdcage.active).toBe(true);
    expect(world.birdcage.shrinkScale).toBe(1.0);

    // Step 2 seconds (120 ticks) -> Birdcage shrinks noticeably
    for (let t = 0; t < 120; t++) {
      stepBattleWorld(world, [], defaultDataRegistry, prng, FIXED_DT);
    }
    expect(world.birdcage.shrinkScale).toBeLessThan(0.96);

    // Push Luffy onto the left Birdcage boundary -> receives SLASH damage & inward (+x) knockback
    luffy.pos = { x: 10, y: world.arenaHeight * 0.5 };
    luffy.iframeTimer = 0;
    const hpBeforeCage = luffy.hp;
    for (let t = 0; t < 35; t++) {
      stepBattleWorld(world, [], defaultDataRegistry, prng, FIXED_DT);
    }
    expect(luffy.hp).toBeLessThan(hpBeforeCage);
    expect(luffy.knockbackVel.x).toBeGreaterThan(0);

    // KO Doflamingo -> Birdcage collapses immediately!
    doffy.hp = 0;
    stepBattleWorld(world, [], defaultDataRegistry, prng, FIXED_DT);
    expect(world.birdcage.active).toBe(false);
    expect(world.birdcage.shrinkScale).toBe(1.0);

    // Ensure activateBirdcage export works directly too
    expect(typeof activateBirdcage).toBe('function');
  });

  it('3. Hook 2 (Katakuri futureSightCounter): evades & counters single/repeated attacks when focus >= 50, breaks for 5s (+20% dmg) on Just Dodge / Obs Lv3', () => {
    const cfg: BattleWorldConfig = {
      seed: 9002,
      arenaSizeKey: 'medium',
      mode: '1V1',
      teamAlpha: [makeBuild('luffy', 'a_luffy', true)],
      teamOmega: [makeBuild('katakuri', 'o_kata', true)]
    };
    const world = createBattleWorld(cfg, defaultDataRegistry);
    const prng = new SeededPRNG(9002);
    const luffy = world.units[0];
    const kata = world.units[1];
    const bulletStringMove = defaultDataRegistry.moves['move_doffy_bullet_string'];
    const pistolMove = defaultDataRegistry.moves['move_luffy_pistol'];
    if (!luffy || !kata || !bulletStringMove || !pistolMove) {
      throw new Error('Missing Katakuri test units or moves');
    }

    // Give Luffy Observation Lv1 (cannot naturally pierce Katakuri Future Sight)
    luffy.haki = { armament: 2, observation: 1, conqueror: 1 };
    luffy.pos = { x: 350, y: 270 };
    kata.pos = { x: 420, y: 270 };
    expect(kata.foresightFocus).toBe(100);

    // Single linear projectile hits Katakuri -> FORESIGHT_EVADE (0 dmg + counter melee spawned!)
    const proj = spawnProjectileInstance(
      luffy,
      bulletStringMove,
      { x: 1, y: 0 },
      world,
      defaultDataRegistry
    );
    proj.pos = { x: kata.pos.x - 5, y: kata.pos.y };
    const kataHpBefore = kata.hp;
    stepBattleWorld(world, [], defaultDataRegistry, prng, FIXED_DT);
    expect(kata.hp).toBe(kataHpBefore);
    expect(kata.mochiMorphTimer).toBeGreaterThan(0);
    expect(kata.foresightFocus).toBeLessThan(100);
    expect(world.meleeArcs.some((a) => a.ownerUnitId === kata.instanceId)).toBe(true);

    // Now Counterplay: clear hitstop & counter arc, Luffy triggers Just Dodge buff -> hits Katakuri -> 5s Focus Break (+20% incoming dmg)!
    world.hitstopTimer = 0;
    world.meleeArcs = [];
    luffy.justDodgeBuffTimer = 2.0;
    luffy.pos = { x: kata.pos.x - 24, y: kata.pos.y };
    spawnMeleeArcInstance(
      luffy,
      pistolMove,
      { x: 1, y: 0 },
      world,
      defaultDataRegistry
    );
    stepBattleWorld(world, [], defaultDataRegistry, prng, FIXED_DT);
    expect(kata.foresightFocus).toBe(0);
    expect(kata.foresightBreakTimer).toBeGreaterThan(4.5);

    // During Focus Break, single attacks connect normally AND deal +20% amplified damage
    const dmgBroken = computeDamage(
      100,
      luffy,
      kata,
      'PHYSICAL',
      'BLUNT',
      world,
      defaultDataRegistry,
      { hasArmamentHaki: true, isSingleLinear: true }
    );
    expect(dmgBroken.nullified).toBe(false);
    kata.foresightBreakTimer = 0;
    kata.foresightFocus = 0;
    const dmgNormal = computeDamage(
      100,
      luffy,
      kata,
      'PHYSICAL',
      'BLUNT',
      world,
      defaultDataRegistry,
      { hasArmamentHaki: true, isSingleLinear: true }
    );
    expect(dmgBroken.damage).toBeGreaterThan(Math.round(dmgNormal.damage * 1.15));
  });

  it('4. Hook 3 (Hody Jones energySteroidOverdrive): HP <= 50% triggers +35% ATK/SPD/fire-rate & +15% incoming damage', () => {
    const cfg: BattleWorldConfig = {
      seed: 9003,
      arenaSizeKey: 'medium',
      mode: '1V1',
      teamAlpha: [makeBuild('jinbe', 'a_jinbe', true)],
      teamOmega: [makeBuild('hody_jones', 'o_hody', true)]
    };
    const world = createBattleWorld(cfg, defaultDataRegistry);
    const jinbe = world.units[0];
    const hody = world.units[1];
    if (!jinbe || !hody) throw new Error('Missing jinbe or hody');

    const atkBefore = getUnitCurrentStat(hody, 'atk', world, defaultDataRegistry);
    const spdBefore = getUnitCurrentStat(hody, 'spd', world, defaultDataRegistry);
    const dmgTakenBefore = computeDamage(
      100,
      jinbe,
      hody,
      'PHYSICAL',
      'BLUNT',
      world,
      defaultDataRegistry,
      { hasArmamentHaki: true }
    ).damage;

    // Drop Hody to 45% HP -> Energy Steroid Overdrive activates!
    hody.hp = Math.round(hody.maxHp * 0.45);
    notifyUnitHitByAttack(jinbe, hody, 60, false, world, defaultDataRegistry);
    expect(hody.steroidOverdriveActive).toBe(true);

    const atkAfter = getUnitCurrentStat(hody, 'atk', world, defaultDataRegistry);
    const spdAfter = getUnitCurrentStat(hody, 'spd', world, defaultDataRegistry);
    const dmgTakenAfter = computeDamage(
      100,
      jinbe,
      hody,
      'PHYSICAL',
      'BLUNT',
      world,
      defaultDataRegistry,
      { hasArmamentHaki: true }
    ).damage;

    expect(atkAfter).toBeGreaterThan(Math.round(atkBefore * 1.3));
    expect(spdAfter).toBeGreaterThan(Math.round(spdBefore * 1.3));
    expect(dmgTakenAfter).toBeGreaterThan(Math.round(dmgTakenBefore * 1.1));
  });

  it('5. Jinbe HELMSMAN Role (+35% ship turn speed, -30% Coup de Burst CD), 10 Straw Hats, Totto Land Road Poneglyph & Obs Lv3, Elbaf Gating', () => {
    const state = createInitialCampaignState(
      defaultRpgDataRegistry,
      defaultDataRegistry
    );

    // Clear East Blue + Grand Line -> unlock Thousand Sunny & enter New World
    for (const epId of ALL_PRE_NW_EPS) {
      completeEpisode(state, epId, defaultRpgDataRegistry, defaultDataRegistry);
    }
    state.currentZoneId = 'new_world';

    // Measure Thousand Sunny turn rate & Coup de Burst cooldown WITHOUT Jinbe Helmsman
    state.ship.headingRad = 0;
    stepSeaSailing(
      state,
      { moveVec: { x: 0, y: 1 }, coupDeBurstPressed: false, dockOrInteractPressed: false },
      0.1,
      defaultRpgDataRegistry
    );
    const turnWithoutJinbe = state.ship.headingRad;

    tryActivateCoupDeBurst(state, defaultRpgDataRegistry);
    const burstCdWithoutJinbe = state.ship.coupDeBurstCooldownTimer;
    state.ship.coupDeBurstCooldownTimer = 0;
    state.ship.coupDeBurstActiveTimer = 0;

    // Clear Fishman Island -> recruits Jinbe & unlocks HELMSMAN role -> completes 10 Straw Hats!
    completeEpisode(state, 'ep_fishman_island', defaultRpgDataRegistry, defaultDataRegistry);
    expect(state.recruitedUnitIds).toContain('jinbe');
    assignCrewRole(state, 'HELMSMAN', 'jinbe', defaultRpgDataRegistry);

    const strawHats = [
      'luffy',
      'zoro',
      'nami',
      'usopp',
      'sanji',
      'chopper',
      'robin',
      'franky',
      'brook',
      'jinbe'
    ];
    for (const sh of strawHats) {
      expect(state.recruitedUnitIds, `Straw Hat ${sh} should be recruited`).toContain(sh);
    }

    // Measure Thousand Sunny turn rate & Coup de Burst cooldown WITH Jinbe Helmsman
    state.ship.headingRad = 0;
    stepSeaSailing(
      state,
      { moveVec: { x: 0, y: 1 }, coupDeBurstPressed: false, dockOrInteractPressed: false },
      0.1,
      defaultRpgDataRegistry
    );
    const turnWithJinbe = state.ship.headingRad;
    expect(turnWithJinbe).toBeCloseTo(turnWithoutJinbe * 1.35, 3);

    tryActivateCoupDeBurst(state, defaultRpgDataRegistry);
    const burstCdWithJinbe = state.ship.coupDeBurstCooldownTimer;
    expect(burstCdWithJinbe).toBeCloseTo(burstCdWithoutJinbe * 0.7, 2);

    // New World 3-needle Log Pose recommends next 3 incomplete islands (Dressrosa, Totto Land, Wano)
    const needles = computeLogPoseNeedles(state, defaultRpgDataRegistry);
    expect(needles.length).toBe(3);
    expect(needles[0]?.targetName).toContain('드레스로자');

    // Clear Totto Land -> Road Poneglyph + Luffy Observation Lv3 (Future Sight)!
    state.unitHakiOverrides['luffy'] = { armament: 2, observation: 1, conqueror: 2 };
    const pgBefore = state.roadPoneglyphCount;
    completeEpisode(state, 'ep_totto_land', defaultRpgDataRegistry, defaultDataRegistry);
    expect(state.roadPoneglyphCount).toBe(pgBefore + 1);
    expect(state.unitHakiOverrides['luffy'].observation).toBe(3);

    // Elbaf requires ep_egghead before docking
    const dockElbafBlocked = enterIslandEpisode(state, 'elbaf', defaultRpgDataRegistry);
    expect(dockElbafBlocked.allowed).toBe(false);
    completeEpisode(state, 'ep_egghead', defaultRpgDataRegistry, defaultDataRegistry);
    const dockElbafAllowed = enterIslandEpisode(state, 'elbaf', defaultRpgDataRegistry);
    expect(dockElbafAllowed.allowed).toBe(true);
  });

  it('6. SaveMigrator v3 -> v4 initializes HELMSMAN safely & preserves legacy v3 Elbaf unlock with onlineEligible: true', () => {
    const state = createInitialCampaignState(
      defaultRpgDataRegistry,
      defaultDataRegistry
    );
    for (const epId of [...ALL_PRE_NW_EPS, 'ep_wano', 'ep_elbaf']) {
      completeEpisode(state, epId, defaultRpgDataRegistry, defaultDataRegistry);
    }
    state.currentZoneId = 'new_world';

    const rawEnv = serializeCampaignToSaveEnvelope(
      state,
      'slot_1',
      3200,
      '2026-11-19T16:40:00.000Z',
      DEFAULT_GLOBAL_SETTINGS,
      null,
      defaultRpgDataRegistry,
      defaultDataRegistry
    );

    // Construct an authentic clean v3 / 0.4.0 save that completed ep_elbaf without ep_egghead
    const authenticV3 = JSON.parse(JSON.stringify(rawEnv));
    authenticV3.meta.saveVersion = 3;
    authenticV3.meta.battleCalcVersion = '0.4.0';
    authenticV3.meta.antiCheat = {
      isTampered: false,
      onlineEligible: true,
      violationCodes: []
    };
    delete authenticV3.payload.world.legacyElbafUnlockV3;
    delete authenticV3.payload.crew.crewRoles.HELMSMAN;
    authenticV3.meta.integrity = computeSaveIntegrity(3, '0.4.0', authenticV3.payload);

    const migrated = migrateRawSaveToCurrent(
      authenticV3,
      defaultRpgDataRegistry,
      defaultDataRegistry
    );
    expect(migrated.migrated).toBe(true);
    expect(migrated.migratedFromVersion).toBe(3);
    expect(migrated.envelope.meta.saveVersion).toBe(5);
    expect(migrated.envelope.meta.battleCalcVersion).toBe('0.6.0');
    expect(migrated.envelope.payload.world.legacyElbafUnlockV3).toBe(true);
    expect('HELMSMAN' in migrated.envelope.payload.crew.crewRoles).toBe(true);

    const acRes = evaluateAndStampAntiCheat(
      migrated.envelope,
      defaultRpgDataRegistry,
      defaultDataRegistry
    );
    expect(acRes.isTampered).toBe(false);
    expect(acRes.onlineEligible).toBe(true);
    expect(
      canEnterOnlineBattle(
        migrated.envelope,
        defaultRpgDataRegistry,
        defaultDataRegistry
      ).allowed
    ).toBe(true);
  });
});
