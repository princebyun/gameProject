import { describe, expect, it } from 'vitest';
import { DEFAULT_VISUAL_POLISH_CONFIG } from '../../src/render/backend/renderBackend';
import {
  computeSunShadowForTimeOfDay
} from '../../src/render/pixi/shaders/DynamicLightingLayer';
import {
  computeEffectiveBloomIntensity
} from '../../src/render/pixi/shaders/SelectiveBloomFilter';
import {
  TIME_OF_DAY_PROFILES
} from '../../src/render/pixi/shaders/glslUtils';
import {
  computeChunkVisibility,
  computeOverheadProximityTargetAlpha
} from '../../src/render/pixi/tiled/TiledMapLoader';
import {
  decodeTiledGid,
  parseTiledMapData
} from '../../src/render/pixi/tiled/tiledSchema';

describe('Step 2: Tiled .tmj Loader, Chunk Culling & WebGL2 Shader Guards', () => {
  it('decodes Tiled flip flags (H/V/D) and parses multi-layer .tmj with animated tiles & custom objects', () => {
    const rawFlipped = (0x80000000 | 0x20000000 | 42) >>> 0;
    const dec = decodeTiledGid(rawFlipped);
    expect(dec.gid).toBe(42);
    expect(dec.flipH).toBe(true);
    expect(dec.flipV).toBe(false);
    expect(dec.flipD).toBe(true);

    const sampleTmj = {
      width: 4,
      height: 3,
      tilewidth: 16,
      tileheight: 16,
      properties: [{ name: 'pixelScale', type: 'int', value: 2 }],
      tilesets: [
        {
          firstgid: 1,
          name: 'village',
          tilewidth: 16,
          tileheight: 16,
          tilecount: 16,
          columns: 4,
          image: 'assets/pro/tilesets/ninja_adventure_village.png',
          imagewidth: 64,
          imageheight: 64,
          tiles: [
            {
              id: 2,
              animation: [
                { tileid: 2, duration: 250 },
                { tileid: 3, duration: 250 }
              ]
            }
          ]
        }
      ],
      layers: [
        {
          name: 'water',
          type: 'tilelayer',
          width: 4,
          height: 3,
          properties: [{ name: 'layerRole', type: 'string', value: 'water' }],
          data: [3, 3, 3, 3, 0, 0, 0, 0, 0, 0, 0, 0]
        },
        {
          name: 'ground',
          type: 'tilelayer',
          width: 4,
          height: 3,
          data: [1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1]
        },
        {
          name: 'overhead',
          type: 'tilelayer',
          width: 4,
          height: 3,
          data: [0, 5, 5, 0, 0, 0, 0, 0, 0, 0, 0, 0]
        },
        {
          name: 'collision',
          type: 'objectgroup',
          objects: [{ id: 1, name: 'wall', x: 16, y: 16, width: 32, height: 16 }]
        },
        {
          name: 'lights',
          type: 'objectgroup',
          objects: [
            {
              id: 2,
              name: 'bar_lantern',
              x: 48,
              y: 32,
              width: 0,
              height: 0,
              properties: [
                { name: 'color', type: 'color', value: '#fffb923c' },
                { name: 'radius', type: 'float', value: 52 },
                { name: 'intensity', type: 'float', value: 0.95 },
                { name: 'flickerSpeed', type: 'float', value: 4.5 }
              ]
            }
          ]
        },
        {
          name: 'spawns',
          type: 'objectgroup',
          objects: [{ id: 3, name: 'player_spawn', x: 32, y: 32 }]
        }
      ]
    };

    const parsed = parseTiledMapData(sampleTmj, 2);
    expect(parsed.worldWidth).toBe(128);
    expect(parsed.worldHeight).toBe(96);
    expect(parsed.waterLayers.length).toBe(1);
    expect(parsed.groundLayers.length).toBe(1);
    expect(parsed.overheadLayers.length).toBe(1);
    expect(parsed.animatedTiles.get(3)?.frames.length).toBe(2);
    expect(parsed.collisions[0]).toMatchObject({ x: 32, y: 32, width: 64, height: 32 });
    expect(parsed.lights[0]?.x).toBe(96);
    expect(parsed.lights[0]?.radiusPx).toBe(104);
    expect(parsed.lights[0]?.colorHex).toBe('#fb923c');
    expect(parsed.spawns[0]?.name).toBe('player_spawn');
  });

  it('computes viewport chunk culling for 19.5:9 widescreen and overhead proximity alpha fade', () => {
    const chunkA = { minX: 0, minY: 0, maxX: 512, maxY: 512 };
    const chunkOffscreen = { minX: 1600, minY: 0, maxX: 2112, maxY: 512 };
    expect(computeChunkVisibility(chunkA, 0, 0, 1199, 540, 64)).toBe(true);
    expect(computeChunkVisibility(chunkOffscreen, 0, 0, 1199, 540, 64)).toBe(false);

    const roof = { minX: 960, minY: 384, maxX: 1248, maxY: 480 };
    expect(computeOverheadProximityTargetAlpha(1040, 420, roof)).toBeLessThan(0.5);
    expect(computeOverheadProximityTargetAlpha(400, 420, roof)).toBe(1.0);
  });

  it('adapts sun shadow skew/ambient across Morning/Day/Sunset/Night and blocks bloom spikes when flashEffect is off', () => {
    const mShadow = computeSunShadowForTimeOfDay({ timeOfDay: 'MORNING', quality: 'HIGH' });
    const sShadow = computeSunShadowForTimeOfDay({ timeOfDay: 'SUNSET', quality: 'HIGH' });
    expect(mShadow.skewX).toBeLessThan(0);
    expect(sShadow.skewX).toBeGreaterThan(0);
    expect(TIME_OF_DAY_PROFILES.NIGHT.lanternIntensityMult).toBeGreaterThan(
      TIME_OF_DAY_PROFILES.DAY.lanternIntensityMult
    );

    const flashSafe = computeEffectiveBloomIntensity(
      { ...DEFAULT_VISUAL_POLISH_CONFIG, flashEffectEnabled: false },
      1.2,
      0.9
    );
    expect(flashSafe.enabled).toBe(true);
    expect(flashSafe.intensity).toBeLessThanOrEqual(0.45);

    const lowQuality = computeEffectiveBloomIntensity(
      { ...DEFAULT_VISUAL_POLISH_CONFIG, quality: 'LOW' },
      1.2,
      0.9
    );
    expect(lowQuality.enabled).toBe(false);
  });
});
