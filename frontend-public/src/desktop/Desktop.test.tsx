/**
 * The desktop site (Dash Update #211): the shell (every section in the header, no phone parts), the routes (the phone
 * site's addresses, /scan as the tag-number page, the scanner's views handed to the desktop pages), the home on a normal
 * day and on Black Friday (the sale and one button, Get directions, the rest below), and the header's search.
 */
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { _setFeed, type HomeFeed } from '../phone/lib/boot'
import { _resetMember } from '../phone/lib/member'
import App from './App'
import { deskDayOf } from './lib/day'
import { deskScanRedirect, skuOf } from './pages/Scan'
import { fullRows, TbLine } from './pages/home/Blocks'
import Specials, { BF_TEASER_ENDS } from './pages/home/Specials'
import { BF_PRICE, BLACK_FRIDAY, navOn, NAV, SUB_NAV } from './words'

const FEED = {
  v: '1', as_of: '2026-11-24T12:00:00Z', app: '2.331.0', day: 'normal',
  shelf: { pieces: 35000, products: 8000, categories: 23 },
  bucks: { share: 92, typical: 45 },
  hours: { timezone: 'America/Chicago', open: '09:00', close: '18:00', closed_weekdays: [6], overrides: [] },
  thrift_plus_open: true,
  finds: [{ pid: 1, name: 'A lamp', cat: 'decor', price: 20, retail: 60, tb: 3, units: 1, tag: '0000001', photo: '/p/1.jpg', photo_kind: 'sheet' }],
  coming: { trucks: [{ id: 1, name: 'Walmart', pallets: 20, pieces: 400, listed: true }], items: [{ id: 9, name: 'A sofa', cat: 'furniture', retail: 300, qty: 1, truck: 1 }] },
  top_cats: ['apparel', 'toys', 'health', 'party', 'kitchen', 'decor'],
} as unknown as HomeFeed

function json(body: unknown) {
  return Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } }))
}

beforeEach(() => {
  sessionStorage.clear()
  vi.stubGlobal('fetch', vi.fn((url: string) => {
    if (url.startsWith('/api/thriftplus/public/session/')) return json({ status: 'signed_out' })
    if (url.startsWith('/api/storefront/stock.json')) return Promise.resolve(new Response('', { status: 503 }))
    return json({})
  }))
  _setFeed(FEED)
  _resetMember()
  document.documentElement.setAttribute('data-day', 'normal')
})

afterEach(() => {
  vi.unstubAllGlobals()
  _setFeed(null)
})

function Where() {
  const loc = useLocation()
  return <output data-testid="where">{loc.pathname + loc.search}</output>
}

function show(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <App />
      <Where />
    </MemoryRouter>,
  )
}

describe('the shell', () => {
  it('shows every section in the header and has no phone parts', async () => {
    show('/')
    const shop = screen.getByRole('navigation', { name: 'Shop' })
    for (const n of NAV) expect(within(shop).getByRole('link', { name: n.name })).toBeInTheDocument()
    const help = screen.getByRole('navigation', { name: 'Help and info' })
    for (const n of SUB_NAV) expect(within(help).getByRole('link', { name: n.name })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Menu' })).toBeNull() // no hamburger
    expect(document.querySelector('.bb, .ph, .top .menu')).toBeNull() // no bottom bar, no phone column or header
    expect(screen.getByRole('search')).toBeInTheDocument()
    expect(await within(screen.getByRole('banner')).findByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/account/sign-in')
  })

  it('marks the page you are on', () => {
    expect(navOn('/store', '/store', '')).toBe(true)
    expect(navOn('/store', '/store', '?where=coming')).toBe(false)
    expect(navOn('/store?where=coming', '/store', '?where=coming')).toBe(true)
    expect(navOn('/store?where=coming', '/store/item/m12', '')).toBe(true)
    expect(navOn('/careers', '/careers/apply', '')).toBe(true)
    expect(navOn('/visit', '/', '')).toBe(false)
  })

  it('search opens the store list; a tag number opens the tag page', async () => {
    const user = userEvent.setup()
    show('/')
    const box = screen.getByRole('textbox', { name: 'Search the store' })
    await user.type(box, 'lamp')
    await user.click(screen.getByRole('button', { name: 'Search' }))
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/store?q=lamp'))
    await user.click(screen.getByRole('link', { name: 'Eco-Thrift home' }))
    await user.type(screen.getByRole('textbox', { name: 'Search the store' }), '227851')
    await user.click(screen.getByRole('button', { name: 'Search' }))
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/scan?tag=ITM0227851'))
  })
})

describe('the home', () => {
  it('a normal day: the Thrift+ card with today\'s numbers, the specials as equal boxes, then the blocks', () => {
    show('/')
    expect(screen.getByText('No Thrift+?')).toBeInTheDocument()
    expect(screen.getByText('ThriftBucks on 92% of our items')).toBeInTheDocument()
    expect(within(screen.getByLabelText('Specials')).getByRole('link', { name: 'Join free' })).toHaveAttribute('href', '/account/sign-in?view=join')
    expect(screen.getByRole('heading', { name: 'Best finds' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'On the truck' })).toBeInTheDocument()
    expect(screen.queryByTestId('bf-desktop-home')).toBeNull()
  })

  it('the Black Friday teaser goes by itself after Sat Nov 28', () => {
    const { unmount } = render(<MemoryRouter><Specials now={BF_TEASER_ENDS - 1} /></MemoryRouter>)
    expect(screen.getByText('Friday')).toBeInTheDocument()
    unmount()
    render(<MemoryRouter><Specials now={BF_TEASER_ENDS} /></MemoryRouter>)
    expect(screen.queryByText('Friday')).toBeNull()
  })

  it('Black Friday: the sale and one button, Get directions; the header and the rest of home stay', () => {
    _setFeed({ ...FEED, day: 'bf' } as HomeFeed)
    show('/')
    const sale = screen.getByTestId('bf-desktop-home')
    expect(within(sale).getByText(BLACK_FRIDAY.say)).toBeInTheDocument()
    expect(within(sale).getByText(BLACK_FRIDAY.sub)).toBeInTheDocument()
    expect(within(sale).getByText(BLACK_FRIDAY.hours)).toBeInTheDocument()
    const buttons = within(sale).getAllByRole('link')
    expect(buttons).toHaveLength(1)
    expect(buttons[0]).toHaveTextContent('Get directions')
    expect(buttons[0].getAttribute('href')).toContain('google.com/maps/dir')
    expect(screen.queryByText('No Thrift+?')).toBeNull()
    expect(screen.getByRole('navigation', { name: 'Shop' })).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Best finds' })).toBeInTheDocument()
    expect(document.documentElement.getAttribute('data-day')).toBe('bf')
  })

  it('the server\'s Black Friday stamp wins over a normal feed', () => {
    expect(deskDayOf(FEED, 'bf')).toBe('bf')
    expect(deskDayOf(FEED, 'normal')).toBe('normal')
    expect(deskDayOf({ ...FEED, day: 'bf' } as HomeFeed, 'normal')).toBe('bf')
    expect(deskDayOf(null, 'normal')).toBe('normal')
  })

  it('Black Friday shows only the Black Friday price, never a ThriftBucks line', () => {
    const { unmount } = render(<TbLine tb={3.5} />)
    expect(screen.getByText('+ 3.50 ThriftBucks')).toBeInTheDocument()
    unmount()
    _setFeed({ ...FEED, day: 'bf' } as HomeFeed)
    render(<TbLine tb={3.5} />)
    expect(screen.getByText(BF_PRICE)).toBeInTheDocument()
    expect(screen.queryByText(/ThriftBucks/)).toBeNull()
  })

  it('grids show whole rows', () => {
    expect([fullRows(0), fullRows(5), fullRows(6), fullRows(7), fullRows(12), fullRows(20)]).toEqual([0, 5, 6, 6, 12, 12])
  })
})

describe('the routes', () => {
  it('the phone site\'s pages answer at the same addresses', async () => {
    for (const [path, text] of [
      ['/visit', 'One store in Omaha'], ['/about', 'Liquidation and thrift in Omaha'], ['/questions', 'Questions'],
      ['/returns', '3-day returns'], ['/no-such-page', 'We couldn’t find that page'],
    ] as const) {
      const { unmount } = show(path)
      expect(await screen.findByRole('heading', { level: 1, name: text })).toBeInTheDocument()
      unmount()
    }
  })

  it('the menu and old addresses go where the phone site sends them', async () => {
    let r = show('/menu')
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent(/^\/$/))
    r.unmount()
    r = show('/account/history')
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/thriftplus'))
    r.unmount()
    show('/thriftplus/warranty')
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('/terms'))
  })

  it('/scan on a computer: the tag page, and the scanner\'s views handed over', () => {
    const p = (s: string) => new URLSearchParams(s)
    expect(deskScanRedirect(p('view=join'))).toBe('/account/sign-in?view=join')
    expect(deskScanRedirect(p('view=finish'))).toBe('/account/sign-in?view=finish')
    expect(deskScanRedirect(p('view=qr'))).toBe('/thriftplus?show=qr')
    expect(deskScanRedirect(p('view=card'))).toBe('/thriftplus?show=qr')
    expect(deskScanRedirect(p('view=bucks'))).toBe('/thriftplus?show=bucks')
    expect(deskScanRedirect(p('tag=ITM0000001'))).toBeNull()
    expect([skuOf('227851'), skuOf('0227851'), skuOf('itm0227851'), skuOf('lamp'), skuOf('12')]).toEqual([
      'ITM0227851', 'ITM0227851', 'ITM0227851', null, null,
    ])
  })

  it('/scan looks a typed tag up as a second look (never counted as an in-store scan)', async () => {
    const calls: string[] = []
    vi.stubGlobal('fetch', vi.fn((url: string) => {
      calls.push(url)
      if (url.includes('/tag/')) {
        return json({ status: 'found', item: { sku: 'ITM0227851', title: 'Abstract wall art', category: 'decor', category_label: 'Decor', details: [],
          retail_price: '299.88', price: '69.99', reward: '2.09', member_price: '67.90', age_restricted: false, returnable: true, available: true } })
      }
      if (url.startsWith('/api/thriftplus/public/session/')) return json({ status: 'signed_out' })
      return json({})
    }))
    const user = userEvent.setup()
    show('/scan')
    await user.type(await screen.findByLabelText('Tag number'), '227851')
    await user.click(screen.getByRole('button', { name: 'See the price' }))
    expect(await screen.findByTestId('scan-result')).toHaveTextContent('Abstract wall art')
    expect(screen.getByTestId('scan-result')).toHaveTextContent('+ 2.09 ThriftBucks')
    const tagCall = calls.find((u) => u.includes('/tag/'))!
    expect(tagCall).toContain('/api/thriftplus/public/tag/ITM0227851/')
    expect(tagCall).toContain('again=1')
  })
})
