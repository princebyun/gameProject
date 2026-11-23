import { describe, expect, it } from 'vitest';
import { defaultDataRegistry } from '../../src/data/dataRegistry';
import { analyzeIrregularSpriteSheet } from '../../src/assets/slicer/irregularSheetPipeline';
import { normalizeRecipe } from '../../src/assets/slicer/slicerTypes';
import { computeSheetViewTransform } from '../../src/scenes/dev/slicerTabCanvas';
import { SlicerTabController } from '../../src/scenes/dev/slicerTabController';

function makeCanvasStub() {
  const ops: string[] = [];
  const ctx = {
    imageSmoothingEnabled: false,
    fillStyle: '#000',
    strokeStyle: '#000',
    lineWidth: 1,
    font: '10px monospace',
    clearRect: () => ops.push('clearRect'),
    fillRect: () => ops.push('fillRect'),
    strokeRect: () => ops.push('strokeRect'),
    fillText: () => ops.push('fillText'),
    beginPath: () => ops.push('beginPath'),
    moveTo: () => ops.push('moveTo'),
    lineTo: () => ops.push('lineTo'),
    stroke: () => ops.push('stroke'),
    save: () => ops.push('save'),
    restore: () => ops.push('restore'),
    translate: () => ops.push('translate'),
    scale: () => ops.push('scale'),
    drawImage: () => ops.push('drawImage'),
    createImageData: (w: number, h: number) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) }),
    putImageData: () => ops.push('putImageData')
  };
  return {
    ops,
    canvas: {
      width: 420,
      height: 320,
      getContext: (kind: string) => (kind === '2d' ? ctx : null)
    }
  };
}

function withMockSlicerDocument<T>(fn: (createdCanvases: { width: number; height: number }[]) => T): T {
  const prevDoc = (globalThis as { document?: unknown }).document;
  const createdCanvases: { width: number; height: number }[] = [];
  (globalThis as { document?: unknown }).document = {
    createElement: (tag: string) => {
      if (tag === 'canvas') {
        const stub = makeCanvasStub().canvas;
        createdCanvases.push(stub);
        return stub;
      }
      return { href: '', download: '', click: () => {} };
    }
  };
  try {
    return fn(createdCanvases);
  } finally {
    if (prevDoc === undefined) {
      delete (globalThis as { document?: unknown }).document;
    } else {
      (globalThis as { document?: unknown }).document = prevDoc;
    }
  }
}

describe('AssetPreviewScene Slicer Tab Interactive UI & Recipe Roundtrip (Step 2)', () => {
  it('supports sample loading, exclude/restore toggle, merge, row state assignment, pivot drag, canvas preview, and .recipe.json roundtrip', () => {
    withMockSlicerDocument((canvases) => {
      const ctrl = new SlicerTabController(defaultDataRegistry);
      const initial = ctrl.loadSampleTestSheet();
      expect(initial.frames.length).toBe(6);

      // HTML builder renders Slicer controls & 11-state dropdowns cleanly
      const html = ctrl.buildHtml();
      expect(html).toContain('ap-slicer-sheet-canvas');
      expect(html).toContain('ap-slicer-anim-canvas');
      expect(html).toContain('ap-slicer-export-recipe');
      expect(html).toContain('data-slicer-row-state="0"');

      // Attach stub canvases and render debug overlay + footline animation preview
      const sheetStub = makeCanvasStub();
      const animStub = makeCanvasStub();
      animStub.canvas.width = 220;
      animStub.canvas.height = 220;
      (ctrl as unknown as { sheetCanvasEl: unknown }).sheetCanvasEl = sheetStub.canvas;
      (ctrl as unknown as { animCanvasEl: unknown }).animCanvasEl = animStub.canvas;
      ctrl.renderCanvases(15);

      expect(sheetStub.ops.includes('strokeRect')).toBe(true);
      expect(animStub.ops.includes('drawImage')).toBe(true);

      // Map sheet coordinates through live SheetViewTransform to click frame #1
      const f1 = ctrl.analysis!.frames[0]!;
      const tf = computeSheetViewTransform(initial.rawWidth, initial.rawHeight, 420, 320);
      const clickX = tf.offsetX + (f1.x + f1.w * 0.5) * tf.scale;
      const clickY = tf.offsetY + (f1.y + f1.h * 0.5) * tf.scale;

      // 1. Toggle exclude on Frame #1
      ctrl.toolMode = 'TOGGLE_EXCLUDE';
      expect(ctrl.handleSheetCanvasClick(clickX, clickY)).toBe(true);
      expect(ctrl.analysis!.frames.length).toBe(5);

      // 2. Click same region again to restore Frame #1
      expect(ctrl.handleSheetCanvasClick(clickX, clickY)).toBe(true);
      expect(ctrl.analysis!.frames.length).toBe(6);

      // 3. Merge two frames manually
      ctrl.toolMode = 'MERGE';
      const fa = ctrl.analysis!.frames[0]!;
      const fb = ctrl.analysis!.frames[1]!;
      ctrl.handleSheetCanvasClick(tf.offsetX + (fa.x + 4) * tf.scale, tf.offsetY + (fa.y + 4) * tf.scale);
      ctrl.handleSheetCanvasClick(tf.offsetX + (fb.x + 4) * tf.scale, tf.offsetY + (fb.y + 4) * tf.scale);
      expect(ctrl.mergeSelectedFrames()).toBe(true);
      expect(ctrl.analysis!.frames.length).toBe(5);

      // 4. Row override + manual pivot adjustment
      ctrl.setRowStateOverride(1, 'ATTACK_CAST');
      const target = ctrl.analysis!.frames.find((f) => f.rowIndex === 1)!;
      ctrl.updateFramePivotAtSheetPoint(target.id, target.x + 21, target.y + 39);

      // 5. Export recipe JSON and roundtrip through headless pipeline
      const recipeText = ctrl.exportRecipeJson();
      const parsed = normalizeRecipe(JSON.parse(recipeText), 'luffy', 'base');
      const roundtrip = analyzeIrregularSpriteSheet(ctrl.rawSurface!, {}, parsed);
      expect(roundtrip.frames.length).toBe(5);
      expect(roundtrip.rows[1]?.assignedState).toBe('ATTACK_CAST');
      const rtTarget = roundtrip.rows[1]!.frames[0]!;
      expect(rtTarget.pivotX).toBe(21);
      expect(rtTarget.pivotY).toBe(39);

      // Dispose zeroes offscreen scratch GPU canvases cleanly
      ctrl.dispose();
      expect(canvases.every((c) => c.width === 0 && c.height === 0)).toBe(true);
    });
  });
});
