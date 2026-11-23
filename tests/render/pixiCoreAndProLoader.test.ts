import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { TextureStyle } from 'pixi.js';
import { defaultProAssetManifest } from '../../src/data/assets/proAssetManifest';
import {
  createMissingProArtPlaceholder,
  parseSpriteAtlasDescriptor,
  ProAssetLoader
} from '../../src/render/pixi/ProAssetLoader';
import { PixiStageHost } from '../../src/render/pixi/PixiStageHost';
import { computeResponsiveViewport } from '../../src/render/viewport/responsiveViewportManager';

function walkTsFiles(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      walkTsFiles(full, out);
    } else if (ent.name.endsWith('.ts')) {
      out.push(full);
    }
  }
  return out;
}

describe('Step 1: PixiJS v8 Core, Legacy Procedural Baker Severance & ProAssetLoader', () => {
  it('sets TextureStyle.defaultOptions.scaleMode = "nearest" globally and validates proAssetManifest', () => {
    expect(TextureStyle.defaultOptions.scaleMode).toBe('nearest');
    expect(defaultProAssetManifest.sprites['luffy_base']).toBeDefined();
    expect(defaultProAssetManifest.maps['foosha_shells']).toBeDefined();
    expect(defaultProAssetManifest.backgrounds['east_blue_harbor']?.layers.length).toBe(4);
  });

  it('guarantees ZERO imports from legacy procedural bakers anywhere in src/render/pixi/ or src/render/backend/', () => {
    const root = process.cwd();
    const files = [
      ...walkTsFiles(path.join(root, 'src', 'render', 'pixi')),
      ...walkTsFiles(path.join(root, 'src', 'render', 'backend'))
    ];
    expect(files.length).toBeGreaterThanOrEqual(2);

    const forbidden = [
      /assets\/legacy/i,
      /proceduralPixelSheetBaker/,
      /proceduralTilesetBaker/,
      /luffyArticulatedPixelSheet/,
      /articulatedPixelRigBaker/,
      /portraitPixelBaker/,
      /shipRigBaker/,
      /layeredTilemapRenderer/,
      /explicitTilemapBaker/
    ];

    for (const file of files) {
      const code = fs.readFileSync(file, 'utf8');
      for (const rx of forbidden) {
        expect(rx.test(code), `Forbidden legacy baker reference ${rx} in ${file}`).toBe(false);
      }
    }
  });

  it('parses Aseprite JSON Hash, Aseprite Array, TexturePacker, and import-sprite-pack .meta.json formats', () => {
    const asepriteHash = {
      frames: {
        'luffy_0.png': { frame: { x: 0, y: 0, w: 48, h: 48 }, duration: 120 },
        'luffy_1.png': { frame: { x: 48, y: 0, w: 48, h: 48 }, duration: 120 },
        'luffy_2.png': { frame: { x: 96, y: 0, w: 48, h: 48 }, duration: 80 },
        'luffy_3.png': { frame: { x: 144, y: 0, w: 48, h: 48 }, duration: 80 },
        'luffy_4.png': { frame: { x: 192, y: 0, w: 48, h: 48 }, duration: 70 }
      },
      meta: {
        anchor: { x: 0.5, y: 0.9 },
        frameTags: [
          { name: 'IDLE', from: 0, to: 1 },
          { name: 'MOVE', from: 2, to: 3 },
          { name: 'ATTACK_MELEE', from: 4, to: 4, hitFrame: 0 }
        ]
      }
    };
    const pHash = parseSpriteAtlasDescriptor(asepriteHash, 256, 64);
    expect(pHash.format).toBe('ASEPRITE_HASH');
    expect(pHash.clips.IDLE.frames.length).toBe(2);
    expect(pHash.clips.MOVE.frames.length).toBe(2);
    expect(pHash.clips.ATTACK_MELEE.frames[0]?.x).toBe(192);
    // Unmapped states safely fall back to IDLE frames
    expect(pHash.clips.VICTORY.frames.length).toBe(2);

    const asepriteArray = {
      frames: [
        { filename: 'idle_0', frame: { x: 0, y: 0, w: 64, h: 64 }, duration: 150 },
        { filename: 'move_0', frame: { x: 64, y: 0, w: 64, h: 64 }, duration: 100 }
      ],
      meta: {
        frameTags: [
          { name: 'idle', from: 0, to: 0 },
          { name: 'run', from: 1, to: 1 }
        ]
      }
    };
    const pArr = parseSpriteAtlasDescriptor(asepriteArray, 128, 64);
    expect(pArr.format).toBe('ASEPRITE_ARRAY');
    expect(pArr.clips.IDLE.frames[0]?.w).toBe(64);
    expect(pArr.clips.MOVE.frames[0]?.x).toBe(64);

    const texturePacker = {
      frames: {
        'tp_idle_0.png': { frame: { x: 0, y: 0, w: 32, h: 40 } },
        'tp_atk_0.png': { frame: { x: 32, y: 0, w: 44, h: 40 } }
      },
      animations: {
        idle: ['tp_idle_0.png'],
        attack: ['tp_atk_0.png']
      }
    };
    const pTp = parseSpriteAtlasDescriptor(texturePacker, 128, 64);
    expect(pTp.format).toBe('TEXTURE_PACKER');
    expect(pTp.clips.ATTACK_MELEE.frames[0]?.w).toBe(44);

    const legacyMeta = {
      atlasMode: 'VARIABLE_PACK',
      frameWidth: 48,
      frameHeight: 48,
      anchor: { x: 0.5, y: 0.9 },
      animations: {
        IDLE: {
          row: 0,
          frames: 1,
          fps: 6,
          loop: true,
          frameRects: [{ x: 2, y: 2, w: 36, h: 44, pivotX: 18, pivotY: 42 }]
        }
      }
    };
    const pMeta = parseSpriteAtlasDescriptor(legacyMeta, 256, 256);
    expect(pMeta.format).toBe('LEGACY_META_VARIABLE');
    expect(pMeta.clips.IDLE.frames[0]?.pivotY).toBe(42);
  });

  it('creates neutral missing-art silhouettes and shows debug tag only in dev mode', () => {
    const devPlaceholder = createMissingProArtPlaceholder('morgan_base', 40, 52, true);
    expect(devPlaceholder.children.length).toBe(2);
    devPlaceholder.destroy({ children: true });

    const prodPlaceholder = createMissingProArtPlaceholder('morgan_base', 40, 52, false);
    expect(prodPlaceholder.children.length).toBe(1);
    prodPlaceholder.destroy({ children: true });
  });

  it('handles PixiStageHost S25 Ultra viewport metrics, polish config updates, headless safety & dispose', async () => {
    const loader = new ProAssetLoader({
      loadImage: async () => null,
      loadJson: async () => null
    });
    const host = new PixiStageHost(loader);
    const s25 = computeResponsiveViewport(915, 412, 3, {
      top: 0,
      right: 36,
      bottom: 14,
      left: 44
    });

    // Headless Node environment has no DOM/WebGL -> gracefully returns false without crashing
    const fakeContainer = {} as unknown as HTMLElement;
    const ok = await host.init(fakeContainer, s25);
    expect(ok).toBe(false);
    expect(host.isWebGLActive).toBe(false);

    host.resize(s25);
    host.updatePolishConfig({ timeOfDay: 'NIGHT', selectiveBloom: false });
    expect(host.getPolishConfig().timeOfDay).toBe('NIGHT');
    expect(host.getPolishConfig().selectiveBloom).toBe(false);

    const tele = host.getTelemetry();
    expect(tele.backend).toBe('CANVAS_2D_FALLBACK');
    expect(tele.viewWidth).toBeGreaterThanOrEqual(1170);
    expect(tele.viewHeight).toBe(540);
    expect(tele.renderTextureCount).toBe(0);

    await loader.preloadVerticalSliceCore();
    expect(loader.getMissingProArtKeys()).toContain('sprite_base_luffy_base');

    host.dispose();
    expect(host.trackedRenderTextureCount).toBe(0);
    expect(loader.getLoadedTextureCount()).toBe(0);
  });
});
