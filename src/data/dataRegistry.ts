import abilitiesJson from './abilities.json';
import aiProfilesJson from './ai_profiles.json';
import balanceJson from './balance.json';
import elementsJson from './elements.json';
import equipmentJson from './equipment.json';
import formsJson from './forms.json';
import movesJson from './moves.json';
import traitsJson from './traits.json';
import unitsJson from './units.json';
import {
  assertArray,
  assertValidAiProfileDefinition,
  assertValidBalanceConfig,
  assertValidElementsConfig,
  assertValidEquipmentDefinition,
  assertValidFormDefinition,
  assertValidMoveDefinition,
  assertValidTraitDefinition,
  assertValidUnitDefinition
} from './schemaGuards';
import type {
  AiProfileDefinition,
  ElementMetadata,
  EquipmentDefinition,
  FormDefinition,
  GameDataRegistry,
  MoveDefinition,
  TraitDefinition,
  UnitDefinition
} from './schemas/gameDataSchemas';

export function createDefaultDataRegistry(): GameDataRegistry {
  const balance = assertValidBalanceConfig(balanceJson);
  const elements = assertValidElementsConfig(elementsJson);
  const elementsById = new Map<string, ElementMetadata>();
  for (const el of elements.elements) {
    elementsById.set(el.id, el);
  }

  const traits: Record<string, TraitDefinition> = {};
  const traitsMap = new Map<string, TraitDefinition>();
  const rawAbilities = assertArray(abilitiesJson, 'abilities');
  for (let i = 0; i < rawAbilities.length; i++) {
    const a = assertValidTraitDefinition(rawAbilities[i], i, 'abilities');
    traits[a.id] = a;
    traitsMap.set(a.id, a);
  }
  const rawTraits = assertArray(traitsJson, 'traits');
  for (let i = 0; i < rawTraits.length; i++) {
    const t = assertValidTraitDefinition(rawTraits[i], i, 'traits');
    traits[t.id] = t;
    traitsMap.set(t.id, t);
  }

  const moves: Record<string, MoveDefinition> = {};
  const movesMap = new Map<string, MoveDefinition>();
  const rawMoves = assertArray(movesJson, 'moves');
  for (let i = 0; i < rawMoves.length; i++) {
    const m = assertValidMoveDefinition(rawMoves[i], i);
    moves[m.id] = m;
    movesMap.set(m.id, m);
  }

  const forms: Record<string, FormDefinition> = {};
  const formsMap = new Map<string, FormDefinition>();
  const rawForms = assertArray(formsJson, 'forms');
  for (let i = 0; i < rawForms.length; i++) {
    const f = assertValidFormDefinition(rawForms[i], i);
    forms[f.id] = f;
    formsMap.set(f.id, f);
  }

  const equipment: Record<string, EquipmentDefinition> = {};
  const equipmentMap = new Map<string, EquipmentDefinition>();
  const rawEq = assertArray(equipmentJson, 'equipment');
  for (let i = 0; i < rawEq.length; i++) {
    const eq = assertValidEquipmentDefinition(rawEq[i], i);
    equipment[eq.id] = eq;
    equipmentMap.set(eq.id, eq);
  }

  const units: Record<string, UnitDefinition> = {};
  const unitsMap = new Map<string, UnitDefinition>();
  const rawUnits = assertArray(unitsJson, 'units');
  for (let i = 0; i < rawUnits.length; i++) {
    const u = assertValidUnitDefinition(rawUnits[i], i);
    units[u.id] = u;
    unitsMap.set(u.id, u);
  }

  const aiProfiles: Record<number, AiProfileDefinition> = {};
  const aiProfilesMap = new Map<number, AiProfileDefinition>();
  const rawAi = assertArray(aiProfilesJson, 'aiProfiles');
  for (let i = 0; i < rawAi.length; i++) {
    const ai = assertValidAiProfileDefinition(rawAi[i], i);
    aiProfiles[ai.level] = ai;
    aiProfilesMap.set(ai.level, ai);
  }

  return {
    balance,
    elements,
    elementsById,
    traits,
    traitsMap,
    moves,
    movesMap,
    forms,
    formsMap,
    equipment,
    equipmentMap,
    units,
    unitsMap,
    aiProfiles,
    aiProfilesMap
  };
}

export const defaultDataRegistry: GameDataRegistry = createDefaultDataRegistry();
