import { SeededPRNG } from '../math/prng';
import type {
  BattleWorldConfig,
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

  const hazards: ImpelDownHazardKind[] = [
    'CRIMSON_SLASH_TRAP',
    'STARVATION_DRAIN',
    'BLAZING_MAGMA',
    'FREEZING_ICE',
    'ETERNAL_ELITE_GAUNTLET'
  ];
  const prng = new SeededPRNG((seed ^ (floor * 2654435761)) >>> 0);
  const hazardKind =
    hazards[prng.nextInt(0, hazards.length - 1)] ?? 'ETERNAL_ELITE_GAUNTLET';
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
    if (ef.hazardAndPoisonResistRatio) hazardAndPoisonResistRatio += ef.hazardAndPoisonResistRatio;
    if (ef.cooldownReductionRatio) cooldownReductionRatio += ef.cooldownReductionRatio;
    if (ef.dodgeRechargeBonus) dodgeRechargeBonus += ef.dodgeRechargeBonus;
    if (ef.atkMult) atkMult *= ef.atkMult;
    if (ef.spdMult) spdMult *= ef.spdMult;
    if (ef.maxHpMult) maxHpMult *= ef.maxHpMult;
    if (ef.startAwakeningGaugeRatio) startAwakeningGaugeRatio += ef.startAwakeningGaugeRatio;
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

export function drawSeededBuffChoices(
  run: ImpelDownRunState,
  endgameReg: EndgameDataRegistry,
  count: number = 3
): ImpelDownBuffDefinition[] {
  const pool = [...endgameReg.impelDown.buffs];
  const prng = new SeededPRNG((run.seed ^ (run.currentFloor * 7919) ^ 0x9e3779b9) >>> 0);
  const picked: ImpelDownBuffDefinition[] = [];

  for (let i = 0; i < count && pool.length > 0; i++) {
    const idx = prng.nextInt(0, pool.length - 1);
    const chosen = pool[idx];
    if (chosen) picked.push(chosen);
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
    const pickedId = candidates[idx];
    if (pickedId !== undefined) chosen.push(pickedId);
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
    if (!unitDef) {
      throw new Error(`Missing unit definition for ${uid}`);
    }
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
      if (!def) {
        throw new Error(`Missing enemy unit definition for ${eid}`);
      }
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
  const teamOmega = makeWaveBuilds(firstWave?.enemyUnitIds ?? [], `f${floorDef.floor}_w1`);
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
