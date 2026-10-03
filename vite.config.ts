import { fileURLToPath, URL } from 'node:url'
import { readFileSync } from 'node:fs'
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import { VitePWA } from 'vite-plugin-pwa'

const pkg = JSON.parse(
  readFileSync(fileURLToPath(new URL('./package.json', import.meta.url)), 'utf8'),
) as { version: string }

// IMPORTANT: qBittorrent serves an alternative WebUI from a user-chosen
// absolute path (e.g. "/macos-theme"). The real entry document lives at
// "<root>/private/index.html". All asset URLs must therefore be RELATIVE
// ("base: './'") so the UI works no matter which path it is mounted at.
export default defineConfig({
  base: './',

  // `publicDir` produces assets that ship INSIDE the app bundle. Do not confuse
  // it with the `public/` folder qBittorrent requires at the WebUI root — that
  // one is created by scripts/postbuild.mjs and holds unauthenticated files.
  // Keeping them separate avoids a naming collision that would silently place
  // our icons where the entry document cannot reach them.
  publicDir: 'static',

  define: {
    // Surfaced in the About view so users can tell which WebUI build is
    // installed — the first thing to check after an image upgrade.
    __APP_VERSION__: JSON.stringify(pkg.version),
  },

  plugins: [
    vue(),
    VitePWA({
      // Keep the PWA optional and non-blocking: if the generated service
      // worker or manifest conflicts with a sub-path deployment, the WebUI
      // still works because it never depends on the SW for correctness.
      registerType: 'autoUpdate',
      injectRegister: null,
      manifest: {
        name: 'MacUI for qBittorrent',
        short_name: 'MacUI',
        description: 'A macOS-styled WebUI for qBittorrent',
        theme_color: '#1e1e1e',
        background_color: '#1e1e1e',
        display: 'standalone',
        // CRITICAL: start_url must name a FILE, never a directory.
        //
        // qBittorrent resolves every request to a path under its root and
        // rejects anything that is not a regular file ("Unacceptable file
        // type, only regular file is allowed."). The manifest is served from
        // /private/manifest.webmanifest, so a relative "./" resolves to the
        // DIRECTORY /private/ — which the server rejects. That is exactly the
        // failure mobile browsers hit (a desktop tab never consults start_url).
        start_url: './index.html',
        // The scope may safely stay a directory; it is a prefix match used for
        // navigation containment, never fetched over HTTP.
        scope: './',
        lang: 'en',
        icons: [
          { src: './icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: './icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: './icons/icon-512-maskable.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        // The WebAPI is always live data; never serve it from cache.
        navigateFallback: null,
        runtimeCaching: [],
        // The manifest lives at the root of the folder qBittorrent serves as
        // `private/`, so icon paths must stay relative to it.
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
      },
      devOptions: { enabled: false },
    }),
  ],

  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },

  build: {
    outDir: 'dist',
    emptyOutDir: true,
    // qBittorrent refuses to serve any single file larger than 10 MiB
    // (MAX_ALLOWED_FILESIZE in webapplication.cpp). Keep chunks modest so
    // the build stays well clear of that ceiling.
    chunkSizeWarningLimit: 1200,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['vue', 'vue-router', 'pinia'],
        },
      },
    },
  },

  server: {
    port: 5173,
    proxy: {
      // Dev convenience: talk to a real qBittorrent while developing.
      // Override with VITE_QBT_TARGET=http://host:8080
      '/api/v2': {
        target: process.env.VITE_QBT_TARGET ?? 'http://127.0.0.1:8080',
        changeOrigin: true,
      },
    },
  },
})