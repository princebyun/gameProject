import {
  createAssetManifestRegistry,
  type AssetManifestRegistry
} from './assets/assetManifestRegistry';
import type {
  BgmTrackManifestEntry,
  SfxManifestEntry,
  SpriteSheetManifestEntry,
  TilesetManifestEntry
} from './assets/types';
import { createDefaultDataRegistry } from './dataRegistry';
import { createDefaultEndgameRegistry } from './endgame/endgameRegistry';
import { createDefaultRpgDataRegistry } from './rpgDataRegistry';
import type {
  EndgameDataRegistry,
  RaidBossDefinition,
  RaidRelicDefinition,
  TutorMoveDefinition
} from './schemas/endgameSchemas';
import type {
  AiProfileDefinition,
  ElementId,
  ElementMetadata,
  EquipmentDefinition,
  FormDefinition,
  GameDataRegistry,
  MoveDefinition,
  TraitDefinition,
  UnitDefinition
} from './schemas/gameDataSchemas';
import type {
  CrewRoleDefinition,
  CrewRoleId,
  EpisodeDefinition,
  IslandMapDefinition,
  RecruitmentRule,
  RpgDataRegistry,
  SeaZoneDefinition,
  SeaZoneId,
  ShipDefinition,
  TrainingUpgradeRule
} from './schemas/rpgSchemas';

/**
 * Unified read-only data facade aggregating Combat, RPG, Endgame, and Asset registries
 * with O(1) pre-indexed Map accessors validated at construction time.
 */
export class DataRegistry {
  public readonly combat: GameDataRegistry;
  public readonly rpg: RpgDataRegistry;
  public readonly endgame: EndgameDataRegistry;
  public readonly assets: AssetManifestRegistry;

  constructor(
    combat: GameDataRegistry = createDefaultDataRegistry(),
    rpg: RpgDataRegistry = createDefaultRpgDataRegistry(),
    endgame: EndgameDataRegistry = createDefaultEndgameRegistry(),
    assets: AssetManifestRegistry = createAssetManifestRegistry()
  ) {
    this.combat = combat;
    this.rpg = rpg;
    this.endgame = endgame;
    this.assets = assets;
  }

  public getUnit(id: string): UnitDefinition | undefined {
    return this.combat.unitsMap.get(id);
  }

  public getMove(id: string): MoveDefinition | undefined {
    return this.combat.movesMap.get(id);
  }

  public getForm(id: string): FormDefinition | undefined {
    return this.combat.formsMap.get(id);
  }

  public getTrait(id: string): TraitDefinition | undefined {
    return this.combat.traitsMap.get(id);
  }

  public getEquipment(id: string): EquipmentDefinition | undefined {
    return this.combat.equipmentMap.get(id);
  }

  public getElement(id: ElementId): ElementMetadata | undefined {
    return this.combat.elementsById.get(id);
  }

  public getAiProfile(level: number): AiProfileDefinition | undefined {
    return this.combat.aiProfilesMap.get(level);
  }

  public getSeaZone(id: SeaZoneId): SeaZoneDefinition | undefined {
    return this.rpg.seaZonesMap.get(id);
  }

  public getShip(id: string): ShipDefinition | undefined {
    return this.rpg.shipsMap.get(id);
  }

  public getCrewRole(roleId: CrewRoleId): CrewRoleDefinition | undefined {
    return this.rpg.crewRolesMap.get(roleId);
  }

  public getRecruitmentByUnitId(unitId: string): RecruitmentRule | undefined {
    return this.rpg.recruitmentByUnitIdMap.get(unitId);
  }

  public getTrainingRule(id: string): TrainingUpgradeRule | undefined {
    return this.rpg.trainingRulesMap.get(id);
  }

  public getIsland(islandId: string): IslandMapDefinition | undefined {
    return this.rpg.islandsMap.get(islandId);
  }

  public getEpisode(episodeId: string): EpisodeDefinition | undefined {
    return this.rpg.episodesMap.get(episodeId);
  }

  public getTutorMove(moveId: string): TutorMoveDefinition | undefined {
    return this.endgame.tutorMovesMap.get(moveId);
  }

  public getRaid(raidId: string): RaidBossDefinition | undefined {
    return this.endgame.raidsMap.get(raidId);
  }

  public getRaidRelic(relicId: string): RaidRelicDefinition | undefined {
    return this.endgame.raidRelicsMap.get(relicId);
  }

  public getSpriteEntry(key: string): SpriteSheetManifestEntry | undefined {
    return this.assets.spritesMap.get(key);
  }

  public getBiome(biomeId: string): TilesetManifestEntry | undefined {
    return this.assets.biomesMap.get(biomeId);
  }

  public getBgm(trackId: string): BgmTrackManifestEntry | undefined {
    return this.assets.bgmMap.get(trackId);
  }

  public getSfx(sfxId: string): SfxManifestEntry | undefined {
    return this.assets.sfxMap.get(sfxId);
  }
}

export function createUnifiedDataRegistry(): DataRegistry {
  return new DataRegistry();
}

export const unifiedDataRegistry: DataRegistry = createUnifiedDataRegistry();
