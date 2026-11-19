/**
 * The scanner shell (piece S0): the live page test's shell cases (ThriftPlusScannerPage.test.tsx :184, :874, :883, :891,
 * :902, :916, :939), on the real store and API over the fake server. The later pieces are stood in by small doubles that
 * keep the contracts (contracts.ts), so these tests stay true while each piece replaces its stub.
 */
import { act, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useSearchParams } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FinishProps, SignInProps, TripProps } from './contracts'
import { actions } from './store'
import { renderScan, resetScanner } from './test/harness'
import type { FakeApi } from './test/fakeApi'

// jsdom has no camera or WebAssembly decoder: the decoder never loads.
vi.mock('./core', async (orig) => ({ ...(await orig<typeof import('./core')>()), loadDetector: () => new Promise(() => undefined) }))

vi.mock('./signin', () => ({
  default: function SignInDouble({ start, notice }: SignInProps) {
    const [params, setParams] = useSearchParams()
    return (
      <div data-testid="signin" data-start={start}>
        {notice ? <div role="alert">{notice}</div> : null}
        <button type="button" onClick={() => void actions.signIn({ login: 'dana', password: 'secret' })}>Sign in</button>
        <button
          type="button"
          onClick={() => {
            void actions.continueAsGuest()
            if (params.get('view') === 'join') setParams((p) => { const n = new URLSearchParams(p); n.delete('view'); return n }, { replace: true })
          }}
        >
          Scan without signing in
        </button>
      </div>
    )
  },
  AddPhone: ({ firstName }: { firstName: string }) => <div data-testid="add-phone">{firstName}</div>,
}))
vi.mock('./finish', () => ({
  TERMS_VERSION: '2026-11-18',
  default: ({ member, onDone }: FinishProps) => (
    <div data-testid="finish-joining" data-steps={(member.finish_steps ?? []).join(',')}>
      <button type="button" onClick={onDone}>Done</button>
    </div>
  ),
}))
vi.mock('./trip', () => ({
  default: ({ session, onJoin }: TripProps) => (
    <div data-testid="trip" data-who={session.status}>
      <button type="button" onClick={onJoin}>Get Thrift+</button>
    </div>
  ),
}))
vi.mock('./camera', () => ({ TurnUpright: () => <div data-testid="turn-upright" /> }))

let fake: FakeApi

beforeEach(() => {
  fake = resetScanner()
})

afterEach(() => {
  vi.unstubAllGlobals()
})

const where = () => screen.getByTestId('where').textContent
const path = () => screen.getByTestId('path').textContent

describe('the scanner shell (/scan)', () => {
  it('says coming soon while Thrift+ is off (owner, 2026-10-07), from one session/ request', async () => {
    fake.setOpen(false)
    renderScan()
    expect(await screen.findByText('Coming soon')).toBeInTheDocument()
    expect(screen.getByText('Ask at the register.')).toBeInTheDocument()
    expect(fake.count('GET', 'session/')).toBe(1)
  })

  it('opens the staff form straight from Coming soon (staff testing while Thrift+ is off)', async () => {
    fake.setOpen(false)
    const user = userEvent.setup()
    renderScan()
    await user.click(await screen.findByRole('button', { name: 'Staff sign in' }))
    expect(screen.getByTestId('signin')).toHaveAttribute('data-start', 'staff')
    // A staff sign-in asks session/ again: open to this phone now, with the test mode bar.
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByTestId('trip')).toHaveAttribute('data-who', 'member')
    expect(screen.getByTestId('test-mode-bar')).toHaveTextContent("Test mode: Thrift+ isn't open to customers yet")
  })

  it('the link (?signin=) signs in to the scanner and comes off the address', async () => {
    fake.requestSignInEmail('dana@example.com')
    const { token } = fake.outbox()[0]
    renderScan(`/scan?signin=${token}`)
    expect(screen.getByTestId('scan-spinner')).toBeInTheDocument()
    expect(await screen.findByTestId('trip')).toHaveAttribute('data-who', 'member')
    expect(where()).toBe('')
    expect(path()).toBe('/scan')
  })

  it("a join's link opens Finish joining (view=finish)", async () => {
    fake.joinThriftPlus('Robin', 'Lee', 'robin@example.com')
    const { token } = fake.outbox()[0]
    renderScan(`/scan?signin=${token}`)
    expect(await screen.findByTestId('finish-joining')).toHaveAttribute('data-steps', 'selfie,sign')
    expect(where()).toBe('?view=finish')
  })

  it('a used link says so on the sign-in screen', async () => {
    fake.requestSignInEmail('dana@example.com')
    const { token } = fake.outbox()[0]
    fake.useLink(token)
    fake.signOut()
    renderScan(`/scan?signin=${token}`)
    expect(await screen.findByRole('alert')).toHaveTextContent('That link has already been used. Send a new one.')
    expect(screen.getByTestId('signin')).toHaveAttribute('data-start', 'email')
    expect(where()).toBe('')
  })

  it('ecothrift.us/join (view=join): Join signed out; signed in, the Member QR on /thriftplus', async () => {
    const first = renderScan('/scan?view=join')
    expect(await screen.findByTestId('signin')).toHaveAttribute('data-start', 'join')
    first.unmount()

    fake = resetScanner()
    fake.signIn('dana')
    renderScan('/scan?view=join')
    expect(await screen.findByTestId('thriftplus-page')).toBeInTheDocument()
    expect(path()).toBe('/thriftplus')
    expect(where()).toBe('?show=qr')
    expect(screen.getByTestId('nav-type')).toHaveTextContent('REPLACE') // Back never comes back to /scan?view=join
  })

  it('ecothrift.us/join after scanning without signing in: Join, and "Scan without signing in" goes back to scanning', async () => {
    fake.guestOnThisPhone()
    const user = userEvent.setup()
    renderScan('/scan?view=join')
    expect(await screen.findByTestId('signin')).toHaveAttribute('data-start', 'join')
    await user.click(screen.getByRole('button', { name: 'Scan without signing in' }))
    expect(await screen.findByTestId('trip')).toHaveAttribute('data-who', 'guest')
    expect(where()).toBe('')
  })

  it('the old tabs (view=qr, card, bucks, account) hand over to /thriftplus for a member; signed out, sign in first', async () => {
    for (const [view, show] of [['qr', 'qr'], ['card', 'qr'], ['bucks', 'bucks'], ['account', 'account']]) {
      fake = resetScanner()
      fake.signIn('dana')
      const r = renderScan(`/scan?view=${view}`)
      await screen.findByTestId('thriftplus-page')
      expect(where()).toBe(`?show=${show}`)
      r.unmount()
    }
    // Signed out (ecothrift.us/qr on a new phone): sign in, then the Member QR.
    fake = resetScanner()
    const user = userEvent.setup()
    renderScan('/scan?view=qr')
    await user.click(await screen.findByRole('button', { name: 'Sign in' }))
    expect(await screen.findByTestId('thriftplus-page')).toBeInTheDocument()
    expect(where()).toBe('?show=qr')
  })

  it('an old reset link says how to sign in now', async () => {
    renderScan('/scan?reset=abc')
    expect(await screen.findByRole('alert')).toHaveTextContent("No passwords anymore. We'll send you a code instead.")
  })

  it('keeps a staff preview code on the phone and takes it off the address; ?type=1 is kept for this tab', async () => {
    renderScan('/scan?preview=pv-9&type=1')
    await screen.findByTestId('signin')
    expect(window.localStorage.getItem('thriftPlus.preview')).toBe('pv-9')
    expect(window.sessionStorage.getItem('tp-type-only')).toBe('1')
    await waitFor(() => expect(where()).toBe('?type=1'))
    expect(fake.calls().length).toBeGreaterThan(0)
  })

  it("a tag's QR on a signed-out phone scans as a non-member for this visit; Get Thrift+ opens Join", async () => {
    const user = userEvent.setup()
    renderScan('/scan?tag=TP0000001')
    expect(await screen.findByTestId('trip')).toHaveAttribute('data-who', 'guest')
    expect(window.localStorage.getItem('thriftPlus.real.guest')).toBeNull() // not kept
    await user.click(screen.getByRole('button', { name: 'Get Thrift+' }))
    expect(await screen.findByTestId('signin')).toHaveAttribute('data-start', 'join')
  })

  it('a member with no mobile number is held on Add your mobile number, then Finish joining', async () => {
    fake.setRequirePhone(true)
    fake.joinThriftPlus('Robin', 'Lee', 'robin@example.com')
    const { token } = fake.outbox()[0]
    renderScan(`/scan?signin=${token}`)
    expect(await screen.findByTestId('add-phone')).toHaveTextContent('Robin')
    fake.setRequirePhone(false)
    await act(async () => {
      await actions.reloadSession()
    })
    expect(await screen.findByTestId('finish-joining')).toBeInTheDocument()
  })

  it('finishing the steps opens the Member QR on /thriftplus', async () => {
    fake.joinThriftPlus('Robin', 'Lee', 'robin@example.com')
    renderScan(`/scan?signin=${fake.outbox()[0].token}`)
    await screen.findByTestId('finish-joining')
    await act(async () => {
      await actions.uploadSelfie(new Blob(['jpg'], { type: 'image/jpeg' }))
      await actions.signTerms({ termsVersion: '2026-11-18' })
    })
    // An email join is not ready until a register finishes it, but nothing is left in the app.
    await userEvent.setup().click(screen.getByRole('button', { name: 'Done' }))
    expect(await screen.findByTestId('thriftplus-page')).toBeInTheDocument()
    expect(where()).toBe('?show=qr')
    expect(fake.finished().map((f) => f.step)).toEqual(['selfie', 'sign'])
  })

  it('shows the release on every screen', async () => {
    fake.setOpen(false)
    renderScan()
    await screen.findByText('Coming soon')
    expect(screen.getByTestId('version-tag').textContent).toMatch(/\d+\.\d+\.\d+/)
  })
})
