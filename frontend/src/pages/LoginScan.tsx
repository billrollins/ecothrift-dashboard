import { useEffect } from 'react';
import { Box, Button, Typography } from '@mui/material';
import { tk } from '../i18n/kiosk';
import { PunchOverlay } from './kiosk/PunchOverlay';
import { ScanInput } from './kiosk/ScanInput';
import { useKioskLang } from './kiosk/kioskLang';
import { kioskColors, mediumButtonSx } from './kiosk/kioskTheme';
import { useKioskSession } from './kiosk/useKioskSession';

/** No board on this face, so nothing needs refreshing after a punch. */
const noop = () => undefined;

/**
 * The sign-in page's Scan button. Same card and same punch dialog as the door
 * tablet, over the public /api/hr/clock/* API, so scanning never signs anyone
 * in to the dashboard. No board, no fullscreen, no host session.
 */
export default function LoginScan({
  onExit,
  onDone,
}: {
  onExit: () => void;
  onDone: (message: string) => void;
}) {
  const [lang] = useKioskLang();
  // `false` keeps the board query off: this face shows no board.
  const session = useKioskSession('clock', lang, false);

  // The email field autofocuses on the sign-in card, and a focused text field
  // swallows the scan, so drop focus the moment this panel opens.
  useEffect(() => {
    (document.activeElement as HTMLElement | null)?.blur();
  }, []);

  // Esc is Cancel, dialog open or not: straight back to the sign-in form, the
  // same place the dialog's own Cancel goes.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onExit();
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onExit]);

  return (
    <Box
      data-testid="login-scan"
      sx={{
        position: 'fixed',
        inset: 0,
        zIndex: 15,
        bgcolor: kioskColors.bg,
        color: kioskColors.ink,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 2.5,
        px: 3,
        textAlign: 'center',
      }}
    >
      <Typography sx={{ fontSize: 44, fontWeight: 900 }}>{tk('scanYourCard', lang)}</Typography>
      <Typography sx={{ fontSize: 20, fontWeight: 600, color: kioskColors.ink60 }}>{tk('noCard', lang)}</Typography>
      <Box sx={{ minHeight: 30 }}>
        {session.toast ? (
          <Typography role="status" data-testid="login-scan-toast" sx={{ color: '#FFB3A8', fontWeight: 800, fontSize: 18 }}>
            {session.toast}
          </Typography>
        ) : session.identifying ? (
          <Typography sx={{ color: kioskColors.ink60, fontWeight: 700, fontSize: 18 }}>{tk('checkingCard', lang)}</Typography>
        ) : null}
      </Box>
      <Button onClick={onExit} sx={{ ...mediumButtonSx, color: kioskColors.ink60 }}>{tk('cancel', lang)}</Button>

      <ScanInput
        enabled={!session.scan}
        onScan={(token) => void session.onScan(token)}
        onReject={session.rejectScan}
      />

      {session.scan ? (
        <PunchOverlay
          key={session.scan.token + session.scan.preview.now}
          route="clock"
          token={session.scan.token}
          initial={session.scan.preview}
          lang={lang}
          onClose={() => {
            session.closeOverlay();
            onExit();
          }}
          onChanged={noop}
          onSuccess={(successKey) => {
            session.closeOverlay();
            onDone(tk(successKey, lang));
          }}
        />
      ) : null}
    </Box>
  );
}
