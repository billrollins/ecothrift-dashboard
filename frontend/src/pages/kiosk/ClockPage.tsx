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
  const [started, setStarted] = useState(() => readFullscreenDone());
  const session = useKioskSession('clock', lang, started);

  const start = useCallback(() => {
    void requestFullscreen();
    writeFullscreenDone();
    setStarted(true);
  }, []);

  if (!started) return <TapToStart lang={lang} onTap={start} />;

  return (
    <>
      <KioskShell
        lang={lang}
        onLang={setLang}
        title="Eco-Thrift"
        footer={
          session.toast ? (
            <Typography role="status" data-testid="kiosk-toast" sx={{ color: '#FFB3A8', fontWeight: 800, fontSize: 18 }}>{session.toast}</Typography>
          ) : session.identifying ? (
            <Typography sx={{ color: kioskColors.ink60, fontWeight: 700 }}>{tk('checkingCard', lang)}</Typography>
          ) : null
        }
      >
        {session.blocked ? (
          <Box sx={{ p: 6, textAlign: 'center' }}>
            <Typography sx={{ fontSize: 28, fontWeight: 800, color: kioskColors.ink60 }}>{tk('notAvailableHere', lang)}</Typography>
          </Box>
        ) : (
          <KioskBoard board={session.board.data} lang={lang} dense />
        )}
      </KioskShell>

      <ScanInput enabled={!session.scan && !session.blocked} onScan={(token) => void session.onScan(token)} />

      {session.scan ? (
        <PunchOverlay
          key={session.scan.token + session.scan.preview.now}
          route="clock"
          token={session.scan.token}
          initial={session.scan.preview}
          lang={lang}
          onClose={session.closeOverlay}
          onChanged={session.refreshBoard}
        />
      ) : null}
    </>
  );
}
