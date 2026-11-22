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
  BattleWorldState,
  RaidRuntimeState,
  UnitRuntimeState
} from '../types/battleState';
import type { GameDataRegistry } from '../types/dataSchemas';

export function detonateTelegraphZone(
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
      hit = distVec(u.pos, zone.origin) > zone.radiusPx;
    } else if (zone.shape === 'CONE') {
      hit = isCircleIntersectingSector(
        u.pos, u.radiusPx, zone.origin, zone.dir, zone.radiusPx, zone.arcDeg
      );
    } else if (zone.shape === 'CROSS_BEAM') {
      const halfW = zone.widthPx * 0.5 + u.radiusPx;
      hit =
        Math.abs(u.pos.x - zone.origin.x) <= halfW ||
        Math.abs(u.pos.y - zone.origin.y) <= halfW;
    }

    if (hit) {
      const dmg = Math.max(22, Math.round(u.maxHp * 0.19 * zone.damageMultiplier));
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

export function stepRaidTelegraphs(
  rs: RaidRuntimeState,
  boss: UnitRuntimeState,
  world: BattleWorldState,
  dt: number,
  registry: GameDataRegistry,
  prng: SeededPRNG
): void {
  for (const pId of Object.keys(rs.patternCooldowns)) {
    const cd = rs.patternCooldowns[pId];
    if (cd !== undefined && cd > 0) {
      rs.patternCooldowns[pId] = Math.max(0, cd - dt);
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
      if (chosen) {
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
  }

  for (let i = rs.telegraphs.length - 1; i >= 0; i--) {
    const zone = rs.telegraphs[i];
    if (!zone) continue;
    zone.elapsedSec += dt;
    if (zone.elapsedSec >= zone.durationSec) {
      detonateTelegraphZone(zone, boss, world, registry);
      rs.telegraphs.splice(i, 1);
    }
  }
}
