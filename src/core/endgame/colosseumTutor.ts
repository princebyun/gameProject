import type { GameDataRegistry } from '../types/dataSchemas';
import type { RpgCampaignState } from '../types/rpgSchemas';
import type { EndgameDataRegistry, TutorMoveDefinition } from './types';

export function equipTutoredMove(
  unitId: string,
  moveId: string,
  slotIndex: number,
  campaign: RpgCampaignState,
  gameReg: GameDataRegistry
): boolean {
  const unitDef = gameReg.units[unitId];
  if (!unitDef || slotIndex < 0 || slotIndex > 3) return false;
  const learned = campaign.endgame.colosseum.tutoredMovesMap[unitId] ?? [];
  if (!learned.includes(moveId) && !unitDef.defaultMoves.includes(moveId)) {
    return false;
  }

  if (!campaign.unitEquippedMovesOverrides) {
    campaign.unitEquippedMovesOverrides = {};
  }
  const current = [
    ...(campaign.unitEquippedMovesOverrides[unitId] ?? unitDef.defaultMoves).slice(0, 4)
  ];
  while (current.length < 4) {
    current.push(unitDef.defaultMoves[current.length] ?? moveId);
  }
  const existingIdx = current.indexOf(moveId);
  if (existingIdx >= 0 && existingIdx !== slotIndex) {
    const prevAtSlot = current[slotIndex];
    if (prevAtSlot !== undefined) {
      current[existingIdx] = prevAtSlot;
    }
  }
  current[slotIndex] = moveId;
  campaign.unitEquippedMovesOverrides[unitId] = current;
  return true;
}

export function purchaseTutorMove(
  unitId: string,
  moveId: string,
  equipSlotIndex: number | null,
  campaign: RpgCampaignState,
  gameReg: GameDataRegistry,
  endgameReg: EndgameDataRegistry
): { success: boolean; message: string; remainingCp: number } {
  const unitDef = gameReg.units[unitId];
  const tutorDef: TutorMoveDefinition | undefined = endgameReg.tutorMoves[moveId];
  const moveDef = gameReg.moves[moveId];
  const colo = campaign.endgame.colosseum;

  if (!unitDef) {
    return { success: false, message: '존재하지 않는 캐릭터입니다.', remainingCp: colo.cp };
  }
  if (!tutorDef || !moveDef) {
    return {
      success: false,
      message: '기술 전수 교관 카탈로그에 없는 스킬입니다.',
      remainingCp: colo.cp
    };
  }
  if (
    tutorDef.compatibleUnitIds &&
    tutorDef.compatibleUnitIds.length > 0 &&
    !tutorDef.compatibleUnitIds.includes(unitId)
  ) {
    return {
      success: false,
      message: `${unitDef.name}은(는) [${tutorDef.name}]을 습득할 수 없습니다.`,
      remainingCp: colo.cp
    };
  }

  const learned = colo.tutoredMovesMap[unitId] ?? [];
  const alreadyLearned = learned.includes(moveId);

  if (!alreadyLearned) {
    if (colo.cp < tutorDef.costCp) {
      return {
        success: false,
        message: `콜로세움 포인트(CP)가 부족합니다. (필요: ${tutorDef.costCp} CP / 보유: ${colo.cp} CP)`,
        remainingCp: colo.cp
      };
    }
    colo.cp -= tutorDef.costCp;
    colo.tutoredMovesMap[unitId] = [...learned, moveId];
  }

  if (equipSlotIndex !== null && equipSlotIndex >= 0 && equipSlotIndex <= 3) {
    equipTutoredMove(unitId, moveId, equipSlotIndex, campaign, gameReg);
  }

  const msg = alreadyLearned
    ? `${unitDef.name}에게 이미 습득한 [${tutorDef.name}]을 슬롯에 장착했습니다.`
    : `${unitDef.name}이(가) ${tutorDef.costCp} CP로 [${tutorDef.name}]을 전수받았습니다!`;
  campaign.voyageLog.push(`[기술 전수 교관] ${msg}`);

  return {
    success: true,
    message: msg,
    remainingCp: colo.cp
  };
}
