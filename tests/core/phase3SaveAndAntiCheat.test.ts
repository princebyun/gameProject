import { describe, expect, it } from 'vitest';
import { createInitialCampaignState } from '../../src/core/rpg/campaignState';
import { assignCrewRole, recruitCrewMember } from '../../src/core/rpg/crewAndBountyEngine';
import { completeEpisode, enterIslandEpisode } from '../../src/core/rpg/episodeEngine';
import { tryTransitionThroughSeaGate } from '../../src/core/rpg/seaGateValidator';
import {
  canEnterOnlineBattle,
  evaluateAndStampAntiCheat
} from '../../src/core/save/antiCheat';
import {
  migrateRawSaveToCurrent,
  type LegacySaveV0
} from '../../src/core/save/migrator';
import {
  DEFAULT_GLOBAL_SETTINGS,
  deserializeSaveEnvelopeToCampaign,
  serializeCampaignToSaveEnvelope
} from '../../src/core/save/serializer';
import { computeSaveIntegrity } from '../../src/core/save/sha256';
import { createDefaultDataRegistry } from '../../src/data/dataRegistry';
import { createDefaultRpgDataRegistry } from '../../src/data/rpgDataRegistry';
import { IndexedDbStorageAdapter } from '../../src/platform/storage/indexedDbStorageAdapter';
import {
  formatSaveExportFilename,
  parseAndValidateImportedSaveJson
} from '../../src/platform/storage/saveFileIO';

describe('Phase 3 Save Serialization, v0->v1 Migration & 2-Stage Anti-Cheat Engine', () => {
  it('Lossless Roundtrip: serializes and deserializes full RPG state (Sea Zone, Episodes, Ship, Crew Roles, Haki, Awakening, Bounty)', () => {
    const gameReg = createDefaultDataRegistry();
    const rpgReg = createDefaultRpgDataRegistry();
    const state = createInitialCampaignState(rpgReg, gameReg);

    // Progress through East Blue (5 episodes) & Grand Line (6 episodes) into New World
    for (const epId of [
      'ep_east_blue_start',
      'ep_orange_town',
      'ep_baratie',
      'ep_arlong_park',
      'ep_loguetown'
    ]) {
      completeEpisode(state, epId, rpgReg, gameReg);
    }
    tryTransitionThroughSeaGate(state, rpgReg);
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
    tryTransitionThroughSeaGate(state, rpgReg);
    completeEpisode(state, 'ep_wano', rpgReg, gameReg);

    recruitCrewMember(state, 'zoro', rpgReg, gameReg);
    recruitCrewMember(state, 'law', rpgReg, gameReg);
    assignCrewRole(state, 'SWORDSMAN', 'zoro', rpgReg);
    assignCrewRole(state, 'DOCTOR', 'law', rpgReg);

    state.ship.pos = { x: 1210, y: 705 };
    state.ship.headingRad = 1.25;
    state.unitHakiOverrides['luffy'] = { armament: 3, observation: 3, conqueror: 3 };

    const dockEgghead = enterIslandEpisode(state, 'egghead', rpgReg);
    const islandRt = dockEgghead.runtime!;
    islandRt.playerPos = { x: 450, y: 135 };
    islandRt.deactivatedBarrierIds.push('barrier_frontier_dome_1');

    const envelope = serializeCampaignToSaveEnvelope(
      state,
      'slot_1',
      3640,
      '2026-11-19T03:00:00.000Z',
      DEFAULT_GLOBAL_SETTINGS,
      islandRt,
      rpgReg,
      gameReg
    );

    expect(envelope.meta.saveVersion).toBe(5);
    expect(envelope.meta.antiCheat.isTampered).toBe(false);
    expect(envelope.meta.antiCheat.onlineEligible).toBe(true);
    expect(canEnterOnlineBattle(envelope, rpgReg, gameReg).allowed).toBe(true);

    // JSON roundtrip
    const jsonText = JSON.stringify(envelope);
    const parsed = JSON.parse(jsonText);
    const restored = deserializeSaveEnvelopeToCampaign(parsed, rpgReg, gameReg);

    expect(restored.campaign.currentZoneId).toBe('new_world');
    expect(restored.campaign.activeIslandId).toBe('egghead');
    expect(restored.campaign.ship.shipId).toBe('thousand_sunny');
    expect(restored.campaign.ship.pos).toEqual({ x: 1210, y: 705 });
    expect(restored.campaign.completedEpisodes).toEqual([
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
      'ep_marineford',
      'ep_wano'
    ]);
    expect(restored.campaign.recruitedUnitIds).toEqual(
      expect.arrayContaining(['luffy', 'zoro', 'law'])
    );
    expect(restored.campaign.assignedCrewRoles.SWORDSMAN).toBe('zoro');
    expect(restored.campaign.assignedCrewRoles.DOCTOR).toBe('law');
    expect(restored.campaign.unitHakiOverrides['luffy']).toEqual({
      armament: 3,
      observation: 3,
      conqueror: 3
    });
    expect(restored.campaign.unitUnlockedForms['luffy']).toContain(
      'form_luffy_gear5'
    );
    expect(restored.campaign.totalCrewBounty).toBe(state.totalCrewBounty);
    expect(restored.islandRuntime?.playerPos).toEqual({ x: 450, y: 135 });
    expect(restored.islandRuntime?.deactivatedBarrierIds).toContain(
      'barrier_frontier_dome_1'
    );
  });

  it('Schema Migration: upgrades a legacy v0 save object to v1 SaveEnvelope cleanly', () => {
    const gameReg = createDefaultDataRegistry();
    const rpgReg = createDefaultRpgDataRegistry();

    const legacyV0: LegacySaveV0 = {
      saveVersion: 0,
      slotId: 'slot_2',
      playTimeSec: 1200,
      zoneId: 'grand_line',
      shipX: 640,
      shipY: 420,
      shipId: 'going_merry',
      berries: 42000,
      bounty: 30000000,
      trainingPoints: 35,
      completedEpisodes: ['ep_east_blue_start'],
      recruitedUnitIds: ['luffy', 'zoro'],
      activePartyUnitIds: ['luffy', 'zoro']
    };

    const migRes = migrateRawSaveToCurrent(legacyV0, rpgReg, gameReg);
    expect(migRes.migrated).toBe(true);
    expect(migRes.migratedFromVersion).toBe(0);
    expect(migRes.envelope.meta.saveVersion).toBe(5);
    expect(migRes.envelope.meta.slotId).toBe('slot_2');
    expect(migRes.envelope.payload.world.currentZoneId).toBe('grand_line');
    expect(migRes.envelope.payload.economy.berry).toBe(42000);
    expect(migRes.envelope.meta.antiCheat.isTampered).toBe(false);
    expect(migRes.envelope.meta.antiCheat.onlineEligible).toBe(true);
  });

  it('Stage 1 Anti-Cheat (IntegrityVerifier): detects 1-byte modification to berry or haki.conqueror with INTEGRITY_MISMATCH', () => {
    const gameReg = createDefaultDataRegistry();
    const rpgReg = createDefaultRpgDataRegistry();
    const state = createInitialCampaignState(rpgReg, gameReg);

    const validEnvelope = serializeCampaignToSaveEnvelope(
      state,
      'slot_1',
      180,
      '2026-11-19T03:10:00.000Z',
      DEFAULT_GLOBAL_SETTINGS,
      null,
      rpgReg,
      gameReg
    );

    // 1. Modify berry by +1 in exported JSON
    const tamperedBerryEnv = JSON.parse(JSON.stringify(validEnvelope));
    tamperedBerryEnv.payload.economy.berry += 1;

    const acBerry = evaluateAndStampAntiCheat(tamperedBerryEnv, rpgReg, gameReg);
    expect(acBerry.isTampered).toBe(true);
    expect(acBerry.onlineEligible).toBe(false);
    expect(acBerry.violationCodes).toContain('INTEGRITY_MISMATCH');

    // 2. Modify haki.conqueror by -1 in exported JSON
    const tamperedHakiEnv = JSON.parse(JSON.stringify(validEnvelope));
    tamperedHakiEnv.payload.crew.unitProgressMap['luffy'].haki.conqueror = 2;

    const acHaki = evaluateAndStampAntiCheat(tamperedHakiEnv, rpgReg, gameReg);
    expect(acHaki.isTampered).toBe(true);
    expect(acHaki.onlineEligible).toBe(false);
    expect(acHaki.violationCodes).toContain('INTEGRITY_MISMATCH');
  });

  it('Stage 2 Anti-Cheat (LegalityValidator): blocks online eligibility even if signature is recalculated when game rules are violated', () => {
    const gameReg = createDefaultDataRegistry();
    const rpgReg = createDefaultRpgDataRegistry();
    const state = createInitialCampaignState(rpgReg, gameReg);

    const baseEnv = serializeCampaignToSaveEnvelope(
      state,
      'slot_3',
      300,
      '2026-11-19T03:20:00.000Z',
      DEFAULT_GLOBAL_SETTINGS,
      null,
      rpgReg,
      gameReg
    );

    // Case A: Unlock new_world without required episodes (ep_east_blue_start, ep_water_seven) AND forge valid signature
    const illegalZoneEnv = JSON.parse(JSON.stringify(baseEnv));
    illegalZoneEnv.payload.world.currentZoneId = 'new_world';
    illegalZoneEnv.payload.world.unlockedZones = ['east_blue', 'new_world'];
    illegalZoneEnv.meta.integrity = computeSaveIntegrity(
      illegalZoneEnv.meta.saveVersion,
      illegalZoneEnv.meta.battleCalcVersion,
      illegalZoneEnv.payload
    );

    const zoneCheck = evaluateAndStampAntiCheat(illegalZoneEnv, rpgReg, gameReg);
    expect(zoneCheck.isTampered).toBe(true);
    expect(zoneCheck.onlineEligible).toBe(false);
    expect(zoneCheck.violationCodes).toContain('ILLEGAL_ZONE_ACCESS');
    expect(canEnterOnlineBattle(illegalZoneEnv, rpgReg, gameReg).allowed).toBe(
      false
    );

    // Case B: Own Thousand Sunny without completing ep_water_seven AND forge valid signature
    const illegalShipEnv = JSON.parse(JSON.stringify(baseEnv));
    illegalShipEnv.payload.ship.activeShipId = 'thousand_sunny';
    illegalShipEnv.payload.ship.ownedShipIds = ['going_merry', 'thousand_sunny'];
    illegalShipEnv.meta.integrity = computeSaveIntegrity(
      illegalShipEnv.meta.saveVersion,
      illegalShipEnv.meta.battleCalcVersion,
      illegalShipEnv.payload
    );

    const shipCheck = evaluateAndStampAntiCheat(illegalShipEnv, rpgReg, gameReg);
    expect(shipCheck.isTampered).toBe(true);
    expect(shipCheck.onlineEligible).toBe(false);
    expect(shipCheck.violationCodes).toContain('ILLEGAL_CREW_OR_SHIP');

    // Case C: Set Haki Lv.4 AND force Gear 5 without completing ep_wano AND forge valid signature
    const illegalHakiEnv = JSON.parse(JSON.stringify(baseEnv));
    illegalHakiEnv.payload.crew.unitProgressMap['luffy'].haki.conqueror = 4;
    illegalHakiEnv.payload.crew.unitProgressMap['luffy'].unlockedFormIds = [
      'form_luffy_gear5'
    ];
    illegalHakiEnv.payload.crew.unitProgressMap['luffy'].fruitAwakeningUnlocked =
      true;
    illegalHakiEnv.meta.integrity = computeSaveIntegrity(
      illegalHakiEnv.meta.saveVersion,
      illegalHakiEnv.meta.battleCalcVersion,
      illegalHakiEnv.payload
    );

    const hakiCheck = evaluateAndStampAntiCheat(illegalHakiEnv, rpgReg, gameReg);
    expect(hakiCheck.isTampered).toBe(true);
    expect(hakiCheck.onlineEligible).toBe(false);
    expect(hakiCheck.violationCodes).toContain('ILLEGAL_UNIT_STATE');
    expect(canEnterOnlineBattle(illegalHakiEnv, rpgReg, gameReg).allowed).toBe(
      false
    );
  });

  it('Storage Adapter & JSON Export/Import Pipeline: saves multi-slots, exports .op-save.json, clears DB, and restores or flags tampered JSON on Import', async () => {
    const gameReg = createDefaultDataRegistry();
    const rpgReg = createDefaultRpgDataRegistry();
    const storage = new IndexedDbStorageAdapter();
    await storage.init();

    const state = createInitialCampaignState(rpgReg, gameReg);
    for (const epId of [
      'ep_east_blue_start',
      'ep_orange_town',
      'ep_baratie',
      'ep_arlong_park',
      'ep_loguetown'
    ]) {
      completeEpisode(state, epId, rpgReg, gameReg);
    }
    tryTransitionThroughSeaGate(state, rpgReg);
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
    tryTransitionThroughSeaGate(state, rpgReg);

    const env = serializeCampaignToSaveEnvelope(
      state,
      'slot_1',
      2450,
      '2026-11-19T03:30:00.000Z',
      DEFAULT_GLOBAL_SETTINGS,
      null,
      rpgReg,
      gameReg
    );

    expect(formatSaveExportFilename(env)).toBe(
      'save_slot1_new_world_20261119.op-save.json'
    );

    await storage.saveSlot('slot_1', env);
    const loaded1 = await storage.loadSlot('slot_1');
    expect(loaded1?.payload.world.currentZoneId).toBe('new_world');

    // Export JSON, clear all storage slots, then Import JSON back into slot_2
    const exportedJson = JSON.stringify(env, null, 2);
    await storage.clearAllSlots();
    expect(await storage.loadSlot('slot_1')).toBeNull();

    const previewClean = parseAndValidateImportedSaveJson(
      exportedJson,
      rpgReg,
      gameReg
    );
    expect(previewClean.antiCheat.isTampered).toBe(false);
    expect(previewClean.antiCheat.onlineEligible).toBe(true);

    await storage.saveSlot('slot_2', previewClean.envelope);
    const restored2 = await storage.loadSlot('slot_2');
    expect(restored2?.payload.ship.activeShipId).toBe('thousand_sunny');

    // Tamper with exported JSON and verify Import flags INTEGRITY_MISMATCH without throwing
    const tamperedObj = JSON.parse(exportedJson);
    tamperedObj.payload.economy.berry += 999999;
    const previewTampered = parseAndValidateImportedSaveJson(
      JSON.stringify(tamperedObj),
      rpgReg,
      gameReg
    );
    expect(previewTampered.antiCheat.isTampered).toBe(true);
    expect(previewTampered.antiCheat.onlineEligible).toBe(false);
    expect(previewTampered.antiCheat.violationCodes).toContain(
      'INTEGRITY_MISMATCH'
    );

    // Malformed JSON throws descriptive Korean message without corrupting slot_2
    expect(() =>
      parseAndValidateImportedSaveJson('{bad json', rpgReg, gameReg)
    ).toThrow(/JSON 파싱 실패/);
    expect((await storage.loadSlot('slot_2'))?.payload.world.currentZoneId).toBe(
      'new_world'
    );
  });
});
