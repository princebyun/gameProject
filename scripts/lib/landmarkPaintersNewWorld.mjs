import {
  applyChromaticOutline,
  drawIslandMound,
  drawLine,
  drawWaveFoamBase,
  fillEllipse,
  fillRect,
  fillTriangle,
  makeCanvas,
  rgb
} from './landmarkPixelPrimitives.mjs';

export function paintNewWorldLandmarkFrame(id, w, h, f) {
  const img = makeCanvas(w, h);
  const cx = w / 2;
  const by = h - 18;

  if (id === 'fishman_island') {
    const byF = h - 18;
    // Double Bubble Dome on glowing reef
    fillEllipse(img, cx, byF - 8, 42, 13, rgb('#0369a1'));
    fillEllipse(img, cx, byF - 40, 38, 36, rgb('#0ea5e9', 150));
    fillEllipse(img, cx, byF - 40, 34, 32, rgb('#0284c7', 120));
    // Inner Coral Reefs & Ryugu Palace
    fillEllipse(img, cx - 16, byF - 18, 10, 6, rgb('#ec4899'));
    fillEllipse(img, cx + 18, byF - 18, 10, 6, rgb('#f472b6'));
    fillRect(img, cx - 16, byF - 46, 32, 24, rgb('#fde68a'));
    fillTriangle(img, cx - 20, byF - 46, cx + 20, byF - 46, cx, byF - 64, rgb('#ef4444'));
    // Outer Bubble specular glint & Sunlight Eve rays
    fillEllipse(img, cx - 18, byF - 58, 7, 4, rgb('#e0f2fe', 220));
    const shimmer = f % 2 === 0 ? 180 : 110;
    drawLine(img, cx - 12, byF - 88, cx - 6, byF - 60, rgb('#fef08a', shimmer), 2);
    drawLine(img, cx + 8, byF - 90, cx + 2, byF - 58, rgb('#fef08a', shimmer), 2);
    const outlined = applyChromaticOutline(img, '#16262e');
    drawWaveFoamBase(outlined, cx, byF + 5, 48, 12, f, '#7dd3fc', '#ffffff');
    return outlined;
  }

  if (id === 'dressrosa') {
    drawIslandMound(img, w, h, '#9a3412', '#c2410c', '#16a34a', '#4ade80', 14);
    // Corrida Colosseum circular stone arena on left
    fillRect(img, cx - 34, by - 38, 36, 22, rgb('#fed7aa'));
    fillEllipse(img, cx - 16, by - 38, 18, 7, rgb('#fb923c'));
    fillEllipse(img, cx - 16, by - 39, 12, 4, rgb('#7c2d12'));
    for (let ax = -28; ax <= -6; ax += 7) {
      fillRect(img, cx + ax, by - 30, 3, 7, rgb('#78350f'));
    }
    // Flower Hill + Royal Cliff Palace on right
    fillEllipse(img, cx + 22, by - 22, 16, 8, rgb('#eab308'));
    fillRect(img, cx + 10, by - 56, 24, 30, rgb('#f8fafc'));
    fillTriangle(img, cx + 8, by - 56, cx + 36, by - 56, cx + 22, by - 70, rgb('#ec4899'));
    fillRect(img, cx + 18, by - 44 + (f % 2), 6, 5, rgb('#f472b6'));
    const outlined = applyChromaticOutline(img, '#431407');
    drawWaveFoamBase(outlined, cx, by + 5, 48, 11, f);
    return outlined;
  }

  if (id === 'totto_land') {
    drawIslandMound(img, w, h, '#701a75', '#a21caf', '#fbcfe8', '#fdf2f8', 15);
    // 3-tier Whole Cake Chateau
    fillRect(img, cx - 26, by - 32, 52, 18, rgb('#f9a8d4'));
    fillRect(img, cx - 26, by - 34, 52, 4, rgb('#ffffff'));
    fillRect(img, cx - 18, by - 52, 36, 18, rgb('#f472b6'));
    fillRect(img, cx - 18, by - 54, 36, 4, rgb('#fef08a'));
    fillRect(img, cx - 10, by - 70, 20, 16, rgb('#db2777'));
    fillTriangle(img, cx - 12, by - 70, cx + 12, by - 70, cx, by - 84, rgb('#e11d48'));
    // Flickering candles & side candy spires
    const flameY = by - 88 - (f % 2);
    fillRect(img, cx - 1, flameY, 3, 5, rgb('#fde047'));
    fillRect(img, cx - 16, flameY + 26, 2, 4, rgb('#fb923c'));
    fillRect(img, cx + 14, flameY + 26, 2, 4, rgb('#fb923c'));
    fillEllipse(img, cx - 34, by - 22, 6, 8, rgb('#fbbf24'));
    fillEllipse(img, cx + 34, by - 22, 6, 8, rgb('#38bdf8'));
    const outlined = applyChromaticOutline(img, '#3b0764');
    drawWaveFoamBase(outlined, cx, by + 5, 48, 12, f, '#fbcfe8', '#ffffff');
    return outlined;
  }

  if (id === 'wano_onigashima') {
    const byW = h - 18;
    // Giant Skull Island Onigashima in background
    fillEllipse(img, cx + 12, byW - 44, 34, 24, rgb('#475569'));
    fillEllipse(img, cx + 12, byW - 46, 28, 20, rgb('#64748b'));
    // Skull Horns
    fillTriangle(img, cx - 16, byW - 58, cx - 4, byW - 62, cx - 28, byW - 88, rgb('#e2e8f0'));
    fillTriangle(img, cx + 40, byW - 58, cx + 28, byW - 62, cx + 52, byW - 88, rgb('#e2e8f0'));
    fillEllipse(img, cx + 4, byW - 44, 5, 4, rgb('#1e293b'));
    fillEllipse(img, cx + 20, byW - 44, 5, 4, rgb('#1e293b'));
    // Foreground Flower Capital Torii & Mt. Fuji Tiered Castle
    drawIslandMound(img, w, h, '#3f6212', '#4d7c0f', '#15803d', '#4ade80', 12);
    fillRect(img, cx - 32, byW - 40, 26, 20, rgb('#f1f5f9'));
    fillTriangle(img, cx - 36, byW - 40, cx - 2, byW - 40, cx - 19, byW - 56, rgb('#1e3a8a'));
    // Red Torii Gate
    fillRect(img, cx - 38, byW - 22, 3, 14, rgb('#dc2626'));
    fillRect(img, cx - 24, byW - 22, 3, 14, rgb('#dc2626'));
    fillRect(img, cx - 41, byW - 24, 22, 3, rgb('#ef4444'));
    // Floating Sakura petals (4 frames)
    for (let p = 0; p < 5; p++) {
      fillRect(img, cx - 40 + ((p * 19 + f * 4) % 80), byW - 76 + p * 8, 3, 2, rgb('#f9a8d4'));
    }
    const outlined = applyChromaticOutline(img, '#1e1b4b');
    drawWaveFoamBase(outlined, cx, byW + 5, 56, 12, f, '#fbcfe8', '#ffffff');
    return outlined;
  }

  if (id === 'egghead') {
    const byE = h - 18;
    drawIslandMound(img, w, h, '#1e293b', '#334155', '#0ea5e9', '#38bdf8', 12);
    // Translucent Frontier Dome shell + Punk Records Giant Apple Brain Lab
    fillEllipse(img, cx, byE - 40, 44, 34, rgb('#38bdf8', 125));
    fillEllipse(img, cx, byE - 40, 40, 30, rgb('#bae6fd', 75));
    // Punk Records Apple Lab inside dome
    fillEllipse(img, cx, byE - 40, 22, 18, rgb('#f8fafc'));
    fillEllipse(img, cx, byE - 56, 18, 8, rgb('#ef4444'));
    fillRect(img, cx - 2, byE - 72, 4, 14, rgb('#78350f'));
    // Orbiting Hologram Neon Ring animation
    const ringOff = (f % 4) * 8 - 12;
    drawLine(img, cx - 38, byE - 38, cx + 38, byE - 44, rgb('#22d3ee'), 2);
    fillRect(img, cx + ringOff, byE - 43, 6, 4, rgb('#fde047'));
    fillRect(img, cx - 20, byE - 24, 40, 8, rgb('#a855f7'));
    const outlined = applyChromaticOutline(img, '#0f172a');
    drawWaveFoamBase(outlined, cx, byE + 5, 56, 12, f, '#22d3ee', '#e0f2fe');
    return outlined;
  }

  if (id === 'elbaf') {
    const byL = h - 18;
    drawIslandMound(img, w, h, '#451a03', '#78350f', '#15803d', '#22c55e', 16);
    // Colossal World Tree Yggdrasil Trunk
    fillRect(img, cx - 16, byL - 74, 32, 62, rgb('#78350f'));
    fillRect(img, cx - 8, byL - 74, 16, 62, rgb('#92400e'));
    // Massive Spreading Crown Canopies
    fillEllipse(img, cx - 26, byL - 78, 24, 16, rgb('#15803d'));
    fillEllipse(img, cx + 26, byL - 78, 24, 16, rgb('#16a34a'));
    fillEllipse(img, cx, byL - 92, 34, 22, rgb('#22c55e'));
    fillEllipse(img, cx - 4, byL - 96, 22, 12, rgb('#eab308', 210));
    // Norse Viking War Hall + Docked Dragon Longship
    fillRect(img, cx - 28, byL - 30, 18, 12, rgb('#d97706'));
    fillRect(img, cx + 18, byL - 12, 22, 7, rgb('#b45309'));
    fillRect(img, cx + 26, byL - 22, 8, 8, rgb('#dc2626'));
    // Golden Leaf sparkles
    const lx = cx - 26 + ((f * 13) % 52);
    fillRect(img, lx, byL - 66 + (f % 2) * 4, 3, 3, rgb('#fef08a'));
    const outlined = applyChromaticOutline(img, '#2c1f16');
    drawWaveFoamBase(outlined, cx, byL + 6, 58, 13, f, '#fde047', '#ffffff');
    return outlined;
  }

  return null;
}
