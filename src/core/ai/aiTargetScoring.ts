import { distVec, normalizeVec, scaleVec, subVec, type Vec2 } from '../math/vector2';
import { getElementAffinity } from '../combat/damageCalc';
import type {
  AiProfileDefinition,
  GameDataRegistry,
  MoveDefinition
} from '../types/dataSchemas';
import type { BattleWorldState, UnitRuntimeState } from '../types/battleState';

export function selectAiPrimaryTarget(
  unit: UnitRuntimeState,
  world: BattleWorldState
): UnitRuntimeState | null {
  const enemies = world.units.filter(
    (u) => u.isAlive && u.isOnField && !u.isDowned && u.team !== unit.team
  );
  if (enemies.length === 0) return null;

  let target = enemies[0];
  if (!target) return null;

  if (unit.tauntTargetUnitId) {
    const taunter = enemies.find((e) => e.instanceId === unit.tauntTargetUnitId);
    if (taunter) {
      return taunter;
    }
  }

  let bestDist = Infinity;
  for (const e of enemies) {
    const d = distVec(unit.pos, e.pos);
    if (d < bestDist) {
      bestDist = d;
      target = e;
    }
  }
  return target;
}

export function computeAiMovementVec(
  unit: UnitRuntimeState,
  target: UnitRuntimeState,
  world: BattleWorldState,
  registry: GameDataRegistry
): { moveVec: Vec2; dirToTarget: Vec2; distToTarget: number } {
  const toTarget = subVec(target.pos, unit.pos);
  const distToTarget = distVec(unit.pos, target.pos);
  const dirToTarget = normalizeVec(toTarget);

  const hasMelee = unit.moveSlots.some(
    (s) => registry.moves[s.moveId]?.archetype === 'MELEE' && s.charges > 0
  );
  let idealDist = hasMelee ? 72 : 240;

  if (unit.aiBehaviorId === 'melee_rusher') {
    idealDist = 56;
  } else if (unit.aiBehaviorId === 'door_ambusher') {
    const airDoorReady = unit.moveSlots.some((s) => {
      const m = registry.moves[s.moveId];
      return Boolean(m?.teleportBehindTarget && s.charges > 0 && s.cooldownTimer <= 0);
    });
    idealDist = airDoorReady ? 190 : 62;
  } else if (unit.aiBehaviorId === 'blade_storm') {
    idealDist = 215;
  } else if (unit.aiBehaviorId === 'lunarian_switcher') {
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
    const strafeSign =
      ((unit.slotIndex % 2) * 2 - 1) *
      (Math.floor(world.elapsedSec / 2) % 2 === 0 ? 1 : -1);
    moveVec = { x: -dirToTarget.y * strafeSign, y: dirToTarget.x * strafeSign };
  }

  return { moveVec, dirToTarget, distToTarget };
}

export function scoreMoveSlotHeuristic(
  unit: UnitRuntimeState,
  target: UnitRuntimeState,
  m: MoveDefinition,
  distToTarget: number,
  world: BattleWorldState,
  registry: GameDataRegistry,
  profile: AiProfileDefinition,
  opponentInDodgeWhiff: boolean,
  opponentAllSkillsOnCooldown: boolean
): number {
  let score = 0;
  const effectiveRange =
    m.archetype === 'MELEE' ? m.rangePx + m.radiusPx * 0.6 : m.rangePx;

  if (distToTarget <= effectiveRange + 15) {
    score += 40;
  } else {
    score -= (distToTarget - effectiveRange) * 0.25;
  }

  const affinity = getElementAffinity(registry.elements, m.element, target.element);
  score += (affinity - 1.0) * 35;
  score += m.basePower * 0.22;

  if (opponentInDodgeWhiff) {
    score += 45 * profile.punishDodgeWhiffWeight;
  }
  if (opponentAllSkillsOnCooldown) {
    score += 32 * profile.cooldownTrackingAccuracy;
  }

  if (m.archetype === 'MELEE' && m.meleeSpec?.deflectProjectiles) {
    const hasNearbyProj = world.projectiles.some(
      (p) =>
        !p.destroyed &&
        p.team !== unit.team &&
        distVec(p.pos, unit.pos) <= m.radiusPx + 35
    );
    if (hasNearbyProj) {
      score += 55 * profile.meleeBeamGuardWeight;
    }
  }

  if (unit.aiBehaviorId === 'melee_rusher') {
    if (m.selfBuff && unit.statBuffs.length === 0) score += 48;
    if (m.archetype === 'MELEE') score += 24;
  } else if (unit.aiBehaviorId === 'door_ambusher') {
    if (m.teleportBehindTarget && distToTarget >= 90) score += 65;
    if (m.archetype === 'STATUS' && distToTarget <= 115) score += 38;
  } else if (unit.aiBehaviorId === 'blade_storm') {
    if (m.archetype === 'PROJECTILE' && m.projectileSpec?.pattern === 'BURST') score += 42;
  } else if (unit.aiBehaviorId === 'lunarian_switcher') {
    if (m.extinguishesLunarianFlame) {
      if (opponentInDodgeWhiff || (distToTarget >= 110 && distToTarget <= 320)) {
        score += 52;
      } else if (unit.hp < unit.maxHp * 0.35) {
        score -= 18;
      }
    }
  } else if (unit.aiBehaviorId === 'regen_zoner') {
    if (m.archetype === 'AOE_FIELD') score += 46;
    if (m.archetype === 'STATUS') score += 35;
  } else if (unit.aiBehaviorId === 'giant_crusher') {
    if (m.aoeFieldSpec?.fieldKind === 'GLOBAL_WEATHER' && world.weather.id !== 'ION_STORM') {
      score += 60;
    }
    if (m.hasConquerorCoating) score += 34;
  } else if (unit.aiBehaviorId === 'trickster_mid') {
    if (m.archetype === 'PROJECTILE') score += 36;
  } else if (unit.aiBehaviorId === 'heavy_zoner') {
    if (m.aoeFieldSpec?.expandingPoisonCloud) score += 55;
    if (m.meleeReflectSec && distToTarget < 110) score += 48;
  } else if (unit.aiBehaviorId === 'pressure_pursuer') {
    if (m.skillCooldownDelaySec && target.fruitType !== 'NONE') score += 48;
    if (m.archetype === 'STATUS' || m.meleeSpec?.subtype === 'DASH') score += 35;
  } else if (unit.aiBehaviorId === 'venom_warden') {
    if (m.triggersVenomDemon && !unit.venomDemonActive && unit.hp <= unit.maxHp * 0.7) {
      score += 72;
    }
    if (m.aoeFieldSpec?.expandingPoisonCloud) score += 48;
    if (m.projectileSpec?.homingTurnRateRadPerSec && distToTarget >= 110) score += 45;
    if (m.meleeSpec?.subtype === 'DASH' && distToTarget >= 95 && distToTarget <= 240) {
      score += 38;
    }
  }

  return score;
}
