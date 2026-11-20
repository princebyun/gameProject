import type {
  BattleBanterBank,
  BattleBanterEntry,
  DialogueScript,
  DialogueTriggerType,
  EpisodeDialoguePack,
  NpcSpeakerProfile,
  SideCrewBanterPack,
  SideCrewBanterScript
} from '../../core/rpg/scriptSchema';
import npcSpeakersJson from './npc_speakers.json';

type EpisodePackLoader = () => Promise<{ default: EpisodeDialoguePack }>;

/**
 * Modular dynamic-import table by sea-zone folder so Vite code-splits each island's
 * Korean dialogue script JSON cleanly for web and Android builds.
 */
const EPISODE_DIALOGUE_LOADERS: Record<string, EpisodePackLoader> = {
  // East Blue (5)
  ep_east_blue_start: () => import('./east_blue/ep_east_blue_start.json') as Promise<{ default: EpisodeDialoguePack }>,
  ep_orange_town: () => import('./east_blue/ep_orange_town.json') as Promise<{ default: EpisodeDialoguePack }>,
  ep_baratie: () => import('./east_blue/ep_baratie.json') as Promise<{ default: EpisodeDialoguePack }>,
  ep_arlong_park: () => import('./east_blue/ep_arlong_park.json') as Promise<{ default: EpisodeDialoguePack }>,
  ep_loguetown: () => import('./east_blue/ep_loguetown.json') as Promise<{ default: EpisodeDialoguePack }>,

  // Grand Line (6)
  ep_drum_kingdom: () => import('./grand_line/ep_drum_kingdom.json') as Promise<{ default: EpisodeDialoguePack }>,
  ep_alabasta: () => import('./grand_line/ep_alabasta.json') as Promise<{ default: EpisodeDialoguePack }>,
  ep_skypiea: () => import('./grand_line/ep_skypiea.json') as Promise<{ default: EpisodeDialoguePack }>,
  ep_water_seven: () => import('./grand_line/ep_water_seven.json') as Promise<{ default: EpisodeDialoguePack }>,
  ep_thriller_bark: () => import('./grand_line/ep_thriller_bark.json') as Promise<{ default: EpisodeDialoguePack }>,
  ep_marineford: () => import('./grand_line/ep_marineford.json') as Promise<{ default: EpisodeDialoguePack }>,

  // New World (6)
  ep_fishman_island: () => import('./new_world/ep_fishman_island.json') as Promise<{ default: EpisodeDialoguePack }>,
  ep_dressrosa: () => import('./new_world/ep_dressrosa.json') as Promise<{ default: EpisodeDialoguePack }>,
  ep_totto_land: () => import('./new_world/ep_totto_land.json') as Promise<{ default: EpisodeDialoguePack }>,
  ep_wano: () => import('./new_world/ep_wano.json') as Promise<{ default: EpisodeDialoguePack }>,
  ep_egghead: () => import('./new_world/ep_egghead.json') as Promise<{ default: EpisodeDialoguePack }>,
  ep_elbaf: () => import('./new_world/ep_elbaf.json') as Promise<{ default: EpisodeDialoguePack }>
};

const episodeCache = new Map<string, EpisodeDialoguePack>();
let battleBanterCache: BattleBanterEntry[] | null = null;
let sideCrewBanterCache: SideCrewBanterScript[] | null = null;

export const NPC_SPEAKER_CATALOG: Record<string, NpcSpeakerProfile> = (() => {
  const map: Record<string, NpcSpeakerProfile> = {};
  const raw = npcSpeakersJson as { speakers: NpcSpeakerProfile[] };
  for (const sp of raw.speakers) {
    map[sp.speakerId] = sp;
  }
  return map;
})();

export async function loadEpisodeDialoguePack(
  episodeId: string
): Promise<EpisodeDialoguePack | null> {
  const cached = episodeCache.get(episodeId);
  if (cached) return cached;

  const loader = EPISODE_DIALOGUE_LOADERS[episodeId];
  if (!loader) return null;

  try {
    const mod = await loader();
    episodeCache.set(episodeId, mod.default);
    return mod.default;
  } catch {
    return null;
  }
}

export function getCachedEpisodeDialoguePack(
  episodeId: string
): EpisodeDialoguePack | null {
  return episodeCache.get(episodeId) ?? null;
}

export async function findEpisodeScript(
  episodeId: string,
  triggerType: DialogueTriggerType,
  bindingId?: string
): Promise<DialogueScript | null> {
  const pack = await loadEpisodeDialoguePack(episodeId);
  if (!pack) return null;

  if (bindingId) {
    const exact = pack.scripts.find(
      (s) => s.triggerType === triggerType && s.bindingId === bindingId
    );
    if (exact) return exact;
  }

  return pack.scripts.find((s) => s.triggerType === triggerType) ?? null;
}

export async function loadScriptById(
  episodeId: string,
  scriptId: string
): Promise<DialogueScript | null> {
  const pack = await loadEpisodeDialoguePack(episodeId);
  if (!pack) return null;
  return pack.scripts.find((s) => s.scriptId === scriptId) ?? null;
}

export async function loadBattleBanterEntries(): Promise<BattleBanterEntry[]> {
  if (battleBanterCache) return battleBanterCache;
  const mod = (await import('./battle_banter.json')) as { default: BattleBanterBank };
  battleBanterCache = mod.default.entries;
  return battleBanterCache;
}

export function getCachedBattleBanterEntries(): BattleBanterEntry[] {
  return battleBanterCache ?? [];
}

export async function loadSideCrewBanters(): Promise<SideCrewBanterScript[]> {
  if (sideCrewBanterCache) return sideCrewBanterCache;
  const mod = (await import('./side_crew/crew_banters.json')) as {
    default: SideCrewBanterPack;
  };
  sideCrewBanterCache = mod.default.banters;
  return sideCrewBanterCache;
}

export async function findSideCrewBanterById(
  scriptId: string
): Promise<SideCrewBanterScript | null> {
  const all = await loadSideCrewBanters();
  return all.find((b) => b.scriptId === scriptId) ?? null;
}
