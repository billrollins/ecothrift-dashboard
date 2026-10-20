/**
 * The code screen (Join v2, owner 2026-10-19; rulebook J11): after "Send my code" from the sign-in or the join screen.
 * "Enter the 6-digit code we sent to …", a text's code or an email's (an email also carries a link, which may open in
 * another browser, so this screen takes the code and the member finishes where they started). It signs in by itself on
 * the sixth digit (`code/check/`). The words never say whether the contact is a member's.
 */
import { useEffect, useRef, useState } from 'react';
import { Box, ButtonBase, InputBase } from '@mui/material';
import { getSession, type EmailSignIn } from '../../../api/thriftPlusScanner.api';
import { maskContact } from './scannerLogic';
import { ErrorLine, Field, Primary, SmallLink, Sub, Title } from './signInParts';
import { sc, u } from './scannerTheme';
import { useSignIn } from './useThriftPlus';

/** What was sent: a sign-in or a join code, to the contact as typed, by text or email; `wait` is the seconds before "Send it again". */
export interface SentCode {
  kind: 'sign_in' | 'join';
  contact: string;
  channel: 'sms' | 'email';
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

/**
 * A code that is not a sign-in (Phone first, owner 2026-10-20: adding a mobile number to a signed-in member): the screen
 * hands the code and the resend to these instead of signing in.
 */
export interface OwnCode {
  /** The six digits; throws the words to show when they are wrong. */
  check: (code: string) => Promise<void>;
  /** Send the code again; throws the words to show (a `TOO_SOON` error carries `retryAfter`). */
  send: () => Promise<void>;
  /** The green button's words. */
  label: string;
}

export function CheckCode({ sent, onChange, onSignedIn, onResent, own }: {
  own?: OwnCode;
  sent: SentCode;
  /** "Change": back to the form, the contact kept. */
  onChange: () => void;
  /** Signed in: where to go next (a join finishes joining, then the Member QR). */
  onSignedIn: (r: EmailSignIn) => void;
  /** Sent again: the seconds until the next send is allowed. */
  onResent?: (seconds: number) => void;
}) {
  const auth = useSignIn();
  const [code, setCode] = useState('');
  const [err, setErr] = useState('');
  const [sends, setSends] = useState(1);
  const [until, setUntil] = useState(() => Date.now() + sent.wait * 1000);
  const [now, setNow] = useState(() => Date.now());
  const left = Math.max(0, Math.ceil((until - now) / 1000));
  const counting = sends < MAX_SENDS && left > 0;
  const byText = sent.channel === 'sms';
  // Texts cost money (owner 2026-10-19): one tap sends once.
  const resending = useRef(false);

  // The countdown reads the clock, so it stays right while the phone is in the email or messages app.
  useEffect(() => {
    if (!counting) return undefined;
    const t = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(t);
  }, [counting]);

  // The email's link tapped in another tab of this browser signed this phone in: carry on here too.
  const latest = useRef({ adopt: auth.adopt, onSignedIn, kind: sent.kind });
  latest.current = { adopt: auth.adopt, onSignedIn, kind: sent.kind };
  useEffect(() => {
    if (own) return undefined; // already signed in: nothing to adopt
    const onShow = () => {
      if (document.visibilityState !== 'visible') return;
      void getSession().then((s) => {
        if (s.status !== 'member') return;
        const { adopt, onSignedIn: next, kind } = latest.current;
        next({ ...s, purpose: kind === 'join' ? 'join' : 'sign_in' });
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

  const [checking, setChecking] = useState(false);
  const submit = async (value: string) => {
    if (value.length !== 6 || auth.check.isPending || checking) return;
    setErr('');
    try {
      if (own) {
        setChecking(true);
        await own.check(value);
      } else onSignedIn(await auth.check.mutateAsync({ contact: sent.contact, code: value }));
    } catch (e) {
      setErr(words(e, "That code didn't work. Check it and try again."));
    } finally {
      setChecking(false);
    }
  };

  const resend = async () => {
    if (resending.current) return;
    resending.current = true;
    setErr('');
    try {
      if (own) await own.send();
      else await auth.send.mutateAsync(sent.kind === 'join' ? { contact: sent.contact, first: sent.first, last: sent.last } : { contact: sent.contact });
      setSends((n) => n + 1);
      restart(RESEND_SECONDS);
      onResent?.(RESEND_SECONDS);
    } catch (e) {
      const p = e as { code?: string; retryAfter?: number };
      if (p.code === 'TOO_SOON') {
        restart(p.retryAfter ?? RESEND_SECONDS);
        onResent?.(p.retryAfter ?? RESEND_SECONDS);
      } else setErr(words(e, 'Could not send the code. Try again.'));
    } finally {
      resending.current = false;
    }
  };

  return (
    <Box
      component="form"
      data-testid="check-code"
      onSubmit={(e) => {
        e.preventDefault();
        void submit(code);
      }}
    >
      <Title>{byText ? 'Check your texts' : 'Check your email'}</Title>
      <Sub>
        <Box component="span" data-testid="sent-line">
          Enter the 6-digit code we sent to{' '}
          <Box component="span" data-testid="sent-to" sx={{ fontWeight: 700, color: sc.ink, overflowWrap: 'anywhere' }}>{maskContact(sent.contact)}</Box>.
          {byText ? '' : ' Or tap the link in the email on this phone.'}
        </Box>{' '}
        <SmallLink label="Change" onClick={onChange} sx={{ fontSize: u(29), verticalAlign: 'baseline' }} />
      </Sub>
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
      <Primary busy={auth.check.isPending || checking} disabled={code.length !== 6} label={own ? own.label : sent.kind === 'join' ? 'Continue' : 'Sign in'} />
      <Box data-testid="resend" sx={{ mt: u(26), textAlign: 'center', fontSize: u(28), color: sc.ink2, lineHeight: 1.4 }}>
        {sends >= MAX_SENDS ? (
          'Still nothing? Ask at any register.'
        ) : left > 0 ? (
          `Didn't get it? ${byText ? 'Send' : 'Check spam, or send'} again in ${clock(left)}`
        ) : (
          <ButtonBase
            type="button"
            disabled={auth.send.isPending}
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
