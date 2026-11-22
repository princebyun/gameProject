import { describe, expect, it } from 'vitest';
import { BATTLE_CALC_VERSION, FIXED_DT } from '../../src/core/constants';
import { stepBattleWorld } from '../../src/core/combat/battleWorld';
import { SeededPRNG } from '../../src/core/math/prng';
import {
  applyBattleResultToCampaign,
  createBattleWorldFromContext
} from '../../src/core/rpg/battleBridge';
import { createInitialCampaignState } from '../../src/core/rpg/campaignState';
import {
  assignCrewRole,
  computeCrewRoleBonuses,
  decipherIslandPoneglyph
} from '../../src/core/rpg/crewAndBountyEngine';
import {
  completeEpisode,
  createBattleContextFromIslandEncounter
} from '../../src/core/rpg/episodeEngine';
import { tryTransitionThroughSeaGate } from '../../src/core/rpg/seaGateValidator';
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
import { defaultDataRegistry } from '../../src/data/dataRegistry';
import { defaultRpgDataRegistry } from '../../src/data/rpgDataRegistry';

const ALL_EAST_BLUE_EPS = [
  'ep_east_blue_start',
  'ep_orange_town',
  'ep_baratie',
  'ep_arlong_park',
  'ep_loguetown'
];

const ALL_GRAND_LINE_EPS = [
  'ep_drum_kingdom',
  'ep_alabasta',
  'ep_skypiea',
  'ep_water_seven',
  'ep_thriller_bark',
  'ep_marineford'
];

describe('Phase 8 Step 2 (Stage 2-B): Grand Line Complete Edition — 6 Islands, Crew Roles, Marineford Gauntlet, Red Line Gate & Save v3', () => {
  it('1. Registers all 6 required Grand Line islands and CURRENT_SAVE_VERSION === 4', () => {
    expect(BATTLE_CALC_VERSION).toBe('0.6.0');
    expect(CURRENT_SAVE_VERSION).toBe(5);

    const glRequiredIslands = defaultRpgDataRegistry.seaZones.grand_line.islands.filter(
      (i) => i.requiredForNextZone
    );
    expect(glRequiredIslands.map((i) => i.islandId)).toEqual([
      'drum_kingdom',
      'alabasta',
      'skypiea',
      'water_seven',
      'thriller_bark',
      'marineford'
    ]);

    for (const node of glRequiredIslands) {
      expect(defaultRpgDataRegistry.islands[node.islandId]).toBeDefined();
      expect(defaultRpgDataRegistry.episodes[node.episodeId]).toBeDefined();
    }
  });

  it('2. Chopper (DOCTOR post-battle +35% HP heal), Robin (ARCHAEOLOGIST Poneglyph decipher + 30% reward bonus) & Brook (MUSICIAN cooldown accel)', () => {
    const state = createInitialCampaignState(
      defaultRpgDataRegistry,
      defaultDataRegistry
    );

    // Without Robin (ARCHAEOLOGIST), Poneglyph decipher is blocked
    const decipherBefore = decipherIslandPoneglyph(
      state,
      'poneglyph_alabasta_pluton',
      defaultRpgDataRegistry
    );
    expect(decipherBefore.success).toBe(false);

    // Complete Drum Kingdom -> recruits Chopper & unlocks DOCTOR role
    completeEpisode(state, 'ep_drum_kingdom', defaultRpgDataRegistry, defaultDataRegistry);
    expect(state.recruitedUnitIds).toContain('chopper');
    expect(state.unlockedCrewRoles).toContain('DOCTOR');
    expect(Boolean(state.assignedCrewRoles.DOCTOR)).toBe(true);

    // Complete Alabasta -> recruits Robin & unlocks ARCHAEOLOGIST role
    completeEpisode(state, 'ep_alabasta', defaultRpgDataRegistry, defaultDataRegistry);
    expect(state.recruitedUnitIds).toContain('robin');
    expect(state.unlockedCrewRoles).toContain('ARCHAEOLOGIST');
    expect(Boolean(state.assignedCrewRoles.ARCHAEOLOGIST)).toBe(true);

    // Now Poneglyph decipher succeeds and awards 1.3x boosted Berries & TP
    const berriesBefore = state.berries;
    const decipherAfter = decipherIslandPoneglyph(
      state,
      'poneglyph_alabasta_pluton',
      defaultRpgDataRegistry
    );
    expect(decipherAfter.success).toBe(true);
    expect(decipherAfter.berryBonus).toBe(Math.round(25000 * 1.3));
    expect(state.berries).toBe(berriesBefore + decipherAfter.berryBonus);

    // Complete Thriller Bark -> recruits Brook & unlocks MUSICIAN role
    completeEpisode(state, 'ep_thriller_bark', defaultRpgDataRegistry, defaultDataRegistry);
    expect(state.recruitedUnitIds).toContain('brook');
    assignCrewRole(state, 'MUSICIAN', 'brook', defaultRpgDataRegistry);

    const bonuses = computeCrewRoleBonuses(state, defaultRpgDataRegistry);
    expect(bonuses.postBattleHealRatio).toBeCloseTo(0.35, 2);
    expect(bonuses.rewardMult).toBeCloseTo(1.3, 2);
    expect(bonuses.canDecipherPoneglyphs).toBe(true);
    expect(bonuses.skillCooldownReductionRatio).toBeCloseTo(0.15, 2);

    // Verify Doctor post-battle +35% heal restores surviving party HP ratios
    const drumEnc = defaultRpgDataRegistry.islands['drum_kingdom']?.encounters[0];
    expect(drumEnc).toBeDefined();
    if (!drumEnc) throw new Error('Missing drum encounter');
    const ctx = createBattleContextFromIslandEncounter(
      state,
      'drum_kingdom',
      'ep_drum_kingdom',
      drumEnc,
      defaultRpgDataRegistry
    );
    applyBattleResultToCampaign(
      state,
      {
        context: ctx,
        victory: true,
        survivingPartyHpRatios: { luffy: 0.4, chopper: 0.5 }
      },
      defaultRpgDataRegistry,
      defaultDataRegistry
    );
    expect(state.partyHpRatios['luffy']).toBeCloseTo(0.75, 2);
    expect(state.partyHpRatios['chopper']).toBeCloseTo(0.85, 2);
  });

  it('3. Alabasta spawns 3 destructible water barrels & Marineford spawns 2V2 guest ally Marco + 3-Wave Gauntlet (Aokiji -> Akainu -> Blackbeard)', () => {
    const state = createInitialCampaignState(
      defaultRpgDataRegistry,
      defaultDataRegistry
    );

    // Alabasta Crocodile battle context -> 3 destructible water barrels
    const alaEnc = defaultRpgDataRegistry.islands['alabasta']?.encounters[0];
    expect(alaEnc).toBeDefined();
    if (!alaEnc) throw new Error('Missing alabasta encounter');
    const alaCtx = createBattleContextFromIslandEncounter(
      state,
      'alabasta',
      'ep_alabasta',
      alaEnc,
      defaultRpgDataRegistry
    );
    const alaWorld = createBattleWorldFromContext(
      state,
      alaCtx,
      defaultRpgDataRegistry,
      defaultDataRegistry,
      8101
    );
    expect(alaWorld.destructibleProps.length).toBe(3);
    expect(alaWorld.destructibleProps.every((p) => p.kind === 'WATER_BARREL')).toBe(true);

    // Marineford 3-Wave Gauntlet -> Marco joins ALPHA as AI ally in 2V2 & waves advance 1 -> 2 -> 3
    const mfEnc = defaultRpgDataRegistry.islands['marineford']?.encounters[0];
    expect(mfEnc).toBeDefined();
    if (!mfEnc) throw new Error('Missing marineford encounter');
    const mfCtx = createBattleContextFromIslandEncounter(
      state,
      'marineford',
      'ep_marineford',
      mfEnc,
      defaultRpgDataRegistry
    );
    const mfWorld = createBattleWorldFromContext(
      state,
      mfCtx,
      defaultRpgDataRegistry,
      defaultDataRegistry,
      8102
    );
    expect(mfWorld.mode).toBe('2V2');
    expect(mfWorld.gauntletWaves.length).toBe(3);
    expect(
      mfWorld.units.some(
        (u) => u.team === 'ALPHA' && u.speciesId === 'marco' && u.isOnField
      )
    ).toBe(true);
    expect(mfWorld.units.some((u) => u.team === 'OMEGA' && u.speciesId === 'aokiji')).toBe(
      true
    );

    // Clear Wave 1 (Aokiji) -> spawns Wave 2 (Akainu)
    const prng = new SeededPRNG(8102);
    mfWorld.units.filter((u) => u.team === 'OMEGA' && u.isAlive).forEach((u) => {
      u.hp = 0;
    });
    stepBattleWorld(mfWorld, [], defaultDataRegistry, prng, FIXED_DT);
    expect(mfWorld.currentWaveIndex).toBe(1);
    expect(mfWorld.winnerTeam).toBeNull();
    expect(mfWorld.units.some((u) => u.speciesId === 'akainu' && u.isAlive)).toBe(true);

    // Clear Wave 2 (Akainu) -> spawns Wave 3 (Blackbeard)
    mfWorld.units.filter((u) => u.team === 'OMEGA' && u.isAlive).forEach((u) => {
      u.hp = 0;
    });
    stepBattleWorld(mfWorld, [], defaultDataRegistry, prng, FIXED_DT);
    expect(mfWorld.currentWaveIndex).toBe(2);
    expect(mfWorld.winnerTeam).toBeNull();
    expect(mfWorld.units.some((u) => u.speciesId === 'blackbeard' && u.isAlive)).toBe(true);

    // Clear Wave 3 (Blackbeard) -> ALPHA Victory!
    mfWorld.units.filter((u) => u.team === 'OMEGA' && u.isAlive).forEach((u) => {
      u.hp = 0;
    });
    stepBattleWorld(mfWorld, [], defaultDataRegistry, prng, FIXED_DT);
    expect(mfWorld.winnerTeam).toBe('ALPHA');
  });

  it('4. Red Line Gate: blocks with 5/6 Grand Line episodes cleared and unlocks New World when all 6 are completed', () => {
    const state = createInitialCampaignState(
      defaultRpgDataRegistry,
      defaultDataRegistry
    );

    // Clear all 5 East Blue episodes & enter Grand Line
    for (const epId of ALL_EAST_BLUE_EPS) {
      completeEpisode(state, epId, defaultRpgDataRegistry, defaultDataRegistry);
    }
    const enterGl = tryTransitionThroughSeaGate(state, defaultRpgDataRegistry);
    expect(enterGl.allowed).toBe(true);
    expect(state.currentZoneId).toBe('grand_line');

    // Complete 5 of 6 Grand Line episodes (missing ep_marineford) -> BLOCKED!
    for (const epId of ALL_GRAND_LINE_EPS.slice(0, 5)) {
      completeEpisode(state, epId, defaultRpgDataRegistry, defaultDataRegistry);
    }
    const redLineBlocked = tryTransitionThroughSeaGate(state, defaultRpgDataRegistry);
    expect(redLineBlocked.allowed).toBe(false);
    expect(state.currentZoneId).toBe('grand_line');
    expect(redLineBlocked.missingEpisodes.map((m) => m.episodeId)).toEqual([
      'ep_marineford'
    ]);

    // Complete 6th episode (ep_marineford) -> recruits Marco & unlocks Red Line Gate -> New World!
    completeEpisode(state, 'ep_marineford', defaultRpgDataRegistry, defaultDataRegistry);
    expect(state.recruitedUnitIds).toContain('marco');

    const redLinePass = tryTransitionThroughSeaGate(state, defaultRpgDataRegistry);
    expect(redLinePass.allowed).toBe(true);
    expect(state.currentZoneId).toBe('new_world');
  });

  it('5. SaveMigrator v2 -> v3 preserves existing New World unlocks with onlineEligible: true while blocking forged fresh v3 saves', () => {
    const legacyState = createInitialCampaignState(
      defaultRpgDataRegistry,
      defaultDataRegistry
    );
    // Simulate a legitimate v2 save that cleared all 5 East Blue + ep_water_seven and reached New World
    for (const epId of [...ALL_EAST_BLUE_EPS, 'ep_water_seven']) {
      completeEpisode(legacyState, epId, defaultRpgDataRegistry, defaultDataRegistry);
    }
    legacyState.currentZoneId = 'new_world';

    const rawEnv = serializeCampaignToSaveEnvelope(
      legacyState,
      'slot_1',
      2400,
      '2026-11-19T16:20:00.000Z',
      DEFAULT_GLOBAL_SETTINGS,
      null,
      defaultRpgDataRegistry,
      defaultDataRegistry
    );

    // Stamp it as an authentic clean v2 / 0.3.0 save
    const authenticV2 = JSON.parse(JSON.stringify(rawEnv));
    authenticV2.meta.saveVersion = 2;
    authenticV2.meta.battleCalcVersion = '0.3.0';
    authenticV2.meta.antiCheat = {
      isTampered: false,
      onlineEligible: true,
      violationCodes: []
    };
    authenticV2.payload.world.unlockedZones = ['east_blue', 'grand_line', 'new_world'];
    delete authenticV2.payload.world.legacyZoneUnlockV2;
    authenticV2.meta.integrity = computeSaveIntegrity(2, '0.3.0', authenticV2.payload);

    // Migrate v2 -> v3
    const migrated = migrateRawSaveToCurrent(
      authenticV2,
      defaultRpgDataRegistry,
      defaultDataRegistry
    );
    expect(migrated.migrated).toBe(true);
    expect(migrated.migratedFromVersion).toBe(2);
    expect(migrated.envelope.meta.saveVersion).toBe(5);
    expect(migrated.envelope.meta.battleCalcVersion).toBe('0.6.0');
    expect(migrated.envelope.payload.world.legacyZoneUnlockV2).toBe(true);

    const acMigrated = evaluateAndStampAntiCheat(
      migrated.envelope,
      defaultRpgDataRegistry,
      defaultDataRegistry
    );
    expect(acMigrated.isTampered).toBe(false);
    expect(acMigrated.onlineEligible).toBe(true);
    expect(
      canEnterOnlineBattle(
        migrated.envelope,
        defaultRpgDataRegistry,
        defaultDataRegistry
      ).allowed
    ).toBe(true);

    // Fresh v3 save forcing new_world without all 6 Grand Line episodes -> ILLEGAL_ZONE_ACCESS even with valid signature
    const forgedV3 = JSON.parse(JSON.stringify(rawEnv));
    forgedV3.meta.saveVersion = 3;
    forgedV3.meta.battleCalcVersion = '0.4.0';
    delete forgedV3.payload.world.legacyZoneUnlockV2;
    forgedV3.payload.world.currentZoneId = 'new_world';
    forgedV3.payload.world.unlockedZones = ['east_blue', 'grand_line', 'new_world'];
    forgedV3.meta.integrity = computeSaveIntegrity(3, '0.4.0', forgedV3.payload);

    const acForged = evaluateAndStampAntiCheat(
      forgedV3,
      defaultRpgDataRegistry,
      defaultDataRegistry
    );
    expect(acForged.isTampered).toBe(true);
    expect(acForged.onlineEligible).toBe(false);
    expect(acForged.violationCodes).toContain('ILLEGAL_ZONE_ACCESS');
  });
});
