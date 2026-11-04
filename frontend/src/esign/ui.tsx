import { Box, ButtonBase, CircularProgress } from '@mui/material';
import { sc, u, UNIT_CSS } from './theme';

export const heading = { m: 0, fontFamily: sc.display, fontWeight: 500, fontSize: u(54), color: sc.title, lineHeight: 1.12 } as const;
export const line = { mt: u(12), fontSize: u(31), color: sc.ink2, lineHeight: 1.4 } as const;

/** A big round button for the thumb: quiet (cream) or primary (espresso). */
export function BigButton({ children, onClick, primary = false, testId, disabled = false, busy = false }: {
  children: React.ReactNode;
  onClick?: () => void;
  primary?: boolean;
  testId?: string;
  disabled?: boolean;
  busy?: boolean;
}) {
  return (
    <ButtonBase
      onClick={onClick}
      disabled={disabled || busy}
      data-testid={testId}
      sx={{
        flex: '1 0 auto', minHeight: u(116), height: u(116), borderRadius: 99, gap: u(12), fontSize: u(34), fontWeight: 600, fontFamily: sc.font,
        bgcolor: primary ? sc.accent : sc.card, color: primary ? sc.card : sc.ink,
        border: primary ? 'none' : `${u(3)} solid ${sc.line}`,
        boxShadow: primary ? sc.buttonShadow : '0 3px 10px rgba(35,31,27,0.08)',
        opacity: disabled ? 0.45 : 1, transition: 'transform 90ms', '&:active': { transform: 'scale(0.97)' },
      }}
    >
      {busy ? <CircularProgress size={22} sx={{ color: primary ? sc.card : sc.ink }} /> : children}
    </ButtonBase>
  );
}

export function ErrorLine({ children }: { children: React.ReactNode }) {
  return (
    <Box role="alert" sx={{ color: sc.badText, fontSize: u(30), mt: u(24), lineHeight: 1.35 }}>
      {children}
    </Box>
  );
}

/**
 * The phone-width shell the signer sees. `contained` keeps it inside the host's own page (a signed-in signer); without
 * it, it fills the window (the public link).
 */
export function Shell({ children, testId, contained = false }: { children: React.ReactNode; testId?: string; contained?: boolean }) {
  return (
    <Box
      data-testid={testId}
      sx={{
        ...(contained ? { position: 'relative', minHeight: '80dvh', borderRadius: 3 } : { position: 'fixed', inset: 0 }),
        bgcolor: sc.backdrop, display: 'flex', justifyContent: 'center', overflow: 'hidden', '--u': UNIT_CSS,
      }}
    >
      <Box
        sx={{
          position: 'relative', width: '100%', maxWidth: 480, height: contained ? '80dvh' : '100dvh', overflow: 'hidden',
          display: 'flex', flexDirection: 'column', fontFamily: sc.font,
          background: `radial-gradient(ellipse at 50% 30%, ${sc.pageLight} 0%, ${sc.page} 70%)`,
        }}
      >
        {children}
      </Box>
    </Box>
  );
}
