/**
 * Join Thrift+ (Join v2, owner 2026-10-19: "SMOOTH and CLEAR and SIMPLE"), as live (`JoinScreen.tsx`): Google, or a
 * name and a phone. The code signs them in; then a selfie and "I agree" in the app (piece S2). Opened from "Join
 * Thrift+" on the sign-in screen, or straight from ecothrift.us/join (`/scan?view=join`).
 *
 * Owner 2026-10-16: the two steps in the customer's order (now, then at the store), and one closing line. The words are
 * the live screen's, word for word, including step 2 (coordinator's call 4: fixes go through the owner).
 */
import { Button, Field } from '../ui'
import { GoogleButton } from './GoogleButton'
import { ContactField, Head, Msg, SmallLink, TERMS_URL, TextConsent } from './parts'

/** One numbered line: step 1 (now) and step 2 (at the store) look alike. */
function Step({ n, lead, text, testId }: { n: number; lead: string; text: string; testId: string }) {
  return (
    <div className="si-step" data-testid={testId}>
      <span className="si-n" aria-hidden="true">{n}</span>
      <span>
        <b>{lead}</b> {text}
      </span>
    </div>
  )
}

/** "Google or your phone" (owner 2026-10-20: phone or Google, no email); email only while texts are off. */
export function ways(google: boolean, phone: boolean): string {
  const list = [...(google ? ['Google'] : []), phone ? 'your phone' : 'your email']
  return list.length === 1 ? list[0] : `${list.slice(0, -1).join(', ')} or ${list[list.length - 1]}`
}

export function JoinForm({ known, first, last, contact, onFirst, onLast, onContact, phone, googleClientId, onGoogle, busy, onSend, onSignIn, err }: {
  /** The ways in (sign-in-options/) have come: until then the form's space is kept, empty. */
  known: boolean
  first: string
  last: string
  contact: string
  onFirst: (v: string) => void
  onLast: (v: string) => void
  onContact: (v: string) => void
  /** Texts are on: the box takes a phone number. */
  phone: boolean
  /** Null: no Google button. */
  googleClientId: string | null
  onGoogle: (credential: string) => void
  busy: boolean
  onSend: () => void
  onSignIn: () => void
  err: string
}) {
  return (
    <form
      className="si-screen"
      data-testid="join-form"
      onSubmit={(e) => {
        e.preventDefault()
        onSend()
      }}
    >
      <Head
        title={
          <>
            Join <em>Thrift+</em>
          </>
        }
        sub="Free. Two quick steps."
      />
      <div className="si-body">
        {known ? null : (
          <div className="si-wait si-wait-join" data-testid="sign-in-waiting">
            <Msg>{err}</Msg>
          </div>
        )}
        {known ? (
          <>
            <div className="si-steps">
              <Step n={1} lead="Now:" text={`your name, then ${ways(!!googleClientId, phone)}.`} testId="join-step-now" />
              <Step n={2} lead="At the store:" text="show your QR and your photo ID. That's it." testId="join-step-store" />
            </div>

            {googleClientId ? <GoogleButton clientId={googleClientId} joining onCredential={onGoogle} /> : null}
            {/* Owner 2026-10-16: first and last name, both required, the same for every way in. */}
            <div className="si-names">
              <Field
                className="si-field si-field-text"
                label="First name"
                value={first}
                onChange={(e) => onFirst(e.target.value)}
                required
                autoComplete="given-name"
                autoCapitalize="words"
              />
              <Field
                className="si-field si-field-text"
                label="Last name"
                value={last}
                onChange={(e) => onLast(e.target.value)}
                required
                autoComplete="family-name"
                autoCapitalize="words"
              />
            </div>
            <ContactField value={contact} onChange={onContact} phone={phone} />
            <Msg>{err}</Msg>
            <Button type="submit" kind="ink" wide className="si-go" pending={busy}>
              <span>Send my code</span>
            </Button>
            {phone ? <TextConsent /> : null}

            <p className="si-close">That&apos;s all it takes to collect ThriftBucks and get 3-day returns.</p>
            <p className="si-terms">
              Thrift+ terms:{' '}
              <a href={TERMS_URL} target="_blank" rel="noopener" data-testid="join-terms">
                ecothrift.us/terms
              </a>
            </p>
            <SmallLink label="Already a member? Sign in" onClick={onSignIn} className="si-alt" />
          </>
        ) : null}
      </div>
    </form>
  )
}
