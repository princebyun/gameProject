# HANDOFF.md — One Piece Grand Voyage 프로젝트 인수인계 및 현재 상태 문서

> **최종 업데이트 기준:** Stage 12 4대 핵심 거점 섬(후샤 마을·워터 세븐·와노쿠니·에그헤드) 7계층 리디자인 & 살아 있는 마을 시스템 · `npm run validate:maps` BFS 도달성 검증기 구축 · 프로덕션 웹 빌드(`dist-web/`) 검증 완료  
> **현재 프로젝트 상태:** **APK 패키징 직전 리팩토링 · 고밀도 에셋 · 비규격 시트 슬라이서 · 4대 거점 7계층 맵 리디자인 및 정적/BFS/유닛/S25 울트라 E2E 게이트 통과 완료 (`npm run preview` 실행 시 즉시 로컬 플레이 가능; 네이티브 APK 빌드 및 git commit/push 제외)**  
> **버전 현황:**  
> - **앱 패키지 버전:** `0.1.0` (`package.json`)  
> - **전투 계산 버전 (`BATTLE_CALC_VERSION`):** `"0.6.0"` (`src/core/constants.ts` — 결정론 `stateHash` 3종 100% 동일 유지)  
> - **세이브 스키마 버전 (`CURRENT_SAVE_VERSION`):** `5` (`v0 → v1 → v2 → v3 → v4 → v5` 무손실 순차 마이그레이션 & `openedChestIds` 하위 호환 · `HMAC-SHA256-DERIVED` 2단계 안티치트 호환)  
> - **TypeScript & 아키텍처 규격:** `strict: true` + `noUncheckedIndexedAccess: true` + `noUnusedLocals/Parameters: true` + `noImplicitReturns: true` (`check:arch` `216`개 파일 순환 참조 `0건`, 계층 위반 `0건`, `any`/`@ts-ignore` `0건`, `shadowBlur` `0건`, 400줄 이상 로직 파일 `0건`)  
> - **에셋 매니페스트:** 스프라이트 시트 `98/98종` (`External PNG: 98, Baked Fallback: 0`) | 표정 초상화 `352/352종` (`64×64 PNG`) | 바이옴 타일셋 `14종` | 오디오 `BGM 10곡 / SFX 22종`  
> **자동화 검증 현황:** `npm run validate:maps` 통과 (`17섬 / 15보물상자 0 errors`) | `npm run validate:assets` 통과 (`0 errors`) | `npm run validate:scripts` 통과 (`0 errors`) | `npm run check:arch` 통과 (`0 issues`) | `npm run typecheck` & Electron `tsc` 통과 (`0 errors`) | `npm run build:web` 통과 (`dist-web/` `672`개 파일, `24,770,372 bytes`, `23.62 MiB`) | Vitest **30개 스위트 / 123개 테스트 전원 통과**

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
  - 전투 코어 결정론(`BATTLE_CALC_VERSION = "0.6.0"`, 기준선 `stateHash` 3종 100% 일치), 세이브 호환성(`CURRENT_SAVE_VERSION = 5`, `world.openedChestIds` 하위 호환), `validate:maps`(17개 섬·15개 상자 BFS 0 에러), 순환 참조 `0건`, 계층 침범 `0건`, `any`/`@ts-ignore` `0건`, `ctx.shadowBlur` `0건`, 400줄 이상 로직 파일 `0건`, 오프스크린 캔버스 GPU 메모리(`width=0, height=0`) 및 `AbortController`·WebAudio 해제 모두 검증 완료.
- **라이브 Chrome DevTools(CDP) 원격 디버깅 미연결 (자동화 E2E로 대체 검증 완료):**
  - 프로덕션 번들(`dist-web/` `672`파일, `23.62 MiB`) 무결성, 갤럭시 S25 울트라(`19.5:9`, `915×412 → 1199×540`) 스크롤링·청크 컬링·오버헤드·Y-정렬·`<16.6ms` 60FPS 예산·GPU 메모리 해제 회귀는 자동화 테스트(`hubMapLivingVillageAndChests.test.ts`, `productionDistGalaxyS25E2E.test.ts`, `phase3OptimizationAndLeak.test.ts`)로 검증 완료.
  - 사용자 요청에 따라 호스트 Chrome 원격 디버깅이 비활성화된 상태이므로, 실브라우저 시각 확인이 필요할 때 `npm run preview`로 로컬에서 바로 확인할 수 있습니다.
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

## 6. 다음 할 일 (Next Steps)

1. **커스텀 비규격 캐릭터 시트 테스트 및 보정 워크플로우 (`raw_assets/packs/` → `npm run import:pack`)**
   - NDS·JUS·MUGEN PNG 시트를 `raw_assets/packs/{spriteKey}.png`에 두고 `npm run import:pack -- --file={spriteKey}.png --preview-only`로 `exported_thumbnails/import_debug/{spriteKey}_debug.png`를 먼저 점검하거나, `npm run preview` → `개발자 도구 / AssetPreviewScene` → `✂ 시트 임포트 / 슬라이서` 탭에서 피벗/행 상태를 미세 조정해 `.recipe.json`을 저장한 뒤 `npm run import:pack` 실행.
2. **로컬 브라우저 실플레이 확인 (`npm run preview`) 및 최종 Android APK 재패키징 (`npm run package:android:apk`)**
   - 필요 시 `npm run preview`로 거점 4개 맵 탐험·보물상자·존 배너를 직접 확인하고, 최종 배포 시 `npm run build:android` → `npx cap sync android` → Gradle APK 빌드 실행.

---

## 7. 빠른 검증 및 실행 방법

```powershell
# 1. 아키텍처·순환참조·any·shadowBlur 자동 감사
npm run check:arch

# 2. 17개 섬 맵 타일 ID·BFS 도달성·NPC 순찰·보물상자 무결성 검사
npm run validate:maps

# 3. 스프라이트(GRID + VARIABLE_PACK)·초상화·타일셋·배경·VFX·오디오 무결성 검사
npm run validate:assets

# 4. 캠페인·섬·대사·유닛·폼·스킬 데이터 교차 참조 무결성 검사
npm run validate:scripts

# 5. 정적 타입 검사 (strict + noUncheckedIndexedAccess)
npm run typecheck

# 6. 전체 단위/슬라이서/UI/살아있는마을/결정론/E2E 테스트 (30개 스위트 / 123개 테스트)
npm run test

# 7. 비규격 시트 프리뷰 디버그 & 원클릭 임포트
npm run import:pack -- --file=kaido_base.png --preview-only
npm run import:pack

# 8. 프로덕션 웹 빌드 및 AI 핸드오프 번들 갱신
npm run build:web
npm run ai:handoff
```
