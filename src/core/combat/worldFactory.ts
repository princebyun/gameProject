import { BATTLE_CALC_VERSION } from '../constants';
import { createInitialRaidRuntimeState } from '../endgame/raid';
import type {
  BattleWorldConfig,
  BattleWorldState,
  UnitRuntimeState
} from '../types/battleState';
import type { GameDataRegistry } from '../types/dataSchemas';
import { activateFormShift } from './formShiftEngine';
import { triggerTraitHook } from './traitHooks';
import { createUnitRuntime } from './unitRuntimeFactory';

export { createUnitRuntime };

export function createBattleWorld(
  config: BattleWorldConfig,
  registry: GameDataRegistry
): BattleWorldState {
  const arenaSpec =
    registry.balance.arenaDefaults[config.arenaSizeKey] ??
    registry.balance.arenaDefaults.medium;
  const activeAlphaCount =
    config.mode === 'COOP_RAID' ? 3 : config.mode === '2V2' ? 2 : 1;
  const activeOmegaCount =
    config.mode === 'COOP_RAID' ? 1 : config.mode === '2V2' ? 2 : 1;

  const units: UnitRuntimeState[] = [];
  const cy = arenaSpec.height * 0.5;

  config.teamAlpha.slice(0, registry.balance.roster.maxPartySize).forEach((b, idx) => {
    const isOnField = idx < activeAlphaCount;
    const yOffset =
      activeAlphaCount === 3
        ? idx === 0
          ? -110
          : idx === 1
            ? 0
            : 110
        : activeAlphaCount === 2
          ? idx === 0
            ? -75
            : 75
          : 0;
    const pos = { x: arenaSpec.width * 0.2, y: cy + yOffset };
    units.push(
      createUnitRuntime(b, 'ALPHA', idx, isOnField, pos, { x: 1, y: 0 }, registry)
    );
  });

  config.teamOmega.slice(0, registry.balance.roster.maxPartySize).forEach((b, idx) => {
    const isOnField = idx < activeOmegaCount;
    const yOffset = activeOmegaCount === 2 ? (idx === 0 ? -75 : 75) : 0;
    const pos = { x: arenaSpec.width * 0.78, y: cy + yOffset };
    units.push(
      createUnitRuntime(b, 'OMEGA', idx, isOnField, pos, { x: -1, y: 0 }, registry)
    );
  });

  const primaryBoss = units.find((u) => u.team === 'OMEGA' && u.isBossUnit);
  const primaryBossDef = primaryBoss
    ? registry.units[primaryBoss.speciesId]
    : null;

  const world: BattleWorldState = {
    calcVersion: BATTLE_CALC_VERSION,
    tick: 0,
    elapsedSec: 0,
    arenaWidth: arenaSpec.width,
    arenaHeight: arenaSpec.height,
    mode: config.mode,

    units,
    rosters: {
      ALPHA: {
        team: 'ALPHA',
        voluntarySwapCooldownTimer: 0,
        pivotWindowTimer: 0,
        pivotTriggeredByUnitId: null
      },
      OMEGA: {
        team: 'OMEGA',
        voluntarySwapCooldownTimer: 0,
        pivotWindowTimer: 0,
        pivotTriggeredByUnitId: null
      }
    },

    projectiles: [],
    beams: [],
    meleeArcs: [],
    fieldZones: [],

    beamClashes: [],
    meleeBeamGuards: [],
    meleeClashes: [],

    weather: { id: 'NONE', remainingSec: 0 },
    ruleReversal: { kind: 'NONE', remainingSec: 0 },
    environmentField: {
      kind: 'NONE',
      ownerUnitId: null,
      team: null,
      remainingSec: 0
    },

    hitstopTimer: 0,
    slowMoTimer: 0,
    slowMoScale: 1.0,
    screenShakeTimer: 0,
    screenShakeMagnitude: 0,
    screenFlashTimer: 0,
    screenFlashColor: '#ffffff',

    bossIntroTimer: primaryBoss ? 1.5 : 0,
    bossIntroName: primaryBoss ? primaryBoss.name : null,
    bossIntroTitle: primaryBossDef ? primaryBossDef.title : null,
    bossIntroBountyLabel: primaryBoss ? primaryBoss.bountyLabel : null,

    winCondition: config.winCondition ?? { kind: 'DEFEAT_ALL' },
    winReasonText: null,
    extractionZoneActive: false,
    waterZones: config.arenaTerrain?.waterZones
      ? config.arenaTerrain.waterZones.map((z) => ({ ...z }))
      : [],
    slashImmuneMissCount: 0,
    tacticalHintText: null,
    tacticalHintTimer: 0,

    destructibleProps: config.arenaTerrain?.destructibleProps
      ? config.arenaTerrain.destructibleProps.map((p) => ({
          ...p,
          pos: { ...p.pos },
          destroyed: false
        }))
      : [],
    persistentZones: {
      magmaActive: false,
      magmaOwnerId: null,
      magmaTeam: null,
      iceActive: false,
      iceOwnerId: null,
      iceTeam: null,
      splitActive: false
    },
    gauntletWaves: config.gauntletWaves
      ? config.gauntletWaves.map((w) => ({
          ...w,
          enemyBuilds: w.enemyBuilds.map((b) => ({ ...b }))
        }))
      : [],
    currentWaveIndex: 0,
    waveBannerTimer: config.gauntletWaves && config.gauntletWaves.length > 1 ? 2.2 : 0,
    waveBannerText:
      config.gauntletWaves && config.gauntletWaves.length > 1 && config.gauntletWaves[0]
        ? `WAVE 1/${config.gauntletWaves.length}: ${config.gauntletWaves[0].waveName}`
        : null,

    birdcage: {
      active: false,
      ownerUnitId: null,
      shrinkScale: 1.0,
      minScaleRatio: 0.45,
      shrinkRatePerSec: 0.025,
      boundarySlashDamage: 18,
      boundaryKnockbackSpeed: 220,
      tickTimer: 0
    },

    impelDownHazard: {
      active: Boolean(config.impelDownHazard),
      floor: config.impelDownHazard?.floor ?? 0,
      kind: config.impelDownHazard?.kind ?? null,
      trapTimer: 2.0,
      pendingTrapPos: null,
      pendingTrapTelegraphTimer: 0,
      dodgeRechargeMult: config.impelDownHazard?.dodgeRechargeMult ?? 1.0
    },

    colosseumRingOut: {
      active: Boolean(config.colosseumRingOut?.enabled),
      center: { x: arenaSpec.width * 0.5, y: arenaSpec.height * 0.5 },
      safeRadiusPx: Math.round(
        Math.min(arenaSpec.width, arenaSpec.height) *
          (config.colosseumRingOut?.safeRadiusRatio ?? 0.38)
      ),
      outOfBoundsLimitSec: config.colosseumRingOut?.outOfBoundsLimitSec ?? 2.0,
      outOfBoundsDpsRatio: config.colosseumRingOut?.outOfBoundsDpsRatio ?? 0.08,
      instantRingOutKo: config.colosseumRingOut?.instantRingOutKo ?? true,
      resolvedByRingOut: false
    },

    raidState: createInitialRaidRuntimeState(
      config.raidConfig,
      units.find((u) => u.team === 'OMEGA')?.instanceId ?? null
    ),

    floatingTexts: [],
    vfxEvents: [],
    combatLog: [`[전투 개시] 모드: ${config.mode} / 버전: v${BATTLE_CALC_VERSION}`],

    winnerTeam: null
  };

  // Stage 3: Activate persistent floor hazards for Impel Down Level 4 (Magma) & Level 5 (Ice)
  if (world.impelDownHazard.active) {
    if (world.impelDownHazard.kind === 'BLAZING_MAGMA') {
      world.persistentZones.magmaActive = true;
      world.persistentZones.magmaTeam = 'OMEGA';
    } else if (world.impelDownHazard.kind === 'FREEZING_ICE') {
      world.persistentZones.iceActive = true;
      world.persistentZones.iceTeam = 'OMEGA';
    }
  }
  if (config.raidConfig?.weatherOnStart && config.raidConfig.weatherOnStart !== 'NONE') {
    world.weather = { id: config.raidConfig.weatherOnStart, remainingSec: 999 };
  }

  for (const u of world.units) {
    if (u.isOnField && u.isAlive) {
      triggerTraitHook('onEnterField', u, {}, world, registry);
      // Reserve Awakening buff (>= 100% triggers immediate awakening on floor start)
      const matchingBuild =
        u.team === 'ALPHA'
          ? config.teamAlpha.find((b) => b.instanceId === u.instanceId)
          : undefined;
      if ((matchingBuild?.endgameBonuses?.startAwakeningGaugeRatio ?? 0) >= 0.5) {
        u.statBuffs.push({
          id: 'impel_reserve_awakening_surge',
          stat: 'atk',
          multiplier: 1.15,
          remainingSec: 12
        });
        if ((matchingBuild?.endgameBonuses?.startAwakeningGaugeRatio ?? 0) >= 1.0) {
          activateFormShift(u, world, registry);
        }
      }
    }
  }

  return world;
}
