import { defaultEndgameRegistry } from '../../data/endgame/endgameRegistry';
import type { EndgameDataRegistry } from '../endgame/types';
import type { GameDataRegistry } from '../types/dataSchemas';
import type { RpgDataRegistry, SeaZoneId } from '../types/rpgSchemas';
import { validateEndgameLegality } from './endgameLegalityValidator';
import type { AntiCheatViolationCode, SavePayloadV1 } from './schema';

/**
 * Stage 2: LegalityValidator
 * Cross-checks SavePayloadV1 against game data rules even if the signature was recalculated.
 */
export function validateSaveLegality(
  payload: SavePayloadV1,
  rpgRegistry: RpgDataRegistry,
  gameRegistry: GameDataRegistry,
  endgameRegistry: EndgameDataRegistry = defaultEndgameRegistry
): {
  codes: AntiCheatViolationCode[];
  messages: string[];
} {
  const codeSet = new Set<AntiCheatViolationCode>();
  const messages: string[] = [];

  const completed = payload.world?.completedEpisodes ?? [];
  const zonesToCheck = new Set<SeaZoneId>([
    payload.world.currentZoneId,
    ...(payload.world.unlockedZones ?? [])
  ]);

  // 1. Check Sea Zone Prerequisite Gating Rules (ILLEGAL_ZONE_ACCESS)
  const isLegacyV1Unlock = Boolean(payload.world?.legacyZoneUnlockV1);
  const isLegacyV2Unlock = Boolean(payload.world?.legacyZoneUnlockV2);
  const ebRequired = isLegacyV1Unlock
    ? ['ep_east_blue_start']
    : rpgRegistry.seaZones.east_blue.islands
        .filter((i) => i.requiredForNextZone)
        .map((i) => i.episodeId);
  const glRequired = isLegacyV2Unlock
    ? ['ep_water_seven']
    : rpgRegistry.seaZones.grand_line.islands
        .filter((i) => i.requiredForNextZone)
        .map((i) => i.episodeId);

  if (zonesToCheck.has('grand_line')) {
    for (const reqEp of ebRequired) {
      if (!completed.includes(reqEp)) {
        codeSet.add('ILLEGAL_ZONE_ACCESS');
        messages.push(
          `위대한 항로 해금 모순: 이스트 블루 필수 에피소드(${reqEp})가 미완료 상태입니다.`
        );
      }
    }
  }

  if (zonesToCheck.has('new_world')) {
    for (const reqEp of [...ebRequired, ...glRequired]) {
      if (!completed.includes(reqEp)) {
        codeSet.add('ILLEGAL_ZONE_ACCESS');
        messages.push(
          `신세계 해금 모순: 선행 필수 에피소드(${reqEp})가 미완료 상태입니다.`
        );
      }
    }
  }

  const isLegacyElbafV3 = Boolean(payload.world?.legacyElbafUnlockV3);
  if (
    !isLegacyElbafV3 &&
    (payload.world?.currentIslandId === 'elbaf' || completed.includes('ep_elbaf')) &&
    !completed.includes('ep_egghead')
  ) {
    codeSet.add('ILLEGAL_ZONE_ACCESS');
    messages.push('엘바프 입항 모순: 선행 에피소드(ep_egghead)가 미완료 상태입니다.');
  }

  // 2. Check Crew & Ship Rules (ILLEGAL_CREW_OR_SHIP)
  const recruited = payload.crew?.recruitedUnitIds ?? [];
  const party = payload.crew?.activePartyIds ?? [];

  if (recruited.length === 0 || party.length === 0 || party.length > 6) {
    codeSet.add('ILLEGAL_CREW_OR_SHIP');
    messages.push(`파티 편성 인원 오류: 현재 ${party.length}명 (허용: 1~6명).`);
  }

  const partySeen = new Set<string>();
  for (const uid of party) {
    if (partySeen.has(uid)) {
      codeSet.add('ILLEGAL_CREW_OR_SHIP');
      messages.push(`파티 내 중복 캐릭터 편성 감지: ${uid}`);
    }
    partySeen.add(uid);

    if (!recruited.includes(uid)) {
      codeSet.add('ILLEGAL_CREW_OR_SHIP');
      messages.push(`미영입 캐릭터가 활성 파티에 포함되어 있습니다: ${uid}`);
    }
  }

  for (const uid of recruited) {
    if (!gameRegistry.units[uid]) {
      codeSet.add('ILLEGAL_CREW_OR_SHIP');
      messages.push(`존재하지 않는 유닛 ID가 포함되어 있습니다: ${uid}`);
    }
  }

  const ownedShips = new Set<string>([
    payload.ship.activeShipId,
    ...(payload.ship.ownedShipIds ?? [])
  ]);
  for (const shipId of ownedShips) {
    const shipDef = rpgRegistry.ships[shipId];
    if (!shipDef) {
      codeSet.add('ILLEGAL_CREW_OR_SHIP');
      messages.push(`존재하지 않는 선박 ID: ${shipId}`);
      continue;
    }
    if (shipDef.unlockedByEpisodeId && !completed.includes(shipDef.unlockedByEpisodeId)) {
      codeSet.add('ILLEGAL_CREW_OR_SHIP');
      messages.push(
        `선박 해금 모순: 선행 에피소드(${shipDef.unlockedByEpisodeId}) 미완료 상태에서 [${shipDef.name}] 보유`
      );
    }
  }

  // 3. Check Economy, Haki, Awakening & Stat Rules (ILLEGAL_UNIT_STATE)
  const { berry, bounty, trainingPoints } = payload.economy;
  if (
    !Number.isFinite(berry) ||
    berry < 0 ||
    berry > 50_000_000_000 ||
    !Number.isFinite(bounty) ||
    bounty < 0 ||
    bounty > 50_000_000_000 ||
    !Number.isFinite(trainingPoints) ||
    trainingPoints < 0 ||
    trainingPoints > 1_000_000
  ) {
    codeSet.add('ILLEGAL_UNIT_STATE');
    messages.push('재화/현상금/수련 포인트 수치가 허용 범위를 벗어났습니다.');
  }

  const progressMap = payload.crew?.unitProgressMap ?? {};
  for (const [uid, prog] of Object.entries(progressMap)) {
    const unitDef = gameRegistry.units[uid];
    if (!unitDef) {
      codeSet.add('ILLEGAL_UNIT_STATE');
      messages.push(`알 수 없는 유닛 진행 데이터: ${uid}`);
      continue;
    }

    if (!Number.isInteger(prog.level) || prog.level < 1 || prog.level > 100) {
      codeSet.add('ILLEGAL_UNIT_STATE');
      messages.push(`${unitDef.name} 레벨 범위 위반: Lv.${prog.level} (허용: 1~100)`);
    }

    const { armament, observation, conqueror } = prog.haki;
    for (const [hKey, hVal] of [
      ['무장색', armament],
      ['견문색', observation],
      ['패왕색', conqueror]
    ] as const) {
      if (!Number.isInteger(hVal) || hVal < 0 || hVal > 3) {
        codeSet.add('ILLEGAL_UNIT_STATE');
        messages.push(`${unitDef.name} ${hKey} 패기 등급 위반: Lv.${hVal} (허용: 0~3)`);
      }
    }

    const baseConq = unitDef.haki?.conqueror ?? 0;
    if (baseConq === 0 && conqueror > 0) {
      codeSet.add('ILLEGAL_UNIT_STATE');
      messages.push(`${unitDef.name} 패왕색 보유 불가 캐릭터에 패왕색 Lv.${conqueror} 감지`);
    }

    if (prog.equippedMoveIds.length > 4) {
      codeSet.add('ILLEGAL_UNIT_STATE');
      messages.push(`${unitDef.name} 장착 스킬 개수 초과 (${prog.equippedMoveIds.length}개)`);
    }
    for (const mId of prog.equippedMoveIds) {
      if (!gameRegistry.moves[mId]) {
        codeSet.add('ILLEGAL_UNIT_STATE');
        messages.push(`${unitDef.name} 미존재 불법 스킬 장착: ${mId}`);
      }
    }

    for (const fId of prog.unlockedFormIds) {
      if (!gameRegistry.forms[fId]) {
        codeSet.add('ILLEGAL_UNIT_STATE');
        messages.push(`${unitDef.name} 미존재 각성 폼 ID: ${fId}`);
      }
      if (
        (fId === 'form_luffy_gear5' || fId === 'form_zoro_king_of_hell') &&
        prog.fruitAwakeningUnlocked &&
        !completed.includes('ep_wano')
      ) {
        codeSet.add('ILLEGAL_UNIT_STATE');
        messages.push(
          `${unitDef.name} 각성 폼(${fId}) 선행 에피소드(ep_wano) 미완료 상태에서 강제 해금 감지`
        );
      }
    }
  }

  // 4. Stage 3 Endgame State Cross-Validation
  validateEndgameLegality(
    payload.endgame,
    progressMap,
    codeSet,
    messages,
    gameRegistry,
    endgameRegistry
  );

  return {
    codes: Array.from(codeSet),
    messages
  };
}
