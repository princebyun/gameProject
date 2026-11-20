import type { AssetLoader } from '../../assets/assetLoader';
import {
  applyChromaKeyToCanvas,
  detectSpriteFramesAuto,
  resolveFrameSourceAndDestRect,
  type SpriteAtlasFrameRect,
  type SpriteSheetMetaJson
} from '../../assets/smartSpriteSheetLoader';
import type { AudioManager } from '../../audio/audioManager';
import type { DialogueEmotion } from '../../core/rpg/scriptSchema';
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

type PreviewTab = 'SPRITE' | 'SLICER' | 'TILESET' | 'AUDIO';

const PORTRAIT_EMOTIONS: DialogueEmotion[] = [
  'normal',
  'angry',
  'determined',
  'shocked',
  'smirk',
  'sad',
  'excited'
];

const SLICER_DEFAULT_ANIMS: SpriteAnimState[] = [
  'IDLE',
  'MOVE',
  'ATTACK_MELEE',
  'ATTACK_CAST',
  'CLASH',
  'DODGE',
  'TRANSFORM',
  'HIT',
  'DOWNED',
  'VICTORY'
];

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

  // Visual Sprite Slicer state
  private slicerRawImage: HTMLImageElement | HTMLCanvasElement | null = null;
  private slicerKeyedCanvas: HTMLCanvasElement | null = null;
  private slicerFileName = '';
  private slicerChromaEnabled = true;
  private slicerChromaTolerance = 24;
  private slicerMode: 'AUTO' | 'GRID' = 'AUTO';
  private slicerGridCols = 6;
  private slicerGridRows = 11;
  private slicerDetectedFrames: SpriteAtlasFrameRect[] = [];
  private slicerSelectedState: SpriteAnimState = 'IDLE';
  private slicerPivotX = 0.5;
  private slicerPivotY = 0.9;
  private slicerAssignments: Partial<Record<SpriteAnimState, SpriteAtlasFrameRect[]>> = {};
  private slicerStatusText =
    '로컬 도트 시트 PNG를 드래그&드롭하거나 파일을 선택하세요. (현재 캐릭터 시트를 샘플로 불러올 수도 있습니다)';
  private slicerCanvasScale = 1;
  private slicerSheetCanvas: HTMLCanvasElement | null = null;
  private slicerAnimCanvas: HTMLCanvasElement | null = null;

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

  private getCurrentResolvedSprite() {
    const isShip = this.selectedTargetKey.startsWith('ship:');
    if (isShip) {
      const shipId = this.selectedTargetKey.replace('ship:', '');
      const resolved = this.assets.getOrCreateShipSpriteSheet(shipId);
      return {
        isShip: true,
        unitDef: null as UnitDefinition | null,
        entry: resolved.entry,
        sheet: resolved.sheet,
        source: resolved.source,
        sheetFrameWidth: resolved.sheetFrameWidth,
        sheetFrameHeight: resolved.sheetFrameHeight,
        meta: null as SpriteSheetMetaJson | null
      };
    }

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
    return {
      isShip: false,
      unitDef,
      entry: resolved.entry,
      sheet: resolved.sheet,
      source: resolved.source,
      sheetFrameWidth: resolved.sheetFrameWidth,
      sheetFrameHeight: resolved.sheetFrameHeight,
      meta: resolved.meta
    };
  }

  private loadSlicerImageFile(file: File): void {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        this.slicerRawImage = img;
        this.slicerFileName = file.name;
        this.slicerAssignments = {};
        this.rebuildSlicerDetection();
        this.slicerStatusText = `로드 완료: ${file.name} (${img.naturalWidth}×${img.naturalHeight}px) · 탐지 프레임 ${this.slicerDetectedFrames.length}개`;
        this.renderUi();
      };
      img.onerror = () => {
        this.slicerStatusText = `❌ 이미지 로드 실패: ${file.name}`;
        this.renderUi();
      };
      img.src = String(reader.result);
    };
    reader.readAsDataURL(file);
  }

  private loadCurrentSpriteIntoSlicer(): void {
    const cur = this.getCurrentResolvedSprite();
    if (!cur.sheet) return;
    this.slicerRawImage = cur.sheet;
    this.slicerFileName = `${cur.entry?.key ?? 'sprite'}.png (현재 내장 시트)`;
    this.slicerChromaEnabled = false;
    this.slicerAssignments = {};
    this.rebuildSlicerDetection();
    this.slicerStatusText = `현재 시트 불러옴 (${this.slicerFileName}) · 탐지 프레임 ${this.slicerDetectedFrames.length}개`;
    this.renderUi();
  }

  private rebuildSlicerDetection(): void {
    if (!this.slicerRawImage) {
      this.slicerKeyedCanvas = null;
      this.slicerDetectedFrames = [];
      return;
    }

    const raw = this.slicerRawImage;
    const w =
      'naturalWidth' in raw ? raw.naturalWidth || raw.width : raw.width;
    const h =
      'naturalHeight' in raw ? raw.naturalHeight || raw.height : raw.height;

    if (this.slicerChromaEnabled) {
      this.slicerKeyedCanvas = applyChromaKeyToCanvas(raw, {
        tolerance: this.slicerChromaTolerance,
        force: true
      });
    } else {
      const c = document.createElement('canvas');
      c.width = w;
      c.height = h;
      const ctx = c.getContext('2d');
      if (ctx) {
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(raw, 0, 0);
      }
      this.slicerKeyedCanvas = c;
    }

    if (!this.slicerKeyedCanvas) return;

    if (this.slicerMode === 'AUTO') {
      const ctx = this.slicerKeyedCanvas.getContext('2d');
      if (ctx) {
        const imgData = ctx.getImageData(0, 0, w, h);
        this.slicerDetectedFrames = detectSpriteFramesAuto(
          imgData.data,
          w,
          h,
          12,
          16
        ).map((f) => ({
          ...f,
          pivotX: this.slicerPivotX,
          pivotY: this.slicerPivotY
        }));
      }
    } else {
      const cols = Math.max(1, this.slicerGridCols);
      const rows = Math.max(1, this.slicerGridRows);
      const cellW = Math.max(4, Math.floor(w / cols));
      const cellH = Math.max(4, Math.floor(h / rows));
      const list: SpriteAtlasFrameRect[] = [];
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          list.push({
            x: c * cellW,
            y: r * cellH,
            w: cellW,
            h: cellH,
            pivotX: this.slicerPivotX,
            pivotY: this.slicerPivotY
          });
        }
      }
      this.slicerDetectedFrames = list;
    }
  }

  private buildSlicerMetaJson(): SpriteSheetMetaJson {
    const animations: SpriteSheetMetaJson['animations'] = {};
    let maxH = 48;
    let maxW = 48;

    for (const [stateKey, frames] of Object.entries(this.slicerAssignments)) {
      if (!frames || frames.length === 0) continue;
      for (const fr of frames) {
        if (fr.w > maxW) maxW = fr.w;
        if (fr.h > maxH) maxH = fr.h;
      }
      const st = stateKey as SpriteAnimState;
      animations[st] = {
        fps: st === 'IDLE' ? 6 : st === 'MOVE' ? 10 : 12,
        loop: st === 'IDLE' || st === 'MOVE' || st === 'CLASH' || st === 'VICTORY',
        frames: frames.map((f) => ({
          ...f,
          pivotX: Number(this.slicerPivotX.toFixed(2)),
          pivotY: Number(this.slicerPivotY.toFixed(2))
        }))
      };
    }

    // Fallback: if user hasn't clicked individual frames yet, auto-seed IDLE from first 4 detected frames
    if (
      Object.keys(animations).length === 0 &&
      this.slicerDetectedFrames.length > 0
    ) {
      const seed = this.slicerDetectedFrames.slice(0, 4);
      maxW = Math.max(...seed.map((f) => f.w), 32);
      maxH = Math.max(...seed.map((f) => f.h), 32);
      animations.IDLE = {
        fps: 6,
        loop: true,
        frames: seed.map((f) => ({
          ...f,
          pivotX: Number(this.slicerPivotX.toFixed(2)),
          pivotY: Number(this.slicerPivotY.toFixed(2))
        }))
      };
    }

    return {
      version: '1.0.0',
      mode: 'atlas',
      chromaKey: {
        enabled: this.slicerChromaEnabled,
        tolerance: this.slicerChromaTolerance
      },
      frameWidth: maxW,
      frameHeight: maxH,
      animations
    };
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

    const curResolved = this.getCurrentResolvedSprite();
    const spriteSourceBadge = curResolved.source;
    const spriteMetaText = curResolved.entry
      ? `${curResolved.entry.key} · 논리 ${curResolved.entry.frameWidth}×${curResolved.entry.frameHeight} / 베이킹 ${curResolved.sheetFrameWidth}×${curResolved.sheetFrameHeight}px · ${curResolved.meta?.mode === 'atlas' ? 'ATLAS(.meta.json)' : 'GRID'} · public/${curResolved.entry.src}`
      : '';

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

    const assignedCountForState = (st: SpriteAnimState) =>
      this.slicerAssignments[st]?.length ?? 0;

    const unitFormEntries = this.assets.manifestRegistry.spritesFile.entries.filter(
      (e) => !e.key.startsWith('ship_')
    );
    let externalCount = 0;
    for (const e of unitFormEntries) {
      const status = this.assets.resolver.getSourceStatus(e.key);
      if (status === 'EXTERNAL_PNG' || this.assets.smartLoader.getMetaForKey(e.key)) {
        externalCount += 1;
      }
    }
    const fallbackCount = Math.max(0, unitFormEntries.length - externalCount);
    const extPct =
      unitFormEntries.length > 0
        ? ((externalCount / unitFormEntries.length) * 100).toFixed(1)
        : '0.0';

    this.overlayEl.innerHTML = `
      <div class="modal-card" style="max-width:960px;width:96%;max-height:92vh;overflow-y:auto;padding:16px;background:#0f172a;border:2px solid #38bdf8;color:#e2e8f0;font-family:monospace;">
        <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:1px solid #334155;padding-bottom:10px;margin-bottom:10px;gap:8px;flex-wrap:wrap;">
          <div>
            <h2 style="margin:0;font-size:16px;color:#fde047;">🎨 AssetPreviewScene — 2.5등신 도트 스프라이트 · 64×64 초상화 · 시트 슬라이서</h2>
            <div style="font-size:11px;color:#94a3b8;margin-top:2px;">외부 원피스 도트 PNG 원클릭 크로마키/슬라이싱 핫스왑 · 48/64/112px 정밀 셀셰이딩 검증</div>
          </div>
          <div style="display:flex;gap:8px;align-items:center;">
            <button id="btn-export-all-thumbnails" style="padding:6px 10px;background:#0f766e;color:#f0fdfa;border:1px solid #2dd4bf;border-radius:4px;cursor:pointer;font-weight:bold;font-size:11px;">📦 전체 썸네일 추출</button>
            <button id="btn-close-asset-preview" style="padding:6px 12px;background:#dc2626;color:#fff;border:none;border-radius:4px;cursor:pointer;font-weight:bold;">✕ 닫기</button>
          </div>
        </div>

        <div id="ap-progress-bar-box" style="background:#1e293b;border:1px solid #334155;border-radius:6px;padding:8px 10px;margin-bottom:10px;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;font-size:11px;">
          <div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap;">
            <span style="color:#fde047;font-weight:bold;">📊 외부 도트 고도화 진행률:</span>
            <span id="ap-ext-progress-count" style="padding:2px 8px;border-radius:999px;background:#166534;color:#bbf7d0;border:1px solid #4ade80;font-weight:bold;">EXTERNAL ${externalCount}</span>
            <span id="ap-fb-progress-count" style="padding:2px 8px;border-radius:999px;background:#78350f;color:#fde68a;border:1px solid #f59e0b;font-weight:bold;">FALLBACK ${fallbackCount}</span>
            <span style="color:#cbd5e1;">(${externalCount} / ${unitFormEntries.length} · ${extPct}%)</span>
          </div>
          <div style="flex:1;min-width:120px;max-width:220px;height:10px;background:#0f172a;border:1px solid #475569;border-radius:4px;overflow:hidden;">
            <div style="width:${extPct}%;height:100%;background:linear-gradient(90deg,#22c55e,#38bdf8);"></div>
          </div>
        </div>
        <div id="ap-export-toast" style="display:none;margin-bottom:10px;padding:6px 10px;background:#064e3b;border:1px solid #34d399;border-radius:4px;font-size:11px;color:#d1fae5;"></div>

        <div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap;">
          <button data-ap-tab="SPRITE" style="padding:6px 12px;cursor:pointer;border-radius:4px;font-weight:bold;border:1px solid #38bdf8;background:${this.activeTab === 'SPRITE' ? '#0284c7' : '#1e293b'};color:#fff;">
            🧍 스프라이트 & 초상화 (${this.assets.manifestRegistry.spritesFile.entries.length}종)
          </button>
          <button data-ap-tab="SLICER" style="padding:6px 12px;cursor:pointer;border-radius:4px;font-weight:bold;border:1px solid #f59e0b;background:${this.activeTab === 'SLICER' ? '#d97706' : '#1e293b'};color:#fff;">
            ✂ 시트 임포트 / 슬라이서
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
          <div style="display:grid;grid-template-columns:270px 1fr;gap:12px;">
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
              <canvas id="ap-preview-canvas" width="600" height="410" style="width:100%;height:auto;background:#0b1120;border:1px solid #1e293b;image-rendering:pixelated;"></canvas>
            </div>
          </div>
        `
            : this.activeTab === 'SLICER'
              ? `
          <div style="display:flex;flex-direction:column;gap:10px;font-size:12px;">
            <div id="ap-slicer-dropzone" style="border:2px dashed #f59e0b;background:#1e293b;border-radius:6px;padding:12px;display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:10px;">
              <div>
                <div style="font-weight:bold;color:#fde047;">📂 원피스 도트 스프라이트 시트 PNG 드래그 앤 드롭 (또는 파일 선택)</div>
                <div id="ap-slicer-status" style="font-size:11px;color:#cbd5e1;margin-top:3px;">${this.slicerStatusText}</div>
              </div>
              <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;">
                <label style="padding:6px 10px;background:#0284c7;color:#fff;border-radius:4px;cursor:pointer;font-weight:bold;">
                  📁 PNG 파일 열기
                  <input id="ap-slicer-file" type="file" accept="image/png,image/webp,image/gif" style="display:none;" />
                </label>
                <button id="ap-slicer-load-current" style="padding:6px 10px;background:#334155;color:#f8fafc;border:1px solid #64748b;border-radius:4px;cursor:pointer;font-weight:bold;">
                  🧪 현재 캐릭터 시트 테스트 로드
                </button>
              </div>
            </div>

            <div style="display:grid;grid-template-columns:280px 1fr;gap:12px;">
              <div style="background:#1e293b;padding:10px;border-radius:6px;display:flex;flex-direction:column;gap:8px;">
                <label>적용 대상 캐릭터:
                  <select id="ap-slicer-target" style="width:100%;margin-top:4px;padding:4px;background:#0f172a;color:#f8fafc;border:1px solid #475569;">
                    ${unitIds
                      .map((id) => {
                        const u = this.gameRegistry.units[id];
                        const val = `unit:${id}`;
                        return `<option value="${val}" ${this.selectedTargetKey === val ? 'selected' : ''}>${u.name} (${id})</option>`;
                      })
                      .join('')}
                  </select>
                </label>

                <label style="display:flex;align-items:center;gap:6px;cursor:pointer;">
                  <input type="checkbox" id="ap-slicer-chroma" ${this.slicerChromaEnabled ? 'checked' : ''} /> 자동 크로마키 배경 제거 ((0,0) 기준)
                </label>
                <label>크로마키 허용치 (${this.slicerChromaTolerance}):
                  <input type="range" id="ap-slicer-tol" min="4" max="80" value="${this.slicerChromaTolerance}" style="width:100%;" />
                </label>

                <div style="border-top:1px solid #334155;padding-top:6px;">
                  <div style="margin-bottom:4px;font-weight:bold;color:#38bdf8;">프레임 분할 방식:</div>
                  <div style="display:flex;gap:6px;">
                    <button data-slicer-mode="AUTO" style="flex:1;padding:4px;cursor:pointer;border:1px solid #38bdf8;background:${this.slicerMode === 'AUTO' ? '#0284c7' : '#0f172a'};color:#fff;">자동 바운딩박스</button>
                    <button data-slicer-mode="GRID" style="flex:1;padding:4px;cursor:pointer;border:1px solid #38bdf8;background:${this.slicerMode === 'GRID' ? '#0284c7' : '#0f172a'};color:#fff;">균일 격자</button>
                  </div>
                </div>

                ${
                  this.slicerMode === 'GRID'
                    ? `<div style="display:flex;gap:6px;">
                        <label style="flex:1;">가로 칸:<input id="ap-slicer-cols" type="number" min="1" max="32" value="${this.slicerGridCols}" style="width:100%;background:#0f172a;color:#fff;border:1px solid #475569;padding:3px;" /></label>
                        <label style="flex:1;">세로 줄:<input id="ap-slicer-rows" type="number" min="1" max="32" value="${this.slicerGridRows}" style="width:100%;background:#0f172a;color:#fff;border:1px solid #475569;padding:3px;" /></label>
                      </div>`
                    : ''
                }

                <div style="border-top:1px solid #334155;padding-top:6px;">
                  <label>할당할 애니메이션 상태 (시트 프레임 클릭):
                    <select id="ap-slicer-state" style="width:100%;margin-top:4px;padding:4px;background:#0f172a;color:#fde047;border:1px solid #f59e0b;font-weight:bold;">
                      ${SLICER_DEFAULT_ANIMS.map(
                        (st) =>
                          `<option value="${st}" ${this.slicerSelectedState === st ? 'selected' : ''}>${st} (${assignedCountForState(st)}프레임)</option>`
                      ).join('')}
                    </select>
                  </label>
                  <button id="ap-slicer-clear-state" style="width:100%;margin-top:6px;padding:4px;background:#7f1d1d;color:#fecaca;border:1px solid #ef4444;border-radius:4px;cursor:pointer;font-size:11px;">
                    🗑 ${this.slicerSelectedState} 할당 프레임 초기화
                  </button>
                </div>

                <div style="display:flex;gap:6px;">
                  <label style="flex:1;font-size:11px;">Pivot X (${this.slicerPivotX.toFixed(2)}):
                    <input type="range" id="ap-slicer-px" min="0.1" max="0.9" step="0.05" value="${this.slicerPivotX}" style="width:100%;" />
                  </label>
                  <label style="flex:1;font-size:11px;">Pivot Y (${this.slicerPivotY.toFixed(2)}):
                    <input type="range" id="ap-slicer-py" min="0.5" max="1.0" step="0.02" value="${this.slicerPivotY}" style="width:100%;" />
                  </label>
                </div>

                <div style="border-top:1px solid #334155;padding-top:8px;display:flex;flex-direction:column;gap:6px;">
                  <button id="ap-slicer-hotswap" style="padding:7px;background:#15803d;color:#fff;border:1px solid #4ade80;border-radius:4px;cursor:pointer;font-weight:bold;">
                    ⚡ 현재 캐릭터에 즉시 핫스왑 적용
                  </button>
                  <div style="display:flex;gap:6px;">
                    <button id="ap-slicer-copy" style="flex:1;padding:6px;background:#0369a1;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:11px;">📋 .meta.json 복사</button>
                    <button id="ap-slicer-download" style="flex:1;padding:6px;background:#4f46e5;color:#fff;border:none;border-radius:4px;cursor:pointer;font-size:11px;">💾 .meta.json 저장</button>
                  </div>
                </div>
              </div>

              <div style="display:flex;flex-direction:column;gap:10px;">
                <div style="background:#020617;padding:8px;border-radius:6px;border:1px solid #334155;">
                  <div style="display:flex;justify-content:space-between;font-size:11px;color:#94a3b8;margin-bottom:6px;">
                    <span>탐지된 프레임 (${this.slicerDetectedFrames.length}개) — 초록 박스를 클릭하면 [${this.slicerSelectedState}] 시퀀스에 추가됩니다</span>
                    <span>우클릭: 마지막 제거</span>
                  </div>
                  <div style="max-height:240px;overflow:auto;border:1px solid #1e293b;background:#0b1120;">
                    <canvas id="ap-slicer-sheet-canvas" width="580" height="220" style="display:block;cursor:crosshair;image-rendering:pixelated;"></canvas>
                  </div>
                </div>

                <div style="background:#020617;padding:8px;border-radius:6px;border:1px solid #334155;display:flex;align-items:center;gap:12px;">
                  <canvas id="ap-slicer-anim-canvas" width="200" height="140" style="background:#0b1120;border:1px solid #38bdf8;image-rendering:pixelated;flex-shrink:0;"></canvas>
                  <div style="font-size:11px;color:#cbd5e1;line-height:1.55;">
                    <div style="color:#fde047;font-weight:bold;">▶ 실시간 발밑 피벗(PivotY) 애니메이션 미리보기</div>
                    <div>• 선택 상태: <b>${this.slicerSelectedState}</b> (${assignedCountForState(this.slicerSelectedState)}프레임 할당됨)</div>
                    <div>• 십자선(청록)이 캐릭터 발바닥 접지점(pivotY=${this.slicerPivotY.toFixed(2)})입니다.</div>
                    <div>• 크기가 제각각인 공격/변신 프레임도 발 위치가 흔들리지 않게 자동 정렬됩니다.</div>
                    <div style="color:#94a3b8;margin-top:4px;">저장 경로: <code>public/assets/sprites/${curResolved.entry?.key ?? 'luffy_base'}.png</code> + <code>.meta.json</code></div>
                  </div>
                </div>
              </div>
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
    this.slicerSheetCanvas = this.overlayEl.querySelector(
      '#ap-slicer-sheet-canvas'
    ) as HTMLCanvasElement | null;
    this.slicerAnimCanvas = this.overlayEl.querySelector(
      '#ap-slicer-anim-canvas'
    ) as HTMLCanvasElement | null;

    this.bindEvents();
    this.renderPreviewCanvas();
  }

  private bindEvents(): void {
    this.overlayEl
      .querySelector('#btn-close-asset-preview')
      ?.addEventListener('click', () => this.close());

    this.overlayEl
      .querySelector('#btn-export-all-thumbnails')
      ?.addEventListener('click', () => this.exportBrowserContactSheet());

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

    // Slicer tab bindings
    const dropzone = this.overlayEl.querySelector('#ap-slicer-dropzone');
    if (dropzone) {
      dropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        (dropzone as HTMLElement).style.background = '#334155';
      });
      dropzone.addEventListener('dragleave', () => {
        (dropzone as HTMLElement).style.background = '#1e293b';
      });
      dropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        (dropzone as HTMLElement).style.background = '#1e293b';
        const file = (e as DragEvent).dataTransfer?.files?.[0];
        if (file) this.loadSlicerImageFile(file);
      });
    }

    this.overlayEl
      .querySelector('#ap-slicer-file')
      ?.addEventListener('change', (e) => {
        const file = (e.target as HTMLInputElement).files?.[0];
        if (file) this.loadSlicerImageFile(file);
      });

    this.overlayEl
      .querySelector('#ap-slicer-load-current')
      ?.addEventListener('click', () => this.loadCurrentSpriteIntoSlicer());

    this.overlayEl
      .querySelector('#ap-slicer-target')
      ?.addEventListener('change', (e) => {
        this.selectedTargetKey = (e.target as HTMLSelectElement).value;
        this.selectedFormId = 'base';
        this.renderUi();
      });

    this.overlayEl
      .querySelector('#ap-slicer-chroma')
      ?.addEventListener('change', (e) => {
        this.slicerChromaEnabled = (e.target as HTMLInputElement).checked;
        this.rebuildSlicerDetection();
        this.renderUi();
      });

    this.overlayEl
      .querySelector('#ap-slicer-tol')
      ?.addEventListener('input', (e) => {
        this.slicerChromaTolerance = Number((e.target as HTMLInputElement).value);
        this.rebuildSlicerDetection();
        this.renderSlicerCanvases();
      });

    this.overlayEl.querySelectorAll('[data-slicer-mode]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.slicerMode = (btn as HTMLElement).dataset.slicerMode as 'AUTO' | 'GRID';
        this.rebuildSlicerDetection();
        this.renderUi();
      });
    });

    this.overlayEl
      .querySelector('#ap-slicer-cols')
      ?.addEventListener('change', (e) => {
        this.slicerGridCols = Math.max(1, Number((e.target as HTMLInputElement).value));
        this.rebuildSlicerDetection();
        this.renderUi();
      });
    this.overlayEl
      .querySelector('#ap-slicer-rows')
      ?.addEventListener('change', (e) => {
        this.slicerGridRows = Math.max(1, Number((e.target as HTMLInputElement).value));
        this.rebuildSlicerDetection();
        this.renderUi();
      });

    this.overlayEl
      .querySelector('#ap-slicer-state')
      ?.addEventListener('change', (e) => {
        this.slicerSelectedState = (e.target as HTMLSelectElement)
          .value as SpriteAnimState;
        this.renderUi();
      });

    this.overlayEl
      .querySelector('#ap-slicer-clear-state')
      ?.addEventListener('click', () => {
        delete this.slicerAssignments[this.slicerSelectedState];
        this.renderUi();
      });

    this.overlayEl
      .querySelector('#ap-slicer-px')
      ?.addEventListener('input', (e) => {
        this.slicerPivotX = Number((e.target as HTMLInputElement).value);
        this.renderSlicerCanvases();
      });
    this.overlayEl
      .querySelector('#ap-slicer-py')
      ?.addEventListener('input', (e) => {
        this.slicerPivotY = Number((e.target as HTMLInputElement).value);
        this.renderSlicerCanvases();
      });

    if (this.slicerSheetCanvas) {
      this.slicerSheetCanvas.addEventListener('click', (e) => {
        if (!this.slicerSheetCanvas) return;
        const rect = this.slicerSheetCanvas.getBoundingClientRect();
        const cx = ((e.clientX - rect.left) * (this.slicerSheetCanvas.width / rect.width)) / this.slicerCanvasScale;
        const cy = ((e.clientY - rect.top) * (this.slicerSheetCanvas.height / rect.height)) / this.slicerCanvasScale;
        const hit = this.slicerDetectedFrames.find(
          (f) => cx >= f.x && cx <= f.x + f.w && cy >= f.y && cy <= f.y + f.h
        );
        if (hit) {
          const list = this.slicerAssignments[this.slicerSelectedState] ?? [];
          list.push({
            ...hit,
            pivotX: this.slicerPivotX,
            pivotY: this.slicerPivotY
          });
          this.slicerAssignments[this.slicerSelectedState] = list;
          this.audio.playSfxId('ui_confirm');
          this.renderUi();
        }
      });

      this.slicerSheetCanvas.addEventListener('contextmenu', (e) => {
        e.preventDefault();
        const list = this.slicerAssignments[this.slicerSelectedState];
        if (list && list.length > 0) {
          list.pop();
          this.renderUi();
        }
      });
    }

    this.overlayEl
      .querySelector('#ap-slicer-hotswap')
      ?.addEventListener('click', () => {
        if (!this.slicerKeyedCanvas) {
          this.slicerStatusText = '⚠ 먼저 PNG 스프라이트 시트를 로드하세요.';
          this.renderUi();
          return;
        }
        const cur = this.getCurrentResolvedSprite();
        const key = cur.entry?.key ?? 'luffy_base';
        const meta = this.buildSlicerMetaJson();
        this.assets.smartLoader.registerRuntimeOverride(
          key,
          this.slicerKeyedCanvas,
          meta
        );
        this.slicerStatusText = `✅ [${key}] 런타임 핫스왑 완료! 게임 내 전투/섬/스프라이트 뷰어에 즉시 반영되었습니다.`;
        this.audio.playSfxId('ui_confirm');
        this.renderUi();
      });

    this.overlayEl
      .querySelector('#ap-slicer-copy')
      ?.addEventListener('click', async () => {
        const json = JSON.stringify(this.buildSlicerMetaJson(), null, 2);
        try {
          await navigator.clipboard.writeText(json);
          this.slicerStatusText = '📋 .meta.json이 클립보드에 복사되었습니다!';
        } catch {
          this.slicerStatusText = '⚠ 클립보드 권한 없음 — 다운로드를 이용하세요.';
        }
        const st = this.overlayEl.querySelector('#ap-slicer-status');
        if (st) st.textContent = this.slicerStatusText;
      });

    this.overlayEl
      .querySelector('#ap-slicer-download')
      ?.addEventListener('click', () => {
        const cur = this.getCurrentResolvedSprite();
        const key = cur.entry?.key ?? 'sprite_sheet';
        const json = JSON.stringify(this.buildSlicerMetaJson(), null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${key}.meta.json`;
        a.click();
        URL.revokeObjectURL(url);
        this.slicerStatusText = `💾 ${key}.meta.json 다운로드 완료!`;
        const st = this.overlayEl.querySelector('#ap-slicer-status');
        if (st) st.textContent = this.slicerStatusText;
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

  private exportBrowserContactSheet(): void {
    const entries = this.assets.manifestRegistry.spritesFile.entries.filter(
      (e) => !e.key.startsWith('ship_')
    );
    const cols = 10;
    const rows = Math.ceil(entries.length / cols);
    const cellW = 140;
    const cellH = 160;
    const headerH = 34;

    const canvas = document.createElement('canvas');
    canvas.width = cols * cellW + 12;
    canvas.height = headerH + rows * cellH + 12;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#0b1120';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    let extCount = 0;
    const resolvedItems = entries.map((entry) => {
      const uid = entry.unitId ?? '';
      const fid = entry.formId ?? 'base';
      const unitDef = uid ? this.gameRegistry.units[uid] : undefined;
      const formDef = fid !== 'base' ? this.gameRegistry.forms[fid] ?? null : null;
      const res = unitDef
        ? this.assets.getOrCreateUnitSpriteSheet(
            unitDef,
            fid === 'base' ? null : fid,
            formDef
          )
        : null;
      if (res?.source === 'EXTERNAL_PNG') extCount += 1;
      return { entry, res };
    });

    ctx.fillStyle = '#172540';
    ctx.fillRect(0, 0, canvas.width, headerH);
    ctx.font = 'bold 13px monospace';
    ctx.fillStyle = '#fde047';
    ctx.fillText(
      `ONE PIECE GRAND VOYAGE — Contact Sheet (${entries.length} Units/Forms | EXTERNAL: ${extCount} / FALLBACK: ${entries.length - extCount})`,
      12,
      22
    );

    resolvedItems.forEach(({ entry, res }, idx) => {
      const c = idx % cols;
      const r = Math.floor(idx / cols);
      const x0 = 6 + c * cellW;
      const y0 = headerH + 6 + r * cellH;
      const isExt = res?.source === 'EXTERNAL_PNG';

      ctx.fillStyle = '#0f172a';
      ctx.fillRect(x0 + 2, y0 + 2, cellW - 4, cellH - 4);
      ctx.strokeStyle = isExt ? '#4ade80' : '#475569';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x0 + 2, y0 + 2, cellW - 4, cellH - 4);

      if (res?.sheet) {
        const rects = resolveFrameSourceAndDestRect(
          res.entry,
          res.meta,
          'IDLE',
          0,
          0,
          res.sheetFrameWidth,
          res.sheetFrameHeight,
          1
        );
        ctx.drawImage(
          res.sheet,
          rects.srcX,
          rects.srcY,
          rects.srcW,
          rects.srcH,
          x0 + 14,
          y0 + 8,
          112,
          112
        );
      }

      ctx.font = 'bold 9px monospace';
      ctx.fillStyle = '#f8fafc';
      ctx.fillText(
        entry.key.length > 20 ? `${entry.key.slice(0, 19)}…` : entry.key,
        x0 + 6,
        y0 + 134
      );
      ctx.fillStyle = isExt ? '#4ade80' : '#fbbf24';
      ctx.fillText(isExt ? 'EXTERNAL' : 'FALLBACK', x0 + 6, y0 + 148);
    });

    const url = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = 'contact_sheet.png';
    a.click();

    const toast = this.overlayEl.querySelector('#ap-export-toast') as HTMLElement | null;
    if (toast) {
      toast.style.display = 'block';
      toast.textContent = `✅ contact_sheet.png 다운로드 완료 (${entries.length}종 · EXTERNAL ${extCount} / FALLBACK ${entries.length - extCount}). 개별 128×128 투명/크로마키 썸네일 + prompt_pack.md 추출은 터미널에서 \`npm run export:thumbnails\` 를 실행하세요.`;
    }
    this.audio.playSfxId('ui_confirm');
  }

  private renderPreviewCanvas(): void {
    if (this.activeTab === 'SLICER') {
      this.renderSlicerCanvases();
      return;
    }

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

  private renderSlicerCanvases(): void {
    // 1. Sheet canvas with auto-detected bounding boxes & assigned badges
    if (this.slicerSheetCanvas) {
      const sc = this.slicerSheetCanvas;
      const ctx = sc.getContext('2d');
      if (ctx) {
        if (this.slicerKeyedCanvas) {
          const kw = this.slicerKeyedCanvas.width;
          const kh = this.slicerKeyedCanvas.height;
          this.slicerCanvasScale = kw < 280 ? 2 : 1;
          const targetW = Math.max(580, Math.round(kw * this.slicerCanvasScale));
          const targetH = Math.max(220, Math.round(kh * this.slicerCanvasScale));
          if (sc.width !== targetW || sc.height !== targetH) {
            sc.width = targetW;
            sc.height = targetH;
          }
        }
        ctx.imageSmoothingEnabled = false;
        // Checkerboard background
        for (let y = 0; y < sc.height; y += 12) {
          for (let x = 0; x < sc.width; x += 12) {
            ctx.fillStyle = ((x / 12 + y / 12) & 1) === 0 ? '#0f172a' : '#1e293b';
            ctx.fillRect(x, y, 12, 12);
          }
        }

        if (this.slicerKeyedCanvas) {
          const s = this.slicerCanvasScale;
          ctx.drawImage(
            this.slicerKeyedCanvas,
            0,
            0,
            this.slicerKeyedCanvas.width * s,
            this.slicerKeyedCanvas.height * s
          );

          const activeAssigned = this.slicerAssignments[this.slicerSelectedState] ?? [];
          for (const fr of this.slicerDetectedFrames) {
            const idx = activeAssigned.findIndex(
              (a) => a.x === fr.x && a.y === fr.y && a.w === fr.w && a.h === fr.h
            );
            ctx.strokeStyle = idx >= 0 ? '#fde047' : 'rgba(74, 222, 128, 0.78)';
            ctx.lineWidth = idx >= 0 ? 2 : 1;
            ctx.strokeRect(fr.x * s, fr.y * s, fr.w * s, fr.h * s);
            if (idx >= 0) {
              ctx.fillStyle = '#ca8a04';
              ctx.fillRect(fr.x * s, fr.y * s, 18, 12);
              ctx.font = 'bold 9px monospace';
              ctx.fillStyle = '#ffffff';
              ctx.fillText(`#${idx + 1}`, fr.x * s + 2, fr.y * s + 9);
            }
          }
        } else {
          ctx.font = 'bold 12px monospace';
          ctx.fillStyle = '#94a3b8';
          ctx.textAlign = 'center';
          ctx.fillText(
            'PNG 시트를 드래그&드롭하거나 [현재 캐릭터 시트 테스트 로드]를 클릭하세요',
            sc.width * 0.5,
            sc.height * 0.5
          );
          ctx.textAlign = 'left';
        }
      }
    }

    // 2. Live foot-pivot animation preview canvas
    if (this.slicerAnimCanvas) {
      const ac = this.slicerAnimCanvas;
      const ctx = ac.getContext('2d');
      if (ctx) {
        ctx.imageSmoothingEnabled = false;
        ctx.fillStyle = '#0b1120';
        ctx.fillRect(0, 0, ac.width, ac.height);

        const cx = Math.round(ac.width * 0.5);
        const footY = Math.round(ac.height * 0.84);

        // Foot pivot ground line & crosshair
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.45)';
        ctx.beginPath();
        ctx.moveTo(0, footY);
        ctx.lineTo(ac.width, footY);
        ctx.moveTo(cx, 0);
        ctx.lineTo(cx, ac.height);
        ctx.stroke();

        const frames =
          this.slicerAssignments[this.slicerSelectedState]?.length
            ? this.slicerAssignments[this.slicerSelectedState]!
            : this.slicerDetectedFrames.slice(0, 4);

        if (this.slicerKeyedCanvas && frames.length > 0) {
          const idx = Math.floor((this.previewTick / 60) * 7) % frames.length;
          const fr = frames[idx];
          const maxDim = Math.max(fr.w, fr.h, 24);
          const scale = Math.min(2.5, Math.max(1, Math.floor(88 / maxDim)));
          const dw = Math.round(fr.w * scale);
          const dh = Math.round(fr.h * scale);
          const dx = Math.round(cx - dw * this.slicerPivotX);
          const dy = Math.round(footY - dh * this.slicerPivotY);
          ctx.drawImage(
            this.slicerKeyedCanvas,
            fr.x,
            fr.y,
            fr.w,
            fr.h,
            dx,
            dy,
            dw,
            dh
          );
          ctx.font = '10px monospace';
          ctx.fillStyle = '#fde047';
          ctx.fillText(`${this.slicerSelectedState} ${idx + 1}/${frames.length}`, 6, 14);
        }
      }
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

    const resolved = this.getCurrentResolvedSprite();
    const { sheet: sheetImg, entry, sheetFrameWidth, sheetFrameHeight, meta, unitDef } =
      resolved;
    if (!sheetImg || !entry) return;

    const clip = entry.animations[this.selectedAnim];
    const atlasCount =
      meta?.mode === 'atlas' && meta.animations[this.selectedAnim]?.frames.length
        ? meta.animations[this.selectedAnim]!.frames.length
        : clip.frames;
    const frameIdx =
      Math.floor((this.previewTick / 60) * clip.fps) % Math.max(1, atlasCount);

    const cx = Math.round(w * 0.5);
    const cy = Math.round(h * 0.44);
    const rects = resolveFrameSourceAndDestRect(
      entry,
      meta,
      this.selectedAnim,
      clip.row,
      frameIdx,
      sheetFrameWidth,
      sheetFrameHeight,
      this.zoomScale * 1.4
    );
    const drawX = cx + rects.destX;
    const drawY = cy + rects.destY;
    const drawW = rects.destW;
    const drawH = rects.destH;

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
      const tinted = this.assets.spriteController.effectCache.getOrCreateEffectRect(
        entry.key,
        sheetImg,
        rects.srcX,
        rects.srcY,
        rects.srcW,
        rects.srcH,
        effectKind
      );
      if (tinted) {
        ctx.drawImage(tinted, drawX, drawY, drawW, drawH);
      }
    } else {
      ctx.drawImage(
        sheetImg,
        rects.srcX,
        rects.srcY,
        rects.srcW,
        rects.srcH,
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

    // Foot anchor crosshair
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx - 8, cy);
    ctx.lineTo(cx + 8, cy);
    ctx.moveTo(cx, cy - 8);
    ctx.lineTo(cx, cy + 8);
    ctx.stroke();

    // 1) Frame strip inspection row
    const stripY = h - 166;
    ctx.fillStyle = 'rgba(2, 6, 23, 0.88)';
    ctx.fillRect(0, stripY - 14, w, 82);
    ctx.font = '11px monospace';
    ctx.fillStyle = '#94a3b8';
    ctx.fillText(
      `State: ${this.selectedAnim} (Row ${clip.row}) · Frame ${frameIdx + 1}/${atlasCount} · ${clip.fps} FPS · Baked ${sheetFrameWidth}×${sheetFrameHeight}px`,
      12,
      stripY - 2
    );

    const thumbSize = 54;
    for (let f = 0; f < Math.min(8, atlasCount); f++) {
      const tx = 14 + f * (thumbSize + 10);
      const ty = stripY + 6;
      ctx.strokeStyle = f === frameIdx ? '#fde047' : '#334155';
      ctx.lineWidth = f === frameIdx ? 2 : 1;
      ctx.strokeRect(tx, ty, thumbSize, thumbSize);
      const fr = resolveFrameSourceAndDestRect(
        entry,
        meta,
        this.selectedAnim,
        clip.row,
        f,
        sheetFrameWidth,
        sheetFrameHeight,
        1
      );
      ctx.drawImage(
        sheetImg,
        fr.srcX,
        fr.srcY,
        fr.srcW,
        fr.srcH,
        tx,
        ty,
        thumbSize,
        thumbSize
      );
    }

    // 2) 64×64 7-Emotion Portrait Strip along bottom
    const pStripY = h - 82;
    ctx.fillStyle = 'rgba(9, 13, 24, 0.94)';
    ctx.fillRect(0, pStripY, w, 82);
    ctx.font = '10px monospace';
    ctx.fillStyle = '#fde047';
    ctx.fillText(
      '64×64 전용 대화 초상화 (7종 감정: normal / angry / determined / shocked / smirk / sad / excited)',
      12,
      pStripY + 12
    );

    if (unitDef) {
      const pSize = 56;
      const gap = 22;
      PORTRAIT_EMOTIONS.forEach((emo, i) => {
        const px = 14 + i * (pSize + gap);
        const py = pStripY + 18;
        const pRes = this.assets.getOrCreateUnitPortrait(
          unitDef,
          emo,
          this.selectedFormId === 'base' ? null : this.selectedFormId
        );
        ctx.strokeStyle = '#475569';
        ctx.lineWidth = 1;
        ctx.strokeRect(px, py, pSize, pSize);
        if (pRes.image) {
          ctx.drawImage(pRes.image, px, py, pSize, pSize);
        }
        ctx.font = '9px monospace';
        ctx.fillStyle = '#cbd5e1';
        ctx.textAlign = 'center';
        ctx.fillText(emo, px + pSize * 0.5, py + pSize + 8);
        ctx.textAlign = 'left';
      });
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
