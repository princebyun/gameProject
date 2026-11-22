import { computePosterFrameTier } from '../endgame/colosseum';
import type { EndgameDataRegistry, SaveEndgameBlock } from '../endgame/types';
import type { GameDataRegistry } from '../types/dataSchemas';
import type { AntiCheatViolationCode, SaveUnitProgress } from './schema';

export function validateEndgameLegality(
  eg: SaveEndgameBlock | undefined,
  progressMap: Record<string, SaveUnitProgress>,
  codeSet: Set<AntiCheatViolationCode>,
  messages: string[],
  gameRegistry: GameDataRegistry,
  endgameRegistry: EndgameDataRegistry
): void {
  if (!eg) return;

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
          messages.push(`${unitDef.name} 미습득/비인가 전수 스킬 장착 감지: ${mId}`);
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
        messages.push(`미해금/불법 레이드 유물 장착 감지 (${uid}: ${relicId})`);
      }
    }
  }
}
