import type { AssetLoader } from '../assets/assetLoader';
import type { SaveEnvelope } from '../core/save/schema';
import type { Disposable } from '../core/types/disposable';
import { resolveBiomeForSeaZone } from '../data/assets/assetManifestRegistry';
import { releaseOffscreenCanvas } from '../render/canvasGpuDispose';
import {
  DEFAULT_VIEWPORT_METRICS,
  type ViewportMetrics
} from '../render/viewport/responsiveViewportManager';

let cachedTitleSkyCanvas: HTMLCanvasElement | null = null;
let cachedTitleSkyW = 0;
let cachedTitleSkyH = 0;

export function disposeTitleSceneCaches(): void {
  releaseOffscreenCanvas(cachedTitleSkyCanvas);
  cachedTitleSkyCanvas = null;
  cachedTitleSkyW = 0;
  cachedTitleSkyH = 0;
}

function getOrBakeTitleSkyCanvas(
  w: number,
  horizonY: number
): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  if (
    cachedTitleSkyCanvas &&
    cachedTitleSkyW === w &&
    cachedTitleSkyH === horizonY
  ) {
    return cachedTitleSkyCanvas;
  }
  releaseOffscreenCanvas(cachedTitleSkyCanvas);
  const c = document.createElement('canvas');
  c.width = Math.max(1, w);
  c.height = Math.max(1, horizonY);
  const gctx = c.getContext('2d');
  if (!gctx) {
    releaseOffscreenCanvas(c);
    return null;
  }
  const skyGrad = gctx.createLinearGradient(0, 0, 0, horizonY);
  skyGrad.addColorStop(0, '#0c2d57');
  skyGrad.addColorStop(0.65, '#1d6fa5');
  skyGrad.addColorStop(1, '#fbbf24');
  gctx.fillStyle = skyGrad;
  gctx.fillRect(0, 0, w, horizonY);
  gctx.fillStyle = 'rgba(254, 240, 138, 0.85)';
  gctx.beginPath();
  gctx.arc(Math.round(w * 0.72), horizonY - 26, 38, 0, Math.PI * 2);
  gctx.fill();

  cachedTitleSkyCanvas = c;
  cachedTitleSkyW = w;
  cachedTitleSkyH = horizonY;
  return c;
}

export interface TitleSavePreview {
  envelope: SaveEnvelope;
  chapterLabel: string;
  locationName: string;
  bounty: number;
  playTimeLabel: string;
}

export interface TitleSceneCallbacks {
  onContinue: () => void;
  onNewAdventure: () => void;
  onStoryCodex?: () => void;
  onSandbox: () => void;
  onOnlineOrRaid: () => void;
  onSettings: () => void;
  onFirstInteraction: () => void;
}

export function formatPlayTime(sec: number): string {
  const totalMin = Math.max(0, Math.floor(sec / 60));
  const hrs = Math.floor(totalMin / 60);
  const mins = totalMin % 60;
  return `${hrs}시간 ${String(mins).padStart(2, '0')}분`;
}

/**
 * Bandai Console/Mobile RPG Title Screen:
 * - Animated pixel ocean, drifting clouds, sailing pirate ship on full dynamic width
 * - Initial "화면을 터치하거나 아무 키나 누르세요" prompt -> slides open Main Menu
 */
export class TitleSceneController implements Disposable {
  private overlayEl: HTMLElement;
  private menuExpanded = false;
  private confirmOverwriteOpen = false;
  private savePreview: TitleSavePreview | null = null;
  private isVisible = false;
  private domAbortController: AbortController | null = null;

  constructor(
    private readonly rootEl: HTMLElement,
    private readonly callbacks: TitleSceneCallbacks
  ) {
    this.overlayEl = document.createElement('div');
    this.overlayEl.id = 'title-scene-overlay';
    this.overlayEl.style.cssText = [
      'position:fixed',
      'inset:0',
      'z-index:50',
      'display:none',
      'flex-direction:column',
      'align-items:center',
      'justify-content:space-between',
      'padding:calc(env(safe-area-inset-top, 0px) + 18px) calc(env(safe-area-inset-right, 0px) + 20px) calc(env(safe-area-inset-bottom, 0px) + 18px) calc(env(safe-area-inset-left, 0px) + 20px)',
      'pointer-events:auto'
    ].join(';');
    this.rootEl.appendChild(this.overlayEl);
  }

  public show(savePreview: TitleSavePreview | null): void {
    this.savePreview = savePreview;
    this.menuExpanded = false;
    this.confirmOverwriteOpen = false;
    this.isVisible = true;
    this.overlayEl.style.display = 'flex';
    this.renderOverlayDom();
  }

  public hide(): void {
    this.isVisible = false;
    this.overlayEl.style.display = 'none';
  }

  public dispose(): void {
    this.hide();
    this.domAbortController?.abort();
    this.domAbortController = null;
    this.overlayEl.onclick = null;
    this.overlayEl.remove?.();
    disposeTitleSceneCaches();
  }

  public getIsVisible(): boolean {
    return this.isVisible;
  }

  public isMenuExpanded(): boolean {
    return this.menuExpanded;
  }

  public expandMenu(): void {
    if (!this.isVisible || this.menuExpanded) return;
    this.menuExpanded = true;
    this.callbacks.onFirstInteraction();
    this.renderOverlayDom();
  }

  private renderOverlayDom(): void {
    this.domAbortController?.abort();
    this.domAbortController = new AbortController();
    const { signal } = this.domAbortController;

    if (!this.menuExpanded) {
      this.overlayEl.innerHTML = `
        <div style="text-align:center;margin-top:4dvh;text-shadow:0 3px 10px rgba(0,0,0,0.85);">
          <div style="font-size:12px;letter-spacing:3px;color:#7dd3fc;font-weight:700;">BANDAI-STYLE 2D PIXEL ACTION RPG</div>
          <h1 style="font-size:clamp(26px, 5vw, 44px);font-weight:900;color:#fde047;letter-spacing:2px;margin:4px 0;">
            🏴‍☠️ ONE PIECE : GRAND VOYAGE
          </h1>
          <div style="font-size:13px;color:#e2e8f0;">이스트 블루에서 엘바프까지 — 위대한 항로의 자유 탐험</div>
        </div>
        <div id="title-press-start" style="margin-bottom:6dvh;padding:10px 26px;background:rgba(15,23,42,0.84);border:2px solid #facc15;border-radius:999px;color:#fef08a;font-weight:800;font-size:15px;letter-spacing:1px;cursor:pointer;box-shadow:0 0 18px rgba(250,204,21,0.35);">
          ▶ 화면을 터치하거나 아무 키나 누르세요
        </div>
      `;

      this.overlayEl.addEventListener('click', () => this.expandMenu(), { signal });
      return;
    }

    const sp = this.savePreview;

    this.overlayEl.innerHTML = `
      <div style="text-align:center;text-shadow:0 3px 10px rgba(0,0,0,0.85);">
        <div style="font-size:11px;letter-spacing:2px;color:#7dd3fc;font-weight:700;">ONE PIECE 2D PIXEL ACTION RPG</div>
        <h1 style="font-size:clamp(22px, 4vw, 34px);font-weight:900;color:#fde047;margin:2px 0;">
          🏴‍☠️ ONE PIECE : GRAND VOYAGE
        </h1>
      </div>

      <div style="display:flex;gap:16px;align-items:center;justify-content:center;flex-wrap:wrap;width:100%;max-width:780px;margin:auto 0;">
        <div style="display:flex;flex-direction:column;gap:8px;width:min(310px, 88vw);background:rgba(9,13,22,0.88);border:2px solid #38bdf8;border-radius:10px;padding:12px;">
          ${
            sp
              ? `<button id="btn-title-continue" style="padding:11px 14px;background:linear-gradient(90deg,#b45309,#eab308);color:#090d16;border:2px solid #fef08a;border-radius:7px;font-weight:900;font-size:14px;text-align:left;">
                  ▶ 이어하기 (CONTINUE)
                </button>`
              : ''
          }
          <button id="btn-title-new-game" style="padding:10px 14px;background:${sp ? '#1e293b' : 'linear-gradient(90deg,#0284c7,#38bdf8)'};color:${sp ? '#f8fafc' : '#090d16'};border:1.5px solid #38bdf8;border-radius:7px;font-weight:800;font-size:13px;text-align:left;">
            ⚓ 새 모험 시작 (NEW ADVENTURE)
          </button>
          <button id="btn-title-story-codex" style="padding:9px 14px;background:#0c4a6e;color:#e0f2fe;border:1.5px solid #38bdf8;border-radius:7px;font-weight:800;font-size:12px;text-align:left;">
            📖 3D 스토리 도감 (Ch.01~18)
          </button>
          <button id="btn-title-sandbox" style="padding:9px 14px;background:#1e293b;color:#e2e8f0;border:1px solid #475569;border-radius:7px;font-weight:700;font-size:12px;text-align:left;">
            ⚔ 연습 배틀 (SANDBOX)
          </button>
          <button id="btn-title-online" style="padding:9px 14px;background:#3b0764;color:#f3e8ff;border:1px solid #a855f7;border-radius:7px;font-weight:700;font-size:12px;text-align:left;">
            🌐 통신 대전 / 거대 보스 협동 레이드
          </button>
          <button id="btn-title-settings" style="padding:9px 14px;background:#1e293b;color:#cbd5e1;border:1px solid #475569;border-radius:7px;font-weight:700;font-size:12px;text-align:left;">
            ⚙ 설정 (해상도 · 터치 크기 · 오디오)
          </button>
        </div>

        ${
          sp
            ? `
          <div id="title-save-preview-card" style="width:min(320px, 88vw);background:rgba(15,23,42,0.92);border:2px solid #facc15;border-radius:10px;padding:12px;font-family:monospace;font-size:12px;color:#e2e8f0;">
            <div style="color:#fde047;font-weight:800;border-bottom:1px solid #334155;padding-bottom:6px;margin-bottom:8px;">
              📜 최근 항해 기록 (이어하기)
            </div>
            <div>챕터: <strong style="color:#7dd3fc;">${sp.chapterLabel}</strong></div>
            <div style="margin-top:4px;">위치: <strong>${sp.locationName}</strong></div>
            <div style="margin-top:4px;">현상금: <strong style="color:#fb923c;">${sp.bounty.toLocaleString()} 베리</strong></div>
            <div style="margin-top:4px;">플레이 시간: <strong>${sp.playTimeLabel}</strong></div>
          </div>
        `
            : ''
        }
      </div>

      ${
        this.confirmOverwriteOpen
          ? `
        <div style="position:fixed;inset:0;background:rgba(0,0,0,0.78);display:flex;align-items:center;justify-content:center;z-index:80;padding:16px;">
          <div style="max-width:420px;width:100%;background:#0f172a;border:2px solid #f59e0b;border-radius:10px;padding:16px;text-align:center;">
            <h3 style="color:#fde047;font-size:15px;margin-bottom:8px;">⚠ 새 모험 시작 확인</h3>
            <p style="font-size:12px;color:#cbd5e1;line-height:1.5;margin-bottom:14px;">
              기존 자동 저장(auto)이 새 모험으로 덮어쓰기 됩니다.<br/>(수동 슬롯 1~3은 그대로 보존됩니다.)<br/>오프닝 나레이션부터 새로 시작할까요?
            </p>
            <div style="display:flex;gap:8px;justify-content:center;">
              <button id="btn-confirm-new-cancel" style="padding:7px 14px;background:#334155;color:#fff;">취소</button>
              <button id="btn-confirm-new-ok" style="padding:7px 16px;background:#dc2626;color:#fff;font-weight:bold;border-color:#f87171;">새 모험 시작</button>
            </div>
          </div>
        </div>
      `
          : ''
      }

      <div style="font-size:10px;color:#94a3b8;font-family:monospace;">
        Galaxy S25 Ultra 19.5:9 Edge-to-Edge Optimized · Press Any Key or Tap
      </div>
    `;

    this.overlayEl
      .querySelector('#btn-title-continue')
      ?.addEventListener('click', () => this.callbacks.onContinue(), { signal });

    this.overlayEl
      .querySelector('#btn-title-new-game')
      ?.addEventListener('click', () => {
        if (this.savePreview) {
          this.confirmOverwriteOpen = true;
          this.renderOverlayDom();
        } else {
          this.callbacks.onNewAdventure();
        }
      }, { signal });

    this.overlayEl
      .querySelector('#btn-confirm-new-cancel')
      ?.addEventListener('click', () => {
        this.confirmOverwriteOpen = false;
        this.renderOverlayDom();
      }, { signal });

    this.overlayEl
      .querySelector('#btn-confirm-new-ok')
      ?.addEventListener('click', () => {
        this.confirmOverwriteOpen = false;
        this.callbacks.onNewAdventure();
      }, { signal });

    this.overlayEl
      .querySelector('#btn-title-story-codex')
      ?.addEventListener('click', () => this.callbacks.onStoryCodex?.(), { signal });

    this.overlayEl
      .querySelector('#btn-title-sandbox')
      ?.addEventListener('click', () => this.callbacks.onSandbox(), { signal });

    this.overlayEl
      .querySelector('#btn-title-online')
      ?.addEventListener('click', () => this.callbacks.onOnlineOrRaid(), { signal });

    this.overlayEl
      .querySelector('#btn-title-settings')
      ?.addEventListener('click', () => this.callbacks.onSettings(), { signal });
  }
}

export function renderTitleSceneCanvas(
  ctx: CanvasRenderingContext2D,
  assets: AssetLoader,
  tick: number,
  viewport: ViewportMetrics = DEFAULT_VIEWPORT_METRICS
): void {
  const w = viewport.viewWidth;
  const h = viewport.viewHeight;
  const horizonY = Math.round(h * 0.56);

  ctx.save();

  // 1. Vibrant Grand Line Sky Gradient + Sun disc (cached offscreen canvas)
  const skyCanvas = getOrBakeTitleSkyCanvas(w, horizonY);
  if (skyCanvas) {
    ctx.drawImage(skyCanvas, 0, 0);
  } else {
    ctx.fillStyle = '#1d6fa5';
    ctx.fillRect(0, 0, w, horizonY);
  }

  // Drifting pixel clouds
  ctx.fillStyle = 'rgba(248, 250, 252, 0.75)';
  for (let i = 0; i < 6; i++) {
    const cx = ((i * 230 + tick * (0.4 + (i % 3) * 0.15)) % (w + 140)) - 70;
    const cy = 44 + (i % 3) * 46;
    ctx.fillRect(Math.round(cx), cy, 68, 14);
    ctx.fillRect(Math.round(cx + 12), cy - 10, 40, 10);
  }

  // 2. Animated Pixel Ocean Tileset below horizon
  const seaBiome = resolveBiomeForSeaZone('east_blue', assets.manifestRegistry);
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, horizonY, w, h - horizonY);
  ctx.clip();
  assets.tilemapRenderer.renderBiomeBackdrop(
    ctx,
    `title_sea_${w}`,
    w,
    h,
    0,
    horizonY,
    w,
    h - horizonY,
    seaBiome,
    assets,
    tick
  );
  ctx.restore();

  // Sparkling horizon foam line
  ctx.fillStyle = 'rgba(254, 240, 138, 0.5)';
  ctx.fillRect(0, horizonY, w, 3);

  // 3. Sailing Going Merry Pixel Ship bobbing on the ocean
  const shipResolved = assets.getOrCreateShipSpriteSheet('going_merry');
  if (shipResolved.sheet && shipResolved.entry) {
    const clip = shipResolved.entry.animations.MOVE;
    const frameIdx = Math.floor((tick / 60) * clip.fps) % clip.frames;
    const shipX = Math.round(((tick * 0.9) % (w + 160)) - 80);
    const shipY = Math.round(horizonY + 62 + Math.sin(tick * 0.08) * 6);
    const drawSize = 96;
    ctx.drawImage(
      shipResolved.sheet,
      frameIdx * shipResolved.entry.frameWidth,
      clip.row * shipResolved.entry.frameHeight,
      shipResolved.entry.frameWidth,
      shipResolved.entry.frameHeight,
      shipX,
      shipY,
      drawSize,
      drawSize
    );
  }

  // Subtle top/bottom cinematic readability vignette
  ctx.fillStyle = 'rgba(7, 11, 18, 0.25)';
  ctx.fillRect(0, 0, w, h);

  ctx.restore();
}
