import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ALL_STORY_ANIM_CLIPS,
  ALL_STORY_PORTRAIT_EMOTIONS,
  STORY_NPC_SPEAKER_PORTRAIT_MAP,
  assertNeverDirective,
  type StoryChapterScript
} from '../src/data/story/types';
import {
  STRAW_HAT_CREW_ORDER,
  normalizeStoryUnitId
} from '../src/core/story/StoryStateMachine';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

function readJson<T>(relPath: string): T {
  const abs = path.join(ROOT, relPath);
  return JSON.parse(fs.readFileSync(abs, 'utf-8')) as T;
}

interface UnitEntry {
  id: string;
  name: string;
  traitId: string;
  defaultFormId?: string;
  awakenedFormId?: string;
  forms?: string[];
  defaultMoves: string[];
}

interface FormEntry {
  id: string;
  overrideMoveIds?: string[];
}

interface MoveEntry {
  id: string;
}

interface AbilityEntry {
  id: string;
}

interface EpisodeFileEntry {
  episodeId: string;
  islandId: string;
  seaZoneId: string;
}

interface IslandFileEntry {
  islandId: string;
  episodeId: string;
  npcs: {
    npcId: string;
    name: string;
    dialogueLines: string[];
  }[];
  encounters: {
    encounterId: string;
    enemyUnitIds: string[];
    setsFlagOnVictory: string;
  }[];
}

function main(): void {
  const errors: string[] = [];

  const units = readJson<UnitEntry[]>('src/data/units.json');
  const forms = readJson<FormEntry[]>('src/data/forms.json');
  const moves = readJson<MoveEntry[]>('src/data/moves.json');
  const abilities = readJson<AbilityEntry[]>('src/data/abilities.json');
  const traits = fs.existsSync(path.join(ROOT, 'src/data/traits.json'))
    ? readJson<AbilityEntry[]>('src/data/traits.json')
    : [];

  const episodesDir = path.join(ROOT, 'src/data/episodes');
  const episodeFiles = fs.readdirSync(episodesDir).filter((f) => f.endsWith('.json'));
  const episodes: EpisodeFileEntry[] = episodeFiles.map((f) =>
    readJson<EpisodeFileEntry>(`src/data/episodes/${f}`)
  );

  const unitIds = new Set(units.map((u) => u.id));
  const formIds = new Set(forms.map((f) => f.id));
  const moveIds = new Set(moves.map((m) => m.id));
  const abilityIds = new Set([
    ...abilities.map((a) => a.id),
    ...traits.map((t) => t.id)
  ]);
  const episodeIds = new Set(episodes.map((e) => e.episodeId));

  // 1. Validate Unit -> Ability / Move / Form cross-references
  for (const u of units) {
    if (!abilityIds.has(u.traitId)) {
      errors.push(`[units.json] Unit "${u.id}" references missing traitId "${u.traitId}"`);
    }
    for (const mid of u.defaultMoves) {
      if (!moveIds.has(mid)) {
        errors.push(`[units.json] Unit "${u.id}" references missing moveId "${mid}"`);
      }
    }
    if (u.defaultFormId && !formIds.has(u.defaultFormId)) {
      errors.push(`[units.json] Unit "${u.id}" references missing defaultFormId "${u.defaultFormId}"`);
    }
    if (u.awakenedFormId && !formIds.has(u.awakenedFormId)) {
      errors.push(`[units.json] Unit "${u.id}" references missing awakenedFormId "${u.awakenedFormId}"`);
    }
    for (const fid of u.forms ?? []) {
      if (!formIds.has(fid)) {
        errors.push(`[units.json] Unit "${u.id}" references missing formId "${fid}"`);
      }
    }
  }

  // 2. Validate Form -> overrideMoveIds
  for (const f of forms) {
    for (const mid of f.overrideMoveIds ?? []) {
      if (!moveIds.has(mid)) {
        errors.push(`[forms.json] Form "${f.id}" references missing overrideMoveId "${mid}"`);
      }
    }
  }

  // 3. Validate Island Scripts, Dialogues & Encounters
  const islandsDir = path.join(ROOT, 'src/data/islands');
  const islandFiles = fs.readdirSync(islandsDir).filter((f) => f.endsWith('.json'));
  let totalNpcs = 0;
  let totalDialogueLines = 0;
  let totalEncounters = 0;

  for (const fileName of islandFiles) {
    if (fileName !== fileName.toLowerCase()) {
      errors.push(`[src/data/islands] Non-lowercase filename detected: "${fileName}"`);
    }
    const island = readJson<IslandFileEntry>(`src/data/islands/${fileName}`);
    if (!episodeIds.has(island.episodeId)) {
      errors.push(
        `[islands/${fileName}] Island "${island.islandId}" references missing episodeId "${island.episodeId}"`
      );
    }
    for (const npc of island.npcs) {
      totalNpcs += 1;
      if (!Array.isArray(npc.dialogueLines) || npc.dialogueLines.length === 0) {
        errors.push(
          `[islands/${fileName}] NPC "${npc.npcId}" has empty dialogueLines`
        );
      } else {
        totalDialogueLines += npc.dialogueLines.length;
      }
    }
    for (const enc of island.encounters) {
      totalEncounters += 1;
      if (!enc.enemyUnitIds || enc.enemyUnitIds.length === 0) {
        errors.push(
          `[islands/${fileName}] Encounter "${enc.encounterId}" has no enemyUnitIds`
        );
      }
      for (const eid of enc.enemyUnitIds) {
        if (!unitIds.has(eid)) {
          errors.push(
            `[islands/${fileName}] Encounter "${enc.encounterId}" references missing unitId "${eid}"`
          );
        }
      }
    }
  }

  // 4. Validate 3D Story Chapters (src/data/dialogues/chapters/*.json)
  const backgroundsJson = readJson<{ backdrops?: { id: string }[] }>('src/data/assets/backgrounds.json');
  const backdropIds = new Set((backgroundsJson.backdrops ?? []).map((b) => b.id));
  const audioJson = readJson<{
    bgmTracks?: { id: string }[];
    sfxEntries?: { id: string }[];
  }>('src/data/assets/audio.json');
  const bgmIds = new Set((audioJson.bgmTracks ?? []).map((b) => b.id));
  const sfxIds = new Set((audioJson.sfxEntries ?? []).map((s) => s.id));
  const musouTypesJson = readJson<{ formTypeMap?: Record<string, string> }>('src/data/musou_types.json');
  const musouFormIds = new Set(Object.keys(musouTypesJson.formTypeMap ?? {}));
  const shipsJson = readJson<Array<{ id?: string; shipId?: string }>>('src/data/ships.json');
  const shipIds = new Set(
    shipsJson.map((s) => s.id ?? s.shipId ?? '').filter((id) => id.length > 0)
  );
  const seaZonesJson = readJson<Array<{ id: string }>>('src/data/sea_zones.json');
  const seaZoneIds = new Set(seaZonesJson.map((z) => z.id));

  const animClipSet = new Set<string>(ALL_STORY_ANIM_CLIPS);
  const emotionSet = new Set<string>(ALL_STORY_PORTRAIT_EMOTIONS);
  const cameraShotSet = new Set<string>([
    'wide_establishing',
    'over_shoulder',
    'boss_low_angle',
    'orbit_hero',
    'closeup_speaker',
    'dramatic_dutch'
  ]);
  const weatherSet = new Set<string>([
    'clear',
    'rain',
    'snow',
    'cherry_blossom',
    'sandstorm',
    'fog',
    'storm',
    'aurora'
  ]);
  const vfxSet = new Set<string>([
    'burst_aura',
    'lightning_strike',
    'haki_clash',
    'sakura_gust',
    'shockwave_ring'
  ]);

  const chaptersDir = path.join(ROOT, 'src/data/dialogues/chapters');
  const chapterFiles = fs.existsSync(chaptersDir)
    ? fs.readdirSync(chaptersDir).filter((f) => f.endsWith('.json')).sort()
    : [];

  if (chapterFiles.length < 19) {
    errors.push(
      `[src/data/dialogues/chapters] Expected at least 19 story chapter JSON files (Ch.01~Ch.18 + Ch.03.5 interlude), found ${chapterFiles.length}`
    );
  }

  const chapterById = new Map<string, StoryChapterScript>();
  const globalBattleIds = new Set<string>();
  const unlockedStrawHats = new Set<string>(['luffy']);
  let totalStoryDirectives = 0;
  let totalStoryBanters = 0;

  const isValidSpeakerId = (rawSpeakerId: string): boolean => {
    const norm = normalizeStoryUnitId(rawSpeakerId);
    if (unitIds.has(norm)) return true;
    const mapped = STORY_NPC_SPEAKER_PORTRAIT_MAP[rawSpeakerId];
    return typeof mapped === 'string' && unitIds.has(normalizeStoryUnitId(mapped));
  };

  for (const fileName of chapterFiles) {
    if (fileName !== fileName.toLowerCase()) {
      errors.push(`[story/chapters] Non-lowercase filename detected: "${fileName}"`);
    }
    const ch = readJson<StoryChapterScript>(`src/data/dialogues/chapters/${fileName}`);
    if (!ch.chapterId || typeof ch.chapterId !== 'string') {
      errors.push(`[story/${fileName}] Missing chapterId`);
      continue;
    }
    if (chapterById.has(ch.chapterId)) {
      errors.push(`[story/${fileName}] Duplicate chapterId "${ch.chapterId}"`);
    }
    chapterById.set(ch.chapterId, ch);

    if (ch.act !== 1 && ch.act !== 2 && ch.act !== 3) {
      errors.push(`[story/${fileName}] Invalid act: ${String(ch.act)}`);
    }
    if (!Array.isArray(ch.summary2Lines) || ch.summary2Lines.length !== 2) {
      errors.push(`[story/${fileName}] summary2Lines must have exact length 2`);
    }
    if (!backdropIds.has(ch.arenaId)) {
      errors.push(`[story/${fileName}] Unknown arenaId "${ch.arenaId}"`);
    }
    if (!unitIds.has(normalizeStoryUnitId(ch.bossUnitId))) {
      errors.push(`[story/${fileName}] Unknown bossUnitId "${ch.bossUnitId}"`);
    }
    if (ch.legacyEpisodeId && !episodeIds.has(ch.legacyEpisodeId)) {
      errors.push(`[story/${fileName}] Unknown legacyEpisodeId "${ch.legacyEpisodeId}"`);
    }

    const stagedActorIds = new Set<string>();
    const validateDirectives = (phase: 'intro' | 'preBattle' | 'epilogue', directives: StoryChapterScript['intro']) => {
      if (!Array.isArray(directives) || directives.length === 0) {
        errors.push(`[story/${fileName}] Phase "${phase}" must contain at least 1 directive`);
        return;
      }
      for (const d of directives) {
        totalStoryDirectives += 1;
        switch (d.type) {
          case 'chapter_card':
            if (!d.chapterNo || !d.title) {
              errors.push(`[story/${fileName}] (${phase}) chapter_card missing title/chapterNo`);
            }
            break;
          case 'stage_3d':
            if (!backdropIds.has(d.arenaId)) {
              errors.push(`[story/${fileName}] (${phase}) stage_3d unknown arenaId "${d.arenaId}"`);
            }
            if (d.weather && !weatherSet.has(d.weather)) {
              errors.push(`[story/${fileName}] (${phase}) stage_3d unknown weather "${d.weather}"`);
            }
            for (const actor of d.actors) {
              stagedActorIds.add(actor.actorId);
              if (!unitIds.has(normalizeStoryUnitId(actor.unitId))) {
                errors.push(`[story/${fileName}] (${phase}) stage_3d actor "${actor.actorId}" unknown unitId "${actor.unitId}"`);
              }
              if (!animClipSet.has(actor.animClip)) {
                errors.push(`[story/${fileName}] (${phase}) stage_3d actor "${actor.actorId}" invalid animClip "${actor.animClip}"`);
              }
            }
            break;
          case 'camera_3d':
            if (!cameraShotSet.has(d.shot)) {
              errors.push(`[story/${fileName}] (${phase}) camera_3d invalid shot "${d.shot}"`);
            }
            if (!(d.durationMs > 0)) {
              errors.push(`[story/${fileName}] (${phase}) camera_3d durationMs must be > 0`);
            }
            if (d.targetActorId && !stagedActorIds.has(d.targetActorId)) {
              errors.push(`[story/${fileName}] (${phase}) camera_3d references unstaged targetActorId "${d.targetActorId}"`);
            }
            if (d.secondaryActorId && !stagedActorIds.has(d.secondaryActorId)) {
              errors.push(`[story/${fileName}] (${phase}) camera_3d references unstaged secondaryActorId "${d.secondaryActorId}"`);
            }
            break;
          case 'actor_action':
            if (!stagedActorIds.has(d.actorId)) {
              errors.push(`[story/${fileName}] (${phase}) actor_action references unstaged actorId "${d.actorId}"`);
            }
            if (!animClipSet.has(d.animClip)) {
              errors.push(`[story/${fileName}] (${phase}) actor_action invalid animClip "${d.animClip}"`);
            }
            break;
          case 'line':
            if (!isValidSpeakerId(d.speakerId)) {
              errors.push(`[story/${fileName}] (${phase}) line unknown speakerId "${d.speakerId}"`);
            }
            if (!emotionSet.has(d.emotion)) {
              errors.push(`[story/${fileName}] (${phase}) line invalid emotion "${d.emotion}"`);
            }
            if (!d.text || d.text.trim().length === 0) {
              errors.push(`[story/${fileName}] (${phase}) line text must be non-empty`);
            }
            if (d.focusActorId && !stagedActorIds.has(d.focusActorId)) {
              errors.push(`[story/${fileName}] (${phase}) line focusActorId "${d.focusActorId}" is not staged`);
            }
            if (d.sfx && !sfxIds.has(d.sfx)) {
              errors.push(`[story/${fileName}] (${phase}) line unknown sfx "${d.sfx}"`);
            }
            break;
          case 'narration':
            if (!d.text || d.text.trim().length === 0) {
              errors.push(`[story/${fileName}] (${phase}) narration text must be non-empty`);
            }
            break;
          case 'vfx_3d':
            if (!vfxSet.has(d.effect)) {
              errors.push(`[story/${fileName}] (${phase}) vfx_3d unknown effect "${d.effect}"`);
            }
            if (d.targetActorId && !stagedActorIds.has(d.targetActorId)) {
              errors.push(`[story/${fileName}] (${phase}) vfx_3d targetActorId "${d.targetActorId}" is not staged`);
            }
            break;
          case 'bgm':
            if (!bgmIds.has(d.trackId)) {
              errors.push(`[story/${fileName}] (${phase}) bgm unknown trackId "${d.trackId}"`);
            }
            break;
          case 'start_musou_battle':
            if (!d.battleId) {
              errors.push(`[story/${fileName}] (${phase}) start_musou_battle missing battleId`);
            } else if (globalBattleIds.has(d.battleId)) {
              errors.push(`[story/${fileName}] (${phase}) Duplicate battleId "${d.battleId}"`);
            } else {
              globalBattleIds.add(d.battleId);
            }
            if (!unitIds.has(normalizeStoryUnitId(d.bossUnitId))) {
              errors.push(`[story/${fileName}] (${phase}) start_musou_battle unknown bossUnitId "${d.bossUnitId}"`);
            }
            if (!(d.hordeCount > 0)) {
              errors.push(`[story/${fileName}] (${phase}) start_musou_battle hordeCount must be > 0`);
            }
            break;
          default:
            assertNeverDirective(d);
        }
      }
    };

    validateDirectives('intro', ch.intro);
    validateDirectives('preBattle', ch.preBattle);
    validateDirectives('epilogue', ch.epilogue);

    const hasStartBattle = ch.preBattle.some((d) => d.type === 'start_musou_battle');
    if (!hasStartBattle) {
      errors.push(`[story/${fileName}] preBattle must contain start_musou_battle directive`);
    }

    if (!Array.isArray(ch.battleBanters) || ch.battleBanters.length < 3) {
      errors.push(`[story/${fileName}] battleBanters must contain at least 3 rules`);
    } else {
      for (const b of ch.battleBanters) {
        totalStoryBanters += 1;
        if (!isValidSpeakerId(b.speakerId)) {
          errors.push(`[story/${fileName}] banter "${b.banterId}" unknown speakerId "${b.speakerId}"`);
        }
        if (!emotionSet.has(b.emotion)) {
          errors.push(`[story/${fileName}] banter "${b.banterId}" invalid emotion "${b.emotion}"`);
        }
        if (!b.text || b.text.trim().length === 0) {
          errors.push(`[story/${fileName}] banter "${b.banterId}" empty text`);
        }
      }
    }

    for (const rawUid of ch.unlocks.recruitUnits) {
      const uid = normalizeStoryUnitId(rawUid);
      if (!unitIds.has(uid)) {
        errors.push(`[story/${fileName}] unlocks.recruitUnits unknown unitId "${rawUid}"`);
      } else {
        unlockedStrawHats.add(uid);
      }
    }
    for (const formId of ch.unlocks.unlockForms) {
      if (!formIds.has(formId) && !musouFormIds.has(formId)) {
        errors.push(`[story/${fileName}] unlocks.unlockForms unknown formId "${formId}"`);
      }
    }
    for (const zone of ch.unlocks.unlockSeaZones) {
      if (!seaZoneIds.has(zone)) {
        errors.push(`[story/${fileName}] unlocks.unlockSeaZones unknown seaZone "${zone}"`);
      }
    }
    if (ch.unlocks.upgradeShip && !shipIds.has(ch.unlocks.upgradeShip)) {
      errors.push(`[story/${fileName}] unlocks.upgradeShip unknown shipId "${ch.unlocks.upgradeShip}"`);
    }
  }

  // Kahn topological sort DAG verification across all 19 chapters
  const inDegree = new Map<string, number>();
  const dependents = new Map<string, string[]>();
  for (const ch of chapterById.values()) {
    inDegree.set(ch.chapterId, ch.prerequisiteChapterIds.length);
    dependents.set(ch.chapterId, []);
  }
  for (const ch of chapterById.values()) {
    for (const prereq of ch.prerequisiteChapterIds) {
      if (!chapterById.has(prereq)) {
        errors.push(`[story DAG] Chapter "${ch.chapterId}" references missing prerequisite "${prereq}"`);
      } else if (prereq === ch.chapterId) {
        errors.push(`[story DAG] Chapter "${ch.chapterId}" references itself as prerequisite`);
      } else {
        dependents.get(prereq)?.push(ch.chapterId);
      }
    }
  }
  const queue: string[] = [];
  for (const [id, deg] of inDegree.entries()) {
    if (deg === 0) queue.push(id);
  }
  let visitedDagNodes = 0;
  while (queue.length > 0) {
    const cur = queue.shift()!;
    visitedDagNodes += 1;
    for (const dep of dependents.get(cur) ?? []) {
      const nextDeg = (inDegree.get(dep) ?? 1) - 1;
      inDegree.set(dep, nextDeg);
      if (nextDeg === 0) queue.push(dep);
    }
  }
  if (visitedDagNodes !== chapterById.size) {
    errors.push(
      `[story DAG] Cycle or unreachable chapter detected: visited ${visitedDagNodes}/${chapterById.size}`
    );
  }

  for (const strawHat of STRAW_HAT_CREW_ORDER) {
    if (!unlockedStrawHats.has(strawHat)) {
      errors.push(`[story progression] Missing Straw Hat crew unlock across Ch.01~Ch.18: "${strawHat}"`);
    }
  }

  if (errors.length > 0) {
    console.error(`\n❌ Script & Dialogue cross-reference validation FAILED (${errors.length} error(s)):\n`);
    for (const err of errors) {
      console.error(`  - ${err}`);
    }
    process.exit(1);
  }

  console.log('✅ Script, Dialogue & Data Schema validation PASSED (0 errors)!');
  console.log(
    `   • Units: ${units.length} | Forms: ${forms.length} | Moves: ${moves.length} | Abilities: ${abilities.length}`
  );
  console.log(
    `   • Episodes: ${episodes.length} | Islands: ${islandFiles.length} | NPCs: ${totalNpcs} (${totalDialogueLines} dialogue lines) | Encounters: ${totalEncounters}`
  );
  console.log(
    `   • 3D Story Chapters: ${chapterById.size} | Directives: ${totalStoryDirectives} | Battle Banters: ${totalStoryBanters} | DAG Reachable: ${visitedDagNodes}/${chapterById.size} | Straw Hats: ${STRAW_HAT_CREW_ORDER.filter((u) => unlockedStrawHats.has(u)).length}/10`
  );
}

main();
