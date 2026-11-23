import type { AssetLoader } from '../../assets/assetLoader';
import { resolveActiveShipId } from '../../core/rpg/seaCurrentPhysics';
import { validateSeaGateAccess } from '../../core/rpg/seaGateValidator';
import type { RpgCampaignState, RpgDataRegistry } from '../../core/types/rpgSchemas';
import {
  isCircleInBounds,
  type ViewportWorldBounds
} from '../viewport/frustumCulling';

export function renderSeaGateAndIslands(
  ctx: CanvasRenderingContext2D,
  state: RpgCampaignState,
  rpgRegistry: RpgDataRegistry,
  zone: RpgDataRegistry['seaZones'][RpgCampaignState['currentZoneId']],
  visibleBounds?: ViewportWorldBounds
): void {
  if (zone.seaGate) {
    const gate = zone.seaGate;
    const gx = Math.round(gate.pos.x);
    const gy = Math.round(gate.pos.y);
    if (isCircleInBounds(visibleBounds, gx, gy, gate.triggerRadiusPx + 70)) {
      const gateCheck = validateSeaGateAccess(state, zone.id, rpgRegistry);

      ctx.save();
      ctx.strokeStyle = gateCheck.allowed ? '#22c55e' : '#f43f5e';
      ctx.lineWidth = 3;
      ctx.setLineDash([8, 5]);
      ctx.beginPath();
      ctx.arc(gx, gy, gate.triggerRadiusPx, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = zone.id === 'east_blue' ? '#64748b' : '#991b1b';
      ctx.fillRect(gx - 28, gy - 52, 56, 30);
      ctx.fillRect(gx - 28, gy + 22, 56, 30);

      ctx.fillStyle = gateCheck.allowed ? '#38bdf8' : '#ef4444';
      ctx.fillRect(gx - 28, gy - 22, 56, 44);

      ctx.font = 'bold 11px monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#fde047';
      ctx.fillText(`⛩ ${gate.name}`, gx, gy - 62);
      ctx.font = 'bold 10px monospace';
      ctx.fillStyle = gateCheck.allowed ? '#4ade80' : '#fca5a5';
      ctx.fillText(
        gateCheck.allowed
          ? `[개방 완료 -> ${gate.toZoneId.toUpperCase()}]`
          : `[잠김: 필수 에피소드 ${gateCheck.missingEpisodes.length}개 미완료]`,
        gx,
        gy + 68
      );
      ctx.restore();
    }
  }

  for (const isl of zone.islands) {
    const ix = Math.round(isl.pos.x);
    const iy = Math.round(isl.pos.y);
    if (!isCircleInBounds(visibleBounds, ix, iy, isl.dockingRadiusPx + 64)) continue;
    const completed = state.completedEpisodes.includes(isl.episodeId);
    ctx.save();

    ctx.strokeStyle = completed
      ? '#4ade80'
      : isl.requiredForNextZone
        ? '#facc15'
        : '#38bdf8';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.arc(ix, iy, isl.dockingRadiusPx, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = '#fde047';
    ctx.beginPath();
    ctx.arc(ix, iy, 42, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = isl.color;
    ctx.beginPath();
    ctx.arc(ix, iy, 34, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#78350f';
    ctx.fillRect(ix - 48, iy - 6, 16, 12);

    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffffff';
    ctx.fillText(isl.name, ix, iy - 52);

    ctx.font = 'bold 10px monospace';
    if (completed) {
      ctx.fillStyle = '#4ade80';
      ctx.fillText('★ EPISODE CLEAR!', ix, iy + 58);
    } else if (isl.requiredForNextZone) {
      ctx.fillStyle = '#fde047';
      ctx.fillText('● [필수 에피소드 - 입항 가능]', ix, iy + 58);
    } else if (isl.playableInVerticalSlice) {
      ctx.fillStyle = '#38bdf8';
      ctx.fillText('◆ [최신장 에피소드 - 입항 가능]', ix, iy + 58);
    } else {
      ctx.fillStyle = '#94a3b8';
      ctx.fillText('○ [자유 항해 해역 거점]', ix, iy + 58);
    }
    ctx.restore();
  }
}

export function renderDynamicSeaObjects(
  ctx: CanvasRenderingContext2D,
  state: RpgCampaignState,
  zoneId: RpgCampaignState['currentZoneId'],
  revealsHiddenChests: boolean,
  tick: number,
  assets?: AssetLoader,
  visibleBounds?: ViewportWorldBounds
): void {
  const seaObjects = state.seaObjectsByZone[zoneId] ?? [];
  for (const obj of seaObjects) {
    if (obj.collectedOrDefeated) continue;
    if (obj.hiddenByDefault && !revealsHiddenChests) continue;
    const ox = Math.round(obj.pos.x);
    const oy = Math.round(obj.pos.y);
    if (!isCircleInBounds(visibleBounds, ox, oy, 48)) continue;

    ctx.save();
    if (obj.kind === 'TREASURE_CHEST') {
      ctx.fillStyle = '#f59e0b';
      ctx.fillRect(ox - 10, oy - 8, 20, 16);
      ctx.strokeStyle = '#fde047';
      ctx.lineWidth = 2;
      ctx.strokeRect(ox - 10, oy - 8, 20, 16);
      ctx.font = 'bold 9px monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#fde047';
      ctx.fillText('보물상자', ox, oy - 12);
    } else if (obj.kind === 'MERCHANT_SHIP') {
      ctx.fillStyle = '#38bdf8';
      ctx.beginPath();
      ctx.arc(ox, oy, 14, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = 'bold 9px monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#bae6fd';
      ctx.fillText('보급선', ox, oy - 18);
    } else if (obj.kind === 'MARINE_PATROL') {
      const shipSheet = assets?.getOrCreateShipSpriteSheet('marine_warship');
      if (shipSheet?.entry && shipSheet.sheet) {
        const clip = shipSheet.entry.animations.MOVE;
        const fr = Math.floor((tick / 60) * clip.fps) % Math.max(1, clip.frames);
        ctx.drawImage(
          shipSheet.sheet,
          fr * shipSheet.entry.frameWidth,
          clip.row * shipSheet.entry.frameHeight,
          shipSheet.entry.frameWidth,
          shipSheet.entry.frameHeight,
          ox - 22,
          oy - 22,
          44,
          44
        );
      } else {
        ctx.fillStyle = '#f43f5e';
        ctx.beginPath();
        ctx.arc(ox, oy, 16, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.font = 'bold 9px monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#fda4af';
      ctx.fillText('해군함대', ox, oy - 22);
    } else if (obj.kind === 'SEA_KING') {
      const skSheet = assets?.getOrCreateShipSpriteSheet('sea_king');
      if (skSheet?.entry && skSheet.sheet) {
        const clip = skSheet.entry.animations.IDLE;
        const fr = Math.floor((tick / 60) * clip.fps) % Math.max(1, clip.frames);
        ctx.drawImage(
          skSheet.sheet,
          fr * skSheet.entry.frameWidth,
          clip.row * skSheet.entry.frameHeight,
          skSheet.entry.frameWidth,
          skSheet.entry.frameHeight,
          ox - 28,
          oy - 28,
          56,
          56
        );
      } else {
        ctx.fillStyle = '#a855f7';
        ctx.beginPath();
        ctx.arc(ox, oy, 20, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.font = 'bold 9px monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#e9d5ff';
      ctx.fillText('해왕류', ox, oy - 26);
    }
    ctx.restore();
  }
}

export function renderPlayerShip(
  ctx: CanvasRenderingContext2D,
  state: RpgCampaignState,
  tick: number,
  assets?: AssetLoader,
  tailwindRatio: number = 0
): void {
  const { pos, headingRad, coupDeBurstActiveTimer } = state.ship;
  const activeShipId = resolveActiveShipId(state);
  const speed = Math.hypot(state.ship.vel.x, state.ship.vel.y);
  // Quantized 8-direction tilt & bob for crisp 2D pixel ship feel
  const sector = Math.round(headingRad / (Math.PI / 4)) * (Math.PI / 4);
  const tiltRad = Math.sin(sector) * 0.14;
  const bobY = speed > 10 ? Math.round(Math.sin(tick * 0.18) * 1.5) : 0;

  if (assets) {
    const { entry, sheet } = assets.getOrCreateShipSpriteSheet(activeShipId);
    if (entry && sheet) {
      const animState =
        coupDeBurstActiveTimer > 0
          ? 'DODGE'
          : speed > 12 || tailwindRatio > 0.15
            ? 'MOVE'
            : 'IDLE';
      const clip = entry.animations[animState];
      const frame = Math.floor((tick / 60) * clip.fps) % Math.max(1, clip.frames);
      const facingX = Math.cos(sector) < -0.05 ? -1 : 1;
      const drawW = entry.frameWidth;
      const drawH = entry.frameHeight;

      ctx.save();
      ctx.translate(Math.round(pos.x), Math.round(pos.y + bobY));
      ctx.rotate(tiltRad * facingX);
      ctx.scale(facingX, 1);

      // Sail tailwind sheen / Coup de Burst cola jet trail behind ship
      if (coupDeBurstActiveTimer > 0) {
        ctx.fillStyle = 'rgba(56, 189, 248, 0.72)';
        ctx.fillRect(-34, -10, 14, 12);
        ctx.fillStyle = '#e0f2fe';
        ctx.fillRect(-28, -7, 8, 6);
      } else if (tailwindRatio > 0.15) {
        ctx.fillStyle = 'rgba(224, 242, 254, 0.55)';
        ctx.fillRect(-22, -18, 6, 10);
      }

      ctx.drawImage(
        sheet,
        frame * entry.frameWidth,
        clip.row * entry.frameHeight,
        entry.frameWidth,
        entry.frameHeight,
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
  ctx.translate(Math.round(pos.x), Math.round(pos.y + bobY));
  ctx.rotate(sector);

  if (coupDeBurstActiveTimer > 0) {
    ctx.fillStyle = '#38bdf8';
    ctx.fillRect(-38, -8, 20, 16);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(-32, -4, 14, 8);
  } else if (tailwindRatio > 0.15) {
    ctx.fillStyle = 'rgba(186, 230, 253, 0.58)';
    ctx.fillRect(-28, -9, 14, 18);
  } else {
    ctx.fillStyle = 'rgba(224, 242, 254, 0.35)';
    ctx.fillRect(-26, -6, 10, 12);
  }

  const isSunny = activeShipId === 'thousand_sunny';
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

  ctx.fillStyle = '#f8fafc';
  ctx.fillRect(-4, -14, 10, 28);
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(-1, -4, 4, 8);

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
