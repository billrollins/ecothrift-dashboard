import { useState } from 'react';
import { Box, ButtonBase, CircularProgress, InputBase } from '@mui/material';
import QrCodeScannerRounded from '@mui/icons-material/QrCodeScannerRounded';
import VisibilityOffRounded from '@mui/icons-material/VisibilityOffRounded';
import VisibilityRounded from '@mui/icons-material/VisibilityRounded';
import { FieldBanner } from './ScannerTop';
import { ThriftPlusLogo, sc, u } from './scannerTheme';
import { useQrCamera } from './useQrCamera';
import { useSignIn } from './useThriftPlus';

type Mode = 'password' | 'forgot' | 'card';

/**
 * Customer sign-in: email or username and password (email always works),
 * "Forgot password?" by email, or scan the Thrift+ card with the phone's last
 * 4 digits as the check. Mock: any login works; nothing is emailed.
 */
export function SignInScreen() {
  const auth = useSignIn();
  const [mode, setMode] = useState<Mode>('password');
  const [err, setErr] = useState('');

  const run = async (fn: () => Promise<unknown>) => {
    setErr('');
    try {
      await fn();
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Try again.');
    }
  };

  return (
    <Box sx={{ minHeight: '100%', display: 'flex', flexDirection: 'column', fontFamily: sc.font }}>
      <FieldBanner tall>
        <Box sx={{ position: 'absolute', left: u(56), bottom: u(96) }}>
          <ThriftPlusLogo width={u(420)} />
          <Box sx={{ color: '#fff', fontSize: u(36), fontWeight: 500, textShadow: '0 1px 6px rgba(0,0,0,0.5)', mt: u(10) }}>
            Scan any tag. See what you'd earn.
          </Box>
        </Box>
      </FieldBanner>

      <Box sx={{ px: u(36), mt: u(-60), position: 'relative', zIndex: 1 }}>
        <Box sx={{ bgcolor: sc.card, borderRadius: u(36), boxShadow: sc.tileShadow, border: '1px solid #ecede8', p: u(48) }}>
          {mode === 'password' && <PasswordForm run={run} busy={auth.password.isPending} onForgot={() => { setErr(''); setMode('forgot'); }} />}
          {mode === 'forgot' && <ForgotForm run={run} onBack={() => { setErr(''); setMode('password'); }} />}
          {mode === 'card' && <CardForm run={run} onBack={() => { setErr(''); setMode('password'); }} />}

          {err && (
            <Box role="alert" sx={{ color: sc.badText, fontSize: u(30), mt: u(24), lineHeight: 1.35 }}>
              {err}
            </Box>
          )}

          {mode === 'password' && (
            <>
              <Divider />
              <ButtonBase
                onClick={() => {
                  setErr('');
                  setMode('card');
                }}
                sx={{
                  width: '100%',
                  minHeight: u(100),
                  borderRadius: 99,
                  border: `${u(3)} solid ${sc.cardEdge}`,
                  gap: u(16),
                  fontSize: u(33),
                  fontWeight: 700,
                  color: sc.priceGreen,
                }}
              >
                <QrCodeScannerRounded sx={{ fontSize: u(46) }} />
                Scan your Thrift+ card
              </ButtonBase>
            </>
          )}
          <Box sx={{ fontSize: u(24), color: sc.ink3, mt: u(28), lineHeight: 1.35 }}>
            Mock sign-in: any email or username and password work. Nothing is emailed.
          </Box>
        </Box>

        <Box sx={{ textAlign: 'center', mt: u(44), mb: u(60) }}>
          <Box sx={{ fontSize: u(30), color: sc.ink2 }}>No card yet? Get one free at the register.</Box>
          <ButtonBase
            onClick={() => auth.guest.mutate()}
            sx={{ mt: u(14), px: u(36), py: u(18), borderRadius: 99, fontSize: u(33), fontWeight: 700, color: sc.priceGreen }}
          >
            Scan as a guest
          </ButtonBase>
        </Box>
      </Box>
    </Box>
  );
}

function PasswordForm({ run, busy, onForgot }: { run: (fn: () => Promise<unknown>) => void; busy: boolean; onForgot: () => void }) {
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
      <Title>Sign in</Title>
      <Sub>Use the email on your Thrift+ account, or your username.</Sub>
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
      <Box sx={{ textAlign: 'right', mt: u(14) }}>
        <ButtonBase type="button" onClick={onForgot} sx={{ fontSize: u(29), color: sc.ink2, px: u(8), py: u(6), borderRadius: u(10) }}>
          Forgot password?
        </ButtonBase>
      </Box>
      <Primary busy={busy} label="Sign in" />
    </Box>
  );
}

function ForgotForm({ run, onBack }: { run: (fn: () => Promise<unknown>) => void; onBack: () => void }) {
  const auth = useSignIn();
  const [email, setEmail] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);
  if (sentTo) {
    return (
      <Box>
        <Title>Check your email</Title>
        <Sub>We sent a link to reset your password to {sentTo}. It works for a limited time.</Sub>
        <Secondary label="Back to sign in" onClick={onBack} />
      </Box>
    );
  }
  return (
    <Box
      component="form"
      onSubmit={(e) => {
        e.preventDefault();
        run(async () => setSentTo((await auth.reset.mutateAsync(email)).sent_to));
      }}
    >
      <Title>Reset your password</Title>
      <Sub>Enter the email on your account and we'll send you a link.</Sub>
      <Field>
        <InputBase
          autoFocus
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          type="email"
          inputProps={{ 'aria-label': 'Email', autoComplete: 'email' }}
          sx={{ flex: 1, fontSize: 18 }}
        />
      </Field>
      <Primary busy={auth.reset.isPending} label="Email me a link" />
      <Secondary label="Back to sign in" onClick={onBack} />
    </Box>
  );
}

/** Scan the card's QR (or type its number), then the phone's last 4 digits. */
function CardForm({ run, onBack }: { run: (fn: () => Promise<unknown>) => void; onBack: () => void }) {
  const auth = useSignIn();
  const [code, setCode] = useState('');
  const [typed, setTyped] = useState('');
  const [last4, setLast4] = useState('');
  const camera = useQrCamera({
    enabled: !code,
    paused: false,
    onDecode: (raw) => {
      const v = raw.trim();
      if (v.length >= 6) {
        navigator.vibrate?.(15);
        setCode(v);
      }
    },
  });

  const submit = (digits: string) => run(() => auth.card.mutateAsync({ code, last4: digits }));

  if (code) {
    return (
      <Box
        component="form"
        onSubmit={(e) => {
          e.preventDefault();
          submit(last4);
        }}
      >
        <Title>Card read</Title>
        <Sub>For your security, enter the last 4 digits of the phone number on your account.</Sub>
        <Field>
          <InputBase
            autoFocus
            value={last4}
            onChange={(e) => {
              const v = e.target.value.replace(/\D/g, '').slice(0, 4);
              setLast4(v);
              if (v.length === 4) submit(v);
            }}
            placeholder="0000"
            inputProps={{ 'aria-label': 'Last 4 digits of your phone', inputMode: 'numeric', style: { letterSpacing: '0.5em', textAlign: 'center' } }}
            sx={{ flex: 1, fontSize: 26, fontWeight: 700 }}
          />
        </Field>
        <Primary busy={auth.card.isPending} label="Sign in" />
        <Secondary label="Scan a different card" onClick={() => { setCode(''); setLast4(''); }} />
      </Box>
    );
  }

  return (
    <Box>
      <Title>Scan your Thrift+ card</Title>
      <Sub>Point your camera at the QR code on the back of your card.</Sub>
      <Box sx={{ position: 'relative', borderRadius: u(28), overflow: 'hidden', bgcolor: sc.night, aspectRatio: '4 / 3', mt: u(8) }}>
        <Box component="video" ref={camera.videoRef} muted playsInline autoPlay sx={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
        {camera.status !== 'live' && (
          <Box sx={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color: '#fff', textAlign: 'center', p: u(40), fontSize: u(28) }}>
            {camera.status === 'starting' ? <CircularProgress size={28} sx={{ color: '#fff' }} /> : camera.error || 'No camera here. Type the number on your card.'}
          </Box>
        )}
      </Box>
      <Box
        component="form"
        onSubmit={(e) => {
          e.preventDefault();
          if (typed.trim()) setCode(typed.trim());
        }}
        sx={{ display: 'flex', gap: u(14), mt: u(24) }}
      >
        <Field sx={{ flex: 1 }}>
          <InputBase
            value={typed}
            onChange={(e) => setTyped(e.target.value)}
            placeholder="Or type the card number"
            inputProps={{ 'aria-label': 'Card number', autoCapitalize: 'characters', spellCheck: false }}
            sx={{ flex: 1, fontSize: 18 }}
          />
        </Field>
        <ButtonBase type="submit" sx={{ px: u(30), borderRadius: 99, bgcolor: sc.green, color: '#fff', fontWeight: 700, fontSize: u(30) }}>
          Next
        </ButtonBase>
      </Box>
      <Secondary label="Back to sign in" onClick={onBack} />
    </Box>
  );
}

function Title({ children }: { children: React.ReactNode }) {
  return (
    <Box component="h1" sx={{ m: 0, fontFamily: sc.condensed, fontWeight: 700, fontSize: u(58), color: sc.titleGreen, lineHeight: 1.1 }}>
      {children}
    </Box>
  );
}

function Sub({ children }: { children: React.ReactNode }) {
  return <Box sx={{ fontSize: u(31), color: sc.ink2, mt: u(10), mb: u(30), lineHeight: 1.4 }}>{children}</Box>;
}

function Field({ children, sx }: { children: React.ReactNode; sx?: object }) {
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        px: u(30),
        minHeight: u(100),
        borderRadius: u(24),
        border: `${u(3)} solid ${sc.cardEdge}`,
        bgcolor: '#fbfcf9',
        '&:focus-within': { borderColor: sc.green },
        ...sx,
      }}
    >
      {children}
    </Box>
  );
}

function Primary({ busy, label }: { busy: boolean; label: string }) {
  return (
    <ButtonBase
      type="submit"
      disabled={busy}
      sx={{
        mt: u(30),
        width: '100%',
        minHeight: u(104),
        borderRadius: 99,
        background: `linear-gradient(180deg, #62c64a, ${sc.green})`,
        boxShadow: '0 4px 12px rgba(63,159,53,0.35), inset 0 2px 0 rgba(255,255,255,0.35)',
        color: '#fff',
        fontSize: u(36),
        fontWeight: 700,
      }}
    >
      {busy ? <CircularProgress size={22} sx={{ color: '#fff' }} /> : label}
    </ButtonBase>
  );
}

function Secondary({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <ButtonBase type="button" onClick={onClick} sx={{ mt: u(18), width: '100%', py: u(18), borderRadius: u(16), fontSize: u(30), color: sc.ink2 }}>
      {label}
    </ButtonBase>
  );
}

function Divider() {
  return (
    <Box sx={{ display: 'flex', alignItems: 'center', gap: u(20), my: u(36), color: sc.ink3, fontSize: u(26) }}>
      <Box sx={{ flex: 1, height: '1px', bgcolor: sc.line }} />
      or
      <Box sx={{ flex: 1, height: '1px', bgcolor: sc.line }} />
    </Box>
  );
}
