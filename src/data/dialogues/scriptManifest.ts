import type { DialogueTriggerType } from '../../core/rpg/scriptSchema';
import type { SeaZoneId } from '../../core/types/rpgSchemas';

export interface ScriptTheaterCatalogItem {
  scriptId: string;
  episodeId: string;
  seaZoneId: SeaZoneId;
  islandName: string;
  triggerType: DialogueTriggerType;
  title: string;
}

export interface SideBanterMarkerMeta {
  scriptId: string;
  seaZoneId: SeaZoneId;
  markerPos: { x: number; y: number };
  markerLabel: string;
  requiredUnitIds?: string[];
  rewardTrainingPoints: number;
}

export const ALL_STORY_EPISODE_IDS = [
  'ep_east_blue_start',
  'ep_orange_town',
  'ep_baratie',
  'ep_arlong_park',
  'ep_loguetown',
  'ep_drum_kingdom',
  'ep_alabasta',
  'ep_skypiea',
  'ep_water_seven',
  'ep_thriller_bark',
  'ep_marineford',
  'ep_fishman_island',
  'ep_dressrosa',
  'ep_totto_land',
  'ep_wano',
  'ep_egghead',
  'ep_elbaf'
] as const;

export type StoryEpisodeId = (typeof ALL_STORY_EPISODE_IDS)[number];

/**
 * Lightweight synchronous catalog of Story Theater cutscenes across all 17 islands
 * so CrewCampMenuScene can display locked/unlocked cutscenes without eagerly bundling all JSON text.
 */
export const STORY_THEATER_CATALOG: ScriptTheaterCatalogItem[] = [
  // East Blue (5)
  { scriptId: 'eb1_foosha_departure', episodeId: 'ep_east_blue_start', seaZoneId: 'east_blue', islandName: '후샤 마을 & 쉘즈타운', triggerType: 'gold_marker', title: '후샤 마을 출항 배웅' },
  { scriptId: 'eb1_zoro_promise', episodeId: 'ep_east_blue_start', seaZoneId: 'east_blue', islandName: '후샤 마을 & 쉘즈타운', triggerType: 'gold_marker', title: '묶인 검사 조로와의 약속' },
  { scriptId: 'eb1_morgan_pre_boss', episodeId: 'ep_east_blue_start', seaZoneId: 'east_blue', islandName: '후샤 마을 & 쉘즈타운', triggerType: 'pre_boss', title: '도끼손 모건 대령 대치' },
  { scriptId: 'eb1_shells_post_boss_recruit', episodeId: 'ep_east_blue_start', seaZoneId: 'east_blue', islandName: '후샤 마을 & 쉘즈타운', triggerType: 'post_boss', title: '모건 격파 & 조로 합류' },

  { scriptId: 'eb2_orange_arrival', episodeId: 'ep_orange_town', seaZoneId: 'east_blue', islandName: '오렌지 마을', triggerType: 'gold_marker', title: '슈슈와 나미의 제안' },
  { scriptId: 'eb2_buggy_pre_boss', episodeId: 'ep_orange_town', seaZoneId: 'east_blue', islandName: '오렌지 마을', triggerType: 'pre_boss', title: '광대 버기 대치' },
  { scriptId: 'eb2_orange_post_boss', episodeId: 'ep_orange_town', seaZoneId: 'east_blue', islandName: '오렌지 마을', triggerType: 'post_boss', title: '버기 격파 & 나미 임시 동행' },

  { scriptId: 'eb3_baratie_arrival', episodeId: 'ep_baratie', seaZoneId: 'east_blue', islandName: '해상 레스토랑 발라티에', triggerType: 'gold_marker', title: '발라티에 소동과 상디' },
  { scriptId: 'eb3_krieg_pre_boss', episodeId: 'ep_baratie', seaZoneId: 'east_blue', islandName: '해상 레스토랑 발라티에', triggerType: 'pre_boss', title: '돈 클리크 MH5 대치' },
  { scriptId: 'eb3_baratie_post_boss_recruit', episodeId: 'ep_baratie', seaZoneId: 'east_blue', islandName: '해상 레스토랑 발라티에', triggerType: 'post_boss', title: '제프 이별 & 상디·우솝 합류' },

  { scriptId: 'eb4_arlong_nami_hat', episodeId: 'ep_arlong_park', seaZoneId: 'east_blue', islandName: '아론 파크', triggerType: 'gold_marker', title: '나미의 눈물과 밀짚모자' },
  { scriptId: 'eb4_arlong_pre_boss', episodeId: 'ep_arlong_park', seaZoneId: 'east_blue', islandName: '아론 파크', triggerType: 'pre_boss', title: '톱상어 아론 대치' },
  { scriptId: 'eb4_arlong_post_boss_recruit', episodeId: 'ep_arlong_park', seaZoneId: 'east_blue', islandName: '아론 파크', triggerType: 'post_boss', title: '아론 격파 · 나미 합류 & 첫 수배서' },

  { scriptId: 'eb5_loguetown_arrival', episodeId: 'ep_loguetown', seaZoneId: 'east_blue', islandName: '로그타운', triggerType: 'gold_marker', title: '로저의 처형대와 폭풍' },
  { scriptId: 'eb5_smoker_pre_boss', episodeId: 'ep_loguetown', seaZoneId: 'east_blue', islandName: '로그타운', triggerType: 'pre_boss', title: '하얀 사냥꾼 스모커 포위전' },
  { scriptId: 'eb5_loguetown_post_boss', episodeId: 'ep_loguetown', seaZoneId: 'east_blue', islandName: '로그타운', triggerType: 'post_boss', title: '녹색 돌풍과 탈출' },
  { scriptId: 'eb5_reverse_mountain_gate', episodeId: 'ep_loguetown', seaZoneId: 'east_blue', islandName: '리버스 마운틴 관문', triggerType: 'sea_gate', title: '위대한 항로 출항 선언' },

  // Grand Line (6)
  { scriptId: 'gl1_drum_arrival', episodeId: 'ep_drum_kingdom', seaZoneId: 'grand_line', islandName: '드럼 왕국', triggerType: 'gold_marker', title: '설산 성의 순록 의사' },
  { scriptId: 'gl1_wapol_pre_boss', episodeId: 'ep_drum_kingdom', seaZoneId: 'grand_line', islandName: '드럼 왕국', triggerType: 'pre_boss', title: '폭군 와포루 대치' },
  { scriptId: 'gl1_drum_post_boss_recruit', episodeId: 'ep_drum_kingdom', seaZoneId: 'grand_line', islandName: '드럼 왕국', triggerType: 'post_boss', title: '설산 벚꽃 눈 & 쵸파 합류' },

  { scriptId: 'gl2_alabasta_arrival', episodeId: 'ep_alabasta', seaZoneId: 'grand_line', islandName: '알라바스타', triggerType: 'gold_marker', title: '사막 왕국의 위기' },
  { scriptId: 'gl2_crocodile_pre_boss', episodeId: 'ep_alabasta', seaZoneId: 'grand_line', islandName: '알라바스타', triggerType: 'pre_boss', title: '칠무해 크로커다일 대치' },
  { scriptId: 'gl2_alabasta_post_boss_recruit', episodeId: 'ep_alabasta', seaZoneId: 'grand_line', islandName: '알라바스타', triggerType: 'post_boss', title: '기적의 비 & 로빈 합류' },

  { scriptId: 'gl3_skypiea_arrival', episodeId: 'ep_skypiea', seaZoneId: 'grand_line', islandName: '하늘섬 스카이피아', triggerType: 'gold_marker', title: '구름 바다 상륙' },
  { scriptId: 'gl3_enel_pre_boss', episodeId: 'ep_skypiea', seaZoneId: 'grand_line', islandName: '하늘섬 스카이피아', triggerType: 'pre_boss', title: '뇌신 갓 에넬 대치' },
  { scriptId: 'gl3_skypiea_post_boss', episodeId: 'ep_skypiea', seaZoneId: 'grand_line', islandName: '하늘섬 스카이피아', triggerType: 'post_boss', title: '하늘을 가르는 황금종' },

  { scriptId: 'gl4_water_seven_arrival', episodeId: 'ep_water_seven', seaZoneId: 'grand_line', islandName: '워터 세븐', triggerType: 'gold_marker', title: '로빈 구출 선언 & CP9' },
  { scriptId: 'gl4_lucci_pre_boss', episodeId: 'ep_water_seven', seaZoneId: 'grand_line', islandName: '워터 세븐', triggerType: 'pre_boss', title: 'CP9 최강 로브 루치 대치' },
  { scriptId: 'gl4_water_seven_post_boss_recruit', episodeId: 'ep_water_seven', seaZoneId: 'grand_line', islandName: '워터 세븐', triggerType: 'post_boss', title: '써니호 진수식 & 프랑키 합류' },

  { scriptId: 'gl5_thriller_bark_arrival', episodeId: 'ep_thriller_bark', seaZoneId: 'grand_line', islandName: '스릴러 바크', triggerType: 'gold_marker', title: '유령선과 콧노래의 브룩' },
  { scriptId: 'gl5_moria_pre_boss', episodeId: 'ep_thriller_bark', seaZoneId: 'grand_line', islandName: '스릴러 바크', triggerType: 'pre_boss', title: '겟코 모리아 대치' },
  { scriptId: 'gl5_thriller_bark_post_boss_recruit', episodeId: 'ep_thriller_bark', seaZoneId: 'grand_line', islandName: '스릴러 바크', triggerType: 'post_boss', title: '빙크스의 술 & 브룩 합류' },

  { scriptId: 'gl6_marineford_arrival', episodeId: 'ep_marineford', seaZoneId: 'grand_line', islandName: '마린포드', triggerType: 'gold_marker', title: '정상전쟁 돌입 & 마르코' },
  { scriptId: 'gl6_marineford_pre_boss', episodeId: 'ep_marineford', seaZoneId: 'grand_line', islandName: '마린포드', triggerType: 'pre_boss', title: '대장 · 검은 수염 3연전' },
  { scriptId: 'gl6_marineford_post_boss_recruit', episodeId: 'ep_marineford', seaZoneId: 'grand_line', islandName: '마린포드', triggerType: 'post_boss', title: '마르코 합류 & 2년 수련' },
  { scriptId: 'gl6_red_line_new_world_gate', episodeId: 'ep_marineford', seaZoneId: 'grand_line', islandName: '레드라인 관문', triggerType: 'sea_gate', title: '신세계 해저 항로 돌파' },

  // New World (6)
  { scriptId: 'nw1_fishman_arrival', episodeId: 'ep_fishman_island', seaZoneId: 'new_world', islandName: '어인섬', triggerType: 'gold_marker', title: '해저 용궁 왕국 도착' },
  { scriptId: 'nw1_hody_pre_boss', episodeId: 'ep_fishman_island', seaZoneId: 'new_world', islandName: '어인섬', triggerType: 'pre_boss', title: '호디 존스 백발 폭주 대치' },
  { scriptId: 'nw1_fishman_post_boss_recruit', episodeId: 'ep_fishman_island', seaZoneId: 'new_world', islandName: '어인섬', triggerType: 'post_boss', title: '징베 합류 & 밀짚모자 10인 집결' },

  { scriptId: 'nw2_dressrosa_arrival', episodeId: 'ep_dressrosa', seaZoneId: 'new_world', islandName: '드레스로자', triggerType: 'gold_marker', title: '콜로세움과 로 동맹' },
  { scriptId: 'nw2_doffy_pre_boss', episodeId: 'ep_dressrosa', seaZoneId: 'new_world', islandName: '드레스로자', triggerType: 'pre_boss', title: '도플라밍고 새장 대치' },
  { scriptId: 'nw2_dressrosa_post_boss', episodeId: 'ep_dressrosa', seaZoneId: 'new_world', islandName: '드레스로자', triggerType: 'post_boss', title: '새장 붕괴 & 5억 베리 수배서' },

  { scriptId: 'nw3_totto_arrival', episodeId: 'ep_totto_land', seaZoneId: 'new_world', islandName: '토트랜드', triggerType: 'gold_marker', title: '거울 세계 돌입' },
  { scriptId: 'nw3_katakuri_pre_boss', episodeId: 'ep_totto_land', seaZoneId: 'new_world', islandName: '토트랜드', triggerType: 'pre_boss', title: '카타쿠리 미래 예지 1:1 결투' },
  { scriptId: 'nw3_totto_post_boss', episodeId: 'ep_totto_land', seaZoneId: 'new_world', islandName: '토트랜드', triggerType: 'post_boss', title: '라이벌 인정 & 로드 포네그리프' },

  { scriptId: 'nw4_wano_arrival', episodeId: 'ep_wano', seaZoneId: 'new_world', islandName: '와노쿠니 오니가시마', triggerType: 'gold_marker', title: '오니가시마 토벌 개시' },
  { scriptId: 'nw4_kaido_pre_boss', episodeId: 'ep_wano', seaZoneId: 'new_world', islandName: '와노쿠니 오니가시마', triggerType: 'pre_boss', title: '옥상 사황 백수의 카이도 대치' },
  { scriptId: 'nw4_wano_post_boss', episodeId: 'ep_wano', seaZoneId: 'new_world', islandName: '와노쿠니 오니가시마', triggerType: 'post_boss', title: '기어 5 승리 & 사황 30억 수배서' },

  { scriptId: 'nw5_egghead_arrival', episodeId: 'ep_egghead', seaZoneId: 'new_world', islandName: '미래섬 에그헤드', triggerType: 'gold_marker', title: '베가펑크 연구소와 세라핌' },
  { scriptId: 'nw5_saturn_pre_boss', episodeId: 'ep_egghead', seaZoneId: 'new_world', islandName: '미래섬 에그헤드', triggerType: 'pre_boss', title: '키자루 · 오로성 새턴 성 포위전' },
  { scriptId: 'nw5_egghead_post_boss', episodeId: 'ep_egghead', seaZoneId: 'new_world', islandName: '미래섬 에그헤드', triggerType: 'post_boss', title: '거병 해적단 엄호 속 에그헤드 출항' },

  { scriptId: 'nw6_elbaf_arrival', episodeId: 'ep_elbaf', seaZoneId: 'new_world', islandName: '거인족의 나라 엘바프', triggerType: 'gold_marker', title: '세계수 위그드라실과 거병 해적단' },
  { scriptId: 'nw6_loki_pre_boss', episodeId: 'ep_elbaf', seaZoneId: 'new_world', islandName: '거인족의 나라 엘바프', triggerType: 'pre_boss', title: '명계 아레나 저주받은 왕자 로키 대치' },
  { scriptId: 'nw6_elbaf_post_boss', episodeId: 'ep_elbaf', seaZoneId: 'new_world', islandName: '거인족의 나라 엘바프', triggerType: 'post_boss', title: '최종장의 서막 & 엔드게임 항로' }
];

export const SIDE_BANTER_MARKER_MANIFEST: SideBanterMarkerMeta[] = [
  {
    scriptId: 'side_eb_zoro_sanji_feud',
    seaZoneId: 'east_blue',
    markerPos: { x: 730, y: 470 },
    markerLabel: '선상 대화: 조로 vs 상디 말다툼',
    requiredUnitIds: ['zoro'],
    rewardTrainingPoints: 12
  },
  {
    scriptId: 'side_eb_nami_navigation_tip',
    seaZoneId: 'east_blue',
    markerPos: { x: 960, y: 460 },
    markerLabel: '선상 대화: 나미의 항해 팁',
    rewardTrainingPoints: 12
  },
  {
    scriptId: 'side_gl_chopper_usopp_clinic',
    seaZoneId: 'grand_line',
    markerPos: { x: 520, y: 690 },
    markerLabel: '선상 대화: 쵸파·우솝 진료실 수다',
    rewardTrainingPoints: 15
  },
  {
    scriptId: 'side_gl_sunny_workshop',
    seaZoneId: 'grand_line',
    markerPos: { x: 1080, y: 680 },
    markerLabel: '선상 대화: 써니호 콜라 개조 수다',
    rewardTrainingPoints: 15
  },
  {
    scriptId: 'side_gl_robin_poneglyph_lore',
    seaZoneId: 'grand_line',
    markerPos: { x: 860, y: 310 },
    markerLabel: '선상 대화: 로빈의 포네그리프 해설',
    rewardTrainingPoints: 18
  },
  {
    scriptId: 'side_gl_brook_binks_concert',
    seaZoneId: 'grand_line',
    markerPos: { x: 1350, y: 700 },
    markerLabel: '선상 대화: 브룩의 선상 바이올린',
    rewardTrainingPoints: 18
  },
  {
    scriptId: 'side_nw_jinbe_current_wisdom',
    seaZoneId: 'new_world',
    markerPos: { x: 540, y: 620 },
    markerLabel: '선상 대화: 징베의 신세계 조류 조언',
    rewardTrainingPoints: 20
  },
  {
    scriptId: 'side_nw_ten_crew_banquet',
    seaZoneId: 'new_world',
    markerPos: { x: 1120, y: 540 },
    markerLabel: '선상 대화: 밀짚모자 10인 대연회',
    rewardTrainingPoints: 25
  }
];
