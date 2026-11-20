import type { SaveEnvelope } from '../save/schema';
import type {
  BattleWorldConfig,
  BattleWorldState,
  UnitBuildConfig,
  UnitInputCommand
} from '../types/battleState';

export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const ROOM_CODE_LENGTH = 6;
export const MAX_SPECTATORS_PER_ROOM = 4;

export type PartyRuleMode = 'rpg_save' | 'standard_preset';

export type OnlineErrorCode =
  | 'ERR_VERSION_MISMATCH'
  | 'ERR_ILLEGAL_SAVE'
  | 'ERR_ROOM_NOT_FOUND'
  | 'ERR_ROOM_FULL'
  | 'DESYNC_DETECTED';

export function generateRoomCode(nextIntFn: (maxExclusive: number) => number): string {
  let code = '';
  for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
    const idx = Math.abs(nextIntFn(ROOM_CODE_ALPHABET.length)) % ROOM_CODE_ALPHABET.length;
    code += ROOM_CODE_ALPHABET[idx];
  }
  return code;
}

export interface InputFrame {
  tick: number;
  slotIndex: number; // 0..3
  moveX: number;     // quantized -100..100
  moveY: number;     // quantized -100..100
  aimAngle: number;  // quantized milliradians (-3142..3142)
  /**
   * Bitflags:
   * bit 0..3: skill 0..3 pressed
   * bit 4: dodge pressed
   * bit 5: formShift (Zoan cycle) pressed
   * bit 6: awakening (Shift+F) pressed
   * bit 7: quickSwap pressed
   * bit 8: guardHeld (Armament Guard / Just Guard)
   * bit 9: bondComboPressed (2:2 Bond Tag Combo)
   */
  actionBits: number;
  /** Phase 16: Explicit Armament Guard hold state for 60Hz parry timing parity */
  guardHeld?: boolean;
  /** Phase 16: Exact tick when guard was pressed (-1 when not freshly initiated) */
  guardPressedTick?: number;
}

export function createNeutralInputFrame(tick: number, slotIndex: number): InputFrame {
  return {
    tick,
    slotIndex,
    moveX: 0,
    moveY: 0,
    aimAngle: slotIndex % 2 === 0 ? 0 : 3142,
    actionBits: 0,
    guardHeld: false,
    guardPressedTick: -1
  };
}

export function encodeUnitCommandToInputFrame(
  tick: number,
  slotIndex: number,
  cmd: UnitInputCommand | null
): InputFrame {
  if (!cmd) {
    return createNeutralInputFrame(tick, slotIndex);
  }
  const moveX = Math.round(Math.max(-1, Math.min(1, cmd.moveVec.x)) * 100);
  const moveY = Math.round(Math.max(-1, Math.min(1, cmd.moveVec.y)) * 100);
  const aimAngle = cmd.aimVec
    ? Math.round(Math.atan2(cmd.aimVec.y, cmd.aimVec.x) * 1000)
    : 0;

  let bits = 0;
  if (cmd.castMoveSlotIndex !== null && cmd.castMoveSlotIndex >= 0 && cmd.castMoveSlotIndex <= 3) {
    bits |= 1 << cmd.castMoveSlotIndex;
  }
  if (cmd.dodgePressed) bits |= 1 << 4;
  if (cmd.formShiftPressed) bits |= 1 << 5;
  if (cmd.awakeningPressed) bits |= 1 << 6;
  if (cmd.swapToBenchUnitId) bits |= 1 << 7;
  const guardHeld = Boolean(cmd.guardHeld);
  if (guardHeld) bits |= 1 << 8;
  if (cmd.bondComboPressed) bits |= 1 << 9;

  return {
    tick,
    slotIndex,
    moveX,
    moveY,
    aimAngle,
    actionBits: bits,
    guardHeld,
    guardPressedTick: cmd.guardPressedTick ?? (guardHeld ? tick : -1)
  };
}

export function decodeInputFrameToUnitCommand(
  frame: InputFrame,
  unitId: string,
  world: BattleWorldState
): UnitInputCommand {
  const moveVec = {
    x: frame.moveX / 100,
    y: frame.moveY / 100
  };
  const rad = frame.aimAngle / 1000;
  const aimVec = {
    x: Math.cos(rad),
    y: Math.sin(rad)
  };

  let castMoveSlotIndex: number | null = null;
  for (let s = 0; s < 4; s++) {
    if ((frame.actionBits & (1 << s)) !== 0) {
      castMoveSlotIndex = s;
      break;
    }
  }

  const dodgePressed = (frame.actionBits & (1 << 4)) !== 0;
  const formShiftPressed = (frame.actionBits & (1 << 5)) !== 0;
  const awakeningPressed = (frame.actionBits & (1 << 6)) !== 0;
  const guardHeld = frame.guardHeld ?? (frame.actionBits & (1 << 8)) !== 0;
  const bondComboPressed = (frame.actionBits & (1 << 9)) !== 0;

  let swapToBenchUnitId: string | null = null;
  if ((frame.actionBits & (1 << 7)) !== 0) {
    const unit = world.units.find((u) => u.instanceId === unitId);
    if (unit) {
      const bench = world.units.find(
        (u) => u.team === unit.team && !u.isOnField && u.isAlive
      );
      if (bench) {
        swapToBenchUnitId = bench.instanceId;
      }
    }
  }

  return {
    unitId,
    moveVec,
    aimVec,
    castMoveSlotIndex,
    dodgePressed,
    formShiftPressed,
    awakeningPressed,
    swapToBenchUnitId,
    guardHeld,
    guardPressedTick: frame.guardPressedTick ?? (guardHeld ? frame.tick : -1),
    bondComboPressed
  };
}

export interface OnlineRosterPayload {
  partyRule: PartyRuleMode;
  saveEnvelope?: SaveEnvelope;
  units: UnitBuildConfig[];
}

export interface RoomCombatSlotInfo {
  slotIndex: number; // 0..1 in 1V1; 0..3 in 2V2
  team: 'ALPHA' | 'OMEGA';
  occupantType: 'EMPTY' | 'HUMAN' | 'CPU';
  clientId: string | null;
  playerName: string;
  ready: boolean;
  aiLevel: number;
  speciesId: string;
  pingMs: number;
}

export interface RoomSpectatorInfo {
  clientId: string;
  playerName: string;
  pingMs: number;
}

export interface RoomStateSnapshot {
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
  spectators: RoomSpectatorInfo[];
}

export type ClientToServerMessage =
  | {
      type: 'CREATE_ROOM';
      clientId: string;
      playerName: string;
      battleCalcVersion: string;
      mode: '1V1' | '2V2' | 'COOP_RAID';
      raidId?: string;
      partyRule: PartyRuleMode;
      arenaSizeKey: 'small' | 'medium' | 'large';
      awakeningAllowed: boolean;
      roster: OnlineRosterPayload;
    }
  | {
      type: 'JOIN_ROOM';
      roomCode: string;
      clientId: string;
      playerName: string;
      battleCalcVersion: string;
      asSpectator: boolean;
      roster?: OnlineRosterPayload;
    }
  | { type: 'SET_READY'; roomCode: string; ready: boolean }
  | {
      type: 'CONFIGURE_CPU_SLOT';
      roomCode: string;
      slotIndex: number;
      enabled: boolean;
      aiLevel: number;
      speciesId?: string;
    }
  | { type: 'START_MATCH'; roomCode: string }
  | { type: 'INPUT_FRAME'; roomCode: string; frame: InputFrame }
  | {
      type: 'STATE_HASH_REPORT';
      roomCode: string;
      tick: number;
      stateHash: string;
    }
  | { type: 'FORFEIT_MATCH'; roomCode: string }
  | { type: 'LEAVE_ROOM'; roomCode: string }
  | { type: 'PING'; clientTimestampMs: number };

export type ServerToClientMessage =
  | {
      type: 'ROOM_JOINED';
      roomCode: string;
      assignedRole: 'PLAYER' | 'SPECTATOR';
      assignedSlotIndex: number;
      roomState: RoomStateSnapshot;
    }
  | { type: 'ROOM_STATE_UPDATED'; roomState: RoomStateSnapshot }
  | {
      type: 'MATCH_STARTED';
      roomCode: string;
      matchSeed: number;
      battleCalcVersion: string;
      battleConfig: BattleWorldConfig;
      humanSlotIndices: number[];
      slotToUnitInstanceId: Record<number, string>;
      inputDelayTicks: number;
    }
  | { type: 'TICK_INPUT_BUNDLE'; tick: number; frames: InputFrame[] }
  | {
      type: 'DESYNC_ALERT';
      tick: number;
      expectedHash: string;
      reportedHash: string;
      offendingClientId: string;
    }
  | {
      type: 'PEER_DISCONNECTED';
      clientId: string;
      playerName: string;
      reconnectWaitSec: number;
    }
  | {
      type: 'MATCH_ENDED';
      winnerTeam: 'ALPHA' | 'OMEGA' | 'DRAW';
      reason: string;
    }
  | {
      type: 'ERROR_REJECTED';
      code: OnlineErrorCode;
      message: string;
      clientVersion?: string;
      roomVersion?: string;
      violationCodes?: string[];
    }
  | { type: 'PONG'; clientTimestampMs: number; serverTimestampMs: number };
