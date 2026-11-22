import type { BattleWorldState } from '../types/battleState';
import type { GameDataRegistry } from '../types/dataSchemas';
import {
  resolveBeamVsBeam,
  resolveBeamVsProjectile
} from './clashes/beamClash';
import { resolveMeleeVsMelee } from './clashes/meleeClash';
import {
  resolveMeleeVsBeam,
  resolveMeleeVsProjectile
} from './clashes/meleeProjectileAndBeamClash';
import { resolveProjectileVsProjectile } from './clashes/projectileClash';

export {
  resolveBeamVsBeam,
  resolveBeamVsProjectile,
  resolveMeleeVsBeam,
  resolveMeleeVsMelee,
  resolveMeleeVsProjectile,
  resolveProjectileVsProjectile
};

export function stepAllClashes(
  world: BattleWorldState,
  dt: number,
  registry: GameDataRegistry
): void {
  resolveProjectileVsProjectile(world, registry);
  resolveBeamVsBeam(world, dt, registry);
  resolveBeamVsProjectile(world, dt, registry);
  resolveMeleeVsProjectile(world, registry);
  resolveMeleeVsBeam(world, dt, registry);
  resolveMeleeVsMelee(world, dt, registry);
}
