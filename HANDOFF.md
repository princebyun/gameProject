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
