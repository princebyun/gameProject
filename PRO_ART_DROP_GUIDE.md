# PRO_ART_DROP_GUIDE.md — 프로 외부 아트워크 & Tiled(`.tmj`) 원클릭 교체 가이드

PixiJS v8 (WebGL2) HD-2D 파이프라인은 **코드 기반 도트 생성(Procedural Baking)을 완전히 배제**하고, **`public/assets/pro/`** 폴더의 외부 아트워크(Aseprite/TexturePacker/Tiled)만 직접 로드합니다.

---

## 1. 캐릭터 스프라이트 시트 교체 / 추가 (`Aseprite` / `TexturePacker` / 커스텀 PNG)

### A. Aseprite / TexturePacker 정식 내보내기 (권장)
1. **경로:** `public/assets/pro/sprites/{unitId}_{formId}.png` + `{unitId}_{formId}.json`
   - 예: `public/assets/pro/sprites/luffy_base.png` + `luffy_base.json`
2. **지원 JSON 포맷 (자동 인식):**
   - **Aseprite JSON Hash** (`frames` 객체 + `meta.frameTags[]`)
   - **Aseprite JSON Array** (`frames` 배열 + `meta.frameTags[]`)
   - **TexturePacker JSON** (`frames` + `animations`)
   - **기존 엔진 `.meta.json`** (`VARIABLE_PACK` 또는 `GRID`)
3. **지원 애니메이션 태그명 (`meta.frameTags[].name`, 대소문자 무관):**
   - `IDLE` (또는 `idle`, `stand`)
   - `MOVE` (또는 `run`, `walk`)
   - `WINDUP`, `ATTACK_MELEE` (`attack`, `slash`), `ATTACK_CAST` (`special`, `cast`)
   - `CLASH` (`guard`, `parry`), `DODGE` (`dash`, `jump`), `HIT`, `DOWNED`, `TRANSFORM`, `VICTORY`
4. **피벗(Anchor) 규격:** `meta.anchor` 미지정 시 기본 발밑 중앙 `{ "x": 0.5, "y": 0.9 }`.

### B. `raw_assets/pro_drop/` 원클릭 임포트 CLI
`raw_assets/pro_drop/` 폴더에 `{unitId}_{formId}.png`와 `{unitId}_{formId}.json`을 넣은 뒤 아래 명령을 실행하면 `public/assets/pro/sprites/` 및 `pro_manifest.json`에 자동 반영됩니다.

```powershell
npm run import:pro
npm run validate:assets
```

---

## 2. Tiled(`.tmj`) 프로 타일맵 편집 & 즉시 교체

1. 무료 **Tiled Map Editor** (`https://www.mapeditor.org/`)에서 `public/assets/pro/maps/foosha_village.tmj`를 엽니다.
2. itch.io 등에서 구매/다운로드한 다른 타일셋 PNG를 `public/assets/pro/tilesets/`에 넣고 Tiled에서 꾸민 뒤 `foosha_village.tmj`를 저장(덮어쓰기)하면 **코드 수정 없이 즉시 반영**됩니다.
3. **레이어 규약 (`layerRole` 커스텀 속성 또는 레이어 이름):**
   - `water`: 해수면 셰이더 + 실시간 수면 반사/물결 왜곡 대상
   - `ground`, `ground_detail`: 지형·모래사장·목조 부두·돌길
   - `walls_props`: 건물 외벽·바위·가로등·통나무·나무 밑동
   - `overhead`: 지붕·나뭇가지(플레이어가 아래를 지나갈 때 자동으로 부드럽게 반투명 페이드)
   - `collision` *(Object Layer)*: 직사각형/폴리곤 충돌 박스
   - `lights` *(Object Layer)*: 포인트 광원 (`color`, `radius`, `intensity`, `flickerSpeed` 커스텀 속성 지원)
   - `spawns`, `markers`, `npcs`, `chests`, `zones` *(Object Layer)*: 게임 내 상호작용 바인딩
4. 저장 후 BFS 도달성 검증:

```powershell
npm run validate:maps
```

---

## 3. 초상화 · 패럴랙스 전투 배경 · VFX 규격

| 종류 | 경로 | 권장 규격 |
| :--- | :--- | :--- |
| **대화/전투 초상화** | `public/assets/pro/portraits/{unitId}_{emotion}.png` | `64×64` ~ `256×256` 투명 PNG |
| **풀와이드 합동기 컷인** | `public/assets/pro/portraits/{unitId}_cutin.png` | `192×80` ~ `320×120` 픽셀 아트 |
| **4계층 전투 배경** | `public/assets/pro/backgrounds/{bgId}_layer{0..3}.png` | `1280×540` (`layer0` 하늘 불투명, `1~3` 상단 투명 PNG) |
| **전투 VFX 아틀라스** | `public/assets/pro/vfx/{vfxId}.png` | 가로 N프레임 스트립 (알파 배경 투명 PNG) |
