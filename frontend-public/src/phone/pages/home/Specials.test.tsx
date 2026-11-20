/**
 * Home's first cards on a normal day (owner 2026-11-20, rulebook V11): "Don't shop without Thrift+" first (Join free
 * signed out, My Thrift+ for a member), the Black Friday teaser to Nov 27, BO-HO-GO to Dec 31, returns for members
 * only; never a count of what is in store. And no strip above the header on home.
 */
import { render, screen, waitFor } from '@testing-library/react'
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
  _setFeed({ day: 'normal', shelf: { pieces: 35522 } } as unknown as HomeFeed)
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
    expect(all[0]).toHaveTextContent('Please read')
    expect(all[0]).toHaveTextContent('Don’t shop without Thrift+')
    expect(all[0]).toHaveTextContent('Without it, you pay the full tag.')
    expect(all[0]).toHaveTextContent('Members collect ThriftBucks.')
    expect(all[0]).toHaveTextContent('Only members can return.')
    expect(all[0]).toHaveTextContent('Thrift+ members.Most items.Free to join.Nothing owed.')
    expect(all[0]).toHaveAttribute('href', '/scan?view=join')
    expect(all[0]).toHaveTextContent('Join free')
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

  it('a member: the first card opens My Thrift+', async () => {
    session = { status: 'member', member: { first_name: 'Ana', bucks_available: '35.00', bucks_use_by: '2026-12-19', ready: true } }
    const { container } = show()
    await waitFor(() => expect(cards(container)[0]).toHaveTextContent('My Thrift+'))
    expect(cards(container)[0]).toHaveAttribute('href', '/thriftplus')
  })

  it('home has no strip above the header', () => {
    const { container } = show('/')
    expect(container.querySelector('.strip')).toBeNull()
    expect(container.firstElementChild?.tagName).toBe('HEADER')
  })
})
