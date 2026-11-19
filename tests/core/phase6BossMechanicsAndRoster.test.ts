import { describe, expect, it } from 'vitest';
import { BATTLE_CALC_VERSION, FIXED_DT } from '../../src/core/constants';
import {
  createBattleWorld,
  notifyUnitHitByAttack,
  setLunarianFlameState,
  spawnBeamInstance,
  spawnMeleeArcInstance,
  spawnProjectileInstance,
  stepBattleWorld
} from '../../src/core/combat/battleWorld';
import {
  computeDamage,
  getUnitCurrentStat
} from '../../src/core/combat/damageCalc';
import { applyStatus } from '../../src/core/combat/statusEngine';
import { SeededPRNG } from '../../src/core/math/prng';
import { createInitialCampaignState } from '../../src/core/rpg/campaignState';
import { completeEpisode } from '../../src/core/rpg/episodeEngine';
import {
  canEnterOnlineBattle,
  evaluateAndStampAntiCheat,
  validateSaveLegality
} from '../../src/core/save/antiCheat';
import { migrateRawSaveToCurrent } from '../../src/core/save/migrator';
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
    aiLevel: 4
  };
}

describe('Phase 6: 7 Core Episode Bosses + Franky, 4 Boss Combat Hooks & 5-Island Integration', () => {
  it('1. BATTLE_CALC_VERSION is 0.5.0 and all 8 new units + 5 island boss sequences are registered', () => {
    expect(BATTLE_CALC_VERSION).toBe('0.6.0');

    const newUnitIds = [
      'morgan',
      'blueno',
      'kaku',
      'franky',
      'king',
      's_hawk',
      'saturn',
      'loki'
    ];
    for (const id of newUnitIds) {
      const def = defaultDataRegistry.units[id];
      expect(def, `Unit ${id} should exist`).toBeDefined();
      expect(def.defaultMoves.length).toBe(4);
      for (const mId of def.defaultMoves) {
        expect(defaultDataRegistry.moves[mId], `Move ${mId} should exist`).toBeDefined();
      }
    }

    // Verify 5-island boss encounter rosters
    expect(
      defaultRpgDataRegistry.islands['foosha_shells'].encounters.some((e) =>
        e.enemyUnitIds.includes('morgan')
      )
    ).toBe(true);
    expect(
      defaultRpgDataRegistry.islands['water_seven'].encounters.some((e) =>
        e.enemyUnitIds.includes('blueno')
      )
    ).toBe(true);
    expect(
      defaultRpgDataRegistry.islands['water_seven'].encounters.some(
        (e) => e.enemyUnitIds.includes('kaku') && e.enemyUnitIds.includes('lucci')
      )
    ).toBe(true);
    expect(
      defaultRpgDataRegistry.islands['wano_onigashima'].encounters.some((e) =>
        e.enemyUnitIds.includes('king')
      )
    ).toBe(true);
    expect(
      defaultRpgDataRegistry.islands['egghead'].encounters.some((e) =>
        e.enemyUnitIds.includes('s_hawk')
      )
    ).toBe(true);
    expect(
      defaultRpgDataRegistry.islands['egghead'].encounters.some((e) =>
        e.enemyUnitIds.includes('saturn')
      )
    ).toBe(true);
    expect(
      defaultRpgDataRegistry.islands['elbaf'].encounters.some((e) =>
        e.enemyUnitIds.includes('loki')
      )
    ).toBe(true);
  });

  it('2. Hook 1 (lunarianFlame): King & S-Hawk reduce damage by 75% + block stagger when Flame ON, gain +45% speed when Flame OFF, and auto-reignite after 5s', () => {
    const cfg: BattleWorldConfig = {
      seed: 6001,
      arenaSizeKey: 'medium',
      mode: '1V1',
      teamAlpha: [makeBuild('zoro', 'a_zoro', true)],
      teamOmega: [makeBuild('king', 'o_king', true)]
    };
    const world = createBattleWorld(cfg, defaultDataRegistry);
    const prng = new SeededPRNG(6001);
    const zoro = world.units[0];
    const king = world.units[1];

    expect(king.lunarianFlameOn).toBe(true);
    expect(world.bossIntroTimer).toBe(1.5);
    expect(world.bossIntroName).toBe(king.name);

    // Flame ON: 75% damage reduction & stagger immunity
    const dmgFlameOn = computeDamage(
      100,
      zoro,
      king,
      'PHYSICAL',
      'SLASH',
      world,
      defaultDataRegistry,
      { hasArmamentHaki: true }
    );
    const staggerRes = applyStatus(
      king,
      'STAGGER',
      3.0,
      zoro.instanceId,
      world,
      defaultDataRegistry
    );
    expect(staggerRes).toBe(false);

    const speedFlameOn = getUnitCurrentStat(king, 'spd', world, defaultDataRegistry);

    // Extinguish flame via Lunarian hook (or casting 단궁 황궁)
    setLunarianFlameState(king, false, world, defaultDataRegistry);
    expect(king.lunarianFlameOn).toBe(false);
    expect(king.lunarianReigniteTimer).toBe(5.0);

    const dmgFlameOff = computeDamage(
      100,
      zoro,
      king,
      'PHYSICAL',
      'SLASH',
      world,
      defaultDataRegistry,
      { hasArmamentHaki: true }
    );
    const speedFlameOff = getUnitCurrentStat(king, 'spd', world, defaultDataRegistry);

    // Flame OFF deals ~4x damage compared to Flame ON (0.25x vs 1.0x) and boosts speed by +45%
    expect(dmgFlameOff.damage).toBeGreaterThan(dmgFlameOn.damage * 3.2);
    expect(speedFlameOff).toBeGreaterThan(Math.round(speedFlameOn * 1.4));

    // Step 5.1s (306 ticks) -> flame auto-reignites
    for (let t = 0; t < 310; t++) {
      stepBattleWorld(world, [], defaultDataRegistry, prng, FIXED_DT);
    }
    expect(king.lunarianFlameOn).toBe(true);
    expect(king.lunarianReigniteTimer).toBe(0);
  });

  it('3. Hook 2 (superRegeneration): Saturn regenerates +3% MaxHP/sec after 1.5s idle, and Conqueror Lv3 hit suppresses regeneration for 6s', () => {
    const cfg: BattleWorldConfig = {
      seed: 6002,
      arenaSizeKey: 'large',
      mode: '1V1',
      teamAlpha: [makeBuild('luffy', 'a_luffy', true)],
      teamOmega: [makeBuild('saturn', 'o_saturn', true)]
    };
    const world = createBattleWorld(cfg, defaultDataRegistry);
    const prng = new SeededPRNG(6002);
    const luffy = world.units[0];
    const saturn = world.units[1];

    expect(saturn.entityScale).toBe(1.8);
    expect(saturn.knockbackResist).toBe(0.7);
    expect(saturn.hagoromoColor).toBe('black');

    // Reduce Saturn HP without Conqueror coating (simulate non-Conqueror attacker)
    saturn.hp = Math.round(saturn.maxHp * 0.6);
    const hpAfterNormalHit = saturn.hp;
    notifyUnitHitByAttack(undefined, saturn, 120, false, world, defaultDataRegistry);
    expect(saturn.superRegenLockoutTimer).toBe(0);

    // Step 3.0s (180 ticks): after 1.5s delay, Saturn should regenerate HP
    for (let t = 0; t < 180; t++) {
      stepBattleWorld(world, [], defaultDataRegistry, prng, FIXED_DT);
    }
    expect(saturn.hp).toBeGreaterThan(hpAfterNormalHit);

    // Now hit Saturn with Luffy's Conqueror Lv3 coating attack -> 6s regen lockout
    const hpBeforeConq = saturn.hp;
    saturn.hp = Math.max(10, hpBeforeConq - 80);
    const hpRightAfterConq = saturn.hp;
    notifyUnitHitByAttack(luffy, saturn, 80, true, world, defaultDataRegistry);
    expect(saturn.superRegenLockoutTimer).toBe(6.0);

    // Step 3.0s (180 ticks): HP must NOT regenerate while suppressed!
    for (let t = 0; t < 180; t++) {
      stepBattleWorld(world, [], defaultDataRegistry, prng, FIXED_DT);
    }
    expect(saturn.hp).toBe(hpRightAfterConq);
    expect(saturn.superRegenLockoutTimer).toBeGreaterThan(2.5);
  });

  it('4. Hook 3 (Giant Scale & Super Armor) & Sandbox Clashes: Loki 2.1x scale + 85% KB resist, Franky Radical Beam vs Kizaru Laser, Kaku Rankyaku vs Zoro Slash', () => {
    const cfgLoki: BattleWorldConfig = {
      seed: 6003,
      arenaSizeKey: 'large',
      mode: '1V1',
      teamAlpha: [makeBuild('luffy', 'a_luffy', true)],
      teamOmega: [makeBuild('loki', 'o_loki', true)]
    };
    const worldLoki = createBattleWorld(cfgLoki, defaultDataRegistry);
    const luffy = worldLoki.units[0];
    const loki = worldLoki.units[1];

    expect(loki.entityScale).toBe(2.1);
    expect(loki.knockbackResist).toBe(0.85);
    expect(loki.radiusPx).toBe(
      Math.round(defaultDataRegistry.balance.unitPhysics.defaultRadiusPx * 2.1)
    );

    // Melee hit applies 85% reduced knockback to Loki
    luffy.pos = { x: 400, y: 300 };
    loki.pos = { x: 450, y: 300 };
    spawnMeleeArcInstance(
      luffy,
      defaultDataRegistry.moves['move_luffy_pistol'],
      { x: 1, y: 0 },
      worldLoki,
      defaultDataRegistry
    );
    stepBattleWorld(worldLoki, [], defaultDataRegistry, new SeededPRNG(6003), FIXED_DT);
    // Standard knockback is 140 px/s; 85% resist reduces it to <= 25 px/s
    expect(Math.hypot(loki.knockbackVel.x, loki.knockbackVel.y)).toBeLessThanOrEqual(25);

    // Drop Loki below 50% HP -> triggers Boss Phase 2
    loki.hp = Math.round(loki.maxHp * 0.45);
    notifyUnitHitByAttack(luffy, loki, 100, true, worldLoki, defaultDataRegistry);
    expect(loki.bossPhase2Triggered).toBe(true);

    // Franky (Radical Beam) vs Kizaru (Laser Beam) Beam Clash
    const cfgBeam: BattleWorldConfig = {
      seed: 6004,
      arenaSizeKey: 'large',
      mode: '1V1',
      teamAlpha: [makeBuild('franky', 'a_franky', true)],
      teamOmega: [makeBuild('kizaru', 'o_kizaru', true)]
    };
    const worldBeam = createBattleWorld(cfgBeam, defaultDataRegistry);
    const franky = worldBeam.units[0];
    const kizaru = worldBeam.units[1];
    franky.pos = { x: 300, y: 300 };
    kizaru.pos = { x: 700, y: 300 };
    spawnBeamInstance(
      franky,
      defaultDataRegistry.moves['move_franky_radical_beam'],
      { x: 1, y: 0 },
      worldBeam,
      defaultDataRegistry
    );
    spawnBeamInstance(
      kizaru,
      defaultDataRegistry.moves['move_kizaru_laser_beam'],
      { x: -1, y: 0 },
      worldBeam,
      defaultDataRegistry
    );
    stepBattleWorld(worldBeam, [], defaultDataRegistry, new SeededPRNG(6004), FIXED_DT);
    expect(worldBeam.beamClashes.length).toBe(1);

    // Kaku (Rankyaku Burst) vs Zoro (Oni Giri Slash) Deflect
    const cfgSlash: BattleWorldConfig = {
      seed: 6005,
      arenaSizeKey: 'medium',
      mode: '1V1',
      teamAlpha: [makeBuild('zoro', 'a_zoro', true)],
      teamOmega: [makeBuild('kaku', 'o_kaku', true)]
    };
    const worldSlash = createBattleWorld(cfgSlash, defaultDataRegistry);
    const zoro = worldSlash.units[0];
    const kaku = worldSlash.units[1];
    zoro.pos = { x: 360, y: 230 };
    kaku.pos = { x: 430, y: 230 };
    const proj = spawnProjectileInstance(
      kaku,
      defaultDataRegistry.moves['move_kaku_rankyaku_amanedachi'],
      { x: -1, y: 0 },
      worldSlash,
      defaultDataRegistry
    );
    proj.pos = { x: 390, y: 230 };
    spawnMeleeArcInstance(
      zoro,
      defaultDataRegistry.moves['move_zoro_oni_giri'],
      { x: 1, y: 0 },
      worldSlash,
      defaultDataRegistry
    );
    stepBattleWorld(worldSlash, [], defaultDataRegistry, new SeededPRNG(6005), FIXED_DT);
    expect(worldSlash.projectiles.length).toBe(0);
  });

  it('5. Franky Recruitment + SHIPWRIGHT Hull Bonus, LegalityValidator Pass & Backward-Compatible v1 (0.1.0 -> 0.2.0) Save Migration', () => {
    const campaign = createInitialCampaignState(
      defaultRpgDataRegistry,
      defaultDataRegistry
    );

    // Clear East Blue & Water Seven -> Franky recruited + SHIPWRIGHT role + Thousand Sunny (+40% hull HP)
    completeEpisode(
      campaign,
      'ep_east_blue_start',
      defaultRpgDataRegistry,
      defaultDataRegistry
    );
    completeEpisode(
      campaign,
      'ep_water_seven',
      defaultRpgDataRegistry,
      defaultDataRegistry
    );

    expect(campaign.recruitedUnitIds).toContain('franky');
    expect(campaign.unlockedCrewRoles).toContain('SHIPWRIGHT');
    expect(campaign.assignedCrewRoles.SHIPWRIGHT).toBe('프랑키');
    expect(campaign.ship.shipId).toBe('thousand_sunny');
    // Thousand Sunny base maxHullHp (1800) * 1.4 (SHIPWRIGHT bonus) = 2520
    const sunnyBase = defaultRpgDataRegistry.ships['thousand_sunny'].maxHullHp;
    expect(campaign.ship.maxHullHp).toBe(Math.round(sunnyBase * 1.4));

    const env = serializeCampaignToSaveEnvelope(
      campaign,
      'slot_1',
      600,
      '2026-11-19T15:30:00.000Z',
      DEFAULT_GLOBAL_SETTINGS,
      null,
      defaultRpgDataRegistry,
      defaultDataRegistry
    );
    expect(env.meta.battleCalcVersion).toBe('0.6.0');
    expect(
      validateSaveLegality(
        env.payload,
        defaultRpgDataRegistry,
        defaultDataRegistry
      ).codes
    ).toEqual([]);
    expect(
      canEnterOnlineBattle(env, defaultRpgDataRegistry, defaultDataRegistry).allowed
    ).toBe(true);

    // Backward Compatibility Test: authentic v1 save signed under 0.1.0 upgrades cleanly to v2 / 0.3.0
    const legacyV1Env = JSON.parse(JSON.stringify(env));
    legacyV1Env.meta.saveVersion = 1;
    legacyV1Env.meta.battleCalcVersion = '0.1.0';
    legacyV1Env.meta.integrity = computeSaveIntegrity(
      1,
      '0.1.0',
      legacyV1Env.payload
    );

    const migrated = migrateRawSaveToCurrent(
      legacyV1Env,
      defaultRpgDataRegistry,
      defaultDataRegistry
    );
    expect(migrated.envelope.meta.battleCalcVersion).toBe('0.6.0');
    const acClean = evaluateAndStampAntiCheat(
      migrated.envelope,
      defaultRpgDataRegistry,
      defaultDataRegistry
    );
    expect(acClean.isTampered).toBe(false);
    expect(acClean.onlineEligible).toBe(true);

    // Tampered 0.1.0 save is still detected as INTEGRITY_MISMATCH
    const tamperedLegacy = JSON.parse(JSON.stringify(legacyV1Env));
    tamperedLegacy.payload.economy.berry += 1;
    const migratedTampered = migrateRawSaveToCurrent(
      tamperedLegacy,
      defaultRpgDataRegistry,
      defaultDataRegistry
    );
    const acTampered = evaluateAndStampAntiCheat(
      migratedTampered.envelope,
      defaultRpgDataRegistry,
      defaultDataRegistry
    );
    expect(acTampered.isTampered).toBe(true);
    expect(acTampered.violationCodes).toContain('INTEGRITY_MISMATCH');
  });
});
