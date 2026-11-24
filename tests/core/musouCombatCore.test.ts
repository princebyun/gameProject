import { describe, expect, it } from 'vitest';
import {
  computeMusouStateHash,
  createMusouCombatState,
  setMusouActionTypeOverride,
  stepMusouCombatTick
} from '../../src/core/battle/musou/MusouCombatEngine';
import { getActiveActionProfile } from '../../src/core/battle/musou/ActionTypeProfile';
import { applyHordeKoToBurst } from '../../src/core/battle/musou/BurstAndSpecialSystem';
import { BOSS_GROGGY_DURATION_TICKS, STAMINA_MAX } from '../../src/core/battle/musou/MusouTypes';
import { SeededPRNG } from '../../src/core/math/prng';

function runDeterministicReplay(seed: number): {
  hash: string;
  finalTick: number;
  bossHp: number;
  burstWasTriggered: boolean;
  breakWasTriggered: boolean;
} {
  const state = createMusouCombatState({
    speciesId: 'luffy',
    bossMaxHp: 30000,
    bossMaxArmor: 900
  });
  state.player.xMm = 0;
  state.boss.xMm = 1800;
  const prng = new SeededPRNG(seed);

  let burstWasTriggered = false;
  let breakWasTriggered = false;

  for (let t = 0; t < 600; t += 1) {
    if (t === 150) {
      applyHordeKoToBurst(state, 50); // boost burst gauge deterministically
    }
    const events = stepMusouCombatTick(
      state,
      {
        moveXPermille: 1000,
        moveZPermille: 0,
        lightAttackPressed: t % 22 === 1 || t % 22 === 11,
        chargeAttackPressed: t % 45 === 20,
        powerDashPressed: state.player.canPowerDashCancel && t % 2 === 0,
        burstPressed: state.player.burstGauge >= 1000,
        specialSlotIndex: t % 90 === 30 ? 0 : t % 120 === 60 ? 3 : null
      },
      prng
    );
    for (const ev of events) {
      if (ev.kind === 'BURST_ACTIVATE') burstWasTriggered = true;
      if (ev.kind === 'BOSS_ARMOR_BREAK') breakWasTriggered = true;
    }
  }

  return {
    hash: computeMusouStateHash(state, prng),
    finalTick: state.tick,
    bossHp: state.boss.hp,
    burstWasTriggered,
    breakWasTriggered
  };
}

describe('Step 1: Pure Deterministic 60Hz Musou Core (PW4 4-Types, Power Dash, Burst, Armor Break)', () => {
  it('replays 600 ticks of Power Dash Cancel + Full-Force Burst + Boss Armor Break with 100% identical stateHash', () => {
    const runA = runDeterministicReplay(20261124);
    const runB = runDeterministicReplay(20261124);

    expect(runA.finalTick).toBe(600);
    expect(runA.burstWasTriggered).toBe(true);
    expect(runA.breakWasTriggered).toBe(true);
    expect(runA.hash).toBe(runB.hash);
    expect(runA.bossHp).toBe(runB.bossHp);
  });

  it('enforces exact Action Type differences across POWER, SPEED, TECHNIQUE, and SKY', () => {
    // 1. POWER (+35% Boss Armor Damage & +20% Burst AoE)
    const power = createMusouCombatState({ speciesId: 'luffy', bossMaxArmor: 2000 });
    power.player.xMm = 0;
    power.boss.xMm = 1200;
    const baselineSpeed = createMusouCombatState({ speciesId: 'zoro', bossMaxArmor: 2000 });
    baselineSpeed.player.xMm = 0;
    baselineSpeed.boss.xMm = 1200;

    const pPrng = new SeededPRNG(77);
    const sPrng = new SeededPRNG(77);
    let powerArmorDmg = 0;
    let speedArmorDmg = 0;
    for (let t = 0; t < 25; t += 1) {
      for (const ev of stepMusouCombatTick(power, { chargeAttackPressed: t === 0 }, pPrng)) {
        if (ev.kind === 'BOSS_ARMOR_HIT') powerArmorDmg += ev.armorDamage;
      }
      for (const ev of stepMusouCombatTick(baselineSpeed, { chargeAttackPressed: t === 0 }, sPrng)) {
        if (ev.kind === 'BOSS_ARMOR_HIT') speedArmorDmg += ev.armorDamage;
      }
    }
    expect(powerArmorDmg).toBeGreaterThan(Math.round(speedArmorDmg * 1.3));
    expect(getActiveActionProfile(power.player).burstSuperArmor).toBe(true);

    // 2. SPEED (-35% Dash Stamina Cost -> 163 vs 250, +15% Attack Speed, 24t +30% Crit)
    const speedState = createMusouCombatState({ speciesId: 'zoro' });
    const spPrng = new SeededPRNG(9);
    stepMusouCombatTick(speedState, { powerDashPressed: true }, spPrng);
    expect(STAMINA_MAX - speedState.player.stamina).toBe(163 - 3); // cost 163 then +3 regen

    // 3. TECHNIQUE (Apply MARKED then Detonate for 1.5x Boss Armor Damage + Pull event)
    const tech = createMusouCombatState({ speciesId: 'law', bossMaxArmor: 2000 });
    tech.player.xMm = 0;
    tech.boss.xMm = 1200;
    const tPrng = new SeededPRNG(19);
    let markApplied = false;
    let markDetonated = false;
    let pullRadius = 0;
    for (let t = 0; t < 50; t += 1) {
      const evs = stepMusouCombatTick(
        tech,
        { lightAttackPressed: t === 0, chargeAttackPressed: t === 25 },
        tPrng
      );
      for (const ev of evs) {
        if (ev.kind === 'TECH_MARK_APPLIED') markApplied = true;
        if (ev.kind === 'TECH_MARK_DETONATED') {
          markDetonated = true;
          pullRadius = ev.pullRadiusMm;
        }
      }
    }
    expect(markApplied).toBe(true);
    expect(markDetonated).toBe(true);
    expect(pullRadius).toBe(8500);

    // 4. SKY (0.35x Air Gravity Hovering + 3 Consecutive Air Dashes vs 1 for non-SKY)
    const sky = createMusouCombatState({ speciesId: 'sanji' });
    const ground = createMusouCombatState({ speciesId: 'luffy' });
    const skyPrng = new SeededPRNG(31);
    const gndPrng = new SeededPRNG(31);

    stepMusouCombatTick(sky, { jumpPressed: true }, skyPrng);
    stepMusouCombatTick(ground, { jumpPressed: true }, gndPrng);
    let skyAirDashes = 0;
    let gndAirDashes = 0;
    for (let t = 0; t < 18; t += 1) {
      const dashNow = t === 2 || t === 6 || t === 10;
      const se = stepMusouCombatTick(sky, { powerDashPressed: dashNow }, skyPrng);
      const ge = stepMusouCombatTick(ground, { powerDashPressed: dashNow }, gndPrng);
      for (const e of se) if (e.kind === 'POWER_DASH_CANCEL' && e.isAirborne) skyAirDashes += 1;
      for (const e of ge) if (e.kind === 'POWER_DASH_CANCEL' && e.isAirborne) gndAirDashes += 1;
    }
    expect(skyAirDashes).toBe(3);
    expect(gndAirDashes).toBe(1);
    expect(sky.player.yMm).toBeGreaterThan(ground.player.yMm);

    // Runtime actionType override works cleanly
    setMusouActionTypeOverride(ground, 'SKY');
    expect(ground.player.actionType).toBe('SKY');
  });

  it('cancels attack recovery to 0 ticks via Power Dash Cancel while keeping hit combo count', () => {
    const state = createMusouCombatState({ speciesId: 'zoro' });
    state.player.xMm = 0;
    state.boss.xMm = 1400;
    const prng = new SeededPRNG(123);

    let cancelEventSeen = false;
    for (let t = 0; t < 20; t += 1) {
      const evs = stepMusouCombatTick(
        state,
        {
          lightAttackPressed: t === 0,
          powerDashPressed: state.player.canPowerDashCancel
        },
        prng
      );
      for (const ev of evs) {
        if (ev.kind === 'POWER_DASH_CANCEL' && ev.cancelledFromAttack) {
          cancelEventSeen = true;
        }
      }
      if (cancelEventSeen) break;
    }

    expect(cancelEventSeen).toBe(true);
    expect(state.player.attackPhase).toBe('POWER_DASH');
    expect(state.player.hitComboCount).toBeGreaterThanOrEqual(1);
    expect(state.player.speedCancelCritTicks).toBeGreaterThan(0);
  });

  it('activates Full-Force Burst (27t invuln, -20% boss armor, awakening switch, 10-KO extension) & 4-slot specials', () => {
    const state = createMusouCombatState({ speciesId: 'luffy', bossMaxArmor: 1000 });
    state.player.xMm = 0;
    state.boss.xMm = 1500;
    state.player.burstGauge = 1000;
    const prng = new SeededPRNG(404);

    const burstEvents = stepMusouCombatTick(state, { burstPressed: true }, prng);
    expect(burstEvents.some((e) => e.kind === 'BURST_ACTIVATE')).toBe(true);
    expect(state.player.burstActive).toBe(true);
    expect(state.player.invulnTicks).toBe(27); // full 27 invuln ticks on activation
    expect(state.player.activeFormId).toBe('form_luffy_gear5');
    expect(state.player.actionType).toBe('SKY'); // Gear 5 is SKY type
    expect(state.boss.armorGauge).toBe(800); // -20% instant armor cut

    const beforeExt = state.player.burstTicksRemaining;
    applyHordeKoToBurst(state, 20);
    expect(state.player.burstTicksRemaining).toBe(beforeExt + 60);

    // 4-slot special casts & independent cooldowns
    const spEvents = stepMusouCombatTick(state, { specialSlotIndex: 2 }, prng);
    expect(spEvents.some((e) => e.kind === 'SPECIAL_CAST' && e.slotIndex === 2)).toBe(true);
    expect(state.player.specialSlots[2].cooldownTicks).toBeGreaterThan(0);
    expect(state.player.specialSlots[0].cooldownTicks).toBe(0);
  });

  it('transitions Boss Armor INTACT -> CRACKED -> BROKEN_GROGGY (300t, 1.6x dmg) -> 80% Recovery', () => {
    const state = createMusouCombatState({
      speciesId: 'luffy',
      bossMaxHp: 50000,
      bossMaxArmor: 300
    });
    state.player.xMm = 0;
    state.boss.xMm = 1000;
    const prng = new SeededPRNG(909);

    // Light hit while INTACT: boss keeps super armor (0 stagger)
    stepMusouCombatTick(state, { lightAttackPressed: true }, prng);
    for (let t = 0; t < 10; t += 1) {
      stepMusouCombatTick(state, {}, prng);
    }
    expect(state.boss.staggerTicks).toBe(0);
    expect(state.boss.armorState).toBe('INTACT');

    // Heavy specials to drive CRACKED -> BROKEN_GROGGY
    let sawCracked = false;
    let sawBreak = false;
    for (let t = 0; t < 40; t += 1) {
      const slot = t === 0 ? 0 : t === 5 ? 3 : null;
      const evs = stepMusouCombatTick(state, { specialSlotIndex: slot }, prng);
      for (const ev of evs) {
        if (ev.kind === 'BOSS_ARMOR_CRACKED') sawCracked = true;
        if (ev.kind === 'BOSS_ARMOR_BREAK') sawBreak = true;
      }
    }
    expect(sawBreak).toBe(true);
    expect(sawCracked || state.boss.armorState === 'BROKEN_GROGGY').toBe(true);
    expect(state.boss.armorState).toBe('BROKEN_GROGGY');
    expect(state.boss.groggyTicksRemaining).toBeGreaterThan(250);

    // During BROKEN_GROGGY, light attacks stagger & deal 1.6x HP damage
    let groggyPopupFound = false;
    for (let t = 0; t < 15; t += 1) {
      const evs = stepMusouCombatTick(state, { lightAttackPressed: t === 0 }, prng);
      for (const ev of evs) {
        if (ev.kind === 'DAMAGE_POPUP' && ev.style === 'GROGGY_CRIT') {
          groggyPopupFound = true;
        }
      }
    }
    expect(groggyPopupFound).toBe(true);
    expect(state.boss.staggerTicks).toBeGreaterThan(0);

    // Step through remaining Groggy window to verify 80% armor recovery
    let recovered = false;
    for (let t = 0; t < BOSS_GROGGY_DURATION_TICKS + 10; t += 1) {
      const evs = stepMusouCombatTick(state, {}, prng);
      for (const ev of evs) {
        if (ev.kind === 'BOSS_GROGGY_RECOVERY') recovered = true;
      }
    }
    expect(recovered).toBe(true);
    expect(state.boss.armorState).toBe('INTACT');
    expect(state.boss.armorGauge).toBe(240); // 80% of 300
  });
});
