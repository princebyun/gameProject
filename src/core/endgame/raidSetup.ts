import type {
  BattleWorldConfig,
  RaidBattleConfig,
  RaidRuntimeState,
  UnitBuildConfig,
  UnitEndgameBonuses
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
  const unitDef =
    gameReg.units[raidDef.speciesId] ??
    gameReg.units['kaido'] ??
    Object.values(gameReg.units)[0];
  if (!unitDef) {
    throw new Error(`Missing raid boss unit definition: ${raidDef.speciesId}`);
  }
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
    const def = gameReg.units[uid] ?? Object.values(gameReg.units)[0];
    if (!def) {
      throw new Error(`Missing raid squad unit definition: ${uid}`);
    }
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
