import { GridCanvas, tileCenter } from './mapCanvasBuilder.mjs';

function buildFishmanIsland(orig) {
  const cols = 50;
  const rows = 36;
  const g = new GridCanvas(cols, rows, 's', 's');
  g.borderSolid('c');

  // Sea floor perimeter & Southern Double Bubble Coating Entrance
  g.paintWaterRect(0, 32, cols, 4, true);
  g.paintRoad(22, 28, 6, 5, 'd', 'd');
  g.paintRoad(18, 25, 14, 4, 'p', 'p');

  // West Coral Hills & Mermaid Cove (shallow tidepool + stepping rim)
  g.paintRoad(3, 15, 16, 12, 's', 's');
  g.paintWaterRect(4, 20, 7, 4, true);
  g.paintShallowStepping(11, 20, 2, 4, 'q');
  g.stampTreeCanopy(6, 17);
  g.stampTreeCanopy(15, 24);
  g.stampProps([[2, 20], [2, 22]], 'C', true);

  // Central Gyoncorde Coral Plaza
  g.paintRoad(16, 10, 20, 15, 'p', 'p');
  g.paintRoad(36, 15, 9, 8, 's', 's');
  g.stampTreeCanopy(41, 18);
  g.stampProps([[16, 13], [16, 14], [33, 13], [33, 14]], 'C', true);

  // North Ryugu Palace Coral Stairs & Gate (outer terrace chest 4 at row 2)
  g.paintRoad(15, 2, 20, 8, 'p', 'p');
  g.stampBuilding(21, 4, 8, 2, {
    label: '용궁성 산호 궁전',
    roofRows: 2,
    walkBehind: true
  });
  g.stampBuilding(37, 17, 5, 2, {
    label: '인어 카페 & 코팅 도크',
    roofRows: 2,
    walkBehind: true
  });
  g.scatterDecor(2, 2, cols - 4, 28, ['f', 't', 'h'], 8, 501);

  const origNpc = orig.npcs[0];
  const origEnc = orig.encounters[0];

  const npcs = [
    {
      ...origNpc,
      pos: tileCenter(22, 19),
      facing: 'right',
      ambientBubbleText: '호디의 E.S 폭주를 조심하게, 루피 군!',
      patrolWaypoints: [tileCenter(20, 19), tileCenter(25, 19)],
      patrolSpeedPx: 40,
      pauseTicks: 85
    },
    {
      npcId: 'npc_shirahoshi_guard',
      name: '용궁성 호위 무사',
      roleLabel: '넵튠 왕국 근위대',
      pos: tileCenter(26, 8),
      interactRadiusPx: 46,
      visualScale: 1.04,
      color: '#f472b6',
      facing: 'down',
      ambientBubbleText: '용궁성 외곽 계단 아래도 살피시오!',
      patrolWaypoints: [tileCenter(23, 8), tileCenter(30, 8)],
      patrolSpeedPx: 42,
      pauseTicks: 75,
      dialogueLines: [
        '무사: 호디 존스 일당이 기온코르드 광장을 점거했습니다! 용궁성 외곽 계단 쪽 보물도 회수해 주세요.'
      ]
    },
    {
      npcId: 'npc_camie',
      name: '인어 케이미',
      roleLabel: '어인섬 가이드',
      pos: tileCenter(12, 23),
      interactRadiusPx: 46,
      visualScale: 0.96,
      color: '#4ade80',
      facing: 'left',
      ambientBubbleText: '인어 만의 조개 바위 뒤가 반짝여!',
      patrolWaypoints: [tileCenter(12, 20), tileCenter(12, 25)],
      patrolSpeedPx: 44,
      pauseTicks: 70,
      dialogueLines: [
        '케이미: 이중 비눗방울 코팅을 지나 인어 만으로 들어오면 해저 빛줄기가 너무 예뻐요!'
      ]
    },
    {
      npcId: 'npc_pappag',
      name: '디자이너 파파구',
      roleLabel: '크리미날 브랜드 사장',
      pos: tileCenter(32, 21),
      interactRadiusPx: 44,
      visualScale: 0.85,
      color: '#facc15',
      facing: 'right',
      ambientBubbleText: '코팅 장인이 보물도 숨겨놨다고!',
      patrolWaypoints: [tileCenter(31, 21), tileCenter(36, 21)],
      patrolSpeedPx: 38,
      pauseTicks: 80,
      dialogueLines: [
        '파파구: 산호 아치 아래를 지나면 비밀 산호 언덕이 나오지!'
      ]
    },
    {
      npcId: 'npc_fukaboshi',
      name: '후카보시 왕자',
      roleLabel: '용궁 왕국 제1왕자',
      pos: tileCenter(27, 17),
      interactRadiusPx: 46,
      visualScale: 1.08,
      color: '#38bdf8',
      facing: 'up',
      ambientBubbleText: '태양의 해적단과 새로운 역사를!',
      patrolWaypoints: [tileCenter(27, 16), tileCenter(31, 16)],
      patrolSpeedPx: 40,
      pauseTicks: 80,
      dialogueLines: [
        '후카보시: 어인섬의 증오를 끊고 태양 아래로 함께 나아갑시다!'
      ]
    },
    {
      npcId: 'npc_ryugu_guard',
      name: '코팅 도크 기술자',
      roleLabel: '어인섬 항구 정비병',
      pos: tileCenter(29, 27),
      interactRadiusPx: 44,
      visualScale: 0.98,
      color: '#2dd4bf',
      facing: 'left',
      ambientBubbleText: '신세계 출항 코팅 상태 이상 무!',
      patrolWaypoints: [tileCenter(28, 27), tileCenter(32, 27)],
      patrolSpeedPx: 38,
      pauseTicks: 75,
      dialogueLines: [
        '기술자: 서쪽 버블 기둥 뒤쪽 광장 구석도 한번 둘러보세요.'
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
    spawnPoint: tileCenter(25, 29),
    portExitZone: { pos: tileCenter(25, 31), radiusPx: 44 },
    battleTerminalPos: tileCenter(20, 28),
    obstacles: g.obstacles,
    laserBarriers: [],
    puzzleSwitches: [],
    giantProps: [],
    zones: [
      {
        zoneId: 'zone_fishman_gate',
        name: '이중 비눗방울 코팅 입구',
        subtitle: '해저 1만 미터 용궁 관문',
        tileX: 18,
        tileY: 25,
        tileW: 14,
        tileH: 7,
        accentColor: '#38bdf8'
      },
      {
        zoneId: 'zone_fishman_cove',
        name: '산호 언덕 & 인어 만',
        subtitle: '형형색색 산호와 인어들의 안식처',
        tileX: 3,
        tileY: 14,
        tileW: 15,
        tileH: 13,
        accentColor: '#2dd4bf'
      },
      {
        zoneId: 'zone_fishman_gyoncorde',
        name: '기온코르드 광장',
        subtitle: '호디 존스 E.S 폭주 결전지',
        tileX: 17,
        tileY: 10,
        tileW: 20,
        tileH: 14,
        accentColor: '#f472b6'
      },
      {
        zoneId: 'zone_fishman_ryugu',
        name: '용궁성 산호 계단',
        subtitle: '넵튠 왕가와 바다의 숲 연결로',
        tileX: 15,
        tileY: 2,
        tileW: 21,
        tileH: 8,
        accentColor: '#facc15'
      }
    ],
    chests: [
      {
        chestId: 'chest_fishman_coral_arch',
        tileX: 14,
        tileY: 15,
        rarity: 'silver',
        hiddenHint: '서쪽 산호 아치 오버헤드 뒤편',
        reward: { berries: 18000, trainingPoints: 26, itemLabel: '해저 산호 진주 상자' }
      },
      {
        chestId: 'chest_fishman_mermaid_cove',
        tileX: 3,
        tileY: 21,
        rarity: 'wooden',
        hiddenHint: '인어 만 서쪽 조개 바위 뒤편',
        reward: { berries: 14000, trainingPoints: 20, itemLabel: '인어 만의 보석 궤짝' }
      },
      {
        chestId: 'chest_fishman_bubble_pillar',
        tileX: 17,
        tileY: 12,
        rarity: 'silver',
        hiddenHint: '기온코르드 광장 서쪽 버블 기둥 뒤',
        reward: { berries: 19000, trainingPoints: 28, itemLabel: '어인섬 고대 금화' }
      },
      {
        chestId: 'chest_fishman_ryugu_stairs',
        tileX: 25,
        tileY: 2,
        rarity: 'gold',
        hiddenHint: '용궁성 외곽 산호 계단 뒤편',
        reward: {
          berries: 25000,
          trainingPoints: 34,
          healPartyRatio: 0.5,
          itemLabel: '류구 왕국 옥함 보물'
        }
      }
    ],
    markers: [
      {
        markerId: 'marker_fishman_port',
        kind: 'PORT_EXIT',
        label: '⚓ 코팅 도크 출항',
        tileX: 25,
        tileY: 31,
        actionKind: 'PORT_EXIT'
      },
      {
        markerId: 'marker_fishman_jinbe',
        kind: 'SIDE',
        label: '◆ 해협의 징베',
        tileX: 22,
        tileY: 19,
        hideWhenFlagSet: 'flag_fishman_met_jinbe',
        actionKind: 'STORY'
      },
      {
        markerId: 'marker_fishman_hody',
        kind: 'MAIN',
        label: '★ 호디 존스 결전',
        tileX: 25,
        tileY: 13,
        hideWhenFlagSet: 'flag_fishman_island_cleared',
        actionKind: 'STORY'
      },
      {
        markerId: 'marker_fishman_camp',
        kind: 'ACTIVITY',
        label: '🏕 어인섬 정비 캠프',
        tileX: 34,
        tileY: 21,
        actionKind: 'CAMP_TRAINING'
      },
      {
        markerId: 'marker_fishman_terminal',
        kind: 'ACTIVITY',
        label: '🌐 대전 단말기',
        tileX: 20,
        tileY: 28,
        actionKind: 'BATTLE_TERMINAL'
      }
    ],
    landmarks: [
      {
        landmarkId: 'lm_fishman_gate_arch',
        kind: 'CORAL_ARCH',
        tileX: 22,
        tileY: 26,
        widthTiles: 6,
        heightTiles: 2,
        label: '비눗방울 산호 문',
        hasOverheadPart: true
      },
      {
        landmarkId: 'lm_fishman_cove_arch',
        kind: 'CORAL_ARCH',
        tileX: 12,
        tileY: 16,
        widthTiles: 5,
        heightTiles: 2,
        hasOverheadPart: true
      },
      {
        landmarkId: 'lm_fishman_boat',
        kind: 'SUNNY_DOCK',
        tileX: 17,
        tileY: 30,
        widthTiles: 3,
        heightTiles: 2
      },
      {
        landmarkId: 'lm_fishman_board',
        kind: 'BOUNTY_BOARD',
        tileX: 34,
        tileY: 20,
        widthTiles: 1,
        heightTiles: 1
      }
    ],
    npcs,
    encounters: [{ ...origEnc, pos: tileCenter(25, 13) }],
    ambientProfile: { particles: ['BUBBLE'], density: 38 },
    lightingProfile: {
      defaultMood: 'DAY',
      tintHex: '#0891b2',
      tintAlpha: 0.14,
      sunbeams: true,
      lanterns: [
        { tileX: 22, tileY: 18, color: '#2dd4bf', radiusPx: 48 },
        { tileX: 28, tileY: 18, color: '#f472b6', radiusPx: 48 }
      ]
    },
    tileMap: g.toTileMap()
  };
}

function buildDressrosa(orig) {
  const cols = 52;
  const rows = 36;
  const g = new GridCanvas(cols, rows, 'G', 'g');
  g.borderSolid('c');

  // Southern Acacia Port harbor
  g.paintWaterRect(0, 32, cols, 4, true);
  g.paintRoad(23, 28, 6, 5, 'd', 'd');

  // Main Mediterranean cobblestone streets
  g.paintRoad(15, 22, 21, 6, 'p', 'p');
  g.paintRoad(22, 11, 12, 12, 'p', 'p');
  g.paintRoad(5, 14, 15, 10, 'p', 'p');

  // Spanish Red-Roof Houses with narrow walkable alley (cols 25..26) & walk-behind row 16..17
  g.stampBuilding(20, 18, 5, 2, {
    label: '아카시아 붉은 지붕 민가',
    roofRows: 2,
    walkBehind: true
  });
  g.stampBuilding(27, 18, 5, 2, {
    label: '장난감 공방 거리가옥',
    roofRows: 2,
    walkBehind: true
  });
  g.paintRoad(19, 16, 14, 2, 'p', 'p');
  g.paintRoad(25, 18, 2, 4, 'p', 'p');

  // West Corrida Colosseum Outer Plaza + Back Alley (chest 1 at (9, 17))
  g.stampBuilding(6, 19, 7, 2, {
    label: '코리다 콜로세움 외곽',
    roofRows: 2,
    walkBehind: true
  });
  g.paintRoad(5, 17, 9, 2, 'p', 'p');

  // East Sunflower Hill & Canopy Woods
  g.paintRoad(36, 15, 12, 12, 'G', 'g');
  g.stampTreeCanopy(40, 18);
  g.stampTreeCanopy(44, 18);
  g.stampTreeCanopy(42, 23);

  // North-East Royal Plateau & Palace Gate Stairs
  g.paintRoad(21, 3, 20, 9, 'p', 'p');
  g.stampBuilding(26, 4, 8, 2, {
    label: '드레스로자 왕궁 대지',
    roofRows: 2,
    walkBehind: true
  });
  g.scatterDecor(2, 2, cols - 4, 28, ['f', 'F', 't', 'T'], 6, 502);

  const origLaw = orig.npcs[0];
  const origColosseum = orig.npcs[1];
  const origEnc = orig.encounters[0];

  const npcs = [
    {
      ...origLaw,
      pos: tileCenter(24, 12),
      facing: 'right',
      ambientBubbleText: '도플라밍고의 새장을 부순다!',
      patrolWaypoints: [tileCenter(23, 12), tileCenter(27, 12)],
      patrolSpeedPx: 42,
      pauseTicks: 80
    },
    {
      ...origColosseum,
      pos: tileCenter(14, 15),
      facing: 'right',
      ambientBubbleText: '코리다 콜로세움 토너먼트 참가 접수!',
      patrolWaypoints: [tileCenter(13, 15), tileCenter(16, 15)],
      patrolSpeedPx: 36,
      pauseTicks: 90
    },
    {
      npcId: 'npc_rebecca',
      name: '검투사 레베카',
      roleLabel: '콜로세움 D블록 무패 검투사',
      pos: tileCenter(9, 13),
      interactRadiusPx: 46,
      visualScale: 0.98,
      color: '#f472b6',
      facing: 'down',
      ambientBubbleText: '루시! 콜로세움에서 꼭 승리해요!',
      patrolWaypoints: [tileCenter(7, 13), tileCenter(12, 13)],
      patrolSpeedPx: 42,
      pauseTicks: 75,
      dialogueLines: [
        '레베카: 병정 아저씨와 해바라기 밭에서 함께 살 수 있게 도플라밍고를 쓰러뜨려 주세요!'
      ]
    },
    {
      npcId: 'npc_kyros',
      name: '외다리 병정 큐로스',
      roleLabel: '전설의 검투사 · 톤타타 반군',
      pos: tileCenter(37, 20),
      interactRadiusPx: 46,
      visualScale: 1.04,
      color: '#fb923c',
      facing: 'left',
      ambientBubbleText: '해바라기 언덕 너머가 왕궁 대지다!',
      patrolWaypoints: [tileCenter(36, 20), tileCenter(39, 24)],
      patrolSpeedPx: 40,
      pauseTicks: 80,
      dialogueLines: [
        '큐로스: 10년간 장난감 병정으로 버텨왔소! 동쪽 해바라기 숲 뒤와 왕궁 테라스도 확인해 주시오.'
      ]
    },
    {
      npcId: 'npc_leo',
      name: '톤타타 족 레오',
      roleLabel: '소인족 톤타타 용사',
      pos: tileCenter(33, 13),
      interactRadiusPx: 44,
      visualScale: 0.85,
      color: '#4ade80',
      facing: 'left',
      ambientBubbleText: '실실 열매 각성 공격을 조심해란말야!',
      patrolWaypoints: [tileCenter(32, 13), tileCenter(36, 13)],
      patrolSpeedPx: 48,
      pauseTicks: 65,
      dialogueLines: [
        '레오: SOP 작전으로 장난감들이 전부 원래 모습으로 돌아오기 시작했어란말야!'
      ]
    },
    {
      npcId: 'npc_dressrosa_toy',
      name: '아카시아 장난감 주민',
      roleLabel: '사랑과 정열의 나라 시민',
      pos: tileCenter(21, 24),
      interactRadiusPx: 44,
      visualScale: 0.94,
      color: '#facc15',
      facing: 'up',
      ambientBubbleText: '붉은 지붕 사이 좁은 통로가 지름길!',
      patrolWaypoints: [tileCenter(19, 24), tileCenter(29, 24)],
      patrolSpeedPx: 38,
      pauseTicks: 75,
      dialogueLines: [
        '장난감 주민: 붉은 지붕 거리 사이 좁은 돌길에 숨겨진 보물 상자가 하나 놓여 있더군!'
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
    spawnPoint: tileCenter(26, 29),
    portExitZone: { pos: tileCenter(26, 31), radiusPx: 44 },
    battleTerminalPos: tileCenter(21, 29),
    obstacles: g.obstacles,
    laserBarriers: [],
    puzzleSwitches: [],
    giantProps: [],
    zones: [
      {
        zoneId: 'zone_dressrosa_acacia',
        name: '아카시아 항구 & 붉은 지붕 거리',
        subtitle: '정열과 장난감의 지중해 도시',
        tileX: 16,
        tileY: 16,
        tileW: 20,
        tileH: 15,
        accentColor: '#fb923c'
      },
      {
        zoneId: 'zone_dressrosa_colosseum',
        name: '코리다 콜로세움 외곽 광장',
        subtitle: '신세계 검투사 토너먼트 아레나',
        tileX: 4,
        tileY: 12,
        tileW: 15,
        tileH: 12,
        accentColor: '#facc15'
      },
      {
        zoneId: 'zone_dressrosa_sunflower',
        name: '해바라기 언덕',
        subtitle: '스칼렛과 큐로스의 꽃밭',
        tileX: 35,
        tileY: 14,
        tileW: 14,
        tileH: 13,
        accentColor: '#4ade80'
      },
      {
        zoneId: 'zone_dressrosa_palace',
        name: '왕궁 대지 입구',
        subtitle: '칠무해 도플라밍고 새장 결전지',
        tileX: 21,
        tileY: 3,
        tileW: 20,
        tileH: 9,
        accentColor: '#ec4899'
      }
    ],
    chests: [
      {
        chestId: 'chest_dressrosa_colosseum_alley',
        tileX: 9,
        tileY: 17,
        rarity: 'silver',
        hiddenHint: '코리다 콜로세움 외곽 뒷골목',
        reward: { berries: 20000, trainingPoints: 28, itemLabel: '검투사 챔피언 기념 주화' }
      },
      {
        chestId: 'chest_dressrosa_sunflower_trees',
        tileX: 42,
        tileY: 16,
        rarity: 'wooden',
        hiddenHint: '해바라기 언덕 오버헤드 나무 뒤편',
        reward: { berries: 16000, trainingPoints: 22, itemLabel: '톤타타 꽃밭 비상 식량' }
      },
      {
        chestId: 'chest_dressrosa_roof_passage',
        tileX: 26,
        tileY: 17,
        rarity: 'silver',
        hiddenHint: '붉은 지붕 민가 사이 좁은 통로 뒤편',
        reward: { berries: 22000, trainingPoints: 30, itemLabel: '아카시아 요정 보석함' }
      },
      {
        chestId: 'chest_dressrosa_palace_terrace',
        tileX: 38,
        tileY: 7,
        rarity: 'gold',
        hiddenHint: '왕궁 대지 계단 아래 동쪽 테라스',
        reward: {
          berries: 30000,
          trainingPoints: 38,
          healPartyRatio: 0.5,
          itemLabel: '리쿠 왕가 해방의 훈장'
        }
      }
    ],
    markers: [
      {
        markerId: 'marker_dress_port',
        kind: 'PORT_EXIT',
        label: '⚓ 아카시아 출항 부두',
        tileX: 26,
        tileY: 31,
        actionKind: 'PORT_EXIT'
      },
      {
        markerId: 'marker_dress_law',
        kind: 'SIDE',
        label: '◆ 동맹 트라팔가 로',
        tileX: 24,
        tileY: 12,
        hideWhenFlagSet: 'flag_dressrosa_law_alliance',
        actionKind: 'STORY'
      },
      {
        markerId: 'marker_dress_doffy',
        kind: 'MAIN',
        label: '★ 도플라밍고 결전',
        tileX: 30,
        tileY: 8,
        hideWhenFlagSet: 'flag_dressrosa_cleared',
        actionKind: 'STORY'
      },
      {
        markerId: 'marker_dress_colosseum',
        kind: 'ACTIVITY',
        label: '🏆 코리다 콜로세움',
        tileX: 14,
        tileY: 15,
        actionKind: 'BOUNTY_BOARD'
      },
      {
        markerId: 'marker_dress_terminal',
        kind: 'ACTIVITY',
        label: '🌐 대전 단말기',
        tileX: 21,
        tileY: 29,
        actionKind: 'BATTLE_TERMINAL'
      }
    ],
    landmarks: [
      {
        landmarkId: 'lm_dress_colosseum',
        kind: 'COLOSSEUM_ARCH',
        tileX: 6,
        tileY: 14,
        widthTiles: 6,
        heightTiles: 2,
        label: '코리다 콜로세움 아치',
        hasOverheadPart: true
      },
      {
        landmarkId: 'lm_dress_boat',
        kind: 'SUNNY_DOCK',
        tileX: 18,
        tileY: 30,
        widthTiles: 3,
        heightTiles: 2
      },
      {
        landmarkId: 'lm_dress_board',
        kind: 'BOUNTY_BOARD',
        tileX: 31,
        tileY: 26,
        widthTiles: 1,
        heightTiles: 1
      }
    ],
    npcs,
    encounters: [{ ...origEnc, pos: tileCenter(30, 8) }],
    ambientProfile: { particles: ['PETAL', 'LEAF'], density: 34 },
    lightingProfile: {
      defaultMood: 'DAY',
      tintHex: '#fde047',
      tintAlpha: 0.06,
      sunbeams: true,
      lanterns: [
        { tileX: 25, tileY: 21, color: '#fde047', radiusPx: 44 },
        { tileX: 30, tileY: 7, color: '#ec4899', radiusPx: 48 }
      ]
    },
    tileMap: g.toTileMap()
  };
}

function buildTottoLand(orig) {
  const cols = 50;
  const rows = 36;
  const g = new GridCanvas(cols, rows, 'G', 'g');
  g.borderSolid('c');

  // Southern Sweet City syrup sea & candy pier (zero yellow sand!)
  g.paintWaterRect(0, 32, cols, 4, true);
  g.paintRoad(22, 28, 6, 5, 'd', 'd');

  // Chocolate Town Square & Candy Houses + Waffle Arches
  g.paintRoad(12, 16, 26, 12, 'p', 'p');
  g.stampBuilding(10, 20, 5, 2, {
    label: '카카오 초콜릿 과자 집',
    roofRows: 2,
    walkBehind: true
  });
  g.stampBuilding(33, 20, 5, 2, {
    label: '스위트 마카롱 베이커리',
    roofRows: 2,
    walkBehind: true
  });
  g.stampArchOverhead(17, 19, 5, 2, 'r', 'C');
  g.stampArchOverhead(27, 19, 5, 2, 'r', 'C');
  g.paintRoad(10, 17, 13, 2, 'p', 'p');

  // Candy Forest Canopy (West)
  g.paintRoad(4, 15, 8, 10, 'G', 'g');
  g.stampTreeCanopy(5, 19);
  g.stampTreeCanopy(8, 22);
  g.stampTreeCanopy(42, 22);

  // Cream River & Cream Bridge (rows 13..14)
  g.paintWaterRect(1, 13, 20, 2, true);
  g.paintWaterRect(29, 13, 20, 2, true);
  g.paintRoad(21, 12, 8, 4, 'd', 'd');

  // Northern Mirror Plaza & Whole Cake Chateau Gate + East Chateau Garden
  g.paintRoad(13, 3, 31, 9, 'p', 'p');
  g.stampBuilding(20, 4, 10, 2, {
    label: '홀케이크 샤토 정문',
    roofRows: 2,
    walkBehind: true
  });
  g.stampTreeCanopy(40, 7);
  g.stampProps([[43, 5], [43, 8]], 'k', true);
  g.scatterDecor(2, 2, cols - 4, 28, ['f', 'F', 't', 'T'], 7, 503);

  const origNpc = orig.npcs[0];
  const origEnc = orig.encounters[0];

  const npcs = [
    {
      ...origNpc,
      pos: tileCenter(21, 11),
      facing: 'right',
      ambientBubbleText: '완벽 회피와 맞대결로 미래 예지를 깨부수자!',
      patrolWaypoints: [tileCenter(19, 11), tileCenter(24, 11)],
      patrolSpeedPx: 42,
      pauseTicks: 80
    },
    {
      npcId: 'npc_pudding',
      name: '샬롯 푸딩',
      roleLabel: '카카오 섬 쇼콜라티에',
      pos: tileCenter(14, 24),
      interactRadiusPx: 46,
      visualScale: 0.96,
      color: '#f472b6',
      facing: 'up',
      ambientBubbleText: '크림 다리를 건너면 거울 광장이에요!',
      patrolWaypoints: [tileCenter(12, 24), tileCenter(17, 24)],
      patrolSpeedPx: 40,
      pauseTicks: 75,
      dialogueLines: [
        '푸딩: 초콜릿 분수 뒤와 와플 아치 뒤편 비밀 길에 숨겨둔 특제 설탕 상자가 있을 거예요.'
      ]
    },
    {
      npcId: 'npc_chiffon',
      name: '샬롯 시폰',
      roleLabel: '파이어 탱크 해적단 조력자',
      pos: tileCenter(33, 24),
      interactRadiusPx: 46,
      visualScale: 1.0,
      color: '#fb923c',
      facing: 'left',
      ambientBubbleText: '웨딩 케이크 탈출 준비 완료!',
      patrolWaypoints: [tileCenter(30, 24), tileCenter(36, 24)],
      patrolSpeedPx: 38,
      pauseTicks: 80,
      dialogueLines: [
        '시폰: 상디와 함께 만든 케이크 덕분에 선창 탈출로도 무사히 열렸습니다!'
      ]
    },
    {
      npcId: 'npc_homie_baker',
      name: '비스킷 호미즈 제과사',
      roleLabel: '스위트 시티 주민',
      pos: tileCenter(24, 26),
      interactRadiusPx: 44,
      visualScale: 0.92,
      color: '#fde047',
      facing: 'up',
      ambientBubbleText: '과자 숲 뒤편에도 달콤한 보물이!',
      patrolWaypoints: [tileCenter(21, 26), tileCenter(28, 26)],
      patrolSpeedPx: 36,
      pauseTicks: 75,
      dialogueLines: [
        '호미즈: 이 마을 집들은 전부 진짜 비스킷과 초콜릿으로 지어졌답니다!'
      ]
    },
    {
      npcId: 'npc_chess_soldier',
      name: '스위트 체스병',
      roleLabel: '홀케이크 샤토 경비병',
      pos: tileCenter(29, 10),
      interactRadiusPx: 44,
      visualScale: 1.02,
      color: '#e2e8f0',
      facing: 'left',
      ambientBubbleText: '카타쿠리 님이 거울 광장에서 대기 중!',
      patrolWaypoints: [tileCenter(28, 10), tileCenter(33, 10)],
      patrolSpeedPx: 42,
      pauseTicks: 75,
      dialogueLines: [
        '체스병: 10억 베리의 스위트 장성 카타쿠리 님에게 도전하려는 자는 각오해야 할 것이다!'
      ]
    },
    {
      npcId: 'npc_carrot',
      name: '밍크족 캐럿',
      roleLabel: '토트랜드 거울 세계 정찰대',
      pos: tileCenter(16, 9),
      interactRadiusPx: 46,
      visualScale: 0.95,
      color: '#facc15',
      facing: 'right',
      ambientBubbleText: '가르츄! 샤토 정원 구석도 확인했어!',
      patrolWaypoints: [tileCenter(14, 9), tileCenter(18, 9)],
      patrolSpeedPx: 48,
      pauseTicks: 65,
      dialogueLines: [
        '캐럿: 페드로 씨와 브룩 씨가 로드 포네그리프 탁본을 챙길 수 있게 시선을 끌어주자!'
      ]
    }
  ];

  return {
    islandId: orig.islandId,
    name: orig.name,
    episodeId: orig.episodeId,
    width: cols * 32,
    height: rows * 32,
    theme: 'FUTURE_LAB',
    spawnPoint: tileCenter(25, 29),
    portExitZone: { pos: tileCenter(25, 31), radiusPx: 44 },
    battleTerminalPos: tileCenter(20, 29),
    obstacles: g.obstacles,
    laserBarriers: [],
    puzzleSwitches: [],
    giantProps: [],
    zones: [
      {
        zoneId: 'zone_totto_port',
        name: '스위트 시티 항구',
        subtitle: '만국 홀케이크 아일랜드 관문',
        tileX: 18,
        tileY: 26,
        tileW: 14,
        tileH: 6,
        accentColor: '#f472b6'
      },
      {
        zoneId: 'zone_totto_chocolate',
        name: '초콜릿 타운 & 와플 아치',
        subtitle: '과자 집과 초콜릿 분수 거리',
        tileX: 4,
        tileY: 16,
        tileW: 40,
        tileH: 10,
        accentColor: '#fb923c'
      },
      {
        zoneId: 'zone_totto_cream_bridge',
        name: '생크림 운하 다리',
        subtitle: '샤토 광장으로 이어지는 달콤한 다리',
        tileX: 20,
        tileY: 12,
        tileW: 10,
        tileH: 4,
        accentColor: '#fef08a'
      },
      {
        zoneId: 'zone_totto_mirror',
        name: '거울 광장 & 홀케이크 샤토',
        subtitle: '카타쿠리 1:1 미래 예지 결투장',
        tileX: 13,
        tileY: 3,
        tileW: 31,
        tileH: 9,
        accentColor: '#be185d'
      }
    ],
    chests: [
      {
        chestId: 'chest_totto_waffle_arch',
        tileX: 19,
        tileY: 18,
        rarity: 'silver',
        hiddenHint: '와플 아치 오버헤드 뒤 비밀 길',
        reward: { berries: 22000, trainingPoints: 30, itemLabel: '스위트 시티 황금 캔디' }
      },
      {
        chestId: 'chest_totto_fountain',
        tileX: 25,
        tileY: 20,
        rarity: 'wooden',
        hiddenHint: '초콜릿 분수 뒤편 석조 구역',
        reward: { berries: 18000, trainingPoints: 24, itemLabel: '특제 다크 초코 보급' }
      },
      {
        chestId: 'chest_totto_candy_forest',
        tileX: 5,
        tileY: 17,
        rarity: 'silver',
        hiddenHint: '과자 숲 캐노피 뒤편 숨은 오솔길',
        reward: { berries: 24000, trainingPoints: 32, itemLabel: '거울 조각 비전 상자' }
      },
      {
        chestId: 'chest_totto_chateau_garden',
        tileX: 42,
        tileY: 6,
        rarity: 'gold',
        hiddenHint: '홀케이크 샤토 외곽 정원 구석',
        reward: {
          berries: 32000,
          trainingPoints: 40,
          healPartyRatio: 0.5,
          itemLabel: '로드 포네그리프 탁본 수호 보물'
        }
      }
    ],
    markers: [
      {
        markerId: 'marker_totto_port',
        kind: 'PORT_EXIT',
        label: '⚓ 스위트 시티 출항',
        tileX: 25,
        tileY: 31,
        actionKind: 'PORT_EXIT'
      },
      {
        markerId: 'marker_totto_pedro',
        kind: 'SIDE',
        label: '◆ 페드로 & 브룩',
        tileX: 21,
        tileY: 11,
        hideWhenFlagSet: 'flag_totto_foresight_hint',
        actionKind: 'STORY'
      },
      {
        markerId: 'marker_totto_katakuri',
        kind: 'MAIN',
        label: '★ 카타쿠리 1:1 결투',
        tileX: 25,
        tileY: 7,
        hideWhenFlagSet: 'flag_totto_land_cleared',
        actionKind: 'STORY'
      },
      {
        markerId: 'marker_totto_camp',
        kind: 'ACTIVITY',
        label: '🏕 수련 캠프 & 정비',
        tileX: 35,
        tileY: 25,
        actionKind: 'CAMP_TRAINING'
      },
      {
        markerId: 'marker_totto_terminal',
        kind: 'ACTIVITY',
        label: '🌐 대전 단말기',
        tileX: 20,
        tileY: 29,
        actionKind: 'BATTLE_TERMINAL'
      }
    ],
    landmarks: [
      {
        landmarkId: 'lm_totto_waffle_w',
        kind: 'WAFFLE_ARCH',
        tileX: 17,
        tileY: 19,
        widthTiles: 5,
        heightTiles: 2,
        label: '와플 아치',
        hasOverheadPart: true
      },
      {
        landmarkId: 'lm_totto_waffle_e',
        kind: 'WAFFLE_ARCH',
        tileX: 27,
        tileY: 19,
        widthTiles: 5,
        heightTiles: 2,
        hasOverheadPart: true
      },
      {
        landmarkId: 'lm_totto_fountain',
        kind: 'WATER_FOUNTAIN',
        tileX: 24,
        tileY: 22,
        widthTiles: 2,
        heightTiles: 2,
        label: '초콜릿 분수'
      },
      {
        landmarkId: 'lm_totto_boat',
        kind: 'SUNNY_DOCK',
        tileX: 18,
        tileY: 30,
        widthTiles: 3,
        heightTiles: 2
      },
      {
        landmarkId: 'lm_totto_board',
        kind: 'BOUNTY_BOARD',
        tileX: 35,
        tileY: 24,
        widthTiles: 1,
        heightTiles: 1
      }
    ],
    npcs,
    encounters: [{ ...origEnc, pos: tileCenter(25, 7) }],
    ambientProfile: { particles: ['SUGAR_SPARKLE', 'PETAL'], density: 36 },
    lightingProfile: {
      defaultMood: 'DUSK',
      tintHex: '#db2777',
      tintAlpha: 0.14,
      sunbeams: false,
      lanterns: [
        { tileX: 25, tileY: 21, color: '#f9a8d4', radiusPx: 50 },
        { tileX: 25, tileY: 9, color: '#e879f9', radiusPx: 54 },
        { tileX: 16, tileY: 20, color: '#fde047', radiusPx: 44 }
      ]
    },
    tileMap: g.toTileMap()
  };
}

function buildElbaf(orig) {
  const cols = 54;
  const rows = 38;
  const g = new GridCanvas(cols, rows, 'G', 'g');
  g.borderSolid('c');

  // Southern Giant Warrior Pirates Wooden Pier
  g.paintWaterRect(0, 34, cols, 4, true);
  g.paintRoad(23, 29, 8, 6, 'd', 'd');
  g.paintRoad(15, 25, 24, 5, 'p', 'p');

  // Central World Tree Adam Colossal Root Bridge (elevated wood_dock + stone steps)
  g.paintRoad(22, 11, 10, 15, 'd', 'd');
  g.stampArchOverhead(24, 20, 6, 3, 'r', 'C');
  g.stampArchOverhead(13, 21, 5, 2, 'r', 'C');
  g.paintRoad(12, 18, 10, 4, 'G', 'g');

  // West Norse Rune Monolith Grove
  g.paintRoad(4, 12, 14, 12, 'G', 'g');
  g.stampTreeCanopy(5, 19);
  g.stampTreeCanopy(9, 19);
  g.stampProps([[6, 15], [10, 15]], 'C', true);

  // East Giant Stone Longhouse Village
  g.paintRoad(34, 13, 15, 13, 'p', 'p');
  g.stampBuilding(37, 16, 7, 2, {
    label: '거인족 석조 장옥',
    roofRows: 2,
    walkBehind: true
  });
  g.paintRoad(36, 14, 9, 2, 'p', 'p');
  g.stampTreeCanopy(46, 17);
  g.stampProps([[45, 15], [45, 19]], 'k', true);

  // North Underworld Cliff Arena Entrance (Loki)
  g.paintRoad(15, 3, 30, 8, 'p', 'p');
  g.stampBuilding(22, 3, 10, 2, {
    label: '명계 절벽 아레나 제단',
    roofRows: 2,
    walkBehind: true
  });
  g.stampProps([[41, 5], [44, 5], [44, 8]], 'C', true);
  g.scatterDecor(2, 2, cols - 4, 30, ['f', 'F', 't', 'T'], 7, 504);

  const origDorry = orig.npcs[0];
  const origRaid = orig.npcs[1];
  const origEnc = orig.encounters[0];
  const origYgg = orig.giantProps[0];
  const origSword = orig.giantProps[1];

  const npcs = [
    {
      ...origDorry,
      pos: tileCenter(25, 25),
      facing: 'right',
      ambientBubbleText: '기가가가가! 태양의 신을 환영한다!',
      patrolWaypoints: [tileCenter(23, 25), tileCenter(28, 25)],
      patrolSpeedPx: 40,
      pauseTicks: 85
    },
    {
      ...origRaid,
      pos: tileCenter(17, 27),
      facing: 'up',
      ambientBubbleText: '종말의 철뇌 로키 거대 레이드 도전!',
      patrolWaypoints: [tileCenter(16, 27), tileCenter(19, 27)],
      patrolSpeedPx: 34,
      pauseTicks: 90
    },
    {
      npcId: 'npc_hajrudin',
      name: '거병 하이루딘',
      roleLabel: '신 거병 해적단 선장',
      pos: tileCenter(33, 21),
      interactRadiusPx: 50,
      visualScale: 1.55,
      color: '#fb923c',
      facing: 'left',
      ambientBubbleText: '동쪽 거인 장옥 뒤편 화로가 따뜻해!',
      patrolWaypoints: [tileCenter(33, 21), tileCenter(38, 21)],
      patrolSpeedPx: 42,
      pauseTicks: 80,
      dialogueLines: [
        '하이루딘: 밀짚모자 대선장! 엘바프의 거인 장옥과 세계수 뿌리 다리 아래 비밀 통로도 살펴보시오!'
      ]
    },
    {
      npcId: 'npc_saul',
      name: '재규어 D. 사우로',
      roleLabel: '전사의 나라 역사의 전승자',
      pos: tileCenter(11, 18),
      interactRadiusPx: 50,
      visualScale: 1.5,
      color: '#38bdf8',
      facing: 'down',
      ambientBubbleText: '데레시시시! 오하라의 책들이 여기에!',
      patrolWaypoints: [tileCenter(10, 18), tileCenter(14, 18)],
      patrolSpeedPx: 38,
      pauseTicks: 85,
      dialogueLines: [
        '사우로: 북유럽 룬 석비 뒤와 세계수 아담의 거대한 뿌리 아래엔 수백 년 된 지혜가 깃들어 있다네!'
      ]
    },
    {
      npcId: 'npc_elbaf_smith',
      name: '거인 대장장이 브로크',
      roleLabel: '아다만트 병기 장인',
      pos: tileCenter(35, 15),
      interactRadiusPx: 48,
      visualScale: 1.35,
      color: '#ef4444',
      facing: 'right',
      ambientBubbleText: '명계 절벽 끝에 전사의 비보가 있어!',
      patrolWaypoints: [tileCenter(35, 15), tileCenter(35, 19)],
      patrolSpeedPx: 38,
      pauseTicks: 80,
      dialogueLines: [
        '대장장이: 왕자 로키의 철뇌 라그니르가 벼락을 부르고 있으니 패기 극의를 단련하고 올라가게!'
      ]
    },
    {
      npcId: 'npc_elbaf_warrior',
      name: '엘바프 전사 견습생',
      roleLabel: '세계수 수비대',
      pos: tileCenter(29, 12),
      interactRadiusPx: 46,
      visualScale: 1.25,
      color: '#a3e635',
      facing: 'up',
      ambientBubbleText: '세계수 아담의 황금 낙엽이 내린다!',
      patrolWaypoints: [tileCenter(26, 12), tileCenter(31, 12)],
      patrolSpeedPx: 42,
      pauseTicks: 75,
      dialogueLines: [
        '전사: 북쪽 명계 절벽 아레나로 오르면 저주받은 왕자 로키가 기다립니다!'
      ]
    }
  ];

  return {
    islandId: orig.islandId,
    name: orig.name,
    episodeId: orig.episodeId,
    width: cols * 32,
    height: rows * 32,
    theme: 'GIANT_ELBAF',
    spawnPoint: tileCenter(27, 30),
    portExitZone: { pos: tileCenter(27, 33), radiusPx: 48 },
    battleTerminalPos: tileCenter(22, 30),
    obstacles: g.obstacles,
    laserBarriers: [],
    puzzleSwitches: [],
    giantProps: [
      {
        ...origYgg,
        pos: tileCenter(18, 17)
      },
      {
        ...origSword,
        pos: tileCenter(36, 24)
      }
    ],
    zones: [
      {
        zoneId: 'zone_elbaf_dock',
        name: '거병 해적단 거대 목조 부두',
        subtitle: '최종장 엘바프 대선착장',
        tileX: 16,
        tileY: 25,
        tileW: 22,
        tileH: 10,
        accentColor: '#eab308'
      },
      {
        zoneId: 'zone_elbaf_adam_bridge',
        name: '세계수 아담 거대 뿌리 다리',
        subtitle: '하늘을 가르는 신목 오버헤드 아치',
        tileX: 13,
        tileY: 16,
        tileW: 20,
        tileH: 9,
        accentColor: '#a3e635'
      },
      {
        zoneId: 'zone_elbaf_longhouse',
        name: '룬 석비 & 거인족 장옥 마을',
        subtitle: '고대 전사들의 맹세와 오하라의 기록',
        tileX: 4,
        tileY: 12,
        tileW: 44,
        tileH: 13,
        accentColor: '#38bdf8'
      },
      {
        zoneId: 'zone_elbaf_underworld',
        name: '명계 절벽 아레나 입구',
        subtitle: '왕자 로키 최종 결전지',
        tileX: 15,
        tileY: 3,
        tileW: 30,
        tileH: 8,
        accentColor: '#facc15'
      }
    ],
    chests: [
      {
        chestId: 'chest_elbaf_adam_root',
        tileX: 15,
        tileY: 20,
        rarity: 'silver',
        hiddenHint: '세계수 거대 뿌리 오버헤드 아래 비밀 통로',
        reward: { berries: 28000, trainingPoints: 34, itemLabel: '보배 아담의 황금 수액' }
      },
      {
        chestId: 'chest_elbaf_rune_monolith',
        tileX: 8,
        tileY: 13,
        rarity: 'silver',
        hiddenHint: '북유럽 룬 석비 군락 뒤편',
        reward: { berries: 26000, trainingPoints: 32, itemLabel: '고대 엘바프 룬 석판' }
      },
      {
        chestId: 'chest_elbaf_longhouse_hearth',
        tileX: 41,
        tileY: 14,
        rarity: 'wooden',
        hiddenHint: '거인족 석조 장옥 뒤편 화로 옆',
        reward: { berries: 22000, trainingPoints: 28, itemLabel: '거인의 만찬 보급 통' }
      },
      {
        chestId: 'chest_elbaf_cliff_overlook',
        tileX: 42,
        tileY: 6,
        rarity: 'gold',
        hiddenHint: '명계 절벽 동쪽 전망 바위 끝',
        reward: {
          berries: 40000,
          trainingPoints: 45,
          healPartyRatio: 0.6,
          itemLabel: '태양신 니카 전설의 뿔잔'
        }
      }
    ],
    markers: [
      {
        markerId: 'marker_elbaf_port',
        kind: 'PORT_EXIT',
        label: '⚓ 거병 부두 출항',
        tileX: 27,
        tileY: 33,
        actionKind: 'PORT_EXIT'
      },
      {
        markerId: 'marker_elbaf_dorry',
        kind: 'SIDE',
        label: '◆ 도리 & 브로기',
        tileX: 25,
        tileY: 25,
        hideWhenFlagSet: 'flag_elbaf_giants_greeted',
        actionKind: 'STORY'
      },
      {
        markerId: 'marker_elbaf_loki',
        kind: 'MAIN',
        label: '★ 저주받은 왕자 로키',
        tileX: 27,
        tileY: 7,
        hideWhenFlagSet: 'flag_elbaf_trial_cleared',
        actionKind: 'STORY'
      },
      {
        markerId: 'marker_elbaf_raid',
        kind: 'ACTIVITY',
        label: '🔥 거대 보스 레이드 제단',
        tileX: 17,
        tileY: 27,
        actionKind: 'BOUNTY_BOARD'
      },
      {
        markerId: 'marker_elbaf_terminal',
        kind: 'ACTIVITY',
        label: '🌐 대전 단말기',
        tileX: 22,
        tileY: 30,
        actionKind: 'BATTLE_TERMINAL'
      }
    ],
    landmarks: [
      {
        landmarkId: 'lm_elbaf_root_center',
        kind: 'WORLD_TREE_ROOT',
        tileX: 24,
        tileY: 20,
        widthTiles: 6,
        heightTiles: 3,
        label: '세계수 아담 뿌리 다리',
        hasOverheadPart: true
      },
      {
        landmarkId: 'lm_elbaf_root_west',
        kind: 'WORLD_TREE_ROOT',
        tileX: 13,
        tileY: 21,
        widthTiles: 5,
        heightTiles: 2,
        hasOverheadPart: true
      },
      {
        landmarkId: 'lm_elbaf_rune_1',
        kind: 'RUNE_MONOLITH',
        tileX: 7,
        tileY: 14,
        widthTiles: 2,
        heightTiles: 2,
        label: '룬 석비'
      },
      {
        landmarkId: 'lm_elbaf_rune_2',
        kind: 'RUNE_MONOLITH',
        tileX: 11,
        tileY: 14,
        widthTiles: 2,
        heightTiles: 2
      },
      {
        landmarkId: 'lm_elbaf_sunny',
        kind: 'SUNNY_DOCK',
        tileX: 18,
        tileY: 32,
        widthTiles: 3,
        heightTiles: 2
      },
      {
        landmarkId: 'lm_elbaf_board',
        kind: 'BOUNTY_BOARD',
        tileX: 35,
        tileY: 27,
        widthTiles: 1,
        heightTiles: 1
      }
    ],
    npcs,
    encounters: [{ ...origEnc, pos: tileCenter(27, 7) }],
    ambientProfile: { particles: ['GOLDEN_LEAF', 'LIGHTNING_SPARK'], density: 38 },
    lightingProfile: {
      defaultMood: 'DUSK',
      tintHex: '#eab308',
      tintAlpha: 0.1,
      sunbeams: true,
      lanterns: [
        { tileX: 8, tileY: 15, color: '#38bdf8', radiusPx: 52 },
        { tileX: 27, tileY: 21, color: '#facc15', radiusPx: 56 },
        { tileX: 27, tileY: 7, color: '#a855f7', radiusPx: 60 }
      ]
    },
    tileMap: g.toTileMap()
  };
}

export const NEW_WORLD_BUILDERS = {
  fishman_island: buildFishmanIsland,
  dressrosa: buildDressrosa,
  totto_land: buildTottoLand,
  elbaf: buildElbaf
};
