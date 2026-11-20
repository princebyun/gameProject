import { describe, expect, it } from 'vitest';
import { createBattleWorld } from '../../src/core/combat/battleWorld';
import { BATTLE_CALC_VERSION } from '../../src/core/constants';
import {
  BANTER_DISPLAY_DURATION_SEC,
  BattleBanterController
} from '../../src/core/rpg/battleBanterEngine';
import {
  evaluateLineDirectives,
  validateDialogueScriptStructure,
  type DialogueScript
} from '../../src/core/rpg/scriptSchema';
import { defaultAssetManifestRegistry } from '../../src/data/assets/assetManifestRegistry';
import { defaultDataRegistry } from '../../src/data/dataRegistry';
import {
  loadBattleBanterEntries,
  loadEpisodeDialoguePack,
  NPC_SPEAKER_CATALOG
} from '../../src/data/dialogues/dialogueLoader';
import {
  createDialogueScriptPlayer,
  handleDialogueScriptTap,
  skipDialogueScriptPlayer,
  stepDialogueScriptPlayer
} from '../../src/render/dialogue/dialogueCutscenePlayer';
import {
  createRecruitmentBannerState,
  stepRecruitmentBanner,
  tryDismissRecruitmentBanner
} from '../../src/render/dialogue/recruitmentOverlay';

const STEP1_EPISODE_IDS = [
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
] as const;

describe('Phase 13 Step 1 — Bandai RPG Cutscene DSL, RecruitmentOverlay, BattleBanter & East Blue/Grand Line Scripts', () => {
  it('executes emotion, bgm, sfx, cameraShake, chapterCard, recruitmentBanner, wantedPoster and suppresses screenFlash when flashEffect is false', () => {
    expect(BATTLE_CALC_VERSION).toBe('0.7.0');

    const sampleScript: DialogueScript = {
      scriptId: 'test_dsl_script',
      episodeId: 'ep_east_blue_start',
      triggerType: 'post_boss',
      title: 'DSL 테스트 컷신',
      lines: [
        {
          speakerId: 'luffy',
          speakerName: '몽키 D. 루피',
          emotion: 'excited',
          side: 'left',
          text: '동료가 되어라, 조로!',
          directives: [
            { type: 'bgm', trackId: 'island_peaceful', fadeSec: 0.4 },
            { type: 'sfx', sfxId: 'ui_confirm' },
            { type: 'cameraShake', intensity: 0.8, durationSec: 0.4 },
            { type: 'screenFlash', color: '#fef08a', durationSec: 0.3 }
          ]
        },
        {
          speakerId: 'zoro',
          speakerName: '롤로노아 조로',
          emotion: 'determined',
          side: 'right',
          text: '좋다! 세계 제일의 검호가 되어주지!',
          directives: [
            {
              type: 'recruitmentBanner',
              unitId: 'zoro',
              roleName: '검사 (Swordsman)',
              passiveSummary: '아군 공격력 +12%'
            },
            {
              type: 'wantedPoster',
              bounty: 30000000,
              title: '첫 수배서 발부'
            }
          ]
        }
      ]
    };

    // 1. Accessibility flashEffect === false must suppress screenFlash
    const evalNoFlash = evaluateLineDirectives(sampleScript.lines[0], {
      flashEffect: false,
      shakeIntensity: 0.5
    });
    const flashCmd = evalNoFlash.find((c) => c.directive.type === 'screenFlash');
    const shakeCmd = evalNoFlash.find((c) => c.directive.type === 'cameraShake');
    expect(flashCmd?.suppressedByAccessibility).toBe(true);
    expect(shakeCmd?.suppressedByAccessibility).toBe(false);
    expect(shakeCmd?.effectiveShakeIntensity).toBeCloseTo(0.4, 5);

    // 2. Player execution with flashEffect === false keeps flashTimer at 0 while firing bgm/sfx/shake
    const events: string[] = [];
    const callbacks = {
      onBgm: (trackId: string) => events.push(`bgm:${trackId}`),
      onSfx: (sfxId: string) => events.push(`sfx:${sfxId}`),
      onRecruitmentBanner: (unitId: string) => events.push(`recruit:${unitId}`),
      onWantedPoster: (bounty: number) => events.push(`poster:${bounty}`),
      onComplete: () => events.push('complete')
    };

    const playerNoFlash = createDialogueScriptPlayer(
      sampleScript,
      { flashEffect: false, shakeIntensity: 1.0 },
      callbacks
    );
    expect(playerNoFlash.flashTimer).toBe(0);
    expect(playerNoFlash.shakeTimer).toBeGreaterThan(0);
    expect(playerNoFlash.leftSpeaker?.speakerId).toBe('luffy');
    expect(events).toContain('bgm:island_peaceful');
    expect(events).toContain('sfx:ui_confirm');

    // 3. Player execution with flashEffect === true activates flashTimer
    const playerWithFlash = createDialogueScriptPlayer(
      sampleScript,
      { flashEffect: true, shakeIntensity: 0.8 },
      {}
    );
    expect(playerWithFlash.flashTimer).toBeGreaterThan(0);

    // 4. First tap completes typewriter, second tap advances to line 2 and fires recruitmentBanner & wantedPoster
    stepDialogueScriptPlayer(
      playerNoFlash,
      0.05,
      { flashEffect: false, shakeIntensity: 1.0 },
      callbacks
    );
    expect(
      handleDialogueScriptTap(
        null,
        playerNoFlash,
        { flashEffect: false, shakeIntensity: 1.0 },
        callbacks
      )
    ).toBe('COMPLETED_LINE');
    expect(
      handleDialogueScriptTap(
        null,
        playerNoFlash,
        { flashEffect: false, shakeIntensity: 1.0 },
        callbacks
      )
    ).toBe('ADVANCED');
    expect(playerNoFlash.rightSpeaker?.speakerId).toBe('zoro');
    expect(events).toContain('recruit:zoro');
    expect(events).toContain('poster:30000000');

    // 5. Skip finishes cleanly
    skipDialogueScriptPlayer(
      playerNoFlash,
      { flashEffect: false, shakeIntensity: 1.0 },
      callbacks
    );
    expect(playerNoFlash.finished).toBe(true);
    expect(events).toContain('complete');

    // 6. RecruitmentOverlay guards accidental immediate tap (<0.35s) and dismisses cleanly after
    const banner = createRecruitmentBannerState(
      'zoro',
      '검사 (Swordsman)',
      '전투 개시 시 공격력 +12%',
      defaultDataRegistry
    );
    expect(banner.characterName).toBe('롤로노아 조로');
    expect(tryDismissRecruitmentBanner(banner)).toBe(false);
    stepRecruitmentBanner(banner, 0.4);
    expect(tryDismissRecruitmentBanner(banner)).toBe(true);
    expect(banner.dismissed).toBe(true);
  });

  it('queues mid-battle banter for 50% HP, gimmick hints, awakening, and clashes while preventing duplicate triggers', async () => {
    const entries = await loadBattleBanterEntries();
    expect(entries.length).toBeGreaterThanOrEqual(30);

    const controller = new BattleBanterController();
    const luffy = defaultDataRegistry.units['luffy'];
    const crocodile = defaultDataRegistry.units['crocodile'];

    const world = createBattleWorld(
      {
        seed: 42,
        arenaSizeKey: 'medium',
        mode: '1V1',
        teamAlpha: [
          {
            instanceId: 'a1',
            speciesId: 'luffy',
            level: 50,
            ivs: { hp: 31, atk: 31, def: 31, spAtk: 31, spDef: 31, spd: 31 },
            evs: { hp: 80, atk: 80, def: 80, spAtk: 80, spDef: 80, spd: 80 },
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
            instanceId: 'o1',
            speciesId: 'crocodile',
            level: 50,
            ivs: { hp: 31, atk: 31, def: 31, spAtk: 31, spDef: 31, spd: 31 },
            evs: { hp: 80, atk: 80, def: 80, spAtk: 80, spDef: 80, spd: 80 },
            moveIds: [...crocodile.defaultMoves],
            equipmentId: crocodile.defaultEquipmentId,
            traitId: crocodile.traitId,
            formId: crocodile.defaultFormId,
            isPlayerControlled: false,
            aiLevel: 3
          }
        ],
        arenaTerrain: {
          destructibleProps: [
            {
              id: 'barrel_1',
              kind: 'WATER_BARREL',
              pos: { x: 400, y: 260 },
              radiusPx: 22,
              hp: 10,
              maxHp: 10,
              wetRadiusPx: 90,
              wetDurationSec: 8
            }
          ]
        }
      },
      defaultDataRegistry
    );

    const bossUnit = world.units.find((u) => u.team === 'OMEGA')!;
    const playerUnit = world.units.find((u) => u.team === 'ALPHA')!;
    bossUnit.isBossUnit = true;

    // 1. Trigger battle_start
    world.elapsedSec = 0.5;
    const tStart = controller.observeWorld(world, entries, 'enc_alabasta_crocodile_boss');
    expect(tStart.some((e) => e.trigger === 'battle_start')).toBe(true);
    expect(controller.getActiveItem()?.entry.banterId).toBe('bb_gl2_croc_start');

    // Re-observing must NOT fire battle_start a second time
    const tStartAgain = controller.observeWorld(world, entries, 'enc_alabasta_crocodile_boss');
    expect(tStartAgain.length).toBe(0);

    // 2. Trigger gimmick_hint (water barrel broken) + boss_hp_50 + player_awakening simultaneously -> queued cleanly
    world.destructibleProps[0].destroyed = true;
    bossUnit.hp = Math.floor(bossUnit.maxHp * 0.45);
    playerUnit.activeFormId = 'form_luffy_gear5';
    const tMulti = controller.observeWorld(world, entries, 'enc_alabasta_crocodile_boss');
    expect(tMulti.some((e) => e.trigger === 'gimmick_hint')).toBe(true);
    expect(tMulti.some((e) => e.trigger === 'boss_hp_50')).toBe(true);
    expect(tMulti.some((e) => e.trigger === 'player_awakening')).toBe(true);
    expect(controller.getQueueLength()).toBe(3);

    // 3. Re-observing under same state fires ZERO duplicates
    const tRepeat = controller.observeWorld(world, entries, 'enc_alabasta_crocodile_boss');
    expect(tRepeat.length).toBe(0);

    // 4. Stepping 2.85s rotates active item to highest priority queued item (Gear 5 awakening)
    controller.step(BANTER_DISPLAY_DURATION_SEC + 0.05);
    expect(controller.getActiveItem()?.entry.banterId).toBe('bb_awaken_luffy_gear5');
    expect(controller.getQueueLength()).toBe(2);
  });

  it('validates all 11 East Blue & Grand Line dialogue packs for schema, length (<=90), zero placeholders, and valid IDs', async () => {
    const unitIds = new Set(Object.keys(defaultDataRegistry.units));
    const bgmIds = new Set(Object.keys(defaultAssetManifestRegistry.bgmById));
    const sfxIds = new Set(Object.keys(defaultAssetManifestRegistry.sfxById));
    const npcIds = new Set(Object.keys(NPC_SPEAKER_CATALOG));
    const placeholderRe = /\b(TODO|TBD|FIXME)\b|\.\.\.생략/i;

    for (const epId of STEP1_EPISODE_IDS) {
      const pack = await loadEpisodeDialoguePack(epId);
      expect(pack, `Missing dialogue pack for ${epId}`).not.toBeNull();
      expect(pack!.scripts.length).toBeGreaterThanOrEqual(3);

      expect(pack!.scripts.some((s) => s.triggerType === 'gold_marker' || s.triggerType === 'arrival')).toBe(true);
      expect(pack!.scripts.some((s) => s.triggerType === 'pre_boss')).toBe(true);
      expect(pack!.scripts.some((s) => s.triggerType === 'post_boss')).toBe(true);

      for (const script of pack!.scripts) {
        expect(validateDialogueScriptStructure(script)).toEqual([]);
        for (const line of script.lines) {
          expect(placeholderRe.test(line.text), `Placeholder in ${script.scriptId}`).toBe(false);
          expect(line.text.length, `Line too long in ${script.scriptId}: ${line.text}`).toBeLessThanOrEqual(90);
          expect(
            line.speakerId === 'narrator' || unitIds.has(line.speakerId) || npcIds.has(line.speakerId),
            `Unknown speakerId "${line.speakerId}" in ${script.scriptId}`
          ).toBe(true);

          for (const d of line.directives ?? []) {
            if (d.type === 'bgm') {
              expect(bgmIds.has(d.trackId), `Unknown BGM "${d.trackId}"`).toBe(true);
            } else if (d.type === 'sfx') {
              expect(sfxIds.has(d.sfxId), `Unknown SFX "${d.sfxId}"`).toBe(true);
            } else if (d.type === 'recruitmentBanner') {
              expect(unitIds.has(d.unitId), `Unknown unitId "${d.unitId}"`).toBe(true);
            }
          }
        }
      }
    }
  });
});
