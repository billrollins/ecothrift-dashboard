/**
 * The Thrift+ member sign-in, from the website (Phase 3, owner 2026-10-20: the website matches the app): Continue with
 * Google, or a mobile number and the 6-digit text. These are the same endpoints the app uses
 * (`/api/thriftplus/public/…`, apps/thriftplus/public_views.py); a good code or Google answer also signs this site in
 * (the server sets the site's refresh cookie, "one account"), so the caller then asks the site for its user.
 */

const BASE = '/api/thriftplus/public'

/** What the server offers: Google only with a client id; the phone box only when texts can be sent. */
export type SignInOptions = { google_client_id: string | null; phone: boolean }

export class SignInProblem extends Error {
  code?: string
  retryAfter?: number
  constructor(message: string, code?: string, retryAfter?: number) {
    super(message)
    this.code = code
    this.retryAfter = retryAfter
  }
}

function waitWords(seconds: number | undefined): string {
  if (!seconds || seconds < 45) return 'in a moment'
  const minutes = Math.ceil(seconds / 60)
  return minutes === 1 ? 'in a minute' : `in ${minutes} minutes`
}

/** The app's own plain words for the answers people see (apps' PLAIN table); other codes keep the server's words. */
const PLAIN: Record<string, (retryAfter?: number) => string> = {
  MEMBERSHIP_OFF: () => 'This membership is not active. Ask at the register.',
  TOO_MANY: (s) => `Too many codes. Try again ${waitWords(s)}.`,
  LOCKED: (s) => `Too many tries. Try again ${waitWords(s)}.`,
  CONTACT_BAD: () => 'Enter a US mobile number.',
  PHONE_OFF: () => 'Texts are off right now. Use Google, or use your email.',
  GOOGLE_OFF: () => 'Google sign-in is off. Use your mobile number.',
  GOOGLE_BAD: () => "Google didn't sign you in. Try again, or use your mobile number.",
  TEXTS_OFF: () => 'Texts to this number are turned off. Use Google, or ask at the register.',
  CODE_BAD: () => "That code didn't work. Check it and try again.",
  CODE_EXPIRED: () => "That code didn't work. Check it and try again.",
}

async function post(path: string, body: unknown, fallback: string): Promise<Record<string, unknown>> {
  let res: Response
  try {
    res = await fetch(`${BASE}${path}`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify(body),
    })
  } catch {
    throw new SignInProblem('Could not reach the store. Check your signal and try again.')
  }
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>
  if (res.ok) return data
  const code = typeof data.code === 'string' ? data.code : undefined
  const wait = Number(data.retry_after ?? res.headers.get('Retry-After'))
  const retryAfter = Number.isFinite(wait) && wait > 0 ? Math.ceil(wait) : undefined
  const plain = code ? PLAIN[code] : undefined
  if (plain) throw new SignInProblem(plain(retryAfter), code, retryAfter)
  throw new SignInProblem(typeof data.detail === 'string' && data.detail ? data.detail : fallback, code, retryAfter)
}

/** The ways in. Unreachable or older: none (the page falls back to the email form). */
export async function getSignInOptions(): Promise<SignInOptions> {
  try {
    const res = await fetch(`${BASE}/sign-in-options/`, { credentials: 'include', headers: { Accept: 'application/json' } })
    const data = (await res.json()) as Partial<SignInOptions>
    return { google_client_id: data.google_client_id || null, phone: data.phone === true }
  } catch {
    return { google_client_id: null, phone: false }
  }
}

/** "Send my code": a text to a mobile number. The same answer whether or not the number is a member's. */
export async function sendCode(contact: string): Promise<void> {
  await post('/code/send/', { contact: contact.trim() }, 'Could not send the code. Try again.')
}

/** The 6-digit code from the text: signs in (to Thrift+ and, by the server's cookie, to this site). */
export async function checkCode(contact: string, code: string): Promise<void> {
  await post('/code/check/', { contact: contact.trim(), code: code.trim() }, "That code didn't work. Check it and try again.")
}

/** "Continue with Google": Google's ID token. A new Google email joins Thrift+ (the app then asks for a phone). */
export async function signInWithGoogle(credential: string): Promise<void> {
  await post('/google/', { credential }, "Google didn't sign you in. Try again, or use your mobile number.")
}
