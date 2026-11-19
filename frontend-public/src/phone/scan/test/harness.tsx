/**
 * The scanner's test harness: a fresh fake server, store and member for each test, and the page at an address.
 *
 *   beforeEach(() => { fake = resetScanner() })
 *   renderScan('/scan?view=join')               // ScanApp in a MemoryRouter, with <Where /> (the address)
 *   renderScan('/scan', <MyScreen />)           // any element, same router and store
 *   screen.getByTestId('where')                 // the search part of the address (`?view=finish`)
 *   screen.getByTestId('path')                  // the path (`/thriftplus` after a hand-over)
 *
 * The fake server is test/fakeApi.ts; the real scan/api.ts and scan/store.ts run on top of it.
 */
import { render } from '@testing-library/react'
import type { ReactElement } from 'react'
import { MemoryRouter, Route, Routes, useLocation, useNavigationType } from 'react-router-dom'
import { vi } from 'vitest'
import { _resetMember } from '../../lib/member'
import { _resetApi } from '../api'
import ScanApp from '../ScanApp'
import { _resetScanStore } from '../store'
import { installFakeApi, type FakeApi } from './fakeApi'

/** The address the page is on now: `?signin=` comes off it, a join adds `view=finish`, a hand-over goes to /thriftplus. */
export function Where() {
  const loc = useLocation()
  return (
    <>
      <div data-testid="where">{loc.search}</div>
      <div data-testid="path">{loc.pathname}</div>
      <div data-testid="nav-type">{useNavigationType()}</div>
    </>
  )
}

/** Everything back to a phone that never opened the scanner: storage, the fake server, the store, the member. */
export function resetScanner(): FakeApi {
  try {
    window.localStorage.clear()
    window.sessionStorage.clear()
  } catch {
    /* jsdom always has storage */
  }
  const fake = installFakeApi()
  _resetApi()
  _resetMember()
  _resetScanStore()
  return fake
}

/** The scanner (or `element`) at `path`, with /thriftplus as a plain landing spot for hand-overs. */
export function renderScan(path = '/scan', element: ReactElement = <ScanApp />) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/scan" element={element} />
        <Route path="/thriftplus" element={<div data-testid="thriftplus-page" />} />
        <Route path="*" element={element} />
      </Routes>
      <Where />
    </MemoryRouter>,
  )
}

/** The phone asks for less motion (count-ups land at once). */
export function reduceMotion() {
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query.includes('prefers-reduced-motion'),
    media: query,
    onchange: null,
    addListener: () => undefined,
    removeListener: () => undefined,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
    dispatchEvent: () => false,
  }))
}
