import type { AssetLoader } from '../../assets/assetLoader';
import type { GameDataRegistry } from '../../core/types/dataSchemas';
import type { AssetPreviewUiState } from './assetPreviewDom';

export function renderSpritePreviewCanvas(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  state: AssetPreviewUiState,
  previewTick: number,
  gameRegistry: GameDataRegistry,
  assets: AssetLoader
): void {
  const cell = 16;
  for (let y = 0; y < h; y += cell) {
    for (let x = 0; x < w; x += cell) {
      ctx.fillStyle = ((x / cell + y / cell) & 1) === 0 ? '#0f172a' : '#162033';
      ctx.fillRect(x, y, cell, cell);
    }
  }

  const isShip = state.selectedTargetKey.startsWith('ship:');
  let sheetImg: HTMLCanvasElement | HTMLImageElement | null = null;
  let entry;

  if (isShip) {
    const shipId = state.selectedTargetKey.replace('ship:', '');
    const resolved = assets.getOrCreateShipSpriteSheet(shipId);
    sheetImg = resolved.sheet;
    entry = resolved.entry;
  } else {
    const unitId = state.selectedTargetKey.replace('unit:', '');
    const unitDef =
      gameRegistry.units[unitId] ??
      gameRegistry.units['luffy'] ??
      Object.values(gameRegistry.units)[0];
    if (!unitDef) return;
    const formDef =
      state.selectedFormId !== 'base'
        ? gameRegistry.forms[state.selectedFormId] ?? null
        : null;
    const resolved = assets.getOrCreateUnitSpriteSheet(
      unitDef,
      state.selectedFormId === 'base' ? null : state.selectedFormId,
      formDef
    );
    sheetImg = resolved.sheet;
    entry = resolved.entry;
  }

  if (!sheetImg || !entry) return;

  const clip = entry.animations[state.selectedAnim];
  const frameIdx =
    Math.floor((previewTick / 60) * clip.fps) % Math.max(1, clip.frames);
  const rect = clip.frameRects?.[frameIdx];
  const fw = rect ? rect.w : entry.frameWidth;
  const fh = rect ? rect.h : entry.frameHeight;

  const cx = Math.round(w * 0.5);
  const cy = Math.round(h * 0.48);
  const drawW = fw * state.zoomScale;
  const drawH = fh * state.zoomScale;
  const drawX = rect ? Math.round(cx - rect.pivotX * state.zoomScale) : Math.round(cx - drawW * entry.anchor.x);
  const drawY = rect ? Math.round(cy - rect.pivotY * state.zoomScale) : Math.round(cy - drawH * entry.anchor.y);

  if (state.toggleLunarian) {
    ctx.save();
    const pulse = 0.8 + Math.sin(previewTick * 0.25) * 0.2;
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

  if (state.toggleHagoromo !== 'NONE') {
    ctx.save();
    ctx.strokeStyle =
      state.toggleHagoromo === 'WHITE'
        ? 'rgba(248, 250, 252, 0.92)'
        : 'rgba(15, 23, 42, 0.92)';
    ctx.lineWidth = Math.max(4, Math.round(drawW * 0.08));
    const sway = Math.sin(previewTick * 0.12) * 6;
    ctx.beginPath();
    ctx.arc(cx, drawY + drawH * 0.38 + sway * 0.3, drawW * 0.42, Math.PI * 0.95, Math.PI * 2.05);
    ctx.stroke();
    ctx.restore();
  }

  const effectKind = state.toggleHitFlash
    ? 'WHITE_FLASH'
    : state.toggleArmament
      ? 'ARMAMENT_BLACK'
      : null;

  if (effectKind) {
    const tinted = assets.spriteController.effectCache.getOrCreateEffectFrame(
      entry.key,
      sheetImg,
      clip.row,
      frameIdx,
      entry.frameWidth,
      entry.frameHeight,
      effectKind,
      '#ffffff',
      rect
    );
    if (tinted) {
      ctx.drawImage(tinted, drawX, drawY, drawW, drawH);
    }
  } else {
    ctx.drawImage(
      sheetImg,
      rect ? rect.x : frameIdx * entry.frameWidth,
      rect ? rect.y : clip.row * entry.frameHeight,
      fw,
      fh,
      drawX,
      drawY,
      drawW,
      drawH
    );
  }

  if (state.toggleConqueror) {
    ctx.save();
    for (let i = 0; i < 4; i++) {
      const angle = (previewTick * 0.11 + i * 1.57) % (Math.PI * 2);
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

  ctx.strokeStyle = '#38bdf8';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cx - 8, cy);
  ctx.lineTo(cx + 8, cy);
  ctx.moveTo(cx, cy - 8);
  ctx.lineTo(cx, cy + 8);
  ctx.stroke();

  const stripY = h - 78;
  ctx.fillStyle = 'rgba(2, 6, 23, 0.85)';
  ctx.fillRect(0, stripY - 14, w, 92);
  ctx.font = '11px monospace';
  ctx.fillStyle = '#94a3b8';
  ctx.fillText(
    `State: ${state.selectedAnim} (Row ${clip.row}) · Frame ${frameIdx + 1}/${clip.frames} · ${clip.fps} FPS · loop=${clip.loop}${clip.hitFrame !== undefined ? ` · hitFrame=${clip.hitFrame}` : ''}`,
    12,
    stripY - 2
  );

  const thumbSize = 56;
  for (let f = 0; f < clip.frames; f++) {
    const fRect = clip.frameRects?.[f];
    const tx = 14 + f * (thumbSize + 10);
    const ty = stripY + 8;
    ctx.strokeStyle = f === frameIdx ? '#fde047' : '#334155';
    ctx.lineWidth = f === frameIdx ? 2 : 1;
    ctx.strokeRect(tx, ty, thumbSize, thumbSize);
    ctx.drawImage(
      sheetImg,
      fRect ? fRect.x : f * entry.frameWidth,
      fRect ? fRect.y : clip.row * entry.frameHeight,
      fRect ? fRect.w : entry.frameWidth,
      fRect ? fRect.h : entry.frameHeight,
      tx,
      ty,
      thumbSize,
      thumbSize
    );
  }
}

export function renderTilesetPreviewCanvas(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  selectedBiomeId: string,
  previewTick: number,
  assets: AssetLoader
): void {
  const biome =
    assets.manifestRegistry.biomesById[selectedBiomeId] ??
    assets.manifestRegistry.tilesetsFile.biomes[0];
  if (!biome) return;

  const sampleObstacles = [
    { x: 96, y: 64, width: 96, height: 64 },
    { x: 480, y: 48, width: 128, height: 96 }
  ];
  assets.tilemapRenderer.renderBiomeBackdrop(
    ctx,
    `preview_${biome.biomeId}`,
    w,
    224,
    0,
    0,
    w,
    224,
    biome,
    assets,
    previewTick,
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

  const atlas = assets.getOrCreateBiomeTileset(biome);
  if (atlas) {
    ctx.drawImage(atlas, 12, panelY + 24, 512, 128);
    ctx.strokeStyle = '#38bdf8';
    ctx.strokeRect(12, panelY + 24, 512, 128);
  }
}
