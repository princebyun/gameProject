# MISSING_SPRITES.md — 외부 원피스 캐릭터 도트 시트 수급 현황 및 추가 가이드

> **최종 갱신:** 2026-11-23T00:58:09.594Z
> **외부 NDS 원피스 도트 시트 확보:** **37 / 94종** (나머지 57종은 6종 관절 픽셀 리그 시트로 안전 유지 중)

## 1. 안내
- `One Piece: Gigant Battle!` / `Gigant Battle! 2 - New World`에서 직접 확보 가능한 38종의 시트는 크로마키 투명화 → CCL 분할 → 발밑(`pivotY`) `0px` 정렬을 거쳐 이미 적용되었습니다.
- 아래 목록은 신세계 후반·와노쿠니·에그헤드·엘바프 이후 등장 캐릭터(예: 카이도, 카타쿠리, 킹, 새턴 성, 로키, S-호크) 및 변신 폼, 오리지널 유닛으로, 공개 아카이브에서 자동 다운로드가 불가능하거나 미등장하여 기존 고품질 관절 픽셀 리그 시트가 유지되고 있습니다.
- 원하는 커스텀 PNG 시트나 `.zip` 팩을 구하신 경우, 아래 파일명 규칙에 맞춰 **`raw_assets/packs/`** 폴더에 넣은 뒤 **`npm run import:pack`** 을 실행하면 즉시 게임에 등록됩니다.

## 2. 원클릭 임포트 사용법
```powershell
# 1) raw_assets/packs/ 폴더에 {spriteKey}.png 또는 캐릭터명.zip 투입
#    예: raw_assets/packs/kaido_base.png, raw_assets/packs/katakuri_pack.zip
npm run import:pack

# 2) 무결성 검증
npm run validate:assets
```

## 3. 미수집 캐릭터·변신 폼 목록 & 추천 검색 키워드
| Sprite Key | Unit ID | Form / Role | 추천 검색 키워드 | 드롭 경로 (`raw_assets/packs/`) |
| :--- | :--- | :--- | :--- | :--- |
| `lucci_form_lucci_awakened` | `lucci` | form_lucci_awakened | lucci One Piece pixel sprite sheet png | `raw_assets/packs/lucci_form_lucci_awakened.png` |
| `kaido_base` | `kaido` | base | Kaido One Piece JUS / MUGEN sprite sheet png | `raw_assets/packs/kaido_base.png` |
| `kaido_form_kaido_flame_dragon` | `kaido` | form_kaido_flame_dragon | Kaido One Piece JUS / MUGEN sprite sheet png | `raw_assets/packs/kaido_form_kaido_flame_dragon.png` |
| `kaido_form_kaido_hybrid` | `kaido` | form_kaido_hybrid | Kaido One Piece JUS / MUGEN sprite sheet png | `raw_assets/packs/kaido_form_kaido_hybrid.png` |
| `kaido_form_kaido_beast` | `kaido` | form_kaido_beast | Kaido One Piece JUS / MUGEN sprite sheet png | `raw_assets/packs/kaido_form_kaido_beast.png` |
| `kizaru_form_kizaru_light_realm` | `kizaru` | form_kizaru_light_realm | kizaru One Piece pixel sprite sheet png | `raw_assets/packs/kizaru_form_kizaru_light_realm.png` |
| `morgan_base` | `morgan` | base | Axe-Hand Morgan One Piece sprite sheet png | `raw_assets/packs/morgan_base.png` |
| `morgan_form_solar_awakening` | `morgan` | form_solar_awakening | Axe-Hand Morgan One Piece sprite sheet png | `raw_assets/packs/morgan_form_solar_awakening.png` |
| `blueno_base` | `blueno` | base | Blueno CP9 One Piece sprite sheet png | `raw_assets/packs/blueno_base.png` |
| `blueno_form_tempest_awakening` | `blueno` | form_tempest_awakening | Blueno CP9 One Piece sprite sheet png | `raw_assets/packs/blueno_form_tempest_awakening.png` |
| `kaku_form_kaku_giraffe` | `kaku` | form_kaku_giraffe | kaku One Piece pixel sprite sheet png | `raw_assets/packs/kaku_form_kaku_giraffe.png` |
| `franky_form_franky_shogun` | `franky` | form_franky_shogun | franky One Piece pixel sprite sheet png | `raw_assets/packs/franky_form_franky_shogun.png` |
| `king_base` | `king` | base | King The Wildfire One Piece sprite sheet png | `raw_assets/packs/king_base.png` |
| `king_form_king_pteranodon` | `king` | form_king_pteranodon | King The Wildfire One Piece sprite sheet png | `raw_assets/packs/king_form_king_pteranodon.png` |
| `s_hawk_base` | `s_hawk` | base | Seraphim S-Hawk Mihawk One Piece sprite sheet png | `raw_assets/packs/s_hawk_base.png` |
| `s_hawk_form_tempest_awakening` | `s_hawk` | form_tempest_awakening | Seraphim S-Hawk Mihawk One Piece sprite sheet png | `raw_assets/packs/s_hawk_form_tempest_awakening.png` |
| `saturn_base` | `saturn` | base | Saint Jaygarcia Saturn One Piece sprite sheet png | `raw_assets/packs/saturn_base.png` |
| `saturn_form_saturn_gyuki` | `saturn` | form_saturn_gyuki | Saint Jaygarcia Saturn One Piece sprite sheet png | `raw_assets/packs/saturn_form_saturn_gyuki.png` |
| `loki_base` | `loki` | base | Loki Elbaf One Piece pixel sprite sheet png | `raw_assets/packs/loki_base.png` |
| `loki_form_loki_ragnir` | `loki` | form_loki_ragnir | Loki Elbaf One Piece pixel sprite sheet png | `raw_assets/packs/loki_form_loki_ragnir.png` |
| `buggy_form_solar_awakening` | `buggy` | form_solar_awakening | buggy One Piece pixel sprite sheet png | `raw_assets/packs/buggy_form_solar_awakening.png` |
| `don_krieg_form_colossus_overdrive` | `don_krieg` | form_colossus_overdrive | don_krieg One Piece pixel sprite sheet png | `raw_assets/packs/don_krieg_form_colossus_overdrive.png` |
| `arlong_form_solar_awakening` | `arlong` | form_solar_awakening | arlong One Piece pixel sprite sheet png | `raw_assets/packs/arlong_form_solar_awakening.png` |
| `smoker_form_tempest_awakening` | `smoker` | form_tempest_awakening | smoker One Piece pixel sprite sheet png | `raw_assets/packs/smoker_form_tempest_awakening.png` |
| `usopp_form_tempest_awakening` | `usopp` | form_tempest_awakening | usopp One Piece pixel sprite sheet png | `raw_assets/packs/usopp_form_tempest_awakening.png` |
| `nami_form_tempest_awakening` | `nami` | form_tempest_awakening | nami One Piece pixel sprite sheet png | `raw_assets/packs/nami_form_tempest_awakening.png` |
| `wapol_form_colossus_overdrive` | `wapol` | form_colossus_overdrive | wapol One Piece pixel sprite sheet png | `raw_assets/packs/wapol_form_colossus_overdrive.png` |
| `crocodile_form_solar_awakening` | `crocodile` | form_solar_awakening | crocodile One Piece pixel sprite sheet png | `raw_assets/packs/crocodile_form_solar_awakening.png` |
| `moria_form_moria_shadows_asgard` | `moria` | form_moria_shadows_asgard | moria One Piece pixel sprite sheet png | `raw_assets/packs/moria_form_moria_shadows_asgard.png` |
| `doppelman_base` | `doppelman` | base | Gecko Moria Doppelman shadow sprite sheet png | `raw_assets/packs/doppelman_base.png` |
| `doppelman_form_tempest_awakening` | `doppelman` | form_tempest_awakening | Gecko Moria Doppelman shadow sprite sheet png | `raw_assets/packs/doppelman_form_tempest_awakening.png` |
| `akainu_form_akainu_magma_zone` | `akainu` | form_akainu_magma_zone | akainu One Piece pixel sprite sheet png | `raw_assets/packs/akainu_form_akainu_magma_zone.png` |
| `aokiji_form_aokiji_ice_age` | `aokiji` | form_aokiji_ice_age | aokiji One Piece pixel sprite sheet png | `raw_assets/packs/aokiji_form_aokiji_ice_age.png` |
| `blackbeard_form_colossus_overdrive` | `blackbeard` | form_colossus_overdrive | blackbeard One Piece pixel sprite sheet png | `raw_assets/packs/blackbeard_form_colossus_overdrive.png` |
| `chopper_form_chopper_monster` | `chopper` | form_chopper_monster | chopper One Piece pixel sprite sheet png | `raw_assets/packs/chopper_form_chopper_monster.png` |
| `chopper_form_chopper_guard` | `chopper` | form_chopper_guard | chopper One Piece pixel sprite sheet png | `raw_assets/packs/chopper_form_chopper_guard.png` |
| `chopper_form_chopper_kungfu` | `chopper` | form_chopper_kungfu | chopper One Piece pixel sprite sheet png | `raw_assets/packs/chopper_form_chopper_kungfu.png` |
| `robin_form_robin_demonio` | `robin` | form_robin_demonio | robin One Piece pixel sprite sheet png | `raw_assets/packs/robin_form_robin_demonio.png` |
| `brook_form_tempest_awakening` | `brook` | form_tempest_awakening | brook One Piece pixel sprite sheet png | `raw_assets/packs/brook_form_tempest_awakening.png` |
| `marco_form_marco_hybrid` | `marco` | form_marco_hybrid | marco One Piece pixel sprite sheet png | `raw_assets/packs/marco_form_marco_hybrid.png` |
| `hody_jones_form_colossus_overdrive` | `hody_jones` | form_colossus_overdrive | hody_jones One Piece pixel sprite sheet png | `raw_assets/packs/hody_jones_form_colossus_overdrive.png` |
| `katakuri_base` | `katakuri` | base | Charlotte Katakuri One Piece sprite sheet png | `raw_assets/packs/katakuri_base.png` |
| `katakuri_form_katakuri_mochi_world` | `katakuri` | form_katakuri_mochi_world | Charlotte Katakuri One Piece sprite sheet png | `raw_assets/packs/katakuri_form_katakuri_mochi_world.png` |
| `jinbe_form_colossus_overdrive` | `jinbe` | form_colossus_overdrive | jinbe One Piece pixel sprite sheet png | `raw_assets/packs/jinbe_form_colossus_overdrive.png` |
| `magellan_form_magellan_venom_demon` | `magellan` | form_magellan_venom_demon | magellan One Piece pixel sprite sheet png | `raw_assets/packs/magellan_form_magellan_venom_demon.png` |
| `unit_ignis_vanguard_base` | `unit_ignis_vanguard` | base | ignis_vanguard One Piece pixel sprite sheet png | `raw_assets/packs/unit_ignis_vanguard_base.png` |
| `unit_ignis_vanguard_form_solar_awakening` | `unit_ignis_vanguard` | form_solar_awakening | ignis_vanguard One Piece pixel sprite sheet png | `raw_assets/packs/unit_ignis_vanguard_form_solar_awakening.png` |
| `unit_tideweaver_base` | `unit_tideweaver` | base | tideweaver One Piece pixel sprite sheet png | `raw_assets/packs/unit_tideweaver_base.png` |
| `unit_tideweaver_form_colossus_overdrive` | `unit_tideweaver` | form_colossus_overdrive | tideweaver One Piece pixel sprite sheet png | `raw_assets/packs/unit_tideweaver_form_colossus_overdrive.png` |
| `unit_volt_strider_base` | `unit_volt_strider` | base | volt_strider One Piece pixel sprite sheet png | `raw_assets/packs/unit_volt_strider_base.png` |
| `unit_volt_strider_form_tempest_awakening` | `unit_volt_strider` | form_tempest_awakening | volt_strider One Piece pixel sprite sheet png | `raw_assets/packs/unit_volt_strider_form_tempest_awakening.png` |
| `unit_terra_bastion_base` | `unit_terra_bastion` | base | terra_bastion One Piece pixel sprite sheet png | `raw_assets/packs/unit_terra_bastion_base.png` |
| `unit_terra_bastion_form_colossus_overdrive` | `unit_terra_bastion` | form_colossus_overdrive | terra_bastion One Piece pixel sprite sheet png | `raw_assets/packs/unit_terra_bastion_form_colossus_overdrive.png` |
| `unit_zephyr_blade_base` | `unit_zephyr_blade` | base | zephyr_blade One Piece pixel sprite sheet png | `raw_assets/packs/unit_zephyr_blade_base.png` |
| `unit_zephyr_blade_form_tempest_awakening` | `unit_zephyr_blade` | form_tempest_awakening | zephyr_blade One Piece pixel sprite sheet png | `raw_assets/packs/unit_zephyr_blade_form_tempest_awakening.png` |
| `unit_void_conduit_base` | `unit_void_conduit` | base | void_conduit One Piece pixel sprite sheet png | `raw_assets/packs/unit_void_conduit_base.png` |
| `unit_void_conduit_form_colossus_overdrive` | `unit_void_conduit` | form_colossus_overdrive | void_conduit One Piece pixel sprite sheet png | `raw_assets/packs/unit_void_conduit_form_colossus_overdrive.png` |
