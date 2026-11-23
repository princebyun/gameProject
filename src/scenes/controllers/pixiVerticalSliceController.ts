import type { IslandExplorationRuntime, IslandStepOutput } from '../../core/rpg/episodeEngine';
import type { BattleWorldState } from '../../core/types/battleState';
import type { GameDataRegistry } from '../../core/types/dataSchemas';
import type { Disposable } from '../../core/types/disposable';
import type { BattleContext, RpgCampaignState, RpgDataRegistry } from '../../core/types/rpgSchemas';
import type { AssetLoader } from '../../assets/assetLoader';
import type { CanvasRenderer } from '../../render/canvasRenderer';
import type { ViewportMetrics } from '../../render/viewport/responsiveViewportManager';
import { PixiStageHost } from '../../render/pixi/PixiStageHost';
import { resolveBattleBundleName } from '../../render/pixi/pixiBundleHelpers';
import { PixiBattleVerticalSliceScene } from '../../render/pixi/scenes/PixiBattleVerticalSliceScene';
import { PixiFooshaIslandScene } from '../../render/pixi/scenes/PixiFooshaIslandScene';
import { PixiProIslandScene } from '../../render/pixi/scenes/PixiProIslandScene';
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

export type VerticalSliceKind = 'NONE' | 'FOOSHA' | 'PRO_ISLAND' | 'BATTLE';

export class PixiVerticalSliceController implements Disposable {
  private islandScene: PixiProIslandScene | null = null;
  private battleScene: PixiBattleVerticalSliceScene | null = null;
  private activeKind: VerticalSliceKind = 'NONE';
  private activeIslandId: string | null = null;
  private activeBattleBundle: string | null = null;
  private disposed = false;

  constructor(public readonly pixiHost: PixiStageHost) {}

  public getActiveKind(): VerticalSliceKind {
    return this.activeKind;
  }

  public getActiveIslandId(): string | null {
    return this.activeIslandId;
  }

  public resolveTargetSlice(host: VerticalSliceSceneHost): VerticalSliceKind {
    if (!this.pixiHost.isWebGLActive) return 'NONE';
    if (host.activeScene === 'ISLAND_EPISODE' && host.islandRuntime) {
      const id = host.islandRuntime.islandId;
      if (id === 'foosha_shells') return 'FOOSHA';
      if (Boolean(this.pixiHost.loader.manifest.maps[id])) return 'PRO_ISLAND';
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
    if (this.islandScene) {
      this.islandScene.root.removeFromParent();
      this.islandScene.dispose();
      this.islandScene = null;
    }
    if (this.battleScene) {
      this.battleScene.root.removeFromParent();
      this.battleScene.dispose();
      this.battleScene = null;
    }
    this.activeKind = 'NONE';
    this.activeIslandId = null;
    this.activeBattleBundle = null;
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

    if ((target === 'FOOSHA' || target === 'PRO_ISLAND') && host.islandRuntime) {
      const desiredIslandId = host.islandRuntime.islandId;
      if (this.activeKind !== target || this.activeIslandId !== desiredIslandId) {
        this.releaseActiveSlice(host);
        this.islandScene =
          target === 'FOOSHA'
            ? new PixiFooshaIslandScene(this.pixiHost)
            : new PixiProIslandScene(this.pixiHost, desiredIslandId);
        this.pixiHost.worldRoot.addChild(this.islandScene.root);
        void this.islandScene.preload();
        this.activeKind = target;
        this.activeIslandId = desiredIslandId;
      }
      if (this.islandScene) {
        const storyNode = host.storyDirector.getCurrentNode(host.campaign);
        const islandMap = host.rpgRegistry.islands[host.islandRuntime.islandId];
        const markers = islandMap
          ? collectIslandWorldMarkers(host.campaign, islandMap, storyNode)
          : [];
        this.pixiHost.setVisible(true);
        host.renderer.setBackgroundTransparent(true);
        this.islandScene.render(
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
      const desiredBattleBundle = resolveBattleBundleName(
        host.activeBattleContext,
        host.battleWorld
      );
      if (this.activeKind !== 'BATTLE' || this.activeBattleBundle !== desiredBattleBundle) {
        this.releaseActiveSlice(host);
        this.battleScene = new PixiBattleVerticalSliceScene(this.pixiHost);
        this.pixiHost.worldRoot.addChild(this.battleScene.root);
        void this.battleScene.preload(desiredBattleBundle);
        this.activeKind = 'BATTLE';
        this.activeBattleBundle = desiredBattleBundle;
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
