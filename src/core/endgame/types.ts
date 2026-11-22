export * from '../../data/schemas/endgameSchemas';
import type { SaveEndgameBlock } from '../../data/schemas/endgameSchemas';

export function createDefaultEndgameState(): SaveEndgameBlock {
  return {
    impelDown: {
      highestFloor: 0,
      activeRun: null
    },
    colosseum: {
      cp: 0,
      clearedTiers: [],
      tierWinCounts: {},
      posterFrameTier: 'default',
      tutoredMovesMap: {}
    },
    raids: {
      clearedRaidIds: [],
      bestClearTimeSecMap: {},
      unlockedRelicIds: [],
      equippedRelicMap: {}
    }
  };
}
