import ch01 from '../dialogues/chapters/ch01_foosha.json';
import ch02 from '../dialogues/chapters/ch02_shells_town.json';
import ch03 from '../dialogues/chapters/ch03_orange_town.json';
import ch03b from '../dialogues/chapters/ch03b_syrup_interlude.json';
import ch04 from '../dialogues/chapters/ch04_baratie.json';
import ch05 from '../dialogues/chapters/ch05_arlong_park.json';
import ch06 from '../dialogues/chapters/ch06_loguetown.json';
import ch07 from '../dialogues/chapters/ch07_drum_kingdom.json';
import ch08 from '../dialogues/chapters/ch08_alabasta.json';
import ch09 from '../dialogues/chapters/ch09_skypiea.json';
import ch10 from '../dialogues/chapters/ch10_water_seven.json';
import ch11 from '../dialogues/chapters/ch11_thriller_bark.json';
import ch12 from '../dialogues/chapters/ch12_marineford.json';
import ch13 from '../dialogues/chapters/ch13_fishman_island.json';
import ch14 from '../dialogues/chapters/ch14_dressrosa.json';
import ch15 from '../dialogues/chapters/ch15_totto_land.json';
import ch16 from '../dialogues/chapters/ch16_wano_country.json';
import ch17 from '../dialogues/chapters/ch17_egghead.json';
import ch18 from '../dialogues/chapters/ch18_elbaf.json';
import type { StoryChapterScript } from './types';

export const STORY_CHAPTERS_LIST: readonly StoryChapterScript[] = [
  ch01 as unknown as StoryChapterScript,
  ch02 as unknown as StoryChapterScript,
  ch03 as unknown as StoryChapterScript,
  ch03b as unknown as StoryChapterScript,
  ch04 as unknown as StoryChapterScript,
  ch05 as unknown as StoryChapterScript,
  ch06 as unknown as StoryChapterScript,
  ch07 as unknown as StoryChapterScript,
  ch08 as unknown as StoryChapterScript,
  ch09 as unknown as StoryChapterScript,
  ch10 as unknown as StoryChapterScript,
  ch11 as unknown as StoryChapterScript,
  ch12 as unknown as StoryChapterScript,
  ch13 as unknown as StoryChapterScript,
  ch14 as unknown as StoryChapterScript,
  ch15 as unknown as StoryChapterScript,
  ch16 as unknown as StoryChapterScript,
  ch17 as unknown as StoryChapterScript,
  ch18 as unknown as StoryChapterScript
];

export const STORY_CHAPTERS_MAP: ReadonlyMap<string, StoryChapterScript> = new Map(
  STORY_CHAPTERS_LIST.map((ch) => [ch.chapterId, ch])
);

export function getStoryChapterById(
  chapterId: string
): StoryChapterScript | undefined {
  return STORY_CHAPTERS_MAP.get(chapterId);
}

export function getStoryChaptersByAct(
  act: 1 | 2 | 3
): readonly StoryChapterScript[] {
  return STORY_CHAPTERS_LIST.filter((ch) => ch.act === act);
}
