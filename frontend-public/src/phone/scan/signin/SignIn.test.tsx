/**
 * Piece S1, sign-in: the live page test's sign-in cases (frontend/src/pages/thriftplus/scanner/
 * ThriftPlusScannerPage.test.tsx :488-579, the form half of :614, :752, :770, :794-861, :926), ported onto the real
 * ScanApp, store and API over the fake server, with the same words and the same behaviour asserted. The other pieces
 * are stood in by small doubles that keep their contracts (the trip, Finish joining, the camera), so these tests
 * read only this piece. Added: cases this rebuild had to decide (marked "S1:").
 */
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { FinishProps, TripProps } from '../contracts'
import { renderScan, resetScanner } from '../test/harness'
import type { FakeApi } from '../test/fakeApi'

const cam = vi.hoisted(() => ({ onDecode: null as null | ((raw: string) => void), status: 'unsupported' as string }))

// jsdom has no camera or WebAssembly decoder: the decoder never loads, and the store QR's camera is a stand-in that
// hands the test its decode callback.
vi.mock('../core', async (orig) => ({
  ...(await orig<typeof import('../core')>()),
  loadDetector: () => new Promise(() => undefined),
  useQrCamera: (opts: { onDecode: (raw: string) => void }) => {
    cam.onDecode = opts.onDecode
    return { videoRef: { current: null }, status: cam.status, restart: () => undefined }
  },
}))
vi.mock('../trip', () => ({
  default: ({ session }: TripProps) => <div data-testid="see-trip" data-who={session.status} />,
  TripList: () => null,
}))
vi.mock('../finish', () => ({
  TERMS_VERSION: '2026-11-18',
  default: ({ member, onSignOut }: FinishProps) => (
    <div data-testid="finish-joining" data-steps={(member.finish_steps ?? []).join(',')}>
      <div data-testid="finish-progress">{`Step 1 of ${(member.finish_steps ?? []).length}`}</div>
      <button type="button" onClick={onSignOut}>Sign out</button>
    </div>
  ),
}))
vi.mock('../camera', () => ({ TurnUpright: () => null }))

type User = ReturnType<typeof userEvent.setup>

let fake: FakeApi

beforeEach(() => {
  fake = resetScanner()
  cam.onDecode = null
  cam.status = 'unsupported'
})

afterEach(() => {
  delete (window as unknown as { google?: unknown }).google
  vi.unstubAllGlobals()
  vi.useRealTimers()
})

const lastCode = () => fake.lastCode()
const where = () => screen.getByTestId('where').textContent
const setGoogle = (gsi: unknown) => {
  ;(window as unknown as { google?: unknown }).google = { accounts: { id: gsi } }
}

/**
 * "Send my code" from the sign-in screen. Phone first (owner 2026-10-20): the box is "Mobile number"; an email goes
 * behind "Joined with an email? Use your email" (the box is then "Email or phone").
 */
async function sendMyCode(user: User, contact = 'dana@example.com') {
  if (contact.includes('@')) {
    await user.click(await screen.findByRole('button', { name: 'Joined with an email? Use your email' }))
    await user.type(await screen.findByLabelText('Email or phone'), contact)
  } else {
    await user.type(await screen.findByLabelText('Mobile number'), contact)
  }
  await user.click(screen.getByRole('button', { name: 'Send my code' }))
  return screen.findByTestId('check-code')
}

const CONSENT =
  'A phone number gets one text with your code each time you ask. Msg & data rates may apply. Reply STOP to cancel, HELP for help. Terms · Privacy'

describe('Sign in and join: Google, an email or a phone, and a code (Join v2, owner 2026-10-19)', () => {
  it('phone first; an email still signs in behind "Joined with an email?", and the code signs in on its sixth digit', async () => {
    const user = userEvent.setup()
    renderScan()
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
    expect(screen.getByText('No password needed.')).toBeInTheDocument()
    // Phone or Google (owner 2026-10-20), with the text-message line Twilio's toll-free review was given.
    const box = await screen.findByLabelText('Mobile number')
    expect(box).toHaveAttribute('inputmode', 'tel')
    expect(box).toHaveAttribute('autocomplete', 'tel')
    expect(screen.getByTestId('contact-hint')).toHaveTextContent("We'll text you a 6-digit code.")
    expect(screen.getByTestId('text-consent')).toHaveTextContent(CONSENT)
    // An email in the phone box is caught, and nothing is sent.
    await user.type(box, 'dana@example.com')
    await user.click(screen.getByRole('button', { name: 'Send my code' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Enter your mobile number, or use Continue with Google.')
    expect(fake.outbox()).toHaveLength(0)
    await user.clear(box)
    expect(screen.queryByTestId('google-sign-in')).toBeNull() // no Google client id on this server
    expect(screen.getByRole('button', { name: 'Join Thrift+' })).toBeInTheDocument()
    expect(screen.getByText('Free to join. Nothing owed.')).toBeInTheDocument()

    const check = await sendMyCode(user, 'Dana@Example.com')
    expect(within(check).getByRole('heading', { name: 'Check your email' })).toBeInTheDocument()
    expect(within(check).getByTestId('sent-line')).toHaveTextContent(
      'Enter the 6-digit code we sent to D•••@Example.com. Or tap the link in the email on this phone.',
    )
    expect(fake.outbox()).toMatchObject([{ to: 'dana@example.com', channel: 'email', purpose: 'sign_in' }])

    const code = within(check).getByLabelText('6-digit code')
    expect(code).toHaveAttribute('inputmode', 'numeric')
    expect(code).toHaveAttribute('autocomplete', 'one-time-code')
    expect(within(check).getByRole('button', { name: 'Sign in' })).toBeDisabled()
    // Digits only; the sixth signs in by itself (no "Sign in" tap).
    await user.type(code, `${lastCode().slice(0, 3)} -${lastCode().slice(3)}`)
    expect(await screen.findByTestId('see-trip')).toBeInTheDocument()
    expect(screen.queryByTestId('thriftplus-page')).toBeNull()
    expect(where()).toBe('')
  })

  it('a phone number in the box gets a text (code/send/), and its code signs in (code/check/)', async () => {
    const user = userEvent.setup()
    renderScan()
    const check = await sendMyCode(user, '(402) 555-0123')
    expect(fake.calls().find((c) => c.path === 'code/send/')?.body).toEqual({ contact: '(402) 555-0123' })
    expect(fake.outbox()).toMatchObject([{ to: '+14025550123', channel: 'sms', purpose: 'sign_in' }])
    expect(within(check).getByRole('heading', { name: 'Check your texts' })).toBeInTheDocument()
    expect(within(check).getByTestId('sent-line')).toHaveTextContent('Enter the 6-digit code we sent to (•••) •••-0123.')
    expect(within(check).getByTestId('sent-line')).not.toHaveTextContent('link')
    expect(within(check).getByTestId('resend')).toHaveTextContent("Didn't get it? Send again in 0:30")
    await user.type(within(check).getByLabelText('6-digit code'), lastCode())
    expect(await screen.findByTestId('see-trip')).toBeInTheDocument()
    expect(fake.calls().find((c) => c.path === 'code/check/')?.body).toEqual({ contact: '(402) 555-0123', code: lastCode() })
  })

  it('with texts off the box is just "Email", and something that is neither is caught before sending', async () => {
    fake.setSignInOptions({ phone: false })
    const user = userEvent.setup()
    renderScan()
    const box = await screen.findByLabelText('Email')
    expect(box).toHaveAttribute('inputmode', 'email')
    expect(box).toHaveAttribute('autocomplete', 'email')
    expect(screen.getByTestId('contact-hint')).toHaveTextContent("We'll send a 6-digit code to your email.")
    expect(screen.queryByLabelText('Email or phone')).toBeNull()
    expect(screen.queryByTestId('text-consent')).toBeNull()
    await user.type(box, 'dana@example') // the browser takes it as an email; it has no domain ending
    await user.click(screen.getByRole('button', { name: 'Send my code' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Check your email address.')
    expect(fake.outbox()).toHaveLength(0)
  })

  it('one tap sends once: "Change" and "Send my code" again for the same email go back to the code, not a second send', async () => {
    const user = userEvent.setup()
    renderScan()
    const check = await sendMyCode(user)
    const wrong = lastCode() === '000000' ? '111111' : '000000'
    await user.type(within(check).getByLabelText('6-digit code'), wrong)
    expect(await within(check).findByRole('alert')).toHaveTextContent("That code didn't work. Check it and try again.")
    expect(screen.queryByTestId('see-trip')).toBeNull()

    await user.click(within(check).getByRole('button', { name: 'Change' }))
    expect(await screen.findByLabelText('Email or phone')).toHaveValue('dana@example.com') // still behind the email link
    expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Send my code' }))
    expect(await screen.findByTestId('check-code')).toBeInTheDocument()
    expect(fake.outbox()).toHaveLength(1)
  })

  it('counts down to "Send it again", and after the third send says to ask at a register', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    const user = userEvent.setup({ advanceTimers: (ms) => vi.advanceTimersByTime(ms) })
    renderScan()
    await sendMyCode(user)
    const resend = () => screen.getByTestId('resend')
    expect(resend()).toHaveTextContent("Didn't get it? Check spam, or send again in 0:30")
    act(() => {
      vi.advanceTimersByTime(10_000)
    })
    expect(resend()).toHaveTextContent(/send again in 0:(19|20|21)$/)
    act(() => {
      vi.advanceTimersByTime(20_500)
    })
    await user.click(within(resend()).getByRole('button', { name: 'Send it again' }))
    await waitFor(() => expect(resend()).toHaveTextContent('send again in 0:30'))
    expect(fake.outbox()).toHaveLength(2)

    act(() => {
      vi.advanceTimersByTime(30_500)
    })
    await user.click(within(resend()).getByRole('button', { name: 'Send it again' }))
    await waitFor(() => expect(resend()).toHaveTextContent('Still nothing? Ask at any register.'))
    expect(fake.outbox()).toHaveLength(3)
    act(() => {
      vi.advanceTimersByTime(60_000)
    })
    expect(resend()).toHaveTextContent('Still nothing? Ask at any register.')
    expect(within(resend()).queryByRole('button')).toBeNull()
  })

  it('Join: the two steps, a name and a phone; the code opens Finish joining', async () => {
    const user = userEvent.setup()
    renderScan()
    await user.click(await screen.findByRole('button', { name: 'Join Thrift+' }))
    const form = await screen.findByTestId('join-form')
    expect(within(form).getByRole('heading', { name: 'Join Thrift+' })).toBeInTheDocument()
    expect(form).toHaveTextContent('Free. Two quick steps.')
    expect(await within(form).findByTestId('join-step-now')).toHaveTextContent('1Now: your name, then your phone.')
    expect(within(form).getByTestId('join-step-store')).toHaveTextContent("2At the store: show your QR and your photo ID. That's it.")
    expect(form).toHaveTextContent("That's all it takes to collect ThriftBucks and get 3-day returns.")
    expect(form).toHaveTextContent('Thrift+ terms: ecothrift.us/terms')
    expect(within(form).getByTestId('text-consent')).toHaveTextContent(CONSENT)
    expect(within(form).getByTestId('join-terms')).toHaveAttribute('href', 'https://ecothrift.us/terms')
    // Owner 2026-10-16: first and last name, both required.
    expect(within(form).getByLabelText('First name')).toHaveAttribute('autocomplete', 'given-name')
    expect(within(form).getByLabelText('Last name')).toHaveAttribute('autocomplete', 'family-name')
    expect(within(form).getByLabelText('First name')).toBeRequired()
    expect(within(form).getByLabelText('Last name')).toBeRequired()
    expect(screen.queryByRole('button', { name: 'Join Thrift+' })).toBeNull()
    expect(screen.getByRole('button', { name: 'Scan without signing in' })).toBeInTheDocument()

    await user.type(within(form).getByLabelText('First name'), 'Robin')
    await user.type(within(form).getByLabelText('Last name'), 'Lee')
    expect(within(form).queryByLabelText('Email or phone')).toBeNull() // joining is phone or Google (owner 2026-10-20)
    await user.type(within(form).getByLabelText('Mobile number'), '(402) 555-0188')
    await user.click(within(form).getByRole('button', { name: 'Send my code' }))
    const check = await screen.findByTestId('check-code')
    expect(within(check).getByTestId('sent-line')).toHaveTextContent('Enter the 6-digit code we sent to (•••) •••-0188.')
    expect(within(check).getByRole('button', { name: 'Continue' })).toBeDisabled()
    expect(fake.outbox()).toMatchObject([{ to: '+14025550188', channel: 'sms', purpose: 'join' }])
    expect(fake.calls().find((c) => c.path === 'code/send/')?.body).toEqual({ contact: '(402) 555-0188', first_name: 'Robin', last_name: 'Lee' })
    await user.type(within(check).getByLabelText('6-digit code'), lastCode())

    // Finish joining (piece S2) takes over, its address set.
    const finish = await screen.findByTestId('finish-joining')
    expect(finish).toHaveAttribute('data-steps', 'selfie,sign')
    expect(where()).toBe('?view=finish')
  })

  it('S1: a join without both names is caught before sending', async () => {
    const user = userEvent.setup()
    renderScan('/scan?view=join')
    await user.type(await screen.findByLabelText('First name'), 'Robin')
    await user.type(screen.getByLabelText('Mobile number'), '(402) 555-0188')
    // The live words; a real browser's own "required" check would stop the tap first.
    fireEvent.submit(screen.getByTestId('join-form'))
    expect(await screen.findByRole('alert')).toHaveTextContent('Enter your first and last name.')
    expect(fake.outbox()).toHaveLength(0)
  })

  it('shows "Continue with Google" only when the server has a Google client id', async () => {
    fake.setSignInOptions({ google_client_id: 'test-client.apps.googleusercontent.com' })
    const first = renderScan()
    // Google's script can't load in a test: the same pill waits in its place.
    const google = await screen.findByTestId('google-sign-in')
    expect(google).toHaveTextContent('Continue with Google')
    expect(google).toHaveTextContent('or')
    expect(document.head.querySelector('script[src="https://accounts.google.com/gsi/client"]')).not.toBeNull()
    first.unmount()

    fake = resetScanner()
    fake.setSignInOptions({ google_client_id: null })
    renderScan('/scan?view=join')
    expect(await screen.findByTestId('join-form')).toBeInTheDocument()
    await screen.findByLabelText('Mobile number')
    expect(screen.queryByTestId('google-sign-in')).toBeNull()
    expect(screen.queryByText('Continue with Google')).toBeNull()
  })

  it("Google's button signs a new person in (google/) and opens Finish joining", async () => {
    fake.setSignInOptions({ google_client_id: 'test-client.apps.googleusercontent.com' })
    const gsi = { initialize: vi.fn(), renderButton: vi.fn() }
    setGoogle(gsi)
    renderScan('/scan?view=join')
    await waitFor(() => expect(gsi.renderButton).toHaveBeenCalled())
    expect(screen.getByTestId('join-step-now')).toHaveTextContent('1Now: your name, then Google or your phone.')
    const options = gsi.initialize.mock.calls[0][0]
    expect(options).toMatchObject({ client_id: 'test-client.apps.googleusercontent.com', context: 'signup', ux_mode: 'popup' })
    expect(gsi.renderButton.mock.calls[0][1]).toMatchObject({ text: 'continue_with', shape: 'pill' })
    const credential = fake.googleCredential('robin@example.com', 'Robin', 'Lee')
    await act(async () => {
      options.callback({ credential })
    })
    expect(fake.calls().find((c) => c.path === 'google/')?.body).toEqual({ credential })
    const finish = await screen.findByTestId('finish-joining')
    expect(within(finish).getByTestId('finish-progress')).toHaveTextContent('Step 1 of 2')
    expect(where()).toBe('?view=finish')
  })

  it('S1: on the sign-in screen Google asks for a sign-in, and a refusal shows the plain words', async () => {
    fake.setSignInOptions({ google_client_id: 'test-client.apps.googleusercontent.com' })
    const gsi = { initialize: vi.fn(), renderButton: vi.fn() }
    setGoogle(gsi)
    renderScan()
    await waitFor(() => expect(gsi.renderButton).toHaveBeenCalled())
    expect(gsi.initialize.mock.calls[0][0]).toMatchObject({ context: 'signin' })
    await act(async () => {
      gsi.initialize.mock.calls[0][0].callback({ credential: 'not-a-token' })
    })
    expect(await screen.findByRole('alert')).toHaveTextContent("Google didn't sign you in. Try again, or use your email or phone.")
    expect(screen.getByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
  })

  // Phase 3 (owner 2026-10-20): the phone is required. A member with none sees only "Add your mobile number".
  describe('Add your mobile number (needs_phone)', () => {
    beforeEach(() => fake.setRequirePhone(true))

    it('a Google joiner adds a phone with a checked code first, then goes on to Finish joining', async () => {
      const user = userEvent.setup()
      fake.setSignInOptions({ google_client_id: 'test-client.apps.googleusercontent.com' })
      const gsi = { initialize: vi.fn(), renderButton: vi.fn() }
      setGoogle(gsi)
      renderScan('/scan?view=join')
      await waitFor(() => expect(gsi.renderButton).toHaveBeenCalled())
      await act(async () => {
        gsi.initialize.mock.calls[0][0].callback({ credential: fake.googleCredential('robin@example.com', 'Robin', 'Lee') })
      })
      const add = await screen.findByTestId('add-phone')
      expect(add).toHaveTextContent('Add your mobile number')
      expect(add).toHaveTextContent('Robin, we need a mobile number on your Thrift+ account.')
      // Required: no close, no skip; Sign out is the only way out. The consent line is the submitted one, unchanged.
      expect(within(add).queryByRole('button', { name: /close|skip|later|not now/i })).toBeNull()
      expect(within(add).getByRole('button', { name: 'Sign out' })).toBeInTheDocument()
      expect(within(add).getByTestId('text-consent')).toHaveTextContent(CONSENT)
      // A number that is not a US mobile number is refused before any text.
      await user.type(within(add).getByLabelText('Mobile number'), '123')
      await user.click(within(add).getByRole('button', { name: 'Send my code' }))
      expect(await within(add).findByRole('alert')).toHaveTextContent('Enter a US mobile number.')
      expect(fake.outbox()).toHaveLength(0)
      await user.clear(within(add).getByLabelText('Mobile number'))
      await user.type(within(add).getByLabelText('Mobile number'), '(402) 555-0177')
      await user.click(within(add).getByRole('button', { name: 'Send my code' }))
      const check = await within(add).findByTestId('check-code')
      expect(within(check).getByTestId('sent-line')).toHaveTextContent('Enter the 6-digit code we sent to (•••) •••-0177.')
      expect(fake.outbox().at(-1)).toMatchObject({ to: '+14025550177', channel: 'sms' })
      // A wrong code says so and keeps the screen; nothing is saved.
      await user.type(within(check).getByLabelText('6-digit code'), '000000')
      expect(await within(check).findByRole('alert')).toHaveTextContent("That code didn't work. Check it and try again.")
      expect(screen.getByTestId('add-phone')).toBeInTheDocument()
      await user.clear(within(check).getByLabelText('6-digit code'))
      await user.type(within(check).getByLabelText('6-digit code'), lastCode())
      await waitFor(() => expect(screen.queryByTestId('add-phone')).toBeNull())
      // Then the steps that were waiting: Finish joining.
      const finish = await screen.findByTestId('finish-joining')
      expect(within(finish).getByTestId('finish-progress')).toHaveTextContent('Step 1 of 2')
    })

    it('an email member with no phone is asked too, and lands on the scanner once it is saved', async () => {
      const user = userEvent.setup()
      fake.requestSignInEmail('dana@example.com')
      renderScan(`/scan?signin=${fake.outbox()[0].token}`)
      const add = await screen.findByTestId('add-phone')
      await user.type(within(add).getByLabelText('Mobile number'), '402-555-0166')
      await user.click(within(add).getByRole('button', { name: 'Send my code' }))
      const check = await within(add).findByTestId('check-code')
      expect(within(check).getByRole('button', { name: 'Save my number' })).toBeDisabled()
      expect(fake.calls().find((c) => c.path === 'me/phone/send/')?.body).toEqual({ phone: '402-555-0166' })
      await user.type(within(check).getByLabelText('6-digit code'), lastCode())
      await waitFor(() => expect(screen.queryByTestId('add-phone')).toBeNull())
      expect(screen.getByTestId('see-trip')).toBeInTheDocument()
      expect(where()).toBe('')
    })

    it('Sign out leaves the screen, and the address becomes a bare /scan (Dash Update #185)', async () => {
      const user = userEvent.setup()
      fake.requestSignInEmail('dana@example.com')
      renderScan(`/scan?signin=${fake.outbox()[0].token}&view=finish`)
      const add = await screen.findByTestId('add-phone')
      await user.click(within(add).getByRole('button', { name: 'Sign out' }))
      expect(await screen.findByRole('button', { name: 'Send my code' })).toBeInTheDocument()
      expect(screen.queryByTestId('add-phone')).toBeNull()
      expect(fake.isSignedIn()).toBe(false)
      await waitFor(() => expect(where()).toBe(''))
    })

    it('a member who joined with a phone is never asked', async () => {
      const user = userEvent.setup()
      renderScan('/scan?view=join')
      await user.type(await screen.findByLabelText('First name'), 'Pat')
      await user.type(screen.getByLabelText('Last name'), 'Lee')
      await user.type(screen.getByLabelText('Mobile number'), '402-555-0155')
      await user.click(screen.getByRole('button', { name: 'Send my code' }))
      await user.type(await screen.findByLabelText('6-digit code'), lastCode())
      expect(await screen.findByTestId('finish-joining')).toBeInTheDocument()
      expect(screen.queryByTestId('add-phone')).toBeNull()
    })
  })

  it('"Staff sign in" opens the password form, and Back returns to the customer sign-in', async () => {
    const user = userEvent.setup()
    renderScan()
    await user.click(await screen.findByRole('button', { name: 'Staff sign in' }))
    expect(await screen.findByLabelText('Email or username')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Staff sign in' })).toBeInTheDocument() // APP 10-15: customers have no password
    expect(screen.getByText('Your Dash email and password.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Forgot password?' })).toBeNull() // a staff password is reset in Dash
    await user.click(screen.getByRole('button', { name: 'Back' }))
    expect(await screen.findByRole('button', { name: 'Send my code' })).toBeInTheDocument()
    expect(screen.queryByLabelText('Password')).toBeNull()
  })

  it('S1: the staff form signs in (session/password/), shows a wrong password in words, and the eye shows the password', async () => {
    const user = userEvent.setup()
    renderScan()
    await user.click(await screen.findByRole('button', { name: 'Staff sign in' }))
    const pw = await screen.findByLabelText('Password')
    expect(pw).toHaveAttribute('type', 'password')
    await user.click(screen.getByRole('button', { name: 'Show password' }))
    expect(pw).toHaveAttribute('type', 'text')
    expect(screen.getByRole('button', { name: 'Hide password' })).toBeInTheDocument()
    await user.type(screen.getByLabelText('Email or username'), 'da')
    await user.type(pw, 'x')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByRole('alert')).toHaveTextContent("That email or password isn't right.")
    await user.type(screen.getByLabelText('Email or username'), 'na')
    await user.type(pw, 'secret')
    await user.click(screen.getByRole('button', { name: 'Sign in' }))
    expect(await screen.findByTestId('see-trip')).toBeInTheDocument()
    expect(fake.calls().filter((c) => c.path === 'session/password/').at(-1)?.body).toEqual({ login: 'dana', password: 'xsecret' })
  })

  it('opens the password form straight from Coming soon (staff testing while Thrift+ is off)', async () => {
    fake.setOpen(false)
    const user = userEvent.setup()
    renderScan()
    await user.click(await screen.findByRole('button', { name: 'Staff sign in' }))
    expect(await screen.findByLabelText('Email or username')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Staff sign in' })).toBeInTheDocument()
  })
})

describe('S1: the rest of the sign-in duties', () => {
  it('"Scan without signing in" from Join takes view=join off the address and scans as a non-member', async () => {
    const user = userEvent.setup()
    renderScan('/scan?view=join')
    expect(await screen.findByRole('heading', { name: 'Join Thrift+' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Scan without signing in' }))
    const trip = await screen.findByTestId('see-trip')
    expect(trip).toHaveAttribute('data-who', 'guest')
    expect(where()).toBe('')
    expect(screen.getByTestId('nav-type')).toHaveTextContent('REPLACE')
    expect(window.localStorage.getItem('thriftPlus.real.guest')).toBe('true')
  })

  it('"Already a member? Sign in" goes from Join to sign-in, the names and number kept for a return', async () => {
    const user = userEvent.setup()
    renderScan('/scan?view=join')
    await user.type(await screen.findByLabelText('First name'), 'Robin')
    await user.click(screen.getByRole('button', { name: 'Already a member? Sign in' }))
    expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Join Thrift+' }))
    expect(await screen.findByLabelText('First name')).toHaveValue('Robin')
  })

  it('a used link says so on the sign-in screen', async () => {
    fake.requestSignInEmail('dana@example.com')
    const { token } = fake.outbox()[0]
    fake.useLink(token)
    fake.signOut()
    renderScan(`/scan?signin=${token}`)
    expect(await screen.findByRole('alert')).toHaveTextContent('That link has already been used. Send a new one.')
    expect(screen.getByRole('button', { name: 'Send my code' })).toBeInTheDocument()
    expect(where()).toBe('')
  })

  it('an old reset link says how to sign in now', async () => {
    renderScan('/scan?reset=abc')
    expect(await screen.findByRole('alert')).toHaveTextContent("No passwords anymore. We'll send you a code instead.")
    expect(await screen.findByLabelText('Mobile number')).toBeInTheDocument()
  })

  it('one sent moments ago (TOO_SOON) goes to the code screen with the wait the server gave', async () => {
    fake.failNext('POST', 'code/send/', 429, { detail: 'A code just went out.', code: 'TOO_SOON', retry_after: 20 })
    const user = userEvent.setup()
    renderScan()
    const check = await sendMyCode(user, '(402) 555-0123')
    expect(within(check).getByTestId('resend')).toHaveTextContent("Didn't get it? Send again in 0:20")
  })

  it('a server refusal keeps its plain words (texts off for this number)', async () => {
    fake.failNext('POST', 'code/send/', 400, { detail: 'x', code: 'TEXTS_OFF' })
    const user = userEvent.setup()
    renderScan()
    await user.type(await screen.findByLabelText('Mobile number'), '(402) 555-0123')
    await user.click(screen.getByRole('button', { name: 'Send my code' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Texts to this number are turned off. Use Google, or ask at the register.')
    expect(screen.queryByTestId('check-code')).toBeNull()
  })

  it("the email's link tapped in another tab: back on this tab, the code screen carries on signed in", async () => {
    const user = userEvent.setup()
    renderScan()
    await sendMyCode(user)
    fake.useLink(fake.outbox()[0].token) // the link signed this browser in, elsewhere
    expect(screen.getByTestId('check-code')).toBeInTheDocument()
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    expect(await screen.findByTestId('see-trip')).toBeInTheDocument()
    expect(where()).toBe('')
  })

  it("a join's link tapped in another tab: back on this tab, Finish joining", async () => {
    const user = userEvent.setup()
    fake.setSignInOptions({ phone: false })
    renderScan('/scan?view=join')
    await user.type(await screen.findByLabelText('First name'), 'Robin')
    await user.type(screen.getByLabelText('Last name'), 'Lee')
    await user.type(screen.getByLabelText('Email'), 'robin@example.com')
    await user.click(screen.getByRole('button', { name: 'Send my code' }))
    await screen.findByTestId('check-code')
    fake.useLink(fake.outbox()[0].token)
    await act(async () => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    expect(await screen.findByTestId('finish-joining')).toBeInTheDocument()
    expect(where()).toBe('?view=finish')
  })

  describe("the store's sign-in QR (C5)", () => {
    it('opens the camera window (video mounted, playsinline, muted, not in a button) and Back returns', async () => {
      const user = userEvent.setup()
      renderScan()
      await user.click(await screen.findByRole('button', { name: "At the store? Scan the store's sign-in QR" }))
      const panel = await screen.findByTestId('store-qr-scan')
      expect(within(panel).getByRole('heading', { name: "Scan the store's sign-in QR" })).toBeInTheDocument()
      expect(panel).toHaveTextContent('A cashier shows it on their phone. Point your camera at it.')
      const video = panel.querySelector('video') as HTMLVideoElement
      expect(video).not.toBeNull()
      expect(video.playsInline).toBe(true)
      expect(video.muted).toBe(true)
      expect(video.closest('button')).toBeNull()
      // jsdom has no camera: the live words for a camera that did not start.
      expect(panel).toHaveTextContent("The camera didn't start. Ask the cashier, or sign in with your mobile number.")
      await user.click(within(panel).getByRole('button', { name: 'Back to sign in' }))
      expect(await screen.findByRole('heading', { name: 'Sign in' })).toBeInTheDocument()
    })

    it("another code says so; the cashier's QR signs this phone in through ?signin=", async () => {
      cam.status = 'live'
      fake.requestSignInEmail('dana@example.com')
      const { token } = fake.outbox()[0]
      const user = userEvent.setup()
      renderScan()
      await user.click(await screen.findByRole('button', { name: "At the store? Scan the store's sign-in QR" }))
      await screen.findByTestId('store-qr-scan')
      act(() => cam.onDecode?.('TP402155831907'))
      expect(await screen.findByRole('alert')).toHaveTextContent("That's not the store's sign-in QR. Ask the cashier to show it again.")
      act(() => cam.onDecode?.(`https://ecothrift.us/scan?signin=${token}`))
      expect(await screen.findByTestId('see-trip')).toBeInTheDocument()
      expect(where()).toBe('')
      expect(fake.calls().find((c) => c.path === 'session/link/')?.body).toEqual({ token })
    })
  })
})
