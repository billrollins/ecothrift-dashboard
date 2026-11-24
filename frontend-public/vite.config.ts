/// <reference types="vitest/config" />
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { phoneDev, phoneFontPreload } from './dev-tools/phoneDev'
import { desktopDev } from './dev-tools/desktopDev'

const rootDir = fileURLToPath(new URL('.', import.meta.url))
// The release (the repo's package.json, bumped on every ship): small in the footer (owner 2026-10-20).
const appVersion = String(JSON.parse(fs.readFileSync(path.resolve(rootDir, '..', 'package.json'), 'utf8')).version || '')
// A second coder (another worktree) runs its own servers: ECOTHRIFT_API_PORT / ECOTHRIFT_PUBLIC_PORT.
const apiTarget = `http://127.0.0.1:${process.env.ECOTHRIFT_API_PORT || 8000}`
const publicPort = Number(process.env.ECOTHRIFT_PUBLIC_PORT) || 5174
// The phone scanner (PLAN-SCANNER.md section 3) imports the live scanner's logic unchanged from ../frontend/src.
const staffSrc = path.resolve(rootDir, '..', 'frontend', 'src')
// A worktree links node_modules to the main checkout's (a junction): the dev server may read that real folder too, or
// the bundled font answers 403 there. In the main checkout this is the same folder as before.
const nodeModules = (() => {
  try {
    return fs.realpathSync(path.resolve(rootDir, 'node_modules'))
  } catch {
    return path.resolve(rootDir, 'node_modules')
  }
})()

/**
 * Dev only, with ECO_DEV_SITE=phone: /scan is the phone scanner (in production apps/core/middleware.py decides, by the
 * second switch storefront.phone_scan). dev-tools/phoneDev.ts serves phone.html for the site's own paths; /scan is handed
 * to it as `/` (the browser keeps /scan in its address, so the router opens the scanner), and the dev stamp says the
 * scanner is on (`"scan": true`, as the middleware stamps it) unless ECO_DEV_SCAN=off.
 */
function phoneScanDev(): Plugin {
  const on = process.env.ECO_DEV_SITE === 'phone'
  const scanOn = process.env.ECO_DEV_SCAN !== 'off'
  return {
    name: 'eco-phone-scan-dev',
    apply: 'serve',
    configureServer(server) {
      if (!on) return
      server.middlewares.use((req, _res, next) => {
        const url = req.url || '/'
        const wantsHtml = String(req.headers.accept || '').includes('text/html')
        if (req.method === 'GET' && wantsHtml && /^\/scan\/?(?:\?|$)/.test(url)) {
          req.url = '/' + url.replace(/^\/scan\/?/, '')
        }
        next()
      })
    },
    transformIndexHtml(html) {
      if (!on || !scanOn) return html
      return html.replace('<script id="eco-boot" type="application/json">{', '<script id="eco-boot" type="application/json">{"scan":true,')
    },
  }
}

// Production assets are collected into Django STATIC_ROOT/site and served by
// WhiteNoise at /static/site/* (see ecothrift/settings.py STATICFILES_DIRS).
// Dev uses the Vite dev server at the root, with /api proxied to Django.
//
// The phone site (owner 2026-11-19) is a second Rollup input, phone.html, built in its own pass
// (`vite build --mode phone`, after the plain `vite build`): the current site's index.html entry builds exactly as
// before (no chunk shared between the two) and the phone pass adds its files beside it (emptyOutDir off).
// In dev, ECO_DEV_SITE=phone makes this server the phone site (dev-tools/phoneDev.ts); without it nothing changes.
//
// The desktop site (Dash Update #211) is a third input, desktop.html, built in its own pass the same way
// (`vite build --mode desktop`, after the phone pass): its own vendor chunk, nothing shared with the other two builds.
// In dev, ECO_DEV_SITE=desktop makes this server the desktop site (dev-tools/desktopDev.ts).
const VENDOR_RE = /[\\/]node_modules[\\/](react|react-dom|scheduler|react-router|react-router-dom|cookie|set-cookie-parser)[\\/]/

export default defineConfig(({ command, mode }) => {
  const phone = mode === 'phone'
  const desktop = mode === 'desktop'
  return {
    base: command === 'build' ? '/static/site/' : '/',
    envDir: path.resolve(rootDir, '..'),
    // Several dev servers on one PC (builders, worktrees) must not share one dependency cache: each sets its own folder.
    ...(process.env.ECOTHRIFT_VITE_CACHE_DIR ? { cacheDir: path.resolve(rootDir, process.env.ECOTHRIFT_VITE_CACHE_DIR) } : {}),
    plugins: [
      react(), phoneScanDev(), phoneDev({ rootDir, apiTarget }), desktopDev({ rootDir, apiTarget }),
      // The font preload works on any page with the boot marker: both the phone and the desktop pass use it.
      ...(phone || desktop ? [phoneFontPreload()] : []),
    ],
    resolve: {
      // The scanner's files under ../frontend/src import react from frontend/node_modules: one React (and one copy of
      // each decoder package) for the whole phone bundle, from this folder's node_modules.
      dedupe: ['react', 'react-dom', 'barcode-detector', 'zxing-wasm'],
    },
    define: { __APP_VERSION__: JSON.stringify(appVersion) },
    server: {
      port: publicPort,
      // The dev server may read the scanner's shared files in ../frontend/src (and nothing else outside this folder).
      fs: { allow: [rootDir, staffSrc, nodeModules] },
      proxy: {
        '/api': { target: apiTarget, changeOrigin: true },
      },
    },
    build: phone
      ? {
          outDir: 'dist',
          emptyOutDir: false,
          sourcemap: false,
          rollupOptions: {
            input: { phone: path.resolve(rootDir, 'phone.html') },
            output: {
              // React and the router in one long-lived chunk; the phone's own code beside it.
              manualChunks(id: string) {
                if (VENDOR_RE.test(id)) {
                  return 'phone-vendor'
                }
                return undefined
              },
            },
          },
        }
      : desktop
      ? {
          outDir: 'dist',
          emptyOutDir: false,
          sourcemap: false,
          rollupOptions: {
            input: { desktop: path.resolve(rootDir, 'desktop.html') },
            output: {
              manualChunks(id: string) {
                return VENDOR_RE.test(id) ? 'desktop-vendor' : undefined
              },
            },
          },
        }
      : {
          outDir: 'dist',
          sourcemap: false,
        },
    test: {
      environment: 'jsdom',
      setupFiles: ['./src/test/setup.ts'],
      include: ['src/**/*.test.{ts,tsx}'],
      testTimeout: 20_000,
    },
  }
})
