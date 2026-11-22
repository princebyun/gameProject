import { clamp, distVec } from '../math/vector2';
import type {
  ArenaDestructibleProp,
  BattleWorldState,
  UnitBuildConfig,
  UnitRuntimeState
} from '../types/battleState';
import type { GameDataRegistry, MoveDefinition } from '../types/dataSchemas';
import { applyStatus } from './statusEngine';
import { triggerTraitHook } from './traitHooks';
import { createUnitRuntime } from './worldFactory';

export function damageDestructibleProp(
  prop: ArenaDestructibleProp,
  damage: number,
  world: BattleWorldState,
  registry: GameDataRegistry
): boolean {
  if (prop.destroyed) return false;
  prop.hp = Math.max(0, prop.hp - Math.max(1, damage));
  if (prop.hp > 0) return false;

  prop.destroyed = true;
  world.vfxEvents.push({
    id: `vfx_prop_${world.tick}_${prop.id}`,
    kind: 'CLASH_SHOCKWAVE',
    pos: { x: prop.pos.x, y: prop.pos.y },
    color: '#38bdf8',
    radiusPx: prop.wetRadiusPx,
    elapsedSec: 0,
    durationSec: 0.45
  });
  world.floatingTexts.push({
    id: `ft_prop_${world.tick}_${prop.id}`,
    pos: { x: prop.pos.x, y: prop.pos.y - 24 },
    text: '💧 물통 파괴! 주변 젖음(8s)!',
    color: '#38bdf8',
    elapsedSec: 0,
    durationSec: 1.3,
    scale: 1.2
  });
  for (const u of world.units) {
    if (!u.isAlive || !u.isOnField) continue;
    if (distVec(u.pos, prop.pos) <= prop.wetRadiusPx + u.radiusPx) {
      applyStatus(u, 'WET', prop.wetDurationSec, prop.id, world, registry);
    }
  }
  world.combatLog.push(
    `[물통 파괴] ${prop.id} 파괴! 반경 ${prop.wetRadiusPx}px 내 유닛에게 젖음(WET) ${prop.wetDurationSec}초 부여!`
  );
  return true;
}

export function summonOrSwapMinion(
  caster: UnitRuntimeState,
  moveDef: MoveDefinition,
  world: BattleWorldState,
  registry: GameDataRegistry
): { action: 'SUMMONED' | 'SWAPPED' | 'NONE'; minionId: string | null } {
  const existing = world.units.find(
    (u) => u.isAlive && u.isOnField && u.isMinion && u.summonerUnitId === caster.instanceId
  );

  if (existing && moveDef.swapWithMinionIfAlive) {
    const tmpPos = { x: caster.pos.x, y: caster.pos.y };
    caster.pos = { x: existing.pos.x, y: existing.pos.y };
    caster.prevPos = { ...caster.pos };
    existing.pos = tmpPos;
    existing.prevPos = { ...existing.pos };
    caster.iframeTimer = Math.max(caster.iframeTimer, 0.35);

    world.floatingTexts.push({
      id: `ft_swap_${world.tick}_${caster.instanceId}`,
      pos: { x: caster.pos.x, y: caster.pos.y - 30 },
      text: '👻 도펠맨 위치 교체!',
      color: '#c084fc',
      elapsedSec: 0,
      durationSec: 1.0,
      scale: 1.15
    });
    world.vfxEvents.push({
      id: `vfx_swap_${world.tick}_${caster.instanceId}`,
      kind: 'FORM_BURST',
      pos: { x: caster.pos.x, y: caster.pos.y },
      color: '#7e22ce',
      radiusPx: 40,
      elapsedSec: 0,
      durationSec: 0.35
    });
    world.combatLog.push(
      `[그림자 스왑] ${caster.name} 도펠맨과 즉시 위치 교체!`
    );
    return { action: 'SWAPPED', minionId: existing.instanceId };
  }

  const speciesId = moveDef.summonMinionSpeciesId ?? 'doppelman';
  const minionDef = registry.units[speciesId];
  if (!minionDef) {
    return { action: 'NONE', minionId: null };
  }

  const spawnPos = {
    x: clamp(
      caster.pos.x + caster.aimDir.x * 76,
      minionDef.entityScale ? 32 : 24,
      world.arenaWidth - 32
    ),
    y: clamp(
      caster.pos.y + caster.aimDir.y * 76,
      32,
      world.arenaHeight - 32
    )
  };

  const minionBuild: UnitBuildConfig = {
    instanceId: `minion_${caster.instanceId}_${world.tick}`,
    speciesId: minionDef.id,
    level: Math.max(1, caster.level - 2),
    ivs: { hp: 10, atk: 12, def: 10, spAtk: 12, spDef: 10, spd: 14 },
    evs: { hp: 0, atk: 0, def: 0, spAtk: 0, spDef: 0, spd: 0 },
    moveIds: [...minionDef.defaultMoves],
    equipmentId: minionDef.defaultEquipmentId,
    traitId: minionDef.traitId,
    formId: minionDef.defaultFormId,
    isPlayerControlled: false,
    aiLevel: Math.max(2, caster.aiLevel)
  };

  const minion = createUnitRuntime(
    minionBuild,
    caster.team,
    world.units.length,
    true,
    spawnPos,
    caster.aimDir,
    registry
  );
  minion.isMinion = true;
  minion.summonerUnitId = caster.instanceId;
  minion.maxHp = Math.max(80, Math.round(caster.maxHp * 0.32));
  minion.hp = minion.maxHp;
  world.units.push(minion);

  world.floatingTexts.push({
    id: `ft_summon_${world.tick}_${minion.instanceId}`,
    pos: { x: minion.pos.x, y: minion.pos.y - 30 },
    text: '👻 도펠맨 소환!',
    color: '#a855f7',
    elapsedSec: 0,
    durationSec: 1.1,
    scale: 1.15
  });
  world.combatLog.push(
    `[분신 소환] ${caster.name} 그림자 분신 [${minion.name}] 소환! (HP ${minion.maxHp})`
  );
  return { action: 'SUMMONED', minionId: minion.instanceId };
}

export function spawnNextGauntletWave(
  world: BattleWorldState,
  registry: GameDataRegistry
): boolean {
  const nextIdx = world.currentWaveIndex + 1;
  if (nextIdx >= world.gauntletWaves.length) {
    return false;
  }
  world.currentWaveIndex = nextIdx;
  const wave = world.gauntletWaves[nextIdx];
  if (!wave) {
    return false;
  }
  const cy = world.arenaHeight * 0.5;
  const activePerTeam = world.mode === '2V2' ? 2 : 1;

  wave.enemyBuilds.forEach((b, idx) => {
    const isOnField = idx < activePerTeam;
    const yOffset = activePerTeam === 2 ? (idx === 0 ? -75 : 75) : 0;
    const pos = { x: world.arenaWidth * 0.78, y: cy + yOffset };
    const spawned = createUnitRuntime(
      b,
      'OMEGA',
      idx,
      isOnField,
      pos,
      { x: -1, y: 0 },
      registry
    );
    world.units.push(spawned);
    if (isOnField) {
      triggerTraitHook('onEnterField', spawned, {}, world, registry);
    }
  });

  const primaryBoss = world.units.find(
    (u) => u.team === 'OMEGA' && u.isAlive && u.isOnField
  );
  if (primaryBoss) {
    const def = registry.units[primaryBoss.speciesId];
    world.bossIntroTimer = 1.5;
    world.bossIntroName = primaryBoss.name;
    world.bossIntroTitle = def?.title ?? wave.waveName;
    world.bossIntroBountyLabel = primaryBoss.bountyLabel;
  }

  world.waveBannerTimer = 2.4;
  world.waveBannerText = `WAVE ${nextIdx + 1}/${world.gauntletWaves.length}: ${wave.waveName}`;
  world.combatLog.push(
    `[마린포드 연전 전환] ${world.waveBannerText} 출현!`
  );
  return true;
}

export function activateBirdcage(
  owner: UnitRuntimeState,
  world: BattleWorldState,
  registry: GameDataRegistry
): boolean {
  if (world.birdcage.active) return false;
  const trait = registry.traits[owner.traitId];
  const cfg = trait?.shrinkingArena;
  world.birdcage = {
    active: true,
    ownerUnitId: owner.instanceId,
    shrinkScale: 1.0,
    minScaleRatio: cfg?.minScaleRatio ?? 0.45,
    shrinkRatePerSec: cfg?.shrinkRatePerSec ?? 0.025,
    boundarySlashDamage: cfg?.boundarySlashDamage ?? 18,
    boundaryKnockbackSpeed: cfg?.boundaryKnockbackSpeed ?? 220,
    tickTimer: 0
  };
  world.floatingTexts.push({
    id: `ft_birdcage_${world.tick}_${owner.instanceId}`,
    pos: { x: world.arenaWidth * 0.5, y: 88 },
    text: '🕸 새장(BIRDCAGE) 발동! 아레나가 축소됩니다!',
    color: '#f43f5e',
    elapsedSec: 0,
    durationSec: 1.8,
    scale: 1.35
  });
  world.combatLog.push(
    `[새장 발동] ${owner.name}의 붉은 실 새장이 전개되어 아레나가 점진 축소됩니다!`
  );
  return true;
}
