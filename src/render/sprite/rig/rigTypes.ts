import type {
  SpriteAnimClipDef,
  SpriteAnimState
} from '../../../data/assets/types';

export type RigType =
  | 'humanoid_brawler'
  | 'swordsman_weapon'
  | 'caster_ranged'
  | 'small_agile'
  | 'bulky_tall_coat'
  | 'giant_beast';

export type BrawlerAttackStyle = 'punch' | 'stretch_punch' | 'kick';

export type WeaponMountStyle =
  | 'right_hand'
  | 'dual_hand'
  | 'santoryu_mouth'
  | 'quad_giraffe'
  | 'cane_sword'
  | 'trident'
  | 'axe_arm'
  | 'nodachi'
  | 'kiribachi'
  | 'flame_sword';

export type CasterPropStyle =
  | 'clima_tact_zeus'
  | 'kabuto_slingshot'
  | 'hana_crossed_arms'
  | 'bara_split_body'
  | 'ito_strings_coat'
  | 'sand_hook'
  | 'goro_drums'
  | 'moku_jitte'
  | 'kage_bats'
  | 'doa_portal'
  | 'elemental_orb';

export type SmallAgileSubMode =
  | 'reindeer_chibi'
  | 'guard_sphere'
  | 'kungfu_brawler';

export type BulkyCoatStyle =
  | 'admiral_justice_coat'
  | 'pirate_captain_coat'
  | 'lunarian_wings'
  | 'fishman_gi'
  | 'cyborg_arms'
  | 'wootz_armor'
  | 'venom_wings'
  | 'none';

export type GiantBeastSubRig =
  | 'serpentine_dragon'
  | 'spider_oni'
  | 'winged_phoenix'
  | 'giant_humanoid';

export type PortraitEmotion =
  | 'normal'
  | 'angry'
  | 'determined'
  | 'shocked'
  | 'smirk'
  | 'sad'
  | 'excited'
  | 'battle_cry';

export const ALL_PORTRAIT_EMOTIONS: readonly PortraitEmotion[] = [
  'normal',
  'angry',
  'determined',
  'shocked',
  'smirk',
  'sad',
  'excited',
  'battle_cry'
] as const;

export type ThreeToneHex = [string, string, string]; // [highlight, base, shadow]

export interface CharacterBlueprintPalette {
  skin: ThreeToneHex;
  hair: ThreeToneHex;
  top: ThreeToneHex;
  bottom: ThreeToneHex;
  accent: ThreeToneHex;
  weaponOrEffect: ThreeToneHex;
  coatOrWings?: ThreeToneHex;
  hatOrHelm?: ThreeToneHex;
  scarColor?: string;
  eyeColor?: string;
}

export type BlueprintHairStyle =
  | 'spiky_short'
  | 'marimo_cropped'
  | 'side_sweep_left_covered'
  | 'long_wavy'
  | 'curly_bandanna'
  | 'reindeer_antlers_hat'
  | 'long_straight_dark'
  | 'cyborg_pompadour'
  | 'giant_afro_skull'
  | 'topknot_sideburns'
  | 'flame_white_nika'
  | 'slick_back'
  | 'pineapple_blonde'
  | 'oni_horns_mane'
  | 'viking_horned_helm'
  | 'elder_beard_cap'
  | 'bull_horns'
  | 'clown_hat_tails'
  | 'marine_cap'
  | 'fur_hood'
  | 'spotted_hat'
  | 'feathered_shades'
  | 'spiky_scarf'
  | 'winged_mask'
  | 'white_wild_hair'
  | 'crown_hippo'
  | 'sleep_mask_curls'
  | 'bandana_earlobes'
  | 'onion_goth'
  | 'top_hat_pigeon'
  | 'shadow_silhouette';

export type BlueprintFaceFeature =
  | 'under_eye_scar'
  | 'left_eye_scar'
  | 'curly_brow_cigar'
  | 'long_nose_goggles'
  | 'blue_nose'
  | 'sunglasses_star'
  | 'skull_sockets'
  | 'fishman_gills_fangs'
  | 'steel_jaw'
  | 'clown_red_nose'
  | 'face_stitch_cigar'
  | 'doffy_shades'
  | 'mouth_scarf_fangs'
  | 'eye_bandage'
  | 'admiral_shades'
  | 'black_beard_grin'
  | 'giraffe_square_nose'
  | 'leopard_muzzle'
  | 'lunarian_mask_tattoo'
  | 'oni_fangs_mustache'
  | 'none';

export type BlueprintChestFeature =
  | 'x_scar_open_vest'
  | 'diagonal_scar_haramaki'
  | 'black_suit_tie'
  | 'bikini_top'
  | 'overalls_strap'
  | 'fur_chest'
  | 'corset_collar'
  | 'open_shirt_chain'
  | 'cravat_ribs'
  | 'sun_tattoo_gi'
  | 'admiral_suit_tie'
  | 'gold_plate_armor'
  | 'pink_feather_chest'
  | 'tattoos_bare_chest'
  | 'dragon_scales_chest'
  | 'mecha_star_chest'
  | 'none';

export interface CharacterBlueprintHeadSpec {
  hairStyle: BlueprintHairStyle;
  faceFeature?: BlueprintFaceFeature;
  chestFeature?: BlueprintChestFeature;
  hasStrawHat?: boolean;
}

export type CharacterBlueprintGroup =
  | 'straw_hats'
  | 'east_blue'
  | 'grand_line'
  | 'marineford_allies'
  | 'new_world'
  | 'arena_originals';

export interface CharacterBlueprintEntry {
  key: string;
  unitId: string;
  formId: string;
  name: string;
  group: CharacterBlueprintGroup;
  rigType: RigType;
  frameWidth: 48 | 64 | 96;
  frameHeight: 48 | 64 | 96;
  anchor: { x: number; y: number };
  attackStyle?: BrawlerAttackStyle;
  weaponMount?: WeaponMountStyle;
  casterProp?: CasterPropStyle;
  smallSubMode?: SmallAgileSubMode;
  coatStyle?: BulkyCoatStyle;
  giantSubRig?: GiantBeastSubRig;
  hagoromoCloud?: 'white' | 'black' | null;
  elementalArm?:
    | 'magma'
    | 'ice'
    | 'light'
    | 'dark_quake'
    | 'smoke'
    | 'sand'
    | 'venom'
    | 'fire_leg'
    | 'water_fist'
    | null;
  head: CharacterBlueprintHeadSpec;
  palette: CharacterBlueprintPalette;
}

export interface CharacterBlueprintsFile {
  version: string;
  entries: CharacterBlueprintEntry[];
}

export interface BakedSpriteMetaFile {
  key: string;
  unitId: string;
  formId: string;
  rigType: RigType;
  frameWidth: 32 | 48 | 64 | 96;
  frameHeight: 32 | 48 | 64 | 96;
  sheetWidth: number;
  sheetHeight: number;
  anchor: { x: number; y: number };
  source: 'PROCEDURAL_RIG_BAKED' | 'USER_CUSTOM_SHEET';
  sha256: string;
  bakedAt: string;
  animations: Record<SpriteAnimState, SpriteAnimClipDef>;
}

export function createStandardRigAnimations(): Record<
  SpriteAnimState,
  SpriteAnimClipDef
> {
  return {
    IDLE: { row: 0, frames: 4, fps: 5, loop: true },
    MOVE: { row: 1, frames: 6, fps: 12, loop: true },
    WINDUP: { row: 2, frames: 3, fps: 10, loop: false },
    ATTACK_MELEE: { row: 3, frames: 4, fps: 14, loop: false, hitFrame: 2 },
    ATTACK_CAST: { row: 4, frames: 4, fps: 12, loop: false, hitFrame: 2 },
    CLASH: { row: 5, frames: 2, fps: 12, loop: true },
    DODGE: { row: 6, frames: 3, fps: 12, loop: false },
    HIT: { row: 7, frames: 2, fps: 10, loop: false },
    DOWNED: { row: 8, frames: 2, fps: 4, loop: true },
    TRANSFORM: { row: 9, frames: 4, fps: 10, loop: false, hitFrame: 2 },
    VICTORY: { row: 10, frames: 3, fps: 6, loop: true }
  };
}
