import type { Disposable } from '../../core/types/disposable';

export const LOADING_OVERLAY_DELAY_MS = 120;

export class PixiBundleLoadingOverlay implements Disposable {
  private readonly el: HTMLElement | null;
  private readonly fillEl: HTMLElement | null = null;
  private readonly labelEl: HTMLElement | null = null;
  private showTimerId: ReturnType<typeof setTimeout> | null = null;
  private activeLoadToken = 0;
  private disposed = false;

  constructor(container: HTMLElement | null) {
    if (!container || typeof document === 'undefined') {
      this.el = null;
      return;
    }

    const box = document.createElement('div');
    box.id = 'pixi-bundle-loading-overlay';
    box.setAttribute('aria-live', 'polite');
    box.style.cssText = [
      'position:fixed',
      'right:calc(env(safe-area-inset-right, 0px) + 12px)',
      'bottom:calc(env(safe-area-inset-bottom, 0px) + 12px)',
      'z-index:62',
      'display:none',
      'align-items:center',
      'gap:8px',
      'padding:6px 10px',
      'border-radius:6px',
      'background:rgba(9, 13, 22, 0.92)',
      'border:1.5px solid #facc15',
      'color:#fef08a',
      'font-family:monospace',
      'font-size:11px',
      'pointer-events:none',
      'box-shadow:0 4px 12px rgba(0, 0, 0, 0.5)'
    ].join(';');

    box.innerHTML = `
      <span style="display:inline-block;width:12px;height:12px;border:2px solid #facc15;border-top-color:#38bdf8;border-radius:50%;animation:opgv-spin 0.8s linear infinite;"></span>
      <div style="display:flex;flex-direction:column;gap:3px;min-width:98px;">
        <span id="pixi-load-label" style="font-weight:bold;letter-spacing:0.2px;">항로 로딩 0%</span>
        <div style="width:100%;height:4px;background:#1e293b;border-radius:2px;overflow:hidden;">
          <div id="pixi-load-fill" style="width:0%;height:100%;background:#38bdf8;"></div>
        </div>
      </div>
    `;

    container.appendChild(box);
    this.el = box;
    this.fillEl = box.querySelector('#pixi-load-fill');
    this.labelEl = box.querySelector('#pixi-load-label');
  }

  public get isVisible(): boolean {
    return Boolean(this.el && this.el.style.display !== 'none');
  }

  public beginLoad(label = '에셋 로딩'): number {
    if (this.disposed) return 0;
    this.clearTimer();
    this.activeLoadToken += 1;
    const token = this.activeLoadToken;
    this.setProgress(0, label);

    if (this.el) {
      this.showTimerId = setTimeout(() => {
        this.showTimerId = null;
        if (!this.disposed && this.activeLoadToken === token && this.el) {
          this.el.style.display = 'flex';
        }
      }, LOADING_OVERLAY_DELAY_MS);
    }
    return token;
  }

  public setProgress(ratio: number, label = '항로 로딩'): void {
    const pct = Math.max(0, Math.min(100, Math.round(ratio * 100)));
    if (this.fillEl) {
      this.fillEl.style.width = `${pct}%`;
    }
    if (this.labelEl) {
      this.labelEl.textContent = `${label} ${pct}%`;
    }
  }

  public endLoad(token?: number): void {
    if (token !== undefined && token !== this.activeLoadToken) return;
    this.clearTimer();
    if (this.el) {
      this.el.style.display = 'none';
    }
  }

  private clearTimer(): void {
    if (this.showTimerId !== null) {
      clearTimeout(this.showTimerId);
      this.showTimerId = null;
    }
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.clearTimer();
    this.el?.remove();
  }
}
