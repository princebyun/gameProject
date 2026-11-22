import { describe, expect, it } from 'vitest';
import {
  assertValidEpisodeDefinition,
  assertValidIslandMapDefinition,
  assertValidMoveDefinition,
  assertValidUnitDefinition
} from '../../src/data/schemaGuards';
import {
  createUnifiedDataRegistry,
  unifiedDataRegistry
} from '../../src/data/unifiedDataRegistry';

describe('Phase 2.1: Unified DataRegistry, Schema Guards & O(1) Map Indices', () => {
  it('initializes unifiedDataRegistry and matches O(1) Map lookups across all data domains', () => {
    const reg = createUnifiedDataRegistry();

    expect(reg.combat.unitsMap.size).toBe(Object.keys(reg.combat.units).length);
    expect(reg.combat.movesMap.size).toBe(Object.keys(reg.combat.moves).length);
    expect(reg.combat.formsMap.size).toBe(Object.keys(reg.combat.forms).length);
    expect(reg.combat.traitsMap.size).toBe(Object.keys(reg.combat.traits).length);
    expect(reg.combat.equipmentMap.size).toBe(Object.keys(reg.combat.equipment).length);
    expect(reg.combat.elementsById.size).toBe(reg.combat.elements.elements.length);
    expect(reg.combat.aiProfilesMap.size).toBe(Object.keys(reg.combat.aiProfiles).length);

    expect(reg.rpg.islandsMap.size).toBe(Object.keys(reg.rpg.islands).length);
    expect(reg.rpg.episodesMap.size).toBe(Object.keys(reg.rpg.episodes).length);
    expect(reg.rpg.shipsMap.size).toBe(Object.keys(reg.rpg.ships).length);
    expect(reg.rpg.seaZonesMap.size).toBe(3);

    expect(reg.endgame.raidsMap.size).toBe(Object.keys(reg.endgame.raids).length);
    expect(reg.endgame.raidRelicsMap.size).toBe(Object.keys(reg.endgame.raidRelics).length);
    expect(reg.endgame.tutorMovesMap.size).toBe(Object.keys(reg.endgame.tutorMoves).length);

    expect(reg.assets.spritesMap.size).toBe(reg.assets.spritesFile.entries.length);
    expect(reg.assets.biomesMap.size).toBe(reg.assets.tilesetsFile.biomes.length);
    expect(reg.assets.bgmMap.size).toBe(reg.assets.audioFile.bgmTracks.length);
    expect(reg.assets.sfxMap.size).toBe(reg.assets.audioFile.sfxEntries.length);

    expect(unifiedDataRegistry.getUnit('luffy')?.name).toBe('몽키 D. 루피');
    expect(unifiedDataRegistry.getMove('move_luffy_pistol')?.element).toBe('BLUNT');
    expect(unifiedDataRegistry.getForm('form_luffy_gear5')?.kind).toBe('OVERDRIVE');
    expect(unifiedDataRegistry.getElement('LIGHTNING')?.color).toBeTruthy();
    expect(unifiedDataRegistry.getAiProfile(4)?.level).toBe(4);
    expect(unifiedDataRegistry.getSeaZone('east_blue')?.id).toBe('east_blue');
    expect(unifiedDataRegistry.getShip('thousand_sunny')?.id).toBe('thousand_sunny');
    expect(unifiedDataRegistry.getIsland('foosha_shells')?.islandId).toBe('foosha_shells');
    expect(unifiedDataRegistry.getEpisode('ep_east_blue_start')?.episodeId).toBe(
      'ep_east_blue_start'
    );
    expect(unifiedDataRegistry.getRaid('raid_kaido_flame')?.speciesId).toBe('kaido');
    expect(unifiedDataRegistry.getSpriteEntry('luffy_base')?.key).toBe('luffy_base');
    expect(unifiedDataRegistry.getBgm('title_adventure')?.id).toBe('title_adventure');
    expect(unifiedDataRegistry.getSfx('slash_light')?.id).toBe('slash_light');
  });

  it('rejects malformed payloads cleanly via runtime schemaGuards', () => {
    expect(() => assertValidUnitDefinition({ id: '' }, 0)).toThrow(/\[DataSchema\]/);
    expect(() =>
      assertValidUnitDefinition(
        {
          id: 'broken',
          name: 'Broken',
          element: 'BLUNT',
          traitId: 't',
          defaultFormId: 'f',
          defaultEquipmentId: 'e',
          baseStats: { hp: 'bad' }
        },
        0
      )
    ).toThrow(/baseStats\.hp/);

    expect(() =>
      assertValidMoveDefinition({ id: 'm1', name: 'Bad Move', basePower: 'NaN' }, 0)
    ).toThrow(/\[DataSchema\]/);

    expect(() =>
      assertValidIslandMapDefinition({ islandId: 'x', name: 'X', episodeId: 'ep' }, 0)
    ).toThrow(/width/);

    expect(() =>
      assertValidEpisodeDefinition(
        { episodeId: 'e1', islandId: 'i1', zoneId: 'east_blue', title: 'T' },
        0
      )
    ).toThrow(/requiredForNextZone/);
  });
});
