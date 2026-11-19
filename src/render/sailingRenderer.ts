import { LOGICAL_HEIGHT, LOGICAL_WIDTH } from '../core/constants';
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

export function renderSeaSailingCanvas(
  ctx: CanvasRenderingContext2D,
  state: RpgCampaignState,
  rpgRegistry: RpgDataRegistry,
  stepInfo: SailingStepOutput,
  tick: number,
  fps: number
): void {
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
  ctx.fillRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);

  // Camera centered on ship, clamped to sea zone bounds
  const camX = clamp(
    Math.round(LOGICAL_WIDTH * 0.5 - state.ship.pos.x),
    LOGICAL_WIDTH - zone.width,
    0
  );
  const camY = clamp(
    Math.round(LOGICAL_HEIGHT * 0.5 - state.ship.pos.y),
    LOGICAL_HEIGHT - zone.height,
    0
  );

  ctx.save();
  ctx.translate(camX, camY);

  // 2. Ocean grid & animated wave crests
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

  // Animated waves
  ctx.strokeStyle = 'rgba(186, 230, 253, 0.22)';
  ctx.lineWidth = 2;
  const waveShift = (tick * 0.8) % 80;
  for (let y = 60; y < zone.height; y += 110) {
    for (let x = 60; x < zone.width; x += 140) {
      const wx = x + waveShift;
      ctx.beginPath();
      ctx.arc(wx, y, 12, Math.PI * 1.15, Math.PI * 1.85);
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

  // 4. Render Islands & Docking Rings
  for (const isl of zone.islands) {
    const completed = state.completedEpisodes.includes(isl.episodeId);
    ctx.save();

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

    // Island sandy coast + inner terrain
    ctx.fillStyle = '#fde047';
    ctx.beginPath();
    ctx.arc(isl.pos.x, isl.pos.y, 42, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = isl.color;
    ctx.beginPath();
    ctx.arc(isl.pos.x, isl.pos.y, 34, 0, Math.PI * 2);
    ctx.fill();

    // Harbor dock pier
    ctx.fillStyle = '#78350f';
    ctx.fillRect(isl.pos.x - 48, isl.pos.y - 6, 16, 12);

    // Island labels & Completion Badge
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'center';
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
      ctx.fillStyle = '#f43f5e';
      ctx.beginPath();
      ctx.arc(obj.pos.x, obj.pos.y, 16, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(obj.pos.x - 8, obj.pos.y - 10, 16, 10);
      ctx.font = 'bold 9px monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#fda4af';
      ctx.fillText('해군함대', obj.pos.x, obj.pos.y - 20);
    } else if (obj.kind === 'SEA_KING') {
      ctx.fillStyle = '#a855f7';
      ctx.beginPath();
      ctx.arc(obj.pos.x, obj.pos.y, 20, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = 'bold 9px monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#e9d5ff';
      ctx.fillText('해왕류', obj.pos.x, obj.pos.y - 24);
    }
    ctx.restore();
  }

  // 6. Render Player Ship (Going Merry vs Thousand Sunny)
  renderPlayerShip(ctx, state, tick);

  ctx.restore();

  // 7. Weather visual overlay (STORM rain / FOG mist)
  if (state.seaWeather === 'STORM') {
    ctx.save();
    ctx.strokeStyle = 'rgba(186, 230, 253, 0.25)';
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 28; i++) {
      const rx = ((i * 73 + tick * 9) % LOGICAL_WIDTH);
      const ry = ((i * 59 + tick * 14) % LOGICAL_HEIGHT);
      ctx.beginPath();
      ctx.moveTo(rx, ry);
      ctx.lineTo(rx - 8, ry + 18);
      ctx.stroke();
    }
    ctx.restore();
  } else if (state.seaWeather === 'FOG') {
    ctx.fillStyle = 'rgba(226, 232, 240, 0.10)';
    ctx.fillRect(0, 0, LOGICAL_WIDTH, LOGICAL_HEIGHT);
  }

  // 8. Top-Left Sea Zone & Ship Status HUD
  const bountyTier = computeBountyTier(state.totalCrewBounty);
  ctx.fillStyle = 'rgba(15, 23, 42, 0.90)';
  ctx.fillRect(10, 10, 325, 76);
  ctx.strokeStyle = '#38bdf8';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(10, 10, 325, 76);

  ctx.font = 'bold 12px monospace';
  ctx.textAlign = 'left';
  ctx.fillStyle = '#fde047';
  ctx.fillText(`⚓ ${zone.name}`, 18, 27);

  ctx.font = '10px monospace';
  ctx.fillStyle = '#e2e8f0';
  ctx.fillText(
    `선박: ${shipDef.name} | 내구도: ${Math.round(state.ship.hullHp)}/${state.ship.maxHullHp}`,
    18,
    43
  );
  ctx.fillStyle = '#38bdf8';
  ctx.fillText(
    `시간: ${state.timeOfDay} | 날씨: ${state.seaWeather} | ${fps} FPS`,
    18,
    58
  );
  ctx.fillStyle = '#f97316';
  ctx.fillText(
    `현상금: ${state.totalCrewBounty.toLocaleString()} B (${bountyTier.rankLabel}) | 포네그리프: ${state.roadPoneglyphCount}/4`,
    18,
    74
  );

  // 9. Top-Right Log Pose Compass HUD (Single-Needle vs New World Triple-Needle)
  renderLogPoseHud(ctx, state, rpgRegistry, tick);

  // 10. Bottom-Left Sea Zone Minimap HUD
  renderSeaMinimapHud(ctx, state, rpgRegistry, roleBonuses.revealsHiddenChests);

  // 11. Interactive Docking / SeaGate / Coup de Burst Prompt Banner
  renderSailingInteractionPrompt(ctx, state, rpgRegistry, stepInfo);
}

function renderPlayerShip(
  ctx: CanvasRenderingContext2D,
  state: RpgCampaignState,
  tick: number
): void {
  const { pos, headingRad, shipId, coupDeBurstActiveTimer } = state.ship;
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
  tick: number
): void {
  const zone = rpgRegistry.seaZones[state.currentZoneId];
  const needles = computeLogPoseNeedles(state, rpgRegistry);
  const w = 230;
  const h = zone.logPoseStyle === 'TRIPLE_NEEDLE_NEW_WORLD' ? 92 : 64;
  const x = LOGICAL_WIDTH - w - 10;
  const y = 10;

  ctx.fillStyle = 'rgba(15, 23, 42, 0.90)';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle =
    zone.logPoseStyle === 'TRIPLE_NEEDLE_NEW_WORLD' ? '#a855f7' : '#38bdf8';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(x, y, w, h);

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
  showHiddenChests: boolean
): void {
  const zone = rpgRegistry.seaZones[state.currentZoneId];
  const mw = 176;
  const mh = 104;
  const mx = 10;
  const my = LOGICAL_HEIGHT - mh - 10;

  ctx.fillStyle = 'rgba(9, 13, 22, 0.88)';
  ctx.fillRect(mx, my, mw, mh);
  ctx.strokeStyle = '#334155';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(mx, my, mw, mh);

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
  stepInfo: SailingStepOutput
): void {
  const cx = LOGICAL_WIDTH * 0.5;
  const y = LOGICAL_HEIGHT - 54;

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
    ctx.fillRect(cx - 200, LOGICAL_HEIGHT - 28, 400, 20);
    ctx.font = '10px monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#cbd5e1';
    ctx.fillText(
      `[WASD/방향키] 자유 항해 | [E/Space] 섬 입항·관문 진입${coupHint}`,
      cx,
      LOGICAL_HEIGHT - 14
    );
  }
}
