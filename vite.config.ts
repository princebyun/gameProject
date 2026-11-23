import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

export type ViteTargetPlatform = 'web' | 'electron' | 'android';

function resolveTargetPlatform(): ViteTargetPlatform {
  const raw = (process.env.VITE_PLATFORM ?? 'web').toLowerCase().trim();
  if (raw === 'electron') return 'electron';
  if (raw === 'android') return 'android';
  return 'web';
}

export default defineConfig(() => {
  const targetPlatform = resolveTargetPlatform();
  const isWeb = targetPlatform === 'web';
  const outDir =
    targetPlatform === 'electron'
      ? 'dist-electron'
      : targetPlatform === 'android'
        ? 'dist-android'
        : 'dist-web';
  const base = './';

  return {
    base,
    define: {
      __BUILD_TARGET_PLATFORM__: JSON.stringify(targetPlatform)
    },
    build: {
      outDir,
      emptyOutDir: true,
      sourcemap: false,
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (
              id.includes('node_modules/pixi.js') ||
              id.includes('node_modules\\pixi.js') ||
              id.includes('node_modules/@pixi')
            ) {
              return 'pixi-webgl';
            }
            if (id.includes('node_modules')) {
              return 'vendor';
            }
            if (id.includes('/src/data/') || id.includes('\\src\\data\\')) {
              return 'game-data';
            }
            if (
              id.includes('/src/render/sprite/rig/') ||
              id.includes('\\src\\render\\sprite\\rig\\') ||
              id.includes('luffyArticulatedPixelSheet')
            ) {
              return 'pixel-rig';
            }
            if (id.includes('/src/core/') || id.includes('\\src\\core\\')) {
              return 'core-engine';
            }
            return undefined;
          }
        }
      }
    },
    plugins: [
      ...(isWeb
        ? [
          VitePWA({
            registerType: 'prompt',
            includeAssets: ['icon.svg', 'icon-192.svg', 'icon-512.svg'],
            manifest: {
              name: 'One Piece Grand Voyage — 2D Pixel Action RPG',
              short_name: 'OPGrandVoyage',
              description:
                'One Piece 2D Pixel Real-Time Action & Sea-Zone Free Sailing RPG',
              theme_color: '#0f172a',
              background_color: '#070b12',
              display: 'standalone',
              orientation: 'landscape',
              icons: [
                {
                  src: 'icon-192.svg',
                  sizes: '192x192',
                  type: 'image/svg+xml',
                  purpose: 'any'
                },
                {
                  src: 'icon-512.svg',
                  sizes: '512x512',
                  type: 'image/svg+xml',
                  purpose: 'any maskable'
                },
                {
                  src: 'icon.svg',
                  sizes: 'any',
                  type: 'image/svg+xml',
                  purpose: 'any maskable'
                }
              ]
            },
            workbox: {
              // Keep app shell, JSON manifests, UI icons, and core SFX precached
              globPatterns: ['**/*.{js,css,html,svg,png,json,webmanifest}'],
              // Offload large external sprite sheets, portraits, biome tilesets, backdrops, VFX, and audio streams to Runtime CacheFirst
              globIgnores: [
                'assets/sprites/**',
                'assets/portraits/**',
                'assets/tilesets/**',
                'assets/backgrounds/**',
                'assets/vfx/**',
                'assets/pro/**',
                'assets/audio/bgm/**',
                'assets/audio/sfx/**',
                '**/*.meta.json'
              ],
              runtimeCaching: [
                {
                  urlPattern: /\/assets\/pro\/.*\.(webp|png|json|tmj|tsj|tsx)$/i,
                  handler: 'CacheFirst',
                  options: {
                    cacheName: 'opgv-pro-art-cache',
                    expiration: {
                      maxEntries: 250,
                      maxAgeSeconds: 60 * 60 * 24 * 30
                    },
                    cacheableResponse: {
                      statuses: [0, 200]
                    }
                  }
                },
                {
                  urlPattern: /\/assets\/(sprites|portraits|tilesets|backgrounds|vfx)\/.*\.png$/i,
                  handler: 'CacheFirst',
                  options: {
                    cacheName: 'opgv-pixel-art-cache',
                    expiration: {
                      maxEntries: 400,
                      maxAgeSeconds: 60 * 60 * 24 * 30
                    },
                    cacheableResponse: {
                      statuses: [0, 200]
                    }
                  }
                },
                {
                  urlPattern: /\/assets\/audio\/(bgm|sfx)\/.*\.(ogg|mp3|wav)$/i,
                  handler: 'CacheFirst',
                  options: {
                    cacheName: 'opgv-bgm-audio-cache',
                    expiration: {
                      maxEntries: 80,
                      maxAgeSeconds: 60 * 60 * 24 * 30
                    },
                    cacheableResponse: {
                      statuses: [0, 200]
                    }
                  }
                }
              ],
              cleanupOutdatedCaches: true
            }
          })
        ]
        : [])
    ],
    server: {
      port: 5173,
      host: true
    }
  };
});
