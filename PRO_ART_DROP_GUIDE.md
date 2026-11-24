# PRO_ART_DROP_GUIDE.md — 프로 외부 아트워크 & Tiled(`.tmj`) 원클릭 교체 가이드

PixiJS v8 (WebGL2) HD-2D 파이프라인은 **코드 기반 도트 생성(Procedural Baking)을 완전히 배제**하고, **`public/assets/pro/`** 폴더의 외부 아트워크(Aseprite / TexturePacker / Tiled, 무손실 `.webp`)만 직접 로드합니다.

---

## 1. 프로 아트워크 수급 현황 & 미투입 규격 (`pro_manifest.json` v2.0.0 — `332 / 379 = 87.6%` 완비, Wave 3 `165 / 208 = 79.3%`)

- **밀짚모자 일당 10인 전원 (`10/10`) & 2:2 합동기 (`7/7`):** `luffy`(`1.00x`), `zoro`, `nami`, `usopp`(`0.98x`), `sanji`, `chopper`(`0.68x`), `robin`(`1.06x`), `franky`(`1.26x`), `brook`(`1.22x`), `jinbe`(`1.30x`) 모두 외부 NDS 아트워크 + 8종 표정 초상화 + `party_*` 동적 번들 승격 완료 (`VERIFIED 1 / IMPORTED`). 거대 변신 슬롯 3종(`chopper_monster_point`, `robin_demonio_fleur`, `franky_general`)은 각 동료의 보조 `party_*` 번들에 격리 등록됨.
- **외부 NDS 보스·동맹 (`19명`) & 각성/변신 폼 (`8종`):** `buggy`, `don_krieg`, `arlong`, `smoker`, `wapol`, `crocodile`, `enel`, `lucci`, `kaku`, `moria`, `akainu`, `aokiji`, `kizaru`, `blackbeard`, `marco`, `hody_jones`, `doflamingo`, `law`, `magellan` + `luffy_gear5`, `zoro_king_of_hell`, `sanji_diable_jambe`, `enel_amuru`, `lucci_hybrid`, `marco_phoenix`, `law_kroom`, `doflamingo_awakening` 승격 완료.
- **전 세계 17/17 섬 Tiled `.tmj` (`100%`) & 19개 4계층 전투 아레나 배경 (`100%`):** 5대 마스터 외부 `.tsx` + 8종 `.tx` 템플릿 기반 100% 무손실 WebP 적용 완료.

### 미수집 외부 시트 (`PLACEHOLDER` 유지 목록 — `raw_assets/packs/` 투입 대상)

| 유닛 / 폼 ID | 역할 / 티어 · 번들 | 해상도 상한 | 루피(`1.0x`) 대비 PPU 비율 | 누락 에셋 드롭 경로 (`raw_assets/packs/` 또는 `raw_assets/pro_drop/`) |
| :--- | :--- | :--- | :--- | :--- |
| `morgan_base` | `tier2_boss` (`battle_morgan`) | `1024×1024` | `1.24x` (`134px`) | **`raw_assets/packs/morgan_base.png`** + `morgan_portrait_{normal,angry,battle_cry}.png` |
| `chopper_monster_point` | `tier1_crew` 거대 변신 (`party_chopper`) | **`2048×2048`** | `1.90x` (`205px`) | **`raw_assets/packs/chopper_monster_point.png`** |
| `robin_demonio_fleur` | `tier1_crew` 거대 각성 (`party_robin`) | **`2048×2048`** | `1.55x` (`167px`) | **`raw_assets/packs/robin_demonio_fleur.png`** |
| `franky_general` | `tier1_crew` 거대 메카 (`party_franky`) | **`2048×2048`** | `1.56x` (`168px`) | **`raw_assets/packs/franky_general.png`** |
| `lucci_awakened` | `tier2_boss` 각성 폼 (`battle_lucci`) | `1024×1024` | `1.24x` (`134px`) | **`raw_assets/packs/lucci_awakened.png`** |
| `katakuri_base` | `tier2_boss` 핵심 보스 (`battle_katakuri`) | `1024×1024` | `1.35x` (`146px`) | **`raw_assets/packs/katakuri_base.png`** + `katakuri_portrait_{normal,angry,battle_cry}.png` |
| `kaido_base` | `tier2_boss` 인간형 (`battle_kaido`) | `1024×1024` | `1.65x` (`178px`) | **`raw_assets/packs/kaido_base.png`** + `kaido_portrait_{normal,angry,battle_cry}.png` |
| `kaido_dragon` | `tier2_boss` 거대 청룡 (`battle_kaido`) | **`2048×2048`** | `1.85x` (`200px`) | **`raw_assets/packs/kaido_dragon.png`** |
| `saturn_base` / `saturn_yokai` | `tier2_boss` 거대 요괴 (`battle_saturn`) | **`2048×2048`** | `1.60x` / `1.90x` (`205px`) | **`raw_assets/packs/saturn_{base,yokai}.png`** + `saturn_portrait_{normal,angry,battle_cry}.png` |
| `loki_base` / `loki_giant` | `tier2_boss` 거대 거인 (`battle_loki`) | **`2048×2048`** | `1.72x` / `2.10x` (`226px`) | **`raw_assets/packs/loki_{base,giant}.png`** + `loki_portrait_{normal,angry,battle_cry}.png` |
| `king_base` | `tier2_boss` (`battle_king`) | `1024×1024` | `1.30x` (`140px`) | **`raw_assets/packs/king_base.png`** + `king_portrait_normal.png` |
| `s_hawk_base` | `tier2_boss` (`battle_s_hawk`) | `1024×1024` | `1.12x` (`121px`) | **`raw_assets/packs/s_hawk_base.png`** + `s_hawk_portrait_normal.png` |
| `blueno_base` / `doppelman_base` | `tier2_boss` (`battle_{blueno,doppelman}`) | `1024×1024` | `1.18x` / `1.15x` | **`raw_assets/packs/{blueno,doppelman}_base.png`** |

> **코드 도트 베이킹 금지 원칙:** 위 캐릭터들은 외부 도트 시트가 미확보되어 레거시 관절 리그를 승격하지 않고 `PLACEHOLDER`로 유지 중입니다(배경 4계층 아레나는 이미 100% 완비). 외부 시트를 `raw_assets/packs/`에 넣고 `npm run import:pro`를 실행하면 일반 `1024×1024` / 거대 보스 `2048×2048` 상한 검증 및 인메모리 직출력 무손실 WebP 변환까지 자동 반영됩니다.

### 티어별 필수 규격
- **Tier 1 플레이어 동료 (`tier1_crew`):**
  - 동작 11종: `IDLE`, `MOVE`, `WINDUP`, `ATTACK_MELEE`, `ATTACK_CAST`, `CLASH`, `DODGE`, `HIT`, `DOWNED`, `TRANSFORM`, `VICTORY`
  - 표정 초상화 8종: `normal`, `angry`, `determined`, `shocked`, `smirk`, `sad`, `excited`, `battle_cry` (+ 선택적 `_cutin`)
- **Tier 2 보스 (`tier2_boss`):**
  - 핵심 7~8동작 이상 (`IDLE`, `MOVE`, `WINDUP`, `ATTACK_MELEE`, `ATTACK_CAST`, `CLASH`, `HIT`, `DOWNED`)
  - 최소 3종 초상화: `normal`, `angry`, `battle_cry`
- **아틀라스 & 품질 가드레일:** 일반 아틀라스 `1024×1024` 이하 (거대 보스/타일셋 `2048×2048` 이하), 순수 무손실 WebP (`lossless: true`, `exact: true`), PixiJS `scaleMode: "nearest"`, `TorsoWeightedPivotSolver` 몸통 중심 피벗.

---

## 2. 캐릭터 스프라이트 시트 교체 / 추가 (`Aseprite` / `TexturePacker` / 커스텀 PNG)

### A. Aseprite / TexturePacker 정식 내보내기 (권장)
1. **경로:** `public/assets/pro/sprites/{unitId}_{formId}.webp` + `{unitId}_{formId}.json`
   - 예: `public/assets/pro/sprites/luffy_base.webp` + `luffy_base.json`
2. **지원 JSON 포맷 (자동 인식):**
   - **Aseprite JSON Hash** (`frames` 객체 + `meta.frameTags[]`)
   - **Aseprite JSON Array** (`frames` 배열 + `meta.frameTags[]`)
   - **TexturePacker JSON** (`frames` + `animations`)
   - **기존 엔진 `.meta.json`** (`VARIABLE_PACK` 또는 `GRID`)
3. **피벗(Anchor) 규격:** 프레임별 `pivot` 또는 `meta.anchor` 미지정 시 기본 발밑 중앙 `{ "x": 0.5, "y": 0.9 }`.

### B. `raw_assets/packs/` · `raw_assets/pro_drop/` 원클릭 임포트 CLI
```powershell
npm run import:pro
npm run validate:pro
npm run assets:status
```

---

## 3. Tiled(`.tmj`) 프로 타일맵 편집 & 즉시 교체

1. **Tiled Map Editor** (`https://www.mapeditor.org/`)에서 `public/assets/pro/maps/foosha_village.tmj`를 엽니다.
2. **레이어 규약 (`layerRole` 커스텀 속성 또는 레이어 이름):**
   - `water`, `ground`, `ground_detail`, `walls_props`, `overhead`
   - Object Layers: `collision`, `lights`, `spawns`, `markers`, `npcs`, `chests`, `zones`
3. 저장 후 BFS 도달성 검증: `npm run validate:maps`

---

## 4. 초상화 · 패럴랙스 전투 배경 · VFX 규격

| 종류 | 경로 | 권장 규격 |
| :--- | :--- | :--- |
| **대화/전투 초상화** | `public/assets/pro/portraits/{unitId}_{emotion}.webp` | `64×64` ~ `256×256` 무손실 WebP |
| **풀와이드 합동기 컷인** | `public/assets/pro/portraits/{unitId}_cutin.webp` | `192×80` ~ `320×120` 픽셀 아트 |
| **4계층 전투 배경** | `public/assets/pro/backgrounds/{bgId}_layer{0..3}.webp` | `1280×540` (`layer0` 불투명, `1~3` 상단 투명) |
| **전투 VFX 아틀라스** | `public/assets/pro/vfx/{vfxId}.webp` | 가로/그리드 프레임 아틀라스 (`1024×1024` 상한) |
| **바다 랜드마크 20종** | `public/assets/pro/landmarks/{islandOrGateId}.webp` | 4프레임 가로 스트립 (`384×96` ~ `576×144`, `1024×1024` 상한, `raw_assets/packs/landmarks/` 우선 승격) |
| **선박·해상 엔티티 4종** | `public/assets/pro/sprites/ship_{id}.webp` + `.json` | `ship_going_merry`, `ship_thousand_sunny`, `ship_marine_warship` (`288×528`, 1024 상한), `ship_sea_king` (`576×1056`, 거대 2048 상한, `raw_assets/packs/ships/` 우선 승격) |
