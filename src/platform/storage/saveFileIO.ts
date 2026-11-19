import { evaluateAndStampAntiCheat } from '../../core/save/antiCheat';
import { migrateRawSaveToCurrent } from '../../core/save/migrator';
import type { SaveAntiCheatBlock, SaveEnvelope } from '../../core/save/schema';
import type { GameDataRegistry } from '../../core/types/dataSchemas';
import type { RpgDataRegistry } from '../../core/types/rpgSchemas';

export function formatSaveExportFilename(envelope: SaveEnvelope): string {
  const slot = envelope.meta.slotId.replace('_', '');
  const zone = envelope.payload.world.currentZoneId;
  const datePart = (envelope.meta.savedAt || '2026-11-19')
    .slice(0, 10)
    .replace(/-/g, '');
  return `save_${slot}_${zone}_${datePart}.op-save.json`;
}

export function downloadSaveEnvelopeAsJson(envelope: SaveEnvelope): string {
  const filename = formatSaveExportFilename(envelope);
  const content = JSON.stringify(envelope, null, 2);

  if (typeof document !== 'undefined' && typeof Blob !== 'undefined') {
    const blob = new Blob([content], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }

  return content;
}

export interface ImportedSavePreview {
  envelope: SaveEnvelope;
  migrated: boolean;
  migratedFromVersion: number;
  antiCheat: SaveAntiCheatBlock;
}

export function parseAndValidateImportedSaveJson(
  jsonText: string,
  rpgRegistry: RpgDataRegistry,
  gameRegistry: GameDataRegistry
): ImportedSavePreview {
  let raw: unknown;
  try {
    raw = JSON.parse(jsonText);
  } catch {
    throw new Error(
      'JSON 파싱 실패: 손상되었거나 유효하지 않은 .op-save.json 파일입니다. 기존 슬롯 데이터는 안전하게 보호되었습니다.'
    );
  }

  const mig = migrateRawSaveToCurrent(raw, rpgRegistry, gameRegistry);
  const antiCheat = evaluateAndStampAntiCheat(
    mig.envelope,
    rpgRegistry,
    gameRegistry
  );

  return {
    envelope: mig.envelope,
    migrated: mig.migrated,
    migratedFromVersion: mig.migratedFromVersion,
    antiCheat
  };
}
