import { analyzeIrregularSpriteSheet, createSyntheticIrregularTestSheet } from '../../assets/slicer/irregularSheetPipeline';
import {
  bboxContainsCenter,
  bboxIoU,
  DEFAULT_SLICER_OPTIONS,
  serializeRecipe,
  type BBox,
  type IrregularSheetRecipeV1,
  type RgbaSurface,
  type SlicerAnalysisResult
} from '../../assets/slicer/slicerTypes';
import type { GameDataRegistry } from '../../core/types/dataSchemas';
import type { SpriteAnimState } from '../../data/assets/types';
import { releaseOffscreenCanvas } from '../../render/canvasGpuDispose';
import { SlicerPreviewCanvases, type SheetViewTransform } from './slicerTabCanvas';
import {
  buildSlicerTabHtml,
  isValidAnimStateValue,
  type SlicerToolMode
} from './slicerTabDom';

function matchesBox(a: BBox, b: BBox): boolean {
  return bboxIoU(a, b) >= 0.4 || bboxContainsCenter(a, b) || bboxContainsCenter(b, a);
}

/**
 * Stateful interactive controller for the `AssetPreviewScene` Slicer tab.
 * Shares exact pixel analysis with `npm run import:pack` and exports `.recipe.json`.
 */
export class SlicerTabController {
  public unitId = 'luffy';
  public formId = 'base';
  public tolerance = DEFAULT_SLICER_OPTIONS.tolerance;
  public flipHorizontal = false;
  public toolMode: SlicerToolMode = 'TOGGLE_EXCLUDE';
  public previewRowIndex = 0;
  public selectedFrameIds: number[] = [];
  public activePivotFrameId: number | null = null;
  public isDraggingPivot = false;
  public rawSurface: RgbaSurface | null = null;
  public analysis: SlicerAnalysisResult | null = null;
  public statusMessage = '시트 PNG를 드롭하거나 [테스트용 비규격 시트 로드]를 클릭하세요.';

  private excludedBoxes: BBox[] = [];
  private restoredBoxes: BBox[] = [];
  private mergedGroups: BBox[][] = [];
  private rowStateOverrides: Record<string, SpriteAnimState> = {};
  private framePivotOverrides: Record<string, { pivotX: number; pivotY: number }> = {};

  private readonly canvases = new SlicerPreviewCanvases();
  private lastTransform: SheetViewTransform | null = null;
  private sheetCanvasEl: HTMLCanvasElement | null = null;
  private animCanvasEl: HTMLCanvasElement | null = null;

  constructor(private readonly gameRegistry: GameDataRegistry) {}

  public dispose(): void {
    this.canvases.dispose();
    this.sheetCanvasEl = null;
    this.animCanvasEl = null;
  }

  public buildHtml(): string {
    return buildSlicerTabHtml({
      unitId: this.unitId,
      formId: this.formId,
      tolerance: this.tolerance,
      flipHorizontal: this.flipHorizontal,
      toolMode: this.toolMode,
      previewRowIndex: this.previewRowIndex,
      selectedFrameIds: this.selectedFrameIds,
      activePivotFrameId: this.activePivotFrameId,
      statusMessage: this.statusMessage,
      analysis: this.analysis,
      gameRegistry: this.gameRegistry
    });
  }

  public loadSampleTestSheet(): SlicerAnalysisResult {
    return this.loadRawSurface(createSyntheticIrregularTestSheet(), '합성 NDS 테스트 시트 (320×260)');
  }

  public loadRawSurface(surface: RgbaSurface, label = '업로드 시트'): SlicerAnalysisResult {
    this.rawSurface = surface;
    this.excludedBoxes = [];
    this.restoredBoxes = [];
    this.mergedGroups = [];
    this.rowStateOverrides = {};
    this.framePivotOverrides = {};
    this.selectedFrameIds = [];
    this.activePivotFrameId = null;
    this.previewRowIndex = 0;
    this.reanalyze(`${label} 로드 완료`);
    return this.analysis!;
  }

  public reanalyze(prefix?: string): void {
    if (!this.rawSurface) return;
    const recipe = this.buildCurrentRecipe();
    this.analysis = analyzeIrregularSpriteSheet(
      this.rawSurface,
      { tolerance: this.tolerance, flipHorizontal: this.flipHorizontal },
      recipe
    );
    if (this.previewRowIndex >= this.analysis.rows.length) {
      this.previewRowIndex = 0;
    }
    this.statusMessage = `${prefix ? `${prefix} · ` : ''}채택 ${this.analysis.frames.length}프레임 (${this.analysis.rows.length}행) · 제외 ${this.analysis.excludedRegions.length}영역`;
  }

  public buildCurrentRecipe(): IrregularSheetRecipeV1 {
    return {
      version: 1,
      unitId: this.unitId,
      formId: this.formId,
      options: {
        tolerance: this.tolerance,
        flipHorizontal: this.flipHorizontal,
        scale: 1.0,
        paddingPx: 2,
        keepPortraits: false
      },
      excludedRegions: this.excludedBoxes.map((b) => ({ ...b })),
      restoredRegions: this.restoredBoxes.map((b) => ({ ...b })),
      mergedGroups: this.mergedGroups.map((g) => g.map((b) => ({ ...b }))),
      rowStateOverrides: { ...this.rowStateOverrides },
      framePivotOverrides: { ...this.framePivotOverrides }
    };
  }

  public handleSheetCanvasClick(canvasX: number, canvasY: number): boolean {
    if (!this.analysis || !this.lastTransform) return false;
    const sx = (canvasX - this.lastTransform.offsetX) / Math.max(0.01, this.lastTransform.scale);
    const sy = (canvasY - this.lastTransform.offsetY) / Math.max(0.01, this.lastTransform.scale);

    const hitFrame = this.analysis.frames.find(
      (f) => sx >= f.x && sx <= f.x + f.w && sy >= f.y && sy <= f.y + f.h
    );
    const hitExcluded = this.analysis.excludedRegions.find(
      (e) => sx >= e.x && sx <= e.x + e.w && sy >= e.y && sy <= e.y + e.h
    );

    if (this.toolMode === 'TOGGLE_EXCLUDE') {
      if (hitFrame) {
        const box: BBox = { x: hitFrame.x, y: hitFrame.y, w: hitFrame.w, h: hitFrame.h };
        this.restoredBoxes = this.restoredBoxes.filter((r) => !matchesBox(r, box));
        this.excludedBoxes.push(box);
        this.reanalyze(`프레임 #${hitFrame.id} 수동 제외`);
        return true;
      }
      if (hitExcluded) {
        const box: BBox = { x: hitExcluded.x, y: hitExcluded.y, w: hitExcluded.w, h: hitExcluded.h };
        this.excludedBoxes = this.excludedBoxes.filter((e) => !matchesBox(e, box));
        this.restoredBoxes.push(box);
        this.reanalyze(`제외 영역(${hitExcluded.reason}) 복구`);
        return true;
      }
      return false;
    }

    if (this.toolMode === 'MERGE' && hitFrame) {
      if (this.selectedFrameIds.includes(hitFrame.id)) {
        this.selectedFrameIds = this.selectedFrameIds.filter((id) => id !== hitFrame.id);
      } else {
        if (this.selectedFrameIds.length >= 2) this.selectedFrameIds.shift();
        this.selectedFrameIds.push(hitFrame.id);
      }
      this.statusMessage = `병합 대상 선택: ${this.selectedFrameIds.map((id) => `#${id}`).join(', ') || '없음'}`;
      return true;
    }

    if (this.toolMode === 'PIVOT_DRAG' && hitFrame) {
      this.activePivotFrameId = hitFrame.id;
      this.updateFramePivotAtSheetPoint(hitFrame.id, sx, sy);
      return true;
    }

    return false;
  }

  public mergeSelectedFrames(): boolean {
    if (!this.analysis || this.selectedFrameIds.length < 2) return false;
    const targets = this.selectedFrameIds
      .map((id) => this.analysis!.frames.find((f) => f.id === id))
      .filter((f): f is NonNullable<typeof f> => Boolean(f));
    if (targets.length < 2) return false;
    this.mergedGroups.push(targets.map((f) => ({ x: f.x, y: f.y, w: f.w, h: f.h })));
    this.selectedFrameIds = [];
    this.reanalyze('수동 2프레임 병합 완료');
    return true;
  }

  public setRowStateOverride(rowIndex: number, state: SpriteAnimState): void {
    this.rowStateOverrides[String(rowIndex)] = state;
    this.previewRowIndex = rowIndex;
    this.reanalyze(`Row ${rowIndex} → ${state} 지정`);
  }

  public updateFramePivotAtSheetPoint(frameId: number, sheetX: number, sheetY: number): boolean {
    if (!this.analysis) return false;
    const f = this.analysis.frames.find((item) => item.id === frameId);
    if (!f) return false;
    const nextPx = Math.max(0, Math.min(f.w - 1, Math.round(sheetX - f.x)));
    const nextPy = Math.max(0, Math.min(f.h - 1, Math.round(sheetY - f.y)));
    f.pivotX = nextPx;
    f.pivotY = nextPy;
    this.framePivotOverrides[`row_${f.rowIndex}_col_${f.colIndex}`] = { pivotX: nextPx, pivotY: nextPy };
    this.statusMessage = `프레임 #${f.id} 피벗 조정 → (${nextPx}, ${nextPy})`;
    return true;
  }

  public exportRecipeJson(): string {
    const json = serializeRecipe(this.buildCurrentRecipe());
    if (typeof document !== 'undefined' && typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${this.unitId}_${this.formId}.recipe.json`;
      a.click();
      URL.revokeObjectURL(url);
    }
    this.statusMessage = `레시피 내보내기 완료: ${this.unitId}_${this.formId}.recipe.json`;
    return json;
  }

  public bindEvents(overlayEl: HTMLElement, onRefreshDom: () => void): void {
    this.sheetCanvasEl = overlayEl.querySelector('#ap-slicer-sheet-canvas') as HTMLCanvasElement | null;
    this.animCanvasEl = overlayEl.querySelector('#ap-slicer-anim-canvas') as HTMLCanvasElement | null;

    overlayEl.querySelector('#ap-slicer-load-sample')?.addEventListener('click', () => {
      this.loadSampleTestSheet();
      onRefreshDom();
    });

    const fileInput = overlayEl.querySelector('#ap-slicer-file') as HTMLInputElement | null;
    fileInput?.addEventListener('change', () => {
      const file = fileInput.files?.[0];
      if (file) void this.decodeImageFile(file, onRefreshDom);
    });

    const dropzone = overlayEl.querySelector('#ap-slicer-dropzone') as HTMLElement | null;
    dropzone?.addEventListener('dragover', (e) => e.preventDefault());
    dropzone?.addEventListener('drop', (e) => {
      e.preventDefault();
      const file = e.dataTransfer?.files?.[0];
      if (file) void this.decodeImageFile(file, onRefreshDom);
    });

    const onSelectChange = (sel: string, apply: (v: string) => void) => {
      overlayEl.querySelector(sel)?.addEventListener('change', (e) => {
        apply((e.target as HTMLSelectElement).value);
        onRefreshDom();
      });
    };
    onSelectChange('#ap-slicer-unit', (v) => { this.unitId = v; this.formId = 'base'; });
    onSelectChange('#ap-slicer-form', (v) => { this.formId = v; });

    overlayEl.querySelector('#ap-slicer-tol')?.addEventListener('input', (e) => {
      this.tolerance = Number((e.target as HTMLInputElement).value);
      this.reanalyze('허용오차 재분석');
      onRefreshDom();
    });
    overlayEl.querySelector('#ap-slicer-flipx')?.addEventListener('change', (e) => {
      this.flipHorizontal = (e.target as HTMLInputElement).checked;
      this.reanalyze('좌우반전 정규화');
      onRefreshDom();
    });

    overlayEl.querySelectorAll('[data-slicer-tool]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const mode = (btn as HTMLElement).dataset.slicerTool as SlicerToolMode;
        if (mode) { this.toolMode = mode; onRefreshDom(); }
      });
    });
    overlayEl.querySelector('#ap-slicer-merge-selected')?.addEventListener('click', () => {
      if (this.mergeSelectedFrames()) onRefreshDom();
    });
    overlayEl.querySelector('#ap-slicer-reset')?.addEventListener('click', () => {
      if (this.rawSurface) { this.loadRawSurface(this.rawSurface, '초기화'); onRefreshDom(); }
    });
    overlayEl.querySelector('#ap-slicer-export-recipe')?.addEventListener('click', () => {
      this.exportRecipeJson();
      const stEl = overlayEl.querySelector('#ap-slicer-status');
      if (stEl) stEl.textContent = this.statusMessage;
    });
    overlayEl.querySelectorAll('[data-slicer-preview-row]').forEach((btn) => {
      btn.addEventListener('click', () => {
        this.previewRowIndex = Number((btn as HTMLElement).dataset.slicerPreviewRow ?? 0);
        onRefreshDom();
      });
    });
    overlayEl.querySelectorAll('[data-slicer-row-state]').forEach((sel) => {
      sel.addEventListener('change', (e) => {
        const idx = Number((sel as HTMLElement).dataset.slicerRowState ?? 0);
        const val = (e.target as HTMLSelectElement).value;
        if (isValidAnimStateValue(val)) { this.setRowStateOverride(idx, val); onRefreshDom(); }
      });
    });

    this.bindCanvasPointerEvents(overlayEl, onRefreshDom);
  }

  private bindCanvasPointerEvents(overlayEl: HTMLElement, onRefreshDom: () => void): void {
    const canvas = this.sheetCanvasEl;
    if (!canvas) return;
    const toLocal = (ev: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      return {
        x: (ev.clientX - rect.left) * (rect.width > 0 ? canvas.width / rect.width : 1),
        y: (ev.clientY - rect.top) * (rect.height > 0 ? canvas.height / rect.height : 1)
      };
    };
    const toSheet = (pt: { x: number; y: number }) => ({
      sx: (pt.x - (this.lastTransform?.offsetX ?? 0)) / Math.max(0.01, this.lastTransform?.scale ?? 1),
      sy: (pt.y - (this.lastTransform?.offsetY ?? 0)) / Math.max(0.01, this.lastTransform?.scale ?? 1)
    });

    canvas.addEventListener('mousedown', (ev) => {
      const pt = toLocal(ev);
      if (this.toolMode === 'PIVOT_DRAG' && this.analysis && this.lastTransform) {
        const { sx, sy } = toSheet(pt);
        const hit = this.analysis.frames.find((f) => sx >= f.x && sx <= f.x + f.w && sy >= f.y && sy <= f.y + f.h);
        if (hit) {
          this.activePivotFrameId = hit.id;
          this.isDraggingPivot = true;
          this.updateFramePivotAtSheetPoint(hit.id, sx, sy);
        }
      } else if (this.handleSheetCanvasClick(pt.x, pt.y)) {
        onRefreshDom();
      }
    });
    canvas.addEventListener('mousemove', (ev) => {
      if (!this.isDraggingPivot || this.activePivotFrameId === null || !this.lastTransform) return;
      const { sx, sy } = toSheet(toLocal(ev));
      this.updateFramePivotAtSheetPoint(this.activePivotFrameId, sx, sy);
      const stEl = overlayEl.querySelector('#ap-slicer-status');
      if (stEl) stEl.textContent = this.statusMessage;
    });
    canvas.addEventListener('mouseup', () => { this.isDraggingPivot = false; });
  }

  public renderCanvases(tick: number): void {
    const sctx = this.sheetCanvasEl?.getContext('2d');
    if (this.sheetCanvasEl && sctx) {
      this.lastTransform = this.canvases.renderSheetOverlay(
        sctx, this.sheetCanvasEl.width, this.sheetCanvasEl.height,
        this.rawSurface, this.analysis, this.selectedFrameIds, this.activePivotFrameId
      );
    }
    const actx = this.animCanvasEl?.getContext('2d');
    if (this.animCanvasEl && actx) {
      this.canvases.renderAnimationPreview(
        actx, this.animCanvasEl.width, this.animCanvasEl.height,
        this.analysis, this.previewRowIndex, tick, this.flipHorizontal
      );
    }
  }

  private async decodeImageFile(file: File, onDone: () => void): Promise<void> {
    if (typeof document === 'undefined') return;
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('Image decode failed'));
        img.src = url;
      });
      const tmp = document.createElement('canvas');
      tmp.width = img.width;
      tmp.height = img.height;
      const tctx = tmp.getContext('2d');
      if (tctx) {
        tctx.drawImage(img, 0, 0);
        const imgData = tctx.getImageData(0, 0, img.width, img.height);
        this.loadRawSurface(
          { width: img.width, height: img.height, data: new Uint8ClampedArray(imgData.data) },
          file.name
        );
      }
      releaseOffscreenCanvas(tmp);
      onDone();
    } catch {
      this.statusMessage = `이미지 디코딩 실패: ${file.name}`;
      onDone();
    } finally {
      URL.revokeObjectURL(url);
    }
  }
}
