import { applyStatus } from '../combat/statusEngine';
import type { SeededPRNG } from '../math/prng';
import {
  clamp,
  distVec,
  isCircleIntersectingSector,
  normalizeVec,
  subVec
} from '../math/vector2';
import type {
  ActiveTelegraphZone,
  BattleWorldConfig,
  BattleWorldState,
  RaidBattleConfig,
  RaidRuntimeState,
  UnitBuildConfig,
  UnitEndgameBonuses,
  UnitRuntimeState
} from '../types/battleState';
import type { GameDataRegistry } from '../types/dataSchemas';
import type { RpgCampaignState } from '../types/rpgSchemas';
import type {
  EndgameDataRegistry,
  RaidBossDefinition,
  RaidRelicDefinition
} from './types';

export const RAID_DOWNED_DURATION_SEC = 15.0;
export const RAID_RESCUE_RADIUS_PX = 78;
export const RAID_RESCUE_CHANNEL_SEC = 2.0;
export const RAID_RESCUE_HP_RATIO = 0.4;

export function isRaidUnlocked(
  raidId: string,
  campaign: RpgCampaignState,
  endgameReg: EndgameDataRegistry
): boolean {
  if (campaign.debugUnlockEndgame) return true;
  const def = endgameReg.raids[raidId];
  if (!def) return false;
  return campaign.completedEpisodes.includes(def.requiredEpisodeId);
}

export function buildRaidBossUnitBuild(
  raidDef: RaidBossDefinition,
  gameReg: GameDataRegistry
): UnitBuildConfig {
  const unitDef = gameReg.units[raidDef.speciesId] ?? gameReg.units['kaido'];
  return {
    instanceId: `raid_boss_${raidDef.raidId}`,
    speciesId: unitDef.id,
    customName: raidDef.name,
    level: raidDef.bossLevel,
    ivs: { hp: 31, atk: 28, def: 26, spAtk: 28, spDef: 26, spd: 22 },
    evs: { hp: 160, atk: 120, def: 90, spAtk: 120, spDef: 90, spd: 60 },
    moveIds: [...unitDef.defaultMoves],
    equipmentId: unitDef.defaultEquipmentId,
    traitId: unitDef.traitId,
    formId: unitDef.awakenedFormId ?? unitDef.defaultFormId,
    isPlayerControlled: false,
    aiLevel: 5,
    hpMultiplier: raidDef.hpMultiplier,
    entityScaleOverride: raidDef.entityScale
  };
}

export function buildRaidConfigFromDef(
  raidDef: RaidBossDefinition
): RaidBattleConfig {
  return {
    raidId: raidDef.raidId,
    bossName: raidDef.name,
    breakGaugeMax: raidDef.breakGaugeMax,
    groggyDurationSec: raidDef.groggyDurationSec,
    groggyDamageMult: raidDef.groggyDamageMult,
    dpsCheckTriggerHpRatios: [...raidDef.dpsCheckTriggerHpRatios],
    dpsCheckShieldHp: raidDef.dpsCheckShieldHp,
    dpsCheckDurationSec: raidDef.dpsCheckDurationSec,
    teamRevivesMax: raidDef.teamRevivesMax,
    weatherOnStart: raidDef.weatherOnStart,
    telegraphPatterns: raidDef.telegraphPatterns.map((p) => ({ ...p }))
  };
}

export function createInitialRaidRuntimeState(
  raidConfig: RaidBattleConfig | undefined,
  bossUnitId: string | null
): RaidRuntimeState {
  if (!raidConfig) {
    return {
      active: false,
      raidId: '',
      bossName: '',
      bossUnitId: null,
      breakGauge: 0,
      breakGaugeMax: 100,
      groggyTimer: 0,
      groggyDurationSec: 6.0,
      groggyDamageMult: 1.5,
      dpsCheck: {
        active: false,
        shieldHp: 0,
        maxShieldHp: 0,
        remainingSec: 0,
        totalSec: 10
      },
      dpsCheckTriggerHpRatios: [],
      triggeredDpsIndices: [],
      dpsCheckShieldHpConfig: 400,
      dpsCheckDurationConfig: 10,
      teamRevivesRemaining: 3,
      teamRevivesMax: 3,
      telegraphPatterns: [],
      patternCooldowns: {},
      patternGlobalCooldown: 3.0,
      telegraphs: []
    };
  }

  const patternCooldowns: Record<string, number> = {};
  for (const p of raidConfig.telegraphPatterns) {
    patternCooldowns[p.id] = 1.5;
  }

  return {
    active: true,
    raidId: raidConfig.raidId,
    bossName: raidConfig.bossName,
    bossUnitId,
    breakGauge: raidConfig.breakGaugeMax,
    breakGaugeMax: raidConfig.breakGaugeMax,
    groggyTimer: 0,
    groggyDurationSec: raidConfig.groggyDurationSec,
    groggyDamageMult: raidConfig.groggyDamageMult,
    dpsCheck: {
      active: false,
      shieldHp: 0,
      maxShieldHp: raidConfig.dpsCheckShieldHp,
      remainingSec: 0,
      totalSec: raidConfig.dpsCheckDurationSec
    },
    dpsCheckTriggerHpRatios: [...raidConfig.dpsCheckTriggerHpRatios],
    triggeredDpsIndices: [],
    dpsCheckShieldHpConfig: raidConfig.dpsCheckShieldHp,
    dpsCheckDurationConfig: raidConfig.dpsCheckDurationSec,
    teamRevivesRemaining: raidConfig.teamRevivesMax,
    teamRevivesMax: raidConfig.teamRevivesMax,
    telegraphPatterns: raidConfig.telegraphPatterns.map((p) => ({ ...p })),
    patternCooldowns,
    patternGlobalCooldown: 2.2,
    telegraphs: []
  };
}

export function getUnitRelicBonuses(
  unitId: string,
  campaign: RpgCampaignState,
  endgameReg: EndgameDataRegistry
): UnitEndgameBonuses | undefined {
  const relicId = campaign.endgame.raids.equippedRelicMap[unitId];
  if (!relicId) return undefined;
  const relic = endgameReg.raidRelics[relicId];
  if (!relic) return undefined;
  return {
    fireDamageBonusRatio: relic.modifiers.fireDamageBonusRatio ?? 0,
    breakGaugeDamageRatio: relic.modifiers.breakGaugeDamageRatio ?? 0,
    maxHpMult: 1 + (relic.modifiers.maxHpBonusRatio ?? 0),
    atkMult: 1 + (relic.modifiers.atkBonusRatio ?? 0),
    dodgeRechargeBonus: relic.modifiers.dodgeCooldownBonusRatio ?? 0
  };
}

export function buildOfflineRaidBattleConfig(
  raidId: string,
  squadUnitIds: string[],
  seed: number,
  campaign: RpgCampaignState,
  gameReg: GameDataRegistry,
  endgameReg: EndgameDataRegistry
): BattleWorldConfig | null {
  const raidDef = endgameReg.raids[raidId];
  if (!raidDef) return null;

  const validSquad = squadUnitIds.filter((uid) => Boolean(gameReg.units[uid])).slice(0, 3);
  const fallbackPool = ['luffy', 'zoro', 'sanji', 'jinbe', 'law'];
  while (validSquad.length < 3) {
    const next = fallbackPool.find((id) => !validSquad.includes(id) && gameReg.units[id]);
    if (!next) break;
    validSquad.push(next);
  }

  const teamAlpha: UnitBuildConfig[] = validSquad.map((uid, idx) => {
    const def = gameReg.units[uid];
    const moveIds = campaign.unitEquippedMovesOverrides?.[uid] ?? def.defaultMoves;
    const formId =
      (campaign.unitUnlockedForms[uid]?.includes(def.awakenedFormId ?? '')
        ? def.awakenedFormId
        : def.defaultFormId) ?? def.defaultFormId;

    return {
      instanceId: `raid_sq_${idx}_${uid}`,
      speciesId: uid,
      level: Math.max(60, campaign.unitLevelOverrides[uid] ?? 65),
      ivs: { hp: 28, atk: 28, def: 26, spAtk: 28, spDef: 26, spd: 26 },
      evs: { hp: 100, atk: 100, def: 80, spAtk: 100, spDef: 80, spd: 80 },
      moveIds: [...moveIds.slice(0, 4)],
      equipmentId: def.defaultEquipmentId,
      traitId: def.traitId,
      formId,
      isPlayerControlled: idx === 0,
      aiLevel: 4,
      endgameBonuses: getUnitRelicBonuses(uid, campaign, endgameReg)
    };
  });

  const bossBuild = buildRaidBossUnitBuild(raidDef, gameReg);

  return {
    seed: seed >>> 0,
    arenaSizeKey: 'large',
    mode: 'COOP_RAID',
    teamAlpha,
    teamOmega: [bossBuild],
    raidConfig: buildRaidConfigFromDef(raidDef)
  };
}

export function triggerRaidBossGroggy(
  world: BattleWorldState,
  boss: UnitRuntimeState
): void {
  const rs = world.raidState;
  rs.breakGauge = 0;
  rs.groggyTimer = rs.groggyDurationSec;
  boss.superRegenLockoutTimer = Math.max(
    boss.superRegenLockoutTimer,
    rs.groggyDurationSec
  );
  boss.windupMoveId = null;
  boss.windupTimer = 0;
  boss.activeBeamId = null;
  boss.vel = { x: 0, y: 0 };

  // Cancel active boss telegraphs on break!
  rs.telegraphs = [];

  world.hitstopTimer = Math.max(world.hitstopTimer, 0.12);
  world.screenShakeTimer = 0.35;
  world.screenShakeMagnitude = 8.0;
  world.floatingTexts.push({
    id: `ft_raid_break_${world.tick}`,
    pos: { x: boss.pos.x, y: boss.pos.y - boss.radiusPx - 20 },
    text: `💥 BREAK! ${rs.groggyDurationSec}초 그로기 (피해 ×${rs.groggyDamageMult})`,
    color: '#facc15',
    elapsedSec: 0,
    durationSec: 1.8,
    scale: 1.4
  });
  world.combatLog.push(
    `[레이드 브레이크!] ${boss.name}의 브레이크 게이지 파괴! ${rs.groggyDurationSec}초간 행동불가 · 초재생 강제 정지 · 받는 피해 ${rs.groggyDamageMult}배!`
  );
}

export function applyRaidBreakDamage(
  world: BattleWorldState,
  boss: UnitRuntimeState,
  attacker: UnitRuntimeState | null,
  movePower: number,
  hasArmamentHaki: boolean,
  hasConquerorCoating: boolean,
  isInternalDestruction: boolean,
  directBreakAmount?: number
): void {
  const rs = world.raidState;
  if (!rs.active || rs.bossUnitId !== boss.instanceId || rs.groggyTimer > 0) return;

  let breakDmg = directBreakAmount ?? 0;
  if (directBreakAmount === undefined) {
    let base = 4;
    if (movePower >= 110) base += 8;
    else if (movePower >= 85) base += 5;
    if (hasArmamentHaki) base += 7;
    if (hasConquerorCoating) base += 14;
    if (isInternalDestruction) base += 8;
    const relicBonus = 1 + (attacker?.endgameBreakGaugeBonusRatio ?? 0);
    breakDmg = Math.round(base * relicBonus);
  }

  if (breakDmg <= 0) return;
  rs.breakGauge = Math.max(0, rs.breakGauge - breakDmg);
  if (rs.breakGauge <= 0) {
    triggerRaidBossGroggy(world, boss);
  }
}

/**
 * Intercepts damage heading to the raid boss:
 * - While Team DPS Check Shield is active, damage depletes the shield first.
 * - Breaking the shield deals a massive break gauge chunk (35% max) & stuns the boss.
 * - Otherwise applies break gauge damage and lets HP damage pass through.
 */
export function interceptRaidBossIncomingDamage(
  world: BattleWorldState,
  boss: UnitRuntimeState,
  attacker: UnitRuntimeState | null,
  damage: number,
  movePower: number,
  hasArmamentHaki: boolean,
  hasConquerorCoating: boolean,
  isInternalDestruction: boolean
): number {
  const rs = world.raidState;
  if (!rs.active || rs.bossUnitId !== boss.instanceId || damage <= 0) {
    return damage;
  }

  if (rs.dpsCheck.active && rs.dpsCheck.shieldHp > 0) {
    rs.dpsCheck.shieldHp = Math.max(0, rs.dpsCheck.shieldHp - damage);
    if (rs.dpsCheck.shieldHp <= 0) {
      rs.dpsCheck.active = false;
      world.floatingTexts.push({
        id: `ft_dps_break_${world.tick}`,
        pos: { x: boss.pos.x, y: boss.pos.y - boss.radiusPx - 14 },
        text: '🛡 보호막 파훼 성공! (DPS CHECK CLEAR)',
        color: '#4ade80',
        elapsedSec: 0,
        durationSec: 1.5,
        scale: 1.3
      });
      world.combatLog.push(
        `[DPS 체크 돌파] 팀 협동 화력으로 ${boss.name}의 보호막을 파괴했습니다!`
      );
      applyRaidBreakDamage(
        world,
        boss,
        attacker,
        movePower,
        hasArmamentHaki,
        hasConquerorCoating,
        isInternalDestruction,
        Math.round(rs.breakGaugeMax * 0.4)
      );
    }
    return 0; // Shield absorbed the HP hit
  }

  applyRaidBreakDamage(
    world,
    boss,
    attacker,
    movePower,
    hasArmamentHaki,
    hasConquerorCoating,
    isInternalDestruction
  );
  return damage;
}

function detonateTelegraphZone(
  zone: ActiveTelegraphZone,
  boss: UnitRuntimeState,
  world: BattleWorldState,
  registry: GameDataRegistry
): void {
  world.screenShakeTimer = Math.max(world.screenShakeTimer, 0.22);
  world.screenShakeMagnitude = Math.max(world.screenShakeMagnitude, 6.5);
  world.vfxEvents.push({
    id: `vfx_tele_${world.tick}_${zone.id}`,
    kind: 'CLASH_SHOCKWAVE',
    pos: { ...zone.origin },
    color: zone.shape === 'SAFE_ZONE' ? '#facc15' : '#ef4444',
    radiusPx: Math.min(260, zone.radiusPx),
    elapsedSec: 0,
    durationSec: 0.4
  });

  for (const u of world.units) {
    if (!u.isAlive || !u.isOnField || u.isDowned || u.team !== 'ALPHA' || u.iframeTimer > 0) {
      continue;
    }

    let hit = false;
    if (zone.shape === 'CIRCLE') {
      hit = distVec(u.pos, zone.origin) <= zone.radiusPx + u.radiusPx;
    } else if (zone.shape === 'SAFE_ZONE') {
      // Anyone OUTSIDE the safe zone radius gets hit by arena-wide blast
      hit = distVec(u.pos, zone.origin) > zone.radiusPx;
    } else if (zone.shape === 'CONE') {
      hit = isCircleIntersectingSector(
        u.pos,
        u.radiusPx,
        zone.origin,
        zone.dir,
        zone.radiusPx,
        zone.arcDeg
      );
    } else if (zone.shape === 'CROSS_BEAM') {
      const halfW = zone.widthPx * 0.5 + u.radiusPx;
      hit =
        Math.abs(u.pos.x - zone.origin.x) <= halfW ||
        Math.abs(u.pos.y - zone.origin.y) <= halfW;
    }

    if (hit) {
      const dmg = Math.max(
        22,
        Math.round(u.maxHp * 0.19 * zone.damageMultiplier)
      );
      u.hp = Math.max(0, u.hp - dmg);
      if (zone.applyStatus) {
        applyStatus(u, zone.applyStatus, 1.3, boss.instanceId, world, registry);
      }
      world.floatingTexts.push({
        id: `ft_telehit_${world.tick}_${u.instanceId}`,
        pos: { x: u.pos.x, y: u.pos.y - 28 },
        text: `💥 ${zone.name} -${dmg}`,
        color: '#ef4444',
        elapsedSec: 0,
        durationSec: 0.95,
        scale: 1.1
      });
    }
  }
}

export function stepRaidBattleRules(
  world: BattleWorldState,
  dt: number,
  registry: GameDataRegistry,
  prng: SeededPRNG
): void {
  const rs = world.raidState;
  if (!rs.active) return;

  const boss = world.units.find((u) => u.instanceId === rs.bossUnitId);

  // 1. Boss Groggy countdown & SuperRegen Lockout enforcement
  if (boss && boss.isAlive) {
    if (rs.groggyTimer > 0) {
      rs.groggyTimer = Math.max(0, rs.groggyTimer - dt);
      boss.superRegenLockoutTimer = Math.max(boss.superRegenLockoutTimer, 0.25);
      boss.vel = { x: 0, y: 0 };
      boss.windupMoveId = null;
      if (rs.groggyTimer <= 0) {
        rs.breakGauge = rs.breakGaugeMax;
        world.combatLog.push(`[레이드 회복] ${boss.name}이(가) 그로기 상태에서 복귀했습니다!`);
      }
    }

    // 2. Team DPS Check Shield trigger & countdown
    const bossHpRatio = boss.hp / Math.max(1, boss.maxHp);
    if (!rs.dpsCheck.active) {
      for (let i = 0; i < rs.dpsCheckTriggerHpRatios.length; i++) {
        if (
          !rs.triggeredDpsIndices.includes(i) &&
          bossHpRatio <= rs.dpsCheckTriggerHpRatios[i]
        ) {
          rs.triggeredDpsIndices.push(i);
          rs.dpsCheck = {
            active: true,
            shieldHp: rs.dpsCheckShieldHpConfig,
            maxShieldHp: rs.dpsCheckShieldHpConfig,
            remainingSec: rs.dpsCheckDurationConfig,
            totalSec: rs.dpsCheckDurationConfig
          };
          world.floatingTexts.push({
            id: `ft_dps_start_${world.tick}`,
            pos: { x: boss.pos.x, y: boss.pos.y - boss.radiusPx - 24 },
            text: '⚠ 팀 DPS 체크 보호막 전개! 제한 시간 내 파괴하라!',
            color: '#f97316',
            elapsedSec: 0,
            durationSec: 2.0,
            scale: 1.3
          });
          world.combatLog.push(
            `[DPS 체크 개시] ${boss.name}이(가) 보호막(${rs.dpsCheck.maxShieldHp})을 전개! ${rs.dpsCheck.totalSec}초 내 파괴하지 못하면 전장 충격파가 발동합니다!`
          );
          break;
        }
      }
    } else {
      rs.dpsCheck.remainingSec = Math.max(0, rs.dpsCheck.remainingSec - dt);
      if (rs.dpsCheck.remainingSec <= 0 && rs.dpsCheck.shieldHp > 0) {
        rs.dpsCheck.active = false;
        rs.dpsCheck.shieldHp = 0;
        world.screenShakeTimer = 0.45;
        world.screenShakeMagnitude = 10;
        world.floatingTexts.push({
          id: `ft_dps_fail_${world.tick}`,
          pos: { x: world.arenaWidth * 0.5, y: 120 },
          text: '💥 DPS 체크 실패! 전장 광역 충격파 발동!!',
          color: '#dc2626',
          elapsedSec: 0,
          durationSec: 1.8,
          scale: 1.4
        });
        world.combatLog.push(
          `[DPS 체크 실패] ${boss.name}의 보호막을 파괴하지 못해 전장 광역 충격파가 작렬했습니다!`
        );
        for (const u of world.units) {
          if (!u.isAlive || !u.isOnField || u.isDowned || u.team !== 'ALPHA') continue;
          const shockDmg = Math.max(40, Math.round(u.maxHp * 0.38));
          u.hp = Math.max(0, u.hp - shockDmg);
        }
      }
    }

    // 3. Boss Large Telegraph Pattern Scheduler & Detonation
    for (const pId of Object.keys(rs.patternCooldowns)) {
      if (rs.patternCooldowns[pId] > 0) {
        rs.patternCooldowns[pId] = Math.max(0, rs.patternCooldowns[pId] - dt);
      }
    }
    if (rs.patternGlobalCooldown > 0) {
      rs.patternGlobalCooldown = Math.max(0, rs.patternGlobalCooldown - dt);
    }

    if (
      rs.groggyTimer <= 0 &&
      rs.patternGlobalCooldown <= 0 &&
      rs.telegraphs.length < 2 &&
      rs.telegraphPatterns.length > 0
    ) {
      const ready = rs.telegraphPatterns.filter(
        (p) => (rs.patternCooldowns[p.id] ?? 0) <= 0
      );
      if (ready.length > 0) {
        const chosen = ready[prng.nextInt(0, ready.length - 1)];
        const activeAlpha = world.units.filter(
          (u) => u.isAlive && u.isOnField && !u.isDowned && u.team === 'ALPHA'
        );
        const focus =
          activeAlpha.length > 0
            ? activeAlpha[prng.nextInt(0, activeAlpha.length - 1)]
            : null;
        const origin =
          chosen.shape === 'SAFE_ZONE'
            ? {
                x: clamp(world.arenaWidth * 0.35 + prng.nextRange(-90, 90), 110, world.arenaWidth - 110),
                y: clamp(world.arenaHeight * 0.5 + prng.nextRange(-110, 110), 90, world.arenaHeight - 90)
              }
            : chosen.shape === 'CIRCLE' && focus
              ? { x: focus.pos.x, y: focus.pos.y }
              : { x: boss.pos.x, y: boss.pos.y };
        const dir = focus
          ? normalizeVec(subVec(focus.pos, boss.pos), { x: -1, y: 0 })
          : { x: -1, y: 0 };

        rs.telegraphs.push({
          id: `tele_${world.tick}_${chosen.id}`,
          patternId: chosen.id,
          name: chosen.name,
          shape: chosen.shape,
          origin,
          dir,
          radiusPx: chosen.radiusPx,
          arcDeg: chosen.arcDeg ?? 65,
          widthPx: chosen.widthPx ?? 76,
          elapsedSec: 0,
          durationSec: chosen.telegraphSec,
          damageMultiplier: chosen.damageMultiplier,
          applyStatus: chosen.applyStatus,
          ownerUnitId: boss.instanceId
        });
        rs.patternCooldowns[chosen.id] = chosen.cooldownSec;
        rs.patternGlobalCooldown = 3.2;
      }
    }

    for (let i = rs.telegraphs.length - 1; i >= 0; i--) {
      const zone = rs.telegraphs[i];
      zone.elapsedSec += dt;
      if (zone.elapsedSec >= zone.durationSec) {
        detonateTelegraphZone(zone, boss, world, registry);
        rs.telegraphs.splice(i, 1);
      }
    }
  }

  // 4. Team Down (15s) & Ally Rescue Revive (within 78px for 2.0s -> 40% HP, shared 3-revive cap)
  const alphaSquad = world.units.filter((u) => u.team === 'ALPHA' && u.isOnField);
  const standingAllies = alphaSquad.filter((u) => u.isAlive && !u.isDowned);

  for (const downed of alphaSquad) {
    if (!downed.isAlive || !downed.isDowned) continue;

    downed.downedTimer = Math.max(0, downed.downedTimer - dt);
    const rescuerNear =
      rs.teamRevivesRemaining > 0 &&
      standingAllies.some(
        (ally) => distVec(ally.pos, downed.pos) <= RAID_RESCUE_RADIUS_PX
      );

    if (rescuerNear) {
      downed.reviveProgressSec += dt;
      if (downed.reviveProgressSec >= RAID_RESCUE_CHANNEL_SEC) {
        downed.isDowned = false;
        downed.downedTimer = 0;
        downed.reviveProgressSec = 0;
        downed.hp = Math.max(1, Math.round(downed.maxHp * RAID_RESCUE_HP_RATIO));
        downed.iframeTimer = 1.5;
        rs.teamRevivesRemaining = Math.max(0, rs.teamRevivesRemaining - 1);

        world.floatingTexts.push({
          id: `ft_revive_${world.tick}_${downed.instanceId}`,
          pos: { x: downed.pos.x, y: downed.pos.y - 32 },
          text: `❤️ 구조 부활! (HP 40% / 잔여 부활 ${rs.teamRevivesRemaining})`,
          color: '#4ade80',
          elapsedSec: 0,
          durationSec: 1.5,
          scale: 1.2
        });
        world.combatLog.push(
          `[레이드 구조 성공] ${downed.name}이(가) HP 40%로 부활했습니다! (팀 잔여 부활: ${rs.teamRevivesRemaining}/${rs.teamRevivesMax})`
        );
        continue;
      }
    } else {
      downed.reviveProgressSec = Math.max(0, downed.reviveProgressSec - dt * 0.5);
    }

    if (downed.downedTimer <= 0) {
      downed.isDowned = false;
      downed.isAlive = false;
      downed.hp = 0;
      world.combatLog.push(
        `[레이드 탈락] ${downed.name}의 구조 제한 시간(15초)이 만료되어 전투 불능이 되었습니다!`
      );
    }
  }

  // Squad wipe check: if no standing ALPHA allies remain -> Raid Failed!
  const remainingStanding = world.units.some(
    (u) => u.team === 'ALPHA' && u.isOnField && u.isAlive && !u.isDowned
  );
  if (!remainingStanding && world.winnerTeam === null) {
    world.winnerTeam = 'OMEGA';
    world.winReasonText = '💀 스쿼드 전원 다운 — 거대 보스 레이드 실패!';
    world.combatLog.push(world.winReasonText);
  }
}

export function recordRaidOutcome(
  raidId: string,
  victory: boolean,
  clearTimeSec: number,
  campaign: RpgCampaignState,
  endgameReg: EndgameDataRegistry
): {
  unlockedRelic: RaidRelicDefinition | null;
  berriesAwarded: number;
  tpAwarded: number;
} {
  const raidDef = endgameReg.raids[raidId];
  if (!raidDef || !victory) {
    return { unlockedRelic: null, berriesAwarded: 0, tpAwarded: 0 };
  }

  const raids = campaign.endgame.raids;
  if (!raids.clearedRaidIds.includes(raidId)) {
    raids.clearedRaidIds.push(raidId);
  }
  const roundedSec = Math.max(1, Math.round(clearTimeSec * 10) / 10);
  const prevBest = raids.bestClearTimeSecMap[raidId];
  if (prevBest === undefined || roundedSec < prevBest) {
    raids.bestClearTimeSecMap[raidId] = roundedSec;
  }

  const relicDef = endgameReg.raidRelics[raidDef.rewardRelicId] ?? null;
  if (relicDef && !raids.unlockedRelicIds.includes(relicDef.relicId)) {
    raids.unlockedRelicIds.push(relicDef.relicId);
  }

  campaign.berries += raidDef.berryReward;
  campaign.trainingPoints += raidDef.trainingPointReward;
  campaign.voyageLog.push(
    `[거대 보스 레이드 토벌!] ${raidDef.name} 격파 (${roundedSec}s)! (+${raidDef.berryReward.toLocaleString()} 베리, +${raidDef.trainingPointReward} TP${relicDef ? ` / 유물 해금: ${relicDef.icon} ${relicDef.name}` : ''})`
  );

  return {
    unlockedRelic: relicDef,
    berriesAwarded: raidDef.berryReward,
    tpAwarded: raidDef.trainingPointReward
  };
}

export function equipRaidRelic(
  unitId: string,
  relicId: string | null,
  campaign: RpgCampaignState,
  gameReg: GameDataRegistry,
  endgameReg: EndgameDataRegistry
): { success: boolean; message: string } {
  const unitDef = gameReg.units[unitId];
  if (!unitDef) {
    return { success: false, message: '존재하지 않는 캐릭터입니다.' };
  }
  const raids = campaign.endgame.raids;
  if (!relicId) {
    delete raids.equippedRelicMap[unitId];
    return { success: true, message: `${unitDef.name}의 레이드 유물을 해제했습니다.` };
  }

  const relicDef = endgameReg.raidRelics[relicId];
  if (!relicDef) {
    return { success: false, message: '존재하지 않는 레이드 유물입니다.' };
  }
  if (!raids.unlockedRelicIds.includes(relicId)) {
    return {
      success: false,
      message: `[${relicDef.name}]은(는) 해당 거대 보스 레이드 토벌 후 장착 가능합니다.`
    };
  }

  raids.equippedRelicMap[unitId] = relicId;
  return {
    success: true,
    message: `${unitDef.name}에게 ${relicDef.icon} [${relicDef.name}] 유물을 장착했습니다!`
  };
}
