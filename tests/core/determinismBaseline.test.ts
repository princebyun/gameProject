import { describe, expect, it } from 'vitest';
import {
  createBattleWorld,
  stepBattleWorld
} from '../../src/core/combat/battleWorld';
import { BATTLE_CALC_VERSION, FIXED_DT } from '../../src/core/constants';
import { buildOfflineRaidBattleConfig } from '../../src/core/endgame/raid';
import { SeededPRNG } from '../../src/core/math/prng';
import { computeBattleStateHash } from '../../src/core/net/stateHasher';
import { createStandardPresetBuild } from '../../src/core/net/terminalArenaRule';
import { createInitialCampaignState } from '../../src/core/rpg/campaignState';
import { defaultDataRegistry } from '../../src/data/dataRegistry';
import { defaultEndgameRegistry } from '../../src/data/endgame/endgameRegistry';
import { defaultRpgDataRegistry } from '../../src/data/rpgDataRegistry';

describe('Deterministic 60Hz Battle Simulation Baseline (Pre-Refactor Regression Lock)', () => {
  it('1. 2V2 Onigashima (seed 20261122, 600 ticks) matches exact baseline stateHash and PRNG state', () => {
    expect(BATTLE_CALC_VERSION).toBe('0.6.0');
    const world = createBattleWorld(
      {
        seed: 20261122,
        mode: '2V2',
        arenaSizeKey: 'medium',
        teamAlpha: [
          createStandardPresetBuild('luffy', 'a1', false, 3, defaultDataRegistry),
          createStandardPresetBuild('zoro', 'a2', false, 3, defaultDataRegistry)
        ],
        teamOmega: [
          createStandardPresetBuild('kaido', 'o1', false, 3, defaultDataRegistry),
          createStandardPresetBuild('king', 'o2', false, 3, defaultDataRegistry)
        ]
      },
      defaultDataRegistry
    );
    const prng = new SeededPRNG(20261122);
    for (let t = 0; t < 600; t++) {
      stepBattleWorld(world, [], defaultDataRegistry, prng, FIXED_DT);
    }

    expect(world.tick).toBe(600);
    expect(world.winnerTeam).toBeNull();
    expect(prng.getSeedState()).toBe(716162494005);
    expect(computeBattleStateHash(world, prng)).toBe(
      'da25fcf67f2e9343095cd5e880a8e24ae2804b1b94e1ab46bd945ffe266283ea'
    );
  });

  it('2. 1V1 Arlong Park (seed 1337, up to 300 ticks) matches exact baseline stateHash and PRNG state', () => {
    const world = createBattleWorld(
      {
        seed: 1337,
        mode: '1V1',
        arenaSizeKey: 'medium',
        teamAlpha: [
          createStandardPresetBuild('luffy', 'a1', false, 3, defaultDataRegistry)
        ],
        teamOmega: [
          createStandardPresetBuild('arlong', 'o1', false, 3, defaultDataRegistry)
        ]
      },
      defaultDataRegistry
    );
    const prng = new SeededPRNG(1337);
    for (let t = 0; t < 300; t++) {
      stepBattleWorld(world, [], defaultDataRegistry, prng, FIXED_DT);
    }

    expect(world.tick).toBe(261);
    expect(world.winnerTeam).toBe('ALPHA');
    expect(prng.getSeedState()).toBe(287555833978);
    expect(computeBattleStateHash(world, prng)).toBe(
      '766d2ef91094c346c6c426b73d105e6ac7659032c6f19fbe13470921c1b5eab8'
    );
  });

  it('3. COOP_RAID Kaido (seed 3002, 600 ticks) matches exact baseline stateHash and PRNG state', () => {
    const campaign = createInitialCampaignState(
      defaultRpgDataRegistry,
      defaultDataRegistry
    );
    const raidCfg = buildOfflineRaidBattleConfig(
      'raid_kaido_flame',
      ['luffy', 'zoro', 'sanji'],
      3002,
      campaign,
      defaultDataRegistry,
      defaultEndgameRegistry
    );
    expect(raidCfg).not.toBeNull();

    const world = createBattleWorld(raidCfg!, defaultDataRegistry);
    const prng = new SeededPRNG(3002);
    for (let t = 0; t < 600; t++) {
      stepBattleWorld(world, [], defaultDataRegistry, prng, FIXED_DT);
    }

    expect(world.tick).toBe(600);
    expect(world.winnerTeam).toBeNull();
    expect(prng.getSeedState()).toBe(1968933251977);
    expect(computeBattleStateHash(world, prng)).toBe(
      'cec9e480772e73bd5196cf11b9cce87e4c5dc906cfb430d44802304c73de9ffd'
    );
  });
});
