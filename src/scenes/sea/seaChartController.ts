import { executeFastSailToIsland } from '../../core/rpg/seaChartLogic';
import type { Disposable } from '../../core/types/disposable';
import type { RpgCampaignState, RpgDataRegistry } from '../../core/types/rpgSchemas';
import type { AssetLoader } from '../../assets/assetLoader';
import type { AudioManager } from '../../audio/audioManager';
import {
  renderSeaChartOverlay,
  type SeaChartHitRegions,
  type SeaChartOverlayState
} from '../../render/sea/seaChartOverlay';
import { isPointInSeaMinimap } from '../../render/sea/seaMinimapHud';
import type { ViewportMetrics } from '../../render/viewport/responsiveViewportManager';
import { getSafeHudBounds } from '../../render/viewport/safeAreaLayout';
import type { StoryDirector } from '../../story/storyDirector';

export interface SeaChartHost {
  campaign: RpgCampaignState;
  readonly rpgRegistry: RpgDataRegistry;
  readonly assets: AssetLoader;
  readonly audio: AudioManager;
  readonly storyDirector: StoryDirector;
  tickCount: number;
  saveIndicatorText: string;
  saveIndicatorTimer: number;
  clearTransientFocusAndInput(): void;
  syncSceneBgm(): void;
  refreshSideDrawer(): void;
  triggerAutoSave(reason: string): Promise<void>;
}

function hitRect(
  pt: { x: number; y: number },
  rect: { x: number; y: number; w: number; h: number } | null
): boolean {
  if (!rect) return false;
  return (
    pt.x >= rect.x &&
    pt.x <= rect.x + rect.w &&
    pt.y >= rect.y &&
    pt.y <= rect.y + rect.h
  );
}

export class SeaChartController implements Disposable {
  public readonly state: SeaChartOverlayState = {
    isOpen: false,
    activeZoneId: 'east_blue',
    selectedIslandId: null,
    feedbackNotice: null,
    feedbackTimerSec: 0
  };
  private lastRegions: SeaChartHitRegions | null = null;

  public open(campaign: RpgCampaignState): void {
    this.state.isOpen = true;
    this.state.activeZoneId = campaign.currentZoneId;
    this.state.selectedIslandId = campaign.lastDockedPort?.islandId ?? null;
    this.state.feedbackNotice = null;
    this.state.feedbackTimerSec = 0;
  }

  public close(): void {
    this.state.isOpen = false;
    this.state.feedbackNotice = null;
    this.state.feedbackTimerSec = 0;
    this.lastRegions = null;
  }

  public toggle(campaign: RpgCampaignState): boolean {
    if (this.state.isOpen) {
      this.close();
      return false;
    }
    this.open(campaign);
    return true;
  }

  public step(dt: number): void {
    if (this.state.feedbackTimerSec > 0) {
      this.state.feedbackTimerSec = Math.max(0, this.state.feedbackTimerSec - dt);
      if (this.state.feedbackTimerSec === 0) {
        this.state.feedbackNotice = null;
      }
    }
  }

  public renderOverlay(
    ctx: CanvasRenderingContext2D,
    host: SeaChartHost,
    viewport: ViewportMetrics
  ): void {
    if (!this.state.isOpen) return;
    const safe = getSafeHudBounds(viewport);
    const storyNode = host.storyDirector.getCurrentNode(host.campaign);
    this.lastRegions = renderSeaChartOverlay(
      ctx,
      host.campaign,
      host.rpgRegistry,
      this.state,
      storyNode,
      host.tickCount,
      safe,
      host.assets
    );
  }

  public handlePointerDown(
    pt: { x: number; y: number },
    viewport: ViewportMetrics,
    host: SeaChartHost
  ): boolean {
    if (!this.state.isOpen) {
      const safe = getSafeHudBounds(viewport);
      if (isPointInSeaMinimap(pt, safe)) {
        this.open(host.campaign);
        host.audio.playSfxId('ui_confirm');
        host.clearTransientFocusAndInput();
        return true;
      }
      return false;
    }

    const r = this.lastRegions;
    if (!r) return true;

    if (hitRect(pt, r.closeBtnRect) || !hitRect(pt, r.modalRect)) {
      this.close();
      host.audio.playSfxId('ui_cancel');
      return true;
    }

    for (const tab of r.zoneTabRects) {
      if (hitRect(pt, tab.rect)) {
        this.state.activeZoneId = tab.zoneId;
        const firstIsland = host.rpgRegistry.seaZones[tab.zoneId]?.islands[0];
        this.state.selectedIslandId = firstIsland?.islandId ?? null;
        this.state.feedbackNotice = null;
        host.audio.playSfxId('ui_move');
        return true;
      }
    }

    for (const node of r.islandHitCircles) {
      if (Math.hypot(pt.x - node.cx, pt.y - node.cy) <= node.r) {
        this.state.selectedIslandId = node.islandId;
        this.state.feedbackNotice = null;
        host.audio.playSfxId('ui_move');
        return true;
      }
    }

    if (hitRect(pt, r.fastSailBtnRect)) {
      const zone = host.rpgRegistry.seaZones[this.state.activeZoneId];
      const targetId = this.state.selectedIslandId ?? zone.islands[0]?.islandId;
      if (targetId) {
        const res = executeFastSailToIsland(
          host.campaign,
          this.state.activeZoneId,
          targetId,
          host.rpgRegistry
        );
        if (res.ok) {
          this.close();
          host.audio.playSfxId('ui_confirm');
          host.saveIndicatorText = res.notice.slice(0, 28);
          host.saveIndicatorTimer = 2.5;
          host.syncSceneBgm();
          host.refreshSideDrawer();
          void host.triggerAutoSave('빠른 항해');
        } else {
          this.state.feedbackNotice = res.notice;
          this.state.feedbackTimerSec = 2.4;
          host.audio.playSfxId('ui_cancel');
        }
      }
      return true;
    }

    return true;
  }

  public dispose(): void {
    this.close();
  }
}
