import {
  clamp,
  distVec,
  lenVec,
  normalizeVec,
  scaleVec,
  subVec,
  type Vec2
} from '../math/vector2';
import type {
  BattleContext,
  RpgCampaignState,
  RpgDataRegistry,
  SeaGateDefinition,
  SeaIslandNode,
  SeaWeatherId,
  TimeOfDayId
} from '../types/rpgSchemas';
import {
  computeBountyTier,
  computeCrewRoleBonuses
} from './crewAndBountyEngine';

const TIME_ORDER: TimeOfDayId[] = ['MORNING', 'DAY', 'EVENING', 'NIGHT'];
const WEATHER_ORDER: SeaWeatherId[] = ['CLEAR', 'STORM', 'FOG'];

export interface SailingInputCommand {
  moveVec: Vec2;
  coupDeBurstPressed: boolean;
  dockOrInteractPressed: boolean;
}

export interface LogPoseNeedleInfo {
  targetName: string;
  targetKind: 'ISLAND' | 'SEA_GATE';
  angleRad: number;
  distancePx: number;
  dangerLevel: number;
  completed: boolean;
  requiredForNextZone: boolean;
}

export interface SailingStepOutput {
  nearbyIsland: SeaIslandNode | null;
  nearbySeaGate: SeaGateDefinition | null;
  triggeredBattle: BattleContext | null;
  collectedNotice: string | null;
}

export function tryActivateCoupDeBurst(
  state: RpgCampaignState,
  rpgRegistry: RpgDataRegistry
): boolean {
  const shipDef = rpgRegistry.ships[state.ship.shipId];
  if (
    !shipDef ||
    !shipDef.hasCoupDeBurst ||
    state.ship.coupDeBurstCooldownTimer > 0 ||
    state.ship.coupDeBurstActiveTimer > 0
  ) {
    return false;
  }

  const roleBonuses = computeCrewRoleBonuses(state, rpgRegistry);
  state.ship.coupDeBurstActiveTimer = shipDef.coupDeBurstDurationSec;
  state.ship.coupDeBurstCooldownTimer = Number(
    (
      shipDef.coupDeBurstCooldownSec *
      (1 - roleBonuses.coupDeBurstCooldownReductionRatio)
    ).toFixed(2)
  );
  const dir = {
    x: Math.cos(state.ship.headingRad),
    y: Math.sin(state.ship.headingRad)
  };
  state.ship.vel = scaleVec(dir, shipDef.maxSpeedPx * shipDef.coupDeBurstSpeedMult);
  state.voyageLog.push(`[쿠 드 버스트!] 사우전드 써니호가 콜라 에너지를 분사해 비상합니다!`);
  return true;
}

export function stepSeaSailing(
  state: RpgCampaignState,
  input: SailingInputCommand,
  dt: number,
  rpgRegistry: RpgDataRegistry
): SailingStepOutput {
  const zone = rpgRegistry.seaZones[state.currentZoneId];
  const shipDef =
    rpgRegistry.ships[state.ship.shipId] ?? rpgRegistry.ships['going_merry'];
  const roleBonuses = computeCrewRoleBonuses(state, rpgRegistry);

  // 1. Advance Time-of-Day (every 24s) & Marine Weather (every 30s)
  state.timeOfDayTimerSec += dt;
  if (state.timeOfDayTimerSec >= 24) {
    state.timeOfDayTimerSec -= 24;
    const idx = TIME_ORDER.indexOf(state.timeOfDay);
    state.timeOfDay = TIME_ORDER[(idx + 1) % TIME_ORDER.length];
  }

  state.weatherTimerSec += dt;
  if (state.weatherTimerSec >= 30) {
    state.weatherTimerSec -= 30;
    const wIdx = WEATHER_ORDER.indexOf(state.seaWeather);
    state.seaWeather = WEATHER_ORDER[(wIdx + 1) % WEATHER_ORDER.length];
  }

  // 2. Step Coup de Burst timers & Shipwright hull auto-repair
  if (state.ship.coupDeBurstCooldownTimer > 0) {
    state.ship.coupDeBurstCooldownTimer = Math.max(
      0,
      state.ship.coupDeBurstCooldownTimer - dt
    );
  }
  if (state.ship.coupDeBurstActiveTimer > 0) {
    state.ship.coupDeBurstActiveTimer = Math.max(
      0,
      state.ship.coupDeBurstActiveTimer - dt
    );
  }

  if (input.coupDeBurstPressed) {
    tryActivateCoupDeBurst(state, rpgRegistry);
  }

  const totalRepairRate =
    shipDef.autoRepairPerSec + roleBonuses.hullAutoRepairBonus;
  if (state.ship.hullHp < state.ship.maxHullHp && totalRepairRate > 0) {
    state.ship.hullHp = Math.min(
      state.ship.maxHullHp,
      state.ship.hullHp + totalRepairRate * dt
    );
  }

  // 3. 2D Ship inertia, turn rate, wind/current drift
  const moveLen = lenVec(input.moveVec);
  if (moveLen > 0.05) {
    const desiredHeading = Math.atan2(input.moveVec.y, input.moveVec.x);
    let diff = desiredHeading - state.ship.headingRad;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    const maxTurn =
      shipDef.turnRateRadPerSec * roleBonuses.shipTurnSpeedMult * dt;
    if (Math.abs(diff) <= maxTurn) {
      state.ship.headingRad = desiredHeading;
    } else {
      state.ship.headingRad += Math.sign(diff) * maxTurn;
    }

    const thrustDir = {
      x: Math.cos(state.ship.headingRad),
      y: Math.sin(state.ship.headingRad)
    };
    const accel = shipDef.accelerationPx * roleBonuses.sailingSpeedMult;
    state.ship.vel.x += thrustDir.x * accel * dt;
    state.ship.vel.y += thrustDir.y * accel * dt;
  } else {
    const damping = Math.max(0, 1 - shipDef.dragPerSec * dt);
    state.ship.vel = scaleVec(state.ship.vel, damping);
  }

  // Sea current & storm wind influence (Helmsman adds +60% current & storm drift resistance)
  const effectiveCurrentResist = Math.min(
    0.95,
    shipDef.currentResistance +
      (1 - shipDef.currentResistance) * roleBonuses.currentAndStormDriftResist
  );
  const currentFactor = Math.max(0.05, 1 - effectiveCurrentResist);
  const combinedStormResist = Math.min(
    0.92,
    roleBonuses.stormResistanceRatio +
      (1 - roleBonuses.stormResistanceRatio) * roleBonuses.currentAndStormDriftResist
  );
  let stormDragMult = 1.0;
  if (state.seaWeather === 'STORM') {
    stormDragMult = 1 - 0.25 * (1 - combinedStormResist);
  }

  const maxAllowedSpeed =
    shipDef.maxSpeedPx *
    roleBonuses.sailingSpeedMult *
    stormDragMult *
    (state.ship.coupDeBurstActiveTimer > 0 ? shipDef.coupDeBurstSpeedMult : 1.0);

  const curSpeed = lenVec(state.ship.vel);
  if (curSpeed > maxAllowedSpeed) {
    state.ship.vel = scaleVec(normalizeVec(state.ship.vel), maxAllowedSpeed);
  }

  state.ship.pos.x = clamp(
    state.ship.pos.x +
      (state.ship.vel.x + zone.baseCurrentVec.x * currentFactor) * dt,
    36,
    zone.width - 36
  );
  state.ship.pos.y = clamp(
    state.ship.pos.y +
      (state.ship.vel.y + zone.baseCurrentVec.y * currentFactor) * dt,
    36,
    zone.height - 36
  );

  // 4. Step dynamic sea objects (Marine patrols, Sea Kings, Treasure Chests, Merchants)
  const seaObjects = state.seaObjectsByZone[state.currentZoneId] ?? [];
  let triggeredBattle: BattleContext | null = null;
  let collectedNotice: string | null = null;

  for (const obj of seaObjects) {
    if (obj.collectedOrDefeated) continue;
    if (obj.hiddenByDefault && !roleBonuses.revealsHiddenChests) {
      continue;
    }

    // Move mobile ships/sea kings
    if (lenVec(obj.vel) > 0.1) {
      obj.pos.x += obj.vel.x * dt;
      obj.pos.y += obj.vel.y * dt;
      if (obj.pos.x < 120 || obj.pos.x > zone.width - 120) obj.vel.x *= -1;
      if (obj.pos.y < 100 || obj.pos.y > zone.height - 100) obj.vel.y *= -1;
    }

    const d = distVec(state.ship.pos, obj.pos);
    if (d <= obj.radiusPx + 24) {
      if (obj.kind === 'TREASURE_CHEST' || obj.kind === 'MERCHANT_SHIP') {
        obj.collectedOrDefeated = true;
        const berries = Math.round(obj.berryValue * roleBonuses.rewardMult);
        const tp = Math.round(obj.trainingPointValue * roleBonuses.rewardMult);
        state.berries += berries;
        state.trainingPoints += tp;
        if (obj.kind === 'MERCHANT_SHIP') {
          state.ship.hullHp = state.ship.maxHullHp;
        }
        collectedNotice = `[해상 탐색] ${obj.name} 발견! (+${berries} 베리, +${tp} 수련Pt)`;
        state.voyageLog.push(collectedNotice);
      } else if (obj.kind === 'MARINE_PATROL' || obj.kind === 'SEA_KING') {
        obj.collectedOrDefeated = true;
        const bountyTier = computeBountyTier(state.totalCrewBounty);
        const aiLevel =
          obj.kind === 'MARINE_PATROL'
            ? Math.max(obj.aiLevel, bountyTier.patrolAiLevel)
            : obj.aiLevel;
        const enemies =
          obj.kind === 'MARINE_PATROL' && bountyTier.tier >= 3
            ? bountyTier.patrolEnemyIds
            : obj.enemyUnitIds;

        triggeredBattle = {
          sourceScene: 'SEA_SAILING',
          zoneId: state.currentZoneId,
          islandId: null,
          encounterId: obj.id,
          encounterName:
            obj.kind === 'MARINE_PATROL'
              ? `${obj.name} (${bountyTier.patrolCompositionLabel})`
              : obj.name,
          isBoss: false,
          arenaSizeKey: 'medium',
          mode:
            state.activePartyUnitIds.length >= 2 && enemies.length >= 2
              ? '2V2'
              : '1V1',
          enemyUnitIds: enemies,
          aiLevel,
          bountyReward: obj.kind === 'MARINE_PATROL' ? 15_000_000 : 10_000_000,
          berryReward: Math.round(obj.berryValue * roleBonuses.rewardMult),
          trainingPointReward: Math.round(
            obj.trainingPointValue * roleBonuses.rewardMult
          ),
          setsFlagOnVictory: null,
          completesEpisodeIdOnVictory: null
        };
      }
    }
  }

  // 5. Check proximity to Island Docking Zones & SeaGate
  let nearbyIsland: SeaIslandNode | null = null;
  for (const isl of zone.islands) {
    if (distVec(state.ship.pos, isl.pos) <= isl.dockingRadiusPx) {
      nearbyIsland = isl;
      break;
    }
  }

  let nearbySeaGate: SeaGateDefinition | null = null;
  if (zone.seaGate) {
    if (distVec(state.ship.pos, zone.seaGate.pos) <= zone.seaGate.triggerRadiusPx) {
      nearbySeaGate = zone.seaGate;
    }
  }

  return {
    nearbyIsland,
    nearbySeaGate,
    triggeredBattle,
    collectedNotice
  };
}

export function computeLogPoseNeedles(
  state: RpgCampaignState,
  rpgRegistry: RpgDataRegistry
): LogPoseNeedleInfo[] {
  const zone = rpgRegistry.seaZones[state.currentZoneId];
  if (!zone) return [];

  if (zone.logPoseStyle === 'TRIPLE_NEEDLE_NEW_WORLD') {
    // Stage 2-C: Prioritize next incomplete islands in recommended New World arc order (up to 3 needles)
    const incomplete = zone.islands.filter(
      (isl) => !state.completedEpisodes.includes(isl.episodeId)
    );
    const chosen =
      incomplete.length >= 3
        ? incomplete.slice(0, 3)
        : [
            ...incomplete,
            ...zone.islands
              .filter((isl) => state.completedEpisodes.includes(isl.episodeId))
              .slice(0, Math.max(0, 3 - incomplete.length))
          ];
    return chosen.map((isl) => {
      const delta = subVec(isl.pos, state.ship.pos);
      const completed = state.completedEpisodes.includes(isl.episodeId);
      return {
        targetName: isl.name,
        targetKind: 'ISLAND',
        angleRad: Math.atan2(delta.y, delta.x),
        distancePx: Math.round(lenVec(delta)),
        dangerLevel: isl.dangerLevel,
        completed,
        requiredForNextZone: isl.requiredForNextZone
      };
    });
  }

  // SINGLE_NEEDLE: point to next incomplete required island, or to SeaGate if all required islands are done
  const nextReqIsland = zone.islands.find(
    (isl) =>
      isl.requiredForNextZone && !state.completedEpisodes.includes(isl.episodeId)
  );
  if (nextReqIsland) {
    const delta = subVec(nextReqIsland.pos, state.ship.pos);
    return [
      {
        targetName: nextReqIsland.name,
        targetKind: 'ISLAND',
        angleRad: Math.atan2(delta.y, delta.x),
        distancePx: Math.round(lenVec(delta)),
        dangerLevel: nextReqIsland.dangerLevel,
        completed: false,
        requiredForNextZone: true
      }
    ];
  }

  if (zone.seaGate) {
    const delta = subVec(zone.seaGate.pos, state.ship.pos);
    return [
      {
        targetName: zone.seaGate.name,
        targetKind: 'SEA_GATE',
        angleRad: Math.atan2(delta.y, delta.x),
        distancePx: Math.round(lenVec(delta)),
        dangerLevel: 3,
        completed: false,
        requiredForNextZone: true
      }
    ];
  }

  return [];
}
