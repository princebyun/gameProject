import type { Vec2 } from './commonSchemas';

export type BattleWinCondition =
  | { kind: 'DEFEAT_ALL' }
  | {
      kind: 'SURVIVE_TIME';
      targetSec: number;
      escapeCutsceneText?: string;
    }
  | {
      kind: 'REACH_EXTRACTION';
      unlockAfterSec: number;
      extractionZone: { x: number; y: number; radiusPx: number };
      escapeCutsceneText?: string;
    };

export interface ArenaWaterZone {
  x: number;
  y: number;
  radiusPx: number;
}

export interface ArenaDestructibleProp {
  id: string;
  kind: 'WATER_BARREL' | 'OASIS_JAR';
  pos: Vec2;
  radiusPx: number;
  hp: number;
  maxHp: number;
  destroyed: boolean;
  wetRadiusPx: number;
  wetDurationSec: number;
}

export interface ArenaTerrainConfig {
  waterZones?: ArenaWaterZone[];
  destructibleProps?: Omit<ArenaDestructibleProp, 'destroyed'>[];
}
