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

import {
  assertArray,
  assertRecord,
  assertValidCrewRoleDefinition,
  assertValidEpisodeDefinition,
  assertValidIslandMapDefinition,
  assertValidRecruitmentRule,
  assertValidSeaZoneDefinition,
  assertValidShipDefinition,
  assertValidTrainingRule
} from './schemaGuards';
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
} from './schemas/rpgSchemas';

export function createDefaultRpgDataRegistry(): RpgDataRegistry {
  const seaZonesMap = new Map<SeaZoneId, SeaZoneDefinition>();
  const rawZones = assertArray(seaZonesJson, 'seaZones');
  for (let i = 0; i < rawZones.length; i++) {
    const z = assertValidSeaZoneDefinition(rawZones[i], i);
    seaZonesMap.set(z.id, z);
  }
  const eastBlue = seaZonesMap.get('east_blue');
  const grandLine = seaZonesMap.get('grand_line');
  const newWorld = seaZonesMap.get('new_world');
  if (!eastBlue || !grandLine || !newWorld) {
    throw new Error('[RpgDataRegistry] Missing required sea zone(s)');
  }
  const seaZones: Record<SeaZoneId, SeaZoneDefinition> = {
    east_blue: eastBlue,
    grand_line: grandLine,
    new_world: newWorld
  };

  const ships: Record<string, ShipDefinition> = {};
  const shipsMap = new Map<string, ShipDefinition>();
  const rawShips = assertArray(shipsJson, 'ships');
  for (let i = 0; i < rawShips.length; i++) {
    const s = assertValidShipDefinition(rawShips[i], i);
    ships[s.id] = s;
    shipsMap.set(s.id, s);
  }

  const crewRoles = {} as Record<CrewRoleId, CrewRoleDefinition>;
  const crewRolesMap = new Map<CrewRoleId, CrewRoleDefinition>();
  const recObj = assertRecord(recruitmentJson, 'recruitment');
  const rawRoles = assertArray(recObj['crewRoles'], 'recruitment.crewRoles');
  for (let i = 0; i < rawRoles.length; i++) {
    const role = assertValidCrewRoleDefinition(rawRoles[i], i);
    crewRoles[role.roleId] = role;
    crewRolesMap.set(role.roleId, role);
  }

  const rawRules = assertArray(
    recObj['recruitmentRules'],
    'recruitment.recruitmentRules'
  );
  const recruitmentRules: RecruitmentRule[] = [];
  const recruitmentByUnitIdMap = new Map<string, RecruitmentRule>();
  for (let i = 0; i < rawRules.length; i++) {
    const rule = assertValidRecruitmentRule(rawRules[i], i);
    recruitmentRules.push(rule);
    recruitmentByUnitIdMap.set(rule.unitId, rule);
  }

  const rawTraining = assertArray(trainingJson, 'training');
  const trainingRules: TrainingUpgradeRule[] = [];
  const trainingRulesMap = new Map<string, TrainingUpgradeRule>();
  for (let i = 0; i < rawTraining.length; i++) {
    const tr = assertValidTrainingRule(rawTraining[i], i);
    trainingRules.push(tr);
    trainingRulesMap.set(tr.id, tr);
  }

  const rawIslands: unknown[] = [
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
  ];
  const islands: Record<string, IslandMapDefinition> = {};
  const islandsMap = new Map<string, IslandMapDefinition>();
  for (let i = 0; i < rawIslands.length; i++) {
    const isl = assertValidIslandMapDefinition(rawIslands[i], i);
    islands[isl.islandId] = isl;
    islandsMap.set(isl.islandId, isl);
  }

  const rawEpisodes: unknown[] = [
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
  ];
  const episodes: Record<string, EpisodeDefinition> = {};
  const episodesMap = new Map<string, EpisodeDefinition>();
  for (let i = 0; i < rawEpisodes.length; i++) {
    const ep = assertValidEpisodeDefinition(rawEpisodes[i], i);
    episodes[ep.episodeId] = ep;
    episodesMap.set(ep.episodeId, ep);
  }

  return {
    seaZones,
    seaZonesMap,
    ships,
    shipsMap,
    crewRoles,
    crewRolesMap,
    recruitmentRules,
    recruitmentByUnitIdMap,
    trainingRules,
    trainingRulesMap,
    islands,
    islandsMap,
    episodes,
    episodesMap
  };
}

export const defaultRpgDataRegistry: RpgDataRegistry = createDefaultRpgDataRegistry();
