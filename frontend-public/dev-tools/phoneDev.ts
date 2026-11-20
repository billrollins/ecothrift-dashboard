/**
 * Dev and check tooling for the phone site (not shipped: vite.config.ts loads it; nothing under src/ imports it).
 *
 * phoneDev(): active only on the dev server AND only when ECO_DEV_SITE=phone, so the owner's own dev server is unchanged.
 *   - Serves phone.html for every page the phone site owns (all but /shop, /checkout, /hold...), with the home feed
 *     stamped at <!--ECO_BOOT--> the way apps/core/middleware.py does it in production.
 *   - Answers /api/storefront/home.json and stock.json from the backend (ECOTHRIFT_API_PORT) when it answers, else from
 *     the fixtures in dev-fixtures/ (made from the round-3 mockup's data).
 *   - Fakes /api/thriftplus/public/session/ as a signed-in member when ECO_DEV_MEMBER=1 or the cookie eco_dev_member=1;
 *     shows Black Friday when ECO_DEV_DAY=bf or the cookie eco_dev_day=bf; eco_dev_app=<version> pretends the server runs
 *     another release (the update bar); eco_dev_boot=off leaves the stamp out (the page fetches home.json). The shoot
 *     tool sets these cookies.
 *   - Serves /__shoot, the same-origin wrapper page workspace/phone-shoot/shoot.py screenshots through.
 * phoneFontPreload(): build only (the phone pass): puts a <link rel="preload"> for the bundled Archivo file in phone.html.
 */
import fs from 'node:fs'
import path from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin } from 'vite'

/** The online store's own pages stay on the current site; keep in step with CLASSIC_ONLY_RE in apps/core/middleware.py. */
export const CLASSIC_ONLY_RE = /^\/(?:(?:shop|checkout)(?:\/.*)?|hold.*)$/
/** Never a page of the phone site: what production passes through before it decides (the API, files, the short links,
 *  the member app's /scan/... /qr /card /join, robots and sitemap) and the dev server's own files. */
const NOT_A_PAGE_RE =
  /^\/(?:api|static|assets|media|db-admin|i|I|scan|qr|card|join|src|node_modules|@[\w-]+|__[\w-]+)(?:\/|$)|^\/(?:robots\.txt|sitemap\.xml|sms-opt-in\.png)$|\.\w+$/

/** A page the phone site answers (production: apps/core/middleware.py `phone_owns`, after its pass-throughs). */
export function phoneOwns(p: string): boolean {
  return !NOT_A_PAGE_RE.test(p) && !CLASSIC_ONLY_RE.test(p)
}

const BOOT_MARKER = '<!--ECO_BOOT-->'

function cookies(req: IncomingMessage): Record<string, string> {
  const out: Record<string, string> = {}
  for (const part of String(req.headers.cookie || '').split(';')) {
    const i = part.indexOf('=')
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim())
  }
  return out
}

function send(res: ServerResponse, status: number, type: string, body: string) {
  res.statusCode = status
  res.setHeader('Content-Type', type)
  res.setHeader('Cache-Control', 'no-store')
  res.end(body)
}

export function phoneDev(opts: { rootDir: string; apiTarget: string }): Plugin {
  const on = process.env.ECO_DEV_SITE === 'phone'
  const fixtures = path.resolve(opts.rootDir, 'dev-fixtures')
  let backendDownUntil = 0

  /** The backend's copy of a feed, or null when it does not answer (then the fixture is used). */
  async function fromBackend(p: string): Promise<string | null> {
    if (process.env.ECO_DEV_FEED === 'fixture' || Date.now() < backendDownUntil) return null
    try {
      const r = await fetch(opts.apiTarget + p, { signal: AbortSignal.timeout(1500) })
      if (!r.ok) throw new Error(String(r.status))
      return await r.text()
    } catch {
      backendDownUntil = Date.now() + 15_000
      return null
    }
  }

  async function feed(name: 'home' | 'stock', day = '', app = ''): Promise<string> {
    const text = (await fromBackend(`/api/storefront/${name}.json`)) ?? fs.readFileSync(path.join(fixtures, `${name}.json`), 'utf8')
    if (name !== 'home' || (!day && !app)) return text
    const body = JSON.parse(text)
    if (day) body.day = day
    if (app) body.app = app
    return JSON.stringify(body)
  }

  function flags(req: IncomingMessage) {
    const c = cookies(req)
    return {
      day: c.eco_dev_day || process.env.ECO_DEV_DAY || '',
      member: c.eco_dev_member === '1' || process.env.ECO_DEV_MEMBER === '1',
      boot: c.eco_dev_boot || process.env.ECO_DEV_BOOT || 'on',
      app: c.eco_dev_app || '',   // pretend the server runs another release (shows the update bar)
    }
  }

  return {
    name: 'eco-phone-dev',
    apply: 'serve',
    configureServer(server) {
      if (!on) return
      server.middlewares.use(async (req, res, next) => {
        try {
          const url = new URL(req.url || '/', 'http://dev.local')
          const p = url.pathname
          const f = flags(req)
          if (p === '/api/storefront/home.json' || p === '/api/storefront/stock.json') {
            return send(res, 200, 'application/json', await feed(p.includes('home') ? 'home' : 'stock', f.day, f.app))
          }
          if (p === '/api/thriftplus/public/session/') {
            if (f.member) {
              return send(res, 200, 'application/json', JSON.stringify({
                status: 'member',
                member: { first_name: 'Ana', bucks_available: '35.00', bucks_use_by: '2026-12-19', banked_rewards: '35.00',
                          credit_balance: '0.00', ready: true },
              }))
            }
            if ((await fromBackend('/api/thriftplus/public/session/')) === null) {
              return send(res, 200, 'application/json', JSON.stringify({ status: 'signed_out' }))
            }
            return next()
          }
          if (p === '/__shoot') {
            return send(res, 200, 'text/html; charset=utf-8', fs.readFileSync(path.resolve(opts.rootDir, 'dev-tools', 'shoot.html'), 'utf8'))
          }
          const wantsHtml = String(req.headers.accept || '').includes('text/html')
          if (req.method === 'GET' && wantsHtml && phoneOwns(p)) {
            let html = fs.readFileSync(path.resolve(opts.rootDir, 'phone.html'), 'utf8')
            // Collect page errors for the shoot tool (dev only).
            let stamp = '<script>window.__errs=[];addEventListener("error",function(e){__errs.push((e.message||"error")+" @"+(e.filename||"")+":"+(e.lineno||0))});' +
              'addEventListener("unhandledrejection",function(e){__errs.push("promise: "+(e.reason&&e.reason.message||e.reason))})</script>'
            if (f.boot !== 'off') {
              const json = (await feed('home', f.day, f.app)).replace(/</g, '\\u003c')
              stamp += `<script id="eco-boot" type="application/json">${json}</script>`
            }
            html = html.replace(BOOT_MARKER, stamp)
            html = await server.transformIndexHtml(req.url || '/', html, req.originalUrl)
            return send(res, 200, 'text/html; charset=utf-8', html)
          }
        } catch (err) {
          return next(err)
        }
        next()
      })
    },
  }
}

/** Build (phone pass) only: preload the one Archivo file the kit uses, so the headline face is there at first paint. */
export function phoneFontPreload(): Plugin {
  let base = '/'
  return {
    name: 'eco-phone-font-preload',
    apply: 'build',
    configResolved(config) {
      base = config.base
    },
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        if (!ctx.bundle || !html.includes(BOOT_MARKER)) return html
        const font = Object.keys(ctx.bundle).find((name) => /archivo-latin-wdth-normal[^/]*\.woff2$/.test(name))
        if (!font) throw new Error('phone build: the Archivo font file is missing from the bundle')
        // Right after the viewport tag: the browser starts the font with the HTML's first bytes.
        const link = `\n    <link rel="preload" href="${base}${font}" as="font" type="font/woff2" crossorigin />`
        return html.replace(/(<meta name="viewport"[^>]*>)/, `$1${link}`)
      },
    },
  }
}
