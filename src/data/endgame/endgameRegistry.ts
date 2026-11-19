import colosseumJson from './colosseum.json';
import impelDownJson from './impel_down.json';
import raidRelicsJson from './raid_relics.json';
import raidsJson from './raids.json';
import tutorMovesJson from './tutor_moves.json';
import type {
  ColosseumConfig,
  EndgameDataRegistry,
  ImpelDownConfig,
  RaidBossDefinition,
  RaidRelicDefinition,
  TutorMoveDefinition
} from '../../core/endgame/types';

export function createDefaultEndgameRegistry(): EndgameDataRegistry {
  const tutorMoves: Record<string, TutorMoveDefinition> = {};
  for (const m of tutorMovesJson as TutorMoveDefinition[]) {
    tutorMoves[m.moveId] = m;
  }

  const raids: Record<string, RaidBossDefinition> = {};
  for (const r of raidsJson as RaidBossDefinition[]) {
    raids[r.raidId] = r;
  }

  const raidRelics: Record<string, RaidRelicDefinition> = {};
  for (const rel of raidRelicsJson as RaidRelicDefinition[]) {
    raidRelics[rel.relicId] = rel;
  }

  return {
    impelDown: impelDownJson as ImpelDownConfig,
    colosseum: colosseumJson as ColosseumConfig,
    tutorMoves,
    raids,
    raidRelics
  };
}

export const defaultEndgameRegistry: EndgameDataRegistry =
  createDefaultEndgameRegistry();
