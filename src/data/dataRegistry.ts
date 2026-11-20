import abilitiesJson from './abilities.json';
import aiProfilesJson from './ai_profiles.json';
import balanceJson from './balance.json';
import combosJson from './combos.json';
import elementsJson from './elements.json';
import equipmentJson from './equipment.json';
import formsJson from './forms.json';
import movesJson from './moves.json';
import traitsJson from './traits.json';
import unitsJson from './units.json';
import type {
  AiProfileDefinition,
  BalanceConfig,
  BondComboDefinition,
  ElementsConfig,
  EquipmentDefinition,
  FormDefinition,
  GameDataRegistry,
  MoveDefinition,
  TraitDefinition,
  UnitDefinition
} from '../core/types/dataSchemas';

export function createDefaultDataRegistry(): GameDataRegistry {
  const traits: Record<string, TraitDefinition> = {};
  for (const a of abilitiesJson as TraitDefinition[]) {
    traits[a.id] = a;
  }
  for (const t of traitsJson as TraitDefinition[]) {
    traits[t.id] = t;
  }

  const moves: Record<string, MoveDefinition> = {};
  for (const m of movesJson as MoveDefinition[]) {
    moves[m.id] = m;
  }

  const forms: Record<string, FormDefinition> = {};
  for (const f of formsJson as FormDefinition[]) {
    forms[f.id] = f;
  }

  const equipment: Record<string, EquipmentDefinition> = {};
  for (const eq of equipmentJson as EquipmentDefinition[]) {
    equipment[eq.id] = eq;
  }

  const units: Record<string, UnitDefinition> = {};
  for (const u of unitsJson as UnitDefinition[]) {
    units[u.id] = u;
  }

  const aiProfiles: Record<number, AiProfileDefinition> = {};
  for (const ai of aiProfilesJson as AiProfileDefinition[]) {
    aiProfiles[ai.level] = ai;
  }

  const combos: Record<string, BondComboDefinition> = {};
  for (const c of combosJson as BondComboDefinition[]) {
    combos[c.comboId] = c;
  }

  return {
    balance: balanceJson as BalanceConfig,
    elements: elementsJson as ElementsConfig,
    traits,
    moves,
    forms,
    equipment,
    units,
    aiProfiles,
    combos
  };
}

export const defaultDataRegistry: GameDataRegistry = createDefaultDataRegistry();
