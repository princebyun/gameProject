import type { IslandExplorationRuntime, IslandStepOutput } from '../../core/rpg/episodeEngine';
import type { BattleWorldState } from '../../core/types/battleState';
import type { GameDataRegistry } from '../../core/types/dataSchemas';
import type { Disposable } from '../../core/types/disposable';
import type { BattleContext, RpgCampaignState, RpgDataRegistry } from '../../core/types/rpgSchemas';
import type { AssetLoader } from '../../assets/assetLoader';
import type { CanvasRenderer } from '../../render/canvasRenderer';
import type { ViewportMetrics } from '../../render/viewport/responsiveViewportManager';
import { PixiStageHost } from '../../render/pixi/PixiStageHost';
import { PixiBattleVerticalSliceScene } from '../../render/pixi/scenes/PixiBattleVerticalSliceScene';
import { PixiFooshaIslandScene } from '../../render/pixi/scenes/PixiFooshaIslandScene';
import type { StoryDirector } from '../../story/storyDirector';
import { collectIslandWorldMarkers } from '../../story/worldMarkerSystem';
import type { ActiveAppScene } from '../sceneTypes';

export interface VerticalSliceSceneHost {
  activeScene: ActiveAppScene;
  islandRuntime: IslandExplorationRuntime | null;
  activeBattleContext: BattleContext | null;
  lastIslandStep: IslandStepOutput;
  battleWorld: BattleWorldState;
  campaign: RpgCampaignState;
  rpgRegistry: RpgDataRegistry;
  gameRegistry: GameDataRegistry;
  storyDirector: StoryDirector;
  renderer: CanvasRenderer;
  assets: AssetLoader;
  tickCount: number;
  fps: number;
}

export type VerticalSliceKind = 'NONE' | 'FOOSHA' | 'BATTLE';

export class PixiVerticalSliceController implements Disposable {
  private fooshaScene: PixiFooshaIslandScene | null = null;
  private battleScene: PixiBattleVerticalSliceScene | null = null;
  private activeKind: VerticalSliceKind = 'NONE';
  private disposed = false;

  constructor(public readonly pixiHost: PixiStageHost) {}

  public getActiveKind(): VerticalSliceKind {
    return this.activeKind;
  }

  public resolveTargetSlice(host: VerticalSliceSceneHost): VerticalSliceKind {
    if (!this.pixiHost.isWebGLActive) return 'NONE';
    if (
      host.activeScene === 'ISLAND_EPISODE' &&
      host.islandRuntime?.islandId === 'foosha_shells'
    ) {
      return 'FOOSHA';
    }
    if (host.activeScene === 'SANDBOX') {
      return 'BATTLE';
    }
    if (host.activeScene === 'STORY_BATTLE') {
      const ctx = host.activeBattleContext;
      if (
        !ctx ||
        ctx.zoneId === 'east_blue' ||
        ctx.islandId === 'foosha_shells' ||
        ctx.encounterId === 'enc_ch1_alvida_tutorial'
      ) {
        return 'BATTLE';
      }
    }
    return 'NONE';
  }

  public releaseActiveSlice(host?: VerticalSliceSceneHost): void {
    if (this.fooshaScene) {
      this.fooshaScene.root.removeFromParent();
      this.fooshaScene.dispose();
      this.fooshaScene = null;
    }
    if (this.battleScene) {
      this.battleScene.root.removeFromParent();
      this.battleScene.dispose();
      this.battleScene = null;
    }
    this.activeKind = 'NONE';
    this.pixiHost.releaseActiveScene();
    this.pixiHost.setVisible(false);
    host?.renderer?.setBackgroundTransparent(false);
  }

  public renderFrameIfVerticalSlice(
    host: VerticalSliceSceneHost,
    viewport: ViewportMetrics,
    alpha: number
  ): boolean {
    if (this.disposed) return false;
    const target = this.resolveTargetSlice(host);
    if (target === 'NONE') {
      if (this.activeKind !== 'NONE' || this.pixiHost.isVisible()) {
        this.releaseActiveSlice(host);
      }
      return false;
    }

    this.pixiHost.updateFpsSample(host.fps);

    if (target === 'FOOSHA' && host.islandRuntime) {
      if (this.activeKind !== 'FOOSHA') {
        this.releaseActiveSlice(host);
        this.fooshaScene = new PixiFooshaIslandScene(this.pixiHost);
        this.pixiHost.worldRoot.addChild(this.fooshaScene.root);
        void this.fooshaScene.preload();
        this.activeKind = 'FOOSHA';
      }
      if (this.fooshaScene) {
        const storyNode = host.storyDirector.getCurrentNode(host.campaign);
        const islandMap = host.rpgRegistry.islands[host.islandRuntime.islandId];
        const markers = islandMap
          ? collectIslandWorldMarkers(host.campaign, islandMap, storyNode)
          : [];
        this.pixiHost.setVisible(true);
        host.renderer.setBackgroundTransparent(true);
        this.fooshaScene.render(
          host.campaign,
          host.islandRuntime,
          host.lastIslandStep,
          host.rpgRegistry,
          host.gameRegistry,
          host.tickCount,
          viewport,
          markers,
          host.storyDirector.isGoldMarkerHighlighted(),
          this.pixiHost.getPolishConfig(),
          1 / Math.max(24, host.fps)
        );
        this.pixiHost.renderNow();
        host.renderer.ctx.clearRect(0, 0, viewport.viewWidth, viewport.viewHeight);
        return true;
      }
    }

    if (target === 'BATTLE') {
      if (this.activeKind !== 'BATTLE') {
        this.releaseActiveSlice(host);
        this.battleScene = new PixiBattleVerticalSliceScene(this.pixiHost);
        this.pixiHost.worldRoot.addChild(this.battleScene.root);
        void this.battleScene.preload();
        this.activeKind = 'BATTLE';
      }
      if (this.battleScene) {
        this.pixiHost.setVisible(true);
        host.renderer.setBackgroundTransparent(true);
        this.battleScene.render(
          host.battleWorld,
          host.gameRegistry,
          host.assets.manifestRegistry,
          alpha,
          host.renderer.settings,
          'ALL',
          viewport,
          this.pixiHost.getPolishConfig(),
          1 / Math.max(24, host.fps)
        );
        this.pixiHost.renderNow();
        host.renderer.ctx.clearRect(0, 0, viewport.viewWidth, viewport.viewHeight);
        return true;
      }
    }

    return false;
  }

  public dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.releaseActiveSlice();
    this.pixiHost.dispose();
  }
}
