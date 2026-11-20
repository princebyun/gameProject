import { describe, expect, it } from 'vitest';
import {
  GUARD_BREAK_TICKS,
  PARRY_STUN_TICKS,
  PARRY_VULN_MULT,
  PARRY_WHIFF_COOLDOWN_TICKS
} from '../../src/core/battle/parry';
import {
  CUTIN_FREEZE_TICKS,
  resolveBondComboForPair,
  tryActivateBondTagCombo
} from '../../src/core/battle/tagCombo';
import {
  createBattleWorld,
  spawnBeamInstance,
  spawnMeleeArcInstance,
  spawnProjectileInstance,
  stepBattleWorld
} from '../../src/core/combat/battleWorld';
import { BATTLE_CALC_VERSION, FIXED_DT } from '../../src/core/constants';
import { SeededPRNG } from '../../src/core/math/prng';
import { LockstepSyncController } from '../../src/core/net/lockstepController';
import type {
  ClientToServerMessage,
  ServerToClientMessage
} from '../../src/core/net/protocol';
import type { NetworkTransport, TransportDisconnectHandler, TransportMessageHandler } from '../../src/core/net/transport';
import type {
  BattleWorldConfig,
  UnitBuildConfig,
  UnitInputCommand
} from '../../src/core/types/battleState';
import { defaultDataRegistry } from '../../src/data/dataRegistry';
import { defaultEndgameRegistry } from '../../src/data/endgame/endgameRegistry';
import { buildRaidBossUnitBuild, buildRaidConfigFromDef } from '../../src/core/endgame/raid';

function makeUnitBuild(
  instanceId: string,
  speciesId: string,
  isPlayerControlled = true,
  level = 50
): UnitBuildConfig {
  const def = defaultDataRegistry.units[speciesId];
  return {
    instanceId,
    speciesId,
    level,
    ivs: { hp: 20, atk: 20, def: 20, spAtk: 20, spDef: 20, spd: 20 },
    evs: { hp: 0, atk: 0, def: 0, spAtk: 0, spDef: 0, spd: 0 },
    moveIds: [...def.defaultMoves],
    equipmentId: def.defaultEquipmentId,
    traitId: def.traitId,
    formId: def.defaultFormId,
    isPlayerControlled,
    aiLevel: 1
  };
}

function neutralCmd(unitId: string, overrides: Partial<UnitInputCommand> = {}): UnitInputCommand {
  return {
    unitId,
    moveVec: { x: 0, y: 0 },
    aimVec: null,
    castMoveSlotIndex: null,
    dodgePressed: false,
    formShiftPressed: false,
    swapToBenchUnitId: null,
    guardHeld: false,
    bondComboPressed: false,
    ...overrides
  };
}

class InMemoryLoopbackTransport implements NetworkTransport {
  public peer: InMemoryLoopbackTransport | null = null;
  private handlers: TransportMessageHandler[] = [];
  private disconnectHandlers: TransportDisconnectHandler[] = [];
  private connected = true;

  constructor(public readonly clientId: string) {}

  public async connect(): Promise<void> {
    this.connected = true;
  }

  public disconnect(): void {
    this.connected = false;
    for (const h of this.disconnectHandlers) h('closed');
  }

  public isConnected(): boolean {
    return this.connected;
  }

  public send(msg: ClientToServerMessage): void {
    if (msg.type === 'INPUT_FRAME' && this.peer) {
      this.peer.emit({
        type: 'TICK_INPUT_BUNDLE',
        tick: msg.frame.tick,
        frames: [msg.frame]
      });
    }
  }

  public emit(msg: ServerToClientMessage): void {
    for (const h of this.handlers) h(msg);
  }

  public onMessage(handler: TransportMessageHandler): void {
    this.handlers.push(handler);
  }

  public onDisconnect(handler: TransportDisconnectHandler): void {
    this.disconnectHandlers.push(handler);
  }

  public getRttMs(): number {
    return 0;
  }
}

describe('Phase 16 Step 1: Armament Just Guard (Parry), 2:2 Bond Tag Combo & v0.7.0 Lockstep Determinism', () => {
  it('1. Syncs BATTLE_CALC_VERSION to 0.7.0 and loads 8 dedicated pair combos + generic fallback', () => {
    expect(BATTLE_CALC_VERSION).toBe('0.7.0');
    const combos = defaultDataRegistry.combos;
    expect(combos).toBeDefined();
    expect(Object.keys(combos!).length).toBeGreaterThanOrEqual(9);

    // Order-independent pair matching
    const lz = resolveBondComboForPair('luffy', 'zoro', defaultDataRegistry);
    const zl = resolveBondComboForPair('zoro', 'luffy', defaultDataRegistry);
    expect(lz.comboId).toBe('rubber_three_sword_cannon');
    expect(zl.comboId).toBe('rubber_three_sword_cannon');

    expect(resolveBondComboForPair('luffy', 'law', defaultDataRegistry).comboId).toBe('shambles_red_hawk');
    expect(resolveBondComboForPair('chopper', 'robin', defaultDataRegistry).comboId).toBe('giant_petal_crush');
    expect(resolveBondComboForPair('brook', 'jinbe', defaultDataRegistry).comboId).toBe('freezing_ocean_current');

    // Unlisted pair falls back to generic_crew_allout
    const generic = resolveBondComboForPair('nami', 'sanji', defaultDataRegistry);
    expect(generic.comboId).toBe('generic_crew_allout');
    expect(generic.isGeneric).toBe(true);
  });

  it('2. Just Guard (10-tick window) parries melee with 0 damage, stuns attacker (101 ticks w/ Armament Lv1+, 84 ticks w/ Lv0), grants 1.25x vuln, and enforces 24-tick whiff cooldown', () => {
    const prng = new SeededPRNG(1601);
    const world = createBattleWorld(
      {
        seed: 1601,
        arenaSizeKey: 'medium',
        mode: '1V1',
        teamAlpha: [
          makeUnitBuild('p_luffy', 'luffy', true, 50),
          makeUnitBuild('p_zoro', 'zoro', true, 50)
        ],
        teamOmega: [makeUnitBuild('e_zoro', 'zoro', true, 50)]
      },
      defaultDataRegistry
    );

    const luffy = world.units.find((u) => u.instanceId === 'p_luffy')!;
    const enemy = world.units.find((u) => u.instanceId === 'e_zoro')!;
    luffy.pos = { x: 400, y: 300 };
    enemy.pos = { x: 448, y: 300 };
    luffy.aimDir = { x: 1, y: 0 };
    enemy.aimDir = { x: -1, y: 0 };
    luffy.guardStamina = 60;
    const hpBefore = luffy.hp;

    // Tick 1: Luffy raises guard -> enters 10-tick parry window
    stepBattleWorld(
      world,
      [neutralCmd('p_luffy', { guardHeld: true }), neutralCmd('e_zoro')],
      defaultDataRegistry,
      prng
    );
    expect(luffy.guardHeld).toBe(true);

    // Enemy spawns melee arc hitting Luffy while within 10-tick parry window
    const meleeMove =
      Object.values(defaultDataRegistry.moves).find((m) => m.archetype === 'MELEE')!;
    spawnMeleeArcInstance(enemy, meleeMove, { x: -1, y: 0 }, world, defaultDataRegistry);

    stepBattleWorld(
      world,
      [neutralCmd('p_luffy', { guardHeld: true }), neutralCmd('e_zoro')],
      defaultDataRegistry,
      prng
    );

    // Parry succeeded: 0 damage, stamina +25, awakening +15, bond +20
    expect(luffy.hp).toBe(hpBefore);
    expect(luffy.guardStamina).toBe(85);
    expect(luffy.awakeningGauge).toBe(15);
    expect(world.rosters.ALPHA.bondGauge).toBe(20);
    // Luffy has Armament Lv 3 (>= 1) -> +20% stun bonus (101 ticks)
    expect(enemy.parryStunTicks).toBe(Math.round(PARRY_STUN_TICKS * 1.2));
    expect(enemy.parryDamageVulnMult).toBe(PARRY_VULN_MULT);

    // Test early character (Armament Lv 0) still gets standard 84-tick Perfect Block
    luffy.haki = { armament: 0, observation: 0, conqueror: 0 };
    enemy.parryStunTicks = 0;
    // Release guard (since parry succeeded this hold, NO whiff cooldown)
    stepBattleWorld(
      world,
      [neutralCmd('p_luffy', { guardHeld: false }), neutralCmd('e_zoro')],
      defaultDataRegistry,
      prng
    );
    // Wait out hitstop if any
    for (let i = 0; i < 6; i++) {
      stepBattleWorld(
        world,
        [neutralCmd('p_luffy', { guardHeld: false }), neutralCmd('e_zoro')],
        defaultDataRegistry,
        prng
      );
    }
    expect(luffy.parryWhiffCooldownTicks).toBe(0);

    // Re-raise guard without scoring a parry, then release -> triggers 24-tick whiff cooldown
    stepBattleWorld(
      world,
      [neutralCmd('p_luffy', { guardHeld: true }), neutralCmd('e_zoro')],
      defaultDataRegistry,
      prng
    );
    stepBattleWorld(
      world,
      [neutralCmd('p_luffy', { guardHeld: false }), neutralCmd('e_zoro')],
      defaultDataRegistry,
      prng
    );
    expect(luffy.parryWhiffCooldownTicks).toBe(PARRY_WHIFF_COOLDOWN_TICKS);

    // Wait out whiff cooldown, then score Armament Lv0 Perfect Block -> exact 84 ticks stun
    for (let i = 0; i < PARRY_WHIFF_COOLDOWN_TICKS + 2; i++) {
      stepBattleWorld(
        world,
        [neutralCmd('p_luffy', { guardHeld: false }), neutralCmd('e_zoro')],
        defaultDataRegistry,
        prng
      );
    }
    stepBattleWorld(
      world,
      [neutralCmd('p_luffy', { guardHeld: true }), neutralCmd('e_zoro')],
      defaultDataRegistry,
      prng
    );
    spawnMeleeArcInstance(enemy, meleeMove, { x: -1, y: 0 }, world, defaultDataRegistry);
    stepBattleWorld(
      world,
      [neutralCmd('p_luffy', { guardHeld: true }), neutralCmd('e_zoro')],
      defaultDataRegistry,
      prng
    );
    expect(enemy.parryStunTicks).toBe(PARRY_STUN_TICKS);
  });

  it('3. General Guard mitigates 55% damage & triggers 108-tick GUARD_BREAK at 0 stamina; Projectile Parry reflects at 1.35x speed & 1.44x power back to caster; Beam Parry mitigates 85%', () => {
    const prng = new SeededPRNG(1602);
    const world = createBattleWorld(
      {
        seed: 1602,
        arenaSizeKey: 'medium',
        mode: '1V1',
        teamAlpha: [makeUnitBuild('p_luffy', 'luffy', true, 50)],
        teamOmega: [makeUnitBuild('e_kizaru', 'kizaru', true, 50)]
      },
      defaultDataRegistry
    );

    const luffy = world.units.find((u) => u.instanceId === 'p_luffy')!;
    const kizaru = world.units.find((u) => u.instanceId === 'e_kizaru')!;
    luffy.pos = { x: 380, y: 300 };
    kizaru.pos = { x: 540, y: 300 };
    luffy.aimDir = { x: 1, y: 0 };
    kizaru.aimDir = { x: -1, y: 0 };

    // A) Projectile Reflection within 10-tick parry window
    const projMove =
      Object.values(defaultDataRegistry.moves).find((m) => m.archetype === 'PROJECTILE')!;
    stepBattleWorld(
      world,
      [neutralCmd('p_luffy', { guardHeld: true }), neutralCmd('e_kizaru')],
      defaultDataRegistry,
      prng
    );
    const proj = spawnProjectileInstance(
      kizaru,
      projMove,
      { x: -1, y: 0 },
      world,
      defaultDataRegistry
    );
    // Place projectile right on Luffy to collide this tick
    const initialPower = proj.currentPower;
    const initialSpeed = Math.hypot(proj.vel.x, proj.vel.y);
    proj.pos = { x: luffy.pos.x + 12, y: luffy.pos.y };

    const kizaruHpBefore = kizaru.hp;
    const luffyHpBefore = luffy.hp;
    stepBattleWorld(
      world,
      [neutralCmd('p_luffy', { guardHeld: true }), neutralCmd('e_kizaru')],
      defaultDataRegistry,
      prng
    );

    expect(luffy.hp).toBe(luffyHpBefore);
    expect(proj.destroyed).toBe(false);
    expect(proj.reflected).toBe(true);
    expect(proj.ownerUnitId).toBe('p_luffy');
    expect(proj.team).toBe('ALPHA');
    expect(proj.vel.x).toBeGreaterThan(0);
    expect(Math.hypot(proj.vel.x, proj.vel.y)).toBeCloseTo(initialSpeed * 1.35, 1);
    expect(proj.currentPower).toBe(Math.round(initialPower * 1.44));

    // Step forward until reflected projectile hits Kizaru
    for (let t = 0; t < 45; t++) {
      stepBattleWorld(
        world,
        [neutralCmd('p_luffy', { guardHeld: false }), neutralCmd('e_kizaru')],
        defaultDataRegistry,
        prng
      );
    }
    expect(kizaru.hp).toBeLessThan(kizaruHpBefore);

    // B) General Guard > 10 ticks -> drains stamina -> hits 0 -> 108-tick GUARD_BREAK
    luffy.parryWhiffCooldownTicks = 0;
    luffy.guardStamina = 10; // low stamina so next blocked hit breaks guard
    for (let t = 0; t < 15; t++) {
      stepBattleWorld(
        world,
        [neutralCmd('p_luffy', { guardHeld: true }), neutralCmd('e_kizaru')],
        defaultDataRegistry,
        prng
      );
    }
    const meleeMove =
      Object.values(defaultDataRegistry.moves).find((m) => m.archetype === 'MELEE')!;
    kizaru.pos = { x: luffy.pos.x + 42, y: luffy.pos.y };
    spawnMeleeArcInstance(kizaru, meleeMove, { x: -1, y: 0 }, world, defaultDataRegistry);
    stepBattleWorld(
      world,
      [neutralCmd('p_luffy', { guardHeld: true }), neutralCmd('e_kizaru')],
      defaultDataRegistry,
      prng
    );
    expect(luffy.guardBreakTicks).toBe(GUARD_BREAK_TICKS);
    expect(luffy.guardHeld).toBe(false);

    // C) Beam Just Guard mitigates 85% damage (takes ~15%)
    world.hitstopTimer = 0;
    luffy.guardBreakTicks = 0;
    luffy.guardStamina = 100;
    luffy.parryWhiffCooldownTicks = 0;
    const beamMove =
      Object.values(defaultDataRegistry.moves).find(
        (m) => m.archetype === 'BEAM' && m.element !== 'LIGHTNING'
      )!;
    stepBattleWorld(
      world,
      [neutralCmd('p_luffy', { guardHeld: true }), neutralCmd('e_kizaru')],
      defaultDataRegistry,
      prng
    );
    const beam = spawnBeamInstance(kizaru, beamMove, { x: -1, y: 0 }, world, defaultDataRegistry);
    beam.tickTimer = beam.tickIntervalSec;
    const hpBeforeBeam = luffy.hp;
    stepBattleWorld(
      world,
      [neutralCmd('p_luffy', { guardHeld: true }), neutralCmd('e_kizaru')],
      defaultDataRegistry,
      prng
    );
    const beamDmgTaken = hpBeforeBeam - luffy.hp;
    expect(beamDmgTaken).toBeGreaterThanOrEqual(1);
    expect(beamDmgTaken).toBeLessThan(15); // heavily mitigated by 85%
  });

  it('4. Boss Hooks: Parrying Katakuri reduces foresightFocus by 40; Parrying Raid Boss reduces breakGauge', () => {
    const prng = new SeededPRNG(1603);
    const world = createBattleWorld(
      {
        seed: 1603,
        arenaSizeKey: 'medium',
        mode: '1V1',
        teamAlpha: [makeUnitBuild('p_luffy', 'luffy', true, 60)],
        teamOmega: [makeUnitBuild('b_katakuri', 'katakuri', true, 60)]
      },
      defaultDataRegistry
    );

    const luffy = world.units.find((u) => u.instanceId === 'p_luffy')!;
    const katakuri = world.units.find((u) => u.instanceId === 'b_katakuri')!;
    luffy.pos = { x: 400, y: 300 };
    katakuri.pos = { x: 446, y: 300 };
    katakuri.foresightFocus = 38;

    stepBattleWorld(
      world,
      [neutralCmd('p_luffy', { guardHeld: true }), neutralCmd('b_katakuri')],
      defaultDataRegistry,
      prng
    );
    const meleeMove =
      Object.values(defaultDataRegistry.moves).find((m) => m.archetype === 'MELEE')!;
    spawnMeleeArcInstance(katakuri, meleeMove, { x: -1, y: 0 }, world, defaultDataRegistry);
    stepBattleWorld(
      world,
      [neutralCmd('p_luffy', { guardHeld: true }), neutralCmd('b_katakuri')],
      defaultDataRegistry,
      prng
    );

    expect(katakuri.foresightFocus).toBe(0);
    expect(katakuri.foresightBreakTimer).toBeGreaterThan(0);

    // Raid Boss Break Gauge reduction on parry
    const raidDef = Object.values(defaultEndgameRegistry.raids)[0];
    const raidWorld = createBattleWorld(
      {
        seed: 1604,
        arenaSizeKey: 'large',
        mode: 'COOP_RAID',
        teamAlpha: [
          makeUnitBuild('r_luffy', 'luffy', true, 70),
          makeUnitBuild('r_zoro', 'zoro', false, 70),
          makeUnitBuild('r_sanji', 'sanji', false, 70)
        ],
        teamOmega: [buildRaidBossUnitBuild(raidDef, defaultDataRegistry)],
        raidConfig: buildRaidConfigFromDef(raidDef)
      },
      defaultDataRegistry
    );

    const rLuffy = raidWorld.units.find((u) => u.instanceId === 'r_luffy')!;
    const rBoss = raidWorld.units.find((u) => u.team === 'OMEGA')!;
    rBoss.isPlayerControlled = true;
    rLuffy.pos = { x: 400, y: 300 };
    rBoss.pos = { x: 460, y: 300 };
    const breakBefore = raidWorld.raidState.breakGauge;

    stepBattleWorld(
      raidWorld,
      [neutralCmd('r_luffy', { guardHeld: true }), neutralCmd(rBoss.instanceId)],
      defaultDataRegistry,
      prng
    );
    spawnMeleeArcInstance(rBoss, meleeMove, { x: -1, y: 0 }, raidWorld, defaultDataRegistry);
    stepBattleWorld(
      raidWorld,
      [neutralCmd('r_luffy', { guardHeld: true }), neutralCmd(rBoss.instanceId)],
      defaultDataRegistry,
      prng
    );
    expect(raidWorld.raidState.breakGauge).toBeLessThan(breakBefore);
  });

  it('5. 2:2 Bond Tag Combo triggers 39-tick cutin freeze, spawns guest ally sprite, deals pair combo impact & Chopper+Robin team heal', () => {
    const prng = new SeededPRNG(1605);
    const world = createBattleWorld(
      {
        seed: 1605,
        arenaSizeKey: 'medium',
        mode: '1V1',
        teamAlpha: [
          makeUnitBuild('p_chopper', 'chopper', true, 50),
          makeUnitBuild('p_robin', 'robin', true, 50)
        ],
        teamOmega: [makeUnitBuild('e_lucci', 'lucci', true, 50)]
      },
      defaultDataRegistry
    );

    const chopper = world.units.find((u) => u.instanceId === 'p_chopper')!;
    const enemy = world.units.find((u) => u.instanceId === 'e_lucci')!;
    chopper.hp = Math.round(chopper.maxHp * 0.5);
    const chopperHpBefore = chopper.hp;
    const enemyHpBefore = enemy.hp;

    world.rosters.ALPHA.bondGauge = 100;
    const res = tryActivateBondTagCombo(chopper, world, defaultDataRegistry);
    expect(res.activated).toBe(true);
    expect(res.comboDef?.comboId).toBe('giant_petal_crush');
    expect(world.rosters.ALPHA.bondGauge).toBe(0);
    expect(world.cutinFreezeTicks).toBe(CUTIN_FREEZE_TICKS);
    expect(world.activeCutin?.kind).toBe('BOND_COMBO');
    expect(world.activeBondCombo?.partnerSpeciesId).toBe('robin');

    // Verify exact 39-tick freeze (elapsedSec stays 0 during cut-in)
    for (let i = 0; i < CUTIN_FREEZE_TICKS; i++) {
      stepBattleWorld(
        world,
        [neutralCmd('p_chopper'), neutralCmd('e_lucci')],
        defaultDataRegistry,
        prng
      );
    }
    expect(world.cutinFreezeTicks).toBe(0);
    expect(world.activeCutin).toBeNull();
    expect(world.elapsedSec).toBe(0);

    // Step 20 ticks post-freeze -> impact executes (enemy damaged + Chopper healed by 15%!)
    for (let i = 0; i < 20; i++) {
      stepBattleWorld(
        world,
        [neutralCmd('p_chopper'), neutralCmd('e_lucci')],
        defaultDataRegistry,
        prng
      );
    }
    expect(enemy.hp).toBeLessThan(enemyHpBefore);
    expect(chopper.hp).toBeGreaterThan(chopperHpBefore);

    // Finish remaining combo ticks -> session clears cleanly
    for (let i = 0; i < 30; i++) {
      stepBattleWorld(
        world,
        [neutralCmd('p_chopper'), neutralCmd('e_lucci')],
        defaultDataRegistry,
        prng
      );
    }
    expect(world.activeBondCombo).toBeNull();
  });

  it('6. Online 2P Lockstep (600 ticks) with Guard/Parry reflection + Bond Tag Combo + 39-tick Cut-In Freeze stays 100% stateHash identical', () => {
    const battleConfig: BattleWorldConfig = {
      seed: 9916,
      arenaSizeKey: 'medium',
      mode: '1V1',
      teamAlpha: [
        makeUnitBuild('slot0_luffy', 'luffy', true, 50),
        makeUnitBuild('slot0_zoro', 'zoro', true, 50)
      ],
      teamOmega: [
        makeUnitBuild('slot1_kizaru', 'kizaru', true, 50),
        makeUnitBuild('slot1_sanji', 'sanji', true, 50)
      ]
    };

    const tA = new InMemoryLoopbackTransport('client_A');
    const tB = new InMemoryLoopbackTransport('client_B');
    tA.peer = tB;
    tB.peer = tA;

    const commonCfg = {
      roomCode: 'P16SYN',
      matchSeed: 9916,
      battleConfig,
      humanSlotIndices: [0, 1],
      slotToUnitInstanceId: { 0: 'slot0_luffy', 1: 'slot1_kizaru' },
      inputDelayTicks: 2
    };

    const ctrlA = new LockstepSyncController(
      { ...commonCfg, localSlotIndex: 0 },
      defaultDataRegistry,
      tA
    );
    const ctrlB = new LockstepSyncController(
      { ...commonCfg, localSlotIndex: 1 },
      defaultDataRegistry,
      tB
    );

    tA.onMessage((m) => {
      if (m.type === 'TICK_INPUT_BUNDLE') ctrlA.recordIncomingFrames(m.tick, m.frames);
    });
    tB.onMessage((m) => {
      if (m.type === 'TICK_INPUT_BUNDLE') ctrlB.recordIncomingFrames(m.tick, m.frames);
    });

    // Pre-charge ALPHA bond gauge symmetrically on both worlds so Bond Combo triggers mid-match
    ctrlA.world.rosters.ALPHA.bondGauge = 100;
    ctrlB.world.rosters.ALPHA.bondGauge = 100;

    let cutinSeenA = false;
    let cutinSeenB = false;

    for (let tick = 0; tick < 600; tick++) {
      // Deterministic varied commands: movement, skill casts, guard/parry bursts, bond combo at tick 120
      const cmdA = neutralCmd('slot0_luffy', {
        moveVec: { x: tick < 40 ? 1 : 0, y: 0 },
        aimVec: { x: 1, y: 0 },
        guardHeld: tick >= 50 && tick <= 60,
        castMoveSlotIndex: tick === 280 ? 0 : null,
        bondComboPressed: tick >= 180 && tick <= 185
      });
      const cmdB = neutralCmd('slot1_kizaru', {
        moveVec: { x: tick < 40 ? -1 : 0, y: 0 },
        aimVec: { x: -1, y: 0 },
        guardHeld: tick >= 275 && tick <= 285,
        castMoveSlotIndex: tick === 42 || tick === 240 ? 3 : null
      });

      ctrlA.submitLocalCommandForNextTick(cmdA);
      ctrlB.submitLocalCommandForNextTick(cmdB);

      const advA = ctrlA.tryAdvanceTick();
      const advB = ctrlB.tryAdvanceTick();
      expect(advA).toBe(true);
      expect(advB).toBe(true);

      if (ctrlA.world.cutinFreezeTicks > 0) cutinSeenA = true;
      if (ctrlB.world.cutinFreezeTicks > 0) cutinSeenB = true;

      if (ctrlA.world.tick % 60 === 0) {
        expect(ctrlA.getLatestStateHash()).toBe(ctrlB.getLatestStateHash());
      }
    }

    expect(cutinSeenA).toBe(true);
    expect(cutinSeenB).toBe(true);
    expect(ctrlA.world.tick).toBe(600);
    expect(ctrlB.world.tick).toBe(600);
    expect(ctrlA.getLatestStateHash()).toBe(ctrlB.getLatestStateHash());
    expect(FIXED_DT).toBeCloseTo(1 / 60, 5);
  });
});
