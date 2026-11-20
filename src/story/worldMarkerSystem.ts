import { ISLAND_BATTLE_TERMINAL_POS } from '../core/rpg/episodeEngine';
import type {
  IslandMapDefinition,
  RpgCampaignState,
  RpgDataRegistry
} from '../core/types/rpgSchemas';
import {
  SIDE_BANTER_MARKER_MANIFEST,
  type SideBanterMarkerMeta
} from '../data/dialogues/scriptManifest';
import type { StoryNodeSnapshot } from './storyDirector';

export type WorldMarkerKind = 'MAIN' | 'SIDE' | 'ACTIVITY';

export interface WorldMarker {
  id: string;
  kind: WorldMarkerKind;
  label: string;
  x: number;
  y: number;
  color: string;
  pulse: boolean;
}

export const MARKER_COLOR_MAP: Record<WorldMarkerKind, string> = {
  MAIN: '#facc15', // Gold — Main Story Episode / Cutscene / Boss
  SIDE: '#38bdf8', // Blue — Crew Sub-Quest & Ally Recruitment
  ACTIVITY: '#fb7185' // Silver/Red — Bounty, Treasure, Terminal, Endgame
};

/**
 * Generates GTA-style color-coded world markers (MAIN Gold, SIDE Blue, ACTIVITY Silver/Red)
 * for Sea Sailing maps and minimaps.
 */
export function collectSeaWorldMarkers(
  campaign: RpgCampaignState,
  rpgRegistry: RpgDataRegistry,
  storyNode: StoryNodeSnapshot
): WorldMarker[] {
  const zone = rpgRegistry.seaZones[campaign.currentZoneId];
  if (!zone) return [];

  const markers: WorldMarker[] = [];

  for (const isl of zone.islands) {
    const isMainTarget =
      storyNode.targetZoneId === zone.id &&
      storyNode.targetIslandId === isl.islandId;
    const isDone = campaign.completedEpisodes.includes(isl.episodeId);

    if (isMainTarget) {
      markers.push({
        id: `main_${isl.islandId}`,
        kind: 'MAIN',
        label: `★ MAIN: ${isl.name}`,
        x: isl.pos.x,
        y: isl.pos.y,
        color: MARKER_COLOR_MAP.MAIN,
        pulse: true
      });
    } else if (isl.endgameMode) {
      markers.push({
        id: `act_${isl.islandId}`,
        kind: 'ACTIVITY',
        label: `🏆 ${isl.name}`,
        x: isl.pos.x,
        y: isl.pos.y,
        color: MARKER_COLOR_MAP.ACTIVITY,
        pulse: false
      });
    } else if (!isDone && isl.playableInVerticalSlice) {
      markers.push({
        id: `side_${isl.islandId}`,
        kind: 'SIDE',
        label: `◆ ${isl.name}`,
        x: isl.pos.x,
        y: isl.pos.y,
        color: MARKER_COLOR_MAP.SIDE,
        pulse: false
      });
    }
  }

  // Sea Gate beacon if target zone is ahead
  if (zone.seaGate && storyNode.targetZoneId !== zone.id) {
    markers.push({
      id: `main_gate_${zone.seaGate.gateId}`,
      kind: 'MAIN',
      label: `★ MAIN: ${zone.seaGate.name}`,
      x: zone.seaGate.pos.x,
      y: zone.seaGate.pos.y,
      color: MARKER_COLOR_MAP.MAIN,
      pulse: true
    });
  }

  // Open-world Blue Markers for uncompleted crew shipboard side banters
  for (const banter of SIDE_BANTER_MARKER_MANIFEST) {
    if (banter.seaZoneId !== zone.id) continue;
    const flagKey = `side_banter_${banter.scriptId}`;
    if (campaign.episodeFlags[flagKey]) continue;
    if (
      banter.requiredUnitIds &&
      !banter.requiredUnitIds.every((uid) => campaign.recruitedUnitIds.includes(uid))
    ) {
      continue;
    }
    markers.push({
      id: `side_banter_${banter.scriptId}`,
      kind: 'SIDE',
      label: `💬 ${banter.markerLabel}`,
      x: banter.markerPos.x,
      y: banter.markerPos.y,
      color: MARKER_COLOR_MAP.SIDE,
      pulse: true
    });
  }

  // Open-world repeatable activities (Bounties / Treasure)
  for (const obj of campaign.seaObjectsByZone[zone.id] ?? []) {
    if (obj.collectedOrDefeated) continue;
    markers.push({
      id: `act_sea_${obj.id}`,
      kind: 'ACTIVITY',
      label: obj.kind === 'TREASURE_CHEST' ? '보물' : '현상금',
      x: obj.pos.x,
      y: obj.pos.y,
      color: obj.kind === 'TREASURE_CHEST' ? '#cbd5e1' : MARKER_COLOR_MAP.ACTIVITY,
      pulse: false
    });
  }

  return markers;
}

export const SIDE_BANTER_INTERACT_RADIUS_PX = 92;

/**
 * Finds the nearest uncompleted blue-marker side crew banter within ship interaction radius.
 */
export function findNearbySeaSideBanter(
  campaign: RpgCampaignState
): SideBanterMarkerMeta | null {
  for (const banter of SIDE_BANTER_MARKER_MANIFEST) {
    if (banter.seaZoneId !== campaign.currentZoneId) continue;
    if (campaign.episodeFlags[`side_banter_${banter.scriptId}`]) continue;
    if (
      banter.requiredUnitIds &&
      !banter.requiredUnitIds.every((uid) => campaign.recruitedUnitIds.includes(uid))
    ) {
      continue;
    }
    const dist = Math.hypot(
      campaign.ship.pos.x - banter.markerPos.x,
      campaign.ship.pos.y - banter.markerPos.y
    );
    if (dist <= SIDE_BANTER_INTERACT_RADIUS_PX) {
      return banter;
    }
  }
  return null;
}

/**
 * Generates GTA-style beacons inside an Island Exploration map (960x540 space).
 */
export function collectIslandWorldMarkers(
  campaign: RpgCampaignState,
  islandMap: IslandMapDefinition,
  storyNode: StoryNodeSnapshot
): WorldMarker[] {
  const markers: WorldMarker[] = [];

  // 1. Primary Gold Marker (MAIN)
  if (storyNode.targetIslandId === islandMap.islandId && storyNode.targetIslandPos) {
    markers.push({
      id: `island_main_${storyNode.nodeId}`,
      kind: 'MAIN',
      label: `★ MAIN: ${storyNode.title}`,
      x: storyNode.targetIslandPos.x,
      y: storyNode.targetIslandPos.y,
      color: MARKER_COLOR_MAP.MAIN,
      pulse: true
    });
  } else {
    // Highlight next uncompleted NPC / Boss on this island as MAIN or SIDE
    for (const npc of islandMap.npcs) {
      const done = npc.setsQuestFlagOnTalk
        ? Boolean(campaign.episodeFlags[npc.setsQuestFlagOnTalk])
        : false;
      if (!done) {
        const isRecruit = npc.choices?.some((c) => Boolean(c.recruitsUnitId));
        markers.push({
          id: `island_npc_${npc.npcId}`,
          kind: isRecruit ? 'SIDE' : 'MAIN',
          label: isRecruit ? `◆ SIDE: ${npc.name}` : `★ MAIN: ${npc.name}`,
          x: npc.pos.x,
          y: npc.pos.y,
          color: isRecruit ? MARKER_COLOR_MAP.SIDE : MARKER_COLOR_MAP.MAIN,
          pulse: true
        });
      }
    }

    for (const enc of islandMap.encounters) {
      const cleared = enc.setsFlagOnVictory
        ? Boolean(campaign.episodeFlags[enc.setsFlagOnVictory])
        : false;
      if (!cleared) {
        markers.push({
          id: `island_enc_${enc.encounterId}`,
          kind: 'MAIN',
          label: `★ BOSS: ${enc.name}`,
          x: enc.pos.x,
          y: enc.pos.y,
          color: MARKER_COLOR_MAP.MAIN,
          pulse: true
        });
      }
    }
  }

  // 2. Blue Marker for unrecruited crew NPCs (even when another MAIN beacon is active)
  for (const npc of islandMap.npcs) {
    const isRecruit = npc.choices?.some((c) => Boolean(c.recruitsUnitId));
    const done = npc.setsQuestFlagOnTalk
      ? Boolean(campaign.episodeFlags[npc.setsQuestFlagOnTalk])
      : false;
    if (
      isRecruit &&
      !done &&
      !markers.some((m) => Math.hypot(m.x - npc.pos.x, m.y - npc.pos.y) < 16)
    ) {
      markers.push({
        id: `island_side_${npc.npcId}`,
        kind: 'SIDE',
        label: `◆ 동료: ${npc.name}`,
        x: npc.pos.x,
        y: npc.pos.y,
        color: MARKER_COLOR_MAP.SIDE,
        pulse: true
      });
    }
  }

  // 3. Silver/Red Activity Marker for Battle Terminal
  markers.push({
    id: 'island_act_terminal',
    kind: 'ACTIVITY',
    label: '🌐 통신 단말기',
    x: ISLAND_BATTLE_TERMINAL_POS.x,
    y: ISLAND_BATTLE_TERMINAL_POS.y,
    color: '#cbd5e1',
    pulse: false
  });

  return markers;
}

/**
 * Renders animated GTA-style ground light pillars (Beacons) inside world space.
 */
export function renderWorldMarkerBeacons(
  ctx: CanvasRenderingContext2D,
  markers: WorldMarker[],
  tick: number,
  highlightGold: boolean
): void {
  ctx.save();
  for (const m of markers) {
    const pulse = m.pulse ? 0.68 + Math.sin(tick * 0.14) * 0.32 : 0.65;
    const isHighlightedMain = m.kind === 'MAIN' && highlightGold;
    const radius = isHighlightedMain ? 30 : m.kind === 'MAIN' ? 22 : 16;
    const beamH = isHighlightedMain ? 96 : m.kind === 'MAIN' ? 68 : 42;

    // Ground ring
    ctx.strokeStyle = m.color;
    ctx.globalAlpha = pulse;
    ctx.lineWidth = isHighlightedMain ? 3 : 2;
    ctx.beginPath();
    ctx.ellipse(m.x, m.y + 8, radius, Math.round(radius * 0.45), 0, 0, Math.PI * 2);
    ctx.stroke();

    // Vertical light pillar (Beacon)
    const grad = ctx.createLinearGradient(m.x, m.y + 8, m.x, m.y - beamH);
    grad.addColorStop(0, m.color);
    grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = grad;
    ctx.globalAlpha = m.kind === 'MAIN' ? 0.42 * pulse : 0.24 * pulse;
    ctx.fillRect(
      Math.round(m.x - radius * 0.55),
      Math.round(m.y - beamH),
      Math.round(radius * 1.1),
      beamH + 8
    );

    // Floating diamond icon & label for MAIN / SIDE beacons
    if (m.kind === 'MAIN' || m.kind === 'SIDE') {
      const bobY = Math.round(m.y - beamH - 8 + Math.sin(tick * 0.12) * 4);
      ctx.globalAlpha = 0.95;
      ctx.fillStyle = m.color;
      ctx.beginPath();
      ctx.moveTo(m.x, bobY - 7);
      ctx.lineTo(m.x + 6, bobY);
      ctx.lineTo(m.x, bobY + 7);
      ctx.lineTo(m.x - 6, bobY);
      ctx.closePath();
      ctx.fill();

      ctx.font = 'bold 10px monospace';
      ctx.textAlign = 'center';
      ctx.fillStyle = '#0f172a';
      ctx.fillText(m.label, m.x + 1, bobY - 11);
      ctx.fillStyle = m.color;
      ctx.fillText(m.label, m.x, bobY - 12);
    }
  }
  ctx.restore();
}
