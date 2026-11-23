import type {
  RgbaSurface,
  SlicedFrame,
  SlicerAnalysisResult
} from '../../assets/slicer/slicerTypes';
import { releaseOffscreenCanvas } from '../../render/canvasGpuDispose';

export interface SheetViewTransform {
  scale: number;
  offsetX: number;
  offsetY: number;
}

export function computeSheetViewTransform(
  rawW: number,
  rawH: number,
  canvasW: number,
  canvasH: number
): SheetViewTransform {
  const pad = 10;
  const availW = Math.max(16, canvasW - pad * 2);
  const availH = Math.max(16, canvasH - pad * 2);
  const scale = Math.min(availW / Math.max(1, rawW), availH / Math.max(1, rawH));
  const drawW = rawW * scale;
  const drawH = rawH * scale;
  return {
    scale,
    offsetX: Math.round((canvasW - drawW) * 0.5),
    offsetY: Math.round((canvasH - drawH) * 0.5)
  };
}

/**
 * Reusable canvas renderer for Slicer overlay & live footline-aligned animation preview.
 * Releases offscreen scratch buffers immediately on dispose().
 */
export class SlicerPreviewCanvases {
  private scratchRawCanvas: HTMLCanvasElement | null = null;
  private scratchCleanedCanvas: HTMLCanvasElement | null = null;
  private cachedRawRef: Uint8ClampedArray | null = null;
  private cachedCleanRef: Uint8ClampedArray | null = null;

  public dispose(): void {
    releaseOffscreenCanvas(this.scratchRawCanvas);
    releaseOffscreenCanvas(this.scratchCleanedCanvas);
    this.scratchRawCanvas = null;
    this.scratchCleanedCanvas = null;
    this.cachedRawRef = null;
    this.cachedCleanRef = null;
  }

  private syncSurfaceToCanvas(
    surface: RgbaSurface,
    existing: HTMLCanvasElement | null,
    cachedRef: Uint8ClampedArray | null
  ): { canvas: HTMLCanvasElement | null; nextRef: Uint8ClampedArray } {
    if (typeof document === 'undefined') return { canvas: null, nextRef: surface.data };
    if (existing && cachedRef === surface.data && existing.width === surface.width && existing.height === surface.height) {
      return { canvas: existing, nextRef: cachedRef };
    }
    const canvas = existing ?? document.createElement('canvas');
    canvas.width = surface.width;
    canvas.height = surface.height;
    const octx = canvas.getContext('2d');
    if (octx && typeof octx.createImageData === 'function' && typeof octx.putImageData === 'function') {
      const imgData = octx.createImageData(surface.width, surface.height);
      imgData.data.set(surface.data);
      octx.putImageData(imgData, 0, 0);
    }
    return { canvas, nextRef: surface.data };
  }

  public renderSheetOverlay(
    ctx: CanvasRenderingContext2D,
    canvasW: number,
    canvasH: number,
    rawSurface: RgbaSurface | null,
    analysis: SlicerAnalysisResult | null,
    selectedFrameIds: readonly number[],
    activePivotFrameId: number | null
  ): SheetViewTransform | null {
    ctx.clearRect(0, 0, canvasW, canvasH);
    const cell = 12;
    for (let y = 0; y < canvasH; y += cell) {
      for (let x = 0; x < canvasW; x += cell) {
        ctx.fillStyle = ((x / cell + y / cell) & 1) === 0 ? '#0f172a' : '#162033';
        ctx.fillRect(x, y, cell, cell);
      }
    }
    if (!rawSurface) return null;

    const synced = this.syncSurfaceToCanvas(rawSurface, this.scratchRawCanvas, this.cachedRawRef);
    this.scratchRawCanvas = synced.canvas;
    this.cachedRawRef = synced.nextRef;

    const tf = computeSheetViewTransform(rawSurface.width, rawSurface.height, canvasW, canvasH);
    ctx.imageSmoothingEnabled = false;
    if (synced.canvas) {
      ctx.drawImage(
        synced.canvas,
        tf.offsetX,
        tf.offsetY,
        Math.round(rawSurface.width * tf.scale),
        Math.round(rawSurface.height * tf.scale)
      );
    }

    if (!analysis) return tf;

    // 1. Excluded regions (Red box + X cross)
    ctx.save();
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 1.5;
    for (const ex of analysis.excludedRegions) {
      const rx = tf.offsetX + ex.x * tf.scale;
      const ry = tf.offsetY + ex.y * tf.scale;
      const rw = ex.w * tf.scale;
      const rh = ex.h * tf.scale;
      ctx.strokeRect(rx, ry, rw, rh);
      ctx.beginPath();
      ctx.moveTo(rx, ry);
      ctx.lineTo(rx + rw, ry + rh);
      ctx.moveTo(rx + rw, ry);
      ctx.lineTo(rx, ry + rh);
      ctx.stroke();
    }

    // 2. Accepted frames (Green box + number + Yellow pivot crosshair)
    ctx.font = 'bold 10px monospace';
    for (const f of analysis.frames) {
      const rx = tf.offsetX + f.x * tf.scale;
      const ry = tf.offsetY + f.y * tf.scale;
      const rw = f.w * tf.scale;
      const rh = f.h * tf.scale;
      const isSelected = selectedFrameIds.includes(f.id);
      const isPivotActive = activePivotFrameId === f.id;

      ctx.strokeStyle = isSelected ? '#38bdf8' : '#22c55e';
      ctx.lineWidth = isSelected || isPivotActive ? 2.5 : 1.5;
      ctx.strokeRect(rx, ry, rw, rh);
      ctx.fillStyle = isSelected ? '#38bdf8' : '#22c55e';
      ctx.fillText(String(f.id), rx + 2, ry + 10);

      const px = Math.round(tf.offsetX + (f.x + f.pivotX) * tf.scale);
      const py = Math.round(tf.offsetY + (f.y + f.pivotY) * tf.scale);
      ctx.strokeStyle = '#facc15';
      ctx.lineWidth = isPivotActive ? 2.5 : 1.5;
      ctx.beginPath();
      ctx.moveTo(px - 6, py);
      ctx.lineTo(px + 6, py);
      ctx.moveTo(px, py - 6);
      ctx.lineTo(px, py + 6);
      ctx.stroke();
    }
    ctx.restore();
    return tf;
  }

  public renderAnimationPreview(
    ctx: CanvasRenderingContext2D,
    canvasW: number,
    canvasH: number,
    analysis: SlicerAnalysisResult | null,
    previewRowIndex: number,
    tick: number,
    flipHorizontal: boolean
  ): SlicedFrame | null {
    ctx.clearRect(0, 0, canvasW, canvasH);
    ctx.fillStyle = '#0b1120';
    ctx.fillRect(0, 0, canvasW, canvasH);

    const anchorX = Math.round(canvasW * 0.42);
    const anchorY = Math.round(canvasH * 0.78);

    // Foot baseline & torso axis guides (demonstrating zero slide!)
    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(56, 189, 248, 0.7)';
    ctx.beginPath();
    ctx.moveTo(8, anchorY);
    ctx.lineTo(canvasW - 8, anchorY);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(250, 204, 21, 0.65)';
    ctx.beginPath();
    ctx.moveTo(anchorX, 12);
    ctx.lineTo(anchorX, canvasH - 22);
    ctx.stroke();

    if (!analysis || analysis.rows.length === 0) return null;
    const synced = this.syncSurfaceToCanvas(
      analysis.cleanedSurface,
      this.scratchCleanedCanvas,
      this.cachedCleanRef
    );
    this.scratchCleanedCanvas = synced.canvas;
    this.cachedCleanRef = synced.nextRef;

    const row = analysis.rows[previewRowIndex] ?? analysis.rows[0];
    if (!row || row.frames.length === 0) return null;
    const fIdx = Math.floor((tick / 60) * 6) % row.frames.length;
    const f = row.frames[fIdx] ?? row.frames[0]!;
    const drawScale = 2;
    const dw = Math.round(f.w * drawScale);
    const dh = Math.round(f.h * drawScale);
    const dx = Math.round(anchorX - f.pivotX * drawScale);
    const dy = Math.round(anchorY - f.pivotY * drawScale);

    ctx.imageSmoothingEnabled = false;
    if (synced.canvas) {
      ctx.save();
      if (flipHorizontal) {
        ctx.translate(anchorX, anchorY);
        ctx.scale(-1, 1);
        ctx.drawImage(
          synced.canvas,
          f.x,
          f.y,
          f.w,
          f.h,
          -Math.round((f.w - 1 - f.pivotX) * drawScale),
          -Math.round(f.pivotY * drawScale),
          dw,
          dh
        );
      } else {
        ctx.drawImage(synced.canvas, f.x, f.y, f.w, f.h, dx, dy, dw, dh);
      }
      ctx.restore();
    }

    ctx.fillStyle = '#fde047';
    ctx.font = 'bold 10px monospace';
    ctx.fillText(
      `R${row.rowIndex} [${row.assignedState}] f${fIdx + 1}/${row.frames.length} pivot(${f.pivotX},${f.pivotY})`,
      8,
      canvasH - 6
    );
    return f;
  }
}
