import type { AssetLoader } from '../../assets/assetLoader';
import type { AudioManager } from '../../audio/audioManager';
import type {
  FormDefinition,
  GameDataRegistry,
  UnitDefinition
} from '../../core/types/dataSchemas';
import {
  STANDARD_SPRITE_ANIM_STATES,
  type SpriteAnimState
} from '../../data/assets/types';

export interface AssetPreviewCallbacks {
  onClose: () => void;
}

type PreviewTab = 'SPRITE' | 'TILESET' | 'AUDIO';

export class AssetPreviewScene {
  private overlayEl: HTMLElement;
  private isOpen = false;
  private activeTab: PreviewTab = 'SPRITE';

  // Sprite preview controls state
  private selectedTargetKey = 'unit:luffy';
  private selectedFormId = 'base';
  private selectedAnim: SpriteAnimState = 'IDLE';
  private zoomScale: 1 | 2 | 3 = 2;
  private toggleHitFlash = false;
  private toggleArmament = false;
  private toggleHagoromo: 'NONE' | 'WHITE' | 'BLACK' = 'NONE';
  private toggleLunarian = false;
  private toggleConqueror = false;

  // Tileset preview state
  private selectedBiomeId = 'wano_castle';

  // Audio preview state
  private lastSfxResultText = 'SFX 버튼을 클릭해 테스트하세요.';

  // Canvas & animation loop
  private previewCanvas: HTMLCanvasElement | null = null;
  private rafId: number | null = null;
  private previewTick = 0;

  constructor(
    private readonly rootEl: HTMLElement,
    private readonly gameRegistry: GameDataRegistry,
    private readonly assets: AssetLoader,
    private readonly audio: AudioManager,
    private readonly callbacks: AssetPreviewCallbacks
  ) {
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
    const isShip = this.selectedTargetKey.startsWith('ship:');
    const unitId = isShip ? 'luffy' : this.selectedTargetKey.replace('unit:', '');
    const unitDef = this.gameRegistry.units[unitId] ?? this.gameRegistry.units['luffy'];
    const forms = isShip ? [] : this.getAvailableFormsForUnit(unitDef);
    if (
      !isShip &&
      this.selectedFormId !== 'base' &&
      !forms.some((f) => f.id === this.selectedFormId)
    ) {
      this.selectedFormId = 'base';
    }

    const activeFormDef =
      !isShip && this.selectedFormId !== 'base'
        ? this.gameRegistry.forms[this.selectedFormId] ?? null
        : null;

    let spriteSourceBadge = 'BAKED_FALLBACK';
    let spriteMetaText = '';
    if (isShip) {
      const shipId = this.selectedTargetKey.replace('ship:', '');
      const resolved = this.assets.getOrCreateShipSpriteSheet(shipId);
      spriteSourceBadge = resolved.source;
      if (resolved.entry) {
        spriteMetaText = `${resolved.entry.key} · ${resolved.entry.frameWidth}x${resolved.entry.frameHeight} · public/${resolved.entry.src}`;
      }
    } else if (unitDef) {
      const resolved = this.assets.getOrCreateUnitSpriteSheet(
        unitDef,
        this.selectedFormId === 'base' ? null : this.selectedFormId,
        activeFormDef
      );
      spriteSourceBadge = resolved.source;
      spriteMetaText = `${resolved.entry.key} · ${resolved.entry.frameWidth}x${resolved.entry.frameHeight} · anchor(${resolved.entry.anchor.x}, ${resolved.entry.anchor.y}) · public/${resolved.entry.src}`;
    }

    const biomeEntries = this.assets.manifestRegistry.tilesetsFile.biomes;
    const selectedBiome =
      this.assets.manifestRegistry.biomesById[this.selectedBiomeId] ??
      biomeEntries[0];
    this.assets.getOrCreateBiomeTileset(selectedBiome);
    const biomeSourceBadge =
      this.assets.resolver.getSourceStatus(`tileset_${selectedBiome.biomeId}`) ??
      'BAKED_FALLBACK';

    const bgmTracks = this.assets.manifestRegistry.audioFile.bgmTracks;
    const sfxEntries = this.assets.manifestRegistry.audioFile.sfxEntries;
    const currentBgmId = this.audio.getCurrentBgmId();
    const breakFilterOn = this.audio.engine.isBreakFilterActive();

    const badgeColor = (source: string) =>
      source.startsWith('EXTERNAL')
        ? 'background:#166534;color:#bbf7d0;border:1px solid #4ade80;'
        : 'background:#78350f;color:#fde68a;border:1px solid #f59e0b;';

    this.overlayEl.innerHTML = `
      <div class="modal-card" style="max-width:920px;width:95%;max-height:92vh;overflow-y:auto;padding:16px;background:#0f172a;border:2px solid #38bdf8;color:#e2e8f0;font-family:monospace;">
        <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #334155;padding-bottom:10px;margin-bottom:12px;">
          <div>
            <h2 style="margin:0;font-size:16px;color:#fde047;">🎨 AssetPreviewScene — 도트 스프라이트 · 바이옴 타일셋 · 레트로 오디오 뷰어</h2>
            <div style="font-size:11px;color:#94a3b8;margin-top:2px;">외부 에셋(public/assets/) 자동 핫스왑 & 오프스크린 베이킹/칩튠 폴백 실시간 검증</div>
          </div>
          <button id="btn-close-asset-preview" style="padding:6px 12px;background:#dc2626;color:#fff;border:none;border-radius:4px;cursor:pointer;font-weight:bold;">✕ 닫기</button>
        </div>

        <div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap;">
          <button data-ap-tab="SPRITE" style="padding:6px 12px;cursor:pointer;border-radius:4px;font-weight:bold;border:1px solid #38bdf8;background:${this.activeTab === 'SPRITE' ? '#0284c7' : '#1e293b'};color:#fff;">
            🧍 스프라이트 & 11상태 (${this.assets.manifestRegistry.spritesFile.entries.length}종)
          </button>
          <button data-ap-tab="TILESET" style="padding:6px 12px;cursor:pointer;border-radius:4px;font-weight:bold;border:1px solid #38bdf8;background:${this.activeTab === 'TILESET' ? '#0284c7' : '#1e293b'};color:#fff;">
            🗺 바이옴 타일셋 (${biomeEntries.length}종)
          </button>
          <button data-ap-tab="AUDIO" style="padding:6px 12px;cursor:pointer;border-radius:4px;font-weight:bold;border:1px solid #38bdf8;background:${this.activeTab === 'AUDIO' ? '#0284c7' : '#1e293b'};color:#fff;">
            🎵 레트로 BGM(${bgmTracks.length}) · SFX(${sfxEntries.length})
          </button>
        </div>

        ${
          this.activeTab === 'SPRITE'
            ? `
          <div style="display:grid;grid-template-columns:280px 1fr;gap:12px;">
            <div style="background:#1e293b;padding:10px;border-radius:6px;display:flex;flex-direction:column;gap:8px;font-size:12px;">
              <label>캐릭터 / 선박 선택:
                <select id="ap-sel-target" style="width:100%;margin-top:4px;padding:4px;background:#0f172a;color:#f8fafc;border:1px solid #475569;">
                  <optgroup label="캐릭터 / 보스 (${unitIds.length}종)">
                    ${unitIds
                      .map((id) => {
                        const u = this.gameRegistry.units[id];
                        const val = `unit:${id}`;
                        return `<option value="${val}" ${this.selectedTargetKey === val ? 'selected' : ''}>${u.name} (${id})</option>`;
                      })
                      .join('')}
                  </optgroup>
                  <optgroup label="선박 (${shipIds.length}종)">
                    ${shipIds
                      .map((sid) => {
                        const val = `ship:${sid}`;
                        return `<option value="${val}" ${this.selectedTargetKey === val ? 'selected' : ''}>🚢 ${sid}</option>`;
                      })
                      .join('')}
                  </optgroup>
                </select>
              </label>

              ${
                !isShip
                  ? `<label>변신 / 각성 폼:
                      <select id="ap-sel-form" style="width:100%;margin-top:4px;padding:4px;background:#0f172a;color:#f8fafc;border:1px solid #475569;">
                        <option value="base" ${this.selectedFormId === 'base' ? 'selected' : ''}>기본 폼 (base)</option>
                        ${forms
                          .map(
                            (f) =>
                              `<option value="${f.id}" ${this.selectedFormId === f.id ? 'selected' : ''}>${f.name} (${f.id})</option>`
                          )
                          .join('')}
                      </select>
                    </label>`
                  : ''
              }

              <label>애니메이션 상태 (11종):
                <select id="ap-sel-anim" style="width:100%;margin-top:4px;padding:4px;background:#0f172a;color:#f8fafc;border:1px solid #475569;">
                  ${STANDARD_SPRITE_ANIM_STATES.map(
                    (st, idx) =>
                      `<option value="${st}" ${this.selectedAnim === st ? 'selected' : ''}>Row ${idx}: ${st}</option>`
                  ).join('')}
                </select>
              </label>

              <div>
                <div style="margin-bottom:4px;">픽셀 배율:</div>
                <div style="display:flex;gap:6px;">
                  ${([1, 2, 3] as const)
                    .map(
                      (z) =>
                        `<button data-ap-zoom="${z}" style="flex:1;padding:4px;cursor:pointer;border:1px solid #64748b;background:${this.zoomScale === z ? '#0ea5e9' : '#0f172a'};color:#fff;font-weight:bold;">${z}x</button>`
                    )
                    .join('')}
                </div>
              </div>

              <div style="border-top:1px solid #334155;padding-top:8px;display:flex;flex-direction:column;gap:6px;">
                <label style="display:flex;align-items:center;gap:6px;cursor:pointer;">
                  <input type="checkbox" id="ap-chk-flash" ${this.toggleHitFlash ? 'checked' : ''} /> 피격 80ms 백색 플래시
                </label>
                <label style="display:flex;align-items:center;gap:6px;cursor:pointer;">
                  <input type="checkbox" id="ap-chk-armament" ${this.toggleArmament ? 'checked' : ''} /> 무장색 패기 흑화
                </label>
                <label style="display:flex;align-items:center;gap:6px;cursor:pointer;">
                  <input type="checkbox" id="ap-chk-lunarian" ${this.toggleLunarian ? 'checked' : ''} /> 루나리아 등 불꽃
                </label>
                <label style="display:flex;align-items:center;gap:6px;cursor:pointer;">
                  <input type="checkbox" id="ap-chk-conqueror" ${this.toggleConqueror ? 'checked' : ''} /> 패왕색 검붉은 번개
                </label>
                <label>동물계 각성 구름 띠:
                  <select id="ap-sel-hagoromo" style="width:100%;margin-top:4px;padding:4px;background:#0f172a;color:#f8fafc;border:1px solid #475569;">
                    <option value="NONE" ${this.toggleHagoromo === 'NONE' ? 'selected' : ''}>없음</option>
                    <option value="WHITE" ${this.toggleHagoromo === 'WHITE' ? 'selected' : ''}>흰색 구름 띠 (기어 5 / 니카)</option>
                    <option value="BLACK" ${this.toggleHagoromo === 'BLACK' ? 'selected' : ''}>검은 구름 띠 (각성 루치 / 오로성)</option>
                  </select>
                </label>
              </div>
            </div>

            <div style="background:#020617;padding:10px;border-radius:6px;border:1px solid #334155;display:flex;flex-direction:column;gap:8px;">
              <div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:6px;">
                <span style="font-size:11px;color:#cbd5e1;">${spriteMetaText}</span>
                <span id="ap-sprite-source-badge" style="font-size:11px;padding:2px 8px;border-radius:999px;font-weight:bold;${badgeColor(spriteSourceBadge)}">${spriteSourceBadge}</span>
              </div>
              <canvas id="ap-preview-canvas" width="560" height="340" style="width:100%;height:auto;background:#0b1120;border:1px solid #1e293b;image-rendering:pixelated;"></canvas>
            </div>
          </div>
        `
            : this.activeTab === 'TILESET'
              ? `
          <div style="display:flex;flex-direction:column;gap:10px;">
            <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;background:#1e293b;padding:10px;border-radius:6px;">
              <label style="font-size:12px;">바이옴 선택 (${biomeEntries.length}종):
                <select id="ap-sel-biome" style="margin-left:8px;padding:4px 8px;background:#0f172a;color:#f8fafc;border:1px solid #475569;">
                  ${biomeEntries
                    .map(
                      (b) =>
                        `<option value="${b.biomeId}" ${this.selectedBiomeId === b.biomeId ? 'selected' : ''}>[${b.category}] ${b.name} (${b.biomeId})</option>`
                    )
                    .join('')}
                </select>
              </label>
              <div style="display:flex;align-items:center;gap:8px;">
                <span style="font-size:11px;color:#94a3b8;">public/${selectedBiome.src} (${selectedBiome.tileSize}px × ${selectedBiome.renderScale}x)</span>
                <span id="ap-tileset-source-badge" style="font-size:11px;padding:2px 8px;border-radius:999px;font-weight:bold;${badgeColor(biomeSourceBadge)}">${biomeSourceBadge}</span>
              </div>
            </div>
            <canvas id="ap-preview-canvas" width="840" height="360" style="width:100%;height:auto;background:#0b1120;border:1px solid #334155;image-rendering:pixelated;"></canvas>
          </div>
        `
              : `
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;">
            <div style="background:#1e293b;padding:10px;border-radius:6px;">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
                <strong style="color:#fde047;">🎵 BGM 트랙 (${bgmTracks.length}종)</strong>
                <div style="display:flex;gap:6px;">
                  <button id="ap-btn-break-filter" style="padding:3px 8px;font-size:11px;cursor:pointer;border:1px solid #a855f7;background:${breakFilterOn ? '#7e22ce' : '#0f172a'};color:#fff;">
                    브레이크 로우패스: ${breakFilterOn ? 'ON' : 'OFF'}
                  </button>
                  <button id="ap-btn-stop-bgm" style="padding:3px 8px;font-size:11px;cursor:pointer;border:1px solid #ef4444;background:#7f1d1d;color:#fff;">■ 정지</button>
                </div>
              </div>
              <div style="display:flex;flex-direction:column;gap:6px;max-height:320px;overflow-y:auto;">
                ${bgmTracks
                  .map((t) => {
                    const isPlaying = currentBgmId === t.id;
                    const srcKind = this.audio.engine.getBgmSourceStatus(t.id);
                    return `
                      <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 8px;background:${isPlaying ? '#172554' : '#0f172a'};border:1px solid ${isPlaying ? '#38bdf8' : '#334155'};border-radius:4px;font-size:11px;">
                        <div>
                          <div style="font-weight:bold;color:#f8fafc;">${t.name}</div>
                          <div style="color:#94a3b8;">${t.id} · ${t.bpm} BPM · loop ${t.loopStartSec}s–${t.loopEndSec}s</div>
                        </div>
                        <div style="display:flex;align-items:center;gap:6px;">
                          <span style="font-size:10px;padding:1px 6px;border-radius:999px;${badgeColor(srcKind)}">${srcKind}</span>
                          <button data-ap-bgm="${t.id}" style="padding:4px 8px;cursor:pointer;background:#0284c7;color:#fff;border:none;border-radius:4px;">▶ 재생</button>
                        </div>
                      </div>
                    `;
                  })
                  .join('')}
              </div>
            </div>

            <div style="background:#1e293b;padding:10px;border-radius:6px;">
              <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
                <strong style="color:#38bdf8;">🔊 표준 SFX (${sfxEntries.length}종)</strong>
                <button id="ap-btn-burst-sfx" style="padding:3px 8px;font-size:11px;cursor:pointer;border:1px solid #f59e0b;background:#92400e;color:#fff;">
                  ⚡ 50ms 다단히트 스로틀 테스트
                </button>
              </div>
              <div id="ap-sfx-status" style="font-size:11px;color:#a7f3d0;background:#0f172a;padding:6px 8px;border-radius:4px;margin-bottom:8px;border:1px solid #334155;">
                ${this.lastSfxResultText}
              </div>
              <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;max-height:285px;overflow-y:auto;">
                ${sfxEntries
                  .map((s) => {
                    const srcKind = this.audio.engine.sfx.getSourceStatus(s.id);
                    return `
                      <button data-ap-sfx="${s.id}" style="text-align:left;padding:6px 8px;cursor:pointer;background:#0f172a;color:#e2e8f0;border:1px solid #334155;border-radius:4px;font-size:11px;">
                        <div style="font-weight:bold;color:#fde047;">▶ ${s.name}</div>
                        <div style="font-size:10px;color:#94a3b8;display:flex;justify-content:space-between;margin-top:2px;">
                          <span>${s.id}</span>
                          <span>${srcKind === 'EXTERNAL_OGG' ? 'OGG' : 'SYNTH'}</span>
                        </div>
                      </button>
                    `;
                  })
                  .join('')}
              </div>
            </div>
          </div>
        `
        }
      </div>
    `;

    this.previewCanvas = this.overlayEl.querySelector(
      '#ap-preview-canvas'
    ) as HTMLCanvasElement | null;

    this.bindEvents();
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
          this.activeTab = tab;
          this.audio.playSfxId('ui_move');
          this.renderUi();
        }
      });
    });

    // Sprite tab bindings
    this.overlayEl
      .querySelector('#ap-sel-target')
      ?.addEventListener('change', (e) => {
        this.selectedTargetKey = (e.target as HTMLSelectElement).value;
        this.selectedFormId = 'base';
        this.renderUi();
      });

    this.overlayEl
      .querySelector('#ap-sel-form')
      ?.addEventListener('change', (e) => {
        this.selectedFormId = (e.target as HTMLSelectElement).value;
        this.renderUi();
      });

    this.overlayEl
      .querySelector('#ap-sel-anim')
      ?.addEventListener('change', (e) => {
        this.selectedAnim = (e.target as HTMLSelectElement)
          .value as SpriteAnimState;
        this.renderUi();
      });

    this.overlayEl.querySelectorAll('[data-ap-zoom]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const z = Number((btn as HTMLElement).dataset.apZoom) as 1 | 2 | 3;
        this.zoomScale = z;
        this.renderUi();
      });
    });

    this.overlayEl
      .querySelector('#ap-chk-flash')
      ?.addEventListener('change', (e) => {
        this.toggleHitFlash = (e.target as HTMLInputElement).checked;
      });
    this.overlayEl
      .querySelector('#ap-chk-armament')
      ?.addEventListener('change', (e) => {
        this.toggleArmament = (e.target as HTMLInputElement).checked;
      });
    this.overlayEl
      .querySelector('#ap-chk-lunarian')
      ?.addEventListener('change', (e) => {
        this.toggleLunarian = (e.target as HTMLInputElement).checked;
      });
    this.overlayEl
      .querySelector('#ap-chk-conqueror')
      ?.addEventListener('change', (e) => {
        this.toggleConqueror = (e.target as HTMLInputElement).checked;
      });
    this.overlayEl
      .querySelector('#ap-sel-hagoromo')
      ?.addEventListener('change', (e) => {
        this.toggleHagoromo = (e.target as HTMLSelectElement).value as
          | 'NONE'
          | 'WHITE'
          | 'BLACK';
      });

    // Tileset tab bindings
    this.overlayEl
      .querySelector('#ap-sel-biome')
      ?.addEventListener('change', (e) => {
        this.selectedBiomeId = (e.target as HTMLSelectElement).value;
        this.renderUi();
      });

    // Audio tab bindings
    this.overlayEl.querySelectorAll('[data-ap-bgm]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = (btn as HTMLElement).dataset.apBgm;
        if (!id) return;
        this.audio.unlock();
        await this.audio.playBgm(id, { forceRestart: true });
        this.renderUi();
      });
    });

    this.overlayEl
      .querySelector('#ap-btn-stop-bgm')
      ?.addEventListener('click', () => {
        this.audio.stopBgm(0.15);
        this.renderUi();
      });

    this.overlayEl
      .querySelector('#ap-btn-break-filter')
      ?.addEventListener('click', () => {
        this.audio.setBreakFilterActive(!this.audio.engine.isBreakFilterActive());
        this.renderUi();
      });

    this.overlayEl.querySelectorAll('[data-ap-sfx]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = (btn as HTMLElement).dataset.apSfx;
        if (!id) return;
        this.audio.unlock();
        const res = this.audio.playSfxId(id);
        this.lastSfxResultText = res.played
          ? `▶ [${res.sfxId}] 재생 완료 · 소스=${res.source} · 피치배율=${res.pitchMultiplier}x`
          : `⏸ [${res.sfxId}] 차단됨 (${res.reason})`;
        const el = this.overlayEl.querySelector('#ap-sfx-status');
        if (el) el.textContent = this.lastSfxResultText;
      });
    });

    this.overlayEl
      .querySelector('#ap-btn-burst-sfx')
      ?.addEventListener('click', () => {
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
        this.lastSfxResultText = `⚡ 6연타(24ms) 결과: 재생 ${played}회 / 스로틀 차단 ${throttled}회 (최대 3음) · 피치=[${pitches.join(', ')}]`;
        const el = this.overlayEl.querySelector('#ap-sfx-status');
        if (el) el.textContent = this.lastSfxResultText;
      });
  }

  private renderPreviewCanvas(): void {
    const canvas = this.previewCanvas;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (this.activeTab === 'SPRITE') {
      this.renderSpritePreview(ctx, canvas.width, canvas.height);
    } else if (this.activeTab === 'TILESET') {
      this.renderTilesetPreview(ctx, canvas.width, canvas.height);
    }
  }

  private renderSpritePreview(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number
  ): void {
    // Pixel checkerboard backdrop
    const cell = 16;
    for (let y = 0; y < h; y += cell) {
      for (let x = 0; x < w; x += cell) {
        ctx.fillStyle =
          ((x / cell + y / cell) & 1) === 0 ? '#0f172a' : '#162033';
        ctx.fillRect(x, y, cell, cell);
      }
    }

    const isShip = this.selectedTargetKey.startsWith('ship:');
    let sheetImg: HTMLCanvasElement | HTMLImageElement | null = null;
    let entry;

    if (isShip) {
      const shipId = this.selectedTargetKey.replace('ship:', '');
      const resolved = this.assets.getOrCreateShipSpriteSheet(shipId);
      sheetImg = resolved.sheet;
      entry = resolved.entry;
    } else {
      const unitId = this.selectedTargetKey.replace('unit:', '');
      const unitDef =
        this.gameRegistry.units[unitId] ?? this.gameRegistry.units['luffy'];
      const formDef =
        this.selectedFormId !== 'base'
          ? this.gameRegistry.forms[this.selectedFormId] ?? null
          : null;
      const resolved = this.assets.getOrCreateUnitSpriteSheet(
        unitDef,
        this.selectedFormId === 'base' ? null : this.selectedFormId,
        formDef
      );
      sheetImg = resolved.sheet;
      entry = resolved.entry;
    }

    if (!sheetImg || !entry) return;

    const clip = entry.animations[this.selectedAnim];
    const frameIdx =
      Math.floor((this.previewTick / 60) * clip.fps) % Math.max(1, clip.frames);

    const cx = Math.round(w * 0.5);
    const cy = Math.round(h * 0.48);
    const drawW = entry.frameWidth * this.zoomScale;
    const drawH = entry.frameHeight * this.zoomScale;
    const drawX = Math.round(cx - drawW * entry.anchor.x);
    const drawY = Math.round(cy - drawH * entry.anchor.y);

    // Back-layer Hagoromo / Lunarian Flame
    if (this.toggleLunarian) {
      ctx.save();
      const pulse = 0.8 + Math.sin(this.previewTick * 0.25) * 0.2;
      ctx.fillStyle = `rgba(249, 115, 22, ${0.72 * pulse})`;
      ctx.beginPath();
      ctx.arc(cx, drawY + drawH * 0.3, Math.round(drawW * 0.22), 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#fef08a';
      ctx.beginPath();
      ctx.arc(cx, drawY + drawH * 0.3, Math.round(drawW * 0.11), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    if (this.toggleHagoromo !== 'NONE') {
      ctx.save();
      ctx.strokeStyle =
        this.toggleHagoromo === 'WHITE'
          ? 'rgba(248, 250, 252, 0.92)'
          : 'rgba(15, 23, 42, 0.92)';
      ctx.lineWidth = Math.max(4, Math.round(drawW * 0.08));
      const sway = Math.sin(this.previewTick * 0.12) * 6;
      ctx.beginPath();
      ctx.arc(cx, drawY + drawH * 0.38 + sway * 0.3, drawW * 0.42, Math.PI * 0.95, Math.PI * 2.05);
      ctx.stroke();
      ctx.restore();
    }

    // Apply offscreen tint cache when Hit Flash or Armament Blackening is toggled
    const effectKind = this.toggleHitFlash
      ? 'WHITE_FLASH'
      : this.toggleArmament
        ? 'ARMAMENT_BLACK'
        : null;

    if (effectKind) {
      const tinted = this.assets.spriteController.effectCache.getOrCreateEffectFrame(
        entry.key,
        sheetImg,
        clip.row,
        frameIdx,
        entry.frameWidth,
        entry.frameHeight,
        effectKind
      );
      if (tinted) {
        ctx.drawImage(tinted, drawX, drawY, drawW, drawH);
      }
    } else {
      ctx.drawImage(
        sheetImg,
        frameIdx * entry.frameWidth,
        clip.row * entry.frameHeight,
        entry.frameWidth,
        entry.frameHeight,
        drawX,
        drawY,
        drawW,
        drawH
      );
    }

    // Front-layer Conqueror's Haki crimson-black lightning
    if (this.toggleConqueror) {
      ctx.save();
      for (let i = 0; i < 4; i++) {
        const angle = (this.previewTick * 0.11 + i * 1.57) % (Math.PI * 2);
        const r1 = drawW * 0.28;
        const r2 = drawW * 0.62;
        const x1 = cx + Math.cos(angle) * r1;
        const y1 = cy - drawH * 0.35 + Math.sin(angle) * r1;
        const x2 = cx + Math.cos(angle + 0.35) * r2;
        const y2 = cy - drawH * 0.35 + Math.sin(angle + 0.35) * r2;
        ctx.strokeStyle = '#dc2626';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo((x1 + x2) * 0.5 + 4, (y1 + y2) * 0.5 - 5);
        ctx.lineTo(x2, y2);
        ctx.stroke();
        ctx.strokeStyle = '#09090b';
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
      ctx.restore();
    }

    // Anchor crosshairs + frame strip indicator at bottom
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx - 8, cy);
    ctx.lineTo(cx + 8, cy);
    ctx.moveTo(cx, cy - 8);
    ctx.lineTo(cx, cy + 8);
    ctx.stroke();

    // Draw full row strip along bottom for frame inspection
    const stripY = h - 78;
    ctx.fillStyle = 'rgba(2, 6, 23, 0.85)';
    ctx.fillRect(0, stripY - 14, w, 92);
    ctx.font = '11px monospace';
    ctx.fillStyle = '#94a3b8';
    ctx.fillText(
      `State: ${this.selectedAnim} (Row ${clip.row}) · Frame ${frameIdx + 1}/${clip.frames} · ${clip.fps} FPS · loop=${clip.loop}${clip.hitFrame !== undefined ? ` · hitFrame=${clip.hitFrame}` : ''}`,
      12,
      stripY - 2
    );

    const thumbSize = 56;
    for (let f = 0; f < clip.frames; f++) {
      const tx = 14 + f * (thumbSize + 10);
      const ty = stripY + 8;
      ctx.strokeStyle = f === frameIdx ? '#fde047' : '#334155';
      ctx.lineWidth = f === frameIdx ? 2 : 1;
      ctx.strokeRect(tx, ty, thumbSize, thumbSize);
      ctx.drawImage(
        sheetImg,
        f * entry.frameWidth,
        clip.row * entry.frameHeight,
        entry.frameWidth,
        entry.frameHeight,
        tx,
        ty,
        thumbSize,
        thumbSize
      );
    }
  }

  private renderTilesetPreview(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number
  ): void {
    const biome =
      this.assets.manifestRegistry.biomesById[this.selectedBiomeId] ??
      this.assets.manifestRegistry.tilesetsFile.biomes[0];

    // Live autotile biome preview on top 220px
    const sampleObstacles = [
      { x: 96, y: 64, width: 96, height: 64 },
      { x: 480, y: 48, width: 128, height: 96 }
    ];
    this.assets.tilemapRenderer.renderBiomeBackdrop(
      ctx,
      `preview_${biome.biomeId}`,
      w,
      224,
      0,
      0,
      w,
      224,
      biome,
      this.assets,
      this.previewTick,
      sampleObstacles,
      biome.category === 'SEA' ? undefined : { minY: 160, maxY: 192 }
    );

    // Raw 16x4 tile atlas inspection panel on bottom
    const panelY = 232;
    ctx.fillStyle = '#020617';
    ctx.fillRect(0, panelY, w, h - panelY);
    ctx.font = 'bold 11px monospace';
    ctx.fillStyle = '#fde047';
    ctx.fillText(
      `Raw 16×16 Tile Atlas (Row 0: 16 Autotiles | Row 1: 4-Frame Anim | Row 2: Walls | Row 3: Decor) — ${biome.name}`,
      12,
      panelY + 16
    );

    const atlas = this.assets.getOrCreateBiomeTileset(biome);
    if (atlas) {
      ctx.drawImage(atlas, 12, panelY + 24, 512, 128);
      ctx.strokeStyle = '#38bdf8';
      ctx.strokeRect(12, panelY + 24, 512, 128);
    }
  }
}
