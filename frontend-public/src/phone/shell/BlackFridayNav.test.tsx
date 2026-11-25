/**
 * Black Friday on phones (owner 2026-11-24, Dash Update #228): "No in store tab Just Home Scan Thrift+ similar with menu:
 * Home, Scan Thrift + no in store on truck categories. You can have visit"; "all help an info are still there too".
 * Only while the day is bf; a normal day is unchanged.
 */
import type { ReactElement } from 'react'
import { render, screen, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { _setFeed, type HomeFeed } from '../lib/boot'
import { _resetMember } from '../lib/member'
import Home from '../pages/Home'
import Menu, { menuRows } from '../pages/Menu'
import { INFO } from '../pages/words'
import { BottomBar } from './BottomBar'

const FEED = {
  v: '1', as_of: '2026-11-24T12:00:00Z', day: 'normal',
  shelf: { pieces: 35000, products: 8000, categories: 23 },
  hours: { timezone: 'America/Chicago', open: '09:00', close: '18:00', closed_weekdays: [6], overrides: [] },
  thrift_plus_open: true,
  finds: [{ pid: 1, name: 'A lamp', cat: 'decor', price: 20, retail: 60, tb: 3, units: 1, tag: '0000001', photo: '/p/1.jpg' }],
  coming: { trucks: [{ id: 1, name: 'Walmart', pallets: 2, pieces: 40, listed: true }], items: [{ id: 9, name: 'A sofa', cat: 'furniture', retail: 300, qty: 1, truck: 1 }] },
  top_cats: ['apparel', 'toys', 'health', 'party', 'kitchen', 'decor'],
} as unknown as HomeFeed

function day(d: 'normal' | 'bf') {
  _setFeed({ ...FEED, day: d } as HomeFeed)
}

beforeEach(() => {
  sessionStorage.clear()
  vi.stubGlobal('fetch', vi.fn((url: string) => {
    const body = url.startsWith('/api/thriftplus/public/session/') ? { status: 'signed_out' } : {}
    if (url.startsWith('/api/storefront/stock.json')) return Promise.resolve(new Response('', { status: 503 }))
    return Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } }))
  }))
  _resetMember()
})

afterEach(() => {
  vi.unstubAllGlobals()
  _setFeed(null)
  document.documentElement.setAttribute('data-day', 'normal')
})

const shown = (ui: ReactElement) => render(<MemoryRouter>{ui}</MemoryRouter>)

describe('the bottom bar', () => {
  it('a normal day: Home, In store, Scan, Thrift+', () => {
    day('normal')
    shown(<BottomBar />)
    const bar = screen.getByRole('navigation', { name: 'Main' })
    expect(within(bar).getAllByRole('link').map((a) => a.textContent)).toEqual(['Home', 'In store', 'Scan', 'Thrift+'])
    expect(bar).not.toHaveClass('bb3')
  })

  it('Black Friday: Home, Scan, Thrift+, spread over three even columns', () => {
    day('bf')
    shown(<BottomBar />)
    const bar = screen.getByRole('navigation', { name: 'Main' })
    expect(within(bar).getAllByRole('link').map((a) => a.textContent)).toEqual(['Home', 'Scan', 'Thrift+'])
    expect(bar).toHaveClass('bb3')
  })
})

describe('the menu', () => {
  it('a normal day: every row as before', () => {
    day('normal')
    shown(<Menu />)
    const menu = screen.getByRole('navigation', { name: 'Menu' })
    const names = within(menu).getAllByRole('link').map((a) => a.textContent?.replace('›', ''))
    expect(names).toEqual(['Home', 'Scan a tag', 'Thrift+', 'In store', 'On the truck', 'Categories', 'Visit', ...INFO.map((i) => i.name)])
  })

  it('Black Friday: Home, Scan, Thrift+, Visit, and every help and info row', () => {
    day('bf')
    shown(<Menu />)
    const menu = screen.getByRole('navigation', { name: 'Menu' })
    const names = within(menu).getAllByRole('link').map((a) => a.textContent?.replace('›', ''))
    expect(names).toEqual(['Home', 'Scan a tag', 'Thrift+', 'Visit', ...INFO.map((i) => i.name)])
    expect(screen.getByText('Help and info')).toBeInTheDocument()
    expect(menuRows('bf').map(([, to]) => to)).not.toContain('/store')
  })
})

describe('the home', () => {
  it('a normal day: the store list, categories and the truck are offered', () => {
    day('normal')
    shown(<Home />)
    expect(within(document.getElementById('finds')!).getByRole('link', { name: 'See all' })).toHaveAttribute('href', '/store')
    expect(document.getElementById('categories')).not.toBeNull()
    expect(document.getElementById('coming')).not.toBeNull()
  })

  it('Black Friday: no way into the store list, the categories or the truck; finds, visit and help stay', () => {
    day('bf')
    shown(<Home />)
    expect(document.getElementById('categories')).toBeNull()
    expect(document.getElementById('coming')).toBeNull()
    const links = screen.getAllByRole('link').map((a) => a.getAttribute('href') || '')
    expect(links.filter((h) => h === '/store' || h.startsWith('/store?') || h === '/categories')).toEqual([])
    expect(document.getElementById('finds')).not.toBeNull()
    expect(document.getElementById('visit')).not.toBeNull()
    for (const i of INFO) expect(links).toContain(i.to)
  })
})
