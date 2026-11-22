import type {
  ColosseumBracketMatch,
  ColosseumTournamentState
} from '../core/endgame/types';

/**
 * Renders the 8-player Corrida Colosseum Tournament Bracket (QF -> SF -> FINAL -> Champion)
 * onto an HTML5 2D Canvas cleanly for both desktop and mobile (390x844) viewports.
 */
export function renderColosseumBracketCanvas(
  canvas: HTMLCanvasElement,
  tournament: ColosseumTournamentState
): void {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const w = canvas.width;
  const h = canvas.height;
  ctx.save();
  ctx.imageSmoothingEnabled = false;

  // Arena colosseum dark slate backdrop
  ctx.fillStyle = '#0b1120';
  ctx.fillRect(0, 0, w, h);
  ctx.strokeStyle = '#ca8a04';
  ctx.lineWidth = 2;
  ctx.strokeRect(2, 2, w - 4, h - 4);

  // Header
  ctx.font = 'bold 13px monospace';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#facc15';
  ctx.fillText(
    `🏟 코리다 콜로세움 ${tournament.tierId}급 8강 대진표 ${tournament.ringOutEnabled ? '[🌊 링아웃 리그]' : '[⚔ 일반 결투]'}`,
    w * 0.5,
    22
  );

  // Column labels
  const cols = [
    { label: '8강 (QF)', x: 16 },
    { label: '4강 (SF)', x: Math.round(w * 0.34) },
    { label: '결승 (FINAL)', x: Math.round(w * 0.64) }
  ];
  const boxW = Math.max(120, Math.round(w * 0.27));
  const boxH = 44;

  ctx.font = 'bold 10px monospace';
  ctx.textAlign = 'left';
  ctx.fillStyle = '#94a3b8';
  for (const col of cols) {
    ctx.fillText(col.label, col.x + 4, 42);
  }

  const qf = tournament.matches.filter((m) => m.round === 'QF');
  const sf = tournament.matches.filter((m) => m.round === 'SF');
  const fin = tournament.matches.find((m) => m.round === 'FINAL');

  const qfYs = [52, 108, 168, 224];
  const sfYs = [80, 196];
  const finY = 138;

  const drawMatchBox = (match: ColosseumBracketMatch, x: number, y: number) => {
    const isPlayerMatch = Boolean(
      match.participantA?.isPlayer || match.participantB?.isPlayer
    );
    const isActive =
      !match.completed && match.round === tournament.currentRound && isPlayerMatch;

    ctx.fillStyle = isActive
      ? 'rgba(234, 179, 8, 0.2)'
      : match.completed
        ? 'rgba(30, 41, 59, 0.92)'
        : 'rgba(15, 23, 42, 0.85)';
    ctx.fillRect(x, y, boxW, boxH);
    ctx.strokeStyle = isActive
      ? '#facc15'
      : match.completed
        ? '#38bdf8'
        : '#334155';
    ctx.lineWidth = isActive ? 2 : 1.2;
    ctx.strokeRect(x, y, boxW, boxH);

    // Divider
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.25)';
    ctx.beginPath();
    ctx.moveTo(x, y + boxH * 0.5);
    ctx.lineTo(x + boxW, y + boxH * 0.5);
    ctx.stroke();

    const drawSlot = (
      comp: ColosseumBracketMatch['participantA'],
      slotY: number
    ) => {
      const name = comp ? comp.displayName : 'TBD';
      const isWinner = Boolean(comp && match.winner && match.winner.slotIndex === comp.slotIndex);
      ctx.font = isWinner || comp?.isPlayer ? 'bold 10px monospace' : '10px monospace';
      ctx.textAlign = 'left';
      ctx.fillStyle = isWinner
        ? '#4ade80'
        : comp?.isPlayer
          ? '#fde047'
          : '#cbd5e1';
      const clipped = name.length > 16 ? `${name.slice(0, 15)}…` : name;
      ctx.fillText(isWinner ? `★ ${clipped}` : clipped, x + 6, slotY);
    };

    drawSlot(match.participantA, y + 15);
    drawSlot(match.participantB, y + 36);
  };

  // Connectors QF -> SF
  const col0 = cols[0];
  const col1 = cols[1];
  const col2 = cols[2];
  if (!col0 || !col1 || !col2) {
    ctx.restore();
    return;
  }

  ctx.strokeStyle = '#475569';
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 4; i++) {
    const qfY = qfYs[i];
    const targetSfIdx = Math.floor(i / 2);
    const sfY = sfYs[targetSfIdx];
    if (qfY === undefined || sfY === undefined) continue;
    const startX = col0.x + boxW;
    const startY = qfY + boxH * 0.5;
    const endX = col1.x;
    const endY = sfY + boxH * 0.5;
    const midX = (startX + endX) * 0.5;
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.lineTo(midX, startY);
    ctx.lineTo(midX, endY);
    ctx.lineTo(endX, endY);
    ctx.stroke();
  }

  // Connectors SF -> FINAL
  for (let i = 0; i < 2; i++) {
    const sfY = sfYs[i];
    if (sfY === undefined) continue;
    const startX = col1.x + boxW;
    const startY = sfY + boxH * 0.5;
    const endX = col2.x;
    const endY = finY + boxH * 0.5;
    const midX = (startX + endX) * 0.5;
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.lineTo(midX, startY);
    ctx.lineTo(midX, endY);
    ctx.lineTo(endX, endY);
    ctx.stroke();
  }

  qf.forEach((m, i) => {
    const qy = qfYs[i];
    if (qy !== undefined) drawMatchBox(m, col0.x, qy);
  });
  sf.forEach((m, i) => {
    const sy = sfYs[i];
    if (sy !== undefined) drawMatchBox(m, col1.x, sy);
  });
  if (fin) {
    drawMatchBox(fin, col2.x, finY);
  }

  // Champion banner
  if (tournament.champion) {
    ctx.fillStyle = 'rgba(234, 179, 8, 0.22)';
    ctx.fillRect(col2.x, finY + boxH + 14, boxW, 38);
    ctx.strokeStyle = '#facc15';
    ctx.lineWidth = 2;
    ctx.strokeRect(col2.x, finY + boxH + 14, boxW, 38);
    ctx.font = 'bold 10px monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#fde047';
    ctx.fillText('🏆 CHAMPION', col2.x + boxW * 0.5, finY + boxH + 29);
    ctx.fillStyle = '#ffffff';
    ctx.fillText(
      tournament.champion.displayName.slice(0, 18),
      col2.x + boxW * 0.5,
      finY + boxH + 45
    );
  }

  ctx.restore();
}
