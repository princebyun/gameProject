import rawCombosFile from './combos.json';

export type ComboAssistPattern =
  | 'CANNON_SHOCKWAVE'
  | 'X_CROSS_DASH'
  | 'THUNDER_STRIKE_SLAM'
  | 'SNIPER_RADICAL_BEAM'
  | 'GIANT_PETAL_STAMP'
  | 'FREEZING_OCEAN_RAY'
  | 'SHAMBLES_RED_HAWK';

export interface WaveComboDefinition {
  id: string;
  name: string;
  members: [string, string];
  cutinFreezeTicks: number;
  leftUnitId: string;
  leftPortraitEmotion: string;
  leftThemeColors: [string, string];
  rightUnitId: string;
  rightPortraitEmotion: string;
  rightThemeColors: [string, string];
  assistPattern: ComboAssistPattern;
  bloomColor: string;
  pointLightColor: string;
  hasWhiteFlash: boolean;
}

interface RawCombosJson {
  version: string;
  combos: WaveComboDefinition[];
}

const parsedCombos = rawCombosFile as unknown as RawCombosJson;

export const defaultWaveCombos: readonly WaveComboDefinition[] = parsedCombos.combos ?? [];

export function parseHexColorInt(hex: string, fallback = 0xfacc15): number {
  const clean = hex.replace(/^#/, '');
  const n = Number.parseInt(clean, 16);
  return Number.isFinite(n) ? n : fallback;
}

export function getWaveComboById(comboId: string): WaveComboDefinition | null {
  return defaultWaveCombos.find((c) => c.id === comboId) ?? null;
}

export function findWaveComboForPair(
  unitIdA: string,
  unitIdB: string
): WaveComboDefinition | null {
  if (!unitIdA || !unitIdB || unitIdA === unitIdB) return null;
  return (
    defaultWaveCombos.find(
      (c) =>
        (c.members[0] === unitIdA && c.members[1] === unitIdB) ||
        (c.members[1] === unitIdA && c.members[0] === unitIdB)
    ) ?? null
  );
}
