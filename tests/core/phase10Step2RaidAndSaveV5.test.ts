import { describe, expect, it } from 'vitest';
import { MultiplayerRelayServer } from '../../server/relayServer';
import {
  createBattleWorld,
  spawnBeamInstance,
  spawnMeleeArcInstance,
  stepBattleWorld
} from '../../src/core/combat/battleWorld';
import { resolveMeleeVsBeam } from '../../src/core/combat/clashResolver';
import { computeDamage } from '../../src/core/combat/damageCalc';
import { BATTLE_CALC_VERSION, FIXED_DT } from '../../src/core/constants';
import {
  applyRaidBreakDamage,
  buildOfflineRaidBattleConfig,
  equipRaidRelic,
  recordRaidOutcome
} from '../../src/core/endgame/raid';
import { SeededPRNG } from '../../src/core/math/prng';
import { LockstepSyncController } from '../../src/core/net/lockstepController';
import type { ServerToClientMessage } from '../../src/core/net/protocol';
import { createStandardPresetBuild } from '../../src/core/net/terminalArenaRule';
import { createInitialCampaignState } from '../../src/core/rpg/campaignState';
import {
  canEnterOnlineBattle,
  evaluateAndStampAntiCheat,
  validateSaveLegality
} from '../../src/core/save/antiCheat';
import { migrateRawSaveToCurrent } from '../../src/core/save/migrator';
import { CURRENT_SAVE_VERSION } from '../../src/core/save/schema';
import {
  DEFAULT_GLOBAL_SETTINGS,
  serializeCampaignToSaveEnvelope
} from '../../src/core/save/serializer';
import { computeSaveIntegrity } from '../../src/core/save/sha256';
import { defaultDataRegistry } from '../../src/data/dataRegistry';
import { defaultEndgameRegistry } from '../../src/data/endgame/endgameRegistry';
import { defaultRpgDataRegistry } from '../../src/data/rpgDataRegistry';
import { LoopbackNetworkHub } from '../../src/platform/net/loopbackTransport';
import { WebSocketTransport } from '../../src/platform/net/webSocketTransport';

describe('Phase 10 Step 2: Giant Boss Co-op Raid, Online 2P+1AI+Spectator 600-Tick Lockstep & Save v4->v5 Anti-Cheat', () => {
  it('1. Raid Break Gauge: reaching 0 triggers 6s Groggy, locks Saturn superRegeneration & applies 1.5x incoming damage', () => {
    const campaign = createInitialCampaignState(defaultRpgDataRegistry, defaultDataRegistry);
    const cfg = buildOfflineRaidBattleConfig(
      'raid_saturn_abyss',
      ['luffy', 'zoro', 'sanji'],
      3001,
      campaign,
      defaultDataRegistry,
      defaultEndgameRegistry
    )!;
    const world = createBattleWorld(cfg, defaultDataRegistry);
    const prng = new SeededPRNG(3001);

    const luffy = world.units.find((u) => u.speciesId === 'luffy')!;
    const saturn = world.units.find((u) => u.team === 'OMEGA')!;
    expect(saturn.entityScale).toBeCloseTo(2.2, 2);
    expect(world.raidState.active).toBe(true);
    expect(world.raidState.breakGauge).toBe(110);

    // Baseline damage BEFORE Break
    const dmgBefore = computeDamage(
      100,
      luffy,
      saturn,
      'PHYSICAL',
      'BLUNT',
      world,
      defaultDataRegistry,
      { hasArmamentHaki: true }
    ).damage;

    // Deplete break gauge to 0 -> 6s Groggy + superRegeneration forced lockout
    applyRaidBreakDamage(world, saturn, luffy, 120, true, true, true, 110);
    expect(world.raidState.breakGauge).toBe(0);
    expect(world.raidState.groggyTimer).toBeCloseTo(6.0, 2);
    expect(saturn.superRegenLockoutTimer).toBeGreaterThanOrEqual(6.0);

    // Damage DURING Break is strictly 1.5x higher!
    const dmgDuringBreak = computeDamage(
      100,
      luffy,
      saturn,
      'PHYSICAL',
      'BLUNT',
      world,
      defaultDataRegistry,
      { hasArmamentHaki: true }
    ).damage;
    expect(dmgDuringBreak).toBeGreaterThanOrEqual(Math.round(dmgBefore * 1.45));

    // Verify Saturn's superRegeneration does NOT heal while Groggy
    saturn.hp = Math.round(saturn.maxHp * 0.7);
    const hpAtBreakStart = saturn.hp;
    for (let t = 0; t < 180; t++) {
      // Disable player/AI attacks so we isolate regen lockout check
      for (const u of world.units) u.aiReactionTimer = 5;
      stepBattleWorld(world, [], defaultDataRegistry, prng, FIXED_DT);
    }
    expect(saturn.hp).toBeLessThanOrEqual(hpAtBreakStart);
    expect(world.raidState.groggyTimer).toBeGreaterThan(2.5);
  });

  it('2. Raid Team Down & Rescue Revive (15s downed, 2s ally rescue -> 40% HP, 3-revive cap) + Raid Melee-Beam Clash Exception', () => {
    const campaign = createInitialCampaignState(defaultRpgDataRegistry, defaultDataRegistry);
    const cfg = buildOfflineRaidBattleConfig(
      'raid_kaido_flame',
      ['luffy', 'zoro', 'sanji'],
      3002,
      campaign,
      defaultDataRegistry,
      defaultEndgameRegistry
    )!;
    const world = createBattleWorld(cfg, defaultDataRegistry);
    const prng = new SeededPRNG(3002);

    const luffy = world.units.find((u) => u.speciesId === 'luffy')!;
    const zoro = world.units.find((u) => u.speciesId === 'zoro')!;
    const sanji = world.units.find((u) => u.speciesId === 'sanji')!;
    const kaido = world.units.find((u) => u.team === 'OMEGA')!;

    // Verify 1:1 Melee-vs-Beam freeze guard is DISABLED in raid mode
    const zoroMove = defaultDataRegistry.moves['move_zoro_rengoku_onigiri'];
    const beamMove = Object.values(defaultDataRegistry.moves).find(
      (m) => m.archetype === 'BEAM'
    )!;
    zoro.pos = { x: 400, y: 270 };
    kaido.pos = { x: 520, y: 270 };
    spawnMeleeArcInstance(zoro, zoroMove, { x: 1, y: 0 }, world, defaultDataRegistry);
    spawnBeamInstance(kaido, beamMove, { x: -1, y: 0 }, world, defaultDataRegistry);
    resolveMeleeVsBeam(world, FIXED_DT, defaultDataRegistry);
    expect(world.meleeBeamGuards.length).toBe(0);

    // Clear projectiles/beams/arcs and test Team Down + 2s Rescue Revive (3-revive cap)
    world.beams = [];
    world.meleeArcs = [];
    world.raidState.telegraphs = [];
    world.raidState.patternGlobalCooldown = 99;
    kaido.pos = { x: 1050, y: 580 };
    luffy.pos = { x: 140, y: 140 };
    zoro.pos = { x: 165, y: 140 }; // within 78px rescue radius
    sanji.pos = { x: 190, y: 140 };

    // Down Luffy -> enters 15s Downed state (NOT instant death)
    luffy.hp = 0;
    stepBattleWorld(world, [], defaultDataRegistry, prng, FIXED_DT);
    expect(luffy.isDowned).toBe(true);
    expect(luffy.isAlive).toBe(true);
    expect(world.winnerTeam).toBeNull();

    // Rescue over 2.1s -> revives at 40% HP and decrements teamRevivesRemaining (3 -> 2)
    for (let t = 0; t < 130 && luffy.isDowned; t++) {
      kaido.aiReactionTimer = 5;
      zoro.pos = { x: 160, y: 140 };
      stepBattleWorld(world, [], defaultDataRegistry, prng, FIXED_DT);
    }
    expect(luffy.isDowned).toBe(false);
    expect(luffy.hp).toBeGreaterThanOrEqual(Math.round(luffy.maxHp * 0.35));
    expect(world.raidState.teamRevivesRemaining).toBe(2);

    // Exhaust revives (0 left) -> rescue can no longer revive downed ally
    world.raidState.teamRevivesRemaining = 0;
    luffy.hp = 0;
    stepBattleWorld(world, [], defaultDataRegistry, prng, FIXED_DT);
    expect(luffy.isDowned).toBe(true);
    for (let t = 0; t < 130; t++) {
      kaido.aiReactionTimer = 5;
      zoro.pos = { x: 160, y: 140 };
      stepBattleWorld(world, [], defaultDataRegistry, prng, FIXED_DT);
    }
    expect(luffy.isDowned).toBe(true);
    expect(luffy.reviveProgressSec).toBe(0);
  });

  it('3. Online Co-op Raid (LoopbackTransport): 2 Humans + 1 AI + 1 Spectator achieve 100% bit-identical stateHash across 600 ticks', async () => {
    const hub = new LoopbackNetworkHub(
      defaultDataRegistry,
      defaultRpgDataRegistry,
      BATTLE_CALC_VERSION
    );
    const tP1 = hub.createClientTransport('raid_p1');
    const tP2 = hub.createClientTransport('raid_p2');
    const tSpec = hub.createClientTransport('raid_spec');
    await Promise.all([tP1.connect(), tP2.connect(), tSpec.connect()]);

    let roomCode = '';
    let lsP1: LockstepSyncController | null = null;
    let lsP2: LockstepSyncController | null = null;
    let lsSpec: LockstepSyncController | null = null;
    let desyncCount = 0;

    const attach = (
      client: typeof tP1,
      role: 'P1' | 'P2' | 'SPEC'
    ) => {
      client.onMessage((msg: ServerToClientMessage) => {
        if (msg.type === 'ROOM_JOINED' && role === 'P1') {
          roomCode = msg.roomCode;
        } else if (msg.type === 'MATCH_STARTED') {
          const localSlot = role === 'P1' ? 0 : role === 'P2' ? 1 : -1;
          const ls = new LockstepSyncController(
            {
              roomCode: msg.roomCode,
              matchSeed: msg.matchSeed,
              battleConfig: msg.battleConfig,
              humanSlotIndices: msg.humanSlotIndices,
              slotToUnitInstanceId: msg.slotToUnitInstanceId,
              localSlotIndex: localSlot,
              inputDelayTicks: msg.inputDelayTicks
            },
            defaultDataRegistry,
            client
          );
          if (role === 'P1') lsP1 = ls;
          else if (role === 'P2') lsP2 = ls;
          else lsSpec = ls;
        } else if (msg.type === 'TICK_INPUT_BUNDLE') {
          if (role === 'P1') lsP1?.recordIncomingFrames(msg.tick, msg.frames);
          else if (role === 'P2') lsP2?.recordIncomingFrames(msg.tick, msg.frames);
          else lsSpec?.recordIncomingFrames(msg.tick, msg.frames);
        } else if (msg.type === 'DESYNC_ALERT') {
          desyncCount += 1;
        }
      });
    };

    attach(tP1, 'P1');
    attach(tP2, 'P2');
    attach(tSpec, 'SPEC');

    const p1Build = createStandardPresetBuild('luffy', 'r_p1', true, 4, defaultDataRegistry);
    const p2Build = createStandardPresetBuild('zoro', 'r_p2', true, 4, defaultDataRegistry);

    tP1.send({
      type: 'CREATE_ROOM',
      clientId: 'raid_p1',
      playerName: 'LuffyHost',
      battleCalcVersion: BATTLE_CALC_VERSION,
      mode: 'COOP_RAID',
      raidId: 'raid_loki_ragnir',
      partyRule: 'standard_preset',
      arenaSizeKey: 'large',
      awakeningAllowed: true,
      roster: { partyRule: 'standard_preset', units: [p1Build] }
    });
    expect(roomCode.length).toBe(6);

    tP2.send({
      type: 'JOIN_ROOM',
      roomCode,
      clientId: 'raid_p2',
      playerName: 'ZoroGuest',
      battleCalcVersion: BATTLE_CALC_VERSION,
      asSpectator: false,
      roster: { partyRule: 'standard_preset', units: [p2Build] }
    });

    tSpec.send({
      type: 'JOIN_ROOM',
      roomCode,
      clientId: 'raid_spec',
      playerName: 'RaidSpectator',
      battleCalcVersion: BATTLE_CALC_VERSION,
      asSpectator: true
    });

    // Slot 2 remains empty -> auto-filled with AI ally on START_MATCH!
    tP1.send({ type: 'START_MATCH', roomCode });
    expect(lsP1).not.toBeNull();
    expect(lsP2).not.toBeNull();
    expect(lsSpec).not.toBeNull();

    const p1 = lsP1!;
    const p2 = lsP2!;
    const spec = lsSpec!;

    expect(p1.world.mode).toBe('COOP_RAID');
    expect(p1.world.raidState.active).toBe(true);
    expect(p1.world.units.filter((u) => u.team === 'ALPHA' && u.isOnField).length).toBe(3);
    expect(p1.world.units.filter((u) => u.team === 'OMEGA' && u.isOnField).length).toBe(1);

    // Run 600 ticks (10 seconds) with deterministic varied player inputs
    for (let t = 0; t < 600 && p1.world.winnerTeam === null; t++) {
      p1.submitLocalCommandForNextTick({
        unitId: p1.config.slotToUnitInstanceId[0],
        moveVec: { x: t % 60 < 30 ? 1 : 0, y: t % 80 < 40 ? 0.5 : -0.5 },
        aimVec: { x: 1, y: 0 },
        castMoveSlotIndex: t % 45 === 10 ? 0 : null,
        dodgePressed: t % 90 === 0,
        formShiftPressed: false,
        swapToBenchUnitId: null
      });
      p2.submitLocalCommandForNextTick({
        unitId: p2.config.slotToUnitInstanceId[1],
        moveVec: { x: t % 50 < 25 ? 1 : -0.5, y: t % 70 < 35 ? -0.6 : 0.6 },
        aimVec: { x: 1, y: 0 },
        castMoveSlotIndex: t % 40 === 15 ? 1 : null,
        dodgePressed: t % 110 === 0,
        formShiftPressed: false,
        swapToBenchUnitId: null
      });

      expect(p1.tryAdvanceTick()).toBe(true);
      expect(p2.tryAdvanceTick()).toBe(true);
      expect(spec.tryAdvanceTick()).toBe(true);
    }

    expect(desyncCount).toBe(0);
    expect(p1.world.tick).toBe(600);
    const h1 = p1.getLatestStateHash();
    const h2 = p2.getLatestStateHash();
    const hs = spec.getLatestStateHash();
    expect(h1).toBe(h2);
    expect(h1).toBe(hs);
    // All 10 checkpoints (60..600) match bit-for-bit
    for (let cp = 60; cp <= 600; cp += 60) {
      expect(p1.stateHashHistory.get(cp)).toBe(p2.stateHashHistory.get(cp));
      expect(p1.stateHashHistory.get(cp)).toBe(spec.stateHashHistory.get(cp));
    }
  });

  it('4. SaveMigrator v4 -> v5 compatibility (preserves onlineEligible === true) & LegalityValidator ILLEGAL_ENDGAME_STATE enforcement', () => {
    expect(CURRENT_SAVE_VERSION).toBe(5);
    const campaign = createInitialCampaignState(defaultRpgDataRegistry, defaultDataRegistry);

    // Construct an authentic v4 SaveEnvelope (no payload.endgame, saveVersion: 4, calcVersion: '0.5.0')
    const baseEnv = serializeCampaignToSaveEnvelope(
      campaign,
      'slot_1',
      300,
      '2026-11-19T12:00:00.000Z',
      DEFAULT_GLOBAL_SETTINGS,
      null,
      defaultRpgDataRegistry,
      defaultDataRegistry
    );
    const v4Env = JSON.parse(JSON.stringify(baseEnv));
    delete v4Env.payload.endgame;
    v4Env.meta.saveVersion = 4;
    v4Env.meta.battleCalcVersion = '0.5.0';
    v4Env.meta.integrity = computeSaveIntegrity(4, '0.5.0', v4Env.payload);

    // Migrate v4 -> v5
    const mig = migrateRawSaveToCurrent(
      v4Env,
      defaultRpgDataRegistry,
      defaultDataRegistry
    );
    expect(mig.migrated).toBe(true);
    expect(mig.migratedFromVersion).toBe(4);
    expect(mig.envelope.meta.saveVersion).toBe(5);
    expect(mig.envelope.meta.battleCalcVersion).toBe('0.6.0');
    expect(mig.envelope.payload.endgame).toBeDefined();
    expect(mig.envelope.payload.endgame?.impelDown.highestFloor).toBe(0);
    expect(mig.envelope.payload.endgame?.colosseum.posterFrameTier).toBe('default');

    const checkV5 = canEnterOnlineBattle(
      mig.envelope,
      defaultRpgDataRegistry,
      defaultDataRegistry
    );
    expect(checkV5.allowed).toBe(true);
    expect(mig.envelope.meta.antiCheat.onlineEligible).toBe(true);

    // Legitimate raid clear + relic equip passes anti-cheat cleanly
    recordRaidOutcome(
      'raid_kaido_flame',
      true,
      48.5,
      campaign,
      defaultEndgameRegistry
    );
    const eqRes = equipRaidRelic(
      'luffy',
      'relic_flame_dragon_scale',
      campaign,
      defaultDataRegistry,
      defaultEndgameRegistry
    );
    expect(eqRes.success).toBe(true);
    const legitEnv = serializeCampaignToSaveEnvelope(
      campaign,
      'slot_2',
      400,
      '2026-11-19T12:30:00.000Z',
      DEFAULT_GLOBAL_SETTINGS,
      null,
      defaultRpgDataRegistry,
      defaultDataRegistry
    );
    expect(legitEnv.meta.antiCheat.onlineEligible).toBe(true);

    // Forged Case A: Illegal Raid Relic owned WITHOUT clearing raid_loki_ragnir
    const forgedRelic = JSON.parse(JSON.stringify(legitEnv));
    forgedRelic.payload.endgame.raids.unlockedRelicIds.push('relic_elbaf_rune');
    forgedRelic.meta.integrity = computeSaveIntegrity(5, BATTLE_CALC_VERSION, forgedRelic.payload);
    const relicBlock = evaluateAndStampAntiCheat(
      forgedRelic,
      defaultRpgDataRegistry,
      defaultDataRegistry
    );
    expect(relicBlock.onlineEligible).toBe(false);
    expect(relicBlock.violationCodes).toContain('ILLEGAL_ENDGAME_STATE');

    // Forged Case B: Illegal Colosseum CP above cap (999999)
    const forgedCp = JSON.parse(JSON.stringify(legitEnv));
    forgedCp.payload.endgame.colosseum.cp = 999_999;
    const cpLegality = validateSaveLegality(
      forgedCp.payload,
      defaultRpgDataRegistry,
      defaultDataRegistry
    );
    expect(cpLegality.codes).toContain('ILLEGAL_ENDGAME_STATE');

    // Forged Case C: Illegal unregistered Move Tutor skill equipped
    const forgedTutor = JSON.parse(JSON.stringify(legitEnv));
    forgedTutor.payload.endgame.colosseum.tutoredMovesMap['luffy'] = ['move_hacked_god_beam'];
    const tutorLegality = validateSaveLegality(
      forgedTutor.payload,
      defaultRpgDataRegistry,
      defaultDataRegistry
    );
    expect(tutorLegality.codes).toContain('ILLEGAL_ENDGAME_STATE');
  });

  it('5. Live WebSocket Relay Server COOP_RAID E2E: 2 real WS clients + 1 auto-filled AI + 1 Spectator over TCP ws://', async () => {
    const server = new MultiplayerRelayServer(0, BATTLE_CALC_VERSION);
    const port = await server.start();
    const wsUrl = `ws://127.0.0.1:${port}`;

    const ws1 = new WebSocketTransport('ws_raid_p1', wsUrl);
    const ws2 = new WebSocketTransport('ws_raid_p2', wsUrl);
    const wsSpec = new WebSocketTransport('ws_raid_spec', wsUrl);

    try {
      await Promise.all([ws1.connect(), ws2.connect(), wsSpec.connect()]);

      const roomCode = await new Promise<string>((resolve) => {
        ws1.onMessage((msg) => {
          if (msg.type === 'ROOM_JOINED') resolve(msg.roomCode);
        });
        ws1.send({
          type: 'CREATE_ROOM',
          clientId: 'ws_raid_p1',
          playerName: 'HostLuffy',
          battleCalcVersion: BATTLE_CALC_VERSION,
          mode: 'COOP_RAID',
          raidId: 'raid_kaido_flame',
          partyRule: 'standard_preset',
          arenaSizeKey: 'large',
          awakeningAllowed: true,
          roster: {
            partyRule: 'standard_preset',
            units: [createStandardPresetBuild('luffy', 'wsp1', true, 4, defaultDataRegistry)]
          }
        });
      });

      const joinedBoth = Promise.all([
        new Promise<void>((resolve) => {
          ws2.onMessage((msg) => {
            if (msg.type === 'ROOM_JOINED' && msg.assignedSlotIndex === 1) resolve();
          });
        }),
        new Promise<void>((resolve) => {
          wsSpec.onMessage((msg) => {
            if (msg.type === 'ROOM_JOINED' && msg.assignedRole === 'SPECTATOR') resolve();
          });
        })
      ]);

      ws2.send({
        type: 'JOIN_ROOM',
        roomCode,
        clientId: 'ws_raid_p2',
        playerName: 'GuestZoro',
        battleCalcVersion: BATTLE_CALC_VERSION,
        asSpectator: false,
        roster: {
          partyRule: 'standard_preset',
          units: [createStandardPresetBuild('zoro', 'wsp2', true, 4, defaultDataRegistry)]
        }
      });
      wsSpec.send({
        type: 'JOIN_ROOM',
        roomCode,
        clientId: 'ws_raid_spec',
        playerName: 'SpecSanji',
        battleCalcVersion: BATTLE_CALC_VERSION,
        asSpectator: true
      });
      await joinedBoth;

      const matchStartedAll = Promise.all([
        new Promise<ServerToClientMessage>((resolve) => {
          ws1.onMessage((msg) => {
            if (msg.type === 'MATCH_STARTED') resolve(msg);
          });
        }),
        new Promise<ServerToClientMessage>((resolve) => {
          ws2.onMessage((msg) => {
            if (msg.type === 'MATCH_STARTED') resolve(msg);
          });
        }),
        new Promise<ServerToClientMessage>((resolve) => {
          wsSpec.onMessage((msg) => {
            if (msg.type === 'MATCH_STARTED') resolve(msg);
          });
        })
      ]);

      ws1.send({ type: 'START_MATCH', roomCode });
      const [m1, m2, mSpec] = await matchStartedAll;
      expect(m1.type).toBe('MATCH_STARTED');
      expect(m2.type).toBe('MATCH_STARTED');
      expect(mSpec.type).toBe('MATCH_STARTED');
      if (m1.type === 'MATCH_STARTED') {
        expect(m1.battleConfig.mode).toBe('COOP_RAID');
        expect(m1.battleConfig.raidConfig?.raidId).toBe('raid_kaido_flame');
        expect(m1.battleConfig.teamAlpha.length).toBe(3);
        expect(m1.battleConfig.teamOmega.length).toBe(1);
      }
    } finally {
      ws1.disconnect();
      ws2.disconnect();
      wsSpec.disconnect();
      await server.stop();
    }
  });
});
