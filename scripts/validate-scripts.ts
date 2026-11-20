import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { AudioManifestFile } from '../src/data/assets/types';
import {
  validateDialogueScriptStructure,
  type BattleBanterBank,
  type DialogueScript,
  type EpisodeDialoguePack,
  type NpcSpeakerProfile,
  type SideCrewBanterPack
} from '../src/core/rpg/scriptSchema';
import { ALL_STORY_EPISODE_IDS } from '../src/data/dialogues/scriptManifest';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const MAX_MOBILE_LINE_CHARS = 90;
const PLACEHOLDER_REGEX = /\b(TODO|TBD|FIXME|PLACEHOLDER)\b|\.\.\.생략|\(생략\)/i;

function readJson<T>(absOrRelPath: string): T {
  const abs = path.isAbsolute(absOrRelPath)
    ? absOrRelPath
    : path.join(ROOT, absOrRelPath);
  return JSON.parse(fs.readFileSync(abs, 'utf-8')) as T;
}

function collectJsonFiles(dir: string): string[] {
  const out: string[] = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir)) {
    const full = path.join(dir, entry);
    const stat = fs.statSync(full);
    if (stat.isDirectory()) {
      out.push(...collectJsonFiles(full));
    } else if (entry.endsWith('.json')) {
      out.push(full);
    }
  }
  return out;
}

function main(): void {
  const errors: string[] = [];

  // Load reference registries
  const units = readJson<{ id: string }[]>('src/data/units.json');
  const forms = readJson<{ id: string }[]>('src/data/forms.json');
  const audio = readJson<AudioManifestFile>('src/data/assets/audio.json');
  const npcCatalogRaw = readJson<{ speakers: NpcSpeakerProfile[] }>(
    'src/data/dialogues/npc_speakers.json'
  );

  const unitIdSet = new Set(units.map((u) => u.id));
  const formIdSet = new Set(forms.map((f) => f.id));
  const bgmIdSet = new Set(audio.bgmTracks.map((b) => b.id));
  const sfxIdSet = new Set(audio.sfxEntries.map((s) => s.id));
  const npcIdSet = new Set(npcCatalogRaw.speakers.map((s) => s.speakerId));

  // Also accept island NPC IDs defined in src/data/islands/*.json
  const islandDir = path.join(ROOT, 'src/data/islands');
  for (const f of fs.readdirSync(islandDir).filter((n) => n.endsWith('.json'))) {
    const isl = readJson<{ npcs?: { npcId: string }[] }>(path.join(islandDir, f));
    for (const n of isl.npcs ?? []) {
      npcIdSet.add(n.npcId);
    }
  }

  const dialoguesRoot = path.join(ROOT, 'src/data/dialogues');
  const allDialogueFiles = collectJsonFiles(dialoguesRoot);

  const episodePacks = new Map<string, EpisodeDialoguePack>();
  const seenScriptIds = new Set<string>();
  let totalScripts = 0;
  let totalLines = 0;
  let sideBanterCount = 0;
  let battleBanterBank: BattleBanterBank | null = null;

  const validateScript = (script: DialogueScript, relFile: string) => {
    totalScripts += 1;
    if (seenScriptIds.has(script.scriptId)) {
      errors.push(`[${relFile}] Duplicate scriptId: "${script.scriptId}"`);
    }
    seenScriptIds.add(script.scriptId);

    for (const structErr of validateDialogueScriptStructure(script)) {
      errors.push(`[${relFile}] ${structErr}`);
    }

    script.lines.forEach((line, idx) => {
      totalLines += 1;
      const loc = `[${relFile} -> ${script.scriptId}#${idx}]`;

      if (PLACEHOLDER_REGEX.test(line.text)) {
        errors.push(`${loc} Contains forbidden placeholder text: "${line.text}"`);
      }
      if (line.text.length > MAX_MOBILE_LINE_CHARS) {
        errors.push(
          `${loc} Exceeds mobile 2-line limit (${line.text.length} > ${MAX_MOBILE_LINE_CHARS} chars): "${line.text}"`
        );
      }

      if (
        line.speakerId !== 'narrator' &&
        !unitIdSet.has(line.speakerId) &&
        !npcIdSet.has(line.speakerId)
      ) {
        errors.push(
          `${loc} Unknown speakerId "${line.speakerId}" (not in units.json, islands/*.json, npc_speakers.json, or "narrator")`
        );
      }

      for (const d of line.directives ?? []) {
        if (d.type === 'bgm' && !bgmIdSet.has(d.trackId)) {
          errors.push(`${loc} Unknown BGM trackId "${d.trackId}" in audio.json`);
        }
        if (d.type === 'sfx' && !sfxIdSet.has(d.sfxId)) {
          errors.push(`${loc} Unknown SFX sfxId "${d.sfxId}" in audio.json`);
        }
        if (d.type === 'recruitmentBanner' && !unitIdSet.has(d.unitId)) {
          errors.push(`${loc} Unknown recruitmentBanner unitId "${d.unitId}" in units.json`);
        }
      }
    });
  };

  for (const absFile of allDialogueFiles) {
    const relFile = path.relative(ROOT, absFile).replace(/\\/g, '/');
    if (relFile.endsWith('npc_speakers.json')) continue;

    if (relFile.endsWith('battle_banter.json')) {
      battleBanterBank = readJson<BattleBanterBank>(absFile);
      continue;
    }

    if (relFile.includes('/side_crew/')) {
      const sidePack = readJson<SideCrewBanterPack>(absFile);
      for (const b of sidePack.banters ?? []) {
        sideBanterCount += 1;
        validateScript(b, relFile);
        for (const reqUid of b.requiredUnitIds ?? []) {
          if (!unitIdSet.has(reqUid)) {
            errors.push(`[${relFile} -> ${b.scriptId}] Unknown requiredUnitId "${reqUid}"`);
          }
        }
      }
      continue;
    }

    const pack = readJson<EpisodeDialoguePack>(absFile);
    if (!pack.episodeId || !Array.isArray(pack.scripts)) {
      errors.push(`[${relFile}] Invalid EpisodeDialoguePack structure`);
      continue;
    }
    episodePacks.set(pack.episodeId, pack);
    for (const s of pack.scripts) {
      validateScript(s, relFile);
    }
  }

  // Validate battle_banter.json
  const banterByEpisode = new Map<string, number>();
  const seenBanterIds = new Set<string>();
  if (!battleBanterBank || !Array.isArray(battleBanterBank.entries)) {
    errors.push('[src/data/dialogues/battle_banter.json] Missing or invalid battle_banter.json');
  } else {
    for (const entry of battleBanterBank.entries) {
      const loc = `[battle_banter.json -> ${entry.banterId}]`;
      if (seenBanterIds.has(entry.banterId)) {
        errors.push(`${loc} Duplicate banterId`);
      }
      seenBanterIds.add(entry.banterId);

      if (!entry.text || entry.text.trim().length === 0) {
        errors.push(`${loc} Empty text`);
      } else {
        if (PLACEHOLDER_REGEX.test(entry.text)) {
          errors.push(`${loc} Contains placeholder text: "${entry.text}"`);
        }
        if (entry.text.length > MAX_MOBILE_LINE_CHARS) {
          errors.push(
            `${loc} Exceeds mobile 2-line limit (${entry.text.length} > ${MAX_MOBILE_LINE_CHARS} chars)`
          );
        }
      }

      if (
        entry.speakerId !== 'narrator' &&
        !unitIdSet.has(entry.speakerId) &&
        !npcIdSet.has(entry.speakerId)
      ) {
        errors.push(`${loc} Unknown speakerId "${entry.speakerId}"`);
      }
      if (entry.bossUnitId && !unitIdSet.has(entry.bossUnitId)) {
        errors.push(`${loc} Unknown bossUnitId "${entry.bossUnitId}"`);
      }
      if (entry.allyUnitId && !unitIdSet.has(entry.allyUnitId)) {
        errors.push(`${loc} Unknown allyUnitId "${entry.allyUnitId}"`);
      }
      if (entry.formId && !formIdSet.has(entry.formId)) {
        errors.push(`${loc} Unknown formId "${entry.formId}"`);
      }

      banterByEpisode.set(
        entry.episodeId,
        (banterByEpisode.get(entry.episodeId) ?? 0) + 1
      );
    }
  }

  // Verify all 17 story episodes have required cutscenes + battle_banter coverage
  for (const epId of ALL_STORY_EPISODE_IDS) {
    const pack = episodePacks.get(epId);
    if (!pack) {
      errors.push(`[Coverage] Missing EpisodeDialoguePack JSON for "${epId}"`);
      continue;
    }

    const hasGoldOrArrival = pack.scripts.some(
      (s) => s.triggerType === 'gold_marker' || s.triggerType === 'arrival'
    );
    const hasPreBoss = pack.scripts.some((s) => s.triggerType === 'pre_boss');
    const hasPostBoss = pack.scripts.some((s) => s.triggerType === 'post_boss');

    if (!hasGoldOrArrival) {
      errors.push(`[Coverage] Episode "${epId}" is missing a gold_marker/arrival script`);
    }
    if (!hasPreBoss) {
      errors.push(`[Coverage] Episode "${epId}" is missing a pre_boss script`);
    }
    if (!hasPostBoss) {
      errors.push(`[Coverage] Episode "${epId}" is missing a post_boss script`);
    }
    if ((banterByEpisode.get(epId) ?? 0) < 1) {
      errors.push(`[Coverage] Episode "${epId}" has 0 battle_banter entries`);
    }
  }

  if (sideBanterCount < 6) {
    errors.push(
      `[Coverage] Expected at least 6 side_crew blue-marker banters, found ${sideBanterCount}`
    );
  }

  if (errors.length > 0) {
    console.error(`\n❌ Dialogue script validation FAILED (${errors.length} error(s)):\n`);
    for (const e of errors) {
      console.error(`  - ${e}`);
    }
    process.exit(1);
  }

  console.log('✅ Dialogue script validation PASSED (0 errors)!');
  console.log(
    `   • Episodes: ${episodePacks.size}/${ALL_STORY_EPISODE_IDS.length} islands covered (100%)`
  );
  console.log(
    `   • Cutscenes: ${totalScripts} scripts (${totalLines} Korean lines, all <= ${MAX_MOBILE_LINE_CHARS} chars, 0 placeholders)`
  );
  console.log(
    `   • Side Crew Banters: ${sideBanterCount} blue-marker shipboard scripts`
  );
  console.log(
    `   • Mid-Battle Banter: ${battleBanterBank?.entries.length ?? 0} real-time triggers across all 17 islands`
  );
}

main();
