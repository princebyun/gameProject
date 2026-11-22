import colosseumJson from './colosseum.json';
import impelDownJson from './impel_down.json';
import raidRelicsJson from './raid_relics.json';
import raidsJson from './raids.json';
import tutorMovesJson from './tutor_moves.json';
import {
  assertArray,
  assertValidColosseumConfig,
  assertValidImpelDownConfig,
  assertValidRaidBossDefinition,
  assertValidRaidRelicDefinition,
  assertValidTutorMoveDefinition
} from '../schemaGuards';
import type {
  EndgameDataRegistry,
  RaidBossDefinition,
  RaidRelicDefinition,
  TutorMoveDefinition
} from '../schemas/endgameSchemas';

export function createDefaultEndgameRegistry(): EndgameDataRegistry {
  const impelDown = assertValidImpelDownConfig(impelDownJson);
  const colosseum = assertValidColosseumConfig(colosseumJson);

  const tutorMoves: Record<string, TutorMoveDefinition> = {};
  const tutorMovesMap = new Map<string, TutorMoveDefinition>();
  const rawTutorMoves = assertArray(tutorMovesJson, 'tutorMoves');
  for (let i = 0; i < rawTutorMoves.length; i++) {
    const m = assertValidTutorMoveDefinition(rawTutorMoves[i], i);
    tutorMoves[m.moveId] = m;
    tutorMovesMap.set(m.moveId, m);
  }

  const raids: Record<string, RaidBossDefinition> = {};
  const raidsMap = new Map<string, RaidBossDefinition>();
  const rawRaids = assertArray(raidsJson, 'raids');
  for (let i = 0; i < rawRaids.length; i++) {
    const r = assertValidRaidBossDefinition(rawRaids[i], i);
    raids[r.raidId] = r;
    raidsMap.set(r.raidId, r);
  }

  const raidRelics: Record<string, RaidRelicDefinition> = {};
  const raidRelicsMap = new Map<string, RaidRelicDefinition>();
  const rawRelics = assertArray(raidRelicsJson, 'raidRelics');
  for (let i = 0; i < rawRelics.length; i++) {
    const rel = assertValidRaidRelicDefinition(rawRelics[i], i);
    raidRelics[rel.relicId] = rel;
    raidRelicsMap.set(rel.relicId, rel);
  }

  return {
    impelDown,
    colosseum,
    tutorMoves,
    tutorMovesMap,
    raids,
    raidsMap,
    raidRelics,
    raidRelicsMap
  };
}

export const defaultEndgameRegistry: EndgameDataRegistry =
  createDefaultEndgameRegistry();
