/// <reference types="vitest/config" />
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const rootDir = fileURLToPath(new URL('.', import.meta.url))
// The release (the repo's package.json, bumped on every ship): small in the footer (owner 2026-10-20).
const appVersion = String(JSON.parse(fs.readFileSync(path.resolve(rootDir, '..', 'package.json'), 'utf8')).version || '')
// A second coder (another worktree) runs its own servers: ECOTHRIFT_API_PORT / ECOTHRIFT_PUBLIC_PORT.
const apiTarget = `http://127.0.0.1:${process.env.ECOTHRIFT_API_PORT || 8000}`
const publicPort = Number(process.env.ECOTHRIFT_PUBLIC_PORT) || 5174

// Production assets are collected into Django STATIC_ROOT/site and served by
// WhiteNoise at /static/site/* (see ecothrift/settings.py STATICFILES_DIRS).
// Dev uses the Vite dev server at the root, with /api proxied to Django.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/static/site/' : '/',
  envDir: path.resolve(rootDir, '..'),
  plugins: [react()],
  define: { __APP_VERSION__: JSON.stringify(appVersion) },
  server: {
    port: publicPort,
    proxy: {
      '/api': { target: apiTarget, changeOrigin: true },
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
    testTimeout: 20_000,
  },
}))
