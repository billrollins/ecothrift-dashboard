/**
 * Prompts that float over the page (fixed, so they never move anything).
 *
 * The update bar: no service worker in this release (PLAN.md). The page compares its own release (`__APP_VERSION__`,
 * the repo's package.json at build time) with the release the server says it runs (the home feed's `app` field).
 * When they differ, one bar above the bottom bar says a new version is ready, with one "Update" button that reloads.
 * It checks the stamped feed at load and again each time the tab comes back (at most once a minute).
 *
 * Rollback for open tabs (PLAN-SCANNER.md section 5; scan/switch.ts): each time the tab comes back (the same once a
 * minute) the page asks the server for its own HTML, as a reload would get it (same cookie, same phone). When the
 * server would now give this phone the current site instead of the phone site, or the current scanner instead of the
 * phone scanner (the stamp no longer says `"scan": true`), the tab reloads, so a switch turned off reaches open phones
 * in about a minute.
 *
 * The home-screen card (piece S5, PLAN-SCANNER.md row 25): "Put Thrift+ on your home screen", above the bottom bar on
 * every page of the phone site but /scan (the trip shows its own banner there), only where a phone can add it and never
 * in the installed app; "Not now" hides it for two weeks (the live key). The update bar takes its place while it shows.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'
import { bootNow, fetchHome, type HomeFeed } from '../lib/boot'
import { HomeScreenCard } from '../scan/member/HomeScreenCard'
import { scanIsRoute } from '../scan/switch'

declare const __APP_VERSION__: string

export const PAGE_VERSION = typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : ''

function clean(v: string | undefined | null): string {
  return String(v || '').trim().replace(/^v/i, '')
}

/** True when the server runs another release than this page (unknown on either side = no). */
export function isNewer(feed: Pick<HomeFeed, 'app'> | null, page: string = PAGE_VERSION): boolean {
  const server = clean(feed?.app)
  const mine = clean(page)
  return Boolean(server && mine && server !== mine)
}

const RECHECK_MS = 60_000

/** True on the scanner's own address. */
export function onScanPath(pathname: string): boolean {
  return pathname === '/scan' || pathname === '/scan/'
}

/** The phone site's page (phone.html) carries `data-member` on <html>; the current site's pages never do. */
const PHONE_PAGE_RE = /<html[^>]*\sdata-member=/i
const STAMP_RE = /<script id="eco-boot" type="application\/json">([\s\S]*?)<\/script>/

/**
 * Should this open tab reload, given the HTML the server answers now for `/scan` (on the scanner) or `/` (anywhere
 * else)? Yes when that is no longer the phone site; or, off the scanner, when this tab links to /scan as a route but
 * the new stamp no longer says the phone scanner is on (a page with no stamp at all, a cold server, says nothing).
 */
export function shouldReload(html: string, { onScan, scanRoute }: { onScan: boolean; scanRoute: boolean }): boolean {
  if (!PHONE_PAGE_RE.test(html)) return true
  if (onScan || !scanRoute) return false
  const stamp = STAMP_RE.exec(html)
  if (!stamp) return false
  return !/^\s*\{\s*"scan"\s*:\s*true\b/.test(stamp[1])
}

/** Ask the server for the page this tab would get on a reload; reload (and say so) when a switch turned this phone back. */
export async function checkSite(): Promise<boolean> {
  const onScan = onScanPath(window.location.pathname)
  try {
    const r = await fetch(onScan ? '/scan' : '/', { credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'text/html' } })
    if (!r.ok || !/text\/html/i.test(r.headers.get('Content-Type') || '')) return false
    const html = await r.text()
    if (!shouldReload(html, { onScan, scanRoute: scanIsRoute() })) return false
  } catch {
    return false // offline: ask again next time
  }
  window.location.reload()
  return true
}

/** The checks each time the tab comes back: the switches (rollback), then a new release (the update bar). */
function useComeBack(): boolean {
  const [ready, setReady] = useState(() => isNewer(bootNow()))
  const last = useRef(Date.now())

  const check = useCallback(async () => {
    if (Date.now() - last.current < RECHECK_MS) return
    last.current = Date.now()
    if (await checkSite()) return
    try {
      if (isNewer(await fetchHome())) setReady(true)
    } catch {
      /* offline: ask again next time */
    }
  }, [])

  useEffect(() => {
    const onShow = () => {
      if (document.visibilityState === 'visible') void check()
    }
    document.addEventListener('visibilitychange', onShow)
    return () => document.removeEventListener('visibilitychange', onShow)
  }, [check])
  return ready
}

function UpdateBar() {
  return (
    <div className="upd fade" role="status">
      <span>A new version is ready</span>
      <button type="button" className="btn btn-lime" onClick={() => window.location.reload()}>
        Update
      </button>
    </div>
  )
}

export function Prompts() {
  const ready = useComeBack()
  const { pathname } = useLocation()
  return (
    <>
      {ready ? <UpdateBar /> : null}
      {/* INSTALL CARD SLOT (piece S5): fixed above the bottom bar, so it never shifts the page. */}
      {!ready && !onScanPath(pathname) ? (
        <div className="hs-float">
          <HomeScreenCard variant="banner" />
        </div>
      ) : null}
    </>
  )
}
