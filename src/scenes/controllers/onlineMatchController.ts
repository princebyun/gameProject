import { LockstepSyncController, type LockstepConfig } from '../../core/net/lockstepController';
import type {
  OnlineRosterPayload,
  PartyRuleMode,
  ServerToClientMessage
} from '../../core/net/protocol';
import {
  applyTerminalBattleOutcome,
  capturePreTerminalPartySnapshot,
  createStandardPresetBuild
} from '../../core/net/terminalArenaRule';
import type { NetworkTransport } from '../../core/net/transport';
import { recordRaidOutcome } from '../../core/endgame/raid';
import type { UnitBuildConfig } from '../../core/types/battleState';
import { assertNever } from '../../core/types/exhaustive';
import { WebSocketTransport } from '../../platform/net/webSocketTransport';
import { renderOnlineLobbyModalContents as renderOnlineLobbyModalDom } from '../modals/onlineLobbyModal';
import type { Disposable } from '../sceneTypes';
import type { SceneManagerHost } from './controllerContracts';

export class OnlineMatchController implements Disposable {
  constructor(private readonly host: SceneManagerHost) {}

  public dispose(): void {
    this.host.activeTransport?.disconnect();
    this.host.activeTransport = null;
    this.host.activeLockstep = null;
  }

  public async ensureOnlineTransportConnected(
    preferWebSocket: boolean = true
  ): Promise<NetworkTransport> {
    if (this.host.activeTransport && this.host.activeTransport.isConnected()) {
      return this.host.activeTransport;
    }

    const clientId = `peer_${Math.floor(Math.random() * 900000 + 100000)}`;
    if (preferWebSocket && typeof window !== 'undefined' && navigator.onLine !== false) {
      try {
        const wsTransport = new WebSocketTransport(
          clientId,
          this.host.platformBridge.multiplayerUrl
        );
        await wsTransport.connect();
        this.attachTransportHandlers(wsTransport);
        this.host.activeTransport = wsTransport;
        return wsTransport;
      } catch {
        // Fallback to local LoopbackNetworkHub if ws://localhost:8787 is not running
      }
    }

    const loopTransport = this.host.loopbackHub.createClientTransport(clientId);
    await loopTransport.connect();
    this.attachTransportHandlers(loopTransport);
    this.host.activeTransport = loopTransport;
    return loopTransport;
  }

  private attachTransportHandlers(transport: NetworkTransport): void {
    transport.onMessage((msg: ServerToClientMessage) => {
      switch (msg.type) {
        case 'ROOM_JOINED':
          this.host.currentRoomState = msg.roomState;
          this.host.onlineAssignedRole = msg.assignedRole;
          this.host.onlineAssignedSlotIndex = msg.assignedSlotIndex;
          this.host.onlineErrorNotice = null;
          this.renderOnlineLobbyModalContents();
          break;
        case 'ROOM_STATE_UPDATED':
          this.host.currentRoomState = msg.roomState;
          this.renderOnlineLobbyModalContents();
          break;
        case 'MATCH_STARTED': {
          const cfg: LockstepConfig = {
            roomCode: msg.roomCode,
            matchSeed: msg.matchSeed,
            battleConfig: msg.battleConfig,
            humanSlotIndices: msg.humanSlotIndices,
            slotToUnitInstanceId: msg.slotToUnitInstanceId,
            localSlotIndex:
              this.host.onlineAssignedRole === 'SPECTATOR'
                ? -1
                : this.host.onlineAssignedSlotIndex,
            inputDelayTicks: msg.inputDelayTicks
          };
          this.host.activeLockstep = new LockstepSyncController(
            cfg,
            this.host.gameRegistry,
            transport
          );
          this.host.spectatorCameraTarget = 'ALL';
          this.host.onlineModalEl.classList.remove('open');
          this.host.switchToScene('ONLINE_BATTLE');
          break;
        }
        case 'TICK_INPUT_BUNDLE':
          this.host.activeLockstep?.recordIncomingFrames(msg.tick, msg.frames);
          break;
        case 'DESYNC_ALERT':
          if (this.host.activeLockstep) {
            this.host.activeLockstep.desyncDetected = true;
            this.host.activeLockstep.desyncReason = `Tick ${msg.tick} 상태 해시 불일치 (${msg.offendingClientId}): 기대값 ${msg.expectedHash.slice(0, 8)} != 보고값 ${msg.reportedHash.slice(0, 8)}`;
          }
          this.host.campaign.voyageLog.push(
            `[DESYNC_DETECTED] Tick ${msg.tick} 동기화 어긋남 감지로 매치가 안전 중단되었습니다.`
          );
          break;
        case 'PEER_DISCONNECTED':
          this.host.activeLockstep?.notifyPeerDisconnected(msg.reconnectWaitSec);
          break;
        case 'MATCH_ENDED':
          this.finishOnlineMatch(msg.winnerTeam, msg.reason);
          break;
        case 'ERROR_REJECTED':
          this.host.onlineErrorNotice = `[${msg.code}] ${msg.message}`;
          this.renderOnlineLobbyModalContents();
          break;
        case 'PONG':
          break;
        default:
          assertNever(msg, 'Unhandled ServerToClientMessage');
      }
    });
  }

  public buildOnlineRosterPayload(partyRule: PartyRuleMode): OnlineRosterPayload {
    const saveEnv = this.host.buildCurrentSaveEnvelope('auto');
    const units: UnitBuildConfig[] = this.host.campaign.activePartyUnitIds.map(
      (uid, idx) =>
        createStandardPresetBuild(uid, `online_${idx}_${uid}`, true, 4, this.host.gameRegistry)
    );
    return {
      partyRule,
      saveEnvelope: partyRule === 'rpg_save' ? saveEnv : undefined,
      units
    };
  }

  public openOnlineLobbyModal(fromIslandTerminal: boolean = false): void {
    this.host.isTerminalOnlineMatch = fromIslandTerminal;
    if (fromIslandTerminal) {
      this.host.preTerminalSnapshot = capturePreTerminalPartySnapshot(
        this.host.buildCurrentSaveEnvelope('auto')
      );
    }
    this.host.onlineModalEl.classList.add('open');
    this.renderOnlineLobbyModalContents();
  }

  public renderOnlineLobbyModalContents(): void {
    renderOnlineLobbyModalDom({
      onlineModalEl: this.host.onlineModalEl,
      campaign: this.host.campaign,
      rpgRegistry: this.host.rpgRegistry,
      gameRegistry: this.host.gameRegistry,
      endgameRegistry: this.host.endgameRegistry,
      getCurrentRoomState: () => this.host.currentRoomState,
      setCurrentRoomState: (room) => {
        this.host.currentRoomState = room;
      },
      getOnlineAssignedRole: () => this.host.onlineAssignedRole,
      setOnlineAssignedRole: (role) => {
        this.host.onlineAssignedRole = role;
      },
      getOnlineErrorNotice: () => this.host.onlineErrorNotice,
      setOnlineErrorNotice: (msg) => {
        this.host.onlineErrorNotice = msg;
      },
      getIsTerminalOnlineMatch: () => this.host.isTerminalOnlineMatch,
      getOnlineLobbyDefaultMode: () => this.host.onlineLobbyDefaultMode,
      getSelectedRaidId: () => this.host.selectedRaidId,
      getActiveTransport: () => this.host.activeTransport,
      ensureOnlineTransportConnected: (preferWs) =>
        this.ensureOnlineTransportConnected(preferWs),
      buildCurrentSaveEnvelope: (slot) => this.host.buildCurrentSaveEnvelope(slot),
      buildOnlineRosterPayload: (rule) => this.buildOnlineRosterPayload(rule)
    });
  }

  public finishOnlineMatch(winnerTeam: 'ALPHA' | 'OMEGA' | 'DRAW', reason: string): void {
    const isCoopRaid = this.host.currentRoomState?.mode === 'COOP_RAID';
    const myTeam = isCoopRaid
      ? 'ALPHA'
      : this.host.onlineAssignedSlotIndex === 0 || this.host.onlineAssignedSlotIndex === 1
        ? 'ALPHA'
        : 'OMEGA';
    if (isCoopRaid && winnerTeam === 'ALPHA' && this.host.currentRoomState?.raidId) {
      recordRaidOutcome(
        this.host.currentRoomState.raidId,
        true,
        this.host.activeLockstep?.world.elapsedSec ?? 30,
        this.host.campaign,
        this.host.endgameRegistry
      );
    }
    const outcome: 'WIN' | 'LOSS' | 'DRAW' =
      winnerTeam === 'DRAW'
        ? 'DRAW'
        : winnerTeam === myTeam
          ? 'WIN'
          : 'LOSS';

    if (this.host.onlineAssignedRole === 'PLAYER') {
      if (this.host.isTerminalOnlineMatch && this.host.preTerminalSnapshot) {
        const currentEnv = this.host.buildCurrentSaveEnvelope('auto');
        const updatedEnv = applyTerminalBattleOutcome(
          this.host.campaign,
          currentEnv,
          outcome,
          this.host.preTerminalSnapshot
        );
        void this.host.storage.saveSlot('auto', updatedEnv);
      } else {
        if (outcome === 'WIN') this.host.campaign.onlineStats.wins += 1;
        else if (outcome === 'LOSS') this.host.campaign.onlineStats.losses += 1;
        else this.host.campaign.onlineStats.draws += 1;
        void this.host.triggerAutoSave('통신 대전 종료');
      }
    }

    this.host.campaign.voyageLog.push(`[통신 대전 종료] ${reason} (승자: ${winnerTeam})`);
    this.host.activeLockstep = null;
    this.host.clearTransientFocusAndInput();
    if (this.host.isTerminalOnlineMatch && this.host.islandRuntime) {
      this.host.switchToScene('ISLAND_EPISODE');
    } else {
      this.host.switchToScene('SEA_SAILING');
    }
    this.openOnlineLobbyModal(this.host.isTerminalOnlineMatch);
  }
}
