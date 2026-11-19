/**
 * Ported from frontend/src/api/thriftPlusScanner.api.test.ts, rewritten for fetch: the same calls, bodies, words and
 * stored keys as the live client (a phone moving between the old and the new scanner keeps everything).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { _resetMember, lastSessionAnswer } from '../lib/member'
import * as scanner from './api'

type Reply = { status?: number; body?: unknown; headers?: Record<string, string> } | 'offline'
type Seen = { method: string; url: string; body: unknown; headers: Record<string, string> }

let seen: Seen[] = []
let answer: (method: string, path: string, body: unknown) => Reply = () => ({ body: {} })

function stubFetch() {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const method = init.method || 'GET'
      const raw = init.body
      const body = typeof raw === 'string' ? JSON.parse(raw) : raw
      seen.push({ method, url, body, headers: (init.headers || {}) as Record<string, string> })
      const r = answer(method, url.replace('/api/thriftplus/public', '').split('?')[0], body)
      if (r === 'offline') throw new TypeError('Failed to fetch')
      return new Response(JSON.stringify(r.body ?? {}), { status: r.status ?? 200, headers: { 'Content-Type': 'application/json', ...(r.headers || {}) } })
    }),
  )
}

const posted = (path: string) => seen.filter((s) => s.method === 'POST' && s.url === `/api/thriftplus/public${path}`)
const last = () => seen.at(-1)!

const lamp = {
  sku: 'ITM1', title: 'Brass floor lamp', category: 'lighting' as const, category_label: 'Lighting', details: [],
  retail_price: null, price: '90.00', reward: '13.00', member_price: '77.00', age_restricted: false, returnable: true,
  available: true,
}

beforeEach(() => {
  window.localStorage.clear()
  window.sessionStorage.clear()
  seen = []
  answer = () => ({ body: {} })
  stubFetch()
  scanner._resetApi()
  _resetMember()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('the Thrift+ scanner client', () => {
  it('keeps a guest cart on the phone, with the ThriftBucks a member would collect (no cover, no instant figure)', async () => {
    answer = (m, p) => (p === '/session/' ? { body: { status: 'signed_out' } } : { body: {} })
    await scanner.continueAsGuest()
    expect((await scanner.getSession()).status).toBe('guest')
    const cart = await scanner.addToCart(lamp)
    expect(cart.lines).toHaveLength(1)
    expect(cart.totals).toEqual({ item_count: 1, price_total: '90.00', reward_total: '13.00' })
    expect(posted('/added/').map((s) => s.body)).toEqual([{ sku: 'ITM1' }])
    // The live keys, so a rollback to the old scanner sees the same trip and history.
    expect(JSON.parse(window.localStorage.getItem('thriftPlus.real.guest')!)).toBe(true)
    expect(JSON.parse(window.localStorage.getItem('thriftPlus.real.guestCart')!)[0].item.sku).toBe('ITM1')
    expect(JSON.parse(window.localStorage.getItem('thriftPlus.real.guestHistory')!)[0].decision).toBe('added')
  })

  it('asks the server for a member', async () => {
    answer = (m, p) => {
      if (p === '/session/') return { body: { status: 'member', member: { first_name: 'Ana' } } }
      if (p === '/cart/') return { body: { lines: [], totals: { item_count: 0, price_total: '0.00', reward_total: '0.00' } } }
      return { body: { status: 'found', item: lamp } }
    }
    await scanner.getSession()
    expect((await scanner.getCart()).totals.reward_total).toBe('0.00')
    expect(scanner).not.toHaveProperty('setRewardChoice') // redeeming instantly is at the register (B1)
    expect(await scanner.lookupTag('itm1')).toEqual({ status: 'found', item: lamp })
    expect(last()).toMatchObject({ method: 'GET', url: '/api/thriftplus/public/tag/ITM1/' })
    await scanner.lookupTag('itm1', { again: true })
    expect(last().url).toBe('/api/thriftplus/public/tag/ITM1/?again=1')
    // Cookies always go (the member session is an httpOnly cookie on /api/thriftplus/public/).
    expect(vi.mocked(fetch).mock.calls.every(([, init]) => (init as RequestInit).credentials === 'include')).toBe(true)
  })

  it('has no card sign-in, no lost-card call, and none of the calls no screen used', () => {
    for (const name of ['signInWithCard', 'reportCardLost', 'joinThriftPlus', 'requestSignInEmail', 'signInWithCode', 'getHistory',
      'clearHistory', 'fetchScannerSettings']) {
      expect(scanner).not.toHaveProperty(name)
    }
  })

  it('signs in with a texted or emailed link, and tells the whole site', async () => {
    answer = () => ({ body: { status: 'member', member: { first_name: 'Ana', ready: false, email_verified: true }, purpose: 'join' } })
    await scanner.continueAsGuest()
    const byLink = await scanner.signInWithLink('tok-1')
    expect(posted('/session/link/').map((s) => s.body)).toEqual([{ token: 'tok-1' }])
    expect(byLink).toMatchObject({ status: 'member', purpose: 'join', member: { first_name: 'Ana', ready: false } })
    expect(window.localStorage.getItem('thriftPlus.real.guest')).toBeNull() // signed in: no longer scanning without
    expect(lastSessionAnswer()).toMatchObject({ status: 200, body: { status: 'member', member: { first_name: 'Ana' } } })
  })

  it("carries the server's words and code, and a 429's wait", async () => {
    answer = () => ({ status: 400, body: { code: 'CODE_BAD', detail: "That code didn't work. Check it and try again." } })
    await expect(scanner.checkCode('a@b.co', '000000')).rejects.toMatchObject({ message: "That code didn't work. Check it and try again.", code: 'CODE_BAD' })
    answer = () => ({ status: 429, body: { code: 'TOO_SOON', detail: 'Too many tries. Wait a few minutes and try again.', retry_after: 22 } })
    await expect(scanner.sendCode('a@b.co')).rejects.toMatchObject({ code: 'TOO_SOON', retryAfter: 22 })
    answer = () => ({ status: 429, body: { code: 'TOO_SOON', detail: 'Wait.' }, headers: { 'Retry-After': '31' } })
    await expect(scanner.sendCode('a@b.co')).rejects.toMatchObject({ code: 'TOO_SOON', retryAfter: 31 })
    answer = () => ({ status: 400, body: { code: 'LINK_USED', detail: 'That link has already been used. Send a new one.' } })
    await expect(scanner.signInWithLink('old')).rejects.toMatchObject({ code: 'LINK_USED', message: 'That link has already been used. Send a new one.' })
    answer = () => ({ status: 500, body: {} })
    await expect(scanner.sendCode('a@b.co')).rejects.toThrow('Could not send the code. Try again.')
    answer = () => 'offline'
    await expect(scanner.signInWithLink('t')).rejects.toThrow('Could not reach the store. Check your signal and try again.')
  })
})

describe('Join v2 client (owner 2026-10-19)', () => {
  it("reads the ways in, and falls back to email only when the server can't say", async () => {
    answer = () => ({ body: { google_client_id: 'client-1', phone: true, email: true } })
    expect(await scanner.getSignInOptions()).toEqual({ google_client_id: 'client-1', phone: true, email: true })
    expect(last()).toMatchObject({ method: 'GET', url: '/api/thriftplus/public/sign-in-options/' })
    answer = () => ({ body: { google_client_id: '', phone: 'yes' } })
    expect(await scanner.getSignInOptions()).toEqual({ google_client_id: null, phone: false, email: true })
    answer = () => ({ status: 404, body: {} })
    expect(await scanner.getSignInOptions()).toEqual({ google_client_id: null, phone: false, email: true })
  })

  it('sends a code (names only for a join), checks it, signs in with Google, and posts the selfie and the signature', async () => {
    const member = { first_name: 'Ana', ready: false, finish_steps: ['selfie', 'sign'] }
    answer = (m, p) => {
      if (p === '/code/send/') return { body: { status: 'sent', channel: 'sms' } }
      if (p === '/me/selfie/' || p === '/me/signature/') return { body: { status: 'member', member } }
      return { body: { status: 'member', member, purpose: 'join' } }
    }
    expect(await scanner.sendCode(' 402 555 0123 ', ' Ana ', ' Diaz ')).toEqual({ status: 'sent', channel: 'sms' })
    expect(last().body).toEqual({ contact: '402 555 0123', first_name: 'Ana', last_name: 'Diaz' })
    await scanner.sendCode('ana@example.com')
    expect(last().body).toEqual({ contact: 'ana@example.com' })

    expect(await scanner.checkCode('ana@example.com', ' 123456 ')).toMatchObject({ purpose: 'join', member: { ready: false } })
    expect(last()).toMatchObject({ url: '/api/thriftplus/public/code/check/', body: { contact: 'ana@example.com', code: '123456' } })
    await scanner.signInWithGoogle('id-token')
    expect(last()).toMatchObject({ url: '/api/thriftplus/public/google/', body: { credential: 'id-token' } })

    expect(await scanner.uploadSelfie(new Blob(['jpg'], { type: 'image/jpeg' }))).toMatchObject({ first_name: 'Ana' })
    expect(last().url).toBe('/api/thriftplus/public/me/selfie/')
    expect(last().body).toBeInstanceOf(FormData)
    expect((last().body as FormData).get('photo')).toBeInstanceOf(Blob)
    expect(last().headers['Content-Type']).toBeUndefined() // the browser writes the multipart boundary
    await scanner.signTerms('2026-10-15')
    expect(last()).toMatchObject({ url: '/api/thriftplus/public/me/signature/', body: { agree: true, terms_version: '2026-10-15' } })
  })

  it("carries the server's words for a bad contact and a bad Google token", async () => {
    answer = () => ({ status: 400, body: { code: 'CONTACT_BAD', detail: 'Enter a US phone number or an email.' } })
    await expect(scanner.sendCode('nope')).rejects.toMatchObject({ code: 'CONTACT_BAD', message: 'Enter a US phone number or an email.' })
    answer = () => ({ status: 400, body: { code: 'GOOGLE_BAD' } })
    await expect(scanner.signInWithGoogle('x')).rejects.toMatchObject({ code: 'GOOGLE_BAD', message: "Google didn't sign you in. Try again, or use your email or phone." })
  })

  it("says the server's new answers in short, plain words, with a 429's wait", async () => {
    const words = async (call: () => Promise<unknown>, status: number, body: object) => {
      answer = () => ({ status, body })
      return call().then(() => '', (e: Error) => e.message)
    }
    const jpeg = new Blob(['x'], { type: 'image/jpeg' })
    expect(await words(() => scanner.signInWithGoogle('t'), 403, { code: 'MEMBERSHIP_OFF', detail: 'Account deactivated.' }))
      .toBe('This membership is not active. Ask at the register.')
    expect(await words(() => scanner.uploadSelfie(jpeg), 400, { code: 'NOT_PENDING' })).toBe('Your membership is already finished. Ask at the register to change it.')
    expect(await words(() => scanner.uploadSelfie(jpeg), 400, { code: 'PHOTO_NEEDED' })).toBe('Take your selfie first.')
    expect(await words(() => scanner.uploadSelfie(jpeg), 400, { code: 'PHOTO_BAD' })).toBe("That photo didn't work. Take your selfie again.")
    expect(await words(() => scanner.uploadSelfie(jpeg), 400, { code: 'PHOTO_TOO_BIG' })).toBe('That photo is too big. Take your selfie again.')
    expect(await words(() => scanner.signTerms('v'), 400, { code: 'NOT_PENDING' })).toBe('Your membership is already finished. Ask at the register to change it.')
    expect(await words(() => scanner.sendCode('a@b.co'), 429, { code: 'TOO_MANY', retry_after: 600 })).toBe('Too many codes. Try again in 10 minutes.')
    expect(await words(() => scanner.sendCode('a@b.co'), 429, { code: 'LOCKED', retry_after: 60 })).toBe('Too many tries. Try again in a minute.')
    expect(await words(() => scanner.checkCode('a@b.co', '123456'), 429, { code: 'LOCKED', retry_after: 900 })).toBe('Too many tries. Try again in 15 minutes.')
    answer = () => ({ status: 429, body: { code: 'LOCKED', retry_after: 900 } })
    await expect(scanner.checkCode('a@b.co', '123456')).rejects.toMatchObject({ code: 'LOCKED', retryAfter: 900 })
  })
})

describe('what the phone keeps (the live keys and rules)', () => {
  it('sends the staff preview code with every call, the session too', async () => {
    scanner.setPreviewCode('pv-7')
    expect(window.localStorage.getItem('thriftPlus.preview')).toBe('pv-7')
    await scanner.getSession()
    await scanner.lookupTag('TP1')
    expect(seen.map((s) => s.headers['X-ThriftPlus-Preview'])).toEqual(['pv-7', 'pv-7'])
    scanner.setPreviewCode(null)
    await scanner.lookupTag('TP1')
    expect(last().headers['X-ThriftPlus-Preview']).toBeUndefined()
  })

  it('reads the session and whether Thrift+ is open from ONE answer; offline counts as open', async () => {
    answer = () => ({ status: 403, body: { code: 'THRIFT_PLUS_OFF', detail: 'Thrift+ opens soon. Ask at the register.' } })
    expect(await scanner.readSession()).toEqual({ session: { status: 'signed_out' }, open: false })
    expect(seen).toHaveLength(1)
    answer = () => 'offline'
    window.localStorage.setItem('thriftPlus.real.guest', 'true')
    expect(await scanner.readSession()).toEqual({ session: { status: 'guest' }, open: true })
    expect(await scanner.isOpen()).toBe(true)
  })

  it('signs out even offline, and the trip and history on the phone go with it', async () => {
    await scanner.continueAsGuest()
    await scanner.addToCart(lamp)
    answer = () => 'offline'
    expect(await scanner.signOut()).toEqual({ status: 'signed_out' })
    for (const key of ['thriftPlus.real.guest', 'thriftPlus.real.guestCart', 'thriftPlus.real.guestHistory']) {
      expect(window.localStorage.getItem(key)).toBeNull()
    }
  })

  it('keeps quantities between 0 and 99, never throws on a look-up, and keeps at most 300 scans', async () => {
    answer = (m, p) => (p === '/session/' ? { body: { status: 'signed_out' } } : { body: {} })
    await scanner.continueAsGuest()
    await scanner.addToCart(lamp)
    expect((await scanner.setCartQty('ITM1', 250)).lines[0].qty).toBe(99)
    expect((await scanner.setCartQty('ITM1', -3)).lines).toHaveLength(0)
    answer = () => 'offline'
    expect(await scanner.lookupTag(' itm9 ')).toEqual({ status: 'error', sku: 'ITM9', message: 'Could not reach the store. Check your signal and scan again.' })
    const rows = Array.from({ length: 300 }, (_, i) => ({ item: { ...lamp, sku: `OLD${i}` }, scanned_at: '2026-11-01T00:00:00Z', decision: null }))
    window.localStorage.setItem('thriftPlus.real.guestHistory', JSON.stringify(rows))
    answer = () => ({ body: { status: 'found', item: { ...lamp, sku: 'NEW1' } } })
    await scanner.lookupTag('NEW1')
    const kept = JSON.parse(window.localStorage.getItem('thriftPlus.real.guestHistory')!)
    expect(kept).toHaveLength(300)
    expect(kept[0].item.sku).toBe('NEW1')
  })

  it('reads a trip the old scanner left on this phone, exactly as it wrote it', async () => {
    // The live client's shape (thriftPlusScanner.api.ts): lines of {item, qty, added_at}.
    window.localStorage.setItem('thriftPlus.real.guest', 'true')
    window.localStorage.setItem('thriftPlus.real.guestCart', JSON.stringify([{ item: lamp, qty: 2, added_at: '2026-11-18T10:00:00.000Z' }]))
    answer = () => ({ body: { status: 'signed_out' } })
    expect(await scanner.getSession()).toEqual({ status: 'guest' })
    expect((await scanner.getCart()).totals).toEqual({ item_count: 2, price_total: '180.00', reward_total: '26.00' })
  })
})
