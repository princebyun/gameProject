import type { Vec2 } from '../core/math/vector2';
import type { StoryLoopMode, StoryNodeSnapshot } from '../story/storyDirector';
import {
  DEFAULT_VIEWPORT_METRICS,
  type ViewportMetrics
} from './viewport/responsiveViewportManager';

export interface MissionTrackerState {
  collapsed: boolean;
  bounds: { x: number; y: number; w: number; h: number };
  highlightBtnBounds: { x: number; y: number; w: number; h: number };
}

export function createInitialMissionTrackerState(): MissionTrackerState {
  return {
    collapsed: false,
    bounds: { x: 10, y: 94, w: 325, h: 52 },
    highlightBtnBounds: { x: 256, y: 98, w: 72, h: 18 }
  };
}

/**
 * Pokémon-Resonance style compact 1-2 line Mission Tracker HUD pinned inside Safe Area.
 * Tapping the header collapses/expands; tapping [위치 강조] highlights the next Gold Marker.
 */
export function renderMissionTrackerHud(
  ctx: CanvasRenderingContext2D,
  storyNode: StoryNodeSnapshot,
  loopMode: StoryLoopMode,
  trackerState: MissionTrackerState,
  viewport: ViewportMetrics = DEFAULT_VIEWPORT_METRICS,
  topOffsetY = 78
): void {
  const { left: safeL, top: safeT } = viewport.safeInsets;
  const x = 10 + safeL;
  const y = topOffsetY + safeT;
  const w = trackerState.collapsed ? 156 : 316;
  const h = trackerState.collapsed ? 24 : 44;

  trackerState.bounds = { x, y, w, h };
  trackerState.highlightBtnBounds = {
    x: x + w - 74,
    y: y + 4,
    w: 68,
    h: 17
  };

  ctx.save();
  ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = loopMode === 'STORY_MISSION' ? '#f59e0b' : '#facc15';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(x, y, w, h);

  ctx.font = 'bold 10px monospace';
  ctx.textAlign = 'left';
  ctx.fillStyle = '#fde047';
  const toggleArrow = trackerState.collapsed ? '▸' : '▾';
  ctx.fillText(
    trackerState.collapsed
      ? `${toggleArrow} 다음 목표 보기`
      : `${toggleArrow} ${storyNode.chapterLabel}`,
    x + 8,
    y + 15
  );

  if (!trackerState.collapsed) {
    // Highlight Gold Marker button
    const hb = trackerState.highlightBtnBounds;
    ctx.fillStyle = 'rgba(250, 204, 21, 0.22)';
    ctx.fillRect(hb.x, hb.y, hb.w, hb.h);
    ctx.strokeStyle = '#facc15';
    ctx.lineWidth = 1;
    ctx.strokeRect(hb.x, hb.y, hb.w, hb.h);
    ctx.font = 'bold 9px monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fef08a';
    ctx.fillText('★ 목표 안내', hb.x + hb.w * 0.5, hb.y + 12);

    // Concise 1-line objective text
    ctx.font = '10px monospace';
    ctx.textAlign = 'left';
    ctx.fillStyle = '#f8fafc';
    const text =
      storyNode.objectiveText.length > 34
        ? `${storyNode.objectiveText.slice(0, 33)}…`
        : storyNode.objectiveText;
    ctx.fillText(`▶ ${text}`, x + 8, y + 34);
  }

  ctx.restore();
}

export function handleMissionTrackerTap(
  pos: Vec2,
  trackerState: MissionTrackerState
): 'NONE' | 'TOGGLED' | 'HIGHLIGHT_GOLD' {
  const hb = trackerState.highlightBtnBounds;
  if (
    !trackerState.collapsed &&
    pos.x >= hb.x &&
    pos.x <= hb.x + hb.w &&
    pos.y >= hb.y &&
    pos.y <= hb.y + hb.h
  ) {
    return 'HIGHLIGHT_GOLD';
  }

  const b = trackerState.bounds;
  if (pos.x >= b.x && pos.x <= b.x + b.w && pos.y >= b.y && pos.y <= b.y + b.h) {
    trackerState.collapsed = !trackerState.collapsed;
    return 'TOGGLED';
  }
  return 'NONE';
}
