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
