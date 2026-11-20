/**
 * The top bar's account slot (Dash Update #185): signed out "Sign in"; a member with nothing left the ThriftBucks
 * balance; a member who has not finished joining (no mobile number yet, or the selfie and terms left) "Finish joining",
 * a link to /scan, in the same slot.
 */
import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { _setFeed, type HomeFeed } from '../lib/boot'
import { _resetMember } from '../lib/member'
import { headStays, TopBar } from './TopBar'

let session: unknown = { status: 'signed_out' }
const ANA = { first_name: 'Ana', bucks_available: '35.00', bucks_use_by: '2026-12-19', ready: true }

beforeEach(() => {
  sessionStorage.clear()
  session = { status: 'signed_out' }
  vi.stubGlobal('fetch', vi.fn((url: string) => {
    const body = url.startsWith('/api/thriftplus/public/session/') ? session : {}
    return Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { 'Content-Type': 'application/json' } }))
  }))
  // The stamped feed says /scan is the phone scanner (a route).
  _setFeed({ scan: true } as unknown as HomeFeed)
  _resetMember()
})

afterEach(() => {
  vi.unstubAllGlobals()
  _setFeed(null)
})

function show() {
  return render(
    <MemoryRouter initialEntries={['/store']}>
      <TopBar />
    </MemoryRouter>,
  )
}

describe('the account slot', () => {
  it('signed out: Sign in, to /scan', async () => {
    show()
    const link = await screen.findByRole('link', { name: 'Sign in' })
    expect(link).toHaveAttribute('href', '/scan')
  })

  it('a finished member: the ThriftBucks balance, to /thriftplus', async () => {
    session = { status: 'member', member: ANA }
    show()
    const link = await screen.findByRole('link', { name: 'Thrift+: 35.00 ThriftBucks' })
    expect(link).toHaveAttribute('href', '/thriftplus')
    expect(screen.queryByText('Finish')).not.toBeInTheDocument()
  })

  it('every balance is one size: 1,234.50 has no size of its own', async () => {
    session = { status: 'member', member: { ...ANA, bucks_available: '1234.50' } }
    show()
    const link = await screen.findByRole('link', { name: 'Thrift+: 1,234.50 ThriftBucks' })
    expect(link.querySelector('b')).toHaveClass('tn', { exact: true })
    expect(link.querySelector('b')).not.toHaveAttribute('style')
  })

  it('no mobile number yet: Finish joining, to /scan, in the same slot', async () => {
    session = { status: 'member', member: { ...ANA, bucks_available: '0.00', needs_phone: true } }
    show()
    const link = await screen.findByRole('link', { name: 'Finish joining Thrift+' })
    expect(link).toHaveAttribute('href', '/scan')
    expect(link).toHaveClass('acct')
    expect(link).toHaveTextContent('Finishjoining')
    expect(screen.queryByText('ThriftBucks')).not.toBeInTheDocument()
  })

  it('the selfie and terms left: Finish joining; waiting on the register only: the balance', async () => {
    session = { status: 'member', member: { ...ANA, bucks_available: '0.00', ready: false, finish_steps: ['selfie', 'sign'] } }
    const { unmount } = show()
    expect(await screen.findByRole('link', { name: 'Finish joining Thrift+' })).toBeInTheDocument()
    unmount()

    sessionStorage.clear()
    session = { status: 'member', member: { ...ANA, bucks_available: '0.00', ready: false, finish_steps: [] } }
    _resetMember()
    show()
    await waitFor(() => expect(screen.getByRole('link', { name: 'Thrift+: 0.00 ThriftBucks' })).toBeInTheDocument())
  })
})

describe('what stays on screen', () => {
  it('is decided once at load: a 740 px or taller window keeps the logo row, a shorter one lets it scroll', () => {
    expect(headStays(640)).toBe(false)
    expect(headStays(664)).toBe(false)
    expect(headStays(739)).toBe(false)
    expect(headStays(740)).toBe(true)
    expect(headStays(844)).toBe(true)
    expect(['stay', 'scroll']).toContain(document.documentElement.getAttribute('data-head'))
  })
})
