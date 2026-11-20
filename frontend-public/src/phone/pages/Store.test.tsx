import { act, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { _setFeed, type HomeFeed } from '../lib/boot'
import { _setStock, parseStock } from '../lib/stock'
import Store, { bucksLine, emptyState, listing, readView } from './Store'

type InRaw = [number, string, number, number, number, number, number, string]
type CoRaw = [number, string, number, number, number, number]

// cats: 0 kitchen, 1 furniture, 2 decor, 3 other (the feed's order; ids from the feed).
const CATS = [
  { id: 'kitchen', name: 'Kitchen & dining', pieces: 2149 },
  { id: 'furniture', name: 'Furniture', pieces: 195 },
  { id: 'decor', name: 'Home décor & lighting', pieces: 1405 },
  { id: 'other', name: 'Mixed lots & uncategorized', pieces: 3000 },
  { id: 'toys', name: 'Toys & games', pieces: 0 },
]
const instore: InRaw[] = [
  [1, 'SMEG retro espresso machine', 0, 600, 1200, 102, 1, '0226011'],
  [2, 'Brass table lamp', 2, 12, 0, 0, 53, ''],
  [3, 'Planked panel bed', 1, 584.5, 1669.99, 52.6, 1, '0227076'],
]
// 70 more kitchen rows, so the list needs "Show 30 more".
for (let i = 0; i < 70; i++) instore.push([100 + i, `Mixing bowl ${i}`, 0, 5 + i, 10 + i * 2, 0.5, 1, ''])
const coming: CoRaw[] = [
  [10, 'Farmhouse hall tree with bench', 1, 482.98, 1, 0],
  [11, 'Chandelier', 2, 0, 3, 0],
]
const RAW = {
  v: 't', as_of: '2026-11-19T12:00:00-06:00', cats: CATS,
  trucks: [{ id: 7, name: 'Walmart', pallets: 21, pieces: 1255, listed: true }],
  instore, coming,
}
const stock = parseStock(RAW)
const view = (s: string) => readView(new URLSearchParams(s))

describe('Store listing (logic)', () => {
  it('reads the URL, with defaults for anything unknown', () => {
    expect(view('')).toEqual({ whereParam: null, q: '', cat: '', sort: 'best' })
    expect(view('where=coming&q=%20lamp%20&cat=decor&sort=low')).toEqual({ whereParam: 'coming', q: 'lamp', cat: 'decor', sort: 'low' })
    expect(view('where=x&sort=y').sort).toBe('best')
  })

  it('shows the true shelf count and the coming pieces with nothing typed; empty categories are left out, mixed lots last', () => {
    const l = listing(stock, view(''), 35098)
    expect(l.counts).toEqual({ instore: 35098, coming: 4 }) // pieces: the two truck rows hold 1 + 3
    expect(l.chips.map((c) => c.id)).toEqual(['kitchen', 'decor', 'furniture', 'other'])
    expect(l.chips[0].n).toBe(2149)
    expect(l.rows).toHaveLength(73)
  })

  it('counts matching pieces (not product rows) for both lists when there is a search or a category', () => {
    const l = listing(stock, view('q=lamp'), 35098)
    expect(l.counts).toEqual({ instore: 53, coming: 0 }) // one row, 53 on the shelf
    expect(l.chips).toEqual([{ id: 'decor', name: 'Home décor & lighting', n: 53 }])
    const c = listing(stock, view('cat=furniture'), 35098)
    expect(c.counts).toEqual({ instore: 195, coming: 1 })
    expect(c.rows.map((r) => r.id)).toEqual(['p3'])
  })

  it('opens Coming when only the trucks match a search and no list was asked for', () => {
    expect(listing(stock, view('q=chandelier'), null).where).toBe('coming')
    expect(listing(stock, view('q=chandelier'), null).counts.coming).toBe(3)
    expect(listing(stock, view('where=instore&q=chandelier'), null).where).toBe('instore')
  })

  it('keeps the chosen chip even when it has no matches', () => {
    expect(listing(stock, view('cat=toys'), null).chips.map((c) => c.id)).toContain('toys')
  })

  it('says what is empty and what to clear', () => {
    expect(emptyState(stock, view('q=zebra'), 'instore')).toMatchObject({ button: 'Clear search', act: 'q' })
    expect(emptyState(stock, view('q=lamp&cat=kitchen'), 'instore')).toMatchObject({ line: 'None in Kitchen & dining.', act: 'cat' })
  })

  it('stays quick with 9,000 rows (a keystroke filters and sorts in memory)', () => {
    const big: InRaw[] = []
    for (let i = 0; i < 9000; i++) big.push([i, `Piece ${i} chair lamp table`.slice(0, 12 + (i % 15)), i % 4, 5 + (i % 300), 20 + (i % 700), 1, 1, ''])
    const s = parseStock({ ...RAW, instore: big })
    listing(s, view('q=ch'), null) // warm the search text
    const t = performance.now()
    for (const q of ['c', 'ch', 'cha', 'chai', 'chair']) listing(s, view(`q=${q}&sort=low`), null)
    const each = (performance.now() - t) / 5
    // eslint-disable-next-line no-console
    console.info(`listing over 9,000 rows: ${each.toFixed(1)} ms a keystroke`)
    expect(each).toBeLessThan(150)
  })

  it('always states the ThriftBucks, never with a dollar sign', () => {
    expect(bucksLine(2.98, 'normal')).toBe('+ 2.98 ThriftBucks')
    expect(bucksLine(2.98, 'bf')).toBe('2.98 ThriftBucks off')
    expect(bucksLine(0, 'normal')).toBe('0.00 ThriftBucks')
    expect(bucksLine(0, 'bf')).toBe('0.00 ThriftBucks')
  })
})

function Where() {
  const loc = useLocation()
  return <output data-testid="url">{loc.pathname + loc.search}</output>
}

function page(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/store" element={<Store />} />
        <Route path="/store/item/:id" element={<p>item</p>} />
      </Routes>
      <Where />
    </MemoryRouter>,
  )
}

describe('Store page', () => {
  beforeEach(() => {
    _setFeed({ shelf: { pieces: 35098, products: 73, categories: 5 }, day: 'normal' } as unknown as HomeFeed)
    _setStock(stock)
  })
  afterEach(() => {
    _setStock(null)
    _setFeed(null)
  })

  it('renders 30 rows, then 30 more', () => {
    const { container } = page('/store')
    expect(container.querySelectorAll('a.sh-r')).toHaveLength(30)
    fireEvent.click(screen.getByText('Show 30 more'))
    expect(container.querySelectorAll('a.sh-r')).toHaveLength(60)
    expect(screen.getAllByText('35,098')).toHaveLength(2) // the switch and the result line, in pieces
  })

  it('the result line counts pieces, in the same unit as the switch and the chips (Dash Update #185)', () => {
    const { container, unmount } = page('/store?cat=kitchen')
    expect(container.querySelector('.sh-n')?.textContent).toBe('2,149 items')
    expect(container.querySelector('.sh-chips [aria-pressed="true"] .cnt')?.textContent).toBe('2,149')
    unmount()
    const lamp = page('/store?q=lamp')
    expect(lamp.container.querySelector('.sh-n')?.textContent).toBe('53 items for “lamp”')
    expect(lamp.container.querySelector('.sh-sw [aria-pressed="true"] .cnt')?.textContent).toBe('53')
    lamp.unmount()
    expect(page('/store?q=planked').container.querySelector('.sh-n')?.textContent).toBe('1 item for “planked”')
  })

  it('a row states its ThriftBucks, the units, and opens its piece', () => {
    const { container } = page('/store?q=lamp')
    expect(container.querySelector('.sh-tb')?.textContent).toBe('0.00 ThriftBucks')
    expect(screen.getByText('x 53')).toBeInTheDocument()
    expect(container.querySelector('a.sh-r')?.getAttribute('href')).toBe('/store/item/p2')
  })

  it('a coming row shows its retail and "Priced on arrival", never a tag', () => {
    const { container } = page('/store?where=coming')
    expect(container.querySelector('.tag')).toBeNull()
    expect(screen.getByText('$482.98')).toBeInTheDocument()
    expect(screen.getAllByText(/on arrival/)).toHaveLength(2)
    expect(screen.getAllByText('Walmart truck')).toHaveLength(2)
    expect(screen.getByText('Not held. Priced when the truck lands.')).toBeInTheDocument()
  })

  it('the switch, chips and sort write the URL; Clear search empties the query', () => {
    page('/store?q=zebra')
    expect(screen.getByText('Nothing for “zebra”.')).toBeInTheDocument()
    fireEvent.click(screen.getByText('Clear search'))
    expect(screen.getByTestId('url').textContent).toBe('/store')
    fireEvent.click(screen.getByText('Low price'))
    expect(screen.getByTestId('url').textContent).toBe('/store?sort=low')
    fireEvent.click(screen.getByText(/^Furniture/))
    expect(screen.getByTestId('url').textContent).toBe('/store?sort=low&cat=furniture')
    fireEvent.click(screen.getByText(/^Coming/))
    expect(screen.getByTestId('url').textContent).toBe('/store?sort=low&cat=furniture&where=coming')
  })

  it('shows quiet rows while the stock is on its way', () => {
    act(() => _setStock(null))
    const { container } = page('/store')
    expect(container.querySelectorAll('.sh-r0')).toHaveLength(8)
    act(() => _setStock(stock))
    expect(container.querySelectorAll('.sh-r0')).toHaveLength(0)
    expect(container.querySelectorAll('a.sh-r')).toHaveLength(30)
  })
})
