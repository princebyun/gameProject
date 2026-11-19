import { describe, expect, it } from 'vitest';
import {
  applyBattleResultToCampaign,
  createBattleWorldFromContext
} from '../../src/core/rpg/battleBridge';
import { createInitialCampaignState } from '../../src/core/rpg/campaignState';
import {
  assignCrewRole,
  computeBountyTier,
  computeCrewRoleBonuses,
  purchaseTrainingUpgrade,
  recruitCrewMember
} from '../../src/core/rpg/crewAndBountyEngine';
import {
  completeEpisode,
  enterIslandEpisode,
  exitIslandToSea,
  stepIslandExploration
} from '../../src/core/rpg/episodeEngine';
import {
  computeLogPoseNeedles,
  stepSeaSailing,
  tryActivateCoupDeBurst
} from '../../src/core/rpg/sailingPhysics';
import {
  tryTransitionThroughSeaGate,
  validateSeaGateAccess
} from '../../src/core/rpg/seaGateValidator';
import { createDefaultDataRegistry } from '../../src/data/dataRegistry';
import { createDefaultRpgDataRegistry } from '../../src/data/rpgDataRegistry';

describe('Phase 2 Sea-Zone Free Sailing, SeaGate Unlock Rules, Island Episodes & RPG Progression', () => {
  it('SeaGate Gating: blocks Grand Line and New World until prerequisite episodes are completed and returns remaining checklist', () => {
    const gameReg = createDefaultDataRegistry();
    const rpgReg = createDefaultRpgDataRegistry();
    const state = createInitialCampaignState(rpgReg, gameReg);

    expect(state.currentZoneId).toBe('east_blue');

    // 1. Attempt to pass Reverse Mountain before clearing all 5 East Blue episodes -> BLOCKED
    const ebAttempt1 = tryTransitionThroughSeaGate(state, rpgReg);
    expect(ebAttempt1.allowed).toBe(false);
    expect(state.currentZoneId).toBe('east_blue');
    expect(ebAttempt1.missingEpisodes.map((m) => m.episodeId)).toEqual([
      'ep_east_blue_start',
      'ep_orange_town',
      'ep_baratie',
      'ep_arlong_park',
      'ep_loguetown'
    ]);

    // 2. Check New World gate directly when neither East Blue nor Grand Line is cleared -> lists ALL required episodes
    const nwCheckBothMissing = validateSeaGateAccess(state, 'grand_line', rpgReg);
    expect(nwCheckBothMissing.allowed).toBe(false);
    expect(nwCheckBothMissing.missingEpisodes.map((m) => m.episodeId)).toEqual([
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
    ]);

    // 3. Complete all 5 East Blue episodes -> Reverse Mountain unlocks and transitions to grand_line
    for (const epId of [
      'ep_east_blue_start',
      'ep_orange_town',
      'ep_baratie',
      'ep_arlong_park',
      'ep_loguetown'
    ]) {
      completeEpisode(state, epId, rpgReg, gameReg);
    }
    const ebAttempt2 = tryTransitionThroughSeaGate(state, rpgReg);
    expect(ebAttempt2.allowed).toBe(true);
    expect(state.currentZoneId).toBe('grand_line');

    // 4. Attempt Red Line Gate to New World before clearing Grand Line's 6 required episodes -> BLOCKED
    const glAttempt1 = tryTransitionThroughSeaGate(state, rpgReg);
    expect(glAttempt1.allowed).toBe(false);
    expect(state.currentZoneId).toBe('grand_line');
    expect(glAttempt1.missingEpisodes.map((m) => m.episodeId)).toEqual([
      'ep_drum_kingdom',
      'ep_alabasta',
      'ep_skypiea',
      'ep_water_seven',
      'ep_thriller_bark',
      'ep_marineford'
    ]);

    // 5. Complete all 6 Grand Line episodes -> upgrades ship to Thousand Sunny and unlocks Red Line Gate to New World
    for (const epId of [
      'ep_drum_kingdom',
      'ep_alabasta',
      'ep_skypiea',
      'ep_water_seven',
      'ep_thriller_bark',
      'ep_marineford'
    ]) {
      completeEpisode(state, epId, rpgReg, gameReg);
    }
    expect(state.ship.shipId).toBe('thousand_sunny');

    const glAttempt2 = tryTransitionThroughSeaGate(state, rpgReg);
    expect(glAttempt2.allowed).toBe(true);
    expect(state.currentZoneId).toBe('new_world');

    // Verify 3-needle New World Log Pose points to Wano, Egghead, and Elbaf
    const needles = computeLogPoseNeedles(state, rpgReg);
    expect(needles.length).toBe(3);
  });

  it('Free Sailing & Optional Docking: collects sea treasure without docking and restores exact sea coordinates on Port Exit', () => {
    const gameReg = createDefaultDataRegistry();
    const rpgReg = createDefaultRpgDataRegistry();
    const state = createInitialCampaignState(rpgReg, gameReg);

    const startBerries = state.berries;

    // Move ship directly onto floating treasure chest in east_blue without docking at any island
    const chest = state.seaObjectsByZone.east_blue.find(
      (o) => o.kind === 'TREASURE_CHEST' && !o.hiddenByDefault
    )!;
    state.ship.pos = { x: chest.pos.x, y: chest.pos.y };

    const stepOut = stepSeaSailing(
      state,
      { moveVec: { x: 1, y: 0 }, coupDeBurstPressed: false, dockOrInteractPressed: false },
      1 / 60,
      rpgReg
    );
    expect(chest.collectedOrDefeated).toBe(true);
    expect(state.berries).toBeGreaterThan(startBerries);
    expect(stepOut.collectedNotice).toContain(chest.name);

    // Move ship to custom sea coordinates outside Foosha Village & dock into IslandEpisodeScene
    state.ship.pos = { x: 512, y: 438 };
    const dockRes = enterIslandEpisode(state, 'foosha_shells', rpgReg);
    expect(dockRes.allowed).toBe(true);
    expect(state.activeIslandId).toBe('foosha_shells');
    expect(dockRes.runtime).not.toBeNull();

    // Move player inside island to Port Exit and press interact to return to sea
    const runtime = dockRes.runtime!;
    const islandMap = rpgReg.islands['foosha_shells'];
    runtime.playerPos = { ...islandMap.portExitZone.pos };
    const islOut = stepIslandExploration(
      state,
      runtime,
      { x: 0, y: 0 },
      true,
      1 / 60,
      rpgReg,
      gameReg
    );

    expect(islOut.requestedExitToSea).toBe(true);
    expect(state.activeIslandId).toBeNull();
    expect(state.currentZoneId).toBe('east_blue');
    expect(state.ship.pos.x).toBe(512);
    expect(state.ship.pos.y).toBe(438);
  });

  it('Egghead Laser Barrier Switch Puzzle & Elbaf Giant-Scale map exploration', () => {
    const gameReg = createDefaultDataRegistry();
    const rpgReg = createDefaultRpgDataRegistry();
    const state = createInitialCampaignState(rpgReg, gameReg);
    state.currentZoneId = 'new_world';

    const dockEgghead = enterIslandEpisode(state, 'egghead', rpgReg);
    expect(dockEgghead.allowed).toBe(true);
    const rt = dockEgghead.runtime!;

    // Attempt to walk across active laser barrier at x = 540 -> blocked!
    rt.playerPos = { x: 525, y: 150 };
    for (let i = 0; i < 20; i++) {
      stepIslandExploration(state, rt, { x: 1, y: 0 }, false, 1 / 60, rpgReg, gameReg);
    }
    expect(rt.playerPos.x).toBeLessThan(540);

    // Move to Frontier Dome Switch A (450, 135) and press interact -> deactivates barrier_frontier_dome_1
    rt.playerPos = { x: 450, y: 135 };
    stepIslandExploration(state, rt, { x: 0, y: 0 }, true, 1 / 60, rpgReg, gameReg);
    expect(rt.deactivatedBarrierIds).toContain('barrier_frontier_dome_1');
    expect(state.episodeFlags['flag_egghead_sw1']).toBe(true);

    // Now walk across x = 540 at y = 150 -> passes cleanly!
    rt.playerPos = { x: 525, y: 150 };
    for (let i = 0; i < 30; i++) {
      stepIslandExploration(state, rt, { x: 1, y: 0 }, false, 1 / 60, rpgReg, gameReg);
    }
    expect(rt.playerPos.x).toBeGreaterThan(555);

    exitIslandToSea(state);

    // Complete Egghead (Elbaf prerequisite) -> Enter Elbaf (latest arc) and verify giant-scale props & NPCs (>2.0x scale)
    completeEpisode(state, 'ep_egghead', rpgReg, gameReg);
    const dockElbaf = enterIslandEpisode(state, 'elbaf', rpgReg);
    expect(dockElbaf.allowed).toBe(true);
    const elbafMap = rpgReg.islands['elbaf'];
    expect(elbafMap.giantProps.length).toBeGreaterThan(0);
    expect(elbafMap.giantProps[0].visualScale).toBeGreaterThanOrEqual(2.2);
    expect(elbafMap.npcs[0].visualScale).toBeGreaterThanOrEqual(2.2);
  });

  it('Crew Recruitment, 7 Crew Roles, Bounty Tiers, Haki Training, Coup de Burst & BattleContext <-> BattleResult Sync', () => {
    const gameReg = createDefaultDataRegistry();
    const rpgReg = createDefaultRpgDataRegistry();
    const state = createInitialCampaignState(rpgReg, gameReg);

    // Recruit Zoro (main track) and Law (alliance track)
    recruitCrewMember(state, 'zoro', rpgReg, gameReg);
    recruitCrewMember(state, 'law', rpgReg, gameReg);
    expect(state.recruitedUnitIds).toContain('zoro');
    expect(state.recruitedUnitIds).toContain('law');

    // Assign all 7 Crew Roles
    assignCrewRole(state, 'SWORDSMAN', 'zoro', rpgReg);
    assignCrewRole(state, 'DOCTOR', 'law', rpgReg);
    assignCrewRole(state, 'COOK', '상디', rpgReg);
    assignCrewRole(state, 'SHIPWRIGHT', '프랑키', rpgReg);
    assignCrewRole(state, 'ARCHAEOLOGIST', '니코 로빈', rpgReg);

    const bonuses = computeCrewRoleBonuses(state, rpgReg);
    expect(bonuses.openingAtkMult).toBeCloseTo(1.12, 3);
    expect(bonuses.maxHpMealMult).toBeCloseTo(1.12, 3);
    expect(bonuses.postBattleHealRatio).toBeCloseTo(0.35, 3);
    expect(bonuses.hullMaxHpMult).toBeCloseTo(1.4, 3);
    expect(bonuses.rewardMult).toBeCloseTo(1.3, 3);
    expect(bonuses.revealsHiddenChests).toBe(true);

    // Execute BattleContext -> BattleWorld -> BattleResult victory pipeline for Wano Kaido Boss
    const battleCtx = {
      sourceScene: 'ISLAND_EPISODE' as const,
      zoneId: 'new_world' as const,
      islandId: 'wano_onigashima',
      encounterId: 'enc_wano_kaido_boss',
      encounterName: '사황 백수 카이도',
      isBoss: true,
      arenaSizeKey: 'large' as const,
      mode: '2V2' as const,
      enemyUnitIds: ['kaido'],
      aiLevel: 4,
      bountyReward: 2_700_000_000,
      berryReward: 90_000,
      trainingPointReward: 80,
      setsFlagOnVictory: 'flag_wano_kaido_cleared',
      completesEpisodeIdOnVictory: 'ep_wano'
    };

    const battleWorld = createBattleWorldFromContext(
      state,
      battleCtx,
      rpgReg,
      gameReg
    );
    const luffyInBattle = battleWorld.units.find((u) => u.speciesId === 'luffy')!;
    // Verify Swordsman opening ATK buff was applied to battle unit
    expect(
      luffyInBattle.statBuffs.some((b) => b.id === 'crew_role_swordsman_atk')
    ).toBe(true);

    applyBattleResultToCampaign(
      state,
      {
        context: battleCtx,
        victory: true,
        survivingPartyHpRatios: { luffy: 0.5, zoro: 0.7 }
      },
      rpgReg,
      gameReg
    );

    expect(state.completedEpisodes).toContain('ep_wano');
    expect(state.roadPoneglyphCount).toBe(1);
    expect(state.latestWantedPoster).not.toBeNull();
    expect(state.totalCrewBounty).toBeGreaterThanOrEqual(3_000_000_000);

    // Bounty tier should now be Tier 5 (Four Emperors -> Marine Patrol AI Lv5)
    const tierInfo = computeBountyTier(state.totalCrewBounty);
    expect(tierInfo.tier).toBe(5);
    expect(tierInfo.patrolAiLevel).toBe(5);

    // Test Haki Training upgrade purchase
    state.unitHakiOverrides['law'] = { armament: 1, observation: 1, conqueror: 0 };
    const upgRes = purchaseTrainingUpgrade(
      state,
      'law',
      'train_armament_lv2',
      rpgReg
    );
    expect(upgRes.success).toBe(true);
    expect(state.unitHakiOverrides['law'].armament).toBe(2);

    // Unlock Thousand Sunny and test Coup de Burst activation
    completeEpisode(state, 'ep_water_seven', rpgReg, gameReg);
    expect(state.ship.shipId).toBe('thousand_sunny');
    const burstOk = tryActivateCoupDeBurst(state, rpgReg);
    expect(burstOk).toBe(true);
    expect(state.ship.coupDeBurstActiveTimer).toBeGreaterThan(0);
  });

  it('End-to-End Campaign Playthrough: East Blue -> Grand Line (Gate Block & Clear) -> New World (Wano, Egghead, Elbaf)', () => {
    const gameReg = createDefaultDataRegistry();
    const rpgReg = createDefaultRpgDataRegistry();
    const state = createInitialCampaignState(rpgReg, gameReg);

    // 1. East Blue: Sail & Dock at Foosha Village / Shells Town + clear remaining 4 East Blue episodes
    state.ship.pos = { x: 520, y: 440 };
    const dockFoosha = enterIslandEpisode(state, 'foosha_shells', rpgReg);
    expect(dockFoosha.allowed).toBe(true);
    completeEpisode(state, 'ep_east_blue_start', rpgReg, gameReg);
    expect(state.recruitedUnitIds).toContain('zoro');
    exitIslandToSea(state);
    expect(state.ship.pos).toEqual({ x: 520, y: 440 });

    for (const epId of ['ep_orange_town', 'ep_baratie', 'ep_arlong_park', 'ep_loguetown']) {
      completeEpisode(state, epId, rpgReg, gameReg);
    }

    // Pass Reverse Mountain Gate -> Grand Line
    const passReverseMountain = tryTransitionThroughSeaGate(state, rpgReg);
    expect(passReverseMountain.allowed).toBe(true);
    expect(state.currentZoneId).toBe('grand_line');

    // 2. Grand Line: Approach Red Line Gate before clearing Grand Line's 6 episodes -> Verify Blocked & Missing Checklist
    const blockedRedLine = tryTransitionThroughSeaGate(state, rpgReg);
    expect(blockedRedLine.allowed).toBe(false);
    expect(state.currentZoneId).toBe('grand_line');
    expect(blockedRedLine.missingEpisodes.length).toBe(6);
    expect(blockedRedLine.missingEpisodes.some((m) => m.islandName.includes('워터 세븐'))).toBe(true);

    // Dock at Water 7, clear all 6 Grand Line episodes -> upgrades to Thousand Sunny & unlocks Red Line Gate
    state.ship.pos = { x: 1080, y: 540 };
    const dockW7 = enterIslandEpisode(state, 'water_seven', rpgReg);
    expect(dockW7.allowed).toBe(true);
    for (const epId of [
      'ep_drum_kingdom',
      'ep_alabasta',
      'ep_skypiea',
      'ep_water_seven',
      'ep_thriller_bark',
      'ep_marineford'
    ]) {
      completeEpisode(state, epId, rpgReg, gameReg);
    }
    expect(state.ship.shipId).toBe('thousand_sunny');
    expect(state.recruitedUnitIds).toContain('law');
    exitIslandToSea(state);

    const passRedLine = tryTransitionThroughSeaGate(state, rpgReg);
    expect(passRedLine.allowed).toBe(true);
    expect(state.currentZoneId).toBe('new_world');

    // 3. New World: Freely sail and dock at Wano, Egghead, and Elbaf
    for (const [islId, epId] of [
      ['wano_onigashima', 'ep_wano'],
      ['egghead', 'ep_egghead'],
      ['elbaf', 'ep_elbaf']
    ] as const) {
      const dockRes = enterIslandEpisode(state, islId, rpgReg);
      expect(dockRes.allowed).toBe(true);
      const bossEnc = rpgReg.islands[islId].encounters[0];
      expect(bossEnc.isBoss).toBe(true);
      completeEpisode(state, epId, rpgReg, gameReg);
      exitIslandToSea(state);
    }

    expect(state.completedEpisodes).toEqual(
      expect.arrayContaining([
        'ep_east_blue_start',
        'ep_water_seven',
        'ep_wano',
        'ep_egghead',
        'ep_elbaf'
      ])
    );
    expect(state.roadPoneglyphCount).toBe(2);
    expect(state.unitUnlockedForms['luffy']).toContain('form_luffy_gear5');
    expect(state.totalCrewBounty).toBeGreaterThanOrEqual(5_000_000_000);
  });
});
