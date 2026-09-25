/// <reference types="vitest/config" />
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'

const frontendDir = fileURLToPath(new URL('.', import.meta.url))
// Mobile bat sets ECOTHRIFT_MOBILE_HTTPS=1; also treat --host 0.0.0.0 as mobile.
const mobileHttps =
  process.env.ECOTHRIFT_MOBILE_HTTPS === '1' || process.argv.includes('0.0.0.0')

// Phones reach this PC as https://<hostname>.local:5173/ (mDNS), which survives
// DHCP handing the PC a new IP. The self-signed cert is kept outside
// node_modules (reinstalls do not wipe it, and every checkout shares it) and is
// valid for 800 days (iOS refuses anything over 825), so a phone accepts the
// warning once. basic-ssl only remakes a missing or expired cert: it never
// notices a changed domain list, so the folder is keyed by hostname. The LAN IP
// stays out on purpose: basic-ssl writes extra domains as DNS names, which
// browsers never match against an IP URL, so it only churned the cert. Delete
// the folder to force a fresh cert. dev.ps1 passes the same folder explicitly.
const devHostName = os.hostname().toLowerCase()
const devCertDir =
  (process.env.ECOTHRIFT_DEV_CERT_DIR || '').trim() ||
  path.join(
    process.env.LOCALAPPDATA || path.join(os.homedir(), '.cache'),
    'EcoThrift',
    'dev-cert',
    devHostName.replace(/[^a-z0-9.-]/g, '_'),
  )

/** After the staff dev server starts, print the public storefront URL too. */
function publicSiteUrlHint() {
  return {
    name: 'public-site-url-hint',
    configureServer() {
      return () => {
        // The public site has no TLS of its own, so it stays http even when the
        // staff dashboard is served over HTTPS.
        // eslint-disable-next-line no-console -- intentional dev-server banner
        console.log('  \u279C  Public site:  http://localhost:5174/\n')
        if (mobileHttps) {
          // eslint-disable-next-line no-console -- intentional dev-server banner
          console.log('  \u279C  Mobile HTTPS enabled (self-signed). Phone must use https://...\n')
        }
      }
    },
  }
}

// Load `.env` from repo root (same file as Django) so VITE_* vars live alongside the backend.
export default defineConfig({
  envDir: path.resolve(frontendDir, '..'),
  plugins: [
    react(),
    ...(mobileHttps
      ? [
          basicSsl({
            name: `${devHostName}.local`,
            // localhost, [::1], 127.0.0.1 and fe80::1 are built in.
            domains: [`${devHostName}.local`, devHostName],
            certDir: devCertDir,
            ttlDays: 800,
          }),
        ]
      : []),
    publicSiteUrlHint(),
  ],
  server: {
    port: 5173,
    // basic-ssl fills cert/key when https is true/undefined; keep explicit for clarity.
    ...(mobileHttps ? { https: true as const } : {}),
    // Vite answers only localhost and raw IPs by default. Over HTTPS it skips the
    // page check but still checks the HMR websocket, so without this the phone's
    // <hostname>.local page loads and then never hot-reloads. .ts.net covers
    // Tailscale Serve (https://<machine>.<tailnet>.ts.net/).
    allowedHosts: ['.local', '.ts.net'],
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
    // Files pass alone in well under a second of real work, but a full parallel
    // run alongside the dev servers starves them past the 5s default.
    testTimeout: 20_000,
  },
})
