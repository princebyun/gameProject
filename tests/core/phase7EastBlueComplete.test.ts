import { describe, expect, it } from 'vitest';
import { BATTLE_CALC_VERSION, FIXED_DT } from '../../src/core/constants';
import {
  createBattleWorld,
  spawnMeleeArcInstance,
  stepBattleWorld
} from '../../src/core/combat/battleWorld';
import {
  computeDamage,
  getUnitCurrentStat
} from '../../src/core/combat/damageCalc';
import { spawnFieldMove } from '../../src/core/combat/fieldEngine';
import { SeededPRNG } from '../../src/core/math/prng';
import { createBattleWorldFromContext } from '../../src/core/rpg/battleBridge';
import { createInitialCampaignState } from '../../src/core/rpg/campaignState';
import {
  computeCrewRoleBonuses,
  executeShipboardCooking
} from '../../src/core/rpg/crewAndBountyEngine';
import { completeEpisode } from '../../src/core/rpg/episodeEngine';
import {
  tryTransitionThroughSeaGate,
  validateSeaGateAccess
} from '../../src/core/rpg/seaGateValidator';
import {
  canEnterOnlineBattle,
  evaluateAndStampAntiCheat,
  validateSaveLegality
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
  isPlayer: boolean = true
): UnitBuildConfig {
  const def = defaultDataRegistry.units[speciesId];
  return {
    instanceId,
    speciesId,
    level: 50,
    ivs: { hp: 20, atk: 20, def: 20, spAtk: 20, spDef: 20, spd: 20 },
    evs: { hp: 80, atk: 80, def: 80, spAtk: 80, spDef: 80, spd: 80 },
    moveIds: [...def.defaultMoves],
    equipmentId: def.defaultEquipmentId,
    traitId: def.traitId,
    formId: def.defaultFormId,
    isPlayerControlled: isPlayer,
    aiLevel: 3
  };
}

describe('Phase 7 (Stage 2-A): East Blue Complete Edition', () => {
  it('1. BATTLE_CALC_VERSION is 0.5.0, CURRENT_SAVE_VERSION is current, and all 7 new units + 5 East Blue islands exist', () => {
    expect(BATTLE_CALC_VERSION).toBe('0.5.0');
    expect(CURRENT_SAVE_VERSION).toBe(4);

    const newUnits = [
      'buggy',
      'don_krieg',
      'arlong',
      'smoker',
      'sanji',
      'usopp',
      'nami'
    ];
    for (const id of newUnits) {
      const def = defaultDataRegistry.units[id];
      expect(def, `Unit ${id} should exist`).toBeDefined();
      expect(def.defaultMoves.length).toBe(4);
    }

    const ebIslands = defaultRpgDataRegistry.seaZones.east_blue.islands;
    expect(ebIslands.length).toBe(5);
    expect(ebIslands.every((i) => i.requiredForNextZone && i.playableInVerticalSlice)).toBe(true);
    expect(ebIslands.map((i) => i.islandId)).toEqual([
      'foosha_shells',
      'orange_town',
      'baratie',
      'arlong_park',
      'loguetown'
    ]);
  });

  it('2. Buggy slashImmunity: SLASH deals 0 damage + split VFX + 2-hit HUD swap hint (even with Haki), while BLUNT deals normal damage', () => {
    const cfg: BattleWorldConfig = {
      seed: 7001,
      arenaSizeKey: 'medium',
      mode: '1V1',
      teamAlpha: [makeBuild('zoro', 'a_zoro', true), makeBuild('luffy', 'a_luffy', true)],
      teamOmega: [makeBuild('buggy', 'o_buggy', true)]
    };
    const world = createBattleWorld(cfg, defaultDataRegistry);
    const prng = new SeededPRNG(7001);
    const zoro = world.units[0];
    const luffy = world.units[1];
    const buggy = world.units[2];

    // Direct SLASH hit with Armament Haki -> 0 damage + SLASH_SPLIT
    const slashRes = computeDamage(
      100,
      zoro,
      buggy,
      'PHYSICAL',
      'SLASH',
      world,
      defaultDataRegistry,
      { hasArmamentHaki: true }
    );
    expect(slashRes.nullified).toBe(true);
    expect(slashRes.nullifyReason).toBe('SLASH_SPLIT');
    expect(slashRes.damage).toBe(0);
    expect(buggy.baraSplitTimer).toBeGreaterThan(0);

    // 2 melee SLASH misses by Zoro trigger the tactical HUD swap hint
    zoro.pos = { x: 400, y: 230 };
    buggy.pos = { x: 440, y: 230 };
    const initialBuggyHp = buggy.hp;
    for (let attempt = 0; attempt < 2; attempt++) {
      spawnMeleeArcInstance(
        zoro,
        defaultDataRegistry.moves['move_zoro_oni_giri'],
        { x: 1, y: 0 },
        world,
        defaultDataRegistry
      );
      stepBattleWorld(world, [], defaultDataRegistry, prng, FIXED_DT);
      world.meleeArcs = [];
      world.hitstopTimer = 0;
    }
    expect(buggy.hp).toBe(initialBuggyHp);
    expect(world.slashImmuneMissCount).toBeGreaterThanOrEqual(2);
    expect(world.tacticalHintText).toContain('참격이 통하지 않는다');

    // BLUNT attack from Luffy deals normal damage
    const bluntRes = computeDamage(
      100,
      luffy,
      buggy,
      'PHYSICAL',
      'BLUNT',
      world,
      defaultDataRegistry
    );
    expect(bluntRes.nullified).toBe(false);
    expect(bluntRes.damage).toBeGreaterThan(20);
  });

  it('3. Smoker SURVIVE_TIME (45s): surviving 45s wins regardless of Smoker HP and emits Dragon gale storm escape cutscene', () => {
    const loguetownEnc =
      defaultRpgDataRegistry.islands['loguetown'].encounters[0];
    expect(loguetownEnc.winCondition?.kind).toBe('SURVIVE_TIME');

    const cfg: BattleWorldConfig = {
      seed: 7002,
      arenaSizeKey: 'large',
      mode: '1V1',
      teamAlpha: [makeBuild('luffy', 'a_luffy', true)],
      teamOmega: [makeBuild('smoker', 'o_smoker', true)],
      winCondition: loguetownEnc.winCondition
    };
    const world = createBattleWorld(cfg, defaultDataRegistry);
    const prng = new SeededPRNG(7002);
    const luffy = world.units[0];
    const smoker = world.units[1];

    // Keep them spaced apart while simulating 45.1s of survival
    luffy.pos = { x: 150, y: 300 };
    smoker.pos = { x: 950, y: 300 };

    // Step 45.1 seconds (2706 ticks at 60Hz)
    for (let t = 0; t < 2710 && world.winnerTeam === null; t++) {
      stepBattleWorld(world, [], defaultDataRegistry, prng, FIXED_DT);
    }

    expect(world.winnerTeam).toBe('ALPHA');
    expect(smoker.hp).toBe(smoker.maxHp); // Won without defeating Logia Smoker!
    expect(world.winReasonText).toContain('드래곤');
  });

  it('4. Arlong Park waterTerrain & Don Krieg MH5 poisonCloud: Fishman gains +20% ATK/SPD & SEA bonus, Fruit user gets -30% slow, MH5 expands', () => {
    const arlongEnc =
      defaultRpgDataRegistry.islands['arlong_park'].encounters[0];
    const cfg: BattleWorldConfig = {
      seed: 7003,
      arenaSizeKey: 'large',
      mode: '1V1',
      teamAlpha: [makeBuild('luffy', 'a_luffy', true)],
      teamOmega: [makeBuild('arlong', 'o_arlong', true)],
      arenaTerrain: arlongEnc.arenaTerrain
    };
    const world = createBattleWorld(cfg, defaultDataRegistry);
    const prng = new SeededPRNG(7003);
    const luffy = world.units[0];
    const arlong = world.units[1];

    // Measure stats outside water first
    luffy.pos = { x: 100, y: 100 };
    arlong.pos = { x: 900, y: 100 };
    stepBattleWorld(world, [], defaultDataRegistry, prng, FIXED_DT);
    expect(luffy.inWaterTerrain).toBe(false);
    expect(arlong.inWaterTerrain).toBe(false);
    const luffyLandSpd = getUnitCurrentStat(luffy, 'spd', world, defaultDataRegistry);
    const arlongLandAtk = getUnitCurrentStat(arlong, 'atk', world, defaultDataRegistry);
    const arlongLandSpd = getUnitCurrentStat(arlong, 'spd', world, defaultDataRegistry);

    // Move both into Arlong Park waterZone[0] ({ x: 420, y: 210, radiusPx: 110 })
    const wz = world.waterZones[0];
    luffy.pos = { x: wz.x - 20, y: wz.y };
    arlong.pos = { x: wz.x + 20, y: wz.y };
    stepBattleWorld(world, [], defaultDataRegistry, prng, FIXED_DT);

    expect(luffy.inWaterTerrain).toBe(true);
    expect(arlong.inWaterTerrain).toBe(true);
    expect(getUnitCurrentStat(luffy, 'spd', world, defaultDataRegistry)).toBeLessThanOrEqual(
      Math.round(luffyLandSpd * 0.72)
    );
    expect(getUnitCurrentStat(arlong, 'atk', world, defaultDataRegistry)).toBeGreaterThanOrEqual(
      Math.round(arlongLandAtk * 1.18)
    );
    expect(getUnitCurrentStat(arlong, 'spd', world, defaultDataRegistry)).toBeGreaterThanOrEqual(
      Math.round(arlongLandSpd * 1.18)
    );

    // Don Krieg expanding poison cloud (MH5)
    const cfgKrieg: BattleWorldConfig = {
      seed: 7004,
      arenaSizeKey: 'medium',
      mode: '1V1',
      teamAlpha: [makeBuild('luffy', 'a_luffy', true)],
      teamOmega: [makeBuild('don_krieg', 'o_krieg', true)]
    };
    const worldKrieg = createBattleWorld(cfgKrieg, defaultDataRegistry);
    const krieg = worldKrieg.units[1];
    spawnFieldMove(
      krieg,
      defaultDataRegistry.moves['move_krieg_mh5_poison'],
      { x: 420, y: 230 },
      worldKrieg,
      defaultDataRegistry
    );
    const startRadius = worldKrieg.fieldZones[0].radiusPx;
    for (let t = 0; t < 120; t++) {
      stepBattleWorld(worldKrieg, [], defaultDataRegistry, prng, FIXED_DT);
    }
    expect(worldKrieg.fieldZones[0].isPoisonCloud).toBe(true);
    expect(worldKrieg.fieldZones[0].radiusPx).toBeGreaterThan(startRadius + 25);
  });

  it('5. Sanji (COOK Shipboard Cooking) & Nami (NAVIGATOR +20% Sailing Speed & 50% Storm Resistance) role passives', () => {
    const campaign = createInitialCampaignState(
      defaultRpgDataRegistry,
      defaultDataRegistry
    );

    // Clear Baratie -> recruits Sanji & Usopp, unlocks COOK
    completeEpisode(campaign, 'ep_baratie', defaultRpgDataRegistry, defaultDataRegistry);
    expect(campaign.recruitedUnitIds).toContain('sanji');
    expect(campaign.recruitedUnitIds).toContain('usopp');
    expect(campaign.unlockedCrewRoles).toContain('COOK');

    // Injure Luffy to 40% HP and invoke Sanji's Shipboard Cooking (free, heals +50% HP + +10% next-battle ATK)
    campaign.partyHpRatios['luffy'] = 0.4;
    const berriesBefore = campaign.berries;
    const cookRes = executeShipboardCooking(campaign);
    expect(cookRes.success).toBe(true);
    expect(campaign.berries).toBe(berriesBefore);
    expect(campaign.partyHpRatios['luffy']).toBeCloseTo(0.9, 2);
    expect(campaign.nextBattleMealAtkBuffRatio).toBe(0.1);

    // Entering battle consumes nextBattleMealAtkBuffRatio and applies buff to party
    const battleWorld = createBattleWorldFromContext(
      campaign,
      {
        sourceScene: 'ISLAND_EPISODE',
        zoneId: 'east_blue',
        islandId: 'arlong_park',
        encounterId: 'enc_test',
        encounterName: 'Test',
        isBoss: false,
        arenaSizeKey: 'medium',
        mode: '1V1',
        enemyUnitIds: ['arlong'],
        aiLevel: 2,
        bountyReward: 0,
        berryReward: 0,
        trainingPointReward: 0,
        setsFlagOnVictory: null,
        completesEpisodeIdOnVictory: null
      },
      defaultRpgDataRegistry,
      defaultDataRegistry
    );
    expect(
      battleWorld.units[0].statBuffs.some((b) => b.id === 'cook_shipboard_meal_atk')
    ).toBe(true);

    // Clear Arlong Park -> recruits Nami, unlocks NAVIGATOR & awards 30M Bounty Wanted Poster
    completeEpisode(campaign, 'ep_arlong_park', defaultRpgDataRegistry, defaultDataRegistry);
    expect(campaign.recruitedUnitIds).toContain('nami');
    expect(campaign.latestWantedPoster?.newBounty).toBeGreaterThanOrEqual(30000000);

    const bonuses = computeCrewRoleBonuses(campaign, defaultRpgDataRegistry);
    expect(bonuses.sailingSpeedMult).toBeCloseTo(1.2, 2);
    expect(bonuses.stormResistanceRatio).toBeCloseTo(0.5, 2);
    expect(bonuses.revealsHiddenChests).toBe(true);
  });

  it('6. Reverse Mountain 5-Episode Gate & SaveMigrator v1 -> v2 Legacy Zone Compatibility', () => {
    const campaign = createInitialCampaignState(
      defaultRpgDataRegistry,
      defaultDataRegistry
    );

    // Complete 4 of 5 East Blue episodes (missing ep_loguetown)
    for (const epId of [
      'ep_east_blue_start',
      'ep_orange_town',
      'ep_baratie',
      'ep_arlong_park'
    ]) {
      completeEpisode(campaign, epId, defaultRpgDataRegistry, defaultDataRegistry);
    }

    const gate4of5 = validateSeaGateAccess(
      campaign,
      'east_blue',
      defaultRpgDataRegistry
    );
    expect(gate4of5.allowed).toBe(false);
    expect(gate4of5.missingEpisodes.length).toBe(1);
    expect(gate4of5.missingEpisodes[0].episodeId).toBe('ep_loguetown');

    // Complete 5th episode (ep_loguetown) -> Reverse Mountain opens!
    completeEpisode(campaign, 'ep_loguetown', defaultRpgDataRegistry, defaultDataRegistry);
    const gate5of5 = tryTransitionThroughSeaGate(campaign, defaultRpgDataRegistry);
    expect(gate5of5.allowed).toBe(true);
    expect(campaign.currentZoneId).toBe('grand_line');

    // SaveMigrator v1 -> v2: Legacy v1 save already in Grand Line with only ep_east_blue_start
    const legacyCampaign = createInitialCampaignState(
      defaultRpgDataRegistry,
      defaultDataRegistry
    );
    completeEpisode(
      legacyCampaign,
      'ep_east_blue_start',
      defaultRpgDataRegistry,
      defaultDataRegistry
    );
    legacyCampaign.currentZoneId = 'grand_line';

    const v1Save = serializeCampaignToSaveEnvelope(
      legacyCampaign,
      'slot_1',
      500,
      '2026-11-19T12:00:00.000Z',
      DEFAULT_GLOBAL_SETTINGS,
      null,
      defaultRpgDataRegistry,
      defaultDataRegistry
    );
    // Stamp as an authentic v1 (0.2.0) save before migration
    v1Save.meta.saveVersion = 1;
    v1Save.meta.battleCalcVersion = '0.2.0';
    v1Save.payload.world.legacyZoneUnlockV1 = undefined;
    v1Save.payload.world.unlockedZones = ['east_blue', 'grand_line'];
    v1Save.meta.antiCheat = {
      isTampered: false,
      onlineEligible: true,
      violationCodes: []
    };
    v1Save.meta.integrity = computeSaveIntegrity(1, '0.2.0', v1Save.payload);

    const migrated = migrateRawSaveToCurrent(
      v1Save,
      defaultRpgDataRegistry,
      defaultDataRegistry
    );
    expect(migrated.migrated).toBe(true);
    expect(migrated.migratedFromVersion).toBe(1);
    expect(migrated.envelope.meta.saveVersion).toBe(4);
    expect(migrated.envelope.meta.battleCalcVersion).toBe('0.5.0');
    expect(migrated.envelope.payload.world.legacyZoneUnlockV1).toBe(true);

    const acLegacy = evaluateAndStampAntiCheat(
      migrated.envelope,
      defaultRpgDataRegistry,
      defaultDataRegistry
    );
    expect(acLegacy.isTampered).toBe(false);
    expect(acLegacy.onlineEligible).toBe(true);
    expect(
      canEnterOnlineBattle(
        migrated.envelope,
        defaultRpgDataRegistry,
        defaultDataRegistry
      ).allowed
    ).toBe(true);

    // Fresh v2 save WITHOUT legacyZoneUnlockV1 in grand_line with only 1/5 East Blue episodes MUST fail legality!
    const forgedV2Payload = JSON.parse(JSON.stringify(migrated.envelope.payload));
    forgedV2Payload.world.legacyZoneUnlockV1 = false;
    const legalityCheck = validateSaveLegality(
      forgedV2Payload,
      defaultRpgDataRegistry,
      defaultDataRegistry
    );
    expect(legalityCheck.codes).toContain('ILLEGAL_ZONE_ACCESS');
  });
});
