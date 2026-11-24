import type {
  StoryChapterScript,
  StoryChapterStatus,
  StoryProgressState
} from '../../data/story/types';
import type { GameDataRegistry } from '../types/dataSchemas';
import type { RpgCampaignState, SeaZoneId } from '../types/rpgSchemas';

const STATUS_RANK: Record<StoryChapterStatus, number> = {
  LOCKED: 0,
  AVAILABLE: 1,
  INTRO_SEEN: 2,
  BATTLE_READY: 3,
  CLEARED: 4
};

export const STRAW_HAT_CREW_ORDER: readonly string[] = [
  'luffy',
  'zoro',
  'nami',
  'usopp',
  'sanji',
  'chopper',
  'robin',
  'franky',
  'brook',
  'jinbe'
] as const;

export function normalizeStoryUnitId(rawUnitId: string): string {
  return rawUnitId.endsWith('_base') ? rawUnitId.slice(0, -5) : rawUnitId;
}

function pushUnique<T>(list: T[], item: T): void {
  if (!list.includes(item)) {
    list.push(item);
  }
}

export function createInitialStoryProgress(
  chapters: readonly StoryChapterScript[]
): StoryProgressState {
  const statusMap: Record<string, StoryChapterStatus> = {};
  let firstAvailable: string | null = null;

  for (const ch of chapters) {
    const canStart = ch.prerequisiteChapterIds.length === 0;
    statusMap[ch.chapterId] = canStart ? 'AVAILABLE' : 'LOCKED';
    if (canStart && !firstAvailable) {
      firstAvailable = ch.chapterId;
    }
  }

  return {
    chapters: statusMap,
    clearedChapterIds: [],
    currentChapterId: firstAvailable,
    recruitedUnits: ['luffy'],
    unlockedForms: [],
    unlockedSpecialSlots: [0, 1],
    unlockedSeaZones: ['east_blue'],
    activeShipId: 'going_merry',
    worldFlags: [],
    totalStoryBounty: 0
  };
}

export function recomputeChapterAvailability(
  progress: StoryProgressState,
  chapters: readonly StoryChapterScript[]
): void {
  const clearedSet = new Set(progress.clearedChapterIds);
  let nextAvailable: string | null = null;

  for (const ch of chapters) {
    if (clearedSet.has(ch.chapterId)) {
      progress.chapters[ch.chapterId] = 'CLEARED';
      continue;
    }
    const prereqsMet = ch.prerequisiteChapterIds.every((pid) => clearedSet.has(pid));
    const cur = progress.chapters[ch.chapterId] ?? 'LOCKED';
    if (prereqsMet) {
      if (cur === 'LOCKED') {
        progress.chapters[ch.chapterId] = 'AVAILABLE';
      }
      if (!nextAvailable) {
        nextAvailable = ch.chapterId;
      }
    } else {
      progress.chapters[ch.chapterId] = 'LOCKED';
    }
  }

  progress.currentChapterId = nextAvailable ?? (chapters[chapters.length - 1]?.chapterId ?? null);
}

function applyUnlocksToProgressOnly(
  progress: StoryProgressState,
  chapter: StoryChapterScript
): void {
  const u = chapter.unlocks;
  for (const rawUid of u.recruitUnits) {
    pushUnique(progress.recruitedUnits, normalizeStoryUnitId(rawUid));
  }
  for (const formId of u.unlockForms) {
    pushUnique(progress.unlockedForms, formId);
  }
  for (const slotIdx of u.unlockSpecialSlots) {
    pushUnique(progress.unlockedSpecialSlots, slotIdx);
  }
  for (const zone of u.unlockSeaZones) {
    pushUnique(progress.unlockedSeaZones, zone);
  }
  if (u.upgradeShip) {
    if (u.upgradeShip === 'thousand_sunny' || progress.activeShipId !== 'thousand_sunny') {
      progress.activeShipId = u.upgradeShip;
    }
  }
  for (const flag of u.worldFlags) {
    pushUnique(progress.worldFlags, flag);
  }
  progress.totalStoryBounty += Math.max(0, u.bountyIncrease);
}

export function advanceChapterStatus(
  progress: StoryProgressState,
  chapterId: string,
  targetStatus: Exclude<StoryChapterStatus, 'LOCKED'>,
  chapters: readonly StoryChapterScript[]
): { changed: boolean; status: StoryChapterStatus } {
  const current = progress.chapters[chapterId] ?? 'LOCKED';
  if (current === 'LOCKED') {
    return { changed: false, status: current };
  }
  if (STATUS_RANK[targetStatus] <= STATUS_RANK[current]) {
    return { changed: false, status: current };
  }
  if (targetStatus === 'CLEARED') {
    const chapter = chapters.find((c) => c.chapterId === chapterId);
    if (!chapter) return { changed: false, status: current };
    completeChapterWithUnlocks(progress, chapterId, chapters);
    return { changed: true, status: 'CLEARED' };
  }
  progress.chapters[chapterId] = targetStatus;
  return { changed: true, status: targetStatus };
}

export function completeChapterWithUnlocks(
  progress: StoryProgressState,
  chapterId: string,
  chapters: readonly StoryChapterScript[],
  campaign?: RpgCampaignState,
  gameRegistry?: GameDataRegistry
): {
  newlyCleared: boolean;
  recruitedNow: string[];
  unlockedFormsNow: string[];
  upgradedShip: string | null;
} {
  const chapter = chapters.find((c) => c.chapterId === chapterId);
  if (!chapter) {
    throw new Error(`Unknown story chapterId: ${chapterId}`);
  }

  const alreadyCleared = progress.clearedChapterIds.includes(chapterId);
  if (alreadyCleared) {
    progress.chapters[chapterId] = 'CLEARED';
    recomputeChapterAvailability(progress, chapters);
    return {
      newlyCleared: false,
      recruitedNow: [],
      unlockedFormsNow: [],
      upgradedShip: null
    };
  }

  const prevUnits = new Set(progress.recruitedUnits);
  const prevForms = new Set(progress.unlockedForms);
  const prevShip = progress.activeShipId;

  progress.chapters[chapterId] = 'CLEARED';
  progress.clearedChapterIds.push(chapterId);
  applyUnlocksToProgressOnly(progress, chapter);
  recomputeChapterAvailability(progress, chapters);

  if (campaign) {
    syncStoryProgressIntoCampaign(progress, chapter, campaign, gameRegistry);
  }

  const recruitedNow = progress.recruitedUnits.filter((u) => !prevUnits.has(u));
  const unlockedFormsNow = progress.unlockedForms.filter((f) => !prevForms.has(f));
  const upgradedShip =
    progress.activeShipId !== prevShip ? progress.activeShipId : null;

  return {
    newlyCleared: true,
    recruitedNow,
    unlockedFormsNow,
    upgradedShip
  };
}

export function syncStoryProgressIntoCampaign(
  progress: Readonly<StoryProgressState>,
  clearedChapter: StoryChapterScript,
  campaign: RpgCampaignState,
  gameRegistry?: GameDataRegistry
): void {
  campaign.storyProgress = cloneStoryProgress(progress);

  if (
    clearedChapter.legacyEpisodeId &&
    !campaign.completedEpisodes.includes(clearedChapter.legacyEpisodeId)
  ) {
    campaign.completedEpisodes.push(clearedChapter.legacyEpisodeId);
  }

  for (const rawUid of clearedChapter.unlocks.recruitUnits) {
    const uid = normalizeStoryUnitId(rawUid);
    if (gameRegistry && !gameRegistry.units[uid]) continue;
    pushUnique(campaign.recruitedUnitIds, uid);
    if (campaign.activePartyUnitIds.length < 4) {
      pushUnique(campaign.activePartyUnitIds, uid);
    }
  }

  for (const formId of clearedChapter.unlocks.unlockForms) {
    if (gameRegistry && !gameRegistry.forms[formId]) continue;
    for (const uid of campaign.recruitedUnitIds) {
      if (formId.includes(uid)) {
        const cur = campaign.unitUnlockedForms[uid] ?? [];
        pushUnique(cur, formId);
        campaign.unitUnlockedForms[uid] = cur;
      }
    }
  }

  if (clearedChapter.unlocks.upgradeShip === 'thousand_sunny') {
    pushUnique(campaign.unlockedShips, 'thousand_sunny');
    campaign.ship.shipId = 'thousand_sunny';
  }

  for (const flag of clearedChapter.unlocks.worldFlags) {
    campaign.episodeFlags[flag] = true;
  }

  campaign.totalCrewBounty += Math.max(0, clearedChapter.unlocks.bountyIncrease);
  const currentLuffyBounty = campaign.unitBounties['luffy'] ?? 0;
  campaign.unitBounties['luffy'] =
    currentLuffyBounty + Math.max(0, clearedChapter.unlocks.bountyIncrease);
}

export function cloneStoryProgress(
  src: Readonly<StoryProgressState>
): StoryProgressState {
  return {
    chapters: { ...src.chapters },
    clearedChapterIds: [...src.clearedChapterIds],
    currentChapterId: src.currentChapterId,
    recruitedUnits: [...src.recruitedUnits],
    unlockedForms: [...src.unlockedForms],
    unlockedSpecialSlots: [...src.unlockedSpecialSlots],
    unlockedSeaZones: [...src.unlockedSeaZones],
    activeShipId: src.activeShipId,
    worldFlags: [...src.worldFlags],
    totalStoryBounty: src.totalStoryBounty
  };
}

/**
 * Losslessly reconstructs StoryProgressState from legacy Save v0..v5 `completedEpisodes[]`.
 */
export function deriveStoryProgressFromLegacyEpisodes(
  completedEpisodes: readonly string[],
  chapters: readonly StoryChapterScript[]
): StoryProgressState {
  const progress = createInitialStoryProgress(chapters);
  const doneSet = new Set(completedEpisodes);
  const byId = new Map<string, StoryChapterScript>();
  for (const ch of chapters) {
    byId.set(ch.chapterId, ch);
  }

  const markClearedWithPrereqs = (chapterId: string): void => {
    const ch = byId.get(chapterId);
    if (!ch || progress.clearedChapterIds.includes(chapterId)) return;
    for (const prereqId of ch.prerequisiteChapterIds) {
      markClearedWithPrereqs(prereqId);
    }
    progress.clearedChapterIds.push(ch.chapterId);
    progress.chapters[ch.chapterId] = 'CLEARED';
    applyUnlocksToProgressOnly(progress, ch);
  };

  for (const ch of chapters) {
    if (ch.legacyEpisodeId && doneSet.has(ch.legacyEpisodeId)) {
      markClearedWithPrereqs(ch.chapterId);
    }
  }

  recomputeChapterAvailability(progress, chapters);
  return progress;
}

/**
 * Dynamic LegalityValidator check for StoryStateMachine progress:
 * ensures 0 false positives across all legitimate clears while catching tampered chapters/bounty/unlocks.
 */
export function validateStoryProgressLegality(
  progress: Readonly<StoryProgressState>,
  chapters: readonly StoryChapterScript[]
): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const byId = new Map<string, StoryChapterScript>();
  for (const ch of chapters) {
    byId.set(ch.chapterId, ch);
  }

  const clearedSet = new Set<string>(progress.clearedChapterIds);
  let expectedMaxBounty = 0;
  const expectedUnits = new Set<string>(['luffy']);
  const expectedForms = new Set<string>();
  const expectedZones = new Set<SeaZoneId>(['east_blue']);
  let expectedSunny = false;

  for (const chId of clearedSet) {
    const ch = byId.get(chId);
    if (!ch) {
      errors.push(`존재하지 않는 스토리 챕터 완료 기록: ${chId}`);
      continue;
    }
    for (const prereq of ch.prerequisiteChapterIds) {
      if (!clearedSet.has(prereq)) {
        errors.push(`선행 스토리 챕터(${prereq}) 미완료 상태에서 ${chId} 클리어 감지`);
      }
    }
    expectedMaxBounty += Math.max(0, ch.unlocks.bountyIncrease);
    for (const u of ch.unlocks.recruitUnits) {
      expectedUnits.add(normalizeStoryUnitId(u));
    }
    for (const f of ch.unlocks.unlockForms) {
      expectedForms.add(f);
    }
    for (const z of ch.unlocks.unlockSeaZones) {
      expectedZones.add(z);
    }
    if (ch.unlocks.upgradeShip === 'thousand_sunny') {
      expectedSunny = true;
    }
  }

  if (progress.totalStoryBounty < 0 || progress.totalStoryBounty > expectedMaxBounty) {
    errors.push(
      `스토리 누적 현상금 범위 위반: ${progress.totalStoryBounty} > 최대 허용 ${expectedMaxBounty}`
    );
  }

  for (const uid of progress.recruitedUnits) {
    const norm = normalizeStoryUnitId(uid);
    if (!expectedUnits.has(norm)) {
      errors.push(`스토리 미해금 동료 감지: ${uid}`);
    }
  }

  for (const formId of progress.unlockedForms) {
    if (!expectedForms.has(formId)) {
      errors.push(`스토리 미해금 각성 폼 감지: ${formId}`);
    }
  }

  for (const z of progress.unlockedSeaZones) {
    if (!expectedZones.has(z)) {
      errors.push(`스토리 미해금 해역 감지: ${z}`);
    }
  }

  if (progress.activeShipId === 'thousand_sunny' && !expectedSunny) {
    errors.push('워터 세븐 챕터(ch10_water_seven) 미완료 상태에서 사우전드 써니호 보유 감지');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

export function getStoryCompletionSummary(
  progress: Readonly<StoryProgressState>,
  chapters: readonly StoryChapterScript[]
): {
  clearedCount: number;
  totalCount: number;
  percent: number;
  strawHatCount: number;
  recruitedCrewChecklist: Array<{ unitId: string; recruited: boolean }>;
  actBreakdown: Array<{ act: 1 | 2 | 3; cleared: number; total: number }>;
} {
  const clearedSet = new Set(progress.clearedChapterIds);
  const recruitedSet = new Set(progress.recruitedUnits.map(normalizeStoryUnitId));

  const checklist = STRAW_HAT_CREW_ORDER.map((uid) => ({
    unitId: uid,
    recruited: recruitedSet.has(uid)
  }));

  const acts: Array<1 | 2 | 3> = [1, 2, 3];
  const actBreakdown = acts.map((act) => {
    const inAct = chapters.filter((c) => c.act === act);
    const cleared = inAct.filter((c) => clearedSet.has(c.chapterId)).length;
    return { act, cleared, total: inAct.length };
  });

  const clearedCount = progress.clearedChapterIds.length;
  const totalCount = Math.max(1, chapters.length);

  return {
    clearedCount,
    totalCount,
    percent: Math.round((clearedCount / totalCount) * 100),
    strawHatCount: checklist.filter((c) => c.recruited).length,
    recruitedCrewChecklist: checklist,
    actBreakdown
  };
}
