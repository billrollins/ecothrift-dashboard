import { useState } from 'react';
import { Box, ButtonBase, CircularProgress, InputBase } from '@mui/material';
import VisibilityOffRounded from '@mui/icons-material/VisibilityOffRounded';
import VisibilityRounded from '@mui/icons-material/VisibilityRounded';
import { FieldBanner } from './ScannerTop';
import { ThriftPlusLogo, sc, u } from './scannerTheme';
import { useSignIn } from './useThriftPlus';

type Mode = 'password' | 'forgot';

/**
 * Customer sign-in: email or username and password (email always works), and "Forgot password?" by email. There is no
 * Thrift+ card (owner 2026-10-14, APP D6), so no card sign-in.
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
            Scan any tag. See what you'd collect.
          </Box>
        </Box>
      </FieldBanner>

      <Box sx={{ px: u(36), mt: u(-60), position: 'relative', zIndex: 1 }}>
        <Box sx={{ bgcolor: sc.card, borderRadius: u(36), boxShadow: sc.tileShadow, border: '1px solid #ecede8', p: u(48) }}>
          {mode === 'password' && <PasswordForm run={run} busy={auth.password.isPending} onForgot={() => { setErr(''); setMode('forgot'); }} />}
          {mode === 'forgot' && <ForgotForm run={run} onBack={() => { setErr(''); setMode('password'); }} />}

          {err && (
            <Box role="alert" sx={{ color: sc.badText, fontSize: u(30), mt: u(24), lineHeight: 1.35 }}>
              {err}
            </Box>
          )}

        </Box>

        <Box sx={{ textAlign: 'center', mt: u(44), mb: u(60) }}>
          <Box sx={{ fontSize: u(30), color: sc.ink2 }}>Not a member yet? Join free at the register.</Box>
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
      <Sub>Use the email on your Thrift+ account, or your username. Staff: your Dash email and password.</Sub>
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

export function Title({ children }: { children: React.ReactNode }) {
  return (
    <Box component="h1" sx={{ m: 0, fontFamily: sc.condensed, fontWeight: 700, fontSize: u(58), color: sc.titleGreen, lineHeight: 1.1 }}>
      {children}
    </Box>
  );
}

export function Sub({ children }: { children: React.ReactNode }) {
  return <Box sx={{ fontSize: u(31), color: sc.ink2, mt: u(10), mb: u(30), lineHeight: 1.4 }}>{children}</Box>;
}

export function Field({ children, sx }: { children: React.ReactNode; sx?: object }) {
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

export function Primary({ busy, label }: { busy: boolean; label: string }) {
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

export function Secondary({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <ButtonBase type="button" onClick={onClick} sx={{ mt: u(18), width: '100%', py: u(18), borderRadius: u(16), fontSize: u(30), color: sc.ink2 }}>
      {label}
    </ButtonBase>
  );
}
