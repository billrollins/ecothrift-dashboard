/**
 * The code screen (Join v2, owner 2026-10-19; rulebook J11), as live (`CheckEmailScreen.tsx`): after "Send my code" from
 * the sign-in, the join or the add-phone screen. "Enter the 6-digit code we sent to …", a text's code or an email's (an
 * email also carries a link, which may open in another browser, so this screen takes the code and the member finishes
 * where they started). It signs in by itself on the sixth digit (`code/check/`). The first send and two more, 30 seconds
 * apart; then "Still nothing? Ask at any register." The words never say whether the contact is a member's.
 *
 * Coming back to this tab after the email's link signed the phone in elsewhere: the store asks `session/` again
 * (`reloadSession`), the answer lands in the store by itself, and the screen carries on as if the code had been typed.
 */
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { maskContact, type EmailSignIn } from '../core'
import { actions, getScanState, useAction } from '../store'
import { Button } from '../ui'
import { Head, Msg, SmallLink } from './parts'

/** What was sent: a sign-in or a join code, to the contact as typed, by text or email; `wait` is the seconds before "Send it again". */
export interface SentCode {
  kind: 'sign_in' | 'join'
  contact: string
  channel: 'sms' | 'email'
  first: string
  last: string
  wait: number
}

/** The first send and two more; then "Still nothing? Ask at any register." (the server allows 3 per 15 minutes). */
export const MAX_SENDS = 3
export const RESEND_SECONDS = 30

const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`

function words(e: unknown, fallback: string): string {
  return e instanceof Error && e.message ? e.message : fallback
}

/**
 * A code that is not a sign-in (Phone first, owner 2026-10-20: adding a mobile number to a signed-in member): the screen
 * hands the code and the resend to these instead of signing in.
 */
export interface OwnCode {
  /** The six digits; throws the words to show when they are wrong. */
  check: (code: string) => Promise<void>
  /** Send the code again; throws the words to show (a `TOO_SOON` error carries `retryAfter`). */
  send: () => Promise<void>
  /** The button's words. */
  label: string
}

export function CheckCode({ sent, onChange, onSignedIn, onResent, own, aside }: {
  own?: OwnCode
  sent: SentCode
  /** "Change": back to the form, the contact kept. */
  onChange: () => void
  /** Signed in: where to go next (a join finishes joining, then the Member QR). */
  onSignedIn: (r: EmailSignIn) => void
  /** Sent again: the seconds until the next send is allowed. */
  onResent?: (seconds: number) => void
  /** The header's right side (Add your mobile number: "Sign out"). */
  aside?: ReactNode
}) {
  const check = useAction(actions.checkCode)
  const resendAction = useAction(actions.sendCode)
  const [code, setCode] = useState('')
  const [err, setErr] = useState('')
  const [sends, setSends] = useState(1)
  const [until, setUntil] = useState(() => Date.now() + sent.wait * 1000)
  const [now, setNow] = useState(() => Date.now())
  const left = Math.max(0, Math.ceil((until - now) / 1000))
  const counting = sends < MAX_SENDS && left > 0
  const byText = sent.channel === 'sms'
  // Texts cost money (owner 2026-10-19): one tap sends once.
  const resending = useRef(false)
  const [resendBusy, setResendBusy] = useState(false)

  // The countdown reads the clock, so it stays right while the phone is in the email or messages app.
  useEffect(() => {
    if (!counting) return undefined
    const t = window.setInterval(() => setNow(Date.now()), 250)
    return () => window.clearInterval(t)
  }, [counting])

  // The email's link tapped in another tab of this browser signed this phone in: carry on here too.
  const latest = useRef({ onSignedIn, kind: sent.kind })
  latest.current = { onSignedIn, kind: sent.kind }
  useEffect(() => {
    if (own) return undefined // already signed in: nothing to take over
    const onShow = () => {
      if (document.visibilityState !== 'visible') return
      const before = getScanState().session?.status
      void actions
        .reloadSession()
        .then(() => {
          const s = getScanState().session
          if (!s || s.status !== 'member' || before === 'member') return
          const { onSignedIn: next, kind } = latest.current
          next({ ...s, purpose: kind === 'join' ? 'join' : 'sign_in' })
        })
        .catch(() => undefined)
    }
    document.addEventListener('visibilitychange', onShow)
    return () => document.removeEventListener('visibilitychange', onShow)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const restart = (seconds: number) => {
    const t = Date.now()
    setNow(t)
    setUntil(t + seconds * 1000)
  }

  const [checking, setChecking] = useState(false)
  const submit = async (value: string) => {
    if (value.length !== 6 || check.pending || checking) return
    setErr('')
    try {
      if (own) {
        setChecking(true)
        await own.check(value)
      } else onSignedIn(await check.run({ contact: sent.contact, code: value }))
    } catch (e) {
      setErr(words(e, "That code didn't work. Check it and try again."))
    } finally {
      setChecking(false)
    }
  }

  const resend = async () => {
    if (resending.current) return
    resending.current = true
    setResendBusy(true)
    setErr('')
    try {
      if (own) await own.send()
      else await resendAction.run(sent.kind === 'join' ? { contact: sent.contact, first: sent.first, last: sent.last } : { contact: sent.contact })
      setSends((n) => n + 1)
      restart(RESEND_SECONDS)
      onResent?.(RESEND_SECONDS)
    } catch (e) {
      const p = e as { code?: string; retryAfter?: number }
      if (p.code === 'TOO_SOON') {
        restart(p.retryAfter ?? RESEND_SECONDS)
        onResent?.(p.retryAfter ?? RESEND_SECONDS)
      } else setErr(words(e, 'Could not send the code. Try again.'))
    } finally {
      resending.current = false
      setResendBusy(false)
    }
  }

  return (
    <form
      className="si-screen"
      data-testid="check-code"
      onSubmit={(e) => {
        e.preventDefault()
        void submit(code)
      }}
    >
      <Head title={byText ? 'Check your texts' : 'Check your email'} aside={aside} />
      <div className="si-body">
        <p className="si-lead">
          <span data-testid="sent-line">
            Enter the 6-digit code we sent to{' '}
            <b data-testid="sent-to" className="si-to">{maskContact(sent.contact)}</b>.
            {byText ? null : <span> Or tap the link in the email on this phone.</span>}
          </span>{' '}
          <SmallLink label="Change" onClick={onChange} className="si-inline" />
        </p>
        <div className="sa-field si-field si-code">
          <label htmlFor="si-code-input">6-digit code</label>
          <input
            id="si-code-input"
            autoFocus
            value={code}
            onChange={(e) => {
              const v = e.target.value.replace(/\D/g, '').slice(0, 6)
              const sixth = v.length === 6 && code.length < 6
              setCode(v)
              if (err) setErr('')
              if (sixth) void submit(v)
            }}
            placeholder="000000"
            inputMode="numeric"
            autoComplete="one-time-code"
            aria-invalid={err ? true : undefined}
          />
        </div>
        <Msg>{err}</Msg>
        <Button
          type="submit"
          kind="ink"
          wide
          className="si-go"
          pending={check.pending || checking}
          disabled={code.length !== 6}
        >
          <span>{own ? own.label : sent.kind === 'join' ? 'Continue' : 'Sign in'}</span>
        </Button>
        <div className="si-resend" data-testid="resend">
          {sends >= MAX_SENDS ? (
            <span>Still nothing? Ask at any register.</span>
          ) : left > 0 ? (
            <span>{`Didn't get it? ${byText ? 'Send' : 'Check spam, or send'} again in ${clock(left)}`}</span>
          ) : (
            <button type="button" className="si-again" disabled={resendBusy} onClick={() => void resend()}>
              Send it again
            </button>
          )}
        </div>
      </div>
    </form>
  )
}
