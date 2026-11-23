import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  AudioManifestFile,
  BattleBackdropsManifestFile,
  SpriteSheetManifestFile,
  TilesetManifestFile,
  VfxManifestFile
} from '../src/data/assets/types';
import { STANDARD_SPRITE_ANIM_STATES } from '../src/data/assets/types';
import {
  ALL_PORTRAIT_EMOTIONS,
  type CharacterBlueprintsFile
} from '../src/render/sprite/rig/rigTypes';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

function readJson<T>(relPath: string): T {
  const abs = path.join(ROOT, relPath);
  const raw = fs.readFileSync(abs, 'utf-8');
  return JSON.parse(raw) as T;
}

/**
 * Checks whether a relative path under `ROOT` exists with 100% strict case sensitivity
 * on every path segment (prevents Windows case-insensitive pass / Linux-Android WebView 404).
 */
function existsStrictCase(relPath: string): boolean {
  const normalized = relPath.replace(/\\/g, '/').replace(/^\.\//, '');
  const parts = normalized.split('/').filter(Boolean);
  let currentDir = ROOT;

  for (const part of parts) {
    if (!fs.existsSync(currentDir) || !fs.statSync(currentDir).isDirectory()) {
      return false;
    }
    const entries = fs.readdirSync(currentDir);
    if (!entries.includes(part)) {
      return false;
    }
    currentDir = path.join(currentDir, part);
  }
  return fs.existsSync(currentDir);
}

function readPngDimensions(absPath: string): { width: number; height: number } | null {
  const buf = fs.readFileSync(absPath);
  if (buf.byteLength < 24 || buf[0] !== 0x89 || buf[1] !== 0x50) {
    return null;
  }
  return {
    width: buf.readUInt32BE(16),
    height: buf.readUInt32BE(20)
  };
}

function hasValidAudioHeader(absPath: string): boolean {
  const buf = fs.readFileSync(absPath);
  if (buf.byteLength < 16) return false;
  if (buf[0] === 0x4f && buf[1] === 0x67 && buf[2] === 0x67 && buf[3] === 0x53) return true; // OggS
  if (buf[0] === 0x49 && buf[1] === 0x44 && buf[2] === 0x33) return true; // ID3
  if (buf[0] === 0xff && (buf[1]! & 0xe0) === 0xe0) return true; // MP3 sync
  if (buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46) return true; // RIFF
  return false;
}

interface UnitJsonEntry {
  id: string;
  name: string;
  defaultFormId?: string;
  awakenedFormId?: string;
  forms?: string[];
}

interface FormJsonEntry {
  id: string;
}

interface SeaZoneJsonEntry {
  id: string;
}

interface IslandJsonEntry {
  islandId: string;
}

const REQUIRED_BGM_IDS = [
  'title_adventure',
  'sea_east_blue',
  'sea_grand_line',
  'sea_new_world',
  'island_peaceful',
  'battle_normal',
  'battle_boss',
  'battle_yonko_awakening',
  'battle_raid_giant',
  'victory_fanfare'
];

const REQUIRED_SFX_IDS = [
  'slash_light',
  'slash_heavy',
  'blunt_hit',
  'beam_fire',
  'beam_clash_loop',
  'melee_clash_clang',
  'dodge_whoosh',
  'just_dodge_chime',
  'haki_lightning',
  'logia_dissolve',
  'transform_burst',
  'awakening_drums',
  'ui_move',
  'ui_confirm',
  'ui_cancel',
  'wanted_poster_slam',
  'ship_cannon',
  'coup_de_burst'
];

const REQUIRED_SHIP_KEYS = [
  'ship_going_merry',
  'ship_thousand_sunny',
  'ship_marine_warship',
  'ship_sea_king'
];

const VALID_FRAME_SIZES = new Set([32, 48, 64, 96, 128]);

function main(): void {
  const errors: string[] = [];

  const units = readJson<UnitJsonEntry[]>('src/data/units.json');
  const forms = readJson<FormJsonEntry[]>('src/data/forms.json');
  const seaZones = readJson<SeaZoneJsonEntry[]>('src/data/sea_zones.json');
  const islandsDir = path.join(ROOT, 'src/data/islands');
  const islands: IslandJsonEntry[] = fs
    .readdirSync(islandsDir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => readJson<IslandJsonEntry>(`src/data/islands/${f}`));

  const sprites = readJson<SpriteSheetManifestFile>('src/data/assets/sprites.json');
  const blueprints = readJson<CharacterBlueprintsFile>(
    'src/data/assets/character_blueprints.json'
  );
  const tilesets = readJson<TilesetManifestFile>('src/data/assets/tilesets.json');
  const audio = readJson<AudioManifestFile>('src/data/assets/audio.json');
  const backgrounds = readJson<BattleBackdropsManifestFile>('src/data/assets/backgrounds.json');
  const vfx = readJson<VfxManifestFile>('src/data/assets/vfx.json');

  const formIdSet = new Set(forms.map((f) => f.id));
  const blueprintByKey = new Map(blueprints.entries.map((b) => [b.key, b]));

  // 1. Validate sprites.json & strict case-sensitive external PNG + .meta.json files
  const spriteByKey = new Map<string, SpriteSheetManifestFile['entries'][number]>();
  let externalSpriteCount = 0;

  for (const entry of sprites.entries) {
    if (spriteByKey.has(entry.key)) {
      errors.push(`[sprites.json] Duplicate sprite key: "${entry.key}"`);
    }
    spriteByKey.set(entry.key, entry);

    if (!VALID_FRAME_SIZES.has(entry.frameWidth) || !VALID_FRAME_SIZES.has(entry.frameHeight)) {
      errors.push(
        `[sprites.json] Invalid frame size on "${entry.key}": ${entry.frameWidth}x${entry.frameHeight} (expected 32, 48, 64, 96, or 128)`
      );
    }

    if (!entry.src || !entry.src.startsWith('assets/sprites/')) {
      errors.push(`[sprites.json] Invalid src path on "${entry.key}": "${entry.src}"`);
    } else {
      const relPublicPng = `public/${entry.src}`;
      const relPublicMeta = `public/assets/sprites/${entry.key}.meta.json`;
      const absSpritePath = path.join(ROOT, relPublicPng);
      const absMetaPath = path.join(ROOT, relPublicMeta);

      if (!existsStrictCase(relPublicPng)) {
        errors.push(
          `[sprites.json] Missing or case-mismatched sprite PNG on disk: "${relPublicPng}"`
        );
      } else {
        const stat = fs.statSync(absSpritePath);
        if (stat.size <= 0) {
          errors.push(`[sprites.json] Sprite PNG "${relPublicPng}" is 0 bytes`);
        }
        const dims = readPngDimensions(absSpritePath);
        if (!dims) {
          errors.push(`[sprites.json] Invalid PNG header on "${relPublicPng}"`);
        } else if (entry.atlasMode === 'VARIABLE_PACK') {
          if (stat.size >= 1024 * 1024) {
            errors.push(`[sprites.json] VARIABLE_PACK PNG "${entry.src}" exceeds 1 MiB (${stat.size}B)`);
          }
          externalSpriteCount += 1;
        } else {
          if (dims.width < entry.frameWidth * 4) {
            errors.push(
              `[sprites.json] External PNG "${entry.src}" is too narrow (${dims.width}px < ${entry.frameWidth * 4}px minimum 4-frame sheet).`
            );
          } else if (dims.height < entry.frameHeight * STANDARD_SPRITE_ANIM_STATES.length) {
            errors.push(
              `[sprites.json] External PNG "${entry.src}" has invalid height (${dims.height}px < ${entry.frameHeight * STANDARD_SPRITE_ANIM_STATES.length}px).`
            );
          } else {
            externalSpriteCount += 1;
          }
        }
      }

      if (!existsStrictCase(relPublicMeta)) {
        errors.push(
          `[sprites.json] Missing or case-mismatched sprite .meta.json on disk: "${relPublicMeta}"`
        );
      } else if (fs.statSync(absMetaPath).size <= 0) {
        errors.push(`[sprites.json] Sprite meta file "${relPublicMeta}" is 0 bytes`);
      }
    }

    for (let rowIdx = 0; rowIdx < STANDARD_SPRITE_ANIM_STATES.length; rowIdx++) {
      const state = STANDARD_SPRITE_ANIM_STATES[rowIdx];
      const clip = entry.animations?.[state];
      if (!clip) {
        errors.push(`[sprites.json] Missing animation "${state}" on "${entry.key}"`);
      } else {
        if (clip.row !== rowIdx) {
          errors.push(
            `[sprites.json] Row mismatch on "${entry.key}.${state}": got ${clip.row}, expected ${rowIdx}`
          );
        }
        if (clip.frames < 1 || clip.fps <= 0) {
          errors.push(
            `[sprites.json] Invalid frames/fps on "${entry.key}.${state}": frames=${clip.frames}, fps=${clip.fps}`
          );
        }
        if ((state === 'IDLE' || state === 'MOVE') && clip.frames < 4) {
          errors.push(
            `[sprites.json] "${entry.key}.${state}" must have at least 4 frames (got ${clip.frames})`
          );
        }
        if (entry.atlasMode === 'VARIABLE_PACK') {
          const rects = clip.frameRects;
          const absDims = existsStrictCase(`public/${entry.src}`)
            ? readPngDimensions(path.join(ROOT, `public/${entry.src}`))
            : null;
          if (!rects || rects.length !== clip.frames) {
            errors.push(
              `[sprites.json] VARIABLE_PACK "${entry.key}.${state}" requires frameRects matching frames=${clip.frames}`
            );
          } else if (absDims) {
            for (const fr of rects) {
              if (
                fr.x < 0 ||
                fr.y < 0 ||
                fr.w <= 0 ||
                fr.h <= 0 ||
                fr.x + fr.w > absDims.width ||
                fr.y + fr.h > absDims.height ||
                fr.pivotX < 0 ||
                fr.pivotX > fr.w ||
                fr.pivotY < 0 ||
                fr.pivotY > fr.h
              ) {
                errors.push(
                  `[sprites.json] Out-of-bounds frameRect on "${entry.key}.${state}": ${JSON.stringify(fr)}`
                );
              }
            }
          }
        }
      }
    }
  }

  // 1.5 Verify all units, forms, blueprints & 64x64 8-emotion portraits
  let verifiedPortraitsCount = 0;
  for (const unit of units) {
    const baseKey = `${unit.id}_base`;
    if (!spriteByKey.has(baseKey)) {
      errors.push(`[sprites.json] Missing base sprite entry for unit "${unit.id}" (expected "${baseKey}")`);
    }
    if (!blueprintByKey.has(baseKey)) {
      errors.push(`[character_blueprints.json] Missing base blueprint "${baseKey}"`);
    }

    const unitFormIds = new Set<string>();
    if (unit.defaultFormId) unitFormIds.add(unit.defaultFormId);
    if (unit.awakenedFormId) unitFormIds.add(unit.awakenedFormId);
    for (const fid of unit.forms ?? []) unitFormIds.add(fid);

    for (const formId of unitFormIds) {
      if (!formIdSet.has(formId)) {
        errors.push(`[units.json -> forms.json] Unit "${unit.id}" references unknown formId "${formId}"`);
      }
      const formKey = `${unit.id}_${formId}`;
      if (!spriteByKey.has(formKey)) {
        errors.push(`[sprites.json] Missing form sprite entry "${formKey}"`);
      }
      if (!blueprintByKey.has(formKey)) {
        errors.push(`[character_blueprints.json] Missing form blueprint "${formKey}"`);
      }
    }

    for (const emotion of ALL_PORTRAIT_EMOTIONS) {
      const relPortrait = `public/assets/portraits/${unit.id}_${emotion}.png`;
      if (!existsStrictCase(relPortrait)) {
        errors.push(
          `[portraits] Missing or case-mismatched 64x64 portrait: "${relPortrait}"`
        );
      } else {
        const absPortrait = path.join(ROOT, relPortrait);
        const stat = fs.statSync(absPortrait);
        const dims = readPngDimensions(absPortrait);
        if (stat.size <= 0 || !dims || dims.width < 64 || dims.width !== dims.height) {
          errors.push(
            `[portraits] Invalid >=64x64 square portrait file "${relPortrait}" (size=${stat.size}, dims=${dims?.width}x${dims?.height})`
          );
        } else {
          verifiedPortraitsCount += 1;
        }
      }
    }
  }

  for (const shipKey of REQUIRED_SHIP_KEYS) {
    if (!spriteByKey.has(shipKey)) {
      errors.push(`[sprites.json] Missing required ship sprite entry "${shipKey}"`);
    }
  }

  // 2. Validate tilesets.json
  const biomeIds = new Set<string>();
  let externalTilesetCount = 0;

  for (const biome of tilesets.biomes) {
    if (biomeIds.has(biome.biomeId)) {
      errors.push(`[tilesets.json] Duplicate biomeId: "${biome.biomeId}"`);
    }
    biomeIds.add(biome.biomeId);

    if (biome.tileSize !== 16 || biome.renderScale !== 2) {
      errors.push(
        `[tilesets.json] Invalid tileSize/renderScale on "${biome.biomeId}": ${biome.tileSize} @ ${biome.renderScale}x`
      );
    }
    if (biome.animatedFrames < 4) {
      errors.push(
        `[tilesets.json] Biome "${biome.biomeId}" must have at least 4 animated frames`
      );
    }
    const relTileset = `public/${biome.src}`;
    if (!existsStrictCase(relTileset)) {
      errors.push(`[tilesets.json] Missing external layered tileset PNG: "${relTileset}"`);
    } else {
      const dims = readPngDimensions(path.join(ROOT, relTileset));
      if (!dims || dims.width < 256 || dims.height < 64) {
        errors.push(
          `[tilesets.json] Tileset PNG "${relTileset}" too small (${dims?.width}x${dims?.height}, expected >=256x64)`
        );
      } else {
        externalTilesetCount += 1;
      }
    }
  }

  for (const z of seaZones) {
    const mapped = tilesets.seaZoneBiomeMap[z.id];
    if (!mapped || !biomeIds.has(mapped)) {
      errors.push(`[tilesets.json] Sea zone "${z.id}" maps to missing biome "${mapped}"`);
    }
  }

  for (const isl of islands) {
    const mapped = tilesets.islandBiomeMap[isl.islandId];
    if (!mapped || !biomeIds.has(mapped)) {
      errors.push(`[tilesets.json] Island "${isl.islandId}" maps to missing biome "${mapped}"`);
    }
  }

  for (const [arenaKey, biomeId] of Object.entries(tilesets.arenaBiomeMap)) {
    if (!biomeIds.has(biomeId)) {
      errors.push(`[tilesets.json] Arena "${arenaKey}" maps to missing biome "${biomeId}"`);
    }
  }

  // 3. Validate audio.json
  const bgmById = new Map<string, AudioManifestFile['bgmTracks'][number]>();
  let externalAudioCount = 0;

  for (const track of audio.bgmTracks) {
    if (bgmById.has(track.id)) {
      errors.push(`[audio.json] Duplicate BGM id: "${track.id}"`);
    }
    bgmById.set(track.id, track);

    if (track.loopEndSec <= track.loopStartSec || track.bpm <= 0) {
      errors.push(
        `[audio.json] Invalid loop/bpm on BGM "${track.id}": loop=${track.loopStartSec}..${track.loopEndSec}, bpm=${track.bpm}`
      );
    }
    const p = track.chiptunePreset;
    if (
      !p ||
      p.leadPattern.length === 0 ||
      p.arpPattern.length === 0 ||
      p.bassPattern.length === 0 ||
      p.drumPattern.length === 0
    ) {
      errors.push(`[audio.json] Incomplete 4-channel chiptunePreset on BGM "${track.id}"`);
    }
    const relTrack = `public/${track.src}`;
    if (!existsStrictCase(relTrack)) {
      errors.push(`[audio.json] Missing external BGM audio file: "${relTrack}"`);
    } else if (!hasValidAudioHeader(path.join(ROOT, relTrack))) {
      errors.push(`[audio.json] Invalid OGG/MP3 header on BGM "${relTrack}"`);
    } else {
      externalAudioCount += 1;
    }
  }

  for (const reqBgm of REQUIRED_BGM_IDS) {
    if (!bgmById.has(reqBgm)) {
      errors.push(`[audio.json] Missing required BGM track "${reqBgm}"`);
    }
  }

  const sfxById = new Map<string, AudioManifestFile['sfxEntries'][number]>();
  for (const sfx of audio.sfxEntries) {
    if (sfxById.has(sfx.id)) {
      errors.push(`[audio.json] Duplicate SFX id: "${sfx.id}"`);
    }
    sfxById.set(sfx.id, sfx);
    if (sfx.throttleMs <= 0 || sfx.maxPolyphony < 1 || sfx.maxPolyphony > 3) {
      errors.push(
        `[audio.json] Invalid throttle/polyphony on SFX "${sfx.id}": throttleMs=${sfx.throttleMs}, maxPolyphony=${sfx.maxPolyphony}`
      );
    }
    const relSfx = `public/${sfx.src}`;
    if (!existsStrictCase(relSfx)) {
      errors.push(`[audio.json] Missing external SFX audio file: "${relSfx}"`);
    } else if (!hasValidAudioHeader(path.join(ROOT, relSfx))) {
      errors.push(`[audio.json] Invalid OGG/MP3 header on SFX "${relSfx}"`);
    } else {
      externalAudioCount += 1;
    }
  }

  for (const reqSfx of REQUIRED_SFX_IDS) {
    if (!sfxById.has(reqSfx)) {
      errors.push(`[audio.json] Missing required SFX entry "${reqSfx}"`);
    }
  }
  if (audio.bgmTracks.length < 10) {
    errors.push(`[audio.json] Expected >= 10 BGM tracks, got ${audio.bgmTracks.length}`);
  }
  if (audio.sfxEntries.length < 20) {
    errors.push(`[audio.json] Expected >= 20 SFX entries, got ${audio.sfxEntries.length}`);
  }

  // 4. Validate backgrounds.json (1280x540+ 3-layer battle backdrops)
  const backdropById = new Map<string, BattleBackdropsManifestFile['backdrops'][number]>();
  let verifiedBackdropLayers = 0;
  for (const bd of backgrounds.backdrops) {
    if (backdropById.has(bd.id)) {
      errors.push(`[backgrounds.json] Duplicate backdrop id: "${bd.id}"`);
    }
    backdropById.set(bd.id, bd);
    if (bd.width < 1280 || bd.height < 540 || bd.parallaxFactors.length !== 3) {
      errors.push(`[backgrounds.json] Invalid size or parallax factors on "${bd.id}": ${bd.width}x${bd.height}`);
    }
    for (const layerKey of ['sky', 'mid', 'ground'] as const) {
      const relLayer = `public/${bd.layers[layerKey]}`;
      if (!existsStrictCase(relLayer)) {
        errors.push(`[backgrounds.json] Missing backdrop layer: "${relLayer}"`);
      } else {
        const dims = readPngDimensions(path.join(ROOT, relLayer));
        if (!dims || dims.width < 1280 || dims.height < 540) {
          errors.push(
            `[backgrounds.json] Backdrop layer "${relLayer}" smaller than 1280x540 (${dims?.width}x${dims?.height})`
          );
        } else {
          verifiedBackdropLayers += 1;
        }
      }
    }
  }
  if (backgrounds.backdrops.length < 12) {
    errors.push(`[backgrounds.json] Expected >= 12 battle backdrops, got ${backgrounds.backdrops.length}`);
  }
  for (const z of seaZones) {
    const mapped = backgrounds.seaZoneBackdropMap[z.id];
    if (!mapped || !backdropById.has(mapped)) {
      errors.push(`[backgrounds.json] Sea zone "${z.id}" maps to missing backdrop "${mapped}"`);
    }
  }
  for (const isl of islands) {
    const mapped = backgrounds.islandBackdropMap[isl.islandId];
    if (!mapped || !backdropById.has(mapped)) {
      errors.push(`[backgrounds.json] Island "${isl.islandId}" maps to missing backdrop "${mapped}"`);
    }
  }

  // 5. Validate vfx.json (frame-based sprite sheet VFX atlases)
  const vfxIds = new Set<string>();
  let verifiedVfxCount = 0;
  for (const atlas of vfx.atlases) {
    if (vfxIds.has(atlas.id)) {
      errors.push(`[vfx.json] Duplicate VFX atlas id: "${atlas.id}"`);
    }
    vfxIds.add(atlas.id);
    if (atlas.frameCount < 1 || atlas.fps <= 0 || atlas.frameWidth < 16 || atlas.frameHeight < 16) {
      errors.push(`[vfx.json] Invalid metadata on VFX "${atlas.id}"`);
    }
    const relVfx = `public/${atlas.src}`;
    if (!existsStrictCase(relVfx)) {
      errors.push(`[vfx.json] Missing VFX PNG: "${relVfx}"`);
    } else {
      const dims = readPngDimensions(path.join(ROOT, relVfx));
      if (
        !dims ||
        dims.width < atlas.frameWidth * atlas.frameCount ||
        dims.height < atlas.frameHeight
      ) {
        errors.push(
          `[vfx.json] VFX sheet "${relVfx}" dimensions ${dims?.width}x${dims?.height} smaller than ${atlas.frameWidth * atlas.frameCount}x${atlas.frameHeight}`
        );
      } else {
        verifiedVfxCount += 1;
      }
    }
  }
  if (vfx.atlases.length < 8) {
    errors.push(`[vfx.json] Expected >= 8 VFX atlases, got ${vfx.atlases.length}`);
  }

  if (errors.length > 0) {
    console.error(`\n❌ Asset manifest validation FAILED (${errors.length} error(s)):\n`);
    for (const err of errors) {
      console.error(`  - ${err}`);
    }
    process.exit(1);
  }

  console.log('✅ Asset manifest validation PASSED (0 errors, strict case-sensitive match)!');
  console.log(
    `   • Sprites: ${sprites.entries.length} sheets (${units.length} units + forms + 4 ships) | External PNG: ${externalSpriteCount}, Baked Fallback: ${sprites.entries.length - externalSpriteCount}`
  );
  console.log(
    `   • Portraits: ${verifiedPortraitsCount} >=64x64 PNGs (${units.length} units × ${ALL_PORTRAIT_EMOTIONS.length} emotions)`
  );
  console.log(
    `   • Tilesets: ${tilesets.biomes.length} biomes (${seaZones.length} seas, ${islands.length} islands) | External PNG: ${externalTilesetCount}`
  );
  console.log(
    `   • Backdrops: ${backgrounds.backdrops.length} arenas (${verifiedBackdropLayers} 1280x540+ parallax layers)`
  );
  console.log(`   • VFX Atlases: ${verifiedVfxCount} frame-based sprite sheets`);
  console.log(
    `   • Audio: ${audio.bgmTracks.length} BGM tracks, ${audio.sfxEntries.length} SFX entries | External OGG/MP3: ${externalAudioCount}`
  );
}

main();
