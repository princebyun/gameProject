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
