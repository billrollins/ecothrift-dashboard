/**
 * A non-member receipt's QR, claimed (owner 2026-11-20, Dash Update #204, rulebook B15). On every page of the phone
 * site, because a signed-in member is handed from /scan to /thriftplus at once: scan/ScanApp.tsx keeps the token from
 * `?claim=` (the live scanner's receiptClaim.ts, shared), and once the member has finished joining this sends it and
 * shows "12.60 ThriftBucks from today's trip are in your account." as a fixed overlay (nothing below it moves).
 * The live scanner's twin: frontend/src/pages/thriftplus/scanner/ReceiptClaimNote.tsx.
 */
import { useEffect, useRef, useState } from 'react'
import {
  CLAIM_EVENT,
  forgetReceiptClaim,
  keepAfterRefusal,
  pendingReceiptClaim,
} from '../../../../frontend/src/pages/thriftplus/scanner/receiptClaim'
import { fetchSession, previewHeader, useMember } from '../lib/member'

const CLAIM_URL = '/api/thriftplus/public/me/claim-receipt/'
const FALLBACK = 'Your ThriftBucks could not be added. Ask at the register.'

type Note = { ok: boolean; text: string }

/** One try: `{ok, text}` to show, or null when the token is kept for later (not finished joining yet, or offline). */
async function claim(token: string): Promise<Note | null> {
  let r: Response
  try {
    r = await fetch(CLAIM_URL, {
      method: 'POST',
      credentials: 'include',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json', ...previewHeader() },
      body: JSON.stringify({ token }),
    })
  } catch {
    return null // offline: tried again on the next page load
  }
  let body: { message?: unknown; detail?: unknown; code?: unknown } = {}
  try {
    body = await r.json()
  } catch {
    body = {}
  }
  if (r.ok) {
    forgetReceiptClaim()
    return { ok: true, text: typeof body.message === 'string' ? body.message : "Today's ThriftBucks are in your account." }
  }
  const code = typeof body.code === 'string' ? body.code : undefined
  if (r.status === 429 || keepAfterRefusal(code)) return null
  forgetReceiptClaim()
  return { ok: false, text: typeof body.detail === 'string' && body.detail ? body.detail : FALLBACK }
}

export function ReceiptClaim() {
  const { status, member } = useMember()
  const ready = status === 'member' && member?.ready === true
  const [kept, setKept] = useState(0)
  const [note, setNote] = useState<Note | null>(null)
  const busy = useRef(false)

  useEffect(() => {
    const heard = () => setKept((n) => n + 1)
    window.addEventListener(CLAIM_EVENT, heard)
    return () => window.removeEventListener(CLAIM_EVENT, heard)
  }, [])

  useEffect(() => {
    if (!ready || busy.current) return
    const token = pendingReceiptClaim()
    if (!token) return
    busy.current = true
    void claim(token)
      .then((n) => {
        if (!n) return
        setNote(n)
        if (n.ok) void fetchSession() // the new ThriftBucks in the top bar and the Bucks view
      })
      .finally(() => {
        busy.current = false
      })
  }, [ready, kept])

  if (!note) return null
  return (
    <div className={note.ok ? 'rc ok' : 'rc'} role="status" data-testid="receipt-claim">
      <div className="rc-text">
        <strong>{note.text}</strong>
        {note.ok ? <span>Use them from tomorrow.</span> : null}
      </div>
      <button type="button" className="rc-ok" onClick={() => setNote(null)}>
        OK
      </button>
    </div>
  )
}
