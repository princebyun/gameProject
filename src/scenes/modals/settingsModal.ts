import type { UnifiedInputManager } from '../../input/inputManager';
import type { PlatformBridge } from '../../platform/platformBridge';
import {
  DEFAULT_BATTLE_SPEED_SCALE,
  type BattleSpeedScale
} from '../controllers/battleSpeedControl';

export function createMobileVirtualControllerDockElement(
  input: UnifiedInputManager,
  isRpgScene: () => boolean,
  onRpgInteract: () => void,
  onCoupDeBurst: () => void
): HTMLElement {
  const dock = document.createElement('div');
  dock.className = 'mobile-gamepad-dock';
  dock.id = 'mobile-virtual-controller';
  dock.innerHTML = `
    <div class="dpad-grid" aria-label="가상 방향키">
      <div></div>
      <button class="dpad-btn" data-dir="UP">▲</button>
      <div></div>
      <button class="dpad-btn" data-dir="LEFT">◀</button>
      <div class="dpad-btn" style="font-size:10px;color:#38bdf8;">MOVE</div>
      <button class="dpad-btn" data-dir="RIGHT">▶</button>
      <div></div>
      <button class="dpad-btn" data-dir="DOWN">▼</button>
      <div></div>
    </div>
    <div class="action-pad-grid" aria-label="가상 액션 버튼">
      <button class="act-btn" data-act="SKILL_0" style="border-color:#38bdf8;">S1/입항<span>ACT1</span></button>
      <button class="act-btn" data-act="SKILL_1" style="border-color:#38bdf8;">S2/쿠드<span>ACT2</span></button>
      <button class="act-btn" data-act="FORM_SHIFT" style="border-color:#f59e0b;color:#fbbf24;">변신/각성<span>FORM</span></button>
      <button class="act-btn" data-act="SKILL_2" style="border-color:#38bdf8;">S3<span>스킬3</span></button>
      <button class="act-btn" data-act="SKILL_3" style="border-color:#38bdf8;">S4<span>스킬4</span></button>
      <button class="act-btn" data-act="DODGE" style="border-color:#2dd4bf;color:#2dd4bf;">회피/상호<span>DODGE</span></button>
    </div>
  `;

  const setDir = (dir: string | null) => {
    if (dir === 'UP') input.virtualMoveVec = { x: 0, y: -1 };
    else if (dir === 'DOWN') input.virtualMoveVec = { x: 0, y: 1 };
    else if (dir === 'LEFT') input.virtualMoveVec = { x: -1, y: 0 };
    else if (dir === 'RIGHT') input.virtualMoveVec = { x: 1, y: 0 };
    else input.virtualMoveVec = { x: 0, y: 0 };
  };

  dock.querySelectorAll<HTMLButtonElement>('[data-dir]').forEach((btn) => {
    const dir = btn.dataset.dir ?? null;
    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      setDir(dir);
    });
    btn.addEventListener('pointerup', () => setDir(null));
    btn.addEventListener('pointerleave', () => setDir(null));
  });

  dock.querySelectorAll<HTMLButtonElement>('[data-act]').forEach((btn) => {
    const act = btn.dataset.act as
      | 'SKILL_0'
      | 'SKILL_1'
      | 'SKILL_2'
      | 'SKILL_3'
      | 'DODGE'
      | 'FORM_SHIFT';
    btn.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      if (isRpgScene()) {
        if (act === 'SKILL_0' || act === 'DODGE') {
          onRpgInteract();
        } else if (act === 'SKILL_1') {
          onCoupDeBurst();
        }
      } else {
        input.triggerVirtualAction(act);
      }
    });
  });

  return dock;
}

export function createSettingsModalElement(
  input: UnifiedInputManager,
  platformBridge: PlatformBridge,
  initialBattleSpeed: BattleSpeedScale = DEFAULT_BATTLE_SPEED_SCALE
): HTMLElement {
  const modal = document.createElement('div');
  modal.className = 'modal-backdrop';
  modal.id = 'settings-modal';
  const b = input.getBindings();

  modal.innerHTML = `
    <div class="modal-box" role="dialog" aria-label="접근성 및 조작 설정">
      <h3 style="color:#38bdf8;font-size:15px;">⚙ 접근성, 화면 모드 및 키 바인딩 설정 (${platformBridge.runtimeTarget.toUpperCase()})</h3>
      <div class="field-row">
        <label for="sel-battle-speed">전투 진행 속도 (단축키 [ / ] · P 일시정지):</label>
        <select id="sel-battle-speed">
          <option value="0.5" ${initialBattleSpeed === 0.5 ? 'selected' : ''}>0.5x 매우 느림 (전략/조작 집중)</option>
          <option value="0.75" ${initialBattleSpeed === 0.75 ? 'selected' : ''}>0.75x 여유롭게 (권장 기본값)</option>
          <option value="1" ${initialBattleSpeed === 1 ? 'selected' : ''}>1.0x 표준 속도 (원래 속도)</option>
          <option value="1.25" ${initialBattleSpeed === 1.25 ? 'selected' : ''}>1.25x 빠름</option>
        </select>
      </div>
      <div class="field-row">
        <label for="sel-window-mode">화면 표시 모드 (F11 / Alt+Enter):</label>
        <select id="sel-window-mode">
          <option value="windowed">창 모드 (Windowed)</option>
          <option value="fullscreen">전체화면 (Fullscreen)</option>
          <option value="borderless">테두리 없는 창 (Borderless Window)</option>
        </select>
      </div>
      <div class="field-row">
        <label for="chk-haptics">패기 상쇄/완벽 회피/각성 진동 피드백 (Haptics):</label>
        <input type="checkbox" id="chk-haptics" checked />
      </div>
      <div class="field-row">
        <label for="sel-graphics-quality">그래픽 셰이더 품질 (PixiJS WebGL2):</label>
        <select id="sel-graphics-quality">
          <option value="HIGH" selected>고품질 (동적 광원·블룸·수면 반사)</option>
          <option value="MEDIUM">표준 (모바일 균형)</option>
          <option value="LOW">절전 (고프레임 경량 모드)</option>
        </select>
      </div>
      <div class="field-row">
        <label for="chk-flash">화면 번쩍임 효과 (Flash Effect):</label>
        <input type="checkbox" id="chk-flash" checked />
      </div>
      <div class="field-row">
        <label for="rng-shake">카메라 흔들림 강도 (0~100%):</label>
        <input type="range" id="rng-shake" min="0" max="100" value="80" />
      </div>
      <div class="field-row">
        <label for="rng-bgm-vol">BGM 음량 (0~100%):</label>
        <input type="range" id="rng-bgm-vol" min="0" max="100" value="70" />
      </div>
      <div class="field-row">
        <label for="rng-sfx-vol">효과음(SFX) 음량 (0~100%):</label>
        <input type="range" id="rng-sfx-vol" min="0" max="100" value="80" />
      </div>
      <div class="field-row">
        <label for="chk-mute">오디오 음소거 (Mute Audio):</label>
        <input type="checkbox" id="chk-mute" />
      </div>
      <div class="field-row">
        <label for="chk-touch-ui">캔버스 가상 터치 UI 상시 표시:</label>
        <input type="checkbox" id="chk-touch-ui" />
      </div>
      <div class="field-row">
        <label for="sel-touch-size">터치 버튼 크기 (6.9인치 엄지 최적화):</label>
        <select id="sel-touch-size">
          <option value="SMALL" ${input.getTouchPrefs().sizePreset === 'SMALL' ? 'selected' : ''}>소 (85%)</option>
          <option value="MEDIUM" ${input.getTouchPrefs().sizePreset === 'MEDIUM' ? 'selected' : ''}>중 (100% 권장)</option>
          <option value="LARGE" ${input.getTouchPrefs().sizePreset === 'LARGE' ? 'selected' : ''}>대 (120%)</option>
        </select>
      </div>
      <div class="field-row">
        <label for="rng-touch-opacity">터치 버튼 투명도 (35~100%):</label>
        <input type="range" id="rng-touch-opacity" min="35" max="100" value="${Math.round(input.getTouchPrefs().opacity * 100)}" />
      </div>
      <hr style="border-color:#1e293b;" />
      <div class="field-row">
        <label>회피 키 (Dodge):</label>
        <input type="text" id="bind-dodge" value="${b.dodge}" style="width:110px;" />
      </div>
      <div class="field-row">
        <label>변신/각성 키 (Form Shift):</label>
        <input type="text" id="bind-form" value="${b.formShift}" style="width:110px;" />
      </div>
      <div style="display:flex;justify-content:space-between;gap:8px;margin-top:6px;">
        <button id="btn-quit-game" class="btn-danger">🚪 게임 종료 (Exit)</button>
        <div style="display:flex;gap:8px;">
          <button id="btn-reset-binds">초기화</button>
          <button id="btn-close-settings" class="btn-tab-active">닫기</button>
        </div>
      </div>
    </div>
  `;
  return modal;
}
