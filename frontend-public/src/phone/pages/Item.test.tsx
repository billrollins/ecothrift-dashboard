import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { _setFeed, type HomeFeed } from '../lib/boot'
import { _resetMember } from '../lib/member'
import { _setStock, parseStock } from '../lib/stock'
import Item from './Item'
import {
  _clearItemCache, comingFromMemory, fetchItem, inStoreFromMemory, listHref, memberPick, mergeApi, parseApi, parseId,
  returnsLabel, STOCK_LINE, type ApiItem,
} from './item/itemData'

// The stock feed's shape (apps/storefront stock.json): cats in taxonomy order, rows as arrays.
const RAW = {
  v: 'x', as_of: '2026-11-19T12:00:00-06:00',
  cats: [
    { id: 'kitchen', name: 'Kitchen & dining', pieces: 2149 },
    { id: 'furniture', name: 'Furniture', pieces: 195 },
  ],
  trucks: [{ id: 7, name: 'Walmart', pallets: 21, pieces: 1255, listed: true }],
  instore: [
    [1, 'SMEG retro espresso machine with grinder', 0, 600, 1200, 102, 1, '0226011'],
    [2, 'Brass table lamp', 0, 12, 0, 0, 46, ''],
    [3, 'KitchenAid stand mixer', 0, 120, 449.99, 20, 1, '0226100', 2], // a stock photo
    [4, 'Oak dining table', 1, 300, 900, 40, 1, '0226200', 1], // a photo-sheet photo
  ] as Array<[number, string, number, number, number, number, number, string, number?]>,
  coming: [
    [10, 'Farmhouse hall tree with bench', 1, 482.98, 1, 0],
    [12, 'Lamp shade', 1, 0, 4, 0],
  ] as Array<[number, string, number, number, number, number]>,
}
const STOCK = parseStock(RAW)

function feed(day: 'normal' | 'bf' = 'normal', extra: Partial<HomeFeed> = {}): HomeFeed {
  return {
    v: 'h', as_of: '', day, shelf: { pieces: 0, products: 0, categories: 23 }, hours: null, thrift_plus_open: true,
    finds: [], coming: { trucks: [], items: [] }, top_cats: [], ...extra,
  }
}

/** The item endpoint's test double (apps/storefront/services/item.py's shape). */
function apiItem(over: Partial<ApiItem> = {}): ApiItem {
  return {
    pid: 1, name: 'SMEG retro espresso machine with grinder', brand: 'SMEG', cat: 'kitchen', condition: 'Like new', units: 1,
    tags: ['0226011'], price: 600, retail: 1200, tb: 102, returns: '3-day', photo: null, photo_kind: null, available: true,
    ...over,
  }
}

type Answer = { status: number; body?: unknown } | 'down'
let itemAnswer: Answer = { status: 200, body: apiItem() }
let member = false
let itemCalls = 0

function json(status: number, body: unknown) {
  return Promise.resolve(new Response(JSON.stringify(body ?? {}), { status, headers: { 'Content-Type': 'application/json' } }))
}

beforeEach(() => {
  _clearItemCache()
  itemCalls = 0
  itemAnswer = { status: 200, body: apiItem() }
  member = false
  sessionStorage.clear()
  vi.stubGlobal('fetch', vi.fn((url: string) => {
    if (url.startsWith('/api/storefront/item/')) {
      itemCalls += 1
      if (itemAnswer === 'down') return Promise.reject(new TypeError('Failed to fetch'))
      return json(itemAnswer.status, itemAnswer.body)
    }
    if (url.startsWith('/api/thriftplus/public/session/')) {
      return json(200, member
        ? { status: 'member', member: { first_name: 'Ana', bucks_available: '35.00', bucks_use_by: '2026-12-19', ready: true } }
        : { status: 'signed_out' })
    }
    if (url.startsWith('/api/storefront/stock.json')) return json(503, {})
    return json(404, {})
  }))
  _setStock(STOCK)
  _setFeed(feed())
  _resetMember()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

function Where() {
  const loc = useLocation()
  return <p data-testid="at">{loc.pathname + loc.search}</p>
}

function open(path: string, entries: string[] = [path]) {
  return render(
    <MemoryRouter initialEntries={entries} initialIndex={entries.length - 1}>
      <Routes>
        <Route path="/store/item/:id" element={<Item />} />
        <Route path="*" element={<Where />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('itemData', () => {
  it('reads the page address', () => {
    expect(parseId('p226011')).toEqual({ where: 'instore', pid: 226011 })
    expect(parseId('m42')).toEqual({ where: 'coming', rowid: 42 })
    expect(parseId('x1')).toBeNull()
    expect(parseId('p')).toBeNull()
    expect(parseId('p1x')).toBeNull()
  })

  it('checks the endpoint body: a wrong shape is unreachable, not available is gone', () => {
    expect(parseApi('<html>')).toEqual({ state: 'error' })
    expect(parseApi({ pid: 1 })).toEqual({ state: 'error' })
    expect(parseApi({ ...apiItem(), available: false })).toEqual({ state: 'gone' })
    const ok = parseApi({ ...apiItem(), cat: 'nope', tags: ['1', '2', '3', '4', '5', '6'], returns: 'as_is' })
    expect(ok.state === 'ok' && ok.item.cat).toBe('other')
    expect(ok.state === 'ok' && ok.item.tags).toHaveLength(5)
    expect(ok.state === 'ok' && ok.item.returns).toBe('as_is')
    expect(ok.state === 'ok' && ok.item.photo_kind).toBeNull()
    const sheet = parseApi({ ...apiItem(), photo: '/api/storefront/photo/1/', photo_kind: 'sheet' })
    expect(sheet.state === 'ok' && sheet.item.photo_kind).toBe('sheet')
    const unknown = parseApi({ ...apiItem(), photo: '/api/storefront/photo/1/', photo_kind: 'other' })
    expect(unknown.state === 'ok' && unknown.item.photo_kind).toBe('stock')
  })

  it('paints from the stock, else from the home feed', () => {
    expect(inStoreFromMemory(1, STOCK, null)).toMatchObject({ name: 'SMEG retro espresso machine with grinder', tag: '0226011', photo: null, photoKind: null })
    expect(inStoreFromMemory(3, STOCK, null)).toMatchObject({ photo: '/api/storefront/photo/3/', photoKind: 'stock' })
    expect(inStoreFromMemory(4, STOCK, null)).toMatchObject({ photo: '/api/storefront/photo/4/', photoKind: 'sheet' })
    const withFind = feed('normal', { finds: [{ pid: 9, name: 'Lamp', cat: 'decor', price: 5, retail: 20, tb: 1, units: 1, tag: '0000009', photo: '/p/9' }] })
    // A photo with no kind (an older feed) counts as a stock photo: the line says it may not match.
    expect(inStoreFromMemory(9, null, withFind)).toMatchObject({ name: 'Lamp', price: 5, photo: '/p/9', photoKind: 'stock' })
    expect(inStoreFromMemory(9, null, null)).toBeNull()
    expect(comingFromMemory(10, STOCK, null)).toMatchObject({ retail: 482.98, truck: 'Walmart' })
    const withComing = feed('normal', {
      coming: { trucks: [{ id: 3, name: 'Wayfair', pallets: 2, pieces: 9, listed: true }], items: [{ id: 77, name: 'Chair', cat: 'furniture', retail: 0, qty: 1, truck: 3 }] },
    })
    expect(comingFromMemory(77, null, withComing)).toMatchObject({ name: 'Chair', retail: 0, truck: 'Wayfair' })
  })

  it('lets the live numbers win, and keeps a tag only for a single unit', () => {
    const mem = inStoreFromMemory(1, STOCK, null)
    expect(mergeApi(mem, apiItem({ price: 550, tb: 90 }))).toMatchObject({ price: 550, tb: 90, tag: '0226011', photo: null })
    expect(mergeApi(mem, apiItem({ units: 3, tags: ['1', '2', '3'] })).tag).toBe('')
  })

  it('links to the right list and words returns as the scanner does', () => {
    expect(listHref('instore', 'kitchen')).toBe('/store?cat=kitchen')
    expect(listHref('coming', 'furniture')).toBe('/store?where=coming&cat=furniture')
    expect(listHref('instore')).toBe('/store')
    expect(returnsLabel('3-day')).toBe('Thrift+ 3-day')
    expect(returnsLabel('as_is')).toBe('AS IS · no returns')
  })

  it('picks the member line: ThriftBucks only, never a dollar figure', () => {
    expect(memberPick('unknown', 'normal', 5)).toEqual({ kind: 'wait' })
    expect(memberPick('out', 'bf', 5)).toEqual({ kind: 'join' })
    expect(memberPick('member', 'normal', 5)).toEqual({ kind: 'keep', tb: 5 })
    expect(memberPick('member', 'bf', 5)).toEqual({ kind: 'off', tb: 5 })
    expect(memberPick('member', 'normal', 0)).toEqual({ kind: 'none' })
  })

  it('asks the endpoint once a minute: 404 is gone, a failure is unreachable', async () => {
    expect(await fetchItem(1)).toMatchObject({ state: 'ok' })
    expect(await fetchItem(1)).toMatchObject({ state: 'ok' })
    expect(itemCalls).toBe(1)
    itemAnswer = { status: 404 }
    expect(await fetchItem(2)).toEqual({ state: 'gone' })
    itemAnswer = { status: 502 }
    expect(await fetchItem(3)).toEqual({ state: 'error' })
    itemAnswer = 'down'
    expect(await fetchItem(4)).toEqual({ state: 'error' })
  })
})

describe('Item page', () => {
  it('paints at once from the stock, then fills the extras in', async () => {
    open('/store/item/p1')
    expect(screen.getByRole('heading', { name: 'SMEG retro espresso machine with grinder' })).toBeInTheDocument()
    expect(screen.getByText('Tag 0226011')).toBeInTheDocument()
    expect(screen.getByText('+ 102.00 ThriftBucks')).toBeInTheDocument()
    expect(screen.getByText('Thrift+ members. Most items.')).toBeInTheDocument()
    expect(screen.getByText('$1,200.00')).toBeInTheDocument()
    expect(await screen.findByText('SMEG')).toBeInTheDocument()
    expect(screen.getByText('Like new')).toBeInTheDocument()
    expect(screen.getByText('Thrift+ 3-day')).toBeInTheDocument()
    expect(screen.getByText('Not held. First come, first served.')).toBeInTheDocument()
    expect(screen.getByText('Our list can run behind the shelf. It may already be sold.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /More Kitchen & dining/ })).toHaveAttribute('href', '/store?cat=kitchen')
    // Signed out: the join row, never a pay-today figure.
    expect(await screen.findByRole('link', { name: /Join free/ })).toHaveAttribute('href', '/scan?view=join')
    expect(document.body.textContent).not.toMatch(/pay/i)
  })

  it('a stock photo shows on top with its line from the first paint; no photo, no line', async () => {
    itemAnswer = { status: 200, body: apiItem({ pid: 3, name: 'KitchenAid stand mixer', photo: '/api/storefront/photo/3/', photo_kind: 'stock' }) }
    const first = open('/store/item/p3')
    expect(document.querySelector('.it-pic img')?.getAttribute('src')).toBe('/api/storefront/photo/3/')
    expect(screen.getByText(STOCK_LINE)).toHaveClass('it-stockline')
    await waitFor(() => expect(itemCalls).toBe(1))
    expect(screen.getByText(STOCK_LINE)).toBeInTheDocument()
    first.unmount()
    open('/store/item/p1')
    expect(document.querySelector('.it-pic')).toBeNull()
    expect(screen.queryByText(STOCK_LINE)).toBeNull()
  })

  it('a photo-sheet photo (ours) shows on top with no line', () => {
    open('/store/item/p4')
    expect(document.querySelector('.it-pic img')?.getAttribute('src')).toBe('/api/storefront/photo/4/')
    expect(screen.queryByText(STOCK_LINE)).toBeNull()
  })

  it('a photo learned after the first paint: a sheet photo as a small picture, a stock photo left out', async () => {
    itemAnswer = { status: 200, body: apiItem({ photo: '/api/storefront/photo/1/', photo_kind: 'sheet' }) }
    const first = open('/store/item/p1')
    expect(await screen.findByText('SMEG')).toBeInTheDocument()
    expect(document.querySelector('.it-pic')).toBeNull()
    expect(document.querySelector('.it-thumb img')?.getAttribute('src')).toBe('/api/storefront/photo/1/')
    first.unmount()
    _clearItemCache()
    itemAnswer = { status: 200, body: apiItem({ photo: '/api/storefront/photo/1/', photo_kind: 'stock' }) }
    open('/store/item/p1')
    expect(await screen.findByText('SMEG')).toBeInTheDocument()
    expect(document.querySelector('.it-thumb')).toBeNull()
    expect(screen.queryByText(STOCK_LINE)).toBeNull()
  })

  it('keeps what it painted when the endpoint is unreachable', async () => {
    itemAnswer = 'down'
    open('/store/item/p2')
    expect(screen.getByRole('heading', { name: 'Brass table lamp' })).toBeInTheDocument()
    expect(screen.getByText('About 46 on the shelf')).toBeInTheDocument()
    expect(screen.getByText('0.00 ThriftBucks')).toBeInTheDocument()
    await waitFor(() => expect(itemCalls).toBe(1))
    await waitFor(() => expect(screen.getAllByText('–').length).toBeGreaterThan(0))
    expect(screen.getByRole('heading', { name: 'Brass table lamp' })).toBeInTheDocument()
  })

  it('shows up to five tags for a piece with many units', async () => {
    itemAnswer = { status: 200, body: apiItem({ pid: 2, name: 'Brass table lamp', units: 46, tags: ['0000001', '0000002', '0000003', '0000004', '0000005'], tb: 0, retail: 0, price: 12 }) }
    open('/store/item/p2')
    expect(await screen.findByText('+ 41 more')).toBeInTheDocument()
    expect([...document.querySelectorAll('.it-tg')].map((e) => e.textContent)).toEqual(['0000001', '0000002', '0000003', '0000004', '0000005', '+ 41 more'])
  })

  it('a sold piece (404) is no longer listed', async () => {
    itemAnswer = { status: 404 }
    open('/store/item/p1')
    expect(await screen.findByRole('heading', { name: 'This item is no longer listed' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'See the list' })).toHaveAttribute('href', '/store')
  })

  it('a direct visit before the stock paints from the endpoint alone', async () => {
    _setStock(null)
    itemAnswer = { status: 200, body: apiItem({ pid: 5, name: 'Vitamix blender', price: 200, retail: 399.99, tb: 28, tags: ['0226541'] }) }
    open('/store/item/p5')
    expect(document.querySelector('.it-load')).not.toBeNull()
    expect(await screen.findByRole('heading', { name: 'Vitamix blender' })).toBeInTheDocument()
    expect(screen.getByText('Tag 0226541')).toBeInTheDocument()
  })

  it('signed in on a normal day: keep the ThriftBucks; on Black Friday: they come off', async () => {
    member = true
    open('/store/item/p1')
    expect(await screen.findByText('Keep 102.00 ThriftBucks')).toBeInTheDocument()
    expect(screen.getByText('for your next visit')).toBeInTheDocument()
    expect(document.body.textContent).not.toMatch(/pay/i)
  })

  it('on Black Friday a member sees the ThriftBucks off in the card', async () => {
    member = true
    _setFeed(feed('bf'))
    open('/store/item/p1')
    await waitFor(() => expect(document.querySelector('.it-out.it-off')?.textContent).toBe('102.00 ThriftBucks off'))
    expect(document.body.textContent).not.toMatch(/pay/i)
  })

  it('a coming piece: the retail and "Priced on arrival", no ThriftBucks, no endpoint', async () => {
    open('/store/item/m10')
    expect(screen.getByRole('heading', { name: 'Farmhouse hall tree with bench' })).toBeInTheDocument()
    expect(screen.getByText('Walmart truck')).toBeInTheDocument()
    expect(screen.getByText('Priced on arrival')).toBeInTheDocument()
    expect(screen.getByText('Not in store yet')).toBeInTheDocument()
    expect(screen.getByText('Not held. The price is set when it lands.')).toBeInTheDocument()
    expect(document.querySelector('.it-est')?.textContent).toBe('Retail$48298')
    expect(document.body.textContent).not.toMatch(/ThriftBucks/)
    expect(screen.getByRole('link', { name: /More Furniture/ })).toHaveAttribute('href', '/store?where=coming&cat=furniture')
    expect(itemCalls).toBe(0)
  })

  it('a coming piece with no retail shows the dashed block and how many are coming', () => {
    open('/store/item/m12')
    expect(document.querySelector('.it-est.it-none2')?.textContent).toBe('Priced on arrival')
    expect(screen.getByText('4 coming')).toBeInTheDocument()
  })

  it('a coming piece not in the stock is no longer listed', async () => {
    open('/store/item/m999')
    expect(await screen.findByRole('heading', { name: 'This item is no longer listed' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'See the list' })).toHaveAttribute('href', '/store?where=coming')
  })

  it('a bad address is no longer listed', () => {
    open('/store/item/zzz')
    expect(screen.getByRole('heading', { name: 'This item is no longer listed' })).toBeInTheDocument()
  })

  it('Back returns to where the visitor came from; a direct visit goes to the list', async () => {
    const first = open('/store/item/p1', ['/store?q=lamp&sort=low', '/store/item/p1'])
    screen.getByRole('button', { name: 'Back' }).click()
    expect(await screen.findByTestId('at')).toHaveTextContent('/store?q=lamp&sort=low')
    first.unmount()
    open('/store/item/m10')
    screen.getByRole('button', { name: 'Back' }).click()
    expect(await screen.findByTestId('at')).toHaveTextContent('/store?where=coming')
  })
})
