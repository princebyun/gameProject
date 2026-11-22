import { BATTLE_CALC_VERSION } from '../constants';
import type { GameDataRegistry } from '../types/dataSchemas';
import type { RpgDataRegistry } from '../types/rpgSchemas';
import { validateSaveLegality } from './legalityValidator';
import type {
  AntiCheatViolationCode,
  SaveAntiCheatBlock,
  SaveEnvelope
} from './schema';
import { computeSaveIntegrity } from './sha256';

export { validateSaveLegality } from './legalityValidator';

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
