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
  const base = isWeb ? '/' : './';

  return {
    base,
    define: {
      __BUILD_TARGET_PLATFORM__: JSON.stringify(targetPlatform)
    },
    build: {
      outDir,
      emptyOutDir: true
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
                globPatterns: ['**/*.{js,css,html,svg,png,json,webmanifest}'],
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
