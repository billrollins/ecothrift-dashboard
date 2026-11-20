/**
 * /thriftplus, the member's own (piece S5). Ported from the live page test (ThriftPlusScannerPage.test.tsx :280, :324,
 * :359, :950, :981, :994, :1007) and memberTabs.test.tsx (3), rewritten for the coordinator's call 1: no tabs on
 * /scan; My QR, the ThriftBucks detail and Account are views of /thriftplus (`?show=qr|bucks|account`), with the same
 * words and the same behaviour. The real api.ts and store.ts run on the fake server; the other pieces are doubles
 * that keep the contracts, so these tests stay true while those pieces are built.
 */
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { _setFeed, type HomeFeed } from '../../lib/boot'
import { _resetMember, useMember } from '../../lib/member'
import { _resetApi } from '../api'
import ThriftPlus from '../../pages/ThriftPlus'
import type { TripListProps } from '../contracts'
import ScanApp from '../ScanApp'
import { handoverTo, showOfView } from '../route'
import { _resetScanStore, useCart } from '../store'
import { resetScanner, Where } from '../test/harness'
import type { FakeApi } from '../test/fakeApi'
import { CARD_TERMS, qrLine } from '.'

vi.mock('../core', async (orig) => ({ ...(await orig<typeof import('../core')>()), loadDetector: () => new Promise(() => undefined) }))
vi.mock('../signin', () => ({
  default: () => <div data-testid="signin"><button type="button">Send my code</button></div>,
  AddPhone: ({ firstName }: { firstName: string }) => <div data-testid="add-phone">{firstName}</div>,
}))
vi.mock('../finish', () => ({ TERMS_VERSION: '2026-11-18', default: () => <div data-testid="finish-joining" /> }))
vi.mock('../trip', () => ({
  default: () => <div data-testid="trip" />,
  TripList: function TripListDouble({ children }: TripListProps) {
    const cart = useCart()
    return (
      <div data-testid="trip-list">
        {(cart.data?.lines ?? []).map((l) => <div key={l.item.sku}>{l.item.title}</div>)}
        {children}
      </div>
    )
  },
}))
vi.mock('../camera', () => ({ TurnUpright: () => <div data-testid="turn-upright" /> }))

const IPHONE_SAFARI = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1'

const FEED = { v: '1', as_of: '', day: 'normal', scan: true } as unknown as HomeFeed

function TopBarState() {
  return <div data-testid="topbar">{useMember().status}</div>
}

function renderPage(path = '/thriftplus') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/thriftplus" element={<ThriftPlus />} />
        <Route path="/scan" element={<ScanApp />} />
        <Route path="/terms" element={<div data-testid="terms" />} />
      </Routes>
      <Where />
      <TopBarState />
    </MemoryRouter>,
  )
}

const API = '/api/thriftplus/public'
async function post(path: string, body: unknown) {
  await fetch(`${API}/${path}`, { method: 'POST', body: JSON.stringify(body) })
}

let fake: FakeApi
beforeEach(() => {
  fake = resetScanner()
  _setFeed(FEED)
  vi.stubGlobal('scrollTo', vi.fn())
})
afterEach(() => {
  _setFeed(null)
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('the old tabs are views of /thriftplus (memberTabs.test.tsx, call 1)', () => {
  it('the address picks the view: qr, card and join are My QR; bucks; account; finish and the rest are the scanner', () => {
    expect(['qr', 'card', 'join'].map(showOfView)).toEqual(['qr', 'qr', 'qr'])
    expect(showOfView('bucks')).toBe('bucks')
    expect(showOfView('account')).toBe('account')
    expect(showOfView('finish')).toBeNull() // Finish joining is a screen of the scanner, not a view here
    expect(showOfView(null)).toBeNull()
    expect(showOfView('whatever')).toBeNull()
    expect(['qr', 'bucks', 'account'].map((s) => handoverTo(s as 'qr'))).toEqual(['/thriftplus?show=qr', '/thriftplus?show=bucks', '/thriftplus?show=account'])
  })

  it('is for signed-in members only: signed out, and scanning without signing in, see what Thrift+ is', async () => {
    const out = renderPage('/thriftplus?show=account')
    const page = await screen.findByTestId('thriftplus-out')
    expect(within(page).getByRole('heading', { name: 'Collect ThriftBucks' })).toBeInTheDocument()
    expect(within(page).getByTestId('join-free')).toHaveAttribute('href', '/scan?view=join')
    expect(within(page).getByTestId('sign-in')).toHaveAttribute('href', '/scan')
    expect(page).toHaveTextContent('30days at full value')
    expect(page).toHaveTextContent('50%if you redeem the same day')
    expect(page).toHaveTextContent('3day returns, qualifying items')
    expect(page).not.toHaveTextContent('Most items.') // no fine print (owner 2026-11-20, rulebook V13)
    expect(screen.queryByTestId('account-page')).toBeNull()
    expect(screen.queryByTestId('thriftplus-trip')).toBeNull() // signed out with nothing scanned: it stands alone
    out.unmount()
  })

  it('a view replaces the page and Back comes back to it (never a box that opens in place)', async () => {
    fake.signIn('dana')
    const user = userEvent.setup()
    renderPage()
    await screen.findByTestId('thriftplus-member')
    for (const [go, id, search] of [['go-bucks', 'balance-screen', '?show=bucks'], ['go-account', 'account-page', '?show=account']] as const) {
      await user.click(screen.getByTestId(go))
      expect(await screen.findByTestId(id)).toBeInTheDocument()
      expect(screen.getByTestId('where')).toHaveTextContent(search)
      expect(screen.queryByTestId('thriftplus-member')).toBeNull() // one view at a time
      await user.click(screen.getByRole('button', { name: 'Thrift+' }))
      expect(await screen.findByTestId('thriftplus-member')).toBeInTheDocument()
      expect(screen.getByTestId('where')).toHaveTextContent(/^$/)
      expect(screen.getByTestId('nav-type')).toHaveTextContent('POP')
    }
  })
})

describe('My QR and the ThriftBucks detail (page test :280)', () => {
  it('the small QR opens it large: the code to type, the line and the terms line, and nothing else', async () => {
    fake.signIn('dana')
    const user = userEvent.setup()
    renderPage()
    const page = await screen.findByTestId('thriftplus-member')
    expect(within(page).getByText('Dana, you have')).toBeInTheDocument()
    expect(within(page).getByTestId('thriftplus-balance')).toHaveTextContent('27.50')
    await waitFor(() => expect(screen.getByTestId('my-card-qr-small').querySelector('svg')).not.toBeNull())
    await user.click(screen.getByRole('button', { name: 'Member QR: show it large' }))
    const wallet = await screen.findByTestId('wallet-screen')
    expect(screen.getByTestId('where')).toHaveTextContent('?show=qr')
    expect(within(wallet).getByTestId('my-card-code')).toHaveTextContent('4021 5583 1907')
    await waitFor(() => expect(within(wallet).getByTestId('my-card-qr').querySelector('svg')).not.toBeNull())
    expect(within(wallet).getByTestId('my-card')).toHaveTextContent('Show this at the register.')
    expect(within(wallet).getByTestId('my-card')).toHaveTextContent(CARD_TERMS)
    // The QR layer holds the QR and nothing else (D11).
    expect(within(wallet).queryByTestId('wallet-row')).toBeNull()
    expect(within(wallet).queryByRole('button', { name: 'Sign out' })).toBeNull()
    // Close: the phone's Back, since the tap opened it.
    await user.click(within(wallet).getByRole('button', { name: 'Close' }))
    await waitFor(() => expect(screen.queryByTestId('wallet-screen')).toBeNull())
    expect(screen.getByTestId('where')).toHaveTextContent(/^$/)
  })

  it('the balance: credit and ThriftBucks in the order used, and the terms line (Sign out is in Account)', async () => {
    fake.signIn('dana')
    renderPage('/thriftplus?show=bucks')
    const sheet = await screen.findByTestId('balance-screen')
    const rows = await within(sheet).findAllByTestId('wallet-row')
    expect(rows[0]).toHaveTextContent('Thrift+ credit')
    expect(rows[0]).toHaveTextContent('$8.56')
    expect(rows[1]).toHaveTextContent('use by Nov 1')
    expect(sheet).toHaveTextContent('ThriftBucks are Thrift+ rewards: use within 30 days of collecting. No cash value.')
    expect(within(sheet).queryByRole('button', { name: 'Sign out' })).toBeNull()
    expect(screen.queryByTestId('wallet-screen')).toBeNull()
  })

  it('the line says what is left, word for word as live', () => {
    const m = { first_name: 'Dana', email: '', username: null, card_last4: null, verified_18: false, banked_rewards: '0', credit_balance: '0' }
    const card = { code: '1', display: '1', qr: 'TP1', first_name: 'Dana', ready: true }
    expect(qrLine({ ...m, ready: false, finish_steps: ['selfie'] }, card)).toBe('Finish joining here in the app.')
    expect(qrLine({ ...m, ready: false, finish_steps: [] }, { ...card, ready: false })).toBe('Not finished yet. Ask at the register.')
    expect(qrLine(m, card)).toBe('Show this at the register.')
    expect(qrLine(m, undefined)).toBe('Show this at the register.')
  })

  it('shows at once from the phone, with no signal, and keeps the screen awake while it is on screen', async () => {
    fake.signIn('dana')
    const release = vi.fn().mockResolvedValue(undefined)
    const request = vi.fn().mockResolvedValue({ release })
    Object.defineProperty(navigator, 'wakeLock', { value: { request }, configurable: true })
    try {
      const first = renderPage('/thriftplus?show=qr')
      expect(await within(await screen.findByTestId('wallet-screen')).findByTestId('my-card-code')).toHaveTextContent('4021 5583 1907')
      expect(request).toHaveBeenCalledWith('screen')
      first.unmount()
      expect(release).toHaveBeenCalled()
      // Another visit with no signal: the code the phone kept (localStorage tp-my-card) shows at once.
      expect(JSON.parse(localStorage.getItem('tp-my-card') || '{}')).toMatchObject({ display: '4021 5583 1907' })
      fake.setOffline(true)
      renderPage('/thriftplus?show=qr')
      expect(await screen.findByTestId('my-card-code')).toHaveTextContent('4021 5583 1907')
    } finally {
      delete (navigator as { wakeLock?: unknown }).wakeLock
    }
  })

  it('a phone held sideways shows the QR alone', async () => {
    fake.signIn('dana')
    vi.stubGlobal('matchMedia', (q: string) => ({ matches: q.includes('coarse'), media: q, addEventListener: () => undefined, removeEventListener: () => undefined }))
    const w = Object.getOwnPropertyDescriptor(window.screen, 'width')
    Object.defineProperty(window.screen, 'width', { value: 844, configurable: true })
    Object.defineProperty(window.screen, 'height', { value: 390, configurable: true })
    ;(window as { orientation?: number }).orientation = 90
    try {
      renderPage()
      const side = await screen.findByTestId('sideways-qr')
      expect(await within(side).findByText('4021 5583 1907')).toBeInTheDocument()
      expect(side).toHaveTextContent('Show this at the register.')
    } finally {
      delete (window as { orientation?: number }).orientation
      delete (window.screen as { width?: number }).width
      delete (window.screen as { height?: number }).height
      if (w) Object.defineProperty(window.screen, 'width', w)
    }
  })

  it('on Black Friday the band says the ThriftBucks come off today', async () => {
    _setFeed({ ...FEED, day: 'bf' })
    fake.signIn('dana')
    renderPage()
    expect(await screen.findByTestId('thriftplus-use')).toHaveTextContent('They come off today, in full · Thrift+ members')
  })
})

describe('arriving from the old addresses (page test :324, :359)', () => {
  it('/scan?view=qr (ecothrift.us/qr) opens /thriftplus with the QR large; Close takes it off the address', async () => {
    fake.signIn('dana')
    const user = userEvent.setup()
    renderPage('/scan?view=qr')
    const wallet = await screen.findByTestId('wallet-screen')
    expect(screen.getByTestId('path')).toHaveTextContent('/thriftplus')
    expect(screen.getByTestId('where')).toHaveTextContent('?show=qr')
    expect(screen.getByRole('dialog', { name: 'Member QR' })).toBeInTheDocument()
    expect(await within(wallet).findByTestId('my-card-code')).toHaveTextContent('4021 5583 1907')
    await user.click(within(wallet).getByRole('button', { name: 'Close' }))
    await waitFor(() => expect(screen.queryByTestId('wallet-screen')).toBeNull())
    expect(screen.getByTestId('where')).toHaveTextContent(/^$/)
    expect(screen.getByTestId('nav-type')).toHaveTextContent('REPLACE')
  })

  it('on iPhone Safari Account has the home-screen card (the banner is the site\'s, not on the QR)', async () => {
    const ua = vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(IPHONE_SAFARI)
    fake.signIn('dana')
    renderPage('/scan?view=card')
    const wallet = await screen.findByTestId('wallet-screen')
    expect(within(wallet).queryByTestId('home-banner')).toBeNull()
    expect(within(wallet).queryByTestId('home-card')).toBeNull()
    ua.mockRestore()
  })

  it('shows no home-screen card where a phone cannot add it (a computer)', async () => {
    fake.signIn('dana')
    renderPage('/scan?view=account')
    expect(await screen.findByTestId('account-page')).toBeInTheDocument()
    expect(screen.getByTestId('where')).toHaveTextContent('?show=account')
    expect(screen.queryByTestId('home-card')).toBeNull()
  })

  it('/scan?view=account on iPhone Safari: Account carries the card', async () => {
    const ua = vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(IPHONE_SAFARI)
    fake.signIn('dana')
    renderPage('/scan?view=account')
    expect(await screen.findByTestId('home-card')).toHaveTextContent('Put Thrift+ on your home screen')
    ua.mockRestore()
  })
})

describe('Account (page test :1007) and who sees what (:994)', () => {
  it('your name, phone and photo with no retake ("Ask at the register"), and Sign out ends both sessions', async () => {
    fake.setMe({
      banked: '10.25', credit: '8.56', can_change: true, money: [], people: [],
      you: { name: 'Dana Rivera', phone: '4025550188', photo_url: 'https://photos.example/dana.jpg' },
    })
    fake.signIn('dana')
    localStorage.setItem('ecothrift.public_session.v1', '1')
    const user = userEvent.setup()
    renderPage('/thriftplus?show=account')
    const page = await screen.findByTestId('thriftplus-account')
    expect(within(page).getByRole('heading', { name: 'Account' })).toBeInTheDocument()
    expect(await within(page).findByTestId('account-name')).toHaveTextContent('Dana Rivera')
    expect(within(page).getByTestId('account-phone')).toHaveTextContent('(402) 555-0188')
    expect(within(page).getByTestId('account-photo')).toHaveAttribute('src', 'https://photos.example/dana.jpg')
    expect(within(page).getByTestId('account-photo-note')).toHaveTextContent('Ask at the register to change your photo.')
    expect(within(page).queryByRole('button', { name: /retake|photo|selfie/i })).toBeNull()
    expect(within(page).queryByTestId('selfie-input')).toBeNull()
    expect(screen.getByTestId('topbar')).toHaveTextContent('member')
    await user.click(within(page).getByRole('button', { name: 'Sign out' }))
    // Signed out: what Thrift+ is, the top bar at once, the website's session too (server side; its hint here).
    expect(await screen.findByTestId('thriftplus-out')).toBeInTheDocument()
    expect(screen.getByTestId('where')).toHaveTextContent(/^$/)
    expect(screen.getByTestId('topbar')).toHaveTextContent('out')
    expect(fake.count('POST', 'session/sign-out/')).toBe(1)
    expect(fake.isSignedIn()).toBe(false)
    expect(localStorage.getItem('ecothrift.public_session.v1')).toBeNull()
  })

  it('a phone scanning without signing in sees its trip under what Thrift+ is, and "Sign in" leaves that first', async () => {
    fake.guestOnThisPhone()
    localStorage.setItem('thriftPlus.real.guestCart', JSON.stringify([
      { item: { sku: 'TP0000001', title: 'Cordless Drill Kit', available: true }, qty: 1, added_at: '2026-11-19T10:00:00Z' },
    ]))
    renderPage()
    expect(await screen.findByTestId('thriftplus-out')).toBeInTheDocument()
    const trip = await screen.findByTestId('thriftplus-trip')
    expect(trip).toHaveTextContent('Cordless Drill Kit')
    expect(screen.queryByTestId('thriftplus-balance')).toBeNull()
    fireEvent.click(screen.getByTestId('sign-in'))
    expect(localStorage.getItem('thriftPlus.real.guest')).toBeNull()
  })

  it('My trip: "Scan a tag" when it is empty, the lines when it is not', async () => {
    fake.signIn('dana')
    const first = renderPage()
    const empty = await screen.findByTestId('trip-empty')
    expect(empty).toHaveTextContent('Nothing in your trip yet')
    expect(within(empty).getByRole('link', { name: 'Scan a tag' })).toHaveAttribute('href', '/scan')
    first.unmount()
    await post('cart/add/', { sku: 'TP0000002' })
    resetStoreOnly()
    renderPage()
    expect(await screen.findByText('KitchenAid stand mixer')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Scan more' })).toHaveAttribute('href', '/scan')
    expect(screen.queryByTestId('trip-empty')).toBeNull()
  })
})

describe('required steps go to the scanner, as live', () => {
  it('a member with no phone on file goes to Add your mobile number', async () => {
    fake.setRequirePhone(true)
    fake.signIn('dana')
    renderPage('/thriftplus?show=qr')
    expect(await screen.findByTestId('add-phone')).toBeInTheDocument()
    expect(screen.getByTestId('path')).toHaveTextContent('/scan')
    expect(screen.queryByTestId('wallet-screen')).toBeNull()
  })

  it('a member with steps left goes to Finish joining', async () => {
    await post('code/send/', { contact: 'robin@example.com', first_name: 'Robin', last_name: 'Lee' })
    await post('code/check/', { contact: 'robin@example.com', code: fake.lastCode() })
    renderPage('/thriftplus')
    expect(await screen.findByTestId('finish-joining')).toBeInTheDocument()
    expect(screen.getByTestId('where')).toHaveTextContent('?view=finish')
    expect(screen.queryByTestId('thriftplus-member')).toBeNull()
  })
})

/** The phone opens the page again: a fresh store and member (the server and the phone's storage stay). */
function resetStoreOnly() {
  act(() => {
    _resetApi()
    _resetMember()
    _resetScanStore()
  })
}
