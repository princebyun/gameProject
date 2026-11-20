import { computeDamage } from '../combat/damageCalc';
import { applyStatus, isUnitStaggered } from '../combat/statusEngine';
import type { SeededPRNG } from '../math/prng';
import { clamp, distVec, normalizeVec, scaleVec, subVec } from '../math/vector2';
import type {
  ActiveBattleCutin,
  BattleCutinKind,
  BattleWorldState,
  TeamId,
  UnitRuntimeState
} from '../types/battleState';
import type { BondComboDefinition, GameDataRegistry } from '../types/dataSchemas';

export const CUTIN_FREEZE_TICKS = 39; // Exact 0.65s @ 60Hz deterministic freeze
export const BOND_COMBO_TOTAL_TICKS = 42; // ~0.70s guest ally rush sequence
export const BOND_COMBO_IMPACT_TICK = 14;
export const BOND_HIT_GAIN = 6;
export const BOND_SWAP_FOLLOWUP_GAIN = 12;
export const BOND_JUST_DODGE_GAIN = 15;
export const BOND_SWAP_WINDOW_TICKS = 180; // 3.0s @ 60Hz

const FALLBACK_GENERIC_COMBO: BondComboDefinition = {
  comboId: 'generic_crew_allout',
  name: '밀짚모자 일제 돌격',
  subtitle: '동료와 호흡을 맞춘 2인 교차 연계 러시',
  pair: null,
  isGeneric: true,
  pattern: 'GENERIC_ALLOUT',
  element: 'BLUNT',
  basePower: 148,
  radiusPx: 115,
  rangePx: 320,
  applyStatus: 'STAGGER',
  statusDurationSec: 1.3,
  themeColors: ['#facc15', '#38bdf8'],
  guestAnimState: 'ATTACK_MELEE',
  cutinCallout: '간다, 동료여 — 일제 돌격!!'
};

export interface TriggerCutinParams {
  kind: BattleCutinKind;
  team: TeamId;
  primaryUnit: UnitRuntimeState;
  partnerUnit?: UnitRuntimeState | null;
  title: string;
  subtitle: string;
  primaryColor: string;
  secondaryColor: string;
  portraitEmotion?: 'angry' | 'determined' | 'excited';
}

/**
 * Triggers a deterministic 39-tick (0.65s @ 60Hz) full-wide battle cut-in freeze.
 * Identical across all clients in online lockstep regardless of local UI display mode.
 */
export function triggerBattleCutin(
  world: BattleWorldState,
  params: TriggerCutinParams
): ActiveBattleCutin {
  const cutin: ActiveBattleCutin = {
    id: `cutin_${world.tick}_${params.kind}_${params.primaryUnit.instanceId}`,
    kind: params.kind,
    team: params.team,
    primaryUnitId: params.primaryUnit.instanceId,
    primarySpeciesId: params.primaryUnit.speciesId,
    primaryName: params.primaryUnit.name,
    primaryFormId: params.primaryUnit.activeFormId,
    partnerUnitId: params.partnerUnit?.instanceId,
    partnerSpeciesId: params.partnerUnit?.speciesId,
    partnerName: params.partnerUnit?.name,
    title: params.title,
    subtitle: params.subtitle,
    primaryColor: params.primaryColor,
    secondaryColor: params.secondaryColor,
    portraitEmotion: params.portraitEmotion ?? 'angry',
    elapsedTicks: 0,
    durationTicks: CUTIN_FREEZE_TICKS
  };
  world.cutinFreezeTicks = CUTIN_FREEZE_TICKS;
  world.activeCutin = cutin;
  return cutin;
}

/**
 * Bond Gauge is active whenever the team has 2 or more surviving allies (on-field + bench).
 */
export function isTeamBondComboAvailable(
  team: TeamId,
  world: BattleWorldState
): boolean {
  let aliveAllies = 0;
  for (const u of world.units) {
    if (u.team === team && u.isAlive && !u.isMinion && !u.isDowned) {
      aliveAllies += 1;
      if (aliveAllies >= 2) return true;
    }
  }
  return false;
}

export function addTeamBondGauge(
  team: TeamId,
  amount: number,
  world: BattleWorldState
): number {
  if (amount <= 0) return world.rosters[team].bondGauge;
  if (!isTeamBondComboAvailable(team, world)) {
    return world.rosters[team].bondGauge;
  }
  const roster = world.rosters[team];
  roster.bondGauge = clamp(Math.round((roster.bondGauge + amount) * 10) / 10, 0, 100);
  return roster.bondGauge;
}

/**
 * Resolves a dedicated 2-character Bond Tag Combo (order-independent),
 * falling back to `generic_crew_allout` for any other ally pair.
 */
export function resolveBondComboForPair(
  speciesA: string,
  speciesB: string,
  registry: GameDataRegistry
): BondComboDefinition {
  const combos = registry.combos;
  if (combos) {
    for (const def of Object.values(combos)) {
      if (!def.pair) continue;
      const [p0, p1] = def.pair;
      if (
        (p0 === speciesA && p1 === speciesB) ||
        (p0 === speciesB && p1 === speciesA)
      ) {
        return def;
      }
    }
    if (combos['generic_crew_allout']) {
      return combos['generic_crew_allout'];
    }
  }
  return FALLBACK_GENERIC_COMBO;
}

/**
 * Picks the best surviving ally for a Bond Tag Combo:
 * prefers the first alive bench ally (classic tag-in guest strike),
 * or another alive on-field ally (e.g. 2v2 / Co-op Raid).
 */
export function selectBondPartnerUnit(
  leadUnit: UnitRuntimeState,
  world: BattleWorldState
): UnitRuntimeState | null {
  const benchAlly = world.units.find(
    (u) =>
      u.team === leadUnit.team &&
      u.instanceId !== leadUnit.instanceId &&
      u.isAlive &&
      !u.isMinion &&
      !u.isDowned &&
      !u.isOnField
  );
  if (benchAlly) return benchAlly;

  const fieldAlly = world.units.find(
    (u) =>
      u.team === leadUnit.team &&
      u.instanceId !== leadUnit.instanceId &&
      u.isAlive &&
      !u.isMinion &&
      !u.isDowned &&
      u.isOnField
  );
  return fieldAlly ?? null;
}

export function canActivateBondTagCombo(
  leadUnit: UnitRuntimeState,
  world: BattleWorldState
): { allowed: boolean; partner: UnitRuntimeState | null } {
  if (
    !leadUnit.isAlive ||
    !leadUnit.isOnField ||
    leadUnit.isDowned ||
    isUnitStaggered(leadUnit) ||
    leadUnit.clashLockId !== null ||
    world.activeBondCombo !== null ||
    world.cutinFreezeTicks > 0
  ) {
    return { allowed: false, partner: null };
  }
  const roster = world.rosters[leadUnit.team];
  if (roster.bondGauge < 100) {
    return { allowed: false, partner: null };
  }
  const partner = selectBondPartnerUnit(leadUnit, world);
  if (!partner) {
    return { allowed: false, partner: null };
  }
  return { allowed: true, partner };
}

/**
 * Activates a 2:2 Bond Tag Combo:
 * - Consumes 100 Bond Gauge
 * - Grants invulnerability frames to lead + partner during the combo
 * - Triggers the 39-tick dual split pixel cut-in (`BOND_COMBO`)
 * - Spawns the partner guest sprite session (`world.activeBondCombo`)
 */
export function tryActivateBondTagCombo(
  leadUnit: UnitRuntimeState,
  world: BattleWorldState,
  registry: GameDataRegistry
): { activated: boolean; comboDef: BondComboDefinition | null } {
  const check = canActivateBondTagCombo(leadUnit, world);
  if (!check.allowed || !check.partner) {
    return { activated: false, comboDef: null };
  }

  const partner = check.partner;
  const comboDef = resolveBondComboForPair(
    leadUnit.speciesId,
    partner.speciesId,
    registry
  );

  // Consume gauge & grant invulnerability to both allies
  world.rosters[leadUnit.team].bondGauge = 0;
  leadUnit.iframeTimer = Math.max(leadUnit.iframeTimer, 1.25);
  leadUnit.windupMoveId = null;
  leadUnit.windupTimer = 0;
  leadUnit.guardHeld = false;
  partner.iframeTimer = Math.max(partner.iframeTimer, 1.25);

  // Find primary target for guest ally leap coordinates
  let nearestEnemy: UnitRuntimeState | null = null;
  let nearestDist = Infinity;
  for (const u of world.units) {
    if (!u.isAlive || !u.isOnField || u.isDowned || u.team === leadUnit.team) continue;
    const d = distVec(leadUnit.pos, u.pos);
    if (d < nearestDist) {
      nearestDist = d;
      nearestEnemy = u;
    }
  }

  const facingX: 1 | -1 = nearestEnemy
    ? nearestEnemy.pos.x >= leadUnit.pos.x
      ? 1
      : -1
    : leadUnit.aimDir.x >= 0
      ? 1
      : -1;

  // Shambles Ambush teleports lead behind enemy for guaranteed rear Red Hawk!
  if (comboDef.pattern === 'SHAMBLES_AMBUSH' && nearestEnemy) {
    const behindX = clamp(
      nearestEnemy.pos.x + facingX * 44,
      leadUnit.radiusPx + 8,
      world.arenaWidth - leadUnit.radiusPx - 8
    );
    leadUnit.pos.x = behindX;
    leadUnit.pos.y = clamp(
      nearestEnemy.pos.y,
      leadUnit.radiusPx + 8,
      world.arenaHeight - leadUnit.radiusPx - 8
    );
    leadUnit.prevPos = { ...leadUnit.pos };
    leadUnit.aimDir = { x: -facingX, y: 0 };
  }

  const targetPos = nearestEnemy
    ? {
        x: clamp(nearestEnemy.pos.x - facingX * 42, 48, world.arenaWidth - 48),
        y: clamp(nearestEnemy.pos.y, 48, world.arenaHeight - 48)
      }
    : {
        x: clamp(leadUnit.pos.x + facingX * 140, 48, world.arenaWidth - 48),
        y: clamp(leadUnit.pos.y, 48, world.arenaHeight - 48)
      };

  const startPos = {
    x: clamp(leadUnit.pos.x - facingX * 92, 32, world.arenaWidth - 32),
    y: clamp(leadUnit.pos.y - 44, 32, world.arenaHeight - 32)
  };

  triggerBattleCutin(world, {
    kind: 'BOND_COMBO',
    team: leadUnit.team,
    primaryUnit: leadUnit,
    partnerUnit: partner,
    title: comboDef.name,
    subtitle: comboDef.cutinCallout || `${leadUnit.name} × ${partner.name} · ${comboDef.subtitle}`,
    primaryColor: comboDef.themeColors[0],
    secondaryColor: comboDef.themeColors[1],
    portraitEmotion: 'excited'
  });

  world.activeBondCombo = {
    id: `bond_${world.tick}_${comboDef.comboId}`,
    comboId: comboDef.comboId,
    name: comboDef.name,
    team: leadUnit.team,
    leadUnitId: leadUnit.instanceId,
    partnerUnitId: partner.instanceId,
    partnerSpeciesId: partner.speciesId,
    partnerName: partner.name,
    partnerPos: { x: startPos.x, y: startPos.y },
    partnerStartPos: startPos,
    partnerTargetPos: targetPos,
    partnerFacingX: facingX,
    partnerAnimState: comboDef.guestAnimState,
    themeColors: [comboDef.themeColors[0], comboDef.themeColors[1]],
    elapsedTicks: 0,
    totalTicks: BOND_COMBO_TOTAL_TICKS,
    impactTick: BOND_COMBO_IMPACT_TICK,
    impactExecuted: false
  };

  world.combatLog.push(
    `[동료 합동기 발동!] ${leadUnit.name} × ${partner.name}: 「${comboDef.name}」!`
  );

  return { activated: true, comboDef };
}

/**
 * Steps the active guest-ally Bond Tag Combo animation and applies its deterministic impact.
 */
export function stepActiveBondCombo(
  world: BattleWorldState,
  registry: GameDataRegistry,
  _prng: SeededPRNG
): void {
  const session = world.activeBondCombo;
  if (!session) return;

  session.elapsedTicks += 1;

  // Interpolate partner leap-in -> strike -> leap-out
  if (session.elapsedTicks <= session.impactTick) {
    const t = clamp(session.elapsedTicks / Math.max(1, session.impactTick), 0, 1);
    const ease = 1 - (1 - t) * (1 - t);
    session.partnerPos.x =
      session.partnerStartPos.x +
      (session.partnerTargetPos.x - session.partnerStartPos.x) * ease;
    session.partnerPos.y =
      session.partnerStartPos.y +
      (session.partnerTargetPos.y - session.partnerStartPos.y) * ease -
      Math.sin(t * Math.PI) * 34;
  } else if (session.elapsedTicks <= session.impactTick + 12) {
    session.partnerPos.x = session.partnerTargetPos.x;
    session.partnerPos.y = session.partnerTargetPos.y;
  } else {
    const outTicks = session.totalTicks - (session.impactTick + 12);
    const t = clamp(
      (session.elapsedTicks - (session.impactTick + 12)) / Math.max(1, outTicks),
      0,
      1
    );
    session.partnerPos.x =
      session.partnerTargetPos.x +
      (session.partnerStartPos.x - session.partnerTargetPos.x) * t;
    session.partnerPos.y =
      session.partnerTargetPos.y +
      (session.partnerStartPos.y - session.partnerTargetPos.y) * t -
      Math.sin(t * Math.PI) * 28;
  }

  // Execute deterministic impact once at impactTick
  if (!session.impactExecuted && session.elapsedTicks >= session.impactTick) {
    session.impactExecuted = true;
    const comboDef =
      registry.combos?.[session.comboId] ?? FALLBACK_GENERIC_COMBO;
    const leadUnit = world.units.find((u) => u.instanceId === session.leadUnitId);

    // 1. Optional Team Heal (e.g. Chopper + Robin, Luffy + Marco)
    const healRatio = comboDef.healAllyHpRatio ?? 0;
    if (healRatio > 0) {
      for (const ally of world.units) {
        if (!ally.isAlive || !ally.isOnField || ally.isDowned || ally.team !== session.team) {
          continue;
        }
        const healAmt = Math.max(1, Math.round(ally.maxHp * healRatio));
        ally.hp = Math.min(ally.maxHp, ally.hp + healAmt);
        world.floatingTexts.push({
          id: `ft_bond_heal_${world.tick}_${ally.instanceId}`,
          pos: { x: ally.pos.x, y: ally.pos.y - 34 },
          text: `💚 합동 치유 +${healAmt}`,
          color: '#4ade80',
          elapsedSec: 0,
          durationSec: 1.25,
          scale: 1.2
        });
      }
    }

    // 2. Strike enemy targets within combo impact range
    if (leadUnit) {
      const impactRadius = Math.max(comboDef.rangePx, 420);
      const isSpecialPattern =
        comboDef.pattern === 'THUNDER_AOE' ||
        comboDef.pattern === 'SNIPE_BEAM' ||
        comboDef.pattern === 'FREEZE_OCEAN_WAVE';

      for (const target of world.units) {
        if (
          !target.isAlive ||
          !target.isOnField ||
          target.isDowned ||
          target.team === session.team
        ) {
          continue;
        }
        if (distVec(session.partnerTargetPos, target.pos) > impactRadius + target.radiusPx) {
          continue;
        }

        const res = computeDamage(
          comboDef.basePower,
          leadUnit,
          target,
          isSpecialPattern ? 'SPECIAL' : 'PHYSICAL',
          comboDef.element,
          world,
          registry,
          {
            hasArmamentHaki: true,
            isInternalDestruction: Boolean(comboDef.armorPiercing),
            hasConquerorCoating: comboDef.basePower >= 165,
            isBurstOrAoe: true
          }
        );

        let finalDmg = res.nullified
          ? Math.max(18, Math.round(comboDef.basePower * 0.45))
          : res.damage;

        // Anti-fruit bonus multiplier (e.g., Brook + Jinbe Freezing Ocean Wave)
        if (
          comboDef.antiFruitMultiplier &&
          comboDef.antiFruitMultiplier > 1 &&
          target.fruitType !== 'NONE'
        ) {
          finalDmg = Math.round(finalDmg * comboDef.antiFruitMultiplier);
        }

        // Amplify against PARRY_STUNNED enemies (1.25x)
        if (target.parryStunTicks > 0) {
          finalDmg = Math.round(finalDmg * target.parryDamageVulnMult);
        }

        // Raid Boss DPS shield / break gauge integration
        if (
          world.raidState.active &&
          world.raidState.bossUnitId === target.instanceId
        ) {
          if (world.raidState.dpsCheck.active && world.raidState.dpsCheck.shieldHp > 0) {
            world.raidState.dpsCheck.shieldHp = Math.max(
              0,
              world.raidState.dpsCheck.shieldHp - finalDmg
            );
            finalDmg = 0;
          } else if (world.raidState.groggyTimer <= 0) {
            world.raidState.breakGauge = Math.max(
              0,
              world.raidState.breakGauge - Math.round(world.raidState.breakGaugeMax * 0.25)
            );
          }
        }

        target.hp = Math.max(0, target.hp - finalDmg);
        target.superRegenIdleTimer = 0;

        if (comboDef.applyStatus && (comboDef.statusDurationSec ?? 0) > 0) {
          applyStatus(
            target,
            comboDef.applyStatus,
            comboDef.statusDurationSec ?? 1.5,
            leadUnit.instanceId,
            world,
            registry
          );
        }

        const kbDir = normalizeVec(
          subVec(target.pos, session.partnerTargetPos),
          { x: session.partnerFacingX, y: 0 }
        );
        target.knockbackVel = scaleVec(
          kbDir,
          210 * Math.max(0.2, 1 - target.knockbackResist)
        );

        world.floatingTexts.push({
          id: `ft_bond_hit_${world.tick}_${target.instanceId}`,
          pos: { x: target.pos.x, y: target.pos.y - 36 },
          text: `★ ${comboDef.name} -${finalDmg}!`,
          color: comboDef.themeColors[0],
          elapsedSec: 0,
          durationSec: 1.35,
          scale: 1.35
        });
      }
    }

    world.screenShakeTimer = Math.max(world.screenShakeTimer, 0.28);
    world.screenShakeMagnitude = Math.max(world.screenShakeMagnitude, 8.0);
    world.vfxEvents.push({
      id: `vfx_bond_1_${world.tick}`,
      kind:
        comboDef.pattern === 'CROSS_SLASH_X'
          ? 'CROSS_SLASH'
          : comboDef.pattern === 'PIERCE_CANNON' || comboDef.pattern === 'SHAMBLES_AMBUSH'
            ? 'SKY_SPLIT_SHOCKWAVE'
            : 'CONQUEROR_LIGHTNING',
      pos: { x: session.partnerTargetPos.x, y: session.partnerTargetPos.y },
      color: comboDef.themeColors[0],
      radiusPx: Math.max(120, comboDef.radiusPx),
      elapsedSec: 0,
      durationSec: 0.45
    });
    world.vfxEvents.push({
      id: `vfx_bond_2_${world.tick}`,
      kind: 'CLASH_SHOCKWAVE',
      pos: { x: session.partnerTargetPos.x, y: session.partnerTargetPos.y },
      color: comboDef.themeColors[1],
      radiusPx: Math.max(160, comboDef.radiusPx + 45),
      elapsedSec: 0,
      durationSec: 0.5
    });
  }

  if (session.elapsedTicks >= session.totalTicks) {
    world.activeBondCombo = null;
  }
}
