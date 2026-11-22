import { createBattleWorld } from '../combat/battleWorld';
import type { GameDataRegistry, StatBlock } from '../types/dataSchemas';
import type {
  BattleWorldConfig,
  BattleWorldState,
  UnitBuildConfig
} from '../types/battleState';
import type {
  BattleContext,
  BattleResult,
  RpgCampaignState,
  RpgDataRegistry
} from '../types/rpgSchemas';
import {
  computeCrewRoleBonuses,
  increaseCaptainBounty
} from './crewAndBountyEngine';
import { completeEpisode, exitIslandToSea } from './episodeEngine';

const DEFAULT_EVS: StatBlock = {
  hp: 100,
  atk: 100,
  def: 80,
  spAtk: 100,
  spDef: 80,
  spd: 100
};

export function createBattleWorldFromContext(
  state: RpgCampaignState,
  context: BattleContext,
  rpgRegistry: RpgDataRegistry,
  gameRegistry: GameDataRegistry,
  seed: number = 20261119
): BattleWorldState {
  const roleBonuses = computeCrewRoleBonuses(state, rpgRegistry);

  const partyIds =
    state.activePartyUnitIds.length > 0 ? state.activePartyUnitIds : ['luffy'];

  const fallbackUnit = Object.values(gameRegistry.units)[0];
  if (!fallbackUnit) {
    throw new Error('GameDataRegistry has no units defined');
  }

  const teamAlpha: UnitBuildConfig[] = partyIds.map((uid, idx) => {
    const unitDef = gameRegistry.units[uid] ?? fallbackUnit;
    const unlockedForms = state.unitUnlockedForms[uid] ?? [];
    const activeFormId =
      unlockedForms[unlockedForms.length - 1] ?? unitDef.defaultFormId;

    return {
      instanceId: `party_${idx}_${uid}`,
      speciesId: unitDef.id,
      level: state.unitLevelOverrides[uid] ?? 50,
      ivs: { hp: 31, atk: 31, def: 31, spAtk: 31, spDef: 31, spd: 31 },
      evs: { ...DEFAULT_EVS },
      moveIds: [
        ...(state.unitEquippedMovesOverrides?.[uid] ?? unitDef.defaultMoves).slice(0, 4)
      ],
      equipmentId: unitDef.defaultEquipmentId,
      traitId: unitDef.traitId,
      formId: activeFormId,
      isPlayerControlled: idx === 0,
      aiLevel: 4
    };
  });

  // Stage 2-B: Scenario guest AI ally (e.g. Marco joins Marineford 2V2 as AI partner)
  if (context.guestAllyUnitIds && context.guestAllyUnitIds.length > 0) {
    const guestId = context.guestAllyUnitIds[0];
    const guestDef = guestId ? gameRegistry.units[guestId] : undefined;
    const leadId = partyIds[0];
    if (guestDef && !teamAlpha.some((b) => b.speciesId === guestId)) {
      const guestBuild: UnitBuildConfig = {
        instanceId: `guest_ally_${guestId}`,
        speciesId: guestDef.id,
        level: Math.max(52, (leadId ? state.unitLevelOverrides[leadId] : undefined) ?? 52),
        ivs: { hp: 31, atk: 31, def: 31, spAtk: 31, spDef: 31, spd: 31 },
        evs: { ...DEFAULT_EVS },
        moveIds: [...guestDef.defaultMoves],
        equipmentId: guestDef.defaultEquipmentId,
        traitId: guestDef.traitId,
        formId: guestDef.defaultFormId,
        isPlayerControlled: false,
        aiLevel: 4
      };
      // Put guest ally in slot 1 so they fight immediately on field in 2V2!
      if (teamAlpha.length >= 1) {
        teamAlpha.splice(1, 0, guestBuild);
      } else {
        teamAlpha.push(guestBuild);
      }
    }
  }

  const makeEnemyBuilds = (
    unitIds: string[],
    aiLvl: number,
    prefix: string
  ): UnitBuildConfig[] =>
    unitIds.map((uid, idx) => {
      const unitDef = gameRegistry.units[uid] ?? fallbackUnit;
      return {
        instanceId: `${prefix}_${idx}_${uid}`,
        speciesId: unitDef.id,
        level: 45 + aiLvl * 4,
        ivs: { hp: 31, atk: 31, def: 31, spAtk: 31, spDef: 31, spd: 31 },
        evs: { ...DEFAULT_EVS },
        moveIds: [...unitDef.defaultMoves],
        equipmentId: unitDef.defaultEquipmentId,
        traitId: unitDef.traitId,
        formId: unitDef.defaultFormId,
        isPlayerControlled: false,
        aiLevel: aiLvl
      };
    });

  const teamOmega = makeEnemyBuilds(context.enemyUnitIds, context.aiLevel, 'enemy');
  const gauntletWaves = context.gauntletWaves
    ? context.gauntletWaves.map((w, wIdx) => ({
        waveName: w.waveName,
        enemyBuilds: makeEnemyBuilds(w.enemyUnitIds, w.aiLevel, `wave${wIdx + 1}`),
        introText: w.introText
      }))
    : undefined;

  const cfg: BattleWorldConfig = {
    seed,
    arenaSizeKey: context.arenaSizeKey,
    mode:
      context.guestAllyUnitIds && context.guestAllyUnitIds.length > 0
        ? '2V2'
        : context.mode,
    teamAlpha,
    teamOmega,
    winCondition: context.winCondition,
    arenaTerrain: context.arenaTerrain,
    gauntletWaves
  };

  const world = createBattleWorld(cfg, gameRegistry);

  // Apply trained Haki overrides & Crew Role opening buffs (Cook Meal HP + Shipboard Meal ATK + Swordsman Opening ATK)
  const mealAtkBonus = state.nextBattleMealAtkBuffRatio ?? 0;
  for (const unit of world.units) {
    if (unit.team !== 'ALPHA') continue;
    const hakiOverride = state.unitHakiOverrides[unit.speciesId];
    if (hakiOverride) {
      unit.haki = { ...hakiOverride };
    }

    if (roleBonuses.maxHpMealMult > 1.0) {
      unit.maxHp = Math.round(unit.maxHp * roleBonuses.maxHpMealMult);
      unit.hp = unit.maxHp;
    }

    // Apply stored party HP ratio if injured
    const hpRatio = state.partyHpRatios[unit.speciesId];
    if (hpRatio !== undefined && hpRatio > 0 && hpRatio < 1.0) {
      unit.hp = Math.max(1, Math.round(unit.maxHp * hpRatio));
    }

    if (roleBonuses.openingAtkMult > 1.0) {
      unit.statBuffs.push({
        id: 'crew_role_swordsman_atk',
        stat: 'atk',
        multiplier: roleBonuses.openingAtkMult,
        remainingSec: 25
      });
    }

    if (mealAtkBonus > 0) {
      unit.statBuffs.push({
        id: 'cook_shipboard_meal_atk',
        stat: 'atk',
        multiplier: 1 + mealAtkBonus,
        remainingSec: 30
      });
      unit.statBuffs.push({
        id: 'cook_shipboard_meal_spatk',
        stat: 'spAtk',
        multiplier: 1 + mealAtkBonus,
        remainingSec: 30
      });
    }

    if (roleBonuses.skillCooldownReductionRatio > 0) {
      unit.cooldownAccelRatio = Math.max(
        unit.cooldownAccelRatio,
        roleBonuses.skillCooldownReductionRatio
      );
      unit.cooldownAccelTimer = Math.max(unit.cooldownAccelTimer, 999);
    }
  }
  state.nextBattleMealAtkBuffRatio = 0;

  return world;
}

export function applyBattleResultToCampaign(
  state: RpgCampaignState,
  result: BattleResult,
  rpgRegistry: RpgDataRegistry,
  gameRegistry: GameDataRegistry
): void {
  const { context, victory } = result;
  const roleBonuses = computeCrewRoleBonuses(state, rpgRegistry);

  if (victory) {
    // Store surviving party HP ratios & apply Doctor post-battle +35% HP auto-heal
    for (const [uid, ratio] of Object.entries(result.survivingPartyHpRatios)) {
      const healed =
        roleBonuses.postBattleHealRatio > 0
          ? Math.min(1.0, Math.max(0.1, ratio) + roleBonuses.postBattleHealRatio)
          : Math.min(1.0, Math.max(0.1, ratio));
      state.partyHpRatios[uid] = Number(healed.toFixed(3));
    }

    state.berries += context.berryReward;
    state.trainingPoints += context.trainingPointReward;

    if (context.setsFlagOnVictory) {
      state.episodeFlags[context.setsFlagOnVictory] = true;
    }

    // Level up active party slightly (extra +1 bonus when Archaeologist EXP/knowledge boost is active on boss clear)
    for (const uid of state.activePartyUnitIds) {
      state.unitLevelOverrides[uid] = Math.min(
        100,
        (state.unitLevelOverrides[uid] ?? 50) + 1
      );
    }

    if (context.completesEpisodeIdOnVictory) {
      completeEpisode(
        state,
        context.completesEpisodeIdOnVictory,
        rpgRegistry,
        gameRegistry
      );
    } else if (context.bountyReward > 0) {
      increaseCaptainBounty(
        state,
        context.bountyReward,
        `${context.encounterName} 격파`,
        gameRegistry
      );
    }

    if (roleBonuses.postBattleHealRatio > 0) {
      state.voyageLog.push(
        `[선의 자동 치료] 전투 승리 후 파티 체력이 ${Math.round(roleBonuses.postBattleHealRatio * 100)}% 회복되었습니다.`
      );
    }
  } else {
    // On defeat, return to last docked port with repaired hull
    exitIslandToSea(state);
    state.ship.hullHp = state.ship.maxHullHp;
    state.voyageLog.push(
      `[전투 패배] 마지막 정박 항구(${state.lastDockedPort.islandId}) 앞바다로 후퇴해 재정비했습니다.`
    );
  }
}
