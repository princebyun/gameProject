# 3D Asset Drop Guide — Three.js Cel-Shading Musou · Mixamo · 3D 무기 파이프라인

이 문서는 Sketchfab·Tripo3D·Meshy 및 **Adobe Mixamo**에서 준비한 3D 캐릭터 `.fbx`/`.glb`, 전장 맵 `.glb`, 그리고 **3D 무기 `.glb`**를 **One Piece Grand Voyage (`Three.js + WebGL2`)**에 코드 수정 없이 무중단 투입하고 검수하는 표준 가이드입니다.

---

## 1. 초간편 3줄 Mixamo 3D 캐릭터 투입 워크플로우

```bash
# 1) raw_assets/3d/mixamo/{unitId}/ 폴더에 IDLE.fbx(With Skin) + 모션 .fbx(Without Skin) 배치 후
npm run pack:3d -- --unit=luffy_base

# 2) 모바일 60FPS 규격 · Draco 압축 · WebP 해상도 · 무기/본/클립 자동 검사
npm run validate:3d

# 3) (build:web 실행 시 자동 호출) 오프라인 Android WebView용 로컬 Draco 디코더 동기화
npm run sync:draco
```

- `raw_assets/3d/`는 Vite 번들에 포함되지 않으므로 최종 `dist-web/` 용량에 영향을 주지 않습니다.
- 오프라인 Draco 디코더는 **`public/draco/`** (`./draco/` 상대 경로)로 동기화되며 `build:web` 실행 시 자동 갱신됩니다.

---

## 2. 폴더 구조 및 3D 무기 배치 규칙 (`public/assets/3d/weapons/`)

```text
raw_assets/3d/mixamo/{unitId}/    # 작업 원본 (dist-web/에서 100% 제외)
├── IDLE.fbx                      # With Skin 기준 파일 (Armature + Mesh 포함)
└── RUN.fbx / POWER_DASH.fbx / COMBO_1.fbx ...

public/draco/                     # 오프라인 내장 Draco 디코더 (npm run sync:draco)
├── draco_decoder.js
├── draco_decoder.wasm
└── draco_wasm_wrapper.js

public/assets/3d/
├── characters/                   # Draco + WebP 캐릭터 .glb 및 .anim.json
│   ├── luffy_base.glb
│   └── zoro_base.glb ...
├── weapons/                      # 데이터 드리븐 3D 무기 .glb (weapons_3d.json 연동)
│   ├── zoro_enma.glb             # 조로 오른손(염마)
│   ├── zoro_sandai_kitetsu.glb   # 조로 왼손(3대 귀철)
│   ├── zoro_wado_ichimonji.glb   # 조로 입(화도일문자)
│   ├── law_kikoku.glb            # 트라팔가 로(장검 키코쿠)
│   └── kaido_hassaikai.glb       # 카이도(거대 철퇴 팔재계)
├── maps/
│   └── foosha_plaza_3d.glb
└── animations/                   # 공용/개별 키프레임 사이드카 (.anim.json)
```

- 실제 무기 `.glb`가 아직 배치되지 않은 상태에서는 단일 중립 비율 프록시(`Greybox Weapon Proxy`)가 표시되며, 위 파일명으로 Draco `.glb`를 배치하면 코드 수정 없이 즉시 `AnimeToonMaterial` + 잉크 외곽선으로 핫스왑됩니다.

---

## 3. 자동 정규화 · Root Motion XZ 잠금 · 소켓 & 검격 리본

1. **신장 정규화 & 발바닥 자동 접지:** `Box3`를 측정해 `targetHeight`(기본 `1.7m`)로 스케일링하고 `Box3.min.y`를 정확히 **`y = 0`** 지면에 맞춥니다.
2. **루트 모션 XZ 수평 잠금 (`stripRootMotionXZ`):** Mixamo에서 `In Place` 체크가 누락된 클립이라도 런타임에 `mixamorigHips.position`의 X/Z 수평 이동만 0으로 잠그고 Y 상하 바운스는 보존합니다.
3. **데이터 드리븐 무기 장착 ([`weapons_3d.json`](src/data/assets/weapons_3d.json)):**
   - 조로 삼도류(`zoro_base`, `zoro_king_of_hell`): 오른손(`mixamorigRightHand`)·왼손(`mixamorigLeftHand`)·입(`mixamorigHead`) 3소켓 동시 바인딩 + 비전투 `IDLE`/`RUN` 지속 시 허리(`mixamorigHips`) 3검 수납 자동 전환.
   - 로(`law_base`)·카이도(`kaido_base`): 장검 `law_kikoku`·거대 철퇴 `kaido_hassaikai` + 강공격 패왕색 번개 아크 소켓 연동.
   - 공격 클립의 `trailWindows`(`0 <= start < end <= 1`) 구간 동안 제로 할당 32세그먼트 링 버퍼 + Catmull-Rom 툰 검격 리본이 출력됩니다.

---

## 4. `F9` 튜너 사용법 & `npm run validate:3d` 예산

1. **`F9` 패널 3대 탭:**
   - **`[🎨 셰이더]`:** 셀 단계(2/3/4), 그림자 색보정, 외곽선, 림라이트, 블룸, 집중선, 잡졸 밀도(30/60/100) 및 WebGL2 GPU 텔레메트리.
   - **`[🧍 캐릭터]`:** 클립 드롭다운 재생/일시정지, 정면 180° 반전, 루트 모션 XZ 잠금, 본 소켓 가이드 점, `[📋 .anim.json 복사]`.
   - **`[⚔ 무기·리본]`:** 캐릭터(`zoro_base`, `zoro_king_of_hell`, `law_base`, `kaido_base`) 및 슬롯(`오른손`/`왼손`/`입`/`허리 칼집`)별 `Pos/Rot/Scale` 및 `Trail Base/Tip` 실시간 슬라이더, `[⚔ 테스트 스윙]`, `[💥 히트스파크]`, **`[📋 weapons_3d.json 복사]`** 원클릭 내보내기.
2. **모바일 60FPS 예산 (`npm run validate:3d` 자동 감사):**
   - **Draco 압축:** `KHR_draco_mesh_compression` 필수
   - **폴리곤 상한:** 일반 캐릭터 `<= 30,000` Tris / 거대 보스 `<= 50,000` Tris / **무기 `.glb` `<= 8,000` Tris**
   - **내장 텍스처:** WebP 권장, 개별 이미지 `<= 1024×1024` px
   - **소켓 & 윈도우 스키마:** `weapons_3d.json` 허용 Mixamo 본(`mixamorigRightHand`, `mixamorigLeftHand`, `mixamorigHead`, `mixamorigHips`, `mixamorigSpine2`, `mixamorigRightFoot`) 및 `0 <= start < end <= 1` 검증
