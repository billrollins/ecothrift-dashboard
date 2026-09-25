import { useState } from 'react';
import { Box, ButtonBase, CircularProgress, InputBase, Typography } from '@mui/material';
import { FieldBanner } from './ScannerTop';
import { ThriftPlusLogo, sc } from './scannerTheme';
import { useSignIn } from './useThriftPlus';

function formatPhone(raw: string): string {
  const d = raw.replace(/\D/g, '').slice(0, 10);
  if (d.length <= 3) return d;
  if (d.length <= 6) return `(${d.slice(0, 3)}) ${d.slice(3)}`;
  return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
}

/** Customer sign-in: phone, then a texted code. Mock: no text goes out and any 4 digits work. */
export function SignInScreen() {
  const auth = useSignIn();
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [err, setErr] = useState('');

  const sendCode = async () => {
    setErr('');
    try {
      const r = await auth.requestCode.mutateAsync(phone);
      setSentTo(r.sent_to);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Try again.');
    }
  };

  const verify = async (value: string) => {
    setErr('');
    try {
      await auth.verify.mutateAsync(value);
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Try again.');
    }
  };

  const busy = auth.requestCode.isPending || auth.verify.isPending;

  return (
    <Box sx={{ minHeight: '100%', display: 'flex', flexDirection: 'column', bgcolor: sc.page }}>
      <FieldBanner tall>
        <Box sx={{ px: 3, pb: 3 }}>
          <ThriftPlusLogo size={64} />
          <Typography sx={{ color: '#fff', fontSize: 18, fontWeight: 600, textShadow: '0 1px 4px rgba(0,0,0,0.4)', mt: 0.5 }}>
            Scan any tag. See what you'd earn.
          </Typography>
        </Box>
      </FieldBanner>

      <Box sx={{ px: 2, mt: -2, position: 'relative', zIndex: 1 }}>
        <Box sx={{ bgcolor: sc.card, borderRadius: 4, boxShadow: sc.shadow, p: 2.5 }}>
          <Typography component="h1" sx={{ fontSize: 24, fontWeight: 800, color: sc.ink }}>
            {sentTo ? 'Enter your code' : 'Sign in'}
          </Typography>
          <Typography sx={{ fontSize: 16, color: sc.ink2, mt: 0.5, mb: 2 }}>
            {sentTo ? `We texted a code to ${sentTo}.` : 'Use the phone number on your Thrift+ card.'}
          </Typography>

          {!sentTo ? (
            <Box
              component="form"
              onSubmit={(e) => {
                e.preventDefault();
                void sendCode();
              }}
            >
              <Field>
                <InputBase
                  autoFocus
                  value={phone}
                  onChange={(e) => setPhone(formatPhone(e.target.value))}
                  placeholder="(402) 555-0123"
                  inputProps={{ 'aria-label': 'Phone number', inputMode: 'tel', autoComplete: 'tel-national', type: 'tel' }}
                  sx={{ flex: 1, fontSize: 22, fontWeight: 600 }}
                />
              </Field>
              <PrimaryButton busy={busy} label="Text me a code" />
            </Box>
          ) : (
            <Box
              component="form"
              onSubmit={(e) => {
                e.preventDefault();
                void verify(code);
              }}
            >
              <Field>
                <InputBase
                  autoFocus
                  value={code}
                  onChange={(e) => {
                    const v = e.target.value.replace(/\D/g, '').slice(0, 4);
                    setCode(v);
                    if (v.length === 4) void verify(v);
                  }}
                  placeholder="1234"
                  inputProps={{
                    'aria-label': 'Code',
                    inputMode: 'numeric',
                    autoComplete: 'one-time-code',
                    style: { letterSpacing: '0.5em', textAlign: 'center' },
                  }}
                  sx={{ flex: 1, fontSize: 28, fontWeight: 700 }}
                />
              </Field>
              <PrimaryButton busy={busy} label="Sign in" />
              <ButtonBase
                type="button"
                onClick={() => {
                  setSentTo(null);
                  setCode('');
                }}
                sx={{ mt: 1.5, width: '100%', py: 1, color: sc.ink2, fontSize: 15, borderRadius: 2 }}
              >
                Use a different number
              </ButtonBase>
            </Box>
          )}

          {err && (
            <Typography role="alert" sx={{ color: sc.badText, fontSize: 15, mt: 1.5 }}>
              {err}
            </Typography>
          )}
          <Typography sx={{ fontSize: 12, color: sc.ink3, mt: 2 }}>Mock: no text is sent. Any 4 digits sign you in.</Typography>
        </Box>

        <Box sx={{ textAlign: 'center', mt: 3, mb: 4 }}>
          <Typography sx={{ fontSize: 15, color: sc.ink2 }}>No card yet? Get one free at the register.</Typography>
          <ButtonBase
            onClick={() => auth.guest.mutate()}
            sx={{ mt: 1, px: 2, py: 1, borderRadius: 99, fontSize: 16, fontWeight: 700, color: sc.greenDeep }}
          >
            Scan as a guest
          </ButtonBase>
        </Box>
      </Box>
    </Box>
  );
}

function Field({ children }: { children: React.ReactNode }) {
  return (
    <Box
      sx={{
        display: 'flex',
        alignItems: 'center',
        px: 2,
        py: 1,
        borderRadius: 3,
        border: `2px solid ${sc.cardEdge}`,
        bgcolor: '#fbfcf9',
        '&:focus-within': { borderColor: sc.green },
      }}
    >
      {children}
    </Box>
  );
}

function PrimaryButton({ busy, label }: { busy: boolean; label: string }) {
  return (
    <ButtonBase
      type="submit"
      disabled={busy}
      sx={{
        mt: 2,
        width: '100%',
        py: 1.75,
        borderRadius: 99,
        bgcolor: sc.green,
        color: '#fff',
        fontSize: 18,
        fontWeight: 800,
        boxShadow: '0 4px 12px rgba(63,159,53,0.35)',
      }}
    >
      {busy ? <CircularProgress size={22} sx={{ color: '#fff' }} /> : label}
    </ButtonBase>
  );
}
