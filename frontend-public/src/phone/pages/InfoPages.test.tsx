// W3: Categories, About and Questions. Their logic (tile order, the hours line) and a render of each.
import { afterEach, describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { _setFeed, type HomeFeed } from '../lib/boot'
import { _setStock, CATS, parseStock } from '../lib/stock'
import About, { openRow } from './About'
import Categories, { orderCats } from './Categories'
import Questions, { hoursLine } from './Questions'
import { FAQ, POLICIES } from './words'

const FEED: HomeFeed = {
  v: 'x', as_of: '2026-11-19T12:00:00-06:00', day: 'normal',
  shelf: { pieces: 35071, products: 9000, categories: 23 },
  hours: { timezone: 'America/Chicago', open: '09:00', close: '18:00', closed_weekdays: [6], overrides: [] },
  thrift_plus_open: true, finds: [], coming: { trucks: [], items: [] }, top_cats: [],
}

afterEach(() => {
  _setStock(null)
  _setFeed(null)
})

describe('orderCats', () => {
  it('stands in the known order with no counts, "other" last', () => {
    const cats = orderCats(null)
    expect(cats).toHaveLength(23)
    expect(cats[0].id).toBe('apparel')
    expect(cats[22].id).toBe('other')
    expect(cats.every((c) => c.pieces === null)).toBe(true)
  })
  it('sorts by the live counts, biggest first, "other" last even when biggest', () => {
    const live = CATS.map((c, i) => ({ id: c.id, name: c.name, pieces: c.id === 'other' ? 99999 : i * 10 }))
    const cats = orderCats(live)
    expect(cats[0].id).toBe(CATS[21].id)
    expect(cats[22].id).toBe('other')
    expect(cats[21].pieces).toBe(0)
  })
})

describe('Questions logic', () => {
  it('writes the week as one line', () => {
    expect(hoursLine([['Monday to Saturday', '9 AM to 6 PM'], ['Sunday', 'Closed']])).toBe(
      'Monday to Saturday 9 AM to 6 PM · Sunday closed',
    )
  })
  it('keeps the two shortened answers and points each policy at its page', () => {
    expect(FAQ.find((f) => f.q.startsWith('Can you hold'))?.a).toBe('No. First come, first served.')
    expect(FAQ.find((f) => f.q.startsWith('When does'))?.a).toBe('Trucks arrive most weeks.')
    expect(POLICIES.map((p) => p.to)).toEqual(['/terms#s8', '/terms', '/privacy', '/terms#store-terms'])
  })
  it('shows every question and answer at rest, with no buttons and nothing hidden', () => {
    _setFeed(FEED)
    const { container } = render(
      <MemoryRouter>
        <Questions />
      </MemoryRouter>,
    )
    for (const f of FAQ) {
      expect(screen.getByText(f.q)).toBeTruthy()
      expect(screen.getByText(f.a)).toBeTruthy()
    }
    expect(container.querySelectorAll('button')).toHaveLength(0)
    expect(container.querySelectorAll('[hidden], [aria-expanded]')).toHaveLength(0)
    expect(screen.getByRole('heading', { name: 'Policies' })).toBeTruthy()
    const links = [...container.querySelectorAll('a.qa-pr')].map((a) => a.getAttribute('href'))
    expect(links).toEqual(['/terms#s8', '/terms', '/privacy', '/terms#store-terms'])
    expect(screen.getByText('(402) 881-9861')).toBeTruthy()
    expect(screen.getByText('Monday to Saturday 9 AM to 6 PM · Sunday closed')).toBeTruthy()
  })
})

describe('pages render', () => {
  it('Categories shows 23 tiles and the counts once the stock is here', () => {
    _setFeed(FEED)
    _setStock(
      parseStock({
        v: 's', as_of: FEED.as_of, trucks: [], instore: [], coming: [],
        cats: CATS.map((c, i) => ({ id: c.id, name: c.name, pieces: 1000 + i })),
      }),
    )
    const { container } = render(
      <MemoryRouter>
        <Categories />
      </MemoryRouter>,
    )
    const tiles = container.querySelectorAll('a.dp-t')
    expect(tiles).toHaveLength(23)
    expect(tiles[0].getAttribute('href')).toBe('/store?cat=auto')
    expect(tiles[22].getAttribute('href')).toBe('/store?cat=other')
    expect(screen.getByText('35,071')).toBeTruthy()
  })
  it('About shows the feed numbers and hours', () => {
    _setFeed(FEED)
    render(
      <MemoryRouter>
        <About />
      </MemoryRouter>,
    )
    expect(screen.getByText('35,071')).toBeTruthy()
    expect(screen.getByText('23')).toBeTruthy()
    expect(screen.getByText('9 AM to 6 PM')).toBeTruthy()
    expect(openRow([['Sunday', 'Closed']])).toEqual(['Monday to Saturday', '9 AM to 6 PM'])
  })
})
