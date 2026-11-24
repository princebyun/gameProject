import weapons3dJson from './weapons_3d.json';

export type WeaponSlotKey = 'right' | 'left' | 'mouth';
export type WeaponTunerSlotKey = WeaponSlotKey | 'holster';
export type WeaponProxyShape = 'KATANA' | 'KANABO';

export const ALLOWED_MIXAMO_WEAPON_BONES = [
  'mixamorigRightHand',
  'mixamorigLeftHand',
  'mixamorigHead',
  'mixamorigHips',
  'mixamorigSpine2',
  'mixamorigRightFoot'
] as const;

export interface WeaponSocketTransform {
  bone: string;
  position: [number, number, number];
  rotationDeg: [number, number, number];
  scale: number;
}

export interface WeaponTrailAnchors {
  baseLocal: [number, number, number];
  tipLocal: [number, number, number];
}

export interface WeaponTrailTheme {
  coreColor: string;
  midColor: string;
  edgeColor: string;
  hakiColor?: string;
  widthMultiplier: number;
  bloomIntensity: number;
  noiseScale: number;
  lightningJagged: boolean;
}

export interface Weapon3DSpec {
  weaponId: string;
  label: string;
  proxyShape: WeaponProxyShape;
  modelPath: string;
  combatSocket: WeaponSocketTransform;
  holsterSocket?: WeaponSocketTransform;
  trailAnchors: WeaponTrailAnchors;
  trailTheme: WeaponTrailTheme;
}

export interface TrailWindowRule {
  start: number;
  end: number;
  weapons: WeaponSlotKey[];
}

export interface CharacterWeaponLoadout {
  loadoutId: string;
  speciesId: string;
  formId?: string;
  enableHolsterSwap: boolean;
  holsterDelaySec: number;
  kingOfHellAura?: boolean;
  hakiArcSlot?: WeaponSlotKey;
  slots: Partial<Record<WeaponSlotKey, string>>;
  trailWindows: Record<string, TrailWindowRule[]>;
}

export interface Weapons3DManifestFile {
  version: string;
  weapons: Record<string, Weapon3DSpec>;
  characterLoadouts: Record<string, CharacterWeaponLoadout>;
}

export const WEAPONS_3D_MANIFEST = weapons3dJson as unknown as Weapons3DManifestFile;

export function getWeapon3DSpec(weaponId: string): Weapon3DSpec | null {
  return WEAPONS_3D_MANIFEST.weapons[weaponId] ?? null;
}

export function getCharacterWeaponLoadoutById(
  loadoutId: string
): CharacterWeaponLoadout | null {
  return WEAPONS_3D_MANIFEST.characterLoadouts[loadoutId] ?? null;
}

export function getAllWeaponLoadoutIds(): string[] {
  return Object.keys(WEAPONS_3D_MANIFEST.characterLoadouts);
}

/**
 * Resolves the data-driven weapon loadout from character speciesId & activeFormId.
 * Returns null for unarmed brawlers (e.g. Luffy) unless overridden in inspector.
 */
export function resolveCharacterWeaponLoadout(
  speciesId: string,
  activeFormId?: string | null
): CharacterWeaponLoadout | null {
  const lowerSpecies = speciesId.toLowerCase();
  const lowerForm = (activeFormId ?? '').toLowerCase();

  if (lowerSpecies === 'zoro') {
    if (lowerForm.includes('king_of_hell') || lowerForm.includes('enma')) {
      return getCharacterWeaponLoadoutById('zoro_king_of_hell');
    }
    return getCharacterWeaponLoadoutById('zoro_base');
  }
  if (lowerSpecies === 'law') {
    return getCharacterWeaponLoadoutById('law_base');
  }
  if (lowerSpecies === 'kaido') {
    return getCharacterWeaponLoadoutById('kaido_base');
  }
  return null;
}

const STATE_TO_WINDOW_KEYS: Record<string, readonly string[]> = {
  Combo1: ['COMBO_1'],
  Combo2: ['COMBO_2'],
  Combo3: ['COMBO_3'],
  Combo4: ['COMBO_4'],
  AirLaunch: ['JUMP', 'AIR_COMBO'],
  AirCombo1: ['AIR_COMBO', 'COMBO_2'],
  AirCombo2: ['AIR_COMBO', 'COMBO_3'],
  AirSlam: ['AIR_COMBO', 'COMBO_4'],
  SpecialWindup: ['SPECIAL_1', 'SPECIAL_2'],
  SpecialRelease: ['BURST_AWAKENING', 'SPECIAL_4', 'SPECIAL_3']
};

export function resolveTrailWindowsForState(
  loadout: CharacterWeaponLoadout,
  stateOrClip: string
): readonly TrailWindowRule[] {
  const upper = stateOrClip.toUpperCase();
  const direct = loadout.trailWindows[upper] ?? loadout.trailWindows[stateOrClip];
  if (direct && direct.length > 0) return direct;

  const aliases = STATE_TO_WINDOW_KEYS[stateOrClip];
  if (aliases) {
    for (const key of aliases) {
      const rules = loadout.trailWindows[key];
      if (rules && rules.length > 0) return rules;
    }
  }
  return [];
}
