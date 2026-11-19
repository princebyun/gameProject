import type { AssetLoader } from '../assets/assetLoader';
import { FIXED_DT } from '../core/constants';
import { clamp, lerpVec, type Vec2 } from '../core/math/vector2';
import type { GameDataRegistry } from '../core/types/dataSchemas';
import type { BattleWorldState, UnitRuntimeState } from '../core/types/battleState';
import { resolveBiomeForArena } from '../data/assets/assetManifestRegistry';
import type { RenderAccessibilitySettings } from './canvasRenderer';
import {
  DEFAULT_VIEWPORT_METRICS,
  type ViewportMetrics
} from './viewport/responsiveViewportManager';

export function computeArenaCameraOffset(
  world: BattleWorldState,
  alpha: number,
  settings: RenderAccessibilitySettings,
  cameraTargetIndex: 'ALL' | 0 | 1 | 2 | 3 = 'ALL',
  viewport: ViewportMetrics = DEFAULT_VIEWPORT_METRICS
): Vec2 {
  const viewW = viewport.viewWidth;
  const viewH = viewport.viewHeight;
  const onField = world.units.filter((u) => u.isOnField && u.isAlive);
  let focusX = world.arenaWidth * 0.5;
  let focusY = world.arenaHeight * 0.5;

  if (
    cameraTargetIndex !== 'ALL' &&
    world.units[cameraTargetIndex] &&
    world.units[cameraTargetIndex].isOnField
  ) {
    const tracked = world.units[cameraTargetIndex];
    const p = lerpVec(tracked.prevPos, tracked.pos, alpha);
    focusX = p.x;
    focusY = p.y;
  } else if (onField.length > 0) {
    let sx = 0;
    let sy = 0;
    for (const u of onField) {
      const p = lerpVec(u.prevPos, u.pos, alpha);
      sx += p.x;
      sy += p.y;
    }
    focusX = sx / onField.length;
    focusY = sy / onField.length;
  }

  let camX = viewW * 0.5 - focusX;
  let camY = viewH * 0.5 - focusY;

  if (world.arenaWidth <= viewW) {
    camX = (viewW - world.arenaWidth) * 0.5;
  } else {
    camX = clamp(camX, viewW - world.arenaWidth - 24, 24);
  }

  if (world.arenaHeight <= viewH - 120) {
    camY = (viewH - world.arenaHeight) * 0.5 - 8;
  } else {
    camY = clamp(camY, viewH - world.arenaHeight - 76, 56);
  }

  if (world.screenShakeTimer > 0 && settings.shakeIntensity > 0) {
    const mag = world.screenShakeMagnitude * settings.shakeIntensity;
    const phase = world.tick * 1.9;
    camX += Math.sin(phase) * mag;
    camY += Math.cos(phase * 1.3) * mag;
  }

  return { x: Math.round(camX), y: Math.round(camY) };
}

function drawConquerorLightningBolts(
  ctx: CanvasRenderingContext2D,
  center: Vec2,
  radius: number,
  tick: number,
  boltCount: number = 4
): void {
  ctx.save();
  for (let i = 0; i < boltCount; i++) {
    const baseAngle = ((i * Math.PI * 2) / boltCount) + (tick % 11) * 0.27;
    const p1 = {
      x: center.x + Math.cos(baseAngle) * (radius * 0.35),
      y: center.y + Math.sin(baseAngle) * (radius * 0.35)
    };
    const p2 = {
      x: center.x + Math.cos(baseAngle + 0.22) * (radius * 0.7),
      y: center.y + Math.sin(baseAngle + 0.22) * (radius * 0.7)
    };
    const p3 = {
      x: center.x + Math.cos(baseAngle - 0.14) * radius,
      y: center.y + Math.sin(baseAngle - 0.14) * radius
    };

    // Outer crimson lightning aura
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(center.x, center.y);
    ctx.lineTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.lineTo(p3.x, p3.y);
    ctx.stroke();

    // Inner pitch-black Conqueror core
    ctx.strokeStyle = '#090d16';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(center.x, center.y);
    ctx.lineTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.lineTo(p3.x, p3.y);
    ctx.stroke();
  }
  ctx.restore();
}

function drawHagoromoCloudSash(
  ctx: CanvasRenderingContext2D,
  pos: Vec2,
  scale: number,
  hagoromoColor: 'white' | 'black',
  tick: number
): void {
  ctx.save();
  const r = 20 * scale;
  const bob = Math.sin(tick * 0.14) * 2.5;
  const isWhite = hagoromoColor === 'white';

  // Outer aura rim
  ctx.strokeStyle = isWhite ? '#e2e8f0' : '#a855f7';
  ctx.lineWidth = 6 * scale;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(pos.x, pos.y - 3 + bob, r, Math.PI * 0.85, Math.PI * 2.15);
  ctx.stroke();

  // Inner cloud sash body
  ctx.strokeStyle = isWhite ? '#ffffff' : '#090d16';
  ctx.lineWidth = 3.8 * scale;
  ctx.beginPath();
  ctx.arc(pos.x, pos.y - 3 + bob, r, Math.PI * 0.85, Math.PI * 2.15);
  ctx.stroke();

  // Billowing shoulder cloud puffs
  const puffAngles = [Math.PI * 0.9, Math.PI * 1.2, Math.PI * 1.5, Math.PI * 1.8, Math.PI * 2.1];
  for (let i = 0; i < puffAngles.length; i++) {
    const a = puffAngles[i];
    const px = pos.x + Math.cos(a) * r;
    const py = pos.y - 3 + bob + Math.sin(a) * r;
    ctx.fillStyle = isWhite ? '#ffffff' : '#090d16';
    ctx.strokeStyle = isWhite ? '#cbd5e1' : '#a855f7';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(px, py, 4.2 * scale, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }

  ctx.restore();
}

export function renderBattleArena(
  ctx: CanvasRenderingContext2D,
  world: BattleWorldState,
  registry: GameDataRegistry,
  assets: AssetLoader,
  alpha: number,
  settings: RenderAccessibilitySettings,
  cameraTargetIndex: 'ALL' | 0 | 1 | 2 | 3 = 'ALL',
  viewport: ViewportMetrics = DEFAULT_VIEWPORT_METRICS
): void {
  const viewW = viewport.viewWidth;
  const viewH = viewport.viewHeight;
  ctx.imageSmoothingEnabled = false;

  const arenaBiomeKey = world.impelDownHazard.active
    ? 'IMPEL_DOWN'
    : world.colosseumRingOut.active
      ? 'COLOSSEUM'
      : world.raidState.active
        ? world.raidState.raidId === 'raid_loki_ragnir'
          ? 'ELBAF'
          : world.raidState.raidId === 'raid_saturn_abyss'
            ? 'LAB'
            : 'COOP_RAID'
        : world.persistentZones.iceActive
          ? 'ICE'
          : world.persistentZones.magmaActive
            ? 'MAGMA'
            : 'DEFAULT';
  const arenaBiome = resolveBiomeForArena(arenaBiomeKey, assets.manifestRegistry);

  // Extended full-bleed outer backdrop for 19.5:9 / ultra-wide displays (no black bars!)
  ctx.fillStyle = arenaBiome.palette.wall;
  ctx.fillRect(0, 0, viewW, viewH);
  assets.tilemapRenderer.renderBiomeBackdrop(
    ctx,
    `arena_outer_${arenaBiomeKey}_${viewW}x${viewH}`,
    viewW,
    viewH,
    0,
    0,
    viewW,
    viewH,
    arenaBiome,
    assets,
    world.tick
  );
  // Subtle ambient vignette over outer side extensions so the deterministic combat arena pops cleanly
  ctx.fillStyle = 'rgba(7, 11, 18, 0.42)';
  ctx.fillRect(0, 0, viewW, viewH);

  const cam = computeArenaCameraOffset(
    world,
    alpha,
    settings,
    cameraTargetIndex,
    viewport
  );
  const hasGiantBossOnField = world.units.some(
    (u) => u.isOnField && u.isAlive && u.entityScale >= 1.6
  );
  const zoomScale = hasGiantBossOnField ? 0.88 : 1.0;

  ctx.save();
  if (zoomScale !== 1.0) {
    ctx.translate(viewW * 0.5, viewH * 0.5);
    ctx.scale(zoomScale, zoomScale);
    ctx.translate(-viewW * 0.5, -viewH * 0.5);
  }
  ctx.translate(cam.x, cam.y);

  // 1. Chunk-cached Biome Tilemap Arena Floor (deterministic core arena bounds)
  assets.tilemapRenderer.renderBiomeBackdrop(
    ctx,
    `arena_${arenaBiomeKey}_${world.arenaWidth}x${world.arenaHeight}`,
    world.arenaWidth,
    world.arenaHeight,
    Math.max(0, -cam.x - 64),
    Math.max(0, -cam.y - 64),
    viewW + 128,
    viewH + 128,
    arenaBiome,
    assets,
    world.tick
  );

  // Crisp subtle boundary line marking the deterministic 960x540 combat arena edges on wide screens
  ctx.strokeStyle = 'rgba(250, 204, 21, 0.35)';
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, world.arenaWidth - 2, world.arenaHeight - 2);

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

  // Stage 2-B: Persistent Magma & Ice Awakening Zones (including Punk Hazard Half-Split!)
  if (world.persistentZones.magmaActive || world.persistentZones.iceActive) {
    ctx.save();
    if (world.persistentZones.splitActive) {
      const midX = world.arenaWidth * 0.5;
      // Left Half: Molten Magma Zone
      ctx.fillStyle = 'rgba(220, 38, 38, 0.24)';
      ctx.fillRect(0, 0, midX, world.arenaHeight);
      // Right Half: Frozen Ice Age Zone
      ctx.fillStyle = 'rgba(56, 189, 248, 0.24)';
      ctx.fillRect(midX, 0, world.arenaWidth - midX, world.arenaHeight);
      // Jagged central clash divider
      ctx.strokeStyle = '#f8fafc';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(midX, 0);
      for (let y = 24; y <= world.arenaHeight; y += 24) {
        ctx.lineTo(midX + ((y % 48 === 0 ? 1 : -1) * 8), y);
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

  // Stage 2-C: Doflamingo Birdcage Shrinking Red String Arena Overlay & Katakuri Mochi Donut Portals
  if (world.birdcage.active) {
    ctx.save();
    const halfW = (world.arenaWidth * world.birdcage.shrinkScale) * 0.5;
    const halfH = (world.arenaHeight * world.birdcage.shrinkScale) * 0.5;
    const cx = world.arenaWidth * 0.5;
    const cy = world.arenaHeight * 0.5;
    const bx = cx - halfW;
    const by = cy - halfH;
    const bw = halfW * 2;
    const bh = halfH * 2;

    // Danger outside region tint
    ctx.fillStyle = 'rgba(225, 29, 72, 0.28)';
    ctx.fillRect(0, 0, world.arenaWidth, by);
    ctx.fillRect(0, by + bh, world.arenaWidth, world.arenaHeight - (by + bh));
    ctx.fillRect(0, by, bx, bh);
    ctx.fillRect(bx + bw, by, world.arenaWidth - (bx + bw), bh);

    // Glowing red string cage walls + vertical razor strands
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
    // 3 Floating Peerless Donut Portals
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

  // Stage 3: Corrida Colosseum Circular Water Moat Ring-Out Boundary
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

  // Stage 3: Impel Down Floor 1 Crimson Slash Trap Telegraph
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

  // Stage 3: Magellan Venom Demon Aura Ring
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

  // Stage 3 Step 2: Giant Boss Raid Floor Telegraphs (1.2~1.8s crimson warning + charge gauge)
  if (world.raidState.active) {
    for (const tele of world.raidState.telegraphs) {
      const prog = Math.max(0, Math.min(1, tele.elapsedSec / Math.max(0.1, tele.durationSec)));
      ctx.save();
      if (tele.shape === 'CIRCLE') {
        ctx.fillStyle = 'rgba(239, 68, 68, 0.22)';
        ctx.beginPath();
        ctx.arc(tele.origin.x, tele.origin.y, tele.radiusPx, 0, Math.PI * 2);
        ctx.fill();
        // Expanding inner charge fill
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
        // Red danger across entire arena EXCEPT green safe zone circle
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
        // Inner charge fill along cross
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

    // Render Downed Rescue Ring & Boss DPS Shield Aura
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

  // 2. Field zones (Water Terrain Pools, Poison Clouds, Hazard Zones & Law's ROOM Dome shields)
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

  // Stage 2-B: Destructible Arena Props (Alabasta Water Barrels / Oasis Jars)
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

  // 2.5 Observation Haki Lv.3 Future Sight Prediction Lines
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

  // 3. Active Melee Arcs (with Armament Haki blackening & Conqueror's black-red lightning)
  for (const arc of world.meleeArcs) {
    const baseAngle = Math.atan2(arc.dir.y, arc.dir.x);
    const halfArc = ((arc.arcDeg * 0.5) * Math.PI) / 180;
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

  // 4. Active Beams
  for (const beam of world.beams) {
    const endX = beam.origin.x + beam.dir.x * beam.currentLengthPx;
    const endY = beam.origin.y + beam.dir.y * beam.currentLengthPx;
    const elemMeta = registry.elements.elements.find((e) => e.id === beam.element);
    const beamColor = elemMeta?.color ?? '#38bdf8';

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

  // 5. Active Projectiles
  for (const proj of world.projectiles) {
    const p = lerpVec(proj.prevPos, proj.pos, alpha);
    const elemMeta = registry.elements.elements.find((e) => e.id === proj.element);
    const color = elemMeta?.color ?? '#f97316';

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

  // 6. On-field Units (including Raid Downed units so rescue ring & DOWNED sprite frame render)
  for (const unit of world.units) {
    if (!unit.isOnField || !unit.isAlive) continue;
    renderUnitOnArena(ctx, unit, world, registry, assets, alpha, settings);
  }

  // 7. Active Clash Sparks (Beam vs Beam, Melee vs Beam Guard, Melee vs Melee + Conqueror Sky Split)
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

  // 8. VFX Events
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

  // 9. Floating Combat Texts
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

  ctx.restore();

  if (settings.flashEffectEnabled && world.screenFlashTimer > 0) {
    ctx.save();
    ctx.globalAlpha = Math.min(0.32, world.screenFlashTimer * 2);
    ctx.fillStyle = world.screenFlashColor;
    ctx.fillRect(0, 0, viewW, viewH);
    ctx.restore();
  }
}

function renderUnitOnArena(
  ctx: CanvasRenderingContext2D,
  unit: UnitRuntimeState,
  world: BattleWorldState,
  registry: GameDataRegistry,
  assets: AssetLoader,
  alpha: number,
  settings: RenderAccessibilitySettings
): void {
  const pos = lerpVec(unit.prevPos, unit.pos, alpha);
  const unitDef = registry.units[unit.speciesId];
  const elemMeta = registry.elements.elements.find((e) => e.id === unit.element);
  const elemColor = elemMeta?.color ?? '#38bdf8';

  ctx.save();

  // Awakening / Overdrive aura ring
  if (unit.auraColor) {
    ctx.strokeStyle = unit.auraColor;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(
      pos.x,
      pos.y,
      unit.radiusPx * unit.visualScale + 6 + Math.sin(world.tick * 0.25) * 2,
      0,
      Math.PI * 2
    );
    ctx.stroke();
  }

  // Hagoromo Cloud Sash (White for Nika Gear 5, Black for Awakened Lucci / Kaido / Saturn)
  if (unit.hagoromoColor) {
    drawHagoromoCloudSash(ctx, pos, unit.visualScale, unit.hagoromoColor, world.tick);
  }

  // Phase 6: Lunarian Back-Flame pixel effect (King & S-Hawk)
  const unitTrait = registry.traits[unit.traitId];
  if (unitTrait?.lunarianFlame?.enabled) {
    if (unit.lunarianFlameOn) {
      const flameSideX = pos.x - unit.aimDir.x * (10 * unit.visualScale);
      const flameBaseY = pos.y - 8 * unit.visualScale;
      const flicker = Math.sin(world.tick * 0.35) * 4;
      ctx.fillStyle = '#f97316';
      ctx.fillRect(
        Math.round(flameSideX - 6),
        Math.round(flameBaseY - 14 + flicker),
        12,
        16
      );
      ctx.fillStyle = '#fde047';
      ctx.fillRect(
        Math.round(flameSideX - 3),
        Math.round(flameBaseY - 10 + flicker),
        6,
        10
      );
    } else {
      // Flame OFF high-speed cyan afterimage ring
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.65)';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 3]);
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, unit.radiusPx + 5, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  // Phase 6: Super Regeneration dark-crimson aura & Conqueror lockout seal (Saturn)
  if (unitTrait?.superRegeneration?.enabled) {
    if (unit.superRegenLockoutTimer > 0) {
      drawConquerorLightningBolts(ctx, pos, unit.radiusPx + 10, world.tick, 3);
    } else if (unit.superRegenIdleTimer >= (unitTrait.superRegeneration.delayAfterHitSec ?? 1.5)) {
      ctx.strokeStyle = 'rgba(220, 38, 38, 0.72)';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(
        pos.x,
        pos.y,
        unit.radiusPx + 6 + Math.sin(world.tick * 0.2) * 3,
        0,
        Math.PI * 2
      );
      ctx.stroke();
    }
  }

  // Logia Elemental Dispersion Particle Effect when non-Haki attack passes through
  if (unit.logiaDispersionTimer > 0) {
    ctx.globalAlpha = 0.45;
    for (let i = 0; i < 6; i++) {
      const ang = (i * Math.PI) / 3 + world.tick * 0.3;
      ctx.fillStyle = elemColor;
      ctx.beginPath();
      ctx.arc(
        pos.x + Math.cos(ang) * 18,
        pos.y + Math.sin(ang) * 18,
        4,
        0,
        Math.PI * 2
      );
      ctx.fill();
    }
  }

  // Team ring & facing indicator
  ctx.strokeStyle = unit.team === 'ALPHA' ? '#38bdf8' : '#f43f5e';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(pos.x, pos.y, unit.radiusPx, 0, Math.PI * 2);
  ctx.stroke();

  const tipX = pos.x + unit.aimDir.x * (unit.radiusPx + 8);
  const tipY = pos.y + unit.aimDir.y * (unit.radiusPx + 8);
  ctx.fillStyle = elemColor;
  ctx.beginPath();
  ctx.arc(tipX, tipY, 3.5, 0, Math.PI * 2);
  ctx.fill();

  if (unit.iframeTimer > 0 && world.tick % 2 === 0) {
    ctx.globalAlpha = 0.55;
  }

  // Draw animated multi-frame pixel sprite sheet with Armament blackening, 80ms white flash, afterimages & Logia dispersion
  if (unitDef) {
    const formDef = unit.activeFormId ? registry.forms[unit.activeFormId] ?? null : null;
    const { entry: sheetEntry, sheet } = assets.getOrCreateUnitSpriteSheet(
      unitDef,
      unit.activeFormId,
      formDef
    );
    const animRes = assets.spriteController.syncAndStepUnit(
      unit,
      world,
      registry,
      assets.manifestRegistry,
      FIXED_DT
    );

    if (unit.baraSplitTimer > 0) {
      const sprite = assets.getOrCreateUnitSprite(
        unitDef,
        unit.currentStanceRole,
        unit.activeFormId
      );
      if (sprite) {
        const size = Math.round(32 * unit.visualScale);
        ctx.save();
        ctx.translate(Math.round(pos.x), Math.round(pos.y));
        if (animRes.visual.facingX < 0) ctx.scale(-1, 1);
        const splitGap = Math.round(Math.sin((unit.baraSplitTimer / 0.48) * Math.PI) * 14);
        ctx.drawImage(sprite, 0, 0, 32, 16, -size * 0.5, -size * 0.5 - splitGap, size, size * 0.5);
        ctx.drawImage(sprite, 0, 16, 32, 16, -size * 0.5, splitGap * 0.5, size, size * 0.5);
        ctx.restore();
      }
    } else if (sheet) {
      // Normalize draw scale so 32px/48px/96px sheets map cleanly onto entityScale * visualScale
      const targetPixelHeight = 42 * unit.entityScale * unit.visualScale;
      const drawScale = Math.max(0.75, targetPixelHeight / sheetEntry.frameHeight);
      const footPos = {
        x: pos.x,
        y: pos.y + Math.round(unit.radiusPx * 0.65)
      };

      assets.spriteController.drawAnimatedUnitFrame(
        ctx,
        sheet,
        sheetEntry,
        animRes.step.row,
        animRes.step.frameIndex,
        footPos,
        animRes.visual.facingX,
        drawScale,
        {
          hitFlashActive: animRes.step.hitFlashActive,
          flashEffectEnabled: settings.flashEffectEnabled,
          hasArmamentActive: animRes.hasArmamentActive,
          logiaDispersionTimer: unit.logiaDispersionTimer,
          elementColor: elemColor,
          afterimages: animRes.visual.afterimages,
          tick: world.tick
        }
      );
    }
  }

  ctx.globalAlpha = 1.0;

  // Overhead mini HP bar
  const hpRatio = clamp(unit.hp / Math.max(1, unit.maxHp), 0, 1);
  const barW = 42;
  const barX = Math.round(pos.x - barW * 0.5);
  const barY = Math.round(pos.y - unit.radiusPx * unit.visualScale - 16);
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(barX - 1, barY - 1, barW + 2, 6);
  ctx.fillStyle = unit.team === 'ALPHA' ? '#22c55e' : '#ef4444';
  ctx.fillRect(barX, barY, Math.round(barW * hpRatio), 4);

  // Overhead real-time status & exhaustion timer badges
  let badgeY = barY - 6;
  ctx.font = 'bold 9px monospace';
  ctx.textAlign = 'center';
  for (const st of unit.statuses) {
    ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
    ctx.fillRect(pos.x - 32, badgeY - 10, 64, 11);
    ctx.fillStyle = st.kind === 'STAGGER' ? '#facc15' : '#c084fc';
    ctx.fillText(`${st.kind} ${st.remainingSec.toFixed(1)}s`, pos.x, badgeY - 1);
    badgeY -= 12;
  }
  if (unit.exhaustionTimer > 0) {
    ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
    ctx.fillRect(pos.x - 38, badgeY - 10, 76, 11);
    ctx.fillStyle = '#f87171';
    ctx.fillText(`EXHAUST ${unit.exhaustionTimer.toFixed(1)}s`, pos.x, badgeY - 1);
    badgeY -= 12;
  }
  if (unit.staggerImmunityTimer > 0) {
    ctx.fillStyle = 'rgba(15, 23, 42, 0.82)';
    ctx.fillRect(pos.x - 34, badgeY - 10, 68, 11);
    ctx.fillStyle = '#94a3b8';
    ctx.fillText(`IMMUNE ${unit.staggerImmunityTimer.toFixed(1)}s`, pos.x, badgeY - 1);
  }

  ctx.restore();
}
