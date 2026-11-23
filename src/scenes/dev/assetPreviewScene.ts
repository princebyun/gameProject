import type { AssetLoader } from '../../assets/assetLoader';
import type { AudioManager } from '../../audio/audioManager';
import type {
  FormDefinition,
  GameDataRegistry,
  UnitDefinition
} from '../../core/types/dataSchemas';
import type { SpriteAnimState } from '../../data/assets/types';
import type { Disposable } from '../sceneTypes';
import {
  renderSpritePreviewCanvas,
  renderTilesetPreviewCanvas
} from './assetPreviewCanvas';
import {
  buildAssetPreviewHtml,
  type AssetPreviewUiState,
  type PreviewTab
} from './assetPreviewDom';
import { SlicerTabController } from './slicerTabController';

export interface AssetPreviewCallbacks {
  onClose: () => void;
}

export class AssetPreviewScene implements Disposable {
  private readonly overlayEl: HTMLElement;
  private isOpen = false;
  private readonly uiState: AssetPreviewUiState = {
    activeTab: 'SPRITE',
    selectedTargetKey: 'unit:luffy',
    selectedFormId: 'base',
    selectedAnim: 'IDLE',
    zoomScale: 2,
    toggleHitFlash: false,
    toggleArmament: false,
    toggleHagoromo: 'NONE',
    toggleLunarian: false,
    toggleConqueror: false,
    selectedBiomeId: 'wano_castle',
    lastSfxResultText: 'SFX 버튼을 클릭해 테스트하세요.'
  };

  private previewCanvas: HTMLCanvasElement | null = null;
  private rafId: number | null = null;
  private previewTick = 0;
  private readonly slicerCtrl: SlicerTabController;

  constructor(
    private readonly rootEl: HTMLElement,
    private readonly gameRegistry: GameDataRegistry,
    private readonly assets: AssetLoader,
    private readonly audio: AudioManager,
    private readonly callbacks: AssetPreviewCallbacks
  ) {
    this.slicerCtrl = new SlicerTabController(gameRegistry);
    this.overlayEl = document.createElement('div');
    this.overlayEl.id = 'asset-preview-modal';
    this.overlayEl.className = 'modal-overlay';
    this.overlayEl.style.zIndex = '9999';
    this.rootEl.appendChild(this.overlayEl);
  }

  public open(): void {
    this.isOpen = true;
    this.overlayEl.classList.add('open');
    this.renderUi();
    this.startLoop();
  }

  public close(): void {
    this.isOpen = false;
    this.overlayEl.classList.remove('open');
    this.stopLoop();
    this.callbacks.onClose();
  }

  public getIsOpen(): boolean {
    return this.isOpen;
  }

  public dispose(): void {
    this.isOpen = false;
    this.stopLoop();
    this.slicerCtrl.dispose();
    this.previewCanvas = null;
    this.overlayEl.remove();
  }

  private startLoop(): void {
    if (this.rafId !== null) return;
    const step = () => {
      if (!this.isOpen) {
        this.rafId = null;
        return;
      }
      this.previewTick += 1;
      this.renderPreviewCanvas();
      this.rafId = window.requestAnimationFrame(step);
    };
    this.rafId = window.requestAnimationFrame(step);
  }

  private stopLoop(): void {
    if (this.rafId !== null) {
      window.cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  private getAvailableFormsForUnit(unitDef: UnitDefinition | undefined): FormDefinition[] {
    if (!unitDef) return [];
    const seen = new Set<string>();
    const ids: string[] = [];
    if (unitDef.defaultFormId) ids.push(unitDef.defaultFormId);
    if (unitDef.awakenedFormId) ids.push(unitDef.awakenedFormId);
    for (const fid of unitDef.forms ?? []) {
      ids.push(fid);
    }
    const list: FormDefinition[] = [];
    for (const formId of ids) {
      if (!formId || seen.has(formId)) continue;
      seen.add(formId);
      const f = this.gameRegistry.forms[formId];
      if (f) list.push(f);
    }
    return list;
  }

  private renderUi(): void {
    const unitIds = Object.keys(this.gameRegistry.units);
    const shipIds = ['going_merry', 'thousand_sunny', 'marine_warship', 'sea_king'];
    const isShip = this.uiState.selectedTargetKey.startsWith('ship:');
    const unitId = isShip ? 'luffy' : this.uiState.selectedTargetKey.replace('unit:', '');
    const unitDef = this.gameRegistry.units[unitId] ?? this.gameRegistry.units['luffy'];
    const forms = isShip ? [] : this.getAvailableFormsForUnit(unitDef);
    if (
      !isShip &&
      this.uiState.selectedFormId !== 'base' &&
      !forms.some((f) => f.id === this.uiState.selectedFormId)
    ) {
      this.uiState.selectedFormId = 'base';
    }

    const activeFormDef =
      !isShip && this.uiState.selectedFormId !== 'base'
        ? this.gameRegistry.forms[this.uiState.selectedFormId] ?? null
        : null;

    let spriteSourceBadge = 'BAKED_FALLBACK';
    let spriteMetaText = '';
    if (isShip) {
      const shipId = this.uiState.selectedTargetKey.replace('ship:', '');
      const resolved = this.assets.getOrCreateShipSpriteSheet(shipId);
      spriteSourceBadge = resolved.source;
      if (resolved.entry) {
        spriteMetaText = `${resolved.entry.key} · ${resolved.entry.frameWidth}x${resolved.entry.frameHeight} · public/${resolved.entry.src}`;
      }
    } else if (unitDef) {
      const resolved = this.assets.getOrCreateUnitSpriteSheet(
        unitDef,
        this.uiState.selectedFormId === 'base' ? null : this.uiState.selectedFormId,
        activeFormDef
      );
      spriteSourceBadge = resolved.source;
      spriteMetaText = `${resolved.entry.key} · ${resolved.entry.frameWidth}x${resolved.entry.frameHeight} · anchor(${resolved.entry.anchor.x}, ${resolved.entry.anchor.y}) · public/${resolved.entry.src}`;
    }

    const biomeEntries = this.assets.manifestRegistry.tilesetsFile.biomes;
    const selectedBiome =
      this.assets.manifestRegistry.biomesById[this.uiState.selectedBiomeId] ??
      biomeEntries[0];
    if (selectedBiome) {
      this.assets.getOrCreateBiomeTileset(selectedBiome);
    }
    const biomeSourceBadge = selectedBiome
      ? this.assets.resolver.getSourceStatus(`tileset_${selectedBiome.biomeId}`) ??
        'BAKED_FALLBACK'
      : 'BAKED_FALLBACK';

    this.uiState.slicerBodyHtml =
      this.uiState.activeTab === 'SLICER' ? this.slicerCtrl.buildHtml() : undefined;

    this.overlayEl.innerHTML = buildAssetPreviewHtml({
      state: this.uiState,
      unitIds,
      shipIds,
      isShip,
      forms,
      spriteMetaText,
      spriteSourceBadge,
      biomeSourceBadge,
      gameRegistry: this.gameRegistry,
      assets: this.assets,
      audio: this.audio
    });

    this.previewCanvas = this.overlayEl.querySelector(
      '#ap-preview-canvas'
    ) as HTMLCanvasElement | null;

    this.bindEvents();
    if (this.uiState.activeTab === 'SLICER') {
      this.slicerCtrl.bindEvents(this.overlayEl, () => this.renderUi());
    }
    this.renderPreviewCanvas();
  }

  private bindEvents(): void {
    this.overlayEl
      .querySelector('#btn-close-asset-preview')
      ?.addEventListener('click', () => this.close());

    this.overlayEl.querySelectorAll('[data-ap-tab]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const tab = (btn as HTMLElement).dataset.apTab as PreviewTab;
        if (tab) {
          this.uiState.activeTab = tab;
          this.audio.playSfxId('ui_move');
          this.renderUi();
        }
      });
    });

    this.overlayEl
      .querySelector('#ap-sel-target')
      ?.addEventListener('change', (e) => {
        this.uiState.selectedTargetKey = (e.target as HTMLSelectElement).value;
        this.uiState.selectedFormId = 'base';
        this.renderUi();
      });

    this.overlayEl
      .querySelector('#ap-sel-form')
      ?.addEventListener('change', (e) => {
        this.uiState.selectedFormId = (e.target as HTMLSelectElement).value;
        this.renderUi();
      });

    this.overlayEl
      .querySelector('#ap-sel-anim')
      ?.addEventListener('change', (e) => {
        this.uiState.selectedAnim = (e.target as HTMLSelectElement)
          .value as SpriteAnimState;
        this.renderUi();
      });

    this.overlayEl.querySelectorAll('[data-ap-zoom]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.uiState.zoomScale = Number((btn as HTMLElement).dataset.apZoom) as 1 | 2 | 3;
        this.renderUi();
      });
    });

    this.overlayEl.querySelector('#ap-chk-flash')?.addEventListener('change', (e) => {
      this.uiState.toggleHitFlash = (e.target as HTMLInputElement).checked;
    });
    this.overlayEl.querySelector('#ap-chk-armament')?.addEventListener('change', (e) => {
      this.uiState.toggleArmament = (e.target as HTMLInputElement).checked;
    });
    this.overlayEl.querySelector('#ap-chk-lunarian')?.addEventListener('change', (e) => {
      this.uiState.toggleLunarian = (e.target as HTMLInputElement).checked;
    });
    this.overlayEl.querySelector('#ap-chk-conqueror')?.addEventListener('change', (e) => {
      this.uiState.toggleConqueror = (e.target as HTMLInputElement).checked;
    });
    this.overlayEl.querySelector('#ap-sel-hagoromo')?.addEventListener('change', (e) => {
      this.uiState.toggleHagoromo = (e.target as HTMLSelectElement).value as
        | 'NONE'
        | 'WHITE'
        | 'BLACK';
    });

    this.overlayEl.querySelector('#ap-sel-biome')?.addEventListener('change', (e) => {
      this.uiState.selectedBiomeId = (e.target as HTMLSelectElement).value;
      this.renderUi();
    });

    this.overlayEl.querySelectorAll('[data-ap-bgm]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = (btn as HTMLElement).dataset.apBgm;
        if (!id) return;
        this.audio.unlock();
        await this.audio.playBgm(id, { forceRestart: true });
        this.renderUi();
      });
    });

    this.overlayEl.querySelector('#ap-btn-stop-bgm')?.addEventListener('click', () => {
      this.audio.stopBgm(0.15);
      this.renderUi();
    });

    this.overlayEl.querySelector('#ap-btn-break-filter')?.addEventListener('click', () => {
      this.audio.setBreakFilterActive(!this.audio.engine.isBreakFilterActive());
      this.renderUi();
    });

    this.overlayEl.querySelectorAll('[data-ap-sfx]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = (btn as HTMLElement).dataset.apSfx;
        if (!id) return;
        this.audio.unlock();
        const res = this.audio.playSfxId(id);
        this.uiState.lastSfxResultText = res.played
          ? `▶ [${res.sfxId}] 재생 완료 · 소스=${res.source} · 피치배율=${res.pitchMultiplier}x`
          : `⏸ [${res.sfxId}] 차단됨 (${res.reason})`;
        const el = this.overlayEl.querySelector('#ap-sfx-status');
        if (el) el.textContent = this.uiState.lastSfxResultText;
      });
    });

    this.overlayEl.querySelector('#ap-btn-burst-sfx')?.addEventListener('click', () => {
      this.audio.unlock();
      this.audio.engine.sfx.clearThrottleHistory();
      const baseNow = performance.now();
      let played = 0;
      let throttled = 0;
      const pitches: number[] = [];
      for (let i = 0; i < 6; i++) {
        const r = this.audio.engine.playSfxById('slash_light', baseNow + i * 4);
        if (r.played) {
          played += 1;
          pitches.push(r.pitchMultiplier);
        } else if (r.reason === 'THROTTLED') {
          throttled += 1;
        }
      }
      this.uiState.lastSfxResultText = `⚡ 6연타(24ms) 결과: 재생 ${played}회 / 스로틀 차단 ${throttled}회 (최대 3음) · 피치=[${pitches.join(', ')}]`;
      const el = this.overlayEl.querySelector('#ap-sfx-status');
      if (el) el.textContent = this.uiState.lastSfxResultText;
    });
  }

  private renderPreviewCanvas(): void {
    if (this.uiState.activeTab === 'SLICER') {
      this.slicerCtrl.renderCanvases(this.previewTick);
      return;
    }

    const canvas = this.previewCanvas;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (this.uiState.activeTab === 'SPRITE') {
      renderSpritePreviewCanvas(
        ctx,
        canvas.width,
        canvas.height,
        this.uiState,
        this.previewTick,
        this.gameRegistry,
        this.assets
      );
    } else if (this.uiState.activeTab === 'TILESET') {
      renderTilesetPreviewCanvas(
        ctx,
        canvas.width,
        canvas.height,
        this.uiState.selectedBiomeId,
        this.previewTick,
        this.assets
      );
    }
  }
}
