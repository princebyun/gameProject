import { describe, expect, it } from 'vitest';
import { BATTLE_CALC_VERSION } from '../../src/core/constants';
import {
  LockstepSyncController,
  type LockstepConfig
} from '../../src/core/net/lockstepController';
import type {
  OnlineRosterPayload,
  ServerToClientMessage
} from '../../src/core/net/protocol';
import {
  applyTerminalBattleOutcome,
  capturePreTerminalPartySnapshot,
  createStandardPresetBuild
} from '../../src/core/net/terminalArenaRule';
import { createInitialCampaignState } from '../../src/core/rpg/campaignState';
import {
  DEFAULT_GLOBAL_SETTINGS,
  serializeCampaignToSaveEnvelope
} from '../../src/core/save/serializer';
import { computeSaveIntegrity } from '../../src/core/save/sha256';
import type { UnitInputCommand } from '../../src/core/types/battleState';
import { createDefaultDataRegistry } from '../../src/data/dataRegistry';
import { createDefaultRpgDataRegistry } from '../../src/data/rpgDataRegistry';
import { LoopbackNetworkHub } from '../../src/platform/net/loopbackTransport';
import { MultiplayerRelayServer } from '../../server/relayServer';
import { WebSocket } from 'ws';

function createCleanSaveRoster(): OnlineRosterPayload {
  const gameReg = createDefaultDataRegistry();
  const rpgReg = createDefaultRpgDataRegistry();
  const state = createInitialCampaignState(rpgReg, gameReg);
  const env = serializeCampaignToSaveEnvelope(
    state,
    'slot_1',
    300,
    '2026-11-19T04:00:00.000Z',
    DEFAULT_GLOBAL_SETTINGS,
    null,
    rpgReg,
    gameReg
  );
  return {
    partyRule: 'rpg_save',
    saveEnvelope: env,
    units: [
      createStandardPresetBuild('luffy', 'p_luffy', true, 4, gameReg)
    ]
  };
}

describe('Phase 4 Real-Time Online Multiplayer, Server Anti-Cheat & Deterministic Lockstep', () => {
  it('Version Mismatch Rejection: rejects client with different BATTLE_CALC_VERSION with ERR_VERSION_MISMATCH', async () => {
    const gameReg = createDefaultDataRegistry();
    const rpgReg = createDefaultRpgDataRegistry();
    const hub = new LoopbackNetworkHub(gameReg, rpgReg, BATTLE_CALC_VERSION);

    const hostClient = hub.createClientTransport('client_host');
    const outdatedClient = hub.createClientTransport('client_outdated');
    await hostClient.connect();
    await outdatedClient.connect();

    const hostMessages: ServerToClientMessage[] = [];
    const outdatedMessages: ServerToClientMessage[] = [];
    hostClient.onMessage((m) => hostMessages.push(m));
    outdatedClient.onMessage((m) => outdatedMessages.push(m));

    hostClient.send({
      type: 'CREATE_ROOM',
      clientId: 'client_host',
      playerName: 'HostLuffy',
      battleCalcVersion: BATTLE_CALC_VERSION,
      mode: '1V1',
      partyRule: 'standard_preset',
      arenaSizeKey: 'medium',
      awakeningAllowed: true,
      roster: {
        partyRule: 'standard_preset',
        units: [createStandardPresetBuild('luffy', 'u1', true, 4, gameReg)]
      }
    });

    const joinedMsg = hostMessages.find((m) => m.type === 'ROOM_JOINED');
    expect(joinedMsg).toBeDefined();
    const roomCode =
      joinedMsg && joinedMsg.type === 'ROOM_JOINED' ? joinedMsg.roomCode : '';
    expect(roomCode.length).toBe(6);
    expect(/[0O1I]/.test(roomCode)).toBe(false);

    // Outdated client (version "0.1.0") tries to join "0.2.0" room
    outdatedClient.send({
      type: 'JOIN_ROOM',
      roomCode,
      clientId: 'client_outdated',
      playerName: 'OldClient',
      battleCalcVersion: '0.1.0',
      asSpectator: false,
      roster: {
        partyRule: 'standard_preset',
        units: [createStandardPresetBuild('zoro', 'u2', true, 4, gameReg)]
      }
    });

    const errMsg = outdatedMessages.find((m) => m.type === 'ERROR_REJECTED');
    expect(errMsg).toBeDefined();
    if (errMsg && errMsg.type === 'ERROR_REJECTED') {
      expect(errMsg.code).toBe('ERR_VERSION_MISMATCH');
      expect(errMsg.clientVersion).toBe('0.1.0');
      expect(errMsg.roomVersion).toBe(BATTLE_CALC_VERSION);
      expect(errMsg.message).toContain('배틀 계산 버전이 달라');
    }
  });

  it('Server 2-Stage Anti-Cheat: blocks tampered SaveEnvelope and forged-signature illegal Haki/Gear5 saves with ERR_ILLEGAL_SAVE', async () => {
    const gameReg = createDefaultDataRegistry();
    const rpgReg = createDefaultRpgDataRegistry();
    const hub = new LoopbackNetworkHub(gameReg, rpgReg, BATTLE_CALC_VERSION);

    const hostClient = hub.createClientTransport('host_ac');
    const cheaterClient = hub.createClientTransport('cheater_ac');
    await hostClient.connect();
    await cheaterClient.connect();

    const hostMsgs: ServerToClientMessage[] = [];
    const cheaterMsgs: ServerToClientMessage[] = [];
    hostClient.onMessage((m) => hostMsgs.push(m));
    cheaterClient.onMessage((m) => cheaterMsgs.push(m));

    const cleanRoster = createCleanSaveRoster();
    hostClient.send({
      type: 'CREATE_ROOM',
      clientId: 'host_ac',
      playerName: 'CleanHost',
      battleCalcVersion: BATTLE_CALC_VERSION,
      mode: '1V1',
      partyRule: 'rpg_save',
      arenaSizeKey: 'medium',
      awakeningAllowed: true,
      roster: cleanRoster
    });

    const joined = hostMsgs.find((m) => m.type === 'ROOM_JOINED');
    expect(joined).toBeDefined();
    const roomCode = joined && joined.type === 'ROOM_JOINED' ? joined.roomCode : '';

    // 1. Cheater sends SaveEnvelope with berry +1 (Stage 1 INTEGRITY_MISMATCH)
    const tamperedRoster1: OnlineRosterPayload = JSON.parse(
      JSON.stringify(cleanRoster)
    );
    tamperedRoster1.saveEnvelope!.payload.economy.berry += 1;
    // Even if client tried to force antiCheat flags to clean in JSON, server re-runs IntegrityVerifier!
    tamperedRoster1.saveEnvelope!.meta.antiCheat = {
      isTampered: false,
      onlineEligible: true,
      violationCodes: []
    };

    cheaterClient.send({
      type: 'JOIN_ROOM',
      roomCode,
      clientId: 'cheater_ac',
      playerName: 'BerryCheater',
      battleCalcVersion: BATTLE_CALC_VERSION,
      asSpectator: false,
      roster: tamperedRoster1
    });

    const err1 = cheaterMsgs.pop();
    expect(err1?.type).toBe('ERROR_REJECTED');
    if (err1?.type === 'ERROR_REJECTED') {
      expect(err1.code).toBe('ERR_ILLEGAL_SAVE');
      expect(err1.violationCodes).toContain('INTEGRITY_MISMATCH');
    }

    // 2. Cheater sets Haki Conqueror Lv.4 & Gear 5 without ep_wano AND recalculates valid HMAC signature (Stage 2 LegalityValidator)
    const forgedRoster2: OnlineRosterPayload = JSON.parse(
      JSON.stringify(cleanRoster)
    );
    const env2 = forgedRoster2.saveEnvelope!;
    env2.payload.crew.unitProgressMap['luffy'].haki.conqueror = 4 as unknown as 3;
    env2.payload.crew.unitProgressMap['luffy'].unlockedFormIds = [
      'form_luffy_gear5'
    ];
    env2.payload.crew.unitProgressMap['luffy'].fruitAwakeningUnlocked = true;
    env2.meta.integrity = computeSaveIntegrity(
      env2.meta.saveVersion,
      env2.meta.battleCalcVersion,
      env2.payload
    );
    env2.meta.antiCheat = {
      isTampered: false,
      onlineEligible: true,
      violationCodes: []
    };

    cheaterClient.send({
      type: 'JOIN_ROOM',
      roomCode,
      clientId: 'cheater_ac',
      playerName: 'ForgedHakiCheater',
      battleCalcVersion: BATTLE_CALC_VERSION,
      asSpectator: false,
      roster: forgedRoster2
    });

    const err2 = cheaterMsgs.pop();
    expect(err2?.type).toBe('ERROR_REJECTED');
    if (err2?.type === 'ERROR_REJECTED') {
      expect(err2.code).toBe('ERR_ILLEGAL_SAVE');
      expect(err2.violationCodes).toContain('ILLEGAL_UNIT_STATE');
    }
  });

  it('Deterministic 2:2 (+2 CPU) + Spectator 600-Tick Lockstep Sync: P1, P2, and Spectator produce bit-identical stateHash with 0 Desyncs', async () => {
    const gameReg = createDefaultDataRegistry();
    const rpgReg = createDefaultRpgDataRegistry();
    const hub = new LoopbackNetworkHub(gameReg, rpgReg, BATTLE_CALC_VERSION);

    const p1Transport = hub.createClientTransport('p1_host');
    const p2Transport = hub.createClientTransport('p2_guest');
    const specTransport = hub.createClientTransport('spec_watcher');
    await p1Transport.connect();
    await p2Transport.connect();
    await specTransport.connect();

    let roomCode = '';
    let p1Lockstep: LockstepSyncController | null = null;
    let p2Lockstep: LockstepSyncController | null = null;
    let specLockstep: LockstepSyncController | null = null;
    let desyncAlerts = 0;

    const attachLockstepListener = (
      transport: typeof p1Transport,
      localSlot: number,
      assignCtrl: (c: LockstepSyncController) => void,
      getCtrl: () => LockstepSyncController | null
    ) => {
      transport.onMessage((msg) => {
        if (msg.type === 'ROOM_JOINED' && localSlot === 0) {
          roomCode = msg.roomCode;
        } else if (msg.type === 'MATCH_STARTED') {
          const cfg: LockstepConfig = {
            roomCode: msg.roomCode,
            matchSeed: msg.matchSeed,
            battleConfig: msg.battleConfig,
            humanSlotIndices: msg.humanSlotIndices,
            slotToUnitInstanceId: msg.slotToUnitInstanceId,
            localSlotIndex: localSlot,
            inputDelayTicks: msg.inputDelayTicks
          };
          assignCtrl(new LockstepSyncController(cfg, gameReg, transport));
        } else if (msg.type === 'TICK_INPUT_BUNDLE') {
          getCtrl()?.recordIncomingFrames(msg.tick, msg.frames);
        } else if (msg.type === 'DESYNC_ALERT') {
          desyncAlerts += 1;
        }
      });
    };

    attachLockstepListener(
      p1Transport,
      0,
      (c) => (p1Lockstep = c),
      () => p1Lockstep
    );
    attachLockstepListener(
      p2Transport,
      2,
      (c) => (p2Lockstep = c),
      () => p2Lockstep
    );
    attachLockstepListener(
      specTransport,
      -1,
      (c) => (specLockstep = c),
      () => specLockstep
    );

    // 1. P1 creates a 2V2 room
    p1Transport.send({
      type: 'CREATE_ROOM',
      clientId: 'p1_host',
      playerName: 'P1_Luffy',
      battleCalcVersion: BATTLE_CALC_VERSION,
      mode: '2V2',
      partyRule: 'standard_preset',
      arenaSizeKey: 'large',
      awakeningAllowed: true,
      roster: {
        partyRule: 'standard_preset',
        units: [createStandardPresetBuild('luffy', 'u_p1', true, 4, gameReg)]
      }
    });
    expect(roomCode.length).toBe(6);

    // 2. P2 joins as human opponent (assigned slot 2 on Team OMEGA)
    p2Transport.send({
      type: 'JOIN_ROOM',
      roomCode,
      clientId: 'p2_guest',
      playerName: 'P2_Kaido',
      battleCalcVersion: BATTLE_CALC_VERSION,
      asSpectator: false,
      roster: {
        partyRule: 'standard_preset',
        units: [createStandardPresetBuild('kaido', 'u_p2', true, 4, gameReg)]
      }
    });

    // 3. Spectator joins with asSpectator: true
    specTransport.send({
      type: 'JOIN_ROOM',
      roomCode,
      clientId: 'spec_watcher',
      playerName: 'Spectator_1',
      battleCalcVersion: BATTLE_CALC_VERSION,
      asSpectator: true
    });

    // 4. Host fills remaining slots 1 (Zoro) and 3 (Kizaru) with CPU Lv.4
    p1Transport.send({
      type: 'CONFIGURE_CPU_SLOT',
      roomCode,
      slotIndex: 1,
      enabled: true,
      aiLevel: 4,
      speciesId: 'zoro'
    });
    p1Transport.send({
      type: 'CONFIGURE_CPU_SLOT',
      roomCode,
      slotIndex: 3,
      enabled: true,
      aiLevel: 4,
      speciesId: 'kizaru'
    });

    // 5. Start the 2v2 (+2 CPU) match
    p1Transport.send({ type: 'START_MATCH', roomCode });
    expect(p1Lockstep).not.toBeNull();
    expect(p2Lockstep).not.toBeNull();
    expect(specLockstep).not.toBeNull();

    const ctrl1 = p1Lockstep!;
    const ctrl2 = p2Lockstep!;
    const ctrlSpec = specLockstep!;

    // 6. Run 600 ticks (10 seconds @ 60FPS) with live inputs: movement, beam clashes, Zoan stance shifts, and Gear 5 awakening
    for (let tick = 0; tick < 600; tick++) {
      const p1UnitId = ctrl1.config.slotToUnitInstanceId[0];
      const p2UnitId = ctrl2.config.slotToUnitInstanceId[2];

      const cmd1: UnitInputCommand = {
        unitId: p1UnitId,
        moveVec: { x: tick < 180 ? 1 : 0, y: tick % 120 < 60 ? 0.3 : -0.3 },
        aimVec: { x: 1, y: 0 },
        castMoveSlotIndex: tick % 45 === 10 ? (tick / 45) % 4 : null,
        dodgePressed: tick === 95 || tick === 310,
        formShiftPressed: false,
        awakeningPressed: tick === 40, // Trigger Gear 5 Awakening on tick 40!
        swapToBenchUnitId: null
      };

      const cmd2: UnitInputCommand = {
        unitId: p2UnitId,
        moveVec: { x: tick < 180 ? -1 : 0, y: tick % 120 < 60 ? 0.3 : -0.3 },
        aimVec: { x: -1, y: 0 },
        castMoveSlotIndex: tick % 45 === 10 ? 0 : null,
        dodgePressed: tick === 140,
        formShiftPressed: tick === 20 || tick === 120, // Cycle Kaido Zoan stances (BASE -> HYBRID -> BEAST)!
        awakeningPressed: false,
        swapToBenchUnitId: null
      };

      ctrl1.submitLocalCommandForNextTick(cmd1);
      ctrl2.submitLocalCommandForNextTick(cmd2);

      const adv1 = ctrl1.tryAdvanceTick();
      const adv2 = ctrl2.tryAdvanceTick();
      const advSpec = ctrlSpec.tryAdvanceTick();

      expect(adv1).toBe(true);
      expect(adv2).toBe(true);
      expect(advSpec).toBe(true);
    }

    expect(desyncAlerts).toBe(0);
    expect(ctrl1.world.tick).toBe(600);
    expect(ctrl2.world.tick).toBe(600);
    expect(ctrlSpec.world.tick).toBe(600);

    // Verify all 10 60-tick stateHash checkpoints match bit-for-bit across P1, P2, and Spectator
    for (let ck = 60; ck <= 600; ck += 60) {
      const h1 = ctrl1.stateHashHistory.get(ck);
      const h2 = ctrl2.stateHashHistory.get(ck);
      const hSpec = ctrlSpec.stateHashHistory.get(ck);
      expect(h1).toBeDefined();
      expect(h1).toBe(h2);
      expect(h1).toBe(hSpec);
    }

    // Final state hash parity check
    expect(ctrl1.getLatestStateHash()).toBe(ctrl2.getLatestStateHash());
    expect(ctrl1.getLatestStateHash()).toBe(ctrlSpec.getLatestStateHash());
  });

  it('Island Battle Terminal Non-Destructive Rule: updates onlineStats while preserving RPG party HP and move PP 100%', () => {
    const gameReg = createDefaultDataRegistry();
    const rpgReg = createDefaultRpgDataRegistry();
    const campaign = createInitialCampaignState(rpgReg, gameReg);

    const envelope = serializeCampaignToSaveEnvelope(
      campaign,
      'slot_1',
      600,
      '2026-11-19T04:15:00.000Z',
      DEFAULT_GLOBAL_SETTINGS,
      null,
      rpgReg,
      gameReg
    );

    const preSnap = capturePreTerminalPartySnapshot(envelope);
    const originalHp = envelope.payload.crew.unitProgressMap['luffy'].currentHp;
    const originalPistolPp =
      envelope.payload.crew.unitProgressMap['luffy'].movePpMap[
        'move_luffy_pistol'
      ];

    // Simulate damage and PP drain during terminal online battle
    envelope.payload.crew.unitProgressMap['luffy'].currentHp = 12;
    envelope.payload.crew.unitProgressMap['luffy'].movePpMap[
      'move_luffy_pistol'
    ] = 0;

    // Apply terminal match outcome -> restores HP & PP while incrementing onlineStats.wins
    const updatedEnv = applyTerminalBattleOutcome(
      campaign,
      envelope,
      'WIN',
      preSnap
    );

    expect(campaign.onlineStats.wins).toBe(1);
    expect(updatedEnv.payload.economy.onlineStats?.wins).toBe(1);
    expect(
      updatedEnv.payload.crew.unitProgressMap['luffy'].currentHp
    ).toBe(originalHp);
    expect(
      updatedEnv.payload.crew.unitProgressMap['luffy'].movePpMap[
        'move_luffy_pistol'
      ]
    ).toBe(originalPistolPp);
    expect(updatedEnv.meta.antiCheat.isTampered).toBe(false);
  });

  it('Live WebSocket Relay Server E2E: connects Host, Guest, and Spectator over real TCP WebSocket and relays lockstep bundles', async () => {
    const relayServer = new MultiplayerRelayServer(0, BATTLE_CALC_VERSION);
    const port = await relayServer.start();
    const url = `ws://localhost:${port}`;

    const openWsClient = (
      _id: string
    ): Promise<{
      ws: WebSocket;
      inbox: ServerToClientMessage[];
      send: (m: unknown) => void;
    }> =>
      new Promise((resolve, reject) => {
        const ws = new WebSocket(url);
        const inbox: ServerToClientMessage[] = [];
        ws.on('open', () =>
          resolve({
            ws,
            inbox,
            send: (m) => ws.send(JSON.stringify(m))
          })
        );
        ws.on('message', (raw) => {
          inbox.push(JSON.parse(raw.toString()) as ServerToClientMessage);
        });
        ws.on('error', reject);
      });

    const host = await openWsClient('ws_host');
    const guest = await openWsClient('ws_guest');
    const spec = await openWsClient('ws_spec');

    try {
      const gameReg = createDefaultDataRegistry();
      host.send({
        type: 'CREATE_ROOM',
        clientId: 'ws_host',
        playerName: 'HostLuffy',
        battleCalcVersion: BATTLE_CALC_VERSION,
        mode: '2V2',
        partyRule: 'standard_preset',
        arenaSizeKey: 'medium',
        awakeningAllowed: true,
        roster: {
          partyRule: 'standard_preset',
          units: [createStandardPresetBuild('luffy', 'u1', true, 4, gameReg)]
        }
      });

      await new Promise((r) => setTimeout(r, 40));
      const roomJoined = host.inbox.find((m) => m.type === 'ROOM_JOINED');
      expect(roomJoined).toBeDefined();
      const roomCode =
        roomJoined && roomJoined.type === 'ROOM_JOINED'
          ? roomJoined.roomCode
          : '';

      guest.send({
        type: 'JOIN_ROOM',
        roomCode,
        clientId: 'ws_guest',
        playerName: 'GuestKaido',
        battleCalcVersion: BATTLE_CALC_VERSION,
        asSpectator: false,
        roster: {
          partyRule: 'standard_preset',
          units: [createStandardPresetBuild('kaido', 'u2', true, 4, gameReg)]
        }
      });

      spec.send({
        type: 'JOIN_ROOM',
        roomCode,
        clientId: 'ws_spec',
        playerName: 'Watcher',
        battleCalcVersion: BATTLE_CALC_VERSION,
        asSpectator: true
      });

      await new Promise((r) => setTimeout(r, 40));
      host.send({ type: 'START_MATCH', roomCode });
      await new Promise((r) => setTimeout(r, 40));

      expect(host.inbox.some((m) => m.type === 'MATCH_STARTED')).toBe(true);
      expect(guest.inbox.some((m) => m.type === 'MATCH_STARTED')).toBe(true);
      expect(spec.inbox.some((m) => m.type === 'MATCH_STARTED')).toBe(true);

      // Submit tick 2 frames from both humans -> verify all 3 receive TICK_INPUT_BUNDLE
      host.send({
        type: 'INPUT_FRAME',
        roomCode,
        frame: { tick: 2, slotIndex: 0, moveX: 100, moveY: 0, aimAngle: 0, actionBits: 1 }
      });
      guest.send({
        type: 'INPUT_FRAME',
        roomCode,
        frame: { tick: 2, slotIndex: 2, moveX: -100, moveY: 0, aimAngle: 3142, actionBits: 2 }
      });

      await new Promise((r) => setTimeout(r, 40));
      expect(spec.inbox.some((m) => m.type === 'TICK_INPUT_BUNDLE')).toBe(true);
    } finally {
      host.ws.close();
      guest.ws.close();
      spec.ws.close();
      await relayServer.stop();
    }
  });
});
