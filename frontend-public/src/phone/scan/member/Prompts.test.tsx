/**
 * shell/Prompts.tsx, the parts piece S5 added: the home-screen card in the install slot (PLAN-SCANNER.md row 25) and
 * the rollback re-check for open tabs (section 5). The update bar's own test stays in lib/phoneLib.test.ts.
 */
import { act, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { _setFeed, type HomeFeed } from '../../lib/boot'
import { checkSite, isNewer, onScanPath, PAGE_VERSION, Prompts, shouldReload } from '../../shell/Prompts'

const IPHONE_SAFARI = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'

const PHONE = (stamp = '') => `<!doctype html><html lang="en" data-day="normal" data-member="unknown"><head>${stamp}</head><body><div id="root"></div></body></html>`
const STAMP = (body: string) => `<script id="eco-boot" type="application/json">${body}</script>`
const CLASSIC = '<!doctype html><html lang="en"><head></head><body><div id="root"></div></body></html>'

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Prompts />
    </MemoryRouter>,
  )
}

let reload: ReturnType<typeof vi.fn>
const realLocation = window.location
beforeEach(() => {
  localStorage.clear()
  reload = vi.fn()
  Object.defineProperty(window, 'location', { configurable: true, value: { ...realLocation, pathname: '/', reload } })
})
afterEach(() => {
  Object.defineProperty(window, 'location', { configurable: true, value: realLocation })
  _setFeed(null)
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('rollback for open tabs', () => {
  it('reloads when the server would give this phone the current site, or the current scanner', () => {
    // The current site answers: back to it.
    expect(shouldReload(CLASSIC, { onScan: false, scanRoute: true })).toBe(true)
    expect(shouldReload(CLASSIC, { onScan: true, scanRoute: true })).toBe(true) // /scan answers with the old scanner
    // Still the phone site, scanner still on.
    expect(shouldReload(PHONE(STAMP('{"scan":true,"v":"1"}')), { onScan: false, scanRoute: true })).toBe(false)
    expect(shouldReload(PHONE(), { onScan: true, scanRoute: true })).toBe(false)
    // The scanner switch went off: this tab still links to /scan as a route, the server no longer says so.
    expect(shouldReload(PHONE(STAMP('{"v":"1","day":"normal"}')), { onScan: false, scanRoute: true })).toBe(true)
    // No stamp at all (a cold server) says nothing; a tab that never had the phone scanner has nothing to undo.
    expect(shouldReload(PHONE(), { onScan: false, scanRoute: true })).toBe(false)
    expect(shouldReload(PHONE(STAMP('{"v":"1"}')), { onScan: false, scanRoute: false })).toBe(false)
  })

  it('asks for /scan on the scanner and / elsewhere, as a reload would, and reloads only on a change', async () => {
    const fetch = vi.fn(async () => new Response(CLASSIC, { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } }))
    vi.stubGlobal('fetch', fetch)
    expect(await checkSite()).toBe(true)
    expect(fetch).toHaveBeenCalledWith('/', expect.objectContaining({ cache: 'no-store', headers: { Accept: 'text/html' } }))
    expect(reload).toHaveBeenCalledTimes(1)

    Object.defineProperty(window, 'location', { configurable: true, value: { ...realLocation, pathname: '/scan', reload } })
    fetch.mockImplementation(async () => new Response(PHONE(), { status: 200, headers: { 'Content-Type': 'text/html' } }))
    expect(await checkSite()).toBe(false)
    expect(fetch).toHaveBeenLastCalledWith('/scan', expect.anything())
    expect(reload).toHaveBeenCalledTimes(1)
  })

  it('never reloads on an error page or with no signal', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('oops', { status: 502, headers: { 'Content-Type': 'text/html' } })))
    expect(await checkSite()).toBe(false)
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 200, headers: { 'Content-Type': 'application/json' } })))
    expect(await checkSite()).toBe(false)
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new TypeError('Failed to fetch')
    }))
    expect(await checkSite()).toBe(false)
    expect(reload).not.toHaveBeenCalled()
  })

  it('checks when the tab comes back, at most once a minute', async () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    try {
      const fetch = vi.fn(async () => new Response(PHONE(), { status: 200, headers: { 'Content-Type': 'text/html' } }))
      vi.stubGlobal('fetch', fetch)
      renderAt('/')
      const show = () => act(() => {
        document.dispatchEvent(new Event('visibilitychange'))
      })
      show()
      expect(fetch).not.toHaveBeenCalled() // just loaded
      vi.setSystemTime(Date.now() + 61_000)
      show()
      await waitFor(() => expect(fetch).toHaveBeenCalledWith('/', expect.anything()))
      const n = fetch.mock.calls.length
      show()
      expect(fetch.mock.calls.length).toBe(n)
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('the home-screen card in the install slot', () => {
  it('floats above the bottom bar on the site\'s pages on iPhone Safari, but not on /scan (the trip has its own)', () => {
    const ua = vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(IPHONE_SAFARI)
    const home = renderAt('/')
    expect(screen.getByTestId('home-banner')).toBeInTheDocument()
    expect(screen.getByTestId('home-banner').parentElement).toHaveClass('hs-float')
    home.unmount()
    renderAt('/scan')
    expect(onScanPath('/scan/')).toBe(true)
    expect(screen.queryByTestId('home-banner')).toBeNull()
    ua.mockRestore()
  })

  it('is never there on a computer', () => {
    renderAt('/store')
    expect(screen.queryByTestId('home-banner')).toBeNull()
  })

  it('gives its place to the update bar', () => {
    if (!PAGE_VERSION) return // no release stamped in this test run: the bar cannot show
    const ua = vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(IPHONE_SAFARI)
    _setFeed({ v: '1', as_of: '', app: `${PAGE_VERSION}.9` } as unknown as HomeFeed)
    expect(isNewer({ app: `${PAGE_VERSION}.9` })).toBe(true)
    renderAt('/')
    expect(screen.getByRole('status')).toHaveTextContent('A new version is ready')
    expect(screen.queryByTestId('home-banner')).toBeNull()
    ua.mockRestore()
  })
})
