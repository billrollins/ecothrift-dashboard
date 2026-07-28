/// <reference types="vitest/config" />
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import basicSsl from '@vitejs/plugin-basic-ssl'

const frontendDir = fileURLToPath(new URL('.', import.meta.url))
// Mobile bat sets ECOTHRIFT_MOBILE_HTTPS=1; also treat --host 0.0.0.0 as mobile.
const mobileHttps =
  process.env.ECOTHRIFT_MOBILE_HTTPS === '1' || process.argv.includes('0.0.0.0')
const mobileLanIp = (process.env.ECOTHRIFT_MOBILE_LAN_IP || '').trim()
const sslDomains = ['localhost', '127.0.0.1', ...(mobileLanIp ? [mobileLanIp] : [])]

/** After the staff dev server starts, print the public storefront URL too. */
function publicSiteUrlHint() {
  return {
    name: 'public-site-url-hint',
    configureServer() {
      return () => {
        // eslint-disable-next-line no-console -- intentional dev-server banner
        console.log(`  \u279C  Public site:  ${mobileHttps ? 'https' : 'http'}://localhost:5174/\n`)
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
      ? [basicSsl({ name: 'ecothrift-mobile', domains: sslDomains })]
      : []),
    publicSiteUrlHint(),
  ],
  server: {
    port: 5173,
    // basic-ssl fills cert/key when https is true/undefined; keep explicit for clarity.
    ...(mobileHttps ? { https: true as const } : {}),
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
