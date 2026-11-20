import { FIXED_DT } from '../constants';
import {
  lenVec,
  normalizeVec,
  scaleVec,
  subVec,
  type Vec2
} from '../math/vector2';
import type {
  ActiveProjectile,
  BattleWorldState,
  UnitInputCommand,
  UnitRuntimeState
} from '../types/battleState';
import type { GameDataRegistry } from '../types/dataSchemas';
import { addTeamBondGauge } from './tagCombo';

export const PARRY_WINDOW_TICKS = 10; // ~0.166s @ 60Hz
export const PARRY_STUN_TICKS = 84; // 1.4s @ 60Hz
export const PARRY_ARMAMENT_BONUS_MULT = 1.2; // +20% reflect dmg & stun duration for Armament Lv1+
export const PARRY_WHIFF_COOLDOWN_TICKS = 24; // 0.4s @ 60Hz anti-spam cooldown
export const GUARD_BREAK_TICKS = 108; // 1.8s @ 60Hz stun on stamina depletion
export const PARRY_VULN_MULT = 1.25;
export const GUARD_DAMAGE_MITIGATION = 0.55; // General Guard takes 45% damage
export const UNREFLECTABLE_PARRY_MITIGATION = 0.85; // Beams / Raid telegraphs take 15% damage
export const REFLECT_SPEED_MULT = 1.35;
export const REFLECT_DAMAGE_MULT = 1.2;
export const PARRY_STAMINA_RESTORE = 25;
export const PARRY_AWAKENING_GAIN = 15;
export const PARRY_BOND_GAIN = 20;
export const GUARD_STAMINA_REGEN_PER_SEC = 16;

export type IncomingAttackKind = 'MELEE' | 'PROJECTILE' | 'BEAM' | 'TELEGRAPH';

export interface GuardParryEvaluationResult {
  outcome:
    | 'NONE'
    | 'GUARDED'
    | 'GUARD_BREAK'
    | 'PARRIED_MELEE'
    | 'PARRIED_PROJECTILE'
    | 'PARRIED_MITIGATED';
  finalDamage: number;
  negateKnockback: boolean;
  armamentEnhanced: boolean;
}

/**
 * Steps deterministic 60Hz Armament Guard / Just Guard timers and state transitions.
 */
export function stepUnitGuardAndParry(
  unit: UnitRuntimeState,
  cmd: UnitInputCommand | undefined,
  world: BattleWorldState,
  dt: number = FIXED_DT
): void {
  if (unit.guardBreakTicks > 0) {
    unit.guardBreakTicks = Math.max(0, unit.guardBreakTicks - 1);
  }
  if (unit.parryWhiffCooldownTicks > 0) {
    unit.parryWhiffCooldownTicks = Math.max(0, unit.parryWhiffCooldownTicks - 1);
  }
  if (unit.parryStunTicks > 0) {
    unit.parryStunTicks = Math.max(0, unit.parryStunTicks - 1);
    if (unit.parryStunTicks <= 0) {
      unit.parryDamageVulnMult = 1.0;
    }
  }
  if (unit.justGuardFlashTicks > 0) {
    unit.justGuardFlashTicks = Math.max(0, unit.justGuardFlashTicks - 1);
  }

  const canHoldGuard =
    unit.isAlive &&
    unit.isOnField &&
    !unit.isDowned &&
    unit.guardBreakTicks <= 0 &&
    unit.parryStunTicks <= 0 &&
    unit.dodgeActiveTimer <= 0 &&
    unit.clashLockId === null &&
    unit.activeBeamId === null;

  const wantsGuard = Boolean(cmd?.guardHeld) && canHoldGuard && unit.guardStamina > 0;
  const wasHolding = unit.guardHeld;

  if (wantsGuard && !wasHolding) {
    unit.guardHeld = true;
    unit.guardParrySucceededThisHold = false;
    // Only open a fresh 10-tick Just Guard parry interval if not on whiff cooldown
    unit.guardStartTick = unit.parryWhiffCooldownTicks <= 0 ? world.tick : -9999;
    // Cancel active windup when raising guard
    unit.windupMoveId = null;
    unit.windupTimer = 0;
  } else if (!wantsGuard && wasHolding) {
    unit.guardHeld = false;
    // Anti-spam: releasing guard without scoring a parry triggers 24-tick whiff cooldown
    if (!unit.guardParrySucceededThisHold && unit.guardStartTick >= 0) {
      unit.parryWhiffCooldownTicks = Math.max(
        unit.parryWhiffCooldownTicks,
        PARRY_WHIFF_COOLDOWN_TICKS
      );
    }
    unit.guardStartTick = -9999;
    unit.guardParrySucceededThisHold = false;
  } else if (!canHoldGuard && unit.guardHeld) {
    unit.guardHeld = false;
    unit.guardStartTick = -9999;
    unit.guardParrySucceededThisHold = false;
  }

  // Regenerate guard stamina when not holding guard and not guard-broken
  if (!unit.guardHeld && unit.guardBreakTicks <= 0 && unit.guardStamina < unit.guardMaxStamina) {
    unit.guardStamina = Math.min(
      unit.guardMaxStamina,
      unit.guardStamina + GUARD_STAMINA_REGEN_PER_SEC * dt
    );
  }
}

function isWithinParryWindow(defender: UnitRuntimeState, world: BattleWorldState): boolean {
  if (!defender.guardHeld || defender.guardBreakTicks > 0) return false;
  if (defender.guardStartTick < 0) return false;
  const elapsed = world.tick - defender.guardStartTick;
  return elapsed >= 0 && elapsed <= PARRY_WINDOW_TICKS;
}

function isAttackFromFrontArc(
  defender: UnitRuntimeState,
  attacker: UnitRuntimeState | undefined,
  incomingDir: Vec2
): boolean {
  const aim = normalizeVec(defender.aimDir, { x: 1, y: 0 });
  // Direction from defender toward the threat source
  let toThreat: Vec2;
  if (attacker) {
    toThreat = normalizeVec(subVec(attacker.pos, defender.pos), {
      x: -incomingDir.x,
      y: -incomingDir.y
    });
  } else {
    toThreat = normalizeVec(
      { x: -incomingDir.x, y: -incomingDir.y },
      aim
    );
  }
  const dot = aim.x * toThreat.x + aim.y * toThreat.y;
  // Generous 210-degree front arc (dot >= -0.25) so responsive top-down guarding feels fair
  return dot >= -0.25;
}

function applyParryBossHooks(
  defender: UnitRuntimeState,
  attacker: UnitRuntimeState | undefined,
  armamentEnhanced: boolean,
  world: BattleWorldState,
  registry: GameDataRegistry
): void {
  // Hook 1: Katakuri Future Sight Focus disruption (-40 focus, instant break if <= 0)
  if (attacker && attacker.isAlive) {
    const fsTrait = registry.traits[attacker.traitId]?.futureSightCounter;
    if (fsTrait?.enabled && attacker.foresightBreakTimer <= 0) {
      attacker.foresightFocus = Math.max(0, attacker.foresightFocus - 40);
      if (attacker.foresightFocus <= 0) {
        attacker.foresightBreakTimer = fsTrait.focusBreakDurationSec;
        world.floatingTexts.push({
          id: `ft_parry_fbreak_${world.tick}_${attacker.instanceId}`,
          pos: { x: attacker.pos.x, y: attacker.pos.y - 42 },
          text: '💥 패링 집중 붕괴! (5s 피해 +20%)',
          color: '#facc15',
          elapsedSec: 0,
          durationSec: 1.4,
          scale: 1.25
        });
        world.combatLog.push(
          `[저스트 가드 파훼] ${defender.name}의 패링으로 ${attacker.name}의 미래 예지 집중이 붕괴되었습니다!`
        );
      }
    }
  }

  // Hook 2: Giant Raid Boss Break Gauge reduction on Just Guard
  const rs = world.raidState;
  if (
    rs.active &&
    rs.groggyTimer <= 0 &&
    attacker &&
    rs.bossUnitId === attacker.instanceId
  ) {
    const breakChunk = Math.max(
      18,
      Math.round(rs.breakGaugeMax * (armamentEnhanced ? 0.22 : 0.16))
    );
    rs.breakGauge = Math.max(0, rs.breakGauge - breakChunk);
    if (rs.breakGauge <= 0) {
      rs.groggyTimer = rs.groggyDurationSec;
      attacker.superRegenLockoutTimer = Math.max(
        attacker.superRegenLockoutTimer,
        rs.groggyDurationSec
      );
      attacker.windupMoveId = null;
      attacker.windupTimer = 0;
      attacker.activeBeamId = null;
      attacker.vel = { x: 0, y: 0 };
      rs.telegraphs = [];
      world.screenShakeTimer = Math.max(world.screenShakeTimer, 0.32);
      world.screenShakeMagnitude = Math.max(world.screenShakeMagnitude, 7.5);
      world.floatingTexts.push({
        id: `ft_parry_raid_break_${world.tick}`,
        pos: { x: attacker.pos.x, y: attacker.pos.y - attacker.radiusPx - 20 },
        text: `💥 패링 브레이크! ${rs.groggyDurationSec}초 그로기!`,
        color: '#facc15',
        elapsedSec: 0,
        durationSec: 1.7,
        scale: 1.35
      });
      world.combatLog.push(
        `[패링 레이드 브레이크!] ${defender.name}의 저스트 가드로 ${attacker.name}의 브레이크 게이지를 완전히 파괴했습니다!`
      );
    }
  }
}

/**
 * Evaluates General Guard or Armament Just Guard (Parry) against an incoming attack.
 */
export function evaluateGuardOrParryOnIncomingAttack(
  defender: UnitRuntimeState,
  attacker: UnitRuntimeState | undefined,
  attackKind: IncomingAttackKind,
  rawDamage: number,
  incomingDir: Vec2,
  world: BattleWorldState,
  registry: GameDataRegistry,
  projectile?: ActiveProjectile
): GuardParryEvaluationResult {
  const armamentEnhanced = (defender.haki?.armament ?? 0) >= 1;

  if (!defender.guardHeld || defender.guardBreakTicks > 0 || rawDamage <= 0) {
    return {
      outcome: 'NONE',
      finalDamage: rawDamage,
      negateKnockback: false,
      armamentEnhanced
    };
  }

  // 1. Check Just Guard / Parry (10-tick timing interval from guard initiation)
  if (isWithinParryWindow(defender, world)) {
    defender.guardParrySucceededThisHold = true;
    defender.justGuardFlashTicks = 18;
    defender.guardStamina = Math.min(
      defender.guardMaxStamina,
      defender.guardStamina + PARRY_STAMINA_RESTORE
    );
    defender.awakeningGauge = Math.min(100, defender.awakeningGauge + PARRY_AWAKENING_GAIN);
    addTeamBondGauge(defender.team, PARRY_BOND_GAIN, world);

    // 3-tick deterministic hitstop for crisp parry impact
    world.hitstopTimer = Math.max(world.hitstopTimer, 3 * FIXED_DT);
    world.screenShakeTimer = Math.max(world.screenShakeTimer, 0.14);
    world.screenShakeMagnitude = Math.max(world.screenShakeMagnitude, armamentEnhanced ? 6.0 : 4.5);

    applyParryBossHooks(defender, attacker, armamentEnhanced, world, registry);

    // Case A: Melee Parry -> 0 dmg, 84 ticks (or 101 ticks w/ Armament Lv1+) stun + 1.25x vuln on attacker
    if (attackKind === 'MELEE') {
      const stunTicks = armamentEnhanced
        ? Math.round(PARRY_STUN_TICKS * PARRY_ARMAMENT_BONUS_MULT)
        : PARRY_STUN_TICKS;
      if (attacker && attacker.isAlive) {
        attacker.parryStunTicks = Math.max(attacker.parryStunTicks, stunTicks);
        attacker.parryDamageVulnMult = PARRY_VULN_MULT;
        attacker.windupMoveId = null;
        attacker.windupTimer = 0;
        attacker.pendingBurst = null;
        const pushBack = normalizeVec(subVec(attacker.pos, defender.pos), {
          x: -incomingDir.x,
          y: -incomingDir.y
        });
        attacker.knockbackVel = scaleVec(
          pushBack,
          165 * Math.max(0.25, 1 - attacker.knockbackResist)
        );
      }

      world.parryMiniEvents.push({
        id: `parry_melee_${world.tick}_${defender.instanceId}`,
        unitId: defender.instanceId,
        pos: { x: defender.pos.x, y: defender.pos.y },
        kind: 'MELEE_PARRY',
        armamentEnhanced,
        elapsedTicks: 0,
        durationTicks: 18
      });
      world.vfxEvents.push({
        id: `vfx_parry_m_${world.tick}_${defender.instanceId}`,
        kind: armamentEnhanced ? 'CONQUEROR_LIGHTNING' : 'CLASH_SHOCKWAVE',
        pos: { x: defender.pos.x, y: defender.pos.y },
        color: armamentEnhanced ? '#7c3aed' : '#facc15',
        radiusPx: armamentEnhanced ? 68 : 54,
        elapsedSec: 0,
        durationSec: 0.32
      });
      world.floatingTexts.push({
        id: `ft_parry_m_${world.tick}_${defender.instanceId}`,
        pos: { x: defender.pos.x, y: defender.pos.y - 36 },
        text: armamentEnhanced ? '⚡ 무장색 패링!' : '🛡 PERFECT BLOCK!',
        color: armamentEnhanced ? '#facc15' : '#38bdf8',
        elapsedSec: 0,
        durationSec: 1.05,
        scale: 1.3
      });
      world.combatLog.push(
        `[저스트 가드] ${defender.name}이(가) ${attacker?.name ?? '적'}의 근접 공격을 완벽하게 패링! (${(stunTicks / 60).toFixed(2)}초 경직 + 피해 1.25배)`
      );
      return {
        outcome: 'PARRIED_MELEE',
        finalDamage: 0,
        negateKnockback: true,
        armamentEnhanced
      };
    }

    // Case B: Projectile Parry -> Reflect back to original caster (1.35x speed, 1.2x or 1.44x power)
    if (attackKind === 'PROJECTILE' && projectile) {
      const prevSpeed = Math.max(200, lenVec(projectile.vel));
      let reflectDir = normalizeVec(
        { x: -projectile.vel.x, y: -projectile.vel.y },
        defender.aimDir
      );
      if (attacker && attacker.isAlive && attacker.isOnField) {
        reflectDir = normalizeVec(subVec(attacker.pos, projectile.pos), reflectDir);
      }

      const powerMult = armamentEnhanced
        ? REFLECT_DAMAGE_MULT * PARRY_ARMAMENT_BONUS_MULT
        : REFLECT_DAMAGE_MULT;

      projectile.originalOwnerUnitId = projectile.originalOwnerUnitId ?? projectile.ownerUnitId;
      projectile.ownerUnitId = defender.instanceId;
      projectile.team = defender.team;
      projectile.reflected = true;
      projectile.reflectedByUnitId = defender.instanceId;
      projectile.vel = scaleVec(reflectDir, prevSpeed * REFLECT_SPEED_MULT);
      projectile.currentPower = Math.round(projectile.currentPower * powerMult);
      projectile.hasArmamentHaki = projectile.hasArmamentHaki || armamentEnhanced;
      projectile.elapsedSec = 0;
      projectile.destroyed = false;

      world.parryMiniEvents.push({
        id: `parry_proj_${world.tick}_${defender.instanceId}`,
        unitId: defender.instanceId,
        pos: { x: defender.pos.x, y: defender.pos.y },
        kind: 'PROJECTILE_REFLECT',
        armamentEnhanced,
        elapsedTicks: 0,
        durationTicks: 18
      });
      world.vfxEvents.push({
        id: `vfx_parry_p_${world.tick}_${defender.instanceId}`,
        kind: 'CLASH_SHOCKWAVE',
        pos: { x: projectile.pos.x, y: projectile.pos.y },
        color: armamentEnhanced ? '#c084fc' : '#38bdf8',
        radiusPx: 52,
        elapsedSec: 0,
        durationSec: 0.3
      });
      world.floatingTexts.push({
        id: `ft_parry_p_${world.tick}_${defender.instanceId}`,
        pos: { x: defender.pos.x, y: defender.pos.y - 36 },
        text: armamentEnhanced ? '↩ 무장색 투사체 반사!' : '↩ REFLECT!',
        color: '#38bdf8',
        elapsedSec: 0,
        durationSec: 1.05,
        scale: 1.25
      });
      world.combatLog.push(
        `[투사체 반사] ${defender.name}이(가) 투사체를 1.35배 속도로 역반사했습니다!`
      );
      return {
        outcome: 'PARRIED_PROJECTILE',
        finalDamage: 0,
        negateKnockback: true,
        armamentEnhanced
      };
    }

    // Case C: Unreflectable Beams & Raid Ground Telegraphs -> 85% mitigation + knockback nullified
    const mitigatedDmg = Math.max(
      1,
      Math.round(rawDamage * (1 - UNREFLECTABLE_PARRY_MITIGATION))
    );
    world.parryMiniEvents.push({
      id: `parry_beam_${world.tick}_${defender.instanceId}`,
      unitId: defender.instanceId,
      pos: { x: defender.pos.x, y: defender.pos.y },
      kind: 'BEAM_MITIGATE',
      armamentEnhanced,
      elapsedTicks: 0,
      durationTicks: 16
    });
    world.floatingTexts.push({
      id: `ft_parry_b_${world.tick}_${defender.instanceId}`,
      pos: { x: defender.pos.x, y: defender.pos.y - 34 },
      text: `🛡 완벽 경감! (-85% -> -${mitigatedDmg})`,
      color: '#fde047',
      elapsedSec: 0,
      durationSec: 0.9,
      scale: 1.15
    });
    return {
      outcome: 'PARRIED_MITIGATED',
      finalDamage: mitigatedDmg,
      negateKnockback: true,
      armamentEnhanced
    };
  }

  // 2. General Guard (held past 10-tick parry timing): 55% front-arc mitigation + guard stamina drain
  const frontArcOk =
    attackKind === 'TELEGRAPH' || isAttackFromFrontArc(defender, attacker, incomingDir);
  if (!frontArcOk) {
    return {
      outcome: 'NONE',
      finalDamage: rawDamage,
      negateKnockback: false,
      armamentEnhanced
    };
  }

  const guardedDmg = Math.max(1, Math.round(rawDamage * (1 - GUARD_DAMAGE_MITIGATION)));
  const staminaCost = Math.max(14, Math.min(36, Math.round(rawDamage * 0.35)));
  defender.guardStamina = Math.max(0, defender.guardStamina - staminaCost);

  if (defender.guardStamina <= 0) {
    defender.guardHeld = false;
    defender.guardStartTick = -9999;
    defender.guardBreakTicks = GUARD_BREAK_TICKS;
    defender.windupMoveId = null;
    defender.windupTimer = 0;
    world.screenShakeTimer = Math.max(world.screenShakeTimer, 0.22);
    world.screenShakeMagnitude = Math.max(world.screenShakeMagnitude, 5.5);
    world.floatingTexts.push({
      id: `ft_gbreak_${world.tick}_${defender.instanceId}`,
      pos: { x: defender.pos.x, y: defender.pos.y - 36 },
      text: '💥 GUARD BREAK! (1.8초 경직)',
      color: '#ef4444',
      elapsedSec: 0,
      durationSec: 1.25,
      scale: 1.25
    });
    world.combatLog.push(
      `[가드 브레이크] ${defender.name}의 가드 내구도가 0이 되어 1.8초간 무방비 경직 상태에 빠졌습니다!`
    );
    return {
      outcome: 'GUARD_BREAK',
      finalDamage: guardedDmg,
      negateKnockback: false,
      armamentEnhanced
    };
  }

  world.floatingTexts.push({
    id: `ft_guard_${world.tick}_${defender.instanceId}`,
    pos: { x: defender.pos.x, y: defender.pos.y - 26 },
    text: `🛡 GUARD -${guardedDmg}`,
    color: '#94a3b8',
    elapsedSec: 0,
    durationSec: 0.65,
    scale: 0.95
  });
  return {
    outcome: 'GUARDED',
    finalDamage: guardedDmg,
    negateKnockback: true,
    armamentEnhanced
  };
}
