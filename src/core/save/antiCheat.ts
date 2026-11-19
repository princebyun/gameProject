import { BATTLE_CALC_VERSION } from '../constants';
import { computePosterFrameTier } from '../endgame/colosseum';
import type { EndgameDataRegistry } from '../endgame/types';
import { defaultEndgameRegistry } from '../../data/endgame/endgameRegistry';
import type { GameDataRegistry } from '../types/dataSchemas';
import type { RpgDataRegistry, SeaZoneId } from '../types/rpgSchemas';
import type {
  AntiCheatViolationCode,
  SaveAntiCheatBlock,
  SaveEnvelope,
  SavePayloadV1
} from './schema';
import { computeSaveIntegrity } from './sha256';

/**
 * Stage 1: IntegrityVerifier
 * Detects any modification (even 1 byte) to SavePayloadV1 by comparing Canonical JSON SHA-256 & HMAC signature.
 */
export function verifySaveIntegrity(envelope: SaveEnvelope): {
  valid: boolean;
  expectedHash: string;
  expectedSignature: string;
} {
  const expected = computeSaveIntegrity(
    envelope.meta.saveVersion,
    envelope.meta.battleCalcVersion,
    envelope.payload
  );

  const hashMatches = envelope.meta.integrity?.payloadHash === expected.payloadHash;
  const sigMatches = envelope.meta.integrity?.signature === expected.signature;

  return {
    valid: Boolean(hashMatches && sigMatches),
    expectedHash: expected.payloadHash,
    expectedSignature: expected.signature
  };
}

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
  // Legacy v1 migrated saves preserve grand_line / new_world unlocks with ep_east_blue_start;
  // Legacy v1/v2 migrated saves preserve new_world unlocks with ep_water_seven;
  // Fresh v3 saves strictly enforce all 5 East Blue + 6 Grand Line required episodes.
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

  // Stage 2-C: Fresh v4 saves enforce ep_egghead before entering/clearing ep_elbaf (legacy v3 preserved)
  const isLegacyElbafV3 = Boolean(payload.world?.legacyElbafUnlockV3);
  if (
    !isLegacyElbafV3 &&
    (payload.world?.currentIslandId === 'elbaf' || completed.includes('ep_elbaf')) &&
    !completed.includes('ep_egghead')
  ) {
    codeSet.add('ILLEGAL_ZONE_ACCESS');
    messages.push(
      '엘바프 입항 모순: 선행 에피소드(ep_egghead)가 미완료 상태입니다.'
    );
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
    if (
      shipDef.unlockedByEpisodeId &&
      !completed.includes(shipDef.unlockedByEpisodeId)
    ) {
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

    // Characters without innate Conqueror's Haki (conqueror: 0 in units.json) cannot have conqueror > 0
    const baseConq = unitDef.haki?.conqueror ?? 0;
    if (baseConq === 0 && conqueror > 0) {
      codeSet.add('ILLEGAL_UNIT_STATE');
      messages.push(`${unitDef.name} 패왕색 보유 불가 캐릭터에 패왕색 Lv.${conqueror} 감지`);
    }

    // Check moves legality
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

    // Check Awakening Form prerequisite episodes
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

  // 4. Stage 3 Endgame State Cross-Validation (ILLEGAL_ENDGAME_STATE)
  const eg = payload.endgame;
  if (eg) {
    // 4-1. Impel Down bounds & buff legality
    const impel = eg.impelDown;
    if (impel) {
      if (
        !Number.isInteger(impel.highestFloor) ||
        impel.highestFloor < 0 ||
        impel.highestFloor > 999
      ) {
        codeSet.add('ILLEGAL_ENDGAME_STATE');
        messages.push(`임펠 다운 최고 도달 층수 범위 위반: ${impel.highestFloor}`);
      }
      if (impel.activeRun) {
        const validBuffIds = new Set(endgameRegistry.impelDown.buffs.map((b) => b.id));
        if (
          !Number.isInteger(impel.activeRun.currentFloor) ||
          impel.activeRun.currentFloor < 1 ||
          impel.activeRun.currentFloor > 999
        ) {
          codeSet.add('ILLEGAL_ENDGAME_STATE');
          messages.push(`임펠 다운 진행 층수 범위 위반: ${impel.activeRun.currentFloor}`);
        }
        for (const bId of impel.activeRun.selectedBuffIds ?? []) {
          if (!validBuffIds.has(bId)) {
            codeSet.add('ILLEGAL_ENDGAME_STATE');
            messages.push(`임펠 다운 미존재 불법 버프 감지: ${bId}`);
          }
        }
        for (const [uid, co] of Object.entries(impel.activeRun.carryoverMap ?? {})) {
          if (!Number.isFinite(co.hpRatio) || co.hpRatio < 0 || co.hpRatio > 1.001) {
            codeSet.add('ILLEGAL_ENDGAME_STATE');
            messages.push(`임펠 다운 비정상 HP 계승 비율 감지 (${uid}: ${co.hpRatio})`);
          }
        }
      }
    }

    // 4-2. Colosseum CP cap, Poster Frame tier, and Move Tutor legality
    const colo = eg.colosseum;
    if (colo) {
      const maxCp = endgameRegistry.colosseum.maxLegalCp;
      if (!Number.isInteger(colo.cp) || colo.cp < 0 || colo.cp > maxCp) {
        codeSet.add('ILLEGAL_ENDGAME_STATE');
        messages.push(`콜로세움 포인트(CP) 불법 수치 감지: ${colo.cp} (허용: 0~${maxCp})`);
      }

      const frameOrder = ['default', 'gold', 'platinum', 'diamond'] as const;
      const declaredIdx = frameOrder.indexOf(colo.posterFrameTier);
      const earnedTier = computePosterFrameTier(
        colo.clearedTiers ?? [],
        colo.tierWinCounts
      );
      const earnedIdx = frameOrder.indexOf(earnedTier);
      if (declaredIdx < 0 || declaredIdx > earnedIdx) {
        codeSet.add('ILLEGAL_ENDGAME_STATE');
        messages.push(
          `수배서 프레임 불법 승급 감지: [${colo.posterFrameTier}] (획득 가능 최대: [${earnedTier}])`
        );
      }

      const tutoredMap = colo.tutoredMovesMap ?? {};
      for (const [uid, moveList] of Object.entries(tutoredMap)) {
        if (!gameRegistry.units[uid]) {
          codeSet.add('ILLEGAL_ENDGAME_STATE');
          messages.push(`전수 스킬 매핑에 존재하지 않는 유닛 감지: ${uid}`);
          continue;
        }
        for (const mId of moveList) {
          if (!endgameRegistry.tutorMoves[mId] || !gameRegistry.moves[mId]) {
            codeSet.add('ILLEGAL_ENDGAME_STATE');
            messages.push(
              `tutor_moves.json에 존재하지 않는 불법 전수 스킬 감지 (${uid}: ${mId})`
            );
          }
        }
      }

      // Cross-check unit equippedMoveIds: any non-native move must be legitimately tutored
      for (const [uid, prog] of Object.entries(progressMap)) {
        const unitDef = gameRegistry.units[uid];
        if (!unitDef) continue;
        const unitTutored = tutoredMap[uid] ?? [];
        for (const mId of prog.equippedMoveIds ?? []) {
          const isNative = unitDef.defaultMoves.includes(mId);
          const isValidTutor =
            Boolean(endgameRegistry.tutorMoves[mId]) && unitTutored.includes(mId);
          if (!isNative && !isValidTutor) {
            codeSet.add('ILLEGAL_ENDGAME_STATE');
            messages.push(
              `${unitDef.name} 미습득/비인가 전수 스킬 장착 감지: ${mId}`
            );
          }
        }
      }
    }

    // 4-3. Giant Boss Raid Clears & Equipable Relics legality
    const raids = eg.raids;
    if (raids) {
      const clearedSet = new Set(raids.clearedRaidIds ?? []);
      for (const rId of clearedSet) {
        if (!endgameRegistry.raids[rId]) {
          codeSet.add('ILLEGAL_ENDGAME_STATE');
          messages.push(`존재하지 않는 레이드 클리어 기록 감지: ${rId}`);
        }
      }

      const seenRelics = new Set<string>();
      for (const relicId of raids.unlockedRelicIds ?? []) {
        if (seenRelics.has(relicId)) {
          codeSet.add('ILLEGAL_ENDGAME_STATE');
          messages.push(`레이드 유물 중복 보유 조작 감지: ${relicId}`);
          continue;
        }
        seenRelics.add(relicId);

        const relicDef = endgameRegistry.raidRelics[relicId];
        if (!relicDef) {
          codeSet.add('ILLEGAL_ENDGAME_STATE');
          messages.push(`미존재 불법 레이드 유물 보유 감지: ${relicId}`);
          continue;
        }
        if (!clearedSet.has(relicDef.requiredRaidId)) {
          codeSet.add('ILLEGAL_ENDGAME_STATE');
          messages.push(
            `미클리어 레이드(${relicDef.requiredRaidId}) 유물 [${relicDef.name}] 불법 보유 감지`
          );
        }
      }

      for (const [uid, relicId] of Object.entries(raids.equippedRelicMap ?? {})) {
        if (!gameRegistry.units[uid]) {
          codeSet.add('ILLEGAL_ENDGAME_STATE');
          messages.push(`유물 장착 대상 유닛 미존재: ${uid}`);
          continue;
        }
        if (!seenRelics.has(relicId) || !endgameRegistry.raidRelics[relicId]) {
          codeSet.add('ILLEGAL_ENDGAME_STATE');
          messages.push(
            `미해금/불법 레이드 유물 장착 감지 (${uid}: ${relicId})`
          );
        }
      }
    }
  }

  return {
    codes: Array.from(codeSet),
    messages
  };
}

/**
 * Runs both Stage 1 (IntegrityVerifier) and Stage 2 (LegalityValidator),
 * stamping the result onto envelope.meta.antiCheat.
 */
export function evaluateAndStampAntiCheat(
  envelope: SaveEnvelope,
  rpgRegistry: RpgDataRegistry,
  gameRegistry: GameDataRegistry
): SaveAntiCheatBlock {
  const violationSet = new Set<AntiCheatViolationCode>();
  const messages: string[] = [];

  // Preserve any permanent tamper mark if previously flagged
  if (envelope.meta.antiCheat?.isTampered) {
    for (const prevCode of envelope.meta.antiCheat.violationCodes ?? []) {
      violationSet.add(prevCode);
    }
  }

  const integrityRes = verifySaveIntegrity(envelope);
  if (!integrityRes.valid) {
    violationSet.add('INTEGRITY_MISMATCH');
    messages.push(
      '무결성 서명 불일치(INTEGRITY_MISMATCH): 세이브 파일 데이터가 외부에서 수정되었습니다.'
    );
  }

  const legalityRes = validateSaveLegality(
    envelope.payload,
    rpgRegistry,
    gameRegistry
  );
  for (const code of legalityRes.codes) {
    violationSet.add(code);
  }
  messages.push(...legalityRes.messages);

  const violationCodes = Array.from(violationSet);
  const isTampered = violationCodes.length > 0;
  const onlineEligible = !isTampered;

  const block: SaveAntiCheatBlock = {
    isTampered,
    onlineEligible,
    violationCodes,
    violationMessages: messages
  };

  envelope.meta.antiCheat = block;
  return block;
}

/**
 * Phase 4 Online Multiplayer Gatekeeper Function
 */
export function canEnterOnlineBattle(
  envelope: SaveEnvelope,
  rpgRegistry: RpgDataRegistry,
  gameRegistry: GameDataRegistry
): { allowed: boolean; reasons: string[] } {
  const block = evaluateAndStampAntiCheat(envelope, rpgRegistry, gameRegistry);
  const reasons: string[] = [];

  if (envelope.meta.battleCalcVersion !== BATTLE_CALC_VERSION) {
    reasons.push(
      `전투 연산 버전 불일치 (세이브: ${envelope.meta.battleCalcVersion}, 현재 엔진: ${BATTLE_CALC_VERSION})`
    );
  }

  if (block.isTampered || !block.onlineEligible) {
    reasons.push(
      `안티치트 위반 감지 (${block.violationCodes.join(', ')}) — 비공식 수정 데이터는 통신 대전이 제한됩니다.`
    );
    if (block.violationMessages) {
      reasons.push(...block.violationMessages);
    }
  }

  return {
    allowed: reasons.length === 0,
    reasons
  };
}
