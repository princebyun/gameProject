import type { Disposable } from '../../core/types/disposable';
import type {
  RenderQualityPreset,
  TimeOfDayPreset,
  VisualPolishConfig
} from '../../render/backend/renderBackend';
import type { PixiStageHost } from '../../render/pixi/PixiStageHost';

export interface VisualPolishDrawerCallbacks {
  onConfigChanged?: (next: VisualPolishConfig) => void;
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
      <div id="vp-telemetry" style="background:#090d16;border:1px solid #1e293b;border-radius:4px;padding:6px;font-family:monospace;font-size:10px;line-height:1.45;color:#bae6fd;">
        Backend: 대기 중
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
  }

  public refreshTelemetry(): void {
    const box = this.el.querySelector('#vp-telemetry');
    if (!box) return;
    const t = this.host.getTelemetry();
    const glLabel = t.isWebGL2 ? 'WebGL2' : t.backend === 'PIXI_WEBGL2' ? 'WebGL' : 'Canvas2D';
    box.innerHTML = [
      `Backend: <b>${glLabel}</b> (${t.activeSceneTag})`,
      `FPS: <b>${t.fps}</b> (${t.frameMs.toFixed(1)} ms/frame) @ ${t.viewWidth}×${t.viewHeight}`,
      `Draw Calls~: <b>${t.drawCallsEstimate}</b> | Textures: <b>${t.textureCount}</b> | RTs: <b>${t.renderTextureCount}</b>`
    ].join('<br/>');
  }

  public dispose(): void {
    this.close();
    this.abort.abort();
    this.el.remove();
  }
}
