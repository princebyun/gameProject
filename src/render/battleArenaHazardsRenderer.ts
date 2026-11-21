import { clamp, lerpVec, type Vec2 } from '../core/math/vector2';
import type { BattleWorldState } from '../core/types/battleState';
import type { GameDataRegistry } from '../core/types/dataSchemas';

const ELEMENT_COLOR_CACHE = new WeakMap<GameDataRegistry, Map<string, string>>();

export function getElementColorFast(
  registry: GameDataRegistry,
  elementId: string,
  fallback = '#38bdf8'
): string {
  let map = ELEMENT_COLOR_CACHE.get(registry);
  if (!map) {
    map = new Map<string, string>();
    for (const el of registry.elements.elements) {
      map.set(el.id, el.color);
    }
    ELEMENT_COLOR_CACHE.set(registry, map);
  }
  return map.get(elementId) ?? fallback;
}

export function drawConquerorLightningBolts(
  ctx: CanvasRenderingContext2D,
  center: Vec2,
  radius: number,
  tick: number,
  boltCount: number = 4
): void {
  ctx.save();
  for (let i = 0; i < boltCount; i++) {
    const baseAngle = (i * Math.PI * 2) / boltCount + (tick % 11) * 0.27;
    const p1x = center.x + Math.cos(baseAngle) * (radius * 0.35);
    const p1y = center.y + Math.sin(baseAngle) * (radius * 0.35);
    const p2x = center.x + Math.cos(baseAngle + 0.22) * (radius * 0.7);
    const p2y = center.y + Math.sin(baseAngle + 0.22) * (radius * 0.7);
    const p3x = center.x + Math.cos(baseAngle - 0.14) * radius;
    const p3y = center.y + Math.sin(baseAngle - 0.14) * radius;

    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(center.x, center.y);
    ctx.lineTo(p1x, p1y);
    ctx.lineTo(p2x, p2y);
    ctx.lineTo(p3x, p3y);
    ctx.stroke();

    ctx.strokeStyle = '#090d16';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(center.x, center.y);
    ctx.lineTo(p1x, p1y);
    ctx.lineTo(p2x, p2y);
    ctx.lineTo(p3x, p3y);
    ctx.stroke();
  }
  ctx.restore();
}

export function renderArenaFloorZonesAndProjectiles(
  ctx: CanvasRenderingContext2D,
  world: BattleWorldState,
  registry: GameDataRegistry,
  alpha: number
): void {
  // Type C Environment Awakening Arena Overlay
  if (world.environmentField.kind !== 'NONE' && world.environmentField.remainingSec > 0) {
    ctx.save();
    if (world.environmentField.kind === 'RUBBER_BOUNCE_ZONE') {
      ctx.fillStyle = 'rgba(248, 250, 252, 0.10)';
      ctx.fillRect(0, 0, world.arenaWidth, world.arenaHeight);
      ctx.strokeStyle = 'rgba(244, 114, 182, 0.35)';
      ctx.lineWidth = 2;
      for (let x = 32; x < world.arenaWidth; x += 64) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x + Math.sin(world.tick * 0.1) * 10, world.arenaHeight);
        ctx.stroke();
      }
    } else if (world.environmentField.kind === 'K_ROOM_FIELD') {
      ctx.fillStyle = 'rgba(56, 189, 248, 0.10)';
      ctx.fillRect(0, 0, world.arenaWidth, world.arenaHeight);
    } else if (world.environmentField.kind === 'LIGHT_SPEED_REALM') {
      ctx.fillStyle = 'rgba(250, 204, 21, 0.09)';
      ctx.fillRect(0, 0, world.arenaWidth, world.arenaHeight);
    }
    ctx.restore();
  }

  // Persistent Magma & Ice Awakening Zones (including Punk Hazard Half-Split!)
  if (world.persistentZones.magmaActive || world.persistentZones.iceActive) {
    ctx.save();
    if (world.persistentZones.splitActive) {
      const midX = world.arenaWidth * 0.5;
      ctx.fillStyle = 'rgba(220, 38, 38, 0.24)';
      ctx.fillRect(0, 0, midX, world.arenaHeight);
      ctx.fillStyle = 'rgba(56, 189, 248, 0.24)';
      ctx.fillRect(midX, 0, world.arenaWidth - midX, world.arenaHeight);
      ctx.strokeStyle = '#f8fafc';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(midX, 0);
      for (let y = 24; y <= world.arenaHeight; y += 24) {
        ctx.lineTo(midX + (y % 48 === 0 ? 1 : -1) * 8, y);
      }
      ctx.stroke();
    } else if (world.persistentZones.magmaActive) {
      ctx.fillStyle = 'rgba(220, 38, 38, 0.20)';
      ctx.fillRect(0, 0, world.arenaWidth, world.arenaHeight);
    } else if (world.persistentZones.iceActive) {
      ctx.fillStyle = 'rgba(56, 189, 248, 0.20)';
      ctx.fillRect(0, 0, world.arenaWidth, world.arenaHeight);
    }
    ctx.restore();
  }

  // Doflamingo Birdcage Shrinking Red String Arena Overlay & Katakuri Mochi Donut Portals
  if (world.birdcage.active) {
    ctx.save();
    const halfW = world.arenaWidth * world.birdcage.shrinkScale * 0.5;
    const halfH = world.arenaHeight * world.birdcage.shrinkScale * 0.5;
    const cx = world.arenaWidth * 0.5;
    const cy = world.arenaHeight * 0.5;
    const bx = cx - halfW;
    const by = cy - halfH;
    const bw = halfW * 2;
    const bh = halfH * 2;

    ctx.fillStyle = 'rgba(225, 29, 72, 0.28)';
    ctx.fillRect(0, 0, world.arenaWidth, by);
    ctx.fillRect(0, by + bh, world.arenaWidth, world.arenaHeight - (by + bh));
    ctx.fillRect(0, by, bx, bh);
    ctx.fillRect(bx + bw, by, world.arenaWidth - (bx + bw), bh);

    ctx.strokeStyle = '#f43f5e';
    ctx.lineWidth = 3;
    ctx.strokeRect(bx, by, bw, bh);
    ctx.strokeStyle = 'rgba(253, 164, 175, 0.55)';
    ctx.lineWidth = 1;
    for (let sx = bx + 20; sx < bx + bw; sx += 28) {
      ctx.beginPath();
      ctx.moveTo(sx, by);
      ctx.lineTo(sx, by + 16);
      ctx.moveTo(sx, by + bh - 16);
      ctx.lineTo(sx, by + bh);
      ctx.stroke();
    }
    ctx.restore();
  }

  if (
    world.environmentField.kind === 'MOCHI_DONUT_WORLD' &&
    world.environmentField.remainingSec > 0
  ) {
    ctx.save();
    ctx.fillStyle = 'rgba(232, 121, 249, 0.12)';
    ctx.fillRect(0, 0, world.arenaWidth, world.arenaHeight);
    const portals = [
      { x: world.arenaWidth * 0.3, y: world.arenaHeight * 0.25 },
      { x: world.arenaWidth * 0.5, y: world.arenaHeight * 0.18 },
      { x: world.arenaWidth * 0.7, y: world.arenaHeight * 0.25 }
    ];
    for (const p of portals) {
      ctx.strokeStyle = '#e879f9';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 18, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  // Arena tactical center lines & border
  ctx.strokeStyle =
    world.ruleReversal.kind === 'SPEED_INVERSION' && world.ruleReversal.remainingSec > 0
      ? '#c084fc'
      : '#38bdf8';
  ctx.lineWidth = 2;
  ctx.strokeRect(0, 0, world.arenaWidth, world.arenaHeight);

  ctx.strokeStyle = 'rgba(148, 163, 184, 0.14)';
  ctx.beginPath();
  ctx.moveTo(world.arenaWidth * 0.5, 0);
  ctx.lineTo(world.arenaWidth * 0.5, world.arenaHeight);
  ctx.stroke();

  if (world.weather.remainingSec > 0 && world.weather.id !== 'NONE') {
    if (world.weather.id === 'SOLAR_FLARE') {
      ctx.fillStyle = 'rgba(249, 115, 22, 0.08)';
    } else if (world.weather.id === 'TEMPEST_RAIN') {
      ctx.fillStyle = 'rgba(56, 189, 248, 0.09)';
    } else {
      ctx.fillStyle = 'rgba(192, 132, 252, 0.09)';
    }
    ctx.fillRect(0, 0, world.arenaWidth, world.arenaHeight);
  }

  // Corrida Colosseum Circular Water Moat Ring-Out Boundary
  if (world.colosseumRingOut.active) {
    const ro = world.colosseumRingOut;
    ctx.save();
    ctx.fillStyle = 'rgba(14, 165, 233, 0.24)';
    ctx.beginPath();
    ctx.rect(0, 0, world.arenaWidth, world.arenaHeight);
    ctx.arc(ro.center.x, ro.center.y, ro.safeRadiusPx, 0, Math.PI * 2, true);
    ctx.fill();

    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 3.5;
    ctx.setLineDash([10, 6]);
    ctx.beginPath();
    ctx.arc(ro.center.x, ro.center.y, ro.safeRadiusPx, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  // Impel Down Floor 1 Crimson Slash Trap Telegraph
  if (world.impelDownHazard.active && world.impelDownHazard.pendingTrapPos) {
    const tp = world.impelDownHazard.pendingTrapPos;
    const prog = Math.max(0, Math.min(1, 1 - world.impelDownHazard.pendingTrapTelegraphTimer / 1.1));
    ctx.save();
    ctx.fillStyle = 'rgba(244, 63, 94, 0.22)';
    ctx.beginPath();
    ctx.arc(tp.x, tp.y, 68, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(244, 63, 94, 0.38)';
    ctx.beginPath();
    ctx.arc(tp.x, tp.y, 68 * prog, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#f43f5e';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(tp.x, tp.y, 68, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // Magellan Venom Demon Aura Ring
  for (const u of world.units) {
    if (!u.isAlive || !u.isOnField || !u.venomDemonActive) continue;
    const venomSpec = registry.traits[u.traitId]?.venomDemonPassive;
    const auraR = venomSpec?.auraRadiusPx ?? 155;
    const pulse = 0.85 + Math.sin(world.tick * 0.2) * 0.15;
    ctx.save();
    ctx.fillStyle = 'rgba(185, 28, 28, 0.18)';
    ctx.beginPath();
    ctx.arc(u.pos.x, u.pos.y, auraR, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = `rgba(239, 68, 68, ${pulse.toFixed(2)})`;
    ctx.lineWidth = 3;
    ctx.setLineDash([8, 5]);
    ctx.beginPath();
    ctx.arc(u.pos.x, u.pos.y, auraR, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  // Giant Boss Raid Floor Telegraphs & Downed Rescue Rings
  if (world.raidState.active) {
    for (const tele of world.raidState.telegraphs) {
      const prog = Math.max(0, Math.min(1, tele.elapsedSec / Math.max(0.1, tele.durationSec)));
      ctx.save();
      if (tele.shape === 'CIRCLE') {
        ctx.fillStyle = 'rgba(239, 68, 68, 0.22)';
        ctx.beginPath();
        ctx.arc(tele.origin.x, tele.origin.y, tele.radiusPx, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = 'rgba(239, 68, 68, 0.42)';
        ctx.beginPath();
        ctx.arc(tele.origin.x, tele.origin.y, tele.radiusPx * prog, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(tele.origin.x, tele.origin.y, tele.radiusPx, 0, Math.PI * 2);
        ctx.stroke();
      } else if (tele.shape === 'SAFE_ZONE') {
        ctx.fillStyle = `rgba(220, 38, 38, ${(0.18 + prog * 0.24).toFixed(2)})`;
        ctx.beginPath();
        ctx.rect(0, 0, world.arenaWidth, world.arenaHeight);
        ctx.arc(tele.origin.x, tele.origin.y, tele.radiusPx, 0, Math.PI * 2, true);
        ctx.fill();

        ctx.fillStyle = 'rgba(34, 197, 94, 0.2)';
        ctx.beginPath();
        ctx.arc(tele.origin.x, tele.origin.y, tele.radiusPx, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#4ade80';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(tele.origin.x, tele.origin.y, tele.radiusPx, 0, Math.PI * 2);
        ctx.stroke();

        ctx.font = 'bold 11px monospace';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#86efac';
        ctx.fillText(
          `🛡 SAFE ZONE (${Math.max(0, tele.durationSec - tele.elapsedSec).toFixed(1)}s)`,
          tele.origin.x,
          tele.origin.y + 4
        );
      } else if (tele.shape === 'CONE') {
        const baseAngle = Math.atan2(tele.dir.y, tele.dir.x);
        const halfRad = ((tele.arcDeg * Math.PI) / 180) * 0.5;
        ctx.fillStyle = 'rgba(239, 68, 68, 0.22)';
        ctx.beginPath();
        ctx.moveTo(tele.origin.x, tele.origin.y);
        ctx.arc(tele.origin.x, tele.origin.y, tele.radiusPx, baseAngle - halfRad, baseAngle + halfRad);
        ctx.closePath();
        ctx.fill();

        ctx.fillStyle = 'rgba(239, 68, 68, 0.42)';
        ctx.beginPath();
        ctx.moveTo(tele.origin.x, tele.origin.y);
        ctx.arc(tele.origin.x, tele.origin.y, tele.radiusPx * prog, baseAngle - halfRad, baseAngle + halfRad);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 2.5;
        ctx.stroke();
      } else if (tele.shape === 'CROSS_BEAM') {
        const halfW = tele.widthPx * 0.5;
        ctx.fillStyle = 'rgba(239, 68, 68, 0.22)';
        ctx.fillRect(0, tele.origin.y - halfW, world.arenaWidth, tele.widthPx);
        ctx.fillRect(tele.origin.x - halfW, 0, tele.widthPx, world.arenaHeight);
        const innerW = tele.widthPx * prog;
        ctx.fillStyle = 'rgba(248, 113, 113, 0.42)';
        ctx.fillRect(0, tele.origin.y - innerW * 0.5, world.arenaWidth, innerW);
        ctx.fillRect(tele.origin.x - innerW * 0.5, 0, innerW, world.arenaHeight);
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 2;
        ctx.strokeRect(0, tele.origin.y - halfW, world.arenaWidth, tele.widthPx);
        ctx.strokeRect(tele.origin.x - halfW, 0, tele.widthPx, world.arenaHeight);
      }

      if (tele.shape !== 'SAFE_ZONE') {
        ctx.font = 'bold 10px monospace';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#fecaca';
        ctx.fillText(
          `⚠ ${tele.name} (${Math.max(0, tele.durationSec - tele.elapsedSec).toFixed(1)}s)`,
          tele.origin.x,
          Math.max(22, tele.origin.y - 12)
        );
      }
      ctx.restore();
    }

    for (const u of world.units) {
      if (!u.isAlive || !u.isOnField) continue;
      if (u.isDowned) {
        ctx.save();
        ctx.strokeStyle = '#f43f5e';
        ctx.lineWidth = 2.5;
        ctx.setLineDash([6, 4]);
        ctx.beginPath();
        ctx.arc(u.pos.x, u.pos.y, 78, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);

        const revPct = Math.min(1, u.reviveProgressSec / 2.0);
        if (revPct > 0) {
          ctx.strokeStyle = '#4ade80';
          ctx.lineWidth = 5;
          ctx.beginPath();
          ctx.arc(u.pos.x, u.pos.y, u.radiusPx + 14, -Math.PI * 0.5, -Math.PI * 0.5 + Math.PI * 2 * revPct);
          ctx.stroke();
        }
        ctx.font = 'bold 10px monospace';
        ctx.textAlign = 'center';
        ctx.fillStyle = '#fda4af';
        ctx.fillText(
          `🆘 DOWN (${u.downedTimer.toFixed(1)}s)`,
          u.pos.x,
          u.pos.y - u.radiusPx - 14
        );
        ctx.restore();
      } else if (
        world.raidState.bossUnitId === u.instanceId &&
        world.raidState.dpsCheck.active
      ) {
        ctx.save();
        ctx.fillStyle = 'rgba(249, 115, 22, 0.16)';
        ctx.beginPath();
        ctx.arc(u.pos.x, u.pos.y, u.radiusPx + 24, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = '#fb923c';
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(u.pos.x, u.pos.y, u.radiusPx + 24, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    }
  }

  // Water Terrain Pools, Destructible Props, Extraction Zone & Field Zones
  for (const wz of world.waterZones) {
    ctx.save();
    ctx.fillStyle = 'rgba(14, 165, 233, 0.28)';
    ctx.beginPath();
    ctx.arc(wz.x, wz.y, wz.radiusPx, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.font = 'bold 9px monospace';
    ctx.fillStyle = '#bae6fd';
    ctx.textAlign = 'center';
    ctx.fillText('🌊 수변 지형 (어인+20% / 열매-30%)', wz.x, wz.y - wz.radiusPx + 14);
    ctx.restore();
  }

  for (const prop of world.destructibleProps) {
    if (prop.destroyed) continue;
    ctx.save();
    ctx.fillStyle = '#0284c7';
    ctx.beginPath();
    ctx.arc(prop.pos.x, prop.pos.y, prop.radiusPx, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#bae6fd';
    ctx.lineWidth = 2.5;
    ctx.stroke();
    ctx.fillStyle = '#e0f2fe';
    ctx.font = 'bold 9px monospace';
    ctx.textAlign = 'center';
    ctx.fillText('💧물통', prop.pos.x, prop.pos.y + 3);
    ctx.restore();
  }

  if (
    world.extractionZoneActive &&
    world.winCondition.kind === 'REACH_EXTRACTION'
  ) {
    const ez = world.winCondition.extractionZone;
    ctx.save();
    ctx.fillStyle = 'rgba(34, 197, 94, 0.28)';
    ctx.beginPath();
    ctx.arc(ez.x, ez.y, ez.radiusPx, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#4ade80';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.font = 'bold 10px monospace';
    ctx.fillStyle = '#bbf7d0';
    ctx.textAlign = 'center';
    ctx.fillText('⚓ 탈출 구역 (EXTRACTION)', ez.x, ez.y + 4);
    ctx.restore();
  }

  for (const zone of world.fieldZones) {
    ctx.save();
    if (zone.fieldKind === 'HAZARD_ZONE') {
      ctx.fillStyle = zone.isPoisonCloud
        ? 'rgba(168, 85, 247, 0.30)'
        : 'rgba(249, 115, 22, 0.22)';
      ctx.beginPath();
      ctx.arc(zone.pos.x, zone.pos.y, zone.radiusPx, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = zone.isPoisonCloud ? '#c084fc' : '#fb923c';
      ctx.lineWidth = 2;
      ctx.stroke();
      if (zone.isPoisonCloud) {
        ctx.font = 'bold 9px monospace';
        ctx.fillStyle = '#e9d5ff';
        ctx.textAlign = 'center';
        ctx.fillText('☠ MH5 맹독가스', zone.pos.x, zone.pos.y + 3);
      }
    } else if (zone.fieldKind === 'DOME_SHIELD') {
      ctx.fillStyle = 'rgba(56, 189, 248, 0.16)';
      ctx.beginPath();
      ctx.arc(zone.pos.x, zone.pos.y, zone.radiusPx, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2.5;
      ctx.stroke();

      ctx.font = 'bold 10px monospace';
      ctx.fillStyle = 'rgba(125, 211, 252, 0.85)';
      ctx.textAlign = 'center';
      ctx.fillText('ROOM', zone.pos.x, zone.pos.y - zone.radiusPx + 14);

      const hpRatio = clamp(zone.domeHp / Math.max(1, zone.maxDomeHp), 0, 1);
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(zone.pos.x - 26, zone.pos.y - zone.radiusPx - 12, 52, 6);
      ctx.fillStyle = '#38bdf8';
      ctx.fillRect(zone.pos.x - 25, zone.pos.y - zone.radiusPx - 11, Math.round(50 * hpRatio), 4);
    }
    ctx.restore();
  }

  // Observation Haki Lv.3 Future Sight Prediction Lines
  const hasFutureSightObserver = world.units.some(
    (u) => u.isOnField && u.isAlive && (u.haki?.observation ?? 0) >= 3
  );
  if (hasFutureSightObserver) {
    for (const u of world.units) {
      if (!u.isOnField || !u.isAlive || !u.windupMoveId || u.windupTimer <= 0) continue;
      const mDef = registry.moves[u.windupMoveId];
      if (!mDef) continue;

      ctx.save();
      ctx.setLineDash([6, 4]);
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(u.pos.x, u.pos.y);
      ctx.lineTo(
        u.pos.x + u.windupAimDir.x * mDef.rangePx,
        u.pos.y + u.windupAimDir.y * mDef.rangePx
      );
      ctx.stroke();
      ctx.font = 'bold 9px monospace';
      ctx.fillStyle = '#f87171';
      ctx.textAlign = 'center';
      ctx.fillText('FUTURE SIGHT!', u.pos.x, u.pos.y - 38);
      ctx.restore();
    }
  }

  // Active Melee Arcs
  for (const arc of world.meleeArcs) {
    const baseAngle = Math.atan2(arc.dir.y, arc.dir.x);
    const halfArc = (arc.arcDeg * 0.5 * Math.PI) / 180;
    const isLingeringDeflect = arc.elapsedSec > arc.activeDamageDurationSec;

    ctx.save();
    ctx.beginPath();
    ctx.moveTo(arc.origin.x, arc.origin.y);
    ctx.arc(
      arc.origin.x,
      arc.origin.y,
      arc.radiusPx,
      baseAngle - halfArc,
      baseAngle + halfArc
    );
    ctx.closePath();

    if (arc.hasConquerorCoating) {
      ctx.fillStyle = 'rgba(220, 38, 38, 0.28)';
      ctx.fill();
      ctx.strokeStyle = '#090d16';
      ctx.lineWidth = 4;
      ctx.stroke();
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 2;
      ctx.stroke();
      drawConquerorLightningBolts(ctx, arc.origin, arc.radiusPx * 0.9, world.tick, 3);
    } else if (arc.hasArmamentHaki) {
      ctx.fillStyle = isLingeringDeflect
        ? 'rgba(15, 23, 42, 0.32)'
        : 'rgba(15, 23, 42, 0.52)';
      ctx.fill();
      ctx.strokeStyle = '#e11d48';
      ctx.lineWidth = 3;
      ctx.stroke();
    } else {
      ctx.fillStyle = isLingeringDeflect
        ? 'rgba(45, 212, 191, 0.16)'
        : 'rgba(250, 204, 21, 0.28)';
      ctx.fill();
      ctx.strokeStyle = isLingeringDeflect ? '#2dd4bf' : '#fde047';
      ctx.lineWidth = isLingeringDeflect ? 2 : 3;
      ctx.stroke();
    }
    ctx.restore();
  }

  // Active Beams
  for (const beam of world.beams) {
    const endX = beam.origin.x + beam.dir.x * beam.currentLengthPx;
    const endY = beam.origin.y + beam.dir.y * beam.currentLengthPx;
    const beamColor = getElementColorFast(registry, beam.element, '#38bdf8');

    ctx.save();
    ctx.globalAlpha = beam.dimmed ? 0.45 : 0.92;
    if (beam.dimmed) {
      ctx.setLineDash([10, 6]);
    }

    ctx.strokeStyle = beamColor;
    ctx.lineWidth = beam.widthPx;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(beam.origin.x, beam.origin.y);
    ctx.lineTo(endX, endY);
    ctx.stroke();

    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = Math.max(4, beam.widthPx * 0.38);
    ctx.beginPath();
    ctx.moveTo(beam.origin.x, beam.origin.y);
    ctx.lineTo(endX, endY);
    ctx.stroke();
    ctx.restore();
  }

  // Active Projectiles
  for (const proj of world.projectiles) {
    const p = lerpVec(proj.prevPos, proj.pos, alpha);
    const color = getElementColorFast(registry, proj.element, '#f97316');

    let heightOffset = 0;
    if (proj.pattern === 'PARABOLIC') {
      const t = clamp(proj.elapsedSec / Math.max(0.01, proj.maxDurationSec), 0, 1);
      heightOffset = Math.sin(t * Math.PI) * 38;
      ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
      ctx.beginPath();
      ctx.arc(p.x, p.y, proj.radiusPx * 0.7, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.save();
    ctx.fillStyle = proj.hasArmamentHaki ? '#090d16' : color;
    ctx.beginPath();
    ctx.arc(p.x, p.y - heightOffset, proj.radiusPx, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = proj.hasConquerorCoating ? '#ef4444' : color;
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(p.x, p.y - heightOffset, proj.radiusPx * 0.4, 0, Math.PI * 2);
    ctx.fill();

    if (proj.hasConquerorCoating) {
      drawConquerorLightningBolts(ctx, { x: p.x, y: p.y - heightOffset }, proj.radiusPx * 1.6, world.tick, 2);
    }
    ctx.restore();
  }
}

export function renderArenaClashSparksAndFloatingTexts(
  ctx: CanvasRenderingContext2D,
  world: BattleWorldState
): void {
  for (const bc of world.beamClashes) {
    const pulse = 18 + Math.sin(world.tick * 0.6) * 5;
    ctx.save();
    ctx.fillStyle = '#fde047';
    ctx.beginPath();
    ctx.arc(bc.clashPoint.x, bc.clashPoint.y, pulse, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(bc.clashPoint.x, bc.clashPoint.y, pulse * 0.55, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  for (const mg of world.meleeBeamGuards) {
    ctx.save();
    ctx.strokeStyle = '#2dd4bf';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(mg.clashPoint.x, mg.clashPoint.y, 24, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  for (const mc of world.meleeClashes) {
    ctx.save();
    if (mc.isConquerorSkySplit) {
      drawConquerorLightningBolts(ctx, mc.clashPoint, 58, world.tick, 6);
    }
    ctx.strokeStyle = mc.isConquerorSkySplit ? '#ef4444' : '#facc15';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(mc.clashPoint.x - 16, mc.clashPoint.y - 16);
    ctx.lineTo(mc.clashPoint.x + 16, mc.clashPoint.y + 16);
    ctx.moveTo(mc.clashPoint.x + 16, mc.clashPoint.y - 16);
    ctx.lineTo(mc.clashPoint.x - 16, mc.clashPoint.y + 16);
    ctx.stroke();
    ctx.restore();
  }

  for (const vfx of world.vfxEvents) {
    const t = clamp(vfx.elapsedSec / Math.max(0.01, vfx.durationSec), 0, 1);
    ctx.save();
    ctx.globalAlpha = 1 - t;
    ctx.strokeStyle = vfx.color;
    ctx.lineWidth = 3;

    if (vfx.kind === 'CROSS_SLASH' && vfx.targetPos) {
      ctx.beginPath();
      ctx.moveTo(vfx.pos.x, vfx.pos.y);
      ctx.lineTo(vfx.targetPos.x, vfx.targetPos.y);
      ctx.stroke();
    } else if (vfx.kind === 'CONQUEROR_LIGHTNING' || vfx.kind === 'SKY_SPLIT_SHOCKWAVE') {
      drawConquerorLightningBolts(ctx, vfx.pos, vfx.radiusPx * (0.5 + t * 0.7), world.tick, 5);
      ctx.beginPath();
      ctx.arc(vfx.pos.x, vfx.pos.y, vfx.radiusPx * (0.4 + t * 0.8), 0, Math.PI * 2);
      ctx.stroke();
    } else {
      ctx.beginPath();
      ctx.arc(vfx.pos.x, vfx.pos.y, vfx.radiusPx * (0.4 + t * 0.8), 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
  }

  ctx.font = 'bold 11px monospace';
  ctx.textAlign = 'center';
  for (const ft of world.floatingTexts) {
    const t = clamp(ft.elapsedSec / Math.max(0.01, ft.durationSec), 0, 1);
    ctx.save();
    ctx.globalAlpha = 1 - t * 0.85;
    ctx.fillStyle = '#000000';
    ctx.fillText(ft.text, Math.round(ft.pos.x) + 1, Math.round(ft.pos.y) + 1);
    ctx.fillStyle = ft.color;
    ctx.fillText(ft.text, Math.round(ft.pos.x), Math.round(ft.pos.y));
    ctx.restore();
  }
}
