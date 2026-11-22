import { createDefaultEndgameState } from '../endgame/types';
import type { GameDataRegistry, HakiLevels } from '../types/dataSchemas';
import type {
  RpgCampaignState,
  RpgDataRegistry,
  SeaDynamicObject,
  SeaZoneId
} from '../types/rpgSchemas';

function createInitialSeaObjectsForZone(zoneId: SeaZoneId): SeaDynamicObject[] {
  if (zoneId === 'east_blue') {
    return [
      {
        id: 'eb_chest_1',
        kind: 'TREASURE_CHEST',
        name: '표류 해적 보물상자',
        pos: { x: 380, y: 310 },
        vel: { x: 0, y: 0 },
        radiusPx: 20,
        aiLevel: 1,
        enemyUnitIds: [],
        berryValue: 8000,
        trainingPointValue: 10,
        collectedOrDefeated: false
      },
      {
        id: 'eb_chest_hidden',
        kind: 'TREASURE_CHEST',
        name: '항해사 발견 심해 보물상자',
        pos: { x: 760, y: 260 },
        vel: { x: 0, y: 0 },
        radiusPx: 20,
        aiLevel: 1,
        enemyUnitIds: [],
        berryValue: 15000,
        trainingPointValue: 18,
        hiddenByDefault: true,
        collectedOrDefeated: false
      },
      {
        id: 'eb_merchant_1',
        kind: 'MERCHANT_SHIP',
        name: '이스트 블루 해상 보급선',
        pos: { x: 820, y: 510 },
        vel: { x: -12, y: 0 },
        radiusPx: 26,
        aiLevel: 1,
        enemyUnitIds: [],
        berryValue: 5000,
        trainingPointValue: 8,
        collectedOrDefeated: false
      },
      {
        id: 'eb_marine_1',
        kind: 'MARINE_PATROL',
        name: '해군 이스트 블루 초계함',
        pos: { x: 1150, y: 420 },
        vel: { x: -18, y: 8 },
        radiusPx: 28,
        aiLevel: 1,
        enemyUnitIds: ['lucci'],
        berryValue: 12000,
        trainingPointValue: 15,
        collectedOrDefeated: false
      }
    ];
  }

  if (zoneId === 'grand_line') {
    return [
      {
        id: 'gl_chest_1',
        kind: 'TREASURE_CHEST',
        name: '위대한 항로 황금 상자',
        pos: { x: 460, y: 640 },
        vel: { x: 0, y: 0 },
        radiusPx: 22,
        aiLevel: 2,
        enemyUnitIds: [],
        berryValue: 22000,
        trainingPointValue: 24,
        collectedOrDefeated: false
      },
      {
        id: 'gl_seaking_1',
        kind: 'SEA_KING',
        name: '캄 벨트 대형 해왕류',
        pos: { x: 860, y: 380 },
        vel: { x: 10, y: 14 },
        radiusPx: 34,
        aiLevel: 3,
        enemyUnitIds: ['kaido'],
        berryValue: 35000,
        trainingPointValue: 35,
        collectedOrDefeated: false
      },
      {
        id: 'gl_marine_1',
        kind: 'MARINE_PATROL',
        name: '해군본부 위대한 항로 순찰선',
        pos: { x: 1340, y: 500 },
        vel: { x: -22, y: -10 },
        radiusPx: 30,
        aiLevel: 3,
        enemyUnitIds: ['lucci', 'kizaru'],
        berryValue: 30000,
        trainingPointValue: 30,
        collectedOrDefeated: false
      }
    ];
  }

  return [
    {
      id: 'nw_chest_1',
      kind: 'TREASURE_CHEST',
      name: '신세계 고대 유물 상자',
      pos: { x: 520, y: 740 },
      vel: { x: 0, y: 0 },
      radiusPx: 22,
      aiLevel: 4,
      enemyUnitIds: [],
      berryValue: 50000,
      trainingPointValue: 45,
      collectedOrDefeated: false
    },
    {
      id: 'nw_marine_1',
      kind: 'MARINE_PATROL',
      name: '신세계 해군 대장·세라핌 함대',
      pos: { x: 1020, y: 540 },
      vel: { x: -24, y: 12 },
      radiusPx: 32,
      aiLevel: 5,
      enemyUnitIds: ['kizaru', 'lucci'],
      berryValue: 65000,
      trainingPointValue: 60,
      collectedOrDefeated: false
    },
    {
      id: 'nw_seaking_1',
      kind: 'SEA_KING',
      name: '신세계 심해 초거대 해왕류',
      pos: { x: 1520, y: 620 },
      vel: { x: -14, y: -16 },
      radiusPx: 36,
      aiLevel: 5,
      enemyUnitIds: ['kaido'],
      berryValue: 75000,
      trainingPointValue: 70,
      collectedOrDefeated: false
    }
  ];
}

export function createInitialCampaignState(
  rpgRegistry: RpgDataRegistry,
  gameRegistry: GameDataRegistry
): RpgCampaignState {
  const eastBlue = rpgRegistry.seaZones.east_blue;
  const grandLine = rpgRegistry.seaZones.grand_line;
  const newWorld = rpgRegistry.seaZones.new_world;
  const merry = rpgRegistry.ships['going_merry'];

  const unitHakiOverrides: Record<string, HakiLevels> = {};
  const unitUnlockedForms: Record<string, string[]> = {};
  const unitLevelOverrides: Record<string, number> = {};

  for (const u of Object.values(gameRegistry.units)) {
    unitHakiOverrides[u.id] = u.haki
      ? { ...u.haki }
      : { armament: 1, observation: 1, conqueror: 0 };
    const forms: string[] = [];
    if (u.forms) forms.push(...u.forms);
    if (u.defaultFormId) forms.push(u.defaultFormId);
    unitUnlockedForms[u.id] = forms;
    unitLevelOverrides[u.id] = 50;
  }

  return {
    currentZoneId: 'east_blue',
    activeIslandId: null,

    ship: {
      shipId: 'going_merry',
      pos: { x: eastBlue.spawnPoint.x, y: eastBlue.spawnPoint.y },
      vel: { x: 0, y: 0 },
      headingRad: 0,
      hullHp: merry?.maxHullHp ?? 1000,
      maxHullHp: merry?.maxHullHp ?? 1000,
      coupDeBurstCooldownTimer: 0,
      coupDeBurstActiveTimer: 0
    },

    savedZoneShipPositions: {
      east_blue: { pos: { ...eastBlue.spawnPoint }, headingRad: 0 },
      grand_line: { pos: { ...grandLine.spawnPoint }, headingRad: 0 },
      new_world: { pos: { ...newWorld.spawnPoint }, headingRad: 0 }
    },

    lastDockedPort: {
      zoneId: 'east_blue',
      islandId: 'foosha_shells',
      returnSeaPos: { x: eastBlue.spawnPoint.x, y: eastBlue.spawnPoint.y }
    },

    timeOfDay: 'MORNING',
    timeOfDayTimerSec: 0,
    seaWeather: 'CLEAR',
    weatherTimerSec: 0,

    berries: 15000,
    trainingPoints: 20,
    totalCrewBounty: 0,
    unitBounties: {
      luffy: 0
    },
    roadPoneglyphCount: 0,

    recruitedUnitIds: ['luffy'],
    activePartyUnitIds: ['luffy'],
    unlockedCrewRoles: ['CAPTAIN', 'NAVIGATOR'],
    assignedCrewRoles: {
      CAPTAIN: 'luffy',
      NAVIGATOR: '나미'
    },

    unitHakiOverrides,
    unitUnlockedForms,
    unitLevelOverrides,
    unitEquippedMovesOverrides: {},

    completedEpisodes: [],
    episodeFlags: {},
    unlockedShips: ['going_merry'],

    seaObjectsByZone: {
      east_blue: createInitialSeaObjectsForZone('east_blue'),
      grand_line: createInitialSeaObjectsForZone('grand_line'),
      new_world: createInitialSeaObjectsForZone('new_world')
    },

    onlineStats: {
      wins: 0,
      losses: 0,
      draws: 0
    },
    endgame: createDefaultEndgameState(),
    debugUnlockEndgame: false,

    legacyZoneUnlockV1: false,
    nextBattleMealAtkBuffRatio: 0,
    shipboardCookingCooldownSec: 0,
    partyHpRatios: {
      luffy: 1.0
    },

    latestWantedPoster: null,
    voyageLog: [
      '[항해 개시] 이스트 블루(East Blue)에서 고잉 메리호로 출항했습니다!',
      '[안내] 바다를 자유롭게 항해하거나 후샤 마을 & 쉘즈타운에 입항해 에피소드를 진행하세요.'
    ]
  };
}
