# Pro External Asset Credits & Licenses (Vertical Slice)

All files under `public/assets/pro/` are sourced from authentic external pixel-art packs or official external sprite sheets (zero procedural pixel/tile baking).

## 1. 5 Master External Biome Tilesets (CC0 1.0 Public Domain, Lossless WebP)
- `tilesets/master_port_village.tsx` -> `ninja_adventure_village.webp` (448x640, 16x16 grid):
  - Source: SparklinLabs / Pixel-Boy — **Superpowers Asset Packs / Ninja Adventure**
  - License: **CC0 1.0 Universal (Public Domain)**
  - URL: https://github.com/sparklinlabs/superpowers-asset-packs
- `tilesets/medieval_windmill_extras.tsx` -> `medieval_windmill_extras.webp` (320x192, 16x16 grid):
  - Source: SparklinLabs — **Superpowers Medieval Fantasy Pack**
  - License: **CC0 1.0 Universal (Public Domain)**
  - URL: https://github.com/sparklinlabs/superpowers-asset-packs
- `tilesets/master_animated_water.tsx` -> `ninja_animated_water.png` (64x16, 4x1 animated 16x16 water strip):
  - Source: OpenGameArt `voda_pesok_trava_revision_2.png` ocean wave frames
  - License: **CC0 1.0 Universal (Public Domain)**
- `tilesets/master_stone_canal.tsx` -> `master_stone_canal.webp` (256x256, Water Seven & coastal masonry):
  - Source: **Kenney RPG Pack**, **OpenGameArt CC0**, **HoangLong256 Pixel Buildings** (hot-swap override: `raw_assets/tilesets/master_stone_canal.png`)
  - License: **CC0 1.0 Universal (Public Domain)**
- `tilesets/master_desert_palace.tsx` -> `master_desert_palace.webp` (256x256, Alabasta sandstone plaza & oasis):
  - Source: **Kenney RPG Pack** + **Superpowers Asset Packs** desert sandstone compilation (hot-swap override: `raw_assets/tilesets/master_desert_palace.png`)
  - License: **CC0 1.0 Universal (Public Domain)**
- `tilesets/master_eastern_pagoda.tsx` -> `master_eastern_pagoda.webp` (256x256, Wano Country tiled roofs, bamboo & lanterns):
  - Source: **Superpowers / Pixel-Boy Ninja Adventure** + **OpenGameArt CC0** eastern architecture (hot-swap override: `raw_assets/tilesets/master_eastern_pagoda.png`)
  - License: **CC0 1.0 Universal (Public Domain)**
- `tilesets/master_scifi_neon.tsx` -> `master_scifi_neon.webp` (256x256, Egghead futuristic lab metal & neon conduits):
  - Source: **Kenney Sci-Fi / Superpowers Sci-Fi CC0** laboratory pack (hot-swap override: `raw_assets/tilesets/master_scifi_neon.png`)
  - License: **CC0 1.0 Universal (Public Domain)**

## 2. Parallax Battle Backdrops (CC0 / Permissive Open Game Art)
- `backgrounds/east_blue_harbor_layer{0..3}.png`:
  - Composed exclusively from external CC0 layers: Superpowers `backgrounds/1.png`, `rpg-battle-system/backgrounds/1.png`, OpenGameArt `parallax_background_forest`, and `Corrosive-Games/bevy-parallax` (`mills-back.png`, MIT/CC0).

## 3. VFX Atlases (CC0 / CC-BY)
- `vfx/*.png`: Superpowers Asset Packs **CC0 1.0** (`ninja-adventure/fx/*`, `rpg-battle-system/fx/*`) and OpenGameArt `Explosion_2.png` / `panorama18.png` (with clean black-key alpha unmultiplication).

## 4. Character Sprites & Cut-In Portraits (Personal Study / Vertical Slice)
- `sprites/luffy_base.{png,json}`, `zoro_base.{png,json}`, `buggy_base.{png,json}` & `portraits/*.png`:
  - Extracted cleanly into standard **Aseprite JSON Hash + `frameTags`** from Nintendo DS *One Piece: Gigant Battle! 1 & 2* sheets (`spritedatabase.net`, non-commercial study/reference).
