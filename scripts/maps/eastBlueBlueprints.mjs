import { GridCanvas, tileCenter } from './mapCanvasBuilder.mjs';

function buildOrangeTown(orig) {
  const cols = 44;
  const rows = 30;
  const g = new GridCanvas(cols, rows, 'G', 'g');
  g.borderSolid('c');

  // Southern coastline & wooden harbor pier
  g.paintGround(1, 25, cols - 2, 3, 's', 's');
  g.paintWaterRect(0, 28, cols, 2, true);
  g.paintRoad(18, 25, 6, 4, 'd', 'd');
  g.paintRoad(1, 27, 6, 1, '~', 'w');

  // Main cobblestone plaza & town roads
  g.paintRoad(19, 13, 6, 12, 'p', 'p');
  g.paintRoad(8, 12, 28, 3, 'p', 'p');
  g.paintRoad(8, 8, 8, 5, 'p', 'p');
  g.paintRoad(28, 8, 11, 7, 'p', 'p');

  // Pet Shop (NW) + walk-behind roof alley (rows 5..6)
  g.stampBuilding(7, 7, 5, 2, {
    label: '슈슈의 애완동물 가게',
    roofRows: 2,
    walkBehind: true
  });
  g.paintRoad(6, 5, 7, 2, 'g', 'g');

  // Ruined brick houses (Center-North & SE) with hidden back-alleys behind roofs
  g.stampBuilding(14, 9, 5, 2, {
    label: '버기 탄 반파 민가',
    roofRows: 2,
    walkBehind: true
  });
  g.paintRoad(13, 7, 7, 2, 'p', 'p');

  g.stampBuilding(29, 22, 6, 2, {
    label: '항구 자재 창고',
    roofRows: 2,
    walkBehind: true
  });
  g.paintRoad(29, 20, 6, 2, 's', 's');
  g.paintRoad(31, 25, 5, 1, 's', 's');

  // NW cannon rubble alcove for hidden chest 3
  g.stampRockOrWall(2, 2, 4, 2, 'c');
  g.stampRockOrWall(6, 2, 2, 3, 'c');
  g.paintRoad(2, 4, 4, 4, 's', 's');
  g.stampTreeCanopy(3, 7);
  g.stampTreeCanopy(39, 18);
  g.stampTreeCanopy(40, 23);
  g.stampTreeCanopy(4, 18);
  g.stampTreeCanopy(5, 22);
  g.stampProps([[13, 18], [14, 18], [27, 19], [28, 19], [36, 14]], 'k', true);

  g.scatterDecor(2, 2, cols - 4, 24, ['f', 'F', 't', 'T'], 6, 101);

  const origNpc = orig.npcs[0];
  const origEnc = orig.encounters[0];

  const npcs = [
    {
      ...origNpc,
      pos: tileCenter(11, 11),
      facing: 'right',
      ambientBubbleText: '버기의 동강동강 열매는 참격 면역이야!',
      patrolWaypoints: [tileCenter(11, 11), tileCenter(16, 11)],
      patrolSpeedPx: 40,
      pauseTicks: 80
    },
    {
      npcId: 'npc_chouchou',
      name: '슈슈',
      roleLabel: '애완동물 가게의 충견',
      pos: tileCenter(9, 10),
      interactRadiusPx: 44,
      visualScale: 0.85,
      color: '#f8fafc',
      facing: 'down',
      ambientBubbleText: '멍! 주인의 가게는 내가 지킨다!',
      patrolWaypoints: [tileCenter(8, 10), tileCenter(12, 10)],
      patrolSpeedPx: 36,
      pauseTicks: 70,
      dialogueLines: [
        '슈슈가 가게 앞을 지키며 늠름하게 짖는다. 루피가 챙겨준 사료 냄새에 꼬리를 흔든다!'
      ]
    },
    {
      npcId: 'npc_boodle',
      name: '부들 촌장',
      roleLabel: '오렌지 마을 촌장',
      pos: tileCenter(20, 16),
      interactRadiusPx: 46,
      visualScale: 1.0,
      color: '#eab308',
      facing: 'left',
      ambientBubbleText: '우리 마을을 포격하다니 용서 못 해!',
      patrolWaypoints: [
        tileCenter(20, 16),
        tileCenter(24, 16),
        tileCenter(24, 20),
        tileCenter(20, 20)
      ],
      patrolSpeedPx: 38,
      pauseTicks: 85,
      dialogueLines: [
        '부들 촌장: 갑작스러운 버기 해적단의 침공으로 마을 절반이 반파되고 말았네!',
        '반파된 건물 지붕 뒤편이나 항구 창고 쪽에도 아직 보급품이 남아 있을 거야.'
      ]
    },
    {
      npcId: 'npc_orange_merchant',
      name: '피난 상인',
      roleLabel: '오렌지 상점가 주민',
      pos: tileCenter(28, 17),
      interactRadiusPx: 44,
      visualScale: 0.96,
      color: '#fb923c',
      facing: 'down',
      ambientBubbleText: '서커스 천막 아래가 광대 본거지야!',
      patrolWaypoints: [tileCenter(27, 17), tileCenter(33, 17)],
      patrolSpeedPx: 42,
      pauseTicks: 75,
      dialogueLines: [
        '상인: 동북쪽 서커스 천막 광장에서 버기가 부하들과 잔치를 벌이고 있더군.'
      ]
    },
    {
      npcId: 'npc_orange_sailor',
      name: '항구 선원',
      roleLabel: '오렌지 항구 부두지기',
      pos: tileCenter(25, 25),
      interactRadiusPx: 44,
      visualScale: 0.98,
      color: '#38bdf8',
      facing: 'up',
      ambientBubbleText: '버기 탄 연기 냄새가 자욱하네!',
      patrolWaypoints: [tileCenter(25, 25), tileCenter(30, 25)],
      patrolSpeedPx: 38,
      pauseTicks: 75,
      dialogueLines: [
        '선원: 동쪽 창고 뒤 모래사장 쪽으로 굴러간 상자를 본 것 같은데...'
      ]
    }
  ];

  return {
    islandId: orig.islandId,
    name: orig.name,
    episodeId: orig.episodeId,
    width: cols * 32,
    height: rows * 32,
    theme: 'HARBOR_TOWN',
    spawnPoint: tileCenter(21, 25),
    portExitZone: { pos: tileCenter(20, 27), radiusPx: 44 },
    battleTerminalPos: tileCenter(17, 24),
    obstacles: g.obstacles,
    laserBarriers: [],
    puzzleSwitches: [],
    giantProps: [],
    zones: [
      {
        zoneId: 'zone_orange_harbor',
        name: '오렌지 항구 부두',
        subtitle: '이스트 블루 작은 항구',
        tileX: 14,
        tileY: 23,
        tileW: 16,
        tileH: 6,
        accentColor: '#38bdf8'
      },
      {
        zoneId: 'zone_orange_ruins',
        name: '버기 탄 포격 거리',
        subtitle: '반파된 벽돌 민가 골목',
        tileX: 13,
        tileY: 11,
        tileW: 16,
        tileH: 12,
        accentColor: '#fb923c'
      },
      {
        zoneId: 'zone_orange_petshop',
        name: '슈슈의 애완동물 가게',
        subtitle: '나미와의 조우 & 충견의 수호',
        tileX: 2,
        tileY: 3,
        tileW: 13,
        tileH: 10,
        accentColor: '#4ade80'
      },
      {
        zoneId: 'zone_orange_circus',
        name: '버기 서커스 대광장',
        subtitle: '광대 버기 결전지',
        tileX: 27,
        tileY: 3,
        tileW: 15,
        tileH: 13,
        accentColor: '#ef4444'
      }
    ],
    chests: [
      {
        chestId: 'chest_orange_ruined_roof',
        tileX: 16,
        tileY: 8,
        rarity: 'silver',
        hiddenHint: '반파된 건물 지붕 오버헤드 뒤편 골목',
        reward: { berries: 6000, trainingPoints: 14, itemLabel: '벽돌 민가 비상 금고' }
      },
      {
        chestId: 'chest_orange_dock_warehouse',
        tileX: 32,
        tileY: 21,
        rarity: 'wooden',
        hiddenHint: '항구 남동쪽 창고 지붕 오버헤드 뒤편',
        reward: { berries: 4500, trainingPoints: 10, itemLabel: '상인의 비상 식량' }
      },
      {
        chestId: 'chest_orange_nw_rubble',
        tileX: 3,
        tileY: 5,
        rarity: 'gold',
        hiddenHint: '북서쪽 포격 잔해 막다른 뒷골목',
        reward: {
          berries: 9500,
          trainingPoints: 18,
          healPartyRatio: 0.35,
          itemLabel: '슈슈가 지켜낸 보물 상자'
        }
      }
    ],
    markers: [
      {
        markerId: 'marker_orange_port',
        kind: 'PORT_EXIT',
        label: '⚓ 출항 부두',
        tileX: 20,
        tileY: 27,
        actionKind: 'PORT_EXIT'
      },
      {
        markerId: 'marker_orange_nami',
        kind: 'SIDE',
        label: '◆ 나미 (버기 약점 정보)',
        tileX: 11,
        tileY: 11,
        hideWhenFlagSet: 'flag_orange_nami_met',
        actionKind: 'STORY'
      },
      {
        markerId: 'marker_orange_buggy',
        kind: 'MAIN',
        label: '★ 광대 버기 결전',
        tileX: 35,
        tileY: 11,
        hideWhenFlagSet: 'flag_orange_town_cleared',
        actionKind: 'STORY'
      },
      {
        markerId: 'marker_orange_bounty',
        kind: 'ACTIVITY',
        label: '📋 마을 수배 게시판',
        tileX: 22,
        tileY: 15,
        actionKind: 'BOUNTY_BOARD'
      },
      {
        markerId: 'marker_orange_terminal',
        kind: 'ACTIVITY',
        label: '🌐 대전 단말기',
        tileX: 17,
        tileY: 24,
        actionKind: 'BATTLE_TERMINAL'
      }
    ],
    landmarks: [
      {
        landmarkId: 'lm_orange_circus',
        kind: 'CIRCUS_TENT',
        tileX: 33,
        tileY: 6,
        widthTiles: 4,
        heightTiles: 3,
        label: '버기 서커스 천막',
        hasOverheadPart: true
      },
      {
        landmarkId: 'lm_orange_boat',
        kind: 'DOCKED_BOAT',
        tileX: 15,
        tileY: 26,
        widthTiles: 3,
        heightTiles: 2
      },
      {
        landmarkId: 'lm_orange_board',
        kind: 'BOUNTY_BOARD',
        tileX: 22,
        tileY: 14,
        widthTiles: 1,
        heightTiles: 1
      }
    ],
    npcs,
    encounters: [{ ...origEnc, pos: tileCenter(35, 11) }],
    ambientProfile: { particles: ['SMOKE', 'LEAF'], density: 28 },
    lightingProfile: {
      defaultMood: 'DAY',
      tintHex: '#f59e0b',
      tintAlpha: 0.06,
      sunbeams: true,
      lanterns: [
        { tileX: 21, tileY: 18, color: '#fbbf24', radiusPx: 44 },
        { tileX: 34, tileY: 9, color: '#ef4444', radiusPx: 48 }
      ]
    },
    tileMap: g.toTileMap()
  };
}

function buildBaratie(orig) {
  const cols = 46;
  const rows = 32;
  const g = new GridCanvas(cols, rows, 'W', 'w');
  g.paintWaterRect(0, 0, cols, rows, false);

  // Southern mooring dock
  g.paintRoad(20, 24, 6, 5, 'd', 'd');
  // Central ship dining hull deck
  g.paintRoad(13, 10, 20, 14, 'd', 'd');
  // Northern giant fish prow lookout
  g.paintRoad(19, 4, 8, 6, 'd', 'd');
  // West & East combat fin decks
  g.paintRoad(4, 14, 9, 8, 'd', 'd');
  g.paintRoad(33, 14, 9, 8, 'd', 'd');

  // Central Restaurant Hall + West Pantry + East Wine Cellar with walkable rear supply deck
  g.stampBuilding(19, 13, 8, 2, {
    label: '발라티에 메인 다이닝 홀',
    roofRows: 2,
    walkBehind: true
  });
  g.stampBuilding(14, 13, 3, 2, {
    label: '식자재 창고',
    roofRows: 2,
    walkBehind: true
  });
  g.stampBuilding(29, 13, 3, 2, {
    label: '와인 저장고',
    roofRows: 2,
    walkBehind: true
  });
  // Auxiliary kitchen supply boxes
  g.stampProps([[13, 11], [32, 11], [14, 21], [31, 21]], 'k', true);
  g.paintCoastalFoamAuto();

  const origNpc = orig.npcs[0];
  const origEnc = orig.encounters[0];

  const npcs = [
    {
      ...origNpc,
      pos: tileCenter(15, 16),
      facing: 'right',
      ambientBubbleText: '음식을 버리는 놈은 용서 못 해!',
      patrolWaypoints: [tileCenter(15, 16), tileCenter(17, 16), tileCenter(17, 19), tileCenter(15, 19)],
      patrolSpeedPx: 42,
      pauseTicks: 75
    },
    {
      npcId: 'npc_zeff',
      name: '오너 제프',
      roleLabel: '발라티에 주방장 (붉은 다리)',
      pos: tileCenter(21, 17),
      interactRadiusPx: 48,
      visualScale: 1.08,
      color: '#facc15',
      facing: 'down',
      ambientBubbleText: '꼬맹이, 주방 뒤쪽은 훔쳐보지 마라!',
      patrolWaypoints: [tileCenter(20, 17), tileCenter(26, 17)],
      patrolSpeedPx: 38,
      pauseTicks: 90,
      dialogueLines: [
        '제프: 여기는 바다 한가운데 떠 있는 해상 레스토랑 발라티에다!',
        '배고픈 녀석에겐 누구든 밥을 내주지만, 해적 행패는 전투 지느러미 갑판에서 끝낸다!'
      ]
    },
    {
      npcId: 'npc_patty',
      name: '요리사 파티',
      roleLabel: '발라티에 디저트 셰프',
      pos: tileCenter(20, 21),
      interactRadiusPx: 44,
      visualScale: 1.0,
      color: '#f97316',
      facing: 'up',
      ambientBubbleText: '어서 오십쇼! 특제 수프 대령입니다!',
      patrolWaypoints: [tileCenter(19, 21), tileCenter(26, 21)],
      patrolSpeedPx: 44,
      pauseTicks: 70,
      dialogueLines: [
        '파티: 양쪽 지느러미 갑판을 펼치면 여긴 그대로 해상 요새로 변합니다!'
      ]
    },
    {
      npcId: 'npc_carne',
      name: '요리사 카르네',
      roleLabel: '발라티에 육류 셰프',
      pos: tileCenter(28, 16),
      interactRadiusPx: 44,
      visualScale: 0.98,
      color: '#ef4444',
      facing: 'left',
      ambientBubbleText: '동쪽 지느러미에 클리크 녀석이 나타났다!',
      patrolWaypoints: [tileCenter(28, 16), tileCenter(31, 16), tileCenter(31, 19), tileCenter(28, 19)],
      patrolSpeedPx: 40,
      pauseTicks: 75,
      dialogueLines: [
        '카르네: 돈 클리크 함대의 MH5 독가스를 조심해! 주방 뒤 식자재 갑판에 비상약이 있을 거야.'
      ]
    },
    {
      npcId: 'npc_baratie_guest',
      name: '귀족 미식가',
      roleLabel: '발라티에 단골 손님',
      pos: tileCenter(21, 9),
      interactRadiusPx: 44,
      visualScale: 0.95,
      color: '#a855f7',
      facing: 'up',
      ambientBubbleText: '물고기 뱃머리 전망이 예술이군!',
      patrolWaypoints: [tileCenter(20, 9), tileCenter(25, 9)],
      patrolSpeedPx: 36,
      pauseTicks: 85,
      dialogueLines: [
        '손님: 거대한 물고기 뱃머리 끝 전망대까지 올라가면 바다 바람이 최고입니다!'
      ]
    },
    {
      npcId: 'npc_baratie_marine',
      name: '해군 소위 풀보디',
      roleLabel: '정찰 해군',
      pos: tileCenter(7, 17),
      interactRadiusPx: 44,
      visualScale: 0.98,
      color: '#38bdf8',
      facing: 'right',
      ambientBubbleText: '서쪽 전투 지느러미 갑판 안전 확보!',
      patrolWaypoints: [tileCenter(6, 16), tileCenter(11, 16)],
      patrolSpeedPx: 42,
      pauseTicks: 75,
      dialogueLines: [
        '해군: 클리크 해적단의 기함 드레드노트 사브르가 근처까지 들이닥쳤단 말인가!'
      ]
    }
  ];

  return {
    islandId: orig.islandId,
    name: orig.name,
    episodeId: orig.episodeId,
    width: cols * 32,
    height: rows * 32,
    theme: 'CANAL_DOCKYARD',
    spawnPoint: tileCenter(23, 25),
    portExitZone: { pos: tileCenter(23, 28), radiusPx: 44 },
    battleTerminalPos: tileCenter(20, 25),
    obstacles: g.obstacles,
    laserBarriers: [],
    puzzleSwitches: [],
    giantProps: [],
    zones: [
      {
        zoneId: 'zone_baratie_dock',
        name: '발라티에 정박 부두',
        subtitle: '고잉 메리호 계류 선착장',
        tileX: 18,
        tileY: 23,
        tileW: 10,
        tileH: 7,
        accentColor: '#38bdf8'
      },
      {
        zoneId: 'zone_baratie_dining',
        name: '중앙 목조 다이닝 갑판',
        subtitle: '바다 위 일류 해상 레스토랑',
        tileX: 13,
        tileY: 11,
        tileW: 20,
        tileH: 12,
        accentColor: '#facc15'
      },
      {
        zoneId: 'zone_baratie_prow',
        name: '거대 물고기 뱃머리 전망대',
        subtitle: '발라티에 상징 선수상',
        tileX: 18,
        tileY: 3,
        tileW: 10,
        tileH: 8,
        accentColor: '#4ade80'
      },
      {
        zoneId: 'zone_baratie_fins',
        name: '전투용 지느러미 갑판',
        subtitle: '돈 클리크 함대 격전지',
        tileX: 32,
        tileY: 13,
        tileW: 11,
        tileH: 10,
        accentColor: '#ef4444'
      }
    ],
    chests: [
      {
        chestId: 'chest_baratie_kitchen_deck',
        tileX: 23,
        tileY: 11,
        rarity: 'silver',
        hiddenHint: '다이닝 홀 지붕 오버헤드 뒤 식자재 갑판',
        reward: { berries: 7000, trainingPoints: 14, itemLabel: '상디의 최고급 식자재 상자' }
      },
      {
        chestId: 'chest_baratie_fish_prow',
        tileX: 23,
        tileY: 4,
        rarity: 'gold',
        hiddenHint: '거대 물고기 뱃머리 전망대 끝',
        reward: {
          berries: 10000,
          trainingPoints: 20,
          healPartyRatio: 0.4,
          itemLabel: '붉은 다리 제프의 비장 도시락'
        }
      },
      {
        chestId: 'chest_baratie_east_fin',
        tileX: 40,
        tileY: 20,
        rarity: 'wooden',
        hiddenHint: '동쪽 전투용 지느러미 갑판 구석',
        reward: { berries: 5500, trainingPoints: 12, itemLabel: '해적선 노획 보급품' }
      }
    ],
    markers: [
      {
        markerId: 'marker_baratie_port',
        kind: 'PORT_EXIT',
        label: '⚓ 출항 부두',
        tileX: 23,
        tileY: 28,
        actionKind: 'PORT_EXIT'
      },
      {
        markerId: 'marker_baratie_sanji',
        kind: 'SIDE',
        label: '◆ 상디 & 우솝 합류 준비',
        tileX: 15,
        tileY: 16,
        hideWhenFlagSet: 'flag_baratie_sanji_met',
        actionKind: 'STORY'
      },
      {
        markerId: 'marker_baratie_krieg',
        kind: 'MAIN',
        label: '★ 돈 클리크 함대 결전',
        tileX: 37,
        tileY: 17,
        hideWhenFlagSet: 'flag_baratie_cleared',
        actionKind: 'STORY'
      },
      {
        markerId: 'marker_baratie_bounty',
        kind: 'ACTIVITY',
        label: '📋 수배 & 요리 정비',
        tileX: 8,
        tileY: 18,
        actionKind: 'BOUNTY_BOARD'
      },
      {
        markerId: 'marker_baratie_terminal',
        kind: 'ACTIVITY',
        label: '🌐 대전 단말기',
        tileX: 20,
        tileY: 25,
        actionKind: 'BATTLE_TERMINAL'
      }
    ],
    landmarks: [
      {
        landmarkId: 'lm_baratie_prow',
        kind: 'FISH_PROW',
        tileX: 21,
        tileY: 5,
        widthTiles: 4,
        heightTiles: 3,
        label: '물고기 뱃머리'
      },
      {
        landmarkId: 'lm_baratie_boat',
        kind: 'DOCKED_BOAT',
        tileX: 17,
        tileY: 26,
        widthTiles: 3,
        heightTiles: 2
      },
      {
        landmarkId: 'lm_baratie_board',
        kind: 'BOUNTY_BOARD',
        tileX: 8,
        tileY: 17,
        widthTiles: 1,
        heightTiles: 1
      }
    ],
    npcs,
    encounters: [{ ...origEnc, pos: tileCenter(37, 17) }],
    ambientProfile: { particles: ['SPRAY', 'GULL'], density: 32 },
    lightingProfile: {
      defaultMood: 'DAY',
      tintHex: '#fbbf24',
      tintAlpha: 0.04,
      sunbeams: true,
      lanterns: [
        { tileX: 19, tileY: 16, color: '#fde047', radiusPx: 44 },
        { tileX: 27, tileY: 16, color: '#fde047', radiusPx: 44 }
      ]
    },
    tileMap: g.toTileMap()
  };
}

function buildArlongPark(orig) {
  const cols = 46;
  const rows = 34;
  const g = new GridCanvas(cols, rows, 'G', 'g');
  g.borderSolid('c');

  // Southern shore & Cocoyashi arrival pier
  g.paintGround(1, 28, cols - 2, 4, 's', 's');
  g.paintWaterRect(0, 32, cols, 2, true);
  g.paintRoad(20, 27, 6, 5, 'd', 'd');

  // Main paths: dock -> tangerine grove -> Shark Gate -> Pool Plaza -> Main Hall
  g.paintRoad(12, 22, 20, 5, 'p', 'p');
  g.paintRoad(21, 15, 4, 12, 'p', 'p');

  // Arlong Park Perimeter Stone Walls (row 16 with central Shark Gate gap cols 21..24)
  g.stampRockOrWall(7, 16, 14, 1, 'C');
  g.stampRockOrWall(25, 16, 15, 1, 'C');
  g.stampRockOrWall(7, 2, 1, 14, 'C');
  g.stampRockOrWall(39, 2, 1, 14, 'C');

  // Courtyard stone floor & iconic central rectangular swimming pool
  g.paintRoad(8, 5, 31, 11, 'p', 'p');
  g.paintWaterRect(17, 9, 12, 4, true);
  g.paintShallowStepping(16, 9, 1, 4, 'q');
  g.paintShallowStepping(29, 9, 1, 4, 'q');

  // Main Arlong Park jagged hall & Nami Chart Tower
  g.stampBuilding(19, 4, 8, 2, {
    label: '아론 파크 본관',
    roofRows: 2,
    walkBehind: true
  });
  g.stampBuilding(33, 12, 4, 2, {
    label: '측량실 탑',
    roofRows: 2,
    walkBehind: true
  });

  // SW Tangerine grove with overhead canopy trees + secret trail behind canopies to (4, 18)
  g.paintGround(2, 17, 13, 11, 'g', 'g');
  g.paintRoad(3, 18, 9, 2, 'g', 'g');
  g.stampTreeCanopy(4, 21);
  g.stampTreeCanopy(7, 21);
  g.stampTreeCanopy(10, 21);
  g.stampTreeCanopy(5, 24);
  g.stampTreeCanopy(8, 24);
  g.stampTreeCanopy(9, 8);
  g.stampTreeCanopy(9, 12);
  g.stampTreeCanopy(35, 22);
  g.stampTreeCanopy(38, 25);
  g.stampProps([[30, 7], [32, 7], [15, 8], [15, 13]], 'k', true);

  g.scatterDecor(2, 2, cols - 4, 26, ['f', 'F', 't', 'T'], 6, 202);

  const origNpc = orig.npcs[0];
  const origEnc = orig.encounters[0];

  const npcs = [
    {
      ...origNpc,
      pos: tileCenter(14, 22),
      facing: 'right',
      ambientBubbleText: '루피... 도와줘...',
      patrolWaypoints: [tileCenter(13, 22), tileCenter(17, 22)],
      patrolSpeedPx: 38,
      pauseTicks: 85
    },
    {
      npcId: 'npc_nojiko',
      name: '노지코',
      roleLabel: '코코야시 마을 언니',
      pos: tileCenter(8, 20),
      interactRadiusPx: 46,
      visualScale: 0.98,
      color: '#38bdf8',
      facing: 'down',
      ambientBubbleText: '벨메일 씨의 귤나무 숲길에 비밀 길이 있어.',
      patrolWaypoints: [tileCenter(6, 20), tileCenter(11, 20)],
      patrolSpeedPx: 40,
      pauseTicks: 75,
      dialogueLines: [
        '노지코: 나미를 구해줘! 벨메일 씨의 귤밭 뒤편 오솔길에 숨겨둔 보물도 챙겨가렴!'
      ]
    },
    {
      npcId: 'npc_genzo',
      name: '겐조 보안관',
      roleLabel: '코코야시 마을 보안관',
      pos: tileCenter(23, 20),
      interactRadiusPx: 46,
      visualScale: 1.0,
      color: '#facc15',
      facing: 'up',
      ambientBubbleText: '저 톱상어 성문 너머가 아론 파크다!',
      patrolWaypoints: [tileCenter(19, 20), tileCenter(27, 20)],
      patrolSpeedPx: 42,
      pauseTicks: 80,
      dialogueLines: [
        '겐조: 아론 파크 안쪽 수영장 물가에 빠지면 어인족이 강해지니 디딤돌과 육지에서 싸우게!'
      ]
    },
    {
      npcId: 'npc_nako',
      name: '의사 나코',
      roleLabel: '코코야시 마을 의사',
      pos: tileCenter(29, 24),
      interactRadiusPx: 44,
      visualScale: 0.95,
      color: '#e2e8f0',
      facing: 'left',
      ambientBubbleText: '다친 곳이 있으면 바로 치료해 주지.',
      patrolWaypoints: [tileCenter(28, 24), tileCenter(33, 24)],
      patrolSpeedPx: 36,
      pauseTicks: 80,
      dialogueLines: [
        '나코: 마을 사람들의 8년간의 서러움을 오늘 끝내주게!'
      ]
    },
    {
      npcId: 'npc_cocoyashi_villager',
      name: '코코야시 청년',
      roleLabel: '풍차 바람개비 마을 주민',
      pos: tileCenter(12, 12),
      interactRadiusPx: 44,
      visualScale: 0.96,
      color: '#4ade80',
      facing: 'right',
      ambientBubbleText: '수영장 양옆 회랑으로 우회할 수 있어!',
      patrolWaypoints: [tileCenter(12, 10), tileCenter(12, 14)],
      patrolSpeedPx: 40,
      pauseTicks: 70,
      dialogueLines: [
        '청년: 아론 파크 수영장 양옆 징검다리를 따라 북쪽 본관까지 돌격하자!'
      ]
    }
  ];

  return {
    islandId: orig.islandId,
    name: orig.name,
    episodeId: orig.episodeId,
    width: cols * 32,
    height: rows * 32,
    theme: 'CANAL_DOCKYARD',
    spawnPoint: tileCenter(23, 28),
    portExitZone: { pos: tileCenter(23, 30), radiusPx: 44 },
    battleTerminalPos: tileCenter(19, 28),
    obstacles: g.obstacles,
    laserBarriers: [],
    puzzleSwitches: [],
    giantProps: [],
    zones: [
      {
        zoneId: 'zone_arlong_entrance',
        name: '코코야시 마을 입구 부두',
        subtitle: '나미를 구하기 위한 집결지',
        tileX: 16,
        tileY: 25,
        tileW: 16,
        tileH: 7,
        accentColor: '#38bdf8'
      },
      {
        zoneId: 'zone_arlong_tangerine',
        name: '벨메일의 귤나무 숲길',
        subtitle: '초록 수관 오버헤드 캐노피',
        tileX: 2,
        tileY: 17,
        tileW: 15,
        tileH: 10,
        accentColor: '#fb923c'
      },
      {
        zoneId: 'zone_arlong_gate',
        name: '톱상어 성문 광장',
        subtitle: '아론 파크 정문 돌파구',
        tileX: 17,
        tileY: 15,
        tileW: 13,
        tileH: 10,
        accentColor: '#facc15'
      },
      {
        zoneId: 'zone_arlong_pool',
        name: '아론 파크 수영장 & 본관',
        subtitle: '어인 해적단 수변 결전지',
        tileX: 8,
        tileY: 2,
        tileW: 31,
        tileH: 13,
        accentColor: '#0284c7'
      }
    ],
    chests: [
      {
        chestId: 'chest_arlong_tangerine_secret',
        tileX: 4,
        tileY: 18,
        rarity: 'gold',
        hiddenHint: '귤나무 숲 캐노피 오버헤드 뒤 비밀 오솔길',
        reward: {
          berries: 11000,
          trainingPoints: 20,
          healPartyRatio: 0.4,
          itemLabel: '벨메일의 귤나무 유품 상자'
        }
      },
      {
        chestId: 'chest_arlong_west_palms',
        tileX: 10,
        tileY: 6,
        rarity: 'silver',
        hiddenHint: '성벽 서쪽 야자수 뒤편',
        reward: { berries: 7500, trainingPoints: 15, itemLabel: '어인 보물 창고 금화' }
      },
      {
        chestId: 'chest_arlong_pool_pillar',
        tileX: 31,
        tileY: 6,
        rarity: 'wooden',
        hiddenHint: '수영장 북동쪽 기둥 뒤편',
        reward: { berries: 6000, trainingPoints: 12, itemLabel: '탈환한 해도 궤짝' }
      }
    ],
    markers: [
      {
        markerId: 'marker_arlong_port',
        kind: 'PORT_EXIT',
        label: '⚓ 출항 부두',
        tileX: 23,
        tileY: 30,
        actionKind: 'PORT_EXIT'
      },
      {
        markerId: 'marker_arlong_nami',
        kind: 'SIDE',
        label: '◆ 나미와 결의',
        tileX: 14,
        tileY: 22,
        hideWhenFlagSet: 'flag_arlong_nami_helped',
        actionKind: 'STORY'
      },
      {
        markerId: 'marker_arlong_boss',
        kind: 'MAIN',
        label: '★ 톱상어 아론 결전',
        tileX: 23,
        tileY: 7,
        hideWhenFlagSet: 'flag_arlong_park_cleared',
        actionKind: 'STORY'
      },
      {
        markerId: 'marker_arlong_bounty',
        kind: 'ACTIVITY',
        label: '📋 수배 & 정비 캠프',
        tileX: 30,
        tileY: 24,
        actionKind: 'CAMP_TRAINING'
      },
      {
        markerId: 'marker_arlong_terminal',
        kind: 'ACTIVITY',
        label: '🌐 대전 단말기',
        tileX: 19,
        tileY: 28,
        actionKind: 'BATTLE_TERMINAL'
      }
    ],
    landmarks: [
      {
        landmarkId: 'lm_arlong_shark_gate',
        kind: 'SHARK_GATE',
        tileX: 21,
        tileY: 15,
        widthTiles: 4,
        heightTiles: 2,
        label: '톱상어 성문',
        hasOverheadPart: true
      },
      {
        landmarkId: 'lm_arlong_boat',
        kind: 'DOCKED_BOAT',
        tileX: 16,
        tileY: 29,
        widthTiles: 3,
        heightTiles: 2
      },
      {
        landmarkId: 'lm_arlong_board',
        kind: 'BOUNTY_BOARD',
        tileX: 30,
        tileY: 23,
        widthTiles: 1,
        heightTiles: 1
      }
    ],
    npcs,
    encounters: [{ ...origEnc, pos: tileCenter(23, 7) }],
    ambientProfile: { particles: ['LEAF', 'DROPLET'], density: 30 },
    lightingProfile: {
      defaultMood: 'DAY',
      tintHex: '#0284c7',
      tintAlpha: 0.05,
      sunbeams: true,
      lanterns: [
        { tileX: 20, tileY: 14, color: '#38bdf8', radiusPx: 44 },
        { tileX: 26, tileY: 14, color: '#38bdf8', radiusPx: 44 }
      ]
    },
    tileMap: g.toTileMap()
  };
}

function buildLoguetown(orig) {
  const cols = 48;
  const rows = 34;
  const g = new GridCanvas(cols, rows, 'p', 'p');
  g.borderSolid('c');

  // West & South stormy harbor ocean + wooden escape pier
  g.paintWaterRect(0, 18, 4, 16, true);
  g.paintWaterRect(0, 30, cols, 4, true);
  g.paintRoad(4, 24, 10, 5, 'd', 'd');
  g.paintRoad(5, 19, 5, 5, 'p', 'p');
  g.stampBuilding(5, 22, 3, 2, {
    label: '항구 세관 창고',
    roofRows: 2,
    walkBehind: true
  });

  // Central shopping bazaar & Weapons Shop with narrow walk-behind stone alley
  g.paintRoad(12, 13, 24, 14, 'p', 'p');
  g.stampBuilding(11, 17, 5, 2, {
    label: '잇폰마츠 무기점',
    roofRows: 2,
    walkBehind: true
  });
  g.paintRoad(10, 15, 7, 2, 'p', 'p');

  // Gold Roger Execution Platform Plaza (Center North) + north arch walk-behind chest
  g.paintRoad(17, 3, 14, 11, 'p', 'p');
  g.stampArchOverhead(21, 5, 6, 2, 'A', 'C');

  // East Navy Checkpoint & Smoker blockade
  g.stampBuilding(33, 13, 7, 2, {
    label: '해군 검문소 본부',
    roofRows: 2,
    walkBehind: true
  });
  g.paintRoad(31, 16, 13, 9, 'p', 'p');
  g.stampProps([[30, 17], [30, 18], [30, 22], [30, 23], [17, 22], [18, 22]], 'k', true);
  g.stampTreeCanopy(3, 8);
  g.stampTreeCanopy(42, 7);
  g.stampTreeCanopy(43, 25);

  g.scatterDecor(14, 4, 24, 22, ['f', 't', 'h'], 11, 303);

  const origNpc = orig.npcs[0];
  const origEnc = orig.encounters[0];

  const npcs = [
    {
      ...origNpc,
      pos: tileCenter(17, 21),
      facing: 'right',
      ambientBubbleText: '폭풍이 곧 이 마을을 덮친다...',
      patrolWaypoints: [tileCenter(17, 21), tileCenter(21, 21)],
      patrolSpeedPx: 38,
      pauseTicks: 90
    },
    {
      npcId: 'npc_ipponmatsu',
      name: '무기점 주인 잇폰마츠',
      roleLabel: '로그타운 명검 감정사',
      pos: tileCenter(13, 20),
      interactRadiusPx: 46,
      visualScale: 0.96,
      color: '#eab308',
      facing: 'down',
      ambientBubbleText: '요도 산다이 키테츠를 감당할 수 있나?',
      patrolWaypoints: [tileCenter(11, 20), tileCenter(15, 20)],
      patrolSpeedPx: 36,
      pauseTicks: 85,
      dialogueLines: [
        '잇폰마츠: 그 검이 선택한 사내라면 가게의 가보 유바시리까지 맡겨주마!',
        '무기점 뒤쪽 좁은 돌골목도 한번 들러보게나.'
      ]
    },
    {
      npcId: 'npc_tashigi',
      name: '해군 소위 타시기',
      roleLabel: '스모커 직속 부관',
      pos: tileCenter(26, 15),
      interactRadiusPx: 46,
      visualScale: 0.98,
      color: '#38bdf8',
      facing: 'left',
      ambientBubbleText: '명검을 해적 손에 넘길 순 없어요!',
      patrolWaypoints: [tileCenter(23, 15), tileCenter(29, 15)],
      patrolSpeedPx: 44,
      pauseTicks: 75,
      dialogueLines: [
        '타시기: 스모커 대령님이 검문소 앞을 봉쇄하셨습니다! 폭풍이 불어오기 전까진 한 발짝도 못 나갑니다!'
      ]
    },
    {
      npcId: 'npc_raoul',
      name: '바텐더 라울',
      roleLabel: '골드 로저의 단골 주점',
      pos: tileCenter(20, 12),
      interactRadiusPx: 44,
      visualScale: 0.96,
      color: '#94a3b8',
      facing: 'up',
      ambientBubbleText: '그 사나이도 저 처형대에서 웃었지.',
      patrolWaypoints: [tileCenter(19, 12), tileCenter(24, 12)],
      patrolSpeedPx: 34,
      pauseTicks: 90,
      dialogueLines: [
        '라울: 22년 전 골 D. 로저가 저 처형대에서 위대한 항로의 시대를 열었어.'
      ]
    },
    {
      npcId: 'npc_logue_marine',
      name: '해군 검문병',
      roleLabel: '로그타운 경비대',
      pos: tileCenter(33, 18),
      interactRadiusPx: 44,
      visualScale: 0.98,
      color: '#60a5fa',
      facing: 'left',
      ambientBubbleText: '항구 탈출로는 전면 봉쇄 중이다!',
      patrolWaypoints: [tileCenter(33, 17), tileCenter(33, 22)],
      patrolSpeedPx: 42,
      pauseTicks: 70,
      dialogueLines: [
        '해군: 검은 먹구름이 몰려오고 있어! 저 녹색 번개 바람은 도대체 뭐지?!'
      ]
    },
    {
      npcId: 'npc_logue_citizen',
      name: '광장 시민',
      roleLabel: '시작과 끝의 마을 주민',
      pos: tileCenter(27, 22),
      interactRadiusPx: 44,
      visualScale: 0.95,
      color: '#cbd5e1',
      facing: 'right',
      ambientBubbleText: '곧 큰 소나기가 쏟아질 거야!',
      patrolWaypoints: [tileCenter(24, 22), tileCenter(28, 22)],
      patrolSpeedPx: 38,
      pauseTicks: 80,
      dialogueLines: [
        '시민: 비가 쏟아지기 시작하면 서쪽 항구 창고 뒤로 피신하는 게 좋아.'
      ]
    }
  ];

  return {
    islandId: orig.islandId,
    name: orig.name,
    episodeId: orig.episodeId,
    width: cols * 32,
    height: rows * 32,
    theme: 'HARBOR_TOWN',
    spawnPoint: tileCenter(10, 26),
    portExitZone: { pos: tileCenter(7, 27), radiusPx: 44 },
    battleTerminalPos: tileCenter(13, 25),
    obstacles: g.obstacles,
    laserBarriers: [],
    puzzleSwitches: [],
    giantProps: [],
    zones: [
      {
        zoneId: 'zone_logue_harbor',
        name: '서쪽 탈출 항구 부두',
        subtitle: '위대한 항로 출항 관문',
        tileX: 4,
        tileY: 22,
        tileW: 11,
        tileH: 8,
        accentColor: '#38bdf8'
      },
      {
        zoneId: 'zone_logue_market',
        name: '무기점 & 상점가 거리',
        subtitle: '명검 유바시리와 뒷골목',
        tileX: 10,
        tileY: 14,
        tileW: 18,
        tileH: 11,
        accentColor: '#facc15'
      },
      {
        zoneId: 'zone_logue_plaza',
        name: '골 D. 로저 처형대 광장',
        subtitle: '해적왕의 전설이 시작된 곳',
        tileX: 17,
        tileY: 3,
        tileW: 14,
        tileH: 11,
        accentColor: '#e2e8f0'
      },
      {
        zoneId: 'zone_logue_checkpoint',
        name: '동북 해군 지부 검문소',
        subtitle: '하얀 사냥꾼 스모커 포위망',
        tileX: 30,
        tileY: 12,
        tileW: 15,
        tileH: 13,
        accentColor: '#ef4444'
      }
    ],
    chests: [
      {
        chestId: 'chest_loguetown_weapon_alley',
        tileX: 13,
        tileY: 15,
        rarity: 'gold',
        hiddenHint: '무기점 지붕 오버헤드 뒤 좁은 석조 골목',
        reward: {
          berries: 12000,
          trainingPoints: 22,
          healPartyRatio: 0.4,
          itemLabel: '잇폰마츠의 명검 손질 키트'
        }
      },
      {
        chestId: 'chest_loguetown_scaffold_arch',
        tileX: 24,
        tileY: 4,
        rarity: 'silver',
        hiddenHint: '처형대 북쪽 석조 아치 오버헤드 뒤편',
        reward: { berries: 8500, trainingPoints: 16, itemLabel: '해적왕 시대의 옛 주화' }
      },
      {
        chestId: 'chest_loguetown_port_shadow',
        tileX: 6,
        tileY: 20,
        rarity: 'wooden',
        hiddenHint: '항구 세관 창고 뒤 그림자 구역',
        reward: { berries: 6500, trainingPoints: 14, itemLabel: '위대한 항로 비상 보급품' }
      }
    ],
    markers: [
      {
        markerId: 'marker_logue_port',
        kind: 'PORT_EXIT',
        label: '⚓ 스모커 탈출 부두',
        tileX: 7,
        tileY: 27,
        actionKind: 'PORT_EXIT'
      },
      {
        markerId: 'marker_logue_dragon',
        kind: 'SIDE',
        label: '◆ 녹색 망토의 사나이',
        tileX: 17,
        tileY: 21,
        hideWhenFlagSet: 'flag_loguetown_plaza_visited',
        actionKind: 'STORY'
      },
      {
        markerId: 'marker_logue_smoker',
        kind: 'MAIN',
        label: '★ 스모커 45초 생존전',
        tileX: 37,
        tileY: 19,
        hideWhenFlagSet: 'flag_loguetown_cleared',
        actionKind: 'STORY'
      },
      {
        markerId: 'marker_logue_bounty',
        kind: 'ACTIVITY',
        label: '📋 수배 & 수련 캠프',
        tileX: 26,
        tileY: 25,
        actionKind: 'BOUNTY_BOARD'
      },
      {
        markerId: 'marker_logue_terminal',
        kind: 'ACTIVITY',
        label: '🌐 대전 단말기',
        tileX: 13,
        tileY: 25,
        actionKind: 'BATTLE_TERMINAL'
      }
    ],
    landmarks: [
      {
        landmarkId: 'lm_logue_platform',
        kind: 'EXECUTION_PLATFORM',
        tileX: 22,
        tileY: 8,
        widthTiles: 4,
        heightTiles: 3,
        label: '로저 처형대'
      },
      {
        landmarkId: 'lm_logue_boat',
        kind: 'DOCKED_BOAT',
        tileX: 4,
        tileY: 27,
        widthTiles: 3,
        heightTiles: 2
      },
      {
        landmarkId: 'lm_logue_board',
        kind: 'BOUNTY_BOARD',
        tileX: 26,
        tileY: 24,
        widthTiles: 1,
        heightTiles: 1
      }
    ],
    npcs,
    encounters: [{ ...origEnc, pos: tileCenter(37, 19) }],
    ambientProfile: { particles: ['RAIN'], density: 40 },
    lightingProfile: {
      defaultMood: 'DUSK',
      tintHex: '#1e293b',
      tintAlpha: 0.22,
      sunbeams: false,
      lanterns: [
        { tileX: 14, tileY: 20, color: '#fde047', radiusPx: 50 },
        { tileX: 22, tileY: 11, color: '#fde047', radiusPx: 56 },
        { tileX: 35, tileY: 18, color: '#38bdf8', radiusPx: 48 }
      ]
    },
    tileMap: g.toTileMap()
  };
}

export const EAST_BLUE_BUILDERS = {
  orange_town: buildOrangeTown,
  baratie: buildBaratie,
  arlong_park: buildArlongPark,
  loguetown: buildLoguetown
};
