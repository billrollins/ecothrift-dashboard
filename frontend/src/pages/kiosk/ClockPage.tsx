import { useCallback, useState } from 'react';
import { Box, Typography } from '@mui/material';
import { tk } from '../../i18n/kiosk';
import { KioskBoard } from './KioskBoard';
import { KioskShell } from './KioskShell';
import { PunchOverlay } from './PunchOverlay';
import { ScanInput } from './ScanInput';
import { TapToStart } from './TapToStart';
import { readFullscreenDone, requestFullscreen, useKioskLang, writeFullscreenDone } from './kioskLang';
import { kioskColors } from './kioskTheme';
import { useKioskSession } from './useKioskSession';

/** The door tablet. No login, no staff data, card is the only identity. */
export default function ClockPage() {
  const [lang, setLang] = useKioskLang();
  const [started, setStarted] = useState(() => readFullscreenDone('clock'));
  const session = useKioskSession('clock', lang, started);

  const start = useCallback(() => {
    void requestFullscreen();
    writeFullscreenDone('clock');
    setStarted(true);
  }, []);

  if (!started) return <TapToStart lang={lang} onTap={start} />;

  if (session.blocked) {
    return (
      <Box
        sx={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          bgcolor: kioskColors.bg,
          px: 4,
          textAlign: 'center',
        }}
      >
        <Typography sx={{ fontSize: 36, fontWeight: 800, color: kioskColors.ink }}>
          {tk('notAvailableHere', lang)}
        </Typography>
      </Box>
    );
  }

  return (
    <>
      <KioskShell
        lang={lang}
        onLang={setLang}
        title="Eco-Thrift"
        footer={
          session.toast ? (
            <Typography role="status" data-testid="kiosk-toast" sx={{ color: session.toastTone === 'ok' ? kioskColors.brand : '#FFB3A8', fontWeight: 800, fontSize: 18 }}>{session.toast}</Typography>
          ) : session.identifying ? (
            <Typography sx={{ color: kioskColors.ink60, fontWeight: 700 }}>{tk('checkingCard', lang)}</Typography>
          ) : null
        }
      >
        <KioskBoard board={session.board.data} lang={lang} dense />
      </KioskShell>

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
          onClose={session.closeOverlay}
          onChanged={session.refreshBoard}
          onSuccess={session.finishOverlay}
        />
      ) : null}
    </>
  );
}
