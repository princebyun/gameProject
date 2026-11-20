# HANDOFF.md — 원피스 2D 실시간 액션 에피소드 RPG 작업 인수인계서

> **다른 AI가 이 파일을 읽었을 때:** 먼저 `AGENTS.md`의 불변 규칙을 확인한 뒤, 아래 현재 스냅샷과 '다음 작업 우선순위'부터 바로 이어서 진행해 주세요.

## 1. 현재 프로젝트 스냅샷
- **최종 갱신일:** 2026-11-20
- **목표 플랫폼:** PC (Windows `.exe` / Electron), Android (`.apk` / Capacitor — **갤럭시 S25 울트라 19.5:9 최우선 기준**), Web/iOS PWA
- **게임 방향성:** 반다이 콘솔 RPG풍 스토리 도입부(타이틀·오프닝 나레이션·대화 연출) + GTA / 포켓몬 레조넌스식 **메인 에피소드 마커 & 오픈월드 자유 항해·탐험 루프**
- **기술 스택:** TypeScript 5.6, Vite 5.4 (`vite-plugin-pwa`), HTML5 Canvas 2D, IndexedDB (`SaveMigrator` + `LegalityValidator`), WebSocket (`ws`, 결정론 Lockstep), Capacitor 8, Electron 45, Vitest 2
- **현재 버전:** `BATTLE_CALC_VERSION = "0.7.0"`, `saveVersion = 5`
- **콘텐츠 현황:** 등록 유닛 `44`종 / 변신 폼 `31`종 / 해역 `3`개 · 에피소드 섬 `17`개 / 합동기 `9`종(전용 8 + 범용 1) / 대사 스크립트 JSON `20`개 파일(66 컷신 367줄, 블루 마커 선상 대화 8종, 전투 중 대사 64트리거) / BGM `10`트랙 · SFX `22`종
- **도트 에셋 교체 현황:**
  - `raw_assets/` 원본: `luffy_base.png`, `luffy_base_attack_melee.png`, `portrait_luffy_sheet.png`
  - `EXTERNAL_PNG` 스프라이트 적용 완료: `1`종 (`luffy_base` → `public/assets/sprites/luffy_base.png` + `.meta.json`) / 미교체 `FALLBACK`: `97`종 (총 `98`개 시트)
  - `EXTERNAL_PNG` 64×64 초상화 적용 완료: `8`종 (`luffy_normal`, `luffy_angry`, `luffy_determined`, `luffy_shocked`, `luffy_smirk`, `luffy_sad`, `luffy_excited`, `luffy_battle_cry`)
  - 썸네일 추출 현황: `exported_thumbnails/contact_sheet.png` 및 `prompt_pack.md` 생성 완료

---

## 2. 마일스톤 진행 체크리스트 (실제 코드 기준 자동 동기화)
- [x] **Phase 1~4 기반 엔진:** 60Hz 결정론 실시간 전투, 기술 맞대결(광선/근접), 패기 3종, 열매 변신·각성(구름 띠), 방 코드 Lockstep 통신 대전, IndexedDB 세이브·안티치트, 크로스플랫폼 패키징
- [x] **1번 표 — 핵심 5개 섬 보스전 완전판 (`v0.2.0`):** 쉘즈타운(모건), 워터 세븐(블루노·카쿠 + 동료 프랑키 조선공), 와노쿠니(킹), 에그헤드(S-호크·새턴 성), 엘바프(로키) / 훅: `lunarianFlame`, `superRegeneration`, `entityScale`, `aiBehaviorId`
- [x] **2-A단계 — 이스트 블루 완전판 (`v0.3.0`, `save v2`):** 오렌지 마을(버기 참격 면역), 발라티에(돈 클리크 + 상디 요리사·우솝), 아론 파크(아론 수변 지형 + 나미 항해사), 로그타운(스모커 45초 생존 탈출 `SURVIVE_TIME`), 리버스 마운틴 5개 필수 섬 관문 연동
- [x] **2-B단계 — 위대한 항로 완전판 (`v0.4.0`, `save v3`):** 드럼 왕국(와포루 + 쵸파 선의), 알라바스타(크로커다일 물/젖음 약점 + 로빈 고고학자), 하늘섬(에넬 고무 천적), 스릴러 바크(모리아 분신 + 브룩 음악가), 마린포드(아오키지·아카이누 환경 각성·검은 수염 능력 봉인 + 마르코 부활 동맹 3연전), 레드라인 6개 필수 섬 관문 연동
- [x] **2-C단계 — 신세계 중간 해역 확장 (`v0.5.0`, `save v4`):** 어인섬(호디 존스 폭주 + 징베 조타수, 밀짚모자 10인 전원 완성), 드레스로자(도플라밍고 새장 `shrinkingArena`), 토트랜드(카타쿠리 미래 예지 `futureSightCounter` + 로드 포네그리프) → 3대 해역 총 17개 에피소드 섬 완성
- [x] **엔드게임 3종 (`v0.6.0`, `save v5`):** 임펠 다운 6층 로그라이트 서바이벌(마젤란 + 3택 유물 + 중단 저장), 코리다 콜로세움 8강 토너먼트(CP·기술 전수 교관·수배서 프레임), 오로성·사황 거대 보스 협동 레이드(오프라인 1P+AI 2인 / 온라인 2~3인, 브레이크 게이지, 예고선, 팀 부활 3회)
- [x] **갤럭시 S25 울트라 화면 & 스토리 자유도 개편:** 고정 세로 `540px` + 동적 가로(`960~1260px`, S25 울트라 약 `1170x540`), Android 15 Edge-to-Edge & `shortEdges`, Safe Area 터치 컨트롤러 / `BootScene → TitleScene → OpeningNarrationScene(4장) → 후샤 마을 도보 시작 → FREE_ROAM ↔ STORY_MISSION` + 골드(메인)·블루(서브)·실버(활동) 마커 + `MissionTrackerHUD`
- [x] **17개 섬 스토리 대사 & 연출 확장:** 컷신 DSL(표정 7종, 셰이크, 플래시 접근성 대응, 동료 합류 배너), 비차단 전투 중 대사(`BattleBanterOverlay`), 17개 섬 한국어 대사 JSON + 블루 마커 선상 대화 + `회상 극장(Story Theater)` + `npm run validate:scripts`
- [x] **도트 그래픽·레트로 오디오 파이프라인:** `SmartSpriteSheetLoader`(외부 PNG 핫스왑·크로마키·디프린지·미보유 동작 `IDLE` PNG 기반 보행/공격 폴백), 2.5등신 도트 렌더러 & 64×64 초상화, 다층 VFX·2.5D 타일셋·9-Slice 해적 UI, `RetroAudioEngine`(외부 `.ogg` + Web Audio 4채널 칩튠 폴백)
- [x] **에셋 제작·고도화 자동화 도구:** `npm run pixelize:sprite`, `npm run export:thumbnails`(`exported_thumbnails/contact_sheet.png`, `prompt_pack.md`), `npm run sync:sprites`, `npm run upgrade:sprites`(루피 화풍 기준 반자동 고도화), `AssetPreviewScene` 슬라이서
- [x] **전투 손맛 고도화 (`v0.7.0`):** 무장색 저스트 가드(패링 — 10틱 창, 근접 경직 1.4초, 투사체 반사), 2:2 동료 조합 합동기(유대 게이지 100, 전용 8종 + 범용 1종, 대기 동료 도트 난입), 풀와이드 고속 픽셀 컷인(`PixelCutinOverlay`, 39틱 동기화 정지), `ParticlePool`(300슬롯), 신규 레트로 SFX 4종(`parry_clang`, `projectile_reflect`, `cutin_whoosh`, `bond_combo_burst`)
- [ ] **전 캐릭터 루피 화풍 도트 에셋 일괄 교체 (`1/98` 완료):** `luffy_base` + 루피 초상화 8종 외 나머지 `97`종 스프라이트·초상화의 `EXTERNAL_PNG` 교체
- [ ] **실기/브라우저 최종 검수 & 배포 패키징:** Chrome 원격 디버깅 E2E 재검증, Android `.apk`(갤럭시 S25 울트라 실기) & Windows `.exe` 최종 패키징 점검

---

## 3. 현재 진행 중 작업 & 알려진 이슈
- **진행 중:**
  - `v0.7.0` 무장색 패링·2:2 합동기·픽셀 컷인·300-슬롯 파티클 풀링 및 공용 AI 인수인계 체계(`AGENTS.md`, `HANDOFF.md`, `CLAUDE.md`, `npm run ai:handoff`) 구축 완료 (Vitest 27개 파일 / 121개 테스트, `validate:assets`, `validate:scripts`, `build:web`, `build:android` 전원 통과).
  - 도트 에셋은 `luffy_base` 1종 + 루피 초상화 8종 적용 완료 상태이며, `exported_thumbnails/` 썸네일/비교 시트 추출 완료 후 나머지 97종(우선순위: `zoro_base`, `nami_base`, `sanji_base`, `buggy_base`, `arlong_base`)의 루피 화풍 통일 교체 대기 중.
- **알려진 이슈 / 주의점:**
  - **내장 브라우저 MCP 연결:** 현재 로컬 환경에서 `C:\Users\plani\AppData\Local\Google\Chrome\User Data\DevToolsActivePort` 미생성으로 Chrome DevTools MCP가 차단된 상태입니다. Chrome에서 `chrome://inspect/#remote-debugging` 활성화 후 실화면 E2E를 재실행해야 합니다.
  - Android APK 테스트 시 갤럭시 S25 울트라(`19.5:9`)에서 펀치홀 가림·터치 버튼(`GUARD`, `BOND_COMBO` 포함 9개) 위치·레터박스 여부를 매 빌드마다 실기 또는 `915x412` 뷰포트에서 반드시 재확인할 것.
  - 외부 도트 PNG가 1장(`IDLE`)만 등록된 캐릭터라도 이동·공격 시 기존 프로시저럴 도형으로 되돌아가지 않도록 유지할 것.

---

## 4. 다음 작업 우선순위 (Next Steps)
1. **1순위:** `exported_thumbnails/prompt_pack.md` 및 루피(`public/assets/sprites/luffy_base.png`) 마스터 화풍을 기준으로 초반 핵심 동료·보스(`zoro_base`, `nami_base`, `sanji_base`, `buggy_base`, `arlong_base` 등 97종) 외부 도트/초상화 PNG를 `raw_assets/`에 추가하고 `npm run sync:sprites` 또는 `npm run upgrade:sprites`로 일괄 반영
2. **2순위:** Chrome 원격 디버깅(`chrome://inspect/#remote-debugging`) 활성화 후 `http://localhost:5173/`에서 `1280×720` 및 `915×412`(갤럭시 S25 울트라) 실화면 E2E 검증 수행 및 S25 울트라 터치 패링 타이밍(`10~14틱`) 체감 미세 튜닝
3. **3순위:** 최종 Android `.apk`(`npm run package:android:apk`) / Windows `.exe`(`npm run package:win`) 빌드 및 갤럭시 S25 울트라 실기 동작·에셋 누락 최종 점검 (필요 시 `public/assets/audio/` 외부 `.ogg` BGM/SFX 교체)

---

## 5. 핵심 아키텍처·기획 결정 로그 (최근 10건 유지)
1. **에피소드 보스 우선 확장 전략:** 로스터를 무작위로 늘리지 않고, Phase 2 핵심 5개 섬 보스(1번 표)를 먼저 채운 뒤 이스트 블루(2-A) → 위대한 항로(2-B) → 신세계(2-C) 순으로 해역별 완성.
2. **갤럭시 S25 울트라 대응 해상도 방식:** 16:9 고정 캔버스 대신 세로 `540px` 고정 + 가로 `960~1260px` 동적 확장으로 레터박스를 제거하되, `src/core/` 전투 물리 아레나는 `960x540` 결정론을 유지하고 좌우 여백만 배경 연장.
3. **반다이 RPG 도입부 + GTA/레조넌스식 자유도 채택:** 앱 실행 시 바다 항해 직행을 폐기하고 `타이틀 → 오프닝 나레이션 4장 → 후샤 마을 도보 시작` 후 골드 마커(메인)·블루 마커(서브)로 자유 탐색과 스토리를 병행.
4. **원작풍 도트 그래픽 전환 방식:** 프로시저럴 도형의 한계를 인정하고, 외부 도트 PNG 핫스왑(`SmartSpriteSheetLoader`) + 크로마키/디프린지 + 루트 `raw_assets/` 변환 파이프라인으로 전환.
5. **화풍 통일 기준:** `raw_assets/`에 우선 투입한 루피(`luffy_base`)를 마스터 화풍 레퍼런스로 삼아, 추출된 타 캐릭터 썸네일을 2.5등신 GBA/NDS 픽셀 아트(1px 어두운 외곽선, 3단계 셀 채색)로 통일 고도화.
6. **번들 용량 분리:** 고화질 원본 `raw_assets/`와 추출물 `exported_thumbnails/`는 프로젝트 루트에 두고 최종 웹/APK 빌드에서 제외하며, `public/assets/`의 정규화 리소스만 PWA 런타임 캐싱.
7. **접근성 및 세이브 호환성:** `flashEffect === false`일 때 화면 번쩍임·임팩트 프레임·컷인 섬광을 모두 자동 차단하며, 신규 해역·엔드게임 추가 시 기존 세이브가 `LegalityValidator` 오탐에 걸리지 않도록 `SaveMigrator` 호환 플래그 유지.
8. **v0.7.0 결정론 컷인 프리즈 & Lockstep 동기화:** 각성·2:2 합동기·보스 2페이즈·레이드 대기술 컷인을 시뮬레이션 코어 내부의 고정 `39틱(0.65초)` 프리즈로 통합해, 로컬 UI 컷인 설정(`ON/ONCE/OFF`)과 무관하게 온라인 `stateHash` 100% 일치를 보장.
9. **공용 AI 기억 체계:** AI 모델 한도 소진 시 타 AI로 즉시 이어받을 수 있도록 `AGENTS.md`(고정 규칙) + `HANDOFF.md`(실시간 현황) + `CLAUDE.md`(진입 링크) + `AI_BUNDLE.md`(웹 채팅 첨부용 자동 합본)로 분리 관리.
