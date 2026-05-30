import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const rootDir = fileURLToPath(new URL('.', import.meta.url))

// Production assets are collected into Django STATIC_ROOT/site and served by
// WhiteNoise at /static/site/* (see ecothrift/settings.py STATICFILES_DIRS).
// Dev uses the Vite dev server at the root, with /api proxied to Django.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/static/site/' : '/',
  envDir: path.resolve(rootDir, '..'),
  plugins: [react()],
  server: {
    port: 5174,
    proxy: {
      '/api': { target: 'http://127.0.0.1:8000', changeOrigin: true },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: false,
  },
}))
