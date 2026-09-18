import { Box, Button, Typography } from '@mui/material';
import LockClock from '@mui/icons-material/LockClock';
import { tk, type AppLanguage } from '../../i18n/kiosk';
import { bigButtonSx, kioskColors } from './kioskTheme';

/** Shown over the board when the host's refresh token has died. Never redirects. */
export function HostExpiredOverlay({ lang, onSignIn }: { lang: AppLanguage; onSignIn: () => void }) {
  return (
    <Box
      role="alertdialog"
      data-testid="host-expired"
      sx={{
        position: 'fixed',
        inset: 0,
        zIndex: 40,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 2,
        bgcolor: kioskColors.overlayScrim,
        backdropFilter: 'blur(6px)',
        color: kioskColors.ink,
        textAlign: 'center',
        p: 3,
      }}
    >
      <LockClock sx={{ fontSize: 88, color: kioskColors.amber }} />
      <Typography sx={{ fontSize: 40, fontWeight: 900 }}>{tk('hostExpired', lang)}</Typography>
      <Typography sx={{ fontSize: 22, color: kioskColors.ink60, fontWeight: 600 }}>{tk('hostExpiredHint', lang)}</Typography>
      <Button variant="contained" onClick={onSignIn} sx={{ ...bigButtonSx, mt: 2, bgcolor: kioskColors.brand }}>
        {tk('confirm', lang)}
      </Button>
    </Box>
  );
}
