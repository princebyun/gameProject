import { distVec } from '../math/vector2';
import type { GameDataRegistry, MoveDefinition } from '../types/dataSchemas';
import type { BattleWorldState, UnitRuntimeState } from '../types/battleState';
import { computeDamage, getUnitCurrentStat } from './damageCalc';
import { applyStatus } from './statusEngine';
import { triggerTraitHook } from './traitHooks';

export function spawnFieldMove(
  caster: UnitRuntimeState,
  moveDef: MoveDefinition,
  targetPos: { x: number; y: number },
  world: BattleWorldState,
  registry: GameDataRegistry
): void {
  const spec = moveDef.aoeFieldSpec;
  if (!spec) return;

  const casterTrait = registry.traits[caster.traitId];
  const weatherDurMult = casterTrait?.weatherDurationMultiplier ?? 1.0;

  if (spec.weatherId && spec.weatherId !== 'NONE') {
    const prevWeather = world.weather.id;
    const dur = Number((spec.durationSec * weatherDurMult).toFixed(2));
    world.weather.id = spec.weatherId;
    world.weather.remainingSec = dur;
    if (prevWeather !== spec.weatherId) {
      for (const u of world.units) {
        if (u.isAlive && u.isOnField) {
          triggerTraitHook('onWeatherChange', u, {}, world, registry);
        }
      }
    }
    if (spec.weatherId === 'TEMPEST_RAIN') {
      for (const u of world.units) {
        if (u.isAlive && u.isOnField) {
          applyStatus(u, 'WET', 8.0, caster.instanceId, world, registry);
        }
      }
    }
    world.combatLog.push(`[전역 날씨] ${spec.weatherId} 발동 (${dur}초)`);
  }

  if (spec.fieldKind === 'RULE_REVERSAL' && spec.ruleReversalKind) {
    world.ruleReversal.kind = spec.ruleReversalKind;
    world.ruleReversal.remainingSec = spec.durationSec;
    world.floatingTexts.push({
      id: `ft_rule_${world.tick}`,
      pos: { x: caster.pos.x, y: caster.pos.y - 36 },
      text: 'RULE REVERSAL: SPEED INVERSION!',
      color: '#c084fc',
      elapsedSec: 0,
      durationSec: 1.3,
      scale: 1.2
    });
    world.combatLog.push(
      `[규칙 반전 필드] ${moveDef.name}: 이동/공격 속도 역전 (${spec.durationSec}초)`
    );
    return;
  }

  const offStat =
    moveDef.category === 'PHYSICAL'
      ? getUnitCurrentStat(caster, 'atk', world, registry)
      : getUnitCurrentStat(caster, 'spAtk', world, registry);

  const domeHp = spec.domeHp ?? 150;
  world.fieldZones.push({
    id: `field_${world.tick}_${caster.instanceId}`,
    moveId: moveDef.id,
    ownerUnitId: caster.instanceId,
    team: caster.team,
    element: moveDef.element,
    fieldKind: spec.fieldKind,
    pos:
      spec.fieldKind === 'DOME_SHIELD'
        ? { x: caster.pos.x, y: caster.pos.y }
        : { x: targetPos.x, y: targetPos.y },
    radiusPx: moveDef.radiusPx,
    remainingSec: spec.durationSec,
    totalSec: spec.durationSec,
    tickTimer: 0,
    basePower: moveDef.basePower,
    offensiveStat: offStat,
    domeHp,
    maxDomeHp: domeHp,
    maxRadiusPx: spec.expandingPoisonCloud?.maxRadiusPx,
    expandRatePxPerSec: spec.expandingPoisonCloud?.expandRatePxPerSec,
    isPoisonCloud: Boolean(spec.expandingPoisonCloud),
    slowRatio: spec.slowRatio
  });
}

export function stepFieldAndGlobalEffects(
  world: BattleWorldState,
  dt: number,
  registry: GameDataRegistry
): void {
  if (world.weather.remainingSec > 0) {
    world.weather.remainingSec = Math.max(0, world.weather.remainingSec - dt);
    // Stage 2-B: TEMPEST_RAIN weather applies WET (8s) to all active field units
    if (world.weather.id === 'TEMPEST_RAIN' && world.tick % 60 === 0) {
      for (const u of world.units) {
        if (u.isAlive && u.isOnField) {
          const alreadyWet = u.statuses.find((s) => s.kind === 'WET');
          if (alreadyWet) {
            alreadyWet.remainingSec = Math.max(alreadyWet.remainingSec, 8.0);
          } else {
            applyStatus(u, 'WET', 8.0, 'weather_rain', world, registry);
          }
        }
      }
    }
    if (world.weather.remainingSec <= 0) {
      world.weather.id = 'NONE';
    }
  }

  // Stage 2-B: Persistent Magma & Ice Awakening Zones (including Left/Right Half Split)
  const pz = world.persistentZones;
  if (pz.magmaActive || pz.iceActive) {
    const midX = world.arenaWidth * 0.5;
    for (const u of world.units) {
      if (!u.isAlive || !u.isOnField) continue;
      if (pz.splitActive) {
        u.onMagmaHazard = u.pos.x < midX;
        u.onIceHazard = u.pos.x >= midX;
      } else {
        u.onMagmaHazard = pz.magmaActive;
        u.onIceHazard = pz.iceActive;
      }
      if (
        u.onMagmaHazard &&
        u.element !== 'MAGMA' &&
        u.team !== pz.magmaTeam &&
        u.iframeTimer <= 0
      ) {
        u.magmaBurnTickTimer += dt;
        if (u.magmaBurnTickTimer >= 1.0) {
          u.magmaBurnTickTimer -= 1.0;
          const burnDmg = Math.max(5, Math.round(u.maxHp * 0.02));
          u.hp = Math.max(0, u.hp - burnDmg);
          world.floatingTexts.push({
            id: `ft_magmaburn_${world.tick}_${u.instanceId}`,
            pos: { x: u.pos.x, y: u.pos.y - 24 },
            text: `🔥 -${burnDmg}`,
            color: '#f97316',
            elapsedSec: 0,
            durationSec: 0.7,
            scale: 0.95
          });
        }
      } else {
        u.magmaBurnTickTimer = 0;
      }
    }
  } else {
    for (const u of world.units) {
      u.onMagmaHazard = false;
      u.onIceHazard = false;
      u.magmaBurnTickTimer = 0;
    }
  }

  if (world.ruleReversal.remainingSec > 0) {
    world.ruleReversal.remainingSec = Math.max(0, world.ruleReversal.remainingSec - dt);
    if (world.ruleReversal.remainingSec <= 0) {
      world.ruleReversal.kind = 'NONE';
    }
  }

  const tickInterval = registry.balance.field.hazardTickIntervalSec;

  for (let i = world.fieldZones.length - 1; i >= 0; i--) {
    const zone = world.fieldZones[i];
    zone.remainingSec -= dt;

    if (zone.remainingSec <= 0 || (zone.fieldKind === 'DOME_SHIELD' && zone.domeHp <= 0)) {
      world.fieldZones.splice(i, 1);
      continue;
    }

    if (zone.fieldKind === 'HAZARD_ZONE') {
      // Stage 2-A: Expanding poison cloud (Don Krieg MH5)
      if (zone.expandRatePxPerSec && zone.maxRadiusPx && zone.radiusPx < zone.maxRadiusPx) {
        zone.radiusPx = Math.min(
          zone.maxRadiusPx,
          zone.radiusPx + zone.expandRatePxPerSec * dt
        );
      }

      zone.tickTimer += dt;
      if (zone.tickTimer >= tickInterval) {
        zone.tickTimer -= tickInterval;
        const owner = world.units.find((u) => u.instanceId === zone.ownerUnitId);
        if (!owner) continue;

        for (const target of world.units) {
          if (
            !target.isAlive ||
            !target.isOnField ||
            target.team === zone.team ||
            target.iframeTimer > 0
          ) {
            continue;
          }
          if (distVec(target.pos, zone.pos) <= zone.radiusPx + target.radiusPx) {
            const { damage } = computeDamage(
              zone.basePower,
              owner,
              target,
              'SPECIAL',
              zone.element,
              world,
              registry,
              { moveId: zone.moveId, isBurstOrAoe: true }
            );
            target.hp = Math.max(0, target.hp - damage);
            // Stage 2-C: AoE field hit breaks Katakuri's futureSightCounter focus!
            const tTrait = registry.traits[target.traitId];
            if (
              damage > 0 &&
              tTrait?.futureSightCounter?.enabled &&
              target.foresightBreakTimer <= 0
            ) {
              target.foresightFocus = 0;
              target.foresightBreakTimer =
                tTrait.futureSightCounter.focusBreakDurationSec;
              world.floatingTexts.push({
                id: `ft_fbreak_aoe_${world.tick}_${target.instanceId}`,
                pos: { x: target.pos.x, y: target.pos.y - 36 },
                text: `💥 광역기 집중 붕괴! (${target.foresightBreakTimer.toFixed(0)}s)`,
                color: '#facc15',
                elapsedSec: 0,
                durationSec: 1.3,
                scale: 1.2
              });
            }
            world.floatingTexts.push({
              id: `ft_hz_${world.tick}_${target.instanceId}`,
              pos: { x: target.pos.x, y: target.pos.y - 20 },
              text: `-${damage}`,
              color: '#fb923c',
              elapsedSec: 0,
              durationSec: 0.65,
              scale: 0.9
            });
          }
        }
      }
    } else if (zone.fieldKind === 'DOME_SHIELD') {
      // Block incoming enemy projectiles hitting the dome shield
      for (const proj of world.projectiles) {
        if (proj.destroyed || proj.team === zone.team) continue;
        if (distVec(proj.pos, zone.pos) <= zone.radiusPx + proj.radiusPx) {
          zone.domeHp -= proj.currentPower * 0.6;
          proj.destroyed = true;
          world.vfxEvents.push({
            id: `vfx_dome_${world.tick}_${proj.id}`,
            kind: 'HIT_SPARK',
            pos: { x: proj.pos.x, y: proj.pos.y },
            color: '#38bdf8',
            radiusPx: 20,
            elapsedSec: 0,
            durationSec: 0.2
          });
        }
      }
    }
  }
}
