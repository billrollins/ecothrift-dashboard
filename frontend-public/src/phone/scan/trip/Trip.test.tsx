/**
 * The trip scanner (piece S4), ported from the live ThriftPlusScannerPage.test.tsx (:141, :192, :232, :251, the about
 * half of :280, :399, :418, :443, :457, :1040, :1053, :1063) and TicketRain.test.ts, on the real store and API over the
 * fake server, plus the cases this rebuild decided (the fixed slot and buttons, `?tag=` while open, the gestures,
 * TripList on its own). The other pieces are stood in by small doubles that keep the contracts (contracts.ts): the
 * camera double has the live "Tag number" box, so a scan is typed as in the live tests.
 */
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { MemoryRouter, useNavigate } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { CameraHelpProps, CameraProps, SignInProps } from '../contracts'
import { renderScan, resetScanner, Where } from '../test/harness'
import type { FakeApi } from '../test/fakeApi'
import ScanApp from '../ScanApp'
import { TripList } from '.'
import { _resetUndo } from './TripList'
import { actions } from '../store'
import { SAMPLE_CARDS } from '../test/fakeApi'

// jsdom has no camera or WebAssembly decoder: the decoder never loads.
vi.mock('../core', async (orig) => ({ ...(await orig<typeof import('../core')>()), loadDetector: () => new Promise(() => undefined) }))

vi.mock('../camera', () => ({
  default: function CameraDouble({ camera, onCode, onHelp, typeOnly, underneath }: CameraProps) {
    const [text, setText] = useState('')
    return (
      <div data-testid="camera-card" data-under={underneath ? '1' : '0'} data-type-only={typeOnly ? '1' : '0'}>
        <video ref={camera.videoRef} playsInline muted data-testid="camera-video" />
        <form
          onSubmit={(e) => {
            e.preventDefault()
            onCode(text)
            setText('')
          }}
        >
          <label htmlFor="tag-box">Tag number</label>
          <input id="tag-box" value={text} onChange={(e) => setText(e.target.value)} />
        </form>
        <button type="button" onClick={onHelp}>Camera not working?</button>
      </div>
    )
  },
  CameraHelp: ({ onClose }: CameraHelpProps) => (
    <div role="dialog" aria-label="Camera not working?">
      <button type="button" onClick={onClose}>Close</button>
    </div>
  ),
  TurnUpright: () => <div data-testid="turn-upright" />,
  SidewaysScanPill: () => null,
  SidewaysGotIt: () => null,
}))
vi.mock('../signin', () => ({
  default: ({ start }: SignInProps) => <h1 data-testid="signin">{start === 'join' ? 'Join Thrift+' : 'Sign in'}</h1>,
  AddPhone: () => <div data-testid="add-phone" />,
}))
vi.mock('../member', () => ({ HomeScreenCard: () => null }))

let fake: FakeApi
type User = ReturnType<typeof userEvent.setup>

beforeEach(() => {
  fake = resetScanner()
  _resetUndo()
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

async function scan(user: User, code: string) {
  const box = await screen.findByLabelText('Tag number')
  fireEvent.change(box, { target: { value: code } })
  await user.type(box, '{Enter}')
}

/** A member on this phone (as "Staff sign in" leaves it), then the scanner. */
async function asMember(path = '/scan') {
  fake.signIn('dana')
  renderScan(path)
  await screen.findByTestId('trip-scanner')
}

/** Scanning without signing in on this phone, then the scanner. */
async function asNonMember(path = '/scan') {
  fake.guestOnThisPhone()
  renderScan(path)
  await screen.findByTestId('trip-scanner')
}

describe('Thrift+ trip scanner (owner 2026-10-13)', () => {
  it("opens a trip line's tag again from This trip, with Remove and Back to trip (owner 2026-10-15, APP D12)", async () => {
    const user = userEvent.setup()
    await asMember()
    await scan(user, 'TP0000001')
    await screen.findByText('Cordless Drill Kit')
    await user.click(screen.getByTestId('add'))
    await waitFor(() => expect(screen.getByTestId('trip-count')).toHaveTextContent('1'))
    await user.click(screen.getByTestId('trip-summary'))
    const trip = await screen.findByTestId('trip-view')
    expect(trip).toHaveTextContent('Tap an item to see its tag · − and + change how many · slide left to remove')

    // A tap on the line (not its − +): the tag, "1 in your trip", and the trip's own buttons.
    await user.click(within(trip).getByText('Cordless Drill Kit'))
    const card = await screen.findByTestId('scan-card')
    expect(within(card).getByText('Cordless Drill Kit')).toBeInTheDocument()
    expect(card).toHaveTextContent(/1 in your trip/)
    const actions = screen.getByTestId('actions')
    expect(within(actions).getByTestId('remove-line')).toHaveTextContent('Remove')
    expect(within(actions).getByTestId('back-to-trip')).toHaveTextContent('Back to trip')
    expect(within(actions).queryByTestId('add')).toBeNull()

    // Back to trip, then Escape does the same.
    await user.click(within(actions).getByTestId('back-to-trip'))
    expect(await screen.findByTestId('trip-view')).toBeInTheDocument()
    await user.click(within(screen.getByTestId('trip-view')).getByText('Cordless Drill Kit'))
    await screen.findByTestId('scan-card')
    await user.keyboard('{Escape}')
    expect(await screen.findByTestId('trip-view')).toBeInTheDocument()

    // − + are always shown and their taps are their own: never the tag.
    await user.click(within(screen.getByTestId('trip-view')).getByRole('button', { name: 'One more' }))
    expect(screen.queryByTestId('scan-card')).toBeNull()
    await waitFor(() => expect(within(screen.getByTestId('trip-view')).getByTestId('qty')).toHaveTextContent('2'))

    // Remove takes the whole line out, with Undo, and goes back to the trip.
    await user.click(within(screen.getByTestId('trip-view')).getByText('Cordless Drill Kit'))
    await screen.findByTestId('scan-card')
    await user.click(screen.getByTestId('remove-line'))
    await waitFor(() => expect(screen.getByTestId('trip-count')).toHaveTextContent('0'))
    expect(await screen.findByTestId('trip-view')).toBeInTheDocument()
    expect(screen.getByTestId('undo-toast')).toHaveTextContent('Removed Cordless Drill Kit')
    await user.click(within(screen.getByTestId('undo-toast')).getByRole('button', { name: 'Undo' }))
    await waitFor(() => expect(screen.getByTestId('trip-count')).toHaveTextContent('2'))
  })

  it('scans a tag, adds it from the bottom buttons, and flips to the trip from This trip', async () => {
    const user = userEvent.setup()
    await asMember()
    // Before the first scan: "Point at a tag", and Pass and Add in their places, not usable yet.
    expect(screen.getByTestId('scan-empty')).toHaveTextContent('Point at a tag')
    expect(screen.getByTestId('pass')).toBeDisabled()
    expect(screen.getByTestId('add')).toBeDisabled()
    expect(screen.getByTestId('trip-summary')).toHaveAccessibleName(/See the trip$/)

    await scan(user, 'TP0000001')
    const card = await screen.findByTestId('scan-card')
    expect(await within(card).findByText('Cordless Drill Kit')).toBeInTheDocument()
    expect(within(card).getByTestId('badge-returns')).toHaveTextContent('3-day returns')
    expect(within(card).getByText('$60.00')).toBeInTheDocument()
    expect(within(card).getByTestId('reward-band')).toHaveTextContent('+15.00ThriftBucks back')
    expect(within(card).getByTestId('reward-band')).toHaveTextContent('saved for your next visit')
    expect(within(screen.getByTestId('actions')).getByRole('button', { name: /Pass/ })).toBeEnabled()

    await user.click(screen.getByTestId('add'))
    await waitFor(() => expect(screen.queryByTestId('scan-card')).not.toBeInTheDocument())
    await waitFor(() => expect(screen.getByTestId('trip-count')).toHaveTextContent('1'))
    await waitFor(() => expect(screen.getByTestId('trip-summary')).toHaveTextContent('+15.00ThriftBucks back'))
    expect(fake.serverCart().map((l) => l.item.sku)).toEqual(['TP0000001'])

    // This trip flips to the lines; + adds one more.
    await user.click(screen.getByTestId('trip-summary'))
    const trip = await screen.findByTestId('trip-view')
    expect(screen.getByTestId('trip-summary')).toHaveAttribute('aria-expanded', 'true')
    expect(within(trip).getByText('Cordless Drill Kit')).toBeInTheDocument()
    await user.click(within(trip).getByRole('button', { name: 'One more' }))
    await waitFor(() => expect(within(trip).getByTestId('qty')).toHaveTextContent('2'))
    await waitFor(() => expect(screen.getByTestId('trip-summary')).toHaveTextContent('+30.00'))
    expect(screen.getByTestId('actions')).toHaveTextContent('Scan more')

    // Clear my trip, then Undo puts it back.
    await user.click(within(trip).getByTestId('clear-trip'))
    await waitFor(() => expect(screen.getByTestId('trip-count')).toHaveTextContent('0'))
    await user.click(within(screen.getByTestId('undo-toast')).getByRole('button', { name: 'Undo' }))
    await waitFor(() => expect(screen.getByTestId('trip-count')).toHaveTextContent('2'))

    await user.click(screen.getByTestId('scan-more'))
    expect(await screen.findByLabelText('Tag number')).toBeInTheDocument()
    expect(screen.queryByTestId('trip-view')).toBeNull()
  })

  it('marks AS IS, and a sold tag cannot be added', async () => {
    const user = userEvent.setup()
    await asMember()
    await scan(user, 'TP0000007')
    const shoes = await screen.findByTestId('scan-card')
    expect(await within(shoes).findByTestId('badge-as-is')).toHaveTextContent('AS IS · no returns')
    await user.click(within(shoes).getByTestId('badge-as-is'))
    expect(await screen.findByTestId('info-sheet')).toHaveTextContent("This item can't be returned.")
    await user.click(within(screen.getByTestId('info-sheet')).getByRole('button', { name: 'Close' }))
    await user.click(screen.getByTestId('pass'))
    await waitFor(() => expect(screen.queryByTestId('scan-card')).not.toBeInTheDocument())
    expect(fake.signals().at(-1)).toMatchObject({ kind: 'pass', sku: 'TP0000007' })

    await scan(user, 'TP0000008')
    const patio = await screen.findByTestId('scan-card')
    expect(await within(patio).findByText(/Sold/)).toBeInTheDocument()
    expect(screen.getByTestId('add')).toBeDisabled()
    expect(screen.getByTestId('add')).toHaveTextContent('Sold')
  })

  it('explains retail prices, and a price report ends in thanks with how we price', async () => {
    const user = userEvent.setup()
    await asNonMember()
    await scan(user, 'TP0000001')
    const card = await screen.findByTestId('scan-card')
    expect(await within(card).findByText('ThriftBucks for members')).toBeInTheDocument()
    expect(within(card).getByText('Free to join')).toBeInTheDocument() // joining starts in the app (APP D9)

    await user.click(within(card).getByTestId('retail'))
    expect(await screen.findByTestId('info-sheet')).toHaveTextContent('Retail prices come straight from the retailer')
    await user.click(within(screen.getByTestId('info-sheet')).getByRole('button', { name: 'Close' }))

    await user.click(within(card).getByTestId('price-feel'))
    const feel = await screen.findByTestId('feel-sheet')
    await user.click(within(feel).getByRole('button', { name: 'Price is too high' }))
    await user.click(within(feel).getByRole('button', { name: '$51' }))
    expect(await within(feel).findByText("Thanks, we'll review it")).toBeInTheDocument()
    expect(within(feel).getByText('How we price')).toBeInTheDocument()
    await waitFor(() => expect(fake.signals().at(-1)).toMatchObject({ kind: 'feel', sku: 'TP0000001', body: { reason: 'too_high', would_pay: '51.00' } }))
    await user.click(within(feel).getByTestId('feel-close'))
    expect(screen.getByTestId('scan-card')).toBeInTheDocument()

    // Pass from the keyboard (a laptop): the tag goes and the pass is counted.
    await user.keyboard('{ArrowLeft}')
    await waitFor(() => expect(screen.queryByTestId('scan-card')).not.toBeInTheDocument())
    await waitFor(() => expect(fake.signals().at(-1)).toMatchObject({ kind: 'pass', sku: 'TP0000001' }))
  })

  it('"What is Thrift+?" explains Thrift+ in the live words, with the full terms', async () => {
    const user = userEvent.setup()
    await asMember()
    await user.click(screen.getByTestId('about-thriftplus'))
    const about = await screen.findByTestId('thriftplus-sheet')
    expect(within(about).getByRole('dialog', { name: 'What is Thrift+?' })).toBeInTheDocument()
    expect(within(about).getByText('ThriftBucks, 3-day returns and more!')).toBeInTheDocument()
    // The standard example (rulebook V12), the same content as the home's Example window.
    expect(within(about).getByTestId('thriftbucks-example')).toHaveTextContent('Example · A normal item')
    expect(within(about).getByTestId('thriftbucks-example')).toHaveTextContent('$10 off today')
    expect(within(about).getByTestId('terms-link')).toHaveAttribute('href', 'https://ecothrift.us/terms')
    // "Non-member", never "guest" (owner 2026-10-15, APP D10).
    expect(about).toHaveTextContent('Non-members pay the tag. Everything a non-member buys is sold AS IS. All sales final.')
    await user.click(within(about).getByRole('button', { name: 'Close' }))
    expect(screen.queryByTestId('thriftplus-sheet')).toBeNull()
  })

  it('opens the camera help from the camera, and the right arrow adds', async () => {
    const user = userEvent.setup()
    await asMember()
    await user.click(screen.getByRole('button', { name: 'Camera not working?' }))
    expect(await screen.findByRole('dialog', { name: 'Camera not working?' })).toBeInTheDocument()
    await user.click(within(screen.getByRole('dialog', { name: 'Camera not working?' })).getByRole('button', { name: 'Close' }))
    await scan(user, 'TP0000002')
    await user.click(await screen.findByText('KitchenAid stand mixer')) // out of the tag box (its keys are its own)
    await user.keyboard('{ArrowRight}')
    await waitFor(() => expect(screen.getByTestId('trip-count')).toHaveTextContent('1'))
  })
})

describe('Every code gets an answer (owner 2026-10-15, APP D14 and D15)', () => {
  const onlyScanAgain = () => {
    const actions = screen.getByTestId('actions')
    expect(within(actions).getAllByRole('button')).toHaveLength(1)
    expect(within(actions).getByTestId('scan-again')).toHaveTextContent('Scan again')
    expect(within(actions).queryByTestId('pass')).toBeNull()
    expect(within(actions).queryByTestId('add')).toBeNull()
  }

  it('a product barcode: our green tag, "That\'s not our price tag", and Scan again', async () => {
    const user = userEvent.setup()
    await asMember()
    await scan(user, '0123456789012')
    const card = await screen.findByTestId('scan-card')
    const answer = within(card).getByTestId('answer-not-ours')
    expect(within(answer).getByRole('heading', { name: "That's not our price tag" })).toBeInTheDocument()
    expect(answer).toHaveTextContent('Look for our green tag and scan the QR code on it.')
    expect(within(answer).getByRole('img', { name: 'Our green price tag, with its QR code' })).toHaveAttribute('src', expect.stringContaining('our-green-tag'))
    expect(fake.calls().some((c) => c.path.startsWith('tag/'))).toBe(false) // a product barcode is never looked up
    onlyScanAgain()
    await user.click(screen.getByTestId('scan-again'))
    await waitFor(() => expect(screen.queryByTestId('scan-card')).toBeNull())
    expect(screen.getByTestId('scan-empty')).toBeInTheDocument()
  })

  it('our code, not found: "We can\'t find that item", sold as marked, no ThriftBucks, AS IS', async () => {
    fake.setTag('ITM0051377', null)
    const user = userEvent.setup()
    await asMember()
    await scan(user, 'ITM0051377')
    const answer = await screen.findByTestId('answer-not-found')
    expect(fake.calls().filter((c) => c.path.startsWith('tag/')).at(-1)?.path).toBe('tag/ITM0051377/')
    expect(within(answer).getByRole('heading', { name: "We can't find that item" })).toBeInTheDocument()
    // "AS IS" and "3-day" never break across lines.
    expect(within(answer).getByText("It's priced as marked, with no ThriftBucks. Sold AS IS, so no 3‑day returns.", { normalizer: (s) => s }))
      .toBeInTheDocument()
    expect(within(answer).getByTestId('badge-as-is')).toHaveTextContent('AS IS · no returns')
    expect(within(answer).getByTestId('no-thriftbucks')).toHaveTextContent('No ThriftBucks on this item')
    expect(within(answer).getByTestId('answer-code')).toHaveTextContent('ITM0051377')
    onlyScanAgain()
    // The AS IS badge works as built.
    await user.click(within(answer).getByTestId('badge-as-is'))
    expect(await screen.findByTestId('info-sheet')).toHaveTextContent("This item can't be returned.")
    await user.click(within(screen.getByTestId('info-sheet')).getByRole('button', { name: 'Close' }))
    await user.keyboard('{Escape}') // Escape is Scan again
    await waitFor(() => expect(screen.queryByTestId('scan-card')).toBeNull())
  })

  it('a short code we have no item for is not our tag; one we have is its tag', async () => {
    fake.setTag('ABC123', null)
    const user = userEvent.setup()
    await asNonMember()
    await scan(user, 'abc123')
    expect(await screen.findByTestId('answer-not-ours')).toBeInTheDocument()
    await user.click(screen.getByTestId('scan-again'))
    await scan(user, 'TP0000001')
    expect(await screen.findByText('Cordless Drill Kit')).toBeInTheDocument()
    expect(screen.getByTestId('pass')).toBeEnabled()
  })

  it('one of our links: "That QR code is a link", Open link in a new tab, and Scan again', async () => {
    const user = userEvent.setup()
    await asNonMember()
    await scan(user, 'https://ecothrift.us/terms')
    const answer = await screen.findByTestId('answer-link')
    expect(within(answer).getByRole('heading', { name: 'That QR code is a link' })).toBeInTheDocument()
    expect(answer).toHaveTextContent('It opens ecothrift.us/terms.To see a price, scan the QR code on our green tag.')
    expect(within(answer).getByText('ecothrift.us/terms').tagName).toBe('B')
    const actions = screen.getByTestId('actions')
    const open = within(actions).getByTestId('open-link')
    expect(open).toHaveTextContent('Open link')
    expect(open).toHaveAttribute('href', 'https://ecothrift.us/terms')
    expect(open).toHaveAttribute('target', '_blank')
    expect(open).toHaveAttribute('rel', 'noopener noreferrer')
    expect(within(actions).getByTestId('scan-again')).toHaveTextContent('Scan again')
    await user.click(within(actions).getByTestId('scan-again'))
    await waitFor(() => expect(screen.queryByTestId('answer-link')).toBeNull())

    // A link to any other site is not our tag, with no button to open it.
    await scan(user, 'https://example.com/menu')
    expect(await screen.findByTestId('answer-not-ours')).toBeInTheDocument()
    expect(screen.queryByTestId('open-link')).toBeNull()
  })

  it('no answer from the store: "No connection", and the tag can only be passed', async () => {
    const user = userEvent.setup()
    await asMember()
    fake.setOffline(true)
    await scan(user, 'TP0000001')
    expect(await screen.findByTestId('answer-offline')).toHaveTextContent('No connection')
    expect(screen.getByTestId('answer-offline')).toHaveTextContent('Could not reach the store. Check your signal and scan again.')
    expect(screen.getByTestId('add')).toBeDisabled()
    expect(screen.getByTestId('pass')).toBeEnabled()
  })
})

describe('a Thrift+ Perks tag QR link (ECOTHRIFT.US/I/<SKU> lands on /scan?tag=<SKU>, 2026-10-28)', () => {
  it('signed out: the item as a non-member, with Get Thrift+ (to Join), and the SKU off the address', async () => {
    const user = userEvent.setup()
    renderScan('/scan?tag=TP0000001')
    const card = await screen.findByTestId('scan-card')
    expect(await within(card).findByText('Cordless Drill Kit')).toBeInTheDocument()
    expect(await within(card).findByText('Free to join')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByTestId('where')).not.toHaveTextContent('tag='))
    await user.click(await screen.findByTestId('get-thrift-plus'))
    expect(await screen.findByRole('heading', { name: 'Join Thrift+' })).toBeInTheDocument()
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent('?view=join'))
  })

  it('a signed-in member: the item in the scanner, no Get Thrift+', async () => {
    fake.signIn('dana')
    renderScan('/scan?tag=TP0000001')
    const card = await screen.findByTestId('scan-card')
    expect(await within(card).findByText('Cordless Drill Kit')).toBeInTheDocument()
    expect(await screen.findByTestId('add')).toBeEnabled()
    expect(within(card).queryByText('Free to join')).toBeNull()
    expect(screen.queryByTestId('get-thrift-plus')).toBeNull()
  })

  it('a scanned tag link in the camera box opens that tag (any case, with or without https://)', async () => {
    const user = userEvent.setup()
    await asNonMember()
    await scan(user, 'ecothrift.us/i/tp0000002')
    const card = await screen.findByTestId('scan-card')
    expect(await within(card).findByText('KitchenAid stand mixer')).toBeInTheDocument()
    expect(screen.queryByTestId('get-thrift-plus')).toBeNull() // only on a tag the link itself opened
  })

  it('a ?tag= that arrives while the scanner is open (the top bar search on /scan) opens too, over a tag already up', async () => {
    fake.signIn('dana')
    let go: (to: string) => void = () => undefined
    function TopBarSearch() {
      const nav = useNavigate()
      go = nav
      return null
    }
    render(
      <MemoryRouter initialEntries={['/scan']}>
        <ScanApp />
        <TopBarSearch />
        <Where />
      </MemoryRouter>,
    )
    await screen.findByTestId('trip-scanner')
    act(() => go('/scan?tag=TP0000003'))
    expect(await screen.findByText('Mid-century accent chair')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent(/^$/))
    // Another one while that tag is still up: it takes the slot.
    act(() => go('/scan?tag=TP0000005'))
    expect(await screen.findByText('LEGO Classic brick box')).toBeInTheDocument()
    expect(screen.queryByText('Mid-century accent chair')).toBeNull()
    await waitFor(() => expect(screen.getByTestId('where')).toHaveTextContent(/^$/))
  })
})

describe('the fixed slot and the gestures (rebuild decisions)', () => {
  it('keeps the slot and the two button places on every screen; the trip opens over the camera, which stays mounted', async () => {
    const user = userEvent.setup()
    await asMember()
    const places = () => screen.getByTestId('actions').children.length
    const video = screen.getByTestId('camera-video')
    expect(places()).toBe(2)
    await scan(user, '0123456789012')
    await screen.findByTestId('answer-not-ours')
    expect(places()).toBe(2) // Scan again, and an empty place where Add was
    await user.click(screen.getByTestId('scan-again'))
    await scan(user, 'TP0000001')
    await screen.findByText('Cordless Drill Kit')
    expect(places()).toBe(2)
    expect(screen.getByTestId('camera-card')).toHaveAttribute('data-under', '1')
    await user.click(screen.getByTestId('pass'))
    await user.click(screen.getByTestId('trip-summary'))
    await screen.findByTestId('trip-view')
    expect(places()).toBe(1) // Scan more fills both places
    expect(screen.getByTestId('camera-video')).toBe(video) // never unmounted, never hidden
  })

  it('a tag swipes right into the trip and left to pass', async () => {
    const user = userEvent.setup()
    await asMember()
    const swipe = (dx: number) => {
      const el = screen.getByTestId('scan-card')
      fireEvent.pointerDown(el, { pointerId: 1, clientX: 150, clientY: 100 })
      fireEvent.pointerMove(el, { pointerId: 1, clientX: 150 + dx / 2, clientY: 100 })
      fireEvent.pointerMove(el, { pointerId: 1, clientX: 150 + dx, clientY: 100 })
      fireEvent.pointerUp(el, { pointerId: 1, clientX: 150 + dx, clientY: 100 })
    }
    await scan(user, 'TP0000001')
    await screen.findByText('Cordless Drill Kit')
    swipe(160)
    await waitFor(() => expect(screen.queryByTestId('scan-card')).toBeNull())
    await waitFor(() => expect(screen.getByTestId('trip-count')).toHaveTextContent('1'))

    await scan(user, 'TP0000002')
    await screen.findByText('KitchenAid stand mixer')
    swipe(-160)
    await waitFor(() => expect(screen.queryByTestId('scan-card')).toBeNull())
    await waitFor(() => expect(fake.signals().at(-1)).toMatchObject({ kind: 'pass', sku: 'TP0000002' }))
    expect(screen.getByTestId('trip-count')).toHaveTextContent('1')

    // A short drag is nothing: the tag stays.
    await scan(user, 'TP0000003')
    await screen.findByText('Mid-century accent chair')
    swipe(30)
    await new Promise((r) => setTimeout(r, 200))
    expect(screen.getByTestId('scan-card')).toBeInTheDocument()
  })

  it('a trip line slides left to remove it, with Undo', async () => {
    const user = userEvent.setup()
    await asMember()
    await scan(user, 'TP0000004')
    await screen.findByText('Samsung 50 in 4K TV')
    await user.click(screen.getByTestId('add'))
    await waitFor(() => expect(screen.getByTestId('trip-count')).toHaveTextContent('1'))
    await user.click(screen.getByTestId('trip-summary'))
    const row = within(await screen.findByTestId('trip-view')).getByText('Samsung 50 in 4K TV').closest('.tr-line-in') as HTMLElement
    fireEvent.pointerDown(row, { pointerId: 2, clientX: 250, clientY: 50 })
    fireEvent.pointerMove(row, { pointerId: 2, clientX: 150, clientY: 50 })
    fireEvent.pointerMove(row, { pointerId: 2, clientX: 60, clientY: 50 })
    fireEvent.pointerUp(row, { pointerId: 2, clientX: 60, clientY: 50 })
    await waitFor(() => expect(screen.getByTestId('trip-count')).toHaveTextContent('0'))
    expect(screen.getByTestId('undo-toast')).toHaveTextContent('Removed Samsung 50 in 4K TV')
    expect(screen.queryByTestId('scan-card')).toBeNull() // a slide is not a tap
  })

  it('the ThriftBucks land at once: no count-up, no tickets left behind (TicketRain.test.ts)', async () => {
    const user = userEvent.setup()
    await asMember()
    await scan(user, 'TP0000002')
    const card = await screen.findByTestId('scan-card')
    expect(within(card).getByTestId('reward-band')).toHaveTextContent('+32.40') // no roll from 0
    await user.click(screen.getByTestId('add'))
    await waitFor(() => expect(screen.getByTestId('trip-summary')).toHaveTextContent('+32.40ThriftBucks back'))
    expect(document.querySelectorAll('[data-tp-ticket]')).toHaveLength(0)
  })

  it('a non-member trip stays on the phone, and says ThriftBucks for members', async () => {
    const user = userEvent.setup()
    await asNonMember()
    await scan(user, 'TP0000005')
    await screen.findByText('LEGO Classic brick box')
    await user.click(screen.getByTestId('add'))
    await waitFor(() => expect(screen.getByTestId('trip-count')).toHaveTextContent('1'))
    expect(screen.getByTestId('trip-summary')).toHaveTextContent('+3.60ThriftBucks for members')
    expect(JSON.parse(window.localStorage.getItem('thriftPlus.real.guestCart') ?? '[]')).toHaveLength(1)
    expect(fake.count('POST', 'cart/add/')).toBe(0)
    await waitFor(() => expect(fake.signals().some((s) => s.kind === 'added' && s.sku === 'TP0000005')).toBe(true))
  })
})

describe('TripList (the "My trip" section of /thriftplus)', () => {
  it('empty: the live words, then what the page puts under them; no totals band', async () => {
    fake.signIn('dana')
    renderScan('/scan', <TripList><a href="/scan">Scan a tag</a></TripList>)
    expect(await screen.findByText('Nothing in your trip yet')).toBeInTheDocument()
    expect(screen.getByText('Scan a tag to see its price and the ThriftBucks it gives back.')).toBeInTheDocument()
    expect(screen.getByText('Scan a tag')).toBeInTheDocument()
    expect(screen.queryByTestId('trip-band')).toBeNull()
  })

  it('the lines with their ThriftBucks and the totals band (ThriftBucks only), − + and Undo', async () => {
    fake.signIn('dana')
    await actions.addToCart(SAMPLE_CARDS.get('TP0000001')!)
    await actions.addToCart(SAMPLE_CARDS.get('TP0000007')!)
    const user = userEvent.setup()
    renderScan('/scan', <TripList />)
    const band = await screen.findByTestId('trip-band')
    expect(band).toHaveTextContent('This trip · 2 items')
    expect(band).toHaveTextContent('+19.00ThriftBucks back')
    expect(band).not.toHaveTextContent('$')
    const rows = screen.getAllByTestId('swipe-row')
    expect(rows[0]).toHaveTextContent('Nike running shoes, men 10') // newest first
    expect(rows[0]).toHaveTextContent('+ 4.00 ThriftBucks')
    expect(rows[0]).toHaveTextContent('AS IS')
    // No tag to open here: the hint leaves the tap out, and a tap opens nothing.
    expect(screen.getByText('− and + change how many · slide left to remove')).toBeInTheDocument()
    await user.click(within(rows[1]).getByRole('button', { name: 'One more' }))
    await waitFor(() => expect(screen.getByTestId('trip-band')).toHaveTextContent('3 items'))
    expect(screen.getAllByTestId('swipe-row')[1]).toHaveTextContent('each')
    await user.click(within(screen.getAllByTestId('swipe-row')[0]).getByRole('button', { name: 'Remove' }))
    await waitFor(() => expect(screen.getAllByTestId('swipe-row')).toHaveLength(1))
    await user.click(within(screen.getByTestId('undo-toast')).getByRole('button', { name: 'Undo' }))
    await waitFor(() => expect(screen.getAllByTestId('swipe-row')).toHaveLength(2))
    expect(fake.serverCart().map((l) => [l.item.sku, l.qty])).toEqual(expect.arrayContaining([['TP0000001', 2], ['TP0000007', 1]]))
  })
})
