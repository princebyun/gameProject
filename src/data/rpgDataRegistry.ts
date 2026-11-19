import seaZonesJson from './sea_zones.json';
import shipsJson from './ships.json';
import recruitmentJson from './recruitment.json';
import trainingJson from './training.json';

import fooshaShellsJson from './islands/foosha_shells.json';
import orangeTownJson from './islands/orange_town.json';
import baratieJson from './islands/baratie.json';
import arlongParkJson from './islands/arlong_park.json';
import loguetownJson from './islands/loguetown.json';
import drumKingdomJson from './islands/drum_kingdom.json';
import alabastaJson from './islands/alabasta.json';
import skypieaJson from './islands/skypiea.json';
import waterSevenJson from './islands/water_seven.json';
import thrillerBarkJson from './islands/thriller_bark.json';
import marinefordJson from './islands/marineford.json';
import fishmanIslandJson from './islands/fishman_island.json';
import dressrosaJson from './islands/dressrosa.json';
import tottoLandJson from './islands/totto_land.json';
import wanoOnigashimaJson from './islands/wano_onigashima.json';
import eggheadJson from './islands/egghead.json';
import elbafJson from './islands/elbaf.json';

import epEastBlueStartJson from './episodes/ep_east_blue_start.json';
import epOrangeTownJson from './episodes/ep_orange_town.json';
import epBaratieJson from './episodes/ep_baratie.json';
import epArlongParkJson from './episodes/ep_arlong_park.json';
import epLoguetownJson from './episodes/ep_loguetown.json';
import epDrumKingdomJson from './episodes/ep_drum_kingdom.json';
import epAlabastaJson from './episodes/ep_alabasta.json';
import epSkypieaJson from './episodes/ep_skypiea.json';
import epWaterSevenJson from './episodes/ep_water_seven.json';
import epThrillerBarkJson from './episodes/ep_thriller_bark.json';
import epMarinefordJson from './episodes/ep_marineford.json';
import epFishmanIslandJson from './episodes/ep_fishman_island.json';
import epDressrosaJson from './episodes/ep_dressrosa.json';
import epTottoLandJson from './episodes/ep_totto_land.json';
import epWanoJson from './episodes/ep_wano.json';
import epEggheadJson from './episodes/ep_egghead.json';
import epElbafJson from './episodes/ep_elbaf.json';
import epElbafPart2Json from './episodes/ep_elbaf_part2.json';

import type {
  CrewRoleDefinition,
  CrewRoleId,
  EpisodeDefinition,
  IslandMapDefinition,
  RecruitmentRule,
  RpgDataRegistry,
  SeaZoneDefinition,
  SeaZoneId,
  ShipDefinition,
  TrainingUpgradeRule
} from '../core/types/rpgSchemas';

export function createDefaultRpgDataRegistry(): RpgDataRegistry {
  const seaZones: Record<SeaZoneId, SeaZoneDefinition> = {
    east_blue: (seaZonesJson as SeaZoneDefinition[]).find((z) => z.id === 'east_blue')!,
    grand_line: (seaZonesJson as SeaZoneDefinition[]).find((z) => z.id === 'grand_line')!,
    new_world: (seaZonesJson as SeaZoneDefinition[]).find((z) => z.id === 'new_world')!
  };

  const ships: Record<string, ShipDefinition> = {};
  for (const s of shipsJson as ShipDefinition[]) {
    ships[s.id] = s;
  }

  const crewRoles = {} as Record<CrewRoleId, CrewRoleDefinition>;
  const recRaw = recruitmentJson as {
    crewRoles: CrewRoleDefinition[];
    recruitmentRules: RecruitmentRule[];
  };
  for (const r of recRaw.crewRoles) {
    crewRoles[r.roleId] = r;
  }

  const islandsList = [
    fooshaShellsJson,
    orangeTownJson,
    baratieJson,
    arlongParkJson,
    loguetownJson,
    drumKingdomJson,
    alabastaJson,
    skypieaJson,
    waterSevenJson,
    thrillerBarkJson,
    marinefordJson,
    fishmanIslandJson,
    dressrosaJson,
    tottoLandJson,
    wanoOnigashimaJson,
    eggheadJson,
    elbafJson
  ] as unknown as IslandMapDefinition[];

  const islands: Record<string, IslandMapDefinition> = {};
  for (const isl of islandsList) {
    islands[isl.islandId] = isl;
  }

  const episodesList = [
    epEastBlueStartJson,
    epOrangeTownJson,
    epBaratieJson,
    epArlongParkJson,
    epLoguetownJson,
    epDrumKingdomJson,
    epAlabastaJson,
    epSkypieaJson,
    epWaterSevenJson,
    epThrillerBarkJson,
    epMarinefordJson,
    epFishmanIslandJson,
    epDressrosaJson,
    epTottoLandJson,
    epWanoJson,
    epEggheadJson,
    epElbafJson,
    epElbafPart2Json
  ] as unknown as EpisodeDefinition[];

  const episodes: Record<string, EpisodeDefinition> = {};
  for (const ep of episodesList) {
    episodes[ep.episodeId] = ep;
  }

  return {
    seaZones,
    ships,
    crewRoles,
    recruitmentRules: recRaw.recruitmentRules,
    trainingRules: trainingJson as TrainingUpgradeRule[],
    islands,
    episodes
  };
}

export const defaultRpgDataRegistry: RpgDataRegistry = createDefaultRpgDataRegistry();
