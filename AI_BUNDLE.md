# AI_BUNDLE.md — One Piece Grand Voyage Handoff Context Bundle

Generated at: 2026-11-23T07:25:28.440Z

## File: `AGENTS.md`
```md
# AGENTS.md — One Piece Grand Voyage 에이전트 작업 규칙 및 아키텍처 불변성 가이드

이 문서는 AI 코딩 에이전트 및 개발자가 본 저장소(`One Piece Grand Voyage — 2D Pixel Real-Time Action & Sea-Zone RPG`)에서 작업할 때 반드시 준수해야 하는 규칙과 핵심 아키텍처 불변 조건을 정의합니다.

---

## 1. Git Commit & Push 정책 (`GEMINI.md` 최우선 규칙)

- 사용자가 명시적으로 커밋(`commit`) 또는 푸시(`push`)를 요청하기 전에는 **절대 `git commit`이나 `git push`를 실행하지 마세요.**
- 작업 완료 후 선제적으로 커밋·푸시 여부를 묻거나 제안하지 마세요(예: "커밋·푸시해 드릴까요?" 금지). 사용자가 준비되었을 때 직접 지시할 때까지 대기합니다.

---

## 2. 아키텍처 불변 조건 (Core Invariants)

1. **`src/core/` 순수 결정론 유지 (Zero DOM / Window / WebSocket / Audio 의존)**
   - `src/core/` 하위 파일은 클라이언트와 멀티플레이어 중계 서버(`server/`)가 직접 공유합니다.
   - `window`, `document`, `localStorage`, `IndexedDB`, `WebSocket`, `AudioContext`, `Math.random()`, `Date.now()`를 `src/core/` 내부에서 직접 호출하지 마세요.
   - 모든 난수는 `SeededPRNG`(`src/core/math/prng.ts`)를 사용하고, 시뮬레이션 틱은 `FIXED_DT = 1 / 60`(`src/core/constants.ts`)을 기준으로 동작해야 합니다 (`tests/core/purity.test.ts`로 검증).
2. **전투 계산 버전 (`BATTLE_CALC_VERSION`) 동기화**
   - 현재 버전: `BATTLE_CALC_VERSION = '0.6.0'` (`src/core/constants.ts`)
   - 전투 공식, 유닛 스탯, 스킬, 보스 훅, 엔드게임 전투 규칙을 변경할 경우 `BATTLE_CALC_VERSION`을 올리고 관련 테스트(`tests/core/purity.test.ts` 등)를 함께 갱신하세요.
3. **세이브 스키마 (`CURRENT_SAVE_VERSION = 5`) 및 2단계 안티치트 호환성**
   - 현재 버전: `CURRENT_SAVE_VERSION = 5` (`src/core/save/schema.ts`)
   - `SavePayloadV1`이나 엔드게임 블록을 확장할 때는 `src/core/save/migrator.ts`에서 `v0 → v1 → v2 → v3 → v4 → v5` 순차 마이그레이션이 무손실로 통과하도록 유지하고, `src/core/save/antiCheat.ts`의 `IntegrityVerifier`(`HMAC-SHA256-DERIVED`) 및 `LegalityValidator` 규칙과 충돌하지 않게 하세요.
   - 스토리 디렉터(`src/story/storyDirector.ts`) 상태는 별도 세이브 필드를 깨지 않고 `campaign.episodeFlags`에 100% 영속화됩니다.
4. **멀티플랫폼 어댑터 분리 (`src/platform/`)**
   - 플랫폼별 분기(Web PWA / Windows Electron / Android Capacitor)는 `src/platform/` 내부 어댑터에서만 처리하며, 코어와 씬에서는 `PlatformBridge` 인터페이스를 통해서만 접근합니다.
5. **19.5:9 가변 뷰포트 & Safe Area 준수 (`src/render/viewport/`)**
   - 논리 높이는 `540px` 고정, 논리 가로폭은 기기 종횡비에 따라 `960px ~ 1260px`로 동적 확장됩니다(갤럭시 S25 울트라 19.5:9에서 `1170×540`, `arenaOffsetX = (viewWidth - 960) / 2`).
   - 모든 캔버스 HUD 및 터치 버튼은 반드시 `viewport.safeInsets`(`top`, `right`, `bottom`, `left`) 안쪽에 배치해야 하며, 전투/섬 960×540 월드 좌표계를 렌더링하거나 탭 좌표를 변환할 때는 `viewport.arenaOffsetX`를 반영해야 합니다.
6. **외부 에셋 무중단 핫스왑 파이프라인 (`public/assets/`)**
   - 스프라이트(`98종`), 바이옴 타일셋(`14종`), 레트로 오디오(`BGM 10곡 / SFX 18종`) 매니페스트는 `src/data/assets/`에 정의되어 있으며, `public/assets/`에 실제 `.png` / `.ogg` 배치 시 코드 수정 없이 즉시 로드됩니다.
   - 에셋 매니페스트나 유닛/폼/섬을 추가·변경한 뒤에는 반드시 `npm run validate:assets`를 실행해 누락이 없는지 확인하세요.

---

## 3. 작업 완료 후 필수 검증 명령어

코드 수정 후 아래 검증을 통과하는지 확인하세요.

```powershell
npm run typecheck
npm run test
npm run validate:assets
npm run build:web
```
```

## File: `HANDOFF.md`
```md
# HANDOFF.md — One Piece Grand Voyage 프로젝트 인수인계 및 현재 상태 문서

> **최종 업데이트 기준:** Stage 15 PixiJS v8 (WebGL2) HD-2D 수직 슬라이스 전환 · 전투 속도 제어 · Android Debug APK 빌드 완료 (`src/core/` Stage 15 무변경 · 코드 도트 베이커 `legacy/` 단절 · `foosha_village.tmj` 48×34 · WebGL2 동적 광원/블룸/수면 반사/색보정/갓레이/패링 충격파 셰이더 · `F9` 비주얼 튜닝 드로어 · `dist-web/` 및 `app-debug.apk` 생성 완료)  
> **현재 프로젝트 상태:** **전 세계 17/17 섬 7계층 맵 + 3대 해역 월드맵(20종 랜드마크·해류·소용돌이·날씨·미니맵/확대 해도) + 전투 속도 제어 + 루피/후샤 마을(`.tmj`)/첫 전투 PixiJS v8 WebGL2 수직 슬라이스 구현 및 웹(`dist-web/` `728`파일)·Android Debug APK(`app-debug.apk` `28.83 MB`) 패키징 완료 (`check:arch` `251`파일 `0 issues` · Vitest `37`스위트 / `151`테스트 전원 통과)**  
> **버전 현황:**  
> - **앱 패키지 버전:** `0.1.0` (`package.json`) | **Android 버전:** `versionCode 1` / `versionName "1.0"` (`android/app/build.gradle`)  
> - **전투 계산 버전 (`BATTLE_CALC_VERSION`):** `"0.6.0"` (`src/core/constants.ts` — 결정론 `stateHash` 3종 100% 동일 유지)  
> - **세이브 스키마 버전 (`CURRENT_SAVE_VERSION`):** `5` (`v0 → v1 → v2 → v3 → v4 → v5` 무손실 순차 마이그레이션 & `openedChestIds` / `episodeFlags['visited_island_*']` 하위 호환 · `HMAC-SHA256-DERIVED` 2단계 안티치트 호환)  
> - **렌더링 엔진 / 프로 매니페스트 버전:** `pixi.js@^8.23.0` (WebGL2) | `pro_manifest.json` `v1.0.0` (루피/조로/버기 Aseprite JSON + `foosha_village.tmj` + 3종 CC0 타일셋 + 4레이어 `east_blue_harbor` + 7종 VFX + 컷인 2종)  
> - **TypeScript & 아키텍처 규격:** `strict: true` + `noUncheckedIndexedAccess: true` + `noUnusedLocals/Parameters: true` + `noImplicitReturns: true` (`check:arch` `251`개 파일 순환 참조 `0건`, 계층 위반 `0건`, `any`/`@ts-ignore` `0건`, `shadowBlur` `0건`)  
> - **레거시 호환 에셋 매니페스트:** 스프라이트 `98/98종` · 초상화 `352/352종` · 바이옴 타일셋 `14종` · 월드 랜드마크 `20/20종` · 오디오 `BGM 10곡 / SFX 22종`  
> **자동화 검증 현황:** `npm run validate:maps` 통과 (`17/17` + `foosha_village.tmj` BFS `0 errors`) | `npm run validate:assets` 통과 (`0 errors`) | `npm run validate:scripts` 통과 (`0 errors`) | `npm run check:arch` 통과 (`0 issues`, `251` files) | `npm run typecheck` 통과 (`0 errors`) | `npm run build:web` 통과 (`dist-web/` `728`개 파일, `26,207,007 bytes`, Workbox `36 entries`) | `npm run package:android:sync` + `.\gradlew.bat assembleDebug` 통과 (`app-debug.apk` `28,831,149 bytes`) | Vitest **37개 스위트 / 151개 테스트 전원 통과**

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

## 9. 남은 이슈 (Known / Remaining Issues)

1. **호스트 Chrome DevTools 원격 디버깅 미활성으로 인한 자동 실브라우저 WebGL2 육안 점검 보류**
   - `npx vite preview --outDir dist-web --port 4173` 기반 브라우저 에이전트 점검 시 `C:\Users\plani\AppData\Local\Google\Chrome\User Data\DevToolsActivePort` 부재로 `BLOCKED` 상태입니다.
   - 실제 WebGL2 셰이더(수면 반사·동적 광원·선택적 블룸·패링 충격파) 및 `915×412` Safe Area 시각 확인은 로컬에서 `npm run preview` 실행 또는 생성된 `app-debug.apk`를 실기기에 설치해 확인해야 합니다.
2. **Windows `cmd.exe` 환경에서 `npm run package:android:apk`의 `./gradlew` 경로 호환성**
   - [`package.json`](package.json)의 `"package:android:apk"` 스크립트가 `./gradlew assembleDebug`를 사용해 Windows 기본 `cmd.exe`에서는 실패할 수 있습니다(현재는 PowerShell에서 `npm run package:android:sync` 후 `Push-Location android; .\gradlew.bat assembleDebug; Pop-Location`으로 정상 빌드 확인).
3. **수직 슬라이스 외 16개 섬 및 나머지 캐릭터의 PixiJS 프로 아트 확장 대기**
   - 현재 PixiJS v8 WebGL2 HD-2D 수직 슬라이스는 **후샤 마을(`foosha_village.tmj`) + 루피/조로/버기 + 이스트 블루/후샤/샌드박스 전투**에 적용되어 있으며, 나머지 16개 섬은 기존 7계층 2D 캔버스 렌더러로, 프로 시트가 없는 캐릭터는 중립 실루엣 폴백(`createMissingProArtPlaceholder`)으로 동작합니다.
4. **프로덕션 번들 청크 크기 경고 (`> 500 kB`)**
   - `vite build` 시 `pixi-webgl` (`549.34 kB`), `index` (`554.18 kB`), `game-data` (`558.26 kB`) 청크가 500 kB 경고를 출력합니다(정상 동작 및 gzip 125~170 kB 수준이나 초기 로딩 추가 최적화 여지 존재).
5. **Android Release 서명(Keystore / Signed AAB·APK) 미구성**
   - 현재 빌드된 산출물은 테스트·실기기 설치용 `app-debug.apk`이며, 배포용 Release APK/AAB 추출 시 서명 키스토어 및 `signingConfigs` 구성이 필요합니다.

---

## 10. 다음 할 일 (Next Steps)

1. **갤럭시 S25 울트라 실기기 APK 플레이 테스트 & `npm run preview` WebGL2 육안 확인**
   - `android/app/build/outputs/apk/debug/app-debug.apk`를 기기에 설치하거나 로컬 `npm run preview`로 접속해 `F9` 비주얼 튜닝 드로어(아침/낮/노을/밤 · 5종 셰이더 토글 · 품질 프리셋), 후샤 마을 수면 반사/지붕 투과, 첫 전투 패링 충격파·컷인, 전투 속도(`0.5x`/`0.75x`/`1.0x`) 및 60FPS 체감 품질을 확인하세요.
2. **프로 아트 & Tiled `.tmj` 거점 순차 확장 (`PRO_ART_DROP_GUIDE.md`)**
   - [`PRO_ART_DROP_GUIDE.md`](PRO_ART_DROP_GUIDE.md) 절차에 따라 주력 캐릭터 Aseprite 시트(나미·상디·우솝·초파·모건 등)와 핵심 거점(워터 세븐·와노쿠니·에그헤드) `.tmj` 맵을 `public/assets/pro/`에 추가하고 `npm run import:pro` + `npm run validate:maps`로 검증하세요.
3. **크로스플랫폼 빌드·번들 최적화 및 Release 서명 구성**
   - `package.json`의 `package:android:apk`를 Windows/macOS/Linux 공용 Node 래퍼로 개선하고, `game-data` / 비핵심 씬에 `dynamic import()` 분할을 적용한 뒤 배포 시 Android Release Keystore 서명을 구성하세요.

---

## 11. 빠른 검증 및 실행 방법

```powershell
# 1. 아키텍처·순환참조·any·shadowBlur 자동 감사 (251 TS files)
npm run check:arch

# 2. 프로 에셋/Tiled 맵(.tmj) 빌드 및 전 섬 BFS 도달성·보물상자 무결성 검사
npm run import:pro
npm run validate:maps

# 3. 스프라이트·초상화·타일셋·배경·VFX·월드 랜드마크(20종)·오디오 & 스크립트 검증
npm run validate:assets
npm run validate:scripts

# 4. 정적 타입 검사 (strict + noUncheckedIndexedAccess)
npm run typecheck

# 5. 프로덕션 웹 빌드 & 전체 Vitest 스위트 (37 suites / 151 tests)
npm run build:web
npm run test

# 6. Android Debug APK 빌드 (Windows PowerShell)
npm run package:android:sync
Push-Location android; .\gradlew.bat assembleDebug; Pop-Location

# 7. AI 핸드오프 번들 갱신
npm run ai:handoff
```
```

## File: `README.md`
```md
# 🏴‍☠️ One Piece Grand Voyage — 2D Pixel Real-Time Action & Sea-Zone RPG

단일 TypeScript + Vite 소스코드(`src/core/`, `src/scenes/`, `src/data/`)를 유지한 채 **Web/iOS/macOS PWA**, **Windows 64비트 PC 실행 파일(Electron `.exe`)**, **Android 모바일 앱(Capacitor `.apk`)** 3개 플랫폼으로 빌드·패키징하고, 플랫폼별 네이티브 저장소·기기 어댑터(`PlatformBridge`)와 실시간 WebSocket 멀티플레이어 중계 서버(`server/`)를 통합한 2D 픽셀 실시간 액션 RPG 프로젝트입니다.

> **Git 원격 저장소:** `https://github.com/princebyun/gameProject.git`  
> **현재 엔진 버전:** `BATTLE_CALC_VERSION = "0.6.0"` | `CURRENT_SAVE_VERSION = 5`  
> **자동화 검증 현황:** `npm run typecheck` 0 errors | Vitest **22개 스위트 / 94개 테스트 전원 통과** | `npm run validate:assets` 통과 | 3대 플랫폼 프로덕션 빌드 통과  
> **에이전트/인수인계 문서:** [AGENTS.md](./AGENTS.md) | [HANDOFF.md](./HANDOFF.md) | [ASSET_REPLACEMENT_GUIDE.md](./ASSET_REPLACEMENT_GUIDE.md) | [BUILD_RELEASE.md](./BUILD_RELEASE.md)

---

## 1. 새 PC 체크아웃 후 5분 빠른 시작 (인수인계 체크리스트)

다른 PC에서 이 저장소를 체크아웃한 뒤 바로 개발·테스트·패키징을 이어갈 수 있습니다.

### 1.1 사전 설치 요구사항
| 도구 | 권장 버전 | 용도 |
| :--- | :--- | :--- |
| **Node.js & npm** | Node.js `v20+` (LTS) | 클라이언트·서버 개발, Vitest, Vite 빌드, Electron 패키징 |
| **JDK** | **JDK 17** (필수 권장) | Android Gradle 8.x APK 빌드 (`JAVA_HOME`에 JDK 17 지정 필수 — Java 25/JBR 비호환 주의) |
| **Android SDK** | Platform `34+` / Build-Tools | Android `.apk` 직접 빌드 시 (`ANDROID_HOME` 또는 `android/local.properties`에 `sdk.dir` 설정) |

### 1.2 클론 및 초기 검증
```powershell
git clone https://github.com/princebyun/gameProject.git
cd gameProject

# 1. 의존성 설치
npm install

# 2. TypeScript 전체 정적 검사 (src/, server/, electron/, tests/)
npm run typecheck

# 3. 전체 결정론·전투·RPG·세이브·멀티·크로스플랫폼 단위/통합 테스트 실행 (94개)
npm run test

# 4. 로컬 개발 서버 실행 (클라이언트 단독: http://localhost:5173)
npm run dev

# 5. 클라이언트 + WebSocket 중계 서버(포트 8787) 동시 실행
npm run dev:all
```

---

## 2. 현재 구현 완료 콘텐츠 요약 (Phase 1 ~ Phase 9 & Stage 3 ~ Stage 5)

- **순수 결정론적 전투 엔진 (`src/core/`):** Zero DOM/Window 의존, `60Hz` 고정 타임스텝(`FIXED_DT = 1/60`) + `SeededPRNG`, 6종 맞대결 물리(광선 vs 광선, 근접 vs 광선, 근접 vs 투사체, 근접 vs 근접, 패왕색 하늘 가르기), 2스택 완벽 회피(Just Dodge), 패기 3종(무장·견문·패왕 Lv0~3), 악마의 열매 다단계 변신·환경 각성·오버드라이브, 보스 전용 공통 전투 훅 15종 이상(루나리아 불꽃, 초재생, 거대 스케일, 참격 분할 면역, 45초 생존/탈출전, 수변 지형 & 확산 독가스, 젖음·천적 상쇄, 어둠 열매 능력 봉인, 도펠맨 분신 소환·스왑, 마그마/빙결 반반 분할, 불사조 1회 부활 & 3연전 동맹, 도플라밍고 새장 점진 축소, 카타쿠리 미래 예지 회피/집중 붕괴, 호디 E.S 백발 폭주, 마젤란 맹독 중첩/베놈 데몬).
- **3대 해역 · 총 17개 에피소드 섬 자유 항해 RPG (`src/data/`):**
  - **이스트 블루 (5개 필수 섬):** 후샤·쉘즈타운(모건/조로) → 오렌지 마을(버기) → 발라티에(돈 클리크/상디·우솝) → 아론 파크(아론/나미) → 로그타운(스모커 45초 생존) → **리버스 마운틴 관문**
  - **위대한 항로 (6개 필수 섬):** 드럼 왕국(와포루/쵸파) → 알라바스타(크로커다일 물통 기믹/로빈) → 하늘섬(에넬) → 워터 세븐(블루노·카쿠·루치/프랑키·써니호) → 스릴러 바크(모리아/브룩) → 마린포드(마르코 2:2 동맹 3연전: 아오키지→아카이누→검은 수염) → **레드라인 신세계 관문**
  - **신세계 (6개 섬, 3침 로그 포스):** 어인섬(호디 존스/징베 조타수 — 밀짚모자 10인 완성) → 드레스로자(도플라밍고 새장) → 토트랜드(카타쿠리 미래 예지 · 로드 포네그리프 · 견문색 Lv.3) → 와노쿠니(킹·카이도/기어 5) → 에그헤드(S-호크·키자루·새턴 성) → 엘바프(로키)
- **엔드게임 3대 모드 확장 & Save v5 (`src/core/endgame/`):**
  - **임펠 다운 6층+ 로그라이트 서바이벌:** 1~6층(마젤란 보스) 및 7층+ 무한 심층, 유물 3택 1 드래프트, 중단/이어하기.
  - **코리다 콜로세움 8강 토너먼트:** C/B/A/S 티어 8강전, 장외 링아웃, 콜로세움 CP 기술 전수(Move Tutor) 및 수배서 테두리 프레임.
  - **거대 보스 협동 레이드:** 카이도·새턴 성·로키 브레이크/그로기, 팀 DPS 체크 보호막, 2초 근접 구조 & 팀 공용 부활, 온라인 `COOP_RAID` 및 레이드 유물.
- **픽셀 스프라이트 · 바이옴 타일셋 · 8/16비트 레트로 오디오 (`src/assets/`, `src/audio/`):**
  - 98종 스프라이트 시트(11행 표준 애니메이션 + 오프스크린 이펙트 합성 캐시), 14종 바이옴 16×16 오토타일 타일셋, 4채널 Web Audio 칩튠 BGM(10곡)·SFX(18종), `public/assets/` 무중단 핫스왑 리졸버 및 인게임 `AssetPreviewScene`.
- **갤럭시 S25 울트라 19.5:9 풀스크린 & 스토리 디렉터 (`src/render/viewport/`, `src/story/`):**
  - 고정 높이 `540px` + 가변 가로폭 `960~1260px` (`ResponsiveViewportManager`), Android Edge-to-Edge 풀스크린, 독립 멀티터치 플로팅 조이스틱 & 부채꼴 터치 버튼(크기 S/M/L · 투명도 설정), `BootScene → TitleScene → OpeningNarrationScene` 인트로, `StoryDirector` & GTA 스타일 월드 비콘(`MAIN/SIDE/ACTIVITY`) & 반다이 스타일 하단 대화 컷신 오버레이.
- **실시간 통신 대전 & 2단계 안티치트 (`server/`, `src/core/net/`, `src/core/save/`):**
  - 6자리 방 코드(`0/O, 1/I` 제외), 1:1, 2:2 및 협동 레이드(`COOP_RAID`) Lockstep 60틱 `stateHash` 동기화, 관전자 중계 HUD, 항구 대전 단말기(HP/PP 무손실).
  - Canonical JSON `HMAC-SHA256-DERIVED` 무결성 검증(`IntegrityVerifier`) + 게임 규칙 교차 검증(`LegalityValidator`) + 순차 세이브 마이그레이터(`v0 → v1 → v2 → v3 → v4 → v5`).

---

## 3. 프로젝트 디렉터리 구조

```text
gameProject/
├── src/
│   ├── core/                    # [Pure TypeScript] DOM/Window/WebSocket 의존 0건 (서버와 직접 공유)
│   │   ├── constants.ts         # BATTLE_CALC_VERSION = "0.6.0", FIXED_DT = 1/60
│   │   ├── combat/              # 전투 월드, 데미지, 맞대결, 회피, 변신/각성, 필드, 상태이상
│   │   ├── ai/                  # 5단계 Utility AI & 보스 전술 프리셋 19종
│   │   ├── rpg/                 # 자유 항해 물리, 관문 검증, 에피소드, 선원 직책, 전투 브리지
│   │   ├── save/                # SaveEnvelope v5, SHA-256/HMAC, 직렬화, v0~v5 마이그레이터, 안티치트
│   │   └── net/                 # 통신 프로토콜, Lockstep 컨트롤러, 60틱 상태 해셔, 단말기 규칙
│   ├── data/                    # 100% 외부화 JSON (units, moves, forms, abilities, sea_zones, islands/*, episodes/*)
│   ├── platform/                # [멀티플랫폼 어댑터 계층] 게임 코어/씬과 네이티브 API를 완전 분리
│   │   ├── platformBridge.ts    # 런타임 자동 감지 (Electron -> Capacitor Android -> Web PWA)
│   │   ├── storage/             # IndexedDB(Web) / Atomic Node File(Electron) / Capacitor Filesystem(Android)
│   │   ├── fileTransfer/        # 네이티브 파일 다이얼로그(PC) / Share 시트(Android) / Blob(Web)
│   │   ├── device/              # 창 모드·F11(PC) / 가로고정·몰입모드·진동·뒤로가기(Android)
│   │   └── net/                 # WebSocketTransport (wss:// 검증, RTT) & LoopbackTransport
│   ├── render/                  # 960x540 Nearest-Neighbor Canvas 2D 렌더러 & HUD
│   ├── assets/                  # 프로시저럴 픽셀 아바타(36종+) & Web Audio 합성기 폴백
│   ├── input/                   # 키보드/마우스, 게임패드, 모바일 가상 터치패드 통합 입력
│   └── scenes/                  # SceneManager (항해/섬/전투/캠프/세이브/온라인/샌드박스)
├── server/                      # Node.js + ws 경량 중계 서버 (src/core/save/antiCheat.ts 직접 공유)
├── electron/                    # Windows PC Electron 메인 프로세스(app://resonance) & 보안 Preload IPC
├── android/                     # Capacitor Android 네이티브 프로젝트 (Gradle, AndroidManifest.xml)
├── tests/core/                  # Vitest 22개 테스트 스위트 (94개 검증 케이스)
├── vite.config.ts               # VITE_PLATFORM (web | electron | android) 분기 빌드 설정
├── electron-builder.yml         # Windows x64 NSIS 설치형 + Portable .exe 패키징 설정
├── capacitor.config.ts          # Android Capacitor 동기화 설정 (webDir: dist-android)
└── BUILD_RELEASE.md             # 릴리스 1줄 명령어 요약 문서
```

---

## 4. 플랫폼별 저장소 & 네이티브 어댑터 연결 구조 (`src/platform/`)

게임 코어(`src/core/`)와 씬(`src/scenes/`)에는 **플랫폼 분기 코드가 전혀 없으며**, 오직 `createPlatformBridge()`([platformBridge.ts](./src/platform/platformBridge.ts))가 런타임을 자동 판별하여 3종 어댑터를 주입합니다.

| 계층 | Target 1: Web / iOS / macOS PWA | Target 2: Windows PC (Electron) | Target 3: Android APK (Capacitor) |
| :--- | :--- | :--- | :--- |
| **런타임 감지** | 기본 폴백 (`web`) | `window.opElectronBridge` 존재 (`electron`) | `Capacitor.isNativePlatform()` (`android`) |
| **저장소 (`storage`)** | `IndexedDbStorageAdapter` (`OnePieceResonanceDB` + `localStorage` 폴백) | `ElectronFileStorageAdapter` → IPC → `AtomicNodeFileStore` (`%APPDATA%\OnePieceResonance\saves\`) | `CapacitorFilesystemStorageAdapter` (`Directory.Data/saves/` + `@capacitor/preferences`) |
| **파일 백업 (`fileTransfer`)** | 브라우저 Blob 다운로드 & `<input type="file">` / 드래그앤드롭 | Electron 네이티브 `showSaveDialog` / `showOpenDialog` (`*.op-save.json`) | `@capacitor/filesystem` (`Directory.Cache`) + `@capacitor/share` 시스템 공유 시트 |
| **기기 제어 (`device`)** | Fullscreen API & Web Vibration | `F11`/`Alt+Enter` 토글, `창/전체화면/테두리없음` 모드, 종료 확인창 | `@capacitor/screen-orientation` 가로 고정, `@capacitor/status-bar` 풀스크린, `@capacitor/haptics` 진동, `@capacitor/app` 뒤로가기 2회 종료 |

### 4.1 Electron 보안 IPC & 원자적 저장 (Windows PC)
- `electron/main.ts`는 `contextIsolation: true`, `nodeIntegration: false`, `sandbox: true`를 강제하고 `dist-electron/`을 커스텀 프로토콜 `app://resonance`로 안전하게 서빙합니다.
- `electron/preload.ts`는 `contextBridge.exposeInMainWorld('opElectronBridge', ...)`를 통해 아래 화이트리스트 채널만 노출합니다:
  - 세이브 IPC: `save:read`, `save:write`, `save:list`, `save:delete` (내부적으로 `AtomicNodeFileStore`가 `<file>.tmp.<pid>.<ts>`에 기록 후 `fs.rename`으로 교체해 정전/강제종료 시 세이브 손상을 방지)
  - 파일 다이얼로그 IPC: `dialog:exportSave`, `dialog:importSave`
  - 창 제어 IPC: `window:setDisplayMode`, `window:getDisplayMode`, `window:quit`

### 4.2 크로스플랫폼 세이브 호환 (`.op-save.json`)
- Windows PC(`%APPDATA%`), Android APK(`Directory.Data/saves/`), Web PWA(`IndexedDB`) 어디에서 Export한 `.op-save.json`이든 **동일한 `SaveEnvelope` v5 스키마 및 Canonical JSON HMAC-SHA256 서명**을 사용합니다.
- 다른 기기에서 Import해도 `IntegrityVerifier`와 `LegalityValidator`를 에러 없이 통과하며 `onlineEligible: true`가 유지됩니다(`tests/core/phase5CrossPlatformPackaging.test.ts`로 자동 검증됨).

---

## 5. 멀티플랫폼 빌드 & 패키징 가이드

모든 타깃은 `VITE_PLATFORM` 환경 변수로 `vite.config.ts`에서 빌드 구성을 자동 분기합니다.

| 플랫폼 타깃 | 명령어 | 출력 경로 | PWA Service Worker |
| :--- | :--- | :--- | :---: |
| **Web / iOS / macOS PWA** | `npm run build:web` | `dist-web/` | **활성화** (`sw.js`, `manifest.webmanifest`) |
| **Windows PC 웹+메인 빌드** | `npm run build:electron` | `dist-electron/`, `dist-electron-main/` | 비활성화 (`base: './'`) |
| **Windows PC 언팩 `.exe` 테스트** | `npm run package:win:dir` | `release/windows/win-unpacked/OnePieceGrandVoyage.exe` | 비활성화 |
| **Windows PC 최종 설치형/포터블 `.exe`** | `npm run package:win` | `release/windows/` (NSIS 설치형 + Portable 단일 실행파일) | 비활성화 |
| **Android 웹 번들 빌드** | `npm run build:android` | `dist-android/` | 비활성화 (`base: './'`) |
| **Android Capacitor 동기화** | `npm run package:android:sync` | `dist-android/` → `android/` | 비활성화 |
| **Android Debug `.apk` 생성** | `npm run package:android:apk` | `android/app/build/outputs/apk/debug/app-debug.apk` | 비활성화 |

### 5.1 멀티플레이어 서버 주소 주입 (`VITE_MULTIPLAYER_URL`)
프로덕션 빌드에서는 혼합 콘텐츠 차단을 방지하기 위해 `wss://` 프로토콜을 검증합니다.
```powershell
$env:VITE_MULTIPLAYER_URL="wss://relay.your-domain.com"; npm run build:web
$env:VITE_MULTIPLAYER_URL="wss://relay.your-domain.com"; npm run package:win
$env:VITE_MULTIPLAYER_URL="wss://relay.your-domain.com"; npm run package:android:sync
```

### 5.2 새 PC에서 Android `.apk` 빌드 시 주의사항 (JDK 17 & Android SDK)
1. **JDK 17 사용 필수:** Android Studio 기본 내장 JBR(Java 21/25 등)은 현재 Gradle 8.14.3과 충돌할 수 있으므로, `JAVA_HOME`을 JDK 17 경로로 지정한 뒤 빌드하세요.
   ```powershell
   $env:JAVA_HOME="C:\Program Files\Java\jdk-17"
   npm run package:android:sync
   cd android
   .\gradlew.bat assembleDebug
   ```
2. **Android SDK 경로 설정:** 새 PC에서 처음 체크아웃하면 `android/local.properties`는 `.gitignore`로 제외되어 있으므로 `ANDROID_HOME` 환경 변수를 등록하거나 `android/local.properties`에 아래 한 줄을 생성하세요:
   ```properties
   sdk.dir=C\:\\Users\\<사용자명>\\AppData\\Local\\Android\\Sdk
   ```
3. **Android Studio로 열기:**
   ```powershell
   npm run package:android:sync
   npx cap open android
   ```
4. **설치된 Capacitor 공식 플러그인 (8종):** `@capacitor/core`, `@capacitor/android`, `@capacitor/app`, `@capacitor/filesystem`, `@capacitor/preferences`, `@capacitor/share`, `@capacitor/status-bar`, `@capacitor/screen-orientation`, `@capacitor/haptics` (`AndroidManifest.xml`에 `sensorLandscape`, `hardwareAccelerated="true"`, `INTERNET`, `ACCESS_NETWORK_STATE` 설정 완료).

---

## 6. 형상관리(Git) 및 추후 작업 가이드

- **원격 저장소:** `https://github.com/princebyun/gameProject.git` (`main` 브랜치)
- **버전 관리 원칙:**
  - 전투 규칙·유닛·훅 변경 시 `src/core/constants.ts`의 `BATTLE_CALC_VERSION`을 올리고 `tests/core/purity.test.ts` 및 관련 테스트를 동기화하세요.
  - 세이브 스키마 확장 시 `src/core/save/schema.ts`의 `CURRENT_SAVE_VERSION`을 올리고 `src/core/save/migrator.ts`에 이전 버전 호환 마이그레이터를 추가해 기존 세이브의 `onlineEligible: true`를 보존하세요.
  - 커밋 전 필수 검증 명령어:
    ```powershell
    npm run typecheck
    npm run test
    npm run build:web
    npm run build:electron
    npm run build:android
    ```
- **참고 문서:** 세부 릴리스 명령어는 [BUILD_RELEASE.md](./BUILD_RELEASE.md)를 참고하세요.
```

## File: `package.json`
```json
{
  "name": "aether-clash-engine",
  "private": true,
  "version": "0.1.0",
  "type": "module",
  "main": "dist-electron-main/electron/main.js",
  "author": "One Piece Grand Voyage Team",
  "description": "One Piece 2D Pixel Real-Time Action & Sea-Zone Free Sailing RPG",
  "scripts": {
    "dev": "vite",
    "dev:server": "node --import tsx server/index.ts",
    "dev:all": "npx concurrently \"npm run dev:server\" \"npm run dev\"",
    "build": "npm run build:web",
    "build:web": "tsc --noEmit && cross-env VITE_PLATFORM=web vite build",
    "build:electron": "tsc --noEmit && cross-env VITE_PLATFORM=electron vite build && tsc -p tsconfig.electron.json && node --input-type=module -e \"import fs from 'node:fs'; fs.writeFileSync('dist-electron-main/package.json', JSON.stringify({ type: 'commonjs' }));\"",
    "build:android": "tsc --noEmit && cross-env VITE_PLATFORM=android vite build",
    "package:win:dir": "npm run build:electron && electron-builder --win --x64 --dir",
    "package:win": "npm run build:electron && electron-builder --win --x64",
    "package:android:sync": "npm run build:android && npx cap sync android",
    "package:android:apk": "npm run package:android:sync && cd android && ./gradlew assembleDebug",
    "preview": "vite preview --outDir dist-web",
    "test": "vitest run",
    "typecheck": "tsc --noEmit",
    "check:arch": "node scripts/check-architecture.mjs",
    "validate:assets": "node --import tsx scripts/validate-assets.ts",
    "validate:scripts": "node --import tsx scripts/validate-scripts.ts",
    "validate:maps": "node scripts/validate-maps.mjs",
    "fetch:assets": "node scripts/fetch-web-assets.mjs",
    "import:pack": "node --import tsx scripts/import-sprite-pack.mjs",
    "import:pro": "node scripts/import-pro-assets.mjs",
    "bake:sprites": "node --import tsx scripts/legacy/bake-sprites.mjs",
    "bake:landmarks": "node scripts/legacy/bake-landmarks.mjs",
    "ai:handoff": "node --import tsx scripts/ai-handoff.mjs"
  },
  "dependencies": {
    "@capacitor/app": "^8.1.2",
    "@capacitor/core": "^8.6.2",
    "@capacitor/filesystem": "^8.1.5",
    "@capacitor/haptics": "^8.0.2",
    "@capacitor/preferences": "^8.0.1",
    "@capacitor/screen-orientation": "^8.0.2",
    "@capacitor/share": "^8.0.3",
    "@capacitor/status-bar": "^8.0.4",
    "pixi.js": "^8.23.0",
    "ws": "^8.18.0"
  },
  "devDependencies": {
    "@capacitor/android": "^8.6.2",
    "@capacitor/cli": "^8.6.2",
    "@types/node": "^22.0.0",
    "@types/ws": "^8.5.13",
    "cross-env": "^10.1.0",
    "electron": "^45.4.1",
    "electron-builder": "^26.18.0",
    "tsx": "^4.19.2",
    "typescript": "^5.6.0",
    "vite": "^5.4.0",
    "vite-plugin-pwa": "^0.20.5",
    "vitest": "^2.1.0"
  }
}
```

## File: `src/core/constants.ts`
```ts
export const BATTLE_CALC_VERSION = '0.6.0' as const;
export const FIXED_DT = 1 / 60;
export const LOGICAL_WIDTH = 960;
export const LOGICAL_HEIGHT = 540;
```

## File: `src/data/assets/types.ts`
```ts
export type SpriteAnimState =
  | 'IDLE'
  | 'MOVE'
  | 'WINDUP'
  | 'ATTACK_MELEE'
  | 'ATTACK_CAST'
  | 'CLASH'
  | 'DODGE'
  | 'HIT'
  | 'DOWNED'
  | 'TRANSFORM'
  | 'VICTORY';

export const STANDARD_SPRITE_ANIM_STATES: readonly SpriteAnimState[] = [
  'IDLE',
  'MOVE',
  'WINDUP',
  'ATTACK_MELEE',
  'ATTACK_CAST',
  'CLASH',
  'DODGE',
  'HIT',
  'DOWNED',
  'TRANSFORM',
  'VICTORY'
] as const;

export type AssetSourceKind =
  | 'EXTERNAL_PNG'
  | 'EXTERNAL_OGG'
  | 'BAKED_FALLBACK'
  | 'CHIPTUNE_FALLBACK';

export interface SpriteAtlasFrameRect {
  x: number;
  y: number;
  w: number;
  h: number;
  pivotX: number;
  pivotY: number;
}

export interface SpriteAnimClipDef {
  row: number;
  frames: number;
  fps: number;
  loop: boolean;
  hitFrame?: number;
  frameRects?: SpriteAtlasFrameRect[];
}

export interface SpriteSheetManifestEntry {
  key: string;
  unitId?: string;
  formId?: string;
  shipId?: string;
  rigType?: string;
  source?: 'ARTICULATED_RIG_V2' | 'EXTERNAL_WEB_SHEET' | 'USER_CUSTOM_SHEET';
  atlasMode?: 'GRID' | 'VARIABLE_PACK';
  src: string;
  frameWidth: 32 | 48 | 64 | 96 | 128;
  frameHeight: 32 | 48 | 64 | 96 | 128;
  targetDisplayHeight?: number;
  anchor: { x: number; y: number };
  animations: Record<SpriteAnimState, SpriteAnimClipDef>;
}

export interface SpriteSheetManifestFile {
  version: string;
  standardRowOrder: SpriteAnimState[];
  entries: SpriteSheetManifestEntry[];
}

export interface TilesetPalette {
  base: string;
  detail: string;
  edge: string;
  wall: string;
  accent: string;
  waterOrHazard: string;
}

export interface TilesetManifestEntry {
  biomeId: string;
  category: 'SEA' | 'ISLAND_DUNGEON';
  name: string;
  src: string;
  tileSize: 16;
  renderScale: 2;
  layeredAtlas?: boolean;
  rows?: number;
  animatedRow: number;
  animatedFrames: number;
  animatedFps: number;
  palette: TilesetPalette;
}

export interface TilesetManifestFile {
  version: string;
  tileSize: 16;
  islandBiomeMap: Record<string, string>;
  seaZoneBiomeMap: Record<string, string>;
  arenaBiomeMap: Record<string, string>;
  biomes: TilesetManifestEntry[];
}

export interface ChiptunePatternPreset {
  keyRootMidi: number;
  scale: 'MAJOR' | 'MINOR' | 'DORIAN' | 'PHRYGIAN';
  leadPattern: number[];
  arpPattern: number[];
  bassPattern: number[];
  drumPattern: number[];
}

export interface BgmTrackManifestEntry {
  id: string;
  name: string;
  src: string;
  loop: boolean;
  loopStartSec: number;
  loopEndSec: number;
  bpm: number;
  volume: number;
  chiptunePreset: ChiptunePatternPreset;
}

export interface SfxManifestEntry {
  id: string;
  name: string;
  src: string;
  volume: number;
  throttleMs: number;
  maxPolyphony: number;
  pitchJitterRatio: number;
  synthPreset: string;
}

export interface AudioManifestFile {
  version: string;
  crossfadeSec: number;
  bgmTracks: BgmTrackManifestEntry[];
  sfxEntries: SfxManifestEntry[];
}

export type BackdropLayerKey = 'sky' | 'mid' | 'ground';

export interface BattleBackdropLayerSet {
  sky: string;
  mid: string;
  ground: string;
}

export interface BattleBackdropManifestEntry {
  id: string;
  name: string;
  width: number;
  height: number;
  groundY: number;
  timeOfDay: 'DAY' | 'DUSK' | 'NIGHT';
  ambientTint: string;
  parallaxFactors: [number, number, number];
  layers: BattleBackdropLayerSet;
}

export interface BattleBackdropsManifestFile {
  version: string;
  islandBackdropMap: Record<string, string>;
  seaZoneBackdropMap: Record<string, string>;
  arenaModeBackdropMap: Record<string, string>;
  backdrops: BattleBackdropManifestEntry[];
}

export type VfxAtlasId =
  | 'slash_arc'
  | 'cross_slash'
  | 'fire_explosion'
  | 'lightning_strike'
  | 'conqueror_bolt'
  | 'ice_shatter'
  | 'water_splash'
  | 'smoke_puff'
  | 'hit_spark'
  | 'parry_flash'
  | 'beam_core'
  | 'awakening_burst';

export interface VfxAtlasManifestEntry {
  id: VfxAtlasId | string;
  src: string;
  frameWidth: number;
  frameHeight: number;
  frameCount: number;
  fps: number;
  blendMode: 'source-over' | 'lighter';
  scale: number;
}

export interface VfxManifestFile {
  version: string;
  atlases: VfxAtlasManifestEntry[];
}

export interface WorldLandmarkManifestEntry {
  id: string;
  seaZoneId: 'east_blue' | 'grand_line' | 'new_world';
  kind: 'ISLAND' | 'SEA_GATE';
  label: string;
  frameWidth: number;
  frameHeight: number;
  frameCount: number;
  fps: number;
  path: string;
}

export interface WorldLandmarkManifestFile {
  version: number;
  landmarks: WorldLandmarkManifestEntry[];
}
```

## File: `src/render/sprite/rig/rigTypes.ts`
```ts
import type {
  SpriteAnimClipDef,
  SpriteAnimState
} from '../../../data/assets/types';

export type RigType =
  | 'humanoid_brawler'
  | 'swordsman_weapon'
  | 'caster_ranged'
  | 'small_agile'
  | 'bulky_tall_coat'
  | 'giant_beast';

export type BrawlerAttackStyle = 'punch' | 'stretch_punch' | 'kick';

export type WeaponMountStyle =
  | 'right_hand'
  | 'dual_hand'
  | 'santoryu_mouth'
  | 'quad_giraffe'
  | 'cane_sword'
  | 'trident'
  | 'axe_arm'
  | 'nodachi'
  | 'kiribachi'
  | 'flame_sword';

export type CasterPropStyle =
  | 'clima_tact_zeus'
  | 'kabuto_slingshot'
  | 'hana_crossed_arms'
  | 'bara_split_body'
  | 'ito_strings_coat'
  | 'sand_hook'
  | 'goro_drums'
  | 'moku_jitte'
  | 'kage_bats'
  | 'doa_portal'
  | 'elemental_orb';

export type SmallAgileSubMode =
  | 'reindeer_chibi'
  | 'guard_sphere'
  | 'kungfu_brawler';

export type BulkyCoatStyle =
  | 'admiral_justice_coat'
  | 'pirate_captain_coat'
  | 'lunarian_wings'
  | 'fishman_gi'
  | 'cyborg_arms'
  | 'wootz_armor'
  | 'venom_wings'
  | 'none';

export type GiantBeastSubRig =
  | 'serpentine_dragon'
  | 'spider_oni'
  | 'winged_phoenix'
  | 'giant_humanoid';

export type PortraitEmotion =
  | 'normal'
  | 'angry'
  | 'determined'
  | 'shocked'
  | 'smirk'
  | 'sad'
  | 'excited'
  | 'battle_cry';

export const ALL_PORTRAIT_EMOTIONS: readonly PortraitEmotion[] = [
  'normal',
  'angry',
  'determined',
  'shocked',
  'smirk',
  'sad',
  'excited',
  'battle_cry'
] as const;

export type ThreeToneHex = [string, string, string]; // [highlight, base, shadow]

export interface CharacterBlueprintPalette {
  skin: ThreeToneHex;
  hair: ThreeToneHex;
  top: ThreeToneHex;
  bottom: ThreeToneHex;
  accent: ThreeToneHex;
  weaponOrEffect: ThreeToneHex;
  coatOrWings?: ThreeToneHex;
  hatOrHelm?: ThreeToneHex;
  scarColor?: string;
  eyeColor?: string;
}

export type BlueprintHairStyle =
  | 'spiky_short'
  | 'marimo_cropped'
  | 'side_sweep_left_covered'
  | 'long_wavy'
  | 'curly_bandanna'
  | 'reindeer_antlers_hat'
  | 'long_straight_dark'
  | 'cyborg_pompadour'
  | 'giant_afro_skull'
  | 'topknot_sideburns'
  | 'flame_white_nika'
  | 'slick_back'
  | 'pineapple_blonde'
  | 'oni_horns_mane'
  | 'viking_horned_helm'
  | 'elder_beard_cap'
  | 'bull_horns'
  | 'clown_hat_tails'
  | 'marine_cap'
  | 'fur_hood'
  | 'spotted_hat'
  | 'feathered_shades'
  | 'spiky_scarf'
  | 'winged_mask'
  | 'white_wild_hair'
  | 'crown_hippo'
  | 'sleep_mask_curls'
  | 'bandana_earlobes'
  | 'onion_goth'
  | 'top_hat_pigeon'
  | 'shadow_silhouette';

export type BlueprintFaceFeature =
  | 'under_eye_scar'
  | 'left_eye_scar'
  | 'curly_brow_cigar'
  | 'long_nose_goggles'
  | 'blue_nose'
  | 'sunglasses_star'
  | 'skull_sockets'
  | 'fishman_gills_fangs'
  | 'steel_jaw'
  | 'clown_red_nose'
  | 'face_stitch_cigar'
  | 'doffy_shades'
  | 'mouth_scarf_fangs'
  | 'eye_bandage'
  | 'admiral_shades'
  | 'black_beard_grin'
  | 'giraffe_square_nose'
  | 'leopard_muzzle'
  | 'lunarian_mask_tattoo'
  | 'oni_fangs_mustache'
  | 'none';

export type BlueprintChestFeature =
  | 'x_scar_open_vest'
  | 'diagonal_scar_haramaki'
  | 'black_suit_tie'
  | 'bikini_top'
  | 'overalls_strap'
  | 'fur_chest'
  | 'corset_collar'
  | 'open_shirt_chain'
  | 'cravat_ribs'
  | 'sun_tattoo_gi'
  | 'admiral_suit_tie'
  | 'gold_plate_armor'
  | 'pink_feather_chest'
  | 'tattoos_bare_chest'
  | 'dragon_scales_chest'
  | 'mecha_star_chest'
  | 'none';

export interface CharacterBlueprintHeadSpec {
  hairStyle: BlueprintHairStyle;
  faceFeature?: BlueprintFaceFeature;
  chestFeature?: BlueprintChestFeature;
  hasStrawHat?: boolean;
}

export type CharacterBlueprintGroup =
  | 'straw_hats'
  | 'east_blue'
  | 'grand_line'
  | 'marineford_allies'
  | 'new_world'
  | 'arena_originals';

export interface CharacterBlueprintEntry {
  key: string;
  unitId: string;
  formId: string;
  name: string;
  group: CharacterBlueprintGroup;
  rigType: RigType;
  frameWidth: 48 | 64 | 96;
  frameHeight: 48 | 64 | 96;
  anchor: { x: number; y: number };
  attackStyle?: BrawlerAttackStyle;
  weaponMount?: WeaponMountStyle;
  casterProp?: CasterPropStyle;
  smallSubMode?: SmallAgileSubMode;
  coatStyle?: BulkyCoatStyle;
  giantSubRig?: GiantBeastSubRig;
  hagoromoCloud?: 'white' | 'black' | null;
  elementalArm?:
    | 'magma'
    | 'ice'
    | 'light'
    | 'dark_quake'
    | 'smoke'
    | 'sand'
    | 'venom'
    | 'fire_leg'
    | 'water_fist'
    | null;
  head: CharacterBlueprintHeadSpec;
  palette: CharacterBlueprintPalette;
}

export interface CharacterBlueprintsFile {
  version: string;
  entries: CharacterBlueprintEntry[];
}

export interface BakedSpriteMetaFile {
  key: string;
  unitId: string;
  formId: string;
  rigType: RigType;
  frameWidth: 32 | 48 | 64 | 96;
  frameHeight: 32 | 48 | 64 | 96;
  sheetWidth: number;
  sheetHeight: number;
  anchor: { x: number; y: number };
  source: 'PROCEDURAL_RIG_BAKED' | 'USER_CUSTOM_SHEET';
  sha256: string;
  bakedAt: string;
  animations: Record<SpriteAnimState, SpriteAnimClipDef>;
}

export function createStandardRigAnimations(): Record<
  SpriteAnimState,
  SpriteAnimClipDef
> {
  return {
    IDLE: { row: 0, frames: 4, fps: 5, loop: true },
    MOVE: { row: 1, frames: 6, fps: 12, loop: true },
    WINDUP: { row: 2, frames: 3, fps: 10, loop: false },
    ATTACK_MELEE: { row: 3, frames: 4, fps: 14, loop: false, hitFrame: 2 },
    ATTACK_CAST: { row: 4, frames: 4, fps: 12, loop: false, hitFrame: 2 },
    CLASH: { row: 5, frames: 2, fps: 12, loop: true },
    DODGE: { row: 6, frames: 3, fps: 12, loop: false },
    HIT: { row: 7, frames: 2, fps: 10, loop: false },
    DOWNED: { row: 8, frames: 2, fps: 4, loop: true },
    TRANSFORM: { row: 9, frames: 4, fps: 10, loop: false, hitFrame: 2 },
    VICTORY: { row: 10, frames: 3, fps: 6, loop: true }
  };
}
```
