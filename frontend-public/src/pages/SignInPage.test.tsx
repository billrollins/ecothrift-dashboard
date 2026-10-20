import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import SignInPage from './SignInPage'

// Phase 3 (owner 2026-10-20): the website sign-in matches the Thrift+ app: Continue with Google, or a mobile number and a
// text; "Joined with an email? Use your email" stays a small link. The server and the auth context are mocked.

const auth = vi.hoisted(() => ({
  user: null as null | { id: number },
  requestMagicLink: vi.fn(),
  consumeToken: vi.fn(),
  signInWithPassword: vi.fn(),
  lookupEmail: vi.fn(),
  requestReset: vi.fn(),
  completeSignIn: vi.fn(),
}))
vi.mock('../auth', () => ({ useAuth: () => auth }))
vi.mock('../onlineSalesConfig', () => ({
  useOnlineSalesConfig: () => ({ config: { accounts_enabled: true }, loading: false }),
}))
vi.mock('../useSeo', () => ({ useSeo: () => undefined }))

const member = vi.hoisted(() => ({
  getSignInOptions: vi.fn(),
  sendCode: vi.fn(),
  checkCode: vi.fn(),
  signInWithGoogle: vi.fn(),
}))
vi.mock('../lib/memberSignIn', async (orig) => ({
  ...(await orig<typeof import('../lib/memberSignIn')>()),
  ...member,
}))

function renderPage(path = '/account/sign-in') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/account/sign-in" element={<SignInPage />} />
        <Route path="/account" element={<div data-testid="account-page">Account</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

const gsi = { initialize: vi.fn(), renderButton: vi.fn() }

beforeEach(() => {
  vi.clearAllMocks()
  auth.user = null
  member.getSignInOptions.mockResolvedValue({ google_client_id: 'test-client.apps.googleusercontent.com', phone: true })
  member.sendCode.mockResolvedValue(undefined)
  member.checkCode.mockResolvedValue(undefined)
  member.signInWithGoogle.mockResolvedValue(undefined)
  auth.completeSignIn.mockResolvedValue({ id: 1 })
  window.google = { accounts: { id: gsi } }
})

describe('Website sign-in (ecothrift.us/account/sign-in)', () => {
  it('offers Google and a mobile number, with the app\'s text-message line and a small email link', async () => {
    renderPage()
    expect(await screen.findByLabelText('Mobile number')).toBeInTheDocument()
    await waitFor(() => expect(gsi.renderButton).toHaveBeenCalled())
    expect(screen.getByTestId('google-sign-in')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Send my code' })).toBeInTheDocument()
    expect(screen.getByTestId('text-consent')).toHaveTextContent(
      'A phone number gets one text with your code each time you ask. Msg & data rates may apply. Reply STOP to cancel, HELP for help.',
    )
    expect(screen.getByRole('button', { name: 'Joined with an email? Use your email' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Join Thrift+' })).toHaveAttribute('href', '/join')
    // The old email box is not the first thing anymore.
    expect(screen.queryByLabelText('Email')).toBeNull()
  })

  it('hides Google when the server has no client id, and the phone box when texts are off', async () => {
    member.getSignInOptions.mockResolvedValue({ google_client_id: null, phone: true })
    const first = renderPage()
    expect(await screen.findByLabelText('Mobile number')).toBeInTheDocument()
    expect(screen.queryByTestId('google-sign-in')).toBeNull()
    first.unmount()
    member.getSignInOptions.mockResolvedValue({ google_client_id: 'test-client.apps.googleusercontent.com', phone: false })
    renderPage()
    await waitFor(() => expect(gsi.renderButton).toHaveBeenCalled())
    expect(screen.queryByLabelText('Mobile number')).toBeNull()
    expect(screen.queryByTestId('text-consent')).toBeNull()
  })

  it('falls back to the email form when the server offers neither Google nor texts', async () => {
    member.getSignInOptions.mockResolvedValue({ google_client_id: null, phone: false })
    renderPage()
    expect(await screen.findByLabelText('Email')).toBeInTheDocument()
    expect(screen.queryByLabelText('Mobile number')).toBeNull()
  })

  it('texts a code to the number, signs in on the sixth digit and goes to the account', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.type(await screen.findByLabelText('Mobile number'), '(402) 555-0177')
    await user.click(screen.getByRole('button', { name: 'Send my code' }))
    expect(member.sendCode).toHaveBeenCalledWith('(402) 555-0177')
    expect(await screen.findByTestId('sent-line')).toHaveTextContent('Enter the 6-digit code we sent to (402) 555-0177.')
    expect(screen.getByTestId('resend')).toHaveTextContent("Didn't get it? Send it again in 0:30")
    await user.type(screen.getByLabelText('6-digit code'), '123456')
    await waitFor(() => expect(member.checkCode).toHaveBeenCalledWith('(402) 555-0177', '123456'))
    expect(auth.completeSignIn).toHaveBeenCalled()
    expect(await screen.findByTestId('account-page')).toBeInTheDocument()
  })

  it('a number that is not a US mobile number is refused before any text', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.type(await screen.findByLabelText('Mobile number'), '123')
    await user.click(screen.getByRole('button', { name: 'Send my code' }))
    expect(screen.getByText('Enter a US mobile number.')).toBeInTheDocument()
    expect(member.sendCode).not.toHaveBeenCalled()
  })

  it('a wrong code says so and stays on the code screen', async () => {
    const user = userEvent.setup()
    member.checkCode.mockRejectedValue(new Error("That code didn't work. Check it and try again."))
    renderPage()
    await user.type(await screen.findByLabelText('Mobile number'), '4025550177')
    await user.click(screen.getByRole('button', { name: 'Send my code' }))
    await user.type(await screen.findByLabelText('6-digit code'), '000000')
    expect(await screen.findByText("That code didn't work. Check it and try again.")).toBeInTheDocument()
    expect(auth.completeSignIn).not.toHaveBeenCalled()
    expect(screen.queryByTestId('account-page')).toBeNull()
    // "Change" goes back to the number.
    await user.click(screen.getByRole('button', { name: 'Change' }))
    expect(await screen.findByLabelText('Mobile number')).toHaveValue('4025550177')
  })

  it('a send that is too soon goes to the code screen rather than sending again', async () => {
    const user = userEvent.setup()
    member.sendCode.mockRejectedValue(Object.assign(new Error('Too many'), { code: 'TOO_SOON', retryAfter: 12 }))
    renderPage()
    await user.type(await screen.findByLabelText('Mobile number'), '4025550177')
    await user.click(screen.getByRole('button', { name: 'Send my code' }))
    expect(await screen.findByTestId('resend')).toHaveTextContent('0:12')
    expect(member.sendCode).toHaveBeenCalledTimes(1)
  })

  it("Google's button signs in (google/) and goes to the account", async () => {
    renderPage()
    await waitFor(() => expect(gsi.renderButton).toHaveBeenCalled())
    expect(gsi.initialize.mock.calls[0][0]).toMatchObject({ client_id: 'test-client.apps.googleusercontent.com', context: 'signin' })
    await act(async () => {
      gsi.initialize.mock.calls[0][0].callback({ credential: 'g-token' })
    })
    expect(member.signInWithGoogle).toHaveBeenCalledWith('g-token')
    expect(await screen.findByTestId('account-page')).toBeInTheDocument()
  })

  it('a sign-in that did not also sign in to the site (a staff login) sends them to the email form', async () => {
    const user = userEvent.setup()
    auth.completeSignIn.mockResolvedValue(null)
    renderPage()
    await user.type(await screen.findByLabelText('Mobile number'), '4025550177')
    await user.click(screen.getByRole('button', { name: 'Send my code' }))
    await user.type(await screen.findByLabelText('6-digit code'), '123456')
    expect(await screen.findByLabelText('Email')).toBeInTheDocument()
    expect(screen.getByText(/signed in to Thrift\+, but not to this site/)).toBeInTheDocument()
  })

  it('"Joined with an email? Use your email" is the old email link path, and goes back', async () => {
    const user = userEvent.setup()
    auth.lookupEmail.mockResolvedValue({ has_account: true, has_password: false, password_only: false })
    auth.requestMagicLink.mockResolvedValue({ detail: 'ok' })
    renderPage()
    await user.click(await screen.findByRole('button', { name: 'Joined with an email? Use your email' }))
    await user.type(await screen.findByLabelText('Email'), 'ruth@example.com')
    await user.click(screen.getByRole('button', { name: 'Continue' }))
    expect(await screen.findByText('Link sent. Check your email. No password needed.')).toBeInTheDocument()
    expect(auth.requestMagicLink).toHaveBeenCalledWith('ruth@example.com')
  })

  it('the email box has a way back to Google or the mobile number', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.click(await screen.findByRole('button', { name: 'Joined with an email? Use your email' }))
    await user.click(await screen.findByRole('button', { name: 'Use Google or your mobile number' }))
    expect(await screen.findByLabelText('Mobile number')).toBeInTheDocument()
  })

  it('an emailed link (?token=) is still consumed', async () => {
    auth.consumeToken.mockResolvedValue({ redirect_to: '/account', purpose: 'sign_in' })
    renderPage('/account/sign-in?token=abc')
    await waitFor(() => expect(auth.consumeToken).toHaveBeenCalledWith('abc'))
    expect(await screen.findByTestId('account-page')).toBeInTheDocument()
    expect(member.getSignInOptions).not.toHaveBeenCalled()
  })
})
