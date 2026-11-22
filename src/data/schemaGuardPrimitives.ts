import type { StatBlock } from './schemas/gameDataSchemas';

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function assertRecord(value: unknown, context: string): Record<string, unknown> {
  if (!isRecord(value)) {
    throw new Error(`[DataSchema] Expected object at ${context}`);
  }
  return value;
}

export function assertString(value: unknown, context: string): string {
  if (typeof value !== 'string') {
    throw new Error(`[DataSchema] Expected string at ${context}`);
  }
  return value;
}

export function assertNonEmptyString(value: unknown, context: string): string {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`[DataSchema] Expected non-empty string at ${context}`);
  }
  return value;
}

export function assertNumber(value: unknown, context: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`[DataSchema] Expected finite number at ${context}`);
  }
  return value;
}

export function assertBoolean(value: unknown, context: string): boolean {
  if (typeof value !== 'boolean') {
    throw new Error(`[DataSchema] Expected boolean at ${context}`);
  }
  return value;
}

export function assertArray(value: unknown, context: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new Error(`[DataSchema] Expected array at ${context}`);
  }
  return value;
}

export function assertValidStatBlock(value: unknown, context: string): StatBlock {
  const obj = assertRecord(value, context);
  assertNumber(obj['hp'], `${context}.hp`);
  assertNumber(obj['atk'], `${context}.atk`);
  assertNumber(obj['def'], `${context}.def`);
  assertNumber(obj['spAtk'], `${context}.spAtk`);
  assertNumber(obj['spDef'], `${context}.spDef`);
  assertNumber(obj['spd'], `${context}.spd`);
  return obj as unknown as StatBlock;
}
