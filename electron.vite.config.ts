import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const shared = { '@shared': resolve(__dirname, 'src/shared') }

export default defineConfig({
  main: {
    resolve: { alias: shared },
    // Extension libs stay external: they resolve their own preload files from node_modules at runtime.
    build: { externalizeDeps: true }
  },
  preload: {
    resolve: { alias: shared },
    // The chrome UI runs with sandbox: true, so its preload must be a single self-contained bundle.
    build: {
      externalizeDeps: false,
      // Sandboxed preloads cannot require sibling chunks: one self-contained file per entry.
      isolatedEntries: true,
      rollupOptions: {
        input: {
          chrome: resolve(__dirname, 'src/preload/chrome.ts'),
          'extension-sw': resolve(__dirname, 'src/preload/extension-sw.ts')
        }
      }
    }
  },
  renderer: {
    resolve: { alias: shared },
    plugins: [react(), tailwindcss()],
    build: {
      rollupOptions: {
        input: {
          // Chrome UI + overlay.
          index: resolve(__dirname, 'src/renderer/index.html'),
          // Internal pages, served on zak://<page>/ (src/main/internal/InternalProtocol.ts).
          newtab: resolve(__dirname, 'src/renderer/newtab.html'),
          extensions: resolve(__dirname, 'src/renderer/extensions.html'),
          settings: resolve(__dirname, 'src/renderer/settings.html'),
          history: resolve(__dirname, 'src/renderer/history.html'),
          error: resolve(__dirname, 'src/renderer/error.html')
        }
      }
    }
  }
})
