export type StorySeaZoneId = 'east_blue' | 'grand_line' | 'new_world';

export type StoryPortraitEmotion =
  | 'normal'
  | 'angry'
  | 'determined'
  | 'shocked'
  | 'smirk'
  | 'sad'
  | 'excited'
  | 'battle_cry';

export const ALL_STORY_PORTRAIT_EMOTIONS: readonly StoryPortraitEmotion[] = [
  'normal',
  'angry',
  'determined',
  'shocked',
  'smirk',
  'sad',
  'excited',
  'battle_cry'
] as const;

export type StoryCameraShot3D =
  | 'wide_establishing'
  | 'over_shoulder'
  | 'boss_low_angle'
  | 'orbit_hero'
  | 'closeup_speaker'
  | 'dramatic_dutch';

export type StoryWeather3D =
  | 'clear'
  | 'rain'
  | 'snow'
  | 'cherry_blossom'
  | 'sandstorm'
  | 'fog'
  | 'storm'
  | 'aurora';

export type StoryVfx3DEffect =
  | 'burst_aura'
  | 'lightning_strike'
  | 'haki_clash'
  | 'sakura_gust'
  | 'shockwave_ring';

export type StoryAnimClipName =
  | 'IDLE'
  | 'RUN'
  | 'DASH'
  | 'COMBO_1'
  | 'COMBO_2'
  | 'COMBO_3'
  | 'COMBO_4'
  | 'AIR_LAUNCH'
  | 'BURST_AWAKENING'
  | 'VICTORY'
  | 'GUARD'
  | 'PARRY'
  | 'HIT'
  | 'DOWN';

export const ALL_STORY_ANIM_CLIPS: readonly StoryAnimClipName[] = [
  'IDLE',
  'RUN',
  'DASH',
  'COMBO_1',
  'COMBO_2',
  'COMBO_3',
  'COMBO_4',
  'AIR_LAUNCH',
  'BURST_AWAKENING',
  'VICTORY',
  'GUARD',
  'PARRY',
  'HIT',
  'DOWN'
] as const;

export interface StoryStageActorSpec {
  actorId: string;
  unitId: string;
  position: [number, number, number];
  rotationYDeg: number;
  animClip: StoryAnimClipName;
  drawWeapons?: boolean;
}

export type StoryDirective3D =
  | {
      type: 'chapter_card';
      chapterNo: string;
      act: 1 | 2 | 3;
      title: string;
      subtitle: string;
    }
  | {
      type: 'stage_3d';
      arenaId: string;
      timeOfDay: 'morning' | 'day' | 'sunset' | 'night';
      weather?: StoryWeather3D;
      actors: StoryStageActorSpec[];
    }
  | {
      type: 'camera_3d';
      shot: StoryCameraShot3D;
      targetActorId?: string;
      secondaryActorId?: string;
      fov?: number;
      durationMs: number;
      easing?: 'linear' | 'easeOutCubic' | 'easeInOutQuad';
    }
  | {
      type: 'actor_action';
      actorId: string;
      animClip: StoryAnimClipName;
      loop?: boolean;
      rimColorHex?: string;
      rimIntensity?: number;
      bloomBoost?: number;
    }
  | {
      type: 'line';
      speakerId: string;
      speakerName: string;
      side: 'left' | 'right' | 'center';
      emotion: StoryPortraitEmotion;
      text: string;
      focusActorId?: string;
      sfx?: string;
    }
  | {
      type: 'narration';
      text: string;
      style: 'parchment' | 'dramatic_dark';
    }
  | {
      type: 'vfx_3d';
      effect: StoryVfx3DEffect;
      targetActorId?: string;
    }
  | {
      type: 'bgm';
      trackId: string;
      fadeMs?: number;
    }
  | {
      type: 'start_musou_battle';
      battleId: string;
      bossUnitId: string;
      hordeCount: number;
      preDialogueDoneFlag: string;
    };

export function assertNeverDirective(x: never): never {
  throw new Error(`Unhandled StoryDirective3D variant: ${JSON.stringify(x)}`);
}

export type BattleBanterTriggerKind =
  | 'bossHpBelow'
  | 'onArmorBreak'
  | 'onBurstActivated'
  | 'onJustParry'
  | 'onKoMilestone'
  | 'onGimmickHit';

export interface BattleBanterRule {
  banterId: string;
  trigger: BattleBanterTriggerKind;
  threshold?: number;
  gimmickTag?: string;
  speakerId: string;
  speakerName: string;
  emotion: StoryPortraitEmotion;
  text: string;
}

export interface StoryUnlockPayload {
  recruitUnits: string[];
  unlockForms: string[];
  unlockSpecialSlots: Array<0 | 1 | 2 | 3>;
  unlockSeaZones: StorySeaZoneId[];
  upgradeShip?: 'going_merry' | 'thousand_sunny';
  worldFlags: string[];
  bountyIncrease: number;
}

export interface StoryChapterScript {
  chapterId: string;
  chapterNo: string;
  act: 1 | 2 | 3;
  title: string;
  subtitle: string;
  summary2Lines: [string, string];
  prerequisiteChapterIds: string[];
  legacyEpisodeId?: string;
  arenaId: string;
  bossUnitId: string;
  intro: StoryDirective3D[];
  preBattle: StoryDirective3D[];
  battleBanters: BattleBanterRule[];
  epilogue: StoryDirective3D[];
  unlocks: StoryUnlockPayload;
}

export type StoryChapterStatus =
  | 'LOCKED'
  | 'AVAILABLE'
  | 'INTRO_SEEN'
  | 'BATTLE_READY'
  | 'CLEARED';

export interface StoryProgressState {
  chapters: Record<string, StoryChapterStatus>;
  clearedChapterIds: string[];
  currentChapterId: string | null;
  recruitedUnits: string[];
  unlockedForms: string[];
  unlockedSpecialSlots: Array<0 | 1 | 2 | 3>;
  unlockedSeaZones: StorySeaZoneId[];
  activeShipId: 'going_merry' | 'thousand_sunny';
  worldFlags: string[];
  totalStoryBounty: number;
}

/**
 * Fallback portrait unitId mapping for narrative supporting NPC speakers who have portraits/proxies
 * tied to canonical combat species IDs.
 */
export const STORY_NPC_SPEAKER_PORTRAIT_MAP: Record<string, string> = {
  npc_makino: 'nami',
  npc_shanks: 'luffy',
  npc_koby: 'usopp',
  npc_mihawk: 's_hawk',
  npc_vivi: 'robin',
  npc_hiriluk: 'chopper',
  npc_dorry: 'loki',
  npc_brogy: 'loki',
  npc_ace: 'luffy',
  npc_vegapunk: 'franky'
};
