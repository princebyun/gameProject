# AGENTS.md — 원피스 2D 실시간 액션 에피소드 RPG 공용 AI 불변 규칙

이 문서는 Gemini, Claude, ChatGPT 및 모든 IDE 코딩 에이전트가 본 프로젝트에서 작업할 때 **예외 없이 준수해야 하는 공용 불변 규칙**입니다. 작업 시작 전 반드시 이 파일과 `HANDOFF.md`를 함께 읽으십시오.

---

## 1. 프로젝트 성격 및 범위
- **프로젝트:** 개인 학습·연구 목적의 원피스(One Piece) IP 기반 2D 실시간 액션 & 오픈월드 자유 항해 에피소드 RPG
- **비상업적 원칙:** 상업적 배포 및 수익화를 일절 하지 않는 개인 연구 프로젝트입니다.
- **목표 플랫폼:** PC (Windows `.exe` / Electron), Android (`.apk` / Capacitor — **갤럭시 S25 울트라 `19.5:9` 최우선 기준**), Web / iOS PWA

---

## 2. 핵심 아키텍처 불변 규칙
1. **시뮬레이션 코어 순수성 및 결정론 (`src/core/`):**
   - `src/core/` 하위의 모든 파일은 DOM, `window`, `document`, Canvas, `Date.now`, `Math.random`을 절대 참조하지 않는 **Pure TypeScript**로 유지합니다 (`tests/core/purity.test.ts` 통과 필수).
   - 모든 전투 물리·판정·패링·합동기·컷인 프리즈는 **60Hz 고정 타임스텝(`FIXED_DT`)**과 **`SeededPRNG`** 기반 결정론으로 동작해야 하며, 온라인 2인 대전 및 3인 협동 레이드에서 `computeBattleStateHash()`가 100% 일치해야 합니다.
2. **데이터 드리븐 설계 (`src/data/`):**
   - 캐릭터(`units.json`), 기술(`moves.json`), 변신 폼(`forms.json`), 해역(`sea_zones.json`), 섬(`islands/`), 대사(`dialogues/`), 합동기(`combos.json`), 엔드게임(`endgame/`), 에셋 매니페스트(`assets/`)는 모두 JSON 데이터 드리븐 구조를 유지합니다.
3. **갤럭시 S25 울트라(`19.5:9`) 반응형 뷰포트 & Safe Area 최우선:**
   - 세로 논리 해상도 `540px` 고정 + 동적 가로(`960~1260px`, S25 울트라 기준 약 `1170x540`)로 레터박스 없이 렌더링하되, `src/core/` 결정론 전투 아레나 좌표(`960x540`)는 불변으로 유지합니다.
   - Android 15 Edge-to-Edge, `shortEdges` 펀치홀 대응, Safe Area 인셋 및 엄지 친화적 터치 버튼 비겹침(`915x412`, `844x390`)을 반드시 준수합니다.
4. **버전 동기화 및 세이브 하위 호환성:**
   - 전투 판정·입력 비트(`InputFrame`)·로스터 규칙을 변경할 때는 `BATTLE_CALC_VERSION`을 상향하고 클라이언트·서버·테스트·`SaveMigrator`를 모두 동기화합니다.
   - 세이브 스키마 변경 시 `SaveMigrator` 하위 호환 마이그레이션과 `LegalityValidator` 정합성 검증을 반드시 동시 업데이트해 기존 세이브 오탐을 방지합니다.
5. **에셋 원본과 배포 번들 분리:**
   - 고화질 외부 원본 도트/초상화는 반드시 루트 `raw_assets/`에, 썸네일 추출 결과는 루트 `exported_thumbnails/`에 보관해 최종 웹(`dist-web/`)·Android APK(`dist-android/`) 번들 용량을 오염시키지 않습니다.
   - 정규화·크로마키·디프린지 변환을 마친 최종 리소스만 `public/assets/`에 배치하며, 외부 PNG가 1장(`IDLE`)만 등록된 캐릭터라도 이동·공격 시 기존 프로시저럴 도형으로 회귀하지 않도록 유지합니다.
6. **접근성 및 품질 원칙:**
   - `flashEffect === false` 설정 시 화면 번쩍임, 임팩트 프레임, 픽셀 컷인 섬광을 모두 차단(암전 딤 대체)합니다.
   - 모든 사용자 응답·문서·게임 내 대사는 자연스러운 **한국어**(사용자에게는 존댓말)로 작성하며, `// TODO`, `...생략...`, 1~2줄 임시 플레이스홀더를 절대 남기지 않습니다.
7. **Git 정책:**
   - 사용자가 명시적으로 요청하기 전까지 `git commit` 또는 `git push`를 실행하거나 먼저 제안하지 않습니다.

---

## 3. 필수 작업 종료 규칙 (Auto-Handoff Rule)
모든 AI 에이전트는 기능 구현, 리팩토링, 버그 수정, 에셋 교체 작업을 마친 뒤 사용자에게 최종 보고하기 전에 **반드시** 아래 절차를 수행해야 합니다:
1. 관련 검증 실행 (`npm run typecheck`, `npm test`, 필요 시 `npm run validate:assets`, `npm run validate:scripts`, `npm run build:web`).
2. 루트 `HANDOFF.md`의 **현재 프로젝트 스냅샷, 마일스톤 체크리스트, 진행 중 작업/이슈, 다음 작업 우선순위, 핵심 결정 로그**를 실제 코드 상태에 맞게 최신화.
3. 터미널에서 `npm run ai:handoff`를 실행해 웹 채팅 AI 첨부용 합본 **`AI_BUNDLE.md`**를 최신 상태로 재생성.
