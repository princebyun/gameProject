import type { IslandAmbientParticleKind } from '../../core/types/rpgSchemas';

export interface AmbientParticleItem {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  phase: number;
  kind: IslandAmbientParticleKind;
  color: string;
  alpha: number;
}

export function applyAmbientParticleKind(
  p: AmbientParticleItem,
  kind: IslandAmbientParticleKind,
  i: number
): void {
  p.kind = kind;
  if (kind === 'GULL') {
    p.color = '#f8fafc';
    p.vx = 0.7;
    p.vy = 0.05;
    p.size = 2;
    p.alpha = 0.65;
  } else if (kind === 'LEAF') {
    p.color = i % 2 === 0 ? '#4ade80' : '#86efac';
    p.vx = 0.45 + (i % 3) * 0.15;
    p.vy = 0.35 + (i % 2) * 0.2;
    p.size = 3;
    p.alpha = 0.72;
  } else if (kind === 'DROPLET') {
    p.color = '#e0f2fe';
    p.vx = ((i % 3) - 1) * 0.15;
    p.vy = -0.35 - (i % 2) * 0.2;
    p.size = 2;
    p.alpha = 0.58;
  } else if (kind === 'PETAL') {
    p.color = i % 2 === 0 ? '#fda4af' : '#f472b6';
    p.vx = 0.55 + (i % 3) * 0.2;
    p.vy = 0.42 + (i % 2) * 0.25;
    p.size = 4;
    p.alpha = 0.8;
  } else if (kind === 'LANTERN_MOTE') {
    p.color = '#fde047';
    p.vx = ((i % 2) * 2 - 1) * 0.18;
    p.vy = -0.32 - (i % 3) * 0.1;
    p.size = 3;
    p.alpha = 0.7;
  } else if (kind === 'HOLOGRAM') {
    p.color = i % 2 === 0 ? '#22d3ee' : '#c084fc';
    p.vx = 0;
    p.vy = -0.55 - (i % 3) * 0.15;
    p.size = 3;
    p.alpha = 0.7;
  } else if (kind === 'CLOUD_MIST') {
    p.color = '#bae6fd';
    p.vx = 0.38;
    p.vy = 0;
    p.size = 3;
    p.alpha = 0.28;
  } else if (kind === 'SMOKE') {
    p.color = i % 2 === 0 ? '#94a3b8' : '#64748b';
    p.vx = 0.22 + (i % 3) * 0.08;
    p.vy = -0.45 - (i % 2) * 0.15;
    p.size = 4;
    p.alpha = 0.35;
  } else if (kind === 'RAIN') {
    p.color = i % 2 === 0 ? '#bae6fd' : '#7dd3fc';
    p.vx = -1.4;
    p.vy = 4.6 + (i % 3) * 0.5;
    p.size = 2;
    p.alpha = 0.68;
  } else if (kind === 'SNOW') {
    p.color = i % 4 === 0 ? '#bae6fd' : '#f8fafc';
    p.vx = 0.25 - (i % 3) * 0.2;
    p.vy = 0.65 + (i % 3) * 0.25;
    p.size = i % 3 === 0 ? 3 : 2;
    p.alpha = 0.78;
  } else if (kind === 'SAND') {
    p.color = i % 2 === 0 ? '#fde68a' : '#fbbf24';
    p.vx = 1.9 + (i % 4) * 0.35;
    p.vy = 0.14;
    p.size = 3;
    p.alpha = 0.45;
  } else if (kind === 'BAT') {
    p.color = i % 2 === 0 ? '#312e81' : '#581c87';
    p.vx = ((i % 2) * 2 - 1) * (0.85 + (i % 3) * 0.15);
    p.vy = 0.08;
    p.size = 3;
    p.alpha = 0.85;
  } else if (kind === 'EMBER') {
    p.color = i % 2 === 0 ? '#f97316' : '#facc15';
    p.vx = i % 2 === 0 ? 0.35 : -0.25;
    p.vy = -0.75 - (i % 3) * 0.25;
    p.size = 3;
    p.alpha = 0.76;
  } else if (kind === 'BUBBLE') {
    p.color = i % 2 === 0 ? '#7dd3fc' : '#e0f2fe';
    p.vx = ((i % 3) - 1) * 0.15;
    p.vy = -0.58 - (i % 3) * 0.14;
    p.size = 3 + (i % 2);
    p.alpha = 0.62;
  } else if (kind === 'SUGAR_SPARKLE') {
    p.color = i % 3 === 0 ? '#fef08a' : i % 3 === 1 ? '#f9a8d4' : '#ffffff';
    p.vx = 0.18;
    p.vy = -0.22 - (i % 2) * 0.12;
    p.size = 3;
    p.alpha = 0.82;
  } else if (kind === 'GOLDEN_LEAF') {
    p.color = i % 2 === 0 ? '#facc15' : '#eab308';
    p.vx = 0.55 + (i % 3) * 0.18;
    p.vy = 0.42 + (i % 2) * 0.22;
    p.size = 4;
    p.alpha = 0.82;
  } else if (kind === 'LIGHTNING_SPARK') {
    p.color = i % 2 === 0 ? '#fef08a' : '#38bdf8';
    p.vx = ((i % 2) * 2 - 1) * 0.4;
    p.vy = -0.5;
    p.size = 3;
    p.alpha = 0.88;
  } else {
    p.color = '#bae6fd';
    p.vx = 0.45;
    p.vy = -0.15;
    p.size = 2;
    p.alpha = 0.38;
  }
}

export function renderAmbientParticle(
  ctx: CanvasRenderingContext2D,
  p: AmbientParticleItem,
  rx: number,
  ry: number,
  tick: number,
  idx: number
): void {
  ctx.globalAlpha = p.alpha;
  if (p.kind === 'GULL') {
    const wing = Math.sin(tick * 0.14 + p.phase) * 3;
    ctx.strokeStyle = p.color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(rx - 5, ry + wing);
    ctx.lineTo(rx, ry);
    ctx.lineTo(rx + 5, ry + wing);
    ctx.stroke();
  } else if (p.kind === 'BAT') {
    const wing = Math.sin(tick * 0.24 + p.phase) * 3;
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(rx - 1, ry - 1, 3, 3);
    ctx.strokeStyle = p.color;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(rx - 5, ry + wing);
    ctx.lineTo(rx, ry);
    ctx.lineTo(rx + 5, ry + wing);
    ctx.stroke();
  } else if (p.kind === 'RAIN') {
    ctx.strokeStyle = p.color;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(rx, ry);
    ctx.lineTo(rx - 3, ry + 9);
    ctx.stroke();
    if (idx % 4 === 0 && ry % 64 < 6) {
      ctx.strokeRect(rx - 4, ry + 8, 6, 3);
    }
  } else if (p.kind === 'SAND') {
    ctx.fillStyle = p.color;
    ctx.fillRect(rx, ry, p.size + 4, 2);
  } else if (p.kind === 'CLOUD_MIST' || p.kind === 'SMOKE') {
    ctx.fillStyle = p.color;
    ctx.fillRect(rx, ry, p.size * 5, p.size);
  } else if (p.kind === 'BUBBLE') {
    ctx.strokeStyle = p.color;
    ctx.lineWidth = 1;
    ctx.strokeRect(rx, ry, p.size + 1, p.size + 1);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(rx + 1, ry + 1, 1, 1);
  } else if (p.kind === 'SUGAR_SPARKLE') {
    if ((tick + idx * 5) % 24 < 18) {
      ctx.fillStyle = p.color;
      ctx.fillRect(rx - 1, ry, 3, 1);
      ctx.fillRect(rx, ry - 1, 1, 3);
    }
  } else if (p.kind === 'LIGHTNING_SPARK') {
    if ((tick + idx * 17) % 45 < 6) {
      ctx.fillStyle = p.color;
      ctx.fillRect(rx, ry, 2, 4);
      ctx.fillRect(rx + 2, ry + 3, 2, 4);
    }
  } else if (p.kind === 'PETAL' || p.kind === 'LEAF' || p.kind === 'GOLDEN_LEAF') {
    ctx.fillStyle = p.color;
    ctx.fillRect(rx, ry, p.size, p.size - 1);
    ctx.fillRect(rx + 1, ry + 1, p.size - 1, p.size - 1);
  } else {
    ctx.fillStyle = p.color;
    ctx.fillRect(rx, ry, p.size, p.size);
  }
}
