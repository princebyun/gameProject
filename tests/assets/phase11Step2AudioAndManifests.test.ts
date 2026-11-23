import { describe, expect, it } from 'vitest';
import { ExternalAssetResolver } from '../../src/assets/externalAssetResolver';
import { AudioManager } from '../../src/audio/audioManager';
import { RetroAudioEngine } from '../../src/audio/retroAudioEngine';
import { BATTLE_CALC_VERSION } from '../../src/core/constants';
import {
  createAssetManifestRegistry,
  resolveBgmForSeaZone
} from '../../src/data/assets/assetManifestRegistry';
import { defaultDataRegistry } from '../../src/data/dataRegistry';
import { defaultRpgDataRegistry } from '../../src/data/rpgDataRegistry';

describe('Stage 4 Step 2 — Retro Audio Pipeline, Throttling & Full Manifest Integrity', () => {
  it('validates AudioManifest (>=10 BGM tracks & >=20 standard SFX) and sea-zone BGM routing', () => {
    const registry = createAssetManifestRegistry();
    expect(registry.audioFile.crossfadeSec).toBe(0.6);
    expect(registry.audioFile.bgmTracks.length).toBeGreaterThanOrEqual(10);
    expect(registry.audioFile.sfxEntries.length).toBeGreaterThanOrEqual(20);

    const expectedBgm = [
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
    for (const id of expectedBgm) {
      const t = registry.bgmById[id];
      expect(t, `Missing BGM track ${id}`).toBeDefined();
      if (!t) throw new Error(`Missing BGM track ${id}`);
      expect(t.loopEndSec).toBeGreaterThan(t.loopStartSec);
      expect(t.bpm).toBeGreaterThan(60);
      expect(t.chiptunePreset.leadPattern.length).toBeGreaterThanOrEqual(16);
      expect(t.chiptunePreset.arpPattern.length).toBeGreaterThanOrEqual(16);
      expect(t.chiptunePreset.bassPattern.length).toBeGreaterThanOrEqual(16);
      expect(t.chiptunePreset.drumPattern.length).toBeGreaterThanOrEqual(16);
    }

    expect(registry.bgmById['victory_fanfare']?.loop).toBe(false);
    expect(resolveBgmForSeaZone('east_blue')).toBe('sea_east_blue');
    expect(resolveBgmForSeaZone('grand_line_first_half')).toBe('sea_grand_line');
    expect(resolveBgmForSeaZone('grand_line')).toBe('sea_grand_line');
    expect(resolveBgmForSeaZone('new_world')).toBe('sea_new_world');

    const expectedSfx = [
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
    for (const id of expectedSfx) {
      const s = registry.sfxById[id];
      expect(s, `Missing SFX ${id}`).toBeDefined();
      if (!s) throw new Error(`Missing SFX ${id}`);
      expect(s.throttleMs).toBe(50);
      expect(s.maxPolyphony).toBe(3);
      expect(s.pitchJitterRatio).toBe(0.06);
    }
  });

  it('enforces 50ms / max-3-voice SFX throttling and ±6% pitch jitter without clipping', () => {
    const rngValues = [0.0, 0.5, 1.0, 0.25, 0.75];
    let rngIdx = 0;
    const deterministicRng = () => rngValues[rngIdx++ % rngValues.length] ?? 0.5;

    const resolver = new ExternalAssetResolver(
      async () => null,
      async () => null
    );
    const engine = new RetroAudioEngine(
      resolver,
      createAssetManifestRegistry(),
      deterministicRng
    );

    const results = [];
    for (let i = 0; i < 6; i++) {
      results.push(engine.playSfxById('slash_light', 1000 + i * 5));
    }

    const played = results.filter((r) => r.played);
    const throttled = results.filter((r) => r.reason === 'THROTTLED');
    expect(played.length).toBe(3);
    expect(throttled.length).toBe(3);

    // Verify exact ±6% pitch jitter range (0.94, 1.0, 1.06)
    const [played0, played1, played2] = played;
    if (!played0 || !played1 || !played2) throw new Error('Expected 3 played SFX entries');
    expect(played0.pitchMultiplier).toBe(0.94);
    expect(played1.pitchMultiplier).toBe(1);
    expect(played2.pitchMultiplier).toBe(1.06);

    // Different SFX ID should NOT be blocked during slash_light's 50ms window
    const otherSfx = engine.playSfxById('haki_lightning', 1015);
    expect(otherSfx.played).toBe(true);

    // Once 50ms window expires, slash_light plays again cleanly
    const afterWindow = engine.playSfxById('slash_light', 1060);
    expect(afterWindow.played).toBe(true);

    // Muting blocks SFX cleanly
    engine.setMuted(true);
    const mutedRes = engine.playSfxById('awakening_drums', 1200);
    expect(mutedRes.played).toBe(false);
    expect(mutedRes.reason).toBe('MUTED');
  });

  it('prioritizes external .ogg BGM/SFX over chiptune fallback and handles dynamic battle mood & break filter', async () => {
    const fakeExternalBuffer = { duration: 30 } as unknown as AudioBuffer;
    const resolver = new ExternalAssetResolver(
      async () => null,
      async (src) =>
        src.includes('battle_yonko_awakening.ogg') || src.includes('just_dodge_chime.ogg')
          ? fakeExternalBuffer
          : null
    );

    const engine = new RetroAudioEngine(resolver, createAssetManifestRegistry());

    // Missing external .ogg -> falls back cleanly to CHIPTUNE_FALLBACK
    const normalRes = await engine.playBgm('battle_normal');
    expect(normalRes?.trackId).toBe('battle_normal');
    expect(normalRes?.source).toBe('CHIPTUNE_FALLBACK');
    expect(normalRes?.crossfadeSec).toBe(0.6);

    // Existing external .ogg -> overrides with EXTERNAL_OGG
    await engine.setBattleMood('YONKO_AWAKENING');
    expect(engine.getCurrentBgmId()).toBe('battle_yonko_awakening');
    expect(engine.getCurrentBgmSource()).toBe('EXTERNAL_OGG');

    // Giant raid mood + raid break low-pass filter toggle
    await engine.setBattleMood('RAID_GIANT');
    expect(engine.getCurrentBgmId()).toBe('battle_raid_giant');
    expect(engine.isBreakFilterActive()).toBe(false);
    engine.setBreakFilterActive(true);
    expect(engine.isBreakFilterActive()).toBe(true);

    // External SFX preload overrides CHIPTUNE_FALLBACK with EXTERNAL_OGG
    const sfxSource = await engine.sfx.preloadSfx('just_dodge_chime', null);
    expect(sfxSource).toBe('EXTERNAL_OGG');
    const playRes = engine.playSfxById('just_dodge_chime', 2000);
    expect(playRes.played).toBe(true);
    expect(playRes.source).toBe('EXTERNAL_OGG');

    // Independent Master / BGM / SFX volume controls & legacy AudioManager wrapper
    const manager = new AudioManager(resolver, createAssetManifestRegistry());
    manager.setMasterVolume(0.9);
    manager.setBgmVolume(0.5);
    manager.setSfxVolume(0.65);
    expect(manager.getVolumes()).toEqual({
      master: 0.9,
      bgm: 0.5,
      sfx: 0.65,
      muted: false
    });
    const legacy = manager.playSfx('CLASH');
    expect(legacy.played).toBe(true);
    expect(legacy.sfxId).toBe('melee_clash_clang');
  });

  it('verifies full manifest cross-integrity and confirms BATTLE_CALC_VERSION remains 0.6.0', () => {
    expect(BATTLE_CALC_VERSION).toBe('0.6.0');
    const registry = createAssetManifestRegistry();

    for (const unit of Object.values(defaultDataRegistry.units)) {
      expect(registry.spritesByKey[`${unit.id}_base`]).toBeDefined();
      const formIds = new Set<string>();
      if (unit.defaultFormId) formIds.add(unit.defaultFormId);
      if (unit.awakenedFormId) formIds.add(unit.awakenedFormId);
      for (const fId of unit.forms ?? []) formIds.add(fId);
      for (const fId of formIds) {
        expect(registry.spritesByKey[`${unit.id}_${fId}`]).toBeDefined();
      }
    }

    for (const zone of Object.values(defaultRpgDataRegistry.seaZones)) {
      const biomeId = registry.tilesetsFile.seaZoneBiomeMap[zone.id];
      expect(biomeId).toBeDefined();
      if (!biomeId) throw new Error(`Missing sea zone biome mapping for ${zone.id}`);
      expect(registry.biomesById[biomeId]).toBeDefined();
    }

    for (const island of Object.values(defaultRpgDataRegistry.islands)) {
      const biomeId = registry.tilesetsFile.islandBiomeMap[island.islandId];
      expect(biomeId).toBeDefined();
      if (!biomeId) throw new Error(`Missing island biome mapping for ${island.islandId}`);
      expect(registry.biomesById[biomeId]).toBeDefined();
    }
  });
});
