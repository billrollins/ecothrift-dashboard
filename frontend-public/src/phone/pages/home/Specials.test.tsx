/**
 * Home's first cards on a normal day (owner 2026-11-20, rulebook V11 and V12): "No Thrift+? You're paying way too much."
 * first, proved by today's floor (home.json `bucks`), Join free (My Thrift+ for a member) and Example (the standard
 * ThriftBucks example in a window); then the Black Friday teaser to Nov 27, BO-HO-GO to Dec 31, returns for members
 * only; never a count of what is in store and no fine print on the card. And no strip above the header on home.
 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { _setFeed, type HomeFeed } from '../../lib/boot'
import { _resetMember } from '../../lib/member'
import { TopBar } from '../../shell/TopBar'
import Specials from './Specials'

let session: unknown = { status: 'signed_out' }

beforeEach(() => {
  sessionStorage.clear()
  session = { status: 'signed_out' }
  vi.stubGlobal('fetch', vi.fn((url: string) => {
    const body = url.startsWith('/api/thriftplus/public/session/') ? session : {}
    return Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } }))
  }))
  _setFeed({ day: 'normal', shelf: { pieces: 35522 }, bucks: { share: 94, typical: 42 } } as unknown as HomeFeed)
  _resetMember()
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  _setFeed(null)
})

function show(path = '/') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <TopBar />
      <Specials />
    </MemoryRouter>,
  )
}

function cards(container: HTMLElement) {
  return Array.from(container.querySelectorAll('.rail > .hc'))
}

describe('home specials, a normal day', () => {
  it('before Black Friday: Thrift+ first, then Black Friday, BO-HO-GO (starts Nov 27), returns; no count', () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-11-21T18:00:00Z'))
    const { container } = show()
    const all = cards(container)
    expect(all).toHaveLength(4)
    expect(all[0]).toHaveTextContent('No Thrift+?You’re payingway too much.')
    expect(all[0]).toHaveTextContent('ThriftBucks on 94% of our items')
    expect(all[0]).toHaveTextContent('Typically 42% of the tag')
    expect(all[0]).toHaveTextContent('3-day returns for members')
    expect(within(all[0] as HTMLElement).getByRole('link', { name: 'Join free' })).toHaveAttribute('href', '/scan?view=join')
    expect(all[0].querySelector('.fine')).toBeNull()
    expect(all[1]).toHaveTextContent('Black Friday')
    expect(all[2]).toHaveTextContent('Starts Fri Nov 27')
    expect(all[2]).toHaveTextContent('BO-HO-GO')
    expect(all[3]).toHaveTextContent('3-day returnsThrift+ members only')
    expect(container).not.toHaveTextContent(/pieces|35,522/i)
    expect(container.querySelector('.hc-dots')?.children).toHaveLength(4)
  })

  it('after Black Friday: no teaser, BO-HO-GO runs through Dec 31; after Dec 31 it is gone', () => {
    vi.useFakeTimers({ toFake: ['Date'] })
    vi.setSystemTime(new Date('2026-12-05T18:00:00Z'))
    const dec = show()
    expect(cards(dec.container)).toHaveLength(3)
    expect(cards(dec.container)[1]).toHaveTextContent('Through Dec 31')
    dec.unmount()
    vi.setSystemTime(new Date('2027-01-02T18:00:00Z'))
    const jan = show()
    expect(cards(jan.container)).toHaveLength(2)
    expect(jan.container).not.toHaveTextContent('BO-HO-GO')
  })

  it('a member: the button opens My Thrift+', async () => {
    session = { status: 'member', member: { first_name: 'Ana', bucks_available: '35.00', bucks_use_by: '2026-12-19', ready: true } }
    const { container } = show()
    const link = await waitFor(() => within(cards(container)[0] as HTMLElement).getByRole('link', { name: 'My Thrift+' }))
    expect(link).toHaveAttribute('href', '/thriftplus')
  })

  it('without the floor numbers the proof lines still read (no blank, same three lines)', () => {
    _setFeed({ day: 'normal', shelf: { pieces: 1 } } as unknown as HomeFeed)
    const { container } = show()
    const first = cards(container)[0]
    expect(first).toHaveTextContent('ThriftBucks on most of our items')
    expect(first.querySelectorAll('.hc-ok li')).toHaveLength(3)
  })

  it('Example opens the standard example in a window; ×, a tap outside and Escape close it', () => {
    show()
    fireEvent.click(screen.getByRole('button', { name: 'Example' }))
    const box = screen.getByRole('dialog', { name: 'Example · A normal item' })
    expect(box.querySelector('.tbx-item .tag-was')).toHaveTextContent('$20000') // retail $200.00, a struck ghost tag
    expect(box.querySelector('.tbx-item .tag:not(.tag-was)')).toHaveTextContent('$10000') // our tag $100.00, cents shown
    // Owner 11-20 (round 8 screens): the opening on one easy line; ".00" only at the top, whole numbers below.
    expect(box).toHaveTextContent('ThriftBucks start after 7 days.')
    expect(box.querySelector('.tbx-rise')).toHaveTextContent('They grow every day.')
    expect(box).toHaveTextContent('This one carries today:20 ThriftBucksKeep them')
    // The growth strip shows the sentence: 7 days with none, then bars that grow to today's (no day number on it).
    const bars = Array.from(box.querySelectorAll('.tbx-bars i'))
    expect(bars.slice(0, 7).every((b) => b.classList.contains('w'))).toBe(true)
    expect(bars.slice(7).some((b) => b.classList.contains('w'))).toBe(false)
    expect(bars.at(-1)).toHaveClass('now')
    expect(box.querySelector('.tbx-bars')).not.toHaveTextContent(/\d{2}|day \d|20\.00/i)
    expect(box).toHaveTextContent('Keep themPay $100today20 ThriftBucksoff next visitFull value')
    expect(box).toHaveTextContent('Use themPay $90$10 off todayNo ThriftBucksoff next visitHalf value')
    expect(box).toHaveTextContent('Non-member: pays $100. All sales final.')
    expect(box).not.toHaveTextContent(/\$\s*20\b|earn|discount|points|cash back|reward|guest/i)
    // Never a "$" next to ThriftBucks (the owner's "$10 off today" is dollars off today's price, on its own).
    box.querySelectorAll('.tbx-now b, .tbx-two div:first-child strong').forEach((el) => expect(el.textContent).toMatch(/^\d+ ThriftBucks$/))
    expect(within(box).getByRole('link', { name: 'Join Thrift+ free' })).toHaveAttribute('href', '/scan?view=join')
    fireEvent.click(within(box).getByRole('button', { name: 'Close' }))
    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Example' }))
    fireEvent.click(document.querySelector('.tbx-back') as HTMLElement)
    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Example' }))
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('home has no strip above the header', () => {
    const { container } = show('/')
    expect(container.querySelector('.strip')).toBeNull()
    expect(container.firstElementChild?.tagName).toBe('HEADER')
  })
})
