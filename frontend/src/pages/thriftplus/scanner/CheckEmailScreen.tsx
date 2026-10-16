/**
 * "Check your email" (owner 2026-10-15, APP D9; rulebook J11): after "Email me a link" from the sign-in or the join
 * screen. Every email carries a link and a 6-digit code. The phone may open the link in another browser (Mail, Gmail),
 * so this screen also takes the code and the member finishes where they started; it signs in by itself on the sixth
 * digit. The words never say whether the email is a member's.
 */
import { useEffect, useRef, useState } from 'react';
import { Box, ButtonBase, InputBase } from '@mui/material';
import { getSession, type SignInPurpose } from '../../../api/thriftPlusScanner.api';
import { ErrorLine, Field, Primary, SmallLink, Sub, Title } from './signInParts';
import { sc, u } from './scannerTheme';
import { useSignIn } from './useThriftPlus';

/** What was sent: a sign-in or a join email, to the email as typed; `wait` is the seconds before "Send it again". */
export interface SentEmail {
  kind: 'sign_in' | 'join';
  email: string;
  first: string;
  last: string;
  wait: number;
}

/** The first send and two more; then "Still nothing? Ask at any register." (the server allows 3 per 15 minutes). */
const MAX_SENDS = 3;
const RESEND_SECONDS = 30;

const clock = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;

function words(e: unknown, fallback: string): string {
  return e instanceof Error && e.message ? e.message : fallback;
}

export function CheckEmail({ sent, onChange, onSignedIn }: {
  sent: SentEmail;
  /** "Change": back to the form, the email kept. */
  onChange: () => void;
  /** Signed in: where to go next (a join opens the Member QR). */
  onSignedIn: (purpose: SignInPurpose) => void;
}) {
  const auth = useSignIn();
  const [code, setCode] = useState('');
  const [err, setErr] = useState('');
  const [sends, setSends] = useState(1);
  const [until, setUntil] = useState(() => Date.now() + sent.wait * 1000);
  const [now, setNow] = useState(() => Date.now());
  const left = Math.max(0, Math.ceil((until - now) / 1000));
  const counting = sends < MAX_SENDS && left > 0;
  const resending = auth.email.isPending || auth.join.isPending;

  // The countdown reads the clock, so it stays right while the phone is in the email app.
  useEffect(() => {
    if (!counting) return undefined;
    const t = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(t);
  }, [counting]);

  // The link tapped in another tab of this browser signed this phone in: carry on here too.
  const latest = useRef({ adopt: auth.adopt, onSignedIn, kind: sent.kind });
  latest.current = { adopt: auth.adopt, onSignedIn, kind: sent.kind };
  useEffect(() => {
    const onShow = () => {
      if (document.visibilityState !== 'visible') return;
      void getSession().then((s) => {
        if (s.status !== 'member') return;
        const { adopt, onSignedIn: next, kind } = latest.current;
        next(kind === 'join' ? 'join' : 'sign_in');
        adopt(s);
      }).catch(() => undefined);
    };
    document.addEventListener('visibilitychange', onShow);
    return () => document.removeEventListener('visibilitychange', onShow);
  }, []);

  const restart = (seconds: number) => {
    const t = Date.now();
    setNow(t);
    setUntil(t + seconds * 1000);
  };

  const submit = async (value: string) => {
    if (value.length !== 6 || auth.code.isPending) return;
    setErr('');
    try {
      const r = await auth.code.mutateAsync({ email: sent.email, code: value });
      onSignedIn(r.purpose);
    } catch (e) {
      setErr(words(e, "That code didn't work. Check it and try again."));
    }
  };

  const resend = async () => {
    setErr('');
    try {
      if (sent.kind === 'join') await auth.join.mutateAsync({ first: sent.first, last: sent.last, email: sent.email });
      else await auth.email.mutateAsync(sent.email);
      setSends((n) => n + 1);
      restart(RESEND_SECONDS);
    } catch (e) {
      const p = e as { code?: string; retryAfter?: number };
      if (p.code === 'TOO_SOON') restart(p.retryAfter ?? RESEND_SECONDS);
      else setErr(words(e, 'Could not send the email. Try again.'));
    }
  };

  return (
    <Box
      component="form"
      data-testid="check-email"
      onSubmit={(e) => {
        e.preventDefault();
        void submit(code);
      }}
    >
      <Title>Check your email</Title>
      <Sub>
        {sent.kind === 'join'
          ? "We've sent a link to confirm your email. Tap it on this phone, or type the code from the email."
          : "If that email belongs to a member, we've sent a link. Tap it on this phone, or type the code from the email."}
      </Sub>
      <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: u(12), mt: u(-12), mb: u(28) }}>
        <Box data-testid="sent-to" sx={{ fontSize: u(31), fontWeight: 700, color: sc.ink, minWidth: 0, overflowWrap: 'anywhere' }}>{sent.email}</Box>
        <SmallLink label="Change" onClick={onChange} sx={{ fontSize: u(29) }} />
      </Box>
      <Field>
        <InputBase
          autoFocus
          value={code}
          onChange={(e) => {
            const v = e.target.value.replace(/\D/g, '').slice(0, 6);
            const sixth = v.length === 6 && code.length < 6;
            setCode(v);
            if (err) setErr('');
            if (sixth) void submit(v);
          }}
          placeholder="6-digit code"
          inputProps={{ 'aria-label': '6-digit code', inputMode: 'numeric', autoComplete: 'one-time-code' }}
          sx={{
            flex: 1,
            fontFamily: sc.condensed,
            fontWeight: 700,
            fontSize: u(56),
            color: sc.ink,
            // Centred, with the last digit's spacing balanced on the left.
            '& input': { textAlign: 'center', letterSpacing: '0.3em', pl: '0.3em' },
            '& input::placeholder': { fontFamily: sc.font, fontWeight: 400, fontSize: u(32), letterSpacing: 'normal', color: sc.ink3, opacity: 1 },
          }}
        />
      </Field>
      {err && <ErrorLine>{err}</ErrorLine>}
      <Primary busy={auth.code.isPending} disabled={code.length !== 6} label="Sign in" />
      <Box data-testid="resend" sx={{ mt: u(26), textAlign: 'center', fontSize: u(28), color: sc.ink2, lineHeight: 1.4 }}>
        {sends >= MAX_SENDS ? (
          'Still nothing? Ask at any register.'
        ) : left > 0 ? (
          `Didn't get it? Check spam, or send again in ${clock(left)}`
        ) : (
          <ButtonBase
            type="button"
            disabled={resending}
            onClick={() => void resend()}
            sx={{ fontFamily: sc.font, fontSize: 'inherit', fontWeight: 700, color: sc.greenDeep, textDecoration: 'underline', px: u(12), py: u(6), borderRadius: u(10) }}
          >
            Send it again
          </ButtonBase>
        )}
      </Box>
    </Box>
  );
}
