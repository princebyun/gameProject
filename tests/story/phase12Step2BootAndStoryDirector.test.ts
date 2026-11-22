import { describe, expect, it } from 'vitest';
import { BATTLE_CALC_VERSION } from '../../src/core/constants';
import { createInitialCampaignState } from '../../src/core/rpg/campaignState';
import {
  deserializeSaveEnvelopeToCampaign,
  serializeCampaignToSaveEnvelope
} from '../../src/core/save/serializer';
import { defaultDataRegistry } from '../../src/data/dataRegistry';
import { defaultRpgDataRegistry } from '../../src/data/rpgDataRegistry';
import {
  createDialogueOverlayUiState,
  handleDialogueOverlayTap,
  stepDialogueOverlayUi
} from '../../src/render/dialogueAndPosterRenderer';
import {
  createInitialMissionTrackerState,
  handleMissionTrackerTap
} from '../../src/render/missionTrackerHud';
import {
  createBootSceneState,
  stepBootScene
} from '../../src/scenes/bootScene';
import {
  advanceOpeningNarrationOnTap,
  createOpeningNarrationState,
  OPENING_NARRATION_SLIDES,
  stepOpeningNarration
} from '../../src/scenes/openingNarrationScene';
import { STORY_FLAGS, StoryDirector } from '../../src/story/storyDirector';
import {
  collectIslandWorldMarkers,
  collectSeaWorldMarkers
} from '../../src/story/worldMarkerSystem';

describe('Stage 5 Step 2 — Bandai RPG Boot/Opening, StoryDirector Free-Roam Loop & v5 Save Compatibility', () => {
  it('completes BootScene preload and advances/skips 4-slide OpeningNarrationScene cleanly', () => {
    expect(BATTLE_CALC_VERSION).toBe('0.6.0');

    // 1. BootScene reaches 100% cleanly once assetsReady is true
    const boot = createBootSceneState();
    let done = false;
    for (let i = 0; i < 60; i++) {
      done = stepBootScene(boot, true, 1 / 60);
      if (done) break;
    }
    expect(done).toBe(true);
    expect(boot.progress).toBe(1);

    // 2. OpeningNarrationScene has 4 slides (Roger -> Great Pirate Era -> Straw Hat -> Chapter 1 Card)
    expect(OPENING_NARRATION_SLIDES.length).toBe(4);
    const opening = createOpeningNarrationState();

    // Partial typewriter reveal -> 1st tap completes line, 2nd tap advances to slide 2
    stepOpeningNarration(opening, 0.1);
    expect(advanceOpeningNarrationOnTap(opening)).toBe('COMPLETED_LINE');
    expect(opening.slideIndex).toBe(0);

    expect(advanceOpeningNarrationOnTap(opening)).toBe('NEXT_SLIDE');
    expect(opening.slideIndex).toBe(1);

    // Tapping inside top-right [건너뛰기 >>] button skips straight to completion
    const skipPos = {
      x: opening.skipButtonBounds.x + 10,
      y: opening.skipButtonBounds.y + 10
    };
    expect(advanceOpeningNarrationOnTap(opening, skipPos)).toBe('SKIPPED');
    expect(opening.finished).toBe(true);
  });

  it('transitions StoryDirector through New Adventure -> ch1_foosha_talk -> ch1_first_sail -> FREE_ROAM <-> STORY_MISSION', () => {
    const campaign = createInitialCampaignState(
      defaultRpgDataRegistry,
      defaultDataRegistry
    );
    const director = new StoryDirector();

    // 1. New adventure prologue starts in Foosha Village (ch1_foosha_talk)
    const n1 = director.startNewAdventurePrologue(campaign);
    expect(n1.nodeId).toBe('ch1_foosha_talk');
    expect(n1.freeRoamUnlocked).toBe(false);
    expect(director.getLoopMode()).toBe('FREE_ROAM');

    // 2. Talk to Makino -> ch1_first_sail (Alvida tutorial ready upon leaving port)
    campaign.episodeFlags[STORY_FLAGS.FOOSHA_TALK_DONE] = true;
    const n2 = director.getCurrentNode(campaign);
    expect(n2.nodeId).toBe('ch1_first_sail');
    expect(director.shouldTriggerFirstSailTutorial(campaign)).toBe(true);

    // 3. Enter Alvida tutorial battle -> STORY_MISSION -> victory returns to FREE_ROAM & unlocks Free Sailing
    const alvidaCtx = director.createAlvidaTutorialBattleContext();
    director.enterStoryMission(alvidaCtx.encounterId, alvidaCtx.encounterName);
    expect(director.getLoopMode()).toBe('STORY_MISSION');
    expect(director.getActiveMission()?.id).toBe('enc_ch1_alvida_tutorial');

    const res = director.completeStoryMission(
      campaign,
      STORY_FLAGS.FIRST_SAIL_CLEARED
    );
    expect(director.getLoopMode()).toBe('FREE_ROAM');
    expect(res.nextNode.nodeId).toBe('ch1_shells_town');
    expect(res.nextNode.freeRoamUnlocked).toBe(true);
    expect(res.notice).toContain('자유 항해 해금');

    // 4. Complete Shells Town (Zoro freed + Morgan defeated + ep_east_blue_start) -> next Gold Marker Orange Town
    campaign.episodeFlags[STORY_FLAGS.ZORO_FREED] = true;
    expect(director.getCurrentNode(campaign).targetIslandPos).toEqual({
      x: 810,
      y: 270
    });

    director.enterStoryMission('enc_shells_town_boss', '도끼손 모건');
    campaign.completedEpisodes.push('ep_east_blue_start');
    const afterCh1 = director.completeStoryMission(
      campaign,
      STORY_FLAGS.SHELLS_BOSS_CLEARED
    );
    expect(director.getLoopMode()).toBe('FREE_ROAM');
    expect(afterCh1.nextNode.nodeId).toBe('ch2_orange_town');
    expect(afterCh1.nextNode.targetIslandId).toBe('orange_town');
  });

  it('generates MAIN/SIDE/ACTIVITY world markers, handles MissionTrackerHUD & Bandai Dialogue tap controls', () => {
    const campaign = createInitialCampaignState(
      defaultRpgDataRegistry,
      defaultDataRegistry
    );
    const director = new StoryDirector();
    const node = director.startNewAdventurePrologue(campaign);

    // Island markers in Foosha/Shells should include MAIN (Makino), SIDE (Zoro), ACTIVITY (Battle Terminal)
    const fooshaMap = defaultRpgDataRegistry.islands['foosha_shells'];
    expect(fooshaMap).toBeDefined();
    if (!fooshaMap) throw new Error('Missing foosha_shells');
    const islandMarkers = collectIslandWorldMarkers(campaign, fooshaMap, node);
    expect(islandMarkers.some((m) => m.kind === 'MAIN')).toBe(true);
    expect(islandMarkers.some((m) => m.kind === 'SIDE')).toBe(true);
    expect(islandMarkers.some((m) => m.kind === 'ACTIVITY')).toBe(true);

    // Sea markers in East Blue
    const seaMarkers = collectSeaWorldMarkers(
      campaign,
      defaultRpgDataRegistry,
      node
    );
    expect(seaMarkers.some((m) => m.kind === 'MAIN')).toBe(true);
    expect(seaMarkers.some((m) => m.kind === 'ACTIVITY')).toBe(true);

    // MissionTrackerHUD collapse/expand & Gold Highlight tap
    const tracker = createInitialMissionTrackerState();
    expect(
      handleMissionTrackerTap(
        {
          x: tracker.highlightBtnBounds.x + 10,
          y: tracker.highlightBtnBounds.y + 5
        },
        tracker
      )
    ).toBe('HIGHLIGHT_GOLD');
    expect(
      handleMissionTrackerTap(
        { x: tracker.bounds.x + 12, y: tracker.bounds.y + 12 },
        tracker
      )
    ).toBe('TOGGLED');
    expect(tracker.collapsed).toBe(true);

    // Bandai Dialogue tap-to-complete (1st tap) -> advance (2nd tap)
    const dlgUi = createDialogueOverlayUiState();
    const makino = fooshaMap.npcs[0];
    expect(makino).toBeDefined();
    if (!makino) throw new Error('Missing Makino NPC');
    stepDialogueOverlayUi(dlgUi, makino, 0, 0.05);
    expect(
      handleDialogueOverlayTap({ x: 480, y: 450 }, makino, 0, dlgUi)
    ).toBe('COMPLETED_LINE');
    expect(
      handleDialogueOverlayTap({ x: 480, y: 450 }, makino, 0, dlgUi)
    ).toBe('ADVANCE');
  });

  it('preserves 100% v5 save compatibility for both existing saves (Continue -> FREE_ROAM) and new prologue saves', () => {
    const defaultSettings = {
      flashEffect: true,
      shakeIntensity: 0.8,
      bgmVolume: 0.7,
      sfxVolume: 0.8,
      keyBindings: {}
    };

    // Case A: Mid-prologue new adventure save (after Makino talk -> ch1_first_sail)
    const prologueCampaign = createInitialCampaignState(
      defaultRpgDataRegistry,
      defaultDataRegistry
    );
    const directorA = new StoryDirector();
    directorA.startNewAdventurePrologue(prologueCampaign);
    prologueCampaign.episodeFlags[STORY_FLAGS.FOOSHA_TALK_DONE] = true;

    const envA = serializeCampaignToSaveEnvelope(
      prologueCampaign,
      'auto',
      125,
      new Date().toISOString(),
      defaultSettings,
      null,
      defaultRpgDataRegistry,
      defaultDataRegistry,
      false
    );
    expect(envA.meta.antiCheat.isTampered).toBe(false);

    const restoredA = deserializeSaveEnvelopeToCampaign(
      envA,
      defaultRpgDataRegistry,
      defaultDataRegistry
    );
    const syncedA = new StoryDirector().syncFromLoadedCampaign(restoredA.campaign);
    expect(syncedA.nodeId).toBe('ch1_first_sail');

    // Case B: Existing pre-Stage-5 save (already cleared Ep.1, no story_opening_seen flag)
    const legacyCampaign = createInitialCampaignState(
      defaultRpgDataRegistry,
      defaultDataRegistry
    );
    legacyCampaign.completedEpisodes.push('ep_east_blue_start');
    delete legacyCampaign.episodeFlags[STORY_FLAGS.OPENING_SEEN];

    const envB = serializeCampaignToSaveEnvelope(
      legacyCampaign,
      'slot_1',
      900,
      new Date().toISOString(),
      defaultSettings,
      null,
      defaultRpgDataRegistry,
      defaultDataRegistry,
      false
    );
    const restoredB = deserializeSaveEnvelopeToCampaign(
      envB,
      defaultRpgDataRegistry,
      defaultDataRegistry
    );
    const directorB = new StoryDirector();
    const syncedB = directorB.syncFromLoadedCampaign(restoredB.campaign);
    expect(directorB.getLoopMode()).toBe('FREE_ROAM');
    expect(syncedB.freeRoamUnlocked).toBe(true);
    expect(syncedB.nodeId).toBe('ch2_orange_town');
  });
});
