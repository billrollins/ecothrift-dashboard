/**
 * The sign-in screens' parts (the sign-in, staff, join and check-your-email forms, and the account screens): a title,
 * its line, a field, the green button, the plain one, and the error line.
 */
import { Box, ButtonBase, CircularProgress, InputBase } from '@mui/material';
import { sc, u } from './scannerTheme';

export const TERMS_URL = 'https://ecothrift.us/terms';

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

/** The email field (owner 2026-10-15, APP D9): the phone's email keyboard and autofill, 18 px so iPhone doesn't zoom. */
export function EmailField({ value, onChange, sx }: { value: string; onChange: (v: string) => void; sx?: object }) {
  return (
    <Field sx={sx}>
      <InputBase
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Email"
        type="email"
        inputProps={{ 'aria-label': 'Email', autoComplete: 'email', inputMode: 'email', autoCapitalize: 'none', spellCheck: false }}
        sx={{ flex: 1, fontSize: 18 }}
      />
    </Field>
  );
}

/**
 * The one box (Join v2, owner 2026-10-19): email first, since texts cost money and email is free. "Email or phone",
 * or "Email" while texts are off, and one small line under it. Plain text, so a phone number never trips the browser's
 * email check; 18 px so iPhone doesn't zoom.
 */
export function ContactField({ value, onChange, phone, sx }: { value: string; onChange: (v: string) => void; phone: boolean; sx?: object }) {
  return (
    <Box sx={sx}>
      {phone ? (
        <Field>
          <InputBase
            value={value}
            onChange={(e) => onChange(e.target.value)}
            placeholder="you@email.com or mobile number"
            inputProps={{ 'aria-label': 'Email or phone', autoComplete: 'email', inputMode: 'email', autoCapitalize: 'none', autoCorrect: 'off', spellCheck: false }}
            sx={{ flex: 1, fontSize: 18 }}
          />
        </Field>
      ) : (
        <EmailField value={value} onChange={onChange} />
      )}
      <Box data-testid="contact-hint" sx={{ mt: u(12), fontSize: u(26), color: sc.ink2, lineHeight: 1.4 }}>
        {phone ? "We'll send a 6-digit code. Email is free; a text works too." : "We'll send a 6-digit code to your email."}
      </Box>
    </Box>
  );
}

/** A quiet "or" between Google and the box. */
export function OrLine() {
  const rule = { flex: 1, height: '1px', bgcolor: sc.line } as const;
  return (
    <Box aria-hidden sx={{ display: 'flex', alignItems: 'center', gap: u(20), my: u(28), color: sc.ink3, fontSize: u(28) }}>
      <Box sx={rule} />
      or
      <Box sx={rule} />
    </Box>
  );
}

/** The green button. `disabled` greys it out (the code's "Sign in" until 6 digits). */
export function Primary({ busy, label, disabled = false }: { busy: boolean; label: string; disabled?: boolean }) {
  return (
    <ButtonBase
      type="submit"
      disabled={busy || disabled}
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
        '&.Mui-disabled': { opacity: busy ? 1 : 0.45 },
      }}
    >
      {busy ? <CircularProgress size={22} sx={{ color: '#fff' }} /> : label}
    </ButtonBase>
  );
}

/** The plain button; `outlined` is the white pill with a green edge ("Join Thrift+" under the sign-in card, APP D9). */
export function Secondary({ label, onClick, outlined = false }: { label: string; onClick: () => void; outlined?: boolean }) {
  return (
    <ButtonBase
      type="button"
      onClick={onClick}
      sx={
        outlined
          ? { width: '100%', minHeight: u(100), borderRadius: 99, border: `${u(3)} solid ${sc.cardEdge}`, bgcolor: sc.card, boxShadow: sc.tileShadow,
            fontSize: u(34), fontWeight: 700, color: sc.greenDeep }
          : { mt: u(18), width: '100%', py: u(18), borderRadius: u(16), fontSize: u(30), color: sc.ink2 }
      }
    >
      {label}
    </ButtonBase>
  );
}

export function ErrorLine({ children, sx }: { children: React.ReactNode; sx?: object }) {
  return (
    <Box role="alert" sx={{ color: sc.badText, fontSize: u(30), mt: u(24), lineHeight: 1.35, ...sx }}>
      {children}
    </Box>
  );
}

/** The small underlined link ("Staff sign in", "Change"): u(26), #5d605a. */
export function SmallLink({ label, onClick, sx }: { label: string; onClick: () => void; sx?: object }) {
  return (
    <ButtonBase
      type="button"
      onClick={onClick}
      sx={{ fontFamily: sc.font, fontSize: u(26), color: sc.ink2, textDecoration: 'underline', px: u(10), py: u(6), borderRadius: u(10), ...sx }}
    >
      {label}
    </ButtonBase>
  );
}
