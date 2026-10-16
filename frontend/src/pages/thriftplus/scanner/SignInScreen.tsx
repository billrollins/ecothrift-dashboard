import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Box, ButtonBase, InputBase } from '@mui/material';
import VisibilityOffRounded from '@mui/icons-material/VisibilityOffRounded';
import VisibilityRounded from '@mui/icons-material/VisibilityRounded';
import type { SignInPurpose } from '../../../api/thriftPlusScanner.api';
import { CheckEmail, type SentEmail } from './CheckEmailScreen';
import { JoinForm } from './JoinScreen';
import { FieldBanner } from './ScannerTop';
import { ThriftPlusLogo, sc, u } from './scannerTheme';
import { EmailField, ErrorLine, Field, Primary, Secondary, SmallLink, Sub, Title } from './signInParts';
import { useSignIn } from './useThriftPlus';

type Mode = 'email' | 'staff' | 'join' | 'check';

/** Where the screen opens: email sign-in, the staff password form (Coming soon's "Staff sign in"), or Join (ecothrift.us/join). */
export type SignInStart = 'email' | 'staff' | 'join';

/**
 * Customer sign-in (owner 2026-10-15, APP D9; rulebook J8, J11): no passwords for members and no texts. "Email me a
 * link", then "Check your email" (the link, or the email's 6-digit code typed here). "Join Thrift+" takes a name and an
 * email the same way. "Staff sign in" opens the Dash email-and-password form: staff only (owner 2026-10-16, "the only
 * passwords are for staff"; a forgotten staff password is reset in Dash).
 * There is no Thrift+ card (owner 2026-10-14, APP D6). `notice` shows a failed link's words (`?signin=`).
 */
export function SignInScreen({ start = 'email', notice = '' }: { start?: SignInStart; notice?: string }) {
  const auth = useSignIn();
  const [params, setParams] = useSearchParams();
  const [mode, setMode] = useState<Mode>(start);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState<SentEmail | null>(null);
  const [err, setErr] = useState(notice);

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

  /** "Email me a link" from the sign-in or the join screen. */
  const send = async (kind: SentEmail['kind']) => {
    setErr('');
    const to = email.trim();
    try {
      if (kind === 'join') await auth.join.mutateAsync({ name, email: to });
      else await auth.email.mutateAsync(to);
      setSent({ kind, email: to, name, wait: 30 });
      setMode('check');
    } catch (e) {
      const p = e as { code?: string; retryAfter?: number };
      // One went to that address moments ago: wait for it (the same answer for any address).
      if (p.code === 'TOO_SOON') {
        setSent({ kind, email: to, name, wait: p.retryAfter ?? 30 });
        setMode('check');
      } else {
        setErr(e instanceof Error && e.message ? e.message : 'Could not send the email. Try again.');
      }
    }
  };

  /**
   * Signed in by the code: after a join, straight to the Member QR (it says "Finish joining at any register");
   * after a sign-in, the scanner (or the Member QR when they came from ecothrift.us/qr, which `view=qr` already asks).
   */
  const signedIn = (purpose: SignInPurpose) => {
    if (purpose !== 'join' && sent?.kind !== 'join') return;
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('view', 'qr');
      return next;
    }, { replace: true });
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
            <EmailForm email={email} onEmail={setEmail} busy={auth.email.isPending} onSend={() => void send('sign_in')} onStaff={() => go('staff')} />
          )}
          {mode === 'staff' && (
            <PasswordForm run={run} busy={auth.password.isPending} onBack={() => go('email')} />
          )}
          {mode === 'join' && (
            <JoinForm
              name={name}
              email={email}
              onName={setName}
              onEmail={setEmail}
              busy={auth.join.isPending}
              onSend={() => void send('join')}
              onSignIn={() => go('email')}
            />
          )}
          {mode === 'check' && sent && (
            <CheckEmail key={`${sent.kind}:${sent.email}`} sent={sent} onChange={() => go(sent.kind === 'join' ? 'join' : 'email')} onSignedIn={signedIn} />
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

/** Email sign-in (owner 2026-10-15, APP D9): the link and code by email; "Staff sign in" for the password form. */
function EmailForm({ email, onEmail, busy, onSend, onStaff }: {
  email: string;
  onEmail: (v: string) => void;
  busy: boolean;
  onSend: () => void;
  onStaff: () => void;
}) {
  return (
    <Box
      component="form"
      data-testid="email-sign-in"
      onSubmit={(e) => {
        e.preventDefault();
        onSend();
      }}
    >
      <Title>Sign in</Title>
      <Sub>Enter your email and we'll send you a link. No password needed.</Sub>
      <EmailField value={email} onChange={onEmail} />
      <Primary busy={busy} label="Email me a link" />
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
      {/* Back to "Email me a link" (owner 2026-10-15, APP D9). */}
      <Secondary label="Back" onClick={onBack} />
    </Box>
  );
}
