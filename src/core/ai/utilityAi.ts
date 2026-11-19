import type { SeededPRNG } from '../math/prng';
import {
  addVec,
  distVec,
  normalizeVec,
  pointToSegmentDist,
  scaleVec,
  subVec,
  type Vec2
} from '../math/vector2';
import { canActivateFormShift } from '../combat/formShiftEngine';
import { detectIncomingAttackThreat } from '../combat/dodgeSystem';
import { isUnitSkillSealed, isUnitStaggered } from '../combat/statusEngine';
import { getElementAffinity } from '../combat/damageCalc';
import type { GameDataRegistry } from '../types/dataSchemas';
import type {
  BattleWorldState,
  UnitInputCommand,
  UnitRuntimeState
} from '../types/battleState';

export function computeAiCommand(
  unit: UnitRuntimeState,
  world: BattleWorldState,
  registry: GameDataRegistry,
  prng: SeededPRNG,
  dt: number
): UnitInputCommand {
  const emptyCmd: UnitInputCommand = {
    unitId: unit.instanceId,
    moveVec: { x: 0, y: 0 },
    aimVec: null,
    castMoveSlotIndex: null,
    dodgePressed: false,
    formShiftPressed: false,
    swapToBenchUnitId: null
  };

  if (!unit.isAlive || !unit.isOnField || isUnitStaggered(unit)) {
    return emptyCmd;
  }

  const profile =
    registry.aiProfiles[unit.aiLevel] ??
    registry.aiProfiles[3] ?? {
      level: 3,
      name: 'Default',
      statMultiplier: 1.0,
      reactionDelaySec: 0.22,
      allowRecoveryItems: true,
      recoveryItemCount: 1,
      cooldownTrackingAccuracy: 0.65,
      punishDodgeWhiffWeight: 0.65,
      meleeBeamGuardWeight: 0.6,
      justDodgeChance: 0.35,
      formShiftAggression: 0.7
    };

  // Find primary target (respecting Taunt if active)
  const enemies = world.units.filter(
    (u) => u.isAlive && u.isOnField && u.team !== unit.team
  );
  if (enemies.length === 0) {
    return emptyCmd;
  }

  let target = enemies[0];
  if (unit.tauntTargetUnitId) {
    const taunter = enemies.find((e) => e.instanceId === unit.tauntTargetUnitId);
    if (taunter) {
      target = taunter;
    }
  } else {
    let bestDist = Infinity;
    for (const e of enemies) {
      const d = distVec(unit.pos, e.pos);
      if (d < bestDist) {
        bestDist = d;
        target = e;
      }
    }
  }

  const toTarget = subVec(target.pos, unit.pos);
  const distToTarget = distVec(unit.pos, target.pos);
  const dirToTarget = normalizeVec(toTarget);

  // Desired spacing based on move loadout & Phase 6 Tactical AI Behavior Preset
  const hasMelee = unit.moveSlots.some(
    (s) => registry.moves[s.moveId]?.archetype === 'MELEE' && s.charges > 0
  );
  let idealDist = hasMelee ? 72 : 240;

  if (unit.aiBehaviorId === 'melee_rusher') {
    idealDist = 56;
  } else if (unit.aiBehaviorId === 'door_ambusher') {
    // Keep medium distance until Air Door teleport is ready, then strike closely
    const airDoorReady = unit.moveSlots.some((s) => {
      const m = registry.moves[s.moveId];
      return Boolean(m?.teleportBehindTarget && s.charges > 0 && s.cooldownTimer <= 0);
    });
    idealDist = airDoorReady ? 190 : 62;
  } else if (unit.aiBehaviorId === 'blade_storm') {
    idealDist = 215;
  } else if (unit.aiBehaviorId === 'lunarian_switcher') {
    // Brawl at close-mid range while flame armor is ON; kite fast when flame is OFF
    idealDist = unit.lunarianFlameOn ? 88 : 195;
  } else if (unit.aiBehaviorId === 'regen_zoner') {
    idealDist = 250;
  } else if (unit.aiBehaviorId === 'giant_crusher') {
    idealDist = 110;
  } else if (unit.aiBehaviorId === 'trickster_mid') {
    idealDist = 175;
  } else if (unit.aiBehaviorId === 'heavy_zoner') {
    idealDist = 210;
  } else if (unit.aiBehaviorId === 'pressure_pursuer') {
    idealDist = 85;
  } else if (unit.aiBehaviorId === 'sand_zoner') {
    idealDist = 200;
  } else if (unit.aiBehaviorId === 'lightning_kiter') {
    idealDist = 265;
  } else if (unit.aiBehaviorId === 'minion_controller') {
    idealDist = 240;
  } else if (unit.aiBehaviorId === 'relentless_boss') {
    idealDist = 115;
  } else if (unit.aiBehaviorId === 'control_zoner') {
    idealDist = 185;
  } else if (unit.aiBehaviorId === 'anti_fruit_bruiser') {
    idealDist = 125;
  } else if (unit.aiBehaviorId === 'berserk_rusher') {
    idealDist = unit.steroidOverdriveActive ? 54 : 95;
  } else if (unit.aiBehaviorId === 'string_controller') {
    idealDist = 215;
  } else if (unit.aiBehaviorId === 'foresight_duelist') {
    idealDist = 105;
  }

  let moveVec: Vec2 = { x: 0, y: 0 };
  if (distToTarget > idealDist + 24) {
    moveVec = dirToTarget;
  } else if (distToTarget < idealDist - 28) {
    moveVec = scaleVec(dirToTarget, -1);
  } else {
    // Strafe perpendicular
    const strafeSign = ((unit.slotIndex % 2) * 2 - 1) * (Math.floor(world.elapsedSec / 2) % 2 === 0 ? 1 : -1);
    moveVec = { x: -dirToTarget.y * strafeSign, y: dirToTarget.x * strafeSign };
  }

  // Reaction timer gating for discrete actions
  unit.aiReactionTimer = Math.max(0, unit.aiReactionTimer - dt);
  if (unit.aiReactionTimer > 0) {
    return {
      ...emptyCmd,
      moveVec,
      aimVec: dirToTarget
    };
  }

  // 1. Recovery item check (if allowed by AI profile and HP < 35%)
  if (
    profile.allowRecoveryItems &&
    unit.aiRecoveryItemsLeft > 0 &&
    unit.hp / Math.max(1, unit.maxHp) < 0.35
  ) {
    unit.aiRecoveryItemsLeft -= 1;
    const heal = Math.round(unit.maxHp * 0.28);
    unit.hp = Math.min(unit.maxHp, unit.hp + heal);
    unit.aiReactionTimer = profile.reactionDelaySec;
    world.floatingTexts.push({
      id: `ft_aiheal_${world.tick}_${unit.instanceId}`,
      pos: { x: unit.pos.x, y: unit.pos.y - 30 },
      text: `AI NANO-KIT +${heal}`,
      color: '#4ade80',
      elapsedSec: 0,
      durationSec: 0.9,
      scale: 1.05
    });
    world.combatLog.push(`[AI 회복] ${unit.name} 회복 키트 사용 (+${heal} HP)`);
  }

  // 2. Check incoming enemy beam for Melee-vs-Beam active guard (high-level AI behavior)
  let incomingEnemyBeam = false;
  for (const beam of world.beams) {
    if (beam.terminated || beam.team === unit.team) continue;
    const beamEnd = addVec(beam.origin, scaleVec(beam.dir, beam.currentLengthPx));
    const d = pointToSegmentDist(unit.pos, beam.origin, beamEnd);
    if (d <= unit.radiusPx + beam.widthPx * 0.5 + 32) {
      incomingEnemyBeam = true;
      break;
    }
  }

  if (incomingEnemyBeam && prng.chance(profile.meleeBeamGuardWeight)) {
    const guardSlotIdx = unit.moveSlots.findIndex((slot) => {
      const m = registry.moves[slot.moveId];
      return (
        m &&
        m.archetype === 'MELEE' &&
        m.meleeSpec?.canGuardBeam &&
        slot.charges > 0 &&
        slot.cooldownTimer <= 0
      );
    });

    if (guardSlotIdx >= 0) {
      unit.aiReactionTimer = profile.reactionDelaySec;
      return {
        ...emptyCmd,
        moveVec: dirToTarget,
        aimVec: dirToTarget,
        castMoveSlotIndex: guardSlotIdx
      };
    }
  }

  // 3. Check incoming attack threat -> Just Dodge attempt
  if (
    unit.dodgeStacks >= 1 &&
    detectIncomingAttackThreat(unit, world, registry) &&
    prng.chance(profile.justDodgeChance)
  ) {
    unit.aiReactionTimer = profile.reactionDelaySec;
    const perpDodge = { x: -dirToTarget.y, y: dirToTarget.x };
    return {
      ...emptyCmd,
      moveVec: perpDodge,
      aimVec: dirToTarget,
      dodgePressed: true
    };
  }

  // 4. Form Shift (Awakening / Overdrive / Zoan Hybrid) activation check
  const wantsHybridStance =
    (unit.aiBehaviorId === 'blade_storm' ||
      unit.aiBehaviorId === 'lunarian_switcher') &&
    unit.stanceFormIds.length > 0 &&
    unit.currentStanceRole === 'BASE';
  if (
    wantsHybridStance ||
    (canActivateFormShift(unit, registry).allowed &&
      (unit.hp / Math.max(1, unit.maxHp) <= 0.78 || distToTarget <= 300) &&
      prng.chance(profile.formShiftAggression * 0.35))
  ) {
    unit.aiReactionTimer = profile.reactionDelaySec;
    return {
      ...emptyCmd,
      moveVec,
      aimVec: dirToTarget,
      formShiftPressed: true
    };
  }

  // 5. Utility score evaluation across available move slots
  const opponentInDodgeWhiff = target.recentDodgeWhiffTimer > 0;
  const opponentAllSkillsOnCooldown =
    prng.chance(profile.cooldownTrackingAccuracy) &&
    target.moveSlots.every((s) => s.cooldownTimer > 0.4 || s.charges === 0);

  let bestSlot: number | null = null;
  let bestScore = 15; // Minimum threshold to cast

  const sealed = isUnitSkillSealed(unit);

  for (let i = 0; i < unit.moveSlots.length; i++) {
    const slot = unit.moveSlots[i];
    if (slot.charges <= 0 || slot.cooldownTimer > 0) continue;

    const m = registry.moves[slot.moveId];
    if (!m) continue;
    if (sealed && m.category === 'SPECIAL') continue;

    let score = 0;
    const effectiveRange = m.archetype === 'MELEE' ? m.rangePx + m.radiusPx * 0.6 : m.rangePx;

    if (distToTarget <= effectiveRange + 15) {
      score += 40;
    } else {
      score -= (distToTarget - effectiveRange) * 0.25;
    }

    // Element affinity weighting
    const affinity = getElementAffinity(registry.elements, m.element, target.element);
    score += (affinity - 1.0) * 35;

    // Base power contribution
    score += m.basePower * 0.22;

    // Punish opponent dodge whiff or tracked skill cooldown opening!
    if (opponentInDodgeWhiff) {
      score += 45 * profile.punishDodgeWhiffWeight;
    }
    if (opponentAllSkillsOnCooldown) {
      score += 32 * profile.cooldownTrackingAccuracy;
    }

    // Counter incoming enemy projectiles with melee deflect
    if (m.archetype === 'MELEE' && m.meleeSpec?.deflectProjectiles) {
      const hasNearbyProj = world.projectiles.some(
        (p) => !p.destroyed && p.team !== unit.team && distVec(p.pos, unit.pos) <= m.radiusPx + 35
      );
      if (hasNearbyProj) {
        score += 55 * profile.meleeBeamGuardWeight;
      }
    }

    // Phase 6 Tactical AI Behavior Preset skill priority weighting
    if (unit.aiBehaviorId === 'melee_rusher') {
      if (m.selfBuff && unit.statBuffs.length === 0) {
        score += 48;
      }
      if (m.archetype === 'MELEE') {
        score += 24;
      }
    } else if (unit.aiBehaviorId === 'door_ambusher') {
      if (m.teleportBehindTarget && distToTarget >= 90) {
        score += 65;
      }
      if (m.archetype === 'STATUS' && distToTarget <= 115) {
        score += 38;
      }
    } else if (unit.aiBehaviorId === 'blade_storm') {
      if (m.archetype === 'PROJECTILE' && m.projectileSpec?.pattern === 'BURST') {
        score += 42;
      }
    } else if (unit.aiBehaviorId === 'lunarian_switcher') {
      if (m.extinguishesLunarianFlame) {
        // Prefer flame-off high-speed burst when enemy is in dodge recovery or mid-range
        if (opponentInDodgeWhiff || (distToTarget >= 110 && distToTarget <= 320)) {
          score += 52;
        } else if (unit.hp < unit.maxHp * 0.35) {
          score -= 18;
        }
      }
    } else if (unit.aiBehaviorId === 'regen_zoner') {
      if (m.archetype === 'AOE_FIELD') {
        score += 46;
      }
      if (m.archetype === 'STATUS') {
        score += 35;
      }
    } else if (unit.aiBehaviorId === 'giant_crusher') {
      if (m.aoeFieldSpec?.fieldKind === 'GLOBAL_WEATHER' && world.weather.id !== 'ION_STORM') {
        score += 60;
      }
      if (m.hasConquerorCoating) {
        score += 34;
      }
    } else if (unit.aiBehaviorId === 'trickster_mid') {
      if (m.archetype === 'PROJECTILE') {
        score += 36;
      }
    } else if (unit.aiBehaviorId === 'heavy_zoner') {
      if (m.aoeFieldSpec?.expandingPoisonCloud) {
        score += 55;
      }
      if (m.meleeReflectSec && distToTarget < 110) {
        score += 48;
      }
    } else if (unit.aiBehaviorId === 'pressure_pursuer') {
      if (m.skillCooldownDelaySec && target.fruitType !== 'NONE') {
        score += 48;
      }
      if (m.archetype === 'STATUS' || m.meleeSpec?.subtype === 'DASH') {
        score += 35;
      }
    }

    // Slight deterministic jitter
    score += prng.nextRange(-5, 5);

    if (score > bestScore) {
      bestScore = score;
      bestSlot = i;
    }
  }

  if (bestSlot !== null) {
    unit.aiReactionTimer = profile.reactionDelaySec;
  }

  return {
    ...emptyCmd,
    moveVec,
    aimVec: dirToTarget,
    castMoveSlotIndex: bestSlot
  };
}
