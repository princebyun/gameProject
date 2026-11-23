import {
  applyChromaticOutline,
  drawIslandMound,
  drawLine,
  drawWaveFoamBase,
  fillEllipse,
  fillRect,
  fillTriangle,
  makeCanvas,
  rgb,
  setPx
} from './landmarkPixelPrimitives.mjs';

export function paintEastAndGrandLandmarkFrame(id, w, h, f) {
  const img = makeCanvas(w, h);
  const cx = w / 2;
  const by = h - 18;

  if (id === 'foosha_shells') {
    drawIslandMound(img, w, h, '#5c4033', '#8c6239', '#16a34a', '#4ade80', 16);
    // Cliff & Windmill on left
    fillEllipse(img, cx - 20, by - 24, 16, 12, rgb('#15803d'));
    fillRect(img, cx - 27, by - 52, 14, 28, rgb('#cbd5e1'));
    fillRect(img, cx - 23, by - 52, 6, 28, rgb('#f1f5f9'));
    fillTriangle(img, cx - 29, by - 52, cx - 11, by - 52, cx - 20, by - 64, rgb('#dc2626'));
    // Rotating 4-frame windmill sails
    const ang = (f * Math.PI) / 4;
    for (let s = 0; s < 4; s++) {
      const a = ang + (s * Math.PI) / 2;
      const sx = cx - 20 + Math.cos(a) * 14;
      const sy = by - 46 + Math.sin(a) * 14;
      drawLine(img, cx - 20, by - 46, sx, sy, rgb('#fef3c7'), 2);
    }
    // Red-roof village cottages
    fillRect(img, cx - 4, by - 30, 12, 10, rgb('#f8fafc'));
    fillTriangle(img, cx - 6, by - 30, cx + 10, by - 30, cx + 2, by - 37, rgb('#ef4444'));
    // Shells Town Marine Fortress & fluttering flag on right
    fillRect(img, cx + 12, by - 46, 22, 26, rgb('#e2e8f0'));
    fillRect(img, cx + 12, by - 46, 8, 26, rgb('#94a3b8'));
    fillRect(img, cx + 16, by - 34, 14, 4, rgb('#0284c7'));
    fillRect(img, cx + 22, by - 64, 2, 18, rgb('#64748b'));
    const wave = f % 2 === 0 ? 0 : 1;
    fillRect(img, cx + 24, by - 64 + wave, 11, 7, rgb('#f8fafc'));
    fillRect(img, cx + 27, by - 62 + wave, 4, 3, rgb('#0ea5e9'));
    // Wooden pier
    fillRect(img, cx - 8, by - 4, 18, 7, rgb('#92400e'));
    fillRect(img, cx - 8, by - 4, 18, 2, rgb('#d97706'));
    const outlined = applyChromaticOutline(img, '#1e293b');
    drawWaveFoamBase(outlined, cx, by + 5, 44, 11, f);
    return outlined;
  }

  if (id === 'orange_town') {
    drawIslandMound(img, w, h, '#6b4226', '#9a633c', '#65a30d', '#a3e635', 14);
    // Damaged brick town buildings
    fillRect(img, cx - 24, by - 28, 14, 14, rgb('#b45309'));
    fillRect(img, cx - 22, by - 25, 4, 4, rgb('#fef08a'));
    fillRect(img, cx + 12, by - 26, 12, 12, rgb('#9a3412'));
    // Big Top Buggy Circus Tent
    fillRect(img, cx - 14, by - 40, 28, 24, rgb('#f8fafc'));
    for (let sx = -12; sx <= 10; sx += 6) {
      fillRect(img, cx + sx, by - 40, 3, 24, rgb('#dc2626'));
    }
    fillTriangle(img, cx - 17, by - 40, cx + 17, by - 40, cx, by - 60, rgb('#ef4444'));
    fillTriangle(img, cx - 6, by - 40, cx + 6, by - 40, cx, by - 60, rgb('#fef08a'));
    // Rising smoke animation
    const smY = by - 58 - (f % 4) * 3;
    fillEllipse(img, cx + 16 + (f % 2), smY, 4, 3, rgb('#cbd5e1', 210));
    fillEllipse(img, cx + 19, smY - 6, 3, 2, rgb('#94a3b8', 180));
    fillRect(img, cx - 5, by - 4, 12, 6, rgb('#78350f'));
    const outlined = applyChromaticOutline(img, '#2b1d2e');
    drawWaveFoamBase(outlined, cx, by + 4, 38, 10, f);
    return outlined;
  }

  if (id === 'baratie') {
    const bob = f % 2 === 0 ? 0 : 1;
    // Side fin combat decks
    fillRect(img, cx - 42, by - 14 + bob, 84, 9, rgb('#92400e'));
    fillRect(img, cx - 40, by - 14 + bob, 80, 3, rgb('#f59e0b'));
    // Main restaurant ship hull
    fillEllipse(img, cx, by - 14 + bob, 32, 14, rgb('#1d4ed8'));
    fillEllipse(img, cx, by - 17 + bob, 28, 11, rgb('#38bdf8'));
    // Multi-tier cabin with warm portholes
    fillRect(img, cx - 22, by - 40 + bob, 44, 22, rgb('#fef3c7'));
    fillRect(img, cx - 18, by - 36 + bob, 6, 6, rgb('#f59e0b'));
    fillRect(img, cx - 4, by - 36 + bob, 8, 8, rgb('#fb923c'));
    fillRect(img, cx + 12, by - 36 + bob, 6, 6, rgb('#f59e0b'));
    fillTriangle(img, cx - 25, by - 40 + bob, cx + 25, by - 40 + bob, cx, by - 54 + bob, rgb('#dc2626'));
    // Iconic Giant Blue Fish Prow on left
    fillEllipse(img, cx - 28, by - 22 + bob, 11, 9, rgb('#0284c7'));
    fillEllipse(img, cx - 30, by - 24 + bob, 7, 5, rgb('#7dd3fc'));
    fillRect(img, cx - 35, by - 25 + bob, 3, 3, rgb('#fef08a'));
    // Mast & Chef hat top sign
    fillRect(img, cx - 2, by - 66 + bob, 4, 14, rgb('#78350f'));
    fillEllipse(img, cx, by - 68 + bob, 7, 4, rgb('#ffffff'));
    const outlined = applyChromaticOutline(img, '#172554');
    drawWaveFoamBase(outlined, cx, by + 4, 46, 10, f, '#7dd3fc', '#ffffff');
    return outlined;
  }

  if (id === 'arlong_park') {
    drawIslandMound(img, w, h, '#3f6212', '#65a30d', '#15803d', '#22c55e', 15);
    // Sawtooth multi-tier Pagoda Castle
    for (let t = 0; t < 3; t++) {
      const tw = 34 - t * 8;
      const ty = by - 26 - t * 15;
      fillRect(img, cx - tw / 2, ty, tw, 12, rgb(t % 2 === 0 ? '#e0f2fe' : '#cbd5e1'));
      // Sawtooth eave
      fillTriangle(img, cx - tw / 2 - 5, ty, cx + tw / 2 + 5, ty, cx, ty - 9, rgb('#0284c7'));
      fillRect(img, cx - tw / 2 - 4, ty - 2, tw + 8, 3, rgb('#0369a1'));
    }
    // Shark emblem gate in center
    fillRect(img, cx - 9, by - 26, 18, 12, rgb('#1e293b'));
    fillTriangle(img, cx - 4, by - 26, cx + 4, by - 26, cx, by - 36, rgb('#38bdf8'));
    // Palms on left & right
    const sway = (f % 2) * 1;
    drawLine(img, cx - 28, by - 16, cx - 31 + sway, by - 36, rgb('#78350f'), 2);
    fillEllipse(img, cx - 31 + sway, by - 38, 8, 4, rgb('#22c55e'));
    drawLine(img, cx + 28, by - 16, cx + 31 - sway, by - 36, rgb('#78350f'), 2);
    fillEllipse(img, cx + 31 - sway, by - 38, 8, 4, rgb('#22c55e'));
    const outlined = applyChromaticOutline(img, '#16262e');
    drawWaveFoamBase(outlined, cx, by + 5, 44, 11, f);
    return outlined;
  }

  if (id === 'loguetown') {
    drawIslandMound(img, w, h, '#475569', '#64748b', '#94a3b8', '#cbd5e1', 15);
    // Harbor buildings & lighthouse on right
    fillRect(img, cx - 28, by - 30, 16, 16, rgb('#94a3b8'));
    fillRect(img, cx + 20, by - 50, 10, 34, rgb('#f8fafc'));
    fillRect(img, cx + 20, by - 38, 10, 6, rgb('#dc2626'));
    fillRect(img, cx + 21, by - 55, 8, 5, rgb('#fde047'));
    // Rotating lighthouse beam
    const beamDir = f < 2 ? 1 : -1;
    drawLine(img, cx + 25, by - 53, cx + 25 + beamDir * 16, by - 58, rgb('#fef08a', 200), 2);
    // Central Execution Scaffold Tower
    fillRect(img, cx - 10, by - 46, 20, 30, rgb('#78350f'));
    fillRect(img, cx - 13, by - 46, 26, 4, rgb('#b45309'));
    fillRect(img, cx - 7, by - 60, 2, 14, rgb('#451a03'));
    fillRect(img, cx + 5, by - 60, 2, 14, rgb('#451a03'));
    fillRect(img, cx - 9, by - 63, 18, 4, rgb('#92400e'));
    // Dark storm clouds above tower
    fillEllipse(img, cx - 8 + (f % 2), by - 78, 14, 7, rgb('#334155'));
    fillEllipse(img, cx + 9, by - 76, 13, 6, rgb('#1e293b'));
    const outlined = applyChromaticOutline(img, '#1b2438');
    drawWaveFoamBase(outlined, cx, by + 5, 44, 11, f);
    return outlined;
  }

  if (id === 'gate_reverse_mountain') {
    const byM = h - 18;
    // Giant red cliffs flanking central reverse canal
    fillTriangle(img, cx - 50, byM, cx - 6, byM, cx - 18, byM - 78, rgb('#991b1b'));
    fillTriangle(img, cx - 44, byM - 4, cx - 8, byM - 4, cx - 22, byM - 74, rgb('#dc2626'));
    fillTriangle(img, cx + 6, byM, cx + 50, byM, cx + 18, byM - 78, rgb('#991b1b'));
    fillTriangle(img, cx + 8, byM - 4, cx + 44, byM - 4, cx + 22, byM - 74, rgb('#dc2626'));
    // Snow peak cap & central peak arch
    fillTriangle(img, cx - 18, byM - 74, cx + 18, byM - 74, cx, byM - 94, rgb('#e2e8f0'));
    // Upward rushing 4-canal water animation
    fillRect(img, cx - 8, byM - 74, 16, 74, rgb('#0284c7'));
    for (let ry = 0; ry < 5; ry++) {
      const yy = byM - ((ry * 16 + f * 4) % 72) - 4;
      fillRect(img, cx - 5, yy, 10, 5, rgb('#7dd3fc'));
      fillRect(img, cx - 3, yy + 1, 6, 2, rgb('#ffffff'));
    }
    const outlined = applyChromaticOutline(img, '#2c1317');
    drawWaveFoamBase(outlined, cx, byM + 5, 52, 12, f, '#bae6fd', '#ffffff');
    return outlined;
  }

  if (id === 'drum_kingdom') {
    // Cylindrical Drum Rockies snow cliffs + top castle
    fillEllipse(img, cx, by, 40, 12, rgb('#475569'));
    fillRect(img, cx - 18, by - 58, 36, 54, rgb('#cbd5e1'));
    fillRect(img, cx - 8, by - 58, 16, 54, rgb('#f8fafc'));
    fillEllipse(img, cx, by - 58, 21, 7, rgb('#e2e8f0'));
    // Side drum rockies
    fillRect(img, cx - 34, by - 38, 14, 34, rgb('#94a3b8'));
    fillEllipse(img, cx - 27, by - 38, 8, 4, rgb('#f1f5f9'));
    // Drum Castle on peak
    fillRect(img, cx - 14, by - 76, 28, 18, rgb('#64748b'));
    fillTriangle(img, cx - 16, by - 76, cx - 4, by - 76, cx - 10, by - 88, rgb('#e11d48'));
    fillTriangle(img, cx + 4, by - 76, cx + 16, by - 76, cx + 10, by - 88, rgb('#e11d48'));
    // Falling snow / sakura sparkles
    for (let s = 0; s < 5; s++) {
      const sy = by - 80 + ((s * 17 + f * 5) % 64);
      const sx = cx - 28 + s * 14;
      fillRect(img, sx, sy, 2, 2, rgb(s % 2 === 0 ? '#ffffff' : '#f9a8d4'));
    }
    const outlined = applyChromaticOutline(img, '#1e293b');
    drawWaveFoamBase(outlined, cx, by + 5, 44, 11, f);
    return outlined;
  }

  if (id === 'alabasta') {
    drawIslandMound(img, w, h, '#92400e', '#b45309', '#f59e0b', '#fcd34d', 14);
    // Sandstone Alubarna Dome Palace + Clock Tower
    fillRect(img, cx - 22, by - 36, 32, 22, rgb('#fde68a'));
    fillEllipse(img, cx - 6, by - 38, 14, 12, rgb('#fbbf24'));
    fillRect(img, cx - 8, by - 54, 4, 8, rgb('#d97706'));
    // Clock Tower on right
    fillRect(img, cx + 14, by - 60, 12, 46, rgb('#fcd34d'));
    fillRect(img, cx + 17, by - 55, 6, 6, rgb('#f8fafc'));
    setPx(img, cx + 20, by - 52, rgb('#0f172a'));
    fillTriangle(img, cx + 12, by - 60, cx + 28, by - 60, cx + 20, by - 71, rgb('#b45309'));
    // Oasis palms shimmer
    fillEllipse(img, cx - 28, by - 22, 6, 3, rgb('#0ea5e9'));
    drawLine(img, cx - 32, by - 22, cx - 34, by - 35, rgb('#78350f'), 2);
    fillEllipse(img, cx - 34 + (f % 2), by - 36, 7, 3, rgb('#22c55e'));
    const outlined = applyChromaticOutline(img, '#451a03');
    drawWaveFoamBase(outlined, cx, by + 5, 44, 11, f);
    return outlined;
  }

  if (id === 'skypiea') {
    const byS = h - 20;
    // White cloud sea island base
    fillEllipse(img, cx - 22, byS - 8, 22, 10, rgb('#cbd5e1'));
    fillEllipse(img, cx + 22, byS - 8, 22, 10, rgb('#cbd5e1'));
    fillEllipse(img, cx, byS - 10, 34, 13, rgb('#f8fafc'));
    // Giant Green Beanstalk curling upward
    for (let k = 0; k < 6; k++) {
      const bx = cx - 4 + Math.sin(k * 0.9) * 10;
      const yy = byS - 18 - k * 11;
      fillEllipse(img, bx, yy, 8, 7, rgb(k % 2 === 0 ? '#16a34a' : '#22c55e'));
    }
    // Golden Bellfry Tower at top
    fillRect(img, cx - 10, byS - 84, 20, 18, rgb('#e2e8f0'));
    fillTriangle(img, cx - 12, byS - 84, cx + 12, byS - 84, cx, byS - 96, rgb('#f59e0b'));
    const bellGlow = f % 2 === 0 ? '#fef08a' : '#facc15';
    fillEllipse(img, cx, byS - 74, 5, 6, rgb(bellGlow));
    if (f === 1 || f === 3) {
      fillRect(img, cx + 12, byS - 86, 3, 3, rgb('#ffffff'));
      fillRect(img, cx - 15, byS - 80, 3, 3, rgb('#fef08a'));
    }
    const outlined = applyChromaticOutline(img, '#1e3a8a');
    drawWaveFoamBase(outlined, cx, byS + 6, 48, 12, f, '#e0f2fe', '#ffffff');
    return outlined;
  }

  if (id === 'water_seven') {
    drawIslandMound(img, w, h, '#1e3a8a', '#0284c7', '#e2e8f0', '#f8fafc', 12);
    // Stepped canal city tiers
    fillRect(img, cx - 40, by - 26, 80, 14, rgb('#cbd5e1'));
    fillRect(img, cx - 30, by - 40, 60, 14, rgb('#e2e8f0'));
    fillRect(img, cx - 18, by - 54, 36, 14, rgb('#f8fafc'));
    // Blue Canal Arch Bridge in front
    fillRect(img, cx - 14, by - 16, 28, 7, rgb('#0ea5e9'));
    fillEllipse(img, cx, by - 17, 10, 5, rgb('#f59e0b'));
    // Red-tiled roofs along tiers
    fillRect(img, cx - 34, by - 30, 12, 5, rgb('#dc2626'));
    fillRect(img, cx + 22, by - 30, 12, 5, rgb('#dc2626'));
    fillRect(img, cx - 22, by - 44, 12, 5, rgb('#ef4444'));
    fillRect(img, cx + 10, by - 44, 12, 5, rgb('#ef4444'));
    // Giant Iceburg top fountain & animated Aqua Plume
    fillEllipse(img, cx, by - 58, 12, 6, rgb('#38bdf8'));
    const jetH = 14 + (f % 3) * 4;
    fillRect(img, cx - 3, by - 58 - jetH, 6, jetH, rgb('#7dd3fc'));
    fillEllipse(img, cx, by - 58 - jetH, 9, 4, rgb('#ffffff'));
    const outlined = applyChromaticOutline(img, '#172554');
    drawWaveFoamBase(outlined, cx, by + 5, 50, 11, f);
    return outlined;
  }

  if (id === 'thriller_bark') {
    // Gothic Ghost-Ship Island inside purple mist
    fillEllipse(img, cx, by - 10, 48, 16, rgb('#312e81'));
    fillEllipse(img, cx, by - 14, 42, 12, rgb('#4c1d95'));
    // Giant open-mouth castle gate hull
    fillRect(img, cx - 34, by - 34, 68, 22, rgb('#334155'));
    fillEllipse(img, cx, by - 22, 14, 9, rgb('#0f172a'));
    // Tooth spikes around mouth gate
    for (let t = -10; t <= 10; t += 5) {
      fillRect(img, cx + t, by - 30, 2, 4, rgb('#e2e8f0'));
      fillRect(img, cx + t, by - 17, 2, 4, rgb('#cbd5e1'));
    }
    // Tall gothic central mast & spooky mansion spires
    fillRect(img, cx - 18, by - 54, 36, 20, rgb('#475569'));
    fillTriangle(img, cx - 22, by - 54, cx - 6, by - 54, cx - 14, by - 76, rgb('#6b21a8'));
    fillTriangle(img, cx + 6, by - 54, cx + 22, by - 54, cx + 14, by - 76, rgb('#6b21a8'));
    fillRect(img, cx - 2, by - 78, 4, 44, rgb('#1e293b'));
    fillRect(img, cx - 10, by - 66, 20, 12, rgb('#dc2626', 180));
    // Orbiting purple fog / bats
    fillEllipse(img, cx - 32 + f * 3, by - 58, 7, 3, rgb('#a855f7', 190));
    fillRect(img, cx + 26 - f * 2, by - 66, 3, 2, rgb('#1e1b4b'));
    const outlined = applyChromaticOutline(img, '#1e1b4b');
    drawWaveFoamBase(outlined, cx, by + 5, 52, 11, f, '#c084fc', '#e9d5ff');
    return outlined;
  }

  if (id === 'marineford') {
    const byF = h - 18;
    // Crescent Ice Harbor flanking bay
    fillEllipse(img, cx - 36, byF - 8, 22, 10, rgb('#bae6fd'));
    fillEllipse(img, cx + 36, byF - 8, 22, 10, rgb('#bae6fd'));
    fillEllipse(img, cx, byF - 20, 44, 14, rgb('#e2e8f0'));
    // Monumental Japanese Marine HQ Fortress tiers
    fillRect(img, cx - 34, byF - 46, 68, 26, rgb('#f1f5f9'));
    fillRect(img, cx - 38, byF - 48, 76, 5, rgb('#1e3a8a'));
    fillRect(img, cx - 24, byF - 66, 48, 20, rgb('#f8fafc'));
    fillRect(img, cx - 28, byF - 68, 56, 5, rgb('#1d4ed8'));
    fillRect(img, cx - 14, byF - 82, 28, 16, rgb('#ffffff'));
    fillTriangle(img, cx - 18, byF - 82, cx + 18, byF - 82, cx, byF - 94, rgb('#0f172a'));
    // "MARINE" blue emblem & flag flutter
    fillRect(img, cx - 7, byF - 58, 14, 7, rgb('#0284c7'));
    fillRect(img, cx - 1, byF - 104, 2, 12, rgb('#64748b'));
    fillRect(img, cx + 1, byF - 104 + (f % 2), 10, 6, rgb('#38bdf8'));
    const outlined = applyChromaticOutline(img, '#172554');
    drawWaveFoamBase(outlined, cx, byF + 5, 58, 12, f, '#bae6fd', '#ffffff');
    return outlined;
  }

  if (id === 'impel_down') {
    drawIslandMound(img, w, h, '#312e81', '#4338ca', '#475569', '#64748b', 10);
    // Tall Grim Undersea Prison Tower rising from vortex
    fillRect(img, cx - 18, by - 64, 36, 50, rgb('#3b0764'));
    fillRect(img, cx - 12, by - 64, 24, 50, rgb('#581c87'));
    // Vertical iron bars & gothic battlement top
    for (let bx = -14; bx <= 14; bx += 7) {
      fillRect(img, cx + bx, by - 62, 2, 46, rgb('#1e293b'));
    }
    fillRect(img, cx - 22, by - 70, 44, 7, rgb('#475569'));
    fillTriangle(img, cx - 22, by - 70, cx - 8, by - 70, cx - 15, by - 82, rgb('#64748b'));
    fillTriangle(img, cx + 8, by - 70, cx + 22, by - 70, cx + 15, by - 82, rgb('#64748b'));
    // Glowing danger beacon
    const gem = f % 2 === 0 ? '#ef4444' : '#f97316';
    fillRect(img, cx - 3, by - 46, 6, 10, rgb(gem));
    const outlined = applyChromaticOutline(img, '#1e1b4b');
    drawWaveFoamBase(outlined, cx, by + 5, 42, 11, f, '#a855f7', '#e9d5ff');
    return outlined;
  }

  if (id === 'gate_red_line') {
    const byR = h - 18;
    // Monumental Red Continent Cliff Wall
    fillRect(img, cx - 54, byR - 74, 108, 66, rgb('#991b1b'));
    fillRect(img, cx - 48, byR - 86, 96, 20, rgb('#b91c1c'));
    fillRect(img, cx - 44, byR - 90, 88, 6, rgb('#e2e8f0')); // Snowy Red Line summit
    // Submarine arch dive tunnel + animated Yarukiman Coating Bubble
    fillEllipse(img, cx, byR - 22, 22, 20, rgb('#0f172a'));
    fillEllipse(img, cx, byR - 20, 17, 15, rgb('#0369a1'));
    const pulse = (f % 2) * 2;
    fillEllipse(img, cx, byR - 18, 12 + pulse, 10 + pulse, rgb('#38bdf8', 210));
    fillEllipse(img, cx - 4, byR - 22, 4, 3, rgb('#ffffff'));
    const outlined = applyChromaticOutline(img, '#2c1317');
    drawWaveFoamBase(outlined, cx, byR + 5, 60, 13, f, '#7dd3fc', '#ffffff');
    return outlined;
  }

  return null;
}
