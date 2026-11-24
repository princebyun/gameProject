import { compileTmjSpecs } from '../compile-tiled-tmj.mjs';

export const WAVE4_ISLAND_MAP_SPECS = [
  {
    islandId: 'orange_town',
    tmjName: 'orange_town.tmj',
    primaryTileset: 'master_stone_canal',
    secondaryTileset: 'master_port_village',
    waterlineTileY: 27,
    extraLights: [
      { name: 'ot_dock_west', tx: 18.5, ty: 26.5, color: '#fffde047', radius: 56, intensity: 0.94, flickerSpeed: 2.8, mask: 'ALL' },
      { name: 'ot_dock_east', tx: 23.5, ty: 26.5, color: '#fffde047', radius: 56, intensity: 0.94, flickerSpeed: 3.1, mask: 'ALL' },
      { name: 'ot_bounty_square', tx: 22.5, ty: 14.5, color: '#fffb923c', radius: 66, intensity: 1.0, flickerSpeed: 3.5, mask: 'SUNSET|NIGHT' },
      { name: 'ot_petshop_lantern', tx: 12.5, ty: 18.5, color: '#fffef08a', radius: 58, intensity: 0.92, flickerSpeed: 2.6, mask: 'SUNSET|NIGHT' },
      { name: 'ot_circus_tent_w', tx: 30.5, ty: 7.5, color: '#fff43f5e', radius: 74, intensity: 1.12, flickerSpeed: 4.1, mask: 'ALL' },
      { name: 'ot_circus_tent_e', tx: 36.5, ty: 7.5, color: '#fffacc15', radius: 74, intensity: 1.1, flickerSpeed: 3.8, mask: 'ALL' },
      { name: 'ot_alley_torch', tx: 15.5, ty: 10.5, color: '#fff97316', radius: 60, intensity: 0.96, flickerSpeed: 4.4, mask: 'SUNSET|NIGHT' },
      { name: 'ot_harbor_beacon', tx: 20.5, ty: 27.5, color: '#ff38bdf8', radius: 58, intensity: 0.88, flickerSpeed: 2.1, mask: 'ALL' }
    ]
  },
  {
    islandId: 'baratie',
    tmjName: 'baratie.tmj',
    primaryTileset: 'master_stone_canal',
    secondaryTileset: 'master_port_village',
    waterlineTileY: 16,
    extraLights: [
      { name: 'bar_dock_gangway_w', tx: 20.5, ty: 26.5, color: '#fffde047', radius: 60, intensity: 0.98, flickerSpeed: 2.5, mask: 'ALL' },
      { name: 'bar_dock_gangway_e', tx: 26.5, ty: 26.5, color: '#fffde047', radius: 60, intensity: 0.98, flickerSpeed: 2.7, mask: 'ALL' },
      { name: 'bar_dining_hall_w', tx: 17.5, ty: 16.5, color: '#fffbbf24', radius: 70, intensity: 1.08, flickerSpeed: 3.1, mask: 'ALL' },
      { name: 'bar_dining_hall_e', tx: 29.5, ty: 16.5, color: '#fffbbf24', radius: 70, intensity: 1.08, flickerSpeed: 3.3, mask: 'ALL' },
      { name: 'bar_fish_prow_lamp', tx: 22.5, ty: 6.5, color: '#ff38bdf8', radius: 78, intensity: 1.04, flickerSpeed: 2.0, mask: 'ALL' },
      { name: 'bar_fin_deck_west', tx: 9.5, ty: 18.5, color: '#fffb923c', radius: 62, intensity: 0.96, flickerSpeed: 3.6, mask: 'SUNSET|NIGHT' },
      { name: 'bar_fin_deck_east', tx: 36.5, ty: 18.5, color: '#fffb923c', radius: 62, intensity: 0.96, flickerSpeed: 3.7, mask: 'SUNSET|NIGHT' },
      { name: 'bar_galley_warmth', tx: 23.5, ty: 12.5, color: '#fff97316', radius: 66, intensity: 1.02, flickerSpeed: 4.0, mask: 'ALL' }
    ]
  },
  {
    islandId: 'arlong_park',
    tmjName: 'arlong_park.tmj',
    primaryTileset: 'master_stone_canal',
    secondaryTileset: 'master_port_village',
    waterlineTileY: 16,
    extraLights: [
      { name: 'ap_harbor_lamp_w', tx: 20.5, ty: 29.5, color: '#fffde047', radius: 56, intensity: 0.92, flickerSpeed: 2.6, mask: 'ALL' },
      { name: 'ap_harbor_lamp_e', tx: 26.5, ty: 29.5, color: '#fffde047', radius: 56, intensity: 0.92, flickerSpeed: 2.9, mask: 'ALL' },
      { name: 'ap_tangerine_grove', tx: 10.5, ty: 23.5, color: '#fffb923c', radius: 64, intensity: 0.96, flickerSpeed: 3.1, mask: 'SUNSET|NIGHT' },
      { name: 'ap_shark_gate_w', tx: 19.5, ty: 16.5, color: '#ff38bdf8', radius: 68, intensity: 1.04, flickerSpeed: 2.4, mask: 'ALL' },
      { name: 'ap_shark_gate_e', tx: 26.5, ty: 16.5, color: '#ff38bdf8', radius: 68, intensity: 1.04, flickerSpeed: 2.5, mask: 'ALL' },
      { name: 'ap_pool_torch_w', tx: 16.5, ty: 10.5, color: '#fff43f5e', radius: 66, intensity: 1.05, flickerSpeed: 4.2, mask: 'ALL' },
      { name: 'ap_pool_torch_e', tx: 30.5, ty: 10.5, color: '#fff43f5e', radius: 66, intensity: 1.05, flickerSpeed: 4.4, mask: 'ALL' },
      { name: 'ap_throne_beacon', tx: 23.5, ty: 6.5, color: '#ff2dd4bf', radius: 74, intensity: 1.06, flickerSpeed: 2.2, mask: 'ALL' }
    ]
  },
  {
    islandId: 'loguetown',
    tmjName: 'loguetown.tmj',
    primaryTileset: 'master_stone_canal',
    secondaryTileset: 'master_port_village',
    waterlineTileY: 28,
    extraLights: [
      { name: 'lt_port_beacon_w', tx: 6.5, ty: 26.5, color: '#ff7dd3fc', radius: 62, intensity: 0.98, flickerSpeed: 2.4, mask: 'ALL' },
      { name: 'lt_port_beacon_e', tx: 13.5, ty: 26.5, color: '#fffde047', radius: 58, intensity: 0.94, flickerSpeed: 2.9, mask: 'ALL' },
      { name: 'lt_weapon_shop_lamp', tx: 16.5, ty: 18.5, color: '#fffb923c', radius: 64, intensity: 1.0, flickerSpeed: 3.4, mask: 'SUNSET|NIGHT' },
      { name: 'lt_plaza_lamp_w', tx: 19.5, ty: 11.5, color: '#fffef08a', radius: 68, intensity: 1.04, flickerSpeed: 3.1, mask: 'ALL' },
      { name: 'lt_plaza_lamp_e', tx: 28.5, ty: 11.5, color: '#fffef08a', radius: 68, intensity: 1.04, flickerSpeed: 3.2, mask: 'ALL' },
      { name: 'lt_scaffold_lightning', tx: 23.5, ty: 8.5, color: '#ff38bdf8', radius: 84, intensity: 1.14, flickerSpeed: 4.5, mask: 'ALL' },
      { name: 'lt_marine_hq_lamp', tx: 37.5, ty: 16.5, color: '#ff93c5fd', radius: 66, intensity: 0.96, flickerSpeed: 2.5, mask: 'ALL' },
      { name: 'lt_bounty_street', tx: 27.5, ty: 24.5, color: '#fffbbf24', radius: 62, intensity: 0.95, flickerSpeed: 3.3, mask: 'SUNSET|NIGHT' }
    ]
  },
  {
    islandId: 'drum_kingdom',
    tmjName: 'drum_kingdom.tmj',
    primaryTileset: 'master_eastern_pagoda',
    secondaryTileset: 'master_port_village',
    waterlineTileY: 31,
    extraLights: [
      { name: 'dr_harbor_lamp_w', tx: 20.5, ty: 30.5, color: '#fffde047', radius: 58, intensity: 0.96, flickerSpeed: 2.6, mask: 'ALL' },
      { name: 'dr_harbor_lamp_e', tx: 26.5, ty: 30.5, color: '#fffde047', radius: 58, intensity: 0.96, flickerSpeed: 2.8, mask: 'ALL' },
      { name: 'dr_bighorn_hearth_w', tx: 13.5, ty: 24.5, color: '#fffb923c', radius: 66, intensity: 1.06, flickerSpeed: 3.6, mask: 'ALL' },
      { name: 'dr_bighorn_hearth_e', tx: 31.5, ty: 24.5, color: '#fffb923c', radius: 66, intensity: 1.06, flickerSpeed: 3.8, mask: 'ALL' },
      { name: 'dr_ropeway_beacon', tx: 22.5, ty: 16.5, color: '#ff38bdf8', radius: 72, intensity: 1.02, flickerSpeed: 2.2, mask: 'ALL' },
      { name: 'dr_castle_torch_w', tx: 19.5, ty: 7.5, color: '#fff472b6', radius: 74, intensity: 1.08, flickerSpeed: 3.2, mask: 'ALL' },
      { name: 'dr_castle_torch_e', tx: 27.5, ty: 7.5, color: '#fff472b6', radius: 74, intensity: 1.08, flickerSpeed: 3.4, mask: 'ALL' },
      { name: 'dr_sakura_peak', tx: 23.5, ty: 4.5, color: '#fffbcfe8', radius: 82, intensity: 1.12, flickerSpeed: 1.8, mask: 'ALL' }
    ]
  },
  {
    islandId: 'skypiea',
    tmjName: 'skypiea.tmj',
    primaryTileset: 'master_desert_palace',
    secondaryTileset: 'master_scifi_neon',
    waterlineTileY: 32,
    extraLights: [
      { name: 'sky_cloud_dock_w', tx: 22.5, ty: 30.5, color: '#ffbae6fd', radius: 62, intensity: 0.95, flickerSpeed: 2.0, mask: 'ALL' },
      { name: 'sky_cloud_dock_e', tx: 28.5, ty: 30.5, color: '#ffbae6fd', radius: 62, intensity: 0.95, flickerSpeed: 2.2, mask: 'ALL' },
      { name: 'sky_angel_beach', tx: 12.5, ty: 22.5, color: '#fffef08a', radius: 66, intensity: 0.98, flickerSpeed: 2.4, mask: 'ALL' },
      { name: 'sky_beanstalk_w', tx: 21.5, ty: 17.5, color: '#ff4ade80', radius: 70, intensity: 1.02, flickerSpeed: 2.1, mask: 'ALL' },
      { name: 'sky_beanstalk_e', tx: 28.5, ty: 17.5, color: '#ff4ade80', radius: 70, intensity: 1.02, flickerSpeed: 2.3, mask: 'ALL' },
      { name: 'sky_shandora_altar', tx: 37.5, ty: 14.5, color: '#fffacc15', radius: 72, intensity: 1.08, flickerSpeed: 2.7, mask: 'ALL' },
      { name: 'sky_golden_bell_core', tx: 25.5, ty: 5.5, color: '#fffacc15', radius: 92, intensity: 1.22, flickerSpeed: 1.7, mask: 'ALL' },
      { name: 'sky_maxim_spark', tx: 16.5, ty: 9.5, color: '#ff38bdf8', radius: 68, intensity: 1.06, flickerSpeed: 4.2, mask: 'ALL' }
    ]
  },
  {
    islandId: 'thriller_bark',
    tmjName: 'thriller_bark.tmj',
    primaryTileset: 'master_eastern_pagoda',
    secondaryTileset: 'master_port_village',
    waterlineTileY: 31,
    extraLights: [
      { name: 'tb_fog_dock_w', tx: 21.5, ty: 30.5, color: '#ffc084fc', radius: 62, intensity: 1.04, flickerSpeed: 3.1, mask: 'ALL' },
      { name: 'tb_fog_dock_e', tx: 27.5, ty: 30.5, color: '#ffc084fc', radius: 62, intensity: 1.04, flickerSpeed: 3.3, mask: 'ALL' },
      { name: 'tb_graveyard_wisp_w', tx: 12.5, ty: 22.5, color: '#ff2dd4bf', radius: 64, intensity: 1.02, flickerSpeed: 2.4, mask: 'ALL' },
      { name: 'tb_graveyard_wisp_e', tx: 34.5, ty: 22.5, color: '#ff2dd4bf', radius: 64, intensity: 1.02, flickerSpeed: 2.6, mask: 'ALL' },
      { name: 'tb_bridge_lantern_l', tx: 21.5, ty: 16.5, color: '#ffa855f7', radius: 68, intensity: 1.1, flickerSpeed: 3.7, mask: 'ALL' },
      { name: 'tb_bridge_lantern_r', tx: 27.5, ty: 16.5, color: '#ffa855f7', radius: 68, intensity: 1.1, flickerSpeed: 3.9, mask: 'ALL' },
      { name: 'tb_gothic_mast', tx: 14.5, ty: 7.5, color: '#fff43f5e', radius: 80, intensity: 1.15, flickerSpeed: 3.5, mask: 'ALL' },
      { name: 'tb_moria_mansion', tx: 24.5, ty: 6.5, color: '#ffc084fc', radius: 84, intensity: 1.16, flickerSpeed: 2.9, mask: 'ALL' }
    ]
  },
  {
    islandId: 'marineford',
    tmjName: 'marineford.tmj',
    primaryTileset: 'master_stone_canal',
    secondaryTileset: 'master_eastern_pagoda',
    waterlineTileY: 29,
    extraLights: [
      { name: 'mf_ice_bay_w', tx: 12.5, ty: 26.5, color: '#ff38bdf8', radius: 68, intensity: 1.0, flickerSpeed: 2.4, mask: 'ALL' },
      { name: 'mf_ice_bay_e', tx: 40.5, ty: 26.5, color: '#ff38bdf8', radius: 68, intensity: 1.0, flickerSpeed: 2.6, mask: 'ALL' },
      { name: 'mf_siege_wall_w', tx: 17.5, ty: 19.5, color: '#fff97316', radius: 70, intensity: 1.1, flickerSpeed: 4.3, mask: 'ALL' },
      { name: 'mf_siege_wall_e', tx: 35.5, ty: 19.5, color: '#fff97316', radius: 70, intensity: 1.1, flickerSpeed: 4.5, mask: 'ALL' },
      { name: 'mf_oris_plaza_center', tx: 26.5, ty: 14.5, color: '#fffacc15', radius: 76, intensity: 1.06, flickerSpeed: 3.2, mask: 'ALL' },
      { name: 'mf_scaffold_w', tx: 22.5, ty: 6.5, color: '#ffef4444', radius: 78, intensity: 1.14, flickerSpeed: 3.9, mask: 'ALL' },
      { name: 'mf_scaffold_e', tx: 30.5, ty: 6.5, color: '#ffef4444', radius: 78, intensity: 1.14, flickerSpeed: 4.1, mask: 'ALL' },
      { name: 'mf_navy_fortress', tx: 26.5, ty: 4.5, color: '#ffbae6fd', radius: 84, intensity: 1.12, flickerSpeed: 2.2, mask: 'ALL' }
    ]
  },
  {
    islandId: 'fishman_island',
    tmjName: 'fishman_island.tmj',
    primaryTileset: 'master_scifi_neon',
    secondaryTileset: 'master_desert_palace',
    waterlineTileY: 28,
    extraLights: [
      { name: 'fi_sunny_bubble_dock', tx: 25.5, ty: 30.5, color: '#ff22d3ee', radius: 68, intensity: 1.04, flickerSpeed: 1.9, mask: 'ALL' },
      { name: 'fi_coral_arch_south', tx: 23.5, ty: 26.5, color: '#fff472b6', radius: 72, intensity: 1.08, flickerSpeed: 2.2, mask: 'ALL' },
      { name: 'fi_mermaid_cove', tx: 13.5, ty: 17.5, color: '#ff2dd4bf', radius: 76, intensity: 1.1, flickerSpeed: 1.8, mask: 'ALL' },
      { name: 'fi_gyoncord_plaza_w', tx: 20.5, ty: 14.5, color: '#ff38bdf8', radius: 70, intensity: 1.04, flickerSpeed: 2.1, mask: 'ALL' },
      { name: 'fi_gyoncord_plaza_e', tx: 32.5, ty: 14.5, color: '#ff38bdf8', radius: 70, intensity: 1.04, flickerSpeed: 2.3, mask: 'ALL' },
      { name: 'fi_coral_hill', tx: 36.5, ty: 21.5, color: '#fff472b6', radius: 66, intensity: 1.0, flickerSpeed: 2.5, mask: 'ALL' },
      { name: 'fi_ryugu_gate_w', tx: 22.5, ty: 6.5, color: '#fffacc15', radius: 78, intensity: 1.12, flickerSpeed: 1.7, mask: 'ALL' },
      { name: 'fi_ryugu_gate_e', tx: 29.5, ty: 6.5, color: '#fffacc15', radius: 78, intensity: 1.12, flickerSpeed: 1.9, mask: 'ALL' }
    ]
  },
  {
    islandId: 'dressrosa',
    tmjName: 'dressrosa.tmj',
    primaryTileset: 'master_stone_canal',
    secondaryTileset: 'master_port_village',
    waterlineTileY: 32,
    extraLights: [
      { name: 'drs_acacia_dock_w', tx: 23.5, ty: 30.5, color: '#fffde047', radius: 60, intensity: 0.96, flickerSpeed: 2.6, mask: 'ALL' },
      { name: 'drs_acacia_dock_e', tx: 29.5, ty: 30.5, color: '#fffde047', radius: 60, intensity: 0.96, flickerSpeed: 2.8, mask: 'ALL' },
      { name: 'drs_colosseum_arch_w', tx: 7.5, ty: 15.5, color: '#fff97316', radius: 78, intensity: 1.14, flickerSpeed: 4.1, mask: 'ALL' },
      { name: 'drs_colosseum_arch_e', tx: 14.5, ty: 15.5, color: '#fff97316', radius: 78, intensity: 1.14, flickerSpeed: 4.3, mask: 'ALL' },
      { name: 'drs_flower_field', tx: 39.5, ty: 19.5, color: '#fffacc15', radius: 72, intensity: 1.02, flickerSpeed: 2.1, mask: 'ALL' },
      { name: 'drs_plaza_lantern_w', tx: 22.5, ty: 18.5, color: '#fff43f5e', radius: 66, intensity: 1.05, flickerSpeed: 3.4, mask: 'SUNSET|NIGHT' },
      { name: 'drs_plaza_lantern_e', tx: 31.5, ty: 18.5, color: '#fff43f5e', radius: 66, intensity: 1.05, flickerSpeed: 3.6, mask: 'SUNSET|NIGHT' },
      { name: 'drs_royal_plateau', tx: 26.5, ty: 6.5, color: '#fffb7185', radius: 84, intensity: 1.12, flickerSpeed: 3.0, mask: 'ALL' }
    ]
  },
  {
    islandId: 'totto_land',
    tmjName: 'totto_land.tmj',
    primaryTileset: 'master_scifi_neon',
    secondaryTileset: 'master_desert_palace',
    waterlineTileY: 28,
    extraLights: [
      { name: 'tl_sweet_dock_w', tx: 22.5, ty: 30.5, color: '#fff472b6', radius: 62, intensity: 1.02, flickerSpeed: 2.4, mask: 'ALL' },
      { name: 'tl_sweet_dock_e', tx: 28.5, ty: 30.5, color: '#fff472b6', radius: 62, intensity: 1.02, flickerSpeed: 2.6, mask: 'ALL' },
      { name: 'tl_waffle_arch_w', tx: 18.5, ty: 20.5, color: '#fffde047', radius: 68, intensity: 1.06, flickerSpeed: 2.9, mask: 'ALL' },
      { name: 'tl_waffle_arch_e', tx: 28.5, ty: 20.5, color: '#fffde047', radius: 68, intensity: 1.06, flickerSpeed: 3.1, mask: 'ALL' },
      { name: 'tl_choco_fountain', tx: 25.5, ty: 22.5, color: '#ffe879f9', radius: 74, intensity: 1.1, flickerSpeed: 2.2, mask: 'ALL' },
      { name: 'tl_seduction_woods', tx: 11.5, ty: 14.5, color: '#ffc084fc', radius: 66, intensity: 1.02, flickerSpeed: 3.4, mask: 'ALL' },
      { name: 'tl_mirror_world_gate', tx: 36.5, ty: 13.5, color: '#ff38bdf8', radius: 72, intensity: 1.08, flickerSpeed: 2.1, mask: 'ALL' },
      { name: 'tl_whole_cake_chateau', tx: 25.5, ty: 6.5, color: '#fff472b6', radius: 86, intensity: 1.16, flickerSpeed: 2.7, mask: 'ALL' }
    ]
  },
  {
    islandId: 'elbaf',
    tmjName: 'elbaf.tmj',
    primaryTileset: 'master_eastern_pagoda',
    secondaryTileset: 'master_port_village',
    waterlineTileY: 34,
    extraLights: [
      { name: 'el_giant_dock_w', tx: 24.5, ty: 32.5, color: '#fffacc15', radius: 66, intensity: 1.0, flickerSpeed: 2.5, mask: 'ALL' },
      { name: 'el_giant_dock_e', tx: 30.5, ty: 32.5, color: '#fffacc15', radius: 66, intensity: 1.0, flickerSpeed: 2.7, mask: 'ALL' },
      { name: 'el_rune_monolith_w', tx: 8.5, ty: 15.5, color: '#ff38bdf8', radius: 78, intensity: 1.14, flickerSpeed: 2.1, mask: 'ALL' },
      { name: 'el_rune_monolith_e', tx: 12.5, ty: 15.5, color: '#ff38bdf8', radius: 78, intensity: 1.14, flickerSpeed: 2.3, mask: 'ALL' },
      { name: 'el_adam_root_bridge_w', tx: 14.5, ty: 22.5, color: '#ffa3e635', radius: 72, intensity: 1.05, flickerSpeed: 2.6, mask: 'ALL' },
      { name: 'el_adam_root_bridge_e', tx: 25.5, ty: 21.5, color: '#ffa3e635', radius: 74, intensity: 1.05, flickerSpeed: 2.8, mask: 'ALL' },
      { name: 'el_mead_hall_brazier', tx: 37.5, ty: 24.5, color: '#fff97316', radius: 74, intensity: 1.1, flickerSpeed: 4.0, mask: 'ALL' },
      { name: 'el_underworld_altar', tx: 27.5, ty: 6.5, color: '#fffacc15', radius: 92, intensity: 1.18, flickerSpeed: 3.1, mask: 'ALL' }
    ]
  }
];

export function buildWave4IslandTmjMaps(rootDir) {
  return compileTmjSpecs(rootDir, WAVE4_ISLAND_MAP_SPECS);
}
