import { BATTLE_CALC_VERSION } from '../src/core/constants';
import {
  buildRaidBossUnitBuild,
  buildRaidConfigFromDef
} from '../src/core/endgame/raid';
import { SeededPRNG } from '../src/core/math/prng';
import { defaultEndgameRegistry } from '../src/data/endgame/endgameRegistry';
import {
  generateRoomCode,
  MAX_SPECTATORS_PER_ROOM,
  type ClientToServerMessage,
  type InputFrame,
  type OnlineRosterPayload,
  type PartyRuleMode,
  type RoomCombatSlotInfo,
  type RoomSpectatorInfo,
  type RoomStateSnapshot,
  type ServerToClientMessage
} from '../src/core/net/protocol';
import { createStandardPresetBuild } from '../src/core/net/terminalArenaRule';
import { canEnterOnlineBattle } from '../src/core/save/antiCheat';
import { assertNever } from '../src/core/types/exhaustive';
import type { GameDataRegistry } from '../src/core/types/dataSchemas';
import type {
  BattleWorldConfig,
  UnitBuildConfig
} from '../src/core/types/battleState';
import type { RpgDataRegistry } from '../src/core/types/rpgSchemas';

export type ServerSendCallback = (
  clientId: string,
  msg: ServerToClientMessage
) => void;

interface RoomInternalState {
  roomCode: string;
  hostClientId: string;
  battleCalcVersion: string;
  mode: '1V1' | '2V2' | 'COOP_RAID';
  raidId?: string;
  partyRule: PartyRuleMode;
  arenaSizeKey: 'small' | 'medium' | 'large';
  awakeningAllowed: boolean;
  status: 'LOBBY' | 'IN_MATCH' | 'FINISHED';
  slots: RoomCombatSlotInfo[];
  slotRosters: Map<number, UnitBuildConfig[]>;
  spectators: RoomSpectatorInfo[];
  matchSeed: number;
  humanSlotIndices: number[];
  tickInputs: Map<number, Map<number, InputFrame>>;
  tickHashes: Map<number, { firstClientId: string; hash: string }>;
}

export class AuthoritativeRoomCoordinator {
  private rooms = new Map<string, RoomInternalState>();
  private clientToRoom = new Map<string, string>();
  private prng = new SeededPRNG(20261119);

  constructor(
    private readonly gameRegistry: GameDataRegistry,
    private readonly rpgRegistry: RpgDataRegistry,
    private readonly sendToClient: ServerSendCallback,
    private readonly serverVersion: string = BATTLE_CALC_VERSION
  ) {}

  private broadcastToRoom(room: RoomInternalState, msg: ServerToClientMessage): void {
    const recipients = new Set<string>();
    for (const slot of room.slots) {
      if (slot.occupantType === 'HUMAN' && slot.clientId) {
        recipients.add(slot.clientId);
      }
    }
    for (const spec of room.spectators) {
      recipients.add(spec.clientId);
    }
    for (const cid of recipients) {
      this.sendToClient(cid, msg);
    }
  }

  private toSnapshot(room: RoomInternalState): RoomStateSnapshot {
    return {
      roomCode: room.roomCode,
      hostClientId: room.hostClientId,
      battleCalcVersion: room.battleCalcVersion,
      mode: room.mode,
      raidId: room.raidId,
      partyRule: room.partyRule,
      arenaSizeKey: room.arenaSizeKey,
      awakeningAllowed: room.awakeningAllowed,
      status: room.status,
      slots: room.slots.map((s) => ({ ...s })),
      spectators: room.spectators.map((sp) => ({ ...sp }))
    };
  }

  /**
   * Server-side 2-Stage Anti-Cheat Verification for 'rpg_save' mode
   */
  private validatePlayerRosterOnServer(
    partyRule: PartyRuleMode,
    roster: OnlineRosterPayload | undefined
  ): { valid: boolean; violationCodes: string[]; reason: string } {
    if (!roster || !Array.isArray(roster.units) || roster.units.length === 0) {
      return {
        valid: false,
        violationCodes: ['ILLEGAL_CREW_OR_SHIP'],
        reason: '참가 파티 유닛 데이터가 누락되었습니다.'
      };
    }

    if (partyRule === 'rpg_save') {
      if (!roster.saveEnvelope) {
        return {
          valid: false,
          violationCodes: ['INTEGRITY_MISMATCH'],
          reason: '내 세이브 파티전(rpg_save) 참가에는 SaveEnvelope 서명 검증 블록이 필요합니다.'
        };
      }

      const gateCheck = canEnterOnlineBattle(
        roster.saveEnvelope,
        this.rpgRegistry,
        this.gameRegistry
      );
      if (!gateCheck.allowed) {
        return {
          valid: false,
          violationCodes: roster.saveEnvelope.meta.antiCheat.violationCodes,
          reason: gateCheck.reasons.join(' / ')
        };
      }
    }

    // Validate individual unit builds submitted in roster.units
    for (const u of roster.units) {
      const unitDef = this.gameRegistry.units[u.speciesId];
      if (!unitDef) {
        return {
          valid: false,
          violationCodes: ['ILLEGAL_UNIT_STATE'],
          reason: `존재하지 않는 캐릭터 ID(${u.speciesId})가 로스터에 포함되어 있습니다.`
        };
      }
      if (!Number.isInteger(u.level) || u.level < 1 || u.level > 100) {
        return {
          valid: false,
          violationCodes: ['ILLEGAL_UNIT_STATE'],
          reason: `${unitDef.name} 레벨 범위 초과 (Lv.${u.level})`
        };
      }
      if (u.moveIds.length > 4) {
        return {
          valid: false,
          violationCodes: ['ILLEGAL_UNIT_STATE'],
          reason: `${unitDef.name} 장착 스킬 개수 초과 (${u.moveIds.length}개)`
        };
      }
      for (const mId of u.moveIds) {
        if (!this.gameRegistry.moves[mId]) {
          return {
            valid: false,
            violationCodes: ['ILLEGAL_UNIT_STATE'],
            reason: `미존재 불법 스킬 장착 감지: ${mId}`
          };
        }
      }
    }

    return { valid: true, violationCodes: [], reason: '' };
  }

  public handleMessage(clientId: string, msg: ClientToServerMessage): void {
    if (msg.type === 'PING') {
      this.sendToClient(clientId, {
        type: 'PONG',
        clientTimestampMs: msg.clientTimestampMs,
        serverTimestampMs: Date.now()
      });
      return;
    }

    if (msg.type === 'CREATE_ROOM') {
      // 1. Strict BATTLE_CALC_VERSION verification
      if (msg.battleCalcVersion !== this.serverVersion) {
        this.sendToClient(clientId, {
          type: 'ERROR_REJECTED',
          code: 'ERR_VERSION_MISMATCH',
          clientVersion: msg.battleCalcVersion,
          roomVersion: this.serverVersion,
          message: `배틀 계산 버전이 달라 통신 대전에 연결할 수 없습니다. (내 버전: ${msg.battleCalcVersion} / 서버 버전: ${this.serverVersion}) — 두 플레이어 모두 최신 버전으로 업데이트해 주세요.`
        });
        return;
      }

      // 2. Server-side Anti-Cheat verification
      const rosterCheck = this.validatePlayerRosterOnServer(
        msg.partyRule,
        msg.roster
      );
      if (!rosterCheck.valid) {
        this.sendToClient(clientId, {
          type: 'ERROR_REJECTED',
          code: 'ERR_ILLEGAL_SAVE',
          violationCodes: rosterCheck.violationCodes,
          message: `[서버 안티치트 차단] ${rosterCheck.reason}`
        });
        return;
      }

      let roomCode = generateRoomCode((max) => this.prng.nextInt(0, max - 1));
      while (this.rooms.has(roomCode)) {
        roomCode = generateRoomCode((max) => this.prng.nextInt(0, max - 1));
      }

      const isCoopRaid = msg.mode === 'COOP_RAID';
      const resolvedRaidId = isCoopRaid
        ? msg.raidId && defaultEndgameRegistry.raids[msg.raidId]
          ? msg.raidId
          : 'raid_kaido_flame'
        : undefined;
      const totalSlots = isCoopRaid ? 3 : msg.mode === '2V2' ? 4 : 2;
      const slots: RoomCombatSlotInfo[] = [];
      for (let i = 0; i < totalSlots; i++) {
        const team: 'ALPHA' | 'OMEGA' = isCoopRaid
          ? 'ALPHA'
          : msg.mode === '2V2'
            ? i < 2
              ? 'ALPHA'
              : 'OMEGA'
            : i === 0
              ? 'ALPHA'
              : 'OMEGA';
        if (i === 0) {
          slots.push({
            slotIndex: 0,
            team,
            occupantType: 'HUMAN',
            clientId,
            playerName: msg.playerName,
            ready: true,
            aiLevel: 4,
            speciesId: msg.roster.units[0]?.speciesId ?? 'luffy',
            pingMs: 12
          });
        } else {
          slots.push({
            slotIndex: i,
            team,
            occupantType: 'EMPTY',
            clientId: null,
            playerName: '빈 슬롯 (Open)',
            ready: false,
            aiLevel: 4,
            speciesId: isCoopRaid
              ? i === 1
                ? 'zoro'
                : 'sanji'
              : i === 1
                ? 'zoro'
                : i === 2
                  ? 'kaido'
                  : 'kizaru',
            pingMs: 0
          });
        }
      }

      const room: RoomInternalState = {
        roomCode,
        hostClientId: clientId,
        battleCalcVersion: this.serverVersion,
        mode: msg.mode,
        raidId: resolvedRaidId,
        partyRule: msg.partyRule,
        arenaSizeKey: isCoopRaid ? 'large' : msg.arenaSizeKey,
        awakeningAllowed: msg.awakeningAllowed,
        status: 'LOBBY',
        slots,
        slotRosters: new Map([[0, msg.roster.units]]),
        spectators: [],
        matchSeed: this.prng.nextInt(100000, 99999999),
        humanSlotIndices: [0],
        tickInputs: new Map(),
        tickHashes: new Map()
      };

      this.rooms.set(roomCode, room);
      this.clientToRoom.set(clientId, roomCode);

      this.sendToClient(clientId, {
        type: 'ROOM_JOINED',
        roomCode,
        assignedRole: 'PLAYER',
        assignedSlotIndex: 0,
        roomState: this.toSnapshot(room)
      });
      return;
    }

    if (msg.type === 'JOIN_ROOM') {
      const code = msg.roomCode.trim().toUpperCase();
      const room = this.rooms.get(code);
      if (!room) {
        this.sendToClient(clientId, {
          type: 'ERROR_REJECTED',
          code: 'ERR_ROOM_NOT_FOUND',
          message: `방 코드 [${code}]에 해당하는 대기실을 찾을 수 없습니다.`
        });
        return;
      }

      // 1. Strict BATTLE_CALC_VERSION parity check
      if (
        msg.battleCalcVersion !== room.battleCalcVersion ||
        msg.battleCalcVersion !== this.serverVersion
      ) {
        this.sendToClient(clientId, {
          type: 'ERROR_REJECTED',
          code: 'ERR_VERSION_MISMATCH',
          clientVersion: msg.battleCalcVersion,
          roomVersion: room.battleCalcVersion,
          message: `배틀 계산 버전이 달라 통신 대전에 연결할 수 없습니다. (내 버전: ${msg.battleCalcVersion} / 방 버전: ${room.battleCalcVersion}) — 두 플레이어 모두 최신 버전으로 업데이트해 주세요.`
        });
        return;
      }

      if (msg.asSpectator) {
        if (room.spectators.length >= MAX_SPECTATORS_PER_ROOM) {
          this.sendToClient(clientId, {
            type: 'ERROR_REJECTED',
            code: 'ERR_ROOM_FULL',
            message: `관전자 슬롯(최대 ${MAX_SPECTATORS_PER_ROOM}명)이 모두 찼습니다.`
          });
          return;
        }

        room.spectators.push({
          clientId,
          playerName: msg.playerName,
          pingMs: 14
        });
        this.clientToRoom.set(clientId, room.roomCode);

        this.sendToClient(clientId, {
          type: 'ROOM_JOINED',
          roomCode: room.roomCode,
          assignedRole: 'SPECTATOR',
          assignedSlotIndex: -1,
          roomState: this.toSnapshot(room)
        });
        this.broadcastToRoom(room, {
          type: 'ROOM_STATE_UPDATED',
          roomState: this.toSnapshot(room)
        });
        return;
      }

      // Joining as Player -> run Server 2-Stage Anti-Cheat
      const rosterCheck = this.validatePlayerRosterOnServer(
        room.partyRule,
        msg.roster
      );
      if (!rosterCheck.valid) {
        this.sendToClient(clientId, {
          type: 'ERROR_REJECTED',
          code: 'ERR_ILLEGAL_SAVE',
          violationCodes: rosterCheck.violationCodes,
          message: `[서버 안티치트 차단] ${rosterCheck.reason}`
        });
        return;
      }

      // Prefer assigning opposing OMEGA lead slot in PvP; sequential ALPHA slots in COOP_RAID
      const preferredOrder =
        room.mode === 'COOP_RAID'
          ? [1, 2, 0]
          : room.mode === '2V2'
            ? [2, 1, 3, 0]
            : [1, 0];
      let targetSlot: RoomCombatSlotInfo | undefined;
      for (const idx of preferredOrder) {
        if (room.slots[idx] && room.slots[idx].occupantType === 'EMPTY') {
          targetSlot = room.slots[idx];
          break;
        }
      }

      if (!targetSlot) {
        this.sendToClient(clientId, {
          type: 'ERROR_REJECTED',
          code: 'ERR_ROOM_FULL',
          message: '플레이어 전투 슬롯이 모두 찼습니다. 관전자 모드로 참가해 주세요.'
        });
        return;
      }

      targetSlot.occupantType = 'HUMAN';
      targetSlot.clientId = clientId;
      targetSlot.playerName = msg.playerName;
      targetSlot.ready = true;
      targetSlot.speciesId = msg.roster?.units[0]?.speciesId ?? targetSlot.speciesId;
      targetSlot.pingMs = 15;

      if (msg.roster?.units) {
        room.slotRosters.set(targetSlot.slotIndex, msg.roster.units);
      }
      this.clientToRoom.set(clientId, room.roomCode);

      this.sendToClient(clientId, {
        type: 'ROOM_JOINED',
        roomCode: room.roomCode,
        assignedRole: 'PLAYER',
        assignedSlotIndex: targetSlot.slotIndex,
        roomState: this.toSnapshot(room)
      });
      this.broadcastToRoom(room, {
        type: 'ROOM_STATE_UPDATED',
        roomState: this.toSnapshot(room)
      });
      return;
    }

    if (msg.type === 'CONFIGURE_CPU_SLOT') {
      const room = this.rooms.get(msg.roomCode);
      if (!room || room.hostClientId !== clientId) return;
      const slot = room.slots[msg.slotIndex];
      if (!slot || slot.occupantType === 'HUMAN') return;

      if (msg.enabled) {
        slot.occupantType = 'CPU';
        slot.aiLevel = Math.max(1, Math.min(5, msg.aiLevel));
        if (msg.speciesId && this.gameRegistry.units[msg.speciesId]) {
          slot.speciesId = msg.speciesId;
        }
        slot.playerName = `CPU Lv.${slot.aiLevel} (${this.gameRegistry.units[slot.speciesId]?.name ?? slot.speciesId})`;
        slot.ready = true;
      } else {
        slot.occupantType = 'EMPTY';
        slot.playerName = '빈 슬롯 (Open)';
        slot.ready = false;
      }

      this.broadcastToRoom(room, {
        type: 'ROOM_STATE_UPDATED',
        roomState: this.toSnapshot(room)
      });
      return;
    }

    if (msg.type === 'SET_READY') {
      const room = this.rooms.get(msg.roomCode);
      if (!room) return;
      const slot = room.slots.find((s) => s.clientId === clientId);
      if (slot) {
        slot.ready = msg.ready;
        this.broadcastToRoom(room, {
          type: 'ROOM_STATE_UPDATED',
          roomState: this.toSnapshot(room)
        });
      }
      return;
    }

    if (msg.type === 'START_MATCH') {
      const room = this.rooms.get(msg.roomCode);
      if (!room || room.hostClientId !== clientId) return;

      // Auto-fill any remaining EMPTY slots with CPU Lv.4 so match can start cleanly
      for (const slot of room.slots) {
        if (slot.occupantType === 'EMPTY') {
          slot.occupantType = 'CPU';
          slot.aiLevel = 4;
          slot.ready = true;
          slot.playerName = `CPU Lv.4 (${this.gameRegistry.units[slot.speciesId]?.name ?? slot.speciesId})`;
        }
      }

      const teamAlpha: UnitBuildConfig[] = [];
      const teamOmega: UnitBuildConfig[] = [];
      const humanSlotIndices: number[] = [];
      const slotToUnitInstanceId: Record<number, string> = {};

      for (const slot of room.slots) {
        const isHuman = slot.occupantType === 'HUMAN';
        if (isHuman) {
          humanSlotIndices.push(slot.slotIndex);
        }

        const instanceId = `net_slot_${slot.slotIndex}_${slot.speciesId}`;
        slotToUnitInstanceId[slot.slotIndex] = instanceId;

        let build: UnitBuildConfig;
        const customRoster = room.slotRosters.get(slot.slotIndex);
        if (
          room.partyRule === 'rpg_save' &&
          isHuman &&
          customRoster &&
          customRoster[0]
        ) {
          build = {
            ...customRoster[0],
            instanceId,
            isPlayerControlled: true
          };
        } else {
          build = createStandardPresetBuild(
            slot.speciesId,
            instanceId,
            isHuman,
            slot.aiLevel,
            this.gameRegistry
          );
        }

        if (slot.team === 'ALPHA') {
          teamAlpha.push(build);
        } else {
          teamOmega.push(build);
        }
      }

      let raidConfig: BattleWorldConfig['raidConfig'] = undefined;
      if (room.mode === 'COOP_RAID') {
        const raidDef =
          defaultEndgameRegistry.raids[room.raidId ?? 'raid_kaido_flame'] ??
          Object.values(defaultEndgameRegistry.raids)[0];
        if (raidDef) {
          teamOmega.length = 0;
          teamOmega.push(buildRaidBossUnitBuild(raidDef, this.gameRegistry));
          raidConfig = buildRaidConfigFromDef(raidDef);
        }
      }

      room.status = 'IN_MATCH';
      room.humanSlotIndices = humanSlotIndices;
      room.tickInputs.clear();
      room.tickHashes.clear();

      const battleConfig: BattleWorldConfig = {
        seed: room.matchSeed,
        arenaSizeKey: room.mode === 'COOP_RAID' ? 'large' : room.arenaSizeKey,
        mode: room.mode,
        teamAlpha,
        teamOmega,
        raidConfig
      };

      this.broadcastToRoom(room, {
        type: 'MATCH_STARTED',
        roomCode: room.roomCode,
        matchSeed: room.matchSeed,
        battleCalcVersion: room.battleCalcVersion,
        battleConfig,
        humanSlotIndices,
        slotToUnitInstanceId,
        inputDelayTicks: 2
      });
      return;
    }

    if (msg.type === 'INPUT_FRAME') {
      const room = this.rooms.get(msg.roomCode);
      if (!room || room.status !== 'IN_MATCH') return;

      const { tick } = msg.frame;
      let tickMap = room.tickInputs.get(tick);
      if (!tickMap) {
        tickMap = new Map();
        room.tickInputs.set(tick, tickMap);
      }
      tickMap.set(msg.frame.slotIndex, msg.frame);

      // Once all human slots have submitted their frame for this tick, broadcast bundle to all peers & spectators
      const allHumansReady = room.humanSlotIndices.every((sIdx) =>
        tickMap!.has(sIdx)
      );
      if (allHumansReady) {
        const frames = Array.from(tickMap.values());
        room.tickInputs.delete(tick);
        this.broadcastToRoom(room, {
          type: 'TICK_INPUT_BUNDLE',
          tick,
          frames
        });
      }
      return;
    }

    if (msg.type === 'STATE_HASH_REPORT') {
      const room = this.rooms.get(msg.roomCode);
      if (!room || room.status !== 'IN_MATCH') return;

      const existing = room.tickHashes.get(msg.tick);
      if (!existing) {
        room.tickHashes.set(msg.tick, {
          firstClientId: clientId,
          hash: msg.stateHash
        });
      } else if (existing.hash !== msg.stateHash) {
        room.status = 'FINISHED';
        this.broadcastToRoom(room, {
          type: 'DESYNC_ALERT',
          tick: msg.tick,
          expectedHash: existing.hash,
          reportedHash: msg.stateHash,
          offendingClientId: clientId
        });
      }
      return;
    }

    if (msg.type === 'FORFEIT_MATCH') {
      const room = this.rooms.get(msg.roomCode);
      if (!room) return;
      const slot = room.slots.find((s) => s.clientId === clientId);
      const winnerTeam = slot?.team === 'ALPHA' ? 'OMEGA' : 'ALPHA';
      room.status = 'FINISHED';
      this.broadcastToRoom(room, {
        type: 'MATCH_ENDED',
        winnerTeam,
        reason: `${slot?.playerName ?? clientId}님이 배틀을 포기했습니다.`
      });
      return;
    }

    if (msg.type === 'LEAVE_ROOM') {
      this.handleClientDisconnect(clientId);
      return;
    }

    assertNever(msg, 'Unhandled ClientToServerMessage');
  }

  public handleClientDisconnect(clientId: string): void {
    const roomCode = this.clientToRoom.get(clientId);
    if (!roomCode) return;
    this.clientToRoom.delete(clientId);

    const room = this.rooms.get(roomCode);
    if (!room) return;

    const specIdx = room.spectators.findIndex((s) => s.clientId === clientId);
    if (specIdx >= 0) {
      room.spectators.splice(specIdx, 1);
      this.broadcastToRoom(room, {
        type: 'ROOM_STATE_UPDATED',
        roomState: this.toSnapshot(room)
      });
      return;
    }

    const slot = room.slots.find((s) => s.clientId === clientId);
    if (slot) {
      const disconnectedName = slot.playerName;
      slot.occupantType = 'EMPTY';
      slot.clientId = null;
      slot.ready = false;

      if (room.status === 'IN_MATCH') {
        this.broadcastToRoom(room, {
          type: 'PEER_DISCONNECTED',
          clientId,
          playerName: disconnectedName,
          reconnectWaitSec: 15
        });
      } else {
        this.broadcastToRoom(room, {
          type: 'ROOM_STATE_UPDATED',
          roomState: this.toSnapshot(room)
        });
      }
    }
  }
}
