import type { UnifiedInputManager } from '../../input/inputManager';
import type { PlatformBridge } from '../../platform/platformBridge';
import type { SaveStorageAdapter } from '../../platform/storage/storageAdapter';
import { CanvasRenderer } from '../../render/canvasRenderer';
import { createCrewCampModalElement } from '../modals/crewCampModal';
import { createOnlineLobbyModalElement } from '../modals/onlineLobbyModal';
import { createSaveManagerModalElement } from '../modals/saveManagerModal';
import {
  createMobileVirtualControllerDockElement,
  createSettingsModalElement
} from '../modals/settingsModal';
import type { BattleSpeedScale } from './battleSpeedControl';
import { injectSceneManagerStyles } from './sceneDomStyles';

export interface SceneDomShellParams {
  rootEl: HTMLElement;
  storage: SaveStorageAdapter;
  input: UnifiedInputManager;
  platformBridge: PlatformBridge;
  initialBattleSpeed?: BattleSpeedScale;
  isRpgActive: () => boolean;
  onRpgInteract: () => void;
  onCoupDeBurst: () => void;
}

export interface BuiltSceneDomShell {
  topBar: HTMLElement;
  canvasWrapper: HTMLElement;
  renderer: CanvasRenderer;
  sideDrawerEl: HTMLElement;
  showcaseBarEl: HTMLElement;
  mobileDockEl: HTMLElement;
  networkBadgeEl: HTMLElement;
  hudToggleBtnEl: HTMLButtonElement;
  campModalEl: HTMLElement;
  saveModalEl: HTMLElement;
  onlineModalEl: HTMLElement;
  settingsModalEl: HTMLElement;
  endgameModalEl: HTMLElement;
  viewportListenerCleanup: () => void;
}

export function buildSceneDomShell(params: SceneDomShellParams): BuiltSceneDomShell {
  const { rootEl, storage, input, platformBridge } = params;
  rootEl.innerHTML = '';
  injectSceneManagerStyles(document);

  const topBar = document.createElement('header');
  topBar.className = 'top-bar';
  topBar.innerHTML = `
    <div class="top-bar-group">
      <span class="brand-title">🏴‍☠️ 원피스 그랜드 보야지</span>
      <button id="tab-rpg" class="btn-tab-active">⚓ 모험 계속</button>
      <button id="btn-camp-menu" style="background:#0f766e;border-color:#2dd4bf;color:#f0fdf4;">🏕 동료 & 수련</button>
      <button id="tab-endgame" style="background:#713f12;border-color:#facc15;color:#fef08a;">🏆 도전 모드</button>
      <button id="tab-online" style="background:#581c87;border-color:#c084fc;">🌐 통신 대전</button>
      <button id="btn-save-menu">💾 저장 / 불러오기</button>
      <button id="btn-toggle-journal">📜 항해 일지</button>
      <button id="btn-settings">⚙ 설정</button>
      <button id="btn-visual-polish" style="background:#312e81;border-color:#818cf8;color:#e0e7ff;">✨ 비주얼 튜닝</button>
      <button id="btn-return-title" style="background:#334155;border-color:#94a3b8;color:#f8fafc;">🏠 타이틀</button>
    </div>
    <div class="top-bar-group">
      <span id="net-status-badge" class="net-badge">🟢 온라인</span>
      <button id="btn-toggle-devtools" class="btn-showcase" title="스토리 스킵 및 개발자 테스트 도구 열기">🛠 개발자 도구</button>
    </div>
    <div id="dev-tools-bar-row" class="top-bar-group" style="display:none;width:100%;padding-top:6px;margin-top:4px;border-top:1px dashed #334155;justify-content:space-between;">
      <div class="top-bar-group">
        <label style="color:#fde047;font-size:11px;">⚡ 스토리 빠른 이동:
          <select id="sel-debug-jump" aria-label="스토리 점프">
            <option value="">-- 해역 / 에피소드 즉시 이동 --</option>
            <option value="sea_east_blue">1. [이스트 블루] 자유 항해</option>
            <option value="dock_foosha">2. [이스트 블루 1/5] 후샤 마을 & 쉘즈타운 (도끼손 모건)</option>
            <option value="dock_orange_town">2-2. [이스트 블루 2/5] 오렌지 마을 (버기 · 참격 면역)</option>
            <option value="dock_baratie">2-3. [이스트 블루 3/5] 발라티에 (돈 클리크 · 상디·우솝 합류)</option>
            <option value="dock_arlong_park">2-4. [이스트 블루 4/5] 아론 파크 (아론 수변전 · 나미 합류)</option>
            <option value="dock_loguetown">2-5. [이스트 블루 5/5] 로그타운 (스모커 45초 생존 탈출)</option>
            <option value="gate_reverse_mountain">3. [관문 검증] 리버스 마운틴 통과 시도 (5개 섬 검증)</option>
            <option value="sea_grand_line">4. [위대한 항로] 이스트 블루 5개 완료 + 진입</option>
            <option value="dock_drum_kingdom">4-1. [위대한 항로 1/6] 드럼 왕국 (와포루 · 쵸파 선의 합류)</option>
            <option value="dock_alabasta">4-2. [위대한 항로 2/6] 알라바스타 (크로커다일 물통 젖음 · 로빈 합류)</option>
            <option value="dock_skypiea">4-3. [위대한 항로 3/6] 하늘섬 스카이피아 (갓 에넬 · 고무 천적)</option>
            <option value="dock_water_seven">4-4. [위대한 항로 4/6] 워터 세븐 (블루노·카쿠·루치 & 프랑키)</option>
            <option value="dock_thriller_bark">4-5. [위대한 항로 5/6] 스릴러 바크 (모리아 분신 · 브룩 음악가)</option>
            <option value="dock_marineford">4-6. [위대한 항로 6/6] 마린포드 정상전쟁 (마르코 2:2 동맹 3연전)</option>
            <option value="gate_red_line_blocked">5. [관문 차단 검증] 위대한 항로 미완료 시 신세계 6섬 체크리스트 팝업</option>
            <option value="sea_new_world">7. [신세계] 위대한 항로 6개 완료 + 레드라인 돌파</option>
            <option value="dock_fishman_island">7-1. [신세계 1/6] 어인섬 (호디 폭주 · 징베 조타수 합류)</option>
            <option value="dock_dressrosa">7-2. [신세계 2/6] 드레스로자 (도플라밍고 새장 · 실 각성)</option>
            <option value="dock_totto_land">7-3. [신세계 3/6] 토트랜드 (카타쿠리 미래 예지 · 로드 포네그리프)</option>
            <option value="dock_wano">8. [신세계 4/6] 와노쿠니 오니가시마 (킹·카이도 & 기어5)</option>
            <option value="dock_egghead">9. [신세계 5/6] 미래섬 에그헤드 (S-호크·키자루·새턴 성)</option>
            <option value="dock_elbaf">10. [신세계 6/6] 거인족의 나라 엘바프 (거대 보스: 로키)</option>
            <option value="clear_current_island">★ 현재 입항한 섬 에피소드 즉시 완료</option>
            <option value="open_asset_preview">🎨 [Dev] AssetPreviewScene (스프라이트·타일셋·오디오)</option>
          </select>
        </label>
      </div>
      <div class="top-bar-group">
        <button id="tab-sandbox" class="btn-showcase">⚔ 배틀 샌드박스</button>
        <button id="btn-asset-preview" class="btn-showcase">🎨 도트 에셋 프리뷰</button>
      </div>
    </div>
  `;

  const hudToggleBtnEl = document.createElement('button');
  hudToggleBtnEl.id = 'btn-toggle-hud-drawer';
  hudToggleBtnEl.className = 'hud-drawer-toggle-btn';
  hudToggleBtnEl.textContent = '☰ 메뉴';
  rootEl.appendChild(hudToggleBtnEl);
  rootEl.appendChild(topBar);

  const networkBadgeEl = topBar.querySelector('#net-status-badge') as HTMLElement;

  if (storage.isFallbackActive) {
    const warnBar = document.createElement('div');
    warnBar.style.cssText =
      'background:#78350f;color:#fde047;padding:4px 12px;font-size:11px;text-align:center;';
    warnBar.textContent =
      '⚠ 브라우저 IndexedDB 접근이 제한되어 localStorage 폴백 모드로 동작 중입니다. JSON 내보내기(Export) 백업을 권장합니다.';
    rootEl.appendChild(warnBar);
  }

  const main = document.createElement('main');
  main.className = 'workspace-main';
  const stageCol = document.createElement('div');
  stageCol.className = 'canvas-stage-col';
  const canvasWrapper = document.createElement('div');
  canvasWrapper.className = 'canvas-wrapper';

  const renderer = new CanvasRenderer(canvasWrapper);
  input.updateViewportMetrics(renderer.getMetrics());
  const viewportUnsubscribe = renderer.viewport.onChange((m) => {
    input.updateViewportMetrics(m);
  });
  if (typeof window !== 'undefined') {
    (window as unknown as { __OPGV_VIEWPORT__?: unknown }).__OPGV_VIEWPORT__ =
      renderer.viewport;
  }
  stageCol.appendChild(canvasWrapper);

  const showcaseBarEl = document.createElement('div');
  showcaseBarEl.className = 'showcase-bar';
  stageCol.appendChild(showcaseBarEl);

  const mobileDockEl = createMobileVirtualControllerDockElement(
    input,
    params.isRpgActive,
    params.onRpgInteract,
    params.onCoupDeBurst
  );
  stageCol.appendChild(mobileDockEl);

  main.appendChild(stageCol);
  const sideDrawerEl = document.createElement('aside');
  sideDrawerEl.className = 'side-drawer';
  main.appendChild(sideDrawerEl);
  rootEl.appendChild(main);

  const iosBanner = document.createElement('div');
  iosBanner.className = 'ios-install-banner';
  iosBanner.id = 'ios-pwa-banner';
  iosBanner.innerHTML = `
    <span>📲 Safari 공유 버튼 → [홈 화면에 추가]를 선택하면 전체화면 오프라인 앱으로 플레이할 수 있습니다.</span>
    <button id="btn-close-ios-banner">닫기</button>
  `;
  rootEl.appendChild(iosBanner);
  iosBanner
    .querySelector('#btn-close-ios-banner')
    ?.addEventListener('click', () => {
      iosBanner.style.display = 'none';
    });

  const campModalEl = createCrewCampModalElement();
  rootEl.appendChild(campModalEl);
  const saveModalEl = createSaveManagerModalElement();
  rootEl.appendChild(saveModalEl);
  const onlineModalEl = createOnlineLobbyModalElement();
  rootEl.appendChild(onlineModalEl);
  const settingsModalEl = createSettingsModalElement(
    input,
    platformBridge,
    params.initialBattleSpeed
  );
  rootEl.appendChild(settingsModalEl);

  const endgameModalEl = document.createElement('div');
  endgameModalEl.className = 'modal-backdrop';
  endgameModalEl.id = 'endgame-modal';
  rootEl.appendChild(endgameModalEl);

  return {
    topBar,
    canvasWrapper,
    renderer,
    sideDrawerEl,
    showcaseBarEl,
    mobileDockEl,
    networkBadgeEl,
    hudToggleBtnEl,
    campModalEl,
    saveModalEl,
    onlineModalEl,
    settingsModalEl,
    endgameModalEl,
    viewportListenerCleanup: viewportUnsubscribe
  };
}
