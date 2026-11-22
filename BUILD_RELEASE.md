# One Piece Grand Voyage — Multi-Target Build & Release Guide (`BUILD_RELEASE.md`)

단일 게임 소스코드(`src/core/`, `src/scenes/`, `src/data/`)를 유지한 채 **Web PWA (`dist-web`)**, **Windows 64비트 PC 실행 파일 (`dist-electron` → `.exe`)**, **Android 모바일 앱 (`dist-android` → `.apk`)** 3개 타깃으로 빌드·패키징하는 가이드입니다.

---

## 1. 타깃별 빌드 & 패키징 1줄 명령어 요약

| 플랫폼 타깃 | 명령어 | 출력 경로 | 비고 |
| :--- | :--- | :--- | :--- |
| **Target 1: Web / iOS / macOS PWA** | `npm run build:web` | `dist-web/` | `sw.js`, `manifest.webmanifest` 포함 오프라인 PWA |
| **Target 2-A: Windows PC 언팩 폴더 (빠른 스모크 테스트)** | `npm run package:win:dir` | `release/windows/win-unpacked/` | `OnePieceGrandVoyage.exe` 즉시 실행 테스트용 |
| **Target 2-B: Windows PC 최종 배포판 (설치형 + 무설치 포터블)** | `npm run package:win` | `release/windows/` | `nsis` 설치형 `.exe` + `portable` 단일 `.exe` 동시 생성 |
| **Target 3-A: Android 웹 번들 + Capacitor 네이티브 동기화** | `npm run package:android:sync` | `dist-android/` → `android/` | `sw.js` 제외, Capacitor 7종 플러그인 & 에셋 동기화 |
| **Target 3-B: Android Debug APK 빌드 (JDK 17+ / Android SDK 환경)** | `npm run package:android:apk` | `android/app/build/outputs/apk/debug/app-debug.apk` | Gradle Wrapper 1줄 APK 생성 |

---

## 2. 멀티플레이어 서버 주소 주입 (`VITE_MULTIPLAYER_URL`)

프로덕션 빌드에서는 보안 및 HTTPS/커스텀 스킴(`app://resonance`, `https://localhost`) 혼합 콘텐츠 차단을 방지하기 위해 `wss://` 프로토콜이 기본 적용됩니다.

```powershell
# PowerShell 예시: 커스텀 중계 서버 주소 주입 후 3대 타깃 빌드
$env:VITE_MULTIPLAYER_URL="wss://relay.your-domain.com"; npm run build:web
$env:VITE_MULTIPLAYER_URL="wss://relay.your-domain.com"; npm run package:win
$env:VITE_MULTIPLAYER_URL="wss://relay.your-domain.com"; npm run package:android:sync
```

---

## 3. Windows 64비트 PC (`.exe`) 상세 안내

- **세이브 저장 경로:** `%APPDATA%\OnePieceResonance\saves\`
  - 슬롯 파일: `auto.json`, `slot_1.json`, `slot_2.json`, `slot_3.json`
  - 글로벌 설정 및 프리셋: `settings.json`, `presets.json`
  - **원자적 쓰기(Atomic Write):** 저장 시 `<slot>.json.tmp.<pid>.<timestamp>`에 먼저 기록한 뒤 `fs.rename`으로 교체하여 강제 종료나 정전 시에도 세이브 파일 손상을 방지합니다.
- **단축키 & 창 모드:** `F11` 또는 `Alt + Enter`로 즉시 전체화면을 토글할 수 있으며, 인게임 `⚙ 설정/접근성` 메뉴에서 `창 모드 / 전체화면 / 테두리 없는 창`을 전환할 수 있습니다.

---

## 4. Android 모바일 앱 (`.apk`) 상세 안내

### A. 사전 요구 사항 (로컬 PC에서 `.apk` 직접 빌드 시)
1. **JDK 17 또는 JDK 21** 설치 (`java -version` 확인 및 `JAVA_HOME` 환경 변수 등록)
2. **Android SDK (Command-line Tools / Platform 34+)** 설치 (`ANDROID_HOME` 또는 `android/local.properties`에 `sdk.dir` 지정)

### B. 1줄 명령어로 Debug APK 생성
```powershell
# 웹 번들 빌드 + Capacitor Android 동기화 + Gradle assembleDebug 실행
npm run package:android:apk
```
또는 Android Studio가 설치된 환경에서는 아래 명령어로 프로젝트를 열어 즉시 기기 실행 및 Signed APK/AAB 추출이 가능합니다:
```powershell
npm run package:android:sync
npx cap open android
```
생성된 APK 경로:
- `android/app/build/outputs/apk/debug/app-debug.apk`

---

## 5. 기기 간 크로스플랫폼 세이브 호환 (`.op-save.json`)

- **Windows PC (`%APPDATA%`) ↔ Android APK (공유 시트 / 파일 선택기) ↔ Web PWA (IndexedDB)** 간에 내보낸 `.op-save.json` 백업 파일은 100% 동일한 `SaveEnvelope` v5 스키마와 Canonical JSON `HMAC-SHA256-DERIVED` 서명을 사용합니다.
- 어느 기기에서 내보낸 `.op-save.json`이든 다른 플랫폼에서 불러올 때 `IntegrityVerifier`와 `LegalityValidator`를 에러 없이 통과하며 `onlineEligible: true` 상태가 그대로 유지됩니다.
