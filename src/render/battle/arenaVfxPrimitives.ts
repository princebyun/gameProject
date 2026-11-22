import type { Vec2 } from '../../core/math/vector2';
import type { GameDataRegistry } from '../../core/types/dataSchemas';

const ELEMENT_COLOR_CACHE = new WeakMap<GameDataRegistry, Map<string, string>>();

export function getElementColorFast(
  registry: GameDataRegistry,
  elementId: string,
  fallback = '#38bdf8'
): string {
  const direct = registry.elementsById?.get(elementId);
  if (direct) return direct.color;

  let map = ELEMENT_COLOR_CACHE.get(registry);
  if (!map) {
    map = new Map<string, string>();
    for (const el of registry.elements.elements) {
      map.set(el.id, el.color);
    }
    ELEMENT_COLOR_CACHE.set(registry, map);
  }
  return map.get(elementId) ?? fallback;
}

export function drawConquerorLightningBolts(
  ctx: CanvasRenderingContext2D,
  center: Vec2,
  radius: number,
  tick: number,
  boltCount: number = 4
): void {
  ctx.save();
  for (let i = 0; i < boltCount; i++) {
    const baseAngle = (i * Math.PI * 2) / boltCount + (tick % 11) * 0.27;
    const p1x = center.x + Math.cos(baseAngle) * (radius * 0.35);
    const p1y = center.y + Math.sin(baseAngle) * (radius * 0.35);
    const p2x = center.x + Math.cos(baseAngle + 0.22) * (radius * 0.7);
    const p2y = center.y + Math.sin(baseAngle + 0.22) * (radius * 0.7);
    const p3x = center.x + Math.cos(baseAngle - 0.14) * radius;
    const p3y = center.y + Math.sin(baseAngle - 0.14) * radius;

    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(center.x, center.y);
    ctx.lineTo(p1x, p1y);
    ctx.lineTo(p2x, p2y);
    ctx.lineTo(p3x, p3y);
    ctx.stroke();

    ctx.strokeStyle = '#090d16';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(center.x, center.y);
    ctx.lineTo(p1x, p1y);
    ctx.lineTo(p2x, p2y);
    ctx.lineTo(p3x, p3y);
    ctx.stroke();
  }
  ctx.restore();
}
