# Visual & UI Benchmark (`https://reso.jhcloud.kr/`)

> **Benchmark Source:** `https://reso.jhcloud.kr/` (포켓몬 레조넌스 v3.0.0 — Trailer `1280×720`, Raw Engine Captures `320×180`, 1080p Overworld/Battle Captures)
> **Purpose:** Quantitative target bar for `One Piece Grand Voyage` Step 2 renderer overhaul (`LayeredTilemapRenderer`, `IslandYSortQueue`, `AmbientParticleSystem`, `AtmosphereLightingOverlay`, `ParallaxBattleBackdrop`, `VfxAtlasRenderer`, `SpriteFrameRenderer`).

---

## 1. Resolution, Viewport & Scaling Rules

| Metric | `reso.jhcloud.kr` Baseline | `One Piece Grand Voyage` Target Mapping |
| :--- | :--- | :--- |
| **Native Pixel Tile Size** | `16 × 16 px` | `16 × 16 px` atlas tiles (`renderScale: 2` → `32 × 32 px` logical world unit) |
| **Logical Canvas & Aspect** | `320 × 180` (`20 × 11.25` tiles visible) → 4× integer zoom (`1280×720`) | `960–1260 × 540` dynamic width (`19.5:9` S25 Ultra = `1170 × 540`, `arenaOffsetX = 105`), crisp `imageSmoothingEnabled = false` |
| **Pixel vs. HUD Separation** | Nearest-neighbor world/sprites + sharp output-res HUD text & additive glow | World/sprites snapped with `Math.round()`, HUD typography sharp at DPR (`<= 3`) |

---

## 2. Field / Map Tile Density & 7-Layer Composition

1. **Zero Flat Solid Tiles (`Layer 0`):**
   - Ground never uses uniform single-color fills. Grass mixes multi-tone dappled green bases with 2–3px grass tufts and deterministic coordinate hash variation (`hashTileVariant(col, row, seed)`).
   - Stone plazas use beveled flagstones with warm mortar joints; interiors/docks use planked wood seams or diagonal checkerboard tiling.
2. **Organic Autotiles, Water Foam & Contact Shadows (`Layer 1`):**
   - Dirt paths, cliff rims, and coastal edges use scalloped/organic 4-cardinal autotile borders rather than straight geometric lines.
   - Saturated cobalt water (`#2C6BE0`–`#3574E8`) renders 4-frame animated wave textures + **2–3px bright sky-blue/white animated foam halos** around shores, docks, and protruding rocks.
   - Buildings, fences, trees, and cliffs cast a **3–5px dark contact shadow** directly along their southern base onto the ground.
3. **Architecture & Prop Density (`Layer 2` Walls + `Layer 4` Overhead):**
   - Houses/buildings span `4×4` to `6×5` tiles (`64×64` to `96×80` native) with 3/4 top-down depth: recessed doors, multi-pane blue-reflective windows, picket fences (`1×1`), signposts, streetlights (`1×2`), crates/barrels.
   - Roofs (pitched terracotta, Wano curved tile, Egghead dome), upper eaves, port arches, and `2×2`/`2×3` overlapping 4-tone cel-shaded tree canopies render in **Overhead Layer 4** after entities so characters pass cleanly underneath.
4. **Lively Y-Sorted World (`Layer 3`):**
   - Characters, **3–5 NPCs per town screen**, **1 trailing crew follower 1 tile behind the player**, boss encounters, flags, torches, and tree trunks sort strictly by `footY`.
   - Every NPC uses pixel sprite/portrait art (zero bare circle placeholders) + compact dark translucent elliptical foot shadow (`~12×4` scaled) + crisp 1px dark `#111118` outer outline.
5. **Atmospheric Particles & Day/Night Lighting (`Layer 5` & `Layer 6`):**
   - Pooled biome particles (petals, snow, sand, sea spray/gulls, lab holograms, embers).
   - Low-cost offscreen lighting wash (`DAY` warm clarity, `DUSK` warm-cool tint + glowing cyan lantern pools, `NIGHT` `-35~45%` indigo wash) + soft edge vignette, strictly **0 `ctx.shadowBlur`**.

---

## 3. Battle Scene Density, Perspective & Readability

1. **Multi-Layer Parallax Arena (`ParallaxBattleBackdrop`):**
   - Full-width `1280×540` 3-tier parallax (`sky 0.12x`, `mid 0.42x`, `ground 1.0x`) covering `960–1260px` viewports and `0.88x` giant-boss zoom-out with zero seams or letterboxing.
   - **Figure-Ground Contrast:** Arena floors (stone ring, desert sand, wooden deck, stadium turf, lab floor) stay deliberately muted/lower-contrast so combatants, glowing cyan/red underfoot team rings (`#3BA8FF` / `#FF5252`) with aim triangles, telegraphs, and VFX pop immediately.
   - **Persistent Impact Decals:** Fire/explosive impacts stamp bounded scorch/crack decals onto the battle floor.
2. **Combatant Scale Proportions:**
   - Standard combatants: **~18–22% of viewport height** (`~97–120px` display height on `540px` logical canvas).
   - Large/Boss units & Giant Beasts: **~31–36% of viewport height** (`~168–195px` display height), creating clear visual awe.
   - Normalized across `48px`–`128px` external sprite sheets with `0px` foot baseline jitter (`anchor.y`).
3. **Pixel + Impact VFX:**
   - Sprite-sheet frame-animated slashes, fire explosions, lightning/conqueror bolts, ice shatters, water splashes, hit sparks, parry flashes, and beam cores rendered crisp (`imageSmoothingEnabled = false`) alongside clean hitbox telegraphs and zero-blur UI chrome (`#1E1E2E` panels, light inner border, `#F2B84B` gold accents).
