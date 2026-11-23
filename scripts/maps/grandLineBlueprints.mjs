import { GridCanvas, tileCenter } from './mapCanvasBuilder.mjs';

function buildDrumKingdom(orig) {
  const cols = 46;
  const rows = 36;
  const g = new GridCanvas(cols, rows, 'G', 'n');
  g.borderSolid('c');

  // Southern frozen sea & wooden ice harbor dock
  g.paintWaterRect(0, 32, cols, 4, true);
  g.paintRoad(20, 28, 6, 5, 'd', 'd');

  // Big Horn Village snow-packed town paths & cabins
  g.paintRoad(10, 25, 25, 3, 'p', 'n');
  g.paintRoad(21, 16, 4, 12, 'p', 'p');
  g.stampBuilding(10, 22, 5, 2, {
    label: '빅혼 마을 오두막',
    roofRows: 2,
    walkBehind: true
  });
  g.stampBuilding(29, 22, 5, 2, {
    label: '도르돈 수비대 초소',
    roofRows: 2,
    walkBehind: true
  });

  // Western pine forest canopy + secret snow rock path for chest 1
  g.paintRoad(3, 18, 7, 8, 'G', 'n');
  g.stampTreeCanopy(5, 21);
  g.stampTreeCanopy(8, 21);
  g.stampTreeCanopy(4, 24);
  g.stampTreeCanopy(7, 25);
  g.stampRockOrWall(2, 17, 2, 2, 'c');

  // Eastern frozen lake + shallow stepping rim + chest 2
  g.paintWaterRect(36, 19, 6, 5, true);
  g.paintShallowStepping(35, 19, 1, 5, 'q');
  g.paintRoad(35, 25, 8, 3, 'G', 'n');

  // Zigzag snowy mountain stone stairway up to Drum Castle
  g.paintRoad(14, 14, 13, 3, 'p', 'p');
  g.paintRoad(14, 10, 3, 5, 'p', 'p');
  g.paintRoad(14, 9, 14, 3, 'p', 'p');
  g.paintRoad(21, 6, 5, 4, 'p', 'p');

  // Northern Drum Rock Castle Courtyard + snowdrift walk-behind alley (row 2..3)
  g.paintRoad(14, 2, 18, 6, 'p', 'n');
  g.stampBuilding(19, 4, 8, 2, {
    label: '드럼 록 성',
    roofRows: 2,
    walkBehind: true
  });
  g.stampTreeCanopy(11, 7);
  g.stampTreeCanopy(35, 8);
  g.stampProps([[18, 17], [27, 17], [15, 28], [30, 28]], 'k', true);
  g.scatterDecor(2, 2, cols - 4, 28, ['f', 't', 'h'], 9, 401);

  const origNpc = orig.npcs[0];
  const origEnc = orig.encounters[0];

  const npcs = [
    {
      ...origNpc,
      pos: tileCenter(19, 14),
      facing: 'right',
      ambientBubbleText: '해적 깃발은 꺾이지 않는 신념이다!',
      patrolWaypoints: [tileCenter(17, 14), tileCenter(21, 14)],
      patrolSpeedPx: 40,
      pauseTicks: 85
    },
    {
      npcId: 'npc_dalton',
      name: '도르돈 수비대장',
      roleLabel: '빅혼 마을 수호자',
      pos: tileCenter(24, 25),
      interactRadiusPx: 46,
      visualScale: 1.05,
      color: '#facc15',
      facing: 'up',
      ambientBubbleText: '로프웨이를 타고 드럼 성으로 향하시오!',
      patrolWaypoints: [tileCenter(20, 25), tileCenter(27, 25)],
      patrolSpeedPx: 42,
      pauseTicks: 80,
      dialogueLines: [
        '도르돈: 빅혼 마을 사람들은 폭군 와포루가 돌아온 뒤로도 포기하지 않았소!',
        '서쪽 소나무 숲 뒤 설산 틈과 동쪽 얼음 호수 끝에도 보급품이 있소.'
      ]
    },
    {
      npcId: 'npc_bighorn_villager',
      name: '빅혼 마을 주민',
      roleLabel: '설산 목축민',
      pos: tileCenter(13, 25),
      interactRadiusPx: 44,
      visualScale: 0.95,
      color: '#cbd5e1',
      facing: 'right',
      ambientBubbleText: '히루루크의 벚꽃이 언젠가 필 거야!',
      patrolWaypoints: [tileCenter(11, 26), tileCenter(17, 26)],
      patrolSpeedPx: 38,
      pauseTicks: 75,
      dialogueLines: [
        '주민: 와포루를 몰아내면 이 하얀 설산에 기적의 분홍 벚꽃 눈이 날릴 거라는 전설이 있어!'
      ]
    },
    {
      npcId: 'npc_ropeway_eng',
      name: '로프웨이 정비사',
      roleLabel: '설산 케이블카 기술자',
      pos: tileCenter(26, 15),
      interactRadiusPx: 44,
      visualScale: 0.98,
      color: '#38bdf8',
      facing: 'left',
      ambientBubbleText: '지그재그 돌계단도 안전하게 정비했어!',
      patrolWaypoints: [tileCenter(25, 15), tileCenter(26, 18)],
      patrolSpeedPx: 36,
      pauseTicks: 80,
      dialogueLines: [
        '정비사: 케이블카 위쪽 계단을 따라 지그재그로 오르면 드럼 성 정문이 나옵니다.'
      ]
    },
    {
      npcId: 'npc_drum_herbalist',
      name: '설산 약초꾼',
      roleLabel: '잇시-20 출신 약초학자',
      pos: tileCenter(15, 11),
      interactRadiusPx: 44,
      visualScale: 0.96,
      color: '#ec4899',
      facing: 'right',
      ambientBubbleText: '성벽 아래 눈더미도 살펴보게!',
      patrolWaypoints: [tileCenter(15, 11), tileCenter(24, 11)],
      patrolSpeedPx: 40,
      pauseTicks: 75,
      dialogueLines: [
        '약초꾼: 닥터 쿠레하와 쵸파가 기다리고 있으니 어서 성 앞마당으로 가보게!'
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
    spawnPoint: tileCenter(23, 29),
    portExitZone: { pos: tileCenter(23, 31), radiusPx: 44 },
    battleTerminalPos: tileCenter(18, 29),
    obstacles: g.obstacles,
    laserBarriers: [],
    puzzleSwitches: [],
    giantProps: [],
    zones: [
      {
        zoneId: 'zone_drum_harbor',
        name: '얼어붙은 드럼 항구',
        subtitle: '겨울 섬 상륙 부두',
        tileX: 16,
        tileY: 27,
        tileW: 14,
        tileH: 6,
        accentColor: '#38bdf8'
      },
      {
        zoneId: 'zone_drum_bighorn',
        name: '눈 덮인 빅혼 마을',
        subtitle: '소나무 숲과 얼음 호수',
        tileX: 3,
        tileY: 18,
        tileW: 39,
        tileH: 10,
        accentColor: '#e2e8f0'
      },
      {
        zoneId: 'zone_drum_ropeway',
        name: '설산 로프웨이 & 돌계단',
        subtitle: '드럼 록 절벽 등반로',
        tileX: 13,
        tileY: 9,
        tileW: 16,
        tileH: 9,
        accentColor: '#facc15'
      },
      {
        zoneId: 'zone_drum_castle',
        name: '드럼 록 성 앞마당',
        subtitle: '히루루크의 신념 & 와포루 결전',
        tileX: 14,
        tileY: 2,
        tileW: 18,
        tileH: 7,
        accentColor: '#f472b6'
      }
    ],
    chests: [
      {
        chestId: 'chest_drum_pine_crevice',
        tileX: 4,
        tileY: 18,
        rarity: 'silver',
        hiddenHint: '소나무 숲 캐노피 뒤 설산 바위 틈',
        reward: { berries: 8000, trainingPoints: 16, itemLabel: '설산 약초 비상 상자' }
      },
      {
        chestId: 'chest_drum_frozen_lake',
        tileX: 42,
        tileY: 26,
        rarity: 'wooden',
        hiddenHint: '빅혼 마을 동쪽 얼음 호수 끝',
        reward: { berries: 6500, trainingPoints: 14, itemLabel: '얼어붙은 호수 보급품' }
      },
      {
        chestId: 'chest_drum_castle_snowdrift',
        tileX: 23,
        tileY: 2,
        rarity: 'gold',
        hiddenHint: '드럼 록 성벽 뒤 눈더미 골목',
        reward: {
          berries: 13000,
          trainingPoints: 22,
          healPartyRatio: 0.45,
          itemLabel: '히루루크의 벚꽃 약통'
        }
      }
    ],
    markers: [
      {
        markerId: 'marker_drum_port',
        kind: 'PORT_EXIT',
        label: '⚓ 얼음 항구 출항',
        tileX: 23,
        tileY: 31,
        actionKind: 'PORT_EXIT'
      },
      {
        markerId: 'marker_drum_chopper',
        kind: 'SIDE',
        label: '◆ 쿠레하 & 쵸파',
        tileX: 19,
        tileY: 14,
        hideWhenFlagSet: 'flag_drum_met_chopper',
        actionKind: 'STORY'
      },
      {
        markerId: 'marker_drum_wapol',
        kind: 'MAIN',
        label: '★ 폭군 와포루 결전',
        tileX: 23,
        tileY: 7,
        hideWhenFlagSet: 'flag_drum_kingdom_cleared',
        actionKind: 'STORY'
      },
      {
        markerId: 'marker_drum_camp',
        kind: 'ACTIVITY',
        label: '🏕 설산 수련 캠프',
        tileX: 28,
        tileY: 26,
        actionKind: 'CAMP_TRAINING'
      },
      {
        markerId: 'marker_drum_terminal',
        kind: 'ACTIVITY',
        label: '🌐 대전 단말기',
        tileX: 18,
        tileY: 29,
        actionKind: 'BATTLE_TERMINAL'
      }
    ],
    landmarks: [
      {
        landmarkId: 'lm_drum_ropeway',
        kind: 'ROPEWAY_TOWER',
        tileX: 21,
        tileY: 16,
        widthTiles: 4,
        heightTiles: 2,
        label: '설산 로프웨이',
        hasOverheadPart: true
      },
      {
        landmarkId: 'lm_drum_boat',
        kind: 'DOCKED_BOAT',
        tileX: 16,
        tileY: 30,
        widthTiles: 3,
        heightTiles: 2
      },
      {
        landmarkId: 'lm_drum_board',
        kind: 'BOUNTY_BOARD',
        tileX: 28,
        tileY: 25,
        widthTiles: 1,
        heightTiles: 1
      }
    ],
    npcs,
    encounters: [{ ...origEnc, pos: tileCenter(23, 7) }],
    ambientProfile: {
      particles: ['SNOW'],
      postClearParticles: ['PETAL', 'SNOW'],
      density: 34
    },
    lightingProfile: {
      defaultMood: 'DAY',
      tintHex: '#bae6fd',
      tintAlpha: 0.1,
      sunbeams: false,
      lanterns: [
        { tileX: 22, tileY: 15, color: '#fde047', radiusPx: 44 },
        { tileX: 23, tileY: 6, color: '#f472b6', radiusPx: 48 }
      ]
    },
    tileMap: g.toTileMap()
  };
}

function buildAlabasta(orig) {
  const cols = 50;
  const rows = 36;
  const g = new GridCanvas(cols, rows, 's', 's');
  g.borderSolid('c');

  // Southern Nanohana desert harbor
  g.paintWaterRect(0, 32, cols, 4, true);
  g.paintRoad(22, 28, 6, 5, 'd', 'd');

  // Desert roads linking Nanohana -> Bazaar (West) -> Oasis (East) -> Alubarna Stairs (North)
  g.paintRoad(23, 14, 5, 14, 'p', 'p');
  g.paintRoad(7, 22, 34, 3, 'p', 's');

  // Western Bazaar Market with overhead tent buildings & back alley
  g.stampBuilding(6, 19, 5, 2, {
    label: '나노하나 바자르 천막',
    roofRows: 2,
    walkBehind: true
  });
  g.stampBuilding(13, 19, 5, 2, {
    label: '향신료 상점 천막',
    roofRows: 2,
    walkBehind: true
  });
  g.paintRoad(5, 16, 14, 3, 's', 's');

  // Eastern Palm Oasis (water pool + stepping stones + palm canopies)
  g.paintWaterRect(34, 19, 8, 4, true);
  g.paintShallowStepping(33, 19, 1, 4, 'q');
  g.paintRoad(32, 16, 13, 3, 'G', 'g');
  g.stampTreeCanopy(34, 18);
  g.stampTreeCanopy(42, 18);
  g.stampTreeCanopy(44, 22);

  // SE Desert Ruin Pillars
  g.stampProps([[39, 27], [43, 27], [39, 30], [43, 30]], 'C', true);

  // Northern Alubarna Palace & Clock Tower Plaza
  g.paintRoad(13, 4, 25, 10, 'p', 'p');
  g.stampBuilding(21, 4, 9, 2, {
    label: '알루바르나 사암 궁전',
    roofRows: 2,
    walkBehind: true
  });
  g.stampProps([[15, 8], [15, 9]], 'C', false);
  g.stampTreeCanopy(35, 7);
  g.scatterDecor(2, 2, cols - 4, 29, ['f', 't', 'h'], 10, 402);

  const origNpc = orig.npcs[0];
  const origEnc = orig.encounters[0];

  const npcs = [
    {
      ...origNpc,
      pos: tileCenter(23, 13),
      facing: 'right',
      ambientBubbleText: '크로커다일은 물통 젖음 상태로 공략해!',
      patrolWaypoints: [tileCenter(21, 13), tileCenter(27, 13)],
      patrolSpeedPx: 40,
      pauseTicks: 85
    },
    {
      npcId: 'npc_cobra',
      name: '네펠타리 코브라 국왕',
      roleLabel: '알라바스타 제12대 국왕',
      pos: tileCenter(28, 11),
      interactRadiusPx: 46,
      visualScale: 1.04,
      color: '#eab308',
      facing: 'left',
      ambientBubbleText: '이 나라의 백성들과 비를 지켜주게!',
      patrolWaypoints: [tileCenter(28, 11), tileCenter(33, 11)],
      patrolSpeedPx: 36,
      pauseTicks: 90,
      dialogueLines: [
        '코브라: 나라라는 건 사람이다! 왕가의 무덤과 오아시스를 지키는 건 바로 우리 백성들이네.'
      ]
    },
    {
      npcId: 'npc_pell',
      name: '수호신 펠',
      roleLabel: '알라바스타 왕국 경비부대장',
      pos: tileCenter(19, 10),
      interactRadiusPx: 46,
      visualScale: 1.02,
      color: '#38bdf8',
      facing: 'down',
      ambientBubbleText: '시계탑 뒤쪽까지 경계 이상 무!',
      patrolWaypoints: [tileCenter(19, 9), tileCenter(19, 12)],
      patrolSpeedPx: 44,
      pauseTicks: 75,
      dialogueLines: [
        '펠: 알루바르나 시계탑 기둥 뒤와 궁전 계단에 숨겨진 왕실 비상 보급품도 확인해 주시오!'
      ]
    },
    {
      npcId: 'npc_chaka',
      name: '호위대장 차카',
      roleLabel: '알루바르나 성문 경비대',
      pos: tileCenter(26, 23),
      interactRadiusPx: 44,
      visualScale: 1.0,
      color: '#a855f7',
      facing: 'left',
      ambientBubbleText: '동쪽 오아시스에서 갈증을 풀 수 있어.',
      patrolWaypoints: [tileCenter(25, 23), tileCenter(31, 23)],
      patrolSpeedPx: 42,
      pauseTicks: 75,
      dialogueLines: [
        '차카: 바로크 워크스의 음모를 부수고 궁전 광장을 되찾읍시다!'
      ]
    },
    {
      npcId: 'npc_bazaar_trader',
      name: '바자르 향신료 상인',
      roleLabel: '나노하나 시장 상인',
      pos: tileCenter(10, 23),
      interactRadiusPx: 44,
      visualScale: 0.96,
      color: '#f97316',
      facing: 'up',
      ambientBubbleText: '천막 뒷골목 그늘이 시원하지!',
      patrolWaypoints: [tileCenter(8, 23), tileCenter(15, 23)],
      patrolSpeedPx: 38,
      pauseTicks: 80,
      dialogueLines: [
        '상인: 천막 뒤쪽 그늘 골목으로 들어가면 밀수꾼들이 숨겨둔 상자를 찾을지도 몰라!'
      ]
    },
    {
      npcId: 'npc_alabasta_guard',
      name: '사막 순찰병',
      roleLabel: '오아시스 정찰대',
      pos: tileCenter(36, 26),
      interactRadiusPx: 44,
      visualScale: 0.98,
      color: '#fbbf24',
      facing: 'left',
      ambientBubbleText: '남동쪽 사암 유적 기둥 사이를 조심해.',
      patrolWaypoints: [tileCenter(35, 26), tileCenter(38, 26)],
      patrolSpeedPx: 40,
      pauseTicks: 75,
      dialogueLines: [
        '순찰병: 모래폭풍이 몰아치고 있으니 오아시스 야자수 옆에서 숨을 고르게!'
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
    spawnPoint: tileCenter(25, 29),
    portExitZone: { pos: tileCenter(25, 31), radiusPx: 44 },
    battleTerminalPos: tileCenter(20, 29),
    obstacles: g.obstacles,
    laserBarriers: [],
    puzzleSwitches: [],
    giantProps: [],
    zones: [
      {
        zoneId: 'zone_alabasta_nanohana',
        name: '나노하나 사막 항구',
        subtitle: '알라바스타 출입 관문',
        tileX: 18,
        tileY: 26,
        tileW: 15,
        tileH: 6,
        accentColor: '#f59e0b'
      },
      {
        zoneId: 'zone_alabasta_bazaar',
        name: '바자르 천막 시장',
        subtitle: '향신료와 사막 상점가',
        tileX: 4,
        tileY: 16,
        tileW: 16,
        tileH: 9,
        accentColor: '#fb923c'
      },
      {
        zoneId: 'zone_alabasta_oasis',
        name: '야자수 오아시스 & 유적',
        subtitle: '사막 속 생명의 샘',
        tileX: 31,
        tileY: 16,
        tileW: 16,
        tileH: 15,
        accentColor: '#22c55e'
      },
      {
        zoneId: 'zone_alabasta_alubarna',
        name: '알루바르나 사암 궁전 & 시계탑',
        subtitle: '칠무해 크로커다일 결전지',
        tileX: 13,
        tileY: 3,
        tileW: 25,
        tileH: 12,
        accentColor: '#facc15'
      }
    ],
    chests: [
      {
        chestId: 'chest_alabasta_oasis_palm',
        tileX: 43,
        tileY: 16,
        rarity: 'silver',
        hiddenHint: '오아시스 야자수 캐노피 뒤편 그늘',
        reward: { berries: 10000, trainingPoints: 18, itemLabel: '오아시스 정화수 보물' }
      },
      {
        chestId: 'chest_alabasta_bazaar_alley',
        tileX: 9,
        tileY: 17,
        rarity: 'wooden',
        hiddenHint: '바자르 천막 오버헤드 뒤 뒷골목',
        reward: { berries: 8500, trainingPoints: 15, itemLabel: '나노하나 향신료 금고' }
      },
      {
        chestId: 'chest_alabasta_clock_tower',
        tileX: 16,
        tileY: 6,
        rarity: 'gold',
        hiddenHint: '알루바르나 시계탑 기둥 뒤',
        reward: {
          berries: 15000,
          trainingPoints: 24,
          healPartyRatio: 0.45,
          itemLabel: '네펠타리 왕실 성배'
        }
      },
      {
        chestId: 'chest_alabasta_se_ruins',
        tileX: 41,
        tileY: 28,
        rarity: 'silver',
        hiddenHint: '사막 남동쪽 사암 유적 기둥 사이',
        reward: { berries: 11000, trainingPoints: 20, itemLabel: '고대 플루톤 탐사 유물' }
      }
    ],
    markers: [
      {
        markerId: 'marker_alabasta_port',
        kind: 'PORT_EXIT',
        label: '⚓ 나노하나 출항 부두',
        tileX: 25,
        tileY: 31,
        actionKind: 'PORT_EXIT'
      },
      {
        markerId: 'marker_alabasta_vivi',
        kind: 'SIDE',
        label: '◆ 왕녀 비비 & 석비',
        tileX: 23,
        tileY: 13,
        hideWhenFlagSet: 'flag_alabasta_water_hint',
        actionKind: 'STORY'
      },
      {
        markerId: 'marker_alabasta_croc',
        kind: 'MAIN',
        label: '★ 크로커다일 결전',
        tileX: 25,
        tileY: 8,
        hideWhenFlagSet: 'flag_alabasta_cleared',
        actionKind: 'STORY'
      },
      {
        markerId: 'marker_alabasta_bounty',
        kind: 'ACTIVITY',
        label: '📋 왕국 현상금 게시판',
        tileX: 21,
        tileY: 24,
        actionKind: 'BOUNTY_BOARD'
      },
      {
        markerId: 'marker_alabasta_terminal',
        kind: 'ACTIVITY',
        label: '🌐 대전 단말기',
        tileX: 20,
        tileY: 29,
        actionKind: 'BATTLE_TERMINAL'
      }
    ],
    landmarks: [
      {
        landmarkId: 'lm_alabasta_clock',
        kind: 'CLOCK_TOWER',
        tileX: 16,
        tileY: 7,
        widthTiles: 2,
        heightTiles: 3,
        label: '시계탑'
      },
      {
        landmarkId: 'lm_alabasta_boat',
        kind: 'DOCKED_BOAT',
        tileX: 18,
        tileY: 30,
        widthTiles: 3,
        heightTiles: 2
      },
      {
        landmarkId: 'lm_alabasta_board',
        kind: 'BOUNTY_BOARD',
        tileX: 21,
        tileY: 23,
        widthTiles: 1,
        heightTiles: 1
      }
    ],
    npcs,
    encounters: [{ ...origEnc, pos: tileCenter(25, 8) }],
    ambientProfile: { particles: ['SAND'], density: 36 },
    lightingProfile: {
      defaultMood: 'DAY',
      tintHex: '#f59e0b',
      tintAlpha: 0.1,
      sunbeams: true,
      lanterns: [
        { tileX: 17, tileY: 11, color: '#fbbf24', radiusPx: 44 },
        { tileX: 37, tileY: 18, color: '#38bdf8', radiusPx: 42 }
      ]
    },
    tileMap: g.toTileMap()
  };
}

function buildSkypiea(orig) {
  const cols = 50;
  const rows = 36;
  const g = new GridCanvas(cols, rows, 'G', 'g');
  g.borderSolid('c');

  // Southern White-White Sea cloud pier (zero yellow sand!)
  g.paintWaterRect(0, 32, cols, 4, true);
  g.paintRoad(22, 28, 6, 5, 'd', 'd');

  // Main cloud roads: Pier -> Angel Beach (SE) & Cloud Forest (W) -> Beanstalk Arch -> Shandora
  g.paintRoad(22, 14, 6, 14, 'p', 'p');
  g.paintRoad(28, 25, 17, 4, 'p', 'p');
  g.paintRoad(6, 20, 16, 4, 'p', 'p');

  // West Cloud Forest canopies + hidden trail
  g.paintRoad(4, 16, 12, 4, 'G', 'g');
  g.stampTreeCanopy(6, 19);
  g.stampTreeCanopy(10, 19);
  g.stampTreeCanopy(8, 24);
  g.stampTreeCanopy(13, 24);

  // SE Angel Beach Cloud Cape & Palms
  g.stampTreeCanopy(34, 24);
  g.stampTreeCanopy(40, 24);
  g.stampBuilding(31, 22, 4, 2, {
    label: '엔젤 비치 오두막',
    roofRows: 2,
    walkBehind: true
  });

  // Central Upper Yard Giant Beanstalk Arch (walk-under overhead) + secret trail behind root
  g.stampArchOverhead(22, 16, 6, 3, 'O', 'c');
  g.paintRoad(17, 13, 5, 4, 'g', 'g');
  g.stampTreeCanopy(19, 15);

  // Northern Shandora Golden Ruins & Bell Courtyard
  g.paintRoad(13, 4, 25, 9, 'p', 'p');
  g.stampBuilding(14, 5, 6, 2, {
    label: '샨도라 황금 유적 신전',
    roofRows: 2,
    walkBehind: true
  });
  g.stampProps([[34, 5], [37, 5], [34, 8], [37, 8]], 'C', true);
  g.scatterDecor(2, 2, cols - 4, 29, ['f', 'F', 't', 'T'], 7, 403);

  const origNpc = orig.npcs[0];
  const origEnc = orig.encounters[0];
  const origGiant = orig.giantProps[0];

  const npcs = [
    {
      ...origNpc,
      pos: tileCenter(21, 21),
      facing: 'right',
      ambientBubbleText: '고무 신체라면 번개를 이길 수 있어!',
      patrolWaypoints: [tileCenter(19, 21), tileCenter(23, 21)],
      patrolSpeedPx: 42,
      pauseTicks: 80
    },
    {
      npcId: 'npc_conis',
      name: '엔젤 아일랜드 코니스',
      roleLabel: '하늘섬 안내인 (헤소!)',
      pos: tileCenter(27, 26),
      interactRadiusPx: 46,
      visualScale: 0.96,
      color: '#bae6fd',
      facing: 'left',
      ambientBubbleText: '헤소! 백백해에 오신 걸 환영해요!',
      patrolWaypoints: [tileCenter(27, 26), tileCenter(33, 26)],
      patrolSpeedPx: 40,
      pauseTicks: 75,
      dialogueLines: [
        '코니스: 엔젤 비치 끝 곶과 구름 숲 캐노피 뒤에도 고대 하늘섬 유물이 잠들어 있답니다!'
      ]
    },
    {
      npcId: 'npc_pagaya',
      name: '발명가 파가야',
      roleLabel: '다이얼 장인',
      pos: tileCenter(36, 27),
      interactRadiusPx: 44,
      visualScale: 0.95,
      color: '#94a3b8',
      facing: 'up',
      ambientBubbleText: '웨이버와 다이얼을 정비 중입니다!',
      patrolWaypoints: [tileCenter(36, 27), tileCenter(42, 27)],
      patrolSpeedPx: 38,
      pauseTicks: 80,
      dialogueLines: [
        '파가야: 어퍼 야드의 거대 콩줄기 아치를 지나 북쪽으로 오르면 샨도라 황금 유적이 나옵니다.'
      ]
    },
    {
      npcId: 'npc_gan_fall',
      name: '하늘의 기사 간 폴',
      roleLabel: '전(前) 스카이피아 신',
      pos: tileCenter(20, 12),
      interactRadiusPx: 46,
      visualScale: 1.04,
      color: '#e2e8f0',
      facing: 'right',
      ambientBubbleText: '황금종을 울려 400년의 약속을 끝내다오!',
      patrolWaypoints: [tileCenter(19, 12), tileCenter(24, 12)],
      patrolSpeedPx: 38,
      pauseTicks: 85,
      dialogueLines: [
        '간 폴: 갓 에넬의 만트라는 막강하지만 청해인의 고무 몸은 하늘의 번개조차 뚫을 걸세!'
      ]
    },
    {
      npcId: 'npc_shandia_warrior',
      name: '샨디아 전사 브라함',
      roleLabel: '어퍼 야드 수호전사',
      pos: tileCenter(12, 21),
      interactRadiusPx: 44,
      visualScale: 1.0,
      color: '#f97316',
      facing: 'left',
      ambientBubbleText: '콩줄기 뿌리 뒤쪽 비밀 길을 알아?',
      patrolWaypoints: [tileCenter(11, 21), tileCenter(16, 21)],
      patrolSpeedPx: 42,
      pauseTicks: 75,
      dialogueLines: [
        '전사: 조상 칼가라의 자존심이 담긴 황금종이 드디어 울릴 날이 왔군!'
      ]
    },
    {
      npcId: 'npc_sky_angler',
      name: '구름 낚시꾼',
      roleLabel: '백해 어부',
      pos: tileCenter(29, 9),
      interactRadiusPx: 44,
      visualScale: 0.96,
      color: '#facc15',
      facing: 'down',
      ambientBubbleText: '황금종 아래 빛이 너무 눈부셔!',
      patrolWaypoints: [tileCenter(28, 9), tileCenter(33, 9)],
      patrolSpeedPx: 36,
      pauseTicks: 85,
      dialogueLines: [
        '낚시꾼: 동쪽 유적 석조 기둥 뒤편에도 반짝이는 황금 상자가 보였어!'
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
    spawnPoint: tileCenter(25, 29),
    portExitZone: { pos: tileCenter(25, 31), radiusPx: 44 },
    battleTerminalPos: tileCenter(20, 29),
    obstacles: g.obstacles,
    laserBarriers: [],
    puzzleSwitches: [],
    giantProps: [
      {
        ...origGiant,
        pos: tileCenter(32, 5)
      }
    ],
    zones: [
      {
        zoneId: 'zone_sky_dock',
        name: '백백해 구름 부두',
        subtitle: '하늘섬 1만 미터 상륙 지점',
        tileX: 18,
        tileY: 26,
        tileW: 14,
        tileH: 6,
        accentColor: '#bae6fd'
      },
      {
        zoneId: 'zone_sky_angel_beach',
        name: '엔젤 비치 & 구름 숲',
        subtitle: '하얀 구름 해변과 다이얼 마을',
        tileX: 29,
        tileY: 20,
        tileW: 19,
        tileH: 11,
        accentColor: '#38bdf8'
      },
      {
        zoneId: 'zone_sky_beanstalk',
        name: '어퍼 야드 거대 콩줄기 아치',
        subtitle: '신역으로 이어지는 거목 통로',
        tileX: 16,
        tileY: 13,
        tileW: 16,
        tileH: 9,
        accentColor: '#4ade80'
      },
      {
        zoneId: 'zone_sky_shandora',
        name: '샨도라 황금 유적 & 황금종',
        subtitle: '갓 에넬 최종 결전지',
        tileX: 13,
        tileY: 3,
        tileW: 26,
        tileH: 10,
        accentColor: '#facc15'
      }
    ],
    chests: [
      {
        chestId: 'chest_skypiea_beanstalk_root',
        tileX: 18,
        tileY: 14,
        rarity: 'gold',
        hiddenHint: '거대 콩줄기 뿌리 오버헤드 뒤 비밀 길',
        reward: {
          berries: 15000,
          trainingPoints: 24,
          healPartyRatio: 0.45,
          itemLabel: '샨도라 순금 다이얼 보물'
        }
      },
      {
        chestId: 'chest_skypiea_cloud_forest',
        tileX: 6,
        tileY: 17,
        rarity: 'silver',
        hiddenHint: '서쪽 구름 숲 캐노피 뒤편',
        reward: { berries: 11000, trainingPoints: 18, itemLabel: '어퍼 야드 비술 상자' }
      },
      {
        chestId: 'chest_skypiea_ruin_pillars',
        tileX: 35,
        tileY: 6,
        rarity: 'silver',
        hiddenHint: '샨도라 유적 석조 기둥 뒤',
        reward: { berries: 12000, trainingPoints: 20, itemLabel: '황금 도시의 촛대 유물' }
      },
      {
        chestId: 'chest_skypiea_angel_cape',
        tileX: 45,
        tileY: 27,
        rarity: 'wooden',
        hiddenHint: '엔젤 비치 동쪽 끝 구름 곶',
        reward: { berries: 8000, trainingPoints: 15, itemLabel: '구름 조개 비상 보급' }
      }
    ],
    markers: [
      {
        markerId: 'marker_sky_port',
        kind: 'PORT_EXIT',
        label: '⚓ 구름 부두 출항',
        tileX: 25,
        tileY: 31,
        actionKind: 'PORT_EXIT'
      },
      {
        markerId: 'marker_sky_wyper',
        kind: 'SIDE',
        label: '◆ 전사 와이퍼',
        tileX: 21,
        tileY: 21,
        hideWhenFlagSet: 'flag_skypiea_bell_oath',
        actionKind: 'STORY'
      },
      {
        markerId: 'marker_sky_enel',
        kind: 'MAIN',
        label: '★ 갓 에넬 결전',
        tileX: 25,
        tileY: 8,
        hideWhenFlagSet: 'flag_skypiea_cleared',
        actionKind: 'STORY'
      },
      {
        markerId: 'marker_sky_camp',
        kind: 'ACTIVITY',
        label: '🏕 구름 수련 캠프',
        tileX: 11,
        tileY: 22,
        actionKind: 'CAMP_TRAINING'
      },
      {
        markerId: 'marker_sky_terminal',
        kind: 'ACTIVITY',
        label: '🌐 대전 단말기',
        tileX: 20,
        tileY: 29,
        actionKind: 'BATTLE_TERMINAL'
      }
    ],
    landmarks: [
      {
        landmarkId: 'lm_sky_beanstalk',
        kind: 'BEANSTALK_ARCH',
        tileX: 22,
        tileY: 16,
        widthTiles: 6,
        heightTiles: 3,
        label: '거대 콩줄기 아치',
        hasOverheadPart: true
      },
      {
        landmarkId: 'lm_sky_bell',
        kind: 'GOLDEN_BELL',
        tileX: 24,
        tileY: 4,
        widthTiles: 3,
        heightTiles: 3,
        label: '샨도라 황금종'
      },
      {
        landmarkId: 'lm_sky_boat',
        kind: 'DOCKED_BOAT',
        tileX: 17,
        tileY: 30,
        widthTiles: 3,
        heightTiles: 2
      },
      {
        landmarkId: 'lm_sky_board',
        kind: 'BOUNTY_BOARD',
        tileX: 11,
        tileY: 21,
        widthTiles: 1,
        heightTiles: 1
      }
    ],
    npcs,
    encounters: [{ ...origEnc, pos: tileCenter(25, 8) }],
    ambientProfile: { particles: ['CLOUD_MIST', 'LANTERN_MOTE'], density: 34 },
    lightingProfile: {
      defaultMood: 'DAY',
      tintHex: '#e0f2fe',
      tintAlpha: 0.07,
      sunbeams: true,
      lanterns: [
        { tileX: 25, tileY: 6, color: '#facc15', radiusPx: 54 },
        { tileX: 25, tileY: 17, color: '#4ade80', radiusPx: 44 }
      ]
    },
    tileMap: g.toTileMap()
  };
}

function buildThrillerBark(orig) {
  const cols = 48;
  const rows = 36;
  const g = new GridCanvas(cols, rows, 'G', 'g');
  g.borderSolid('c');

  // Haunted fog sea & giant ghost ship entrance pier
  g.paintWaterRect(0, 32, cols, 4, true);
  g.paintRoad(21, 28, 6, 5, 'd', 'd');

  // Misty Graveyard forest paths (south-central)
  g.paintRoad(21, 15, 6, 13, 'p', 'p');
  g.paintRoad(6, 21, 35, 3, 'p', 'g');
  g.paintRoad(3, 18, 6, 6, 'G', 'g');

  // Twisted spooky canopy trees & gravestones
  g.stampTreeCanopy(6, 20);
  g.stampTreeCanopy(10, 20);
  g.stampTreeCanopy(7, 25);
  g.stampTreeCanopy(38, 20);
  g.stampTreeCanopy(41, 20);
  g.stampTreeCanopy(39, 25);
  g.stampProps([[13, 19], [16, 19], [13, 25], [32, 19], [35, 19], [4, 23]], 'k', true);

  // Moat water & Stone Bridge (rows 13..14)
  g.paintWaterRect(1, 13, 20, 2, true);
  g.paintWaterRect(27, 13, 20, 2, true);
  g.paintRoad(21, 12, 6, 4, 'p', 'p');

  // Gothic Mansion Courtyard + Mast Plaza + East Ruined Arch
  g.paintRoad(12, 3, 26, 9, 'p', 'p');
  g.stampBuilding(19, 4, 10, 2, {
    label: '호그백 고딕 대저택',
    roofRows: 2,
    walkBehind: true
  });
  g.stampArchOverhead(34, 6, 5, 2, 'r', 'C');
  g.scatterDecor(2, 2, cols - 4, 29, ['t', 'h', 'j'], 9, 404);

  const origNpc = orig.npcs[0];
  const origEnc = orig.encounters[0];

  const npcs = [
    {
      ...origNpc,
      pos: tileCenter(23, 20),
      facing: 'down',
      ambientBubbleText: '요호호호! 내 그림자를 되찾아 주세요!',
      patrolWaypoints: [tileCenter(22, 20), tileCenter(26, 20)],
      patrolSpeedPx: 42,
      pauseTicks: 80
    },
    {
      npcId: 'npc_lola',
      name: '구혼자 로라',
      roleLabel: '롤링 해적단 선장',
      pos: tileCenter(14, 22),
      interactRadiusPx: 46,
      visualScale: 1.02,
      color: '#f472b6',
      facing: 'right',
      ambientBubbleText: '저와 결혼해 주시겠어요?!',
      patrolWaypoints: [tileCenter(12, 22), tileCenter(18, 22)],
      patrolSpeedPx: 40,
      pauseTicks: 75,
      dialogueLines: [
        '로라: 햇빛이 들기 전에 모리아를 쓰러뜨리지 않으면 그림자를 빼앗긴 자들이 재가 되어버려!'
      ]
    },
    {
      npcId: 'npc_thriller_victim',
      name: '그림자 잃은 선장',
      roleLabel: '안개 묘지 생존자',
      pos: tileCenter(31, 22),
      interactRadiusPx: 44,
      visualScale: 0.96,
      color: '#94a3b8',
      facing: 'left',
      ambientBubbleText: '동쪽 뒤틀린 숲 뒤에 숨을 데가 있어.',
      patrolWaypoints: [tileCenter(29, 22), tileCenter(35, 22)],
      patrolSpeedPx: 38,
      pauseTicks: 80,
      dialogueLines: [
        '선장: 묘지 서쪽 비석 사이 길과 동쪽 나무 뒤편에도 아직 건지지 못한 유령선 보물이 남아 있네.'
      ]
    },
    {
      npcId: 'npc_grave_watcher',
      name: '묘지 안내인',
      roleLabel: '마의 삼각지대 목격자',
      pos: tileCenter(24, 15),
      interactRadiusPx: 44,
      visualScale: 0.95,
      color: '#a855f7',
      facing: 'up',
      ambientBubbleText: '돌다리를 건너면 모리아의 저택이야.',
      patrolWaypoints: [tileCenter(22, 15), tileCenter(26, 15)],
      patrolSpeedPx: 36,
      pauseTicks: 85,
      dialogueLines: [
        '안내인: 해자를 가로지르는 돌다리 너머 거대한 마스트 광장에 칠무해 겟코 모리아가 기다립니다!'
      ]
    },
    {
      npcId: 'npc_thriller_scout',
      name: '유령선 정찰대',
      roleLabel: '롤링 해적단 동료',
      pos: tileCenter(16, 10),
      interactRadiusPx: 44,
      visualScale: 0.98,
      color: '#38bdf8',
      facing: 'right',
      ambientBubbleText: '저택 동쪽 폐허 아치 뒤도 확인해 봐!',
      patrolWaypoints: [tileCenter(14, 10), tileCenter(18, 10)],
      patrolSpeedPx: 40,
      pauseTicks: 75,
      dialogueLines: [
        '정찰대: 모리아의 도펠맨과 섀도즈 아스가르드는 정면 화력으로 밀어붙여 해제해야 합니다!'
      ]
    }
  ];

  return {
    islandId: orig.islandId,
    name: orig.name,
    episodeId: orig.episodeId,
    width: cols * 32,
    height: rows * 32,
    theme: 'ONIGASHIMA_DOME',
    spawnPoint: tileCenter(24, 29),
    portExitZone: { pos: tileCenter(24, 31), radiusPx: 44 },
    battleTerminalPos: tileCenter(19, 29),
    obstacles: g.obstacles,
    laserBarriers: [],
    puzzleSwitches: [],
    giantProps: [],
    zones: [
      {
        zoneId: 'zone_tb_dock',
        name: '유령선 거대 입구 부두',
        subtitle: '플로리안 트라이앵글 선착장',
        tileX: 17,
        tileY: 26,
        tileW: 14,
        tileH: 6,
        accentColor: '#a855f7'
      },
      {
        zoneId: 'zone_tb_graveyard',
        name: '안개 낀 묘지 숲',
        subtitle: '좀비와 비석의 음산한 숲길',
        tileX: 3,
        tileY: 16,
        tileW: 41,
        tileH: 10,
        accentColor: '#94a3b8'
      },
      {
        zoneId: 'zone_tb_bridge',
        name: '성벽 해자 돌다리',
        subtitle: '고딕 저택 진입 관문',
        tileX: 19,
        tileY: 12,
        tileW: 10,
        tileH: 4,
        accentColor: '#38bdf8'
      },
      {
        zoneId: 'zone_tb_mansion',
        name: '고딕 대저택 & 마스트 광장',
        subtitle: '겟코 모리아 결전지',
        tileX: 12,
        tileY: 3,
        tileW: 27,
        tileH: 9,
        accentColor: '#c084fc'
      }
    ],
    chests: [
      {
        chestId: 'chest_thriller_west_graves',
        tileX: 4,
        tileY: 19,
        rarity: 'silver',
        hiddenHint: '묘지 서쪽 비석과 뒤틀린 나무 사이 길',
        reward: { berries: 12000, trainingPoints: 20, itemLabel: '소금 탄환 비상 주머니' }
      },
      {
        chestId: 'chest_thriller_twisted_trees',
        tileX: 39,
        tileY: 18,
        rarity: 'wooden',
        hiddenHint: '동쪽 뒤틀린 나무 숲 캐노피 뒤편',
        reward: { berries: 9500, trainingPoints: 16, itemLabel: '유령선 은화 상자' }
      },
      {
        chestId: 'chest_thriller_east_arch',
        tileX: 36,
        tileY: 4,
        rarity: 'gold',
        hiddenHint: '고딕 대저택 동쪽 폐허 아치 오버헤드 뒤편',
        reward: {
          berries: 18000,
          trainingPoints: 26,
          healPartyRatio: 0.45,
          itemLabel: '페로나의 보물 창고 열쇠'
        }
      }
    ],
    markers: [
      {
        markerId: 'marker_tb_port',
        kind: 'PORT_EXIT',
        label: '⚓ 유령선 입구 출항',
        tileX: 24,
        tileY: 31,
        actionKind: 'PORT_EXIT'
      },
      {
        markerId: 'marker_tb_brook',
        kind: 'SIDE',
        label: '◆ 콧노래의 브룩',
        tileX: 23,
        tileY: 20,
        hideWhenFlagSet: 'flag_thriller_met_brook',
        actionKind: 'STORY'
      },
      {
        markerId: 'marker_tb_moria',
        kind: 'MAIN',
        label: '★ 겟코 모리아 결전',
        tileX: 24,
        tileY: 8,
        hideWhenFlagSet: 'flag_thriller_bark_cleared',
        actionKind: 'STORY'
      },
      {
        markerId: 'marker_tb_camp',
        kind: 'ACTIVITY',
        label: '📋 롤링 해적단 캠프',
        tileX: 31,
        tileY: 26,
        actionKind: 'CAMP_TRAINING'
      },
      {
        markerId: 'marker_tb_terminal',
        kind: 'ACTIVITY',
        label: '🌐 대전 단말기',
        tileX: 19,
        tileY: 29,
        actionKind: 'BATTLE_TERMINAL'
      }
    ],
    landmarks: [
      {
        landmarkId: 'lm_tb_mast',
        kind: 'GOTHIC_MAST',
        tileX: 13,
        tileY: 5,
        widthTiles: 3,
        heightTiles: 3,
        label: '고딕 대마스트',
        hasOverheadPart: true
      },
      {
        landmarkId: 'lm_tb_boat',
        kind: 'DOCKED_BOAT',
        tileX: 17,
        tileY: 30,
        widthTiles: 3,
        heightTiles: 2
      },
      {
        landmarkId: 'lm_tb_board',
        kind: 'BOUNTY_BOARD',
        tileX: 31,
        tileY: 25,
        widthTiles: 1,
        heightTiles: 1
      }
    ],
    npcs,
    encounters: [{ ...origEnc, pos: tileCenter(24, 8) }],
    ambientProfile: { particles: ['CLOUD_MIST', 'BAT'], density: 36 },
    lightingProfile: {
      defaultMood: 'NIGHT',
      tintHex: '#1e1b4b',
      tintAlpha: 0.3,
      sunbeams: false,
      lanterns: [
        { tileX: 22, tileY: 14, color: '#c084fc', radiusPx: 50 },
        { tileX: 26, tileY: 14, color: '#c084fc', radiusPx: 50 },
        { tileX: 24, tileY: 7, color: '#a855f7', radiusPx: 58 }
      ]
    },
    tileMap: g.toTileMap()
  };
}

function buildMarineford(orig) {
  const cols = 52;
  const rows = 36;
  const g = new GridCanvas(cols, rows, 'G', 'n');
  g.borderSolid('c');

  // Crescent frozen bay & shallow ice bridge to warship decks
  g.paintWaterRect(0, 29, 14, 7, true);
  g.paintWaterRect(38, 29, 14, 7, true);
  g.paintWaterRect(14, 32, 24, 4, true);
  g.paintRoad(23, 27, 6, 5, 'd', 'd');
  // Walkable frozen ice shelf connecting to western/eastern warship decks
  g.paintRoad(3, 23, 46, 5, 'p', 'n');
  g.paintRoad(3, 23, 9, 3, 'd', 'd');
  g.paintRoad(40, 23, 9, 3, 'd', 'd');

  // Cannon Ramparts (row 18..19) with wide central breach (cols 21..30) and walk-behind supply corridor
  g.stampBuilding(6, 18, 12, 2, {
    label: '서쪽 포대 방벽',
    roofRows: 2,
    walkBehind: true
  });
  g.stampBuilding(34, 18, 12, 2, {
    label: '동쪽 포대 방벽',
    roofRows: 2,
    walkBehind: true
  });
  g.paintRoad(6, 16, 40, 2, 'p', 'n');

  // Central Oris Plaza Battleground & Ice Pillars alcove (east)
  g.paintRoad(13, 8, 26, 15, 'p', 'p');
  g.paintRoad(39, 11, 7, 5, 'p', 'n');
  g.stampProps([[40, 11], [44, 11], [40, 15]], 'C', true);

  // Northern Marine HQ Fortress & Execution Scaffold Stairs
  g.paintRoad(14, 3, 24, 6, 'p', 'p');
  g.stampBuilding(14, 4, 7, 2, {
    label: '해군본부 서부 요새',
    roofRows: 2,
    walkBehind: true
  });
  g.stampProps([[16, 22], [35, 22], [15, 11], [36, 11]], 'k', true);
  g.scatterDecor(2, 2, cols - 4, 27, ['h', 'j'], 12, 405);

  const origNpc = orig.npcs[0];
  const origEnc = orig.encounters[0];
  const origGiant = orig.giantProps[0];

  const npcs = [
    {
      ...origNpc,
      pos: tileCenter(23, 21),
      facing: 'up',
      ambientBubbleText: '정상전쟁 3연전, 내가 함께 싸운다 요이!',
      patrolWaypoints: [tileCenter(21, 21), tileCenter(26, 21)],
      patrolSpeedPx: 44,
      pauseTicks: 80
    },
    {
      npcId: 'npc_jozu',
      name: '다이아몬드 죠즈',
      roleLabel: '흰 수염 해적단 3번대 대장',
      pos: tileCenter(18, 14),
      interactRadiusPx: 46,
      visualScale: 1.12,
      color: '#38bdf8',
      facing: 'right',
      ambientBubbleText: '빙산이든 포격이든 내가 막아낸다!',
      patrolWaypoints: [tileCenter(16, 14), tileCenter(21, 14)],
      patrolSpeedPx: 38,
      pauseTicks: 85,
      dialogueLines: [
        '죠즈: 광장 동쪽 부서진 얼음 기둥 뒤와 서쪽 포대 방벽 뒤 보급고도 확보해 두었네!'
      ]
    },
    {
      npcId: 'npc_vista',
      name: '화검의 비스타',
      roleLabel: '흰 수염 해적단 5번대 대장',
      pos: tileCenter(31, 14),
      interactRadiusPx: 46,
      visualScale: 1.04,
      color: '#fb7185',
      facing: 'left',
      ambientBubbleText: '오리스 광장 돌파구를 확보했다!',
      patrolWaypoints: [tileCenter(28, 14), tileCenter(34, 14)],
      patrolSpeedPx: 42,
      pauseTicks: 75,
      dialogueLines: [
        '비스타: 앞에는 해군 삼대장과 검은 수염 티치까지 버티고 있네. 각오를 다지고 처형대 계단으로!'
      ]
    },
    {
      npcId: 'npc_ivankov',
      name: '엠포리오 이반코프',
      roleLabel: '혁명군 간부 · 임펠 다운 탈옥 동맹',
      pos: tileCenter(14, 24),
      interactRadiusPx: 46,
      visualScale: 1.05,
      color: '#ec4899',
      facing: 'right',
      ambientBubbleText: '히~하!! 기적은 포기하지 않는 녀석 머리 위에!',
      patrolWaypoints: [tileCenter(10, 24), tileCenter(18, 24)],
      patrolSpeedPx: 44,
      pauseTicks: 75,
      dialogueLines: [
        '이반코프: 서쪽 정박 군함 갑판 끝에도 우리가 챙긴 텐션 호르몬 보급 상자가 있어!'
      ]
    },
    {
      npcId: 'npc_wb_captain',
      name: '스쿼드 함대 선장',
      roleLabel: '신세계 산하 해적단',
      pos: tileCenter(35, 24),
      interactRadiusPx: 44,
      visualScale: 1.0,
      color: '#facc15',
      facing: 'left',
      ambientBubbleText: '포대 방벽 돌파구를 뚫어라!',
      patrolWaypoints: [tileCenter(32, 24), tileCenter(39, 24)],
      patrolSpeedPx: 42,
      pauseTicks: 75,
      dialogueLines: [
        '선장: 포연과 얼음 파편이 쏟아지지만 절대 물러서지 않겠다!'
      ]
    },
    {
      npcId: 'npc_mf_medic',
      name: '흰 수염 선의 팀',
      roleLabel: '전선 야전 지원반',
      pos: tileCenter(29, 26),
      interactRadiusPx: 44,
      visualScale: 0.96,
      color: '#e2e8f0',
      facing: 'up',
      ambientBubbleText: '출전 전에 야영과 패기 정비를 잊지 마!',
      patrolWaypoints: [tileCenter(28, 26), tileCenter(32, 26)],
      patrolSpeedPx: 36,
      pauseTicks: 85,
      dialogueLines: [
        '지원반: 3연전 도중 마르코의 푸른 불꽃이 큰 도움이 될 겁니다!'
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
    spawnPoint: tileCenter(26, 27),
    portExitZone: { pos: tileCenter(26, 30), radiusPx: 44 },
    battleTerminalPos: tileCenter(21, 27),
    obstacles: g.obstacles,
    laserBarriers: [],
    puzzleSwitches: [],
    giantProps: [
      {
        ...origGiant,
        pos: tileCenter(34, 5)
      }
    ],
    zones: [
      {
        zoneId: 'zone_mf_ice_bay',
        name: '초승달 얼음만 & 군함 정박지',
        subtitle: '아오키지가 얼린 만의 격전 입구',
        tileX: 3,
        tileY: 22,
        tileW: 46,
        tileH: 9,
        accentColor: '#7dd3fc'
      },
      {
        zoneId: 'zone_mf_rampart',
        name: '해군 포대 방벽 & 돌파구',
        subtitle: '포화가 쏟아지는 1차 저지선',
        tileX: 5,
        tileY: 16,
        tileW: 42,
        tileH: 5,
        accentColor: '#fb923c'
      },
      {
        zoneId: 'zone_mf_oris_plaza',
        name: '오리스 광장 격전지',
        subtitle: '칠무해와 대장들이 격돌한 중심지',
        tileX: 13,
        tileY: 9,
        tileW: 33,
        tileH: 7,
        accentColor: '#facc15'
      },
      {
        zoneId: 'zone_mf_hq',
        name: '해군본부 요새 & 처형대 계단',
        subtitle: '정상전쟁 3연전 최종 결전',
        tileX: 14,
        tileY: 3,
        tileW: 25,
        tileH: 6,
        accentColor: '#ef4444'
      }
    ],
    chests: [
      {
        chestId: 'chest_marineford_warship_deck',
        tileX: 4,
        tileY: 23,
        rarity: 'silver',
        hiddenHint: '서쪽 정박 해군 군함 갑판 끝',
        reward: { berries: 15000, trainingPoints: 24, itemLabel: '해군 군함 탄약고 보급' }
      },
      {
        chestId: 'chest_marineford_cannon_rampart',
        tileX: 11,
        tileY: 17,
        rarity: 'wooden',
        hiddenHint: '서쪽 포대 방벽 오버헤드 뒤 보급 구역',
        reward: { berries: 12000, trainingPoints: 20, itemLabel: '흰 수염 해적단 군량 상자' }
      },
      {
        chestId: 'chest_marineford_ice_pillar',
        tileX: 42,
        tileY: 12,
        rarity: 'gold',
        hiddenHint: '오리스 광장 동쪽 부서진 얼음 기둥 뒤',
        reward: {
          berries: 22000,
          trainingPoints: 30,
          healPartyRatio: 0.5,
          itemLabel: '불사조 마르코의 비약'
        }
      }
    ],
    markers: [
      {
        markerId: 'marker_mf_port',
        kind: 'PORT_EXIT',
        label: '⚓ 신세계 출항 부두',
        tileX: 26,
        tileY: 30,
        actionKind: 'PORT_EXIT'
      },
      {
        markerId: 'marker_mf_marco',
        kind: 'SIDE',
        label: '◆ 불사조 마르코 동맹',
        tileX: 23,
        tileY: 21,
        hideWhenFlagSet: 'flag_marineford_marco_alliance',
        actionKind: 'STORY'
      },
      {
        markerId: 'marker_mf_gauntlet',
        kind: 'MAIN',
        label: '★ 정상전쟁 3연전',
        tileX: 26,
        tileY: 10,
        hideWhenFlagSet: 'flag_marineford_cleared',
        actionKind: 'STORY'
      },
      {
        markerId: 'marker_mf_camp',
        kind: 'ACTIVITY',
        label: '🏕 전선 정비 캠프',
        tileX: 34,
        tileY: 26,
        actionKind: 'CAMP_TRAINING'
      },
      {
        markerId: 'marker_mf_terminal',
        kind: 'ACTIVITY',
        label: '🌐 대전 단말기',
        tileX: 21,
        tileY: 27,
        actionKind: 'BATTLE_TERMINAL'
      }
    ],
    landmarks: [
      {
        landmarkId: 'lm_mf_platform',
        kind: 'EXECUTION_PLATFORM',
        tileX: 24,
        tileY: 5,
        widthTiles: 4,
        heightTiles: 3,
        label: '정상전쟁 처형대'
      },
      {
        landmarkId: 'lm_mf_warship_w',
        kind: 'WARSHIP_HULL',
        tileX: 5,
        tileY: 25,
        widthTiles: 4,
        heightTiles: 2,
        label: '모비 딕 / 군함'
      },
      {
        landmarkId: 'lm_mf_warship_e',
        kind: 'WARSHIP_HULL',
        tileX: 41,
        tileY: 25,
        widthTiles: 4,
        heightTiles: 2
      },
      {
        landmarkId: 'lm_mf_board',
        kind: 'BOUNTY_BOARD',
        tileX: 34,
        tileY: 25,
        widthTiles: 1,
        heightTiles: 1
      }
    ],
    npcs,
    encounters: [{ ...origEnc, pos: tileCenter(26, 10) }],
    ambientProfile: { particles: ['SMOKE', 'SNOW', 'EMBER'], density: 38 },
    lightingProfile: {
      defaultMood: 'DUSK',
      tintHex: '#7c2d12',
      tintAlpha: 0.16,
      sunbeams: false,
      lanterns: [
        { tileX: 26, tileY: 8, color: '#f97316', radiusPx: 54 },
        { tileX: 16, tileY: 16, color: '#ef4444', radiusPx: 46 },
        { tileX: 36, tileY: 16, color: '#38bdf8', radiusPx: 46 }
      ]
    },
    tileMap: g.toTileMap()
  };
}

export const GRAND_LINE_BUILDERS = {
  drum_kingdom: buildDrumKingdom,
  alabasta: buildAlabasta,
  skypiea: buildSkypiea,
  thriller_bark: buildThrillerBark,
  marineford: buildMarineford
};
