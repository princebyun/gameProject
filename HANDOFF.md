# HANDOFF.md — One Piece Grand Voyage 프로젝트 인수인계 및 현재 상태 문서

> **최종 업데이트 기준:** Stage 22 Wave 5 완결 — ① 실시간 바다 물결 GLSL 셰이더([`OceanWaterShaderPipeline.ts`](src/render/pixi/shaders/OceanWaterShaderPipeline.ts)) · 해역별 날씨/해왕류 그림자([`SeaAtmospherePipeline.ts`](src/render/pixi/shaders/SeaAtmospherePipeline.ts)) · 해류/소용돌이 물리 어댑터([`SeaCurrentPhysics.ts`](src/scenes/sea/SeaCurrentPhysics.ts)) 구축, ② **20종 바다 랜드마크 + 4종 선박 무손실 WebP 승격([`wave5SeaAssetPromoter.mjs`](scripts/lib/wave5SeaAssetPromoter.mjs)) · 단일 활성 해역 번들 VRAM 락([`PixiAssetBundleManager.ts`](src/render/pixi/PixiAssetBundleManager.ts)) · `PixiSeaSailingScene` WebGL2 전면 통합 & 레거시 Canvas 2D 바다 렌더링 제거**, ③ **미니맵·확대 해도 보물상자 60개(`.tmj` 100% 일치)·빠른 항해 번들 전환·3대 해역 5회 왕복(15회 전환) 0누수 VRAM/Safe Area E2E 검증 완료** (`src/core/` 0줄 변경 · `pro_manifest.json` `383`엔트리 `VERIFIED 1 / IMPORTED 335 / PLACEHOLDER 47` · `dist-web/` `1,058`파일 `30,523,715 bytes` / `assets/pro/` `.webp` `287`개 · `.tmj` `17`개 · 중복 `.png` `0`개 · Vitest `46`스위트 `187`테스트 통과)  
> **현재 프로젝트 상태:** **전 세계 17/17 섬 100% PixiJS v8 WebGL2 HD-2D + Tiled `.tmj` + 3대 해역 `SeaSailingScene` WebGL2 전면 통일(실시간 바다 물결 셰이더·20종 무손실 WebP 랜드마크·4종 선박·야간 뱃머리 동적 광원·Single-Sea VRAM 락) + 전 해역·거대 보스 레이드 WebGL2 전투(밀짚모자 10/10 + 전체 2:2 합동기 7종 + `GiantBossShaderPipeline` + 단일 활성 보스 VRAM 락) + `pro_manifest.json` v2.0.0 (`383`엔트리 `VERIFIED 1 / IMPORTED 335 / PLACEHOLDER 47`) (`check:arch` `268`파일 `0 issues` · Vitest `46`스위트 / `187`테스트 전원 통과 · `dist-web/` 프로덕션 웹 빌드 완비)**  
> **버전 현황:**  
> - **앱 패키지 버전:** `0.1.0` (`package.json`) | **Android 버전:** `versionCode 1` / `versionName "1.0"` (`android/app/build.gradle`)  
> - **전투 계산 버전 (`BATTLE_CALC_VERSION`):** `"0.6.0"` (`src/core/constants.ts` — `src/core/` 0줄 변경 및 결정론 `stateHash` 3종 100% 동일 유지)  
> - **세이브 스키마 버전 (`CURRENT_SAVE_VERSION`):** `5` (`v0 → v1 → v2 → v3 → v4 → v5` 무손실 순차 마이그레이션 & `openedChestIds` / `episodeFlags['visited_island_*']` 하위 호환 · `HMAC-SHA256-DERIVED` 2단계 안티치트 호환)  
> - **렌더링 엔진 / 프로 매니페스트 버전:** `pixi.js@^8.23.0` (WebGL2) | `pro_manifest.json` `v2.0.0` (`src/assets/pro_manifest.json` SSOT, `383`개 엔트리: `VERIFIED 1 / IMPORTED 335 / PLACEHOLDER 47`)  
> - **TypeScript & 아키텍처 규격:** `strict: true` + `noUncheckedIndexedAccess: true` + `noUnusedLocals/Parameters: true` + `noImplicitReturns: true` (`check:arch` `268`개 파일 순환 참조 `0건`, 계층 위반 `0건`, `any`/`@ts-ignore` `0건`, `shadowBlur` `0건`)  
> - **레거시 호환 에셋 매니페스트:** 스프라이트 `98/98종` · 초상화 `352/352종` · 바이옴 타일셋 `14종` · 월드 랜드마크 `20/20종` · 오디오 `BGM 10곡 / SFX 22종`  
> **자동화 검증 현황:** `npm run validate:pro` 통과 (`383`엔트리 `0 errors`) | `npm run validate:maps` 통과 (`17/17` + Pro `.tmj ×17` GID 범위·BFS `0 errors`) | `npm run validate:assets` 통과 (`0 errors`) | `npm run validate:scripts` 통과 (`0 errors`) | `npm run check:arch` 통과 (`0 issues`, `268` files) | `npm run typecheck` 통과 (`0 errors`) | `npm run build:web` 통과 (`5.53s`, `39` 프리캐시 `2425.33 KiB`, `dist-web/` `1,058`개 파일, `30,523,715 bytes`, `assets/pro/` `.webp` `287`개 / `.tmj` `17`개 / 중복 `.png` `0`개) | Vitest **46개 스위트 / 187개 테스트 전원 통과**

---

## 1. 완료된 단계별 구현 내역 (Phase 1~9 & Stage 3~9)

### 1.1 코어 전투 엔진 & 3대 해역 17개 섬 캠페인 (Phase 1 ~ Phase 9)
- **결정론적 60Hz 전투 엔진 (`src/core/combat/`):**
  - 6종 맞대결 물리(광선 vs 광선, 근접 vs 광선 가드, 근접 vs 투사체, 근접 vs 근접, 패왕색 하늘 가르기), 2스택 완벽 회피(Just Dodge), 패기 3종(무장·견문·패왕 Lv0~3), 동물계 다단계 변신·초인계 환경 각성·기어 5 오버드라이브.
  - 보스 전용 전투 훅 15종 이상(루나리아 불꽃, 초재생 및 패왕색 억제, 참격 분할 면역, 45초 생존/탈출전, 물통 젖음, 어둠 능력 봉인, 도펠맨 분신, 마그마/빙결 아레나 반반 분할, 마르코 불사조 부활, 도플라밍고 새장 축소, 카타쿠리 미래 예지/집중 붕괴, 호디 E.S 폭주, 마젤란 맹독 중첩/베놈 데몬).
- **3대 해역 · 17개 에피소드 섬 자유 항해 (`src/core/rpg/`, `src/data/`):**
  - **이스트 블루 (5개 필수 섬):** 후샤·쉘즈타운 → 오렌지 마을 → 발라티에 → 아론 파크 → 로그타운 → **리버스 마운틴 관문**
  - **위대한 항로 (6개 필수 섬):** 드럼 왕국 → 알라바스타 → 하늘섬 스카이피아 → 워터 세븐 → 스릴러 바크 → 마린포드 → **레드라인 신세계 관문**
  - **신세계 (6개 섬, 삼침 로그 포스):** 어인섬(밀짚모자 10인 전 직책 완성) → 드레스로자 → 토트랜드 → 와노쿠니 오니가시마 → 미래섬 에그헤드 → 거인족의 나라 엘바프
- **실시간 Lockstep 멀티플레이어 & 2단계 안티치트 (`server/`, `src/core/net/`, `src/core/save/`):**
  - 6자리 방 코드, `1V1` / `2V2` / `COOP_RAID`(2~3인 + 빈자리 AI), 관전자 HUD, 항구 대전 단말기(회복 아이템 금지 & HP/PP 무손실).
  - Canonical JSON `HMAC-SHA256-DERIVED` 서명 검증 + 게임 규칙 교차 검증(`ILLEGAL_ENDGAME_STATE` 포함).

### 1.2 엔드게임 3대 모드 확장 & Save v5 (Stage 3)
- **임펠 다운 6층+ 로그라이트 서바이벌 (`src/core/endgame/impelDown.ts`):**
  - 1층 홍련 ~ 6층 무한지옥(마젤란 보스) + 7층 이상 무한 심층(Endless), 층별 유물 3택 1 드래프트(15종+), 중단 저장(`suspendedRun`) 및 이어하기.
- **코리다 콜로세움 8강 토너먼트 (`src/core/endgame/colosseum.ts`):**
  - C/B/A/S 티어 8강 대진표, 장외 링아웃(`ringOutEnabled`), 콜로세움 포인트(CP) 기술 전수(Move Tutor) 및 수배서 테두리 등급(`bronze / silver / gold / platinum / diamond`).
- **거대 보스 협동 레이드 (`src/core/endgame/raid.ts`):**
  - 카이도 화룡대횃불, 새턴 성 심연 각성, 엘바프 왕자 로키 3대 레이드 보스, 브레이크 게이지 & 그로기(초재생 정지 + 피해 배율 증가), 팀 DPS 체크 보호막, 2초 근접 구조 & 팀 공용 부활(3회), 전용 레이드 유물 장착.

### 1.3 전 캐릭터 6종 관절 도트 리그 엔진 · 바이옴 타일셋 · 레트로 오디오 파이프라인 (Stage 4 & Stage 6)
- **6종 관절 분리형 2D 픽셀 도트 리그 엔진 (`src/render/sprite/rig/`, `scripts/bake-sprites.mjs`):**
  - 6종 관절 골격(`humanoid_brawler` 48×48, `swordsman_weapon` 48×48/64×64, `caster_ranged` 48×48/64×64, `small_agile` 48×48, `bulky_tall_coat` 64×64, `giant_beast` 96×96 — `serpentine_dragon`, `spider_oni`, `winged_phoenix`, `giant_humanoid`)으로 전 캐릭터 94종 유닛·변신·각성 시트 + 4종 선박 시트(총 **98종 멀티프레임 PNG 시트** 및 `.meta.json`)를 `public/assets/sprites/`에 일괄 베이킹.
  - 전 유닛(44명) × 8감정(`normal`, `angry`, `determined`, `shocked`, `smirk`, `sad`, `excited`, `battle_cry`) 총 **352종+ `64×64` 픽셀 표정 초상화**를 `public/assets/portraits/`에 일괄 생성하고 대화 컷신 및 수배서 오버레이에 연동.

### 1.4 APK 패키징 직전 코드베이스 리팩토링 & 프로덕션 웹 빌드(`dist-web/`) 최적화 (Stage 7)
- **대소문자 엄격(Strict Case-Sensitive) 에셋·스크립트 검증 (`scripts/validate-assets.ts`, `scripts/validate-scripts.ts`):**
  - `fs.readdirSync` 기반 실제 디스크 파일명 대소문자 100% 일치 검사로 Android/Linux WebView 환경에서의 대소문자 404 위험을 원천 차단.
  - `vite.config.ts`의 `base: './'` 상대 경로 통일 및 `sourcemap: false` 설정으로 서브폴더·로컬 WebView 환경 완벽 호환.
- **레거시 죽은 코드 제거 및 비대한 모듈 분리 (`src/core/` 100% 불변 유지):**
  - 미사용 고아 파일 `src/scenes/sandboxScene.ts`(`-1,050줄`), 구형 단일 생성 스크립트 `scripts/generate-luffy-pixel-sheet.ts`(`-121줄`), `src/assets/assetLoader.ts` 내 구형 32×32 단색 블록 아바타 분기(`-745줄`), `src/assets/proceduralPixelSheetBaker.ts` 내 도달 불능 폴백 루프(`-225줄`) 제거(총 **2,100줄 이상 레거시 코드 감축**).
  - `src/scenes/sceneManager.ts`에서 동료 야영지 모달(`src/scenes/modals/crewCampModal.ts`), 세이브 매니저 모달(`src/scenes/modals/saveManagerModal.ts`), 온라인 로비 모달(`src/scenes/modals/onlineLobbyModal.ts`), 환경설정 모달(`src/scenes/modals/settingsModal.ts`), 디버그 쇼케이스 컨트롤러(`src/scenes/controllers/debugShowcaseController.ts`)를 독립 모듈로 분리.
  - `src/render/battleRenderer.ts`에서 아레나 환경 장판·보스 기믹·투사체·광선·맞대결 스파크를 `src/render/battleArenaHazardsRenderer.ts`로 분리하고, 매 프레임 `.filter()` 배열 할당 및 `elements.find()` 선형 탐색을 무할당 루프 및 `WeakMap` `O(1)` 캐시 조회로 최적화.
- **프로덕션 웹 빌드(`dist-web/`) 용량 및 오염 감사 결과:**
  - **총 용량:** `~2.34 MB` (`564개` 파일, 500KB 초과 청크 경고 **0건**)
  - **오염 파일 유입 검사:** `raw_assets/`, `exported_thumbnails/`, `AGENTS.md`, `HANDOFF.md`, `CLAUDE.md`, `AI_BUNDLE.md`, `GEMINI.md`, `.env`, `*.map` 유입 **0건**.

### 1.5 실플레이 피드백 반영: 전투 종료 후 방향키 먹통 해결 & 친유저 UI 개편 (Stage 8)
- **전투 종료 후 방향키/이동 잠김 버그 근본 해결 (`src/input/inputManager.ts`, `src/scenes/sceneManager.ts`):**
  - **원인:** `stepRpgFrame()`이 섬·바다 이동 벡터를 구할 때 `buildPlayerCommand(this.battleWorld.units[0], ...)`를 호출해, 전투 중 선봉 유닛(`units[0]`)이 쓰러지거나(`isAlive = false`) 대기석으로 교대된(`isOnField = false`) 상태로 전투가 종료되면 `buildPlayerCommand()`가 계속 `null`을 반환해 방향키·WASD·가상 조이스틱이 영구 차단되던 문제 확인.
  - **해결:** `UnifiedInputManager.getExplorationMoveVector()`를 분리 구현하여 `BattleWorldState`나 선봉 유닛 생존 여부와 무관하게 탐험 이동이 항상 동작하도록 수정하고, `tests/viewport/productionDistGalaxyS25E2E.test.ts`에 회귀 테스트 추가.
  - 전투 중 조작 중이던 아군이 KO·교대될 때 필드 위 생존 아군에게 `isPlayerControlled`를 자동 인계하도록 보강.
  - 보스전 승리 직후 현상금 수배서 오버레이(`showWantedPosterOverlay`)가 `Esc` 키 또는 표시 `0.8초` 이후 방향키/이동 입력만으로도 즉시 닫히며 이동하도록 개선하고, 씬 전환 시 잔여 DOM 포커스(`<select>`, `<button>`) 및 가상 조이스틱 상태를 자동 초기화(`clearTransientFocusAndInput()`).
- **친유저(Player-Friendly) UI 개편 (`src/scenes/sceneManager.ts`, `src/scenes/modals/*.ts`, `src/render/*.ts`):**
  - `☰ 메뉴` 클릭 시 상단 바·우측 드로어·하단 쇼케이스 바 3개가 동시에 열리던 구조를 개선하여, 깔끔한 플레이어용 상단 퀵메뉴(`⚓ 모험 계속`, `🏕 동료 & 수련`, `🏆 도전 모드`, `🌐 통신 대전`, `💾 저장 / 불러오기`, `📜 항해 일지`, `⚙ 설정`, `🏠 타이틀`) 하나만 열리고 항목 클릭 시 자동으로 닫히도록 수정.
  - 스토리 스킵 드롭다운, 배틀 샌드박스, 에셋 프리뷰, 하단 쇼케이스 바는 `🛠 개발자 도구` 토글 버튼을 눌렀을 때만 펼쳐지도록 분리.
  - `crewCampModal.ts`, `saveManagerModal.ts`, `onlineLobbyModal.ts`에서 핵심 플레이 기능(상디 선상 요리, 패기/각성 수련, 4개 세이브 슬롯, 방 생성/방 코드 참가)을 최상단에 배치하고, JSON 텍스트 붙여넣기 및 안티치트 변조 시뮬레이션 버튼은 `<details>` 접이식 섹션으로 정리.
  - 바다·섬·전투 캔버스 HUD(`sailingRenderer.ts`, `islandRenderer.ts`, `missionTrackerHud.ts`, `hudRenderer.ts`)의 중복 퀘스트 박스와 내부 영문 코드(`TIME`, `FPS`, `PARAMEICIA`, `PWR`, `CD`)를 간결하고 직관적인 한국어 UI로 정돈.

### 1.6 멀티타깃 배포 패키징 검증 (Windows x64 Electron & Android Debug APK)
- **Electron 메인 커스텀 프로토콜 보강 (`electron/main.ts`):**
  - `getMimeType()`에 외부 핫스왑 오디오/이미지 MIME(`.ogg`, `.mp3`, `.wav`, `.webp`, `.jpg`, `.jpeg`)를 추가하고, `registerCustomAppProtocol()`의 디렉터리 트래버설 방어를 `path.sep` 경계 기준으로 강화.
  - `.html` 이외의 확장자를 가진 미존재 에셋(`assets/tilesets/*.png`, `assets/audio/**/*.ogg` 등) 요청 시 SPA 폴백(`index.html`) 대신 즉시 `404 Not Found`를 반환하도록 개선.
- **Windows x64 Electron 패키징 완료 (`npm run package:win`):**
  - `dist-electron/`: `560`개 파일(`2.32 MB`), 스프라이트 `196`개(`98 PNG + 98 .meta.json`), 초상화 `355`개 파일, `sw.js`/`*.map`/문서 유입 `0`건.
  - `dist-electron-main/`: `package.json` (`{"type":"commonjs"}`), `electron/main.js`, `electron/preload.js` 생성 확인.
  - `release/windows/`: `win-unpacked/OnePieceGrandVoyage.exe` (`238.4 MB`), `win-unpacked/resources/app.asar` (`3.23 MB`), `OnePieceGrandVoyage-0.1.0-win-x64.exe` (NSIS 설치형, `118.09 MB`), `OnePieceGrandVoyage-0.1.0-win-x64-portable.exe` (포터블, `107.11 MB`) 생성 확인.
- **Android Debug APK 현황:**
  - `android/app/build/outputs/apk/debug/app-debug.apk` 및 `release/android/OnePieceGrandVoyage-v0.1.0-debug.apk` (`5.99 MB`) 빌드 산출물 확인 완료 (`adb` 연결 기기 미연결 상태).

### 1.7 Stage 9 — APK 패키징 직전 아키텍처·Strict TS·God Class 분리·60FPS & 메모리 누수 전면 리팩토링
- **Step 1 — 순환 참조 0건 · 단방향 계층 경계 · TypeScript `strict` 전면 통과:**
  - `scripts/check-architecture.mjs` (`npm run check:arch`) 구축: TS AST 기반 순환 참조 탐지(`0건`), 계층 경계 검증(`data` 무의존 / `core` DOM·렌더·씬·오디오 격리 / `render·audio·assets -> scenes` 차단), `any`·`@ts-ignore`·`ctx.shadowBlur` 자동 차단.
  - `tsconfig.json` `strict: true`, `noUncheckedIndexedAccess: true`, `noUnusedLocals: true`, `noUnusedParameters: true`, `noImplicitReturns: true` 활성화 및 전 모듈 무경고 통과(`assertNever` 판별 유니온 완전성 검사 포함).
- **Step 2 — God Class 조합 기반 분리 & 통합 `DataRegistry` (`0` 로직 파일 `>= 400줄`):**
  - `src/scenes/sceneManager.ts`(3,403줄 → **392줄**): `src/scenes/controllers/` 하위 14개 단일 책임 컨트롤러·렌더러로 분리; `src/core/combat/` (`worldFactory`, `unitRuntimeFactory`, `clashResolver`, `damageCalc`, `formShiftEngine` 등), `src/core/endgame/`, `src/core/rpg/`, `src/core/save/`, `src/render/` (`spriteAnimationStateMachine` vs `spriteFrameRenderer`, `SafeAreaLayout` 단일 유틸리티, `hud/`, `battle/`, `rpg/` 서브모듈) 전량 400줄 미만으로 정돈.
  - `src/data/unifiedDataRegistry.ts`, `src/data/schemaGuards.ts`, `src/core/combat/worldLookup.ts`: 스키마 런타임 타입 가드 및 `Map`/`WeakMap` $O(1)$ 인덱스 구축으로 전투·렌더 루프 선형 `.find()` 탐색 제거.
- **Step 3 — Android WebView 60FPS 핫패스 & 제로 리크 생명주기:**
  - `src/render/sprite/spriteEffectCache.ts` & `spriteFrameRenderer.ts`: 모바일 프레임 드랍 주범인 `ctx.shadowBlur`를 **0건**으로 제거하고, 무장색 경화 1px 픽셀 아우라를 캐시된 `'ARMAMENT_BLACK'` 오프스크린 스프라이트에 사전 베이킹.
  - `src/render/viewport/frustumCulling.ts` & `src/render/pools/renderScratchPools.ts`: 전투(거대 보스 `0.88x` 줌아웃 포함)·항해·섬 탐색 프러스텀 컬링, 정수 픽셀 좌표(`Math.round`), `lerpVecInto`·`ObjectPool`(`AfterimagePool`, `ParticlePool`, `FloatingTextPool`)·재사용 HUD 버퍼 도입, 프레임당 중복 `imageSmoothingEnabled` 재설정 및 `titleScene` 하늘 그라데이션 재할당 제거.
  - `src/render/canvasGpuDispose.ts`, `src/core/types/disposable.ts`: `SpriteEffectCache`, `TilemapLayerRenderer`, `AssetLoader`, `ExternalAssetResolver`에 LRU 상한 및 제거/`dispose()` 시 `canvas.width = 0; canvas.height = 0;` GPU 텍스처 즉시 해제 적용; `ResponsiveViewportManager`, `CanvasRenderer`, `RetroAudioEngine`, `ChiptuneSynthPlayer`, `SfxManager`, `DeviceAdapter`, `WebSocketTransport`, `TitleSceneController`, `SceneManager`에 `Disposable`, `AbortController({ signal })`, `onended` 오디오 노드 `disconnect()` 일괄 적용.
- **Step 4 — 검증 현황 (`tests/core/determinismBaseline.test.ts`, `tests/render/phase3OptimizationAndLeak.test.ts`, `tests/viewport/productionDistGalaxyS25E2E.test.ts`):**
  - Vitest **25개 스위트 / 106개 테스트 100% 통과**, 리팩토링 전 기준선 `stateHash` 3종(`2V2`, `1V1`, `COOP_RAID`) 100% 동일 유지 확인.
  - 프로덕션 `dist-web/` 빌드(`1.47s`, `.md`/`.map` 오염 `0건`) 및 헤드리스 E2E 통과. (실시간 Chrome DevTools 프로파일링은 호스트 Chrome `chrome://inspect/#remote-debugging` 미활성화 상태로 대기 중)

---

## 2. 남은 이슈 (Remaining Issues)

- **치명적/기능적/아키텍처 버그:** **0건**
  - 전투 코어 결정론(`BATTLE_CALC_VERSION = "0.6.0"`, 기준선 `stateHash` 3종 100% 일치), 세이브 호환성(`CURRENT_SAVE_VERSION = 5`, `world.openedChestIds` 동적 60종 하위 호환), `validate:maps`(17/17 7계층 섬·60개 상자·71개 구역·102명 NPC BFS 0 에러), 순환 참조 `0건`, 계층 침범 `0건`, `any`/`@ts-ignore` `0건`, `ctx.shadowBlur` `0건`, 오프스크린 캔버스 GPU 메모리(`width=0, height=0`) 및 `AbortController`·WebAudio 해제 모두 검증 완료.
- **라이브 Chrome DevTools(CDP) 원격 디버깅 미연결 (자동화 E2E로 대체 검증 완료):**
  - 프로덕션 번들(`dist-web/` `692`파일, `25,055,826 bytes`, `landmarks` `20/20 PNG`) 무결성, 갤럭시 S25 울트라(`19.5:9`, `915×412 → 1199×540`)·데스크톱(`1280×720`) Safe Area 비충돌, 해류·소용돌이 물리, `flashEffect === false` 번개 차단, 60개 보물상자 동적 집계, 빠른 항해, GPU 메모리 해제 회귀는 자동화 테스트(33 suites / 136 tests)로 검증 완료.
  - 호스트 Chrome에서 `chrome://inspect/#remote-debugging`(`DevToolsActivePort`)이 비활성화되어 있어 라이브 CDP 브라우저 조작은 차단되었으며, 실브라우저 시각 확인이 필요할 때 `npm run preview`로 로컬에서 바로 확인할 수 있습니다.
- **선택적 외부 커스텀 스프라이트 교체 대상 (`MISSING_SPRITES.md`):**
  - 다층 바이옴 타일셋(`14종`), 패럴랙스 전투 배경(`42장`), VFX 아틀라스(`12종`), 실제 `.ogg` 오디오(`BGM 10곡 / SFX 22종`), NDS 스프라이트(`37종`)·머그샷 초상화(`352장+`)는 모두 외부 파일 확보 완료.
  - 나머지 `57종` 캐릭터·변신 폼은 관절 도트 리그 PNG로 정상 동작 중이며, 추후 외부 NDS/JUS/MUGEN 시트를 확보하면 `raw_assets/packs/` 투입 후 `npm run import:pack` 또는 `AssetPreviewScene` 슬라이서 탭으로 무중단 교체 가능합니다.

---

## 3. Stage 10 완료 요약 (외부 리소스 대량 수집 · 다층 맵/패럴랙스/VFX 업그레이드)

1. **시각 벤치마크 & 외부 공개 리소스 파이프라인 (`scripts/fetch-web-assets.mjs`, `npm run fetch:assets`)**
   - [`docs/VISUAL_BENCHMARK.md`](docs/VISUAL_BENCHMARK.md) 및 [`docs/ASSET_SOURCES.md`](docs/ASSET_SOURCES.md) 기준으로 공개 픽셀·오디오 자산을 확보 및 정규화:
     - **다층 바이옴 타일셋 14종** (`public/assets/tilesets/*.png`, `256×256`, `16×16` 타일 16행 아틀라스): 오토타일 지형, 4프레임 심리스 파도/해안 포말, 불투명 조약돌/부두 도로, 벽돌·판자 건물 외벽·유리창·문, 기와/지붕 및 4톤 셀셰이딩 나무 수관, 접촉 그림자 포함.
     - **3계층 패럴랙스 전투 배경 14개 아레나 × 3레이어 = 42장** (`public/assets/backgrounds/<id>/{sky,mid,ground}.png`, `1280×540`, [`src/data/assets/backgrounds.json`](src/data/assets/backgrounds.json)).
     - **프레임 기반 전투 VFX 아틀라스 12종** (`public/assets/vfx/*.png`, [`src/data/assets/vfx.json`](src/data/assets/vfx.json)).
     - **실제 `.ogg` 오디오 32곡/종**: 루프 BGM 10트랙 (`public/assets/audio/bgm/*.ogg`) + 전투/UI SFX 22종 (`public/assets/audio/sfx/*.ogg`).
     - **원피스 2D 도트 스프라이트 & NDS 머그샷 초상화**: *One Piece: Gigant Battle! 1 & 2* 공개 시트 37종(크로마키 투명화·CCL 분할·`0px pivotY` 발밑 정렬, `48~128px`) + `OPGB2_Mugs.png` 240장(64×64) 반영 (`352`장 이상 전체 초상화 검증).
2. **엔진 렌더러 전면 업그레이드 (Stage 10 Step 2, `src/core/` 무수정)**
   - [`LayeredTilemapRenderer`](src/render/tileset/layeredTilemapRenderer.ts) + [`layeredMapStructures.ts`](src/render/tileset/layeredMapStructures.ts): 7계층(L0 지반 → L1 길/포말/그림자 → L2 벽체 → L3 `IslandYSortQueue` 동적 Y정렬·동료 추적·픽셀 NPC → L4 지붕/수관 오버헤드 → L5 `AmbientParticleSystem` 풀링 파티클 → L6 `AtmosphereLightingOverlay` 오프스크린 시간대 조명, `shadowBlur` 0) + 비동기 아틀라스 로딩 완료 시 청크 자동 재베이킹 및 LRU 6맵 즉시 GPU 해제.
   - [`ParallaxBattleBackdrop`](src/render/battle/parallaxBattleBackdrop.ts): `960~1260px` 가변 뷰포트 및 `0.88x` 거대 보스 줌아웃을 빈틈없이 커버하는 3계층 패럴랙스 + 최대 24개 바닥 폭발 데칼.
   - [`VfxAtlasRenderer`](src/render/battle/vfxAtlasRenderer.ts) & [`computeNormalizedUnitDrawScale`](src/render/sprite/spriteFrameRenderer.ts): `ObjectPool(128)` 기반 프레임 애니메이션 VFX 및 `48~128px` 가변 스프라이트 발밑 비율 정규화.
3. **원클릭 외부 스프라이트 팩 임포터 (`scripts/import-sprite-pack.mjs`, `npm run import:pack`)**
   - `raw_assets/packs/`에 `.zip` 또는 `.png` 투입 후 `npm run import:pack` 실행 시 자동 압축 해제·크로마키 제거·발밑 정렬·[`MISSING_SPRITES.md`](MISSING_SPRITES.md) 자동 갱신(현재 37종 외부 NDS 시트 / 57종 관절 리그 fallback 목록 관리).
4. **프로덕션 웹 빌드(`dist-web/`) 용량 변화 (기존 `564`파일 / `2.38 MiB` → `672`파일 / `23.50 MiB`)**
   - `assets/sprites`: 196 files (`2,146,452 B`, `2.05 MiB`) | `assets/portraits`: 363 files (`311,018 B`, `0.30 MiB`)
   - `assets/tilesets`: 14 files (`137,070 B`, `0.13 MiB`) | `assets/backgrounds`: 42 files (`369,619 B`, `0.35 MiB`)
   - `assets/vfx`: 12 files (`62,824 B`, `0.06 MiB`) | `assets/audio/bgm`: 10 files (`20,186,199 B`, `19.25 MiB`) | `assets/audio/sfx`: 22 files (`305,025 B`, `0.29 MiB`)
   - `JS/CSS/HTML/PWA`: 13 files (`1,120,160 B`, `1.07 MiB`) | **합계: `672` files (`24,638,367 B`, `23.50 MiB`)**
5. **검증 요약**
   - `npm run check:arch` (0 issues, 200 TS files), `npm run validate:assets` (0 errors), `npm run validate:scripts` (0 errors), `npm run typecheck`, `tsc -p tsconfig.electron.json --noEmit`, `npm run build:web` (2.27s), `npm run test` (**27 suites / 115 tests ALL PASSED**, `determinismBaseline.test.ts`·`productionDistGalaxyS25E2E.test.ts` 포함) 모두 통과.
   - 초기 `vite preview` 데스크톱(`1280×720`) 라이브 E2E에서 0 console errors / 초기 네트워크 오류 0 / 60.0~60.32 FPS를 실측하며 도로 투과 잔상·건물 와이어프레임·바다 체크무늬·수평선 정렬 결함 4건을 식별·수정했고, 수정 후 재생성된 타일셋/배경 PNG를 직접 검사해 해결을 확인했습니다(이후 사용자 요청에 따라 Chrome 원격 디버깅이 비활성화되어 수정 후 재라이브 브라우저 E2E 및 `915×412` 실브라우저 확인은 생략되었으며 `npm run preview`로 로컬 확인 가능합니다).

---

## 4. Stage 11 완료 요약 (비규격 스프라이트 시트 자동 슬라이서 · `AssetPreviewScene` 보정 UI)

1. **6단계 순수 픽셀 슬라이서 엔진 (`src/assets/slicer/` & `scripts/lib/irregularSheetSlicer.mjs`)**
   - `MultiLayerBackgroundCleaner` ([backgroundCleaner.ts](src/assets/slicer/backgroundCleaner.ts)): 외곽 코너·테두리 최빈색 4방향 플러드 필 + 내부 사각 패널(청록/회색 등) 자동 제거 + 폭/높이 60% 이상 1~4px 구분선 제거 + 외곽 1px 프린지 정리.
   - `HeaderAndLabelFilter` ([componentAnalyzer.ts](src/assets/slicer/componentAnalyzer.ts)): 8-CCL 기반 미세 먼지, 최상단 18% 타이틀/크레딧 배너(`HEADER_BANNER`), 3개 이상 일렬 소형 글리프 군집 텍스트 라벨(`TEXT_LABEL`) 제외 및 `excludedRegions[]` 복구용 보존.
   - `SatellitePartMerger` ([satelliteMerger.ts](src/assets/slicer/satelliteMerger.ts)): 본체 후보(중위 높이 이상 + 엎드린 폼) 식별 + 인접 본체 간 수직 투영 골짜기(Vertical Projection Valley) 병합 차단 경계 보존 + 3px 띄워진 모자·무기·구름 등 위성 파츠 자동 병합.
   - `RowActionClassifier` & `TorsoWeightedPivotSolver` ([rowClassifierAndPivot.ts](src/assets/slicer/rowClassifierAndPivot.ts)): Y-구간 겹침 `>= 35%` 행 클러스터링, 11개 표준 상태 자동 할당/안전 폴백, **발바닥 최소 연속 밀도 `pivotY`** + **장거리 공격 프레임의 수직 몸통·지지발 코어 슬라이딩 윈도우 `pivotX`** (기하 중앙 사용 금지로 공격 시 뒤밀림 원천 차단).
   - `packVariableSpriteAtlas` & `renderDebugOverlayRgba` ([atlasPackerAndDebug.ts](src/assets/slicer/atlasPackerAndDebug.ts)): `2px` 패딩 투명 아틀라스(`atlasMode: "VARIABLE_PACK"`, 상태별 `frameRects: [{ x, y, w, h, pivotX, pivotY }]`) 출력, `IDLE` 0번 상반신 64×64 초상화 추출, `exported_thumbnails/import_debug/{key}_debug.png` 시각 디버그 오버레이(초록=채택, 빨강X=제외, 노랑=피벗, 행 상태 라벨) 생성.
2. **CLI 원클릭 임포트 & 런타임 가변 프레임 지원**
   - `npm run import:pack` ([import-sprite-pack.mjs](scripts/import-sprite-pack.mjs)): `raw_assets/packs/`에 비규격 `.png`, `.zip`, `.recipe.json` 투입 시 자동 처리 및 `source: "USER_CUSTOM_SHEET"` 등록.
   - 지원 옵션: `--file=<name>`, `--preview-only` (실제 반영 없이 디버그 오버레이만 생성), `--flip-x`, `--tolerance=<N>`, `--scale=<F>`, `--keep-portraits`, `--dir=<path>`.
   - 런타임 렌더러([spriteFrameRenderer.ts](src/render/sprite/spriteFrameRenderer.ts), [spriteEffectCache.ts](src/render/sprite/spriteEffectCache.ts), [islandEntityDrawers.ts](src/render/rpg/islandEntityDrawers.ts), [assetLoader.ts](src/assets/assetLoader.ts), [assetPreviewCanvas.ts](src/scenes/dev/assetPreviewCanvas.ts)) 및 무결성 검사([validate-assets.ts](scripts/validate-assets.ts))가 기존 98종 고정 `GRID`와 신규 `VARIABLE_PACK`을 모두 지원합니다.
3. **`AssetPreviewScene` 인터랙티브 슬라이서 탭 (`✂ 시트 임포트 / 슬라이서`)**
   - [`SlicerTabController`](src/scenes/dev/slicerTabController.ts), [`slicerTabDom.ts`](src/scenes/dev/slicerTabDom.ts), [`slicerTabCanvas.ts`](src/scenes/dev/slicerTabCanvas.ts) 구현 및 [`AssetPreviewScene`](src/scenes/dev/assetPreviewScene.ts) 4번째 탭(`'SLICER'`) 탑재.
   - 기능: PNG 드래그 앤 드롭·합성 테스트 시트 로드, 초록/빨강X/노랑 오버레이, 클릭 제외↔복구 토글, 2프레임 선택 병합, 행별 11상태 드롭다운, 노랑 피벗 십자선 드래그, 발바닥/몸통 기준선 실시간 애니메이션 프리뷰, **`raw_assets/packs/{unitId}_{formId}.recipe.json`** 다운로드(자동 휴리스틱보다 100% 최우선 적용).
4. **검증 요약**
   - `npm run check:arch` (0 issues, 210 TS files), `npm run validate:assets` (0 errors), `npm run validate:scripts` (0 errors), `npm run typecheck`, `tsc -p tsconfig.electron.json --noEmit`, `npm run build:web` (1.98s) 모두 통과.
   - `npm run test`: **29 suites / 119 tests ALL PASSED** (합성 비규격 시트·몸통 `pivotX`·`.recipe.json`·CLI `--preview-only` 검증 [`irregularSheetSlicer.test.ts`](tests/assets/irregularSheetSlicer.test.ts) + UI 슬라이서 인터랙션 라운드트립 [`assetPreviewSlicerUi.test.ts`](tests/render/assetPreviewSlicerUi.test.ts) + 기존 `src/core/`·렌더러·`dist-web/` E2E 회귀 전원 통과).

---

## 5. Stage 12 완료 요약 (4대 핵심 거점 섬 7계층 리디자인 · 살아 있는 마을 · BFS 맵 검증기)

1. **확장 7계층 거점 맵 스키마 & 살아 있는 마을 시스템 (`src/core/` 순수 결정론 유지)**
   - [`rpgSchemas.ts`](src/data/schemas/rpgSchemas.ts) & [`rpgAndAssetSchemaGuards.ts`](src/data/rpgAndAssetSchemaGuards.ts): 기존 13개 섬 JSON과의 100% 하위 호환을 유지한 채 `tileMap`(ground/detail/solid/overhead/surface 7계층 그리드), `zones[]`(Safe Area 구역 배너), `chests[]`(숨겨진 보물상자), `markers[]`, `landmarks[]`, `ambientProfile`, `lightingProfile` 및 NPC `patrolWaypoints[]`/`pauseTicks`/`facing`/`ambientBubbleText` 확장.
   - [`islandTileCollision.ts`](src/core/rpg/islandTileCollision.ts) & [`islandLivingVillage.ts`](src/core/rpg/islandLivingVillage.ts) & [`islandRuntimeEngine.ts`](src/core/rpg/islandRuntimeEngine.ts): 타일 기반 축 분리 슬라이딩 충돌, NPC 자동 순찰(플레이어 양보·대화 시 플레이어 방향 전환 및 종료 후 복귀), 42px 스로틀링 재질별 발소리/파티클 이벤트, 2.2초 구역 배너, 숨겨진 보물상자 15종(베리·TP·파티 회복) 보상 처리.
   - **세이브 v5 & 안티치트 호환 ([`schema.ts`](src/core/save/schema.ts), [`serializer.ts`](src/core/save/serializer.ts), [`saveDeserialization.ts`](src/core/save/saveDeserialization.ts), [`legalityValidator.ts`](src/core/save/legalityValidator.ts)):** `CURRENT_SAVE_VERSION = 5`를 유지한 채 `world.openedChestIds?: string[]`(구버전 복원 시 기본값 `[]`)를 저장/복원하며, `LegalityValidator`가 실존 상자 ID·중복 개봉·재화 상한을 교차 검증.
2. **스크롤링 카메라 · 청크 컬링 · 랜드마크 · 무블러 조명 · 발소리 연동**
   - [`islandCamera.ts`](src/render/rpg/islandCamera.ts), [`explicitTilemapBaker.ts`](src/render/tileset/explicitTilemapBaker.ts), [`layeredTilemapRenderer.ts`](src/render/tileset/layeredTilemapRenderer.ts): `48×34 ~ 56×40` 대형 거점 맵에서 플레이어 추적 클램프 카메라 및 `256×256` 청크 뷰포트 컬링 적용, Layer 4 지붕·수관·도리이·다리·유리돔·파이프 뒤편 자연스러운 가림 구현, `dispose()` 시 모든 오프스크린 캔버스 즉시 `width=0; height=0` 해제.
   - [`islandLandmarksDrawer.ts`](src/render/rpg/islandLandmarksDrawer.ts), [`footstepEffectPool.ts`](src/render/rpg/footstepEffectPool.ts), [`ambientParticleSystem.ts`](src/render/rpg/ambientParticleSystem.ts), [`atmosphereLightingOverlay.ts`](src/render/rpg/atmosphereLightingOverlay.ts): 회전 풍차·분수대·갈레라 크레인·붉은 도리이·등불·홀로그램 전광판·유리 돔 랜드마크, `ObjectPool` 기반 6재질 발먼지/물결(`<= 32`)·환경 파티클(`<= 42`), 색상별 64×64 사전 베이킹 글로우(`shadowBlur` 0건), 재질별 스로틀링 발소리 SFX([`sfxManager.ts`](src/audio/sfxManager.ts)) 및 구역 배너 HUD([`islandHudRenderer.ts`](src/render/rpg/islandHudRenderer.ts)) 연동.
3. **4대 핵심 거점 섬 전면 리디자인 (`src/data/islands/`, 에피소드·스토리 디렉터 좌표 동기화)**
   - **후샤 마을 ([`foosha_shells.json`](src/data/islands/foosha_shells.json), `48×34` = `1536×1088px`):** 남쪽 만 곡선 해안·목조 부두, 중앙 돌길 광장·우물·현상금 게시판, 북서 회전 풍차 언덕, 파티즈 바 지붕 뒤 좁은 통로, 북쪽 쉘즈타운 해군지부 (`zones=5`, `chests=3`, `npcs=7`, `markers=5`).
   - **워터 세븐 ([`water_seven.json`](src/data/islands/water_seven.json), `52×36` = `1664×1152px`):** 블루 스테이션 야가라 선착장, 4프레임 대운하 & 아치교 2곳(오버헤드 난간), 서쪽 분수 광장, 갈레라 1번 도크(조선 크레인·깃발), 동쪽 전망 테라스 (`zones=5`, `chests=4`, `npcs=7`, `markers=5`).
   - **와노쿠니 ([`wano_onigashima.json`](src/data/islands/wano_onigashima.json), `52×38` = `1664×1216px`):** 남쪽 나루터·붉은 도리이(오버헤드), 꽃의 도읍 직선 대로·겹기와 가옥 뒷골목, 서쪽 잉어 연못(목교+숨은 징검다리)·대나무 캐노피 숲·작은 사당, 북쪽 천수각 성문·카이도 결전지, 노을빛 등불 글로우 (`zones=4`, `chests=4`, `npcs=7`, `markers=5`).
   - **에그헤드 ([`egghead.json`](src/data/islands/egghead.json), `56×40` = `1792×1280px`):** 파비리오페이즈 미래 도킹 베이(써니호 정박), 서쪽 프론티어 레이저 배리어 퍼즐(기존 `(450,135)`/`(450,405)` 호환 유지)·우회 서버실, 중앙 네온 플라자·유리 돔·홀로그램 전광판, 동쪽 스카이워크 에너지 파이프, 북쪽 펑크 레코드 게이트 (`zones=5`, `chests=4`, `npcs=7`, `markers=6`).
4. **BFS 맵 도달성 자동 검증 CLI (`scripts/validate-maps.mjs`, `npm run validate:maps`) & 최종 검증 결과**
   - 17개 전체 섬 JSON 대상으로 타일 ID 범위, 스폰 비충돌, 스폰→출항·마커·NPC·보물상자·보스·에그헤드 배리어 전/후 2패스 BFS 도달성, NPC 순찰 구간 충돌, 2.5D 오버헤드 통과, 보물상자 보상 합법성을 자동 검증(`0 errors`).
   - **최종 검증 결과:** `npm run validate:maps` (`0 errors`, 17섬 / 15상자), `npm run validate:assets` (`0 errors`), `npm run validate:scripts` (`43 NPCs / 67 lines`, `0 errors`), `npm run check:arch` (`216 TS files`, `0 issues`), `npm run typecheck` & Electron `tsc` (`0 errors`), Vitest **30개 스위트 / 123개 테스트 전원 통과**([`hubMapLivingVillageAndChests.test.ts`](tests/core/hubMapLivingVillageAndChests.test.ts) 내 갤럭시 S25 울트라 `915×412 → 1199×540` 스크롤링/청크 컬링/오버헤드/Y정렬/`< 16.6ms` 60FPS 예산/`dispose()` 검증 포함), `npm run build:web` (`2.16s`, `dist-web/` `672 files`, `24,770,372 bytes`, `23.62 MiB`).

---

## 6. Stage 13 완료 요약 (전 세계 13개 미개편 섬 7계층 일괄 리디자인 · 17/17 전 섬 통일)

1. **결정론적 7계층 맵 빌더 구축 (`scripts/build-island-maps.mjs`, `scripts/maps/`)**
   - `mapCanvasBuilder.mjs` + 해역별 블루프린트(`eastBlueBlueprints.mjs`, `grandLineBlueprints.mjs`, `newWorldBlueprints.mjs`)로 13개 미개편 섬을 `44×30 ~ 54×38` 규격의 7계층 맵으로 컴파일하고, 기존 스토리 NPC·보스 기믹(`waterZones`, `WATER_BARREL`, `SURVIVE_TIME`, 마르코 2:2 3연전, `COLOSSEUM`, `RAID`, 엘바프 거대 스케일)·에피소드 `steps[].targetPos`를 100% 무손실 동기화 (`foosha_shells`·`water_seven`·`wano_onigashima`·`egghead` 4대 거점 원형 보존).
2. **스키마 · 동적 안티치트 · 7계층 렌더러 확장 (`src/core/` 결정론 & `<400줄` 유지)**
   - [`rpgSchemas.ts`](src/data/schemas/rpgSchemas.ts): `'snow'` 발소리 재질, 15종 고유 랜드마크(`CIRCUS_TENT`, `FISH_PROW`, `SHARK_GATE`, `EXECUTION_PLATFORM`, `ROPEWAY_TOWER`, `CLOCK_TOWER`, `BEANSTALK_ARCH`, `GOLDEN_BELL`, `GOTHIC_MAST`, `WARSHIP_HULL`, `CORAL_ARCH`, `COLOSSEUM_ARCH`, `WAFFLE_ARCH`, `WORLD_TREE_ROOT`, `RUNE_MONOLITH`), 10종 환경 파티클(`SMOKE`, `RAIN`, `SNOW`, `SAND`, `BAT`, `EMBER`, `BUBBLE`, `SUGAR_SPARKLE`, `GOLDEN_LEAF`, `LIGHTNING_SPARK`), `postClearParticles` 추가.
   - [`worldLandmarkDrawers.ts`](src/render/rpg/worldLandmarkDrawers.ts) & [`ambientParticlePresets.ts`](src/render/rpg/ambientParticlePresets.ts): 제로 GC · `shadowBlur` 0건 픽셀 랜드마크(오버헤드 가림 포함) 및 드럼 왕국 클리어 후 눈송이→벚꽃 눈 자동 전환 지원.
   - [`legalityValidator.ts`](src/core/save/legalityValidator.ts) & [`saveDeserialization.ts`](src/core/save/saveDeserialization.ts): `collectDynamicChestRegistry`로 전체 17개 섬 60개 보물상자를 동적 교차 검증하고, 구 `960×540` 세이브의 차단 좌표 진입 시 `spawnPoint` 안전 스냅 적용.
3. **13개 신규 리디자인 섬 요약 (`45`개 신규 상자 · `52`개 구역 · `74`명 NPC 추가)**
   - **이스트 블루 (4):** `orange_town`(`44×30`, 상자 3), `baratie`(`46×32`, 사방 해수면+거대 물고기 뱃머리+전투 지느러미 갑판, 상자 3), `arlong_park`(`46×34`, 귤나무 숲 캐노피+톱상어 성문+중앙 수영장, 상자 3), `loguetown`(`48×34`, 로저 처형대 광장+빗방울/파문, 상자 3).
   - **위대한 항로 (5):** `drum_kingdom`(`46×36`, 로프웨이+설산 계단+클리어 후 벚꽃 눈 전환, 상자 3), `alabasta`(`50×36`, 바자르 천막+오아시스+시계탑, 상자 4), `skypiea`(`50×36`, 거대 콩줄기 아치+샨도라 황금종, 상자 4), `thriller_bark`(`48×36`, 안개 묘지+돌다리+밤 조명+박쥐, 상자 3), `marineford`(`52×36`, 초승달 얼음만 군함+포대 방벽+오리스 광장, 상자 3).
   - **신세계 (4):** `fishman_island`(`50×36`, 산호 아치+인어 만+상승 공기방울+해저 빛줄기, 상자 4), `dressrosa`(`52×36`, 붉은 지붕 골목+콜로세움 아치+해바라기 언덕, 상자 4), `totto_land`(`50×36`, 와플 아치+초콜릿 분수+설탕 가루, 상자 4), `elbaf`(`54×38`, 세계수 아담 거대 뿌리 다리+룬 석비+명계 절벽, 상자 4).
4. **전수 검증 결과:**
   - `npm run validate:maps` (`17/17` 7계층 섬, `60` 고유 상자, `71` 구역, `102` NPC, `0 errors`), `npm run validate:assets` (`0 errors`), `npm run validate:scripts` (`102 NPCs / 130 lines`, `0 errors`), `npm run check:arch` (`218 TS files`, `0 issues`), `npm run typecheck` (`0 errors`), Vitest **31개 스위트 / 127개 테스트 전원 통과**([`allIslands7LayerAndChests.test.ts`](tests/core/allIslands7LayerAndChests.test.ts) 포함), `npm run build:web` (`2.42s`, `dist-web/` `672 files`, `24,970,482 bytes`, `23.81 MiB`).

---

## 7. Stage 14 완료 요약 (`SeaSailingScene` 2D 픽셀 RPG 월드맵 전면 개편)

1. **20종 고유 픽셀 랜드마크 베이킹 CLI (`npm run bake:landmarks`, `public/assets/world/landmarks/`)**
   - [`bake-landmarks.mjs`](scripts/bake-landmarks.mjs) + [`landmarkPixelPrimitives.mjs`](scripts/lib/landmarkPixelPrimitives.mjs) · [`landmarkPaintersEastAndGrand.mjs`](scripts/lib/landmarkPaintersEastAndGrand.mjs) · [`landmarkPaintersNewWorld.mjs`](scripts/lib/landmarkPaintersNewWorld.mjs): `sea_zones.json`의 전 **18개 섬 노드**(`foosha_shells`·`impel_down` 포함) + **2개 해역 관문**(`gate_reverse_mountain`, `gate_red_line`) = **총 20종**의 4프레임 애니메이션 픽셀 PNG 시트(`96×96 ~ 144×144`, 1px 유채색 외곽선, 3단계 색조 명암, 해안 포말 파도 링)를 디스크에 베이킹하고 [`landmarks.json`](src/data/assets/landmarks.json), [`AssetLoader`](src/assets/assetLoader.ts), [`validate-assets.ts`](scripts/validate-assets.ts)에 완전 연동.
   - [`seaLandmarkRenderer.ts`](src/render/sea/seaLandmarkRenderer.ts) & [`sailingEntityRenderer.ts`](src/render/rpg/sailingEntityRenderer.ts) & [`seaWakeParticlePool.ts`](src/render/sea/seaWakeParticlePool.ts): 입항 근접 시 컴팩트 정보 배너(섬 이름·클리어 배지·골드/블루 마커·보물상자 `X/Y`·`[입항]`), `ep_water_seven` 완료 후 `going_merry ↔ thousand_sunny` 자동 전환, 8방향 기울임·돛 부풀림, 96슬롯 제로 할당 `SeaWakeParticlePool` 포말 항적 구현.
2. **해역별 해류·소용돌이 물리 및 동적 날씨·접근성 가드**
   - [`seaCurrentPhysics.ts`](src/core/rpg/seaCurrentPhysics.ts) & [`sailingPhysics.ts`](src/core/rpg/sailingPhysics.ts) & [`seaCurrentsRenderer.ts`](src/render/sea/seaCurrentsRenderer.ts): `currents[]` 폴리라인 항로(순류 **+35%** 가속, 역류 **-20%** 완화 감속, 흐르는 픽셀 리본·방향 화살표) 및 `whirlpools[]`(접선 회전 + 완만한 중심 흡인 + `coreRadiusPx` 안전 반발 코어로 고립/즉사 원천 차단 + 쿠 드 버스트 즉시 탈출).
   - [`seaWeatherRenderer.ts`](src/render/sea/seaWeatherRenderer.ts): 이스트 블루(따뜻한 햇살·갈매기 비행), 위대한 항로(드럼 왕국 눈/클리어 시 벚꽃 눈 · 알라바스타 모래바람 · 스릴러 바크 보라 안개 · 마린포드 표류 유빙 `300px` 근접 크로스페이드), 신세계(폭풍 구름·사선 빗줄기·해왕류 수중 그림자·엘바프 황금 오로라) 구현 및 **`flashEffectEnabled === false` 시 번개·섬광 100% 차단** 준수.
3. **우상단 9-슬라이스 양피지 미니맵 · 확대 해도(`M`/탭) · 동적 보물 집계 · 빠른 항해**
   - [`seaMinimapHud.ts`](src/render/sea/seaMinimapHud.ts) & [`sailingHudRenderer.ts`](src/render/rpg/sailingHudRenderer.ts): 좌하단 조이스틱과 겹치던 구형 미니맵을 제거하고 우상단(`☰ 메뉴` 아래 `148×98px`)에 9-슬라이스 양피지+나침반 미니맵(해역 보물 `X/Y · Z%`, 골드 마커 핑, 해류·방향성 선박) 배치 및 `LogPoseHUD` 좌측 이동으로 `915×412`·`1280×720` Safe Area 0충돌 확보.
   - [`seaChartLogic.ts`](src/core/rpg/seaChartLogic.ts), [`seaChartOverlay.ts`](src/render/sea/seaChartOverlay.ts), [`seaChartDetailCard.ts`](src/render/sea/seaChartDetailCard.ts), [`seaChartController.ts`](src/scenes/sea/seaChartController.ts): `M` 키 또는 미니맵 탭으로 여는 3해역 탭 확대 해도, `DataRegistry` 기반 섬/해역/전체 60보물상자 실시간 집계 및 `100% ★` 금색 왕관 배지, `episodeFlags['visited_island_*']` 기반 Save v5 호환 `[빠른 항해]` 구현.
4. **전수 검증 결과 (`2026-11-23`):**
   - `npm run bake:landmarks` (20/20 PNG), `npm run validate:assets` (0 errors), `npm run validate:maps` (17/17 7-layer, 60 chests, 0 errors), `npm run validate:scripts` (0 errors), `npm run check:arch` (`228` TS files, 0 issues, `0 shadowBlur`, `0 circular deps`), `npm run typecheck` (0 errors), Vitest **33 suites / 136 tests ALL PASSED**([`seaWorldmapPhysicsAndLandmarks.test.ts`](tests/core/seaWorldmapPhysicsAndLandmarks.test.ts) + [`seaChartAndSafeArea.test.ts`](tests/core/seaChartAndSafeArea.test.ts) 포함), `npm run build:web` (`dist-web/` `692` files, `25,055,826 bytes`, `landmarks` `20/20`).

---

## 8. Stage 15 완료 요약 (PixiJS v8 WebGL2 HD-2D 수직 슬라이스 전환 · 코드 도트 생성 단절 · 전투 속도 제어)

1. **전투 속도 조절 & 일시정지 시스템 (`battleSpeedControl.ts` · `battleSpeedHud.ts` · `settingsModal.ts`)**
   - `0.5x` / `0.75x` / `1.0x` 전투 배속 프리셋(기본값 또는 사용자 조정 유지) 및 일시정지 토글을 추가하고, Top Bar / 캔버스 HUD([`battleSpeedHud.ts`](src/render/hud/battleSpeedHud.ts)) / 환경설정 모달([`settingsModal.ts`](src/scenes/modals/settingsModal.ts))과 동기화 ([`battleSpeedControl.test.ts`](tests/core/battleSpeedControl.test.ts) 3/3 통과).
2. **코드 기반 프로시저럴 도트 베이커 `legacy/` 격리 및 PixiJS v8 WebGL2 코어 구축**
   - `src/core/` 60Hz 결정론·전투 공식·세이브 마이그레이터는 **단 1줄도 변경하지 않고 보존**하며, 기존 절차적 도트 베이커(`proceduralPixelSheetBaker`, `proceduralTilesetBaker`, `luffyArticulatedPixelSheet`, `scripts/bake-sprites.mjs`, `scripts/bake-landmarks.mjs`)는 [`src/assets/legacy/`](src/assets/legacy/proceduralPixelSheetBaker.ts) 및 [`scripts/legacy/`](scripts/legacy/bake-sprites.mjs)로 격리하고 기존 경로에는 `@deprecated` 얇은 재수출 스텁만 유지.
   - [`renderBackend.ts`](src/render/backend/renderBackend.ts), [`PixiStageHost.ts`](src/render/pixi/PixiStageHost.ts), [`ProAssetLoader.ts`](src/render/pixi/ProAssetLoader.ts), [`proAssetManifest.ts`](src/data/assets/proAssetManifest.ts): WebGL2 렌더링(`TextureStyle.defaultOptions.scaleMode = 'nearest'`, `antialias: false`, `roundPixels: true`), Aseprite JSON Hash/Array · TexturePacker · `.meta.json` 자동 파서, 누락 아트는 중립 실루엣 폴백(`createMissingProArtPlaceholder`)만 사용하며 `src/render/pixi/` 및 `src/render/backend/` 내 레거시 베이커 import **0건** 강제([`pixiCoreAndProLoader.test.ts`](tests/render/pixiCoreAndProLoader.test.ts) 5/5 통과).
3. **Tiled 1.10(`.tmj`) 로더 & WebGL2 셰이더 파이프라인 (`src/render/pixi/tiled/`, `shaders/`)**
   - [`tiledSchema.ts`](src/render/pixi/tiled/tiledSchema.ts) & [`TiledMapLoader.ts`](src/render/pixi/tiled/TiledMapLoader.ts): H/V/D 타일 플립 디코딩, 다중 타일 레이어(`water`/`ground`/`walls`/`overhead`), 애니메이션 타일, `16×16` 청크 뷰포트 컬링(`19.5:9` 가변 폭 대응), 지붕 근접 투명화, Y-정렬 지원 및 [`validate-maps.mjs`](scripts/validate-maps.mjs)의 `.tmj` BFS 도달성 검증 통과.
   - [`DynamicLightingLayer.ts`](src/render/pixi/shaders/DynamicLightingLayer.ts), [`SelectiveBloomFilter.ts`](src/render/pixi/shaders/SelectiveBloomFilter.ts), [`WaterReflectionPipeline.ts`](src/render/pixi/shaders/WaterReflectionPipeline.ts), [`AtmosphereColorGradingFilter.ts`](src/render/pixi/shaders/AtmosphereColorGradingFilter.ts), [`GodRaysAndParticlesLayer.ts`](src/render/pixi/shaders/GodRaysAndParticlesLayer.ts), [`ShockwaveDistortionFilter.ts`](src/render/pixi/shaders/ShockwaveDistortionFilter.ts): GLSL 300 es `Filter` 기반 1/2 해상도 RT 동적 2D 라이트맵, 선택적 블룸(`flashEffectEnabled === false` 시 `<= 0.45` 제한), 실시간 수면 반사·물결 왜곡, 아침/낮/노을/밤 색보정, 갓레이·풀링 GPU 파티클, 무장색 패링 방사형 충격파 왜곡 구현([`tiledLoaderAndShaders.test.ts`](tests/render/tiledLoaderAndShaders.test.ts) 3/3 통과).
4. **수직 슬라이스(루피 + 후샤 마을 `.tmj` + 첫 전투) & 외부 에셋 파이프라인 & 비주얼 튜닝(`F9`)**
   - `npm run import:pro` ([`import-pro-assets.mjs`](scripts/import-pro-assets.mjs)) & [`build-foosha-tmj.mjs`](scripts/build-foosha-tmj.mjs) & [`PRO_ART_DROP_GUIDE.md`](PRO_ART_DROP_GUIDE.md): 외부 CC0 타일셋 3종 + 48×34 [`foosha_village.tmj`](public/assets/pro/maps/foosha_village.tmj) (`lights=9`, `chests=3`, `npcs=7`) + 루피/조로/버기 Aseprite 시트 + 4레이어 `east_blue_harbor` + 7종 VFX + 컷인 에셋을 `public/assets/pro/`에 구축.
   - [`PixiFooshaIslandScene.ts`](src/render/pixi/scenes/PixiFooshaIslandScene.ts), [`PixiBattleVerticalSliceScene.ts`](src/render/pixi/scenes/PixiBattleVerticalSliceScene.ts), [`PixiBattleEffectsHelper.ts`](src/render/pixi/scenes/PixiBattleEffectsHelper.ts), [`pixiVerticalSliceController.ts`](src/scenes/controllers/pixiVerticalSliceController.ts), [`visualPolishDrawer.ts`](src/scenes/dev/visualPolishDrawer.ts): PixiJS WebGL2 캔버스(`zIndex: 1`) + 투명 2D HUD 오버레이(`zIndex: 2`) 합성, 5회 연속 `Title → Foosha → Battle → Title` 왕복 시 `RenderTexture` 누수 **0건** 확인([`pixiVerticalSliceAndMemoryLeak.test.ts`](tests/render/pixiVerticalSliceAndMemoryLeak.test.ts) 4/4 통과).
5. **전수 검증 & Android Debug APK 빌드 결과 (`2026-11-23`):**
   - `npm run check:arch` (`251` TS files, `0 issues`, `0 shadowBlur`, `0 circular deps`), `npm run typecheck` (`0 errors`), `npm run validate:maps` (`17/17` + `foosha_village.tmj` BFS `0 errors`), `npm run validate:assets` (`0 errors`), `npm run validate:scripts` (`0 errors`), `npm run build:web` (`vite` 5.07s, `dist-web/` `728` files, `26,207,007 bytes`, `pixi-webgl` chunk `549.34 kB`, Workbox `36 entries` / `2124.26 KiB`), Vitest **37 suites / 151 tests ALL PASSED**.
   - **Android Debug APK 패키징 완료:** `npm run package:android:sync` (`dist-android/` `1079`모듈 `4.26s`, Capacitor 7종 플러그인 동기화 `0.638s`, `sw.js` 제외 및 `foosha_village.tmj`·`luffy_base.png` 동기화 확인) + `android\gradlew.bat assembleDebug` (JDK 17 / Gradle 8.14.3, `BUILD SUCCESSFUL in 25s`) → `android/app/build/outputs/apk/debug/app-debug.apk` (`28,831,149 bytes`, 약 `27.50 MiB`).

---

## 9. Stage 16 완료 요약 (`pro_manifest.json` SSOT · 무손실 WebP 파이프라인 · PixiJS v8 4계층 번들 매니저)

1. **`src/assets/pro_manifest.json` v2.0.0 단일 진실 공급원(SSOT) & CLI ([`pro-manifest-cli.mjs`](scripts/pro-manifest-cli.mjs))**
   - Wave 0~4 전체 프로 에셋(`188`엔트리: `PLACEHOLDER` / `IMPORTED` / `VERIFIED`)을 단일 매니페스트로 통합 관리하고 `public/assets/pro/pro_manifest.json`에 미러링.
   - `npm run assets:status` 요약(`VERIFIED=1, IMPORTED=81, PLACEHOLDER=106`, 디스크 `19.86 MB`, 전체 예상 VRAM `19.98 MB`):
     - **Wave 0:** `62/62` (`100.0%`, `19.82 MB` 디스크 / `15.43 MB` VRAM)
     - **Wave 1:** `20/38` (`52.6%`, `0.04 MB` 디스크 / `4.55 MB` VRAM — 3대 해역 월드맵 랜드마크 + 전투 코어)
     - **Wave 2 (`0/8`), Wave 3 (`0/68`), Wave 4 (`0/12`):** `PLACEHOLDER` 카탈로그 등록 완료
   - `npm run assets:verify -- --id=...` (`sprite:luffy_base` 승격 검증) 및 `npm run validate:pro` (대소문자 100% 일치·1024/2048 해상도 상한·Aseprite JSON / `.tsx` / `.tmj` 링크 무결성 `0 errors`).
2. **무손실 WebP(Lossless WebP) 자동 변환 파이프라인 ([`optimize-pro-assets.mjs`](scripts/optimize-pro-assets.mjs), [`losslessWebpAndProManifest.test.ts`](tests/assets/losslessWebpAndProManifest.test.ts))**
   - `sharp` `lossless: true, effort: 6, alphaQuality: 100, nearLossless: false, exact: true` 변환으로 투명 픽셀 포함 **R, G, B, A 100% 비트 동일성(오차 0)** 단위 테스트 증명.
   - 일반 아틀라스 `1024×1024` / 거대 보스·타일셋·배경 `2048×2048` 상한 가드레일 적용 (`beam_core.png` `1070×96` → `856×192` 2D 그리드 자동 분할), 원본은 `raw_assets/pro_originals/`에 보존하고 `public/assets/pro/` 내 중복 `.png` 제거.
   - Aseprite `.json`, `.meta.json`, Tiled 외부 `.tsx`([`master_port_village.tsx`](public/assets/pro/tilesets/master_port_village.tsx)), `.tmj`([`foosha_village.tmj`](public/assets/pro/maps/foosha_village.tmj)), `pro_manifest.json` 경로 자동 동기화.
   - **PNG → Lossless WebP 용량 절감 실측:** `285.8 KB → 148.9 KB` (**`137.0 KB` / `47.91%` 절감**, `dist-web/assets/pro/` `.webp` `29`개 / 중복 `.png` `0`개).
3. **PixiJS v8 4계층 번들 매니저 & 실시간 UI 연동 ([`PixiAssetBundleManager.ts`](src/render/pixi/PixiAssetBundleManager.ts), [`PixiBundleLoadingOverlay.ts`](src/render/pixi/PixiBundleLoadingOverlay.ts), [`pixiBundleHelpers.ts`](src/render/pixi/pixiBundleHelpers.ts))**
   - `core_always`(상주, `1.99 MB`), `sea_{zone}`(`sea_east_blue` `1.13 MB` 등), `island_{id}`(`island_foosha_village` `2.06 MB`), `battle_{bossId}`(`battle_east_blue_harbor` `11.39 MB`) 4계층 지연 로딩·언로드 및 `syncActivePartyAssets(unitIds)`(최대 4인 증분 로드/해제).
   - URL 단위 참조 카운팅(`assetRefCount`)으로 공유 `.tsx` 마스터 타일셋 조기 파괴 차단, `transitionEpoch` 비동기 씬 전환 경합 롤백, `120ms` 지연 S25 울트라 우하단 Safe Area 로딩 오버레이, `128MB` 모바일 VRAM 예산 경고, `scaleMode: 'nearest'` 강제 유지.
   - [`VisualPolishDrawer`](src/scenes/dev/visualPolishDrawer.ts)(`F9` `[에셋 & VRAM]` · `[미사용 번들 정리]`) 및 [`AssetPreviewScene`](src/scenes/dev/assetPreviewScene.ts)(`PRO VERIFIED/IMPORTED/PLACEHOLDER` · 포맷 · 해상도 · KB 배지) 연동.
4. **5회 왕복 메모리/VRAM 안정성 & 검증 결과 (`2026-11-23`):**
   - `git diff src/core/` **0줄 변경** 유지, `npm run check:arch` (`255`파일 `0 issues`), `tsc --noEmit` (`0 errors`), `npm run validate:pro` (`0 errors`), `npm run validate:maps` (`0 errors`), `npm run validate:assets` (`0 errors`), `npm run build:web` (`dist-web/` `729`파일, `26,273,389 bytes`), Vitest **39개 스위트 / 160개 테스트 ALL PASSED**.
   - **5회 연속 `Title → Foosha → Sea East Blue → Battle → Foosha → Title` 왕복([`pixiAssetBundleManager.test.ts`](tests/render/pixiAssetBundleManager.test.ts)):**
     - `Title (core_always)`: `1.99 MB` VRAM (`14` 텍스처 URL) → `island_foosha_village`: `4.05 MB` → `sea_east_blue`: `3.12 MB` → `battle_east_blue_harbor`: `13.38 MB` → `Title` 복귀: **`1.99 MB`** (1회차 스냅샷과 5회차 스냅샷 100% 동일, 누수 `0`).
   - *(호스트 Chrome `DevToolsActivePort` 미활성으로 `vite preview` 라이브 브라우저 CDP 연결은 `BLOCKED` 상태로 보류됨.)*

---

## 10. Stage 17 완료 요약 (Wave 1 6인 프로 아트워크 승격 · 동적 파티/보스 번들 · 2:2 합동기 3종 & 보스 3종 WebGL2 패링·기믹)

1. **Wave 1 6인 외부 아트워크 승격 & 루피 기준 PPU · 몸통 중심 피벗 정규화 ([`wave1ProPromoter.mjs`](scripts/lib/wave1ProPromoter.mjs), [`import-pro-assets.mjs`](scripts/import-pro-assets.mjs), [`PRO_ART_DROP_GUIDE.md`](PRO_ART_DROP_GUIDE.md))**
   - **상태 (`pro_manifest.json` v2.0.0 — `222`엔트리: `VERIFIED=1 / IMPORTED=121 / PLACEHOLDER=100`, Wave 1 `68/80 = 85.0%`):**
     - `zoro_base` (`1.05x`, `113px`, 36f, `party_zoro`, 8초상화+컷인): **`IMPORTED`**
     - `sanji_base` (`1.05x`, `113px`, 37f, `1024×145`, `party_sanji`, 8초상화): **`IMPORTED`**
     - `nami_base` (`0.95x`, `103px`, 37f, `1024×150`, `party_nami`, 8초상화): **`IMPORTED`**
     - `buggy_base` (`1.05x`, `113px`, 36f, `battle_buggy`, 3초상화+4계층 배경): **`IMPORTED`**
     - `arlong_base` (`1.28x`, `138px`, 37f, `1024×212`, `battle_arlong`, 3초상화+4계층 배경): **`IMPORTED`**
     - `morgan_base` (`1.24x` 예약, 48×48 관절 리그 기반이라 코드 도트 베이킹 금지 원칙 준수, `battle_morgan` 4계층 배경은 `IMPORTED`): **`PLACEHOLDER`** (누락 드롭 경로 [`PRO_ART_DROP_GUIDE.md`](PRO_ART_DROP_GUIDE.md) 명세)
   - `TorsoWeightedPivotSolver`로 전 프레임 피벗을 계산하고 디버그 오버레이(`exported_thumbnails/import_debug/wave1_*_debug.png`) 및 `lossless: true, exact: true` WebP 변환 완료 (`47`파일 변환, `108.8 KB` / `31.77%` 추가 절감, 전 아틀라스 `<= 1024×1024`).
   - [`PixiBattleVerticalSliceScene`](src/render/pixi/scenes/PixiBattleVerticalSliceScene.ts)가 `referenceIdleHeight` 고정 PPU 비율과 프레임별 `anchorX`/`anchorY`를 적용해 웅크림/공격 시 크기 변형 및 몸통 뒤밀림을 방지합니다.
2. **4계층 동적 파티 풀(`party_*`) & 보스 전용 번들(`battle_morgan` / `battle_buggy` / `battle_arlong`) 연동**
   - [`crewCampModal.ts`](src/scenes/modals/crewCampModal.ts)에 최대 4인 실시간 출전 파티 편성 토글을 추가하고 [`PixiAssetBundleManager`](src/render/pixi/PixiAssetBundleManager.ts) · [`pixiVerticalSliceController.ts`](src/scenes/controllers/pixiVerticalSliceController.ts)에 연결해 편성 동료만 GPU에 유지합니다.
   - `npm run assets:status` 기준 번들별 예상 VRAM: `core_always` **`1.99 MB`** · `party_zoro` **`0.80 MB`** · `party_sanji` **`0.69 MB`** · `party_nami` **`0.71 MB`** · `battle_morgan` **`10.55 MB`** · `battle_buggy` **`11.41 MB`** · `battle_arlong` **`11.42 MB`**.
3. **Wave 1 2:2 합동기 3종 듀얼 컷인 & 보스 3종 WebGL2 패링·기믹 연출 (`src/core/` 0줄 변경)**
   - [`combos.json`](src/data/combos.json) · [`combosRegistry.ts`](src/data/combosRegistry.ts) · [`PixelCutinOverlay.ts`](src/render/pixi/scenes/PixelCutinOverlay.ts): `rubber_three_sword_cannon`(루피+조로), `demon_flame_cross`(조로+상디), `thunder_gear_storm`(루피+나미) 39틱(`0.65s`) 사선 듀얼 스플릿 `.webp` 컷인, 동료 프로 아틀라스 잔상 난입, 선택적 블룸·포인트 광원 및 **`flashEffectEnabled === false` 백색 섬광 차단** 구현.
   - [`PixiParryAndGimmickFeedback.ts`](src/render/pixi/scenes/PixiParryAndGimmickFeedback.ts) · [`BattleBanterOverlay.ts`](src/render/pixi/scenes/BattleBanterOverlay.ts) · [`PixiBattleVerticalSliceScene.ts`](src/render/pixi/scenes/PixiBattleVerticalSliceScene.ts): 근접 패링 흑철 무장색 발광·GLSL 충격파 왜곡·3틱 히트스톱·`"JUST GUARD!"`·`1.4s` 경직 아이콘, 반사 투사체 금색/청백색 궤적, 버기 참격 분할 잔상 & Safe Area 상단 전술 힌트, 아론 파크 `waterZones` [`WaterReflectionPipeline`](src/render/pixi/shaders/WaterReflectionPipeline.ts) 실시간 수면 반사 & 물보라 파티클 연동.
4. **전수 검증 & 5회 왕복 VRAM 안정성 (`2026-11-23`):**
   - `git diff src/core/` **0줄 변경** (`BATTLE_CALC_VERSION === "0.6.0"`, 결정론 `stateHash` 3종 보존), `npm run validate:pro` (`222`엔트리 `0 errors`), `npm run validate:maps` (`0 errors`), `npm run validate:assets` (`0 errors`), `npm run validate:scripts` (`0 errors`), `npm run check:arch` (`259`파일 `0 issues`), `npm run typecheck` (`0 errors`), `npm run build:web` (`dist-web/` `772`파일, `26,470,753 bytes`, `assets/pro/` `.webp` `69`개 / `.png` `0`개), Vitest **40개 스위트 / 164개 테스트 ALL PASSED** ([`wave1ComboAndBundle.test.ts`](tests/render/wave1ComboAndBundle.test.ts) 포함 — `[luffy, zoro] ↔ [sanji, nami]` + `battle_morgan → battle_buggy → battle_arlong` 5회 왕복 시 1회차·5회차 VRAM 완벽 일치 및 누수 `0`).
   - *(프로덕션 `vite preview` 실행 시 호스트 Chrome `DevToolsActivePort` 미활성으로 실브라우저 CDP E2E는 `BLOCKED` 상태로 보류됨.)*

---

## 10.5. Stage 18 완료 요약 (Wave 2 5대 마스터 외부 `.tsx` · 8종 `.tx` 템플릿 · 4대 거점 섬 PixiJS v8 WebGL2 + `.tmj` 승격)

1. **5대 마스터 외부 `.tsx` 바이옴 타일셋 & 8종 공용 `.tx` 오브젝트 템플릿 (`scripts/lib/wave2TilesetAndMapBuilder.mjs`, `public/assets/pro/`)**
   - **외부 `.tsx` 7종(`<= 2048×2048` 무손실 WebP, `<tile>` `surface`·`solid`·`isWater`·`emissive` 및 `<animation>` 정의):** `master_port_village.tsx`(Wave 0 기준선) + `medieval_windmill_extras.tsx` + `master_animated_water.tsx` + **Wave 2 4대 바이옴**(`master_stone_canal.tsx`, `master_desert_palace.tsx`, `master_eastern_pagoda.tsx`, `master_scifi_neon.tsx`). 외부 CC0 시트 승격 및 `raw_assets/tilesets/master_*.png` 투입 시 무중단 핫스왑 지원([`public/assets/pro/CREDITS.md`](public/assets/pro/CREDITS.md) 출처 기록).
   - **Tiled 오브젝트 템플릿 8종 (`public/assets/pro/templates/*.tx`):** `light_point.tx`, `light_lantern.tx`, `chest_hidden.tx`, `marker_story_gold.tx`, `marker_side_blue.tx`, `marker_utility_silver.tx`, `dock_departure.tx`, `npc_patrol_anchor.tx`.
   - **`TiledMapLoader` & `tiledSchema.ts` 확장 ([`tiledSchema.ts`](src/render/pixi/tiled/tiledSchema.ts), [`TiledMapLoader.ts`](src/render/pixi/tiled/TiledMapLoader.ts)):** `<tile>` 커스텀 속성 파싱(`tileMetadataByGid`), `.tx` 템플릿 XML 파싱 및 인스턴스 속성 병합(`parseTiledTxTemplateXml`, `mergeTiledTemplateObject`), `emissiveTileContainer` 자동 분리(SelectiveBloom 연동), `activeTimeMask`/`bloomCore`/`docks`/`polyline` 지원.
2. **4대 핵심 거점 `.tmj` 맵 승격 & WebGL2 바이옴 셰이더/번들 통합 (`src/core/` 0줄 변경)**
   - **Wave 2 `.tmj` 4종 + 후샤 마을 리팩터링 (임베드 타일셋 0건, 100% 외부 `.tsx` + `.tx` 참조):**
     - `water_seven.tmj` (`52×36`, `island_water_seven`, `master_stone_canal.tsx` + **`master_port_village.tsx` 공유 참조 카운팅** 검증)
     - `alabasta.tmj` (`50×36`, `island_alabasta`, `master_desert_palace.tsx` — 오아시스 국부 수면 반사 `regionBounds` + 긴 그림자 `1.55x` + 모래바람 파티클 + 야간 바자르 횃불 대비)
     - `wano_country.tmj` (`islandId: "wano_onigashima"`, `52×38`, `island_wano_country`, `master_eastern_pagoda.tsx` — 기본 `SUNSET` 분위기 + 홍등 블룸 + 연못 반사 + 벚꽃 잎/불씨 파티클)
     - `egghead.tmj` (`56×40`, `island_egghead`, `master_scifi_neon.tsx` — 사이버 시안/인디고 톤 + `emissive` 네온/유리 돔 선택적 블룸 + 레이저 배리어/스위치 2-Pass BFS + `flashEffectEnabled === false` 펄스 감쇠)
   - [`islandAtmospherePresets.ts`](src/render/pixi/scenes/islandAtmospherePresets.ts) · [`PixiProIslandScene.ts`](src/render/pixi/scenes/PixiProIslandScene.ts) · [`PixiFooshaIslandScene.ts`](src/render/pixi/scenes/PixiFooshaIslandScene.ts)(호환 서브클래스) · [`pixiVerticalSliceController.ts`](src/scenes/controllers/pixiVerticalSliceController.ts) · [`pixiBundleHelpers.ts`](src/render/pixi/pixiBundleHelpers.ts) 연동.
3. **검증 요약 (`2026-11-24`, `tests/render/wave2HubIslandsAndTemplates.test.ts`):**
   - `git diff --stat src/core/` **0줄 변경**, `npm run assets:status` (**Wave 2 `8/8 = 100.0%`**, `222`엔트리 `VERIFIED 1 / IMPORTED 129 / PLACEHOLDER 92`), `npm run validate:pro` (`0 errors`, 대소문자 엄격 `.tmj→.tsx→.webp` & `.tmj→.tx`), `npm run validate:maps` (`17/17` + Pro `.tmj ×5` 100% BFS `0 errors`), `npm run validate:assets` (`0 errors`), `npm run validate:scripts` (`0 errors`), `npm run check:arch` (`261`파일 `0 issues`), `npm run typecheck` (`0 errors`), `npm run build:web` (`dist-web/` `794`파일 `27,204,019 bytes`, `assets/pro/` `.webp` `73`개 / `.tmj` `5`개 / `.tsx` `7`개 / `.tx` `8`개 / 중복 `.png` `0`개), Vitest **41개 스위트 / 169개 테스트 ALL PASSED** (5개 허브 19개 상자 `LegalityValidator` 0위반, `master_port_village` 공유 refCount `1→2→1→0`, 5개 허브 × 5회 왕복 RenderTexture 누수 `0` & VRAM 증가 `0` 포함).
   - *(프로덕션 `vite preview --outDir dist-web --port 4173` 브라우저 E2E 시도는 호스트 Chrome `DevToolsActivePort` 파일 부재로 `BLOCKED` 상태 기록.)*

---

## 10.6. Stage 19 완료 요약 (Wave 3 외부 NDS 로스터·각성 폼·13대 아레나 · Wave 4 전 세계 17/17 섬 WebGL2 `.tmj` · 크로스플랫폼 빌드 최적화)

1. **Wave 1 잔여(`usopp`, `don_krieg`, `smoker`) & Wave 3 외부 NDS 주력 로스터·각성 폼·4계층 월드 아레나 승격 ([`wave3RosterPromoter.mjs`](scripts/lib/wave3RosterPromoter.mjs), [`import-pro-assets.mjs`](scripts/import-pro-assets.mjs), [`pro-manifest-cli.mjs`](scripts/pro-manifest-cli.mjs))**
   - **코드 도트 베이킹 금지 원칙 100% 준수:** `source === 'EXTERNAL_WEB_SHEET'` 외부 NDS 시트와 `OPGB2_Mugs.png` 표정 초상화만 승격하여 **밀짚모자 일당 10/10 전원**(`luffy` + 9인 동적 `party_*` 풀), **외부 NDS 보스·동맹 19명**, **변신/각성 폼 8종**(`luffy_gear5`, `zoro_king_of_hell`, `sanji_diable_jambe`, `enel_amuru`, `lucci_hybrid`, `marco_phoenix`, `law_kroom`, `doflamingo_awakening`)을 `TorsoWeightedPivotSolver` 피벗 + PPU 정규화 + 인메모리 직출력 무손실 `.webp`로 구축 (`core_always` VRAM `2.60 MB` 유지).
   - 외부 시트 미확보 유닛(`morgan`, `kaido`, `king`, `katakuri`, `saturn`, `loki`, `s_hawk`, `blueno`, `doppelman`, `unit_*`)은 투명하게 `PLACEHOLDER`로 유지하며, `raw_assets/packs/` 거대 보스 드롭 시 `2048×2048` 상한 자동 허용을 추가([`PRO_ART_DROP_GUIDE.md`](PRO_ART_DROP_GUIDE.md) 갱신).
   - **19개 4계층 패럴랙스 전투 아레나(`east_blue_harbor` + Wave 1 보스 5종 + 13대 월드 아레나):** `sharedAssetIds` 참조 카운팅으로 동일 아레나 공유 보스(예: `battle_lucci ↔ battle_kaku`의 `water7_dock`, `marineford_ice_bay` 5인) 전환 시 텍스처 중복 로드/디스크 중복 0건 달성 및 [`resolveBattleBackdropId`](src/render/pixi/pixiBundleHelpers.ts) · [`PixiBattleVerticalSliceScene`](src/render/pixi/scenes/PixiBattleVerticalSliceScene.ts) · [`PixiVerticalSliceController`](src/scenes/controllers/pixiVerticalSliceController.ts) 전 해역 WebGL2 전투 라우팅 통합.
2. **Wave 4 나머지 12개 섬 마스터 타일셋 리믹스 `.tmj` 승격 — 전 세계 17/17 섬 100% WebGL2 통일 ([`wave4IslandTmjBuilder.mjs`](scripts/lib/wave4IslandTmjBuilder.mjs), [`islandAtmospherePresets.ts`](src/render/pixi/scenes/islandAtmospherePresets.ts), [`GodRaysAndParticlesLayer.ts`](src/render/pixi/shaders/GodRaysAndParticlesLayer.ts), [`PixiProIslandScene.ts`](src/render/pixi/scenes/PixiProIslandScene.ts))**
   - Wave 2의 5대 마스터 외부 `.tsx`와 8종 `.tx` 템플릿만 재사용해 신규 타일셋 VRAM 증가 `0 MB`로 12개 섬(`orange_town`, `baratie`, `arlong_park`, `loguetown`, `drum_kingdom`, `skypiea`, `thriller_bark`, `marineford`, `fishman_island`, `dressrosa`, `totto_land`, `elbaf`)을 `.tmj`로 컴파일(임베드 타일셋 0건, 섬당 8개 이상 동적 광원, 60개 고유 보물상자 100% `LegalityValidator` 일치).
   - 10종 신규 바이옴 WebGL2 GPU 파티클(`RAIN_STORM`, `SNOW_PEAK`, `SAKURA_SNOW`, `SKY_CLOUD`, `SPOOKY_MIST`, `MARINE_ICE`, `UNDERWATER_BUBBLE`, `DRESSROSA_PETAL`, `SUGAR_SPARKLE`, `ELBAF_GOLDEN`)과 드럼 왕국 `ep_drum_kingdom` 클리어 후 눈송이→벚꽃 눈 실시간 전환, 전 동료 NPC 프로 아틀라스 재사용 구현.
3. **크로스플랫폼 Android APK 빌드 래퍼 · Vite 청크 분할 · Windows 무손실 WebP 안정화 ([`build-android-apk.mjs`](scripts/build-android-apk.mjs), [`vite.config.ts`](vite.config.ts), [`optimize-pro-assets.mjs`](scripts/optimize-pro-assets.mjs))**
   - `package.json`의 `package:android:apk`를 Windows(`gradlew.bat`) / macOS·Linux(`./gradlew`) 공용 Node 래퍼로 전환(`--release`, `--skip-sync` 지원).
   - `vite.config.ts`에서 `island-maps-data`(`270.66 kB`), `pro-manifest-data`(`147.15 kB`), `pixi-scenes`(`162.74 kB`)로 분할해 앱 코드·데이터 전 청크를 `500 kB` 미만(`game-data` `287.03 kB`, `index` `454.30 kB`)으로 감축하고 Workbox `opgv-pro-art-cache` 상한을 `500`엔트리로 확장.
   - `import-pro-assets.mjs`의 인메모리 직출력 `.webp` 인코딩 및 `sharp.cache(false)` + 대소문자 무관 CLI 가드 적용으로 Windows 환경의 임시 PNG 쓰기-삭제 경합을 원천 제거.
4. **전수 검증 결과 (`2026-11-24`, [`wave3AndWave4FullWorld.test.ts`](tests/render/wave3AndWave4FullWorld.test.ts)):**
   - `git diff --stat src/core/` **0줄 변경**, `npm run assets:status` (**Wave 0 `100%` / Wave 1 `95.9%` / Wave 2 `100%` / Wave 3 `85.5%` / Wave 4 `100%`**, 총 `364`엔트리 `VERIFIED 1 / IMPORTED 331 / PLACEHOLDER 32 = 91.2%`), `npm run validate:pro` (`0 errors`), `npm run validate:maps` (`17/17` + Pro `.tmj ×17` BFS `0 errors`), `npm run validate:assets` (`0 errors`), `npm run validate:scripts` (`0 errors`), `npm run check:arch` (`261`파일 `0 issues`), `npm run typecheck` (`0 errors`), `npm run build:web` (`5.21s`, `dist-web/` `1,030`파일 `30,401,635 bytes`, `assets/pro/` `.webp` `263`개 / `.tmj` `17`개 / `.tsx` `7`개 / `.tx` `8`개 / 중복 `.png` `0`개), Vitest **42개 스위트 / 173개 테스트 ALL PASSED** (17/17 `.tmj` 60상자 `LegalityValidator` 0위반, 5회 연속 10인 파티·공유 아레나·전 해역 섬 왕복 VRAM/RenderTexture 누수 `0`).

---

## 10.7. Stage 20 완료 요약 (Wave 3 10인 로스터·거대 변신·전체 7종 합동기 · 8대 보스 WebGL2 셰이더 · 단일 보스 VRAM 락)

1. **나머지 밀짚모자 6인 PPU 정규화 · 거대 변신 보조 슬롯 격리 · 전체 2:2 합동기 7종 완성 ([`wave3RosterPromoter.mjs`](scripts/lib/wave3RosterPromoter.mjs), [`proAssetManifest.ts`](src/data/assets/proAssetManifest.ts), [`combos.json`](src/data/combos.json), [`PixelCutinOverlay.ts`](src/render/pixi/scenes/PixelCutinOverlay.ts))**
   - 6인 PPU 정규화 완료: `usopp_base`(`0.98x`, `106px`), `chopper_base`(`0.68x`, `73px`), `robin_base`(`1.06x`, `114px`), `franky_base`(`1.26x`, `136px`), `brook_base`(`1.22x`, `132px`), `jinbe_base`(`1.30x`, `140px`).
   - 거대 변신/각성 슬롯 3종(`chopper_monster_point`, `robin_demonio_fleur`, `franky_general`)을 `isGiant: true`(`2048×2048` 상한) 및 각 동료의 `party_*` 보조 번들(상시 `core_always` 제외)로 등록하고 `PRO_FORM_KEY_ALIASES`로 코어 `forms.json` ID(`form_chopper_monster`, `form_robin_demonio`, `form_franky_shogun`, `form_kaido_flame_dragon` 등)와 `src/core/` 수정 없이 매핑. 미수집 외부 시트는 코드 베이킹 없이 `PLACEHOLDER` 유지([`PRO_ART_DROP_GUIDE.md`](PRO_ART_DROP_GUIDE.md)에 드롭 규격 반영).
   - 나머지 2:2 합동기 4종 추가(`sniper_radical_barrage` 우솝+프랑키, `giant_petal_crush` 쵸파+로빈, `freezing_ocean_current` 브룩+징베, `shambles_red_hawk` 루피+로 — 총 **7종**, `cutinFreezeTicks: 39`) 및 동료 난입·광원·선택적 블룸·광과민 억제(`flashEffectEnabled === false`) 검증.
2. **8대 핵심·거대 보스 규격 정비 & `GiantBossShaderPipeline` WebGL2 셰이더 구축 ([`giantBossAuraProfiles.ts`](src/render/pixi/shaders/giantBossAuraProfiles.ts), [`GiantBossShaderPipeline.ts`](src/render/pixi/shaders/GiantBossShaderPipeline.ts), [`PixiBattleVerticalSliceScene.ts`](src/render/pixi/scenes/PixiBattleVerticalSliceScene.ts), [`PixiBattleEffectsHelper.ts`](src/render/pixi/scenes/PixiBattleEffectsHelper.ts))**
   - `pro-manifest-cli.mjs`의 `entityScale >= 1.5` 기준 정비로 `kaido_base`(`1.45`, `1024px`) vs `kaido_dragon`/`saturn_base`/`saturn_yokai`/`loki_base`/`loki_giant`(`>= 1.5`, `2048px`) 상한과 `4`대 미수집 보스(`katakuri`, `kaido`, `saturn`, `loki`) 핵심 표정 3종(`normal`/`angry`/`battle_cry`) 초상화 슬롯 및 `BOSS_ARENA_BACKDROP_MAP` 4계층 아레나 연결 완비.
   - `GiantBossShaderPipeline`: `GiantCameraFramer`(`entityScale >= 1.5` 시 `0.78x ~ 0.85x` 자동 줌아웃 + 상단 `headroomOffsetY` 확보), 8인 보스 고유 림/오라/번개/독운/광선/방패 셰이더, `DOME_SHIELD`(`K·ROOM`) 굴절 돔, 카타쿠리 견문색 미래 예지 GLSL `ChromaticForesightFilter`(저사양/광과민 설정 시 자동 해제), 새턴 성 안광 충격파, 로키 거대 망치 지면 균열 데칼 풀(`4.5s` 수명), 레이드 4종 예고선(`SAFE_ZONE`/`CIRCLE`/`CONE`/`CROSS_BEAM`) + 임펠 다운 함정/새장 차지 그라데이션, 2페이즈 `19.5:9` 풀와이드 픽셀 컷인(`BOSS_PHASE`, `bossIntroTimer` 단일 배너 덮어쓰기 방지 가드 포함) 구현.
3. **단일 활성 보스 VRAM 락 & 전수 검증 결과 (`2026-11-24`, [`wave3GiantBossAndVramLock.test.ts`](tests/render/wave3GiantBossAndVramLock.test.ts))**
   - [`PixiAssetBundleManager`](src/render/pixi/PixiAssetBundleManager.ts) · [`pixiBundleTypes.ts`](src/render/pixi/pixiBundleTypes.ts): 신규 `battle_*` 번들 로드 전에 이전 `battle_*` GPU 텍스처를 먼저 해제(`singleBattleLockReleases`, 공유 아레나 `background` URL은 임시 refCount 핀으로 중복 다운로드 차단) 및 `peakEstimatedVramMb` 추적 추가.
   - 5회 연속(`battle_kaido → battle_saturn → battle_loki → battle_kizaru → battle_katakuri`, 총 25회 전환) 스트레스 테스트에서 `singleBattleLockReleases = 24`, 동시 `2048×2048` 텍스처 최대 `1`장(`loadBundle` 개시 시 `0`장), `peakEstimatedVramMb < 128 MB`, 해제 후 기준선 VRAM 100% 복구 검증.
   - **검증 수치:** `git diff --stat src/core/` **0줄 변경**, `npm run assets:status` (**379엔트리**: `VERIFIED 1 / IMPORTED 331 / PLACEHOLDER 47`, 총 `87.6%`, 디스크 `22.95 MB`, 전량 이론 VRAM `242.87 MB`, `core_always` `2.60 MB`, Wave 3 `165/208 = 79.3%`), `npm run validate:pro` (`0 errors`), `npm run validate:maps` (`0 errors`), `npm run validate:assets` (`0 errors`), `npm run validate:scripts` (`0 errors`), `npm run check:arch` (`263`파일 `0 issues`), `npm run typecheck` (`0 errors`), `npm run build:web` (`5.04s`, `39` 프리캐시 `2395.11 KiB`, `dist-web/` `1,030`파일 `30,436,868 bytes`, `assets/pro/` `.webp` `263`개 / `.tmj` `17`개 / `.tsx` `7`개 / `.tx` `8`개 / 중복 `.png` `0`개), Vitest **43개 스위트 / 178개 테스트 ALL PASSED**.
   - *(프로덕션 `vite preview --outDir dist-web --port 4173` 브라우저 E2E 시도는 호스트 Chrome `DevToolsActivePort` 미활성으로 `BLOCKED` 상태 기록 후 프리뷰 프로세스 정상 종료.)*

---

## 10.8. Stage 21 완료 요약 (Wave 4 결정론적 `.tmj` 컴파일러 · 전 세계 17/17 섬 100% `.tmj` 통일 · 12개 섬 WebGL2 셰이더 완성)

1. **결정론적 Tiled 1.10+ `.tmj` 컴파일러 & GID 범위 검증기 구축 ([`compile-tiled-tmj.mjs`](scripts/compile-tiled-tmj.mjs), [`wave4IslandTmjBuilder.mjs`](scripts/lib/wave4IslandTmjBuilder.mjs), [`validate-maps.mjs`](scripts/validate-maps.mjs), [`package.json`](package.json))**
   - `scripts/compile-tiled-tmj.mjs`(`npm run compile:tmj`)가 참조된 외부 `.tsx` XML의 `<tileset tilecount="N">`을 직접 파싱해 `firstgid`를 동적 계산(임베드 타일셋 0건)하고, 5대 마스터 외부 `.tsx` 간 모든 2-타일셋 조합에 대해 비충돌·비수면 `ground_detail` 악센트를 결정론 배치하며, `episodeId`·`chestId`(+보상)·`npcId`(+`patrolWaypoints` polyline, `setsQuestFlagOnTalk`)·`markerId`·`dock_departure`·`puzzleSwitches`를 100% 보존합니다.
   - `shells_town`은 정식 17섬 체계(`foosha_shells` Zone 5 `쉘즈타운 해군 제153지부`)에 통합 완료 상태를 유지하면서 나머지 **12개 Wave 4 섬**의 듀얼 `.tsx` 조합을 최종 사양에 맞게 재컴파일했습니다:
     - **이스트 블루 (`master_stone_canal + master_port_village`):** `orange_town`, `baratie`, `arlong_park`, `loguetown`
     - **위대한 항로:** `drum_kingdom`·`thriller_bark`(`master_eastern_pagoda + master_port_village`), `skypiea`(`master_desert_palace + master_scifi_neon`), `marineford`(`master_stone_canal + master_eastern_pagoda`)
     - **신세계:** `fishman_island`·`totto_land`(`master_scifi_neon + master_desert_palace`), `dressrosa`(`master_stone_canal + master_port_village`), `elbaf`(`master_eastern_pagoda + master_port_village`)
   - `validate-maps.mjs`가 17/17 `.tmj` 전 타일 레이어(`water`, `ground`, `ground_detail`, `walls_props`, `overhead`)의 모든 비영 GID가 선언된 `.tsx` 유효 범위 안인지 및 2-Pass BFS 도달성·60개 상자 일치를 검증합니다.
2. **12개 섬 고유 WebGL2 조명 · 수면/거울 반사 · 안개 · 해저 갓레이 · 번개 셰이더 승격 ([`islandAtmospherePresets.ts`](src/render/pixi/scenes/islandAtmospherePresets.ts), [`WaterReflectionPipeline.ts`](src/render/pixi/shaders/WaterReflectionPipeline.ts), [`GodRaysAndParticlesLayer.ts`](src/render/pixi/shaders/GodRaysAndParticlesLayer.ts), [`PixiProIslandScene.ts`](src/render/pixi/scenes/PixiProIslandScene.ts))**
   - **이스트 블루:** `orange_town`(`SUNSET` 노을 + `ORANGE_SMOKE` 상승 연기·불티), `baratie`(`fullAreaReflection: true` 외해 전방향 실시간 수면 반사), `arlong_park`(중앙 수영장 `regionBounds` 국부 반사), `loguetown`(저파동 `0.35x` 젖은 석재 반사 + `RAIN_STORM` 빗줄기 + 주기적 원거리 번개 광원 `flashEffectEnabled === false` 시 섬광 차단).
   - **위대한 항로:** `drum_kingdom`(`ep_drum_kingdom` 클리어 시 `SAKURA_SNOW` + 분홍 밤하늘/블룸/색보정 전환), `skypiea`(구름 데크 + `1.45x` 햇살 갓레이 + 황금 블룸), `thriller_bark`(`NIGHT` + `groundFogColor`/`groundFogAlpha` 바닥 안개 + 날갯짓 박쥐 파티클), `marineford`(저파동 `0.45x` 빙결 반사 + `MARINE_ICE` 포연·얼음 결정·불티).
   - **신세계:** `fishman_island`(`NIGHT` 모드에서도 `allowGodRaysAtNight: true` + 청록 `0x5eead4` 이브의 나무 해저 갓레이 활성 버그 수정), `dressrosa`(`DRESSROSA_PETAL` + 지중해 광원·분수 반사), `totto_land`(`SUNSET` 몽환 분홍 광원 + 거울 광장 저파동 `waveAmpMult: 0.22` 거울 반사), `elbaf`(오로라 갓레이 리본 `0x34d399` + `ELBAF_GOLDEN` 황금 낙엽·신화 뇌격 스파크 `flashEffectEnabled === false` 억제).
3. **대표 6개 섬 왕복 VRAM 테스트 & 전수 검증 결과 (`2026-11-24`, [`wave4WorldTmjAndAtmosphere.test.ts`](tests/render/wave4WorldTmjAndAtmosphere.test.ts))**
   - **대표 6개 섬(`baratie`, `loguetown`, `thriller_bark`, `fishman_island`, `totto_land`, `elbaf`) × 3회 연속 왕복(18회 전환, `915×412`):** 매 전환마다 직전 `island_*` 번들 즉시 언로드, 5대 마스터 `.tsx` 참조 카운트 누수 0건, 1회차·3회차 추정 VRAM 바이트 100% 일치(`peak < 128 MB`), `trackedRenderTextureCount === 0`, 평균 프레임 렌더 비용 `< 16.6ms` 검증.
   - **검증 수치:** `git diff --stat src/core/` **0줄 변경**, `npm run validate:maps` **17/17 JSON & 17/17 `.tmj` 0 errors** (`139`개 동적 광원, `60`개 고유 보물상자 `LegalityValidator` 100% 통과, `102`명 NPC, `71`개 구역), `npm run assets:status` (**Wave 4 `12/12 = 100.0%`** / `17/17` 맵 `100.0%` `2.43 MB` / 총 `379`엔트리 `87.6%`, 디스크 `22.96 MB`), `npm run validate:pro` (`0 errors`), `npm run check:arch` (`263`파일 `0 issues`, `shadowBlur` 0건), `npm run typecheck` (`0 errors`), `npm run build:web` (`4.85s`, `39` 프리캐시 `2399.50 KiB`, `dist-web/` `1,030`파일 `30,456,660 bytes`, `assets/pro/` `.webp` `263` / `.tmj` `17` / `.tsx` `7` / `.tx` `8` / `.png` `0`), Vitest **44개 스위트 / 181개 테스트 ALL PASSED**.
   - *(프로덕션 `vite preview --outDir dist-web --port 4173` 브라우저 E2E 시도는 호스트 Chrome `DevToolsActivePort` 미활성으로 `BLOCKED` 상태 기록 후 프리뷰 서버 정상 종료. **현재 상태: 최종 Android APK 패키징 준비 완료.**)*

---

## 10.9. Stage 22 완료 요약 (Wave 5 `SeaSailingScene` PixiJS v8 WebGL2 전면 통일)

1. **WebGL2 실시간 바다 물결 셰이더 · 해역별 날씨 · 해류/소용돌이 어댑터 ([`OceanWaterShaderPipeline.ts`](src/render/pixi/shaders/OceanWaterShaderPipeline.ts), [`SeaAtmospherePipeline.ts`](src/render/pixi/shaders/SeaAtmospherePipeline.ts), [`seaTypes.ts`](src/render/pixi/shaders/seaTypes.ts), [`SeaCurrentPhysics.ts`](src/scenes/sea/SeaCurrentPhysics.ts))**
   - `OceanWaterShaderPipeline`: 픽셀 격자 스냅 기반 2방향 교차 카우스틱스 노이즈, `TIME_OF_DAY_PROFILES`(`MORNING`/`DAY`/`SUNSET`/`NIGHT`) 스페큘러 반사 하이라이트, 3대 해역(`east_blue` 청록 · `grand_line` 코발트 · `new_world` 심해 폭풍보라/노을) 부드러운 RGB 팔레트 보간, 가시 섬/관문 최대 8곳 해안선 백파 링·수면 반사 틴트를 1-Pass GLSL ES 300 셰이더로 구현.
   - `SeaAtmospherePipeline`: 수중 거대 해왕류 S자 6분절 그림자(`grand_line` 1마리 / `new_world` 3마리), 마린포드 표류 부빙 8종, 이스트 블루 갈매기, 드럼 왕국 클리어 시 설산→벚꽃 자동 전환, 알라바스타 모래바람, 스릴러 바크 보라 안개, 엘바프 북유럽 오로라, `flashEffectEnabled === false` 시 번개 섬광 `0` 차단 가드 적용.
   - `SeaCurrentPhysics.ts`: immutable `src/core/rpg/seaCurrentPhysics.ts` 래핑(0줄 변경), 순풍 `+35%`/역풍 `-20%` 및 소용돌이 회전·흡입·Anti-Trap 이탈 텔레메트리(`sailBillowFactor`, `wakeEmitMultiplier`) 제공.
2. **20종 랜드마크 · 4종 선박 무손실 WebP 승격 · 단일 해역 VRAM 락 · `PixiSeaSailingScene` 전면 교체 ([`wave5SeaAssetPromoter.mjs`](scripts/lib/wave5SeaAssetPromoter.mjs), [`PixiAssetBundleManager.ts`](src/render/pixi/PixiAssetBundleManager.ts), [`PixiSeaSailingScene.ts`](src/render/pixi/scenes/PixiSeaSailingScene.ts), [`pixiVerticalSliceController.ts`](src/scenes/controllers/pixiVerticalSliceController.ts), [`sceneFrameRenderer.ts`](src/scenes/controllers/sceneFrameRenderer.ts), [`sailingRenderer.ts`](src/render/sailingRenderer.ts))**
   - `npm run import:pro`에 `promoteWave5SeaAssets` 통합: 20종 바다 랜드마크(`public/assets/pro/landmarks/*.webp`) 및 4종 선박/해상 엔티티(`ship_going_merry`, `ship_thousand_sunny`, `ship_marine_warship`, `ship_sea_king` `isGiant: true`, `public/assets/pro/sprites/ship_*.{webp,json}`) 무손실 WebP 승격 + `PRO_ART_DROP_GUIDE.md` 드롭 규격 반영.
   - `PixiAssetBundleManager`: 4종 선박을 3대 `sea_*` 번들 공유(`sharedAssetIds`)로 격리해 `core_always` VRAM을 `2.60 MB`로 유지하고, 해역 이동 시 이전 `sea_*` 번들 랜드마크를 선제 해제(`singleSeaLockReleases`)하는 **단일 활성 해역 번들 락** 구축.
   - `PixiVerticalSliceController`에 `'SEA'` 슬라이스 연결 및 `sceneFrameRenderer.ts`에서 레거시 `SEA_SAILING` Canvas 2D 바다/도형 렌더링 제거(2D 캔버스는 Safe Area HUD 오버레이 전용), `PixiSeaSailingScene`에 `going_merry` ↔ `thousand_sunny` 자동 전환·8방향 기울기·96슬롯 Zero-GC 포말 풀·야간/노을 뱃머리 동적 광원 및 섬 근접 9-Slice 입항 배너 탑재.
3. **미니맵 · 확대 해도 연동 & 3대 해역 5회 왕복 E2E 검증 결과 (`2026-11-24`, [`seaWebglPipelines.test.ts`](tests/render/seaWebglPipelines.test.ts), [`pixiSeaSailingScene.test.ts`](tests/render/pixiSeaSailingScene.test.ts))**
   - [`seaMinimapHud.ts`](src/render/sea/seaMinimapHud.ts) · [`seaChartOverlay.ts`](src/render/sea/seaChartOverlay.ts) · [`seaChartDetailCard.ts`](src/render/sea/seaChartDetailCard.ts) · [`seaChartController.ts`](src/scenes/sea/seaChartController.ts): 해역별 탭 보물상자 달성률(`15`/`21`/`24`, 총 `60`개 `.tmj` 100% 일치), 도트 무손실 랜드마크 썸네일 프리뷰, `[빠른 항해]` 즉시 해역 번들 전환, 갤럭시 S25 울트라(`915×412` / `1170×540`)·데스크톱(`1280×720`) Safe Area 중첩 `0px` 검증.
   - 3대 해역 5회 연속 왕복(`sea_east_blue → sea_grand_line → sea_new_world`, 총 15회 전환) 시 매 전환마다 직전 해역 랜드마크 `refCount === 0`, 1회차·5회차 VRAM 동일, `trackedRenderTextureCount === 0` 달성.
   - **검증 수치:** `git diff --stat src/core/` **0줄 변경**, `npm run typecheck` (`0 errors`), `npm run check:arch` (`268`파일 `0 issues`), `npm run validate:pro` (`383`엔트리 `VERIFIED=1, IMPORTED=335, PLACEHOLDER=47`, `0 errors`), `npm run validate:maps` (`17/17` `0 errors`), `npm run validate:assets` (`0 errors`), `npm run validate:scripts` (`0 errors`), Vitest **46개 스위트 / 187개 테스트 ALL PASSED**, `npm run build:web` (`5.53s`, `dist-web/` `1,058`파일 `30,523,715 bytes`, `assets/pro/` `.webp` `287`개). *(프로덕션 `vite preview --outDir dist-web --port 4173` 브라우저 E2E 시도는 호스트 Chrome `DevToolsActivePort` 미활성으로 `BLOCKED` 확인 후 프리뷰 서버 정상 종료.)*

---

## 11. 남은 이슈 (Known / Remaining Issues)

1. **호스트 Chrome DevTools 원격 디버깅 미활성으로 인한 자동 실브라우저 WebGL2 육안 점검 보류**
   - `npx vite preview --outDir dist-web --port 4173` 기반 브라우저 에이전트 점검 시 호스트 Chrome `DevToolsActivePort` (`%LOCALAPPDATA%\Google\Chrome\User Data\DevToolsActivePort`) 부재로 `BLOCKED` 상태입니다.
   - 실제 WebGL2 셰이더(3대 해역 `SeaSailingScene` 실시간 바다 물결·날씨·야간 뱃머리 광원·20종 랜드마크, 17/17 섬 수면 반사·바이옴 파티클·동적 광원, 8대 보스 셰이더·2:2 합동기 컷인) 및 `915×412` Safe Area 시각 확인은 로컬에서 `npm run preview` 실행(또는 Chrome `chrome://inspect/#remote-debugging` 활성화) 및 실기기 APK 설치로 확인해야 합니다.
2. **외부 시트 미확보 `PLACEHOLDER` 보스·거대 변신 폼 (`morgan` + `lucci_awakened` + `katakuri`/`kaido`/`saturn`/`loki` 본체·거대 폼·`king`/`s_hawk`/`blueno`/`doppelman` + 밀짚모자 3인 거대 폼)**
   - 코드 도트 베이킹 금지 원칙에 따라 외부 도트 시트 미확보 항목은 `PLACEHOLDER` 상태로 투명하게 유지 중이며, `raw_assets/packs/` 투입 후 `npm run import:pro` 실행 시 `2048×2048`(거대 폼) / `1024×1024`(일반) 무손실 WebP로 즉시 승격됩니다([`PRO_ART_DROP_GUIDE.md`](PRO_ART_DROP_GUIDE.md)).
3. **외부 `pixi-webgl` 벤더 청크 크기 경고 (`589.04 kB`, gzip `169.63 kB`)**
   - 앱 코드 및 데이터 청크(`index` `438.61 kB`, `game-data` `288.97 kB`, `island-maps-data` `270.66 kB`, `pixi-scenes` `226.69 kB`)는 모두 `500 kB` 미만으로 최적화되었으며, `pixi.js` 단일 벤더 청크만 `589.04 kB`입니다(정상 동작).
4. **Android Release 서명(Keystore / Signed AAB·APK) 미구성**
   - 크로스플랫폼 `npm run package:android:apk` 래퍼(`--release` 플래그 포함)는 준비 완료되었으며, 실제 스토어 배포용 Release APK/AAB 추출 시 서명 키스토어 및 `android/app/build.gradle` `signingConfigs` 구성이 필요합니다.

---

## 12. 다음 할 일 (Next Steps)

1. **미확보 거대 보스·모건 외부 시트 및 커스텀 바다 랜드마크/선박 드롭 승격 (`PRO_ART_DROP_GUIDE.md`)**
   - `raw_assets/packs/`에 외부 시트(`morgan_base.png`, `kaido_base.png`, `saturn_base.png`, `loki_base.png`, `king_base.png`, `katakuri_base.png`, `s_hawk_base.png`) 또는 `raw_assets/packs/{landmarks,ships}/` 고해상도 랜드마크/선박 아트 확보 시 투입 후 `npm run import:pro` → `npm run validate:pro` → `npm run assets:verify -- --id=...`로 `VERIFIED` 승격하세요.
2. **Android APK 패키징 & 실기기/로컬 브라우저 확인 (`최종 Android APK 패키징 준비 완료`)**
   - `npm run package:android:apk`(디버그) 또는 키스토어 구성 후 `node scripts/build-android-apk.mjs --release`로 실기기 APK를 패키징하고, 로컬 `npm run preview` 또는 Chrome `chrome://inspect/#remote-debugging` 활성화 후 3대 해역 항해(`SeaSailingScene`·확대 해도)·17개 섬·거대 보스전 WebGL2 시각 연출을 최종 점검하세요.
3. **실브라우저 육안 검수 완료 에셋 `VERIFIED` 일괄 승격**
   - 전 세계 17/17 섬 `.tmj`, 20종 바다 랜드마크·4종 선박 무손실 WebP, 밀짚모자 10인 전원 및 2:2 합동기 7종, 8대 보스 셰이더 파이프라인이 완비되었으므로, 실브라우저 육안 검수 완료 에셋을 `npm run assets:verify -- --id=...`로 `VERIFIED` 승격하세요.
4. **Android Release Keystore 서명 구성**
   - 정식 배포 단계에서 `android/app/build.gradle` `signingConfigs`와 키스토어를 연결한 뒤 `node scripts/build-android-apk.mjs --release`로 서명된 Release APK를 추출하세요.

---

## 13. 빠른 검증 및 실행 방법

```powershell
# 1. 아키텍처·순환참조·any·shadowBlur 자동 감사 (268 TS files)
npm run check:arch

# 2. 결정론적 Tiled .tmj 컴파일 · 프로 에셋 SSOT 상태 · 무손실 WebP · 맵 검증
npm run compile:tmj
npm run assets:status
npm run validate:pro
npm run import:pro
npm run validate:maps

# 3. 스프라이트·초상화·타일셋·배경·VFX·월드 랜드마크(20종)·오디오 & 스크립트 검증
npm run validate:assets
npm run validate:scripts

# 4. 정적 타입 검사 (strict + noUncheckedIndexedAccess)
npm run typecheck

# 5. 프로덕션 웹 빌드 & 전체 Vitest 스위트 (46 suites / 187 tests)
npm run build:web
npm run test

# 6. Android Debug APK 빌드 (Windows/macOS/Linux 크로스플랫폼 공용)
npm run package:android:apk

# 7. AI 핸드오프 번들 갱신
npm run ai:handoff
```
