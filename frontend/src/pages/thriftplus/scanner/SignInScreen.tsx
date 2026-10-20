import { useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Box, ButtonBase, InputBase } from '@mui/material';
import VisibilityOffRounded from '@mui/icons-material/VisibilityOffRounded';
import VisibilityRounded from '@mui/icons-material/VisibilityRounded';
import { readContact, type EmailSignIn } from '../../../api/thriftPlusScanner.api';
import { CheckCode, type SentCode } from './CheckEmailScreen';
import { GoogleButton } from './GoogleButton';
import { JoinForm } from './JoinScreen';
import { FieldBanner } from './ScannerTop';
import { viewAfterSignIn } from './scannerLogic';
import { ThriftPlusLogo, sc, u } from './scannerTheme';
import { ContactField, ErrorLine, Field, Primary, Secondary, SmallLink, Sub, Title, TextConsent } from './signInParts';
import { StoreQrScan } from './StoreQrScan';
import { useSignIn, useSignInOptions } from './useThriftPlus';

type Mode = 'email' | 'staff' | 'join' | 'check' | 'store';

/** Where the screen opens: customer sign-in, the staff password form (Coming soon's "Staff sign in"), or Join (ecothrift.us/join). */
export type SignInStart = 'email' | 'staff' | 'join';

/**
 * Customer sign-in (Join v2, owner 2026-10-19; rulebook J8, J11): no passwords for members. "Continue with Google", or
 * one "Phone or email" box and "Send my code", then the code screen (a text's code, or an email's code or link).
 * "Join Thrift+" takes a name the same way. "Staff sign in" opens the Dash email-and-password form: staff only (owner
 * 2026-10-16, "the only passwords are for staff"; a forgotten staff password is reset in Dash).
 * There is no Thrift+ card (owner 2026-10-14, APP D6). `notice` shows a failed link's words (`?signin=`).
 */
export function SignInScreen({ start = 'email', notice = '' }: { start?: SignInStart; notice?: string }) {
  const auth = useSignIn();
  const options = useSignInOptions();
  const phoneOn = options.data?.phone === true;
  const googleId = options.data?.google_client_id ?? null;
  const [params, setParams] = useSearchParams();
  const [mode, setMode] = useState<Mode>(start);
  const [first, setFirst] = useState('');
  const [last, setLast] = useState('');
  const [contact, setContact] = useState('');
  // "Joined with an email?": members from before phone-first (owner 2026-10-20) still sign in with their email.
  const [useEmail, setUseEmail] = useState(false);
  const [sent, setSent] = useState<SentCode | null>(null);
  const [err, setErr] = useState(notice);
  // Texts cost money (owner 2026-10-19): one tap sends once. Held while a send is in flight, and the last send's wait
  // is kept, so "Change" and "Send my code" again for the same contact go back to the code instead of sending again.
  const sending = useRef(false);
  const lastSend = useRef<{ key: string; until: number } | null>(null);

  const go = (next: Mode) => {
    setErr('');
    setMode(next);
  };

  const run = async (fn: () => Promise<unknown>) => {
    setErr('');
    try {
      await fn();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Try again.');
    }
  };

  /** "Send my code" from the sign-in or the join screen: a text to a phone number, an email to an email. */
  const send = async (kind: SentCode['kind']) => {
    setErr('');
    const typed = contact.trim();
    const read = readContact(typed);
    if (kind === 'join' && (!first.trim() || !last.trim())) {
      setErr('Enter your first and last name.');
      return;
    }
    if (!read || (read.kind === 'phone' && !phoneOn)) {
      setErr(phoneOn ? (useEmail ? 'Enter your email or a US mobile number.' : 'Enter a US mobile number.') : 'Check your email address.');
      return;
    }
    // Phone or Google (owner 2026-10-20). An email works only behind "Joined with an email?" on sign-in.
    if (phoneOn && read.kind === 'email' && !(useEmail && kind === 'sign_in')) {
      setErr('Enter your mobile number, or use Continue with Google.');
      return;
    }
    const guess: SentCode['channel'] = read.kind === 'phone' ? 'sms' : 'email';
    const key = `${kind}:${read.value}`;
    const waitLeft = lastSend.current?.key === key ? Math.ceil((lastSend.current.until - Date.now()) / 1000) : 0;
    if (waitLeft > 0) {
      setSent({ kind, contact: typed, channel: sent?.channel ?? guess, first, last, wait: waitLeft });
      setMode('check');
      return;
    }
    if (sending.current) return;
    sending.current = true;
    try {
      const r = await auth.send.mutateAsync(kind === 'join' ? { contact: typed, first, last } : { contact: typed });
      lastSend.current = { key, until: Date.now() + 30_000 };
      setSent({ kind, contact: typed, channel: r.channel ?? guess, first, last, wait: 30 });
      setMode('check');
    } catch (e) {
      const p = e as { code?: string; retryAfter?: number };
      // One went there moments ago: wait for it (the same answer for any contact).
      if (p.code === 'TOO_SOON') {
        const wait = p.retryAfter ?? 30;
        lastSend.current = { key, until: Date.now() + wait * 1000 };
        setSent({ kind, contact: typed, channel: guess, first, last, wait });
        setMode('check');
      } else {
        setErr(e instanceof Error && e.message ? e.message : 'Could not send the code. Try again.');
      }
    } finally {
      sending.current = false;
    }
  };

  /** The code screen sent it again: the new wait counts for "Send my code" too. */
  const resent = (seconds: number) => {
    if (lastSend.current) lastSend.current = { ...lastSend.current, until: Date.now() + seconds * 1000 };
  };

  /**
   * Signed in by the code or Google: a pending member with a selfie or a signature to do finishes joining
   * (`view=finish`); any other join opens the Member QR; a sign-in, the scanner (or the Member QR when they came from
   * ecothrift.us/qr, which `view=qr` already asks).
   */
  const signedIn = (r: EmailSignIn) => {
    const view = viewAfterSignIn(r, sent?.kind === 'join');
    if (!view) return;
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('view', view);
      return next;
    }, { replace: true });
  };

  /** Google's button handed back its ID token. */
  const google = async (credential: string) => {
    setErr('');
    try {
      signedIn(await auth.google.mutateAsync(credential));
    } catch (e) {
      setErr(e instanceof Error && e.message ? e.message : "Google didn't sign you in. Try again, or use your mobile number.");
    }
  };

  const scanWithoutSigningIn = () => {
    auth.guest.mutate();
    if (params.get('view') === 'join') {
      setParams((prev) => {
        const next = new URLSearchParams(prev);
        next.delete('view');
        return next;
      }, { replace: true });
    }
  };

  return (
    <Box sx={{ minHeight: '100%', display: 'flex', flexDirection: 'column', fontFamily: sc.font }}>
      <FieldBanner tall>
        <Box sx={{ position: 'absolute', left: u(56), bottom: u(96) }}>
          <ThriftPlusLogo width={u(420)} />
          <Box sx={{ color: '#fff', fontSize: u(36), fontWeight: 500, textShadow: '0 1px 6px rgba(0,0,0,0.5)', mt: u(10) }}>
            Scan any tag. See what you'd collect.
          </Box>
        </Box>
      </FieldBanner>

      <Box sx={{ px: u(36), mt: u(-60), position: 'relative', zIndex: 1 }}>
        <Box sx={{ bgcolor: sc.card, borderRadius: u(36), boxShadow: sc.tileShadow, border: '1px solid #ecede8', p: u(48) }}>
          {mode === 'email' && (
            <ContactForm
              contact={contact}
              onContact={setContact}
              phone={phoneOn}
              useEmail={useEmail}
              onUseEmail={() => {
                setErr('');
                setUseEmail((v) => !v);
              }}
              googleClientId={googleId}
              onGoogle={(c) => void google(c)}
              busy={auth.send.isPending || auth.google.isPending}
              onSend={() => void send('sign_in')}
              onStaff={() => go('staff')}
              onStoreQr={() => go('store')}
            />
          )}
          {/* The cashier's sign-in QR (owner 2026-10-20): the token goes in the address, and the page signs in. */}
          {mode === 'store' && (
            <StoreQrScan
              onClose={() => go('email')}
              onToken={(token) =>
                setParams((prev) => {
                  const next = new URLSearchParams(prev);
                  next.set('signin', token);
                  return next;
                }, { replace: true })
              }
            />
          )}
          {mode === 'staff' && (
            <PasswordForm run={run} busy={auth.password.isPending} onBack={() => go('email')} />
          )}
          {mode === 'join' && (
            <JoinForm
              first={first}
              last={last}
              contact={contact}
              onFirst={setFirst}
              onLast={setLast}
              onContact={setContact}
              phone={phoneOn}
              googleClientId={googleId}
              onGoogle={(c) => void google(c)}
              busy={auth.send.isPending || auth.google.isPending}
              onSend={() => void send('join')}
              onSignIn={() => go('email')}
            />
          )}
          {mode === 'check' && sent && (
            <CheckCode key={`${sent.kind}:${sent.contact}`} sent={sent} onChange={() => go(sent.kind === 'join' ? 'join' : 'email')} onSignedIn={signedIn} onResent={resent} />
          )}

          {err && <ErrorLine>{err}</ErrorLine>}
        </Box>

        <Box sx={{ textAlign: 'center', mt: u(44), mb: u(60) }}>
          {/* In place of "Not a member yet? Join free at the register." (owner 2026-10-15, APP D9). */}
          {mode !== 'join' && mode !== 'check' && (
            <>
              <Secondary outlined label="Join Thrift+" onClick={() => go('join')} />
              <Box sx={{ mt: u(14), fontSize: u(28), color: sc.ink2 }}>Free to join. Nothing owed.</Box>
            </>
          )}
          {/* "Non-member", never "guest", where a customer reads (APP D10). */}
          <ButtonBase
            onClick={scanWithoutSigningIn}
            sx={{ mt: u(22), px: u(36), py: u(18), borderRadius: 99, fontSize: u(33), fontWeight: 700, color: sc.priceGreen }}
          >
            Scan without signing in
          </ButtonBase>
        </Box>
      </Box>
    </Box>
  );
}

/**
 * Customer sign-in (Join v2, owner 2026-10-19): Google, or a code to a phone or an email; "Staff sign in" for the
 * password form.
 */
function ContactForm({ contact, onContact, phone, useEmail, onUseEmail, googleClientId, onGoogle, busy, onSend, onStaff, onStoreQr }: {
  contact: string;
  onContact: (v: string) => void;
  phone: boolean;
  useEmail: boolean;
  onUseEmail: () => void;
  googleClientId: string | null;
  onGoogle: (credential: string) => void;
  busy: boolean;
  onSend: () => void;
  onStaff: () => void;
  onStoreQr: () => void;
}) {
  return (
    <Box
      component="form"
      data-testid="sign-in-form"
      onSubmit={(e) => {
        e.preventDefault();
        onSend();
      }}
    >
      <Title>Sign in</Title>
      <Sub>No password needed.</Sub>
      {googleClientId && <GoogleButton clientId={googleClientId} joining={false} onCredential={onGoogle} />}
      <ContactField value={contact} onChange={onContact} phone={phone} allowEmail={useEmail} />
      <Primary busy={busy} label="Send my code" />
      {phone && <TextConsent />}
      {phone && (
        <Box sx={{ textAlign: 'center', mt: u(18) }}>
          <SmallLink
            label={useEmail ? 'Use my mobile number' : 'Joined with an email? Use your email'}
            onClick={onUseEmail}
          />
        </Box>
      )}
      {/* At the store (owner 2026-10-20): a cashier shows a sign-in QR on the Thrift+ Staff app. */}
      <Secondary label="At the store? Scan the store's sign-in QR" onClick={onStoreQr} />
      {/* Customers have no password (J11): the password form is for staff. */}
      <Box sx={{ textAlign: 'center', mt: u(22) }}>
        <SmallLink label="Staff sign in" onClick={onStaff} />
      </Box>
    </Box>
  );
}

function PasswordForm({ run, busy, onBack }: {
  run: (fn: () => Promise<unknown>) => void;
  busy: boolean;
  onBack: () => void;
}) {
  const auth = useSignIn();
  const [login, setLogin] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  return (
    <Box
      component="form"
      onSubmit={(e) => {
        e.preventDefault();
        run(() => auth.password.mutateAsync({ login, password }));
      }}
    >
      <Title>Staff sign in</Title>
      <Sub>Your Dash email and password.</Sub>
      <Field>
        <InputBase
          autoFocus
          value={login}
          onChange={(e) => setLogin(e.target.value)}
          placeholder="Email or username"
          inputProps={{ 'aria-label': 'Email or username', autoComplete: 'username', autoCapitalize: 'none', spellCheck: false, inputMode: 'email' }}
          sx={{ flex: 1, fontSize: 18 }}
        />
      </Field>
      <Field sx={{ mt: u(20) }}>
        <InputBase
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Password"
          type={show ? 'text' : 'password'}
          inputProps={{ 'aria-label': 'Password', autoComplete: 'current-password' }}
          sx={{ flex: 1, fontSize: 18 }}
        />
        <ButtonBase
          type="button"
          onClick={() => setShow((v) => !v)}
          aria-label={show ? 'Hide password' : 'Show password'}
          sx={{ borderRadius: 99, p: u(10), color: sc.ink3 }}
        >
          {show ? <VisibilityOffRounded /> : <VisibilityRounded />}
        </ButtonBase>
      </Field>
      <Primary busy={busy} label="Sign in" />
      {/* Back to the customer sign-in (owner 2026-10-15, APP D9). */}
      <Secondary label="Back" onClick={onBack} />
    </Box>
  );
}
