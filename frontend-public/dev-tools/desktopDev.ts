/**
 * Dev tooling for the desktop site (Dash Update #211; not shipped: vite.config.ts loads it, nothing under src/ imports it).
 *
 * desktopDev(): active only on the dev server AND only when ECO_DEV_SITE=desktop, so every other dev server is unchanged.
 *   - Serves desktop.html for every page the desktop site owns (the phone site's pages, plus /scan: on a computer the
 *     tag-number page), with the home feed stamped at <!--ECO_BOOT--> the way apps/core/middleware.py does it.
 *   - Answers /api/storefront/home.json and stock.json from the backend (ECOTHRIFT_API_PORT) when it answers, else from
 *     the fixtures in dev-fixtures/.
 *   - The same dev cookies as the phone site's tool (dev-tools/phoneDev.ts): eco_dev_member=1 fakes a signed-in member,
 *     eco_dev_day=bf shows Black Friday, eco_dev_boot=off leaves the stamp out. ECO_DEV_MEMBER / ECO_DEV_DAY do the same
 *     for the whole server.
 *   - ECO_DEV_STOREFRONT=prod: the storefront's public feeds (home.json, stock.json, item/<pid>/, photo/<pid>/) come from
 *     https://ecothrift.us instead (anonymous and read-only, what any visitor's browser reads), so a local page shows the
 *     real shelf with its photos (the dev bucket has none). Everything else still goes to the local backend.
 */
import fs from 'node:fs'
import path from 'node:path'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { Plugin } from 'vite'
import { phoneOwns } from './phoneDev'

/** A page the desktop site answers: every page of the phone site, and /scan (the computer's tag-number page). */
export function desktopOwns(p: string): boolean {
  return p === '/scan' || p === '/scan/' || phoneOwns(p)
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

const PROD = 'https://ecothrift.us'

export function desktopDev(opts: { rootDir: string; apiTarget: string }): Plugin {
  const on = process.env.ECO_DEV_SITE === 'desktop'
  const prodFeeds = process.env.ECO_DEV_STOREFRONT === 'prod'
  const fixtures = path.resolve(opts.rootDir, 'dev-fixtures')
  let backendDownUntil = 0

  async function fromBackend(p: string): Promise<string | null> {
    if (process.env.ECO_DEV_FEED === 'fixture' || Date.now() < backendDownUntil) return null
    try {
      const r = await fetch((prodFeeds ? PROD : opts.apiTarget) + p, { signal: AbortSignal.timeout(prodFeeds ? 15000 : 4000) })
      if (!r.ok) throw new Error(String(r.status))
      return await r.text()
    } catch {
      backendDownUntil = Date.now() + 15_000
      return null
    }
  }

  async function feed(name: 'home' | 'stock', day = ''): Promise<string> {
    const text = (await fromBackend(`/api/storefront/${name}.json`)) ?? fs.readFileSync(path.join(fixtures, `${name}.json`), 'utf8')
    if (name !== 'home' || !day) return text
    const body = JSON.parse(text)
    body.day = day
    return JSON.stringify(body)
  }

  function flags(req: IncomingMessage) {
    const c = cookies(req)
    return {
      day: c.eco_dev_day || process.env.ECO_DEV_DAY || '',
      member: c.eco_dev_member === '1' || process.env.ECO_DEV_MEMBER === '1',
      boot: c.eco_dev_boot || process.env.ECO_DEV_BOOT || 'on',
    }
  }

  return {
    name: 'eco-desktop-dev',
    apply: 'serve',
    configureServer(server) {
      if (!on) return
      server.middlewares.use(async (req, res, next) => {
        try {
          const url = new URL(req.url || '/', 'http://dev.local')
          const p = url.pathname
          const f = flags(req)
          if (p === '/api/storefront/home.json' || p === '/api/storefront/stock.json') {
            return send(res, 200, 'application/json', await feed(p.includes('home') ? 'home' : 'stock', f.day))
          }
          if (prodFeeds && /^\/api\/storefront\/photo\/\d+\/$/.test(p)) {
            res.statusCode = 302
            res.setHeader('Location', PROD + p)
            return res.end()
          }
          if (prodFeeds && /^\/api\/storefront\/item\/\d+\/$/.test(p)) {
            const r = await fetch(PROD + p, { headers: { Accept: 'application/json' }, signal: AbortSignal.timeout(15000) }).catch(() => null)
            if (!r) return send(res, 502, 'application/json', '{}')
            return send(res, r.status, 'application/json', await r.text())
          }
          if (p === '/api/thriftplus/public/session/' && f.member) {
            return send(res, 200, 'application/json', JSON.stringify({
              status: 'member',
              member: {
                id: 1, first_name: 'Ana', last_name: 'Diaz', bucks_available: '35.00', bucks_use_by: '2026-12-19',
                banked_rewards: '35.00', credit_balance: '0.00', ready: true, needs_phone: false, finish_steps: [],
                phone: '(402) 555-0134', email: '',
              },
            }))
          }
          // The faked member's own (QR and account), so the member's page shows whole in dev.
          if (f.member && p === '/api/thriftplus/public/me/card/') {
            return send(res, 200, 'application/json', JSON.stringify({
              code: '402155831907', display: '4021 5583 1907', qr: 'TP402155831907', first_name: 'Ana', ready: true,
            }))
          }
          if (f.member && p === '/api/thriftplus/public/me/') {
            return send(res, 200, 'application/json', JSON.stringify({
              banked: '35.00', available: '35.00', credit: '0.00', can_change: true,
              people: [{ id: 1, first_name: 'Ana', role: 'primary', verified_18: true, is_you: true, cards: [] }],
              money: [{ kind: 'bank', amount: '12.40', reason: 'Sale', created_at: '2026-11-19T18:00:00Z' }],
              rewards: [
                { amount: '12.40', earned_on: '2026-11-19', use_by: '2026-12-19', past_due: false, usable: true },
                { amount: '22.60', earned_on: '2026-11-22', use_by: '2026-12-22', past_due: false, usable: true },
              ],
              emails: { updates: true, news: true, has_email: false, note: '' },
              you: { name: 'Ana Diaz', phone: '4025550134', photo_url: null },
            }))
          }
          const wantsHtml = String(req.headers.accept || '').includes('text/html')
          // The screenshot tool (workspace/d211/shoot.ps1) cannot set cookies: ?__day=bf|normal and ?__member=1|0 on a
          // page set them for the rest of that browser's visit.
          const setDay = url.searchParams.get('__day')
          const setMember = url.searchParams.get('__member')
          if (req.method === 'GET' && wantsHtml && (setDay || setMember)) {
            const out: string[] = []
            const life = (on: boolean) => (on ? 'Max-Age=86400' : 'Max-Age=0')
            if (setDay) out.push(`eco_dev_day=${setDay === 'bf' ? 'bf' : ''}; Path=/; ${life(setDay === 'bf')}`)
            if (setMember) out.push(`eco_dev_member=${setMember === '1' ? '1' : ''}; Path=/; ${life(setMember === '1')}`)
            url.searchParams.delete('__day')
            url.searchParams.delete('__member')
            res.statusCode = 302
            res.setHeader('Set-Cookie', out)
            res.setHeader('Location', url.pathname + (url.search || '') + url.hash)
            return res.end()
          }
          if (req.method === 'GET' && wantsHtml && desktopOwns(p)) {
            let html = fs.readFileSync(path.resolve(opts.rootDir, 'desktop.html'), 'utf8')
            let stamp = '<script>window.__errs=[];addEventListener("error",function(e){__errs.push((e.message||"error")+" @"+(e.filename||"")+":"+(e.lineno||0))});' +
              'addEventListener("unhandledrejection",function(e){__errs.push("promise: "+(e.reason&&e.reason.message||e.reason))})</script>'
            if (f.boot !== 'off') {
              const json = (await feed('home', f.day)).replace(/</g, '\\u003c')
              stamp += `<script id="eco-boot" type="application/json">${json}</script>`
            }
            if (f.day === 'bf') html = html.replace('data-day="normal"', 'data-day="bf"')
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
