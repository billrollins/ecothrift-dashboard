/// <reference types="vitest/config" />
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const frontendDir = fileURLToPath(new URL('.', import.meta.url))

/** After the staff dev server starts, print the public storefront URL too. */
function publicSiteUrlHint() {
  return {
    name: 'public-site-url-hint',
    configureServer() {
      return () => {
        // eslint-disable-next-line no-console -- intentional dev-server banner
        console.log('  \u279C  Public site:  http://localhost:5174/\n')
      }
    },
  }
}

// Load `.env` from repo root (same file as Django) so VITE_* vars live alongside the backend.
export default defineConfig({
  envDir: path.resolve(frontendDir, '..'),
  plugins: [react(), publicSiteUrlHint()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
      '/db-admin': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.{ts,tsx}'],
  },
})
