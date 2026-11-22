# AI_BUNDLE.md — One Piece Grand Voyage Handoff Context Bundle

Generated at: 2026-11-22T15:44:28.164Z

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

> **최종 업데이트 기준:** Stage 9 APK 패키징 직전 전면 아키텍처·성능·안정성 리팩토링(순환 참조 0건 · TypeScript `strict`+`noUncheckedIndexedAccess` 0에러 · God Class 전량 분리 · `ctx.shadowBlur` 0건 · 60Hz 풀/컬링 최적화 · GPU 오프스크린 캔버스·`AbortController`·WebAudio 누수 차단) · 프로덕션 웹 빌드(`dist-web/`) 검증 완료  
> **현재 프로젝트 상태:** **APK 패키징 직전 리팩토링 & 정적·결정론·유닛·E2E 자동화 게이트 통과 완료 (네이티브 APK 빌드는 요청 범위 제외; 라이브 Chrome CDP 검증은 원격 디버깅 활성화 시 즉시 실행 가능)**  
> **버전 현황:**  
> - **앱 패키지 버전:** `0.1.0` (`package.json`)  
> - **전투 계산 버전 (`BATTLE_CALC_VERSION`):** `"0.6.0"` (`src/core/constants.ts` — 리팩토링 전후 결정론 `stateHash` 3종 100% 동일 유지)  
> - **세이브 스키마 버전 (`CURRENT_SAVE_VERSION`):** `5` (`v0 → v1 → v2 → v3 → v4 → v5` 무손실 순차 마이그레이션 & `HMAC-SHA256-DERIVED` 2단계 안티치트 호환)  
> - **TypeScript & 아키텍처 규격:** `strict: true` + `noUncheckedIndexedAccess: true` + `noUnusedLocals/Parameters: true` + `noImplicitReturns: true` (`check:arch` `192`개 파일 순환 참조 `0건`, 계층 위반 `0건`, `any`/`@ts-ignore` `0건`, `shadowBlur` `0건`, 400줄 이상 로직 파일 `0건`)  
> - **에셋 매니페스트:** 스프라이트 시트 `98/98종` (`External PNG: 98, Baked Fallback: 0`) | 표정 초상화 `352/352종` (`64×64 PNG`) | 바이옴 타일셋 `14종` | 오디오 `BGM 10곡 / SFX 18종`  
> **자동화 검증 현황:** `npm run check:arch` 통과 (`0 issues`) | `npm run validate:assets` 통과 (`0 errors`) | `npm run validate:scripts` 통과 (`0 errors`) | `npm run typecheck` & Electron `tsc` 통과 (`0 errors`) | `npm run build:web` 통과 (`dist-web/` `564`개 파일, `2,485,485 bytes`) | Vitest **25개 스위트 / 106개 테스트 전원 통과**

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
  - 전투 코어 결정론(`BATTLE_CALC_VERSION = "0.6.0"`, 기준선 `stateHash` 3종 100% 일치), 세이브 호환성(`CURRENT_SAVE_VERSION = 5`), 순환 참조 `0건`, 계층 침범 `0건`, `any`/`@ts-ignore` `0건`, `ctx.shadowBlur` `0건`, 400줄 이상 로직 파일 `0건`, 오프스크린 캔버스 GPU 메모리(`width=0, height=0`) 및 `AbortController`·WebAudio 해제 모두 검증 완료.
- **라이브 Chrome DevTools(CDP) 원격 디버깅 연결 대기:**
  - 프로덕션 번들(`dist-web/`) 무결성, 갤럭시 S25 울트라(`19.5:9`, `915×412`) 뷰포트·Safe Area, 60FPS 풀·컬링·GPU 메모리 해제 회귀는 자동화 테스트(`tests/viewport/productionDistGalaxyS25E2E.test.ts`, `tests/render/phase3OptimizationAndLeak.test.ts`)로 100% 검증 완료.
  - 호스트 Chrome에서 `chrome://inspect/#remote-debugging`(`DevToolsActivePort`)이 비활성화 상태여서 라이브 CDP 브라우저 계측만 대기 중이며, 활성화 시 `npm run preview`로 즉시 실측 가능.
- **선택적 외부 에셋 핫스왑 슬롯 (Optional Asset Slots):**
  - `public/assets/tilesets/` (`14종` 바이옴 타일셋) 및 `public/assets/audio/` (`BGM 10곡 / SFX 18종`)는 현재 런타임 프로시저럴 오토타일 베이커 및 WebAudio 칩튠 신디사이저로 100% 동작 중이며, 추후 외부 `.png` / `.ogg` 파일 배치 시 코드 수정 없이 즉시 로드 가능.

---

## 3. 다음 할 일 (Next Steps)

1. **최종 Android APK 재패키징 및 갤럭시 S25 울트라(`19.5:9`) 실기기 설치 테스트 (`npm run package:android:apk`)**
   - Stage 9 리팩토링(60FPS 드로우콜 최적화·오프스크린 GPU 텍스처 즉시 해제·메모리 누수 차단)이 반영된 최신 코드로 `npm run build:android` → `npx cap sync android` → Gradle APK 빌드(`assembleDebug` / `assembleRelease`)를 실행하고 실기기 테스트 및 릴리스 서명 진행.
2. **라이브 Chrome 원격 디버깅(`chrome://inspect/#remote-debugging`) 프로파일링 (선택)**
   - 호스트 Chrome에서 원격 디버깅을 켠 뒤 `npm run preview`(`http://localhost:4173/`)에 연결해 실브라우저 60FPS 프레임 타임 및 씬 반복 전환 시 `performance.memory` 힙 안정성 실측.
3. **Windows 데스크톱(Electron) 최신 리팩토링 반영 리패키징 (`npm run package:win`)**
   - 필요 시 Stage 9 최적화가 반영된 Windows 설치형/포터블 실행 파일 재생성 및 코드 서명 배포.
4. **선택적 외부 타일셋(`.png`) 및 오디오(`.ogg`) 에셋 핫스왑 확장**
   - `public/assets/tilesets/` 및 `public/assets/audio/`에 커스텀 마스터링 파일 추가 시 `npm run validate:assets`로 즉시 검증 가능.

---

## 4. 빠른 검증 및 실행 방법

```powershell
# 1. 아키텍처·순환참조·any·shadowBlur 자동 감사
npm run check:arch

# 2. 스프라이트·초상화·타일셋·오디오 대소문자 엄격 무결성 검사
npm run validate:assets

# 3. 캠페인·섬·대사·유닛·폼·스킬 데이터 교차 참조 무결성 검사
npm run validate:scripts

# 4. 정적 타입 검사 (strict + noUncheckedIndexedAccess)
npm run typecheck

# 5. 전체 단위/결정론/최적화/E2E 테스트 (25개 스위트 / 106개 테스트)
npm run test

# 6. 프로덕션 웹 빌드 및 AI 핸드오프 번들 갱신
npm run build:web
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
    "bake:sprites": "node --import tsx scripts/bake-sprites.mjs",
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

export interface SpriteAnimClipDef {
  row: number;
  frames: number;
  fps: number;
  loop: boolean;
  hitFrame?: number;
}

export interface SpriteSheetManifestEntry {
  key: string;
  unitId?: string;
  formId?: string;
  shipId?: string;
  rigType?: string;
  src: string;
  frameWidth: 32 | 48 | 64 | 96;
  frameHeight: 32 | 48 | 64 | 96;
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
