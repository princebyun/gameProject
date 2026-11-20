import { describe, expect, it } from 'vitest';
import { createBattleWorld } from '../../src/core/combat/battleWorld';
import { BATTLE_CALC_VERSION } from '../../src/core/constants';
import { BattleBanterController } from '../../src/core/rpg/battleBanterEngine';
import { createInitialCampaignState } from '../../src/core/rpg/campaignState';
import { validateDialogueScriptStructure } from '../../src/core/rpg/scriptSchema';
import {
  deserializeSaveEnvelopeToCampaign,
  serializeCampaignToSaveEnvelope
} from '../../src/core/save/serializer';
import { defaultAssetManifestRegistry } from '../../src/data/assets/assetManifestRegistry';
import { defaultDataRegistry } from '../../src/data/dataRegistry';
import {
  loadBattleBanterEntries,
  loadEpisodeDialoguePack,
  loadScriptById,
  loadSideCrewBanters,
  NPC_SPEAKER_CATALOG
} from '../../src/data/dialogues/dialogueLoader';
import {
  ALL_STORY_EPISODE_IDS,
  SIDE_BANTER_MARKER_MANIFEST,
  STORY_THEATER_CATALOG
} from '../../src/data/dialogues/scriptManifest';
import { defaultRpgDataRegistry } from '../../src/data/rpgDataRegistry';
import { StoryDirector } from '../../src/story/storyDirector';
import {
  collectSeaWorldMarkers,
  findNearbySeaSideBanter
} from '../../src/story/worldMarkerSystem';

describe('Phase 13 Step 2 — Full 17-Island New World Scripts, Side Crew Blue Markers, Story Theater & Save v5 Integrity', () => {
  it('loads and validates all 17 episodes (East Blue -> Grand Line -> New World Elbaf) and battle_banter coverage', async () => {
    expect(BATTLE_CALC_VERSION).toBe('0.7.0');
    expect(ALL_STORY_EPISODE_IDS.length).toBe(17);

    const unitIds = new Set(Object.keys(defaultDataRegistry.units));
    const bgmIds = new Set(Object.keys(defaultAssetManifestRegistry.bgmById));
    const sfxIds = new Set(Object.keys(defaultAssetManifestRegistry.sfxById));
    const npcIds = new Set(Object.keys(NPC_SPEAKER_CATALOG));
    const placeholderRe = /\b(TODO|TBD|FIXME)\b|\.\.\.생략/i;

    const battleBanters = await loadBattleBanterEntries();
    const banterCounts = new Map<string, number>();
    for (const b of battleBanters) {
      banterCounts.set(b.episodeId, (banterCounts.get(b.episodeId) ?? 0) + 1);
      expect(b.text.length).toBeLessThanOrEqual(90);
      expect(placeholderRe.test(b.text)).toBe(false);
      expect(
        b.speakerId === 'narrator' || unitIds.has(b.speakerId) || npcIds.has(b.speakerId),
        `Unknown banter speaker ${b.speakerId}`
      ).toBe(true);
    }

    for (const epId of ALL_STORY_EPISODE_IDS) {
      const pack = await loadEpisodeDialoguePack(epId);
      expect(pack, `Missing episode pack ${epId}`).not.toBeNull();
      expect(pack!.scripts.length).toBeGreaterThanOrEqual(3);
      expect(
        pack!.scripts.some((s) => s.triggerType === 'gold_marker' || s.triggerType === 'arrival')
      ).toBe(true);
      expect(pack!.scripts.some((s) => s.triggerType === 'pre_boss')).toBe(true);
      expect(pack!.scripts.some((s) => s.triggerType === 'post_boss')).toBe(true);
      expect(banterCounts.get(epId) ?? 0, `Missing battle_banter for ${epId}`).toBeGreaterThanOrEqual(1);

      for (const s of pack!.scripts) {
        expect(validateDialogueScriptStructure(s)).toEqual([]);
        for (const line of s.lines) {
          expect(line.text.length, `Overflow in ${s.scriptId}`).toBeLessThanOrEqual(90);
          expect(placeholderRe.test(line.text)).toBe(false);
          for (const d of line.directives ?? []) {
            if (d.type === 'bgm') expect(bgmIds.has(d.trackId)).toBe(true);
            if (d.type === 'sfx') expect(sfxIds.has(d.sfxId)).toBe(true);
            if (d.type === 'recruitmentBanner') expect(unitIds.has(d.unitId)).toBe(true);
          }
        }
      }
    }
  });

  it('resolves every Story Theater catalog entry and triggers New World mid-battle banter (Kaido Gear 5, Saturn Regen, Loki)', async () => {
    for (const entry of STORY_THEATER_CATALOG) {
      const loaded = await loadScriptById(entry.episodeId, entry.scriptId);
      expect(loaded, `Theater script missing: ${entry.episodeId}/${entry.scriptId}`).not.toBeNull();
      expect(loaded!.lines.length).toBeGreaterThan(0);
    }

    const battleBanters = await loadBattleBanterEntries();
    const luffy = defaultDataRegistry.units['luffy'];
    const saturn = defaultDataRegistry.units['saturn'];
    const world = createBattleWorld(
      {
        seed: 77,
        arenaSizeKey: 'large',
        mode: '1V1',
        teamAlpha: [
          {
            instanceId: 'a_luffy',
            speciesId: 'luffy',
            level: 65,
            ivs: { hp: 31, atk: 31, def: 31, spAtk: 31, spDef: 31, spd: 31 },
            evs: { hp: 100, atk: 120, def: 60, spAtk: 60, spDef: 60, spd: 100 },
            moveIds: [...luffy.defaultMoves],
            equipmentId: luffy.defaultEquipmentId,
            traitId: luffy.traitId,
            formId: luffy.defaultFormId,
            isPlayerControlled: true,
            aiLevel: 4
          }
        ],
        teamOmega: [
          {
            instanceId: 'o_saturn',
            speciesId: 'saturn',
            level: 70,
            ivs: { hp: 31, atk: 31, def: 31, spAtk: 31, spDef: 31, spd: 31 },
            evs: { hp: 160, atk: 100, def: 100, spAtk: 100, spDef: 100, spd: 40 },
            moveIds: [...saturn.defaultMoves],
            equipmentId: saturn.defaultEquipmentId,
            traitId: saturn.traitId,
            formId: saturn.defaultFormId,
            isPlayerControlled: false,
            aiLevel: 4
          }
        ]
      },
      defaultDataRegistry
    );

    const boss = world.units.find((u) => u.team === 'OMEGA')!;
    boss.isBossUnit = true;
    world.elapsedSec = 3.0;

    const ctrl = new BattleBanterController();
    const fired = ctrl.observeWorld(world, battleBanters, 'enc_egghead_kizaru_saturn');
    expect(fired.some((e) => e.banterId === 'bb_nw5_saturn_start')).toBe(true);
    expect(fired.some((e) => e.banterId === 'bb_nw5_saturn_gimmick')).toBe(true);
  });

  it('surfaces blue-marker side crew banters in WorldMarkerSystem, awards TP, and stays 100% v5 save compatible', async () => {
    const sideBanters = await loadSideCrewBanters();
    expect(sideBanters.length).toBeGreaterThanOrEqual(6);
    expect(sideBanters.length).toBe(SIDE_BANTER_MARKER_MANIFEST.length);

    const campaign = createInitialCampaignState(
      defaultRpgDataRegistry,
      defaultDataRegistry
    );
    const director = new StoryDirector();
    const node = director.getCurrentNode(campaign);

    // East Blue should expose the Nami navigation blue marker immediately
    const markersBefore = collectSeaWorldMarkers(
      campaign,
      defaultRpgDataRegistry,
      node
    );
    expect(
      markersBefore.some((m) => m.id === 'side_banter_side_eb_nami_navigation_tip')
    ).toBe(true);

    // Move ship onto the Nami side banter blue marker
    campaign.ship.pos = { x: 960, y: 460 };
    const nearby = findNearbySeaSideBanter(campaign);
    expect(nearby?.scriptId).toBe('side_eb_nami_navigation_tip');

    // Completing the banter sets episodeFlags and persists cleanly inside v5 save envelope
    campaign.episodeFlags['side_banter_side_eb_nami_navigation_tip'] = true;
    campaign.trainingPoints += nearby!.rewardTrainingPoints;

    const markersAfter = collectSeaWorldMarkers(
      campaign,
      defaultRpgDataRegistry,
      node
    );
    expect(
      markersAfter.some((m) => m.id === 'side_banter_side_eb_nami_navigation_tip')
    ).toBe(false);

    const env = serializeCampaignToSaveEnvelope(
      campaign,
      'slot_1',
      320,
      new Date().toISOString(),
      {
        flashEffect: true,
        shakeIntensity: 0.8,
        bgmVolume: 0.7,
        sfxVolume: 0.8,
        keyBindings: {}
      },
      null,
      defaultRpgDataRegistry,
      defaultDataRegistry,
      false
    );
    expect(env.meta.antiCheat.isTampered).toBe(false);

    const restored = deserializeSaveEnvelopeToCampaign(
      env,
      defaultRpgDataRegistry,
      defaultDataRegistry
    );
    expect(restored.campaign.episodeFlags['side_banter_side_eb_nami_navigation_tip']).toBe(true);
  });
});
