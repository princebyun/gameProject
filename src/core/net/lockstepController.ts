import { createBattleWorld, stepBattleWorld } from '../combat/battleWorld';
import { FIXED_DT } from '../constants';
import { SeededPRNG } from '../math/prng';
import type { GameDataRegistry } from '../types/dataSchemas';
import type {
  BattleWorldConfig,
  BattleWorldState,
  UnitInputCommand
} from '../types/battleState';
import {
  createNeutralInputFrame,
  decodeInputFrameToUnitCommand,
  encodeUnitCommandToInputFrame,
  type InputFrame
} from './protocol';
import { computeBattleStateHash } from './stateHasher';
import type { NetworkTransport } from './transport';

export interface LockstepConfig {
  roomCode: string;
  matchSeed: number;
  battleConfig: BattleWorldConfig;
  humanSlotIndices: number[];
  slotToUnitInstanceId: Record<number, string>;
  localSlotIndex: number; // -1 for Spectator
  inputDelayTicks: number;
}

export class LockstepSyncController {
  public readonly world: BattleWorldState;
  public readonly prng: SeededPRNG;
  public readonly stateHashHistory = new Map<number, string>();
  public desyncDetected = false;
  public desyncReason: string | null = null;
  public opponentDisconnected = false;
  public reconnectCountdownSec = 0;

  private frameBuffer = new Map<number, Map<number, InputFrame>>();
  private nextLocalInputTick = 0;

  constructor(
    public readonly config: LockstepConfig,
    private readonly gameRegistry: GameDataRegistry,
    private readonly transport: NetworkTransport
  ) {
    this.prng = new SeededPRNG(config.matchSeed);
    this.world = createBattleWorld(config.battleConfig, gameRegistry);

    // Pre-fill initial delay ticks (0 .. inputDelayTicks - 1) with neutral frames for all human slots
    for (let t = 0; t < config.inputDelayTicks; t++) {
      const slotMap = new Map<number, InputFrame>();
      for (const slotIdx of config.humanSlotIndices) {
        slotMap.set(slotIdx, createNeutralInputFrame(t, slotIdx));
      }
      this.frameBuffer.set(t, slotMap);
    }
    this.nextLocalInputTick = config.inputDelayTicks;
  }

  public recordIncomingFrames(tick: number, frames: InputFrame[]): void {
    let slotMap = this.frameBuffer.get(tick);
    if (!slotMap) {
      slotMap = new Map<number, InputFrame>();
      this.frameBuffer.set(tick, slotMap);
    }
    for (const f of frames) {
      slotMap.set(f.slotIndex, f);
    }
  }

  public submitLocalCommandForNextTick(localCmd: UnitInputCommand | null): void {
    if (this.config.localSlotIndex < 0) {
      // Spectator sends no input frames
      return;
    }
    const targetTick = this.nextLocalInputTick;
    this.nextLocalInputTick += 1;

    const frame = encodeUnitCommandToInputFrame(
      targetTick,
      this.config.localSlotIndex,
      localCmd
    );
    this.recordIncomingFrames(targetTick, [frame]);
    this.transport.send({
      type: 'INPUT_FRAME',
      roomCode: this.config.roomCode,
      frame
    });
  }

  public canAdvanceCurrentTick(): boolean {
    if (this.desyncDetected || this.world.winnerTeam !== null) {
      return false;
    }
    const currentTick = this.world.tick;
    const slotMap = this.frameBuffer.get(currentTick);
    if (!slotMap) return false;

    for (const reqSlot of this.config.humanSlotIndices) {
      if (!slotMap.has(reqSlot)) {
        return false;
      }
    }
    return true;
  }

  public tryAdvanceTick(): boolean {
    if (!this.canAdvanceCurrentTick()) {
      return false;
    }

    const currentTick = this.world.tick;
    const slotMap = this.frameBuffer.get(currentTick)!;
    const commands: UnitInputCommand[] = [];

    for (const slotIdx of this.config.humanSlotIndices) {
      const frame = slotMap.get(slotIdx)!;
      const unitId = this.config.slotToUnitInstanceId[slotIdx];
      if (unitId) {
        commands.push(decodeInputFrameToUnitCommand(frame, unitId, this.world));
      }
    }

    // Mark human-controlled units as playerControlled = true, and CPU units as false
    const humanUnitIds = new Set(
      this.config.humanSlotIndices.map((s) => this.config.slotToUnitInstanceId[s])
    );
    for (const u of this.world.units) {
      u.isPlayerControlled = humanUnitIds.has(u.instanceId);
    }

    stepBattleWorld(
      this.world,
      commands,
      this.gameRegistry,
      this.prng,
      FIXED_DT
    );

    this.frameBuffer.delete(currentTick);

    // Every 60 ticks (1.0 second), compute and report stateHash for Desync verification
    if (this.world.tick % 60 === 0) {
      const hash = computeBattleStateHash(this.world, this.prng);
      this.stateHashHistory.set(this.world.tick, hash);
      this.transport.send({
        type: 'STATE_HASH_REPORT',
        roomCode: this.config.roomCode,
        tick: this.world.tick,
        stateHash: hash
      });
    }

    return true;
  }

  public getLatestStateHash(): string {
    return computeBattleStateHash(this.world, this.prng);
  }

  public notifyPeerDisconnected(waitSec: number = 15): void {
    this.opponentDisconnected = true;
    this.reconnectCountdownSec = waitSec;
  }

  public stepDisconnectTimer(dt: number): boolean {
    if (!this.opponentDisconnected) return false;
    this.reconnectCountdownSec = Math.max(0, this.reconnectCountdownSec - dt);
    return this.reconnectCountdownSec <= 0;
  }
}
