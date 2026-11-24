import type { MusouActionType } from '../../core/battle/musou/MusouTypes';
import type { MusouDebugSnapshot } from '../controllers/threeMusouController';
import type { Disposable } from '../../core/types/disposable';
import type {
  RenderQualityPreset,
  TimeOfDayPreset,
  VisualPolishConfig
} from '../../render/backend/renderBackend';
import type { WeaponTunerSlotKey } from '../../data/assets/weapons3dRegistry';
import type { PixiStageHost } from '../../render/pixi/PixiStageHost';
import type { ThreeStageHost } from '../../render/three/ThreeStageHost';
import type {
  ThreeInspectorSnapshot,
  ThreeWeaponTunerSnapshot
} from '../../render/three/ThreeMusouBattleScene';
import type { ThreeToonTuningConfig } from '../../render/three/threeTypes';
import { STORY_CHAPTERS_LIST } from '../../data/story/storyChaptersRegistry';

export interface ThreeCharacterInspectorBridge {
  getInspectorSnapshot(): ThreeInspectorSnapshot;
  selectInspectorClip(clipName: string): boolean;
  setInspectorPaused(paused: boolean): void;
  setInspectorForwardFlipped(flipped: boolean): void;
  setInspectorRootMotionLock(locked: boolean): void;
  setInspectorSocketGuides(visible: boolean): void;
  setInspectorScaleMultiplier(mult: number): void;
  exportInspectorAnimJson(): string;
}

export interface ThreeWeaponTunerBridge {
  getWeaponTunerSnapshot(): ThreeWeaponTunerSnapshot;
  setWeaponTunerCharacter(loadoutId: string): void;
  setWeaponTunerSlot(slotKey: WeaponTunerSlotKey): void;
  updateWeaponSlotTransform(partial: {
    posX?: number;
    posY?: number;
    posZ?: number;
    rotX?: number;
    rotY?: number;
    rotZ?: number;
    scale?: number;
  }): void;
  updateWeaponTrailLengths(baseY: number, tipY: number): void;
  setWeaponHolsterSwap(enabled: boolean): void;
  triggerWeaponTestSwing(): void;
  triggerHitSparkTest(): void;
  exportWeapons3dJson(): string;
}

export interface ThreeMusouPresetBridge {
  getMusouDebugSnapshot(): MusouDebugSnapshot;
  setMusouActionTypeOverride(actionType: MusouActionType | null): void;
  fillMusouBurst(activateNow?: boolean): void;
  setMusouInfiniteStamina(enabled: boolean): void;
  setBossArmorToTenPercent(): void;
  respawnHorde100(): void;
}

export interface ThreeStoryJumpBridge {
  jumpToStoryCutscene(chapterId: string): void;
  jumpToStoryBattle(chapterId: string): void;
  openStoryCodex(): void;
}

export interface VisualPolishDrawerCallbacks {
  onConfigChanged?: (next: VisualPolishConfig) => void;
  threeHost?: ThreeStageHost;
  onThreeTuningChanged?: (partial: Partial<ThreeToonTuningConfig>) => void;
  threeInspector?: ThreeCharacterInspectorBridge;
  threeWeaponTuner?: ThreeWeaponTunerBridge;
  threeMusouPreset?: ThreeMusouPresetBridge;
  threeStoryJump?: ThreeStoryJumpBridge;
}

const TIME_BUTTONS: readonly { value: TimeOfDayPreset; label: string }[] = [
  { value: 'MORNING', label: '🌅 아침' },
  { value: 'DAY', label: '☀ 낮' },
  { value: 'SUNSET', label: '🌇 노을' },
  { value: 'NIGHT', label: '🌙 밤' }
];

const QUALITY_OPTIONS: readonly { value: RenderQualityPreset; label: string }[] = [
  { value: 'HIGH', label: '고품질 (S25 울트라)' },
  { value: 'MEDIUM', label: '표준' },
  { value: 'LOW', label: '절전' }
];

export class VisualPolishDrawer implements Disposable {
  private readonly el: HTMLElement;
  private readonly abort = new AbortController();
  private telemetryIntervalId: number | null = null;
  private opened = false;

  constructor(
    rootEl: HTMLElement,
    private readonly host: PixiStageHost,
    private readonly callbacks: VisualPolishDrawerCallbacks = {}
  ) {
    this.el = document.createElement('aside');
    this.el.id = 'visual-polish-drawer';
    this.el.setAttribute('aria-label', '실시간 비주얼 튜닝 패널');
    this.el.style.cssText = [
      'position:fixed',
      'top:calc(env(safe-area-inset-top, 0px) + 42px)',
      'right:calc(env(safe-area-inset-right, 0px) + 10px)',
      'width:274px',
      'max-height:calc(100dvh - 84px)',
      'overflow-y:auto',
      'z-index:64',
      'display:none',
      'flex-direction:column',
      'gap:8px',
      'padding:10px',
      'border-radius:8px',
      'background:rgba(15, 23, 42, 0.94)',
      'border:1.5px solid #38bdf8',
      'color:#f8fafc',
      'font-size:11px',
      'box-shadow:0 8px 24px rgba(0, 0, 0, 0.55)',
      'touch-action:pan-y'
    ].join(';');

    this.el.innerHTML = `
      <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #334155;padding-bottom:6px;">
        <strong style="color:#fde047;font-size:12px;">✨ 비주얼 튜닝 (F9)</strong>
        <button id="vp-btn-close" type="button" style="padding:2px 6px;font-size:11px;">✕</button>
      </div>
      <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:3px;">
        <button id="vp-tab-btn-shader" type="button" style="padding:4px 2px;font-size:10px;background:#0284c7;color:#f8fafc;border:1px solid #38bdf8;border-radius:4px;font-weight:700;cursor:pointer;">🎨 셰이더</button>
        <button id="vp-tab-btn-inspector" type="button" style="padding:4px 2px;font-size:10px;background:#1e293b;color:#cbd5e1;border:1px solid #334155;border-radius:4px;cursor:pointer;">🧍 캐릭터</button>
        <button id="vp-tab-btn-weapon" type="button" style="padding:4px 2px;font-size:10px;background:#1e293b;color:#cbd5e1;border:1px solid #334155;border-radius:4px;cursor:pointer;">⚔ 무기</button>
        <button id="vp-tab-btn-musou" type="button" style="padding:4px 2px;font-size:10px;background:#1e293b;color:#cbd5e1;border:1px solid #334155;border-radius:4px;cursor:pointer;">⚡ 무쌍</button>
      </div>
      <div id="vp-tab-shader" style="display:flex;flex-direction:column;gap:8px;">
      <div>
        <div style="color:#94a3b8;margin-bottom:4px;">시간대 실시간 전환</div>
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:4px;" id="vp-time-group">
          ${TIME_BUTTONS.map(
      (b) =>
        `<button type="button" data-vp-time="${b.value}" style="padding:4px 2px;font-size:11px;">${b.label}</button>`
    ).join('')}
        </div>
      </div>
      <div>
        <div style="color:#94a3b8;margin-bottom:4px;">WebGL2 셰이더 A/B 토글</div>
        <div style="display:flex;flex-direction:column;gap:4px;">
          <label style="display:flex;justify-content:space-between;align-items:center;">
            <span>동적 2D 광원 & 그림자</span>
            <input type="checkbox" data-vp-toggle="dynamicLighting" checked />
          </label>
          <label style="display:flex;justify-content:space-between;align-items:center;">
            <span>선택적 블룸 (Bloom)</span>
            <input type="checkbox" data-vp-toggle="selectiveBloom" checked />
          </label>
          <label style="display:flex;justify-content:space-between;align-items:center;">
            <span>실시간 수면 반사 & 왜곡</span>
            <input type="checkbox" data-vp-toggle="waterReflection" checked />
          </label>
          <label style="display:flex;justify-content:space-between;align-items:center;">
            <span>갓레이 & GPU 파티클</span>
            <input type="checkbox" data-vp-toggle="godRaysAndParticles" checked />
          </label>
          <label style="display:flex;justify-content:space-between;align-items:center;">
            <span>시네마틱 색보정</span>
            <input type="checkbox" data-vp-toggle="colorGrading" checked />
          </label>
        </div>
      </div>
      <div style="display:flex;justify-content:space-between;align-items:center;gap:6px;">
        <span style="color:#94a3b8;">모바일 품질</span>
        <select id="vp-sel-quality" style="flex:1;">
          ${QUALITY_OPTIONS.map((q) => `<option value="${q.value}">${q.label}</option>`).join('')}
        </select>
      </div>
      <div id="vp-three-box" style="background:#090d16;border:1px solid #1e293b;border-radius:4px;padding:6px;display:flex;flex-direction:column;gap:4px;">
        <strong style="color:#facc15;font-size:10px;">🎨 [3D 카툰 무쌍 셰이더 튜닝]</strong>
        <label style="display:flex;justify-content:space-between;align-items:center;">
          <span>툰 음영 단계</span>
          <select id="vp-three-cel-steps">
            <option value="2">2단계</option>
            <option value="3" selected>3단계</option>
            <option value="4">4단계</option>
          </select>
        </label>
        <label style="display:flex;justify-content:space-between;align-items:center;gap:6px;">
          <span>그림자 색보정</span>
          <input id="vp-three-shadow-shift" type="range" min="0" max="1" step="0.05" value="0.42" style="width:110px;" />
        </label>
        <label style="display:flex;justify-content:space-between;align-items:center;gap:6px;">
          <span>외곽선 두께</span>
          <input id="vp-three-outline" type="range" min="0" max="0.08" step="0.004" value="0.028" style="width:110px;" />
        </label>
        <label style="display:flex;justify-content:space-between;align-items:center;gap:6px;">
          <span>림라이트</span>
          <input id="vp-three-rim" type="range" min="0" max="2" step="0.05" value="0.65" style="width:110px;" />
        </label>
        <label style="display:flex;justify-content:space-between;align-items:center;gap:6px;">
          <span>블룸 강도</span>
          <input id="vp-three-bloom" type="range" min="0" max="1.2" step="0.04" value="0.38" style="width:110px;" />
        </label>
        <label style="display:flex;justify-content:space-between;align-items:center;gap:6px;">
          <span>집중선 투명도</span>
          <input id="vp-three-speedlines" type="range" min="0" max="1" step="0.05" value="0.78" style="width:110px;" />
        </label>
        <label style="display:flex;justify-content:space-between;align-items:center;">
          <span>잡졸 군단 밀도</span>
          <select id="vp-three-horde">
            <option value="30">30명</option>
            <option value="60">60명</option>
            <option value="100" selected>100명</option>
          </select>
        </label>
      </div>
      </div>
      <div id="vp-tab-inspector" style="display:none;flex-direction:column;gap:6px;background:#090d16;border:1px solid #1e293b;border-radius:4px;padding:7px;">
        <div id="vp-insp-info" style="font-family:monospace;font-size:10px;color:#38bdf8;">3D 배틀 씬 진입 시 활성화됩니다.</div>
        <div style="display:flex;gap:4px;align-items:center;">
          <select id="vp-insp-clip" style="flex:1;">
            <option value="">(자동 전투 상태)</option>
          </select>
          <button id="vp-insp-play-pause" type="button" style="padding:3px 8px;font-size:10px;background:#1e293b;color:#fde047;border:1px solid #38bdf8;border-radius:4px;cursor:pointer;">⏸ 일시정지</button>
        </div>
        <label style="display:flex;justify-content:space-between;align-items:center;">
          <span>정면 180° 반전 (Forward Offset)</span>
          <input id="vp-insp-flip" type="checkbox" />
        </label>
        <label style="display:flex;justify-content:space-between;align-items:center;">
          <span>루트 모션 XZ 잠금</span>
          <input id="vp-insp-lock-xz" type="checkbox" checked />
        </label>
        <label style="display:flex;justify-content:space-between;align-items:center;">
          <span>본 소켓 위치 가이드 점 표시</span>
          <input id="vp-insp-guides" type="checkbox" />
        </label>
        <label style="display:flex;justify-content:space-between;align-items:center;gap:6px;">
          <span>외곽선 두께</span>
          <input id="vp-insp-outline" type="range" min="0" max="0.08" step="0.004" value="0.028" style="width:110px;" />
        </label>
        <label style="display:flex;justify-content:space-between;align-items:center;gap:6px;">
          <span>림 라이트</span>
          <input id="vp-insp-rim" type="range" min="0" max="2" step="0.05" value="0.65" style="width:110px;" />
        </label>
        <label style="display:flex;justify-content:space-between;align-items:center;gap:6px;">
          <span>신장 / 스케일 배율</span>
          <input id="vp-insp-scale" type="range" min="0.5" max="2.5" step="0.05" value="1" style="width:110px;" />
        </label>
        <button id="vp-insp-copy-json" type="button" style="padding:5px 8px;font-size:11px;background:#0369a1;color:#f8fafc;border:1px solid #38bdf8;border-radius:4px;font-weight:700;cursor:pointer;">📋 .anim.json 복사</button>
        <div id="vp-insp-copy-status" style="font-family:monospace;font-size:10px;color:#4ade80;min-height:12px;"></div>
      </div>
      <div id="vp-tab-weapon" style="display:none;flex-direction:column;gap:5px;background:#090d16;border:1px solid #1e293b;border-radius:4px;padding:7px;">
        <div id="vp-wpn-info" style="font-family:monospace;font-size:10px;color:#38bdf8;">무기 소켓 & 리본 실시간 튜너</div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;">
          <select id="vp-wpn-char">
            <option value="zoro_base">조로 (삼도류)</option>
            <option value="zoro_king_of_hell">조로 (지옥의 왕)</option>
            <option value="law_base">로 (키코쿠)</option>
            <option value="kaido_base">카이도 (팔재계)</option>
          </select>
          <select id="vp-wpn-slot">
            <option value="right">오른손</option>
            <option value="left">왼손</option>
            <option value="mouth">입</option>
            <option value="holster">허리 칼집</option>
          </select>
        </div>
        <label style="display:flex;justify-content:space-between;align-items:center;">
          <span>발도 ↔ 허리 수납 전환</span>
          <input id="vp-wpn-holster-swap" type="checkbox" checked />
        </label>
        <label style="display:flex;justify-content:space-between;align-items:center;gap:4px;">
          <span>Pos X / Y / Z</span>
          <span style="display:flex;gap:2px;">
            <input id="vp-wpn-px" type="range" min="-0.5" max="0.5" step="0.01" value="0" style="width:42px;" />
            <input id="vp-wpn-py" type="range" min="-0.5" max="0.5" step="0.01" value="0" style="width:42px;" />
            <input id="vp-wpn-pz" type="range" min="-0.5" max="0.5" step="0.01" value="0" style="width:42px;" />
          </span>
        </label>
        <label style="display:flex;justify-content:space-between;align-items:center;gap:4px;">
          <span>Rot X / Y / Z</span>
          <span style="display:flex;gap:2px;">
            <input id="vp-wpn-rx" type="range" min="-180" max="180" step="2" value="0" style="width:42px;" />
            <input id="vp-wpn-ry" type="range" min="-180" max="180" step="2" value="0" style="width:42px;" />
            <input id="vp-wpn-rz" type="range" min="-180" max="180" step="2" value="0" style="width:42px;" />
          </span>
        </label>
        <label style="display:flex;justify-content:space-between;align-items:center;gap:6px;">
          <span>무기 스케일</span>
          <input id="vp-wpn-scale" type="range" min="0.4" max="2.5" step="0.05" value="1" style="width:110px;" />
        </label>
        <label style="display:flex;justify-content:space-between;align-items:center;gap:4px;">
          <span>Trail Base / Tip</span>
          <span style="display:flex;gap:4px;">
            <input id="vp-wpn-tbase" type="range" min="0" max="1.2" step="0.02" value="0.16" style="width:54px;" />
            <input id="vp-wpn-ttip" type="range" min="0.4" max="2.8" step="0.02" value="1.18" style="width:54px;" />
          </span>
        </label>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;">
          <button id="vp-wpn-test-swing" type="button" style="padding:4px;font-size:10px;background:#1e293b;color:#fde047;border:1px solid #38bdf8;border-radius:4px;cursor:pointer;">⚔ 테스트 스윙</button>
          <button id="vp-wpn-test-spark" type="button" style="padding:4px;font-size:10px;background:#1e293b;color:#f43f5e;border:1px solid #fb7185;border-radius:4px;cursor:pointer;">💥 히트스파크</button>
        </div>
        <button id="vp-wpn-copy-json" type="button" style="padding:5px 8px;font-size:11px;background:#0369a1;color:#f8fafc;border:1px solid #38bdf8;border-radius:4px;font-weight:700;cursor:pointer;">📋 weapons_3d.json 복사</button>
        <div id="vp-wpn-copy-status" style="font-family:monospace;font-size:10px;color:#4ade80;min-height:12px;"></div>
      </div>
      <div id="vp-tab-musou" style="display:none;flex-direction:column;gap:5px;background:#090d16;border:1px solid #1e293b;border-radius:4px;padding:7px;">
        <strong style="color:#facc15;font-size:10px;">⚡ [해적무쌍4 전투 프리셋]</strong>
        <div id="vp-musou-status" style="font-family:monospace;font-size:10px;color:#38bdf8;line-height:1.35;">3D 배틀 씬 진입 시 활성화됩니다.</div>
        <div style="color:#94a3b8;font-size:10px;">액션 타입 즉시 전환</div>
        <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:3px;">
          <button type="button" data-vp-musou-type="POWER" style="padding:4px 2px;font-size:9px;background:#7f1d1d;color:#fecaca;border:1px solid #ef4444;border-radius:4px;cursor:pointer;">POWER</button>
          <button type="button" data-vp-musou-type="SPEED" style="padding:4px 2px;font-size:9px;background:#083344;color:#a5f3fc;border:1px solid #22d3ee;border-radius:4px;cursor:pointer;">SPEED</button>
          <button type="button" data-vp-musou-type="TECHNIQUE" style="padding:4px 2px;font-size:9px;background:#3b0764;color:#e9d5ff;border:1px solid #a855f7;border-radius:4px;cursor:pointer;">TECH</button>
          <button type="button" data-vp-musou-type="SKY" style="padding:4px 2px;font-size:9px;background:#713f12;color:#fef08a;border:1px solid #facc15;border-radius:4px;cursor:pointer;">SKY</button>
        </div>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;">
          <button id="vp-musou-fill-burst" type="button" style="padding:4px;font-size:10px;background:#1e293b;color:#fde047;border:1px solid #facc15;border-radius:4px;cursor:pointer;">🔥 버스트 100%</button>
          <button id="vp-musou-trigger-burst" type="button" style="padding:4px;font-size:10px;background:#92400e;color:#fef08a;border:1px solid #facc15;border-radius:4px;cursor:pointer;">💥 버스트 발동</button>
        </div>
        <label style="display:flex;justify-content:space-between;align-items:center;">
          <span>스태미나 무한 토글</span>
          <input id="vp-musou-inf-stam" type="checkbox" />
        </label>
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:4px;">
          <button id="vp-musou-boss-10" type="button" style="padding:4px;font-size:10px;background:#1e293b;color:#fb923c;border:1px solid #f97316;border-radius:4px;cursor:pointer;">🛡 보스 아머 10%</button>
          <button id="vp-musou-horde-100" type="button" style="padding:4px;font-size:10px;background:#1e293b;color:#4ade80;border:1px solid #22c55e;border-radius:4px;cursor:pointer;">👥 잡졸 100명</button>
        </div>
        <div style="margin-top:4px;padding-top:6px;border-top:1px dashed #334155;display:flex;flex-direction:column;gap:4px;">
          <strong style="color:#7dd3fc;font-size:10px;">🎬 [스토리 테스트 점프 (Ch.01~Ch.18)]</strong>
          <select id="vp-story-jump-select" aria-label="스토리 테스트 점프 챕터 선택" style="background:#0f172a;color:#f8fafc;border:1px solid #38bdf8;border-radius:4px;padding:4px;font-size:10px;">
            ${STORY_CHAPTERS_LIST.map((ch) => `<option value="${ch.chapterId}">${ch.chapterNo} ${ch.title} (${ch.bossUnitId})</option>`).join('')}
          </select>
          <div style="display:grid;grid-template-columns:1fr 1fr 0.8fr;gap:4px;">
            <button id="vp-story-jump-cutscene" type="button" style="padding:4px;font-size:10px;background:#1e3a8a;color:#e0f2fe;border:1px solid #38bdf8;border-radius:4px;cursor:pointer;">🎬 3D 컷신</button>
            <button id="vp-story-jump-battle" type="button" style="padding:4px;font-size:10px;background:#7c2d12;color:#fef08a;border:1px solid #f97316;border-radius:4px;cursor:pointer;">⚔ 보스전</button>
            <button id="vp-story-codex-open" type="button" style="padding:4px;font-size:10px;background:#0f766e;color:#f0fdf4;border:1px solid #2dd4bf;border-radius:4px;cursor:pointer;">📖 도감</button>
          </div>
        </div>
      </div>
      <div id="vp-telemetry" style="background:#090d16;border:1px solid #1e293b;border-radius:4px;padding:6px;font-family:monospace;font-size:10px;line-height:1.45;color:#bae6fd;">
        Backend: 대기 중
      </div>
      <div id="vp-asset-vram-box" style="background:#090d16;border:1px solid #1e293b;border-radius:4px;padding:6px;display:flex;flex-direction:column;gap:5px;">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <strong style="color:#4ade80;font-size:10px;">📦 [에셋 &amp; VRAM]</strong>
          <button id="vp-btn-prune-bundles" type="button" style="padding:2px 6px;font-size:10px;background:#1e293b;border:1px solid #38bdf8;color:#bae6fd;border-radius:4px;cursor:pointer;">미사용 번들 정리</button>
        </div>
        <div id="vp-vram-summary" style="font-family:monospace;font-size:10px;color:#e2e8f0;">VRAM: 0.00 / 128 MB</div>
        <div id="vp-bundle-tags" style="display:flex;flex-wrap:wrap;gap:3px;"></div>
        <div id="vp-manifest-progress" style="font-family:monospace;font-size:10px;color:#cbd5e1;"></div>
      </div>
    `;

    rootEl.appendChild(this.el);
    this.bindEvents();
    this.syncFromHost();
  }

  private bindEvents(): void {
    const { signal } = this.abort;

    this.el.querySelector('#vp-btn-close')?.addEventListener(
      'click',
      () => this.close(),
      { signal }
    );

    this.el.querySelectorAll<HTMLButtonElement>('[data-vp-time]').forEach((btn) => {
      btn.addEventListener(
        'click',
        () => {
          const val = btn.dataset.vpTime as TimeOfDayPreset | undefined;
          if (!val) return;
          this.host.updatePolishConfig({ timeOfDay: val });
          this.syncFromHost();
          this.callbacks.onConfigChanged?.(this.host.getPolishConfig());
        },
        { signal }
      );
    });

    this.el.querySelectorAll<HTMLInputElement>('[data-vp-toggle]').forEach((chk) => {
      chk.addEventListener(
        'change',
        () => {
          const key = chk.dataset.vpToggle as
            | 'dynamicLighting'
            | 'selectiveBloom'
            | 'waterReflection'
            | 'godRaysAndParticles'
            | 'colorGrading'
            | undefined;
          if (!key) return;
          this.host.updatePolishConfig({ [key]: chk.checked });
          this.callbacks.onConfigChanged?.(this.host.getPolishConfig());
        },
        { signal }
      );
    });

    const selQuality = this.el.querySelector('#vp-sel-quality') as HTMLSelectElement | null;
    selQuality?.addEventListener(
      'change',
      () => {
        const val = selQuality.value as RenderQualityPreset;
        this.host.updatePolishConfig({ quality: val });
        this.syncFromHost();
        this.callbacks.onConfigChanged?.(this.host.getPolishConfig());
      },
      { signal }
    );

    this.el.querySelector('#vp-btn-prune-bundles')?.addEventListener(
      'click',
      () => {
        void this.host.bundleManager.pruneUnusedBundles().then(() => {
          this.refreshTelemetry();
        });
      },
      { signal }
    );

    const emitThree = (partial: Partial<ThreeToonTuningConfig>) => {
      this.callbacks.onThreeTuningChanged?.(partial);
      this.refreshTelemetry();
    };

    const celSel = this.el.querySelector('#vp-three-cel-steps') as HTMLSelectElement | null;
    celSel?.addEventListener(
      'change',
      () => emitThree({ celSteps: Number(celSel.value) as 2 | 3 | 4 }),
      { signal }
    );

    const bindRange = (id: string, key: keyof ThreeToonTuningConfig) => {
      const inp = this.el.querySelector(id) as HTMLInputElement | null;
      inp?.addEventListener(
        'input',
        () => emitThree({ [key]: Number(inp.value) } as Partial<ThreeToonTuningConfig>),
        { signal }
      );
    };
    bindRange('#vp-three-shadow-shift', 'shadowShiftStrength');
    bindRange('#vp-three-outline', 'outlineWidth');
    bindRange('#vp-three-rim', 'rimIntensity');
    bindRange('#vp-three-bloom', 'bloomStrength');
    bindRange('#vp-three-speedlines', 'speedlinesOpacity');

    const hordeSel = this.el.querySelector('#vp-three-horde') as HTMLSelectElement | null;
    hordeSel?.addEventListener(
      'change',
      () => emitThree({ hordeTargetCount: Number(hordeSel.value) as 30 | 60 | 100 }),
      { signal }
    );

    const tabBtnShader = this.el.querySelector('#vp-tab-btn-shader') as HTMLButtonElement | null;
    const tabBtnInsp = this.el.querySelector('#vp-tab-btn-inspector') as HTMLButtonElement | null;
    const tabBtnWeapon = this.el.querySelector('#vp-tab-btn-weapon') as HTMLButtonElement | null;
    const tabBtnMusou = this.el.querySelector('#vp-tab-btn-musou') as HTMLButtonElement | null;
    const tabShader = this.el.querySelector('#vp-tab-shader') as HTMLElement | null;
    const tabInsp = this.el.querySelector('#vp-tab-inspector') as HTMLElement | null;
    const tabWeapon = this.el.querySelector('#vp-tab-weapon') as HTMLElement | null;
    const tabMusou = this.el.querySelector('#vp-tab-musou') as HTMLElement | null;
    const activateTab = (tab: 'shader' | 'inspector' | 'weapon' | 'musou') => {
      if (tabShader) tabShader.style.display = tab === 'shader' ? 'flex' : 'none';
      if (tabInsp) tabInsp.style.display = tab === 'inspector' ? 'flex' : 'none';
      if (tabWeapon) tabWeapon.style.display = tab === 'weapon' ? 'flex' : 'none';
      if (tabMusou) tabMusou.style.display = tab === 'musou' ? 'flex' : 'none';
      const styleTabBtn = (btn: HTMLButtonElement | null, active: boolean) => {
        if (!btn) return;
        btn.style.background = active ? '#0284c7' : '#1e293b';
        btn.style.fontWeight = active ? '700' : '400';
      };
      styleTabBtn(tabBtnShader, tab === 'shader');
      styleTabBtn(tabBtnInsp, tab === 'inspector');
      styleTabBtn(tabBtnWeapon, tab === 'weapon');
      styleTabBtn(tabBtnMusou, tab === 'musou');
      this.syncInspectorUi();
      this.syncWeaponTunerUi();
      this.syncMusouPresetUi();
    };
    tabBtnShader?.addEventListener('click', () => activateTab('shader'), { signal });
    tabBtnInsp?.addEventListener('click', () => activateTab('inspector'), { signal });
    tabBtnWeapon?.addEventListener('click', () => activateTab('weapon'), { signal });
    tabBtnMusou?.addEventListener('click', () => activateTab('musou'), { signal });

    this.el.querySelectorAll<HTMLButtonElement>('[data-vp-musou-type]').forEach((btn) => {
      btn.addEventListener(
        'click',
        () => {
          const t = btn.dataset.vpMusouType as MusouActionType | undefined;
          if (!t) return;
          this.callbacks.threeMusouPreset?.setMusouActionTypeOverride(t);
          this.syncMusouPresetUi();
        },
        { signal }
      );
    });
    this.el.querySelector('#vp-musou-fill-burst')?.addEventListener(
      'click',
      () => {
        this.callbacks.threeMusouPreset?.fillMusouBurst(false);
        this.syncMusouPresetUi();
      },
      { signal }
    );
    this.el.querySelector('#vp-musou-trigger-burst')?.addEventListener(
      'click',
      () => {
        this.callbacks.threeMusouPreset?.fillMusouBurst(true);
        this.syncMusouPresetUi();
      },
      { signal }
    );
    const chkInfStam = this.el.querySelector('#vp-musou-inf-stam') as HTMLInputElement | null;
    chkInfStam?.addEventListener(
      'change',
      () => {
        this.callbacks.threeMusouPreset?.setMusouInfiniteStamina(chkInfStam.checked);
        this.syncMusouPresetUi();
      },
      { signal }
    );
    this.el.querySelector('#vp-musou-boss-10')?.addEventListener(
      'click',
      () => {
        this.callbacks.threeMusouPreset?.setBossArmorToTenPercent();
        this.syncMusouPresetUi();
      },
      { signal }
    );
    this.el.querySelector('#vp-musou-horde-100')?.addEventListener(
      'click',
      () => {
        this.callbacks.threeMusouPreset?.respawnHorde100();
        this.syncMusouPresetUi();
      },
      { signal }
    );

    const storySelect = this.el.querySelector('#vp-story-jump-select') as HTMLSelectElement | null;
    this.el.querySelector('#vp-story-jump-cutscene')?.addEventListener(
      'click',
      () => {
        const chId = storySelect?.value || STORY_CHAPTERS_LIST[0]?.chapterId;
        if (chId) {
          this.callbacks.threeStoryJump?.jumpToStoryCutscene(chId);
          this.close();
        }
      },
      { signal }
    );
    this.el.querySelector('#vp-story-jump-battle')?.addEventListener(
      'click',
      () => {
        const chId = storySelect?.value || STORY_CHAPTERS_LIST[0]?.chapterId;
        if (chId) {
          this.callbacks.threeStoryJump?.jumpToStoryBattle(chId);
          this.close();
        }
      },
      { signal }
    );
    this.el.querySelector('#vp-story-codex-open')?.addEventListener(
      'click',
      () => {
        this.close();
        this.callbacks.threeStoryJump?.openStoryCodex();
      },
      { signal }
    );

    const inspClip = this.el.querySelector('#vp-insp-clip') as HTMLSelectElement | null;
    inspClip?.addEventListener(
      'change',
      () => {
        this.callbacks.threeInspector?.selectInspectorClip(inspClip.value);
        this.syncInspectorUi();
      },
      { signal }
    );

    const playPauseBtn = this.el.querySelector('#vp-insp-play-pause') as HTMLButtonElement | null;
    playPauseBtn?.addEventListener(
      'click',
      () => {
        const snap = this.callbacks.threeInspector?.getInspectorSnapshot();
        const nextPaused = !(snap?.paused ?? false);
        this.callbacks.threeInspector?.setInspectorPaused(nextPaused);
        this.syncInspectorUi();
      },
      { signal }
    );

    const chkFlip = this.el.querySelector('#vp-insp-flip') as HTMLInputElement | null;
    chkFlip?.addEventListener(
      'change',
      () => {
        this.callbacks.threeInspector?.setInspectorForwardFlipped(chkFlip.checked);
      },
      { signal }
    );

    const chkLockXz = this.el.querySelector('#vp-insp-lock-xz') as HTMLInputElement | null;
    chkLockXz?.addEventListener(
      'change',
      () => {
        this.callbacks.threeInspector?.setInspectorRootMotionLock(chkLockXz.checked);
      },
      { signal }
    );

    const chkGuides = this.el.querySelector('#vp-insp-guides') as HTMLInputElement | null;
    chkGuides?.addEventListener(
      'change',
      () => {
        this.callbacks.threeInspector?.setInspectorSocketGuides(chkGuides.checked);
      },
      { signal }
    );

    const bindInspTuning = (id: string, key: 'outlineWidth' | 'rimIntensity') => {
      const inp = this.el.querySelector(id) as HTMLInputElement | null;
      inp?.addEventListener(
        'input',
        () => emitThree({ [key]: Number(inp.value) }),
        { signal }
      );
    };
    bindInspTuning('#vp-insp-outline', 'outlineWidth');
    bindInspTuning('#vp-insp-rim', 'rimIntensity');

    const inspScale = this.el.querySelector('#vp-insp-scale') as HTMLInputElement | null;
    inspScale?.addEventListener(
      'input',
      () => {
        this.callbacks.threeInspector?.setInspectorScaleMultiplier(Number(inspScale.value));
      },
      { signal }
    );

    this.el.querySelector('#vp-insp-copy-json')?.addEventListener(
      'click',
      () => {
        const jsonText = this.callbacks.threeInspector?.exportInspectorAnimJson() ?? '{}';
        const statusEl = this.el.querySelector('#vp-insp-copy-status');
        if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
          void navigator.clipboard.writeText(jsonText).then(
            () => {
              if (statusEl) statusEl.textContent = '✅ 클립보드 복사 완료 (.anim.json)';
            },
            () => {
              if (statusEl) statusEl.textContent = jsonText;
            }
          );
        } else if (statusEl) {
          statusEl.textContent = '✅ .anim.json 생성됨 (콘솔 확인)';
        }
      },
      { signal }
    );

    const wpnCharSel = this.el.querySelector('#vp-wpn-char') as HTMLSelectElement | null;
    wpnCharSel?.addEventListener(
      'change',
      () => {
        this.callbacks.threeWeaponTuner?.setWeaponTunerCharacter(wpnCharSel.value);
        this.syncWeaponTunerUi();
      },
      { signal }
    );

    const wpnSlotSel = this.el.querySelector('#vp-wpn-slot') as HTMLSelectElement | null;
    wpnSlotSel?.addEventListener(
      'change',
      () => {
        this.callbacks.threeWeaponTuner?.setWeaponTunerSlot(
          wpnSlotSel.value as WeaponTunerSlotKey
        );
        this.syncWeaponTunerUi();
      },
      { signal }
    );

    const chkHolster = this.el.querySelector('#vp-wpn-holster-swap') as HTMLInputElement | null;
    chkHolster?.addEventListener(
      'change',
      () => {
        this.callbacks.threeWeaponTuner?.setWeaponHolsterSwap(chkHolster.checked);
      },
      { signal }
    );

    const readNum = (id: string, fallback: number): number => {
      const inp = this.el.querySelector(id) as HTMLInputElement | null;
      return inp ? Number(inp.value) : fallback;
    };
    const emitWeaponTf = () => {
      this.callbacks.threeWeaponTuner?.updateWeaponSlotTransform({
        posX: readNum('#vp-wpn-px', 0),
        posY: readNum('#vp-wpn-py', 0),
        posZ: readNum('#vp-wpn-pz', 0),
        rotX: readNum('#vp-wpn-rx', 0),
        rotY: readNum('#vp-wpn-ry', 0),
        rotZ: readNum('#vp-wpn-rz', 0),
        scale: readNum('#vp-wpn-scale', 1)
      });
    };
    for (const id of [
      '#vp-wpn-px',
      '#vp-wpn-py',
      '#vp-wpn-pz',
      '#vp-wpn-rx',
      '#vp-wpn-ry',
      '#vp-wpn-rz',
      '#vp-wpn-scale'
    ]) {
      this.el.querySelector(id)?.addEventListener('input', emitWeaponTf, { signal });
    }

    const emitTrailLen = () => {
      this.callbacks.threeWeaponTuner?.updateWeaponTrailLengths(
        readNum('#vp-wpn-tbase', 0.16),
        readNum('#vp-wpn-ttip', 1.18)
      );
    };
    this.el.querySelector('#vp-wpn-tbase')?.addEventListener('input', emitTrailLen, { signal });
    this.el.querySelector('#vp-wpn-ttip')?.addEventListener('input', emitTrailLen, { signal });

    this.el.querySelector('#vp-wpn-test-swing')?.addEventListener(
      'click',
      () => {
        this.callbacks.threeWeaponTuner?.triggerWeaponTestSwing();
      },
      { signal }
    );
    this.el.querySelector('#vp-wpn-test-spark')?.addEventListener(
      'click',
      () => {
        this.callbacks.threeWeaponTuner?.triggerHitSparkTest();
      },
      { signal }
    );
    this.el.querySelector('#vp-wpn-copy-json')?.addEventListener(
      'click',
      () => {
        const jsonText = this.callbacks.threeWeaponTuner?.exportWeapons3dJson() ?? '{}';
        const statusEl = this.el.querySelector('#vp-wpn-copy-status');
        if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
          void navigator.clipboard.writeText(jsonText).then(
            () => {
              if (statusEl) statusEl.textContent = '✅ weapons_3d.json 복사 완료';
            },
            () => {
              if (statusEl) statusEl.textContent = '✅ weapons_3d.json 생성됨';
            }
          );
        } else if (statusEl) {
          statusEl.textContent = '✅ weapons_3d.json 생성됨';
        }
      },
      { signal }
    );
  }

  public isOpen(): boolean {
    return this.opened;
  }

  public open(): void {
    this.opened = true;
    this.el.style.display = 'flex';
    this.syncFromHost();
    this.refreshTelemetry();
    if (this.telemetryIntervalId === null && typeof window !== 'undefined') {
      this.telemetryIntervalId = window.setInterval(() => {
        this.refreshTelemetry();
      }, 250);
    }
  }

  public close(): void {
    this.opened = false;
    this.el.style.display = 'none';
    if (this.telemetryIntervalId !== null && typeof window !== 'undefined') {
      window.clearInterval(this.telemetryIntervalId);
      this.telemetryIntervalId = null;
    }
  }

  public toggle(force?: boolean): boolean {
    const next = force !== undefined ? force : !this.opened;
    if (next) this.open();
    else this.close();
    return this.opened;
  }

  public syncFromHost(): void {
    const cfg = this.host.getPolishConfig();
    this.el.querySelectorAll<HTMLButtonElement>('[data-vp-time]').forEach((btn) => {
      const active = btn.dataset.vpTime === cfg.timeOfDay;
      btn.style.background = active ? '#0284c7' : '#1e293b';
      btn.style.borderColor = active ? '#38bdf8' : '#334155';
      btn.style.fontWeight = active ? '700' : '400';
    });

    this.el.querySelectorAll<HTMLInputElement>('[data-vp-toggle]').forEach((chk) => {
      const key = chk.dataset.vpToggle as
        | 'dynamicLighting'
        | 'selectiveBloom'
        | 'waterReflection'
        | 'godRaysAndParticles'
        | 'colorGrading'
        | undefined;
      if (key) {
        chk.checked = cfg[key];
      }
    });

    const selQuality = this.el.querySelector('#vp-sel-quality') as HTMLSelectElement | null;
    if (selQuality) {
      selQuality.value = cfg.quality;
    }

    const t3Cfg = this.callbacks.threeHost?.getTuning();
    if (t3Cfg) {
      const celSel = this.el.querySelector('#vp-three-cel-steps') as HTMLSelectElement | null;
      if (celSel) celSel.value = String(t3Cfg.celSteps);
      const setVal = (id: string, val: number) => {
        const el = this.el.querySelector(id) as HTMLInputElement | null;
        if (el) el.value = String(val);
      };
      setVal('#vp-three-shadow-shift', t3Cfg.shadowShiftStrength);
      setVal('#vp-three-outline', t3Cfg.outlineWidth);
      setVal('#vp-three-rim', t3Cfg.rimIntensity);
      setVal('#vp-three-bloom', t3Cfg.bloomStrength);
      setVal('#vp-three-speedlines', t3Cfg.speedlinesOpacity);
      setVal('#vp-insp-outline', t3Cfg.outlineWidth);
      setVal('#vp-insp-rim', t3Cfg.rimIntensity);
      const hordeSel = this.el.querySelector('#vp-three-horde') as HTMLSelectElement | null;
      if (hordeSel) hordeSel.value = String(t3Cfg.hordeTargetCount);
    }
    this.syncInspectorUi();
    this.syncWeaponTunerUi();
    this.syncMusouPresetUi();
  }

  private syncMusouPresetUi(): void {
    const snap = this.callbacks.threeMusouPreset?.getMusouDebugSnapshot();
    const statusEl = this.el.querySelector('#vp-musou-status');
    if (statusEl) {
      statusEl.textContent = snap?.active
        ? `타입:${snap.actionType} | 스태미나:${snap.stamina} | 버스트:${snap.burstActive ? '각성중' : `${Math.round(snap.burstGauge / 10)}%`} | 보스아머:${snap.bossArmor}/${snap.bossMaxArmor} (${snap.bossArmorState})`
        : '3D 배틀 씬 진입 시 활성화됩니다.';
    }
    const chk = this.el.querySelector('#vp-musou-inf-stam') as HTMLInputElement | null;
    if (chk && snap) {
      chk.checked = snap.infiniteStamina;
    }
  }

  private syncWeaponTunerUi(): void {
    const snap = this.callbacks.threeWeaponTuner?.getWeaponTunerSnapshot();
    const infoEl = this.el.querySelector('#vp-wpn-info');
    if (infoEl) {
      infoEl.textContent = snap?.active
        ? `${snap.weaponLabel} [${snap.bone}]${snap.holstered ? ' (수납)' : ' (발도)'}`
        : '3D 배틀 씬 진입 후 무기 슬롯이 활성화됩니다.';
    }
    if (!snap) return;

    const setInput = (id: string, val: number) => {
      const el = this.el.querySelector(id) as HTMLInputElement | null;
      if (el) el.value = String(val);
    };
    const charSel = this.el.querySelector('#vp-wpn-char') as HTMLSelectElement | null;
    if (charSel) charSel.value = snap.loadoutId;
    const slotSel = this.el.querySelector('#vp-wpn-slot') as HTMLSelectElement | null;
    if (slotSel) slotSel.value = snap.slotKey;
    const chkHol = this.el.querySelector('#vp-wpn-holster-swap') as HTMLInputElement | null;
    if (chkHol) chkHol.checked = snap.enableHolsterSwap;

    setInput('#vp-wpn-px', snap.position[0]);
    setInput('#vp-wpn-py', snap.position[1]);
    setInput('#vp-wpn-pz', snap.position[2]);
    setInput('#vp-wpn-rx', snap.rotationDeg[0]);
    setInput('#vp-wpn-ry', snap.rotationDeg[1]);
    setInput('#vp-wpn-rz', snap.rotationDeg[2]);
    setInput('#vp-wpn-scale', snap.scale);
    setInput('#vp-wpn-tbase', snap.trailBaseY);
    setInput('#vp-wpn-ttip', snap.trailTipY);
  }

  private syncInspectorUi(): void {
    const snap = this.callbacks.threeInspector?.getInspectorSnapshot();
    const infoEl = this.el.querySelector('#vp-insp-info');
    if (infoEl) {
      if (!snap || !snap.active) {
        infoEl.textContent = '3D 배틀 씬 진입 시 활성화됩니다.';
      } else {
        infoEl.textContent = `모델: ${snap.characterId ?? '-'} (${snap.source ?? '-'}) | 소켓: ${snap.boundSockets.length}개`;
      }
    }

    const clipSel = this.el.querySelector('#vp-insp-clip') as HTMLSelectElement | null;
    if (clipSel && snap?.active) {
      const targetOptions = ['', ...snap.availableClips];
      const existingValues = Array.from(clipSel.options).map((o) => o.value);
      const changed =
        targetOptions.length !== existingValues.length ||
        targetOptions.some((v, idx) => existingValues[idx] !== v);
      if (changed) {
        clipSel.innerHTML = [
          '<option value="">(자동 전투 상태)</option>',
          ...snap.availableClips.map((c) => `<option value="${c}">${c}</option>`)
        ].join('');
      }
    }

    const playPauseBtn = this.el.querySelector('#vp-insp-play-pause') as HTMLButtonElement | null;
    if (playPauseBtn) {
      playPauseBtn.textContent = snap?.paused ? '▶ 재생' : '⏸ 일시정지';
    }

    const setChecked = (id: string, val: boolean) => {
      const chk = this.el.querySelector(id) as HTMLInputElement | null;
      if (chk) chk.checked = val;
    };
    if (snap) {
      setChecked('#vp-insp-flip', snap.forwardFlipped);
      setChecked('#vp-insp-lock-xz', snap.lockRootMotionXZ);
      setChecked('#vp-insp-guides', snap.socketGuidesVisible);
      const scaleEl = this.el.querySelector('#vp-insp-scale') as HTMLInputElement | null;
      if (scaleEl) scaleEl.value = String(snap.scaleMultiplier);
    }
  }

  public refreshTelemetry(): void {
    this.syncMusouPresetUi();
    const box = this.el.querySelector('#vp-telemetry');
    if (box) {
      const threeSnap = this.callbacks.threeHost?.isActive
        ? this.callbacks.threeHost.getTelemetrySnapshot()
        : null;
      if (threeSnap) {
        box.innerHTML = [
          `Backend: <b>Three.js WebGL2 (3D Musou)</b> [${threeSnap.quality}]`,
          `FPS: <b>${threeSnap.fps}</b> (${threeSnap.frameTimeMs.toFixed(1)} ms) | Horde: <b>${threeSnap.hordeActiveCount}</b> | KO: <b>${threeSnap.koCount}</b>`,
          `DrawCalls: <b>${threeSnap.drawCalls}</b> | Tris: <b>${threeSnap.triangles}</b> | Geo: <b>${threeSnap.geometries}</b> | Tex: <b>${threeSnap.textures}</b>`
        ].join('<br/>');
      } else {
        const t = this.host.getTelemetry();
        const glLabel = t.isWebGL2 ? 'WebGL2' : t.backend === 'PIXI_WEBGL2' ? 'WebGL' : 'Canvas2D';
        box.innerHTML = [
          `Backend: <b>${glLabel}</b> (${t.activeSceneTag})`,
          `FPS: <b>${t.fps}</b> (${t.frameMs.toFixed(1)} ms/frame) @ ${t.viewWidth}×${t.viewHeight}`,
          `Draw Calls~: <b>${t.drawCallsEstimate}</b> | Textures: <b>${t.textureCount}</b> | RTs: <b>${t.renderTextureCount}</b>`
        ].join('<br/>');
      }
    }

    const vram = this.host.bundleManager.getVramTelemetry();
    const sumEl = this.el.querySelector('#vp-vram-summary');
    if (sumEl) {
      const budgetTag = vram.overBudget
        ? ' <span style="color:#f87171;font-weight:bold;">[예산 초과!]</span>'
        : '';
      sumEl.innerHTML = `VRAM~: <b>${vram.estimatedVramMb.toFixed(2)} / ${vram.budgetMb} MB</b> | URLs: <b>${vram.totalLoadedUrls}</b> | Ep: <b>${vram.transitionEpoch}</b>${budgetTag}`;
    }

    const tagsEl = this.el.querySelector('#vp-bundle-tags');
    if (tagsEl) {
      tagsEl.innerHTML =
        vram.activeBundles.length > 0
          ? vram.activeBundles
            .map((b) => {
              const bg =
                b.tier === 'CORE'
                  ? '#166534'
                  : b.tier === 'SEA'
                    ? '#075985'
                    : b.tier === 'ISLAND'
                      ? '#854d0e'
                      : '#7f1d1d';
              return `<span style="padding:1px 5px;border-radius:4px;font-size:9px;background:${bg};color:#f8fafc;border:1px solid rgba(255,255,255,0.2);">${b.bundle} (${b.estimatedVramMb.toFixed(2)}MB)</span>`;
            })
            .join('')
          : '<span style="font-size:9px;color:#64748b;">활성 번들 없음 (지연 대기)</span>';
    }

    const progEl = this.el.querySelector('#vp-manifest-progress');
    if (progEl) {
      const mp = vram.manifestProgress;
      const tot = Math.max(1, mp.total);
      const vPct = ((mp.verified / tot) * 100).toFixed(1);
      const iPct = ((mp.imported / tot) * 100).toFixed(1);
      progEl.innerHTML = `
        <div style="display:flex;justify-content:space-between;margin-bottom:2px;">
          <span>pro_manifest (${mp.readyPercent}%)</span>
          <span>V:${mp.verified} I:${mp.imported} P:${mp.placeholder}</span>
        </div>
        <div style="display:flex;width:100%;height:5px;background:#1e293b;border-radius:3px;overflow:hidden;">
          <div style="width:${vPct}%;background:#22c55e;"></div>
          <div style="width:${iPct}%;background:#38bdf8;"></div>
        </div>
      `;
    }
  }

  public dispose(): void {
    this.close();
    this.abort.abort();
    this.el.remove();
  }
}
