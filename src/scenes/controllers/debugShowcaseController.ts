import {
  spawnBeamInstance,
  spawnMeleeArcInstance,
  spawnProjectileInstance
} from '../../core/combat/battleWorld';
import {
  activateFormShift,
  cycleZoanStance
} from '../../core/combat/formShiftEngine';
import {
  completeEpisode,
  enterIslandEpisode,
  exitIslandToSea,
  type IslandExplorationRuntime
} from '../../core/rpg/episodeEngine';
import { tryTransitionThroughSeaGate } from '../../core/rpg/seaGateValidator';
import type { BattleWorldState } from '../../core/types/battleState';
import type { GameDataRegistry } from '../../core/types/dataSchemas';
import type {
  GateValidationResult,
  RpgCampaignState,
  RpgDataRegistry
} from '../../core/types/rpgSchemas';
import type { AssetPreviewScene } from '../dev/assetPreviewScene';
import type { ActiveAppScene } from '../sceneTypes';

export type SandboxShowcaseKind =
  | 'BEAM_CLASH'
  | 'CONQUEROR_CLASH'
  | 'HAGOROMO_AWAKENING'
  | 'ZOAN_CYCLE'
  | 'LOGIA_PASS';

export interface DebugStoryJumpContext {
  activeScene: ActiveAppScene;
  campaign: RpgCampaignState;
  rpgRegistry: RpgDataRegistry;
  gameRegistry: GameDataRegistry;
  assetPreviewScene: AssetPreviewScene | null;
  getIslandRuntime: () => IslandExplorationRuntime | null;
  setIslandRuntime: (rt: IslandExplorationRuntime | null) => void;
  setGateBlockedPopup: (popup: GateValidationResult | null) => void;
  setShowWantedPosterOverlay: (show: boolean) => void;
  switchToScene: (scene: ActiveAppScene) => void;
  triggerAutoSave: (reason: string) => Promise<void>;
  refreshSideDrawer: () => void;
}

export function runDebugStoryJump(
  ctx: DebugStoryJumpContext,
  actionKey: string
): void {
  ctx.setGateBlockedPopup(null);
  ctx.setShowWantedPosterOverlay(false);

  if (actionKey === 'open_asset_preview') {
    ctx.assetPreviewScene?.open();
    return;
  }

  const { campaign, rpgRegistry, gameRegistry } = ctx;

  if (actionKey === 'sea_east_blue') {
    exitIslandToSea(campaign);
    campaign.currentZoneId = 'east_blue';
    campaign.ship.pos = { ...rpgRegistry.seaZones.east_blue.spawnPoint };
    ctx.switchToScene('SEA_SAILING');
  } else if (actionKey === 'dock_foosha') {
    campaign.currentZoneId = 'east_blue';
    campaign.ship.pos = { x: 360, y: 300 };
    const res = enterIslandEpisode(campaign, 'foosha_shells', rpgRegistry);
    if (res.allowed && res.runtime) {
      ctx.setIslandRuntime(res.runtime);
      ctx.switchToScene('ISLAND_EPISODE');
    }
  } else if (actionKey === 'dock_orange_town') {
    campaign.currentZoneId = 'east_blue';
    campaign.ship.pos = { x: 600, y: 640 };
    const res = enterIslandEpisode(campaign, 'orange_town', rpgRegistry);
    if (res.allowed && res.runtime) {
      ctx.setIslandRuntime(res.runtime);
      ctx.switchToScene('ISLAND_EPISODE');
    }
  } else if (actionKey === 'dock_baratie') {
    campaign.currentZoneId = 'east_blue';
    campaign.ship.pos = { x: 830, y: 310 };
    const res = enterIslandEpisode(campaign, 'baratie', rpgRegistry);
    if (res.allowed && res.runtime) {
      ctx.setIslandRuntime(res.runtime);
      ctx.switchToScene('ISLAND_EPISODE');
    }
  } else if (actionKey === 'dock_arlong_park') {
    campaign.currentZoneId = 'east_blue';
    campaign.ship.pos = { x: 1060, y: 660 };
    const res = enterIslandEpisode(campaign, 'arlong_park', rpgRegistry);
    if (res.allowed && res.runtime) {
      ctx.setIslandRuntime(res.runtime);
      ctx.switchToScene('ISLAND_EPISODE');
    }
  } else if (actionKey === 'dock_loguetown') {
    campaign.currentZoneId = 'east_blue';
    campaign.ship.pos = { x: 1240, y: 350 };
    const res = enterIslandEpisode(campaign, 'loguetown', rpgRegistry);
    if (res.allowed && res.runtime) {
      ctx.setIslandRuntime(res.runtime);
      ctx.switchToScene('ISLAND_EPISODE');
    }
  } else if (actionKey === 'gate_reverse_mountain') {
    campaign.currentZoneId = 'east_blue';
    campaign.ship.pos = { x: 1435, y: 480 };
    ctx.switchToScene('SEA_SAILING');
    const gateRes = tryTransitionThroughSeaGate(campaign, rpgRegistry);
    if (!gateRes.allowed) {
      ctx.setGateBlockedPopup(gateRes);
    }
  } else if (actionKey === 'sea_grand_line') {
    for (const epId of [
      'ep_east_blue_start',
      'ep_orange_town',
      'ep_baratie',
      'ep_arlong_park',
      'ep_loguetown'
    ]) {
      completeEpisode(campaign, epId, rpgRegistry, gameRegistry);
    }
    exitIslandToSea(campaign);
    campaign.currentZoneId = 'grand_line';
    campaign.ship.pos = { ...rpgRegistry.seaZones.grand_line.spawnPoint };
    ctx.switchToScene('SEA_SAILING');
  } else if (actionKey === 'gate_red_line_blocked') {
    for (const epId of [
      'ep_east_blue_start',
      'ep_orange_town',
      'ep_baratie',
      'ep_arlong_park',
      'ep_loguetown'
    ]) {
      completeEpisode(campaign, epId, rpgRegistry, gameRegistry);
    }
    campaign.completedEpisodes = campaign.completedEpisodes.filter(
      (id) => id !== 'ep_water_seven'
    );
    exitIslandToSea(campaign);
    campaign.currentZoneId = 'grand_line';
    campaign.ship.pos = { x: 1615, y: 520 };
    ctx.switchToScene('SEA_SAILING');
    const gateRes = tryTransitionThroughSeaGate(campaign, rpgRegistry);
    if (!gateRes.allowed) {
      ctx.setGateBlockedPopup(gateRes);
    }
  } else if (
    actionKey === 'dock_drum_kingdom' ||
    actionKey === 'dock_alabasta' ||
    actionKey === 'dock_skypiea' ||
    actionKey === 'dock_water_seven' ||
    actionKey === 'dock_thriller_bark' ||
    actionKey === 'dock_marineford'
  ) {
    for (const epId of [
      'ep_east_blue_start',
      'ep_orange_town',
      'ep_baratie',
      'ep_arlong_park',
      'ep_loguetown'
    ]) {
      completeEpisode(campaign, epId, rpgRegistry, gameRegistry);
    }
    const islandId = actionKey.replace('dock_', '');
    const node = rpgRegistry.seaZones.grand_line.islands.find(
      (i) => i.islandId === islandId
    );
    campaign.currentZoneId = 'grand_line';
    campaign.ship.pos = node ? { ...node.pos } : { x: 600, y: 520 };
    const res = enterIslandEpisode(campaign, islandId, rpgRegistry);
    if (res.allowed && res.runtime) {
      ctx.setIslandRuntime(res.runtime);
      ctx.switchToScene('ISLAND_EPISODE');
    }
  } else if (actionKey === 'sea_new_world') {
    for (const epId of [
      'ep_east_blue_start',
      'ep_orange_town',
      'ep_baratie',
      'ep_arlong_park',
      'ep_loguetown',
      'ep_drum_kingdom',
      'ep_alabasta',
      'ep_skypiea',
      'ep_water_seven',
      'ep_thriller_bark',
      'ep_marineford'
    ]) {
      completeEpisode(campaign, epId, rpgRegistry, gameRegistry);
    }
    exitIslandToSea(campaign);
    campaign.currentZoneId = 'grand_line';
    campaign.ship.pos = { x: 1615, y: 520 };
    tryTransitionThroughSeaGate(campaign, rpgRegistry);
    ctx.switchToScene('SEA_SAILING');
  } else if (
    actionKey === 'dock_fishman_island' ||
    actionKey === 'dock_dressrosa' ||
    actionKey === 'dock_totto_land' ||
    actionKey === 'dock_wano'
  ) {
    for (const epId of [
      'ep_east_blue_start',
      'ep_orange_town',
      'ep_baratie',
      'ep_arlong_park',
      'ep_loguetown',
      'ep_drum_kingdom',
      'ep_alabasta',
      'ep_skypiea',
      'ep_water_seven',
      'ep_thriller_bark',
      'ep_marineford'
    ]) {
      completeEpisode(campaign, epId, rpgRegistry, gameRegistry);
    }
    const islandId =
      actionKey === 'dock_wano'
        ? 'wano_onigashima'
        : actionKey.replace('dock_', '');
    const node = rpgRegistry.seaZones.new_world.islands.find(
      (i) => i.islandId === islandId
    );
    campaign.currentZoneId = 'new_world';
    campaign.ship.pos = node ? { ...node.pos } : { x: 680, y: 420 };
    const res = enterIslandEpisode(campaign, islandId, rpgRegistry);
    if (res.allowed && res.runtime) {
      ctx.setIslandRuntime(res.runtime);
      ctx.switchToScene('ISLAND_EPISODE');
    }
  } else if (actionKey === 'dock_egghead') {
    for (const epId of [
      'ep_east_blue_start',
      'ep_orange_town',
      'ep_baratie',
      'ep_arlong_park',
      'ep_loguetown',
      'ep_drum_kingdom',
      'ep_alabasta',
      'ep_skypiea',
      'ep_water_seven',
      'ep_thriller_bark',
      'ep_marineford',
      'ep_wano'
    ]) {
      completeEpisode(campaign, epId, rpgRegistry, gameRegistry);
    }
    campaign.currentZoneId = 'new_world';
    campaign.ship.pos = { x: 1240, y: 720 };
    const res = enterIslandEpisode(campaign, 'egghead', rpgRegistry);
    if (res.allowed && res.runtime) {
      ctx.setIslandRuntime(res.runtime);
      ctx.switchToScene('ISLAND_EPISODE');
    }
  } else if (actionKey === 'dock_elbaf') {
    for (const epId of [
      'ep_east_blue_start',
      'ep_orange_town',
      'ep_baratie',
      'ep_arlong_park',
      'ep_loguetown',
      'ep_drum_kingdom',
      'ep_alabasta',
      'ep_skypiea',
      'ep_water_seven',
      'ep_thriller_bark',
      'ep_marineford',
      'ep_wano',
      'ep_egghead'
    ]) {
      completeEpisode(campaign, epId, rpgRegistry, gameRegistry);
    }
    campaign.currentZoneId = 'new_world';
    campaign.ship.pos = { x: 1760, y: 460 };
    const res = enterIslandEpisode(campaign, 'elbaf', rpgRegistry);
    if (res.allowed && res.runtime) {
      ctx.setIslandRuntime(res.runtime);
      ctx.switchToScene('ISLAND_EPISODE');
    }
  } else if (actionKey === 'clear_current_island') {
    const rt = ctx.getIslandRuntime();
    if (ctx.activeScene === 'ISLAND_EPISODE' && rt) {
      const isl = rpgRegistry.islands[rt.islandId];
      if (isl) {
        completeEpisode(campaign, isl.episodeId, rpgRegistry, gameRegistry);
        ctx.setShowWantedPosterOverlay(true);
      }
    }
  }
  void ctx.triggerAutoSave('스토리 진행');
  ctx.refreshSideDrawer();
}

export function runSandboxShowcaseScenario(
  battleWorld: BattleWorldState,
  gameRegistry: GameDataRegistry,
  kind: SandboxShowcaseKind
): void {
  const alpha = battleWorld.units.find(
    (u) => u.team === 'ALPHA' && u.isOnField && u.isAlive
  );
  const omega = battleWorld.units.find(
    (u) => u.team === 'OMEGA' && u.isOnField && u.isAlive
  );
  if (!alpha || !omega) return;

  battleWorld.projectiles = [];
  battleWorld.beams = [];
  battleWorld.meleeArcs = [];
  battleWorld.beamClashes = [];
  battleWorld.meleeBeamGuards = [];
  battleWorld.meleeClashes = [];

  alpha.pos = {
    x: battleWorld.arenaWidth * 0.34,
    y: battleWorld.arenaHeight * 0.5
  };
  alpha.prevPos = { ...alpha.pos };
  alpha.aimDir = { x: 1, y: 0 };

  omega.pos = {
    x: battleWorld.arenaWidth * 0.66,
    y: battleWorld.arenaHeight * 0.5
  };
  omega.prevPos = { ...omega.pos };
  omega.aimDir = { x: -1, y: 0 };

  const getMove = (id: string) =>
    gameRegistry.moves[id] ?? Object.values(gameRegistry.moves)[0]!;

  if (kind === 'BEAM_CLASH') {
    spawnBeamInstance(
      alpha,
      getMove('move_kaido_boro_breath'),
      { x: 1, y: 0 },
      battleWorld,
      gameRegistry
    );
    spawnBeamInstance(
      omega,
      getMove('move_kizaru_laser_beam'),
      { x: -1, y: 0 },
      battleWorld,
      gameRegistry
    );
  } else if (kind === 'CONQUEROR_CLASH') {
    alpha.pos.x = battleWorld.arenaWidth * 0.44;
    omega.pos.x = battleWorld.arenaWidth * 0.56;
    spawnMeleeArcInstance(
      alpha,
      getMove('move_luffy_bajrang_gun'),
      { x: 1, y: 0 },
      battleWorld,
      gameRegistry
    );
    spawnMeleeArcInstance(
      omega,
      getMove('move_kaido_ragnaraku'),
      { x: -1, y: 0 },
      battleWorld,
      gameRegistry
    );
  } else if (kind === 'HAGOROMO_AWAKENING') {
    alpha.hasUsedFormShift = false;
    alpha.exhaustionTimer = 0;
    activateFormShift(alpha, battleWorld, gameRegistry, 'form_luffy_gear5');
    omega.hasUsedFormShift = false;
    omega.exhaustionTimer = 0;
    activateFormShift(omega, battleWorld, gameRegistry, 'form_lucci_awakened');
  } else if (kind === 'ZOAN_CYCLE') {
    alpha.stanceCooldownTimer = 0;
    omega.stanceCooldownTimer = 0;
    cycleZoanStance(alpha, battleWorld, gameRegistry);
    cycleZoanStance(omega, battleWorld, gameRegistry);
  } else if (kind === 'LOGIA_PASS') {
    omega.fruitType = 'LOGIA';
    omega.traitId = 'ability_pika_logia';
    omega.iframeTimer = 0;
    const p = spawnProjectileInstance(
      alpha,
      getMove('move_kizaru_yasakani'),
      { x: 1, y: 0 },
      battleWorld,
      gameRegistry
    );
    p.hasArmamentHaki = false;
    p.pos = { x: omega.pos.x - 10, y: omega.pos.y };
  }
}
