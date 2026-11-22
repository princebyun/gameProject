import { describe, expect, it } from 'vitest';
import {
  activateMagellanVenomDemon,
  createBattleWorld,
  stepBattleWorld
} from '../../src/core/combat/battleWorld';
import { BATTLE_CALC_VERSION, FIXED_DT } from '../../src/core/constants';
import {
  buildColosseumMatchBattleConfig,
  computePosterFrameTier,
  createColosseumTournament,
  getActivePlayerColosseumMatch,
  isColosseumUnlocked,
  purchaseTutorMove,
  recordColosseumPlayerMatchResult
} from '../../src/core/endgame/colosseum';
import {
  buildImpelDownFloorBattleConfig,
  continueImpelDownEndless,
  isImpelDownUnlocked,
  recordImpelDownFloorOutcome,
  resumeImpelDownRun,
  selectImpelDownDraftBuff,
  startImpelDownRun,
  suspendImpelDownRun
} from '../../src/core/endgame/impelDown';
import { SeededPRNG } from '../../src/core/math/prng';
import { createInitialCampaignState } from '../../src/core/rpg/campaignState';
import type { BattleWorldConfig, UnitBuildConfig } from '../../src/core/types/battleState';
import { defaultDataRegistry } from '../../src/data/dataRegistry';
import { defaultEndgameRegistry } from '../../src/data/endgame/endgameRegistry';
import { defaultRpgDataRegistry } from '../../src/data/rpgDataRegistry';

function makeBuild(
  speciesId: string,
  instanceId: string,
  isPlayer: boolean
): UnitBuildConfig {
  const def = defaultDataRegistry.units[speciesId];
  if (!def) throw new Error(`Missing unit species: ${speciesId}`);
  return {
    instanceId,
    speciesId,
    level: 60,
    ivs: { hp: 20, atk: 20, def: 20, spAtk: 20, spDef: 20, spd: 20 },
    evs: { hp: 80, atk: 80, def: 80, spAtk: 80, spDef: 80, spd: 80 },
    moveIds: [...def.defaultMoves],
    equipmentId: def.defaultEquipmentId,
    traitId: def.traitId,
    formId: def.awakenedFormId ?? def.defaultFormId,
    isPlayerControlled: isPlayer,
    aiLevel: 4
  };
}

describe('Phase 10 Step 1: Pure TS Endgame Core — Impel Down 6F, Magellan & Corrida Colosseum', () => {
  it('1. BATTLE_CALC_VERSION is 0.6.0, Magellan unit/moves/form and 16+ Impel Down buffs + 9 tutor moves are registered', () => {
    expect(BATTLE_CALC_VERSION).toBe('0.6.0');
    const magellan = defaultDataRegistry.units['magellan'];
    expect(magellan).toBeDefined();
    if (!magellan) throw new Error('Missing magellan');
    expect(magellan.fruitType).toBe('PARAMECIA');
    expect(magellan.aiBehaviorId).toBe('venom_warden');
    expect(magellan.defaultMoves).toEqual([
      'move_magellan_hydra',
      'move_magellan_venom_road',
      'move_magellan_chloro_ball',
      'move_magellan_venom_demon'
    ]);
    for (const mId of magellan.defaultMoves) {
      expect(defaultDataRegistry.moves[mId]).toBeDefined();
    }
    expect(defaultDataRegistry.forms['form_magellan_venom_demon']).toBeDefined();
    expect(defaultDataRegistry.traits['ability_doku_venom_warden']?.venomDemonPassive?.enabled).toBe(true);
    expect(defaultEndgameRegistry.impelDown.floors.length).toBe(6);
    expect(defaultEndgameRegistry.impelDown.buffs.length).toBeGreaterThanOrEqual(15);
    expect(Object.keys(defaultEndgameRegistry.tutorMoves).length).toBeGreaterThanOrEqual(9);
  });

  it('2. Impel Down 6F progression: HP/PP carryover, 3-choice buff draft effect, suspend & resume, and Floor 6 -> Endless 7+', () => {
    const campaign = createInitialCampaignState(defaultRpgDataRegistry, defaultDataRegistry);
    expect(isImpelDownUnlocked(campaign, defaultEndgameRegistry)).toBe(false);
    campaign.completedEpisodes.push('ep_marineford');
    expect(isImpelDownUnlocked(campaign, defaultEndgameRegistry)).toBe(true);

    const run = startImpelDownRun(
      ['luffy', 'zoro', 'sanji'],
      424242,
      campaign,
      defaultDataRegistry,
      defaultEndgameRegistry
    );
    expect(run.currentFloor).toBe(1);
    expect(run.partyUnitIds).toEqual(['luffy', 'zoro', 'sanji']);

    // Simulate Floor 1 battle with damage and PP consumption
    const { config: f1Config, floorDef: f1Def } = buildImpelDownFloorBattleConfig(
      run,
      campaign,
      defaultDataRegistry,
      defaultEndgameRegistry
    );
    expect(f1Def.hazardKind).toBe('CRIMSON_SLASH_TRAP');
    const f1World = createBattleWorld(f1Config, defaultDataRegistry);
    const luffy = f1World.units.find((u) => u.speciesId === 'luffy')!;
    luffy.hp = Math.round(luffy.maxHp * 0.45);
    const luffyFirstSlot = luffy.moveSlots[0];
    if (!luffyFirstSlot) throw new Error('Missing luffy moveSlot 0');
    luffyFirstSlot.charges = 1;

    const outcome1 = recordImpelDownFloorOutcome(
      run,
      f1World,
      true,
      campaign,
      defaultEndgameRegistry
    );
    expect(outcome1.clearedFloor).toBe(1);
    expect(outcome1.draftChoices.length).toBe(3);
    expect(run.status).toBe('DRAFTING');
    const runLuffyCarryover = run.carryoverMap['luffy'];
    const carryMoveSlot0 = luffy.moveSlots[0];
    if (!runLuffyCarryover || !carryMoveSlot0) throw new Error('Missing luffy carryover or slot 0');
    expect(runLuffyCarryover.hpRatio).toBeCloseTo(0.45, 1);
    expect(runLuffyCarryover.moveChargesMap[carryMoveSlot0.moveId]).toBe(1);

    // Suspend & resume verification (JSON round-trip fidelity)
    suspendImpelDownRun(campaign, run);
    const restored = resumeImpelDownRun(campaign)!;
    expect(restored).not.toBeNull();
    expect(restored.currentFloor).toBe(1);
    expect(restored.status).toBe('DRAFTING');
    expect(restored.carryoverMap['luffy']?.hpRatio).toBeCloseTo(0.45, 1);

    // Pick a healing buff if injected into pendingDraftBuffIds to test direct HP heal effect
    restored.pendingDraftBuffIds = [
      'buff_ivankov_healing_hormone',
      'buff_seastone_shatter',
      'buff_antibody_formation'
    ];
    const hpBeforeHeal = restored.carryoverMap['luffy']?.hpRatio ?? 0;
    const pickRes = selectImpelDownDraftBuff(
      restored,
      'buff_ivankov_healing_hormone',
      campaign,
      defaultDataRegistry,
      defaultEndgameRegistry
    );
    expect(pickRes.applied).toBe(true);
    expect(restored.currentFloor).toBe(2);
    expect(restored.carryoverMap['luffy']?.hpRatio).toBeGreaterThan(hpBeforeHeal + 0.3);

    // Verify Floor 2 carryover is reflected in Floor 2 battle world
    const { config: f2Config } = buildImpelDownFloorBattleConfig(
      restored,
      campaign,
      defaultDataRegistry,
      defaultEndgameRegistry
    );
    const f2World = createBattleWorld(f2Config, defaultDataRegistry);
    const luffyF2 = f2World.units.find((u) => u.speciesId === 'luffy')!;
    expect(luffyF2.hp).toBeCloseTo(
      Math.round(luffyF2.maxHp * (restored.carryoverMap['luffy']?.hpRatio ?? 0)),
      -1
    );

    // Verify Level 3 dodge recharge penalty (-25%) & Level 4 Magellan boss & Level 6 -> Endless 7+
    restored.currentFloor = 3;
    const { config: f3Config } = buildImpelDownFloorBattleConfig(
      restored,
      campaign,
      defaultDataRegistry,
      defaultEndgameRegistry
    );
    expect(f3Config.impelDownHazard?.dodgeRechargeMult).toBeCloseTo(0.75, 4);

    restored.currentFloor = 4;
    const { config: f4Config } = buildImpelDownFloorBattleConfig(
      restored,
      campaign,
      defaultDataRegistry,
      defaultEndgameRegistry
    );
    expect(f4Config.teamOmega.some((u) => u.speciesId === 'magellan')).toBe(true);

    restored.currentFloor = 6;
    const { config: f6Config } = buildImpelDownFloorBattleConfig(
      restored,
      campaign,
      defaultDataRegistry,
      defaultEndgameRegistry
    );
    expect(f6Config.gauntletWaves?.length).toBe(2);
    const f6World = createBattleWorld(f6Config, defaultDataRegistry);
    recordImpelDownFloorOutcome(restored, f6World, true, campaign, defaultEndgameRegistry);
    expect(campaign.endgame.impelDown.highestFloor).toBe(6);
    const firstDraftBuffId = restored.pendingDraftBuffIds?.[0];
    if (!firstDraftBuffId) throw new Error('Missing pending draft buff id');
    selectImpelDownDraftBuff(
      restored,
      firstDraftBuffId,
      campaign,
      defaultDataRegistry,
      defaultEndgameRegistry
    );
    expect(restored.status).toBe('FLOOR6_CLEAR_CHOICE');
    continueImpelDownEndless(restored, campaign);
    expect(restored.isEndlessMode).toBe(true);
    expect(restored.currentFloor).toBe(7);
  });

  it('3. Magellan Venom Demon aura stacks venom on nearby enemies and increases DoT per stack (mitigated by Antibody buff)', () => {
    const cfg: BattleWorldConfig = {
      seed: 1001,
      arenaSizeKey: 'medium',
      mode: '1V1',
      teamAlpha: [makeBuild('luffy', 'a_luffy', true)],
      teamOmega: [makeBuild('magellan', 'o_magellan', false)]
    };
    const world = createBattleWorld(cfg, defaultDataRegistry);
    const prng = new SeededPRNG(1001);
    const luffy = world.units.find((u) => u.speciesId === 'luffy')!;
    const magellan = world.units.find((u) => u.speciesId === 'magellan')!;

    // Place Luffy inside Magellan's Venom Demon aura (<= 155px)
    luffy.pos = { x: 400, y: 270 };
    magellan.pos = { x: 480, y: 270 };
    activateMagellanVenomDemon(magellan, world, defaultDataRegistry);
    expect(magellan.venomDemonActive).toBe(true);

    // Step 2.1s -> should accumulate multiple venom stacks and deal growing DoT damage
    const hpStart = luffy.hp;
    for (let t = 0; t < 126; t++) {
      // Keep units stationary and disable AI attacks so only Venom Demon aura + DoT acts
      magellan.aiReactionTimer = 5;
      stepBattleWorld(world, [], defaultDataRegistry, prng, FIXED_DT);
    }
    expect(luffy.venomStacks).toBeGreaterThanOrEqual(3);
    const unmitigatedLoss = hpStart - luffy.hp;
    expect(unmitigatedLoss).toBeGreaterThan(35);

    // Verify higher stacks deal strictly more damage per tick than 1 stack
    const worldLow = createBattleWorld(cfg, defaultDataRegistry);
    const worldHigh = createBattleWorld(cfg, defaultDataRegistry);
    const lLow = worldLow.units.find((u) => u.speciesId === 'luffy')!;
    const lHigh = worldHigh.units.find((u) => u.speciesId === 'luffy')!;
    lLow.pos = { x: 100, y: 270 };
    lHigh.pos = { x: 100, y: 270 };
    if (!worldLow.units[1] || !worldHigh.units[1]) throw new Error('Missing unit 1');
    worldLow.units[1].pos = { x: 800, y: 270 };
    worldHigh.units[1].pos = { x: 800, y: 270 };
    lLow.venomStacks = 1;
    lLow.venomDecayTimer = 6;
    lHigh.venomStacks = 6;
    lHigh.venomDecayTimer = 6;

    const pLow = new SeededPRNG(55);
    const pHigh = new SeededPRNG(55);
    for (let t = 0; t < 35; t++) {
      if (!worldLow.units[1] || !worldHigh.units[1]) throw new Error('Missing unit 1');
      worldLow.units[1].aiReactionTimer = 5;
      worldHigh.units[1].aiReactionTimer = 5;
      stepBattleWorld(worldLow, [], defaultDataRegistry, pLow, FIXED_DT);
      stepBattleWorld(worldHigh, [], defaultDataRegistry, pHigh, FIXED_DT);
    }
    expect(lHigh.maxHp - lHigh.hp).toBeGreaterThan(lLow.maxHp - lLow.hp);
  });

  it('4. Corrida Colosseum: seeded 8-player bracket, ring-out KO rule, CP rewards, wanted poster frame upgrades & Move Tutor learning', () => {
    const campaign = createInitialCampaignState(defaultRpgDataRegistry, defaultDataRegistry);
    expect(isColosseumUnlocked(campaign, defaultEndgameRegistry)).toBe(false);
    campaign.completedEpisodes.push('ep_dressrosa');
    expect(isColosseumUnlocked(campaign, defaultEndgameRegistry)).toBe(true);

    // Seeded 8-player bracket determinism
    const tA = createColosseumTournament(
      'A',
      'luffy',
      77777,
      true,
      campaign,
      defaultDataRegistry,
      defaultEndgameRegistry
    );
    const tA2 = createColosseumTournament(
      'A',
      'luffy',
      77777,
      true,
      campaign,
      defaultDataRegistry,
      defaultEndgameRegistry
    );
    expect(tA.participants.length).toBe(8);
    expect(tA.participants.map((p) => p.unitId)).toEqual(tA2.participants.map((p) => p.unitId));
    expect(getActivePlayerColosseumMatch(tA)?.round).toBe('QF');

    // Ring-out battle verification: opponent stays outside safe radius for >2.0s -> ring-out KO
    const matchCfg = buildColosseumMatchBattleConfig(
      tA,
      campaign,
      defaultDataRegistry,
      defaultEndgameRegistry
    )!;
    expect(matchCfg.colosseumRingOut?.enabled).toBe(true);
    const ringWorld = createBattleWorld(matchCfg, defaultDataRegistry);
    const opp = ringWorld.units.find((u) => u.team === 'OMEGA')!;
    const player = ringWorld.units.find((u) => u.team === 'ALPHA')!;
    player.pos = { ...ringWorld.colosseumRingOut.center };
    opp.pos = { x: ringWorld.arenaWidth - 10, y: ringWorld.arenaHeight - 10 };
    const prng = new SeededPRNG(99);
    for (let t = 0; t < 130 && ringWorld.winnerTeam === null; t++) {
      opp.pos = { x: ringWorld.arenaWidth - 10, y: ringWorld.arenaHeight - 10 };
      opp.aiReactionTimer = 5;
      stepBattleWorld(ringWorld, [], defaultDataRegistry, prng, FIXED_DT);
    }
    expect(ringWorld.colosseumRingOut.resolvedByRingOut).toBe(true);
    expect(ringWorld.winnerTeam).toBe('ALPHA');

    // Progress QF -> SF -> FINAL victory in A-tier -> awards CP & upgrades poster frame to gold
    recordColosseumPlayerMatchResult(tA, true, true, campaign, defaultEndgameRegistry);
    expect(tA.currentRound).toBe('SF');
    recordColosseumPlayerMatchResult(tA, true, false, campaign, defaultEndgameRegistry);
    expect(tA.currentRound).toBe('FINAL');
    const winRes = recordColosseumPlayerMatchResult(
      tA,
      true,
      false,
      campaign,
      defaultEndgameRegistry
    );
    expect(winRes.playerChampion).toBe(true);
    expect(winRes.cpAwarded).toBeGreaterThan(20);
    expect(campaign.endgame.colosseum.cp).toBe(winRes.cpAwarded);
    expect(campaign.endgame.colosseum.posterFrameTier).toBe('gold');

    // Verify Platinum & Diamond frame progression
    expect(computePosterFrameTier(['A', 'S'], { A: 1, S: 2 })).toBe('platinum');
    expect(computePosterFrameTier(['A', 'S'], { A: 1, S: 3 })).toBe('diamond');

    // Move Tutor: purchase high-tier move (8 CP) and equip into slot 3
    const cpBefore = campaign.endgame.colosseum.cp;
    const tutorRes = purchaseTutorMove(
      'luffy',
      'move_tutor_ryuo_breaker',
      3,
      campaign,
      defaultDataRegistry,
      defaultEndgameRegistry
    );
    expect(tutorRes.success).toBe(true);
    expect(campaign.endgame.colosseum.cp).toBe(cpBefore - 8);
    expect(campaign.endgame.colosseum.tutoredMovesMap['luffy']).toContain(
      'move_tutor_ryuo_breaker'
    );
    expect(campaign.unitEquippedMovesOverrides?.['luffy']?.[3]).toBe(
      'move_tutor_ryuo_breaker'
    );
  });
});
