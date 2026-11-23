# PRO_ART_DROP_GUIDE.md — 프로 외부 아트워크 & Tiled(`.tmj`) 원클릭 교체 가이드

PixiJS v8 (WebGL2) HD-2D 파이프라인은 **코드 기반 도트 생성(Procedural Baking)을 완전히 배제**하고, **`public/assets/pro/`** 폴더의 외부 아트워크(Aseprite / TexturePacker / Tiled, 무손실 `.webp`)만 직접 로드합니다.

---

## 1. Wave 1 6인 프로 아트워크 수급 현황 & 미투입 규격

| 유닛 ID | 역할 / 티어 | 현재 상태 (`pro_manifest.json`) | 루피(`1.0x`) 대비 PPU 비율 | 누락 에셋 드롭 경로 (`raw_assets/packs/` 또는 `raw_assets/pro_drop/`) |
| :--- | :--- | :--- | :--- | :--- |
| `zoro_base` | `tier1_crew` (11동작 + 8초상화 + 컷인) | **`IMPORTED`** (`party_zoro`) | `1.05x` (`113px`) | 완비 (커스텀 교체 시 `zoro_base.png`) |
| `sanji_base` | `tier1_crew` (11동작 + 8초상화) | **`IMPORTED`** (`party_sanji`) | `1.05x` (`113px`) | 완비 (커스텀 교체 시 `sanji_base.png`) |
| `nami_base` | `tier1_crew` (11동작 + 8초상화) | **`IMPORTED`** (`party_nami`) | `0.95x` (`103px`) | 완비 (커스텀 교체 시 `nami_base.png`) |
| `morgan_base` | `tier2_boss` (핵심 7~8동작 + 3초상화) | **`PLACEHOLDER`** (`battle_morgan`) | `1.24x` (`134px`) | **`raw_assets/packs/morgan_base.png`** + `morgan_portrait_{normal,angry,battle_cry}.png` |
| `buggy_base` | `tier2_boss` (11동작 + 3초상화) | **`IMPORTED`** (`battle_buggy`) | `1.05x` (`113px`) | 완비 (커스텀 교체 시 `buggy_base.png`) |
| `arlong_base` | `tier2_boss` (11동작 + 3초상화) | **`IMPORTED`** (`battle_arlong`) | `1.28x` (`138px`) | 완비 (커스텀 교체 시 `arlong_base.png`) |

> **도끼손 모건(`morgan_base`) 투입 안내:**
> 모건은 외부 아카이브 시트가 미확보되어 레거시 관절 리그를 승격하지 않고 `PLACEHOLDER`로 유지 중입니다. 외부 도트 시트와 3종 초상화(`normal`, `angry`, `battle_cry`)를 `raw_assets/packs/`에 넣고 아래 명령을 실행하면 `lossless: true` 무손실 WebP 및 `1024×1024` 아틀라스 상한 검증까지 자동 반영됩니다.

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
