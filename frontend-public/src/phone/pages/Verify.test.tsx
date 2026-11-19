import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import Account from './Account'
import NotFound, { storeSearch } from './NotFound'
import SignIn from './SignIn'
import Verify, { landingFor } from './Verify'

const auth = vi.hoisted(() => ({ user: null as null | { id: number }, consumeToken: vi.fn() }))
vi.mock('../../auth', () => ({
  AuthProvider: ({ children }: { children: ReactNode }) => <>{children}</>,
  useAuth: () => auth,
}))

function Where() {
  const loc = useLocation()
  return <div data-testid="where">{loc.pathname + loc.search}</div>
}

function renderAt(url: string) {
  return render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/verify" element={<Verify />} />
        <Route path="/account/sign-in" element={<SignIn />} />
        <Route path="/account/*" element={<Account />} />
        <Route path="/missing" element={<NotFound />} />
        <Route path="*" element={<Where />} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  auth.user = null
})

describe('Verify', () => {
  it('lands on /thriftplus, except a hold or the shop (a full page load to the current site)', () => {
    expect(landingFor('/account')).toEqual(['/thriftplus', false])
    expect(landingFor('')).toEqual(['/thriftplus', false])
    expect(landingFor('/hold/abc123')).toEqual(['/hold/abc123', true])
    expect(landingFor('/checkout')).toEqual(['/checkout', true])
    expect(landingFor('//evil.example/hold')).toEqual(['/thriftplus', false])
    expect(landingFor('/holdings')).toEqual(['/thriftplus', false])
  })

  it('spends the token once and goes to /thriftplus', async () => {
    auth.consumeToken.mockResolvedValue({ redirect_to: '/account', purpose: 'sign_in', needs_password_prompt: false, user: null })
    renderAt('/verify?token=abc')
    expect(await screen.findByTestId('where')).toHaveTextContent('/thriftplus')
    expect(auth.consumeToken).toHaveBeenCalledWith('abc')
  })

  it('says so when the token is missing or refused', async () => {
    renderAt('/verify')
    expect(await screen.findByText('Missing confirmation token.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/scan')
  })

  it('shows the server reason for a spent link', async () => {
    auth.consumeToken.mockRejectedValue(new Error('Sign-in link invalid or expired'))
    renderAt('/verify?token=old')
    expect(await screen.findByText('Sign-in link invalid or expired')).toBeInTheDocument()
  })
})

describe('Sign in, account and not found', () => {
  it('sends sign-in to /scan with its query string, and account to /thriftplus', async () => {
    renderAt('/account/sign-in?next=%2Fthriftplus')
    expect(await screen.findByTestId('where')).toHaveTextContent('/scan?next=%2Fthriftplus')
  })

  it('sends any account page to /thriftplus', async () => {
    renderAt('/account/history')
    expect(await screen.findByTestId('where')).toHaveTextContent('/thriftplus')
  })

  it('searches the store from the not-found page', async () => {
    expect(storeSearch('  lamp shade ')).toBe('/store?q=lamp%20shade')
    expect(storeSearch('')).toBe('/store')
    renderAt('/missing')
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'chair' } })
    fireEvent.submit(screen.getByRole('search'))
    expect(await screen.findByTestId('where')).toHaveTextContent('/store?q=chair')
    expect(screen.queryByRole('link', { name: 'Back to home' })).toBeNull()
  })
})
