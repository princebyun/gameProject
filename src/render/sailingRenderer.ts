import type { AssetLoader } from '../assets/assetLoader';
import { clamp } from '../core/math/vector2';
import {
  computeBountyTier,
  computeCrewRoleBonuses
} from '../core/rpg/crewAndBountyEngine';
import {
  computeLogPoseNeedles,
  type SailingStepOutput
} from '../core/rpg/sailingPhysics';
import { validateSeaGateAccess } from '../core/rpg/seaGateValidator';
import type {
  RpgCampaignState,
  RpgDataRegistry
} from '../core/types/rpgSchemas';
import { resolveBiomeForSeaZone } from '../data/assets/assetManifestRegistry';
import {
  renderWorldMarkerBeacons,
  type WorldMarker
} from '../story/worldMarkerSystem';
import { drawPixelNineSlicePanel } from './ui/pixelNineSliceUi';
import {
  DEFAULT_VIEWPORT_METRICS,
  type ViewportMetrics
} from './viewport/responsiveViewportManager';

interface WakeSample {
  x: number;
  y: number;
  headingRad: number;
  boost: boolean;
}

const shipWakeTrail: WakeSample[] = [];
let lastWakeZoneId = '';
let lastWakeTick = -1;

function updateAndRenderShipWakeTrail(
  ctx: CanvasRenderingContext2D,
  state: RpgCampaignState,
  tick: number
): void {
  if (lastWakeZoneId !== state.currentZoneId || tick < lastWakeTick) {
    shipWakeTrail.length = 0;
    lastWakeZoneId = state.currentZoneId;
  }
  const speed = Math.hypot(state.ship.vel.x, state.ship.vel.y);
  if (tick !== lastWakeTick && tick % 2 === 0 && (speed > 8 || state.ship.coupDeBurstActiveTimer > 0)) {
    shipWakeTrail.push({
      x: state.ship.pos.x,
      y: state.ship.pos.y + 8,
      headingRad: state.ship.headingRad,
      boost: state.ship.coupDeBurstActiveTimer > 0
    });
    if (shipWakeTrail.length > 24) {
      shipWakeTrail.shift();
    }
  }
  lastWakeTick = tick;

  if (shipWakeTrail.length < 2) return;

  ctx.save();
  for (let i = 0; i < shipWakeTrail.length; i++) {
    const s = shipWakeTrail[i];
    const ageRatio = (i + 1) / shipWakeTrail.length; // 0 = oldest, 1 = newest
    const spread = (1 - ageRatio) * 16 + 4;
    const perpX = -Math.sin(s.headingRad);
    const perpY = Math.cos(s.headingRad);
    const sz = Math.max(2, Math.round(ageRatio * 5));

    ctx.globalAlpha = ageRatio * 0.52;
    ctx.fillStyle = s.boost ? '#7dd3fc' : '#e0f2fe';
    // Twin V-shaped pixel foam ribbons fanning behind hull
    ctx.fillRect(Math.round(s.x + perpX * spread - sz * 0.5), Math.round(s.y + perpY * spread - sz * 0.5), sz, sz);
    ctx.fillRect(Math.round(s.x - perpX * spread - sz * 0.5), Math.round(s.y - perpY * spread - sz * 0.5), sz, sz);

    // Center white foam core
    ctx.fillStyle = '#ffffff';
    ctx.globalAlpha = ageRatio * 0.35;
    ctx.fillRect(Math.round(s.x - 2), Math.round(s.y - 2), 4, 4);
  }
  ctx.restore();
}

function renderDriftingCloudShadows(
  ctx: CanvasRenderingContext2D,
  zoneWidth: number,
  zoneHeight: number,
  camX: number,
  camY: number,
  viewW: number,
  viewH: number,
  tick: number,
  isNight: boolean
): void {
  ctx.save();
  ctx.fillStyle = isNight ? 'rgba(2, 6, 23, 0.22)' : 'rgba(7, 18, 42, 0.14)';
  const minX = -camX - 240;
  const maxX = -camX + viewW + 240;
  const minY = -camY - 140;
  const maxY = -camY + viewH + 140;

  for (let i = 0; i < 9; i++) {
    const rawX = (i * 380 + tick * (0.45 + (i % 3) * 0.14)) % (zoneWidth + 420) - 210;
    const rawY = ((i * 257 + 130) % Math.max(400, zoneHeight - 120)) + 60;
    if (rawX < minX || rawX > maxX || rawY < minY || rawY > maxY) continue;
    const w = 130 + (i % 3) * 48;
    const h = 42 + (i % 2) * 18;
    ctx.beginPath();
    ctx.ellipse(rawX, rawY, w * 0.5, h * 0.5, 0, 0, Math.PI * 2);
    ctx.ellipse(rawX + w * 0.24, rawY - 10, w * 0.34, h * 0.38, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

export function renderSeaSailingCanvas(
  ctx: CanvasRenderingContext2D,
  state: RpgCampaignState,
  rpgRegistry: RpgDataRegistry,
  stepInfo: SailingStepOutput,
  tick: number,
  fps: number,
  assets?: AssetLoader,
  viewport: ViewportMetrics = DEFAULT_VIEWPORT_METRICS,
  worldMarkers?: WorldMarker[],
  highlightGoldMarker: boolean = false
): void {
  const viewW = viewport.viewWidth;
  const viewH = viewport.viewHeight;
  const { left: safeL, right: safeR, top: safeT, bottom: safeB } = viewport.safeInsets;
  const zone = rpgRegistry.seaZones[state.currentZoneId];
  const shipDef =
    rpgRegistry.ships[state.ship.shipId] ?? rpgRegistry.ships['going_merry'];
  const roleBonuses = computeCrewRoleBonuses(state, rpgRegistry);

  ctx.imageSmoothingEnabled = false;

  // 1. Ocean background color by Sea Zone & Time-of-Day
  let seaColor = '#0c4a6e';
  if (zone.id === 'grand_line') seaColor = '#1e3a8a';
  else if (zone.id === 'new_world') seaColor = '#311042';

  if (state.timeOfDay === 'NIGHT') {
    seaColor = '#091526';
  } else if (state.timeOfDay === 'EVENING') {
    seaColor = '#3b1d38';
  }

  ctx.fillStyle = seaColor;
  ctx.fillRect(0, 0, viewW, viewH);

  // Camera centered on ship, clamped to sea zone bounds
  const camX = clamp(
    Math.round(viewW * 0.5 - state.ship.pos.x),
    Math.min(0, viewW - zone.width),
    0
  );
  const camY = clamp(
    Math.round(viewH * 0.5 - state.ship.pos.y),
    Math.min(0, viewH - zone.height),
    0
  );

  ctx.save();
  ctx.translate(camX, camY);

  // 2. Biome Animated Sea Tileset (16x16 scaled 2x -> 32x32, 4-frame wave animation)
  if (assets) {
    const seaBiome = resolveBiomeForSeaZone(zone.id, assets.manifestRegistry);
    assets.tilemapRenderer.renderBiomeBackdrop(
      ctx,
      `sea_${zone.id}`,
      zone.width,
      zone.height,
      Math.max(0, -camX - 32),
      Math.max(0, -camY - 32),
      viewW + 64,
      viewH + 64,
      seaBiome,
      assets,
      tick
    );
    if (state.timeOfDay === 'NIGHT') {
      ctx.fillStyle = 'rgba(7, 11, 24, 0.42)';
      ctx.fillRect(-camX, -camY, viewW, viewH);
    } else if (state.timeOfDay === 'EVENING') {
      ctx.fillStyle = 'rgba(88, 28, 135, 0.22)';
      ctx.fillRect(-camX, -camY, viewW, viewH);
    }
  } else {
    // Fallback subtle grid if AssetLoader omitted
    ctx.strokeStyle = 'rgba(125, 211, 252, 0.10)';
    ctx.lineWidth = 1;
    for (let x = 0; x <= zone.width; x += 120) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, zone.height);
      ctx.stroke();
    }
    for (let y = 0; y <= zone.height; y += 120) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(zone.width, y);
      ctx.stroke();
    }
  }

  // 3. Render SeaGate (Reverse Mountain or Red Line Gate)
  if (zone.seaGate) {
    const gate = zone.seaGate;
    const gateCheck = validateSeaGateAccess(state, zone.id, rpgRegistry);

    ctx.save();
    // Outer gate vortex ring
    ctx.strokeStyle = gateCheck.allowed ? '#22c55e' : '#f43f5e';
    ctx.lineWidth = 3;
    ctx.setLineDash([8, 5]);
    ctx.beginPath();
    ctx.arc(gate.pos.x, gate.pos.y, gate.triggerRadiusPx, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // Red Line / Mountain pillars
    ctx.fillStyle = zone.id === 'east_blue' ? '#64748b' : '#991b1b';
    ctx.fillRect(gate.pos.x - 28, gate.pos.y - 52, 56, 30);
    ctx.fillRect(gate.pos.x - 28, gate.pos.y + 22, 56, 30);

    // Canal passage
    ctx.fillStyle = gateCheck.allowed ? '#38bdf8' : '#ef4444';
    ctx.fillRect(gate.pos.x - 28, gate.pos.y - 22, 56, 44);

    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fde047';
    ctx.fillText(`⛩ ${gate.name}`, gate.pos.x, gate.pos.y - 62);
    ctx.font = 'bold 10px monospace';
    ctx.fillStyle = gateCheck.allowed ? '#4ade80' : '#fca5a5';
    ctx.fillText(
      gateCheck.allowed
        ? `[개방 완료 -> ${gate.toZoneId.toUpperCase()}]`
        : `[잠김: 필수 에피소드 ${gateCheck.missingEpisodes.length}개 미완료]`,
      gate.pos.x,
      gate.pos.y + 68
    );
    ctx.restore();
  }

  // 4. Render 2.5D Islands with 3-Depth Ocean Gradient, 2-Layer Breaking White Surf & Docking Rings
  for (const isl of zone.islands) {
    const completed = state.completedEpisodes.includes(isl.episodeId);
    const surfPulse = Math.sin(tick * 0.08 + isl.pos.x * 0.02);
    ctx.save();

    // Depth layer 1: Deep-to-mid turquoise coastal reef shelf
    ctx.fillStyle = 'rgba(14, 165, 233, 0.22)';
    ctx.beginPath();
    ctx.arc(isl.pos.x, isl.pos.y + 3, 66, 0, Math.PI * 2);
    ctx.fill();

    // Depth layer 2: Shallow emerald/turquoise coastal water
    ctx.fillStyle = 'rgba(56, 189, 248, 0.34)';
    ctx.beginPath();
    ctx.arc(isl.pos.x, isl.pos.y + 2, 54, 0, Math.PI * 2);
    ctx.fill();

    // Animated 2-layer breaking white pixel surf foam
    ctx.strokeStyle = 'rgba(224, 242, 254, 0.78)';
    ctx.lineWidth = 2.5;
    ctx.setLineDash([7, 5]);
    ctx.beginPath();
    ctx.arc(isl.pos.x, isl.pos.y, 47 + surfPulse * 2.4, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.65)';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 6]);
    ctx.beginPath();
    ctx.arc(isl.pos.x, isl.pos.y, 43.5 - surfPulse * 1.4, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // Docking zone dashed circle
    ctx.strokeStyle = completed
      ? '#4ade80'
      : isl.requiredForNextZone
        ? '#facc15'
        : '#38bdf8';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.arc(isl.pos.x, isl.pos.y, isl.dockingRadiusPx, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // Island drop shadow in water + sandy beach
    ctx.fillStyle = 'rgba(7, 15, 32, 0.42)';
    ctx.beginPath();
    ctx.arc(isl.pos.x + 2, isl.pos.y + 6, 42, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#fde68a';
    ctx.beginPath();
    ctx.arc(isl.pos.x, isl.pos.y, 42, 0, Math.PI * 2);
    ctx.fill();

    // 2.5D elevated island cliff front wall + top terrain cap
    ctx.fillStyle = '#573619';
    ctx.beginPath();
    ctx.arc(isl.pos.x, isl.pos.y + 5, 34, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = isl.color;
    ctx.beginPath();
    ctx.arc(isl.pos.x, isl.pos.y - 1, 34, 0, Math.PI * 2);
    ctx.fill();

    // Crisp sunlit top highlight & pixel landmarks (trees / roofs)
    ctx.fillStyle = 'rgba(255, 255, 255, 0.16)';
    ctx.beginPath();
    ctx.arc(isl.pos.x - 6, isl.pos.y - 7, 18, 0, Math.PI * 2);
    ctx.fill();

    // Mini 2.5D pixel town/tree silhouette
    ctx.fillStyle = '#78350f';
    ctx.fillRect(isl.pos.x - 10, isl.pos.y - 8, 12, 10);
    ctx.fillStyle = '#dc2626';
    ctx.fillRect(isl.pos.x - 12, isl.pos.y - 12, 16, 5);
    ctx.fillStyle = '#15803d';
    ctx.fillRect(isl.pos.x + 8, isl.pos.y - 14, 10, 9);
    ctx.fillStyle = '#78350f';
    ctx.fillRect(isl.pos.x + 12, isl.pos.y - 5, 3, 6);

    // Harbor wooden dock pier with posts
    ctx.fillStyle = '#451a03';
    ctx.fillRect(isl.pos.x - 50, isl.pos.y - 5, 18, 13);
    ctx.fillStyle = '#92400e';
    ctx.fillRect(isl.pos.x - 49, isl.pos.y - 6, 16, 11);
    ctx.fillStyle = '#facc15';
    ctx.fillRect(isl.pos.x - 49, isl.pos.y - 6, 2, 2);
    ctx.fillRect(isl.pos.x - 49, isl.pos.y + 3, 2, 2);

    // Island labels & Completion Badge
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#090d16';
    ctx.fillText(isl.name, isl.pos.x + 1, isl.pos.y - 51);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(isl.name, isl.pos.x, isl.pos.y - 52);

    ctx.font = 'bold 10px monospace';
    if (completed) {
      ctx.fillStyle = '#4ade80';
      ctx.fillText('★ EPISODE CLEAR!', isl.pos.x, isl.pos.y + 58);
    } else if (isl.requiredForNextZone) {
      ctx.fillStyle = '#fde047';
      ctx.fillText('● [필수 에피소드 - 입항 가능]', isl.pos.x, isl.pos.y + 58);
    } else if (isl.playableInVerticalSlice) {
      ctx.fillStyle = '#38bdf8';
      ctx.fillText('◆ [최신장 에피소드 - 입항 가능]', isl.pos.x, isl.pos.y + 58);
    } else {
      ctx.fillStyle = '#94a3b8';
      ctx.fillText('○ [자유 항해 해역 거점]', isl.pos.x, isl.pos.y + 58);
    }
    ctx.restore();
  }

  // 5. Dynamic Sea Objects (Chests, Merchant Ships, Marine Patrols, Sea Kings)
  const seaObjects = state.seaObjectsByZone[zone.id] ?? [];
  for (const obj of seaObjects) {
    if (obj.collectedOrDefeated) continue;
    if (obj.hiddenByDefault && !roleBonuses.revealsHiddenChests) continue;

    ctx.save();
    if (obj.kind === 'TREASURE_CHEST') {
      ctx.fillStyle = '#f59e0b';
      ctx.fillRect(obj.pos.x - 10, obj.pos.y - 8, 20, 16);
      ctx.strokeStyle = '#fde047';
      ctx.lineWidth = 2;
      ctx.strokeRect(obj.pos.x - 10, obj.pos.y - 8, 20, 16);
      ctx.font = 'bold 9px monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#fde047';
      ctx.fillText('보물상자', obj.pos.x, obj.pos.y - 12);
    } else if (obj.kind === 'MERCHANT_SHIP') {
      ctx.fillStyle = '#38bdf8';
      ctx.beginPath();
      ctx.arc(obj.pos.x, obj.pos.y, 14, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = 'bold 9px monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#bae6fd';
      ctx.fillText('보급선', obj.pos.x, obj.pos.y - 18);
    } else if (obj.kind === 'MARINE_PATROL') {
      const shipSheet = assets?.getOrCreateShipSpriteSheet('marine_warship');
      if (shipSheet?.entry && shipSheet.sheet) {
        const clip = shipSheet.entry.animations.MOVE;
        const fr = Math.floor((tick / 60) * clip.fps) % Math.max(1, clip.frames);
        ctx.drawImage(
          shipSheet.sheet,
          fr * shipSheet.sheetFrameWidth,
          clip.row * shipSheet.sheetFrameHeight,
          shipSheet.sheetFrameWidth,
          shipSheet.sheetFrameHeight,
          Math.round(obj.pos.x - 24),
          Math.round(obj.pos.y - 24),
          48,
          48
        );
      } else {
        ctx.fillStyle = '#f43f5e';
        ctx.beginPath();
        ctx.arc(obj.pos.x, obj.pos.y, 16, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.font = 'bold 9px monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#fda4af';
      ctx.fillText('해군함대', obj.pos.x, obj.pos.y - 22);
    } else if (obj.kind === 'SEA_KING') {
      const skSheet = assets?.getOrCreateShipSpriteSheet('sea_king');
      if (skSheet?.entry && skSheet.sheet) {
        const clip = skSheet.entry.animations.IDLE;
        const fr = Math.floor((tick / 60) * clip.fps) % Math.max(1, clip.frames);
        ctx.drawImage(
          skSheet.sheet,
          fr * skSheet.sheetFrameWidth,
          clip.row * skSheet.sheetFrameHeight,
          skSheet.sheetFrameWidth,
          skSheet.sheetFrameHeight,
          Math.round(obj.pos.x - 30),
          Math.round(obj.pos.y - 30),
          60,
          60
        );
      } else {
        ctx.fillStyle = '#a855f7';
        ctx.beginPath();
        ctx.arc(obj.pos.x, obj.pos.y, 20, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.font = 'bold 9px monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#e9d5ff';
      ctx.fillText('해왕류', obj.pos.x, obj.pos.y - 26);
    }
    ctx.restore();
  }

  // 5.5 Render GTA-style World Marker Beacons (MAIN Gold / SIDE Blue / ACTIVITY Silver-Red)
  if (worldMarkers && worldMarkers.length > 0) {
    renderWorldMarkerBeacons(ctx, worldMarkers, tick, highlightGoldMarker);
  }

  // 5.8 Ship White Foam Wake Trail (24-sample ribbon fanning behind player ship)
  updateAndRenderShipWakeTrail(ctx, state, tick);

  // 6. Render Player Ship (Going Merry vs Thousand Sunny animated pixel sprite sheet)
  renderPlayerShip(ctx, state, tick, assets);

  // 6.5 Drifting translucent cloud shadows sweeping slowly across the sea surface
  renderDriftingCloudShadows(
    ctx,
    zone.width,
    zone.height,
    camX,
    camY,
    viewW,
    viewH,
    tick,
    state.timeOfDay === 'NIGHT'
  );

  ctx.restore();

  // 7. Weather visual overlay (STORM rain / FOG mist)
  if (state.seaWeather === 'STORM') {
    ctx.save();
    ctx.strokeStyle = 'rgba(186, 230, 253, 0.25)';
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 28; i++) {
      const rx = (i * 73 + tick * 9) % viewW;
      const ry = (i * 59 + tick * 14) % viewH;
      ctx.beginPath();
      ctx.moveTo(rx, ry);
      ctx.lineTo(rx - 8, ry + 18);
      ctx.stroke();
    }
    ctx.restore();
  } else if (state.seaWeather === 'FOG') {
    ctx.fillStyle = 'rgba(226, 232, 240, 0.10)';
    ctx.fillRect(0, 0, viewW, viewH);
  }

  // 8. Top-Left Sea Zone & Ship Status HUD (9-Slice Pirate-Wood RPG Frame, Safe Area compliant)
  const hudX = 10 + safeL;
  const hudY = 10 + safeT;
  const bountyTier = computeBountyTier(state.totalCrewBounty);
  drawPixelNineSlicePanel(ctx, hudX, hudY, 330, 78, 'pirate_wood');

  ctx.font = 'bold 12px monospace';
  ctx.textAlign = 'left';
  ctx.fillStyle = '#fde047';
  ctx.fillText(`⚓ ${zone.name}`, hudX + 10, hudY + 19);

  ctx.font = '10px monospace';
  ctx.fillStyle = '#e2e8f0';
  ctx.fillText(
    `선박: ${shipDef.name} | 내구도: ${Math.round(state.ship.hullHp)}/${state.ship.maxHullHp}`,
    hudX + 10,
    hudY + 35
  );
  ctx.fillStyle = '#38bdf8';
  ctx.fillText(
    `시간: ${state.timeOfDay} | 날씨: ${state.seaWeather} | ${fps} FPS`,
    hudX + 10,
    hudY + 50
  );
  ctx.fillStyle = '#fb923c';
  ctx.fillText(
    `현상금: ${state.totalCrewBounty.toLocaleString()} B (${bountyTier.rankLabel}) | 포네그리프: ${state.roadPoneglyphCount}/4`,
    hudX + 10,
    hudY + 66
  );

  // 9. Top-Right Log Pose Compass HUD (Single-Needle vs New World Triple-Needle)
  renderLogPoseHud(ctx, state, rpgRegistry, tick, viewW, safeR, safeT);

  // 10. Bottom-Left Sea Zone Minimap HUD
  renderSeaMinimapHud(ctx, state, rpgRegistry, roleBonuses.revealsHiddenChests, viewH, safeL, safeB);

  // 11. Interactive Docking / SeaGate / Coup de Burst Prompt Banner
  renderSailingInteractionPrompt(ctx, state, rpgRegistry, stepInfo, viewW, viewH, safeB);
}

function renderPlayerShip(
  ctx: CanvasRenderingContext2D,
  state: RpgCampaignState,
  tick: number,
  assets?: AssetLoader
): void {
  const { pos, headingRad, shipId, coupDeBurstActiveTimer } = state.ship;
  if (assets) {
    const { entry, sheet, sheetFrameWidth, sheetFrameHeight } =
      assets.getOrCreateShipSpriteSheet(shipId);
    if (entry && sheet) {
      const animState =
        coupDeBurstActiveTimer > 0
          ? 'DODGE'
          : Math.hypot(state.ship.vel.x, state.ship.vel.y) > 12
            ? 'MOVE'
            : 'IDLE';
      const clip = entry.animations[animState];
      const frame = Math.floor((tick / 60) * clip.fps) % Math.max(1, clip.frames);
      const facingX = Math.cos(headingRad) < -0.05 ? -1 : 1;
      const drawW = Math.round(entry.frameWidth * 1.15);
      const drawH = Math.round(entry.frameHeight * 1.15);

      ctx.save();
      ctx.imageSmoothingEnabled = false;
      ctx.translate(Math.round(pos.x), Math.round(pos.y));
      ctx.scale(facingX, 1);
      ctx.drawImage(
        sheet,
        frame * sheetFrameWidth,
        clip.row * sheetFrameHeight,
        sheetFrameWidth,
        sheetFrameHeight,
        Math.round(-drawW * entry.anchor.x),
        Math.round(-drawH * entry.anchor.y),
        drawW,
        drawH
      );
      ctx.restore();
      return;
    }
  }
  ctx.save();
  ctx.translate(Math.round(pos.x), Math.round(pos.y));
  ctx.rotate(headingRad);

  // Coup de Burst cola jet flame
  if (coupDeBurstActiveTimer > 0) {
    ctx.fillStyle = '#38bdf8';
    ctx.fillRect(-38, -8, 20, 16);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(-32, -4, 14, 8);
  } else {
    // Normal wake trail
    ctx.fillStyle = 'rgba(224, 242, 254, 0.35)';
    ctx.fillRect(-26, -6, 10, 12);
  }

  // Ship hull
  const isSunny = shipId === 'thousand_sunny';
  ctx.fillStyle = isSunny ? '#b91c1c' : '#92400e';
  ctx.beginPath();
  ctx.moveTo(22, 0);
  ctx.lineTo(10, 13);
  ctx.lineTo(-18, 11);
  ctx.lineTo(-18, -11);
  ctx.lineTo(10, -13);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#fde047';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Main sail with Straw Hat Jolly Roger cross
  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(-4, -14, 10, 28);
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(-1, -4, 4, 8);

  // Figurehead (Going Merry white sheep vs Thousand Sunny golden lion mane)
  if (isSunny) {
    ctx.fillStyle = '#facc15';
    ctx.beginPath();
    ctx.arc(20, 0, 7 + Math.sin(tick * 0.2) * 0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ea580c';
    ctx.beginPath();
    ctx.arc(20, 0, 4, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(20, 0, 5, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}

function renderLogPoseHud(
  ctx: CanvasRenderingContext2D,
  state: RpgCampaignState,
  rpgRegistry: RpgDataRegistry,
  tick: number,
  viewW: number,
  safeR: number,
  safeT: number
): void {
  const zone = rpgRegistry.seaZones[state.currentZoneId];
  const needles = computeLogPoseNeedles(state, rpgRegistry);
  const w = 230;
  const h = zone.logPoseStyle === 'TRIPLE_NEEDLE_NEW_WORLD' ? 92 : 64;
  const x = viewW - w - 10 - safeR;
  const y = 10 + safeT;

  drawPixelNineSlicePanel(
    ctx,
    x,
    y,
    w,
    h,
    zone.logPoseStyle === 'TRIPLE_NEEDLE_NEW_WORLD' ? 'gold_ribbon' : 'navy_hud',
    zone.logPoseStyle === 'TRIPLE_NEEDLE_NEW_WORLD' ? '#a855f7' : undefined
  );

  ctx.font = 'bold 10px monospace';
  ctx.textAlign = 'left';
  ctx.fillStyle = '#fde047';
  const title =
    zone.logPoseStyle === 'TRIPLE_NEEDLE_NEW_WORLD'
      ? '🧭 신세계 삼침 로그 포스 (3 Needles)'
      : '🧭 그랜드 라인 기록지침 (Log Pose)';
  ctx.fillText(title, x + 8, y + 15);

  needles.forEach((nd, idx) => {
    const rowY = y + 32 + idx * 20;
    const cx = x + 18;
    const cy = rowY - 3;

    // Compass dial circle
    ctx.strokeStyle = '#64748b';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, 8, 0, Math.PI * 2);
    ctx.stroke();

    // Needle with danger jitter in New World
    const jitter =
      zone.logPoseStyle === 'TRIPLE_NEEDLE_NEW_WORLD'
        ? Math.sin(tick * 0.25 * nd.dangerLevel) * 0.14
        : 0;
    const ang = nd.angleRad + jitter;
    ctx.strokeStyle = nd.completed
      ? '#4ade80'
      : nd.targetKind === 'SEA_GATE'
        ? '#38bdf8'
        : '#f43f5e';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(ang) * 7, cy + Math.sin(ang) * 7);
    ctx.stroke();

    ctx.font = '9px monospace';
    ctx.fillStyle = nd.completed ? '#4ade80' : '#f8fafc';
    const shortName =
      nd.targetName.length > 15 ? nd.targetName.slice(0, 15) : nd.targetName;
    const badge = nd.completed ? '[완료]' : `${nd.distancePx}m`;
    ctx.fillText(`${shortName} (${badge})`, x + 32, rowY);
  });
}

function renderSeaMinimapHud(
  ctx: CanvasRenderingContext2D,
  state: RpgCampaignState,
  rpgRegistry: RpgDataRegistry,
  showHiddenChests: boolean,
  viewH: number,
  safeL: number,
  safeB: number
): void {
  const zone = rpgRegistry.seaZones[state.currentZoneId];
  const mw = 176;
  const mh = 104;
  const mx = 10 + safeL;
  const my = viewH - mh - 10 - safeB;

  drawPixelNineSlicePanel(ctx, mx, my, mw, mh, 'pirate_wood');

  const scaleX = (mw - 12) / zone.width;
  const scaleY = (mh - 20) / zone.height;

  ctx.font = 'bold 9px monospace';
  ctx.textAlign = 'left';
  ctx.fillStyle = '#94a3b8';
  ctx.fillText(`MINIMAP: ${zone.id.toUpperCase()}`, mx + 6, my + 11);

  // Islands on minimap
  for (const isl of zone.islands) {
    const ix = mx + 6 + isl.pos.x * scaleX;
    const iy = my + 16 + isl.pos.y * scaleY;
    const done = state.completedEpisodes.includes(isl.episodeId);
    ctx.fillStyle = done
      ? '#4ade80'
      : isl.requiredForNextZone
        ? '#facc15'
        : '#38bdf8';
    ctx.beginPath();
    ctx.arc(ix, iy, 4.5, 0, Math.PI * 2);
    ctx.fill();
  }

  // SeaGate on minimap
  if (zone.seaGate) {
    const gx = mx + 6 + zone.seaGate.pos.x * scaleX;
    const gy = my + 16 + zone.seaGate.pos.y * scaleY;
    ctx.fillStyle = '#f43f5e';
    ctx.fillRect(gx - 4, gy - 4, 8, 8);
  }

  // Dynamic objects on minimap
  for (const obj of state.seaObjectsByZone[zone.id] ?? []) {
    if (obj.collectedOrDefeated) continue;
    if (obj.hiddenByDefault && !showHiddenChests) continue;
    const ox = mx + 6 + obj.pos.x * scaleX;
    const oy = my + 16 + obj.pos.y * scaleY;
    ctx.fillStyle =
      obj.kind === 'TREASURE_CHEST' ? '#fde047' : '#fb7185';
    ctx.fillRect(ox - 2, oy - 2, 4, 4);
  }

  // Player Ship dot on minimap
  const sx = mx + 6 + state.ship.pos.x * scaleX;
  const sy = my + 16 + state.ship.pos.y * scaleY;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(sx, sy, 3.5, 0, Math.PI * 2);
  ctx.fill();
}

function renderSailingInteractionPrompt(
  ctx: CanvasRenderingContext2D,
  state: RpgCampaignState,
  rpgRegistry: RpgDataRegistry,
  stepInfo: SailingStepOutput,
  viewW: number,
  viewH: number,
  safeB: number
): void {
  const cx = viewW * 0.5;
  const y = viewH - 54 - safeB;

  if (stepInfo.nearbyIsland) {
    const isl = stepInfo.nearbyIsland;
    const done = state.completedEpisodes.includes(isl.episodeId);
    ctx.fillStyle = 'rgba(15, 23, 42, 0.94)';
    ctx.fillRect(cx - 210, y, 420, 42);
    ctx.strokeStyle = done ? '#4ade80' : '#facc15';
    ctx.lineWidth = 2;
    ctx.strokeRect(cx - 210, y, 420, 42);

    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fde047';
    ctx.fillText(
      isl.playableInVerticalSlice
        ? `⚓ [E / Space / 입항 버튼] "${isl.name}" 에피소드 페이지 입항`
        : `⚓ "${isl.name}" (자유 항해 해역 거점 — 주변 보물/해상전 탐색)`,
      cx,
      y + 17
    );
    ctx.font = '10px monospace';
    ctx.fillStyle = '#cbd5e1';
    ctx.fillText(isl.summary, cx, y + 34);
  } else if (stepInfo.nearbySeaGate) {
    const gate = stepInfo.nearbySeaGate;
    ctx.fillStyle = 'rgba(15, 23, 42, 0.94)';
    ctx.fillRect(cx - 210, y, 420, 42);
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2;
    ctx.strokeRect(cx - 210, y, 420, 42);

    ctx.font = 'bold 12px monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#38bdf8';
    ctx.fillText(
      `⛩ [E / Space / 관문 버튼] "${gate.name}" 돌파 -> ${gate.toZoneId.toUpperCase()}`,
      cx,
      y + 17
    );
    ctx.font = '10px monospace';
    ctx.fillStyle = '#cbd5e1';
    ctx.fillText(gate.description, cx, y + 34);
  } else {
    // Controls hint bar
    const shipDef = rpgRegistry.ships[state.ship.shipId];
    const coupHint = shipDef?.hasCoupDeBurst
      ? state.ship.coupDeBurstCooldownTimer > 0
        ? ` | [Shift] 쿠 드 버스트 (${state.ship.coupDeBurstCooldownTimer.toFixed(1)}s)`
        : ' | [Shift] 쿠 드 버스트 READY!'
      : '';
    ctx.fillStyle = 'rgba(15, 23, 42, 0.80)';
    ctx.fillRect(cx - 200, viewH - 28 - safeB, 400, 20);
    ctx.font = '10px monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#cbd5e1';
    ctx.fillText(
      `[WASD/방향키] 자유 항해 | [E/Space] 섬 입항·관문 진입${coupHint}`,
      cx,
      viewH - 14 - safeB
    );
  }
}
