import type {
  BattleContext,
  RpgCampaignState,
  SeaZoneId
} from '../core/types/rpgSchemas';

export type StoryLoopMode = 'FREE_ROAM' | 'STORY_MISSION';

export type StoryNodeId =
  | 'ch1_foosha_talk'
  | 'ch1_first_sail'
  | 'ch1_shells_town'
  | 'ch2_orange_town'
  | 'ch2_baratie'
  | 'ch2_arlong_park'
  | 'ch2_loguetown'
  | 'ch3_grand_line'
  | 'ch4_new_world'
  | 'epilogue_free_roam';

export const STORY_FLAGS = {
  OPENING_SEEN: 'story_opening_seen',
  FOOSHA_TALK_DONE: 'flag_foosha_briefed',
  FIRST_SAIL_CLEARED: 'flag_first_sail_tutorial_cleared',
  ZORO_FREED: 'flag_zoro_freed',
  SHELLS_BOSS_CLEARED: 'flag_east_blue_boss_cleared'
} as const;

export interface StoryNodeSnapshot {
  nodeId: StoryNodeId;
  chapterLabel: string;
  title: string;
  objectiveText: string;
  targetZoneId: SeaZoneId;
  targetIslandId: string | null;
  /** Optional target inside an island map (960x540 space) */
  targetIslandPos?: { x: number; y: number };
  isPrologue: boolean;
  freeRoamUnlocked: boolean;
}

/**
 * GTA & Pokémon-Resonance style Story-Driven Free-Roam State Machine.
 * Persists 100% inside `campaign.episodeFlags` to preserve v5 save & core compatibility.
 */
export class StoryDirector {
  private loopMode: StoryLoopMode = 'FREE_ROAM';
  private activeMissionId: string | null = null;
  private activeMissionTitle: string | null = null;
  private highlightGoldMarkerTimer = 0;

  public getLoopMode(): StoryLoopMode {
    return this.loopMode;
  }

  public getActiveMission(): { id: string; title: string } | null {
    if (this.loopMode !== 'STORY_MISSION' || !this.activeMissionId) return null;
    return {
      id: this.activeMissionId,
      title: this.activeMissionTitle ?? this.activeMissionId
    };
  }

  public triggerHighlightGoldMarker(durationSec = 4.0): void {
    this.highlightGoldMarkerTimer = Math.max(this.highlightGoldMarkerTimer, durationSec);
  }

  public isGoldMarkerHighlighted(): boolean {
    return this.highlightGoldMarkerTimer > 0;
  }

  public stepTimers(dt: number): void {
    if (this.highlightGoldMarkerTimer > 0) {
      this.highlightGoldMarkerTimer = Math.max(0, this.highlightGoldMarkerTimer - dt);
    }
  }

  /**
   * Initializes prologue state when starting a New Adventure after Opening Narration.
   */
  public startNewAdventurePrologue(campaign: RpgCampaignState): StoryNodeSnapshot {
    campaign.episodeFlags[STORY_FLAGS.OPENING_SEEN] = true;
    delete campaign.episodeFlags[STORY_FLAGS.FOOSHA_TALK_DONE];
    delete campaign.episodeFlags[STORY_FLAGS.FIRST_SAIL_CLEARED];
    delete campaign.episodeFlags[STORY_FLAGS.ZORO_FREED];
    delete campaign.episodeFlags[STORY_FLAGS.SHELLS_BOSS_CLEARED];
    this.loopMode = 'FREE_ROAM';
    this.activeMissionId = null;
    this.activeMissionTitle = null;
    return this.getCurrentNode(campaign);
  }

  /**
   * Synchronizes existing v5 saves transparently:
   * Any save that already cleared episodes or recruited crew resumes directly in FREE_ROAM
   * without forcing the Chapter 1 opening prologue.
   */
  public syncFromLoadedCampaign(campaign: RpgCampaignState): StoryNodeSnapshot {
    const hasLegacyProgress =
      campaign.completedEpisodes.length > 0 ||
      campaign.recruitedUnitIds.length > 1 ||
      Boolean(campaign.episodeFlags[STORY_FLAGS.SHELLS_BOSS_CLEARED]) ||
      Boolean(campaign.episodeFlags[STORY_FLAGS.ZORO_FREED]);

    if (hasLegacyProgress) {
      campaign.episodeFlags[STORY_FLAGS.OPENING_SEEN] = true;
      campaign.episodeFlags[STORY_FLAGS.FOOSHA_TALK_DONE] = true;
      campaign.episodeFlags[STORY_FLAGS.FIRST_SAIL_CLEARED] = true;
    }

    this.loopMode = 'FREE_ROAM';
    this.activeMissionId = null;
    this.activeMissionTitle = null;
    return this.getCurrentNode(campaign);
  }

  public enterStoryMission(missionId: string, title: string): void {
    this.loopMode = 'STORY_MISSION';
    this.activeMissionId = missionId;
    this.activeMissionTitle = title;
  }

  public completeStoryMission(
    campaign: RpgCampaignState,
    flagToSet?: string
  ): { nextNode: StoryNodeSnapshot; notice: string | null } {
    if (flagToSet) {
      campaign.episodeFlags[flagToSet] = true;
    }
    this.loopMode = 'FREE_ROAM';
    this.activeMissionId = null;
    this.activeMissionTitle = null;

    const nextNode = this.getCurrentNode(campaign);
    let notice: string | null = null;
    if (flagToSet === STORY_FLAGS.FIRST_SAIL_CLEARED) {
      notice =
        '⚓ 자유 항해 해금! 이제 이스트 블루를 자유 탐험하거나 골드 마커(쉘즈타운)로 향하세요!';
    } else if (flagToSet === STORY_FLAGS.SHELLS_BOSS_CLEARED) {
      notice =
        '⚔ 제1장 완료! 롤로노아 조로가 정식 합류했습니다. 자유 탐험 또는 다음 골드 마커로 이동하세요!';
    }
    return { nextNode, notice };
  }

  public abortStoryMissionToFreeRoam(): void {
    this.loopMode = 'FREE_ROAM';
    this.activeMissionId = null;
    this.activeMissionTitle = null;
  }

  public shouldTriggerFirstSailTutorial(campaign: RpgCampaignState): boolean {
    return (
      Boolean(campaign.episodeFlags[STORY_FLAGS.FOOSHA_TALK_DONE]) &&
      !campaign.episodeFlags[STORY_FLAGS.FIRST_SAIL_CLEARED] &&
      !campaign.completedEpisodes.includes('ep_east_blue_start')
    );
  }

  public createAlvidaTutorialBattleContext(): BattleContext {
    return {
      sourceScene: 'SEA_SAILING',
      zoneId: 'east_blue',
      islandId: null,
      encounterId: 'enc_ch1_alvida_tutorial',
      encounterName: '알비다 해적단 근해 습격 (첫 출항 튜토리얼)',
      isBoss: false,
      arenaSizeKey: 'medium',
      mode: '1V1',
      enemyUnitIds: ['buggy'],
      aiLevel: 1,
      bountyReward: 5000000,
      berryReward: 5000,
      trainingPointReward: 15,
      setsFlagOnVictory: STORY_FLAGS.FIRST_SAIL_CLEARED,
      completesEpisodeIdOnVictory: null
    };
  }

  public getCurrentNode(campaign: RpgCampaignState): StoryNodeSnapshot {
    const flags = campaign.episodeFlags;
    const done = new Set(campaign.completedEpisodes);

    // Chapter 1-1: Foosha Village walk & talk to Makino (Gold Marker)
    if (!flags[STORY_FLAGS.FOOSHA_TALK_DONE] && !done.has('ep_east_blue_start')) {
      return {
        nodeId: 'ch1_foosha_talk',
        chapterLabel: '제1장: 모험의 여명',
        title: '후샤 마을 출항 준비',
        objectiveText: '후샤 마을의 골드 마커 [마키노]와 대화해 출항 준비를 마치세요.',
        targetZoneId: 'east_blue',
        targetIslandId: 'foosha_shells',
        targetIslandPos: { x: 310, y: 210 },
        isPrologue: true,
        freeRoamUnlocked: false
      };
    }

    // Chapter 1-2: First Sail & Alvida Pirates sea tutorial
    if (!flags[STORY_FLAGS.FIRST_SAIL_CLEARED] && !done.has('ep_east_blue_start')) {
      return {
        nodeId: 'ch1_first_sail',
        chapterLabel: '제1장: 모험의 여명',
        title: '이스트 블루 첫 출항',
        objectiveText:
          '서쪽 [항구 출구]로 출항해 근해의 알비다 해적단을 격퇴하고 자유 항해를 여세요.',
        targetZoneId: 'east_blue',
        targetIslandId: 'foosha_shells',
        targetIslandPos: { x: 58, y: 270 },
        isPrologue: true,
        freeRoamUnlocked: false
      };
    }

    // Chapter 1-3: Shells Town — Free Zoro & defeat Axe-Hand Morgan
    if (!done.has('ep_east_blue_start')) {
      const zoroFreed = Boolean(flags[STORY_FLAGS.ZORO_FREED]);
      return {
        nodeId: 'ch1_shells_town',
        chapterLabel: '제1장: 해적사냥꾼 조로',
        title: '쉘즈타운 해군기지 돌파',
        objectiveText: zoroFreed
          ? '쉘즈타운 동쪽 골드 마커 [도끼손 모건]을 격파하고 조로와 출항하세요.'
          : '골드 마커 [후샤/쉘즈타운]에서 묶인 롤로노아 조로를 구출하세요.',
        targetZoneId: 'east_blue',
        targetIslandId: 'foosha_shells',
        targetIslandPos: zoroFreed ? { x: 810, y: 270 } : { x: 620, y: 230 },
        isPrologue: false,
        freeRoamUnlocked: true
      };
    }

    // Chapter 2: Sequential East Blue Gold Markers (Player may Free-Roam anytime)
    if (!done.has('ep_orange_town')) {
      return {
        nodeId: 'ch2_orange_town',
        chapterLabel: '제2장: 이스트 블루 제패',
        title: '오렌지 마을 — 광대 버기',
        objectiveText: '자유 항해 또는 골드 마커 [오렌지 마을]로 향해 버기를 격파하세요.',
        targetZoneId: 'east_blue',
        targetIslandId: 'orange_town',
        isPrologue: false,
        freeRoamUnlocked: true
      };
    }

    if (!done.has('ep_baratie')) {
      return {
        nodeId: 'ch2_baratie',
        chapterLabel: '제2장: 이스트 블루 제패',
        title: '발라티에 — 상디·우솝 합류',
        objectiveText: '골드 마커 [해상 레스토랑 발라티에]에서 돈 클리크를 격파하세요.',
        targetZoneId: 'east_blue',
        targetIslandId: 'baratie',
        isPrologue: false,
        freeRoamUnlocked: true
      };
    }

    if (!done.has('ep_arlong_park')) {
      return {
        nodeId: 'ch2_arlong_park',
        chapterLabel: '제2장: 이스트 블루 제패',
        title: '아론 파크 — 나미 해방',
        objectiveText: '골드 마커 [아론 파크]로 향해 어인 해적단 아론을 쓰러뜨리세요.',
        targetZoneId: 'east_blue',
        targetIslandId: 'arlong_park',
        isPrologue: false,
        freeRoamUnlocked: true
      };
    }

    if (!done.has('ep_loguetown')) {
      return {
        nodeId: 'ch2_loguetown',
        chapterLabel: '제2장: 시작과 끝의 마을',
        title: '로그타운 돌파 & 리버스 마운틴',
        objectiveText: '골드 마커 [로그타운]을 완료하고 리버스 마운틴으로 진입하세요.',
        targetZoneId: 'east_blue',
        targetIslandId: 'loguetown',
        isPrologue: false,
        freeRoamUnlocked: true
      };
    }

    // Chapter 3: Grand Line
    const grandLineOrder: { ep: string; island: string; label: string }[] = [
      { ep: 'ep_drum_kingdom', island: 'drum_kingdom', label: '드럼 왕국 (쵸파 합류)' },
      { ep: 'ep_alabasta', island: 'alabasta', label: '알라바스타 (크로커다일)' },
      { ep: 'ep_skypiea', island: 'skypiea', label: '하늘섬 스카이피아 (갓 에넬)' },
      { ep: 'ep_water_seven', island: 'water_seven', label: '워터 세븐 (루치 · 프랑키)' },
      { ep: 'ep_thriller_bark', island: 'thriller_bark', label: '스릴러 바크 (모리아 · 브룩)' },
      { ep: 'ep_marineford', island: 'marineford', label: '마린포드 정상전쟁' }
    ];
    const nextGl = grandLineOrder.find((g) => !done.has(g.ep));
    if (nextGl) {
      return {
        nodeId: 'ch3_grand_line',
        chapterLabel: '제3장: 위대한 항로',
        title: nextGl.label,
        objectiveText: `위대한 항로의 골드 마커 [${nextGl.label}]에 도전하세요.`,
        targetZoneId: 'grand_line',
        targetIslandId: nextGl.island,
        isPrologue: false,
        freeRoamUnlocked: true
      };
    }

    // Chapter 4: New World
    const newWorldOrder: { ep: string; island: string; label: string }[] = [
      { ep: 'ep_fishman_island', island: 'fishman_island', label: '어인섬 (징베 합류)' },
      { ep: 'ep_dressrosa', island: 'dressrosa', label: '드레스로자 (도플라밍고)' },
      { ep: 'ep_totto_land', island: 'totto_land', label: '토트랜드 (카타쿠리)' },
      { ep: 'ep_wano', island: 'wano_onigashima', label: '와노쿠니 오니가시마 (카이도)' },
      { ep: 'ep_egghead', island: 'egghead', label: '미래섬 에그헤드 (새턴 성)' },
      { ep: 'ep_elbaf', island: 'elbaf', label: '거인족의 나라 엘바프 (로키)' }
    ];
    const nextNw = newWorldOrder.find((n) => !done.has(n.ep));
    if (nextNw) {
      return {
        nodeId: 'ch4_new_world',
        chapterLabel: '제4장: 신세계 사황 결전',
        title: nextNw.label,
        objectiveText: `신세계의 골드 마커 [${nextNw.label}] 및 로드 포네그리프를 확보하세요.`,
        targetZoneId: 'new_world',
        targetIslandId: nextNw.island,
        isPrologue: false,
        freeRoamUnlocked: true
      };
    }

    return {
      nodeId: 'epilogue_free_roam',
      chapterLabel: '해적왕의 항로 (FREE ROAM)',
      title: '자유 항해 & 엔드게임 정복',
      objectiveText:
        '임펠 다운 6층 · 코리다 콜로세움 · 거대 보스 협동 레이드에 자유롭게 도전하세요!',
      targetZoneId: campaign.currentZoneId,
      targetIslandId: null,
      isPrologue: false,
      freeRoamUnlocked: true
    };
  }
}
