import type { AssetLoader } from '../assets/assetLoader';
import { FIXED_DT } from '../core/constants';
import { clamp, lerpVec, type Vec2 } from '../core/math/vector2';
import type { GameDataRegistry } from '../core/types/dataSchemas';
import type { BattleWorldState, UnitRuntimeState } from '../core/types/battleState';
import { resolveBiomeForArena } from '../data/assets/assetManifestRegistry';
import type { RenderAccessibilitySettings } from './canvasRenderer';
import { sharedBattleParticlePool } from './vfx/particlePool';
import { sharedBattlePixelVfxEngine } from './vfx/pixelVfxEngine';
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
  sharedBattlePixelVfxEngine.syncWithWorld(world, settings.flashEffectEnabled, FIXED_DT);
  syncBattleParticlePoolWithWorld(world);
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

  // 2.8 Persistent Ground Decals (Scorch marks, Impact cracks, Frost rings)
  sharedBattlePixelVfxEngine.renderGroundDecals(ctx);

  // 3. Active Melee Arcs (2–3 frame multi-tone Crescent Slash Smear + Armament/Conqueror lightning)
  for (const arc of world.meleeArcs) {
    sharedBattlePixelVfxEngine.renderCrescentSlashSmear(ctx, arc, world.tick);
  }

  // 4. Active Beams (3-Layer Pixel Beam: Outer Aura + Element Mid + Pure White Core + Muzzle Ring)
  for (const beam of world.beams) {
    const elemMeta = registry.elements.elements.find((e) => e.id === beam.element);
    const beamColor = elemMeta?.color ?? '#38bdf8';
    sharedBattlePixelVfxEngine.renderMultiLayerPixelBeam(
      ctx,
      beam,
      beamColor,
      world.tick
    );
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

    if (proj.reflected) {
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(p.x, p.y - heightOffset, proj.radiusPx + 5 + Math.sin(world.tick * 0.5) * 2, 0, Math.PI * 2);
      ctx.stroke();
    }
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

  // 6.5 Phase 16: Active 2:2 Bond Tag Combo Guest Ally Sprite (uses EXTERNAL_PNG if available, else baked sheet)
  if (world.activeBondCombo) {
    renderBondComboGuestAlly(ctx, world, registry, assets);
  }

  // 7. Active Clash Sparks (Beam Clash Rotating Energy Orb, Melee vs Beam Guard, Conqueror Sky Split)
  for (const bc of world.beamClashes) {
    sharedBattlePixelVfxEngine.renderBeamClashOrb(ctx, bc, world.tick);
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
    sharedBattlePixelVfxEngine.renderMeleeClashEffect(ctx, mc, world.tick);
  }

  // 8. Multi-Layer VFX Events & Pooled Pixel Sparks (300-slot ParticlePool)
  for (const vfx of world.vfxEvents) {
    sharedBattlePixelVfxEngine.renderEnhancedVfxEvent(ctx, vfx, world.tick);
  }
  sharedBattlePixelVfxEngine.renderSparks(ctx);
  sharedBattleParticlePool.render(ctx);

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

  // 10. 2–3 Frame High-Contrast B&W Impact Frame (strictly bypassed when flashEffectEnabled === false)
  sharedBattlePixelVfxEngine.renderImpactFrameOverlay(
    ctx,
    viewW,
    viewH,
    settings.flashEffectEnabled
  );

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

  // Phase 16: Armament Just Guard Shield Arc & Parry Flash
  if (unit.guardHeld) {
    const aimAngle = Math.atan2(unit.aimDir.y, unit.aimDir.x);
    const inParryWindow =
      unit.guardStartTick >= 0 && world.tick - unit.guardStartTick <= 10;
    const armLv = unit.haki?.armament ?? 0;
    ctx.save();
    ctx.strokeStyle = inParryWindow
      ? '#fde047'
      : armLv >= 1
        ? '#7c3aed'
        : '#94a3b8';
    ctx.lineWidth = inParryWindow ? 5 : 3.5;
    ctx.beginPath();
    ctx.arc(
      pos.x,
      pos.y,
      unit.radiusPx + 9,
      aimAngle - Math.PI * 0.45,
      aimAngle + Math.PI * 0.45
    );
    ctx.stroke();
    if (armLv >= 1) {
      ctx.strokeStyle = '#090d16';
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      ctx.arc(
        pos.x,
        pos.y,
        unit.radiusPx + 12,
        aimAngle - Math.PI * 0.38,
        aimAngle + Math.PI * 0.38
      );
      ctx.stroke();
    }
    ctx.restore();
  }

  // Phase 16: Spinning Stun Stars on PARRY_STUNNED / GUARD_BREAK units
  if (unit.parryStunTicks > 0 || unit.guardBreakTicks > 0) {
    ctx.save();
    const starY = pos.y - unit.radiusPx * unit.visualScale - 24;
    for (let s = 0; s < 3; s++) {
      const ang = world.tick * 0.22 + (s * Math.PI * 2) / 3;
      const sx = Math.round(pos.x + Math.cos(ang) * 16);
      const sy = Math.round(starY + Math.sin(ang) * 5);
      ctx.fillStyle = unit.parryStunTicks > 0 ? '#facc15' : '#ef4444';
      ctx.fillRect(sx - 2, sy - 2, 4, 4);
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(sx - 1, sy - 1, 2, 2);
    }
    ctx.restore();
  }

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
    const {
      entry: sheetEntry,
      sheet,
      sheetFrameWidth,
      sheetFrameHeight,
      meta: atlasMeta
    } = assets.getOrCreateUnitSpriteSheet(
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
        const size = Math.round(44 * unit.visualScale);
        const halfSrcH = Math.floor(sprite.height * 0.5);
        ctx.save();
        ctx.translate(Math.round(pos.x), Math.round(pos.y));
        if (animRes.visual.facingX < 0) ctx.scale(-1, 1);
        const splitGap = Math.round(Math.sin((unit.baraSplitTimer / 0.48) * Math.PI) * 14);
        ctx.drawImage(sprite, 0, 0, sprite.width, halfSrcH, -size * 0.5, -size * 0.5 - splitGap, size, size * 0.5);
        ctx.drawImage(sprite, 0, halfSrcH, sprite.width, sprite.height - halfSrcH, -size * 0.5, splitGap * 0.5, size, size * 0.5);
        ctx.restore();
      }
    } else if (sheet) {
      // Normalize draw scale so high-res 48/64/112px baked sheets & external atlases map cleanly onto entityScale * visualScale
      const targetPixelHeight = 52 * unit.entityScale * unit.visualScale;
      const drawScale = Math.max(0.85, targetPixelHeight / sheetEntry.frameHeight);
      const footPos = {
        x: pos.x,
        y: pos.y + Math.round(unit.radiusPx * 0.72)
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
          tick: world.tick,
          sheetFrameWidth,
          sheetFrameHeight,
          atlasMeta,
          animState: animRes.step.state
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
  if (unit.parryStunTicks > 0) {
    ctx.fillStyle = 'rgba(120, 53, 15, 0.92)';
    ctx.fillRect(pos.x - 42, badgeY - 10, 84, 11);
    ctx.fillStyle = '#fde047';
    ctx.fillText(`PARRY STUN ×1.25`, pos.x, badgeY - 1);
    badgeY -= 12;
  } else if (unit.guardBreakTicks > 0) {
    ctx.fillStyle = 'rgba(127, 29, 29, 0.92)';
    ctx.fillRect(pos.x - 40, badgeY - 10, 80, 11);
    ctx.fillStyle = '#fca5a5';
    ctx.fillText(`GUARD BREAK`, pos.x, badgeY - 1);
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

let lastParticleSyncTick = -1;
const seenParryMiniIds = new Set<string>();
let lastBondImpactId: string | null = null;

function syncBattleParticlePoolWithWorld(world: BattleWorldState): void {
  if (world.tick < lastParticleSyncTick) {
    sharedBattleParticlePool.reset();
    seenParryMiniIds.clear();
    lastBondImpactId = null;
  }
  if (world.tick === lastParticleSyncTick) {
    return;
  }
  lastParticleSyncTick = world.tick;
  sharedBattleParticlePool.step(FIXED_DT);

  if (seenParryMiniIds.size > 64) {
    seenParryMiniIds.clear();
  }
  for (const ev of world.parryMiniEvents) {
    if (seenParryMiniIds.has(ev.id)) continue;
    seenParryMiniIds.add(ev.id);
    if (ev.kind === 'PROJECTILE_REFLECT') {
      sharedBattleParticlePool.spawnRadialBurst(
        ev.pos.x,
        ev.pos.y,
        14,
        175,
        '#38bdf8',
        '#ffffff',
        'REFLECT_RING',
        world.tick
      );
    } else {
      sharedBattleParticlePool.spawnRadialBurst(
        ev.pos.x,
        ev.pos.y,
        ev.armamentEnhanced ? 20 : 14,
        190,
        ev.armamentEnhanced ? '#7c3aed' : '#facc15',
        '#fde047',
        ev.armamentEnhanced ? 'HAKI_ARC' : 'SPARK',
        world.tick
      );
    }
  }

  if (
    world.activeBondCombo &&
    world.activeBondCombo.impactExecuted &&
    lastBondImpactId !== world.activeBondCombo.id
  ) {
    lastBondImpactId = world.activeBondCombo.id;
    const bc = world.activeBondCombo;
    sharedBattleParticlePool.spawnRadialBurst(
      bc.partnerTargetPos.x,
      bc.partnerTargetPos.y,
      26,
      240,
      bc.themeColors[0],
      bc.themeColors[1],
      'BOND_STAR',
      world.tick
    );
  }
}

function renderBondComboGuestAlly(
  ctx: CanvasRenderingContext2D,
  world: BattleWorldState,
  registry: GameDataRegistry,
  assets: AssetLoader
): void {
  const bc = world.activeBondCombo;
  if (!bc) return;
  const partnerDef = registry.units[bc.partnerSpeciesId];
  if (!partnerDef) return;

  const {
    entry: sheetEntry,
    sheet,
    sheetFrameWidth,
    sheetFrameHeight,
    meta: atlasMeta
  } = assets.getOrCreateUnitSpriteSheet(partnerDef, null, null);
  if (!sheet) return;

  ctx.save();
  // Golden partner arrival ring
  ctx.strokeStyle = bc.themeColors[0];
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(bc.partnerPos.x, bc.partnerPos.y, 26, 0, Math.PI * 2);
  ctx.stroke();

  const targetPixelHeight = 56;
  const drawScale = Math.max(0.85, targetPixelHeight / sheetEntry.frameHeight);
  const clip = sheetEntry.animations[bc.partnerAnimState] ?? sheetEntry.animations.ATTACK_MELEE;
  const frameIdx = Math.floor(bc.elapsedTicks / 4) % Math.max(1, clip.frames);

  const afterimages = [
    {
      x: bc.partnerPos.x - bc.partnerFacingX * 16,
      y: bc.partnerPos.y + 12,
      facingX: bc.partnerFacingX,
      row: clip.row,
      frame: frameIdx,
      sheetKey: sheetEntry.key,
      color: bc.themeColors[0],
      remainingSec: 0.14,
      totalSec: 0.25
    },
    {
      x: bc.partnerPos.x - bc.partnerFacingX * 32,
      y: bc.partnerPos.y + 10,
      facingX: bc.partnerFacingX,
      row: clip.row,
      frame: frameIdx,
      sheetKey: sheetEntry.key,
      color: bc.themeColors[1],
      remainingSec: 0.08,
      totalSec: 0.25
    }
  ];

  assets.spriteController.drawAnimatedUnitFrame(
    ctx,
    sheet,
    sheetEntry,
    clip.row,
    frameIdx,
    { x: bc.partnerPos.x, y: bc.partnerPos.y + 16 },
    bc.partnerFacingX,
    drawScale,
    {
      hitFlashActive: false,
      flashEffectEnabled: true,
      hasArmamentActive: true,
      logiaDispersionTimer: 0,
      elementColor: bc.themeColors[0],
      afterimages,
      tick: world.tick,
      sheetFrameWidth,
      sheetFrameHeight,
      atlasMeta,
      animState: bc.partnerAnimState
    }
  );

  ctx.font = 'bold 10px monospace';
  ctx.textAlign = 'center';
  ctx.fillStyle = bc.themeColors[0];
  ctx.fillText(`★ ${bc.partnerName}`, Math.round(bc.partnerPos.x), Math.round(bc.partnerPos.y - 30));
  ctx.restore();
}
