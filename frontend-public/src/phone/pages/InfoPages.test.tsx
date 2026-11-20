// W3: Categories, About and Questions, the home's close and the menu. Their logic (tile order, the hours line) and a
// render of each.
import { afterEach, describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { _setFeed, type HomeFeed } from '../lib/boot'
import { _setStock, CATS, parseStock } from '../lib/stock'
import About from './About'
import Categories, { orderCats } from './Categories'
import Footer from './home/Footer'
import Menu from './Menu'
import Questions, { hoursLine } from './Questions'
import Returns from './Returns'
import { FAQ, INFO, POLICIES, RETURNS } from './words'

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
    expect(POLICIES.map((p) => p.to)).toEqual(['/returns', '/terms', '/privacy', ''])
  })
  it('has one ThriftBucks answer, one line that opens the example, and no returns question (returns live in Policies)', () => {
    const tb = FAQ.filter((f) => /ThriftBucks/.test(f.q))
    expect(tb).toHaveLength(1)
    expect(tb[0].example).toBe(true)
    expect(tb[0].a).toBe('What Thrift+ members collect on most items.')
    expect(FAQ.some((f) => /return/i.test(f.q))).toBe(false)
    expect(FAQ.map((f) => f.a).join(' ')).not.toMatch(/earn|discount|points|cash back|rewards|store credit|guest/i)
  })
  it('shows every question and answer at rest, nothing hidden; the one button opens the standard example', () => {
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
    const buttons = container.querySelectorAll('button')
    expect(buttons).toHaveLength(1)
    expect(buttons[0].textContent).toContain('See the example')
    expect(container.querySelectorAll('[hidden], [aria-expanded]')).toHaveLength(0)
    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.click(buttons[0])
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(screen.getByRole('dialog', { name: 'Example · A normal item' })).toHaveTextContent('Today this item has20 ThriftBucks')
    expect(screen.getByRole('heading', { name: 'Policies' })).toBeTruthy()
    const links = [...container.querySelectorAll('a.qa-pr')].map((a) => a.getAttribute('href'))
    expect(links).toEqual(['/returns', '/terms', '/privacy'])
    expect(screen.getByText('(402) 881-9861')).toBeTruthy()
    expect(screen.getByText('Monday to Saturday 9 AM to 6 PM · Sunday closed')).toBeTruthy()
    expect(screen.getByText('We text sign-in codes and links only.').closest('a')).toBeNull()
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
  it('About is three plain rows and the way onward: no counts, no pictures, no logo, no checking claims', () => {
    _setFeed(FEED)
    const { container } = render(
      <MemoryRouter>
        <About />
      </MemoryRouter>,
    )
    expect(container.querySelectorAll('.ab-f')).toHaveLength(3)
    expect(screen.getByText('Directions ›').closest('a')?.getAttribute('href')).toMatch(/^https:/)
    expect(screen.getByText('Monday to Saturday 9 AM to 6 PM · Sunday closed')).toBeTruthy()
    expect(container.textContent).not.toMatch(/well under retail/i)
    expect(container.querySelectorAll('img')).toHaveLength(0)
    expect(container.textContent).not.toMatch(/check|test|inspect|guarantee/i)
    const onward = [...container.querySelectorAll('a.info-t')].map((a) => a.getAttribute('href'))
    expect(onward).toEqual(['/questions', '/careers'])
  })
})

describe("the home's close and the menu", () => {
  it('the close is four tiles (About, Questions, Careers, Returns), Privacy, Thrift+ terms; no logo, no black slab', () => {
    const { container } = render(
      <MemoryRouter>
        <Footer />
      </MemoryRouter>,
    )
    const tiles = [...container.querySelectorAll('a.info-t')]
    expect(tiles.map((a) => a.querySelector('b')?.textContent)).toEqual(['About', 'Questions', 'Careers', 'Returns'])
    expect(tiles.map((a) => a.getAttribute('href'))).toEqual(['/about', '/questions', '/careers', '/returns'])
    expect(screen.getByText('3 days or AS IS')).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Privacy' }).getAttribute('href')).toBe('/privacy')
    expect(screen.getByRole('link', { name: 'Thrift+ terms' }).getAttribute('href')).toBe('/terms')
    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelectorAll('button, [aria-expanded], details')).toHaveLength(0)
  })
  it('Returns is the plain answer: three steps, 80% back, non-members AS IS, then the full policy', () => {
    const { container } = render(
      <MemoryRouter>
        <Returns />
      </MemoryRouter>,
    )
    expect(screen.getByRole('heading', { level: 1 }).textContent).toBe('3-day returns')
    expect(container.querySelectorAll('.rt-step')).toHaveLength(RETURNS.steps.length)
    expect(screen.getByText('80%')).toBeTruthy()
    expect(screen.getByText('Sold AS IS. All sales final.')).toBeTruthy()
    expect(container.querySelector('a.rt-full')?.getAttribute('href')).toBe('/terms#s8')
    expect(container.querySelectorAll('button, [aria-expanded], details')).toHaveLength(0)
  })
  it('the menu ends with the same title, names and places as the close', () => {
    _setFeed(FEED)
    const { container } = render(
      <MemoryRouter>
        <Menu />
      </MemoryRouter>,
    )
    expect(container.querySelector('.mn-lbl')?.textContent).toBe('Help and info')
    expect(screen.getByText('On the truck')).toBeTruthy()
    const rows = [...container.querySelectorAll('.mn-list a')].slice(-4)
    expect(rows.map((a) => a.firstChild?.textContent)).toEqual(INFO.map((i) => i.name))
    expect(rows.map((a) => a.getAttribute('href'))).toEqual(INFO.map((i) => i.to))
  })
})
