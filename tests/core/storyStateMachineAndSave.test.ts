import { describe, expect, it } from 'vitest';
import { createInitialCampaignState } from '../../src/core/rpg/campaignState';
import {
  advanceChapterStatus,
  completeChapterWithUnlocks,
  createInitialStoryProgress,
  deriveStoryProgressFromLegacyEpisodes,
  getStoryCompletionSummary,
  STRAW_HAT_CREW_ORDER,
  validateStoryProgressLegality
} from '../../src/core/story/StoryStateMachine';
import { validateSaveLegality } from '../../src/core/save/legalityValidator';
import {
  migrateRawSaveToCurrent,
  type LegacySaveV0
} from '../../src/core/save/migrator';
import {
  DEFAULT_GLOBAL_SETTINGS,
  deserializeSaveEnvelopeToCampaign,
  serializeCampaignToSaveEnvelope
} from '../../src/core/save/serializer';
import { createDefaultDataRegistry } from '../../src/data/dataRegistry';
import { createDefaultRpgDataRegistry } from '../../src/data/rpgDataRegistry';
import { STORY_CHAPTERS_LIST } from '../../src/data/story/storyChaptersRegistry';

describe('StoryStateMachine (Ch.01~Ch.18 3D Story Mode) & Save/AntiCheat Integration', () => {
  it('progresses Ch.01 through Ch.18 in DAG order, recruiting all 10 Straw Hats, Thousand Sunny, Gear 4/5, King of Hell, 3 Sea Zones, and Endgame', () => {
    const gameReg = createDefaultDataRegistry();
    const rpgReg = createDefaultRpgDataRegistry();
    const campaign = createInitialCampaignState(rpgReg, gameReg);
    const progress = createInitialStoryProgress(STORY_CHAPTERS_LIST);

    expect(STORY_CHAPTERS_LIST).toHaveLength(19);
    expect(progress.chapters['ch01_foosha']).toBe('AVAILABLE');
    expect(progress.chapters['ch02_shells_town']).toBe('LOCKED');
    expect(progress.activeShipId).toBe('going_merry');
    expect(progress.recruitedUnits).toEqual(['luffy']);

    for (const ch of STORY_CHAPTERS_LIST) {
      expect(progress.chapters[ch.chapterId]).toBe('AVAILABLE');
      const introRes = advanceChapterStatus(
        progress,
        ch.chapterId,
        'INTRO_SEEN',
        STORY_CHAPTERS_LIST
      );
      expect(introRes.changed).toBe(true);
      expect(introRes.status).toBe('INTRO_SEEN');

      const readyRes = advanceChapterStatus(
        progress,
        ch.chapterId,
        'BATTLE_READY',
        STORY_CHAPTERS_LIST
      );
      expect(readyRes.changed).toBe(true);
      expect(readyRes.status).toBe('BATTLE_READY');

      const clearRes = completeChapterWithUnlocks(
        progress,
        ch.chapterId,
        STORY_CHAPTERS_LIST,
        campaign,
        gameReg
      );
      expect(clearRes.newlyCleared).toBe(true);
      expect(progress.chapters[ch.chapterId]).toBe('CLEARED');
    }

    const summary = getStoryCompletionSummary(progress, STORY_CHAPTERS_LIST);
    expect(summary.clearedCount).toBe(19);
    expect(summary.totalCount).toBe(19);
    expect(summary.percent).toBe(100);
    expect(summary.strawHatCount).toBe(10);

    for (const crewId of STRAW_HAT_CREW_ORDER) {
      expect(progress.recruitedUnits).toContain(crewId);
      expect(campaign.recruitedUnitIds).toContain(crewId);
    }

    expect(progress.activeShipId).toBe('thousand_sunny');
    expect(campaign.ship.shipId).toBe('thousand_sunny');
    expect(progress.unlockedSeaZones).toEqual(['east_blue', 'grand_line', 'new_world']);
    expect(progress.unlockedForms).toContain('luffy_gear4');
    expect(progress.unlockedForms).toContain('form_luffy_gear5');
    expect(progress.unlockedForms).toContain('form_zoro_king_of_hell');
    expect(progress.worldFlags).toContain('drum_cherry_blossom');
    expect(progress.worldFlags).toContain('endgame_boss_rush');
    expect(campaign.episodeFlags['drum_cherry_blossom']).toBe(true);

    // Save v5 round-trip + LegalityValidator with 0 violations
    const envelope = serializeCampaignToSaveEnvelope(
      campaign,
      'slot_1',
      5400,
      '2026-11-24T00:00:00.000Z',
      DEFAULT_GLOBAL_SETTINGS,
      null,
      rpgReg,
      gameReg
    );

    expect(envelope.meta.saveVersion).toBe(5);
    expect(envelope.meta.antiCheat.isTampered).toBe(false);
    expect(envelope.meta.antiCheat.onlineEligible).toBe(true);
    const legal = validateSaveLegality(envelope.payload, rpgReg, gameReg);
    expect(legal.codes).toEqual([]);
    expect(legal.messages).toHaveLength(0);

    const parsed = JSON.parse(JSON.stringify(envelope));
    const restored = deserializeSaveEnvelopeToCampaign(parsed, rpgReg, gameReg);
    expect(restored.campaign.storyProgress?.clearedChapterIds).toHaveLength(19);
    expect(restored.campaign.storyProgress?.activeShipId).toBe('thousand_sunny');
  });

  it('replay idempotency: clearing an already-cleared chapter awards zero duplicate bounty/flags/units', () => {
    const progress = createInitialStoryProgress(STORY_CHAPTERS_LIST);
    const first = completeChapterWithUnlocks(progress, 'ch01_foosha', STORY_CHAPTERS_LIST);
    expect(first.newlyCleared).toBe(true);
    const bountyAfterFirst = progress.totalStoryBounty;

    completeChapterWithUnlocks(progress, 'ch02_shells_town', STORY_CHAPTERS_LIST);
    const bountyAfterCh02 = progress.totalStoryBounty;
    const crewSnapshot = [...progress.recruitedUnits];
    const flagSnapshot = [...progress.worldFlags];

    // Replay Ch.01 & Ch.02
    const replay1 = completeChapterWithUnlocks(progress, 'ch01_foosha', STORY_CHAPTERS_LIST);
    const replay2 = completeChapterWithUnlocks(progress, 'ch02_shells_town', STORY_CHAPTERS_LIST);

    expect(replay1.newlyCleared).toBe(false);
    expect(replay2.newlyCleared).toBe(false);
    expect(replay2.recruitedNow).toEqual([]);
    expect(bountyAfterFirst).toBeGreaterThan(0);
    expect(progress.totalStoryBounty).toBe(bountyAfterCh02);
    expect(progress.recruitedUnits).toEqual(crewSnapshot);
    expect(progress.worldFlags).toEqual(flagSnapshot);
  });

  it('migrates Legacy Save v0 -> v5 seamlessly without losing episode or ship progression', () => {
    const gameReg = createDefaultDataRegistry();
    const rpgReg = createDefaultRpgDataRegistry();

    const legacyV0: LegacySaveV0 = {
      saveVersion: 0,
      slotId: 'slot_2',
      playTimeSec: 1200,
      zoneId: 'grand_line',
      shipX: 640,
      shipY: 420,
      shipId: 'thousand_sunny',
      berries: 50000,
      bounty: 300000000,
      trainingPoints: 40,
      completedEpisodes: [
        'ep_east_blue_start',
        'ep_orange_town',
        'ep_baratie',
        'ep_arlong_park',
        'ep_loguetown',
        'ep_drum_kingdom',
        'ep_alabasta',
        'ep_skypiea',
        'ep_water_seven'
      ],
      recruitedUnitIds: ['luffy', 'zoro', 'nami', 'usopp', 'sanji', 'chopper', 'robin', 'franky'],
      activePartyUnitIds: ['luffy', 'zoro', 'nami', 'sanji']
    };

    const migrated = migrateRawSaveToCurrent(legacyV0, rpgReg, gameReg);
    expect(migrated.migratedFromVersion).toBe(0);
    expect(migrated.envelope.meta.saveVersion).toBe(5);
    expect(migrated.envelope.payload.storyProgress).toBeDefined();

    const sp = migrated.envelope.payload.storyProgress!;
    expect(sp.clearedChapterIds).toContain('ch01_foosha');
    expect(sp.clearedChapterIds).toContain('ch10_water_seven');
    expect(sp.activeShipId).toBe('thousand_sunny');
    expect(sp.recruitedUnits).toContain('franky');
    expect(validateStoryProgressLegality(sp, STORY_CHAPTERS_LIST).valid).toBe(true);

    const derived = deriveStoryProgressFromLegacyEpisodes(
      ['ep_east_blue_start', 'ep_wano'],
      STORY_CHAPTERS_LIST
    );
    expect(derived.clearedChapterIds).toContain('ch01_foosha');
    expect(derived.clearedChapterIds).toContain('ch16_wano_country');
    expect(derived.unlockedForms).toContain('form_luffy_gear5');
  });

  it('catches tampered story progression (prerequisite skip, illegal Gear 5 unlock, illegal bounty) in LegalityValidator', () => {
    const gameReg = createDefaultDataRegistry();
    const rpgReg = createDefaultRpgDataRegistry();
    const campaign = createInitialCampaignState(rpgReg, gameReg);
    const sp = createInitialStoryProgress(STORY_CHAPTERS_LIST);

    // Tamper: jump straight to clearing Ch.18 without Ch.01..Ch.17, add un-earned Gear 5 & inflate bounty
    sp.clearedChapterIds.push('ch18_elbaf');
    sp.chapters['ch18_elbaf'] = 'CLEARED';
    sp.unlockedForms.push('form_luffy_gear5');
    sp.activeShipId = 'thousand_sunny';
    sp.totalStoryBounty += 999999999;
    campaign.storyProgress = sp;

    const storyCheck = validateStoryProgressLegality(sp, STORY_CHAPTERS_LIST);
    expect(storyCheck.valid).toBe(false);
    expect(storyCheck.errors.some((e) => e.includes('선행 스토리 챕터'))).toBe(true);
    expect(storyCheck.errors.some((e) => e.includes('현상금 범위 위반'))).toBe(true);
    expect(storyCheck.errors.some((e) => e.includes('미해금 각성 폼'))).toBe(true);
    expect(storyCheck.errors.some((e) => e.includes('사우전드 써니호'))).toBe(true);

    const envelope = serializeCampaignToSaveEnvelope(
      campaign,
      'slot_3',
      100,
      '2026-11-24T00:00:00.000Z',
      DEFAULT_GLOBAL_SETTINGS,
      null,
      rpgReg,
      gameReg
    );

    const legal = validateSaveLegality(envelope.payload, rpgReg, gameReg);
    expect(legal.codes.length).toBeGreaterThan(0);
    expect(legal.messages.some((m) => m.includes('선행 스토리 챕터'))).toBe(true);
  });
});
