import { useEffect, useRef, useState, type FormEvent } from 'react'
import {
  ApiError,
  changeHoldEmail,
  confirmHoldCode,
  createHoldConfirmation,
  type HoldSummary,
} from '../../api'
import CodeInput from '../../components/CodeInput'
import { useResendCooldown } from '../../lib/cooldown'
import { useConfirmationPolling } from '../../lib/useConfirmationPolling'
import { HoldShell, ItemCard } from './shared'

type Props = {
  hold: HoldSummary
  onHoldUpdate: (next: HoldSummary) => void
  onConfirmed: (next: HoldSummary, announcement: string) => void
  linkExpired?: boolean
  relinked?: boolean
}

function apiData(err: unknown): Record<string, unknown> {
  if (err instanceof ApiError && err.data && typeof err.data === 'object') {
    return err.data as Record<string, unknown>
  }
  return {}
}

export default function HoldRequestedScreen({
  hold,
  onHoldUpdate,
  onConfirmed,
  linkExpired = false,
  relinked = false,
}: Props) {
  const { secondsLeft, arm, cooling } = useResendCooldown(hold.status_token)
  const [code, setCode] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [resending, setResending] = useState(false)
  const [attemptsLeft, setAttemptsLeft] = useState(
    typeof hold.attempts_remaining === 'number' ? hold.attempts_remaining : 5,
  )
  const [codeExpired, setCodeExpired] = useState(() => {
    if (linkExpired) return true
    if (!hold.code_expires_at) return !hold.has_active_confirmation
    return Date.parse(hold.code_expires_at) <= Date.now()
  })
  const [msg, setMsg] = useState<string | null>(
    relinked ? 'A fresh code is already on its way.' : null,
  )
  const [wrongOpen, setWrongOpen] = useState(false)
  const [emailDraft, setEmailDraft] = useState(hold.email || '')
  const [savingEmail, setSavingEmail] = useState(false)
  const issuedRef = useRef(false)

  const locked = attemptsLeft <= 0

  // Issue a confirmation on load when none is active (e.g. expired or first visit
  // without a create-side send). Skip when the hold already has an active row.
  useEffect(() => {
    if (issuedRef.current) return
    if (hold.has_active_confirmation && !linkExpired) {
      const serverCooldown = hold.resend_available_in
      if (typeof serverCooldown === 'number' && serverCooldown > 0) {
        arm(serverCooldown)
      }
      return
    }
    issuedRef.current = true
    let active = true
    setResending(true)
    createHoldConfirmation(hold.status_token)
      .then((data) => {
        if (!active) return
        setCodeExpired(false)
        setAttemptsLeft(
          typeof data.attempts_remaining === 'number' ? data.attempts_remaining : 5,
        )
        arm(data.resend_available_in ?? 60)
        setMsg(data.detail || 'Code sent.')
        onHoldUpdate({
          ...hold,
          has_active_confirmation: true,
          code_expires_at: data.code_expires_at ?? hold.code_expires_at,
          attempts_remaining: data.attempts_remaining ?? hold.attempts_remaining,
          resend_available_in: data.resend_available_in ?? 60,
        })
      })
      .catch((err) => {
        if (!active) return
        const data = apiData(err)
        if (err instanceof ApiError && err.status === 429) {
          const retry = Number(data.retry_after_seconds || 60)
          arm(Number.isFinite(retry) ? retry : 60)
          setMsg('A code was just sent. Try again shortly.')
          return
        }
        setMsg(err instanceof Error ? err.message : 'Could not send code')
      })
      .finally(() => {
        if (active) setResending(false)
      })
    return () => {
      active = false
    }
    // Intentionally once per status_token mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hold.status_token])

  useConfirmationPolling({
    token: hold.status_token,
    enabled: true,
    expiresAt: hold.expires_at,
    onConfirmed: async (heldUntil) => {
      try {
        const { fetchHold } = await import('../../api')
        const next = await fetchHold(hold.status_token)
        const until =
          next.expires_label ||
          (heldUntil ? 'your new deadline' : 'your hold window')
        onConfirmed(next, `Confirmed. We're holding it until ${until}.`)
      } catch {
        /* parent poll path will retry via refetch if needed */
      }
    },
  })

  const submitCode = async (digits: string) => {
    if (submitting || locked || codeExpired) return
    const normalized = digits.replace(/\D/g, '').trim()
    if (normalized.length !== 6) {
      setMsg('Enter the 6-digit code from your email.')
      return
    }
    setSubmitting(true)
    setMsg(null)
    try {
      const next = await confirmHoldCode(hold.status_token, normalized)
      const until = next.expires_label || next.held_until || 'your hold window'
      onConfirmed(next, `Confirmed. We're holding it until ${until}.`)
    } catch (err) {
      const data = apiData(err)
      if (typeof data.attempts_remaining === 'number') {
        setAttemptsLeft(data.attempts_remaining)
      }
      if (err instanceof ApiError && (err.status === 429 || data.locked)) {
        setAttemptsLeft(0)
        setMsg('Too many attempts. Request a fresh code.')
      } else {
        setMsg(err instanceof Error ? err.message : 'That code does not match.')
      }
      setCode('')
    } finally {
      setSubmitting(false)
    }
  }

  const onResend = async () => {
    if (cooling || resending) return
    setResending(true)
    setMsg(null)
    try {
      const data = await createHoldConfirmation(hold.status_token)
      setCodeExpired(false)
      setAttemptsLeft(
        typeof data.attempts_remaining === 'number' ? data.attempts_remaining : 5,
      )
      setCode('')
      arm(data.resend_available_in ?? 60)
      setMsg(data.detail || 'Code sent.')
      onHoldUpdate({
        ...hold,
        has_active_confirmation: true,
        code_expires_at: data.code_expires_at ?? null,
        attempts_remaining: data.attempts_remaining ?? 5,
        resend_available_in: data.resend_available_in ?? 60,
      })
    } catch (err) {
      const data = apiData(err)
      if (err instanceof ApiError && err.status === 429) {
        const retry = Number(data.retry_after_seconds || 60)
        arm(Number.isFinite(retry) ? retry : 60)
        setMsg('A code was just sent. Try again shortly.')
      } else {
        setMsg(err instanceof Error ? err.message : 'Could not resend')
      }
    } finally {
      setResending(false)
    }
  }

  const onChangeEmail = async (e: FormEvent) => {
    e.preventDefault()
    if (!emailDraft.trim() || savingEmail) return
    setSavingEmail(true)
    setMsg(null)
    try {
      const next = await changeHoldEmail(hold.status_token, emailDraft.trim())
      onHoldUpdate(next)
      setCodeExpired(false)
      setAttemptsLeft(
        typeof next.attempts_remaining === 'number' ? next.attempts_remaining : 5,
      )
      setCode('')
      arm(60)
      setWrongOpen(false)
      setMsg('Code sent to the new address.')
    } catch (err) {
      const data = apiData(err)
      if (err instanceof ApiError && err.status === 429) {
        const retry = Number(data.retry_after_seconds || 60)
        arm(Number.isFinite(retry) ? retry : 60)
        setMsg('A code was just sent. Try again shortly.')
      } else {
        setMsg(err instanceof Error ? err.message : 'Could not update email')
      }
    } finally {
      setSavingEmail(false)
    }
  }

  const doNothing = hold.do_nothing_label || 'We release it at store close today'
  const ifConfirmed = hold.if_confirmed_label || 'We hold it until 3 more open days'

  return (
    <HoldShell hold={hold}>
      <h1 className="holdflow__h1">{hold.headline}</h1>
      <p className="holdflow__status">{hold.customer_status}</p>

      {codeExpired ? (
        <div className="holdflow__expired">
          <p className="holdflow__next">That code expired. We can send a new one.</p>
          <button
            type="button"
            className="btn btn--primary btn--wide"
            disabled={cooling || resending}
            onClick={onResend}
          >
            {cooling
              ? `Resend in ${secondsLeft}s`
              : resending
                ? 'Sending…'
                : 'Send a new code'}
          </button>
        </div>
      ) : (
        <>
          <div className="outcomes">
            <div className="outcome">
              <div className="outcome__label">If you do nothing</div>
              <div className="outcome__value">{doNothing}</div>
            </div>
            <div className="outcome outcome--good">
              <div className="outcome__label">If you enter the code</div>
              <div className="outcome__value">{ifConfirmed}</div>
            </div>
          </div>

          {locked ? (
            <div className="holdflow__locked">
              <p className="holdflow__next">
                That code was tried too many times. Request a fresh code to keep going.
              </p>
              <button
                type="button"
                className="btn btn--primary btn--wide"
                disabled={cooling || resending}
                onClick={onResend}
              >
                {cooling
                  ? `Resend in ${secondsLeft}s`
                  : resending
                    ? 'Sending…'
                    : 'Send a new code'}
              </button>
            </div>
          ) : (
            <form
              className="coderow"
              onSubmit={(e) => {
                e.preventDefault()
                void submitCode(code)
              }}
            >
              <CodeInput
                value={code}
                onChange={setCode}
                onComplete={(digits) => void submitCode(digits)}
                disabled={submitting || locked}
                autoFocus
              />
              <button
                type="submit"
                className="btn btn--primary btn--wide"
                disabled={submitting || code.length !== 6}
              >
                {submitting ? 'Confirming…' : 'Keep it 3 more days'}
              </button>
            </form>
          )}

          {!wrongOpen ? (
            <p className="holdflow__sentline">
              Sent to {hold.email || 'you'}
              {' · '}
              {!locked ? (
                <>
                  <button
                    type="button"
                    className="txt"
                    disabled={cooling || resending}
                    onClick={onResend}
                  >
                    {cooling
                      ? `Resend in ${secondsLeft}s`
                      : resending
                        ? 'Sending…'
                        : 'Resend code'}
                  </button>
                  {' · '}
                </>
              ) : null}
              <button
                type="button"
                className="txt"
                onClick={() => {
                  setEmailDraft(hold.email || '')
                  setWrongOpen(true)
                }}
              >
                Use a different address
              </button>
            </p>
          ) : (
            <form className="holdflow__emailform" onSubmit={onChangeEmail}>
              <label className="field">
                <span>Email</span>
                <input
                  type="email"
                  required
                  value={emailDraft}
                  onChange={(e) => setEmailDraft(e.target.value)}
                  disabled={savingEmail}
                  autoFocus
                />
              </label>
              <button className="btn btn--primary btn--wide" type="submit" disabled={savingEmail}>
                {savingEmail ? 'Sending…' : 'Send to this address'}
              </button>
              <button
                type="button"
                className="btn btn--ghost"
                onClick={() => setWrongOpen(false)}
                disabled={savingEmail}
              >
                Cancel
              </button>
            </form>
          )}
        </>
      )}

      <div className="holdflow__live" aria-live="polite">
        {msg || ''}
      </div>

      <ItemCard hold={hold} />
    </HoldShell>
  )
}
