import { distVec, lenVec, normalizeVec, subVec, type Vec2 } from '../core/math/vector2';
import type {
  BattleWorldState,
  UnitInputCommand,
  UnitRuntimeState
} from '../core/types/battleState';
import type { GameDataRegistry } from '../core/types/dataSchemas';
import type { KeyBindingConfig } from './keyBindings';

export interface BattleCommandSamplingContext {
  keysDown: ReadonlySet<string>;
  keysJustPressed: ReadonlySet<string>;
  bindings: KeyBindingConfig;
  virtualMoveVec: Vec2;
  touchPendingSkill: number | null;
  touchPendingDodge: boolean;
  touchPendingFormShift: boolean;
  touchPendingAwakening: boolean;
  touchPendingSwap: boolean;
  mouseDown: boolean;
  mouseLogicalPos: Vec2 | null;
}

export function sampleExplorationMoveVector(
  keysDown: ReadonlySet<string>,
  bindings: KeyBindingConfig,
  virtualMoveVec: Vec2
): Vec2 {
  let mx = 0;
  let my = 0;

  if (keysDown.has(bindings.moveUp) || keysDown.has('ArrowUp') || keysDown.has('KeyW')) {
    my -= 1;
  }
  if (keysDown.has(bindings.moveDown) || keysDown.has('ArrowDown') || keysDown.has('KeyS')) {
    my += 1;
  }
  if (keysDown.has(bindings.moveLeft) || keysDown.has('ArrowLeft') || keysDown.has('KeyA')) {
    mx -= 1;
  }
  if (keysDown.has(bindings.moveRight) || keysDown.has('ArrowRight') || keysDown.has('KeyD')) {
    mx += 1;
  }

  if (lenVec(virtualMoveVec) > 0.08) {
    mx += virtualMoveVec.x;
    my += virtualMoveVec.y;
  }

  if (typeof navigator !== 'undefined' && typeof navigator.getGamepads === 'function') {
    const pads = navigator.getGamepads();
    const pad = pads?.[0];
    if (pad) {
      const ax0 = pad.axes[0] ?? 0;
      const ax1 = pad.axes[1] ?? 0;
      if (Math.abs(ax0) > 0.18) mx += ax0;
      if (Math.abs(ax1) > 0.18) my += ax1;
    }
  }

  return lenVec({ x: mx, y: my }) > 0.05
    ? normalizeVec({ x: mx, y: my })
    : { x: 0, y: 0 };
}

export function sampleBattlePlayerCommand(
  ctx: BattleCommandSamplingContext,
  playerUnit: UnitRuntimeState,
  world: BattleWorldState,
  registry: GameDataRegistry
): UnitInputCommand {
  let mx = 0;
  let my = 0;

  if (ctx.keysDown.has(ctx.bindings.moveUp) || ctx.keysDown.has('ArrowUp')) my -= 1;
  if (ctx.keysDown.has(ctx.bindings.moveDown) || ctx.keysDown.has('ArrowDown')) my += 1;
  if (ctx.keysDown.has(ctx.bindings.moveLeft) || ctx.keysDown.has('ArrowLeft')) mx -= 1;
  if (ctx.keysDown.has(ctx.bindings.moveRight) || ctx.keysDown.has('ArrowRight')) mx += 1;

  if (lenVec(ctx.virtualMoveVec) > 0.08) {
    mx += ctx.virtualMoveVec.x;
    my += ctx.virtualMoveVec.y;
  }

  let gamepadAim: Vec2 | null = null;
  let gpSkill: number | null = null;
  let gpDodge = false;
  let gpFormShift = false;
  let gpSwap = false;

  if (typeof navigator !== 'undefined' && typeof navigator.getGamepads === 'function') {
    const pads = navigator.getGamepads();
    const pad = pads?.[0];
    if (pad) {
      const ax0 = pad.axes[0] ?? 0;
      const ax1 = pad.axes[1] ?? 0;
      const ax2 = pad.axes[2] ?? 0;
      const ax3 = pad.axes[3] ?? 0;
      if (Math.abs(ax0) > 0.18) mx += ax0;
      if (Math.abs(ax1) > 0.18) my += ax1;
      if (Math.hypot(ax2, ax3) > 0.25) {
        gamepadAim = normalizeVec({ x: ax2, y: ax3 });
      }
      if (pad.buttons[0]?.pressed) gpSkill = 0;
      if (pad.buttons[1]?.pressed) gpSkill = 1;
      if (pad.buttons[2]?.pressed) gpSkill = 2;
      if (pad.buttons[3]?.pressed) gpSkill = 3;
      if (pad.buttons[4]?.pressed || pad.buttons[6]?.pressed) gpDodge = true;
      if (pad.buttons[11]?.pressed || pad.buttons[5]?.pressed) gpFormShift = true;
      if (pad.buttons[7]?.pressed) gpSwap = true;
    }
  }

  const moveVec = lenVec({ x: mx, y: my }) > 0.05 ? normalizeVec({ x: mx, y: my }) : { x: 0, y: 0 };

  let castMoveSlotIndex: number | null = null;
  if (ctx.keysJustPressed.has(ctx.bindings.skill1)) castMoveSlotIndex = 0;
  else if (ctx.keysJustPressed.has(ctx.bindings.skill2)) castMoveSlotIndex = 1;
  else if (ctx.keysJustPressed.has(ctx.bindings.skill3)) castMoveSlotIndex = 2;
  else if (ctx.keysJustPressed.has(ctx.bindings.skill4)) castMoveSlotIndex = 3;
  else if (ctx.touchPendingSkill !== null) castMoveSlotIndex = ctx.touchPendingSkill;
  else if (gpSkill !== null) castMoveSlotIndex = gpSkill;

  const dodgePressed =
    ctx.keysJustPressed.has(ctx.bindings.dodge) ||
    ctx.touchPendingDodge ||
    gpDodge;

  const shiftHeld =
    ctx.keysDown.has('ShiftLeft') || ctx.keysDown.has('ShiftRight');
  const rawFormKey = ctx.keysJustPressed.has(ctx.bindings.formShift);

  const awakeningPressed =
    (rawFormKey && shiftHeld) ||
    ctx.keysJustPressed.has('KeyG') ||
    ctx.touchPendingAwakening;

  const formShiftPressed =
    (rawFormKey && !shiftHeld) ||
    ctx.touchPendingFormShift ||
    gpFormShift;

  let swapToBenchUnitId: string | null = null;
  if (
    ctx.keysJustPressed.has(ctx.bindings.quickSwap) ||
    ctx.touchPendingSwap ||
    gpSwap
  ) {
    const benchUnit = world.units.find(
      (u) => u.team === playerUnit.team && !u.isOnField && u.isAlive
    );
    if (benchUnit) {
      swapToBenchUnitId = benchUnit.instanceId;
    }
  }

  let aimVec: Vec2 | null = null;
  const selectedMoveId =
    castMoveSlotIndex !== null
      ? playerUnit.moveSlots[castMoveSlotIndex]?.moveId
      : null;
  const selectedMoveDef = selectedMoveId ? registry.moves[selectedMoveId] : null;
  const isDashOrPlacement =
    selectedMoveDef?.meleeSpec?.subtype === 'DASH' ||
    selectedMoveDef?.archetype === 'AOE_FIELD';

  if (gamepadAim) {
    aimVec = gamepadAim;
  } else if (isDashOrPlacement && lenVec(moveVec) > 0.1) {
    aimVec = moveVec;
  } else {
    let nearestEnemy: UnitRuntimeState | null = null;
    let nearestDist = Infinity;
    for (const u of world.units) {
      if (!u.isAlive || !u.isOnField || u.team === playerUnit.team) continue;
      const d = distVec(playerUnit.pos, u.pos);
      if (d < nearestDist) {
        nearestDist = d;
        nearestEnemy = u;
      }
    }
    if (nearestEnemy) {
      aimVec = normalizeVec(subVec(nearestEnemy.pos, playerUnit.pos), playerUnit.aimDir);
    } else if (lenVec(moveVec) > 0.1) {
      aimVec = moveVec;
    } else if (ctx.mouseDown && ctx.mouseLogicalPos) {
      aimVec = normalizeVec(subVec(ctx.mouseLogicalPos, playerUnit.pos), playerUnit.aimDir);
    }
  }

  return {
    unitId: playerUnit.instanceId,
    moveVec,
    aimVec,
    castMoveSlotIndex,
    dodgePressed,
    formShiftPressed,
    awakeningPressed,
    swapToBenchUnitId
  };
}
