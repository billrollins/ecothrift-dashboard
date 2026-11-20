/**
 * A non-member receipt's QR, claimed from the phone site's shell (owner 2026-11-20, Dash Update #204): the token the
 * scanner kept is sent once the member has finished joining, the words show over the page, and it is sent only once.
 */
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { forgetReceiptClaim, rememberReceiptClaim } from '../../../../frontend/src/pages/thriftplus/scanner/receiptClaim'
import { _resetMember, publishSession } from '../lib/member'
import { ReceiptClaim } from './ReceiptClaim'

const TOKEN = '2N9ABCDEFGHIJKL'
const CLAIM = '/api/thriftplus/public/me/claim-receipt/'
let claimAnswer: { status: number; body: unknown } = { status: 200, body: {} }
let fetchMock: ReturnType<typeof vi.fn>

function member(ready: boolean) {
  return { status: 'member', member: { first_name: 'Cy', bucks_available: '0.00', ready, finish_steps: ready ? [] : ['selfie'] } }
}

beforeEach(() => {
  sessionStorage.clear()
  forgetReceiptClaim()
  claimAnswer = { status: 200, body: { added: '12.60', message: "12.60 ThriftBucks from today's trip are in your account." } }
  fetchMock = vi.fn((url: string) => {
    const a = url === CLAIM ? claimAnswer : { status: 200, body: member(true) }
    return Promise.resolve(new Response(JSON.stringify(a.body), { status: a.status, headers: { 'Content-Type': 'application/json' } }))
  })
  vi.stubGlobal('fetch', fetchMock)
  _resetMember()
})

afterEach(() => {
  vi.unstubAllGlobals()
  forgetReceiptClaim()
})

const claims = () => fetchMock.mock.calls.filter(([url]) => url === CLAIM)

describe('the receipt claim on the phone site (#204)', () => {
  it('waits until the join is finished, then claims once and says so', async () => {
    rememberReceiptClaim(TOKEN)
    render(<ReceiptClaim />)
    act(() => publishSession(member(false)))
    await new Promise((r) => setTimeout(r, 20))
    expect(claims()).toHaveLength(0) // a pending join collects nothing yet

    act(() => publishSession(member(true)))
    expect(await screen.findByText("12.60 ThriftBucks from today's trip are in your account.")).toBeInTheDocument()
    expect(screen.getByText('Use them from tomorrow.')).toBeInTheDocument()
    expect(claims()).toHaveLength(1)
    expect(JSON.parse(String(claims()[0][1].body))).toEqual({ token: TOKEN })
    expect(localStorage.getItem('tp-receipt-claim')).toBeNull() // used up

    await userEvent.click(screen.getByRole('button', { name: 'OK' }))
    expect(screen.queryByTestId('receipt-claim')).toBeNull()
    act(() => publishSession(member(true)))
    await new Promise((r) => setTimeout(r, 20))
    expect(claims()).toHaveLength(1)
  })

  it('claims a token kept after the member was already signed in (the scanner keeps it, the shell hears)', async () => {
    render(<ReceiptClaim />)
    act(() => publishSession(member(true)))
    await new Promise((r) => setTimeout(r, 20))
    expect(claims()).toHaveLength(0)
    act(() => {
      rememberReceiptClaim(TOKEN)
    })
    await waitFor(() => expect(claims()).toHaveLength(1))
  })

  it("shows a final refusal's words and drops the token; keeps it while the join is unfinished", async () => {
    claimAnswer = { status: 400, body: { code: 'NOT_FINISHED', detail: 'Finish joining first, then your ThriftBucks are added.' } }
    rememberReceiptClaim(TOKEN)
    const first = render(<ReceiptClaim />)
    act(() => publishSession(member(true)))
    await waitFor(() => expect(claims()).toHaveLength(1))
    expect(screen.queryByTestId('receipt-claim')).toBeNull()
    expect(localStorage.getItem('tp-receipt-claim')).not.toBeNull()
    first.unmount()

    claimAnswer = { status: 400, body: { code: 'TOO_LATE', detail: 'Receipts can be claimed only on the day of the sale.' } }
    render(<ReceiptClaim />)
    expect(await screen.findByText('Receipts can be claimed only on the day of the sale.')).toBeInTheDocument()
    expect(screen.queryByText('Use them from tomorrow.')).toBeNull()
    expect(localStorage.getItem('tp-receipt-claim')).toBeNull()
  })
})
