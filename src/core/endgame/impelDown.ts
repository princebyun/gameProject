import { SeededPRNG } from '../math/prng';
import type {
  BattleWorldConfig,
  BattleWorldState,
  GauntletWaveConfig,
  UnitBuildConfig,
  UnitEndgameBonuses
} from '../types/battleState';
import type { GameDataRegistry } from '../types/dataSchemas';
import type { RpgCampaignState } from '../types/rpgSchemas';
import type {
  EndgameDataRegistry,
  ImpelDownBuffDefinition,
  ImpelDownFloorDefinition,
  ImpelDownHazardKind,
  ImpelDownRunState,
  ImpelDownUnitCarryover
} from './types';

export function isImpelDownUnlocked(
  campaign: RpgCampaignState,
  endgameReg: EndgameDataRegistry
): boolean {
  if (campaign.debugUnlockEndgame) return true;
  return campaign.completedEpisodes.includes(endgameReg.impelDown.unlockEpisodeId);
}

export function getFloorDefinitionForRun(
  floor: number,
  seed: number,
  endgameReg: EndgameDataRegistry
): ImpelDownFloorDefinition {
  const fixed = endgameReg.impelDown.floors.find((f) => f.floor === floor);
  if (fixed) return fixed;

  // Endless Level 7+ dynamic seeded floor generation
  const hazards: ImpelDownHazardKind[] = [
    'CRIMSON_SLASH_TRAP',
    'STARVATION_DRAIN',
    'BLAZING_MAGMA',
    'FREEZING_ICE',
    'ETERNAL_ELITE_GAUNTLET'
  ];
  const prng = new SeededPRNG((seed ^ (floor * 2654435761)) >>> 0);
  const hazardKind = hazards[prng.nextInt(0, hazards.length - 1)];
  const depthBonus = Math.max(0, floor - 6);

  return {
    floor,
    name: `Level ${floor} 무한 심층 (Endless Abyss)`,
    subtitle: `심층 제${floor}구역 — 극한의 죄수 엘리트 2연전`,
    hazardKind,
    hazardDescription: `무한 심층 강화 구역 (적 레벨 +${depthBonus * 4}, 환경 기믹: ${hazardKind})`,
    arenaSizeKey: 'large',
    aiLevel: 5,
    useSeededEliteGauntlet: true,
    waves: [],
    berryReward: 120000 + depthBonus * 35000,
    trainingPointReward: 110 + depthBonus * 25
  };
}

export function aggregateImpelDownBuffBonuses(
  selectedBuffIds: string[],
  endgameReg: EndgameDataRegistry
): UnitEndgameBonuses {
  const buffMap = new Map<string, ImpelDownBuffDefinition>();
  for (const b of endgameReg.impelDown.buffs) {
    buffMap.set(b.id, b);
  }

  let armorPenRatio = 0;
  let hazardAndPoisonResistRatio = 0;
  let cooldownReductionRatio = 0;
  let dodgeRechargeBonus = 0;
  let atkMult = 1.0;
  let spdMult = 1.0;
  let maxHpMult = 1.0;
  let startAwakeningGaugeRatio = 0;

  for (const id of selectedBuffIds) {
    const def = buffMap.get(id);
    if (!def) continue;
    const ef = def.effect;
    if (ef.armorPenRatio) armorPenRatio += ef.armorPenRatio;
    if (ef.hazardAndPoisonResistRatio) {
      hazardAndPoisonResistRatio += ef.hazardAndPoisonResistRatio;
    }
    if (ef.cooldownReductionRatio) {
      cooldownReductionRatio += ef.cooldownReductionRatio;
    }
    if (ef.dodgeRechargeBonus) dodgeRechargeBonus += ef.dodgeRechargeBonus;
    if (ef.atkMult) atkMult *= ef.atkMult;
    if (ef.spdMult) spdMult *= ef.spdMult;
    if (ef.maxHpMult) maxHpMult *= ef.maxHpMult;
    if (ef.startAwakeningGaugeRatio) {
      startAwakeningGaugeRatio += ef.startAwakeningGaugeRatio;
    }
  }

  return {
    armorPenRatio: Math.min(0.65, armorPenRatio),
    hazardAndPoisonResistRatio: Math.min(0.85, hazardAndPoisonResistRatio),
    cooldownReductionRatio: Math.min(0.5, cooldownReductionRatio),
    dodgeRechargeBonus: Math.min(1.0, dodgeRechargeBonus),
    atkMult: Math.min(2.5, atkMult),
    spdMult: Math.min(1.8, spdMult),
    maxHpMult: Math.min(2.2, maxHpMult),
    startAwakeningGaugeRatio: Math.min(1.0, startAwakeningGaugeRatio)
  };
}

export function startImpelDownRun(
  partyUnitIds: string[],
  seed: number,
  campaign: RpgCampaignState,
  gameReg: GameDataRegistry,
  endgameReg: EndgameDataRegistry
): ImpelDownRunState {
  const maxParty = endgameReg.impelDown.maxPartySize;
  const sanitizedParty = partyUnitIds
    .filter((uid) => Boolean(gameReg.units[uid]))
    .slice(0, maxParty);
  const finalParty =
    sanitizedParty.length > 0 ? sanitizedParty : [campaign.activePartyUnitIds[0] ?? 'luffy'];

  const carryoverMap: Record<string, ImpelDownUnitCarryover> = {};
  for (const uid of finalParty) {
    const unitDef = gameReg.units[uid];
    const moveIds = campaign.unitEquippedMovesOverrides?.[uid] ?? unitDef.defaultMoves;
    const moveChargesMap: Record<string, number> = {};
    for (const mId of moveIds.slice(0, 4)) {
      const mDef = gameReg.moves[mId];
      if (mDef) {
        moveChargesMap[mId] = mDef.maxCharges;
      }
    }
    carryoverMap[uid] = {
      unitId: uid,
      hpRatio: 1.0,
      moveChargesMap,
      awakeningReadyRatio: 0
    };
  }

  const run: ImpelDownRunState = {
    runId: `impel_${seed}_${finalParty.join('_')}`,
    seed: seed >>> 0,
    currentFloor: 1,
    isEndlessMode: false,
    partyUnitIds: finalParty,
    carryoverMap,
    selectedBuffIds: [],
    pendingDraftBuffIds: null,
    status: 'IN_FLOOR',
    totalBerriesEarned: 0,
    totalTpEarned: 0
  };

  campaign.endgame.impelDown.activeRun = suspendCloneRun(run);
  return run;
}

export function drawSeededBuffChoices(
  run: ImpelDownRunState,
  endgameReg: EndgameDataRegistry,
  count: number = 3
): ImpelDownBuffDefinition[] {
  const pool = [...endgameReg.impelDown.buffs];
  const prng = new SeededPRNG((run.seed ^ (run.currentFloor * 7919) ^ 0x9e3779b9) >>> 0);
  const picked: ImpelDownBuffDefinition[] = [];

  // Fisher-Yates partial pick without replacement
  for (let i = 0; i < count && pool.length > 0; i++) {
    const idx = prng.nextInt(0, pool.length - 1);
    picked.push(pool[idx]);
    pool.splice(idx, 1);
  }
  return picked;
}

function resolveFloorWaves(
  floorDef: ImpelDownFloorDefinition,
  run: ImpelDownRunState,
  gameReg: GameDataRegistry,
  endgameReg: EndgameDataRegistry
): { waveName: string; enemyUnitIds: string[]; introText?: string }[] {
  if (!floorDef.useSeededEliteGauntlet && floorDef.waves.length > 0) {
    return floorDef.waves;
  }

  const pool = endgameReg.impelDown.eliteBossPool.filter((id) => Boolean(gameReg.units[id]));
  const prng = new SeededPRNG((run.seed ^ (floorDef.floor * 104729)) >>> 0);
  const candidates = [...pool];
  const chosen: string[] = [];
  for (let i = 0; i < 2 && candidates.length > 0; i++) {
    const idx = prng.nextInt(0, candidates.length - 1);
    chosen.push(candidates[idx]);
    candidates.splice(idx, 1);
  }
  const boss1 = chosen[0] ?? 'crocodile';
  const boss2 = chosen[1] ?? 'doflamingo';
  const def1 = gameReg.units[boss1];
  const def2 = gameReg.units[boss2];

  return [
    {
      waveName: `무한지옥 엘리트 1차전 — ${def1?.name ?? boss1}`,
      enemyUnitIds: [boss1],
      introText: `LEVEL ${floorDef.floor} WAVE 1/2 — ${def1?.name ?? boss1} 출현!`
    },
    {
      waveName: `무한지옥 엘리트 2차전 — ${def2?.name ?? boss2}`,
      enemyUnitIds: [boss2],
      introText: `LEVEL ${floorDef.floor} FINAL WAVE 2/2 — ${def2?.name ?? boss2} 강림!`
    }
  ];
}

export function buildImpelDownFloorBattleConfig(
  run: ImpelDownRunState,
  campaign: RpgCampaignState,
  gameReg: GameDataRegistry,
  endgameReg: EndgameDataRegistry
): { config: BattleWorldConfig; floorDef: ImpelDownFloorDefinition } {
  const floorDef = getFloorDefinitionForRun(run.currentFloor, run.seed, endgameReg);
  const bonuses = aggregateImpelDownBuffBonuses(run.selectedBuffIds, endgameReg);
  const wavesRaw = resolveFloorWaves(floorDef, run, gameReg, endgameReg);

  const alivePartyIds = run.partyUnitIds.filter(
    (uid) => (run.carryoverMap[uid]?.hpRatio ?? 0) > 0
  );
  const effectivePartyIds =
    alivePartyIds.length > 0 ? alivePartyIds : [run.partyUnitIds[0] ?? 'luffy'];

  const teamAlpha: UnitBuildConfig[] = effectivePartyIds.map((uid, idx) => {
    const unitDef = gameReg.units[uid] ?? Object.values(gameReg.units)[0];
    const carryover = run.carryoverMap[uid];
    const moveIds = campaign.unitEquippedMovesOverrides?.[uid] ?? unitDef.defaultMoves;
    const relicId = campaign.endgame.raids.equippedRelicMap[uid];
    const relicDef = relicId ? endgameReg.raidRelics[relicId] : undefined;

    const mergedBonuses: UnitEndgameBonuses = {
      ...bonuses,
      atkMult: (bonuses.atkMult ?? 1) * (1 + (relicDef?.modifiers.atkBonusRatio ?? 0)),
      maxHpMult: (bonuses.maxHpMult ?? 1) * (1 + (relicDef?.modifiers.maxHpBonusRatio ?? 0)),
      fireDamageBonusRatio: relicDef?.modifiers.fireDamageBonusRatio ?? 0,
      breakGaugeDamageRatio: relicDef?.modifiers.breakGaugeDamageRatio ?? 0,
      dodgeRechargeBonus:
        (bonuses.dodgeRechargeBonus ?? 0) + (relicDef?.modifiers.dodgeCooldownBonusRatio ?? 0)
    };

    const formId =
      (campaign.unitUnlockedForms[uid]?.includes(unitDef.awakenedFormId ?? '')
        ? unitDef.awakenedFormId
        : unitDef.defaultFormId) ?? unitDef.defaultFormId;

    return {
      instanceId: `impel_a_${idx}_${uid}`,
      speciesId: uid,
      level: Math.max(50, campaign.unitLevelOverrides[uid] ?? 55),
      ivs: { hp: 24, atk: 24, def: 24, spAtk: 24, spDef: 24, spd: 24 },
      evs: { hp: 80, atk: 80, def: 80, spAtk: 80, spDef: 80, spd: 80 },
      moveIds: [...moveIds.slice(0, 4)],
      equipmentId: unitDef.defaultEquipmentId,
      traitId: unitDef.traitId,
      formId,
      isPlayerControlled: idx === 0,
      aiLevel: 4,
      initialHpRatio: carryover ? carryover.hpRatio : 1.0,
      initialMoveCharges: carryover ? { ...carryover.moveChargesMap } : undefined,
      endgameBonuses: mergedBonuses
    };
  });

  const enemyLevel = 50 + (floorDef.floor - 1) * 5;
  const makeWaveBuilds = (enemyIds: string[], prefix: string): UnitBuildConfig[] =>
    enemyIds.map((eid, idx) => {
      const def = gameReg.units[eid] ?? Object.values(gameReg.units)[0];
      return {
        instanceId: `impel_${prefix}_${idx}_${eid}`,
        speciesId: eid,
        level: enemyLevel,
        ivs: { hp: 20, atk: 20, def: 20, spAtk: 20, spDef: 20, spd: 20 },
        evs: { hp: 60, atk: 60, def: 60, spAtk: 60, spDef: 60, spd: 60 },
        moveIds: [...def.defaultMoves],
        equipmentId: def.defaultEquipmentId,
        traitId: def.traitId,
        formId: def.awakenedFormId ?? def.defaultFormId,
        isPlayerControlled: false,
        aiLevel: floorDef.aiLevel,
        hpMultiplier: floorDef.floor >= 7 ? 1 + (floorDef.floor - 6) * 0.18 : 1.0
      };
    });

  const firstWave = wavesRaw[0];
  const teamOmega = makeWaveBuilds(firstWave.enemyUnitIds, `f${floorDef.floor}_w1`);
  const gauntletWaves: GauntletWaveConfig[] | undefined =
    wavesRaw.length > 1
      ? wavesRaw.map((w, wIdx) => ({
          waveName: w.waveName,
          introText: w.introText,
          enemyBuilds: makeWaveBuilds(w.enemyUnitIds, `f${floorDef.floor}_w${wIdx + 1}`)
        }))
      : undefined;

  const isMultiField = teamAlpha.length >= 2 && teamOmega.length >= 2;

  const config: BattleWorldConfig = {
    seed: (run.seed ^ (floorDef.floor * 31337)) >>> 0,
    arenaSizeKey: floorDef.arenaSizeKey,
    mode: isMultiField ? '2V2' : '1V1',
    teamAlpha,
    teamOmega,
    gauntletWaves,
    impelDownHazard: {
      floor: floorDef.floor,
      kind: floorDef.hazardKind,
      dodgeRechargeMult: floorDef.hazardKind === 'STARVATION_DRAIN' ? 0.75 : 1.0
    }
  };

  return { config, floorDef };
}

export function recordImpelDownFloorOutcome(
  run: ImpelDownRunState,
  world: BattleWorldState,
  victory: boolean,
  campaign: RpgCampaignState,
  endgameReg: EndgameDataRegistry
): {
  clearedFloor: number;
  draftChoices: ImpelDownBuffDefinition[];
  berriesAwarded: number;
  tpAwarded: number;
} {
  // Carry over exact HP & PP (move charges) of every party unit into carryoverMap
  for (const unit of world.units) {
    if (unit.team !== 'ALPHA' || unit.isMinion) continue;
    const hpRatio = unit.isAlive
      ? Math.max(0.01, Math.min(1.0, unit.hp / Math.max(1, unit.maxHp)))
      : 0;
    const moveChargesMap: Record<string, number> = {};
    for (const slot of unit.moveSlots) {
      moveChargesMap[slot.moveId] = Math.max(0, Math.floor(slot.charges));
    }
    const prev = run.carryoverMap[unit.speciesId];
    run.carryoverMap[unit.speciesId] = {
      unitId: unit.speciesId,
      hpRatio,
      moveChargesMap,
      awakeningReadyRatio: prev?.awakeningReadyRatio ?? 0
    };
  }

  const floorDef = getFloorDefinitionForRun(run.currentFloor, run.seed, endgameReg);

  if (!victory) {
    run.status = 'FAILED';
    run.pendingDraftBuffIds = null;
    campaign.endgame.impelDown.activeRun = null;
    campaign.voyageLog.push(
      `[임펠 다운 패배] ${floorDef.name}에서 전멸했습니다. (최고 기록: Level ${campaign.endgame.impelDown.highestFloor})`
    );
    return {
      clearedFloor: 0,
      draftChoices: [],
      berriesAwarded: 0,
      tpAwarded: 0
    };
  }

  // Victory on this floor
  const clearedFloor = run.currentFloor;
  if (clearedFloor > campaign.endgame.impelDown.highestFloor) {
    campaign.endgame.impelDown.highestFloor = clearedFloor;
  }

  campaign.berries += floorDef.berryReward;
  campaign.trainingPoints += floorDef.trainingPointReward;
  run.totalBerriesEarned += floorDef.berryReward;
  run.totalTpEarned += floorDef.trainingPointReward;

  const draftChoices = drawSeededBuffChoices(run, endgameReg, 3);
  run.pendingDraftBuffIds = draftChoices.map((b) => b.id);
  run.status = 'DRAFTING';

  // Auto-suspend after floor clear so player can safely quit between floors
  campaign.endgame.impelDown.activeRun = suspendCloneRun(run);
  campaign.voyageLog.push(
    `[임펠 다운 돌파] ${floorDef.name} 클리어! (+${floorDef.berryReward.toLocaleString()} 베리, +${floorDef.trainingPointReward} TP) — 3택 유물 버프를 선택하세요.`
  );

  return {
    clearedFloor,
    draftChoices,
    berriesAwarded: floorDef.berryReward,
    tpAwarded: floorDef.trainingPointReward
  };
}

export function selectImpelDownDraftBuff(
  run: ImpelDownRunState,
  buffId: string,
  campaign: RpgCampaignState,
  gameReg: GameDataRegistry,
  endgameReg: EndgameDataRegistry
): { applied: boolean; buff: ImpelDownBuffDefinition | null; message: string } {
  if (run.status !== 'DRAFTING' || !run.pendingDraftBuffIds?.includes(buffId)) {
    return {
      applied: false,
      buff: null,
      message: '현재 드래프트 선택지에 없는 버프입니다.'
    };
  }

  const buff = endgameReg.impelDown.buffs.find((b) => b.id === buffId) ?? null;
  if (!buff) {
    return { applied: false, buff: null, message: '존재하지 않는 버프 ID입니다.' };
  }

  run.selectedBuffIds.push(buff.id);
  run.pendingDraftBuffIds = null;

  // Apply immediate between-floor effects (heal HP, restore PP, charge awakening)
  for (const uid of run.partyUnitIds) {
    const entry = run.carryoverMap[uid];
    if (!entry) continue;

    if (buff.effect.healPartyHpRatio && entry.hpRatio > 0) {
      entry.hpRatio = Math.min(1.0, entry.hpRatio + buff.effect.healPartyHpRatio);
    }

    if (buff.effect.restorePpRatio && entry.hpRatio > 0) {
      const unitDef = gameReg.units[uid];
      if (unitDef) {
        for (const [mId, curCharges] of Object.entries(entry.moveChargesMap)) {
          const mDef = gameReg.moves[mId];
          if (!mDef) continue;
          const add = Math.max(1, Math.ceil(mDef.maxCharges * buff.effect.restorePpRatio));
          entry.moveChargesMap[mId] = Math.min(mDef.maxCharges, curCharges + add);
        }
      }
    }

    if (buff.effect.startAwakeningGaugeRatio && entry.hpRatio > 0) {
      entry.awakeningReadyRatio = Math.min(
        1.0,
        entry.awakeningReadyRatio + buff.effect.startAwakeningGaugeRatio
      );
    }
  }

  if (run.currentFloor === 6 && !run.isEndlessMode) {
    run.status = 'FLOOR6_CLEAR_CHOICE';
  } else {
    run.currentFloor += 1;
    run.status = 'IN_FLOOR';
  }

  campaign.endgame.impelDown.activeRun = suspendCloneRun(run);
  campaign.voyageLog.push(`[임펠 다운 버프 획득] ${buff.icon} ${buff.name} 적용 완료!`);

  return {
    applied: true,
    buff,
    message: `${buff.icon} ${buff.name} 선택 완료!`
  };
}

export function continueImpelDownEndless(
  run: ImpelDownRunState,
  campaign: RpgCampaignState
): void {
  run.isEndlessMode = true;
  run.currentFloor = Math.max(7, run.currentFloor + 1);
  run.status = 'IN_FLOOR';
  campaign.endgame.impelDown.activeRun = suspendCloneRun(run);
  campaign.voyageLog.push(
    `[임펠 다운 무한 심층] Level ${run.currentFloor} 무한 지옥 도전을 시작합니다!`
  );
}

export function completeAndExitImpelDownRun(campaign: RpgCampaignState): void {
  campaign.endgame.impelDown.activeRun = null;
  campaign.voyageLog.push('[임펠 다운 완주] 6층 무한지옥 정복을 마치고 귀환했습니다!');
}

export function suspendCloneRun(run: ImpelDownRunState): ImpelDownRunState {
  const carryoverCopy: Record<string, ImpelDownUnitCarryover> = {};
  for (const [uid, c] of Object.entries(run.carryoverMap)) {
    carryoverCopy[uid] = {
      unitId: c.unitId,
      hpRatio: c.hpRatio,
      moveChargesMap: { ...c.moveChargesMap },
      awakeningReadyRatio: c.awakeningReadyRatio
    };
  }
  return {
    ...run,
    partyUnitIds: [...run.partyUnitIds],
    carryoverMap: carryoverCopy,
    selectedBuffIds: [...run.selectedBuffIds],
    pendingDraftBuffIds: run.pendingDraftBuffIds ? [...run.pendingDraftBuffIds] : null
  };
}

export function suspendImpelDownRun(
  campaign: RpgCampaignState,
  run: ImpelDownRunState
): ImpelDownRunState {
  const snapshot = suspendCloneRun(run);
  campaign.endgame.impelDown.activeRun = snapshot;
  return snapshot;
}

export function resumeImpelDownRun(
  campaign: RpgCampaignState
): ImpelDownRunState | null {
  if (!campaign.endgame.impelDown.activeRun) return null;
  return suspendCloneRun(campaign.endgame.impelDown.activeRun);
}
