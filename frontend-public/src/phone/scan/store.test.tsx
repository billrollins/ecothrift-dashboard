/**
 * The scanner's store (PLAN-SCANNER.md section 4, the react-query table) and the one member of the phone site: a
 * sign-in or sign-out anywhere changes the top bar at once; one session/ request feeds the top bar and the scanner; a
 * late answer never undoes a sign-in; a new person forgets the last one's QR and account. Real API, fake server.
 */
import { act, render, renderHook, screen, waitFor } from '@testing-library/react'
import { readFileSync } from 'fs'
import { join } from 'path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { _setFeed, type HomeFeed } from '../lib/boot'
import { fetchSession, useMember } from '../lib/member'
import { SAMPLE_CARDS, type FakeApi } from './test/fakeApi'
import { resetScanner } from './test/harness'
import { screenOf } from './route'
import { _resetScanStore, actions, getScanState, MY_CARD_KEY, useAction, useCart, useMe, useMyCard, useScanSession, useTestTags } from './store'
import { leaveGuest, scanIsRoute } from './switch'

let fake: FakeApi
const drill = SAMPLE_CARDS.get('TP0000001')!
const mixer = SAMPLE_CARDS.get('TP0000002')!

beforeEach(() => {
  fake = resetScanner()
})

afterEach(() => {
  vi.unstubAllGlobals()
  _setFeed(null)
})

function TopBarName() {
  const { status, member } = useMember()
  return <div data-testid="top">{status === 'member' ? `${member?.first} ${member?.bucks}` : status}</div>
}

describe('one member for the whole phone site', () => {
  it('a sign-in and a sign-out in the scanner change the top bar at once', async () => {
    render(<TopBarName />)
    await waitFor(() => expect(screen.getByTestId('top')).toHaveTextContent('out'))
    await act(async () => {
      await actions.signIn({ login: 'dana', password: 'secret' })
    })
    expect(screen.getByTestId('top')).toHaveTextContent('Dana 27.5')
    expect(document.documentElement.getAttribute('data-member')).toBe('yes')
    await act(async () => {
      await actions.signOut()
    })
    expect(screen.getByTestId('top')).toHaveTextContent('out')
    expect(document.documentElement.getAttribute('data-member')).toBe('no')
    // The next page (5 minutes in sessionStorage) knows it too.
    expect(JSON.parse(window.sessionStorage.getItem('eco.phone.member.v1')!).state.status).toBe('out')
  })

  it('the top bar asked first: the scanner opens on that answer with no second session/ request', async () => {
    fake.signIn('dana')
    render(<TopBarName />)
    await waitFor(() => expect(screen.getByTestId('top')).toHaveTextContent('Dana'))
    const { result } = renderHook(() => useScanSession())
    await waitFor(() => expect(result.current.session?.status).toBe('member'))
    expect(result.current.open).toBe(true)
    expect(fake.count('GET', 'session/')).toBe(1)
  })

  it('a late session/ answer cannot undo a sign-in', async () => {
    fake.setLatency(30)
    const late = fetchSession() // asked while signed out, slow to come back...
    fake.setLatency(0)
    await act(async () => {
      await actions.signIn({ login: 'dana', password: 'secret' }) // ...then signed in before it came back
    })
    await act(async () => {
      expect(await late).toBeNull() // overtaken: dropped
    })
    expect(getScanState().session?.status).toBe('member')
  })

  it("the top bar's Sign in leaves scanning without signing in first", async () => {
    await act(async () => {
      await actions.continueAsGuest()
    })
    expect(getScanState().session).toEqual({ status: 'guest' })
    act(() => leaveGuest())
    expect(getScanState().session).toEqual({ status: 'signed_out' })
    expect(window.localStorage.getItem('thriftPlus.real.guest')).toBeNull()
    expect(screenOf({ open: true, staff: false, reset: false, signingIn: false, session: getScanState().session, view: null, linkGuest: false, linkError: '' }).kind).toBe('signin')
  })

  it("links to /scan as a route only when the page's stamp says the new scanner is on", () => {
    expect(scanIsRoute()).toBe(false) // no stamp: a full page load (the server decides)
    _setFeed({ v: '1', scan: true } as unknown as HomeFeed)
    expect(scanIsRoute()).toBe(true)
    _setFeed({ v: '1' } as unknown as HomeFeed)
    expect(scanIsRoute()).toBe(false)
  })
})

describe('the store does what react-query did', () => {
  it('a new person forgets the last one: Member QR and account dropped, the phone copy removed, the trip reloaded', async () => {
    fake.signIn('dana')
    const cart = renderHook(() => useCart())
    const card = renderHook(() => useMyCard())
    const me = renderHook(() => useMe())
    renderHook(() => useScanSession())
    await waitFor(() => expect(card.result.current.data?.qr).toBe('TP402155831907'))
    await waitFor(() => expect(me.result.current.data?.banked).toBe('10.25'))
    expect(JSON.parse(window.localStorage.getItem(MY_CARD_KEY)!).display).toBe('4021 5583 1907')
    await act(async () => {
      await actions.addToCart(drill)
    })
    expect(cart.result.current.data?.totals.item_count).toBe(1)

    await act(async () => {
      await actions.signOut()
    })
    expect(window.localStorage.getItem(MY_CARD_KEY)).toBeNull()
    expect(getScanState().myCard.data).toBeUndefined()
    expect(getScanState().me.data).toBeUndefined()
    await waitFor(() => expect(cart.result.current.data?.totals.item_count).toBe(0)) // the phone's own (empty) trip
  })

  it('every trip change is the server answer; a failed add stays silent and changes nothing', async () => {
    fake.signIn('dana')
    renderHook(() => useScanSession())
    const cart = renderHook(() => useCart())
    await waitFor(() => expect(cart.result.current.data).toBeDefined())
    await act(async () => {
      await actions.addToCart(drill)
      await actions.setCartQty({ sku: drill.sku, qty: 3 })
    })
    expect(cart.result.current.data?.lines[0].qty).toBe(3)
    expect(cart.result.current.data).toEqual({ lines: fake.serverCart(), totals: { item_count: 3, price_total: '180.00', reward_total: '45.00' } })
    fake.failNext('POST', 'cart/add/', 500)
    const add = renderHook(() => useAction(actions.addToCart))
    await act(async () => {
      add.result.current.fire(mixer)
    })
    await waitFor(() => expect(add.result.current.error).toBeTruthy())
    expect(cart.result.current.data?.lines).toHaveLength(1)
  })

  it('Undo puts lines back one at a time, each answer building on the last', async () => {
    fake.signIn('dana')
    renderHook(() => useScanSession())
    const cart = renderHook(() => useCart())
    await waitFor(() => expect(cart.result.current.data).toBeDefined())
    await act(async () => {
      await actions.addToCart(drill)
      await actions.addToCart(mixer)
      await actions.setCartQty({ sku: mixer.sku, qty: 2 })
    })
    const before = [...cart.result.current.data!.lines].reverse()
    await act(async () => {
      await actions.clearCart()
    })
    expect(cart.result.current.data?.lines).toHaveLength(0)
    await act(async () => {
      await actions.restoreLines(before)
    })
    expect(cart.result.current.data?.totals.item_count).toBe(3)
    expect(fake.calls().filter((c) => c.path.startsWith('cart/')).map((c) => c.path).slice(-3)).toEqual(['cart/add/', 'cart/add/', 'cart/qty/'])
  })

  it('me reloads each time a screen opens, keeping the last data on screen meanwhile', async () => {
    fake.signIn('dana')
    const first = renderHook(() => useMe())
    await waitFor(() => expect(first.result.current.data?.banked).toBe('10.25'))
    first.unmount()
    fake.setMe({ banked: '12.00', credit: '0.00', can_change: true, people: [], money: [] })
    fake.setLatency(20)
    const again = renderHook(() => useMe())
    expect(again.result.current.data?.banked).toBe('10.25') // the last data, while it reloads
    await waitFor(() => expect(again.result.current.data?.banked).toBe('12.00'))
    expect(fake.count('GET', 'me/')).toBe(2)
  })

  it('a removal that answers signed_out ends the session', async () => {
    fake.signIn('dana')
    const s = renderHook(() => useScanSession())
    await waitFor(() => expect(s.result.current.session?.status).toBe('member'))
    await act(async () => {
      await actions.removePerson(7)
    })
    expect(s.result.current.session).toEqual({ status: 'signed_out' })
  })

  it('the Member QR shows at once from the phone, and is fetched again only when older than 60 seconds', async () => {
    fake.signIn('dana')
    const kept = { code: '1', display: '0000 0000 0001', qr: 'TP000000000001', first_name: 'Dana', ready: true }
    window.localStorage.setItem(MY_CARD_KEY, JSON.stringify(kept))
    _resetScanStore() // a fresh page: the store starts from the phone's copy
    const card = renderHook(() => useMyCard())
    expect(card.result.current.data).toEqual(kept) // no signal needed
    await waitFor(() => expect(card.result.current.data?.qr).toBe('TP402155831907'))
    card.unmount()
    renderHook(() => useMyCard())
    expect(fake.count('GET', 'me/card/')).toBe(1) // fresh: not asked again
  })

  it('tries cart/, me/ and me/card/ once more before giving up', async () => {
    fake.signIn('dana')
    fake.failNext('GET', 'me/', 500, {}, 1)
    fake.failNext('GET', 'me/card/', 500, {}, 2)
    const me = renderHook(() => useMe())
    const card = renderHook(() => useMyCard())
    await waitFor(() => expect(me.result.current.data?.banked).toBe('10.25'))
    await waitFor(() => expect(card.result.current.error).toBeTruthy())
    expect(fake.count('GET', 'me/')).toBe(2)
    expect(fake.count('GET', 'me/card/')).toBe(2)
  })

  it('an action sends once while pending (a double tap), and says pending', async () => {
    fake.setLatency(20)
    const send = renderHook(() => useAction(actions.sendCode))
    let a: Promise<unknown> | undefined
    let b: Promise<unknown> | undefined
    act(() => {
      a = send.result.current.run({ contact: '402-555-0100' })
    })
    expect(send.result.current.pending).toBe(true)
    act(() => {
      b = send.result.current.run({ contact: '402-555-0100' })
    })
    await act(async () => {
      await Promise.all([a, b])
    })
    expect(send.result.current.pending).toBe(false)
    expect(fake.count('POST', 'code/send/')).toBe(1)
  })

  it('fetches the test tags once, only in type-only mode', async () => {
    fake.signIn('dana')
    fake.setTestTags([{ sku: 'TP0000001', title: 'Cordless Drill Kit', price: '60.00', reward: '15.00' }])
    const off = renderHook(() => useTestTags(false))
    expect(off.result.current.data).toBeUndefined()
    const on = renderHook(() => useTestTags(true))
    await waitFor(() => expect(on.result.current.data).toHaveLength(1))
    renderHook(() => useTestTags(true))
    expect(fake.count('GET', 'test-tags/')).toBe(1)
  })
})

describe('the phone page installs the member app (installManifest.test.ts, for phone.html)', () => {
  it('carries the same manifest and iPhone tags as index.html', () => {
    const html = readFileSync(join(__dirname, '../../../phone.html'), 'utf8')
    expect(html).toMatch(/<link rel="manifest" href="\/scan\/manifest\.webmanifest"/)
    expect(html).toMatch(/<link rel="apple-touch-icon" href="\/scan\/icons\/apple-touch-icon\.png"/)
    expect(html).toMatch(/<meta name="apple-mobile-web-app-title" content="Thrift\+ Member"/)
    expect(html).toMatch(/<meta name="apple-mobile-web-app-capable" content="yes"/)
    expect(html).toMatch(/<meta name="mobile-web-app-capable" content="yes"/)
    expect(html.match(/rel="apple-touch-icon"/g)).toHaveLength(1)
  })
})
